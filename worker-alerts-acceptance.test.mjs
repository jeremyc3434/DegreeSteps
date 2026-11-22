/** Email plan alerts through the actual compiled Worker: flag boundary, ownership via the portal, scheduled send, cleanup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrustedDatabase} from './scripts/d1-snapshot.mjs';

const origin='https://alerts.synthetic.invalid',uuid='22222222-2222-4222-8222-222222222222',student='sb-'+uuid,KEY='re_worker_test_key_not_real_0001';
const workers=await Promise.all([['Sites','./outputs/site/dist/server/index.js'],['native','./outputs/cloudflare/worker.mjs']].map(async([kind,path])=>({kind,worker:(await import('data:text/javascript;base64,'+readFileSync(new URL(path,import.meta.url)).toString('base64'))).default})));
const index=JSON.parse(readFileSync(new URL('./dist/data/plan-library-index.json',import.meta.url),'utf8')).plans;
const registry=JSON.parse(readFileSync(new URL('./dist/data/curriculum-registry.json',import.meta.url),'utf8')).models;
const planId='liberty-business-residential',entry=registry.find(item=>item.id===index[planId].modelId);
function fixture(t,flags={}){
  const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());const calls={auth:0,queries:[],mail:[]};
  const bind=(sql,values)=>{const statement=sqlite.prepare(sql);return{first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};};
  const DB={prepare(sql){calls.queries.push(sql);return{bind:(...values)=>bind(sql,values)};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const env={DB,PORTAL_SUPABASE_URL:'https://identity.synthetic.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_alerts_test',
    PORTAL_AUTH_FETCH:async url=>{calls.auth++;if(new URL(url).pathname==='/auth/v1/user')return Response.json({id:uuid,email:'student@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});throw Error('Unexpected synthetic identity request');},
    ASSETS:{async fetch(request){return new Response(readFileSync(new URL('./dist'+new URL(request.url).pathname,import.meta.url)));}},
    RESEND_API_KEY:KEY,EMAIL_POSTAL_ADDRESS:'DegreeSteps, PO Box 0000, Example City, ST 00000',EMAIL_SITE_ORIGIN:origin,
    EMAIL_FETCH:async(url,options)=>{calls.mail.push({url,options,body:JSON.parse(options.body)});return Response.json({id:'synthetic-email'});},...flags};
  t.mock.method(globalThis,'fetch',async()=>{throw Error('No live provider calls are allowed in this test');});
  const pending=[];return{sqlite,env,calls,ctx:{waitUntil(promise){pending.push(promise);}},settle:()=>Promise.allSettled(pending.splice(0))};
}
const cookie='__Host-degreepath_access=verified-access';
const write=(path,method,body)=>new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Portal-Request':'1',Cookie:cookie},body:JSON.stringify(body)});
const state={version:3,profile:{school:entry.school,degree:entry.title,pathwayId:planId},selectedPathwayId:planId,learning:[]};

for(const {kind,worker}of workers){
  test(kind+': with EMAIL_ALERTS_ENABLED unset every alert route is 404 before identity or database work',async t=>{
    const f=fixture(t);
    for(const request of [new Request(origin+'/api/alerts/subscriptions',{headers:{Cookie:cookie}}),write('/api/alerts/subscriptions','POST',{portalPlanId:'x'.repeat(10),planId,consent:true}),new Request(origin+'/api/alerts/unsubscribe?token='+'a'.repeat(43),{method:'POST'})]){
      const response=await worker.fetch(request,f.env,f.ctx);assert.equal(response.status,404);
    }
    await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,12,30)},f.env,f.ctx);await f.settle();
    assert.equal(f.calls.auth,0);assert(!f.calls.queries.some(sql=>/plan_alert|email_send/.test(sql)));assert.equal(f.calls.mail.length,0);
  });
  test(kind+': a signed-in owner subscribes a saved plan, the scheduled run emails one change, and deleting the plan removes the alert',async t=>{
    const f=fixture(t,{EMAIL_ALERTS_ENABLED:'1'});
    const saved=await worker.fetch(write('/api/portal/plans','POST',{title:'My plan',state,consent:true}),f.env,f.ctx);assert.equal(saved.status,201,await saved.clone().text());const portalPlanId=(await saved.json()).item.id;
    const wrong=await worker.fetch(write('/api/alerts/subscriptions','POST',{portalPlanId:'not-my-plan-0001',planId,consent:true}),f.env,f.ctx);assert.equal(wrong.status,404);
    const created=await worker.fetch(write('/api/alerts/subscriptions','POST',{portalPlanId,planId,consent:true}),f.env,f.ctx);const body=await created.json();
    assert.equal(created.status,201,JSON.stringify(body));assert.equal(body.email,'student@example.invalid');assert.equal(body.item.title,entry.title+' — '+entry.school);
    assert.deepEqual(f.sqlite.prepare("SELECT event,plan_id FROM growth_daily_counts").all().map(row=>({...row})),[{event:'alert_subscribed',plan_id:planId}]);
    await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,12,30)},f.env,f.ctx);await f.settle();assert.equal(f.calls.mail.length,0,'Nothing changed in the built plan');
    f.sqlite.prepare("UPDATE plan_alert_subscriptions SET fingerprint=?,summary_json=?").run('0'.repeat(64),JSON.stringify({credits:120,outside:80,university:40,costMin:1000,costMax:2000,costPartial:false,tier:'confirmation',openItems:3,questions:3,model:'old'}));
    await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,13,15)},f.env,f.ctx);await f.settle();assert.equal(f.calls.mail.length,0,'Alerts run once an hour');
    await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,13,30)},f.env,f.ctx);await f.settle();
    assert.equal(f.calls.mail.length,1);const mail=f.calls.mail[0];assert.equal(mail.url,'https://api.resend.com/emails');assert.equal(mail.options.redirect,'manual');
    assert.equal(mail.body.subject,'Your '+entry.title+' — '+entry.school+' plan changed');assert.match(mail.body.text,/degree-plans\/liberty-business-residential\//);assert.ok(mail.body.headers['List-Unsubscribe-Post']);
    await worker.scheduled({scheduledTime:Date.UTC(2026,10,22,14,30)},f.env,f.ctx);await f.settle();assert.equal(f.calls.mail.length,1,'The same change is sent once');
    const listed=await (await worker.fetch(new Request(origin+'/api/alerts/subscriptions',{headers:{Cookie:cookie}}),f.env,f.ctx)).text();assert(!listed.includes(KEY));
    const removed=await worker.fetch(write('/api/portal/plans/'+portalPlanId,'DELETE',{revision:1}),f.env,f.ctx);assert.equal(removed.status,200);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM plan_alert_subscriptions').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM plan_alert_tokens').get().n,0);
  });
}
