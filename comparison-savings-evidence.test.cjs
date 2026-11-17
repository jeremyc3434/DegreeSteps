const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),Comparison=require('./dist/plan-comparison-engine.js'),CoursePlan=require('./dist/course-plan-view.js'),Savings=require('./dist/savings-engine.js');
const data=loadData(),prices=require('./dist/data/cost-comparisons.json');
function build(routeId,learning=[]){
 const route=data.catalog.pathways.find(route=>route.id===routeId);let state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state=Journey.setPriorCredits(state,learning.length?'some':'none');state.learning=structuredClone(learning);state.journey.creditsDeferred=false;
 const draft=Journey.buildDraft(state,data.catalog,data.models),view=Comparison.build(state,data.catalog,data.models,prices,{selectedIds:['current'],deferMatrix:true});return{state,draft,view,scenario:view.scenarios[0]};
}
function card(view,scenario,{matrix=false}={}){
 const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8'),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,innerHTML:'',textContent:'',hidden:false,setAttribute(){}});return nodes.get(id);};
 const context={document:{getElementById:node},location:{search:''},URL,URLSearchParams,Intl,console,DegreeProgramCatalog:require('./dist/program-catalog.js'),AuditCurriculum:require('./dist/audit-curriculum.js')};
 context.window={DegreePlanComparison:Comparison,DegreeJourney:Journey,DegreeCoursePlanView:CoursePlan,DegreeChecklist:require('./dist/student-checklist.js')};
 const at=script.indexOf(" document.addEventListener('click'");assert(at>0);vm.runInNewContext(script.slice(0,at)+'window.__render=(next,item,matrix)=>{view=next;if(matrix){$("comparison-search").value="";$("comparison-filter").value="all";renderMatrix();return $("comparison-matrix").innerHTML;}return card(item,0,null);};}());',context);
 return context.window.__render(view,scenario,matrix);
}
function savingsUI({offline=false}={}){
 const content={innerHTML:''},delta={textContent:''},strip={className:''},details={open:false},apply={addEventListener(){}},node={hidden:false,dataset:{},innerHTML:'',contains(){return false;},querySelector(selector){
  if(selector==='.savings-strip')return this.innerHTML?strip:null;
  if(selector==='.savings-content')return content;
  if(selector==='.savings-delta')return delta;
  if(selector==='.savings-details')return content.innerHTML.includes('savings-details')?details:null;
  if(selector==='.savings-apply')return content.innerHTML.includes('savings-apply')?apply:null;
  return null;
 }};
 const context={window:{DegreeSavings:Savings,DegreeCoursePlanView:CoursePlan},fetch:async()=>{if(offline)throw Error('offline');return{ok:true,json:async()=>structuredClone(prices)};},document:{activeElement:null},location:{href:'https://example.test/plan.html'},URL,Intl,console};
 vm.runInNewContext(fs.readFileSync(require.resolve('./dist/savings-tracker.js'),'utf8'),context);return{node,content,tracker:context.window.DegreeSavingsTracker};
}
test('remaining published and university choices are visible without invented missing-course research',()=>{
 const result=build('wgu-catalog-ecceaa488637ac83'),html=card(result.view,result.scenario);
 assert.match(html,/<strong>69<\/strong> CU in published transfer matches/);assert.match(html,/<strong>41<\/strong> CU in selected university courses/);
 assert.doesNotMatch(html,/eligibility conditions<\/span>|still need a named course|of requirements still need source research/);
 assert.equal(result.scenario.summary.confirmedCredits,0);
});
test('TESU conditional source eligibility remains explicit even when exact school receiving maps exist',()=>{
 const result=build('tesu-general-management'),before=structuredClone(result.state),html=card(result.view,result.scenario);
 assert(result.draft.plan.coverage.conditionalExternalCredits>0);assert.match(html,/credits with eligibility conditions/);assert.match(html,/Specific eligibility conditions/);assert.match(html,/Sophia/);
 assert.doesNotMatch(html,/Transfer choices still need school approval|Matches need approval for this degree and catalog/);assert.deepEqual(result.state,before);assert.equal(result.draft.plan.totals.confirmed,0);
});
test('the course matrix keeps original semester credits separate from receiving WGU competency units',()=>{
 const learning=[{id:'saved-ops',provider:'Sophia',code:'SOPH-0086',title:'Operations Management',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}],before=structuredClone(learning),result=build('wgu-catalog-ecceaa488637ac83',learning);
 result.view.courses=result.view.courses.filter(course=>course.recordIds.includes('saved-ops'));
 result.view.matrix=Comparison.courseMatrix(result.view,data.catalog,data.models);result.view.matrixDeferred=false;
 const html=card(result.view,result.scenario,{matrix:true});assert.match(html,/3 semester credits/);assert.match(html,/2 required CU/);assert.doesNotMatch(html,/2 required credits|School confirmed/);assert.deepEqual(learning,before);assert.equal(result.draft.plan.totals.confirmed,0);
});
test('a named Liberty university course stays out of missing-course claims in savings details',async()=>{
 const result=build('liberty-business-residential'),ui=savingsUI(),before=structuredClone(result.state);assert.equal(CoursePlan.build(result.draft).totals.unmapped,0);assert(result.draft.plan.coverage.researchGapCredits>0);
 const snapshot=await ui.tracker.update(ui.node,result.state,result.draft,{simple:true});assert.equal(snapshot.available,true);
 assert.match(ui.content.innerHTML,/data-savings="money"/);assert.doesNotMatch(ui.content.innerHTML,/credits still need course research|researching named course choices|subject to school approval/);assert.deepEqual(result.state,before);
});
test('known WGU tuition remains visible while an unavailable savings comparison never becomes zero savings',async()=>{
 const result=build('wgu-catalog-ecceaa488637ac83'),ui=savingsUI(),before=structuredClone(result.state);
 const snapshot=await ui.tracker.update(ui.node,result.state,result.draft,{simple:true});assert.equal(snapshot.available,false);assert.equal(ui.node.hidden,false);
 assert.match(ui.content.innerHTML,/\$4,050 per 6 months/);assert.match(ui.content.innerHTML,/A savings comparison is not available for this exact degree yet/);assert.match(ui.content.innerHTML,/Set my pace and costs/);
 assert.doesNotMatch(ui.content.innerHTML,/data-savings="money"|Choose a degree with a researched course plan/);assert.deepEqual(result.state,before);
});
test('unbound tuition and a failed savings fetch never produce fabricated rates or lost progress',async()=>{
 const result=build('wgu-catalog-ecceaa488637ac83');result.draft.program=structuredClone(result.draft.program);result.draft.program.pricing.sourceIds=['missing-source'];
 const ui=savingsUI();await ui.tracker.update(ui.node,result.state,result.draft,{simple:true});assert.equal(ui.node.hidden,false);assert.match(ui.content.innerHTML,/Savings estimate pending/);assert.doesNotMatch(ui.content.innerHTML,/\$4,050|data-savings="money"/);
 const disconnected=savingsUI({offline:true}),before=structuredClone(result.state);await disconnected.tracker.update(disconnected.node,result.state,result.draft,{simple:true});
 assert.equal(disconnected.node.hidden,false);assert.match(disconnected.content.innerHTML,/could not load/);assert.doesNotMatch(disconnected.content.innerHTML,/data-savings="money"/);assert.deepEqual(result.state,before);
});
