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
  // Past courses are added on the upload page; the plan's credits action leads there.
  await page.goto(BASE+'plan.html?task=credits',{waitUntil:'networkidle'});await page.waitForURL('**/import-courses.html?from=plan');await page.locator('#import-files').waitFor({state:'attached'});
  let template;
  const upload=async(name,text)=>{await page.locator('#import-files').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});await page.locator('#import-file-list').filter({hasText:name}).filter({hasText:/course rows? found/}).waitFor();};
  await test('the labeled template downloads as a blank CSV with the accepted columns',async()=>{
    await page.locator('#import-column-guide>summary').click();
    await page.getByText('See labeled example rows',{exact:true}).click();
    assert.equal(await page.locator('.credit-template-scroll tbody tr').count(),3);
    assert.match(await page.locator('.credit-template-scroll').innerText(),/1 · Headers/);
    assert.match(await page.locator('.credit-template-scroll').innerText(),/2 · Example/);
    const ready=page.waitForEvent('download');await page.locator('#import-column-guide [data-credit-template][href$=".csv"]').click();const file=await ready;
    assert.equal(file.suggestedFilename(),'degreesteps-course-template.csv');template=fs.readFileSync(await file.path(),'utf8');
    assert.equal(template.trim(),'provider,code,title,credits,creditSystem,status,grade,score,completedOn');
    assert.throws(()=>Sheet.parseCSV(template),/header row/,'The blank template must not create example credits');
  });
  const filled=()=>template+'Sophia,SOPH-0015,English Composition I,3,semester,earned,,,2025-06-15\nYour College,MAT101,"College Algebra, honors",4,quarter,in-progress,,,\n';
  await test('a header-only CSV offers nothing to import',async()=>{
    await upload('blank.csv',template);
    assert.match(await page.locator('#import-file-list').innerText(),/0 course rows found/);
    assert.equal(await page.locator('#import-review').isVisible(),false);
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning.length,KEY),0);
    await page.locator('#import-file-list').getByRole('button',{name:'Remove'}).first().click();
  });
  await test('a completed template previews and imports original units and statuses without school approval',async()=>{
    await upload('my-credits.csv',filled());await page.locator('#import-review').waitFor();
    assert.match(await page.locator('#import-review-count').innerText(),/2 courses/);
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning.length,KEY),0,'nothing is added before review');
    await page.locator('#import-apply').click();await page.locator('#import-success').waitFor();
    const records=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning,KEY);
    assert.equal(records.length,2);assert.equal(records[0].status,'earned');assert.equal(records[1].status,'in-progress');
    assert.equal(records[1].creditSystem,'quarter');assert.equal(records[1].title,'College Algebra, honors');
    assert(records.every(r=>!r.evaluations.some(e=>e.status==='confirmed')));
  });
  await test('the guided importer offers the same template and invalidates edited previews',async()=>{
    await page.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.view='wizard';s.step='experience';s.profile.entry='target';localStorage.setItem(k,JSON.stringify(s));},KEY);
    await page.goto(BASE+'guided.html',{waitUntil:'networkidle'});await page.locator('[data-action=add-learning]').first().click();await page.locator('[data-learning-mode=csv]').click();
    assert(await page.locator('[data-credit-template][href$=".csv"]').isVisible());await page.locator('#learning-csv').fill(filled());await page.locator('[data-action=preview-import]').click();
    assert(await page.locator('[data-action=confirm-import]').isVisible());await page.locator('#learning-csv').fill(template);
    assert.equal(await page.locator('[data-action=confirm-import]').count(),0);await page.locator('[data-action=preview-import]').click();assert.match(await page.locator('#import-error').innerText(),/header row/);
    await page.setViewportSize({width:390,height:844});await page.getByText('See labeled example rows',{exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).learning.length,KEY),2);
  });
  assert.deepEqual(errors,[]);console.log('\n'+count+' CSV browser journeys passed.');
}finally{await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
