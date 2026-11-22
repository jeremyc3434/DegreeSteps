'use strict';
/** dist/leads.js renders nothing unless the server reports a feature on, and offers the school contact button only for allowlisted schools. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('dist/leads.js','utf8');
function fresh(reply){
 delete require.cache[require.resolve('./dist/leads.js')];
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return reply();};
 return{Leads:require('./dist/leads.js'),calls};
}
const status={enabled:true,schoolInquiries:{enabled:true,schools:['Western Governors University'],consentVersion:'school-inquiry-v1'},planReview:{enabled:true,price:49,currency:'USD',turnaroundDays:5,status:'waitlist',consentVersion:'plan-review-v1'},disclosure:'/why-its-free/'};
const wgu={planId:'wgu-business-management',school:'Western Governors University',title:'B.S. Business Management'};
test.afterEach(()=>{delete globalThis.fetch;});

test('with the features off (status 404) nothing renders and only one status request is made',async()=>{
 const {Leads,calls}=fresh(()=>new Response(JSON.stringify({enabled:false}),{status:404}));
 assert.equal(Leads.actionsHTML(wgu),'','Nothing before the status arrives');
 assert.equal(await Leads.load(),null);assert.equal(await Leads.load(),null);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/leads/status');assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(Leads.actionsHTML(wgu),'');
});

test('a failed or malformed status renders nothing',async()=>{
 for(const reply of[()=>{throw Error('offline');},()=>new Response('not json'),()=>Response.json({enabled:true,schoolInquiries:{enabled:false},planReview:{enabled:false}})]){
  const {Leads}=fresh(reply);assert.equal(await Leads.load(),null);assert.equal(Leads.actionsHTML(wgu),'');
 }
});

test('the contact button appears only for an allowlisted school, next to a modest Plan review link',async()=>{
 const {Leads}=fresh(()=>Response.json(status));await Leads.load();
 const html=Leads.actionsHTML(wgu);
 assert.match(html,/<button type="button" class="lead-button" data-lead-action="school-inquiry" data-plan-id="wgu-business-management" data-school="Western Governors University" data-title="B.S. Business Management">Have Western Governors University contact me<\/button>/);
 assert.match(html,/Want a person to check this plan\? <a href="\/plan-review\/\?plan=wgu-business-management">Plan review<\/a>/);
 const other=Leads.actionsHTML({planId:'liberty-business-residential',school:'Liberty University',title:'Business'});
 assert.doesNotMatch(other,/data-lead-action/);assert.match(other,/Plan review/);
 assert.doesNotMatch(Leads.actionsHTML({...wgu,planId:'Bad Id'}),/data-lead-action/,'A malformed plan id gets no button');
 assert.match(Leads.actionsHTML({...wgu,title:'<img src=x onerror=alert(1)>'}),/data-title="&lt;img src=x onerror=alert\(1\)&gt;"/,'Titles are escaped');
});

test('only Plan review on: no contact button for any school',async()=>{
 const {Leads}=fresh(()=>Response.json({...status,schoolInquiries:{enabled:false}}));await Leads.load();
 const html=Leads.actionsHTML(wgu);assert.doesNotMatch(html,/data-lead-action/);assert.match(html,/Plan review/);
});

test('the consent wording is the approved text and the script never touches saved plans',()=>{
 const Leads=require('./dist/leads.js');
 assert.equal(Leads.inquiryConsent('Western Governors University'),'I agree that DegreeSteps may share these details with Western Governors University so its admissions team can contact me about this program. This is optional, and it doesn’t change your plan.');
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
 assert.match(source,/name="consent" value="yes">/);assert.doesNotMatch(source,/name="consent"[^>]*checked/,'The consent box starts unticked');
 assert.match(source,/name="website" tabindex="-1" autocomplete="off"/,'A honeypot field is present');
});

test('worksheet and planner ask leads.js only for extra actions next to a plan already shown',()=>{
 const sheet=fs.readFileSync('dist/sheet.js','utf8'),portal=fs.readFileSync('dist/portal.js','utf8');
 assert.equal((sheet.match(/DegreeLeads/g)||[]).length,1);assert.equal((portal.match(/DegreeLeads/g)||[]).length,1);
 assert.match(sheet,/window\.DegreeLeads\?\.actionsHTML\(\{planId:pathway\.id,school:pathway\.school,title:pathway\.title\}\)/);
 for(const page of['dist/plan.html','dist/portal.html'])assert.match(fs.readFileSync(page,'utf8'),/<script src="\/leads\.js" defer><\/script>/,page);
 assert.doesNotMatch(fs.readFileSync('dist/plan.html','utf8'),/leads\.css/,'Styles load only when a feature is on');
});

test('with the flags off at build time the disclosure and privacy pages and the sitemap are unchanged',()=>{
 const disclosure=fs.readFileSync('dist/why-its-free/index.html','utf8'),privacy=fs.readFileSync('dist/privacy/index.html','utf8'),sitemap=fs.readFileSync('dist/sitemap.xml','utf8');
 assert.doesNotMatch(disclosure,/school-contact-requests|Paid plan review|contact requests/);assert.doesNotMatch(privacy,/Contact requests you choose to send/);assert.doesNotMatch(sitemap,/plan-review/);
 const build=fs.readFileSync('scripts/build-public-site.mjs','utf8');
 assert.match(build,/const schoolInquiriesBuild=process\.env\.SCHOOL_INQUIRIES_ENABLED==='1',planReviewBuild=process\.env\.PLAN_REVIEW_ENABLED==='1';/);
 assert.match(build,/\(schoolInquiriesBuild\?'<section id="school-contact-requests">/);assert.match(build,/\(planReviewBuild\?'<section id="plan-review">/);assert.match(build,/if\(!planReviewBuild\)pages\.pop\(\);/);
});
