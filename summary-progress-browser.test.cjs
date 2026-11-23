/* The degree header shows learning progress, independently from the planned source mix.
 * Synthetic records and intercepted local assets only: no account, server, or external provider writes. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const seed=()=>J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(route=>route.id==='liberty-business-residential')),null,catalog);
let browser,checks=0;const contexts=[],errors=[];
async function open(width,state=seed()){
 const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 await context.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+'plan.html',{waitUntil:'networkidle'});
 await page.locator('tr.course-plan-row').first().waitFor({timeout:30000});return page;
}
async function facts(page){return page.evaluate(()=>{
 const header=document.getElementById('sheet-titlebar'),bar=header.querySelector('[role=progressbar]'),done=bar.querySelector('.degree-progress-finished'),active=bar.querySelector('.degree-progress-active');
 const numbers=Object.fromEntries([...header.querySelectorAll('[data-summary-bucket]')].map(node=>[node.dataset.summaryBucket,Number(node.textContent.replaceAll(',',''))]));
 return {aria:Number(bar.getAttribute('aria-valuenow')),total:Number(bar.getAttribute('aria-valuemax')),finished:Number(header.querySelector('[data-degree-finished]').textContent),active:Number(header.querySelector('[data-degree-active]').textContent),remaining:Number(header.querySelector('[data-degree-remaining]').textContent),doneWidth:parseFloat(done.style.width),activeWidth:parseFloat(active.style.width),donePixels:done.getBoundingClientRect().width,activePixels:active.getBoundingClientRect().width,trackPixels:bar.getBoundingClientRect().width,numbers,mixLabel:header.querySelector('.plan-summary-mix-label').textContent,required:Number(header.querySelector('[data-summary-required]').textContent),bars:header.querySelectorAll('[role=progressbar]').length};
 });}
function counts(f,done,active){assert.equal(f.aria,done);assert.equal(f.finished,done);assert.equal(f.active,active);assert.equal(f.remaining,f.total-done-active);assert.equal(f.doneWidth,done/f.total*100);assert.equal(f.activeWidth,active/f.total*100);assert.equal(f.bars,1);assert.equal(f.mixLabel,'Planned credit mix');assert.equal(Object.values(f.numbers).reduce((sum,n)=>sum+n,0),f.required);assert.equal(f.numbers.done,done);}
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,1440])await test('unstarted degree has zero visual progress despite outside courses at '+width+'px',async()=>{
  const page=await open(width),f=await facts(page);counts(f,0,0);assert(f.numbers.less>0,'The route actually includes outside coursework');assert.equal(f.donePixels,0);assert.equal(f.activePixels,0);assert(f.trackPixels>0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 await test('starting, finishing and reversing a course changes only actual learning progress',async()=>{
  const page=await open(1440),before=await facts(page),records=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).learning,KEY);
  assert.deepEqual(records,[]);
  await page.locator('[data-progress="engl-101"]').selectOption('in-progress');let f=await facts(page);counts(f,0,3);assert.equal(f.donePixels,0);assert(f.activePixels>0);assert.equal(f.numbers.less,before.numbers.less);
  await page.locator('[data-progress="engl-101"]').selectOption('completed');f=await facts(page);counts(f,3,0);assert(f.donePixels>0);assert.equal(f.activePixels,0);assert.equal(f.numbers.less,before.numbers.less-3);
  const finished=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).learning,KEY);assert.equal(finished.length,1);assert.equal(finished[0].status,'earned');assert(finished[0].evaluations.every(value=>value.status==='reported'),'Self-reported completion is not school confirmation');
  await page.locator('[data-progress="engl-101"]').selectOption('planned');f=await facts(page);counts(f,0,0);assert.equal(f.donePixels,0);assert.equal(f.activePixels,0);assert.deepEqual(f.numbers,before.numbers);
  const corrected=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).learning,KEY);assert.equal(corrected.length,1,'Reversal retains the original course record');assert.equal(corrected[0].id,finished[0].id);assert.equal(corrected[0].status,'planned');
 });
 await test('saving an interest does not advance the degree header',async()=>{
  const state=S.updateLearning(seed(),{id:'saved-interest',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'saved'}),page=await open(390,state),f=await facts(page);counts(f,0,0);assert.equal(f.donePixels,0);assert.equal(f.activePixels,0);const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).learning,KEY);assert.equal(saved[0].status,'saved');
 });
 assert.deepEqual(errors,[]);console.log(checks+' degree-summary progress checks passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
