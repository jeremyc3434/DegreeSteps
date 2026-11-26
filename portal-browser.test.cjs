/* Public portal acceptance journeys against the loopback preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const Catalog = require('./dist/program-catalog.js');
const catalog = Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), require('./dist/data/curriculum-registry.json'));
const models = Catalog.modelFiles.map(file => require('./dist/' + file));
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8131/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
let browser, count = 0;
const errors = [], contexts = [];
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
async function test(name, fn) {await fn(); count++; console.log('PASS ' + name);}
async function fresh(viewport = {width:1440, height:1000}, saved, suffix = '') {
  const context = await browser.newContext({viewport}); contexts.push(context);
  if (saved) await context.addInitScript(({key, saved}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
  }, {key:KEY, saved});
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + (suffix || 'portal.html'), {waitUntil:'networkidle'});
  await page.locator('#portal-content:visible, #sheet-workspace:visible').first().waitFor({state:'visible'});
  return page;
}
// The guided planner: a start choice, then either an exact school and degree or a
// short profile (goal, starting point, study fit, priorities) and ranked plans.
const profileForm = page => page.locator('#portal-profile-form');
async function onStep(page, id) {await page.locator('#portal-profile-form[data-profile-step="' + id + '"]').waitFor();}
// Answers each profile step with the given values (defaults otherwise) until the planner leaves the questions.
async function answerProfile(page, values = {}) {
  for (let guard = 0; guard < 6; guard++) {
    await page.waitForFunction(() => !/\/portal\.html/.test(location.pathname) || document.querySelector('#portal-profile-form') || document.querySelector('[data-degree-preview],.portal-readiness-card,.portal-empty'), null, {timeout:15000}).catch(() => {});
    if (!/\/portal\.html/.test(page.url()) || !(await profileForm(page).count())) return;
    const form = profileForm(page), step = await form.getAttribute('data-profile-step');
    for (const [name, value] of Object.entries(values)) {
      const field = form.locator('[name="' + name + '"]');
      if (await field.count() && await field.isVisible()) await field.selectOption(String(value));
    }
    await form.locator('button[type=submit]').click();
    await page.waitForFunction(previous => document.querySelector('#portal-profile-form')?.dataset.profileStep !== previous, step).catch(() => {});
  }
}
async function chooseSchool(page, school) {
  await page.locator('[data-answer=target]').click();
  await page.getByLabel('School name', {exact:true}).fill(school);
  await page.getByRole('button', {name:'Choose degree', exact:true}).click();
  await page.locator('#portal-degree-count').waitFor();
}
async function buildExact(page, school, routeId, profile = {}) {
  const route = catalog.pathways.find(path => path.id === routeId);
  await chooseSchool(page, school);
  await page.getByLabel('Search degrees', {exact:true}).fill(route.title);
  await page.locator('[data-degree-preview="' + routeId + '"]').click();
  await page.getByRole('button', {name:'Build course plan', exact:true}).click();
  await answerProfile(page, profile);
  await page.waitForURL('**/plan.html'); await page.locator('tr.course-plan-row').first().waitFor();
}
async function explore(page, profile = {}) {
  // Help me choose: the quiz comes first; these are the deeper questions that continue from it (no quiz answers here).
  await page.goto(BASE + 'portal.html?view=preferences&from=quiz');
  await onStep(page, 'purpose');
  await answerProfile(page, profile);
}
const recommended = page => page.locator('#portal-content [data-degree-preview]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.degreePreview))]);
async function buildRecommended(page, routeId) {
  await page.locator('[data-degree-preview="' + routeId + '"]').first().click();
  await page.getByRole('button', {name:'Build course plan', exact:true}).click();
  await page.waitForURL('**/plan.html'); await page.locator('tr.course-plan-row').first().waitFor();
}
function savedTarget(pathId, overrides = {}) {
  const route = catalog.pathways.find(path => path.id === pathId);
  let state = Sheet.selectPathway(Sheet.initialize(null, null, catalog), route);
  state = Journey.initialize(state, null, catalog);
  state.profile = {...state.profile, hasPrior:'some', ...overrides};
  return state;
}
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  await test('a fresh visitor sees one clear question without a preselected degree or sample spreadsheet', async () => {
    const page = await fresh();
    assert.equal((await page.locator('#portal-question-title').innerText()).trim(), 'Build your course plan.');
    assert.equal(await page.locator('.portal-choice').count(), 3);
    assert(await page.getByRole('button', {name:/^Help me choose/}).isVisible());
    assert(await page.getByRole('button', {name:/^Find a degree/}).isVisible());
    assert(await page.getByRole('button', {name:/^Use my courses/}).isVisible());
    await page.locator('.portal-more-starts>summary').click();
    assert(await page.getByRole('link', {name:'Browse transfer courses', exact:true}).isVisible());
    assert.equal(await page.locator('#sheet-grid').count(), 0);
    assert(!/Thomas Edison|120-credit example|\$\d[\d,]+/.test(await page.locator('#portal-content').innerText()));
    const state = await stored(page); assert.equal(state.selectedPathwayId, ''); assert.equal(state.learning.length, 0);
    assert.equal(state.journey.completed, false);
  });
  await test('an explorer completes short questions and lands in a course plan with one personal next step', async () => {
    const page = await fresh();
    await explore(page, {degreeLevel:'bachelor', format:'online', priority:'speed'});
    await page.locator('[data-degree-preview="tesu-general-management"]').first().waitFor();
    assert.equal((await stored(page)).selectedPathwayId, '', 'Recommendations do not choose a degree');
    await buildRecommended(page, 'tesu-general-management');
    const state = await stored(page); assert.equal(state.journey.completed, true);
    assert.equal(state.selectedPathwayId, 'tesu-general-management'); assert.equal(state.profile.priority, 'speed');
    assert.equal(state.learning.length, 0); assert.notEqual(state.journey.planReviewed, true);
    assert.equal(await page.locator('.plan-next-action').count(), 1);
    assert(await page.locator('.plan-next-action a.button').isVisible());
  });
  await test('a known school can guide an undecided degree choice without losing that school', async () => {
    const page = await fresh();
    await chooseSchool(page, 'Liberty University');
    assert(await page.getByRole('button', {name:'Help me choose a degree here', exact:true}).isVisible());
    await page.getByRole('button', {name:'Help me choose a degree here', exact:true}).click();
    await onStep(page, 'purpose');
    await answerProfile(page, {field:'business', degreeLevel:'bachelor', format:'campus'});
    await page.locator('#portal-content [data-degree-preview]').first().waitFor();
    const state = await stored(page), ids = await recommended(page);
    assert.equal(state.profile.school, 'Liberty University'); assert.equal(state.profile.degree, ''); assert.equal(state.selectedPathwayId, '');
    assert(ids.length > 0);
    for (const id of ids) assert.equal(catalog.pathways.find(route => route.id === id)?.school, 'Liberty University', id + ' is at the chosen school');
    assert(!/Thomas Edison State University/.test(await page.locator('#portal-content').innerText()));
    await buildRecommended(page, ids.includes('liberty-business-residential') ? 'liberty-business-residential' : ids[0]);
    assert.equal((await stored(page)).profile.school, 'Liberty University');
  });
  await test('a technology interest filters out unrelated business recommendations', async () => {
    const page = await fresh();
    await explore(page, {field:'technology', degreeLevel:'bachelor'});
    await page.locator('#portal-content [data-degree-preview], #portal-content .portal-empty, #portal-content').first().waitFor();
    await page.waitForFunction(() => !/Comparing your course plans/.test(document.querySelector('#portal-content').innerText));
    const state = await stored(page); assert.equal(state.profile.field, 'technology');
    const ids = await recommended(page);
    // Subjects follow the plan finder's index, where a business-and-data degree also counts as technology.
    const subjects = require('./dist/data/plan-library-index.json').plans;
    assert(ids.length > 0);
    for (const id of ids) {const route = catalog.pathways.find(item => item.id === id); assert((subjects[id]?.subjects || route.fields || [route.field]).includes('technology'), id + ' is a technology degree');}
    assert(!/General Management/.test(await page.locator('#portal-content').innerText()));
  });
  await test('a known residential degree and veteran service records stay attached to the exact school', async () => {
    const page = await fresh();
    await buildExact(page, 'Liberty University', 'liberty-business-residential', {prior:'some', military:'veteran', militaryRecords:'jst'});
    const state = await stored(page);
    assert.equal(state.selectedPathwayId, 'liberty-business-residential'); assert.equal(state.profile.school, 'Liberty University');
    assert.equal(state.profile.modality, 'campus'); assert.equal(state.profile.militaryStatus, 'veteran');
    assert.equal(state.profile.militaryRecords, 'jst'); assert.equal(state.learning.length, 0);
    const next = page.locator('.plan-next-action');
    assert.match(await next.innerText(), /service education record/);
    assert.match(await next.locator('a.button').getAttribute('href'), /^portal\.html\?view=school/);
    assert(!/school approved|credits awarded/i.test(await page.locator('#sheet-workspace').innerText()));
  });
  await test('a licensed career receives relevant routes rather than a generic accelerated business degree', async () => {
    const page = await fresh();
    await explore(page, {goal:'teacher', degreeLevel:'bachelor', format:'campus'});
    await page.waitForFunction(() => /Choose a course plan|No course plan matches/.test(document.querySelector('#portal-content').innerText) && !/Comparing your course plans/.test(document.querySelector('#portal-content').innerText));
    const state = await stored(page), ids = await recommended(page);
    assert.equal(state.profile.goal, 'teacher');
    for (const id of ids) assert((catalog.pathways.find(route => route.id === id).goals || []).includes('teacher'), id + ' prepares teachers');
    const visible = await page.locator('#portal-content').innerText();
    assert(!visible.includes('General Management')); assert(!/Interdisciplinary Business/.test(visible));
    assert.equal(state.learning.length, 0);
  });
  await test('an unsupported exact school and degree become a private requirement outline rather than a plan', async () => {
    const page = await fresh();
    await chooseSchool(page, 'My Regional University');
    assert.match(await page.locator('#portal-degree-count').innerText(), /0 degrees/);
    await page.getByText('Build my own degree plan', {exact:true}).click();
    await page.locator('#portal-custom-degree-form [name=unlistedDegree]').fill('B.S. Advanced Materials Science');
    await page.locator('#portal-custom-degree-form button[type=submit]').click();
    await page.waitForURL(url => url.pathname.endsWith('/degree-audit.html'));
    const target = new URL(page.url());
    assert.equal(target.searchParams.get('school'), 'My Regional University'); assert.equal(target.searchParams.get('degree'), 'B.S. Advanced Materials Science');
    assert.equal((await stored(page)).selectedPathwayId, '', 'No plan is invented for an unlisted degree');
    assert.equal((await stored(page)).learning.length, 0);
  });
  await test('back and reload keep the student’s current question and exact choices', async () => {
    const page = await fresh();
    await chooseSchool(page, 'Liberty University');
    await page.getByLabel('Search degrees', {exact:true}).fill('Interdisciplinary');
    await page.locator('[data-degree-preview="liberty-business-residential"]').click();
    await page.getByRole('button', {name:'Build course plan', exact:true}).click();
    await onStep(page, 'prior');
    await profileForm(page).locator('[name=military]').selectOption('veteran');
    await page.reload({waitUntil:'networkidle'}); await onStep(page, 'prior');
    assert.equal(await profileForm(page).locator('[name=military]').inputValue(), 'veteran', 'An unsent answer survives reload');
    await profileForm(page).locator('button[type=submit]').click(); await onStep(page, 'format');
    await page.locator('.portal-back').click(); await onStep(page, 'prior');
    assert.equal(await profileForm(page).locator('[name=military]').inputValue(), 'veteran');
    assert.match(await profileForm(page).innerText(), /Interdisciplinary Business/);
  });
  await test('adding a finished course opens one task and returns to My courses without inventing approval', async () => {
    const page = await fresh(undefined, savedTarget('tesu-general-management'));
    await page.locator('tr.course-plan-row').first().waitFor();
    await page.getByRole('link', {name:'Add my courses', exact:true}).first().click();
    await page.waitForURL('**/import-courses.html?from=plan');
    await page.getByRole('link', {name:'Enter it manually', exact:true}).click();
    await page.locator('#sheet-dialog[open] #sheet-learning-form').waitFor(); assert.match(page.url(), /plan\.html\?task=credits/);
    for (const [name, value] of Object.entries({provider:'Community college', code:'MAT100', title:'College Algebra', credits:'3'})) await page.locator('#sheet-learning-form [name="' + name + '"]').fill(value);
    await page.locator('#sheet-learning-form button[type="submit"]').click();
    await page.locator('#close-sheet-dialog').click();
    await page.waitForURL(url => url.pathname.endsWith('/courses.html'));
    const state = await stored(page); assert.equal(state.learning.length, 1); assert.equal(state.learning[0].code, 'MAT100');
    assert(state.learning[0].evaluations.every(placement => placement.status !== 'confirmed'));
    assert.notEqual(state.journey.schoolContacted, true);
  });
  await test('reviewing a plan and contacting the school never means school approval', async () => {
    const page = await fresh(undefined, savedTarget('tesu-general-management'));
    await page.goto(BASE+'portal.html?view=review',{waitUntil:'networkidle'});
    await page.locator('[data-action="finish-plan-review"]').waitFor();
    await page.locator('[data-action="finish-plan-review"]').click();
    await page.waitForURL(url => url.pathname.endsWith('/plan.html'));
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    let state = await stored(page); assert.equal(state.journey.planReviewed, true); assert(state.journey.reviewedSignature);
    await page.goto(BASE+'portal.html?view=school',{waitUntil:'networkidle'});
    await page.locator('[data-action="school-contacted"]').click();
    await page.waitForURL(url => url.pathname.endsWith('/plan.html'));
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    state = await stored(page); assert.equal(state.journey.schoolContacted, true);
    const draft = Journey.buildDraft(state,catalog,models);
    assert(!/school approved|transfer approved|degree approved/i.test(await page.locator('#sheet-workspace').innerText()));
    assert.equal(draft.plan.totals.confirmed, 0);
  });
  await test('community templates preserve the student’s private learning while changing only the proposed route', async () => {
    const saved = savedTarget('tesu-general-management');
    saved.learning = [{id:'private-course', provider:'My College', code:'PRIVATE101', title:'Private completed course', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
    saved.sheet.notes = {'tesu-general-management':{enc1010:'PRIVATE STUDENT NOTE'}};
    const page = await fresh(undefined, saved, 'portal.html?template=seed-liberty-campus-business');
    await onStep(page, 'prior');
    assert(!/PRIVATE101|PRIVATE STUDENT NOTE/.test(await page.locator('#portal-content').innerText()));
    await answerProfile(page);
    await page.waitForURL('**/plan.html'); await page.locator('tr.course-plan-row').first().waitFor();
    const state = await stored(page); assert.equal(state.selectedPathwayId, 'liberty-business-residential');
    assert.deepEqual(state.learning, saved.learning); assert.deepEqual(state.sheet.notes, saved.sheet.notes);
    assert.equal(state.learning[0].evaluations.length, 0);
  });
  await test('the guided question and the course plan remain within a 320px screen', async () => {
    const page = await fresh({width:320, height:740});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const box of await page.locator('.portal-choice').all()) assert((await box.boundingBox()).height >= 44);
    await explore(page, {degreeLevel:'bachelor', format:'online'});
    const top = page.locator('#portal-content [data-degree-preview]:visible').first();await top.waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await buildRecommended(page, await top.getAttribute('data-degree-preview'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.locator('.plan-next-action').count(), 1);
  });
  await test('bringing past courses opens the upload page before asking for a school', async () => {
    const page = await fresh();
    await page.locator('[data-answer=audit]').click();
    await page.waitForURL(url => url.pathname.endsWith('/import-courses.html'));
    const state = await stored(page);
    assert.equal(state.selectedPathwayId, '');
    assert(await page.locator('#import-files').count());
    assert(await page.getByRole('link', {name:'Enter it manually', exact:true}).isVisible());
  });
  await test('search terms filter degrees, exact selection shows readiness before setup', async () => {
    const page = await fresh();
    await chooseSchool(page, 'Liberty University');
    await page.getByLabel('Search degrees', {exact:true}).fill('psychology');
    await page.locator('#portal-degree-results .portal-degree-option').first().waitFor();
    let state = await stored(page);
    assert.equal(state.journey.step, 'degree'); assert.notEqual(state.selectedPathwayId, 'custom-target');
    for (const text of await page.locator('#portal-degree-results .portal-degree-option').allInnerTexts()) assert.match(text, /psycholog/i);
    await page.getByRole('button', {name:/^Psychology Major \(B\.S\.\)/}).click();
    await page.getByRole('button', {name:'Online', exact:true}).click();
    await page.locator('.portal-readiness-card').filter({hasText:'Build course plan'}).waitFor();
    assert(await page.getByRole('link', {name:/Official degree information/}).isVisible());
    state = await stored(page); assert.equal(state.selectedPathwayId, ''); assert.equal(state.journey.step, 'degree');
  });
  await test('changing an existing target offers the degree chooser and keeps courses', async () => {
    const saved = savedTarget('tesu-general-management');
    saved.learning = [{id:'keep-record', provider:'My college', code:'ABC101', title:'Keep this course', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
    const page = await fresh(undefined, saved, 'portal.html?view=edit');
    assert(await page.getByText('Open my plan', {exact:true}).isVisible());
    await page.getByRole('button', {name:/^Change my degree/}).click();
    await page.getByLabel('School name', {exact:true}).waitFor();
    assert.equal((await stored(page)).selectedPathwayId, 'tesu-general-management');
    assert.equal((await stored(page)).learning[0].id, 'keep-record');
  });
  assert.deepEqual(errors, []); console.log('\n' + count + ' personal portal browser journeys passed.');
} finally {for (const context of contexts) await context.close(); await browser?.close();}})().catch(error => {console.error(error); process.exitCode = 1;});
