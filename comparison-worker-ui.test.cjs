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

const KEY = 'degreepath-guide-v3';
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const full = Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json'));
  const route = full.pathways.find(item => item.modelId === 'liberty-business-residential');
  const state = CourseLibrary.initialize(null);
  state.whatIf = {version:1, goalReady:true, selectedIds:['route:'+route.id]};
  state.learning = [{id:'original-record', provider:'Sophia', code:'SOPH-0015', title:'English Composition I', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
  return {state, route, catalog:{...full, pathways:[route]}, models:[require('./dist/data/liberty.json')], costs:require('./dist/data/cost-comparisons.json')};
}

function resultView(data, label, selections = {}) {
  const id = 'route:'+data.route.id;
  return {
    scenarios:[{id, label, available:true, eligible:true, canUse:true, isCurrent:false, draft:{pathway:data.route}, summary:{degreeCredits:120, applicableCompletedCredits:3, confirmedCredits:0, collectionFitCredits:3, potentialCollectionCredits:0, collectionFitFraction:0.025, completedFitFraction:0.025, remainingCredits:117, universityCreditsRemaining:30, collectionSelections:selections}}],
    courses:[], matrix:[], matrixDeferred:false, courseFirst:true, hasTarget:false, selectedIds:[id], mappedProgramsChecked:1
  };
}

function mount() {
  const data = fixture(), nodes = new Map(), events = new Map(), timers = new Map(), jobs = [], runners = [], writes = [], navigations = [];
  const storage = new Map([[KEY, JSON.stringify(data.state)]]);
  let timerId = 0;
  function node(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      nodes.set(id, {
        id, value:'', checked:false, hidden:false, disabled:false, open:false, innerHTML:'', textContent:'', dataset:{}, listeners,
        addEventListener(type, callback) {if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback);},
        emit(type, event = {}) {return (listeners.get(type) || []).map(callback => callback({target:this, preventDefault() {}, ...event}));},
        setAttribute(name, value) {this[name] = value;}, removeAttribute(name) {delete this[name];},
        showModal() {this.open = true;}, close() {this.open = false;}, focus() {},
        closest() {return this;}, querySelectorAll() {return [];}
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
        run(kind, payload) {return new Promise((resolve, reject) => jobs.push({runner, kind, payload:clone(payload), resolve, reject}));},
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
    DegreeComparisonRunner:fakeRunner, DegreeProgramCatalog:Catalog, DegreeCourseLibrary:CourseLibrary, DegreeJourney:Journey, DegreeGuide:Guide,
    __fixture:{...data, view:resultView(data, 'Initial option')}
  };
  context.window = context;
  const source = fs.readFileSync(path.join(__dirname, 'dist/compare-plans.js'), 'utf8');
  const boot = source.indexOf(' (async()=>{try{const data=await Promise.all');
  assert(boot > 0, 'the production comparison boot boundary must be identifiable');
  const hooks = 'state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;costs=__fixture.costs;view=__fixture.view;window.__comparisonTest={render,previewUse,getView:()=>view};}());';
  vm.runInNewContext(source.slice(0, boot)+hooks, context, {filename:'compare-plans.js'});
  return {
    data, node, jobs, runners, writes, navigations, api:context.__comparisonTest,
    saved() {return JSON.parse(storage.get(KEY));},
    updateSaved(update) {const fresh = JSON.parse(storage.get(KEY)); update(fresh); storage.set(KEY, JSON.stringify(fresh)); return fresh;},
    async flush() {for (let turn = 0; turn < 15; turn++) {const queued = [...timers.values()]; timers.clear(); for (const callback of queued) callback(); await Promise.resolve();}},
    async clickUse() {const button = {dataset:{usePlan:'route:'+data.route.id}, closest() {return this;}, hasAttribute() {return false;}, matches() {return false;}}; for (const callback of events.get('click') || []) await callback({target:button});},
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
