'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),{loadData}=require('./scripts/audit-student-confirmations.cjs');
const all=loadData(),ids=['excelsior-bs-psychology','excelsior-bs-business-no-concentration','wgu-catalog-689e417cff765fc9'],gcuId='gcu-bsba-campus';
const catalog={...all.catalog,pathways:all.catalog.pathways.filter(route=>[...ids,gcuId].includes(route.id))},modelIds=new Set(catalog.pathways.map(route=>route.modelId)),models=all.models.filter(model=>modelIds.has(model.id));
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


const scenarioFor=(saved,draft)=>saved.scenarios[draft.program.id];
const baselineFor=id=>Object.values(baselines.baselines).find(item=>item.pathwayId===id);

test('opening a starting route that uses StraighterLine keeps its published outside-credit total',async()=>{
 for(const id of ids){
  const f=fixture();assert.equal(await f.api.use(id),true,id);
  const saved=f.stored(),draft=Journey.buildDraft(saved,catalog,models),baseline=baselineFor(id);
  assert.equal(draft.plan.totals.external,baseline.summary.transferCredits,id+' worksheet total matches the starting route');
  const used=[...new Set(baseline.rows.map(row=>row.provider).filter(p=>p&&p!=='University'))];
  for(const provider of used)assert.ok(scenarioFor(saved,draft).providers.includes(provider),id+' keeps '+provider+' as a course source');
 }
 const f=fixture();await f.api.use('excelsior-bs-psychology');
 const saved=f.stored(),draft=Journey.buildDraft(saved,catalog,models);
 assert.ok(scenarioFor(saved,draft).providers.includes('StraighterLine'));assert.equal(draft.plan.totals.external,78);
});

test('saved course-source choices are respected rather than silently widened',async()=>{
 const id='excelsior-bs-psychology',state=selected(id),modelId=catalog.pathways.find(route=>route.id===id).modelId;
 state.scenarios={...state.scenarios,[modelId]:{providers:['Sophia','Study.com']}};
 const f=fixture({stored:state});assert.equal(await f.api.use(id),true);
 const saved=f.stored();assert.deepEqual(saved.scenarios[modelId].providers,['Sophia','Study.com'],'an explicit choice is never overridden');
 const draft=Journey.buildDraft(saved,catalog,models);
 assert.ok(draft.plan.rows.every(row=>row.option?.provider!=='StraighterLine'),'the worksheet plans within the student’s own sources');
});

test('opening a plan whose browsing subject differs from its catalog field is not rejected (regression)',async()=>{
 for(const id of ids){const f=fixture();assert.equal(await f.api.use(id),true,id);}
 const route={...catalog.pathways.find(r=>r.id==='wgu-catalog-689e417cff765fc9'),subjects:['accounting-finance']};
 assert.doesNotThrow(()=>Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog));
});
