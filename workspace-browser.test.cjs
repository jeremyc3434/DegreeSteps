/* Consumer workspace journeys against a local preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const liberty = require('./dist/data/liberty.json');
const Savings = require('./dist/savings-engine.js'),Catalog = require('./dist/program-catalog.js'),costs = require('./dist/data/cost-comparisons.json');
const models = Catalog.modelFiles.map(file => require('./dist/'+file));
const usd = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
// Estimates are computed from the reviewed curriculum and cost data the page uses, so data updates do not need test edits.
const projected = state => Savings.calculate(state,Journey.buildDraft(state,catalog,models),costs).projected;
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
  const expected = usd(projected(await stored(page)).netDifference);
  await estimate(page,expected);
  return expected;
}
// The editable worksheet (with momentum milestones) is the plan's detailed view.
async function worksheet(page) {
  await page.goto(BASE+'plan.html?editor=1',{waitUntil:'networkidle'});
  await page.locator('tr.sheet-row').first().waitFor();
  const expected = usd(projected(await stored(page)).netDifference);
  await estimate(page,expected);
  return expected;
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
    // Optional help is one secondary choice rather than an expanded explanation.
    const help = page.getByRole('button',{name:'Help me choose a school',exact:true});
    assert(await help.isVisible());
    assert.equal(await page.locator('#portal-content [data-answer]').count(),1);
    assert.equal((await stored(page)).journey.step,'school');
    await page.reload({waitUntil:'networkidle'});
    assert.equal((await stored(page)).journey.step,'school');
  });
  await test('a returning student opens the course plan with one next action and the actual course-map estimate',async () => {
    const page = await fresh('portal.html');const expected = await planReady(page);
    assert(await page.locator('tr.course-plan-row').count()>0);
    assert.equal(await page.locator('.plan-next-action').count(),1);
    assert.match(await page.locator('#sheet-titlebar').innerText(),/Liberty University/);
    assert.equal(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),projected(seed()).transferCredits+' outside credits · 0 finished');
    assert.equal(await money(page),expected);
    assert(!/74,170/.test(await page.locator('#sheet-savings').innerText()));
    assert.equal(await nav(page,'plan').getAttribute('aria-current'),'page');
    assert.equal(await nav(page,'credits').getAttribute('href'),'courses.html?tab=mine');
    assert.match(await page.locator('.dp-shell-save:visible').innerText(),/Sign in to save|Not saved to your account|Saved to your account|Changes to save|Save plan/);
  });
  await test('comparing a course previews a real tuition change before Apply and preserves private learning when applied',async () => {
    const original = seed(true),page = await fresh('plan.html',original);const current = await planReady(page);
    const before = await stored(page);
    const university = liberty.requirements.find(req=>req.id==='engl-101').options.find(option=>option.provider==='University');
    const base = projected(before),changed = projected(Sheet.setCourse(structuredClone(before),PROGRAM,'engl-101',university.id));
    await page.locator('[data-compare-row="engl-101"]').first().click();
    await page.locator('#sheet-dialog[open] .sheet-comparison-options').waitFor();
    const preview = page.locator('[data-preview-row="engl-101"][data-option="'+university.id+'"]');
    await preview.click();
    await page.waitForFunction(expected => document.querySelector('[data-comparison-credits]')?.textContent === expected,String(changed.transferCredits));
    assert.equal(await page.locator('[data-comparison-cost]').innerText(),usd(changed.afterTuition+changed.outsideBudget));
    assert(changed.netDifference<base.netDifference,'taking the course at the university costs more');
    assert.match(await page.locator('[data-comparison-delta]').innerText(),new RegExp(usd(base.netDifference-changed.netDifference).replace('$','\\$')+' higher estimated cost'));
    assert.equal(await money(page),current,'Preview must not replace the saved-plan estimate');
    assert.deepEqual((await stored(page)).scenarios,before.scenarios,'A preview must not persist course choices');
    await page.locator('[data-apply-course="engl-101"]').click();
    await estimate(page,usd(changed.netDifference));
    const after = await stored(page);
    assert.equal(after.scenarios[PROGRAM].optionSelections['engl-101'],university.id);
    assert.deepEqual(after.learning,before.learning);
    assert.deepEqual(after.sheet.notes,before.sheet.notes);
    assert.equal(after.profile.goalDetail,'PRIVATE-MOTIVE');
    assert(after.learning.every(record => record.evaluations.every(evaluation => evaluation.status!=='confirmed')));
    await page.locator('#close-sheet-dialog').click();
    await page.reload({waitUntil:'networkidle'});await estimate(page,usd(changed.netDifference));
    assert.equal((await stored(page)).scenarios[PROGRAM].optionSelections['engl-101'],university.id);
  });
  await test('course progress earns a personal milestone while school confirmation remains a separate action',async () => {
    const page = await fresh();await planReady(page);const expected = await worksheet(page);
    await page.locator('#sheet-momentum [data-momentum-milestone="course-finished"]').waitFor({state:'attached'});
    assert.equal(await page.locator('#sheet-momentum [data-momentum-milestone="course-finished"]').getAttribute('data-earned'),'false');
    assert.equal((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim(),'');
    await page.locator('[data-progress="engl-101"]').selectOption('completed');
    await page.waitForFunction(() => document.querySelector('#sheet-momentum [data-momentum-milestone="course-finished"]')?.dataset.earned === 'true');
    assert.equal(await page.locator('#sheet-momentum [data-momentum-milestone="transfer-confirmed"]').getAttribute('data-earned'),'false');
    assert.match(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),/· 3 finished$/);
    assert.equal(await money(page),expected);
    assert((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim().length>0);
    await page.reload({waitUntil:'networkidle'});await estimate(page,expected);
    assert.equal((await page.locator('#sheet-momentum .momentum-announcement').innerText()).trim(),'','Returning to an earned milestone must not replay it');
    await page.locator('[data-requirement="engl-101"] [data-row]').last().click();
    await page.locator('#confirm-placement input').check();
    await page.locator('#confirm-placement button').click();
    await page.waitForFunction(() => document.querySelector('#sheet-momentum [data-momentum-milestone="transfer-confirmed"]')?.dataset.earned === 'true');
    assert.match(await page.locator('#sheet-savings [data-savings="progress"]').innerText(),/· 3 finished$/);
    assert.equal(await money(page),expected);
  });
  await test('workspace navigation preserves original records and returns credit tasks to the plan',async () => {
    const page = await fresh('plan.html',seed(true));await planReady(page);
    const before = await stored(page);
    await nav(page,'credits').click();
    await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await page.locator('#courses-results').waitFor();
    await page.locator('#courses-add-manual').click();
    await page.locator('#sheet-dialog[open] #sheet-learning-form').waitFor();
    assert.equal(await nav(page,'credits').getAttribute('aria-current'),'page');
    assert.match(await page.locator('#sheet-dialog-content').innerText(),/My original private course/);
    await page.locator('#close-sheet-dialog').click();await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await nav(page,'plan').click();await planReady(page);
    await nav(page,'programs').click();
    await page.waitForURL(url=>url.pathname.endsWith('/programs.html'));
    await page.locator('.pf-program').first().waitFor();
    assert.equal(await nav(page,'programs').getAttribute('aria-current'),'page');
    assert.equal((await stored(page)).selectedPathwayId,before.selectedPathwayId,'Browsing degrees does not change the plan');
    await nav(page,'plan').click();await planReady(page);
    assert.deepEqual((await stored(page)).learning,before.learning);
    assert.deepEqual((await stored(page)).sheet.notes,before.sheet.notes);
  });
  await test('opening a plan from Find a degree keeps private learning and the previous plan',async () => {
    const page = await fresh('plan.html',seed(true));await planReady(page);
    const before = await stored(page);
    await nav(page,'programs').click();
    const card = page.locator('.pf-program').filter({hasNot:page.locator('[href$="usePlan='+PROGRAM+'"]')}).first();
    const target = new URL(await card.locator('.pf-open-plan').getAttribute('href'),BASE).searchParams.get('usePlan');
    await card.locator('.pf-open-plan').click();
    // A student with a plan in progress is asked before See courses switches plans.
    const confirm = page.locator('#program-switch-dialog');await confirm.waitFor();
    assert.match(await confirm.innerText(),/Your current plan and courses stay saved\./);
    await confirm.getByRole('link',{name:'Switch',exact:true}).click();
    await page.waitForURL(url=>url.pathname.endsWith('/plan.html'));await page.locator('tr.course-plan-row').first().waitFor();
    const after = await stored(page);
    assert.equal(after.selectedPathwayId,target);
    assert(after.whatIf.snapshots.some(snapshot=>snapshot.pathwayId===before.selectedPathwayId),'The previous plan stays available');
    assert.deepEqual(after.learning,before.learning);
    assert.deepEqual(after.sheet.notes,before.sheet.notes);
    assert.equal(after.profile.goalDetail,'PRIVATE-MOTIVE');
  });
  await test('phone layouts keep compare and credit controls usable',async () => {
    for (const width of [390,320]) {
      const page = await fresh('plan.html',seed(),{width,height:844});await planReady(page);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The app must not overflow the phone width');
      assert.equal(await page.locator('.dp-shell-sidebar').isVisible(),false);
      assert.equal(await page.locator('.dp-shell-bottom').isVisible(),true);
      await page.locator('[data-compare-row="engl-101"]').first().click();
      await page.locator('#sheet-dialog[open] .sheet-comparison-options').waitFor();
      const close = await page.locator('#close-sheet-dialog').boundingBox();
      assert(close.x>=0 && close.y>=0 && close.x+close.width<=width+1 && close.y+close.height<=844);
      await page.locator('#close-sheet-dialog').click();
      await nav(page,'credits').click();
      await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await page.locator('#courses-results').waitFor();
    await page.locator('#courses-add-manual').click();
    await page.locator('#sheet-dialog[open] #sheet-learning-form').waitFor();
      assert.equal(await page.locator('.dp-shell-bottom').isVisible(),false,'A focused credit task keeps its own unobstructed controls');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('#close-sheet-dialog').click();await page.waitForURL(url=>url.pathname.endsWith('/courses.html'));
    await nav(page,'plan').click();await planReady(page);
    }
  });
  // Phones show a compact glance (headline numbers, cost line, next step, jump link) and fold the
  // route, progress and estimate details, so the first course starts in the first screen.
  await test('phone plans show the first course in the initial viewport',async () => {
    for (const width of [390,320]) {
      const page = await fresh('plan.html',seed(),{width,height:844});await planReady(page);
      const first = await page.locator('tr.course-plan-row').first().boundingBox();
      assert(first.y<844,'At least one course should appear in the initial viewport (first course at y='+Math.round(first.y)+')');
    }
  });
  await test('phone plans keep the headline numbers and cost line visible and fold the route behind a disclosure',async () => {
    const page = await fresh('plan.html',seed(),{width:390,height:844});const expected = await planReady(page);
    const glance = page.locator('#sheet-glance');await glance.waitFor();
    assert.match(await glance.innerText(),/Your degree: 120 credits/);
    assert.match(await glance.locator('[data-phone-fold="cost"]').innerText(),/Planning estimate|Estimated|Total cost/);
    assert.equal(await page.locator('#sheet-route').isVisible(),false);assert.equal(await page.locator('#sheet-next').isVisible(),false);
    assert(await page.locator('.sheet-glance-next').isVisible(),'the next step stays visible in the glance');
    const fold = glance.locator('[data-phone-fold="progress"]');await fold.click();
    assert.equal(await fold.getAttribute('aria-expanded'),'true');assert(await page.locator('#sheet-route').isVisible());
    await page.locator('#sheet-titlebar [data-jump-courses]').click();assert.equal(await page.evaluate(() => document.activeElement?.id),'sheet-grid');
    assert.equal(await money(page),expected,'the folded estimate still holds the same figure');
    const desktop = await fresh('plan.html');await planReady(desktop);
    assert.equal(await desktop.locator('#sheet-glance').isVisible(),false);assert.equal(await desktop.locator('#sheet-titlebar [data-jump-courses]').isVisible(),false);
    assert(await desktop.locator('#sheet-route').isVisible());assert(await desktop.locator('#sheet-next').isVisible());
  });
  assert.deepEqual(errors,[],'Workspace journeys must not throw browser exceptions');
  console.log('\n'+count+' refreshed workspace browser journeys passed.');
} finally {for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
