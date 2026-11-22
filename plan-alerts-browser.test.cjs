/* Email plan alerts in a real browser, at 390px and 1366px: the unticked worksheet opt-in for a plan saved to the
 * account, turning it on and off, the account-settings list with Remove, and no alert UI when the flag is off.
 * Run against two local previews (loopback sign-in simulator; the preview server never sends email):
 *   EMAIL_ALERTS_ENABLED=1 DEGREEPATH_PREVIEW_PORT=8220 node server/dev.mjs
 *   DEGREEPATH_PREVIEW_PORT=8221 node server/dev.mjs
 *   ALERTS_TEST_URL=http://127.0.0.1:8220/ ALERTS_TEST_URL_OFF=http://127.0.0.1:8221/ node plan-alerts-browser.test.cjs */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const ON=(process.env.ALERTS_TEST_URL||'http://127.0.0.1:8220/').replace(/\/?$/,'/'),OFF=(process.env.ALERTS_TEST_URL_OFF||'').replace(/\/?$/,'/');
const PLAN='liberty-business-residential',errors=[];let browser,checks=0;
const noHorizontalScroll=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
async function savedPlan(base,width,user){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(width+': '+e.message));
  const run='alerts'+width+Math.random().toString(36).slice(2,8);
  await p.goto(base+'__preview/signin?user='+user+'&run='+run+'&return_to='+encodeURIComponent('/portal.html?usePlan='+PLAN),{waitUntil:'load'});
  await p.waitForFunction(id=>{try{return JSON.parse(localStorage.getItem('degreepath-guide-v3'))?.selectedPathwayId===id;}catch{return false;}},PLAN,{timeout:20000});
  // The portal opens the worksheet for the chosen plan by itself.
  await p.waitForURL(/\/plan\.html/,{timeout:20000});await p.waitForLoadState('load');await p.locator('#sheet-workspace').waitFor({state:'attached',timeout:20000});await p.waitForFunction(()=>window.DegreeAccount&&!document.querySelector('#sheet-loading:not([hidden])'),null,{timeout:20000});
  await p.evaluate(async()=>{await window.DegreeAccount.uploadDraft({title:'My business plan',consent:true});});
  await p.reload({waitUntil:'load'});await p.waitForFunction(()=>!document.querySelector('#sheet-loading:not([hidden])'),null,{timeout:20000});await p.waitForTimeout(800);
  return{context,p,email:user+'@preview.invalid'};
}
(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  for(const width of [390,1366]){
    const {context,p,email}=await savedPlan(ON,width,'alice');
    const box=p.locator('#plan-alerts-toggle');await box.waitFor({timeout:15000});
    assert.equal(await box.isChecked(),false,'The opt-in is unticked by default');
    assert.equal((await p.locator('.plan-alerts-choice span').textContent()).trim(),'Email me if this plan changes');
    const help=await p.locator('#plan-alerts-help').textContent();
    assert.equal(help,'We’ll email '+email+' only about this plan: when its requirements, costs or school confirmations change, and at most one saved-plan reminder a month. Unsubscribing is one click, from any email or here.');
    assert.equal(await p.locator('#sheet-alerts input[type=email]').count(),0,'No other email address is asked for');
    const target=await p.locator('.plan-alerts-choice').boundingBox();assert(target.height>=44,'44px target: '+JSON.stringify(target));
    assert(await noHorizontalScroll(p),'No horizontal scroll at '+width+'px');
    await box.check();await p.locator('.plan-alerts-status',{hasText:'Alerts are on for this plan.'}).waitFor();
    assert.equal(await p.locator('#plan-alerts-toggle').isChecked(),true);
    const listed=await p.evaluate(async()=>(await (await fetch('/api/alerts/subscriptions')).json()));
    assert.equal(listed.items.length,1);assert.equal(listed.items[0].planId,'liberty-business-residential');assert.equal(listed.email,email);
    await p.screenshot({path:require('node:path').join(process.env.ALERTS_SCREENSHOT_DIR||require('node:os').tmpdir(),'plan-alerts-'+width+'.png'),fullPage:false});
    await p.locator('#plan-alerts-toggle').uncheck();await p.locator('.plan-alerts-status',{hasText:'Alerts are off for this plan.'}).waitFor();
    assert.equal((await p.evaluate(async()=>(await (await fetch('/api/alerts/subscriptions')).json()))).items.length,0);
    // Account settings list with a Remove button.
    await p.locator('#plan-alerts-toggle').check();await p.locator('.plan-alerts-status',{hasText:'Alerts are on'}).waitFor();
    await p.goto(ON+'account.html',{waitUntil:'load'});const section=p.locator('#account-alerts');await section.locator('h2',{hasText:'Email alerts'}).waitFor({timeout:15000});
    assert.match(await section.textContent(),/Business/);const remove=section.locator('[data-alert-remove]');assert.equal(await remove.count(),1);
    const removeBox=await remove.boundingBox();assert(removeBox.height>=44,'Remove is a 44px target');assert(await noHorizontalScroll(p),'Account page fits at '+width+'px');
    await remove.click();await section.locator('.plan-alerts-status',{hasText:'Alerts removed'}).waitFor();assert.match(await section.textContent(),/No email alerts are on/);
    await context.close();checks+=1;
  }
  if(OFF.length>1){
    const {context,p}=await savedPlan(OFF,390,'bob');await p.waitForTimeout(1200);
    assert.equal(await p.locator('#plan-alerts-toggle').count(),0,'No opt-in when alerts are off');assert.equal(await p.locator('#sheet-alerts').isHidden(),true);
    assert.equal(await p.evaluate(async()=>(await fetch('/api/alerts/subscriptions')).status),404);
    await p.goto(OFF+'account.html',{waitUntil:'load'});await p.waitForTimeout(1200);assert.equal(await p.locator('#account-alerts').isHidden(),true);
    await context.close();checks+=1;
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({suite:'plan-alerts-browser',checks,widths:[390,1366],flagOffChecked:OFF.length>1}));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();}})();
