/* Synthetic student-context journeys against the actual built site.
 * A read-only loopback server supplies local assets; there are no real students,
 * accounts, benefit awards, institution messages or receiving-credit decisions.
 * Run in CI with pinned Playwright 1.62.1 and CHROMIUM_PATH set to system Chrome.
 * --fixtures-only checks the real record/target/cost fixtures without a browser. */
'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const Library=require('./dist/course-library-engine.js');
const Sheet=require('./dist/sheet-state.js');
const Journey=require('./dist/journey-engine.js');
const Programs=require('./dist/program-catalog.js');
const Audit=require('./dist/audit-curriculum.js');
const Baselines=require('./dist/requirements-baselines.js');
const baselineData=Baselines.validateCatalog(require('./dist/data/requirements-baselines.json'));

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
 const response=await page.goto(url,{waitUntil:'domcontentloaded'});
 assert(response&&response.status()===200,'The requested next page must return an actual 200 response: '+url);
 await page.locator('main').waitFor({state:'visible'});
 assert.doesNotMatch(await page.locator('body').innerText(),/^Not found$/,'The next page must contain the actual site.');
 return response;
}
async function clickLocal(page,link,origin){
 const href=await link.getAttribute('href');assert(href,'The next action needs a real link.');
 const target=new URL(href,page.url());assert.equal(target.origin,origin,'Student next actions stay on the local built site.');
 const [response]=await Promise.all([page.waitForResponse(response=>response.url()===target.href&&response.request().isNavigationRequest()),link.click()]);
 // Background fetches are not a readiness signal for the destination. Require
 // its real navigation and visible content; callers then check the actual form,
 // catalog, requirements or checklist control used by the student.
 await page.waitForURL(target.href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,'The next action must load an actual built page.');assert.equal(page.url(),target.href);
 await page.locator('main').waitFor({state:'visible'});await page.locator('h1:visible').first().waitFor();await noOverflow(page);
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
 // The real worksheet prepares provider defaults before saving checklist state.
 // Capture the fixture baseline after that same public preparation step.
 return Journey.buildDraft(state,catalog,[model]).state;
}
function normalizeFixture(state){
 return Journey.buildDraft(Journey.initialize(copy(state),null,catalog),catalog,[model]).state;
}
function assertStableNormalization(state){
 const next=normalizeFixture(state),again=normalizeFixture(next);
 assert.deepEqual(next.scenarios,state.scenarios,'Prepared fixture scenarios survive initialization and plan preparation.');
 assert.deepEqual(again.scenarios,next.scenarios,'Repeated plan preparation is idempotent.');
 for(const value of [next,again]){
  assert.deepEqual(targetIdentity(value),targetIdentity(state));
  assert.equal(JSON.stringify(value.learning),JSON.stringify(state.learning),'Plan preparation must retain the exact original records.');
  noReceivingAward(value);
  if(state.selectedPathwayId)assert.deepEqual(quotedCosts(value),quotedCosts(state),'Repeated preparation must not change the fixture costs.');
  else noTarget(value);
 }
}
function preflightFixtures(){
 // Construct every private seed before launching Chrome, using the same public
 // APIs as the product. A bad fixture must not wait for a later browser journey.
 const blank=normalizeFixture(Library.initialize(null));noTarget(blank);noReceivingAward(blank);assertStableNormalization(blank);
 const returning=Sheet.updateLearning(Library.initialize(null),{id:'synthetic-old-1999',provider:'Synthetic Regional College',code:'ENG 101',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',completedOn:'1999-05-14',grade:'B',evaluations:[],originalTranscriptTerm:'Spring 1999'});
 assert.equal(returning.learning.length,1);assert.equal(returning.learning[0].completedOn,'1999-05-14');assert.equal(returning.learning[0].credits,3);assert.equal(returning.learning[0].grade,'B');noTarget(returning);noReceivingAward(returning);
 const original=JSON.stringify(returning.learning[0]);
 assertStableNormalization(returning);
 const highSchool=copy(blank);highSchool.profile={...highSchool.profile,learnerStage:'high-school',hasPrior:'some'};assertStableNormalization(highSchool);
 const military=['active','veteran','dependent'].map(status=>{
  const initial=selectedBusiness(),identity=targetIdentity(initial),costs=quotedCosts(initial),scenarios=copy(initial.scenarios);
  assertStableNormalization(initial);
  const context=copy(initial);context.profile={...context.profile,learnerStage:'returning',militaryStatus:status};
  const contextOnly=normalizeFixture(context);assertStableNormalization(contextOnly);
  assert.deepEqual(quotedCosts(contextOnly),costs,'A fixture’s service context alone cannot create a discount.');assert.deepEqual(contextOnly.scenarios,scenarios);assert.deepEqual(targetIdentity(contextOnly),identity);assert.deepEqual(contextOnly.learning,[]);noReceivingAward(contextOnly);
  return {military:status,initial,identity,costs,scenarios};
 });
 const baselineInitial=Sheet.updateLearning(selectedBusiness(),copy(returning.learning[0]));
 baselineInitial.profile={...baselineInitial.profile,learnerStage:'enrolled',currentSchool:'University of Massachusetts Global',currentProgram:'Business Administration MyPath — enrolled 2024',planningIntent:'finish-current'};
 assertStableNormalization(baselineInitial);
 const baselineFixtures=['marketing','general-business'].map(emphasisId=>{
  const initial=copy(baselineInitial),identity=targetIdentity(initial),learning=JSON.stringify(initial.learning),scenarios=copy(initial.scenarios);
  const prepared=Baselines.prepareDraft(initial,baselineData,{catalogId:'2024-2025',emphasisId},Audit);
  assert.deepEqual(targetIdentity(prepared.state),identity);assert.equal(JSON.stringify(prepared.state.learning),learning);assert.deepEqual(prepared.state.profile,initial.profile);assert.deepEqual(prepared.state.scenarios,scenarios);noReceivingAward(prepared.state);
  assert.equal(prepared.rows.reduce((sum,row)=>sum+Number(row.credits),0),120);assert.equal(prepared.metadata.reviewedByStudent,false);assert.equal(prepared.metadata.baselineMode,'requirements-only');
  const again=Baselines.prepareDraft(prepared.state,baselineData,{catalogId:'2024-2025',emphasisId},Audit);assert.equal(again.reused,true);assert.deepEqual(again.state,prepared.state);
  let builtEntryId=null;
  if(emphasisId==='marketing'){
   assert.equal(prepared.rows.length,60);
   const entry=Audit.create(prepared.rows,{...prepared.metadata,reviewedByStudent:true});
   assert.equal(entry.model.totalCredits,120);assert(entry.model.requirements.every(row=>row.options.every(option=>option.provider==='University')),'A requirements baseline must not inherit outside-course awards.');
   entry.model.auditProvenance.requirementsBaseline={id:prepared.metadata.baselineId,revision:Number(prepared.metadata.baselineRevision),hash:prepared.metadata.baselineHash,emphasisId,programId:prepared.metadata.programId,catalog:prepared.metadata.catalog,creditUnitLabel:prepared.metadata.creditUnitLabel,scope:'requirements-only'};
   entry.model.learningFormat='competency-based';entry.model.coverageLabel='Catalog requirements adapted by the student · proposed plan';builtEntryId=entry.route.id;
   const committed=Audit.commit(prepared.state,entry,{catalog});
   assert.equal(committed.selectedPathwayId,builtEntryId);assert.equal(JSON.stringify(committed.learning),learning);noReceivingAward(committed);
   const previous=committed.whatIf.snapshots.find(snapshot=>snapshot.pathwayId===identity.selectedPathwayId);assert(previous,'Explicitly building the new workspace must save the previous WGU target.');assert.equal(previous.targetIdentity.route.school,identity.school);assert.equal(previous.targetIdentity.route.title,identity.degree);assert.deepEqual(previous.settings,scenarios[model.id]);
  }else{
   const pool=prepared.rows.filter(row=>row.allocationRequired===true);assert.equal(pool.length,1);assert.equal(pool[0].credits,19);assert.equal(pool[0].code,'');assert.match(pool[0].title,/specific courses not selected/);assert.equal(prepared.baseline.requiresAllocation,true);
  }
  return {emphasisId,initial,identity,learning,scenarios,prepared};
 });
 return {blank,returning:{state:returning,original},military,baselines:baselineFixtures};
}
function baselinePreserved(state,fixture){
 assert.deepEqual(targetIdentity(state),fixture.identity);assert.deepEqual(state.profile,fixture.initial.profile);assert.deepEqual(state.sheet,fixture.initial.sheet);assert.deepEqual(state.scenarios,fixture.scenarios);
 assert.equal(JSON.stringify(state.learning),fixture.learning,'Loading catalog requirements must preserve the exact original 1999 record.');assert.equal(state.learning[0].completedOn,'1999-05-14');assert.deepEqual(state.customCurricula,fixture.initial.customCurricula);noReceivingAward(state);
}
function builtBaselinePreserved(state,fixture,builtId){
 assert.equal(typeof builtId,'string');assert(builtId);assert.notEqual(builtId,fixture.identity.selectedPathwayId);assert.equal(state.selectedPathwayId,builtId);assert.equal(JSON.stringify(state.learning),fixture.learning);assert.equal(state.learning[0].completedOn,'1999-05-14');noReceivingAward(state);
 const entry=state.customCurricula.find(value=>value.route.id===builtId);assert(entry,'Explicit Build creates the private requirements workspace.');assert.equal(entry.route.routeType,'student-audit');assert.equal(entry.route.school,fixture.prepared.metadata.school);assert.equal(entry.route.title,fixture.prepared.metadata.title);
 assert.equal(entry.model.auditProvenance.requirementsBaseline.scope,'requirements-only');assert.equal(entry.model.auditProvenance.requirementsBaseline.emphasisId,'marketing');assert.equal(entry.model.auditProvenance.requirementsBaseline.creditUnitLabel,'catalog-equivalent credits');assert.equal(entry.model.totalCredits,120);assert(entry.model.requirements.every(row=>row.options.every(option=>option.provider==='University')),'The private plan must not acquire inherited outside-course awards.');
 const previous=state.whatIf.snapshots.find(snapshot=>snapshot.pathwayId===fixture.identity.selectedPathwayId);assert(previous,'The previous WGU target remains available for comparison.');assert.equal(previous.targetIdentity.route.school,fixture.identity.school);assert.equal(previous.targetIdentity.route.title,fixture.identity.degree);assert.deepEqual(previous.settings,fixture.scenarios[model.id]);assert.deepEqual(state.scenarios[model.id],fixture.scenarios[model.id]);
}
async function loadBaseline(page,origin,fixture){
 const query=new URLSearchParams({baseline:'umass-global-mypath-bba',school:fixture.initial.profile.currentSchool,degree:fixture.initial.profile.currentProgram});
 await navigate(page,origin+'/degree-audit.html?'+query);await openDetails(page.locator('#audit-baseline'));
 assert.equal(await page.locator('#audit-baseline-catalog').inputValue(),'','Enrollment in 2024 must not select a catalog.');assert.equal(await page.locator('#audit-baseline-emphasis').inputValue(),'','The current-program note must not select an emphasis.');
 await page.locator('#audit-baseline-load').click();await page.locator('#audit-message:visible').waitFor();assert.match(await page.locator('#audit-message').innerText(),/Choose the catalog and BBA emphasis explicitly/);baselinePreserved(await stored(page),fixture);
 await page.locator('#audit-baseline-catalog').selectOption('2024-2025');await page.locator('#audit-baseline-emphasis').selectOption(fixture.emphasisId);
 const target=new URL(fixture.prepared.href,origin+'/').href;
 const [response]=await Promise.all([page.waitForResponse(response=>response.url()===target&&response.request().isNavigationRequest()),page.locator('#audit-baseline-load').click()]);
 assert.equal(response.status(),200);await page.waitForURL(target,{waitUntil:'domcontentloaded'});await page.locator('#audit-baseline-context:visible').waitFor();
 assert.match(await page.locator('#audit-baseline-context').innerText(),/120 catalog-equivalent credits/);assert.match(await page.locator('#audit-baseline-context').innerText(),/no approved outside-course awards/);baselinePreserved(await stored(page),fixture);
 return Audit.readDraft(await stored(page),fixture.prepared.context);
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
 const fixtures=preflightFixtures();
 console.log(JSON.stringify({fixturePreflight:'passed',originalRecordDate:fixtures.returning.state.learning[0].completedOn,militaryCostFixtures:fixtures.military.length,requirementsBaselineFixtures:fixtures.baselines.length,browserLaunched:false}));
 if(process.argv.includes('--fixtures-only'))return;
 const {chromium}=require('playwright');
 await fs.mkdir(OUTPUT,{recursive:true});
 const {server,origin}=await startStaticServer();let browser,count=0,attempted=0;
 const pageErrors=[],privateWrites=[],failures=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  async function journey(device,viewport,name,seed,run){
   attempted++;
   let context,page,succeeded=false;const pendingRequests=new Map();
   async function recordFailure(error,phase){
    succeeded=false;
    const failure={device,name,phase,url:page?.url()||null,errorName:error.name,message:String(error.message).slice(0,1600),at:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3),pendingRequests:[...pendingRequests.values()].slice(0,12)};
    failures.push(failure);console.error(JSON.stringify(failure));
    if(page)await page.screenshot({path:path.join(OUTPUT,name+'-'+device+'-failure.png'),fullPage:true}).catch(screenshotError=>{failure.screenshotError=String(screenshotError.message).slice(0,300);});
   }
   try{
    context=await browser.newContext({viewport,reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
    await context.addInitScript(({key,state})=>{
     // Use the real optional-measurement preference in these isolated fixtures.
     // This leaves academic, course, checklist and private-write checks active.
     localStorage.setItem('degreesteps-growth-choice-v1','off');
     if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(state));
    },{key:KEY,state:seed});
    page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>pageErrors.push({device,name,message:error.message}));
    page.on('request',request=>{pendingRequests.set(request,{method:request.method(),url:request.url()});if(!['GET','HEAD'].includes(request.method()))privateWrites.push({device,name,method:request.method(),url:request.url()});});
    page.on('requestfinished',request=>pendingRequests.delete(request));page.on('requestfailed',request=>pendingRequests.delete(request));
    await run(page);await noOverflow(page);await page.screenshot({path:path.join(OUTPUT,name+'-'+device+'.png'),fullPage:true});succeeded=true;
   }catch(error){await recordFailure(error,page?'journey':'setup');}
   finally{if(context)try{await context.close();}catch(error){await recordFailure(error,'cleanup');}}
   if(succeeded){count++;console.log('PASS '+device+' '+name);}else console.log('FAIL '+device+' '+name);
  }
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
   await journey(device,viewport,'mypath-school-discovery',copy(fixtures.blank),async page=>{
    await navigate(page,origin+'/school.html');const entry=page.locator('[data-mypath-research]');await entry.waitFor();
    assert.match(await entry.innerText(),/complete MyPath transfer-course template is not available yet/i);
    await clickLocal(page,entry.locator('a[href="/guides/transfer-credit-after-enrolling/"]'),origin);
    assert.match(await page.locator('h1').innerText(),/Already in college/);const state=await stored(page);noTarget(state);noReceivingAward(state);assert.deepEqual(state.learning,[]);
   });
   await journey(device,viewport,'enrolled-current-context',copy(fixtures.blank),async page=>{
    await openPrior(page,origin);
    await page.locator('select[name="learnerStage"]').selectOption('enrolled');
    await page.locator('#portal-learner-enrolled').waitFor({state:'visible'});
    await page.locator('input[name="currentSchool"]').fill('University of Massachusetts Global');
    await page.locator('input[name="currentProgram"]').fill('Business Administration MyPath — enrolled 2024');
    await page.locator('select[name="planningIntent"]').selectOption('finish-current');
    await page.locator('select[name="prior"]').selectOption('some');
    const guidance=page.locator('#portal-learner-guidance');assert.match(await guidance.innerText(),/current|audit/i);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#portal-profile-form[data-profile-step="prior"]').waitFor();
    assert.equal(await page.locator('select[name="learnerStage"]').inputValue(),'enrolled','Uncommitted context survives a reload.');
    assert.equal(await page.locator('input[name="currentProgram"]').inputValue(),'Business Administration MyPath — enrolled 2024');
    assert.equal(await page.locator('select[name="planningIntent"]').inputValue(),'finish-current');
    await completeProfile(page);
    let state=await stored(page);noTarget(state);assert.equal(state.profile.learnerStage,'enrolled');assert.equal(state.profile.currentSchool,'University of Massachusetts Global');assert.equal(state.profile.currentProgram,'Business Administration MyPath — enrolled 2024');assert.equal(state.profile.planningIntent,'finish-current');assert.deepEqual(state.learning,[]);noReceivingAward(state);
    const workspace=page.locator('[data-current-degree-workspace]');await workspace.waitFor();assert.match(await workspace.innerText(),/not a verified public degree template/i);
    await workspace.locator('a[href="degree-audit.html?baseline=umass-global-mypath-bba"]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-degree-preview]').count(),0,'Finishing a current degree must not substitute another school’s template.');
    const next=workspace.locator('a.portal-primary'),href=new URL(await next.getAttribute('href'),origin);assert.equal(href.pathname,'/degree-audit.html');assert.equal(href.searchParams.get('school'),'University of Massachusetts Global');assert.equal(href.searchParams.get('degree'),'Business Administration MyPath — enrolled 2024');
    await clickLocal(page,next,origin);await page.locator('#audit-import-form').waitFor();
    assert.equal(await page.locator('#audit-import-form input[name="school"]').inputValue(),'University of Massachusetts Global');assert.equal(await page.locator('#audit-import-form input[name="title"]').inputValue(),'Business Administration MyPath — enrolled 2024');
    const accepted=await page.locator('#audit-file').getAttribute('accept');assert.match(accepted,/\.csv/,'Requirements workspace supports its stated spreadsheet format.');assert.doesNotMatch(accepted,/\.pdf/i,'The requirements workspace must not promise PDF parsing.');
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#audit-import-form').waitFor();state=await stored(page);noTarget(state);assert.equal(state.profile.currentSchool,'University of Massachusetts Global');assert.equal(state.profile.planningIntent,'finish-current');assert.deepEqual(state.learning,[]);
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href^="degree-audit.html"]'),origin);
    await page.locator('#audit-import-form').waitFor();assert.equal(await page.locator('#audit-import-form input[name="school"]').inputValue(),'University of Massachusetts Global');assert.equal(await page.locator('#audit-import-form input[name="title"]').inputValue(),'Business Administration MyPath — enrolled 2024');state=await stored(page);noTarget(state);assert.equal(state.profile.currentProgram,'Business Administration MyPath — enrolled 2024');assert.deepEqual(state.learning,[]);
   });

   const returning=copy(fixtures.returning.state),original=fixtures.returning.original;
   await journey(device,viewport,'returning-original-1999',returning,async page=>{
    const unchanged=async()=>{const state=await stored(page);assert.equal(state.learning.length,1);assert.equal(state.learning[0].completedOn,'1999-05-14');assert.equal(JSON.stringify(state.learning[0]),original,'An old earned original record remains byte-identical throughout the journey.');noReceivingAward(state);noTarget(state);};
    await openPrior(page,origin);await page.locator('select[name="learnerStage"]').selectOption('returning');await page.locator('select[name="prior"]').selectOption('some');
    assert.match(await page.locator('#portal-learner-guidance').innerText(),/older college courses may still count/i);await unchanged();
    await completeProfile(page);await unchanged();assert.equal((await stored(page)).profile.learnerStage,'returning');
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('h1:visible').first().waitFor();await unchanged();
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href="import-courses.html?from=portal"]'),origin);
    await page.locator('#import-files').waitFor({state:'attached'});await unchanged();
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#import-files').waitFor({state:'attached'});await unchanged();
   });

   await journey(device,viewport,'high-school-college-issuer',copy(fixtures.blank),async page=>{
    await openPrior(page,origin);await page.locator('select[name="learnerStage"]').selectOption('high-school');await page.locator('select[name="prior"]').selectOption('some');
    const guidance=page.locator('#portal-learner-guidance');assert.match(await guidance.innerText(),/college that issued/i);assert.match(await guidance.innerText(),/high.school report card/i);
    await completeProfile(page);let state=await stored(page);assert.equal(state.profile.learnerStage,'high-school');assert.deepEqual(state.learning,[]);noTarget(state);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('h1:visible').first().waitFor();assert.equal((await stored(page)).profile.learnerStage,'high-school');
    await openPrior(page,origin);await clickLocal(page,page.locator('#portal-learner-guidance a[href="courses.html?tab=browse"]'),origin);
    await page.locator('#courses-app').waitFor();await page.locator('#courses-results[aria-busy="false"]').waitFor();
    state=await stored(page);assert.deepEqual(state.learning,[],'High-school context does not invent dual-enrollment, AP or receiving credit.');noTarget(state);noReceivingAward(state);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#courses-results[aria-busy="false"]').waitFor();assert.equal((await stored(page)).profile.learnerStage,'high-school');assert.deepEqual((await stored(page)).learning,[]);
   });

   for(const {military,initial,identity,costs,scenarios} of fixtures.military){
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
     await page.reload({waitUntil:'domcontentloaded'});await page.locator('tr.course-plan-row').first().waitFor();
     state=await stored(page);assert.equal(state.profile.militaryStatus,military);assert.deepEqual(targetIdentity(state),identity);assert.deepEqual(state.learning,[]);assert.deepEqual(state.scenarios,scenarios);assert.deepEqual(quotedCosts(state),costs,'Completing a benefits task does not create funding or change provider charges.');noReceivingAward(state);
     assert(Object.values(state.checklist.plans).some(plan=>plan.items['military-benefits']?.status==='done'),'The real checklist status survives reload.');
    });
   }
   for(const fixture of fixtures.baselines){
    await journey(device,viewport,'mypath-baseline-'+fixture.emphasisId,copy(fixture.initial),async page=>{
     let draft=await loadBaseline(page,origin,fixture);assert(draft,'The explicitly selected requirements draft must be saved.');
     assert.equal(draft.metadata.baselineMode,'requirements-only');assert.equal(draft.metadata.catalog,'2024-2025');assert.equal(draft.metadata.baselineEmphasisId,fixture.emphasisId);assert.equal(draft.metadata.reviewedByStudent,false);assert.equal(draft.rows.reduce((sum,row)=>sum+Number(row.credits),0),120);
     await page.locator('#audit-save').click();assert.match(await page.locator('#audit-save-status').innerText(),/Saved on this device/);
     await page.reload({waitUntil:'domcontentloaded'});await page.locator('#audit-baseline-context:visible').waitFor();baselinePreserved(await stored(page),fixture);
     draft=Audit.readDraft(await stored(page),fixture.prepared.context);assert(draft);assert.equal(draft.rows.reduce((sum,row)=>sum+Number(row.credits),0),120);
     if(fixture.emphasisId==='marketing'){
      assert.equal(await page.locator('#audit-editor-rows .audit-editor-row').count(),60);assert(draft.rows.every(row=>String(row.code).trim()),'Marketing has named requirements rather than a fabricated elective allocation.');
      const title=page.locator('#audit-import-form input[name="title"]'),canonicalTitle=await title.inputValue(),savedState=JSON.stringify(await stored(page));
      const rowValues=()=>page.locator('#audit-editor-rows .audit-editor-row').evaluateAll(rows=>rows.map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.type==='checkbox'?input.checked:input.value]))));
      const originalRows=await rowValues();await title.fill(canonicalTitle+' (accidental edit)');
      await page.locator('#audit-import-form button[type="submit"]').click();await page.locator('#audit-message:visible').waitFor();assert.match(await page.locator('#audit-message').innerText(),/degree details no longer match the selected catalog baseline/);assert.equal(await page.locator('#audit-review').isVisible(),false);
      await page.locator('#audit-baseline-restore:visible').click();await page.waitForFunction(value=>document.querySelector('#audit-import-form input[name="title"]').value===value,canonicalTitle);
      assert.equal(await page.locator('#audit-import-form input[name="programId"]').inputValue(),fixture.prepared.metadata.programId,'Restore must also recover the program identity cleared by a title edit.');
      assert.deepEqual(await rowValues(),originalRows,'Restoring catalog identity must leave every edited requirement row unchanged.');assert.equal(JSON.stringify(await stored(page)),savedState,'Restore is an unsaved metadata correction, not a private-state rewrite.');assert.match(await page.locator('#audit-save-status').innerText(),/Catalog details restored/);assert.match(await page.locator('#audit-save-status').innerText(),/Save progress/);
      await page.locator('#audit-save').click();assert.match(await page.locator('#audit-save-status').innerText(),/Saved on this device/);baselinePreserved(await stored(page),fixture);
      await page.locator('#audit-import-form button[type="submit"]').click();await page.locator('#audit-review:visible').waitFor();
      assert.equal((await page.locator('#audit-total').innerText()).trim(),'120');assert.equal(await page.locator('#audit-preview-rows tr').count(),60);assert.match(await page.locator('#audit-review-provenance').innerText(),/not a verified transfer template/);assert.equal(await page.locator('#audit-build').isDisabled(),true,'Building still requires the student’s explicit row review.');
      baselinePreserved(await stored(page),fixture);
      await page.locator('#audit-confirm').check();assert.equal(await page.locator('#audit-build').isEnabled(),true);
      const planURL=origin+'/plan.html';const [response]=await Promise.all([page.waitForResponse(response=>response.url()===planURL&&response.request().isNavigationRequest()),page.locator('#audit-build').click()]);assert.equal(response.status(),200);await page.waitForURL(planURL,{waitUntil:'domcontentloaded'});await page.locator('tr.course-plan-row').first().waitFor();
      assert.match(await page.locator('.sheet-review-status').filter({hasText:'Catalog requirements draft'}).innerText(),/Catalog requirements draft/);assert.match(await page.locator('main').innerText(),/catalog-equivalent credit/);
      const builtState=await stored(page),builtId=builtState.selectedPathwayId;builtBaselinePreserved(builtState,fixture,builtId);
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('tr.course-plan-row').first().waitFor();assert.match(await page.locator('.sheet-review-status').filter({hasText:'Catalog requirements draft'}).innerText(),/Catalog requirements draft/);builtBaselinePreserved(await stored(page),fixture,builtId);
     }else{
      const pools=draft.rows.filter(row=>row.allocationRequired===true);assert.equal(pools.length,1);assert.equal(Number(pools[0].credits),19);assert.equal(pools[0].code,'');assert.match(pools[0].title,/specific courses not selected/);
      assert.match(await page.locator('#audit-baseline-context').innerText(),/variable pool of 19 equivalent elective credits/);assert.match(await page.locator('#audit-baseline-context').innerText(),/not one course or a fixed number of courses/);
      await page.locator('#audit-import-form button[type="submit"]').click();await page.locator('#audit-message:visible').waitFor();
      const message=await page.locator('#audit-message').innerText();assert.match(message,/unresolved/);assert.match(message,/remove the elective-pool row/);assert.match(message,/actual named courses/);assert.match(message,/19 equivalent elective credits/);assert.match(message,/no course count is assumed/);
      assert.equal(await page.locator('#audit-review').isVisible(),false);assert.equal(await page.locator('#audit-build').isDisabled(),true);baselinePreserved(await stored(page),fixture);
      const savedPool=Audit.readDraft(await stored(page),fixture.prepared.context).rows.find(row=>row.allocationRequired===true);assert.equal(Number(savedPool.credits),19);assert.equal(savedPool.code,'','Blocked review must not manufacture a course to fill the variable pool.');
     }
    });
   }
   for(const guide of guides){
    await journey(device,viewport,'guide-'+guide.slug,copy(fixtures.blank),async page=>{
     const url='/'+(guide.type==='guide'?'guides':'blog')+'/'+guide.slug+'/';await navigate(page,origin+url);
     assert.equal(await page.locator('h1:visible').count(),1);assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://degreesteps.com'+url);
     const prose=guide.sections.flatMap(section=>section.paragraphs||[]).join(' ');assert(prose.trim().split(/\s+/).length>=350,'The guide must contain useful guidance beyond a thin interface description.');
     const text=await page.locator('main').innerText();assert((await page.locator('main .source-list a[href^="https://"]').count())>=4,'The guide retains multiple official source citations.');
     if(guide.slug==='earn-college-credit-in-high-school'){
      const asu=page.locator('main .article-comparison tbody tr').filter({hasText:'ASU Universal Learner'}),sophia=page.locator('main .article-comparison tbody tr').filter({hasText:'Sophia'});
      assert.equal(await asu.count(),1);assert.match(await asu.locator('td').first().innerText(),/official ASU transcript/);assert.match(await asu.locator('td').first().innerText(),/optional credit purchase/);
      assert.equal(await sophia.count(),1);assert.match(await sophia.locator('td').first().innerText(),/ACE credit recommendations/);assert.match(await sophia.locator('td').first().innerText(),/receiving colleges to evaluate/);
     }
     else if(guide.slug==='military-credit-jst-ccaf'){assert.match(text,/JST/);assert.match(text,/CCAF/);assert.match(text,/eligib/i);}
     else if(guide.slug==='transfer-credit-after-enrolling'){assert.match(text,/2024/);assert.match(text,/B−/);assert.match(text,/does not automatically verify an uploaded PDF/);assert.match(text,/not.*blanket permission/i);}
     else{assert.match(text,/25 years/);assert.match(text,/most recent application/);assert.match(text,/Fresh Start/);}
     await page.screenshot({path:path.join(OUTPUT,'guide-'+guide.slug+'-reading-'+device+'.png'),fullPage:true});await noOverflow(page);
     await clickLocal(page,page.locator('main a.site-button[href="'+guide.cta.href+'"]').first(),origin);
     const state=await stored(page);assert.deepEqual(state.learning,[],'Reading a guide or opening its next action cannot create earned credit.');noTarget(state);noReceivingAward(state);
    });
   }
  }
  console.log(JSON.stringify({syntheticStudentJourneys:12,guideReadabilityJourneys:8,schoolDiscoveryJourneys:2,requirementsBaselineJourneys:4,totalJourneys:count,attemptedJourneys:attempted,failedJourneys:failures.length,viewports:2,pageErrors:pageErrors.length,privateWrites:privateWrites.length,scope:'Synthetic current-enrollment context, old original-record preservation, high-school issuing-college guidance, active/veteran/family benefits tasks and explicitly chosen MyPath requirements drafts; actual built guides and working local CTAs; no real-student approvals, account authentication, funding awards or institution outreach.'}));
  assert.deepEqual({attempted,passed:count,failures,pageErrors,privateWrites},{attempted:26,passed:26,failures:[],pageErrors:[],privateWrites:[]},'All 26 independent journeys must pass with zero page errors or private writes.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
