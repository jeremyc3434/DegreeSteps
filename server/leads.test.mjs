/** School contact requests and the Plan review demand test: flags, consent, honeypot, rate limits, validation,
 *  owner-only lists and CSV export, and retention. Synthetic data only; nothing leaves the process. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrustedDatabase} from '../scripts/d1-snapshot.mjs';
import {handleLeads,pruneLeads,isLeadsPath,normalizeLeadSettings,leadsInternals} from './leads.mjs';

const origin='https://leads.synthetic.invalid',DAY=86400000,now=Date.UTC(2026,10,22,12);
const coachPlans=JSON.parse(readFileSync(new URL('../dist/data/coach-index.json',import.meta.url),'utf8')).plans;
const wguPlan=Object.keys(coachPlans).find(id=>coachPlans[id].school==='Western Governors University');
const libertyPlan=Object.keys(coachPlans).find(id=>coachPlans[id].school==='Liberty University');
assert(wguPlan&&libertyPlan);
const ROUTES=[['/api/leads/status','GET'],['/api/school-inquiries','POST'],['/api/plan-review/requests','POST'],['/api/admin/school-inquiries','GET'],['/api/admin/plan-review-requests','GET']];

function fixture(t,{inquiries=true,review=true,schools=['Western Governors University'],planReview={price:49,currency:'USD',turnaroundDays:5,status:'waitlist'},user={id:'owner-1'}}={}){
 const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());
 for(const [id,role]of[['owner-1','owner'],['member-1','member']])sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'Synthetic '+role,role,1,1);
 const queries=[];
 const DB={prepare(sql){queries.push(sql);const statement=sqlite.prepare(sql);return{bind(...values){return{first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};}};}};
 const env={DB,LEADS_HASH_SALT:'synthetic-leads-salt-0001',LEADS_DATA:async()=>({plans:coachPlans,settings:{schools,planReview}}),PORTAL_USER:user,COMMUNITY_ADMIN_EMAIL:'configured@example.invalid',...(inquiries?{SCHOOL_INQUIRIES_ENABLED:'1'}:{}),...(review?{PLAN_REVIEW_ENABLED:'1'}:{})};
 return{sqlite,env,queries,count:table=>sqlite.prepare('SELECT count(*) AS n FROM '+table).get().n};
}
const post=(path,body,{headers={},ip='203.0.113.7'}={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Leads-Request':'1','CF-Connecting-IP':ip,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const get=path=>new Request(origin+path,{method:'GET'});
const call=(f,request,at=now)=>handleLeads(request,f.env,{now:at});
const inquiry=(extra={})=>({planId:wguPlan,firstName:'Jordan',email:'jordan@example.com',phone:'',location:'Ohio',startTiming:'next-6-months',priorCredit:'yes',consent:true,consentVersion:leadsInternals.INQUIRY_CONSENT_VERSION,...extra});
const review=(extra={})=>({name:'Sam Rivera',email:'sam@example.com',planId:libertyPlan,note:'Two Sophia courses done.',consent:true,consentVersion:leadsInternals.REVIEW_CONSENT_VERSION,...extra});

test('with both flags off every route is 404 and nothing is read, not even the database or plan data',async()=>{
 let touched=0;const trap=new Proxy({},{get(){touched++;throw Error('must not be read');}});
 for(const [path,method]of ROUTES){
  assert(isLeadsPath(path));
  const response=await handleLeads(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Leads-Request':'1'},...(method==='POST'?{body:'{}'}:{})}),{DB:trap,LEADS_DATA:()=>{touched++;},PORTAL_USER:{id:'owner-1'}});
  assert.equal(response.status,404,path);
 }
 assert.equal(touched,0);
 assert.deepEqual(await (await handleLeads(get('/api/leads/status'),{})).json(),{enabled:false});
 assert.equal(await handleLeads(get('/api/coach/status'),{}),null,'Other routes are not handled here');
});

test('each flag gates only its own routes',async t=>{
 const onlyReview=fixture(t,{inquiries:false});
 assert.equal((await call(onlyReview,post('/api/school-inquiries',inquiry()))).status,404);
 assert.equal((await call(onlyReview,get('/api/admin/school-inquiries'))).status,404);
 const status=await (await call(onlyReview,get('/api/leads/status'))).json();assert.equal(status.schoolInquiries.enabled,false);assert.equal(status.planReview.enabled,true);
 const onlyInquiries=fixture(t,{review:false});
 assert.equal((await call(onlyInquiries,post('/api/plan-review/requests',review()))).status,404);
 assert.equal((await call(onlyInquiries,get('/api/admin/plan-review-requests'))).status,404);
 assert.equal(onlyReview.count('school_inquiries')+onlyInquiries.count('plan_review_requests'),0);
});

test('status lists allowlisted schools only when inquiries are on, and the offer only when Plan review is on',async t=>{
 const f=fixture(t),status=await (await call(f,get('/api/leads/status'))).json();
 assert.deepEqual(status.schoolInquiries.schools,['Western Governors University']);assert.equal(status.schoolInquiries.consentVersion,'school-inquiry-v1');
 assert.deepEqual({price:status.planReview.price,currency:status.planReview.currency,turnaroundDays:status.planReview.turnaroundDays,status:status.planReview.status},{price:49,currency:'USD',turnaroundDays:5,status:'waitlist'});
 assert.equal(status.disclosure,'/how-we-make-money/');
 const empty=fixture(t,{schools:[],review:false});assert.equal((await (await call(empty,get('/api/leads/status'))).json()).schoolInquiries.enabled,false,'An empty allowlist shows no button');
 const unsalted=fixture(t);delete unsalted.env.LEADS_HASH_SALT;assert.deepEqual(await (await call(unsalted,get('/api/leads/status'))).json(),{enabled:false});
 assert.equal((await call(unsalted,post('/api/school-inquiries',inquiry()))).status,503);
});

test('a school not on the allowlist has no inquiry route; an allowlisted one stores the request with its consent wording',async t=>{
 const f=fixture(t);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry({planId:libertyPlan})))).status,404);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry({planId:'not-a-plan'})))).status,404);
 const response=await call(f,post('/api/school-inquiries',inquiry({phone:'+1 (614) 555-0100'})));assert.equal(response.status,201);
 assert.deepEqual(await response.json(),{ok:true,school:'Western Governors University',disclosure:'/how-we-make-money/'});
 const row=f.sqlite.prepare('SELECT * FROM school_inquiries').get();
 assert.equal(row.plan_id,wguPlan);assert.equal(row.plan_title,coachPlans[wguPlan].title);assert.equal(row.school,'Western Governors University');
 assert.deepEqual([row.first_name,row.email,row.phone,row.location,row.start_timing,row.prior_credit],['Jordan','jordan@example.com','+1 (614) 555-0100','Ohio','next-6-months','yes']);
 assert.equal(row.consent_text,'I agree that DegreeSteps may share these details with Western Governors University so its admissions team can contact me about this program. This is optional, and it doesn’t change your plan.');
 assert.equal(row.created_at,now);
 assert(!JSON.stringify(f.sqlite.prepare('SELECT * FROM lead_rate_limits').all()).includes('203.0.113.7'),'The IP address itself is never stored');
});

test('consent must be explicitly ticked for the current wording, or nothing is stored',async t=>{
 const f=fixture(t);
 for(const extra of[{consent:false},{consent:'true'},{consent:undefined},{consentVersion:'school-inquiry-v0'}]){
  const response=await call(f,post('/api/school-inquiries',inquiry(extra)));assert.equal(response.status,400,JSON.stringify(extra));assert.equal((await response.json()).code,'consent_required');
 }
 for(const extra of[{consent:false},{consentVersion:undefined}]){const response=await call(f,post('/api/plan-review/requests',review(extra)));assert.equal(response.status,400);assert.equal((await response.json()).code,'consent_required');}
 assert.equal(f.count('school_inquiries')+f.count('plan_review_requests')+f.count('lead_rate_limits'),0);
});

test('a filled honeypot looks like success but stores nothing and uses no rate allowance',async t=>{
 const f=fixture(t);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry({website:'https://spam.example'})))).status,201);
 assert.equal((await call(f,post('/api/plan-review/requests',review({website:'buy now'})))).status,201);
 assert.equal(f.count('school_inquiries')+f.count('plan_review_requests')+f.count('lead_rate_limits'),0);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry({website:'   '})))).status,201);assert.equal(f.count('school_inquiries'),1,'A blank honeypot is a real request');
});

test('submissions are limited per hashed IP, day and form',async t=>{
 const f=fixture(t);
 for(let i=0;i<leadsInternals.DAILY_LIMIT;i++)assert.equal((await call(f,post('/api/school-inquiries',inquiry()))).status,201,'request '+(i+1));
 const limited=await call(f,post('/api/school-inquiries',inquiry()));assert.equal(limited.status,429);assert.equal((await limited.json()).code,'daily_limit');
 assert.equal((await call(f,post('/api/school-inquiries',inquiry(),{ip:'198.51.100.4'}))).status,201,'Another visitor is not affected');
 assert.equal((await call(f,post('/api/plan-review/requests',review()))).status,201,'Each form has its own allowance');
 assert.equal((await call(f,post('/api/school-inquiries',inquiry()),now+DAY)).status,201,'The allowance resets the next UTC day');
 assert.equal(f.count('school_inquiries'),leadsInternals.DAILY_LIMIT+2);
 const hashes=f.sqlite.prepare('SELECT visitor_hash FROM lead_rate_limits').all().map(row=>row.visitor_hash);assert(hashes.every(hash=>/^[0-9a-f]{64}$/.test(hash)));
});

test('validation rejects bad fields, unknown fields, cross-site posts and oversized bodies',async t=>{
 const f=fixture(t);
 const cases=[
  [inquiry({firstName:''}),400,'invalid_name'],[inquiry({firstName:'x'.repeat(61)}),400,'invalid_name'],[inquiry({email:'not-an-email'}),400,'invalid_email'],[inquiry({email:'a@b'}),400,'invalid_email'],
  [inquiry({phone:'call me maybe'}),400,'invalid_phone'],[inquiry({location:'X'}),400,'invalid_location'],[inquiry({startTiming:'someday'}),400,'invalid_start'],[inquiry({priorCredit:'maybe'}),400,'invalid_prior_credit'],
  [inquiry({ssn:'123-45-6789'}),400,'invalid_request'],[inquiry({firstName:42}),400,'invalid_name']
 ];
 for(const [body,status,code]of cases){const response=await call(f,post('/api/school-inquiries',body));assert.equal(response.status,status,JSON.stringify(body));assert.equal((await response.json()).code,code);}
 for(const [body,code]of[[review({name:''}),'invalid_name'],[review({email:'x'}),'invalid_email'],[review({note:'n'.repeat(1001)}),'invalid_note'],[review({planId:'not-a-plan'}),'invalid_plan'],[review({price:1}),'invalid_request']]){const response=await call(f,post('/api/plan-review/requests',body));assert.equal(response.status,400);assert.equal((await response.json()).code,code);}
 assert.equal((await call(f,post('/api/school-inquiries',inquiry(),{headers:{Origin:'https://elsewhere.example'}}))).status,403);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry(),{headers:{'X-Leads-Request':'0'}}))).status,403);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry(),{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403);
 assert.equal((await call(f,post('/api/school-inquiries',inquiry(),{headers:{'Content-Type':'text/plain'}}))).status,415);
 assert.equal((await call(f,post('/api/school-inquiries',JSON.stringify(inquiry({location:'x'.repeat(5000)}))))).status,413);
 assert.equal((await call(f,post('/api/school-inquiries','{not json'))).status,400);
 assert.equal((await call(f,get('/api/school-inquiries'))).status,405);
 assert.equal(f.count('school_inquiries')+f.count('plan_review_requests'),0);
});

test('a Plan review request stores the offer shown and takes no payment; checkout is a stub that behaves like waitlist',async t=>{
 const f=fixture(t),response=await call(f,post('/api/plan-review/requests',review()));assert.equal(response.status,201);
 assert.deepEqual(await response.json(),{ok:true,status:'waitlist',checkoutUrl:null});
 const row=f.sqlite.prepare('SELECT * FROM plan_review_requests').get();
 assert.deepEqual([row.name,row.email,row.plan_id,row.plan_title,row.note,row.offer_price,row.offer_currency,row.offer_status],['Sam Rivera','sam@example.com',libertyPlan,coachPlans[libertyPlan].title,'Two Sophia courses done.',49,'USD','waitlist']);
 assert.equal(row.consent_text,leadsInternals.REVIEW_CONSENT);
 assert.equal((await call(f,post('/api/plan-review/requests',review({planId:'',note:undefined}),{ip:'198.51.100.9'}))).status,201,'The plan and note are optional');
 const checkout=fixture(t,{planReview:{price:79,currency:'USD',turnaroundDays:3,status:'checkout'}});
 assert.deepEqual(await (await call(checkout,post('/api/plan-review/requests',review()))).json(),{ok:true,status:'checkout',checkoutUrl:null});
 assert.equal(checkout.sqlite.prepare('SELECT offer_price FROM plan_review_requests').get().offer_price,79);
});

test('owner-only lists and CSV export: signed-out 401, members 403, owners get escaped CSV',async t=>{
 const f=fixture(t);
 await call(f,post('/api/school-inquiries',inquiry({firstName:'=HYPERLINK("http://x")',location:'Ohio, USA'})));
 await call(f,post('/api/plan-review/requests',review({note:'+cmd|calc'})));
 for(const path of['/api/admin/school-inquiries','/api/admin/plan-review-requests','/api/admin/school-inquiries?format=csv']){
  f.env.PORTAL_USER=null;assert.equal((await call(f,get(path))).status,401,path);
  f.env.PORTAL_USER={id:'member-1',email:'member@example.invalid'};assert.equal((await call(f,get(path))).status,403,path);
 }
 f.env.PORTAL_USER={id:'someone',email:'Configured@Example.invalid'};assert.equal((await call(f,get('/api/admin/school-inquiries'))).status,200,'The configured owner email is accepted');
 f.env.PORTAL_USER={id:'owner-1'};
 const list=await call(f,get('/api/admin/school-inquiries'));assert.equal(list.status,200);assert.equal(list.headers.get('Cache-Control'),'private, no-store');
 const data=await list.json();assert.equal(data.items.length,1);assert.equal(data.items[0].start_timing,'In the next 6 months');assert.equal(data.items[0].created_at,new Date(now).toISOString());assert.equal(data.retentionDays,365);
 const csv=await call(f,get('/api/admin/school-inquiries?format=csv'));assert.equal(csv.status,200);
 assert.match(csv.headers.get('Content-Type'),/^text\/csv/);assert.match(csv.headers.get('Content-Disposition'),/attachment; filename="school-inquiries-2026-11-22\.csv"/);
 const bytes=new Uint8Array(await csv.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[0xef,0xbb,0xbf],'A byte order mark lets spreadsheet apps read UTF-8');const text=new TextDecoder().decode(bytes);assert(text.startsWith('Submitted (UTC),School,Plan id,Plan,First name,Email,Phone,State or country,Intended start,Prior credit,Consent shown\r\n'));
 assert(text.includes(`"'=HYPERLINK(""http://x"")"`),'Formula-looking cells are neutralised');assert(text.includes('"Ohio, USA"'));
 const reviewCsv=await (await call(f,get('/api/admin/plan-review-requests?format=csv'))).text();assert(reviewCsv.includes(",'+cmd|calc,"));assert(reviewCsv.includes(',49,USD,waitlist,'));
 assert.equal((await call(f,get('/api/admin/school-inquiries?format=xml'))).status,400);
 assert.equal((await call(f,new Request(origin+'/api/admin/school-inquiries',{method:'POST'}))).status,405);
});

test('retention: requests are deleted after 365 days by the scheduled cleanup and hidden from the owner list before that',async t=>{
 const f=fixture(t);
 await call(f,post('/api/school-inquiries',inquiry()),now-366*DAY);
 await call(f,post('/api/school-inquiries',inquiry({firstName:'Recent'}),{ip:'198.51.100.1'}),now-10*DAY);
 await call(f,post('/api/plan-review/requests',review()),now-400*DAY);
 await call(f,post('/api/plan-review/requests',review({name:'Kept'})),now-364*DAY);
 const listed=await (await call(f,get('/api/admin/school-inquiries'))).json();assert.deepEqual(listed.items.map(item=>item.first_name),['Recent']);
 assert.equal(f.count('lead_rate_limits'),4);
 assert.equal(await pruneLeads(f.env,now),true);
 assert.deepEqual(f.sqlite.prepare('SELECT first_name FROM school_inquiries').all().map(row=>row.first_name),['Recent']);
 assert.deepEqual(f.sqlite.prepare('SELECT name FROM plan_review_requests').all().map(row=>row.name),['Kept']);
 assert.equal(f.count('lead_rate_limits'),0,'Rate-limit rows older than two days are removed');
 assert.equal(await pruneLeads({},now),false);
});

test('the database refuses values outside the fixed lists even if validation is bypassed',t=>{
 const f=fixture(t),insert=(start,prior)=>f.sqlite.prepare("INSERT INTO school_inquiries(id,created_at,plan_id,plan_title,school,first_name,email,phone,location,start_timing,prior_credit,consent_version,consent_text) VALUES('x',1,'plan','T','S','A','a@b.co','','OH',?,?,'v1','consent text that is long enough')").run(start,prior);
 assert.throws(()=>insert('someday','yes'),/CHECK/);assert.throws(()=>insert('later','maybe'),/CHECK/);
 assert.throws(()=>f.sqlite.prepare("INSERT INTO lead_rate_limits(day,visitor_hash,kind,count) VALUES('2026-11-22','203.0.113.7','school_inquiry',1)").run(),/CHECK/,'Raw IPs cannot be stored as the visitor key');
});

test('settings fall back safely: unknown values never enable schools or change the default offer',()=>{
 assert.deepEqual(normalizeLeadSettings(null),{schools:[],planReview:{price:49,currency:'USD',turnaroundDays:5,status:'waitlist'}});
 assert.deepEqual(normalizeLeadSettings({schools:['Western Governors University',' Western Governors University ',7,'x'],planReview:{price:-1,currency:'usd',turnaroundDays:0,status:'free'}}),{schools:['Western Governors University'],planReview:{price:49,currency:'USD',turnaroundDays:5,status:'waitlist'}});
 const shipped=normalizeLeadSettings({schools:JSON.parse(readFileSync(new URL('../content/monetization/schools.json',import.meta.url),'utf8')).schools,planReview:JSON.parse(readFileSync(new URL('../content/monetization/plan-review.json',import.meta.url),'utf8'))});
 assert.deepEqual(shipped,{schools:[],planReview:{price:49,currency:'USD',turnaroundDays:5,status:'waitlist'}},'The allowlist ships empty');
 assert.deepEqual(JSON.parse(readFileSync(new URL('../dist/data/lead-settings.json',import.meta.url),'utf8')),shipped,'The built settings match the content files');
});
