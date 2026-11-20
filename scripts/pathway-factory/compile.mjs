/** Kits -> curriculum documents in the existing content/curricula model schema. Deterministic: no clock reads. */
import {resolve} from 'node:path';
import {clone,list,slug,sourceRefs,awardFields,inScope,matchRequirement,rowStatus,programUnits,publishableReview,loadKit,kitDirs,resolveKitDir,writeJSON,parseArgs,isMain,root} from './lib.mjs';
import {verifyKit,formatFindings} from './verify.mjs';

/** Fields that exist only in the kit (grounding/review metadata) and never enter a compiled model. */
const kitOnlyRequirementFields=['quotes'];

export function deriveMappingEvidence(kit,program,row,modalities){
  const map=row.universityMapRecord;
  return {schoolName:kit.school.name,programName:program.title,level:program.level,modality:list(modalities)[0],catalogYear:map.catalogTerm,provider:row.provider,providerCourseCode:row.code,receivingCode:row.receivingCode,credits:row.credits,creditSystem:row.creditSystem,creditOrigin:row.creditOrigin,sourceIds:clone(row.sourceIds),programId:map.programId,agreementId:map.agreementId,mappingId:map.mappingId};
}
export const defaultOptionId=(row,requirement)=>[slug(row.provider),slug(row.code),requirement.id].join('-');

/** Builds one compiled option from a provider identity plus a receiving-school equivalency row. */
export function compileOption(kit,program,requirement,row,modalities){
  const provider=kit.providers.get(row.provider),course=list(provider?.courses).find(c=>c.code===row.code);
  if(!course)throw Error(`Unknown provider course ${row.provider} ${row.code} in ${row.id}`);
  const identity={...clone(course),...clone(row.identity||{})};delete identity.code;
  for(const field of list(row.identityOmit))delete identity[field];
  const option={id:row.placements?.[program.slug]?.optionId||defaultOptionId(row,requirement),provider:row.provider,code:row.code,...identity};
  for(const field of awardFields)if(row[field]!==undefined)option[field]=clone(row[field]);
  if(row.conditionIds)option.conditions=row.conditionIds.map(id=>{const text=kit.equivalencies.conditionLibrary?.[id];if(typeof text!=='string')throw Error(`Unknown condition ${id} in ${row.id}`);return text;});
  Object.assign(option,clone(row.extra||{}));
  if(row.mappingEvidence)option.mappingEvidence=clone(row.mappingEvidence);
  else if(row.universityMapRecord)option.mappingEvidence=deriveMappingEvidence(kit,program,row,modalities);
  return option;
}
/** In-scope, published equivalency rows for one requirement, in stable order. */
export function rowsFor(kit,program,requirement){
  const order=row=>row.placements?.[program.slug]?.order??Number.MAX_SAFE_INTEGER;
  return list(kit.equivalencies.equivalencies).filter(row=>rowStatus(row)==='published'&&inScope(row,program)&&matchRequirement(row,program)?.id===requirement.id)
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
  model.requirements=program.requirements.map(requirement=>{
    const compiled=clone(requirement);for(const field of kitOnlyRequirementFields)delete compiled[field];
    compiled.options=rowsFor(kit,program,requirement).map(row=>compileOption(kit,program,requirement,row,modalities));
    return compiled;
  });
  return model;
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
  const doc={version:1,checkedOn:kit.school.checkedOn,sources,models};
  if(kit.school.routes)doc.routes=clone(kit.school.routes);
  return {doc,skipped};
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const dirs=args._.length?args._.map(resolveKitDir):await kitDirs();
  let failed=false;
  for(const dir of dirs){
    const kit=await loadKit(dir),result=await verifyKit(kit,{asOf:args['as-of']});
    if(result.errors.length){console.error(formatFindings(kit,result));console.error(`Not compiled: ${kit.school.id} has ${result.errors.length} verification error(s).`);failed=true;continue;}
    const {doc,skipped}=compileKit(kit),out=resolve(args.out||resolve(root,'content/curricula/kits'),kit.school.id+'.json');
    await writeJSON(out,doc);
    console.log(JSON.stringify({school:kit.school.id,output:out.replace(root+'/',''),models:doc.models.length,options:doc.models.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+r.options.length,0),0),skippedDrafts:skipped}));
  }
  if(failed)process.exitCode=1;
}
if(isMain(import.meta))await main();
