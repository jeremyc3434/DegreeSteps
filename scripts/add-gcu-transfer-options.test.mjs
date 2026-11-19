import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {buildGCUCampusBSBA} from './import-gcu-curriculum.mjs';
import {addGCUTransferOptions} from './add-gcu-transfer-options.mjs';

const review = JSON.parse(await readFile(new URL('../content/research/gcu-sophia-review-2026-11-19.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
const Planner = require('../dist/planner.js');
const native = () => buildGCUCampusBSBA().models[0];
const build = () => addGCUTransferOptions(native(), review);

test('GCU overlay preserves native quantities and independently counts seven exact three-credit choices', () => {
  const model = build(), rows = model.requirements.filter(row => !row.id.startsWith('gcu-degree-credit-balance-'));
  assert.equal(rows.length, 30);
  assert.equal(rows.reduce((sum, row) => sum + row.credits, 0), 120);
  assert(rows.every(row => row.credits === 4));
  const outside = rows.flatMap(row => row.options.filter(option => option.provider === 'Sophia').map(option => [row.id, option]));
  assert.deepEqual(outside.map(([id]) => id).sort(), ['bio220', 'bus352', 'ecn361', 'ecn362', 'eng106', 'fin350', 'mgt455']);
  assert(outside.every(([, option]) => option.credits === 3 && option.sourceCredits === 3 && option.creditSystem === 'semester' && option.sourceCreditSystem === 'semester'));
  assert.equal(outside.filter(([, option]) => option.upper).length, 1);
  assert.equal(outside.find(([id]) => id === 'mgt455')[1].aceId, 'SOPH-0086');
  for (const id of ['bus340', 'bus485', 'eng105']) assert(model.requirements.find(row => row.id === id).options.every(option => option.provider === 'University'));
  assert.equal(model.completeExecutablePathway, false);
});

test('GCU overlay is a pure, idempotent augmentation with no duplicated courses or source identities', () => {
  const raw = native(), snapshot = structuredClone(raw), reviewSnapshot = structuredClone(review);
  const once = addGCUTransferOptions(raw, review), twice = addGCUTransferOptions(once, review);
  assert.deepEqual(raw, snapshot);
  assert.deepEqual(review, reviewSnapshot);
  assert.deepEqual(twice, once);
  assert.equal(new Set(twice.sources.map(source => source.id)).size, twice.sources.length);
  assert.equal(new Set(twice.requirements.map(row => row.id)).size, 33);
  assert.notEqual(once, raw);
  const unrelated = {id: 'other-school', requirements: [{id: 'a'}]};
  assert.deepEqual(addGCUTransferOptions(unrelated, null), unrelated);
  assert.notEqual(addGCUTransferOptions(unrelated, null), unrelated);
});

test('Derived GCU balance courses have real 1/2/3 awards but zero allocation in the native ledger', () => {
  const model = build(), policy = model.degreeCreditBalancePolicy;
  assert.equal(policy.enabled, true);
  assert.equal(policy.kind, 'gcu-earned-credit-balance-v1');
  assert.equal(policy.minimumDegreeCredits, 120);
  assert.equal(policy.maxBalanceCredits, 6);
  assert.equal(policy.balanceRequirementIds.length, 3);
  assert.deepEqual(policy.writingIntensiveRequirementIds, ['bus340', 'bus485']);
  const rows = policy.balanceRequirementIds.map(id => model.requirements.find(row => row.id === id));
  assert.deepEqual(rows.map(row => [row.code, row.credits, row.options[0].credits]), [['LDR-461', 0, 1], ['LDR-462', 0, 2], ['LDR-463', 0, 3]]);
  assert(rows.every(row => row.institutionalOnly && row.category === 'elective' && row.options.length === 1 && row.options[0].provider === 'University'));
  assert(rows.every(row => row.options[0].sourceCredits === row.options[0].credits && row.options[0].upper === true));
  assert(rows.every(row => !row.bundleId && !row.repeatable && !row.options[0].bundleId && !row.options[0].repeatable));
  assert.equal(model.requirements.reduce((sum, row) => sum + row.credits, 0), 120);
  assert.equal(model.curriculumSections.flatMap(section => section.requirementIds).length, 33);
});

test('GCU content-credit policy binds every exception to its exact outside identity and receiving evidence', () => {
  const model = build(), sources = new Set(model.sources.map(source => source.id));
  assert.equal(model.degreeCreditBalancePolicy.equivalencies.length, 7);
  for (const binding of model.degreeCreditBalancePolicy.equivalencies) {
    const row = model.requirements.find(row => row.id === binding.requirementId), candidate = binding.options[0];
    const option = row.options.find(option => option.id === candidate.optionId);
    assert.deepEqual([binding.nativeCredits, binding.awardedCredits], [4, 3]);
    assert.equal(candidate.code, option.code);
    assert.equal(candidate.provider, option.provider);
    assert.equal(candidate.sourceCredits, option.sourceCredits);
    assert(candidate.sourceIds.includes('gcu-sophia-partner-2026-11-19'));
    for (const key of ['sourceIds', 'identitySourceIds', 'recommendationPeriodSourceIds']) assert(option[key].length && option[key].every(id => sources.has(id)));
    assert.equal(option.mappingEvidence.credits, 3);
    assert.equal(option.degreePlacementEvidence.credits, 4);
    assert.equal(option.degreePlacementEvidence.requirementId, row.id);
    assert(option.recommendationStart <= review.checkedOn && option.recommendationEnd >= review.checkedOn);
    assert.equal(option.mappingEvidence.individualApproval, false);
  }
});

test('GCU overlay rejects fabricated credits, receiving matches and expired identities', () => {
  const fabricatedCredits = structuredClone(review);
  fabricatedCredits.sourceIdentities.find(identity => identity.aceId === 'SOPH-0033').sourceCredits = 4;
  assert.throws(() => addGCUTransferOptions(native(), fabricatedCredits), /Do not inflate Sophia source credits/);
  const wrongDestination = structuredClone(review);
  wrongDestination.bsbaCoreMappings.find(mapping => mapping.receivingCourseCode === 'FIN-350').receivingCourseCode = 'ACC-240';
  assert.throws(() => addGCUTransferOptions(native(), wrongDestination), /No exact current GCU receiving-course mapping/);
  const stale = structuredClone(review);
  stale.sourceIdentities.find(identity => identity.aceId === 'SOPH-0033').recommendationEnd = '2026-01-01';
  assert.throws(() => addGCUTransferOptions(native(), stale), /does not cover the reviewed current offering/);
  const missingGeneralIdentity = structuredClone(review);
  missingGeneralIdentity.generalEducationMappingCandidates.find(mapping => mapping.aceId === 'SOPH-0016').currentSourceIdentityStatus = 'candidate';
  assert.throws(() => addGCUTransferOptions(native(), missingGeneralIdentity), /reviewed/);
});

test('GCU overlay never manufactures lower-to-upper credit or repeatable Service Learning', () => {
  const falseUpper = structuredClone(review);
  falseUpper.bsbaCoreMappings.find(mapping => mapping.receivingCourseCode === 'ECN-361').sourceUpper = true;
  assert.throws(() => addGCUTransferOptions(native(), falseUpper), /original source division/);
  const fakeBalance = native();
  fakeBalance.degreeCreditBalancePolicy.courseIdentityCandidates.find(candidate => candidate.code === 'LDR-463').credits = 4;
  assert.throws(() => addGCUTransferOptions(fakeBalance, review), /Current exact Service Learning course identity/);
  const fakeSource = structuredClone(review);
  fakeSource.sourceIdentities.find(identity => identity.aceId === 'SOPH-0033').identitySourceIds = ['invented-provider-page'];
  assert.throws(() => addGCUTransferOptions(native(), fakeSource), /GCU exact evidence is missing/);
});

test('Real GCU optimization counts actual 120 credits and uses no more than six distinct balance credits', () => {
  const model = build();
  assert(Planner.creditBalancePolicy(model), 'The production planner must recognize the exact reviewed GCU quantity policy.');
  const plan = Planner.generate(model, {priority: 'transfer', providers: ['Sophia'], providerMonths: {Sophia: 1}, universityRate: 0, fees: 0});
  assert.equal(plan.totals.accounted, 120);
  assert.equal(plan.totals.external, 18);
  assert.equal(plan.totals.institutional, 102);
  assert.equal(plan.totals.alternative, 18);
  assert(!plan.blockers.length, JSON.stringify(plan.blockers));
  const outside = plan.rows.filter(row => row.option?.provider === 'Sophia');
  assert.equal(outside.length, 6);
  assert(outside.every(row => row.nativeRequirementCredits === 4 && row.credits === 3));
  const balance = plan.rows.filter(row => row.creditBalanceDerived && row.option);
  assert.deepEqual(balance.map(row => row.option.code).sort(), ['LDR-461', 'LDR-462', 'LDR-463']);
  assert.equal(balance.reduce((sum, row) => sum + row.credits, 0), 6);
  assert(balance.every(row => row.nativeRequirementCredits === 0 && row.option.provider === 'University'));
  for (const id of ['eng105', 'bus340', 'bus485']) assert.equal(plan.rows.find(row => row.requirementId === id).option.provider, 'University');
  assert(plan.rows.every(row => row.status === 'planned'));
  assert(!Planner.validate(model, plan).errors.some(issue => ['total_credits', 'credit_balance', 'group_upper', 'general_education_minimum'].includes(issue.code)));
});
