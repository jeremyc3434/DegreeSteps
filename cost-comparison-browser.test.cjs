/* Cost comparison journeys against the loopback preview; no production writes. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const data = require('./dist/data/cost-comparisons.json');
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8128/').replace(/\/?$/, '/');
const contexts = [], errors = [];
let browser, passed = 0;
const url = path => new URL(path,BASE).href;
const amount = text => {
  const value=String(text).match(/-?\$\s*[\d,]+(?:\.\d+)?/);
  assert(value,'Expected a clearly displayed dollar amount: '+text);
  return Number(value[0].replace(/[^\d.-]/g,''));
};
const formatted = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
async function journey(name,fn){await fn();passed++;console.log('PASS '+name);}
async function pageFor(path='/',options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000},...options});contexts.push(context);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(url(path),{waitUntil:'networkidle'});assert.equal(response.status(),200,path);
  await page.locator('[data-cost-comparison]').waitFor();
  if(options.javaScriptEnabled!==false){await page.locator('[data-cost-school]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-cost-school]')?.disabled);}
  return page;
}
async function shown(page,name,value){
  const locator=page.locator('[data-cost-'+name+']').first();
  await page.waitForFunction(({selector,value})=>{
    const node=document.querySelector(selector),match=node?.textContent.match(/-?\$\s*[\d,]+(?:\.\d+)?/);
    return match && Number(match[0].replace(/[^\d.-]/g,''))===value;
  },{selector:'[data-cost-'+name+']',value});
  assert.equal(amount(await locator.innerText()),value,name);
}
async function fill(page,name,value){
  const input=page.locator('[data-cost-'+name+']');await input.fill(String(value));await input.press('Tab');
}
async function openDetails(page){
  const details=page.locator('details.cost-details');
  if(await details.count()&&!await details.evaluate(node=>node.open))await details.locator('summary').click();
}
async function noOverflow(page){const size=await page.evaluate(()=>({screen:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth}));assert(size.body<=size.screen+1&&size.root<=size.screen+1,JSON.stringify(size));}
(async()=>{try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  await journey('the homepage explains a real Liberty tuition example and offers six distinct colleges',async()=>{
    const page=await pageFor();
    assert.equal(await page.locator('[data-cost-school]').inputValue(),'liberty-residential');
    await shown(page,'before',101560);await shown(page,'after',27390);await shown(page,'savings',74170);
    assert.match(await page.locator('[data-cost-scenario]').innerText(),/90/);
    assert.match(await page.locator('[data-cost-timing]').innerText(),/8[\s\S]*2/);
    const picks=await page.locator('.cost-school-card[data-cost-entry]').evaluateAll(nodes=>nodes.map(n=>n.dataset.costEntry));
    assert.equal(new Set(picks.map(id=>data.entries.find(e=>e.id===id)?.schoolId)).size,6,'Six universities are represented, rather than counting Liberty twice');
    const scope=await page.locator('.cost-scope').first().innerText();assert.match(scope,/aid/i);assert.match(scope,/fees|living/i);
    await openDetails(page);
    assert(await page.locator('.cost-details a[href^="https://www.liberty.edu/"]').count(),'The example links its primary university evidence');
    assert.match(await page.locator('.cost-details').innerText(),/80|course.by.course|mapped|policy/i,'The illustration is distinguished from a complete approved degree map');
  });
  await journey('changing the outside-credit budget updates the total and the six school comparisons',async()=>{
    const page=await pageFor();await fill(page,'budget',5000);
    await shown(page,'after',30390);await shown(page,'savings',71170);
    const snhu=page.locator('.cost-school-card[data-cost-entry="snhu-online"]');
    const wgu=page.locator('.cost-school-card[data-cost-entry="wgu-project-management"]');
    assert((await snhu.innerText()).includes(formatted(15620)),'SNHU also includes the entered outside budget');
    assert((await wgu.innerText()).includes(formatted(17090)),'WGU also includes the entered outside budget');
    assert.equal(await page.locator('[data-cost-before]').first().innerText().then(amount),101560,'The no-transfer baseline does not quietly change');
  });
  await journey('transfer changes respect partial-term tuition and invalid values never replace a valid result',async()=>{
    const page=await pageFor('/compare/');await fill(page,'transfer',0);
    await shown(page,'after',101560);await shown(page,'savings',0);
    await fill(page,'budget',1500);await fill(page,'transfer',87);
    await shown(page,'after',29500);await shown(page,'savings',72060);
    assert.match(await page.locator('[data-cost-timing]').innerText(),/3/,'A short final semester is retained in the pace illustration');
    await fill(page,'transfer',91);
    const error=page.locator('[data-cost-error]');assert.match(await error.innerText(),/90|transfer|valid|between/i);
    assert.equal(amount(await page.locator('[data-cost-after]').first().innerText()),29500,'An invalid transfer input must not silently clamp and redraw a different result');
  });
  await journey('higher outside costs display a cost increase instead of pretending every route saves money',async()=>{
    const page=await pageFor('/compare/?school=snhu-online');
    assert.equal(await page.locator('[data-cost-school]').inputValue(),'snhu-online');
    await fill(page,'budget',40000);await shown(page,'before',42480);await shown(page,'after',50620);
    const result=page.locator('.cost-difference');
    assert.match(await result.innerText(),/more|higher|increase/i);
    assert.equal(Math.abs(amount(await page.locator('[data-cost-savings]').first().innerText())),8140);
    assert(await result.evaluate(node=>node.classList.contains('negative')),'An increase has a distinct honest state');
  });
  await journey('WGU keeps its 88-CU bound and paid-term costs follow explicit terms rather than a transfer percentage',async()=>{
    const page=await pageFor('/compare/?school=wgu-project-management');
    assert.equal(await page.locator('[data-cost-school]').inputValue(),'wgu-project-management');
    assert.equal(await page.locator('[data-cost-transfer]').inputValue(),'88');
    assert.equal(await page.locator('[data-cost-transfer]').getAttribute('max'),'88');
    assert.match(await page.locator('[data-cost-scenario]').innerText(),/32/);
    await shown(page,'before',32240);await shown(page,'after',14090);await shown(page,'savings',18150);
    await openDetails(page);
    assert(await page.locator('.cost-paid-term-controls [data-cost-after-terms]').isVisible());
    await fill(page,'after-terms',8);await shown(page,'after',34240);
    await fill(page,'transfer',60);await shown(page,'after',34240);
    assert.equal(Math.abs(amount(await page.locator('[data-cost-savings]').first().innerText())),2000,'The same paid terms plus outside courses cost more, regardless of a transfer percentage');
    await fill(page,'transfer',90);assert.match(await page.locator('[data-cost-error]').innerText(),/88|valid|between|transfer/i);
    assert.equal(amount(await page.locator('[data-cost-after]').first().innerText()),34240);
    await page.locator('[data-cost-school]').selectOption('umpi-yourpace');
    await shown(page,'before',14400);await shown(page,'after',5600);
    await openDetails(page);await fill(page,'after-terms',8);await shown(page,'after',16400);
  });
  await journey('the comparison remains useful without JavaScript and fits phones and desktop controls',async()=>{
    const plain=await pageFor('/compare/',{javaScriptEnabled:false,viewport:{width:390,height:844}});
    await shown(plain,'before',101560);await shown(plain,'after',27390);
    assert(await plain.locator('[data-cost-school]').isDisabled());
    assert.equal(await plain.locator('.cost-table tbody tr').count(),7,'Every route is crawlable, including both Liberty formats');
    const text=await plain.locator('main').innerText();
    for(const aliases of [['Liberty'],['SNHU','Southern New Hampshire'],['Thomas Edison','TESU'],['Charter Oak'],['Maine','UMPI'],['Western Governors','WGU']])assert(aliases.some(school=>text.includes(school)),aliases.join('/')+' remains readable without scripts');
    assert.match(text,/JavaScript/i,'Static values are not presented as working interactive controls');
    assert(await plain.locator('main a[href^="https://"]').count()>=6,'Official source links remain available without scripts');
    await noOverflow(plain);
    for(const width of [320,390,1440]){
      const page=await pageFor('/compare/',{viewport:{width,height:900}});await noOverflow(page);
      await page.locator('[data-cost-comparison]').scrollIntoViewIfNeeded();
      const budget=page.locator('[data-cost-budget]');await budget.focus();assert(await budget.evaluate(node=>node===document.activeElement));
      await budget.press('ArrowUp');await budget.press('Tab');assert(Number(await budget.inputValue())>2000,'Budget can be adjusted by keyboard');
      await openDetails(page);await noOverflow(page);
      await page.locator('[data-cost-school]').selectOption('wgu-project-management');await openDetails(page);await noOverflow(page);
      for(const locator of [page.locator('[data-cost-school]'),budget,page.locator('[data-cost-transfer]')])assert((await locator.boundingBox()).height>=44,'Primary controls are usable touch targets');
    }
  });
  assert.deepEqual(errors,[],'Cost comparisons must not produce JavaScript errors');
  console.log('\n'+passed+' cost comparison browser journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
