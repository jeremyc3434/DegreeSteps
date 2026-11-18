/* Synthetic policy changes must reopen review without changing student records. */
const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
function fixture(program){
 const route=catalog.pathways.find(route=>route.modelId===program.id);assert(route);
 const initial=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);
 initial.profile.goal='career-growth';initial.profile.modality='online';initial.journey.answers.purpose='career-growth';
 initial.learning=[{id:'original-algebra',provider:'Sophia',code:'SOPH-0001',title:'College Algebra',credits:3,creditSystem:'semester',status:'earned',grade:'A',completedOn:'2026-09-01',evaluations:[]}];
 const draft=Journey.buildDraft(initial,catalog,[program]),state=copy(draft.state),signature=Journey.draftSignature(state,draft);
 Object.assign(state.journey,{planReviewed:true,schoolContacted:true,reviewedSignature:signature,schoolContactedSignature:signature});
 return{state,draft,signature};
}
const taskMap=(state,draft)=>new Map(Journey.tasks(state,draft).map(task=>[task.id,task]));
test('a synthetic completed-credit prerequisite change reopens review and school confirmation',()=>{
 const model=copy(require('./dist/data/curricula/liberty-history-online.json').models[0]),f=fixture(model);
 const requirement=model.requirements.find(row=>row.code==='HIST 491');assert(requirement?.minimumCompletedCredits>0);
 const before=taskMap(f.state,f.draft);for(const id of ['choices','credits','plan','school'])assert.equal(before.get(id).complete,true,id);
 const originalRecords=JSON.stringify(f.state.learning),originalState=JSON.stringify(f.state),originalModel=JSON.stringify(model);
 // This is a hypothetical policy correction; the published Liberty model is not edited.
 const changed=copy(model);changed.requirements.find(row=>row.id===requirement.id).minimumCompletedCredits+=18;
 const updated=Journey.buildDraft(f.state,catalog,[changed]);
 assert.equal(updated.plan.validation.academicCountsValid,true);
 assert.equal(updated.plan.rows.find(row=>row.requirementId===requirement.id).minimumCompletedCredits,requirement.minimumCompletedCredits+18);
 assert.notEqual(Journey.draftSignature(f.state,updated),f.signature);
 const after=taskMap(f.state,updated);for(const id of ['plan','school'])assert.equal(after.get(id).complete,false,id);
 for(const id of ['choices','credits'])assert.equal(after.get(id).complete,true,id);
 assert.equal(JSON.stringify(updated.state.learning),originalRecords);assert.equal(JSON.stringify(f.state),originalState);assert.equal(JSON.stringify(model),originalModel);
});
test('navigation preserves review signatures including a positive completed-credit prerequisite',()=>{
 const f=fixture(copy(require('./dist/data/curricula/liberty-history-online.json').models[0]));
 const navigated=copy(f.state);navigated.journey.view='questions';navigated.journey.step='routes';
 assert.equal(Journey.draftSignature(navigated,f.draft),f.signature);
 const tasks=taskMap(navigated,f.draft);assert.equal(tasks.get('plan').complete,true);assert.equal(tasks.get('school').complete,true);
});
test('zero and absent thresholds do not change the legacy signature of a plan without thresholds',()=>{
 const f=fixture(copy(require('./dist/data/tesu.json')));
 assert(f.draft.plan.rows.every(row=>!row.minimumCompletedCredits));
 assert(JSON.parse(f.signature).rows.every(row=>!Object.hasOwn(row,'minimumCompletedCredits')));
 const withoutDefaults=copy(f.draft);withoutDefaults.plan.rows.forEach(row=>{delete row.minimumCompletedCredits;});
 assert.equal(Journey.draftSignature(f.state,withoutDefaults),f.signature,'A zero default must not invalidate an otherwise unchanged prior review');
});
