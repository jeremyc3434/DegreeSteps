/* Browser verification for "What are my credits worth?" (desktop + iPhone 13). Synthetic records only.
 * Mounts actual local assets without a server, external requests or account writes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const BASE=process.env.CREDITS_WORTH_URL||'http://127.0.0.1:'+(process.env.DEGREEPATH_PREVIEW_PORT||'8150');
const SHOTS=process.env.CREDITS_WORTH_SHOTS||'/tmp/claude-0/credits-worth';
// Every published plan in the course index is checked; the count comes from the data, so new plans need no test edit.
const publicPlans=require('./dist/data/plan-course-index.json').plans,PLANS=Object.keys(publicPlans).length;
const KEY='degreepath-guide-v3';
fs.mkdirSync(SHOTS,{recursive:true});
const savedDraft={version:3,profile:{entry:'explore',degreeLevel:'unsure',hasPrior:'some'},selectedPathwayId:'',learning:[
 {id:'course-sophia-a3da6b3d489d7580d2',catalogCourseId:'sophia-a3da6b3d489d7580d2',provider:'Sophia',title:'Introduction to Psychology',code:'SOPH-0048',codeAliases:[],credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-04-02',evaluations:[],creditBasis:'curated-course-map',codeBasis:'curated-course-map'},
 {id:'course-taking',provider:'Sophia',title:'Human Biology',code:'',credits:3,creditSystem:'semester',status:'in-progress',completedOn:'',evaluations:[]}
],scenarios:{},sheet:{isExample:false,notes:{},search:'',filter:'all'},journey:{version:1,view:'questions',step:'start',answers:{},completed:false,creditsDeferred:false},courseFirst:true};

async function open(browser,profile,{draft=null,failCourseIndex=false}={}){
 const context=await browser.newContext({...profile,reducedMotion:'reduce'});
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.fallback():route.fulfill({status:403,json:{error:'Synthetic browser QA blocks every write.'}}));
 if(failCourseIndex)await context.route('**/data/plan-course-index.json',route=>route.fulfill({status:503,json:{error:'Synthetic compact-index outage exercises the full fallback.'}}));
 if(draft)await context.addInitScript(([key,value])=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(key,value);sessionStorage.setItem('seeded','1');}},[KEY,JSON.stringify(draft)]);
 const page=await context.newPage(),requests=[],errors=[];
 // Writes are never delivered. The expected anonymous counter attempt carries
 // no course data; every other attempted write remains an explicit failure.
 page.on('request',request=>{if(request.method()==='GET')return;if(new URL(request.url()).pathname==='/api/growth/events'&&request.postData()==='{"event":"credits_worth_used","context":"workspace"}')return;requests.push(request.method()+' '+request.url()+' '+(request.postData()||''));});
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(BASE+'/credits-worth.html');
 return {context,page,requests,errors};
}
const finished=page=>page.waitForFunction(()=>/plans checked|plans shown/.test(document.getElementById('cw-count').textContent),null,{timeout:120000});
const noHorizontalScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);

// Courses typed by hand come from the one shared manual form (plan.html?task=credits&manual=1), so they are seeded here as My courses records.
const handEntered={version:3,profile:{},selectedPathwayId:'',learning:[
 {id:'course-hand-local',provider:'Example Community College',title:'Local History Seminar',code:'HIS 999',codeAliases:[],credits:3,creditSystem:'semester',status:'earned',completedOn:'',evaluations:[]},
 {id:'course-hand-two',provider:'Sophia',title:'Two courses on one line',code:'SOPH-0015 SOPH-0048',codeAliases:[],credits:3,creditSystem:'semester',status:'earned',completedOn:'',evaluations:[]}
],scenarios:{},sheet:{isExample:false,notes:{},search:'',filter:'all'},journey:{version:1,view:'questions',step:'start',answers:{},completed:false,creditsDeferred:false},courseFirst:true};

for(const [name,profile] of [['desktop',{viewport:{width:1366,height:900}}],['iphone13',devices['iPhone 13']]]){
 test(name+': empty state, one shared course list, ranking, review states and build',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
   const empty=await open(browser,profile);
   await empty.page.waitForSelector('#cw-provider option[value="Sophia"]',{state:'attached'});
   assert.match(await empty.page.textContent('#cw-count'),/Add a finished course/);
   assert(await empty.page.isVisible('#cw-empty'));
   assert(await noHorizontalScroll(empty.page),'no horizontal scroll on the empty state');
   // One manual-entry form for the whole site; it returns here afterwards.
   assert.equal(await empty.page.getAttribute('#cw-manual-link','href'),'plan.html?task=credits&manual=1&from=credits-worth');
   assert.equal(await empty.page.locator('#cw-manual-form, #cw-save-bar, #cw-build-dialog').count(),0,'no second, unsaved course list');
   await empty.page.screenshot({path:SHOTS+'/'+name+'-1-empty.png',fullPage:true});
   await empty.context.close();

   const {context,page,requests,errors}=await open(browser,profile,{draft:handEntered});
   await page.waitForSelector('#cw-provider option[value="Sophia"]',{state:'attached'});
   // Catalog pick: Sophia Introduction to Psychology goes straight into My courses, next to the hand-entered courses.
   await page.selectOption('#cw-provider','Sophia');
   await page.selectOption('#cw-course','sophia-a3da6b3d489d7580d2');
   await page.click('#cw-pick-form button[type=submit]');
   const t0=Date.now();
   await page.waitForSelector('#cw-progress-wrap:not([hidden])',{timeout:5000}).catch(()=>{});
   if(name==='desktop')await page.screenshot({path:SHOTS+'/'+name+'-2-progress.png'});
   await finished(page);
   const wall=Date.now()-t0,count=await page.textContent('#cw-count');
   console.log(JSON.stringify({profile:name,count,wallMs:wall}));
   assert.match(count,new RegExp(PLANS+' plans checked · \\d+ could use your courses'));
   const stored=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),KEY));
   assert.equal(stored.version,3);assert.equal(stored.learning.length,3);assert(stored.learning.every(r=>r.status==='earned'));
   assert.deepEqual(stored.learning.slice(0,2),handEntered.learning,'existing My courses records are kept exactly');
   assert.match(await page.textContent('#cw-save-status'),/Added Introduction to Psychology to My courses/);
   const cards=await page.$$eval('#cw-list .cw-card',nodes=>nodes.map(n=>n.textContent));
   assert.equal(cards.length,12,'first page of results');
   assert.match(cards[0],/Your courses could fill [1-9]/,'best plan uses the course');
   assert.match(cards[0],/Build this plan/);
   const outcomes=await page.$$eval('.cw-record',nodes=>nodes.map(n=>n.textContent));
   assert(outcomes.some(text=>new RegExp('Introduction to Psychology.*Added to My courses.*Could count in \\d+ of '+PLANS+' plans').test(text)),outcomes.join('\n'));
   assert(outcomes.some(text=>/Local History Seminar.*In My courses.*No listed match yet/.test(text)));
   assert(outcomes.some(text=>/Two courses on one line.*Needs review/.test(text)),outcomes.join(' // '));
   assert.equal(await page.locator('.pf-badge-confirm').count(),0,'Unfinished research plans are never offered as public matches');
   const offered=await page.locator('#cw-list a[data-build]').evaluateAll(links=>links.map(link=>new URL(link.href).searchParams.get('usePlan')));for(const id of offered)assert(Object.hasOwn(publicPlans,id),'Every offered match is a canonical publication-ready plan: '+id);
   assert(await noHorizontalScroll(page),'no horizontal scroll with results');
   await page.screenshot({path:SHOTS+'/'+name+'-3-ranked.png',fullPage:name==='desktop'});
   if(name==='iphone13'){assert(await page.isVisible('#cw-jump'));await page.click('#cw-jump');await page.waitForTimeout(200);await page.screenshot({path:SHOTS+'/'+name+'-3b-results.png'});await page.$eval('#cw-list .cw-card',n=>n.scrollIntoView());await page.screenshot({path:SHOTS+'/'+name+'-3c-card.png'});}
   // Lowest remaining estimate: every priced card precedes "Needs confirmation".
   await page.selectOption('#cw-sort','cost');
   const prices=await page.$$eval('#cw-list .cw-price strong',nodes=>nodes.map(n=>n.textContent));
   const unknownAt=prices.indexOf('Needs confirmation'),firstUnknown=unknownAt<0?prices.length:unknownAt;
   assert(firstUnknown>0&&prices.slice(firstUnknown).every(p=>p==='Needs confirmation'),prices.join(','));
   const values=prices.slice(0,firstUnknown).map(p=>Number(p.split('–')[0].replace(/[^0-9]/g,'')));
   assert.deepEqual(values,[...values].sort((a,b)=>a-b));
   await page.screenshot({path:SHOTS+'/'+name+'-4-cost-sort.png'});
   await page.selectOption('#cw-subject','psychology');await page.selectOption('#cw-format','online');
   assert.match(await page.textContent('#cw-count'),new RegExp('\\d+ of '+PLANS+' plans shown'));
   assert.equal(await page.getAttribute('#cw-count','aria-live'),'polite');
   // Build opens the worksheet directly: the courses are already in My courses.
   assert.match(await page.getAttribute('#cw-list a[data-build]','href'),/^portal\.html\?usePlan=[A-Za-z0-9_-]+$/);
   // Only a course added here can be removed here; earlier courses are changed in My courses.
   const added=stored.learning[2].id;
   assert.equal(await page.locator('[data-remove="'+added+'"]').count(),1);
   assert.equal(await page.locator('[data-remove="course-hand-local"]').count(),0);
   await page.click('[data-remove="'+added+'"]');
   assert.match(await page.textContent('#cw-save-status'),/Removed Introduction to Psychology from My courses/);
   assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),KEY)).learning,handEntered.learning);
   assert.deepEqual(requests,[],'no course data is posted anywhere');
   assert.deepEqual(errors,[]);
   await context.close();
  }finally{await browser.close();}
 });
}

test('a saved My courses draft is read without uploading or rewriting it, and unfinished courses are explained',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const {context,page,requests,errors}=await open(browser,{viewport:{width:1366,height:900}},{draft:savedDraft});
  const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
  await finished(page);
  assert.match(await page.textContent('#cw-other-status'),/1 course is in My courses but not marked Finished/);
  assert.match(await page.textContent('#cw-record-list'),/Introduction to Psychology.*My courses/s);
  assert.equal(await page.locator('#cw-save-bar').count(),0);
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
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const {context,page}=await open(browser,{viewport:{width:1366,height:900}});
  for(const path of ['/programs.html','/courses.html','/how-it-works/','/']){await page.goto(BASE+path);assert(await page.$('a[href$="credits-worth.html"]'),path+' links to What are my credits worth?');}
  await context.close();
 }finally{await browser.close();}
});

test('a compact-index outage still recommends only43 canonical ready plans through the real full Worker fallback',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const {context,page,requests,errors}=await open(browser,{viewport:{width:1366,height:900}},{draft:savedDraft,failCourseIndex:true}),before=await page.evaluate(key=>localStorage.getItem(key),KEY);
  await finished(page);assert.match(await page.textContent('#cw-count'),new RegExp(PLANS+' plans checked'));
  for(let guard=0;guard<6&&await page.locator('#cw-more:visible').count();guard++)await page.locator('#cw-more').click();
  const offered=await page.locator('#cw-list a[data-build]').evaluateAll(links=>links.map(link=>new URL(link.href).searchParams.get('usePlan')));assert.equal(offered.length,PLANS);assert.equal(new Set(offered.map(id=>publicPlans[id]?.modelId)).size,PLANS);assert(offered.every(id=>Object.hasOwn(publicPlans,id)));assert.equal(await page.locator('.pf-badge-confirm').count(),0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),before,'Fallback ranking preserves the exact original course quantities and private draft');assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:SHOTS+'/desktop-worker-fallback.png',fullPage:true});await context.close();
 }finally{await browser.close();}
});
