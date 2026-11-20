/* Synthetic registry fixtures exercise the loader and UI only; no fabricated curriculum is published. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),C=require('./dist/program-catalog.js'),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),A=require('./dist/audit-curriculum.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs'),{completeProfileSteps}=require('./test-support/profile-steps.cjs');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3',contexts=[],errors=[],catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json'));
const fixtureRoute={id:'ui-fixture-degree',schoolId:'ui-fixture',school:'Curriculum QA University',title:'Synthetic Business B.S. — UI fixture',level:'bachelor',modalities:['online'],url:'https://example.edu/catalog/business/',sourceId:'ui-fixture',coverage:'official-listing',catalogCollection:'ui-fixture'};
const fixtureModel={...structuredClone(require('./dist/data/liberty.json')),id:'curriculum-ui-fixture-degree',school:fixtureRoute.school,title:fixtureRoute.title,format:'Online'};
const fixtureIndex={version:1,checkedOn:'2026-11-09',models:[{id:fixtureModel.id,path:'data/curricula/ui-fixture.json',routeIds:[fixtureRoute.id],school:fixtureRoute.school,title:fixtureRoute.title,modalities:['online'],coverage:'complete',readyTemplate:true,openCourseChoices:0,unresolvedRequiredChoices:0,status:'reviewed'}]};
// The fixture is publication-ready, so the reviewed plan list must describe it too.
const fixturePublication={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'1'.repeat(64),curriculumFingerprint:C.publicationFingerprint(fixtureIndex),plans:[{modelId:fixtureModel.id,routeIds:[fixtureRoute.id],level:C.publicationLevel(fixtureRoute.level),publicationReady:true,modelFingerprint:C.publicationModelFingerprint(fixtureModel,fixtureRoute.level)}]};
const sourceRoute={...fixtureRoute,id:'ui-fixture-source-degree',title:'Synthetic source Business B.S. — UI fixture',url:'https://example.edu/catalog/source-business/'};
const sourceVariants=[{id:'1111111111111111',title:'Synthetic Business B.S. — Finance concentration',modalities:['online'],url:sourceRoute.url+'finance/'},{id:'2222222222222222',title:'Synthetic Business B.S. — Operations concentration',modalities:['online'],url:sourceRoute.url+'operations/'}];
const curriculumCalls=new WeakMap();
function sourceFixture({title=sourceRoute.title,hash='b'.repeat(64),url=sourceRoute.url}={}){
  // Saved catalog imports are capped at 300 KB; keep the synthetic copy to two choices per requirement.
  const compact=structuredClone(fixtureModel);compact.requirements=compact.requirements.map(row=>({...row,options:row.options.slice(0,2)}));
  const model={...compact,id:'source-curriculum-'+hash.slice(0,32),title,level:'bachelor',format:'Online',modalities:['online'],completeExecutablePathway:false,reviewStatus:'automated-public-source'};
  model.sources.push({id:'ui-fixture-official-source',url,title:'Synthetic official curriculum fixture'});
  return C.validateDiscovery({version:1,status:'ready',programId:sourceRoute.id,model,route:{...sourceRoute,id:sourceRoute.id+'-source-'+hash.slice(0,16),parentId:sourceRoute.id,modelId:model.id,title,url,courseMapStatus:'automated-public-source',reviewStatus:'automated-public-source'},source:{url,hash,requirementsHash:hash,algorithm:'sha256',checkedOn:'2026-11-10',reviewStatus:'automated-public-source'}});
}
function privateAudit(){return A.create(fixtureModel.requirements.map((row,i)=>({section:row.category,title:row.title,code:'AUD '+(i+1),credits:row.credits,upperLevel:Boolean(row.upper)})),{id:'student-audit-ui-fixture',school:fixtureRoute.school,title:'Private imported B.S. — UI fixture',sourceUrl:'https://example.edu/catalog/private/',level:'bachelor',modality:'online',totalCredits:fixtureModel.totalCredits,creditSystem:'semester',institutionMinCredits:0,upperMinCredits:0,reviewedByStudent:true});}
const sourceHandoff=()=> 'portal.html?school='+encodeURIComponent(sourceRoute.school)+'&program='+sourceRoute.id+'&level=bachelor&format=online';
let browser,count=0;
function seed(){let state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(route=>route.id==='liberty-business-residential')),null,catalog);state=S.updateLearning(state,{id:'private-course',title:'Keep my course',provider:'My former college',credits:3,creditSystem:'semester',status:'saved'});state.sheet.notes={private:'Keep my advisor note'};state.journey.completed=true;return state;}
async function page(path,state=null,width=1440,options={}){
  const context=await browser.newContext({viewport:{width,height:1000}}),calls=[];contexts.push(context);await mountOfflineSite(context,{origin:new URL(BASE).origin});
  if(state)await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
  await context.route('**/data/program-catalog.json',route=>{const data=structuredClone(require('./dist/data/program-catalog.json'));data.sources.push({id:'ui-fixture',url:'https://example.edu/catalog/',title:'Synthetic UI fixture source'});data.programs.push(fixtureRoute,sourceRoute);return route.fulfill({json:data});});
  await context.route('**/data/curriculum-registry.json',route=>route.fulfill({json:fixtureIndex}));
  await context.route('**/data/publication-index.json',route=>route.fulfill({json:fixturePublication}));
  await context.route('**/data/curricula/ui-fixture.json',route=>route.fulfill({json:{models:[fixtureModel]}}));
  await context.route('**/api/curriculum?**',route=>{
    const params=new URL(route.request().url()).searchParams,call={program:params.get('program'),variant:params.get('variant')||''};calls.push(call);
    if(options.discovery==='variants'&&!call.variant)return route.fulfill({json:{version:1,status:'choose-variant',programId:sourceRoute.id,reason:'Choose the exact university concentration.',variants:sourceVariants,source:{url:sourceRoute.url}}});
    if(options.discovery==='ready'||options.discovery==='variants'){
      const variant=sourceVariants.find(item=>item.id===call.variant);
      return route.fulfill({json:sourceFixture(variant?{title:variant.title,url:variant.url,hash:'c'.repeat(64)}:{})});
    }
    return route.fulfill({json:{version:1,status:'needs-audit',programId:call.program,reason:'The official source does not publish a complete fixed-credit requirement list.',source:{url:sourceRoute.url}}});
  });
  const p=await context.newPage();curriculumCalls.set(p,calls);p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+path,{waitUntil:'networkidle'});return p;
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY),ready=page=>page.locator('tr.course-plan-row').first().waitFor();
// Each journey reports on its own so one failure does not hide the rest; any failure fails the run.
const failures=[];
async function test(name,fn){if(process.env.DEGREEPATH_CURRICULUM_CASE&&!new RegExp(process.env.DEGREEPATH_CURRICULUM_CASE).test(name))return;const start=contexts.length;try{await fn();count++;console.log('PASS '+name);}catch(error){failures.push(name);console.log('FAIL '+name+'\n  '+String(error.message).split('\n')[0]);}finally{for(const context of contexts.splice(start))await context.close();}}
(async()=>{try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
await test('a new registry degree builds a full worksheet from the finder handoff',async()=>{const p=await page('portal.html?school='+encodeURIComponent(fixtureRoute.school)+'&program='+fixtureRoute.id+'&level=bachelor&format=online');await p.getByRole('button',{name:'Build course plan',exact:true}).waitFor();await p.getByRole('button',{name:'Build course plan',exact:true}).click();await completeProfileSteps(p);await p.waitForURL('**/plan.html');await ready(p);assert.equal((await saved(p)).selectedPathwayId,fixtureRoute.id);assert.match(await p.locator('#sheet-titlebar').innerText(),/Synthetic Business/);assert.equal((await saved(p)).learning.length,0);assert.equal(await p.locator('.course-plan-unavailable').count(),0);});
await test('registry preview preserves an existing plan until explicit build and retains its private collection',async()=>{const original=seed(),p=await page('portal.html?school='+encodeURIComponent(fixtureRoute.school)+'&program='+fixtureRoute.id+'&level=bachelor&format=online',original);await p.getByRole('button',{name:'Build course plan',exact:true}).waitFor();assert.equal((await saved(p)).selectedPathwayId,original.selectedPathwayId);assert.deepEqual((await saved(p)).learning,original.learning);await p.getByRole('button',{name:'Build course plan',exact:true}).click();await completeProfileSteps(p);await p.waitForURL('**/plan.html');await ready(p);const next=await saved(p);assert.equal(next.selectedPathwayId,fixtureRoute.id);assert.deepEqual(next.learning,original.learning);assert.deepEqual(next.sheet.notes,original.sheet.notes);assert(next.whatIf.snapshots.some(snapshot=>snapshot.pathwayId===original.selectedPathwayId));});
await test('changing degree inside My plan loads a registered curriculum before switching',async()=>{const original=seed(),p=await page('plan.html',original);await ready(p);await p.locator('#sheet-titlebar [data-action=target]').click();await p.locator('#sheet-target-form [name=school]').selectOption(fixtureRoute.school);await p.locator('#sheet-target-form [name=pathwayId]').selectOption(fixtureRoute.id);await p.locator('#sheet-target-form button[type=submit]').filter({hasText:'Build course plan'}).waitFor();await p.locator('#sheet-target-form button[type=submit]').click();await ready(p);assert.equal((await saved(p)).selectedPathwayId,fixtureRoute.id);assert.deepEqual((await saved(p)).learning,original.learning);});
await test('side-by-side comparison uses a registered curriculum instead of an empty outline',async()=>{const original=seed();original.whatIf={...original.whatIf,version:1,selectedIds:['route:'+fixtureRoute.id],includeOtherFormats:true};const p=await page('compare-plans.html',original);const card=p.locator('[data-scenario="route:'+fixtureRoute.id+'"]');await card.waitFor();await card.locator('[data-collection-fit-credits]').waitFor();assert.equal(await card.locator('.comparison-unmapped').count(),0);assert.match(await card.innerText(),/Synthetic Business/);assert.equal((await saved(p)).selectedPathwayId,original.selectedPathwayId);assert.deepEqual((await saved(p)).learning,original.learning);});
await test('the registered degree worksheet remains readable on a small phone',async()=>{let state=seed();state.profile={...state.profile,school:fixtureRoute.school,schoolChoice:fixtureRoute.school,degree:fixtureRoute.title,pathwayId:fixtureRoute.id,degreeLevel:'bachelor',modality:'online',classroomImportance:'open'};state.selectedPathwayId=fixtureRoute.id;const p=await page('plan.html',state,390);await ready(p);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal((await saved(p)).selectedPathwayId,fixtureRoute.id);});
// Live requirement lookups are retired: the guided planner sends a degree without a reviewed plan to
// "Research this degree" (an offline-reviewed request), never to /api/curriculum. DegreeProgramCatalog.discover
// is kept for now but no planner path calls it.
const researchHref='request-plan.html?source='+encodeURIComponent(sourceRoute.url);
async function researchCard(p){const card=p.locator('.portal-readiness-card');await card.waitFor();assert.match(await card.innerText(),/does not have a completed template yet/);assert.match(await card.innerText(),/Your current plan and courses stay saved/);return card;}
await test('a degree without a reviewed plan offers Research this degree, not a live lookup, and keeps courses added in another tab',async()=>{
  const original=seed(),p=await page(sourceHandoff(),original,1440,{discovery:'ready'}),card=await researchCard(p);
  const research=card.getByRole('link',{name:'Research this degree →',exact:true});assert.equal(await research.getAttribute('href'),researchHref);
  assert.equal(await p.getByRole('button',{name:'Build course plan',exact:true}).count(),0);assert(await card.getByRole('button',{name:'Browse available course plans',exact:true}).isVisible());
  assert.deepEqual(curriculumCalls.get(p),[],'the planner never fetches requirements live');assert.deepEqual(await saved(p),original,'viewing the degree must not save a replacement plan');
  const concurrent=S.updateLearning(original,{id:'another-tab-course',title:'Added in another tab',provider:'Another former college',credits:3,creditSystem:'semester',status:'earned'});
  await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:KEY,value:concurrent});
  await research.click();await p.waitForURL('**/request-plan.html?source=**');assert.equal(await p.locator('#degree-url').inputValue(),sourceRoute.url);
  const next=await saved(p);assert.equal(next.selectedPathwayId,original.selectedPathwayId);assert.deepEqual(next.learning,concurrent.learning);assert.deepEqual(next.sheet.notes,original.sheet.notes);assert.equal(next.sourceCurricula,undefined);assert.deepEqual(curriculumCalls.get(p),[]);
});
await test('concentration choices are not fetched live; research starts from the official program link',async()=>{
  const original=seed(),p=await page(sourceHandoff(),original,1440,{discovery:'variants'}),card=await researchCard(p);
  assert.equal(await p.locator('[data-source-variant]').count(),0);assert.deepEqual(curriculumCalls.get(p),[]);
  assert.equal(await card.getByRole('link',{name:'Research this degree →',exact:true}).getAttribute('href'),researchHref);assert.deepEqual(await saved(p),original);
});
await test('an incomplete source offers an actionable private-audit path without replacing the active plan',async()=>{
  const original=seed(),p=await page(sourceHandoff(),original),card=await researchCard(p);assert.equal(await p.getByRole('button',{name:'Build course plan',exact:true}).count(),0);assert.deepEqual(curriculumCalls.get(p),[]);
  await card.getByRole('link',{name:'Research this degree →',exact:true}).click();await p.waitForURL('**/request-plan.html?source=**');
  await p.getByRole('link',{name:'Build a plan yourself',exact:true}).click();await p.locator('#audit-import-form').waitFor();
  assert.deepEqual((await saved(p)).learning,original.learning);assert.equal((await saved(p)).selectedPathwayId,original.selectedPathwayId);
});
await test('a private imported audit restores real plan rows and comparison totals',async()=>{
  const original=seed(),entry=privateAudit(),state=A.commit(original,entry,{catalog}),p=await page('plan.html',state);await ready(p);
  assert.equal((await saved(p)).selectedPathwayId,entry.route.id);assert.match(await p.locator('#sheet-titlebar').innerText(),/Private imported/);assert.equal(await p.locator('.course-plan-unavailable').count(),0);assert.deepEqual((await saved(p)).learning,original.learning);assert.deepEqual((await saved(p)).sheet.notes,original.sheet.notes);
  await p.goto(BASE+'compare-plans.html',{waitUntil:'networkidle'});const current=p.locator('[data-scenario="current"]');await current.locator('[data-collection-fit-credits]').waitFor();assert.equal(await current.locator('.comparison-unmapped').count(),0);assert.match(await current.innerText(),/Private imported/);assert.equal((await saved(p)).selectedPathwayId,entry.route.id);assert.deepEqual((await saved(p)).customCurricula,state.customCurricula);assert.equal(curriculumCalls.get(p).length,0);
});
await test('a saved source revision restores real plan rows and comparison totals',async()=>{
  const original=seed(),result=sourceFixture();let state=C.rememberDiscovery(original,result);state=S.selectPathway(state,result.route);state.profile.modality='online';state.journey={...state.journey,completed:true,view:'home'};
  const p=await page('plan.html',state);await ready(p);assert.equal((await saved(p)).selectedPathwayId,result.route.id);assert.match(await p.locator('#sheet-titlebar').innerText(),/Synthetic source Business/);assert.equal(await p.locator('.course-plan-unavailable').count(),0);
  await p.goto(BASE+'compare-plans.html',{waitUntil:'networkidle'});const current=p.locator('[data-scenario="current"]');await current.locator('[data-collection-fit-credits]').waitFor();assert.equal(await current.locator('.comparison-unmapped').count(),0);assert.match(await current.innerText(),/Synthetic source Business/);assert.equal((await saved(p)).selectedPathwayId,result.route.id);assert.deepEqual((await saved(p)).learning,original.learning);assert.deepEqual((await saved(p)).sheet.notes,original.sheet.notes);assert.deepEqual((await saved(p)).sourceCurricula,state.sourceCurricula);assert.equal(curriculumCalls.get(p).length,0);
});
await test('a full previous-plan list blocks switching before replacing the active target',async()=>{
  const original=seed();original.whatIf={version:1,snapshots:Array.from({length:20},(_,i)=>({id:'full-'+i,label:'Saved '+i,pathwayId:original.selectedPathwayId,settings:{},savings:{},priority:'transfer'}))};
  const p=await page('portal.html?school='+encodeURIComponent(fixtureRoute.school)+'&program='+fixtureRoute.id+'&level=bachelor&format=online',original);
  await p.getByRole('button',{name:'Build course plan',exact:true}).click();await p.locator('#portal-step-error').filter({hasText:/saved versions are full/i}).waitFor();
  assert.match(await p.locator('#portal-step-error').innerText(),/saved versions are full/i);assert.equal((await saved(p)).selectedPathwayId,original.selectedPathwayId);assert.deepEqual((await saved(p)).learning,original.learning);assert.equal((await saved(p)).whatIf.snapshots.length,20);
});
await test('checking an unmapped current goal offers research and a degree audit, never a live lookup',async()=>{
  const original=seed();original.selectedPathwayId=sourceRoute.id;original.profile={...original.profile,school:sourceRoute.school,degree:sourceRoute.title,pathwayId:sourceRoute.id,degreeLevel:'bachelor',modality:'online',classroomImportance:'open'};
  const p=await page('compare-plans.html',original,1440,{discovery:'ready'}),current=p.locator('[data-scenario="current"]');
  await current.locator('.comparison-unmapped').waitFor();
  assert.equal(await current.locator('[data-source-program]').count(),0,'no live requirement check is offered');
  assert.equal(await current.getByRole('link',{name:'Research this degree →',exact:true}).getAttribute('href'),researchHref);
  assert(await current.getByRole('link',{name:'Use my degree audit →',exact:true}).isVisible());
  assert.equal(await p.locator('.comparison-card').filter({hasText:'Unavailable saved program'}).count(),0);
  assert.deepEqual(curriculumCalls.get(p),[]);assert.equal((await saved(p)).selectedPathwayId,sourceRoute.id);assert.equal((await saved(p)).sourceCurricula,undefined);
  await current.getByRole('link',{name:'Research this degree →',exact:true}).click();await p.waitForURL('**/request-plan.html?source=**');
  const next=await saved(p);assert.equal(next.selectedPathwayId,sourceRoute.id);assert.deepEqual(next.learning,original.learning);assert.deepEqual(next.sheet.notes,original.sheet.notes);
});
await test('subscription terms and accelerated course loads save through the cost form',async()=>{
  const oldPricing=fixtureModel.pricing;fixtureModel.pricing={model:'subscription',amount:4125,currency:'USD',sourceUrl:fixtureRoute.url};
  try{
    const original=seed(),state=S.selectPathway(original,{...fixtureRoute,modelId:fixtureModel.id});state.profile.modality='online';state.profile.classroomImportance='open';
    const p=await page('plan.html?task=cost-time',state),form=p.locator('#sheet-cost-form');
    await form.locator('[name=universitySubscriptionTerms]').fill('3');assert.equal(await form.locator('[name=termCredits]').getAttribute('max'),String(fixtureModel.totalCredits));
    await form.locator('[name=termCredits]').evaluate(el=>{for(let d=el.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;});await form.locator('[name=termCredits]').fill('60');await form.getByRole('button',{name:'Update estimates',exact:true}).click();
    await p.waitForFunction(({key,id})=>Number(JSON.parse(localStorage.getItem(key)).scenarios[id]?.universitySubscriptionTerms)===3,{key:KEY,id:fixtureModel.id});
    const next=await saved(p);assert.equal(Number(next.scenarios[fixtureModel.id].termCredits),60);assert.deepEqual(next.learning,original.learning);assert.deepEqual(next.sheet.notes,original.sheet.notes);
    const draft=J.buildDraft(next,C.attachRegistry(C.merge(catalog,{programs:[fixtureRoute],sources:[]}),fixtureIndex),[fixtureModel]);assert(draft.plan,'the registered fixture must build after saving the cost form: '+JSON.stringify(draft.targetIssues));assert.equal(draft.plan.costs.universityTuition,12375);assert.equal(draft.input.timing.universityCreditsPerTerm,60);
  }finally{if(oldPricing)fixtureModel.pricing=oldPricing;else delete fixtureModel.pricing;}
});
assert.deepEqual(errors,[]);console.log(count+' dynamic curriculum UI journeys passed.');if(failures.length){console.error(failures.length+' failed: '+failures.join('; '));process.exitCode=1;}
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
