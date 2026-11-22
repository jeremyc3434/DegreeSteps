'use strict';
/** Owner lists of school contact requests and Plan review requests on the management page. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Leads=require('./dist/admin-leads.js');
const html=fs.readFileSync('dist/admin.html','utf8');
const data={items:[{created_at:'2026-11-22T12:00:00.000Z',school:'Western Governors University',plan_title:'Business',first_name:'<b>Jo</b>',email:'jo@example.com',phone:'',location:'Ohio',start_timing:'Later',prior_credit:'Yes'}],retentionDays:365,columns:[{key:'created_at',label:'Submitted (UTC)'},{key:'first_name',label:'First name'}]};

test('the panel sits next to Growth, starts hidden and offers an owner CSV download',()=>{
 assert.match(html,/<section id="admin-growth"[\s\S]*?<\/section><section id="admin-leads" class="tw-card admin-growth admin-leads" aria-labelledby="admin-leads-heading" hidden>/);
 assert.match(html,/Nothing is sent automatically: download the CSV and forward each request by hand\./);
 assert.match(html,/<script src="admin-leads\.js" defer><\/script>/);
 assert.match(fs.readFileSync('dist/admin.js','utf8'),/window\.DegreeAdminGrowth\?\.load\(\);window\.DegreeAdminLeads\?\.load\(\);/,'Loaded only for owners, with the Growth panel');
 const out=Leads.html(Leads.LISTS[0],data);
 assert.match(out,/<a class="tw-button tw-secondary" href="\/api\/admin\/school-inquiries\?format=csv" download>Download CSV<\/a>/);
 assert.match(out,/&lt;b&gt;Jo&lt;\/b&gt;/);assert.doesNotMatch(out,/<b>Jo/);assert.match(out,/2026-11-22 12:00/);assert.match(out,/1 request in the last 365 days\./);
 assert.match(Leads.html(Leads.LISTS[1],{items:[],retentionDays:365}),/No Plan review requests yet\./);
});

test('lists stay hidden when their feature is off (404) or the viewer is not an owner',async()=>{
 const nodes={};const node=id=>nodes[id]||(nodes[id]={id,hidden:true,innerHTML:''});
 const saved={document:globalThis.document,fetch:globalThis.fetch};
 globalThis.document={getElementById:node};
 try{
  globalThis.fetch=async()=>new Response('{}',{status:404});assert.equal(await Leads.load(),false);assert.equal(node('admin-leads').hidden,true);assert.equal(node('admin-leads-inquiries').hidden,true);
  globalThis.fetch=async url=>url.includes('plan-review')?Response.json({items:[],retentionDays:365}):new Response('{}',{status:403});
  assert.equal(await Leads.load(),true);assert.equal(node('admin-leads').hidden,false);assert.equal(node('admin-leads-inquiries').hidden,true);assert.equal(node('admin-leads-reviews').hidden,false);
 }finally{globalThis.document=saved.document;globalThis.fetch=saved.fetch;}
});
