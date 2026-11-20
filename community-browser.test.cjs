/* Real-browser integration journeys. Requires the loopback server/dev.mjs preview. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { completeProfileSteps } = require('./test-support/profile-steps.cjs');

const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8107/').replace(/\/?$/, '/');
const ORIGIN = new URL(BASE).origin;
const KEY = 'degreepath-guide-v3';
const RUN = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
const templates = JSON.parse(fs.readFileSync(__dirname + '/dist/data/community-templates.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync(__dirname + '/dist/data/pathways.json', 'utf8'));
// Starters are generated from published plans (community-template-catalog.js); this uses the Liberty
// business starter and computes the requirement ids from its reviewed curriculum.
const model = JSON.parse(fs.readFileSync(__dirname + '/dist/data/liberty.json', 'utf8'));
const starter = (() => {
  const Catalog = require('./dist/program-catalog.js'), Templates = require('./dist/community-template-catalog.js'), registry = require('./dist/data/curriculum-registry.json');
  const published = Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), registry), require('./dist/data/publication-index.json'), registry);
  return Templates.fromCatalog(published, Catalog).find(item => item.modelId === model.id);
})();
const pathway = catalog.pathways.find(item => item.id === starter.pathwayId);
const CONFIRMED = model.requirements[0].id;
const CHOSEN = model.requirements.find(req => req.id !== CONFIRMED && req.options.some(option => option.provider === 'University') && req.options.some(option => option.provider !== 'University'));
const CHOSEN_OPTION = CHOSEN.options.find(option => option.provider === 'University').id;
// A plan starter's discussion is the program's discussion.
const SEED_CONTEXT = 'program:' + starter.pathwayId;
const PRIVATE = 'PRIVATE-BROWSER-' + RUN;
const questionTitle = 'Browser question ' + RUN;
const planTitle = 'Browser proposed plan ' + RUN;
const commentText = 'A real shared starter question ' + RUN;
const reportReason = 'Browser review requested ' + RUN;
const contexts = [], errors = [], writes = [], cleanup = [], reactionRestore = [];
let journeys = 0, browser, anonymous, alice, bob, owner, question, sharedPlan;

function url(path) { return new URL(path.replace(/^\//, ''), BASE).href; }
function track(page, label) {
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  page.on('request', request => {
    const target = new URL(request.url());
    if (target.origin !== ORIGIN || !target.pathname.startsWith('/api/community/') || request.method() === 'GET') return;
    let body = null; try { body = request.postDataJSON(); } catch (_) { /* DELETE has no body. */ }
    writes.push({ label, method:request.method(), path:target.pathname, body });
  });
}
async function context(label, viewport = { width:1440, height:1000 }) {
  const ctx = await browser.newContext({ viewport }); contexts.push(ctx);
  const page = await ctx.newPage(); track(page, label); return { ctx, page, label };
}
async function api(actor, path, { method = 'GET', body } = {}) {
  const response = await actor.ctx.request.fetch(url('/api/community' + path), {
    method,
    headers:method === 'GET' ? { Accept:'application/json' } : {
      Accept:'application/json', Origin:ORIGIN, 'X-Community-Request':'1', 'Content-Type':'application/json'
    },
    ...(body === undefined ? {} : { data:body })
  });
  let data; try { data = await response.json(); } catch (_) { data = { error:await response.text() }; }
  return { status:response.status(), data };
}
async function good(actor, path, options, expected = 200) {
  const result = await api(actor, path, options);
  assert.equal(result.status, expected, path + ': ' + JSON.stringify(result.data)); return result.data;
}
async function signIn(actor, name) {
  await actor.page.goto(url('/__preview/signin?user=' + name + '&run='+encodeURIComponent(RUN)+'&return_to=' + encodeURIComponent('/community.html')), { waitUntil:'networkidle' });
  const session = await good(actor, '/session');
  assert.equal(session.user.id, 'preview-' + name + '-' + RUN, 'Preview cookie must supply the trusted identity');
  actor.originalAlias = session.user.alias;
  return session.user;
}
async function journey(name, fn) { await fn(); journeys++; console.log('PASS ' + name); }
// Starter templates are the published plans (the same rule the community-template-boundary core test uses).
const STARTERS = (() => {
  const Catalog = require('./dist/program-catalog.js'), registry = require('./dist/data/curriculum-registry.json');
  const catalog = Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), registry), require('./dist/data/publication-index.json'), registry);
  return Catalog.publishedPlans(catalog).length;
})();
async function waitTemplates(page) {
  await page.locator('.template-card[data-template-id]').first().waitFor({ state:'visible' });
  assert.equal(await page.locator('.template-card[data-template-id]').count(), STARTERS);
}
async function openStarter(actor) {
  await actor.page.goto(url('/community.html?tab=templates&template=' + starter.id), { waitUntil:'networkidle' });
  await actor.page.locator('#template-detail-title').waitFor({ state:'visible' });
  await actor.page.locator('#template-discussion .engagement-bar').waitFor({ state:'visible' });
}
async function openPublicPost(actor, record) {
  await actor.page.goto(url('/community.html?tab=feed'), { waitUntil:'networkidle' });
  const card = actor.page.locator('[data-post-id="' + record.id + '"]');
  await card.waitFor({ state:'visible' });
  await card.locator('[data-open-post]').first().click();
  await actor.page.locator('#thread-dialog .template-detail h2').waitFor({ state:'visible' });
}
function postResponse(page) {
  return page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/posts' && response.request().method() === 'POST');
}
function fixture(overrides = {}) {
  return {
    version:3, view:'results', step:'direction', selectedPathwayId:pathway.id, resultTab:'plan', baseline:null,
    profile:{
      entry:'audit', goal:'any-degree', degreeLevel:'bachelor', field:'business', schoolChoice:pathway.school,
      school:pathway.school, degree:pathway.title, pathwayId:pathway.id, modality:pathway.modalities[0], priority:'balanced',
      militaryStatus:'veteran', militaryBranch:'army', militaryRecords:'jst', hasPrior:'some', goalDetail:PRIVATE + '-PROFILE'
    },
    learning:[{
      id:PRIVATE + '-learning', provider:'JST', code:PRIVATE + '-CODE', title:PRIVATE + '-TRAINING', credits:3,
      creditSystem:'semester', status:'earned', completedOn:'2024-06-01', notes:PRIVATE + '-NOTE',
      evaluations:[{ programId:model.id, requirementId:CONFIRMED, status:'confirmed' }]
    }],
    scenarios:{ [model.id]:{
      providers:[], allowConditional:false, useWaivers:false, universityRate:'', fees:'', sophiaMonths:1, studyMonths:1,
      sophiaWeeks:'', studyWeeks:'', clepWeeks:'', termWeeks:'', termCredits:'', concurrency:1,
      optionSelections:{ [CHOSEN.id]:CHOSEN_OPTION }
    } },
    ...overrides
  };
}
async function seedDraft(actor, value) {
  await actor.page.goto(url('/guided.html'), { waitUntil:'networkidle' });
  await actor.page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key:KEY, value });
  await actor.page.reload({ waitUntil:'networkidle' });
  await actor.page.waitForFunction(() => !document.querySelector('#results-view').hidden || !document.querySelector('#wizard-view').hidden);
}
async function stored(actor) { return actor.page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY); }
async function noOverflow(page) {
  const widths = await page.evaluate(() => ({ document:document.documentElement.scrollWidth, viewport:innerWidth }));
  assert(widths.document <= widths.viewport + 1, 'Horizontal overflow: ' + JSON.stringify(widths));
}
function whitelist(plan) {
  assert.deepEqual(Object.keys(plan).sort(), ['courses','programId','programName','schoolId','schoolName','strategy','totalCredits'].sort());
  for (const course of plan.courses) {
    assert(Object.keys(course).every(key => ['requirementId','requirement','courseId','title','provider','credits','url'].includes(key)));
    assert.equal(typeof course.credits, 'number');
    assert(!('status' in course) && !('evaluations' in course) && !('notes' in course));
  }
}

(async () => {
  assert(['127.0.0.1','localhost','[::1]'].includes(new URL(BASE).hostname), 'These journeys require the loopback-only preview sign-in simulator.');
  browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  try {
    anonymous = await context('anonymous');
    await journey('public browsing shows the published-plan starters, native sign-in, and an empty live context', async () => {
      await anonymous.page.goto(url('/community.html'), { waitUntil:'networkidle' }); await waitTemplates(anonymous.page);
      assert.equal(await anonymous.page.locator('#community-signin').evaluate(el => el.tagName), 'A');
      assert.equal(await anonymous.page.locator('#community-signin').getAttribute('target'), '_top');
      assert.equal(await anonymous.page.locator('#community-signin').getAttribute('href'), '/account.html?returnTo=' + encodeURIComponent('/community.html'), 'Sign-in returns to the community page');
      assert.match(await anonymous.page.locator('#community-status').textContent(), /proposed until your university confirms/);
      const empty = await good(anonymous, '/feed?context=' + encodeURIComponent('school:browser-empty-' + RUN));
      assert.deepEqual(empty, { items:[], cursor:null });
      await anonymous.page.locator('#community-tab-feed').click();
      await anonymous.page.waitForFunction(() => !document.querySelector('#community-status').textContent.includes('Loading'));
      const live = await good(anonymous, '/feed?limit=20');
      assert.equal(await anonymous.page.locator('#community-feed [data-post-id]').count(), live.items.length);
      if (!live.items.length) assert.match(await anonymous.page.locator('#community-empty').textContent(), /Start the conversation/);
      assert.equal((await api(anonymous, '/comments', { method:'POST', body:{ context:SEED_CONTEXT, body:'Anonymous write must fail' } })).status, 401);
      assert.equal(writes.filter(item => item.label === 'anonymous').length, 0, 'Public UI must not send write requests');
    });

    alice = await context('alice'); bob = await context('bob'); owner = await context('owner');
    await signIn(alice, 'alice'); await signIn(bob, 'bob'); await signIn(owner, 'owner');
    let baseline;
    await journey('Alice comments on a starter and activates a real shared like', async () => {
      for (const actor of [alice,bob]) {
        const summary = await good(actor, '/context?context=' + encodeURIComponent(SEED_CONTEXT));
        reactionRestore.push({ actor, reaction:'like', active:summary.liked }, { actor, reaction:'upvote', active:summary.upvoted });
        for (const reaction of ['like','upvote']) await good(actor, '/context/reactions', { method:'POST', body:{ context:SEED_CONTEXT, reaction, active:false } });
      }
      baseline = await good(anonymous, '/context?context=' + encodeURIComponent(SEED_CONTEXT));
      await openStarter(alice);
      await alice.page.locator('#template-discussion .comment-form [name=body]').fill(commentText);
      const sent = alice.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/comments' && response.request().method() === 'POST');
      await alice.page.locator('#template-discussion .comment-form [type=submit]').click();
      const response = await sent; assert.equal(response.status(), 201); const created = (await response.json()).item;
      cleanup.push({ actor:alice, type:'comments', id:created.id });
      await alice.page.locator('[data-comment-id="' + created.id + '"]').waitFor({ state:'visible' });
      const like = alice.page.locator('#template-discussion [data-reaction=like]'); await like.click();
      await alice.page.waitForFunction(() => document.querySelector('#template-discussion [data-reaction=like]')?.getAttribute('aria-pressed') === 'true');
      assert.equal((await good(alice, '/context?context=' + encodeURIComponent(SEED_CONTEXT))).likes, baseline.likes + 1);
    });

    await journey('Bob sees Alice’s persisted comment in an independent browser and cannot remove it', async () => {
      await openStarter(bob);
      const comment = bob.page.locator('.comment').filter({ hasText:commentText }); await comment.waitFor({ state:'visible' });
      assert.equal(await comment.locator('[data-delete-comment]').count(), 0);
      assert.equal(await comment.locator('[data-report-comment]').count(), 1);
      const own = cleanup.find(item => item.type === 'comments');
      assert.equal((await api(bob, '/comments/' + own.id, { method:'DELETE' })).status, 403);
      await bob.page.locator('#template-discussion [data-reaction=like]').click();
      await bob.page.waitForFunction(() => document.querySelector('#template-discussion [data-reaction=like]')?.getAttribute('aria-pressed') === 'true');
      const summary = await good(bob, '/context?context=' + encodeURIComponent(SEED_CONTEXT));
      assert.equal(summary.likes, baseline.likes + 2); assert.equal(summary.liked, true);
    });

    await journey('retries cannot duplicate a per-user reaction and one user cannot remove another vote', async () => {
      for (let retry = 0; retry < 2; retry++) await good(alice, '/context/reactions', { method:'POST', body:{ context:SEED_CONTEXT, reaction:'like', active:true } });
      assert.equal((await good(alice, '/context?context=' + encodeURIComponent(SEED_CONTEXT))).likes, baseline.likes + 2);
      await good(bob, '/context/reactions', { method:'POST', body:{ context:SEED_CONTEXT, reaction:'like', active:false } });
      const aliceSummary = await good(alice, '/context?context=' + encodeURIComponent(SEED_CONTEXT));
      assert.equal(aliceSummary.likes, baseline.likes + 1); assert.equal(aliceSummary.liked, true);
      for (let retry = 0; retry < 2; retry++) await good(alice, '/context/reactions', { method:'POST', body:{ context:SEED_CONTEXT, reaction:'upvote', active:true } });
      assert.equal((await good(anonymous, '/context?context=' + encodeURIComponent(SEED_CONTEXT))).upvotes, baseline.upvotes + 1);
    });

    await journey('a question asked while viewing a plan is filed under that plan’s discussion and listed there', async () => {
      await openStarter(alice);
      await alice.page.locator('#new-community-plan').click(); const form = alice.page.locator('#community-post-form'); await form.waitFor({ state:'visible' });
      assert.equal(await form.locator('[name=context]').inputValue(), SEED_CONTEXT, 'the composer files plan questions under the discussion context');
      assert.equal(await form.locator('[name=context] option[value^="template:ready-"]').count(), 0);
      const title = 'Plan question ' + RUN;
      await form.locator('[name=title]').fill(title); await form.locator('[name=body]').fill('Does this plan accept recent exam credit?');
      if (await form.locator('[name=consent]').count()) await form.locator('[name=consent]').check();
      const published = postResponse(alice.page); await form.locator('[type=submit]').click();
      const response = await published; assert.equal(response.status(), 201); const item = (await response.json()).item;
      cleanup.push({ actor:alice, type:'posts', id:item.id });
      assert.equal(response.request().postDataJSON().context, SEED_CONTEXT);
      await openStarter(bob);
      await bob.page.locator('#template-questions [data-post-id="' + item.id + '"]').waitFor({ state:'visible' });
      assert.match(await bob.page.locator('#template-questions').innerText(), new RegExp(title));
    });

    await journey('a real public post requires consent and publishes only the chosen alias and public text', async () => {
      await alice.page.goto(url('/community.html?tab=feed'), { waitUntil:'networkidle' });
      await alice.page.locator('#ask-community').click(); const form = alice.page.locator('#community-post-form'); await form.waitFor({ state:'visible' });
      await form.locator('[name=alias]').fill('Alice Browser ' + RUN.slice(-8));
      await form.locator('[name=title]').fill(questionTitle); await form.locator('[name=body]').fill('A public curriculum question with no personal records.');
      const before = writes.filter(item => item.path === '/api/community/posts' && item.method === 'POST').length;
      await form.locator('[type=submit]').click();
      assert.equal(await form.locator('[name=consent]').isChecked(), false);
      assert.equal(await form.evaluate(el => el.checkValidity()), false);
      assert.equal(writes.filter(item => item.path === '/api/community/posts' && item.method === 'POST').length, before);
      await form.locator('[name=consent]').check(); const published = postResponse(alice.page); await form.locator('[type=submit]').click();
      const response = await published; assert.equal(response.status(), 201); question = (await response.json()).item;
      cleanup.push({ actor:alice, type:'posts', id:question.id });
      const payload = response.request().postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ['body','context','kind','title']);
      const visible = (await good(anonymous, '/posts/' + question.id)).item;
      assert.match(visible.author.alias, /^Alice Browser /); assert.equal(visible.author.isYou, false);
      assert(!('id' in visible.author) && !JSON.stringify(visible).includes('@preview.invalid'));
      assert.equal((await api(bob, '/posts/' + question.id, { method:'DELETE' })).status, 403);
    });

    await journey('Bob reports a post and an authenticated owner reviews and removes its public content', async () => {
      await openPublicPost(bob, question); await bob.page.locator('#thread-dialog [data-report-detail]').click();
      const report = bob.page.locator('#thread-dialog .report-form'); await report.locator('[name=reason]').fill(reportReason);
      const sent = bob.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/reports' && response.request().method() === 'POST');
      await report.locator('[type=submit]').click(); assert.equal((await sent).status(), 201);
      assert.equal((await api(bob, '/moderation/reports')).status, 403);
      await owner.page.locator('[data-moderation]').click();
      const reportCard = owner.page.locator('#thread-dialog [data-report-id]').filter({ hasText:reportReason }); await reportCard.waitFor({ state:'visible' });
      await reportCard.locator('[data-remove-target]').click();
      const reviewed = owner.page.waitForResponse(response => /\/api\/community\/moderation\/reports\//.test(new URL(response.url()).pathname) && response.request().method() === 'PATCH');
      await reportCard.locator('[data-confirm-remove]').click(); assert.equal((await reviewed).status(), 200);
      await reportCard.waitFor({ state:'detached' });
      assert.equal((await api(anonymous, '/posts/' + question.id)).status, 404);
      const reviewedReports = await good(owner, '/moderation/reports?status=reviewed&limit=50');
      assert(reviewedReports.items.some(item => item.targetId === question.id && item.target.deleted));
    });

    await journey('wizard sharing previews proposed source rows, excludes JST records, and writes only after explicit consent', async () => {
      await seedDraft(alice, fixture()); await alice.page.locator('[data-action=share-plan]').waitFor({ state:'visible' });
      const beforeDraft = await stored(alice), beforeWrites = writes.filter(item => item.path === '/api/community/posts' && item.method === 'POST').length;
      await alice.page.locator('[data-action=share-plan]').click();
      const form = alice.page.locator('#publish-dialog .publish-form'); await form.waitFor({ state:'visible' });
      assert(!(await alice.page.locator('#publish-dialog-content').textContent()).includes(PRIVATE));
      await form.locator('.share-preview details summary').click();
      assert((await form.locator('.share-preview tbody tr').count()) > 0);
      assert.equal(await form.locator('[name=consent]').isChecked(), false);
      await form.locator('[name=title]').fill(planTitle); await form.locator('[type=submit]').click();
      assert.equal(writes.filter(item => item.path === '/api/community/posts' && item.method === 'POST').length, beforeWrites);
      await form.locator('[name=consent]').check(); const published = postResponse(alice.page); await form.locator('[type=submit]').click();
      const response = await published; assert.equal(response.status(), 201); sharedPlan = (await response.json()).item;
      cleanup.push({ actor:alice, type:'posts', id:sharedPlan.id });
      const payload = response.request().postDataJSON(); assert.equal(payload.publishPublicPlan, true); whitelist(payload.plan);
      assert(!JSON.stringify(payload).includes(PRIVATE)); assert(!JSON.stringify(payload).includes('JST'));
      assert(!payload.plan.courses.some(course => course.requirementId === CONFIRMED), 'Confirmed prior learning must not become a public proposed course');
      assert(payload.plan.courses.some(course => course.requirementId === CHOSEN.id && course.courseId === CHOSEN_OPTION));
      assert.deepEqual((await stored(alice)).learning, beforeDraft.learning);
      await alice.page.locator('#thread-dialog a[href="portal.html?shared=' + sharedPlan.id + '"]').waitFor({ state:'visible' });
      const invalid = await api(alice, '/posts', { method:'POST', body:{ ...payload, plan:{ ...payload.plan, notes:PRIVATE } } });
      assert.equal(invalid.status, 400, 'Server must reject accidentally forwarded private plan fields');
    });

    await journey('building from a plan starter previews the degree and preserves existing learning and course choices', async () => {
      await seedDraft(bob, fixture({ view:'wizard', step:'direction' })); const before = await stored(bob);
      const beforePosts = writes.filter(item => item.label === 'bob' && item.path === '/api/community/posts').length;
      await bob.page.goto(url('/community.html'), { waitUntil:'networkidle' }); await waitTemplates(bob.page);
      const build = bob.page.locator('[data-template-id="' + starter.id + '"] a').filter({ hasText:'Build my plan' });
      assert.equal(await build.getAttribute('href'), starter.launchURL); await build.click();
      await bob.page.getByRole('button', { name:'Build course plan', exact:true }).waitFor();
      assert.deepEqual(await stored(bob), before, 'Opening a starter does not change the saved plan');
      await bob.page.getByRole('button', { name:'Build course plan', exact:true }).click();
      await completeProfileSteps(bob.page); await bob.page.waitForURL('**/plan.html');
      const after = await stored(bob); assert.deepEqual(after.learning, before.learning);
      assert.deepEqual(after.scenarios[model.id].optionSelections, before.scenarios[model.id].optionSelections);
      assert.equal(after.selectedPathwayId, pathway.id); assert.equal(after.profile.school, pathway.school);
      assert.equal(writes.filter(item => item.label === 'bob' && item.path === '/api/community/posts').length, beforePosts);
    });

    await journey('a shared-plan builder link imports reviewed proposed choices and never creates earned learning', async () => {
      const before = await stored(bob), beforePosts = writes.filter(item => item.label === 'bob' && item.path === '/api/community/posts').length;
      await openPublicPost(bob, sharedPlan);
      const link = bob.page.getByRole('link', { name:'Make a copy of this plan', exact:true });
      assert.equal(await link.getAttribute('href'), 'portal.html?shared=' + encodeURIComponent(sharedPlan.id)); await link.click();
      await bob.page.waitForFunction(({ key, context }) => JSON.parse(localStorage.getItem(key))?.templateOrigin?.context === context, { key:KEY, context:'post:' + sharedPlan.id });
      // A returning student lands on the copied course plan.
      await bob.page.waitForURL('**/plan.html'); await bob.page.waitForLoadState('networkidle');
      const after = await stored(bob); assert.deepEqual(after.learning, before.learning);
      assert.equal(after.learning.filter(item => item.status === 'earned').length, before.learning.filter(item => item.status === 'earned').length);
      const expected = {};
      for (const course of sharedPlan.plan.courses) {
        const requirement = model.requirements.find(item => item.id === course.requirementId);
        const option = requirement?.options.find(item => item.id === course.courseId && item.provider === course.provider && item.credits === course.credits);
        if (option) expected[requirement.id] = option.id;
      }
      assert.deepEqual(after.scenarios[model.id].optionSelections, expected); assert.equal(after.templateOrigin.unmatchedChoices, 0);
      assert.equal(after.profile.pathwayId, pathway.id); await bob.page.locator('tr.course-plan-row').first().waitFor();
      assert.equal(writes.filter(item => item.label === 'bob' && item.path === '/api/community/posts').length, beforePosts);
    });

    await journey('390px mobile browsing, keyboard tabs, starter sources, and the discussion dialog have no overflow or JS errors', async () => {
      const mobile = await context('mobile', { width:390, height:844 });
      await mobile.page.goto(url('/community.html'), { waitUntil:'networkidle' }); await waitTemplates(mobile.page); await noOverflow(mobile.page);
      await mobile.page.locator('#community-tab-templates').focus(); await mobile.page.keyboard.press('ArrowRight');
      assert.equal(await mobile.page.locator('#community-tab-feed').getAttribute('aria-selected'), 'true');
      assert.equal(await mobile.page.locator('#community-tab-feed').evaluate(el => document.activeElement === el), true);
      await mobile.page.keyboard.press('ArrowLeft'); assert.equal(await mobile.page.locator('#community-tab-templates').getAttribute('aria-selected'), 'true');
      await mobile.page.locator('#template-search').fill('Interdisciplinary'); assert.equal(await mobile.page.locator('.template-card').count(), 1);
      await mobile.page.locator('[data-view-template="' + starter.id + '"]').first().focus(); await mobile.page.keyboard.press('Enter');
      await mobile.page.locator('#template-discussion .engagement-bar').waitFor({ state:'visible' }); await noOverflow(mobile.page);
      await mobile.page.locator('.starter-ledger > summary').click(); await noOverflow(mobile.page);
      await mobile.page.locator('#ask-template').click(); await mobile.page.locator('#thread-dialog .engagement-bar').waitFor({ state:'visible' });
      await noOverflow(mobile.page);
      assert.equal(await mobile.page.locator('#thread-dialog a[href^="/account.html"]').first().getAttribute('target'), '_top');
      await mobile.page.keyboard.press('Escape'); assert.equal(await mobile.page.locator('#thread-dialog').evaluate(el => el.open), false);
      assert.deepEqual(errors, [], 'No uncaught browser JavaScript errors in any journey');
    });
    console.log('\n' + journeys + ' real community browser journeys passed.');
  } finally {
    // Remove only this run's own content and restore pre-existing reaction/alias state.
    for (const item of cleanup.reverse()) {
      try { const result = await api(item.actor, '/' + item.type + '/' + item.id, { method:'DELETE' }); if (![200,404].includes(result.status)) console.error('Cleanup:', item.type, result.status, result.data.error); } catch (error) { console.error('Cleanup:', error.message); }
    }
    for (const item of reactionRestore) {
      try { await good(item.actor, '/context/reactions', { method:'POST', body:{ context:SEED_CONTEXT, reaction:item.reaction, active:item.active } }); } catch (error) { console.error('Reaction restore:', error.message); }
    }
    for (const actor of [alice,bob].filter(Boolean)) {
      try { const session = await good(actor, '/session'); if (actor.originalAlias && session.user.alias !== actor.originalAlias) await good(actor, '/profile', { method:'POST', body:{ alias:actor.originalAlias } }); } catch (error) { console.error('Alias restore:', error.message); }
    }
    await Promise.all(contexts.map(ctx => ctx.close())); if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
