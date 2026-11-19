/** Anonymous aggregate event counters. This module never reads a student plan. */
const DegreeGrowthMetrics=(()=>{
  'use strict';
  const EVENTS=['landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed'];
  const CONTEXTS=['home','article','provider','school','degree-plan','workspace'];
  const PLANS=['wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential'];
  const MAX_BODY=1024,MAX_BUCKET=1000000,MAX_PER_MINUTE=1200,RETENTION_DAYS=90;
  let windowMinute=-1,windowCount=0;const pruneDays=new WeakMap();
  class Problem extends Error{constructor(status,message){super(message);this.status=status;}}
  const fail=(status,message)=>{throw new Problem(status,message);};
  const response=(value,status=200)=>new Response(value===null?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
  const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const clock=context=>Number.isFinite(context?.now)?context.now:Date.now();
  const day=now=>new Date(now).toISOString().slice(0,10);
  async function owner(env){
    const user=env.PORTAL_USER;
    if(!user||typeof user.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(user.id))fail(401,'Sign in to open growth measurement.');
    if(!env.DB)fail(503,'Aggregate measurement is temporarily unavailable.');
    const configured=typeof env.COMMUNITY_ADMIN_EMAIL==='string'?env.COMMUNITY_ADMIN_EMAIL.trim().toLowerCase():'';
    if(configured&&typeof user.email==='string'&&user.email.trim().toLowerCase()===configured)return;
    const record=await stmt(env.DB,'SELECT role FROM community_users WHERE id=?',user.id).first();
    if(record?.role!=='owner')fail(403,'Only a DegreeSteps owner can open aggregate measurement.');
  }
  async function body(request){
    const origin=new URL(request.url).origin;
    if(request.headers.get('Origin')!==origin||request.headers.get('X-Growth-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'Use DegreeSteps on this site.');
    if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.');
    if(Number(request.headers.get('Content-Length'))>MAX_BODY)fail(413,'The event is too large.');
    const reader=request.body?.getReader();if(!reader)fail(400,'Send an event.');
    let size=0;const parts=[];
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BODY){await reader.cancel();fail(413,'The event is too large.');}parts.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'Send valid JSON.');}
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['event','context','planId'].includes(key))||!EVENTS.includes(value.event)||!CONTEXTS.includes(value.context)||value.planId!==undefined&&!PLANS.includes(value.planId))fail(400,'Choose a supported public event.');
    return{event:value.event,context:value.context,planId:value.planId||''};
  }
  async function prune(env,context={}){
    if(!env.DB)return false;
    const now=clock(context),today=day(now);if(pruneDays.get(env.DB)===today)return false;
    await stmt(env.DB,'DELETE FROM growth_daily_counts WHERE day<?',day(now-RETENTION_DAYS*86400000)).run();pruneDays.set(env.DB,today);return true;
  }
  async function handle(request,env,context={}){
    const url=new URL(request.url),publicEvent=url.pathname==='/api/growth/events',report=url.pathname==='/api/admin/growth-summary';
    if(!publicEvent&&!report)return null;
    try{
      if(publicEvent){
        if(request.method!=='POST')fail(405,'Use POST for aggregate events.');
        const event=await body(request);
        // Privacy signals are respected at the server as well as in the client.
        if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||env.GROWTH_METRICS_DISABLED==='1')return response(null,204);
        if(!env.DB)fail(503,'Aggregate measurement is temporarily unavailable.');
        const now=clock(context),minute=Math.floor(now/60000);if(minute!==windowMinute){windowMinute=minute;windowCount=0;}
        if(++windowCount>MAX_PER_MINUTE)return response(null,204);
        await stmt(env.DB,'INSERT INTO growth_daily_counts(day,event,context,plan_id,count) VALUES(?,?,?,?,1) ON CONFLICT(day,event,context,plan_id) DO UPDATE SET count=count+1 WHERE count<?',day(now),event.event,event.context,event.planId,MAX_BUCKET).run();
        return response(null,204);
      }
      if(request.method!=='GET')fail(405,'Use GET to read aggregate measurement.');
      await owner(env);
      if([...url.searchParams.keys()].some(key=>key!=='days'))fail(400,'Choose a supported date range.');
      const days=url.searchParams.has('days')?Number(url.searchParams.get('days')):30;
      if(!Number.isInteger(days)||days<1||days>RETENTION_DAYS)fail(400,'Choose between 1 and 90 days.');
      const now=clock(context),end=day(now),start=day(now-(days-1)*86400000);
      const rows=(await stmt(env.DB,'SELECT day,event,context,plan_id AS planId,count FROM growth_daily_counts WHERE day>=? AND day<=? ORDER BY day DESC,event,context,plan_id',start,end).all()).results||[];
      const totals=EVENTS.map(event=>({event,count:rows.filter(row=>row.event===event).reduce((sum,row)=>sum+Number(row.count),0)}));
      const result=response({period:{start,end,days},events:totals,rows,methodology:{unit:'aggregate events',uniquePeopleMeasured:false,conversionRateMeasured:false,visitorIdentifiersStored:false,cookiesUsed:false,privateRecordsIncluded:false,retentionDays:RETENTION_DAYS,limits:'Counts exclude visitors who opt out or send browser privacy signals. Duplicate visits, blocked requests and rate limits affect totals. These are directional event counts, not unique students or linked conversion rates.'}});
      result.headers.set('Vary','Cookie');return result;
    }catch(error){return response({error:error instanceof Problem?error.message:'Aggregate measurement is temporarily unavailable.'},error instanceof Problem?error.status:503);}
  }
  return{handle,prune};
})();
export async function handleGrowthMetrics(request,env,context={}){return DegreeGrowthMetrics.handle(request,env,context);}
export async function pruneGrowthMetrics(env,context={}){return DegreeGrowthMetrics.prune(env,context);}
