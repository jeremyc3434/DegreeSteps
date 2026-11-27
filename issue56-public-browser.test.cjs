/* Public pages with real assets, anonymous synthetic contexts, no remote APIs. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{mountOfflineSite}=require('./test-support/offline-site.cjs');
const root=__dirname,origin='http://127.0.0.1:8133';
(async()=>{
 const inventory=JSON.parse(await fs.readFile(path.join(root,'content/issue56-editorial-inventory.json'),'utf8'));
 const content=JSON.parse(await fs.readFile(path.join(root,'content/public-content.json'),'utf8'));
 const articles=inventory.changedArticleSlugs.map(slug=>{const a=content.articles.find(a=>a.slug===slug);assert(a);return '/'+(a.type==='guide'?'guides':'blog')+'/'+slug+'/';});
 const urls=[...articles,'/blog/asu-universal-learner-vs-sophia/','/credit-sources/asu-ulc/','/credit-sources/google-certificates/','/credit-sources/wgu-single-courses/','/credit-sources/'];
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[],privateWrites=[],artifacts=path.join(root,'outputs/issue56/browser');await fs.mkdir(artifacts,{recursive:true});let journeys=0;
 try{
  for(const [device,viewport]of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport});await mountOfflineSite(context,{origin});
   const page=await context.newPage();page.on('pageerror',e=>errors.push({device,message:e.message}));
   page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/(?:portal|account|auth|community|leads)(?:\/|$)/.test(r.url()))privateWrites.push(r.url());});
   for(const url of urls){
    const response=await page.goto(origin+url,{waitUntil:'networkidle'});assert.equal(response.status(),200,url);
    assert.equal(await page.locator('h1:visible').count(),1,url+' has one clear heading');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://degreesteps.com'+url);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,url+' fits the viewport');
    assert((await page.locator('main').innerText()).trim().length>100,url+' has visible useful content');
    for(const text of await page.locator('script[type="application/ld+json"]').allTextContents())JSON.parse(text);
    if(url==='/credit-sources/google-certificates/'){
     const text=await page.locator('main').innerText();for(const code of ['GOOG-0009','GOOG-0007','GOOG-0008'])assert(text.includes(code));assert(text.includes('remain intact'));
     await page.screenshot({path:path.join(artifacts,'google-windows-'+device+'.png'),fullPage:true});
    }
    if(url==='/credit-sources/wgu-single-courses/'){
     const text=await page.locator('main').innerText();assert(text.includes('$750'));assert(text.includes('$199'));assert(text.includes('C957A'));assert(text.includes('not established'));
     await page.screenshot({path:path.join(artifacts,'wgu-source-'+device+'.png'),fullPage:true});
    }
    if(url==='/credit-sources/asu-ulc/'){
     const text=await page.locator('main').innerText();assert.match(text,/C(?:\s+|-)or(?:\s+|-)better/i);assert(text.includes('$425'));assert.match(text,/transcript/i);assert.match(text,/receiving/i);
     assert((await page.locator('main .source-list a[href^="https://ulc.asu.edu/"]').count())>=2,'ASU source details cite current official ULC evidence');
     await page.screenshot({path:path.join(artifacts,'asu-source-'+device+'.png'),fullPage:true});
    }
    if(url==='/blog/asu-universal-learner-vs-sophia/'){
     const text=await page.locator('main').innerText();assert(text.trim().split(/\s+/).length>=800,'The comparison contains substantive student guidance');assert(text.includes('$425'));assert.match(text,/C(?:\s+|-)or(?:\s+|-)better/i);assert.match(text,/receiving/i);
     assert((await page.locator('main .source-list a[href^="https://ulc.asu.edu/"]').count())>=2,'The comparison retains current official ASU citations');
     assert((await page.locator('main .source-list a[href^="https://www.sophia.org/"]').count())>=1,'The comparison retains official Sophia pricing or assessment evidence');
     const action=page.locator('main a.site-button:visible').first();const href=await action.getAttribute('href');assert(href&&href.startsWith('/')&&!href.startsWith('//'),'The comparison offers an internal next action');
     await page.screenshot({path:path.join(artifacts,'asu-sophia-comparison-'+device+'.png'),fullPage:true});
     const target=new URL(href,origin).href;
     const [next]=await Promise.all([page.waitForResponse(response=>response.url()===target&&response.request().isNavigationRequest()),action.click()]);await page.waitForLoadState('networkidle');
     assert.equal(next.status(),200,'The comparison next action resolves to a real page');assert.equal(page.url(),target);assert.equal((await page.locator('body').innerText()).includes('Not found'),false,'The ASU comparison has a working next step');
    }
    if(url==='/credit-sources/'){
     const search=page.locator('[data-resource-search]');await search.fill('WGU');
     await page.waitForFunction(()=>[...document.querySelectorAll('[data-resource-card]')].filter(e=>!e.hidden).length===1);
     assert.equal(await page.locator('[data-resource-card]:visible h3 a').getAttribute('href'),'/credit-sources/wgu-single-courses/');
     await page.locator('[data-resource-card]:visible h3 a').click();await page.waitForURL(origin+'/credit-sources/wgu-single-courses/');
     await page.locator('main a.site-button:visible').first().click();await page.waitForURL(/\/portal\.html/);
     assert.equal((await page.locator('body').innerText()).includes('Not found'),false,'Source discovery has a working next step');
    }
    journeys++;console.log('PASS '+device+' '+url);
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(privateWrites,[]);
  console.log(JSON.stringify({publicJourneys:journeys,viewports:2,pageErrors:0,privateWrites:0,scope:'Built public content, responsive layouts, source search and plan entry; no external transfer or account guarantee.'}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
