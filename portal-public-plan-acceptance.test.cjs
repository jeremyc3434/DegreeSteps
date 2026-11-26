'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js'),{loadData}=require('./scripts/audit-student-confirmations.cjs');
const all=loadData(),ids=['wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential'],gcuId='gcu-bsba-campus';
const subset={...all.catalog,pathways:all.catalog.pathways.filter(route=>[...ids,gcuId].includes(route.id))},publication=require('./dist/data/publication-index.json'),proof={...publication,plans:publication.plans.map(plan=>({...plan,routeIds:plan.routeIds.filter(id=>subset.pathways.some(route=>route.id===id))})).filter(plan=>plan.routeIds.length)},catalog=Catalog.attachPublicationIndex(subset,proof,require('./dist/data/curriculum-registry.json')),modelIds=new Set(catalog.pathways.map(route=>route.modelId)),models=all.models.filter(model=>modelIds.has(model.id));
const baselines=JSON.parse(fs.readFileSync(path.join(__dirname,'dist/data/baseline-index.json'),'utf8'));
const KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
function selected(id=ids[2]){const state=Journey.selectRoute(Journey.initialize(null,null,catalog),catalog.pathways.find(route=>route.id===id),catalog);state.journey={...state.journey,completed:true,intakeCompleted:true,view:'home'};return state;}
function fixture({stored=null,initial=stored||Journey.initialize(null,null,catalog),baselineData=baselines,onBaselineFetch,failWrite=false}={}){
 const storage=new Map(),nodes=new Map(),events=[],requests=[];if(stored)storage.set(KEY,JSON.stringify(stored));
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){}},focus(){},querySelector(){return null;},setAttribute(){},insertAdjacentHTML(){}});return nodes.get(id);};
 const ctx={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},body:node('body')},location:{pathname:'/portal.html',search:'',assign(value){ctx.destination=value;},replace(value){ctx.destination=value;}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(key===KEY&&failWrite)throw Error('Storage unavailable');storage.set(key,value);},removeItem:key=>storage.delete(key)},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},setTimeout(){},clearTimeout(){},dispatchEvent(event){events.push(copy({type:event.type,detail:event.detail}));},addEventListener(){},scrollTo(){},navigator:{},__fixture:JSON.stringify({state:initial,stored,catalog,models})};ctx.window=ctx;vm.createContext(ctx);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,ctx,{filename:match[1]});}
 ctx.fetch=async url=>{requests.push(String(url));assert.equal(url,'data/baseline-index.json');await onBaselineFetch?.({read:()=>JSON.parse(storage.get(KEY)||'null'),write:value=>storage.set(KEY,JSON.stringify(value))});return {ok:true,json:async()=>copy(baselineData)};};
 const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),hook=`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;activePlanState=actualSavedTarget(fixture.stored)?clone(fixture.stored):null;render=function(){save();};window.__publicPlan={use:usePublicPlan,state:()=>state,preview:()=>degreePreview,startingChoices:()=>questionBody('start')};`;
 vm.runInContext(source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hook+'\n}());'),ctx,{filename:'portal.js'});
 return {api:ctx.__publicPlan,state:()=>copy(ctx.__publicPlan.state()),stored:()=>JSON.parse(storage.get(KEY)||'null'),node,events,requests,context:ctx};
}

test('all four public routes become actual editable plans with their displayed zero-record totals before profile setup',async()=>{
 const expected=[[69,41,110],[83,37,120],[72,48,120],[74,46,120]];
 for(const [index,id] of ids.entries()){
  const f=fixture();assert.equal(await f.api.use(id),true,id);assert.equal(f.context.destination,'plan.html');
  const saved=f.stored(),draft=Journey.buildDraft(saved,catalog,models);
  assert.equal(saved.selectedPathwayId,id);assert.equal(saved.journey.completed,true);assert.notEqual(saved.journey.profileCompleted,true);assert.equal(saved.journey.profileFlow,undefined);
  assert.equal(saved.profile.entry,'target');assert.equal(saved.journey.answers.start,'target');assert.equal(saved.journey.answers.school,saved.profile.school);assert.equal(saved.journey.answers.degree,id);assert.equal(saved.journey.answers.routes,id);assert.equal(saved.journey.answers.format.modality,saved.profile.modality);
  assert.deepEqual([draft.plan.totals.external,draft.plan.totals.institutional,draft.program.totalCredits],expected[index]);assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);assert.deepEqual(saved.learning,[]);
  const baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===id);for(const row of baseline.rows)assert.equal(saved.scenarios[draft.program.id].optionSelections[row.requirementId],row.optionId);
  assert.equal(f.events.filter(event=>event.type==='DegreeSteps:growth'&&event.detail.event==='plan_started').length,1);assert.deepEqual(f.requests,['data/baseline-index.json']);
 }
});

test('changing a public plan keeps original learning, current notes, existing settings and a recoverable previous degree',async()=>{
 const initial=selected();initial.learning=[{id:'old-history',provider:'College',code:'HIST101',title:'History',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];initial.sheet.notes={private:'Keep this private note'};
 const oldModel=catalog.pathways.find(route=>route.id===initial.selectedPathwayId).modelId;initial.scenarios[oldModel]={...initial.scenarios[oldModel],termWeeks:11,privateSetting:'Keep this'};
 const f=fixture({stored:initial,onBaselineFetch:({read,write})=>{const current=read();current.learning.push({id:'new-record',provider:'College',code:'MATH200',title:'Math',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});current.sheet.notes.anotherTab='New note';current.scenarios[oldModel].privateSetting='Changed in another tab';write(current);}});
 assert.equal(await f.api.use(ids[0]),true);const saved=f.stored();assert.equal(saved.selectedPathwayId,ids[0]);assert.equal(saved.learning.length,2);assert.deepEqual(saved.learning[0],initial.learning[0]);assert.equal(saved.sheet.notes.private,initial.sheet.notes.private);assert.equal(saved.sheet.notes.anotherTab,'New note');assert.deepEqual(saved.scenarios[oldModel],{...initial.scenarios[oldModel],privateSetting:'Changed in another tab'});assert(saved.whatIf.snapshots.some(snapshot=>snapshot.pathwayId===initial.selectedPathwayId));
});

test('another tab changing the active degree during loading prevents replacement and records no activation',async()=>{
 const initial=selected(),different=selected(ids[1]),f=fixture({stored:initial,onBaselineFetch:({write})=>write(different)});
 await assert.rejects(()=>f.api.use(ids[0]),/degree changed in another tab/);assert.deepEqual(f.stored(),different);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));
});

test('concurrent choices for the destination or changed preferences are kept for review instead of overwritten by a public baseline',async()=>{
 const initial=selected(),destination=catalog.pathways.find(route=>route.id===ids[0]).modelId;
 for(const change of ['choices','preferences']){
  const f=fixture({stored:initial,onBaselineFetch:({read,write})=>{const current=read();if(change==='choices')current.scenarios[destination]={optionSelections:{'bsmgt-organizational-behavior':'a-choice-from-another-tab'}};else current.profile.weeklyHours=6;write(current);}});
  await assert.rejects(()=>f.api.use(ids[0]),change==='choices'?/course choices changed in another tab/:/preferences changed in another tab/);
  const saved=f.stored();assert.equal(saved.selectedPathwayId,initial.selectedPathwayId);if(change==='choices')assert.equal(saved.scenarios[destination].optionSelections['bsmgt-organizational-behavior'],'a-choice-from-another-tab');else assert.equal(saved.profile.weeklyHours,6);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));
 }
});

test('invalid routes and incomplete, duplicate, missing or changed baseline choices preserve the existing plan',async()=>{
 const initial=selected();
 const wrongRoute=fixture({stored:initial});await assert.rejects(()=>wrongRoute.api.use('unavailable-program'),/not available/);assert.deepEqual(wrongRoute.stored(),initial);assert.equal(wrongRoute.context.destination,undefined);assert.match(wrongRoute.api.startingChoices(),/Open my plan/);
 const variants=[{...copy(baselines),baselines:{}},...['empty','duplicate','changed','not-reviewed'].map(kind=>{const data=copy(baselines),baseline=Object.values(data.baselines).find(item=>item.pathwayId===ids[0]);if(kind==='empty')baseline.rows=[];if(kind==='duplicate')baseline.rows[1]=copy(baseline.rows[0]);if(kind==='changed')baseline.rows[0].optionId='not-a-current-choice';if(kind==='not-reviewed')baseline.researchStatus='needs-research';return data;})];
 for(const baselineData of variants){const f=fixture({stored:initial,baselineData});await assert.rejects(()=>f.api.use(ids[0]),/saved course choices/);assert.deepEqual(f.stored(),initial);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));}
});

test('a storage failure keeps the existing draft and offers an error instead of navigating or claiming activation',async()=>{
 const initial=selected(),f=fixture({stored:initial,failWrite:true});assert.equal(await f.api.use(ids[0]),false);assert.deepEqual(f.stored(),initial);assert.equal(f.context.destination,undefined);assert.match(f.node('portal-step-error').textContent,/could not save/);assert(!f.events.some(event=>event.detail?.event==='plan_started'));
});

test('an explicit public format does not silently change a protected career goal',async()=>{
 const initial=selected();initial.profile.goal='teacher';initial.journey.answers.purpose='licensed-career';initial.journey.answers.career='teacher';
 const f=fixture({stored:initial});let rejected=false;try{const used=await f.api.use(ids[0]);rejected=used===false;}catch(error){assert.match(error.message,/goal|career|preferences/i);rejected=true;}
 assert(rejected);assert.deepEqual(f.stored(),initial);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));if(f.api.preview())assert.equal(f.state().journey.view,'questions','A program-fit review must render its actual controls.');
});

test('an unfinished GCU template is unavailable as a new public plan',async()=>{
 const f=fixture();await assert.rejects(()=>f.api.use(gcuId),/not available/);assert.equal(f.stored(),null);assert.equal(f.context.destination,undefined);assert.deepEqual(f.requests,[]);
});

test('an existing private GCU proposed plan retains actual source credits without claiming publication-ready status',async()=>{
 const baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===gcuId);
 assert(baseline,'The complete GCU proposed template must have a generated baseline.');
 const baselineData=copy(baselines),candidate=Object.values(baselineData.baselines).find(item=>item.pathwayId===gcuId);
 candidate.qualityReady=false;candidate.researchStatus='conditional';
 const f=fixture({stored:selected(gcuId),baselineData});assert.equal(await f.api.use(gcuId),true);assert.equal(f.context.destination,'plan.html');
 const saved=f.stored(),draft=Journey.buildDraft(saved,catalog,models);
 assert.equal(saved.selectedPathwayId,gcuId);assert.equal(saved.profile.modality,'campus');assert.equal(saved.journey.completed,true);
 assert.equal(saved.journey.answers.degree,gcuId);assert.equal(saved.journey.answers.school,'Grand Canyon University');
 assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.totals.external,baseline.summary.transferCredits);assert.equal(draft.plan.totals.institutional,baseline.summary.universityCredits);
 assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);assert.deepEqual(saved.learning,[]);
 assert(draft.plan.rows.filter(row=>row.option).every(row=>row.credits>0),'No active zero-credit academic course is created.');
 for(const row of baseline.rows){const actual=draft.plan.rows.find(item=>item.requirementId===row.requirementId);assert(actual);assert.equal(actual.credits,row.credits);assert.equal(actual.option?.id||null,row.optionId);if(row.optionId&&!actual.creditBalanceDerived)assert.equal(saved.scenarios[draft.program.id].optionSelections[row.requirementId],row.optionId);if(actual.creditBalanceDerived)assert.equal(saved.scenarios[draft.program.id].optionSelections[row.requirementId],undefined);}
 const activation=f.events.find(event=>event.type==='DegreeSteps:growth'&&event.detail.event==='plan_started');assert(activation);assert.equal(activation.detail.planId,undefined,'GCU does not enter the four-route publication/metrics allowlist.');
});

test('inactive zero-native GCU balance rows stay empty when all native coursework is selected',async()=>{
 const model=models.find(item=>item.id==='curriculum-gcu-bsba-campus');assert(model,'The generated GCU model must be available.');
 const Planner=require('./dist/planner.js'),plan=Planner.generate(model,{providers:[],allowConditional:true,priority:'transfer',completed:[]});
 assert.equal(plan.validation.academicCountsValid,true);
 const baselineData=copy(baselines),key=Object.keys(baselineData.baselines).find(key=>baselineData.baselines[key].pathwayId===gcuId);assert(key);
 baselineData.baselines[key]={...baselineData.baselines[key],qualityReady:false,summary:{...baselineData.baselines[key].summary,totalCredits:120,transferCredits:0,universityCredits:120},rows:plan.rows.map(row=>({requirementId:row.requirementId,optionId:row.option?.id||null,provider:row.option?.provider||null,code:row.option?.code||null,credits:row.credits,status:'planned'}))};
 const f=fixture({stored:selected(gcuId),baselineData});assert.equal(await f.api.use(gcuId),true);
 const saved=f.stored(),draft=Journey.buildDraft(saved,catalog,models),inactive=draft.plan.rows.filter(row=>row.creditBalanceDerived);
 assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.totals.institutional,120);assert.equal(draft.plan.totals.external,0);
 assert.equal(inactive.length,3);assert(inactive.every(row=>row.credits===0&&row.option===null));
 for(const row of inactive)assert.equal(saved.scenarios[draft.program.id].optionSelections[row.requirementId],undefined);
});

test('GCU baseline tampering cannot create extra credits, fake completions or an empty ordinary requirement',async()=>{
 const initial=selected(gcuId);
 for(const kind of ['credits','source-code','earned','empty-ordinary','missing-baseline']){
  const baselineData=copy(baselines),key=Object.keys(baselineData.baselines).find(key=>baselineData.baselines[key].pathwayId===gcuId);assert(key);
  const baseline=baselineData.baselines[key];
  if(kind==='missing-baseline')delete baselineData.baselines[key];
  else{const row=baseline.rows.find(row=>row.provider==='Sophia');assert(row);if(kind==='credits')row.credits=4;if(kind==='source-code')row.code='invented-source-course';if(kind==='earned')row.status='confirmed';if(kind==='empty-ordinary')Object.assign(row,{credits:0,provider:null,optionId:null,code:null});}
  const f=fixture({stored:initial,baselineData});await assert.rejects(()=>f.api.use(gcuId),/saved course choices/);assert.deepEqual(f.stored(),initial);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));
 }
});

test('GCU adoption retains learning, notes and old degree history while concurrent degree changes remain protected',async()=>{
 const initial=selected();initial.learning=[{id:'private-history',provider:'College',code:'HIST999',title:'History',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];initial.sheet.notes={private:'Keep my notes'};
 initial.whatIf={version:1,snapshots:[{id:'earlier-gcu',pathwayId:gcuId,label:'My earlier private plan',settings:{}}]};
 const f=fixture({stored:initial});assert.equal(await f.api.use(gcuId),true);
 const saved=f.stored();assert.deepEqual(saved.learning,initial.learning);assert.deepEqual(saved.sheet.notes,initial.sheet.notes);assert(saved.whatIf.snapshots.some(snapshot=>snapshot.pathwayId===initial.selectedPathwayId));
 const different=selected(ids[1]),concurrent=fixture({stored:initial,onBaselineFetch:({write})=>write(different)});
 await assert.rejects(()=>concurrent.api.use(gcuId),/degree changed in another tab/);assert.deepEqual(concurrent.stored(),different);assert.equal(concurrent.context.destination,undefined);
});

test('GCU adoption preserves explicit source exclusions and does not silently replace the proposed mix',async()=>{
 const initial=selected(gcuId);initial.scenarios['curriculum-gcu-bsba-campus']={providers:[],privateSetting:'Keep my source choices'};
 const f=fixture({stored:initial});await assert.rejects(()=>f.api.use(gcuId),/source you turned off/);
 assert.deepEqual(f.stored(),initial);assert.equal(f.context.destination,undefined);assert(!f.events.some(event=>event.detail?.event==='plan_started'));
});
