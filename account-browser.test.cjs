/* Focused UI contract checks with intercepted local assets and mocked private APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const ORIGIN = 'https://account.degreepath.test', KEY = 'degreepath-guide-v3', LINK = 'degreepath-account-link-v1';
const draft = {version:3,profile:{school:'My College',degree:'My degree'},learning:[{id:'private-source',title:'Private completed course'}],sheet:{notes:{private:'My private note'}}};
const savedState = {version:3,profile:{school:'Saved College',degree:'Saved degree'},learning:[],sheet:{notes:{}}};
const metadata = {id:'plan-1',title:'A saved plan',school:'Saved College',degree:'Saved degree',revision:2,createdAt:Date.now(),updatedAt:Date.now()};
let browser, passed = 0; const contexts = [], errors = [];
async function test(name, fn) {await fn(); passed++; console.log('PASS ' + name);}
async function setup({configured = true,signedIn = true,recovery = false,link = null,conflict = false,viewport = {width:1440,height:1000},title = metadata.title} = {}) {
  const context = await browser.newContext({viewport}); contexts.push(context);
  await context.addInitScript(({key,linkKey,state,link}) => {if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(state)); if (link && !localStorage.getItem(linkKey)) localStorage.setItem(linkKey,JSON.stringify(link));}, {key:KEY,linkKey:LINK,state:draft,link});
  const state = {signedIn,plans:[{...metadata,title}],writes:[],profile:'Student'};
  const page = await context.newPage(); page.on('pageerror',e => errors.push(e.message));
  await page.route(ORIGIN + '/**',async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname === '/portal.html') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><h1>Degree portal</h1>'});
      const filename = path.resolve('dist','.' + url.pathname);
      if (!filename.startsWith(path.resolve('dist') + path.sep) || !fs.existsSync(filename)) return route.fulfill({status:404,body:'Not found'});
      return route.fulfill({status:200,contentType:filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'application/javascript' : 'text/html',body:fs.readFileSync(filename,'utf8')});
    }
    const json = (body,status = 200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    const data = method !== 'GET' ? JSON.parse(request.postData() || '{}') : null;
    if (data) state.writes.push({url:url.pathname,method,data});
    if (url.pathname === '/api/auth/status') return json({configured,providers:configured ? ['email','google'] : [],recovery});
    if (url.pathname === '/api/auth/login') {state.signedIn = true; return json({ok:true,message:'Signed in.'});}
    if (url.pathname === '/api/auth/logout') {state.signedIn = false; return json({ok:true});}
    if (url.pathname === '/api/auth/passwordchange') {state.signedIn = false; return json({ok:true,message:'Sign in with your new password.'});}
    if (url.pathname === '/api/portal/session') return json({user:state.signedIn ? {id:'student-a',alias:state.profile} : null,authConfigured:configured,limits:{maxPlans:10,maxStateBytes:524288}});
    if (url.pathname === '/api/portal/plans' && method === 'GET') return json({items:state.plans});
    if (url.pathname === '/api/portal/plans' && method === 'POST') {const item = {...metadata,id:'plan-new',title:data.title,revision:1}; state.plans.push(item); return json({item:{...item,state:data.state}},201);}
    if (url.pathname === '/api/portal/plans/plan-1' && method === 'PUT') return conflict ? json({error:'A newer version exists.',code:'revision_conflict'},409) : json({item:{...metadata,title:data.title,revision:3,state:data.state}});
    if (url.pathname === '/api/portal/plans/plan-1' && method === 'GET') return json({item:{...metadata,state:savedState}});
    if (url.pathname === '/api/portal/plans/plan-1' && method === 'DELETE') {state.plans = []; return json({ok:true});}
    if (url.pathname === '/api/portal/profile' && method === 'PATCH') {state.profile = data.alias; return json({user:{id:'student-a',alias:state.profile}});}
    return json({error:'Unknown test API.'},404);
  });
  await page.goto(ORIGIN + '/account.html' + (recovery ? '?mode=recovery' : ''),{waitUntil:'networkidle'});
  await page.locator('#account-content h1').waitFor();
  return {page,state};
}
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  await test('unconfigured accounts show an honest draft path with no pretend login or Google action',async () => {
    const {page,state} = await setup({configured:false,signedIn:false});
    assert.equal(await page.locator('#account-auth-form').count(),0); assert.equal(await page.locator('a[href*="auth/google"]').count(),0);
    assert.match(await page.locator('#account-content').innerText(),/Sign-in is being connected/);
    assert(await page.getByRole('link',{name:'Build my plan',exact:true}).isVisible()); assert.equal(state.writes.length,0);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
  });
  await test('configured email and Google access leads to an authenticated account without uploading a draft',async () => {
    const {page,state} = await setup({signedIn:false});
    const google = page.getByRole('link',{name:'Continue with Google'}); assert.equal(await google.getAttribute('target'),'_top'); assert.match(await google.getAttribute('href'),/^\/auth\/google\?/);
    await page.locator('[name="email"]').fill('student@example.invalid'); await page.locator('[name="password"]').fill('a strong test password');
    await page.locator('#account-auth-form button[type="submit"]').click(); await page.locator('#account-save-form').waitFor();
    assert.deepEqual(state.writes.map(write => write.url),['/api/auth/login']);
  });
  await test('saving a private draft requires the visible consent checkbox before the explicit save',async () => {
    const {page,state} = await setup(); assert.equal(state.writes.length,0);
    const save = page.locator('#account-save-form button[value="new"]'); await save.click(); assert.equal(state.writes.length,0);
    await page.locator('#account-save-form [name="consent"]').check(); await save.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('degreepath-account-link-v1'))?.planId === 'plan-new');
    const upload = state.writes.find(write => write.url === '/api/portal/plans'); assert(upload.data.consent); assert.deepEqual(upload.data.state,draft);
    assert.equal(state.writes.filter(write => write.url === '/api/portal/plans').length,1);
  });
  await test('a stale account update offers a new copy and never retries with a forced revision',async () => {
    const {page,state} = await setup({conflict:true,link:{ownerId:'student-a',planId:'plan-1',revision:2}});
    await page.locator('#account-save-form [name="consent"]').check(); await page.locator('#account-save-form button[value="update"]').click();
    await page.getByText('A newer account version exists.',{exact:true}).waitFor();
    assert.equal(await page.locator('#account-save-form button[value="update"]').count(),0);
    assert(await page.locator('#account-save-form button[value="new"]').isVisible());
    assert.equal(state.writes.filter(write => write.method === 'PUT').length,1); assert.equal(state.writes[0].data.revision,2);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY),draft);
  });
  await test('opening an older plan preserves the device course collection and private notes',async () => {
    const {page,state} = await setup(); await page.locator('[data-open-plan="plan-1"]').click();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY),draft); assert.equal(state.writes.length,0);
    assert.match(await page.locator('.account-inline-confirm').innerText(),/current courses and private notes stay/);
    await page.locator('[data-confirm-open="plan-1"]').click(); await page.waitForURL('**/portal.html');
    const opened = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY);
    assert.deepEqual(opened.profile,savedState.profile); assert.deepEqual(opened.learning,draft.learning); assert.deepEqual(opened.sheet.notes,draft.sheet.notes);
    assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)),LINK)).ownerId,'student-a');
  });
  await test('sign-out removes the account marker and keeps the private device copy with clear copy',async () => {
    const {page} = await setup({link:{ownerId:'student-a',planId:'plan-1',revision:2}});
    await page.getByRole('button',{name:'Sign out',exact:true}).click(); await page.locator('#account-auth-form').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key),LINK),null); assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY),draft);
    assert.match(await page.locator('#account-status').innerText(),/device draft remains/);
  });
  await test('password recovery takes priority over the already authenticated dashboard',async () => {
    const {page,state} = await setup({recovery:true});
    assert.equal(await page.locator('h1').innerText(),'Choose a new password');
    await page.locator('[name="password"]').fill('my replacement password'); await page.locator('#account-auth-form button[type="submit"]').click();
    await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor(); assert.equal(state.writes[0].url,'/api/auth/passwordchange');
  });
  await test('saved titles render as plain text and account controls fit a 320px viewport',async () => {
    const title = '<img src=x onerror="window.accountXSS=true">';
    const {page} = await setup({viewport:{width:320,height:760},title});
    assert.equal(await page.locator('.account-plan h3').innerText(),title); assert.equal(await page.locator('.account-plan img').count(),0);
    assert(!await page.evaluate(() => window.accountXSS));
    const size = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,width:innerWidth})); assert(size.scroll <= size.width + 1);
  });
  assert.deepEqual(errors,[]); console.log('\n' + passed + ' account UI journeys passed.');
} catch (error) {console.error(error.stack || error); process.exitCode = 1;} finally {await Promise.all(contexts.map(context => context.close().catch(() => {}))); await browser?.close();}})();
