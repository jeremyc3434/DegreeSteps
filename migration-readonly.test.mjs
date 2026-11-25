/** Exercises the actual Sites/native bundles with no live providers or data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTrustedDatabase} from './scripts/d1-snapshot.mjs';

const origin='https://migration.synthetic.invalid',user='11111111-1111-4111-8111-111111111111';
const workers=await Promise.all([['Sites','./outputs/site/dist/server/index.js'],['native','./outputs/cloudflare/runtime/worker.mjs']].map(async([kind,path])=>({kind,worker:(await import(new URL(path,import.meta.url).href)).default})));
function fixture(t,...flags){
  const flag=flags.length?flags[0]:'1';
  const calls={database:0,provider:0,queue:0,background:0,external:0,assets:0};
  const denied=name=>{calls[name]++;throw Error('Unexpected '+name+' access');};
  const env={OPERATOR_MIGRATION_READ_ONLY:flag,PORTAL_SUPABASE_URL:'https://identity.synthetic.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_migration_fixture',PORTAL_USER:{id:'sb-'+user,role:'owner'},COMMUNITY_ADMIN_EMAIL:'owner@example.invalid',
    DB:{prepare(){return denied('database');},batch(){return denied('database');}},
    RESEARCH_QUEUE:{send(){return denied('queue');}},RESEARCH_DEAD_LETTER_QUEUE:{send(){return denied('queue');}},
    PORTAL_AUTH_FETCH:async(url,init={})=>{calls.provider++;const path=new URL(url).pathname;if(path==='/auth/v1/settings')return Response.json({external:{google:true,email:true}});if(path==='/auth/v1/user'){assert.equal(init.headers.Authorization,'Bearer verified-access');return Response.json({id:user,email:'owner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});}if(path.startsWith('/auth/v1/logout'))return Response.json({});throw Error('Unexpected auth fixture call');},
    ASSETS:{async fetch(request){calls.assets++;const path=new URL(request.url).pathname;return new Response(readFileSync(new URL('./dist'+path,import.meta.url)));}}
  };
  t.mock.method(globalThis,'fetch',async()=>denied('external'));
  const ctx={waitUntil(){return denied('background');}};
  const request=(path,{method='GET',signedIn=true}={})=>new Request(origin+path,{method,headers:{...(signedIn?{Cookie:'__Host-degreepath_access=verified-access'}:{}),'oai-authenticated-user-id':'sb-'+user,'oai-authenticated-user-email':'owner@example.invalid',Origin:origin,'Content-Type':'application/json','X-Portal-Request':'1','X-Community-Request':'1'},...(!['GET','HEAD'].includes(method)?{body:'{}'}:{})});
  return{calls,env,ctx,request};
}
function paused(response){assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(response.headers.get('Retry-After'),'120');}

for(const {kind,worker}of workers){
  test(kind+': source freeze rejects all application API methods before identity, data, providers or background work',async t=>{
    const f=fixture(t),paths=['/api','/api/auth','/api/operations','/api/catalog/programs?limit=1','/api/catalog/degree-link?url=https%3A%2F%2Fexample.invalid','/api/curriculum?program=liberty','/api/portal/session','/api/portal/plans','/api/portal/transcript-import','/api/community/session','/api/community/feed','/api/community/evidence','/api/colleges/status','/api/admin/colleges','/api/admin/academic-coverage','/api/growth/events','/api/admin/growth-summary','/api/admin/academic-coverage/facts/synthetic/review','/api/templates','/api/templates/requests','/api/admin/templates','/api/admin/ai-connection','/api/admin/ai-connection/test','/api/unknown-future-route'];
    for(const path of paths)for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
      const response=await worker.fetch(f.request(path,{method}),f.env,f.ctx);paused(response);
      if(method==='HEAD')assert.equal(await response.text(),'');else{const value=await response.json();assert.equal(value.code,'migration_readonly');assert.equal(value.error,'We’re finishing a site update. Your saved work is safe. Please try again shortly.');}
    }
    assert.deepEqual(f.calls,{database:0,provider:0,queue:0,background:0,external:0,assets:0});
  });

  test(kind+': verified sign-in, sign-out, Google callback flow and public pages remain available',async t=>{
    const f=fixture(t);
    const session=await worker.fetch(f.request('/api/auth/session'),f.env,f.ctx);assert.equal(session.status,200);assert.equal((await session.json()).user.id,'sb-'+user);
    const providerCalls=f.calls.provider;
    const protectedResponse=await worker.fetch(f.request('/api/portal/plans'),f.env,f.ctx);paused(protectedResponse);assert.equal(f.calls.provider,providerCalls,'A verified identity cannot bypass the freeze or trigger another provider call');
    const settings=await worker.fetch(f.request('/api/auth/status'),f.env,f.ctx);assert.equal(settings.status,200);assert.deepEqual((await settings.json()).providers,['email','google']);
    const google=await worker.fetch(f.request('/auth/google?returnTo=%2Fplan.html'),f.env,f.ctx);assert.equal(google.status,303);assert.equal(new URL(google.headers.get('Location')).searchParams.get('redirect_to'),origin+'/auth/complete');
    const callback=await worker.fetch(f.request('/auth/complete'),f.env,f.ctx);assert.notEqual(callback.status,503);assert.equal(callback.status,303);
    const logout=await worker.fetch(f.request('/api/auth/logout',{method:'POST'}),f.env,f.ctx);assert.equal(logout.status,200);assert.equal(logout.headers.getSetCookie().length,4);
    for(const path of ['/','/plan.html','/account.html']){const page=await worker.fetch(f.request(path),f.env,f.ctx);assert.equal(page.status,200);assert.match(await page.text(),/<main|<body/);}
    assert.equal(f.calls.database,0);assert.equal(f.calls.queue,0);assert.equal(f.calls.background,0);assert.equal(f.calls.external,0);
  });

  test(kind+': only the literal operator value enables the reversible gate',async t=>{
    for(const flag of [undefined,null,false,true,0,1,'true','0','false','']){
      const f=fixture(t,flag);const response=await worker.fetch(f.request('/api/catalog/programs?limit=1'),f.env,f.ctx);assert.equal(response.status,200,String(flag));assert.equal((await response.json()).programs.length,1);assert.equal(f.calls.database,0);assert.equal(f.calls.provider,0);assert.equal(f.calls.external,0);
    }
  });

  test(kind+': the authenticated read-only operator export remains usable during source freeze',async t=>{
    const f=fixture(t),sqlite=createTrustedDatabase(),key='a'.repeat(64),queries=[];t.after(()=>sqlite.close());
    f.env.OPERATOR_EXPORT_TOKEN_SHA256=createHash('sha256').update(key).digest('hex');f.env.OPERATOR_EXPORT_EXPIRES_AT=new Date(Date.now()+60000).toISOString();f.env.OPERATOR_EXPORT_ORIGIN=origin;
    f.env.DB={prepare(sql){queries.push(sql);assert.match(sql,/^(?:WITH|SELECT)\b/);return{sql};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(statement=>({success:true,results:sqlite.prepare(statement.sql).all()}));sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
    const invalid=await worker.fetch(new Request(origin+'/api/operations/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),f.env,f.ctx);assert.equal(invalid.status,401);assert.equal(queries.length,0);
    const response=await worker.fetch(new Request(origin+'/api/operations/snapshot',{method:'POST',headers:{'Content-Type':'application/json','X-DegreeSteps-Export-Key':key},body:'{}'}),f.env,f.ctx);assert.equal(response.status,200);const value=await response.json();assert.equal(value.tables.length,57);assert(value.tables.every(table=>table.count===0));assert.equal(queries.length,3);assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n,0);
    assert.equal(f.calls.provider,0);assert.equal(f.calls.queue,0);assert.equal(f.calls.external,0);
  });

  test(kind+': queue deliveries are retried intact and scheduled recovery does no work while frozen',async t=>{
    const f=fixture(t);let batchRetries=0,messageRetries=0,acks=0;
    await worker.queue({messages:[{body:{jobId:'synthetic-job'},ack(){acks++;}}],retryAll(options){assert.deepEqual(options,{delaySeconds:120});batchRetries++;}},f.env,f.ctx);
    await worker.queue({messages:Array.from({length:2},()=>({body:{jobId:'synthetic-job'},retry(options){assert.deepEqual(options,{delaySeconds:120});messageRetries++;},ack(){acks++;}}))},f.env,f.ctx);
    await worker.scheduled({},f.env,f.ctx);
    assert.equal(batchRetries,1);assert.equal(messageRetries,2);assert.equal(acks,0);assert.deepEqual(f.calls,{database:0,provider:0,queue:0,background:0,external:0,assets:0});
  });
}
