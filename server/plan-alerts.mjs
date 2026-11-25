import { sendEmail, emailSettings, validEmailAddress } from './email.mjs';
import {faviconLinks} from './site-icons.mjs';
/** Email plan alerts. Off unless EMAIL_ALERTS_ENABLED=1: every /api/alerts route answers 404 and the scheduled
 * run does nothing. The Worker supplies the verified account (ALERTS_USER), a saved-plan ownership check
 * (ALERTS_PLAN_OWNER) and public plan data (ALERTS_PLAN_DATA); this module never reads a request's identity itself. */
const DegreePlanAlerts=(()=>{
  'use strict';
  const PREFIX='/api/alerts',MAX_PER_USER=10,MAX_BODY=2048,DAY=86400000,CHANGE_GAP=7*DAY,REMINDER_GAP=30*DAY,BATCH=200;
  const PORTAL_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/,PLAN_ID=/^[a-z0-9][a-z0-9-]{0,127}$/,TOKEN=/^[A-Za-z0-9_-]{43}$/,SUB_ID=/^[a-f0-9-]{36}$/;
  class Problem extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new Problem(status,message,code);};
  const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const changes=result=>result?.meta?.changes??result?.changes??0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enabled=env=>env?.EMAIL_ALERTS_ENABLED==='1';
  const clock=context=>Number.isFinite(context?.now)?context.now:Date.now();
  const baseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8','Vary':'Cookie'}});
  function origin(env){try{const url=new URL(String(env.EMAIL_SITE_ORIGIN||'https://degreesteps.com'));return url.protocol==='https:'||url.hostname==='127.0.0.1'||url.hostname==='localhost'?url.origin:'https://degreesteps.com';}catch{return 'https://degreesteps.com';}}
  async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');}
  function newToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
  const canonical=item=>item===null||typeof item!=='object'?JSON.stringify(item):Array.isArray(item)?'['+item.map(canonical).join(',')+']':'{'+Object.keys(item).filter(key=>item[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(item[key])).join(',')+'}';
  const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000?value:null;
  /** The plain facts an alert compares, from one plan-library-index entry plus the model's publication fingerprint. */
  function planSummary(entry,modelFingerprint=''){
    const estimate=entry?.estimate&&typeof entry.estimate==='object'?entry.estimate:null;
    return{credits:count(entry?.start?.total),outside:count(entry?.start?.outside),university:count(entry?.start?.university),
      costMin:count(estimate?.min),costMax:count(estimate?.max),costPartial:Boolean(estimate?.partial),
      tier:entry?.tier==='reviewed'?'reviewed':'confirmation',openItems:count(entry?.openItems)??0,
      questions:Array.isArray(entry?.questions)?entry.questions.length:0,model:typeof modelFingerprint==='string'?modelFingerprint.slice(0,80):''};
  }
  const fingerprint=summary=>sha256(canonical(summary));
  async function planData(env){if(typeof env.ALERTS_PLAN_DATA!=='function')fail(503,'Plan alerts are temporarily unavailable.','alerts_unavailable');const data=await env.ALERTS_PLAN_DATA();if(!data?.plans||typeof data.plans!=='object')fail(503,'Plan alerts are temporarily unavailable.','alerts_unavailable');return data;}
  async function currentPlan(data,planId){
    const entry=Object.hasOwn(data.plans,planId)?data.plans[planId]:null;if(!entry)return null;
    let model='';try{model=typeof data.modelFingerprint==='function'?String(await data.modelFingerprint(planId)||''):'';}catch{model='';}
    const summary=planSummary(entry,model);
    const title=String((typeof data.titleFor==='function'?data.titleFor(planId):'')||'your degree plan').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,140);
    return{summary,fingerprint:await fingerprint(summary),title,page:typeof data.pageFor==='function'&&data.pageFor(planId)===true};
  }
  function user(env){
    const value=env.ALERTS_USER;if(!value?.id)return null;
    if(typeof value.id!=='string'||value.id.length>256||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value.id))fail(401,'Sign in again to manage plan alerts.','sign_in_required');
    return{id:value.id,email:typeof value.email==='string'?value.email.trim():''};
  }
  function protectWrite(request){
    if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Portal-Request')!=='1')fail(403,'Use the same-origin DegreeSteps page.','cross_origin');
    const site=request.headers.get('Sec-Fetch-Site');if(site&&!['same-origin','none'].includes(site))fail(403,'Cross-origin writes are not allowed.','cross_origin');
  }
  async function readText(request,limit=MAX_BODY){
    if(Number(request.headers.get('Content-Length'))>limit)fail(413,'Request is too large.');
    const reader=request.body?.getReader();if(!reader)return '';let size=0;const parts=[];
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();fail(413,'Request is too large.');}parts.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail(400,'Send valid text.');}
  }
  async function jsonBody(request){
    if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.');
    let value;try{value=JSON.parse(await readText(request));}catch(error){if(error instanceof Problem)throw error;fail(400,'Send valid JSON.');}
    if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a JSON object.');return value;
  }
  async function growth(env,value){try{await env.ALERTS_GROWTH?.(value);}catch{/* Measurement never blocks an account action. */}}
  function itemView(row,title){return{id:row.id,portalPlanId:row.portal_plan_id,planId:row.plan_id,title,createdAt:row.created_at};}
  async function list(env,account){
    const rows=(await stmt(env.DB,'SELECT id,portal_plan_id,plan_id,created_at FROM plan_alert_subscriptions WHERE user_id=? ORDER BY created_at DESC,id LIMIT ?',account.id,MAX_PER_USER).all()).results||[];
    let data=null;try{data=await planData(env);}catch{data=null;}
    return rows.map(row=>itemView(row,(data&&typeof data.titleFor==='function'&&data.titleFor(row.plan_id))||'Saved degree plan'));
  }
  async function subscribe(request,env,account,now){
    protectWrite(request);const body=await jsonBody(request);
    if(Object.keys(body).some(key=>!['portalPlanId','planId','consent'].includes(key)))fail(400,'Payload contains unsupported fields.');
    if(body.consent!==true)fail(400,'Tick “Email me if this plan changes” to turn on alerts.','consent_required');
    if(typeof body.portalPlanId!=='string'||!PORTAL_ID.test(body.portalPlanId))fail(400,'Choose a plan saved to your account.','invalid_plan');
    if(typeof body.planId!=='string'||!PLAN_ID.test(body.planId))fail(400,'Choose a published degree plan.','invalid_plan');
    if(!validEmailAddress(account.email))fail(400,'Your account does not have a confirmed email address for alerts.','email_unavailable');
    const data=await planData(env),plan=await currentPlan(data,body.planId);
    if(!plan)fail(400,'Email alerts are available for plans in the DegreeSteps plan library.','plan_not_in_library');
    if(typeof env.ALERTS_PLAN_OWNER!=='function')fail(503,'Plan alerts are temporarily unavailable.','alerts_unavailable');
    let owner;try{owner=await env.ALERTS_PLAN_OWNER(body.portalPlanId);}catch{fail(503,'Your saved plans could not be checked. Try again.','storage_unavailable');}
    if(!owner?.owned)fail(404,'Save this plan to your account before turning on alerts.','plan_not_saved');
    if(owner.pathwayId!==body.planId)fail(409,'Save your latest changes to your account before turning on alerts for this plan.','plan_mismatch');
    const existing=await stmt(env.DB,'SELECT id,portal_plan_id,plan_id,created_at FROM plan_alert_subscriptions WHERE user_id=? AND portal_plan_id=?',account.id,body.portalPlanId).first();
    if(existing){
      if(existing.plan_id!==body.planId)await stmt(env.DB,'UPDATE plan_alert_subscriptions SET plan_id=?,fingerprint=?,summary_json=?,email=?,confirmed_at=?,last_change_email_at=NULL,last_reminder_at=NULL WHERE id=? AND user_id=?',body.planId,plan.fingerprint,JSON.stringify(plan.summary),account.email,now,existing.id,account.id).run();
      return json({item:itemView({...existing,plan_id:body.planId},plan.title),email:account.email,created:false});
    }
    const id=crypto.randomUUID();
    // The account email is already verified by sign-in, and the explicit tick is the confirmation, so confirmed_at is the subscribe time.
    const result=await stmt(env.DB,`INSERT INTO plan_alert_subscriptions(id,user_id,portal_plan_id,plan_id,email,fingerprint,summary_json,created_at,confirmed_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM plan_alert_subscriptions WHERE user_id=?)<? ON CONFLICT(user_id,portal_plan_id) DO NOTHING`,id,account.id,body.portalPlanId,body.planId,account.email,plan.fingerprint,JSON.stringify(plan.summary),now,now,account.id,MAX_PER_USER).run();
    if(!changes(result)){
      const raced=await stmt(env.DB,'SELECT id,portal_plan_id,plan_id,created_at FROM plan_alert_subscriptions WHERE user_id=? AND portal_plan_id=?',account.id,body.portalPlanId).first();
      if(raced)return json({item:itemView(raced,plan.title),email:account.email,created:false});
      fail(409,'You can have alerts on up to 10 saved plans. Remove one first.','alert_limit');
    }
    await growth(env,{event:'alert_subscribed',context:'workspace',planId:body.planId});
    return json({item:itemView({id,portal_plan_id:body.portalPlanId,plan_id:body.planId,created_at:now},plan.title),email:account.email,created:true},201);
  }
  async function removeById(env,id){await env.DB.batch([stmt(env.DB,'DELETE FROM plan_alert_tokens WHERE subscription_id=?',id),stmt(env.DB,'DELETE FROM plan_alert_subscriptions WHERE id=?',id)]);}
  async function unsubscribeById(request,env,account,id){
    protectWrite(request);
    const row=await stmt(env.DB,'SELECT id,plan_id FROM plan_alert_subscriptions WHERE id=? AND user_id=?',id,account.id).first();
    if(!row)fail(404,'That alert was already removed.','not_found');
    await removeById(env,row.id);await growth(env,{event:'alert_unsubscribed',context:'workspace',planId:row.plan_id,detail:'settings'});
    return json({deleted:true,id:row.id});
  }
  function page(title,body,status=200){
    return new Response('<!doctype html><html lang="en"><head>'+faviconLinks+'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>'+esc(title)+' — DegreeSteps</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/brand.css"><style>.alerts-page{max-width:560px;margin:0 auto;padding:56px 16px}.alerts-page button{font:inherit;padding:12px 20px;border-radius:10px;border:0;background:#4054f4;color:#fff;cursor:pointer;min-height:44px}.alerts-page p{line-height:1.55}</style></head><body><main class="alerts-page"><p><a href="/">DegreeSteps</a></p><h1>'+esc(title)+'</h1>'+body+'</main></body></html>',{status,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8'}});
  }
  async function byToken(env,token){
    if(typeof token!=='string'||!TOKEN.test(token))return null;
    return stmt(env.DB,'SELECT s.id,s.plan_id FROM plan_alert_tokens t JOIN plan_alert_subscriptions s ON s.id=t.subscription_id WHERE t.token_hash=?',await sha256(token)).first();
  }
  async function unsubscribeLink(request,env){
    const url=new URL(request.url),token=url.searchParams.get('token')||'';
    if([...url.searchParams.keys()].some(key=>key!=='token'))return page('Check this unsubscribe link','<p>This link is not complete. Use the unsubscribe link from your most recent DegreeSteps email, or remove alerts in <a href="/account.html">your account settings</a>.</p>',400);
    if(request.method==='GET'||request.method==='HEAD'){
      // GET never changes anything, so link scanners in mail systems cannot unsubscribe a student by accident.
      if(!TOKEN.test(token))return page('Check this unsubscribe link','<p>This link is not complete. Use the unsubscribe link from your most recent DegreeSteps email, or remove alerts in <a href="/account.html">your account settings</a>.</p>',400);
      const row=await byToken(env,token);
      if(!row)return page('You’re unsubscribed','<p>These plan alerts are already off. We won’t email you about this plan.</p><p><a href="/account.html">Manage alerts in your account</a></p>');
      let title='this plan';try{const data=await planData(env);title=(typeof data.titleFor==='function'&&data.titleFor(row.plan_id))||title;}catch{}
      return page('Stop plan alerts?','<p>Stop emails about <strong>'+esc(title)+'</strong>? Your saved plan stays in your account.</p><form method="post" action="/api/alerts/unsubscribe?token='+esc(encodeURIComponent(token))+'"><input type="hidden" name="confirm" value="1"><button type="submit">Unsubscribe</button></form>');
    }
    if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{...baseHeaders,Allow:'GET, HEAD, POST'}});
    const type=(request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase(),text=await readText(request,1024);
    const form=type==='application/x-www-form-urlencoded'||type==='multipart/form-data'?new URLSearchParams(type==='multipart/form-data'?'':text):new URLSearchParams();
    // RFC 8058 one-click: the mail provider POSTs "List-Unsubscribe=One-Click" to the List-Unsubscribe URL.
    const oneClick=form.get('List-Unsubscribe')==='One-Click';
    if(!TOKEN.test(token))return oneClick?new Response('Invalid unsubscribe link.',{status:400,headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8'}}):page('Check this unsubscribe link','<p>This link is not complete. Remove alerts in <a href="/account.html">your account settings</a>.</p>',400);
    const row=await byToken(env,token);
    if(row){await removeById(env,row.id);await growth(env,{event:'alert_unsubscribed',context:'email',planId:row.plan_id,detail:oneClick?'one-click':'link'});}
    if(oneClick)return new Response('Unsubscribed.',{status:200,headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8'}});
    return page('You’re unsubscribed','<p>We won’t email you about this plan again. Your saved plan stays in your account.</p><p><a href="/account.html">Manage alerts in your account</a></p>');
  }
  async function handle(request,env,context={}){
    const url=new URL(request.url);if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return null;
    // Off by default: nothing below runs, and no identity, data or key is read.
    if(!enabled(env))return json({error:'Not found.'},404);
    try{
      if(!env.DB)fail(503,'Plan alerts are temporarily unavailable.','alerts_unavailable');
      if(url.pathname===PREFIX+'/unsubscribe')return await unsubscribeLink(request,env);
      const account=user(env),now=clock(context);
      if(url.pathname===PREFIX+'/subscriptions'){
        if(!account)fail(401,'Sign in to manage plan alerts.','sign_in_required');
        if(request.method==='GET')return json({enabled:true,email:validEmailAddress(account.email)?account.email:'',items:await list(env,account)});
        if(request.method==='POST')return await subscribe(request,env,account,now);
        fail(405,'Method not allowed.');
      }
      const match=url.pathname.match(/^\/api\/alerts\/subscriptions\/([^/]+)$/);
      if(match){
        if(!account)fail(401,'Sign in to manage plan alerts.','sign_in_required');
        if(request.method!=='DELETE')fail(405,'Method not allowed.');
        if(!SUB_ID.test(match[1]))fail(400,'Choose a valid alert.');
        return await unsubscribeById(request,env,account,match[1]);
      }
      fail(404,'Not found.');
    }catch(error){if(error instanceof Problem)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);return json({error:'Plan alerts are temporarily unavailable. Your saved plans have not changed.',code:'alerts_unavailable'},503);}
  }

  // ---- Email content ----
  const money=value=>'$'+Number(value).toLocaleString('en-US');
  function creditsLine(s){return s.credits===null?'Not calculated yet':s.credits+' credits'+(s.outside!==null&&s.university!==null?' ('+s.outside+' from outside courses, '+s.university+' at the school)':'');}
  function costLine(s){return s.costMin===null||s.costMax===null?'Not estimated yet':(s.costMin===s.costMax?money(s.costMin):money(s.costMin)+'–'+money(s.costMax))+(s.costPartial?' (some course providers not priced yet)':'');}
  function tierLine(s){return s.tier==='reviewed'?'Checked against the school’s published rules':'Needs school confirmation'+(s.questions?' ('+s.questions+' open question'+(s.questions===1?'':'s')+')':'');}
  function compare(before,now){
    const rows=[['Credits',creditsLine(before),creditsLine(now)],['Estimated cost',costLine(before),costLine(now)],['School confirmation',tierLine(before),tierLine(now)]];
    const lines=rows.map(([label,a,b])=>({label,before:a,now:b,changed:a!==b}));
    if(before.model!==now.model)lines.push({label:'Course requirements',before:'',now:'Updated in the school’s published curriculum',changed:true});
    return lines;
  }
  function footer(env,unsubscribeURL){
    const postal=emailSettings(env).postalAddress;
    return{text:'\n—\nYou’re getting this because you turned on email alerts for this plan on DegreeSteps. We send at most one change email per plan a week and one saved-plan reminder a month.\nUnsubscribe with one click: '+unsubscribeURL+'\n\nDegreeSteps · '+postal+'\n',
      html:'<hr style="border:0;border-top:1px solid #dde1ea;margin:28px 0 16px"><p style="font-size:13px;color:#5b6475">You’re getting this because you turned on email alerts for this plan on DegreeSteps. We send at most one change email per plan a week and one saved-plan reminder a month.<br><a href="'+esc(unsubscribeURL)+'">Unsubscribe with one click</a></p><p style="font-size:13px;color:#5b6475">DegreeSteps · '+esc(postal)+'</p>'};
  }
  function wrapHTML(title,inner){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title></head><body style="margin:0;background:#f6f7fb"><div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1d2433;background:#ffffff">'+inner+'</div></body></html>';}
  /** Builds the change or reminder email. Exported for tests and for owner review of the exact copy. */
  function composeEmail(env,{kind,title,before,now,planURL,accountURL,unsubscribeURL}){
    const foot=footer(env,unsubscribeURL),links=[['Open your saved plans',accountURL],...(planURL?[['See the public plan',planURL]]:[])];
    if(kind==='change'){
      const lines=compare(before,now),subject=('Your '+title+' plan changed').slice(0,190);
      const text='Hi,\n\nThe DegreeSteps plan you saved has changed: '+title+'.\n\nBefore → now:\n'+lines.map(line=>'- '+line.label+': '+(line.before?line.before+' → ':'')+(line.changed?line.now:'no change')).join('\n')+'\n\nYour saved courses have not been changed. Open your plan to see how this affects you. Costs are planning estimates, not quotes; confirm with the school before you pay.\n\n'+links.map(([label,url])=>label+': '+url).join('\n')+'\n'+foot.text;
      const table='<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">'+lines.map(line=>'<tr><th scope="row" style="text-align:left;vertical-align:top;padding:8px 8px 8px 0;border-top:1px solid #eef0f5;width:34%">'+esc(line.label)+'</th><td style="padding:8px 0;border-top:1px solid #eef0f5">'+(line.before?'<span style="color:#5b6475">Before: '+esc(line.before)+'</span><br>':'')+'<strong>'+(line.changed?'Now: '+esc(line.now):'No change')+'</strong></td></tr>').join('')+'</table>';
      const html=wrapHTML(subject,'<p>Hi,</p><p>The DegreeSteps plan you saved has changed: <strong>'+esc(title)+'</strong>.</p>'+table+'<p>Your saved courses have not been changed. Open your plan to see how this affects you. Costs are planning estimates, not quotes; confirm with the school before you pay.</p><p>'+links.map(([label,url])=>'<a href="'+esc(url)+'">'+esc(label)+'</a>').join(' · ')+'</p>'+foot.html);
      return{subject,text,html};
    }
    const subject=('Your saved plan: '+title).slice(0,190);
    const facts=[['Credits',creditsLine(now)],['Estimated cost',costLine(now)],['School confirmation',tierLine(now)]];
    const text='Hi,\n\nA monthly reminder about the plan you saved on DegreeSteps: '+title+'.\n\n'+facts.map(([label,value])=>'- '+label+': '+value).join('\n')+'\n\nNothing in this plan has changed since we last wrote. Pick up where you left off:\n\n'+links.map(([label,url])=>label+': '+url).join('\n')+'\n'+foot.text;
    const html=wrapHTML(subject,'<p>Hi,</p><p>A monthly reminder about the plan you saved on DegreeSteps: <strong>'+esc(title)+'</strong>.</p><ul>'+facts.map(([label,value])=>'<li>'+esc(label)+': '+esc(value)+'</li>').join('')+'</ul><p>Nothing in this plan has changed since we last wrote. Pick up where you left off.</p><p>'+links.map(([label,url])=>'<a href="'+esc(url)+'">'+esc(label)+'</a>').join(' · ')+'</p>'+foot.html);
    return{subject,text,html};
  }

  // ---- Scheduled run ----
  const dayOf=now=>new Date(now).toISOString().slice(0,10);
  async function reserveSend(env,now,cap){if(cap<=0)return false;return changes(await stmt(env.DB,'INSERT INTO email_send_days(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<?',dayOf(now),cap).run())>0;}
  async function releaseSend(env,now){await stmt(env.DB,'UPDATE email_send_days SET count=count-1 WHERE day=? AND count>0',dayOf(now)).run();}
  /** Compares every subscribed plan with the public plan data and sends at most one email per subscription per run. */
  async function run(env,context={}){
    if(!enabled(env))return{skipped:'disabled'};
    const config=emailSettings(env);
    if(!env.DB||!config.keyConfigured||!config.from||!config.postalAddress)return{skipped:'not_configured'};
    const now=clock(context),data=await planData(env),site=origin(env),plans=new Map(),stats={checked:0,sent:0,changes:0,reminders:0,pending:0,failed:0,capped:false};
    const reminders=env.EMAIL_ALERT_REMINDERS!=='0';
    const rows=(await stmt(env.DB,'SELECT * FROM plan_alert_subscriptions ORDER BY COALESCE(last_change_email_at,0),COALESCE(last_reminder_at,0),id LIMIT ?',BATCH).all()).results||[];
    for(const row of rows){
      stats.checked++;
      if(!plans.has(row.plan_id))plans.set(row.plan_id,await currentPlan(data,row.plan_id));
      const plan=plans.get(row.plan_id);if(!plan)continue;
      let kind=null;
      if(plan.fingerprint!==row.fingerprint){if(row.last_change_email_at!==null&&now-row.last_change_email_at<CHANGE_GAP){stats.pending++;continue;}kind='change';}
      else if(reminders&&now-Math.max(row.created_at,row.last_reminder_at??0,row.last_change_email_at??0)>=REMINDER_GAP)kind='reminder';
      if(!kind)continue;
      if(!await reserveSend(env,now,config.dailyCap)){stats.capped=true;break;}
      const column=kind==='change'?'last_change_email_at':'last_reminder_at',previous=row[column]??null;
      // Compare-and-set claim, so overlapping scheduled runs never send the same email twice.
      const claimed=changes(await stmt(env.DB,'UPDATE plan_alert_subscriptions SET '+column+'=? WHERE id=? AND fingerprint=? AND COALESCE('+column+',-1)=?',now,row.id,row.fingerprint,previous??-1).run());
      if(!claimed){await releaseSend(env,now);continue;}
      const token=newToken(),tokenHash=await sha256(token);
      await stmt(env.DB,'INSERT INTO plan_alert_tokens(token_hash,subscription_id,created_at) VALUES(?,?,?)',tokenHash,row.id,now).run();
      let before;try{before=JSON.parse(row.summary_json);}catch{before=plan.summary;}
      const unsubscribeURL=site+'/api/alerts/unsubscribe?token='+token;
      const message=composeEmail(env,{kind,title:plan.title,before,now:plan.summary,planURL:plan.page?site+'/degree-plans/'+row.plan_id+'/':'',accountURL:site+'/account.html',unsubscribeURL});
      const result=await sendEmail(env,{to:row.email,...message,headers:{'List-Unsubscribe':'<'+unsubscribeURL+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},
        idempotencyKey:'plan-alert/'+kind+'/'+row.id+'/'+(kind==='change'?plan.fingerprint:dayOf(now)),tags:[{name:'kind',value:'plan_'+kind}]});
      if(result.ok){
        stats.sent++;stats[kind==='change'?'changes':'reminders']++;
        if(kind==='change')await stmt(env.DB,'UPDATE plan_alert_subscriptions SET fingerprint=?,summary_json=? WHERE id=?',plan.fingerprint,JSON.stringify(plan.summary),row.id).run();
        continue;
      }
      stats.failed++;
      await env.DB.batch([stmt(env.DB,'DELETE FROM plan_alert_tokens WHERE token_hash=?',tokenHash),stmt(env.DB,'UPDATE plan_alert_subscriptions SET '+column+'=? WHERE id=? AND '+column+'=?',previous,row.id,now)]);
      await releaseSend(env,now);
      if(!result.retryable||result.code==='rate_limited')break;
    }
    return stats;
  }
  /** Removes alerts when a student deletes a saved plan or their portal data. */
  async function remove(env,{userId,portalPlanId}={}){
    if(!env?.DB||typeof userId!=='string'||!userId)return 0;
    const rows=(await (portalPlanId?stmt(env.DB,'SELECT id FROM plan_alert_subscriptions WHERE user_id=? AND portal_plan_id=?',userId,portalPlanId):stmt(env.DB,'SELECT id FROM plan_alert_subscriptions WHERE user_id=?',userId)).all()).results||[];
    for(const row of rows)await removeById(env,row.id);
    return rows.length;
  }
  return{handle,run,remove,planSummary,composeEmail,fingerprint};
})();
export async function handlePlanAlerts(request,env={},context={}){return DegreePlanAlerts.handle(request,env,context);}
export async function runPlanAlerts(env={},context={}){return DegreePlanAlerts.run(env,context);}
export async function removePlanAlerts(env={},value={}){return DegreePlanAlerts.remove(env,value);}
export function planAlertSummary(entry,modelFingerprint){return DegreePlanAlerts.planSummary(entry,modelFingerprint);}
export function composePlanAlertEmail(env,value){return DegreePlanAlerts.composeEmail(env,value);}
