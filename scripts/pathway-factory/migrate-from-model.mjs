/**
 * Decomposes an existing denormalized curriculum document (content/curricula/<school>.json)
 * into a normalized Pathway Factory kit, then proves compile(kit) reproduces it.
 * Usage: node scripts/pathway-factory/migrate-from-model.mjs content/curricula/wgu.json --school wgu [--out content/pathway-kits]
 */
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {clone,list,slug,same,canonical,identityFields,awardFields,sourceRefs,matchRequirement,loadProviders,loadKit,readJSON,writeJSON,providerFile,parseArgs,isMain,kitsRoot,root,exists} from './lib.mjs';
import {compileKit,deriveMappingEvidence,defaultOptionId} from './compile.mjs';

const programCore=['id','routeIds','title','level','catalog','totalCredits','creditSystem','school','requirements'];
const optionCore=['id','provider','code','mappingEvidence'];
const ABSENT='\u0000absent';
const key=value=>JSON.stringify(canonical(value));

function programSlugs(models){
  const used=new Map();
  return models.map(model=>{
    let base=slug(model.title.replace(/\s*\([^)]*\)/g,'')).replace(/-b-s(?=-|$)/,'-bs').replace(/-m-s(?=-|$)/,'-ms');
    if(base.length>48)base=base.slice(0,48).replace(/-[^-]*$/,'');
    base=base||slug(model.id);
    const n=(used.get(base)||0)+1;used.set(base,n);return n>1?`${base}-${n}`:base;
  });
}
function mostCommon(values){
  const counts=new Map();for(const v of values){const k=v===undefined?ABSENT:key(v);const entry=counts.get(k)||{n:0,value:v};entry.n++;counts.set(k,entry);}
  let best=null;for(const entry of counts.values())if(!best||entry.n>best.n)best=entry;return best.value;
}

/** Pure decomposition. existingProviders: Map(provider -> provider doc) whose course identities are reused as the canonical base. */
export function decompose(doc,{schoolId,existingProviders=new Map(),sourcePath}={}){
  const models=doc.models,slugs=programSlugs(models),first=models[0];
  if(!schoolId)throw Error('A school id is required.');
  if(new Set(models.map(m=>m.school)).size!==1)throw Error('A kit holds exactly one school.');
  const creditSystem=first.creditSystem;
  // Fields identical in every model become school-level program defaults.
  const defaults={};
  for(const field of Object.keys(first))if(!programCore.includes(field)&&models.every(m=>field in m&&same(m[field],first[field])))defaults[field]=clone(first[field]);

  // Provider identities: the canonical value per field is the most common one (or the existing shared record).
  const options=[];models.forEach((model,mi)=>model.requirements.forEach(requirement=>list(requirement.options).forEach((option,oi)=>options.push({model,mi,requirement,option,oi}))));
  const providers=new Map();
  const byCourse=new Map();for(const item of options){const k=item.option.provider+'|'+item.option.code;if(!byCourse.has(k))byCourse.set(k,[]);byCourse.get(k).push(item.option);}
  for(const[k,group]of byCourse){
    const[provider,code]=[group[0].provider,group[0].code];
    if(!providers.has(provider)){const base=clone(existingProviders.get(provider))||{kind:'pathway-kit-provider',version:1,provider,sources:[],courses:[]};delete base.file;providers.set(provider,base);}
    const doc=providers.get(provider);let course=doc.courses.find(c=>c.code===code);
    if(!course){course={code};for(const field of identityFields){const value=mostCommon(group.map(o=>o[field]));if(value!==undefined)course[field]=clone(value);}doc.courses.push(course);}
  }
  for(const doc of providers.values())doc.courses.sort((a,b)=>a.code.localeCompare(b.code));

  // Condition texts repeat across hundreds of options; keep one library per school.
  const conditionLibrary={},conditionIds=new Map();
  for(const{option}of options)for(const text of list(option.conditions))if(!conditionIds.has(text)){
    let id=schoolId+'-'+slug(text.split(/\s+/).slice(0,6).join(' '));const base=id;let n=2;while(id in conditionLibrary)id=base+'-'+n++;
    conditionIds.set(text,id);conditionLibrary[id]=text;
  }

  // Programs (requirements without options).
  const programs=models.map((model,mi)=>{
    const program={kind:'pathway-kit-program',version:1,slug:slugs[mi],modelId:model.id,routeIds:clone(model.routeIds),title:model.title,level:model.level,catalog:model.catalog,totalCredits:model.totalCredits};
    if(model.creditSystem!==creditSystem)program.creditSystem=model.creditSystem;
    program.review={status:'migrated',source:sourcePath||'legacy curriculum model',reviewedOn:model.mappingCheckedOn||doc.checkedOn};
    const modelFields={};for(const field of Object.keys(model))if(!programCore.includes(field)&&!(field in defaults))modelFields[field]=clone(model[field]);
    const policies={};
    if(typeof modelFields.alternativeMaxCredits==='number'&&Array.isArray(modelFields.alternativeCapSourceIds)){policies.alternativeMaxCredits={value:modelFields.alternativeMaxCredits,creditSystem:model.creditSystem,sourceIds:modelFields.alternativeCapSourceIds};delete modelFields.alternativeMaxCredits;delete modelFields.alternativeCapSourceIds;}
    // Duplicate-award exclusivity: only declared when every multiply placed source course carries the school's own single-award condition.
    const placed=new Map();for(const r of model.requirements)for(const o of list(r.options)){const k=o.provider+'|'+o.code;if(!placed.has(k))placed.set(k,[]);placed.get(k).push(o);}
    const multi=[...placed.values()].filter(g=>new Set(g.map(o=>o.receivingCode||o.receivingTitle)).size>1).flat();
    if(multi.length&&multi.every(o=>list(o.conditions).some(c=>/only one .{0,12}requirement/i.test(c))))policies.oneAwardPerSourceCourse={value:true,basis:'Every equivalency placed in more than one requirement of this program carries the school-published single-award condition.',sourceIds:[...new Set(multi.flatMap(o=>list(o.sourceIds)))].sort()};
    if(Object.keys(policies).length)program.policies=policies;
    if(Object.keys(modelFields).length)program.modelFields=modelFields;
    program.requirements=model.requirements.map(r=>{const copy=clone(r);delete copy.options;return copy;});
    return program;
  });
  const kitStub={school:{id:schoolId,name:first.school},providers};

  // Equivalency rows: one per distinct receiving award; identical awards across programs merge into one scoped row.
  const rows=new Map();
  models.forEach((model,mi)=>{
    const program=programs[mi];
    for(const requirement of model.requirements){
      const opts=list(requirement.options);
      const sorted=[...opts].sort((a,b)=>a.provider.localeCompare(b.provider)||a.code.localeCompare(b.code));
      const needsOrder=opts.some((o,i)=>o!==sorted[i]);
      opts.forEach((option,oi)=>{
        const course=providers.get(option.provider).courses.find(c=>c.code===option.code);
        const row={provider:option.provider,code:option.code,status:'published'};
        for(const field of awardFields)if(option[field]!==undefined&&field!=='conditions')row[field]=clone(option[field]);
        if(option.conditions)row.conditionIds=option.conditions.map(t=>conditionIds.get(t));
        const identity={},omit=[];
        for(const field of identityFields){if(option[field]===undefined){if(course[field]!==undefined)omit.push(field);}else if(!same(option[field],course[field]))identity[field]=clone(option[field]);}
        if(Object.keys(identity).length)row.identity=identity;
        if(omit.length)row.identityOmit=omit;
        const extra={};for(const field of Object.keys(option))if(!identityFields.includes(field)&&!awardFields.includes(field)&&!optionCore.includes(field))extra[field]=clone(option[field]);
        if(Object.keys(extra).length)row.extra=extra;
        if(option.mappingEvidence!==undefined&&!(row.universityMapRecord&&same(option.mappingEvidence,deriveMappingEvidence(kitStub,{title:model.title,level:model.level},row,model.modalities))))row.mappingEvidence=clone(option.mappingEvidence);
        const k=key(row);
        if(!rows.has(k))rows.set(k,{...row,scope:{programs:[]},placements:{},firstProgram:mi});
        const target=rows.get(k);
        if(target.placements[program.slug])throw Error(`One equivalency is placed twice in ${program.slug}; add an explicit requirementId placement.`);
        target.scope.programs.push(program.slug);
        const placement={};
        if(option.id!==defaultOptionId(row,requirement))placement.optionId=option.id;
        if(needsOrder)placement.order=oi;
        target.placements[program.slug]=placement;
        if(matchRequirement(target,program)?.id!==requirement.id)placement.requirementId=requirement.id;
      });
    }
  });
  const list2=[...rows.values()].map(row=>({...row,base:[slug(row.provider),slug(row.code),'to',slug(row.receivingCode||row.receivingTitle)].join('-')}));
  list2.sort((a,b)=>a.base.localeCompare(b.base)||a.firstProgram-b.firstProgram);
  const counts=new Map();for(const r of list2)counts.set(r.base,(counts.get(r.base)||0)+1);
  const ids=new Set(),equivalencies=list2.map(r=>{
    let id=counts.get(r.base)>1?r.base+'-'+r.scope.programs[0]:r.base;const base=id;let n=2;while(ids.has(id))id=base+'-'+n++;ids.add(id);
    const{base:_b,firstProgram:_f,...row}=r;
    for(const[slugKey,placement]of Object.entries(row.placements))if(!Object.keys(placement).length)delete row.placements[slugKey];
    if(!Object.keys(row.placements).length)delete row.placements;
    return {id,...row};
  });

  // Sources referenced only by one provider's identity fields move to that provider file; all others stay with the school.
  const owners=new Map();const own=(id,owner)=>{if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(owner);};
  for(const[name,p]of providers)for(const ref of sourceRefs(p.courses))own(ref.id,name);
  for(const row of equivalencies){const{identity,...rest}=row;for(const ref of sourceRefs(rest))own(ref.id,'school');if(identity)for(const ref of sourceRefs(identity))own(ref.id,row.provider);}
  for(const ref of sourceRefs(programs))own(ref.id,'school');
  for(const ref of sourceRefs(doc.sources))own(ref.id,'school');
  const schoolSources=[];
  for(const source of list(doc.sources)){
    const o=owners.get(source.id);
    if(o&&o.size===1&&providers.has([...o][0])){const p=providers.get([...o][0]),prior=p.sources.find(s=>s.id===source.id);if(prior&&!same(prior,source))throw Error('Conflicting shared provider source '+source.id);if(!prior)p.sources.push(clone(source));}
    else schoolSources.push(clone(source));
  }
  for(const p of providers.values())p.sources.sort((a,b)=>a.id.localeCompare(b.id));

  const school={kind:'pathway-kit-school',version:1,id:schoolId,name:first.school,creditSystem,checkedOn:doc.checkedOn,programOrder:programs.map(p=>p.slug)};
  if(Object.keys(defaults).length)school.programDefaults=defaults;
  if(doc.routes)school.routes=clone(doc.routes);
  school.sources=schoolSources;
  const equivalencyDoc={kind:'pathway-kit-equivalencies',version:1,school:schoolId,conditionLibrary,equivalencies};
  return {school,equivalencies:equivalencyDoc,programs,providers};
}

/** Per-model parity between a legacy document and a compiled one. Returns a list of human-readable differences. */
export function compareDocs(original,compiled){
  const diffs=[];
  const byId=new Map(compiled.models.map(m=>[m.id,m]));
  for(const model of original.models){
    const other=byId.get(model.id);if(!other){diffs.push(`${model.id}: missing`);continue;}
    const {requirements:a,...restA}=model,{requirements:b,...restB}=other;
    if(!same(restA,restB))diffs.push(`${model.id}: model fields differ`);
    if(a.length!==b.length){diffs.push(`${model.id}: requirement count ${a.length} != ${b.length}`);continue;}
    a.forEach((r,i)=>{
      const {options:oa,...ra}=r,{options:ob,...rb}=b[i];
      if(!same(ra,rb))diffs.push(`${model.id}/${r.id}: requirement fields differ`);
      if(!same(oa,ob))diffs.push(`${model.id}/${r.id}: options differ`);
    });
  }
  if(compiled.models.length!==original.models.length)diffs.push('model count differs');
  const sa=new Map(list(original.sources).map(s=>[s.id,s])),sb=new Map(list(compiled.sources).map(s=>[s.id,s]));
  for(const[id,s]of sa)if(!sb.has(id))diffs.push('source missing: '+id);else if(!same(s,sb.get(id)))diffs.push('source differs: '+id);
  for(const id of sb.keys())if(!sa.has(id))diffs.push('extra source: '+id);
  if(!same(original.routes,compiled.routes))diffs.push('routes differ');
  if(original.checkedOn!==compiled.checkedOn)diffs.push('checkedOn differs');
  return diffs;
}
export async function writeKit(kit,out=kitsRoot){
  const dir=join(out,kit.school.id);
  await writeJSON(join(dir,'school.json'),kit.school);
  await writeJSON(join(dir,'equivalencies.json'),kit.equivalencies,['equivalencies']);
  for(const program of kit.programs)await writeJSON(join(dir,'programs',program.slug+'.json'),program);
  for(const provider of kit.providers.values())await writeJSON(join(out,'providers',providerFile(provider.provider)),provider,['courses','sources']);
  return dir;
}
async function main(){
  const args=parseArgs(process.argv.slice(2)),input=args._[0];
  if(!input||!args.school)throw Error('Usage: migrate-from-model.mjs <content/curricula/file.json> --school <id> [--out content/pathway-kits]');
  const path=resolve(input),out=resolve(args.out||kitsRoot),doc=await readJSON(path);
  const existingProviders=await loadProviders(join(out,'providers'));
  const kit=decompose(doc,{schoolId:args.school,existingProviders,sourcePath:path.replace(root+'/','')});
  const dir=await writeKit(kit,out);
  const loaded=await loadKit(dir),{doc:compiled}=compileKit(loaded),diffs=compareDocs(doc,compiled);
  const original=await readFile(path,'utf8');let kitBytes=0,kitLines=0;
  const {readdir,readFile:rf}=await import('node:fs/promises');
  const files=[join(dir,'school.json'),join(dir,'equivalencies.json'),...(await readdir(join(dir,'programs'))).map(n=>join(dir,'programs',n)),...[...kit.providers.values()].map(p=>join(out,'providers',providerFile(p.provider)))];
  for(const f of files){const t=await rf(f,'utf8');kitBytes+=Buffer.byteLength(t);kitLines+=t.split('\n').length-1;}
  console.log(JSON.stringify({school:args.school,kit:dir.replace(root+'/',''),programs:kit.programs.length,providerCourses:[...kit.providers.values()].reduce((n,p)=>n+p.courses.length,0),equivalencies:kit.equivalencies.equivalencies.length,options:doc.models.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+list(r.options).length,0),0),parity:diffs.length?diffs.slice(0,20):'exact',sourceBytes:Buffer.byteLength(original),sourceLines:original.split('\n').length-1,kitBytes,kitLines,kitFiles:files.length},null,2));
  if(diffs.length)process.exitCode=1;
}
if(isMain(import.meta))await main();
