const test=require('node:test'),assert=require('node:assert/strict');
const {worksheet}=require('./test-support/student-flow-harness.cjs'),{loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),CoursePlan=require('./dist/course-plan-view.js');
const data=loadData(),WGU='wgu-catalog-ecceaa488637ac83';
function seed(routeId=WGU){const route=data.catalog.pathways.find(route=>route.id===routeId);let state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state=Journey.setPriorCredits(state,'none');state.journey.completed=true;return state;}
test('editing a university competency-unit record retains its known original units in the actual form',async()=>{
  const state=seed();state.profile.hasPrior='some';state.journey.answers.prior='some';state.learning=[{id:'known-wgu-course',provider:'University',institution:'Western Governors University',sourceProgramId:'curriculum-wgu-catalog-ecceaa488637ac83',code:'C715',title:'Organizational Behavior',credits:3,creditSystem:'competency-unit',status:'earned',grade:'A',completedOn:'2026-11-01',evaluations:[]}];
  const ui=worksheet(state,data),html=ui.edit('known-wgu-course').html;
  assert.match(html,/<option value="competency-unit" selected/,'A known CU record must not fall back to the blank units option when edited');
  assert.doesNotMatch(html,/3 credits · units need checking/);
  await ui.submitRecord('known-wgu-course',{provider:'University',code:'C715',title:'Organizational Behavior',credits:'3',creditSystem:'competency-unit',status:'earned',completedOn:'2026-11-01',grade:'A',score:''});
  const next=ui.saved().learning.find(record=>record.id==='known-wgu-course');assert.equal(next.creditSystem,'competency-unit');assert.equal(next.credits,3);assert.equal(next.institution,'Western Governors University');assert.equal(next.sourceProgramId,'curriculum-wgu-catalog-ecceaa488637ac83');
});
test('starting and finishing a named university course updates progress without granting school confirmation',async()=>{
  const state=seed(),ui=worksheet(state,data),initial=ui.draft(),row=initial.plan.rows.find(row=>row.option.provider==='University'&&row.option.code&&row.status==='planned');assert(row);
  await ui.progress(row.requirementId,'in-progress');let next=ui.saved(),draft=Journey.buildDraft(next,data.catalog,data.models),progress=CoursePlan.progress(draft);
  const record=next.learning.find(record=>record.sourceProgramId===initial.program.id&&record.code===row.option.code);assert(record);assert.equal(record.creditSystem,'competency-unit');assert.equal(record.status,'in-progress');assert.equal(progress.inProgressCredits,row.credits);assert.equal(progress.completedCredits,0);
  await ui.progress(row.requirementId,'completed');next=ui.saved();draft=Journey.buildDraft(next,data.catalog,data.models);progress=CoursePlan.progress(draft);
  assert.equal(next.learning.find(item=>item.id===record.id).status,'earned');assert.equal(progress.inProgressCredits,0);assert.equal(progress.completedCredits,row.credits);assert.equal(progress.confirmedCredits,0);assert.equal(draft.plan.totals.confirmed,0);
});
test('changing school preserves university CU coursework without converting it into semester credit',async()=>{
  const ui=worksheet(seed(),data),draft=ui.draft(),row=draft.plan.rows.find(row=>row.option.provider==='University'&&row.option.code&&row.status==='planned');await ui.progress(row.requirementId,'completed');
  const before=ui.saved(),source=before.learning[0];assert.equal(source.creditSystem,'competency-unit');
  assert.equal(await ui.choose('liberty-business-residential',true),true);
  const next=ui.saved(),after=Journey.buildDraft(next,data.catalog,data.models);assert.deepEqual(next.learning,before.learning);assert.equal(next.profile.school,'Liberty University');assert.equal(after.plan.totals.confirmed,0);assert.equal(after.plan.totals.reported,0);assert(after.match.unmatched.some(record=>record.id===source.id));assert(next.whatIf.snapshots.some(snapshot=>snapshot.pathwayId===WGU));
});
test('a completed competency-unit record is available for a school-evaluated placement after a school change',()=>{
  const state=seed('liberty-business-residential');state.learning=[{id:'original-cu-course',provider:'University',institution:'Western Governors University',sourceProgramId:'previous-wgu-degree',code:'C715',title:'Organizational Behavior',credits:3,creditSystem:'competency-unit',status:'earned',grade:'Pass',completedOn:'2026-11-01',evaluations:[]}];state.profile.hasPrior='some';state.journey.answers.prior='some';
  const before=structuredClone(state.learning),ui=worksheet(state,data),row=ui.draft().plan.rows.find(row=>row.status==='planned'&&row.option);assert(row);
  const html=ui.row(row.requirementId).html;
  assert.match(html,/<option value="original-cu-course"/,'Known original CUs must be available for explicit evaluation; do not require the student to relabel them as semester credits');
  assert.match(html,/name="confirmation"/,'Cross-unit placement must retain the school-evaluation acknowledgment');assert.deepEqual(ui.state().learning,before,'Opening the choice must not convert or approve the original record');
});
