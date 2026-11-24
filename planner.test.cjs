const assert = require('node:assert/strict');
const fs = require('node:fs');
const Planner = require('./dist/planner.js');
const clone = value => JSON.parse(JSON.stringify(value));
function requirement(id, overrides = {}) {
  return Object.assign({ id, code: id.toUpperCase(), title: id, credits: 3, category: 'major', upper: true, options: [
    { id: 'u-' + id, provider: 'University', title: id, code: id, credits: 3, upper: true, sourceIds: ['catalog'], evidence: 'published' },
    { id: 's-' + id, provider: 'Sophia', title: id, code: 'SOPH-' + id, credits: 3, upper: true, sourceIds: ['mapping'], evidence: 'published' }
  ] }, overrides);
}
function program(requirements, overrides = {}) {
  return Object.assign({ id: 'test', title: 'Test degree', format: 'Online', catalog: '2026', totalCredits: requirements.length * 3, institutionMinCredits: 3, majorMinInstitutionCredits: 3, upperMinCredits: 3, sources: [{ id: 'catalog' }, { id: 'mapping' }], requirements, unresolved: [] }, overrides);
}
const defaults = { priority: 'cost', providers: ['Sophia', 'Study.com', 'CLEP'], providerMonths: { Sophia: 1, 'Study.com': 1 }, universityRate: 300, fees: 0 };
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
test('reserves institution and major residency while sharing one subscription', () => {
  const p = program([requirement('a'), requirement('b'), requirement('c'), requirement('d')], { institutionMinCredits: 6, majorMinInstitutionCredits: 6 });
  const plan = Planner.generate(p, defaults);
  assert.equal(plan.totals.accounted, 12); assert.equal(plan.totals.institutional, 6); assert.equal(plan.totals.majorInstitutional, 6);
  assert.equal(plan.costs.providerCosts.filter(p => p.provider === 'Sophia').length, 1); assert.equal(plan.costs.providerCosts[0].amount, 99);
});
test('source-type cap is enforced separately from overall transfer cap', () => {
  const p = program([requirement('a'), requirement('b'), requirement('c'), requirement('d')], { alternativeMaxCredits: 3, externalMaxCredits: 9 });
  const plan = Planner.generate(p, defaults); assert.equal(plan.totals.alternative, 3); assert.equal(plan.totals.institutional, 9);
});
test('upper-level credit must be retained and not inferred from source number', () => {
  const reqs = [requirement('a'), requirement('b')]; reqs[0].options[1].upper = false; reqs[1].options[1].upper = false;
  const plan = Planner.generate(program(reqs, { upperMinCredits: 6 }), defaults);
  assert.equal(plan.totals.upper, 6); assert.equal(plan.totals.external, 0);
});
test('university-only requirements cannot use external learning', () => {
  const p = program([requirement('a', { institutionalOnly: true }), requirement('b')]); const plan = Planner.generate(p, defaults);
  assert.equal(plan.rows[0].option.provider, 'University');
  const altered = clone(plan); altered.rows[0].option = p.requirements[0].options[1]; altered.rows[0].institutional = false;
  assert(Planner.validate(p, altered).errors.some(e => e.code === 'institution_only'));
});
test('reported prior learning is tentative and never schedules an immediate repurchase', () => {
  const p = program([requirement('a'), requirement('b')]);
  const plan = Planner.generate(p, { ...defaults, completed: [{ requirementId: 'a', status: 'reported' }] });
  assert.equal(plan.totals.reported, 3); assert.equal(plan.totals.confirmed, 0); assert.equal(plan.rows[0].status, 'reported');
  assert(plan.blockers.some(e => e.code === 'reported_credit')); assert(!plan.nextActions.some(x => /^(?:Start:|After approval:)/.test(x) && x.includes(' → A.')));
});
test('confirmed credits apply once and duplicate inputs do not create credits', () => {
  const p = program([requirement('a'), requirement('b')]);
  const plan = Planner.generate(p, { ...defaults, completed: [{ requirementId: 'a', optionId: 's-a', status: 'confirmed' }, { requirementId: 'a', optionId: 's-a', status: 'confirmed' }] });
  assert.equal(plan.totals.confirmed, 3); assert.equal(plan.totals.accounted, 6); assert.equal(plan.totals.institutional, 3); assert(plan.warnings.length);
});
test('duplicate external learning cannot fill two unrelated requirements', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')]; reqs[1].options[1].code = reqs[0].options[1].code;
  const plan = Planner.generate(program(reqs, { institutionMinCredits: 0, majorMinInstitutionCredits: 0 }), defaults);
  const chosen = plan.rows.filter(r => r.option.provider === 'Sophia').map(r => r.option.code);
  assert.equal(chosen.length, new Set(chosen).size);
});
test('conditional and unsourced mappings are excluded by default', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')]; reqs[0].options[1].evidence = 'conditional'; reqs[1].options[1].sourceIds = ['missing'];
  const p = program(reqs); const plan = Planner.generate(p, defaults);
  assert.equal(plan.rows[0].option.provider, 'University'); assert.equal(plan.rows[1].option.provider, 'University');
  const conditional = Planner.generate(p, { ...defaults, allowConditional: true }); assert(conditional.blockers.some(e => e.code === 'conditional_mapping'));
});
test('quarter credits require explicit normalization', () => {
  const reqs = [requirement('a'), requirement('b')]; reqs[0].options[1].creditSystem = 'quarter';
  const p = program(reqs); assert.equal(Planner.generate(p, defaults).rows[0].option.provider, 'University');
  assert(Planner.generate(p, { ...defaults, completed: [{ requirementId: 'a', status: 'confirmed', creditSystem: 'quarter' }] }).blockers.some(e => e.code === 'credit_system'));
});
test('unknown school tuition, fees, taxes and timing remain explicitly unknown', () => {
  const p = program([requirement('a'), requirement('b')]); const plan = Planner.generate(p, { ...defaults, universityRate: 0 });
  assert.equal(plan.costs.total, null); assert.equal(plan.costs.universityTuition, null); assert.equal(plan.costs.costComplete, false); assert.equal(plan.timing.estimatedWeeks, null);
});
test('generic electives and program conflicts prevent review-ready label', () => {
  const p = program([requirement('a', { selectionRequired: true }), requirement('b')], { unresolved: ['Institution source conflict'] });
  const plan = Planner.generate(p, defaults); assert.equal(plan.readiness, 'draft'); assert(plan.blockers.some(e => e.code === 'selection_required')); assert(plan.blockers.some(e => e.code === 'program_research'));
});
test('validator rejects a fabricated course option even if its credits balance', () => {
  const p = program([requirement('a'), requirement('b')]); const plan = Planner.generate(p, defaults);
  plan.rows[0].option.id = 'invented-mapping';
  assert(Planner.validate(p, plan).errors.some(e => e.code === 'unsupported_option'));
});
test('bundled exam allocates credit across two rows and charges once', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')];
  for (const req of reqs.slice(0, 2)) req.options[1] = { id: 'bundle-' + req.id, provider: 'CLEP', title: 'Composition', code: 'CLEP-0040', credits: 3, upper: true, sourceIds: ['mapping'], evidence: 'published', bundleId: 'composition', bundleCredits: 6 };
  const p = program(reqs); const plan = Planner.generate(p, { ...defaults, providers: ['CLEP'] });
  assert.equal(plan.totals.external, 6); assert.equal(plan.costs.providerCosts[0].exams, 1); assert.equal(plan.costs.providerCosts[0].amount, 97);
});
test('shared subscription can beat university only after multiple courses', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')]; reqs.forEach(req => req.options[1].provider = 'Study.com');
  const plan = Planner.generate(program(reqs), { ...defaults, universityRate: 40, providers: ['Study.com'] });
  assert.equal(plan.totals.external, 6); assert.equal(plan.costs.knownSubtotal, 355);
});
test('unissued Modern States voucher does not erase exam fees', () => {
  const reqs = [requirement('a'), requirement('b')]; reqs[0].options[1].provider = 'CLEP';
  const p = program(reqs); const plan = Planner.generate(p, { ...defaults, providers: ['CLEP'], modernStates: true });
  assert.equal(plan.costs.providerCosts[0].amount, 97); assert(plan.costs.missing.some(s => s.includes('voucher')));
});
test('upper-level group minimum is independent of the overall minimum', () => {
  const reqs = [requirement('a', { subgroup: 'concentration' }), requirement('b'), requirement('c')]; reqs[0].options[1].upper = false;
  const p = program(reqs, { upperGroupMinimums: [{ group: 'concentration', credits: 3 }] });
  assert.equal(Planner.generate(p, defaults).rows[0].option.provider, 'University');
});
test('institutional steps follow modeled prerequisites without fabricated dates', () => {
  const reqs = [requirement('advanced', { prerequisites: ['foundation'], institutionalOnly: true }), requirement('foundation', { institutionalOnly: true })];
  const plan = Planner.generate(program(reqs), defaults);
  assert.equal(plan.sequence[0].requirementIds[0], 'foundation'); assert.equal(plan.sequence[1].requirementIds[0], 'advanced');
  assert.equal(plan.sequence[1].timingVerified, false);
});
test('available program datasets reconcile credit totals and preserve constraints', () => {
  for (const file of ['liberty', 'tesu']) {
    if (!fs.existsSync('./dist/data/' + file + '.json')) continue;
    const p = JSON.parse(fs.readFileSync('./dist/data/' + file + '.json'));
    for (const allowConditional of [false, true]) {
      const plan = Planner.generate(p, { ...defaults, allowConditional });
      assert.equal(plan.totals.accounted, 120, file); assert(plan.totals.institutional >= p.institutionMinCredits, file); assert(plan.totals.upper >= p.upperMinCredits, file); assert(plan.validation.academicCountsValid, file + JSON.stringify(plan.validation.errors));
      assert.equal(plan.readiness, file === 'liberty' ? 'review-ready' : 'draft', file);
      assert.equal(plan.totals.confirmed, 0, 'a reviewed proposed route does not award personal credit');
    }
  }
});
test('a completed bundled exam is evaluated for its other award, not repurchased', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')];
  for (const req of reqs.slice(0, 2)) req.options[1] = { id: 'bundle-' + req.id, provider: 'CLEP', title: 'Composition', code: 'CLEP-0040', credits: 3, upper: true, sourceIds: ['mapping'], evidence: 'published', bundleId: 'composition', bundleCredits: 6 };
  const plan = Planner.generate(program(reqs), { ...defaults, providers: ['CLEP'], completed: [{ requirementId: 'a', optionId: 'bundle-a', status: 'confirmed' }] });
  assert.equal(plan.rows[1].status, 'reported');
  assert.equal(plan.totals.confirmed, 3); assert.equal(plan.totals.reported, 3);
  assert(!plan.costs.providerCosts.some(cost => cost.provider === 'CLEP'));
  assert(!plan.nextActions.some(action => /^(?:Start:|After approval:)/.test(action) && action.includes('Composition')));
});
test('existing external actions cannot be purchased again for a different unrelated requirement', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('c')]; reqs[1].options[1].code = reqs[0].options[1].code;
  const p = program(reqs); const plan = Planner.generate(p, { ...defaults, completed: [{ requirementId: 'a', optionId: 's-a', status: 'confirmed' }] });
  assert.equal(plan.rows[1].option.provider, 'University');
  assert.equal(plan.validation.academicCountsValid, true);
});
test('unknown prior provenance reserves alternative-credit capacity and requires review', () => {
  const p = program([requirement('a'), requirement('b'), requirement('c')], { alternativeMaxCredits: 3 });
  const plan = Planner.generate(p, { ...defaults, completed: [{ requirementId: 'a', status: 'confirmed' }] });
  assert.equal(plan.totals.alternative, 3);
  assert.equal(plan.rows[1].option.provider, 'University');
  assert(plan.blockers.some(error => error.code === 'unknown_provenance'));
});
test('validator detects altered mapping level, evidence and requirement classification', () => {
  const p = program([requirement('a'), requirement('b')]); const plan = Planner.generate(p, defaults);
  plan.rows[0].option.upper = false; plan.rows[0].upper = false;
  plan.rows[0].option.sourceIds = ['invented']; plan.rows[0].category = 'elective';
  const errors = Planner.validate(p, plan).errors;
  assert(errors.some(error => error.code === 'mapping_tampered'));
  assert(errors.some(error => error.code === 'requirement_classification'));
});
test('validator rejects unknown status and missing requirements even when totals are forged', () => {
  const p = program([requirement('a'), requirement('b')]); const plan = Planner.generate(p, defaults);
  plan.rows[0].status = 'complete'; plan.rows.pop();
  const errors = Planner.validate(p, plan).errors;
  assert(errors.some(error => error.code === 'invalid_status'));
  assert(errors.some(error => error.code === 'ledger_shape'));
});
test('actual Liberty draft selects all three providers while preserving residency', () => {
  const p = JSON.parse(fs.readFileSync('./dist/data/liberty.json'));
  const plan = Planner.generate(p, { ...defaults, providerMonths: { Sophia: 2, 'Study.com': 1 } });
  assert.deepEqual(new Set(plan.rows.filter(row => row.option.provider !== 'University').map(row => row.option.provider)), new Set(['Sophia', 'Study.com', 'CLEP']));
  assert.equal(plan.rows.find(row => row.code === 'ACCT 211').option.provider, 'CLEP');
  assert.equal(plan.rows.find(row => row.code === 'BUSI 330').option.provider, 'Sophia');
  assert.equal(plan.rows.find(row => row.code === 'BUSI 342').option.provider, 'Study.com');
  assert(plan.totals.institutional >= 30); assert(plan.totals.majorInstitutional >= 18); assert(plan.totals.upper >= 30);
});
test('comparison exposes transfer, speed and cost as the student route choices', () => {
  const p = program([requirement('a'), requirement('b')]);
  const routes = Planner.compare(p, defaults);
  assert.deepEqual(routes.map(route => route.priority), ['transfer', 'speed', 'cost']);
  assert.equal(routes[1].label, 'Speed-focused route');
});
test('speed selects a faster exam route even when the shared course subscription is cheaper', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('capstone', { institutionalOnly: true })];
  for (const req of reqs.slice(0, 2)) req.options.push({ ...req.options[1], id: 'c-' + req.id, provider: 'CLEP', code: 'CLEP-' + req.id });
  const p = program(reqs), timing = { externalWeeks: { Sophia: 6, CLEP: 1 }, externalConcurrency: 1, universityTermWeeks: 8, universityCreditsPerTerm: 3 };
  const cost = Planner.generate(p, { ...defaults, timing, priority: 'cost', providers: ['Sophia', 'CLEP'] });
  const speed = Planner.generate(p, { ...defaults, timing, priority: 'speed', providers: ['Sophia', 'CLEP'] });
  assert.equal(cost.rows[0].option.provider, 'Sophia');
  assert.equal(speed.rows[0].option.provider, 'CLEP');
  assert.equal(speed.rows[1].option.provider, 'CLEP');
  assert.equal(speed.timing.scenarioWeeks, 10);
  assert.equal(speed.timing.basis, 'user-estimates');
  assert(speed.costs.modeledSubtotal > cost.costs.modeledSubtotal);
  assert(speed.timing.scenarioWeeks < cost.timing.scenarioWeeks);
  const changedQuote = Planner.generate(p, { ...defaults, universityRate: 1, timing, priority: 'speed', providers: ['Sophia', 'CLEP'] });
  assert.deepEqual(changedQuote.rows.map(row => row.option.provider), speed.rows.map(row => row.option.provider));
});
test('speed without time estimates uses workload rather than a cheap university tuition quote', () => {
  const p = program([requirement('a'), requirement('b'), requirement('capstone', { institutionalOnly: true })]);
  const cheap = Planner.generate(p, { ...defaults, universityRate: 1, priority: 'cost' });
  const speed = Planner.generate(p, { ...defaults, universityRate: 1, priority: 'speed' });
  assert.equal(cheap.totals.institutional, 9);
  assert.equal(speed.totals.institutional, 3);
  assert.equal(speed.timing.scenarioWeeks, null);
  assert.equal(speed.timing.estimatedWeeks, null);
  assert.equal(speed.timing.basis, 'workload-proxy');
});
test('timing counts a bundled exam once and completed learning requires no repeat time', () => {
  const reqs = [requirement('a'), requirement('b'), requirement('capstone', { institutionalOnly: true })];
  for (const req of reqs.slice(0, 2)) req.options[1] = { id: 'bundle-' + req.id, provider: 'CLEP', title: 'Composition', code: 'CLEP-0040', credits: 3, upper: true, sourceIds: ['mapping'], evidence: 'published', bundleId: 'composition', bundleCredits: 6 };
  const p = program(reqs), timing = { externalWeeks: { CLEP: 2 }, externalConcurrency: 1, universityTermWeeks: 8, universityCreditsPerTerm: 3 };
  const planned = Planner.generate(p, { ...defaults, providers: ['CLEP'], timing, priority: 'speed' });
  assert.equal(planned.timing.externalActions, 1); assert.equal(planned.timing.externalWeeks, 2); assert.equal(planned.timing.scenarioWeeks, 10);
  const earned = Planner.generate(p, { ...defaults, providers: ['CLEP'], timing, priority: 'speed', completed: [{ requirementId: 'a', optionId: 'bundle-a', status: 'confirmed' }] });
  assert.equal(earned.timing.externalActions, 0); assert.equal(earned.timing.externalWeeks, 0); assert.equal(earned.timing.scenarioWeeks, 8);
  assert.equal(earned.rows[1].status, 'reported');
});
test('university timing respects prerequisite term boundaries rather than credits alone', () => {
  const reqs = [requirement('advanced', { institutionalOnly: true, prerequisites: ['foundation'] }), requirement('foundation', { institutionalOnly: true })];
  const p = program(reqs), timing = { externalWeeks: {}, universityTermWeeks: 8, universityCreditsPerTerm: 6 };
  const plan = Planner.generate(p, { ...defaults, timing, priority: 'speed' });
  assert.equal(plan.timing.universityTerms, 2); assert.equal(plan.timing.scenarioWeeks, 16);
  assert.equal(plan.timing.verified, false);
});
test('missing prerequisites or an impossible load prevent a numerical timing claim', () => {
  const p = program([requirement('a', { institutionalOnly: true, prerequisites: ['not-modeled'] })]);
  const input = { ...defaults, priority: 'speed', timing: { universityTermWeeks: 8, universityCreditsPerTerm: 3 } };
  const missing = Planner.generate(p, input);
  assert.equal(missing.timing.scenarioWeeks, null);
  assert(missing.timing.missing.some(item => item.includes('missing dependency')));
  const tooSmall = Planner.generate(p, { ...input, timing: { universityTermWeeks: 8, universityCreditsPerTerm: 2 } });
  assert.equal(tooSmall.timing.scenarioWeeks, null);
  assert(tooSmall.timing.missing.some(item => item.includes('largest planned course')));
});
test('speed timing retains residency, upper-level rules and the reviewed Liberty baseline', () => {
  const p = JSON.parse(fs.readFileSync('./dist/data/liberty.json'));
  const speed = Planner.generate(p, { ...defaults, priority: 'speed', timing: { externalWeeks: { Sophia: 2, 'Study.com': 3, CLEP: 1 }, externalConcurrency: 2, universityTermWeeks: 16, universityCreditsPerTerm: 15 } });
  assert(speed.validation.academicCountsValid); assert(speed.totals.institutional >= 30); assert(speed.totals.majorInstitutional >= 18); assert(speed.totals.upper >= 30);
  assert(speed.timing.scenarioWeeks > 0); assert.equal(speed.readiness, 'review-ready');
  assert.equal(speed.validation.valid,true);assert.equal(speed.blockers.length,0);
  assert.equal(speed.totals.external,83);assert.equal(speed.totals.institutional,37);
  assert(speed.rows.every(row=>row.option.evidence==='published'),'the reviewed baseline does not approve conditional awards');
  assert.equal(speed.totals.confirmed,0,'a proposed baseline does not award personal credit');
});
test('default transfer priority preserves outside credit even when university tuition is cheaper', () => {
  const p = program([requirement('a'), requirement('b'), requirement('c')]);
  const plan = Planner.generate(p, { providers: ['Sophia'], universityRate: 1 });
  assert.equal(plan.priority, 'transfer'); assert.equal(plan.label, 'Most transfer credit');
  assert.equal(plan.totals.external, 6); assert.equal(plan.totals.institutional, 3);
});
test('coverage distinguishes missing mappings, reserved residency and real university-only rules', () => {
  const reqs = [requirement('school', { institutionalOnly: true }), requirement('unknown'), requirement('reserved'), requirement('outside')];
  reqs[1].options = reqs[1].options.filter(option => option.provider === 'University');
  const p = program(reqs, { institutionMinCredits: 9, majorMinInstitutionCredits: 3 });
  const plan = Planner.generate(p, { ...defaults, priority: 'transfer' });
  assert.equal(plan.coverage.requiredUniversityCredits, 3);
  assert.equal(plan.coverage.researchGapCredits, 3);
  assert.equal(plan.coverage.reservedUniversityCredits, 3);
  assert.equal(plan.coverage.mappedExternalCredits, 3);
  assert.equal(plan.rows.find(row => row.requirementId === 'unknown').placementReason, 'research-gap');
  assert(!plan.nextActions.slice(0, 3).some(action => action.startsWith('Resolve the')));
});
test('conditional excluded mappings are a coverage gap, not mandatory school coursework', () => {
  const reqs = [requirement('a'), requirement('b')]; reqs[0].options[1].evidence = 'conditional';
  const plan = Planner.generate(program(reqs), { ...defaults, priority: 'transfer' });
  assert.equal(plan.rows[0].placementReason, 'conditional-gap');
  assert.equal(plan.coverage.conditionalGapCredits, 3);
  const included = Planner.generate(program(reqs), { ...defaults, priority: 'transfer', allowConditional: true });
  assert.equal(included.coverage.conditionalExternalCredits, 3);
  const research=included.blockers.find(issue=>issue.code==='conditional_mapping');
  assert.equal(research.owner,'DegreePath','conditional source research stays with the platform');
  assert.equal(research.requirementId,'a');
  assert.equal(research.provider,'Sophia');
  assert.match(included.nextActions[0],/reviewing the documented conditions/);
  assert(!included.nextActions.some(action=>action.startsWith('Start: Sophia — a → A.')));
  assert(included.nextActions.some(action=>action.startsWith('After approval: Sophia — a → A.')));
});
test('documented planned transfers have course actions while real conditional options retain their checks', () => {
  const p=program([requirement('documented'),requirement('reserved')]);
  const published=Planner.generate(p,{...defaults,optionSelections:{documented:'s-documented'}});
  const row=published.rows.find(row=>row.requirementId==='documented');
  assert.equal(row.option.evidence,'published');
  assert(published.nextActions.some(action=>action.startsWith('Start: ')&&action.includes(row.option.title)));
  assert(!published.validation.warnings.some(message=>message.includes(row.option.title)));
  assert(published.nextActions.some(action=>action.includes('official transcripts')));
  assert(!published.nextActions.some(action=>action.includes('written confirmation of individual applicability')));
  const conditionalProgram=clone(p);conditionalProgram.requirements[0].options.find(option=>option.provider==='Sophia').evidence='conditional';
  const conditional=Planner.generate(conditionalProgram,{...defaults,allowConditional:true,optionSelections:{documented:'s-documented'}});
  assert(conditional.validation.errors.some(issue=>issue.code==='conditional_mapping'));
  assert(conditional.validation.warnings.some(message=>message.includes('documented conditions')));
  assert(!conditional.nextActions.some(action=>action.startsWith('Start: ')&&action.includes(row.option.title)));
});
test('TESU provider-only coverage respects 90 alternative credits rather than 105 total transfer', () => {
  const p = JSON.parse(fs.readFileSync('./dist/data/tesu.json'));
  const plan = Planner.generate(p, { ...defaults, priority: 'transfer', allowConditional: true });
  assert.equal(plan.coverage.publishedInstitutionMinimum, 15);
  assert.equal(plan.coverage.sourceCeiling, 90);
  assert.equal(plan.coverage.unmappedToCeiling, Math.max(0, 90 - plan.coverage.mappedExternalCredits));
  assert(plan.coverage.researchGapCredits > 0);
});
test('a proposed transfer waiver needs its threshold and university confirmation', () => {
  const p = program([requirement('a'), requirement('b'), requirement('school', { institutionalOnly: true })], { appliedTransferWaiver: { minimumQualifyingTransferCredits: 9 } });
  const low = Planner.generate(p, { ...defaults, priority: 'transfer' });
  assert(low.blockers.some(error => error.code === 'waiver_transfer_threshold'));
  assert(low.blockers.some(error => error.code === 'waiver_confirmation'));
  p.appliedTransferWaiver.minimumQualifyingTransferCredits = 6;
  const met = Planner.generate(p, { ...defaults, priority: 'transfer' });
  assert(!met.blockers.some(error => error.code === 'waiver_transfer_threshold'));
  assert(met.blockers.some(error => error.code === 'waiver_confirmation'));
});
test('confirmed institutional transfer can extend the alternative-only ceiling within the overall cap', () => {
  const p = program(Array.from({ length: 40 }, (_, i) => requirement('r' + i)), { institutionMinCredits: 15, majorMinInstitutionCredits: 0, alternativeMaxCredits: 90, externalMaxCredits: 105 });
  const completed = Array.from({ length: 5 }, (_, i) => ({ requirementId: 'r' + i, status: 'confirmed', sourceProvider: 'College', title: 'Evaluated college learning' }));
  const plan = Planner.generate(p, { ...defaults, priority: 'transfer', completed });
  assert.equal(plan.coverage.sourceCeiling, 105);
  assert.equal(plan.totals.external, 105);
  assert.equal(plan.totals.alternative, 90);
});
test('Liberty waiver scenario keeps 120 credits and reaches the mapped ceiling without assuming waiver approval', () => {
  const p = JSON.parse(fs.readFileSync('./dist/data/liberty.json'));
  assert(p.transferWaiverVariant);
  const variant = p.transferWaiverVariant;
  const effective = { ...p, ...variant, id: p.id, requirements: variant.requirements, appliedTransferWaiver: { minimumQualifyingTransferCredits: variant.minimumQualifyingTransferCredits } };
  const plan = Planner.generate(effective, { ...defaults, priority: 'transfer', allowConditional: true });
  assert.equal(plan.totals.accounted, 120);
  assert.equal(plan.totals.external, 90);
  assert.equal(plan.totals.institutional, 30);
  assert.equal(plan.coverage.sourceCeiling, 90);
  assert.equal(plan.coverage.unmappedToCeiling, 0);
  assert.equal(plan.coverage.conditionalExternalCredits, 6);
  assert(plan.blockers.some(error => error.code === 'waiver_confirmation'));
  assert.equal(plan.readiness, 'draft');
});
console.log(checks + ' meaningful planner checks passed.');
