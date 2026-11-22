/* Browser verification for "What are my credits worth?" (desktop + iPhone 13). Synthetic records only.
 * Needs a running preview: DEGREEPATH_PREVIEW_PORT=8150 node server/dev.mjs. Screenshots: /tmp/claude-0/credits-worth/. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const BASE=process.env.CREDITS_WORTH_URL||'http://127.0.0.1:'+(process.env.DEGREEPATH_PREVIEW_PORT||'8150');
const SHOTS=process.env.CREDITS_WORTH_SHOTS||'/tmp/claude-0/credits-worth';
const KEY='degreepath-guide-v3';
fs.mkdirSync(SHOTS,{recursive:true});
const savedDraft={version:3,profile:{entry:'explore',degreeLevel:'unsure',hasPrior:'some'},selectedPathwayId:'',learning:[
 {id:'course-sophia-a3da6b3d489d7580d2',catalogCourseId:'sophia-a3da6b3d489d7580d2',provider:'Sophia',title:'Introduction to Psychology',code:'SOPH-0048',codeAliases:[],credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-04-02',evaluations:[],creditBasis:'curated-course-map',codeBasis:'curated-course-map'},
 {id:'course-taking',provider:'Sophia',title:'Human Biology',code:'',credits:3,creditSystem:'semester',status:'in-progress',completedOn:'',evaluations:[]}
],scenarios:{},sheet:{isExample:false,notes:{},search:'',filter:'all'},journey:{version:1,view:'questions',step:'start',answers:{},completed:false,creditsDeferred:false},courseFirst:true};

async function open(browser,profile,{draft=null}={}){
 const context=await browser.newContext({...profile,reducedMotion:'reduce'});
 if(draft)await context.addInitScript(([key,value])=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(key,value);sessionStorage.setItem('seeded','1');}},[KEY,JSON.stringify(draft)]);
 const page=await context.newPage(),requests=[],errors=[];
 // The only allowed write is the anonymous aggregate counter for a finished ranking, which carries no course data.
 page.on('request',request=>{if(request.method()==='GET')return;if(new URL(request.url()).pathname==='/api/growth/events'&&request.postData()==='{"event":"credits_worth_used","context":"workspace"}')return;requests.push(request.method()+' '+request.url()+' '+(request.postData()||''));});
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(BASE+'/credits-worth.html');
 return {context,page,requests,errors};
}
const finished=page=>page.waitForFunction(()=>/plans checked|plans shown/.test(document.getElementById('cw-count').textContent),null,{timeout:120000});
const noHorizontalScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);

for(const [name,profile] of [['desktop',{viewport:{width:1366,height:900}}],['iphone13',devices['iPhone 13']]]){
 test(name+': empty state, quick add, ranking, review states, save and build',async()=>{
  const browser=await chromium.launch();
  try{
   const {context,page,requests,errors}=await open(browser,profile);
   await page.waitForSelector('#cw-provider option[value="Sophia"]',{state:'attached'});
   assert.match(await page.textContent('#cw-count'),/Add a finished course/);
   assert(await page.isVisible('#cw-empty'));
   assert(await noHorizontalScroll(page),'no horizontal scroll on the empty state');
   await page.screenshot({path:SHOTS+'/'+name+'-1-empty.png',fullPage:true});

   // Catalog pick: Sophia Introduction to Psychology.
   await page.selectOption('#cw-provider','Sophia');
   await page.selectOption('#cw-course','sophia-a3da6b3d489d7580d2');
   await page.click('#cw-pick-form button[type=submit]');
   // Manual: a code that matches nothing, and a line naming two listed Sophia codes (ambiguous).
   await page.click('#cw-manual-toggle');
   await page.fill('#cw-manual-provider','Example Community College');await page.fill('#cw-manual-code','HIS 999');await page.fill('#cw-manual-title','Local History Seminar');await page.fill('#cw-manual-credits','3');
   await page.click('#cw-manual-form button[type=submit]');
   await page.fill('#cw-manual-provider','Sophia');await page.fill('#cw-manual-code','SOPH-0015 SOPH-0048');await page.fill('#cw-manual-title','Two courses on one line');
   await page.click('#cw-manual-form button[type=submit]');
   const t0=Date.now();
   await page.waitForSelector('#cw-progress-wrap:not([hidden])',{timeout:5000}).catch(()=>{});
   if(name==='desktop')await page.screenshot({path:SHOTS+'/'+name+'-2-progress.png'});
   await finished(page);
   const wall=Date.now()-t0,count=await page.textContent('#cw-count');
   console.log(JSON.stringify({profile:name,count,wallMs:wall}));
   assert.match(count,/37 plans checked · \d+ could use your courses/);
   const cards=await page.$$eval('#cw-list .cw-card',nodes=>nodes.map(n=>n.textContent));
   assert.equal(cards.length,12,'first page of results');
   assert.match(cards[0],/Your courses could fill [1-9]/,'best plan uses the course');
   assert.match(cards[0],/Build this plan/);
   const outcomes=await page.$$eval('.cw-record',nodes=>nodes.map(n=>n.textContent));
   assert(outcomes.some(text=>/Introduction to Psychology.*Could count in \d+ of 37 plans/.test(text)),outcomes.join('\n'));
   assert(outcomes.some(text=>/Local History Seminar.*No listed match yet/.test(text)));
   assert(outcomes.some(text=>/Two courses on one line.*Needs review/.test(text)));
   assert(await page.$('.pf-badge-confirm'),'confirmation-tier badge is shown');
   assert(await noHorizontalScroll(page),'no horizontal scroll with results');
   await page.screenshot({path:SHOTS+'/'+name+'-3-ranked.png',fullPage:name==='desktop'});
   if(name==='iphone13'){assert(await page.isVisible('#cw-jump'));await page.click('#cw-jump');await page.waitForTimeout(200);await page.screenshot({path:SHOTS+'/'+name+'-3b-results.png'});await page.$eval('#cw-list .cw-card',n=>n.scrollIntoView());await page.screenshot({path:SHOTS+'/'+name+'-3c-card.png'});}
   // Lowest remaining estimate: every priced card precedes "Needs confirmation".
   await page.selectOption('#cw-sort','cost');
   const prices=await page.$$eval('#cw-list .cw-price strong',nodes=>nodes.map(n=>n.textContent));
   const firstUnknown=prices.indexOf('Needs confirmation');
   assert(firstUnknown>0&&prices.slice(firstUnknown).every(p=>p==='Needs confirmation'),prices.join(','));
   const values=prices.slice(0,firstUnknown).map(p=>Number(p.split('–')[0].replace(/[^0-9]/g,'')));
   assert.deepEqual(values,[...values].sort((a,b)=>a-b));
   await page.screenshot({path:SHOTS+'/'+name+'-4-cost-sort.png'});
   // Filters announce through the live count.
   await page.selectOption('#cw-subject','psychology');await page.selectOption('#cw-format','online');
   assert.match(await page.textContent('#cw-count'),/\d+ of 37 plans shown/);
   assert.equal(await page.getAttribute('#cw-count','aria-live'),'polite');
   // Building with unsaved entries asks first; nothing is written without the explicit choice.
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),null,'reading and ranking never writes My courses');
   await page.click('#cw-list a[data-build]');
   assert(await page.isVisible('#cw-build-dialog'));
   await page.screenshot({path:SHOTS+'/'+name+'-5-build-dialog.png'});
   await page.click('#cw-build-cancel');
   await page.click('#cw-save');
   const stored=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),KEY));
   assert.equal(stored.version,3);assert.equal(stored.learning.length,3);assert(stored.learning.every(r=>r.status==='earned'));
   assert.match(await page.textContent('#cw-save-status'),/3 courses saved to My courses/);
   assert.deepEqual(requests,[],'no course data is posted anywhere');
   assert.deepEqual(errors,[]);
   await context.close();
  }finally{await browser.close();}
 });
}

test('a saved My courses draft is read without uploading or rewriting it, and unfinished courses are explained',async()=>{
 const browser=await chromium.launch();
 try{
  const {context,page,requests,errors}=await open(browser,{viewport:{width:1366,height:900}},{draft:savedDraft});
  const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
  await finished(page);
  assert.match(await page.textContent('#cw-other-status'),/1 course is in My courses but not marked Finished/);
  assert.match(await page.textContent('#cw-record-list'),/Introduction to Psychology.*My courses/s);
  assert(await page.isHidden('#cw-save-bar'));
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),before,'the device draft is unchanged');
  // Keyboard: the first control after the skip link chain is reachable and the result links are focusable.
  await page.focus('#cw-sort');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'cw-subject');
  await page.screenshot({path:SHOTS+'/desktop-6-saved-courses.png',fullPage:true});
  // Build opens the worksheet directly (no unsaved entries).
  const href=await page.getAttribute('#cw-list a[data-build]','href');assert.match(href,/^portal\.html\?usePlan=[A-Za-z0-9_-]+$/);
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  await context.close();
 }finally{await browser.close();}
});

test('entry points link to the page',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const path of ['/programs.html','/courses.html','/how-it-works/','/']){await page.goto(BASE+path);assert(await page.$('a[href$="credits-worth.html"]'),path+' links to What are my credits worth?');}
 }finally{await browser.close();}
});
