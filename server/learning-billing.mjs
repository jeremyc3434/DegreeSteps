/** Server-owned project allowances and conservative AI spend accounting.
 * D1 contains identifiers, usage and receipts only. No assignment text is stored here.
 * Every reservation and settlement is a single atomic provider batch. */
import {learningPaymentsConfigured,handleLearningPayments} from './learning-payments.mjs';

const learningBillingApi=(()=>{
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const USER=/^sb-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const PRODUCTS=Object.freeze([
    Object.freeze({id:'writing-project',name:'Writing project',label:'Writing project',priceCents:1500,currency:'USD',units:1,kind:'writing',description:'One writing, discussion or presentation project, with up to 12 AI steps and related follow-ups.'}),
    Object.freeze({id:'study-pack',name:'50 study questions',label:'50 study questions',priceCents:900,currency:'USD',units:50,kind:'study',description:'50 study projects. Explanations and related follow-ups stay together, with up to 12 AI steps per project.'})
  ]);
  const PRICES=Object.freeze({'claude-sonnet-5-5':{input:2,output:10,write:2.5,hour:4,read:.1},'claude-opus-5-5':{input:4,output:20,write:5,hour:8,read:.2}});
  const LEASE=10*60*1000,MAX_RUNS=12,MAX_CALLS=50;
  class Problem extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new Problem(status,message,code);};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}});
  const now=env=>typeof env.LEARNING_NOW==='function'?env.LEARNING_NOW():Date.now();
  const dayOf=stamp=>new Date(stamp).toISOString().slice(0,10),monthOf=stamp=>dayOf(stamp).slice(0,7);
  const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const first=async(db,sql,...values)=>await stmt(db,sql,...values).first();
  const all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[];
  const requireDB=env=>{if(!env.DB?.prepare||!env.DB?.batch)fail(503,'Usage tracking is temporarily unavailable. Your work has not changed.','billing_unavailable');return env.DB;};
  function actor(env,userId){if(typeof userId!=='string'||!USER.test(userId)||env.PORTAL_USER?.id!==userId)fail(401,'Sign in to use your course allowance.','sign_in_required');return userId.toLowerCase();}
  function uuid(value,name){if(typeof value!=='string'||!UUID.test(value))fail(400,'Include a valid '+name+'.','invalid_request');return value.toLowerCase();}
  function limits(env){
    const amount=(name,fallback,max)=>{const raw=env[name];if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isFinite(n)||n<0||n>max)fail(503,'Course usage limits need attention.','billing_configuration');return Math.floor(n*1e6);};
    return{dailyMicroUsdCap:amount('LEARNING_DAILY_USD_CAP',10000000,1000),accountDailyMicroUsdCap:amount('LEARNING_ACCOUNT_DAILY_USD_CAP',4000000,100),maxRunsPerProject:MAX_RUNS,maxCallsPerDay:MAX_CALLS};
  }
  function pilot(env){return env.LEARNING_PILOT_ENABLED==='1';}
  function bucket(kind){if(['writing','presentation','discussion'].includes(kind))return'writing';if(['study','quiz','flashcards'].includes(kind))return'study';fail(400,'Choose a supported project type.','invalid_request');}
  function accountStatement(env,userId,stamp){const month=monthOf(stamp),writing=pilot(env)?1:0,study=pilot(env)?10:0;return stmt(env.DB,`INSERT INTO learning_billing_accounts(user_id,month,writing_remaining,study_remaining,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET writing_remaining=CASE WHEN month<>excluded.month THEN excluded.writing_remaining ELSE writing_remaining END,study_remaining=CASE WHEN month<>excluded.month THEN excluded.study_remaining ELSE study_remaining END,month=excluded.month,updated_at=excluded.updated_at WHERE learning_billing_accounts.month<=excluded.month`,userId,month,writing,study,stamp);}
  async function usage(env,userId){
    const id=actor(env,userId),db=requireDB(env),stamp=now(env),month=monthOf(stamp);
    if(pilot(env))await db.batch([accountStatement(env,id,stamp)]);
    const account=await first(db,'SELECT * FROM learning_billing_accounts WHERE user_id=? AND month=?',id,month);
    const paid=await all(db,"SELECT bucket,COALESCE(SUM(units_remaining),0) AS units FROM learning_billing_orders WHERE user_id=? AND status='paid' GROUP BY bucket",id);
    const available=Object.fromEntries(paid.map(row=>[row.bucket,row.units]));
    const writing=(pilot(env)?Number(account?.writing_remaining||0):0)+Number(available.writing||0),study=(pilot(env)?Number(account?.study_remaining||0):0)+Number(available.study||0);
    const today=await first(db,'SELECT actual_micro_usd,reserved_micro_usd,calls FROM learning_billing_user_days WHERE user_id=? AND day=?',id,dayOf(stamp));
    return{period:month,projectsRemaining:writing,studySessionsRemaining:study,studyQuestionsRemaining:study,pilotEnabled:pilot(env),label:pilot(env)?'Pilot allowance · resets monthly':'Purchased allowance',followUpsPerProject:MAX_RUNS,dailySpend:{day:dayOf(stamp),costMicroUsd:today?.actual_micro_usd||0,reservedMicroUsd:today?.reserved_micro_usd||0,calls:today?.calls||0}};
  }
  function validCount(value){return Number.isSafeInteger(value)&&value>=0&&value<=100000000;}
  function costOf(model,usage,reserved=0){
    const p=PRICES[model],u=usage&&typeof usage==='object'?usage:{};
    const inputs=u.input_tokens,outputs=u.output_tokens,writes=u.cache_creation_input_tokens??0,reads=u.cache_read_input_tokens??0,hour=u.cache_creation?.ephemeral_1h_input_tokens??0,searches=u.server_tool_use?.web_search_requests??u.web_search_requests??0;
    const valid=p&&[inputs,outputs,writes,reads,hour,searches].every(validCount)&&hour<=writes;
    const safe=value=>validCount(value)?value:0,known=p?Math.ceil(safe(inputs)*p.input+safe(outputs)*p.output+Math.max(0,safe(writes)-safe(hour))*p.write+safe(hour)*p.hour+safe(reads)*p.read+safe(searches)*10000):0;
    const estimated=u.unknown===true||!valid;
    return{costMicroUsd:estimated?Math.max(reserved,known):known,estimated,inputTokens:valid?inputs:0,outputTokens:valid?outputs:0,cacheWriteTokens:valid?writes:0,cacheReadTokens:valid?reads:0,searches:valid?searches:0};
  }
  async function reserve(env,input){
    if(env.LEARNING_ENABLED!=='1')fail(404,'Course help is not available.','not_found');
    const userId=actor(env,input.userId),db=requireDB(env),projectId=uuid(input.projectId,'project ID'),requestId=uuid(input.requestId,'request ID'),kind=bucket(input.kind),action=String(input.action||'');
    if(!['plan','draft','review','study','quiz','flashcards','presentation','discussion'].includes(action))fail(400,'Choose a supported project action.','invalid_request');
    const max=input.maxCostMicroUsd;
    if(!Number.isSafeInteger(max)||max<1||max>5000000)fail(503,'A safe project budget is required before starting AI.','billing_configuration');
    const prior=await first(db,'SELECT * FROM learning_billing_runs WHERE user_id=? AND request_id=?',userId,requestId);
    if(prior){if(prior.project_id!==projectId||prior.action!==action)fail(409,'This request belongs to a different project step.','request_conflict');if(prior.status==='completed')return{id:prior.id,status:'completed'};if(prior.status==='reserved')fail(409,'This project step is already running. Wait before trying again.','run_in_progress');fail(409,'That attempt ended. Start a new attempt to retry.','request_already_used');}
    const stamp=now(env),day=dayOf(stamp),month=monthOf(stamp),settings=limits(env);
    const pending=await first(db,"SELECT r.* FROM learning_billing_runs r JOIN learning_billing_projects p ON p.active_run_id=r.id WHERE p.project_id=? AND p.user_id=? AND r.status='reserved'",projectId,userId);
    if(pending&&pending.lease_until<stamp)await settle(env,{reservationId:pending.id,userId,model:pending.model||'claude-sonnet-5-5',usage:{unknown:true},succeeded:false});
    const runId=crypto.randomUUID(),pilotOn=pilot(env)?1:0;
    await db.batch([
      accountStatement(env,userId,stamp),
      stmt(db,'INSERT INTO learning_billing_days(day) VALUES(?) ON CONFLICT(day) DO NOTHING',day),
      stmt(db,'INSERT INTO learning_billing_user_days(user_id,day) VALUES(?,?) ON CONFLICT(user_id,day) DO NOTHING',userId,day),
      stmt(db,"INSERT INTO learning_billing_projects(project_id,user_id,bucket,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id) DO NOTHING",projectId,userId,kind,stamp),
      stmt(db,`INSERT INTO learning_billing_runs(id,user_id,project_id,request_id,action,day,month,status,first_charge,credit_source,grant_order_id,reserved_micro_usd,created_at,lease_until)
        SELECT ?,p.user_id,p.project_id,?,?,?,?,'reserved',CASE WHEN p.state='active' THEN 0 ELSE 1 END,
        CASE WHEN p.state='active' THEN p.credit_source WHEN ?=1 AND CASE WHEN p.bucket='writing' THEN a.writing_remaining ELSE a.study_remaining END>0 THEN 'pilot' ELSE 'paid' END,
        CASE WHEN p.state='active' THEN p.grant_order_id WHEN ?=1 AND CASE WHEN p.bucket='writing' THEN a.writing_remaining ELSE a.study_remaining END>0 THEN NULL ELSE (SELECT id FROM learning_billing_orders WHERE user_id=p.user_id AND bucket=p.bucket AND status='paid' AND units_remaining>0 AND (project_id IS NULL OR project_id=p.project_id) ORDER BY created_at,id LIMIT 1) END,?,?,?
        FROM learning_billing_projects p JOIN learning_billing_accounts a ON a.user_id=p.user_id JOIN learning_billing_days d ON d.day=? JOIN learning_billing_user_days u ON u.user_id=p.user_id AND u.day=d.day
        WHERE p.project_id=? AND p.user_id=? AND p.bucket=? AND a.month=? AND p.state IN ('new','active') AND p.active_run_id IS NULL AND p.runs<? AND u.calls<?
        AND d.actual_micro_usd+d.reserved_micro_usd+?<=? AND u.actual_micro_usd+u.reserved_micro_usd+?<=?
        AND (p.state='active' OR (?=1 AND CASE WHEN p.bucket='writing' THEN a.writing_remaining ELSE a.study_remaining END>0) OR EXISTS(SELECT 1 FROM learning_billing_orders WHERE user_id=p.user_id AND bucket=p.bucket AND status='paid' AND units_remaining>0 AND (project_id IS NULL OR project_id=p.project_id)))
        ON CONFLICT(user_id,request_id) DO NOTHING`,runId,requestId,action,day,month,pilotOn,pilotOn,max,stamp,stamp+LEASE,day,projectId,userId,kind,month,MAX_RUNS,MAX_CALLS,max,settings.dailyMicroUsdCap,max,settings.accountDailyMicroUsdCap,pilotOn),
      stmt(db,`UPDATE learning_billing_days SET reserved_micro_usd=reserved_micro_usd+? WHERE day=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=?)`,max,day,runId),
      stmt(db,`UPDATE learning_billing_user_days SET reserved_micro_usd=reserved_micro_usd+?,calls=calls+1 WHERE user_id=? AND day=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=?)`,max,userId,day,runId),
      stmt(db,`UPDATE learning_billing_accounts SET writing_remaining=writing_remaining-CASE WHEN ?='writing' THEN 1 ELSE 0 END,study_remaining=study_remaining-CASE WHEN ?='study' THEN 1 ELSE 0 END WHERE user_id=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND first_charge=1 AND credit_source='pilot')`,kind,kind,userId,runId),
      stmt(db,"UPDATE learning_billing_orders SET units_remaining=units_remaining-1 WHERE id=(SELECT grant_order_id FROM learning_billing_runs WHERE id=? AND first_charge=1 AND credit_source='paid')",runId),
      stmt(db,`UPDATE learning_billing_projects SET active_run_id=?,state=CASE WHEN state='active' THEN state ELSE 'pending' END,credit_source=(SELECT credit_source FROM learning_billing_runs WHERE id=?),grant_order_id=(SELECT grant_order_id FROM learning_billing_runs WHERE id=?),credit_month=?,updated_at=? WHERE project_id=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=?)`,runId,runId,runId,month,stamp,projectId,runId)
    ]);
    const row=await first(db,'SELECT * FROM learning_billing_runs WHERE id=?',runId);
    if(row)return{id:row.id,status:row.status,reservedMicroUsd:row.reserved_micro_usd};
    const conflict=await first(db,'SELECT project_id,status FROM learning_billing_runs WHERE user_id=? AND request_id=?',userId,requestId);
    if(conflict)fail(409,'This project step was already submitted. Refresh your project before trying again.','request_conflict');
    const project=await first(db,'SELECT * FROM learning_billing_projects WHERE project_id=?',projectId);
    if(project?.user_id!==userId)fail(404,'Project not found.','not_found');
    if(project.bucket!==kind)fail(409,'This project already has a different help allowance.','project_scope_changed');
    if(project.state==='revoked')fail(402,'This project purchase was refunded. Start a new project with an available allowance.','allowance_revoked');
    if(project.active_run_id)fail(409,'This project already has a step running.','run_in_progress');
    if(project.runs>=MAX_RUNS)fail(402,'This project has used its 12 included AI steps. Your saved work remains available.','project_limit');
    const balance=await usage(env,userId);
    if(project.state!=='active'&&(kind==='writing'?balance.projectsRemaining:balance.studySessionsRemaining)<1)fail(402,'Your '+(kind==='writing'?'writing project':'study question')+' allowance is used. Your saved work remains available.','allowance_exhausted');
    if(project.state!=='active'){
      const account=await first(db,'SELECT writing_remaining,study_remaining FROM learning_billing_accounts WHERE user_id=? AND month=?',userId,month);
      const pilotAvailable=pilot(env)?Number(kind==='writing'?account?.writing_remaining:account?.study_remaining)||0:0;
      const scopedPaid=await first(db,"SELECT COUNT(*) AS n FROM learning_billing_orders WHERE user_id=? AND bucket=? AND status='paid' AND units_remaining>0 AND (project_id IS NULL OR project_id=?)",userId,kind,projectId);
      if(!pilotAvailable&&!scopedPaid?.n)fail(402,'Your available purchase is for a different assignment. Open that assignment or choose another allowance.','allowance_scope');
    }
    fail(429,'Course help has reached its daily usage budget. Try again tomorrow.','spend_limit');
  }
  async function settle(env,input){
    const userId=actor(env,input.userId),db=requireDB(env),runId=uuid(input.reservationId,'reservation ID');
    const row=await first(db,'SELECT * FROM learning_billing_runs WHERE id=? AND user_id=?',runId,userId);
    if(!row)fail(404,'Usage reservation not found.','not_found');
    if(row.status!=='reserved')return{id:row.id,status:row.status,costMicroUsd:row.actual_micro_usd,estimated:Boolean(row.estimated)};
    const cost=costOf(input.model,input.usage,row.reserved_micro_usd),stamp=now(env),settlementId=crypto.randomUUID(),success=input.succeeded===true;
    await db.batch([
      stmt(db,"UPDATE learning_billing_runs SET status=?,actual_micro_usd=?,estimated=?,model=?,input_tokens=?,output_tokens=?,cache_write_tokens=?,cache_read_tokens=?,searches=?,settled_at=?,settlement_id=? WHERE id=? AND user_id=? AND status='reserved'",success?'completed':'failed',cost.costMicroUsd,cost.estimated?1:0,Object.hasOwn(PRICES,input.model)?input.model:'unknown',cost.inputTokens,cost.outputTokens,cost.cacheWriteTokens,cost.cacheReadTokens,cost.searches,stamp,settlementId,runId,userId),
      stmt(db,'UPDATE learning_billing_days SET reserved_micro_usd=reserved_micro_usd-?,actual_micro_usd=actual_micro_usd+? WHERE day=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND settlement_id=?)',row.reserved_micro_usd,cost.costMicroUsd,row.day,runId,settlementId),
      stmt(db,'UPDATE learning_billing_user_days SET reserved_micro_usd=reserved_micro_usd-?,actual_micro_usd=actual_micro_usd+? WHERE user_id=? AND day=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND settlement_id=?)',row.reserved_micro_usd,cost.costMicroUsd,userId,row.day,runId,settlementId),
      stmt(db,`UPDATE learning_billing_accounts SET writing_remaining=writing_remaining+CASE WHEN ?='writing' THEN 1 ELSE 0 END,study_remaining=study_remaining+CASE WHEN ?='study' THEN 1 ELSE 0 END WHERE user_id=? AND month=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND settlement_id=? AND status='failed' AND first_charge=1 AND credit_source='pilot')`,(await first(db,'SELECT bucket FROM learning_billing_projects WHERE project_id=?',row.project_id))?.bucket||'',(await first(db,'SELECT bucket FROM learning_billing_projects WHERE project_id=?',row.project_id))?.bucket||'',userId,row.month,runId,settlementId),
      stmt(db,"UPDATE learning_billing_orders SET units_remaining=units_remaining+1 WHERE status='paid' AND id=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND settlement_id=? AND status='failed' AND first_charge=1 AND credit_source='paid')",row.grant_order_id,runId,settlementId),
      stmt(db,`UPDATE learning_billing_projects SET active_run_id=NULL,state=CASE WHEN state='revoked' THEN state WHEN ?=1 THEN 'active' WHEN ?=1 THEN 'new' ELSE 'active' END,runs=runs+?,updated_at=? WHERE project_id=? AND active_run_id=? AND EXISTS(SELECT 1 FROM learning_billing_runs WHERE id=? AND settlement_id=?)`,success?1:0,row.first_charge,success?1:0,stamp,row.project_id,runId,runId,settlementId)
    ]);
    const settled=await first(db,'SELECT status,actual_micro_usd,estimated FROM learning_billing_runs WHERE id=?',runId);
    return{id:runId,status:settled.status,costMicroUsd:settled.actual_micro_usd,estimated:Boolean(settled.estimated)};
  }
  function orderView(row){if(!row)return null;return{id:row.id,userId:row.user_id,productId:row.product_id,projectId:row.project_id,requestId:row.request_id,kind:row.bucket,priceCents:row.price_cents,currency:row.currency,units:row.units,unitsRemaining:row.units_remaining,status:row.status,sessionId:row.session_id,paymentIntentId:row.payment_intent_id,amountRefunded:row.amount_refunded};}
  async function createOrder(env,input){
    const userId=actor(env,input.userId),requestId=uuid(input.requestId,'purchase request ID'),db=requireDB(env),product=PRODUCTS.find(p=>p.id===input.productId);if(!product)fail(400,'Choose an available course-help product.','invalid_product');
    const projectId=input.projectId?uuid(input.projectId,'project ID'):null,stamp=now(env),id=crypto.randomUUID();
    await db.batch([stmt(db,`INSERT INTO learning_billing_orders(id,user_id,product_id,project_id,request_id,bucket,price_cents,currency,units,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING`,id,userId,product.id,projectId,requestId,product.kind,product.priceCents,'usd',product.units,stamp,stamp)]);
    const row=await first(db,'SELECT * FROM learning_billing_orders WHERE user_id=? AND request_id=?',userId,requestId);
    if(row.product_id!==product.id||row.project_id!==projectId)fail(409,'That purchase request belongs to a different product.','request_conflict');return orderView(row);
  }
  async function findOrder(env,input){
    const db=requireDB(env);for(const[key,column]of[['id','id'],['sessionId','session_id'],['paymentIntentId','payment_intent_id']])if(typeof input[key]==='string')return orderView(await first(db,'SELECT * FROM learning_billing_orders WHERE '+column+'=?',input[key]));return null;
  }
  async function updateOrder(env,input){
    const db=requireDB(env),id=uuid(input.id,'order ID'),row=await first(db,'SELECT * FROM learning_billing_orders WHERE id=?',id);if(!row)fail(404,'Purchase not found.','not_found');
    const session=input.sessionId??row.session_id,intent=input.paymentIntentId??row.payment_intent_id;
    if(session!==null&&(typeof session!=='string'||!/^cs_(?:test_|live_)?[A-Za-z0-9_]{5,240}$/.test(session)))fail(502,'The payment provider returned an invalid receipt.','invalid_receipt');
    if(intent!==null&&(typeof intent!=='string'||!/^pi_[A-Za-z0-9_]{5,240}$/.test(intent)))fail(502,'The payment provider returned an invalid payment.','invalid_receipt');
    if(row.session_id&&session!==row.session_id||row.payment_intent_id&&intent!==row.payment_intent_id)fail(409,'This purchase already has a different payment receipt.','receipt_conflict');
    await db.batch([stmt(db,"UPDATE learning_billing_orders SET session_id=?,payment_intent_id=?,status=CASE WHEN ?='expired' AND status='pending' THEN 'expired' ELSE status END,updated_at=? WHERE id=? AND (session_id IS NULL OR session_id=?) AND (payment_intent_id IS NULL OR payment_intent_id=?)",session,intent,input.status||'',now(env),id,session,intent)]);return findOrder(env,{id});
  }
  async function grantOrder(env,input){
    const db=requireDB(env),id=uuid(input.orderId,'order ID'),row=await first(db,'SELECT * FROM learning_billing_orders WHERE id=?',id);if(!row)fail(404,'Purchase not found.','not_found');
    if(input.amountTotal!==row.price_cents||String(input.currency).toLowerCase()!==row.currency||row.session_id!==input.sessionId||typeof input.paymentIntentId!=='string'||!/^pi_[A-Za-z0-9_]{5,240}$/.test(input.paymentIntentId)||row.payment_intent_id&&row.payment_intent_id!==input.paymentIntentId||typeof input.eventId!=='string'||!/^evt_[A-Za-z0-9_]{5,240}$/.test(input.eventId))fail(400,'The payment receipt does not match this purchase.','receipt_mismatch');
    const result=await db.batch([stmt(db,"UPDATE learning_billing_orders SET status='paid',units_remaining=units,payment_intent_id=?,grant_event_id=?,paid_at=?,updated_at=? WHERE id=? AND status='pending' AND session_id=?",input.paymentIntentId,input.eventId,now(env),now(env),id,input.sessionId)]);
    return{granted:Number(result[0]?.meta?.changes||0)===1,order:await findOrder(env,{id})};
  }
  async function refundOrder(env,input){
    const db=requireDB(env),id=uuid(input.orderId,'order ID'),row=await first(db,'SELECT * FROM learning_billing_orders WHERE id=?',id);if(!row)fail(404,'Purchase not found.','not_found');
    if(row.payment_intent_id!==input.paymentIntentId||!Number.isSafeInteger(input.amountRefunded)||input.amountRefunded<1||input.amountRefunded>row.price_cents||typeof input.eventId!=='string'||!/^evt_[A-Za-z0-9_]{5,240}$/.test(input.eventId))fail(400,'The refund receipt does not match this purchase.','receipt_mismatch');
    const result=await db.batch([
      stmt(db,"UPDATE learning_billing_orders SET status='refunded',units_remaining=0,amount_refunded=MAX(amount_refunded,?),refund_event_id=?,paid_at=COALESCE(paid_at,?),updated_at=? WHERE id=? AND status IN ('pending','paid','refunded')",input.amountRefunded,input.eventId,now(env),now(env),id),
      stmt(db,"UPDATE learning_billing_projects SET state='revoked',updated_at=? WHERE grant_order_id=? AND EXISTS(SELECT 1 FROM learning_billing_orders WHERE id=? AND status='refunded')",now(env),id,id)
    ]);return{revoked:Number(result[0]?.meta?.changes||0)>0,order:await findOrder(env,{id})};
  }
  async function ownerSummary(env){
    if(env.LEARNING_OWNER_AUTHORIZED!==true)fail(403,'Owner access is required.','owner_required');
    const db=requireDB(env),day=dayOf(now(env)),counts=await first(db,`SELECT COALESCE(SUM(status='completed'),0) AS completed,COALESCE(SUM(status='failed'),0) AS failed,COALESCE(SUM(status='reserved'),0) AS active,COALESCE(SUM(actual_micro_usd),0) AS cost,COALESCE(SUM(CASE WHEN estimated=0 THEN actual_micro_usd ELSE 0 END),0) AS confirmedCost,COALESCE(SUM(CASE WHEN estimated=1 THEN actual_micro_usd ELSE 0 END),0) AS estimatedCost,COALESCE(SUM(estimated),0) AS estimated,COALESCE(SUM(input_tokens),0) AS inputs,COALESCE(SUM(output_tokens),0) AS outputs,COALESCE(SUM(searches),0) AS searches,COALESCE(SUM(CASE WHEN status='reserved' THEN reserved_micro_usd ELSE 0 END),0) AS reserved FROM learning_billing_runs WHERE day=?`,day),sales=await first(db,"SELECT COALESCE(SUM(paid_at IS NOT NULL),0) AS paid,COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN price_cents ELSE 0 END),0) AS gross,COALESCE(SUM(amount_refunded),0) AS refunded FROM learning_billing_orders");
    return{enabled:env.LEARNING_ENABLED==='1',paymentsEnabled:learningPaymentsConfigured(env),pilotEnabled:pilot(env),day,usage:{completedRuns:counts.completed,failedRuns:counts.failed,inFlightRuns:counts.active,costMicroUsd:counts.cost,confirmedCostMicroUsd:counts.confirmedCost,estimatedCostMicroUsd:counts.estimatedCost,estimatedRuns:counts.estimated,unreconciledRuns:counts.estimated,reservedMicroUsd:counts.reserved,inputTokens:counts.inputs,outputTokens:counts.outputs,searches:counts.searches},sales:{period:'all-time',paidOrders:sales.paid,grossAmountMinor:sales.gross,refundedAmountMinor:sales.refunded,currency:'USD'},limits:limits(env)};
  }
  async function handle(request,env){
    const path=new URL(request.url).pathname;if(!path.startsWith('/api/learning/billing/'))return null;
    if(env.LEARNING_ENABLED!=='1')return path==='/api/learning/billing/status'?json({enabled:false,paymentsEnabled:false,pilotEnabled:false,products:[]}):json({error:'Not found.'},404);
    if(path==='/api/learning/billing/owner-summary'&&request.method==='GET')return json(await ownerSummary(env));
    if(path==='/api/learning/billing/webhook'||path==='/api/learning/billing/checkout')return handleLearningPayments(request,env,{actor:env.PORTAL_USER||null,products:PRODUCTS,createOrder:input=>createOrder(env,input),updateOrder:input=>updateOrder(env,input),findOrder:input=>findOrder(env,input),grantOrder:input=>grantOrder(env,input),refundOrder:input=>refundOrder(env,input),projectOwned:typeof env.LEARNING_PROJECT_OWNED==='function'?env.LEARNING_PROJECT_OWNED:undefined});
    if(path==='/api/learning/billing/status'&&request.method==='GET')return json({enabled:true,paymentsEnabled:learningPaymentsConfigured(env),pilotEnabled:pilot(env),products:PRODUCTS,usage:env.PORTAL_USER?.id?await usage(env,env.PORTAL_USER.id):null});
    return json({error:'Not found.'},404);
  }
  return{reserve,settle,usage,handle,ownerSummary,createOrder,updateOrder,findOrder,grantOrder,refundOrder,costOf,limits,PRODUCTS};
})();

export async function reserveLearningRun(env,input){return learningBillingApi.reserve(env,input);}
export async function settleLearningRun(env,input){return learningBillingApi.settle(env,input);}
export async function getLearningUsage(env,userId){return learningBillingApi.usage(env,userId);}
export async function handleLearningBilling(request,env){try{return await learningBillingApi.handle(request,env);}catch(error){if(Number.isInteger(error?.status))return new Response(JSON.stringify({error:error.message,code:error.code}),{status:error.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});return new Response(JSON.stringify({error:'Course usage tracking is temporarily unavailable.',code:'billing_unavailable'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}}
export async function createLearningPaymentOrder(env,input){return learningBillingApi.createOrder(env,input);}
export async function updateLearningPaymentOrder(env,input){return learningBillingApi.updateOrder(env,input);}
export async function findLearningPaymentOrder(env,input){return learningBillingApi.findOrder(env,input);}
export async function grantLearningPaidOrder(env,input){return learningBillingApi.grantOrder(env,input);}
export async function refundLearningPaidOrder(env,input){return learningBillingApi.refundOrder(env,input);}
export function learningBillingInternals(){return{costOf:learningBillingApi.costOf,limits:learningBillingApi.limits,products:learningBillingApi.PRODUCTS};}
