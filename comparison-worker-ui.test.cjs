const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('./dist/plan-comparison-engine.js');
const Catalog = require('./dist/program-catalog.js');
const CourseLibrary = require('./dist/course-library-engine.js');
const Journey = require('./dist/journey-engine.js');
const Guide = require('./dist/guide-engine.js');
const Sheet = require('./dist/sheet-state.js');

const KEY = 'degreepath-guide-v3';
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(config={}) {
  const full = Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json'));
  const currentRoute=full.pathways.find(item=>item.modelId==='liberty-business-residential');
  const route=config.active?full.pathways.find(item=>item.id==='tesu-general-management'):currentRoute;
  let state=config.active?Journey.initialize(Sheet.selectPathway(CourseLibrary.initialize(null),currentRoute),null,full):CourseLibrary.initialize(null);
  state.whatIf = {version:1, goalReady:true, selectedIds:['route:'+route.id]};
  state.learning = [{id:'original-record', provider:'Sophia', code:'SOPH-0015', title:'English Composition I', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
  const models=[require('./dist/data/liberty.json'),...(config.active?[require('./dist/data/tesu.json')]:[])];
  let currentDraft=null;
  if(config.active){state.sheet.notes={private:{note:'Keep my original private note'}};state.scenarios={'liberty-business-residential':{universityRate:432,optionSelections:{}}};state.savings={'liberty-business-residential':{fees:123}};currentDraft=Journey.buildDraft(state,full,models);for(let index=0;index<(config.snapshotCount||0);index++)state=Engine.saveScenario(state,currentDraft,'Saved version '+index);}
  return {state, route, currentDraft,catalog:{...full, pathways:config.active?[currentRoute,route]:[route]}, models, costs:require('./dist/data/cost-comparisons.json')};
}

function resultView(data, label, selections = {}) {
  const id = 'route:'+data.route.id;
  return {
    scenarios:[...(data.currentDraft?[{id:'current',label:'Current degree',isCurrent:true,available:true,eligible:true,canUse:true,draft:data.currentDraft,summary:{degreeCredits:120}}]:[]),{id, label, available:true, eligible:true, canUse:true, isCurrent:false, draft:{pathway:data.route}, summary:{degreeCredits:120, applicableCompletedCredits:3, confirmedCredits:0, collectionFitCredits:3, potentialCollectionCredits:0, collectionFitFraction:0.025, completedFitFraction:0.025, remainingCredits:117, universityCreditsRemaining:30, collectionSelections:selections}}],
    courses:[], matrix:[], matrixDeferred:false, courseFirst:!data.currentDraft, hasTarget:Boolean(data.currentDraft), selectedIds:[...(data.currentDraft?['current']:[]),id], mappedProgramsChecked:1
  };
}

function mount(config={}) {
  const data = fixture(config), nodes = new Map(), events = new Map(), timers = new Map(), jobs = [], runners = [], writes = [], navigations = [];
  const storage = new Map([[KEY, JSON.stringify(data.state)]]);
  let timerId = 0;
  function node(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      nodes.set(id, {
        id, value:'', checked:false, hidden:false, disabled:false, open:false, innerHTML:'', textContent:'', dataset:{}, listeners, elements:{label:{value:'',focus(){}}},
        addEventListener(type, callback) {if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback);},
        emit(type, event = {}) {return (listeners.get(type) || []).map(callback => callback({target:this, preventDefault() {}, ...event}));},
        setAttribute(name, value) {this[name] = value;}, removeAttribute(name) {delete this[name];},
        showModal() {this.open = true;}, close() {this.open = false;}, focus() {},
        closest() {return this;}, querySelectorAll() {return [];}, querySelector(selector) {return selector==='[type=submit]'?node(id+'-submit'):null;}
      });
    }
    return nodes.get(id);
  }
  node('compare-priority').value = 'collection';
  node('comparison-filter').value = 'all';
  const fakeRunner = {
    create(config) {
      const runner = {
        config, cancellations:0, workerAvailable:true,
        run(kind, payload, callbacks={}) {return new Promise((resolve, reject) => jobs.push({runner, kind, payload:clone(payload), onProgress:callbacks.onProgress, resolve, reject}));},
        // Keep old fake jobs resolvable to check the page's own revision guard.
        cancel() {this.cancellations++;}, destroy() {this.cancel();}
      };
      runners.push(runner);
      return runner;
    }
  };
  const context = {
    console, URL, URLSearchParams, Intl,
    document:{getElementById:node, querySelector(selector) {return selector === 'dialog[open]' ? [...nodes.values()].find(item => item.open) || null : node(selector);}, addEventListener(type, callback) {if (!events.has(type)) events.set(type, []); events.get(type).push(callback);}},
    location:{search:'?from=courses', assign(value) {navigations.push(value);}},
    localStorage:{getItem:key => storage.get(key) || null, setItem(key, value) {storage.set(key, value); writes.push({key, value:JSON.parse(value)});}},
    CustomEvent:class {constructor(type, options) {this.type = type; this.detail = options?.detail;}},
    setTimeout(callback) {timers.set(++timerId, callback); return timerId;}, clearTimeout(id) {timers.delete(id);},
    addEventListener() {}, dispatchEvent() {},
    DegreePlanComparison:{...Engine, build() {throw Error('The page must dispatch comparison builds through its runner.');}, courseMatrix() {throw Error('The page must dispatch matrix calculations through its runner.');}},
    DegreeComparisonRunner:fakeRunner, DegreeProgramCatalog:{...Catalog,...config.catalogOverrides}, DegreeCourseLibrary:CourseLibrary, DegreeJourney:Journey, DegreeGuide:Guide,
    __fixture:{...data, view:resultView(data, 'Initial option')}
  };
  context.window = context;
  const source = fs.readFileSync(path.join(__dirname, 'dist/compare-plans.js'), 'utf8');
  const boot = source.indexOf(' (async()=>{try{const data=await Promise.all');
  assert(boot > 0, 'the production comparison boot boundary must be identifiable');
  const hooks = 'state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;costs=__fixture.costs;view=__fixture.view;window.__comparisonTest={render,previewUse,renderSaved,getView:()=>view};}());';
  vm.runInNewContext(source.slice(0, boot)+hooks, context, {filename:'compare-plans.js'});
  return {
    data, node, jobs, runners, writes, navigations, api:context.__comparisonTest,
    saved() {return JSON.parse(storage.get(KEY));},
    updateSaved(update) {const fresh = JSON.parse(storage.get(KEY)); update(fresh); storage.set(KEY, JSON.stringify(fresh)); return fresh;},
    async flush() {for (let turn = 0; turn < 15; turn++) {const queued = [...timers.values()]; timers.clear(); for (const callback of queued) callback(); await Promise.resolve();}},
    async clickUse() {const button = {dataset:{usePlan:'route:'+data.route.id}, closest() {return this;}, hasAttribute() {return false;}, matches() {return false;}}; for (const callback of events.get('click') || []) await callback({target:button});},
    async click(dataset={},attributes=[]){const button={dataset,textContent:'Check official requirements',disabled:false,closest(){return this;},hasAttribute(name){return attributes.includes(name);},matches(){return false;}};for(const callback of events.get('click')||[])await callback({target:button});return button;},
    confirm() {return node('comparison-confirm-use').emit('click');}
  };
}

test('a late comparison render cannot overwrite cards from the latest priority change', async () => {
  const ui = mount();
  ui.api.render();
  await ui.flush();
  assert.equal(ui.jobs.length, 1);
  ui.node('compare-priority').value = 'credits';
  ui.node('compare-priority').emit('change');
  await ui.flush();
  assert.equal(ui.jobs.length, 2);
  assert.equal(ui.jobs[0].kind, 'build');
  assert.equal(ui.jobs[1].payload.options.priority, 'credits');
  ui.jobs[1].resolve(resultView(ui.data, 'Latest degree option'));
  await ui.flush();
  assert.match(ui.node('comparison-results').innerHTML, /Latest degree option/);
  ui.jobs[0].resolve(resultView(ui.data, 'Outdated degree option'));
  await ui.flush();
  assert.match(ui.node('comparison-results').innerHTML, /Latest degree option/);
  assert.doesNotMatch(ui.node('comparison-results').innerHTML, /Outdated degree option/);
  assert.equal(ui.api.getView().scenarios[0].label, 'Latest degree option');
});

test('comparison progress reports checked plans without replacing results or saving partial choices', async () => {
  const ui=mount();ui.node('comparison-results').innerHTML='<p>Lowest estimated cost from an older search</p>';ui.api.render();await ui.flush();const job=ui.jobs[0],before=ui.api.getView();
  assert.doesNotMatch(ui.node('comparison-results').innerHTML,/Lowest estimated cost/);
  assert.equal(ui.runners[0].config.timeoutMs,90000);
  job.onProgress({phase:'started',matchingRouteCount:4,matchingRouteIds:['one','two','three','four']});
  assert.match(ui.node('comparison-status').textContent,/0 of 4 matching plans checked/);
  job.onProgress({phase:'candidate',matchingRouteCount:4,checkedCount:1,candidate:{pathwayId:'one',available:true,summary:{remainingCost:0}}});
  assert.match(ui.node('comparison-status').textContent,/1 of 4 matching plans checked/);
  assert.equal(ui.api.getView(),before);assert.equal(ui.writes.length,0);assert.doesNotMatch(ui.node('comparison-results').innerHTML,/Lowest|Shortest/);
  const status=ui.node('comparison-status').textContent;
  job.onProgress({phase:'candidate',matchingRouteCount:4,checkedCount:99});assert.equal(ui.node('comparison-status').textContent,status);
  job.resolve(resultView(ui.data,'Completed option'));await ui.flush();const completed=ui.node('comparison-status').textContent;
  job.onProgress({phase:'candidate',matchingRouteCount:4,checkedCount:2});assert.equal(ui.node('comparison-status').textContent,completed);
});

test('progress from a superseded comparison cannot change the new search status', async () => {
  const ui=mount();ui.api.render();await ui.flush();const old=ui.jobs[0];
  ui.api.render();await ui.flush();const fresh=ui.jobs[1];
  fresh.onProgress({phase:'candidate',matchingRouteCount:5,checkedCount:2});const status=ui.node('comparison-status').textContent;
  old.onProgress({phase:'candidate',matchingRouteCount:4,checkedCount:4});assert.equal(ui.node('comparison-status').textContent,status);
  fresh.resolve(resultView(ui.data,'Fresh option'));old.resolve(resultView(ui.data,'Old option'));await ui.flush();
  assert.match(ui.node('comparison-results').innerHTML,/Fresh option/);assert.doesNotMatch(ui.node('comparison-results').innerHTML,/Old option/);
});

test('confirming a plan never saves a comparison computed before a concurrent course edit', async () => {
  const ui = mount();
  await ui.clickUse();
  assert.equal(ui.node('comparison-use').open, true);
  const handlers = ui.confirm();
  await ui.flush();
  assert.equal(ui.jobs.length, 1);
  const newer = ui.updateSaved(state => {
    state.learning.push({id:'newest-record', provider:'Former college', code:'HIST101', title:'Latest saved history', credits:3, creditSystem:'semester', status:'earned', evaluations:[]});
    state.sheet.notes = {private:{history:'Latest private note'}};
    state.profile.goalDetail = 'Latest career preference';
  });
  ui.jobs[0].resolve(resultView(ui.data, 'Before concurrent edit', {'engl-101':'sophia-soph-0015'}));
  await ui.flush();
  assert.equal(ui.writes.length, 0, 'stale computed choices must not be written over newer private state');
  assert.deepEqual(ui.saved(), newer);
  assert.deepEqual(ui.navigations, []);
  assert.equal(ui.node('comparison-error').hidden, false);
  assert.match(ui.node('comparison-error').textContent, /chang|again|updat|new/i);
  assert.equal(ui.node('comparison-use').open, false);
  if (ui.jobs.length > 1) {
    assert.deepEqual(ui.jobs[1].payload.state.learning, newer.learning, 'the updated comparison uses the latest collection');
    ui.jobs[1].resolve(resultView(ui.data, 'After concurrent edit'));
    await ui.flush();
    assert.equal(ui.writes.length, 0, 'refreshing the comparison does not implicitly confirm the plan');
  }
  await Promise.all(handlers);
});

test('a successful async confirmation preserves the latest records and applies only freshly computed choices', async () => {
  const ui = mount();
  await ui.clickUse();
  const latest = ui.updateSaved(state => {
    state.learning[0].title = 'My corrected composition record';
    state.sheet.notes = {private:{composition:'Keep the corrected original record'}};
    state.profile.goalDetail = 'Keep this private goal';
  });
  const handlers = ui.confirm();
  await ui.flush();
  assert.equal(ui.jobs.length, 1);
  assert.deepEqual(ui.jobs[0].payload.state.learning, latest.learning);
  assert.equal(ui.writes.length, 0);
  assert.deepEqual(ui.navigations, []);
  ui.jobs[0].resolve(resultView(ui.data, 'Freshly checked degree', {'engl-101':'sophia-soph-0015'}));
  await ui.flush();
  await Promise.all(handlers);
  const saved = ui.saved();
  assert.equal(saved.selectedPathwayId, ui.data.route.id);
  assert.deepEqual(saved.learning, latest.learning);
  assert.deepEqual(saved.sheet.notes, latest.sheet.notes);
  assert.equal(saved.profile.goalDetail, latest.profile.goalDetail);
  assert.equal(saved.scenarios['liberty-business-residential'].optionSelections['engl-101'], 'sophia-soph-0015');
  assert.equal(ui.writes.length, 1);
  assert.deepEqual(ui.navigations, ['plan.html']);
});

test('deleting a saved version requires a current, explicit confirmation and keeps courses and notes', async () => {
  const ui=mount({active:true,snapshotCount:2}),before=ui.saved(),id=before.whatIf.snapshots[0].id;
  await ui.click({deleteSaved:id});
  assert.equal(ui.writes.length,0);
  assert.match(ui.node('comparison-saved-versions').innerHTML,/Confirm saved version deletion/);
  assert.match(ui.node('comparison-saved-versions').innerHTML,/Delete this version/);
  await ui.click({},['data-cancel-delete-saved']);
  assert.deepEqual(ui.saved(),before);
  assert.doesNotMatch(ui.node('comparison-saved-versions').innerHTML,/Confirm saved version deletion/);
  await ui.click({deleteSaved:id});
  await ui.click({confirmDeleteSaved:id});
  const after=ui.saved();
  assert.equal(after.whatIf.snapshots.length,1);
  assert(!after.whatIf.snapshots.some(row=>row.id===id));
  assert.deepEqual(after.learning,before.learning);
  assert.deepEqual(after.sheet.notes,before.sheet.notes);
  assert.deepEqual(after.scenarios,before.scenarios);
  assert.equal(after.selectedPathwayId,before.selectedPathwayId);
});

test('a version changed in another tab cannot be deleted using an older confirmation', async () => {
  const ui=mount({active:true,snapshotCount:1}),id=ui.saved().whatIf.snapshots[0].id;
  await ui.click({deleteSaved:id});
  const changed=ui.updateSaved(state=>{state.whatIf.snapshots[0].label='Updated in another tab';});
  await ui.click({confirmDeleteSaved:id});
  assert.deepEqual(ui.saved(),changed);
  assert.equal(ui.writes.length,0);
  assert.match(ui.node('comparison-error').textContent,/saved version changed/);
});

test('full version storage keeps the plan confirmation open until the student chooses, then preserves all saved state', async () => {
  const ui=mount({active:true,snapshotCount:20}),before=ui.saved();
  await ui.clickUse();
  assert.match(ui.node('comparison-use-content').innerHTML,/20 saved versions are full/);
  assert.match(ui.node('comparison-use-content').innerHTML,/comparison-skip-backup/);
  const blocked=ui.confirm();await ui.flush();
  ui.jobs.at(-1).resolve(resultView(ui.data,'Fresh checked plan'));await ui.flush();await Promise.all(blocked);
  assert.equal(ui.node('comparison-use').open,true);
  assert.equal(ui.node('comparison-confirm-use').disabled,false);
  assert.deepEqual(ui.saved(),before);
  assert.equal(ui.writes.length,0);
  assert.deepEqual(ui.navigations,[]);
  ui.node('comparison-skip-backup').checked=true;
  const allowed=ui.confirm();await ui.flush();
  ui.jobs.at(-1).resolve(resultView(ui.data,'Fresh checked plan'));await ui.flush();await Promise.all(allowed);
  const after=ui.saved();
  assert.equal(after.selectedPathwayId,ui.data.route.id);
  assert.deepEqual(after.whatIf.snapshots,before.whatIf.snapshots);
  assert.deepEqual(after.learning,before.learning);
  assert.deepEqual(after.sheet.notes,before.sheet.notes);
  for(const key of ['scenarios','savings'])for(const [id,value]of Object.entries(before[key]))assert.deepEqual(after[key][id],value);
  assert.deepEqual(ui.navigations,['plan.html']);
});

test('a late twentieth version opens an in-place capacity decision instead of closing the selected plan', async () => {
  const ui=mount({active:true,snapshotCount:19});await ui.clickUse();
  assert.doesNotMatch(ui.node('comparison-use-content').innerHTML,/20 saved versions are full/);
  const before=ui.updateSaved(state=>{state.whatIf.snapshots.push({...state.whatIf.snapshots[0],id:'twentieth-from-another-tab',label:'Latest version'});});
  const handlers=ui.confirm();await ui.flush();ui.jobs.at(-1).resolve(resultView(ui.data,'Still selected'));await ui.flush();await Promise.all(handlers);
  assert.equal(ui.node('comparison-use').open,true);
  assert.match(ui.node('comparison-use-content').innerHTML,/20 saved versions are full/);
  assert.deepEqual(ui.saved(),before);
  assert.equal(ui.writes.length,0);
});

test('skipping a backup cannot overwrite existing per-degree settings while restoring a different saved version', async () => {
  const ui=mount({active:true,snapshotCount:20}),id='saved:'+ui.saved().whatIf.snapshots[0].id;
  const before=ui.updateSaved(state=>{state.scenarios['liberty-business-residential'].universityRate=999;});
  const chosen=ui.api.getView().scenarios[1];chosen.id=id;chosen.draft=ui.data.currentDraft;
  await ui.click({usePlan:id});
  assert.match(ui.node('comparison-use-content').innerHTML,/Make room for a backup/);
  assert.doesNotMatch(ui.node('comparison-use-content').innerHTML,/comparison-skip-backup/);
  ui.node('comparison-skip-backup').checked=true;
  const handlers=ui.confirm();await ui.flush();const checked=resultView(ui.data,'Saved version');checked.scenarios[1].id=id;checked.scenarios[1].draft=ui.data.currentDraft;
  ui.jobs.at(-1).resolve(checked);await ui.flush();await Promise.all(handlers);
  assert.equal(ui.node('comparison-use').open,true);
  assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);assert.deepEqual(ui.navigations,[]);
});

test('managing full versions retains a visible way to resume the selected plan', async () => {
  const ui=mount({active:true,snapshotCount:20});await ui.clickUse();
  await ui.click({},['data-manage-saved-versions']);
  assert.equal(ui.node('comparison-use').open,false);
  assert.equal(ui.node('comparison-advanced').open,true);
  assert.match(ui.node('comparison-saved-versions').innerHTML,/Continue switching plans/);
  const id=ui.saved().whatIf.snapshots[0].id;await ui.click({deleteSaved:id});await ui.click({confirmDeleteSaved:id});
  await ui.flush();ui.jobs.at(-1).resolve(resultView(ui.data,'Original selected destination'));await ui.flush();
  await ui.click({},['data-resume-plan-switch']);
  assert.equal(ui.node('comparison-use').open,true);
  assert.match(ui.node('comparison-use-content').innerHTML,new RegExp(ui.data.route.title));
  assert.doesNotMatch(ui.node('comparison-use-content').innerHTML,/20 saved versions are full/);
  assert.equal(ui.saved().whatIf.snapshots.length,19);
});

test('opening version management during a plan check cancels it and leaves Resume usable', async () => {
  const ui=mount({active:true,snapshotCount:20}),before=ui.saved();await ui.clickUse();
  const handlers=ui.confirm();await ui.flush();const oldCheck=ui.jobs.at(-1);
  await ui.click({},['data-manage-saved-versions']);
  assert.equal(ui.node('comparison-use').open,false);
  assert.match(ui.node('comparison-saved-versions').innerHTML,/data-resume-plan-switch>/);
  oldCheck.resolve(resultView(ui.data,'Cancelled plan check'));await ui.flush();await Promise.all(handlers);
  assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);assert.deepEqual(ui.navigations,[]);
  await ui.click({},['data-resume-plan-switch']);
  assert.equal(ui.node('comparison-use').open,true);
  assert.match(ui.node('comparison-use-content').innerHTML,new RegExp(ui.data.route.title));
  assert.equal(ui.node('comparison-error').textContent,'');
});

test('removing the final comparison remains empty until suggestions are requested', async () => {
  const ui=mount(),before=ui.saved();await ui.click({removePlan:'0'});await ui.flush();
  assert.deepEqual(ui.saved().whatIf.selectedIds,[]);
  assert.deepEqual(ui.jobs.at(-1).payload.options.selectedIds,[]);
  ui.jobs.at(-1).resolve({...resultView(ui.data,'Unused'),scenarios:[],selectedIds:[],recommendation:null});await ui.flush();
  assert.match(ui.node('comparison-results').innerHTML,/No plans selected/);
  assert.match(ui.node('comparison-results').innerHTML,/data-show-suggestions/);
  assert.equal(ui.node('comparison-courses').hidden,true);
  assert.deepEqual(ui.saved().learning,before.learning);
  await ui.click({},['data-show-suggestions']);await ui.flush();
  assert(!Object.hasOwn(ui.saved().whatIf,'selectedIds'));
  assert.equal(ui.jobs.at(-1).payload.options.selectedIds,undefined);
  ui.jobs.at(-1).resolve(resultView(ui.data,'Suggested again'));await ui.flush();
  assert.match(ui.node('comparison-results').innerHTML,/Suggested again/);
});

test('a failed official-requirements check allows a forced retry without losing comparison choices', async () => {
  const attempts=[],ui=mount({catalogOverrides:{async discover(route,options){attempts.push({id:route.id,...options});throw Error('Temporary source connection error');}}}),before=ui.saved();
  const button=await ui.click({sourceProgram:ui.data.route.id});
  assert.equal(button.disabled,false);assert.equal(button.textContent,'Try checking again');assert.equal(button.dataset.sourceForce,'true');
  assert.match(ui.node('comparison-status').textContent,/comparison is unchanged; try again/);
  assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);
  const retry=await ui.click(button.dataset);
  assert.equal(retry.disabled,false);assert.equal(attempts.length,2);assert.equal(attempts[1].force,true);
  assert.deepEqual(ui.saved().whatIf.selectedIds,before.whatIf.selectedIds);
});

test('Save version checks the current degree and saves reusable settings without copying course records', async () => {
  const ui=mount({active:true}),before=ui.saved();
  ui.node('save-scenario-open').emit('click');assert.equal(ui.node('comparison-save').open,true);
  ui.node('comparison-save-form').elements.label.value='My revised course choices';
  const handlers=ui.node('comparison-save-form').emit('submit');await ui.flush();
  assert.equal(ui.jobs.length,1);assert.equal(ui.jobs[0].kind,'draft');
  assert.deepEqual(ui.jobs[0].payload.state.learning,before.learning);
  ui.jobs[0].resolve(ui.data.currentDraft);await ui.flush();await Promise.all(handlers);
  const after=ui.saved();assert.equal(after.whatIf.snapshots.length,1);
  assert.equal(after.whatIf.snapshots[0].label,'My revised course choices');
  assert(!Object.hasOwn(after.whatIf.snapshots[0],'learning'));
  assert.deepEqual(after.learning,before.learning);assert.deepEqual(after.sheet.notes,before.sheet.notes);
  assert.deepEqual(after.scenarios,before.scenarios);assert.equal(ui.node('comparison-save').open,false);
  assert.equal(ui.node('comparison-save-form-submit').disabled,false);assert.equal(ui.writes.length,1);
});
