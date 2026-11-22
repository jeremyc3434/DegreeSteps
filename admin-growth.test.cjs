'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Growth=require('./dist/admin-growth.js');
const html=fs.readFileSync('dist/admin.html','utf8'),source=fs.readFileSync('dist/admin-growth.js','utf8');
const row=(day,event,count,detail='')=>({day,event,context:'home',planId:'',detail,count});
const report={period:{start:'2026-10-26',end:'2026-11-22',days:28},rows:[
 row('2026-11-22','landing_view',100),row('2026-11-20','landing_view',60),row('2026-11-01','landing_view',240),
 row('2026-11-22','plan_previewed',40),row('2026-11-02','plan_previewed',60),
 row('2026-11-21','plan_built',10),row('2026-11-03','plan_built',5),
 row('2026-11-21','account_plan_saved',4),
 row('2026-11-22','finder_used',7),row('2026-11-22','guided_started',6),row('2026-11-22','guided_results',5),row('2026-11-10','credits_worth_used',3),row('2026-11-16','transfer_page_view',9),
 row('2026-11-22','provider_click',3,'Sophia'),row('2026-11-01','provider_click',2,'Sophia'),row('2026-11-22','provider_click',1,'other'),
 row('2026-11-22','school_email',2,'open'),row('2026-11-05','school_email',1,'copy'),
 row('2026-10-25','landing_view',999)
]};

test('the panel totals the last 7 and 28 UTC days from one report, ignoring rows outside the window',()=>{
 const [week,month]=Growth.summarize(report);
 assert.equal(week.start,'2026-11-16');assert.equal(month.start,'2026-10-26');
 assert.equal(week.event('landing_view'),160);assert.equal(month.event('landing_view'),400);
 assert.equal(week.event('transfer_page_view'),9);assert.equal(week.event('credits_worth_used'),0);assert.equal(month.event('credits_worth_used'),3);
 assert.equal(week.detail('provider_click','Sophia'),3);assert.equal(month.detail('provider_click','Sophia'),5);assert.equal(month.detail('school_email','copy'),1);
 assert.throws(()=>Growth.summarize({rows:[]}),/could not be read/);
});

test('the funnel shows plain counts with step-to-step percentages and never divides by zero',()=>{
 assert.equal(Growth.percent(10,40),'25%');assert.equal(Growth.percent(3,0),'—');
 const out=Growth.html(report),text=out.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 assert.match(text,/Landing \(public page views\) 160 400/);
 assert.match(text,/Plan previewed 40 25% 100 25%/);
 assert.match(text,/Plan built \(worksheet opened from a plan\) 10 25% 15 15%/);
 assert.match(text,/Plan saved to account 4 40% 4 27%/);
 assert.match(text,/Plan finder used 7 7/);assert.match(text,/Transfer course pages viewed 9 9/);
 assert.match(text,/Sophia 3 5/);assert.match(text,/Other providers 1 1/);assert.match(text,/All providers 4 6/);assert.match(text,/Christian Leaders Institute 0 0/);
 assert.match(text,/Opened in an email app 2 2/);assert.match(text,/Copied 0 1/);
 assert.match(text,/not unique people/);
});

test('the panel is accessible tables, owner-only, and uses no chart library or third-party request',async()=>{
 const out=Growth.html(report);
 assert.equal((out.match(/<caption>/g)||[]).length,5);assert(out.includes('<th scope="col"'));assert(out.includes('<th scope="row">'));assert(!/<canvas|<svg|chart\.js|d3/i.test(out));
 assert.match(html,/<section id="admin-growth"[^>]*\bhidden\b/);assert.match(html,/<script src="admin-growth\.js" defer><\/script>/);
 assert(!/https?:\/\//.test(source.replace(/^\/\*[\s\S]*?\*\//,'')),'No external requests');
 // Owner access is decided by the server: 401/403 keeps the panel hidden, other failures explain themselves.
 for(const [status,hidden] of [[403,true],[401,true],[503,false],[200,false]]){
  const nodes={'admin-growth':{hidden:true},'admin-growth-body':{innerHTML:''},'admin-growth-status':{textContent:''}},requests=[];
  const sandbox={document:{getElementById:id=>nodes[id]},fetch:async(url,options)=>{requests.push([url,options]);return{ok:status===200,status,json:async()=>report};}};
  sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
  await sandbox.DegreeAdminGrowth.load();
  assert.equal(nodes['admin-growth'].hidden,hidden,String(status));assert.deepEqual(requests.map(([url])=>url),['/api/admin/growth-summary?days=28']);assert.equal(requests[0][1].credentials,'same-origin');
  if(status===200)assert.match(nodes['admin-growth-body'].innerHTML,/Funnel/);if(status===503)assert.match(nodes['admin-growth-status'].textContent,/temporarily unavailable/);
 }
});
