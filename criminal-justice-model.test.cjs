const assert = require('node:assert/strict');
const test = require('node:test');
const Planner = require('./dist/planner.js');

const models = ['residential', 'online'].map(mode => ({
  mode,
  program: require('./dist/data/liberty-criminal-justice-' + mode + '.json'),
  external: mode === 'residential' ? 74 : 72,
  general: mode === 'residential' ? 40 : 39,
  elective: mode === 'residential' ? 35 : 36
}));
const input = { providers: ['Sophia', 'Study.com', 'CLEP', 'StraighterLine'], allowConditional: true, priority: 'transfer' };

for (const {mode, program, external, general, elective} of models) {
  const requirement = code => program.requirements.find(row => row.code === code);
  test(mode + ': a real 120-credit general Criminal Justice ledger counts GOVT 220 once', () => {
    assert.equal(program.totalCredits, 120);
    assert.equal(program.requirements.reduce((sum, row) => sum + row.credits, 0), 120);
    assert.equal(new Set(program.requirements.map(row => row.id)).size, program.requirements.length);
    assert.equal(new Set(program.requirements.map(row => row.code)).size, program.requirements.length);
    const credits = category => program.requirements.filter(row => row.category === category).reduce((sum, row) => sum + row.credits, 0);
    assert.equal(credits('general'), general);
    assert.equal(credits('major'), 45);
    assert.equal(credits('elective'), elective);
    assert.equal(requirement('GOVT 220').category, 'major');
    assert.deepEqual(program.overlaps, [{requirementId: 'govt-220', alsoSatisfies: 'Cultural studies elective', creditsCountedOnce: 3}]);
    assert.equal(program.requirements.filter(row => row.upper).reduce((sum, row) => sum + row.credits, 0), 30);
  });

  test(mode + ': generated plan preserves credit, university and upper-level rules', () => {
    const plan = Planner.generate(program, input);
    assert.equal(plan.rows.length, program.requirements.length);
    assert.equal(plan.totals.accounted, 120);
    assert.equal(plan.totals.external, external);
    assert.equal(plan.totals.institutional, 120 - external);
    assert.equal(plan.coverage.researchGapCredits, 120 - external);
    assert.equal(plan.coverage.requiredUniversityCredits, 0, 'unmapped does not establish university-only status');
    assert.equal(plan.validation.academicCountsValid, true);
    assert(plan.totals.institutional >= 30);
    assert(plan.totals.majorInstitutional >= 12);
    assert.equal(plan.totals.upper, 30);
    assert(plan.totals.external <= 90);
    const actions = plan.rows.filter(row => row.option.provider !== 'University').map(row => row.option.provider + ':' + row.option.code);
    assert.equal(new Set(actions).size, actions.length, 'one outside course must not be purchased or counted twice');
    assert.equal(plan.readiness, 'draft');
    assert.equal(plan.validation.valid, false, 'individual applicability and remaining research are unresolved');
    assert.equal(program.completeExecutablePathway, false);
    assert.equal(plan.costs.total, null, 'no total degree price from a subscription-month assumption');
    assert.equal(plan.timing.estimatedWeeks, null, 'no verified completion date');
  });

  test(mode + ': exact Criminal Justice awards are supported and misleading title matches are excluded', () => {
    const codes = code => requirement(code).options.filter(option => option.provider !== 'University').map(option => option.code).sort();
    assert.deepEqual(codes('CJUS 200'), ['OOSL-0004', 'SDCM-0067', 'SOPH-0090']);
    assert.deepEqual(codes('CJUS 230'), ['SDCM-0177']);
    assert.deepEqual(codes('CJUS 310'), ['SDCM-0128']);
    assert.deepEqual(codes('CJUS 340'), []);
    assert.deepEqual(codes('CJUS 400'), []);
    for (const code of ['CJUS 231', 'CJUS 300', 'CJUS 320', 'CJUS 330', 'CJUS 340', 'CJUS 350', 'CJUS 400', 'CJUS 410', 'CJUS 420', 'GOVT 480', 'GOVT 200']) {
      assert.equal(requirement(code).institutionalOnly, false, code + ' has a research gap, not a confirmed residency mandate');
    }
    assert.equal(requirement('CJUS 310').options.find(option => option.code === 'SDCM-0128').upper, true);
    assert(!program.requirements.flatMap(row => row.options).some(option => ['SOPH-0084', 'SDCM-0125', 'SDCM-0127'].includes(option.code)));
  });

  test(mode + ': course sources and major prerequisites refer to this degree and delivery', () => {
    const sourceIds = new Set(program.sources.map(source => source.id));
    const ids = new Set(program.requirements.map(row => row.id));
    for (const row of program.requirements) {
      for (const id of row.prerequisites || []) assert(ids.has(id), row.code + ' prerequisite is in the ledger');
      for (const option of row.options) {
        assert(option.sourceIds.every(id => sourceIds.has(id)));
        assert.equal(option.credits, row.credits);
        if (option.provider === 'University') assert(option.url.startsWith('https://catalog.liberty.edu/undergraduate/'));
        else {
          assert.equal(option.receivingCode, row.code);
          if(option.provider==='CLEP'&&option.mappingReviewId==='liberty-official-2026-11-10'){
            assert.equal(option.sourceCredits,undefined,'a receiving award does not establish independent source exam credits');
            assert.equal(option.sourceCreditSystem,undefined);
            assert.equal(option.minScore,50);
          }else if(option.id==='liberty-cli-ecn-301-to-econ-213'){
            assert.equal(option.provider,'Christian Leaders Institute');
            assert.equal(option.code,'ECN 301');
            assert.equal(option.sourceCreditStatus,'unknown');
            assert.equal(option.sourceCredits,undefined,'the receiving award must not fill an unknown original source quantity');
            assert.equal(option.sourceCreditSystem,undefined,'the provider lists credits without an established original unit');
            assert.equal(option.providerListedCreditQuantity,3);
            assert.equal(option.providerListedCreditUnit,'credits');
            assert.deepEqual(option.calculatorAwardRange,{low:3,high:3});
            assert(option.sourceIds.includes('liberty-cli-calculator-current'));
            assert(option.identitySourceIds.length>0&&option.identitySourceIds.every(id=>sourceIds.has(id)));
            assert.equal(option.creditOrigin,'institutional');
            assert.equal(option.evidence,'conditional');
            assert.equal(option.preapprovalRequired,true);
            assert.equal(option.issuerReview.creditRoute,'cli-academic-transcript');
            assert.equal(option.issuerReview.freeLearningAloneIsCredit,false);
          }else assert.equal(option.sourceCredits,row.credits);
          assert(!/business-administration/.test(option.url));
        }
      }
    }
    assert.deepEqual(requirement('CJUS 300').prerequisites, ['cjus-200', 'cjus-230']);
    assert.deepEqual(requirement('CJUS 310').prerequisites, mode === 'residential' ? ['cjus-200'] : ['cjus-200', 'cjus-230']);
    assert.deepEqual(requirement('GOVT 220').prerequisites, ['govt-200']);
    assert.deepEqual(requirement('GOVT 480').prerequisites, ['govt-200']);
    assert.match(requirement('CJUS 400').prerequisiteNotes, /GOVT 346/);
    assert.match(requirement('CJUS 420').prerequisiteNotes, /fall-semester/);
    assert(program.sources.find(source => source.id === 'degree').url.endsWith(mode === 'residential' ? '/criminal-justice-resident/' : '/criminal-justice-online/'));
    for (const id of ['sophia', 'study', 'straighterline']) assert(program.sources.find(source => source.id === id).url.includes('/' + mode + '/'));
  });

  test(mode + ': a StraighterLine-only preference still builds a whole ledger without treating unknowns as free', () => {
    const plan = Planner.generate(program, {...input, providers: ['StraighterLine']});
    assert.equal(plan.totals.accounted, 120);
    assert.equal(plan.validation.academicCountsValid, true);
    assert.equal(plan.costs.total, null);
    assert(plan.rows.some(row => row.code === 'CJUS 200' && row.option.provider === 'StraighterLine'));
    assert(plan.blockers.some(blocker => blocker.code === 'conditional_mapping'));
  });
}

test('delivery-specific gen-ed requirements and conservative exemptions stay separate', () => {
  const residential = models[0].program, online = models[1].program;
  assert(residential.requirements.some(row => row.code === 'INFT 110' && row.credits === 3));
  assert(residential.requirements.some(row => row.code === 'UNIV 101' && row.credits === 1));
  assert(!online.requirements.some(row => row.code === 'ENVR 215'));
  assert(online.requirements.some(row => row.code === 'BIOL 102' && row.category === 'general'));
  assert(online.requirements.some(row => row.code === 'BIOL 101' && row.category === 'elective'));
  assert(online.requirements.some(row => row.code === 'UNIV 104' && row.credits === 3));
  assert(!online.requirements.some(row => row.credits === 1));
  assert.deepEqual(residential.requirements.filter(row => row.credits === 1 && row.category === 'elective').map(row => row.options.find(option => option.provider === 'Sophia').code), ['SOPH-0021', 'SOPH-0041']);
  assert.equal(residential.transferWaiverVariant, undefined);
  assert.equal(online.transferWaiverVariant, undefined);
  assert.equal(residential.majorResidencyBasisCredits, 45);
  assert.equal(online.majorResidencyBasisCredits, 45);
  assert.equal(residential.majorMinInstitutionCredits, 12);
  assert.equal(online.majorMinInstitutionCredits, 12);
  assert.match(online.sources.find(source => source.id === 'sophia').title, /2026-07/);
});
