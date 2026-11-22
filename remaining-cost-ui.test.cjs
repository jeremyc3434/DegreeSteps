/* Production comparison renderers with real published plans. Browser geometry is covered separately; these checks
 * protect the rule that comparison cards show the same shared planning estimate as the finder and plan pages. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8');
const Planner=require('./dist/planner.js'),Estimate=require('./dist/plan-estimate-engine.js'),EstimateView=require('./dist/plan-estimate-view.js');
const read=path=>JSON.parse(fs.readFileSync(require.resolve('./dist/'+path),'utf8'));
const rates=read('data/plan-estimate-rates.json'),index=read('data/plan-library-index.json'),registry=read('data/curriculum-registry.json'),baselines=read('data/baseline-index.json');
function mount(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,textContent:'',hidden:false,innerHTML:''});return nodes.get(id);};
 const context={document:{getElementById:node},window:{DegreePlanComparison:{},DegreeJourney:require('./dist/journey-engine.js'),DegreeChecklist:require('./dist/student-checklist.js'),DegreePlanEstimate:Estimate,DegreePlanEstimateView:EstimateView},location:{search:''},URL,URLSearchParams,Intl,console};
 context.DegreeChecklist=context.window.DegreeChecklist;
 context.window.window=context.window;
 const boundary=" document.addEventListener('click'";
 assert(script.includes(boundary));
 const journey=script.match(/ const Journey=s=>window\.DegreeJourney\.buildDraft\(s,catalog,models\);/)[0];
 const source=script.slice(0,script.indexOf(boundary))+journey+"window.__ui={bestId,recommendationLabel,costHTML,estimateHTML,nextStepsHTML,card,isSuggestion,setView:value=>view=value,setState:value=>state=value,setRates:value=>estimateRates=value,setData:(routes,ledgers)=>{catalog=routes;models=ledgers;}};}());";
 vm.runInNewContext(source,context,{filename:'compare-plans.js'});
 const ui=context.window.__ui;ui.setRates(rates);ui.setState({profile:{},whatIf:{}});
 return {ui,priority:value=>node('compare-priority').value=value};
}
// The starting route for a published plan, built exactly as the plan library index builds it.
function starting(routeId){
 const baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===routeId),entry=registry.models.find(item=>item.id===baseline.modelId),doc=read(entry.path),model=(doc.models||[doc]).find(item=>item.id===baseline.modelId);
 const providers=[...new Set(model.requirements.flatMap(req=>(req.options||[]).map(option=>option.provider)))].filter(provider=>provider&&provider!=='University');
 const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId])),optimizationNodeBudget:12000});
 return {model,plan};
}
const scenario=(routeId,patch={})=>{const {model,plan}=starting(routeId);return {id:'route:'+routeId,label:routeId,available:true,eligible:true,canUse:true,draft:{pathway:{id:routeId,level:'bachelor',school:model.school,title:model.title},program:model,plan},summary:{remainingCredits:120,universityCreditsRemaining:40,collectionFitFraction:.3,completedFitFraction:.1,remainingCost:1,costBreakdown:{knownSubtotal:334,complete:false}},...patch};};

test('comparison cards show the same planning estimate as the plan library index (finder and plan pages)',()=>{
 const {ui}=mount();
 for(const id of ['liberty-catalog-fa62c08cdfa0c990-online','liberty-criminal-justice-online','wgu-catalog-2e49db64c32dfc79']){
  const expected=index.plans[id].estimate,html=ui.costHTML(scenario(id));
  assert(expected,id+' has a published estimate');
  assert.match(html,new RegExp('data-estimate-min="'+expected.min+'" data-estimate-max="'+expected.max+'"'),id);
  const fmt=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
  assert(html.includes(fmt(expected.min)+'–'+fmt(expected.max)),id+' shows the shared range');
  assert.match(html,/Planning estimate/);assert.doesNotMatch(html,/Known costs so far|\$334|Tuition \+ courses estimate/);
  assert.doesNotMatch(html,/data-action="cost-time"/,'the worksheet tray button is not shown on the compare page');
 }
});
test('a plan without a shared estimate says the cost needs confirmation and never shows a partial sum',()=>{
 const {ui}=mount(),id='liberty-catalog-0610d6f6373438cc-online';
 assert.equal(index.plans[id].estimate,undefined);
 const s=scenario(id),html=ui.estimateHTML(s);
 assert.match(html,/Cost needs confirmation/);assert.match(html,/data-remaining-cost="needs-confirmation"/);assert.doesNotMatch(html,/\$\d/);
 const broken=ui.estimateHTML({...scenario('liberty-catalog-fa62c08cdfa0c990-online'),draft:{pathway:{level:'bachelor'},program:{id:'x'},plan:{rows:[]}}});
 assert.match(broken,/Cost needs confirmation/);assert.doesNotMatch(broken,/\$\d/);
});
test('cost priority ranks by the shared estimate low end, then midpoint',()=>{
 const {ui,priority}=mount();priority('cost');
 const psych=scenario('liberty-catalog-fa62c08cdfa0c990-online'),cj=scenario('liberty-criminal-justice-online'),wgu=scenario('wgu-catalog-2e49db64c32dfc79');
 ui.setView({scenarios:[cj,psych]});assert.equal(ui.bestId(),psych.id);assert.equal(ui.recommendationLabel(true),'Lowest estimated cost');
 ui.setView({scenarios:[cj,psych,wgu]});assert.equal(ui.bestId(),wgu.id);
});
test('a plan without a shared estimate prevents a lowest-cost winner',()=>{
 const {ui,priority}=mount();priority('cost');
 ui.setView({scenarios:[scenario('liberty-catalog-fa62c08cdfa0c990-online'),scenario('liberty-catalog-0610d6f6373438cc-online')]});assert.equal(ui.bestId(),null);
 ui.setView({scenarios:[scenario('liberty-catalog-fa62c08cdfa0c990-online'),scenario('liberty-criminal-justice-online')],rankingScope:{mode:'eligible-routes',comparable:false}});assert.equal(ui.bestId(),null,'an automatic shortlist with an omitted unpriced plan has no winner');
});
test('different degree levels do not receive a false winner',()=>{
 const {ui,priority}=mount();priority('cost');const graduate=scenario('liberty-criminal-justice-online');graduate.draft.pathway.level='master';
 ui.setView({scenarios:[scenario('liberty-catalog-fa62c08cdfa0c990-online'),graduate]});assert.equal(ui.bestId(),null);
});
test('a plan the student did not choose is labelled as a suggestion',()=>{
 const {ui}=mount(),route=scenario('liberty-criminal-justice-online');
 ui.setState({profile:{},whatIf:{}});ui.setView({scenarios:[route],hasTarget:true,matrix:[]});
 assert.equal(ui.isSuggestion(route),true);let html=ui.card(route,1,null);assert.match(html,/Suggested to compare/);assert.match(html,/added this plan as a suggestion/);
 ui.setState({profile:{},whatIf:{selectedIds:['route:liberty-criminal-justice-online']}});
 assert.equal(ui.isSuggestion(route),false);html=ui.card(route,1,null);assert.doesNotMatch(html,/Suggested to compare|as a suggestion/);
 assert.equal(ui.isSuggestion({...route,id:'current',isCurrent:true}),false);
});
test('university work stays separate from total remaining credit',()=>{
 const {ui}=mount(),html=ui.estimateHTML({...scenario('liberty-catalog-fa62c08cdfa0c990-online'),isCurrent:true,summary:{remainingCredits:90,universityCreditsRemaining:30}});
 assert.match(html,/data-remaining-credits>90/);assert.match(html,/data-university-credits>30/);assert.match(html,/Finished courses are excluded from remaining costs./);
});
test('first steps reuse the actual checklist including military records without writing or mutating the plan',()=>{
 const {ui}=mount(),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js'),catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),route=catalog.pathways.find(row=>row.id==='liberty-business-residential'),model=require('./dist/data/liberty.json');
 const state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),route),null,catalog);state.profile.militaryStatus='veteran';state.profile.militaryRecords='jst';state.profile.hasPrior='some';
 ui.setData(catalog,[model]);const before=JSON.stringify(state),html=ui.nextStepsHTML(state);
 assert.match(html,/Your first 3 steps/);assert.match(html,/Request your Joint Services Transcript \(JST\)/);assert.equal((html.match(/<li>/g)||[]).length,3);assert.equal(JSON.stringify(state),before);assert.doesNotMatch(html,/<a /);
});
