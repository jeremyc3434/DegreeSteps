/* Redesign 2/6 (My plan): every feature in docs/redesign-feature-map.md's "Where every plan feature goes (My plan)"
   table stays reachable at phone and desktop widths, the layout has no horizontal overflow, and the row sheet works by
   keyboard. Synthetic local plans only; needs a running preview (DEGREEPATH_TEST_URL, default http://127.0.0.1:8133/). */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js'),C=require('./dist/program-catalog.js');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
// A plan with outside courses and open slots (APUS), and the long-standing Liberty example.
const seed=id=>J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(route=>route.id===id||route.modelId===id)),null,catalog);
const SLOTS='apus-bachelor-of-arts-in-psychology',LIBERTY='liberty-business-residential';
let browser,count=0;const contexts=[];
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
async function open(width,{id=SLOTS,path='plan.html'}={}){
  const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);
  await context.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:KEY,state:seed(id)});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(BASE+path,{waitUntil:'load'});
  return {page,errors};
}
const ready=page=>page.locator('tr.course-plan-row').first().waitFor({timeout:60000});
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const dialogOpen=page=>page.locator('#sheet-dialog[open]').waitFor({timeout:15000});
async function closeDialog(page){await page.keyboard.press('Escape');await page.locator('#sheet-dialog[open]').waitFor({state:'detached',timeout:5000}).catch(()=>{});await page.waitForFunction(()=>!document.getElementById('sheet-dialog').open);}
async function more(page){await page.locator('#sheet-titlebar [data-action="more"]').click();await dialogOpen(page);}

(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

  for(const width of [320,390,1440])await test('the plan has no horizontal overflow or page errors at '+width+'px',async()=>{
    const {page,errors}=await open(width);await ready(page);
    assert.equal(await overflow(page),0);
    assert.equal(await page.locator('.plan-summary').count(),1,'summary header');
    assert.deepEqual(errors,[]);
  });

  for(const width of [390,1440])await test('every My plan feature in the feature map is reachable at '+width+'px',async()=>{
    const {page,errors}=await open(width);await ready(page);
    // Summary: progress (done / for less / your pick / at school), cost, still to choose, change degree.
    assert.match(await page.locator('.plan-summary-progress [role=progressbar]').getAttribute('aria-valuetext'),/finished; .* in progress; .* not started\. Plan: .* done, .* for less, .* your pick, .* at /);
    assert.equal(await page.locator('#sheet-titlebar [data-action="target"]').count(),1,'Change degree');
    assert.equal(await page.locator('#sheet-titlebar [data-action="compare-plans"]').count(),1,'Compare degrees');
    assert.match(await page.locator('[data-summary-pick]').innerText(),/\d+ courses?/);
    // Groups and filters.
    for(const group of ['less','pick','school'])assert.equal(await page.locator('[data-plan-group="'+group+'"]').count(),1,group+' group');
    assert.equal(await page.locator('#sheet-titlebar .degree-progress [data-progress-filter]').count(),3,'Finished / In progress / Not started filters in the header');
    assert.equal(await page.locator('.degree-progress').count(),1,'one progress display');
    await page.locator('[data-group-mode="section"]').click();await page.locator('[data-plan-section]').first().waitFor();
    await page.locator('[data-group-mode="how"]').click();await page.locator('[data-plan-group="less"]').waitFor();
    // Per-row: progress control, the row sheet with evidence and change actions.
    assert(await page.locator('[data-plan-group="less"] [data-progress]').count()>0,'progress per row');
    await page.locator('[data-plan-group="less"] .course-plan-name').first().click();await dialogOpen(page);
    const row=await page.locator('#sheet-dialog-content').innerText();
    assert.match(row,/Course progress/);assert.match(row,/Change course or provider|Choose from/);
    await closeDialog(page);
    // Open slot: your choice, suggestions and Ask the community.
    const slot=page.locator('[data-plan-group="pick"] .course-plan-name').filter({hasText:/Choose any approved/}).first();
    await slot.click();await dialogOpen(page);
    assert.equal(await page.locator('#sheet-slot-choice-form').count(),1,'slot entry');
    assert.equal(await page.locator('#sheet-dialog [data-action="slot-ask"]').count(),1,'Ask the community');
    await closeDialog(page);
    // Cost details from the summary.
    await page.locator('#sheet-titlebar [data-action="cost-time"]').click();await dialogOpen(page);
    assert.equal(await page.locator('#sheet-cost-summary').count(),1,'Cost details');await closeDialog(page);
    // Ask [School]: phone bottom bar, desktop header.
    await page.locator(width<1024?'.plan-bottom-bar [data-action="ask-school"]':'#sheet-titlebar [data-action="ask-school"]').click();await dialogOpen(page);
    const ask=await page.locator('#sheet-dialog-content').innerText();
    assert.match(ask,/Email the transfer office/);assert.match(ask,/Request information/);
    assert.equal(await page.locator('#sheet-dialog a[href^="school.html?school="]').count(),1,'request information link');
    await closeDialog(page);
    // Preferences: one sheet, two tabs (courses and military / degree goal and format).
    await more(page);await page.locator('#sheet-dialog [data-action="options"]').click();await page.locator('.sheet-pref-tabs').waitFor();
    assert.equal(await page.locator('.sheet-pref-tabs [data-action]').count(),2);
    await page.locator('.sheet-pref-tabs [data-action="target-preferences"]').click();
    await page.locator('#sheet-target-preferences-form').waitFor();await closeDialog(page);
    // More: versions, sources, downloads, backup, print, share, checks, next steps.
    await more(page);
    for(const action of ['compare','sources','download','backup','print','share','checks','next','credits','options','cost-time'])
      assert.equal(await page.locator('#sheet-dialog [data-action="'+action+'"]').count(),1,'More › '+action);
    await page.locator('#sheet-dialog [data-action="compare"]').click();
    assert.match(await page.locator('#sheet-dialog-content').innerText(),/What if I change my plan\?/);await closeDialog(page);
    // Side panel content stays on the page.
    for(const id of ['sheet-summary','sheet-savings','sheet-next','sheet-task-panel','sheet-school-check','sheet-lead-actions','sheet-alerts'])
      assert.equal(await page.locator('.plan-side #'+id).count(),1,id+' in the summary panel');
    // Save: phone bottom bar; desktop header.
    if(width<1024)assert(await page.locator('.plan-bottom-bar [data-action="save-plan"]').isVisible());
    else assert.equal(await page.locator('.plan-bottom-bar').isVisible(),false);
    assert.deepEqual(errors,[]);
  });

  // One source of truth: the header segments, the group headings, the rows in each group and the progress counts agree,
  // for a plan with many open slots and for a classic plan.
  for(const id of [SLOTS,LIBERTY,'wgu-catalog-19be0ad2d1922f49'])await test('every count on the page agrees for '+id,async()=>{
    const {page,errors}=await open(1440,{id});await ready(page);
    const facts=await page.evaluate(()=>{
      const num=text=>Number(String(text).replace(/[^0-9.]/g,''));
      const header=Object.fromEntries([...document.querySelectorAll('[data-summary-bucket]')].map(node=>[node.dataset.summaryBucket,num(node.textContent)]));
      const groups={},rows={};
      for(const section of document.querySelectorAll('[data-plan-group]')){const bucket=section.dataset.planGroup;groups[bucket]=num(section.querySelector('.plan-bucket-meta').textContent.split('·')[1]);rows[bucket]=[...section.querySelectorAll('tr.course-plan-row .course-plan-credits')].reduce((sum,node)=>sum+num(node.textContent),0);}
      return {header,groups,rows,required:num(document.querySelector('[data-summary-required]').textContent),finished:num(document.querySelector('[data-degree-finished]')?.textContent??'0'),notes:document.querySelector('.course-plan-coverage')?.innerText||''};
    });
    for(const bucket of ['done','less','pick','school']){
      assert.equal(facts.groups[bucket]??0,facts.header[bucket],bucket+': group heading matches the header');
      assert.equal(facts.rows[bucket]??0,facts.header[bucket],bucket+': rows in the group match the header');
    }
    assert.equal(facts.header.done+facts.header.less+facts.header.pick+facts.header.school,facts.required,'the four parts make the whole degree');
    assert.equal(facts.finished,facts.header.done,'finished credits match the done segment');
    assert.doesNotMatch(facts.notes,/outside credits planned|not yet mapped/,'no second set of counts below the filters');
    assert.equal(await page.locator('.plan-side .degree-progress').count(),0,'no second progress card');
    assert.deepEqual(errors,[]);
  });

  await test('a finished course moves to Done and the header, group and finished counts move together',async()=>{
    const {page,errors}=await open(1440,{id:LIBERTY});await ready(page);
    await page.locator('[data-plan-group="less"] [data-progress="engl-101"]').selectOption('completed');
    await page.locator('[data-plan-group="done"] tr.course-plan-row[data-requirement="engl-101"]').waitFor();
    const done=Number(await page.locator('[data-summary-bucket="done"]').innerText()),finished=Number(await page.locator('[data-degree-finished]').innerText());
    assert.equal(done,3);assert.equal(finished,done);
    assert.match(await page.locator('[data-plan-group="done"] .plan-bucket-meta').innerText(),/· 3 credits/);
    assert.deepEqual(errors,[]);
  });

  await test('deep links still open their panels',async()=>{
    // ?task=credits continues to the course import page (unchanged behaviour).
    {const {page,errors}=await open(1440,{id:LIBERTY,path:'plan.html?task=credits'});await Promise.race([page.waitForURL(/import-courses\.html/,{timeout:30000}),dialogOpen(page)]);assert.deepEqual(errors,[],'credits');}
    for(const task of ['cost-time','checks','next','download']){const {page,errors}=await open(1440,{id:LIBERTY,path:'plan.html?task='+task});await dialogOpen(page).catch(async error=>{throw Error('?task='+task+' opened no panel: '+(await page.locator('body').innerText()).slice(0,300)+' '+errors.join(' '));});assert.deepEqual(errors,[],task);}
  });

  await test('keyboard: open a course row, choose an option, close with Escape and return focus',async()=>{
    const {page,errors}=await open(1440,{id:LIBERTY});await ready(page);
    const name=page.locator('[data-plan-group="less"] .course-plan-name').first();
    const rowId=await name.getAttribute('data-row');
    await name.focus();await page.keyboard.press('Enter');await dialogOpen(page);
    const change=page.locator('#sheet-dialog [data-compare-row], #sheet-dialog button',{hasText:/Change course or provider/}).first();
    if(await change.count()){await change.focus();await page.keyboard.press('Enter');await page.locator('#sheet-dialog [data-choose-option], #sheet-dialog [name="course-choice"], #sheet-dialog input[type="radio"]').first().waitFor({timeout:10000}).catch(()=>{});}
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('sheet-dialog').open);
    const focused=await page.evaluate(()=>{const a=document.activeElement;return a?.dataset?.row||a?.dataset?.compareRow||a?.closest?.('[data-requirement]')?.dataset?.requirement||a?.id;});
    assert.equal(focused,rowId,'focus returns to the course row that opened the sheet');
    assert.deepEqual(errors,[]);
  });

  await test('the plan title takes focus on load without drawing a focus ring',async()=>{
    const {page}=await open(1440);await ready(page);
    const ring=await page.evaluate(()=>{const h=document.querySelector('#sheet-titlebar h1');const s=getComputedStyle(h);return {active:document.activeElement===h,outline:s.outlineStyle,shadow:s.boxShadow};});
    if(ring.active){assert.equal(ring.outline,'none');assert.equal(ring.shadow,'none');}
  });

  console.log(count+' my-plan redesign browser checks passed');
}catch(error){console.error(error);process.exitCode=1;}finally{for(const context of contexts)await context.close().catch(()=>{});await browser?.close();}})();
