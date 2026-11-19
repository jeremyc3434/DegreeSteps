import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {buildGCUCampusBSBA, validateGCUCampusBSBA, outputPath} from './import-gcu-curriculum.mjs';

const require = createRequire(import.meta.url);
const Catalog = require('../dist/program-catalog.js');
const Planner = require('../dist/planner.js');
const build = () => buildGCUCampusBSBA().models[0];

test('GCU campus ledger is a balanced, fully named current 120-credit curriculum', async () => {
  const document = buildGCUCampusBSBA(), model = document.models[0];
  assert.deepEqual(JSON.parse(await readFile(new URL('../' + outputPath, import.meta.url), 'utf8')), document);
  assert.equal(model.requirements.length, 30);
  const credits = category => model.requirements.filter(row => row.category === category).reduce((sum, row) => sum + row.credits, 0);
  assert.deepEqual([credits('general'), credits('major'), credits('elective')], [40, 64, 16]);
  assert.equal(model.requirements.filter(row => row.category === 'major' && row.upper).reduce((sum, row) => sum + row.credits, 0), 56);
  assert.equal(model.curriculumSections.length, 7);
  assert.equal(new Set(model.curriculumSections.flatMap(section => section.requirementIds)).size, 30);
  assert(model.requirements.every(row => row.options[0].code && !row.bucket && !row.researchGap));
  assert(model.requirements.some(row => row.code === 'ACC-240'));
  assert(!model.requirements.some(row => ['ACC-250', 'ACC-260'].includes(row.code)));
  assert.equal(document.routes[0].modalities[0], 'campus');
  assert.equal(document.routes[0].parentId, 'gcu-bachelor-of-science-in-business-administration');
});

test('GCU selected prerequisite chains preserve published alternatives without requiring every branch', () => {
  const byId = new Map(build().requirements.map(row => [row.id, row]));
  assert.deepEqual(byId.get('eng106').prerequisites, ['eng105']);
  assert.deepEqual(byId.get('bus352').prerequisites, ['mat144', 'bit200']);
  assert.deepEqual(byId.get('ecn361').prerequisites, ['acc240', 'bus352']);
  assert.deepEqual(byId.get('fin350').prerequisites, ['ecn361', 'acc240']);
  assert.deepEqual(byId.get('bus485').prerequisites, ['mgt420', 'fin350', 'mkt315']);
  assert.match(byId.get('fin350').prerequisiteNotes, /ECN-220 or ECN-351/);
  assert.match(byId.get('mat144').prerequisiteNotes, /placement/);
  assert.match(byId.get('eng105').prerequisiteNotes, /placement/);
  assert(!byId.has('mat110'), 'Developmental preparation must not be silently counted toward graduation.');
});

test('GCU policy quantities remain distinct and independently source bound', () => {
  const model = build(), sources = new Map(model.sources.map(source => [source.id, source]));
  assert.deepEqual([model.totalCredits, model.externalMaxCredits, model.institutionMinCredits, model.alternativeMaxCredits, model.upperMinCredits], [120, 90, 30, 30, 36]);
  assert.equal(model.transferPolicyReview.lowerDivisionMaxCredits, 84);
  assert.equal(model.transferPolicyReview.militaryTrainingMaxCredits, 30);
  assert.deepEqual(model.upperGroupMinimums, [{group: 'business-core', credits: 36}]);
  const residency = sources.get(model.policyEvidence.institutionMinCredits.sourceIds[0]);
  assert(residency.pages.includes(268));
  assert.match(model.policyEvidence.institutionMinCredits.scope, /Explicit bachelor residency/);
  assert.match(model.policyEvidence.alternativeMaxCredits.scope, /combined ceiling/);
  assert.equal(model.transferPolicyReview.thirdPartyTranscriptAccepted, false);
  assert.equal(model.generalEducationMinimums.reduce((sum, rule) => sum + rule.credits, 0), 34);
  assert.deepEqual(model.writingIntensiveRule.selectedNativeMajorRequirementIds, ['bus340', 'bus485']);
  assert.equal(model.writingIntensiveRule.minimumMajorCourses, 2);
});

test('GCU curriculum cannot manufacture an outside award or inflate source credit', () => {
  const model = build();
  assert(model.requirements.every(row => row.options.length === 1 && row.options[0].provider === 'University'));
  assert.equal(model.degreeCreditBalancePolicy.inflateSourceCredits, false);
  assert.equal(model.degreeCreditBalancePolicy.lowerDivisionContentMatchEarnsUpperCredit, false);
  assert.deepEqual(model.degreeCreditBalancePolicy.prohibitedShortfallCategories, ['general']);
  assert.equal(model.degreeCreditBalancePolicy.automaticRepeatAllowed, false);
  assert.deepEqual(model.degreeCreditBalancePolicy.courseIdentityCandidates.map(course => [course.code, course.credits]), [['LDR-461', 1], ['LDR-462', 2], ['LDR-463', 3]]);
  assert.equal(model.completeExecutablePathway, false);
  const changed = structuredClone(model);
  changed.requirements.find(row => row.id === 'fin350').options[0] = {id: 'fake-sophia-finance', provider: 'Sophia', credits: 4, creditOrigin: 'alternative', creditSystem: 'semester', sourceIds: []};
  assert.throws(() => validateGCUCampusBSBA(changed), /Transfer awards require separate source research/);
});

test('Foundations waiver never fabricates four earned credits or reduces the degree minimum', () => {
  const model = build(), waiver = model.foundationsWaiver;
  assert.deepEqual([waiver.minimumTransferredCollegeCredits, waiver.minimumGPA, waiver.creditAward, waiver.automatic], [24, 3, 0, false]);
  assert.equal(model.totalCredits, 120);
  assert.equal(model.requirements.find(row => row.id === 'unv103').credits, 4);
  assert.equal(model.requirements.find(row => row.id === 'cwv101').institutionalOnly, true);
  assert.match(model.degreeCreditBalancePolicy.noteOnCandidates, /not additional requirements/);
});

test('Native GCU ledger passes the shared model schema and produces only unearned school coursework', () => {
  const model = build();
  assert.doesNotThrow(() => Catalog.validateModel(model, {id: model.id, school: model.school, degreeCredits: 120, creditUnit: 'semester'}));
  const plan = Planner.generate(model, {priority: 'cost', providers: [], providerMonths: {}, universityRate: 0, fees: 0});
  assert.equal(plan.rows.length, 30);
  assert.equal(plan.totals.institutional, 120);
  assert.equal(plan.totals.alternative, 0);
  assert(plan.rows.every(row => row.option.provider === 'University' && !row.completed && !row.confirmed));
});
