import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {buildGCUCampusBSBA} from './import-gcu-curriculum.mjs';
import {addGCUTransferOptions} from './add-gcu-transfer-options.mjs';
import {addGCUInstitutionalOptions} from './add-gcu-institutional-options.mjs';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const review = await read('content/research/gcu-institutional-maps-2026-11-19.json');
const sophia = await read('content/research/gcu-sophia-review-2026-11-19.json');
const require = createRequire(import.meta.url), Catalog = require('../dist/program-catalog.js'), Planner = require('../dist/planner.js');
const before = () => addGCUTransferOptions(buildGCUCampusBSBA().models[0], sophia);
const build = () => addGCUInstitutionalOptions(before(), review);
const outside = model => model.requirements.flatMap(row => row.options.filter(option => option.provider === 'ASU Universal Learner').map(option => ({row, option})));

// These are evidence/accounting tests, not snapshots of the generated code.
test('ASU overlay is pure and idempotent and preserves all native and Sophia choices', () => {
  const raw = before(), saved = structuredClone(raw), evidence = structuredClone(review);
  const once = addGCUInstitutionalOptions(raw, review), twice = addGCUInstitutionalOptions(once, review);
  assert.deepEqual(raw, saved); assert.deepEqual(review, evidence); assert.deepEqual(twice, once);
  for (const row of raw.requirements) {
    const next = once.requirements.find(x => x.id === row.id);
    assert.equal(next.credits, row.credits);
    for (const option of row.options) assert.deepEqual(next.options.find(x => x.id === option.id), option);
  }
  assert.equal(once.requirements.reduce((sum, row) => sum + row.credits, 0), 120);
  assert.equal(once.requirements.length, 33);
  assert.equal(new Set(once.sources.map(s => s.id)).size, once.sources.length);
  assert.equal(outside(once).length, 16);
  const other = {id: 'other-college', requirements: [{id: 'a'}]};
  assert.deepEqual(addGCUInstitutionalOptions(other, null), other);
  assert.notEqual(addGCUInstitutionalOptions(other, null), other);
});

test('Named receiving maps and category awards remain distinct with exact source quantities', () => {
  const model = build(), items = outside(model);
  const bio = items.find(x => x.row.id === 'bio220' && x.option.code === 'BIO130').option;
  assert.deepEqual([bio.credits, bio.sourceCredits, bio.receivingCode], [4, 4, 'BIO-220']);
  assert.equal(bio.universityMapRecord.mappingGroups[0][0].credits, '4.0');
  const generic = items.filter(x => x.option.allocationType === 'general-category');
  assert(generic.every(x => x.row.group === 'gcu-critical-thinking' && x.row.id !== 'mat144'));
  assert(generic.every(x => x.option.credits === 4 && x.option.sourceCredits === 4 && x.option.receivingCode === undefined && x.option.receivingCategory === 'Critical Thinking Transfer - LD'));
  assert(generic.every(x => x.option.mappingEvidence.receivingCode === undefined && x.option.degreePlacementEvidence.receivingCode === undefined));
  assert(generic.every(x => x.option.evidence === 'published' && x.option.categoryPlacementReviewed === true && x.option.degreePlacementEvidence.sourceIds.length >= 2));
  assert(!outside(model).some(x => x.row.id === 'mat144'));
});

test('Three-credit university coursework never manufactures a fourth credit or ACE origin', () => {
  const model = build(), items = outside(model).filter(x => x.option.credits === 3);
  assert(items.length > 0);
  assert(items.every(x => x.option.sourceCredits === 3 && x.option.creditOrigin === 'institutional'));
  for (const {row, option} of items) {
    const binding = model.degreeCreditBalancePolicy.equivalencies.find(x => x.requirementId === row.id);
    assert.deepEqual([binding.nativeCredits, binding.awardedCredits, row.credits], [4, 3, 4]);
    assert(binding.options.some(x => x.optionId === option.id && x.sourceCredits === 3 && x.sourceCreditSystem === 'semester'));
    assert.equal(option.degreePlacementEvidence.actualAllocatedCredits, 3);
    assert.equal(option.costEvidence.totalCourseCost, 425);
    assert.equal(option.costEvidence.basis, 'per-course');
  }
  assert(items.filter(x => ['CIS308', 'CIS310'].includes(x.option.code)).every(x => x.row.freeElective && x.option.sourceUpper && x.option.upper && x.option.receivingCategory === 'Elective Transfer - UD'));
  assert(Planner.creditBalancePolicy(model));
  assert.equal(Catalog.validateModel(model, {id: model.id, school: model.school}).id, model.id);
});

test('Exact public API receipts are immutable, contain public catalog data, and use independent issuer evidence', () => {
  for (const proof of review.publicProofs) {
    assert.equal(createHash('sha256').update(proof.responseText).digest('hex'), proof.sha256);
    assert.equal(Buffer.byteLength(proof.responseText), proof.bytes);
    assert.equal(proof.publicCatalogOnly, true); assert.equal(proof.studentRecordsIncluded, false);
    assert.equal(new URL(proof.url).hostname, 'transfersearch.gcu.edu');
    assert.equal(JSON.parse(proof.responseText).institution.institutionId, 'ASUAZ001');
    assert(!Object.keys(proof).some(key => /headers|authorization|cookie|token/i.test(key)));
  }
  const model = build();
  for (const {option} of outside(model)) {
    assert(option.identitySourceIds.every(id => !option.mappingEvidence.sourceIds.includes(id)));
    assert(option.identitySourceIds.includes('asu-current-course-classification-2026-11-19'));
    assert(option.mappingEvidence.sourceIds.every(id => model.sources.find(s => s.id === id).url.startsWith('https://transfersearch.gcu.edu/')));
  }
});

test('Scheduled chemistry is explicit; unreviewed split credits and overlapping alternatives stay research-only', () => {
  const items = outside(build());
  assert(!items.some(x => ['CHM114', 'BIO160', 'ECN211', 'ECN212'].includes(x.option.code)));
  assert(!items.some(x => /UMPI/.test(x.option.provider)));
  for (const {option} of items.filter(x => x.option.code === 'CHM101')) {
    assert.equal(option.deliveryEvidence.selfPaced, false);
    assert.equal(option.deliveryEvidence.format, 'scheduled-asynchronous');
    assert.equal(option.deliveryEvidence.nextStart, '2027-01-12');
    assert.match(option.conditions.join(' '), /not a self-paced/);
    assert.equal(option.universityMapRecord.mappingGroups[0].reduce((sum, x) => sum + Number(x.credits), 0), 4);
    assert.equal(option.credits, 4, 'The 3+1 lecture/lab group remains a single four-credit action.');
  }
  assert(items.filter(x => x.option.code.startsWith('BIO')).every(x => x.option.deliveryEvidence.selfPaced && x.option.deliveryEvidence.minimumEnrollmentWeeks === 6));
});

test('Malformed identities, inflated credits, unsupported slots and changed API bodies are rejected', () => {
  const changedProof = structuredClone(review); changedProof.publicProofs[0].responseText += ' ';
  assert.throws(() => addGCUInstitutionalOptions(before(), changedProof), /hash mismatch/);
  const inactive = structuredClone(review); inactive.providerIdentities.find(x => x.courseCode === 'CIS105').activeOffering = false;
  assert.throws(() => addGCUInstitutionalOptions(before(), inactive), /current independently reviewed ASU offering/);
  const inflated = structuredClone(review); inflated.providerIdentities.find(x => x.courseCode === 'CIS105').sourceCredits = 4;
  assert.throws(() => addGCUInstitutionalOptions(before(), inflated), /Do not inflate institutional source credits/);
  const math = structuredClone(review); math.placements.find(x => x.providerCourseCode === 'BIO100').requirementId = 'mat144';
  assert.throws(() => addGCUInstitutionalOptions(before(), math), /Unsupported institutional degree allocation/);
  const falseCategory = structuredClone(review); falseCategory.placements.find(x => x.providerCourseCode === 'BIO145').receivingCategory = 'Global Awareness';
  assert.throws(() => addGCUInstitutionalOptions(before(), falseCategory), /Critical Thinking Transfer/);
  const wrongDivision = structuredClone(review); wrongDivision.providerIdentities.find(x => x.courseCode === 'CIS308').sourceUpper = false;
  assert.throws(() => addGCUInstitutionalOptions(before(), wrongDivision));
  assert.throws(() => addGCUInstitutionalOptions(buildGCUCampusBSBA().models[0], review), /overlay first/);
});

test('Generated plan counts ASU credit once, preserves 120 and separately honors general education and residency', () => {
  const model = build();
  const plan = Planner.generate(model, {providers: model.defaultProviders, allowConditional: true, priority: 'transfer', optimizationNodeBudget: 12000});
  assert.equal(plan.validation.academicCountsValid, true);
  assert(!plan.validation.errors.some(error => error.code === 'conditional_mapping'), 'Reviewed category placement has no pending mapping research.');
  assert.equal(plan.totals.accounted, 120);
  assert(plan.totals.institutional >= 30);
  const actions = plan.rows.filter(row => row.option?.provider === 'ASU Universal Learner');
  assert(actions.some(row => row.credits === 4));
  assert.equal(new Set(actions.map(row => row.option.code)).size, actions.length);
  assert(actions.every(row => row.credits === row.option.sourceCredits));
  assert(!actions.some(row => row.option.code === 'CHM101'), 'Equally priced on-demand science choices precede scheduled chemistry by default.');
  const alternative = plan.rows.filter(row => row.option && ['ace', 'alternative'].includes(row.option.creditOrigin)).reduce((sum, row) => sum + row.credits, 0);
  assert.equal(plan.totals.alternative, alternative, 'University-issued ASU coursework must not consume the alternative-credit allowance.');
  // The automatic cheaper mix can omit three-credit ASU work. Exercise its
  // accounting explicitly rather than requiring the optimizer to buy it.
  const selected = model.requirements.find(row => row.id === 'bit200').options.find(option => option.provider === 'ASU Universal Learner' && option.code === 'CIS105');
  const withThree = Planner.generate(model, {providers: model.defaultProviders, allowConditional: true, priority: 'transfer', optionSelections: {bit200: selected.id}});
  assert.equal(withThree.validation.academicCountsValid, true);
  assert.equal(withThree.totals.accounted, 120);
  const actualThree = withThree.rows.find(row => row.requirementId === 'bit200');
  assert.equal(actualThree.option.id, selected.id);
  assert.deepEqual([actualThree.credits, actualThree.option.sourceCredits, actualThree.nativeRequirementCredits], [3, 3, 4]);
  const selectedActions = withThree.rows.filter(row => row.option?.provider === 'ASU Universal Learner');
  assert.equal(new Set(selectedActions.map(row => row.option.code)).size, selectedActions.length);
  assert.equal(withThree.totals.alternative, withThree.rows.filter(row => row.option && ['ace', 'alternative'].includes(row.option.creditOrigin)).reduce((sum, row) => sum + row.credits, 0));
});
