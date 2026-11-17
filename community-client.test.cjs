const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = readFileSync(require.resolve('./dist/community-client.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load(options = {}) {
  const calls = [], events = [];
  let storageReads = 0;
  const root = {
    location: { pathname: '/index.html', search: '?route=tesu', hash: '#results' },
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      return options.fetch ? options.fetch(url, opts) : response({ user: null });
    },
    dispatchEvent: event => events.push(event),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    ...(options.root || {})
  };
  Object.defineProperty(root, 'localStorage', { get() { storageReads++; throw new Error('Private local draft storage must not be read automatically'); } });
  const context = vm.createContext({ window: root, URL, Date, console });
  vm.runInContext(source, context, { filename: 'community-client.js' });
  return { client: root.DegreeCommunity, calls, events, root, storageReads: () => storageReads };
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function course(overrides = {}) {
  return { requirementId: 'math', requirement: 'Math requirement', courseId: 'sophia-algebra', title: 'College Algebra', provider: 'Sophia', credits: 3, url: 'https://www.sophia.org/', ...overrides };
}
function plan(overrides = {}) {
  return { schoolId: 'tesu', schoolName: 'Thomas Edison State University', programId: 'ba-cs', programName: 'BA Computer Science', strategy: 'balanced', totalCredits: 120, courses: [course()], ...overrides };
}
function userArea() { return { innerHTML: '', querySelector() { return {}; } }; }

test('module initialization and safe public previews never read private storage or publish', () => {
  const { client, calls, storageReads } = load();
  const input = plan({ notes: 'Private note', profile: { name: 'Private person' } });
  assert.ok(client.safePlan(input));
  assert.ok(client.planPreview(input));
  assert.equal(storageReads(), 0);
  assert.equal(calls.length, 0);
});

test('community participation uses the shared account page and top-level navigation', async () => {
  const { client } = load({ fetch: async () => response({ user: { id: 'alice', alias: 'Alice', role: 'member' } }) });
  const returnTo = encodeURIComponent('/index.html?route=tesu#results');
  assert.equal(client.signinUrl(), '/account.html');
  assert.equal(client.signoutUrl(), '/account.html');
  assert.match(client.signinLink('Sign in'), /href="\/account.html" target="_top"/);
  const area = userArea();
  await client.mountUserArea(area);
  assert.match(area.innerHTML, /href="\/account.html" target="_top"/);
});

test('API helper permits community-relative paths and rejects external or escaping paths before fetch', async () => {
  const { client, calls } = load({ fetch: async () => response({ items: [], cursor: null }) });
  await client.api('/feed?context=school%3Atesu&limit=20');
  assert.equal(calls[0].url, '/api/community/feed?context=school%3Atesu&limit=20');
  for (const path of ['https://evil.example/x', '//evil.example/x', '/../../private', '/%2e%2e/private', '/feed/../session', '/feed#fragment', '/feed\\private', '', null]) {
    await assert.rejects(() => client.api(path), undefined, String(path));
  }
  assert.equal(calls.length, 1);
});

test('API writes serialize JSON and enforce same-origin credentials and the CSRF header', async () => {
  const { client, calls } = load({ fetch: async () => response({ item: { id: 'post-a' } }) });
  await client.api('/posts', { method: 'POST', credentials: 'include', headers: { 'X-Custom': 'value', 'X-Community-Request': 'wrong' }, body: { title: 'Question', body: 'How?' } });
  const { opts } = calls[0];
  assert.equal(opts.credentials, 'same-origin');
  assert.equal(opts.headers['X-Community-Request'], '1');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.equal(opts.headers.Accept, 'application/json');
  assert.equal(opts.headers['X-Custom'], 'value');
  assert.deepEqual(JSON.parse(opts.body), { title: 'Question', body: 'How?' });
  await client.api('/comments/comment-a', { method: 'DELETE' });
  assert.equal(calls[1].opts.credentials, 'same-origin');
  assert.equal(calls[1].opts.headers['X-Community-Request'], '1');
});

test('API surfaces server, network, and unreadable-service errors', async () => {
  const denied = load({ fetch: async () => response({ error: 'Only the author can edit this post.' }, 403) });
  await assert.rejects(() => denied.client.api('/posts/post-a'), error => error.status === 403 && error.message === 'Only the author can edit this post.');
  const offline = load({ fetch: async () => { throw new Error('Network detail'); } });
  await assert.rejects(() => offline.client.api('/feed'), error => error.status === 0 && /connection|reached/i.test(error.message));
  const invalid = load({ fetch: async () => ({ ok: false, status: 503, json: async () => { throw new Error('HTML response'); } }) });
  await assert.rejects(() => invalid.client.api('/feed'), error => error.status === 503 && /unavailable/i.test(error.message));
});

test('session is cached, explicitly refreshed, and retains the trusted moderation role', async () => {
  let count = 0;
  const { client, calls, events } = load({ fetch: async () => response({ user: ++count === 1 ? { id: 'alice', alias: 'Alice', role: 'owner' } : null }) });
  const [a, b] = await Promise.all([client.getSession(), client.getSession()]);
  assert.equal(a.role, 'owner');
  assert.equal(b, a);
  assert.equal(calls.length, 1);
  assert.equal(client.user.role, 'owner');
  assert.equal(await client.getSession(true), null);
  assert.equal(client.user, null);
  assert.equal(calls.length, 2);
  assert.deepEqual(events.map(event => event.type), ['community:session', 'community:session']);
});

test('failed session loads can retry and member UI does not offer moderation', async () => {
  let count = 0;
  const { client, calls } = load({ fetch: async () => ++count === 1 ? response({ error: 'Try again' }, 503) : response({ user: { id: 'alice', alias: 'Alice', role: 'member' } }) });
  await assert.rejects(() => client.getSession());
  assert.equal((await client.getSession()).role, 'member');
  const area = userArea();
  await client.mountUserArea(area);
  assert.doesNotMatch(area.innerHTML, /data-moderation/);
  assert.equal(calls.length, 2);
});

test('safePlan emits only public course choices and never mutates the private input', () => {
  const { client } = load();
  const input = plan({
    profile: { name: 'Private person', email: 'private@example.org' }, transcript: ['Private transcript'], notes: 'Private notes',
    courses: [
      course({ status: 'planned', notes: 'Private course note', evaluation: { schoolConfirmed: true } }),
      course({ courseId: 'already-completed', status: 'completed' }),
      course({ courseId: 'currently-learning', status: 'in-progress' }),
      course({ courseId: 'currently-learning-2', status: 'in_progress' }),
      course({ courseId: 'currently-learning-3', status: 'inprogress' }),
      course({ courseId: 'school-evaluated', status: 'confirmed' })
    ]
  });
  const before = JSON.stringify(input);
  const result = plain(client.safePlan(input));
  assert.deepEqual(Object.keys(result).sort(), ['schoolId', 'schoolName', 'programId', 'programName', 'strategy', 'totalCredits', 'courses'].sort());
  assert.deepEqual(result.courses, [course()]);
  assert.equal(JSON.stringify(input), before);
  assert.doesNotMatch(JSON.stringify(result), /Private|private@example|completed|currently-learning|schoolConfirmed/);
});

test('safePlan truncates every public string to server limits and limits the valid course list', () => {
  const { client } = load();
  const limits = { schoolId: 100, schoolName: 120, programId: 100, programName: 160, strategy: 60 };
  const courseLimits = { requirementId: 120, requirement: 160, courseId: 120, title: 200, provider: 100 };
  const input = plan();
  for (const key of Object.keys(limits)) input[key] = '  ' + 'x'.repeat(300) + '  ';
  for (const key of Object.keys(courseLimits)) input.courses[0][key] = '  ' + 'x'.repeat(300) + '  ';
  const result = client.safePlan(input);
  for (const [key, limit] of Object.entries(limits)) assert.equal(result[key].length, limit, key);
  for (const [key, limit] of Object.entries(courseLimits)) assert.equal(result.courses[0][key].length, limit, key);
  const many = plan({ courses: [course({ status: 'completed' }), ...Array.from({ length: 105 }, (_, i) => course({ courseId: 'course-' + i }))] });
  assert.equal(client.safePlan(many).courses.length, 100);
});

test('safePlan rejects missing or invalid core fields and drops malformed course rows', () => {
  const { client } = load();
  for (const bad of [null, [], {}, plan({ schoolId: '' }), plan({ schoolName: null }), plan({ programId: 42 }), plan({ programName: '   ' }), plan({ totalCredits: null }), plan({ totalCredits: '120' }), plan({ totalCredits: -1 }), plan({ totalCredits: 501 }), plan({ totalCredits: NaN }), plan({ courses: [] })]) {
    assert.equal(client.safePlan(bad), null, JSON.stringify(bad));
  }
  const mixed = plan({ courses: [null, {}, course({ credits: null }), course({ credits: '3' }), course({ credits: 31 }), course({ requirementId: '' }), course()] });
  assert.deepEqual(plain(client.safePlan(mixed).courses), [course()]);
});

test('context IDs match the server namespace, first-character, type, and length rules', () => {
  const { client } = load();
  for (const context of ['school:tesu', 'program:tesu/ba-cs', 'course:sophia-algebra', 'template:seed-tesu', 'post:123_abc', 'school:' + 'a'.repeat(160)]) assert.equal(client.contextOK(context), true, context);
  for (const context of [null, {}, ['school:tesu'], 'forum:general', 'school:', 'school:_tesu', 'school:.tesu', 'school:-tesu', 'school:tesu?x', 'school:' + 'a'.repeat(161)]) assert.equal(client.contextOK(context), false, String(context));
});

test('all HTML text is escaped and source links accept only bounded HTTP(S) URLs without credentials', () => {
  const { client } = load();
  assert.equal(client.escapeHtml(`<script a="x">&'</script>`), '&lt;script a=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;');
  assert.equal(client.safeLink('http://example.org/source'), 'http://example.org/source');
  assert.equal(client.safeLink('https://example.org/source'), 'https://example.org/source');
  for (const link of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'https://name:password@example.org/', 'https://example.org/' + 'x'.repeat(2048)]) assert.equal(client.safeLink(link), '');
  const html = client.postHTML({ id: 'x" onclick="evil', title: '<img src=x>', body: '<script>evil()</script>', author: { alias: '<b>Alice</b>' }, createdAt: 0 });
  assert.doesNotMatch(html, /<script>|<img|<b>Alice/);
  assert.match(html, /&lt;script&gt;/);
});

test('opening a public-plan preview does not publish, and unchecked consent blocks submission', async () => {
  const nodes = { cancel: {}, submit: { disabled: false }, status: { textContent: '' } };
  const form = {
    elements: { alias: { value: 'Alice' }, title: { value: 'Public course plan' }, body: { value: 'Proposed route' }, kind: { value: 'plan' }, url: { value: '' }, consent: { checked: false } },
    checkValidity: () => false, reportValidity: () => false,
    querySelector: selector => selector === '[data-cancel-publish]' ? nodes.cancel : selector === '[type=submit]' ? nodes.submit : nodes.status
  };
  const content = { innerHTML: '', querySelector: selector => selector === 'form' ? form : null };
  const dialog = { open: false, setAttribute() {}, querySelector: selector => selector === '#publish-dialog-content' ? content : null, showModal() { this.open = true; }, close() { this.open = false; } };
  const { client, calls, storageReads } = load({ root: { document: { getElementById: () => dialog } }, fetch: async url => url.endsWith('/session') ? response({ user: { id: 'alice', alias: 'Alice', role: 'member' } }) : response({ error: 'Unexpected write during preview' }, 500) });
  await client.sharePlan({ plan: plan(), context: 'program:ba-cs' });
  assert.match(content.innerHTML, /name="consent" type="checkbox" required/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/community/session');
  await form.onsubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(calls.length, 1, 'No profile or post write occurs without explicit consent');
  form.elements.consent.checked = true;
  form.checkValidity = () => true;
  await form.onsubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(calls.length, 2, 'An approved form sends exactly one explicit publication request');
  assert.equal(calls[1].url, '/api/community/posts');
  const publication = JSON.parse(calls[1].opts.body);
  assert.equal(publication.publishPublicPlan, true);
  assert.equal(publication.context, 'program:ba-cs');
  assert.deepEqual(publication.plan, plan());
  assert.equal(storageReads(), 0);
});

test('community sign-in resumes the current public discussion without forwarding private or redirect queries',()=>{
  const Return=require('./dist/account-return.js');
  const {client,storageReads}=load({root:{DegreeAccountReturn:Return,location:{origin:'https://degreepath.test',pathname:'/community.html',search:'?tab=feed&post=post-123&context=school%3Aliberty&next=https://evil.invalid&notes=private',hash:'#private'}}});
  const account=new URL(client.signinUrl(),'https://degreepath.test');
  assert.equal(account.pathname,'/account.html');
  assert.equal(account.searchParams.get('returnTo'),'/community.html?tab=feed&post=post-123&context=school%3Aliberty');
  assert.match(client.signinLink(),/target="_top"/);
  assert.equal(storageReads(),0);
});
test('community sign-in returns to approved course or plan pages with personal query details removed',()=>{
  const Return=require('./dist/account-return.js');
  for(const pathname of ['/courses.html','/programs.html','/plan.html','/compare-plans.html','/degree-audit.html']){
    const {client}=load({root:{DegreeAccountReturn:Return,location:{origin:'https://degreepath.test',pathname,search:'?record=private-record&notes=private'}}});
    assert.equal(new URL(client.signinUrl(),'https://degreepath.test').searchParams.get('returnTo'),pathname);
  }
});
test('a temporarily missing return helper falls back to an approved page without forwarding query text',()=>{
  const {client}=load({root:{location:{pathname:'/community.html',search:'?returnTo=https://evil.invalid&post=private'}}});
  assert.equal(client.signinUrl(),'/account.html?returnTo=%2Fcommunity.html');
});
