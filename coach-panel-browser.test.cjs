/* Degree coach panel in a real browser: hidden when off; when on, an accessible slide-over (dialog, focus trap and
 * return, Escape, aria-live answers, 44px targets) that fits 320–390px without horizontal scroll.
 * Run against two local previews (no network; the model is scripted with COACH_FETCH=mock):
 *   COACH_ENABLED=1 COACH_FETCH=mock COACH_ANON_DAILY_LIMIT=500 DEGREEPATH_PREVIEW_PORT=8171 node server/dev.mjs
 *   DEGREEPATH_PREVIEW_PORT=8172 node server/dev.mjs
 *   COACH_TEST_URL=http://127.0.0.1:8171/ COACH_TEST_URL_OFF=http://127.0.0.1:8172/ node coach-panel-browser.test.cjs */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const ON=(process.env.COACH_TEST_URL||'http://127.0.0.1:8171/').replace(/\/?$/,'/'),OFF=(process.env.COACH_TEST_URL_OFF||'').replace(/\/?$/,'/');
const contexts=[],errors=[];let browser,checks=0;
async function open(base,path,width=1280,height=900){const c=await browser.newContext({viewport:{width,height}});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(path+': '+e.message));await p.goto(base+path,{waitUntil:'load'});await p.waitForTimeout(400);return p;}
const inPanel=p=>p.evaluate(()=>Boolean(document.activeElement?.closest('[data-coach-panel]')));
const noHorizontalScroll=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
async function targetsAtLeast44(p,selector){const boxes=await p.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return{w:r.width,h:r.height,label:n.textContent.trim().slice(0,30)||n.getAttribute('aria-label')};}));for(const box of boxes)assert(box.w>=44&&box.h>=44,selector+' '+JSON.stringify(box));return boxes.length;}

(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  if(OFF.length>1){
    for(const path of ['programs.html','portal.html','plan.html']){const p=await open(OFF,path);await p.waitForTimeout(300);assert.equal(await p.locator('[data-coach-root]').count(),0,'coach must not render when off: '+path);assert.equal(await p.locator('link[href="/coach.css"]').count(),0);checks++;}
    const status=await (await open(OFF,'programs.html')).evaluate(async()=>{const r=await fetch('/api/coach/status');return{status:r.status,body:await r.json()};});
    assert.deepEqual(status,{status:200,body:{enabled:false}});checks++;
  }
  for(const path of ['portal.html','plan.html']){const p=await open(ON,path);await p.locator('[data-coach-open]').waitFor();checks++;}

  // Desktop: keyboard-only journey on the plan finder.
  const p=await open(ON,'programs.html');const launcher=p.locator('[data-coach-open]');await launcher.waitFor();
  assert.equal(await launcher.getAttribute('aria-haspopup'),'dialog');
  await launcher.focus();await p.keyboard.press('Enter');
  const panel=p.locator('[data-coach-panel]');await panel.waitFor();
  assert.equal(await panel.getAttribute('role'),'dialog');assert.equal(await panel.getAttribute('aria-modal'),'true');assert.equal(await panel.getAttribute('aria-labelledby'),'coach-title');
  assert.equal(await p.evaluate(()=>document.activeElement.id),'coach-question','focus moves into the dialog');
  assert.equal(await p.locator('[data-coach-starter]').count(),3);
  assert.match(await p.locator('.coach-notice').textContent(),/Questions are saved without your name to improve DegreeSteps\. Don’t include personal details\./);
  assert.match(await p.locator('[data-coach-remaining]').textContent(),/^\d+ of 500 questions left today$/);
  assert.equal(await p.locator('[data-coach-log]').getAttribute('aria-live'),'polite');
  for(let i=0;i<20;i++){await p.keyboard.press('Tab');assert(await inPanel(p),'Tab stays inside the dialog');}
  for(let i=0;i<20;i++){await p.keyboard.press('Shift+Tab');assert(await inPanel(p),'Shift+Tab stays inside the dialog');}
  assert(await p.evaluate(()=>document.querySelector('main, .pf-skip, header')?.closest('[inert]')!==null),'page behind the dialog is inert');
  await p.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  assert.equal(await p.evaluate(()=>document.activeElement?.hasAttribute('data-coach-open')),true,'focus returns to the launcher');
  assert.equal(await p.evaluate(()=>document.querySelector('[inert]')),null,'inert is removed on close');
  checks++;

  // Ask with a starter, read the answer, and rate it.
  await launcher.click();await p.locator('[data-coach-starter]').nth(2).click();
  const answer=p.locator('.coach-msg-coach').first();await answer.waitFor({timeout:15000});
  const hrefs=await answer.locator('a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
  assert(hrefs.length>=1,'answer links rendered');for(const href of hrefs)assert.match(href,/^\/(?!\/)/,'only same-site relative links: '+href);
  assert.equal(await answer.locator('script,img,iframe').count(),0);
  assert.match(await answer.textContent(),/Next step:/);
  assert.match(await p.locator('[data-coach-remaining]').textContent(),/of 500 questions left today/);
  assert.equal(await p.locator('[data-coach-starter]').first().isVisible(),false,'starters step aside after the first question');
  await answer.locator('[data-coach-rate="down"]').click();await p.locator('.coach-reason-input').fill('Missing my school');await p.locator('[data-coach-reason-send]').click();
  await p.locator('.coach-feedback-status',{hasText:'Thanks for the feedback.'}).waitFor();
  assert.equal(await answer.locator('[data-coach-rate="down"]').getAttribute('aria-pressed'),'true');
  // A typed question, sent with Enter; an off-topic request is declined politely.
  await p.locator('[data-coach-input]').fill('Write me a poem about the ocean');await p.keyboard.press('Enter');
  await p.locator('.coach-msg-coach').nth(1).waitFor({timeout:15000});
  assert.match(await p.locator('.coach-msg-coach').nth(1).textContent(),/only help with degree planning/);
  await targetsAtLeast44(p,'[data-coach-panel] button:not(.coach-reason-actions button)');
  checks++;

  // Phone widths: full-width panel, no horizontal scroll, 44px targets.
  for(const width of [320,375,390]){
    const m=await open(ON,'programs.html',width,740);await m.locator('[data-coach-open]').waitFor();
    assert(await noHorizontalScroll(m),'no horizontal scroll before opening at '+width);
    await targetsAtLeast44(m,'[data-coach-open]');
    await m.locator('[data-coach-open]').click();await m.locator('[data-coach-panel]').waitFor();await m.waitForTimeout(300);
    const box=await m.locator('[data-coach-panel]').boundingBox();assert(box.x>=0&&Math.round(box.x+box.width)<=width,'panel fits '+width+': '+JSON.stringify(box));
    assert(await noHorizontalScroll(m),'no horizontal scroll with the panel open at '+width);
    assert(await m.evaluate(()=>{const body=document.querySelector('.coach-body');return body.scrollWidth<=body.clientWidth+1;}),'panel body does not scroll sideways at '+width);
    await targetsAtLeast44(m,'[data-coach-panel] button');
    await m.locator('[data-coach-starter]').first().click();await m.locator('.coach-msg-coach').first().waitFor({timeout:15000});
    assert(await m.evaluate(()=>{const body=document.querySelector('.coach-body');return body.scrollWidth<=body.clientWidth+1;}),'answer wraps at '+width);
    if(width===390)await m.screenshot({path:process.env.COACH_SCREENSHOT||'/tmp/degreesteps-coach-phone.png'});
    await m.locator('[data-coach-close]').click();await m.locator('[data-coach-panel]').waitFor({state:'hidden'});
    checks++;
  }
  assert.deepEqual(errors,[]);console.log(checks+' coach panel browser checks passed.');
}finally{for(const c of contexts)await c.close().catch(()=>{});await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
