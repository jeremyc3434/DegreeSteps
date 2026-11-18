/* A mutable current catalog needs its reviewed identity, never a guessed year. */
const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Savings=require('./dist/savings-engine.js'),Comparison=require('./dist/plan-comparison-engine.js'),Cost=require('./dist/cost-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const costs=require('./dist/data/cost-comparisons.json');
function fixture(){
 const program=copy(require('./dist/data/curricula/tesu-accounting.json').models[0]);
 const route=catalog.pathways.find(route=>route.modelId===program.id);assert(route,'The reviewed Accounting plan must be selectable');
 let state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality='online';state.profile.hasPrior='none';
 const draft=Journey.buildDraft(state,catalog,[program]);assert(draft.plan,'The selected route must produce a course plan');return{program,state,draft};
}
test('current Accounting catalog returns published tuition without inventing an academic year',()=>{
 const f=fixture(),before=JSON.stringify([f.state,f.draft,costs]),estimate=Savings.calculate(f.state,f.draft,costs);
 assert.equal(f.program.catalogYear,null);assert.equal(f.program.catalogIdentity.kind,'reviewed-current-catalog');
 assert.equal(estimate.available,true,estimate.reason);assert.equal(estimate.entryId,'tesu-standard');assert.equal(estimate.rateBasis,'published');
 assert.equal(estimate.earned.transferCredits,0);assert.equal(estimate.provisional,true);
 const remaining=f.draft.plan.rows.filter(row=>row.status==='planned'&&row.institutional).reduce((sum,row)=>sum+row.credits,0),entry=costs.entries.find(entry=>entry.id==='tesu-standard');
 const expected=Cost.calculate({...entry,totalUnits:remaining,scenarioTransferLimit:0},{transferUnits:0,outsideBudget:0,unitsPerTerm:estimate.assumptions.unitsPerTerm});
 assert.equal(Comparison.remainingCosts(f.draft,f.state,costs).universityTuition,expected.afterTuition);
 assert.equal(JSON.stringify([f.state,f.draft,costs]),before);
});
test('changed catalog, review, model or evidence cannot reuse the current-catalog rate binding',()=>{
 const f=fixture();
 const mutations=[
  p=>p.catalogIdentity.kind='unreviewed',
  p=>p.tuitionComparison.catalogIdentity.label='Another catalog',
  p=>p.catalog='Another current catalog',
  p=>p.tuitionComparison.modelId='tesu-general-management',
  p=>p.tuitionComparison.catalogIdentity.sourceUrl='https://example.edu/another-degree',
  p=>p.catalogIdentity.checkedOn='2026-11-17',
  p=>p.tuitionComparison.checkedOn='2026-02-30',
  p=>{p.catalogIdentity.checkedOn=p.tuitionComparison.catalogIdentity.checkedOn=p.tuitionComparison.checkedOn='2026-11-17';},
  p=>p.sources=p.sources.filter(source=>source.url!==p.catalogIdentity.sourceUrl),
  p=>p.catalogYear='2026-2027',
  p=>p.tuitionComparison.catalogYear='2026-2027',
  p=>{delete p.catalog;delete p.catalogIdentity.label;delete p.tuitionComparison.catalogIdentity.label;},
  p=>{p.catalog=p.catalogIdentity.label=p.tuitionComparison.catalogIdentity.label=' ';},
  p=>{delete p.id;delete p.tuitionComparison.modelId;},
  p=>p.format='Residential',
  p=>p.school='Another university',
  p=>p.creditSystem='quarter',
  p=>p.auditProvenance={status:'student-provided'}
 ];
 for(const mutate of mutations){const draft=copy(f.draft);mutate(draft.program);draft.plan.programId=draft.program.id;const estimate=Savings.calculate(f.state,draft,costs);assert.equal(estimate.available,false,mutate.toString());assert.equal(estimate.projected.afterTuition,null);}
});
test('a newly reviewed current identity does not require changing the catalog to a made-up edition',()=>{
 const f=fixture(),draft=copy(f.draft),program=draft.program,date='2026-11-19';
 program.catalog=program.catalogIdentity.label=program.tuitionComparison.catalogIdentity.label='Current undergraduate catalog · checked November 19, 2026';
 program.catalogIdentity.checkedOn=program.tuitionComparison.catalogIdentity.checkedOn=program.tuitionComparison.checkedOn=date;
 for(const source of program.sources)if(source.url===program.catalogIdentity.sourceUrl)source.checked=date;
 assert.equal(Savings.calculate(f.state,draft,costs).available,true);assert.equal(program.catalogYear,null);
});
