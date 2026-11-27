/* Synthetic student-context journeys against the actual built site.
 * A read-only loopback server supplies local assets; there are no real students,
 * accounts, benefit awards, institution messages or receiving-credit decisions.
 * Run in CI with pinned Playwright 1.62.1 and CHROMIUM_PATH set to system Chrome. */
'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const Library=require('./dist/course-library-engine.js');
const Sheet=require('./dist/sheet-state.js');
const Journey=require('./dist/journey-engine.js');
const Programs=require('./dist/program-catalog.js');

const ROOT=__dirname,DIST=path.join(ROOT,'dist'),KEY='degreepath-guide-v3';
const OUTPUT=path.join(ROOT,'outputs/student-scenarios/browser');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.csv':'text/csv'};
const registry=require('./dist/data/curriculum-registry.json');
const catalog=Programs.attachRegistry(Programs.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const model=require('./dist/data/curricula/wgu.json').models.find(item=>item.title==='Business Management – B.S.');
assert(model,'The explicitly chosen WGU business test fixture must exist.');
const route=catalog.pathways.find(item=>item.modelId===model.id);
assert(route,'The test fixture must use the registered WGU business target.');
const publicContent=require('./content/public-content.json');
const guides=['earn-college-credit-in-high-school','military-credit-jst-ccaf','transfer-credit-after-enrolling','do-old-college-credits-still-count'].map(slug=>{const article=publicContent.articles.find(item=>item.slug===slug);assert(article,'The scenario resource must exist: '+slug);assert(['guide','article'].includes(article.type));assert(article.cta?.href,'The resource must offer a concrete next action.');return article;});

async function startStaticServer(){
 const server=http.createServer(async(request,response)=>{
  const send=(status,body,type='application/json')=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(request.method))return send(405,JSON.stringify({error:'Read-only browser fixture.'}));
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/api/auth/status')return send(200,JSON.stringify({configured:false,user:null,providers:{email:false,google:false}}));
  if(url.pathname.startsWith('/api/'))return send(503,JSON.stringify({error:'No backend is connected to this synthetic browser test.'}));
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(400,'Invalid URL','text/plain');}
  const file=path.resolve(DIST,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(DIST+path.sep))return send(404,'Not found','text/plain');
  try{return send(200,await fs.readFile(file),MIME[path.extname(file)]||'application/octet-stream');}catch{return send(404,'Not found','text/plain');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server,origin:'http://127.0.0.1:'+server.address().port};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const copy=value=>JSON.parse(JSON.stringify(value));
const startingPoint='portal.html?view=preferences&from=quiz&purpose=career-growth&subject=business&level=bachelor&format=online&priority=balanced';
const noOverflow=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The actual scenario must fit its viewport.');
async function navigate(page,url){
 const response=await page.goto(url,{waitUntil:'networkidle'});
 assert(response&&response.status()===200,'The requested next page must return an actual 200 response: '+url);
 assert.doesNotMatch(await page.locator('body').innerText(),/^Not found$/,'The next page must contain the actual site.');
 return response;
}
async function clickLocal(page,link,origin){
 const href=await link.getAttribute('href');assert(href,'The next action needs a real link.');
 const target=new URL(href,page.url());assert.equal(target.origin,origin,'Student next actions stay on the local built site.');
 const [response]=await Promise.all([page.waitForResponse(response=>response.url()===target.href&&response.request().isNavigationRequest()),link.click()]);
 await page.waitForLoadState('networkidle');assert.equal(response.status(),200,'The next action must load an actual built page.');assert.equal(page.url(),target.href);await noOverflow(page);
}
async function openPrior(page,origin){
 await navigate(page,origin+'/'+startingPoint);
 await page.locator('#portal-profile-form[data-profile-step="prior"]').waitFor();
 await page.locator('#portal-profile-form select[name="learnerStage"]').waitFor();
}
async function completeProfile(page){
 await page.locator('#portal-profile-form[data-profile-step="prior"] button[type="submit"]').click();
 await page.locator('#portal-profile-form[data-profile-step="format"]').waitFor();
 await page.locator('#portal-profile-form[data-profile-step="format"] button[type="submit"]').click();
 await page.locator('#portal-profile-form[data-profile-step="priority"]').waitFor();
 await page.locator('#portal-profile-form[data-profile-step="priority"] button[type="submit"]').click();
 await page.locator('#portal-profile-form').waitFor({state:'detached'});
}
function noReceivingAward(state){
 for(const record of state.learning){assert.deepEqual(record.evaluations,[],'Context and checklist edits must not create receiving-school evaluations.');assert.notEqual(record.confirmed,true);}
}
function noTarget(state){
 assert.equal(state.selectedPathwayId,'','Current enrollment context must not auto-select a researched destination.');
 assert.equal(state.profile.pathwayId||'','');assert.equal(state.profile.school||'','');assert.equal(state.profile.degree||'','');
}
function targetIdentity(state){return {selectedPathwayId:state.selectedPathwayId,school:state.profile.school,degree:state.profile.degree,pathwayId:state.profile.pathwayId,targetIdentity:state.targetIdentity};}
function quotedCosts(state){
 const plan=Journey.buildDraft(copy(state),catalog,[model]).plan;assert(plan,'The explicitly selected real business fixture must produce a plan.');
 assert(Number.isFinite(plan.costs.modeledSubtotal)&&plan.costs.modeledSubtotal>0,'The fixture has actual modeled provider charges.');
 return {modeledSubtotal:plan.costs.modeledSubtotal,universityPricing:plan.costs.universityPricing,fees:plan.costs.fees};
}
function selectedBusiness(){
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 state.profile={...state.profile,goal:'career-growth',degreeLevel:'bachelor',field:'business',modality:'online',classroomImportance:'open',hasPrior:'none'};
 state.journey={...state.journey,completed:true,intakeCompleted:true,profileCompleted:true};
 return state;
}
async function openDetails(locator){await locator.waitFor({state:'attached'});if(await locator.getAttribute('open')===null)await locator.locator(':scope > summary').click();}
async function checklistTask(page,id){
 await openDetails(page.locator('#sheet-task-panel'));
 const home=page.locator('#sheet-home .student-checklist');await home.locator('.dc-next').waitFor();
 await openDetails(home.locator('[data-dc-open="checklist"]'));
 const task=home.locator('[data-dc-task="'+id+'"]');await task.waitFor({state:'attached'});
 const group=await task.getAttribute('data-dc-group');assert(group,'The real checklist task must have a group.');
 await openDetails(home.locator('[data-dc-open="group:'+group+'"]'));
 return task;
}

(async()=>{
 await fs.mkdir(OUTPUT,{recursive:true});
 const {server,origin}=await startStaticServer();let browser,count=0;
 const pageErrors=[],privateWrites=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  async function journey(device,viewport,name,seed,run){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
   await context.addInitScript(({key,state})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:seed});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('pageerror',error=>pageErrors.push({device,name,message:error.message}));
   page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))privateWrites.push({device,name,method:request.method(),url:request.url()});});
   try{await run(page);await noOverflow(page);await page.screenshot({path:path.join(OUTPUT,name+'-'+device+'.png'),fullPage:true});count++;console.log('PASS '+device+' '+name);}
   catch(error){await page.screenshot({path:path.join(OUTPUT,name+'-'+device+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
   await journey(device,viewport,'mypath-school-discovery',Library.initialize(null),async page=>{
    await navigate(page,origin+'/school.html');const entry=page.locator('[data-mypath-research]');await entry.waitFor();
    assert.match(await entry.innerText(),/complete MyPath transfer-course template is not available yet/i);
    await clickLocal(page,entry.locator('a[href="/guides/transfer-credit-after-enrolling/"]'),origin);
    assert.match(await page.locator('h1').innerText(),/Already in college/);const state=await stored(page);noTarget(state);noReceivingAward(state);assert.deepEqual(state.learning,[]);
   });
   await journey(device,viewport,'enrolled-current-context',Library.initialize(null),async page=>{
    await openPrior(page,origin);
    await page.locator('select[name="learnerStage"]').selectOption('enrolled');
    await page.locator('#portal-learner-enrolled').waitFor({state:'visible'});
    await page.locator('input[name="currentSchool"]').fill('University of Massachusetts Global');
    await page.locator('input[name="currentProgram"]').fill('Business Administration MyPath — enrolled 2024');
    await page.locator('select[name="planningIntent"]').selectOption('finish-current');
    await page.locator('select[name="prior"]').selectOption('some');
    const guidance=page.locator('#portal-learner-guidance');assert.match(await guidance.innerText(),/current|audit/i);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#portal-profile-form[data-profile-step="prior"]').waitFor();
    assert.equal(await page.locator('select[name="learnerStage"]').inputValue(),'enrolled','Uncommitted context survives a reload.');
    assert.equal(await page.locator('input[name="currentProgram"]').inputValue(),'Business Administration MyPath — enrolled 2024');
    assert.equal(await page.locator('select[name="planningIntent"]').inputValue(),'finish-current');
    await completeProfile(page);
    let state=await stored(page);noTarget(state);assert.equal(state.profile.learnerStage,'enrolled');assert.equal(state.profile.currentSchool,'University of Massachusetts Global');assert.equal(state.profile.currentProgram,'Business Administration MyPath — enrolled 2024');assert.equal(state.profile.planningIntent,'finish-current');assert.deepEqual(state.learning,[]);noReceivingAward(state);
    const workspace=page.locator('[data-current-degree-workspace]');await workspace.waitFor();assert.match(await workspace.innerText(),/not a verified public degree template/i);
    assert.equal(await page.locator('[data-degree-preview]').count(),0,'Finishing a current degree must not substitute another school’s template.');
    const next=workspace.locator('a.portal-primary'),href=new URL(await next.getAttribute('href'),origin);assert.equal(href.pathname,'/degree-audit.html');assert.equal(href.searchParams.get('school'),'University of Massachusetts Global');assert.equal(href.searchParams.get('degree'),'Business Administration MyPath — enrolled 2024');
    await clickLocal(page,next,origin);await page.locator('#audit-import-form').waitFor();
    assert.equal(await page.locator('#audit-import-form input[name="school"]').inputValue(),'University of Massachusetts Global');assert.equal(await page.locator('#audit-import-form input[name="title"]').inputValue(),'Business Administration MyPath — enrolled 2024');
    const accepted=await page.locator('#audit-file').getAttribute('accept');assert.match(accepted,/\.csv/,'Requirements workspace supports its stated spreadsheet format.');assert.doesNotMatch(accepted,/\.pdf/i,'The requirements workspace must not promise PDF parsing.');
    await page.reload({waitUntil:'networkidle'});await page.locator('#audit-import-form').waitFor();state=await stored(page);noTarget(state);assert.equal(state.profile.currentSchool,'University of Massachusetts Global');assert.equal(state.profile.planningIntent,'finish-current');assert.deepEqual(state.learning,[]);
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href="degree-audit.html"]'),origin);
    await page.locator('h1:visible').waitFor();state=await stored(page);noTarget(state);assert.equal(state.profile.currentProgram,'Business Administration MyPath — enrolled 2024');assert.deepEqual(state.learning,[]);
   });

   const old=Sheet.validateLearning({id:'synthetic-old-1999',provider:'Synthetic Regional College',code:'ENG 101',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',completedOn:'1999-05-14',grade:'B',evaluations:[],originalTranscriptTerm:'Spring 1999'});
   const returning=Library.initialize(null);returning.learning=[old];const original=JSON.stringify(old);
   await journey(device,viewport,'returning-original-1999',returning,async page=>{
    const unchanged=async()=>{const state=await stored(page);assert.equal(state.learning.length,1);assert.equal(JSON.stringify(state.learning[0]),original,'An old earned original record remains byte-identical throughout the journey.');noReceivingAward(state);noTarget(state);};
    await openPrior(page,origin);await page.locator('select[name="learnerStage"]').selectOption('returning');await page.locator('select[name="prior"]').selectOption('some');
    assert.match(await page.locator('#portal-learner-guidance').innerText(),/older college courses may still count/i);await unchanged();
    await completeProfile(page);await unchanged();assert.equal((await stored(page)).profile.learnerStage,'returning');
    await page.reload({waitUntil:'networkidle'});await unchanged();
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href="import-courses.html?from=portal"]'),origin);
    await page.locator('#import-files').waitFor({state:'attached'});await unchanged();
    await page.reload({waitUntil:'networkidle'});await page.locator('#import-files').waitFor({state:'attached'});await unchanged();
   });

   await journey(device,viewport,'high-school-college-issuer',Library.initialize(null),async page=>{
    await openPrior(page,origin);await page.locator('select[name="learnerStage"]').selectOption('high-school');await page.locator('select[name="prior"]').selectOption('some');
    const guidance=page.locator('#portal-learner-guidance');assert.match(await guidance.innerText(),/college that issued/i);assert.match(await guidance.innerText(),/high.school report card/i);
    await completeProfile(page);let state=await stored(page);assert.equal(state.profile.learnerStage,'high-school');assert.deepEqual(state.learning,[]);noTarget(state);
    await page.reload({waitUntil:'networkidle'});assert.equal((await stored(page)).profile.learnerStage,'high-school');
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href="courses.html?tab=browse"]'),origin);
    await page.locator('#courses-app').waitFor();await page.locator('#courses-results[aria-busy="false"]').waitFor();
    state=await stored(page);assert.deepEqual(state.learning,[],'High-school context does not invent dual-enrollment, AP or receiving credit.');noTarget(state);noReceivingAward(state);
    await page.reload({waitUntil:'networkidle'});assert.equal((await stored(page)).profile.learnerStage,'high-school');assert.deepEqual((await stored(page)).learning,[]);
   });

   for(const military of ['active','veteran','dependent']){
    const initial=selectedBusiness(),identity=targetIdentity(initial),costs=quotedCosts(initial),scenarios=copy(initial.scenarios);
    await journey(device,viewport,'military-'+military+'-benefits-task',initial,async page=>{
     await navigate(page,origin+'/portal.html?view=preferences');
     await page.locator('#portal-profile-form[data-profile-step="prior"]').waitFor();
     await page.locator('select[name="learnerStage"]').selectOption('returning');await page.locator('select[name="prior"]').selectOption('none');await page.locator('select[name="military"]').selectOption(military);
     assert.equal(await page.locator('#portal-profile-military-records').isVisible(),military!=='dependent','Family members do not inherit a sponsor’s service record.');
     await completeProfile(page);let state=await stored(page);assert.equal(state.profile.militaryStatus,military);assert.deepEqual(targetIdentity(state),identity,'Editing service context preserves the explicitly selected degree.');assert.deepEqual(state.learning,[]);assert.deepEqual(state.scenarios,scenarios);assert.deepEqual(quotedCosts(state),costs,'Service or family status alone cannot apply a fictional discount.');
     await navigate(page,origin+'/plan.html');await page.locator('tr.course-plan-row').first().waitFor();
     let task=await checklistTask(page,'military-benefits');assert.match(await task.innerText(),/No discount or benefit is assumed/i);
     await clickLocal(page,task.locator('a[href="portal.html?view=school&action=military-benefits"]'),origin);
     const request=page.locator('#portal-school-request');await request.waitFor();assert.match(await request.inputValue(),/benefit|eligib|military/i);assert.match(await request.inputValue(),/not assumed eligibility or deducted benefits/i);
     await clickLocal(page,page.locator('a.portal-primary[href="plan.html"]'),origin);
     await page.locator('tr.course-plan-row').first().waitFor();task=await checklistTask(page,'military-benefits');
     await task.locator('[data-dc-check="military-benefits"]').check();
     await page.waitForFunction(key=>Object.values(JSON.parse(localStorage.getItem(key)).checklist.plans).some(plan=>plan.items['military-benefits']?.status==='done'),KEY);
     await page.reload({waitUntil:'networkidle'});await page.locator('tr.course-plan-row').first().waitFor();
     state=await stored(page);assert.equal(state.profile.militaryStatus,military);assert.deepEqual(targetIdentity(state),identity);assert.deepEqual(state.learning,[]);assert.deepEqual(state.scenarios,scenarios);assert.deepEqual(quotedCosts(state),costs,'Completing a benefits task does not create funding or change provider charges.');noReceivingAward(state);
     assert(Object.values(state.checklist.plans).some(plan=>plan.items['military-benefits']?.status==='done'),'The real checklist status survives reload.');
    });
   }
   for(const guide of guides){
    await journey(device,viewport,'guide-'+guide.slug,Library.initialize(null),async page=>{
     const url='/'+(guide.type==='guide'?'guides':'blog')+'/'+guide.slug+'/';await navigate(page,origin+url);
     assert.equal(await page.locator('h1:visible').count(),1);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://degreesteps.com'+url);
     const prose=guide.sections.flatMap(section=>section.paragraphs||[]).join(' ');assert(prose.trim().split(/\s+/).length>=350,'The guide must contain useful guidance beyond a thin interface description.');
     const text=await page.locator('main').innerText();assert((await page.locator('main .source-list a[href^="https://"]').count())>=4,'The guide retains multiple official source citations.');
     if(guide.slug==='earn-college-credit-in-high-school')assert.match(text,/college.*transcript|transcript.*college/i);
     else if(guide.slug==='military-credit-jst-ccaf'){assert.match(text,/JST/);assert.match(text,/CCAF/);assert.match(text,/eligib/i);}
     else if(guide.slug==='transfer-credit-after-enrolling'){assert.match(text,/2024/);assert.match(text,/B−/);assert.match(text,/does not automatically verify an uploaded PDF/);assert.match(text,/not.*blanket permission/i);}
     else{assert.match(text,/25 years/);assert.match(text,/most recent application/);assert.match(text,/Fresh Start/);}
     await page.screenshot({path:path.join(OUTPUT,'guide-'+guide.slug+'-reading-'+device+'.png'),fullPage:true});await noOverflow(page);
     await clickLocal(page,page.locator('main a.site-button[href="'+guide.cta.href+'"]').first(),origin);
     const state=await stored(page);assert.deepEqual(state.learning,[],'Reading a guide or opening its next action cannot create earned credit.');noTarget(state);noReceivingAward(state);
    });
   }
  }
  assert.equal(count,22);assert.deepEqual(pageErrors,[]);assert.deepEqual(privateWrites,[]);
  console.log(JSON.stringify({syntheticStudentJourneys:12,guideReadabilityJourneys:8,schoolDiscoveryJourneys:2,totalJourneys:count,viewports:2,pageErrors:0,privateWrites:0,scope:'Synthetic current-enrollment context, old original-record preservation, high-school issuing-college guidance, and active/veteran/family benefits tasks; actual built guides and working local CTAs; no real-student approvals, account authentication, funding awards or institution outreach.'}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
