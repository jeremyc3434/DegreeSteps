/* Production comparison renderers with synthetic route data. Browser geometry
 * is covered separately; these checks protect cost scope and ranking behavior. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8');
function mount(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,textContent:'',hidden:false,innerHTML:''});return nodes.get(id);};
 const context={document:{getElementById:node},window:{DegreePlanComparison:{},DegreeJourney:require('./dist/journey-engine.js'),DegreeChecklist:require('./dist/student-checklist.js')},location:{search:''},URL,URLSearchParams,Intl,console};
 context.DegreeChecklist=context.window.DegreeChecklist;
 context.window.window=context.window;
 const boundary=" document.addEventListener('click'";
 assert(script.includes(boundary));
 const journey=script.match(/ const Journey=s=>window\.DegreeJourney\.buildDraft\(s,catalog,models\);/)[0];
 const source=script.slice(0,script.indexOf(boundary))+journey+"window.__ui={bestId,recommendationLabel,costHTML,estimateHTML,nextStepsHTML,card,setView:value=>view=value,setData:(routes,ledgers)=>{catalog=routes;models=ledgers;}};}());";
 vm.runInNewContext(source,context,{filename:'compare-plans.js'});
 return {ui:context.window.__ui,priority:value=>node('compare-priority').value=value};
}
const cost=(patch={})=>({universityTuition:4000,outsideCourses:300,fees:null,estimatedBaseCost:4300,tuitionAndCourses:4300,knownSubtotal:4300,total:null,complete:false,items:[{provider:'Sophia',amount:300,detail:'Three monthly sessions',source:'https://example.edu/prices'}],missing:['University fees still need confirmation.'],assumptions:['Three months of outside study.'],exclusions:['Housing and living costs'],...patch});
const scenario=(id,total,patch={})=>({id,available:true,eligible:true,draft:{pathway:{level:'bachelor'}},summary:{remainingCost:total,costBreakdown:cost({complete:true,total}),collectionFitFraction:.3,completedFitFraction:.1,estimatedWeeks:20,...patch}});

test('tuition and courses stay explicitly partial when other costs are unknown',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost()});
 assert.match(html,/Tuition \+ courses estimate/);assert.match(html,/data-remaining-cost="partial">\$4,300/);assert.match(html,/Personal fees and charges are not yet included/);assert.match(html,/Other required fees<\/dt><dd>Needs estimate/);assert.match(html,/University fees still need confirmation/);assert.match(html,/Three monthly sessions/);assert.match(html,/Housing and living costs/);
});
test('a university-only subtotal never appears as the remaining degree price',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost({outsideCourses:null,estimatedBaseCost:null,tuitionAndCourses:null,knownSubtotal:4000,items:[],missing:['Study.com duration needs an estimate.']})});
 assert.match(html,/Known costs so far/);assert.match(html,/data-remaining-cost="partial">\$4,000/);assert.match(html,/Outside courses and exams<\/dt><dd>Needs estimate/);assert.match(html,/Study.com duration needs an estimate/);
});
test('no priced component offers an estimate prompt rather than a zero price',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost({universityTuition:null,outsideCourses:null,estimatedBaseCost:null,tuitionAndCourses:null,knownSubtotal:0,items:[]})});
 assert.match(html,/data-remaining-cost="partial">Needs estimate/);assert.doesNotMatch(html,/>\$0</);
});
test('zero known outside costs cannot hide missing university tuition as a free route',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost({universityTuition:null,outsideCourses:0,estimatedBaseCost:null,tuitionAndCourses:null,knownSubtotal:0,items:[],missing:['University tuition needs a quote.']})});
 assert.match(html,/data-remaining-cost="partial">Needs estimate/);assert.doesNotMatch(html,/data-remaining-cost="partial">\$0/);assert.match(html,/University tuition needs a quote/);
 const finished=ui.costHTML({costBreakdown:cost({universityTuition:0,outsideCourses:0,fees:0,estimatedBaseCost:0,tuitionAndCourses:0,knownSubtotal:0,total:0,complete:true,items:[],missing:[]})});assert.match(finished,/data-remaining-cost="complete">\$0/);
});
test('a complete scoped estimate includes fees and itemized evidence',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost({fees:125,total:4425,complete:true,knownSubtotal:4425,missing:[]})});
 assert.match(html,/data-remaining-cost="complete">\$4,425/);assert.match(html,/Other required fees<\/dt><dd>\$125/);assert.doesNotMatch(html,/Personal fees and charges are not yet included/);assert.match(html,/href="https:\/\/example.edu\/prices"/);
});
test('student and provider metadata render as text and unsafe links are omitted',()=>{
 const {ui}=mount(),html=ui.costHTML({costBreakdown:cost({items:[{provider:'<img src=x onerror=alert(1)>',amount:null,detail:'<script>steal()</script>',source:'javascript:alert(1)'}],missing:['<b>unknown</b>'],exclusions:['<i>books</i>']})});
 assert.doesNotMatch(html,/<img|<script|href="javascript:/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.match(html,/&lt;b&gt;unknown/);
});
test('incomplete cheaper subtotals cannot win the complete remaining-cost ranking',()=>{
 const {ui,priority}=mount();priority('cost');
 const complete=scenario('complete',5000),partial=scenario('partial',null,{costBreakdown:cost({estimatedBaseCost:10})});
 ui.setView({scenarios:[complete,partial]});assert.equal(ui.bestId(),null);assert.equal(ui.recommendationLabel(false),'Suggested route');
});
test('complete comparable estimates rank by total cost, including zero remaining cost',()=>{
 const {ui,priority}=mount();priority('cost');ui.setView({scenarios:[scenario('higher',5000),scenario('lower',4500),scenario('finished',0)]});
 assert.equal(ui.bestId(),'finished');assert.equal(ui.recommendationLabel(true),'Lowest estimated cost');
});
test('unknown tuition or study time prevents a winner badge over the remaining eligible routes',()=>{
 for(const [metric,field] of [['tuition','universityTuitionRemaining'],['terms','estimatedWeeks']]){
  const {ui,priority}=mount();priority(metric);
  const low=scenario('low',5000,{[field]:10}),high=scenario('high',6000,{[field]:20}),unknown=scenario('unknown',null,{[field]:null});
  ui.setView({scenarios:[low,high,unknown]});assert.equal(ui.bestId(),null,metric+' cannot rank an unknown estimate');
  ui.setView({scenarios:[low,high]});assert.equal(ui.bestId(),'low',metric+' can rank complete comparable estimates');
 }
});
test('cost ties and different degree levels do not receive a false winner',()=>{
 const {ui,priority}=mount();priority('cost');ui.setView({scenarios:[scenario('one',5000),scenario('two',5000)]});assert.equal(ui.bestId(),null);
 const graduate=scenario('master',3000);graduate.draft.pathway.level='master';ui.setView({scenarios:[scenario('bachelor',5000),graduate]});assert.equal(ui.bestId(),null);
});
test('a base-cost suggestion explains excluded fees without a lowest-cost badge',()=>{
 const {ui,priority}=mount();priority('cost');const route=scenario('suggestion',null,{costBreakdown:cost()});route.label='Business';route.draft.pathway.school='Example University';
 ui.setView({scenarios:[route,scenario('other',null,{costBreakdown:cost({estimatedBaseCost:6000,tuitionAndCourses:6000})})],hasTarget:false,recommendation:{id:route.id,metric:'estimatedBaseCost',reason:'Compare tuition and outside courses. Fees still need confirmation.',partial:true}});
 const html=ui.card(route,0,route.id);assert.match(html,/Suggested route/);assert.match(html,/Fees still need confirmation/);assert.doesNotMatch(html,/Lowest estimated cost/);assert.match(html,/Tuition \+ courses estimate/);
});
test('university work stays separate from total remaining credit and estimated pace',()=>{
 const {ui}=mount(),html=ui.estimateHTML({isCurrent:true,summary:{remainingCredits:90,universityCreditsRemaining:30,estimatedWeeks:40,universityTermsRemaining:2,termLabel:'term',estimatedBaseCost:4300,costBreakdown:cost()}});
 assert.match(html,/data-remaining-credits>90/);assert.match(html,/data-university-credits>30/);assert.match(html,/data-study-weeks>40 weeks/);assert.match(html,/Finished courses are excluded from remaining costs./);
});
test('first steps reuse the actual checklist including military records without writing or mutating the plan',()=>{
 const {ui}=mount(),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js'),catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),route=catalog.pathways.find(row=>row.id==='liberty-business-residential'),model=require('./dist/data/liberty.json');
 const state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),route),null,catalog);state.profile.militaryStatus='veteran';state.profile.militaryRecords='jst';state.profile.hasPrior='some';
 ui.setData(catalog,[model]);const before=JSON.stringify(state),html=ui.nextStepsHTML(state);
 assert.match(html,/Your first 3 steps/);assert.match(html,/Request your Joint Services Transcript \(JST\)/);assert.equal((html.match(/<li>/g)||[]).length,3);assert.equal(JSON.stringify(state),before);assert.doesNotMatch(html,/<a /);
});
