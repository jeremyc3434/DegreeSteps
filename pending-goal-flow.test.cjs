/* Execute the production UI closures in a VM. Only boot and presentation are
 * replaced: route selection, consent, history, merging and persistence run as
 * shipped. This is a behavioral fallback when no browser is available. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js'),Guide=require('./dist/guide-engine.js'),Planner=require('./dist/planner.js'),Audit=require('./dist/audit-curriculum.js');
const copy=value=>JSON.parse(JSON.stringify(value)),KEY='degreepath-guide-v3';
const catalog=Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json'));
const models=['tesu','liberty','liberty-criminal-justice-residential','liberty-criminal-justice-online'].map(name=>require('./dist/data/'+name+'.json'));
const outline=catalog.pathways.find(route=>route.id==='umpi-bls-management');
function seed(id='liberty-business-residential'){
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(route=>route.id===id)),null,catalog);
 state=Sheet.updateLearning(state,{id:'original',provider:'My college',code:'ENG101',title:'Original course',credits:3,creditSystem:'semester',status:'earned',evaluations:[{programId:'another-degree',requirementId:'private-placement',status:'confirmed'}]});
 state.sheet.notes={private:'Keep my advisor note'};state.journey.completed=true;return state;
}
function coursesOnly(){let state=Journey.initialize(null,null,catalog);state.selectedPathwayId='';state.profile={...state.profile,pathwayId:'',school:'',schoolChoice:'',degree:''};state.sheet.isExample=false;state.learning=copy(seed().learning);state.sheet.notes={private:'Keep my courses-only note'};return state;}
function customSeed(){let state=coursesOnly();state=Journey.applyAnswer(state,'school','Original Private College',catalog);state=Journey.applyAnswer(state,'degree',{degree:'Original Custom Degree',allowUnlisted:true},catalog);state.journey.completed=true;return state;}
function harness(kind,initial,{active=kind==='portal'&&Boolean(initial.selectedPathwayId)}={}){
 const values=new Map([[KEY,JSON.stringify(initial)]]),writes=[],navigations=[],listeners=new Map(),nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,dataset:{},isConnected:true,innerHTML:'',textContent:'',hidden:false,addEventListener(){},setAttribute(){},focus(){},classList:{add(){},toggle(){}},insertAdjacentHTML(){},querySelector(){return null;}});return nodes.get(id);};
 const document={getElementById:node,body:node('body'),addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},dispatchEvent(){},querySelector(){return null;},activeElement:null,createElement:()=>node('generated-error')};
 const context={console,URL,URLSearchParams,Intl,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}getAll(name){return this.has(name)?[this.get(name)]:[];}},document,location:{search:'',pathname:kind+'.html',replace(path){navigations.push(path);},assign(path){navigations.push(path);}},history:{replaceState(){}},navigator:{},setTimeout(){return 1;},clearTimeout(){},addEventListener(){},dispatchEvent(){},scrollTo(){},DegreeSheet:Sheet,DegreeJourney:Journey,DegreeGuide:Guide,DegreePlanner:Planner,AuditCurriculum:Audit,DegreeProgramCatalog:{...Catalog,discover:async()=>({status:'unavailable',reason:'Exact current curriculum is missing.'})},localStorage:{getItem:key=>values.get(key)||null,setItem(key,value){values.set(key,value);writes.push({key,value});}}};
 context.window=context;context.__fixture={state:copy(initial),catalog:copy(catalog),models:copy(models),active};
 // These assignments affect this VM only. Both production files remain intact.
 const common=`state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;`;
 const hooks=kind==='sheet'?`${common}
   render=function(){generate();save();};
   openDialog=function(html,label){window.__dialog={html,label};};closeDialog=function(){};
   announce=function(message){window.__notice=message;};generate();
   window.__ui={choose,targetReadiness,pendingGoalHTML,getState:()=>state,getDraft:()=>({pathway,program,plan,mapAvailable}),getPreview:()=>customGoal};`
  :`${common}
   activePlanState=__fixture.active?clone(state):null;
   state.journey={...state.journey,view:'questions',step:'degree'};
   render=function(){if(state.journey.view!=='questions')refreshDraft();save();};
   window.__ui={action,answer,previewDegree,degreeReadinessBody,previewSelection,getState:()=>state,getPreview:()=>degreePreview,save};`;
 const source=fs.readFileSync(require.resolve('./dist/'+kind+'.js'),'utf8');
 const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());');
 assert.notEqual(instrumented,source,'the production boot boundary must be found');
 vm.runInNewContext(instrumented,context,{filename:kind+'.js'});
 return {ui:context.__ui,context,writes,navigations,node,saved:()=>JSON.parse(values.get(KEY)),replaceSaved:state=>values.set(KEY,JSON.stringify(state)),async submit(id,fields){const form={id,values:fields,querySelector(){return null;},append(){}};for(const listener of listeners.get('submit')||[])await listener({target:form,preventDefault(){}});},async click(dataset){const button={id:'',dataset,hasAttribute(){return false;},closest(){return this;}};for(const listener of listeners.get('click')||[])await listener({target:button});}};
}
function assertPrivate(next,expected){assert.deepEqual(next.learning,expected.learning);assert.deepEqual(next.sheet.notes,expected.sheet.notes);assert.deepEqual(next.scenarios,expected.scenarios);}
function full(initial){const state=copy(initial);state.whatIf={version:1,snapshots:Array.from({length:20},(_,i)=>({id:'existing-'+i,pathwayId:'old-'+i,settings:{},savings:{}}))};return state;}

test('actual worksheet choose requires consent before saving an unmapped goal and remembers the working plan',async()=>{
 const initial=seed(),h=harness('sheet',initial);
 assert.equal(await h.ui.choose(outline.id),false);assert.equal(h.writes.length,0);assert.equal(h.saved().selectedPathwayId,initial.selectedPathwayId);assert.match(h.context.__dialog.html,/Save this goal instead/);
 const concurrent=h.saved();concurrent.learning.push({id:'another-tab',provider:'Other college',title:'New source',credits:3,creditSystem:'semester',status:'saved',evaluations:[]});concurrent.sheet.notes.anotherTab='Latest private note';h.replaceSaved(concurrent);
 await h.click({confirmOutline:outline.id});const next=h.saved();assert.equal(next.selectedPathwayId,outline.id);assertPrivate(next,concurrent);assert(next.whatIf.snapshots.some(row=>row.pathwayId===initial.selectedPathwayId));assert.equal(h.ui.getDraft().program,null);assert.equal(h.ui.getDraft().plan,null);assert.match(h.ui.pendingGoalHTML(),/Requirements needed/);assert.doesNotMatch(h.ui.pendingGoalHTML(),/120/);
});
test('actual portal use-degree cannot bypass explicit unmapped replacement consent',async()=>{
 const initial=seed(),h=harness('portal',initial);h.ui.getState().journey.step='start';await h.ui.answer('target');
 // School changes are real journey answers; degree selection uses its UI action.
 h.ui.getState().journey.step='school';await h.ui.answer(outline.school);await h.ui.previewDegree(outline);
 assert.equal(h.writes.length,0);await h.ui.action('use-degree');assert.equal(h.writes.length,0);assert.equal(h.saved().selectedPathwayId,initial.selectedPathwayId);assert.equal(h.ui.getPreview().confirmUnmappedReplacement,true);
 const concurrent=h.saved();concurrent.learning.push({id:'another-tab',provider:'Other college',title:'New source',credits:3,creditSystem:'semester',status:'saved',evaluations:[]});concurrent.sheet.notes.anotherTab='Latest private note';h.replaceSaved(concurrent);
 await h.ui.action('confirm-unmapped-replacement');const next=h.saved();assert.equal(next.selectedPathwayId,outline.id);assertPrivate(next,concurrent);assert(next.whatIf.snapshots.some(row=>row.pathwayId===initial.selectedPathwayId));assert.equal(Journey.buildDraft(next,catalog,models).plan,null);
});
test('an unavailable portal template offers degree research while preserving the current working plan',async()=>{
 const initial=seed(),h=harness('portal',initial);h.ui.getState().profile.school=outline.school;await h.ui.previewDegree(outline);await h.ui.action('request-unmapped-replacement');const body=h.ui.degreeReadinessBody(h.ui.getPreview());assert.match(body,/request-plan\.html\?source=/);assert.match(body,/Research this degree/);assert.doesNotMatch(body,/data-action="confirm-unmapped-replacement"/);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);
});
test('actual worksheet custom form hands the exact target to the private degree builder without replacing its plan',async()=>{
 const initial=seed();initial.profile.modality='campus';initial.profile.classroomImportance='essential';const h=harness('sheet',initial),school='Unlisted Graduate College',degree='M.S. Systems & Society — Custom Track';
 await h.submit('sheet-custom-form',{school,degree});assert.equal(h.writes.length,0);assert.equal(h.navigations.length,1);const target=new URL(h.navigations[0],'https://example.invalid/');assert.equal(target.pathname,'/degree-audit.html');assert.equal(target.searchParams.get('school'),school);assert.equal(target.searchParams.get('degree'),degree);assert.equal(h.ui.getPreview(),null);assert.deepEqual(h.saved(),initial);
});
test('actual portal custom form hands off an exact target and preserves the newest courses-only collection',async()=>{
 const initial=coursesOnly(),h=harness('portal',initial,{active:false}),school='Unlisted Graduate College',degree='M.S. Systems & Society — Custom Track';
 h.ui.getState().journey.step='school';await h.ui.answer(school);const concurrent=h.saved();concurrent.learning.push({id:'another-tab',provider:'Other college',title:'Added while choosing',credits:4,creditSystem:'quarter',status:'saved',evaluations:[]});concurrent.sheet.notes.anotherTab='Keep latest';h.replaceSaved(concurrent);
 const priorWrites=h.writes.length;await h.submit('portal-custom-degree-form',{unlistedDegree:degree});assert.equal(h.writes.length,priorWrites);assert.equal(h.navigations.length,1);const target=new URL(h.navigations[0],'https://example.invalid/');assert.equal(target.pathname,'/degree-audit.html');assert.equal(target.searchParams.get('school'),school);assert.equal(target.searchParams.get('degree'),degree);assertPrivate(h.saved(),concurrent);assert.equal(h.saved().selectedPathwayId,'');assert.equal(h.ui.getPreview(),null);
});
test('actual portal catalog preview preserves another tab’s courses for a learner without a previous degree',async()=>{
 const initial=coursesOnly(),h=harness('portal',initial,{active:false});h.ui.getState().journey.step='school';await h.ui.answer(outline.school);
 const concurrent=h.saved();concurrent.learning.push({id:'another-tab',provider:'Other college',title:'Added before preview',credits:3,creditSystem:'semester',status:'saved',evaluations:[]});concurrent.sheet.notes.anotherTab='Keep latest';h.replaceSaved(concurrent);
 await h.ui.previewDegree(outline);assertPrivate(h.saved(),concurrent);await h.ui.action('use-degree');const next=h.saved();assert.equal(next.selectedPathwayId,outline.id);assertPrivate(next,concurrent);assert.equal(next.whatIf?.snapshots?.length||0,0);
});
test('worksheet refuses to switch a full history before any persistence',async()=>{
 const initial=full(seed()),h=harness('sheet',initial);await assert.rejects(h.ui.choose(outline.id,false,true),/saved versions are full/);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);
});
test('portal refuses to confirm a full history before any persistence',async()=>{
 const initial=full(seed()),h=harness('portal',initial);h.ui.getState().profile.school=outline.school;await h.ui.previewDegree(outline);await h.ui.action('request-unmapped-replacement');await assert.rejects(h.ui.action('confirm-unmapped-replacement'),/saved versions are full/);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);
});
test('starting another custom goal with the same route ID keeps the previous exact plan until a builder commit',async()=>{
 const initial=customSeed(),h=harness('portal',initial);h.ui.getState().journey.step='school';await h.ui.answer('Next Private College');await h.submit('portal-custom-degree-form',{unlistedDegree:'Next Exact Custom Degree'});assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);const target=new URL(h.navigations[0],'https://example.invalid/');assert.equal(target.searchParams.get('school'),'Next Private College');assert.equal(target.searchParams.get('degree'),'Next Exact Custom Degree');assert.equal(h.ui.getPreview(),null);
});
test('opening a private builder does not consume a saved version or bypass a full existing history',async()=>{
 const initial=full(customSeed()),h=harness('portal',initial);h.ui.getState().journey.step='school';await h.ui.answer('Next Private College');await h.submit('portal-custom-degree-form',{unlistedDegree:'Next Exact Custom Degree'});assert.equal(h.navigations.length,1);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);assert.equal(h.saved().whatIf.snapshots.length,20);
});
test('actual target readiness blocks an unavailable template and offers a builder without invented totals',async()=>{
 const initial=seed(),h=harness('sheet',initial),submit={disabled:false,textContent:''},form=h.node('sheet-target-form');form.elements={pathwayId:{value:outline.id}};form.querySelector=()=>submit;await h.ui.targetReadiness();assert.equal(submit.disabled,true);assert.equal(submit.textContent,'Choose another plan');assert.match(h.node('sheet-target-readiness').innerHTML,/This template is not ready to use/);assert.match(h.node('sheet-target-readiness').innerHTML,/request-plan\.html/);assert.doesNotMatch(h.node('sheet-target-readiness').innerHTML,/120|Build course plan/);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),initial);
});
