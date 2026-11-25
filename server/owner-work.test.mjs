import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedDatabase} from '../scripts/d1-snapshot.mjs';
import {handleOwnerWork,handleStudentSupport,ownerWorkSummary} from './owner-work.mjs';
const origin='https://degreesteps.example',owner={id:'sb-owner',email:'owner@example.invalid'},alice={id:'sb-alice',email:'alice@example.invalid'},bob={id:'sb-bob',email:'bob@example.invalid'},now=Date.parse('2026-11-25T12:00:00Z');
function fixture(t){
 const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());
 const db={prepare(sql){const s=sqlite.prepare(sql);return {bind(...v){return {first:async()=>s.get(...v)||null,all:async()=>({results:s.all(...v)}),run:async()=>{if(db.failAudit&&sql.startsWith('INSERT INTO owner_work_events'))throw Error('Synthetic audit outage');return {meta:{changes:Number(s.run(...v).changes)}};}};}};},async batch(statements){if(db.beforeBatch){const action=db.beforeBatch;db.beforeBatch=null;action();}sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {sqlite,db};
}
async function call(f,path,{method='GET',body,user=owner,ownerAuthorized=true,headers={},env={},rawBody,audit}={}){
 const request=new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Support-Request':'1',...headers},...(method!=='GET'?{body:rawBody??JSON.stringify(body??{})}:{})});
 const ctx={db:f.db,user,url:new URL(request.url),ownerAuthorized,now,audit,json:(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}}),fail(status,message,code){throw Object.assign(Error(message),{status,code});},readJson:async(r,max)=>{const text=await r.text();if(new TextEncoder().encode(text).length>max)throw Object.assign(Error('Too large'),{status:413});return JSON.parse(text);}};
 try{const response=await (path.startsWith('/api/owner/')?handleOwnerWork:handleStudentSupport)(request,env,ctx);return {status:response?.status,data:response?await response.json():null,response};}catch(e){if(e.status)return {status:e.status,data:{error:e.message,code:e.code}};throw e;}
}
async function create(f,resource,body){const result=await call(f,'/api/owner/'+resource,{method:'POST',body});assert.equal(result.status,201,JSON.stringify(result.data));return result.data.item;}
function inquiry(f,{id='request-1',age=0}={}){f.sqlite.prepare('INSERT INTO school_inquiries(id,created_at,plan_id,plan_title,school,first_name,email,phone,location,start_timing,prior_credit,consent_version,consent_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,now-age,'liberty-business','Business','Liberty University','Synthetic','synthetic@example.invalid','','Ohio','this-term','yes','v1','I consent to sharing my contact details with this school.');}

test('owner proof is mandatory and task CRUD retains revision history with stale-save conflicts',async t=>{
 const f=fixture(t);assert.equal((await call(f,'/api/owner/tasks',{ownerAuthorized:false,user:alice})).status,403);
 const task=await create(f,'tasks',{title:'Review UMPI sources',priority:'high',dueOn:'2026-12-01'});assert.equal(task.status,'todo');assert.equal(task.revision,1);
 const next=await call(f,'/api/owner/tasks/'+task.id,{method:'PATCH',body:{revision:1,status:'doing'}});assert.equal(next.status,200);assert.equal(next.data.item.revision,2);
 assert.equal((await call(f,'/api/owner/tasks/'+task.id,{method:'PATCH',body:{revision:1,status:'done'}})).status,409);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM owner_work_events WHERE record_id=?').get(task.id).n,2);
 assert.equal((await call(f,'/api/owner/tasks/'+task.id,{method:'DELETE'})).status,405);
});
test('a failed audit rolls back a change and its optimistic revision',async t=>{
 const f=fixture(t),task=await create(f,'tasks',{title:'Keep this task'});f.db.failAudit=true;
 await assert.rejects(call(f,'/api/owner/tasks/'+task.id,{method:'PATCH',body:{revision:1,title:'Lost audit'}}),/Synthetic audit/);
 const stored=f.sqlite.prepare('SELECT * FROM owner_tasks WHERE id=?').get(task.id);assert.equal(stored.title,'Keep this task');assert.equal(stored.revision,1);
});
test('lists use bounded stable pagination, typed filters and indexed prefix search',async t=>{
 const f=fixture(t);for(let i=0;i<5;i++)await create(f,'tasks',{title:'Research '+i});await create(f,'tasks',{title:'Other work'});
 const a=await call(f,'/api/owner/tasks?limit=2&q=Research'),b=await call(f,'/api/owner/tasks?limit=2&q=Research&cursor='+a.data.nextCursor);
 assert.equal(a.data.items.length,2);assert.equal(b.data.items.length,2);assert(!a.data.items.some(x=>b.data.items.some(y=>x.id===y.id)));assert.equal(a.data.summary.total,6);
 for(const query of ['limit=51','limit=-1','cursor=bad%21','status=invalid','q=x','privatePlan=data'])assert.equal((await call(f,'/api/owner/tasks?'+query)).status,400,query);
 const query=f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM owner_tasks WHERE search_key>=? AND search_key<? ORDER BY updated_at DESC,id DESC LIMIT 25').all('re','re\uffff');assert(query.some(r=>r.detail.includes('owner_tasks_search')));
});
test('partner CRM is separate from institution verification and cannot grant access',async t=>{
 const f=fixture(t),p=await create(f,'partners',{name:'Synthetic College',kind:'college',website:'https://college.example',contactName:'Admissions',contactEmail:'admissions@college.example'});
 const result=await call(f,'/api/owner/partners/'+p.id,{method:'PATCH',body:{revision:1,stage:'active',notes:'Manual partnership follow-up'}});assert.equal(result.status,200);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM college_organizations').get().n,0);
 for(const patch of [{verified:true},{website:'javascript:alert(1)'},{contactEmail:'not-an-email'}])assert.equal((await call(f,'/api/owner/partners/'+p.id,{method:'PATCH',body:{revision:2,...patch}})).status,400);
});
test('finance separates manual confirmed revenue, expenses, invoices, forecasts and currencies',async t=>{
 const f=fixture(t);for(const row of [{kind:'revenue',status:'confirmed',amountMinor:10000},{kind:'revenue',status:'pending',amountMinor:99999},{kind:'expense',status:'confirmed',amountMinor:2500},{kind:'invoice',status:'pending',amountMinor:80000},{kind:'invoice',status:'confirmed',amountMinor:70000},{kind:'revenue',status:'void',amountMinor:50000}])await create(f,'finance',{...row,currency:'USD',occurredOn:'2026-11-25'});
 await create(f,'finance',{kind:'revenue',status:'confirmed',amountMinor:300,currency:'CAD',occurredOn:'2026-11-25'});
 const result=await call(f,'/api/owner/finance');assert.deepEqual(result.data.summary.currencies.USD,{confirmedRevenueMinor:10000,confirmedExpenseMinor:2500,pendingInvoiceMinor:80000,confirmedInvoiceMinor:70000});assert.equal(result.data.summary.currencies.CAD.confirmedRevenueMinor,300);
 assert.equal(result.data.summary.source,'manual');assert(!JSON.stringify(result.data.summary).includes('MRR'));assert(result.data.items.every(r=>r.source==='manual'));
 for(const patch of [{amountMinor:1.2},{amountMinor:-1},{currency:'usd'},{source:'stripe'},{periodStart:'2026-11-25',periodEnd:''}])assert.equal((await call(f,'/api/owner/finance',{method:'POST',body:{kind:'revenue',status:'confirmed',amountMinor:100,currency:'USD',occurredOn:'2026-11-25',...patch}})).status,400);
});
test('lead import requires an existing consented source and never copies contacts or private plans',async t=>{
 const f=fixture(t);inquiry(f);inquiry(f,{id:'expired',age:366*86400000});const candidates=await call(f,'/api/owner/leads');assert(candidates.data.options.sources.some(s=>s.sourceId==='request-1'));assert(!candidates.data.options.sources.some(s=>s.sourceId==='expired'));
 assert.equal((await call(f,'/api/owner/leads',{method:'POST',body:{sourceKind:'school-inquiry',sourceId:'expired'}})).status,409);
 assert.equal((await call(f,'/api/owner/leads',{method:'POST',body:{sourceKind:'school-inquiry',sourceId:'request-1',privatePlan:{transcript:'private'}}})).status,400);
 const lead=await create(f,'leads',{sourceKind:'school-inquiry',sourceId:'request-1'});assert.equal(lead.request.email,'synthetic@example.invalid');assert.equal((await call(f,'/api/owner/leads?q=Liberty')).data.items.length,1,'Lead search uses public school context rather than an opaque technical ID');
 const stored=f.sqlite.prepare('SELECT * FROM owner_lead_workflows').get();assert(!Object.keys(stored).some(k=>/email|phone|transcript|plan_json/.test(k)));assert(!Object.values(stored).includes('synthetic@example.invalid'));
 assert.equal((await call(f,'/api/owner/leads',{method:'POST',body:{sourceKind:'school-inquiry',sourceId:'request-1'}})).status,409);
 f.sqlite.prepare('DELETE FROM school_inquiries WHERE id=?').run('request-1');const after=await call(f,'/api/owner/leads/'+lead.id);assert.equal(after.data.item.sourceAvailable,false);assert.equal(after.data.item.request,null);
});
test('withdrawn college consent removes live contact data from an existing workflow',async t=>{
 const f=fixture(t);f.sqlite.prepare('INSERT INTO college_organizations(id,name,website,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-1','College','https://college.example','verified',owner.id,now,now);
 f.sqlite.prepare('INSERT INTO college_interest_requests(id,user_id,organization_id,contact_name,contact_email,program_interest,study_format,start_timing,consent_version,consent_text,consented_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('interest-1',alice.id,'org-1','Alice','alice@example.invalid','Business','online','soon','v1','I consent to this college seeing this request.',now,now,now);
 const lead=await create(f,'leads',{sourceKind:'college-interest',sourceId:'interest-1'});assert.equal(lead.request.email,'alice@example.invalid');f.sqlite.prepare('UPDATE college_interest_requests SET withdrawn_at=? WHERE id=?').run(now,'interest-1');
 assert.equal((await call(f,'/api/owner/leads/'+lead.id)).data.item.request,null);
});
test('students own their support tickets and never receive internal replies or another account history',async t=>{
 const f=fixture(t);const created=await call(f,'/api/support/tickets',{method:'POST',ownerAuthorized:false,user:alice,body:{subject:'Course import help',category:'course',body:'A synthetic question.'}});assert.equal(created.status,201);const id=created.data.item.id;
 assert.equal((await call(f,'/api/support/tickets/'+id,{ownerAuthorized:false,user:bob})).status,404);assert.equal((await call(f,'/api/support/tickets',{ownerAuthorized:false,user:bob})).data.items.length,0);
 const note=await call(f,'/api/owner/support/'+id+'/messages',{method:'POST',body:{revision:1,body:'Internal investigation',visibility:'internal'}});assert.equal(note.status,201);
 const reply=await call(f,'/api/owner/support/'+id+'/messages',{method:'POST',body:{revision:2,body:'Try the course import template.',visibility:'student'}});assert.equal(reply.status,201);assert.equal(reply.data.emailSent,false);assert.equal(reply.data.delivery,'stored-in-portal');
 assert.equal((await call(f,'/api/owner/support/'+id+'/messages',{method:'POST',body:{revision:1,body:'Stale reply',visibility:'student'}})).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM support_messages WHERE ticket_id=?').get(id).n,3);
 const own=await call(f,'/api/support/tickets/'+id,{ownerAuthorized:false,user:alice});assert.deepEqual(own.data.messages.map(m=>m.body),['A synthetic question.','Try the course import template.']);assert.equal(own.data.item.revision,3);assert(own.data.messages.every(message=>!Object.hasOwn(message,'authorId')),'Student history does not expose the private owner account identifier');
 assert.equal((await call(f,'/api/support/tickets/'+id+'/messages',{method:'POST',ownerAuthorized:false,user:alice,body:{revision:3,body:'Thanks',visibility:'internal'}})).status,400);
 const response=await call(f,'/api/support/tickets/'+id+'/messages',{method:'POST',ownerAuthorized:false,user:alice,body:{revision:3,body:'Thanks'}});assert.equal(response.status,201);assert.equal(response.data.item.status,'open');
});
test('diagnostics are opt-in, allowlisted and cannot carry URL queries or raw records',async t=>{
 const f=fixture(t),base={subject:'Bug',category:'bug',body:'A synthetic question.'};
 for(const patch of [{diagnostics:{page:'/plan.html'}},{diagnosticsConsent:true,diagnostics:{rawTranscript:'private'}},{diagnosticsConsent:true,diagnostics:{page:'/plan.html?token=secret'}},{diagnosticsConsent:true,diagnostics:{userId:'someone'}}])assert.equal((await call(f,'/api/support/tickets',{method:'POST',ownerAuthorized:false,user:alice,body:{...base,...patch}})).status,400);
 const result=await call(f,'/api/support/tickets',{method:'POST',ownerAuthorized:false,user:alice,body:{...base,diagnosticsConsent:true,diagnostics:{page:'/plan.html',issueCode:'page-error',browserFamily:'Safari',viewport:'mobile'}}});assert.equal(result.status,201);assert.equal(result.data.item.diagnostics.page,'/plan.html');assert.equal(result.data.item.diagnosticsConsent,true);
});
test('anonymous sign-in help is receipt-only, salted, origin-protected and rate-limited without raw IP retention',async t=>{
 const f=fixture(t),env={LEADS_HASH_SALT:'synthetic-private-salt-at-least-sixteen'},headers={'CF-Connecting-IP':'192.0.2.5'},body={category:'account',email:'anon@example.invalid',contactConsent:true,body:'I cannot sign in.',website:''};
 const result=await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers,body,audit:()=>{throw Error('Anonymous request must not call an authenticated audit closure');}});assert.equal(result.status,201);assert.deepEqual(Object.keys(result.data).sort(),['ok','receiptId']);
 const stored=f.sqlite.prepare('SELECT * FROM support_tickets WHERE id=?').get(result.data.receiptId);assert.equal(stored.user_id,null);assert.equal(stored.contact_email,'anon@example.invalid');assert.match(stored.created_by,/^anonymous-[a-f0-9-]{36}$/);assert.match(f.sqlite.prepare('SELECT user_id FROM support_rate_limits').get().user_id,/^anon-[a-f0-9]{64}$/);
 assert(!JSON.stringify(f.sqlite.prepare('SELECT * FROM support_rate_limits').all()).includes('192.0.2.5'));assert(!JSON.stringify(stored).includes(env.LEADS_HASH_SALT));
 assert.equal((await call(f,'/api/support/tickets/'+result.data.receiptId,{ownerAuthorized:false,user:null})).status,401);
 for(let i=0;i<4;i++)assert.equal((await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers,body})).status,201);
 assert.equal((await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers,body})).status,429);
 for(const [extra,status] of [[{env:{}},503],[{headers:{}},503],[{headers:{...headers,Origin:'https://other.example'}},403],[{headers:{...headers,'X-Support-Request':'0'}},403],[{body:{...body,contactConsent:false},headers:{'CF-Connecting-IP':'192.0.2.6'}},400]])assert.equal((await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers,body,...extra})).status,status);
 const before=f.sqlite.prepare('SELECT count(*) AS n FROM support_tickets').get().n;
 assert.equal((await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers,body:{...body,website:'spam'}})).status,201);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM support_tickets').get().n,before);
 assert.equal((await call(f,'/api/support/login-help',{method:'POST',ownerAuthorized:false,user:null,env,headers:{'CF-Connecting-IP':'192.0.2.7'},body:{...body,body:'x'.repeat(5000)}})).status,413);
});
