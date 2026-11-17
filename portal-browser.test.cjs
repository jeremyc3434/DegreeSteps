/* Public portal acceptance journeys against the loopback preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const catalog = require('./dist/data/pathways.json');
const models = ['tesu', 'liberty'].map(name => require('./dist/data/' + name + '.json'));
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8131/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3';
const knownRoutes = new Set(catalog.pathways.map(path => path.id));
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
async function answer(page, id, value) {
  const before = await stored(page);
  assert.equal(before.journey.step, id, 'The student must see the expected question before answering it');
  const exactChoice = page.locator('[data-answer="' + String(value).replace(/"/g, '\\"') + '"]');
  if (await exactChoice.count()) await exactChoice.first().click();
  else if(id === 'degree') {
    const route=catalog.pathways.find(r=>r.id===value||r.title===value);
    if(route){
      await page.locator('#portal-question-form [name="degree"]').fill(route.title);
      await page.locator('[data-degree-preview="'+route.id+'"]').click();
    } else {
      await page.getByText('My degree is not listed',{exact:true}).click();
      await page.getByLabel('Exact degree name',{exact:true}).fill(value);
      await page.locator('#portal-custom-degree-form button[type="submit"]').click();
    }
    await page.locator('[data-action="use-degree"]').click();
  }
  else if (id === 'routes') {
    const candidates = await page.locator('[data-answer], [data-route]').evaluateAll(nodes => nodes.map(node => ({answer:node.dataset.answer, route:node.dataset.route})).filter(value => value.answer || value.route));
    const selected = candidates.find(candidate => candidate.answer === value || candidate.route === value)
      || candidates.find(candidate => knownRoutes.has(candidate.answer || candidate.route));
    assert(selected, 'At least one compatible recommendation should be selectable');
    await page.locator(selected.route ? '[data-route="' + selected.route + '"]' : '[data-answer="' + selected.answer + '"]').first().click();
  } else if (id === 'school' || id === 'degree') {
    const field = page.locator('#portal-question-form [name="' + id + '"]');
    assert(await field.count(), 'The exact ' + id + ' must have a plainly labeled entry field');
    const tag = await field.evaluate(node => node.tagName);
    if (tag === 'SELECT') await field.selectOption(value); else await field.fill(value);
    await page.locator('#portal-question-form button[type="submit"]').click();
  } else if (id === 'review') {
    await Promise.all([
      page.waitForURL(url => url.pathname.endsWith('/plan.html')),
      page.getByRole('button', {name:'Build my plan', exact:true}).click()
    ]);
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    return;
  }
  else throw new Error('No visible answer control for ' + id + '=' + value);
  await page.waitForFunction(({key, step}) => {
    const state = JSON.parse(localStorage.getItem(key));
    return state?.journey?.step !== step || state?.journey?.view === 'home';
  }, {key:KEY, step:id});
}
async function intake(page, overrides = {}, stopAt) {
  const answers = {start:'explore', purpose:'any-degree', level:'bachelor', field:'any', format:'online', prior:'none', military:'none', priority:'speed', routes:'tesu-general-management', review:true, ...overrides};
  for (let guard = 0; guard < 18; guard++) {
    const state = await stored(page), step = state.journey.step;
    if (state.journey.view === 'home' || step === stopAt) return state;
    assert(step in answers, 'Acceptance scenario needs an answer for ' + step);
    await answer(page, step, answers[step]);
  }
  throw new Error('Intake did not finish after 18 questions');
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
    assert.equal((await page.locator('#portal-question-title').innerText()).trim(), 'Let’s build your degree plan.');
    assert.equal(await page.locator('.portal-choice').count(), 3);
    assert(await page.getByRole('link',{name:/browse affordable courses first/}).isVisible());
    assert(await page.getByRole('button', {name:/Help me choose/}).isVisible());
    assert(await page.getByRole('button', {name:/I have a school or degree in mind/}).isVisible());
    assert(await page.getByRole('button', {name:/I have courses to bring/}).isVisible());
    assert.equal(await page.locator('#sheet-grid').count(), 0);
    assert(!/Thomas Edison|120-credit example|\$\d[\d,]+/.test(await page.locator('#portal-content').innerText()));
    const state = await stored(page); assert.equal(state.selectedPathwayId, ''); assert.equal(state.learning.length, 0);
    assert.equal(state.journey.completed, false);
  });
  await test('an explorer completes short questions and lands in an editable plan with one personal next step', async () => {
    const page = await fresh(); await intake(page);
    const state = await stored(page); assert.equal(state.journey.view, 'home'); assert.equal(state.journey.completed, true);
    assert.equal(state.selectedPathwayId, 'tesu-general-management'); assert.equal(state.profile.priority, 'speed');
    assert.equal(state.learning.length, 0); assert.notEqual(state.journey.planReviewed, true);
    assert(page.url().endsWith('/plan.html'));
    assert.equal(await page.locator('#sheet-home [data-next-win]').count(), 1);
    assert(await page.locator('#sheet-home a').first().isVisible());
    assert(await page.locator('tr.sheet-row').count() > 0);
  });
  await test('a known school can guide an undecided degree choice without losing that school', async () => {
    const page = await fresh();
    const answers = {start:'target', school:'Liberty University', degree:'unknown', field:'business', format:'campus', routes:'liberty-business-residential'};
    await intake(page, answers, 'degree');
    assert(await page.getByRole('button', {name:'Help me choose a degree at this school', exact:true}).isVisible());
    await intake(page, answers, 'routes');
    let state = await stored(page);
    assert.equal(state.profile.school, 'Liberty University'); assert.equal(state.profile.degree, '');
    assert.equal(state.selectedPathwayId, '');
    const matches = Journey.recommend(state, catalog, models); assert(matches.length > 0);
    assert(matches.every(match => match.pathway.school === 'Liberty University'));
    assert.match(await page.locator('#portal-content').innerText(), /Liberty University/);
    assert(!/Thomas Edison State University/.test(await page.locator('#portal-content').innerText()));
    await intake(page, answers); state = await stored(page);
    assert.equal(state.selectedPathwayId, 'liberty-business-residential'); assert.equal(state.profile.modality, 'campus');
  });
  await test('a technology interest filters out unrelated business recommendations and keeps research gaps visible', async () => {
    const page = await fresh();
    const answers = {field:'technology', routes:'wgu-information-technology'};
    await intake(page, answers, 'routes');
    let state = await stored(page); assert.equal(state.profile.field, 'technology');
    const matches = Journey.recommend(state, catalog, models); assert(matches.length > 0);
    assert(matches.every(match => match.pathway.field === 'technology'));
    const visible = await page.locator('#portal-content').innerText();
    assert.match(visible, /Information Technology/); assert(!/Thomas Edison|General Management/.test(visible));
    await intake(page, answers); state = await stored(page);
    assert.equal(state.selectedPathwayId, 'wgu-information-technology');
    assert.equal(Journey.buildDraft(state, catalog, models).plan, null);
    assert.match(await page.locator('#sheet-workspace').innerText(), /outline|research/i);
  });
  await test('a known residential degree and veteran service records stay attached to the exact school', async () => {
    const page = await fresh();
    await intake(page, {start:'target', school:'Liberty University', degree:'liberty-business-residential', purpose:'career-growth', format:'campus', prior:'some', military:'veteran', 'military-records':'jst'});
    const state = await stored(page);
    assert.equal(state.selectedPathwayId, 'liberty-business-residential'); assert.equal(state.profile.school, 'Liberty University');
    assert.equal(state.profile.modality, 'campus'); assert.equal(state.profile.militaryStatus, 'veteran');
    assert.equal(state.profile.militaryRecords, 'jst'); assert.equal(state.learning.length, 0);
    assert(await page.locator('#sheet-home a[href^="portal.html?view=school"], #sheet-home a[href*="jst.doded"], #sheet-home a[href*="task=credits"]').first().isVisible());
    assert(!/school approved|credits awarded/i.test(await page.locator('#sheet-home').innerText()));
  });
  await test('a licensed career receives relevant routes rather than a generic accelerated business degree', async () => {
    const page = await fresh();
    await intake(page, {purpose:'licensed-career', career:'teacher', level:'bachelor', format:'campus'}, 'routes');
    const state = await stored(page), matches = Journey.recommend(state, catalog, models);
    assert.equal(state.profile.goal, 'teacher'); assert(matches.length > 0);
    assert(matches.every(match => match.pathway.goals.includes('teacher')));
    const visible = await page.locator('#portal-content').innerText();
    assert(!visible.includes('Thomas Edison State University')); assert(!visible.includes('General Management'));
    assert(/teacher|teaching|education/i.test(visible));
    assert.equal(state.learning.length, 0);
  });
  await test('an unsupported exact school and degree remain a clearly provisional outline', async () => {
    const page = await fresh();
    await intake(page, {start:'target', school:'My Regional University', degree:'B.S. Advanced Materials Science', routes:'custom-target'});
    const state = await stored(page); assert.equal(state.selectedPathwayId, 'custom-target');
    assert.equal(state.profile.school, 'My Regional University'); assert.equal(state.profile.degree, 'B.S. Advanced Materials Science');
    assert.match(await page.locator('#sheet-titlebar').innerText(), /Advanced Materials Science/);
    assert.equal(Journey.buildDraft(state, catalog, models).plan, null);
    assert(!/Thomas Edison|120 credits ready|complete course plan/i.test(await page.locator('#sheet-workspace').innerText()));
    assert.match(await page.locator('#sheet-review-note').innerText(), /researched outline|still being mapped/i);
  });
  await test('back and reload keep the student’s current question and exact choices', async () => {
    const page = await fresh();
    await intake(page, {start:'target', school:'Liberty University', degree:'liberty-business-residential'}, 'purpose');
    await page.reload({waitUntil:'networkidle'}); assert.equal((await stored(page)).journey.step, 'purpose');
    await page.locator('.portal-back').click();
    assert.equal((await stored(page)).journey.step, 'degree');
    assert.equal((await stored(page)).selectedPathwayId, 'liberty-business-residential');
    await answer(page, 'degree', 'liberty-business-residential');
    assert.equal((await stored(page)).journey.step, 'purpose');
  });
  await test('adding a finished course opens one task and returns to My plan without inventing approval', async () => {
    const page = await fresh(undefined, savedTarget('tesu-general-management'));
    const add = page.locator('a[href*="task=credits"]'); assert(await add.count()); await add.first().click();
    await page.locator('#sheet-dialog[open]').waitFor(); assert.match(page.url(), /plan\.html\?task=credits/);
    for (const [name, value] of Object.entries({provider:'Community college', code:'MAT100', title:'College Algebra', credits:'3'})) await page.locator('#sheet-learning-form [name="' + name + '"]').fill(value);
    await page.locator('#sheet-learning-form button[type="submit"]').click();
    await page.locator('#close-sheet-dialog').click();
    await page.waitForURL(url => url.pathname.endsWith('/plan.html') && !url.searchParams.has('task'));
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    const state = await stored(page); assert.equal(state.learning.length, 1); assert.equal(state.learning[0].code, 'MAT100');
    assert(state.learning[0].evaluations.every(placement => placement.status !== 'confirmed'));
    assert.notEqual(state.journey.schoolContacted, true);
  });
  await test('deferring credits stays provisional and sending a plan for review never means school approval', async () => {
    const page = await fresh(undefined, savedTarget('tesu-general-management'));
    await page.locator('[data-home-defer]').click();
    let state = await stored(page); assert.equal(state.journey.creditsDeferred, true); assert.equal(state.learning.length, 0);
    let draft = Journey.buildDraft(state,catalog,models);
    assert.equal(Journey.tasks(state,draft).find(task => task.id === 'credits').provisional,true);
    await page.goto(BASE+'portal.html?view=review',{waitUntil:'networkidle'});
    await page.locator('[data-action="finish-plan-review"]').waitFor();
    assert.match(await page.locator('#portal-content').innerText(), /past courses are still missing/i);
    await page.locator('[data-action="finish-plan-review"]').click();
    await page.waitForURL(url => url.pathname.endsWith('/plan.html'));
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    state = await stored(page); assert.equal(state.journey.planReviewed, true); assert(state.journey.reviewedSignature);
    await page.goto(BASE+'portal.html?view=school',{waitUntil:'networkidle'});
    await page.locator('[data-action="school-contacted"]').click();
    await page.waitForURL(url => url.pathname.endsWith('/plan.html'));
    await page.locator('#sheet-workspace').waitFor({state:'visible'});
    state = await stored(page); assert.equal(state.journey.schoolContacted, true);
    draft = Journey.buildDraft(state,catalog,models);
    const sent = Journey.tasks(state,draft).find(task => task.id === 'school');
    assert.equal(sent.complete,true); assert.match(sent.detail,/sent|official evaluation/i);
    assert(!/school approved|transfer approved|degree approved/i.test(await page.locator('#sheet-home').innerText()));
    assert.equal(draft.plan.totals.confirmed, 0);
  });
  await test('community templates preserve the student’s private learning while changing only the proposed route', async () => {
    const saved = savedTarget('tesu-general-management');
    saved.learning = [{id:'private-course', provider:'My College', code:'PRIVATE101', title:'Private completed course', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
    saved.sheet.notes = {'tesu-general-management':{enc1010:'PRIVATE STUDENT NOTE'}};
    const page = await fresh(undefined, saved, 'portal.html?template=seed-liberty-campus-business');
    const state = await stored(page); assert.equal(state.selectedPathwayId, 'liberty-business-residential');
    assert.deepEqual(state.learning, saved.learning); assert.deepEqual(state.sheet.notes, saved.sheet.notes);
    assert.equal(state.templateOrigin.context, 'template:seed-liberty-campus-business');
    assert(!/PRIVATE101|PRIVATE STUDENT NOTE/.test(await page.locator('#portal-content').innerText()));
    assert.equal(state.learning[0].evaluations.length, 0);
  });
  await test('the guided question and editable My plan remain within a 320px screen', async () => {
    const page = await fresh({width:320, height:740});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const box of await page.locator('.portal-choice').all()) assert((await box.boundingBox()).height >= 44);
    await intake(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.locator('#sheet-home [data-next-win]').count(), 1);
    await page.screenshot({path:'/tmp/degreepath-portal-mobile.png', fullPage:true});
  });
  await test('bringing past courses opens intake before asking for a school', async () => {
    const page=await fresh();
    await page.getByRole('button',{name:/I have courses to bring/}).click();
    await page.waitForURL(url=>url.pathname.endsWith('/plan.html')&&url.searchParams.get('task')==='credits');
    await page.locator('#sheet-dialog[open]').waitFor();
    const state=await stored(page);
    assert.equal(state.selectedPathwayId,'');
    assert.equal(state.journey.answers.start,'audit');
    assert.equal(state.profile.hasPrior,'some');
    assert(await page.locator('#sheet-learning-form').isVisible());
  });
  await test('search terms filter degrees, exact selection shows readiness before setup', async () => {
    const page=await fresh();
    await answer(page,'start','target');await answer(page,'school','Liberty University');
    await page.getByLabel('Search by subject or degree',{exact:true}).fill('psychology');
    await page.getByRole('button',{name:'Search degrees',exact:true}).click();
    let state=await stored(page);
    assert.equal(state.journey.step,'degree');assert.notEqual(state.selectedPathwayId,'custom-target');
    const result=page.getByRole('button',{name:/^Psychology Major \(B\.S\.\)/});
    await result.click();
    assert.match(await page.locator('#portal-content').innerText(),/course-by-course transfer plan is not available/i);
    assert(await page.getByRole('link',{name:/Open official degree information/}).isVisible());
    assert.equal((await stored(page)).journey.step,'degree');
    await page.getByRole('button',{name:'Save this goal and continue',exact:true}).click();
    state=await stored(page);assert.equal(state.journey.step,'purpose');
    assert.equal(state.profile.degree,'Psychology Major (B.S.)');assert.notEqual(state.selectedPathwayId,'custom-target');
  });
  await test('changing an existing target exposes school editor and keeps courses', async () => {
    const saved=savedTarget('tesu-general-management');
    saved.learning=[{id:'keep-record',provider:'My college',code:'ABC101',title:'Keep this course',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];
    const page=await fresh(undefined,saved,'portal.html?view=edit');
    assert(await page.getByRole('button',{name:'Keep this degree',exact:true}).isVisible());
    await page.getByRole('button',{name:/Change my school or degree/}).click();
    assert.equal((await stored(page)).journey.step,'school');
    assert.equal((await stored(page)).learning[0].id,'keep-record');
  });
  assert.deepEqual(errors, []); console.log('\n' + count + ' personal portal browser journeys passed.');
} finally {for (const context of contexts) await context.close(); await browser?.close();}})().catch(error => {console.error(error); process.exitCode = 1;});
