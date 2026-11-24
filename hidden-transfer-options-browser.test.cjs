/* Real Liberty course-choice journeys; negative options exist only in local browser fixtures. */
'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const C=require('./dist/program-catalog.js'),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3',PROVIDER='Christian Leaders Institute';
const registry=require('./dist/data/curriculum-registry.json');
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
function fixture(model,receivingCode){
 const route=catalog.pathways.find(item=>item.modelId===model.id),requirement=model.requirements.find(item=>item.code===receivingCode);
 assert(route,'The real Liberty route must remain registered: '+model.id);assert(requirement,'The named receiving requirement must exist: '+receivingCode);
 const choice=requirement.options.find(option=>option.provider===PROVIDER),native=requirement.options.find(option=>option.provider==='University');
 assert(choice&&native,'The requirement needs its actual CLI alternative and university baseline');
 C.validateModel(model,registry.models.find(entry=>entry.id===model.id)||{id:model.id,school:model.school});
 assert.equal(C.modelReadiness(model).available,true);
 return {model,route,requirement,choice,native};
}
const campus=fixture(require('./dist/data/liberty.json'),'BIBL 105');
const online=fixture(require('./dist/data/curricula/liberty.json').models.find(model=>model.id==='curriculum-liberty-psychology-bs-online'),'THEO 104');
// Wrong credit quantities fail the model loader. These valid local options test
// the separate institutional-only and exact receiving-course display gates.
const negativeModel=structuredClone(campus.model);
const locked=negativeModel.requirements.find(req=>req.institutionalOnly&&req.code&&req.credits>0);
const different=negativeModel.requirements.find(req=>!req.institutionalOnly&&req.code&&req.id!==campus.requirement.id&&req.credits>0&&req.options.some(option=>option.provider==='University'));
assert(locked&&different,'The campus fixture needs distinct requirements for the negative cases');
locked.options.push({...structuredClone(campus.choice),id:'fixture-cli-institution-only',receivingCode:locked.code,credits:locked.credits});
different.options=[...different.options.filter(option=>option.provider==='University'),{...structuredClone(campus.choice),id:'fixture-cli-wrong-receiving-code',receivingCode:'WRONG 100',credits:different.credits}];
const negative={...fixture(negativeModel,'BIBL 105'),override:true};
function seed(config=campus,{providers=[],allowConditional=false}={}){
 let state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),config.route),null,catalog);
 state.profile={...state.profile,goal:'any-degree',degreeLevel:'bachelor',modality:config.route.modalities[0],classroomImportance:'open'};
 state.scenarios={...state.scenarios,[config.model.id]:{...S.scenario(state,config.model.id),providers,allowConditional,useWaivers:false,reportCatalogYear:'2026-2027',optionSelections:{[config.requirement.id]:config.native.id}}};
 state.learning=[{id:'private-unknown-course',provider:'My previous provider',code:'PRIVATE 100',title:'Keep my original course details',credits:null,creditSystem:null,status:'saved',evaluations:[]}];
 state.sheet.notes={private:'Keep this private note'};
 return state;
}
let browser,checks=0;const contexts=[],errors=[];
async function open(config=campus,state=seed(config),width=390,path='plan.html'){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 if(config.override){
  await context.route('**/data/liberty.json',request=>request.fulfill({json:config.model}));
  await context.route('**/data/publication-index.json',request=>{const data=structuredClone(require('./dist/data/publication-index.json')),entry=data.plans.find(item=>item.modelId===config.model.id);assert(entry,'The negative fixture must update its real publication binding');entry.modelFingerprint=C.publicationModelFingerprint(config.model,config.route.level);return request.fulfill({json:data});});
 }
 await context.route('**/data/course-catalog.json*',request=>request.fulfill({json:{version:1,courses:[],sources:[]}}));
 await context.route('**/data/curriculum-course-index.json*',request=>request.fulfill({json:{version:1,courses:[],sources:[]}}));
 await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+path,{waitUntil:'networkidle'});
 try{await row(page,config.requirement.id).waitFor({timeout:20000});}
 catch(error){throw Error(error.message+'\nBrowser page errors: '+JSON.stringify(errors)+'\nPage text: '+(await page.locator('body').innerText()).slice(0,6500));}
 return page;
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const row=(page,id)=>page.locator('tr.course-plan-row[data-requirement="'+id+'"]');
async function details(page,id){await row(page,id).locator('[data-row="'+id+'"]').first().click();await page.locator('#sheet-dialog[open]').waitFor();return page.locator('#sheet-dialog-content');}
async function close(page){await page.locator('#close-sheet-dialog').click();await page.locator('#sheet-dialog').waitFor({state:'hidden'});}
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const config of [campus,online])await test('actual '+config.requirement.code+' option can be found, enabled and selected with its exact '+config.choice.credits+'-credit award',async()=>{
  const id=config.requirement.id,optionId=config.choice.id,modelId=config.model.id,initial=seed(config),page=await open(config,initial),dialog=await details(page,id),hint=dialog.locator('[data-hidden-transfer-options]');
  await hint.waitFor();assert.match(await hint.innerText(),/Some course sources and conditional transfer matches are off/);
  assert.equal(await dialog.locator('[data-preview-row][data-option="'+optionId+'"]').count(),0);
  await hint.getByRole('button',{name:'Course preferences',exact:true}).click();
  const form=page.locator('#sheet-options-form');await form.waitFor();
  assert.equal(await form.locator('[name=providers][value="'+PROVIDER+'"]').isChecked(),false);assert.equal(await form.locator('[name=allowConditional]').isChecked(),false);
  await form.locator('[name=providers][value="'+PROVIDER+'"]').check();await form.locator('[name=allowConditional]').check();
  await form.getByRole('button',{name:'Apply preferences',exact:true}).click();await page.locator('#sheet-dialog').waitFor({state:'hidden'});
  const enabled=await saved(page);assert.equal(enabled.scenarios[modelId].optionSelections[id],config.native.id,'Enabling a source preserves the explicit university baseline');
  assert.equal(J.buildDraft(enabled,catalog,[config.model]).plan.rows.find(item=>item.requirementId===id).option.provider,'University');
  assert.match(await row(page,id).innerText(),/University|Liberty/);assert.deepEqual(enabled.learning,initial.learning);assert.deepEqual(enabled.sheet.notes,initial.sheet.notes);
  await row(page,id).locator('[data-compare-row="'+id+'"]').click();
  const pick=page.locator('[data-preview-row="'+id+'"][data-option="'+optionId+'"]');await pick.waitFor();
  assert.equal(await page.locator('#sheet-dialog-content [data-hidden-transfer-options]').count(),0,'Both preferences enabled exposes the option without a hidden-options invitation');
  assert.match(await pick.innerText(),new RegExp(config.choice.credits+' credits'));assert.doesNotMatch(await pick.innerText(),/3 credits/);
  await pick.click();await page.locator('[data-preview-row="'+id+'"][data-option="'+optionId+'"][aria-pressed=true]').waitFor();
  assert.equal((await saved(page)).scenarios[modelId].optionSelections[id],config.native.id,'Preview is not a saved selection');
  await page.locator('[data-apply-course="'+id+'"][data-option="'+optionId+'"]').click();await close(page);
  const selected=await saved(page),choice=J.buildDraft(selected,catalog,[config.model]).plan.rows.find(item=>item.requirementId===id).option;
  assert.equal(selected.scenarios[modelId].optionSelections[id],optionId);assert.equal(choice.credits,config.choice.credits);assert.equal(choice.providerListedCreditQuantity,3);assert.equal(choice.sourceCredits,undefined);assert.equal(choice.sourceCreditSystem,undefined);assert.equal(choice.sourceCreditStatus,'unknown');
  assert.equal((await row(page,id).locator('.course-plan-credits').innerText()).trim(),String(config.choice.credits));assert.deepEqual(selected.learning,initial.learning);assert.deepEqual(selected.sheet.notes,initial.sheet.notes);
  await row(page,id).locator('[data-progress="'+id+'"]').selectOption('in-progress');
  await page.waitForFunction(()=>/original credits|original source credits/.test(document.querySelector('#sheet-status').textContent));
  assert.deepEqual((await saved(page)).learning,initial.learning,'A receiving award never creates original source credits when they are unknown');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The disclosure and controls fit the phone viewport');
 });
 for(const [name,settings]of [['source off',{providers:[],allowConditional:true}],['conditional matches off',{providers:[PROVIDER],allowConditional:false}]])await test('course comparison explains hidden options when '+name,async()=>{
  const id=campus.requirement.id,initial=seed(campus,settings),page=await open(campus,initial,1440,'plan.html?compare='+encodeURIComponent(id));
  const dialog=page.locator('#sheet-dialog-content');await dialog.locator('[data-hidden-transfer-options]').waitFor();
  const reason=await dialog.locator('[data-hidden-transfer-options] p').innerText();
  if(name==='source off'){assert.match(reason,/Some course sources are off/);assert.doesNotMatch(reason,/conditional transfer matches are off/i);}
  else{assert.match(reason,/Conditional transfer matches are off/);assert.doesNotMatch(reason,/Some course sources/i);}
  assert(await dialog.locator('[data-hidden-transfer-options]').getByRole('button',{name:'Course preferences',exact:true}).isVisible());assert.equal(await dialog.locator('[data-preview-row][data-option="'+campus.choice.id+'"]').count(),0);
  assert.equal((await saved(page)).scenarios[campus.model.id].optionSelections[id],campus.native.id);assert.deepEqual((await saved(page)).learning,initial.learning);
 });
 await test('university-only and wrong receiving-course alternatives never produce a hidden-options invitation',async()=>{
  const page=await open(negative);
  for(const id of [locked.id,different.id]){const dialog=await details(page,id);assert.equal(await dialog.locator('[data-hidden-transfer-options]').count(),0,id+' has no eligible hidden named alternative');await close(page);}
 });
 assert.deepEqual(errors,[]);console.log(checks+' hidden-transfer-option browser checks passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
