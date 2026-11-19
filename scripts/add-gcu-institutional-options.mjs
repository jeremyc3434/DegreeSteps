/* Source-bound university-issued ASU options for the reviewed GCU campus BSBA. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const clone = value => JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)];
const key = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const reviewId = 'gcu-institutional-maps-2026-11-19';
const provider = 'ASU Universal Learner';
const category = 'Critical Thinking Transfer - LD';
const electiveCategory = 'Elective Transfer - UD';
const approved = new Map([
  ['BIO130:bio220', 'exact-named'], ['CIS105:bit200', 'exact-named'],
  ...['BIO100', 'BIO145', 'CHM101'].flatMap(code => ['phi105', 'bio220'].map(row => [code + ':' + row, 'general-category'])),
  ...['CIS308', 'CIS310'].flatMap(code => ['open-soc102', 'open-soc220', 'open-com100', 'open-int244'].map(row => [code + ':' + row, 'free-elective-category'])),
]);

function publicGCUUrl(value) {
  try {const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'gcu.edu' || u.hostname.endsWith('.gcu.edu'));} catch {return false;}
}
function currentDate(value) {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Pure clone-and-augment overlay, invoked after addGCUTransferOptions. */
export function addGCUInstitutionalOptions(rawModel, review) {
  if (rawModel?.id !== 'curriculum-gcu-bsba-campus') return clone(rawModel);
  assert.equal(review?.id, reviewId, 'The exact reviewed institutional map packet is required.');
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.modelId, rawModel.id);
  assert.equal(review.school, rawModel.school);
  assert.equal(review.catalogYear, rawModel.catalogYear);
  assert(currentDate(review.checkedOn), 'A valid institutional review date is required.');
  assert.equal(rawModel.totalCredits, 120);
  assert.equal(rawModel.creditSystem, 'semester');
  assert.equal(rawModel.format, 'Residential');
  assert(rawModel.degreeCreditBalancePolicy?.enabled === true && rawModel.degreeCreditBalancePolicy.kind === 'gcu-earned-credit-balance-v1', 'Apply the reviewed Sophia/earned-credit overlay first.');

  const model = clone(rawModel), sources = new Map(model.sources.map(s => [s.id, s]));
  const evidence = new Map(list(review.sources).map(s => [s.id, s]));
  assert.equal(evidence.size, review.sources.length, 'Institutional source IDs must be unique.');
  const add = id => {
    const s = evidence.get(id) || sources.get(id);
    assert(s?.id && /^https:\/\//.test(s.url), 'Missing reviewed institutional source: ' + id);
    const old = sources.get(id);
    assert(!old || old.url === s.url, 'Institutional source identity collision: ' + id);
    if (!old) sources.set(id, {...clone(s), checked: s.checked || s.checkedOn || review.checkedOn});
    return id;
  };
  const addMany = ids => unique(list(ids).map(add));
  const proofs = new Map();
  for (const proof of list(review.publicProofs)) {
    assert(!proofs.has(proof.providerCourseCode), 'A receiving map identity is duplicated.');
    assert.equal(proof.status, 200);
    assert.equal(proof.publicCatalogOnly, true);
    assert.equal(proof.studentRecordsIncluded, false);
    assert(publicGCUUrl(proof.url), 'Receiving maps must use public GCU URLs.');
    const u = new URL(proof.url);
    assert.equal(u.hostname, 'transfersearch.gcu.edu');
    assert.equal(u.pathname, '/SSTPServices/tea/v1/get-transfer-summary');
    assert.equal(u.searchParams.get('trCourseId'), proof.expectedTransferCourseId);
    assert.equal(createHash('sha256').update(proof.responseText).digest('hex'), proof.sha256, 'Immutable public map hash mismatch.');
    assert.equal(Buffer.byteLength(proof.responseText), proof.bytes);
    const body = JSON.parse(proof.responseText);
    assert.equal(body.institution?.institutionId, 'ASUAZ001');
    assert.equal(body.institution?.name, 'Arizona State University');
    assert.equal(body.institution?.id, u.searchParams.get('institutionId'));
    assert.equal(body.transferCourse?.id, proof.expectedTransferCourseId);
    assert.equal(key(body.transferCourse?.courseCode), proof.providerCourseCode);
    assert.equal(body.transferCourse?.evaluationStatus, 'EVALUATED');
    assert.equal(evidence.get(proof.id)?.sha256, proof.sha256);
    assert.equal(evidence.get(proof.id)?.url, proof.url);
    proofs.set(proof.providerCourseCode, {proof, body});
  }
  const identities = new Map(list(review.providerIdentities).map(x => [x.courseCode, x]));
  assert.equal(identities.size, review.providerIdentities.length, 'ASU identity IDs must be unique.');
  const rows = new Map(model.requirements.map(row => [row.id, row]));
  const existingBindings = model.degreeCreditBalancePolicy.equivalencies;
  const bindings = new Map(existingBindings.map(binding => [binding.requirementId, binding]));
  const seen = new Set();
  for (const placement of list(review.placements)) {
    const placementKey = placement.providerCourseCode + ':' + placement.requirementId;
    assert.equal(approved.get(placementKey), placement.kind, 'Unsupported institutional degree allocation: ' + placementKey);
    assert(!seen.has(placementKey), 'Institutional placement is duplicated.'); seen.add(placementKey);
    const row = rows.get(placement.requirementId), identity = identities.get(placement.providerCourseCode), map = proofs.get(placement.providerCourseCode);
    assert(row && row.credits === 4 && !row.institutionalOnly && row.options.some(x => x.provider === 'University'), 'Preserve a complete native four-credit choice.');
    assert(identity?.activeOffering === true && identity.providerId === 'asu-universal-learner' && identity.issuingInstitution === 'Arizona State University', 'A current independently reviewed ASU offering is required.');
    assert.equal(identity.sourceCreditSystem, 'semester');
    assert.equal(identity.sourceCredits, placement.actualCredits, 'Do not inflate institutional source credits.');
    assert.equal(placement.nativeCredits, 4);
    assert(map && placement.mapSourceId === map.proof.id, 'The exact ASU receiving map must be independently bound.');
    assert.equal(Number(map.body.transferCourse.transcriptCredits), identity.sourceCredits, 'Provider and receiving-map source credit quantities disagree.');
    assert.equal(typeof identity.sourceUpper, 'boolean');
    assert(identity.sourceIds.includes('asu-current-course-classification-2026-11-19'), 'Original course division needs its independent ASU source.');
    assert.equal(identity.sourceUpper, ['CIS308', 'CIS310'].includes(identity.courseCode));
    const mapCategories = list(map.body.transferCourseCategoryMapList).map(x => x.name);
    const groups = list(map.body.gcuCourseMappingList).map(group => list(group.gcuCourseMapping));
    if (placement.kind === 'exact-named') {
      assert.equal(placement.receivingCode, row.code);
      assert(groups.some(group => group.length === 1 && group[0].active === true && group[0].courseCode === row.code && Number(group[0].credits) === 4), 'An exact active four-credit receiving course is required.');
      assert.equal(placement.evidence, 'published');
    } else if (placement.kind === 'general-category') {
      assert.equal(row.category, 'general'); assert.equal(row.group, 'gcu-critical-thinking');
      assert.equal(placement.receivingCode, null); assert.equal(placement.receivingCategory, category);
      assert(mapCategories.includes(category), 'A generic category cannot be fabricated from a named course.');
      assert.equal(identity.sourceCredits, 4); assert.equal(identity.sourceUpper, false);
      assert.equal(placement.evidence, 'published');
      if (identity.courseCode === 'CHM101') assert(groups.some(group => group.length === 2 && group.every(x => x.active === true) && group.map(x => x.courseCode).sort().join(',') === 'CHM-101,CHM-101L' && group.reduce((s, x) => s + Number(x.credits), 0) === 4), 'Keep the exact chemistry lecture/lab AND group intact.');
    } else {
      assert.equal(row.category, 'elective'); assert.equal(row.freeElective, true);
      assert.equal(placement.receivingCode, null); assert.equal(placement.receivingCategory, electiveCategory);
      assert(mapCategories.includes(electiveCategory)); assert.equal(identity.sourceCredits, 3); assert.equal(identity.sourceUpper, true);
      assert.equal(placement.evidence, 'published');
    }
    assert(placement.degreeAllocationSourceIds.length >= 2 && placement.degreeAllocationSourceIds.every(id => publicGCUUrl((evidence.get(id) || sources.get(id))?.url)), 'Degree allocation needs independent official GCU program/policy evidence.');
    const mappingSources = addMany([placement.mapSourceId]);
    const identitySources = addMany(identity.sourceIds);
    const allocationSources = addMany(placement.degreeAllocationSourceIds);
    const accountingSources = addMany(['gcu-baccalaureate-transfer-fall-2026-2026-11-19', 'gcu-degree-credit-shortfall-fall-2026-2026-11-19']);
    const ids = unique([...mappingSources, ...identitySources, ...allocationSources, ...accountingSources]);
    const onDemand = identity.selfPacedOption === true;
    assert(onDemand === identity.formats.includes('on-demand'));
    const option = {
      id: placement.id, provider, code: identity.courseCode, providerCourseCode: identity.courseCode,
      codeType: 'university-course-code', title: identity.title,
      credits: identity.sourceCredits, sourceCredits: identity.sourceCredits,
      creditSystem: 'semester', sourceCreditSystem: 'semester', creditOrigin: 'institutional',
      sourceCreditStatus: 'verified', sourceUpper: identity.sourceUpper, upper: identity.sourceUpper,
      ...(placement.receivingCode ? {receivingCode: placement.receivingCode, receivingTitle: row.title} : {receivingCategory: placement.receivingCategory}),
      evidence: placement.evidence, evidenceType: 'official-receiving-school-equivalency',
      placementType: placement.kind === 'exact-named' ? 'exact-named-requirement' : placement.kind === 'general-category' ? 'category' : 'elective',
      allocationType: placement.kind, allocationBasis: placement.scope,
      sourceIds: ids, identitySourceIds: identitySources,
      sourceCreditEvidence: {credits: identity.sourceCredits, creditSystem: 'semester', sourceIds: identitySources},
      mappingChecked: review.checkedOn, mappingReviewId: reviewId, mappingResearchClosed: true,
      receivingMapStatus: placement.kind === 'exact-named' ? 'published-institutional-course' : 'published-institutional-category',
      mappingScope: placement.scope,
      ...(placement.kind !== 'exact-named' ? {categoryPlacementReviewed: true, categoryPlacementReviewId: reviewId} : {}),
      mappingEvidence: {schoolName: model.school, catalogYear: model.catalogYear, provider, providerCourseCode: identity.courseCode, issuer: 'Arizona State University', ...(placement.receivingCode ? {receivingCode: placement.receivingCode} : {receivingCategory: placement.receivingCategory}), credits: identity.sourceCredits, creditSystem: 'semester', creditOrigin: 'institutional', sourceIds: mappingSources, claimOrigin: 'official-receiving-school-public-catalog', publisher: 'Grand Canyon University', scope: placement.kind === 'exact-named' ? 'university-course-equivalency' : 'institutional-category-award', individualApproval: false},
      degreePlacementEvidence: {modelId: model.id, schoolName: model.school, programName: model.title, catalogYear: model.catalogYear, modality: 'campus', requirementId: row.id, ...(placement.receivingCode ? {receivingCode: placement.receivingCode} : {receivingCategory: placement.receivingCategory}), credits: 4, actualAllocatedCredits: identity.sourceCredits, creditSystem: 'semester', placementType: placement.kind, sourceIds: allocationSources, scope: placement.scope},
      universityMapRecord: {institutionId: map.body.institution.institutionId, transferCourseId: map.body.transferCourse.id, transferCourseCode: map.body.transferCourse.courseCode, sourceCredits: Number(map.body.transferCourse.transcriptCredits), mappingGroups: clone(groups), categories: clone(mapCategories), sourceId: map.proof.id, sha256: map.proof.sha256, retrievedAt: map.proof.retrievedAt},
      codeAliases: unique([identity.courseCode, map.body.transferCourse.courseCode]),
      codeAliasEvidence: unique([identity.courseCode, map.body.transferCourse.courseCode]).map(alias => ({alias, sourceIds: identitySources, scope: 'Exact ASU ULC course identity; punctuation normalized only.'})),
      eligibilityReview: {eligibleToStart: true, status: 'current-open-enrollment-university-offering-reviewed', sourceIds: identitySources, noAgeRestriction: true, excludesAdmittedASUDegreeStudents: true, individualApproval: false},
      deliveryEvidence: {selfPaced: onDemand, format: onDemand ? 'on-demand' : 'scheduled-asynchronous', availableFormats: clone(identity.formats), minimumEnrollmentWeeks: onDemand ? 6 : 8, maximumCompletionDays: onDemand ? 365 : null, ...(onDemand ? {} : {nextStart: identity.sessionBasedNextStart}), transcriptPostingBusinessDaysUpTo: 14, sourceIds: identitySources},
      learningFormat: onDemand ? 'self-paced' : 'scheduled', paceStatus: 'reviewed',
      cost: 425, costVerified: true, costStatus: 'reviewed-provider-course-fees',
      costEvidence: {currency: 'USD', enrollmentFee: 25, creditConversionFee: 400, totalCourseCost: 425, basis: 'per-course', sourceIds: addMany(identity.price.sourceIds)},
      url: (evidence.get('asu-ulc-' + identity.courseCode.toLowerCase() + '-current') || sources.get('asu-ulc-' + identity.courseCode.toLowerCase() + '-current')).url,
      conditions: [
        placement.scope,
        'Counts ' + identity.sourceCredits + ' actual ASU semester credits, once. ' + (identity.sourceCredits === 3 ? 'The native four-credit allocation retains a separately counted one-credit degree balance.' : 'No additional lecture or lab credits are added to this four-credit course.'),
        onDemand ? 'Choose the on-demand offering. ASU requires at least six weeks enrolled; credit posting may take up to fourteen business days after purchase.' : 'This is a scheduled eight-week asynchronous course, not a self-paced offering. Next published start: ' + identity.sessionBasedNextStart + '.',
        'The course costs $25 to enroll plus $400 to add earned credit to the ASU transcript. Current admitted degree-seeking ASU students are ineligible for ULC; identity verification is required.',
      ],
    };
    if (identity.equipmentNotes) option.conditions.push(identity.equipmentNotes);
    row.options = row.options.filter(existing => existing.id !== option.id); row.options.push(option);
    if (option.credits === 3) {
      let binding = bindings.get(row.id);
      if (!binding) {binding = {requirementId: row.id, nativeCredits: 4, awardedCredits: 3, options: []}; bindings.set(row.id, binding);}
      assert.equal(binding.nativeCredits, 4); assert.equal(binding.awardedCredits, 3);
      binding.options = binding.options.filter(existing => existing.optionId !== option.id);
      binding.options.push({optionId: option.id, provider, code: option.code, sourceCredits: 3, sourceCreditSystem: 'semester', sourceIds: mappingSources});
    }
  }
  assert.equal(seen.size, approved.size, 'The reviewed institutional placement set is incomplete.');
  model.degreeCreditBalancePolicy.equivalencies = [...bindings.values()];
  model.sources = [...sources.values()];
  model.defaultProviders = unique([...list(model.defaultProviders), provider]);
  model.evidenceCheckedOn = review.checkedOn;
  model.completeExecutablePathway = false;
  model.coverageLabel = 'Complete campus BSBA requirements with current Sophia and ASU transfer choices, actual earned-credit accounting and sourced category allocations.';
  model.rulesNotes = unique([...list(model.rulesNotes), 'ASU Universal Learner choices use actual university-issued semester credits. Category awards are proposed within the sourced BSBA allowance and are not named-course equivalencies. ASU on-demand choices require at least six weeks; the scheduled chemistry alternative is labeled separately.']);
  assert.equal(model.requirements.reduce((sum, row) => sum + row.credits, 0), 120);
  assert.equal(model.requirements.length, rawModel.requirements.length);
  return model;
}
