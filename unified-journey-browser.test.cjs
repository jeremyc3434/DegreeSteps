/* One journey, three front doors, one course list (audit build order steps 2-3). Desktop 1280 and phone 390.
   Runs against a local preview (DEGREEPATH_TEST_URL, default http://127.0.0.1:8123/). Synthetic records only.
   Use my courses -> upload -> degree finder ranked by those courses -> a transfer page knows the course ->
   credits-worth reuses and adds to the same list -> the one manual form returns where it came from ->
   Find a degree -> step 2 reuses My courses -> the plan worksheet -> Save to account (preview sign-in). */
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8123/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const CSV='provider,code,title,credits,creditSystem,status,grade,score,completedOn\nSophia,SOPH-0001,College Algebra,3,semester,Finished,A,,2025-03-01\nSophia,SOPH-0012,Macroeconomics,3,semester,Finished,B,,2025-05-01\nRiverside Community College,ENG 101,English Composition I,3,semester,Finished,A,,2024-12-15\nSophia,SOPH-0048,Introduction to Psychology,3,semester,Taking,,,\n';
const profiles=[['desktop',{viewport:{width:1280,height:900}}],['phone',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}]];
for(const [name,profile] of profiles)test(name+': three starting paths share one course list and end in a saved plan',{timeout:600000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext(profile),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  const learning=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{"learning":[]}').learning,KEY);
  const wide=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  await page.goto(BASE+'start.html');await page.locator('.start-card').first().waitFor();
  assert.deepEqual(await page.locator('.start-path strong').allInnerTexts(),['Find a degree','Use my courses','Help me choose']);
  assert(await wide(),'no horizontal scroll on the finder');
  // Use my courses with an empty list starts with the upload, and comes back to the finder.
  await page.locator('#start-path-courses').click();await page.waitForURL(/import-courses\.html\?from=degrees/);
  assert.equal(await page.locator('#import-manual-link').getAttribute('href'),'plan.html?task=credits&manual=1&from=degrees');
  await page.locator('#import-files').setInputFiles({name:'courses.csv',mimeType:'text/csv',buffer:Buffer.from(CSV)});
  await page.locator('#import-review').waitFor({timeout:30000});await page.locator('#import-apply').click();await page.locator('#import-success').waitFor();
  assert.equal((await learning()).length,4);
  assert.equal(await page.locator('#import-next').getAttribute('href'),'start.html');
  await page.locator('#import-next').click();await page.waitForURL(/start\.html/);await page.locator('.start-card').first().waitFor();
  await page.waitForFunction(()=>/checked against/.test(document.getElementById('start-personal-status')?.textContent||''),null,{timeout:120000});
  assert.match(await page.locator('#start-path-courses-note').innerText(),/ranked by your 4 courses/);
  // A transfer page recognises the course in the same list, and offers to add one that isn't there.
  await page.goto(BASE+'transfer/sophia/soph-0001-college-algebra/');
  assert.match(await page.locator('.transfer-my-course').innerText(),/In My courses · Finished/);
  await page.goto(BASE+'transfer/sophia/soph-0002-human-biology/');
  assert.match(await page.locator('.transfer-my-course a').first().getAttribute('href'),/\/courses\.html\?provider=Sophia&code=SOPH-0002/);
  // credits-worth reads the same list and adds to it directly.
  await page.goto(BASE+'credits-worth.html');await page.waitForSelector('#cw-provider option[value="StraighterLine"]',{state:'attached'});
  assert.equal(await page.locator('#cw-course-count').innerText(),'3','finished courses from the upload');
  await page.selectOption('#cw-provider','StraighterLine');const option=await page.locator('#cw-course option').nth(1).getAttribute('value');await page.selectOption('#cw-course',option);
  await page.locator('#cw-pick-form button[type=submit]').click();await page.waitForFunction(()=>/to My courses/.test(document.getElementById('cw-save-status').textContent));
  assert.equal((await learning()).length,5);
  // The one manual form returns to the page that opened it.
  await page.locator('#cw-manual-link').click();await page.waitForURL(/plan\.html\?task=credits/);await page.locator('#sheet-learning-form').waitFor({timeout:30000});
  assert.match(await page.locator('#close-sheet-dialog').innerText(),/Back to degree matches/);
  await page.fill('#sheet-learning-form [name=provider]','DSST');await page.fill('#sheet-learning-form [name=code]','SC-101');await page.fill('#sheet-learning-form [name=title]','Principles of Public Speaking');await page.fill('#sheet-learning-form [name=credits]','3');
  await page.selectOption('#sheet-learning-form [name=creditSystem]','semester');await page.locator('#sheet-learning-form [type=submit]').click();
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).learning.length===6,KEY);
  await page.locator('#close-sheet-dialog').click();await page.waitForURL(/credits-worth\.html/,{timeout:15000});
  // Find a degree -> step 2 uses the courses already collected; "starting fresh" is not offered.
  await page.goto(BASE+'start.html?fit=0');await page.locator('[data-build-plan]').first().waitFor();
  await page.locator('[data-build-plan]').first().click();await page.locator('#start-step-credits:not([hidden])').waitFor();
  assert.equal(await page.locator('#start-credits-title').innerText(),'Your courses come with you');
  assert(await page.locator('#start-prior-have').isVisible());assert.equal(await page.locator('#start-prior-none').isVisible(),false);
  assert.equal(await page.locator('input[name=prior]:checked').getAttribute('value'),'have');
  assert.doesNotMatch(await page.locator('#start-step-credits').innerText(),/Accepted|confidence|\d+%/);
  await page.locator('#start-credits-next').click();await page.waitForURL(/plan\.html/,{timeout:30000});
  assert.equal((await learning()).length,6,'opening the plan keeps every course');
  // Save to the account: the same dialog and status as every other page that changes the draft.
  await page.goto(BASE+'__preview/signin?user=journey&run='+name+Date.now()+'&return_to=/plan.html');await page.locator('.dp-shell-save-account').waitFor();
  await page.waitForFunction(()=>/Not saved to your account/.test(document.querySelector('.dp-shell-save')?.textContent||''),null,{timeout:15000});
  await page.locator('.dp-shell-save-account').click();await page.locator('#degree-plan-save-dialog[open]').waitFor({timeout:15000});
  const consent=page.locator('#degree-plan-save-dialog input[type=checkbox]');if(await consent.count())await consent.first().check();
  await page.locator('#degree-plan-save-dialog .plan-save-primary').click();
  await page.waitForFunction(()=>/Saved to your account/.test(document.getElementById('degree-plan-save-dialog')?.textContent||''),null,{timeout:30000}).catch(async error=>{throw Error('Save dialog: '+(await page.locator('#degree-plan-save-dialog').innerText()).replace(/\s+/g,' ').slice(0,400));});
  await page.keyboard.press('Escape');await page.reload();
  await page.waitForFunction(()=>/Saved to your account/.test(document.querySelector('.dp-shell-save')?.textContent||''),null,{timeout:15000});
  // Portal offers the same three paths; Help me choose keeps its longer questions.
  await page.goto(BASE+'portal.html?view=edit');await page.locator('[data-answer="explore"]').waitFor();
  assert.deepEqual(await page.locator('.portal-choices [data-answer]').evaluateAll(nodes=>nodes.map(node=>node.dataset.answer)),['target','audit','explore']);
  assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();}
});
