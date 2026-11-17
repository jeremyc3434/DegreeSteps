const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Momentum = require('./dist/student-progress.js');
const Planner = require('./dist/planner.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const catalog = require('./dist/data/pathways.json');
const models = ['tesu','liberty'].map(name => require('./dist/data/'+name+'.json'));
const liberty = models.find(model => model.id === 'liberty-business-residential');
const tesu = models.find(model => model.id === 'tesu-general-management');
const clone = value => JSON.parse(JSON.stringify(value));
const draftFor = state => Journey.buildDraft(state,catalog,models);
const stateFor = (program = liberty) => Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(path => path.modelId === program.id));
const badge = (summary,id) => summary.milestones.find(item => item.id === id);
function progress(state,program,id,status,optionId) {
  const req = program.requirements.find(item => item.id === id);
  const option = req.options.find(item => item.id === optionId) || req.options.find(item => item.provider === 'Sophia');
  return Sheet.recordProgress(state,program,req,option,status,status === 'confirmed' ? {confirmation:true} : {});
}
function acknowledge(state) {return {...state,momentum:Momentum.advance(state,draftFor(state)).momentum};}
function freeze(value) {if(value && typeof value === 'object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
// A mounted panel surface: tests exercise update's status lifecycle with real
// degree fixtures without running a second browser alongside root's preview.
function mountedPanel() {
  const classes = () => ({add(){},remove(){},toggle(){}});
  const elements = new Map([
    ['.momentum-panel',{querySelectorAll:() => []}],
    ['.momentum-summary',{innerHTML:''}],
    ['.momentum-body',{innerHTML:''}],
    ['.momentum-announcement',{textContent:'',classList:classes()}]
  ]);
  return {hidden:false,classList:classes(),querySelector:selector => elements.get(selector)};
}

test('the browser and CommonJS APIs share pure summaries without network or private storage',() => {
  const browser = {DegreePlanner:Planner};
  vm.runInNewContext(fs.readFileSync('./dist/student-progress.js','utf8'),browser);
  const state = freeze(stateFor()), draft = freeze(draftFor(state)), before = JSON.stringify([state,draft]);
  assert.equal(browser.DegreeMomentum.summarize(state,draft).earnedCount,1);
  assert.equal(Momentum.summarize(state,draft).confirmedTransferCredits,0);
  assert.equal(JSON.stringify([state,draft]),before);
  assert.equal(browser.fetch,undefined); assert.equal(browser.localStorage,undefined);
});

test('a sample target and an unfinished setup never earn a chosen-goal badge',() => {
  const state = Sheet.initialize(null,null,catalog), summary = Momentum.summarize(state,draftFor(state));
  assert.equal(state.sheet.isExample,true); assert.equal(summary.available,false);
  assert.equal(badge(summary,'goal-chosen').earned,false);
  assert.equal(summary.earnedCount,0);
  assert.deepEqual(Momentum.advance(state,draftFor(state)).newlyEarned,[]);
});

test('a first visit establishes an earned baseline without announcing old achievements',() => {
  const state = progress(stateFor(),liberty,'engl-101','completed');
  const next = Momentum.advance(state,draftFor(state));
  assert.equal(next.summary.earnedCount,2); assert.equal(next.changed,true);
  assert.deepEqual(next.newlyEarned,[]);
  const reloaded = {...state,momentum:clone(next.momentum)};
  assert.equal(Momentum.advance(reloaded,draftFor(reloaded)).changed,false);
  assert.deepEqual(Momentum.advance(reloaded,draftFor(reloaded)).newlyEarned,[]);
});

test('reporting a completed course earns its own milestone and never confirms a transfer',() => {
  const before = acknowledge(stateFor());
  const state = progress(before,liberty,'engl-101','completed');
  const next = Momentum.advance(state,draftFor(state));
  assert.equal(next.summary.completedCourses,1);
  assert.equal(next.summary.reportedTransferCredits,3);
  assert.equal(next.summary.confirmedTransferCredits,0);
  assert.deepEqual(next.newlyEarned,['course-finished']);
  assert.equal(badge(next.summary,'transfer-confirmed').earned,false);
});

test('recording explicit school confirmation earns a separate milestone once',() => {
  let state = progress(acknowledge(stateFor()),liberty,'engl-101','completed');
  state = acknowledge(state);
  state = progress(state,liberty,'engl-101','confirmed');
  const next = Momentum.advance(state,draftFor(state));
  assert.equal(next.summary.completedCourses,1);
  assert.equal(next.summary.reportedTransferCredits,0);
  assert.equal(next.summary.confirmedTransferCredits,3);
  assert.deepEqual(next.newlyEarned,['transfer-confirmed']);
  state = {...state,momentum:clone(next.momentum)};
  assert.deepEqual(Momentum.advance(state,draftFor(state)).newlyEarned,[]);
});

test('a source split between requirements counts one completed course and its allocated credit once per requirement',() => {
  let state = progress(stateFor(tesu),tesu,'enc1010','completed','clep-composition-enc1010');
  const summary = Momentum.summarize(state,draftFor(state));
  assert.equal(state.learning.length,1); assert.equal(state.learning[0].credits,6);
  assert.equal(summary.completedCourses,1); assert.equal(summary.reportedTransferCredits,6);
  assert.equal(summary.confirmedTransferCredits,0);
});

test('swapping a planned course or adding community badges never advances completed milestones',() => {
  const initial = acknowledge(stateFor());
  const req = liberty.requirements.find(item => item.id === 'engl-101');
  const university = req.options.find(item => item.provider === 'University');
  const state = Sheet.setCourse(initial,liberty.id,req.id,university.id);
  state.communityVerified = true; state.communityBadges = ['accepted'];
  const next = Momentum.advance(state,draftFor(state));
  assert.equal(next.summary.completedCourses,0); assert.equal(next.summary.confirmedTransferCredits,0);
  assert.deepEqual(next.newlyEarned,[]); assert.equal(next.changed,false);
});

test('an earned university course is a finished course but never a transfer milestone',() => {
  const initial = stateFor(), draft = draftFor(initial);
  const row = draft.plan.rows.find(item => item.option.provider === 'University' && !item.selectionRequired);
  const state = progress(initial,liberty,row.requirementId,'completed',row.option.id);
  const summary = Momentum.summarize(state,draftFor(state));
  assert.equal(summary.completedCourses,1); assert.equal(summary.confirmedTransferCredits,0);
  assert.equal(badge(summary,'transfer-confirmed').earned,false);
});

test('duplicate source records and planned or in-progress learning never inflate finished-course counts',() => {
  const state = stateFor();
  state.learning = [
    {id:'a',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,status:'earned'},
    {id:'b',provider:'Sophia Learning',code:'SOPH-0015',title:'English Composition I',credits:3,status:'earned'},
    {id:'c',provider:'Sophia',code:'OTHER',title:'Another course',credits:3,status:'in-progress'},
    {id:'d',provider:'CLEP',code:'EXAM',title:'Future exam',credits:3,status:'planned'},
    {id:'e',provider:'Study.com',code:'EMPTY',title:'Invalid credits',credits:0,status:'earned'}
  ];
  const summary = Momentum.summarize(state,draftFor(state));
  assert.equal(summary.completedCourses,1); assert.equal(summary.confirmedTransferCredits,0);
});

test('invalid or duplicated degree allocations cannot award confirmed-transfer achievements',() => {
  let state = progress(stateFor(),liberty,'engl-101','completed');
  state = progress(state,liberty,'engl-101','confirmed');
  const draft = draftFor(state), row = draft.plan.rows[0];
  assert.equal(Momentum.summarize(state,draft).confirmedTransferCredits,3);
  draft.plan.rows.push(clone(row));
  const summary = Momentum.summarize(state,draft);
  assert.equal(summary.allocationValid,false); assert.equal(summary.confirmedTransferCredits,0);
  assert.equal(badge(summary,'transfer-confirmed').earned,false);
});

test('the thirty-credit milestone requires thirty allocated school-confirmed outside credits',() => {
  let state = acknowledge(stateFor());
  const draft = draftFor(state);
  for (const row of draft.plan.rows.filter(item => item.option.provider !== 'University').slice(0,10)) {
    state = progress(state,liberty,row.requirementId,'completed',row.option.id);
    state = progress(state,liberty,row.requirementId,'confirmed',row.option.id);
  }
  const next = Momentum.advance(state,draftFor(state));
  assert.equal(next.summary.confirmedTransferCredits,30);
  assert.equal(badge(next.summary,'transfer-30').earned,true);
  assert.deepEqual(next.newlyEarned,['course-finished','transfer-confirmed','transfer-30']);
  assert.equal(next.summary.milestones.some(item => /degree.*earned|graduate/i.test(item.title)),false);
});

test('changing degrees creates a quiet independent baseline and never replays the other plan’s wins',() => {
  let state = progress(acknowledge(stateFor()),liberty,'engl-101','completed');
  state = acknowledge(state);
  const tesuState = Sheet.selectPathway(state,catalog.pathways.find(path => path.modelId === tesu.id));
  const next = Momentum.advance(tesuState,draftFor(tesuState));
  assert.deepEqual(next.newlyEarned,[]);
  assert.deepEqual(next.momentum.programs[liberty.id].seenIds,['goal-chosen','course-finished']);
  assert.deepEqual(next.momentum.programs[tesu.id].seenIds,['goal-chosen','course-finished']);
});

test('removing and restoring a record changes the current badge without farming another celebration',() => {
  const completed = acknowledge(progress(acknowledge(stateFor()),liberty,'engl-101','completed'));
  const removed = {...completed,learning:[]};
  assert.equal(badge(Momentum.summarize(removed,draftFor(removed)),'course-finished').earned,false);
  const again = progress(removed,liberty,'engl-101','completed');
  assert.deepEqual(Momentum.advance(again,draftFor(again)).newlyEarned,[]);
});

test('the live acknowledgement clears if its completed-course record is removed',() => {
  const node = mountedPanel(); let state = stateFor();
  const render = () => Momentum.update(node,state,draftFor(state),{onChange:momentum => {state = {...state,momentum};}});
  render(); assert.equal(node.querySelector('.momentum-announcement').textContent,'');
  state = progress(state,liberty,'engl-101','completed');
  render(); assert.match(node.querySelector('.momentum-announcement').textContent,/completed course recorded/);
  render(); assert.match(node.querySelector('.momentum-announcement').textContent,/completed course recorded/,'Same valid render keeps its acknowledgement');
  state = {...state,learning:[]};
  render(); assert.equal(node.querySelector('.momentum-announcement').textContent,'');
});

test('a withdrawn confirmation or changing plans clears the old transfer acknowledgement',() => {
  const node = mountedPanel(); let state = progress(stateFor(),liberty,'engl-101','completed');
  const render = () => Momentum.update(node,state,draftFor(state),{onChange:momentum => {state = {...state,momentum};}});
  render();
  state = progress(state,liberty,'engl-101','confirmed');
  render(); assert.match(node.querySelector('.momentum-announcement').textContent,/school-confirmed transfer/);
  state = Sheet.updateLearning(state,{...state.learning[0],title:'English Composition I, revised source record'});
  render(); assert.equal(node.querySelector('.momentum-announcement').textContent,'');
  state = progress(state,liberty,'engl-101','confirmed');
  // A different milestone announcement remains only while its own earned state
  // belongs to this program; changing the target clears it even with old data.
  state = {...state,momentum:{version:1,programs:{[liberty.id]:{initialized:true,seenIds:['goal-chosen','course-finished']}}}};
  render(); assert.match(node.querySelector('.momentum-announcement').textContent,/school-confirmed transfer/);
  state = Sheet.selectPathway(state,catalog.pathways.find(path => path.modelId === tesu.id));
  render(); assert.equal(node.querySelector('.momentum-announcement').textContent,'');
  state = {...state,sheet:{...state.sheet,isExample:true}};
  render(); assert.equal(node.hidden,true);assert.equal(node.querySelector('.momentum-announcement').textContent,'');
});

test('a visible milestone toast expires once after six seconds and a valid rerender does not restart its timer',() => {
  const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
  const pending = new Map(); let created = 0;
  global.setTimeout = (callback,delay) => {const timer = {id:++created,unref(){}};pending.set(timer,{callback,delay});return timer;};
  global.clearTimeout = timer => pending.delete(timer);
  try {
    const node = mountedPanel(); let state = stateFor();
    const render = () => Momentum.update(node,state,draftFor(state),{onChange:momentum => {state = {...state,momentum};}});
    render(); assert.equal(created,0);
    state = progress(state,liberty,'engl-101','completed');
    render(); assert.equal(created,1);assert.equal(pending.size,1);
    assert.match(node.querySelector('.momentum-announcement').textContent,/completed course recorded/);
    render(); assert.equal(created,1,'A valid same-node rerender retains the original deadline');
    const expiry = [...pending.values()][0];assert.equal(expiry.delay,6000);
    expiry.callback(); assert.equal(pending.size,0);assert.equal(node.querySelector('.momentum-announcement').textContent,'');
    render(); assert.equal(created,1,'Acknowledged milestones do not replay after expiry');
    state = progress(state,liberty,'engl-101','confirmed');
    render(); assert.equal(created,2);assert.equal(pending.size,1);
    state = {...state,learning:[]};
    render();assert.equal(pending.size,0,'Withdrawing the record cancels the outstanding timer');
    assert.equal(node.querySelector('.momentum-announcement').textContent,'');
  } finally {global.setTimeout = originalSetTimeout;global.clearTimeout = originalClearTimeout;}
});
