import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveLearningRun,settleLearningRun,getLearningUsage,handleLearningBilling,createLearningPaymentOrder,updateLearningPaymentOrder,grantLearningPaidOrder,refundLearningPaidOrder,learningBillingInternals} from './learning-billing.mjs';

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
 const allowed=await handleLearningBilling(request('owner-summary'),{...env,LEARNING_OWNER_AUTHORIZED:true});assert.equal(allowed.status,200);const text=await allowed.text();assert(!text.includes(USER));assert(!/prompt|syllabus|studentNotes/.test(text));assert.equal(allowed.headers.get('Cache-Control'),'private, no-store');
 const data=JSON.parse(text);assert.equal(data.usage.confirmedCostMicroUsd,3000);assert.equal(data.usage.estimatedCostMicroUsd,0);assert.equal(data.usage.costMicroUsd,data.usage.confirmedCostMicroUsd+data.usage.estimatedCostMicroUsd);
});
