const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Savings = require('./dist/savings-engine.js');
const Cost = require('./dist/cost-engine.js');
const Planner = require('./dist/planner.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const catalog = require('./dist/data/pathways.json');
const data = require('./dist/data/cost-comparisons.json');
const models = ['tesu','liberty'].map(name => require('./dist/data/' + name + '.json'));
const liberty = models.find(model => model.id === 'liberty-business-residential');
const tesu = models.find(model => model.id === 'tesu-general-management');
const clone = value => JSON.parse(JSON.stringify(value));
function stateFor(program = liberty) {
  return Sheet.selectPathway(Sheet.initialize(null,null,catalog), catalog.pathways.find(path => path.modelId === program.id));
}
const draftFor = state => Journey.buildDraft(state,catalog,models);
const calculate = state => Savings.calculate(state,draftFor(state),data);
function progress(state, program, requirementId, status, optionId) {
  const req = program.requirements.find(item => item.id === requirementId);
  const option = req.options.find(item => item.id === optionId) || req.options.find(item => item.provider === 'Sophia');
  return Sheet.recordProgress(state,program,req,option,status,status === 'confirmed' ? {confirmation:true} : {});
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('browser API uses the same pure calculation with no storage or network access', () => {
  const browser = {DegreeCostComparison:Cost,DegreePlanner:Planner};
  vm.runInNewContext(fs.readFileSync('./dist/savings-engine.js','utf8'),browser);
  const state = freeze(stateFor()), draft = freeze(draftFor(state)), costs = freeze(clone(data));
  const before = JSON.stringify([state,draft,costs]);
  const result = browser.DegreeSavings.calculate(state,draft,costs);
  assert.equal(result.available,true);
  assert.equal(result.projected.netDifference,68080);
  assert.equal(result.unmappedCredits,0);
  assert.equal(result.outsideOptionResearchCredits,24);
  assert.equal(draft.plan.coverage.excludedSourceCredits,10,'known optional CLI awards are excluded from the baseline provider preferences');
  assert(!result.notes.some(note=>/credits still need course research/.test(note)));
  assert.equal(JSON.stringify([state,draft,costs]),before);
  assert.equal(browser.localStorage,undefined);
  assert.equal(browser.fetch,undefined);
});

test('Liberty current sourced allocations replace neither policy maximum nor partial provider subtotal', () => {
  const state = stateFor(), draft = draftFor(state), result = Savings.calculate(state,draft,data);
  assert.equal(draft.plan.validation.valid,true,'The reviewed active course plan has no invented academic research blocker');
  assert(draft.plan.researchTasks.some(task=>task.blocking===false),'Optional outside-source research remains separate from missing degree coursework');
  assert.equal(draft.plan.validation.academicCountsValid,true);
  assert.equal(result.available,true);
  assert.equal(result.projected.transferCredits,83);
  assert.equal(result.projected.beforeTuition,101560);
  assert.equal(result.projected.afterTuition,31480);
  assert.equal(result.projected.outsideBudget,2000);
  assert.notEqual(result.projected.outsideBudget,draft.plan.costs.knownSubtotal);
  assert.equal(result.projected.netDifference,68080);
  assert.equal(result.projected.termsAvoided,5);
  assert.equal(result.researchGapCredits,24);
  assert.equal(draft.plan.coverage.excludedSourceCredits,10,'source-excluded awards are distinct from missing outside mappings');
  assert.equal(result.unmappedCredits,0);
  assert.equal(result.outsideOptionResearchCredits,24);
  assert(result.notes.some(note=>note.includes('without mapped outside alternatives')));
  assert(!result.notes.some(note=>/credits still need course research/.test(note)));
  assert.equal(result.provisional,true);
  assert.match(result.notes.join(' '),/selects university courses.*without mapped outside alternatives/);
  assert.deepEqual(result.confirmed,{transferCredits:0,tuitionAvoided:0,termsAvoided:0});
});

test('TESU uses its real ninety-credit conditional route and explicitly labels nonresident tuition', () => {
  const result = calculate(stateFor(tesu));
  assert.equal(result.available,true);
  assert.equal(result.entryId,'tesu-standard');
  assert.equal(result.projected.transferCredits,90);
  assert.equal(result.projected.netDifference,25912);
  assert.equal(result.projected.afterTerms,2);
  assert.deepEqual(result.projected.teachingWeeks,{before:96,after:24,avoided:72});
  assert.equal(result.assumptions.publishedRateCase,'standard-out-of-state');
  assert.match(result.notes.join(' '),/out-of-state/);
});

test('unmatched records, rough credit totals and community badges do not award savings', () => {
  const state = stateFor();
  state.learning = [{id:'unmatched',provider:'Other college',title:'Some old credits',code:'UNKNOWN900',credits:90,creditSystem:'semester',status:'earned',evaluations:[],communityVerified:true}];
  state.profile.priorCredits = 90;
  const result = calculate(state);
  assert.equal(result.projected.transferCredits,83);
  assert.equal(result.projected.netDifference,68080);
  assert.equal(result.earned.transferCredits,0);
  assert.equal(result.earned.confirmedCredits,0);
});

test('completing then confirming a proposed course changes earned progress without awarding projected savings again', () => {
  const initial = stateFor(), before = calculate(initial);
  const reportedState = progress(initial,liberty,'engl-101','completed');
  const reported = calculate(reportedState);
  assert.equal(reported.projected.transferCredits,83);
  assert.equal(reported.projected.netDifference,before.projected.netDifference);
  assert.deepEqual(reported.earned,{transferCredits:3,reportedCredits:3,confirmedCredits:0});
  const earnedDelta = Savings.delta(before,reported);
  assert.equal(earnedDelta.projectedCredits,0);
  assert.equal(earnedDelta.earnedCredits,3);
  assert.equal(earnedDelta.netDifference,0);
  assert.match(earnedDelta.message,/already included/);
  const confirmed = calculate(progress(reportedState,liberty,'engl-101','confirmed'));
  assert.deepEqual(confirmed.earned,{transferCredits:3,reportedCredits:0,confirmedCredits:3});
  assert.equal(confirmed.projected.netDifference,before.projected.netDifference);
  assert.equal(confirmed.confirmed.transferCredits,3);
  assert.equal(confirmed.confirmed.tuitionAvoided,0,'Three confirmed credits alone do not cross a flat semester billing threshold');
  const confirmedDelta = Savings.delta(reported,confirmed);
  assert.equal(confirmedDelta.confirmedCredits,3);
  assert.equal(confirmedDelta.earnedCredits,0);
  assert.equal(confirmedDelta.netDifference,0);
});

test('an earned receiving-university course is never counted as an outside transfer', () => {
  const initial = stateFor(), draft = draftFor(initial);
  const row = draft.plan.rows.find(item => item.option.provider === 'University' && item.credits === 3 && !item.selectionRequired);
  const completed = progress(initial,liberty,row.requirementId,'completed',row.option.id);
  const result = calculate(completed);
  assert.equal(result.available,true);
  assert.equal(result.earned.transferCredits,0);
  assert.equal(result.projected.transferCredits,83);
});

test('a six-credit source split across two requirements counts each allocated three-credit placement once', () => {
  let state = stateFor(tesu);
  state = progress(state,tesu,'enc1010','completed','clep-composition-enc1010');
  const draft = draftFor(state), result = Savings.calculate(state,draft,data);
  assert.equal(state.learning.length,1);
  assert.equal(state.learning[0].credits,6);
  assert.equal(draft.plan.rows.filter(row => row.status === 'reported').length,2);
  assert.equal(result.earned.transferCredits,6);
  assert.equal(result.projected.transferCredits,90);
});

test('duplicate, incomplete, fractional or inflated placements cannot inflate monetary claims', () => {
  const state = stateFor(), source = draftFor(state);
  for (const change of [
    draft => {draft.plan.rows[1] = clone(draft.plan.rows[0]);},
    draft => {draft.plan.rows.pop();},
    draft => {draft.plan.rows[0].credits = 6;},
    draft => {draft.plan.rows[0].option.credits = 99;},
    draft => {draft.plan.rows[0].status = 'community-verified';}
  ]) {
    const draft = clone(source); change(draft);
    const result = Savings.calculate(state,draft,data);
    assert.equal(result.available,false);
    assert.equal(result.projected.netDifference,null);
  }
});

test('independent validation catches stale academic validity and invalid selected options', () => {
  const state = stateFor(), source = draftFor(state);
  for (const change of [
    draft => {draft.plan.validation.academicCountsValid = false;},
    draft => {draft.plan.setupIssues.push({code:'invalid_selection',message:'Invalid choice'});},
    draft => {draft.plan.validation.errors.push({code:'selection_conflict'});},
    draft => {draft.plan.rows[0].option.id = 'invented-course';}
  ]) {
    const draft = clone(source); change(draft);
    const result = Savings.calculate(state,draft,data);
    assert.equal(result.available,false);
    assert.equal(result.reasonCode,'plan-needs-review');
  }
});

test('unconfirmed transfer-waiver qualification pauses money instead of monetizing waived requirements', () => {
  const state = stateFor();
  state.scenarios[liberty.id] = {useWaivers:true,providers:['Sophia','Study.com','CLEP'],allowConditional:true};
  const draft = draftFor(state), result = Savings.calculate(state,draft,data);
  assert.equal(draft.program.appliedTransferWaiver.minimumQualifyingTransferCredits,60);
  assert.equal(result.available,false);
  assert.equal(result.reasonCode,'waiver-needs-confirmation');
  assert.equal(result.confirmed.transferCredits,0);
  assert.equal(result.projected.netDifference,null);
});

test('unknown degree outlines, custom goals and mismatched pricing return a helpful unavailable state', () => {
  for (const draft of [null,{program:{id:'custom-liberty-nursing',school:'Liberty University'},plan:{rows:[]}},{program:tesu,plan:{programId:liberty.id,rows:[]}}]) {
    const result = Savings.calculate({},draft,data);
    assert.equal(result.available,false);
    assert.equal(result.projected.netDifference,null);
    assert.equal(result.projected.termsAvoided,null);
    assert.match(result.reason,/degree|tuition model/i);
  }
});

test('program-scoped budgets and pace never inherit another saved degree’s settings', () => {
  const state = stateFor();
  state.savings = {[tesu.id]:{outsideBudget:99999,unitsPerTerm:3}};
  assert.equal(calculate(state).projected.netDifference,68080);
  state.savings[liberty.id] = {outsideBudget:0,unitsPerTerm:15};
  assert.equal(calculate(state).projected.netDifference,70080);
  state.savings[liberty.id].outsideBudget = 100000;
  assert.equal(calculate(state).projected.netDifference,-29920,'A costly budget may legitimately erase the estimated benefit');
});

test('invalid entered assumptions pause the estimate rather than silently becoming zero or a default', () => {
  for (const settings of [{outsideBudget:''},{outsideBudget:-1},{outsideBudget:'1e3'},{outsideBudget:'0.001'},{unitsPerTerm:0},{unitsPerTerm:19},{unitsPerTerm:14.5},{unitsPerTerm:''}]) {
    const state = stateFor(); state.savings = {[liberty.id]:settings};
    const result = calculate(state);
    assert.equal(result.available,false,JSON.stringify(settings));
    assert.equal(result.reasonCode,'assumptions-need-review');
    assert.equal(result.projected.netDifference,null);
  }
});

test('a personal positive per-credit quote overrides published bands; an absent zero quote is not free tuition', () => {
  const state = stateFor();
  state.scenarios[liberty.id] = {universityRate:500};
  const quoted = calculate(state);
  assert.equal(quoted.available,true);
  assert.equal(quoted.rateBasis,'your-quote');
  assert.equal(quoted.projected.beforeTuition,60000);
  assert.equal(quoted.projected.afterTuition,18500);
  assert.equal(quoted.projected.netDifference,39500);
  state.scenarios[liberty.id].universityRate = 0;
  assert.equal(calculate(state).rateBasis,'published');
  assert.equal(calculate(state).projected.netDifference,68080);
  state.scenarios[liberty.id].universityRate = -1;
  assert.equal(calculate(state).available,false);
});

test('actual provider choices increase and decrease projected savings using the billing model', () => {
  const state = stateFor(), draft = draftFor(state);
  const req = liberty.requirements.find(item => item.id === 'engl-101');
  const schoolOption = req.options.find(item => item.provider === 'University');
  const revised = Sheet.setCourse(state,liberty.id,req.id,schoolOption.id);
  const before = calculate(state), after = calculate(revised);
  assert.equal(after.available,true);
  assert.equal(after.projected.transferCredits,80);
  const removed = Savings.delta(before,after), added = Savings.delta(after,before);
  assert.equal(removed.projectedCredits,-3);
  assert.equal(added.projectedCredits,3);
  assert.equal(added.netDifference,2610);
  assert.equal(added.termsAvoided,0);
  assert.equal(draft.plan.rows[0].option.provider,'Sophia','Inputs remain independent');
});

test('three more allocated credits can leave a flat tuition bill unchanged', () => {
  let state = stateFor();
  state.savings = {[liberty.id]:{unitsPerTerm:18}};
  const rows = draftFor(state).plan.rows.filter(row => row.credits === 3 && row.option.provider !== 'University').slice(0,5);
  for (const row of rows) {
    const req = liberty.requirements.find(item => item.id === row.requirementId);
    state = Sheet.setCourse(state,liberty.id,req.id,req.options.find(option => option.provider === 'University').id);
  }
  const before = calculate(state);
  state = Sheet.setCourse(state,liberty.id,rows[0].requirementId,rows[0].option.id);
  const after = calculate(state), delta = Savings.delta(before,after);
  assert.equal(before.available,true);
  assert.equal(after.available,true);
  assert.equal(before.projected.transferCredits,68);
  assert.equal(after.projected.transferCredits,71);
  assert.equal(delta.projectedCredits,3);
  assert.equal(delta.netDifference,0);
  assert.equal(delta.termsAvoided,0);
  assert.match(delta.message,/billed tuition estimate is unchanged/);
});

test('first visits and changing degrees never announce an invented course gain', () => {
  const a = calculate(stateFor()), b = calculate(stateFor(tesu));
  assert.equal(Savings.delta(null,a).changed,false);
  assert.equal(Savings.delta(a,b).changed,false);
  const state = stateFor(); state.savings = {[liberty.id]:{outsideBudget:3000}};
  const adjusted = Savings.delta(a,calculate(state));
  assert.equal(adjusted.assumptionsChanged,true);
  assert.equal(adjusted.projectedCredits,0);
  assert.equal(adjusted.netDifference,-1000);
  assert.match(adjusted.message,/updated budget/);
});
