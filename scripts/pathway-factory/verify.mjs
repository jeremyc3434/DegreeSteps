/**
 * Hard verification gate for a school kit. Errors block compilation; candidates are reported, never applied.
 * Usage: node scripts/pathway-factory/verify.mjs [kit-dir-or-id ...] [--as-of YYYY-MM-DD] [--json]
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {list,dateOnly,today,sourceDate,sourceRefs,normalizeText,sha256,creditSystems,inScope,matchRequirement,rowStatus,programUnits,parsePlacement,sourceIndex,loadKit,kitDirs,resolveKitDir,knownRouteIds,parseArgs,isMain,root,exists} from './lib.mjs';

const EPS=1e-6;
const near=(a,b)=>Math.abs(a-b)<EPS;
async function captureText(captureCache,path,base){
  const full=resolve(base,path);
  if(!captureCache.has(full))captureCache.set(full,(async()=>{
    if(!await exists(full))return {error:'missing'};
    const text=await readFile(full,'utf8'),sidecar=full.replace(/\.txt$/,'.json');
    if(await exists(sidecar)){const meta=JSON.parse(await readFile(sidecar,'utf8'));if(meta.sha256&&meta.sha256!==sha256(text))return {error:'modified'};}
    return {text:normalizeText(text)};
  })());
  return captureCache.get(full);
}

/** Collects every object carrying quotes, with the claim's own source ids for cross-checking. */
/** Sources a program-scoped row may cite besides school and provider sources: those every program in its scope defines. */
function scopedProgramSources(kit,row){
  const slugs=list(row?.scope?.programs);if(row?.scope?.all||!slugs.length)return [];
  const per=slugs.map(slug=>list(kit.programs.find(p=>p.slug===slug)?.sources));
  return per[0].filter(source=>per.every(sources=>sources.some(s=>s.id===source.id)));
}
export function quotedClaims(kit){
  const claims=[];
  const take=(claim,file,label,sources)=>{if(Array.isArray(claim?.quotes))claims.push({claim,file,label,sources});};
  for(const[name,policy]of Object.entries(kit.school.policies||{}))take(policy,'school.json','policy '+name);
  for(const row of list(kit.equivalencies.equivalencies))take(row,'equivalencies.json','equivalency '+row.id,scopedProgramSources(kit,row));
  for(const program of kit.programs){
    take(program,program.file,'program '+program.slug);
    for(const[name,policy]of Object.entries(program.policies||{}))take(policy,program.file,'policy '+name);
    for(const requirement of list(program.requirements))take(requirement,program.file,'requirement '+requirement.id);
  }
  return claims;
}

export async function verifyKit(kit,{asOf=today(),routeIds,base=root}={}){
  const errors=[],warnings=[],candidates=[],captures=new Map();
  const error=(file,code,message)=>errors.push({file,code,message}),warn=(file,code,message)=>warnings.push({file,code,message});
  const school=kit.school,rows=list(kit.equivalencies.equivalencies),slugs=new Set(kit.programs.map(p=>p.slug));
  if(!dateOnly(asOf))throw Error('as-of must be YYYY-MM-DD');
  if(!school.id||!school.name)error('school.json','school-identity','school.json needs id and name.');
  if(!creditSystems.includes(school.creditSystem))error('school.json','credit-system',`school creditSystem must be one of ${creditSystems.join(', ')}.`);
  if(!dateOnly(school.checkedOn)||school.checkedOn>asOf)error('school.json','school-date','school.json checkedOn must be a real date that is not in the future.');
  const routes=routeIds||await knownRouteIds(base);for(const r of [...list(school.routes),...list(school.publish?.documents).flatMap(d=>list(d.routes))])routes.add(r.id);

  // Sources: every source needs a real, non-future checked date and a URL.
  const allSources=[...list(school.sources).map(s=>['school.json',s]),...kit.programs.flatMap(p=>list(p.sources).map(s=>[p.file,s])),...[...kit.providers.values()].flatMap(p=>list(p.sources).map(s=>[p.file,s]))];
  // A school or program that knowingly carries another revision of a shared source id lists it in sourceOverrides.
  const seen=new Map(),overrides=new Map([['school.json',new Set(list(school.sourceOverrides))],...kit.programs.map(p=>[p.file,new Set(list(p.sourceOverrides))])]);
  for(const[file,s]of allSources){
    if(!s.id)error(file,'source-id','A source has no id.');
    else if(seen.has(s.id)&&seen.get(s.id)!==file&&!overrides.get(file)?.has(s.id)&&!overrides.get(seen.get(s.id))?.has(s.id))error(file,'source-duplicate',`Source ${s.id} is also defined in ${seen.get(s.id)}.`);
    seen.set(s.id,file);
    const date=sourceDate(s);
    if(!date)error(file,'source-date-missing',`Source ${s.id} has no checked date.`);
    else if(!dateOnly(date))error(file,'source-date-invalid',`Source ${s.id} has an invalid checked date ${date}.`);
    else if(date>asOf)error(file,'source-date-future',`Source ${s.id} is checked in the future (${date} > ${asOf}).`);
    if(!s.url)error(file,'source-url',`Source ${s.id} has no url.`);
    if(s.capture&&!(await captureText(captures,s.capture,base)).text)error(file,'capture-missing',`Source ${s.id} capture ${s.capture} is ${(await captureText(captures,s.capture,base)).error}.`);
  }
  // Provider identities: original quantities and units must be explicit.
  for(const provider of kit.providers.values())for(const course of list(provider.courses)){
    if(course.sourceCredits===null){if(course.sourceCreditSystem!=null)error(provider.file,'source-units',`${provider.provider} ${course.code} records unknown sourceCredits (null) but a sourceCreditSystem.`);continue;}
    if(!(course.sourceCredits>0))error(provider.file,'source-credits',`${provider.provider} ${course.code} has no positive original sourceCredits (use null only when the evidence establishes none).`);
    if(!creditSystems.includes(course.sourceCreditSystem))error(provider.file,'source-units',`${provider.provider} ${course.code} needs sourceCreditSystem (${creditSystems.join('/')}); units are never assumed.`);
  }
  const library=kit.equivalencies.conditionLibrary||{},modes=kit.equivalencies.placementModes||{};
  for(const[id,mode]of Object.entries(modes))for(const c of list(mode.appendConditionIds))if(typeof library[c]!=='string')error('equivalencies.json','unknown-condition',`placement mode ${id}: unknown condition ${c}.`);
  for(const row of rows){
    const file='equivalencies.json',course=list(kit.providers.get(row.provider)?.courses).find(c=>c.code===row.code);
    if(!row.id)error(file,'row-id','An equivalency row has no id.');
    if(!course)error(file,'unknown-provider-course',`${row.id}: ${row.provider} ${row.code} has no provider identity in content/pathway-kits/providers.`);
    if(!['published','candidate'].includes(rowStatus(row)))error(file,'row-status',`${row.id}: status must be published or candidate.`);
    if(!(row.credits>0))error(file,'row-credits',`${row.id}: awarded credits must be positive.`);
    // impliedCreditSystem (kit-only, never emitted): the award's units are stated by the document it was researched in, not on the option.
    if(!row.creditSystem&&!creditSystems.includes(row.impliedCreditSystem))error(file,'row-units',`${row.id}: awarded creditSystem is required (source and receiving quantities are kept separately).`);
    if(!row.receivingCode&&!row.receivingTitle)error(file,'row-receiving',`${row.id}: receivingCode or receivingTitle is required.`);
    if(!list(row.sourceIds).length)error(file,'row-sources',`${row.id}: an equivalency needs sourceIds.`);
    for(const id of list(row.conditionIds))if(typeof library[id]!=='string')error(file,'unknown-condition',`${row.id}: unknown condition ${id}.`);
    const scope=row.scope||{};
    if(scope.all!==true&&!list(scope.programs).length)error(file,'row-scope',`${row.id}: scope must be {all:true} or list programs.`);
    for(const p of list(scope.programs))if(!slugs.has(p))warn(file,'scope-unknown-program',`${row.id}: scope names ${p}, which has no program kit yet.`);
    for(const p of Object.keys(row.placements||{})){
      const program=kit.programs.find(x=>x.slug===p);
      if(!program)error(file,'placement-unknown-program',`${row.id}: placement for unknown program ${p}.`);
      else if(!inScope(row,program,kit))error(file,'placement-out-of-scope',`${row.id}: placed in ${p}, which is outside its documented scope.`);
    }
  }
  // Programs.
  const ids=sourceIndexIds(kit);
  for(const program of kit.programs){
    const file=program.file||program.slug,units=programUnits(kit,program),draft=program.review?.status==='draft'||program.status==='draft';
    const known=new Set([...ids,...list(program.sources).map(s=>s.id)]);
    if(!program.slug)error(file,'program-slug','Program needs a slug.');
    if(!creditSystems.includes(units))error(file,'credit-system',`Program credit system ${units} is not one of ${creditSystems.join(', ')}.`);
    if(!list(program.routeIds).length)(draft?warn:error)(file,'route-missing','Program lists no directory route IDs.');
    for(const id of list(program.routeIds))if(!routes.has(id))(draft?warn:error)(file,'route-unknown',`Route ${id} is not in dist/data/program-catalog.json, pathways.json or school routes.`);
    if(!['reviewed','migrated','draft'].includes(program.review?.status))error(file,'review-status','review.status must be draft, reviewed or migrated.');
    if(program.review?.status==='reviewed'&&(!program.review.reviewer||!dateOnly(program.review.reviewedOn)||program.review.reviewedOn>asOf))error(file,'review-incomplete','A reviewed program needs reviewer and a non-future reviewedOn date.');
    const reqs=list(program.requirements);
    if(!reqs.length)error(file,'requirements','Program has no requirements.');
    const total=reqs.reduce((n,r)=>n+(Number(r.credits)||0),0);
    if(!(program.totalCredits>0)||!near(total,program.totalCredits))error(file,'credit-sum',`Requirement credits sum to ${total} ${units}, not totalCredits ${program.totalCredits}.`);
    const reqIds=new Set(),codes=new Set();
    for(const r of reqs){
      if(!r.id||reqIds.has(r.id))error(file,'requirement-id',`Requirement id ${r.id} is missing or duplicated.`);reqIds.add(r.id);
      if(r.code){if(codes.has(r.code))error(file,'requirement-code',`Receiving code ${r.code} appears twice.`);codes.add(r.code);}
      if(!(r.credits>0))error(file,'requirement-credits',`${r.id}: credits must be positive.`);
      if(r.creditSystem&&r.creditSystem!==units)error(file,'mixed-units',`${r.id}: requirement is in ${r.creditSystem} but the program is in ${units}; convert only with a documented school rule.`);
      if(typeof r.institutionalOnly!=='boolean')(program.review?.status==='migrated'&&r.institutionalOnly===undefined?warn:error)(file,'institutional-only',`${r.id}: institutionalOnly must be true or false.`);
      if(draft&&!list(r.quotes).length)error(file,'draft-quote-missing',`${r.id}: drafted requirements must cite a verbatim quote from the captured catalog.`);
      for(const choice of list(r.institutionOptions)){
        if(!choice?.code||!choice.title||!list(choice.sourceIds).length)error(file,'institution-option',`${r.id}: a named institution course needs code, title and sourceIds.`);
        if(!(choice?.credits>0)||choice.credits>r.credits+EPS)error(file,'institution-option',`${r.id}: institution course ${choice?.code} must award between 0 and ${r.credits} credits.`);
        if(r.upper&&!choice?.upper)error(file,'institution-option',`${r.id}: ${choice?.code} must be upper level for an upper-level requirement.`);
      }
      if(new Set(list(r.institutionOptions).map(c=>c?.code)).size!==list(r.institutionOptions).length)error(file,'institution-option',`${r.id}: an institution course is listed twice.`);
    }
    for(const ref of sourceRefs(program))if(!known.has(ref.id))error(file,'unknown-source',`Unknown source id ${ref.id} at ${ref.path}.`);
    if(draft)warn(file,'draft','Draft program: verified but never compiled until review.status is reviewed.');

    // Join equivalencies, enforce scope, units and duplicate awards.
    const placedBy=new Map(),policies={...school.policies,...program.policies},exclusive=policies.oneAwardPerSourceCourse?.value===true;
    // Migrated ledgers keep the legacy pipeline's alternative evidence records for one source course; new ledgers may not.
    const duplicate=program.review?.status==='migrated'?warn:error,byId=new Map(rows.map(row=>[row.id,row]));
    for(const r of reqs){
      const applied=[],held=[],explicit=Array.isArray(r.optionRows);
      if(r.optionRows!==undefined&&!explicit)error(file,'option-rows',`${r.id}: optionRows must be a list.`);
      for(const entry of list(r.optionRows)){
        const placement=parsePlacement(entry);
        if(placement.inline){if(placement.inline.provider!=='University'||placement.inline.creditOrigin!=='institutional')error(file,'inline-option',`${r.id}: inline options are only for institutional (University) options; outside awards must be equivalency rows.`);continue;}
        const row=byId.get(placement.row);
        if(!row){error(file,'unknown-row',`${r.id}: placement names unknown equivalency row ${placement.row}.`);continue;}
        if(placement.mode&&!modes[placement.mode])error(file,'unknown-mode',`${r.id}: unknown placement mode ${placement.mode}.`);
        if(rowStatus(row)!=='published')error(file,'placement-candidate',`${r.id}: ${row.id} is a candidate and cannot be placed.`);
        else if(!inScope(row,program,kit))error(file,'placement-out-of-scope',`${r.id}: ${row.id} is placed outside its documented scope.`);
        else applied.push(row);
      }
      for(const row of rows){
        if(matchRequirement(row,program)?.id!==r.id)continue;
        if(rowStatus(row)!=='published'||!inScope(row,program,kit)){held.push(row);continue;}
        if(explicit){if(!applied.includes(row))held.push(row);continue;}
        applied.push(row);
      }
      for(const row of applied){
        if(r.institutionalOnly)error(file,'institutional-only-option',`${r.id}: ${row.id} applies to a requirement marked institutionalOnly.`);
        const awarded=row.creditSystem||row.impliedCreditSystem;
        if(awarded&&awarded!==units)error('equivalencies.json','mixed-units',`${row.id}: awards ${awarded} but ${program.slug} is in ${units}.`);
        if(row.credits>r.credits+EPS)error('equivalencies.json','over-award',`${row.id}: awards ${row.credits} for ${r.id}, which is only ${r.credits} ${units}.`);
        const k=row.provider+'|'+row.code;if(!placedBy.has(k))placedBy.set(k,new Set());placedBy.get(k).add(r.id);
      }
      const placementOf=row=>explicit?list(r.optionRows).map(parsePlacement).find(p=>p.row===row.id):row.placements?.[program.slug];
      // Out-of-scope or candidate rows for the same receiving course are reported once per provider course, never applied.
      const appliedKeys=new Set(applied.map(row=>row.provider+'|'+row.code)),grouped=new Map();
      for(const row of held){const k=row.provider+'|'+row.code;if(appliedKeys.has(k))continue;if(!grouped.has(k))grouped.set(k,{program:program.slug,requirement:r.id,requirementCredits:r.credits,provider:row.provider,code:row.code,credits:row.credits,creditSystem:row.creditSystem,reason:rowStatus(row)!=='published'?'candidate-status':inScope(row,program,kit)?'not-placed':'out-of-scope',rows:[],documentedFor:[]});const c=grouped.get(k);c.rows.push(row.id);for(const p of list(row.scope?.programs))if(!c.documentedFor.includes(p))c.documentedFor.push(p);}
      candidates.push(...grouped.values());
      const keys=applied.map(row=>row.provider+'|'+row.code);
      for(const k of new Set(keys))if(keys.filter(x=>x===k).length>1)duplicate('equivalencies.json','duplicate-award',`${program.slug}/${r.id}: ${k} is applied more than once.`);
      const optionIds=new Set();
      for(const row of applied){const placement=placementOf(row)||{},id=placement.optionId||(explicit?row.id+'@'+(placement.mode||''):row.placements?.[program.slug]?.optionId||[row.provider,row.code,r.id].join('|'));if(optionIds.has(id))error('equivalencies.json','duplicate-option-id',`${program.slug}/${r.id}: option id ${id} repeats.`);optionIds.add(id);}
    }
    for(const[k,reqSet]of placedBy)if(reqSet.size>1&&!exclusive)duplicate('equivalencies.json','duplicate-award',`${program.slug}: ${k} would award ${reqSet.size} requirements (${[...reqSet].join(', ')}) without a documented one-award-per-source-course policy.`);
  }
  for(const row of rows){const scoped=new Set(scopedProgramSources(kit,row).map(s=>s.id));for(const ref of sourceRefs(row))if(!ids.has(ref.id)&&!scoped.has(ref.id))error('equivalencies.json','unknown-source',`${row.id}: unknown source id ${ref.id}.`);}
  // Provider identities are shared by every kit; check the identity each published row compiles into (shared course + row overrides).
  for(const row of rows.filter(row=>rowStatus(row)==='published')){
    const provider=kit.providers.get(row.provider),course=list(provider?.courses).find(c=>c.code===row.code);if(!course)continue;
    const identity={...course,...(row.identity||{})};for(const field of list(row.identityOmit))delete identity[field];
    for(const ref of sourceRefs(identity))if(!ids.has(ref.id))error(provider.file,'unknown-source',`${row.id}: ${row.provider} ${row.code} identity cites unknown source ${ref.id} at ${ref.path.replace(/^\./,'')}.`);
  }
  for(const ref of sourceRefs({policies:school.policies,programDefaults:school.programDefaults}))if(!ids.has(ref.id))error('school.json','unknown-source',`Unknown source id ${ref.id} at ${ref.path}.`);

  // Grounding: every quote must appear in its source's capture.
  for(const{claim,file,label,sources}of quotedClaims(kit)){
    const programSources=sources||kit.programs.find(p=>p.file===file)?.sources;
    for(const q of claim.quotes){
      const entry=sourceIndex(kit,{sources:programSources}).get(q.sourceId);
      if(!q.sourceId||!entry){error(file,'quote-source',`${label}: quote cites unknown source ${q.sourceId}.`);continue;}
      if(Array.isArray(claim.sourceIds)&&!claim.sourceIds.includes(q.sourceId))error(file,'quote-source',`${label}: quote source ${q.sourceId} is not among the claim's sourceIds.`);
      if(!entry.source.capture){error(file,'quote-uncaptured',`${label}: source ${q.sourceId} has no capture to check the quote against.`);continue;}
      const capture=await captureText(captures,entry.source.capture,base);
      if(!capture.text)continue;// already reported as capture-missing
      if(!normalizeText(q.text)||!capture.text.includes(normalizeText(q.text)))error(file,'quote-not-found',`${label}: quote not found in ${entry.source.capture}: "${String(q.text).slice(0,90)}"`);
    }
  }
  return {errors,warnings,candidates};
}
function sourceIndexIds(kit){return new Set(sourceIndex(kit).keys());}

export function formatFindings(kit,{errors,warnings,candidates}){
  const lines=[`${kit.school.id}: ${errors.length} error(s), ${warnings.length} warning(s), ${candidates.length} out-of-scope candidate(s)`];
  for(const e of errors)lines.push(`  ERROR ${e.file} [${e.code}] ${e.message}`);
  for(const w of warnings.slice(0,25))lines.push(`  warn  ${w.file} [${w.code}] ${w.message}`);
  if(warnings.length>25)lines.push(`  ... ${warnings.length-25} more warning(s)`);
  for(const c of candidates.slice(0,25))lines.push(`  candidate ${c.program}/${c.requirement} <- ${c.provider} ${c.code} (${c.reason}; documented for ${c.documentedFor.join(', ')||'no program'})`);
  if(candidates.length>25)lines.push(`  ... ${candidates.length-25} more candidate(s)`);
  return lines.join('\n');
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const dirs=args._.length?args._.map(resolveKitDir):await kitDirs();
  if(!dirs.length){console.log('No school kits found under content/pathway-kits.');return;}
  const results=[];
  for(const dir of dirs){const kit=await loadKit(dir),result=await verifyKit(kit,{asOf:args['as-of']||today()});results.push({school:kit.school.id,...result});if(!args.json)console.log(formatFindings(kit,result));if(result.errors.length)process.exitCode=1;}
  if(args.json)console.log(JSON.stringify(results,null,2));
}
if(isMain(import.meta))await main();
