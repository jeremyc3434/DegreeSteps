import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Planner from '../dist/planner.js';
import CoursePlanView from '../dist/course-plan-view.js';
import {assessPathwayQuality} from './pathway-quality.mjs';
import {applyLibertyExpandedBaselineReview,libertyExpandedBaselineReview as review} from './liberty-expanded-baseline-review.mjs';
import {applyLibertyCurrentEvidence} from './liberty-current-evidence.mjs';
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const compiledHealth=(await read('dist/data/curricula/liberty-online-expansion.json')).models.find(model=>model.id==='curriculum-liberty-healthcare-administration-bs-online');
const clone=value=>JSON.parse(JSON.stringify(value));
// This helper is a pre-composition stage. The public compiled models now also
// contain the later shared-award stage, whose aliases and reviewed identities
// are deliberately different. Rebuild this unit fixture through the actual
// evidence functions instead of reapplying an earlier stage to a final output.
function beforeSharedComposition(input){
 const model=clone(input);
 for(const row of model.requirements){
  row.options=row.options.filter(option=>!option.sharedAwardProvenance||!option.id.startsWith('shared-option-'));
  for(const option of row.options){
   if(!option.sharedAwardProvenance)continue;
   option.evidence='conditional';
   option.eligibilityReview={status:'needs-independent-provider-review',eligibleToStart:false,recommendationPeriodStatus:'version-period-link-still-to-review',sourceIds:[]};
   delete option.sharedAwardProvenance;
  }
 }
 return applyLibertyCurrentEvidence(model,{compiled:true});
}
const original=beforeSharedComposition(compiledHealth);
// These historical baselines use their reviewed provider preferences. Later
// optional providers must be explicitly enabled before their awards can enter.
const baselineProviders=['Sophia','Study.com','StraighterLine','CLEP','DSST'];
function planFor(model,selections=model.reviewedBaselineChoices?.optionSelections){return Planner.generate(model,{providers:baselineProviders,allowConditional:true,priority:'transfer',completed:[],optionSelections:selections,optimizationNodeBudget:12000});}
const quality=(model,plan=planFor(model))=>assessPathwayQuality({model,plan,asOf:'2026-11-19'});
const option=(model,requirement='free-electives-1',code='SOPH-0022')=>model.requirements.find(row=>row.id===requirement).options.find(option=>option.code===code&&option.mappingResearchClosed===true);

test('the exact healthcare baseline has 120 planned credits, 66 documented outside credits and 54 Liberty credits',()=>{
 const model=applyLibertyExpandedBaselineReview(original),plan=planFor(model),report=quality(model,plan);
 assert.equal(report.publication.ready,true);assert.equal(report.research.blockingFindings,0);assert.equal(report.research.conditionalFindings,0);
 assert.deepEqual([report.metrics.degreeCredits,report.metrics.feasibleOutsideCredits,report.metrics.conditionalOutsideCredits],[120,66,0]);
 assert.equal(plan.totals.institutional,54);assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);
 assert(plan.rows.every(row=>row.status==='planned'));assert(plan.totals.upper>=30);
 const chosen=plan.rows.filter(row=>row.requirementId.startsWith('free-electives-'));
 assert.deepEqual(chosen.map(row=>row.option.code),['SOPH-0022','SOPH-0025','SOPH-0006','SOPH-0029']);assert.equal(new Set(chosen.map(row=>row.option.code)).size,4);
 const automatic=Planner.generate(model,{providers:['Sophia','Study.com','CLEP'],allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});assert.equal(quality(model,automatic).publication.ready,true);assert.deepEqual(automatic.rows.filter(row=>row.requirementId.startsWith('free-electives-')).map(row=>row.option.code),chosen.map(row=>row.option.code));
 assert.equal(model.requirements.length,original.requirements.length);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
});

test('review changes preserve the original input, repeat deterministically and do not scope to other degrees',()=>{
 const before=JSON.stringify(original),model=applyLibertyExpandedBaselineReview(original);assert.equal(JSON.stringify(original),before);
 assert.deepEqual(applyLibertyExpandedBaselineReview(model),model);
 for(const changes of [{id:'another-degree'},{school:'Another university'},{format:'Residential'},{catalogYear:'2027-2028'},{creditSystem:'competency-unit'},{totalCredits:121},{auditProvenance:{status:'student-provided'}}]){
  const value={...original,...changes};assert.equal(applyLibertyExpandedBaselineReview(value),value);
 }
});

test('no numeric alternative cap is invented and the source-bound unknown stays explicit',()=>{
 const model=applyLibertyExpandedBaselineReview(original);
 assert.equal(model.alternativeMaxCredits,undefined);assert.equal(model.externalMaxCredits,90);assert.equal(model.institutionMinCredits,30);
 const policy=model.policyReview.find(note=>note.field==='alternativeMaxCredits');assert.equal(policy.status,'not-applicable');assert.equal(policy.checkedOn,'2026-11-19');assert(policy.sourceIds.length);
 assert.match(policy.message,/does not publish a separate aggregate/);assert.match(policy.message,/no numeric alternative-credit allowance/);
 assert.equal(model.expandedBaselineReview.numericAlternativeCapInvented,false);
 assert.throws(()=>applyLibertyExpandedBaselineReview({...original,alternativeMaxCredits:60}),/separately published or conflicting/);
 const unavailable=clone(original);unavailable.sources=unavailable.sources.filter(source=>!review.scopes[0].policySourceIds.includes(source.id));assert.throws(()=>applyLibertyExpandedBaselineReview(unavailable),/degree, policy and course sources/);
});

test('current identities resolve only the specific stale hold, never a conflict, expired version or another eligibility decision',()=>{
 for(const edit of [
  value=>option(value).courseVersion='999',
  value=>option(value).sourceCredits=4,
  value=>option(value).recommendationEnd='2026-11-18',
  value=>option(value).recommendationStart='2026-11-20',
  value=>option(value).sourceCreditEvidence.sourceIds=[],
  value=>option(value).degreePlacementEvidence.catalogYear='2027-2028',
  value=>option(value).degreePlacementEvidence.receivingCode='HIUS 222',
  value=>option(value).eligibilityReview.status='not-eligible',
  value=>{const id=option(value).sourceCreditEvidence.sourceIds[0];value.sources.find(source=>source.id===id).sha256='0'.repeat(64);}
 ]){const value=clone(original);edit(value);const before=JSON.stringify(value);assert.throws(()=>applyLibertyExpandedBaselineReview(value),/exact reviewed three-credit free-elective choice/);assert.equal(JSON.stringify(value),before);}
 const model=applyLibertyExpandedBaselineReview(original);
 assert.equal(option(model).eligibilityReview.eligibleToStart,true);assert.equal(option(model).evidence,'published');assert.equal(option(model).sourceCreditEvidence.aceVersion,4);
 const unresolved=option(model,'free-electives-1','SDCM-0128');assert.equal(unresolved.eligibilityReview.eligibleToStart,false);assert.equal(unresolved.evidence,'conditional');
});

test('an unreviewed alternative remains available for research and fails publication when selected',()=>{
 const model=applyLibertyExpandedBaselineReview(original),pending=option(model,'free-electives-1','SDCM-0128');
 const selections={...model.reviewedBaselineChoices.optionSelections,'free-electives-1':pending.id};
 const report=quality(model,planFor(model,selections));assert.equal(report.publication.ready,false);assert(report.findings.some(finding=>finding.code==='provider-eligibility'&&finding.blocking));
 const newQuestion=clone(original);newQuestion.unresolved.push('A newly discovered academic rule remains unreviewed.');const updated=applyLibertyExpandedBaselineReview(newQuestion);assert(updated.unresolved.includes('A newly discovered academic rule remains unreviewed.'));assert.equal(quality(updated).publication.ready,false);
 const policyQuestion=clone(original);policyQuestion.policyReview.push({field:'alternativeMaxCredits',status:'unverified',message:'A newly published program-specific source cap needs review.'});const policyUpdated=applyLibertyExpandedBaselineReview(policyQuestion);assert(policyUpdated.policyReview.some(note=>note.message==='A newly published program-specific source cap needs review.'&&note.status==='unverified'));assert.equal(quality(policyUpdated).publication.ready,false);
});

test('university prerequisite evidence retains real alternatives and leaves personal assessment results unknown',()=>{
 const model=applyLibertyExpandedBaselineReview(original),row=code=>model.requirements.find(row=>row.code===code);
 assert.deepEqual(row('BUSI 494').prerequisites,['busi-323','busi-428','hlth-485']);assert.deepEqual(row('BUSI 428').prerequisites,['busi-344','busi-418']);
 assert.deepEqual(row('HLTH 485').prerequisitePolicy.rule.anyOf.map(rule=>rule.code),['MATH 201','BUSI 230']);
 assert.deepEqual(row('INFO 305').prerequisitePolicy.rule.anyOf.map(rule=>rule.code),['BUSI 311','CSIS 100','CSIS 110']);
 const alternatives=row('BUSI 201').prerequisitePolicy.rule.anyOf;assert.deepEqual(alternatives.slice(0,2).map(rule=>rule.code),['INFT 110','INFT 111']);assert.equal(alternatives[2].allOf.length,3);assert(alternatives[2].allOf.every(rule=>rule.minimumScore===5));
 assert.equal(model.assessmentsPassed,undefined);assert.equal(model.appliedTransferWaiver,undefined);
 assert(model.unresolved.some(note=>note.owner==='student'&&note.status==='personal-task'&&/No assessment pass/.test(note.message)));
 for(const fact of review.scopes[0].courseReviews){assert.equal(row(fact.code).offeringPolicy.actualSectionAvailabilityConfirmed,false);assert(row(fact.code).prerequisiteSourceIds.length);}
});

test('the compiled evidence integration preserves the same review and original ready models stay untouched by this classification',async()=>{
 const updated=applyLibertyCurrentEvidence(original,{compiled:true});assert.equal(quality(updated).publication.ready,true);assert.deepEqual(applyLibertyCurrentEvidence(updated,{compiled:true}),updated);
 for(const path of ['dist/data/liberty.json','dist/data/liberty-criminal-justice-online.json','dist/data/liberty-criminal-justice-residential.json']){const model=await read(path);assert.equal(applyLibertyExpandedBaselineReview(model),model);}
 const raw=(await read('content/curricula/liberty-online-expansion.json')).models.find(model=>model.id===original.id);assert.doesNotThrow(()=>applyLibertyCurrentEvidence(raw));
});

test('Psychology retains three-credit UNIV 104 and has 78 documented outside plus 42 Liberty credits',async()=>{
 const originalPsych=beforeSharedComposition((await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online')),before=JSON.stringify(originalPsych);
 const model=applyLibertyExpandedBaselineReview(originalPsych),plan=planFor(model),report=quality(model,plan);
 assert.equal(report.publication.ready,true);assert.equal(report.research.blockingFindings,0);assert.equal(report.research.conditionalFindings,0);
 assert.deepEqual([report.metrics.degreeCredits,report.metrics.feasibleOutsideCredits,report.metrics.conditionalOutsideCredits],[120,78,0]);assert.equal(plan.totals.institutional,42);assert.equal(plan.totals.upper,51);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);
 assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);assert(plan.rows.every(row=>row.status==='planned'));assert.equal(JSON.stringify(originalPsych),before);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(model.requirements.filter(row=>row.freeElective).reduce((sum,row)=>sum+row.credits,0),33);
 const univ=model.requirements.find(row=>row.id==='univ-104');assert.equal(univ.code,'UNIV 104');assert.equal(univ.credits,3);assert.equal(univ.category,'general');assert.equal(univ.institutionalOnly,true);assert(!model.requirements.some(row=>row.id==='free-electives-12'));
 const external=plan.rows.filter(row=>row.option.provider!=='University'),keys=external.map(row=>row.option.provider+'|'+row.option.code);assert.equal(new Set(keys).size,keys.length);
 assert.deepEqual(plan.rows.filter(row=>row.requirementId.startsWith('free-electives-')).map(row=>row.option.code),['SDCM-0173','SDCM-0207','SDCM-0172','SDCM-0209','SOPH-0022','SOPH-0025','SOPH-0006','SOPH-0029','SOPH-0016','SOPH-0027','SOPH-0065']);
 assert.deepEqual(applyLibertyExpandedBaselineReview(model),model);assert.deepEqual(applyLibertyCurrentEvidence(model,{compiled:true}),model);
});

test('Psychology worksheet uses catalog components and counts shared general-education courses only once',async()=>{
 const input=beforeSharedComposition((await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online')),model=applyLibertyExpandedBaselineReview(input),plan=planFor(model);
 const view=CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{});
 assert.deepEqual(view.curriculumIssues,[]);
 const components=model.curriculumSections;
 assert.deepEqual(components.map(section=>[section.id,section.parentId]),[['general-education','general'],['major-foundations','major'],['major-core','major'],['free-electives','elective']]);
 const allocations=components.flatMap(section=>section.requirementIds);assert.equal(allocations.length,model.requirements.length);assert.equal(new Set(allocations).size,model.requirements.length);
 assert(components[0].requirementIds.includes('univ-104'));assert(!allocations.includes('free-electives-12'));
 assert.deepEqual(components[0].sharedRequirementIds,['biol-102','psyc-101']);
 const children=view.sections.flatMap(section=>section.children);
 assert.deepEqual(children.map(section=>[section.id,section.credits,section.sharedCredits,section.requirementCredits]),[['general-education',36,6,42],['major-foundations',12,0,12],['major-core',39,0,39],['free-electives',33,0,33]]);
 assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),120);
 assert.deepEqual(applyLibertyExpandedBaselineReview(model),model);
});

test('the Study health-course facts become only exact Psychology free-elective placements',async()=>{
 const originalPsych=beforeSharedComposition((await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online')),model=applyLibertyExpandedBaselineReview(originalPsych);
 for(const requirement of model.requirements.filter(row=>['free-electives-1','free-electives-2','free-electives-3','free-electives-4'].includes(row.id))){
  const selected=requirement.options.find(option=>option.id===model.reviewedBaselineChoices.optionSelections[requirement.id]);
  assert.equal(selected.provider,'Study.com');assert.equal(selected.credits,3);assert.equal(selected.sourceCredits,3);assert.equal(selected.sourceCreditSystem,'semester');assert.equal(selected.sourceUpper,true);assert.equal(selected.upper,true);assert.equal(selected.creditOrigin,'alternative');assert.equal(selected.evidence,'published');
  assert.equal(selected.degreePlacementEvidence.modelId,model.id);assert.equal(selected.degreePlacementEvidence.requirementId,requirement.id);assert.equal(selected.degreePlacementEvidence.placementType,'free-elective');assert.equal(selected.degreePlacementEvidence.catalogYear,'2026-2027');assert.equal(selected.degreePlacementEvidence.modality,'online');assert(selected.identitySourceIds.some(id=>model.sources.find(source=>source.id===id)?.kind==='ace'));
  assert(selected.recommendationStart<='2026-11-19'&&selected.recommendationEnd>='2026-11-19');assert.equal(selected.eligibilityReview.eligibleToStart,true);
 }
 const invalidReview=clone(review),scope=invalidReview.scopes.find(scope=>scope.modelId===model.id);scope.choices[0].receivingCode='PSYC 310';assert.throws(()=>applyLibertyExpandedBaselineReview(originalPsych,invalidReview),/independent Study identity and exact online receiving award/);
 const restricted=clone(originalPsych);restricted.requirements.find(row=>row.id==='free-electives-1').allowedCoursePrefixes=['PSYC'];assert.throws(()=>applyLibertyExpandedBaselineReview(restricted),/unrestricted elective/);
});

test('Psychology prerequisites, capstone grades and registration status remain exact and personal',async()=>{
 const model=applyLibertyExpandedBaselineReview(beforeSharedComposition((await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online'))),row=code=>model.requirements.find(row=>row.code===code);
 assert.deepEqual(row('PSYC 355').prerequisites,['psyc-101','math-121','psyc-354','psyc-255']);assert.deepEqual(row('PSYC 421').prerequisites,['psyc-355','psyc-255','psyc-101']);assert.deepEqual(row('PSYC 491').prerequisites,['psyc-255','psyc-101']);
 assert(row('PSYC 355').prerequisitePolicy.rule.allOf[1].anyOf.some(rule=>rule.code==='MATH 121'));assert.equal(row('PSYC 491').registrationPolicy.minimumPrerequisiteGrade,'C');assert.equal(row('PSYC 491').registrationPolicy.minimumCompletedPsychologyCredits,18);assert.equal(row('PSYC 491').registrationPolicy.personalEligibilityConfirmed,false);
 assert(model.unresolved.some(note=>note.owner==='student'&&note.status==='personal-task'&&/18 completed psychology credits/.test(note.message)));assert.equal(model.appliedTransferWaiver,undefined);assert.equal(model.assessmentsPassed,undefined);
 const changed=clone(model);changed.unresolved.push('A new psychology requirement still needs research.');assert.equal(quality(applyLibertyExpandedBaselineReview(changed)).publication.ready,false);
});

test('the Business prerequisite conflict is a platform research hold and cannot be labeled cleared',async()=>{
 const originalBusiness=(await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-business-bs-online'),before=JSON.stringify(originalBusiness),model=applyLibertyExpandedBaselineReview(originalBusiness);
 const hold=model.unresolved.find(note=>note.id==='liberty-business-online-busi105-prerequisite-conflict-2026-11-19');assert(hold);assert.equal(hold.owner,'DegreeSteps');assert.equal(hold.status,'unresolved');assert.equal(hold.field,'prerequisites');assert.match(hold.message,/BUSI 301 requires BUSI 105/);assert.match(hold.message,/residentially only/);assert.equal(quality(model,planFor(model,{})).publication.ready,false);
 assert.equal(JSON.stringify(originalBusiness),before);assert.deepEqual(model.requirements,originalBusiness.requirements);assert.deepEqual(applyLibertyExpandedBaselineReview(model),model);
 const unsupported=clone(originalBusiness);unsupported.sources=unsupported.sources.filter(source=>!review.researchHolds[0].sourceIds.includes(source.id));assert.equal(applyLibertyExpandedBaselineReview(unsupported),unsupported);
 const outsideScope={...originalBusiness,format:'Residential'},outsideBefore=JSON.stringify(outsideScope);assert.equal(applyLibertyExpandedBaselineReview(outsideScope),outsideScope);assert.equal(JSON.stringify(outsideScope),outsideBefore);
});


test('the final shared-composed healthcare and Psychology outputs preserve complete reviewed routes and original degree quantities',async()=>{
 const compiledPsych=(await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online');
 for(const [model,outside,university]of [[compiledHealth,72,48],[compiledPsych,78,42]]){
  const before=JSON.stringify(model),plan=planFor(model),report=assessPathwayQuality({model,plan,asOf:'2026-11-20'});
  assert.equal(report.publication.ready,true);assert.equal(report.research.blockingFindings,0);assert.equal(report.metrics.feasibleOutsideCredits,outside);assert.equal(plan.totals.institutional,university);assert.equal(plan.totals.accounted,120);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);assert.equal(plan.validation.academicCountsValid,true);
  const univ=model.requirements.find(row=>row.id==='univ-104');assert.equal(univ?.credits,3);assert.equal(plan.rows.find(row=>row.requirementId===univ.id)?.option?.provider,'University');if(model.id==='curriculum-liberty-psychology-bs-online')assert.equal(univ.institutionalOnly,true);assert.deepEqual(CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{}).curriculumIssues,[]);assert.equal(JSON.stringify(model),before);
  if(model.id===compiledHealth.id){
   // The historical helper fixture above remains 66/54. These additional six
   // credits are independently reviewed shared awards, consumed only after
   // composition; an earlier helper must not be reapplied to this final model.
   assert.equal(model.majorInstitutionFraction,0.25);assert.equal(model.majorResidencyBasisCredits,66);assert.equal(model.institutionMinCredits,30);assert.equal(model.externalMaxCredits,90);assert.equal(model.alternativeMaxCredits,undefined);
   assert.equal(report.research.conditionalFindings,0);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);assert(plan.totals.upper>=30);
   const sources=new Map(model.sources.map(source=>[source.id,source]));
   for(const [requirementId,code,hash]of [
    ['info-320','SDCM-0170','532f617ac3c4acad97b88620cd468231051146ba9832b9ebaebb67aae29cd640'],
    ['busi-344','SDCM-0169','f2c495c10218358c6eb314081d3e267815938ed29d1ceccee5799ac8dd55cbfa']
   ]){
    const requirement=model.requirements.find(row=>row.id===requirementId),selected=plan.rows.find(row=>row.requirementId===requirementId)?.option;assert(selected);
    assert.equal(selected.provider,'Study.com');assert.equal(selected.code,code);assert.equal(selected.receivingCode,requirement.code);assert.equal(selected.courseVersion,'4');assert.equal(selected.credits,3);assert.equal(selected.sourceCredits,3);assert.equal(selected.sourceCreditSystem,'semester');assert.equal(selected.sourceUpper,true);assert.equal(selected.upper,true);assert.equal(selected.evidence,'published');assert.equal(selected.eligibilityReview.eligibleToStart,true);
    assert.equal(selected.recommendationStart,'2024-05-01');assert.equal(selected.recommendationEnd,'2027-05-31');assert.equal(selected.providerCoursePassingPercent,70);
    assert.equal(selected.sharedAwardProvenance.bundleId,'liberty-shared-online-undergraduate-awards-v1');assert.equal(selected.degreePlacementEvidence.modelId,model.id);assert.equal(selected.degreePlacementEvidence.requirementId,requirementId);assert.equal(selected.degreePlacementEvidence.catalogYear,model.catalogYear);assert.equal(selected.degreePlacementEvidence.placementType,'exact-named-requirement');
    assert(selected.identitySourceIds.length);for(const id of selected.identitySourceIds){const source=sources.get(id);assert.equal(source.kind,'ace');assert(source.roles.includes('provider-identity'));assert(source.courseCodes.includes(code));assert.equal(source.sourceContentHash,'sha256:'+hash);assert.equal(source.checkedOn,'2026-11-20');}
    const receiving=sources.get(selected.sourceIds.find(id=>sources.get(id)?.originalSourceId==='liberty-online-study-guide-full-2026-11-18'));assert.equal(receiving.kind,'university');assert(receiving.roles.includes('receiving-map'));assert(!selected.identitySourceIds.includes(receiving.id));
    const curriculum=sources.get('liberty-healthcare-administration-online-2026-2027'),policy=[...sources.values()].find(source=>source.originalSourceId==='liberty-undergraduate-catalog-online-policy-2026-2027-reviewed-2026-11-18');
    assert.equal(curriculum.url,'https://catalog.liberty.edu/undergraduate/colleges-schools/business/healthcare-administration-major-bs/healthcare-administration-online/');assert.equal(curriculum.checked,'2026-11-16');assert.equal(policy.kind,'university');assert(policy.roles.includes('curriculum')&&policy.roles.includes('policy'));assert.equal(policy.sourceContentHash,'sha256:a6a7a1146399add3e20dbf4a13a80d5c17dc409cc06cfc4a510ba0995c8f85de');assert.deepEqual([...selected.degreePlacementEvidence.sourceIds].sort(),[curriculum.id,policy.id].sort());assert(selected.degreePlacementEvidence.sourceIds.every(id=>!selected.identitySourceIds.includes(id)));
   }
   // The differently titled Health 305 receiving award remains held.
   assert.equal(plan.rows.find(row=>row.requirementId==='busi-323')?.option?.provider,'University');assert(!plan.rows.some(row=>row.option.code==='SDCM-0208'));
  }
 }
});

test('explicitly enabling and selecting a later CLI religion award retains its conditional publication hold and unknown original units',async()=>{
 const compiledPsych=(await read('dist/data/curricula/liberty.json')).models.find(model=>model.id==='curriculum-liberty-psychology-bs-online');
 for(const model of [compiledHealth,compiledPsych]){
  const requirement=model.requirements.find(row=>row.id==='theo-104'),choice=requirement.options.find(option=>option.id==='liberty-cli-the-101-to-theo-104');assert(choice);
  const plan=Planner.generate(model,{providers:[...baselineProviders,'Christian Leaders Institute'],allowConditional:true,priority:'transfer',completed:[],optionSelections:{...model.reviewedBaselineChoices.optionSelections,'theo-104':choice.id}}),report=assessPathwayQuality({model,plan,asOf:'2026-11-24'});
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.rows.find(row=>row.requirementId==='theo-104').option.id,choice.id);
  assert.equal(choice.credits,4);assert.equal(choice.providerListedCreditQuantity,3);assert.equal(choice.sourceCredits,undefined);assert.equal(choice.sourceCreditSystem,undefined);assert.equal(choice.sourceCreditStatus,'unknown');
  assert.equal(report.publication.ready,false);assert(report.findings.some(finding=>finding.code==='conditional-award'&&finding.optionIds.includes(choice.id)&&finding.blocking===true));
  assert(plan.blockers.some(issue=>issue.code==='conditional_mapping'));assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 }
});
