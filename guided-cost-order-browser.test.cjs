/* Guided planner ordering against the loopback preview: "Spend less" follows the shared planning estimate that the
 * finder and plan pages show, the subject filter matches the finder's, and "Finish sooner" shows only sourced timing. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const index=require('./dist/data/plan-library-index.json');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8131/').replace(/\/?$/,'/');
let browser,count=0;const errors=[],contexts=[];
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
async function guided(values){
 const context=await browser.newContext({viewport:{width:1366,height:900}});contexts.push(context);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+'portal.html',{waitUntil:'networkidle'});
 await page.locator('[data-answer=explore]').click();
 for(let guard=0;guard<6;guard++){
  await page.waitForFunction(()=>document.querySelector('#portal-profile-form')||document.querySelector('[data-degree-preview],.portal-empty-result'),null,{timeout:15000});
  const form=page.locator('#portal-profile-form');if(!(await form.count()))break;
  const step=await form.getAttribute('data-profile-step');
  for(const [name,value] of Object.entries(values)){const field=form.locator('[name="'+name+'"]');if(await field.count()&&await field.isVisible())await field.selectOption(String(value));}
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(previous=>document.querySelector('#portal-profile-form')?.dataset.profileStep!==previous,step).catch(()=>{});
 }
 await page.waitForFunction(()=>!/Comparing your course plans/.test(document.body.innerText)&&document.querySelector('#portal-recommendation-results [data-degree-preview], #portal-recommendation-results .portal-empty-result'),null,{timeout:60000});
 return page;
}
const shown=page=>page.locator('#portal-recommendation-results [data-degree-preview]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.degreePreview))]);
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 await test('Spend less orders Business plans by the shared planning estimate, unestimated plans last',async()=>{
  const page=await guided({field:'business',degreeLevel:'bachelor',hasPrior:'none',modality:'online',priority:'cost'}),ids=await shown(page);
  assert(ids.length>=3,'several business plans match');
  for(const id of ids)assert(index.plans[id]?.subjects.includes('business'),id+' is listed under Business in the plan finder');
  const group=id=>{const e=index.plans[id].estimate;return !e?2:e.partial?1:0;};
  for(let i=1;i<ids.length;i++){
   const a=index.plans[ids[i-1]].estimate,b=index.plans[ids[i]].estimate;
   assert(group(ids[i-1])<=group(ids[i]),'estimate groups stay in order: '+ids[i-1]+' before '+ids[i]);
   if(group(ids[i-1])===group(ids[i])&&a&&b)assert(a.min<b.min||a.min===b.min&&a.min+a.max<=b.min+b.max,ids[i-1]+' ($'+a.min+') before '+ids[i]+' ($'+b.min+')');
  }
  // The audit's case: WGU Human Resource Management ($9,033–) must rank above Liberty Healthcare Administration ($21,693–).
  assert(ids.indexOf('wgu-catalog-2e49db64c32dfc79')<ids.indexOf('liberty-catalog-cf514fa45da62116-online'));
  assert.match(await page.locator('[data-cost-order]').innerText(),/Lowest planning estimate first/);
  const last=page.locator('#portal-recommendation-results article:has([data-degree-preview="'+ids.at(-1)+'"])').first();
  if(group(ids.at(-1))===2)assert.match(await last.textContent(),/Needs confirmation/);
 });
 await test('Finish sooner shows the starting route time from the shared estimate, and nothing invented without it',async()=>{
  const page=await guided({field:'technology',degreeLevel:'bachelor',hasPrior:'none',modality:'online',priority:'speed'}),ids=await shown(page);
  assert(ids.length>=1);
  for(const id of ids){
   const card=page.locator('#portal-recommendation-results article:has([data-degree-preview="'+id+'"])').first(),text=await card.textContent(),timing=index.plans[id]?.timing;
   if(timing){assert.match(text,/Study time · starting route/,id);assert(text.includes(timing.outsideMonths.min+'–'+timing.outsideMonths.max+' months')||text.includes(timing.outsideMonths.min+' months'),id+' shows its outside-course months');}
   else assert.doesNotMatch(text,/Study time|months of outside|weeks/,id+' has no published timing');
  }
 });
 assert.deepEqual(errors,[]);console.log(count+' guided ordering journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
