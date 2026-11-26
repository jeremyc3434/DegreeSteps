/** Current named General Management selection. Shared awards are joined separately. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,sourceRefs,loadKit,sourceIndex} from './pathway-factory/lib.mjs';
import {createTESUBusinessBlocks,namedTESUUniversityOption,reviewedTESUBusinessSource,TESU_BUSINESS_CATALOG,TESU_BUSINESS_REVIEW_DATE} from './tesu-business-blocks.mjs';
import {loadTESUBusinessPriceBasis,buildTESUBusinessTuitionBinding} from './tesu-business-metadata.mjs';

export const GENERAL_MANAGEMENT_ID='curriculum-tesu-bs-general-management';
export const GENERAL_MANAGEMENT_ROUTE='tesu-bs-general-management';
export const GENERAL_MANAGEMENT_SLUG='bs-general-management';
export const GENERAL_MANAGEMENT_TITLE='B.S. in General Management';
export const GENERAL_MANAGEMENT_URL='https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bs-in-general-management';
export const GENERAL_MANAGEMENT_PATH='content/pathway-kits/tesu/programs/bs-general-management.json';
const REVIEW='tesu-bs-general-management-curriculum-2026-11-26';
const list=value=>Array.isArray(value)?value:[],norm=value=>String(value||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim(),unique=values=>[...new Set(values)];
const sameURL=(left,right)=>{try{return new URL(left).href.replace(/\/$/,'')===new URL(right).href.replace(/\/$/,'');}catch{return false;}};
export const GENERAL_MANAGEMENT_AREA=Object.freeze([
 {code:'MAN-3110',title:'Organizational Behavior',businessArea:'management',path:'man-management/3000/man-3110'},
 {code:'MAN-3310',title:'Human Resources Management',businessArea:'management',path:'man-management/3000/man-3310',prerequisites:['man2100']},
 {code:'FIN-3310',title:'Financial Institutions and Markets',businessArea:'finance',path:'fin-finance/3000/fin-3310'},
 {code:'FIN-3340',title:'International Finance',businessArea:'finance',path:'fin-finance/3000/fin-3340'},
 {code:'MKT-4110',title:'Marketing Research',businessArea:'marketing',path:'mkt-marketing/4000/mkt-4110'},
 {code:'MKT-4790',title:'Applied Marketing Practices',businessArea:'marketing',path:'mkt-marketing/4000/mkt-4790'}
]);
const courseURL=course=>'https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/courses/'+course.path;
const requirementID=code=>code.toLowerCase().replace('-','');

/** Check each selected course inside its real catalog discipline, not just a
 * matching title elsewhere on the page. This fixed selection avoids the
 * ACC-4010 -> ACC-2010 -> ACC-1020 sequence by choosing no accounting area course. */
export function assertGeneralManagementAreaEvidence(body){
 const text=norm(body),tail=text.split('III. Area of Study (18 Credits)')[1],section=tail?.includes('IV. Electives (15 Credits)')?tail.split('IV. Electives (15 Credits)')[0]:null;
 assert(section,'The exact General Management area and elective boundary are required.');
 assert(text.includes('B.S. in General Management'));
 assert(section.includes('Select 18 credits from the following areas. A minimum of three of the four areas must be represented:'));
 const areas=['Accounting','Finance','Management','Marketing'],parts={};let previous=-1;
 for(let index=0;index<areas.length;index++){
  const start=section.indexOf(areas[index]+' ',previous+1);assert(start>previous,'The primary degree must list the four separate business areas.');
  const end=index===areas.length-1?section.length:section.indexOf(areas[index+1]+' ',start+areas[index].length);
  assert(end>start,'The next business-area boundary is required.');parts[areas[index].toLowerCase()]=section.slice(start,end);previous=start;
 }
 for(const course of GENERAL_MANAGEMENT_AREA)assert(parts[course.businessArea].includes(course.code+' '+course.title+' 3'),course.code+' must be a named three-credit choice in its published discipline.');
 assert(new Set(GENERAL_MANAGEMENT_AREA.map(course=>course.businessArea)).size>=3);
 return true;
}

function assertCourseEvidence(course,body){
 const text=norm(body),identity=course.code+' '+course.title,section=text.slice(text.lastIndexOf(identity));
 assert(text.includes(identity),course.code+': exact primary course identity');
 assert(/\bCredits 3(?:\s|$)/.test(section),course.code+': exact original university credit quantity');
 assert(/\bDelivery Methods\b[\s\S]*\bOnline\b/.test(section),course.code+': current online delivery');
 const prerequisite=section.match(/\bPrerequisites?\b\s+([\s\S]*?)(?:\bDelivery Methods\b|\bAdvisory:|$)/i)?.[1]?.trim();
 if(course.prerequisites){assert.equal(prerequisite,'MAN-2100',course.code+': retain the actual formal prerequisite');assert(section.includes('grade of C or better'),course.code+': retain the separate grade advisory');}
 else assert.equal(prerequisite,undefined,course.code+': a changed formal prerequisite needs a new sequence review');
 if(course.code==='MAN-3110')assert(section.includes('PSY-3610')&&section.includes('depending on the degree program'), 'Retain the source-dependent classification advisory.');
 return true;
}

/** Accepts retained primary source objects, never web-search summaries. */
export async function createTESUGeneralManagementProgram({sources,tuitionComparison}={}){
 assert(Array.isArray(sources),'Provide the retained primary degree and six course sources.');
 const lookup=url=>{const matches=sources.filter(source=>sameURL(source.url,url));assert.equal(matches.length,1,'One exact primary source is required for '+url);return matches[0];};
 const degree=await reviewedTESUBusinessSource(lookup(GENERAL_MANAGEMENT_URL));assertGeneralManagementAreaEvidence(degree.body);
 const reviewedCourses=new Map();
 for(const course of GENERAL_MANAGEMENT_AREA){const reviewed=await reviewedTESUBusinessSource(lookup(courseURL(course)));assertCourseEvidence(course,reviewed.body);reviewedCourses.set(course.code,reviewed);}
 const shared=await createTESUBusinessBlocks({slug:GENERAL_MANAGEMENT_SLUG,title:GENERAL_MANAGEMENT_TITLE,degreeSource:degree.source,degreeBody:degree.body}),gradeSources=shared.modelFields.gradePolicy.sourceIds;
 const area=GENERAL_MANAGEMENT_AREA.map(course=>{
  const source=reviewedCourses.get(course.code).source,row={id:requirementID(course.code),code:course.code,title:course.title,credits:3,category:'major',group:'area-of-study',subgroup:'area-of-study',businessArea:course.businessArea,upper:true,institutionalOnly:false,minimumGrade:'C',minimumGradeSourceIds:[...gradeSources],sourceIds:[degree.source.id,source.id]};
  if(course.prerequisites)Object.assign(row,{prerequisites:[...course.prerequisites],prerequisiteSourceIds:[source.id],prerequisiteNotes:'MAN-2100 is the published formal prerequisite. The separate advisory recommends knowledge equivalent to Principles of Management with C or better.'});
  else row.prerequisiteNotes='No formal prerequisite block appears in the retained current course body; no additional prerequisite is invented.';
  if(course.code==='MAN-3110')row.notes='This General Management catalog explicitly lists MAN-3110 as Management. The course’s PSY-3610 classification in other degrees is not a second course or an additional credit award.';
  row.optionRows=[namedTESUUniversityOption(row)];
  const delivery=reviewedCourses.get(course.code).body.split('Delivery Methods')[1]?.split('Example Syllabus Link')[0];
  assert(delivery,course.code+': retain the complete delivery section');
  Object.assign(row.optionRows[0].inline,{url:source.url,deliveryMethods:delivery.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),deliveryMethodSourceIds:[source.id]});
  return row;
 });
 const common=shared.requirements.filter(row=>!row.freeElective),free=shared.requirements.filter(row=>row.freeElective),areaIds=area.map(row=>row.id),modelFields=shared.modelFields;
 modelFields.sourceIds=[degree.source.id];
 modelFields.existingCreditReview.groups[0].requirementIds=areaIds;
 modelFields.businessAreaSelection={kind:'fixed-source-reviewed-selection',sourceIds:[degree.source.id],areaCredits:18,minimumAreas:3,allowedAreas:['accounting','finance','management','marketing'],minimumUpperCredits:12,selectedRequirementIds:areaIds,selectedAreas:['management','finance','marketing']};
 modelFields.policyEvidence.businessAreaSelection={value:3,sourceIds:[degree.source.id],scope:'The fixed six named area courses represent Management, Finance and Marketing. Accounting is permitted by the catalog but is not required in this selected route.'};
 const freeSection=modelFields.curriculumSections.findIndex(section=>section.parentId==='elective');
 modelFields.curriculumSections.splice(freeSection<0?modelFields.curriculumSections.length:freeSection,0,{id:'tesu-bs-general-management-area',title:'General Management — three business disciplines',parentId:'major',requirementIds:areaIds,sourceId:degree.source.id});
 modelFields.rulesNotes.push('The selected area contains two Management, two Finance and two Marketing courses, satisfying the published minimum of three of the four permitted business areas. All 18 selected area credits are upper level.','ACC-4010 and ACC-2010 are not selected in this route. The five elective slots remain unrestricted; no prerequisite is removed from a course that remains selected.','MAN-3110 may count once, in the area of study. Its original outside course cannot also fill a free elective. MAN-3310 follows the already required MAN-2100 business-core course.');
 const binding=buildTESUBusinessTuitionBinding({modelId:GENERAL_MANAGEMENT_ID,catalogIdentity:modelFields.catalogIdentity},await loadTESUBusinessPriceBasis());
 if(tuitionComparison)assert.deepEqual(tuitionComparison,binding.tuitionComparison,'An external packet cannot replace the independently dated price binding.');
 modelFields.tuitionComparison=binding.tuitionComparison;
 const program={kind:'pathway-kit-program',version:1,slug:GENERAL_MANAGEMENT_SLUG,modelId:GENERAL_MANAGEMENT_ID,routeIds:[GENERAL_MANAGEMENT_ROUTE],title:GENERAL_MANAGEMENT_TITLE,level:'bachelor',catalog:TESU_BUSINESS_CATALOG,totalCredits:120,modalities:['online'],review:{status:'reviewed',reviewedOn:TESU_BUSINESS_REVIEW_DATE,reviewer:'DegreeSteps source review',reviewId:REVIEW,source:'Retained exact current General Management degree and six current university course bodies.'},policies:shared.policies,modelFields,requirements:[...common,...area,...free]};
 program.modelSourceIds=unique([...shared.modelSourceIds,...binding.modelSourceIds,...sourceRefs({requirements:program.requirements,modelFields}).map(ref=>ref.id)]);
 assertTESUGeneralManagementProgram(program);return {program,sources:[degree.source,...[...reviewedCourses.values()].map(review=>review.source),...binding.sources]};
}

/** Validate fixed degree facts while allowing independently reviewed shared
 * receiving awards and price bindings to be layered onto the named rows. */
export function assertTESUGeneralManagementProgram(program){
 assert.equal(program.slug,GENERAL_MANAGEMENT_SLUG);assert.equal(program.modelId,GENERAL_MANAGEMENT_ID);assert.deepEqual(program.routeIds,[GENERAL_MANAGEMENT_ROUTE]);assert.equal(program.title,GENERAL_MANAGEMENT_TITLE);assert.equal(program.catalog,TESU_BUSINESS_CATALOG);
 const rows=list(program.requirements),area=rows.filter(row=>row.group==='area-of-study'),selected=new Map(area.map(row=>[row.code,row]));
 assert.equal(program.totalCredits,120);assert.equal(rows.length,40);assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(new Set(rows.map(row=>row.id)).size,40);
 assert.equal(rows.filter(row=>row.category==='general').reduce((sum,row)=>sum+row.credits,0),45);assert.equal(rows.filter(row=>row.group==='business-core').reduce((sum,row)=>sum+row.credits,0),42);assert.equal(rows.filter(row=>row.freeElective).reduce((sum,row)=>sum+row.credits,0),15);
 assert.equal(area.length,6);assert.equal(selected.size,6);assert.equal(new Set(area.map(row=>row.businessArea)).size,3);assert.equal(area.reduce((sum,row)=>sum+row.credits,0),18);assert(area.filter(row=>row.upper).reduce((sum,row)=>sum+row.credits,0)>=12);
 for(const course of GENERAL_MANAGEMENT_AREA){const row=selected.get(course.code);assert(row,course.code+' remains selected');assert.equal(row.id,requirementID(course.code));assert.equal(row.title,course.title);assert.equal(row.businessArea,course.businessArea);assert.equal(row.credits,3);assert.equal(row.upper,true);assert.equal(row.minimumGrade,'C');assert.deepEqual(row.prerequisites,course.prerequisites);}
 assert(!rows.some(row=>row.code==='ACC-4010'||row.code==='ACC-2010'),'No Accounting-dependent area course or reserved prerequisite occupies the new route.');
 assert.deepEqual(program.modelFields.businessAreaSelection.selectedRequirementIds,area.map(row=>row.id));assert.equal(program.modelFields.businessAreaSelection.minimumAreas,3);assert.equal(program.modelFields.businessAreaSelection.minimumUpperCredits,12);
 assert(program.modelFields.upperGroupMinimums.some(rule=>rule.group==='area-of-study'&&rule.credits===12));
 assert.deepEqual(program.modelFields.existingCreditReview.groups[0].requirementIds,area.map(row=>row.id));
 return true;
}

export async function writeTESUGeneralManagementProgram({sourcePacket='content/pathway-kits/tesu/business-course-sources-2026-11-26.json',check=false}={}){
 const packet=JSON.parse(await readFile(resolve(root,sourcePacket),'utf8')),sources=Array.isArray(packet.sources)?packet.sources:[...list(packet.courses).map(course=>course.source),...Object.values(packet.degreeSources||{})],{program}=await createTESUGeneralManagementProgram({sources,tuitionComparison:packet.tuitionComparison});
 let existing;try{existing=JSON.parse(await readFile(resolve(root,GENERAL_MANAGEMENT_PATH),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(check){
  assert(existing,'The authored General Management program is missing.');assertTESUGeneralManagementProgram(existing);
  const academic=value=>{const out=structuredClone(value);delete out.modelSourceIds;delete out.modelFields.sourceIds;for(const row of out.requirements)delete row.optionRows;return out;};
  assert.deepEqual(academic(existing),academic(program),'The authored General Management academic facts remain exactly source-bound.');
  const kit=await loadKit(resolve(root,'content/pathway-kits/tesu')),knownSources=new Set(sourceIndex(kit,existing).keys());
  for(const row of program.requirements){const actual=existing.requirements.find(candidate=>candidate.id===row.id);assert.deepEqual(actual.optionRows.filter(option=>option.inline?.provider==='University'),row.optionRows,row.id+': named university choices preserve their real primary source and delivery methods');}
  for(const id of program.modelSourceIds)assert(existing.modelSourceIds.includes(id),'The authored program retains its real source '+id);
  for(const id of existing.modelSourceIds)assert(knownSources.has(id),'An enrichment source must exist in the reviewed source registry: '+id);
 }else{
  if(existing){
   for(const row of program.requirements){const actual=existing.requirements.find(candidate=>candidate.id===row.id);if(actual)row.optionRows.push(...structuredClone(actual.optionRows.filter(option=>option.inline?.provider!=='University')));}
   program.modelSourceIds=unique([...program.modelSourceIds,...existing.modelSourceIds]);
   program.modelFields.sourceIds=unique([...program.modelFields.sourceIds,...list(existing.modelFields.sourceIds)]);
  }
  await writeFile(resolve(root,GENERAL_MANAGEMENT_PATH),JSON.stringify(program,null,2)+'\n');
 }
 return {modelId:program.modelId,routeId:GENERAL_MANAGEMENT_ROUTE,degreeCredits:120,areaCredits:18,selectedBusinessAreas:['management','finance','marketing'],sourceBodiesReviewed:7,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),at=args.indexOf('--source-packet');console.log(JSON.stringify(await writeTESUGeneralManagementProgram({sourcePacket:at>=0?args[at+1]:undefined,check:args.includes('--check')})));}
