/* Course-age review is personal and application-date based, not a blanket ban. */
const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Planner=require('./dist/planner.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
function fixture(){
 const model=clone(require('./dist/data/curricula/tesu-accounting.json').models[0]);
 assert.equal(model.existingCreditReview?.kind,'tesu-accounting-course-currency','The production template must carry its source-bound review rule');
 const route=catalog.pathways.find(route=>route.modelId===model.id);assert(route);
 const state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality='online';
 return{model,state,build(){return Journey.buildDraft(this.state,catalog,[this.model]);}};
}
function record(f,code,{status='earned',date='2000-01-01',evaluation='reported',evaluationProgram=f.model.id}={}){
 const requirement=f.model.requirements.find(row=>row.code===code);assert(requirement);
 return{id:'original-'+requirement.id,provider:'University',institution:f.model.school,sourceProgramId:f.model.id,creditOrigin:'institutional',code,title:requirement.title,credits:requirement.credits,creditSystem:'semester',status,completedOn:date,evaluations:evaluation?[{programId:evaluationProgram,requirementId:requirement.id,status:evaluation,credits:requirement.credits,upper:requirement.upper}]:[]};
}
function currencyTasks(draft){return draft.plan.personalTasks.filter(task=>task.field==='existing-credit-currency');}
test('fresh plans and saved or in-progress Accounting courses get no course-age homework',()=>{
 for(const status of [null,'saved','in-progress']){const f=fixture();if(status)f.state.learning=[record(f,'ACC-2010',{status})];const draft=f.build();assert.equal(currencyTasks(draft).length,0);assert.equal(draft.plan.existingCreditReviewPending,undefined);}
});
test('allocated old or undated Accounting records receive a precise personal review without rejecting permitted older credit',()=>{
 for(const date of ['2000-01-01','']){
  const f=fixture();f.state.learning=[record(f,'ACC-2010',{date}),record(f,'ACC-2020',{date}),record(f,'ACC-3030',{date})];
  const before=JSON.stringify([f.state,f.model]),draft=f.build(),tasks=currencyTasks(draft);
  assert.equal(tasks.length,1);assert.equal(tasks[0].owner,'student');assert.equal(tasks[0].status,'personal-task');assert.equal(tasks[0].learningIds.length,3);
  assert.match(tasks[0].message,/9.*18/);assert.match(tasks[0].message,/application date/);assert.match(tasks[0].message,/up to 9 older credits may still apply/);
  assert.equal(draft.plan.existingCreditReviewPending,true);assert.equal(draft.plan.provisional,true);assert.equal(draft.plan.validation.academicCountsValid,true);
  assert.equal(draft.match.completed.length,3);assert.equal(JSON.stringify([f.state,f.model]),before);
  assert.deepEqual(Planner.validate(draft.program,draft.plan).personalTasks,draft.plan.personalTasks,'revalidation keeps the source-bound individual task');
  assert(draft.guidance.personalTasks.some(task=>task.id===tasks[0].id));
 }
});
test('same-school capstone work still needs its five-year application-date review',()=>{
 const f=fixture();f.state.learning=[record(f,'BUS-4210',{evaluation:null})];const draft=f.build(),tasks=currencyTasks(draft);
 assert.equal(tasks.length,1);assert.match(tasks[0].message,/BUS-4210/);assert.match(tasks[0].message,/five years/);assert.match(tasks[0].message,/application date/);
 assert.deepEqual(tasks[0].requirementIds,['bus4210']);assert.equal(draft.plan.existingCreditReviewPending,true);
});
test('only confirmed evaluations for this exact destination requirement resolve the individual review',()=>{
 const f=fixture();f.state.learning=[record(f,'ACC-2010',{evaluation:'confirmed'}),record(f,'BUS-4210',{evaluation:'confirmed'})];
 assert.equal(currencyTasks(f.build()).length,0);
 const other=fixture();other.state.learning=[record(other,'ACC-2010',{evaluation:'confirmed',evaluationProgram:'tesu-general-management'})];
 assert.equal(currencyTasks(other.build()).length,1,'another degree approval does not settle this Accounting review');
});
test('invalid or absent policy evidence cannot silently clear the existing-course currency review',()=>{
 for(const mutate of [m=>delete m.existingCreditReview,m=>m.existingCreditReview.sourceIds=['missing-source'],m=>m.existingCreditReview.groups[0].maxOlderCredits=18,m=>m.existingCreditReview.groups[0].requirementIds=['acc2010'],m=>m.sources=m.sources.filter(source=>!m.existingCreditReview.sourceIds.includes(source.id))]){
  const f=fixture();f.state.learning=[record(f,'ACC-2010')];mutate(f.model);const draft=f.build();
  assert.equal(draft.plan.existingCreditReviewPending,true);assert.equal(currencyTasks(draft).length,0,'a missing school rule is not assigned to the student');
  assert(draft.plan.validation.errors.some(issue=>issue.code==='program_research'&&issue.field==='existing-credit-currency'));
 }
});
