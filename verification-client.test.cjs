const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const source = readFileSync(require.resolve('./dist/verification.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const course = overrides => ({ kind: 'course', programId: 'tesu-bsba', requirementId: 'math', courseId: 'sophia-algebra', catalogYear: '2026-2027', ...overrides });
const plan = overrides => ({ kind: 'plan', postId: 'post-public-plan', catalogYear: '2026-2027', ...overrides });
const outcome = overrides => ({ outcome: 'success', evaluatedOn: '2026-01-10', details: 'The school accepted this course for this requirement.', evidenceUrl: '', consent: true, ...overrides });

function load(options = {}) {
  const calls = [], events = [];
  let storageReads = 0;
  const community = {
    api: async (path, opts) => { calls.push({ path, opts }); return options.api ? options.api(path, opts) : { items: [] }; },
    getSession: async () => options.user || null,
    safeLink: value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2048 ? url.href : ''; } catch (_) { return ''; } },
    signinLink: label => '<a href="/signin-with-chatgpt?return_to=%2Findex.html" target="_top">' + label + '</a>'
  };
  const root = { DegreeCommunity: community, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, ...options.root };
  Object.defineProperty(root, 'localStorage', { get() { storageReads++; throw new Error('Private planner storage must not be inspected'); } });
  vm.runInContext(source, vm.createContext({ window: root, URL, Date, console }), { filename: 'verification.js' });
  return { client: root.DegreeEvidence, calls, events, root, storageReads: () => storageReads };
}

test('initialization, badge rendering, and payload preparation never inspect private planner storage or publish', () => {
  const { client, calls, storageReads } = load();
  client.badgeHTML({ status: 'unreported', reportCount: 0 });
  client.reportPayload(course({ notes: 'Private note', transcript: 'Private transcript' }), outcome({ profile: { email: 'private@example.org' } }));
  assert.equal(calls.length, 0);
  assert.equal(storageReads(), 0);
});

test('targets preserve the exact catalog and only the public placement or published-post identity', () => {
  const { client } = load();
  const input = course({ status: 'confirmed', schoolId: 'private-school', notes: 'Private note', learning: [{ name: 'Private person' }] });
  assert.deepEqual(plain(client.normalizeTarget(input)), course());
  assert.deepEqual(plain(client.normalizeTarget(plan({ programId: 'some-builder', courses: ['private-course'], curriculumFingerprint: 'client-cannot-choose-this' }))), plan());
  assert.equal(input.notes, 'Private note');
  assert.equal(client.normalizeTarget(course({ catalogYear: '2026' })).catalogYear, '2026');
  for (const bad of [null, {}, course({ kind: 'school' }), course({ requirementId: '' }), course({ courseId: '<script>' }), plan({ postId: '' }), course({ catalogYear: '2026-2028' }), course({ catalogYear: '1899-1900' })]) assert.throws(() => client.normalizeTarget(bad));
});

test('report payload requires a real dated school outcome and explicit publication consent', () => {
  const { client } = load();
  for (const values of [outcome({ consent: false }), outcome({ consent: 'true' }), outcome({ outcome: 'finished-sophia' }), outcome({ evaluatedOn: '' }), outcome({ evaluatedOn: '2026-02-30' }), outcome({ evaluatedOn: '2199-01-01' }), outcome({ details: '' }), outcome({ details: 'x'.repeat(1001) })]) assert.throws(() => client.reportPayload(course(), values));
  assert.deepEqual(plain(client.reportPayload(course(), outcome())), { target: course(), outcome: 'success', evaluatedOn: '2026-01-10', details: 'The school accepted this course for this requirement.', consent: true });
  assert.equal(client.reportPayload(plan(), outcome({ outcome: 'changed' })).outcome, 'changed');
});

test('payload serialization whitelists public report fields and validates optional public proof links', () => {
  const { client } = load();
  const payload = client.reportPayload(plan({ notes: 'Private draft' }), outcome({ evidenceUrl: 'https://example.org/redacted-evaluation', role: 'moderator', reviewStatus: 'reviewed', transcript: 'Private transcript', author: { email: 'private@example.org' }, curriculumFingerprint: 'forged' }));
  assert.deepEqual(Object.keys(payload).sort(), ['target', 'outcome', 'evaluatedOn', 'details', 'evidenceUrl', 'consent'].sort());
  assert.equal(payload.evidenceUrl, 'https://example.org/redacted-evaluation');
  assert.doesNotMatch(JSON.stringify(payload), /Private|private@example|reviewed|moderator|forged/);
  for (const url of ['javascript:alert(1)', 'data:text/plain,proof', '/private-transcript', 'https://user:password@example.org/proof']) assert.throws(() => client.reportPayload(course(), outcome({ evidenceUrl: url })));
});

test('badges show actual counts and reserve green verification styling for the server verified status', () => {
  const { client } = load();
  const verified = client.badgeHTML({ status: 'community-verified', reportCount: 2 }, { button: true });
  assert.match(verified, /<button type="button"/);
  assert.match(verified, /evidence-community-verified/);
  assert.match(verified, /Community verified · 2 reports/);
  assert.match(verified, /School acceptance is not guaranteed/);
  for (const status of ['student-reported', 'mixed', 'outdated', 'unreported', '<img src=x onerror=evil>']) {
    const html = client.badgeHTML({ status, reportCount: 1 });
    assert.doesNotMatch(html, /evidence-community-verified|<img/);
    assert.match(html, /1 report/);
    assert.doesNotMatch(html, /1 reports/);
  }
  assert.match(client.badgeHTML(null), /No reports yet/);
  assert.doesNotMatch(client.badgeHTML({ status: 'student-reported', reportCount: -100 }), /-100/);
});

test('summary loading batches a program, caches exact catalogs, and ignores unrelated scopes', async () => {
  const a = course(), b = course({ courseId: 'sophia-statistics' });
  const { client, calls } = load({ api: async path => ({ items: [{ target: a, summary: { status: 'student-reported', reportCount: 1 } }, { target: b, summary: { status: 'mixed', reportCount: 2 } }, { target: course({ catalogYear: '2025-2026' }), summary: { status: 'community-verified', reportCount: 10 } }, { target: plan(), summary: { status: 'community-verified', reportCount: 10 } }] }) });
  await Promise.all([client.loadProgram('tesu-bsba', '2026-2027'), client.loadProgram('tesu-bsba', '2026-2027')]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/evidence/summary?programId=tesu-bsba&catalogYear=2026-2027');
  assert.equal(client.getSummary(a).reportCount, 1);
  assert.equal(client.getSummary(b).status, 'mixed');
  assert.equal(client.getSummary(course({ catalogYear: '2025-2026' })), null);
  assert.equal(client.getSummary(plan()), null);
  await client.loadProgram('tesu-bsba', '2026-2027', true);
  assert.equal(calls.length, 2);
});

test('failed summary loads can retry without creating fake empty counts', async () => {
  let count = 0;
  const { client, calls } = load({ api: async () => { if (++count === 1) throw new Error('Temporarily unavailable'); return { items: [] }; } });
  await assert.rejects(() => client.loadProgram('tesu-bsba', '2026-2027'), /unavailable/);
  assert.equal(client.getSummary(course()), null);
  await client.loadProgram('tesu-bsba', '2026-2027');
  assert.equal(calls.length, 2);
  assert.equal(client.getSummary(course()), null);
});

test('a superseded program summary request cannot restore a stale verified badge', async () => {
  const pending = [];
  const { client } = load({ api: () => new Promise(resolve => pending.push(resolve)) });
  const earlier = client.loadProgram('tesu-bsba', '2026-2027');
  const fresh = client.loadProgram('tesu-bsba', '2026-2027', true);
  pending[1]({ items: [{ target: course(), summary: { status: 'mixed', reportCount: 3 } }] });
  await fresh;
  pending[0]({ items: [{ target: course(), summary: { status: 'community-verified', reportCount: 2 } }] });
  await earlier;
  assert.equal(client.getSummary(course()).status, 'mixed');
});

function drawerHarness(user) {
  const submit = { disabled: false }, feedback = { innerHTML: '', textContent: '' }, year = {};
  const form = {
    elements: { outcome: { value: 'success' }, evaluatedOn: { value: '2026-01-10' }, details: { value: 'My school accepted the course in this requirement.' }, evidenceUrl: { value: '' }, consent: { checked: false } },
    reportValidity: () => true,
    querySelector: selector => selector === '[type=submit]' ? submit : feedback
  };
  const content = {
    innerHTML: '',
    querySelector: selector => ['[name=evidenceCatalogYear]', '[name=evidenceReviewFilter]'].includes(selector) ? year : selector === '.evidence-form' ? user ? form : null : null,
    querySelectorAll: () => []
  };
  const close = {}, dialog = { open: false, querySelector: selector => selector === '#evidence-content' ? content : close, showModal() { this.open = true; }, close() { this.open = false; }, setAttribute() {} };
  const events = [], doc = { activeElement: null, getElementById: () => dialog, querySelectorAll: () => [], dispatchEvent: event => events.push(event) };
  return { form, content, dialog, submit, feedback, doc, events };
}

test('public drawer never publishes on open and unchecked consent prevents every write', async () => {
  const user = { id: 'student-a', alias: 'Alice', role: 'member' }, harness = drawerHarness(user);
  const { client, calls, storageReads } = load({ user, root: { document: harness.doc }, api: async () => ({ summary: { status: 'unreported', reportCount: 0 }, items: [], own: null }) });
  await client.open(course());
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, /^\/evidence\?kind=course&programId=tesu-bsba&requirementId=math&courseId=sophia-algebra&catalogYear=2026-2027&limit=20$/);
  assert.match(harness.content.innerHTML, /name="evidenceCatalogYear"/);
  assert.match(harness.content.innerHTML, /name="consent" required/);
  assert.match(harness.content.innerHTML, /actual transfer evaluation date/);
  assert.doesNotMatch(harness.content.innerHTML, /type="file"/);
  await harness.form.onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.match(harness.feedback.innerHTML, /consent/);
  harness.form.elements.consent.checked = true;
  await harness.form.onsubmit({ preventDefault() {} });
  assert.equal(calls[1].path, '/evidence');
  assert.equal(calls[1].opts.method, 'POST');
  assert.deepEqual(plain(calls[1].opts.body), { target: course(), outcome: 'success', evaluatedOn: '2026-01-10', details: 'My school accepted the course in this requirement.', consent: true });
  assert.equal(calls[2].opts, undefined, 'A successful write refreshes public outcomes');
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0].type, 'degreepath:evidence-updated');
  assert.deepEqual(plain(harness.events[0].detail.target), course());
  assert.equal(storageReads(), 0);
});

test('signed-out drawer keeps report actions behind native sign-in navigation', async () => {
  const harness = drawerHarness(null);
  const { client, calls } = load({ root: { document: harness.doc }, api: async () => ({ summary: { status: 'unreported', reportCount: 0 }, items: [] }) });
  await client.open(plan());
  assert.match(harness.content.innerHTML, /href="\/signin-with-chatgpt[^\"]+" target="_top"/);
  assert.doesNotMatch(harness.content.innerHTML, /class="evidence-form"/);
  assert.equal(calls.length, 1);
  assert.ok(calls.every(call => !call.path.includes('signin')));
});

test('monthly outcome drawers preserve monthly choices and known public plans lock their exact version',async()=>{
 const harness=drawerHarness(null),{client}=load({root:{document:harness.doc},api:async()=>({summary:{status:'unreported',reportCount:0},items:[]})});
 await client.open(course({catalogYear:'202605'}));
 let select=harness.content.innerHTML.match(/<select name="evidenceCatalogYear"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert.match(select,/<option value="202605" selected>202605<\/option>/);assert.doesNotMatch(select,/value="\d{4}-\d{4}"/);
 await client.open(plan({catalogYear:'202605'}),{catalogLocked:true});
 select=harness.content.innerHTML.match(/<select name="evidenceCatalogYear"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert.equal((select.match(/<option/g)||[]).length,1);assert.match(select,/value="202605"/);
});

test('moderation queue hides self-review controls and escapes reported content and flag reasons', async () => {
  const user = { id: 'mod-a', alias: 'Moderator', role: 'moderator' }, harness = drawerHarness(user);
  const { client, calls } = load({ user, root: { document: harness.doc }, api: async () => ({ items: [{ id: 'report-a', target: plan(), outcome: 'success', evaluatedOn: '2026-01-10', details: '<img src=x onerror=evil>', author: { alias: '<script>Alice</script>', isYou: true }, evidenceUrl: 'javascript:evil()', reviewStatus: 'pending', canReview: false, flagCount: 1, flags: [{ reason: '<script>flag</script>' }] }] }) });
  await client.moderate();
  assert.equal(calls[0].path, '/moderation/evidence?limit=20');
  assert.match(harness.content.innerHTML, /Another moderator must review your own report/);
  assert.doesNotMatch(harness.content.innerHTML, /data-evidence-review=|<script>|<img|href="javascript:/);
  assert.match(harness.content.innerHTML, /&lt;script&gt;flag/);
});

test('member accounts cannot load the moderator queue', async () => {
  const user = { id: 'student-a', alias: 'Alice', role: 'member' }, harness = drawerHarness(user);
  const { client, calls } = load({ user, root: { document: harness.doc } });
  await client.moderate();
  assert.match(harness.content.innerHTML, /Moderator access is required/);
  assert.equal(calls.length, 0);
});
