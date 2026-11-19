const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const BASE = process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8099/';
const BUILDER = new URL('guided.html', BASE).href;
const KEY = 'degreepath-guide-v3';
const catalog = JSON.parse(fs.readFileSync(__dirname + '/dist/data/pathways.json'));
const tesu = catalog.pathways.find(pathway => pathway.modelId === 'tesu-general-management');
const liberty = catalog.pathways.find(pathway => pathway.modelId === 'liberty-business-residential');
const tesuModel = JSON.parse(fs.readFileSync(__dirname + '/dist/data/tesu.json'));
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function next(page) { const heading = await page.locator('.step-title').textContent(); await page.locator('#next-step').click(); await page.waitForFunction(previous => document.querySelector('#results-view') && !document.querySelector('#results-view').hidden || document.querySelector('.step-title')?.textContent !== previous, heading); }
async function seed(page, profile, extras = {}) {
  await page.goto(BUILDER, { waitUntil: 'networkidle' });
  await page.evaluate(({ key, profile, extras }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify({ version: 3, profile, learning: [], step: 'direction', view: 'wizard', scenarios: {}, selectedPathwayId: '', resultTab: 'plan', baseline: null, ...extras })); }, { key: KEY, profile, extras });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#wizard-view').hidden || !document.querySelector('#results-view').hidden);
}
const target = pathway => ({ entry: 'audit', goal: 'any-degree', degreeLevel: pathway.level, field: pathway.field, schoolChoice: pathway.school, school: pathway.school, degree: pathway.title, pathwayId: pathway.id, modality: pathway.modalities[0], priority: 'transfer', militaryStatus: 'none' });

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const failures = [];
  browser.on('disconnected', () => {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  const requests = []; page.on('request', request => requests.push(request.url()));

  await test('beginner military wizard preserves provisional credit and reaches a complete proposed playbook', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BUILDER, { waitUntil: 'networkidle' });
    await page.locator('[data-set="entry"][data-value="explore"]').click(); await next(page);
    assert.match(await page.locator('.step-title').textContent(), /make possible/);
    await next(page);
    await page.locator('[data-set="modality"][data-value="online"]').click(); await next(page);
    await page.locator('[data-field="hasPrior"]').selectOption('some');
    await page.locator('[data-field="priorCreditEstimate"]').fill('45');
    await page.locator('[data-field="militaryStatus"]').selectOption('active'); await next(page);
    assert.match(await page.locator('.step-title').textContent(), /military/);
    await page.locator('[data-field="militaryBranch"]').selectOption('air-force'); await next(page);
    await page.locator('[data-set="priority"][data-value="speed"]').click();
    await page.locator('[data-field="weeklyHours"]').fill('20'); await next(page); await next(page);
    await page.locator('#result-header').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.route-card').count(), 3);
    assert.equal(await page.locator('.alternative-route').first().isVisible(), false);
    await page.locator('#toggle-alternatives').click(); assert.equal(await page.locator('.alternative-route').first().isVisible(), true);
    await page.locator('#toggle-alternatives').click();
    assert.equal(await page.locator('.next-actions-section .action-item').count(), 3);
    assert.match(await page.locator('.next-actions-section').textContent(), /CCAF/);
    assert.match(await page.locator('#result-details').textContent(), /45.credit estimate/);
    assert.equal((await stored(page)).learning.length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: __dirname + '/wizard-results-mobile.png' });
  });

  await test('exact target retains its editable direction step and validates CSV status before import', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seed(page, target(tesu));
    assert.match(await page.locator('.step-title').textContent(), /build around/);
    await next(page);
    await page.locator('[data-action="add-learning"]').click();
    await page.locator('[data-learning-mode="csv"]').click();
    await page.locator('#learning-csv').fill('provider,code,title,credits,status\nSophia,English Composition I,English Composition I,3,earnd');
    await page.locator('[data-action="preview-import"]').click();
    assert.match(await page.locator('#import-error').textContent(), /earned, in-progress, or planned/);
    assert.equal((await stored(page)).learning.length, 0);
    await page.locator('#learning-csv').fill('provider,code,title,credits,status\nSophia,English Composition I,English Composition I,3,in progress');
    await page.locator('[data-action="preview-import"]').click();
    await page.locator('[data-action="confirm-import"]').click();
    assert.equal((await stored(page)).learning[0].status, 'in-progress');
    await page.locator('[data-action="add-learning"]').click(); await page.locator('[data-learning-mode="csv"]').click();
    await page.locator('#learning-csv').fill('provider,code,title,credits,status\nSophia,English Composition I,English Composition I,3,earned');
    await page.locator('[data-action="preview-import"]').click();
    assert.match(await page.locator('#import-preview').textContent(), /Update existing record/);
    await page.locator('[data-action="confirm-import"]').click();
    const saved = await stored(page); assert.equal(saved.learning.length, 1); assert.equal(saved.learning[0].status, 'earned'); assert.deepEqual(saved.learning[0].evaluations, []);
    await next(page); await next(page); await next(page);
    await page.locator('[data-tab="audit"]').click();
    assert.match(await page.locator('.audit-table tfoot').textContent(), /pending evaluation: 3/);
  });

  await test('school confirmations clear on identity edits and the target model does not go stale', async () => {
    await page.locator('[data-action="add-learning"]').first().click(); await page.locator('#close-learning').click();
    await page.locator('[data-action="edit-profile"]').click(); await next(page);
    await page.locator('[data-edit-learning]').first().click();
    const form = page.locator('#learning-form');
    await form.locator('details summary').click();
    await form.locator('[name="schoolConfirmed"]').check(); await form.locator('[name="requirementId"]').selectOption('enc1010');
    await form.locator('[type="submit"]').click();
    assert.equal((await stored(page)).learning[0].evaluations[0].status, 'confirmed');
    await page.locator('[data-edit-learning]').first().click();
    await page.locator('#learning-form [name="code"]').fill('DIFFERENT-CODE');
    assert.equal(await page.locator('#learning-form [name="schoolConfirmed"]').isChecked(), false);
    await page.locator('#learning-form [type="submit"]').click();
    assert.deepEqual((await stored(page)).learning[0].evaluations, []);
    await page.locator('#back-step').click();
    await page.locator('[data-field="schoolChoice"]').selectOption(liberty.school);
    await page.locator('[data-field="pathwayId"]').selectOption(liberty.id);
    await page.locator('[data-set="modality"][data-value="campus"]').click();
    await next(page);
    await page.locator('[data-edit-learning]').first().click();
    assert.match(await page.locator('#learning-form').textContent(), /Liberty University has confirmed/);
    assert.doesNotMatch(await page.locator('#learning-form').textContent(), /Thomas Edison State University has confirmed/);
    await page.locator('#close-learning').click();
  });

  await test('per-course what-if choices persist, invalid selections block action, and reset recovers', async () => {
    await seed(page, target(tesu), { view: 'results', selectedPathwayId: tesu.id });
    await page.locator('[data-tab="audit"]').click();
    const conditional = tesuModel.requirements.find(req => req.id === 'enc1010').options.find(option => option.provider === 'Sophia' && option.evidence === 'conditional');
    await page.locator('[data-selection="enc1010"]').selectOption(conditional.id);
    assert.equal(await page.locator('[data-selection="enc1010"]').inputValue(), conditional.id);
    await page.locator('[data-tab="what-if"]').click();
    await page.locator('[data-setting="allowConditional"]').uncheck();
    assert.match(await page.locator('#result-panel').textContent(), /selected|selection|eligible|conflict/i);
    await page.locator('[data-tab="plan"]').click();
    assert.match(await page.locator('.next-actions-section').textContent(), /Resolve the conflicts/);
    assert.doesNotMatch(await page.locator('.next-actions-section').textContent(), /Begin your .* course block/);
    await page.locator('[data-tab="what-if"]').click(); await page.locator('[data-action="reset-selections"]').click();
    assert.deepEqual((await stored(page)).scenarios['tesu-general-management'].optionSelections, {});
    await page.locator('[data-setting="allowConditional"]').check();
    await page.locator('[data-tab="plan"]').click();
    await page.locator('[data-complete-row]').first().click();
    await page.locator('#close-learning').click();
    assert.equal((await stored(page)).learning.length, 0, 'canceling completion must not create a record');
    await page.locator('[data-tab="audit"]').click();
    assert.match(await page.locator('.audit-status').textContent(), /checks passed/);
    await page.locator('[data-tab="plan"]').click();
    await page.locator('#result-header').scrollIntoViewIfNeeded();
    await page.screenshot({ path: __dirname + '/wizard-results-desktop.png' });
  });

  await test('career and campus goals avoid unrelated degree substitutions', async () => {
    await seed(page, { entry: 'explore', goal: 'teacher', degreeLevel: 'bachelor', field: 'education', modality: 'campus', classroomImportance: 'essential', priority: 'cost' }, { view: 'results' });
    assert.match(await page.locator('#recommendation-grid').textContent(), /teacher|teaching|classroom/i);
    assert.doesNotMatch(await page.locator('#recommendation-grid').textContent(), /General Management|Management minor/);
    assert.match(await page.locator('#result-details').textContent(), /jurisdiction|licens/);
    await seed(page, { ...target(liberty), modality: 'online' }, { view: 'results' });
    assert.match(await page.locator('#result-header').textContent(), /keep your goal intact/);
    assert.equal(await page.locator('.route-card').count(), 0);
  });

  await test('mobile results, keyboard tabs, query entry, legacy audit and download are usable', async () => {
    await seed(page, target(tesu), { view: 'results', selectedPathwayId: tesu.id });
    await page.locator('[data-tab="plan"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-tab="audit"]').getAttribute('aria-selected'), 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('[data-tab="sources"]').click();
    assert.equal(await page.locator('[id="data-notes"]').count(), 1);
    const download = page.waitForEvent('download'); await page.locator('[data-action="download-plan"]').click();
    assert.match((await download).suggestedFilename(), /^degreepath-.*\.txt$/);
    await page.evaluate(() => localStorage.clear()); await page.goto(BUILDER + '?entry=explore', { waitUntil: 'networkidle' });
    assert.match(await page.locator('.step-title').textContent(), /make possible/);
    assert(requests.every(address => address.startsWith(BASE) || address.startsWith('data:')), 'The new wizard should use only local preloaded assets');
    const response = await page.goto(BASE + 'audit.html', { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
    await page.waitForURL('**/portal.html');
    assert.equal(await page.locator('#generate').count(), 0, 'The superseded partial audit no longer creates a second planning workflow.');
  });

  await test('military family and graduate flows use their own learning and career stages', async () => {
    await seed(page, { entry: 'explore', goal: 'career-growth', degreeLevel: 'master', field: 'any', modality: 'online', militaryStatus: 'dependent', priority: 'cost' }, { step: 'military' });
    assert.match(await page.locator('.step-title').textContent(), /opportunities available to you/);
    assert.equal(await page.locator('[data-field="militaryOccupation"]').count(), 0);
    assert.equal(await page.locator('[data-field="militaryRecords"]').count(), 0);
    await next(page); await next(page); await next(page);
    assert.doesNotMatch(await page.locator('.next-actions-section').textContent(), /Gather your service learning record/);
    assert.match(await page.locator('.next-actions-section').textContent(), /your own education.benefit/);
    assert.doesNotMatch(await page.locator('#recommendation-grid').textContent(), /B\.S\.|BLS with/);
    assert.match(await page.locator('#result-details').textContent(), /graduate|master/i);
  });

  await test('budget, deadline, and assessment preferences remain visible targets rather than promises', async () => {
    await seed(page, { ...target(tesu), budget: 100, deadline: '2027-06-01', assessmentPreference: 'projects', weeklyHours: 5 }, { view: 'results', selectedPathwayId: tesu.id });
    const details = await page.locator('#result-details').textContent();
    assert.match(details, /budget target: \$100/);
    assert.match(details, /already exceed this target/);
    assert.match(details, /target date: Jun 1, 2027/);
    assert.match(details, /project/i);
    await page.locator('[data-action="edit-profile"]').click();
    const schools = await page.locator('[data-field="schoolChoice"] option').allTextContents();
    assert(schools.every(school => !school.startsWith('Choose a state-approved') && !school.startsWith('Choose an academic program')));
  });
  assert.deepEqual(failures, [], 'No uncaught browser exceptions');
  await browser.close();
  console.log('\n' + count + ' browser journeys passed.');
})().catch(error => { console.error(error); process.exit(1); });
