/* Find a degree (Redesign 4/6): the shared card, Compare (up to three) into compare-plans, Best for my credits from
 * finished course records on this device, URL filters, the worksheet's plan picker card, phone widths and keyboard.
 * Synthetic local drafts only; needs a running preview (DEGREEPATH_TEST_URL, default http://127.0.0.1:8133/). */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),C=require('./dist/program-catalog.js'),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js');
const catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3',contexts=[],errors=[];let browser,count=0;
const finished={version:3,profile:{entry:'explore',degreeLevel:'unsure',hasPrior:'some'},selectedPathwayId:'',learning:[
 {id:'course-sophia-a3da6b3d489d7580d2',catalogCourseId:'sophia-a3da6b3d489d7580d2',provider:'Sophia',title:'Introduction to Psychology',code:'SOPH-0048',codeAliases:[],credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-04-02',evaluations:[],creditBasis:'curated-course-map',codeBasis:'curated-course-map'}
],scenarios:{},sheet:{isExample:false,notes:{},search:'',filter:'all'},journey:{version:1,view:'questions',step:'start',answers:{},completed:false,creditsDeferred:false},courseFirst:true};
function planSeed(){let s=J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(r=>r.id==='liberty-business-residential')),null,catalog);s.journey.completed=true;return s;}
async function open(path,{state=null,width=1440}={}){const c=await browser.newContext({viewport:{width,height:900}});contexts.push(c);if(state)await c.addInitScript(({state,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{state,key:KEY});const p=await c.newPage();p.on('pageerror',e=>errors.push(path+': '+e.message));await p.goto(BASE+path,{waitUntil:'networkidle'});return p;}
const fits=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

await test('finder cards use the shared card: est. cost, low-cost credits, bar, Build this plan, Details and Compare',async()=>{
 const p=await open('programs.html');const card=p.locator('#program-results .fd-card').first();await card.waitFor();
 assert.match(await card.innerText(),/Est\. cost[\s\S]*Low-cost (credits|units)/);
 assert.equal(await card.locator('.fd-primary').innerText(),'Build this plan');
 assert.equal(await card.locator('[data-program-details]').count(),1);assert.equal(await card.locator('input[data-compare]').count(),1);
 assert.equal(await p.locator('#program-sort').inputValue(),'cost','lowest cost is the default sort');
});

await test('Compare: tick up to three, the bar links to compare-plans with them preselected',async()=>{
 const p=await open('programs.html');await p.locator('#program-results .fd-card').first().waitFor();
 const boxes=p.locator('#program-results input[data-compare]');const ids=await boxes.evaluateAll(list=>list.slice(0,4).map(b=>b.dataset.compare));
 assert.equal(await p.locator('#finder-compare-bar').isVisible(),false);
 await p.locator('input[data-compare="'+ids[0]+'"]').check();
 assert.match(await p.locator('#finder-compare-text').innerText(),/1 of 3 selected[\s\S]*Pick one more/);assert.equal(await p.locator('#finder-compare-go').getAttribute('aria-disabled'),'true');
 // Keyboard: focus the next checkbox and press Space.
 await p.locator('input[data-compare="'+ids[1]+'"]').focus();await p.keyboard.press('Space');
 assert.equal(await p.locator('input[data-compare="'+ids[1]+'"]').isChecked(),true);
 await p.locator('input[data-compare="'+ids[2]+'"]').check();
 assert.equal(await p.locator('input[data-compare="'+ids[3]+'"]').isDisabled(),true,'a fourth plan cannot be added');
 assert.equal(await p.locator('#finder-compare-go').getAttribute('aria-disabled'),'false');
 assert.equal(await p.locator('#finder-compare-go').getAttribute('href'),'compare-plans.html?plans='+ids.slice(0,3).join(','));
 assert(await fits(p));
 const titles=await Promise.all(ids.slice(0,3).map(id=>p.locator('[data-plan="'+id+'"] h2').innerText()));
 await p.locator('#finder-compare-go').click();await p.waitForURL('**/compare-plans.html?plans=**');
 for(const title of titles)await p.locator('#comparison-results').filter({hasText:title}).waitFor({timeout:60000});
 assert.equal(await p.locator('#comparison-intent').isVisible(),false,'picks from the finder skip the goal question');
 const stored=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 assert.deepEqual(stored.whatIf.selectedIds,ids.slice(0,3).map(id=>'route:'+id));
});

await test('Compare selection survives a reload in the same tab and Clear empties it',async()=>{
 const p=await open('programs.html');await p.locator('#program-results input[data-compare]').first().check();await p.reload({waitUntil:'networkidle'});await p.locator('#program-results .fd-card').first().waitFor();
 assert.equal(await p.locator('#finder-compare-bar').isVisible(),true);await p.locator('#finder-compare-clear').click();assert.equal(await p.locator('#finder-compare-bar').isVisible(),false);
 assert.equal(await p.locator('#program-results input[data-compare]:checked').count(),0);
});

await test('Best for my credits is disabled with a hint when there are no finished courses',async()=>{
 const p=await open('programs.html?sort=credits');await p.locator('#program-results .fd-card').first().waitFor();
 assert.equal(await p.locator('#program-sort option[value=credits]').evaluate(o=>o.disabled),true);assert.equal(await p.locator('#program-sort').inputValue(),'cost');
 assert.match(await p.locator('#program-credits-hint').innerText(),/Add courses you finished/);assert.equal(await p.locator('#program-credits-hint a').getAttribute('href'),'credits-worth.html');
});

await test('Best for my credits ranks plans by what finished courses fill, using the credits-worth engine on this device',async()=>{
 const p=await open('programs.html',{state:finished});await p.locator('#program-results .fd-card').first().waitFor();
 const writes=[];p.on('request',r=>{if(r.method()!=='GET'&&!r.url().includes('/api/growth/'))writes.push(r.url());});
 assert.equal(await p.locator('#program-sort option[value=credits]').evaluate(o=>o.disabled),false);
 await p.locator('#program-sort').selectOption('credits');
 await p.locator('#program-credits-hint').filter({hasText:/Sorted by how many credits/}).waitFor({timeout:60000});
 const first=p.locator('#program-results .fd-card').first();
 assert.match(await first.locator('.fd-worth').innerText(),/Your finished courses could fill \d+(\.\d+)? (credits|units)/);
 const fills=await p.locator('#program-results .fd-card').evaluateAll(cards=>cards.map(c=>Number(c.querySelector('.fd-worth strong')?.textContent||0)));
 for(let i=1;i<fills.length;i++)assert(fills[i-1]>=fills[i],'cards are ordered by credits filled');
 assert.deepEqual(writes,[],'course records never leave the device');
 assert.equal(JSON.stringify(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY)),JSON.stringify(finished),'sorting never changes saved work');
});

await test('URL filters work: format, level, sort and confirmation; school.html and campus links keep working',async()=>{
 const p=await open('programs.html?format=campus&level=bachelor&sort=az&confirm=0');await p.locator('#program-results .fd-card').first().waitFor();
 assert.equal(await p.locator('[data-preset=campus]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#program-level').inputValue(),'bachelor');
 assert.equal(await p.locator('#program-sort').inputValue(),'az');assert.equal(await p.locator('#program-confirm').isChecked(),false);
 assert.equal(await p.locator('#program-results .fd-badge-confirm').count(),0);
 for(const text of await p.locator('#program-results .fd-school').allInnerTexts())assert.match(text,/On campus/);
 const titles=await p.locator('#program-results .fd-card h2').allInnerTexts();assert.deepEqual(titles,[...titles].sort((a,b)=>a.localeCompare(b)));
 const campus=await open('campuses.html');assert.equal(await campus.locator('a[href="/programs.html?format=campus"]').count(),1);
 const worth=await open('credits-worth.html');assert.equal(await worth.locator('a[href="programs.html?sort=credits"]').count(),1);
 const compare=await open('compare-plans.html');const link=compare.locator('#comparison-finder-link');await link.waitFor();
 await compare.locator('#comparison-level').selectOption('associate');await compare.locator('#comparison-modality').selectOption('online');
 assert.equal(await link.getAttribute('href'),'programs.html?level=associate&format=online');
});

await test('the finder, its compare bar and Build my plan step 1 fit 320, 390 and 1440 wide with no page errors',async()=>{
 for(const width of [320,390,1440]){
  const p=await open('programs.html',{width});await p.locator('#program-results .fd-card').first().waitFor();await p.locator('#program-results input[data-compare]').first().check();
  assert(await fits(p),'finder '+width);const box=await p.locator('#finder-compare-bar').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1,'compare bar '+width);
  const s=await open('start.html',{width});await s.locator('#start-results .fd-card.start-card').first().waitFor();assert(await fits(s),'start '+width);
 }
});

await test('the worksheet’s Choose a ready-to-use plan dialog shows the chosen degree as the shared card',async()=>{
 const p=await open('plan.html',{state:planSeed()});await p.locator('tr.course-plan-row').first().waitFor();
 await p.locator('#sheet-titlebar [data-action=target]').click();await p.locator('#sheet-target-form').waitFor();
 await p.locator('#sheet-target-form [name=school]').selectOption('Liberty University');await p.locator('#sheet-target-form [name=pathwayId]').selectOption('liberty-criminal-justice-online');
 const card=p.locator('#sheet-target-card .fd-card');await card.waitFor();assert.equal(await card.getAttribute('data-plan'),'liberty-criminal-justice-online');
 assert.match(await card.innerText(),/Est\. cost[\s\S]*Low-cost credits/);
});

assert.deepEqual(errors,[]);console.log(count+' find-a-degree browser journeys passed.');
}finally{for(const c of contexts)await c.close();await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
