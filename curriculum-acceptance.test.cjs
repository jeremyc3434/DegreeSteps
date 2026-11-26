/* Acceptance uses the compiled local catalog, registry, ledgers and public APIs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('./dist/program-catalog.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const Compare = require('./dist/plan-comparison-engine.js');
const Facts = require('./dist/program-opportunities.js');
const Planner = require('./dist/planner.js');
const root = path.join(__dirname, 'dist');
const clone = value => JSON.parse(JSON.stringify(value));
const index = require('./dist/data/curriculum-registry.json');
const costs = require('./dist/data/cost-comparisons.json');
const requests = [];
const fetcher = async file => {
  requests.push(file);
  try { const value = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); return {ok:true, json:async () => clone(value)}; }
  catch { return {ok:false, status:404}; }
};
const ready = (async () => {
  const merged = Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json'));
  const catalog = await Catalog.loadIndex(merged, {fetcher, required:true});
  const models = await Catalog.loadModels(index.models.map(entry => entry.id), {fetcher, required:true});
  return {catalog, models};
})();
const pick = (catalog, modelId) => catalog.pathways.find(route => route.modelId === modelId);
const seed = (catalog, route) => Journey.initialize(Sheet.selectPathway(Sheet.initialize(null, null, catalog), route), null, catalog);
const targets = ['curriculum-liberty-psychology-bs-online', 'curriculum-snhu-catalog-8919d742796348bd', 'curriculum-wgu-bs-computer-science-reviewed'];
const inactiveStatuses=new Set(['planned','upcoming','approval-pending','inactive']);
const sourceModelIds=fs.readdirSync(path.join(__dirname,'content/curricula'),{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).flatMap(entry=>{
 const document=JSON.parse(fs.readFileSync(path.join(__dirname,'content/curricula',entry.name),'utf8'));
 return (document.models||document.programs||[]).filter(model=>!inactiveStatuses.has(model.status)).map(model=>model.id);
}).sort();
const standaloneModelIds=Catalog.modelFiles.map(file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).id).sort();

test('all active source and standalone curricula load once per file and preserve exact ledgers without personal awards', async () => {
  const {catalog, models} = await ready;
  const researchedReady=new Map([
    ['curriculum-wgu-catalog-ecceaa488637ac83',{external:69,institutional:41}],
    ['liberty-business-residential',{external:83,institutional:37}],
    ['liberty-criminal-justice-online',{external:72,institutional:48}],
    ['liberty-criminal-justice-residential',{external:74,institutional:46}],
    ['curriculum-gcu-bsba-campus',{external:26,institutional:94}],
    ['curriculum-liberty-healthcare-administration-bs-online',{external:72,institutional:48}],
    ['curriculum-liberty-psychology-bs-online',{external:78,institutional:42}],
    ['curriculum-liberty-history-bs-online',{external:69,institutional:51}],
    ['curriculum-liberty-human-services-bs-online',{external:60,institutional:60}],
    ['curriculum-liberty-psychology-addictions-online',{external:69,institutional:51}],
    ['curriculum-liberty-interdisciplinary-aa-online',{external:39,institutional:21}],
    ['curriculum-liberty-psychology-bs-residential',{external:60,institutional:60}],
    ['curriculum-umpi-maol-yourpace',{external:0,institutional:36}],
    ['curriculum-wgu-bs-data-analytics-reviewed',{external:62,institutional:60}],
    ['curriculum-wgu-bs-cloud-network-engineering-general-reviewed',{external:34,institutional:75}],
    ['curriculum-wgu-bs-cloud-network-engineering-aws-reviewed',{external:34,institutional:78}],
    ['curriculum-wgu-bs-cloud-network-engineering-cisco-reviewed',{external:34,institutional:78}],
    ['curriculum-wgu-bs-cloud-network-engineering-azure-reviewed',{external:34,institutional:78}],
    ['curriculum-wgu-catalog-2e49db64c32dfc79',{external:78,institutional:39}],
    ['curriculum-wgu-catalog-689e417cff765fc9',{external:69,institutional:43}],
    ['curriculum-wgu-catalog-d6925a8fbb6e8d9a',{external:78,institutional:43}],
    ['curriculum-wgu-catalog-c023977432f945c3',{external:60,institutional:55}],
    ['curriculum-wgu-catalog-f5987d0b65c06f56',{external:60,institutional:55}]
  ]);
  // These exact new baselines have separately published research outcomes;
  // their readiness does not grant another model or an unfinished course an award.
  const quality=require('./dist/data/pathway-quality-report.json');
  for(const modelId of ['curriculum-liberty-interdisciplinary-aa-online','curriculum-liberty-psychology-bs-residential','curriculum-umpi-maol-yourpace','curriculum-wgu-bs-data-analytics-reviewed','curriculum-wgu-bs-cloud-network-engineering-general-reviewed','curriculum-wgu-bs-cloud-network-engineering-aws-reviewed','curriculum-wgu-bs-cloud-network-engineering-cisco-reviewed','curriculum-wgu-bs-cloud-network-engineering-azure-reviewed']){
    const outcome=quality.programs.find(program=>program.modelId===modelId),expected=researchedReady.get(modelId);
    assert(outcome,modelId);assert.equal(outcome.publication.ready,true,modelId);
    assert.equal(outcome.research.academicCountsValid,true,modelId);
    assert.equal(outcome.metrics.degreeCredits,expected.external+expected.institutional,modelId);
    assert.equal(outcome.metrics.publishedOutsideCredits,expected.external,modelId);
    assert.equal(outcome.metrics.conditionalOutsideCredits,0,modelId);
    assert.equal(outcome.execution.awardedCreditsInBaseline,0,modelId);
  }
  const observedReady=[];
  assert.deepEqual(index.models.filter(entry=>entry.path.startsWith('data/curricula/')).map(entry=>entry.id).sort(),sourceModelIds,'Every active researched source model must be registered');
  assert.deepEqual(index.models.filter(entry=>Catalog.modelFiles.includes(entry.path)).map(entry=>entry.id).sort(),standaloneModelIds,'Established standalone curricula must remain registered');
  assert.equal(catalog.curriculumRegistry.modelCount,sourceModelIds.length+standaloneModelIds.length);
  assert.deepEqual(models.map(model=>model.id).sort(),[...sourceModelIds,...standaloneModelIds].sort());
  for (const entry of index.models) {
    const route = pick(catalog, entry.id);
    assert(route, entry.id);
    const state = seed(catalog, route), before = JSON.stringify(state);
    const draft = Journey.buildDraft(state, catalog, models);
    assert(draft.plan, entry.id);
    assert.equal(draft.program.id, entry.id);
    assert.equal(draft.plan.rows.length, draft.program.requirements.length, entry.id);
    assert.equal(new Set(draft.plan.rows.map(row => row.requirementId)).size, draft.plan.rows.length, entry.id);
    assert.equal(draft.plan.totals.accounted, draft.program.totalCredits, entry.id);
    assert.equal(draft.plan.validation.academicCountsValid, true, entry.id);
    assert.deepEqual(draft.targetIssues, [], entry.id);
    assert.equal(draft.plan.totals.confirmed, 0, entry.id);
    if(researchedReady.has(entry.id)){
      observedReady.push(entry.id);
      assert.equal(draft.plan.readiness,'review-ready','A complete sourced proposal can be ready to review without an individual award: '+entry.id);
      assert.deepEqual(draft.plan.validation.errors,[],entry.id);
      assert.equal(draft.plan.coverage.conditionalExternalCredits,0,entry.id);
      assert.equal(draft.plan.totals.external,researchedReady.get(entry.id).external,entry.id);
      assert.equal(draft.plan.totals.institutional,researchedReady.get(entry.id).institutional,entry.id);
      const balancePolicy=Planner.creditBalancePolicy(draft.program);
      const inactiveBalance=row=>balancePolicy?.balanceRequirementIds.includes(row.requirementId)&&row.credits===0&&row.option===null;
      assert(draft.plan.rows.every(row=>inactiveBalance(row)||(!row.selectionRequired&&row.option?.evidence==='published')),entry.id);
      const sourceIds=new Set(draft.program.sources.map(source=>source.id));
      for(const row of draft.plan.rows){
        if(inactiveBalance(row))continue;
        assert(row.option.sourceIds.length>0&&row.option.sourceIds.every(id=>sourceIds.has(id)),entry.id+' '+row.requirementId);
        assert.equal(row.status,'planned','Source review must not turn an unfinished course into completed learning: '+entry.id);
      }
    }else{
      assert.equal(draft.plan.readiness,'draft','Open research or individual applicability must remain explicit: '+entry.id);
      assert(draft.plan.validation.errors.length>0,entry.id+' needs a concrete reason for its draft status');
    }
    assert.equal(draft.plan.costs.costComplete, false, entry.id);
    assert.equal(draft.plan.costs.total, null, entry.id);
    assert.equal(JSON.stringify(state), before, 'Build must not mutate saved records: ' + entry.id);
    if (draft.plan.costs.universityCredits > 0 && draft.input.universityRate === 0) assert.equal(draft.plan.costs.universityTuition, null, 'Unknown tuition must not become free: ' + entry.id);
  }
  assert.deepEqual(observedReady.sort(),[...researchedReady.keys()].sort());
  for (const file of new Set(index.models.map(entry => entry.path))) assert.equal(requests.filter(request => request === file).length, 1, file);
});

test('real Liberty Psychology, SNHU Business and WGU Computer Science switch without losing source records, statuses, notes or quotes', async () => {
  const {catalog, models} = await ready;
  const liberty = pick(catalog, targets[0]), source = models.find(model => model.id === liberty.modelId);
  let state = seed(catalog, liberty);
  const providers = ['Sophia', 'Study.com', 'StraighterLine'];
  state.learning = providers.map((provider, i) => {
    const requirement = source.requirements.find(req => req.options.some(option => option.provider === provider));
    const option = requirement.options.find(option => option.provider === provider);
    return {id:'acceptance-' + i, provider, code:option.code || option.id, title:option.title,
      credits:option.sourceCredits || option.bundleCredits || option.credits, creditSystem:option.sourceCreditSystem || option.creditSystem || 'semester',
      status:['earned', 'in-progress', 'saved'][i], privateNote:'Keep source note ' + i,
      evaluations:i ? [] : [{programId:source.id, requirementId:requirement.id, optionId:option.id, status:'confirmed'}]};
  });
  state.sheet.notes = {[source.id]:{'private-advisor-note':'My exact advisor note'}};
  state.scenarios[source.id] = {universityRate:432, fees:99, feesConfirmed:true, providerWeeks:{StraighterLine:7}, optionSelections:{}};
  const original = clone({learning:state.learning, notes:state.sheet.notes, quote:state.scenarios[source.id]});
  for (const modelId of [...targets, targets[0]]) {
    const route = pick(catalog, modelId);
    const remembered = Catalog.rememberPlan(state, Journey.buildDraft(state, catalog, models));
    state = Journey.applyAnswer(remembered, 'school', route.school, catalog);
    state = Journey.applyAnswer(state, 'degree', route.id, catalog);
    state.profile.modality = 'online';
    state.profile.classroomImportance = 'open';
    state = Journey.initialize(JSON.stringify(state), null, catalog);
    const draft = Journey.buildDraft(state, catalog, models);
    assert(draft.plan, modelId);
    assert.equal(draft.program.id, modelId);
    assert.equal(draft.plan.validation.academicCountsValid, true, modelId);
    assert.deepEqual(state.learning, original.learning, modelId);
    assert.deepEqual(state.sheet.notes, original.notes, modelId);
    assert.deepEqual(state.scenarios[source.id], original.quote, modelId);
    if (modelId !== source.id) assert.equal(draft.plan.totals.confirmed, 0, 'School confirmation is exact-degree specific');
  }
  assert(state.whatIf.snapshots.some(snapshot => snapshot.pathwayId === liberty.id));
  assert(state.whatIf.snapshots.every(snapshot => !('learning' in snapshot) && !('notes' in snapshot)));
});

test('real popular plans retain valid counts for time and cost priorities and use sourced prices without zero-tuition claims', async () => {
  const {catalog, models} = await ready;
  for (const modelId of targets) for (const priority of ['speed', 'cost']) {
    const state = seed(catalog, pick(catalog, modelId));
    state.profile.priority = priority;
    const draft = Journey.buildDraft(state, catalog, models);
    assert.equal(draft.plan.validation.academicCountsValid, true, modelId + ' ' + priority);
    assert.equal(draft.plan.totals.accounted, draft.program.totalCredits);
    if(draft.program.pricing?.model==='per-credit'&&Number.isFinite(draft.program.pricing.amount)){
      assert.equal(draft.plan.costs.universityTuition,draft.plan.totals.institutional*draft.program.pricing.amount,modelId+' uses its sourced tuition for a fresh plan');
      assert.equal(draft.input.universityRateBasis,'published-program-price');
      assert.equal(draft.input.universityRateSourceUrl,draft.program.pricing.sourceUrl);
    }else assert.equal(draft.plan.costs.universityTuition,null,modelId+' needs a price quote or subscription term estimate');
    assert.equal(draft.plan.costs.total, null);
  }
  const phoenix = Journey.buildDraft(seed(catalog, pick(catalog, 'curriculum-phoenix-cb-mba')), catalog, models);
  assert.equal(phoenix.input.universityRate, 300);
  assert.equal(phoenix.plan.costs.universityTuition, 9900);
  assert.equal(phoenix.input.universityRateBasis, 'published-program-price');
  assert.match(phoenix.input.universityRateSourceUrl, /^https:\/\//);
  const phoenixState=seed(catalog,pick(catalog,'curriculum-phoenix-cb-mba'));
  assert.equal(Compare.build(phoenixState,catalog,models,costs,{selectedIds:['current'],fromCourses:true}).scenarios[0].summary.universityTuitionRemaining,9900);
  const wguRoute = pick(catalog, targets[2]), state = seed(catalog, wguRoute);
  assert.equal(Facts.priceText(wguRoute), '$4,125 per 6 months');
  state.scenarios[wguRoute.modelId] = {providers:[], universitySubscriptionTerms:3};
  const wgu = Journey.buildDraft(state, catalog, models);
  assert.equal(wgu.plan.costs.universityTuition, 12375);
  assert.equal(wgu.plan.costs.universityRateBasis, 'student-estimated-subscription-terms');
  assert.match(wgu.plan.costs.subscriptionAssumption, /your estimate/);
  const compared=Compare.build(state,catalog,models,costs,{selectedIds:['current'],fromCourses:true}).scenarios[0].summary;
  assert.equal(compared.universityTuitionRemaining,12375);
  assert.equal(compared.universityTermsRemaining,3);
});

test('an actual SNHU free-elective award stays elective in comparison cells and totals', async () => {
  const {catalog, models} = await ready;
  const route = pick(catalog, targets[1]), model = models.find(model => model.id === route.modelId);
  const requirement = model.requirements.find(req => ['elective', 'electives'].includes(req.category));
  const option = requirement.options.find(option => option.provider === 'Sophia');
  const state = seed(catalog, route);
  state.learning = [{id:'actual-elective', provider:option.provider, code:option.code, title:option.title,
    credits:option.sourceCredits || option.credits, creditSystem:option.sourceCreditSystem || 'semester', status:'earned',
    evaluations:[{programId:model.id, requirementId:requirement.id, optionId:option.id, status:'confirmed'}]}];
  for (const category of ['electives', 'elective']) {
    const realModels = clone(models);
    realModels.find(m => m.id === model.id).requirements.find(req => req.id === requirement.id).category = category;
    const result = Compare.build(state, catalog, realModels, costs, {selectedIds:['current']});
    const scenario = result.scenarios[0], cell = result.matrix.find(row => row.course.recordIds.includes('actual-elective')).cells.current;
    assert.equal(scenario.summary.electiveCompletedCredits, requirement.credits, category);
    assert.equal(scenario.summary.requiredCompletedCredits, 0, category);
    assert.equal(cell.placementType, 'elective', category);
  }
});

test('the four established real curricula remain buildable with the expanded index', async () => {
  const {catalog, models} = await ready;
  const legacy = await Catalog.loadModels([], {fetcher, required:true});
  assert.equal(legacy.length, 4);
  for (const model of legacy) {
    const route = pick(catalog, model.id), state = seed(catalog, route);
    const draft = Journey.buildDraft(state, catalog, models);
    assert.equal(draft.program.id, model.id);
    assert.equal(draft.plan.totals.accounted, model.totalCredits);
    assert.equal(draft.plan.validation.academicCountsValid, true, model.id);
  }
});
