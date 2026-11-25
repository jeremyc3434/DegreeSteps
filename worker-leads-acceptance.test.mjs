/** Actual compiled Worker boundary for school contact requests and Plan review. Synthetic identities and data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createTrustedDatabase} from './scripts/d1-snapshot.mjs';

const origin='https://leads.synthetic.invalid',uuid='22222222-2222-4222-8222-222222222222',owner='sb-'+uuid;
const workers=await Promise.all([['Sites','./outputs/site/dist/server/index.js'],['native','./outputs/cloudflare/runtime/worker.mjs']].map(async([kind,path])=>({kind,worker:(await import(pathToFileURL(resolve(import.meta.dirname,path)).href)).default})));
const plan=Object.keys(JSON.parse(readFileSync(new URL('./dist/data/coach-index.json',import.meta.url),'utf8')).plans)[0];
function fixture(t,flags={}){
 const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'Synthetic owner','owner',1,1);
 const calls={auth:0,queries:[]};
 const DB={prepare(sql){calls.queries.push(sql);const statement=sqlite.prepare(sql);return{bind(...values){return{first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};}};}};
 const env={DB,OWNER_CONSOLE_SUBJECT_SHA256:createHash('sha256').update(owner).digest('hex'),LEADS_HASH_SALT:'synthetic-worker-leads-salt',PORTAL_SUPABASE_URL:'https://identity.synthetic.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_leads_test',...flags,
  PORTAL_AUTH_FETCH:async url=>{calls.auth++;if(new URL(url).pathname==='/auth/v1/user')return Response.json({id:uuid,email:'owner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});throw Error('Unexpected synthetic identity request');},
  ASSETS:{async fetch(request){try{return new Response(readFileSync(new URL('./dist'+new URL(request.url).pathname,import.meta.url)));}catch{return new Response('missing',{status:404});}}}};
 t.mock.method(globalThis,'fetch',async()=>{throw Error('No outside calls: nothing is ever sent to a school or payment provider');});
 return{sqlite,env,calls,ctx:{waitUntil(){}}};
}
const reviewRequest=body=>new Request(origin+'/api/plan-review/requests',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Leads-Request':'1','CF-Connecting-IP':'203.0.113.20'},body:JSON.stringify(body)});
const reviewBody={name:'Synthetic Student',email:'student@example.invalid',planId:plan,consent:true,consentVersion:'plan-review-v1'};
for(const {kind,worker}of workers){
 test(kind+': with both flags unset the status says disabled, and every other route and the offer page are 404, before identity or database work',async t=>{
  const f=fixture(t);
  for(const [path,method]of[['/api/leads/status','GET'],['/api/school-inquiries','POST'],['/api/plan-review/requests','POST'],['/api/admin/school-inquiries','GET'],['/api/admin/plan-review-requests','GET'],['/plan-review/','GET'],['/plan-review','GET']]){
   const response=await worker.fetch(new Request(origin+path,{method,headers:{Cookie:'__Host-degreepath_access=verified-access'}}),f.env,f.ctx);assert.equal(response.status,path==='/api/leads/status'?200:404,path);if(path==='/api/leads/status')assert.deepEqual(await response.json(),{enabled:false});
  }
  assert.equal(f.calls.auth,0);assert.equal(f.calls.queries.length,0);
  assert.equal((await worker.fetch(new Request(origin+'/why-its-free/'),f.env,f.ctx)).status,200);
 });
 test(kind+': Plan review on: the page is served, requests are stored without identity, and owners export them',async t=>{
  const f=fixture(t,{PLAN_REVIEW_ENABLED:'1'});
  const page=await worker.fetch(new Request(origin+'/plan-review/'),f.env,f.ctx);assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/Request a review/);assert.match(html,/We’ll email you to confirm before you pay anything\./);assert.match(html,/\$49/);assert.match(html,/within 5 days/);assert.match(html,/<script src="\/leads\.js" defer><\/script>/);
  const status=await (await worker.fetch(new Request(origin+'/api/leads/status'),f.env,f.ctx)).json();assert.equal(status.planReview.enabled,true);assert.equal(status.schoolInquiries.enabled,false,'The shipped allowlist is empty');
  const stored=await worker.fetch(reviewRequest(reviewBody),f.env,f.ctx);assert.equal(stored.status,201);assert.equal(f.calls.auth,0);
  assert.equal(f.sqlite.prepare('SELECT plan_id FROM plan_review_requests').get().plan_id,plan);
  assert.equal((await worker.fetch(new Request(origin+'/api/admin/plan-review-requests'),f.env,f.ctx)).status,401);
  const csv=await worker.fetch(new Request(origin+'/api/admin/plan-review-requests?format=csv',{headers:{Cookie:'__Host-degreepath_access=verified-access'}}),f.env,f.ctx);
  assert.equal(csv.status,200);assert.match(await csv.text(),/Synthetic Student,student@example\.invalid/);
  assert.equal((await worker.fetch(new Request(origin+'/api/school-inquiries',{method:'POST'}),f.env,f.ctx)).status,404,'Inquiries stay off');
 });
 test(kind+': school inquiries on with an empty allowlist: no school accepts requests',async t=>{
  const f=fixture(t,{SCHOOL_INQUIRIES_ENABLED:'1'});
  const response=await worker.fetch(new Request(origin+'/api/school-inquiries',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Leads-Request':'1'},body:JSON.stringify({planId:plan,firstName:'A',email:'a@example.invalid',location:'Ohio',startTiming:'later',priorCredit:'no',consent:true,consentVersion:'school-inquiry-v1'})}),f.env,f.ctx);
  assert.equal(response.status,404);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM school_inquiries').get().n,0);
  assert.equal((await worker.fetch(new Request(origin+'/plan-review/'),f.env,f.ctx)).status,404,'The offer page needs its own flag');
 });
 test(kind+': the scheduled cleanup removes requests older than 365 days',async t=>{
  const f=fixture(t),old=Date.now()-366*86400000;
  f.sqlite.prepare("INSERT INTO plan_review_requests(id,created_at,name,email,offer_price,offer_currency,offer_status,consent_version,consent_text) VALUES('old',?,'Old','old@example.invalid',49,'USD','waitlist','plan-review-v1','consent text that is long enough')").run(old);
  f.sqlite.prepare("INSERT INTO plan_review_requests(id,created_at,name,email,offer_price,offer_currency,offer_status,consent_version,consent_text) VALUES('new',?,'New','new@example.invalid',49,'USD','waitlist','plan-review-v1','consent text that is long enough')").run(Date.now());
  const waits=[];await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,3,1)},f.env,{waitUntil:promise=>waits.push(promise)}).catch(()=>{});await Promise.all(waits);
  assert.deepEqual(f.sqlite.prepare('SELECT id FROM plan_review_requests').all().map(row=>row.id),['new']);
 });
}
