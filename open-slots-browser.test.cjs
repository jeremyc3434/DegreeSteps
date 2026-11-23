/* Open course slots in the worksheet: the student records the course they pick, it survives a reload, and "Ask the
 * community" opens the existing composer with an editable, prefilled question. Synthetic records only; offline assets. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Programs=require('./dist/program-catalog.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const catalog=Programs.attachRegistry(Programs.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3',ROUTE='apus-associate-of-arts-in-business-administration';
const contexts=[],errors=[];let browser,passed=0;
function seed(){const route=catalog.pathways.find(item=>item.id===ROUTE);assert(route,'The APUS route is published');return Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);}
async function page(width=1440,state=seed()){
  const context=await browser.newContext({viewport:{width,height:1000}});context.setDefaultTimeout(20000);contexts.push(context);
  await mountOfflineSite(context,{origin:new URL(BASE).origin});
  await context.addInitScript(({state,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{state,key:KEY});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'plan.html',{waitUntil:'networkidle'});await p.locator('tr.course-plan-row').first().waitFor();return p;
}
const slotRow=p=>p.locator('tr.course-plan-row').filter({has:p.locator('.course-plan-name',{hasText:/^Choose any approved /})}).first();
const stored=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  await test('an open slot reads as a choice the student makes, with its credits',async()=>{
    const p=await page(),row=slotRow(p);
    assert.equal(await row.count(),1);assert.match(await row.locator('.course-plan-slot').innerText(),/you pick the course/i);
    assert.match(await row.locator('.course-plan-needs-course').innerText(),/Choose a course/);
  });
  await test('a saved slot choice is stored with the plan and survives a reload',async()=>{
    const p=await page(),row=slotRow(p),id=await row.getAttribute('data-requirement');
    await row.locator('.course-plan-name').click();
    const form=p.locator('#sheet-slot-choice-form');await form.waitFor();
    assert.match(await p.locator('.slot-choice h3').innerText(),/^Choose any approved .+ course — 3 credits$/);
    await form.locator('[name=code]').fill('HUMN101');await form.locator('[name=title]').fill('Introduction to the Humanities');await form.locator('[name=credits]').fill('3');
    await form.locator('[type=submit]').click();
    await p.locator('.slot-choice-saved').waitFor();assert.match(await p.locator('.slot-choice-saved').innerText(),/HUMN101 · Introduction to the Humanities/);
    const saved=(await stored(p)).sheet.slotChoices;const programId=Object.keys(saved)[0];
    assert.deepEqual({...saved[programId][id],updatedAt:undefined},{code:'HUMN101',title:'Introduction to the Humanities',credits:3,updatedAt:undefined});
    await p.reload({waitUntil:'networkidle'});await p.locator('tr.course-plan-row').first().waitFor();
    const after=p.locator('tr.course-plan-row[data-requirement="'+id+'"]');
    assert.match(await after.locator('.course-plan-slot').innerText(),/Your choice: HUMN101 · Introduction to the Humanities/);
    assert.match(await after.locator('.course-plan-needs-course').innerText(),/Choice saved/);
    // Clearing removes only this choice.
    await after.locator('.course-plan-name').click();await p.locator('[data-action=slot-clear]').click();
    assert.equal(Object.keys((await stored(p)).sheet.slotChoices||{}).length,0);
  });
  await test('Ask the community opens the existing composer with a prefilled, editable question',async()=>{
    const p=await page(),row=slotRow(p);await row.locator('.course-plan-name').click();
    await p.locator('[data-action=slot-ask]').click();
    const title=p.locator('.publish-form [name=title]');await title.waitFor();
    const asked=await title.inputValue();assert.match(asked,/^Which course should I take for [^(]+ in (American Public University System )?Associate of Arts in Business Administration\?$/);assert(asked.length<=160);
    assert.match(await p.locator('.publish-form [name=body]').inputValue(),/3 credits/);
    assert.equal(await p.locator('.publish-form [name=kind]').inputValue(),'question');
    await title.fill('My own edited question');assert.equal(await title.inputValue(),'My own edited question');
  });
  await test('the slot dialog fits small phones without horizontal scrolling',async()=>{
    for(const width of [320,390]){
      const p=await page(width),row=slotRow(p);await row.locator('.course-plan-name').click();await p.locator('#sheet-slot-choice-form').waitFor();
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow at '+width);
      const box=await p.locator('#sheet-slot-choice-form [type=submit]').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1,'button fits at '+width);
    }
  });
  assert.deepEqual(errors,[]);console.log(passed+' open-slot browser journeys passed.');
}finally{for(const c of contexts)await c.close();await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
