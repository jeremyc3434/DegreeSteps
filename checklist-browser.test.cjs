/* Consumer checklist journeys against local shipped assets. Synthetic records only. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const Programs = require('./dist/program-catalog.js');
const {mountOfflineSite} = require('./test-support/offline-site.cjs');
const catalog = Programs.attachRegistry(Programs.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8133/').replace(/\/?$/,'/');
const KEY = 'degreepath-guide-v3', SCOPE = 'tesu-general-management';
const contexts = [], errors = [];
let browser, count = 0;

function seed() {
  let state = Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(item=>item.id===SCOPE));
  state = Journey.initialize(state,null,catalog);
  state.profile = {...state.profile,hasPrior:'none',modality:'online'};
  state.journey.completed = true;
  state.sheet.notes = {[SCOPE]:{enc1010:'Private advisor note must survive task changes'}};
  return state;
}
async function page(state=seed(),width=1440) {
  const context = await browser.newContext({viewport:{width,height:1000}});
  contexts.push(context);
  await mountOfflineSite(context,{origin:new URL(BASE).origin});
  await context.addInitScript(({key,value})=>{
    if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(value));
  },{key:KEY,value:state});
  const p = await context.newPage();
  p.on('pageerror',error=>errors.push(error.message));
  await p.goto(BASE+'plan.html',{waitUntil:'networkidle'});
  await ready(p);
  return p;
}
const home = p => p.locator('#sheet-home .student-checklist');
const saved = p => p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const item = (p,id) => home(p).locator('[data-dc-task="'+id+'"]');
async function ready(p) {
  await home(p).locator('.dc-next').waitFor();
  await p.locator('tr.course-plan-row').first().waitFor();
}
async function openDetails(locator) {
  if (await locator.getAttribute('open') === null) await locator.locator(':scope > summary').click();
}
async function checklist(p) {await openDetails(home(p).locator('[data-dc-open="checklist"]'));}
async function reveal(p,id,edit=false) {
  await checklist(p);
  const task = item(p,id);
  const group = await task.getAttribute('data-dc-group');
  await openDetails(home(p).locator('[data-dc-open="group:'+group+'"]'));
  if (await task.getAttribute('data-status') === 'done') await openDetails(home(p).locator('[data-dc-open="done:'+group+'"]'));
  if (edit) await openDetails(task.locator('.dc-task-details'));
  return task;
}
async function waitStatus(p,id,status) {
  await p.waitForFunction(({key,scope,id,status})=>{
    const state=JSON.parse(localStorage.getItem(key));
    return state.checklist?.plans?.[scope]?.items?.[id]?.status === status;
  },{key:KEY,scope:SCOPE,id,status});
}
async function test(name,run) {
  if (process.env.DEGREEPATH_CHECKLIST_CASE && !new RegExp(process.env.DEGREEPATH_CHECKLIST_CASE).test(name)) return;
  const before = contexts.length;
  try {await run();count++;console.log('PASS '+name);}
  finally {for (const context of contexts.splice(before)) await context.close();}
}

(async()=>{try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});

  await test('the default stays compact and the checklist opens from its keyboard summary',async()=>{
    const p=await page(),panel=home(p).locator('[data-dc-open="checklist"]');
    assert(await home(p).locator('.dc-next').isVisible());
    assert.equal(await panel.getAttribute('open'),null);
    assert.equal(await home(p).locator('input[type=checkbox]:visible').count(),0);
    assert(await p.locator('tr.course-plan-row').first().isVisible());
    await p.screenshot({path:'/tmp/degreepath-checklist-desktop.png'});
    await panel.locator(':scope > summary').focus();
    await p.keyboard.press('Enter');
    assert.notEqual(await panel.getAttribute('open'),null);
    assert(await item(p,'review-plan').locator('[data-dc-check]').isVisible());
    assert.equal(await home(p).locator('[data-dc-open="group:courses"]').getAttribute('open'),null);
    const progress=home(p).getByRole('progressbar',{name:'Checklist progress'});
    assert(Number(await progress.getAttribute('max'))>0);
  });

  await test('a checkbox can be checked and undone using the keyboard without changing academic records',async()=>{
    const p=await page(),before=await saved(p);
    let task=await reveal(p,'review-plan');
    await task.locator('[data-dc-check]').focus();
    await p.keyboard.press('Space');
    await waitStatus(p,'review-plan','done');
    task=await reveal(p,'review-plan');
    assert(await task.locator('[data-dc-check]').isChecked());
    await task.locator('[data-dc-check]').focus();
    await p.keyboard.press('Space');
    await waitStatus(p,'review-plan','todo');
    assert.equal(await item(p,'review-plan').getAttribute('data-status'),'todo');
    const after=await saved(p);
    assert.deepEqual(after.learning,before.learning);
    assert.deepEqual(after.scenarios,before.scenarios);
    assert.deepEqual(after.sheet.notes,before.sheet.notes);
  });

  await test('Waiting, due dates and private notes survive reload and display as text',async()=>{
    const p=await page(),notes='Advisor says <img src=x onerror="window.__checklistXss=true"> & wait for the transcript.';
    const task=await reveal(p,'request-school-feedback',true),form=task.locator('[data-dc-edit]');
    await form.getByRole('combobox',{name:'Status',exact:true}).selectOption('waiting');
    await form.locator('[name=dueOn]').fill('2028-02-29');
    await form.locator('[name=notes]').fill(notes);
    await form.getByRole('button',{name:'Save changes',exact:true}).click();
    await waitStatus(p,'request-school-feedback','waiting');
    await p.reload({waitUntil:'networkidle'});await ready(p);
    const restored=await reveal(p,'request-school-feedback',true);
    assert.equal(await restored.getAttribute('data-status'),'waiting');
    assert.equal(await restored.locator('[name=dueOn]').inputValue(),'2028-02-29');
    assert.equal(await restored.locator('[name=notes]').inputValue(),notes);
    assert.equal(await restored.locator('time').getAttribute('datetime'),'2028-02-29');
    assert.equal(await home(p).locator('img').count(),0);
    assert.equal(await p.evaluate(()=>window.__checklistXss),undefined);
    assert.equal((await saved(p)).learning.length,0);
  });

  await test('a custom task can be added, edited, deleted and reloaded',async()=>{
    const p=await page();await checklist(p);
    const add=home(p).locator('[data-dc-add]');
    await add.getByLabel('Task',{exact:true}).fill('Ask about evening classes <draft>');
    await openDetails(add.locator('[data-dc-open="add-options"]'));
    await add.locator('[name=dueOn]').fill('2028-03-01');
    await add.locator('[name=notes]').fill('Private work and family schedule');
    await add.getByRole('button',{name:'Add task',exact:true}).click();
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).checklist?.plans?.['tesu-general-management']?.custom?.length===1,KEY);
    let state=await saved(p),id=state.checklist.plans[SCOPE].custom[0].id;
    await p.reload({waitUntil:'networkidle'});await ready(p);
    let task=await reveal(p,id,true);
    assert.equal(await task.locator('[name=title]').inputValue(),'Ask about evening classes <draft>');
    assert.equal(await task.locator('[name=dueOn]').inputValue(),'2028-03-01');
    assert.equal(await task.locator('[name=notes]').inputValue(),'Private work and family schedule');
    await task.locator('[name=title]').fill('Check evening registration');
    await task.locator('[name=status]').selectOption('doing');
    await task.locator('[name=dueOn]').fill('');
    await task.locator('[name=notes]').fill('Call after work');
    await task.getByRole('button',{name:'Save changes',exact:true}).click();
    await p.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).checklist?.plans?.['tesu-general-management']?.custom?.some(task=>task.id===id&&task.title==='Check evening registration'&&task.status==='doing'),{key:KEY,id});
    await p.reload({waitUntil:'networkidle'});await ready(p);
    task=await reveal(p,id,true);
    assert.equal(await task.locator('[name=title]').inputValue(),'Check evening registration');
    assert.equal(await task.locator('[name=status]').inputValue(),'doing');
    assert.equal(await task.locator('[name=dueOn]').inputValue(),'');
    assert.equal(await task.locator('[name=notes]').inputValue(),'Call after work');
    await task.getByRole('button',{name:'Delete task',exact:true}).click();
    await p.waitForFunction(({key,id})=>!JSON.parse(localStorage.getItem(key)).checklist?.plans?.['tesu-general-management']?.custom?.some(task=>task.id===id),{key:KEY,id});
    await p.reload({waitUntil:'networkidle'});await ready(p);await checklist(p);
    assert.equal(await item(p,id).count(),0);
    assert.deepEqual((await saved(p)).checklist.plans[SCOPE].custom,[]);
  });

  await test('task links are safe, resolve local pages and open the existing course progress form',async()=>{
    const p=await page();await checklist(p);
    const hrefs=await home(p).locator('a[href]').evaluateAll(links=>[...new Set(links.map(link=>link.getAttribute('href')))]);
    assert(hrefs.length>0);
    for (const href of hrefs) {
      const url=new URL(href,BASE);
      assert(['http:','https:'].includes(url.protocol));
      assert.equal(url.username,'');assert.equal(url.password,'');
      if (url.origin===new URL(BASE).origin) {
        assert.match(url.pathname,/\/(?:plan|portal|courses)\.html$/);
        assert.equal(await p.evaluate(async href=>(await fetch(href)).status,href),200);
      } else assert.equal(url.protocol,'https:');
    }
    await openDetails(home(p).locator('[data-dc-open="group:courses"]'));
    const course=home(p).locator('[data-dc-group="courses"]').first();
    assert.equal(await course.locator('[data-dc-check]').count(),0);
    const href=await course.getByRole('link',{name:'Update progress',exact:true}).getAttribute('href');
    assert(new URL(href,BASE).searchParams.get('course'));
    await course.getByRole('link',{name:'Update progress',exact:true}).click();
    await p.waitForURL('**/plan.html?course=*');
    await p.locator('#sheet-dialog').waitFor({state:'visible'});
    assert(await p.locator('#sheet-dialog [data-progress]').count()>0 || await p.locator('#sheet-dialog [data-complete]').count()>0);
    assert.equal((await saved(p)).learning.length,0);
    await p.locator('#sheet-dialog [data-progress]').selectOption('in-progress');
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).learning.some(item=>item.status==='in-progress'),KEY);
    await p.locator('#sheet-dialog [data-progress]').selectOption('completed');
    await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).learning.some(item=>item.status==='earned'),KEY);
    assert.match(await p.locator('#sheet-dialog').innerText(),/School evaluation pending/);
    assert((await saved(p)).learning.every(record=>!(record.evaluations||[]).some(item=>item.status==='confirmed')));
    await p.locator('#close-sheet-dialog').click();
    await checklist(p);
    await openDetails(home(p).locator('[data-dc-open="group:courses"]'));
    assert(await home(p).locator('[data-dc-group="courses"][data-status="done"]').count()>0);
  });

  await test('expanded tasks and editors fit 320px and 390px phones without page overflow',async()=>{
    for (const width of [320,390]) {
      const p=await page(seed(),width);
      await reveal(p,'request-school-feedback',true);
      await openDetails(home(p).locator('[data-dc-open="group:courses"]'));
      const add=home(p).locator('[data-dc-add]');
      await openDetails(add.locator('[data-dc-open="add-options"]'));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:'/tmp/degreepath-checklist-mobile-'+width+'.png'});
      const overflow=await home(p).locator('input:visible, select:visible, textarea:visible, button:visible, a:visible').evaluateAll(nodes=>nodes.filter(node=>{
        const box=node.getBoundingClientRect();return box.x < -1 || box.right > innerWidth+1;
      }).map(node=>node.getAttribute('name')||node.textContent.trim()));
      assert.deepEqual(overflow,[]);
      assert((await home(p).locator('.dc-next-button').boundingBox()).height>=44);
      assert((await item(p,'request-school-feedback').getByRole('button',{name:'Save changes',exact:true}).boundingBox()).height>=44);
    }
  });

  await test('a task change keeps checklist edits saved by another tab',async()=>{
    const p=await page();await reveal(p,'review-plan');
    await p.evaluate(({key,scope})=>{
      const state=JSON.parse(localStorage.getItem(key));
      state.checklist ||= {version:1,plans:{}};
      const plan=state.checklist.plans[scope] ||= {items:{},custom:[],nextId:1};
      plan.custom.push({id:'custom-99',title:'Task added in another tab',status:'waiting',dueOn:'2028-03-01',notes:'Keep concurrent checklist note'});
      plan.nextId=100;
      localStorage.setItem(key,JSON.stringify(state));
    },{key:KEY,scope:SCOPE});
    await item(p,'review-plan').locator('[data-dc-check]').check();
    await waitStatus(p,'review-plan','done');
    const current=await saved(p),concurrent=current.checklist.plans[SCOPE].custom.find(task=>task.id==='custom-99');
    assert.equal(concurrent.title,'Task added in another tab');
    assert.equal(concurrent.notes,'Keep concurrent checklist note');
    await p.reload({waitUntil:'networkidle'});await ready(p);
    assert.equal(await (await reveal(p,'custom-99')).getAttribute('data-status'),'waiting');
  });

  await test('an unseen academic edit rejects the old action while preserving the concurrently saved course',async()=>{
    const p=await page();await reveal(p,'review-plan');
    // A write in this page deliberately avoids its own storage event, as with a
    // tab edit that the visible checklist has not yet rendered.
    await p.evaluate(key=>{
      const state=JSON.parse(localStorage.getItem(key));
      state.learning.push({id:'concurrent-saved-course',provider:'My former college',code:'NEW 999',title:'Course saved in another tab',credits:3,creditSystem:'semester',status:'saved',evaluations:[]});
      state.sheet.notes.anotherTab='Preserve this private note too';
      localStorage.setItem(key,JSON.stringify(state));
    },KEY);
    await item(p,'review-plan').locator('[data-dc-check]').click();
    await p.waitForFunction(()=>/changed|current|review|updated/i.test((document.querySelector('#sheet-home .dc-live')?.textContent||'')+' '+(document.querySelector('#sheet-status')?.textContent||'')));
    const current=await saved(p);
    assert(current.learning.some(record=>record.id==='concurrent-saved-course'&&record.status==='saved'));
    assert.equal(current.sheet.notes.anotherTab,'Preserve this private note too');
    assert.notEqual(current.checklist?.plans?.[SCOPE]?.items?.['review-plan']?.status,'done');
    await p.reload({waitUntil:'networkidle'});await ready(p);
    assert.equal(await (await reveal(p,'review-plan')).getAttribute('data-status'),'todo');
    assert((await saved(p)).learning.some(record=>record.id==='concurrent-saved-course'));
  });

  assert.deepEqual(errors,[]);
  console.log(count+' consumer checklist browser journeys passed.');
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
}})().catch(error=>{console.error(error);process.exitCode=1;});
