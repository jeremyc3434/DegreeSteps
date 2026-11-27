/* Anonymous course-library journeys against the actual built catalog.
 * The loopback server serves local assets only; it implements no account APIs. */
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const Library=require('./dist/course-library-engine.js');

const ROOT=__dirname,DIST=path.join(ROOT,'dist'),KEY='degreepath-guide-v3';
const PROVIDER='Christian Leaders Institute',COURSE_ID='christianleadersinstitute-plan-the101';
const OUTPUT=path.join(ROOT,'outputs/issue56/browser');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

async function startStaticServer(){
 const server=http.createServer(async(request,response)=>{
  const send=(status,body,type='application/json')=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(request.method))return send(405,JSON.stringify({error:'Read-only browser fixture.'}));
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/api/auth/status')return send(200,JSON.stringify({configured:false,user:null,providers:{email:false,google:false}}));
  if(url.pathname.startsWith('/api/'))return send(503,JSON.stringify({error:'No backend is connected to this browser test.'}));
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(400,'Invalid URL','text/plain');}
  const file=path.resolve(DIST,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(DIST+path.sep))return send(404,'Not found','text/plain');
  try{return send(200,await fs.readFile(file),MIME[path.extname(file)]||'application/octet-stream');}catch{return send(404,'Not found','text/plain');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server,origin:'http://127.0.0.1:'+server.address().port};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function ready(page){
 await page.locator('#courses-app').waitFor();
 await page.locator('#courses-results[aria-busy="false"]').waitFor();
}
async function browseCLI(page){
 if(await page.locator('#courses-tab-all').getAttribute('aria-selected')!=='true')await page.locator('#courses-tab-all').click();
 const filters=page.locator('#courses-filter-menu');
 if(!await filters.evaluate(element=>element.open))await filters.locator(':scope > summary').click();
 await page.locator('#course-provider').selectOption({label:PROVIDER});
 await page.locator('#course-search').fill('THE');
 const course=page.locator('[data-course-id="'+COURSE_ID+'"]');await course.waitFor();return course;
}
async function assertSourceFacts(course){
 const credits=course.locator('.course-row-credits');
 assert.equal(await credits.locator('span').first().evaluate(element=>element.firstChild.textContent.trim()),'3','THE 101 has three original source credits, not a receiving-school award.');
 assert.equal((await credits.locator('small').innerText()).trim(),'semester');
 assert.match(await course.locator('.course-row-kind').innerText(),/Course.*Admission required/);
}
async function assertAdmissionDetails(page){
 const fact=page.locator('#course-details-content dt').filter({hasText:/^College credit$/}).locator('..').locator('dd');
 assert.match(await fact.innerText(),/admission/i);assert.match(await fact.innerText(),/academic transcript/i);
 const credits=page.locator('#course-details-content dt').filter({hasText:/^Credits$/}).locator('..').locator('dd');
 assert.match(await credits.innerText(),/^3 semester credits$/);
}
async function closeDetails(page){await page.locator('#course-details-dialog [data-course-dialog-close]').click();}
function noReceivingApproval(state){
 assert(!state.selectedPathwayId,'Browsing a source must not choose a receiving degree.');
 for(const record of state.learning){assert.deepEqual(record.evaluations,[],'Source facts must not create a receiving-school evaluation.');assert.notEqual(record.confirmed,true);}
}

(async()=>{
 const catalog=JSON.parse(await fs.readFile(path.join(DIST,'data/course-catalog.json'),'utf8'));
 const source=catalog.courses.find(course=>course.id===COURSE_ID);assert(source,'Build must retain the existing THE 101 catalog identity.');
 assert.equal(source.credits,3);assert.equal(source.creditSystem,'semester');assert.equal(source.academicCreditRouteRequired,true);
 assert.equal(source.code.replace(/\s/g,''),'THE101');
 await fs.mkdir(OUTPUT,{recursive:true});
 const {server,origin}=await startStaticServer();let browser,count=0;const errors=[],privateWrites=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  async function journey(device,viewport,name,seed,run){
   const context=await browser.newContext({viewport});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
   await context.addInitScript(({key,state})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:seed});
   const page=await context.newPage();page.setDefaultTimeout(15000);
   page.on('pageerror',error=>errors.push({device,name,message:error.message}));
   page.on('request',request=>{if(!['GET','HEAD'].includes(request.method())&&/\/api\/(?:portal|account|auth|community|leads|owner|evaluations|templates|plans)(?:\/|$)/.test(request.url()))privateWrites.push(request.url());});
   try{
    await page.goto(origin+'/courses.html'+(seed.learning.length?'?tab=mine':''),{waitUntil:'networkidle'});await ready(page);await run(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The course journey must fit its viewport.');
    await page.screenshot({path:path.join(OUTPUT,'shared-transfer-'+name+'-'+device+'.png'),fullPage:true});
    count++;console.log('PASS '+device+' '+name);
   }catch(error){await page.screenshot({path:path.join(OUTPUT,'shared-transfer-'+name+'-'+device+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]){
   await journey(device,viewport,'source-save',Library.initialize(null),async page=>{
    let course=await browseCLI(page);
    await page.locator('#course-search').fill('BUS');
    assert.match(await page.locator('[data-course-id="christianleadersinstitute-plan-bus310"] .course-row-credits').innerText(),/Unknown/,'Unreviewed business source quantities stay unknown.');
    await page.locator('#course-search').fill('THE');course=page.locator('[data-course-id="'+COURSE_ID+'"]');await assertSourceFacts(course);
    await course.locator('[data-course-details]').click();await assertAdmissionDetails(page);await page.screenshot({path:path.join(OUTPUT,'shared-transfer-admission-'+device+'.png'),fullPage:true});await closeDetails(page);
    await course.locator('[data-course-save="'+COURSE_ID+'"]').click();
    await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key))?.learning.some(record=>record.catalogCourseId===id),{key:KEY,id:COURSE_ID});
    const state=await stored(page),record=state.learning.find(item=>item.catalogCourseId===COURSE_ID);
    assert.equal(state.learning.length,1);assert.equal(record.code,source.code);assert.equal(record.catalogCourseId,COURSE_ID);assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.equal(record.sourceUrl,source.url);assert.equal(record.status,'saved');assert.equal(record.completedOn,'');noReceivingApproval(state);
    await page.locator('#courses-tab-mine').click();const row=page.locator('[data-record-id="'+record.id+'"]');await row.waitFor();
    assert.equal(await row.locator('[data-course-status]').inputValue(),'saved');
    assert.equal(await row.locator('.course-row-credits span').first().evaluate(element=>element.firstChild.textContent.trim()),'3');
    await page.reload({waitUntil:'networkidle'});await ready(page);
    const reloaded=await stored(page);assert.equal(reloaded.learning.length,1);assert.deepEqual(reloaded.learning[0],record);noReceivingApproval(reloaded);
   });

   const legacy={id:'legacy-cli-the101',catalogCourseId:COURSE_ID,provider:PROVIDER,code:'THE 101',title:'Christian Basics: Introduction to Christian Doctrine',credits:null,creditSystem:null,status:'earned',grade:'B+',completedOn:'2024-05-22',evaluations:[],sourceUrl:'https://www.christianleadersinstitute.org/',sourceCheckedAt:'2026-11-24',creditBasis:'not-yet-known',codeBasis:'provider-listing'};
   const seed=Library.initialize(null);seed.learning=[legacy];const original=JSON.stringify(legacy);
   await journey(device,viewport,'legacy-preservation',seed,async page=>{
    const unchanged=async()=>{const state=await stored(page);assert.equal(state.learning.length,1);assert.equal(JSON.stringify(state.learning[0]),original,'Loading current source facts must not migrate an earned personal record.');noReceivingApproval(state);};
    await page.locator('[data-record-id="'+legacy.id+'"]').waitFor();await unchanged();
    const course=await browseCLI(page);await assertSourceFacts(course);await course.locator('[data-course-details]').click();await assertAdmissionDetails(page);await closeDetails(page);await unchanged();
    await course.locator('[data-course-save="'+COURSE_ID+'"]').click();await page.locator('#course-details-dialog[open]').waitFor();await unchanged();await closeDetails(page);
    await page.reload({waitUntil:'networkidle'});await ready(page);await unchanged();
    const row=page.locator('[data-record-id="'+legacy.id+'"]');await row.waitFor();assert.match(await row.locator('.course-row-credits').innerText(),/Unknown/);assert.equal(await row.locator('[data-course-status]').inputValue(),'earned');
   });
  }
  assert.deepEqual(errors,[]);assert.deepEqual(privateWrites,[]);
  console.log(JSON.stringify({sharedTransferJourneys:count,viewports:2,pageErrors:0,privateWrites:0,scope:'Built CLI source facts, admission disclosure, private saved-course identity and legacy-record preservation; no server authentication or receiving-school approval.'}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
