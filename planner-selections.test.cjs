const assert = require('node:assert/strict');
const fs = require('node:fs');
const Planner = require('./dist/planner.js');
const clone = value => JSON.parse(JSON.stringify(value));
const defaults = {
  providers: ['Sophia', 'CLEP'], priority: 'transfer', universityRate: 300,
  fees: 0, feesConfirmed: true, taxesConfirmed: true, examFeesConfirmed: true,
  timing: { externalWeeks: { Sophia: 5, CLEP: 1 }, universityCreditsPerTerm: 3, universityTermWeeks: 8 }
};
function requirement(id, overrides = {}) {
  const option = (prefix, provider) => ({ id: prefix + '-' + id, provider, title: provider + ' ' + id, code: prefix.toUpperCase() + '-' + id, credits: 3, upper: true, evidence: 'published', sourceIds: [provider === 'University' ? 'catalog' : 'mapping'] });
  return Object.assign({ id, code: id.toUpperCase(), title: id, category: 'major', credits: 3, upper: true, options: [option('u', 'University'), option('s', 'Sophia'), option('c', 'CLEP')] }, overrides);
}
function program(requirements, overrides = {}) {
  return Object.assign({ id: 'selection-test', totalCredits: requirements.length * 3, institutionMinCredits: 3, majorMinInstitutionCredits: 3, upperMinCredits: 3, format: 'Online', sources: [{ id: 'catalog' }, { id: 'mapping' }], requirements, unresolved: [] }, overrides);
}
const capstone = () => requirement('capstone', { institutionalOnly: true });
const rowFor = (plan, id) => plan.rows.find(row => row.requirementId === id);
const hasError = (plan, code) => plan.blockers.some(error => error.code === code);
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }

test('swapping a course provider changes its purchase, evidence, cost and timing', () => {
  const p = program([requirement('writing'), capstone()]);
  const clep = Planner.generate(p, { ...defaults, optionSelections: { writing: 'c-writing' } });
  const sophia = Planner.generate(p, { ...defaults, optionSelections: { writing: 's-writing' } });
  assert(clep.validation.valid); assert(sophia.validation.valid);
  assert.equal(clep.costs.total, 997); assert.equal(sophia.costs.total, 999);
  assert.equal(clep.timing.scenarioWeeks, 9); assert.equal(sophia.timing.scenarioWeeks, 13);
  assert(clep.nextActions.some(action => action.startsWith('Start: CLEP')));
  assert(sophia.nextActions.some(action => action.startsWith('Start: Sophia')));
  assert(!sophia.nextActions.some(action => action.startsWith('Start: CLEP')));
  assert.equal(sophia.sequence[0].provider, 'Sophia');
  assert.deepEqual(rowFor(sophia, 'writing').sourceIds, ['mapping']);
  assert.equal(sophia.coverage.mappedExternalCredits, 3);
});

test('a deliberately slower or dearer selection survives every route objective', () => {
  const p = program([requirement('writing'), capstone()]);
  for (const priority of ['transfer', 'cost', 'speed', 'balanced', 'campus']) {
    const plan = Planner.generate(p, { ...defaults, universityRate: 1, priority, optionSelections: { writing: 's-writing' } });
    assert.equal(rowFor(plan, 'writing').option.id, 's-writing', priority);
    assert.equal(plan.costs.providerCosts[0].provider, 'Sophia', priority);
  }
});

test('forcing University retains that course while other eligible courses optimize', () => {
  const p = program([requirement('writing'), requirement('math'), capstone()]);
  const plan = Planner.generate(p, { ...defaults, optionSelections: { writing: 'u-writing' } });
  assert.equal(rowFor(plan, 'writing').option.provider, 'University');
  assert.equal(rowFor(plan, 'math').option.provider, 'CLEP');
  assert.equal(plan.totals.institutional, 6);
  assert(plan.validation.valid);
});

test('a selected provider membership is shared with automatic course choices', () => {
  const p = program([requirement('writing'), requirement('math'), capstone()]);
  const plan = Planner.generate(p, { ...defaults, priority: 'cost', universityRate: 20, optionSelections: { writing: 's-writing' } });
  assert.equal(rowFor(plan, 'math').option.provider, 'Sophia');
  assert.equal(plan.costs.total, 159);
  assert.deepEqual(plan.costs.providerCosts.map(cost => [cost.provider, cost.amount]), [['Sophia', 99]]);
});

test('duplicate forced courses remain visible and invalidate the scenario', () => {
  const reqs = [requirement('writing'), requirement('math'), capstone()];
  reqs[1].options.find(option => option.provider === 'Sophia').code = 'S-writing';
  const plan = Planner.generate(program(reqs), { ...defaults, optionSelections: { writing: 's-writing', math: 's-math' } });
  assert.equal(rowFor(plan, 'writing').option.id, 's-writing');
  assert.equal(rowFor(plan, 'math').option.id, 's-math');
  assert(hasError(plan, 'duplicate_source')); assert(hasError(plan, 'selection_conflict'));
  assert.equal(plan.validation.academicCountsValid, false); assert.equal(plan.readiness, 'draft');
});

test('forced courses cannot override transfer caps or university residency', () => {
  const p = program([requirement('writing'), requirement('math'), capstone()], { externalMaxCredits: 3, alternativeMaxCredits: 3, institutionMinCredits: 6, majorMinInstitutionCredits: 6 });
  const plan = Planner.generate(p, { ...defaults, optionSelections: { writing: 's-writing', math: 'c-math' } });
  assert.equal(plan.totals.external, 6);
  for (const code of ['external_cap', 'alternative_cap', 'institution_residency', 'major_residency', 'selection_conflict']) assert(hasError(plan, code), code);
  assert.equal(rowFor(plan, 'writing').option.id, 's-writing');
  assert.equal(rowFor(plan, 'math').option.id, 'c-math');
});

test('forced lower-level awards still enforce overall and subgroup upper minima', () => {
  const reqs = [requirement('writing', { subgroup: 'concentration' }), capstone()];
  reqs[0].options.find(option => option.provider === 'Sophia').upper = false;
  const p = program(reqs, { upperMinCredits: 6, upperGroupMinimums: [{ group: 'concentration', credits: 3 }] });
  const plan = Planner.generate(p, { ...defaults, optionSelections: { writing: 's-writing' } });
  assert.equal(rowFor(plan, 'writing').option.provider, 'Sophia');
  assert(hasError(plan, 'upper_minimum')); assert(hasError(plan, 'group_upper'));
});

test('a valid scenario is preferred to a cheaper invalid starting ledger', () => {
  const reqs = [requirement('writing'), requirement('math'), capstone()];
  reqs[0].options.find(option => option.provider === 'CLEP').upper = false;
  reqs[1].options.find(option => option.provider === 'University').upper = false;
  const p = program(reqs, { upperMinCredits: 6 });
  const plan = Planner.generate(p, { ...defaults, priority: 'cost', universityRate: 1, optionSelections: { writing: 'c-writing' } });
  assert.equal(rowFor(plan, 'writing').option.id, 'c-writing');
  assert.equal(rowFor(plan, 'math').option.provider, 'CLEP');
  assert.equal(plan.validation.academicCountsValid, true);
});

test('unknown, disabled, unsourced and mismatched selections are setup errors', () => {
  const base = program([requirement('writing'), capstone()]);
  const cases = [
    [base, { optionSelections: { unknown: 's-writing' } }],
    [base, { optionSelections: { writing: 'missing' } }],
    [base, { optionSelections: { writing: null } }],
    [base, { optionSelections: { writing: 's-writing' }, providers: ['CLEP'] }],
    [base, { optionSelections: ['s-writing'] }]
  ];
  for (const change of [{ sourceIds: ['missing'] }, { credits: 6 }, { creditSystem: 'quarter' }, { evidence: 'student-record' }]) {
    const p = clone(base); Object.assign(p.requirements[0].options[1], change);
    cases.push([p, { optionSelections: { writing: 's-writing' } }]);
  }
  for (const [p, input] of cases) {
    const plan = Planner.generate(p, { ...defaults, ...input });
    assert(hasError(plan, 'invalid_selection'));
    assert.equal(plan.validation.valid, false); assert.equal(plan.readiness, 'draft');
  }
  const institutional = clone(base); institutional.requirements[0].institutionalOnly = true;
  assert(hasError(Planner.generate(institutional, { ...defaults, optionSelections: { writing: 's-writing' } }), 'invalid_selection'));
});

test('conditional selections require enablement and remain pending policy confirmation', () => {
  const p = program([requirement('writing'), capstone()]); p.requirements[0].options[1].evidence = 'conditional';
  const input = { ...defaults, optionSelections: { writing: 's-writing' } };
  const disabled = Planner.generate(p, input);
  assert(hasError(disabled, 'invalid_selection'));
  const enabled = Planner.generate(p, { ...input, allowConditional: true });
  assert.equal(rowFor(enabled, 'writing').option.id, 's-writing');
  assert(!hasError(enabled, 'invalid_selection')); assert(hasError(enabled, 'conditional_mapping'));
});

test('course menus expose the same enabled and evidenced options as generation', () => {
  const p = program([requirement('writing'), capstone()]);
  p.requirements[0].options[1].evidence = 'conditional';
  assert.deepEqual(Planner.availableOptions(p, 'writing', { providers: ['Sophia'] }).map(option => option.id), ['u-writing']);
  const enabled = Planner.availableOptions(p, 'writing', { providers: ['Sophia'], allowConditional: true });
  assert.deepEqual(enabled.map(option => option.id), ['u-writing', 's-writing']);
  for (const option of enabled) assert(!hasError(Planner.generate(p, { ...defaults, providers: ['Sophia'], allowConditional: true, optionSelections: { writing: option.id } }), 'invalid_selection'));
  assert.deepEqual(Planner.availableOptions(p, 'capstone').map(option => option.provider), ['University']);
  assert.deepEqual(Planner.availableOptions(p, 'unknown'), []);
  enabled[0].title = 'Changed only in the menu';
  assert.equal(p.requirements[0].options[0].title, 'University writing');
  p.requirements[0].options[2].sourceIds = ['unknown'];
  assert.deepEqual(Planner.availableOptions(p, 'writing', { allowConditional: true }).map(option => option.id), ['u-writing', 's-writing']);
});

test('earned learning wins over replacements in its requirement without repurchase', () => {
  const p = program([requirement('writing'), capstone()]);
  for (const status of ['confirmed', 'reported']) {
    const plan = Planner.generate(p, { ...defaults, completed: [{ requirementId: 'writing', optionId: 'c-writing', status }], optionSelections: { writing: 's-writing' } });
    assert.equal(rowFor(plan, 'writing').status, status);
    assert.equal(rowFor(plan, 'writing').option.id, 'c-writing');
    assert.equal(plan.costs.providerCosts.length, 0); assert.equal(plan.timing.externalActions, 0);
    assert(!plan.nextActions.some(action => /^(?:Start:|After approval:)/.test(action)));
    assert(plan.warnings.some(warning => warning.includes('takes precedence')));
  }
});

test('selecting already earned learning elsewhere never buys it again or double awards it', () => {
  const reqs = [requirement('writing'), requirement('math'), capstone()];
  reqs[1].options[1].code = reqs[0].options[1].code;
  const plan = Planner.generate(program(reqs), { ...defaults, completed: [{ requirementId: 'writing', optionId: 's-writing', status: 'confirmed' }], optionSelections: { math: 's-math' } });
  assert.equal(rowFor(plan, 'math').status, 'reported');
  assert(hasError(plan, 'duplicate_source')); assert(hasError(plan, 'reported_credit'));
  assert.equal(plan.costs.providerCosts.length, 0); assert.equal(plan.timing.externalActions, 0);
  assert(!plan.nextActions.some(action => /^(?:Start:|After approval:)/.test(action)));
});

test('selecting an earned bundle continuation requests evaluation without a new exam', () => {
  const reqs = [requirement('writing'), requirement('math'), capstone()];
  for (const req of reqs.slice(0, 2)) Object.assign(req.options[2], { code: 'CLEP-bundle', bundleId: 'composition', bundleCredits: 6 });
  const plan = Planner.generate(program(reqs), { ...defaults, completed: [{ requirementId: 'writing', optionId: 'c-writing', status: 'confirmed' }], optionSelections: { math: 'c-math' } });
  assert.equal(rowFor(plan, 'math').status, 'reported');
  assert.equal(plan.totals.reported, 3); assert(!hasError(plan, 'duplicate_source'));
  assert.equal(plan.costs.providerCosts.length, 0); assert.equal(plan.timing.externalActions, 0);
  assert(plan.nextActions[0].includes('evaluation'));
});

test('a six-credit school-evaluated college record can award two distinct three-credit components', () => {
  const p = program([requirement('writing'), requirement('math'), capstone()]);
  const Guide = require('./dist/guide-engine.js');
  const record = { id: 'college-record', status: 'earned', provider: 'Other college', code: 'COLLEGE-101', title: 'Six-credit college award', creditSystem: 'semester', credits: 6, evaluations: ['writing', 'math'].map(requirementId => ({ programId: p.id, requirementId, status: 'confirmed' })) };
  const completed = Guide.matchInventory(p, [record]).completed;
  assert.equal(completed.length, 2);
  assert.equal(Guide.matchInventory(p, [{ ...record, credits: 3 }]).completed.length, 1);
  assert.equal(Guide.matchInventory({ ...p, id: 'another-program' }, [record]).completed.length, 0);
  const plan = Planner.generate(p, { ...defaults, completed });
  assert.equal(plan.totals.confirmed, 6); assert.equal(plan.totals.accounted, 9);
  assert.equal(plan.coverage.mappedExternalCredits, 6);
  assert(plan.validation.valid);
  assert.equal(plan.costs.providerCosts.length, 0); assert.equal(plan.timing.externalActions, 0);
  assert.equal(plan.sequence.length, 1); assert.equal(plan.sequence[0].provider, 'University');
  assert(!plan.nextActions.some(action => /^(?:Start:|After approval:)/.test(action)));
});

test('prior bundle metadata cannot inflate awards or cross records, sources, or programs', () => {
  const p = program([requirement('writing'), requirement('math'), capstone()]);
  const record = { status: 'confirmed', sourceProvider: 'Other college', code: 'COLLEGE-101', creditSystem: 'semester', learningId: 'college-record', bundleId: 'evaluated:' + p.id + ':college-record', bundleCredits: 6 };
  const cases = [
    [{ bundleCredits: 3 }, { bundleCredits: 3 }],
    [{ bundleCredits: 9 }, { bundleCredits: 9 }],
    [{ bundleCredits: 6 }, { bundleCredits: 9 }],
    [{ bundleCredits: 0 }, { bundleCredits: 0 }],
    [{ bundleCredits: -6 }, { bundleCredits: -6 }],
    [{ bundleId: 'evaluated:another-program:college-record' }, {}],
    [{}, { learningId: 'another-record' }],
    [{}, { sourceProvider: 'Another college' }],
    [{}, { code: 'COLLEGE-102' }]
  ];
  for (const changes of cases) {
    const completed = ['writing', 'math'].map((requirementId, index) => ({ ...record, requirementId, ...changes[index] }));
    const plan = Planner.generate(p, { ...defaults, completed });
    assert(hasError(plan, 'invalid_prior_bundle'), JSON.stringify(changes));
    assert.equal(plan.validation.valid, false);
    assert(plan.rows.slice(0, 2).every(row => !row.option.bundleId));
    assert.equal(plan.costs.providerCosts.length, 0);
  }
});

test('separate evaluated bundle IDs cannot spend the same original college course twice', () => {
  const ids = ['writing', 'math', 'science', 'history'];
  const p = program([...ids.map(id => requirement(id)), capstone()]);
  const completed = ids.map((requirementId, index) => {
    const learningId = index < 2 ? 'record-one' : 'record-two';
    return { requirementId, status: 'confirmed', sourceProvider: 'Other college', code: 'COLLEGE-101', creditSystem: 'semester', learningId, bundleId: 'evaluated:' + p.id + ':' + learningId, bundleCredits: 6 };
  });
  const plan = Planner.generate(p, { ...defaults, completed });
  assert(hasError(plan, 'invalid_prior_bundle')); assert(hasError(plan, 'duplicate_source'));
  assert.equal(plan.validation.valid, false); assert.equal(plan.costs.providerCosts.length, 0);
});

test('evaluated prior bundle identities still prevent repurchase through a mapped course option', () => {
  const p = program([requirement('writing'), requirement('math'), requirement('other'), capstone()]);
  p.requirements[2].options[1].code = 'S-writing';
  const record = { status: 'confirmed', sourceProvider: 'Sophia', code: 'S-writing', creditSystem: 'semester', learningId: 'evaluated-record', bundleId: 'evaluated:' + p.id + ':evaluated-record', bundleCredits: 6 };
  const completed = ['writing', 'math'].map(requirementId => ({ ...record, requirementId }));
  const automatic = Planner.generate(p, { ...defaults, completed });
  assert(automatic.validation.valid);
  assert.equal(rowFor(automatic, 'other').option.provider, 'CLEP');
  assert(!automatic.costs.providerCosts.some(cost => cost.provider === 'Sophia'));
  const forced = Planner.generate(p, { ...defaults, completed, optionSelections: { other: 's-other' } });
  assert.equal(rowFor(forced, 'other').status, 'reported');
  assert(hasError(forced, 'duplicate_source'));
  assert.equal(forced.costs.providerCosts.length, 0); assert.equal(forced.timing.externalActions, 0);
  assert(!forced.nextActions.some(action => /^(?:Start:|After approval:)/.test(action)));
});

test('empty selections preserve the existing dataset plans and input objects', () => {
  for (const file of ['liberty', 'tesu']) {
    const p = JSON.parse(fs.readFileSync(__dirname + '/dist/data/' + file + '.json', 'utf8'));
    const before = clone(p), input = { ...defaults, providers: ['Sophia', 'Study.com', 'CLEP'] }, inputBefore = clone(input);
    const baseline = Planner.generate(p, input);
    assert.deepEqual(Planner.generate(p, { ...input, optionSelections: {} }), baseline, file);
    assert.deepEqual(Planner.generate(p, { ...input, optionSelections: undefined }), baseline, file);
    assert.deepEqual(p, before); assert.deepEqual(input, inputBefore);
  }
});

test('a provider with unknown pricing never wins by being treated as free', () => {
  const r=requirement('writing');r.options.push({...r.options.find(o=>o.provider==='Sophia'),id:'sl-writing',provider:'StraighterLine',code:'SL-101'});
  const p=program([r,capstone()]);
  for(const priority of ['cost','balanced','transfer']) {
    const result=Planner.generate(p,{...defaults,priority,providers:['Sophia','StraighterLine']});
    assert.equal(rowFor(result,'writing').option.provider,'Sophia');
  }
  const manual=Planner.generate(p,{...defaults,providers:['Sophia','StraighterLine'],optionSelections:{writing:'sl-writing'}});
  assert.equal(rowFor(manual,'writing').option.provider,'StraighterLine');
  assert.equal(manual.costs.total,null);assert(manual.costs.missing.includes('StraighterLine pricing'));
});

console.log(checks + ' scenario selection tests passed.');
