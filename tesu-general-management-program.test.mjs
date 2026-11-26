import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GENERAL_MANAGEMENT_AREA,GENERAL_MANAGEMENT_ID,GENERAL_MANAGEMENT_ROUTE,GENERAL_MANAGEMENT_SLUG,GENERAL_MANAGEMENT_TITLE,assertGeneralManagementAreaEvidence,assertTESUGeneralManagementProgram,createTESUGeneralManagementProgram} from './scripts/tesu-general-management-program.mjs';
import {TESU_BUSINESS_CATALOG} from './scripts/tesu-business-blocks.mjs';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import Planner from './dist/planner.js';
const copy=structuredClone;
function academicFixture(){
 const ordinary=(prefix,count,fields)=>Array.from({length:count},(_,index)=>({id:prefix+index,title:'Synthetic '+prefix+' '+index,credits:3,...fields}));
 const area=GENERAL_MANAGEMENT_AREA.map(course=>({id:course.code.toLowerCase().replace('-',''),code:course.code,title:course.title,credits:3,group:'area-of-study',category:'major',businessArea:course.businessArea,upper:true,minimumGrade:'C',...(course.prerequisites?{prerequisites:[...course.prerequisites]}:{})})),areaIds=area.map(row=>row.id);
 return {slug:GENERAL_MANAGEMENT_SLUG,modelId:GENERAL_MANAGEMENT_ID,routeIds:[GENERAL_MANAGEMENT_ROUTE],title:GENERAL_MANAGEMENT_TITLE,catalog:TESU_BUSINESS_CATALOG,totalCredits:120,requirements:[...ordinary('general',15,{category:'general'}),...ordinary('core',14,{category:'major',group:'business-core'}),...area,...ordinary('free',5,{freeElective:true,group:'free-electives'})],modelFields:{businessAreaSelection:{selectedRequirementIds:areaIds,minimumAreas:3,minimumUpperCredits:12},upperGroupMinimums:[{group:'area-of-study',credits:12}],existingCreditReview:{groups:[{requirementIds:areaIds}]}}};
}
const areaBody=()=>GENERAL_MANAGEMENT_TITLE+' III. Area of Study (18 Credits) Select 18 credits from the following areas. A minimum of three of the four areas must be represented: Accounting ACC-4010 Advanced Accounting I 3 Finance '+GENERAL_MANAGEMENT_AREA.filter(course=>course.businessArea==='finance').map(course=>course.code+' '+course.title+' 3').join(' ')+' Management '+GENERAL_MANAGEMENT_AREA.filter(course=>course.businessArea==='management').map(course=>course.code+' '+course.title+' 3').join(' ')+' Marketing '+GENERAL_MANAGEMENT_AREA.filter(course=>course.businessArea==='marketing').map(course=>course.code+' '+course.title+' 3').join(' ')+' IV. Electives (15 Credits)';

test('area authoring checks the named courses inside their published disciplines and exact degree boundaries',()=>{
 assert(assertGeneralManagementAreaEvidence(areaBody()));
 for(const body of [areaBody().replace('A minimum of three','A minimum of two'),areaBody().replace('MKT-4790 Applied Marketing Practices 3','MKT-4790 Applied Marketing Practices 4'),areaBody().replace('Marketing MKT-4110','Marketing unrelated MKT-9999').replace('MKT-4790','MKT-9998'),areaBody().replace('IV. Electives (15 Credits)','IV. Electives (12 Credits)')])assert.throws(()=>assertGeneralManagementAreaEvidence(body));
});
test('the exact named area spans three disciplines, keeps the real prerequisite and releases all five free electives',()=>{
 const program=academicFixture(),before=copy(program);assert(assertTESUGeneralManagementProgram(program));assert.deepEqual(program,before);
 const area=program.requirements.filter(row=>row.group==='area-of-study');assert.deepEqual([...new Set(area.map(row=>row.businessArea))],['management','finance','marketing']);assert.equal(area.reduce((sum,row)=>sum+(row.upper?row.credits:0),0),18);assert.deepEqual(area.find(row=>row.code==='MAN-3310').prerequisites,['man2100']);
 assert.equal(program.requirements.filter(row=>row.freeElective).length,5);assert(!program.requirements.some(row=>['ACC-2010','ACC-4010'].includes(row.code)));
});
test('fixed-selection validation rejects false disciplines, weakened upper rules, missing sequence and unrelated legacy identity',()=>{
 const changes=[
  program=>{program.requirements.find(row=>row.code==='MKT-4110').businessArea='management';},
  program=>{program.requirements.find(row=>row.code==='FIN-3310').code='ACC-4010';},
  program=>{delete program.requirements.find(row=>row.code==='MAN-3310').prerequisites;},
  program=>{program.requirements.find(row=>row.code==='MAN-3110').upper=false;},
  program=>{program.requirements.find(row=>row.code==='MAN-3110').credits=4;},
  program=>{program.modelFields.businessAreaSelection.minimumAreas=2;},
  program=>{program.modelFields.businessAreaSelection.minimumUpperCredits=9;},
  program=>{program.modelFields.upperGroupMinimums=[];},
  program=>{program.modelFields.existingCreditReview.groups[0].requirementIds=[];},
  program=>{program.modelId='tesu-general-management';},
  program=>{program.routeIds=['tesu-general-management'];}
 ];
 for(const [index,change]of changes.entries()){const program=academicFixture();change(program);assert.throws(()=>assertTESUGeneralManagementProgram(program),undefined,'Academic mutation '+index);}
});

const primarySources=async()=>{const packet=JSON.parse(await readFile(new URL('./content/pathway-kits/tesu/business-course-sources-2026-11-26.json',import.meta.url),'utf8'));return [...packet.courses.map(course=>course.source),...Object.values(packet.degreeSources)];};
test('actual retained degree and six course bodies produce a complete ledger without sacrificing a prerequisite or elective',async()=>{
 const {program,sources}=await createTESUGeneralManagementProgram({sources:await primarySources()});
 assert.equal(program.requirements.length,40);assert.equal(program.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 assert.equal(program.requirements.filter(row=>row.freeElective).length,5);
 const rows=new Map(program.requirements.map(row=>[row.code,row]));
 assert.deepEqual(rows.get('MAN-3310').prerequisites,['man2100']);assert.equal(rows.get('MAN-2100').id,'man2100');
 assert.equal(program.requirements.filter(row=>row.code==='MAN-3110').length,1);
 assert.deepEqual(rows.get('FIN-3310').optionRows[0].inline.deliveryMethods,['Online','TECEP']);
 for(const course of GENERAL_MANAGEMENT_AREA){
  const row=rows.get(course.code),source=sources.find(source=>row.sourceIds.includes(source.id)&&source.id.includes('-course-'));
  assert(source?.toolResponseReceipt?.sha256,course.code+' retains the independently pinned native receipt');
  assert.equal(row.optionRows[0].inline.url,source.url);
  assert.deepEqual(row.optionRows[0].inline.deliveryMethodSourceIds,[source.id]);
  assert.equal(row.optionRows[0].inline.evidence,'published');
 }
 assert.equal(program.modelFields.catalogIdentity.checkedOn,'2026-11-26');
 assert.equal(program.modelFields.catalogIdentity.sourceId,'tesu-business-degree-general-management-20261126');
 assert.equal(sources.find(source=>source.id==='tesu-tuition-2026-11-25').checkedOn,'2026-11-25','An academic review does not rewrite the independently dated price source');
 assert(!program.requirements.some(row=>['ACC-2010','ACC-4010'].includes(row.code)));
});
test('real authoring rejects missing or duplicate source identity and tampered primary content pins',async()=>{
 const sources=await primarySources(),degree=sources.find(source=>source.id==='tesu-business-degree-general-management-20261126'),man=sources.find(source=>source.id==='tesu-business-course-man-3310-20261126');
 await assert.rejects(createTESUGeneralManagementProgram({sources:sources.filter(source=>source.id!==man.id)}),/One exact primary source/);
 await assert.rejects(createTESUGeneralManagementProgram({sources:[...sources,copy(degree)]}),/One exact primary source/);
 await assert.rejects(createTESUGeneralManagementProgram({sources:sources.map(source=>source.id===man.id?{...source,sourceContentHash:'0'.repeat(64)}:source)}),/independently pinned sourceContentHash/);
});
test('the actual reviewed shared awards build an executable published baseline while conditional UPI remains held',async()=>{
 const kit=await loadKit(new URL('./content/pathway-kits/tesu',import.meta.url).pathname),program=kit.programs.find(program=>program.modelId===GENERAL_MANAGEMENT_ID),model=compileProgram(kit,program),route={...kit.school.publish.documents.flatMap(document=>document.routes||[]).find(route=>route.id===GENERAL_MANAGEMENT_ROUTE),modelId:model.id};
 const preferences={providers:[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))],priority:'transfer',completed:[],optimizationNodeBudget:12000};
 const plan=Planner.generate(model,{...preferences,allowConditional:false}),quality=assessPathwayQuality({model,plan,route,asOf:'2026-11-26'});
 assert.equal(quality.publication.ready,true,JSON.stringify(quality.publication.reasonCodes));assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);
 assert(plan.totals.external>=66,'The selected three-discipline area frees the fifth elective for an independently published outside award');assert.equal(plan.totals.external+plan.totals.institutional,120);assert.equal(plan.totals.reported,0);assert.equal(plan.totals.confirmed,0);assert.equal(plan.sequence.filter(step=>step.executionBlocked).length,0);
 const freeIds=new Set(model.requirements.filter(row=>row.freeElective).map(row=>row.id)),free=plan.rows.filter(row=>freeIds.has(row.requirementId));
 assert.equal(free.length,5);assert.equal(free.reduce((sum,row)=>sum+(row.institutional?0:row.credits),0),15);assert(free.every(row=>row.option.receivingCode!=='MAN-3110'));
 const behavior=plan.rows.find(row=>row.requirementId==='man3110');assert.equal(behavior.option.receivingCode,'MAN-3110');assert.equal(behavior.option.evidence,'published');assert.equal(plan.rows.filter(row=>row.option?.provider===behavior.option.provider&&row.option.code===behavior.option.code).length,1);
 const unsupported=Planner.generate(model,{...preferences,allowConditional:true}),research=assessPathwayQuality({model,plan:unsupported,route,asOf:'2026-11-26'});
 assert.equal(research.publication.ready,false);assert(research.publication.reasonCodes.includes('conditional-award'));assert(research.metrics.conditionalOutsideCredits>0);assert.equal(research.metrics.publishedOutsideCredits,quality.metrics.publishedOutsideCredits);
});
