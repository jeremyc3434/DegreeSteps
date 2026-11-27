import test from 'node:test';
import assert from 'node:assert/strict';
import Planner from './dist/planner.js';
import {buildTransferMaximizationReport,assertNoValidatedTransferImprovements} from './scripts/build-transfer-maximization-report.mjs';

function fixture(){
 const sourceIds=['degree','map'],university=(id,code,title,upper=false)=>({id:'university-'+id,provider:'University',code,title,credits:3,upper,evidence:'published',sourceIds:['degree']}),outside=(id,code,receivingCode)=>({id,provider:'Sophia',code,title:code,receivingCode,credits:3,sourceCredits:3,sourceCreditSystem:'semester',creditOrigin:'alternative',courseVersion:1,recommendationStart:'2026-01-01',recommendationEnd:'2028-12-31',evidence:'published',sourceIds});
 const model={id:'degree',school:'Example University',title:'Exact Business Degree',level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,alternativeMaxCredits:9,upperMinCredits:3,policySourceIds:['degree'],sources:[{id:'degree',url:'https://example.edu/degree',checked:'2026-11-27'},{id:'map',url:'https://example.edu/transfer',checked:'2026-11-27'}],policyReview:[],unresolved:[],requirements:[
  {id:'one',code:'ENG101',title:'Writing',credits:3,category:'general',options:[outside('source-one','SOPH-0001','ENG101'),university('one','ENG101','Writing')]},
  {id:'two',code:'SOC101',title:'Society',credits:3,category:'general',options:[outside('source-two','SOPH-0002','SOC101'),university('two','SOC101','Society')]},
  {id:'three',code:'MAT101',title:'Mathematics',credits:3,category:'general',options:[outside('source-three','SOPH-0003','MAT101'),university('three','MAT101','Mathematics')]},
  {id:'capstone',code:'CAP400',title:'Capstone',credits:3,category:'major',institutionalOnly:true,upper:true,options:[university('capstone','CAP400','Capstone',true)]}
 ]};
 const selections=['source-one','source-two','university-three','university-capstone'];
 const rows=model.requirements.map((req,i)=>{const o=req.options.find(o=>o.id===selections[i]);return {requirementId:req.id,optionId:o.id,provider:o.provider,code:o.code,credits:3,status:'planned'};});
 const baseline={modelId:model.id,pathwayId:'route',qualityReady:true,summary:{totalCredits:12,transferCredits:6,universityCredits:6},rows};
 model.reviewedBaselineChoices={version:1,modelId:model.id,format:model.format,creditSystem:model.creditSystem,totalCredits:12,catalogYear:model.catalog,checkedOn:'2026-11-27',reviewId:'review',sourceIds:['degree'],optionSelections:Object.fromEntries(rows.map(r=>[r.requirementId,r.optionId]))};
 return {publication:{asOf:'2026-11-27',plans:[{modelId:'degree',publicationReady:true,routeIds:['route']}]},registry:{models:[{id:'degree',level:'bachelor'}]},baselines:{baselines:{route:baseline}},models:[model],inputFingerprints:{'b.json':'b','a.json':'a'},nodeBudget:2000};
}
test('a genuine additional published course is found despite a pinned researched starting plan and can fail the optional gate',()=>{
 const input=fixture(),before=JSON.stringify(input),report=buildTransferMaximizationReport(input),program=report.programs[0];
 assert.equal(report.summary.auditedModels,1);assert.equal(program.baseline.outsideCredits,6);assert.equal(program.search.validatedImprovement,true);assert.equal(program.search.validatedOutsideCredits,9);assert.equal(program.search.additionalOutsideCredits,3);assert.equal(program.search.publicationReady,true);
 assert.equal(program.rows.find(row=>row.requirementId==='three').alternatives[0].safePublishedSingleSwap,true);assert.throws(()=>assertNoValidatedTransferImprovements(report),/additional transfer credit.*degree/);
 assert.equal(program.search.allPossibleSourcesResearched,false);assert.equal(report.privateStudentRecordsIncluded,false);assert.equal(report.earnedCreditsInBaseline,0);assert.equal(JSON.stringify(input),before);
 assert.equal(JSON.stringify(buildTransferMaximizationReport(input)),JSON.stringify(report),'The same public evidence yields the same report and fingerprint');
});
test('a second use of the same original source and a real alternative-credit cap never become missed-saving claims',()=>{
 for(const type of ['duplicate','cap']){
  const input=fixture();if(type==='duplicate')input.models[0].requirements[2].options[0].code='SOPH-0001';else input.models[0].alternativeMaxCredits=6;
  const report=buildTransferMaximizationReport(input),alternative=report.programs[0].rows.find(row=>row.requirementId==='three').alternatives[0];
  assert.equal(report.summary.auditedModels,1);assert.equal(report.summary.validatedImprovementModels,0);assert.equal(alternative.safePublishedSingleSwap,false);assert.equal(report.programs[0].search.additionalOutsideCredits,0);
  assert(alternative.reasonCodes.includes(type==='duplicate'?'constraint:duplicate_source':'constraint:alternative_cap'));assert.doesNotThrow(()=>assertNoValidatedTransferImprovements(report));
 }
});
test('conditional and scope-held candidates retain useful research context but cannot pass a published-improvement gate',()=>{
 for(const type of ['conditional','provider']){
  const input=fixture(),candidate=input.models[0].requirements[2].options[0];candidate.evidence='conditional';candidate.conditions=['An exact course award remains pending university research.'];if(type==='provider')candidate.eligibilityReview={eligibleToStart:false,sourceIds:['map']};
  const report=buildTransferMaximizationReport(input),alternative=report.programs[0].rows.find(row=>row.requirementId==='three').alternatives[0];assert.equal(report.summary.conditionalCandidatePlacements,1);assert.equal(report.summary.validatedImprovementModels,0);assert.equal(alternative.strictPublishedAvailable,false);assert(alternative.reasonCodes.includes('conditional-mapping'));
  assert(alternative.reasonCodes.includes(type==='provider'?'research:provider-eligibility':'research:conditional-award'));assert.equal(report.researchReviewGroups[0].automaticApproval,false);assert.equal(report.researchReviewGroups[0].individualAwardsCreated,0);assert.doesNotThrow(()=>assertNoValidatedTransferImprovements(report));
 }
});
test('published scope is independent of qualityReady and rejects missing, unnamed or private baselines without exposing records',()=>{
 for(const type of ['missing','private','placeholder']){
  const input=fixture();input.publication.plans.push({modelId:'held',publicationReady:false,routeIds:['held']});input.baselines.baselines.held={qualityReady:true,rows:[{privateNote:'Do not publish this identity'}]};
  if(type==='missing')delete input.baselines.baselines.route;
  if(type==='private')Object.assign(input.baselines.baselines.route.rows[0],{status:'reported',learningId:'private-student-123',privateNote:'Private Student Name'});
  if(type==='placeholder'){const option=input.models[0].requirements[2].options[1];option.code='';option.selectionRequired=true;}
  const report=buildTransferMaximizationReport(input);assert.equal(report.summary.publicationReadyModels,1);assert.equal(report.summary.auditedModels,0);assert.equal(report.summary.notAuditableModels,1);assert.equal(report.summary.validatedImprovementModels,0);assert.equal(report.programs[0].status,'not-auditable');assert.throws(()=>assertNoValidatedTransferImprovements(report),/Cannot certify published plans/);assert.doesNotMatch(JSON.stringify(report),/Private Student Name|private-student-123|Do not publish/);
 }
});
test('identity work groups preserve unknown versus known source units and recommendation versions',()=>{
 const input=fixture(),row=input.models[0].requirements[2],old=row.options[0];old.evidence='conditional';old.conditions=['Research pending.'];row.options.push({...structuredClone(old),id:'other-version',courseVersion:2},{...structuredClone(old),id:'unknown-units',sourceCredits:null});
 const report=buildTransferMaximizationReport(input);assert.equal(report.summary.originalIdentityReviewGroups,3);assert.equal(new Set(report.researchReviewGroups.map(group=>group.id)).size,3);assert(report.researchReviewGroups.every(group=>group.contexts[0].receivingScope.school==='Example University'));
});
test('bounded search exhaustion remains explicit and cannot manufacture an optimum or global-source completeness',()=>{
 const input=fixture();input.nodeBudget=1;const report=buildTransferMaximizationReport(input);assert.equal(report.configuration.nodeBudget,1);assert.equal(report.programs[0].search.allPossibleSourcesResearched,false);assert.equal(report.summary.searchBudgetExhausted,1);assert.equal(report.programs[0].search.optimalityProven,false);assert.equal(report.programs[0].search.publicationReady,true);assert(report.programs[0].search.validatedOutsideCredits>=report.programs[0].baseline.outsideCredits);
 assert.throws(()=>buildTransferMaximizationReport({...input,nodeBudget:0}),/bounded/);assert.throws(()=>buildTransferMaximizationReport({...input,publication:{...input.publication,asOf:'2026-02-30'}}),/real review date/);
});


test('every selected University row stays visible without treating an absent outside listing as an institutional restriction',()=>{
 const input=fixture();input.models[0].requirements[2].options=input.models[0].requirements[2].options.filter(option=>option.provider==='University');
 const report=buildTransferMaximizationReport(input),program=report.programs[0],open=program.rows.find(row=>row.requirementId==='three'),capstone=program.rows.find(row=>row.requirementId==='capstone');
 assert.equal(report.summary.totalUniversityRows,2);assert.equal(report.summary.universityRowsWithAlternatives,0);assert.equal(report.summary.modelsWithUniversityAlternatives,0);assert.equal(report.summary.candidatePlacements,0);
 assert.equal(open.universityReason.code,'no-listed-outside-option');assert.equal(open.universityReason.sourceCoverageEstablished,false);assert.match(open.universityReason.message,/does not establish/);assert.deepEqual(open.universityReason.sourceReferences,[]);
 assert.equal(capstone.universityReason.code,'institution-only');assert.equal(capstone.universityReason.sourceCoverageEstablished,false);
 // These are source references for the explicit model flag, not a new source-coverage claim.
 input.models[0].requirements[3].sourceIds=['degree'];const sourced=buildTransferMaximizationReport(input).programs[0].rows.find(row=>row.requirementId==='capstone');
 assert.equal(sourced.universityReason.sourceReferences[0].id,'degree');assert.equal(sourced.universityReason.sourceReferences[0].url,'https://example.edu/degree');assert.equal(sourced.universityReason.sourceReferences[0].checkedOn,'2026-11-27');
 assert.equal(program.search.status,'no-university-row-with-listed-alternative');assert.equal(program.search.optimalityProven,false);assert.doesNotThrow(()=>assertNoValidatedTransferImprovements(report));
});


test('a source-bound baseline suggestion survives zero solver budget without hard pins or a false optimality certificate',()=>{
 const input=fixture();input.nodeBudget=1;input.models[0].alternativeMaxCredits=6;const frames=[];
 input.generate=(model,settings)=>{
  if(settings.suggestedChoices){frames.push({model:structuredClone(model),settings:structuredClone(settings)});return Planner.generate(model,{...settings,optimizationNodeBudget:0});}
  return Planner.generate(model,settings);
 };
 const report=buildTransferMaximizationReport(input),program=report.programs[0];assert.equal(frames.length,1);
 const {model,settings}=frames[0],hint=settings.suggestedChoices;assert.equal(model.reviewedBaselineChoices,undefined);assert.deepEqual(settings.optionSelections,{});assert.deepEqual(settings.completed,[]);
 assert.equal(hint.modelId,model.id);assert.equal(hint.catalogYear,model.catalogYear||model.catalog);assert.equal(hint.format,model.format);assert.equal(hint.creditSystem,model.creditSystem);assert.equal(hint.totalCredits,model.totalCredits);assert.equal(hint.checkedOn,input.publication.asOf);assert(hint.reviewId);
 assert(hint.sourceIds.every(id=>model.sources.some(source=>source.id===id)));assert.deepEqual(hint.optionSelections,Object.fromEntries(input.baselines.baselines.route.rows.map(row=>[row.requirementId,row.optionId])));
 assert.equal(program.search.incumbentPolicy,'validated-published-baseline-as-suggestion');assert.equal(program.search.explicitOptionSelections,0);assert.equal(program.search.publicationReady,true);assert.equal(program.search.validatedOutsideCredits,program.baseline.outsideCredits);assert.equal(program.search.statesVisited,0);assert.equal(program.search.budgetExhausted,true);assert.equal(program.search.optimalityProven,false);assert.doesNotThrow(()=>assertNoValidatedTransferImprovements(report));
});
