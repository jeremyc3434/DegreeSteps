/* Walks every card in Build my plan (start.html) at desktop and phone widths, as a student would: each "Build this plan"
   is followed through step 2 into the portal and must open a plan, never "This course plan is not available"; every
   other card must offer "Request this plan" to the research request page. The audit found 18 of the first 60 cards
   dead-ended here while earlier QA covered only the published-plan finder. Needs a running preview
   (DEGREEPATH_TEST_URL, default http://127.0.0.1:8133/). */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/');
const DEAD_END=/This course plan is not available|Course plan not available/;
let browser,count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
async function allCards(page){
 await page.goto(BASE+'start.html',{waitUntil:'load'});await page.locator('#start-step-degree:not([hidden]) .start-card').first().waitFor({timeout:30000});
 while(await page.locator('#start-more').isVisible())await page.locator('#start-more').click();
 return page.locator('.start-card').evaluateAll(cards=>cards.map(card=>{const build=card.querySelector('[data-build-plan]'),request=card.querySelector('[data-request-plan]');return {id:card.dataset.plan,build:build?build.getAttribute('href'):null,buildText:build?.textContent.trim()||'',request:request?request.getAttribute('href'):null};}));
}
async function followBuild(context,card){
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.goto(BASE+card.build,{waitUntil:'load'});await page.locator('#start-step-credits:not([hidden])').waitFor({timeout:30000});
  await page.locator('#start-credits-skip').click();
  await page.waitForURL(url=>!/start\.html/.test(url.href),{timeout:60000});
  await page.waitForFunction(()=>/plan\.html|import-courses\.html|compare-plans\.html/.test(location.href)||document.querySelector('#portal-content')?.textContent.trim(),null,{timeout:60000});
  const text=await page.evaluate(()=>document.body.innerText);
  assert.doesNotMatch(text,DEAD_END,card.id+' dead-ends at '+page.url());assert.deepEqual(errors,[],card.id);
  return page.url();
 }finally{await page.close();}
}

(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [1280,390]){
  await test('every builder card at '+width+'px either builds an openable plan or offers "Request this plan"',async()=>{
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
   const cards=await allCards(page),total=Number((await page.locator('#start-count').innerText()).match(/^(\d+) degrees/)[1]);
   assert.equal(cards.length,total,'every card was shown');assert.equal(new Set(cards.map(card=>card.id)).size,cards.length,'one card per plan');
   assert.ok(cards.every(card=>Boolean(card.build)!==Boolean(card.request)),'each card has exactly one main action');
   for(const card of cards.filter(card=>card.request)){const url=new URL(card.request,BASE);assert.equal(url.pathname,'/request-plan.html',card.id);}
   const builds=cards.filter(card=>card.build);assert.ok(builds.length>=40);assert.ok(builds.every(card=>card.buildText==='Build this plan'));
   const landed=[];for(let i=0;i<builds.length;i+=4)landed.push(...await Promise.all(builds.slice(i,i+4).map(card=>followBuild(context,card))));
   assert.equal(landed.length,builds.length);
   const request=cards.find(card=>card.request);await page.goto(new URL(request.request,BASE).href,{waitUntil:'load'});
   assert.equal(await page.locator('#degree-url').inputValue(),new URL(request.request,BASE).searchParams.get('source')||'','the request opens with the school’s degree link');
   await context.close();
  });
 }
 console.log(count+' builder walk checks passed');
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();}})();
