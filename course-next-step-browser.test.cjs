/* Course-first navigation and comparison clarity. Synthetic local records only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8158/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const fixture={version:1,sources:[],courses:[{id:'next-step-writing',provider:'Sophia',providerId:'sophia',title:'English Composition I',mappingCode:'SOPH-0015',credits:3,creditSystem:'semester',subject:'English',codeAliases:[],sourceId:'sophia',mappingStatus:'source-listing'}]};
const empty=()=>J.initialize(null,null,catalog);
function withCourses(){
 const state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(p=>p.id==='liberty-business-residential')),null,catalog);
 state.learning=[{id:'finished-writing',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},{id:'quarter-unmatched',provider:'Example Quarter College',code:'UNLISTED401',title:'Synthetic research course',credits:4.5,creditSystem:'quarter',status:'earned',evaluations:[]},{id:'saved-interest',provider:'Sophia',code:'SOPH-0048',title:'Introduction to Psychology',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}];
 state.sheet.notes={private:'Keep this synthetic note'};
 state.whatIf={version:1,goalReady:true,selectedIds:['route:liberty-business-residential','route:liberty-criminal-justice-residential','route:liberty-criminal-justice-online']};
 return state;
}
let browser,checks=0;const contexts=[],errors=[];
async function open(path,state=empty(),width=390){
 const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});contexts.push(context);
 await context.route('**/data/course-catalog.json*',r=>r.fulfill({json:fixture}));
 await context.route('**/data/curriculum-course-index.json*',r=>r.fulfill({json:{courses:[],sources:[]}}));
 await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+path,{waitUntil:'domcontentloaded'});return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function test(name,fn){if(process.env.DEGREEPATH_NEXT_STEP_CASE&&!new RegExp(process.env.DEGREEPATH_NEXT_STEP_CASE).test(name))return;await fn();checks++;console.log('PASS '+name);}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 await test('an empty collection offers upload; saving and removing the last course updates the next step',async()=>{
  const page=await open('courses.html');await page.locator('[data-course-save="next-step-writing"]').waitFor();
  const action=page.locator('#courses-find-degrees');assert.equal(new URL(await action.getAttribute('href'),BASE).pathname,'/import-courses.html');assert.equal(new URL(await action.getAttribute('href'),BASE).searchParams.get('from'),'courses');
  assert.equal(await action.innerText(),'Add my courses');assert.match(await action.getAttribute('aria-label'),/^Add my courses/);await page.locator('[data-course-save="next-step-writing"]').click();assert.equal(await action.innerText(),'Compare degrees');assert.match(await action.getAttribute('aria-label'),/^Compare degrees/);assert.match(await action.getAttribute('href'),/compare-plans\.html\?from=courses/);
  assert.equal((await stored(page)).learning[0].status,'saved');assert(!(await stored(page)).selectedPathwayId,'Saving an interest does not select a degree');
  await page.locator('#courses-tab-mine').click();await page.locator('[data-record-details]').first().click();await page.locator('[data-course-remove]').click();await page.locator('#course-remove-confirm').click();
  assert.equal((await stored(page)).learning.length,0);assert.equal(await action.innerText(),'Add my courses');assert.match(await action.getAttribute('href'),/import-courses\.html\?from=courses/);
 });
 await test('upload links keep the course-first context and a clear route back',async()=>{
  const page=await open('courses.html?tab=mine');await page.locator('#courses-results[aria-busy="false"]').waitFor();await page.locator('#courses-find-degrees').click();await page.waitForURL(/import-courses\.html\?from=courses/);await page.locator('#import-back').click();await page.waitForURL(/courses\.html\?tab=mine/);assert.equal((await stored(page)).learning.length,0);
 });
 for(const width of [320,390,1440])await test('course matches and unmatched reasons stay readable without changing source records at '+width+'px',async()=>{
  const seed=withCourses(),page=await open('compare-plans.html?from=courses',seed,width);await page.locator('[data-scenario] [data-course-review]').first().waitFor({timeout:60000});await page.waitForFunction(()=>document.querySelectorAll('[data-matched-credits]').length>=2);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The page fits the viewport');
  const cards=page.locator('[data-scenario]');assert(await cards.count()>=2);
  for(let i=0;i<await cards.count();i++){
   const card=cards.nth(i),review=card.locator('[data-course-review]');assert.match(await review.locator('summary').innerText(),/^\d+ courses? not matched yet$/);
   assert(await card.evaluate(node=>{const fit=node.querySelector('.comparison-fit'),review=node.querySelector('[data-course-review]'),cost=node.querySelector('.comparison-outcomes');return Boolean(fit.compareDocumentPosition(review)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(review.compareDocumentPosition(cost)&Node.DOCUMENT_POSITION_FOLLOWING);}), 'Missing placements appear beside fit information, before estimates');
  }
  const review=cards.first().locator('[data-course-review]');await review.locator('summary').click();await review.locator('[data-review-course="quarter-unmatched"]').waitFor();assert((await review.locator('[data-review-course="quarter-unmatched"] p').innerText()).trim());assert.match(await review.innerText(),/does not mean the school will reject/);
  const after=await stored(page);assert.deepEqual(after.learning,seed.learning,'Viewing comparison never converts, completes or removes source courses');assert.deepEqual(after.sheet.notes,seed.sheet.notes);assert.equal(after.selectedPathwayId,seed.selectedPathwayId);
  await page.goto(BASE+'courses.html?tab=mine',{waitUntil:'domcontentloaded'});await page.locator('[data-course-status="saved-interest"]').waitFor();
  assert(await page.locator('[data-course-status="saved-interest"]').evaluate(select=>{const css=getComputedStyle(select),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=css.fontWeight+' '+css.fontSize+' '+css.fontFamily;const metric={width:select.clientWidth,paddingLeft:css.paddingLeft,paddingRight:css.paddingRight,text:ctx.measureText(select.selectedOptions[0].textContent).width,appearance:css.appearance};return select.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)>=metric.text+(metric.appearance==='none'?0:20);}),'The selected progress label fits beside the native arrow');
 });
 assert.deepEqual(errors,[]);console.log(checks+' course-next-step browser checks passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
