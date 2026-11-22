/* School contact request dialog and Plan review form in a real browser, at 390px and 1366px: nothing renders when
 * the flags are off; when on, keyboard-only use, focus moves and returns, errors are announced, consent starts
 * unticked, and the page never scrolls sideways. Run against two local previews (loopback SQLite, no network):
 *   SCHOOL_INQUIRIES_ENABLED=1 PLAN_REVIEW_ENABLED=1 LEADS_PREVIEW_SCHOOLS="Thomas Edison State University" LEADS_HASH_SALT=run-$(date +%s%N) DEGREEPATH_PREVIEW_PORT=8210 node server/dev.mjs
 *   DEGREEPATH_PREVIEW_PORT=8211 node server/dev.mjs
 *   LEADS_TEST_URL=http://127.0.0.1:8210/ LEADS_TEST_URL_OFF=http://127.0.0.1:8211/ node leads-browser.test.cjs */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const ON=(process.env.LEADS_TEST_URL||'http://127.0.0.1:8210/').replace(/\/?$/,'/'),OFF=(process.env.LEADS_TEST_URL_OFF||'').replace(/\/?$/,'/');
const KEY='degreepath-guide-v3',SCHOOL='Thomas Edison State University',PLAN='tesu-general-management';
const Sheet=require('./dist/sheet-state.js'),catalog=require('./dist/data/pathways.json');
const chosen=Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(p=>p.modelId===PLAN));
const VIEWPORTS=[{width:390,height:844},{width:1366,height:900}];
const contexts=[],errors=[];let browser,checks=0;
async function open(base,path,viewport,{seed=true,user}={}){
  const c=await browser.newContext({viewport});contexts.push(c);
  if(seed)await c.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:KEY,value:chosen});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(path+': '+e.message));
  if(user)await p.goto(base+'__preview/signin?user='+user+'&run=leads'+Date.now()+'&return_to=/'+encodeURIComponent(path));else await p.goto(base+path,{waitUntil:'networkidle'});
  await p.waitForLoadState('networkidle');return p;
}
const noSideScroll=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
const active=p=>p.evaluate(()=>({id:document.activeElement?.id||'',name:document.activeElement?.getAttribute('name')||'',inDialog:Boolean(document.activeElement?.closest('dialog.lead-dialog')),text:(document.activeElement?.textContent||'').trim().slice(0,40)}));
async function tabTo(p,predicate,limit=40){for(let i=0;i<limit;i++){await p.keyboard.press('Tab');if(predicate(await active(p)))return;}throw Error('Could not reach the control with the keyboard');}
async function targetsAtLeast44(p,selector){for(const box of await p.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return{w:r.width,h:r.height,t:(n.textContent||n.getAttribute('aria-label')||'').trim().slice(0,30)};})))assert(box.w>=44&&box.h>=44,selector+' '+JSON.stringify(box));}

(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  if(OFF.length>1){
    for(const viewport of VIEWPORTS){
      const p=await open(OFF,'plan.html?editor=1',viewport);await p.locator('tr.sheet-row').first().waitFor();await p.waitForTimeout(400);
      assert.equal(await p.locator('.lead-actions,[data-lead-action],dialog.lead-dialog').count(),0,'Nothing renders when the flags are off');
      assert.equal(await p.locator('link[href="/leads.css"]').count(),0,'No styles load when off');
      assert.equal(await p.locator('#sheet-lead-actions').isVisible(),false);
      const result=await p.evaluate(async()=>{const status=await fetch('/api/leads/status'),post=await fetch('/api/school-inquiries',{method:'POST',headers:{'Content-Type':'application/json','X-Leads-Request':'1'},body:'{}'}),page=await fetch('/plan-review/');return[status.status,post.status,page.status];});
      assert.deepEqual(result,[404,404,404]);checks++;
    }
  }
  for(const viewport of VIEWPORTS){
    const label=viewport.width+'px';
    // Worksheet: the contact button sits with the school questions, next to "Email the school these questions".
    const p=await open(ON,'plan.html?editor=1',viewport);await p.locator('tr.sheet-row').first().waitFor();
    if(viewport.width<700){const fold=p.locator('[data-phone-fold="school"]');await fold.waitFor();await fold.click();}
    const trigger=p.locator('.sheet-school-check [data-lead-action="school-inquiry"]');await trigger.waitFor();
    assert.equal(await trigger.textContent(),'Have '+SCHOOL+' contact me');
    assert(await p.locator('.sheet-school-check [data-school-email="open"]').isVisible(),'Next to the existing email action');
    assert.equal(await p.locator('.sheet-school-check .lead-review-link a').getAttribute('href'),'/plan-review/?plan='+PLAN);
    assert(await noSideScroll(p),label+' worksheet');await targetsAtLeast44(p,'.lead-actions .lead-button');
    // Keyboard only: open, move through the form, get errors, fix them, send.
    await trigger.focus();await p.keyboard.press('Enter');
    const dialog=p.locator('dialog.lead-dialog');await dialog.waitFor();
    assert.equal(await dialog.evaluate(n=>n.open&&n.matches(':modal')),true,'A modal dialog');
    assert.equal((await active(p)).id,'lead-first-name','Focus moves to the first field');
    assert(await noSideScroll(p),label+' dialog');await targetsAtLeast44(p,'dialog.lead-dialog button, dialog.lead-dialog .lead-choices label, dialog.lead-dialog .lead-consent, dialog.lead-dialog input:not([type=radio]):not([type=checkbox]):not([name=website])');
    assert.match(await dialog.locator('.lead-attached').textContent(),/Plan attached: B\.S\. in General Management/);
    assert.equal(await dialog.locator('input[name="consent"]').isChecked(),false,'Consent starts unticked');
    assert.equal(await dialog.locator('.lead-consent span').textContent(),'I agree that DegreeSteps may share these details with '+SCHOOL+' so its admissions team can contact me about this program. This is optional, and it doesn’t change your plan.');
    for(let i=0;i<24;i++){await p.keyboard.press('Tab');const now=await active(p);assert(now.inDialog,'Tab stays in the dialog');assert.notEqual(now.name,'website','The honeypot is never focusable');}
    for(let i=0;i<6;i++){await p.keyboard.press('Shift+Tab');assert((await active(p)).inDialog,'Shift+Tab stays in the dialog');}
    await p.locator('#lead-first-name').focus();
    await tabTo(p,a=>a.text==='Send my request');await p.keyboard.press('Enter');
    assert.equal(await dialog.locator('.lead-error').textContent(),'Enter your first name.');assert.equal(await dialog.locator('.lead-error').getAttribute('role'),'alert');assert.equal((await active(p)).id,'lead-first-name','Focus goes to the field to fix');
    await p.keyboard.type('Jordan');await p.keyboard.press('Tab');await p.keyboard.type('jordan.'+viewport.width+'@example.com');await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.keyboard.type('New Jersey');
    await p.keyboard.press('Tab');assert.equal((await active(p)).name,'startTiming');await p.keyboard.press('Space');
    await p.keyboard.press('Tab');assert.equal((await active(p)).name,'priorCredit');await p.keyboard.press('Space');
    await tabTo(p,a=>a.text==='Send my request');await p.keyboard.press('Enter');
    assert.match(await dialog.locator('.lead-error').textContent(),/^Tick the box to agree that DegreeSteps may share these details with Thomas Edison State University\.$/);
    assert.equal((await active(p)).name,'consent');await p.keyboard.press('Space');
    await tabTo(p,a=>a.text==='Send my request');await p.keyboard.press('Enter');
    const done=dialog.locator('#lead-inquiry-title');await dialog.locator('.lead-done').waitFor();
    assert.equal(await done.textContent(),'Request saved');assert.equal((await active(p)).id,'lead-inquiry-title','Focus moves to the confirmation');
    assert.match(await dialog.locator('.lead-done').textContent(),/DegreeSteps will pass your details to Thomas Edison State University’s admissions team/);
    assert.equal(await dialog.locator('.lead-done a').getAttribute('href'),'/how-we-make-money/');
    assert(await noSideScroll(p),label+' confirmation');
    await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    assert.equal(await p.evaluate(()=>document.activeElement?.dataset?.leadAction),'school-inquiry','Focus returns to the button');
    assert.equal(await p.evaluate(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)).profile),KEY),JSON.stringify(chosen.profile),'The saved plan is unchanged');
    checks++;

    // Plan review page, reached from the worksheet link with the plan prefilled.
    const r=await open(ON,'plan-review/?plan='+PLAN,viewport,{seed:false});
    assert.match(await r.locator('main').textContent(),/We’ll email you to confirm before you pay anything\./);assert.match(await r.locator('.lead-review-price').textContent(),/\$49/);assert.match(await r.locator('main').textContent(),/within 5 days/);
    assert.equal(await r.locator('#review-plan').inputValue(),PLAN);assert.equal(await r.locator('form[data-lead-form="plan-review"] input[name="consent"]').isChecked(),false);
    assert(await noSideScroll(r),label+' plan review');await targetsAtLeast44(r,'.lead-review-page .lead-button, .lead-review-page .lead-consent, .lead-review-page input:not([type=checkbox]):not([name=website]), .lead-review-page select');
    await r.locator('#review-name').focus();await r.keyboard.type('Sam Rivera');await r.keyboard.press('Tab');await r.keyboard.type('sam.'+viewport.width+'@example.com');
    await r.keyboard.press('Tab');assert.equal((await active(r)).id,'review-plan');await r.keyboard.press('Tab');assert.equal((await active(r)).id,'review-note');await r.keyboard.type('Two Sophia courses done.');
    await r.keyboard.press('Tab');assert.equal((await active(r)).name,'consent','The honeypot is skipped');
    await tabTo(r,a=>a.text==='Request a review');await r.keyboard.press('Enter');
    assert.equal(await r.locator('.lead-error').textContent(),'Tick the box to agree that DegreeSteps may email you about a plan review.');assert.equal((await active(r)).name,'consent');
    await r.keyboard.press('Space');await tabTo(r,a=>a.text==='Request a review');await r.keyboard.press('Enter');
    await r.locator('#plan-review-done').waitFor();assert.equal(await r.locator('form[data-lead-form="plan-review"]').isVisible(),false);
    assert.equal((await active(r)).text,'Your request is in','Focus moves to the confirmation');
    assert.match(await r.locator('#plan-review-done').textContent(),new RegExp('We’ll email you at sam\\.'+viewport.width+'@example\\.com to confirm the details before you pay anything\\.'));
    assert(await noSideScroll(r),label+' plan review confirmation');checks++;
  }
  // Owner view: both lists and their CSV exports, next to the Growth panel.
  for(const viewport of VIEWPORTS){
    const a=await open(ON,'admin.html',viewport,{seed:false,user:'owner'});
    await a.locator('#admin-leads:not([hidden])').waitFor();await a.locator('#admin-leads-inquiries table').waitFor();await a.locator('#admin-leads-reviews table').waitFor();
    assert.match(await a.locator('#admin-leads-inquiries').textContent(),/jordan\.390@example\.com/);assert.match(await a.locator('#admin-leads-reviews').textContent(),/sam\.1366@example\.com/);
    const csv=await a.evaluate(async()=>{const r=await fetch('/api/admin/school-inquiries?format=csv');return{status:r.status,type:r.headers.get('Content-Type'),disposition:r.headers.get('Content-Disposition'),text:await r.text()};});
    assert.equal(csv.status,200);assert.match(csv.type,/text\/csv/);assert.match(csv.disposition,/^attachment; filename="school-inquiries-/);assert.match(csv.text,/Jordan,jordan\.1366@example\.com,,New Jersey,This term,Yes,/);
    assert(await noSideScroll(a),viewport.width+'px admin');checks++;
  }
  const member=await open(ON,'admin.html',VIEWPORTS[1],{seed:false,user:'alice'});
  assert.deepEqual(await member.evaluate(async()=>[(await fetch('/api/admin/school-inquiries?format=csv')).status,(await fetch('/api/admin/plan-review-requests')).status]),[403,403],'CSV export is owner-only');
  assert.equal(await member.locator('#admin-leads').isVisible(),false);checks++;
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({suite:'leads-browser',checks,viewports:VIEWPORTS.map(v=>v.width)}));
}catch(error){console.error(error);process.exitCode=1;}finally{for(const c of contexts)await c.close().catch(()=>{});await browser?.close();}})();
