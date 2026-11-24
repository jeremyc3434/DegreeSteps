/* Real published degree discovery with synthetic private courses; no account writes or AI. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),index=require('./dist/data/plan-library-index.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const ARTIFACTS=process.env.DEGREESTEPS_PERSONAL_ARTIFACTS||'/tmp/degreesteps-personal-degree-fit';
const publishedIds=new Set(publication.plans.filter(plan=>plan.publicationReady!==false).flatMap(plan=>plan.routeIds));
const routeFor=id=>catalog.pathways.find(route=>route.modelId===id&&publishedIds.has(route.id));
const human=routeFor('curriculum-liberty-human-services-bs-online'),history=routeFor('curriculum-liberty-history-bs-online'),wgu=routeFor('curriculum-wgu-catalog-ecceaa488637ac83');
assert(human&&history&&wgu,'The actual published degree plans are present');
const cbeIds=[...publishedIds].filter(id=>index.plans[id]?.fit?.competencyBased===true&&index.plans[id]?.fit?.selfPaced===true&&index.plans[id]?.fit?.billing==='subscription'&&index.plans[id]?.fit?.modality==='online');
assert(cbeIds.length>0);
const configs={
 start:{page:'start.html',checkbox:'#start-personal',status:'#start-personal-status',cards:'.start-card',id:'plan',pace:'#start-pace',billing:'#start-billing',cbe:'#start-cbe',baseline:'.start-college-work',more:'#start-more',review:'[data-build-plan]'},
 finder:{page:'programs.html',checkbox:'#program-personal',status:'#program-personal-status',cards:'.pf-program',id:'program',pace:'#program-pace',billing:'#program-billing',cbe:'#program-cbe',baseline:'.pf-split-text',more:'#program-more',review:'[data-personal-review]'}
};
const contexts=[],errors=[],privateNetwork=[];let browser,currentPage,count=0;
function seed(withCourses=true){
 let value=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),human),null,catalog);
 Object.assign(value.profile,{goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open'});
 value.learning=withCourses?[
  {id:'finished-english',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[],privateNote:'Keep my original finished-course note'},
  {id:'taking-english',provider:'Sophia',code:'SOPH-0030',title:'English Composition II',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},
  {id:'saved-art',provider:'Sophia',code:'SOPH-0009',title:'Art History I',credits:3,creditSystem:'semester',status:'saved',evaluations:[]},
  {id:'quarter-history',provider:'My former college',code:'HIST 999',title:'Original quarter-credit history',credits:4,creditSystem:'quarter',status:'earned',evaluations:[],privateNote:'Do not turn four quarter credits into four semester credits'}
 ]:[];
 value.sheet.notes={[human.modelId]:{'private-advisor-note':'Keep this private planning note'}};
 value.scenarios={[human.id]:{optionSelections:{'engl-102':'sophia-soph-0030'},weeklyHours:12}};
 value.savings={[human.modelId]:{outsideBudget:200,unitsPerTerm:12}};
 value.whatIf={version:1,selectedIds:['current','route:'+wgu.id],includeOtherFormats:false,goalReady:true};
 return value;
}
async function open(config,width,withCourses=true,query='q=Liberty&level=bachelor&format=online&confirm=0'){
 const initial=seed(withCourses),context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 context.on('request',request=>{const text=request.url()+' '+(request.postData()||'');if(['finished-english','taking-english','saved-art','quarter-history','Keep my original finished-course note','Keep this private planning note'].some(value=>text.includes(value)))privateNetwork.push({method:request.method(),url:request.url()});});
 await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key:KEY,initial});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(90000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+config.page+'?'+query,{waitUntil:'domcontentloaded'});
 await page.locator(config.cards).first().waitFor();
 return{page,initial};
}
const card=(page,config,id)=>page.locator(config.cards+'[data-'+config.id+'="'+id+'"]');
async function preserved(page,initial){
 const actual=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 assert.deepEqual(actual,initial,'Discovery preserves the active plan, profile, comparison selections, per-degree settings, original quantities, statuses and private notes');
}
async function personalized(page,config,ids=[human.id,history.id]){
 await page.locator(config.checkbox).waitFor();assert(await page.locator(config.checkbox).isChecked());
 for(const id of ids)await card(page,config,id).locator('[data-personal-state="ready"]').waitFor();
 await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('aria-busy')!=='true',config.status);
}
async function metric(node,name){const text=await node.locator('[data-personal-'+name+']').innerText();const value=Number(text.replace(/[^\d.]/g,''));assert(Number.isFinite(value),'The '+name+' metric is numeric');return value;}
async function correctMetrics(page,config){
 for(const [route,university]of[[human,60],[history,45]]){
  const node=card(page,config,route.id);
  assert.equal(await metric(node,'earned'),3,'Only the completed Sophia course counts as finished');
  assert.equal(await metric(node,'in-progress'),3,'A course being taken stays separate from finished work');
  assert.equal(await metric(node,'saved'),3,'A saved course stays separate from finished work');
  assert.equal(await metric(node,'university'),university,'Remaining university work comes from the personalized whole plan');
  const cost=node.locator('[data-personal-cost]');assert.equal(await cost.count(),1,'The personalized cost has one clear display');
  assert.doesNotMatch(await cost.innerText(),/^\s*\$0(?:\.00)?\s*$/,'An unknown estimate is never presented as a free degree');
 }
}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Personal results and controls fit the viewport');}
async function preview(page,config,initial){
 await card(page,config,history.id).locator(config.review).click();await page.waitForURL('**/compare-plans.html?**');
 assert.equal(new URL(page.url()).searchParams.get('degree'),history.id,'The review link names the degree actually clicked');
 const requested=page.locator('[data-scenario="route:'+history.id+'"]');await requested.locator('[data-collection-fit-credits]').waitFor();
 assert.equal((await requested.locator('[data-collection-fit-credits]').innerText()).trim(),'9');
 assert.equal((await requested.locator('[data-matched-credits]').innerText()).trim(),'3');
 assert.deepEqual((await page.locator('[data-scenario]').evaluateAll(nodes=>nodes.map(node=>node.dataset.scenario))).sort(),['current','route:'+history.id].sort(),'A review compares the requested degree alongside the active plan, leaving old saved selections alone');
 await preserved(page,initial);return requested;
}
async function waitCbeOnly(page,config){
 await page.locator(config.cards).first().waitFor();
 await page.locator(config.cards+' [data-personal-state="ready"]').first().waitFor();
 await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('aria-busy')!=='true',config.status);
 for(let i=0;i<8&&await page.locator(config.more).isVisible();i++)await page.locator(config.more).click();
 await page.waitForFunction(({cards,id,wanted})=>{const nodes=[...document.querySelectorAll(cards)];return nodes.length===wanted.length&&nodes.every(node=>wanted.includes(node.dataset[id]));},{cards:config.cards,id:config.id,wanted:cbeIds});
 assert((await page.locator(config.cards).evaluateAll((nodes,id)=>nodes.map(node=>node.dataset[id]),config.id)).every(id=>publishedIds.has(id)),'Only actual published plans are automatically personalized');
}
async function run(name,fn){
 if(process.env.DEGREESTEPS_PERSONAL_CASE&&!new RegExp(process.env.DEGREESTEPS_PERSONAL_CASE).test(name))return;
 try{await fn();count++;if(process.env.DEGREESTEPS_PERSONAL_ARTIFACTS&&currentPage){await fs.mkdir(ARTIFACTS,{recursive:true});await currentPage.evaluate(()=>scrollTo(0,0));await currentPage.screenshot({path:path.join(ARTIFACTS,name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-success.png')});}console.log('PASS '+name);}
 catch(error){await fs.mkdir(ARTIFACTS,{recursive:true});if(currentPage&&!currentPage.isClosed()){const label=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();await currentPage.screenshot({path:path.join(ARTIFACTS,label+'-failure.png')}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,label+'-failure.txt'),String(error.stack||error)+'\nURL: '+currentPage.url()+'\nPage errors: '+JSON.stringify(errors)+'\n\n'+(await currentPage.locator('body').innerText().catch(()=>'')).slice(0,24000));}throw error;}
 finally{if(currentPage){const context=currentPage.context();await context.close();const i=contexts.indexOf(context);if(i>=0)contexts.splice(i,1);currentPage=null;}}
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of[390,1440])for(const [name,config]of Object.entries(configs)){
  await run(name+' uses original finished and saved courses without changing an active plan at '+width+'px',async()=>{
   const{page,initial}=await open(config,width,true,'q=Liberty&level=bachelor&format=online&confirm=0'+(width===1440?'&fit=1':''));await personalized(page,config);await correctMetrics(page,config);await preserved(page,initial);
   await page.locator(config.checkbox).uncheck();assert.equal(new URL(page.url()).searchParams.get('fit'),'0');
   assert.equal(await page.locator(config.cards+' [data-personal-state="ready"]').count(),0,'Turning personalization off restores template facts');
   assert.match(await card(page,config,history.id).locator(config.baseline).innerText(),/\b51\b/,'The ordinary History template has 51 university credits, distinct from this learner’s 45');
   await page.reload({waitUntil:'domcontentloaded'});await page.locator(config.cards).first().waitFor();assert(!await page.locator(config.checkbox).isChecked());
   assert.equal(new URL(page.url()).searchParams.get('fit'),'0');await preserved(page,initial);
   if(name==='start'){
    await card(page,config,history.id).locator('[data-build-plan]').click();await page.locator('#start-step-credits').waitFor();await preserved(page,initial);
    await page.locator('#start-credits-back').click();await page.locator(config.cards).first().waitFor();assert(!await page.locator(config.checkbox).isChecked());assert.equal(new URL(page.url()).searchParams.get('fit'),'0');
   }
   await page.locator(config.checkbox).check();await personalized(page,config);await correctMetrics(page,config);
   await preview(page,config,initial);await page.goBack({waitUntil:'domcontentloaded'});await personalized(page,config);await preserved(page,initial);
   // Two rapid changes replace the earlier worker request; the final results must match the last choices.
   await page.locator(config.pace).selectOption('self-paced');await page.locator(config.billing).selectOption('subscription');await page.locator(config.cbe).check();
   assert.equal(await page.locator(config.cards).count(),0,'An incompatible school plus CBE filter has a recoverable empty result');
   await page.locator('[data-clear-filter="q"]').click();await waitCbeOnly(page,config);
   const params=new URL(page.url()).searchParams;assert.notEqual(params.get('fit'),'0');assert.equal(params.get('pace'),'self-paced');assert.equal(params.get('billing'),'subscription');assert.equal(params.get('cbe'),'1');
   await preserved(page,initial);await noOverflow(page);
  });
  await run(name+' keeps ordinary discovery clear for a student with no courses at '+width+'px',async()=>{
   const{page,initial}=await open(config,width,false);const control=page.locator(config.checkbox);if(await control.count())assert(!await control.isChecked(),'A student without courses is not shown an invented personalized match');
   assert.equal(await page.locator(config.cards+' [data-personal-state="ready"]').count(),0);
   assert.match(await card(page,config,history.id).locator(config.baseline).innerText(),/\b51\b/);
   let visibleEntry=false;for(const link of await page.locator('a[href*="import-courses"],a[href*="courses.html"]').all())if(await link.isVisible()){visibleEntry=true;break;}assert(visibleEntry,'A course repository or upload entry is visibly reachable');
   await preserved(page,initial);await noOverflow(page);
  });
 }
 await run('an explicit confirmed personal degree choice opens its actual plan and keeps the original courses',async()=>{
  const config=configs.start,{page,initial}=await open(config,390);await personalized(page,config);const requested=await preview(page,config,initial);
  await requested.locator('[data-use-plan]').click();await page.locator('#comparison-use').waitFor();await preserved(page,initial);
  await page.locator('#comparison-confirm-use').click();await page.waitForURL('**/plan.html');await page.locator('tr.course-plan-row').first().waitFor();
  const next=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assert.equal(next.selectedPathwayId,history.id);
  assert.deepEqual(next.learning,initial.learning,'Choosing a degree keeps original credits, units, statuses and notes');assert.deepEqual(next.sheet.notes,initial.sheet.notes);
  assert.deepEqual(next.scenarios[human.id],initial.scenarios[human.id],'The prior degree settings remain recoverable');assert.deepEqual(next.savings[human.modelId],initial.savings[human.modelId]);
  const entry=registry.models.find(model=>model.id===history.modelId),payload=JSON.parse(await fs.readFile(path.join(__dirname,'dist',entry.path),'utf8')),model=(Array.isArray(payload)?payload:payload.models||[payload]).find(model=>model.id===history.modelId);
  const actual=Journey.buildDraft(next,catalog,[model]);assert.equal(actual.program.id,history.modelId);assert.equal(actual.plan.rows.filter(row=>row.status==='planned'&&row.institutional).reduce((sum,row)=>sum+row.credits,0),45,'The adopted plan retains the 45 university credits shown in its personalized preview');
  await noOverflow(page);
 });
 assert(count>0,'At least one real personal discovery journey ran');assert.deepEqual(errors,[]);assert.deepEqual(privateNetwork,[],'Private course records and notes stay in the browser worker, outside network requests');console.log(count+' personal degree-fit browser journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
