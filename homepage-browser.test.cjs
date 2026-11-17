/* Human-facing homepage journeys against the loopback preview. No production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8127/').replace(/\/?$/, '/');
const contexts = [], errors = [];
let browser, passed = 0;
const url = path => new URL(path, BASE).href;
const words = text => text.replace(/\s+/g, ' ').trim();
async function pageFor(options = {}) {
  const context = await browser.newContext({viewport:{width:1440,height:1000},...options});
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url('/'), {waitUntil:'networkidle'});
  assert.equal(response.status(), 200);
  await page.locator('main.home-page').waitFor();
  return page;
}
async function test(name, fn) {await fn(); passed++; console.log('PASS ' + name);}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({viewport:innerWidth, body:document.body.scrollWidth, root:document.documentElement.scrollWidth}));
  assert(size.body <= size.viewport + 1 && size.root <= size.viewport + 1, JSON.stringify(size));
}
function tab(page, id) {return page.locator('.home-barriers [role="tab"][data-barrier="' + id + '"]');}
async function selected(page, id) {
  assert.equal(await tab(page,id).getAttribute('aria-selected'), 'true');
  const active = page.locator('.home-barrier-panel:not([hidden])');
  assert.equal(await active.count(), 1, 'One relevant answer is shown at a time after enhancement');
  assert.equal(await active.getAttribute('id'), 'barrier-' + id);
  assert.equal(await page.locator('.home-barriers [role="tab"][aria-selected="true"]').count(), 1);
}
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  await test('the first screen makes the possibility clear and opens the real guided builder', async () => {
    const page = await pageFor();
    assert.equal(await page.locator('main h1').count(), 1);
    assert.match(words(await page.locator('main h1').innerText()), /Your degree\.\s*Within reach\./i);
    const intro = words(await page.locator('.home-intro').innerText());
    assert.match(intro, /faster|sooner/i); assert.match(intro, /affordable|budget|spend less/i);
    assert.match(intro, /flexible|life|self.paced/i);
    assert.equal(await page.locator('#portal-question-title').count(), 0);
    const cta = page.locator('.home-intro').getByRole('link',{name:/^Find my path/i}).first();
    assert(await cta.isVisible());
    assert.equal(new URL(await cta.getAttribute('href'),page.url()).pathname, '/portal.html');
    await cta.click(); await page.waitForURL('**/portal.html');
    await page.locator('#portal-question-title').waitFor();
    assert.equal((await page.locator('#portal-question-title').innerText()).trim(), 'What would you like help with?');
  });
  await test('human photography is actually served as images with useful alternatives', async () => {
    const page = await pageFor();
    const image = page.locator('.home-hero-portrait img').first();
    assert(await image.isVisible());
    await image.evaluate(node => node.decode());
    assert(await image.evaluate(node => node.complete && node.naturalWidth >= 300 && node.naturalHeight > 0));
    assert((await image.getAttribute('alt') || '').trim().length >= 12, 'The photograph has a meaningful accessible description');
    const source = await image.evaluate(node => node.currentSrc);
    assert.equal(new URL(source).origin, new URL(BASE).origin, 'Photography is self-hosted');
    const response = await page.request.get(source);
    assert.equal(response.status(),200); assert.match(response.headers()['content-type'],/^image\/(webp|jpeg|png)/i);
    const bytes = await response.body();
    assert(bytes.length > 5000, 'A real image is returned rather than an HTML fallback or empty response');
    const valid = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
      || bytes[0] === 0xff && bytes[1] === 0xd8
      || bytes.subarray(1,4).toString() === 'PNG';
    assert(valid, 'Worker/preview responses preserve image bytes');
    for (const selector of ['.home-story-photo img','.home-final-photo img']) {
      const photo=page.locator(selector);await photo.scrollIntoViewIfNeeded();
      await page.waitForFunction(node=>node.complete&&node.naturalWidth>0,await photo.elementHandle());
      await photo.evaluate(node=>node.decode());
    }
    const story = page.locator('.home-family-story');
    assert.match(await story.innerText(), /founder/i);
    assert.match(await story.innerText(), /Liberty/);
    assert.match(await story.innerText(), /3|three/);
    assert.match(await story.innerText(), /1|one/);
    const storyImage = story.locator('img').first();
    assert(await storyImage.count()); await storyImage.evaluate(node => node.decode());
    assert(await storyImage.evaluate(node => node.naturalWidth > 0));
  });
  await test('students can explore their own barrier with a mouse or keyboard', async () => {
    const page = await pageFor();
    for (const id of ['money','time','credits','campus']) {
      await tab(page,id).click(); await selected(page,id);
      const text = words(await page.locator('#barrier-' + id).innerText());
      assert(text.length >= 60, id + ' has a useful explanation');
      assert(await page.locator('#barrier-' + id + ' a[href*="portal.html"]').count(), id + ' has a practical next step');
    }
    await tab(page,'money').focus(); await page.keyboard.press('ArrowRight');
    await selected(page,'time'); assert(await tab(page,'time').evaluate(node => node === document.activeElement));
    await page.keyboard.press('End'); await selected(page,'campus');
    await page.keyboard.press('Home'); await selected(page,'money');
    await page.keyboard.press('ArrowLeft'); await selected(page,'campus');
  });
  await test('all explanations, the FAQ and public navigation work without JavaScript', async () => {
    const page = await pageFor({javaScriptEnabled:false,viewport:{width:390,height:844}});
    for (const id of ['money','time','credits','campus']) assert(await page.locator('#barrier-' + id).isVisible(), id + ' remains readable');
    const question = page.locator('.home-questions details').first();
    assert(await question.count());
    await question.locator('summary').click(); assert(await question.evaluate(node => node.open));
    assert(await question.locator('p').isVisible());
    const menu = page.locator('header details.site-menu');
    if (await menu.count() && !await menu.evaluate(node => node.open)) await menu.locator('summary').click();
    const resources = page.locator('header').getByRole('link',{name:'Resources',exact:true});
    assert(await resources.isVisible()); await resources.click(); await page.waitForURL('**/resources/');
    assert(await page.locator('main h1').isVisible());
  });
  await test('the message, photographs and changing barrier panels fit phone, tablet and desktop widths', async () => {
    for (const width of [320,390,768,1440]) {
      const page = await pageFor({viewport:{width,height:900}}); await noOverflow(page);
      for (const id of ['money','time','credits','campus']) {await tab(page,id).click(); await noOverflow(page);}
      const targets = [page.locator('.home-intro').getByRole('link',{name:/^Find my path/i}).first(),tab(page,'money')];
      for (const target of targets) {const box=await target.boundingBox(); assert(box && box.height >= 44, 'Primary choices remain comfortable touch targets');}
      const portrait = await page.locator('.home-hero-portrait img').boundingBox();
      assert(portrait && portrait.width <= width && portrait.width >= Math.min(240,width-40));
    }
  });
  await test('reduced-motion users can use the same clear choices without animated distractions', async () => {
    const page = await pageFor({reducedMotion:'reduce',viewport:{width:390,height:844}});
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    await tab(page,'credits').click(); await selected(page,'credits');
    const activeAnimations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
    assert.equal(activeAnimations,0);
    await noOverflow(page);
  });
  assert.deepEqual(errors,[],'Homepage journeys must not produce JavaScript errors');
  console.log('\n' + passed + ' homepage browser journeys passed.');
} finally {for (const context of contexts) await context.close(); if(browser) await browser.close();}})().catch(error => {console.error(error);process.exitCode=1;});
