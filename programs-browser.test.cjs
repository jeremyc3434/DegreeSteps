/* Plan finder: only schools and programs with a complete course plan, honest pricing, and saved work kept intact. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),C=require('./dist/program-catalog.js'),S=require('./dist/sheet-state.js'),J=require('./dist/journey-engine.js');
const data=require('./dist/data/opportunity-catalog.json'),catalog=C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3',contexts=[],errors=[];let browser,count=0;
function seed(){let s=J.initialize(S.selectPathway(S.initialize(null,null,catalog),catalog.pathways.find(p=>p.id==='liberty-business-residential')),null,catalog);s=S.updateLearning(s,{id:'private-course',title:'My previous course',provider:'My college',credits:3,creditSystem:'semester',status:'saved'});s.sheet.notes={private:'Keep this note'};s.journey.completed=true;return s;}
async function page(state=null,width=1440){const c=await browser.newContext({viewport:{width,height:1000}});contexts.push(c);if(state)await c.addInitScript(({state,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{state,key:KEY});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'programs.html',{waitUntil:'networkidle'});await p.locator('.pf-program').first().waitFor();return p;}
const card=(p,id)=>p.locator('[data-program="'+id+'"]'),saved=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
async function details(p,id){await p.locator('[data-program-details="'+id+'"]').click();await p.locator('#program-dialog').waitFor();}
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
// Only schools with a complete course plan are offered; directory-only schools are not listed until a plan exists.
await test('only schools with a complete degree plan are selectable, and each shows its plans',async()=>{const p=await page();const options=(await p.locator('#program-school option').allTextContents()).filter(name=>name!=='All schools');
 const index=require('./dist/data/plan-library-index.json'),planned=new Set(catalog.pathways.filter(route=>index.plans[route.id]).map(route=>route.school));
 assert.deepEqual([...options].sort(),[...planned].sort());
 for(const school of data.schools.filter(school=>!planned.has(school.name)))assert(!options.includes(school.name),school.name+' has no plan and must not be listed');
 for(const name of options){await p.locator('#program-school').selectOption(name);assert((await p.locator('.pf-program').count())>0,name);assert((await p.locator('.pf-school').allTextContents()).every(text=>text===name),name);}});
const index=require('./dist/data/plan-library-index.json'),planIds=new Set(Object.keys(index.plans));
await test('directory programs without a complete course plan never appear in the finder',async()=>{const p=await page();
 const shown=await p.locator('.pf-program').evaluateAll(cards=>cards.map(card=>card.dataset.program));assert(shown.length>0);for(const id of shown)assert(planIds.has(id),id+' has no complete plan');
 for(const program of data.programs.filter(program=>!planIds.has(program.id)))assert.equal(await card(p,program.id).count(),0,program.id);
 for(const planned of data.plannedPrograms||[])assert.equal(await card(p,planned.id).count(),0,planned.id);});
await test('self-paced plans include WGU and Phoenix, each labelled reviewed or awaiting confirmation',async()=>{const p=await page();await p.locator('[data-preset=self-paced]').click();
 for(const school of['Western Governors University','University of Phoenix']){await p.locator('#program-school').selectOption(school);assert((await p.locator('.pf-program').count())>0,school);}
 for(const text of await p.locator('.pf-program .pf-badges').allInnerTexts())assert.match(text,/Reviewed plan|Needs school confirmation/);});
await test('Phoenix keeps its published per-credit tuition while the full cost awaits confirmation',async()=>{const p=await page();await p.locator('#program-school').selectOption('University of Phoenix');
 const price=await card(p,'phoenix-cb-mba').locator('.pf-price').innerText();assert.match(price,/\$300 per credit/);assert.match(price,/Published tuition only/);});
await test('opening a plan from the finder keeps the student’s courses and notes',async()=>{const initial=seed(),p=await page(initial);await p.locator('#program-school').selectOption('Liberty University');
 const id=(await p.locator('.pf-program').first().getAttribute('data-program'));await details(p,id);await p.locator('#program-dialog [data-choose-program]').click();await p.waitForURL('**/portal.html**');await p.waitForLoadState('networkidle');
 const after=await saved(p);assert.deepEqual(after.learning,initial.learning);assert.deepEqual(after.sheet.notes,initial.sheet.notes);});
await test('finder, plan details and prices fit small phones',async()=>{for(const width of[320,390]){const p=await page(null,width);await p.locator('#program-school').selectOption('Excelsior University');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const id=await p.locator('.pf-program').first().getAttribute('data-program');await details(p,id);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await p.locator('#program-dialog').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);await p.locator('#program-dialog-close').click();}});
await test('See courses asks before replacing an active plan with progress; Just preview opens the public plan without switching',async()=>{
 const initial=seed(),withPage=Object.entries(index.plans).find(([id,entry])=>entry.page&&id!==initial.selectedPathwayId)[0];
 const p=await page(initial);await p.locator('#program-search').fill('');const target=card(p,withPage);
 for(let i=0;i<5&&!(await target.count());i++)await p.locator('#program-more').click();
 await target.locator('.pf-open-plan').click();const dialog=p.locator('#program-switch-dialog');await dialog.waitFor();
 const title=await target.locator('h2').innerText();assert.equal(await dialog.locator('h2').innerText(),'Switch your plan to '+title+'?');assert.match(await dialog.innerText(),/Your current plan and courses stay saved\./);
 assert.equal(await dialog.locator('[data-switch-plan]').getAttribute('href'),'portal.html?usePlan='+encodeURIComponent(withPage));
 assert.equal(await dialog.locator('[data-preview-plan]').getAttribute('href'),index.plans[withPage].page);
 await dialog.locator('[data-preview-plan]').click();await p.waitForURL('**'+index.plans[withPage].page);
 assert.equal((await saved(p)).selectedPathwayId,initial.selectedPathwayId,'previewing never changes the active plan');
 const q=await page(initial);const confirmOnly=Object.entries(index.plans).find(([id,entry])=>!entry.page&&entry.tier==='confirmation')[0];await q.locator('#program-search').fill(confirmOnly.split('-')[0]);
 for(let i=0;i<5&&!(await card(q,confirmOnly).count());i++)await q.locator('#program-more').click();
 await card(q,confirmOnly).locator('.pf-open-plan').click();await q.locator('#program-switch-dialog [data-preview-plan]').click();await q.locator('#program-dialog').waitFor();assert.equal(await q.locator('#program-switch-dialog').evaluate(n=>n.open),false);
 assert.equal((await saved(q)).selectedPathwayId,initial.selectedPathwayId);
 await q.locator('#program-dialog-close').click();await card(q,confirmOnly).locator('.pf-open-plan').click();await q.locator('#program-switch-dialog [data-switch-plan]').click();await q.waitForURL('**/portal.html?usePlan=**');});
await test('a new visitor with no active plan opens See courses in one click',async()=>{const p=await page();const first=p.locator('.pf-program').first();const id=await first.getAttribute('data-program');await first.locator('.pf-open-plan').click();await p.waitForURL('**/portal.html**');assert.equal(await p.locator('#program-switch-dialog').count(),0);assert.match(p.url(),new RegExp(encodeURIComponent(id)));});
assert.deepEqual(errors,[]);console.log(count+' program-discovery browser journeys passed.');
}finally{for(const c of contexts)await c.close();await browser?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
