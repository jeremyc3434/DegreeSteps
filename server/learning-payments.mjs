/** Server-only hosted Checkout and verified webhook adapter. No browser response grants access. */
const API='https://api.stripe.com/v1',VERSION='2026-11-18.endive',MAX_BODY=262144;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STRIPE_ID=/^(?:cs_(?:test_|live_)?|pi_|ch_|evt_|dp_|re_)[A-Za-z0-9_]{4,240}$/;
class PaymentError extends Error {constructor(status,message,code){super(message);this.status=status;this.code=code;}}
const fail=(status,message,code)=>{throw new PaymentError(status,message,code);};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}});
function configuration(env){
 const key=env.LEARNING_STRIPE_SECRET_KEY,secret=env.LEARNING_STRIPE_WEBHOOK_SECRET,mode=env.LEARNING_STRIPE_MODE;
 if(env.LEARNING_PAYMENTS_ENABLED!=='1'||typeof key!=='string'||! /^(?:rk|sk)_(?:test|live)_[A-Za-z0-9_]{12,300}$/.test(key)||typeof secret!=='string'||!/^whsec_[A-Za-z0-9_]{12,300}$/.test(secret)||!['test','live'].includes(mode)||!key.startsWith('rk_'+mode+'_')&&!key.startsWith('sk_'+mode+'_'))return null;
 return{key,secret,live:mode==='live'};
}
export function learningPaymentsConfigured(env={}){return Boolean(configuration(env));}
export async function handleLearningPayments(request,env={},context={}){
 try{
  const config=configuration(env);if(!config)fail(503,'Purchases are not connected yet. No payment was taken.','payments_unavailable');
  const path=new URL(request.url).pathname;
  if(path.endsWith('/checkout'))return await checkout(request,env,context,config);
  if(path.endsWith('/webhook'))return await webhook(request,env,context,config);
  fail(404,'Payment route not found.','not_found');
 }catch(error){const known=error instanceof PaymentError||Number.isInteger(error?.status)&&[400,401,403,404,409,429].includes(error.status)&&['invalid_request','request_conflict','purchase_closed','checkout_limit','purchase_limit','receipt_conflict','receipt_mismatch','invalid_product','not_found','sign_in_required'].includes(error.code);return json({error:known?error.message:'Payment processing is temporarily unavailable. Try again shortly.',code:known?error.code:'payments_unavailable'},known?error.status:503);}
}

async function bodyText(request){
 const declared=Number(request.headers.get('Content-Length'));if(declared>MAX_BODY){await request.body?.cancel();fail(413,'Payment request is too large.','request_too_large');}
 const reader=request.body?.getReader();if(!reader)fail(400,'Send a payment request.','invalid_request');
 const decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BODY){await reader.cancel();fail(413,'Payment request is too large.','request_too_large');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return text;}catch(error){if(error instanceof PaymentError)throw error;fail(400,'Payment request could not be read.','invalid_request');}
}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function protectWrite(request){if(request.method!=='POST')fail(405,'Use POST for payment requests.','method_not_allowed');if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Learning-Request')!=='1'||!['same-origin','none',null].includes(request.headers.get('Sec-Fetch-Site')))fail(403,'Use the DegreeSteps purchase form.','cross_origin');if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.','invalid_request');}
function userId(actor){if(!/^sb-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actor?.id||''))fail(401,'Sign in before buying course help.','sign_in_required');return actor.id;}
function identifier(value,prefix){if(typeof value!=='string'||!STRIPE_ID.test(value)||!value.startsWith(prefix))fail(400,'The payment receipt is invalid.','invalid_receipt');return value;}
function paymentOrigin(request,env){let url;try{url=new URL(env.LEARNING_PAYMENT_ORIGIN||new URL(request.url).origin);}catch{fail(503,'Checkout needs a verified website address.','payment_configuration');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')fail(503,'Checkout needs a verified website address.','payment_configuration');if(!env.LEARNING_PAYMENT_ORIGIN&&!['degreesteps.com','degreesteps.degreesteps-d215df9a.workers.dev','degreesteps-staging.degreesteps-d215df9a.workers.dev'].includes(url.hostname))fail(503,'Checkout is not configured for this website.','payment_configuration');return url.origin;}
async function stripe(env,config,path,form,idempotencyKey){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await(env.LEARNING_STRIPE_FETCH||fetch)(API+path,{method:form?'POST':'GET',headers:{Authorization:'Bearer '+config.key,'Stripe-Version':VERSION,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(form?{body:form.toString()}:{}),signal:controller.signal,redirect:'manual'});if(!response.ok){await response.body?.cancel();fail(503,'The payment provider is temporarily unavailable. Retry using this same purchase.','payment_provider_unavailable');}const text=await bodyText(response);let data;try{data=JSON.parse(text);}catch{fail(502,'The payment provider returned an invalid receipt.','invalid_receipt');}if(!object(data))fail(502,'The payment provider returned an invalid receipt.','invalid_receipt');return data;}catch(error){if(error instanceof PaymentError)throw error;fail(503,'The payment provider took longer than expected. Retry this same purchase.','payment_provider_unavailable');}finally{clearTimeout(timer);}
}
function productFor(context,id){const product=context.products?.find(item=>item.id===id);if(!product||!['writing-project','study-pack'].includes(id)||!Number.isSafeInteger(product.priceCents)||product.priceCents<100||product.priceCents>100000||String(product.currency).toLowerCase()!=='usd')fail(400,'Choose an available course-help product.','invalid_product');return product;}
function checkedOrder(order,product,owner,projectId){if(!object(order)||!UUID.test(order.id||'')||order.userId!==owner||order.productId!==product.id||order.priceCents!==product.priceCents||String(order.currency).toLowerCase()!=='usd'||(order.projectId||null)!==(projectId||null))fail(409,'This receipt does not match the purchase.','receipt_mismatch');return order;}
function verifySession(session,order,config){
 if(!object(session)||session.object!=='checkout.session'||session.mode!=='payment'||session.livemode!==config.live||session.amount_total!==order.priceCents||String(session.currency).toLowerCase()!=='usd'||session.client_reference_id!==order.id||session.metadata?.application!=='degreesteps-learning'||session.metadata?.learning_order_id!==order.id||session.metadata?.learning_user_id!==order.userId||session.metadata?.learning_product_id!==order.productId||(session.metadata?.learning_project_id||null)!==(order.projectId||null)||order.sessionId&&session.id!==order.sessionId)fail(400,'The payment receipt does not match this purchase.','receipt_mismatch');identifier(session.id,'cs_');
}
function checkoutURL(value){let url;try{url=new URL(value);}catch{fail(502,'The payment provider did not return a checkout page.','invalid_receipt');}if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port)fail(502,'The payment provider returned an invalid checkout page.','invalid_receipt');return url.href;}
async function checkout(request,env,context,config){
 protectWrite(request);const owner=userId(context.actor);let input;try{input=JSON.parse(await bodyText(request));}catch(error){if(error instanceof PaymentError)throw error;fail(400,'Send a valid purchase request.','invalid_request');}
 if(!object(input)||Object.keys(input).some(key=>!['productId','projectId','requestId'].includes(key))||typeof input.requestId!=='string'||!UUID.test(input.requestId))fail(400,'Send the selected product and purchase request ID.','invalid_request');
 const product=productFor(context,input.productId);let projectId=input.projectId||null;if(projectId&&(typeof projectId!=='string'||!UUID.test(projectId)))fail(400,'Choose a valid project.','invalid_request');if(projectId)projectId=projectId.toLowerCase();
 if(product.id==='writing-project'&&!projectId)fail(400,'Open the writing project before purchasing help.','project_required');
 if(projectId&&(typeof context.projectOwned!=='function'||await context.projectOwned(owner,projectId)!==true))fail(404,'Project not found.','project_not_found');
 const origin=paymentOrigin(request,env),order=checkedOrder(await context.createOrder({userId:owner,productId:product.id,projectId,requestId:input.requestId}),product,owner,projectId);
 if(order.status!=='pending')fail(409,'This purchase is already complete or closed. Refresh your allowance before buying again.','purchase_closed');
 let session;
 if(order.sessionId)session=await stripe(env,config,'/checkout/sessions/'+encodeURIComponent(identifier(order.sessionId,'cs_')));
 else{
  const query=new URLSearchParams();if(projectId)query.set('projectId',projectId);query.set('purchase','success');
  const cancel=new URLSearchParams(query);cancel.set('purchase','cancelled');
  const form=new URLSearchParams({mode:'payment',success_url:origin+'/learn.html?'+query,cancel_url:origin+'/learn.html?'+cancel,client_reference_id:order.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(product.priceCents),'line_items[0][price_data][product_data][name]':String(product.name||product.label),'adaptive_pricing[enabled]':'false',integration_identifier:'degreesteps_course_help_'+order.id.replaceAll('-','').slice(0,8).replace(/[0-9a-f]/gi,c=>'abcdefghijklmnop'[parseInt(c,16)])});
  const metadata={application:'degreesteps-learning',learning_order_id:order.id,learning_user_id:owner,learning_product_id:product.id,...(projectId?{learning_project_id:projectId}:{})};for(const[key,value]of Object.entries(metadata)){form.set('metadata['+key+']',value);form.set('payment_intent_data[metadata]['+key+']',value);}
  session=await stripe(env,config,'/checkout/sessions',form,'degreesteps-learning-order-'+order.id);
 }
 verifySession(session,order,config);if(session.status!=='open'||session.payment_status!=='unpaid')fail(409,'This checkout is closed. Refresh your allowance or start a new purchase.','purchase_closed');const url=checkoutURL(session.url);
 await context.updateOrder({id:order.id,sessionId:session.id,...(typeof session.payment_intent==='string'?{paymentIntentId:session.payment_intent}:{})});return json({url,sessionId:session.id,orderId:order.id},201);
}
async function signature(raw,header,secret,stamp){
 if(typeof header!=='string'||header.length>2048)fail(400,'Payment signature is missing.','invalid_signature');
 const parts=header.split(',').map(part=>part.trim().split('=')),times=parts.filter(p=>p[0]==='t'),signatures=parts.filter(p=>p[0]==='v1').map(p=>p[1]);
 if(times.length!==1||!/^\d{1,12}$/.test(times[0][1]||'')||signatures.length<1||signatures.length>5||signatures.some(s=>!/^[a-f0-9]{64}$/.test(s)))fail(400,'Payment signature is invalid.','invalid_signature');
 const time=Number(times[0][1]);if(Math.abs(Math.floor(stamp/1000)-time)>300)fail(400,'Payment signature has expired.','invalid_signature');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const result=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(time+'.'+raw)));const hex=[...result].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(!signatures.some(value=>{let diff=0;for(let i=0;i<64;i++)diff|=value.charCodeAt(i)^hex.charCodeAt(i);return diff===0;}))fail(400,'Payment signature is invalid.','invalid_signature');
}
async function orderForSession(context,session){const orderId=session.metadata?.learning_order_id;if(!UUID.test(orderId||''))return null;return context.findOrder({id:orderId});}
function intentId(value){return identifier(typeof value==='string'?value:value?.id,'pi_');}
async function webhook(request,env,context,config){
 if(request.method!=='POST')fail(405,'Use POST for payment events.','method_not_allowed');const raw=await bodyText(request);await signature(raw,request.headers.get('Stripe-Signature'),config.secret,typeof env.LEARNING_NOW==='function'?env.LEARNING_NOW():Date.now());
 let event;try{event=JSON.parse(raw);}catch{fail(400,'Payment event is invalid.','invalid_event');}if(!object(event)||!object(event.data?.object)||event.livemode!==config.live)fail(400,'Payment event mode is invalid.','invalid_event');identifier(event.id,'evt_');
 const type=event.type,objectData=event.data.object;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(type)){
  const session=await stripe(env,config,'/checkout/sessions/'+encodeURIComponent(identifier(objectData.id,'cs_')));if(session.metadata?.application!=='degreesteps-learning')return json({received:true,ignored:true});
  const order=await orderForSession(context,session);if(!order)fail(409,'The purchase record is not ready. Retry this event.','order_not_ready');verifySession(session,order,config);
  if(type==='checkout.session.expired'||type==='checkout.session.async_payment_failed'){if(session.payment_status!=='paid')await context.updateOrder({id:order.id,sessionId:session.id,status:'expired'});return json({received:true,granted:false});}
  if(session.payment_status!=='paid')return json({received:true,granted:false});
  const intent=intentId(session.payment_intent);await context.updateOrder({id:order.id,sessionId:session.id,paymentIntentId:intent});const result=await context.grantOrder({orderId:order.id,sessionId:session.id,paymentIntentId:intent,amountTotal:session.amount_total,currency:session.currency,eventId:event.id});return json({received:true,granted:result.granted===true});
 }
 if(['charge.refunded','refund.updated','charge.dispute.created','charge.dispute.funds_withdrawn'].includes(type)){
  if(!objectData.payment_intent)return json({received:true,ignored:true});
  const intent=intentId(objectData.payment_intent),payment=await stripe(env,config,'/payment_intents/'+encodeURIComponent(intent)+'?expand[]=latest_charge');if(payment.metadata?.application!=='degreesteps-learning')return json({received:true,ignored:true});
  const orderId=payment.metadata?.learning_order_id,order=UUID.test(orderId||'')?await context.findOrder({id:orderId}):null;if(!order)fail(409,'The purchase record is not ready. Retry this event.','order_not_ready');
  if(payment.id!==intent||payment.livemode!==config.live||payment.amount!==order.priceCents||payment.currency!=='usd'||payment.metadata?.learning_user_id!==order.userId||payment.metadata?.learning_product_id!==order.productId||order.paymentIntentId&&order.paymentIntentId!==intent)fail(400,'The refund receipt does not match this purchase.','receipt_mismatch');
  const charge=payment.latest_charge;if(!object(charge))fail(503,'Refund verification is not ready. Retry this event.','refund_unavailable');
  let refunded=charge.amount_refunded;if(type.startsWith('charge.dispute.')){if(charge.disputed!==true)return json({received:true,revoked:false});refunded=order.priceCents;}
  if(!Number.isSafeInteger(refunded)||refunded<0||refunded>order.priceCents)fail(400,'The refund amount is invalid.','receipt_mismatch');if(refunded===0)return json({received:true,revoked:false});
  await context.updateOrder({id:order.id,paymentIntentId:intent});const result=await context.refundOrder({orderId:order.id,paymentIntentId:intent,eventId:event.id,amountRefunded:refunded});return json({received:true,revoked:result.revoked===true});
 }
 return json({received:true,ignored:true});
}
