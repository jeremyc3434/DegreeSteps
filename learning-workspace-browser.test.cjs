/* Real Chromium against the shipped UI and stateful synthetic account APIs.
 * No external AI, payment, source-fetch, email or production writes occur.
 * This verifies interface behavior; it does not measure learning efficacy or real AI quality. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = __dirname, staticRoot = path.join(root, 'dist');
const screenshotRoot = path.join(root, 'outputs', 'learning', 'browser');
fs.mkdirSync(screenshotRoot, { recursive: true });
const contexts = [], errors = [];
let browser, passed = 0;
const origin = 'https://learning.degreesteps.test';
const stamp = Date.UTC(2026, 10, 28, 12);
const copy = value => JSON.parse(JSON.stringify(value));
const itemFromPath = (items, pathname) => items.find(item => pathname.includes('/' + item.id));

async function check(name, fn) {
  await fn(); passed++; console.log('PASS ' + name);
}
async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(screenshotRoot, name), fullPage: true });
}
async function fixture({ signedIn = true, enabled = true, width = 1440, failFirstRun = false, terminalFailure = false, injectedContent = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1100 }, acceptDownloads: true });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  const state = { writes: [], reads: [], courses: [], projects: [], runs: new Map(), runCalls: 0, modelCalls: 0, failFirstRun };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/api/')) {
      let filename;
      try { filename = path.resolve(staticRoot, '.' + decodeURIComponent(url.pathname)); } catch { return route.fulfill({ status: 400, body: 'Invalid path' }); }
      if (!filename.startsWith(staticRoot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return route.fulfill({ status: 404, body: 'Not found' });
      const type = filename.endsWith('.js') || filename.endsWith('.mjs') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.json') ? 'application/json' : filename.endsWith('.svg') ? 'image/svg+xml' : filename.endsWith('.png') ? 'image/png' : filename.endsWith('.ico') ? 'image/x-icon' : 'text/html';
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(filename) });
    }
    const p = url.pathname, method = request.method();
    const data = method === 'GET' ? null : JSON.parse(request.postData() || '{}');
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }, body: JSON.stringify(body) });
    if (data) state.writes.push({ path: p, method, body: copy(data), headers: request.headers() }); else state.reads.push(p);
    if (p === '/api/auth/session' || p === '/api/portal/session') return json({ user: signedIn ? { id: 'sb-11111111-1111-4111-8111-111111111111', alias: 'Avery', displayName: 'Avery' } : null, authConfigured: true });
    if (p === '/api/auth/status') return json({ configured: true, providers: ['email', 'google'] });
    if (p === '/api/learning/status') return json({ enabled, signedIn, authenticated: signedIn, user: signedIn ? { id: 'sb-11111111-1111-4111-8111-111111111111', displayName: 'Avery' } : null, storageReady: true, aiConfigured: true, kinds: ['writing', 'study', 'quiz', 'flashcards', 'presentation', 'discussion'], actions: ['plan', 'draft', 'review', 'study', 'quiz', 'flashcards', 'presentation', 'discussion'], limits: { courses: 30, projects: 100, syllabus: 24000, prompt: 12000 }, billing: { checkoutEnabled: false, available: true, trial: true }, allowances: { writingProjects: { remaining: 2, total: 2 }, studyQuestions: { remaining: 50, total: 50 } } });
    if (p.startsWith('/api/learning/billing')) return json({ checkoutEnabled: false, paymentsEnabled: false, pilotEnabled: true, enabled: true, available: true, preview: true, currency: 'usd', products: [], usage: { projectsRemaining: 2, studyQuestionsRemaining: 50 }, balances: { writingProjects: 2, studyQuestions: 50 }, message: 'Payments are not enabled. No payment is required for this preview.' });
    if (!signedIn && p.startsWith('/api/learning/')) return json({ error: 'Sign in to open your private course workspace.', code: 'sign_in_required' }, 401);
    if (p === '/api/learning/courses' && method === 'GET') return json({ items: copy(state.courses) });
    if (p === '/api/learning/courses' && method === 'POST') {
      const item = { id: '00000000-0000-4000-8000-' + String(state.courses.length + 1).padStart(12, '0'), ...data, revision: 1, createdAt: stamp, updatedAt: stamp };
      state.courses.push(item); return json({ item: copy(item) }, 201);
    }
    if (/^\/api\/learning\/courses\/[^/]+$/.test(p)) {
      const item = itemFromPath(state.courses, p);
      if (!item) return json({ error: 'Course not found.' }, 404);
      if (method === 'PATCH') { if (data.revision !== item.revision) return json({ error: 'This course changed. Refresh before saving.', code: 'revision_conflict' }, 409); Object.assign(item, data, { revision: item.revision + 1, updatedAt: stamp + 1 }); }
      if (method === 'DELETE') { state.courses = state.courses.filter(course => course !== item); state.projects = state.projects.filter(project => project.courseId !== item.id); return json({ deleted: true }); }
      return json({ item: copy(item) });
    }
    if (p === '/api/learning/projects' && method === 'GET') return json({ items: copy(state.projects.filter(project => !url.searchParams.get('courseId') || project.courseId === url.searchParams.get('courseId'))) });
    if (p === '/api/learning/projects' && method === 'POST') {
      const item = { id: '10000000-0000-4000-8000-' + String(state.projects.length + 1).padStart(12, '0'), ...data, revision: 1, artifact: null, status: 'draft', createdAt: stamp, updatedAt: stamp };
      state.projects.push(item); return json({ item: copy(item) }, 201);
    }
    if (/^\/api\/learning\/projects\/[^/]+(?:\/run)?$/.test(p)) {
      const item = itemFromPath(state.projects, p);
      if (!item) return json({ error: 'Assignment not found.' }, 404);
      if (p.endsWith('/run')) {
        state.runCalls++;
        if (state.runs.has(data.requestId)) return json(copy(state.runs.get(data.requestId)));
        if (state.failFirstRun) { state.failFirstRun = false; if (terminalFailure) item.revision++; return json({ error: 'We could not finish this request. Your assignment is saved. Try again.', code: 'provider_unavailable', ...(terminalFailure ? { retryMode: 'new-request', projectRevision: item.revision } : {}) }, 503); }
        if (data.revision !== item.revision) return json({ error: 'Refresh the saved assignment before continuing.', code: 'revision_conflict' }, 409);
        state.modelCalls++;
        const content = injectedContent ? '<img src=x onerror="window.__learningXss=true"><script>window.__learningXss=true</script>' : data.action === 'plan' ? 'Build a recommendation, compare the alternatives, and support your reasoning with the assigned reading.' : data.action === 'draft' ? 'The student recommends a flexible work policy because it can improve retention while preserving service quality. Evaluate the evidence and address the strongest objection.' : data.action === 'review' ? 'Your recommendation is clear. Support the retention claim with a specific source passage and explain its limitations.' : data.action === 'quiz' ? 'Question 1: What is the difference between revenue and profit?\nExplain your answer before checking it.' : data.action === 'flashcards' ? 'Front: Opportunity cost\nBack: The value of the next-best alternative you give up.' : data.action === 'presentation' ? 'Slide 1: Recommendation\nSlide 2: Evidence\nSpeaker notes: Explain how the evidence supports the recommendation.' : data.action === 'discussion' ? 'Connect the course concept to an example you can explain from your experience.' : 'Revenue is the amount earned from sales. Profit is what remains after subtracting expenses. Try a new example using these two ideas.';
        item.artifact = { summary: data.action === 'plan' ? 'Your assignment plan is ready.' : 'Your next course step is ready.', content, questions: data.action === 'plan' ? [{ id: 'q1', question: 'Which recommendation would you make, and why?', why: 'Your judgment determines the argument.' }] : [], sources: [{ id: 'S1', title: 'Assigned course reading', url: 'https://example.edu/reading' }], checks: [{ label: 'Source coverage', status: 'limited', detail: 'Compared with supplied source passages only. This is not a comprehensive plagiarism check.' }], nextStep: data.action === 'plan' ? 'Add your reasoning to build the draft.' : 'Explain the main idea in your own words.' };
        Object.assign(item.artifact, { action: data.action, sourceChecks: { coverage: 'Compared with supplied source passages only. This is not a comprehensive plagiarism check.', checkedSources: [{ id: 'S1', status: 'provided' }], overlaps: [], claimSupportVerified: false }, ...(data.action === 'quiz' ? { quiz: [{ question: 'What is profit?', choices: ['All sales revenue', 'Revenue minus expenses'], answerIndex: 1, explanation: 'Profit remains after expenses are subtracted from revenue.' }] } : {}), ...(data.action === 'flashcards' ? { flashcards: [{ front: 'Opportunity cost', back: 'The value of the next-best alternative you give up.' }] } : {}), ...(data.action === 'presentation' ? { slides: [{ title: 'Recommendation', bullets: ['Flexible schedules', 'Shared service hours'], speakerNotes: 'Explain how the evidence supports the recommendation.' }] } : {}) });
        item.revision++; item.status = 'ready'; item.updatedAt = stamp + state.modelCalls;
        const response = { item: copy(item), action: data.action, usage: { inputTokens: 400, outputTokens: 200 }, remaining: { writingProjects: 1, studyQuestions: 49 } };
        state.runs.set(data.requestId, response); return json(response);
      }
      if (method === 'PATCH') { if (data.revision !== item.revision) return json({ error: 'Refresh the saved assignment before continuing.', code: 'revision_conflict' }, 409); Object.assign(item, data, { revision: item.revision + 1 }); }
      if (method === 'DELETE') { state.projects = state.projects.filter(project => project !== item); return json({ deleted: true }); }
      return json({ item: copy(item) });
    }
    if (/^\/api\/learning\/projects\/[^/]+\/history(?:\/[^/]+)?$/.test(p)) {
      const project = itemFromPath(state.projects, p);
      if (!project) return json({ error: 'Assignment not found.' }, 404);
      const rows = [...state.runs].filter(([, run]) => run.item.id === project.id).map(([id, run]) => ({ id, projectId: project.id, action: run.action, status: 'completed', createdAt: stamp, updatedAt: stamp, artifact: run.item.artifact }));
      const id = p.split('/history/')[1];
      return id ? json({ item: rows.find(row => row.id === id) }) : json({ items: rows.map(({ artifact, ...row }) => row) });
    }
    if (p === '/api/growth/events') return json({ accepted: true });
    if (p === '/api/coach/status') return json({ enabled: false });
    if (p === '/api/community/session') return json({ user: signedIn ? { id: 'sb-student', alias: 'Avery' } : null });
    return json({ error: 'Unexpected synthetic API route: ' + p }, 404);
  });
  await page.goto(origin + '/learn.html', { waitUntil: 'networkidle' });
  return { context, page, state };
}
async function createCourse(page) {
  await page.locator('#learning-add-course').click();
  await page.locator('#learning-course-form [name="title"]').fill('Business 101');
  await page.locator('#learning-course-form [name="provider"]').fill('Example College');
  await page.locator('#learning-course-form [name="syllabus"]').fill('Business 101. Assignment: recommend a workplace policy and support it with evidence. Final assessment: June 20.');
  await page.locator('#learning-course-save').click();
  await page.locator('#learning-course-title').filter({ hasText: 'Business 101' }).waitFor();
}
async function createProject(page, kind = 'writing') {
  if (await page.locator('#learning-project-view').isVisible()) await page.locator('#learning-back-projects').click();
  await page.locator('#learning-new-project').click();
  await page.locator('#learning-project-form [name="kind"]').selectOption(kind);
  await page.locator('#learning-project-form [name="title"]').fill(kind === 'writing' ? 'Workplace policy recommendation' : 'Business concepts ' + kind);
  await page.locator('#learning-project-form [name="prompt"]').fill('Recommend a workplace policy. Compare an alternative and support the recommendation with the course reading.');
  if (!await page.locator('#learning-project-form details.learning-new-details').evaluate(details => details.open)) await page.locator('#learning-project-form details.learning-new-details summary').click();
  await page.locator('#learning-project-form [name="rubric"]').fill('Clear recommendation, supporting evidence, thoughtful counterargument.');
  await page.locator('#learning-project-form [name="studentNotes"]').fill('I favor flexible work because my team retained experienced colleagues when schedules became more flexible.');
  await page.locator('#learning-project-create').click();
  await page.locator('#learning-result-content').filter({ hasText: /recommendation|Revenue|Opportunity cost|Question 1|Slide 1|Connect the course/ }).waitFor();
  if (['presentation', 'discussion'].includes(kind)) {
    await page.locator('[data-run-action="' + kind + '"]').click();
    await page.locator('#learning-result-content').filter({ hasText: kind === 'presentation' ? 'Slide 1' : 'Connect the course concept' }).waitFor();
  }
  if (kind === 'writing') await screenshot(page, 'degreesteps-learning-' + page.viewportSize().width + '.png');
}

(async () => {
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], timeout: 15000 });

    await check('signed-out visitors see a clear sign-in route and no private writes', async () => {
      const { page, state } = await fixture({ signedIn: false });
      await page.locator('#learning-signin').waitFor();
      assert(await page.locator('#learning-signin-link').getAttribute('href'));
      assert(!await page.locator('#learning-workspace').isVisible());
      assert.equal(state.writes.filter(write => write.path.startsWith('/api/learning/')).length, 0);
      assert.equal(state.reads.filter(p => p === '/api/learning/courses').length, 0);
    });

    await check('course, syllabus and a student-led writing project remain saved across reload', async () => {
      const { page, state } = await fixture();
      await createCourse(page); await createProject(page);
      assert.equal(state.courses.length, 1); assert.match(state.courses[0].syllabus, /Final assessment/);
      assert.match(state.projects[0].studentNotes, /experienced colleagues/);
      await page.locator('[data-question-answer]').first().fill('I recommend flexible schedules, while requiring shared service hours so customers still receive timely help.');
      await page.locator('#learning-build-draft').click();
      await page.locator('#learning-result-content').filter({ hasText: 'The student recommends' }).waitFor();
      const saved = state.projects[0];
      assert.match(saved.studentNotes, /shared service hours/);
      await page.locator('[data-run-action="review"]').click();
      await page.locator('#learning-result-content').filter({ hasText: 'Your recommendation is clear' }).waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-open-course="' + saved.courseId + '"]').click();
      await page.locator('[data-open-project="' + saved.id + '"]').click();
      await page.locator('#learning-result-content').filter({ hasText: 'Your recommendation is clear' }).waitFor();
      const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
      assert(!JSON.stringify(storage).includes('experienced colleagues'));
      assert(!JSON.stringify(storage).includes('shared service hours'));
      for (const write of state.writes.filter(write => write.path.startsWith('/api/learning/'))) assert.equal(write.headers['x-learning-request'], '1');
      assert(state.writes.filter(write => write.path.endsWith('/run')).every(write => typeof write.body.requestId === 'string' && write.body.requestId.length > 10));
    });

    await check('a failed request preserves the project and retries the same request ID', async () => {
      const { page, state } = await fixture({ failFirstRun: true });
      await createCourse(page);
      await page.locator('#learning-new-project').click();
      await page.locator('#learning-project-form [name="title"]').fill('A saved assignment');
      await page.locator('#learning-project-form [name="prompt"]').fill('Explain the most important business concept from this week.');
      await page.locator('#learning-project-create').click();
      await page.locator('#learning-retry').waitFor();
      assert.equal(state.projects.length, 1);
      const first = state.writes.find(write => write.path.endsWith('/run')).body.requestId;
      await page.locator('#learning-retry').click();
      await page.locator('#learning-result-content').waitFor();
      assert.equal(state.writes.filter(write => write.path.endsWith('/run')).at(-1).body.requestId, first);
      assert.equal(state.projects.length, 1); assert.equal(state.modelCalls, 1);
    });

    await check('a confirmed terminal failure starts a new attempt without duplicating the project', async () => {
      const { page, state } = await fixture({ failFirstRun: true, terminalFailure: true });
      await createCourse(page);
      await page.locator('#learning-new-project').click();
      await page.locator('#learning-project-form [name="title"]').fill('A recoverable assignment');
      await page.locator('#learning-project-form [name="prompt"]').fill('Explain how a budget helps a small business.');
      await page.locator('#learning-project-create').click();
      await page.locator('#learning-retry').filter({ hasText: 'Start a new attempt' }).waitFor();
      const first = state.writes.find(write => write.path.endsWith('/run')).body.requestId;
      await page.locator('#learning-retry').click();
      await page.locator('#learning-result-content').waitFor();
      assert.notEqual(state.writes.filter(write => write.path.endsWith('/run')).at(-1).body.requestId, first);
      assert.equal(state.projects.length, 1); assert.equal(state.modelCalls, 1);
    });

    await check('study, quizzes, flashcards, presentations and discussions show distinct useful results', async () => {
      const { page } = await fixture(); await createCourse(page);
      for (const kind of ['study', 'quiz', 'flashcards', 'presentation', 'discussion']) {
        await createProject(page, kind);
        const expected = { study: /Revenue is/, quiz: /Question 1/, flashcards: /Opportunity cost/, presentation: /Slide 1/, discussion: /Connect the course concept/ }[kind];
        assert.match(await page.locator('#learning-result-content').innerText(), expected);
        if (kind === 'quiz') {
          await page.locator('.learning-quiz-question input[value="1"]').check();
          await page.locator('.learning-quiz-question button[type="submit"]').click();
          assert.match(await page.locator('.learning-quiz-feedback').innerText(), /That’s right/);
        }
        if (kind === 'flashcards') {
          await page.locator('#learning-study-cards summary').first().click();
          assert.match(await page.locator('#learning-study-cards').innerText(), /next-best alternative/);
        }
        if (kind === 'presentation') assert.match(await page.locator('#learning-study-cards').innerText(), /Shared service hours/);
      }
    });

    await check('source coverage stays limited and exports contain the actual saved work', async () => {
      const { page } = await fixture(); await createCourse(page); await createProject(page);
      await page.locator('#learning-source-checks summary').click();
      assert.match(await page.locator('#learning-source-checks').innerText(), /not a comprehensive plagiarism check/i);
      await page.locator('.learning-export-menu summary').click();
      const download = page.waitForEvent('download');
      await page.locator('#learning-export-text').click();
      const file = await download, filename = await file.path();
      assert.match(fs.readFileSync(filename, 'utf8'), /Build a recommendation/);
      assert.match(file.suggestedFilename(), /\.(?:txt|md)$/);
    });

    await check('generated markup is displayed safely and cannot execute', async () => {
      const { page } = await fixture({ injectedContent: true }); await createCourse(page);
      await page.locator('#learning-new-project').click();
      await page.locator('#learning-project-form [name="title"]').fill('Check rendering');
      await page.locator('#learning-project-form [name="prompt"]').fill('Explain this paragraph with an example.');
      await page.locator('#learning-project-create').click();
      await page.locator('#learning-result-content').waitFor();
      assert.equal(await page.evaluate(() => Boolean(window.__learningXss)), false);
      assert.equal(await page.locator('#learning-result-content script,#learning-result-content img').count(), 0);
    });

    await check('project deletion requires confirmation and removes saved results', async () => {
      const { page, state } = await fixture(); await createCourse(page); await createProject(page);
      await page.locator('#learning-delete-project').click(); await page.locator('#learning-delete-dialog').waitFor();
      assert.equal(state.projects.length, 1);
      await page.locator('#learning-delete-confirm').click();
      await page.waitForFunction(() => !document.getElementById('learning-delete-dialog').open);
      assert.equal(state.projects.length, 0);
    });

    await check('desktop and phone keep readable task controls within the viewport', async () => {
      for (const width of [390, 1440]) {
        const { page } = await fixture({ width }); await createCourse(page); await createProject(page);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow at ' + width);
        const sizes = await page.locator('#learning-main input,#learning-main textarea,#learning-main select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ id: node.id, size: parseFloat(getComputedStyle(node).fontSize) })));
        for (const value of sizes) assert(value.size >= 16, 'small field text: ' + JSON.stringify(value));
        await screenshot(page, 'degreesteps-learning-' + width + '.png');
      }
    });

    assert.deepEqual(errors, []);
    console.log('\n' + passed + ' learning workspace browser journeys passed. Synthetic APIs only; no live quality or cost certification.');
  } catch (error) { console.error(error.stack || error); process.exitCode = 1; const page = contexts.at(-1)?.pages().at(-1); if (page) await screenshot(page, 'degreesteps-learning-failure.png').catch(() => {}); }
  finally { for (const context of contexts) await context.close().catch(() => {}); await browser?.close(); }
})();
