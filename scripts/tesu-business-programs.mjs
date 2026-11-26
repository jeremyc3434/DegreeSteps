/** Current HR and Marketing degree ledgers. This authoring stage does not publish
 * routes or approve outside courses; the existing exact award/placement stages do. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,sourceRefs,loadKit,sourceIndex} from './pathway-factory/lib.mjs';
import {createTESUBusinessBlocks,namedTESUUniversityOption,reviewedTESUBusinessSource,TESU_BUSINESS_CATALOG,TESU_BUSINESS_REVIEW_DATE} from './tesu-business-blocks.mjs';
import {loadTESUBusinessPriceBasis,buildTESUBusinessTuitionBinding} from './tesu-business-metadata.mjs';

const copy=structuredClone,unique=values=>[...new Set(values)],norm=value=>String(value||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const serialize=value=>JSON.stringify(value,null,2)+'\n';
export const TESU_BUSINESS_PROGRAM_SLUGS=Object.freeze(['bsba-human-resources-organizational-management','bsba-marketing']);
const captures={'bsba-human-resources-organizational-management':'08ba94f0898450bf','bsba-marketing':'60df9ea927fc193a'};
const coursePath=code=>{const [prefix,number]=code.split('-'),discipline={MAN:'man-management',MKT:'mkt-marketing',PSY:'psy-psychology',SOC:'soc-sociology'}[prefix];assert(discipline,'Only the exact reviewed business-area disciplines are in scope');return '/current/undergraduate-catalog/courses/'+discipline+'/'+number[0]+'000/'+(code==='MAN-4320'?'man-432':code.toLowerCase());};
const codeId=code=>code.toLowerCase().replace('-','');

export function assertTESUBusinessCourseBody(spec,code,body){
 assert(new RegExp('\\b'+code.replace('-','[- ]')+'\\b','i').test(body),code+': primary course body names its exact identity');
 assert(/\bCredits\s*:?\s*3\b/i.test(body),code+': primary course body establishes three credits');
 const original=spec.originalPrerequisiteCodes?.[code]||spec.prerequisites?.[code]||[];
 const formal=norm(body).match(/\bPrerequisites?\b\s*:?\s*([\s\S]*?)(?=\bDelivery Methods\b|\bAdvisory\b|$)/i)?.[1]?.trim();
 const expectedCodes=unique(original.flatMap(value=>value.match(/[A-Z]+-\d{4}/g)||[])).sort(),formalCodes=unique(formal?.match(/[A-Z]+-\d{4}/g)||[]).sort();
 if(original.length){assert(formal,code+': retain the current formal prerequisite block');assert.deepEqual(formalCodes,expectedCodes,code+': all formal prerequisite course codes are modeled');}
 else assert.equal(formal,undefined,code+': a newly published formal prerequisite needs an explicit sequence review');
 for(const prerequisite of original)assert(norm(body).includes(prerequisite)||prerequisite.includes(' or ')&&prerequisite.split(' or ').every(p=>norm(body).includes(p)),code+': current primary course body supports the original prerequisite '+prerequisite);
 if(code==='MKT-4410')assert(norm(body).includes('MKT-3060')&&norm(body).includes('MAR-3060'), 'MKT-4410 keeps the formal spelling and the independently printed named advisory course');
 return true;
}

export async function buildReviewedTESUBusinessProgram(spec,courseIndex){
 assert(TESU_BUSINESS_PROGRAM_SLUGS.includes(spec.slug),'Only exact current HR and Marketing are authored by this stage');
 const meta=await read('content/source-captures/'+captures[spec.slug]+'.json');
 assert.equal(meta.url,spec.url,spec.slug+': immutable degree capture is bound to the independently reviewed exact primary URL');
 const degree=await reviewedTESUBusinessSource({id:'tesu-'+spec.slug+'-current-2026-11-26',title:spec.title+' — current exact curriculum',url:meta.url,checked:TESU_BUSINESS_REVIEW_DATE,capture:'content/source-captures/'+captures[spec.slug]+'.txt',kind:'university',roles:['curriculum','degree-placement','program-policy']});
 const {requirements:blocks,modelFields,modelSourceIds,policies}=await createTESUBusinessBlocks({slug:spec.slug,title:spec.title,degreeSource:degree.source,degreeBody:degree.body});
 const sources=[degree.source],area=[];
 const priceBinding=buildTESUBusinessTuitionBinding({modelId:'curriculum-tesu-'+spec.slug,catalogIdentity:modelFields.catalogIdentity},await loadTESUBusinessPriceBasis());
 modelFields.tuitionComparison=priceBinding.tuitionComparison;sources.push(...priceBinding.sources);
 for(const [index,[code,title]]of spec.areaCourses.entries()){
  const entry=courseIndex.courses.find(entry=>entry.code===code);assert(entry?.source,code+': retain the individual primary course body before authoring');
  const primaryURL=new URL(entry.source.url);assert.equal(primaryURL.hostname,'tesu.smartcatalogiq.com');assert.equal(primaryURL.pathname.replace(/^\/en\//,'/').replace(/\/$/,''),coursePath(code),code+': exact current primary course page, including the published MAN-432 URL alias');
  const course=await reviewedTESUBusinessSource(entry.source);assertTESUBusinessCourseBody(spec,code,course.body);sources.push(course.source);
  assert(norm(course.body).includes(norm(code+' '+title)),code+': the retained course body names this exact University course');
  assert.equal(entry.credits,3,code+': reviewed original University quantity');
  assert(Array.isArray(entry.deliveryMethods)&&entry.deliveryMethods.length&&norm(course.body).includes(norm('Delivery Methods '+entry.deliveryMethods.join(' '))),code+': all published delivery methods are bound to the complete primary body');
  const quote=code+' '+title+' 3';assert(norm(degree.body).includes(norm(quote)),code+': degree independently permits this exact three-credit area course');
  const r={id:codeId(code),code,title,credits:3,category:'major',group:'area-of-study',subgroup:'area-of-study',upper:true,institutionalOnly:false,sourceIds:[degree.source.id,course.source.id],minimumGrade:'C',minimumGradeSourceIds:copy(modelFields.gradePolicy.sourceIds),gradePolicyNote:'C or better in the business area of study.',curriculumBlock:index<spec.requiredCount?'required-area':'selected-area',quotes:[{sourceId:degree.source.id,text:quote}]};
  if(spec.prerequisites?.[code]?.length){r.prerequisites=spec.prerequisites[code].map(codeId);r.prerequisiteSourceIds=[course.source.id];}
  if(spec.prerequisiteNotes?.[code])r.prerequisiteNotes=spec.prerequisiteNotes[code];
  if(spec.originalPrerequisiteCodes?.[code])r.originalPrerequisiteCodes=copy(spec.originalPrerequisiteCodes[code]);
  if(code==='MKT-4410'){
   r.unresolvedPrerequisiteCodes=['MAR-3060'];
   modelFields.unresolved.push({id:'tesu-marketing-mar3060-formal-prerequisite',status:'needs-research',owner:'DegreeSteps',message:'TESU lists MAR-3060 as the formal prerequisite for MKT-4410. Its advisory separately names MKT-3060 or MKT-2010; a primary University crosswalk or approved substitution is still required to establish that this proposed sequence satisfies the formal prerequisite.',sourceIds:[degree.source.id,course.source.id]});
  }
  if(spec.advisoryNotes?.[code]){r.advisoryNote=code==='PSY-3600'?'Introductory psychology knowledge is advisory; it is not an additional formal prerequisite or a promise that a particular free elective is selected.':spec.advisoryNotes[code];r.advisorySourceIds=[course.source.id];}
  r.optionRows=[namedTESUUniversityOption(r)];
  Object.assign(r.optionRows[0].inline,{url:course.source.url,deliveryMethods:copy(entry.deliveryMethods),deliveryMethodSourceIds:[course.source.id]});
  if(code==='PSY-3630')r.optionRows[0].inline.conditions=['TESU lists Industrial Psychology through e-Pack delivery.'];
  area.push(r);
 }
 modelFields.existingCreditReview.groups[0].requirementIds=area.map(r=>r.id);
 const freeAt=modelFields.curriculumSections.findIndex(section=>section.parentId==='elective');
 modelFields.curriculumSections.splice(freeAt,0,...[
  {id:'tesu-'+spec.slug+'-required',title:'Required '+spec.shortName+' Courses',parentId:'major',requirementIds:area.slice(0,spec.requiredCount).map(r=>r.id),sourceId:degree.source.id},
  {id:'tesu-'+spec.slug+'-selected',title:spec.shortName+' Electives',parentId:'major',requirementIds:area.slice(spec.requiredCount).map(r=>r.id),sourceId:degree.source.id}
 ]);
 const requirements=[...blocks.filter(r=>!r.freeElective),...area,...blocks.filter(r=>r.freeElective)];
 const program={kind:'pathway-kit-program',version:1,slug:spec.slug,modelId:'curriculum-tesu-'+spec.slug,routeIds:['tesu-'+spec.slug],title:spec.title,level:'bachelor',catalog:TESU_BUSINESS_CATALOG,totalCredits:120,modalities:['online'],review:{status:'reviewed',reviewer:'DegreeSteps source review',reviewedOn:TESU_BUSINESS_REVIEW_DATE,method:'Exact primary degree and individual course bodies; shared curriculum blocks independently re-proven. Outside eligibility and placement are reviewed separately.'},policies,modelFields,modelSourceIds:unique([...modelSourceIds,...sources.map(s=>s.id),...sourceRefs(requirements).map(ref=>ref.id)]),requirements};
 return {program,sources,degree};
}

/** Each stage keeps its own responsibility. Replaying this writer preserves
 * independently authored course placements, exact source closure and pricing
 * binding while comparing every academic field that this writer owns. */
export function preserveTESUBusinessEnrichments(expected,actual){
 if(!actual)return copy(expected);
 const out=copy(expected),byId=new Map(actual.requirements.map(r=>[r.id,r]));
 for(const r of out.requirements)if(byId.has(r.id))r.optionRows=[...copy(r.optionRows),...copy(byId.get(r.id).optionRows.filter(entry=>entry.inline?.provider!=='University'))];
 out.modelSourceIds=unique([...expected.modelSourceIds,...actual.modelSourceIds]);
 if(actual.modelFields.sourceIds!==undefined)out.modelFields.sourceIds=unique([...expected.modelFields.sourceIds,...actual.modelFields.sourceIds]);
 return out;
}
export function assertTESUBusinessAcademicParity(actual,expected,knownSourceIds){
 const academic=value=>{const p=copy(value);delete p.modelSourceIds;delete p.modelFields.sourceIds;for(const r of p.requirements)delete r.optionRows;return p;};
 assert.deepEqual(academic(actual),academic(expected),expected.slug+': owned academic facts remain exactly source-bound');
 for(const row of expected.requirements){const owned=row.optionRows.filter(entry=>entry.inline?.provider==='University'),present=actual.requirements.find(r=>r.id===row.id)?.optionRows.filter(entry=>entry.inline?.provider==='University');assert.deepEqual(present,owned,row.id+': named university choices and their actual delivery evidence remain source-bound');}
 assert(expected.modelSourceIds.every(id=>actual.modelSourceIds.includes(id)),expected.slug+': all primary curriculum and policy sources remain');
 assert(actual.modelSourceIds.every(id=>knownSourceIds.has(id)),expected.slug+': enrichment sources exist in the reviewed source registry');
 assert(expected.modelFields.sourceIds.every(id=>actual.modelFields.sourceIds?.includes(id))&&actual.modelFields.sourceIds.every(id=>knownSourceIds.has(id)),expected.slug+': exact primary model source scope');
 if(actual.modelFields.tuitionComparison){const c=actual.modelFields.tuitionComparison;assert.equal(c.modelId,expected.modelId);assert.deepEqual(c.catalogIdentity,actual.modelFields.catalogIdentity);assert.equal(c.checkedOn,TESU_BUSINESS_REVIEW_DATE);assert(c.pricingSourceIds?.length&&c.pricingSourceIds.every(id=>knownSourceIds.has(id)),expected.slug+': source-bound independent pricing review');}
}

export async function authorTESUBusinessPrograms({check=false}={}){
 const priorReview=await read('content/pathway-kits/tesu/business-expansion-review-2026-11-25.json'),courseIndex=await read('content/pathway-kits/tesu/business-course-sources-2026-11-26.json');
 assert.equal(courseIndex.checkedOn,TESU_BUSINESS_REVIEW_DATE);
 const builds=[];for(const slug of TESU_BUSINESS_PROGRAM_SLUGS)builds.push(await buildReviewedTESUBusinessProgram(priorReview.programs.find(p=>p.slug===slug),courseIndex));
 const school=await read('content/pathway-kits/tesu/school.json');
 for(const build of builds)for(const source of build.sources){const at=school.sources.findIndex(s=>s.id===source.id);if(at<0)school.sources.push(source);else assert.deepEqual(school.sources[at],source,source.id+': immutable primary business source record');}
 for(const {program}of builds){if(!school.programOrder.includes(program.slug))school.programOrder.push(program.slug);const path='content/curricula/tesu-'+program.slug.replace(/^bsba-/,'')+'.json';
  const publication={path,programs:[program.slug],checkedOn:TESU_BUSINESS_REVIEW_DATE,sources:false,routes:[{id:program.routeIds[0],title:program.title,school:school.name,schoolId:'tesu',level:'bachelor',modalities:['online'],field:'business',fields:['business'],goals:['any-degree','career-growth','change-career'],paceModel:'course-term',url:program.modelFields.catalogIdentity.sourceUrl,sourceId:program.modelFields.catalogIdentity.sourceId,degreeCredits:120,creditUnit:'semester',status:'listed',checkedOn:TESU_BUSINESS_REVIEW_DATE}]};
  const at=school.publish.documents.findIndex(d=>d.path===path);if(at<0)school.publish.documents.push(publication);else assert.deepEqual(school.publish.documents[at],publication,program.slug+': exact canonical publication declaration');
 }
 const kit=await loadKit('content/pathway-kits/tesu'),knownSourceIds=new Set([...school.sources.map(s=>s.id),...sourceIndex(kit).keys()]),writes=[];
 for(const {program}of builds){const path='content/pathway-kits/tesu/programs/'+program.slug+'.json';let actual;try{actual=await read(path);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(check){assert(actual,path+' is missing');assertTESUBusinessAcademicParity(actual,program,knownSourceIds);}else writes.push([path,preserveTESUBusinessEnrichments(program,actual)]);
 }
 writes.push(['content/pathway-kits/tesu/school.json',school]);
 for(const [path,value]of writes){const text=serialize(value);if(check)assert.equal(await readFile(resolve(root,path),'utf8'),text,path+': stale business source/publication registry');else await writeFile(resolve(root,path),text);}
 return {models:builds.map(b=>b.program.modelId),requirements:builds.map(b=>b.program.requirements.length),outsideAwardsAdded:0,published:false,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await authorTESUBusinessPrograms({check:process.argv.includes('--check')})));
