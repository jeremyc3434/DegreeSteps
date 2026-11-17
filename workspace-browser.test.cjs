/* Consumer workspace journeys against a local preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const liberty = require('./dist/data/liberty.json');
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8131/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
const PROGRAM = 'liberty-business-residential';
const contexts = [], errors = [];
let browser, count = 0;
function seed(privateLearning = false) {
  const route = catalog.pathways.find(item => item.modelId === PROGRAM);
  let state = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
  if (privateLearning) {
    state.learning = [{id:'private-source-keep',provider:'Community college',code:'KEEP-101',title:'My original private course',credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-06-01',evaluations:[]}];
    state.profile.goalDetail = 'PRIVATE-MOTIVE';
    state = Sheet.setNote(state,PROGRAM,'engl-101','PRIVATE-NOTE');
  }
  return state;
}
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY);
const money = (page,host='#sheet-savings') => page.locator(host+' [data-savings="money"]').innerText();
async function estimate(page,expected) {
  await page.waitForFunction(expected => document.querySelector('#sheet-savings [data-savings="money"]')?.textContent === expected,expected);
}
async function test(name,fn) {await fn();count++;console.log('PASS '+name);}
async function fresh(path='plan.html',saved=seed(),viewport={width:1440,height:1000}) {
  const context = await browser.newContext({viewport});contexts.push(context);
  if (saved) await context.addInitScript(({key,value}) => {if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:saved});
  const page = await context.newPage();page.on('pageerror',error => errors.push(error.message));
  await page.goto(BASE+path,{waitUntil:'networkidle'});
  await page.locator('#degree-app-shell').waitFor({state:'attached'});
  await page.locator('.dp-shell-header').waitFor({state:'visible'});
  return page;
}
async function planReady(page) {
  await page.waitForURL(url => url.pathname.endsWith('/plan.html') && !url.searchParams.has('task'));
  await page.locator('#sheet-workspace:not([hidden])').waitFor();
  await estimate(page,'$65,470');
}
const nav = (page,name) => page.locator('#degree-app-shell [data-shell-nav="'+name+'"]:visible').first();
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  await test('a first-time student enters a focused wizard with optional help rather than a sample degree',async () => {
    const page = await fresh('plan.html',null);
    await page.waitForURL(url => url.pathname.endsWith('/portal.html'));
    await page.locator('#portal-question-title').waitFor();
    assert(await page.locator('body').evaluate(node => node.classList.contains('is-onboarding')));
    assert.equal(await page.locator('.dp-shell-sidebar').isVisible(),false);
    assert.equal(await page.locator('.dp-shell-bottom').isVisible(),false);
    assert.equal(await page.locator('#portal-savings').isVisible(),false);
    assert.equal((await stored(page)).selectedPathwayId,'');
    assert(await page.locator('#portal-content [data-answer]').count()>=2);
    await page.locator('[data-answer="target"]').click();
    const tip = page.locator('.portal-tip').first();
    assert.equal(await tip.getAttribute('open'),null);
    await tip.locator('summary').click();
    assert.equal(await tip.evaluate(node => node.open),true);
    assert((await tip.innerText()).length>25);
    assert.equal((await stored(page)).journey.step,'school');
    await page.reload({waitUntil:'networkidle'});
    assert.equal((await stored(page)).journey.step,'school');
  });
  await test('a returning student opens the editable plan with one next win and the actual course-map estimate',async () => {
    const page = await fresh('portal.html');await planReady(page);
    assert(await page.locator('tr.sheet-row').count()>0);
    assert.equal(await page.locator('#sheet-home [data-next-win]').count(),1);
    assert.match(await page.locator('#sheet-titlebar').innerText(),/Liberty University/);
    assert.match(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),/^80 planned · 0 completed · 0 confirmed$/);
    assert.equal(await money(page),'$65,470');
    assert(!/74,170/.test(await page.locator('#sheet-savings').innerText()));
    assert.equal(await nav(page,'plan').getAttribute('aria-current'),'page');
    assert.equal(await nav(page,'credits').getAttribute('href'),'courses.html');
    assert.match(await page.locator('.dp-shell-save:visible').innerText(),/Saved on this device/);
    assert(!/cloud|account/i.test(await page.locator('.dp-shell-save:visible').innerText()));
  });
  await test('comparing a course previews a real tuition change before Apply and preserves private learning when applied',async () => {
    const original = seed(true),page = await fresh('plan.html',original);await planReady(page);
    const before = await stored(page);
    await page.locator('[data-compare-row="engl-101"]').first().click();
    await page.locator('#sheet-dialog[open] .sheet-comparison-options').waitFor();
    const university = liberty.requirements.find(req=>req.id==='engl-101').options.find(option=>option.provider==='University');
    const preview = page.locator('[data-preview-row="engl-101"][data-option="'+university.id+'"]');
    await preview.click();
    await page.waitForFunction(() => document.querySelector('[data-comparison-credits]')?.textContent === '77');
    assert.equal(await page.locator('[data-comparison-cost]').innerText(),'$40,085');
    assert.match(await page.locator('[data-comparison-delta]').innerText(),/\$3,995 higher estimated cost/);
    assert.equal(await money(page),'$65,470','Preview must not replace the saved-plan estimate');
    assert.deepEqual((await stored(page)).scenarios,before.scenarios,'A preview must not persist course choices');
    await page.locator('[data-apply-course="engl-101"]').click();
    await estimate(page,'$61,475');
    const after = await stored(page);
    assert.equal(after.scenarios[PROGRAM].optionSelections['engl-101'],university.id);
    assert.deepEqual(after.learning,before.learning);
    assert.deepEqual(after.sheet.notes,before.sheet.notes);
    assert.equal(after.profile.goalDetail,'PRIVATE-MOTIVE');
    assert(after.learning.every(record => record.evaluations.every(evaluation => evaluation.status!=='confirmed')));
    await page.locator('#close-sheet-dialog').click();
    await page.reload({waitUntil:'networkidle'});await estimate(page,'$61,475');
    assert.equal((await stored(page)).scenarios[PROGRAM].optionSelections['engl-101'],university.id);
  });
  await test('course progress earns a personal milestone while school confirmation remains a separate action',async () => {
    const page = await fresh();await planReady(page);
    await page.locator('#sheet-momentum [data-momentum-milestone="course-finished"]').waitFor({state:'attached'});
    assert.equal(await page.locator('#sheet-momentum [data-momentum-milestone="course-finished"]').getAttribute('data-earned'),'false');
    assert.equal((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim(),'');
    await page.locator('[data-progress="engl-101"]').selectOption('completed');
    await page.waitForFunction(() => document.querySelector('#sheet-momentum [data-momentum-milestone="course-finished"]')?.dataset.earned === 'true');
    assert.equal(await page.locator('#sheet-momentum [data-momentum-milestone="transfer-confirmed"]').getAttribute('data-earned'),'false');
    assert.match(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),/3 completed · 0 confirmed/);
    assert.equal(await money(page),'$65,470');
    assert((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim().length>0);
    await page.reload({waitUntil:'networkidle'});await estimate(page,'$65,470');
    assert.equal((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim(),'','Returning to an earned milestone must not replay it');
    await page.locator('[data-requirement="engl-101"] [data-row]').last().click();
    await page.locator('#confirm-placement input').check();
    await page.locator('#confirm-placement button').click();
    await page.waitForFunction(() => document.querySelector('#sheet-momentum [data-momentum-milestone="transfer-confirmed"]')?.dataset.earned === 'true');
    assert.match(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),/3 completed · 3 confirmed/);
    assert.equal(await money(page),'$65,470');
  });
  await test('workspace navigation preserves original records and returns credit tasks to the plan',async () => {
    const page = await fresh('plan.html',seed(true));await planReady(page);
    const before = await stored(page);
    await nav(page,'credits').click();
    await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await page.locator('#courses-results').waitFor();
    await page.locator('#courses-add-own').click();
    await page.locator('#sheet-dialog[open] #sheet-learning-form').waitFor();
    assert.equal(await nav(page,'credits').getAttribute('aria-current'),'page');
    assert.match(await page.locator('#sheet-dialog-content').innerText(),/My original private course/);
    await page.locator('#close-sheet-dialog').click();await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await nav(page,'plan').click();await planReady(page);
    await nav(page,'explore').click();
    await page.waitForURL(url=>url.pathname.endsWith('/library.html'));
    await page.locator('#explore').waitFor();
    assert.equal(await nav(page,'explore').getAttribute('aria-current'),'page');
    if (await page.locator('#workspace').count()) assert.equal(await page.locator('#workspace').isVisible(),false,'Explore must not expose the legacy duplicate worksheet');
    await nav(page,'plan').click();await planReady(page);
    assert.deepEqual((await stored(page)).learning,before.learning);
    assert.deepEqual((await stored(page)).sheet.notes,before.sheet.notes);
  });
  await test('choosing an Explore school starts its exact-degree question without losing private learning',async () => {
    const page = await fresh('plan.html',seed(true));await planReady(page);
    const before = await stored(page);
    await nav(page,'explore').click();
    await page.locator('#cards [data-plan="cosc"]').click();
    await page.waitForURL(url=>url.pathname.endsWith('/portal.html') && url.searchParams.get('view')==='setup');
    await page.locator('#portal-question-title').waitFor();
    const after = await stored(page);
    assert.equal(after.journey.step,'degree');
    assert.equal(after.journey.completed,false);
    assert.equal(after.profile.school,'Charter Oak State College');
    assert.equal(after.profile.degree,'');
    assert.equal(after.selectedPathwayId,'');
    assert.deepEqual(after.learning,before.learning);
    assert.deepEqual(after.sheet.notes,before.sheet.notes);
    assert.equal(await page.locator('.dp-shell-sidebar').isVisible(),false);
    assert.equal(await page.locator('#portal-savings').isVisible(),false);
  });
  await test('phone layouts keep the first course visible and compare and credit controls usable',async () => {
    for (const width of [390,320]) {
      const page = await fresh('plan.html',seed(),{width,height:844});await planReady(page);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The app must not overflow the phone width');
      assert.equal(await page.locator('.dp-shell-sidebar').isVisible(),false);
      assert.equal(await page.locator('.dp-shell-bottom').isVisible(),true);
      const first = await page.locator('tr.sheet-row').first().boundingBox();
      assert(first.y<844,'At least one course should appear in the initial viewport');
      assert(await page.locator('#sheet-grid').evaluate(node=>node.scrollWidth>node.clientWidth),'The worksheet retains its own horizontal scrolling');
      await page.locator('[data-compare-row="engl-101"]').first().click();
      await page.locator('#sheet-dialog[open] .sheet-comparison-options').waitFor();
      const close = await page.locator('#close-sheet-dialog').boundingBox();
      assert(close.x>=0 && close.y>=0 && close.x+close.width<=width+1 && close.y+close.height<=844);
      await page.locator('#close-sheet-dialog').click();
      await nav(page,'credits').click();
      await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await page.locator('#courses-results').waitFor();
    await page.locator('#courses-add-own').click();
    await page.locator('#sheet-dialog[open] #sheet-learning-form').waitFor();
      assert.equal(await page.locator('.dp-shell-bottom').isVisible(),false,'A focused credit task keeps its own unobstructed controls');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('#close-sheet-dialog').click();await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await nav(page,'plan').click();await planReady(page);
    }
  });
  assert.deepEqual(errors,[],'Workspace journeys must not throw browser exceptions');
  console.log('\n'+count+' refreshed workspace browser journeys passed.');
} finally {for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
