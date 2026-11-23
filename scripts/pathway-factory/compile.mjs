/** Kits -> curriculum documents in the existing content/curricula model schema. Deterministic: no clock reads. */
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {clone,list,slug,sourceRefs,awardFields,inScope,matchRequirement,rowStatus,programUnits,publishableReview,parsePlacement,sourceIndex,loadKit,kitDirs,exists,resolveKitDir,writeJSON,parseArgs,isMain,root,slotPieces,slotUpperOnly,slotRowsFor} from './lib.mjs';
import {verifyKit,formatFindings} from './verify.mjs';

/** Fields that exist only in the kit (grounding/review metadata) and never enter a compiled model. */
const kitOnlyRequirementFields=['quotes','institutionOptions','optionRows'];

export function deriveMappingEvidence(kit,program,row,modalities){
  const map=row.universityMapRecord;
  return {schoolName:kit.school.name,programName:program.title,level:program.level,modality:list(modalities)[0],catalogYear:map.catalogTerm,provider:row.provider,providerCourseCode:row.code,receivingCode:row.receivingCode,credits:row.credits,creditSystem:row.creditSystem,creditOrigin:row.creditOrigin,sourceIds:clone(row.sourceIds),programId:map.programId,agreementId:map.agreementId,mappingId:map.mappingId};
}
export const defaultOptionId=(row,requirement)=>[slug(row.provider),slug(row.code),requirement.id].join('-');
/** Named courses taken at the receiving school (requirement.institutionOptions) compile to the registry's University option shape. */
export function compileInstitutionOption(kit,program,choice){
  return {id:'university-'+slug(choice.code),provider:'University',code:choice.code,title:choice.title,credits:choice.credits,upper:Boolean(choice.upper),creditSystem:programUnits(kit,program),creditOrigin:'institutional',sourceIds:clone(list(choice.sourceIds)),evidence:'published',...(choice.url?{url:choice.url}:{})};
}

/** Builds one compiled option from a provider identity plus a receiving-school equivalency row. */
export function compileOption(kit,program,requirement,row,modalities){
  const provider=kit.providers.get(row.provider),course=list(provider?.courses).find(c=>c.code===row.code);
  if(!course)throw Error(`Unknown provider course ${row.provider} ${row.code} in ${row.id}`);
  const identity={...clone(course),...clone(row.identity||{})};delete identity.code;
  for(const field of list(row.identityOmit))delete identity[field];
  if(identity.sourceCredits===null){delete identity.sourceCredits;if(identity.sourceCreditSystem==null)delete identity.sourceCreditSystem;}
  const option={id:row.placements?.[program.slug]?.optionId||row.optionId||defaultOptionId(row,requirement),provider:row.provider,code:row.code,...identity};
  for(const field of awardFields)if(row[field]!==undefined)option[field]=clone(row[field]);
  if(row.conditionIds)option.conditions=row.conditionIds.map(id=>{const text=kit.equivalencies.conditionLibrary?.[id];if(typeof text!=='string')throw Error(`Unknown condition ${id} in ${row.id}`);return text;});
  Object.assign(option,clone(row.extra||{}));
  if(row.mappingEvidence)option.mappingEvidence=clone(row.mappingEvidence);
  else if(row.universityMapRecord)option.mappingEvidence=deriveMappingEvidence(kit,program,row,modalities);
  return option;
}
/**
 * A placement mode (equivalencies.json placementModes) describes how a placed award differs from the row itself in one
 * requirement: fields set or removed, appended condition texts, derived degreePlacementEvidence, a requirement-specific option id.
 */
export function applyMode(kit,model,requirement,option,modeId){
  const mode=kit.equivalencies.placementModes?.[modeId];
  if(!mode)throw Error(`Unknown placement mode ${modeId}`);
  for(const[field,value]of Object.entries(mode.set||{}))option[field]=clone(value);
  for(const field of list(mode.unset))delete option[field];
  if(mode.appendConditionIds)option.conditions=[...list(option.conditions),...mode.appendConditionIds.map(id=>{const text=kit.equivalencies.conditionLibrary?.[id];if(typeof text!=='string')throw Error(`Unknown condition ${id} in mode ${modeId}`);return text;})];
  const evidence=mode.placementEvidence;
  if(evidence){
    const sourceIds=[...list(requirement.sourceIds),...list(evidence.extraSourceIds)];
    option.degreePlacementEvidence={modelId:model.id,catalogYear:model.catalogYear,modality:list(model.modalities)[0],requirementId:requirement.id,receivingCode:option.receivingCode,credits:option.credits,creditSystem:option.creditSystem,placementType:evidence.placementType,sourceIds};
    if(evidence.citeInOption)option.sourceIds=[...list(option.sourceIds),...sourceIds.filter(id=>!list(option.sourceIds).includes(id))];
  }
  if(mode.idSuffix==='requirement')option.id=option.id+'-'+requirement.id;
  return option;
}
/** Explicit, ordered placements of a requirement (optionRows): equivalency rows with optional modes, or inline institutional options. */
export function placedOptions(kit,program,requirement,model){
  const rows=new Map(list(kit.equivalencies.equivalencies).map(row=>[row.id,row]));
  return list(requirement.optionRows).map(entry=>{
    const placement=parsePlacement(entry);
    if(placement.inline)return clone(placement.inline);
    const row=rows.get(placement.row);if(!row)throw Error(`Unknown equivalency row ${placement.row} in ${program.slug}/${requirement.id}`);
    const option=compileOption(kit,program,requirement,row,model.modalities);
    if(placement.mode)applyMode(kit,model,requirement,option,placement.mode);
    if(placement.optionId)option.id=placement.optionId;
    return option;
  });
}
/** In-scope, published equivalency rows for one requirement, in stable order. */
export function rowsFor(kit,program,requirement){
  const order=row=>row.placements?.[program.slug]?.order??Number.MAX_SAFE_INTEGER;
  return list(kit.equivalencies.equivalencies).filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit)&&matchRequirement(row,program)?.id===requirement.id)
    .sort((a,b)=>order(a)-order(b)||a.provider.localeCompare(b.provider)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
}
export function compileProgram(kit,program){
  const school=kit.school,defaults=clone(school.programDefaults||{});
  const modalities=program.modalities||defaults.modalities;
  const model={...defaults,id:program.modelId||`curriculum-${school.id}-${program.slug}`,routeIds:clone(list(program.routeIds)),school:school.name,title:program.title,level:program.level,catalog:program.catalog,totalCredits:program.totalCredits,creditSystem:programUnits(kit,program)};
  if(program.format)model.format=program.format;
  if(program.modalities)model.modalities=clone(program.modalities);
  // Normalized policies fill the legacy model fields; verbatim modelFields always win.
  const policies={...school.policies,...program.policies};
  if(policies.transferMaxCredits)Object.assign(model,{externalMaxCredits:policies.transferMaxCredits.value});
  if(policies.alternativeMaxCredits)Object.assign(model,{alternativeMaxCredits:policies.alternativeMaxCredits.value,alternativeCapSourceIds:clone(policies.alternativeMaxCredits.sourceIds)});
  Object.assign(model,clone(program.modelFields||{}));
  // Per-model source lists (modelSourceIds) let a school publish each model with exactly its own sources.
  if(program.modelSourceIds){const index=sourceIndex(kit,program);model.sources=program.modelSourceIds.map(id=>{const entry=index.get(id);if(!entry)throw Error(`Unknown model source ${id} in ${program.slug}`);return clone(entry.source);});}
  model.requirements=program.requirements.flatMap(requirement=>{
    if(requirement.slot)return compileSlot(kit,program,requirement,modalities);
    const compiled=clone(requirement);for(const field of kitOnlyRequirementFields)delete compiled[field];
    compiled.options=requirement.optionRows?placedOptions(kit,program,requirement,model):[...rowsFor(kit,program,requirement).map(row=>compileOption(kit,program,requirement,row,modalities)),...list(requirement.institutionOptions).map(choice=>compileInstitutionOption(kit,program,choice))];
    return compiled;
  });
  return model;
}
/**
 * An open slot compiles to one requirement per course-sized choice. Each choice is an allocation slot (the registry adds
 * the school's "choose a course" placeholder) and carries only the outside awards an explicit slotPlacements rule allows.
 */
export function compileSlot(kit,program,requirement,modalities){
  const units=programUnits(kit,program),pieces=slotPieces(requirement.credits,units),upper=slotUpperOnly(requirement.slot.label||requirement.title);
  // The choices of one block are interchangeable, so each eligible outside course is offered in exactly one of them
  // (round-robin over the same-sized choices). Every eligible course stays available in the block, a planned set of up
  // to one course per choice always fits, and the published data does not repeat each course once per choice.
  const eligible=new Map();
  for(const credits of pieces)if(!eligible.has(String(credits)))eligible.set(String(credits),slotRowsFor(kit,program,requirement,{credits}));
  const offered=(credits,index)=>{
    const key=String(credits),same=pieces.map((c,i)=>[c,i]).filter(([c])=>String(c)===key).map(([,i])=>i),turn=same.indexOf(index);
    return eligible.get(key).filter((entry,order)=>order%same.length===turn);
  };
  return pieces.map((credits,index)=>{
    const compiled=clone(requirement);for(const field of kitOnlyRequirementFields)delete compiled[field];
    delete compiled.code;
    const many=pieces.length>1,id=many?`${requirement.id}-${index+1}`:requirement.id;
    Object.assign(compiled,{id,title:many?`${requirement.title} · choice ${index+1} of ${pieces.length}`:requirement.title,credits,allocationSlot:true,slot:{kind:requirement.slot.kind,label:requirement.slot.label||requirement.title,choice:index+1,of:pieces.length,blockId:requirement.id,blockCredits:requirement.credits}});
    if(many)compiled.allocationOf=requirement.id;
    if(requirement.slot.kind==='free-elective')compiled.freeElective=true;
    if(upper)compiled.upper=true;
    const piece={...requirement,id};
    compiled.options=offered(credits,index).map(({row,rule})=>{
      const option=compileOption(kit,program,piece,row,modalities);
      option.allocationType=requirement.slot.kind==='free-elective'?'free-elective-category':'general-category';
      option.receivingCategory=row.receivingTitle;
      option.slotPlacementId=rule.id;
      if(rule.condition)option.conditions=[...list(option.conditions),rule.condition];
      return option;
    });
    return compiled;
  });
}
export const publishable=program=>publishableReview.includes(program.review?.status);

/** Compiles every publishable program of a kit into one curriculum document. Draft programs are reported, never compiled. */
export function compileKit(kit){
  const programs=kit.programs.filter(publishable),skipped=kit.programs.filter(p=>!publishable(p)).map(p=>({slug:p.slug,status:p.review?.status||p.status||'missing-review'}));
  const order=list(kit.school.programOrder);const rank=p=>{const i=order.indexOf(p.slug);return i<0?order.length:i;};
  programs.sort((a,b)=>rank(a)-rank(b)||a.slug.localeCompare(b.slug));
  const models=programs.map(p=>compileProgram(kit,p));
  const used=new Set(sourceRefs(models).map(r=>r.id)),sources=[],seen=new Set();
  const add=s=>{if(!seen.has(s.id)){seen.add(s.id);sources.push(clone(s));}};
  list(kit.school.sources).forEach(add);
  for(const p of programs)list(p.sources).forEach(add);
  for(const provider of [...kit.providers.values()].sort((a,b)=>a.provider.localeCompare(b.provider)))for(const s of list(provider.sources))if(used.has(s.id))add(s);
  // A pinned order keeps published model fingerprints stable (the registry copies document sources into each model).
  const pinned=list(kit.school.publish?.sourceOrder);
  if(pinned.length){const rank=new Map(pinned.map((id,i)=>[id,i]));sources.sort((a,b)=>(rank.get(a.id)??pinned.length)-(rank.get(b.id)??pinned.length));}
  const doc={version:1,checkedOn:kit.school.checkedOn,sources,models};
  if(kit.school.routes)doc.routes=clone(kit.school.routes);
  return {doc,skipped,documents:publishedDocuments(kit,doc)};
}
/**
 * Published documents. A single publish.path receives the whole document; publish.documents splits models across several
 * content/curricula files ({path, programs?, checkedOn?, routes?, sources?:false}); a document without programs takes every
 * program no other document lists. publish.compiledBy is copied onto each document so the registry knows that the school's
 * equivalencies are already joined.
 */
export function publishedDocuments(kit,doc){
  const publish=kit.school.publish;
  if(!publish)return [];
  if(!publish.documents)return publish.path?[{path:publish.path,doc}]:[];
  const listed=new Set(publish.documents.flatMap(d=>list(d.programs))),byId=new Map(doc.models.map(m=>[m.id,m]));
  const programs=kit.programs.filter(publishable),modelOf=slug=>byId.get(compiledId(kit,programs.find(p=>p.slug===slug)));
  return publish.documents.map(d=>{
    const models=(d.programs?d.programs.map(modelOf):programs.filter(p=>!listed.has(p.slug)).map(p=>byId.get(compiledId(kit,p)))).filter(Boolean);
    const out={version:1,checkedOn:d.checkedOn||kit.school.checkedOn};
    if(publish.compiledBy)out.compiledBy=publish.compiledBy;
    // sources:'own' keeps the document's source list to school sources, its own programs' sources and the provider sources
    // its models cite, in the document's (pinned) order, so programs published in another document never change it.
    if(d.sources==='own'){
      const slugs=new Set((d.programs||programs.filter(p=>!listed.has(p.slug)).map(p=>p.slug))),own=new Set([...list(kit.school.sources),...programs.filter(p=>slugs.has(p.slug)).flatMap(p=>list(p.sources))].map(s=>s.id));
      const cited=new Set(sourceRefs(models).map(r=>r.id)),fromProviders=new Set([...kit.providers.values()].flatMap(p=>list(p.sources).map(s=>s.id)));
      out.sources=doc.sources.filter(s=>own.has(s.id)||fromProviders.has(s.id)&&cited.has(s.id));
    }
    else if(d.sources!==false)out.sources=doc.sources;
    out.models=models;
    if(d.routes)out.routes=clone(d.routes);
    return {path:d.path,doc:out};
  });
}
const compiledId=(kit,program)=>program&&(program.modelId||`curriculum-${kit.school.id}-${program.slug}`);

/** Serialization for published curriculum documents (the files the existing registry build reads): pretty JSON, or one line with publish.compact. */
export const serializePublished=(doc,{compact=false}={})=>(compact?JSON.stringify(doc):JSON.stringify(doc,null,2))+'\n';
/** Runs a school's optional guards.mjs (school-specific academic invariants) against its compiled document. */
export async function runGuards(kit,doc){
  const path=resolve(kit.dir,'guards.mjs');
  if(!await exists(path))return 0;
  const guards=await import(pathToFileURL(path).href);
  const checks=list(guards.checks);
  for(const check of checks)check(doc,kit);
  return checks.length;
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const dirs=args._.length?args._.map(resolveKitDir):await kitDirs();
  let failed=false;
  for(const dir of dirs){
    const kit=await loadKit(dir),result=await verifyKit(kit,{asOf:args['as-of']});
    if(result.errors.length){console.error(formatFindings(kit,result));console.error(`Not compiled: ${kit.school.id} has ${result.errors.length} verification error(s).`);failed=true;continue;}
    const {doc,skipped,documents}=compileKit(kit),guards=await runGuards(kit,doc);
    const summary={school:kit.school.id,models:doc.models.length,options:doc.models.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+r.options.length,0),0),guards,skippedDrafts:skipped};
    if(args.publish){
      // Published kits are the source of truth for their content/curricula document.
      if(!documents.length){continue;}
      for(const{path,doc:published}of documents){
        const out=resolve(root,path),text=serializePublished(published,{compact:kit.school.publish.compact===true});
        if(args.check){const current=await exists(out)?await readFile(out,'utf8'):null;if(current!==text){console.error(`${path} is stale; run npm run factory:publish`);failed=true;continue;}}
        else await writeFile(out,text);
      }
      console.log(JSON.stringify({...summary,published:documents.map(d=>d.path),check:Boolean(args.check)}));
      continue;
    }
    const out=resolve(args.out||resolve(root,'content/curricula/kits'),kit.school.id+'.json');
    await writeJSON(out,doc);
    console.log(JSON.stringify({...summary,output:out.replace(root+'/','')}));
  }
  if(failed)process.exitCode=1;
}
if(isMain(import.meta))await main();
