/* Fresh-student journeys use the real published catalog and source-backed plans.
 * Private records are synthetic; all HTTP responses come from local build assets. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const C = require('./dist/program-catalog.js');
const J = require('./dist/journey-engine.js');
const {mountOfflineSite} = require('./test-support/offline-site.cjs');
const {completeProfileSteps} = require('./test-support/profile-steps.cjs');
const registry = require('./dist/data/curriculum-registry.json');
const catalog = C.attachRegistry(C.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), registry);
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8133/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
const ARTIFACTS = process.env.DEGREEPATH_BASELINE_ARTIFACTS || '/tmp/degreesteps-liberty-online-baselines-browser';
const cases = [
  {modelId:'curriculum-liberty-history-bs-online', outside:69, estimate:'$22,925–$24,393'},
  {modelId:'curriculum-liberty-human-services-bs-online', outside:60, estimate:'$27,098–$28,637'},
  {modelId:'curriculum-liberty-psychology-addictions-online', outside:69, estimate:'$23,061–$24,762'}
].map(item => {
  const route = catalog.pathways.find(route => route.modelId === item.modelId);
  assert(route?.readyTemplate, item.modelId + ' must be discoverable as an actual ready plan');
  return {...item, route};
});
const contexts = [], errors = [];
let browser, currentPage, checks = 0;
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const row = (page, id) => page.locator('tr.course-plan-row[data-requirement="' + id + '"]');
const creditSum = (page, selector) => page.locator(selector + ' .course-plan-credits').evaluateAll(nodes => nodes.reduce((sum, node) => sum + Number(node.textContent.trim()), 0));
async function open(width) {
  const initial = J.initialize(null, null, catalog);
  initial.learning = [{id:'private-course-interest', provider:'My previous college', code:'PRIVATE 101', title:'Keep my original course', credits:4, creditSystem:'quarter', status:'saved', evaluations:[]}];
  initial.sheet.notes = {private:'Keep my private advisor note'};
  const context = await browser.newContext({viewport:{width, height:1000}, reducedMotion:'reduce'});
  contexts.push(context);
  await mountOfflineSite(context, {origin:new URL(BASE).origin});
  await context.addInitScript(({key, initial}) => {if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));}, {key:KEY, initial});
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + 'portal.html', {waitUntil:'domcontentloaded'});
  return {page, initial};
}
async function build(page, route) {
  await page.locator('[data-answer=target]').click();
  await page.getByLabel('School name', {exact:true}).fill('Liberty University');
  await page.getByRole('button', {name:'Choose degree', exact:true}).click();
  await page.getByLabel('Search degrees', {exact:true}).fill(route.title);
  await page.locator('[data-degree-preview="' + route.id + '"]').click();
  await page.getByRole('button', {name:'Build course plan', exact:true}).click();
  await completeProfileSteps(page);
  await page.waitForURL('**/plan.html');
  await row(page, 'engl-101').waitFor();
}
async function test(name, fn) {
  if (process.env.DEGREEPATH_BASELINE_CASE && !new RegExp(process.env.DEGREEPATH_BASELINE_CASE).test(name)) return;
  try {await fn(); checks++; console.log('PASS ' + name);}
  catch (error) {
    const label = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await fs.mkdir(ARTIFACTS, {recursive:true});
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({path:path.join(ARTIFACTS, label + '-failure.png'), fullPage:false}).catch(() => {});
      await fs.writeFile(path.join(ARTIFACTS, label + '-failure.txt'), 'URL: ' + currentPage.url() + '\n\n' +
        String(error.stack || error) + '\n\nPage errors: ' + JSON.stringify(errors) + '\n\nVisible page text:\n' +
        (await currentPage.locator('body').innerText().catch(() => '')).slice(0,18000));
    }
    console.error('Failure artifacts: ' + ARTIFACTS);
    throw error;
  }
}
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage']});
  for (const config of cases) for (const width of [390,1440]) await test(config.route.title + ' builds a complete, actionable plan at ' + width + 'px', async () => {
    const {page, initial} = await open(width);
    await build(page, config.route);
    assert.equal((await saved(page)).selectedPathwayId, config.route.id);
    assert.deepEqual((await saved(page)).learning, initial.learning, 'Choosing a ready degree preserves the original course collection');
    assert.deepEqual((await saved(page)).sheet.notes, initial.sheet.notes);
    assert.equal(await creditSum(page, 'tr.course-plan-row'), 120, 'The student sees the complete degree, counted once');
    assert.equal(await creditSum(page, 'tr.course-plan-row[data-kind=transfer]'), config.outside, 'The initial plan contains its reviewed outside-course mix');
    assert.equal(await page.locator('tr.course-plan-row[data-kind=unmapped]').count(), 0);
    assert.match(await page.locator('#sheet-footer').innerText(), /Degree total: 120 credits/);
    assert.equal(await page.locator('.course-plan-unavailable,.course-plan-pending').count(), 0, 'The ready route cannot end at a research or requirements dead end');
    await page.waitForFunction(expected => document.querySelector('[data-summary-cost]')?.textContent === expected, config.estimate);
    if (width <= 700) {
      assert.equal(await page.locator('[data-glance-cost]').innerText(), config.estimate, 'The phone repeats the same published-price range');
      await page.locator('[data-phone-fold="cost"]').click();
    }
    const estimate = page.locator('#sheet-savings .plan-estimate');
    assert(await estimate.isVisible(), 'The student can open a sourced cost range rather than an unpriced-plan warning');
    assert.equal(await estimate.locator('.plan-estimate-heading strong').innerText(), config.estimate);
    assert.equal(await page.locator('.sheet-cost-confirm').count(), 0);
    await estimate.getByRole('button', {name:'See cost & timing', exact:true}).click();
    const costDialog = page.locator('#sheet-dialog[open]');
    await costDialog.locator('.plan-estimate').waitFor();
    await costDialog.getByText('Rates, pace assumptions & exclusions', {exact:true}).click();
    assert(await costDialog.locator('a[href="https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-online-program/"]').isVisible());
    assert.match(await costDialog.innerText(), /Before aid/);
    assert.match(await costDialog.innerText(), /living costs|Housing/);
    await page.locator('#close-sheet-dialog').click();
    await costDialog.waitFor({state:'hidden'});
    if (width <= 700) await page.locator('[data-phone-fold="cost"]').click();
    // The phone glance deliberately replaces the wider-screen next-action card.
    const next = width <= 700 ? page.locator('.sheet-glance-next') : page.locator('[aria-label="Your next action"]');
    await next.waitFor();
    const nextTitle = width <= 700 ? next.locator('strong') : next.locator('h2');
    assert((await nextTitle.innerText()).trim(), 'The plan gives a concrete next action');
    const nextLink = width <= 700 ? next : next.locator('a.button.primary');
    const nextURL = new URL(await nextLink.getAttribute('href'), BASE);
    assert.equal(nextURL.origin, new URL(BASE).origin);
    const tasks = page.locator('#sheet-task-panel');
    if (width <= 700) {
      const openTasks = tasks.locator(':scope > summary');
      assert(await openTasks.isVisible(), 'The phone provides a visible checklist control beside its next-step link');
      await openTasks.click();
    } else {
      assert(await next.getByRole('button', {name:'All tasks', exact:true}).isVisible());
      await next.getByRole('button', {name:'All tasks', exact:true}).click();
    }
    assert.equal(await tasks.evaluate(node => node.open), true, 'The next-action control opens the full checklist');
    await tasks.locator('.dc-checklist > summary').click();
    const planningTasks = tasks.locator('.dc-group[data-dc-open="group:planning"]');
    if (!(await planningTasks.evaluate(node => node.open))) await planningTasks.locator(':scope > summary').click();
    assert(await planningTasks.locator('.dc-task[data-status="todo"]:visible').first().isVisible(), 'The student can see an unfinished, actionable planning task');
    if (config.modelId === 'curriculum-liberty-human-services-bs-online') {
      const finishTasks = tasks.locator('.dc-group[data-dc-open="group:finish"]');
      if (!(await finishTasks.evaluate(node => node.open))) await finishTasks.locator(':scope > summary').click();
      const preparation = tasks.locator('.dc-task').filter({hasText:'HSER Internship Proposal and Preparation (noncredit prerequisite)'});
      assert(await preparation.isVisible(), 'The required zero-credit preparation step remains in the student checklist');
      assert.match(await preparation.innerText(), /zero-credit HSER 465 before HSER 497/);
      const capstone = tasks.locator('.dc-task').filter({hasText:'HSER 497 approval, standing and participation'});
      assert(await capstone.isVisible());
      assert.match(await capstone.innerText(), /preceding semester/);
      assert.match(await capstone.innerText(), /biweekly synchronous seminars and direct community service/);
    }
    await tasks.locator('summary').first().click();
    assert.equal((await row(page, 'univ-104').locator('.course-plan-credits').innerText()).trim(), '3');
    assert.match(await row(page, 'univ-104').innerText(), /Liberty|University/);
    const writing = row(page, 'engl-101');
    assert.match(await writing.innerText(), /Sophia/);
    assert.match(await writing.locator('.course-plan-provider-link').getAttribute('href'), /^https:\/\/(?:www\.)?sophia\.org\/online-courses\//);
    await writing.locator('[data-row="engl-101"]').first().click();
    const dialog = page.locator('#sheet-dialog[open]');
    await dialog.waitFor();
    assert.match(await dialog.locator('.course-info-evidence').innerText(), /School-listed match/);
    const evidence = dialog.getByRole('link', {name:/View transfer evidence/});
    assert.match(await evidence.getAttribute('href'), /^https:\/\/[^/]*liberty\.edu\//);
    await page.locator('#close-sheet-dialog').click();
    await dialog.waitFor({state:'hidden'});
    await page.locator('[data-group-mode=section]').click();
    assert(await page.locator('[data-plan-section]').count() >= 3, 'The degree retains its academic sections');
    assert.equal(await creditSum(page, 'tr.course-plan-row'), 120, 'Changing the grouping preserves degree totals');
    const progress = () => row(page, 'engl-101').locator('[data-progress="engl-101"]');
    await progress().selectOption('in-progress');
    await page.waitForFunction(() => document.querySelector('tr[data-requirement="engl-101"]')?.dataset.courseProgress === 'in-progress');
    await progress().selectOption('completed');
    await page.waitForFunction(() => document.querySelector('tr[data-requirement="engl-101"]')?.dataset.courseProgress === 'completed');
    let record = (await saved(page)).learning.find(item => item.id !== 'private-course-interest');
    assert.equal(record.status, 'earned');
    assert(record.evaluations.length && record.evaluations.every(item => item.status === 'reported'), 'Self-reported completion cannot invent school approval');
    await progress().selectOption('planned');
    await page.waitForFunction(() => document.querySelector('tr[data-requirement="engl-101"]')?.dataset.courseProgress === 'not-started');
    assert.equal(await page.locator('#sheet-dialog[open]').count(), 0, 'Correcting an accidental completion needs no school-confirmed-credit dialog');
    record = (await saved(page)).learning.find(item => item.id !== 'private-course-interest');
    assert.equal(record.status, 'planned');
    assert.equal(record.evaluations.length, 0, 'Correcting completion clears its reported placements');
    assert.deepEqual((await saved(page)).learning.find(item => item.id === 'private-course-interest'), initial.learning[0]);
    assert.deepEqual((await saved(page)).sheet.notes, initial.sheet.notes);
    await page.reload({waitUntil:'domcontentloaded'});
    await row(page, 'engl-101').waitFor();
    assert.equal(await row(page, 'engl-101').getAttribute('data-course-progress'), 'not-started', 'The correction persists when the student returns');
    assert.equal(await creditSum(page, 'tr.course-plan-row'), 120);
    assert.equal(await creditSum(page, 'tr.course-plan-row[data-kind=transfer]'), config.outside);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The degree and controls fit the viewport');
    if (process.env.DEGREEPATH_BASELINE_ARTIFACTS) {
      await fs.mkdir(ARTIFACTS, {recursive:true});
      await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({path:path.join(ARTIFACTS, config.modelId + '-' + width + '-success.png'), fullPage:false});
    }
  });
  assert.deepEqual(errors, []);
  assert(checks > 0, 'At least one actual student journey must run');
  console.log(checks + ' Liberty online baseline browser journeys passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
}})().catch(error => {console.error(error); process.exitCode = 1;});
