'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),{loadData}=require('./scripts/audit-student-confirmations.cjs');
const all=loadData(),ids=new Set(['wgu-catalog-ecceaa488637ac83','liberty-business-residential']);
const catalog={...all.catalog,pathways:all.catalog.pathways.filter(r=>ids.has(r.id))},modelIds=new Set(catalog.pathways.map(r=>r.modelId)),models=all.models.filter(m=>modelIds.has(m.id));
const KEY='degreepath-guide-v3',DRAFT='degreesteps-profile-draft-v1',copy=value=>JSON.parse(JSON.stringify(value));
function selected(id='wgu-catalog-ecceaa488637ac83') {const state=Journey.selectRoute(Journey.initialize(null,null,catalog),catalog.pathways.find(r=>r.id===id),catalog);state.journey={...state.journey,completed:true,intakeCompleted:true,view:'home'};return state;}
function fixture({initial=Journey.initialize(null,null,catalog),stored=initial,extraStorage=[]}={}) {
 const storage=new Map(extraStorage),nodes=new Map(),handlers=new Map();if(stored)storage.set(KEY,JSON.stringify(stored));let failPlanWrite=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,classList:{add(){},remove(){},toggle(){}},focus(){},querySelector(){return null;},setAttribute(){},insertAdjacentHTML(){}});return nodes.get(id);};
 class FormData {
  constructor(form){this.rows=Object.entries(form.values||{}).flatMap(([k,v])=>Array.isArray(v)?v.map(value=>[k,value]):[[k,v]]);}
  *entries(){yield* this.rows;}get(key){return this.rows.find(([name])=>name===key)?.[1]??null;}getAll(key){return this.rows.filter(([name])=>name===key).map(([,value])=>value);}has(key){return this.rows.some(([name])=>name===key);}
 }
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,FormData,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},body:node('body')},location:{pathname:'/portal.html',search:'',assign(){},replace(){}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(failPlanWrite&&key===KEY)throw Error('Storage full');storage.set(key,value);},removeItem:key=>storage.delete(key)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout(){},clearTimeout(){},dispatchEvent(){},addEventListener(){},scrollTo(){},navigator:{},__fixture:JSON.stringify({initial,stored,catalog,models}),__recommendationRequests:0};context.window=context;vm.createContext(context);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});}
 const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),hooks=`const f=JSON.parse(__fixture);state=f.initial;catalog=f.catalog;models=f.models;activePlanState=actualSavedTarget(f.stored)?clone(f.stored):null;render=function(){save();};prepareRecommendations=async function(){__recommendationRequests++;};window.__qa={start:startProfile,submit:submitProfileStep,restore:restoreProfileDraft,body:profileBody,answer,action,state:()=>state,save};`;
 const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());');assert.notEqual(instrumented,source);vm.runInContext(instrumented,context,{filename:'portal.js'});
 return{api:context.__qa,node,storage,context,state:()=>copy(context.__qa.state()),stored:()=>JSON.parse(storage.get(KEY)),async submit(values){await context.__qa.submit({id:'portal-profile-form',values});},failPlanWrites(value=true){failPlanWrite=value;}};
}
const prior={prior:'some',military:'none',militaryRecords:'not-sure'},format={format:'online',learningPace:'self-paced',campusLocation:'any',homeState:'',campusInterests:[],campusTime:'any'},priority={priority:'speed',budget:'3000',weeklyHours:'10',proctoringPreference:'avoid',assessmentPreference:'projects'};

test('a fresh veteran reaches recommendations only after prior learning and preferences are saved',async()=>{
 const f=fixture();f.api.start('explore');assert.equal(f.state().journey.step,'purpose');
 await f.submit({goal:'career-growth',field:'business',degreeLevel:'bachelor'});assert.equal(f.state().journey.step,'prior');assert.equal(f.context.__recommendationRequests,0);
 await f.submit({...prior,military:'veteran',militaryRecords:'jst'});assert.equal(f.state().journey.step,'format');assert.equal(f.context.__recommendationRequests,0);
 await f.submit(format);assert.equal(f.state().journey.step,'priority');assert.equal(f.context.__recommendationRequests,0);
 await f.submit(priority);const state=f.state();assert.equal(f.context.__recommendationRequests,1);assert.equal(state.journey.step,'routes');assert.equal(state.journey.profileCompleted,true);assert.equal(state.profile.militaryStatus,'veteran');assert.equal(state.profile.militaryRecords,'jst');assert.equal(state.profile.learningPace,'self-paced');assert.equal(state.profile.budget,3000);assert.deepEqual(state.learning,[]);assert.equal(state.selectedPathwayId,'');
});

test('preference-only completion preserves the latest concurrent course collection, notes and target',async()=>{
 const original=selected();original.learning=[{id:'earned',provider:'Former college',code:'HIST101',title:'History',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];original.sheet.notes={private:'Keep this note'};
 const f=fixture({initial:original});f.api.start('preferences','plan');await f.submit(prior);await f.submit(format);
 const latest=f.stored();latest.learning.push({id:'newest',provider:'Sophia',code:'SOPH-0001',title:'Algebra',credits:3,creditSystem:'semester',status:'saved',evaluations:[]});latest.sheet.notes.private='Updated in another tab';latest.scenarios.keep={optionSelections:{original:'selection'}};f.storage.set(KEY,JSON.stringify(latest));
 await f.submit(priority);const saved=f.stored();assert.equal(saved.selectedPathwayId,latest.selectedPathwayId);assert.deepEqual(saved.learning,latest.learning);assert.deepEqual(saved.sheet.notes,latest.sheet.notes);assert.deepEqual(saved.scenarios,latest.scenarios);assert.equal(saved.profile.goal,latest.profile.goal);assert.equal(saved.profile.modality,latest.profile.modality);assert.equal(saved.profile.budget,3000);assert.equal(saved.journey.view,'home');
});

test('a pending preferences draft for another degree cannot restore or replace the current target',async()=>{
 const original=selected(),f=fixture({initial:original});f.api.start('preferences','plan');await f.submit(prior);
 const next=selected('liberty-business-residential');f.storage.set(KEY,JSON.stringify(next));
 // An input event can persist a draft after a different tab changes degrees.
 await f.submit({...format,learningPace:'scheduled'});
 assert.deepEqual(f.stored(),next);
 const reloaded=fixture({initial:next,stored:next,extraStorage:[...f.storage.entries()].filter(([key])=>key!==KEY)});
 assert.equal(reloaded.api.restore('preferences'),false);assert.equal(reloaded.state().selectedPathwayId,next.selectedPathwayId);
});

test('an invalid numeric preference keeps the current plan and allows correcting the same step',async()=>{
 const original=selected(),f=fixture({initial:original});f.api.start('preferences','plan');await f.submit(prior);await f.submit(format);
 await assert.rejects(()=>f.submit({...priority,weeklyHours:'-1'}),/study hours/i);assert.deepEqual(f.stored(),original);assert.equal(f.state().journey.step,'priority');assert.notEqual(f.state().journey.profileCompleted,true);
 await f.submit({...priority,weeklyHours:'6'});assert.equal(f.stored().profile.weeklyHours,6);assert.equal(f.stored().selectedPathwayId,original.selectedPathwayId);
});

test('a failed final plan write keeps a resumable preferences draft and preserves the saved plan',async()=>{
 const original=selected(),f=fixture({initial:original});f.api.start('preferences','plan');await f.submit(prior);await f.submit(format);f.failPlanWrites();
 await f.submit(priority);assert.deepEqual(f.stored(),original);assert(f.storage.has(DRAFT),'The unfinished preferences must remain recoverable when the main plan write fails.');
 const reloaded=fixture({initial:original,stored:original,extraStorage:[...f.storage.entries()].filter(([key])=>key!==KEY)});assert.equal(reloaded.api.restore('preferences'),true);assert.equal(reloaded.state().journey.step,'priority');assert.match(reloaded.api.body('priority'),/value="3000"/);
 await reloaded.submit(priority);assert.equal(reloaded.stored().profile.budget,3000);assert.equal(reloaded.stored().selectedPathwayId,original.selectedPathwayId);assert.equal(reloaded.storage.has(DRAFT),false);
});

test('asking for help after a known-school start still collects prior learning before recommendations',async()=>{
 const noSchool=fixture();await noSchool.api.answer('target');assert.equal(noSchool.state().journey.step,'school');await noSchool.api.answer('unknown');assert.equal(noSchool.state().journey.profileFlow?.version,1);await noSchool.submit({goal:'any-degree',field:'any',degreeLevel:'unsure'});assert.equal(noSchool.state().journey.step,'prior');assert.equal(noSchool.context.__recommendationRequests,0);
 const noDegree=fixture();await noDegree.api.answer('target');await noDegree.api.answer('Liberty University');assert.equal(noDegree.state().journey.step,'degree');await noDegree.api.answer('unknown');assert.equal(noDegree.state().journey.profileFlow?.version,1);assert.equal(noDegree.state().profile.school,'Liberty University');await noDegree.submit({goal:'any-degree',field:'business',degreeLevel:'bachelor'});assert.equal(noDegree.state().journey.step,'prior');assert.equal(noDegree.context.__recommendationRequests,0);
});
