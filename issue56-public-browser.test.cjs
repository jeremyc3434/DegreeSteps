/* Public pages with real assets, anonymous synthetic contexts, no remote APIs. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{mountOfflineSite}=require('./test-support/offline-site.cjs');
const root=__dirname,origin='http://127.0.0.1:8133';
(async()=>{
 const inventory=JSON.parse(await fs.readFile(path.join(root,'content/issue56-editorial-inventory.json'),'utf8'));
 const content=JSON.parse(await fs.readFile(path.join(root,'content/public-content.json'),'utf8'));
 const articles=inventory.changedArticleSlugs.map(slug=>{const a=content.articles.find(a=>a.slug===slug);assert(a);return '/'+(a.type==='guide'?'guides':'blog')+'/'+slug+'/';});
 const urls=[...articles,'/credit-sources/google-certificates/','/credit-sources/wgu-single-courses/','/credit-sources/'];
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
