const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),Engine=require('./dist/plan-comparison-engine.js'),CoursePlan=require('./dist/course-plan-view.js');
const data=loadData(),prices=require('./dist/data/cost-comparisons.json');
function scenario(routeId,learning=[]){const route=data.catalog.pathways.find(route=>route.id===routeId);let state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state=Journey.setPriorCredits(state,learning.length?'some':'none');state.learning=structuredClone(learning);state.journey.creditsDeferred=false;const view=Engine.build(state,data.catalog,data.models,prices,{selectedIds:['current'],deferMatrix:true});return{state,view,scenario:view.scenarios[0]};}
function render(view,scenario){
  const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8'),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
  const context={document:{getElementById:node},location:{search:''},URL,URLSearchParams,Intl,console,DegreeProgramCatalog:require('./dist/program-catalog.js'),AuditCurriculum:require('./dist/audit-curriculum.js')};
  context.window={DegreePlanComparison:Engine,DegreeJourney:Journey,DegreeCoursePlanView:CoursePlan,DegreeChecklist:require('./dist/student-checklist.js')};
  const boundary=" document.addEventListener('click'",at=script.indexOf(boundary);assert(at>0);const source=script.slice(0,at)+'window.__render=(next,scenario)=>{view=next;return card(scenario,0,null);};}());';vm.runInNewContext(source,context,{filename:'compare-plans.js'});return context.window.__render(view,scenario);
}
for(const routeId of ['wgu-catalog-ecceaa488637ac83','liberty-business-residential'])test('degree comparison keeps published matches and named university courses separate from open research: '+routeId,()=>{
  const result=scenario(routeId),current=result.scenario;assert(current.available);assert.equal(current.draft.plan.coverage.conditionalExternalCredits,0);assert.equal(CoursePlan.build(current.draft).groups.unmapped.length,0);
  const html=render(result.view,current);
  assert.doesNotMatch(html,/Transfer choices still need school approval|Matches need approval for this degree and catalog/i,'Published school facts should not become blanket reapproval homework on the comparison screen');
  assert.doesNotMatch(html,/\d+ (?:credits|CU|competency units) of requirements still need source research/i,'Named university coursework is not a missing requirement ledger');
  assert.match(html,/data-university-credits/);assert.match(html,/data-collection-fit-credits/);
});
test('a personal reported completion remains distinct from a university-confirmed credit award in comparisons',()=>{
  const learning=[{id:'completed-writing',provider:'Sophia',code:'SOPH-0015',title:'My completed English Composition I',credits:3,creditSystem:'semester',status:'earned',grade:'A',completedOn:'2026-11-01',evaluations:[]}],before=structuredClone(learning),result=scenario('wgu-catalog-ecceaa488637ac83',learning),current=result.scenario;
  assert.equal(current.summary.applicableCompletedCredits,3);assert.equal(current.summary.confirmedCredits,0);assert.deepEqual(learning,before);const html=render(result.view,current);assert.match(html,/data-confirmed-credits>0</);assert.match(html,/3 of 110 credits finished/);
});
test('an unresearched current degree never displays invented zero-percent completion or a cost total',()=>{
  const result=scenario('umpi-bls-management'),html=render(result.view,result.scenario);assert.equal(result.scenario.summary,null);assert.equal(result.scenario.available,false);assert.doesNotMatch(html,/data-comparison-progress|data-remaining-cost/);assert.match(html,/Check exact requirements first/);
});
