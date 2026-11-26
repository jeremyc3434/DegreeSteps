/* Public adoption of 13 newly complete plans, using real local assets and
 * synthetic student records. Every external request and all writes are blocked.
 * --fixtures-only validates the exact published choices without Chromium.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),baselineIndex=require('./dist/data/baseline-index.json');
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),publication,registry);
const ORIGIN='http://127.0.0.1:8133',KEY='degreepath-guide-v3',OUT=process.env.DEGREESTEPS_UNDERGRAD_ARTIFACTS||'/workspace/audits/degreesteps-undergraduate-expansion-2026-11-26/browser';
const clone=value=>JSON.parse(JSON.stringify(value)),modelCache=new Map();
const cases=[
 ['curriculum-tesu-ba-english',120,60],
 ['curriculum-tesu-ba-liberal-studies',120,72,true],
 ['curriculum-tesu-ba-psychology',120,69],
 ['curriculum-tesu-bsba-accounting',120,63],
 ['curriculum-tesu-bsba-finance',120,63],
 ['curriculum-wgu-catalog-358f1e10651bf3d8',121,72],
 ['curriculum-wgu-catalog-bf14bd14e87ae7aa',112,64],
 ['curriculum-wgu-bs-computer-science-reviewed',121,51,true],
 ['curriculum-wgu-catalog-3a9fedcacbfcccae',120,61],
 ['curriculum-wgu-catalog-d734fb4b04eded7c',110,47],
 ['curriculum-wgu-catalog-b2a8a37d4fbedabd',34,0],
 ['curriculum-wgu-catalog-b83ee97289a0732a',35,0,true],
 ['curriculum-wgu-catalog-c4a7efe739d67a5c',36,0]
].map(([modelId,total,outside,mobile=false])=>({modelId,total,outside,mobile}));

function fixture(config){
 const published=publication.plans.find(plan=>plan.modelId===config.modelId&&plan.publicationReady===true);assert(published,config.modelId+' must be publication-ready');
 const route=catalog.pathways.find(route=>route.modelId===config.modelId&&published.routeIds.includes(route.id)&&route.readyTemplate);assert(route,config.modelId+' must be a discoverable ready route');
 const entry=registry.models.find(entry=>entry.id===config.modelId),pack=require('./dist/'+entry.path),model=(pack.models||[pack]).find(model=>model.id===config.modelId);assert(model,config.modelId+' runtime model');
 const baseline=Object.values(baselineIndex.baselines).find(plan=>plan.modelId===model.id&&plan.pathwayId===route.id&&plan.qualityReady);assert(baseline,config.modelId+' needs a ready baseline');
 assert.equal(baseline.summary.totalCredits,config.total,config.modelId+' total');assert.equal(baseline.summary.transferCredits,config.outside,config.modelId+' reviewed outside total');assert.equal(baseline.summary.universityCredits,config.total-config.outside,config.modelId+' university total');
 assert.equal(baseline.rows.length,model.requirements.length,config.modelId+' every requirement has a chosen course');assert.equal(new Set(baseline.rows.map(row=>row.requirementId)).size,baseline.rows.length,config.modelId+' no duplicate requirements');
 const sources=new Set(model.sources.map(source=>source.id)),originalCourses=new Set();let outside=0,total=0;
 for(const row of baseline.rows){
  const requirement=model.requirements.find(requirement=>requirement.id===row.requirementId),option=requirement?.options.find(option=>option.id===row.optionId);assert(option,config.modelId+' missing choice '+row.requirementId);
  assert.equal(row.status,'planned',config.modelId+' baseline never grants earned credit');assert.equal(option.evidence,'published',config.modelId+' '+row.requirementId+' cannot start with a conditional course');
  assert.equal(row.provider,option.provider,config.modelId+' provider '+row.requirementId);assert.equal(row.code,option.code,config.modelId+' original code '+row.requirementId);assert.equal(row.credits,requirement.credits,config.modelId+' receiving quantity '+row.requirementId);assert.equal(option.credits,requirement.credits,config.modelId+' option quantity '+row.requirementId);assert.equal(option.creditSystem,model.creditSystem,config.modelId+' receiving units '+row.requirementId);
  assert(option.sourceIds?.length&&option.sourceIds.every(id=>sources.has(id)),config.modelId+' bound receiving evidence '+row.requirementId);
  assert(!originalCourses.has(row.provider+'|'+row.code),config.modelId+' cannot reuse original course '+row.code);originalCourses.add(row.provider+'|'+row.code);total+=row.credits;
  if(row.provider!=='University'){
   outside+=row.credits;assert(option.sourceCredits>0&&['semester','quarter','competency-unit'].includes(option.sourceCreditSystem),config.modelId+' independently typed original credit '+row.code);assert(option.identitySourceIds?.length&&option.identitySourceIds.every(id=>sources.has(id)),config.modelId+' original identity evidence '+row.code);assert.notEqual(option.individualApproval,true,config.modelId+' no individual award '+row.code);
  }
 }
 assert.equal(total,config.total,config.modelId+' complete receiving ledger');assert.equal(outside,config.outside,config.modelId+' complete published transfer mix');
 if(config.modelId.startsWith('curriculum-tesu-'))assert.equal(baseline.baselineSelection?.selected,'published-only-baseline',config.modelId+' uses its reviewed published-only alternative');
 const result={...config,route,model,baseline};modelCache.set(model.id,model);return result;
}
const fixtures=cases.map(fixture),originalRoute=catalog.pathways.find(route=>route.modelId==='curriculum-liberty-history-bs-online'&&route.readyTemplate);assert(originalRoute,'A returning student starts with an existing ready plan');
function seed(){
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),originalRoute),null,catalog);
 Object.assign(state.profile,{goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open',priority:'transfer',proctoringPreference:'open',assessmentPreference:'mixed',hasPrior:'later'});
 state.learning=[{id:'qa-original-unmatched-course',provider:'QA Previous College',code:'QA-PRIVATE-901',title:'My previous college course',credits:4,creditSystem:'quarter',status:'saved',evaluations:[]}];
 state.sheet.notes={[originalRoute.modelId]:{'qa-private-note':'Keep my advisor note when I change degrees.'}};
 state.journey={...state.journey,completed:true,intakeCompleted:true,profileFlowVersion:1,view:'home',step:'review',answers:{...state.journey.answers,start:'target',purpose:'any-degree',prior:'later',format:{modality:'online',classroomImportance:'open'}}};
 return state;
}
function assertAdopted(current,config,original){
 assert.equal(current.selectedPathwayId,config.route.id,config.modelId+' selected through the public flow');
 assert.deepEqual(current.learning,original.learning,config.modelId+' preserves original quarter credits without converting or awarding them');assert.deepEqual(current.sheet.notes,original.sheet.notes,config.modelId+' preserves private notes');
 const selections=current.scenarios?.[config.modelId]?.optionSelections||{};
 assert.equal(Object.keys(selections).length,config.baseline.rows.length,config.modelId+' public adoption pins every baseline choice');
 for(const row of config.baseline.rows)assert.equal(selections[row.requirementId],row.optionId,config.modelId+' exact published choice '+row.requirementId);
 const draft=Journey.buildDraft(current,catalog,[config.model]),plan=draft.plan;assert(plan,config.modelId+' opens a course plan');assert.equal(draft.targetReviewNeeded,false,config.modelId+' no preference dead end');assert.equal(plan.readiness,'review-ready',config.modelId+' no research dead end');assert.equal(plan.validation.academicCountsValid,true,config.modelId+' academic counts');assert.equal(plan.validation.policyChecksComplete,true,config.modelId+' policy checks');
 assert.equal(plan.totals.accounted,config.total,config.modelId+' complete receiving total');assert.equal(plan.totals.external,config.outside,config.modelId+' exact reviewed outside total');assert.equal(plan.totals.institutional,config.total-config.outside,config.modelId+' university total');assert.equal(plan.totals.confirmed,0,config.modelId+' source review never grants student credit');assert.equal(plan.totals.reported,0,config.modelId+' collecting a course never reports completion');
 for(const row of config.baseline.rows){const actual=plan.rows.find(actual=>actual.requirementId===row.requirementId);assert.equal(actual?.option?.id,row.optionId,config.modelId+' actual chosen option '+row.requirementId);assert.equal(actual.status,'planned',config.modelId+' proposed status '+row.requirementId);}
 return draft;
}

async function run(){
 if(process.argv.includes('--fixtures-only')){
  for(const config of fixtures){const original=seed(),next=Journey.selectRoute(original,config.route,catalog),scenario=Sheet.scenario(next,config.modelId);next.scenarios={...next.scenarios,[config.modelId]:{...scenario,providers:[...new Set([...scenario.providers,...config.baseline.rows.map(row=>row.provider).filter(provider=>provider!=='University')])],optionSelections:Object.fromEntries(config.baseline.rows.map(row=>[row.requirementId,row.optionId]))}};assertAdopted(next,config,original);}
  console.log('PASS 13 published fixtures: exact credits, original units, sources, published-only choices and raw Journey readiness.');return;
 }
 const {chromium}=require('playwright'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[],pageErrors=[],blockedWrites=[],externalRequests=[];let active,activeConfig;
 await fs.mkdir(OUT,{recursive:true});
 try{
  for(const config of fixtures)for(const width of config.mobile?[1440,390]:[1440]){
   activeConfig={modelId:config.modelId,width};const context=await browser.newContext({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce'});
   try{
    await mountOfflineSite(context,{origin:ORIGIN});
    await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin!==ORIGIN){externalRequests.push({origin:url.origin,method:request.method()});return route.abort('blockedbyclient');}
     if(!['GET','HEAD'].includes(request.method())){blockedWrites.push({path:url.pathname,method:request.method()});return route.fulfill({status:403,json:{error:'Synthetic QA blocks every write.'}});}
     if(url.pathname==='/api/auth/status')return route.fulfill({json:{configured:true,providers:['email','google'],recovery:false}});
     if(url.pathname==='/api/portal/session'||url.pathname==='/api/community/session')return route.fulfill({json:{user:null,authConfigured:true,limits:{maxPlans:10,maxStateBytes:524288}}});
     if(url.pathname==='/api/portal/plans')return route.fulfill({json:{items:[]}});
     if(url.pathname==='/api/coach/status')return route.fulfill({json:{enabled:false}});
     if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Only synthetic API responses are allowed.'}});
     return route.fallback();
    });
    const original=seed();await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:original});
    active=await context.newPage();active.setDefaultTimeout(30000);await active.clock.setFixedTime(new Date(publication.asOf+'T12:00:00Z'));active.on('pageerror',error=>pageErrors.push({...activeConfig,message:error.message.slice(0,300)}));
    await active.goto(ORIGIN+'/portal.html?usePlan='+encodeURIComponent(config.route.id),{waitUntil:'domcontentloaded'});
    await active.waitForURL('**/plan.html',{timeout:60000});await active.locator('tr.course-plan-row').first().waitFor({timeout:60000});
    await active.waitForFunction(({total,outside})=>{const sum=selector=>[...document.querySelectorAll(selector+' .course-plan-credits')].reduce((sum,node)=>sum+Number(node.textContent.trim()),0);return sum('tr.course-plan-row')===total&&sum('tr.course-plan-row[data-kind="transfer"]')===outside;},{total:config.total,outside:config.outside});
    const saved=await active.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assertAdopted(saved,config,original);
    assert.equal(await active.locator('tr.course-plan-row[data-kind="unmapped"],.course-plan-unavailable,.course-plan-pending').count(),0,config.modelId+' no missing-plan screen');
    assert.match(await active.locator('#sheet-footer').innerText(),new RegExp('Degree total: '+config.total+' '));
    assert.equal(await active.locator('[role="progressbar"][aria-label="Finished degree coursework"]').getAttribute('aria-valuenow'),'0',config.modelId+' saved courses do not appear finished');
    const dimensions=await active.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(dimensions.document<=width+1&&dimensions.body<=width+1,config.modelId+' no page overflow at '+width+'px: '+JSON.stringify(dimensions));
    const next=active.locator('[aria-label="Your next action"]:visible a[href],.sheet-glance-next:visible').first();await next.waitFor();const label=(await next.innerText()).trim(),href=await next.getAttribute('href');assert(label&&href,config.modelId+' a named next action');assert.equal(new URL(href,ORIGIN).origin,ORIGIN,config.modelId+' next action stays in the student flow');const box=await next.boundingBox();assert(box&&box.width>50&&box.height>=32,config.modelId+' next action has a usable click target');
    await active.screenshot({path:path.join(OUT,config.modelId+'-'+width+'.png'),animations:'disabled'});
    await next.click();
    const destination=new URL(href,ORIGIN);
    if(destination.pathname==='/plan.html'){await active.locator('tr.course-plan-row').first().waitFor();if(destination.searchParams.has('course'))await active.locator('#sheet-dialog[open]').waitFor();}
    else await active.locator('main a[href]:visible,main button:visible,main input:visible').first().waitFor();
    assert.equal(await active.locator('#sheet-error:visible,#portal-error:visible,.course-plan-unavailable:visible,.course-plan-pending:visible').count(),0,config.modelId+' next action opens without a blocker');
    const after=await active.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assert.deepEqual(after.learning,original.learning,config.modelId+' next action preserves courses');assert.deepEqual(after.sheet.notes,original.sheet.notes,config.modelId+' next action preserves notes');
    results.push({modelId:config.modelId,routeId:config.route.id,width,credits:config.total,outside:config.outside,baselineSelection:config.baseline.baselineSelection?.selected||'default',next:{label,href},status:'passed'});console.log('PASS '+config.modelId+' '+width+'px');
   }catch(error){
    if(active&&!active.isClosed()){await active.screenshot({path:path.join(OUT,'failure.png'),animations:'disabled'}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure-body.txt'),(await active.locator('body').innerText().catch(()=>'')).slice(0,18000));}
    throw error;
   }finally{await context.close();active=null;}
  }
  assert.equal(results.length,16,'All13 desktop and three representative mobile flows execute');assert.equal(pageErrors.length,0,'No uncaught page errors: '+JSON.stringify(pageErrors));
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({syntheticOnly:true,realAccountWrites:0,externalRequestsDelivered:0,localAssetsOnly:true,publicAdoption:'portal.html?usePlan=<routeId>',registryRevision:publication.registryRevision,asOf:publication.asOf,results,pageErrors,blockedWrites,externalRequests},null,2)+'\n');console.log('PASS 16 public-adoption browser journeys; no real account writes.');
 }catch(error){
  if(active&&!active.isClosed()){await active.screenshot({path:path.join(OUT,'failure.png'),animations:'disabled'}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure-body.txt'),(await active.locator('body').innerText().catch(()=>'')).slice(0,18000));}
  await fs.writeFile(path.join(OUT,'failure.json'),JSON.stringify({case:activeConfig,message:String(error.message).slice(0,1500),pageErrors,results,blockedWrites},null,2)+'\n');throw error;
 }finally{await browser.close();}
}
if(require.main===module)run().catch(error=>{console.error(String(error.stack||error).slice(0,5000));process.exitCode=1;});
module.exports={fixtures,seed,assertAdopted};
