/* Four read-only staging adoption checks. Synthetic records remain in local
 * storage; auth APIs are mocked and all real writes/external traffic blocked.
 * Run only after the matching publication revision is deployed to staging. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixtures,seed,assertAdopted}=require('./undergrad-expansion-browser.test.cjs');
const publication=require('./dist/data/publication-index.json');
const ids=['curriculum-tesu-bsba-human-resources-organizational-management','curriculum-tesu-bs-general-management'];
const cases=ids.map(id=>{const config=fixtures.find(config=>config.modelId===id);assert(config,id+' must have an exact published adoption fixture');return config;});
const widths=[1440,390],expectedFlows=cases.length*widths.length,KEY='degreepath-guide-v3';
const BASE=new URL(process.env.DEGREESTEPS_STAGING_URL||process.env.DEGREEPATH_TEST_URL||'https://degreesteps-staging.degreesteps-d215df9a.workers.dev/');
assert.equal(BASE.protocol,'https:');assert(/^degreesteps-staging\.[a-z0-9-]+\.workers\.dev$/.test(BASE.hostname),'Use the owned DegreeSteps staging host, never the production account portal.');
const ORIGIN=BASE.origin,OUT=process.env.DEGREESTEPS_TESU_STAGING_ARTIFACTS||'/workspace/audits/degreesteps-business-expansion-2026-11-26/staging-adoption';

async function run(){
 const {chromium}=require('playwright'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[],pageErrors=[],blockedWrites=[],blockedExternalRequests=[];let active,activeCase;
 await fs.mkdir(OUT,{recursive:true});
 const report=extra=>fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({syntheticOnly:true,realOAuth:false,realAccountWrites:0,externalRequestsDelivered:0,localAssetsOnly:false,origin:ORIGIN,expectedFlows,sourceRevision:publication.registryRevision,asOf:publication.asOf,results,pageErrors,blockedWrites,blockedExternalRequests,...extra},null,2)+'\n');
 try{
  for(const config of cases)for(const width of widths){
   activeCase={modelId:config.modelId,routeId:config.route.id,width};
   const context=await browser.newContext({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce',serviceWorkers:'block'});
   try{
    await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin!==ORIGIN){blockedExternalRequests.push({origin:url.origin,method:request.method()});return route.abort('blockedbyclient');}
     if(!['GET','HEAD'].includes(request.method())){blockedWrites.push({path:url.pathname,method:request.method()});return route.fulfill({status:403,json:{error:'Staging QA blocks every real write.'}});}
     if(url.pathname==='/api/auth/status')return route.fulfill({json:{configured:true,providers:['email','google'],recovery:false}});
     if(url.pathname==='/api/portal/session'||url.pathname==='/api/community/session')return route.fulfill({json:{user:null,authConfigured:true,limits:{maxPlans:10,maxStateBytes:524288}}});
     if(url.pathname==='/api/portal/plans')return route.fulfill({json:{items:[]}});
     if(url.pathname==='/api/coach/status')return route.fulfill({json:{enabled:false}});
     if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Staging QA uses synthetic API responses only.'}});
     return route.continue();
    });
    const original=seed();await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:original});
    active=await context.newPage();active.setDefaultTimeout(30000);await active.clock.setFixedTime(new Date(publication.asOf+'T12:00:00Z'));active.on('pageerror',error=>pageErrors.push({...activeCase,message:error.message.slice(0,300)}));
    const response=await active.goto(new URL('portal.html?usePlan='+encodeURIComponent(config.route.id),BASE).href,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,'The live staging portal is available.');
    await active.waitForURL('**/plan.html',{timeout:60000});await active.locator('tr.course-plan-row').first().waitFor({timeout:60000});
    const live=await active.evaluate(async()=>{const response=await fetch('data/publication-index.json',{cache:'no-store'});if(!response.ok)throw Error('The live publication receipt did not load.');return response.json();});
    assert.equal(live.registryRevision,publication.registryRevision,'Staging must serve the exact built publication revision before adoption is judged.');assert(live.plans.some(plan=>plan.modelId===config.modelId&&plan.publicationReady===true),'The actual live publication receipt contains this completed degree.');
    await active.waitForFunction(({total,outside})=>{const sum=selector=>[...document.querySelectorAll(selector+' .course-plan-credits')].reduce((sum,node)=>sum+Number(node.textContent.trim()),0);return sum('tr.course-plan-row')===total&&sum('tr.course-plan-row[data-kind="transfer"]')===outside;},{total:config.total,outside:config.outside});
    const saved=await active.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assertAdopted(saved,config,original);
    assert.equal((await active.locator('tr.course-plan-row[data-requirement="enc1010"] .course-plan-evidence').innerText()).trim(),'School-submitted mapping','The researched published map is not mislabeled as an unresolved conditional match.');
    assert.equal(await active.locator('tr.course-plan-row[data-kind="unmapped"],.course-plan-unavailable,.course-plan-pending').count(),0,'No missing-plan or preferences dead end.');
    assert.equal(await active.locator('[role="progressbar"][aria-label="Finished degree coursework"]').getAttribute('aria-valuenow'),'0','Selecting a template never marks coursework complete.');
    const dimensions=await active.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(dimensions.document<=width+1&&dimensions.body<=width+1,'The complete worksheet fits '+width+'px: '+JSON.stringify(dimensions));
    const next=active.locator('[aria-label="Your next action"]:visible a[href],.sheet-glance-next:visible').first();await next.waitFor();const label=(await next.innerText()).trim(),href=await next.getAttribute('href'),box=await next.boundingBox();assert(label&&href,'A student sees a named next step.');assert.equal(new URL(href,ORIGIN).origin,ORIGIN);assert(box&&box.width>50&&box.height>=32,'The next step has a usable click target.');
    await active.screenshot({path:path.join(OUT,config.modelId+'-'+width+'.png'),animations:'disabled'});
    await next.click();const destination=new URL(href,ORIGIN);
    if(destination.pathname==='/plan.html'){await active.locator('tr.course-plan-row').first().waitFor();if(destination.searchParams.has('course'))await active.locator('#sheet-dialog[open]').waitFor();}
    else await active.locator('main a[href]:visible,main button:visible,main input:visible').first().waitFor();
    assert.equal(await active.locator('#sheet-error:visible,#portal-error:visible,.course-plan-unavailable:visible,.course-plan-pending:visible').count(),0,'The next step is usable.');
    const after=await active.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assert.deepEqual(after.learning,original.learning);assert.deepEqual(after.sheet.notes,original.sheet.notes);
    results.push({...activeCase,credits:config.total,outside:config.outside,next:{label,href},status:'passed'});console.log('PASS live '+config.modelId+' '+width+'px');
   }catch(error){if(active&&!active.isClosed()){await active.screenshot({path:path.join(OUT,'failure.png'),animations:'disabled'}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure-body.txt'),(await active.locator('body').innerText().catch(()=>'')).slice(0,18000));}throw error;}
   finally{await context.close();active=null;}
  }
  assert.equal(results.length,expectedFlows);assert.deepEqual(pageErrors,[],'No uncaught application errors.');await report({status:'passed'});console.log('PASS '+expectedFlows+' live TESU adoptions; no real account writes.');
 }catch(error){await report({status:'failed',case:activeCase,message:String(error.stack||error).slice(0,2500)});throw error;}
 finally{await browser.close();}
}
if(require.main===module)run().catch(error=>{console.error(String(error.stack||error).slice(0,4000));process.exitCode=1;});
