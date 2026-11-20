import test from 'node:test';
import assert from 'node:assert/strict';
import Planner from '../dist/planner.js';
import {composeSharedAwards,validateSharedAwardBundle}from'./shared-award-composition.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const asOf='2026-11-20';
function fixture(){
 const source=(id,kind,roles,url,school)=>({id,kind,roles,url,checkedOn:'2026-11-19',sourceContentHash:'sha256:'+'a'.repeat(64),...(school?{scope:{schoolName:school,catalogYear:'2026-2027',modality:'online',levels:['associate','bachelor']}}:{})});
 const sources=[source('provider','provider',['provider-identity'],'https://provider.example/course/'),source('ace','ace',['provider-identity'],'https://acenet.example/course/version-4/'),source('guide','university',['receiving-map'],'https://school.example/transfer/','Example University'),source('degree','university',['curriculum'],'https://school.example/catalog/degree/','Example University'),source('scope','university',['policy'],'https://school.example/policies/transfer/','Example University')];
 const model=id=>({id,school:'Example University',title:'Example Bachelor',format:'Online',level:'bachelor',catalog:'2026-2027',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,alternativeMaxCredits:9,upperMinCredits:0,sources:copy(sources),learning:[{id:'private-existing-record',status:'earned'}],requirements:[{id:'english',code:'ENG101',title:'English',credits:3,category:'general',sourceIds:['degree'],options:[{id:'uni-english',provider:'University',code:'ENG101',title:'English',credits:3,creditSystem:'semester',sourceIds:['degree'],evidence:'published'}]},{id:'elective-one',title:'Free elective1',freeElective:true,selectionRequired:true,credits:3,category:'electives',sourceIds:['degree'],options:[{id:'uni-elective-one',provider:'University',code:'HIS110',title:'History',credits:3,creditSystem:'semester',sourceIds:['degree'],evidence:'published'}]},{id:'elective-two',title:'Free elective2',freeElective:true,selectionRequired:true,credits:3,category:'electives',sourceIds:['degree'],options:[{id:'uni-elective-two',provider:'University',code:'ART110',title:'Art',credits:3,creditSystem:'semester',sourceIds:['degree'],evidence:'published'}]},{id:'capstone',code:'CAP401',title:'Capstone',credits:3,category:'major',institutionalOnly:true,sourceIds:['degree'],options:[{id:'uni-capstone',provider:'University',code:'CAP401',title:'Capstone',credits:3,creditSystem:'semester',sourceIds:['degree'],evidence:'published',upper:true}]}]});
 const course=(id,code)=>({id,provider:'Sophia',code,title:id,courseVersion:'4',sourceCredits:3,sourceCreditSystem:'semester',sourceUpper:false,recommendationStart:'2024-01-01',recommendationEnd:'2027-12-31',identitySourceIds:['provider','ace'],recommendationPeriodSourceIds:['ace'],url:'https://provider.example/course/'+id,eligibilityReview:{eligibleToStart:true,status:'current-provider-version-reviewed'}});
 const scope={school:'Example University',catalog:'2026-2027',modality:'online',level:'bachelor',programIds:['degree-a','degree-b']};
 const award=(id,providerCourseId,receivingCode)=>({id,providerCourseId,receivingCode,credits:3,creditSystem:'semester',upper:false,evidence:'published',sourceIds:['guide'],scopeSourceIds:['scope'],scopeQuote:'The reviewed undergraduate guide applies to these exact online programs.',scope:copy(scope)});
 const bundle={version:1,id:'reviewed-shared-bundle',reviewStatus:'approved',checkedOn:asOf,sources:copy(sources),providerCourses:[course('english-current','SOPH-0001'),course('history-current','SOPH-0002')],awards:[award('english-award','english-current','ENG101'),award('history-award','history-current','HIS201')],placementRules:[{id:'exact-english',kind:'exact',modelIds:['degree-a','degree-b'],sourceIds:['degree']},{id:'free-pool',kind:'free-elective',modelIds:['degree-a','degree-b'],sourceIds:['degree']}]};
 return{models:[model('degree-a'),model('degree-b')],bundle};
}
const composed=(f=fixture())=>composeSharedAwards(f.models,f.bundle,{asOf});
const externals=model=>model.requirements.flatMap(row=>row.options.filter(option=>option.provider!=='University'));

test('one reviewed school award composes both exact general education and genuine free electives across degrees',()=>{
 const f=fixture(),before=JSON.stringify(f),{models,report}=composed(f);
 assert.equal(JSON.stringify(f),before);assert.equal(report.modelsChanged,2);assert.equal(report.addedOptions,6);assert.equal(report.studentCreditsAwarded,0);assert.equal(report.publicationDecisionsMade,0);
 for(const model of models){assert.equal(model.totalCredits,12);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),12);assert.equal(model.institutionMinCredits,3);assert.equal(model.externalMaxCredits,9);assert.deepEqual(model.learning,f.models[0].learning);assert.equal(model.requirements[3].options.length,1);assert.equal(externals(model).length,3);const english=model.requirements[0].options[1];assert.equal(english.code,'SOPH-0001');assert.equal(english.receivingCode,'ENG101');assert.equal(english.sourceCredits,3);assert.equal(english.degreePlacementEvidence.modelId,model.id);assert.equal(english.degreePlacementEvidence.requirementId,'english');assert.equal(model.requirements[1].selectionRequired,false);}
});

test('composition is deterministic and idempotent while IDs and original university choices remain stable',()=>{
 const f=fixture(),first=composed(f),second=composeSharedAwards(first.models,f.bundle,{asOf});
 assert.deepEqual(first.models,composed(f).models);assert.deepEqual(second.models,first.models);assert.equal(second.report.addedOptions,0);assert.equal(second.report.updatedOptions,0);
 for(let i=0;i<f.models.length;i++)for(let j=0;j<f.models[i].requirements.length;j++)assert.deepEqual(first.models[i].requirements[j].options[0],f.models[i].requirements[j].options[0]);
});

test('scope prevents inheritance across school, catalog, delivery, degree level, receiving units, excluded or unlisted programs',()=>{
 for(const change of [model=>model.school='Another University',model=>model.catalog='2027-2028',model=>model.format='Residential',model=>model.level='master',model=>model.creditSystem='competency-unit',model=>model.id='unlisted-degree']){
  const f=fixture();change(f.models[0]);const before=copy(f.models[0]),{models}=composed(f);assert.deepEqual(models[0],before);
 }
 const f=fixture();for(const award of f.bundle.awards)award.scope={...award.scope,programIds:undefined,allPrograms:true,excludedProgramIds:['degree-b']};const {models}=composed(f);assert(externals(models[0]).length);assert.equal(externals(models[1]).length,0);
});

test('scope approval, authority, independent source quantities, captured bytes and source extracts are mandatory',()=>{
 for(const mutate of [f=>f.bundle.reviewStatus='candidate-only',f=>delete f.bundle.sources[0].sourceContentHash,f=>f.bundle.sources[0].checkedOn='2026-02-30',f=>f.bundle.sources[0].checkedOn='2026-11-21',f=>f.bundle.sources[0].url='http://provider.example/',f=>f.bundle.awards[0].scopeQuote='maybe',f=>f.bundle.awards[0].scopeSourceIds=[],f=>f.bundle.sources.find(s=>s.id==='scope').scope.schoolName='Another University',f=>f.bundle.providerCourses[0].identitySourceIds=['guide'],f=>delete f.bundle.providerCourses[0].courseVersion,f=>f.bundle.providerCourses[0].sourceCredits='3',f=>f.bundle.providerCourses[0].receivingCode='ENG101',f=>f.bundle.providerCourses[0].eligibilityReview.eligibleToStart=false,f=>f.bundle.awards[0].sourceIds=['provider'],f=>f.bundle.sources[0].url=f.bundle.sources.find(s=>s.id==='guide').url]){
  const f=fixture();mutate(f);assert.throws(()=>composed(f));
 }
});

test('expired and future provider versions stay held rather than becoming current outside options',()=>{
 for(const mutate of [course=>course.recommendationEnd='2026-11-19',course=>course.recommendationStart='2026-11-21']){const f=fixture();f.bundle.providerCourses.forEach(mutate);const {models,report}=composed(f);assert.equal(report.addedOptions,0);assert(report.held.every(item=>item.reason==='inactive-provider-version'));assert(models.every(model=>externals(model).length===0));}
});

test('elective placement respects department, upper-level, numeric bounds and restricted major slots',()=>{
 for(const edit of [row=>row.allowedCoursePrefixes=['PSYC'],row=>row.upperOnly=true,row=>row.upper=true,row=>row.minCourseLevel=300,row=>row.maxCourseLevel=100,row=>row.minCourseLevel='200',row=>row.category='major',row=>row.freeElective=false,row=>row.majorElective=true,row=>row.institutionalOnly=true,row=>row.researchGap=true,row=>row.code='PSYC201']){
  const f=fixture();edit(f.models[0].requirements[1]);const {models}=composed(f);assert.equal(models[0].requirements[1].options.length,1);
 }
 const f=fixture();f.models[0].requirements[1].allowedCoursePrefixes=['HIS'];f.models[0].requirements[1].minCourseLevel=200;assert.equal(composed(f).models[0].requirements[1].options.length,2);
});

test('fixed receiving courses cannot be packed again into free electives',()=>{
 const f=fixture();f.bundle.awards[1].receivingCode='ENG101';const {models}=composed(f);assert.equal(models[0].requirements[1].options.length,1);assert.equal(models[0].requirements[2].options.length,1);
});

test('the real optimizer keeps residency and prevents one learning action from filling multiple elective slots',()=>{
 const {models}=composed(),model=models[0];
 const plan=Planner.generate(model,{providers:['Sophia'],allowConditional:false,priority:'transfer',completed:[]});
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.required,12);assert.equal(plan.totals.accounted,12);assert.equal(plan.totals.external,6);assert.equal(plan.totals.institutional,6);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 const selected=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(selected.map(row=>row.option.provider+'|'+row.option.code)).size,selected.length);
 const allSelected=Object.fromEntries(model.requirements.filter(row=>row.options.length>1).map(row=>[row.id,row.options[1].id]));const duplicate=Planner.generate(model,{providers:['Sophia'],allowConditional:false,priority:'transfer',completed:[],optionSelections:allSelected});assert.equal(duplicate.validation.academicCountsValid,false);assert(duplicate.validation.errors.some(error=>error.code==='duplicate_source'||error.code==='duplicate_receiving_course'));
 const restricted=copy(model);restricted.institutionMinCredits=9;const conservative=Planner.generate(restricted,{providers:['Sophia'],allowConditional:false,priority:'transfer',completed:[]});assert(conservative.totals.institutional>=9);assert.equal(conservative.validation.academicCountsValid,true);
});

test('source and receiving quantities remain separate for a reviewed competency-unit award',()=>{
 const f=fixture();for(const model of f.models)model.creditSystem='competency-unit';for(const award of f.bundle.awards)award.creditSystem='competency-unit';f.bundle.awards[0].credits=4;
 for(const model of f.models){model.totalCredits=13;model.requirements[0].credits=4;model.requirements[0].options[0].credits=4;for(const row of model.requirements)row.options[0].creditSystem='competency-unit';}
 const {models}=composed(f),option=models[0].requirements[0].options[1];assert.equal(option.credits,4);assert.equal(option.creditSystem,'competency-unit');assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');
});

test('existing student selections retain IDs, published alternatives remain intact, and conflicting versions are not silently rewritten',()=>{
 const f=fixture(),base=composed(f).models[0].requirements[0].options[1];base.id='existing-option';base.evidence='conditional';delete base.sharedAwardProvenance;f.models[0].requirements[0].options.push(copy(base));f.models[0].selectedOptionId='existing-option';const updated=composed(f).models[0];assert.equal(updated.requirements[0].options.at(-1).id,'existing-option');assert.equal(updated.requirements[0].options.at(-1).evidence,'published');assert.equal(updated.selectedOptionId,'existing-option');
 const published=fixture();base.evidence='published';base.conditions=['This major needs a B or higher and written preapproval.'];published.models[0].requirements[0].options.push(copy(base));const retained=composed(published).models[0].requirements[0].options[1];assert.equal(retained.id,base.id);assert(retained.conditions.includes(base.conditions[0]));
 for(const change of [option=>option.courseVersion='5',option=>option.sourceCredits=4,option=>option.sourceCreditSystem='quarter',option=>option.recommendationEnd='2026-11-19',option=>option.eligibilityReview={eligibleToStart:false,status:'not-eligible'}]){const f=fixture(),value=copy(base);value.evidence='conditional';change(value);f.models[0].requirements[0].options.push(value);const {models,report}=composed(f);assert.deepEqual(models[0].requirements[0].options[1],value);assert(report.held.some(item=>item.reason==='conflicting-existing-provider-fact'));}
});

test('invalid numeric policies and private models remain unchanged; no numeric cap is inferred',()=>{
 for(const change of [model=>model.externalMaxCredits='9',model=>model.institutionMinCredits=13,model=>model.alternativeMaxCredits=NaN,model=>model.majorInstitutionFraction=.25,model=>model.auditProvenance={status:'student-provided'}]){const f=fixture();change(f.models[0]);const before=copy(f.models[0]),{models,report}=composed(f);assert.deepEqual(models[0],before);assert(report.held.some(item=>item.modelId===before.id));}
 const f=fixture();delete f.models[0].alternativeMaxCredits;const {models}=composed(f);assert.equal(models[0].alternativeMaxCredits,undefined);assert.equal(models[0].requirements.reduce((sum,row)=>sum+row.credits,0),12);
});

test('bad placement references, missing degree evidence and conflicting source IDs fail closed while compatible aliases retain IDs',()=>{
 const unknown=fixture();unknown.bundle.placementRules[0].awardIds=['unknown'];assert.throws(()=>composed(unknown));
 const missing=fixture();missing.bundle.placementRules[0].sourceIds=['missing'];assert.throws(()=>composed(missing));
 const rowMissing=fixture();rowMissing.models[0].requirements[0].sourceIds=['missing'];assert.equal(composed(rowMissing).models[0].requirements[0].options.length,1);
 const conflict=fixture();conflict.models[0].sources[0].url='https://different.example/source';assert.throws(()=>composed(conflict),/conflicts/);
 const f=fixture(),option=composed(f).models[0].requirements[0].options[1];option.evidence='conditional';delete option.sharedAwardProvenance;f.models[0].requirements[0].options.push({...option,id:'old-one'},{...option,id:'old-two'});const {models,report}=composed(f);assert.equal(models[0].requirements[0].options.length,3);assert.equal(report.held.some(item=>item.reason==='ambiguous-existing-option'),false);assert.deepEqual(models[0].requirements[0].options.slice(1).map(o=>o.id),['old-one','old-two']);assert(models[0].requirements[0].options.slice(1).every(o=>o.evidence==='published'));assert.equal(models[0].requirements[0].options[1].sharedAwardProvenance.awardId,'english-award');
});


test('receiving source scope cannot silently broaden to another catalog, modality or degree level',()=>{
 for(const edit of [scope=>scope.catalogYear='2027-2028',scope=>scope.modality='campus',scope=>scope.levels=['master'],scope=>delete scope.levels]){const f=fixture();edit(f.bundle.sources.find(source=>source.id==='guide').scope);assert.throws(()=>composed(f),/receiving institution/);}
 const f=fixture();f.bundle.sources.find(source=>source.id==='scope').scope.catalogYear='2027-2028';assert.throws(()=>composed(f),/scope evidence/);
});

test('a contradictory false eligibility flag stays held even when its label sounds complete',()=>{
 const f=fixture(),option=composed(f).models[0].requirements[0].options[1];option.evidence='conditional';option.eligibilityReview={eligibleToStart:false,status:'provider-active-review-complete'};delete option.sharedAwardProvenance;f.models[0].requirements[0].options.push(option);const {models,report}=composed(f);assert.deepEqual(models[0].requirements[0].options[1],option);assert(report.held.some(item=>item.reason==='conflicting-existing-provider-fact'));
});


test('an unrestricted-looking elective cannot bypass unsupported laboratory, writing or distribution conditions',()=>{
 for(const extra of [{requiresLab:true},{writingIntensive:true},{requiresWritingIntensive:true},{liberalArtsAllocation:{minimum:3}},{liberalArtsOnly:true},{allowedCreditOrigins:['institutional']},{excludedCourseCodes:['HIS201']},{requiredCourseAttributes:['writing-intensive']}]){
  const f=fixture();Object.assign(f.models[0].requirements[1],extra);assert.equal(composed(f).models[0].requirements[1].options.length,1,JSON.stringify(extra));
 }
 const f=fixture();f.models[0].requirements[0].minimumGrade='B';const choice=composed(f).models[0].requirements[0].options[1];assert(choice.conditions.some(value=>value.includes('B or higher')));
});


test('scope proof remains a compiled dependency and optional quantity evidence cannot reference receiving maps or unknown sources',()=>{
 const f=fixture(),choice=composed(f).models[0].requirements[0].options[1];assert(choice.sourceIds.includes('scope'));
 for(const evidence of [{sourceIds:['missing']},{sourceIds:['guide']},{sourceIds:['ace'],credits:4},{sourceIds:['ace'],creditSystem:'quarter'}]){const next=fixture();next.bundle.providerCourses[0].sourceCreditEvidence=evidence;assert.throws(()=>composed(next));}
});
