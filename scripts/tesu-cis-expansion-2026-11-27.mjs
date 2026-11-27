/** Source-bound new CIS ledger proposal. Does not publish, approve outside awards,
 * mutate shared manifests or advance any prior program/source review date. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,sourceRefs,isMain} from './pathway-factory/lib.mjs';
import {validateConnectedWebCapture} from './pathway-factory/connected-web.mjs';
import {createTESUBusinessBlocks,namedTESUUniversityOption,TESU_BUSINESS_CATALOG} from './tesu-business-blocks.mjs';
import {loadTESUBusinessPriceBasis} from './tesu-business-metadata.mjs';
import {manifestMajorRequirements,manifestConstraints,validateProgramManifest} from './pathway-factory/program-manifest.mjs';

const copy=structuredClone,unique=v=>[...new Set(v)],norm=v=>String(v||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
const read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const DATE='2026-11-27',SLUG='bs-computer-information-systems',PACKET='content/pathway-kits/tesu/business-cis-expansion-review-2026-11-27.json';
export async function assertCISRetainedSource(source){
 const body=await readFile(resolve(root,source.capture),'utf8'),meta=await read(source.capture.replace(/\.txt$/,'.json'));
 assert.equal(hash(body),source.sha256);assert.equal(source.sourceContentHash,source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);assert.equal(source.kind,'university');assert.equal(new URL(source.url).hostname,'tesu.smartcatalogiq.com');
 assert.equal(source.toolResponseReceipt?.sha256,meta.toolResponseReceipt?.sha256);await validateConnectedWebCapture({...meta,text:body});assert(meta.fetchedAt.slice(0,10)<=source.checked&&source.checked<=DATE);
 return body;
}
export async function buildCISExpansionProposal(){
 const packet=await read(PACKET),degree=packet.degree,degreeBody=await assertCISRetainedSource(degree.source),spec=packet.spec;
 const blocks=await createTESUBusinessBlocks({slug:SLUG,title:spec.title,degreeSource:degree.source,degreeBody,reviewedOn:DATE,areaUpperCredits:12});
 const {modelFields,policies}=blocks;
 const inherited=await read('content/pathway-kits/tesu/programs/bsba-human-resources-organizational-management.json');
 modelFields.tuitionComparison={...copy(inherited.modelFields.tuitionComparison),checkedOn:DATE,catalogIdentity:copy(modelFields.catalogIdentity),modelId:'curriculum-tesu-'+SLUG};
 const area=[],sources=[degree.source,(await loadTESUBusinessPriceBasis()).tuitionSource];
 for(const [index,[code,title]]of spec.areaCourses.entries()){
  const course=packet.courses.find(course=>course.code===code);assert(course,code+': independently reviewed complete body');const body=await assertCISRetainedSource(course.source);sources.push(course.source);
  assert(norm(body).includes(norm(code+' '+title)),code+': exact title');assert(/\bCredits\s*3\b/.test(norm(body)),code+': three credits');assert(norm(degreeBody).includes(norm(code+' '+title+' 3')),code+': independently named in exact degree');
  assert(norm(body).includes(norm('Delivery Methods '+course.deliveryMethods.join(' '))),code+': actual published delivery choices');
  const formal=norm(body).match(/\bPrerequisites?\b\s*:?\s*([\s\S]*?)(?=\bDelivery Methods\b|\bAdvisory\b|$)/i)?.[1]?.trim()||null;
  assert.equal(formal,course.formalPrerequisiteText,code+': whole formal prerequisite retained');
  if(code==='CIS-3510')assert.equal(formal,'COS-1160 or COS-2130');else assert.equal(formal,null);
  const r={id:code.toLowerCase().replace('-',''),code,title,credits:3,category:'major',group:'area-of-study',subgroup:'area-of-study',upper:spec.areaUpperCodes.includes(code),institutionalOnly:false,sourceIds:[degree.source.id,course.source.id],minimumGrade:'C',minimumGradeSourceIds:copy(modelFields.gradePolicy.sourceIds),gradePolicyNote:'C or better in the business area of study.',curriculumBlock:index<spec.requiredCount?'required-area':'selected-area',quotes:[{sourceId:degree.source.id,text:code+' '+title+' 3'}]};
  if(spec.prerequisites[code]){r.prerequisites=spec.prerequisites[code].map(c=>c.toLowerCase().replace('-',''));r.prerequisiteSourceIds=[course.source.id];r.prerequisiteNotes=spec.prerequisiteNotes[code];r.originalPrerequisiteCodes=copy(spec.originalPrerequisiteCodes[code]);}
  if(spec.advisoryNotes[code]){r.advisoryNote=spec.advisoryNotes[code];r.advisorySourceIds=[course.source.id];}
  r.optionRows=[namedTESUUniversityOption(r)];Object.assign(r.optionRows[0].inline,{url:course.source.url,deliveryMethods:copy(course.deliveryMethods),deliveryMethodSourceIds:[course.source.id]});area.push(r);
 }
 modelFields.existingCreditReview.groups[0].requirementIds=area.map(r=>r.id);
 const freeAt=modelFields.curriculumSections.findIndex(section=>section.parentId==='elective');
 modelFields.curriculumSections.splice(freeAt,0,{id:'tesu-'+SLUG+'-required',title:'Required '+spec.shortName+' Courses',parentId:'major',requirementIds:area.slice(0,spec.requiredCount).map(r=>r.id),sourceId:degree.source.id},{id:'tesu-'+SLUG+'-selected',title:spec.shortName+' Electives',parentId:'major',requirementIds:area.slice(spec.requiredCount).map(r=>r.id),sourceId:degree.source.id});
 const requirements=[...blocks.requirements.filter(r=>!r.freeElective),...area,...blocks.requirements.filter(r=>r.freeElective)];
 assert.equal(requirements.length,40);assert.equal(requirements.reduce((n,r)=>n+r.credits,0),120);assert.equal(area.filter(r=>r.upper).reduce((n,r)=>n+r.credits,0),12);assert.equal(area.filter(r=>!r.upper).reduce((n,r)=>n+r.credits,0),6);
 for(const row of requirements)for(const prereq of row.prerequisites||[])assert(requirements.some(r=>r.id===prereq),row.code+': complete named prerequisite closure');
 const review={status:'reviewed',reviewer:'DegreeSteps source review',reviewedOn:DATE,method:'Exact primary degree and individual course bodies; shared curriculum blocks independently re-proven. Outside eligibility and placement are reviewed separately.'};
 const program={kind:'pathway-kit-program',version:1,slug:SLUG,modelId:'curriculum-tesu-'+SLUG,routeIds:['tesu-'+SLUG],title:spec.title,level:'bachelor',catalog:TESU_BUSINESS_CATALOG,totalCredits:120,modalities:['online'],review,policies,modelFields,modelSourceIds:unique([...blocks.modelSourceIds,...sources.map(s=>s.id),...sourceRefs(requirements).map(ref=>ref.id)]),requirements};
 const old=await read('content/factory-manifests/tesu.json'),template=copy(old.programs.find(entry=>entry.slug==='bsba-human-resources-organizational-management'));
 const manifestEntry={...template,slug:SLUG,modelId:program.modelId,routeIds:copy(program.routeIds),title:program.title,programPath:'content/pathway-kits/tesu/programs/'+SLUG+'.json',outputPath:'content/curricula/tesu-computer-information-systems.json',authoringReview:review,sourceRefs:{degree:copy(modelFields.catalogIdentity),modelSourceIds:copy(program.modelSourceIds)},pricing:{comparison:copy(modelFields.tuitionComparison),rateIds:copy(template.pricing.rateIds)},context:{fitReviewIds:copy(template.context.fitReviewIds),requirementReviewIds:['tesu-'+SLUG+'-requirements-business-expansion-20261126'],requirementsPath:template.context.requirementsPath},curriculum:{majorRequirements:manifestMajorRequirements(program),constraints:manifestConstraints(program),policies:copy(policies)},placementBasis:{kind:'reviewed-business-primary',capture:degree.source.capture,degreeSourceId:degree.source.id,freeElectiveCredits:15},metadataBasis:{degreePath:new URL(degree.source.url).pathname.replace(/^\/en\//,'/').replace(/\/$/,'')},authoring:{type:'tesu-business-major-v1',spec:copy(spec),courseBindings:packet.courses.map(course=>({code:course.code,credits:3,source:copy(course.source)}))}};
 validateProgramManifest({...old,programs:[manifestEntry]});
 return {program,manifestEntry,sources,courseIndex:{kind:'tesu-business-course-source-review',version:1,checkedOn:DATE,publicationPromotionAllowed:false,scope:'Primary exact CIS degree and complete course bodies; no outside awards inferred.',courses:copy(packet.courses)}};
}
if(isMain(import.meta)){const result=await buildCISExpansionProposal();if(process.argv.includes('--write')){await writeFile(resolve(root,'content/pathway-kits/tesu/programs/'+SLUG+'.json'),JSON.stringify(result.program,null,2)+'\n');await writeFile(resolve(root,'content/pathway-kits/tesu/business-cis-manifest-proposal-2026-11-27.json'),JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify({modelId:result.program.modelId,requirements:result.program.requirements.length,totalCredits:120,upperAreaCredits:12,outsideAwardsAdded:0,publicationDecision:false}));}
