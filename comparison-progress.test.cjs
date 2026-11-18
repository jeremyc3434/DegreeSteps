const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Comparison = require('./dist/plan-comparison-engine.js');
const Journey = require('./dist/journey-engine.js');
const Guide = require('./dist/guide-engine.js');

const copy = value => JSON.parse(JSON.stringify(value));
const options = {fromCourses:true, deferMatrix:true};
const summaryKeys = new Set([
  'degreeCredits', 'applicableCompletedCredits', 'confirmedCredits', 'reportedCredits',
  'remainingCredits', 'universityCreditsRemaining', 'universityTuitionRemaining',
  'universityTermsRemaining', 'termLabel', 'estimatedBaseCost', 'remainingCost',
  'estimatedWeeks', 'creditSystem', 'mappedExternalCredits', 'collectionFitCredits',
  'potentialCollectionCredits', 'collectionFitFraction', 'completedFitFraction',
  'collectionNeedsEvaluation', 'fitBreakdown', 'provisional'
]);

function fixture() {
  const source = {id:'fixture', title:'Synthetic fixture only', url:'https://example.edu/catalog'};
  const option = (provider, code) => ({id:provider+'-'+code, provider, code, title:code, credits:3, creditSystem:'semester', evidence:'published', sourceIds:['fixture']});
  const base = {
    id:'course-fit', school:'Test University', title:'Course-fit degree', level:'bachelor',
    format:'Online', creditSystem:'semester', totalCredits:6, institutionMinCredits:3,
    upperMinCredits:0, externalMaxCredits:3, sources:[source],
    pricing:{model:'per-credit', amount:500, currency:'USD', sourceUrl:'https://example.edu/tuition'},
    requirements:[
      {id:'writing', code:'writing', title:'Writing', credits:3, category:'general', options:[option('Sophia','S1')]},
      {id:'capstone', code:'CAP', title:'Capstone', credits:3, category:'major', institutionalOnly:true, options:[option('University','CAP')]}
    ]
  };
  const models = [base];
  for (const [id, title, rate] of [['cheap','Lower tuition degree',50], ['known-a','Another course-fit degree',600], ['known-b','Third course-fit degree',700]]) {
    const model = copy(base);
    Object.assign(model, {id, title});
    model.pricing.amount = rate;
    if (id === 'cheap') model.requirements[0].options = [option('University','UNI101')];
    models.push(model);
  }
  const catalog = {pathways:models.map(model => ({
    id:model.id, modelId:model.id, school:model.school, title:model.title, level:'bachelor',
    field:'general', fields:['general'], goals:['any-degree','career-growth','change-career'], modalities:['online']
  }))};
  const state = Journey.initialize(null, null, catalog);
  Object.assign(state.profile, {goal:'any-degree', degreeLevel:'bachelor', field:'any', modality:'online', priority:'cost'});
  state.learning = [{id:'private-course-record', provider:'Sophia', code:'S1', title:'My original writing record', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
  state.sheet.notes = {private:'Private note must stay on this device'};
  state.scenarios = Object.fromEntries(models.map(model => [model.id, {
    providers:['Sophia'], allowConditional:true, sophiaWeeks:1, termWeeks:10, termCredits:3
  }]));
  return {state, catalog, models, costs:{}};
}

function build(data, settings = options, onProgress) {
  return Comparison.build(data.state, data.catalog, data.models, data.costs, settings, {onProgress});
}

function observed(data, settings = options) {
  const packets = [];
  const view = build(data, settings, packet => packets.push(copy(packet)));
  return {packets, view};
}

function instrumentedComparison(events) {
  const wrappedGuide = {...Guide, recommend(profile, catalog, models, learning) {
    events.push({kind:'recommend', full:Boolean(models?.length || learning?.length), pathwayIds:catalog.pathways.map(route => route.id)});
    return Guide.recommend(profile, catalog, models, learning);
  }};
  const context = {
    console, URL, URLSearchParams, Intl, module:{exports:{}},
    require(name) {return name === './guide-engine.js' ? wrappedGuide : require(path.join(__dirname, 'dist', name));}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/plan-comparison-engine.js'), 'utf8'), context, {filename:'plan-comparison-engine.js'});
  return context.module.exports;
}

function assertProgress(packets, expectedIds) {
  assert.equal(packets[0]?.phase, 'started', 'the complete matching route manifest arrives before candidate summaries');
  assert.deepEqual(new Set(packets[0].matchingRouteIds), new Set(expectedIds));
  assert.equal(packets[0].matchingRouteCount, expectedIds.length);
  const candidates = packets.filter(packet => packet.phase === 'candidate');
  assert.equal(candidates.length, expectedIds.length);
  assert.deepEqual(new Set(candidates.map(packet => packet.candidate.id)), new Set(expectedIds));
  assert.deepEqual(candidates.map(packet => packet.checkedCount), expectedIds.map((_, index) => index+1));
  for (const packet of packets) {
    assert.equal(packet.complete, false);
    assert.equal(packet.recommendation, null);
    assert.equal(packet.matchingRouteCount, expectedIds.length);
    assert.equal('rankingScope' in packet, false, 'an incomplete comparison never exports a ranking scope');
    assert.equal('rankBasis' in packet, false);
    const candidate = packet.candidate;
    if (!candidate) continue;
    assert.deepEqual(Object.keys(candidate).sort(), ['available','eligible','id','pathwayId','reason','summary'].sort());
    if (!candidate.available) assert.equal(candidate.summary, null, 'an invalid plan never exposes numeric plan estimates');
    if (candidate.summary) {
      for (const name of Object.keys(candidate.summary)) assert(summaryKeys.has(name), 'unexpected progress summary field: '+name);
      assert.equal(candidate.summary.provisional, true);
    }
  }
  const serialized = JSON.stringify(packets);
  for (const privateValue of ['private-course-record', 'My original writing record', 'Private note must stay on this device']) {
    assert.equal(serialized.includes(privateValue), false, 'compact progress excludes original records and private notes');
  }
  return candidates;
}

test('automatic progress validates every matching route and leaves the final result and inputs unchanged', () => {
  const data = fixture(), before = copy(data), expected = build(data);
  const {packets, view} = observed(data);
  const candidates = assertProgress(packets, data.catalog.pathways.map(route => 'route:'+route.id));
  assert.deepEqual(view, expected);
  assert.deepEqual(data, before);
  assert.equal(view.rankedCandidates.length, 4);
  assert.equal(view.scenarios.length, 3);
  for (const packet of candidates) {
    const candidate = packet.candidate;
    const checked = build(data, {...options, selectedIds:[candidate.id]}).scenarios[0];
    assert.equal(candidate.available, checked.available);
    assert.equal(candidate.eligible, checked.eligible);
    assert.equal(candidate.pathwayId, checked.pathwayId);
    assert.equal(candidate.summary.applicableCompletedCredits, 3 * Number(candidate.pathwayId !== 'cheap'));
    for (const name of ['degreeCredits','applicableCompletedCredits','confirmedCredits','reportedCredits','remainingCredits','universityCreditsRemaining','universityTuitionRemaining','estimatedBaseCost','remainingCost','estimatedWeeks','creditSystem','collectionFitCredits','collectionFitFraction','completedFitFraction']) {
      assert.deepEqual(candidate.summary[name], checked.summary[name], name+' comes from the same validated plan');
    }
  }
});

test('the complete manifest precedes inventory matching and the first candidate precedes another route match', () => {
  const data = fixture(), events = [], engine = instrumentedComparison(events);
  const expected = build(data);
  const actual = engine.build(data.state, data.catalog, data.models, data.costs, options, {onProgress(packet) {
    events.push({kind:packet.phase, pathwayId:packet.candidate?.pathwayId});
  }});
  const started = events.findIndex(event => event.kind === 'started');
  const fullMatches = events.filter(event => event.kind === 'recommend' && event.full);
  const firstFull = events.findIndex(event => event.kind === 'recommend' && event.full);
  const firstCandidate = events.findIndex(event => event.kind === 'candidate');
  assert(started >= 0 && started < firstFull, 'the profile-only manifest arrives before any full-inventory recommendation');
  assert(events.slice(0, started).some(event => event.kind === 'recommend' && !event.full && event.pathwayIds.length === data.catalog.pathways.length), 'manifest eligibility is checked without models or original course records');
  assert(fullMatches.length >= data.catalog.pathways.length);
  assert(fullMatches.every(event => event.pathwayIds.length === 1), 'direct inventory recommendations process one route at a time');
  const firstRoute = fullMatches[0].pathwayIds[0];
  const anotherRoute = events.findIndex(event => event.kind === 'recommend' && event.full && event.pathwayIds[0] !== firstRoute);
  assert.equal(events[firstCandidate].pathwayId, firstRoute);
  assert(firstCandidate < anotherRoute, 'a fully checked candidate is delivered before inventory matching begins for another route');
  const matchedIds = [], routeIds = data.catalog.pathways.map(route => route.id);
  let checked = 0;
  for (const event of events) {
    if (event.kind === 'recommend' && event.full) matchedIds.push(...event.pathwayIds);
    if (event.kind === 'candidate') {
      checked++;
      assert.deepEqual(matchedIds, routeIds.slice(0, checked), 'each candidate arrives after one full fit for its route and before full fits for future routes');
    }
  }
  assert.deepEqual(copy(actual), copy(expected));
});

test('automatic rankings retain catalog order when complete plan metrics, fit scores and titles tie', () => {
  const data = fixture(), base = copy(data.models[0]);
  for (const model of data.models) {
    model.title = 'Equal degree title';
    model.pricing = copy(base.pricing);
    model.requirements = copy(base.requirements);
  }
  for (const route of data.catalog.pathways) route.title = 'Equal degree title';
  data.state.profile.priority = 'balanced';
  const expectedIds = data.catalog.pathways.map(route => 'route:'+route.id);
  const fullFits = Guide.recommend(data.state.profile, data.catalog, data.models, data.state.learning);
  assert.equal(new Set(fullFits.map(fit => fit.score)).size, 1, 'the fixture gives every route the same inventory and profile score');
  const {view, packets} = observed(data);
  assertProgress(packets, expectedIds);
  assert.deepEqual(view.rankingScope.orderedRouteIds, expectedIds);
  assert.deepEqual(view.scenarios.map(scenario => scenario.id), expectedIds.slice(0,3));
});

test('an empty matching scope emits one empty manifest and completes without a recommendation', () => {
  const data = fixture();
  data.catalog.pathways = [];
  const before = copy(data), {packets, view} = observed(data);
  assertProgress(packets, []);
  assert.equal(packets.length, 1);
  assert.deepEqual(view.scenarios, []);
  assert.equal(view.recommendation, null);
  assert.deepEqual(data, before);
});

test('an unmapped official fallback route appears in one complete manifest and an unavailable candidate', () => {
  const data = fixture();
  data.catalog.pathways = [{
    id:'unmapped-official', title:'Official degree needing research', school:'Test University',
    level:'bachelor', field:'general', fields:['general'], goals:['any-degree'], modalities:['online']
  }];
  data.models = [];
  const before = copy(data), expected = build(data), {packets, view} = observed(data);
  const candidates = assertProgress(packets, ['route:unmapped-official']);
  assert.equal(packets.filter(packet => packet.phase === 'started').length, 1);
  assert.equal(candidates[0].candidate.available, false);
  assert.equal(candidates[0].candidate.summary, null);
  assert.match(candidates[0].candidate.reason, /exact course and transfer map still needs research/i);
  assert.equal(view.scenarios.length, 1);
  assert.equal(view.scenarios[0].id, 'route:unmapped-official');
  assert.equal(view.scenarios[0].available, false);
  assert.deepEqual(view, expected);
  assert.deepEqual(data, before);
});

test('an unpriced fourth route stays in the progress manifest and prevents a final cost winner', () => {
  const data = fixture();
  delete data.models.find(model => model.id === 'cheap').pricing;
  const {packets, view} = observed(data);
  const candidates = assertProgress(packets, data.catalog.pathways.map(route => 'route:'+route.id));
  const unknown = candidates.find(packet => packet.candidate.pathwayId === 'cheap').candidate;
  assert.equal(unknown.available, true);
  assert.equal(unknown.summary.estimatedBaseCost, null);
  assert.equal(view.rankingScope.eligibleCount, 4);
  assert.equal(view.rankingScope.comparable, false);
  assert.equal(view.recommendation, null);
  assert.equal(view.scenarios.some(scenario => scenario.pathwayId === 'cheap'), false);
});

test('an unscheduled fourth route stays pending until checked and prevents a final speed winner', () => {
  const data = fixture();
  data.state.profile.priority = 'speed';
  delete data.state.scenarios.cheap.termWeeks;
  const {packets, view} = observed(data);
  const candidates = assertProgress(packets, data.catalog.pathways.map(route => 'route:'+route.id));
  assert.equal(candidates.find(packet => packet.candidate.pathwayId === 'cheap').candidate.summary.estimatedWeeks, null);
  assert.equal(view.rankingScope.eligibleCount, 4);
  assert.equal(view.recommendation, null);
});

test('invalid matching plans emit an unavailable result with no academic, cost or time summary', () => {
  const data = fixture();
  data.state.scenarios.cheap.optionSelections = {writing:'not-an-option'};
  const {packets, view} = observed(data);
  const candidates = assertProgress(packets, data.catalog.pathways.map(route => 'route:'+route.id));
  const invalid = candidates.find(packet => packet.candidate.pathwayId === 'cheap').candidate;
  assert.equal(invalid.available, false);
  assert.equal(invalid.summary, null);
  assert.equal(typeof invalid.reason, 'string');
  assert.equal(view.rankedCandidates.find(candidate => candidate.pathwayId === 'cheap').available, false);
});

test('manual comparisons announce only selected plans and retain their explicit final scope', () => {
  const data = fixture(), selectedIds = ['route:course-fit','route:known-a','route:known-b'];
  delete data.models.find(model => model.id === 'cheap').pricing;
  const {packets, view} = observed(data, {...options, selectedIds});
  assertProgress(packets, selectedIds);
  assert.equal(view.rankingScope.mode, 'selected-plans');
  assert.equal(view.rankingScope.eligibleCount, 3);
  assert.equal(view.recommendation.id, 'route:course-fit');
});

test('a current plan appears once in an automatic manifest and is checked alongside every alternative', () => {
  const data = fixture();
  data.state = Journey.selectRoute(data.state, data.catalog.pathways[0], data.catalog);
  const before = copy(data);
  const {packets, view} = observed(data);
  const expectedIds = ['current', ...data.catalog.pathways.slice(1).map(route => 'route:'+route.id)];
  const candidates = assertProgress(packets, expectedIds);
  assert.equal(candidates.find(packet => packet.candidate.id === 'current').candidate.pathwayId, 'course-fit');
  assert.equal(view.scenarios[0].id, 'current');
  assert.equal(view.rankingScope.eligibleCount, 4);
  assert.deepEqual(data, before);
});

test('manual current-plan comparisons include the current plan and only the selected alternatives', () => {
  const data = fixture();
  data.state = Journey.selectRoute(data.state, data.catalog.pathways[0], data.catalog);
  const {packets, view} = observed(data, {...options, selectedIds:['route:cheap']});
  assertProgress(packets, ['current','route:cheap']);
  assert.equal(view.rankingScope.mode, 'selected-plans');
  assert.equal(view.rankingScope.eligibleCount, 2);
});

test('an unavailable saved selection finishes its manifest entry without exposing a plan summary', () => {
  const data = fixture(), selectedIds = ['saved:removed-version','route:course-fit'];
  const {packets, view} = observed(data, {...options, selectedIds});
  const candidates = assertProgress(packets, selectedIds);
  const unavailable = candidates.find(packet => packet.candidate.id === selectedIds[0]).candidate;
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.eligible, false);
  assert.equal(unavailable.summary, null);
  assert.match(unavailable.reason, /saved plan|found/i);
  assert.equal(view.scenarios.find(scenario => scenario.id === selectedIds[0]).available, false);
});

test('throwing or mutating a progress observer cannot alter calculation results or private inputs', () => {
  const data = fixture(), before = copy(data), expected = build(data);
  let calls = 0;
  const actual = build(data, options, packet => {
    calls++;
    if (packet.matchingRouteIds) packet.matchingRouteIds.splice(0);
    if (packet.candidate) {
      packet.candidate.id = 'observer-mutated-id';
      if (packet.candidate.summary) {
        packet.candidate.summary.estimatedBaseCost = -123;
        packet.candidate.summary.applicableCompletedCredits = 999;
        if (packet.candidate.summary.fitBreakdown) packet.candidate.summary.fitBreakdown.completedCredits = 999;
      }
    }
    throw Error('The presentation observer failed');
  });
  assert.equal(calls, 5, 'an observer error cannot prevent later candidate updates or completion');
  assert.deepEqual(actual, expected);
  assert.deepEqual(data, before);
});
