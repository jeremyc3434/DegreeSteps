import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveLearningRun,settleLearningRun,getLearningUsage,getLearningRunUsage,setLearningRunFeedback,handleLearningBilling,createLearningPaymentOrder,updateLearningPaymentOrder,grantLearningPaidOrder,refundLearningPaidOrder,learningBillingInternals} from './learning-billing.mjs';

const USER='sb-11111111-1111-4111-8111-111111111111',OTHER='sb-22222222-2222-4222-8222-222222222222';
const origin='https://learning.synthetic.invalid',journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
class LocalD1{
  constructor(){this.queue=Promise.resolve();this.sqlite=new DatabaseSync(':memory:');for(const e of journal.entries)this.sqlite.exec(readFileSync(new URL('../drizzle/'+e.tag+'.sql',import.meta.url),'utf8'));}
  prepare(sql){const q=this.sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>q.get(...values)||null,all:async()=>({results:q.all(...values)}),run:async()=>({meta:{changes:Number(q.run(...values).changes)}})})};}
  async batch(statements){const job=this.queue.then(async()=>{this.sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}});this.queue=job.catch(()=>{});return job;}
  row(table){return this.sqlite.prepare('SELECT * FROM '+table).get();}
}
function fixture(t,extra={}){const DB=new LocalD1();t.after(()=>DB.sqlite.close());return{DB,LEARNING_ENABLED:'1',LEARNING_PILOT_ENABLED:'1',PORTAL_USER:{id:USER},LEARNING_NOW:()=>Date.parse('2026-11-28T12:00:00Z'),...extra};}
const input=(extra={})=>({userId:USER,projectId:crypto.randomUUID(),requestId:crypto.randomUUID(),kind:'writing',action:'plan',maxCostMicroUsd:900000,...extra});
const known={input_tokens:1000,output_tokens:100,cache_creation_input_tokens:0,cache_read_input_tokens:0};
const settle=(env,run,extra={})=>settleLearningRun(env,{reservationId:run.id,userId:USER,model:'claude-sonnet-5-5',usage:known,succeeded:true,...extra});
const request=(path,extra={})=>new Request(origin+'/api/learning/billing/'+path,extra);

test('disabled billing performs no storage access and cannot enable purchases',async()=>{
 let touched=false;const env={DB:{prepare(){touched=true;throw Error('must not read');}}};
 const response=await handleLearningBilling(request('status'),env);assert.deepEqual(await response.json(),{enabled:false,paymentsEnabled:false,pilotEnabled:false,products:[]});
 assert.equal((await handleLearningBilling(request('checkout',{method:'POST'}),env)).status,404);assert.equal(touched,false);
});
test('pilot is monthly and verified-account scoped; absent payment setup stays disabled',async t=>{
 const env=fixture(t);const u=await getLearningUsage(env,USER);assert.equal(u.projectsRemaining,1);assert.equal(u.studySessionsRemaining,10);assert.equal(u.period,'2026-11');
 await assert.rejects(()=>getLearningUsage(env,OTHER),e=>e.status===401);
 const status=await(await handleLearningBilling(request('status'),env)).json();assert.equal(status.paymentsEnabled,false);assert.equal(status.products[0].priceCents,1500);assert.equal(status.products[1].priceCents,900);
 const first=input(),run=await reserveLearningRun(env,first);assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);await settle(env,run);
 assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);
 env.LEARNING_NOW=()=>Date.parse('2026-12-01T12:00:00Z');assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);
});
test('one project consumes one unit, includes scoped follow-ups and limits successful steps',async t=>{
 const env=fixture(t),start=input(),one=await reserveLearningRun(env,start);await settle(env,one);
 for(let n=1;n<12;n++){const run=await reserveLearningRun(env,{...start,requestId:crypto.randomUUID(),action:'review'});await settle(env,run);}
 assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);assert.equal(env.DB.row('learning_billing_projects').runs,12);
 await assert.rejects(()=>reserveLearningRun(env,{...start,requestId:crypto.randomUUID(),action:'draft'}),e=>e.code==='project_limit');
 assert.equal(env.DB.row('learning_billing_days').actual_micro_usd,12*3000);
});
test('D1 active-project fence blocks concurrency independently of private project metadata',async t=>{
 const env=fixture(t),start=input(),run=await reserveLearningRun(env,start);
 await assert.rejects(()=>reserveLearningRun(env,{...start,requestId:crypto.randomUUID(),action:'draft'}),e=>e.code==='run_in_progress');
 await assert.rejects(()=>reserveLearningRun(env,start),e=>e.code==='run_in_progress');
 await settle(env,run);
 const repeated=await reserveLearningRun(env,start);assert.deepEqual(repeated,{id:run.id,status:'completed'});
 await assert.rejects(()=>reserveLearningRun(env,{...start,projectId:crypto.randomUUID()}),e=>e.code==='request_conflict');
 assert.equal(env.DB.row('learning_billing_user_days').calls,1);
});
test('simultaneous request IDs reserve at most one project and never overspend pilot credit',async t=>{
 const env=fixture(t),a=input(),b=input();const result=await Promise.allSettled([reserveLearningRun(env,a),reserveLearningRun(env,b)]);
 // The mock serializes complete atomic batches, matching the deployed single-writer boundary.
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(env.DB.row('learning_billing_accounts').writing_remaining,0);
 assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM learning_billing_runs').get().n,1);
});
test('known failure refunds a new project unit and retains actual spend; settlement is idempotent',async t=>{
 const env=fixture(t),run=await reserveLearningRun(env,input());await settle(env,run,{succeeded:false});
 assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);assert.equal(env.DB.row('learning_billing_days').actual_micro_usd,3000);assert.equal(env.DB.row('learning_billing_days').reserved_micro_usd,0);
 await settle(env,run,{succeeded:false});assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);assert.equal(env.DB.row('learning_billing_days').actual_micro_usd,3000);
});
test('unknown usage and unknown model retain the conservative reservation instead of reporting zero',async t=>{
 const env=fixture(t),run=await reserveLearningRun(env,input());const out=await settle(env,run,{usage:{...known,unknown:true},succeeded:false});
 assert.equal(out.costMicroUsd,900000);assert.equal(out.estimated,true);assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);
 const owner=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.equal(owner.usage.unreconciledRuns,1);assert.equal(owner.usage.costMicroUsd,900000);assert.equal(owner.usage.confirmedCostMicroUsd,0);assert.equal(owner.usage.estimatedCostMicroUsd,900000);
 const pricing=learningBillingInternals();assert.equal(pricing.costOf('unknown-model',{...known},123456).costMicroUsd,123456);
 assert.equal(pricing.costOf('claude-sonnet-5-5',{...known,input_tokens:-1},456).costMicroUsd,1000);
 assert.equal(pricing.costOf('claude-sonnet-5-5',{input_tokens:2000000,unknown:true},3000000).costMicroUsd,4000000,'Known partial charges remain counted even above the conservative reservation');
});
test('a delayed older-month request cannot move the account period backward and regrant pilot credit',async t=>{
 const env=fixture(t);await getLearningUsage(env,USER);env.LEARNING_NOW=()=>Date.parse('2026-12-01T12:00:00Z');await getLearningUsage(env,USER);
 const run=await reserveLearningRun(env,input());await settle(env,run);assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);
 env.LEARNING_NOW=()=>Date.parse('2026-11-30T23:59:59Z');await getLearningUsage(env,USER);
 assert.equal(env.DB.row('learning_billing_accounts').month,'2026-12');assert.equal(env.DB.row('learning_billing_accounts').writing_remaining,0);
});
test('preflight caps include all outstanding reservations and release unused spend after settlement',async t=>{
 const env=fixture(t,{LEARNING_DAILY_USD_CAP:'1',LEARNING_ACCOUNT_DAILY_USD_CAP:'1'}),a=input(),run=await reserveLearningRun(env,a);
 await assert.rejects(()=>reserveLearningRun(env,input({kind:'study',maxCostMicroUsd:350000})),e=>e.code==='spend_limit');
 await settle(env,run);const study=await reserveLearningRun(env,input({kind:'study',maxCostMicroUsd:350000}));assert.equal(study.status,'reserved');
 assert.equal(env.DB.row('learning_billing_days').reserved_micro_usd,350000);assert.equal(env.DB.row('learning_billing_days').actual_micro_usd,3000);
});
test('expired in-flight work is reconciled conservatively before retry and still respects spend caps',async t=>{
 const env=fixture(t),start=input();await reserveLearningRun(env,start);env.LEARNING_NOW=()=>Date.parse('2026-11-28T12:11:00Z');
 const next=await reserveLearningRun(env,{...start,requestId:crypto.randomUUID()});assert.equal(next.status,'reserved');
 const old=env.DB.sqlite.prepare("SELECT * FROM learning_billing_runs WHERE status='failed'").get();assert.equal(old.actual_micro_usd,900000);assert.equal(old.estimated,1);
});
test('costs include output, cache writes, one-hour writes, cache hits and web searches',()=>{
 const result=learningBillingInternals().costOf('claude-sonnet-5-5',{input_tokens:1000,output_tokens:200,cache_creation_input_tokens:100,cache_read_input_tokens:1000,cache_creation:{ephemeral_1h_input_tokens:20},server_tool_use:{web_search_requests:3}});
 assert.equal(result.costMicroUsd,34380);assert.equal(result.estimated,false);
});
test('daily call guard also bounds repeated failures that would otherwise restore credit',async t=>{
 const env=fixture(t);for(let i=0;i<50;i++){const run=await reserveLearningRun(env,input({kind:'study',maxCostMicroUsd:1}));await settle(env,run,{usage:{input_tokens:0,output_tokens:0},succeeded:false});}
 await assert.rejects(()=>reserveLearningRun(env,input({kind:'study',maxCostMicroUsd:1})),e=>e.code==='spend_limit');
 assert.equal((await getLearningUsage(env,USER)).studySessionsRemaining,10);
});
async function paidOrder(env,productId='writing-project'){
 const order=await createLearningPaymentOrder(env,{userId:USER,productId,requestId:crypto.randomUUID()});
 await updateLearningPaymentOrder(env,{id:order.id,sessionId:'cs_test_receipt12345',paymentIntentId:'pi_receipt12345'});
 return{order,input:{orderId:order.id,sessionId:'cs_test_receipt12345',paymentIntentId:'pi_receipt12345',amountTotal:order.priceCents,currency:'usd',eventId:'evt_paid12345'}};
}
test('paid grants require exact server prices, are idempotent and survive browser reloads without fulfillment',async t=>{
 const env=fixture(t,{LEARNING_PILOT_ENABLED:'0'}),{order,input:receipt}=await paidOrder(env);
 assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);
 await assert.rejects(()=>grantLearningPaidOrder(env,{...receipt,amountTotal:1}),e=>e.code==='receipt_mismatch');
 await assert.rejects(()=>grantLearningPaidOrder(env,{...receipt,currency:'eur'}),e=>e.code==='receipt_mismatch');
 assert.equal((await grantLearningPaidOrder(env,receipt)).granted,true);assert.equal((await grantLearningPaidOrder(env,receipt)).granted,false);assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);
 const project=input(),run=await reserveLearningRun(env,project);await settle(env,run);assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);
 const refund=await refundLearningPaidOrder(env,{orderId:order.id,paymentIntentId:receipt.paymentIntentId,eventId:'evt_refund12345',amountRefunded:1500});assert.equal(refund.revoked,true);
 await assert.rejects(()=>reserveLearningRun(env,{...project,requestId:crypto.randomUUID(),action:'draft'}),e=>e.code==='allowance_revoked');
 const owner=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.deepEqual(owner.sales,{period:'all-time',paidOrders:1,grossAmountMinor:1500,refundedAmountMinor:1500,currency:'USD'});
});
test('refund before payment-completed event prevents a later grant and partial refunds revoke remaining scope',async t=>{
 const env=fixture(t,{LEARNING_PILOT_ENABLED:'0'}),{order,input:receipt}=await paidOrder(env,'study-pack');
 await refundLearningPaidOrder(env,{orderId:order.id,paymentIntentId:receipt.paymentIntentId,eventId:'evt_refund12345',amountRefunded:100});
 assert.equal((await grantLearningPaidOrder(env,receipt)).granted,false);assert.equal((await getLearningUsage(env,USER)).studySessionsRemaining,0);
});
test('a paid writing purchase bound to assignment A cannot pay for assignment B',async t=>{
 const env=fixture(t,{LEARNING_PILOT_ENABLED:'0'}),assignmentA=crypto.randomUUID(),assignmentB=crypto.randomUUID();
 const order=await createLearningPaymentOrder(env,{userId:USER,productId:'writing-project',projectId:assignmentA,requestId:crypto.randomUUID()});
 await updateLearningPaymentOrder(env,{id:order.id,sessionId:'cs_test_bound12345',paymentIntentId:'pi_bound12345'});
 await grantLearningPaidOrder(env,{orderId:order.id,sessionId:'cs_test_bound12345',paymentIntentId:'pi_bound12345',amountTotal:1500,currency:'usd',eventId:'evt_bound12345'});
 await assert.rejects(()=>reserveLearningRun(env,input({projectId:assignmentB})),e=>e.code==='allowance_scope'&&e.status===402);
 assert.equal((await getLearningUsage(env,USER)).projectsRemaining,1);
 const run=await reserveLearningRun(env,input({projectId:assignmentA}));assert.equal(run.status,'reserved');assert.equal((await getLearningUsage(env,USER)).projectsRemaining,0);
});
test('study packs are account-wide and can fund different study projects',async t=>{
 const env=fixture(t,{LEARNING_PILOT_ENABLED:'0'}),{input:receipt}=await paidOrder(env,'study-pack');await grantLearningPaidOrder(env,receipt);
 const a=await reserveLearningRun(env,input({kind:'study'}));await settle(env,a);const b=await reserveLearningRun(env,input({kind:'flashcards'}));await settle(env,b);
 assert.equal((await getLearningUsage(env,USER)).studySessionsRemaining,48);
});
test('owner reports contain aggregate numbers only and cannot be opened by a forged client role',async t=>{
 const env=fixture(t),denied=await handleLearningBilling(request('owner-summary'),{...env,PORTAL_USER:{id:USER,role:'owner'}});assert.equal(denied.status,403);
 const run=await reserveLearningRun(env,input());await settle(env,run);
 const allowed=await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true});assert.equal(allowed.status,200);const text=await allowed.text();assert(!text.includes(USER));assert(!/"(?:prompt|syllabus|studentNotes)"\s*:/.test(text));assert.equal(allowed.headers.get('Cache-Control'),'private, no-store');
 const data=JSON.parse(text);assert.equal(data.usage.confirmedCostMicroUsd,3000);assert.equal(data.usage.estimatedCostMicroUsd,0);assert.equal(data.usage.costMicroUsd,data.usage.confirmedCostMicroUsd+data.usage.estimatedCostMicroUsd);
});

const homeworkTelemetry={workflow:'learning-homework',promptVersion:'homework-guided-v1',cacheMode:'explicit-5m',cacheStatus:'verified',prefixTokens:4096,providerDurationMs:1234,ttftMs:null};
test('native cache counters and bounded server tags survive settlement and replay without changing cost accounting',async t=>{
 const env=fixture(t),step=input({kind:'study',action:'study'}),run=await reserveLearningRun(env,step);
 const measured={input_tokens:900,output_tokens:200,cache_creation_input_tokens:4096,cache_read_input_tokens:16384,...homeworkTelemetry};
 await settle(env,run,{usage:measured});
 const receipt=await getLearningRunUsage(env,USER,step.projectId,step.requestId);
 assert.equal(receipt.model,'claude-sonnet-5-5');assert.equal(receipt.workflow,'learning-homework');assert.equal(receipt.promptVersion,'homework-guided-v1');assert.equal(receipt.cacheMode,'explicit-5m');assert.equal(receipt.cacheStatus,'verified');assert.equal(receipt.cacheOutcome,'hit-and-write');assert.equal(receipt.prefixTokens,4096);assert.equal(receipt.providerDurationMs,1234);assert.equal(receipt.ttftMs,null);assert.equal(receipt.ttftStatus,'not_streamed');
 assert.deepEqual([receipt.inputTokens,receipt.outputTokens,receipt.cacheWriteTokens,receipt.cacheReadTokens],[900,200,4096,16384]);assert.equal(receipt.costMicroUsd,15679);assert.equal(receipt.costBasis,'rate-card-estimate');assert.equal(receipt.estimated,false);
 const before=JSON.stringify(receipt);await settle(env,run,{usage:{...known,workflow:'review',promptVersion:'changed-v2'}});assert.equal(JSON.stringify(await getLearningRunUsage(env,USER,step.projectId,step.requestId)),before,'Idempotent settlement cannot change the original telemetry or charge');
 const monthly=(await getLearningUsage(env,USER)).monthlySpend;assert.equal(monthly.month,'2026-11');assert.equal(monthly.costMicroUsd,15679);assert.equal(monthly.cacheReadTokens,16384);assert.equal(monthly.cacheWriteTokens,4096);assert.equal(monthly.completedRuns,1);assert.equal(monthly.estimatedCostMicroUsd,0);
});
test('per-run receipts require the verified actor and exact project/request scope',async t=>{
 const env=fixture(t),step=input({kind:'study',action:'study'}),run=await reserveLearningRun(env,step);await settle(env,run);
 await assert.rejects(()=>getLearningRunUsage({...env,PORTAL_USER:{id:OTHER}},OTHER,step.projectId,step.requestId),e=>e.status===404);
 await assert.rejects(()=>getLearningRunUsage({...env,PORTAL_USER:{id:OTHER}},USER,step.projectId,step.requestId),e=>e.status===401);
 await assert.rejects(()=>getLearningRunUsage(env,USER,crypto.randomUUID(),step.requestId),e=>e.status===404);
 await assert.rejects(()=>getLearningRunUsage(env,USER,step.projectId,crypto.randomUUID()),e=>e.status===404);
 const own=await getLearningRunUsage(env,USER,step.projectId,step.requestId);assert.equal(own.workflow,'study');assert.equal(own.promptVersion,'legacy');assert.equal(own.providerDurationMs,null);assert.equal(own.cacheOutcome,'not-measured');assert.equal(own.ttftMs,null);
});
test('invalid optional telemetry is discarded without preventing real spend settlement or persisting private text',async t=>{
 const env=fixture(t),step=input({kind:'study',action:'study'}),run=await reserveLearningRun(env,step),privateText='PRIVATE assignment text must never become a telemetry label';
 await settle(env,run,{usage:{...known,workflow:privateText,promptVersion:privateText,cacheMode:privateText,cacheStatus:privateText,prefixTokens:1000001,providerDurationMs:-1,ttftMs:'12',studentNotes:privateText}});
 const receipt=await getLearningRunUsage(env,USER,step.projectId,step.requestId);assert.equal(receipt.workflow,'study');assert.equal(receipt.promptVersion,'legacy');assert.equal(receipt.cacheMode,'unknown');assert.equal(receipt.cacheStatus,'unknown');assert.equal(receipt.prefixTokens,null);assert.equal(receipt.providerDurationMs,null);assert.equal(receipt.ttftMs,null);assert.equal(receipt.costMicroUsd,3000);
 assert(!JSON.stringify(env.DB.row('learning_billing_runs')).includes(privateText));assert(!JSON.stringify(receipt).includes(privateText));
});
test('feedback is reversible, idempotent, completed-run scoped and independent of allowances or charges',async t=>{
 const env=fixture(t),step=input({kind:'study',action:'study'}),run=await reserveLearningRun(env,step);await settle(env,run,{usage:{...known,...homeworkTelemetry}});
 const key={userId:USER,projectId:step.projectId,requestId:step.requestId},balance=await getLearningUsage(env,USER);
 const negative=await setLearningRunFeedback(env,{...key,rating:'nothelpful',reason:'wrong_answer'});assert.equal(negative.feedback.rating,'nothelpful');assert.equal(negative.feedback.reason,'wrong_answer');const stamp=negative.feedback.updatedAt;
 env.LEARNING_NOW=()=>Date.parse('2026-11-28T12:01:00Z');const repeated=await setLearningRunFeedback(env,{...key,rating:'nothelpful',reason:'wrong_answer'});assert.equal(repeated.feedback.updatedAt,stamp);
 const positive=await setLearningRunFeedback(env,{...key,rating:'helpful',reason:'wrong_answer'});assert.equal(positive.feedback.rating,'helpful');assert.equal(positive.feedback.reason,null);
 await setLearningRunFeedback(env,{...key,rating:'nothelpful',reason:'unclear_steps'});const cleared=await setLearningRunFeedback(env,{...key,rating:'clear'});assert.equal(cleared.feedback.rating,null);assert.equal(cleared.feedback.reason,null);
 env.LEARNING_NOW=()=>Date.parse('2026-11-28T12:02:00Z');const clearAgain=await setLearningRunFeedback(env,{...key,rating:'clear'});assert.equal(clearAgain.feedback.updatedAt,cleared.feedback.updatedAt);
 const after=await getLearningUsage(env,USER);assert.equal(after.studySessionsRemaining,balance.studySessionsRemaining);assert.equal(after.dailySpend.costMicroUsd,balance.dailySpend.costMicroUsd);assert.equal(env.DB.row('learning_billing_projects').runs,1);
});
test('feedback cannot be forged for another actor, project, failed or unfinished run and accepts no free text',async t=>{
 const env=fixture(t),pending=input({kind:'study',action:'study'}),reserved=await reserveLearningRun(env,pending),key={userId:USER,projectId:pending.projectId,requestId:pending.requestId};
 await assert.rejects(()=>setLearningRunFeedback(env,{...key,rating:'helpful'}),e=>e.status===404);
 await settle(env,reserved,{succeeded:false});await assert.rejects(()=>setLearningRunFeedback(env,{...key,rating:'helpful'}),e=>e.status===404);
 const step=input({kind:'study',action:'study'}),run=await reserveLearningRun(env,step);await settle(env,run);const completed={userId:USER,projectId:step.projectId,requestId:step.requestId};
 for(const extra of[{rating:'helpful',note:'PRIVATE notes'},{rating:'nothelpful',reason:'PRIVATE notes'},{rating:'anything'},{rating:'clear',status:'completed'}])await assert.rejects(()=>setLearningRunFeedback(env,{...completed,...extra}),e=>e.status===400);
 await assert.rejects(()=>setLearningRunFeedback({...env,PORTAL_USER:{id:OTHER}},{...completed,userId:OTHER,rating:'helpful'}),e=>e.status===404);
 await assert.rejects(()=>setLearningRunFeedback(env,{...completed,projectId:crypto.randomUUID(),rating:'helpful'}),e=>e.status===404);
 assert.equal((await getLearningRunUsage(env,USER,step.projectId,step.requestId)).feedback.rating,null);assert(!JSON.stringify(env.DB.sqlite.prepare('SELECT * FROM learning_billing_runs').all()).includes('PRIVATE notes'));
});
test('unnatural writing style feedback persists as a fixed theme and clears without changing charges',async t=>{
 const env=fixture(t),step=input(),run=await reserveLearningRun(env,step);await settle(env,run);
 const key={userId:USER,projectId:step.projectId,requestId:step.requestId},before=(await getLearningUsage(env,USER)).dailySpend.costMicroUsd;
 const saved=await setLearningRunFeedback(env,{...key,rating:'nothelpful',reason:'unnatural_style'});assert.equal(saved.feedback.reason,'unnatural_style');assert.equal((await getLearningRunUsage(env,USER,step.projectId,step.requestId)).feedback.reason,'unnatural_style');
 let owner=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.equal(owner.cacheSummary.feedback.reasons.unnatural_style,1);assert.equal(owner.cacheSummary.groups[0].feedback.reasons.unnatural_style,1);
 await setLearningRunFeedback(env,{...key,rating:'clear'});owner=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.equal(owner.cacheSummary.feedback.reasons.unnatural_style,0);assert.equal((await getLearningUsage(env,USER)).dailySpend.costMicroUsd,before);
});
test('owner cache groups distinguish versions and models, actual cache hits, timing samples and fixed feedback themes',async t=>{
 const env=fixture(t),a=input({kind:'study',action:'study'}),aRun=await reserveLearningRun(env,a);await settle(env,aRun,{usage:{...known,cache_read_input_tokens:4096,...homeworkTelemetry}});await setLearningRunFeedback(env,{userId:USER,projectId:a.projectId,requestId:a.requestId,rating:'helpful'});
 const b=input({kind:'study',action:'study'}),bRun=await reserveLearningRun(env,b);await settle(env,bRun,{usage:{...known,...homeworkTelemetry,promptVersion:'homework-base-v1',cacheMode:'off',cacheStatus:'disabled',prefixTokens:null,providerDurationMs:2000}});await setLearningRunFeedback(env,{userId:USER,projectId:b.projectId,requestId:b.requestId,rating:'nothelpful',reason:'source_issue'});
 const c=input({kind:'study',action:'study'}),cRun=await reserveLearningRun(env,c);await settle(env,cRun,{model:'claude-opus-5-5',succeeded:false,usage:{...known,...homeworkTelemetry,providerDurationMs:500,ttftMs:250}});
 const report=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.equal(report.cacheSummary.period,'2026-11-28');assert.equal(report.cacheSummary.groups.length,3);assert.equal(report.cacheSummary.groupsTruncated,false);assert.equal(report.cacheSummary.feedback.helpful,1);assert.equal(report.cacheSummary.feedback.notHelpful,1);assert.equal(report.cacheSummary.feedback.reasons.source_issue,1);
 const guided=report.cacheSummary.groups.find(group=>group.model==='claude-sonnet-5-5'&&group.promptVersion==='homework-guided-v1');assert.equal(guided.cacheReadTokens,4096);assert.equal(guided.uncachedInputTokens,1000);assert.equal(guided.cacheHitRuns,1);assert.deepEqual(guided.providerDurationMs,{samples:1,total:1234,average:1234});assert.deepEqual(guided.ttftMs,{samples:0,total:0,average:null});assert.equal(guided.feedback.helpful,1);
 const opus=report.cacheSummary.groups.find(group=>group.model==='claude-opus-5-5');assert.equal(opus.failedRuns,1);assert.deepEqual(opus.ttftMs,{samples:1,total:250,average:250});assert(!JSON.stringify(report).includes(USER));assert(!JSON.stringify(report).includes(a.projectId));assert(!JSON.stringify(report).includes(a.requestId));
 env.LEARNING_NOW=()=>Date.parse('2026-11-29T12:00:00Z');const nextDay=await(await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true})).json();assert.equal(nextDay.cacheSummary.groups.length,0);assert.equal(nextDay.cacheSummary.feedback.helpful,0);assert.equal((await getLearningUsage(env,USER)).monthlySpend.completedRuns,2);
});
test('0022 only adds telemetry columns and preserves pre-existing financial rows without inventing legacy metrics',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const entry of journal.entries.filter(entry=>entry.idx<22))db.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
  const id=crypto.randomUUID(),project=crypto.randomUUID(),request=crypto.randomUUID();db.prepare("INSERT INTO learning_billing_runs(id,user_id,project_id,request_id,action,day,month,status,first_charge,reserved_micro_usd,actual_micro_usd,created_at,lease_until) VALUES(?,?,?,?,?,'2026-11-27','2026-11','completed',1,900000,12345,1,2)").run(id,USER,project,request,'study');
  const migration=readFileSync(new URL('../drizzle/0022_learning_cache_telemetry.sql',import.meta.url),'utf8');assert(!/\b(?:DROP|DELETE|UPDATE|CREATE TABLE)\b/i.test(migration));db.exec(migration);
  const legacy=db.prepare('SELECT * FROM learning_billing_runs WHERE id=?').get(id);assert.equal(legacy.actual_micro_usd,12345);assert.equal(legacy.request_id,request);assert.equal(legacy.workflow,'legacy');assert.equal(legacy.prompt_version,'legacy');assert.equal(legacy.cache_mode,'unknown');assert.equal(legacy.prefix_tokens,null);assert.equal(legacy.provider_duration_ms,null);assert.equal(legacy.ttft_ms,null);assert.equal(legacy.feedback_rating,null);assert.equal(legacy.feedback_updated_at,null);assert.equal(db.prepare('SELECT count(*) AS n FROM learning_billing_runs').get().n,1);
 }finally{db.close();}
});
