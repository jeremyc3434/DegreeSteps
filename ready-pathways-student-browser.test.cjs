/* Student-task acceptance with current published routes, synthetic records and an in-memory account.
 * Run manually against the owned preview. External traffic and real account writes are blocked. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const Sheet = require('./dist/sheet-state.js');
const Journey = require('./dist/journey-engine.js');
const Catalog = require('./dist/program-catalog.js');
const {completeProfileSteps} = require('./test-support/profile-steps.cjs');
const registry = require('./dist/data/curriculum-registry.json');
const publication = require('./dist/data/publication-index.json');
const library = require('./dist/data/plan-library-index.json');
const catalog = Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json')), registry);
const approved = new Set(publication.plans.filter(p => p.publicationReady === true).flatMap(p => p.routeIds));
const eligible = catalog.pathways.filter(p => approved.has(p.id));
const initialRoute = eligible.find(p => p.modelId === 'curriculum-liberty-history-bs-online');
const alternative = eligible.find(p => p.modelId === 'curriculum-liberty-human-services-bs-online');
const otherSchool = eligible.find(p => p.school === 'Western Governors University');
assert(initialRoute && alternative && otherSchool, 'Acceptance must start from real, currently published plans.');

const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8135/').replace(/\/?$/, '/');
const ORIGIN = new URL(BASE).origin;
const KEY = 'degreepath-guide-v3';
const OUT = process.env.DEGREESTEPS_ACCEPTANCE_ARTIFACTS || '/tmp/degreesteps-ready-pathways-acceptance';
const CASE = process.env.DEGREESTEPS_ACCEPTANCE_CASE;
const contexts = [], results = [], pageErrors = [], unexpectedPrivateRequests = [], interceptedWrites = [];
let browser, active;

function seed() {
  let s = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null, null, catalog), initialRoute), null, catalog);
  Object.assign(s.profile, {goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open',priority:'transfer',proctoringPreference:'open',hasPrior:'none'});
  s.learning = [];
  s.sheet.notes = {[initialRoute.modelId]:{'qa-private-note':'ACCEPTANCE-PRIVATE-NOTE'}};
  s.scenarios = {[initialRoute.modelId]:{providers:['Sophia','Study.com','StraighterLine','Saylor','CLEP','Christian Leaders'],allowConditional:true,weeklyHours:12,optionSelections:{}}};
  s.journey = {...s.journey,completed:true,answers:{...s.journey.answers,prior:'none',purpose:'any-degree'}};
  return s;
}
const current = p => p.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const clone = value => JSON.parse(JSON.stringify(value));
async function intercept(context, {signedIn = false} = {}) {
  const user = signedIn ? {id:'qa-only-in-memory-student',displayName:'QA Student',alias:'QA Student'} : null;
  const plans = new Map();
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const sensitive = /ACCEPTANCE-PRIVATE|Example Semester College|Example Quarter College/.test(request.url() + ' ' + (request.postData() || ''));
    const privateSave = url.origin === ORIGIN && /^\/api\/portal\/plans(?:\/qa-saved-plan)?$/.test(url.pathname);
    if (sensitive && !privateSave) unexpectedPrivateRequests.push({url:request.url(),method});
    if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      interceptedWrites.push({url:request.url(),method});
      if (privateSave && user && ['POST','PUT'].includes(method)) {
        const input = request.postDataJSON(), previous = plans.get('qa-saved-plan');
        assert(input.state?.version === 3 && input.state?.learning, 'Only an explicit valid synthetic private plan is saved.');
        if (method === 'POST') assert.equal(input.consent, true);
        const item = {id:'qa-saved-plan',title:input.title,school:input.state.profile.school,degree:input.state.profile.degree,
          revision:(previous?.revision || 0) + 1,createdAt:'2026-11-25T12:00:00.000Z',updatedAt:'2026-11-25T12:00:00.000Z',state:clone(input.state)};
        plans.set(item.id, item);
        return route.fulfill({json:{item}});
      }
      return route.fulfill({status:403,json:{error:'Acceptance blocks all real writes.'}});
    }
    if (url.pathname === '/api/auth/status') return route.fulfill({json:{configured:true,providers:['email','google'],recovery:false}});
    if (url.pathname === '/api/portal/session') return route.fulfill({json:{user,authConfigured:true,limits:{maxPlans:10,maxStateBytes:524288}}});
    if (url.pathname === '/api/portal/plans') return route.fulfill({json:{items:[...plans.values()].map(({state,...metadata})=>metadata)}});
    if (url.pathname === '/api/portal/plans/qa-saved-plan') return route.fulfill({json:{item:plans.get('qa-saved-plan')}});
    if (url.pathname === '/api/community/session') return route.fulfill({json:{user,authConfigured:true}});
    if (url.pathname === '/api/coach/status') return route.fulfill({json:{enabled:false}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status:503,json:{error:'Acceptance does not contact live backend services.'}});
    return route.continue();
  });
  return {plans};
}
async function open(relative, width, {state = seed(), signedIn = false} = {}) {
  const context = await browser.newContext({viewport:{width,height:width < 700 ? 844 : 1000},reducedMotion:'reduce'});
  contexts.push(context);
  const memory = await intercept(context, {signedIn});
  if (state) await context.addInitScript(({key,state}) => {if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));}, {key:KEY,state});
  const page = await context.newPage(); active = page;
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => pageErrors.push({url:page.url(),message:error.message}));
  const response = await page.goto(new URL(relative,BASE).href, {waitUntil:'domcontentloaded'});
  assert.equal(response.status(), 200, 'Preview serves the requested page.');
  return {page,context,memory};
}
async function ready(page) {
  await page.locator('tr.course-plan-row').first().waitFor({timeout:60000});
  assert.equal(await page.locator('.course-plan-unavailable,.course-plan-pending').count(), 0);
}
async function fits(page, label) {
  const measure = await page.evaluate(() => ({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(measure.document <= measure.width + 1 && measure.body <= measure.width + 1, label + ': no page-level sideways scrolling ' + JSON.stringify(measure));
}
async function screenshot(page, name) {await fs.mkdir(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled'});}
async function report() {
  await fs.mkdir(OUT,{recursive:true});
  await fs.writeFile(path.join(OUT,'report.json'), JSON.stringify({syntheticOnly:true,humanParticipants:0,realOAuth:false,realAccountWrites:0,sourceRevision:publication.registryRevision,
    origin:ORIGIN,publicationReadyModels:publication.plans.length,modelIds:[initialRoute.modelId,alternative.modelId,otherSchool.modelId],results,pageErrors,unexpectedPrivateRequests,interceptedWrites},null,2)+'\n');
}
async function test(name, fn) {
  if (CASE && !new RegExp(CASE).test(name)) return;
  const started = Date.now();
  try {await fn();results.push({name,status:'passed',durationMs:Date.now()-started});console.log('PASS '+name);}
  catch(error) {results.push({name,status:'failed',durationMs:Date.now()-started,error:String(error.stack || error)});console.error('FAIL '+name+' '+error.message);if(active&&!active.isClosed()){await screenshot(active,name.replace(/[^a-z0-9]+/gi,'-')+'-failure').catch(()=>{});await fs.writeFile(path.join(OUT,name.replace(/[^a-z0-9]+/gi,'-')+'-failure.txt'),await active.locator('body').innerText().catch(()=>''));}}
  finally {if(active&&!active.isClosed()){const context=active.context();await context.close();contexts.splice(contexts.indexOf(context),1);}active=null;await report();}
}

(async()=>{try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  for (const width of [390,1440]) {
    await test('find a reviewed degree and build its full worksheet '+width, async()=>{
      const {page} = await open('programs.html',width,{state:null});
      await page.locator('[data-program]').first().waitFor({timeout:60000});
      const expectedModels=new Set(eligible.map(route=>route.modelId)),expectedSchools=[...new Set(eligible.map(route=>route.school))].sort();
      const countText=await page.locator('#program-count').innerText();
      assert.equal(Number(countText.match(/^\d+/)?.[0]),expectedModels.size,'The finder counts distinct, complete degrees.');
      assert(!/need.*confirmation/i.test(countText),'Students are not offered research drafts as starting plans.');
      assert.deepEqual((await page.locator('#program-school option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean))).sort(),expectedSchools,'School choices contain colleges with complete plans.');
      const shown=await page.locator('[data-program]').evaluateAll(cards=>cards.map(card=>card.dataset.program));
      const shownModels=shown.map(id=>catalog.pathways.find(route=>route.id===id)?.modelId);
      assert(shown.every(id=>approved.has(id)),'The finder offers complete published plans without research drafts.');
      assert(shownModels.every(Boolean)&&new Set(shownModels).size===shownModels.length,'The finder shows one card per degree, preserving aliases as incoming links.');
      // Students search for a degree; its place in the first page changes as
      // complete programs are added. A canonical card may use another saved alias.
      await page.locator('#program-search').fill('History');
      const aliases=eligible.filter(route=>route.modelId===initialRoute.modelId).map(route=>route.id);
      const card=page.locator(aliases.map(id=>'[data-program="'+id+'"]').join(',')).first();await card.waitFor({timeout:60000});
      const chosenId=await card.getAttribute('data-program');
      assert.match(await card.innerText(),/Reviewed plan/);
      await fits(page,'Degree finder');
      await card.locator('a.pf-open-plan').click();
      await completeProfileSteps(page);
      await page.waitForURL('**/plan.html',{timeout:60000});await ready(page);
      assert.equal((await current(page)).selectedPathwayId,chosenId);
      assert.equal((await current(page)).learning.length,0,'A proposed plan does not create earned courses.');
      assert(await page.locator('[data-plan-section]').count()>1 || await page.locator('.course-plan-section').count()>1 || await page.locator('.course-plan-table').count()>1,'Full academic sections remain visible.');
      await fits(page,'New worksheet');await screenshot(page,'new-plan-'+width);
    });

    await test('spreadsheet review import and return preserve original course facts '+width, async()=>{
      const {page}=await open('import-courses.html?from=plan',width),before=await current(page);
      await page.locator('#import-files').setInputFiles(path.join(__dirname,'test-support/fixtures/course-import/mixed-original-course-units.xlsx'));
      await page.locator('#import-review').waitFor({timeout:60000});
      await page.waitForFunction(()=>document.querySelector('#import-review-count')?.textContent.includes('6 courses'));
      assert.deepEqual((await current(page)).learning,before.learning,'Preview does not write course records.');
      await fits(page,'Spreadsheet review');
      await page.locator('#import-apply').click();await page.locator('#import-success').waitFor();
      const records=(await current(page)).learning;
      assert.equal(records.length,6);
      assert(records.some(r=>r.creditSystem==='quarter'&&r.credits===4));
      assert(records.some(r=>r.creditSystem==='competency-unit'&&r.credits===3));
      assert(records.some(r=>r.provider==='Study.com'&&r.status==='saved'&&r.credits==null));
      assert(records.every(r=>!(r.evaluations||[]).some(e=>e.status==='confirmed')),'Import never grants school approval.');
      await page.locator('#import-success a[href="plan.html"]').first().click();await ready(page);
      assert.deepEqual((await current(page)).learning,records);assert.deepEqual((await current(page)).sheet.notes,before.sheet.notes);
    });

    await test('text readable PDF imports courses without totals becoming credit '+width,async()=>{
      const {page}=await open('import-courses.html?from=plan',width);
      const beforeWrites=interceptedWrites.length;
      await page.locator('#import-files').setInputFiles(path.join(__dirname,'test-support/fixtures/course-import/synthetic-transcript.pdf'));
      await page.locator('#import-review').waitFor({timeout:60000});
      await page.waitForFunction(()=>document.querySelector('#import-review-count')?.textContent.includes('2 courses'));
      assert.equal((await current(page)).learning.length,0);
      // This synthetic document deliberately is not labeled Official/Unofficial.
      // A student can identify its type; the reader must not guess completion.
      assert.equal(await page.locator('#import-apply').isDisabled(),true);
      await page.locator('#import-file-list [data-kind-file]').selectOption('completed-transcript');
      await page.waitForFunction(()=>!document.querySelector('#import-apply').disabled);
      assert.equal(await page.locator('#import-rows [data-field="provider"]').first().inputValue(),'Example Semester College');
      await page.locator('#import-apply').click();await page.locator('#import-success').waitFor();
      const records=(await current(page)).learning;
      assert.equal(records.length,2);assert.equal(records.reduce((sum,r)=>sum+r.credits,0),6);
      assert(records.every(r=>r.status==='earned'&&!(r.evaluations||[]).some(e=>e.status==='confirmed')));
      assert.equal(interceptedWrites.length,beforeWrites,'Text-readable PDF stays local without an AI upload.');
      await fits(page,'Transcript success');
    });

    await test('switch degree keeps source courses and private notes '+width,async()=>{
      const initial=seed();initial.learning=[{id:'ACCEPTANCE-PRIVATE-COURSE',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];
      const {page}=await open('plan.html',width,{state:initial});await ready(page);
      await page.locator('#sheet-titlebar [data-action="target"]').click();
      await page.locator('#sheet-target-form [name="school"]').selectOption(alternative.school);
      await page.locator('#sheet-target-form [name="pathwayId"]').selectOption(alternative.id);
      assert.equal((await current(page)).selectedPathwayId,initial.selectedPathwayId,'Selection does not replace the working degree.');
      await page.locator('#sheet-target-form button[type="submit"]').click();await ready(page);
      const next=await current(page);assert.equal(next.selectedPathwayId,alternative.id);
      assert.deepEqual(next.learning,initial.learning);assert.deepEqual(next.sheet.notes,initial.sheet.notes);
      assert(next.whatIf.snapshots.some(p=>p.pathwayId===initialRoute.id),'Prior plan remains as a saved comparison version.');
      await fits(page,'Changed worksheet');
    });

    await test('switch school preserves original semester credits when the new degree uses CUs '+width,async()=>{
      const initial=seed();initial.learning=[{id:'ACCEPTANCE-PRIVATE-COURSE',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];
      const {page}=await open('plan.html',width,{state:initial});await ready(page);
      await page.locator('#sheet-titlebar [data-action="target"]').click();
      await page.locator('#sheet-target-form [name="school"]').selectOption(otherSchool.school);
      await page.locator('#sheet-target-form [name="pathwayId"]').selectOption(otherSchool.id);
      await page.locator('#sheet-target-form button[type="submit"]').click();await ready(page);
      const next=await current(page);assert.equal(next.selectedPathwayId,otherSchool.id);
      assert.deepEqual(next.learning,initial.learning,'Receiving CUs cannot rewrite the original course quantity or units.');assert.deepEqual(next.sheet.notes,initial.sheet.notes);
      assert(next.whatIf.snapshots.some(plan=>plan.pathwayId===initialRoute.id));
      await fits(page,'Changed school worksheet');
    });

    await test('finished coursework can be corrected and changes the progress bar '+width,async()=>{
      const {page}=await open('plan.html',width);await ready(page);
      const control=page.locator('[data-progress="math-121"]').first();await control.waitFor();
      const before=Number(await page.getByRole('progressbar',{name:'Finished degree coursework'}).getAttribute('aria-valuenow'));
      await control.selectOption('in-progress');await page.waitForFunction(()=>document.querySelector('tr[data-requirement="math-121"]')?.dataset.courseProgress==='in-progress');
      await page.locator('[data-progress="math-121"]').first().selectOption('completed');
      await page.waitForFunction(value=>Number(document.querySelector('[role="progressbar"][aria-label="Finished degree coursework"]')?.getAttribute('aria-valuenow'))>value,before);
      await page.locator('[data-progress="math-121"]').first().selectOption('planned');
      const correction=page.locator('#sheet-progress-correction-form');if(await correction.isVisible().catch(()=>false)){await correction.locator('[name="confirm"]').check();await correction.locator('button[type="submit"]').click();}
      await page.waitForFunction(value=>Number(document.querySelector('[role="progressbar"][aria-label="Finished degree coursework"]')?.getAttribute('aria-valuenow'))===value,before);
      assert.equal(await page.locator('tr[data-requirement="math-121"]').getAttribute('data-course-progress'),'not-started');
      assert((await current(page)).learning.every(r=>!(r.evaluations||[]).some(e=>e.status==='confirmed')));
      await fits(page,'Corrected coursework');
    });

    await test('explicit account save receipt and return restore the same plan '+width,async()=>{
      const entry=registry.models.find(model=>model.id===initialRoute.modelId),document=JSON.parse(await fs.readFile(path.join(__dirname,'dist',entry.path),'utf8')),model=(document.models||[document]).find(model=>model.id===entry.id);
      const prepared=Journey.buildDraft(seed(),catalog,[model]),state=prepared.state,reviewReceipt=Journey.compactReviewSignature(Journey.draftSignature(state,prepared));
      Object.assign(state.journey,{planReviewed:true,schoolContacted:true,reviewedSignature:reviewReceipt,schoolContactedSignature:reviewReceipt});
      const {page,context,memory}=await open('plan.html',width,{signedIn:true,state});await ready(page);
      await page.locator('[data-open-plan-save]').first().click();await page.locator('#plan-save-form').waitFor();
      assert.equal(memory.plans.size,0,'Opening save options is not an account save.');
      await page.locator('#plan-save-form [name="consent"]').check();await page.locator('#plan-save-form button[type="submit"]').click();
      await page.locator('.plan-save-success').waitFor();assert.equal(memory.plans.size,1);
      const saved=clone(memory.plans.get('qa-saved-plan').state);
      assert.equal(saved.journey.reviewedSignature,reviewReceipt);assert.equal(saved.journey.schoolContactedSignature,reviewReceipt);
      await page.getByRole('button',{name:'Continue with my plan',exact:true}).click();
      await page.close();
      const returned=await context.newPage();active=returned;returned.setDefaultTimeout(30000);returned.on('pageerror',e=>pageErrors.push({url:returned.url(),message:e.message}));
      await returned.goto(BASE+'account.html',{waitUntil:'domcontentloaded'});
      await returned.locator('[data-open-plan="qa-saved-plan"]').first().waitFor();
      await returned.locator('[data-open-plan="qa-saved-plan"]').first().click();
      const confirm=returned.locator('[data-confirm-open="qa-saved-plan"]');if(await confirm.isVisible().catch(()=>false))await confirm.click();
      await returned.waitForURL(/(?:plan|portal)\.html/,{timeout:60000});
      if(new URL(returned.url()).pathname==='/portal.html')await returned.waitForURL('**/plan.html',{timeout:60000});
      await ready(returned);const restored=await current(returned);
      assert.equal(restored.selectedPathwayId,saved.selectedPathwayId);assert.deepEqual(restored.learning,saved.learning);assert.deepEqual(restored.sheet.notes,saved.sheet.notes);
      assert.equal(restored.journey.reviewedSignature,reviewReceipt);assert.equal(restored.journey.schoolContactedSignature,reviewReceipt);
      await fits(returned,'Restored account plan');
    });

    await test('one next action identifies a reachable course or genuine task '+width,async()=>{
      const state=seed();state.journey.planReviewed=true;state.journey.schoolContacted=true;
      const {page}=await open('plan.html',width,{state});await ready(page);
      const panel=page.getByRole('region',{name:'Your next action'});
      await panel.waitFor();assert((await panel.locator('h2').innerText()).trim().length>3);
      const link=panel.locator('a.button.primary');assert(await link.isVisible());
      const href=await link.getAttribute('href');assert(href&&!/^\s*(?:javascript:|#\s*$)/i.test(href));
      const reveal=panel.locator('[data-action="show-next-course"]');
      if(await reveal.count()){
        await reveal.click();const row=page.locator('tr[data-next-course="true"]');await row.waitFor();assert(await row.isVisible());assert(await row.evaluate(n=>n===document.activeElement||n.contains(document.activeElement)),'Revealed course gets focus.');
      }else{
        const target=new URL(href,BASE);assert.equal(target.origin,ORIGIN,'A prerequisite task has an in-app destination.');
        await link.click();await page.waitForLoadState('domcontentloaded');assert((await page.locator('main').innerText()).trim().length>0);
      }
      await fits(page,'First action');await screenshot(page,'next-action-'+width);
    });
  }
  assert.deepEqual(pageErrors,[],'No uncaught application errors.');
  assert.deepEqual(unexpectedPrivateRequests,[],'Private course/notes data are never sent outside the intercepted deliberate account save.');
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
  console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,humanParticipants:0,realAccountWrites:0,report:path.join(OUT,'report.json')}));
}finally{for(const context of contexts)await context.close();await browser?.close();await report();}})().catch(error=>{console.error(error);process.exitCode=1;});
