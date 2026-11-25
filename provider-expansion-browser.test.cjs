/* Synthetic provider-expansion journeys. Run only against an owned preview.
 * External requests and all real API writes are intercepted; no real sign-in. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js');
const registry=require('./dist/data/curriculum-registry.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8137/').replace(/\/?$/,'/'),ORIGIN=new URL(BASE).origin;
const OUT=process.env.DEGREESTEPS_PROVIDER_ARTIFACTS||'/tmp/degreesteps-provider-expansion-qa',KEY='degreepath-guide-v3';
const results=[],pageErrors=[],assetFailures=[],optionalMissingAssets=[],blockedWrites=[],blockedAnalytics=[],externalRequests=[];let browser,active;
const read=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const model=id=>{
 const files=['tesu-accounting.json','wgu.json','wgu-pathway-kit.json'];
 for(const file of files){const packet=require('./dist/data/curricula/'+file),found=packet.models?.find(m=>m.id===id);if(found)return found;}
 throw Error('Expected generated degree model '+id);
};
function seed(target,{providers,allowConditional=true,selections={}}={}){
 const route=catalog.pathways.find(route=>route.modelId===target.id);assert(route,'Current catalog route must identify the exact model');
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 Object.assign(state.profile,{goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open',priority:'transfer',proctoringPreference:'open',hasPrior:'none'});
 state.learning=[];state.sheet.notes={[target.id]:{'qa-private-note':'PROVIDER-QA-PRIVATE-NOTE'}};
 state.scenarios={[target.id]:{providers,allowConditional,weeklyHours:12,optionSelections:selections}};
 state.journey={...state.journey,completed:true,answers:{...state.journey.answers,prior:'none',purpose:'any-degree'}};
 return state;
}
async function open(relative,width,state){
 const context=await browser.newContext({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==ORIGIN){externalRequests.push({host:url.hostname,method:request.method()});return route.abort('blockedbyclient');}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){const item={path:url.pathname,method:request.method()};if(request.method()==='POST'&&url.pathname==='/api/growth/events')blockedAnalytics.push(item);else blockedWrites.push(item);return route.fulfill({status:403,json:{error:'Synthetic QA blocks real writes and telemetry.'}});}
  if(url.pathname==='/api/auth/status')return route.fulfill({json:{configured:true,providers:['email','google'],recovery:false}});
  if(url.pathname==='/api/portal/session'||url.pathname==='/api/community/session')return route.fulfill({json:{user:null,authConfigured:true,limits:{maxPlans:10,maxStateBytes:524288}}});
  if(url.pathname==='/api/portal/plans')return route.fulfill({json:{items:[]}});
  if(url.pathname==='/api/coach/status')return route.fulfill({json:{enabled:false}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'No live backend requests during provider acceptance.'}});
  return route.continue();
 });
 if(state)await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
 const page=await context.newPage();active=page;page.setDefaultTimeout(30000);
 page.on('pageerror',error=>pageErrors.push({url:page.url(),message:error.message}));
 page.on('response',response=>{const url=new URL(response.url());if(response.status()>=400&&url.origin===ORIGIN&&!url.pathname.startsWith('/api/')){const item={path:url.pathname,status:response.status()};if(response.status()===404&&url.pathname==='/data/plan-freshness.json')optionalMissingAssets.push(item);else assetFailures.push(item);}});
 const response=await page.goto(new URL(relative,BASE).href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);return page;
}
async function fits(page,label){const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(size.document<=size.width+1&&size.body<=size.width+1,label+': no page-level horizontal overflow '+JSON.stringify(size));}
async function ready(page){await page.locator('tr.course-plan-row').first().waitFor({timeout:60000});assert.equal(await page.locator('.course-plan-unavailable,.course-plan-pending').count(),0);}
async function shot(page,name){await fs.mkdir(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled'});}
async function report(){await fs.mkdir(OUT,{recursive:true});await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({origin:ORIGIN,syntheticOnly:true,realParticipants:0,realOAuth:false,realAccountWrites:0,telemetrySent:false,results,pageErrors,assetFailures,optionalMissingAssets,blockedWrites,blockedAnalytics,externalRequests},null,2)+'\n');}
async function test(name,run){const started=Date.now();try{await run();results.push({name,status:'passed',durationMs:Date.now()-started});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:String(error.stack||error),durationMs:Date.now()-started});console.error('FAIL '+name+' '+error.message);if(active&&!active.isClosed()){await shot(active,name.replace(/[^a-z0-9]+/gi,'-')+'-failure').catch(()=>{});await fs.writeFile(path.join(OUT,name.replace(/[^a-z0-9]+/gi,'-')+'-failure.txt'),await active.locator('body').innerText().catch(()=>''));}}finally{if(active&&!active.isClosed())await active.context().close();active=null;await report();}}

(async()=>{try{
 await fs.mkdir(OUT,{recursive:true});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const upi=require('./dist/data/course-catalog.json').courses.filter(course=>course.provider==='UPI Study');assert.equal(upi.length,22,'Final build indexes all22 reviewed original courses');
 const env=upi.find(course=>[course.code,course.mappingCode,course.aceId].includes('UPIS-0025'));assert(env);assert.equal(env.credits,1);assert(env.courseVersion!=null);
 const tesu=model('curriculum-tesu-bsba-accounting'),tesuRow=tesu.requirements.find(row=>row.options.some(option=>option.provider==='UPI Study'&&option.evidence==='conditional'&&option.url));assert(tesuRow,'Reviewed TESU model has a real conditional UPI alternative');
 const tesuOption=tesuRow.options.find(option=>option.provider==='UPI Study'&&option.evidence==='conditional'&&option.url);
 const swe=model('curriculum-wgu-catalog-3a9fedcacbfcccae'),statistics=swe.requirements.find(row=>row.code==='C955'),statsOption=statistics.options.find(option=>option.provider==='Study.com'&&option.code==='SDCM-0068');assert(statsOption);assert(!statistics.options.some(option=>option.code==='SDCM-0025'));
 for(const width of[390,1440]){
  await test('UPI course discovery original quantity and save '+width,async()=>{
   const page=await open('courses.html?provider=upi-study',width);
   await page.waitForFunction(()=>document.querySelector('#courses-results-count')?.textContent.includes('22'));
   assert.equal(await page.locator('#course-provider').inputValue(),'UPI Study');await page.selectOption('#course-kind','course');
   assert.equal(await page.locator('#courses-results article.course-row').count(),22);assert.match(await page.locator('#courses-results-count').innerText(),/22 of 22/);
   const card=page.locator('[data-course-id="'+env.id+'"]');assert.equal(await card.locator('.course-row-kind').innerText(),'Course');
   await card.locator('[data-course-details]').click();const dialog=page.locator('#course-details-dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/1 semester credits/);assert.match(await dialog.innerText(),/\bproctored\b/i);
   const href=await dialog.locator('a').filter({hasText:'Open official course page'}).getAttribute('href');assert.equal(new URL(href).hostname,'www.upistudy.com');assert.match(new URL(href).pathname,/^\/courses\/[^/]+/);
   await fits(page,'UPI library');await dialog.locator('[data-course-save]').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'{}').learning?.length===1,KEY);
   const saved=(await read(page)).learning[0];assert.equal(saved.provider,'UPI Study');assert.equal(saved.code,'UPIS-0025');assert.equal(saved.credits,1);assert.equal(saved.creditSystem,'semester');assert.equal(saved.courseVersion,env.courseVersion);assert.equal(saved.status,'saved');assert(!(saved.evaluations||[]).some(item=>item.status==='confirmed'));
   await page.keyboard.press('Escape');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#courses-results-count')?.textContent.includes('22'));assert.equal(await page.locator('#courses-results article.course-row').count(),22);assert.deepEqual((await read(page)).learning,[saved]);await shot(page,'upi-library-'+width);
  });
  await test('private TESU UPI choice stays conditional priced and preference-preserving '+width,async()=>{
   const providers=['UPI Study','Study.com','Sophia'],initial=seed(tesu,{providers,allowConditional:true,selections:{[tesuRow.id]:tesuOption.id}}),page=await open('plan.html',width,initial);await ready(page);
   const row=page.locator('tr.course-plan-row[data-requirement="'+tesuRow.id+'"]');await row.waitFor();assert.match(await row.innerText(),/UPI Study/);await row.locator('[data-row]').first().click();const dialog=page.locator('#sheet-dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/condition|proposed|review/i);assert.match(await dialog.innerText(),/\bproctored\b/i);
   const href=await dialog.locator('a').filter({hasText:/Open course/}).first().getAttribute('href');assert.equal(new URL(href).hostname,'www.upistudy.com');
   const current=await read(page);assert.deepEqual(current.scenarios[tesu.id].providers,providers);assert.deepEqual(current.learning,initial.learning);assert.deepEqual(current.sheet.notes,initial.sheet.notes);assert.equal(current.scenarios[tesu.id].optionSelections[tesuRow.id],tesuOption.id);
   await page.keyboard.press('Escape');await page.locator('[data-summary-cost]').first().waitFor();
   await page.getByRole('button',{name:'Cost & timing',exact:true}).click();
   const pricing=page.locator('#sheet-dialog'),breakdown=pricing.locator('details.plan-estimate-details');await breakdown.waitFor({state:'attached',timeout:60000});await breakdown.locator('summary').click();
   const upiPrice=pricing.locator('tr').filter({hasText:'UPI Study'});await upiPrice.waitFor();assert.match(await upiPrice.innerText(),/standalone course purchases/i);
   const cells=upiPrice.locator('th,td'),courses=Number(await cells.nth(1).innerText());assert(courses>0);assert.equal(await cells.nth(2).innerText(),new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(courses*250),'Known UPI charges use the published $250 standalone purchases, not free or an ineligible membership');
   await fits(page,'TESU private draft and cost details');await shot(page,'tesu-upi-'+width);
  });
  await test('WGU Study expansion and provider offer do not change the plan '+width,async()=>{
   const initial=seed(swe,{providers:['Study.com','Sophia'],allowConditional:false,selections:{[statistics.id]:statsOption.id}}),page=await open('plan.html',width,initial);await ready(page);
   assert.equal(await page.locator('tr.course-plan-row').count(),39);const row=page.locator('tr.course-plan-row[data-requirement="'+statistics.id+'"]');assert.match(await row.innerText(),/Statistics|SDCM-0068/);assert.doesNotMatch(await row.innerText(),/Business 103|Business Law/i);
   await row.locator('[data-row]').first().click();const dialog=page.locator('#sheet-dialog');await dialog.waitFor();const offer=dialog.locator('[data-provider-offer-slot="Study.com"] [data-provider-offer]');await offer.waitFor({timeout:30000});assert.match(await offer.innerText(),/10%/);assert.match(await offer.innerText(),/not included|confirm|check/i);
   const costReadout=page.locator('[data-summary-cost]').first();await costReadout.waitFor();const before=await read(page),cost=await costReadout.innerText(),link=offer.getByRole('link',{name:'View provider offer'});assert.equal(new URL(await link.getAttribute('href')).hostname,'study.com');assert.equal(await link.getAttribute('target'),'_blank');
   const popupPromise=page.waitForEvent('popup',{timeout:5000}).catch(()=>null);await link.click();const popup=await popupPromise;if(popup)await popup.close();
   assert.deepEqual(await read(page),before,'Viewing an advertised offer cannot change saved plan facts or selections');assert.equal(await costReadout.innerText(),cost,'An advertised discount is not silently applied');assert.equal(before.learning.length,0);await page.keyboard.press('Escape');await fits(page,'WGU worksheet');await shot(page,'wgu-study-offer-'+width);
  });
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(assetFailures,[]);assert.deepEqual(blockedWrites,[],'Browsing and saving locally must not attempt real account writes');
 const summary={passed:results.filter(row=>row.status==='passed').length,failed:results.filter(row=>row.status==='failed').length,realAccountWrites:0,telemetrySent:false,blockedAnalytics:blockedAnalytics.length,optionalMissingAssets:optionalMissingAssets.length};console.log(JSON.stringify(summary));if(summary.failed)process.exitCode=1;
}finally{await browser?.close();await report();}})().catch(error=>{console.error(error);process.exitCode=1;});
