/** Bootstrap integration tests use the real native Worker and synthetic providers only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import bootstrap from './worker/bootstrap.mjs';
import {LocalD1} from './scripts/benchmark-scale.mjs';

const origin='https://degreesteps.account-fixture.workers.dev';
const provider='https://identity.synthetic.invalid';
const ownerUUID='11111111-1111-4111-8111-111111111111';
const memberUUID='22222222-2222-4222-8222-222222222222';
const strangerUUID='33333333-3333-4333-8333-333333333333';
const key='synthetic-claude-key-never-a-real-key';
const master='a1'.repeat(32);

test('bootstrap deployment cannot activate public domains or unattended research',()=>{
  const config=JSON.parse(readFileSync(new URL('./wrangler.bootstrap.jsonc',import.meta.url),'utf8'));
  assert.equal(config.main,'worker/bootstrap.mjs');
  assert.equal(config.name,'degreesteps');
  assert.equal(config.d1_databases[0].database_id,'2bce4a19-cd2d-45dd-a08d-b877c806b3ad');
  assert.equal(config.queues,undefined);
  assert.equal(config.triggers,undefined);
  assert.equal(config.routes,undefined);
  assert.equal(config.assets,undefined);
  assert.equal(config.preview_urls,false);
});

function fixture(t){
  const DB=new LocalD1(),auth=[],ai=[],queues=[],assets=[],outside=[];
  t.after(()=>DB.close());
  for(const [uuid,role]of [[ownerUUID,'owner'],[memberUUID,'member']])DB.sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,1,1)').run('sb-'+uuid,'Synthetic '+role,role);
  DB.sqlite.prepare("INSERT INTO business_owner(singleton,user_id,source,created_at) VALUES(1,?,'subject-hash',1)").run('sb-'+ownerUUID);
  const env={DB,PORTAL_SUPABASE_URL:provider,PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_bootstrap_fixture',OWNER_CONSOLE_SUBJECT_SHA256:createHash('sha256').update('sb-'+ownerUUID).digest('hex'),AI_CONNECTIONS_MASTER_KEY:master,AI_CONNECTIONS_ALLOW_MANAGED:'1',
    ASSETS:{async fetch(request){assets.push(request.url);throw Error('Bootstrap cannot expose normal assets');}},
    RESEARCH_QUEUE:{async send(value){queues.push(value);throw Error('Bootstrap cannot enqueue research');}},
    PORTAL_AUTH_FETCH:async(url,init={})=>{
      const target=new URL(url);assert.equal(target.origin,provider);auth.push(target.pathname);
      if(target.pathname==='/auth/v1/settings')return Response.json({external:{google:true,email:true}});
      if(target.pathname==='/auth/v1/token')return Response.json({access_token:'owner-access',refresh_token:'owner-refresh',expires_in:3600});
      if(target.pathname==='/auth/v1/logout')return Response.json({});
      assert.equal(target.pathname,'/auth/v1/user');
      const value=init.headers.Authorization?.slice('Bearer '.length);
      const uuid=value==='owner-access'?ownerUUID:value==='member-access'?memberUUID:strangerUUID;
      return Response.json({id:uuid,email:uuid+'@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});
    },
    AI_CONNECTIONS_FETCH:async(url,init)=>{assert.equal(url,'https://api.anthropic.com/v1/messages/count_tokens');assert.equal(init.headers.Authorization,'Bearer '+key);ai.push(url);return Response.json({input_tokens:4});}
  };
  t.mock.method(globalThis,'fetch',async(...args)=>{outside.push(String(args[0]));throw Error('No real HTTP is allowed');});
  const call=(path,{method='GET',body,identity,headers={},host=origin}={})=>{
    const h={...(identity?{Cookie:'__Host-degreepath_access='+identity+'-access'}:{}),...headers};
    if(body!==undefined)Object.assign(h,{Origin:host,'Content-Type':'application/json','X-Portal-Request':'1'});
    return bootstrap.fetch(new Request(host+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(){throw Error('Bootstrap must not schedule background work');}});
  };
  return{DB,env,auth,ai,queues,assets,outside,call};
}
function privacy(response){
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  for(const name of ['CDN-Cache-Control','Cloudflare-CDN-Cache-Control','Vercel-CDN-Cache-Control','Surrogate-Control','Expires','Age'])assert.equal(response.headers.get(name),null);
}

test('bootstrap serves one complete setup page, private assets and robots without student content',async t=>{
  const f=fixture(t);
  for(const path of ['/','/admin.html','/account.html','/index.html']){
    const response=await f.call(path);assert.equal(response.status,200);privacy(response);
    assert.match(response.headers.get('Content-Security-Policy'),/script-src 'self'/);
    const html=await response.text();assert(html.includes('Reconnect Claude'));assert(html.includes('/bootstrap.js'));assert(!html.includes('localStorage'));assert(!html.includes(key));
  }
  const script=await f.call('/bootstrap.js');assert.equal(script.status,200);privacy(script);new Script(await script.text());
  const css=await f.call('/bootstrap.css');assert.equal(css.status,200);privacy(css);
  const robots=await f.call('/robots.txt');assert.equal(await robots.text(),'User-agent: *\nDisallow: /\n');privacy(robots);
  const head=await f.call('/admin.html',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');privacy(head);
  for(const path of ['/plan.html','/portal.html','/request-plan.html','/courses.html','/data/credit-sources.json']){const response=await f.call(path);assert.equal(response.status,503);privacy(response);assert((await response.text()).includes('This host is being set up'));}
  assert.equal((await f.call('/admin.html',{method:'POST',body:{}})).status,405);
  assert.equal(f.DB.events.length,0);assert.deepEqual(f.assets,[]);assert.deepEqual(f.auth,[]);assert.deepEqual(f.outside,[]);
});

test('every non-allowlisted API and method is blocked before identity, SQL, providers or queues',async t=>{
  const f=fixture(t),paths=[
    '/api','/api/portal/session','/api/portal/plans','/api/portal/transcript-import',
    '/api/templates','/api/templates/requests','/api/templates/tpl-11111111/research',
    '/api/admin/templates','/api/admin/templates/config','/api/admin/templates/tpl-11111111/research',
    '/api/community/feed','/api/community/comments','/api/colleges/status','/api/colleges/leads','/api/admin/colleges',
    '/api/catalog/degree-link','/api/curriculum','/api/operations/snapshot',
    '/api/auth/signup','/api/auth/forgot','/api/auth/passwordchange','/api/auth/anything-new','/auth/anything-new'
  ];
  for(const path of paths)for(const method of ['GET','POST','PUT','DELETE','HEAD','OPTIONS']){
    const response=await f.call(path,{method,identity:'owner'});assert.equal(response.status,503,path+' '+method);privacy(response);
  }
  for(const [path,method] of [['/api/auth/status','POST'],['/api/auth/login','GET'],['/api/auth/logout','GET'],['/api/admin/ai-connection','POST'],['/api/admin/ai-connection/test','GET'],['/api/admin/ai-connection?research=true','GET']])assert.equal((await f.call(path,{method,identity:'owner'})).status,503,path);
  assert.equal(f.DB.events.length,0);assert.deepEqual(f.auth,[]);assert.deepEqual(f.ai,[]);assert.deepEqual(f.queues,[]);assert.deepEqual(f.outside,[]);
  assert.deepEqual(Object.keys(bootstrap),['fetch'],'No scheduled or queue handler can start a job');
});

test('the temporary entry point refuses production domains and non-HTTPS requests',async t=>{
  const f=fixture(t);
  for(const host of ['https://degreesteps.com','https://www.degreesteps.com','http://degreesteps.account-fixture.workers.dev','https://account-fixture.workers.dev.attacker.invalid']){
    const response=await f.call('/api/admin/ai-connection',{identity:'owner',host});assert.equal(response.status,503);privacy(response);
  }
  assert.equal(f.DB.events.length,0);assert.equal(f.auth.length,0);
});

test('owner access requires the exact trusted verified subject, never spoofed identity, email bootstrap or a generic community role',async t=>{
  const f=fixture(t);f.env.COMMUNITY_ADMIN_EMAIL=strangerUUID+'@example.invalid';f.env.PORTAL_USER={id:'sb-'+ownerUUID,email:'owner@example.invalid'};
  const anonymous=await f.call('/api/admin/ai-connection',{headers:{'oai-authenticated-user-id':'sb-'+ownerUUID,'oai-authenticated-user-email':f.env.COMMUNITY_ADMIN_EMAIL}});assert.equal(anonymous.status,401);privacy(anonymous);
  const member=await f.call('/api/admin/ai-connection',{identity:'member'});assert.equal(member.status,403);privacy(member);
  const stranger=await f.call('/api/admin/ai-connection',{identity:'stranger'});assert.equal(stranger.status,403);privacy(stranger);
  assert.equal(f.DB.sqlite.prepare('SELECT role FROM community_users WHERE id=?').get('sb-'+strangerUUID),undefined);
  const owner=await f.call('/api/admin/ai-connection',{identity:'owner'});assert.equal(owner.status,200);privacy(owner);
  const value=await owner.json();assert.equal(value.canManage,true);assert.equal(value.storageReady,true);assert.equal(value.configured,false);
  assert.equal(f.DB.events.filter(x=>x.write).length,0);assert.deepEqual(f.ai,[]);assert.deepEqual(f.queues,[]);assert.deepEqual(f.outside,[]);
});

test('owner reconnect and test retain real encryption, CSRF, revision checks and no generation',async t=>{
  const f=fixture(t);
  const denied=await f.call('/api/admin/ai-connection',{method:'PUT',identity:'owner',headers:{'Content-Type':'application/json'},body:undefined});assert.equal(denied.status,403);assert.equal(f.ai.length,0);
  const saved=await f.call('/api/admin/ai-connection',{method:'PUT',identity:'owner',body:{revision:0,apiKey:key}});assert.equal(saved.status,200);privacy(saved);
  const value=await saved.json();assert.equal(value.configured,true);assert.equal(value.revision,1);assert(!JSON.stringify(value).includes(key));assert(!JSON.stringify(value).includes(master));
  const stored=f.DB.sqlite.prepare('SELECT * FROM ai_service_connections').get();assert(stored.ciphertext);assert(!stored.ciphertext.includes(key));
  const stale=await f.call('/api/admin/ai-connection/test',{method:'POST',identity:'owner',body:{revision:0}});assert.equal(stale.status,409);assert.equal(f.ai.length,1);
  const tested=await f.call('/api/admin/ai-connection/test',{method:'POST',identity:'owner',body:{revision:1}});assert.equal(tested.status,200);privacy(tested);assert.equal((await tested.json()).tested,true);assert.equal(f.ai.length,2);
  const disconnected=await f.call('/api/admin/ai-connection',{method:'DELETE',identity:'owner',body:{revision:1}});assert.equal(disconnected.status,200);assert.equal((await disconnected.json()).configured,false);
  assert.deepEqual(f.queues,[]);assert.deepEqual(f.outside,[]);
  assert(f.DB.events.filter(x=>x.write).every(x=>/ai_(?:service_connections|connection_events|connection_rate_limits)/.test(x.sql)),'Only the three explicitly expected connection tables can diverge during setup');
});

test('email and Google sign-in use the actual provider and preserve independent HttpOnly cookies',async t=>{
  const f=fixture(t);
  const login=await f.call('/api/auth/login',{method:'POST',body:{email:'owner@example.invalid',password:'synthetic password',returnTo:'/admin.html'}});assert.equal(login.status,200);privacy(login);
  const cookies=login.headers.getSetCookie();assert.equal(cookies.length,3);assert(cookies.some(x=>x.startsWith('__Host-degreepath_access=owner-access;')));assert(cookies.some(x=>x.startsWith('__Host-degreepath_refresh=owner-refresh;')));assert(cookies.every(x=>x.includes('HttpOnly; Secure; SameSite=Lax')));
  const google=await f.call('/auth/google?returnTo=%2Fplan.html');assert.equal(google.status,303);privacy(google);
  const location=new URL(google.headers.get('Location'));assert.equal(location.origin,provider);assert.equal(location.searchParams.get('redirect_to'),origin+'/auth/complete');
  const flowCookie=google.headers.getSetCookie()[0];const encoded=decodeURIComponent(flowCookie.split(';')[0].split('=')[1]);const flow=JSON.parse(Buffer.from(encoded,'base64url').toString());assert.equal(flow.returnTo,'/admin.html');
  const logout=await f.call('/api/auth/logout',{method:'POST',body:{},identity:'owner'});assert.equal(logout.status,200);privacy(logout);assert.equal(logout.headers.getSetCookie().length,4);assert(logout.headers.getSetCookie().every(x=>x.includes('Max-Age=0')));
  assert.equal(f.DB.events.length,0);assert.deepEqual(f.ai,[]);assert.deepEqual(f.outside,[]);
});
