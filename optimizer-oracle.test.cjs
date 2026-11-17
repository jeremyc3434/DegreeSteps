const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('./dist/planner.js');

const priorities = ['transfer', 'cost', 'speed', 'balanced', 'campus'];
const defaults = {
  providers: ['Sophia', 'Study.com', 'CLEP'], universityRate: 120,
  fees: 0, feesConfirmed: true, taxesConfirmed: true, examFeesConfirmed: true,
  providerMonths: { Sophia: 1, 'Study.com': 1 },
  timing: { externalWeeks: { Sophia: 4, 'Study.com': 3, CLEP: 1 }, externalConcurrency: 2, universityCreditsPerTerm: 6, universityTermWeeks: 8 }
};
const rowFor = (plan, id) => plan.rows.find(row => row.requirementId === id);
function option(id, provider, code, overrides = {}) {
  return { id, provider, code, title: code, credits: 3, upper: true, evidence: 'published', sourceIds: ['fixture'], ...overrides };
}
function requirement(id, outside = [], overrides = {}) {
  return { id, code: id.toUpperCase(), title: id, category: 'major', credits: 3,
    options: [option('u-' + id, 'University', 'U-' + id), ...outside], ...overrides };
}
function program(requirements, overrides = {}) {
  return { id: 'optimizer-oracle', title: 'Synthetic solver fixture', format: 'Online', creditSystem: 'semester',
    totalCredits: requirements.reduce((sum, req) => sum + req.credits, 0),
    institutionMinCredits: 0, majorMinInstitutionCredits: 0, upperMinCredits: 0,
    sources: [{ id: 'fixture' }], requirements, unresolved: [], ...overrides };
}
function compare(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (Math.abs(difference) > 0.000001) return difference < 0 ? -1 : 1;
  }
  return 0;
}

// The oracle knows the route objectives, but no search or pruning rules. It uses
// public ledger, price and timing results for every fully pinned assignment.
function objective(plan, input, priority) {
  const futureProviders = new Set(plan.rows.filter(row => row.status === 'planned' && row.option && row.option.provider !== 'University').map(row => row.option.provider));
  const unknownPrices = [...futureProviders].filter(provider => !['Sophia', 'Study.com', 'CLEP'].includes(provider)).length;
  const price = plan.costs.modeledSubtotal;
  if (priority === 'transfer') return [-plan.totals.external, unknownPrices, price, futureProviders.size];
  if (priority === 'campus') return [plan.totals.external * 100000 + price];
  if (priority === 'speed') {
    const timing = plan.timing;
    return input.timing
      ? [timing.scenarioWeeks === null ? Number.MAX_SAFE_INTEGER : timing.scenarioWeeks, timing.universityTerms || 0, timing.universityCredits, timing.externalActions, unknownPrices, price]
      : [timing.universityCredits, timing.universityCriticalTerms, timing.externalActions, unknownPrices, price];
  }
  const unquotedUniversity = Number(input.universityRate) > 0 ? 0 : plan.totals.institutional * 10000;
  return [unquotedUniversity, unknownPrices, price + (priority === 'balanced' ? futureProviders.size * 250 : 0)];
}
function describe(plan) {
  return plan.rows.map(row => [row.requirementId, row.option?.id, row.status]);
}
function exhaustive(program, input) {
  const completed = new Set((input.completed || []).filter(record => ['confirmed', 'reported'].includes(record.status)).map(record => record.requirementId));
  const choices = { ...(input.optionSelections || {}) }, menus = [];
  for (const req of program.requirements) {
    if (completed.has(req.id) || Object.hasOwn(choices, req.id)) continue;
    const options = Planner.availableOptions(program, req.id, input);
    // All feasible fixtures have an option per row; absent options cannot be
    // repaired by assigning a course from a different requirement.
    if (!options.length) return { assignments: 0, feasible: 0, best: {} };
    menus.push([req.id, options]);
  }
  const result = { assignments: 0, feasible: 0, best: {} };
  function visit(index) {
    if (index < menus.length) {
      const [id, options] = menus[index];
      for (const choice of options) { choices[id] = choice.id; visit(index + 1); }
      delete choices[id];
      return;
    }
    result.assignments++;
    const pinned = Planner.generate(program, { ...input, priority: 'transfer', optionSelections: { ...choices }, optimizationNodeBudget: 0 });
    for (const [id, optionId] of Object.entries(choices)) {
      if (!completed.has(id)) assert.equal(rowFor(pinned, id).option?.id, optionId, 'oracle assignments must remain fully pinned');
    }
    if (!Planner.validate(program, pinned).academicCountsValid) return;
    result.feasible++;
    for (const priority of priorities) {
      const score = objective(pinned, input, priority), previous = result.best[priority];
      if (!previous || compare(score, previous.score) < 0) result.best[priority] = { score, plan: pinned };
    }
  }
  visit(0);
  return result;
}
function assertOptimalMetadata(plan, input, feasible = true) {
  const info = plan.optimization;
  assert(info, 'generated plans must describe their optimization guarantee');
  assert.equal(info.method, 'bounded-assignment-search');
  assert.equal(info.status, feasible ? 'optimal-for-model' : 'infeasible-for-model');
  assert.equal(info.optimalityProven, feasible);
  if (!feasible) assert.equal(info.infeasibilityProven, true);
  assert.equal(info.nodeBudget, input.optimizationNodeBudget ?? 12000);
  assert(Number.isInteger(info.statesVisited) && info.statesVisited >= 0 && info.statesVisited <= info.nodeBudget);
  assert.equal(info.budgetExhausted, false);
  if (feasible) assert(info.objectiveScore !== undefined && info.objectiveScore !== null);
}
function checkAgainstOracle(model, input = {}, label = model.id) {
  const settings = { ...defaults, ...input, optimizationNodeBudget: 100000 };
  const expected = exhaustive(model, settings);
  assert(expected.feasible > 0, label + ' must have at least one independently enumerated valid assignment');
  for (const priority of priorities) {
    const plan = Planner.generate(model, { ...settings, priority });
    assert.equal(Planner.validate(model, plan).academicCountsValid, true, label + '/' + priority + ' must satisfy academic rules');
    const actualScore = objective(plan, settings, priority), optimum = expected.best[priority];
    assert.equal(compare(actualScore, optimum.score), 0,
      label + '/' + priority + ': got ' + JSON.stringify({ score: actualScore, choices: describe(plan) }) + ', oracle ' + JSON.stringify({ score: optimum.score, choices: describe(optimum.plan) }));
    assertOptimalMetadata(plan, settings);
    const advertised = Array.isArray(plan.optimization.objectiveScore) ? plan.optimization.objectiveScore : [plan.optimization.objectiveScore];
    assert.equal(compare(advertised, actualScore), 0, label + '/' + priority + ' must report the score of its returned ledger');
  }
  return expected;
}

function flexibleSourceModel() {
  return program([
    requirement('r1', [option('a1', 'Sophia', 'A'), option('b1', 'Sophia', 'B')]),
    requirement('r2', [option('a2', 'Sophia', 'A')])
  ], { alternativeMaxCredits: 6, externalMaxCredits: 6 });
}

test('flexible row yields scarce source A to the row without an alternative', () => {
  const model = flexibleSourceModel();
  checkAgainstOracle(model);
  const plan = Planner.generate(model, { ...defaults, priority: 'transfer' });
  assert.equal(plan.totals.external, 6);
  assert.deepEqual(plan.rows.map(row => row.option.code), ['B', 'A']);
});

test('complete assignments can jointly repair an invalid institutional starting ledger', () => {
  const rows = ['a', 'b', 'c'].map(id => requirement(id, [option('s-' + id, 'Sophia', 'S-' + id)]));
  rows[0].options[0].upper = false;
  rows[1].options[0].upper = false;
  rows[2].institutionalOnly = true;
  const model = program(rows, { institutionMinCredits: 3, majorMinInstitutionCredits: 3, upperMinCredits: 9 });
  checkAgainstOracle(model);
});

test('transfer-waiver thresholds constrain every objective before claiming optimality', () => {
  const model = program(['a', 'b'].map(id => requirement(id, [option('s-' + id, 'Sophia', 'S-' + id)])), {
    appliedTransferWaiver: { minimumQualifyingTransferCredits: 3 }
  });
  checkAgainstOracle(model, { universityRate: 1 });
  for (const priority of priorities) {
    const plan = Planner.generate(model, { ...defaults, universityRate: 1, priority });
    assert.equal(plan.validation.academicCountsValid, true);
    assert(plan.totals.external >= 3);
    assert(plan.blockers.some(error => error.code === 'waiver_confirmation'));
  }
  const impossible = Planner.generate(model, { ...defaults, providers: [], priority: 'campus' });
  assert.equal(impossible.validation.academicCountsValid, false);
  assert.equal(impossible.optimization.infeasibilityProven, true);
  assert.equal(impossible.optimization.optimalityProven, false);
  assert.equal(impossible.blockers.filter(error => error.code === 'waiver_transfer_threshold').length, 1);
});

test('all admissible University awards are available to satisfy upper-level rules', () => {
  const row = requirement('a'); row.options[0].upper = false;
  row.options.push(option('u-a-upper', 'University', 'U-A-ADVANCED'));
  const model = program([row], { institutionMinCredits: 3, majorMinInstitutionCredits: 3, upperMinCredits: 3 });
  checkAgainstOracle(model);
  assert.equal(Planner.generate(model, defaults).rows[0].option.id, 'u-a-upper');
});

test('institution, major, upper and subgroup minima coexist with both source ceilings', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => requirement(id, [
    option('s-' + id, 'Sophia', 'S-' + id, { upper: index % 2 === 0 }),
    option('c-' + id, 'CLEP', 'C-' + id, { upper: index % 3 === 0 })
  ], { category: index < 3 ? 'major' : 'general', subgroup: index < 2 ? 'concentration' : null }));
  rows[5].institutionalOnly = true;
  const model = program(rows, { institutionMinCredits: 6, majorMinInstitutionCredits: 3, upperMinCredits: 12,
    upperGroupMinimums: [{ group: 'concentration', credits: 6 }], externalMaxCredits: 9, alternativeMaxCredits: 6 });
  checkAgainstOracle(model);
});

test('receiving-course aliases cannot count twice even across distinct sources', () => {
  const model = program([
    requirement('a', [option('s-a', 'Sophia', 'SOURCE-A', { receivingCode: 'ENG-101' }), option('s-b', 'Sophia', 'SOURCE-B', { receivingCode: 'ENG-102' })]),
    requirement('b', [option('c-b', 'CLEP', 'SOURCE-C', { receivingCode: 'eng 101' })])
  ]);
  checkAgainstOracle(model);
  const forced = Planner.generate(model, { ...defaults, optionSelections: { a: 's-a', b: 'c-b' } });
  assert.equal(forced.validation.academicCountsValid, false);
  assert(forced.blockers.some(error => error.code === 'duplicate_receiving_course'));
});

test('one legitimate bundle shares price and time but cannot exceed its award', () => {
  const rows = ['a', 'b', 'c'].map(id => requirement(id, [option('bundle-' + id, 'CLEP', 'COMPOSITION', { bundleId: 'composition', bundleCredits: 6 })]));
  const model = program(rows);
  checkAgainstOracle(model);
  const plan = Planner.generate(model, { ...defaults, priority: 'transfer', providers: ['CLEP'] });
  assert.equal(plan.totals.external, 6);
  assert.equal(plan.costs.providerCosts[0].exams, 1);
  assert.equal(plan.timing.externalActions, 1);
});

test('different bundle IDs cannot disguise reuse of the same original source', () => {
  const model = program(['a', 'b'].map(id => requirement(id, [option('bundle-' + id, 'CLEP', 'SAME-EXAM', { bundleId: 'bundle-' + id, bundleCredits: 6 })])));
  checkAgainstOracle(model);
  const plan = Planner.generate(model, { ...defaults, priority: 'transfer' });
  assert.equal(plan.totals.external, 3);
  const forced = Planner.generate(model, { ...defaults, optionSelections: { a: 'bundle-a', b: 'bundle-b' } });
  assert.equal(forced.validation.academicCountsValid, false);
});

test('one bundle ID cannot combine unrelated original sources', () => {
  const model = program(['a', 'b'].map(id => requirement(id, [option('bundle-' + id, 'CLEP', 'EXAM-' + id, { bundleId: 'shared-label', bundleCredits: 6 })])));
  checkAgainstOracle(model);
  assert.equal(Planner.generate(model, { ...defaults, priority: 'transfer' }).totals.external, 3);
});

test('completed and reported learning and explicit choices stay pinned across objectives', () => {
  const rows = ['a', 'b', 'c', 'd'].map(id => requirement(id, [option('s-' + id, 'Sophia', 'S-' + id), option('c-' + id, 'CLEP', 'C-' + id)]));
  const model = program(rows, { institutionMinCredits: 3 });
  const input = { completed: [{ requirementId: 'a', optionId: 's-a', status: 'confirmed' }, { requirementId: 'b', optionId: 'c-b', status: 'reported' }], optionSelections: { a: 'u-a', b: 'u-b', c: 's-c' } };
  checkAgainstOracle(model, input);
  for (const priority of priorities) {
    const plan = Planner.generate(model, { ...defaults, ...input, priority });
    assert.equal(rowFor(plan, 'a').status, 'confirmed'); assert.equal(rowFor(plan, 'a').option.id, 's-a');
    assert.equal(rowFor(plan, 'b').status, 'reported'); assert.equal(rowFor(plan, 'b').option.id, 'c-b');
    assert.equal(rowFor(plan, 'c').option.id, 's-c');
    assert.equal(plan.totals.confirmed, 3); assert.equal(plan.totals.reported, 3);
    assert(!plan.costs.providerCosts.some(cost => cost.provider === 'CLEP'));
    assert(plan.blockers.some(error => error.code === 'reported_credit'));
  }
});

test('unknown prior provenance reserves alternative-credit capacity without repurchase', () => {
  const model = program(['a', 'b', 'c'].map(id => requirement(id, [option('s-' + id, 'Sophia', 'S-' + id)])), { alternativeMaxCredits: 3 });
  const input = { completed: [{ requirementId: 'a', status: 'confirmed' }] };
  checkAgainstOracle(model, input);
  const plan = Planner.generate(model, { ...defaults, ...input, priority: 'transfer' });
  assert.equal(plan.totals.external, 3); assert.equal(plan.totals.alternative, 3);
  assert.equal(plan.costs.providerCosts.length, 0);
  assert(plan.blockers.some(error => error.code === 'unknown_provenance'));
});

test('existing bundle learning covers a remaining award provisionally without repeat purchase', () => {
  const rows = ['a', 'b'].map(id => requirement(id, [option('bundle-' + id, 'CLEP', 'COMPOSITION', { bundleId: 'composition', bundleCredits: 6 })]));
  rows.push(requirement('capstone', [], { institutionalOnly: true }));
  const model = program(rows, { institutionMinCredits: 3 });
  const input = { ...defaults, priority: 'transfer', completed: [{ requirementId: 'a', optionId: 'bundle-a', status: 'confirmed' }] };
  checkAgainstOracle(model, input);
  const plan = Planner.generate(model, input);
  assert.equal(rowFor(plan, 'b').status, 'reported');
  assert.equal(plan.totals.confirmed, 3); assert.equal(plan.totals.reported, 3);
  assert.equal(plan.costs.providerCosts.length, 0); assert.equal(plan.timing.externalActions, 0);
});

test('receiving units retain reviewed conversion while unnormalized quarter options are excluded', () => {
  const normalized = option('normalized-a', 'Sophia', 'QUARTER-A', { creditSystem: 'semester', sourceCreditSystem: 'quarter', sourceCredits: 4.5 });
  const unnormalized = option('quarter-a', 'CLEP', 'QUARTER-B', { creditSystem: 'quarter', sourceCredits: 3 });
  const model = program([requirement('a', [unnormalized, normalized]), requirement('b', [], { institutionalOnly: true })], { institutionMinCredits: 3 });
  assert.deepEqual(Planner.availableOptions(model, 'a', defaults).map(item => item.id), ['u-a', 'normalized-a']);
  checkAgainstOracle(model);
  const plan = Planner.generate(model, { ...defaults, priority: 'transfer' });
  assert.equal(rowFor(plan, 'a').option.sourceCredits, 4.5);
  assert.equal(plan.totals.accounted, 6); assert.equal(plan.totals.external, 3);
});

test('conditional evidence remains a review blocker even when the assignment is optimal', () => {
  const model = program([requirement('a', [option('s-a', 'Sophia', 'A', { evidence: 'conditional' })]), requirement('b')]);
  checkAgainstOracle(model, { allowConditional: true });
  const plan = Planner.generate(model, { ...defaults, allowConditional: true, priority: 'transfer' });
  assertOptimalMetadata(plan, defaults);
  assert.equal(plan.readiness, 'draft');
  assert(plan.blockers.some(error => error.code === 'conditional_mapping'));
  assert.equal(Planner.generate(model, { ...defaults, priority: 'transfer' }).totals.external, 0);
});

test('unpriced sources retain missing prices and do not win a price comparison as free', () => {
  const model = program([
    requirement('a', [option('unknown-a', 'StraighterLine', 'SL-A'), option('s-a', 'Sophia', 'S-A')]),
    requirement('capstone', [], { institutionalOnly: true })
  ], { institutionMinCredits: 3 });
  const input = { providers: ['StraighterLine', 'Sophia'], timing: { ...defaults.timing, externalWeeks: { ...defaults.timing.externalWeeks, StraighterLine: 1 } } };
  checkAgainstOracle(model, input);
  for (const priority of ['transfer', 'cost', 'balanced']) {
    assert.equal(rowFor(Planner.generate(model, { ...defaults, ...input, priority }), 'a').option.provider, 'Sophia');
  }
  const selected = Planner.generate(model, { ...defaults, ...input, optionSelections: { a: 'unknown-a' } });
  assert.equal(selected.costs.total, null); assert(selected.costs.missing.includes('StraighterLine pricing'));
});

test('speed uses the public workload measures when duration inputs are absent', () => {
  const model = program([
    requirement('a', [option('s-a', 'Sophia', 'A'), option('c-a', 'CLEP', 'EXAM-A')]),
    requirement('b', [option('s-b', 'Sophia', 'B')], { prerequisites: ['a'] }),
    requirement('c', [], { institutionalOnly: true, prerequisites: ['b'] })
  ], { institutionMinCredits: 3 });
  checkAgainstOracle(model, { timing: undefined, universityRate: 1 });
  checkAgainstOracle(model, { timing: undefined, universityRate: 0 });
});

test('zero search budget reports best-found without claiming exhaustive optimality', () => {
  const plan = Planner.generate(flexibleSourceModel(), { ...defaults, priority: 'transfer', optimizationNodeBudget: 0 });
  assert(plan.optimization);
  assert.equal(plan.optimization.method, 'bounded-assignment-search');
  assert.equal(plan.optimization.nodeBudget, 0);
  assert.equal(plan.optimization.statesVisited, 0);
  assert.equal(plan.optimization.status, 'best-found');
  assert.equal(plan.optimization.optimalityProven, false);
  assert.equal(plan.optimization.budgetExhausted, true);
  assert.equal(plan.validation.academicCountsValid, true);
});

test('bounded work never exceeds a positive search budget or invents a proof', () => {
  const rows = ['a', 'b', 'c', 'd'].map(id => requirement(id, [option('s-' + id, 'Sophia', 'S-' + id), option('c-' + id, 'CLEP', 'C-' + id)]));
  const plan = Planner.generate(program(rows), { ...defaults, priority: 'transfer', optimizationNodeBudget: 1 });
  assert.equal(plan.optimization.nodeBudget, 1);
  assert(Number.isInteger(plan.optimization.statesVisited) && plan.optimization.statesVisited <= 1);
  assert.equal(plan.optimization.status, 'best-found');
  assert.equal(plan.optimization.optimalityProven, false);
  assert.equal(plan.optimization.budgetExhausted, true);
});

test('infeasible proof preserves incompatible explicit choices and their blockers', () => {
  const model = flexibleSourceModel(), input = { ...defaults, optionSelections: { r1: 'a1', r2: 'a2' }, optimizationNodeBudget: 100000 };
  const oracle = exhaustive(model, input); assert.equal(oracle.feasible, 0);
  const plan = Planner.generate(model, input);
  assertOptimalMetadata(plan, input, false);
  assert.deepEqual(plan.rows.map(row => row.option.id), ['a1', 'a2']);
  assert.equal(plan.validation.academicCountsValid, false);
  assert(plan.blockers.some(error => error.code === 'duplicate_source'));
  assert(plan.blockers.some(error => error.code === 'selection_conflict'));
});

test('infeasible upper-level model receives an exhaustive failure status', () => {
  const row = requirement('a', [option('s-a', 'Sophia', 'A', { upper: false })]); row.options[0].upper = false;
  const model = program([row], { upperMinCredits: 3 }), input = { ...defaults, optimizationNodeBudget: 100000 };
  assert.equal(exhaustive(model, input).feasible, 0);
  const plan = Planner.generate(model, input);
  assertOptimalMetadata(plan, input, false);
  assert(plan.blockers.some(error => error.code === 'upper_minimum'));
});

test('missing supported options remain unresolved in an infeasible modeled ledger', () => {
  const model = program([requirement('gap', [], { options: [] }), requirement('b')]);
  const input = { ...defaults, optimizationNodeBudget: 100000 };
  assert.equal(exhaustive(model, input).feasible, 0);
  const plan = Planner.generate(model, input);
  assertOptimalMetadata(plan, input, false);
  assert.equal(rowFor(plan, 'gap').status, 'unresolved'); assert.equal(rowFor(plan, 'gap').option, null);
  assert(plan.blockers.some(error => error.code === 'unfilled_requirement'));
});

test('small deterministic randomized fixtures match exhaustive assignment optima for every route', () => {
  let seed = 0x51a7e;
  const random = maximum => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % maximum; };
  let assignments = 0;
  for (let fixture = 0; fixture < 12; fixture++) {
    const length = 3 + fixture % 4, rows = [];
    for (let index = 0; index < length; index++) {
      const id = 'f' + fixture + 'r' + index, outside = [];
      for (const provider of ['Sophia', 'CLEP', 'Study.com']) {
        if (random(4) === 0) continue;
        const code = provider + '-source-' + random(Math.max(2, length - 1));
        outside.push(option(provider + '-' + id, provider, code, { upper: random(3) !== 0,
          ...(random(4) === 0 ? { receivingCode: 'AWARD-' + random(length) } : {}) }));
      }
      rows.push(requirement(id, outside, { category: index < 2 ? 'major' : 'general',
        subgroup: index < 2 ? 'concentration' : null, institutionalOnly: index === length - 1 && fixture % 3 === 0,
        ...(index > 0 && random(3) === 0 ? { prerequisites: [rows[index - 1].id] } : {}) }));
    }
    const model = program(rows, { id: 'random-' + fixture, institutionMinCredits: 3 * random(Math.min(length, 3)),
      majorMinInstitutionCredits: 3 * random(2), upperMinCredits: 3 * random(length + 1),
      externalMaxCredits: 3 * (1 + random(length)), alternativeMaxCredits: 3 * (1 + random(length)),
      upperGroupMinimums: [{ group: 'concentration', credits: 3 * random(3) }] });
    const input = { universityRate: [1, 20, 120, 450][fixture % 4], providerMonths: { Sophia: 1 + fixture % 3, 'Study.com': 1 + fixture % 2 },
      timing: { ...defaults.timing, externalConcurrency: 1 + fixture % 2, universityCreditsPerTerm: 3 * (1 + fixture % 3) } };
    const before = JSON.stringify({ model, input });
    assignments += checkAgainstOracle(model, input, model.id).assignments;
    assert.equal(JSON.stringify({ model, input }), before, 'optimization and oracle enumeration must preserve their inputs');
  }
  assert(assignments >= 1000, 'randomized coverage must enumerate a meaningful number of assignments');
});
