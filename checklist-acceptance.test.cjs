const test = require('node:test');
const assert = require('node:assert/strict');
const Checklist = require('./dist/student-checklist.js');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const models = ['tesu','liberty'].map(name => require('./dist/data/'+name+'.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const route = id => catalog.pathways.find(item => item.id === id);
const draft = state => Journey.buildDraft(state,catalog,models);
const model = state => Checklist.build(state,draft(state));
const apply = (state, action) => Checklist.apply(state,draft(state),{...action,planContext:model(state).planContext});
const task = (state,id) => model(state).tasks.find(item => item.id === id);
function fresh(id='tesu-general-management') {
  let state = Sheet.selectPathway(Sheet.initialize(null,null,catalog),route(id));
  state = Journey.initialize(state,null,catalog);
  state.profile.hasPrior = 'none';
  if (id.includes('residential')) state.profile.modality = 'campus';
  return state;
}
function exact(state,school,degree) {
  return {...state,selectedPathwayId:'custom-target',profile:{...state.profile,school,schoolChoice:school,degree,pathwayId:'custom-target'}};
}

test('zero-credit, old-credit, military, campus and unlisted learners get relevant actionable steps', () => {
  const zero = fresh();
  assert.equal(task(zero,'choose-goal').status,'done');
  assert.equal(task(zero,'gather-records'),undefined);
  assert.ok(model(zero).tasks.some(item => item.kind === 'course'));
  const old = Sheet.updateLearning(zero,{id:'past-english',provider:'Old College',title:'English',credits:null,creditSystem:null,status:'earned'});
  assert.ok(task(old,'gather-records'));
  assert.ok(task(old,'send-transcripts'));
  assert.equal(model(old).tasks.filter(item=>item.kind==='course'&&item.status==='done').length,0);
  const service = clone(zero);
  Object.assign(service.profile,{militaryStatus:'veteran',militaryBranch:'air-force',militaryRecords:'not-sure'});
  assert.match(task(service,'military-records').title,/CCAF/);
  const campus = fresh('liberty-business-residential');
  assert.equal(model(campus).scope,'liberty-business-residential');
  assert.ok(model(campus).tasks.some(item => item.kind === 'course'));
  const unlisted = exact(zero,'Example University','Psychology BS');
  assert.ok(task(unlisted,'get-requirements'));
  assert.equal(model(unlisted).tasks.some(item=>item.kind==='course'),false);
  assert.equal(task(unlisted,'finish-coursework').status,'todo');
});

test('custom task status, date, notes, editing, undo and deletion survive reload without changing academic data', () => {
  let state = fresh();
  const original = clone(state);
  state = apply(state,{type:'add-task',title:'Ask about evening classes',dueOn:'2028-02-29',notes:'Private family schedule'});
  let custom = model(state).tasks.find(item=>item.custom);
  assert.equal(custom.status,'todo');
  for (const status of ['doing','waiting','done','todo']) {
    state = apply(state,{type:'set-task',taskId:custom.id,status});
    state = Journey.initialize(JSON.stringify(state),null,catalog);
    custom = task(state,custom.id);
    assert.equal(custom.status,status);
    assert.equal(custom.dueOn,'2028-02-29');
    assert.equal(custom.notes,'Private family schedule');
  }
  state = apply(state,{type:'edit-task',taskId:custom.id,title:'Check evening registration',dueOn:'',notes:''});
  assert.equal(task(state,custom.id).title,'Check evening registration');
  assert.equal(task(state,custom.id).dueOn,'');
  state = apply(state,{type:'delete-task',taskId:custom.id});
  assert.equal(task(state,custom.id),undefined);
  const {checklist,...unchanged} = state;
  assert.deepEqual(unchanged,original);
});

test('degree switching preserves each task collection and distinguishes Unicode exact targets', () => {
  let state = apply(fresh(),{type:'add-task',title:'Ask TESU advisor'});
  const firstScope = model(state).scope;
  state = Sheet.selectPathway(state,route('liberty-business-residential'));
  state.profile.modality = 'campus';
  assert.equal(model(state).tasks.some(item=>item.title==='Ask TESU advisor'),false);
  state = apply(state,{type:'add-task',title:'Ask Liberty advisor'});
  state = Sheet.selectPathway(state,route('tesu-general-management'));
  state.profile.modality = 'online';
  assert.equal(model(state).scope,firstScope);
  assert.ok(model(state).tasks.some(item=>item.title==='Ask TESU advisor'));
  assert.equal(model(state).tasks.some(item=>item.title==='Ask Liberty advisor'),false);
  const first = exact(state,'北京大学','计算机科学');
  const second = exact(state,'清华大学','计算机科学');
  assert.notEqual(model(first).scope,model(second).scope);
});

test('manual Done is a task acknowledgement and never creates source records or school awards', () => {
  let state = fresh();
  const academic = clone(state);
  for (const id of ['review-plan','request-school-feedback','review-school-feedback','enroll-at-school','apply-to-graduate']) {
    state = apply(state,{type:'set-task',taskId:id,status:'done'});
    assert.equal(task(state,id).status,'done');
  }
  const {checklist,...unchanged} = state;
  assert.deepEqual(unchanged,academic);
  assert.equal(draft(state).plan.totals.confirmed,0);
  const automatic = model(state).tasks.find(item=>item.kind==='course');
  assert.throws(()=>apply(state,{type:'set-task',taskId:automatic.id,status:'done'}));
});

test('course tasks follow actual source progress, and source completion stays separate from school acceptance', () => {
  let state = fresh();
  let built = model(state), degree = draft(state);
  const first = built.tasks.find(item=>item.kind==='course');
  const reqId = first.requirementIds[0];
  const row = degree.plan.rows.find(item=>item.requirementId===reqId);
  const requirement = degree.program.requirements.find(item=>item.id===reqId);
  state = Sheet.recordProgress(state,degree.program,requirement,row.option,'in-progress');
  assert.equal(task(state,first.id).status,'doing');
  state = Sheet.recordProgress(state,degree.program,requirement,row.option,'completed');
  assert.equal(task(state,first.id).status,'done');
  assert.equal(state.learning.length,1);
  assert.ok(state.learning[0].evaluations.every(item=>item.status==='reported'));
  assert.equal(draft(state).plan.totals.confirmed,0);
  state = Sheet.updateLearning(state,{...state.learning[0],status:'planned'});
  assert.equal(task(state,first.id).status,'todo');
  const forged = draft(state);
  forged.plan.rows.find(item=>item.requirementId===reqId).status='reported';
  assert.notEqual(Checklist.build(state,forged).tasks.find(item=>item.id===first.id)?.status,'done');
});

test('one bundled enrollment retains one checklist reminder through actual completion', () => {
  let state = Sheet.setCourse(fresh(),'tesu-general-management','enc1010','clep-composition-enc1010');
  let degree = draft(state), built = Checklist.build(state,degree);
  const source = built.tasks.find(item=>item.requirementIds?.includes('enc1010'));
  assert.deepEqual(source.requirementIds,['enc1010','enc1020']);
  assert.equal(built.tasks.filter(item=>item.requirementIds?.includes('enc1020')).length,1);
  state = Checklist.apply(state,degree,{type:'set-task',taskId:source.id,dueOn:'2028-01-01',notes:'One exam enrollment',planContext:built.planContext});
  const requirement = degree.program.requirements.find(item=>item.id==='enc1010');
  const row = degree.plan.rows.find(item=>item.requirementId==='enc1010');
  state = Sheet.recordProgress(state,degree.program,requirement,row.option,'completed');
  built = model(state);
  const finished = built.tasks.find(item=>item.id===source.id);
  assert.equal(state.learning.length,1);
  assert.equal(state.learning[0].credits,6);
  assert.equal(finished.status,'done');
  assert.equal(finished.dueOn,'2028-01-01');
  assert.equal(finished.notes,'One exam enrollment');
  assert.equal(built.tasks.filter(item=>item.requirementIds?.includes('enc1020')).length,1);
});

test('academic changes reopen plan reviews; pricing and private task edits preserve them', () => {
  let state = apply(fresh(),{type:'set-task',taskId:'review-plan',status:'done'});
  state = apply(state,{type:'add-task',title:'Call after work'});
  assert.equal(task(state,'review-plan').status,'done');
  const id = model(state).scope;
  state = {...state,scenarios:{...state.scenarios,[id]:{...state.scenarios[id],universityRate:315,fees:90,sophiaMonths:3}}};
  assert.equal(task(state,'review-plan').status,'done');
  const token = model(state).planContext;
  state = Sheet.updateLearning(state,{id:'new-learning',provider:'Previous College',title:'History',credits:3,creditSystem:'semester',status:'earned'});
  assert.equal(task(state,'review-plan').status,'todo');
  assert.equal(task(state,'review-plan').reopened,true);
  assert.throws(()=>Checklist.apply(state,draft(state),{type:'set-task',taskId:'review-plan',status:'done',planContext:token}),/changed|current|review/i);
});

test('mixed degree state and old drafts cannot save a checklist change under the wrong target', () => {
  const previous = fresh(), oldDraft = draft(previous);
  const changed = Sheet.selectPathway(previous,route('liberty-business-residential'));
  const mixed = Checklist.build(changed,oldDraft);
  assert.equal(mixed.valid,false);
  assert.throws(()=>Checklist.apply(changed,oldDraft,{type:'add-task',title:'For the new degree',planContext:mixed.planContext}));
});

test('removing transfer providers cannot reuse a previous draft that still recommends them', () => {
  const previous = draft(fresh());
  const state = previous.state;
  const scope = previous.program.id;
  const changed = {...state,scenarios:{...state.scenarios,[scope]:{...state.scenarios[scope],providers:[]}}};
  const mixed = Checklist.build(changed,previous);
  assert.equal(mixed.valid,false);
  assert.throws(()=>Checklist.apply(changed,previous,{type:'add-task',title:'Changed providers',planContext:mixed.planContext}));
});

test('custom tasks and private notes stay out of public plans and worksheet CSV', () => {
  let state = apply(fresh(),{type:'add-task',title:'PRIVATE-TASK-SENTINEL',notes:'PRIVATE-NOTE-SENTINEL'});
  state = apply(state,{type:'set-task',taskId:'review-plan',notes:'PRIVATE-REVIEW-SENTINEL',dueOn:'2029-01-01'});
  const degree = draft(state);
  const shared = JSON.stringify(Sheet.publicPlan(degree.program,degree.plan,degree.pathway,state.profile.priority));
  const csv = Sheet.exportCSV(degree.program,degree.plan);
  assert.doesNotMatch(shared+'\n'+csv,/PRIVATE-(?:TASK|NOTE|REVIEW)-SENTINEL|2029-01-01/);
  assert.match(JSON.stringify(state),/PRIVATE-TASK-SENTINEL/);
});

test('opening an older account plan retains current private checklist collections', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  let current = apply(fresh(),{type:'add-task',title:'Current TESU advisor question'});
  current = Sheet.selectPathway(current,route('liberty-business-residential'));
  current.profile.modality = 'campus';
  current = apply(current,{type:'add-task',title:'Current Liberty housing question'});
  const older = fresh();
  const storage = new Map([['degreepath-guide-v3',JSON.stringify(current)]]);
  const context = {
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    fetch:async path=>({ok:true,status:200,json:async()=>path.endsWith('/session')?{user:{id:'student'}}:{item:{id:'older-cloud-plan',revision:1,state:older}}})
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./dist/account-client.js'),'utf8'),context);
  await context.DegreeAccount.openPlan('older-cloud-plan');
  const restored = JSON.parse(storage.get('degreepath-guide-v3'));
  assert.deepEqual(restored.checklist,current.checklist);
  assert.equal(restored.selectedPathwayId,'tesu-general-management');
});

test('invalid dates, oversized private notes and excess custom tasks fail without changing the saved plan', () => {
  let state = fresh();
  const degree = draft(state);
  const save = action => Checklist.apply(state,degree,{...action,planContext:Checklist.build(state,degree).planContext});
  assert.throws(()=>save({type:'add-task',title:'Deadline',dueOn:'2027-02-29'}));
  assert.throws(()=>save({type:'add-task',title:'Note',notes:'x'.repeat(1001)}));
  assert.equal(state.checklist,undefined);
  for (let index=0;index<Checklist.limits.maxCustom;index++) state=save({type:'add-task',title:'Task '+index});
  const before = clone(state);
  assert.throws(()=>save({type:'add-task',title:'One too many'}));
  assert.deepEqual(state,before);
  assert.equal(model(state).tasks.filter(item=>item.custom).length,50);
});
