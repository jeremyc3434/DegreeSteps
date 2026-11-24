/* Real CSV/XLSX uploads through review and next-step navigation, with synthetic private records only.
 * Needs the loopback preview; never invokes optional AI reading. Root runs the browser suite. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),XLSX=require('xlsx');
const S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8158/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const copy=value=>JSON.parse(JSON.stringify(value)),errors=[],aiRequests=[],contexts=[];
let browser,count=0;
function seed(){
 const state=J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(route=>route.id==='liberty-business-residential')),null,catalog);
 state.learning=[{id:'keep-original-english',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',grade:'A',score:null,completedOn:'2025-05-01',evaluations:[{programId:'liberty-business-residential',requirementId:'engl-101',status:'confirmed'}]}];
 state.sheet.notes={private:'Keep my advisor notes and existing degree'};return state;
}
const csv=(name,text)=>({name,mimeType:'text/csv',buffer:Buffer.from(text)});
const headers='Provider,Course code,Course title,Credits,Credit units,Status';
const simpleCourse=()=>csv('new-history.csv',headers+'\nNew College,HIS210,World History II,3,semester,completed');
async function open({from='courses',width=1440,state=seed()}={}){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context);
 await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/portal/transcript-import')aiRequests.push({method:request.method(),url:request.url()});});
 await page.goto(BASE+'import-courses.html?from='+from,{waitUntil:'load'});await page.locator('#import-files').waitFor({state:'attached'});return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const noOverflow=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Only the review table may scroll horizontally');
async function upload(page,file,total){
 await page.locator('#import-files').setInputFiles(file);
 await page.waitForFunction(total=>!document.getElementById('import-files').disabled&&document.querySelectorAll('#import-rows tr[data-course-row]').length===total,total,{timeout:30000});
 assert.equal(await page.locator('#import-error').isVisible(),false);await page.locator('#import-review').waitFor();assert.match(await page.locator('#import-page-title').innerText(),/Review your courses/i);assert.equal(await page.locator('#import-review-summary').locator('#import-selection-help').count(),1);assert.equal(await page.locator('.import-action-bar #import-selection-help,.import-action-bar #import-review-attention').count(),0);
}
async function rowId(page,code){
 const id=await page.locator('#import-rows [data-field="code"]').evaluateAll((nodes,code)=>nodes.find(node=>node.value===code)?.dataset.row,code);assert(id,'The uploaded course '+code+' remains in review');return id;
}
const field=(page,id,name)=>page.locator('[data-row="'+id+'"][data-field="'+name+'"]');
const selected=(page,id)=>page.locator('[data-select="'+id+'"]');
async function save(page){assert(await page.locator('#import-apply').isEnabled());await page.locator('#import-apply').click();await page.locator('#import-success').waitFor();assert.equal(await page.locator('#import-error').isVisible(),false);}
function preserved(next,original){
 assert.equal(next.selectedPathwayId,original.selectedPathwayId,'Review and next-step navigation do not adopt a different degree');
 assert.deepEqual(next.sheet.notes,original.sheet.notes,'Private notes remain intact');
 for(const record of original.learning)assert.deepEqual(next.learning.find(item=>item.id===record.id),record,'The original course facts and evaluations remain intact');
}
async function test(name,run){
 if(process.env.DEGREEPATH_IMPORT_FLOW_CASE&&!new RegExp(process.env.DEGREEPATH_IMPORT_FLOW_CASE).test(name))return;
 const before=contexts.length;try{await run();count++;console.log('PASS '+name);}finally{for(const context of contexts.splice(before))await context.close();}
}
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [320,390,1440])await test('selected review problems explain Add and focus the missing field without changing selections at '+width+'px',async()=>{
  const original=seed(),page=await open({width,state:original});
  await upload(page,csv('review-needed.csv',headers+'\nNew College,BIO210,Biology II,3,semester,completed\nNew College,HIS210,World History II,3,semester,'),2);
  assert.deepEqual(await stored(page),original,'An uploaded preview is not a saved course collection');
  const good=await rowId(page,'BIO210'),missing=await rowId(page,'HIS210');assert(await selected(page,good).isChecked());assert.equal(await selected(page,missing).isChecked(),false);
  await selected(page,missing).check();assert.equal(await page.locator('#import-apply').isEnabled(),false);assert.match(await page.locator('#import-selection-help').innerText(),/selected.*attention/i);
  await page.locator('#import-review-attention').click();assert(await page.locator('#import-attention-only').isChecked());assert(await selected(page,missing).isChecked());
  await page.waitForFunction(id=>document.activeElement?.dataset.row===id&&document.activeElement?.dataset.field==='status',missing);
  await page.locator('#import-attention-only').uncheck();assert(await selected(page,good).isChecked());assert(await selected(page,missing).isChecked());assert.deepEqual(await stored(page),original);
  await page.locator('#import-select-valid').click();assert(await selected(page,good).isChecked());assert.equal(await selected(page,missing).isChecked(),false);await noOverflow(page);
  await save(page);const next=await stored(page);preserved(next,original);assert.equal(next.learning.length,original.learning.length+1);assert.equal(next.learning.find(item=>item.code==='HIS210'),undefined,'An unchecked unresolved row is not imported');await noOverflow(page);
 });
 await test('shared missing original details offer one batch form while populated source quantities and statuses remain unchanged',async()=>{
  const original=seed(),page=await open({width:390,state:original});
  await upload(page,csv('batch-details.csv',headers+'\n,ENG210,Writing II,4,,\n,MAT210,Algebra II,5,,\nExisting College,BIO210,Biology II,3,semester,in-progress'),3);
  assert(await page.locator('#import-batch-details').evaluate(node=>node.open));const known=await rowId(page,'BIO210'),first=await rowId(page,'ENG210');
  assert.equal(await field(page,first,'provider').inputValue(),'');assert.equal(await field(page,first,'creditSystem').inputValue(),'');assert.equal(await field(page,first,'status').inputValue(),'');assert.deepEqual(await stored(page),original);
  await page.locator('#batch-provider').fill('Example Quarter College');await page.locator('#batch-units').selectOption('quarter');await page.locator('#batch-status').selectOption('earned');await page.locator('#import-fill-missing').click();
  assert.equal(await field(page,known,'provider').inputValue(),'Existing College');assert.equal(await field(page,known,'creditSystem').inputValue(),'semester');assert.equal(await field(page,known,'status').inputValue(),'in-progress');assert.equal(await field(page,known,'credits').inputValue(),'3');assert.deepEqual(await stored(page),original,'Batch corrections still need an explicit Add');
  await save(page);const next=await stored(page);preserved(next,original);const records=Object.fromEntries(next.learning.map(record=>[record.code,record]));assert.equal(records.ENG210.credits,4);assert.equal(records.MAT210.credits,5);assert.equal(records.ENG210.creditSystem,'quarter');assert.equal(records.MAT210.creditSystem,'quarter');assert.equal(records.BIO210.status,'in-progress');assert.equal(records.BIO210.creditSystem,'semester');await noOverflow(page);
 });
 await test('My courses upload leads to comparisons while the existing degree, notes and confirmed original record remain intact',async()=>{
  const original=seed(),page=await open({from:'courses',state:original});assert.equal(await page.locator('#import-prior').isVisible(),false);await upload(page,simpleCourse(),1);await save(page);
  assert.equal(await page.locator('#import-next').getAttribute('href'),'compare-plans.html?from=courses');assert.equal(await page.locator('#import-alternative').getAttribute('href'),'plan.html');assert(await page.locator('#import-alternative').isVisible());const afterSave=await stored(page);preserved(afterSave,original);assert.equal(afterSave.learning.length,original.learning.length+1);
  await page.locator('#import-next').click();await page.waitForURL('**/compare-plans.html?from=courses');await page.locator('[data-scenario]').first().waitFor({timeout:60000});preserved(await stored(page),original);assert.deepEqual((await stored(page)).learning,afterSave.learning);await noOverflow(page);
 });
 await test('plan-origin upload retains its direct plan return and offers an optional comparison',async()=>{
  const original=seed(),page=await open({from:'plan',state:original});assert.equal(await page.locator('#import-back').getAttribute('href'),'plan.html');await upload(page,simpleCourse(),1);await save(page);
  assert.equal(await page.locator('#import-next').getAttribute('href'),'plan.html');assert.equal(await page.locator('#import-alternative').getAttribute('href'),'compare-plans.html?from=courses');assert(await page.locator('#import-alternative').isVisible());const afterSave=await stored(page);preserved(afterSave,original);
  await page.locator('#import-next').click();await page.waitForURL('**/plan.html');await page.locator('tr.course-plan-row').first().waitFor({timeout:60000});preserved(await stored(page),original);assert.deepEqual((await stored(page)).learning,afterSave.learning);
 });
 await test('an actual XLSX upload returns to credit matches and retains original quarter, in-progress and saved facts',async()=>{
  const original=seed(),page=await open({from:'credits-worth',width:390,state:original});assert.equal(await page.locator('#import-prior').isVisible(),false);assert.equal(await page.locator('#import-back').getAttribute('href'),'credits-worth.html');
  await page.locator('#import-back').click();await page.waitForURL('**/credits-worth.html');await page.locator('#cw-record-list>*').first().waitFor();preserved(await stored(page),original);
  await page.goto(BASE+'import-courses.html?from=credits-worth',{waitUntil:'load'});
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Provider','Course code','Course title','Credits','Credit units','Status'],['New Quarter College','HIS210','World History II',4,'quarter','in-progress'],['Sophia','SOPH-0030','English Composition II',3,'semester','saved']]),'My courses');
  await upload(page,{name:'my-courses.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})},2);assert.equal((await stored(page)).learning.length,original.learning.length);await save(page);
  assert.equal(await page.locator('#import-next').getAttribute('href'),'credits-worth.html');assert.equal(await page.locator('#import-alternative').getAttribute('href'),'compare-plans.html?from=courses');const afterSave=await stored(page);preserved(afterSave,original);const history=afterSave.learning.find(record=>record.code==='HIS210'),interest=afterSave.learning.find(record=>record.code==='SOPH-0030');assert.equal(history.credits,4);assert.equal(history.creditSystem,'quarter');assert.equal(history.status,'in-progress');assert.equal(interest.status,'saved');assert.deepEqual(history.evaluations,[]);assert.deepEqual(interest.evaluations,[]);
  await page.locator('#import-next').click();await page.waitForURL('**/credits-worth.html');await page.locator('#cw-record-list>*').first().waitFor();preserved(await stored(page),original);assert.deepEqual((await stored(page)).learning,afterSave.learning);await noOverflow(page);
 });
 await test('a stale upload preview requires a fresh explicit Add and retains the concurrent course',async()=>{
  const original=seed(),page=await open({state:original});await upload(page,simpleCourse(),1);const concurrent=copy(original);concurrent.learning.push({id:'another-tab-course',provider:'Another College',code:'ART210',title:'Art History II',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:concurrent});
  await page.locator('#import-apply').click();await page.locator('#import-error').waitFor();assert(await page.locator('#import-review').isVisible());assert.equal(await page.locator('#import-success').isVisible(),false);assert.deepEqual(await stored(page),concurrent,'A stale review cannot overwrite a record added in another tab');
  await save(page);const next=await stored(page);preserved(next,concurrent);assert.equal(next.learning.length,concurrent.learning.length+1);
 });
 await test('a changed version of a saved course cannot overwrite its facts, credit quantity or school evaluation',async()=>{
  const original=seed(),page=await open({state:original});await upload(page,csv('conflicting-course.csv',headers+',Grade\nSophia,SOPH-0015,English Composition I,4,semester,completed,B\nNew College,HIS210,World History II,3,semester,completed,A'),2);
  assert.equal(await page.locator('#import-apply').isEnabled(),false);assert(await page.locator('#import-skip-conflicts').isVisible());assert.deepEqual(await stored(page),original);
  await page.locator('#import-skip-conflicts').click();await save(page);const next=await stored(page);preserved(next,original);assert.equal(next.learning.length,original.learning.length+1);assert.equal(next.learning.filter(record=>record.provider==='Sophia'&&record.code==='SOPH-0015').length,1);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(aiRequests,[],'Native CSV/XLSX uploads never call the optional transcript AI service');console.log(count+' import-course flow browser checks passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
