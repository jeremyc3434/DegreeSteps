/** Email plan alerts: flag, consent, ownership, change detection, caps, unsubscribe and secrecy. Mocked fetch only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handlePlanAlerts, runPlanAlerts, removePlanAlerts, planAlertSummary, composePlanAlertEmail } from './plan-alerts.mjs';
import { sendEmail, emailSettings } from './email.mjs';
import { handleGrowthMetrics, recordGrowthEvent } from './growth-metrics.mjs';

const origin='https://degreepath.example',DAY=86400000,T0=Date.UTC(2026,10,22,12);
const KEY='re_test_resend_credential_not_real_0001';
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');

class LocalD1{
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');for(const entry of journal.entries)this.sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));this.queries=0;}
  prepare(sql){this.queries++;assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i);const query=this.sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};}
  async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  rows(table){return this.sqlite.prepare('SELECT * FROM '+table).all();}
}
function planFixture(){
  const plans={
    'plan-a':{modelId:'m-a',tier:'confirmation',published:false,questions:['Ask the school: a?','Ask the school: b?'],openItems:2,start:{outside:87,university:33,total:120},estimate:{min:20067,max:20935,partial:true,unpriced:['StraighterLine']}},
    'plan-b':{modelId:'m-b',tier:'reviewed',published:true,questions:[],openItems:0,start:{outside:72,university:48,total:120},estimate:{min:21559,max:23030}},
    'plan-c':{modelId:'m-c',tier:'reviewed',published:true,questions:[],openItems:0,start:{outside:60,university:60,total:120}}
  };
  const models={'plan-a':'content-v1:aaaaaaaaaaaaaaaa','plan-b':'content-v1:bbbbbbbbbbbbbbbb','plan-c':'content-v1:cccccccccccccccc'};
  return{plans,models,data:async()=>({plans,titleFor:id=>({'plan-a':'BS in Business — Example State','plan-b':'BS in Criminal Justice — Example University','plan-c':'BA in English — Example College'})[id]||'',pageFor:id=>id==='plan-b',modelFingerprint:async id=>models[id]})};
}
function mailer(status=200){
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});if(typeof status==='function')return status(calls.length);return new Response(JSON.stringify(status===200?{id:'email-'+calls.length}:{message:'provider said '+KEY}),{status,headers:{'Content-Type':'application/json'}});};
  fetcher.calls=calls;return fetcher;
}
const owners={'alice':{'saved-plan-a1':'plan-a','saved-plan-b1':'plan-b','saved-plan-c1':'plan-c'},'bob':{'saved-plan-bob1':'plan-a'}};
function environment(t,overrides={}){
  const DB=new LocalD1();t.after(()=>DB.sqlite.close());const fixture=planFixture(),growth=[];
  const env={DB,EMAIL_ALERTS_ENABLED:'1',RESEND_API_KEY:KEY,EMAIL_POSTAL_ADDRESS:'DegreeSteps, PO Box 0000, Example City, ST 00000',EMAIL_SITE_ORIGIN:origin,EMAIL_FETCH:mailer(),
    ALERTS_PLAN_DATA:fixture.data,ALERTS_GROWTH:async value=>{growth.push(value);await recordGrowthEvent({DB},value,{now:T0});},
    ALERTS_USER:{id:'alice',email:'alice@example.com'},ALERTS_PLAN_OWNER:async id=>owners.alice[id]?{owned:true,pathwayId:owners.alice[id]}:{owned:false},...overrides};
  return{env,DB,fixture,growth};
}
const call=(env,path,{method='GET',body,headers={},raw}={},context={now:T0})=>handlePlanAlerts(new Request(origin+path,{method,headers:{...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&method!=='HEAD'&&!headers.Origin?{Origin:origin,'X-Portal-Request':'1'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{})}),env,context);
const subscribe=(env,portalPlanId='saved-plan-a1',planId='plan-a',extra={})=>call(env,'/api/alerts/subscriptions',{method:'POST',body:{portalPlanId,planId,consent:true,...extra}});
const tokenFrom=body=>body.text.match(/unsubscribe\?token=([A-Za-z0-9_-]{43})/)[1];

test('flag off: every route is 404, nothing is read and no email is sent',async t=>{
  for(const flag of [undefined,'0','true','']){
    const {env,DB}=environment(t,{EMAIL_ALERTS_ENABLED:flag});let dataReads=0,ownerReads=0;env.ALERTS_PLAN_DATA=async()=>{dataReads++;return{};};env.ALERTS_PLAN_OWNER=async()=>{ownerReads++;return{owned:true};};
    for(const [path,method,body] of [['/api/alerts/subscriptions','GET'],['/api/alerts/subscriptions','POST',{portalPlanId:'saved-plan-a1',planId:'plan-a',consent:true}],['/api/alerts/subscriptions/00000000-0000-0000-0000-000000000000','DELETE',{}],['/api/alerts/unsubscribe?token='+'a'.repeat(43),'GET'],['/api/alerts/unsubscribe?token='+'a'.repeat(43),'POST'],['/api/alerts','GET']]){
      const response=await call(env,path,{method,body});assert.equal(response.status,404,method+' '+path);assert.doesNotMatch(await response.text(),/alice|re_test/);
    }
    const before=DB.queries;assert.deepEqual(await runPlanAlerts(env,{now:T0+40*DAY}),{skipped:'disabled'});
    assert.equal(DB.queries,before);assert.equal(dataReads,0);assert.equal(ownerReads,0);assert.equal(env.EMAIL_FETCH.calls.length,0);
  }
  assert.equal(await handlePlanAlerts(new Request(origin+'/api/portal/session'),{EMAIL_ALERTS_ENABLED:'1'}),null,'Other paths are not handled here');
});

test('subscribing needs a signed-in owner of a saved library plan, explicit consent and a same-origin write',async t=>{
  const {env,DB,growth}=environment(t);
  assert.equal((await subscribe({...env,ALERTS_USER:null})).status,401);
  const noConsent=await call(env,'/api/alerts/subscriptions',{method:'POST',body:{portalPlanId:'saved-plan-a1',planId:'plan-a'}});assert.equal(noConsent.status,400);assert.equal((await noConsent.json()).code,'consent_required');
  assert.equal((await (await subscribe(env,'saved-plan-a1','plan-a',{consent:'yes'})).json()).code,'consent_required');
  assert.equal((await (await subscribe(env,'saved-plan-bob1','plan-a')).json()).code,'plan_not_saved','Another student’s saved plan is never accepted');
  assert.equal((await (await subscribe(env,'saved-plan-a1','plan-b')).json()).code,'plan_mismatch','The saved copy must follow the plan being subscribed to');
  assert.equal((await (await subscribe(env,'saved-plan-a1','plan-unknown')).json()).code,'plan_not_in_library');
  assert.equal((await (await subscribe({...env,ALERTS_USER:{id:'alice',email:'not-an-email'}})).json()).code,'email_unavailable');
  const crossSite=await call(env,'/api/alerts/subscriptions',{method:'POST',body:{portalPlanId:'saved-plan-a1',planId:'plan-a',consent:true},headers:{Origin:'https://evil.example','X-Portal-Request':'1'}});assert.equal(crossSite.status,403);
  const extra=await subscribe(env,'saved-plan-a1','plan-a',{email:'other@example.com'});assert.equal(extra.status,400,'A different email address cannot be supplied');
  const unavailable=await subscribe({...env,ALERTS_PLAN_OWNER:async()=>{throw Error('storage down');}});assert.equal(unavailable.status,503);
  assert.equal(DB.rows('plan_alert_subscriptions').length,0);assert.equal(growth.length,0);

  const created=await subscribe(env);assert.equal(created.status,201);const body=await created.json();
  assert.equal(body.email,'alice@example.com');assert.equal(body.item.planId,'plan-a');assert.equal(body.item.title,'BS in Business — Example State');
  const [row]=DB.rows('plan_alert_subscriptions');
  assert.equal(row.user_id,'alice');assert.equal(row.portal_plan_id,'saved-plan-a1');assert.equal(row.email,'alice@example.com');assert.match(row.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(row.created_at,T0);assert.equal(row.confirmed_at,T0);assert.equal(row.last_change_email_at,null);
  assert.deepEqual(JSON.parse(row.summary_json),planAlertSummary(planFixture().plans['plan-a'],'content-v1:aaaaaaaaaaaaaaaa'));
  assert.equal(DB.rows('plan_alert_tokens').length,0,'No token exists until an email is sent');
  const again=await subscribe(env);assert.equal(again.status,200);assert.equal((await again.json()).created,false);assert.equal(DB.rows('plan_alert_subscriptions').length,1);
  assert.deepEqual(growth,[{event:'alert_subscribed',context:'workspace',planId:'plan-a'}]);
  assert.deepEqual(DB.rows('growth_daily_counts').map(row=>[row.event,row.context,row.plan_id,row.detail,row.count]),[['alert_subscribed','workspace','plan-a','',1]]);
  const list=await (await call(env,'/api/alerts/subscriptions')).json();assert.equal(list.items.length,1);assert.equal(list.email,'alice@example.com');
  const bobList=await (await call({...env,ALERTS_USER:{id:'bob',email:'bob@example.com'}},'/api/alerts/subscriptions')).json();assert.deepEqual(bobList.items,[]);
  assert.equal(env.EMAIL_FETCH.calls.length,0,'Subscribing sends no email');
});

test('settings removal is owner-scoped and counted once',async t=>{
  const {env,DB,growth}=environment(t);const id=(await (await subscribe(env)).json()).item.id;
  const bob={...env,ALERTS_USER:{id:'bob',email:'bob@example.com'}};
  assert.equal((await call(bob,'/api/alerts/subscriptions/'+id,{method:'DELETE',body:{}})).status,404);
  assert.equal((await call(env,'/api/alerts/subscriptions/'+id,{method:'DELETE',body:{},headers:{Origin:'https://evil.example','X-Portal-Request':'1'}})).status,403);
  const removed=await call(env,'/api/alerts/subscriptions/'+id,{method:'DELETE',body:{}});assert.equal(removed.status,200);assert.equal(DB.rows('plan_alert_subscriptions').length,0);
  assert.deepEqual(growth.at(-1),{event:'alert_unsubscribed',context:'workspace',planId:'plan-a',detail:'settings'});
  assert.equal((await call(env,'/api/alerts/subscriptions/'+id,{method:'DELETE',body:{}})).status,404);
});

test('a fingerprint change sends exactly one email, then the fingerprint is updated',async t=>{
  const {env,DB,fixture}=environment(t);await subscribe(env);await subscribe(env,'saved-plan-b1','plan-b');
  assert.equal((await runPlanAlerts(env,{now:T0+DAY})).sent,0,'Nothing changed, so nothing is sent');
  fixture.plans['plan-a']={...fixture.plans['plan-a'],tier:'reviewed',questions:[],openItems:0,start:{outside:84,university:36,total:120},estimate:{min:21000,max:22100}};
  const stats=await runPlanAlerts(env,{now:T0+2*DAY});assert.equal(stats.sent,1);assert.equal(stats.changes,1);assert.equal(env.EMAIL_FETCH.calls.length,1);
  const [{url,options,body}]=env.EMAIL_FETCH.calls;
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.ok(options.signal);
  assert.equal(options.headers.Authorization,'Bearer '+KEY);assert.match(options.headers['Idempotency-Key'],/^plan-alert\/change\//);
  assert.equal(body.from,'DegreeSteps <plans@degreesteps.com>');assert.deepEqual(body.to,['alice@example.com']);
  assert.equal(body.subject,'Your BS in Business — Example State plan changed');
  assert.match(body.text,/Credits: 120 credits \(87 from outside courses, 33 at the school\) → 120 credits \(84 from outside courses, 36 at the school\)/);
  assert.match(body.text,/Estimated cost: \$20,067–\$20,935 \(some course providers not priced yet\) → \$21,000–\$22,100/);
  assert.match(body.text,/School confirmation: Needs school confirmation \(2 open questions\) → Checked against the school’s published rules/);
  assert.match(body.text,/Open your saved plans: https:\/\/degreepath\.example\/account\.html/);assert.match(body.text,/PO Box 0000/);
  assert.match(body.html,/<table/);assert.match(body.html,/Unsubscribe with one click/);assert.match(body.html,/PO Box 0000/);
  const token=tokenFrom(body);
  assert.equal(body.headers['List-Unsubscribe'],'<'+origin+'/api/alerts/unsubscribe?token='+token+'>');assert.equal(body.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  const row=DB.rows('plan_alert_subscriptions').find(item=>item.plan_id==='plan-a'),other=DB.rows('plan_alert_subscriptions').find(item=>item.plan_id==='plan-b');
  assert.equal(row.last_change_email_at,T0+2*DAY);assert.equal(JSON.parse(row.summary_json).tier,'reviewed');assert.equal(other.last_change_email_at,null);
  assert.equal((await runPlanAlerts(env,{now:T0+2*DAY+60000})).sent,0,'The new fingerprint was stored, so the same change is never sent twice');
  assert.equal(env.EMAIL_FETCH.calls.length,1);
});

test('requirement-only changes are reported, and change emails are capped at one per plan per 7 days',async t=>{
  const {env,fixture}=environment(t);await subscribe(env);
  fixture.models['plan-a']='content-v1:aaaaaaaaaaaa0001';
  assert.equal((await runPlanAlerts(env,{now:T0+DAY})).sent,1);
  assert.match(env.EMAIL_FETCH.calls[0].body.text,/Course requirements: Updated in the school’s published curriculum/);assert.match(env.EMAIL_FETCH.calls[0].body.text,/Credits: .* no change/);
  fixture.plans['plan-a']={...fixture.plans['plan-a'],estimate:{min:19000,max:20000}};
  const pending=await runPlanAlerts(env,{now:T0+3*DAY});assert.equal(pending.sent,0);assert.equal(pending.pending,1);
  assert.equal((await runPlanAlerts(env,{now:T0+8*DAY-1})).sent,0);
  const later=await runPlanAlerts(env,{now:T0+8*DAY});assert.equal(later.sent,1);assert.equal(env.EMAIL_FETCH.calls.length,2);
  assert.match(env.EMAIL_FETCH.calls[1].body.text,/Estimated cost: \$20,067–\$20,935 \(some course providers not priced yet\) → \$19,000–\$20,000/);
});

test('the monthly reminder is capped and can be switched off',async t=>{
  const {env}=environment(t);await subscribe(env,'saved-plan-b1','plan-b');
  assert.equal((await runPlanAlerts(env,{now:T0+29*DAY})).sent,0);
  const first=await runPlanAlerts(env,{now:T0+30*DAY});assert.equal(first.reminders,1);
  const reminder=env.EMAIL_FETCH.calls[0].body;assert.equal(reminder.subject,'Your saved plan: BS in Criminal Justice — Example University');assert.match(reminder.text,/See the public plan: https:\/\/degreepath\.example\/degree-plans\/plan-b\//);assert.ok(reminder.headers['List-Unsubscribe']);
  assert.equal((await runPlanAlerts(env,{now:T0+45*DAY})).sent,0);assert.equal((await runPlanAlerts(env,{now:T0+60*DAY})).reminders,1);
  const off=environment(t,{EMAIL_ALERT_REMINDERS:'0'});await subscribe(off.env,'saved-plan-b1','plan-b');assert.equal((await runPlanAlerts(off.env,{now:T0+90*DAY})).sent,0);
});

test('the daily send cap stops sending and resumes the next UTC day',async t=>{
  const {env,DB,fixture}=environment(t,{EMAIL_DAILY_CAP:'2'});
  await subscribe(env,'saved-plan-a1','plan-a');await subscribe(env,'saved-plan-b1','plan-b');await subscribe(env,'saved-plan-c1','plan-c');
  for(const id of ['plan-a','plan-b','plan-c'])fixture.plans[id]={...fixture.plans[id],openItems:fixture.plans[id].openItems+1};
  for(const id of ['plan-a','plan-b','plan-c'])fixture.models[id]+='x';
  const first=await runPlanAlerts(env,{now:T0+DAY});assert.equal(first.sent,2);assert.equal(first.capped,true);
  assert.equal((await runPlanAlerts(env,{now:T0+DAY+3600000})).sent,0,'Later runs the same day stay capped');
  assert.deepEqual(DB.rows('email_send_days').map(row=>[row.day,row.count]),[['2026-11-23',2]]);
  const next=await runPlanAlerts(env,{now:T0+2*DAY});assert.equal(next.sent,1);assert.equal(env.EMAIL_FETCH.calls.length,3);
  assert.equal(emailSettings({}).dailyCap,200,'The default cap is 200 a day');
  const zero=environment(t,{EMAIL_DAILY_CAP:'0'});await subscribe(zero.env);zero.fixture.models['plan-a']+='y';assert.equal((await runPlanAlerts(zero.env,{now:T0+DAY})).capped,true);assert.equal(zero.env.EMAIL_FETCH.calls.length,0);
});

test('unsubscribe works by link confirmation and by one-click POST, and tokens are stored only as hashes',async t=>{
  const {env,DB,fixture,growth}=environment(t);await subscribe(env);await subscribe(env,'saved-plan-b1','plan-b');
  fixture.models['plan-a']+='1';fixture.models['plan-b']+='1';await runPlanAlerts(env,{now:T0+DAY});
  const [mailA,mailB]=env.EMAIL_FETCH.calls.map(entry=>entry.body).sort((a,b)=>a.subject.localeCompare(b.subject));
  const tokenA=tokenFrom(mailA),tokenB=tokenFrom(mailB);
  const stored=DB.rows('plan_alert_tokens');assert.equal(stored.length,2);
  assert.deepEqual(stored.map(row=>row.token_hash).sort(),[sha(tokenA),sha(tokenB)].sort());
  const dump=JSON.stringify(DB.sqlite.prepare("SELECT * FROM plan_alert_tokens").all())+JSON.stringify(DB.rows('plan_alert_subscriptions'));
  assert(!dump.includes(tokenA)&&!dump.includes(tokenB),'Raw tokens are never stored');

  const confirm=await call(env,'/api/alerts/unsubscribe?token='+tokenA);assert.equal(confirm.status,200);const html=await confirm.text();
  assert.match(html,/Stop plan alerts\?/);assert.match(html,/method="post"/);assert.equal(confirm.headers.get('Referrer-Policy'),'no-referrer');assert.doesNotMatch(html,/alice@example\.com/);
  assert.equal(DB.rows('plan_alert_subscriptions').length,2,'GET (and mail link scanners) never unsubscribes');
  const form=await handlePlanAlerts(new Request(origin+'/api/alerts/unsubscribe?token='+tokenA,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'confirm=1'}),env,{now:T0});
  assert.equal(form.status,200);assert.match(await form.text(),/You’re unsubscribed/);
  assert.deepEqual(DB.rows('plan_alert_subscriptions').map(row=>row.plan_id),['plan-b']);assert.deepEqual(DB.rows('plan_alert_tokens').map(row=>row.token_hash),[sha(tokenB)],'Its tokens are removed with it');

  const oneClick=await handlePlanAlerts(new Request(origin+'/api/alerts/unsubscribe?token='+tokenB,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),env,{now:T0});
  assert.equal(oneClick.status,200);assert.equal(await oneClick.text(),'Unsubscribed.');assert.equal(DB.rows('plan_alert_subscriptions').length,0);assert.equal(DB.rows('plan_alert_tokens').length,0);
  const repeat=await handlePlanAlerts(new Request(origin+'/api/alerts/unsubscribe?token='+tokenB,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),env,{now:T0});assert.equal(repeat.status,200,'One-click is idempotent');
  assert.match(await (await call(env,'/api/alerts/unsubscribe?token='+tokenA)).text(),/already off/);
  assert.equal((await call(env,'/api/alerts/unsubscribe?token=short')).status,400);
  assert.deepEqual(growth.filter(item=>item.event==='alert_unsubscribed').map(item=>[item.context,item.detail]),[['email','link'],['email','one-click']]);
  assert.equal(env.EMAIL_FETCH.calls.length,2,'Unsubscribing sends nothing');
});

test('provider failures roll back the claim, release the cap slot and never expose the key',async t=>{
  const logs=[];for(const method of ['log','error','warn','info'])t.mock.method(console,method,(...args)=>logs.push(args.join(' ')));
  for(const status of [500,401,429]){
    const {env,DB,fixture}=environment(t,{EMAIL_FETCH:mailer(status)});await subscribe(env);fixture.models['plan-a']+='z';
    const stats=await runPlanAlerts(env,{now:T0+DAY});assert.equal(stats.sent,0);assert.equal(stats.failed,1);
    const [row]=DB.rows('plan_alert_subscriptions');assert.equal(row.last_change_email_at,null);assert.notEqual(JSON.parse(row.summary_json).model,fixture.models['plan-a']);
    assert.equal(DB.rows('plan_alert_tokens').length,0);assert.deepEqual(DB.rows('email_send_days').map(item=>item.count),[0]);
    assert(!JSON.stringify(stats).includes(KEY));
    env.EMAIL_FETCH=mailer();assert.equal((await runPlanAlerts(env,{now:T0+DAY+60000})).sent,1,'A later run retries the change');
  }
  const redirect=await sendEmail({RESEND_API_KEY:KEY,EMAIL_FETCH:async()=>new Response(null,{status:307,headers:{Location:'https://elsewhere.example/'}})},{to:'a@example.com',subject:'s',text:'t',html:'<p>h</p>'});
  assert.deepEqual(redirect,{ok:false,code:'provider_redirect',retryable:false});
  const hung=await sendEmail({RESEND_API_KEY:KEY,EMAIL_TIMEOUT_MS:'20',EMAIL_FETCH:(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted '+KEY))))},{to:'a@example.com',subject:'s',text:'t',html:'<p>h</p>'});
  assert.deepEqual(hung,{ok:false,code:'timeout',retryable:true});
  const thrown=await sendEmail({RESEND_API_KEY:KEY,EMAIL_FETCH:async()=>{throw Error('network down '+KEY);}},{to:'a@example.com',subject:'s',text:'t',html:'<p>h</p>'});assert(!JSON.stringify(thrown).includes(KEY));
  assert.deepEqual(await sendEmail({EMAIL_FETCH:async()=>{throw Error('must not be called');}},{to:'a@example.com',subject:'s',text:'t',html:'h'}),{ok:false,code:'not_configured',retryable:false});
  assert.deepEqual(await sendEmail({RESEND_API_KEY:KEY,EMAIL_FETCH:async()=>{throw Error('must not be called');}},{to:'a@example.com',subject:'bad\r\nBcc: x@example.com',text:'t',html:'h'}),{ok:false,code:'invalid_message',retryable:false});
  assert.equal(emailSettings({EMAIL_FROM:'Someone <bad'}).from,null);assert.equal(emailSettings({EMAIL_FROM:'Plans <alerts@degreesteps.com>'}).from,'Plans <alerts@degreesteps.com>');
  assert(!JSON.stringify(emailSettings({RESEND_API_KEY:KEY})).includes(KEY),'Settings never include the key');
  assert(!logs.some(line=>line.includes(KEY)),'The key is never logged');
});

test('responses never include the key, and sending waits for the key and postal address',async t=>{
  const {env,fixture}=environment(t);
  for(const response of [await subscribe(env),await call(env,'/api/alerts/subscriptions')]){const text=await response.text();assert(!text.includes(KEY));assert(!text.includes('RESEND'));}
  fixture.models['plan-a']+='q';
  for(const missing of [{RESEND_API_KEY:''},{EMAIL_POSTAL_ADDRESS:''},{EMAIL_FROM:'not an address'}]){
    const stats=await runPlanAlerts({...env,...missing},{now:T0+DAY});assert.deepEqual(stats,{skipped:'not_configured'});
  }
  assert.equal(env.EMAIL_FETCH.calls.length,0);
});

test('deleting a saved plan or portal data removes its alerts',async t=>{
  const {env,DB,fixture}=environment(t);await subscribe(env);await subscribe(env,'saved-plan-b1','plan-b');fixture.models['plan-a']+='d';await runPlanAlerts(env,{now:T0+DAY});
  assert.equal(await removePlanAlerts(env,{userId:'alice',portalPlanId:'saved-plan-a1'}),1);assert.deepEqual(DB.rows('plan_alert_subscriptions').map(row=>row.plan_id),['plan-b']);assert.equal(DB.rows('plan_alert_tokens').length,0);
  assert.equal(await removePlanAlerts(env,{userId:'alice'}),1);assert.equal(DB.rows('plan_alert_subscriptions').length,0);
});

test('browsers cannot send server-only alert events to the public growth endpoint',async t=>{
  const DB=new LocalD1();t.after(()=>DB.sqlite.close());
  for(const event of ['alert_subscribed','alert_unsubscribed']){
    const response=await handleGrowthMetrics(new Request(origin+'/api/growth/events',{method:'POST',headers:{Origin:origin,'X-Growth-Request':'1','Content-Type':'application/json'},body:JSON.stringify({event,context:'workspace'})}),{DB});
    assert.equal(response.status,400);
  }
  assert.equal(await recordGrowthEvent({DB},{event:'landing_view',context:'home'}),false,'The server recorder accepts only alert events');
  assert.equal(await recordGrowthEvent({DB},{event:'alert_unsubscribed',context:'email',detail:'other'}),false);
  assert.equal(await recordGrowthEvent({DB,GROWTH_METRICS_DISABLED:'1'},{event:'alert_subscribed',context:'workspace'}),false);
  assert.equal(DB.rows('growth_daily_counts').length,0);
});

test('email copy for owner review stays plain and bounded',()=>{
  const env={EMAIL_POSTAL_ADDRESS:'DegreeSteps, 1 Example St, City, ST 00000'},summary=planAlertSummary(planFixture().plans['plan-a'],'x');
  const change=composePlanAlertEmail(env,{kind:'change',title:'A <b>plan</b>',before:summary,now:{...summary,costMin:null,costMax:null},planURL:'',accountURL:origin+'/account.html',unsubscribeURL:origin+'/api/alerts/unsubscribe?token=t'});
  assert.match(change.text,/Estimated cost: .* → Not estimated yet/);assert.doesNotMatch(change.html,/<b>plan<\/b>/,'Titles are escaped in HTML');assert.doesNotMatch(change.text,/See the public plan/);
});
