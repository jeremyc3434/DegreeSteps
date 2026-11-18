const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const Planner = require('./dist/planner.js');

const providers = ['Sophia', 'Study.com', 'CLEP', 'DSST', 'StraighterLine'];
function requirement(id, credits = 3) {
  return {id, code:id.toUpperCase(), title:id, credits, category:'major', options:['University', ...providers].map(provider => ({
    id:provider + '-' + id, provider, code:provider + '-' + id, title:provider + ' ' + id,
    credits, upper:false, evidence:'published', sourceIds:['catalog']
  }))};
}
function program(requirements = Array.from({length:4}, (_, index) => requirement('r' + index))) {
  return {id:'cache-regression', title:'Cache regression', format:'Online', totalCredits:requirements.reduce((sum, row) => sum + row.credits, 0),
    institutionMinCredits:3, majorMinInstitutionCredits:0, upperMinCredits:0,
    sources:[{id:'catalog', url:'https://example.edu/catalog'}], unresolved:[], requirements,
    pricing:{model:'per-credit', amount:100, sourceIds:['catalog'], sourceUrl:'https://example.edu/catalog'}};
}

test('provider baskets bound repeated objective and tuition-source work while preserving the full plan', () => {
  const filename = require.resolve('./dist/planner.js');
  const source = fs.readFileSync(filename, 'utf8');
  const scoreEntry = 'function candidateScore(program, rows, input, priority) {';
  assert(source.includes(scoreEntry));
  // Count the expensive operations, avoiding wall-clock thresholds on shared CI.
  const instrumented = 'let scoreCalls=0,urlChecks=0; const URL=class extends globalThis.URL { constructor(...args) { urlChecks++; super(...args); } };\n' +
    source.replace(scoreEntry, scoreEntry + ' scoreCalls++;') +
    '\nmodule.exports={...module.exports,counts:()=>({scoreCalls,urlChecks})};';
  const compiled = new Module(filename, module);
  compiled._compile(instrumented, filename);
  const model = program(); model.requirements[0].institutionalOnly = true;
  const input = {providers, priority:'speed', optimizationNodeBudget:0, universityRate:100};
  const actual = compiled.exports.generate(model, input);
  assert.deepEqual(actual, Planner.generate(model, input));
  assert(actual.validation.academicCountsValid);
  const counts = compiled.exports.counts();
  assert(counts.scoreCalls < 450, 'five-provider baskets should not rescore every initial proposal in each basket: ' + JSON.stringify(counts));
  assert(counts.urlChecks < 20, 'source-bound tuition assumptions should be reused within the generation: ' + JSON.stringify(counts));
});

test('reusing and editing scenario inputs refreshes eligibility and tuition assumptions', () => {
  const model = program([requirement('a'), requirement('b')]);
  const input = {providers:['Sophia'], priority:'cost', universityRate:100};
  const first = Planner.generate(model, input);
  assert.equal(first.totals.external, 3);
  assert.equal(first.costs.universityTuition, 300);
  input.universityRate = 10;
  const cheaperSchool = Planner.generate(model, input);
  assert.equal(cheaperSchool.totals.external, 0);
  assert.equal(cheaperSchool.costs.universityTuition, 60);
  input.universityRate = 100; input.providers = [];
  const schoolOnly = Planner.generate(model, input);
  assert.equal(schoolOnly.totals.external, 0);
  assert.equal(schoolOnly.costs.universityTuition, 600);
  model.pricing = {model:'subscription', amount:500, period:'6 months', sourceIds:['catalog'], sourceUrl:'https://example.edu/catalog'};
  input.priority = 'campus'; input.universityRate = 0; input.universitySubscriptionTerms = 1;
  assert.equal(Planner.generate(model, input).costs.universityTuition, 500);
  input.universitySubscriptionTerms = 3;
  assert.equal(Planner.generate(model, input).costs.universityTuition, 1500);
  model.pricing.amount = 600;
  assert.equal(Planner.generate(model, input).costs.universityTuition, 1800);
});

test('distinct requirement objects with duplicate IDs retain their own eligible options and blockers', () => {
  const first = requirement('duplicate', 3), second = requirement('duplicate', 6);
  second.options.forEach(option => { option.id += '-second'; option.code += '-second'; });
  const model = program([first, second]); model.institutionMinCredits = 0;
  const plan = Planner.generate(model, {providers:['Sophia'], priority:'speed'});
  assert.equal(plan.rows[0].option.credits, 3);
  assert.equal(plan.rows[1].option.credits, 6);
  assert(plan.rows[1].option.id.endsWith('-second'));
  assert(plan.blockers.some(error => error.code === 'duplicate_requirement'));
  assert(!plan.blockers.some(error => error.code === 'credit_mismatch'));
});
