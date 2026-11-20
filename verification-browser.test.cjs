/* Real browser + SQLite preview journeys. Start server/dev.mjs separately; never run against production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { completeProfileSteps } = require('./test-support/profile-steps.cjs');

const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8120/').replace(/\/?$/, '/');
const ORIGIN = new URL(BASE).origin;
const KEY = 'degreepath-guide-v3';
const RUN = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = '2026-2027';
const COURSE = { kind:'course', programId:'tesu-general-management', requirementId:'enc1010', courseId:'sophia-enc1010-3', catalogYear:YEAR };
const OTHER_SOURCE = { ...COURSE, courseId:'clep-composition-enc1010' };
const OTHER_YEAR = { ...COURSE, catalogYear:'2025-2026' };
const OTHER_PROGRAM = { kind:'course', programId:'liberty-business-residential', requirementId:'engl-101', courseId:'sophia-soph-0015', catalogYear:YEAR };
const model = JSON.parse(fs.readFileSync(__dirname + '/dist/data/tesu.json', 'utf8'));
const Sheet=require('./dist/sheet-state.js'),catalog=require('./dist/data/pathways.json');
const chosen=Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(p=>p.modelId==='tesu-general-management'));
const contexts = [], errors = [], writes = [], reports = new Map();
let browser, anonymous, alice, bob, owner, planPost, publicPayload, journeyCount = 0;

function url(path) { return new URL(path.replace(/^\//, ''), BASE).href; }
function query(target) { return new URLSearchParams(target).toString(); }
function dialog(actor) { return actor.page.locator('#evidence-dialog'); }
function remember(actor, item) { reports.set(item.id, { actor, id:item.id }); return item; }
async function journey(name, work) { await work(); journeyCount++; console.log('PASS ' + name); }
async function actor(label, viewport = { width:1440, height:1000 }) {
  const ctx = await browser.newContext({ viewport }); contexts.push(ctx);
  await ctx.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed:chosen});
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  page.on('request', request => {
    const target = new URL(request.url());
    if (target.origin === ORIGIN && target.pathname.startsWith('/api/community/') && request.method() !== 'GET') {
      writes.push({ actor:label, method:request.method(), path:target.pathname });
    }
  });
  await page.goto(url('/plan.html?editor=1'), { waitUntil:'networkidle' });
  await page.locator('#sheet-workspace:not([hidden])').waitFor();
  return { ctx, page, label };
}
// The provider-by-row worksheet is the plan's detailed view (plan.html?editor=1).
// Use the site's same-origin client and native preview cookies, never forged identity headers.
async function api(person, path, options = {}) {
  return person.page.evaluate(async ({ path, options }) => {
    try { return { ok:true, data:await window.DegreeCommunity.api(path, options) }; }
    catch (error) { return { ok:false, status:error.status, error:error.message }; }
  }, { path, options });
}
async function good(person, path, options) {
  const result = await api(person, path, options);
  assert.equal(result.ok, true, path + ': ' + JSON.stringify(result));
  return result.data;
}
async function evidence(person, target = COURSE) { return good(person, '/evidence?' + query(target)); }
async function signIn(person, name) {
  await person.page.goto(url('/__preview/signin?user=' + name + '&run='+encodeURIComponent(RUN)+'&return_to=/community.html'), { waitUntil:'networkidle' });
  const session = await good(person, '/session');
  assert.equal(session.user.id, 'preview-' + name + '-' + RUN);
  person.originalAlias = session.user.alias;
  return session.user;
}
async function setAlias(person, alias) {
  await person.page.locator('[data-edit-alias]').click();
  await person.page.locator('.alias-form [name=alias]').fill(alias);
  const saved = person.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/profile' && response.request().method() === 'POST');
  await person.page.locator('.alias-form button[type=submit]').click();
  assert.equal((await saved).status(), 200);
  await person.page.locator('.alias-form').waitFor({ state:'detached' });
  assert.equal((await good(person, '/session')).user.alias, alias);
  person.alias = alias;
}
async function closeEvidence(person) {
  if (await dialog(person).count() && await dialog(person).evaluate(node => node.open)) {
    await dialog(person).locator('.evidence-close').click();
  }
}
async function worksheet(person) {
  await person.page.goto(url('/plan.html?editor=1'), { waitUntil:'networkidle' });
  await person.page.locator('[data-requirement=enc1010]').waitFor();
}
// The worksheet no longer has a school picker; switch the saved plan the way Change degree does, keeping records.
async function useProgram(person, routeId) {
  const route = catalog.pathways.find(item => item.id === routeId);
  const current = await person.page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  await person.page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key:KEY, value:Sheet.selectPathway(current, route) });
  await person.page.goto(url('/plan.html?editor=1'), { waitUntil:'networkidle' });
  await person.page.locator('tr.sheet-row').first().waitFor();
}
async function openCourse(person, id = 'enc1010') {
  const row = person.page.locator('[data-requirement="' + id + '"]');
  await row.locator('[data-row]').last().click();
  await person.page.locator('#sheet-dialog [data-outcome-row="' + id + '"]').click();
  await dialog(person).locator('.evidence-summary').waitFor();
}
async function openTarget(person, target) {
  await person.page.evaluate(target => window.DegreeEvidence.open(target, { title:'Browser school outcome' }), target);
  await dialog(person).locator('.evidence-summary').waitFor();
}
async function status(person, value, reportCount) {
  await person.page.waitForFunction(value => document.querySelector('#evidence-dialog .evidence-summary > .evidence-badge')?.classList.contains('evidence-' + value), value);
  if (reportCount !== undefined) {
    const summary = await dialog(person).locator('.evidence-summary > .evidence-badge').innerText();
    if (reportCount) assert.match(summary, new RegExp('· ' + reportCount + ' reports?'));
    else assert.equal(summary, 'No reports yet');
  }
}
async function publishOutcome(person, outcome = 'success', detail = 'The school evaluated this exact placement. Redacted A & B ' + RUN) {
  const form = dialog(person).locator('.evidence-form');
  await form.locator('[name=outcome]').selectOption(outcome);
  await form.locator('[name=evaluatedOn]').fill(TODAY);
  await form.locator('[name=details]').fill(detail);
  await form.locator('[name=evidenceUrl]').fill('https://example.org/redacted/' + RUN + '/' + person.label);
  await form.locator('[name=consent]').check();
  const saved = person.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/evidence' && response.request().method() === 'POST');
  await form.locator('button[type=submit]').click();
  const response = await saved;
  assert.equal(response.status(), 201, await response.text());
  const item = remember(person, (await response.json()).item);
  await dialog(person).locator('[data-evidence-id="' + item.id + '"]').waitFor();
  await dialog(person).locator('.evidence-form .evidence-hint').first().waitFor();
  return item;
}
async function openQueue() {
  await owner.page.goto(url('/community.html'), { waitUntil:'networkidle' });
  await owner.page.locator('[data-outcome-review]').click();
  await dialog(owner).locator('[name=evidenceReviewFilter]').waitFor();
}
async function review(item) {
  await openQueue();
  let card = dialog(owner).locator('[data-review-evidence-id="' + item.id + '"]');
  // A busy local preview can have more than one real page of reports.
  while (!(await card.count()) && await dialog(owner).locator('[data-more-evidence-review]').count()) {
    const response = owner.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/moderation/evidence');
    await dialog(owner).locator('[data-more-evidence-review]').click();
    await response;
    await dialog(owner).locator('[data-more-evidence-review]:disabled').waitFor({ state:'detached' });
    card = dialog(owner).locator('[data-review-evidence-id="' + item.id + '"]');
  }
  await card.waitFor();
  await card.locator('[name=reviewNote]').fill('Checked the public, redacted proof for the exact scope. ' + RUN);
  const saved = owner.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/evidence/' + item.id + '/review' && response.request().method() === 'PATCH');
  await card.locator('[data-evidence-review=reviewed]').click();
  assert.equal((await saved).status(), 200);
  await card.waitFor({ state:'detached' });
}
async function openPlan(person) {
  await person.page.goto(url('/community.html?tab=feed&post=' + encodeURIComponent(planPost.id)), { waitUntil:'networkidle' });
  await person.page.locator('#thread-dialog [data-plan-outcomes="' + planPost.id + '"]').click();
  await dialog(person).locator('.evidence-summary').waitFor();
}
async function localLearning(person) { return person.page.evaluate(key => JSON.parse(localStorage.getItem(key)).learning, KEY); }
async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({ width:innerWidth, document:document.documentElement.scrollWidth }));
  assert(sizes.document <= sizes.width + 1, JSON.stringify(sizes));
}
function actualPlan() {
  return {
    schoolId:'tesu', schoolName:model.school, programId:model.id, programName:model.title,
    strategy:'balanced', totalCredits:model.totalCredits, catalogYear:YEAR,
    courses:model.requirements.map(requirement => {
      const option = requirement.options.find(option => option.id === 'sophia-enc1010-3') || requirement.options.find(option => option.provider === 'University') || requirement.options[0];
      return { requirementId:requirement.id, requirement:requirement.categoryLabel || requirement.title, courseId:option.id, title:option.title, provider:option.provider, credits:requirement.credits, ...(option.url ? { url:option.url } : {}) };
    })
  };
}

(async () => {
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname), 'Use the loopback-only server/dev.mjs preview.');
  browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  try {
    anonymous = await actor('anonymous');
    await journey('anonymous visitors read dated scopes, get native sign-in, and cannot write outcomes', async () => {
      await openCourse(anonymous);
      assert.equal(await dialog(anonymous).locator('.evidence-form').count(), 0);
      const link = dialog(anonymous).getByRole('link', { name:'Sign in to report an outcome' });
      { const target = new URL(await link.getAttribute('href'), BASE); assert.equal(target.pathname, '/account.html'); assert.equal(target.searchParams.get('returnTo'), new URL(anonymous.page.url()).pathname, 'Sign-in returns to the page the student was reading'); }
      assert.equal(await link.getAttribute('target'), '_top');
      assert.equal(writes.filter(item => item.actor === 'anonymous').length, 0, 'Reading the UI must not write');
      const before = (await evidence(anonymous)).summary;
      const denied = await api(anonymous, '/evidence', { method:'POST', body:{ target:COURSE, outcome:'success', evaluatedOn:TODAY, details:'Anonymous attempt ' + RUN, consent:true } });
      assert.equal(denied.status, 401);
      assert.deepEqual((await evidence(anonymous)).summary, before);
    });

    alice = await actor('alice'); bob = await actor('bob'); owner = await actor('owner');
    await signIn(alice, 'alice'); await signIn(bob, 'bob'); await signIn(owner, 'owner');
    // Remove only the signed-in preview accounts' old reports, so reruns are honest and deterministic.
    for (const person of [alice, bob, owner]) {
      for (const target of [COURSE, OTHER_YEAR, OTHER_SOURCE, OTHER_PROGRAM]) {
        const own = (await evidence(person, target)).own;
        if (own) await good(person, '/evidence/' + own.id, { method:'DELETE' });
      }
    }
    let aliceReport, bobReport, ledger;
    await journey('public aliases and a consented school report preserve the private learning ledger', async () => {
      await setAlias(alice, 'Evidence Alice ' + RUN);
      await setAlias(bob, 'Evidence Bob ' + RUN);
      await worksheet(alice);
      await alice.page.locator('[data-provider=enc1010]').selectOption('Sophia');
      // Single courses are added through the manual-entry form; the credits action itself opens the upload page.
      await alice.page.goto(url('/plan.html?task=credits&manual=1'), { waitUntil:'networkidle' });
      const form = alice.page.locator('#sheet-learning-form'); await form.waitFor();
      for (const [name, value] of Object.entries({ provider:'Community college', code:'PRIVATE-' + RUN, title:'Private learning ' + RUN, credits:'3' })) await form.locator('[name="' + name + '"]').fill(value);
      await form.locator('button[type=submit]').click();
      await alice.page.locator('#close-sheet-dialog').click();
      await worksheet(alice);
      ledger = await localLearning(alice);
      assert.equal(ledger.length, 1);
      await openCourse(alice);
      const contribution = dialog(alice).locator('.evidence-form');
      await contribution.locator('[name=outcome]').selectOption('success');
      await contribution.locator('[name=evaluatedOn]').fill(TODAY);
      await contribution.locator('[name=details]').fill('Actual redacted school evaluation ' + RUN);
      const before = writes.length;
      await contribution.locator('button[type=submit]').click();
      assert.equal(await contribution.locator('[name=consent]').evaluate(node => node.validity.valueMissing), true);
      assert.equal(writes.length, before, 'Required publication consent must block the request');
      aliceReport = await publishOutcome(alice);
      await status(alice, 'student-reported', 1);
      const card = dialog(alice).locator('[data-evidence-id="' + aliceReport.id + '"]');
      assert.match(await card.innerText(), new RegExp(alice.alias));
      assert.match(await card.locator('.evidence-details').innerText(), /Redacted A & B/);
      assert.equal(await card.locator('time').getAttribute('datetime'), TODAY);
      assert.equal(await card.locator('.evidence-proof a').getAttribute('target'), '_blank');
      assert.equal(await card.locator('.evidence-proof a').getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await card.locator('[data-flag-evidence]').count(), 0, 'An author cannot flag their own outcome');
      assert.deepEqual(await localLearning(alice), ledger);
      assert(!JSON.stringify(await evidence(anonymous)).includes('PRIVATE-' + RUN));
    });

    await journey('replacing one account report keeps one vote of evidence and one reviewed proof cannot verify', async () => {
      const replaced = await publishOutcome(alice, 'success', 'Updated, redacted school evaluation ' + RUN);
      assert.equal(replaced.id, aliceReport.id);
      let result = await evidence(alice);
      assert.equal(result.summary.reportCount, 1);
      assert.equal(result.summary.recentSuccesses, 1);
      assert.equal(result.summary.reviewedSuccesses, 0);
      await review(aliceReport);
      await openTarget(alice, COURSE);
      await status(alice, 'student-reported', 1);
      result = await evidence(alice);
      assert.equal(result.summary.reviewedSuccesses, 1);
      assert.deepEqual(await localLearning(alice), ledger);
    });

    await journey('two distinct recent, moderator-reviewed public proofs earn the real green worksheet badge', async () => {
      await worksheet(bob);
      await bob.page.locator('[data-provider=enc1010]').selectOption('Sophia');
      await openCourse(bob);
      bobReport = await publishOutcome(bob);
      await status(bob, 'student-reported', 2);
      assert.equal((await evidence(bob)).summary.reviewedSuccesses, 1);
      await review(bobReport);
      await openTarget(bob, COURSE);
      await status(bob, 'community-verified', 2);
      assert.equal((await evidence(bob)).summary.reviewedSuccesses, 2);
      await worksheet(alice);
      await alice.page.locator('[data-requirement=enc1010] .evidence-community-verified').waitFor();
      assert.deepEqual(await localLearning(alice), ledger, 'Community proof must never award private planner credits');
    });

    await journey('catalog years, provider courses, and programs keep their outcomes separate in the UI', async () => {
      await openCourse(alice);
      await dialog(alice).locator('[name=evidenceCatalogYear]').selectOption(OTHER_YEAR.catalogYear);
      await status(alice, 'unreported', 0);
      assert.equal((await evidence(alice, OTHER_YEAR)).summary.reviewedSuccesses, 0);
      await closeEvidence(alice);
      await alice.page.locator('[data-provider=enc1010]').selectOption('CLEP');
      await alice.page.locator('[data-course=enc1010]').selectOption(OTHER_SOURCE.courseId);
      await openCourse(alice);
      await status(alice, 'unreported', 0);
      await closeEvidence(alice);
      await useProgram(alice, OTHER_PROGRAM.programId);
      await alice.page.locator('[data-provider=engl-101]').selectOption('Sophia');
      await openCourse(alice, 'engl-101');
      await status(alice, 'unreported', 0);
      assert.equal((await evidence(alice, OTHER_PROGRAM)).summary.reportCount, 0);
      await closeEvidence(alice);
      await useProgram(alice, COURSE.programId);
      await alice.page.locator('[data-provider=enc1010]').selectOption('Sophia');
      await openCourse(alice);
      await status(alice, 'community-verified', 2);
    });

    await journey('an unresolved flag or changed school outcome suspends verification until the actual issue is resolved', async () => {
      const card = dialog(alice).locator('[data-evidence-id="' + bobReport.id + '"]');
      await card.locator('[data-flag-evidence]').click();
      await card.locator('.evidence-flag-form [name=reason]').fill('Please check the exact dated placement in this public proof. ' + RUN);
      const flagged = alice.page.waitForResponse(response => new URL(response.url()).pathname === '/api/community/evidence/' + bobReport.id + '/flags');
      await card.locator('.evidence-flag-form button[type=submit]').click();
      assert.equal((await flagged).status(), 201);
      await status(alice, 'student-reported', 2);
      assert.equal((await evidence(alice)).summary.reviewedSuccesses, 1);
      await review(bobReport);
      await openTarget(alice, COURSE);
      await status(alice, 'community-verified', 2);
      await openTarget(bob, COURSE);
      await publishOutcome(bob, 'changed', 'The school required a different placement. ' + RUN);
      await status(bob, 'mixed', 2);
      assert.equal((await evidence(bob)).summary.recentConflicts, 1);
      await publishOutcome(bob, 'success', 'A corrected redacted evaluation supports the exact placement. ' + RUN);
      await status(bob, 'student-reported', 2);
      assert.equal((await evidence(bob)).summary.reviewedSuccesses, 1, 'Every replacement must reset review');
      await review(bobReport);
      await openTarget(bob, COURSE);
      await status(bob, 'community-verified', 2);
    });

    await journey('the owner cannot review their own school report', async () => {
      await closeEvidence(owner);
      await openTarget(owner, OTHER_SOURCE);
      const ownReport = await publishOutcome(owner);
      await openQueue();
      const ownCard = dialog(owner).locator('[data-review-evidence-id="' + ownReport.id + '"]');
      await ownCard.waitFor();
      assert.match(await ownCard.innerText(), /Another moderator must review your own report/);
      assert.equal(await ownCard.locator('[data-evidence-review]').count(), 0);
      assert.equal((await evidence(owner, OTHER_SOURCE)).summary.reviewedSuccesses, 0);
    });

    await journey('published-plan proof follows the exact curriculum fingerprint and real course edits invalidate it', async () => {
      publicPayload = { kind:'plan', context:'program:' + model.id, title:'Evidence curriculum ' + RUN, body:'An intentionally public proposed course map. ' + RUN, plan:actualPlan(), publishPublicPlan:true };
      planPost = (await good(alice, '/posts', { method:'POST', body:publicPayload })).item;
      const target = { kind:'plan', postId:planPost.id, catalogYear:YEAR };
      await openPlan(alice);
      const first = await publishOutcome(alice, 'success', 'The final evaluation completed this exact public curriculum. ' + RUN);
      await openPlan(bob);
      const second = await publishOutcome(bob, 'success', 'Degree conferral followed this exact public curriculum. ' + RUN);
      await review(first); await review(second);
      await openPlan(alice);
      await status(alice, 'community-verified', 2);
      const previous = await evidence(alice, target);
      assert.match(previous.curriculumFingerprint, /^[a-f0-9]{64}$/);
      publicPayload = { ...publicPayload, title:publicPayload.title + ' revised', body:'Discussion text changed; the curriculum stays identical. ' + RUN };
      await good(alice, '/posts/' + planPost.id, { method:'PATCH', body:publicPayload });
      assert.equal((await evidence(alice, target)).curriculumFingerprint, previous.curriculumFingerprint);
      assert.equal((await evidence(alice, target)).summary.status, 'community-verified');
      const replacement = model.requirements.find(row => row.id === 'enc1010').options.find(option => option.id === 'tesu-enc1010');
      publicPayload = { ...publicPayload, plan:{ ...publicPayload.plan, courses:publicPayload.plan.courses.map(course => course.requirementId === 'enc1010' ? { ...course, courseId:replacement.id, title:replacement.title, provider:replacement.provider, url:replacement.url } : course) } };
      await good(alice, '/posts/' + planPost.id, { method:'PATCH', body:publicPayload });
      const changed = await evidence(alice, target);
      assert.notEqual(changed.curriculumFingerprint, previous.curriculumFingerprint);
      assert.equal(changed.summary.status, 'unreported');
      assert.equal(changed.summary.reportCount, 0);
      assert.equal(changed.own, null);
      await openPlan(alice);
      await status(alice, 'unreported', 0);
      assert.equal((await evidence(alice)).summary.status, 'community-verified', 'A plan edit must not affect a course placement scope');
      assert.deepEqual(await localLearning(alice), ledger);
    });

    await journey('copying a published plan carries attribution into the next public preview without copying evidence or private learning', async () => {
      const beforeLearning = await localLearning(bob);
      await bob.page.goto(url('/community.html?tab=feed&post=' + planPost.id), { waitUntil:'networkidle' });
      const beforeWrites = writes.length;
      await bob.page.locator('#thread-dialog').getByRole('link', { name:'Make a copy of this plan' }).click();
      await completeProfileSteps(bob.page);
      await bob.page.waitForFunction(({key,context})=>JSON.parse(localStorage.getItem(key))?.templateOrigin?.context===context,{key:KEY,context:'post:'+planPost.id});
      await bob.page.goto(url('/plan.html?editor=1'),{waitUntil:'networkidle'});
      await bob.page.locator('[data-requirement=enc1010]').waitFor();
      assert.deepEqual(await localLearning(bob), beforeLearning);
      await bob.page.locator('[data-action=more]').click();
      await bob.page.locator('#sheet-dialog [data-action=share]').click();
      await bob.page.locator('#publish-dialog .share-preview').waitFor();
      const description = await bob.page.locator('#publish-dialog [name=body]').inputValue();
      assert(description.includes('Adapted from a shared DegreeSteps route: ' + ORIGIN + '/community.html?tab=feed&post=' + planPost.id));
      assert.equal(await bob.page.locator('#publish-dialog .evidence-community-verified').count(), 0);
      assert(!(await bob.page.locator('#publish-dialog').innerText()).includes('PRIVATE-' + RUN));
      assert.equal(writes.length, beforeWrites, 'A copy and public preview must not publish anything automatically');
      await bob.page.locator('#publish-dialog [data-cancel-publish]').click();
    });

    await journey('mobile outcome drawers fit 390px and 320px screens, trap keyboard focus, and restore their trigger', async () => {
      const mobile = await actor('mobile', { width:390, height:844 });
      const trigger = mobile.page.locator('[data-requirement=enc1010] [data-outcome-row]');
      await trigger.waitFor();
      await trigger.click();
      await status(mobile, 'community-verified', 2);
      for (const width of [390, 320]) {
        await mobile.page.setViewportSize({ width, height:844 });
        await noOverflow(mobile.page);
        const bounds = await dialog(mobile).boundingBox();
        assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, JSON.stringify(bounds));
        for (let index = 0; index < 12; index++) {
          await mobile.page.keyboard.press('Tab');
          assert.equal(await dialog(mobile).evaluate(node => node.contains(document.activeElement)), true);
        }
      }
      await dialog(mobile).locator('.evidence-close').click();
      assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
      await noOverflow(mobile.page);
    });

    assert.deepEqual(errors, [], 'Browser scripts must not raise uncaught errors');
    console.log('\n' + journeyCount + ' real community-evidence browser journeys passed.');
  } finally {
    const cleanupErrors = [];
    for (const { actor:person, id } of reports.values()) {
      const removed = await api(person, '/evidence/' + id, { method:'DELETE' }).catch(error => ({ ok:false, error:error.message }));
      if (!removed.ok && removed.status !== 404) cleanupErrors.push('evidence ' + id + ': ' + JSON.stringify(removed));
    }
    if (planPost) {
      const removed = await api(alice, '/posts/' + planPost.id, { method:'DELETE' }).catch(error => ({ ok:false, error:error.message }));
      if (!removed.ok && removed.status !== 404) cleanupErrors.push('post: ' + JSON.stringify(removed));
    }
    for (const person of [alice, bob, owner].filter(Boolean)) {
      if (!person.originalAlias) continue;
      const restored = await api(person, '/profile', { method:'POST', body:{ alias:person.originalAlias } }).catch(error => ({ ok:false, error:error.message }));
      if (!restored.ok) cleanupErrors.push('alias ' + person.label + ': ' + JSON.stringify(restored));
    }
    for (const ctx of contexts) await ctx.close();
    await browser?.close();
    if (cleanupErrors.length) {
      console.error('Local preview cleanup failed:\n' + cleanupErrors.join('\n'));
      process.exitCode = 1;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
