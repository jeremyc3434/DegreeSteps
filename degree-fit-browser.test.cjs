/* Student-facing degree fit: real published assets, synthetic private records, no account writes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),index=require('./dist/data/plan-library-index.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const ARTIFACTS=process.env.DEGREESTEPS_FIT_ARTIFACTS||'/tmp/degreesteps-degree-fit-browser';
const publishedIds=new Set(publication.plans.flatMap(plan=>plan.routeIds));
const ready=[...publishedIds].map(id=>({id,route:catalog.pathways.find(route=>route.id===id),info:index.plans[id]}));
assert(ready.length>=22,'The existing ready degree plans remain available');
assert(ready.every(item=>item.route&&item.info?.fit),'Generate the fit metadata before running these journeys');
const human=ready.find(item=>item.route.modelId==='curriculum-liberty-human-services-bs-online');
const wgu=ready.find(item=>item.route.modelId==='curriculum-wgu-catalog-ecceaa488637ac83');
const history=ready.find(item=>item.route.modelId==='curriculum-liberty-history-bs-online');
assert(human&&wgu&&history);
let browser,currentPage,checks=0;
const contexts=[],errors=[];
const sorted=values=>[...values].sort();
const expected=predicate=>ready.filter(predicate).map(item=>item.id);
const readyOnlinePerCredit=expected(item=>item.info.fit.modality==='online'&&item.info.fit.billing==='per-credit'&&item.info.fit.selfPaced===false);
const readyCampusFlat=expected(item=>item.info.fit.modality==='campus'&&item.info.fit.billing==='flat-term'&&item.info.fit.selfPaced===false);
const readyCBE=expected(item=>item.info.fit.modality==='online'&&item.info.fit.competencyBased===true&&item.info.fit.selfPaced===true&&item.info.fit.billing==='subscription');
assert(readyOnlinePerCredit.length&&readyCampusFlat.length&&readyCBE.length);

function seed(){
 let value=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),human.route),null,catalog);
 value.learning=[{id:'private-course-bank',provider:'My previous college',code:'PRIVATE 101',title:'Keep my original course',credits:4,creditSystem:'quarter',status:'saved',privateNote:'My original private course note',evaluations:[]}];
 value.sheet.notes={[human.route.modelId]:{'private-advisor-note':'Keep this private advisor note'}};
 value.journey={...value.journey,completed:true};
 value.profile={...value.profile,goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open'};
 value.whatIf={...value.whatIf,selectedIds:['current','route:'+wgu.id,'route:'+history.id],includeOtherFormats:false,goalReady:true};
 return value;
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function preserved(page,initial){
 const value=await saved(page);
 assert.deepEqual(value.learning,initial.learning,'Browsing preserves the original course quantities, units, statuses and notes');
 assert.deepEqual(value.sheet.notes,initial.sheet.notes,'Browsing never replaces private plan notes');
 assert.equal(value.selectedPathwayId,initial.selectedPathwayId,'Filters do not adopt a different degree');
}
async function open(relative,width){
 const initial=seed(),context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 contexts.push(context);await mountOfflineSite(context,{origin:new URL(BASE).origin});
 await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key:KEY,initial});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+relative,{waitUntil:'domcontentloaded'});
 return{page,initial};
}
async function startReady(page){await page.locator('#start-step-degree').waitFor();await page.locator('#start-count').filter({hasText:/degree|match/i}).waitFor();}
async function programsReady(page){await page.locator('#program-count').filter({hasText:/plan/i}).waitFor();await page.waitForFunction(()=>!document.querySelector('#program-count')?.textContent.includes('Loading'));}
async function showAll(page,selector){for(let i=0;i<8&&await page.locator(selector).isVisible();i++)await page.locator(selector).click();assert(!await page.locator(selector).isVisible(),'The small published library can be fully inspected');}
async function startIds(page){await showAll(page,'#start-more');return page.locator('.start-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.plan));}
async function programIds(page){await showAll(page,'#program-more');return page.locator('.pf-program').evaluateAll(nodes=>nodes.map(node=>node.dataset.program));}
async function publicCards(page){await showAll(page,'[data-plan-more]');return page.locator('.public-plan-card:not([hidden])');}
async function fitViewport(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The filters, badges and prices fit the viewport');}
async function run(name,fn){
 if(process.env.DEGREESTEPS_FIT_CASE&&!new RegExp(process.env.DEGREESTEPS_FIT_CASE).test(name))return;
 try{await fn();checks++;if(process.env.DEGREESTEPS_FIT_ARTIFACTS&&currentPage){await fs.mkdir(ARTIFACTS,{recursive:true});await currentPage.evaluate(()=>scrollTo(0,0));await currentPage.screenshot({path:path.join(ARTIFACTS,name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-success.png')});}console.log('PASS '+name);}
 catch(error){await fs.mkdir(ARTIFACTS,{recursive:true});if(currentPage&&!currentPage.isClosed()){const label=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();await currentPage.screenshot({path:path.join(ARTIFACTS,label+'-failure.png')}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,label+'-failure.txt'),String(error.stack||error)+'\nURL: '+currentPage.url()+'\nPage errors: '+JSON.stringify(errors)+'\n\n'+(await currentPage.locator('body').innerText().catch(()=>'')).slice(0,22000));}throw error;}
}

(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of[390,1440]){
  await run('Start combines independent study filters and keeps them through the credits step at '+width+'px',async()=>{
   const{page,initial}=await open('start.html?subject=business&level=bachelor&format=online&confirm=0&fit=0',width);await startReady(page);
   await page.locator('#start-pace').selectOption('self-paced');await page.locator('#start-cbe').check();await page.locator('#start-billing').selectOption('subscription');
   const wanted=expected(item=>item.info.subjects.includes('business')&&item.route.level==='bachelor'&&item.info.fit.modality==='online'&&item.info.fit.competencyBased===true&&item.info.fit.selfPaced===true&&item.info.fit.billing==='subscription');
   assert(wanted.length>0);assert.deepEqual(sorted(await startIds(page)),sorted(wanted));
   const features=await page.locator('.start-fit-badges').allInnerTexts();assert(features.every(text=>/Competency-based/.test(text)&&/Self-paced/.test(text)&&/Subscription/.test(text)));
   assert((await page.locator('.start-college-work').allInnerTexts()).every(text=>/at the university/.test(text)));
   await preserved(page,initial);
   await page.reload({waitUntil:'domcontentloaded'});await startReady(page);assert.equal(await page.locator('#start-pace').inputValue(),'self-paced');assert(await page.locator('#start-cbe').isChecked());assert.equal(await page.locator('#start-billing').inputValue(),'subscription');
   await page.locator('#start-billing').selectOption('per-credit');
   const perCredit=expected(item=>item.info.subjects.includes('business')&&item.route.level==='bachelor'&&item.info.fit.modality==='online'&&item.info.fit.competencyBased===true&&item.info.fit.selfPaced===true&&item.info.fit.billing==='per-credit');
   assert.deepEqual(sorted(await startIds(page)),sorted(perCredit),'CBE does not borrow subscription programs into per-credit results');
   const noBilling=expected(item=>item.info.subjects.includes('business')&&item.route.level==='bachelor'&&item.info.fit.modality==='online'&&item.info.fit.competencyBased===true&&item.info.fit.selfPaced===true);
   await page.locator('[data-clear-filter="billing"]').click();assert.deepEqual(sorted(await startIds(page)),sorted(noBilling));assert.equal(new URL(page.url()).searchParams.get('cbe'),'1');
   await page.locator('.start-card [data-build-plan]').first().click();await page.locator('#start-step-credits').waitFor();await preserved(page,initial);
   await page.locator('#start-credits-back').click();await startReady(page);
   const back=new URL(page.url()).searchParams;assert.equal(back.get('pace'),'self-paced');assert.equal(back.get('cbe'),'1');assert.equal(back.get('subject'),'business');
   assert.deepEqual(sorted(await startIds(page)),sorted(noBilling));await preserved(page,initial);await fitViewport(page);
  });

  await run('Finder distinguishes per-credit, flat-term and subscription plans without losing saved courses at '+width+'px',async()=>{
   const{page,initial}=await open('programs.html?format=online&confirm=0&pace=scheduled&billing=per-credit&fit=0',width);await programsReady(page);
   assert.deepEqual(sorted(await programIds(page)),sorted(readyOnlinePerCredit));
   assert((await page.locator('.pf-tuition-basis').allInnerTexts()).every(text=>/\$410.*\$475 per credit/.test(text)),'Known threshold rates do not become an unknown-price message');
   await page.locator('#program-cbe').check();assert.deepEqual(sorted(await programIds(page)),sorted(expected(item=>item.info.fit.modality==='online'&&item.info.fit.billing==='per-credit'&&item.info.fit.selfPaced===false&&item.info.fit.competencyBased===true)));await page.locator('[data-clear-filter="cbe"]').click();assert.deepEqual(sorted(await programIds(page)),sorted(readyOnlinePerCredit));
   await page.locator('#program-billing').selectOption('flat-term');await page.locator('[data-preset="campus"]').click();assert.deepEqual(sorted(await programIds(page)),sorted(readyCampusFlat));
   const tuition=await page.locator('.pf-tuition-basis').allInnerTexts();assert(tuition.every(text=>/12[–-]18 credits/.test(text)&&/\$12,695/.test(text)),'Flat-term tuition retains its bounded credit load');
   const more=page.locator('#program-more-filters');if(!await more.evaluate(node=>node.open))await page.locator('#program-more-summary').click();
   await page.locator('#program-budget').selectOption('25000');const budgetIds=await programIds(page);assert(budgetIds.every(id=>index.plans[id].estimate?.partial!==true&&index.plans[id].estimate?.max<=25000));
   await page.locator('[data-clear-filter="budget"]').click();assert.deepEqual(sorted(await programIds(page)),sorted(readyCampusFlat));
   await page.locator('[data-preset="online"]').click();await page.locator('#program-pace').selectOption('self-paced');await page.locator('#program-billing').selectOption('subscription');await page.locator('#program-cbe').check();
   assert.deepEqual(sorted(await programIds(page)),sorted(readyCBE));
   await page.reload({waitUntil:'domcontentloaded'});await programsReady(page);assert.deepEqual(sorted(await programIds(page)),sorted(readyCBE));assert.equal(new URL(page.url()).searchParams.get('format'),'online');
   assert((await programIds(page)).every(id=>publishedIds.has(id)),'No raw directory or unpublished degree leaks into reviewed-only results');
   await preserved(page,initial);await fitViewport(page);
  });

  await run('Public degree library keeps CBE, pace and billing shareable and recoverable at '+width+'px',async()=>{
   const{page,initial}=await open('degree-plans/?format=online&pace=self-paced&cbe=1&billing=subscription',width);
   await page.locator('[data-plan-toolbar]').waitFor();let cards=await publicCards(page);assert.equal(await cards.count(),readyCBE.length);
   const attrs=await cards.evaluateAll(nodes=>nodes.map(node=>({cbe:node.dataset.planCbe,pace:node.dataset.planPace,billing:node.dataset.planBilling,href:node.querySelector('.public-plan-card-link').getAttribute('href')})));
   for(const item of attrs){assert.equal(item.cbe,'1');assert.equal(item.pace,'self-paced');assert.equal(item.billing,'subscription');assert(ready.some(route=>route.info.page===item.href));}
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-plan-toolbar]').waitFor();assert.equal(await(await publicCards(page)).count(),readyCBE.length);
   await page.goto(BASE+'degree-plans/?format=online&pace=self-paced&cbe=1&billing=subscription&budget=25000',{waitUntil:'domcontentloaded'});await page.locator('[data-plan-toolbar]').waitFor();
   cards=await publicCards(page);assert.equal(await cards.count(),readyCBE.filter(id=>index.plans[id].estimate?.partial!==true&&index.plans[id].estimate?.max<=25000).length);
   assert(await page.locator('input[name="budget"][value="25000"]').isChecked(),'The public budget survives its shareable URL');
   for(const item of await cards.evaluateAll(nodes=>nodes.map(node=>({max:Number(node.dataset.planCostMax),status:node.dataset.planCostStatus})))){assert(item.max>0&&item.max<=25000);assert.equal(item.status,'planning-range');}
   await page.goto(BASE+'degree-plans/?format=online&cbe=1&billing=per-credit',{waitUntil:'domcontentloaded'});await page.locator('[data-plan-toolbar]').waitFor();
   const cbePerCredit=expected(item=>item.info.fit.modality==='online'&&item.info.fit.competencyBased===true&&item.info.fit.billing==='per-credit');assert.equal(await(await publicCards(page)).count(),cbePerCredit.length);if(!cbePerCredit.length)assert(await page.locator('[data-plan-empty]').isVisible());
   const remove=page.locator('[data-plan-active] button').filter({hasText:/Per credit/i});assert.equal(await remove.count(),1);await remove.click();assert.equal(new URL(page.url()).searchParams.get('cbe'),'1');
   cards=await publicCards(page);assert.equal(await cards.count(),expected(item=>item.info.fit.modality==='online'&&item.info.fit.competencyBased===true).length);
   const chosen=cards.locator('.public-plan-card-link[href="'+wgu.info.page+'"]');assert.equal(await chosen.count(),1);await chosen.click();await page.waitForURL('**'+wgu.info.page);
   const facts=page.locator('.public-plan-fit');await facts.first().waitFor();assert.match(await facts.first().innerText(),/Competency-based.*Self-paced.*Subscription/s);
   const studySources=facts.first().locator('details').filter({has:page.locator('summary').filter({hasText:/^Study.*sources$/})});await studySources.locator('summary').click();assert((await studySources.locator('a[href^="https://"]').count())>=1,'The public degree offers primary study/billing sources');
   await preserved(page,initial);await fitViewport(page);
  });

  await run('Side-by-side plans show exact study facts and live-capstone requirements at '+width+'px',async()=>{
   const{page,initial}=await open('compare-plans.html',width);
   const current=page.locator('[data-scenario="current"]'),alternative=page.locator('[data-scenario="route:'+wgu.id+'"]');
   await current.locator('.comparison-degree-fit').waitFor({timeout:90000});await alternative.locator('.comparison-degree-fit').waitFor({timeout:90000});
   assert.equal(await page.locator('[data-scenario]').count(),3,'Reading fit facts keeps the explicitly selected comparison set');
   assert.match(await current.locator('.comparison-degree-tags').innerText(),/Term-based/);assert.match(await current.locator('.comparison-degree-tags').innerText(),/Per credit/);assert.doesNotMatch(await current.locator('.comparison-degree-tags').innerText(),/Competency-based|Self-paced/);
   assert.match(await current.locator('.comparison-tuition-fact').innerText(),/\$410.*\$475 per credit/);
   await current.locator('.program-requirements > summary').click();const live=current.locator('[data-program-requirement="liberty-hser497-live-seminars"]');assert.match(await live.innerText(),/live seminars every other week/);assert.match(await live.locator('a').getAttribute('href'),/^https:\/\/[^/]*liberty\.edu\//);assert.equal(await current.locator('.comparison-attendance-fact').count(),0,'The sourced requirement replaces the old duplicate capstone note');
   const tags=await alternative.locator('.comparison-degree-tags').innerText();assert.match(tags,/Competency-based/);assert.match(tags,/Self-paced/);assert.match(tags,/Subscription/);
   await alternative.locator('.comparison-fit-sources > summary').click();assert((await alternative.locator('.comparison-fit-sources a[href^="https://"]').count())>=1);
   await preserved(page,initial);await fitViewport(page);
  });
 }
 assert(checks>0,'At least one actual degree-fit journey ran');assert.deepEqual(errors,[]);console.log(checks+' degree-fit browser journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
