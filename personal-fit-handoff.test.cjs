/* Selecting a degree from discovery previews it without rewriting a student's workspace. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Catalog=require('./dist/program-catalog.js'),Library=require('./dist/course-library-engine.js'),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js'),Engine=require('./dist/plan-comparison-engine.js');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json');
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),publication,registry);
const history=catalog.pathways.find(route=>route.modelId==='curriculum-liberty-history-bs-online'),human=catalog.pathways.find(route=>route.modelId==='curriculum-liberty-human-services-bs-online');
function model(id){const entry=registry.models.find(item=>item.id===id),payload=require('./dist/'+entry.path);return(Array.isArray(payload)?payload:payload.models||[payload]).find(item=>item.id===id);}
const models=[model(history.modelId),model(human.modelId)],costs=require('./dist/data/cost-comparisons.json');
const copy=value=>JSON.parse(JSON.stringify(value));
function mount({degree=history.id,from='courses',active=true,format='online',goal='any-degree',writeFails=false,goalReady=true}={}){
 let state=active?Journey.initialize(Sheet.selectPathway(Library.initialize(null),human),null,catalog):Library.initialize(null);
 state.profile={...state.profile,goal,field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open'};
 state.learning=[{id:'earned-writing',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},{id:'saved-art',provider:'Sophia',code:'SOPH-0009',title:'Art History I',credits:3,creditSystem:'semester',status:'saved',evaluations:[]},{id:'quarter-original',provider:'Previous college',code:'PRIVATE 101',title:'Original quarter record',credits:4,creditSystem:'quarter',status:'saved',privateNote:'Preserve my private note',evaluations:[]}];
 state.sheet.notes={private:{note:'Keep this private advisor note'}};state.whatIf={version:1,goalReady,selectedIds:['route:'+human.id],snapshots:[]};
 const before=copy(state),storage=new Map([['degreepath-guide-v3',JSON.stringify(state)]]),writes=[],urls=[],nodes=new Map(),events=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,innerHTML:'',textContent:'',dataset:{},elements:{label:{value:''}},addEventListener(type,callback){events.set(id+':'+type,callback);},setAttribute(){},focus(){},querySelector(){return node(id+'-child');}});return nodes.get(id);}
 node('compare-priority').value='collection';
 const context={console,URL,URLSearchParams,Intl,CustomEvent:class{},setTimeout(){return 1;},clearTimeout(){},document:{getElementById:node,querySelector:node,addEventListener(){}},location:{search:'?'+new URLSearchParams({from,degree,format}),assign(){}},history:{replaceState(_state,_title,url){urls.push(url);}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(writeFails)throw Error('Storage unavailable');storage.set(key,value);writes.push(copy(JSON.parse(value)));}},DegreePlanComparison:Engine,DegreeProgramCatalog:Catalog,DegreeCourseLibrary:Library,DegreeJourney:Journey,DegreeGuide:Guide,addEventListener(){},dispatchEvent(){},__fixture:{state,catalog,models,costs}};
 context.window=context;
 const source=fs.readFileSync('./dist/compare-plans.js','utf8'),boot=source.indexOf(' (async()=>{try{const data=await Promise.all');assert(boot>0);
 const hook='state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;costs=__fixture.costs;view={scenarios:[],selectedIds:[]};window.__handoff={options,linkedRoute,linkedFormat,needsIntent,meta,getState:()=>state};}());';
 vm.runInNewContext(source.slice(0,boot)+hook,context,{filename:'compare-plans.js'});node('compare-formats').checked=context.__handoff.linkedFormat();
 return{api:context.__handoff,before,writes,urls,node,read:()=>JSON.parse(storage.get('degreepath-guide-v3'))};
}
test('a published discovery link previews the exact requested degree beside the active plan without writes',()=>{
 const ui=mount(),options=ui.api.options();
 assert.deepEqual([...options.selectedIds],['route:'+history.id]);assert.equal(options.fromCourses,true);
 const result=Engine.build(ui.read(),catalog,models,costs,options);
 assert.deepEqual(result.scenarios.map(row=>row.pathwayId),[human.id,history.id]);
 const chosen=result.scenarios.find(row=>row.pathwayId===history.id);assert.equal(chosen.available,true);assert.equal(chosen.eligible,true);
 assert.equal(chosen.summary.fitBreakdown.completedCredits,3);assert.equal(chosen.summary.fitBreakdown.savedCredits,3);
 assert.deepEqual(ui.read(),ui.before);assert.equal(ui.writes.length,0);
 const adopted=Engine.applyScenario(ui.read(),chosen.id,catalog,{...options,collectionSelections:chosen.summary.collectionSelections});
 assert.equal(adopted.selectedPathwayId,history.id);assert.deepEqual(adopted.learning,ui.before.learning);assert.deepEqual(adopted.sheet.notes,ui.before.sheet.notes);
 assert.deepEqual(adopted.whatIf.selectedIds,ui.before.whatIf.selectedIds,'The URL does not persist temporary comparison picks');
 assert.deepEqual(Object.fromEntries(Object.entries(adopted.scenarios[history.modelId].optionSelections).filter(([key])=>Object.hasOwn(chosen.summary.collectionSelections,key))),chosen.summary.collectionSelections);
});
test('a targetless student previews only the requested published degree, and a current-degree link does not duplicate it',()=>{
 const targetless=mount({active:false}),result=Engine.build(targetless.read(),catalog,models,costs,targetless.api.options());
 assert.deepEqual(result.scenarios.map(row=>row.pathwayId),[history.id]);assert.equal(targetless.writes.length,0);
 const current=mount({degree:human.id}),view=Engine.build(current.read(),catalog,models,costs,current.api.options());
 assert.deepEqual(view.scenarios.map(row=>row.pathwayId),[human.id]);assert.equal(view.scenarios[0].isCurrent,true);
});
test('unpublished, malformed and unrelated-page degree parameters cannot override saved comparison choices',()=>{
 const unpublished=catalog.pathways.find(route=>route.modelId&&!publication.plans.some(plan=>plan.routeIds.includes(route.id)));
 assert(unpublished);
 for(const config of [{degree:unpublished.id},{degree:'https://example.com/degree'},{degree:'route:'+history.id},{degree:history.id,from:'other'}]){
  const ui=mount(config);assert.equal(ui.api.linkedRoute(),null);assert.deepEqual([...ui.api.options().selectedIds],ui.before.whatIf.selectedIds);assert.deepEqual(ui.read(),ui.before);assert.equal(ui.writes.length,0);
 }
});
test('replacing comparison selections consumes the temporary link while priority changes do not',()=>{
 const ui=mount();assert.equal(ui.api.meta({priority:'credits'}),true);assert.equal(ui.api.linkedRoute().id,history.id);
 assert.equal(ui.api.meta({selectedIds:[]}),true);assert.equal(ui.api.linkedRoute(),null);assert.deepEqual([...ui.api.options().selectedIds],[]);assert.equal(ui.urls.at(-1),'compare-plans.html?from=courses');
 assert.deepEqual(ui.read().learning,ui.before.learning);assert.equal(ui.read().selectedPathwayId,human.id);
 const failed=mount({writeFails:true});assert.equal(failed.api.meta({selectedIds:[]}),false);assert.equal(failed.api.linkedRoute().id,history.id);assert.deepEqual(failed.read(),failed.before);
});
test('a discovery preview never replaces an existing licensed-career goal',()=>{
 const ui=mount({goal:'teacher'}),result=Engine.build(ui.read(),catalog,models,costs,ui.api.options()),chosen=result.scenarios.find(row=>row.pathwayId===history.id);
 assert(chosen);assert.equal(chosen.eligible,false);assert.equal(chosen.state.profile.goal,'teacher');assert.deepEqual(ui.read(),ui.before);assert.equal(ui.writes.length,0);
});
test('only a matching explicit delivery format relaxes the preview format control, without saving preferences',()=>{
 const campus=Catalog.publishedPlans(catalog).find(route=>route.modalities?.includes('campus'));assert(campus);
 for(const [degree,format,expected]of[[history.id,'online',true],[history.id,'campus',false],[campus.id,'campus',true],[campus.id,'unknown',false]]){
  const ui=mount({degree,format});assert.equal(ui.api.options().includeOtherFormats,expected);assert.equal(ui.read().profile.modality,'online');assert.equal(ui.writes.length,0);
 }
});
test('a student who already picked an exact published degree is not stopped by another goal questionnaire',()=>{
 const chosen=mount({active:false,goalReady:false});assert.equal(chosen.api.needsIntent(),false);assert.equal(chosen.writes.length,0);
 const invalid=mount({active:false,goalReady:false,degree:'unpublished-degree'});assert.equal(invalid.api.needsIntent(),true);assert.equal(invalid.writes.length,0);
});
