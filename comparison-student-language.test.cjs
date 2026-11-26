const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),Engine=require('./dist/plan-comparison-engine.js'),CoursePlan=require('./dist/course-plan-view.js');
const data=loadData(),prices=require('./dist/data/cost-comparisons.json');
function scenario(routeId,learning=[]){const route=data.catalog.pathways.find(route=>route.id===routeId);let state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state=Journey.setPriorCredits(state,learning.length?'some':'none');state.learning=structuredClone(learning);state.journey.creditsDeferred=false;const view=Engine.build(state,data.catalog,data.models,prices,{selectedIds:['current'],deferMatrix:true});return{state,view,scenario:view.scenarios[0]};}
function renderer(){
  const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8'),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
  const context={document:{getElementById:node},location:{search:''},URL,URLSearchParams,Intl,console,DegreeProgramCatalog:require('./dist/program-catalog.js'),AuditCurriculum:require('./dist/audit-curriculum.js')};
  context.window={DegreePlanComparison:Engine,DegreeJourney:Journey,DegreeCoursePlanView:CoursePlan,DegreeChecklist:require('./dist/student-checklist.js')};
  const boundary=" document.addEventListener('click'",at=script.indexOf(boundary);assert(at>0);const source=script.slice(0,at)+'window.__render={card:(next,scenario)=>{view=next;state={whatIf:{selectedIds:[scenario.id]}};return card(scenario,0,null);},scope:(nextCatalog,nextIndex)=>{catalog=nextCatalog;planIndex=nextIndex;return comparisonScopeText();}};}());';vm.runInNewContext(source,context,{filename:'compare-plans.js'});return context.window.__render;
}
function render(view,scenario){return renderer().card(view,scenario);}
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

const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('unmatched courses appear beside fit totals, with exact reasons and without claiming rejected credit',()=>{
 const learning=[
  {id:'matched-writing',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},
  ...['earned','in-progress','saved'].map((status,index)=>({id:'unplaced-'+status,provider:'Former college',code:'HIST99'+index,title:'History & culture '+index,credits:index===2?null:3,creditSystem:index===2?null:'semester',status,evaluations:[]}))
 ],original=JSON.stringify(learning),result=scenario('wgu-catalog-ecceaa488637ac83',learning),current=result.scenario,before=JSON.stringify(result.state),html=render(result.view,current);
 assert.equal(current.summary.fitBreakdown.needsReviewCount,3);assert.equal(current.summary.applicableCompletedCredits,3);assert.equal(current.summary.confirmedCredits,0);
 assert.match(html,/<summary>3 courses not matched yet<\/summary>/);assert.match(html,/These courses have no placement in this degree plan yet/);assert.match(html,/A missing match does not mean the school will reject your course/);
 const placement=html.indexOf('data-course-review');assert(placement>html.indexOf('data-collection-fit-credits'));assert(placement<html.indexOf('comparison-course-coverage'));assert(placement<html.indexOf('data-remaining-cost'));
 for(const course of current.summary.reviewCourses){assert(html.includes('data-review-course="'+course.id+'"'));assert(html.includes(escapeHTML(course.reason)),'Each exact matching reason is retained');assert(html.includes(escapeHTML(course.title)));}
 for(const status of ['Completed','In progress','Saved'])assert(html.includes('Former college · '+status));
 assert.match(html,/href="courses.html\?tab=mine"/);assert.equal(JSON.stringify(result.state),before);assert.equal(JSON.stringify(learning),original);
});
test('unmatched disclosure uses a course count and disappears when every course is placed',()=>{
 const missing={id:'unplaced',provider:'Former college',code:'HIST999',title:'Original history',credits:4,creditSystem:'quarter',status:'earned',evaluations:[]},unmatched=scenario('wgu-catalog-ecceaa488637ac83',[missing]);
 assert.match(render(unmatched.view,unmatched.scenario),/<summary>1 course not matched yet<\/summary>/);
 const matched=scenario('wgu-catalog-ecceaa488637ac83',[{id:'placed',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}]);
 assert.equal(matched.scenario.summary.fitBreakdown.needsReviewCount,0);assert.doesNotMatch(render(matched.view,matched.scenario),/data-course-review/);
});
test('comparison scope uses one reviewed plan set for suggestions and picker choices',()=>{
 const Catalog=require('./dist/program-catalog.js'),registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),index=require('./dist/data/plan-library-index.json');
 const catalog=Catalog.attachPublicationIndex(data.catalog,publication,registry),before=JSON.stringify(catalog),reviewed=Catalog.publishedPlans(catalog),selectable=Catalog.planLibraryRoutes(catalog,[],index),confirmation=selectable.filter(route=>Catalog.needsSchoolConfirmation(route,index));
 assert.equal(selectable.length,catalog.publicationIndex.plans.length);assert.equal(new Set(selectable.map(route=>route.modelId)).size,selectable.length);assert(selectable.length<=reviewed.length,'Published aliases do not create additional degree choices.');assert.equal(confirmation.length,0);
 const scope=renderer().scope(catalog,index);assert(scope.startsWith('Choose or compare '+selectable.length+' reviewed degree plans.'));assert(scope.includes('Your current plan and saved versions stay available.'));assert(!scope.includes('Needs school confirmation'));
 assert.equal(JSON.stringify(catalog),before);assert.deepEqual(Catalog.publishedPlans(catalog).map(route=>route.id),reviewed.map(route=>route.id));
});

test('each comparison keeps one early plan action with the existing availability and adoption guards',()=>{
 const result=scenario('liberty-business-residential'),before=JSON.stringify(result.state),base=result.scenario;
 for(const entry of [
  {isCurrent:true,canUse:true,available:true,expected:'open'},
  {isCurrent:true,canUse:false,available:false,expected:'open'},
  {isCurrent:false,canUse:true,available:true,expected:'use'},
  {isCurrent:false,canUse:false,available:true,expected:'none'},
  {isCurrent:false,canUse:true,available:false,expected:'none'},
  {isCurrent:false,canUse:false,available:false,expected:'none'}
 ]){
  const option={...base,...entry,summary:entry.available?base.summary:null,id:entry.isCurrent?'current':'route:alternate'},html=render(result.view,option),opens=[...html.matchAll(/class="comparison-open-plan"/g)],uses=[...html.matchAll(/data-use-plan="([^"]+)"/g)];
  assert.equal(opens.length,entry.expected==='open'?1:0);assert.equal(uses.length,entry.expected==='use'?1:0);
  if(entry.expected==='none')continue;
  const action=(opens[0]||uses[0]).index;assert(action>html.indexOf('class="comparison-school"'),'Identify the school before the action');if(entry.available){assert(action<html.indexOf('class="comparison-progress"'),'The action precedes progress');assert(action<html.indexOf('class="comparison-fit"'),'The action precedes the detailed metrics');}else assert(action<html.indexOf('class="comparison-unmapped"'),'Current plan recovery stays above unavailable-plan guidance');assert(action<html.indexOf('class="comparison-source"'),'The action precedes source disclosures');
  if(entry.expected==='use')assert.equal(uses[0][1],option.id);else assert.match(html,/<a class="comparison-open-plan" href="plan.html">Open my plan/);
  if(entry.available){assert.match(html,/data-collection-fit-credits/);assert.match(html,/data-remaining-cost/);}assert.match(html,/Sources and conditions/,'The detailed worksheet evidence remains available');
 }
 assert.equal(JSON.stringify(result.state),before);
});
