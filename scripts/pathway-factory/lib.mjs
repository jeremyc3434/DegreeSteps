/** Shared helpers for the Pathway Factory kit format. No network, no clock reads except where a caller passes one. */
import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root=resolve(import.meta.dirname,'../..');
export const kitsRoot=resolve(root,'content/pathway-kits');
export const capturesRoot=resolve(root,'content/source-captures');
export const creditSystems=Object.freeze(['semester','quarter','competency-unit']);
export const levels=Object.freeze(['associate','bachelor','master','doctorate','specialist','certificate']);
/** Provider course identity fields. Everything else on an option belongs to the receiving-school equivalency. */
export const identityFields=Object.freeze(['title','codeAliases','sourceCredits','sourceCreditSystem','url','identitySourceIds','sourceCreditStatus','sourceCreditVerification','sourceCreditBasis','sourceUpper','providerCourseEffectiveDates','aceId','recommendationStart','recommendationEnd','recommendationPeriodSourceIds','providerCourseCode','identityReviewId','identityCheckedOn','courseVersion','providerCoursePassingPercent']);
/** Equivalency (receiving-award) fields copied verbatim onto compiled options. */
export const awardFields=Object.freeze(['credits','creditSystem','receivingCode','receivingTitle','sourceIds','evidence','evidenceType','creditOrigin','sourceType','conditions','conditionSourceIds','mappingChecked','mappingReviewId','universityMapRecord']);
export const publishableReview=Object.freeze(['reviewed','migrated']);

export const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export const list=value=>Array.isArray(value)?value:[];
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const slug=value=>String(value||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const dateOnly=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const today=()=>new Date().toISOString().slice(0,10);
export const sourceDate=source=>source?.checked??source?.checkedOn;

/** Key-sorted copy used for comparisons and content hashes. */
export function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
/** Whitespace-, case- and punctuation-variant-normalized text for quote grounding. */
export function normalizeText(value){
  return String(value||'').normalize('NFKC').replace(/[‘’‚′]/g,"'").replace(/[“”„″]/g,'"').replace(/[‐-―−]/g,'-').replace(/ /g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}
export async function readJSON(path){return JSON.parse(await readFile(path,'utf8'));}
/**
 * Pretty JSON, except that table arrays named in rowKeys (equivalency rows, provider courses) keep one record per line,
 * so a table reads and diffs like a spreadsheet row.
 */
export function stringifyKit(value,rowKeys=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))return JSON.stringify(value,null,2);
  const parts=Object.entries(value).map(([key,child])=>{
    const body=rowKeys.includes(key)&&Array.isArray(child)?(child.length?'[\n'+child.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':'[]'):JSON.stringify(child,null,2).replace(/\n/g,'\n  ');
    return '  '+JSON.stringify(key)+': '+body;
  });
  return '{\n'+parts.join(',\n')+'\n}';
}
export async function writeJSON(path,value,rowKeys){await mkdir(dirname(path),{recursive:true});await writeFile(path,stringifyKit(value,rowKeys)+'\n');}
export async function exists(path){try{await stat(path);return true;}catch{return false;}}
export const providerFile=name=>slug(name)+'.json';

/** Calls visit(array, key, path) for every source-id reference in a value. */
export function sourceRefs(value,path=''){
  const refs=[];
  const walk=(node,at)=>{
    if(Array.isArray(node)){node.forEach((item,index)=>walk(item,at+'['+index+']'));return;}
    if(!node||typeof node!=='object')return;
    for(const[key,child]of Object.entries(node)){
      if((key==='sourceIds'||/SourceIds$/.test(key))&&Array.isArray(child))child.forEach(id=>refs.push({id,path:at+'.'+key}));
      else if((key==='sourceId'||key==='originalSourceId')&&typeof child==='string')refs.push({id:child,path:at+'.'+key});
      else walk(child,at+'.'+key);
    }
  };
  walk(value,path);return refs;
}

/** Loads every provider identity file. Providers are shared by all school kits. */
export async function loadProviders(dir=resolve(kitsRoot,'providers')){
  const providers=new Map();
  if(!await exists(dir))return providers;
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')).sort()){
    const doc=await readJSON(join(dir,name));doc.file='providers/'+name;providers.set(doc.provider,doc);
  }
  return providers;
}
/** Loads a school kit directory: school.json, equivalencies.json, programs/*.json. */
export async function loadKit(dir,{providers}={}){
  const school=await readJSON(join(dir,'school.json'));
  const equivalencies=await exists(join(dir,'equivalencies.json'))?await readJSON(join(dir,'equivalencies.json')):{kind:'pathway-kit-equivalencies',version:1,school:school.id,equivalencies:[]};
  const programs=[];
  if(await exists(join(dir,'programs')))for(const name of (await readdir(join(dir,'programs'))).filter(n=>n.endsWith('.json')).sort()){const program=await readJSON(join(dir,'programs',name));program.file='programs/'+name;programs.push(program);}
  return {dir,school,equivalencies,programs,providers:providers||await loadProviders(resolve(dir,'..','providers'))};
}
export async function kitDirs(base=kitsRoot){
  if(!await exists(base))return [];
  const dirs=[];for(const entry of await readdir(base,{withFileTypes:true}))if(entry.isDirectory()&&entry.name!=='providers'&&await exists(join(base,entry.name,'school.json')))dirs.push(join(base,entry.name));
  return dirs.sort();
}
export function resolveKitDir(value){
  if(!value)throw Error('Pass a school kit directory or id.');
  return /[\\/]/.test(value)?resolve(value):resolve(kitsRoot,value);
}
/** Route IDs known to the directory and reviewed pathways. Missing files yield an empty set. */
export async function knownRouteIds(base=root){
  const ids=new Set();
  try{for(const p of (await readJSON(resolve(base,'dist/data/program-catalog.json'))).programs||[])ids.add(p.id);}catch{}
  try{for(const p of (await readJSON(resolve(base,'dist/data/pathways.json'))).pathways||[])ids.add(p.id);}catch{}
  return ids;
}

/** Program-level helpers shared by verify and compile. */
export const programUnits=(kit,program)=>program.creditSystem||kit.school.creditSystem;
export const programSlug=program=>program.slug;
export const programModalities=(program,kit)=>list(program.modalities||kit?.school?.programDefaults?.modalities);
export function inScope(row,program,kit){
  const scope=row.scope||{},modalities=programModalities(program,kit);
  if(scope.all!==true&&!list(scope.programs).includes(program.slug))return false;
  return (!scope.catalogs||scope.catalogs.includes(program.catalog))&&(!scope.levels||scope.levels.includes(program.level))&&(!scope.modalities||modalities.length>0&&modalities.every(m=>scope.modalities.includes(m)));
}
/** An explicit requirement placement: "rowId", "rowId@mode", {row, mode?, optionId?}, or {inline: option} for an institutional option. */
export function parsePlacement(entry){
  if(typeof entry==='string'){const at=entry.indexOf('@');return at<0?{row:entry}:{row:entry.slice(0,at),mode:entry.slice(at+1)};}
  return entry&&typeof entry==='object'?entry:{};
}
/** Course-code join key: uppercase letters and digits only, so "MGMT 110", "MGMT-110" and "mgmt.110" compare equal. */
export const courseCodeKey=code=>typeof code==='string'?code.toUpperCase().replace(/[^A-Z0-9]/g,''):'';
/** One immutable join context per compilation. No process-wide cache: a later
 * review or edited requirement list always gets a fresh index. */
export function requirementMatcher(program){
  const ids=new Map(),exact=new Map(),normalized=new Map(),titles=new Map();
  for(const requirement of list(program.requirements)){
    if(!ids.has(requirement.id))ids.set(requirement.id,requirement);
    if(requirement.code){
      if(!exact.has(requirement.code))exact.set(requirement.code,requirement);
      const key=courseCodeKey(requirement.code),rows=normalized.get(key)||[];rows.push(requirement);normalized.set(key,rows);
    }else{const key=normalizeText(requirement.title);if(!titles.has(key))titles.set(key,requirement);}
  }
  return row=>{
    const placed=row.placements?.[program.slug]?.requirementId;
    if(placed)return ids.get(placed)||null;
    if(row.receivingCode){if(exact.has(row.receivingCode))return exact.get(row.receivingCode);const key=courseCodeKey(row.receivingCode),rows=key?normalized.get(key):null;return rows?.length===1?rows[0]:null;}
    return row.receivingTitle?titles.get(normalizeText(row.receivingTitle))||null:null;
  };
}
/** The receiving requirement an equivalency row joins to: an explicit placement, else exact code, else a unique
 *  normalized-code match (punctuation and spacing differ between a school's catalog and a provider's table), else exact title. */
export function matchRequirement(row,program){
  const placed=row.placements?.[program.slug]?.requirementId;
  if(placed)return program.requirements.find(r=>r.id===placed)||null;
  if(row.receivingCode){
    const exact=program.requirements.find(r=>r.code===row.receivingCode);if(exact)return exact;
    const key=courseCodeKey(row.receivingCode);if(!key)return null;
    const loose=program.requirements.filter(r=>courseCodeKey(r.code)===key);
    return loose.length===1?loose[0]:null;
  }
  if(row.receivingTitle)return program.requirements.find(r=>!r.code&&normalizeText(r.title)===normalizeText(row.receivingTitle))||null;
  return null;
}
export const rowStatus=row=>row.status||'published';
export const sourceIndex=(kit,program)=>{
  const sources=new Map();
  for(const s of list(kit.school.sources))sources.set(s.id,{source:s,owner:'school.json'});
  if(program)for(const s of list(program.sources))sources.set(s.id,{source:s,owner:program.file||program.slug});
  for(const doc of kit.providers.values())for(const s of list(doc.sources))if(!sources.has(s.id))sources.set(s.id,{source:s,owner:doc.file||doc.provider});
  return sources;
};
export function parseArgs(argv){
  const args={_:[]};
  for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const[key,inline]=a.slice(2).split(/=(.*)/s);if(inline!==undefined)args[key]=inline;else if(argv[i+1]&&!argv[i+1].startsWith('--'))args[key]=argv[++i];else args[key]=true;}else args._.push(a);}
  return args;
}
export const isMain=meta=>Boolean(process.argv[1])&&resolve(process.argv[1])===fileURLToPath(meta.url);

/**
 * Open slots: a sourced requirement block with no single named course ("General Education: Humanities, 6 credits",
 * "Free electives, 12 credits"). A program requirement declares it with slot {kind, label}; the student picks the course.
 * The compiler splits a slot into course-sized choices (3 semester credits, 4.5 quarter credits; a smaller remainder
 * becomes the last choice) so each choice can hold one outside course or one course at the school.
 */
export const slotKinds=Object.freeze(['gen-ed','major-elective','free-elective','concentration']);
export const slotCourseSize=Object.freeze({semester:3,quarter:4.5});
/** A slot whose own quoted label restricts it to upper-level (300/400-level, upper-division) courses. */
export const slotUpperOnly=label=>{const text=String(label||'');return !/lower/i.test(text)&&/\b[34]00\s*\+|\b[34]00[\s-]*level|\b[34]00\s+or\s+(?:above|higher)|upper[\s-]*(?:level|division)/i.test(text);};
export function slotPieces(credits,units){
  const size=slotCourseSize[units];
  if(!size||!(credits>size+1e-9))return [credits];
  const pieces=[];let left=credits;
  while(left>size+1e-9){pieces.push(size);left=Math.round((left-size)*1000)/1000;}
  if(left>1e-9)pieces.push(left);
  return pieces;
}
/**
 * Explicit, sourced category-award placements (equivalencies.json slotPlacements). Each rule names the exact receiving
 * text a provider table prints for a category award ("Elective Only", "General Elective (ELC 000)") and the slot kinds it
 * may fill. A provider row joins a slot only through such a rule: no fuzzy matching. Lower-division awards never fill an
 * upper-level-only slot.
 */
export const slotRules=kit=>list(kit.equivalencies?.slotPlacements);
export function slotRowsFor(kit,program,requirement,{credits=requirement.credits}={}){
  if(!requirement.slot)return [];
  const units=programUnits(kit,program),upperOnly=slotUpperOnly(requirement.slot.label||requirement.title),out=[];
  for(const rule of slotRules(kit)){
    if(!list(rule.slotKinds).includes(requirement.slot.kind))continue;
    if(rule.lowerDivision&&upperOnly)continue;
    if(rule.labelPattern&&!new RegExp(rule.labelPattern,'i').test(requirement.slot.label||requirement.title))continue;
    for(const row of list(kit.equivalencies.equivalencies)){
      if(row.receivingCode||normalizeText(row.receivingTitle||'')!==normalizeText(rule.receivingText))continue;
      if(!inScope(row,program,kit))continue;
      const awarded=row.creditSystem||row.impliedCreditSystem;
      if(awarded&&awarded!==units)continue;
      if(Math.abs(Number(row.credits)-credits)>1e-9)continue;
      if(!out.some(entry=>entry.row.id===row.id))out.push({row,rule});
    }
  }
  return out.sort((a,b)=>a.row.provider.localeCompare(b.row.provider)||a.row.code.localeCompare(b.row.code)||a.row.id.localeCompare(b.row.id));
}

/** Named receiving-school choices are reusable only through an explicitly
 * reviewed school/catalog/program/requirement pool. They are never transfer
 * awards, and a matching label alone grants no eligibility. */
export function institutionChoicesFor(kit,program,requirement,{credits=requirement.credits}={}){
  if(!requirement.slot)return [];
  const ids=list(requirement.slot.institutionChoicePoolIds),units=programUnits(kit,program),out=[];
  const fixed=new Set(list(program.requirements).filter(row=>row!==requirement).flatMap(row=>[row.code,...list(row.allowedCourseCodes)]).map(courseCodeKey).filter(Boolean));
  const upper=requirement.upper||requirement.upperOnly||slotUpperOnly(requirement.slot.label||requirement.title);
  const sources=new Map(list(kit.school.sources).map(source=>[source.id,source]));
  const grounded=claim=>list(claim?.sourceIds).length>0&&list(claim?.quotes).length>0&&claim.sourceIds.every(id=>sources.get(id)?.kind==='university'&&sources.get(id)?.capture)&&claim.quotes.every(quote=>claim.sourceIds.includes(quote?.sourceId)&&normalizeText(quote?.text));
  for(const pool of list(kit.school.institutionChoicePools)){
    if(!ids.includes(pool?.id)||pool.review?.status!=='reviewed'||!dateOnly(pool.review?.checkedOn)||pool.scope?.all===true||!['programs','catalogs','levels','modalities'].every(key=>list(pool.scope?.[key]).length)||!inScope(pool,program,kit)||!list(pool.requirementIds).includes(requirement.id)||!list(pool.slotKinds).includes(requirement.slot.kind)||!grounded(pool))continue;
    for(const course of list(pool.courses)){
      if(!courseCodeKey(course?.code)||!String(course.title||'').trim()||course.provider!==undefined&&course.provider!=='University'||course.creditOrigin!==undefined&&course.creditOrigin!=='institutional'||!Number.isFinite(course.credits)||course.credits<=0||typeof course.upper!=='boolean'||!grounded(course)||course.creditSystem!==units||Math.abs(course.credits-credits)>1e-9||upper&&!course.upper||fixed.has(courseCodeKey(course.code)))continue;
      if(!out.some(row=>courseCodeKey(row.code)===courseCodeKey(course.code)))out.push({...clone(course),choicePoolId:pool.id});
    }
  }
  return out;
}

/** New allocation slots require the factory's reviewed pool opt-in. Existing
 * factory requirements retain an explicitly resolved named institutional choice
 * from their canonical ledger; the registry passes its original selection flag
 * before resetting bucket allocations. Neither path accepts a placeholder. */
export function reviewedInstitutionFallback(requirement,units,{originalSelectionRequired}={}){
  const reviewed=requirement.allocationSlot===true?requirement.namedInstitutionChoicesReviewed===true:originalSelectionRequired===false;
  return reviewed&&!requirement.researchGap&&list(requirement.options).some(option=>option.provider==='University'&&courseCodeKey(option.code)&&String(option.title||'').trim()&&option.creditOrigin==='institutional'&&option.evidence==='published'&&option.selectionRequired!==true&&Number.isFinite(option.credits)&&option.credits===requirement.credits&&option.creditSystem===units&&list(option.sourceIds).length>0&&(!requirement.upper&&!requirement.upperOnly||option.upper===true));
}
