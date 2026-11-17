const test = require('node:test');
const assert = require('node:assert/strict');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const clone = value => JSON.parse(JSON.stringify(value));
const route = catalog.pathways.find(path => path.modelId === 'tesu-general-management');
const models = [require('./dist/data/tesu.json')];

function savedState() {
  const state = Journey.selectRoute(Journey.initialize(null, null, catalog), route, catalog);
  Object.assign(state.journey, {completed:true, view:'home', step:'review', creditsDeferred:true,
    planReviewed:true, schoolContacted:true, reviewedSignature:'previous-review', schoolContactedSignature:'previous-contact'});
  state.journey.answers = {start:'target', purpose:'any-degree', prior:'some', review:true};
  state.profile.hasPrior = 'some';
  state.sheet.notes = {'other-degree':{'other-course':'Private note'}};
  state.sheet.checklist = {'other-degree':{'other-course':{checked:true, note:'Keep this check'}}};
  state.scenarios['other-degree'] = {providers:['College'], optionSelections:{'other-course':'other-option'}, universityRate:219, fees:40};
  state.savings = {'other-degree':{baseline:12345, note:'Private savings estimate'}};
  state.baseline = {school:'Other school', externalCredits:9};
  state.checklist = {'other-degree':{contacted:true}};
  return state;
}
function source(status, extras = {}) {
  return {id:'source-' + status, provider:'College', title:'Original course', credits:3, creditSystem:'semester', status,
    privateNote:'Original private note', evaluations:[{programId:'other-degree', requirementId:'other-course', status:'reported'}], ...extras};
}
function assertPreserved(original, next) {
  assert.notEqual(next, original);
  assert.notEqual(next.profile, original.profile);
  assert.notEqual(next.journey, original.journey);
  for (const name of ['learning', 'sheet', 'scenarios', 'savings', 'baseline', 'checklist', 'selectedPathwayId', 'view', 'step']) {
    assert.deepEqual(next[name], original[name], name + ' remains intact');
  }
  for (const name of ['completed', 'view', 'step']) assert.equal(next.journey[name], original.journey[name], 'journey ' + name + ' remains intact');
  assert.deepEqual({...next.journey.answers, prior:original.journey.answers.prior}, original.journey.answers);
  assert.equal(next.journey.planReviewed, false);
  assert.equal(next.journey.schoolContacted, false);
  assert.equal(next.journey.reviewedSignature, undefined);
  assert.equal(next.journey.schoolContactedSignature, undefined);
}

test('no completed credits explicitly completes the task without inventing credit or rewinding the worksheet', () => {
  const original = savedState(), before = clone(original);
  const next = Journey.setPriorCredits(original, 'none');
  assertPreserved(before, next);
  assert.equal(next.profile.hasPrior, 'none');
  assert.equal(next.journey.answers.prior, 'none');
  assert.equal(next.journey.creditsDeferred, false);
  const draft = Journey.buildDraft(next, catalog, models);
  const tasks = Journey.tasks(next, draft);
  assert.equal(tasks.find(task => task.id === 'credits').complete, true);
  assert.equal(tasks.find(task => task.id === 'credits').provisional, false);
  assert.equal(tasks.find(task => task.id === 'plan').complete, false);
  assert.equal(tasks.find(task => task.id === 'school').complete, false);
  assert.deepEqual(draft.match.completed, []);
  assert.equal(draft.plan.totals.reported, 0);
  assert.equal(draft.plan.totals.confirmed, 0);
  assert.deepEqual(original, before);
});

test('saved, planned and in-progress courses survive a no-completed-credits decision with all private program state', () => {
  const original = savedState();
  original.learning = ['saved', 'planned', 'in-progress'].map(status => source(status));
  const before = clone(original), next = Journey.setPriorCredits(original, 'none');
  assertPreserved(before, next);
  assert.equal(next.learning.length, 3);
  next.learning[0].privateNote = 'Changed only in returned state';
  next.sheet.notes['other-degree']['other-course'] = 'Changed only in returned state';
  assert.deepEqual(original, before, 'returned state has no mutable private-state references to its source');
});

test('no-completed-credits refuses every actual earned record regardless of known source credits or units', () => {
  for (const extras of [{}, {credits:null, creditSystem:null}, {credits:'', creditSystem:null}, {credits:3, creditSystem:null}, {credits:null, creditSystem:'quarter'}]) {
    const original = savedState();
    original.learning = [source('saved'), source('earned', extras)];
    const before = clone(original);
    assert.throws(() => Journey.setPriorCredits(original, 'none'), /saved completed learning/);
    assert.deepEqual(original, before, 'refused choice never erases or edits original records');
  }
});

test('adding past courses keeps review provisional and never grants awards or prior approvals', () => {
  const original = savedState();
  original.profile.hasPrior = 'none';
  original.journey.answers.prior = 'none';
  original.learning = [source('saved')];
  const before = clone(original), next = Journey.setPriorCredits(original, 'some');
  assertPreserved(before, next);
  assert.equal(next.profile.hasPrior, 'some');
  assert.equal(next.journey.answers.prior, 'some');
  assert.equal(next.journey.creditsDeferred, true);
  const draft = Journey.buildDraft(next, catalog, models);
  assert.equal(draft.plan.provisional, true);
  assert.deepEqual(draft.match.completed, []);
  assert.equal(draft.plan.totals.reported, 0);
  assert.equal(draft.plan.totals.confirmed, 0);
  assert.equal(Journey.tasks(next, draft).find(task => task.id === 'credits').status, 'provisional');
  assert.deepEqual(original, before);
});

test('do later stays provisional, preserves earned records and never claims zero prior credit', () => {
  for (const [earned, prior, expected] of [[false, 'none', 'unknown'], [true, 'none', 'some'], [true, 'degree', 'degree']]) {
    const original = savedState();
    original.profile.hasPrior = prior;
    original.learning = [source(earned ? 'earned' : 'saved', {credits:null, creditSystem:null})];
    const before = clone(original), next = Journey.setPriorCredits(original, 'later');
    assertPreserved(before, next);
    assert.equal(next.profile.hasPrior, expected);
    assert.equal(next.journey.answers.prior, 'unknown');
    assert.equal(next.journey.creditsDeferred, true);
    const draft = Journey.buildDraft(next, catalog, models);
    assert.equal(draft.plan.provisional, true);
    assert.equal(Journey.tasks(next, draft).find(task => task.id === 'credits').status, 'provisional');
    assert.equal(Journey.tasks(next, draft).find(task => task.id === 'plan').complete, false);
    assert.equal(Journey.tasks(next, draft).find(task => task.id === 'school').complete, false);
    assert.deepEqual(original, before);
  }
});

test('repeating a prior-credit choice invalidates matching review signatures and rejects unsupported choices', () => {
  let state = Journey.setPriorCredits(savedState(), 'none');
  const draft = Journey.buildDraft(state, catalog, models);
  state = draft.state;
  const signature = Journey.draftSignature(state, draft);
  Object.assign(state.journey, {planReviewed:true, schoolContacted:true, reviewedSignature:signature, schoolContactedSignature:signature});
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'plan').complete, true);
  const before = clone(state), next = Journey.setPriorCredits(state, 'none');
  assert.equal(Journey.draftSignature(next, draft), signature);
  assert.equal(Journey.tasks(next, draft).find(task => task.id === 'plan').complete, false);
  assert.equal(Journey.tasks(next, draft).find(task => task.id === 'school').complete, false);
  for (const invalid of ['unknown', 'degree', '', null, undefined, true]) assert.throws(() => Journey.setPriorCredits(state, invalid), /valid prior-credit choice/);
  assert.deepEqual(state, before);
});
