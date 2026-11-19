/* Add reviewed GCU content matches without changing actual awarded credits. */
import assert from 'node:assert/strict';

const clone = value => JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)];
const canonical = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const overlayId = 'gcu-sophia-review-2026-11-19';
const balancePrefix = 'gcu-degree-credit-balance-';
const balanceCodes = ['LDR-461', 'LDR-462', 'LDR-463'];
const targets = [
  ['FIN-350', 'SOPH-0033'],
  ['BUS-352', 'SOPH-0005'],
  ['ECN-361', 'SOPH-0011'],
  ['ECN-362', 'SOPH-0012'],
  ['MGT-455', 'SOPH-0086'],
  ['ENG-106', 'SOPH-0030'],
  ['BIO-220', 'SOPH-0016'],
];
const balanceId = code => balancePrefix + canonical(code).toLowerCase();

function assertSourceDate(value, name) {
  assert(typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value), 'Invalid reviewed date: ' + name);
  assert.equal(new Date(value).toISOString().slice(0, 10), value, 'Invalid reviewed date: ' + name);
}

/**
 * Pure overlay. Inputs are supplied by the build pipeline; this function has no
 * network/filesystem dependency and never mutates the native reviewed ledger.
 * Native requirements keep four credits. Exact outside options award three.
 */
export function addGCUTransferOptions(rawModel, review) {
  if (rawModel?.id !== 'curriculum-gcu-bsba-campus') return clone(rawModel);
  assert.equal(rawModel.school, 'Grand Canyon University');
  assert.equal(rawModel.totalCredits, 120);
  assert.equal(rawModel.creditSystem, 'semester');
  assert.equal(rawModel.format, 'Residential');
  assert.equal(review?.id, overlayId);
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.receivingSchool, rawModel.school);
  assertSourceDate(review.checkedOn, 'GCU review');

  const model = clone(rawModel);
  const nativeRows = model.requirements.filter(row => !row.id.startsWith(balancePrefix));
  assert.equal(nativeRows.length, 30, 'GCU overlay requires the complete current native curriculum.');
  assert.equal(nativeRows.reduce((sum, row) => sum + row.credits, 0), 120);
  assert(nativeRows.every(row => row.credits === 4));
  const byCode = new Map(nativeRows.filter(row => row.code).map(row => [canonical(row.code), row]));
  const nativeSources = new Map(model.sources.map(source => [source.id, source]));
  const sourceMap = new Map([...nativeSources]);
  const reviewedSources = new Map(list(review.sources).map(source => [source.id, source]));
  assert.equal(reviewedSources.size, review.sources.length, 'GCU reviewed sources must be unique.');
  const addSource = id => {
    const source = reviewedSources.get(id) || nativeSources.get(id);
    assert(source?.id && /^https:\/\//.test(source.url), 'GCU exact evidence is missing: ' + id);
    const previous = sourceMap.get(id);
    assert(!previous || previous.url === source.url, 'GCU source identity collision: ' + id);
    if (!previous) sourceMap.set(id, {...clone(source), checked: source.checked || source.checkedOn || review.checkedOn});
    return id;
  };
  const addSources = ids => unique(list(ids).map(addSource));
  const coreMappings = list(review.bsbaCoreMappings);
  const identities = new Map(list(review.sourceIdentities).map(identity => [identity.aceId, identity]));
  assert.equal(identities.size, review.sourceIdentities.length, 'Sophia source identities must be unique.');
  const equivalencies = [];

  for (const [receivingCode, aceId] of targets) {
    const row = byCode.get(canonical(receivingCode));
    assert(row && row.code === receivingCode && row.credits === 4, 'Exact current GCU receiving requirement is absent: ' + receivingCode);
    assert(!row.institutionalOnly, 'A university-only requirement cannot receive an outside option.');
    const identity = identities.get(aceId);
    assert(identity?.status === 'current-ace-identity-reviewed' && identity.activeOffering === true, 'Sophia identity has not been independently reviewed: ' + aceId);
    assert.equal(identity.sourceCredits, 3, 'Do not inflate Sophia source credits.');
    assert.equal(identity.sourceCreditSystem, 'semester');
    assert(typeof identity.sourceUpper === 'boolean', 'Original source division is required.');
    assert(identity.providerCourseCode && identity.title && /^https:\/\//.test(identity.courseUrl));
    assert(Number.isInteger(identity.aceVersion) && identity.aceVersion > 0);
    assertSourceDate(identity.recommendationStart, aceId + ' recommendation start');
    assertSourceDate(identity.recommendationEnd, aceId + ' recommendation end');
    assert(identity.recommendationStart <= review.checkedOn && identity.recommendationEnd >= review.checkedOn, 'The selected Sophia recommendation does not cover the reviewed current offering.');
    assert(list(identity.identitySourceIds).length && list(identity.recommendationPeriodSourceIds).length);

    const core = coreMappings.find(mapping => mapping.receivingCourseCode === receivingCode && mapping.aceId === aceId);
    const general = list(review.generalEducationMappingCandidates).find(mapping => mapping.aceId === aceId && list(mapping.receivingTargets).includes(receivingCode));
    const mapping = core || general;
    assert(mapping, 'No exact current GCU receiving-course mapping: ' + receivingCode + '/' + aceId);
    assert.equal(mapping.publishedTransferCredits, 3);
    assert.equal(mapping.sourceUpper, identity.sourceUpper, 'The receiving course number cannot change original source division.');
    if (core) {
      assert.equal(core.mappingStatus, 'published-exact-content-match');
      assert.equal(core.receivingNominalCourseCredits, 4);
      assert.equal(core.degreeCreditsToCount, 3);
      assert.equal(core.contentSatisfied, true);
    } else {
      assert.equal(general.mappingStatus, 'published-institution-partner-match');
      assert.equal(general.currentSourceIdentityStatus, 'reviewed');
      assert(['ENG-106', 'BIO-220'].includes(receivingCode), 'Generic category mappings need separate allocation research.');
      assert.equal(row.category, 'general');
    }
    assert(!mapping.additionalUnmetDesignationRisk, 'Retain native writing-intensive major coursework.');
    const mappingSources = addSources([mapping.partnerSourceId, core?.receivingRequirementSourceId, ...row.sourceIds].filter(Boolean));
    const identitySources = addSources(identity.identitySourceIds);
    const periodSources = addSources(identity.recommendationPeriodSourceIds);
    const accountingSources = addSources(core?.accountingPolicySourceIds || ['gcu-handbook-fall-2026-transfer', 'gcu-handbook-fall-2026-graduation']);
    const sourceIds = unique([...mappingSources, ...identitySources, ...periodSources, ...accountingSources]);
    const optionId = core?.id || 'gcu-bsba-' + canonical(receivingCode).toLowerCase() + '-' + aceId.toLowerCase();
    const option = {
      id: optionId, provider: 'Sophia', code: identity.providerCourseCode,
      codeType: 'provider-course-code', title: identity.title,
      aceId, providerCourseCode: identity.providerCourseCode,
      courseVersion: identity.aceVersion, version: identity.aceVersion,
      credits: 3, sourceCredits: 3, creditSystem: 'semester', sourceCreditSystem: 'semester',
      sourceCreditStatus: 'verified', creditOrigin: 'ace', upper: identity.sourceUpper, sourceUpper: identity.sourceUpper,
      receivingCode, receivingTitle: row.title,
      evidence: 'published', evidenceType: 'institution-provider-partner-agreement',
      sourceIds, identitySourceIds: identitySources,
      sourceCreditEvidence: {credits: 3, creditSystem: 'semester', sourceIds: identitySources},
      recommendationStart: identity.recommendationStart, recommendationEnd: identity.recommendationEnd,
      recommendationPeriodSourceIds: periodSources,
      mappingChecked: review.checkedOn, mappingReviewId: overlayId, mappingResearchClosed: true,
      receivingMapStatus: 'published-institution-partner',
      mappingScope: 'Current named GCU/Sophia partner equivalency joined to this independently sourced campus BSBA requirement. It satisfies content while awarding three actual semester credits; it does not award the native course’s four credits.',
      mappingEvidence: {
        schoolName: model.school, catalogYear: model.catalogYear,
        provider: 'Sophia', providerCourseCode: aceId, providerOrganizationCode: identity.providerCourseCode,
        courseVersion: identity.aceVersion, receivingCode, receivingTitle: row.title,
        credits: 3, creditSystem: 'semester', creditOrigin: 'ace',
        sourceIds: mappingSources, claimOrigin: 'institution-provider-partner-agreement',
        publisher: 'GCU / Sophia Learning', scope: 'university-course-equivalency', individualApproval: false,
      },
      degreePlacementEvidence: {
        modelId: model.id, schoolName: model.school, programName: model.title,
        requirementId: row.id, receivingCode, credits: 4, creditSystem: 'semester',
        sourceIds: addSources(row.sourceIds), scope: 'Exact native four-credit requirement independently identified in the current BSBA curriculum; the separate outside award remains three semester credits.',
      },
      codeAliases: unique([aceId, identity.providerCourseCode, identity.title]),
      codeAliasEvidence: unique([aceId, identity.providerCourseCode, identity.title]).map(alias => ({alias, sourceIds: identitySources, scope: 'Exact original Sophia course identity and reviewed current ACE version.'})),
      providerCoursePassingPercent: identity.minimumPassingScore,
      providerCoursePassingSourceIds: identitySources,
      url: identity.courseUrl,
      conditions: [
        'The current partner table publishes ' + receivingCode + ' as a named content match with three transfer semester credits. The native GCU course is four credits; a separately counted degree-credit balance keeps the proposed plan at 120.',
        'Use the source recommendation version for the actual completion date. Current reviewed period: ' + identity.recommendationStart + ' through ' + identity.recommendationEnd + '.',
        'The original source is ' + (identity.sourceUpper ? 'upper' : 'lower') + ' division. An upper-division receiving code does not change that credit level. Each original course completion counts once.',
        'Retain the applicable GCU residency, general education minimums, upper-major credit floor, writing-intensive courses and original-source transcript requirements.',
      ],
    };
    for (const key of ['primaryListingId', 'providerCourseRecordId', 'providerIdentityReviewedOn', 'providerIdentityReviewPath']) if (identity[key] !== undefined) option[key] = clone(identity[key]);
    const syllabusUrl = identity.currentLinkedSyllabus || identity.syllabusUrl;
    if (syllabusUrl) option.providerSyllabusUrl = syllabusUrl;
    if (identity.syllabusSHA256) option.providerSyllabusSHA256 = identity.syllabusSHA256;
    row.options = row.options.filter(existing => existing.id !== optionId);
    row.options.push(option);
    equivalencies.push({
      requirementId: row.id, nativeCredits: 4, awardedCredits: 3,
      options: [{optionId, provider: 'Sophia', code: identity.providerCourseCode, sourceCredits: 3, sourceCreditSystem: 'semester', sourceIds: mappingSources}],
    });
  }

  // Only these three distinct current university identities are available as
  // derived balance coursework. No repeatable or fictitious zero-credit course
  // is introduced: the zero is the native-ledger allocation, not its award.
  const nativePolicy = rawModel.degreeCreditBalancePolicy;
  const candidates = new Map(list(nativePolicy?.courseIdentityCandidates).map(course => [course.code, course]));
  const policySourceIds = addSources(unique([
    ...list(nativePolicy.sourceIds),
    ...list(model.policyEvidence?.institutionMinCredits?.sourceIds),
    ...list(model.writingIntensiveRule?.sourceIds),
  ]));
  const balanceRows = balanceCodes.map((code, index) => {
    const candidate = candidates.get(code);
    assert(candidate && candidate.credits === index + 1 && candidate.creditSystem === 'semester' && candidate.upper === true, 'Current exact Service Learning course identity is required: ' + code);
    const id = balanceId(code), sourceIds = addSources([...candidate.sourceIds, ...policySourceIds]);
    return {
      id, code, title: candidate.title, credits: 0, category: 'elective',
      group: 'gcu-credit-balance', subgroup: 'gcu-credit-balance',
      institutionalOnly: true, upper: true, sourceIds,
      notes: 'Optional derived coursework used only when actual transfer credits leave a degree-credit shortfall. This university course awards ' + candidate.credits + ' real semester credit' + (candidate.credits === 1 ? '' : 's') + '; it is counted once and cannot repair a general education minimum.',
      options: [{
        id: 'university-' + id, provider: 'University', code, title: candidate.title,
        credits: candidate.credits, sourceCredits: candidate.credits,
        creditSystem: 'semester', sourceCreditSystem: 'semester',
        creditOrigin: 'institutional', upper: true, evidence: 'published', sourceIds,
        url: sourceMap.get(candidate.sourceIds[0]).url,
      }],
    };
  });
  model.requirements = [...nativeRows, ...balanceRows];
  model.degreeCreditBalancePolicy = {
    ...clone(nativePolicy), enabled: true, kind: 'gcu-earned-credit-balance-v1',
    creditSystem: 'semester', minimumDegreeCredits: 120, maxBalanceCredits: 6,
    sourceIds: policySourceIds, writingIntensiveRequirementIds: ['bus340', 'bus485'],
    equivalencies, balanceRequirementIds: balanceRows.map(row => row.id),
  };
  model.curriculumSections = list(model.curriculumSections).filter(section => section.id !== 'gcu-credit-balance');
  model.curriculumSections.push({id: 'gcu-credit-balance', title: 'Degree Credit Balance', parentId: 'elective', requirementIds: balanceRows.map(row => row.id), sourceId: policySourceIds[0]});
  model.sources = [...sourceMap.values()];
  model.defaultProviders = unique([...list(model.defaultProviders), 'Sophia']);
  model.evidenceCheckedOn = review.checkedOn;
  model.completeExecutablePathway = false;
  model.coverageLabel = 'Complete campus BSBA requirements with seven exact current Sophia content options, actual earned-credit accounting and separately counted GCU credit-balance coursework.';
  const notes = [
    'Each reviewed Sophia content option counts three actual semester credits against a four-credit native requirement. The proposed plan independently balances earned credits to at least 120.',
    'BUS-340 and BUS-485 remain native writing-intensive major courses. Available outside options are choices; residency, category minima, upper-major credits and the six-credit unique Service Learning pool constrain the selected mix.',
  ];
  model.rulesNotes = unique([...list(model.rulesNotes), ...notes]);
  assert.equal(model.requirements.reduce((sum, row) => sum + row.credits, 0), 120);
  assert.equal(model.requirements.length, 33);
  assert.equal(new Set(model.requirements.map(row => row.id)).size, 33);
  return model;
}
