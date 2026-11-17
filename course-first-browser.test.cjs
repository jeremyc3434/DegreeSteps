/* Student decisions against real shipped assets. Synthetic private records only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const contexts=[],errors=[];let browser,count=0;
function seed({ready=true,level='bachelor'}={}){
 const state=J.initialize(null,null,catalog);
 state.profile={...state.profile,degreeLevel:level,goal:'any-degree',field:'any',modality:'any'};
 state.learning=[
  {id:'completed-english',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},
  {id:'taking-english',provider:'Sophia',code:'SOPH-0030',title:'English Composition II',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},
  {id:'saved-art',provider:'Sophia',code:'SOPH-0009',title:'Art History I',credits:3,creditSystem:'semester',status:'saved',evaluations:[]},
  {id:'unknown-history',provider:'My former college',code:'HIST 999',title:'History course needing a transcript',credits:null,creditSystem:null,status:'earned',evaluations:[]}
 ];
 state.sheet.notes={private:'Keep my private advisor note'};
 state.whatIf={version:1,goalReady:ready,selectedIds:ready?['route:liberty-business-residential','route:tesu-general-management','route:liberty-criminal-justice-online']:[]};
 return state;
}
async function page(state=seed(),width=1440){
 const context=await browser.newContext({viewport:{width,height:1000}});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:state});
 const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
 await p.goto(BASE+'compare-plans.html?from=courses',{waitUntil:'networkidle'});return p;
}
const stored=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const ready=p=>p.locator('.comparison-recommendation [data-scenario]').waitFor();
const business=p=>p.locator('[data-scenario="route:liberty-business-residential"]');
async function test(name,run){
 if(process.env.DEGREEPATH_COURSE_FIRST_CASE&&!new RegExp(process.env.DEGREEPATH_COURSE_FIRST_CASE).test(name))return;
 const before=contexts.length;try{await run();count++;console.log('PASS '+name);}finally{for(const context of contexts.splice(before))await context.close();}
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 await test('a learner chooses a degree level before relevant degree recommendations appear',async()=>{
  const original=seed({ready:false,level:'unsure'}),p=await page(original);
  await p.locator('#comparison-intent').waitFor();
  assert.equal(await p.locator('[data-scenario]').count(),0);
  assert.equal(await p.locator('#comparison-level').inputValue(),'bachelor');
  assert.deepEqual((await stored(p)).learning,original.learning);
  await p.locator('#comparison-modality').selectOption('online');
  await p.locator('#comparison-intent-form button[type=submit]').click();await ready(p);
  const ids=await p.locator('[data-scenario]').evaluateAll(nodes=>nodes.map(node=>node.dataset.scenario));
  assert(ids.length>0&&ids.length<=3);
  for(const id of ids)assert.equal(catalog.pathways.find(route=>route.id===id.slice(6))?.level,'bachelor');
  assert.equal(await p.locator('#comparison-advanced').getAttribute('open'),null);
  assert.equal(await p.locator('#comparison-courses').getAttribute('open'),null);
  const next=await stored(p);assert.equal(next.profile.degreeLevel,'bachelor');assert.equal(next.journey.answers.level,'bachelor');
  assert.equal(next.selectedPathwayId,'');assert.deepEqual(next.learning,original.learning);
 });
 await test('explicit graduate intent remains graduate intent',async()=>{
  const original=seed({ready:false,level:'master'}),p=await page(original);
  await p.locator('#comparison-intent').waitFor();assert.equal(await p.locator('#comparison-level').inputValue(),'master');
  await p.locator('#comparison-modality').selectOption('online');
  await p.locator('#comparison-intent-form button[type=submit]').click();await p.locator('[data-scenario]').first().waitFor();
  const ids=await p.locator('[data-scenario]').evaluateAll(nodes=>nodes.map(node=>node.dataset.scenario));
  for(const id of ids)assert.equal(catalog.pathways.find(route=>route.id===id.slice(6))?.level,'master');
  assert.equal((await stored(p)).profile.degreeLevel,'master');assert.equal((await stored(p)).selectedPathwayId,'');
 });
 await test('three visible options distinguish completed, in-progress and saved fit with actionable cost gaps',async()=>{
  const original=seed(),p=await page(original);await ready(p);
  assert.equal(await p.locator('[data-scenario]').count(),3);
  assert.equal(await p.locator('details#comparison-alternatives').count(),0);
  const card=business(p);assert.equal((await card.locator('[data-collection-fit-credits]').innerText()).trim(),'9');
  assert.equal((await card.locator('[data-matched-credits]').innerText()).trim(),'3');
  assert.equal((await card.locator('[data-in-progress-fit]').innerText()).trim(),'3');
  assert.equal((await card.locator('[data-saved-fit]').innerText()).trim(),'3');
  assert.equal((await card.locator('[data-potential-fit-credits]').innerText()).trim(),'6');
  assert.equal((await card.locator('[data-confirmed-credits]').innerText()).trim(),'0');
  assert.equal((await card.locator('[data-remaining-credits]').innerText()).trim(),'117');
  assert(await card.locator('[data-tuition-left]').isVisible());assert.match(await card.locator('[data-tuition-left]').innerText(),/\$[\d,]+/);
  assert.equal(await card.locator('[data-study-weeks]').count(),0);
  assert(await card.locator('[data-estimate-plan]').isVisible());
  await card.locator('[data-course-review]>summary').click();
  assert.match(await card.locator('[data-course-review]').innerText(),/History course needing a transcript/);
  assert.equal(await p.locator('#comparison-matrix [data-course]').count(),0,'individual probes wait until the course table is opened');
  await p.locator('#comparison-courses>summary').click();await p.locator('#comparison-matrix [data-course]').first().waitFor();
  assert.equal(await p.locator('#comparison-matrix [data-course]').count(),4);
  await p.screenshot({path:'/tmp/degreepath-course-first-desktop.png'});
  assert(!/wasted credits/i.test(await p.locator('#comparison-results').innerText()));
  assert.equal((await stored(p)).selectedPathwayId,'');assert.deepEqual((await stored(p)).learning,original.learning);
 });
 await test('Use this plan previews the choice then opens the actual ledger with private records preserved',async()=>{
  const original=seed(),p=await page(original);await ready(p);
  await business(p).locator('[data-use-plan]').click();await p.locator('#comparison-use').waitFor();
  assert.equal((await stored(p)).selectedPathwayId,'');
  const concurrent=structuredClone(original);concurrent.learning.push({id:'another-tab-course',provider:'My former college',title:'Added in another tab',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});
  await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:KEY,value:concurrent});
  await p.locator('#comparison-confirm-use').click();await p.waitForURL('**/plan.html');
  await p.locator('tr.course-plan-row').first().waitFor();
  const next=await stored(p);assert.equal(next.selectedPathwayId,'liberty-business-residential');
  assert.deepEqual(next.learning,concurrent.learning);assert.deepEqual(next.sheet.notes,original.sheet.notes);
  assert.equal(next.scenarios['liberty-business-residential'].optionSelections['engl-102'],'sophia-soph-0030');
  assert.equal(next.scenarios['liberty-business-residential'].optionSelections['arts-209'],'sophia-soph-0009');
  assert.equal(await p.locator('[data-progress="engl-102"]').inputValue(),'in-progress');
  assert.equal(await p.locator('[data-progress="arts-209"]').inputValue(),'planned');
 });
 await test('Add an estimate requires the same explicit plan choice then opens the real estimate editor',async()=>{
  const original=seed(),p=await page(original);await ready(p);
  await business(p).locator('[data-estimate-plan]').click();await p.locator('#comparison-use').waitFor();
  assert.equal((await stored(p)).selectedPathwayId,'');
  assert.match(await p.locator('#comparison-confirm-use').innerText(),/add estimate/);
  await p.locator('#comparison-confirm-use').click();await p.waitForURL('**/plan.html?task=cost-time');
  await p.locator('#sheet-cost-form').waitFor();assert.equal((await stored(p)).selectedPathwayId,'liberty-business-residential');
  assert.deepEqual((await stored(p)).learning,original.learning);assert.deepEqual((await stored(p)).sheet.notes,original.sheet.notes);
 });
 await test('all three course-first cards and actions fit small phones without horizontal page scrolling',async()=>{
  for(const width of [320,390]){
   const p=await page(seed(),width);await ready(p);assert.equal(await p.locator('[data-scenario]').count(),3);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   for(const card of await p.locator('[data-scenario]').all()){
    const bounds=await card.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    assert(await card.locator('[data-tuition-left]').isVisible());assert(await card.locator('[data-use-plan]').isVisible());
   }
   await p.locator('#comparison-advanced>summary').click();assert.equal(await p.locator('#compare-slot option').count(),3);
   assert.equal(await p.locator('#compare-slot').inputValue(),'0');
  }
 });
 assert.deepEqual(errors,[]);console.log(count+' course-first recommendation journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
