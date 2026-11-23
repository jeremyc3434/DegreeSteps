/* Redesign foundation: the shared header, workspace bar and row sheet at phone and desktop widths.
   Loopback preview only; no production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8141/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
const route = catalog.pathways.find(item => item.modelId === 'liberty-business-residential');
const seeded = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
const PAGES = [['home',''],['plan page','degree-plans/liberty-psychology-bs-online/'],['degree finder','programs.html'],['my plan','plan.html'],['community','community.html?tab=feed'],['account','account.html']];
const FIVE = ['Degrees','Transfer courses','Community','My plan',/^(Sign in|My account)$/];
// Optional services that are off in the preview answer 404; the page handles that by rendering nothing.
const optionalService = text => /Failed to load resource: the server responded with a status of 404/.test(text);
let browser, count = 0;
const contexts = [], problems = [];
async function test(name, fn) {await fn(); count++; console.log('PASS ' + name);}
async function open(path, viewport, plan = true) {
  const context = await browser.newContext({viewport});contexts.push(context);
  if (plan) await context.addInitScript(({key, value}) => {if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));}, {key:KEY, value:seeded});
  const page = await context.newPage();
  page.on('pageerror', error => problems.push(path + ' ' + viewport.width + ': ' + error.message));
  page.on('console', message => {if (message.type() === 'error' && !optionalService(message.text())) problems.push(path + ' ' + viewport.width + ' console: ' + message.text());});
  const response = await page.goto(BASE + path, {waitUntil:'networkidle'});
  assert.equal(response.status(), 200, path);
  await page.locator('[data-ds-header]').first().waitFor({state:'attached'});
  return page;
}
const noOverflow = async (page, label) => {
  const size = await page.evaluate(() => ({view:innerWidth, doc:document.documentElement.scrollWidth, body:document.body.scrollWidth}));
  assert(size.doc <= size.view + 1 && size.body <= size.view + 1, label + ' overflows: ' + JSON.stringify(size));
};
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  await test('every page shows the one header, fits 320, 390 and 1440 px, and opens its phone menu by keyboard', async () => {
    for (const [label, path] of PAGES) for (const width of [320, 390, 1440]) {
      const page = await open(path, {width, height:844});
      const header = page.locator('[data-ds-header]').first(), toggle = header.locator('.ds-header-toggle');
      await noOverflow(page, label + ' at ' + width);
      if (width >= 1101) {
        assert.equal(await toggle.isVisible(), false, label + ': wide screens show the links directly');
      } else {
        assert.equal(await toggle.isVisible(), true, label + ': phones get a menu button');
        assert.equal(await header.locator('.ds-header-nav').isVisible(), false);
        await toggle.focus(); await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await noOverflow(page, label + ' menu at ' + width);
      }
      for (const name of FIVE) assert(await header.getByRole('link', {name, exact: typeof name === 'string'}).first().isVisible(), label + ' at ' + width + ': ' + name);
      if (width < 1101) {
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false', label + ': Escape closes the menu');
        assert(await toggle.evaluate(node => node === document.activeElement), label + ': focus returns to the menu button');
      }
      await page.context().close();
    }
  });
  await test('My plan opens the plan when one exists and plan setup when none does', async () => {
    const withPlan = await open('', {width:1440, height:900});
    assert.equal(await withPlan.locator('[data-ds-header] [data-header-destination="plan"]').getAttribute('href'), '/plan.html');
    const without = await open('', {width:1440, height:900}, false);
    assert.equal(await without.locator('[data-ds-header] [data-header-destination="plan"]').getAttribute('href'), '/start.html');
  });
  await test('the workspace keeps My courses, preferences, resources and account status one tap away', async () => {
    const desktop = await open('plan.html', {width:1440, height:900});
    for (const name of ['My courses','My preferences','Schools & resources']) assert(await desktop.locator('.dp-shell-subnav').getByRole('link', {name}).isVisible(), name);
    assert(await desktop.locator('[data-shell-account-label]').isVisible());
    assert.equal(await desktop.locator('.dp-shell-sidebar, .dp-shell-bottom').count(), 0);
    const phone = await open('plan.html', {width:390, height:844});
    assert.equal(await phone.locator('.dp-shell-subnav').isVisible(), false);
    await phone.locator('.ds-header-toggle').click();
    await phone.locator('.dp-shell-subnav').getByRole('link', {name:'My courses'}).click();
    await phone.waitForURL(url => url.pathname.endsWith('/courses.html'));
  });
  await test('the row sheet traps focus, closes with Escape and returns focus, as a bottom sheet and a side panel', async () => {
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const page = await open('ui-demo.html', {width, height}, false);
      const opener = page.locator('[data-demo-sheet]');
      await opener.click();
      const dialog = page.getByRole('dialog', {name:'Speech Communication'});
      await dialog.waitFor();
      assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'focus moves into the sheet');
      for (let i = 0; i < 8; i++) {await page.keyboard.press('Tab'); assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Tab stays inside the sheet');}
      await page.keyboard.press('Shift+Tab');
      assert(await dialog.evaluate(node => node.contains(document.activeElement)));
      await page.waitForTimeout(400); // let the slide-in animation finish
      const box = await dialog.boundingBox();
      if (width <= 640) assert(Math.abs(box.y + box.height - height) <= 2 && box.width >= width - 1, 'phones get a bottom sheet');
      else assert(Math.abs(box.x + box.width - width) <= 2 && box.width <= 441, 'wider screens get a side panel');
      await noOverflow(page, 'sheet at ' + width);
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert(await opener.evaluate(node => node === document.activeElement), 'focus returns to the opener');
      await opener.click(); await page.getByRole('button', {name:'Close'}).click();
      assert.equal(await page.getByRole('dialog').count(), 0);
    }
  });
  assert.deepEqual(problems, [], 'no page or console errors');
  console.log(count + ' redesign foundation browser journeys passed.');
} catch (error) {console.error(error); if (problems.length) console.error(problems.join('\n')); process.exitCode = 1;}
finally {await Promise.allSettled(contexts.map(context => context.close())); await browser?.close();}})();
