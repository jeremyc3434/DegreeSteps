/** Actual built Worker boundaries. Provider identities/storage are synthetic; no external requests or paid calls. */
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTrustedDatabase } from './scripts/d1-snapshot.mjs';

const origin = 'https://learning.synthetic.invalid';
const uuid = '11111111-1111-4111-8111-111111111111';
const testToken=seconds=>'eyJhbGciOiJzeW50aGV0aWMifQ.'+Buffer.from(JSON.stringify({sub:uuid,exp:Math.floor(Date.now()/1000)+seconds})).toString('base64url')+'.synthetic-signature';
const access = testToken(3600);
const cookie = '__Host-degreepath_access=' + access;
const compiled = readFileSync(new URL('./outputs/site/dist/server/index.js', import.meta.url), 'utf8');
const workers = [
  { kind: 'Sites', worker: (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).default },
  { kind: 'native Cloudflare', worker: (await import(new URL('./outputs/cloudflare/runtime/worker.mjs', import.meta.url))).default }
];

function fixture(t, additions = {}) {
  const sqlite = createTrustedDatabase(); t.after(() => sqlite.close());
  const calls = { auth: [], storage: [], ai: [], queries: [] };
  const DB = {
    prepare(sql) { calls.queries.push(sql); const query = sqlite.prepare(sql); return { bind: (...values) => ({ first: async () => query.get(...values) || null, all: async () => ({ results: query.all(...values) }), run: async () => ({ meta: { changes: Number(query.run(...values).changes) } }) }) }; },
    async batch(statements) { sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } }
  };
  const env = {
    DB, LEARNING_ENABLED: '1', PORTAL_SUPABASE_URL: 'https://identity.synthetic.invalid', PORTAL_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_learning_synthetic',
    PORTAL_AUTH_FETCH: async (url, options) => { calls.auth.push({ url, options }); assert.equal(new URL(url).pathname, '/auth/v1/user'); return Response.json({ id: uuid, email: 'learner@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { full_name: 'Avery' } }); },
    LEARNING_DATA_FETCH: async (url, options) => { calls.storage.push({ url, options }); throw Error('Unexpected private storage call in boundary test'); },
    PORTAL_DATA_FETCH: async (url, options) => { calls.storage.push({ url, options }); throw Error('Unexpected private storage call in boundary test'); },
    LEARNING_FETCH: async (url, options) => { calls.ai.push({ url, options }); throw Error('Unexpected model call in boundary test'); },
    ASSETS: { async fetch(request) { return new Response(readFileSync(new URL('./dist' + new URL(request.url).pathname, import.meta.url))); } },
    ...additions
  };
  t.mock.method(globalThis, 'fetch', async () => { throw Error('No real external requests are allowed in learning Worker tests'); });
  return { env, calls, sqlite, ctx: { waitUntil() {} } };
}
const call = (path, { method = 'GET', body, headers = {}, signedIn = false } = {}) => new Request(origin + path, { method, headers: { ...(signedIn ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-Learning-Request': '1' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function privateResponse(response) {
  assert.match(response.headers.get('Cache-Control') || '', /(?:^|[,\s])no-store(?:$|[,\s])/);
  assert.match(response.headers.get('X-Robots-Tag') || '', /noindex/);
}

for (const { kind, worker } of workers) {
const test = (name, fn) => nodeTest(kind + ': ' + name, fn);
test('built Worker: disabled learning rejects every private path before identity, storage or model work', async t => {
  const f = fixture(t, { LEARNING_ENABLED: '0' });
  const status = await worker.fetch(call('/api/learning/status', { signedIn: true }), f.env, f.ctx);
  assert.equal(status.status, 200); assert.deepEqual(await status.json(), { enabled: false }); privateResponse(status);
  for (const [path, method, body] of [['/api/learning/courses', 'GET'], ['/api/learning/courses', 'POST', { title: 'A course' }], ['/api/learning/projects/project-synthetic/run', 'POST', { action: 'draft' }], ['/api/learning/billing/checkout', 'POST', { product: 'writing-project' }], ['/api/learning/billing/webhook', 'POST', {}]]) {
    const response = await worker.fetch(call(path, { method, body, signedIn: true }), f.env, f.ctx);
    assert.equal(response.status, 404, path); privateResponse(response);
  }
  assert.equal(f.calls.auth.length, 0); assert.equal(f.calls.storage.length, 0); assert.equal(f.calls.ai.length, 0);
  assert.equal(f.calls.queries.length, 0);
});

test('built Worker: client headers and injected env identity cannot open another private workspace', async t => {
  const f = fixture(t, { PORTAL_USER: { id: 'sb-' + uuid, role: 'owner' }, PORTAL_USER_ACCESS_TOKEN: 'unverified-env-token' });
  const status = await worker.fetch(call('/api/learning/status', { headers: { 'oai-authenticated-user-id': 'sb-' + uuid, 'X-User-Id': 'sb-' + uuid } }), f.env, f.ctx);
  assert.equal(status.status, 200); const body = await status.json();
  assert.equal(body.authenticated ?? body.signedIn, false); assert(!body.user); privateResponse(status);
  for (const [path, method, payload] of [['/api/learning/courses', 'GET'], ['/api/learning/projects', 'POST', { courseId: 'course-other-person', kind: 'writing', title: 'A paper', prompt: 'Explain the topic.' }]]) {
    const response = await worker.fetch(call(path, { method, body: payload }), f.env, f.ctx);
    assert.equal(response.status, 401, path); privateResponse(response);
  }
  assert.equal(f.calls.storage.length, 0); assert.equal(f.calls.ai.length, 0);
});

test('built Worker: verified status exposes capabilities without private content or credentials', async t => {
  const key = 'sk-' + 'ant-' + 'synthetic-learning-credential-not-real';
  const f = fixture(t, { ANTHROPIC_API_KEY: key });
  const response = await worker.fetch(call('/api/learning/status', { signedIn: true }), f.env, f.ctx);
  assert.equal(response.status, 200); privateResponse(response);
  const text = await response.text(), body = JSON.parse(text);
  assert.equal(body.enabled, true); assert.equal(body.authenticated ?? body.signedIn, true);
  assert(!text.includes(key)); assert(!text.includes(access)); assert(!text.includes('learner@example.invalid'));
  assert.equal(f.calls.auth.length, 1); assert.equal(f.calls.auth[0].options.headers.Authorization, 'Bearer ' + access);
  assert.equal(f.calls.ai.length, 0);
});

test('built Worker: signed-in learning writes enforce same-origin custom-header CSRF before storage or AI', async t => {
  const f = fixture(t);
  for (const headers of [{ Origin: 'https://attacker.invalid' }, { Origin: 'null' }, { 'X-Learning-Request': '0' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await worker.fetch(call('/api/learning/courses', { method: 'POST', signedIn: true, body: { title: 'Private course' }, headers }), f.env, f.ctx);
    assert.equal(response.status, 403, JSON.stringify(headers)); privateResponse(response);
  }
  assert.equal(f.calls.storage.length, 0); assert.equal(f.calls.ai.length, 0);
});

test('built Worker: owner financial summaries require the pinned owner identity', async t => {
  const f = fixture(t, { OWNER_CONSOLE_SUBJECT_SHA256: 'a'.repeat(64) });
  const response = await worker.fetch(call('/api/learning/billing/owner-summary', { signedIn: true }), f.env, f.ctx);
  assert.equal(response.status, 403); privateResponse(response);
  assert.equal(f.calls.storage.length, 0); assert.equal(f.calls.ai.length, 0);
});

test('built Worker: migration read-only protection still covers new learning writes', async t => {
  const f = fixture(t, { OPERATOR_MIGRATION_READ_ONLY: '1' });
  const response = await worker.fetch(call('/api/learning/courses', { method: 'POST', signedIn: true, body: { title: 'A course' } }), f.env, f.ctx);
  assert.equal(response.status, 503); privateResponse(response);
  assert.equal(f.calls.storage.length, 0); assert.equal(f.calls.ai.length, 0);
});

test('built Worker: long runs refresh near-expiry sessions and pass the fresh JWT to private storage', async t => {
  const old=testToken(60),fresh=testToken(3600),authCalls=[],storageCalls=[];
  const f=fixture(t,{ANTHROPIC_API_KEY:'synthetic-learning-key-not-real',PORTAL_AUTH_FETCH:async(url,options)=>{authCalls.push({url,options});if(new URL(url).pathname==='/auth/v1/token')return Response.json({access_token:fresh,refresh_token:'new-verified-refresh',expires_in:3600});return Response.json({id:uuid,email:'learner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});},LEARNING_DATA_FETCH:async(url,options)=>{storageCalls.push({url,options});return Response.json([]);}});
  const response=await worker.fetch(call('/api/learning/projects/22222222-2222-4222-8222-222222222222/run',{method:'POST',body:{revision:1,action:'study',requestId:'33333333-3333-4333-8333-333333333333'},headers:{Cookie:'__Host-degreepath_access='+old+'; __Host-degreepath_refresh=existing-refresh'}}),f.env,f.ctx);
  assert.equal(response.status,404);assert.equal(authCalls.length,3);assert.equal(storageCalls.length,1);assert.equal(storageCalls[0].options.headers.Authorization,'Bearer '+fresh);assert.equal(f.calls.ai.length,0);assert(response.headers.getSetCookie().some(c=>c.includes('new-verified-refresh')));privateResponse(response);
});

test('built Worker: failed proactive refresh prevents private storage, reservations and paid AI dispatch', async t => {
  const authCalls=[],f=fixture(t,{PORTAL_AUTH_FETCH:async(url,options)=>{authCalls.push({url,options});return new URL(url).pathname==='/auth/v1/token'?Response.json({error:'temporarily unavailable'},{status:503}):Response.json({id:uuid,email:'learner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});}});
  const response=await worker.fetch(call('/api/learning/projects/22222222-2222-4222-8222-222222222222/run',{method:'POST',body:{revision:1,action:'study',requestId:'33333333-3333-4333-8333-333333333333'},headers:{Cookie:'__Host-degreepath_access='+testToken(60)+'; __Host-degreepath_refresh=existing-refresh'}}),f.env,f.ctx);
  assert.equal(response.status,503);assert.equal((await response.json()).code,'auth_unavailable');assert.equal(authCalls.length,2);assert.equal(f.calls.storage.length,0);assert.equal(f.calls.ai.length,0);assert.equal(f.calls.queries.length,0);assert.equal(response.headers.getSetCookie().length,0);privateResponse(response);
});

test('built Worker: ordinary course reads do not proactively rotate a valid short-lived session', async t => {
  const authCalls=[],f=fixture(t,{PORTAL_AUTH_FETCH:async(url,options)=>{authCalls.push({url,options});return Response.json({id:uuid,email:'learner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});},LEARNING_DATA_FETCH:async()=>Response.json([])});
  const response=await worker.fetch(call('/api/learning/courses',{headers:{Cookie:'__Host-degreepath_access='+testToken(60)}}),f.env,f.ctx);
  assert.equal(response.status,200);assert.equal(authCalls.length,1);assert.equal(response.headers.getSetCookie().length,0);assert.equal(f.calls.ai.length,0);privateResponse(response);
});
}
