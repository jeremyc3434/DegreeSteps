/* Public website journeys against the loopback preview only; no production writes. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const content=require('./content/public-content.json');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8126/').replace(/\/?$/,'/');
const paths={guide:'/guides/'+content.articles.find(a=>a.type==='guide').slug+'/',article:'/blog/'+content.articles.find(a=>a.type==='article').slug+'/'};
let browser,count=0;const contexts=[],errors=[];
const url=path=>new URL(path,BASE).href;
async function context(options={}){const ctx=await browser.newContext(options);contexts.push(ctx);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return{ctx,page};}
async function journey(name,fn){await fn();count++;console.log('PASS '+name);}
async function navigate(page,path){const response=await page.goto(url(path),{waitUntil:'networkidle'});assert.equal(response.status(),200,path);return response;}
async function noOverflow(page){const sizes=await page.evaluate(()=>({screen:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth}));assert(sizes.document<=sizes.screen+1&&sizes.body<=sizes.screen+1,JSON.stringify(sizes));}
(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  await journey('the public homepage explains DegreePath before a clear CTA opens the separate app',async()=>{
    const{page}=await context({viewport:{width:1440,height:1000}});await navigate(page,'/');
    assert.equal(await page.locator('#portal-question-title').count(),0);
    assert.match((await page.locator('main h1').innerText()).replace(/\s+/g,' '),/The degree you want\.\s*A smarter way there\./i);
    const cta=page.locator('main a[href="/portal.html"],main a[href="portal.html"]').first();assert(await cta.isVisible());
    await cta.click();await page.waitForURL('**/portal.html');await page.locator('#portal-question-title').waitFor();
    assert.equal((await page.locator('#portal-question-title').innerText()).trim(),'Build your course plan.');
    await page.getByRole('link',{name:'DegreeSteps home',exact:true}).first().click();
    await page.waitForURL(u=>u.pathname==='/'||u.pathname==='/index.html');
    assert.equal(await page.locator('#portal-question-title').count(),0);assert(await page.locator('main h1').isVisible());
  });
  await journey('student guides and blog articles are fully readable with JavaScript disabled',async()=>{
    const{page}=await context({javaScriptEnabled:false,viewport:{width:1200,height:900}});
    for(const path of [paths.guide,paths.article]){
      await navigate(page,path);assert(await page.locator('main h1').isVisible());
      const text=(await page.locator('main').innerText()).trim();assert(text.split(/\s+/).length>400);
      assert(await page.locator('main a[href^="https://"]').count(),'Primary sources remain accessible');
      assert(await page.locator('main a[href*="portal.html"],main a[href^="/degree-plans/"]').count(),'Article includes a real next step (the app or a degree plan)');
    }
    await navigate(page,'/resources/');assert(await page.locator('main a[href^="/guides/"],main a[href^="guides/"]').count());
  });
  await journey('mobile public navigation and long-form content fit both 320px and 390px screens',async()=>{
    for(const width of [320,390]){
      const{page}=await context({viewport:{width,height:844}});await navigate(page,'/');await noOverflow(page);
      const nativeMenu=page.locator('header details.site-menu');
      if(await nativeMenu.count()&&!await nativeMenu.evaluate(node=>node.open)){
        await nativeMenu.locator('summary').click();assert(await nativeMenu.evaluate(node=>node.open));
      }else{
        const menu=page.locator('header button[aria-expanded]').first();
        if(await menu.count()&&await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');}
      }
      for(const name of ['Degrees','Transfer courses','Community','My plan','Sign in'])assert(await page.locator('header').getByRole('link',{name,exact:true}).first().isVisible(),name+' is reachable from the phone menu');
      const resources=page.locator('footer').getByRole('link',{name:/^Resources$/i}).first();
      assert(await resources.isVisible(),'Public resources are reachable on a phone');await resources.click();await page.waitForURL('**/resources/');await noOverflow(page);
      await navigate(page,paths.guide);await noOverflow(page);
      assert(await page.locator('main h1').isVisible());
      await navigate(page,'/account.html');await page.locator('#account-content h1').waitFor();await noOverflow(page);
    }
  });
  await journey('public resource directories help students find credit sources and school-specific evidence',async()=>{
    const{page}=await context({viewport:{width:1440,height:1000}});await navigate(page,'/credit-sources/');
    const text=await page.locator('main').innerText();assert.match(text,/StraighterLine/);assert.match(text,/Sophia/);
    const search=page.locator('[data-resource-search]');
    if(await search.count()){
      await search.fill('StraighterLine');
      const visibleCards=page.locator('[data-resource-card]:visible');await visibleCards.first().waitFor();
      assert.equal(await visibleCards.count(),1,'Search narrows the directory to the chosen source');
      assert.match(await visibleCards.innerText(),/StraighterLine/);
      await search.fill('');
    }
    const source=page.locator('main a[href^="/credit-sources/"]').filter({hasText:/StraighterLine/}).first();
    if(await source.count()){await source.click();await page.waitForURL(/\/credit-sources\/[^/]+\/$/);assert.match(await page.locator('main').innerText(),/StraighterLine/);assert(await page.locator('main a[href^="https://"]').count());}
    await navigate(page,'/schools/');assert.match(await page.locator('main').innerText(),/Liberty/);
    const school=page.locator('main a[href^="/schools/"]').filter({hasText:/Liberty/}).first();
    assert(await school.count());await school.click();await page.waitForURL(/\/schools\/[^/]+\/$/);
    assert.match(await page.locator('main').innerText(),/transfer|Transfer/);assert(await page.locator('main a[href^="https://"]').count(),'School pages cite evidence');
  });
  await journey('unconfigured student accounts disclose setup status and keep local drafts usable without fake sign-ins',async()=>{
    const{ctx,page}=await context({viewport:{width:1200,height:900}});
    const draft={version:3,profile:{school:'My University',degree:'My private draft'},learning:[{id:'private-source',provider:'College',code:'PRV101',title:'Private record',credits:3,status:'earned'}],selectedPathwayId:'custom-target',scenarios:{},sheet:{notes:{}}};
    await ctx.addInitScript(d=>{if(!localStorage.getItem('degreepath-guide-v3'))localStorage.setItem('degreepath-guide-v3',JSON.stringify(d));},draft);
    const writes=[];page.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/'))writes.push(r.url());});
    await navigate(page,'/account.html');await page.locator('#account-content h1').waitFor();
    const text=await page.locator('#account-content').innerText();assert.match(text,/being connected|setup is not complete|not connected|not available/i);
    assert.equal(await page.locator('#account-auth-form').count(),0,'There is no pretend active sign-in form');
    assert.equal(await page.locator('a[href^="/auth/google"]').count(),0,'Google is not advertised as active before provider setup');
    assert.equal(await page.locator('#account-save-form').count(),0,'No anonymous private upload action');
    assert.deepEqual(writes,[],'Opening an account page must not upload the device ledger');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('degreepath-guide-v3'))),draft);
    const build=page.getByRole('link',{name:/Build my plan/i}).first();assert(await build.isVisible());await build.click();
    // A device that already holds a saved goal opens that plan rather than the start screen.
    await page.waitForURL(u=>u.pathname==='/plan.html');await page.locator('.course-plan-pending').waitFor();
    assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('degreepath-guide-v3')))).learning[0].id,'private-source');
  });
  assert.deepEqual(errors,[],'Public journeys must not produce JavaScript errors');
  console.log('\n'+count+' public website browser journeys passed.');
}finally{for(const ctx of contexts)await ctx.close();if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
