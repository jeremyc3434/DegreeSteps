/**
 * Decomposes Liberty's registry-compiled curriculum models (dist/data/curricula/liberty*.json — what students actually get)
 * into the normalized kit content/pathway-kits/liberty, then proves the kit reproduces every model.
 *
 * The kit holds each model as the registry's generic compiler receives it from a factory document: the generic stages
 * (generated institutional option, its grade notice, generic policy-review prompts) are left to the registry, and every
 * Liberty augmentation stage is already joined in. Each provider award is written once as an equivalency row; a program
 * places rows in each requirement (optionRows) with an optional placement mode for what the placement adds (elective use,
 * degree-placement evidence, requirement-specific option ids). A row is scoped institution-wide only when it is the same
 * award in every program of its level/modality/catalog scope that has the receiving course, and its provenance is
 * school-wide (an official transfer guide, a named or DSST award with its own degreeLevels/modalities, or a same-school
 * award the registry already applied by modality); otherwise it stays scoped to the programs that carry it.
 *
 * Usage: node scripts/pathway-factory/migrate-liberty.mjs [--check]   (--check: compare with the committed kit, write nothing)
 */
import {join,resolve} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {clone,list,slug,same,canonical,identityFields,awardFields,inScope,matchRequirement,loadProviders,loadKit,readJSON,writeJSON,stringifyKit,providerFile,parseArgs,isMain,kitsRoot,root,exists} from './lib.mjs';
import {compileKit} from './compile.mjs';

export const files=['liberty','liberty-history-online','liberty-online-expansion','liberty-residential-expansion'];
const schoolId='liberty',schoolName='Liberty University';
/** Messages the registry's generic compiler pushes itself when a policy is not documented (build-curriculum-registry.mjs). */
const genericPolicyPrompts={institutionMinCredits:'Confirm how many credits must be earned at this university for this exact degree.',upperMinCredits:'Confirm the degree’s upper-level credit minimum.',alternativeMaxCredits:'Confirm the combined limit on alternative credit sources.'};
/** The registry's elective-block condition (build-curriculum-registry.mjs elective placement). */
export const electiveCondition='Proposed use in this published elective block. The receiving course must meet its department and level restrictions and must not also count elsewhere in this degree; confirm your catalog and allocation.';
const sameSchoolScope='Same-school receiving-course award researched in another degree; exact degree and delivery-format application require confirmation.';
/** Reviews whose awards come from Liberty's institution-wide transfer guides (per modality), not from one degree. */
const guideReviews=new Set(['liberty-official-2026-11-10','liberty-online-full-guide-awards-2026-11-18']);
const placementEvidenceKeys='modelId,catalogYear,modality,requirementId,receivingCode,credits,creditSystem,placementType,sourceIds';
const key=value=>JSON.stringify(canonical(value));
const short=value=>createHash('sha256').update(key(value)).digest('hex').slice(0,8);
const registrySlug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'');

/** The registry's generated institutional option (build-curriculum-registry.mjs), with its grade notice. */
function generatedUniversity(model,row,option){
  const generated={id:'university-'+registrySlug(row.id),provider:'University',title:row.title,...(row.code?{code:row.code}:{}),credits:row.credits,upper:Boolean(row.upper),creditSystem:model.creditSystem||'semester',creditOrigin:'institutional',sourceIds:[...list(row.sourceIds)],evidence:'published',...(option.selectionRequired?{selectionRequired:true,conditions:['Choose a specific course allowed by this published requirement.']}:{})};
  if(row.minimumGrade)generated.conditions=[...list(generated.conditions),'This requirement needs a grade of '+row.minimumGrade+' or higher; confirm the school’s treatment of pass grades.'];
  return generated;
}
/** Registry output -> the factory document model the registry's generic compiler turns back into exactly that output. */
export function factoryInput(model,routeIds){
  const input=clone(model);input.routeIds=[...routeIds];
  if(Array.isArray(input.policyReview))input.policyReview=input.policyReview.filter(item=>!(item.status==='unverified'&&genericPolicyPrompts[item.field]===item.message&&Object.keys(item).length===3));
  for(const row of input.requirements){
    assert(row.id!=='requirements-still-to-resolve','A registry research gap cannot be migrated: '+model.id);
    const last=row.options.at(-1);
    if(last?.provider==='University'&&JSON.stringify(last)===JSON.stringify(generatedUniversity(input,row,last)))row.options.pop();
  }
  return input;
}
function assert(ok,message){if(!ok)throw Error(message);}
function mostCommon(values){const counts=new Map();for(const v of values){const k=key(v);const e=counts.get(k)||{n:0,v};e.n++;counts.set(k,e);}let best=null;for(const e of counts.values())if(!best||e.n>best.n)best=e;return best?.v;}

/** Splits one placed option into the award it carries (core) and what this placement adds (mode). */
function splitPlacement(model,requirement,option){
  const core=clone(option),mode={};
  const evidence=core.degreePlacementEvidence,reqSources=list(requirement.sourceIds);
  if(evidence&&Object.keys(evidence).join(',')===placementEvidenceKeys&&evidence.modelId===model.id&&evidence.catalogYear===model.catalogYear&&evidence.modality===list(model.modalities)[0]&&evidence.requirementId===requirement.id&&evidence.receivingCode===option.receivingCode&&evidence.credits===option.credits&&evidence.creditSystem===option.creditSystem&&same(evidence.sourceIds.slice(0,reqSources.length),reqSources)){
    mode.placementEvidence={placementType:evidence.placementType,extraSourceIds:evidence.sourceIds.slice(reqSources.length)};
    delete core.degreePlacementEvidence;
    // The placement's own sources are cited on the option after the award's sources.
    const ids=list(option.sourceIds);
    for(let k=1;k<=ids.length;k++){const prefix=ids.slice(0,k),appended=evidence.sourceIds.filter(id=>!prefix.includes(id));if(same([...prefix,...appended],ids)&&appended.length){core.sourceIds=prefix;mode.placementEvidence.citeInOption=true;break;}}
  }
  const conditions=list(core.conditions);
  if(core.placementType==='elective'&&conditions.at(-1)===electiveCondition){mode.electiveBlock=true;core.conditions=conditions.slice(0,-1);if(!core.conditions.length)delete core.conditions;delete core.placementType;}
  else if(core.placementType!==undefined){mode.placementType=core.placementType;delete core.placementType;}
  if(typeof core.id==='string'&&core.id.endsWith('-'+requirement.id)&&core.id.length>requirement.id.length+1){mode.idSuffix=true;core.id=core.id.slice(0,-requirement.id.length-1);}
  return {core,mode};
}
function modeDefinition(mode,conditionId){
  const out={};const set={};
  if(mode.electiveBlock){set.placementType='elective';set.evidence='conditional';}
  if(mode.placementType!==undefined)set.placementType=mode.placementType;
  if(Object.keys(set).length)out.set=set;
  if(mode.electiveBlock)out.appendConditionIds=[conditionId(electiveCondition)];
  if(mode.placementEvidence)out.placementEvidence={placementType:mode.placementEvidence.placementType,...(mode.placementEvidence.extraSourceIds.length?{extraSourceIds:mode.placementEvidence.extraSourceIds}:{}),...(mode.placementEvidence.citeInOption?{citeInOption:true}:{})};
  if(mode.idSuffix)out.idSuffix='requirement';
  return out;
}
function modeName(mode){
  const parts=[];
  if(mode.electiveBlock)parts.push('elective-block');
  if(mode.placementType!==undefined)parts.push(slug(mode.placementType)+'-placement');
  if(mode.placementEvidence){parts.push(slug(mode.placementEvidence.placementType)+'-evidence');if(mode.placementEvidence.extraSourceIds.length)parts.push(short(mode.placementEvidence.extraSourceIds));if(mode.placementEvidence.citeInOption)parts.push('cited');}
  if(mode.idSuffix)parts.push('requirement-id');
  return parts.join('-');
}

export async function migrate({base=root,existingProviders}={}){
  const registry=await readJSON(resolve(base,'dist/data/curriculum-registry.json'));
  const documents=[],models=[];
  for(const name of files){
    const compiled=await readJSON(resolve(base,'dist/data/curricula/'+name+'.json')),content=await readJSON(resolve(base,'content/curricula/'+name+'.json'));
    const inputs=compiled.models.map(model=>{const entry=registry.models.find(e=>e.id===model.id);assert(entry,'No registry entry for '+model.id);return factoryInput(model,entry.routeIds);});
    documents.push({path:'content/curricula/'+name+'.json',checkedOn:content.checkedOn,routes:content.routes,models:inputs});
    models.push(...inputs);
  }
  const slugOf=id=>id.replace(/^curriculum-liberty-/,'');
  const providers=existingProviders||await loadProviders(resolve(base,'content/pathway-kits/providers'));
  const providerDocs=new Map([...providers].map(([name,doc])=>{const copy=clone(doc);delete copy.file;return [name,copy];}));

  // Conditions are written once.
  const conditionLibrary={},conditionIds=new Map();
  const conditionId=text=>{if(!conditionIds.has(text)){let id=schoolId+'-'+slug(text.split(/\s+/).slice(0,6).join(' '));const b=id;let n=2;while(id in conditionLibrary)id=b+'-'+n++;conditionIds.set(text,id);conditionLibrary[id]=text;}return conditionIds.get(text);};

  // Placements: every outside option becomes (award core, placement mode).
  const placements=[];
  for(const model of models)for(const requirement of model.requirements)for(const option of requirement.options){
    if(option.provider==='University'){placements.push({model,requirement,inline:option});continue;}
    placements.push({model,requirement,...splitPlacement(model,requirement,option)});
  }
  // The registry's elective block forces conditional evidence; such a placement uses the award as written elsewhere when one exists.
  const withoutEvidence=core=>{const c=clone(core);delete c.evidence;return key(c);};
  const plain=new Map();for(const p of placements)if(p.core&&!p.mode.electiveBlock){const k=withoutEvidence(p.core);if(!plain.has(k))plain.set(k,[]);plain.get(k).push(p.core);}
  for(const p of placements)if(p.mode?.electiveBlock&&p.core.evidence==='conditional'){const match=plain.get(withoutEvidence(p.core));if(match)p.core=clone(mostCommon(match));}

  // Provider identities: new courses carry only school-independent identity (title and the original quantity, or an explicit null).
  for(const p of placements){
    if(!p.core)continue;const {provider,code}=p.core;
    if(!providerDocs.has(provider))providerDocs.set(provider,{kind:'pathway-kit-provider',version:1,provider,sources:[],courses:[]});
    const doc=providerDocs.get(provider);
    if(!doc.courses.some(c=>c.code===code)){
      const group=placements.filter(q=>q.core?.provider===provider&&q.core.code===code).map(q=>q.core);
      const quantity=mostCommon(group.filter(o=>o.sourceCredits>0&&o.sourceCreditSystem).map(o=>({sourceCredits:o.sourceCredits,sourceCreditSystem:o.sourceCreditSystem})));
      doc.courses.push({code,title:mostCommon(group.map(o=>o.title)),...(quantity||{sourceCredits:null})});
    }
  }
  for(const doc of providerDocs.values())doc.courses.sort((a,b)=>a.code.localeCompare(b.code));

  // Rows: one per distinct award.
  const rowsByKey=new Map();
  for(const p of placements){
    if(!p.core)continue;
    const k=key(p.core);
    if(!rowsByKey.has(k))rowsByKey.set(k,{core:p.core,placements:[]});
    rowsByKey.get(k).placements.push(p);
  }
  const rowList=[...rowsByKey.values()];
  const ids=new Map();
  for(const r of rowList){
    const o=r.core,baseId=[slug(o.provider),slug(o.code),'to',slug(o.receivingCode||o.receivingTitle||'award')].join('-');
    const n=(ids.get(baseId)||0)+1;ids.set(baseId,n);r.id=n>1?baseId+'-'+n:baseId;
  }
  // Programs (requirements without options).
  const defaults={};const first=models[0];
  const core=['id','routeIds','school','title','level','catalog','totalCredits','creditSystem','modalities','sources','requirements'];
  for(const field of Object.keys(first))if(!core.includes(field)&&models.every(m=>field in m&&same(m[field],first[field])))defaults[field]=clone(first[field]);
  const schoolSources=new Map(),programSources=new Map();
  const providerSourceIds=new Set([...providerDocs.values()].flatMap(d=>list(d.sources).map(s=>s.id)));
  const sourceOverrides=new Set();
  for(const model of models)for(const source of list(model.sources)){
    // Liberty's models cite an earlier revision of some shared provider sources; the kit keeps Liberty's revision for Liberty.
    if(providerSourceIds.has(source.id)){const owned=[...providerDocs.values()].flatMap(d=>list(d.sources)).find(s=>s.id===source.id);if(same(owned,source))continue;sourceOverrides.add(source.id);}
    if(!schoolSources.has(source.id))schoolSources.set(source.id,source);
    else if(!same(schoolSources.get(source.id),source)){if(!programSources.has(model.id))programSources.set(model.id,[]);programSources.get(model.id).push(source);}
  }
  const modes=new Map();
  const programs=models.map(model=>{
    const program={kind:'pathway-kit-program',version:1,slug:slugOf(model.id),modelId:model.id,routeIds:clone(model.routeIds),title:model.title,level:model.level,catalog:model.catalog,totalCredits:model.totalCredits};
    if(model.creditSystem!=='semester')program.creditSystem=model.creditSystem;
    program.modalities=clone(model.modalities);
    program.review={status:'migrated',source:'dist/data/curricula/'+documents.find(d=>d.models.includes(model)).path.split('/').pop()+' (registry-compiled)',reviewedOn:documents.find(d=>d.models.includes(model)).checkedOn};
    const overrides=programSources.get(model.id);
    if(overrides){program.sources=clone(overrides);program.sourceOverrides=overrides.map(s=>s.id);}
    const modelFields={};for(const field of Object.keys(model))if(!core.includes(field)&&!(field in defaults))modelFields[field]=clone(model[field]);
    program.modelFields=modelFields;
    program.modelSourceIds=list(model.sources).map(s=>s.id);
    program.requirements=model.requirements.map(requirement=>{
      const copy=clone(requirement);delete copy.options;
      copy.optionRows=placements.filter(p=>p.model===model&&p.requirement===requirement).map(p=>{
        if(p.inline)return {inline:p.inline};
        const row=rowsByKey.get(key(p.core));
        if(!Object.keys(p.mode).length)return row.id;
        const name=modeName(p.mode),definition=modeDefinition(p.mode,conditionId);
        if(modes.has(name))assert(same(modes.get(name),definition),'Placement mode name collision '+name);else modes.set(name,definition);
        return row.id+'@'+name;
      });
      return copy;
    });
    return program;
  });
  // Equivalency rows, with the narrowest scope the data shows.
  const kitPrograms=new Map(programs.map(p=>[p.modelId,p]));
  const school={kind:'pathway-kit-school',version:1,id:schoolId,name:schoolName,creditSystem:'semester',checkedOn:[...documents.map(d=>d.checkedOn),...models.flatMap(m=>list(m.sources).map(s=>s.checked??s.checkedOn))].filter(Boolean).sort().at(-1),programOrder:programs.map(p=>p.slug),programDefaults:defaults,
    publish:{compiledBy:'pathway-factory',compact:true,documents:documents.map(d=>({path:d.path,programs:d.models.map(m=>slugOf(m.id)),checkedOn:d.checkedOn,sources:false,...(d.routes?{routes:clone(d.routes)}:{})}))},
    ...(sourceOverrides.size?{sourceOverrides:[...sourceOverrides].sort()}:{}),sources:[...schoolSources.values()].map(clone)};
  const equivalencies=rowList.map(r=>{
    const o=r.core,course=providerDocs.get(o.provider).courses.find(c=>c.code===o.code);
    const row={id:r.id,provider:o.provider,code:o.code,status:'published',optionId:o.id};
    for(const field of awardFields)if(o[field]!==undefined&&field!=='conditions')row[field]=clone(o[field]);
    if(o.conditions)row.conditionIds=o.conditions.map(conditionId);
    const identity={},omit=[];
    for(const field of identityFields){if(o[field]===undefined){if(course[field]!==undefined&&course[field]!==null)omit.push(field);}else if(!same(o[field],course[field]))identity[field]=clone(o[field]);}
    if(o.sourceCredits===undefined&&course.sourceCredits===null){/* unknown quantity: nothing is emitted */}
    if(Object.keys(identity).length)row.identity=identity;
    if(omit.length)row.identityOmit=omit;
    const extra={};for(const field of Object.keys(o))if(!identityFields.includes(field)&&!awardFields.includes(field)&&!['id','provider','code'].includes(field))extra[field]=clone(o[field]);
    if(Object.keys(extra).length)row.extra=extra;
    const placedIn=[...new Set(r.placements.map(p=>kitPrograms.get(p.model.id)))];
    // Same-school awards copied from another Liberty model carry no unit on the option; the registry placed them only where
    // that source model's credit system equals the receiving model's, so the unit is stated by the source document.
    if(!row.creditSystem&&o.mappingScope===sameSchoolScope){const units=[...new Set(r.placements.map(p=>p.model.creditSystem))];if(units.length===1)row.impliedCreditSystem=units[0];}
    row.scope={programs:placedIn.map(p=>p.slug)};
    const wide=Array.isArray(o.degreeLevels)&&Array.isArray(o.modalities)||o.mappingScope===sameSchoolScope||guideReviews.has(o.mappingReviewId);
    if(wide){
      const observed=field=>[...new Set(placedIn.flatMap(p=>field==='modalities'?p.modalities:[p[field]]))].sort();
      for(const scope of [{all:true,levels:Array.isArray(o.degreeLevels)?[...o.degreeLevels]:observed('level'),modalities:Array.isArray(o.modalities)?[...o.modalities]:observed('modalities'),catalogs:observed('catalog')},{all:true,levels:observed('level'),modalities:observed('modalities'),catalogs:observed('catalog')}]){
        // Never wider than the data: every kit program in scope that has the receiving course must carry this award there.
        const candidate={...row,scope};
        const contradicted=programs.some(p=>inScope(candidate,p)&&p.requirements.some(req=>matchRequirement(candidate,p)?.id===req.id&&!req.institutionalOnly&&req.credits===row.credits&&!list(req.optionRows).some(e=>typeof e==='string'&&e.split('@')[0]===row.id)));
        if(!contradicted){row.scope=scope;break;}
      }
    }
    return row;
  });
  const equivalencyDoc={kind:'pathway-kit-equivalencies',version:1,school:schoolId,conditionLibrary,placementModes:Object.fromEntries([...modes].sort((a,b)=>a[0].localeCompare(b[0]))),equivalencies};
  return {school,equivalencies:equivalencyDoc,programs,providers:providerDocs,documents};
}

export async function writeLibertyKit(kit,out=kitsRoot){
  const dir=join(out,schoolId);
  await writeJSON(join(dir,'school.json'),kit.school,['sources']);
  await writeJSON(join(dir,'equivalencies.json'),kit.equivalencies,['equivalencies']);
  for(const program of kit.programs)await writeProgram(join(dir,'programs',program.slug+'.json'),program);
  for(const provider of kit.providers.values())await writeJSON(join(out,'providers',providerFile(provider.provider)),provider,['courses','sources']);
  return dir;
}
/** Program files keep one requirement per block and one placement per line. */
export function stringifyProgram(program){
  const {requirements,...rest}=program;
  const body=stringifyKit(rest).replace(/\n}$/,'');
  const reqs=requirements.map(r=>{const {optionRows,...fields}=r;const head=JSON.stringify(fields);return '    '+head.slice(0,-1)+(optionRows?',"optionRows":[\n'+optionRows.map(e=>'      '+JSON.stringify(e)).join(',\n')+'\n    ]':'')+'}';});
  return body+',\n  "requirements": [\n'+reqs.join(',\n')+'\n  ]\n}';
}
async function writeProgram(path,program){const {writeFile,mkdir}=await import('node:fs/promises');const {dirname}=await import('node:path');await mkdir(dirname(path),{recursive:true});await writeFile(path,stringifyProgram(program)+'\n');}

/** Per-model parity: every compiled kit model deep-equals the factory input derived from the registry output. */
export function parity(expected,compiled){
  const byId=new Map(compiled.map(m=>[m.id,m])),diffs=[];
  for(const model of expected){
    const other=byId.get(model.id);if(!other){diffs.push(model.id+': missing');continue;}
    const {requirements:a,...ra}=model,{requirements:b,...rb}=other;
    if(!same(ra,rb))diffs.push(model.id+': model fields differ: '+Object.keys({...ra,...rb}).filter(k=>!same(ra[k],rb[k])).join(', '));
    if(a.length!==b.length){diffs.push(model.id+': requirement count');continue;}
    a.forEach((r,i)=>{if(!same(r,b[i]))diffs.push(model.id+'/'+r.id+': requirement differs');});
  }
  return diffs;
}
export async function kitSize(dir=join(kitsRoot,schoolId)){
  let bytes=0,lines=0,count=0;
  const walk=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.json')||e.name.endsWith('.mjs')){const t=await readFile(p,'utf8');bytes+=Buffer.byteLength(t);lines+=t.split('\n').length-1;count++;}}};
  await walk(dir);return {bytes,lines,files:count};
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const kit=await migrate();
  if(!args.check)await writeLibertyKit(kit);
  const loaded=await loadKit(join(kitsRoot,schoolId)),{doc}=compileKit(loaded);
  const expected=kit.documents.flatMap(d=>d.models),diffs=parity(expected,doc.models);
  const options=expected.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+list(r.optionRows||r.options).length,0),0);
  const outside=expected.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+r.options.filter(o=>o.provider!=='University').length,0),0);
  const rows=kit.equivalencies.equivalencies,wide=rows.filter(r=>r.scope.all);
  let baselineBytes=0;for(const name of files)baselineBytes+=Buffer.byteLength(await readFile(resolve(root,'dist/data/curricula/'+name+'.json'),'utf8'));
  console.log(JSON.stringify({school:schoolId,programs:kit.programs.length,outsideOptions:outside,equivalencyRows:rows.length,reuseRatio:Math.round(outside/rows.length*10)/10,institutionWideRows:wide.length,institutionWidePlacements:kit.programs.reduce((n,p)=>n+p.requirements.reduce((k,r)=>k+list(r.optionRows).filter(e=>typeof e==='string'&&wide.some(w=>w.id===e.split('@')[0])).length,0),0),placementModes:Object.keys(kit.equivalencies.placementModes).length,conditions:Object.keys(kit.equivalencies.conditionLibrary).length,parity:diffs.length?diffs.slice(0,20):'exact',check:Boolean(args.check),baselineBytes,kit:await kitSize()},null,2));
  if(args.check){const committed=await loadKit(join(kitsRoot,schoolId));if(!same(committed.equivalencies.equivalencies,kit.equivalencies.equivalencies)){console.error('content/pathway-kits/liberty differs from a fresh migration');process.exitCode=1;}}
  if(diffs.length)process.exitCode=1;
}
if(isMain(import.meta))await main();
