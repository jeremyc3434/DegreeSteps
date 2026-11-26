/* Eight newly reviewed pathways, exercised with local assets and synthetic records only.
 * No live network, authentication, provider enrollment, or private account writes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const Catalog=require('./dist/program-catalog.js');
const Sheet=require('./dist/sheet-state.js');
const Journey=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const registry=require('./dist/data/curriculum-registry.json');
const publication=require('./dist/data/publication-index.json');
const baselines=Object.values(require('./dist/data/baseline-index.json').baselines);
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const BASE='http://127.0.0.1:8133/';
const KEY='degreepath-guide-v3';
const OUT=process.env.DEGREESTEPS_EXPANSION_ARTIFACTS||'/tmp/degreesteps-scalable-expansion-browser';
const cases=[
 ['curriculum-liberty-interdisciplinary-aa-online',60,39,true],
 ['curriculum-liberty-psychology-bs-residential',120,60,false],
 ['curriculum-umpi-maol-yourpace',36,0,true],
 ['curriculum-wgu-bs-data-analytics-reviewed',122,62,false],
 ['curriculum-wgu-bs-cloud-network-engineering-general-reviewed',109,34,true],
 ['curriculum-wgu-bs-cloud-network-engineering-aws-reviewed',112,34,false],
 ['curriculum-wgu-bs-cloud-network-engineering-cisco-reviewed',112,34,false],
 ['curriculum-wgu-bs-cloud-network-engineering-azure-reviewed',112,34,false]
].map(([modelId,credits,outside,mobile])=>{
 const published=publication.plans.find(plan=>plan.modelId===modelId&&plan.publicationReady===true);
 assert(published,modelId+' must be in the ready publication index');
 const route=catalog.pathways.find(route=>route.modelId===modelId&&published.routeIds.includes(route.id)&&route.readyTemplate);
 assert(route,modelId+' must be discoverable as a ready degree');
 const baseline=baselines.find(b=>b.modelId===modelId&&b.pathwayId===route.id&&b.qualityReady);
 assert(baseline,modelId+' needs an executable publication baseline');
 assert.equal(baseline.summary.totalCredits,credits);assert.equal(baseline.summary.transferCredits,outside);
 return {modelId,credits,outside,mobile,route};
});
const errors=[],results=[],contexts=[];
let browser,page;
const sum=async(selector)=>page.locator(selector+' .course-plan-credits').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.textContent.trim()),0));
function seed(route){
 let state=Sheet.initialize(null,null,catalog);
 state.learning=[{id:'qa-private-existing-course',provider:'Previous College',code:'PRIVATE 101',title:'My previous course',credits:4,creditSystem:'quarter',status:'saved',evaluations:[]}];
 state.sheet.notes={private:'Keep my private advisor note'};
 const original={learning:structuredClone(state.learning),notes:structuredClone(state.sheet.notes)};
 state=Journey.initialize(Sheet.selectPathway(state,route),null,catalog);
 Object.assign(state.profile,{goal:'any-degree',field:'any',degreeLevel:route.level,modality:route.modalities[0],classroomImportance:'open',priority:'transfer',proctoringPreference:'open',hasPrior:'none'});
 state.scenarios={[route.modelId]:{providers:['Sophia','Study.com','StraighterLine','Saylor','CLEP','Christian Leaders'],allowConditional:false,weeklyHours:12,optionSelections:{}}};
 state.journey={...state.journey,completed:true,answers:{...state.journey.answers,prior:'none',purpose:'any-degree'}};
 assert.deepEqual(state.learning,original.learning,'Adopting a reviewed route preserves collected courses');
 assert.deepEqual(state.sheet.notes,original.notes,'Adopting a reviewed route preserves private notes');
 return {state,original};
}
async function run(config,width){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 // Explicitly block writes even if a future page adds a new non-API endpoint.
 await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.fallback():route.fulfill({status:403,json:{error:'Synthetic browser QA blocks writes.'}}));
 const {state,original}=seed(config.route);
 await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push({modelId:config.modelId,width,message:error.message}));
 await page.goto(BASE+'plan.html',{waitUntil:'domcontentloaded'});
 await page.locator('tr.course-plan-row').first().waitFor({timeout:60000});
 await page.waitForFunction(({credits,outside})=>{
  const total=selector=>[...document.querySelectorAll(selector+' .course-plan-credits')].reduce((sum,node)=>sum+Number(node.textContent.trim()),0);
  return total('tr.course-plan-row')===credits&&total('tr.course-plan-row[data-kind=transfer]')===outside;
 },{credits:config.credits,outside:config.outside});
 assert.equal(await sum('tr.course-plan-row'),config.credits,'The complete receiving degree is counted once');
 assert.equal(await sum('tr.course-plan-row[data-kind=transfer]'),config.outside,'The default outside-course mix matches the reviewed publication baseline');
 assert.equal(await page.locator('tr.course-plan-row[data-kind=unmapped],.course-plan-unavailable,.course-plan-pending').count(),0,'A ready plan must not end at an unmapped or unavailable screen');
 assert.match(await page.locator('#sheet-footer').innerText(),new RegExp('Degree total: '+config.credits+' '));
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 assert.equal(saved.selectedPathwayId,config.route.id);
 assert.deepEqual(saved.learning,original.learning,'Opening a new degree never consumes or discards the original course repository');
 assert.deepEqual(saved.sheet.notes,original.notes,'The app keeps private notes after rendering the new route');
 // The current responsive design keeps the full Up next card on some phones;
 // older layouts use the compact glance link. Require the visible control.
 const next=page.locator('[aria-label="Your next action"]:visible,.sheet-glance-next:visible').first();
 await next.waitFor();assert((await next.innerText()).trim(),'The student sees a next action');
 const nextHref=await next.evaluate(node=>(node.matches('a')?node:node.querySelector('a[href]'))?.getAttribute('href'));
 assert(nextHref,'The next action provides an actionable link');
 assert.equal(new URL(nextHref,BASE).origin,new URL(BASE).origin,'The next action stays in the student experience');
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert(dimensions.document<=width+1&&dimensions.body<=width+1,'No page-level horizontal overflow: '+JSON.stringify(dimensions));
 await fs.mkdir(OUT,{recursive:true});
 await page.screenshot({path:path.join(OUT,config.modelId+'-'+width+'.png'),animations:'disabled'});
 results.push({modelId:config.modelId,routeId:config.route.id,width,credits:config.credits,outside:config.outside});
 console.log('PASS '+config.modelId+' '+width+'px');
 await context.close();
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const config of cases){await run(config,1440);if(config.mobile)await run(config,390);}
 assert.deepEqual(errors,[],'New ready plan pages produce no uncaught errors');
 await fs.mkdir(OUT,{recursive:true});await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({syntheticOnly:true,realAccountWrites:0,network:'local-assets-only',registryRevision:publication.registryRevision,results,errors},null,2)+'\n');
 console.log(results.length+' new-plan browser journeys passed.');
}catch(error){
 await fs.mkdir(OUT,{recursive:true});
 if(page&&!page.isClosed()){await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure.txt'),String(error.stack||error)+'\n\n'+await page.locator('body').innerText().catch(()=>''));}
 throw error;
}finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
