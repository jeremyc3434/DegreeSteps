/* The older guided builder (guided.html / wizard.js) is retired (Redesign 3/6, docs/redesign-feature-map.md "Retire
   safely"). Its address redirects to the 1-minute quiz, and older saved records it used to migrate still migrate through
   the shared plan loader. Its other features live in the current builder and plan, each covered by its own suite:
   military questions (portal-browser, guided-planner-usability), course import and CSV templates (csv-import-browser),
   what-if versions and downloads (my-plan-redesign-browser, sheet-browser). Needs a running preview
   (DEGREEPATH_TEST_URL, default http://127.0.0.1:8126/). */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8126/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
let browser,count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  await test('guided.html redirects to the 1-minute quiz without touching a saved plan',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(BASE+'about/',{waitUntil:'load'});await page.evaluate(key=>localStorage.setItem(key,'{"marker":"unchanged"}'),KEY);
    await page.goto(BASE+'guided.html?step=results',{waitUntil:'load'});await page.waitForURL(/start\.html\?step=quiz$/);
    await page.locator('#start-step-quiz:not([hidden])').waitFor({timeout:30000});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'{"marker":"unchanged"}');
    assert.deepEqual(errors,[]);await context.close();
  });
  await test('without scripts the guided address still offers the quiz and My plan',async()=>{
    const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
    await page.goto(BASE+'guided.html',{waitUntil:'load'});
    assert.equal(await page.locator('#guided-quiz-link').getAttribute('href'),'/start.html?step=quiz');
    assert(await page.locator('a[href="/plan.html"]').count());await context.close();
  });
  await test('an older degreepath-pathway-v2 record is still migrated by the shared plan loader',async()=>{
    // The loader portal.html and plan.html use (journey-engine.js) is the one the retired wizard relied on.
    const J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
    const catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json'));
    const state=J.initialize(null,JSON.stringify({fields:{program:'Business Administration',school:'Liberty University'},learning:[]}),catalog);
    assert.equal(state.legacyImported,true);assert.equal(state.version,3);
  });
  console.log('\n'+count+' guided redirect checks passed');
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();}})();
