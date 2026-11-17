const test=require('node:test'),assert=require('node:assert/strict');
const {loadData,captureRoute}=require('./scripts/audit-student-confirmations.cjs'),data=loadData();
for(const routeId of ['wgu-catalog-ecceaa488637ac83','liberty-business-residential'])test('fresh student uses documented school facts without generic confirmation homework: '+routeId,()=>{
  const {result,draft}=captureRoute({routeId,data});
  assert.equal(result.facts.conditionalOutsideCredits,0);assert.equal(result.facts.publishedOutsideCredits,result.facts.outsideCredits);assert(result.facts.outsideCredits>0);assert.equal(result.facts.actualUnmappedCourses,0);assert.equal(result.facts.policyChecksComplete,true);
  assert.deepEqual(result.findings,[],'Known school facts should guide the student, not become generic homework.');
  assert.equal(draft.plan.totals.confirmed,0,'Published transfer evidence never awards personal completed credit');
  assert.equal(result.unmatchedRecordIds.length,0);assert.equal(result.student.hasPrior,'none');
});
test('an unmatched personal record remains an evaluation question without making known school policy unknown',()=>{
  const source={id:'personal-unmatched',provider:'Former community college',code:'HIST301',title:'My original history course',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},before=structuredClone(source);
  const {result,draft,state}=captureRoute({routeId:'wgu-catalog-ecceaa488637ac83',learning:[source],data});
  assert.deepEqual(source,before);assert.deepEqual(state.learning,[source]);assert(result.unmatchedRecordIds.includes(source.id));assert.match(result.surfaces.school,/My original history course/);assert.match(result.surfaces.school,/evaluation|evaluat/i);
  assert.equal(result.facts.policyChecksComplete,true);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);assert(!result.findings.some(issue=>issue.code==='known-policy-school-request'));
});
test('source-verified mappings retain the student grade eligibility gate',()=>{
  const initial=captureRoute({routeId:'wgu-catalog-ecceaa488637ac83',data}),req=initial.draft.program.requirements.find(req=>req.code==='C715');
  assert(req,'The official Organizational Behavior receiving requirement is present');assert.equal(initial.draft.program.transferRules.businessMinimumGrade,'C');
  const option=req.options.find(option=>option.provider==='Study.com'&&option.evidence==='published'),source={id:'grade-below-minimum',provider:option.provider,code:option.code,title:option.title,credits:option.sourceCredits||option.credits,creditSystem:option.sourceCreditSystem||'semester',grade:'D',completedOn:'2026-11-01',status:'earned',evaluations:[]};
  const {result,draft,state}=captureRoute({routeId:'wgu-catalog-ecceaa488637ac83',learning:[source],data});
  assert(!draft.match.completed.some(placement=>placement.learningId===source.id&&placement.requirementId===req.id));assert(result.unmatchedRecordIds.includes(source.id));assert.equal(state.learning[0].grade,'D');assert.equal(draft.plan.totals.confirmed,0);assert.equal(result.facts.policyChecksComplete,true);
});
test('a program without verified requirements remains unresolved without inventing courses or transfer approval',()=>{
  const {result,draft,state}=captureRoute({routeId:'umpi-bls-management',data});
  assert.equal(draft.program,null);assert.equal(draft.plan,null);assert.equal(result.facts.degreeCredits,null);assert.equal(result.facts.outsideCredits,null);assert.equal(result.facts.policyChecksComplete,false);assert.equal(result.facts.publishedOutsideCredits,0);
  assert.equal(state.profile.degree,'BLS with a Management minor');assert.match(result.surfaces.review,/requirements|course.by.course map|research|not available/i);
  assert.doesNotMatch(result.surfaces.checks,/current requirement counts fit/i);
});
test('focused transcript, enrollment and military requests remain available for personal next steps',()=>{
  for(const [action,expected]of[['send-transcripts',/Where should each college, exam provider or training organization send my official records/],['enroll-at-school',/What remains for admission and registration/],['military-records',/Which original military education records should I send/]]){
    const {result,state}=captureRoute({routeId:'wgu-catalog-ecceaa488637ac83',portalSearch:'?view=school&action='+action,profile:{militaryStatus:'veteran',militaryRecords:'jst'},data});
    assert.match(result.surfaces.school,expected);assert.match(result.surfaces.school,/Copy request/);assert.match(result.surfaces.school,/School rules already in your plan/);assert.equal(state.profile.militaryStatus,'veteran');assert.equal(state.journey.schoolContacted,false);assert.equal(state.learning.length,0);
  }
});
for(const [routeId,rate]of[['wgu-catalog-ecceaa488637ac83',4050],['liberty-business-residential',12695]])test('published course comparison and tuition form use known facts while leaving personal pace unknown: '+routeId,async()=>{
  const {draft,renderers}=captureRoute({routeId,sheetSearch:'?editor=1',data});
  const candidates=draft.plan.rows.filter(row=>row.status==='planned'&&row.option?.provider!=='University'&&row.option?.evidence==='published').sort((a,b)=>draft.program.requirements.find(req=>req.id===a.requirementId).options.length-draft.program.requirements.find(req=>req.id===b.requirementId).options.length);
  assert(candidates.length>0);const comparison=(await renderers.sheet.compare(candidates[0].requirementId)).html;
  assert.match(comparison,/Published transfer match/);assert.doesNotMatch(comparison,/Confirm (?:this|the) (?:course|transfer|placement|equivalency|match) (?:with your school|before enrolling)|(?:written approval|school approval).{0,50}before (?:enrolling|buying|taking)/i);
  const cost=(await renderers.sheet.cost()).html,amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(rate);
  assert(cost.includes(amount));assert.match(cost,/Published university (?:rate|tuition)/);assert.doesNotMatch(cost,/confirm (?:your |the )?billing|billing model/i);assert.doesNotMatch(cost,/Remaining cost estimate/);
  assert.equal(draft.plan.timing.scenarioWeeks,null);assert.equal(draft.plan.costs.total,null);
  if(routeId.startsWith('wgu')){assert.equal(draft.program.pricing.amount,rate);assert.match(cost,/name="universitySubscriptionTerms"[^>]*value=""/);}
  else{assert.equal(draft.program.pricing.termRate,rate);assert.match(cost,/name="termCredits"[^>]*value=""/);}
});
