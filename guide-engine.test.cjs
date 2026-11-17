const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Guide = require('./dist/guide-engine.js');
const catalog = JSON.parse(fs.readFileSync(__dirname + '/dist/data/pathways.json', 'utf8'));
const programs = ['tesu', 'liberty'].map(id => JSON.parse(fs.readFileSync(__dirname + '/dist/data/' + id + '.json', 'utf8')));
const option = (id, code, extra = {}) => ({ id, provider: 'Sophia', code, title: 'Example', credits: 3, evidence: 'published', ...extra });
const req = (id, options, extra = {}) => ({ id, credits: 3, options, ...extra });
const program = { id: 'one', creditSystem: 'semester', requirements: [req('a', [option('soph-a', 'SOPH-001')]), req('b', [option('soph-b', 'SOPH-002')])] };
const learning = (extra = {}) => ({ id: 'course-1', provider: 'Sophia', code: 'SOPH-001', title: 'Example', credits: 3, creditSystem: 'semester', status: 'earned', evaluations: [], ...extra });

test('normalization keeps unknown budget and pace unknown and retains zero budget', () => {
  const profile = Guide.normalizeProfile({ budget: '', weeklyHours: '', degreeLevel: "Master's", priorCreditEstimate: '90', militaryOccupation: '25B' });
  assert.equal(profile.budget, null);
  assert.equal(profile.weeklyHours, null);
  assert.equal(profile.degreeLevel, 'master');
  assert.equal(profile.priorCreditEstimate, 90);
  assert.equal(profile.militaryOccupation, '25B');
  assert.equal(Guide.normalizeProfile({ budget: 0 }).budget, 0);
});

test('wizard adapts to exact targets and military follow-ups', () => {
  assert.deepEqual(Guide.steps({ entry: 'explore' }), ['start', 'goal', 'direction', 'experience', 'preferences', 'review']);
  assert(Guide.steps({ entry: 'audit', school: 'Example' }).includes('direction'));
  assert.deepEqual(Guide.steps({ entry: 'target', pathwayId: 'one', militaryStatus: 'active' }), ['start', 'direction', 'experience', 'military', 'preferences', 'review']);
  assert(Guide.steps({ entry: 'audit', pathwayId: 'one' }).includes('direction'));
  assert(Guide.steps({ militaryStatus: 'dependent' }).includes('military'));
});

test('provider and normalized code match; title alone and rough credit totals do not', () => {
  const projected = Guide.matchInventory(program, [learning({ code: 'soph 001', provider: 'Sophia Learning' })]);
  assert.equal(projected.completed.length, 1);
  assert.equal(projected.completed[0].status, 'reported');
  assert.equal(Guide.matchInventory(program, [learning({ code: '', title: 'Example' })]).completed.length, 0);
  assert.equal(Guide.matchInventory(program, [learning({ provider: 'Study.com' })]).completed.length, 0);
  assert.equal(Guide.matchInventory(program, [{ id: 'estimate', credits: 90 }]).completed.length, 0);
});

test('curated code aliases match exactly within the original provider and remain provisional', () => {
  const model = { id: 'one', requirements: [req('a', [option('community-composition', 'English Composition I', { title: 'Different display title', codeAliases: ['SOPH-0015'], evidence: 'conditional' })])] };
  const record = learning({ code: 'soph 0015', title: 'Any recorded title' });
  const matched = Guide.matchInventory(model, [record]);
  assert.equal(matched.completed.length, 1);
  assert.equal(matched.completed[0].optionId, 'community-composition');
  assert.equal(matched.completed[0].status, 'reported');
  assert.equal(Guide.matchInventory(model, [{ ...record, provider: 'Study.com' }]).completed.length, 0);
  assert.equal(Guide.matchInventory(model, [{ ...record, code: 'SOPH-001' }]).completed.length, 0);
  assert.equal(Guide.matchInventory(model, [{ ...record, code: '', title: 'English Composition I' }]).completed.length, 0);
  for (const status of ['in-progress', 'planned']) assert.equal(Guide.matchInventory(model, [{ ...record, status }]).completed.length, 0);
});

test('canonical and alias copies remain one action across repeated mapping menus', () => {
  const model = { id: 'one', requirements: [req('a', [option('composition-a', 'English Composition I', { codeAliases: ['SOPH-0015'] })]), req('b', [option('composition-b', 'Composition 1', { codeAliases: ['SOPH-0015'] })])] };
  const records = [learning({ code: 'English Composition I' }), learning({ id: 'alias-copy', code: 'SOPH-0015' }), learning({ id: 'other-canonical-copy', code: 'Composition 1' })];
  const matched = Guide.matchInventory(model, records);
  assert.equal(matched.completed.length, 1);
  assert.equal(matched.unmatched.length, 0);
});

test('explicit evaluations recover canonical options through curated aliases only for the same source', () => {
  const model = { id: 'one', requirements: [req('a', [option('composition', 'English Composition I', { codeAliases: ['SOPH-0015'], evidence: 'conditional' })])] };
  const record = learning({ code: 'SOPH-0015', evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] });
  assert.equal(Guide.matchInventory(model, [record]).completed[0].optionId, 'composition');
  const namedEvaluation = { ...record, evaluations: [{ ...record.evaluations[0], optionId: 'composition' }] };
  assert.equal(Guide.matchInventory(model, [namedEvaluation]).completed[0].optionId, 'composition');
  assert.equal(Guide.matchInventory(model, [{ ...namedEvaluation, provider: 'Other college' }]).completed[0].optionId, undefined);
});

test('in-progress and proposed learning never become completed requirements', () => {
  for (const status of ['in-progress', 'planned']) {
    assert.equal(Guide.matchInventory(program, [learning({ status, evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] })]).completed.length, 0);
  }
});

test('school confirmation is scoped to exact program and preserves source provenance', () => {
  const record = learning({ provider: 'Other college', code: 'MATH101', evaluations: [{ programId: 'one', requirementId: 'b', status: 'confirmed' }] });
  const matched = Guide.matchInventory(program, [record]);
  assert.equal(matched.completed[0].requirementId, 'b');
  assert.equal(matched.completed[0].status, 'confirmed');
  assert.equal(matched.completed[0].sourceProvider, 'College');
  assert.equal(matched.completed[0].optionId, undefined);
  assert.equal(Guide.matchInventory({ ...program, id: 'two' }, [record]).completed.length, 0);
});

test('external confirmation cannot manufacture university residency through a fallback option', () => {
  const model = { id: 'one', requirements: [req('a', [option('university-a', 'UNI101', { provider: 'University' })])] };
  const matched = Guide.matchInventory(model, [learning({ evaluations: [{ programId: 'one', requirementId: 'a', optionId: 'university-a', status: 'confirmed' }] })]);
  assert.equal(matched.completed.length, 1);
  assert.equal(matched.completed[0].sourceProvider, 'Sophia');
  assert.equal(matched.completed[0].optionId, undefined);
});

test('university records retain their original institution and do not become destination residency', () => {
  const model = { id: 'destination', school: 'Destination University', requirements: [req('a', [option('u-a', 'MAT101', {provider:'University'})]), req('b', [option('u-b', 'MAT102', {provider:'University'})])] };
  const records = ['First University','Second University'].map((institution,i) => learning({id:'home-'+i,provider:'University',institution,sourceProgramId:'source-'+i,code:'MAT101',evaluations:[{programId:'destination',requirementId:i?'b':'a',status:'confirmed'}]}));
  const matched=Guide.matchInventory(model,records);
  assert.equal(matched.completed.length,2);
  assert(matched.completed.every(item=>!item.optionId&&item.sourceProvider==='Institutional transfer'));
  const home=learning({provider:'University',institution:model.school,sourceProgramId:model.id,code:'MAT101',evaluations:[{programId:model.id,requirementId:'a',status:'confirmed'}]});
  assert.equal(Guide.matchInventory(model,[home]).completed[0].optionId,'u-a');
});

test('unknown legacy provenance remains unknown to the academic planner', () => {
  const record = learning({ provider: 'Unknown source', code: '', evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] });
  const matched = Guide.matchInventory(program, [record]);
  assert.equal(matched.completed.length, 1);
  assert.equal(matched.completed[0].sourceProvider, undefined);
  assert.equal(matched.completed[0].optionId, undefined);
});

test('planner adapter canonicalizes known providers without changing source inventory', () => {
  const record = learning({ provider: 'Sophia Learning', code: 'UNMAPPED-1', credits: 6, evaluations: ['a', 'b'].map(requirementId => ({ programId: 'one', requirementId, status: 'confirmed' })) });
  const result = Guide.matchInventory(program, [record]);
  assert.equal(result.completed.length, 2);
  assert(result.completed.every(item => item.sourceProvider === 'Sophia'));
  assert.equal(record.provider, 'Sophia Learning');
  const clep = learning({ provider: 'College Level Examination Program', evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] });
  assert.equal(Guide.matchInventory(program, [clep]).completed[0].sourceProvider, 'CLEP');
});

test('cross-unit projections require explicit receiving-school evaluation', () => {
  const record = learning({ creditSystem: 'quarter', credits: 4.5 });
  assert.equal(Guide.matchInventory(program, [record]).completed.length, 0);
  const evaluated = { ...record, evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] };
  assert.equal(Guide.matchInventory(program, [evaluated]).completed[0].creditSystem, 'semester');
  assert.equal(evaluated.creditSystem, 'quarter');
});

test('duplicate imported records and repeated mapping menus cannot count twice', () => {
  const model = { id: 'one', requirements: [req('a', [option('a', 'SOPH-001')]), req('b', [option('b', 'SOPH-001')])] };
  const result = Guide.matchInventory(model, [learning(), learning({ id: 'duplicate', credits: 6 })]);
  assert.equal(result.completed.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test('reviewed bundles create several destination components once', () => {
  const bundled = extra => option(extra, 'EXAM-1', { provider: 'CLEP', bundleId: 'composition', bundleCredits: 6 });
  const model = { id: 'one', requirements: [req('a', [bundled('a')]), req('b', [bundled('b')])] };
  const record = learning({ provider: 'CLEP', code: 'EXAM-1', credits: 6 });
  const result = Guide.matchInventory(model, [record, { ...record, id: 'duplicate' }]);
  assert.equal(result.completed.length, 2);
  assert.deepEqual(result.completed.map(item => item.requirementId), ['a', 'b']);
  assert.equal(Guide.matchInventory(model, [{ ...record, credits: 3 }]).completed.length, 1);
});

test('explicit multioutput evaluations preserve distinct components within recorded credit', () => {
  const record = learning({ provider: 'Other college', code: 'BUNDLE', credits: 6, evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }, { programId: 'one', requirementId: 'b', status: 'confirmed' }] });
  const completed = Guide.matchInventory(program, [record]).completed;
  assert.equal(completed.length, 2);
  assert.equal(completed[0].bundleId, completed[1].bundleId);
  assert.equal(completed[0].bundleCredits, 6);
  assert.equal(Guide.matchInventory(program, [{ ...record, credits: 3 }]).completed.length, 1);
});

test('zero-credit waivers do not become applied credit even with confirmation', () => {
  const record = learning({ credits: 0, evaluations: [{ programId: 'one', requirementId: 'a', status: 'confirmed' }] });
  assert.equal(Guide.matchInventory(program, [record]).completed.length, 0);
});

test('legacy migration preserves all program placements, unmatched learning and backup', () => {
  const legacy = { fields: { program: 'one', priority: 'speed' }, prior: { one: [{ title: 'Existing algebra', sourceProvider: 'Sophia', optionId: 'soph-a', requirementId: 'a', status: 'confirmed' }, { title: 'Old elective', credits: 3, requirementId: null, status: 'unmatched' }], two: [{ title: 'Existing algebra', sourceProvider: 'Sophia', optionId: 'two-a', requirementId: 'a', status: 'reported' }] } };
  const snapshot = JSON.stringify(legacy), migrated = Guide.migrateLegacy(legacy);
  assert.equal(migrated.learning.length, 2);
  assert.equal(migrated.learning[0].evaluations.length, 2);
  assert.equal(migrated.learning[0].credits, null);
  assert.equal(migrated.profile.priority, 'speed');
  assert.equal(migrated.profile.pathwayId, 'one');
  assert.equal(JSON.stringify(migrated.legacyBackup), snapshot);
  assert.equal(JSON.stringify(legacy), snapshot);
  const result = Guide.matchInventory(program, migrated.learning);
  assert.equal(result.completed.length, 1);
  assert.equal(result.unmatched.length, 1);
});

test('any-degree exploration spans eligible fields without inventing applied credit', () => {
  const result = Guide.recommend({ goal: 'any-degree', degreeLevel: 'bachelor', field: 'any', priorCreditEstimate: 90 }, catalog, programs, []);
  assert(result.length > 3);
  assert(result.some(item => item.pathway.field === 'technology'));
  assert(result.every(item => item.pathway.level === 'bachelor'));
  assert(!result.some(item => item.reasons.join(' ').includes('90 existing credits')));
});

test('degree level and chosen field are hard filters', () => {
  const masters = Guide.recommend({ degreeLevel: 'master', field: 'technology' }, catalog, programs, []);
  assert(masters.length > 0);
  assert(masters.every(item => item.pathway.level === 'master' && (item.pathway.field === 'technology' || item.pathway.fields.includes('technology'))));
  assert.equal(Guide.recommend({ degreeLevel: 'associate', field: 'technology' }, catalog, programs, []).length, 0);
});

test('exact school and exact degree never silently substitute nearby or unsupported targets', () => {
  const target = catalog.pathways.find(path => path.modelId === 'tesu-general-management');
  const profile = { entry: 'target', school: target.school, degree: target.title, degreeLevel: 'bachelor' };
  assert.deepEqual(Guide.recommend(profile, catalog, programs, []).map(item => item.pathway.id), [target.id]);
  assert.equal(Guide.recommend({ ...profile, degree: 'Computer Science' }, catalog, programs, []).length, 0);
  assert.equal(Guide.recommend({ ...profile, school: 'Another TESU' }, catalog, programs, []).length, 0);
});

test('online, campus and essential classroom preferences are hard constraints', () => {
  const online = Guide.recommend({ degreeLevel: 'bachelor', modality: 'online' }, catalog, programs, []);
  assert(online.every(item => item.pathway.modalities.includes('online')));
  const campus = Guide.recommend({ degreeLevel: 'bachelor', classroomImportance: 'essential' }, catalog, programs, []);
  assert(campus.length > 0);
  assert(campus.every(item => item.pathway.modalities.includes('campus')));
  assert.equal(Guide.recommend({ pathwayId: 'tesu-general-management', classroomImportance: 'essential' }, catalog, programs, []).length, 0);
});

test('licensed-career goals retain career stages and never recommend generic business', () => {
  for (const goal of ['teacher', 'lawyer', 'pilot', 'health-professional']) {
    const result = Guide.recommend({ goal, degreeLevel: 'bachelor' }, catalog, programs, []);
    assert(result.length > 0, goal);
    assert(result.every(item => item.pathway.goals.includes(goal)), goal);
    assert(!result.some(item => item.pathway.field === 'business'), goal);
  }
  const legalStages = Guide.recommend({ goal: 'lawyer', degreeLevel: 'doctorate' }, catalog, programs, []);
  assert(legalStages.some(item => item.pathway.stageLevels.includes('doctorate')));
  assert(legalStages.every(item => item.reasons.some(reason => reason.includes('career-stage guide'))));
  assert.equal(Guide.recommend({ goal: 'teacher', field: 'business' }, catalog, programs, []).length, 0);
});

test('military records and benefit guidance distinguishes service, branch and dependents', () => {
  const route = catalog.pathways.find(path => path.id === 'tesu-general-management');
  const army = Guide.buildGuidance({ militaryStatus: 'active', militaryBranch: 'army' }, route, [], catalog);
  assert(army.militaryNotes.some(note => note.includes('JST')));
  assert(army.militaryNotes.some(note => note.includes('DANTES')));
  assert(army.militaryNotes.some(note => note.includes('nonmilitary')));
  const air = Guide.buildGuidance({ militaryStatus: 'veteran', militaryBranch: 'air-force' }, route, [], catalog);
  assert(air.militaryNotes.some(note => note.includes('CCAF')));
  assert(!air.militaryNotes.some(note => note.includes('DANTES')));
  const dependent = Guide.buildGuidance({ militaryStatus: 'dependent' }, route, [], catalog);
  assert(!dependent.militaryNotes.some(note => note.includes('Request your')));
  assert(dependent.militaryNotes.some(note => note.includes('personally earned')));
  assert.equal(Guide.buildGuidance({ militaryStatus: 'none' }, route, [], catalog).militaryNotes.length, 0);
});

test('career guidance provides gates, three next actions and a full route without numeric promises', () => {
  const route = catalog.pathways.find(path => path.id === 'wgu-teacher-preparation');
  const result = Guide.buildGuidance({ goal: 'teacher', degreeLevel: 'bachelor', modality: 'online', priorCreditEstimate: 60 }, route, [], catalog);
  assert.equal(result.nextActions.length, 3);
  assert(result.milestones.length >= 6);
  assert(result.careerNotes.some(note => /supervised classroom/.test(note)));
  assert(result.tips.some(tip => /not been subtracted/.test(tip.text)));
  assert(!/\$\d|\d+ weeks|\d+ months/.test(JSON.stringify(result)));
  assert(route.finishWork.length > 0);
  assert(result.milestones.some(item => /evaluate existing/i.test(item)));
  assert(result.milestones.some(item => /outside work/i.test(item)));
  assert(result.milestones.some(item => /conferral/i.test(item)));
});

test('assessment preferences change useful advice while recommendations and credit allocations stay fixed', () => {
  const route = catalog.pathways.find(path => path.id === 'tesu-general-management');
  const base = { goal: 'any-degree', degreeLevel: 'bachelor', field: 'business', modality: 'online' };
  const records = [learning()];
  const expectedRoutes = Guide.recommend(base, catalog, programs, records).map(item => item.pathway.id);
  const expectedCredits = Guide.matchInventory(program, records);
  const preferences = { exams: /score thresholds/, writing: /grading or revision/, projects: /rubrics/ };
  for (const [assessmentPreference, expected] of Object.entries(preferences)) {
    const profile = { ...base, assessmentPreference };
    const guidance = Guide.buildGuidance(profile, route, records, catalog);
    const selected = guidance.tips.find(tip => tip.id === 'assessment-' + assessmentPreference);
    assert(selected && expected.test(selected.text));
    assert.equal(guidance.tips.filter(tip => /^assessment-/.test(tip.id || '')).length, 1);
    assert.deepEqual(Guide.recommend(profile, catalog, programs, records).map(item => item.pathway.id), expectedRoutes);
    assert.deepEqual(Guide.matchInventory(program, records), expectedCredits);
  }
});

test('budget, finish target and low availability receive explicit goal-based advice without promises', () => {
  const route = catalog.pathways[0];
  const guidance = Guide.buildGuidance({ budget: 2500, deadline: '2027-06-01', weeklyHours: 4 }, route, [], catalog);
  const byId = Object.fromEntries(guidance.tips.filter(tip => tip.id).map(tip => [tip.id, tip]));
  assert(byId['personal-budget'].text.includes('$2,500'));
  assert(byId['personal-budget'].text.includes('does not establish'));
  assert(byId['personal-deadline'].text.includes('2027-06-01'));
  assert(byId['personal-deadline'].text.includes('not a promised graduation date'));
  assert(byId['manageable-workload'].text.includes('4 study hours per week'));
  assert(byId['manageable-workload'].text.includes('one approved course'));
  const unspecified = Guide.buildGuidance({ budget: '', deadline: '', weeklyHours: '' }, route, [], catalog);
  assert(!unspecified.tips.some(tip => ['personal-budget', 'personal-deadline', 'manageable-workload'].includes(tip.id)));
  assert(Guide.buildGuidance({ budget: 0 }, route, [], catalog).tips.some(tip => tip.id === 'personal-budget' && tip.text.includes('$0')));
  const personal = Guide.buildGuidance({ assessmentPreference: 'projects', budget: 2500, deadline: '2027-06-01', weeklyHours: 4 }, route, [], catalog);
  assert.deepEqual(personal.tips.slice(0, 3).map(tip => tip.id), ['assessment-projects', 'personal-budget', 'personal-deadline']);
  assert.equal(personal.tips[3].id, 'manageable-workload');
  assert(personal.tips.slice(4).length > 0);
});

test('real TESU bundled composition uses one six-credit source and is provisional', () => {
  const tesu = programs.find(item => item.id === 'tesu-general-management');
  const result = Guide.matchInventory(tesu, [learning({ provider: 'CLEP', code: 'CLEP-0040', credits: 6 })]);
  assert.equal(result.completed.length, 2);
  assert(result.completed.every(item => item.status === 'reported'));
  const evaluated = learning({ provider: 'CLEP', code: 'CLEP-0040', credits: 6, evaluations: ['enc1010', 'enc1020'].map(requirementId => ({ programId: tesu.id, requirementId, status: 'confirmed' })) });
  const confirmed = Guide.matchInventory(tesu, [evaluated]);
  assert.equal(confirmed.completed.length, 2);
  assert(confirmed.completed.every(item => item.optionId && item.status === 'confirmed'));
  const Planner = require('./dist/planner.js');
  const plan = Planner.generate(tesu, { completed: confirmed.completed });
  assert(!plan.blockers.some(blocker => blocker.code === 'duplicate_source'));
});

test('engine runs as a browser global without CommonJS or network access', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/dist/guide-engine.js', 'utf8'), sandbox);
  assert.equal(typeof sandbox.DegreeGuide.recommend, 'function');
  assert.equal(sandbox.DegreeGuide.normalizeProfile({ budget: '' }).budget, null);
});

test('exact-target assessment distinguishes unknown delivery from an actual format conflict',()=>{
  const route={id:'liberty-cj',school:'Liberty University',title:'Criminal Justice Major (B.S.)',level:'bachelor',field:'social-science',fields:['social-science'],goals:['any-degree','career-growth','change-career'],modalities:[]};
  for(const profile of [{modality:'campus'},{modality:'online'},{modality:'any',classroomImportance:'essential'}]){
    const result=Guide.assessTarget(profile,route);
    assert.deepEqual(result.conflicts,[]);
    assert(result.unknowns.some(item=>item.field==='modality'));
    assert.deepEqual(Guide.recommend(profile,{pathways:[route]},[],[]),[], 'unknown formats do not become automatic discovery matches');
  }
  const conflict=Guide.assessTarget({modality:'online'},{...route,modalities:['campus']});
  assert.equal(conflict.conflicts[0].field,'modality');
  assert.equal(conflict.conflicts[0].current,'online');
  assert.deepEqual(conflict.conflicts[0].allowedValues,['campus']);
  assert.equal(conflict.unknowns.length,0);
});

test('only a cited exact model can supply missing program delivery information',()=>{
  const route={id:'example-cj',modelId:'example-cj-model',level:'bachelor',field:'social-science',goals:['any-degree'],modalities:[]};
  const cited={id:'example-cj-model',format:'Residential',sources:[{url:'https://catalog.liberty.edu/undergraduate/'}]};
  assert.equal(Guide.assessTarget({modality:'campus'},route,[cited]).unknowns.length,0);
  assert.equal(Guide.assessTarget({modality:'campus'},route,[cited]).formatBasis,'course-model');
  assert(Guide.assessTarget({modality:'online'},route,[cited]).conflicts.some(item=>item.field==='modality'));
  assert(Guide.assessTarget({modality:'campus'},route,[{...cited,sources:[]}]).unknowns.some(item=>item.field==='modality'));
  assert(Guide.assessTarget({modality:'campus'},route,[{...cited,sources:[{url:'https://example.test/catalog.liberty.edu/'}]}]).unknowns.some(item=>item.field==='modality'));
});

test('target diagnostics name a genuine career or classroom conflict without changing preferences',()=>{
  const profile={goal:'teacher',modality:'online',classroomImportance:'essential'},before=JSON.stringify(profile);
  const route={id:'other-degree',level:'bachelor',field:'business',modalities:['online'],goals:['any-degree','career-growth','change-career']};
  const result=Guide.assessTarget(profile,route);
  assert(result.conflicts.some(item=>item.field==='goal'&&item.current==='teacher'));
  assert(result.conflicts.some(item=>item.field==='classroomImportance'));
  assert.equal(JSON.stringify(profile),before);
});
