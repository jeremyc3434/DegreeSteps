/* Course-plan estimate journeys against a local preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const Savings = require('./dist/savings-engine.js');
const catalog = require('./dist/data/pathways.json');
const costs = require('./dist/data/cost-comparisons.json');
const models = ['tesu','liberty'].map(name => require('./dist/data/'+name+'.json'));
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8131/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
const errors = [], contexts = [];
let browser, count = 0;
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
function seed() {
  const route = catalog.pathways.find(path => path.modelId === 'liberty-business-residential');
  return Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
}
async function fresh(path='portal.html', saved=seed(), viewport={width:1440,height:1000}) {
  const context = await browser.newContext({viewport}); contexts.push(context);
  if (saved) await context.addInitScript(({key,value}) => {if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:saved});
  const page = await context.newPage(); page.on('pageerror',error => errors.push(error.message));
  await page.goto(BASE+path,{waitUntil:'networkidle'});
  const returningStudent = saved && !saved.sheet?.isExample && saved.journey?.view !== 'questions' && Boolean(saved.selectedPathwayId || saved.profile?.pathwayId || saved.profile?.school && saved.profile?.degree);
  if (path.startsWith('portal') && returningStudent) await page.waitForURL(url => url.pathname.endsWith('/plan.html'));
  if (new URL(page.url()).pathname.endsWith('/portal.html')) await page.locator('#portal-content').waitFor({state:'visible'});
  else if (new URL(page.url()).searchParams.has('task')) await page.locator('#sheet-dialog[open] #sheet-dialog-content').waitFor({state:'visible'});
  else await page.locator('#sheet-workspace:not([hidden])').waitFor({state:'visible'});
  return page;
}
async function text(page, host, key) {return (await page.locator(host+' [data-savings="'+key+'"]').innerText()).trim();}
async function value(page, host, expected) {await page.waitForFunction(({host,expected}) => document.querySelector(host+' [data-savings="money"]')?.textContent === expected,{host,expected});}
async function test(name, fn) {await fn(); count++; console.log('PASS '+name);}
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  await test('a new student sees no estimate before choosing a target',async () => {
    const page = await fresh('portal.html',null);
    assert.equal(await page.locator('#portal-savings').isVisible(),false);
  });
  await test('the returning-student portal opens the actual eighty-credit Liberty worksheet rather than the ninety-credit policy illustration',async () => {
    const page = await fresh(); await value(page,'#sheet-savings','$65,470');
    assert(new URL(page.url()).pathname.endsWith('/plan.html'),'Returning students should land on their canonical degree worksheet');
    assert.equal(await text(page,'#sheet-savings','terms'),'5 semesters');
    assert.equal(await text(page,'#sheet-savings','progress'),'80 planned · 0 completed · 0 confirmed');
    assert(!/74,170/.test(await page.locator('#sheet-savings').innerText()));
  });
  await test('reporting and confirming a planned course updates allocated progress without awarding projected savings twice',async () => {
    const page = await fresh('plan.html'); await value(page,'#sheet-savings','$65,470');
    await page.locator('[data-progress="engl-101"]').selectOption('completed');
    await page.waitForFunction(() => document.querySelector('#sheet-savings [data-savings="progress"]')?.textContent.includes('3 completed'));
    assert.equal(await text(page,'#sheet-savings','money'),'$65,470');
    assert.match(await text(page,'#sheet-savings','progress'),/3 completed · 0 confirmed/);
    assert.match(await page.locator('#sheet-savings .savings-delta').innerText(),/already included/);
    await page.locator('[data-requirement="engl-101"] [data-row]').last().click();
    await page.locator('#confirm-placement input').check();
    await page.locator('#confirm-placement button').click();
    await page.waitForFunction(() => document.querySelector('#sheet-dialog-savings [data-savings="progress"]')?.textContent.includes('3 confirmed'));
    assert.equal(await text(page,'#sheet-dialog-savings','money'),'$65,470');
  });
  await test('choosing a university course recalculates from the new course map',async () => {
    const page = await fresh('plan.html'); await value(page,'#sheet-savings','$65,470');
    await page.locator('[data-provider="engl-101"]').selectOption('University');
    const state = await stored(page), expected = Savings.calculate(state,Journey.buildDraft(state,catalog,models),costs);
    await value(page,'#sheet-savings',new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected.projected.netDifference));
    assert.equal(expected.projected.transferCredits,77);
    assert.match(await text(page,'#sheet-savings','progress'),/^77 planned/);
  });
  await test('budget and pace are applied explicitly, persist on reload, and reopen a previously reviewed estimate',async () => {
    const saved = seed(); saved.journey.planReviewed=true; saved.journey.schoolContacted=true;
    const page = await fresh('portal.html',saved); await value(page,'#sheet-savings','$65,470');
    const host = page.locator('#sheet-savings'); await host.locator('.savings-details > summary').click();
    await host.locator('[name="savings-budget"]').fill('3000');
    assert.equal(await text(page,'#sheet-savings','money'),'$65,470');
    assert.equal((await stored(page)).savings,undefined);
    await host.locator('[name="savings-pace"]').fill('12');
    await host.locator('.savings-apply').click();
    const state = await stored(page), prefs = state.savings['liberty-business-residential'];
    assert.deepEqual(prefs,{outsideBudget:3000,unitsPerTerm:12});
    assert.equal(state.journey.planReviewed,false); assert.equal(state.journey.schoolContacted,false);
    const expected = Savings.calculate(state,Journey.buildDraft(state,catalog,models),costs);
    const formatted = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected.projected.netDifference);
    await value(page,'#sheet-savings',formatted);
    await page.reload({waitUntil:'networkidle'}); await value(page,'#sheet-savings',formatted);
    assert.deepEqual((await stored(page)).savings['liberty-business-residential'],prefs);
  });
  await test('unsupported exact targets show estimate pending with a comparison link and no fake dollar value',async () => {
    const state = seed(); state.selectedPathwayId='custom-target';
    Object.assign(state.profile,{pathwayId:'custom-target',school:'Exact New School',degree:'Exact New Degree'});
    const page = await fresh('plan.html',state);
    await page.locator('#sheet-savings .savings-pending-title').waitFor();
    assert.match(await page.locator('#sheet-savings').innerText(),/Estimate pending/);
    assert.equal(await page.locator('#sheet-savings [data-savings="money"]').count(),0);
    assert.equal(await page.locator('#sheet-savings a[href="compare/"]').count(),1);
  });
  await test('an out-of-range budget is explained without changing saved assumptions or the displayed estimate',async () => {
    const page = await fresh(); await value(page,'#sheet-savings','$65,470');
    const host = page.locator('#sheet-savings'); await host.locator('.savings-details > summary').click();
    assert.equal(await host.locator('[name="savings-budget"]').getAttribute('max'),'100000');
    await host.locator('[name="savings-budget"]').fill('100000.01');
    await host.locator('.savings-apply').click();
    assert.match(await host.locator('.savings-setting-error').innerText(),/\$0 to \$100,000/);
    assert.equal((await stored(page)).savings,undefined);
    assert.equal(await text(page,'#sheet-savings','money'),'$65,470');
    await host.locator('[name="savings-budget"]').fill('0');
    await host.locator('.savings-apply').click(); await value(page,'#sheet-savings','$67,470');
    assert.equal((await stored(page)).savings['liberty-business-residential'].outsideBudget,0);
  });
  await test('invalid saved assumptions show an editable recovery without silently replacing stored values',async () => {
    const state = seed(); state.savings={'liberty-business-residential':{outsideBudget:250000,unitsPerTerm:12}};
    const page = await fresh('portal.html',state), host = page.locator('#sheet-savings');
    await host.locator('.savings-recovery').waitFor();
    assert.match(await host.innerText(),/Estimate pending/);
    assert.equal(await host.locator('[name="savings-budget"]').inputValue(),'2000');
    assert.equal(await host.locator('[name="savings-pace"]').inputValue(),'12','The valid saved pace should be preserved');
    assert.deepEqual((await stored(page)).savings,state.savings);
    await page.reload({waitUntil:'networkidle'}); await host.locator('.savings-recovery').waitFor();
    assert.deepEqual((await stored(page)).savings,state.savings);
    await host.locator('[name="savings-budget"]').fill('3000');
    await host.locator('.savings-apply').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#sheet-savings [data-savings="money"]')));
    assert.deepEqual((await stored(page)).savings['liberty-business-residential'],{outsideBudget:3000,unitsPerTerm:12});
    assert.equal(await host.locator('.savings-recovery').count(),0);
  });
  await test('a plan with a negative net difference is labeled as extra cost with an absolute amount',async () => {
    const state = seed(); state.savings={'liberty-business-residential':{outsideBudget:100000,unitsPerTerm:15}};
    const snapshot = Savings.calculate(state,Journey.buildDraft(state,catalog,models),costs);
    assert.equal(snapshot.projected.netDifference,-32530);
    const page = await fresh('portal.html',state); await value(page,'#sheet-savings','$32,530');
    const metric = page.locator('#sheet-savings .savings-extra-cost');
    assert.match(await metric.innerText(),/Estimated extra cost/);
    assert.equal(await metric.locator('.savings-label').innerText(),'Estimated extra cost');
    assert(!/-\$|\$-/.test(await metric.innerText()));
    await page.locator('#sheet-savings .savings-details > summary').click();
    assert.match(await page.locator('#sheet-savings .savings-breakdown-total').innerText(),/Estimated extra cost\s+\$32,530/);
    await page.locator('#sheet-savings [name="savings-budget"]').fill('67470.25');
    await page.locator('#sheet-savings .savings-apply').click();
    await value(page,'#sheet-savings','$0.25');
    assert.equal(await page.locator('#sheet-savings .savings-extra-cost .savings-label').innerText(),'Estimated extra cost');
  });
  await test('320px and 390px workspaces preserve navigation and compact credit-task controls without page overflow',async () => {
    for (const width of [320,390]) {
      const page = await fresh('plan.html',seed(),{width,height:844}); await value(page,'#sheet-savings','$65,470');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      const moneyContext = page.locator('#sheet-savings .savings-money .savings-caption');
      assert(await moneyContext.isVisible(), 'Rate basis and uncertainty must remain visible on a phone');
      assert.match(await moneyContext.innerText(), /Provisional.*Standard published tuition.*before aid or benefits/);
      assert(await page.locator('#sheet-savings .savings-time .savings-caption').isVisible(), 'Outside-study and approval timing must not disappear on a phone');
      assert.match(await page.locator('#sheet-savings .savings-time').innerText(), /Not total time saved/);
      assert(await page.locator('#sheet-savings .savings-scope').isVisible(), 'The scope of the dollar figure is visible without opening details');
      assert.match(await page.locator('#sheet-savings .savings-scope').innerText(), /Outside courses budgeted; other fees excluded/);
      assert.equal(await page.locator('#sheet-savings .savings-scope a').getAttribute('href'), 'plan.html?task=cost-time');
      await page.evaluate(() => scrollTo(0,800));
      const nav = await page.locator('.dp-shell-header').boundingBox(), tracker = await page.locator('#sheet-savings').boundingBox();
      assert(nav,'The shared workspace navigation must be visible');
      assert(tracker,'The running estimate must be visible');
      assert(tracker.y >= nav.y+nav.height-2,'The running estimate must not cover navigation');
      assert(tracker.y+tracker.height < 844,'The running estimate leaves room for the worksheet');
      await page.goto(BASE+'plan.html?task=credits',{waitUntil:'networkidle'});
      await value(page,'#sheet-dialog-savings','$65,470');
      assert(await page.locator('#sheet-dialog-savings .savings-money .savings-caption').isVisible(), 'Compact estimates must retain the rate basis');
      assert(await page.locator('#sheet-dialog-savings .savings-time .savings-caption').isVisible(), 'Compact estimates must retain timing scope');
      assert.equal(await page.locator('#sheet-savings').isVisible(),false);
      assert(await page.locator('#close-sheet-dialog').isVisible());
      assert(await page.locator('#sheet-learning-form').isVisible());
      assert(await page.locator('#sheet-dialog').evaluate(node => node.scrollWidth <= node.clientWidth+1));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    }
  });
  assert.deepEqual(errors,[]); console.log('\n'+count+' savings tracker browser journeys passed.');
} finally {for (const context of contexts) await context.close(); await browser?.close();}})().catch(error => {console.error(error);process.exitCode=1;});
