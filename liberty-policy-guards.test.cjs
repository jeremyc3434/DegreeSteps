const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('./dist/program-catalog.js');
const Sheet = require('./dist/sheet-state.js');
const Guide = require('./dist/guide-engine.js');
const Journey = require('./dist/journey-engine.js');
const Planner = require('./dist/planner.js');

const onlineBusiness = 'curriculum-liberty-business-bs-online';
const libertyIds = [onlineBusiness, 'liberty-business-residential', 'liberty-criminal-justice-online', 'liberty-criminal-justice-residential'];
const clone = value => JSON.parse(JSON.stringify(value));
const fetcher = async file => ({ok:true, json:async () => JSON.parse(fs.readFileSync(path.join(__dirname, 'dist', file), 'utf8'))});
const ready = (async () => {
  const catalog = await Catalog.loadIndex(Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), {fetcher, required:true});
  const models = await Catalog.loadModels(libertyIds, {fetcher, required:true});
  return {catalog, models};
})();

function seed(catalog, model) {
  const route = catalog.pathways.find(route => route.modelId === model.id);
  assert(route, model.id + ' has an exact catalog route');
  let state = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null, null, catalog), route), null, catalog);
  state.profile.modality = model.format === 'Online' ? 'online' : 'campus';
  state.profile.classroomImportance = 'open';
  state.profile.priority = 'transfer';
  // This fixture deliberately excludes all currently reviewed providers. The
  // journey otherwise enables newly discovered providers during saved-plan migration.
  state.scenarios[model.id] = {providers:[], mappedProvidersReviewed:[...new Set(model.requirements.flatMap(requirement =>
    requirement.options.map(option => option.provider)).filter(provider => provider !== 'University'))]};
  return state;
}

function recordPlacement(state, model, requirement, extra = {}) {
  const item = {id:'record-' + requirement.id, provider:'College', code:'ORIGINAL-' + requirement.id,
    title:'Evaluated original course for ' + requirement.code, credits:requirement.credits, creditSystem:'semester', status:'earned', grade:'A', ...extra};
  state = Sheet.updateLearning(state, item);
  return Sheet.assignLearning(state, model, item.id, requirement.id, {confirmation:true});
}

test('an exact online-business audit cannot transfer all 51 major credits and still satisfy major residency', async () => {
  const {catalog, models} = await ready, model = models.find(model => model.id === onlineBusiness);
  const major = model.requirements.filter(requirement => requirement.category === 'major');
  assert.equal(major.reduce((credits, requirement) => credits + requirement.credits, 0), 51);
  let state = seed(catalog, model);
  for (const requirement of major) state = recordPlacement(state, model, requirement);
  const saved = clone(state), match = Guide.matchInventory(model, state.learning);
  assert.equal(match.completed.length, major.length, 'explicit school placements remain visible for review');
  const draft = Journey.buildDraft(state, catalog, models);
  assert.equal(draft.program.id, model.id);
  assert.equal(draft.plan.totals.confirmed, 51);
  assert.equal(draft.plan.totals.majorInstitutional, 0);
  assert.equal(draft.plan.totals.accounted, 120);
  assert(draft.plan.totals.institutional >= 30, 'overall residency alone does not satisfy major residency');
  assert.equal(draft.plan.validation.academicCountsValid, false);
  assert(draft.plan.blockers.some(error => error.code === 'major_residency'));
  assert.equal(draft.plan.optimization.optimalityProven, false);
  assert.deepEqual(state, saved, 'validation must not erase confirmed source records');
});

test('sourced Liberty major grade minima survive saved records, explicit confirmation and the full journey', async () => {
  const {catalog, models} = await ready;
  for (const id of libertyIds) {
    const model = models.find(model => model.id === id);
    const requirement = model.requirements.find(requirement => requirement.code === (/criminal-justice/.test(id) ? 'CJUS 310' : 'BUSI 342'));
    assert.equal(requirement.minimumGrade, 'C', id + ' has a sourced grade minimum');
    for (const grade of ['D', 'C-', 'C']) {
      const state = recordPlacement(seed(catalog, model), model, requirement, {provider:'University', code:requirement.code,
        institution:model.school, sourceProgramId:model.id, grade});
      const saved = clone(state);
      const match = Guide.matchInventory(model, state.learning);
      const draft = Journey.buildDraft(state, catalog, models);
      assert.equal(match.completed.some(placement => placement.requirementId === requirement.id), grade === 'C', id + ' ' + grade);
      assert.equal(draft.plan.totals.confirmed, grade === 'C' ? requirement.credits : 0, id + ' ' + grade);
      assert.equal(state.learning[0].grade, grade, 'the source grade stays available for review');
      assert.deepEqual(state, saved, 'the full saved record and its explicit school confirmation remain intact');
      if (grade !== 'C') assert(draft.match.unmatched.some(record => record.id === state.learning[0].id));
    }
  }
});

test('online business retains UNIV 104 until an exemption is approved and every Liberty baseline counts 120 unique credits', async () => {
  const {catalog, models} = await ready;
  for (const id of libertyIds) {
    const model = models.find(model => model.id === id), draft = Journey.buildDraft(seed(catalog, model), catalog, models);
    assert.equal(draft.program.id, id);
    assert.equal(new Set(draft.plan.rows.map(row => row.requirementId)).size, draft.plan.rows.length);
    assert.equal(draft.plan.rows.reduce((credits, row) => credits + row.credits, 0), 120);
    assert.equal(draft.plan.totals.accounted, 120);
    assert.equal(draft.plan.totals.external, 0);
    if (id === onlineBusiness) {
      const univ = draft.plan.rows.filter(row => row.code === 'UNIV 104');
      assert.equal(univ.length, 1);
      assert.equal(univ[0].credits, 3);
      assert.equal(univ[0].status, 'planned');
      assert.equal(draft.plan.rows.filter(row => ['elective', 'electives'].includes(row.category)).reduce((credits, row) => credits + row.credits, 0), 39);
      assert.equal(draft.program.appliedTransferWaiver, undefined);
    }
  }
});

// Unequal course sizes make rounding to an assumed three-credit course unsafe.
// The smallest feasible university-major subset is determined by enumeration.
function policyFixture(policy = {}) {
  const rows = [2, 3, 4, 3].map((credits, index) => ({id:'course-' + index, code:'TEST ' + index,
    title:'Policy fixture course ' + index, category:index < 3 ? 'major' : 'general', credits,
    options:['University', 'Sophia'].map(provider => ({id:provider + '-' + index, provider, code:'TEST-' + index,
      receivingCode:'TEST ' + index, title:'Policy fixture course ' + index, credits, upper:false, evidence:'published', sourceIds:['fixture']}))}));
  return {id:'residency-policy-fixture', title:'Explicitly synthetic residency fixture', totalCredits:12,
    institutionMinCredits:0, majorInstitutionFraction:0.25, majorResidencyBasisCredits:9,
    sources:[{id:'fixture', url:'https://example.edu/policy-fixture'}], requirements:rows, ...policy};
}

test('all planner objectives and standalone validation use the stronger fractional or absolute major minimum', () => {
  for (const explicit of [undefined, 1, 4, 6]) {
    const model = policyFixture(explicit === undefined ? {} : {majorMinInstitutionCredits:explicit});
    const threshold = Math.max(2.25, explicit || 0), sizes = [2, 3, 4];
    const feasible = Array.from({length:8}, (_, mask) => sizes.reduce((credits, size, index) => credits + (mask & (1 << index) ? size : 0), 0)).filter(credits => credits >= threshold);
    const leastMajor = Math.min(...feasible);
    for (const priority of ['transfer', 'cost', 'speed']) {
      const plan = Planner.generate(model, {providers:['Sophia'], priority, universityRate:100});
      assert.equal(plan.validation.academicCountsValid, true);
      assert.equal(plan.totals.majorInstitutional, leastMajor, priority + ' finds a feasible course subset');
      assert.equal(plan.totals.external, model.totalCredits - leastMajor);
      assert.equal(Planner.validate(model, plan).academicCountsValid, true);
      assert.equal(plan.optimization.optimalityProven, true);
    }
    const unrestricted = {...model};
    delete unrestricted.majorInstitutionFraction; delete unrestricted.majorResidencyBasisCredits; delete unrestricted.majorMinInstitutionCredits;
    const outside = Planner.generate(unrestricted, {providers:['Sophia'], priority:'transfer'});
    assert.equal(outside.totals.majorInstitutional, 0);
    assert(Planner.validate(model, outside).errors.some(error => error.code === 'major_residency'));
  }
  const legacy = policyFixture({majorMinInstitutionCredits:4});
  delete legacy.majorInstitutionFraction; delete legacy.majorResidencyBasisCredits;
  assert.equal(Planner.generate(legacy, {providers:['Sophia'], priority:'transfer'}).totals.majorInstitutional, 4, 'absolute-only policies retain their existing meaning');
});

test('an incomplete or invalid fractional major policy cannot become a zero minimum or a feasible optimized plan', () => {
  const invalidPolicies = [
    {majorResidencyBasisCredits:undefined}, {majorResidencyBasisCredits:null}, {majorResidencyBasisCredits:0},
    {majorResidencyBasisCredits:-9}, {majorResidencyBasisCredits:13}, {majorResidencyBasisCredits:'9'},
    {majorResidencyBasisCredits:undefined, majorMinInstitutionCredits:6},
    {majorInstitutionFraction:undefined}, {majorInstitutionFraction:null}, {majorInstitutionFraction:-0.25},
    {majorInstitutionFraction:1.25}, {majorInstitutionFraction:NaN}, {majorMinInstitutionCredits:-1}
  ];
  const missingFraction = policyFixture();
  delete missingFraction.majorInstitutionFraction;
  const invalidAbsoluteOnly = [-1, 'garbage', NaN, Infinity].map(majorMinInstitutionCredits => {
    const model = policyFixture({majorMinInstitutionCredits});
    delete model.majorInstitutionFraction; delete model.majorResidencyBasisCredits;
    return model;
  });
  for (const model of [...invalidPolicies.map(policyFixture), missingFraction, ...invalidAbsoluteOnly]) {
    const plan = Planner.generate(model, {providers:['Sophia'], priority:'transfer'});
    assert.equal(plan.validation.academicCountsValid, false);
    assert.equal(plan.validation.policyChecksComplete, false);
    assert(plan.blockers.some(error => error.code === 'major_residency_policy'));
    assert.equal(plan.optimization.optimalityProven, false);
    assert.equal(Planner.validate(model, plan).valid, false);
  }
});
