const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),Comparison=require('./dist/plan-comparison-engine.js'),Catalog=require('./dist/program-catalog.js');
function scenarioData(){
 const all=loadData(),ids=new Set(['tesu-general-management','liberty-business-residential','liberty-criminal-justice-residential','wgu-catalog-ecceaa488637ac83']),routes=all.catalog.pathways.filter(route=>ids.has(route.id)),modelIds=new Set(routes.map(route=>route.modelId)),models=all.models.filter(model=>modelIds.has(model.id));
 const quality=JSON.parse(fs.readFileSync('dist/data/pathway-quality-report.json','utf8')),reviewed=new Set(quality.programs.filter(item=>item.publication.ready).map(item=>item.modelId)),registry=all.catalog.curriculumRegistry;
 // Use the real publication decisions for these actual routes. Draft TESU
 // coursework remains in the fixture without becoming a ready recommendation.
 const publicationIndex={schemaVersion:1,privateRecordsIncluded:false,registryRevision:quality.registryRevision,curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:models.filter(model=>reviewed.has(model.id)).map(model=>{const matching=routes.filter(route=>route.modelId===model.id),level=Catalog.publicationLevel(matching[0].level);return{modelId:model.id,routeIds:matching.map(route=>route.id),level,publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(model,level)};})};
 return{catalog:Catalog.attachPublicationIndex({...all.catalog,pathways:routes},publicationIndex,registry),models};
}
const data=scenarioData(),KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
const defaultSearch={goal:'any-degree',field:'any',degreeLevel:'unsure',format:'any',priority:'speed'};
function freshExplorer(){let state=Journey.initialize(null,null,data.catalog);state=Journey.applyAnswer(state,'start','explore',data.catalog);state.journey.step='purpose';return state;}
function fixture({initial=freshExplorer(),stored=initial}={}){
  const nodes=new Map(),handlers=new Map(),storage=new Map([[KEY,JSON.stringify(stored)]]);let writes=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},focus(){},querySelector(){return null;},setAttribute(){},insertAdjacentHTML(){}});return nodes.get(id);};
  const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},body:node('body')},location:{pathname:'/portal.html',search:'',assign(){throw Error('No navigation expected in this fixture');},replace(){}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){writes++;storage.set(key,value);}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}},setTimeout(){},clearTimeout(){},dispatchEvent(){},addEventListener(){},scrollTo(){},navigator:{},__fixture:JSON.stringify({state:initial,stored,...data})};context.window=context;vm.createContext(context);
  for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});}
  context.DegreeComparisonRunner={create:()=>({cancel(){},run:(kind,payload)=>Promise.resolve(Comparison.build(copy(payload.state),copy(payload.catalog),copy(payload.models),copy(payload.costs),copy(payload.options)))})};context.fetch=async()=>({ok:true,json:async()=>({entries:[]})});
  const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),hooks=`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;activePlanState=actualSavedTarget(fixture.stored)?clone(fixture.stored):null;render=function(){save();};window.__portal={state:()=>state,about:aboutBody,action,async choose(id){degreePreview={route:catalog.pathways.find(route=>route.id===id)};await action('use-degree');},recommendations:()=>recommendationView?.scenarios.map(scenario=>scenario.pathwayId)||Journey.recommend(state,availableCatalog(),models).slice(0,3).map(result=>result.pathway.id)};`;
  const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());');assert.notEqual(instrumented,source);vm.runInContext(instrumented,context,{filename:'portal.js'});
  return{node,api:context.__portal,state:()=>copy(context.__portal.state()),stored:()=>JSON.parse(storage.get(KEY)),writes:()=>writes,async submit(id,values){for(const handler of handlers.get('submit')||[])await handler({target:{id,values},preventDefault(){}});}};
}
async function chosenExplorer(){const f=fixture();await f.submit('portal-explore-form',defaultSearch);const recommendations=copy(f.api.recommendations());assert.equal(recommendations.length,3);await f.api.choose(recommendations[0]);assert.equal(f.state().journey.step,'about');return{f,recommendations};}

test('explorer Back restores original filters and the same three recommendations',async()=>{
  const {f,recommendations}=await chosenExplorer();assert.notEqual(f.state().profile.field,'any');assert.notEqual(f.state().profile.degreeLevel,'unsure');
  await f.api.action('back');const state=f.state();assert.equal(state.journey.step,'routes');assert.equal(state.profile.field,'any');assert.equal(state.profile.degreeLevel,'unsure');assert.equal(state.profile.priority,'speed');assert.equal(state.profile.school,'');assert.equal(state.selectedPathwayId,'');assert.equal(state.journey.answers.field,'any');assert.equal(state.journey.answers.level,'unsure');assert.deepEqual(copy(f.api.recommendations()),recommendations);
});

test('the original search survives a saved personalization step and reload',async()=>{
  const {f,recommendations}=await chosenExplorer(),saved=f.stored();assert.equal(saved.journey.intakeReturnStep,'routes');
  const reloaded=Journey.initialize(saved,null,data.catalog),next=fixture({initial:reloaded,stored:saved});await next.api.action('back');assert.equal(next.state().journey.step,'routes');assert.equal(next.state().profile.field,'any');assert.equal(next.state().profile.degreeLevel,'unsure');assert.deepEqual(copy(next.api.recommendations()),recommendations);
});

test('a known-school degree returns to that degree browser and asks preferences once',async()=>{
  let initial=Journey.initialize(null,null,data.catalog);initial=Journey.applyAnswer(initial,'start','target',data.catalog);initial=Journey.applyAnswer(initial,'school','Liberty University',data.catalog);initial.journey.step='degree';
  const f=fixture({initial}),route=data.catalog.pathways.find(route=>route.id==='liberty-business-residential');await f.api.choose(route.id);assert.equal(f.state().journey.intakeReturnStep,'degree');const html=f.api.about();assert.equal((html.match(/name="goal"/g)||[]).length,1);assert.equal((html.match(/name="priority"/g)||[]).length,1);
  await f.api.action('back');assert.equal(f.state().journey.step,'degree');assert.equal(f.state().profile.school,'Liberty University');
});

test('answered goal and priority become an editable summary rather than repeated questions',async()=>{
  const {f}=await chosenExplorer(),html=f.api.about();assert.doesNotMatch(html,/name="(?:goal|priority)"/);assert.match(html,/Earn a degree/);assert.match(html,/Finish sooner/);assert.match(html,/Change choices/);assert.match(html,/name="prior"/);assert.match(html,/Military service\? Include your training/);
  await f.submit('portal-about-form',{prior:'none',military:'none',militaryRecords:'not-sure'});const state=f.state();assert.equal(state.journey.completed,true);assert.equal(state.journey.intakeCompleted,true);assert.equal(state.profile.goal,'any-degree');assert.equal(state.profile.priority,'speed');assert.equal(state.profile.hasPrior,'none');
});

test('editing the summary keeps other form answers and does not save until submitted',async()=>{
  const {f}=await chosenExplorer(),before=f.state(),writes=f.writes();f.node('prior-choice').value='some';f.node('military-choice').value='veteran';
  await f.api.action('edit-about-preferences');assert.match(f.node('portal-about-preferences').innerHTML,/name="goal"/);assert.match(f.node('portal-about-preferences').innerHTML,/name="priority"/);assert.equal(f.node('prior-choice').value,'some');assert.equal(f.node('military-choice').value,'veteran');assert.equal(f.writes(),writes);assert.deepEqual(f.state(),before);
  await f.submit('portal-about-form',{goal:'career-growth',priority:'cost',prior:'some',military:'veteran',militaryRecords:'jst'});const state=f.state();assert.equal(state.profile.goal,'career-growth');assert.equal(state.profile.priority,'cost');assert.equal(state.profile.militaryStatus,'veteran');assert.equal(state.profile.militaryRecords,'jst');
});

test('older explorer state can return to recommendations without inventing lost filters',async()=>{
  const {f}=await chosenExplorer(),old=f.state();delete old.journey.explorationSearch;delete old.journey.intakeReturnStep;const next=fixture({initial:old});await next.api.action('back');assert.equal(next.state().journey.step,'routes');assert.equal(next.state().profile.field,old.profile.field);assert.equal(next.state().profile.degreeLevel,old.profile.degreeLevel);
});

test('default profile values alone do not suppress unanswered questions',async()=>{
  const {f}=await chosenExplorer(),old=f.state();delete old.journey.answers.purpose;delete old.journey.answers.priority;const next=fixture({initial:old});assert.match(next.api.about(),/name="goal"/);assert.match(next.api.about(),/name="priority"/);
  await next.submit('portal-about-form',{prior:'none',military:'none'});assert.notEqual(next.state().journey.intakeCompleted,true);assert.match(next.node('portal-step-error').textContent,/degree purpose/);
});

test('searching and going back never overwrite an existing private plan or course records',async()=>{
  const route=data.catalog.pathways.find(route=>route.id==='wgu-catalog-ecceaa488637ac83');let saved=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);saved.journey.completed=true;saved.journey.view='home';saved.journey.intakeCompleted=false;saved.learning=[{id:'saved-course',provider:'Former college',title:'Original history course',code:'HIST101',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];saved.sheet.notes={private:'Keep this note'};
  const original=copy(saved),initial=Journey.applyAnswer(saved,'start','explore',data.catalog);initial.journey.view='questions';initial.journey.step='purpose';const f=fixture({initial,stored:saved});
  await f.submit('portal-explore-form',defaultSearch);const choices=copy(f.api.recommendations());await f.api.choose(choices.find(id=>id!==route.id)||choices[0]);assert.equal(f.state().journey.step,'about');await f.api.action('back');assert.equal(f.writes(),0);assert.deepEqual(f.stored(),original);assert.deepEqual(f.state().learning,original.learning);assert.deepEqual(f.state().sheet.notes,original.sheet.notes);assert.deepEqual(saved,original);
});
