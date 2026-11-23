/* Redesign 3/6 (Build my plan): home search → step 1 (pick a degree) → step 2 (credits you have) → My plan, every step-2
   answer path, the 1-minute quiz, the redirects and every older portal view/param, at phone and desktop widths. The home
   page keeps its search content (title, meta, JSON-LD, section headings). Needs a running preview
   (DEGREEPATH_TEST_URL, default http://127.0.0.1:8133/). No saved plan is seeded except where stated. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const seed=id=>J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(route=>route.id===id)),null,catalog);
const PLAN='apus-bachelor-of-arts-in-psychology';
let browser,count=0;const contexts=[];
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
async function open(width,path,{plan=null}={}){
  const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);
  if(plan)await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:seed(plan)});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(BASE+path,{waitUntil:'load'});
  return {page,errors};
}
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const stored=page=>page.evaluate(key=>localStorage.getItem(key),KEY);

(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

  await test('home: search-first hero, quiz link and 3-step explainer, with every search section and tag kept',async()=>{
    const {page,errors}=await open(390,'');
    assert.equal(await page.locator('main h1').count(),1);
    assert.equal((await page.locator('main h1').innerText()).trim(),'Finish your degree for less.');
    const form=page.locator('form.home-search-form');
    assert.equal(await form.getAttribute('action'),'/start.html');
    assert(await page.getByLabel('What do you want to study?').isVisible());
    assert.equal(await page.locator('.home-search-chip').count(),5);
    assert.equal(await page.getByRole('link',{name:/1-minute quiz/}).first().getAttribute('href'),'/start.html?step=quiz');
    assert.equal(await page.locator('.home-search-steps li').count(),3);
    // Search content below the hero is kept: the example chapters, the cost tool, guides, FAQ, founder story.
    for(const id of ['#home-step-1','#home-step-2','#home-step-3','.home-proof-story','.home-reading','.home-questions','.home-final'])assert(await page.locator(id).count(),id+' is kept');
    assert(await page.locator('#home-steps-title').count(),'the example chapter heading is kept (as an h2)');
    assert.match(await page.title(),/College planning, credits & costs/);
    assert(await page.locator('meta[name="description"]').getAttribute('content'));
    assert(await page.locator('link[rel="canonical"]').count());
    assert(await page.locator('meta[property="og:title"]').count());
    const types=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes.flatMap(node=>{const v=JSON.parse(node.textContent);return (Array.isArray(v)?v:[v]).map(item=>item['@type']);}));
    for(const type of ['Organization','WebSite'])assert(types.includes(type),type+' JSON-LD is kept');
    assert.equal(await overflow(page),0);assert.deepEqual(errors,[]);
    await page.getByLabel('What do you want to study?').fill('psychology');
    await page.getByRole('button',{name:'Show my options'}).click();
    await page.waitForURL(/start\.html\?q=psychology/);
    await page.locator('#start-step-degree:not([hidden])').waitFor();
    assert.equal(await page.locator('#start-q').inputValue(),'psychology');
  });

  for(const width of [390,1440]){
    await test('step 1 at '+width+'px: filters, cards with cost and low-cost credits, and Build this plan opens step 2',async()=>{
      const {page,errors}=await open(width,'start.html?subject=psychology');
      await page.locator('#start-step-degree:not([hidden])').waitFor({timeout:30000});
      assert.match(await page.locator('.start-step-label').first().innerText(),/Step 1 of 3/);
      assert.equal(await page.locator('[data-filter="subject"][aria-pressed="true"]').getAttribute('data-value'),'psychology');
      const cards=page.locator('.start-card');assert(await cards.count()>0);
      const first=cards.first();assert.match(await first.innerText(),/Est\. cost/);assert.match(await first.innerText(),/Low-cost (credits|units)/);
      assert.equal(await overflow(page),0,'no horizontal overflow');
      await page.locator('[data-filter="level"][data-value="associate"]').click();
      assert.equal(await page.locator('[data-filter="level"][data-value="associate"]').getAttribute('aria-pressed'),'true');
      await page.locator('[data-filter="level"][data-value=""]').click();
      await page.locator('#start-sort').selectOption('outside');
      assert.match(page.url(),/sort=outside/);
      await cards.first().getByRole('link',{name:'Build this plan'}).click();
      await page.locator('#start-step-credits:not([hidden])').waitFor();
      assert.match(await page.locator('#start-step-credits .start-step-label').innerText(),/Step 2 of 3/);
      assert.equal(await stored(page),null,'choosing a degree writes nothing until the plan opens');
      assert.equal(await overflow(page),0);assert.deepEqual(errors,[]);
    });
  }

  // Each step-2 answer opens the plan on the matching existing step.
  for(const [answer,check] of [
    ['none',async page=>{await page.waitForURL(/plan\.html\?task=credits&prior=none/,{timeout:60000});}],
    ['some',async page=>{await page.waitForURL(/plan\.html\?task=credits&manual=1/,{timeout:60000});await page.locator('#sheet-dialog[open]').waitFor({timeout:30000});}],
    ['upload',async page=>{await page.waitForURL(/import-courses\.html\?from=plan/,{timeout:60000});}]
  ]){
    for(const width of [390,1440]){
      await test('step 2 at '+width+'px: "'+answer+'" opens the plan on its step and saves the chosen degree',async()=>{
        const {page,errors}=await open(width,'start.html?step=credits&plan='+PLAN);
        await page.locator('#start-step-credits:not([hidden])').waitFor({timeout:30000});
        assert.match(await page.locator('#start-picked').innerText(),/Psychology/);
        await page.locator('input[name="prior"][value="'+answer+'"]').check();
        await page.getByRole('button',{name:'See my plan'}).click();
        await check(page);
        const state=JSON.parse(await stored(page));
        assert.equal(state.selectedPathwayId,PLAN,'the plan is saved through the existing portal path');
        assert.deepEqual(errors,[]);
      });
    }
  }

  await test('step 2: Skip records "later" and the military line opens the military preferences',async()=>{
    const {page}=await open(390,'start.html?step=credits&plan='+PLAN);
    await page.locator('#start-step-credits:not([hidden])').waitFor({timeout:30000});
    assert.match(await page.locator('#start-credits-skip').getAttribute('href'),/usePlan=apus-bachelor-of-arts-in-psychology&then=later/);
    await page.locator('#start-military').click();
    await page.waitForURL(/plan\.html\?task=preferences/,{timeout:60000});
    await page.locator('#sheet-dialog[open]').waitFor({timeout:30000});
    assert.match(await page.locator('#sheet-dialog').innerText(),/Military/);
  });

  await test('deep links that name a plan skip to step 2; an unknown plan falls back to step 1 with a note',async()=>{
    for(const path of ['start.html?usePlan='+PLAN,'start.html?school='+encodeURIComponent('American Public University System')+'&program='+PLAN+'&format=online']){
      const {page}=await open(390,path);await page.locator('#start-step-credits:not([hidden])').waitFor({timeout:30000});
    }
    const {page}=await open(390,'start.html?plan=not-a-real-plan');
    await page.locator('#start-step-degree:not([hidden])').waitFor({timeout:30000});
    assert.match(await page.locator('#start-error').innerText(),/isn’t available/);
  });

  for(const width of [390,1440]){
    await test('the 1-minute quiz at '+width+'px is one card per question and ends on matching step-1 results',async()=>{
      const {page,errors}=await open(width,'start.html?step=quiz');
      await page.locator('#start-step-quiz:not([hidden])').waitFor({timeout:30000});
      const pick=async label=>{await page.locator('[data-quiz-answer]').filter({hasText:label}).first().click();};
      assert.match(await page.locator('#start-quiz-count').innerText(),/Question 1 of 5/);
      await pick('Change careers');
      await page.keyboard.press('Tab');
      await pick('Bachelor’s');await pick('Psychology & human services');await pick('Online');
      await page.locator('#start-quiz-back').click();assert.match(await page.locator('#start-quiz-count').innerText(),/Question 4 of 5/);
      await pick('Online');await pick('Most credits for less');
      await page.waitForURL(/start\.html\?.*level=bachelor/);
      const url=new URL(page.url());
      assert.equal(url.searchParams.get('subject'),'psychology');assert.equal(url.searchParams.get('format'),'online');assert.equal(url.searchParams.get('sort'),'outside');
      await page.locator('#start-step-degree:not([hidden])').waitFor();
      assert.equal(await overflow(page),0);assert.deepEqual(errors,[]);
    });
  }

  await test('a licensed-career answer shows the licensure note',async()=>{
    const {page}=await open(390,'start.html?step=quiz');
    await page.locator('#start-step-quiz:not([hidden])').waitFor({timeout:30000});
    await page.locator('[data-quiz-answer="licensed"]').click();
    assert.match(await page.locator('#start-quiz-card').innerText(),/confirm licensure with the school/);
  });

  await test('guided.html redirects to the quiz; header, home and footer entry points reach the new flow',async()=>{
    const {page}=await open(390,'guided.html');
    await page.waitForURL(/start\.html\?step=quiz/,{timeout:30000});
    const home=await open(1440,'');
    assert.equal(await home.page.locator('header .nav-cta, header a:has-text("Build my plan")').first().getAttribute('href'),'/start.html');
    assert.equal(await home.page.locator('[data-home-step-build]').getAttribute('href'),'/start.html');
    assert(await home.page.locator('footer a[href="/portal.html"]').count(),'the setup flow stays reachable from the footer');
    const help=(await open(1440,'start.html')).page;
    await help.locator('#start-step-degree:not([hidden])').waitFor({timeout:30000});
    for(const href of ['start.html?step=quiz','portal.html?view=setup','request-plan.html','programs.html'])assert(await help.locator('.start-help a[href="'+href+'"]').count(),href+' is linked from step 1');
  });

  await test('every older portal view and parameter keeps working',async()=>{
    // No saved plan: setup, edit, about, preferences and school/program deep links open the setup questions.
    for(const path of ['portal.html','portal.html?view=setup','portal.html?view=edit','portal.html?view=about','portal.html?view=preferences','portal.html?school='+encodeURIComponent('Liberty University')+'&program=liberty-business-residential&format=campus']){
      const {page,errors}=await open(390,path);
      await page.locator('#portal-question-title, #portal-content h1').first().waitFor({timeout:60000});
      assert.deepEqual(errors,[],path);
    }
    // ?usePlan= still opens the plan directly (public plan pages link here).
    const used=await open(390,'portal.html?usePlan='+PLAN);await used.page.waitForURL(/plan\.html$/,{timeout:60000});
    // With a saved plan: review and school views, and the plan's task links.
    for(const path of ['portal.html?view=review','portal.html?view=school']){
      const {page,errors}=await open(390,path,{plan:PLAN});
      await page.locator('#portal-content h1, main h1').first().waitFor({timeout:60000});assert.deepEqual(errors,[],path);
    }
    for(const task of ['credits','checks','next','download','cost-time','preferences','ask-school']){
      const {page,errors}=await open(390,'plan.html?task='+task+(task==='credits'?'&manual=1':''),{plan:PLAN});
      await page.locator('#sheet-dialog[open]').waitFor({timeout:60000});assert.deepEqual(errors,[],task);
    }
  });

  console.log('\n'+count+' build-flow checks passed');
}catch(error){console.error(error);process.exitCode=1;}finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();}})();
