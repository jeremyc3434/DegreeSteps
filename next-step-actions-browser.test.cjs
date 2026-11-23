/* Next-step links and credit decisions against shipped local assets. Synthetic records only. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const Programs = require('./dist/program-catalog.js');
const {mountOfflineSite} = require('./test-support/offline-site.cjs');
const catalog = Programs.attachRegistry(Programs.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), require('./dist/data/curriculum-registry.json'));
const models = [require('./dist/data/tesu.json')];
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8133/').replace(/\/?$/, '/');
const KEY = 'degreepath-guide-v3', SCOPE = 'tesu-general-management';
const contexts = [], errors = [];
let browser, count = 0;

function seed(prior = 'unknown') {
  let state = Sheet.selectPathway(Sheet.initialize(null, null, catalog), catalog.pathways.find(item => item.id === SCOPE));
  state = Journey.initialize(state, null, catalog);
  state.profile = {...state.profile, hasPrior:prior, modality:'online'};
  state.journey = {...state.journey, completed:true, view:'home', step:'review',
    answers:{...state.journey.answers, purpose:'any-degree', prior}, planReviewed:false, schoolContacted:false};
  state.sheet.notes = {[SCOPE]:{enc1010:'Keep my private advisor note'}, 'other-degree':{other:'Private other-degree note'}};
  state.checklist = {version:1, plans:{'other-degree':{items:{'review-plan':{status:'waiting', notes:'Keep this other-degree task'}}, custom:[], nextId:1}}};
  return state;
}
const record = (status, extras = {}) => ({id:'synthetic-' + status, provider:'My former college', code:'HIST 999', title:'Private original history course', credits:3, creditSystem:'semester', status,
  privateNote:'Keep this source note', evaluations:[{programId:'other-degree', requirementId:'other-history', status:'reported'}], ...extras});
const saved = p => p.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const home = p => p.locator('#sheet-home .student-checklist');
const item = (p, id) => home(p).locator('[data-dc-task="' + id + '"]');
async function readyPlan(p) {
  await p.locator('tr.course-plan-row').first().waitFor();
  // The checklist sits in the collapsed "All tasks and checklist" panel below the plan.
  await openDetails(p.locator('#sheet-task-panel'));
  await home(p).locator('.dc-next').waitFor();
}
async function page(state = seed(), path = 'plan.html') {
  const context = await browser.newContext({viewport:{width:1440, height:1000}});
  context.setDefaultTimeout(15000);
  contexts.push(context);
  await mountOfflineSite(context, {origin:new URL(BASE).origin});
  await context.addInitScript(({key, value}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, {key:KEY, value:state});
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(BASE + path, {waitUntil:'networkidle'});
  if (path.startsWith('portal.html')) await p.locator('#portal-question-title').waitFor();
  // The records task opens the upload page, which also offers the two past-course decisions.
  else if (path.includes('task=credits')) {await p.waitForURL('**/import-courses.html?from=plan');await p.locator('[data-import-prior="later"]').waitFor();}
  else await readyPlan(p);
  return p;
}
async function openDetails(locator) {
  if (await locator.getAttribute('open') === null) await locator.locator(':scope > summary').click();
}
async function reveal(p, id) {
  await openDetails(p.locator('#sheet-task-panel'));
  await openDetails(home(p).locator('[data-dc-open="checklist"]'));
  const task = item(p, id), group = await task.getAttribute('data-dc-group');
  await openDetails(home(p).locator('[data-dc-open="group:' + group + '"]'));
  if (await task.getAttribute('data-status') === 'done') await openDetails(home(p).locator('[data-dc-open="done:' + group + '"]'));
  return task;
}
const failures = [];
async function test(name, run) {
  if (process.env.DEGREEPATH_NEXT_STEP_CASE && !new RegExp(process.env.DEGREEPATH_NEXT_STEP_CASE).test(name)) return;
  const before = contexts.length;
  // Each journey reports on its own so one failure does not hide the rest; any failure fails the run.
  try {await run(); count++; console.log('PASS ' + name);}
  catch (error) {failures.push(name); console.log('FAIL ' + name + '\n  ' + String(error.message).split('\n')[0]);}
  finally {for (const context of contexts.splice(before)) await context.close();}
}

(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});

  await test('the records task opens the course upload page, with manual entry, without changing records', async () => {
    for (const status of [null, 'saved', 'in-progress']) {
      const state = seed();
      if (status) state.learning = [record(status)];
      const p = await page(state);
      await p.goto(BASE + 'plan.html?task=credits', {waitUntil:'networkidle'});
      await p.waitForURL('**/import-courses.html?from=plan');
      assert.equal(await p.getByRole('link', {name:'Enter it manually', exact:true}).getAttribute('href'), 'plan.html?task=credits&manual=1&from=courses');
      assert.deepEqual((await saved(p)).learning, state.learning);
    }
  });
  // The records task redirects to the upload page, which offers all three past-course decisions:
  // upload (or enter manually), "I don't have past college courses" and "I'll add them later".
  await test('zero, saved-only and in-progress collections all offer the three past-course decisions', async () => {
    for (const status of [null, 'saved', 'in-progress']) {
      const state = seed();
      if (status) state.learning = [record(status)];
      const p = await page(state, 'plan.html?task=credits');
      assert(await p.locator('label[for="import-files"]').isVisible(), 'upload past courses');
      assert(await p.getByRole('link', {name:'Enter it manually', exact:true}).isVisible());
      assert(await p.getByRole('button', {name:'I don’t have past college courses', exact:true}).isVisible());
      assert(await p.getByRole('button', {name:'I’ll add them later', exact:true}).isVisible());
      assert.equal(await p.locator('#sheet-learning-form').count(), 0);
      assert.deepEqual((await saved(p)).learning, state.learning);
    }
  });

  await test('starting from zero keeps saved and taking courses private and returns to My plan', async () => {
    const state = seed();
    state.learning = ['saved', 'planned', 'in-progress'].map(status => record(status));
    const p = await page(state, 'plan.html?task=credits'), before = await saved(p);
    await p.locator('[data-import-prior="none"]').click();
    await p.waitForURL(BASE + 'plan.html');
    await readyPlan(p);
    const after = await saved(p);
    assert.equal(after.profile.hasPrior, 'none');
    assert.equal(after.journey.answers.prior, 'none');
    assert.equal(after.journey.creditsDeferred, false);
    assert.equal(after.journey.completed, true);
    assert.equal(after.journey.view, 'home');
    assert.equal(after.journey.step, 'review');
    assert.equal(after.journey.planReviewed, false);
    assert.equal(after.journey.schoolContacted, false);
    assert.deepEqual(after.learning, before.learning);
    assert.deepEqual(after.sheet.notes, before.sheet.notes);
    assert.deepEqual(after.checklist.plans['other-degree'], before.checklist.plans['other-degree']);
  });

  await test('Do this later records a waiting task and leaves the course plan provisional', async () => {
    const state = seed();state.learning = [record('saved')];
    const p = await page(state, 'plan.html?task=credits');
    await p.locator('[data-import-prior="later"]').click();
    await p.waitForURL(BASE + 'plan.html');await readyPlan(p);
    const after = await saved(p);
    assert.equal(after.profile.hasPrior, 'unknown');
    assert.equal(after.journey.answers.prior, 'unknown');
    assert.equal(after.journey.creditsDeferred, true);
    assert.equal(after.checklist.plans[SCOPE].items['gather-records'].status, 'waiting');
    assert.equal(await (await reveal(p, 'gather-records')).getAttribute('data-status'), 'waiting');
    assert.equal(Journey.buildDraft(after, catalog, models).plan.provisional, true);
    assert.deepEqual(after.learning, state.learning);
  });

  // Adding past courses is now the upload page itself (or its manual-entry link). Opening the form records
  // nothing; the past-course answer follows from the records the student saves.
  await test('Add past courses opens the original-record form without awarding or deleting learning', async () => {
    const state = seed();state.learning = [record('saved')];
    const p = await page(state, 'plan.html?task=credits'), before = await saved(p);
    await p.getByRole('link', {name:'Enter it manually', exact:true}).click();
    await p.locator('#sheet-learning-form').waitFor();
    assert(await p.locator('#sheet-learning-form').getByLabel('Original school or provider').isVisible());
    const after = await saved(p);
    assert.equal(after.profile.hasPrior, before.profile.hasPrior);
    assert.equal(after.journey.creditsDeferred, before.journey.creditsDeferred);
    assert.deepEqual(after.learning, state.learning);
    assert.equal(after.journey.planReviewed, false);
    assert.equal(after.journey.schoolContacted, false);
  });

  await test('an unseen completed record rejects a stale zero-credit action without losing the concurrent save', async () => {
    const p = await page(seed(), 'plan.html?task=credits');
    const concurrent = record('earned', {id:'concurrent-earned', credits:null, creditSystem:null});
    await p.evaluate(({key, source}) => {
      const state = JSON.parse(localStorage.getItem(key));
      state.learning.push(source);
      state.sheet.notes['other-degree'].concurrent = 'Keep this newer private note';
      localStorage.setItem(key, JSON.stringify(state));
    }, {key:KEY, source:concurrent});
    await p.locator('[data-import-prior="none"]').click();
    await p.waitForFunction(() => /completed learning/i.test(document.querySelector('#sheet-prior-error')?.textContent || ''));
    assert.equal(new URL(p.url()).searchParams.get('task'), 'credits');
    const after = await saved(p);
    assert.deepEqual(after.learning, [concurrent]);
    assert.equal(after.sheet.notes['other-degree'].concurrent, 'Keep this newer private note');
    assert.equal(after.profile.hasPrior, 'unknown');
    assert(await p.locator('[data-prior-choice="none"]').isEnabled());
  });

  await test('a student with finished courses is not offered "I don’t have past college courses" on the upload page', async () => {
    const state = seed();state.learning = [record('earned')];
    const p = await page(state, 'plan.html?task=credits');
    assert.equal(await p.locator('[data-import-prior="none"]').isVisible(), false);
    assert(await p.locator('[data-import-prior="later"]').isVisible());
    for (const width of [390, 320]) {await p.setViewportSize({width, height:844});assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));}
  });

  await test('deadline tasks prepare a specific school question with an official source and return to My plan', async () => {
    const p = await page(seed('none'), 'portal.html?view=school&action=check-application-deadline');
    assert.match(await p.locator('#portal-question-title').innerText(), /application dates/i);
    const request = await p.locator('#portal-school-request').inputValue();
    assert.match(request, /application, enrollment and financial-aid deadlines/i);
    assert.match(request, /next available start dates/i);
    assert.match(request, /Thomas Edison State University/);
    const official = p.getByRole('link', {name:/Open official program information/});
    assert.match(await official.getAttribute('href'), /^https:\/\//);
    assert.equal(await p.locator('[data-action="school-contacted"]').count(), 0);
    assert.deepEqual([...new Set(await p.getByRole('link', {name:'My plan', exact:true}).evaluateAll(links => links.map(link => new URL(link.getAttribute('href'), location.href).pathname)))], ['/plan.html']);
    await p.getByRole('link', {name:'Back to my checklist', exact:true}).click();
    await p.waitForURL(BASE + 'plan.html');await readyPlan(p);
    assert.equal((await saved(p)).journey.schoolContacted, false);
  });

  await test('an Air Force learner unsure of the record type reaches CCAF transcript information', async () => {
    const state = seed('none');
    Object.assign(state.profile, {militaryStatus:'active', militaryRecords:'not-sure', militaryBranch:'air-force'});
    const p = await page(state, 'portal.html?view=school&action=military-records#service-records');
    const service = p.locator('#service-records');
    assert(await service.getByRole('link', {name:/Open CCAF transcript information/}).isVisible());
    assert.match(await service.getByRole('link', {name:/Open CCAF transcript information/}).getAttribute('href'), /^https:\/\/www\.airuniversity\.af\.edu\//);
    assert.equal(await service.getByRole('link', {name:/Open Joint Services Transcript/}).count(), 0);
    assert.equal(await p.locator('[data-action="school-contacted"]').count(), 0);
  });

  await test('the normal review task opens the real review acknowledgement and records only student review', async () => {
    const p = await page(seed('none'));
    const review = await reveal(p, 'review-plan');
    const link = review.getByRole('link', {name:'Review my plan', exact:true});
    assert.equal(await link.getAttribute('href'), 'portal.html?view=review');
    await link.click();await p.waitForURL('**/portal.html?view=review');
    const acknowledgement = p.locator('[data-action="finish-plan-review"]');
    await acknowledgement.waitFor();
    assert.equal((await saved(p)).journey.planReviewed, false);
    await acknowledgement.click();await p.waitForURL(BASE + 'plan.html');await readyPlan(p);
    const after = await saved(p);
    assert.equal(after.journey.planReviewed, true);
    assert.equal(typeof after.journey.reviewedSignature, 'string');
    assert.equal(after.journey.schoolContacted, false);
    assert.deepEqual(after.learning, []);
  });

  await test('course progress moves the automatic checklist from taking to finished without school confirmation', async () => {
    const p = await page(seed('none'));
    await openDetails(home(p).locator('[data-dc-open="checklist"]'));
    await openDetails(home(p).locator('[data-dc-open="group:courses"]'));
    const course = home(p).locator('[data-dc-group="courses"]').first(), id = await course.getAttribute('data-dc-task');
    assert.equal(await course.locator('[data-dc-check]').count(), 0);
    await course.getByRole('link', {name:'Update progress', exact:true}).click();
    await p.waitForURL('**/plan.html?course=*');
    await p.locator('#sheet-dialog [data-progress]').waitFor();
    await p.locator('#sheet-dialog [data-progress]').selectOption('in-progress');
    await p.waitForFunction(key => JSON.parse(localStorage.getItem(key)).learning.some(source => source.status === 'in-progress'), KEY);
    await p.locator('#close-sheet-dialog').click();
    assert.equal(await (await reveal(p, id)).getAttribute('data-status'), 'doing');
    await item(p, id).getByRole('link', {name:'Update progress', exact:true}).click();
    await p.locator('#sheet-dialog [data-progress]').waitFor();
    await p.locator('#sheet-dialog [data-progress]').selectOption('completed');
    await p.waitForFunction(key => JSON.parse(localStorage.getItem(key)).learning.some(source => source.status === 'earned'), KEY);
    assert.match(await p.locator('#sheet-dialog').innerText(), /School evaluation pending/);
    await p.locator('#close-sheet-dialog').click();
    const finished = await reveal(p, id);
    assert.equal(await finished.getAttribute('data-status'), 'done');
    assert.equal(await finished.locator('[data-dc-check]').count(), 0);
    const after = await saved(p);
    assert.equal(after.learning.length, 1);
    assert(after.learning.every(source => !(source.evaluations || []).some(evaluation => evaluation.status === 'confirmed')));
    assert.equal(after.journey.schoolContacted, false);
  });

  assert.deepEqual(errors, []);
  console.log(count + ' next-step browser journeys passed.');
  if (failures.length) {console.error(failures.length + ' failed: ' + failures.join('; ')); process.exitCode = 1;}
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
}})().catch(error => {console.error(error); process.exitCode = 1;});
