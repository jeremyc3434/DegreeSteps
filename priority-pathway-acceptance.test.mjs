import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectDraft,inspectPriorityPathways,priorityCandidates} from './scripts/check-priority-pathways.mjs';
const require=createRequire(import.meta.url),Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Planner=require('./dist/planner.js'),model=require('./dist/data/liberty.json');
function realDraft(){const catalog=require('./dist/data/pathways.json'),route=catalog.pathways.find(route=>route.modelId===model.id);return Journey.buildDraft(Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog),catalog,[model]);}
test('one actual solver route per priority school reports blockers instead of equating listings with finished plans',async()=>{
  const report=await inspectPriorityPathways({asOf:'2026-11-26'});
  assert.equal(report.pathways.length,4);assert.deepEqual(report.pathways.map(row=>row.school),priorityCandidates.map(row=>row.school));assert.equal(report.summary.schoolApprovedPlans,0);
  for(const row of report.pathways){
    if(row.status==='directory-only'){assert.equal(row.modelId,null);assert.equal(row.proposedPlanFullySpecified,false);assert.equal(row.costs.total,null);assert.equal(row.timing.weeks,null);continue;}
    assert.equal(row.accountedCredits,row.degreeCredits);assert.equal(row.checks.academicCreditRules,true);assert.equal(row.checks.sourceBoundOutsideCourses,true);
    assert.equal(row.checks.truthfulCostUncertainty,true);assert.equal(row.checks.truthfulTimingUncertainty,true);assert.equal(row.schoolConfirmationRequired,true);
    assert.equal(row.selectedPublishedOutsideCredits+row.selectedConditionalOutsideCredits,row.proposedOutsideCredits);
    assert.equal(row.selectedOutsideMappings.reduce((sum,mapping)=>sum+mapping.receivingCredits,0),row.proposedOutsideCredits);
    for(const mapping of row.selectedOutsideMappings){assert(mapping.sources.length>0);assert(mapping.sources.every(source=>source.url?.startsWith('https://')));assert.equal(mapping.evidence==='conditional',row.conditionalCourseChoices.includes(mapping.requirementId));}
    assert.match(row.evidenceScope,/do not establish individual receiving-school approval/);
    if(row.proposedPlanFullySpecified){assert.equal(row.openCourseChoices.length,0);assert.equal(row.checks.knownCreditPolicies,true);assert(row.sourceUrls.length>0);}
    else assert(row.issues.length>0);
    if(!row.costs.complete)assert.equal(row.costs.total,null);
  }
});
test('an open placeholder is blocked even when the chosen real degree satisfies credit arithmetic',()=>{
  const draft=realDraft();draft.plan.rows[0].selectionRequired=true;
  const report=inspectDraft(draft);assert.equal(report.checks.academicCreditRules,true);assert.equal(report.proposedPlanFullySpecified,false);assert.equal(report.checks.namedCourseChoices,false);assert(report.issues.some(issue=>issue.code==='course-choices'));
});
test('a duplicate actual requirement cannot pass the finished pathway gate',()=>{
  const draft=realDraft();draft.plan.rows.push(structuredClone(draft.plan.rows[0]));const report=inspectDraft(draft);
  assert.equal(report.checks.hasRequirementLedger,false);assert.equal(report.checks.academicCreditRules,false);assert.equal(report.proposedPlanFullySpecified,false);
});
test('outside choices without resolvable evidence cannot become a finished pathway',()=>{
  const draft=realDraft(),row=draft.plan.rows.find(row=>row.option.provider!=='University');row.option.sourceIds=['missing-source'];const report=inspectDraft(draft);
  assert.equal(report.checks.sourceBoundOutsideCourses,false);assert.equal(report.proposedPlanFullySpecified,false);assert(report.issues.some(issue=>issue.code==='transfer-sources'));
});
function fractionalDraft(checked='2026-11-17'){
  const university=(id,title)=>({id:'university-'+id,provider:'University',code:id.toUpperCase(),title,credits:4,creditSystem:'competency-unit',creditOrigin:'institutional',evidence:'published',sourceIds:['policy']}),capstone='capstone';
  const program={id:'fractional-program',school:'Policy fixture university',title:'Named competency program',level:'bachelor',creditSystem:'competency-unit',totalCredits:12,externalMaxCredits:9,alternativeMaxCredits:9,majorMinInstitutionCredits:0,upperMinCredits:0,policySourceIds:['policy'],sources:[{id:'policy',url:'https://example.edu/policy',checked}],requirements:[{id:'communication',code:'COMM1',title:'Communication',credits:4,category:'general',options:[university('communication','Communication'),{id:'sophia-communication',provider:'Sophia',code:'SOPH-COMM',title:'Named communication course',credits:4,sourceCredits:3,sourceCreditSystem:'semester',creditSystem:'competency-unit',creditOrigin:'ace',evidence:'conditional',sourceIds:['policy']}]},{id:'management',code:'MAN1',title:'Management',credits:4,category:'major',options:[university('management','Management')]},{id:capstone,code:'CAP1',title:'Capstone project',credits:4,category:'major',institutionalOnly:true,options:[university(capstone,'Capstone project')]}],residencyPolicy:{type:'institution-fraction-with-capstone-exclusion',creditSystem:'competency-unit',fraction:.25,capstoneRequirementIds:[capstone],capstoneCredits:4,sourceIds:['policy'],interpretationStatus:'exact-floor-unresolved',conservativeSufficientCondition:{basisCredits:12,minimumNonCapstoneInstitutionCUs:3}},policyReview:[]};
  const input={providers:['Sophia'],allowConditional:true,priority:'transfer'};return{program,input,plan:Planner.generate(program,input)};
}
test('a source-bound fractional residency calculation is accepted as a sufficient bound, never a published numeric floor',()=>{
  const draft=fractionalDraft(),report=inspectDraft(draft,{asOf:'2026-11-17'});
  assert.equal(report.proposedPlanFullySpecified,true);assert.equal(report.checks.knownCreditPolicies,true);assert.equal(report.checks.freshExplicitPolicySources,true);
  assert.equal(report.limits.institutionMinCredits,null);assert.equal(report.limits.conservativeInstitutionSufficientBound,7);assert.match(report.limits.residencyCalculationBasis,/exact floor remains unresolved/);
  assert.equal(report.limits.derivedInstitutionMinimum,null);assert.equal(report.limits.residencyAndOverallPolicyCeiling,null);
  assert.equal(report.selectedConditionalOutsideCredits,4);assert.equal(report.selectedPublishedOutsideCredits,0);assert.equal(report.proposedOutsideCredits,4);assert.equal(report.schoolConfirmationRequired,true);
});
test('a verified additional-capstone rule reports its derived minimum and constrained policy ceiling separately from a literal numeric floor',()=>{
  const draft=fractionalDraft();draft.program.residencyPolicy.interpretationStatus='verified-additional-capstone';draft.program.residencyPolicy.calculatedMinimumInstitutionCUs=7;draft.plan=Planner.generate(draft.program,draft.input);
  const report=inspectDraft(draft,{asOf:'2026-11-17'});
  assert.equal(report.proposedPlanFullySpecified,true);assert.equal(report.limits.institutionMinCredits,null);assert.equal(report.limits.derivedInstitutionMinimum,7);assert.equal(report.limits.conservativeInstitutionSufficientBound,null);
  assert.equal(report.limits.residencyAndOverallPolicyCeiling,5);assert.equal(report.limits.externalMaxCredits,9);assert.match(report.limits.residencyCalculationBasis,/source-verified/);assert.doesNotMatch(report.limits.residencyCalculationBasis,/unresolved/);
  assert.equal(report.selectedOutsideMappings[0].receivingCredits,4);assert.equal(report.selectedOutsideMappings[0].sourceCredits,3);assert.equal(report.selectedOutsideMappings[0].sourceCreditSystem,'semester');assert.equal(report.schoolConfirmationRequired,true);
  draft.program.residencyPolicy.calculatedMinimumInstitutionCUs=8;draft.plan=Planner.generate(draft.program,draft.input);const inconsistent=inspectDraft(draft,{asOf:'2026-11-17'});assert.equal(inconsistent.proposedPlanFullySpecified,false);assert.equal(inconsistent.limits.derivedInstitutionMinimum,null);
});
test('stale, future or undated explicit policy sources block a complete-plan claim despite valid credit arithmetic',()=>{
  for(const date of ['2026-10-01','2026-12-01',undefined]){
    const draft=fractionalDraft(date);if(date===undefined)delete draft.program.sources[0].checked;
    const report=inspectDraft(draft,{asOf:'2026-11-17'});assert.equal(report.checks.academicCreditRules,true);assert.equal(report.checks.freshExplicitPolicySources,false);assert.equal(report.proposedPlanFullySpecified,false);assert.equal(report.status,'needs-policy-review');assert(report.issues.some(issue=>issue.code==='policy-review-due'));
  }
});
test('an absent residency policy never passes because the helper defaults an unknown minimum to zero',()=>{
  const draft=fractionalDraft();delete draft.program.residencyPolicy;delete draft.program.externalMaxCredits;draft.plan=Planner.generate(draft.program,draft.input);
  const report=inspectDraft(draft,{asOf:'2026-11-17'});assert.equal(Planner.institutionResidencyMinimum(draft.program),0);assert.equal(report.checks.knownCreditPolicies,false);assert.equal(report.proposedPlanFullySpecified,false);assert.equal(report.limits.institutionMinCredits,null);assert.equal(report.limits.conservativeInstitutionSufficientBound,null);
});
