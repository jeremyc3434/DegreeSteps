import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedDatabase} from '../scripts/d1-snapshot.mjs';
import {readFileSync} from 'node:fs';
import {handleGrowthMetrics,pruneGrowthMetrics} from './growth-metrics.mjs';

const libraryPlans=Object.keys(JSON.parse(readFileSync(new URL('../dist/data/plan-library-index.json',import.meta.url),'utf8')).plans);

const origin='https://degreesteps.example',plan='liberty-business-residential';let minute=0;
function fixture(t){
 const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());
 for(const [id,role]of[['owner','owner'],['moderator','moderator'],['member','member']])sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'Synthetic '+role,role,1,1);
 const DB={prepared:[],bindings:[],prepare(sql){
  DB.prepared.push(sql);const statement=sqlite.prepare(sql);
  return{bind(...values){
   DB.bindings.push(values);
   return{first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};
  }};
 }};
 return{sqlite,DB,env:{DB,PORTAL_USER:{id:'owner'},COMMUNITY_ADMIN_EMAIL:'configured@example.com',GROWTH_PLAN_IDS:async()=>new Set(libraryPlans)},now:Date.UTC(2026,10,19)+60000*(++minute)};
}
const request=(path='/api/growth/events',{method='POST',body={event:'landing_view',context:'home'},headers={}}={})=>new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Growth-Request':'1',...headers},...(['GET','HEAD'].includes(method)?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const count=f=>f.sqlite.prepare('SELECT coalesce(sum(count),0) AS n FROM growth_daily_counts').get().n;
const send=(f,body,options={})=>handleGrowthMetrics(request('/api/growth/events',{body,...options}),f.env,{now:f.now});

test('events aggregate by UTC day, action, coarse page category and known public plan only',async t=>{
 const f=fixture(t);assert.equal((await send(f,{event:'landing_view',context:'home'})).status,204);assert.equal((await send(f,{event:'landing_view',context:'home'})).status,204);
 assert.equal((await send(f,{event:'plan_previewed',context:'degree-plan',planId:plan})).status,204);
 const rows=f.sqlite.prepare('SELECT * FROM growth_daily_counts ORDER BY event').all();assert.equal(rows.length,2);assert.equal(rows[0].count,2);assert.equal(rows[1].plan_id,plan);assert.equal(rows[0].day,'2026-11-19');
 assert.deepEqual(Object.keys(rows[0]),['day','event','context','plan_id','detail','count']);assert(f.DB.prepared.every(sql=>!sql.includes('portal_')&&!sql.includes('template_requests')&&!sql.includes('college_interest')));
});

test('cross-origin requests, unsupported fields and oversized or untyped payloads cannot store visitor data',async t=>{
 const f=fixture(t);
 for(const [body,headers,status]of[
  [{event:'landing_view',context:'home',email:'student@example.com'},{},400],
  [{event:'landing_view',context:'home',url:'https://example.edu?student=private'},{},400],
  [{event:'course_saved',context:'workspace',planId:'private-student-plan'},{},400],
  [{event:'landing_view',context:'home'},{Origin:'https://outside.example'},403],
  [{event:'landing_view',context:'home'},{'X-Growth-Request':'0'},403],
  [{event:'landing_view',context:'home'},{'Sec-Fetch-Site':'cross-site'},403],
  [{event:'landing_view',context:'home'},{'Content-Type':'text/plain'},415],
  ['x'.repeat(1025),{},413],['{',{},400],
  [{event:'made_up',context:'home'},{},400],
  [{event:'landing_view',context:'private@example.com'},{},400]
 ])assert.equal((await send(f,body,{headers})).status,status);
 assert.equal(count(f),0);assert.equal(f.DB.prepared.length,0);
});

test('privacy signals and the deployment disable switch prevent writes, while unavailable measurement never records a partial event',async t=>{
 const f=fixture(t);
 for(const headers of[{DNT:'1'},{'Sec-GPC':'1'}])assert.equal((await send(f,{event:'landing_view',context:'home'},{headers})).status,204);
 assert.equal((await handleGrowthMetrics(request(),{...f.env,GROWTH_METRICS_DISABLED:'1'},{now:f.now})).status,204);assert.equal(count(f),0);
 assert.equal((await handleGrowthMetrics(request(),{},{now:f.now})).status,503);
 assert.equal(await handleGrowthMetrics(new Request(origin+'/api/portal/session'),f.env),null);
 assert.equal((await handleGrowthMetrics(request('/api/growth/events',{method:'GET'}),f.env)).status,405);
});

test('only a verified owner can read aggregate totals; roles supplied by a student or moderator do not authorize access',async t=>{
 const f=fixture(t);await send(f,{event:'account_plan_saved',context:'workspace'});
 for(const [user,status]of[[null,401],[{id:'member',role:'owner'},403],[{id:'moderator'},403],[{id:'bad;DROP TABLE'},401]]){
  const response=await handleGrowthMetrics(request('/api/admin/growth-summary',{method:'GET'}),{...f.env,PORTAL_USER:user},{now:f.now});assert.equal(response.status,status);
 }
 for(const user of[{id:'owner'},{id:'configured',email:'CONFIGURED@EXAMPLE.COM'}]){
  const response=await handleGrowthMetrics(request('/api/admin/growth-summary?days=7',{method:'GET'}),{...f.env,PORTAL_USER:user},{now:f.now}),data=await response.json();assert.equal(response.status,200);assert.equal(data.events.find(e=>e.event==='account_plan_saved').count,1);assert.equal(data.methodology.uniquePeopleMeasured,false);assert.equal(data.methodology.conversionRateMeasured,false);assert.equal(data.methodology.privateRecordsIncluded,false);assert.equal(data.period.days,7);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
 }
 for(const query of['days=0','days=91','days=1.5','email=private'])assert.equal((await handleGrowthMetrics(request('/api/admin/growth-summary?'+query,{method:'GET'}),f.env,{now:f.now})).status,400);
 assert(f.DB.prepared.every(sql=>!sql.includes('portal_')));
});

test('write limits and count ceilings bound anonymous ingestion without storing a rate-limit identity',async t=>{
 const f=fixture(t),event={event:'course_saved',context:'workspace'};
 for(let i=0;i<1205;i++)assert.equal((await send(f,event)).status,204);
 assert.equal(count(f),1200);
 f.sqlite.prepare('UPDATE growth_daily_counts SET count=1000000').run();f.now+=60000;
 assert.equal((await send(f,event)).status,204);assert.equal(count(f),1000000);
 assert(f.DB.bindings.every(values=>values.every(value=>typeof value==='number'||['2026-11-19','course_saved','workspace',''].includes(value))));
});

test('retention pruning removes only old aggregate rows and leaves current activity and account data intact',async t=>{
 const f=fixture(t);await send(f,{event:'plan_started',context:'workspace'});
 f.sqlite.prepare("INSERT INTO growth_daily_counts(day,event,context,plan_id,count) VALUES('2026-01-01','landing_view','home','',9)").run();
 assert.equal(await pruneGrowthMetrics(f.env,{now:f.now}),true);assert.equal(await pruneGrowthMetrics(f.env,{now:f.now}),false);assert.equal(count(f),1);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM community_users').get().n,3);
});

test('plan ids are checked against the public plan library index, not a fixed list, and stay optional',async t=>{
 const f=fixture(t);assert(libraryPlans.length>4);
 const later=libraryPlans.find(id=>!['wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential'].includes(id));
 assert.equal((await send(f,{event:'plan_built',context:'degree-plan',planId:later})).status,204);
 assert.equal((await send(f,{event:'plan_built',context:'workspace'})).status,204);
 for(const planId of['unpublished-private-plan','Bad Plan','x'.repeat(129),7])assert.equal((await send(f,{event:'plan_built',context:'workspace',planId})).status,400);
 assert.deepEqual(f.sqlite.prepare("SELECT plan_id AS planId,count FROM growth_daily_counts WHERE event='plan_built' ORDER BY plan_id").all().map(row=>({...row})),[{planId:'',count:1},{planId:later,count:1}]);
 // Without a readable index the event is still counted, without its plan dimension.
 const g=fixture(t);g.env.GROWTH_PLAN_IDS=async()=>{throw Error('index unavailable');};
 assert.equal((await send(g,{event:'plan_previewed',context:'degree-plan',planId:later})).status,204);assert.deepEqual({...g.sqlite.prepare('SELECT plan_id,detail,count FROM growth_daily_counts').get()},{plan_id:'',detail:'',count:1});
});

test('revenue-feature events: school_inquiry carries only action submitted; plan_review_request carries no detail',async t=>{
 const f=fixture(t);
 assert.equal((await send(f,{event:'school_inquiry',context:'workspace',action:'submitted'})).status,204);
 assert.equal((await send(f,{event:'plan_review_request',context:'article'})).status,204);
 for(const body of[{event:'school_inquiry',context:'workspace'},{event:'school_inquiry',context:'workspace',action:'open'},{event:'school_inquiry',context:'workspace',action:'submitted',email:'jane@example.com'},{event:'plan_review_request',context:'article',action:'submitted'},{event:'plan_review_request',context:'article',provider:'Sophia'}])assert.equal((await send(f,body)).status,400,JSON.stringify(body));
 const rows=f.sqlite.prepare('SELECT event,detail,count FROM growth_daily_counts ORDER BY event').all().map(row=>({...row}));
 assert.deepEqual(rows,[{event:'plan_review_request',detail:'',count:1},{event:'school_inquiry',detail:'submitted',count:1}]);
});

test('funnel v2 events accept only their fixed detail: a provider allowlist for clicks and open/copy for school emails',async t=>{
 const f=fixture(t);
 for(const event of['finder_used','guided_started','guided_results','plan_built','credits_worth_used','share_link_copied'])assert.equal((await send(f,{event,context:'workspace'})).status,204,event);
 assert.equal((await send(f,{event:'transfer_page_view',context:'transfer'})).status,204);
 for(const provider of['Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other'])assert.equal((await send(f,{event:'provider_click',context:'degree-plan',provider})).status,204,provider);
 for(const action of['open','copy'])assert.equal((await send(f,{event:'school_email',context:'workspace',action})).status,204);
 for(const body of[
  {event:'provider_click',context:'workspace'},{event:'provider_click',context:'workspace',provider:'sophia'},{event:'provider_click',context:'workspace',provider:'https://sophia.org/?ref=me'},
  {event:'school_email',context:'workspace'},{event:'school_email',context:'workspace',action:'send'},{event:'school_email',context:'workspace',action:'open',provider:'Sophia'},
  {event:'finder_used',context:'workspace',provider:'Sophia'},{event:'guided_started',context:'workspace',action:'open'},{event:'share_link_copied',context:'workspace',url:'https://degreesteps.com/degree-plans/?q=private'}
 ])assert.equal((await send(f,body)).status,400,JSON.stringify(body));
 const providers=f.sqlite.prepare("SELECT detail FROM growth_daily_counts WHERE event='provider_click' ORDER BY detail").all().map(row=>row.detail);assert.equal(providers.length,8);
 const summary=await (await handleGrowthMetrics(request('/api/admin/growth-summary?days=28',{method:'GET'}),f.env,{now:f.now})).json();
 assert.equal(summary.events.length,17);assert.equal(summary.events.find(row=>row.event==='provider_click').count,8);assert.equal(summary.events.find(row=>row.event==='school_email').count,2);
 assert(summary.rows.some(row=>row.event==='school_email'&&row.detail==='copy'));assert.deepEqual(summary.dimensions.schoolEmailActions,['open','copy']);assert.equal(summary.dimensions.providers.length,8);
 // The database itself refuses details outside the fixed lists, even if a caller bypasses validation.
 assert.throws(()=>f.sqlite.prepare("INSERT INTO growth_daily_counts(day,event,context,plan_id,detail,count) VALUES('2026-11-19','school_inquiry','workspace','','jane@example.com',1)").run(),/CHECK/);
 assert.throws(()=>f.sqlite.prepare("INSERT INTO growth_daily_counts(day,event,context,plan_id,detail,count) VALUES('2026-11-19','provider_click','home','','student@example.com',1)").run(),/CHECK/);
 assert.throws(()=>f.sqlite.prepare("INSERT INTO growth_daily_counts(day,event,context,plan_id,detail,count) VALUES('2026-11-19','landing_view','home','Private Plan','',1)").run(),/CHECK/);
});
