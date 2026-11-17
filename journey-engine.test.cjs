const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const Guide = require('./dist/guide-engine.js');
const Planner = require('./dist/planner.js');
const catalog = require('./dist/data/pathways.json');
const models = ['tesu', 'liberty'].map(name => require('./dist/data/' + name + '.json'));
const clone = value => JSON.parse(JSON.stringify(value));
const tesu = catalog.pathways.find(path => path.modelId === 'tesu-general-management');
const liberty = catalog.pathways.find(path => path.modelId === 'liberty-business-residential');
const answer = (state, id, value) => Journey.applyAnswer(state, id, value, catalog);
function explored(values = {}) {
  let state = Journey.initialize(null, null, catalog);
  for (const [id, value] of Object.entries({start:'explore', purpose:'any-degree', level:'bachelor', format:'any', prior:'none', military:'none', priority:'balanced', ...values})) state = answer(state, id, value);
  return state;
}
function savedPlan(pathway = tesu) {
  return Sheet.selectPathway(Sheet.initialize(null, null, catalog), pathway);
}
const record = overrides => ({id:'original-course', provider:'Sophia', code:'SOPH-0015', title:'English Composition I', credits:3, creditSystem:'semester', status:'earned', completedOn:'2025-08-01', evaluations:[], ...overrides});

test('exports a browser global with the same pure API', () => {
  const browser = {DegreeSheet:Sheet, DegreeGuide:Guide, DegreePlanner:Planner};
  vm.runInNewContext(fs.readFileSync('./dist/journey-engine.js', 'utf8'), browser);
  assert.equal(typeof browser.DegreeJourney.initialize, 'function');
  assert.equal(typeof browser.DegreeJourney.buildDraft, 'function');
  assert.equal(browser.localStorage, undefined);
});

test('fresh and previously saved example worksheets never become a chosen TESU target', () => {
  const empty = Journey.initialize(null, null, catalog);
  const example = Sheet.initialize(null, null, catalog);
  const migrated = Journey.initialize(JSON.stringify(example), null, catalog);
  for (const state of [empty, migrated, Journey.initialize(JSON.stringify(empty), null, catalog)]) {
    assert.equal(state.selectedPathwayId, '');
    assert.equal(state.profile.school, '');
    assert.equal(state.profile.degree, '');
    assert.equal(state.profile.pathwayId, '');
    assert.equal(state.profile.degreeLevel, 'unsure');
    assert.equal(state.journey.view, 'questions');
    assert.equal(state.journey.step, 'start');
    assert.deepEqual(state.journey.answers, {});
    assert.equal(state.journey.completed, false);
    assert.equal(Journey.tasks(state).find(task => task.id === 'credits').complete, false);
    assert.equal(Journey.buildDraft(state, catalog, models).plan, null);
  }
  assert.equal(example.selectedPathwayId, tesu.id, 'original sample remains untouched');
});

test('migration keeps real targets, private inventory, notes, baselines, and every program quote', () => {
  const saved = savedPlan();
  saved.profile = {...saved.profile, entry:'audit', militaryStatus:'veteran', militaryRecords:'jst', goalDetail:'Private goal'};
  saved.learning = [record({privateNote:'Private transcript detail', evaluations:[{programId:'another-school', requirementId:'source-course', status:'confirmed'}]})];
  saved.scenarios = {[tesu.id]:{providers:['Sophia'], universityRate:327, fees:98, feesConfirmed:true, optionSelections:{enc1010:'sophia-enc1010-3'}}, [liberty.id]:{universityRate:560, fees:470, useWaivers:true, providerWeeks:{StraighterLine:9}}};
  saved.sheet.notes = {[tesu.id]:{enc1010:'Keep this private'}};
  saved.baseline = {school:tesu.school, externalCredits:60};
  const snapshot = JSON.stringify(saved), state = Journey.initialize(saved, null, catalog);
  assert.equal(state.journey.view, 'home');
  assert.equal(state.journey.completed, true);
  assert.deepEqual(state.profile, saved.profile);
  assert.deepEqual(state.learning, saved.learning);
  assert.deepEqual(state.scenarios, saved.scenarios);
  assert.deepEqual(state.sheet.notes, saved.sheet.notes);
  assert.deepEqual(state.baseline, saved.baseline);
  const changed = answer(state, 'priority', 'fastest');
  assert.equal(changed.profile.priority, 'speed');
  assert.deepEqual(changed.learning, saved.learning);
  assert.deepEqual(changed.scenarios, saved.scenarios);
  assert.deepEqual(changed.sheet.notes, saved.sheet.notes);
  assert.equal(JSON.stringify(saved), snapshot);
});

test('legacy planner migration retains original records and per-program quote fields', () => {
  const legacy = {fields:{program:tesu.id, tuition:'321', fees:'24', priority:'cost'}, prior:{[tesu.id]:[{title:'Earlier Algebra', sourceProvider:'College', code:'MAT100', credits:3, requirementId:'mat1210', status:'reported'}]}, providers:['Sophia'], conditional:false};
  const state = Journey.initialize(null, legacy, catalog);
  assert.equal(state.selectedPathwayId, tesu.id);
  assert.equal(state.journey.view, 'home');
  assert.equal(state.learning.length, 1);
  assert.equal(state.scenarios[tesu.id].universityRate, '321');
  assert.equal(state.scenarios[tesu.id].fees, '24');
  assert.deepEqual(state.legacyBackup, legacy);
});

test('custom targets remain exact private outlines through migration and edits', () => {
  let state = Journey.initialize(null, null, catalog);
  state = answer(state, 'start', 'target');
  state = answer(state, 'school', 'My Regional University');
  state = answer(state, 'degree', {degree:'B.S. Advanced Materials Science',allowUnlisted:true});
  state = answer(state, 'purpose', 'career-growth');
  state = answer(state, 'routes', 'custom-target');
  assert.equal(state.journey.answers.routes, 'custom-target');
  state.learning = [record()];
  const restored = Journey.initialize(JSON.stringify(state), null, catalog);
  const draft = Journey.buildDraft(restored, catalog, models);
  assert.equal(restored.selectedPathwayId, 'custom-target');
  assert.equal(draft.pathway.school, 'My Regional University');
  assert.equal(draft.pathway.title, 'B.S. Advanced Materials Science');
  assert.equal(draft.program, null);
  assert.equal(draft.plan, null);
  assert.deepEqual(draft.match.unmatched, state.learning);
  assert.deepEqual(Journey.recommend(restored, catalog, models), []);
});

test('question branches use explicit answers and preserve answered steps for back navigation', () => {
  let state = Journey.initialize(null, null, catalog);
  assert.deepEqual(Journey.questions(state, catalog), ['start', 'purpose', 'level', 'field', 'format', 'prior', 'military', 'priority', 'routes', 'review']);
  state = answer(state, 'start', 'target');
  assert(Journey.questions(state, catalog).includes('school'));
  assert(!Journey.questions(state, catalog).includes('degree'));
  state = answer(state, 'school', tesu.school);
  assert(Journey.questions(state, catalog).includes('degree'));
  assert(!Journey.questions(state, catalog).includes('format'), 'single-format school supplies its route format');
  state = answer(state, 'degree', tesu.id);
  assert(Journey.questions(state, catalog).includes('school'));
  assert(Journey.questions(state, catalog).includes('degree'));
  assert(!Journey.questions(state, catalog).includes('level'));
  state = answer(state, 'purpose', 'licensed-career');
  assert(Journey.questions(state, catalog).includes('career'));
  state = answer(state, 'military', 'veteran');
  assert(Journey.questions(state, catalog).includes('military-records'));
  state = answer(state, 'military-records', {militaryRecords:'ccaf', militaryBranch:'air-force'});
  state = answer(state, 'military', 'dependent');
  assert(!Journey.questions(state, catalog).includes('military-records'));
  assert.equal(state.profile.militaryRecords, 'ccaf', 'hidden records are preserved, never interpreted as dependent-earned credit');
  assert.throws(() => answer(state, 'military-records', 'jst'), /own military service/);
  assert.throws(() => answer(state, 'priority', 'cheapest'), /valid priority/);
  assert.throws(() => answer(state, 'constructor', 'x'), /valid journey question/);
});

test('protected goals, unknown licensed careers, levels and modalities never receive generic substitutes', () => {
  for (const career of ['teacher', 'lawyer', 'pilot', 'health-professional']) {
    let state = explored();
    state = answer(state, 'purpose', 'licensed-career');
    assert.deepEqual(Journey.recommend(state, catalog, models), [], 'temporary licensed category is unresolved');
    state = answer(state, 'career', career);
    const matches = Journey.recommend(state, catalog, models);
    assert(matches.every(match => match.pathway.goals.includes(career)));
    assert(!matches.some(match => match.pathway.id === tesu.id));
    assert.throws(() => Journey.selectRoute(state, tesu, catalog), /does not meet/);
  }
  let other = answer(answer(explored(), 'purpose', 'licensed-career'), 'career', 'other');
  assert.deepEqual(Journey.recommend(other, catalog, models), []);
  assert.throws(() => Journey.selectRoute(other, tesu, catalog), /exact licensed career/);
  assert.throws(() => Journey.selectRoute(explored({format:'campus'}), tesu, catalog), /does not meet/);
  const graduateInterest=explored({level:'master'});
  assert(!Journey.recommend(graduateInterest,catalog,models).some(match=>match.pathway.id===tesu.id), 'discovery respects the requested level');
  const explicitlyChosenBachelor=Journey.selectRoute(graduateInterest,tesu,catalog);
  assert.equal(explicitlyChosenBachelor.profile.degreeLevel,'bachelor', 'an explicit degree replaces a previous exploratory level');
  assert.equal(explicitlyChosenBachelor.journey.answers.level,'bachelor');
  assert.equal(graduateInterest.profile.degreeLevel,'master');
  const selected = Journey.selectRoute(explored(), tesu, catalog);
  const incompatible = answer(answer(selected, 'purpose', 'licensed-career'), 'career', 'teacher');
  assert.equal(Journey.buildDraft(incompatible, catalog, models).plan, null);
  assert.equal(incompatible.profile.school, tesu.school, 'exact saved target stays visible for review');
});

test('career-stage guide selection retains an explicitly selected master or doctorate level', () => {
  for (const [career, level, routeId] of [['teacher', 'master', 'teacher-campus-preparation'], ['lawyer', 'doctorate', 'lawyer-preparation']]) {
    let state = explored({level});
    state = answer(answer(state, 'purpose', 'licensed-career'), 'career', career);
    const route = catalog.pathways.find(item => item.id === routeId);
    state = Journey.selectRoute(state, route, catalog);
    assert.equal(state.profile.degreeLevel, level);
    assert(Journey.recommend(state, catalog, models).some(match => match.pathway.id === routeId));
  }
});

test('real model drafts retain 120 unique credits and partial prices and timing', () => {
  for (const pathway of [tesu, liberty]) {
    const state = Journey.initialize(savedPlan(pathway), null, catalog), before = JSON.stringify(state);
    const draft = Journey.buildDraft(state, catalog, models);
    assert.equal(draft.plan.totals.accounted, 120);
    assert.equal(new Set(draft.plan.rows.map(row => row.requirementId)).size, draft.plan.rows.length);
    assert.equal(draft.plan.validation.academicCountsValid, true);
    assert(draft.plan.totals.institutional >= draft.program.institutionMinCredits);
    assert.equal(draft.plan.costs.total, null);
    assert.equal(draft.plan.costs.costComplete, false);
    assert.equal(draft.plan.timing.estimatedWeeks, null);
    assert(draft.plan.costs.missing.length > 0);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(draft.input.completed, draft.match.completed);
  }
});

test('provider preparation preserves an explicit selection as newly mapped sources become available', () => {
  let state = Journey.initialize(savedPlan(liberty), null, catalog);
  state.scenarios[liberty.id] = {providers:['Sophia'], mappedProvidersReviewed:['Sophia', 'Study.com', 'CLEP'], universityRate:432, fees:100, providerWeeks:{StraighterLine:7}, feesConfirmed:true};
  const prepared = Journey.buildDraft(state, catalog, models).state;
  assert.deepEqual(prepared.scenarios[liberty.id].providers,['Sophia']);
  assert(prepared.scenarios[liberty.id].mappedProvidersReviewed.includes('StraighterLine'));
  assert.equal(prepared.scenarios[liberty.id].universityRate, 432);
  assert.equal(prepared.scenarios[liberty.id].feesConfirmed, true);
  assert.equal(state.scenarios[liberty.id].providers.includes('StraighterLine'), false);
  assert(!Journey.buildDraft(prepared, catalog, models).input.providers.includes('StraighterLine'));
  prepared.profile.proctoringPreference = 'avoid';
  const avoided = Journey.buildDraft(prepared, catalog, models);
  assert(!avoided.input.providers.some(provider => ['CLEP', 'StraighterLine', 'Saylor', 'DSST'].includes(provider)));
});

test('live source records match the same current model and do not become school confirmations', () => {
  const state = Journey.initialize(savedPlan(liberty), null, catalog);
  const original = record();
  state.learning = [original];
  const draft = Journey.buildDraft(state, catalog, models);
  assert(draft.match.completed.some(placement => placement.requirementId === 'engl-101' && placement.status === 'reported'));
  assert.equal(draft.plan.rows.find(row => row.requirementId === 'engl-101').status, 'reported');
  assert.equal(draft.plan.totals.confirmed, 0);
  assert.equal(draft.plan.totals.reported, 3);
  assert.equal(draft.plan.totals.accounted, 120);
  assert.deepEqual(state.learning[0], original);
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'school').complete, false);
});

test('per-program quotes, voucher confirmations, course locks, and timing assumptions enter the draft intact', () => {
  const state = Journey.initialize(savedPlan(liberty), null, catalog);
  state.scenarios[liberty.id] = {providers:['Sophia', 'CLEP'], mappedProvidersReviewed:['Sophia', 'Study.com', 'CLEP', 'StraighterLine'], universityRate:450, fees:320, feesConfirmed:true, taxesConfirmed:true, modernStates:true, voucherConfirmed:false, examBudget:110, optionSelections:{'engl-101':'clep-clep-0041'}, sophiaMonths:3, studyMonths:2, sophiaWeeks:5, studyWeeks:7, clepWeeks:2, termWeeks:8, termCredits:12, concurrency:2};
  state.scenarios[tesu.id] = {universityRate:300, fees:91};
  const draft = Journey.buildDraft(state, catalog, models);
  assert.equal(draft.plan.rows.find(row => row.requirementId === 'engl-101').option.id, 'clep-clep-0041');
  assert.equal(draft.input.universityRate, 450);
  assert.equal(draft.input.examBudget, 110);
  assert.equal(draft.input.voucherConfirmed, false);
  assert.equal(draft.input.feesConfirmed, true);
  assert.equal(draft.input.providerMonths.Sophia, 3);
  assert.equal(draft.input.timing.universityTermWeeks, 8);
  assert.equal(draft.input.timing.externalWeeks.CLEP, 2);
  assert(draft.plan.costs.providerCosts.find(cost => cost.provider === 'CLEP').amount >= 110);
  assert(draft.plan.costs.missing.some(reason => reason.includes('voucher')));
  assert.deepEqual(draft.state.scenarios[tesu.id], state.scenarios[tesu.id]);
});

test('Liberty conditional waiver keeps credit and institution minima and requires actual transfer review', () => {
  const state = Journey.initialize(savedPlan(liberty), null, catalog);
  state.scenarios[liberty.id] = {useWaivers:true, providers:['Sophia', 'Study.com', 'CLEP'], allowConditional:true};
  const draft = Journey.buildDraft(state, catalog, models);
  assert.equal(draft.program.appliedTransferWaiver.minimumQualifyingTransferCredits, 60);
  assert.equal(draft.plan.totals.accounted, 120);
  assert(draft.plan.totals.institutional >= draft.program.institutionMinCredits);
  assert(draft.plan.blockers.some(item => item.code === 'waiver_confirmation'));
  assert(draft.plan.validation.errors.some(item => item.code === 'waiver_confirmation'));
  assert.equal(draft.plan.totals.confirmed, 0);
  assert.equal(draft.plan.readiness, 'draft');
  assert.equal(models.find(model => model.id === liberty.id).appliedTransferWaiver, undefined);
  const allMapped = [...new Set(models.find(model => model.id === liberty.id).requirements.flatMap(req => req.options.map(option => option.provider)))].filter(provider => provider !== 'University');
  state.scenarios[liberty.id] = {useWaivers:true, providers:[], mappedProvidersReviewed:allMapped};
  state.learning = [record()];
  const belowThreshold = Journey.buildDraft(state, catalog, models);
  assert.equal(belowThreshold.plan.totals.accounted, 120);
  assert.equal(belowThreshold.plan.totals.reported, 3);
  assert.equal(belowThreshold.plan.totals.external, 3);
  assert.equal(belowThreshold.plan.validation.academicCountsValid, false);
  assert(belowThreshold.plan.validation.errors.some(item => item.code === 'waiver_transfer_threshold'));
  assert(belowThreshold.plan.validation.errors.some(item => item.code === 'waiver_confirmation'));
});

test('task completion is explicit, deferred credits stay provisional, and changes invalidate review signatures', () => {
  let state = Journey.selectRoute(explored({prior:'some'}), tesu, catalog);
  let draft = Journey.buildDraft(state, catalog, models);
  state = draft.state;
  assert.deepEqual(Journey.tasks(state, draft).map(task => task.id), ['choices', 'credits', 'plan', 'school']);
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'credits').complete, false);
  state.journey.creditsDeferred = true;
  draft = Journey.buildDraft(state, catalog, models);
  assert.equal(draft.plan.provisional, true);
  const credits = Journey.tasks(state, draft).find(task => task.id === 'credits');
  assert.equal(credits.complete, true);
  assert.equal(credits.status, 'provisional');
  assert.equal(credits.provisional, true);
  const signature = Journey.draftSignature(state, draft);
  state.journey.planReviewed = true;
  state.journey.schoolContacted = true;
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'plan').complete, false, 'flags without signatures are not approval');
  state.journey.reviewedSignature = signature;
  state.journey.schoolContactedSignature = signature;
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'plan').complete, true);
  assert.equal(Journey.tasks(state, draft).find(task => task.id === 'school').complete, true);
  state.journey.view = 'home';
  state.journey.step = 'review';
  assert.equal(Journey.draftSignature(state, draft), signature, 'navigation never invalidates a reviewed curriculum');
  const changed = clone(state);
  changed.learning.push(record());
  const changedDraft = Journey.buildDraft(changed, catalog, models);
  assert.equal(Journey.tasks(changedDraft.state, changedDraft).find(task => task.id === 'plan').complete, false);
  assert.equal(Journey.tasks(changedDraft.state, changedDraft).find(task => task.id === 'school').complete, false);
});

test('signature is deterministic for object key order and uses only the active program scenario', () => {
  const state = Journey.initialize(savedPlan(), null, catalog), draft = Journey.buildDraft(state, catalog, models);
  const other = clone(draft.state);
  other.profile = Object.fromEntries(Object.entries(other.profile).reverse());
  other.scenarios[liberty.id] = {universityRate:999};
  assert.equal(Journey.draftSignature(other, draft), Journey.draftSignature(draft.state, draft));
});

test('nested legacy price and timing estimates survive default scalar fields and explicit clears remain clears', () => {
  const state = Journey.initialize(savedPlan(liberty), null, catalog);
  state.scenarios[liberty.id] = {providerMonths:{Sophia:4, 'Study.com':3, StraighterLine:2}, timing:{externalWeeks:{Sophia:6, 'Study.com':8, CLEP:3, StraighterLine:9}, externalConcurrency:2, universityTermWeeks:16, universityCreditsPerTerm:15}};
  const draft = Journey.buildDraft(state, catalog, models);
  assert.equal(draft.input.providerMonths.Sophia, 4);
  assert.equal(draft.input.providerMonths['Study.com'], 3);
  assert.equal(draft.input.providerMonths.StraighterLine, 2);
  assert.equal(draft.input.timing.externalWeeks.Sophia, 6);
  assert.equal(draft.input.timing.externalWeeks.CLEP, 3);
  assert.equal(draft.input.timing.externalWeeks.StraighterLine, 9);
  assert.equal(draft.input.timing.externalConcurrency, 2);
  assert.equal(draft.input.timing.universityTermWeeks, 16);
  assert.equal(draft.input.timing.universityCreditsPerTerm, 15);
  state.scenarios[liberty.id].sophiaWeeks = '';
  state.scenarios[liberty.id].termWeeks = '';
  const cleared = Journey.buildDraft(state, catalog, models);
  assert.equal(cleared.input.timing.externalWeeks.Sophia, null);
  assert.equal(cleared.input.timing.universityTermWeeks, null);
  assert.equal(cleared.input.timing.externalWeeks.CLEP, 3);
});

test('same-ID academic or evidence changes invalidate review and school-contact signatures', () => {
  const state = Journey.initialize(savedPlan(liberty), null, catalog), draft = Journey.buildDraft(state, catalog, models);
  const signature = Journey.draftSignature(draft.state, draft);
  const selected = draft.plan.rows.find(row => row.option.provider !== 'University');
  for (const mutate of [
    altered => {altered.plan.rows.find(row => row.requirementId === selected.requirementId).option.minScore = 75;},
    altered => {altered.plan.rows.find(row => row.requirementId === selected.requirementId).option.recommendationEnd = '2026-11-30';},
    altered => {altered.plan.rows.find(row => row.requirementId === selected.requirementId).conditions.push('New applicable condition');},
    altered => {altered.program.rulesNotes.push('New applicable major residency rule');},
    altered => {altered.plan.validation.errors.push({code:'new_mapping_conflict', message:'A mapping changed'});}
  ]) {
    const altered = clone(draft); mutate(altered);
    assert.notEqual(Journey.draftSignature(draft.state, altered), signature);
    const reviewed = clone(draft.state);
    Object.assign(reviewed.journey, {planReviewed:true, schoolContacted:true, reviewedSignature:signature, schoolContactedSignature:signature});
    assert.equal(Journey.tasks(reviewed, altered).find(task => task.id === 'plan').complete, false);
    assert.equal(Journey.tasks(reviewed, altered).find(task => task.id === 'school').complete, false);
  }
});

test('field interests are an explicit hard filter with an unknown-any choice and backward navigation', () => {
  let state = explored();
  assert(Journey.questions(state, catalog).includes('field'));
  state = answer(state, 'field', 'technology');
  assert.equal(state.profile.field, 'technology');
  assert.equal(state.journey.answers.field, 'technology');
  const matches = Journey.recommend(state, catalog, models);
  assert(matches.every(match => [match.pathway.field, ...(match.pathway.fields || [])].includes('technology')));
  assert(!matches.some(match => match.pathway.id === tesu.id));
  assert.throws(() => answer(state, 'field', 'accounting'), /valid field/);
  for (const value of ['unknown', 'not-sure', '__unknown__', 'any']) {
    const unknown = answer(state, 'field', value);
    assert.equal(unknown.profile.field, 'any');
    assert.equal(unknown.journey.answers.field, 'any');
  }
  const selected = Journey.selectRoute(answer(state, 'field', 'business'), tesu, catalog);
  assert(Journey.questions(selected, catalog).includes('field'), 'answered field remains available for Back');
  const licensed = answer(selected, 'purpose', 'licensed-career');
  assert(!Journey.questions(licensed, catalog).includes('field'));
  let changed = answer(answer(answer(explored(), 'field', 'business'), 'purpose', 'licensed-career'), 'career', 'teacher');
  const careerRoutes = Journey.recommend(changed, catalog, models);
  assert(careerRoutes.length > 0, 'a hidden old field interest cannot block the licensed-career route');
  assert(careerRoutes.every(match => match.pathway.goals.includes('teacher')));
  changed = Journey.selectRoute(changed, careerRoutes[0].pathway, catalog);
  assert.equal(changed.profile.field, 'business', 'explicit interest remains saved while career governs eligibility');
  changed = answer(changed, 'purpose', 'any-degree');
  assert.equal(changed.profile.field, 'business');
});

test('unknown degree preserves selected school, records and quotes while restricting recommendations to that school', () => {
  let original = Journey.initialize(savedPlan(tesu), null, catalog);
  original.learning = [record()];
  original.scenarios[tesu.id] = {universityRate:321, optionSelections:{enc1010:'sophia-enc1010-3'}};
  original.journey.answers = {start:'target', school:tesu.school, degree:tesu.id, purpose:'any-degree', field:'business'};
  for (const value of ['unknown', 'not-sure', '__unknown__']) {
    const state = answer(original, 'degree', value);
    assert.equal(state.profile.school, tesu.school);
    assert.equal(state.profile.schoolChoice, tesu.school);
    assert.equal(state.profile.degree, '');
    assert.equal(state.profile.pathwayId, '');
    assert.equal(state.selectedPathwayId, '');
    assert.equal(state.journey.answers.degree, 'unknown');
    assert(Journey.questions(state, catalog).includes('degree'), 'unknown degree stays editable for Back');
    assert(Journey.questions(state, catalog).includes('routes'));
    const matches = Journey.recommend(state, catalog, models);
    assert(matches.length > 0);
    assert(matches.every(match => match.pathway.school === tesu.school));
    assert.deepEqual(state.learning, original.learning);
    assert.deepEqual(state.scenarios, original.scenarios);
  }
  assert.equal(original.selectedPathwayId, tesu.id, 'answering never mutates the old target');
});

test('exact single-format degree selection records its format without an unnecessary format question', () => {
  let state = Journey.initialize(null, null, catalog);
  state = answer(state, 'start', 'target');
  state = answer(state, 'school', liberty.school);
  state = answer(state, 'degree', liberty.id);
  assert.equal(state.profile.modality, 'campus');
  assert(!Journey.questions(state, catalog).includes('format'));
  assert.equal(Journey.buildDraft(state, catalog, models).program.id, liberty.modelId);
  const stored = clone(state);
  stored.profile.modality = 'online';
  const conflicted = Journey.initialize(stored, null, catalog);
  assert.equal(conflicted.profile.modality, 'online', 'an explicit saved preference is preserved');
  assert(Journey.questions(conflicted, catalog).includes('format'), 'a saved format conflict must be resolved');
  assert.equal(Journey.buildDraft(conflicted, catalog, models).plan, null);
  assert.equal(Journey.buildDraft(conflicted, catalog, models).targetReviewNeeded, true, 'a target conflict is different from an unavailable course map');
  const resolved = answer(conflicted, 'format', 'campus');
  assert.equal(Journey.buildDraft(resolved, catalog, models).program.id, liberty.modelId);
  assert.equal(Journey.buildDraft(resolved, catalog, models).targetReviewNeeded, false);
  const explicitAny = answer(explored(), 'format', 'any');
  assert.equal(Journey.selectRoute(explicitAny, liberty, catalog).profile.modality, 'any', 'an explicit any-format answer is not rewritten');
});

test('an undecided degree choice retains its route question after selection for forward and back navigation', () => {
  let state = Journey.initialize(null, null, catalog);
  for (const [id,value] of [['start','target'],['school','Liberty University'],['degree','unknown'],['purpose','any-degree'],['level','bachelor'],['field','business'],['format','campus']]) state = answer(state,id,value);
  state = answer(state,'routes','liberty-business-residential');
  const ids = Journey.questions(state,catalog);
  assert(ids.includes('routes'));
  assert.equal(ids[ids.indexOf('routes') + 1], 'review');
  assert.equal(state.profile.school, 'Liberty University');
  assert.equal(state.profile.modality, 'campus');
});


test('review signatures include only the active plan’s savings assumptions', () => {
  let state = Journey.initialize(null, null, catalog);
  state = Journey.selectRoute(state, catalog.pathways.find(path => path.id === 'liberty-business-residential'), catalog);
  const before = Journey.draftSignature(state, Journey.buildDraft(state, catalog, models));
  state.savings = {'tesu-general-management':{outsideBudget:7000}};
  assert.equal(Journey.draftSignature(state, Journey.buildDraft(state, catalog, models)), before);
  state.savings['liberty-business-residential'] = {outsideBudget:3000,unitsPerTerm:15};
  assert.notEqual(Journey.draftSignature(state, Journey.buildDraft(state, catalog, models)), before);
});


test('search text never silently becomes an unlisted degree target', () => {
  let state = answer(answer(Journey.initialize(null,null,catalog),'start','target'),'school','Liberty University');
  const before = JSON.stringify(state);
  assert.throws(()=>answer(state,'degree','psychology'), /Choose a degree from the results/);
  assert.equal(JSON.stringify(state),before);
  const unlisted=answer(state,'degree',{degree:'B.S. Exact Unlisted Target',allowUnlisted:true});
  assert.equal(unlisted.selectedPathwayId,'custom-target');
  assert.equal(unlisted.profile.degree,'B.S. Exact Unlisted Target');
});

test('past-course entry needs no destination and preserves an existing destination and library', () => {
  let fresh=answer(Journey.initialize(null,null,catalog),'start','audit');
  assert(!Journey.questions(fresh,catalog).includes('school'));
  assert(!Journey.questions(fresh,catalog).includes('degree'));
  assert.equal(fresh.profile.hasPrior,'some');
  let returning=Journey.initialize(savedPlan(tesu),null,catalog);
  returning.learning=[record()];
  const prior=clone(returning);
  returning=answer(returning,'start','audit');
  assert.equal(returning.selectedPathwayId,tesu.id);
  assert.deepEqual(returning.learning,prior.learning);
});

test('re-entering a known target exposes the school and degree editor every time', () => {
  let state=Journey.initialize(savedPlan(tesu),null,catalog);
  state.journey.answers={start:'target',purpose:'any-degree'};
  state.learning=[record()];
  state=answer(state,'start','target');
  const ids=Journey.questions(state,catalog);
  assert.equal(ids[1],'school');
  assert.equal(ids[2],'degree');
  assert.equal(state.selectedPathwayId,tesu.id);
  assert.equal(state.learning.length,1);
});

test('changing to an exact subject and level does not inherit the former exploration filters',()=>{
  const cj={id:'cj-diagnostic-fixture',school:'Liberty University',title:'Criminal Justice Major (B.S.)',level:'bachelor',field:'social-science',fields:['social-science'],goals:['any-degree','career-growth','change-career'],modalities:[],routeType:'catalog-program'};
  const extended={...catalog,pathways:[...catalog.pathways,cj]};
  let state=Journey.initialize(savedPlan(tesu),null,extended);
  state.profile.degreeLevel='master';state.profile.field='business';state.profile.modality='campus';
  state.journey.answers={start:'explore',purpose:'any-degree',field:'business',level:'master',format:'campus'};
  state.learning=[record()];const before=clone(state);
  const chosen=Journey.selectRoute(state,cj,extended),draft=Journey.buildDraft(chosen,extended,models);
  assert.equal(draft.state.profile.field,'social-science');assert.equal(draft.state.profile.degreeLevel,'bachelor');
  assert.equal(draft.state.journey.answers.field,'social-science');assert.equal(draft.state.journey.answers.level,'bachelor');
  assert.equal(draft.state.profile.modality,'campus');
  assert.equal(draft.targetReviewNeeded,false);assert.deepEqual(draft.targetIssues,[]);
  assert(draft.targetUnknowns.some(item=>item.field==='modality'));
  assert.equal(draft.mapAvailable,false);assert.equal(draft.plan,null);
  assert.deepEqual(draft.state.learning,before.learning);assert.deepEqual(draft.state.scenarios,before.scenarios);assert.deepEqual(draft.state.sheet.notes,before.sheet.notes);assert.deepEqual(state,before);
});

test('known map availability is independent of a genuine preference conflict',()=>{
  const state=Journey.initialize(savedPlan(liberty),null,catalog);
  state.profile.modality='online';
  const draft=Journey.buildDraft(state,catalog,models);
  assert.equal(draft.mapAvailable,true);assert.equal(draft.plan,null);assert.equal(draft.targetReviewNeeded,true);
  assert(draft.targetIssues.some(item=>item.field==='modality'&&item.current==='online'));
  assert.equal(draft.state.profile.modality,'online');
});

test('unknown format cannot silently enable an uncited model and protected career goals remain intact',()=>{
  const route={id:'cj-uncited-fixture',modelId:'cj-uncited-model',school:'Liberty University',title:'Criminal Justice Major (B.S.)',level:'bachelor',field:'social-science',fields:['social-science'],goals:['any-degree'],modalities:[],routeType:'catalog-program'};
  const extended={...catalog,pathways:[...catalog.pathways,route]};
  let state=Sheet.selectPathway(Journey.initialize(savedPlan(liberty),null,extended),route);
  state.profile.modality='campus';
  let draft=Journey.buildDraft(state,extended,[...models,{...models[0],id:'cj-uncited-model',sources:[],format:'Residential'}]);
  assert.equal(draft.mapAvailable,true);assert.equal(draft.plan,null);assert.equal(draft.targetReviewNeeded,false);assert(draft.targetUnknowns.some(item=>item.field==='modality'));
  state.profile.goal='teacher';state.journey.answers.purpose='licensed-career';state.journey.answers.career='teacher';
  draft=Journey.buildDraft(state,extended,models);
  assert.equal(draft.state.profile.goal,'teacher');assert(draft.targetIssues.some(item=>item.field==='goal'));assert.equal(draft.targetReviewNeeded,true);
});

test('an explicit catalog target remains storable while a career question is unresolved',()=>{
  const route={id:'catalog-unresolved-career',school:'Liberty University',title:'Criminal Justice Major (B.S.)',level:'bachelor',field:'social-science',fields:['social-science'],goals:['any-degree'],modalities:['campus'],routeType:'catalog-program'};
  const extended={...catalog,pathways:[...catalog.pathways,route]};
  let state=answer(answer(explored(),'purpose','licensed-career'),'career','other');
  state=Journey.selectRoute(state,route,extended);
  const draft=Journey.buildDraft(state,extended,models);
  assert.equal(draft.state.selectedPathwayId,route.id);
  assert.equal(draft.plan,null);
  assert(draft.targetUnknowns.some(item=>item.field==='goal'));
  assert.equal(draft.targetReviewNeeded,false);
  assert.equal(draft.state.journey.answers.career,'other');
});
