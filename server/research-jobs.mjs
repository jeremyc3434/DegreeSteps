/** Durable outbox and at-least-once queue consumer. Never stores API credentials or student records. */
const ResearchJobs=(()=>{
 'use strict';
 const LEASE_MS=600000,HEARTBEAT_MS=30000,MAX_ATTEMPTS=3,MAX_RUNTIME_MS=540000;
 const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,templatePattern=/^tpl-[a-f0-9]{32}$/;
 const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values),one=(db,sql,...values)=>stmt(db,sql,...values).first(),all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[],run=(db,sql,...values)=>stmt(db,sql,...values).run(),changes=result=>Number(result?.meta?.changes??result?.changes??0);
 const now=env=>typeof env.RESEARCH_JOB_NOW==='function'?env.RESEARCH_JOB_NOW():Date.now();
 class JobError extends Error{constructor(message,code,status=503){super(message);this.code=code;this.status=status;}}
 const fail=(message,code,status)=>{throw new JobError(message,code,status);};
 function enabled(env){return typeof env.RESEARCH_QUEUE?.send==='function';}
 function options(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Choose a valid degree research request.','invalid_job',400);
  const out={fullPlan:value.fullPlan===true};
  if(value.rebaseTarget){const target={};for(const field of ['schoolName','programName','level','modality','catalogYear','url']){const raw=value.rebaseTarget[field];if(raw!==null&&raw!==undefined){if(typeof raw!=='string'||raw.length>2000||/[\u0000-\u001f\u007f]/.test(raw))fail('Choose a valid degree research target.','invalid_job',400);target[field]=raw;}}out.rebaseTarget=target;}
  const json=JSON.stringify(out);if(new TextEncoder().encode(json).byteLength>4096)fail('This research target is too large.','invalid_job',400);return json;
 }
 const publicJob=job=>({id:job.id,status:job.status,attempts:job.attempts,queuedAt:job.created_at,dispatchPending:job.status==='queued'});
 async function authorized(db,templateId,userId,admin){
  if(!/^sb-[a-f0-9-]{36}$/i.test(userId||''))fail('Sign in before requesting research.','sign_in_required',401);
  if(admin){if(!['owner','moderator'].includes((await one(db,'SELECT role FROM community_users WHERE id=?',userId))?.role))fail('A current administrator must request this research.','forbidden',403);}
  else if(!await one(db,'SELECT id FROM template_requests WHERE template_id=? AND user_id=?',templateId,userId))fail('Your degree request was not found.','request_not_found',404);
 }
 async function dispatchOne(env,job){
  if(!enabled(env))return false;
  const stamp=now(env),delay=Math.max(0,Math.min(86400,Math.ceil((job.available_at-stamp)/1000)));
  let timeout;
  try{await Promise.race([Promise.resolve().then(()=>env.RESEARCH_QUEUE.send({jobId:job.id},delay?{delaySeconds:delay}:undefined)),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('dispatch_timeout')),Math.min(5000,Math.max(10,Number(env.RESEARCH_QUEUE_SEND_TIMEOUT_MS)||5000)));})]);await run(env.DB,"UPDATE degree_research_jobs SET status='dispatched',dispatched_at=?,updated_at=?,error_code=NULL WHERE id=? AND status IN ('queued','retry','dispatched')",stamp,stamp,job.id);return true;}
  catch{await run(env.DB,"UPDATE degree_research_jobs SET error_code='dispatch_pending',updated_at=? WHERE id=? AND status IN ('queued','retry','dispatched')",stamp,job.id);return false;}
  finally{clearTimeout(timeout);}
 }
 async function enqueue(env,{templateId,userId,revision,options:requested={},authorizedAdmin=false}={}){
  if(!env.DB||!enabled(env))fail('Background research is not configured.','queue_unavailable');
  if(!templatePattern.test(templateId||'')||!Number.isSafeInteger(revision)||revision<1)fail('Reload this degree before requesting research.','invalid_job',400);
  await authorized(env.DB,templateId,userId,authorizedAdmin);
  const prior=await one(env.DB,'SELECT * FROM degree_research_jobs WHERE active_template_id=?',templateId);if(prior)return publicJob(prior);
  const stamp=now(env),id=crypto.randomUUID(),json=options(requested);
  await env.DB.batch([
   stmt(env.DB,"INSERT INTO degree_research_jobs (id,template_id,active_template_id,user_id,authorized_admin,requested_revision,options_json,status,attempts,available_at,created_at,updated_at) SELECT ?,id,id,?,?,revision+1,?,'queued',0,?,?,? FROM degree_templates WHERE id=? AND revision=? AND status IN ('queued','failed','draft','rejected','researching') ON CONFLICT(active_template_id) DO NOTHING",id,userId,authorizedAdmin?1:0,json,stamp,stamp,stamp,templateId,revision),
   stmt(env.DB,"UPDATE degree_templates SET status='queued',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM degree_research_jobs WHERE id=? AND requested_revision=degree_templates.revision+1)",stamp,templateId,revision,id),
   stmt(env.DB,"UPDATE template_research_runs SET status='failed',finished_at=?,error_code='superseded_job' WHERE template_id=? AND status='running' AND EXISTS (SELECT 1 FROM degree_research_jobs WHERE id=?)",stamp,templateId,id)
  ]);
  const job=await one(env.DB,'SELECT * FROM degree_research_jobs WHERE active_template_id=?',templateId);if(!job)fail('This degree changed. Reload its latest result before continuing.','revision_conflict',409);
  if(job.id===id)await dispatchOne(env,job);
  return publicJob(await one(env.DB,'SELECT * FROM degree_research_jobs WHERE id=?',job.id));
 }
 async function dispatch(env,{limit=10}={}){
  if(!env.DB||!enabled(env))return{enabled:false,dispatched:0,pending:0};
  const stamp=now(env),bound=Math.min(25,Math.max(1,Math.floor(Number(limit)||10)));
  // A send that succeeded immediately before a process crash may be sent again.
  // The consumer's atomic lease, not the dispatch timestamp, prevents duplicate execution.
  const jobs=await all(env.DB,"SELECT * FROM degree_research_jobs WHERE (status IN ('queued','retry') AND available_at<=?) OR (status='dispatched' AND dispatched_at<?) ORDER BY available_at,id LIMIT ?",stamp,stamp-60000,bound);
  let sent=0;for(const job of jobs)if(await dispatchOne(env,job))sent++;
  return{enabled:true,dispatched:sent,pending:jobs.length-sent};
 }
 async function dead(env,job,code,token=null,{expired=false}={}){
  const stamp=now(env),where=token?" AND status='running' AND lease_token=?"+(expired?' AND lease_until<=?':''):'',values=token?[token,...(expired?[stamp]:[])]:[];
  const changed=await run(env.DB,"UPDATE degree_research_jobs SET status='dead',active_template_id=NULL,lease_token=NULL,lease_until=NULL,finished_at=?,updated_at=?,error_code=? WHERE id=?"+where,stamp,stamp,code,job.id,...values);
  if(changes(changed)){
   await env.DB.batch([
    stmt(env.DB,"UPDATE degree_templates SET status='failed',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('queued','researching')",stamp,job.template_id,job.requested_revision),
    stmt(env.DB,"UPDATE template_research_runs SET status='failed',finished_at=?,error_code=? WHERE template_id=? AND status='running' AND EXISTS (SELECT 1 FROM degree_templates WHERE id=? AND revision=? AND status='failed' AND updated_at=?)",stamp,code,job.template_id,job.template_id,job.requested_revision+1,stamp)
   ]);
   if(typeof env.RESEARCH_DEAD_LETTER_QUEUE?.send==='function'){try{await env.RESEARCH_DEAD_LETTER_QUEUE.send({jobId:job.id});}catch{/* Durable dead state is authoritative even if notification is unavailable. */}}
  }
  return changes(changed)>0;
 }
 async function claim(env,id){
  let job=await one(env.DB,'SELECT * FROM degree_research_jobs WHERE id=?',id);if(!job||['completed','dead'].includes(job.status))return{kind:'done',job};
  const stamp=now(env);
  if(job.status==='running'&&job.lease_until>stamp)return{kind:'busy',job};
  if(job.status==='running'&&job.provider_started_at!==null){const stopped=await dead(env,job,'provider_outcome_unknown',job.lease_token,{expired:true});return{kind:stopped?'done':'busy',job};}
  if(job.attempts>=MAX_ATTEMPTS){await dead(env,job,'attempts_exhausted');return{kind:'done',job};}
  if(job.available_at>stamp)return{kind:'deferred',job};
  const token=crypto.randomUUID(),claimed=await run(env.DB,"UPDATE degree_research_jobs SET status='running',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=?,error_code=NULL WHERE id=? AND attempts<? AND available_at<=? AND (status IN ('queued','dispatched','retry') OR (status='running' AND lease_until<=? AND provider_started_at IS NULL))",token,stamp+LEASE_MS,stamp,id,MAX_ATTEMPTS,stamp,stamp);
  if(!changes(claimed))return{kind:'busy',job:await one(env.DB,'SELECT * FROM degree_research_jobs WHERE id=?',id)};
  if(job.status==='running'){
   // Only an expired pre-provider attempt is automatically recoverable. Fence
   // its template revision before a new attempt can reserve a provider budget.
   await env.DB.batch([
    stmt(env.DB,"UPDATE degree_templates SET status='queued',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='researching' AND EXISTS (SELECT 1 FROM degree_research_jobs WHERE id=? AND lease_token=? AND status='running')",stamp,job.template_id,job.requested_revision,id,token),
    stmt(env.DB,"UPDATE degree_research_jobs SET requested_revision=(SELECT revision FROM degree_templates WHERE id=?) WHERE id=? AND lease_token=? AND status='running'",job.template_id,id,token),
    stmt(env.DB,"UPDATE template_research_runs SET status='failed',finished_at=?,error_code='stale_job_lease' WHERE template_id=? AND status='running'",stamp,job.template_id)
   ]);
  }
  job=await one(env.DB,'SELECT * FROM degree_research_jobs WHERE id=?',id);return{kind:'claimed',job,token};
 }
 async function execute(env,message,summary){
  const payload=message?.body;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||!idPattern.test(payload.jobId||'')){message.ack?.();summary.invalid++;return;}
  const claimed=await claim(env,payload.jobId),job=claimed.job;
  if(claimed.kind==='done'){message.ack?.();summary.ignored++;return;}
  if(claimed.kind==='busy'||claimed.kind==='deferred'){message.retry?.({delaySeconds:Math.max(30,Math.min(86400,Math.ceil((((claimed.kind==='busy'?job?.lease_until:job?.available_at)||now(env)+60000)-now(env))/1000)))});summary.deferred++;return;}
  const token=claimed.token,controller=new AbortController();let heartbeat=null,deadline=null,heartbeatBusy=false,lost=false;
  const guard=async()=>{const current=await one(env.DB,"SELECT id FROM degree_research_jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>?",job.id,token,now(env));if(!current){lost=true;controller.abort();fail('This research attempt no longer owns its lease.','lease_lost',409);}return true;};
  const beforeProvider=async()=>{const changed=await run(env.DB,"UPDATE degree_research_jobs SET provider_started_at=COALESCE(provider_started_at,?),updated_at=? WHERE id=? AND status='running' AND lease_token=? AND lease_until>?",now(env),now(env),job.id,token,now(env));if(!changes(changed)){lost=true;controller.abort();fail('This research attempt no longer owns its lease.','lease_lost',409);}};
  try{
   await authorized(env.DB,job.template_id,job.user_id,job.authorized_admin===1);
   if(typeof env.RESEARCH_EXECUTE_JOB!=='function')fail('The research worker is not configured.','executor_unavailable');
   heartbeat=setInterval(async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{const stamp=now(env),result=await run(env.DB,"UPDATE degree_research_jobs SET lease_until=?,updated_at=? WHERE id=? AND status='running' AND lease_token=? AND lease_until>?",stamp+LEASE_MS,stamp,job.id,token,stamp);if(!changes(result)){lost=true;controller.abort();}}catch{lost=true;controller.abort();}finally{heartbeatBusy=false;}},HEARTBEAT_MS);
   const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(new JobError('Research reached its execution deadline.','execution_timeout'));},Math.min(MAX_RUNTIME_MS,Math.max(10,Number(env.RESEARCH_JOB_TIMEOUT_MS)||MAX_RUNTIME_MS)));});
   const result=await Promise.race([env.RESEARCH_EXECUTE_JOB(job,{signal:controller.signal,guard,beforeProvider,lease:{id:job.id,token}}),timeout]);await guard();
   if(result?.status==='failed'){await dead(env,job,'research_needs_attention',token);message.ack?.();summary.dead++;return;}
   const stamp=now(env),done=await run(env.DB,"UPDATE degree_research_jobs SET status='completed',active_template_id=NULL,lease_token=NULL,lease_until=NULL,finished_at=?,updated_at=?,error_code=NULL WHERE id=? AND status='running' AND lease_token=? AND lease_until>?",stamp,stamp,job.id,token,stamp);
   if(changes(done)){message.ack?.();summary.completed++;}else{message.retry?.({delaySeconds:60});summary.deferred++;}
  }catch(error){
   if(lost||error.code==='lease_lost'){message.retry?.({delaySeconds:60});summary.deferred++;return;}
   const current=await one(env.DB,'SELECT * FROM degree_research_jobs WHERE id=?',job.id);
   const uncertain=current?.provider_started_at!==null&&current?.provider_started_at!==undefined;
   if(uncertain||job.attempts>=MAX_ATTEMPTS||[400,401,403,404,409].includes(error.status)){await dead(env,job,uncertain?'provider_outcome_unknown':'job_not_executable',token);message.ack?.();summary.dead++;return;}
   const delay=error.status===429?86400:Math.min(900,30*2**(job.attempts-1)),stamp=now(env),changed=await run(env.DB,"UPDATE degree_research_jobs SET status='retry',lease_token=NULL,lease_until=NULL,available_at=?,updated_at=?,error_code=? WHERE id=? AND status='running' AND lease_token=?",stamp+delay*1000,stamp,error.status===429?'budget_deferred':'execution_deferred',job.id,token);
   if(changes(changed)){message.retry?.({delaySeconds:delay});summary.deferred++;}else message.retry?.({delaySeconds:60});
  }finally{clearInterval(heartbeat);clearTimeout(deadline);}
 }
 async function process(batch,env){
  const summary={completed:0,deferred:0,dead:0,ignored:0,invalid:0};
  if(!env.DB)throw new Error('Research job storage is unavailable.');
  const messages=Array.isArray(batch?.messages)?batch.messages:[];
  // One research operation can use most of a Queue invocation's wall time.
  // Extra delivered messages must be explicitly retried, never implicitly acked
  // when this handler returns. Production config should use max_batch_size=1.
  for(const [index,message]of messages.entries()){if(index===0)await execute(env,message,summary);else{message.retry?.({delaySeconds:30});summary.deferred++;}}
  return summary;
 }
 return{enabled,enqueue,dispatch,process,JobError};
})();
export function researchQueueEnabled(env){return ResearchJobs.enabled(env);}
export async function enqueueResearchJob(env,input){return ResearchJobs.enqueue(env,input);}
export async function dispatchResearchOutbox(env,options){return ResearchJobs.dispatch(env,options);}
export async function processResearchJobs(batch,env,ctx){return ResearchJobs.process(batch,env,ctx);}
