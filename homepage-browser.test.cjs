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
(async () => {try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  // The homepage is a three-step reading journey (goal, course options, plan) with one real Liberty example.
  const cta = page => page.locator('#home-step-1').getByRole('link',{name:'Build my plan',exact:true});
  const choice = page => page.locator('#home-step-2 [data-home-course-choice]');
  await test('the first screen makes the possibility clear and opens the real guided builder', async () => {
    const page = await pageFor();
    assert.equal(await page.locator('main h1').count(), 1);
    assert.equal(words(await page.locator('main h1').innerText()), 'A degree that fits your life.');
    assert.match(words(await page.locator('#home-steps-title').innerText()), /The degree you want\.\s*A smarter way there\./i);
    const intro = words(await page.locator('#home-step-1 .home-journey-lede').innerText());
    assert.match(intro, /faster|sooner/i); assert.match(intro, /affordable|budget|spend less/i);
    assert.match(intro, /flexible|life|self.paced/i);
    assert.equal(await page.locator('#portal-question-title').count(), 0);
    assert(await cta(page).isVisible());
    assert.equal(new URL(await cta(page).getAttribute('href'),page.url()).pathname, '/start.html');
    await cta(page).click(); await page.waitForURL('**/start.html');
    await page.locator('#start-step-degree:not([hidden])').waitFor();
    assert.equal((await page.locator('#start-degree-title').innerText()).trim(), 'Pick a degree');
  });
  await test('the example images are self-hosted and load', async () => {
    const page = await pageFor();
    const images = await page.locator('main img').evaluateAll(nodes => nodes.map(node => node.currentSrc || node.src));
    assert(images.length >= 2, 'The school and provider marks are shown');
    for (const source of images) {
      assert.equal(new URL(source).origin, new URL(BASE).origin, 'Images are self-hosted');
      const response = await page.request.get(source);
      assert.equal(response.status(),200,source); assert.match(response.headers()['content-type'],/^image\//i);
      assert((await response.body()).length > 100, 'A real image is returned rather than an empty response');
    }
    assert(await page.locator('main img').evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0)));
  });
  await test('students can compare the example course sources with a mouse or keyboard', async () => {
    const page = await pageFor(),step = page.locator('#home-step-2');
    assert.match(await step.innerText(), /Take it with\s+Sophia/);
    await choice(page).selectOption('university');
    assert.match(await step.innerText(), /Take it with\s+Liberty University/);
    await choice(page).focus(); await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('#home-step-2 [data-home-course-choice]').value === 'sophia');
    assert.match(await step.innerText(), /Take it with\s+Sophia/);
    assert.match(await step.innerText(), /Counts toward\s+ENGL 101/);
  });
  await test('all steps, the FAQ and public navigation work without JavaScript', async () => {
    const page = await pageFor({javaScriptEnabled:false,viewport:{width:390,height:844}});
    for (const id of [1,2,3]) assert(await page.locator('#home-step-' + id).isVisible(), 'step ' + id + ' remains readable');
    assert(await choice(page).isDisabled(), 'The example choice is not presented as working without scripts');
    const question = page.locator('.home-questions details').first();
    assert(await question.count());
    await question.locator('summary').click(); assert(await question.evaluate(node => node.open));
    assert(await question.locator('p').first().isVisible());
    for (const name of ['Degrees','Transfer courses','Community','My plan','Sign in']) assert(await page.locator('header.public-header').getByRole('link',{name,exact:true}).isVisible(), name + ' is in the header without scripts');
    const resources = page.locator('footer').getByRole('link',{name:'Resources',exact:true});
    assert(await resources.isVisible()); await resources.click(); await page.waitForURL('**/resources/');
    assert(await page.locator('main h1').isVisible());
  });
  await test('the message, example and course choice fit phone, tablet and desktop widths', async () => {
    for (const width of [320,390,768,1440]) {
      const page = await pageFor({viewport:{width,height:900}}); await noOverflow(page);
      await choice(page).selectOption('university'); await noOverflow(page);
      for (const target of [cta(page),choice(page)]) {const box=await target.boundingBox(); assert(box && box.height >= 44, 'Primary choices remain comfortable touch targets');}
      const preview = await page.locator('.home-degree-preview').boundingBox();
      assert(preview && preview.x >= 0 && preview.x + preview.width <= width + 1);
    }
  });
  await test('reduced-motion users can use the same clear choices without animated distractions', async () => {
    const page = await pageFor({reducedMotion:'reduce',viewport:{width:390,height:844}});
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    await choice(page).selectOption('university');
    await page.evaluate(() => scrollTo(0, document.querySelector('#home-step-3').offsetTop));
    const activeAnimations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
    assert.equal(activeAnimations,0);
    await noOverflow(page);
  });
  assert.deepEqual(errors,[],'Homepage journeys must not produce JavaScript errors');
  console.log('\n' + passed + ' homepage browser journeys passed.');
} finally {for (const context of contexts) await context.close(); if(browser) await browser.close();}})().catch(error => {console.error(error);process.exitCode=1;});
