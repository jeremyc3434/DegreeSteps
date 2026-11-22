/** Opt-in revenue features, both off by default.
 *  - "Have [School] contact me" (SCHOOL_INQUIRIES_ENABLED=1, plus a school on the allowlist in
 *    content/monetization/schools.json, copied to /data/lead-settings.json at build time).
 *  - Paid "Plan review" demand test (PLAN_REVIEW_ENABLED=1, offer from content/monetization/plan-review.json).
 * With a flag unset every route for that feature answers 404 before reading identity, data or the database.
 * Requests are stored in D1 only, with the exact consent wording the student agreed to, and deleted after
 * 365 days. Nothing is sent to a school, payment provider or anyone else automatically: the owner exports a
 * CSV from the admin page and forwards it by hand. This module never reads or changes plans, rankings or the
 * order of anything a student sees; the Worker gives it only plan titles and school names for the plan id.
 * The Worker supplies DB, LEADS_HASH_SALT (16+ characters), LEADS_DATA (async: {plans:{id:{title,school}},
 * settings}) and, for owner routes, PORTAL_USER. No package imports: the Worker bundle concatenates sources. */
const leadsApi=(()=>{
  'use strict';
  const MAX_BODY=4096,RETENTION_DAYS=365,DAY=86400000,DAILY_LIMIT=5,MAX_LIST=500;
  const INQUIRY_CONSENT_VERSION='school-inquiry-v1',REVIEW_CONSENT_VERSION='plan-review-v1';
  const START_TIMINGS=Object.freeze({'this-term':'This term','next-6-months':'In the next 6 months','later':'Later'});
  const PRIOR_CREDIT=Object.freeze({yes:'Yes',no:'No'});
  const REVIEW_STATUSES=['waitlist','checkout'];
  const DEFAULT_REVIEW=Object.freeze({price:49,currency:'USD',turnaroundDays:5,status:'waitlist'});
  const PLAN=/^[a-z0-9][a-z0-9-]{0,127}$/,EMAIL=/^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/,PHONE=/^[0-9+().\-\s]{7,40}$/;
  /** The exact wording shown next to the unticked checkbox, and stored with each request. */
  const inquiryConsent=school=>'I agree that DegreeSteps may share these details with '+school+' so its admissions team can contact me about this program. This is optional, and it doesn’t change your plan.';
  const REVIEW_CONSENT='I agree that DegreeSteps may keep these details and email me about a plan review. DegreeSteps won’t share them with a school or anyone else, and I’m not paying anything now.';

  class Problem extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new Problem(status,message,code);};
  const baseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...baseHeaders}});
  const notFound=()=>json({error:'Not found.'},404);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const inquiriesOn=env=>env?.SCHOOL_INQUIRIES_ENABLED==='1';
  const reviewOn=env=>env?.PLAN_REVIEW_ENABLED==='1';
  const salt=env=>typeof env?.LEADS_HASH_SALT==='string'&&env.LEADS_HASH_SALT.length>=16?env.LEADS_HASH_SALT:null;
  const ready=env=>Boolean(env?.DB&&salt(env)&&typeof env.LEADS_DATA==='function');
  const dayOf=time=>new Date(time).toISOString().slice(0,10);
  const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,' ').replace(/\s+/g,' ').trim();

  /** Settings from content/monetization/*.json. Anything unexpected falls back to the safe default (no schools). */
  function normalizeSettings(raw){
    const value=object(raw)?raw:{},schoolList=Array.isArray(value.schools)?value.schools:[];
    const schools=[...new Set(schoolList.filter(name=>typeof name==='string').map(clean).filter(name=>name.length>=2&&name.length<=160))].sort();
    const review=object(value.planReview)?value.planReview:{};
    const price=Number.isInteger(review.price)&&review.price>=0&&review.price<=10000?review.price:DEFAULT_REVIEW.price;
    const currency=typeof review.currency==='string'&&/^[A-Z]{3}$/.test(review.currency)?review.currency:DEFAULT_REVIEW.currency;
    const turnaroundDays=Number.isInteger(review.turnaroundDays)&&review.turnaroundDays>=1&&review.turnaroundDays<=60?review.turnaroundDays:DEFAULT_REVIEW.turnaroundDays;
    const status=REVIEW_STATUSES.includes(review.status)?review.status:DEFAULT_REVIEW.status;
    return{schools,planReview:{price,currency,turnaroundDays,status}};
  }
  async function data(env){
    let value;try{value=await env.LEADS_DATA();}catch{fail(503,'This form is temporarily unavailable. Your plan has not changed.','leads_unavailable');}
    if(!object(value)||!object(value.plans))fail(503,'This form is temporarily unavailable. Your plan has not changed.','leads_unavailable');
    return{plans:value.plans,settings:normalizeSettings(value.settings)};
  }
  function planOf(store,id){
    if(typeof id!=='string'||!PLAN.test(id)||!Object.hasOwn(store.plans,id))return null;
    const plan=store.plans[id];if(!object(plan)||typeof plan.title!=='string'||typeof plan.school!=='string')return null;
    const title=clean(plan.title).slice(0,200),school=clean(plan.school).slice(0,160);
    return title&&school?{id,title,school}:null;
  }

  // ---------- Input ----------
  function writeProtection(request){
    const origin=new URL(request.url).origin,site=request.headers.get('Sec-Fetch-Site');
    if(request.headers.get('Origin')!==origin||request.headers.get('X-Leads-Request')!=='1'||site&&!['same-origin','none'].includes(site))fail(403,'Use the form on DegreeSteps.','same_origin_required');
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'Send the form as JSON.','json_required');
  }
  async function readJson(request){
    const length=Number(request.headers.get('Content-Length'));if(Number.isFinite(length)&&length>MAX_BODY)fail(413,'That form is too long.','too_large');
    const reader=request.body?.getReader();if(!reader)fail(400,'Fill in the form.','invalid_request');
    const chunks=[];let bytes=0;
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BODY){await reader.cancel().catch(()=>{});fail(413,'That form is too long.','too_large');}chunks.push(value);}
    let body;try{const merged=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(merged));}catch{fail(400,'Send the form as JSON.','invalid_request');}
    if(!object(body))fail(400,'Fill in the form.','invalid_request');
    return body;
  }
  function only(body,keys){for(const key of Object.keys(body))if(!keys.includes(key))fail(400,'The form has an unexpected field.','invalid_request');}
  function field(value,label,min,max,code){
    if(value!==undefined&&value!==null&&typeof value!=='string')fail(400,label+' must be text.',code);
    const text=clean(value);
    if(text.length<min)fail(400,min>1?label+' needs at least '+min+' characters.':'Enter '+label.toLowerCase()+'.',code);
    if(text.length>max)fail(400,label+' can be up to '+max+' characters.',code);
    return text;
  }
  function email(value){const text=field(value,'Your email',3,254,'invalid_email');if(!EMAIL.test(text))fail(400,'Enter an email address like name@example.com.','invalid_email');return text;}
  // A filled-in hidden field means an automated submission. It is answered like a success and never stored.
  const honeypot=body=>typeof body.website==='string'&&body.website.trim()!=='';

  // ---------- Rate limit: per salted hash of (IP + day) and form, never the IP itself ----------
  async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');}
  async function reserve(request,env,kind,now){
    const day=dayOf(now),ip=request.headers.get('CF-Connecting-IP')||'',hash=await sha256(salt(env)+'|leads|'+ip+'|'+day);
    const result=await env.DB.prepare('INSERT INTO lead_rate_limits (day,visitor_hash,kind,count) VALUES (?,?,?,1) ON CONFLICT(day,visitor_hash,kind) DO UPDATE SET count=count+1 WHERE lead_rate_limits.count<?').bind(day,hash,kind,DAILY_LIMIT).run();
    if(!(Number(result?.meta?.changes)>0))fail(429,'You have sent this form several times today. Please try again tomorrow.','daily_limit');
  }

  // ---------- Public routes ----------
  async function status(env){
    if(!ready(env))return json({enabled:false},200);
    const store=await data(env),inquiries=inquiriesOn(env)&&store.settings.schools.length>0;
    return json({enabled:true,
      schoolInquiries:inquiries?{enabled:true,schools:store.settings.schools,consentVersion:INQUIRY_CONSENT_VERSION,startTimings:START_TIMINGS}:{enabled:false},
      planReview:reviewOn(env)?{enabled:true,...store.settings.planReview,consentVersion:REVIEW_CONSENT_VERSION,consentText:REVIEW_CONSENT}:{enabled:false},
      disclosure:'/why-its-free/'});
  }
  async function submitInquiry(request,env,now){
    writeProtection(request);const body=await readJson(request);
    only(body,['planId','firstName','email','phone','location','startTiming','priorCredit','consent','consentVersion','website']);
    const store=await data(env),plan=planOf(store,body.planId);
    // A plan whose school is not on the allowlist has no inquiry form at all.
    if(!plan||!store.settings.schools.includes(plan.school))return notFound();
    if(honeypot(body))return json({ok:true,school:plan.school,disclosure:'/why-its-free/'},201);
    const firstName=field(body.firstName,'Your first name',1,60,'invalid_name'),address=email(body.email);
    const phone=field(body.phone??'','Phone',0,40,'invalid_phone');if(phone&&!PHONE.test(phone))fail(400,'Enter a phone number using digits, spaces, +, - or brackets, or leave it blank.','invalid_phone');
    const location=field(body.location,'Your state or country',2,80,'invalid_location');
    if(!Object.hasOwn(START_TIMINGS,body.startTiming))fail(400,'Choose when you plan to start.','invalid_start');
    if(!Object.hasOwn(PRIOR_CREDIT,body.priorCredit))fail(400,'Choose whether you have earlier college credit.','invalid_prior_credit');
    if(body.consent!==true||body.consentVersion!==INQUIRY_CONSENT_VERSION)fail(400,'Tick the box to agree that DegreeSteps may share these details with '+plan.school+'.','consent_required');
    await reserve(request,env,'school_inquiry',now);
    await env.DB.prepare('INSERT INTO school_inquiries (id,created_at,plan_id,plan_title,school,first_name,email,phone,location,start_timing,prior_credit,consent_version,consent_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),now,plan.id,plan.title,plan.school,firstName,address,phone,location,body.startTiming,body.priorCredit,INQUIRY_CONSENT_VERSION,inquiryConsent(plan.school)).run();
    return json({ok:true,school:plan.school,disclosure:'/why-its-free/'},201);
  }
  async function submitReview(request,env,now){
    writeProtection(request);const body=await readJson(request);
    only(body,['name','email','planId','note','consent','consentVersion','website']);
    const store=await data(env),offer=store.settings.planReview;
    let plan=null;
    if(body.planId!==undefined&&body.planId!==null&&body.planId!==''){plan=planOf(store,body.planId);if(!plan)fail(400,'Choose a plan from DegreeSteps, or leave the plan blank.','invalid_plan');}
    if(honeypot(body))return json({ok:true,status:offer.status,checkoutUrl:null},201);
    const name=field(body.name,'Your name',1,100,'invalid_name'),address=email(body.email),note=field(body.note??'','Your note',0,1000,'invalid_note');
    if(body.consent!==true||body.consentVersion!==REVIEW_CONSENT_VERSION)fail(400,'Tick the box to agree that DegreeSteps may email you about a plan review.','consent_required');
    await reserve(request,env,'plan_review',now);
    await env.DB.prepare('INSERT INTO plan_review_requests (id,created_at,name,email,plan_id,plan_title,note,offer_price,offer_currency,offer_status,consent_version,consent_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),now,name,address,plan?.id||'',plan?.title||'',note,offer.price,offer.currency,offer.status,REVIEW_CONSENT_VERSION,REVIEW_CONSENT).run();
    // Stripe stub (not integrated). When the owner sets plan-review.json "status" to "checkout" and adds a
    // payment provider, this is where a Stripe Checkout Session URL (or a fixed Payment Link from an env var
    // such as PLAN_REVIEW_CHECKOUT_URL) would be created for this request id and returned as checkoutUrl.
    // Until then "checkout" behaves exactly like "waitlist": the request is stored and no payment is taken.
    return json({ok:true,status:offer.status,checkoutUrl:null},201);
  }

  // ---------- Owner routes ----------
  async function owner(env){
    const user=env.PORTAL_USER;
    if(!user||typeof user.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(user.id))fail(401,'Sign in to view requests.','sign_in_required');
    const configured=typeof env.COMMUNITY_ADMIN_EMAIL==='string'?env.COMMUNITY_ADMIN_EMAIL.trim().toLowerCase():'';
    if(configured&&typeof user.email==='string'&&user.email.trim().toLowerCase()===configured)return;
    const record=await env.DB.prepare('SELECT role FROM community_users WHERE id=?').bind(user.id).first();
    if(record?.role!=='owner')fail(403,'Only a DegreeSteps owner can view requests.','owner_required');
  }
  const iso=value=>new Date(Number(value)).toISOString();
  const INQUIRY_COLUMNS=[['created_at','Submitted (UTC)',row=>iso(row.created_at)],['school','School'],['plan_id','Plan id'],['plan_title','Plan'],['first_name','First name'],['email','Email'],['phone','Phone'],['location','State or country'],['start_timing','Intended start',row=>START_TIMINGS[row.start_timing]||row.start_timing],['prior_credit','Prior credit',row=>PRIOR_CREDIT[row.prior_credit]||row.prior_credit],['consent_text','Consent shown']];
  const REVIEW_COLUMNS=[['created_at','Submitted (UTC)',row=>iso(row.created_at)],['name','Name'],['email','Email'],['plan_id','Plan id'],['plan_title','Plan'],['note','Note'],['offer_price','Price shown'],['offer_currency','Currency'],['offer_status','Offer status'],['consent_text','Consent shown']];
  // Spreadsheet apps run cells that start with = + - @ as formulas, so those are prefixed with an apostrophe.
  const cell=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
  function csv(columns,rows){return '﻿'+[columns.map(column=>cell(column[1])).join(','),...rows.map(row=>columns.map(([key,,read])=>cell(read?read(row):row[key])).join(','))].join('\r\n')+'\r\n';}
  async function ownerList(request,env,kind,now){
    if(request.method!=='GET')fail(405,'Use GET.','method_not_allowed');
    await owner(env);
    const url=new URL(request.url);if([...url.searchParams.keys()].some(key=>key!=='format'))fail(400,'Choose a supported format.','invalid_request');
    const format=url.searchParams.get('format')||'json';if(!['json','csv'].includes(format))fail(400,'Choose a supported format.','invalid_request');
    const table=kind==='inquiries'?'school_inquiries':'plan_review_requests',columns=kind==='inquiries'?INQUIRY_COLUMNS:REVIEW_COLUMNS;
    // Rows past the retention period are never shown, even before the scheduled cleanup has run.
    const rows=(await env.DB.prepare('SELECT * FROM '+table+' WHERE created_at>=? ORDER BY created_at DESC,id DESC LIMIT ?').bind(now-RETENTION_DAYS*DAY,MAX_LIST).all()).results||[];
    if(format==='csv'){
      const name=(kind==='inquiries'?'school-inquiries-':'plan-review-requests-')+dayOf(now)+'.csv';
      return new Response(csv(columns,rows),{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+name+'"',...baseHeaders,Vary:'Cookie'}});
    }
    const items=rows.map(row=>Object.fromEntries(columns.map(([key,,read])=>[key,read?read(row):row[key]])));
    const result=json({items,limit:MAX_LIST,retentionDays:RETENTION_DAYS,columns:columns.map(([key,label])=>({key,label}))});result.headers.set('Vary','Cookie');return result;
  }

  const ROUTES=Object.freeze({'/api/leads/status':'status','/api/school-inquiries':'inquiry','/api/plan-review/requests':'review','/api/admin/school-inquiries':'inquiries','/api/admin/plan-review-requests':'reviews'});
  const owned=path=>Object.hasOwn(ROUTES,path);
  async function handle(request,env,context={}){
    const path=new URL(request.url).pathname;if(!owned(path))return null;
    const route=ROUTES[path],now=Number.isFinite(context?.now)?context.now:Date.now();
    try{
      // Flags off: the feature does not exist. Nothing else is read.
      if(route==='status'){if(!inquiriesOn(env)&&!reviewOn(env))return json({enabled:false},404);if(request.method!=='GET')fail(405,'Use GET.','method_not_allowed');return await status(env);}
      if((route==='inquiry'||route==='inquiries')&&!inquiriesOn(env))return notFound();
      if((route==='review'||route==='reviews')&&!reviewOn(env))return notFound();
      if(!ready(env))fail(503,'This form is temporarily unavailable. Your plan has not changed.','leads_unconfigured');
      if(route==='inquiries'||route==='reviews')return await ownerList(request,env,route==='inquiries'?'inquiries':'reviews',now);
      if(request.method!=='POST')fail(405,'Use POST.','method_not_allowed');
      return route==='inquiry'?await submitInquiry(request,env,now):await submitReview(request,env,now);
    }catch(error){return error instanceof Problem?json({error:error.message,code:error.code},error.status):json({error:'This form is temporarily unavailable. Your plan has not changed.',code:'leads_unavailable'},503);}
  }
  /** Retention: requests are deleted 365 days after they were made; rate-limit rows after two days. */
  async function prune(env,now=Date.now()){
    if(!env?.DB)return false;
    await env.DB.prepare('DELETE FROM school_inquiries WHERE created_at<?').bind(now-RETENTION_DAYS*DAY).run();
    await env.DB.prepare('DELETE FROM plan_review_requests WHERE created_at<?').bind(now-RETENTION_DAYS*DAY).run();
    await env.DB.prepare('DELETE FROM lead_rate_limits WHERE day<?').bind(dayOf(now-2*DAY)).run();
    return true;
  }
  const internals=Object.freeze({RETENTION_DAYS,DAILY_LIMIT,INQUIRY_CONSENT_VERSION,REVIEW_CONSENT_VERSION,REVIEW_CONSENT,inquiryConsent,normalizeSettings,csv,START_TIMINGS});
  return{handle,prune,owned,internals};
})();
export async function handleLeads(request,env={},context={}){return leadsApi.handle(request,env,context);}
export async function pruneLeads(env,now){return leadsApi.prune(env,now);}
export function isLeadsPath(path){return leadsApi.owned(path);}
export function normalizeLeadSettings(raw){return leadsApi.internals.normalizeSettings(raw);}
export const leadsInternals=leadsApi.internals;
