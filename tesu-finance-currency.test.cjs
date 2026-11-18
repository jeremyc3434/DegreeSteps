/* Business course-age tasks follow their exact degree and original records. */
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./dist/program-catalog.js'),J=require('./dist/journey-engine.js'),P=require('./dist/planner.js');
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(name='tesu-finance'){
 const model=copy(require('./dist/data/curricula/'+name+'.json').models[0]),route=catalog.pathways.find(route=>route.modelId===model.id);assert(route);
 const state=J.selectRoute(J.initialize(null,null,catalog),route,catalog);state.profile.modality='online';
 return{model,state,build(){return J.buildDraft(this.state,catalog,[this.model]);}};
}
function earned(f,code,{status='earned',confirmed=false,programId=f.model.id}={}){
 const row=f.model.requirements.find(row=>row.code===code);assert(row);
 return{id:'original-'+row.id,provider:'University',institution:f.model.school,sourceProgramId:f.model.id,creditOrigin:'institutional',code,title:row.title,credits:row.credits,creditSystem:'semester',status,grade:'A',completedOn:'2000-01-01',evaluations:confirmed?[{programId,requirementId:row.id,status:'confirmed',credits:row.credits,upper:row.upper}]:[]};
}
const tasks=draft=>draft.plan.personalTasks.filter(task=>task.field==='existing-credit-currency');
test('Finance fresh and future-course plans avoid old-credit tasks, while original earned Finance and capstone work receives exact tasks',()=>{
 for(const status of [null,'saved','in-progress','earned']){
  const f=fixture();if(status)f.state.learning=[earned(f,'FIN-3310',{status}),earned(f,'BUS-4210',{status})];
  const before=JSON.stringify([f.state,f.model]),draft=f.build();assert.equal(JSON.stringify([f.state,f.model]),before);
  assert.equal(tasks(draft).length,status==='earned'?2:0);
  if(status==='earned'){
   assert.equal(draft.plan.existingCreditReviewPending,true);assert.equal(draft.plan.validation.academicCountsValid,true);
   assert(tasks(draft).some(task=>/18 Finance.*ten years/.test(task.message)));assert(tasks(draft).some(task=>/five years/.test(task.message)));
   assert.deepEqual(P.validate(draft.program,draft.plan).personalTasks,draft.plan.personalTasks);
  }
 }
});
test('nine older Finance credits remain in the proposed allocation without becoming an automatic age approval',()=>{
 const f=fixture();f.state.learning=['FIN-3310','FIN-3340','FIN-3140'].map(code=>earned(f,code));const draft=f.build();
 assert.equal(draft.match.completed.length,3);assert.equal(tasks(draft).length,1);assert.equal(tasks(draft)[0].learningIds.length,3);assert.match(tasks(draft)[0].message,/up to 9 older credits may still apply/);
});
test('only exact confirmed Finance evaluations resolve currency tasks; malformed evidence is an operator research issue',()=>{
 for(const programId of ['curriculum-tesu-bsba-finance','curriculum-tesu-bsba-accounting']){
  const f=fixture();f.state.learning=[earned(f,'FIN-3310',{confirmed:true,programId})];assert.equal(tasks(f.build()).length,programId===f.model.id?0:1);
 }
 const f=fixture();f.state.learning=[earned(f,'FIN-3310')];f.model.existingCreditReview.sourceIds=['missing-source'];const draft=f.build();
 assert.equal(tasks(draft).length,0);assert(draft.plan.validation.errors.some(error=>error.code==='program_research'&&/Finance course-age/.test(error.message)));
});
test('the business age rule is not imposed on the new B.A. Psychology',()=>{
 const f=fixture('tesu-psychology');f.state.learning=[earned(f,'PSY-3500')];const draft=f.build();assert.equal(draft.match.completed.length,1);assert.equal(tasks(draft).length,0);assert.equal(draft.plan.existingCreditReviewPending,undefined);
});
