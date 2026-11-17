const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('./dist/audit-curriculum.js');
const C = require('./dist/program-catalog.js');
const source = fs.readFileSync('dist/account-client.js', 'utf8');
const DRAFT = 'degreepath-guide-v3', LINK = 'degreepath-account-link-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const catalog = {pathways: [
  {id:'degree-a', school:'Example University', title:'B.S. Biology', level:'bachelor', creditSystem:'semester', catalog:'2026', modalities:['online']},
  {id:'degree-b', school:'Other University', title:'B.A. History', level:'bachelor', creditSystem:'semester', catalog:'2026', modalities:['campus']}
]};
function seed(id = 'degree-a') {
  const route = catalog.pathways.find(route => route.id === id);
  return {version:3, selectedPathwayId:id,
    profile:{entry:'target', school:route.school, schoolChoice:route.school, degree:route.title, pathwayId:id, degreeLevel:route.level, modality:route.modalities[0]},
    learning:[{id:'writing', provider:'Former College', code:'ENG101', title:'Writing', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}],
    sheet:{isExample:false, notes:{shared:{writing:'Current advisor note'}}},
    scenarios:{[id]:{optionSelections:{writing:'university'}}}, savings:{[id]:{budget:100}},
    checklist:{version:1, plans:{[id]:{tasks:[{id:'confirm', title:'Confirm requirements', done:false}]}}},
    whatIf:{version:1, snapshots:[]}, journey:{planReviewed:true, schoolContacted:true}};
}
function context(patch = {}) {
  return {school:'Example University', degree:'B.S. Biology', programId:'degree-a', catalog:'2026', creditSystem:'semester', level:'bachelor', modality:'online', sourceUrl:'https://example.edu/biology/', ...patch};
}
function withDraft(state, target, text = 'Unfinished requirements') {
  return A.saveDraft(state, target, {
    metadata:{school:target.school, title:target.degree, programId:target.programId, catalog:target.catalog, creditSystem:target.creditSystem, level:target.level, modality:target.modality, totalCredits:''},
    mode:'paste', csv:text, rows:[{section:'Core', code:'BIO101', title:'', credits:'', requiredAtUniversity:false}]
  });
}
function imported(id, title = 'Imported biology', rows = [{section:'Major', code:'BIO301', title:'Biology methods', credits:3}]) {
  return A.create(rows, {id:'student-audit-' + id, school:'Private University', title, level:'bachelor', creditSystem:'semester', modality:'online', catalog:'2026', sourceUrl:'https://example.edu/private/', totalCredits:rows.reduce((sum, row) => sum + row.credits, 0), reviewedByStudent:true});
}
function fixture(saved, local) {
  const priorLink = {ownerId:'account-a', planId:'current-plan', revision:8};
  const store = new Map([[LINK, JSON.stringify(priorLink)]]), calls = [], writes = [];
  if (local !== undefined) store.set(DRAFT, JSON.stringify(local));
  const context = {AuditCurriculum:A, localStorage:{
    getItem:key => store.get(key) ?? null,
    setItem:(key, value) => {writes.push(key); store.set(key, String(value));},
    removeItem:key => store.delete(key)
  }, fetch:async (path, options) => {
    calls.push({path, options});
    assert.equal(options.method, 'GET');
    const body = path === '/api/portal/session' ? {user:{id:'account-a'}} : {item:{id:'older-plan', revision:2, state:saved}};
    return {ok:true, status:200, json:async () => copy(body)};
  }};
  // Compile against the mocked browser global in the required audit module's
  // realm: both browser scripts share one Object.prototype in a real window.
  vm.compileFunction(source, ['globalThis'])(context);
  return {api:context.DegreeAccount, context, store, calls, writes, priorLink};
}
async function assertAtomicRejection(saved, local, expected = /private|requirement|audit|versions|large|limit|recovery/i, raw) {
  const f = fixture(saved, local);
  if (raw !== undefined) f.store.set(DRAFT, raw);
  const before = f.store.get(DRAFT), link = f.store.get(LINK);
  await assert.rejects(f.api.openPlan('older-plan'), expected);
  assert.equal(f.store.get(DRAFT), before);
  assert.equal(f.store.get(LINK), link);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.calls.map(call => call.path), ['/api/portal/session', '/api/portal/plans/older-plan']);
}

test('account restore preserves drafts for both degree contexts and current learning, notes and checklists', async () => {
  const biology = context(), history = context({school:'Other University', degree:'B.A. History', programId:'degree-b', modality:'campus'});
  const saved = withDraft(seed('degree-a'), biology, 'Older biology requirements');
  let local = withDraft(seed('degree-b'), history, 'Current history requirements');
  local.learning.push({id:'new-course', provider:'Sophia', code:'HIST1001', title:'U.S. History', credits:3, creditSystem:'semester', status:'saved', evaluations:[]});
  saved.sheet.notes = {saved:{biology:'Cloud biology note'}, shared:{writing:'Older wording'}};
  local.sheet.notes.history = {research:'Local history note'};
  local.checklist.plans['degree-a'] = {tasks:[]};
  local.checklist.plans['degree-b'].tasks[0].done = true;
  const savedBefore = copy(saved), localBefore = copy(local), f = fixture(saved, local);
  const result = await f.api.openPlan('older-plan'), opened = JSON.parse(f.store.get(DRAFT));
  assert.equal(opened.selectedPathwayId, 'degree-a');
  assert.equal(opened.profile.degree, 'B.S. Biology');
  assert.equal(A.readDraft(opened, biology).csv, 'Older biology requirements');
  assert.equal(A.readDraft(opened, history).csv, 'Current history requirements');
  assert.deepEqual(opened.learning, local.learning);
  assert.deepEqual(opened.sheet.notes, {saved:{biology:'Cloud biology note'}, ...local.sheet.notes});
  assert.deepEqual(opened.checklist, local.checklist);
  assert.deepEqual(opened.scenarios['degree-b'], local.scenarios['degree-b']);
  assert.deepEqual(opened.savings['degree-b'], local.savings['degree-b']);
  assert.equal(result.restore.coursesPreserved, 2);
  assert.equal(result.restore.conflicts, 1);
  assert.deepEqual(JSON.parse(f.store.get(LINK)), {ownerId:'account-a', planId:'older-plan', revision:2});
  assert.deepEqual(saved, savedBefore);
  assert.deepEqual(local, localBefore);
  assert.equal(A.validatePrivateWork(opened), true);
});

test('the current draft wins for the same exact context while other cloud and local keys survive', async () => {
  const common = context(), cloudOnly = context({programId:'cloud-only'}), localOnly = context({programId:'local-only'});
  let saved = withDraft(seed(), common, 'Older cloud edit');
  saved = withDraft(saved, cloudOnly, 'Cloud-only requirements');
  let local = withDraft(seed('degree-b'), common, 'Current local edit');
  local = withDraft(local, localOnly, 'Local-only requirements');
  const expected = A.readDraft(local, common), f = fixture(saved, local);
  await f.api.openPlan('older-plan');
  const opened = JSON.parse(f.store.get(DRAFT));
  assert.equal(opened.auditDrafts.drafts.length, 3);
  assert.deepEqual(A.readDraft(opened, common), expected);
  assert.equal(A.readDraft(opened, cloudOnly).csv, 'Cloud-only requirements');
  assert.equal(A.readDraft(opened, localOnly).csv, 'Local-only requirements');
});

test('private audit routes and exact comparison versions survive restore without creating learning records', async () => {
  const first = imported('older'), second = imported('current');
  const saved = A.commit(seed('degree-a'), first, {catalog});
  const local = A.commit(seed('degree-b'), second, {catalog});
  const f = fixture(saved, local);
  await f.api.openPlan('older-plan');
  const opened = JSON.parse(f.store.get(DRAFT));
  assert.equal(opened.selectedPathwayId, first.route.id);
  assert.deepEqual(opened.customCurricula, [first, second]);
  assert.deepEqual(A.models(opened).map(model => model.id), [first.model.id, second.model.id]);
  assert(A.attach(catalog, opened).pathways.some(route => route.id === second.route.id));
  assert.deepEqual(opened.whatIf.snapshots, copy([...saved.whatIf.snapshots, ...local.whatIf.snapshots]));
  assert.equal(opened.whatIf.snapshots.length, 2);
  for (const snapshot of opened.whatIf.snapshots) {
    assert(snapshot.targetIdentity.route.school);
    assert.equal(Object.hasOwn(snapshot, 'learning'), false);
    assert.equal(Object.hasOwn(snapshot, 'sheet'), false);
  }
  assert.deepEqual(opened.learning, local.learning);
  assert.equal(opened.learning.some(record => record.code === 'BIO301'), false);
  assert.equal(A.validatePrivateWork(opened), true);
});

test('same imported identity with a different valid model fails before any storage write', async () => {
  const first = imported('same-id', 'First imported degree'), second = imported('same-id', 'Revised imported degree');
  assert.equal(A.validateEntry(first).route.id, A.validateEntry(second).route.id);
  await assertAtomicRejection(A.commit(seed(), first, {catalog}), A.commit(seed('degree-b'), second, {catalog}), /share an ID with different requirements/);
});

test('identical imported audits deduplicate and a current comparison version wins its shared ID', async () => {
  const entry = imported('shared');
  const saved = A.commit(seed(), entry, {catalog}), local = A.commit(seed('degree-b'), entry, {catalog});
  const previous = saved.whatIf.snapshots[0];
  local.whatIf.snapshots.push({...copy(previous), label:'Current comparison name', settings:{priority:'speed'}});
  const f = fixture(saved, local);
  await f.api.openPlan('older-plan');
  const opened = JSON.parse(f.store.get(DRAFT));
  assert.deepEqual(opened.customCurricula, [entry]);
  assert.equal(opened.whatIf.snapshots.length, 2);
  assert.deepEqual(opened.whatIf.snapshots.find(snapshot => snapshot.id === previous.id), local.whatIf.snapshots.at(-1));
});

test('malformed local or cloud private stores fail before replacing either stored marker', async () => {
  const valid = A.commit(withDraft(seed(), context()), imported('valid'), {catalog});
  const mutations = [
    state => {state.auditDrafts = null;},
    state => {state.auditDrafts.version = 2;},
    state => {state.auditDrafts.drafts[0].key = 'wrong-target';},
    state => {state.auditDrafts.drafts[0].metadata.school = 'Wrong University';},
    state => {state.customCurricula = {};},
    state => {state.customCurricula[0].model.totalCredits = 120;}
  ];
  for (const mutate of mutations) {
    const corrupt = copy(valid); mutate(corrupt);
    await assertAtomicRejection(valid, corrupt);
    await assertAtomicRejection(corrupt, valid);
  }
  await assertAtomicRejection(valid, valid, /not been replaced/, '{broken');
});

test('private validation runs when an account plan is opened onto a device with no draft', async () => {
  const saved = withDraft(seed(), context(), 'Cloud requirements');
  const f = fixture(saved);
  await f.api.openPlan('older-plan');
  assert.deepEqual(JSON.parse(f.store.get(DRAFT)), saved);
  const corrupt = copy(saved); corrupt.auditDrafts.version = 2;
  await assertAtomicRejection(corrupt, undefined);
});

test('combining individually valid plans respects draft and imported audit count limits atomically', async () => {
  let saved = seed(), local = seed('degree-b');
  for (let i = 0; i < 6; i++) saved = withDraft(saved, context({programId:'cloud-' + i}));
  for (let i = 0; i < 5; i++) local = withDraft(local, context({programId:'local-' + i}));
  assert.equal(A.validatePrivateWork(saved), true);
  assert.equal(A.validatePrivateWork(local), true);
  await assertAtomicRejection(saved, local, /storage.*limit/);
  saved = seed(); local = seed('degree-b');
  for (let i = 0; i < 3; i++) {
    saved = A.commit(saved, imported('cloud-' + i), {catalog});
    local = A.commit(local, imported('local-' + i), {catalog});
  }
  assert.equal(A.validatePrivateWork(saved), true);
  assert.equal(A.validatePrivateWork(local), true);
  await assertAtomicRejection(saved, local, /storage.*limit/);
});

test('combined private draft byte limits count UTF-8 bytes and leave the original draft intact', async () => {
  const saved = withDraft(seed(), context({programId:'cloud'}), '😀'.repeat(40000));
  const local = withDraft(seed('degree-b'), context({programId:'local'}), '😀'.repeat(40000));
  assert.equal(A.validatePrivateWork(saved), true);
  assert.equal(A.validatePrivateWork(local), true);
  assert(JSON.stringify(saved.auditDrafts).length + JSON.stringify(local.auditDrafts).length < A.limits.maxDraftBytes);
  await assertAtomicRejection(saved, local, /storage.*limit/);
});

test('combining individually valid imported audits respects their shared byte limit atomically', async () => {
  const rows = Array.from({length:120}, (_, i) => ({section:'Major', code:'BIO' + i, title:'Cell biology ' + 'x'.repeat(175), credits:1}));
  const saved = A.commit(seed(), imported('large-cloud', 'Cloud biology', rows), {catalog});
  const local = A.commit(seed('degree-b'), imported('large-local', 'Current biology', rows), {catalog});
  assert.equal(A.validatePrivateWork(saved), true);
  assert.equal(A.validatePrivateWork(local), true);
  assert(Buffer.byteLength(JSON.stringify([...saved.customCurricula, ...local.customCurricula])) > A.limits.maxBytes);
  await assertAtomicRejection(saved, local, /audit storage exceeds its limit/);
});

test('combined private work enforces the UTF-8 account size before writing', async () => {
  const saved = withDraft(seed(), context({programId:'cloud'}));
  const local = withDraft(seed('degree-b'), context({programId:'local'}));
  saved.sheet.notes = {cloud:'😀'.repeat(65000)};
  local.sheet.notes = {local:'😀'.repeat(65000)};
  assert.equal(A.validatePrivateWork(saved), true);
  assert.equal(A.validatePrivateWork(local), true);
  assert(JSON.stringify(saved).length + JSON.stringify(local).length < 480000);
  await assertAtomicRejection(saved, local, /too large for a private account copy/);
});

test('comparison version overflow or corrupt version storage fails before replacing the device copy', async () => {
  const saved = withDraft(seed(), context()), local = withDraft(seed('degree-b'), context({programId:'other'}));
  const versions = (state, prefix, count) => Array.from({length:count}, (_, i) => C.planSnapshot(state, {pathway:catalog.pathways.find(route => route.id === state.selectedPathwayId)}, {id:prefix + i}));
  saved.whatIf.snapshots = versions(saved, 'cloud-', 11);
  local.whatIf.snapshots = versions(local, 'local-', 10);
  await assertAtomicRejection(saved, local, /too many saved versions/);
  for (const snapshots of ['corrupt', [null], [{}]]) {
    const bad = copy(local); bad.whatIf.snapshots = snapshots;
    await assertAtomicRejection(saved, bad, /recovery|could not be read/);
  }
});
