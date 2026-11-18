/* Real worksheet event handlers with synthetic browser storage; no network or accounts. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Guide=require('./dist/guide-engine.js'),Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),View=require('./dist/course-plan-view.js');
const KEY='degreepath-guide-v3',clone=value=>JSON.parse(JSON.stringify(value));
function mount(options={}){
  const full=Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json'));
  const routes=['tesu-general-management','liberty-business-residential'].map(id=>full.pathways.find(route=>route.modelId===id));
  const catalog={...full,pathways:routes},models=[require('./dist/data/tesu.json'),require('./dist/data/liberty.json')];
  let initial=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),routes[0]),null,catalog);initial.profile.hasPrior='none';
  const storage=new Map([[KEY,JSON.stringify(initial)]]),nodes=new Map(),events=new Map(),windowEvents=new Map(),writes=[],navigations=[],savingsCallbacks=[],momentumCallbacks=[],reportedErrors=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{id,hidden:false,open:false,innerHTML:'',textContent:'',value:'',dataset:{},isConnected:true,disabled:false,children:[],classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];},querySelector(){return null;},querySelectorAll(){return[];},insertAdjacentHTML(position,value){this.innerHTML+=value;},prepend(value){this.children.unshift(value);},append(value){this.children.push(value);},focus(){},showModal(){this.open=true;},close(){this.open=false;},closest(){return null;}});return nodes.get(id);}
  node('sheet-error').hidden=true;
  const document={getElementById:node,activeElement:null,body:{classList:{add(){},contains(){return false;},toggle(){}}},querySelectorAll(){return[];},querySelector(){return null;},createElement(tag){return{tagName:tag.toUpperCase(),setAttribute(name,value){this[name]=value;},append(){},textContent:'',innerHTML:''};},addEventListener(type,callback){if(!events.has(type))events.set(type,[]);events.get(type).push(callback);},dispatchEvent(){}};
  const context={console:{...console,error(error){reportedErrors.push(error.message);}},URL,URLSearchParams,Intl,Math,Date,JSON,CSS:{escape:x=>x},document,location:{search:options.editor?'?editor=1':'',assign(value){navigations.push(value);},replace(value){navigations.push(value);}},localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem(key,value){storage.set(key,value);writes.push(JSON.parse(value));}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout(){return 1;},clearTimeout(){},addEventListener(type,callback){if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(callback);},async fetch(url){if(url==='data/pathways.json')return{ok:true,json:async()=>catalog};if(url==='data/credit-sources.json')return{ok:true,json:async()=>({sources:[]})};if(url==='data/course-catalog.json')return{ok:true,json:async()=>({courses:[]})};throw Error('No network is allowed');},DegreeSheet:Sheet,DegreeJourney:Journey,DegreeGuide:Guide,DegreePlanner:Planner,DegreeProgramCatalog:{...Catalog,load:async()=>catalog,loadModels:async()=>models},DegreeCoursePlanView:View,__fixture:{state:initial,catalog,models}};
  if(options.widgets){context.DegreeSavingsTracker={update(node,state,draft,options){savingsCallbacks.push(options.onChange);}};context.DegreeMomentum={update(node,state,draft,options){momentumCallbacks.push(options.onChange);}};}
  context.window=context;
  const source=fs.readFileSync('dist/sheet.js','utf8'),boundary=source.lastIndexOf('  boot();');assert(boundary>0);
  const hooks="state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;storageBaseline=localStorage.getItem(KEY);generate();window.__sheetTest={render,handleAction,refreshSavedPlan,latestPlanState,choose,boot,getState:()=>state,getProgram:()=>program};}());";
  vm.runInNewContext(source.slice(0,boundary)+hooks,context,{filename:'sheet.js'});
  const ui={node,storage,writes,navigations,routes,savingsCallbacks,momentumCallbacks,reportedErrors,api:context.__sheetTest,saved(){return JSON.parse(storage.get(KEY));},update(update){const value=JSON.parse(storage.get(KEY));update(value);storage.set(KEY,JSON.stringify(value));return value;},async flush(){for(let n=0;n<25;n++)await Promise.resolve();},async click(dataset={},id='test-button'){const button={id,dataset,isConnected:true,hasAttribute(){return false;},closest(selector){return selector==='button'?this:null;}};for(const callback of events.get('click')||[])await callback({target:button});await this.flush();},async progress(requirement,value){const target={dataset:{progress:requirement},value,closest(){return null;}};for(const callback of events.get('change')||[])await callback({target});await this.flush();},async window(type){for(const callback of windowEvents.get(type)||[])callback({type,key:KEY});await this.flush();}};
  ui.api.render();writes.length=0;return ui;
}
const interest={id:'other-tab-course',provider:'Sophia',code:'SOPH-0060',title:'Course saved in My courses',credits:3,creditSystem:'semester',status:'saved',evaluations:[]};

test('a stale progress filter preserves a course imported in another tab without awarding credit',async()=>{
  const ui=mount();ui.update(state=>{state.learning.push(clone(interest));state.profile.goalDetail='Latest motivation';state.checklist={version:1,plans:{test:{custom:[]}}};state.sheet.notes={kept:{row:'Latest note'}};});
  await ui.click({progressFilter:'completed'});
  const saved=ui.saved();assert.deepEqual(saved.learning,[interest]);assert.equal(saved.profile.goalDetail,'Latest motivation');assert.equal(saved.sheet.notes.kept.row,'Latest note');assert(saved.checklist.plans.test);assert.equal(ui.api.getState().learning.length,1);
});

test('Compare degrees navigates using the saved draft and never writes the stale sheet snapshot',async()=>{
  const ui=mount();const fresh=ui.update(state=>{state.learning.push(clone(interest));state.profile.goalDetail='Retain this';});
  await ui.click({action:'compare-plans'});assert.deepEqual(ui.navigations,['compare-plans.html']);assert.equal(ui.writes.length,0);assert.deepEqual(ui.saved(),fresh);
});

test('a stale completion is rejected; repeating it on the refreshed plan preserves the other course',async()=>{
  const ui=mount();ui.update(state=>state.learning.push(clone(interest)));
  await ui.progress('enc1010','completed');assert.deepEqual(ui.saved().learning,[interest]);
  await ui.progress('enc1010','completed');const saved=ui.saved();assert.equal(saved.learning.length,2);assert.deepEqual(saved.learning.find(row=>row.id===interest.id),interest);assert.equal(saved.learning.filter(row=>row.status==='earned').length,1);
});

test('storage, focus and restored-page events load the new target and retain all private records',async()=>{
  for(const type of ['storage','focus','pageshow']){
    const ui=mount();ui.update(state=>{const changed=Sheet.selectPathway(state,ui.routes[1]);Object.assign(state,changed);state.learning.push(clone(interest));state.sheet.notes={old:{row:'Keep previous degree note'}};});
    await ui.window(type);assert.equal(ui.saved().selectedPathwayId,ui.routes[1].id);assert.equal(ui.api.getState().selectedPathwayId,ui.routes[1].id);assert.deepEqual(ui.saved().learning,[interest]);assert.equal(ui.saved().sheet.notes.old.row,'Keep previous degree note');assert.match(ui.node('sheet-titlebar').innerHTML,/Liberty University/);
  }
});

test('an external change preserves an open note and blocks its stale save until the dialog closes',async()=>{
  const ui=mount();ui.node('sheet-dialog').open=true;ui.node('sheet-dialog-content').innerHTML='Original open form';ui.node('sheet-row-note').value='My unsaved note';
  const fresh=ui.update(state=>{state.learning.push(clone(interest));state.sheet.notes={other:{row:'Newer private note'}};});
  await ui.window('storage');assert.equal(ui.node('sheet-dialog-content').innerHTML,'Original open form');assert.equal(ui.node('sheet-row-note').value,'My unsaved note');assert.equal(ui.writes.length,0);
  await ui.click({action:'save-note'});assert.deepEqual(ui.saved(),fresh);assert.equal(ui.node('sheet-row-note').value,'My unsaved note');assert.match(ui.node('sheet-dialog-update').textContent,/unsaved text/);
  await ui.click({},'close-sheet-dialog');assert.equal(ui.node('sheet-dialog').open,false);assert.deepEqual(ui.saved().learning,[interest]);assert.equal(ui.api.getState().sheet.notes.other.row,'Newer private note');
});

test('reading a fresh degree preview alone cannot authorize a stale write',async()=>{
  const ui=mount();ui.update(state=>state.learning.push(clone(interest)));assert.equal(ui.api.latestPlanState().learning.length,1);
  await ui.click({priority:'speed'});assert.deepEqual(ui.saved().learning,[interest]);
});

test('corrupt, malformed and removed drafts are never replaced by the old plan',async()=>{
  for(const raw of ['{broken',JSON.stringify({version:3,profile:[],learning:[]}),JSON.stringify({version:3,profile:{},learning:{}}),null]){
    const ui=mount();if(raw===null)ui.storage.delete(KEY);else ui.storage.set(KEY,raw);
    await ui.click({progressFilter:'completed'});await ui.window('focus');await ui.click({action:'compare-plans'});
    assert.equal(ui.storage.has(KEY)?ui.storage.get(KEY):null,raw);assert.equal(ui.writes.length,0);assert.deepEqual(ui.navigations,[]);assert.equal(ui.node('sheet-error').hidden,false);
  }
});


test('an intentional degree change adopts the latest course collection before saving',async()=>{
  const ui=mount();ui.update(state=>{state.learning.push(clone(interest));state.sheet.notes={previous:{row:'Retain previous degree note'}};state.profile.goalDetail='Newest motivation';});
  assert.equal(await ui.api.choose(ui.routes[1].id),true);assert.equal(ui.saved().selectedPathwayId,ui.routes[1].id);assert.deepEqual(ui.saved().learning,[interest]);assert.equal(ui.saved().sheet.notes.previous.row,'Retain previous degree note');assert.equal(ui.saved().profile.goalDetail,'Newest motivation');
});

test('a second tab update during model refresh cannot restore the earlier collection',async()=>{
  const ui=mount();ui.update(state=>state.learning.push(clone(interest)));const pending=ui.api.refreshSavedPlan();
  const second={...interest,id:'second-tab-course',title:'Another saved course'};ui.update(state=>state.learning.push(second));
  assert.equal(await pending,true);assert.deepEqual(ui.saved().learning,[interest,second]);assert.equal(ui.api.getState().learning.length,2);
});

test('initial page loading never normalizes a corrupt stored draft into a replacement plan',async()=>{
  for(const raw of ['{broken',JSON.stringify({version:3,profile:[],learning:[]})]){
    const ui=mount();ui.storage.set(KEY,raw);await ui.api.boot();assert.equal(ui.storage.get(KEY),raw);assert.equal(ui.writes.length,0);assert.equal(ui.node('sheet-error').hidden,false);assert.match(ui.node('sheet-error').textContent,/not been replaced|needs recovery/);
  }
});


test('stale savings and momentum callbacks report the conflict without throwing or losing courses',async()=>{
  for(const kind of ['savings','momentum']){
    const ui=mount({widgets:true,editor:true}),callback=kind==='savings'?ui.savingsCallbacks[0]:ui.momentumCallbacks[0];assert.equal(typeof callback,'function');
    ui.update(state=>state.learning.push(clone(interest)));assert.doesNotThrow(()=>callback(kind==='savings'?{universityRate:123}:{test:'stale'}));await ui.flush();assert.deepEqual(ui.saved().learning,[interest]);
    assert.notEqual(ui.saved().savings?.[ui.api.getProgram().id]?.universityRate,123);assert.notEqual(ui.saved().momentum?.test,'stale');
  }
});
