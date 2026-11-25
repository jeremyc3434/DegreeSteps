/** Actual compiled Worker boundary; providers and academic records stay synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createTrustedDatabase} from './scripts/d1-snapshot.mjs';

const origin='https://growth.synthetic.invalid',uuid='11111111-1111-4111-8111-111111111111',owner='sb-'+uuid;
const workers=await Promise.all([['Sites','./outputs/site/dist/server/index.js'],['native','./outputs/cloudflare/runtime/worker.mjs']].map(async([kind,path])=>({kind,worker:(await import(pathToFileURL(resolve(import.meta.dirname,path)).href)).default})));
function fixture(t,{role='owner',frozen=false}={}){
 const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'Synthetic member',role,1,1);
 let verifiedUuid=role==='owner'?uuid:'33333333-3333-4333-8333-333333333333';
 const calls={auth:0,queries:[]};
 const DB={prepare(sql){
  calls.queries.push(sql);const statement=sqlite.prepare(sql);
  return{bind(...values){return{first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};}};
 }};
 const env={DB,OWNER_CONSOLE_SUBJECT_SHA256:createHash('sha256').update(owner).digest('hex'),OPERATOR_MIGRATION_READ_ONLY:frozen?'1':'0',PORTAL_SUPABASE_URL:'https://identity.synthetic.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_growth_test',COMMUNITY_ADMIN_EMAIL:'configured@example.invalid',PORTAL_USER:{id:owner,role:'owner'},
  PORTAL_AUTH_FETCH:async(url)=>{calls.auth++;if(new URL(url).pathname==='/auth/v1/user')return Response.json({id:verifiedUuid,email:'member@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{role:'owner'}});throw Error('Unexpected synthetic identity request');},
  ASSETS:{async fetch(request){return new Response(readFileSync(new URL('./dist'+new URL(request.url).pathname,import.meta.url)));}}
 };
 t.mock.method(globalThis,'fetch',async()=>{throw Error('No live provider calls are allowed in this test');});
 return{sqlite,env,calls,verifyConfiguredOwner(){verifiedUuid=uuid;},ctx:{waitUntil(){throw Error('No background work belongs to an event request');}}};
}
const eventRequest=(headers={})=>new Request(origin+'/api/growth/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Growth-Request':'1',Cookie:'__Host-degreepath_access=verified-access',...headers},body:JSON.stringify({event:'plan_started',context:'workspace',planId:'liberty-business-residential'})});

const indexPlans=Object.keys(JSON.parse(readFileSync(new URL('./dist/data/plan-library-index.json',import.meta.url),'utf8')).plans);
const planRequest=(planId,event='plan_built')=>new Request(origin+'/api/growth/events',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Growth-Request':'1'},body:JSON.stringify({event,context:'workspace',planId})});
for(const {kind,worker}of workers){
 test(kind+': plan ids are validated against the built plan library index, without identity or private reads',async t=>{
  const f=fixture(t),later=indexPlans.find(id=>id.startsWith('tesu-')||id.startsWith('gcu-'));assert(later);
  assert.equal((await worker.fetch(planRequest(later),f.env,f.ctx)).status,204);
  assert.equal((await worker.fetch(planRequest('not-a-published-plan'),f.env,f.ctx)).status,400);
  assert.deepEqual(f.sqlite.prepare('SELECT event,plan_id,count FROM growth_daily_counts').all().map(row=>({...row})),[{event:'plan_built',plan_id:later,count:1}]);
  assert.equal(f.calls.auth,0);assert(f.calls.queries.every(sql=>sql.includes('growth_daily_counts')));
 });
 test(kind+': public aggregate events never resolve an identity or read private records',async t=>{
  const f=fixture(t);const response=await worker.fetch(eventRequest(),f.env,f.ctx);assert.equal(response.status,204);assert.equal(f.calls.auth,0);assert.equal(f.sqlite.prepare('SELECT sum(count) AS n FROM growth_daily_counts').get().n,1);assert(f.calls.queries.every(sql=>sql.includes('growth_daily_counts')));
 });
 test(kind+': the source freeze stops measurement before all identity and database work',async t=>{
  const f=fixture(t,{frozen:true});const response=await worker.fetch(eventRequest(),f.env,f.ctx);assert.equal(response.status,503);assert.equal((await response.json()).code,'migration_readonly');assert.equal(f.calls.auth,0);assert.equal(f.calls.queries.length,0);
 });
 test(kind+': browser privacy signals skip writes, and a missing measurement database does not break planner delivery',async t=>{
  const f=fixture(t);assert.equal((await worker.fetch(eventRequest({DNT:'1'}),f.env,f.ctx)).status,204);assert.equal((await worker.fetch(eventRequest({'Sec-GPC':'1'}),f.env,f.ctx)).status,204);assert.equal(f.calls.queries.length,0);assert.equal(f.calls.auth,0);
  assert.equal((await worker.fetch(eventRequest(),{...f.env,DB:undefined},f.ctx)).status,503);const page=await worker.fetch(new Request(origin+'/portal.html'),{...f.env,DB:undefined},f.ctx);assert.equal(page.status,200);assert.match(await page.text(),/portal\.js/);
 });
 test(kind+': owner reports require the exact configured verified identity, ignoring editable metadata and generic owner roles',async t=>{
  const f=fixture(t,{role:'member'}),url=origin+'/api/admin/growth-summary?days=7';
  assert.equal((await worker.fetch(new Request(url),f.env,f.ctx)).status,401);
  const request=()=>new Request(url,{headers:{Cookie:'__Host-degreepath_access=verified-access','oai-authenticated-user-id':owner,'X-User-Role':'owner'}});
  assert.equal((await worker.fetch(request(),f.env,f.ctx)).status,403);f.sqlite.prepare("UPDATE community_users SET role='owner' WHERE id=?").run(owner);assert.equal((await worker.fetch(request(),f.env,f.ctx)).status,403,'A generic owner role cannot replace the pinned subject');f.verifyConfiguredOwner();
  const response=await worker.fetch(request(),f.env,f.ctx),body=await response.json();assert.equal(response.status,200);assert.equal(body.methodology.uniquePeopleMeasured,false);assert.equal(body.methodology.privateRecordsIncluded,false);assert.match(response.headers.get('Cache-Control'),/no-store/);assert(f.calls.queries.every(sql=>sql.includes('growth_daily_counts')||sql.includes('business_owner')||sql==='SELECT role FROM community_users WHERE id=?'));
 });
}
