import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleLearningBilling,getLearningUsage} from './learning-billing.mjs';
import {learningPaymentsConfigured,handleLearningPayments} from './learning-payments.mjs';
const origin='https://degreesteps.com',owner='sb-11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333',orderId='44444444-4444-4444-8444-444444444444';
const sessionId='cs_test_'+'synthetic001',intent='pi_'+'synthetic001',stamp=1795823999000;
const products=[{id:'writing-project',name:'Writing project',priceCents:1500,currency:'USD',units:1},{id:'study-pack',name:'50 study questions',priceCents:900,currency:'USD',units:50}];
function fixture(){
 const orders=new Map(),calls=[],grants=[],refunds=[],owned=[];
 const env={LEARNING_ENABLED:'1',LEARNING_PAYMENTS_ENABLED:'1',LEARNING_STRIPE_MODE:'test',LEARNING_STRIPE_SECRET_KEY:'rk_'+'test_'+'synthetic'.repeat(4),LEARNING_STRIPE_WEBHOOK_SECRET:'whsec_'+'synthetic'.repeat(4),LEARNING_NOW:()=>stamp};
 const session={id:sessionId,object:'checkout.session',mode:'payment',livemode:false,status:'open',payment_status:'unpaid',amount_total:1500,currency:'usd',client_reference_id:orderId,payment_intent:intent,url:'https://checkout.stripe.com/c/pay/'+sessionId,metadata:{application:'degreesteps-learning',learning_order_id:orderId,learning_user_id:owner,learning_product_id:'writing-project',learning_project_id:project}};
 const payment={id:intent,object:'payment_intent',livemode:false,amount:1500,currency:'usd',metadata:{...session.metadata},latest_charge:{id:'ch_synthetic001',amount_refunded:0,disputed:false}};
 env.LEARNING_STRIPE_FETCH=async(url,options)=>{calls.push({url,options});assert(url.startsWith('https://api.stripe.com/v1/'));assert.equal(options.redirect,'manual');assert.equal(options.headers['Stripe-Version'],'2026-11-18.endive');assert.equal(options.headers.Authorization,'Bearer '+env.LEARNING_STRIPE_SECRET_KEY);return Response.json(url.includes('/payment_intents/')?payment:session);};
 const context={actor:{id:owner},products,projectOwned:async(user,id)=>{owned.push({user,id});return user===owner&&id===project;},createOrder:async input=>{let order=orders.get(orderId);if(!order){order={id:orderId,...input,priceCents:products.find(p=>p.id===input.productId).priceCents,currency:'usd',status:'pending',sessionId:null,paymentIntentId:null};orders.set(orderId,order);}return{...order};},updateOrder:async input=>{const order=orders.get(input.id);Object.assign(order,Object.fromEntries(Object.entries(input).filter(([k])=>k!=='id')));return{...order};},findOrder:async({id,sessionId:s,paymentIntentId:p})=>{const order=id?orders.get(id):[...orders.values()].find(o=>s?o.sessionId===s:o.paymentIntentId===p);return order?{...order}:null;},grantOrder:async input=>{const order=orders.get(input.orderId);const granted=order.status==='pending';if(granted){order.status='paid';grants.push(input);}return{granted,order:{...order}};},refundOrder:async input=>{const order=orders.get(input.orderId);const revoked=order.status!=='refunded';order.status='refunded';order.amountRefunded=Math.max(order.amountRefunded||0,input.amountRefunded);if(revoked)refunds.push(input);return{revoked,order:{...order}};}};
 return{env,context,orders,calls,grants,refunds,owned,session,payment};
}
function purchase(body={productId:'writing-project',projectId:project,requestId},headers={}){return new Request(origin+'/api/learning/billing/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Learning-Request':'1',...headers},body:JSON.stringify(body)});}
async function buy(f){const response=await handleLearningPayments(purchase(),f.env,f.context);assert.equal(response.status,201,await response.clone().text());return response;}
function event(type='checkout.session.completed',object={id:sessionId},patch={}){return{id:'evt_'+'synthetic001',type,livemode:false,data:{object},...patch};}
function hook(f,data=event(),{raw,signature,timestamp=Math.floor(stamp/1000)}={}){raw??=JSON.stringify(data);signature??='t='+timestamp+',v1='+createHmac('sha256',f.env.LEARNING_STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');return new Request(origin+'/api/learning/billing/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},body:raw});}
async function deliver(f,data,options){return handleLearningPayments(hook(f,data,options),f.env,f.context);}

test('payment configuration fails closed unless flag, mode and matching server secrets are present',async()=>{
 const f=fixture();assert(learningPaymentsConfigured(f.env));for(const patch of[{LEARNING_PAYMENTS_ENABLED:'0'},{LEARNING_STRIPE_MODE:'live'},{LEARNING_STRIPE_SECRET_KEY:undefined},{LEARNING_STRIPE_WEBHOOK_SECRET:''},{LEARNING_STRIPE_SECRET_KEY:'pk_'+'test_'+'x'.repeat(25)}]){const env={...f.env,...patch};assert.equal(learningPaymentsConfigured(env),false);assert.equal((await handleLearningPayments(purchase(),env,f.context)).status,503);}assert.equal(f.calls.length,0);
});
test('Checkout is account-owned and server-priced; no success return grants an allowance',async()=>{
 const f=fixture(),response=await buy(f),data=await response.json();assert.equal(data.url,f.session.url);assert.equal(f.owned[0].user,owner);assert.equal(f.owned[0].id,project);assert.equal(f.grants.length,0);const options=f.calls[0].options,form=new URLSearchParams(options.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'1500');assert.equal(form.get('line_items[0][quantity]'),'1');assert.equal(form.get('metadata[learning_user_id]'),owner);assert.equal(form.get('payment_intent_data[metadata][learning_order_id]'),orderId);assert.equal(form.get('payment_method_types[0]'),null);assert.match(form.get('integration_identifier'),/^degreesteps_course_help_[a-z]{8}$/);assert.equal(new URL(form.get('success_url')).origin,origin);assert.match(options.headers['Idempotency-Key'],new RegExp(orderId));assert(!JSON.stringify(data).includes(f.env.LEARNING_STRIPE_SECRET_KEY));assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('forged identity, foreign project, client pricing and external-return parameters never reach Stripe',async()=>{
 for(const run of[async f=>{f.context.actor=null;return handleLearningPayments(purchase(),f.env,f.context);},async f=>{f.context.projectOwned=async()=>false;return handleLearningPayments(purchase(),f.env,f.context);},async f=>handleLearningPayments(purchase({productId:'writing-project',projectId:project,requestId,amount:1}),f.env,f.context),async f=>handleLearningPayments(purchase({productId:'writing-project',projectId:project,requestId,returnTo:'https://attacker.invalid'}),f.env,f.context),async f=>handleLearningPayments(purchase(undefined,{Origin:'https://attacker.invalid'}),f.env,f.context)]){const f=fixture(),response=await run(f);assert([400,401,403,404].includes(response.status));assert.equal(f.calls.length,0);}
});
test('writing purchase requires a project while a study pack can be purchased account-wide',async()=>{
 const f=fixture();assert.equal((await handleLearningPayments(purchase({productId:'writing-project',requestId}),f.env,f.context)).status,400);f.session.amount_total=900;f.session.metadata.learning_product_id='study-pack';delete f.session.metadata.learning_project_id;const response=await handleLearningPayments(purchase({productId:'study-pack',requestId}),f.env,f.context);assert.equal(response.status,201);assert.equal(f.owned.length,0);assert.equal(new URLSearchParams(f.calls[0].options.body).get('line_items[0][price_data][unit_amount]'),'900');
});
test('retry retrieves the original session instead of creating another checkout',async()=>{
 const f=fixture();await buy(f);await buy(f);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(f.calls[1].options.method,'GET');assert(f.calls[1].url.endsWith('/checkout/sessions/'+sessionId));
});
test('unexpected redirects, error bodies and malformed checkout addresses never expose credentials or grant access',async()=>{
 for(const response of[new Response('private-error-key',{status:302,headers:{Location:'https://attacker.invalid'}}),new Response('private-error-key',{status:500}),new Response('invalid private body')]){const f=fixture();f.env.LEARNING_STRIPE_FETCH=async()=>response;const result=await handleLearningPayments(purchase(),f.env,f.context);assert(result.status>=500);assert(!(await result.text()).includes('private-error-key'));assert.equal(f.grants.length,0);}const f=fixture();f.session.url='https://checkout.stripe.com.attacker.invalid/c/pay';assert.equal((await handleLearningPayments(purchase(),f.env,f.context)).status,502);
});
test('signed paid webhook retrieves authoritative receipt and grants only once across completed/async replay',async()=>{
 const f=fixture();await buy(f);f.session.status='complete';f.session.payment_status='paid';const first=await deliver(f,event());assert.equal(first.status,200,await first.clone().text());assert.equal((await first.json()).granted,true);const second=await deliver(f,event('checkout.session.async_payment_succeeded',{id:sessionId},{id:'evt_synthetic002'}));assert.equal(second.status,200);assert.equal((await second.json()).granted,false);assert.equal(f.grants.length,1);assert.equal(f.grants[0].amountTotal,1500);assert.equal(f.grants[0].paymentIntentId,intent);assert(f.calls.slice(1).every(c=>c.options.method==='GET'));
});
test('unpaid completed event waits for async success rather than granting early',async()=>{
 const f=fixture();await buy(f);const pending=await deliver(f,event());assert.equal(pending.status,200);assert.equal(f.grants.length,0);f.session.status='complete';f.session.payment_status='paid';await deliver(f,event('checkout.session.async_payment_succeeded'));assert.equal(f.grants.length,1);
});
test('invalid signatures, modified bodies, stale/future timestamps and mode mismatch are rejected before grant',async()=>{
 const f=fixture();await buy(f);const before=f.calls.length;for(const options of[{signature:'t=1,v1='+'0'.repeat(64)},{timestamp:Math.floor(stamp/1000)-301},{timestamp:Math.floor(stamp/1000)+301},{signature:'t='+Math.floor(stamp/1000)+',v1='+'0'.repeat(64)}]){assert.equal((await deliver(f,event(),options)).status,400);}assert.equal(f.calls.length,before);assert.equal((await deliver(f,event(undefined,undefined,{livemode:true}))).status,400);assert.equal(f.grants.length,0);
});
test('paid receipts with forged amount, currency, owner, product or livemode cannot grant',async()=>{
 for(const patch of[{amount_total:1},{currency:'eur'},{livemode:true},{metadata:{learning_user_id:'sb-other'}},{metadata:{learning_product_id:'unknown'}}]){const f=fixture();await buy(f);f.session.payment_status='paid';if(patch.metadata)Object.assign(f.session.metadata,patch.metadata);else Object.assign(f.session,patch);const response=await deliver(f,event());assert.equal(response.status,400,await response.clone().text());assert.equal(f.grants.length,0);}
});
test('expired checkout cannot grant and unrelated payment events are safely ignored',async()=>{
 const f=fixture();await buy(f);f.session.status='expired';await deliver(f,event('checkout.session.expired'));assert.equal(f.orders.get(orderId).status,'expired');assert.equal(f.grants.length,0);const ignored=await deliver(f,event('customer.updated',{id:'cus_example'}));assert.equal(ignored.status,200);assert.equal((await ignored.json()).ignored,true);
});
test('verified partial refund conservatively revokes remaining grant and duplicate events do not revoke twice',async()=>{
 const f=fixture();await buy(f);f.session.payment_status='paid';await deliver(f,event());f.payment.latest_charge.amount_refunded=500;const refund=event('charge.refunded',{id:'ch_synthetic001',payment_intent:intent},{id:'evt_refund0001'});const result=await deliver(f,refund);assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).revoked,true);await deliver(f,refund);assert.equal(f.refunds.length,1);assert.equal(f.refunds[0].amountRefunded,500);assert.equal(f.orders.get(orderId).status,'refunded');
});
test('refund arriving before completed event prevents a delayed paid grant',async()=>{
 const f=fixture();await buy(f);f.payment.latest_charge.amount_refunded=1500;await deliver(f,event('charge.refunded',{payment_intent:intent}));f.session.payment_status='paid';await deliver(f,event());assert.equal(f.grants.length,0);assert.equal(f.orders.get(orderId).status,'refunded');
});
test('disputed payment revokes future use using the verified payment intent, not untrusted event amounts',async()=>{
 const f=fixture();await buy(f);f.session.payment_status='paid';await deliver(f,event());f.payment.latest_charge.disputed=true;const response=await deliver(f,event('charge.dispute.created',{payment_intent:intent,amount:1}));assert.equal(response.status,200);assert.equal(f.refunds[0].amountRefunded,1500);
});

test('actual D1 billing integration grants a paid study pack exactly once and revokes it after a verified refund',async t=>{
 const f=fixture(),sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));for(const entry of journal.entries)sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
 let queue=Promise.resolve();f.env.DB={prepare(sql){const query=sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};},batch(statements){const job=queue.then(async()=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}});queue=job.catch(()=>{});return job;}};
 f.env.PORTAL_USER={id:owner};f.env.LEARNING_PILOT_ENABLED='0';f.env.LEARNING_PROJECT_OWNED=async(user,id)=>user===owner&&id===project;
 f.session.amount_total=900;f.payment.amount=900;
 f.env.LEARNING_STRIPE_FETCH=async(url,options)=>{if(options.method==='POST'){const form=new URLSearchParams(options.body);f.session.client_reference_id=form.get('client_reference_id');f.session.metadata=Object.fromEntries([...form].filter(([key])=>key.startsWith('metadata[')).map(([key,value])=>[key.slice(9,-1),value]));f.payment.metadata={...f.session.metadata};}return Response.json(url.includes('/payment_intents/')?f.payment:f.session);};
 const checkout=await handleLearningBilling(purchase({productId:'study-pack',requestId}),f.env);assert.equal(checkout.status,201,await checkout.clone().text());assert.equal((await getLearningUsage(f.env,owner)).studySessionsRemaining,0);
 f.session.status='complete';f.session.payment_status='paid';const paid=await handleLearningBilling(hook(f,event()),f.env);assert.equal(paid.status,200,await paid.clone().text());assert.equal((await getLearningUsage(f.env,owner)).studySessionsRemaining,50);
 await handleLearningBilling(hook(f,event('checkout.session.async_payment_succeeded',{id:sessionId},{id:'evt_duplicate002'})),f.env);assert.equal((await getLearningUsage(f.env,owner)).studySessionsRemaining,50);
 f.payment.latest_charge.amount_refunded=100;const refunded=await handleLearningBilling(hook(f,event('charge.refunded',{payment_intent:intent},{id:'evt_actualrefund001'})),f.env);assert.equal(refunded.status,200,await refunded.clone().text());assert.equal((await getLearningUsage(f.env,owner)).studySessionsRemaining,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM learning_billing_orders').get().n,1);
 await handleLearningBilling(hook(f,event()),f.env);assert.equal((await getLearningUsage(f.env,owner)).studySessionsRemaining,0,'a late completion must not reactivate refunded credit');
});
