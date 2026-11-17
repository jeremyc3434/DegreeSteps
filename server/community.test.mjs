import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommunity } from './community.mjs';

const origin = 'https://degreepath.example';
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(schema);
  }
  prepare(sql) {
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\b/i, 'Requests must not perform schema DDL');
    const prepared = this.sqlite.prepare(sql);
    return {
      bind: (...args) => ({
        first: async () => prepared.get(...args) || null,
        all: async () => ({ results: prepared.all(...args) }),
        run: async () => ({ meta: { changes: Number(prepared.run(...args).changes) } })
      })
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}
function fixture(t, environment = {}) {
  const DB = new LocalD1();
  t.after(() => DB.close());
  const env = { DB, ...environment };
  async function call(path, { method = 'GET', user, email, body, headers = {}, ...options } = {}) {
    const requestHeaders = { ...headers };
    if (user) requestHeaders['oai-authenticated-user-id'] = user;
    if (email) requestHeaders['oai-authenticated-user-email'] = email;
    if (method !== 'GET') {
      if (!('Origin' in requestHeaders)) requestHeaders.Origin = origin;
      if (!('X-Community-Request' in requestHeaders)) requestHeaders['X-Community-Request'] = '1';
      requestHeaders['Content-Type'] = 'application/json';
    }
    const request = new Request(`${origin}/api/community${path}`, {
      method, headers: requestHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options
    });
    const response = await handleCommunity(request, env, {});
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const create = async (user = 'alice', overrides = {}) => {
    const result = await call('/posts', { method: 'POST', user, body: question(overrides) });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.item;
  };
  return { DB, env, call, create };
}
function question(overrides = {}) {
  return { kind: 'question', context: 'school:tesu', title: 'Transfer question', body: 'How does this course fit the degree?', ...overrides };
}
function plan() {
  return {
    schoolId: 'tesu', schoolName: 'Thomas Edison State University', programId: 'ba-cs', programName: 'BA Computer Science',
    strategy: 'balanced', totalCredits: 120,
    courses: [{ requirementId: 'math', requirement: 'Math requirement', courseId: 'sophia-algebra', title: 'College Algebra', provider: 'Sophia', credits: 3, url: 'https://www.sophia.org/' }]
  };
}

test('anonymous browsing is empty and does not create fake members', async t => {
  const { call, DB } = fixture(t);
  assert.deepEqual((await call('/session')).body, { user: null });
  const feed = await call('/feed');
  assert.equal(feed.status, 200);
  assert.deepEqual(feed.body, { items: [], cursor: null });
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_users').get().n, 0);
  assert.equal(feed.headers.get('cache-control'), 'no-store');
});

test('writes require identity, same-origin, and the community CSRF header', async t => {
  const { call, DB } = fixture(t);
  assert.equal((await call('/posts', { method: 'POST', body: question() })).status, 401);
  for (const headers of [{ Origin: '' }, { Origin: 'https://attacker.example' }, { 'X-Community-Request': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const result = await call('/posts', { method: 'POST', user: 'alice', body: question(), headers });
    assert.equal(result.status, 403);
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 0);
});

test('trusted sign-in bootstraps a durable owner without persisting or exposing email', async t => {
  const { call, DB, env } = fixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const member = await call('/session', { user: 'alice', email: 'alice@example.org' });
  assert.deepEqual(member.body.user, { id: 'alice', alias: 'Community member', role: 'member' });
  const owner = await call('/session', { user: 'owner-id', email: 'OWNER@example.org' });
  assert.equal(owner.body.user.role, 'owner');
  delete env.COMMUNITY_ADMIN_EMAIL;
  assert.equal((await call('/session', { user: 'owner-id' })).body.user.role, 'owner');
  assert.equal(JSON.stringify(owner.body).includes('example.org'), false);
  const columns = DB.sqlite.prepare('PRAGMA table_info(community_users)').all().map(row => row.name);
  assert.equal(columns.includes('email'), false);
});

test('aliases are explicitly set and public authors omit private IDs and email', async t => {
  const { call, create } = fixture(t);
  assert.equal((await call('/profile', { method: 'POST', user: 'alice', body: { alias: 'Alice Learner' } })).status, 200);
  for (const alias of ['alice@example.org', '<script>', 'A']) {
    assert.equal((await call('/profile', { method: 'POST', user: 'alice', body: { alias } })).status, 400);
  }
  await create();
  const author = (await call('/feed')).body.items[0].author;
  assert.deepEqual(author, { alias: 'Alice Learner', isYou: false });
});

test('authors may edit their own post; other members cannot edit or delete it', async t => {
  const { call, create } = fixture(t);
  const post = await create();
  assert.equal((await call(`/posts/${post.id}`, { method: 'PATCH', user: 'bob', body: question({ title: 'Stolen post' }) })).status, 403);
  assert.equal((await call(`/posts/${post.id}`, { method: 'DELETE', user: 'bob' })).status, 403);
  const edited = await call(`/posts/${post.id}`, { method: 'PATCH', user: 'alice', body: question({ title: 'Updated title' }) });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.item.title, 'Updated title');
  assert.equal((await call(`/posts/${post.id}`, { user: 'bob' })).body.item.canEdit, false);
});

test('public plans require consent and reject private profile, transcript, and course-status fields', async t => {
  const { call, DB } = fixture(t);
  const payload = question({ kind: 'plan', plan: plan() });
  assert.equal((await call('/posts', { method: 'POST', user: 'alice', body: payload })).status, 400);
  for (const invalid of [
    { ...payload, publishPublicPlan: true, profile: { name: 'Private name' } },
    { ...payload, publishPublicPlan: true, plan: { ...plan(), transcript: [] } },
    { ...payload, publishPublicPlan: true, plan: { ...plan(), notes: 'Private notes' } },
    { ...payload, publishPublicPlan: true, plan: { ...plan(), courses: [{ ...plan().courses[0], status: 'completed' }] } }
  ]) assert.equal((await call('/posts', { method: 'POST', user: 'alice', body: invalid })).status, 400);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 0);
  const result = await call('/posts', { method: 'POST', user: 'alice', body: { ...payload, publishPublicPlan: true } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.item.plan, plan());
});

test('input limits, URL schemes, and unsupported fields reject unsafe submissions', async t => {
  const { call } = fixture(t);
  for (const overrides of [
    { title: 'x' }, { body: 'x'.repeat(6001) }, { body: 'bad\u0000text' }, { context: 'unrestricted:forum' },
    { url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.org/' }, { url: 'data:text/html,hello' }, { unknown: true }
  ]) assert.equal((await call('/posts', { method: 'POST', user: 'alice', body: question(overrides) })).status, 400);
  const good = await call('/posts', { method: 'POST', user: 'alice', body: question({ url: 'https://example.org/source' }) });
  assert.equal(good.status, 201);
});

test('reaction set operations are idempotent and scoped to each signed-in user', async t => {
  const { call, create, DB } = fixture(t);
  const post = await create();
  const react = (user, reaction, active) => call(`/posts/${post.id}/reactions`, { method: 'POST', user, body: { reaction, active } });
  assert.equal((await react(undefined, 'like', true)).status, 401);
  await react('alice', 'like', true);
  await react('alice', 'like', true);
  await react('alice', 'upvote', true);
  const bob = await react('bob', 'like', true);
  assert.equal(bob.body.item.likes, 2);
  assert.equal(bob.body.item.upvotes, 1);
  assert.equal(bob.body.item.liked, true);
  assert.equal(bob.body.item.upvoted, false);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reactions').get().n, 3);
  await react('alice', 'like', false);
  await react('alice', 'like', false);
  const publicPost = (await call(`/posts/${post.id}`)).body.item;
  assert.equal(publicPost.likes, 1);
  assert.equal(publicPost.liked, false);
});

test('context comments attach to schools, programs, courses, and editorial templates without fake posts', async t => {
  const { call, DB } = fixture(t);
  for (const context of ['school:tesu', 'program:tesu/ba-cs', 'course:sophia-algebra', 'template:seed-tesu-plan']) {
    const posted = await call('/comments', { method: 'POST', user: 'alice', body: { context, body: `Question about ${context}` } });
    assert.equal(posted.status, 201);
    const listed = await call(`/comments?context=${encodeURIComponent(context)}`);
    assert.equal(listed.body.items.length, 1);
    assert.equal(listed.body.items[0].context, context);
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 0);
});

test('editorial context reactions are per-user, idempotent, and share post reaction counts', async t => {
  const { call, create, DB } = fixture(t);
  const context = 'template:seed-tesu-plan';
  assert.deepEqual((await call(`/context?context=${context}`)).body, { context, likes: 0, upvotes: 0, liked: false, upvoted: false, comments: 0 });
  const react = (user, target, reaction, active = true) => call('/context/reactions', { method: 'POST', user, body: { context: target, reaction, active } });
  assert.equal((await react(undefined, context, 'like')).status, 401);
  await react('alice', context, 'like');
  await react('alice', context, 'like');
  await react('bob', context, 'upvote');
  await call('/comments', { method: 'POST', user: 'alice', body: { context, body: 'A template question' } });
  const summary = await call(`/context?context=${context}`, { user: 'alice' });
  assert.deepEqual(summary.body, { context, likes: 1, upvotes: 1, liked: true, upvoted: false, comments: 1 });
  await react('alice', context, 'like', false);
  await react('alice', context, 'like', false);
  assert.equal((await call(`/context?context=${context}`)).body.likes, 0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 0);
  const post = await create();
  await react('alice', `post:${post.id}`, 'like');
  const duplicate = await call(`/posts/${post.id}/reactions`, { method: 'POST', user: 'alice', body: { reaction: 'like', active: true } });
  assert.equal(duplicate.body.item.likes, 1);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_context_reactions WHERE context=?').get(`post:${post.id}`).n, 0);
});

test('comment replies keep context, require live parents, and enforce ownership', async t => {
  const { call, create } = fixture(t);
  const post = await create();
  const context = `post:${post.id}`;
  const parent = (await call('/comments', { method: 'POST', user: 'alice', body: { context, body: 'Top level comment' } })).body.item;
  assert.equal((await call('/comments', { method: 'POST', user: 'bob', body: { context: 'school:tesu', body: 'Wrong context', parentId: parent.id } })).status, 400);
  const reply = await call('/comments', { method: 'POST', user: 'bob', body: { context, body: 'A helpful reply', parentId: parent.id } });
  assert.equal(reply.status, 201);
  assert.equal((await call('/comments', { method: 'POST', user: 'alice', body: { context, body: 'Too deeply nested', parentId: reply.body.item.id } })).status, 400);
  assert.equal((await call(`/comments/${parent.id}`, { method: 'DELETE', user: 'bob' })).status, 403);
  assert.equal((await call(`/comments/${parent.id}`, { method: 'DELETE', user: 'alice' })).status, 200);
  assert.equal((await call('/comments', { method: 'POST', user: 'bob', body: { context, body: 'Deleted parent', parentId: parent.id } })).status, 404);
  assert.equal((await call('/comments?context=post:missing-post')).status, 404);
});

test('post soft deletion removes browse, reaction, and post-comment access', async t => {
  const { call, create, DB } = fixture(t);
  const post = await create();
  assert.equal((await call(`/posts/${post.id}`, { method: 'DELETE', user: 'alice' })).status, 200);
  assert.equal((await call(`/posts/${post.id}`)).status, 404);
  assert.deepEqual((await call('/feed')).body.items, []);
  assert.equal((await call(`/posts/${post.id}/reactions`, { method: 'POST', user: 'bob', body: { reaction: 'like', active: true } })).status, 404);
  assert.equal((await call(`/comments?context=post:${post.id}`)).status, 404);
  assert.ok(DB.sqlite.prepare('SELECT deleted_at FROM community_posts WHERE id=?').get(post.id).deleted_at);
});

test('reports are deduplicated and hidden from ordinary members; owner can review and remove', async t => {
  const { call, create, DB } = fixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const post = await create();
  const report = { targetType: 'post', targetId: post.id, reason: 'Misleading transfer advice' };
  assert.equal((await call('/reports', { method: 'POST', body: report })).status, 401);
  for (let i = 0; i < 2; i++) assert.equal((await call('/reports', { method: 'POST', user: 'bob', body: report })).status, 201);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reports').get().n, 1);
  assert.equal((await call('/moderation/reports')).status, 401);
  assert.equal((await call('/moderation/reports', { user: 'bob' })).status, 403);
  const queue = await call('/moderation/reports', { user: 'owner', email: 'owner@example.org' });
  assert.equal(queue.status, 200);
  assert.equal(queue.body.items.length, 1);
  assert.equal(queue.body.items[0].target.body, post.body);
  assert.equal(JSON.stringify(queue.body).includes('owner@example.org'), false);
  const reportId = queue.body.items[0].id;
  assert.equal((await call(`/moderation/reports/${reportId}`, { method: 'PATCH', user: 'bob', body: { status: 'reviewed', removeTarget: true } })).status, 403);
  assert.equal((await call(`/moderation/reports/${reportId}`, { method: 'PATCH', user: 'owner', body: { status: 'reviewed', removeTarget: true } })).status, 200);
  assert.equal((await call(`/posts/${post.id}`)).status, 404);
  assert.equal((await call('/moderation/reports', { user: 'owner' })).body.items.length, 0);
  assert.equal((await call('/moderation/reports?status=reviewed', { user: 'owner' })).body.items.length, 1);
});

test('only moderators remove another author’s content and cannot edit that author’s post', async t => {
  const { call, create } = fixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const post = await create();
  await call('/session', { user: 'owner', email: 'owner@example.org' });
  assert.equal((await call(`/posts/${post.id}`, { method: 'PATCH', user: 'owner', body: question({ title: 'Moderator rewrite' }) })).status, 403);
  assert.equal((await call(`/posts/${post.id}`, { method: 'DELETE', user: 'owner' })).status, 200);
});

test('feed uses bounded stable cursor pagination and exact context/kind/mine filters', async t => {
  const { call, create } = fixture(t);
  const first = await create('alice');
  const second = await create('bob', { context: 'school:liberty', title: 'Liberty question' });
  const third = await create('alice', { kind: 'template', title: 'Editorial checklist' });
  const page1 = await call('/feed?limit=2');
  assert.equal(page1.body.items.length, 2);
  assert.ok(page1.body.cursor);
  const page2 = await call(`/feed?limit=2&cursor=${encodeURIComponent(page1.body.cursor)}`);
  const ids = [...page1.body.items, ...page2.body.items].map(item => item.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(new Set(ids), new Set([first.id, second.id, third.id]));
  assert.equal(page2.body.cursor, null);
  assert.equal((await call('/feed?context=school:liberty')).body.items[0].id, second.id);
  assert.equal((await call('/feed?kind=template')).body.items[0].id, third.id);
  assert.equal((await call('/feed?mine=1')).status, 401);
  assert.equal((await call('/feed?mine=1', { user: 'alice' })).body.items.length, 2);
  for (const query of ['limit=0', 'limit=51', 'limit=10000', 'cursor=invalid', 'kind=admin']) {
    assert.equal((await call(`/feed?${query}`)).status, 400);
  }
});

test('write rate limits are atomic bounded per-user counters and reset by hour', async t => {
  const { call, DB } = fixture(t);
  await call('/session', { user: 'alice' });
  const bucket = Math.floor(Date.now() / 3600000) * 3600000;
  DB.sqlite.prepare('INSERT INTO community_rate_limits (user_id,action,window_start,count) VALUES (?,?,?,?)').run('alice', 'publish', bucket, 12);
  assert.equal((await call('/posts', { method: 'POST', user: 'alice', body: question() })).status, 429);
  assert.equal(DB.sqlite.prepare('SELECT count FROM community_rate_limits WHERE user_id=? AND action=?').get('alice','publish').count, 12);
  assert.equal((await call('/posts', { method: 'POST', user: 'bob', body: question() })).status, 201);
  DB.sqlite.prepare('UPDATE community_rate_limits SET window_start=? WHERE user_id=? AND action=?').run(bucket - 3600000, 'alice', 'publish');
  assert.equal((await call('/posts', { method: 'POST', user: 'alice', body: question() })).status, 201);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_rate_limits WHERE user_id=? AND action=?').get('alice','publish').n, 1);
});

test('typed record IDs and cursors reject invalid JSON values, and oversized bodies stop before storage', async t => {
  const { call, create, DB } = fixture(t);
  const post = await create();
  for (const targetId of [123, [post.id]]) {
    const report = await call('/reports', { method: 'POST', user: 'bob', body: { targetType: 'post', targetId, reason: 'Invalid target value' } });
    assert.equal(report.status, 400);
  }
  for (const recordId of [123, [post.id]]) {
    const cursor = Buffer.from(JSON.stringify([Date.now(), recordId])).toString('base64url');
    assert.equal((await call(`/feed?cursor=${encodeURIComponent(cursor)}`)).status, 400);
  }
  const oversized = await call('/posts', { method: 'POST', user: 'bob', body: question({ body: 'x'.repeat(60001) }) });
  assert.equal(oversized.status, 413);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reports').get().n, 0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 1);
});

const evidenceCatalogs = ['tesu', 'liberty'].map(name => JSON.parse(readFileSync(new URL(`../dist/data/${name}.json`, import.meta.url), 'utf8')));
function evidenceFixture(t, environment = {}) {
  return fixture(t, { COMMUNITY_CATALOGS: evidenceCatalogs, ...environment });
}
function courseEvidenceTarget(overrides = {}) {
  const program = evidenceCatalogs[0], requirement = program.requirements[0];
  return { kind: 'course', programId: program.id, requirementId: requirement.id, courseId: requirement.options[0].id, catalogYear: '2026-2027', ...overrides };
}
function evidenceQuery(target) { return `/evidence?${new URLSearchParams(target)}`; }
function evidenceDate(daysAgo = 0) { return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10); }
function evidencePayload(target, overrides = {}) {
  return { target, outcome: 'success', evaluatedOn: evidenceDate(), details: 'My school evaluated this exact course for the stated requirement.', evidenceUrl: 'https://example.org/redacted-evaluation', consent: true, ...overrides };
}
async function submitEvidence(call, user, target, overrides = {}) {
  const response = await call('/evidence', { method: 'POST', user, body: evidencePayload(target, overrides) });
  assert.ok(response.status >= 200 && response.status < 300, JSON.stringify(response));
  const view = await call(evidenceQuery(target), { user });
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.ok(view.body.own, JSON.stringify(view.body));
  return view.body.own;
}
async function evidenceOwner(call) {
  const response = await call('/session', { user: 'evidence-owner', email: 'owner@example.org' });
  assert.equal(response.body.user.role, 'owner');
  return 'evidence-owner';
}
async function reviewEvidence(call, owner, report, status = 'reviewed') {
  const response = await call(`/evidence/${report.id}/review`, { method: 'PATCH', user: owner, body: { status } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

test('evidence browsing starts unreported and validates exact program, requirement, and provider-course scope', async t => {
  const { call, DB } = evidenceFixture(t);
  const target = courseEvidenceTarget();
  const empty = await call(evidenceQuery(target));
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.deepEqual(empty.body.target, target);
  assert.equal(empty.body.summary.status, 'unreported');
  assert.equal(empty.body.summary.reportCount, 0);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.own, null);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_users').get().n, 0);
  const otherProgram = evidenceCatalogs[1];
  for (const invalid of [
    { ...target, programId: 'unknown-program' },
    { ...target, requirementId: otherProgram.requirements[0].id },
    { ...target, courseId: otherProgram.requirements[0].options[0].id },
    { ...target, programId: otherProgram.id },
    { ...target, catalogYear: 'current' },
    { ...target, catalogYear: '2026-2099' },
    { ...target, schoolId: 'another-school' }
  ]) assert.ok([400, 404].includes((await call(evidenceQuery(invalid))).status), JSON.stringify(invalid));
});

test('monthly evidence versions are stored and aggregated separately from adjacent months and annual catalogs',async t=>{
 const monthly={id:'wgu-monthly-fixture',catalogYear:'202605',requirements:[{id:'math',options:[{id:'sophia-algebra',provider:'Sophia'}]}]}, {call,DB}=evidenceFixture(t,{COMMUNITY_CATALOGS:[...evidenceCatalogs,monthly]});
 const target=year=>({kind:'course',programId:monthly.id,requirementId:'math',courseId:'sophia-algebra',catalogYear:year});
 for(const year of ['202605','202606','2026-2027'])await submitEvidence(call,'monthly-student',target(year));
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n,3);
 for(const year of ['202605','202606','2026-2027']){
  const view=await call(evidenceQuery(target(year)));assert.equal(view.status,200);assert.equal(view.body.summary.reportCount,1);assert.equal(view.body.target.catalogYear,year);
  const summary=await call('/evidence/summary?'+new URLSearchParams({programId:monthly.id,catalogYear:year}));assert.equal(summary.status,200);assert.equal(summary.body.items.length,1);assert.equal(summary.body.items[0].target.catalogYear,year);assert.equal(summary.body.items[0].summary.reportCount,1);
 }
 for(const year of ['202600','202613','2026050','2026/05','2026-2028']){assert.equal((await call(evidenceQuery(target(year)))).status,400);assert.equal((await call('/evidence/summary?'+new URLSearchParams({programId:monthly.id,catalogYear:year}))).status,400);}
});

test('public monthly plan identity survives sharing and catalog-only edits invalidate its prior proof',async t=>{
 const {call}=evidenceFixture(t),posted={...plan(),catalogYear:'202605'},body=question({kind:'plan',plan:posted,publishPublicPlan:true});
 const created=await call('/posts',{method:'POST',user:'alice',body});assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.item.plan.catalogYear,'202605');
 const postId=created.body.item.id,target={kind:'plan',postId,catalogYear:'202605'};await submitEvidence(call,'bob',target);
 const before=(await call(evidenceQuery(target))).body;assert.equal(before.summary.reportCount,1);
 assert.equal((await call(evidenceQuery({...target,catalogYear:'2026-2027'}))).status,400,'A catalog-tagged public plan cannot collect reports under a different version');
 assert.equal((await call(`/posts/${postId}`,{method:'PATCH',user:'alice',body:{...body,plan:{...posted,catalogYear:'202606'}}})).status,200);
 const after=await call(evidenceQuery({...target,catalogYear:'202606'}));assert.equal(after.status,200);assert.notEqual(after.body.curriculumFingerprint,before.curriculumFingerprint);assert.equal(after.body.summary.reportCount,0);assert.equal(after.body.own,null);
 for(const year of ['202600','202613','2026-2028'])assert.equal((await call('/posts',{method:'POST',user:'alice',body:{...body,plan:{...posted,catalogYear:year}}})).status,400);
});

test('legacy public plans keep catalog absence and retain their existing curriculum fingerprint',async t=>{
 const {call}=evidenceFixture(t),posted=plan(),created=await call('/posts',{method:'POST',user:'alice',body:question({kind:'plan',plan:posted,publishPublicPlan:true})});assert.equal(created.status,201);assert.equal(Object.hasOwn(created.body.item.plan,'catalogYear'),false);
 const target={kind:'plan',postId:created.body.item.id,catalogYear:'2026-2027'},view=await call(evidenceQuery(target));assert.equal(view.status,200);
 const courses=posted.courses.map(course=>[course.requirementId,course.courseId,course.provider,course.credits]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([posted.schoolId,posted.programId,posted.totalCredits,courses]))),expected=Buffer.from(bytes).toString('hex');
 assert.equal(view.body.curriculumFingerprint,expected,'Adding optional catalog metadata must not rewrite fingerprints for legacy posts');
});

test('evidence requires authentication, CSRF, explicit publication consent, valid dates, and strict public fields', async t => {
  const { call, DB } = evidenceFixture(t);
  const target = courseEvidenceTarget(), body = evidencePayload(target);
  assert.equal((await call('/evidence', { method: 'POST', body })).status, 401);
  assert.equal((await call('/evidence', { method: 'POST', user: 'alice', body, headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await call('/evidence', { method: 'POST', user: 'alice', body, headers: { 'X-Community-Request': '' } })).status, 403);
  for (const overrides of [
    { consent: false }, { consent: 'true' }, { evaluatedOn: '2999-01-01' }, { evaluatedOn: '2026-02-30' },
    { evaluatedOn: '2026-1-1' }, { details: 'x'.repeat(1001) }, { outcome: 'approved' },
    { details: 'bad\u0000text' }, { evidenceUrl: 'javascript:alert(1)' }, { evidenceUrl: 'https://name:secret@example.org/' },
    { transcript: 'Private transcript' }, { userId: 'someone-else' }, { alias: 'Someone else' }, { curriculumFingerprint: 'forged' },
    { target: { ...target, schoolId: 'tesu' } }
  ]) {
    const response = await call('/evidence', { method: 'POST', user: 'alice', body: { ...body, ...overrides } });
    assert.equal(response.status, 400, JSON.stringify({ overrides, response: response.body }));
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n, 0);
});

test('evidence uses the authenticated alias, upserts one account per exact catalog, and keeps identity private', async t => {
  const { call, DB } = evidenceFixture(t);
  const target = courseEvidenceTarget();
  await call('/profile', { method: 'POST', user: 'private-alice-id', body: { alias: 'Alice Learner' } });
  const initial = await submitEvidence(call, 'private-alice-id', target);
  assert.equal(initial.reviewStatus, 'pending');
  assert.equal(initial.canDelete, true);
  assert.deepEqual(initial.author, { alias: 'Alice Learner', isYou: true });
  const updated = await submitEvidence(call, 'private-alice-id', target, { details: 'A corrected redacted report.' });
  assert.equal(updated.id, initial.id);
  assert.equal(updated.details, 'A corrected redacted report.');
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n, 1);
  const publicView = (await call(evidenceQuery(target))).body;
  assert.equal(publicView.summary.status, 'student-reported');
  assert.equal(publicView.summary.reportCount, 1);
  assert.equal(publicView.own, null);
  assert.deepEqual(publicView.items[0].author, { alias: 'Alice Learner', isYou: false });
  assert.equal(publicView.items[0].canDelete, false);
  assert.doesNotMatch(JSON.stringify(publicView), /private-alice-id|user_id|reviewed_by|reviewerId|userId|email/i);
  const previousCatalog = { ...target, catalogYear: '2025-2026' };
  await submitEvidence(call, 'private-alice-id', previousCatalog);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n, 2);
  assert.equal((await call(evidenceQuery(target))).body.summary.reportCount, 1);
  const summaries = await call(`/evidence/summary?programId=${encodeURIComponent(target.programId)}&catalogYear=${target.catalogYear}`);
  assert.equal(summaries.status, 200, JSON.stringify(summaries.body));
  assert.equal(summaries.body.items.length, 1);
  assert.deepEqual(summaries.body.items[0].target, target);
  assert.equal(summaries.body.items[0].summary.reportCount, 1);
  assert.equal((await call(`/evidence/summary?programId=${encodeURIComponent(evidenceCatalogs[1].id)}&catalogYear=${target.catalogYear}`)).body.items.length, 0);
});

test('community verification requires two distinct reviewed recent public-evidence successes and edits reset review', async t => {
  const { call } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const alice = await submitEvidence(call, 'alice', target);
  await submitEvidence(call, 'alice', target);
  const bob = await submitEvidence(call, 'bob', target);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'student-reported');
  assert.equal((await call(`/evidence/${alice.id}/review`, { method: 'PATCH', user: 'bob', body: { status: 'reviewed' } })).status, 403);
  await reviewEvidence(call, owner, alice);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'student-reported');
  await reviewEvidence(call, owner, bob);
  let view = (await call(evidenceQuery(target))).body;
  assert.equal(view.summary.status, 'community-verified');
  assert.equal(view.summary.reviewedSuccesses, 2);
  assert.equal(view.summary.reportCount, 2);
  for (const user of ['alice', 'bob', 'carol']) {
    await call('/context/reactions', { method: 'POST', user, body: { context: `course:${target.courseId}`, reaction: 'upvote', active: true } });
  }
  view = (await call(evidenceQuery(target))).body;
  assert.equal(view.summary.reviewedSuccesses, 2);
  assert.equal(view.summary.status, 'community-verified');
  const changed = await submitEvidence(call, 'alice', target, { details: 'An updated explanation of the same result.' });
  assert.equal(changed.reviewStatus, 'pending');
  assert.equal(changed.reviewedAt, null);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'student-reported');
});

test('self-review is blocked and reports without public evidence cannot reach community verification', async t => {
  const { call } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const own = await submitEvidence(call, owner, target);
  assert.equal((await call(`/evidence/${own.id}/review`, { method: 'PATCH', user: owner, body: { status: 'reviewed' } })).status, 403);
  await call(`/evidence/${own.id}`, { method: 'DELETE', user: owner });
  const alice = await submitEvidence(call, 'alice', target, { evidenceUrl: null });
  const bob = await submitEvidence(call, 'bob', target, { evidenceUrl: null });
  await reviewEvidence(call, owner, alice);
  await reviewEvidence(call, owner, bob);
  assert.notEqual((await call(evidenceQuery(target))).body.summary.status, 'community-verified');
});

test('recent non-dismissed changed or rejected outcomes block verification; old evidence is outdated', async t => {
  const { call } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const alice = await submitEvidence(call, 'alice', target);
  const bob = await submitEvidence(call, 'bob', target);
  await reviewEvidence(call, owner, alice);
  await reviewEvidence(call, owner, bob);
  for (const outcome of ['changed', 'rejected']) {
    const conflict = await submitEvidence(call, 'carol', target, { outcome, evidenceUrl: null });
    assert.equal((await call(evidenceQuery(target))).body.summary.status, 'mixed');
    await reviewEvidence(call, owner, conflict, 'dismissed');
    assert.equal((await call(evidenceQuery(target))).body.summary.status, 'community-verified');
  }
  const olderTarget = { ...target, catalogYear: '2024-2025' };
  await submitEvidence(call, 'old-learner', olderTarget, { evaluatedOn: evidenceDate(400) });
  const oldView = (await call(evidenceQuery(olderTarget))).body;
  assert.equal(oldView.summary.status, 'outdated');
  assert.equal(oldView.summary.oldReports, 1);
  assert.equal(oldView.summary.latestEvaluatedOn, evidenceDate(400));
});

test('plan evidence binds live public curriculum; text edits preserve it and actual course edits invalidate it', async t => {
  const { call, create } = evidenceFixture(t);
  assert.ok([400, 404].includes((await call(evidenceQuery({ kind: 'plan', postId: 'missing-plan', catalogYear: '2026-2027' }))).status));
  const questionPost = await create('alice');
  assert.ok([400, 404].includes((await call(evidenceQuery({ kind: 'plan', postId: questionPost.id, catalogYear: '2026-2027' }))).status));
  const publicPayload = question({ kind: 'plan', plan: plan(), publishPublicPlan: true });
  const created = await call('/posts', { method: 'POST', user: 'alice', body: publicPayload });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const postId = created.body.item.id, target = { kind: 'plan', postId, catalogYear: '2026-2027' };
  const report = await submitEvidence(call, 'bob', target);
  assert.ok(report.curriculumFingerprint);
  let view = (await call(evidenceQuery(target), { user: 'bob' })).body;
  const fingerprint = view.curriculumFingerprint;
  assert.equal(view.summary.reportCount, 1);
  assert.equal((await call(`/posts/${postId}`, { method: 'PATCH', user: 'alice', body: { ...publicPayload, title: 'A revised post title', body: 'Updated discussion text only.' } })).status, 200);
  view = (await call(evidenceQuery(target), { user: 'bob' })).body;
  assert.equal(view.curriculumFingerprint, fingerprint);
  assert.equal(view.own.id, report.id);
  const revisedPlan = plan();
  revisedPlan.courses[0].courseId = 'different-provider-course';
  assert.equal((await call(`/posts/${postId}`, { method: 'PATCH', user: 'alice', body: { ...publicPayload, plan: revisedPlan } })).status, 200);
  view = (await call(evidenceQuery(target), { user: 'bob' })).body;
  assert.notEqual(view.curriculumFingerprint, fingerprint);
  assert.equal(view.summary.status, 'unreported');
  assert.equal(view.summary.reportCount, 0);
  assert.equal(view.own, null);
  await submitEvidence(call, 'bob', target);
  assert.equal((await call(evidenceQuery(target))).body.summary.reportCount, 1);
});

test('evidence flags deduplicate per account and moderators alone can read the pending or flagged queue', async t => {
  const { call, DB } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const report = await submitEvidence(call, 'alice', target);
  assert.equal((await call('/moderation/evidence')).status, 401);
  assert.equal((await call('/moderation/evidence', { user: 'bob' })).status, 403);
  assert.equal((await call(`/evidence/${report.id}/flags`, { method: 'POST', body: { reason: 'Contains personal information' } })).status, 401);
  await reviewEvidence(call, owner, report);
  const second = await submitEvidence(call, 'dave', target);
  await reviewEvidence(call, owner, second);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'community-verified');
  for (let i = 0; i < 2; i++) {
    const response = await call(`/evidence/${report.id}/flags`, { method: 'POST', user: 'bob', body: { reason: 'Contains personal information' } });
    assert.ok(response.status >= 200 && response.status < 300, JSON.stringify(response.body));
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence_flags').get().n, 1);
  const view = (await call(evidenceQuery(target), { user: 'bob' })).body;
  assert.equal(view.items.find(item => item.id === report.id).flaggedByYou, true);
  assert.equal(view.summary.status, 'student-reported');
  const queue = await call('/moderation/evidence', { user: owner });
  assert.equal(queue.status, 200, JSON.stringify(queue.body));
  assert.ok(queue.body.items.some(item => item.id === report.id));
  assert.doesNotMatch(JSON.stringify((await call(evidenceQuery(target))).body), /Contains personal information|owner@example.org|reviewed_by|user_id/);
  await reviewEvidence(call, owner, report);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'community-verified');
  assert.equal((await call(`/evidence/${report.id}`, { method: 'DELETE', user: 'bob' })).status, 403);
  assert.equal((await call(`/evidence/${report.id}`, { method: 'DELETE', user: 'alice' })).status, 200);
  assert.equal((await call(evidenceQuery(target))).body.summary.reportCount, 1);
  assert.equal((await call(evidenceQuery(target))).body.summary.status, 'student-reported');
  const replacement = await submitEvidence(call, 'alice', target);
  assert.equal((await call(`/evidence/${replacement.id}`, { method: 'DELETE', user: owner })).status, 200);
  assert.equal((await call(evidenceQuery(target))).body.summary.reportCount, 1);
});

test('evidence writes share the existing bounded publish rate limit', async t => {
  const { call, DB } = evidenceFixture(t);
  await call('/session', { user: 'alice' });
  const bucket = Math.floor(Date.now() / 3600000) * 3600000;
  DB.sqlite.prepare('INSERT INTO community_rate_limits (user_id,action,window_start,count) VALUES (?,?,?,?)').run('alice', 'publish', bucket, 12);
  const response = await call('/evidence', { method: 'POST', user: 'alice', body: evidencePayload(courseEvidenceTarget()) });
  assert.equal(response.status, 429);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n, 0);
});

test('evidence public URL checks reject local hosts with a trailing DNS dot', async t => {
  const { call } = evidenceFixture(t), target = courseEvidenceTarget();
  for (const evidenceUrl of ['https://localhost./proof', 'https://something.local./proof', 'https://example.test./proof']) {
    const response = await call('/evidence', { method: 'POST', user: 'alice', body: evidencePayload(target, { evidenceUrl }) });
    assert.equal(response.status, 400, evidenceUrl);
  }
});

test('evidence aggregates cover all pages and worksheet summaries exclude flagged reviewed successes', async t => {
  const { call } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const alice = await submitEvidence(call, 'alice', target), bob = await submitEvidence(call, 'bob', target);
  await reviewEvidence(call, owner, alice);
  await reviewEvidence(call, owner, bob);
  await submitEvidence(call, 'older-learner', target, { evaluatedOn: evidenceDate(400) });
  const first = await call(`${evidenceQuery(target)}&limit=1`, { user: 'alice' });
  assert.equal(first.body.items.length, 1);
  assert.ok(first.body.cursor);
  assert.equal(first.body.summary.reportCount, 3);
  assert.equal(first.body.summary.status, 'community-verified');
  assert.equal(first.body.summary.oldReports, 1);
  assert.equal(first.body.own.id, alice.id);
  const second = await call(`${evidenceQuery(target)}&limit=1&cursor=${encodeURIComponent(first.body.cursor)}`);
  assert.deepEqual(second.body.summary, first.body.summary);
  assert.notEqual(second.body.items[0].id, first.body.items[0].id);
  assert.ok(second.body.cursor);
  const third = await call(`${evidenceQuery(target)}&limit=1&cursor=${encodeURIComponent(second.body.cursor)}`);
  assert.deepEqual(third.body.summary, first.body.summary);
  assert.equal(third.body.cursor, null);
  assert.equal(new Set([...first.body.items, ...second.body.items, ...third.body.items].map(item => item.id)).size, 3);
  await call(`/evidence/${alice.id}/flags`, { method: 'POST', user: 'carol', body: { reason: 'The linked evaluation needs another review.' } });
  const current = await call(evidenceQuery(target));
  const worksheet = await call(`/evidence/summary?programId=${target.programId}&catalogYear=${target.catalogYear}`);
  assert.equal(current.body.summary.status, 'student-reported');
  assert.deepEqual(worksheet.body.items[0].summary, current.body.summary);
});

test('conditional transfer-waiver course scope validates exactly and dismissed review notes stay private', async t => {
  const { call } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), program = evidenceCatalogs[1];
  const requirement = program.transferWaiverVariant.requirements.find(row => !program.requirements.some(base => base.id === row.id));
  assert.ok(requirement);
  const target = { kind: 'course', programId: program.id, requirementId: requirement.id, courseId: requirement.options[0].id, catalogYear: '2026-2027' };
  const report = await submitEvidence(call, 'alice', target);
  const response = await call(`/evidence/${report.id}/review`, { method: 'PATCH', user: owner, body: { status: 'dismissed', note: 'Private moderator explanation for the author.' } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const own = (await call(evidenceQuery(target), { user: 'alice' })).body;
  assert.equal(own.own.reviewStatus, 'dismissed');
  assert.equal(own.own.reviewNote, 'Private moderator explanation for the author.');
  assert.deepEqual(own.items, []);
  assert.equal(own.summary.status, 'unreported');
  const publicView = (await call(evidenceQuery(target))).body;
  assert.doesNotMatch(JSON.stringify(publicView), /Private moderator explanation|reviewNote/);
  const otherProgram = { ...target, programId: evidenceCatalogs[0].id };
  assert.equal((await call(evidenceQuery(otherProgram))).status, 400);
});

test('a flag arriving after the review snapshot stays unresolved until a fresh review', async t => {
  const { call, DB } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const report = await submitEvidence(call, 'alice', target);
  await call('/session', { user: 'bob' });
  const originalBatch = DB.batch.bind(DB);
  let interleaved = false;
  DB.batch = async statements => {
    if (!interleaved) {
      interleaved = true;
      // The handler has read its report/flag snapshot; simulate a separate committed flag before its transaction.
      DB.sqlite.prepare('INSERT INTO community_evidence_flags (evidence_id,user_id,reason,created_at) VALUES (?,?,?,?)')
        .run(report.id, 'bob', 'New evidence concern that the moderator has not seen.', Date.now());
    }
    return originalBatch(statements);
  };
  const stale = await call(`/evidence/${report.id}/review`, { method: 'PATCH', user: owner, body: { status: 'reviewed', note: 'Stale decision' } });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  const stored = DB.sqlite.prepare('SELECT review_status,review_note,reviewed_at FROM community_evidence WHERE id=?').get(report.id);
  assert.equal(stored.review_status, 'pending');
  assert.equal(stored.review_note, null);
  assert.equal(stored.reviewed_at, null);
  assert.equal(DB.sqlite.prepare('SELECT resolved_at FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(report.id, 'bob').resolved_at, null);
  DB.batch = originalBatch;
  await reviewEvidence(call, owner, report);
  assert.ok(DB.sqlite.prepare('SELECT resolved_at FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(report.id, 'bob').resolved_at);
  assert.equal((await call('/moderation/evidence?status=flagged', { user: owner })).body.items.length, 0);
});

test('resolved flags can be raised again by the same account without duplicating an open flag', async t => {
  const { call, DB } = evidenceFixture(t, { COMMUNITY_ADMIN_EMAIL: 'owner@example.org' });
  const owner = await evidenceOwner(call), target = courseEvidenceTarget();
  const alice = await submitEvidence(call, 'alice', target), bob = await submitEvidence(call, 'bob', target);
  await reviewEvidence(call, owner, alice);
  await reviewEvidence(call, owner, bob);
  const flag = reason => call(`/evidence/${alice.id}/flags`, { method: 'POST', user: 'carol', body: { reason } });
  assert.equal((await flag('Original concern awaiting review.')).status, 201);
  const original = DB.sqlite.prepare('SELECT reason,created_at,resolved_at FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(alice.id, 'carol');
  assert.equal((await flag('A retry must preserve the original open flag.')).status, 201);
  assert.deepEqual(DB.sqlite.prepare('SELECT reason,created_at,resolved_at FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(alice.id, 'carol'), original);
  let view = (await call(evidenceQuery(target), { user: 'carol' })).body;
  assert.equal(view.items.find(item => item.id === alice.id).flaggedByYou, true);
  assert.equal(view.items.find(item => item.id === alice.id).canFlag, false);
  assert.equal(view.summary.status, 'student-reported');
  await reviewEvidence(call, owner, alice);
  view = (await call(evidenceQuery(target), { user: 'carol' })).body;
  assert.equal(view.items.find(item => item.id === alice.id).flaggedByYou, false);
  assert.equal(view.items.find(item => item.id === alice.id).canFlag, true);
  assert.equal(view.summary.status, 'community-verified');
  assert.equal((await flag('A new concern after the moderator resolved the previous flag.')).status, 201);
  const raised = DB.sqlite.prepare('SELECT reason,created_at,resolved_at FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(alice.id, 'carol');
  assert.equal(raised.reason, 'A new concern after the moderator resolved the previous flag.');
  assert.ok(raised.created_at >= original.created_at);
  assert.equal(raised.resolved_at, null);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence_flags WHERE evidence_id=? AND user_id=?').get(alice.id, 'carol').n, 1);
  view = (await call(evidenceQuery(target), { user: 'carol' })).body;
  assert.equal(view.items.find(item => item.id === alice.id).flaggedByYou, true);
  assert.equal(view.summary.status, 'student-reported');
});
