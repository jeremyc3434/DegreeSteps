const assert = require('node:assert/strict');
const test = require('node:test');
const Sheet = require('./dist/sheet-state.js');
const Guide = require('./dist/guide-engine.js');
const Planner = require('./dist/planner.js');
const catalog = require('./dist/data/pathways.json');
const tesu = require('./dist/data/tesu.json');
const liberty = require('./dist/data/liberty.json');
const pathway = catalog.pathways.find(item => item.modelId === tesu.id);
const otherPathway = catalog.pathways.find(item => item.modelId === liberty.id);
const clone = value => JSON.parse(JSON.stringify(value));
const req = id => tesu.requirements.find(item => item.id === id);
const option = (requirementId, optionId) => req(requirementId).options.find(item => item.id === optionId);
function earned(overrides = {}) {
  return { id: 'saved-source', provider: 'Sophia', code: 'MATH1001', title: 'College Algebra', credits: 3, creditSystem: 'semester', status: 'earned', completedOn: '2024-06-01', evaluations: [{ programId: liberty.id, requirementId: 'private-other-placement', status: 'confirmed' }], ...overrides };
}
function state(learning = []) {
  return Sheet.initialize({ version: 3, profile: { entry: 'audit', priority: 'balanced', pathwayId: tesu.id, goalDetail: 'PRIVATE-PROFILE' }, learning, scenarios: {}, selectedPathwayId: tesu.id, view: 'results', step: 'direction', resultTab: 'plan', baseline: null }, null, catalog);
}

test('finished learning can retain unknown credit details without projecting a degree award', () => {
  for (const details of [{credits:null,creditSystem:null},{credits:3,creditSystem:null}]) {
    const initial=state();
    const saved=Sheet.updateLearning(initial,earned({...details,evaluations:[]}));
    assert.equal(saved.learning[0].status,'earned');
    assert.deepEqual(Guide.matchInventory(tesu,saved.learning).completed,[]);
    assert.equal(saved.learning[0].creditSystem,null);
    assert.throws(()=>Sheet.assignLearning(saved,tesu,'saved-source','mat1210',{confirmation:true}));
    assert.throws(()=>Sheet.updateLearning(saved,saved.learning[0],{confirmation:true,confirmCurrentProgram:{programId:tesu.id,requirementId:'mat1210'}}));
    assert.throws(()=>Sheet.recordProgress(saved,tesu,req('mat1210'),option('mat1210','soph-0001'),'confirmed',{confirmation:true,recordId:'saved-source'}));
  }
});

test('initialization preserves the version-three learning inventory and independent scenario state', () => {
  const saved = { version: 3, profile: { pathwayId: tesu.id, goalDetail: 'PRIVATE-PROFILE' }, learning: [earned()], scenarios: { [tesu.id]: { providers: ['Sophia'], allowConditional: true, optionSelections: { mat1210: 'soph-0001' } } }, selectedPathwayId: tesu.id, sheet: { notes: { [tesu.id]: { mat1210: 'PRIVATE-NOTE' } } } };
  const before = clone(saved);
  const result = Sheet.initialize(saved, null, catalog);
  assert.deepEqual(result.learning, saved.learning);
  assert.equal(result.profile.goalDetail, 'PRIVATE-PROFILE');
  assert.equal(result.sheet.notes[tesu.id].mat1210, 'PRIVATE-NOTE');
  assert.equal(result.scenarios[tesu.id].optionSelections.mat1210, 'soph-0001');
  result.learning[0].title = 'Changed independently';
  assert.deepEqual(saved, before, 'Initialization must detach the saved private state');
});

test('CSV never presents an unmapped outside requirement as mandatory university coursework',()=>{
  const draft=Planner.generate(tesu,{providers:['Sophia','Study.com','CLEP'],allowConditional:true});
  const csv=Sheet.exportCSV(tesu,draft);
  assert.match(csv,/Transfer course not matched/);
  assert.match(csv,/university-only coursework is not established/);
});

test('legacy migration retains original source placements, unknown credit amounts, and its untouched backup', () => {
  const legacy = { fields: { program: tesu.id, priority: 'speed' }, prior: { [tesu.id]: [{ title: 'Original prior course', sourceProvider: 'Other college', requirementId: 'enc1010', status: 'confirmed' }], [liberty.id]: [{ title: 'Original prior course', sourceProvider: 'Other college', requirementId: 'other-requirement', status: 'reported' }] } };
  const before = clone(legacy);
  const migrated = Sheet.initialize(null, legacy, catalog);
  assert.equal(migrated.learning.length, 1);
  assert.equal(migrated.learning[0].credits, null);
  assert.equal(migrated.learning[0].evaluations.length, 2);
  assert.deepEqual(migrated.legacyBackup, legacy);
  assert.deepEqual(legacy, before);
});

test('switching degrees preserves earned learning and each degree’s proposed course choices', () => {
  const initial = state([earned()]);
  const chosen = Sheet.setCourse(initial, tesu.id, 'mat1210', 'soph-0001');
  const selected = Sheet.selectPathway(chosen, otherPathway);
  assert.equal(selected.selectedPathwayId, otherPathway.id);
  assert.equal(selected.profile.pathwayId, otherPathway.id);
  assert.deepEqual(selected.learning, initial.learning);
  assert.equal(selected.scenarios[tesu.id].optionSelections.mat1210, 'soph-0001');
  const reset = Sheet.setCourse(selected, tesu.id, 'mat1210', '');
  assert.deepEqual(reset.scenarios[tesu.id].optionSelections, {});
  assert.equal(chosen.scenarios[tesu.id].optionSelections.mat1210, 'soph-0001');
  assert.deepEqual(initial.scenarios, {});
});

test('reading default scenario settings does not mutate state and private notes stay per degree', () => {
  const initial = state(); const before = clone(initial);
  const settings = Sheet.scenario(initial, pathway);
  assert.ok(Array.isArray(settings.providers));
  assert.deepEqual(initial, before);
  const noted = Sheet.setNote(initial, tesu.id, 'mat1210', 'Private advising note');
  assert.equal(noted.sheet.notes[tesu.id].mat1210, 'Private advising note');
  assert.deepEqual(initial, before);
  const switched = Sheet.selectPathway(noted, otherPathway);
  assert.equal(switched.sheet.notes[tesu.id].mat1210, 'Private advising note');
});

test('recording future learning creates progress without inventing a university confirmation', () => {
  const initial = state();
  const progress = Sheet.recordProgress(initial, tesu, req('mat1210'), option('mat1210', 'soph-0001'), 'in-progress');
  assert.equal(initial.learning.length, 0);
  assert.equal(progress.learning.length, 1);
  assert.equal(progress.learning[0].status, 'in-progress');
  assert.ok(!progress.learning[0].evaluations.some(item => item.status === 'confirmed'));
  assert.deepEqual(Guide.matchInventory(tesu, progress.learning).completed, []);
  const completed = Sheet.recordProgress(progress, tesu, req('mat1210'), option('mat1210', 'soph-0001'), 'completed', { completedOn: '2026-10-31' });
  assert.equal(completed.learning.length, 1);
  assert.equal(completed.learning[0].id, progress.learning[0].id);
  assert.equal(completed.learning[0].status, 'earned');
  assert.equal(completed.learning[0].completedOn, '2026-10-31');
  assert.deepEqual(completed.learning[0].evaluations.map(item => [item.programId, item.requirementId, item.status]), [[tesu.id, 'mat1210', 'reported']]);
  assert.equal(Guide.matchInventory(tesu, completed.learning).completed[0].status, 'reported');
});

test('confirmation requires deliberate consent and an existing matching earned source with sufficient known credits', () => {
  const r = req('mat1210'), o = option('mat1210', 'soph-0001');
  assert.throws(() => Sheet.recordProgress(state(), tesu, r, o, 'confirmed', { confirmation: true }));
  assert.throws(() => Sheet.recordProgress(state([earned()]), tesu, r, o, 'confirmed'));
  for (const source of [earned({ status: 'in-progress' }), earned({ credits: null }), earned({ credits: 0 }), earned({ credits: 1 }), earned({ credits: Infinity }), earned({ provider: 'Other college' })]) {
    assert.throws(() => Sheet.recordProgress(state([source]), tesu, r, o, 'confirmed', { confirmation: true, recordId: source.id }));
  }
  const initial = state([earned()]);
  const confirmed = Sheet.recordProgress(initial, tesu, r, o, 'confirmed', { confirmation: true, recordId: 'saved-source' });
  assert.equal(confirmed.learning.length, 1);
  assert.ok(confirmed.learning[0].evaluations.some(item => item.programId === tesu.id && item.requirementId === r.id && item.status === 'confirmed'));
  assert.ok(confirmed.learning[0].evaluations.some(item => item.programId === liberty.id && item.status === 'confirmed'));
  assert.deepEqual(initial.learning, [earned()]);
  assert.throws(() => Sheet.recordProgress(confirmed, tesu, r, o, 'in-progress'), /earned|complete|downgrade/i);
});

test('a reviewed six-credit CLEP bundle creates one earned source and two provisional components', () => {
  const first = Sheet.recordProgress(state(), tesu, req('enc1010'), option('enc1010', 'clep-composition-enc1010'), 'completed');
  const second = Sheet.recordProgress(first, tesu, req('enc1020'), option('enc1020', 'clep-composition-enc1020'), 'completed');
  assert.equal(second.learning.length, 1);
  assert.equal(second.learning[0].credits, 6);
  assert.equal(second.learning[0].code, 'CLEP-0040');
  const evaluations = second.learning[0].evaluations.filter(item => item.programId === tesu.id);
  assert.deepEqual(evaluations.map(item => item.requirementId).sort(), ['enc1010', 'enc1020']);
  assert.ok(evaluations.every(item => item.status === 'reported'));
  const matched = Guide.matchInventory(tesu, second.learning);
  assert.equal(matched.completed.length, 2);
  const draft = Planner.generate(tesu, { completed: matched.completed, providers: ['CLEP'], allowConditional: true });
  assert.equal(draft.totals.reported, 6);
  assert.ok(!draft.blockers.some(item => item.code === 'duplicate_source'));
  assert.ok(!draft.rows.some(row => ['enc1010', 'enc1020'].includes(row.requirementId) && row.status === 'planned'));
});

test('editing source identity clears all stale degree evaluations, while note edits preserve stored evaluations', () => {
  const original = earned({ notes: 'Old private note', evaluations: [{ programId: tesu.id, requirementId: 'mat1210', status: 'confirmed' }, { programId: liberty.id, requirementId: 'other', status: 'confirmed' }] });
  const initial = state([original]);
  const noted = Sheet.updateLearning(initial, { ...original, notes: 'Updated private note', evaluations: [{ programId: 'injected', requirementId: 'fake', status: 'confirmed' }] });
  assert.deepEqual(noted.learning[0].evaluations, original.evaluations);
  assert.equal(noted.learning[0].notes, 'Updated private note');
  for (const changes of [{ provider: 'Other college' }, { code: 'DIFFERENT' }, { title: 'Changed course identity' }, { credits: 4 }, { creditSystem: 'quarter' }, { completedOn: '2025-01-01' }, { status: 'in-progress' }]) {
    const edited = Sheet.updateLearning(initial, { ...original, ...changes });
    assert.deepEqual(edited.learning[0].evaluations, [], JSON.stringify(changes));
    assert.deepEqual(initial.learning[0].evaluations, original.evaluations);
  }
});

test('a changed source can receive only a newly explicit current-program evaluation', () => {
  const original = earned();
  const changed = Sheet.updateLearning(state([original]), { ...original, code: 'UPDATED-SOURCE', evaluations: [{ programId: 'injected', status: 'confirmed' }] }, { confirmation: true, confirmCurrentProgram: { programId: tesu.id, requirementId: 'mat1210' } });
  assert.deepEqual(changed.learning[0].evaluations, [{ programId: tesu.id, requirementId: 'mat1210', status: 'confirmed' }]);
  assert.throws(() => Sheet.updateLearning(state(), earned({ id: undefined, status: 'in-progress' }), { confirmation: true, confirmCurrentProgram: { programId: tesu.id, requirementId: 'mat1210' } }));
});

test('CSV import handles quoted commas and line breaks while rejecting malformed records and unrecognized statuses', () => {
  const parsed = Sheet.parseCSV('provider,code,title,credits,creditSystem,status,completedOn,notes,evaluations\r\nSophia,SOPH-0015,"English, \"\"Composition\"\"\nI",3,semester,earned,2024-06-01,PRIVATE,"[{\"\"status\"\":\"\"confirmed\"\"}]"');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'English, "Composition"\nI');
  assert.equal(parsed[0].credits, 3);
  assert.deepEqual(parsed[0].evaluations, []);
  assert.equal('notes' in parsed[0], false);
  for (const raw of [
    'provider,title,credits\nSophia,Algebra,not-a-number',
    'provider,title,credits\nSophia,Algebra,0',
    'provider,title,credits,status\nSophia,Algebra,3,earnd',
    'provider,title,credits\nSophia,"Unfinished,3',
    'provider,title,credits\nSophia,Alge"bra,3',
    'provider,title,credits\nSophia,"Algebra"junk,3',
    'title,credits\nAlgebra,3'
  ]) assert.throws(() => Sheet.parseCSV(raw), undefined, raw);
});

test('CSV preview and explicit merge preserve unchanged confirmations, clear changed details, and reject conflicting duplicate identities', () => {
  const initial = state([earned()]);
  const before = clone(initial);
  const unchangedRows = Sheet.parseCSV('provider,code,title,credits,creditSystem,status,completedOn\nSophia,MATH1001,College Algebra,3,semester,earned,2024-06-01');
  assert.deepEqual(initial, before, 'Parsing must never commit the preview');
  const unchanged = Sheet.mergeLearning(initial, unchangedRows);
  assert.deepEqual(unchanged.learning[0], initial.learning[0]);
  const changedRows = Sheet.parseCSV('provider,code,title,credits,creditSystem,status,completedOn\nSophia,MATH1001,College Algebra,4,semester,earned,2024-06-01');
  const changed = Sheet.mergeLearning(initial, changedRows);
  assert.equal(changed.learning.length, 1);
  assert.equal(changed.learning[0].id, 'saved-source');
  assert.equal(changed.learning[0].credits, 4);
  assert.deepEqual(changed.learning[0].evaluations, []);
  assert.deepEqual(initial, before);
  const conflicts = Sheet.parseCSV('provider,code,title,credits\nSophia,MATH1001,College Algebra,3\nSophia,MATH1001,College Algebra,4');
  assert.throws(() => Sheet.mergeLearning(initial, conflicts), /duplicate|conflict|same/i);
});

function csvRows(raw) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') { if (quoted && raw[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
test('curriculum CSV exports seven public columns, neutralizes spreadsheet formulas, and excludes private notes', () => {
  const requirement = { ...req('mat1210'), title: '=1+1', categoryLabel: '=1+1' };
  const model = { ...tesu, requirements: [requirement] };
  const draft = { rows: [{ requirementId: requirement.id, title: '=1+1', credits: 3, status: 'planned', conditions: [], sourceIds: [], option: { ...option('mat1210', 'tesu-mat1210'), provider: '+SheetProvider', title: '@SheetCourse' } }] };
  const csv = Sheet.exportCSV(model, draft, { mat1210: 'PRIVATE-ADVISOR-NOTE' });
  const rows = csvRows(csv);
  assert.deepEqual(rows[0], ['Requirement', 'Credits', 'Provider', 'Course', 'Progress', 'Review', 'Source']);
  assert.equal(rows[1].length, 7);
  assert.equal(rows[1][0], "'=1+1");
  assert.equal(rows[1][2], "'+SheetProvider");
  assert.equal(rows[1][3], "'@SheetCourse");
  assert.doesNotMatch(csv, /PRIVATE-ADVISOR-NOTE|Notes/);
});

test('public plan sharing includes only proposed courses and the server-approved public fields', () => {
  const future = { requirementId: 'mat1210', title: 'College Algebra', credits: 3, status: 'planned', notes: 'PRIVATE-ROW-NOTE', option: { ...option('mat1210', 'tesu-mat1210'), privateEvaluation: 'PRIVATE-EVALUATION' } };
  const draft = { rows: [future, { ...future, requirementId: 'enc1010', status: 'confirmed' }, { ...future, requirementId: 'enc1020', status: 'reported' }, { ...future, requirementId: 'com2090', status: 'in-progress' }], profile: { name: 'PRIVATE-NAME' }, transcript: ['PRIVATE-TRANSCRIPT'] };
  const published = Sheet.publicPlan(tesu, draft, pathway, 'balanced');
  assert.equal(published.programId, tesu.id);
  assert.equal(published.totalCredits, 120);
  assert.equal(published.courses.length, 1);
  assert.equal(published.courses[0].courseId, 'tesu-mat1210');
  assert.deepEqual(Object.keys(published).sort(), ['schoolId','schoolName','programId','programName','strategy','totalCredits','courses'].sort());
  const allowed = new Set(['requirementId','requirement','courseId','title','provider','credits','url']);
  assert.ok(Object.keys(published.courses[0]).every(key => allowed.has(key)));
  assert.doesNotMatch(JSON.stringify(published), /PRIVATE|confirmed|reported|in-progress/);
});

test('an unsupported exact saved target retains its names and learning, while an empty draft gets a labeled example', () => {
  const saved = { version: 3, profile: { school: 'Private Exact University', schoolChoice: 'custom', degree: 'B.S. in an Unmapped Specialty', pathwayId: '', goalDetail: 'PRIVATE-TARGET-NOTE' }, selectedPathwayId: '', learning: [earned()], scenarios: {} };
  const before = clone(saved);
  const custom = Sheet.initialize(saved, null, catalog);
  assert.equal(custom.selectedPathwayId, 'custom-target');
  assert.equal(custom.profile.pathwayId, 'custom-target');
  assert.equal(custom.profile.school, saved.profile.school);
  assert.equal(custom.profile.degree, saved.profile.degree);
  assert.equal(custom.profile.goalDetail, saved.profile.goalDetail);
  assert.equal(custom.sheet.isExample, false);
  assert.deepEqual(custom.learning, saved.learning);
  assert.deepEqual(saved, before);
  const example = Sheet.initialize(null, null, catalog);
  assert.equal(example.selectedPathwayId, tesu.id);
  assert.equal(example.sheet.isExample, true);
  assert.deepEqual(example.learning, []);
});

function universityProgram(id, school) {
  return { id, school, creditSystem: 'semester', totalCredits: 3, requirements: [{ id: 'math', title: 'College Math', credits: 3, options: [{ id: id + '-mat101', provider: 'University', code: 'MAT101', title: 'College Math', credits: 3, evidence: 'published' }] }] };
}
test('identical university course codes from different schools or programs keep separate original sources', () => {
  for (const schools of [['First University', 'Second University'], ['Same University', 'Same University']]) {
  const firstProgram = universityProgram('first-program', schools[0]);
  const secondProgram = universityProgram('second-program', schools[1]);
  const firstReq = firstProgram.requirements[0], secondReq = secondProgram.requirements[0];
  const first = Sheet.recordProgress(state(), firstProgram, firstReq, firstReq.options[0], 'completed');
  const second = Sheet.recordProgress(first, secondProgram, secondReq, secondReq.options[0], 'completed');
  assert.equal(second.learning.length, 2);
  const firstSource = second.learning.find(item => item.sourceProgramId === firstProgram.id);
  const secondSource = second.learning.find(item => item.sourceProgramId === secondProgram.id);
  assert.ok(firstSource && secondSource);
  assert.notEqual(firstSource.id, secondSource.id);
  assert.equal(firstSource.institution, firstProgram.school);
  assert.equal(secondSource.institution, secondProgram.school);
  assert.deepEqual(firstSource.evaluations.map(item => item.programId), [firstProgram.id]);
  assert.deepEqual(secondSource.evaluations.map(item => item.programId), [secondProgram.id]);
  assert.deepEqual(Guide.matchInventory(firstProgram, second.learning).completed.map(item => item.learningId), [firstSource.id]);
  assert.deepEqual(Guide.matchInventory(secondProgram, second.learning).completed.map(item => item.learningId), [secondSource.id]);
  assert.equal(first.learning.length, 1, 'Recording the second institution must leave the first state unchanged');
  }
});

test('changing university institution or source program clears stale confirmations', () => {
  const original = earned({ provider: 'University', code: 'MAT101', institution: 'First University', sourceProgramId: 'first-program', evaluations: [{ programId: 'first-program', requirementId: 'math', status: 'confirmed' }, { programId: 'destination-program', requirementId: 'math', status: 'confirmed' }] });
  const initial = state([original]);
  for (const change of [{ institution: 'Second University' }, { sourceProgramId: 'second-program' }]) {
    const changed = Sheet.updateLearning(initial, { ...original, ...change });
    assert.deepEqual(changed.learning[0].evaluations, [], JSON.stringify(change));
    assert.deepEqual(initial.learning[0].evaluations, original.evaluations);
  }
});

test('external provider aliases still reuse the original earned source across degree placements', () => {
  const original = earned({ code: 'SOPH-0001', notes: 'PRIVATE-SOURCE-NOTE' });
  const initial = state([original]);
  const completed = Sheet.recordProgress(initial, tesu, req('mat1210'), option('mat1210', 'soph-0001'), 'completed');
  assert.equal(completed.learning.length, 1);
  assert.equal(completed.learning[0].id, original.id);
  assert.equal(completed.learning[0].code, 'SOPH-0001');
  assert.equal(completed.learning[0].notes, 'PRIVATE-SOURCE-NOTE');
  assert.ok(completed.learning[0].evaluations.some(item => item.programId === tesu.id && item.status === 'reported'));
  assert.ok(completed.learning[0].evaluations.some(item => item.programId === liberty.id && item.status === 'confirmed'));
  assert.deepEqual(initial.learning[0], original);
});

test('version-two scenario migration preserves raw cost, timing, and provider settings with its original backup', () => {
  const legacy = {
    fields: { program: tesu.id, priority: 'speed', tuition: '315.75', fees: 0, 'sophia-months': '02', 'study-months': '', 'sophia-weeks': '4.5', 'study-weeks': 8, 'clep-weeks': '3', 'external-concurrency': '2', 'term-weeks': 6, 'term-credits': '9' },
    providers: [], conditional: false, useWaivers: true, modernStates: false, prior: {}
  };
  const before = clone(legacy);
  const migrated = Sheet.initialize(null, legacy, catalog);
  const settings = Sheet.scenario(migrated, pathway);
  assert.deepEqual({
    providers: settings.providers, allowConditional: settings.allowConditional, useWaivers: settings.useWaivers, modernStates: settings.modernStates,
    universityRate: settings.universityRate, fees: settings.fees, sophiaMonths: settings.sophiaMonths, studyMonths: settings.studyMonths,
    sophiaWeeks: settings.sophiaWeeks, studyWeeks: settings.studyWeeks, clepWeeks: settings.clepWeeks, concurrency: settings.concurrency,
    termWeeks: settings.termWeeks, termCredits: settings.termCredits
  }, {
    providers: [], allowConditional: false, useWaivers: true, modernStates: false,
    universityRate: '315.75', fees: 0, sophiaMonths: '02', studyMonths: '',
    sophiaWeeks: '4.5', studyWeeks: 8, clepWeeks: '3', concurrency: '2', termWeeks: 6, termCredits: '9'
  });
  assert.deepEqual(migrated.legacyBackup, before);
  assert.deepEqual(legacy, before);
});

test('quick progress edits clear stale evaluations when completion date or learning status changes', () => {
  const r = req('mat1210'), o = option('mat1210', 'soph-0001');
  const original = earned({ evaluations: [{ programId: tesu.id, requirementId: r.id, optionId: o.id, status: 'confirmed' }, { programId: liberty.id, requirementId: 'other', status: 'confirmed' }] });
  const initial = state([original]);
  const reported = Sheet.recordProgress(initial, tesu, r, o, 'completed', { completedOn: '2025-02-02' });
  assert.equal(reported.learning[0].completedOn, '2025-02-02');
  assert.deepEqual(reported.learning[0].evaluations, [{ programId: tesu.id, requirementId: r.id, optionId: o.id, status: 'reported' }]);
  const reconfirmed = Sheet.recordProgress(initial, tesu, r, o, 'confirmed', { completedOn: '2025-02-02', confirmation: true, recordId: original.id });
  assert.deepEqual(reconfirmed.learning[0].evaluations, [{ programId: tesu.id, requirementId: r.id, optionId: o.id, status: 'confirmed' }]);
  assert.deepEqual(initial.learning[0], original);
  const pending = state([{ ...original, status: 'in-progress' }]);
  const finished = Sheet.recordProgress(pending, tesu, r, o, 'completed');
  assert.equal(finished.learning[0].status, 'earned');
  assert.deepEqual(finished.learning[0].evaluations, [{ programId: tesu.id, requirementId: r.id, optionId: o.id, status: 'reported' }]);
  assert.equal(pending.learning[0].status, 'in-progress');
});

function assignmentProgram() {
  return {
    id: 'manual-placement-degree', school: 'Destination University', creditSystem: 'semester', totalCredits: 9,
    requirements: [
      { id: 'writing', title: 'College Writing', credits: 3, options: [{ id: 'reviewed-writing', provider: 'Sophia', title: 'College Writing', code: 'WRITING-101', credits: 3 }] },
      { id: 'humanities', title: 'Humanities', credits: 3, options: [] },
      { id: 'elective', title: 'Free Elective', credits: 3, options: [] },
      { id: 'application', title: 'Submit application', credits: 0, options: [] }
    ]
  };
}

test('manual earned-college placement is reported without a guessed option and preserves independent state', () => {
  const program = assignmentProgram();
  const original = earned({ provider: 'University', institution: 'Original College', sourceProgramId: 'original-degree', title: 'College Writing', code: 'WRITING-101', credits: 6, notes: 'PRIVATE-SOURCE-NOTE', evaluations: [
    { programId: liberty.id, requirementId: 'other-school-placement', status: 'confirmed' },
    { programId: program.id, requirementId: 'writing', optionId: 'stale-option', status: 'confirmed' }
  ] });
  const initial = { ...state([original]), scenarios: {
    [program.id]: { fees: '25', optionSelections: { writing: 'reviewed-writing', humanities: 'keep-this-alternative' } },
    [liberty.id]: { optionSelections: { other: 'other-school-course' } }
  } };
  const before = clone(initial);
  const placed = Sheet.assignLearning(initial, program, original.id, 'writing');
  assert.deepEqual(placed.learning[0].evaluations, [
    original.evaluations[0], { programId: program.id, requirementId: 'writing', status: 'reported' }
  ]);
  assert.deepEqual({ ...placed.learning[0], evaluations: original.evaluations }, original);
  assert.equal(placed.scenarios[program.id].fees, '25');
  assert.deepEqual(placed.scenarios[program.id].optionSelections, { humanities: 'keep-this-alternative' });
  assert.deepEqual(placed.scenarios[liberty.id], initial.scenarios[liberty.id]);
  const matched = Guide.matchInventory(program, placed.learning).completed;
  assert.equal(matched.length, 1);
  assert.equal(matched[0].status, 'reported');
  assert.equal(matched[0].sourceProvider, 'Institutional transfer');
  assert.equal(matched[0].optionId, undefined, 'A similar course title/code is not a curated source option');
  assert.deepEqual(initial, before);
});

test('manual placement requires one earned source, known positive source credits and a real credit requirement', () => {
  const program = assignmentProgram();
  for (const changes of [{ status: 'planned' }, { status: 'in-progress' }, { credits: null }, { credits: 0 }, { credits: -1 }, { credits: Infinity }, { credits: NaN }, { creditSystem: 'unknown' }]) {
    assert.throws(() => Sheet.assignLearning(state([earned(changes)]), program, 'saved-source', 'writing'), undefined, JSON.stringify(changes));
  }
  assert.throws(() => Sheet.assignLearning(state(), program, 'missing-source', 'writing'));
  assert.throws(() => Sheet.assignLearning(state([earned(), earned()]), program, 'saved-source', 'writing'));
  for (const id of ['missing-requirement', 'application', 'constructor']) {
    assert.throws(() => Sheet.assignLearning(state([earned()]), program, 'saved-source', id));
  }
  for (const credits of [null, -3, Infinity, NaN]) {
    const invalidProgram = { ...program, requirements: [{ id: 'writing', credits }] };
    assert.throws(() => Sheet.assignLearning(state([earned()]), invalidProgram, 'saved-source', 'writing'));
  }
});

test('manual same-unit placements share the source credit budget within a degree and cannot overallocate on confirmation', () => {
  const program = assignmentProgram();
  const original = earned({ credits: 6 });
  const initial = state([original]);
  const writing = Sheet.assignLearning(initial, program, original.id, 'writing');
  const humanities = Sheet.assignLearning(writing, program, original.id, 'humanities');
  assert.deepEqual(humanities.learning[0].evaluations.filter(item => item.programId === program.id).map(item => item.requirementId), ['writing', 'humanities']);
  const repeated = Sheet.assignLearning(humanities, program, original.id, 'writing', { confirmation: true });
  assert.equal(repeated.learning[0].evaluations.filter(item => item.programId === program.id && item.requirementId === 'writing').length, 1);
  assert.equal(repeated.learning[0].evaluations.find(item => item.programId === program.id && item.requirementId === 'writing').status, 'confirmed');
  const before = clone(repeated);
  for (const confirmation of [false, true]) {
    assert.throws(() => Sheet.assignLearning(repeated, program, original.id, 'elective', { confirmation }), /allocat|credits/i);
  }
  assert.deepEqual(repeated, before, 'A failed allocation must not alter saved evaluations');
  assert.deepEqual(initial.learning[0], original);
});

test('manual placement refuses to overwrite another record’s assignment to the same degree requirement', () => {
  const program = assignmentProgram();
  for (const status of ['reported', 'confirmed']) {
    const other = earned({ id: 'other-source', code: 'OTHER-101', evaluations: [{ programId: program.id, requirementId: 'writing', status }] });
    const initial = state([earned(), other]);
    const before = clone(initial);
    assert.throws(() => Sheet.assignLearning(initial, program, 'saved-source', 'writing', { confirmation: true }), /another source|already/i);
    assert.deepEqual(initial, before);
  }
});

test('manual cross-unit placement requires literal school confirmation and preserves the original credit units', () => {
  const program = assignmentProgram();
  const original = earned({ creditSystem: 'quarter', credits: 4 });
  const initial = state([original]);
  for (const options of [{}, { confirmation: false }, { confirmation: 'true' }]) {
    assert.throws(() => Sheet.assignLearning(initial, program, original.id, 'writing', options), /units|confirmation/i);
  }
  const first = Sheet.assignLearning(initial, program, original.id, 'writing', { confirmation: true });
  const second = Sheet.assignLearning(first, program, original.id, 'humanities', { confirmation: true });
  assert.equal(second.learning[0].credits, 4);
  assert.equal(second.learning[0].creditSystem, 'quarter');
  assert.ok(second.learning[0].evaluations.filter(item => item.programId === program.id).every(item => item.status === 'confirmed'));
  assert.ok(Guide.matchInventory(program, second.learning).completed.every(item => item.creditSystem === 'semester'));
  assert.deepEqual(initial.learning[0], original);
});
