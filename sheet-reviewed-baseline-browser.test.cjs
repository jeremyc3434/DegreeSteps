/* Real worksheet boot using local assets and synthetic private drafts; no account writes. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto'),{chromium}=require('playwright');
const {mountOfflineSite}=require('./test-support/offline-site.cjs'),Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const root=__dirname,KEY='degreepath-guide-v3',ORIGIN='http://127.0.0.1:8133',copy=value=>JSON.parse(JSON.stringify(value));
const json=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
(async()=>{
 const {loadKit,kitsRoot}=await import('./scripts/pathway-factory/lib.mjs'),{compileKit}=await import('./scripts/pathway-factory/compile.mjs'),{compilePathwayArtifacts}=await import('./scripts/build-pathway-quality-report.mjs');
 const ids=['curriculum-tesu-ba-liberal-studies','curriculum-tesu-ba-psychology'],doc=compileKit(await loadKit(kitsRoot+'/tesu')).doc,models=doc.models.filter(model=>ids.includes(model.id)).map(model=>({...model,sources:[...new Map([...(doc.sources||[]),...model.sources].map(source=>[source.id,source])).values()]})),registry=await json('dist/data/curriculum-registry.json'),base=Catalog.attachRegistry(Catalog.merge(await json('dist/data/pathways.json'),await json('dist/data/program-catalog.json')),registry);
 // The registry compiler binds document-level sources into every runtime model.
 // Match that real transport contract before testing actual browser loading.
 for(const model of models)Catalog.validateModel(model,registry.models.find(entry=>entry.id===model.id));
 const assets={};for(const relative of ['planner.js','course-assessment.js','data/curriculum-registry.json'])assets['/'+relative]=await fs.readFile(path.join(root,'dist',relative),'utf8');
 for(const model of models)assets['/'+registry.models.find(entry=>entry.id===model.id).path]=JSON.stringify({models:[model]});
 const compiled=compilePathwayArtifacts({models,entries:registry.models.filter(entry=>ids.includes(entry.id)),catalog:base,registry:await json('dist/data/academic-registry.json'),references:await json('dist/data/research-references.json'),asOf:'2026-11-26',inputHashes:Object.fromEntries(Object.entries(assets).map(([file,text])=>[file,createHash('sha256').update(text).digest('hex')]))});compiled.publicationIndex.curriculumFingerprint=Catalog.publicationFingerprint(registry);
 const catalog=Catalog.attachPublicationIndex(base,compiled.publicationIndex,registry),model=models.find(item=>item.id===ids[0]),route=catalog.pathways.find(item=>item.modelId===model.id),baseline=Object.values(compiled.baselineIndex.baselines).find(item=>item.modelId===model.id);
 assert.equal(baseline.baselineSelection?.selected,'published-only-baseline','This regression exercises the reviewed fallback route.');
 const seed=()=>{const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);state.profile.modality='online';state.sheet.notes={[model.id]:{private:'Private note stays with my plan'}};return state;};
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),contexts=[],errors=[],writes=[];
 async function open(state,index=compiled.baselineIndex){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);await mountOfflineSite(context,{origin:ORIGIN});
  const overrides={...assets,'/data/baseline-index.json':JSON.stringify(index),'/data/publication-index.json':JSON.stringify(compiled.publicationIndex)};
  await context.route('**/*',async request=>{const target=new URL(request.request().url());if(target.origin===ORIGIN&&Object.hasOwn(overrides,target.pathname))return request.fulfill({status:200,body:overrides[target.pathname],contentType:target.pathname.endsWith('.js')?'text/javascript':'application/json'});return request.fallback();});
  await context.addInitScript(({KEY,state})=>localStorage.setItem(KEY,JSON.stringify(state)),{KEY,state});
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()!=='GET'&&/\/api\/(?:portal|account|auth)/.test(request.url()))writes.push(request.url());});
  await page.goto(ORIGIN+'/plan.html',{waitUntil:'networkidle'});
  try{await page.locator('#sheet-workspace:not([hidden])').waitFor();await page.locator('tr.course-plan-row').first().waitFor();}
  catch(error){console.error(JSON.stringify({url:page.url(),pageErrors:errors,error:await page.locator('#sheet-error').textContent().catch(()=>null),loading:await page.locator('#sheet-loading').textContent().catch(()=>null),stored:await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY).catch(()=>null)}));await page.screenshot({path:'/tmp/degreesteps-reviewed-baseline-failure.png',fullPage:true});throw error;}
  return page;
 }
 const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 try {
  const page=await open(seed()),current=await saved(page);
  assert.deepEqual(current.scenarios[model.id].optionSelections||{},{});for(const row of baseline.rows)assert.equal(current.scenarios[model.id].suggestedChoices.optionSelections[row.requirementId],row.optionId);
  const draft=Journey.buildDraft(current,catalog,models);assert.equal(draft.plan.totals.external,baseline.summary.transferCredits);assert.equal(draft.plan.totals.institutional,baseline.summary.universityCredits);assert.deepEqual(current.learning,[]);assert.equal(current.sheet.notes[model.id].private,'Private note stays with my plan');assert.equal(draft.plan.totals.reported,0);assert.equal(draft.plan.totals.confirmed,0);
  console.log('PASS returning untouched draft opens its exact published fallback before rendering');
  const explicit=seed(),chosen=baseline.baselineSelection.conditionalCandidate.rows.find(row=>row.optionId!==baseline.rows.find(item=>item.requirementId===row.requirementId)?.optionId);assert(chosen);explicit.scenarios[model.id]={optionSelections:{[chosen.requirementId]:chosen.optionId}};explicit.courseProgress={private:'in-progress'};
  const preserved=await saved(await open(explicit));assert.deepEqual(preserved.scenarios[model.id].optionSelections,explicit.scenarios[model.id].optionSelections);assert.deepEqual(preserved.sheet.notes,explicit.sheet.notes);assert.deepEqual(preserved.courseProgress,explicit.courseProgress);
  console.log('PASS explicit course pins, notes and progress survive ordinary return');
  const stale=copy(compiled.baselineIndex);stale.revision='baselines-v1:'+'0'.repeat(64);const rejected=await saved(await open(seed(),stale));assert.equal(Object.keys(rejected.scenarios?.[model.id]?.optionSelections||{}).length,0);assert.deepEqual(rejected.learning,[]);
  console.log('PASS a stale baseline checksum never seeds course choices');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('3 reviewed-baseline browser journeys passed; no account writes.');
 }finally{for(const context of contexts)await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
