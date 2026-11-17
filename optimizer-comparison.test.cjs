const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Planner = require('./dist/planner.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');

const clone = value => JSON.parse(JSON.stringify(value));
function option(id, provider, code, upper) {
  return { id, provider, code, title: code, credits: 3, sourceCredits:3, sourceCreditSystem:'semester', upper,
    evidence: 'published', sourceIds: ['catalog'] };
}
function comparisonFixture() {
  // Every remaining requirement needs an upper-level outside award. Repeated
  // source codes create competing placements, so the first feasible complete
  // assignment takes more than the matrix cell's 512-state probe budget.
  const sources = [
    [5, 9, 14], [6, 14, 3], [2, 10, 8], [11, 1, 13],
    [12, 14, 9], [12, 1, 13], [13, 10, 14], [2, 11, 3],
    [4, 10, 3], [7, 4, 11], [7, 14, 1], [8, 10, 15],
    [6, 0, 1], [2, 8, 13], [7, 14, 1], [6, 14, 8]
  ];
  const requirements = [{
    id: 'prior', code: 'PRIOR', title: 'Completed university requirement',
    credits: 3, category: 'major',
    options: [option('u-prior', 'University', 'U-PRIOR', true)]
  }, ...sources.map((codes, index) => ({
    id: 'r' + index, code: 'R' + index, title: 'Major requirement ' + index,
    credits: 3, category: 'major',
    options: [option('u-' + index, 'University', 'U-' + index, false),
      ...codes.map((code, choice) => option('s-' + index + '-' + choice, 'Sophia', 'S' + code, true))]
  }))];
  const program = {
    id: 'comparison-search-fixture', school: 'Example University',
    title: 'Synthetic Bachelor of Science', format: 'Online', creditSystem: 'semester',
    totalCredits: 51, upperMinCredits: 51,
    institutionMinCredits: 3, majorMinInstitutionCredits: 3,
    requirements, sources: [{ id: 'catalog', url: 'https://example.edu/catalog' }], unresolved: []
  };
  const route = {
    id: 'comparison-fixture-route', modelId: program.id, school: program.school,
    title: program.title, level: 'bachelor', field: 'general', modalities: ['online'],
    goals: ['any-degree'], sources: program.sources
  };
  const catalog = { pathways: [route] };
  const state = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null, null, catalog), route), null, catalog);
  state.profile.priority = 'transfer';
  state.scenarios[program.id] = { providers: ['Sophia'], universityRate: 1 };
  state.learning = [{
    id: 'completed-university-course', provider: 'University', code: 'U-PRIOR',
    title: 'Completed university requirement', credits: 3, creditSystem: 'semester',
    status: 'earned', institution: program.school, sourceProgramId: program.id,
    evaluations: [{ programId: program.id, requirementId: 'prior', optionId: 'u-prior', status: 'confirmed' }]
  }];
  return { program, catalog, state };
}

function observedComparison() {
  // Observe only Comparison's calls. Journey and Guide remain real, and every
  // observed generate call delegates to the real solver without changing it.
  const filename = path.join(__dirname, 'dist/plan-comparison-engine.js');
  const localRequire = createRequire(filename), calls = [], module = { exports: {} };
  const observedPlanner = { ...Planner, generate(program, input) {
    const plan = Planner.generate(program, input);
    calls.push({ input: clone(input), plan });
    return plan;
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, require: request => request === './planner.js' ? observedPlanner : localRequire(request)
  }, { filename });
  return { Comparison: module.exports, calls };
}

function compareCandidate(code) {
  const fixture = comparisonFixture(), { Comparison, calls } = observedComparison();
  const before = JSON.stringify(fixture.state);
  const result = Comparison.build(fixture.state, fixture.catalog, [fixture.program], { entries: [] }, {
    selectedIds: ['current'], fromCourses: true,
    candidate: { provider: 'Sophia', code, creditSystem: 'semester' }
  });
  assert.equal(JSON.stringify(fixture.state), before, 'a potential-course probe must not change the saved learning or choices');
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].available, true, 'the real Journey draft must be academically usable before probing');
  assert.equal(result.scenarios[0].summary.confirmedCredits, 3);
  assert.equal(result.scenarios[0].summary.applicableCompletedCredits, 3, 'candidate courses must not become earned credits');
  const candidate = result.matrix.find(row => row.course.provider === 'Sophia' && row.course.code === code);
  assert(candidate, 'the candidate must reach the actual comparison matrix');
  const probeIndex = calls.findIndex(call => call.input.optimizationNodeBudget === 512);
  assert(probeIndex >= 0, 'the comparison must reach its bounded course probe');
  return { ...fixture, result, calls: calls.slice(probeIndex), cell: candidate.cells.current };
}

test('comparison retries an exhausted invalid course probe and preserves its feasible potential match', () => {
  const { program, calls, cell } = compareCandidate('S0');
  assert.equal(calls.length, 2, 'an inconclusive bounded probe must retry with the scenario search budget');
  const [probe, retry] = calls;
  assert.equal(probe.input.optimizationNodeBudget, 512);
  assert.equal(probe.plan.validation.academicCountsValid, false, 'the bounded probe must fail to find a valid assignment for this fixture');
  assert.equal(probe.plan.optimization.budgetExhausted, true);
  assert.equal(probe.plan.optimization.infeasibilityProven, false);
  assert.equal(retry.input.optimizationNodeBudget, undefined);
  const { optimizationNodeBudget, ...probeInput } = probe.input;
  assert.deepEqual(retry.input, probeInput, 'fallback must preserve completed learning and all scenario settings');
  assert.equal(retry.plan.optimization.nodeBudget, 12000);
  assert(retry.plan.optimization.statesVisited > 512, 'the real solver must search beyond the probe limit');
  assert.equal(retry.plan.validation.academicCountsValid, true);
  assert.equal(Planner.validate(program, retry.plan).academicCountsValid, true);
  assert.equal(retry.plan.rows.find(row => row.requirementId === 'prior').status, 'confirmed');
  assert.equal(retry.plan.rows.find(row => row.requirementId === 'prior').option.id, 'u-prior');
  assert.equal(cell.status, 'potential', 'budget exhaustion must not hide a feasible reviewed mapping');
  assert.equal(cell.credits, 3);
  assert.equal(cell.placementType, 'required');
  assert.deepEqual(Array.from(cell.requirements, requirement => requirement.id), ['r12']);
});

test('comparison retains a valid bounded course probe without running a full retry', () => {
  const { calls, cell } = compareCandidate('S1');
  assert.equal(calls.length, 1, 'an already valid matrix probe must not rerun the full optimizer');
  assert.equal(calls[0].input.optimizationNodeBudget, 512);
  assert.equal(calls[0].plan.validation.academicCountsValid, true);
  assert.equal(cell.status, 'potential');
  assert.equal(cell.credits, 3);
  assert.deepEqual(Array.from(cell.requirements, requirement => requirement.id), ['r3']);
});
