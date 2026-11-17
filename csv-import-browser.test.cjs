/* Real CSV download/upload journeys against the local preview. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const Sheet=require('./dist/sheet-state.js');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8124/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
let browser,count=0;const errors=[];
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const catalog=require('./dist/data/pathways.json'),seed=Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(p=>p.modelId==='tesu-general-management'));
  await page.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});
  page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'plan.html',{waitUntil:'networkidle'});
  await page.locator('[data-action=credits]').click();await page.locator('[data-action=import]').click();
  let template;
  await test('the labeled template downloads as a blank CSV with seven accepted columns',async()=>{
    await page.getByText('See labeled example rows',{exact:true}).click();
    assert.equal(await page.locator('.credit-template-scroll tbody tr').count(),3);
    assert.match(await page.locator('.credit-template-scroll').innerText(),/1 · Headers/);
    assert.match(await page.locator('.credit-template-scroll').innerText(),/2 · Example/);
    const ready=page.waitForEvent('download');await page.locator('[data-credit-template]').click();const file=await ready;
    assert.equal(file.suggestedFilename(),'degreepath-credit-template.csv');template=fs.readFileSync(await file.path(),'utf8');
    assert.equal(template.trim(),'provider,code,title,credits,creditSystem,status,completedOn');
    assert.throws(()=>Sheet.parseCSV(template),/header row/,'The blank template must not create example credits');
    assert.equal(await page.locator('#sheet-import-form textarea').inputValue(),'');
  });
  const filled=()=>template+'Sophia,SOPH-0015,English Composition I,3,semester,earned,2025-06-15\nYour College,MAT101,"College Algebra, honors",4,quarter,in-progress,\n';
  await test('editing or rejecting a CSV clears its stale preview and cannot import old records',async()=>{
    await page.locator('#sheet-csv-file').setInputFiles({name:'my-credits.csv',mimeType:'text/csv',buffer:Buffer.from(filled())});
    await page.waitForFunction(()=>document.querySelector('#sheet-import-form textarea').value.includes('Sophia'));
    await page.locator('#sheet-import-form button[type=submit]').click();assert.match(await page.locator('#sheet-import-preview').innerText(),/2 records/);
    await page.locator('#sheet-import-form textarea').fill(template);assert.equal(await page.locator('[data-action=import-confirm]').count(),0);
    await page.locator('#sheet-import-form button[type=submit]').click();assert.match(await page.locator('#sheet-import-form [role=alert]').innerText(),/header row/);
    assert.equal(await page.locator('[data-action=import-confirm]').count(),0);
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning.length,KEY),0);
  });
  await test('a completed template previews and imports original units and statuses without school approval',async()=>{
    await page.locator('#sheet-csv-file').setInputFiles({name:'my-credits.csv',mimeType:'text/csv',buffer:Buffer.from(filled())});
    await page.waitForFunction(()=>document.querySelector('#sheet-import-form textarea').value.includes('Sophia'));
    await page.locator('#sheet-import-form button[type=submit]').click();await page.locator('[data-action=import-confirm]').click();
    const records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning,KEY);
    assert.equal(records.length,2);assert.equal(records[0].status,'earned');assert.equal(records[1].status,'in-progress');
    assert.equal(records[1].creditSystem,'quarter');assert.equal(records[1].title,'College Algebra, honors');
    assert(records.every(r=>!r.evaluations.some(e=>e.status==='confirmed')));
    assert.match(await page.locator('#sheet-summary').innerText(),/0 school confirmed/);
  });
  await test('the guided importer offers the same template and invalidates edited previews',async()=>{
    await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.view='wizard';s.step='experience';s.profile.entry='target';localStorage.setItem(k,JSON.stringify(s));},KEY);
    await page.goto(BASE+'guided.html',{waitUntil:'networkidle'});await page.locator('[data-action=add-learning]').first().click();await page.locator('[data-learning-mode=csv]').click();
    assert(await page.locator('[data-credit-template]').isVisible());await page.locator('#learning-csv').fill(filled());await page.locator('[data-action=preview-import]').click();
    assert(await page.locator('[data-action=confirm-import]').isVisible());await page.locator('#learning-csv').fill(template);
    assert.equal(await page.locator('[data-action=confirm-import]').count(),0);await page.locator('[data-action=preview-import]').click();assert.match(await page.locator('#import-error').innerText(),/header row/);
    await page.setViewportSize({width:390,height:844});await page.getByText('See labeled example rows',{exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning.length,KEY),2);
  });
  assert.deepEqual(errors,[]);console.log('\n'+count+' CSV browser journeys passed.');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
