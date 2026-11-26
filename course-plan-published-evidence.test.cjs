/* Presentation labels describe the researched mapping, never an individual
 * award or a provider's general approval status. Actual published TESU rows. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const View=require('./dist/course-plan-view.js'),Planner=require('./dist/planner.js');
const registry=require('./dist/data/curriculum-registry.json'),baselines=require('./dist/data/baseline-index.json'),courses=require('./dist/data/course-catalog.json');
const ids=['curriculum-tesu-bsba-human-resources-organizational-management','curriculum-tesu-bs-general-management'];
const clone=structuredClone;
function draft(id){
 const entry=registry.models.find(entry=>entry.id===id);assert(entry,id);
 const document=require('./dist/'+entry.path),program=(document.models||[document]).find(model=>model.id===id),baseline=Object.values(baselines.baselines).find(plan=>plan.modelId===id&&plan.qualityReady);assert(baseline,id+' exact ready baseline');
 const plan=Planner.generate(program,{providers:[...new Set(baseline.rows.map(row=>row.provider).filter(provider=>provider!=='University'))],allowConditional:false,completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId])),optimizationNodeBudget:12000});
 return{program,plan,state:{learning:[]}};
}
function english(view){return Object.values(view.groups).flat().find(entry=>entry.requirementId==='enc1010');}

test('actual published HR and GM maps use a researched mapping label while retaining provider and transcript conditions',()=>{
 for(const id of ids){
  const value=draft(id),row=value.plan.rows.find(row=>row.requirementId==='enc1010'),option=row.option;
  assert.equal(option.evidence,'published');assert.equal(option.mappingResearchClosed,true);assert.equal(option.courseEligibilityResolution.status,'resolved');assert.equal(option.eligibilityReview.providerReviewPending,true);assert.equal(option.eligibilityReview.fullyApproved,false);assert.equal(option.courseEligibilityResolution.individualApproval,false);
  const before=JSON.stringify(value),view=View.build(value,courses),entry=english(view);
  assert.equal(entry.evidenceLabel,'School-submitted mapping');assert.match(entry.evidenceUrl,/^https:\/\/(?:www\.)?acenet\.edu\//);assert(option.mappingEvidence.sourceIds.every(id=>entry.sourceIds.includes(id)));assert(option.conditions.every(condition=>entry.conditions.includes(condition)),'Evidence details keep every actual course condition.');assert(entry.conditions.some(condition=>/Provisionally Approved/.test(condition)));assert(entry.conditions.some(condition=>/Credly transcript/.test(condition)));assert(entry.conditions.some(condition=>/passing course percentage of at least 70/.test(condition)));
  assert.equal(value.plan.validation.academicCountsValid,true);assert.equal(value.plan.totals.external,66);assert.equal(value.plan.totals.confirmed,0);assert.equal(value.plan.totals.reported,0);assert.equal(view.progress.completedCredits,0);assert.equal(value.state.learning.length,0);assert.equal(JSON.stringify(value),before,'A label cannot change policy, course conditions or student records.');
 }
});

test('a conditional or unbound submitted map never receives the published mapping label',()=>{
 const original=draft(ids[0]);
 const conditional=clone(original);conditional.plan.rows.find(row=>row.requirementId==='enc1010').option.evidence='conditional';assert.equal(english(View.build(conditional,courses)).evidenceLabel,'School-submitted · conditional');
 for(const mutate of[option=>option.receivingMapStatus='unknown',option=>option.mappingEvidence.claimOrigin='provider-reported',option=>option.mappingEvidence.receivingCode='UNRELATED-9999',option=>option.mappingEvidence.sourceIds=['not-a-receiving-source']]){const changed=clone(original);mutate(changed.plan.rows.find(row=>row.requirementId==='enc1010').option);assert.notEqual(english(View.build(changed,courses)).evidenceLabel,'School-submitted mapping');}
 const confirmed=clone(original);confirmed.plan.rows.find(row=>row.requirementId==='enc1010').status='confirmed';assert.equal(english(View.build(confirmed,courses)).evidenceLabel,'School confirmed','Personal evaluation stays distinct from published mapping evidence.');
});
