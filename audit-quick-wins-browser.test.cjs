/* Audit quick wins against the loopback preview: the app footer sits clear of the phone navigation, the plan
 * library fits 320px, focus lands on the main heading after the worksheet renders, switched-off features make no
 * failing status requests, and the save sign-in wall explains what a free account gives. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8131/').replace(/\/?$/,'/');
let browser,count=0;const errors=[],contexts=[];
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
async function open(path,viewport={width:1366,height:900}){
 const context=await browser.newContext({viewport,...(viewport.width<500?{isMobile:true,hasTouch:true}:{})});contexts.push(context);
 const page=await context.newPage(),failed=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(/\/api\/[a-z-]+\/status$/.test(new URL(response.url()).pathname)&&!response.ok())failed.push(response.url()+' '+response.status());});
 await page.goto(BASE+path,{waitUntil:'load'});await page.waitForTimeout(1200);page.failedStatus=failed;return page;
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 await test('the legal footer is on each app page and clear of the phone bottom navigation',async()=>{
  for(const path of ['programs.html','portal.html','plan.html?usePlan=wgu-catalog-ecceaa488637ac83','credits-worth.html']){
   for(const viewport of [{width:390,height:844},{width:1366,height:900}]){
    const page=await open(path,viewport),footer=page.locator('footer.dp-legal-footer');
    assert.equal(await footer.count(),1,path);
    for(const name of ['Privacy','Terms','Why DegreeSteps is free'])assert.equal(await footer.getByRole('link',{name}).count(),1,path+' '+name);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);
    const box=await footer.boundingBox(),nav=await page.locator('.dp-shell-bottom').boundingBox().catch(()=>null);
    assert(box&&box.height>0,path+' footer is visible');
    if(nav&&nav.height>0&&viewport.width<500)assert(box.y+box.height<=nav.y+1,path+' footer ends above the bottom navigation');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path+' no horizontal scroll');
   }
  }
 });
 await test('the degree plan library fits a 320px screen',async()=>{
  const page=await open('degree-plans/',{width:320,height:700});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=320));
  for(const box of await page.locator('article.public-plan-card').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().right)))assert(box<=320.5);
 });
 await test('the worksheet moves focus to its main heading once it renders',async()=>{
  const page=await open('portal.html?usePlan=wgu-catalog-ecceaa488637ac83');
  const build=page.getByRole('button',{name:'Build course plan'});if(await build.count()){await build.click();await page.waitForURL('**/plan.html**');}
  await page.locator('#sheet-titlebar h1').waitFor();await page.waitForTimeout(800);
  assert.equal(await page.evaluate(()=>document.activeElement?.matches('#sheet-titlebar h1')),true);
 });
 await test('switched-off coach and leads answer their status checks without errors',async()=>{
  for(const path of ['programs.html','portal.html','credits-worth.html']){const page=await open(path);assert.deepEqual(page.failedStatus,[],path);}
  const page=await open('programs.html');
  for(const api of ['/api/coach/status','/api/leads/status'])assert.deepEqual(await page.evaluate(async api=>{const r=await fetch(api);return [r.status,await r.json()];},api),[200,{enabled:false}]);
  assert.equal(await page.locator('[data-coach-root],[data-coach-open],.lead-actions').count(),0,'features stay hidden');
 });
 await test('the save sign-in wall leads with what a free account gives',async()=>{
  const page=await open('account.html?returnTo=%2Fplan.html');
  const body=await page.locator('main, body').first().innerText();
  if(/Sign-in is being connected/.test(body))return;// Sign-in is not configured on this preview.
  assert.match(body,/Save your plan to your free account so you can come back to it on any device\./);assert.doesNotMatch(body,/Welcome back\./);
 });
 assert.deepEqual(errors,[]);console.log(count+' audit quick-win journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
