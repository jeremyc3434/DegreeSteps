/* Source-bound program requirements with real published plans and synthetic private records. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const {mountOfflineSite}=require('./test-support/offline-site.cjs');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),index=require('./dist/data/plan-library-index.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const published=new Set(publication.plans.filter(plan=>plan.publicationReady===true).flatMap(plan=>plan.routeIds));
const route=modelId=>catalog.pathways.find(item=>item.modelId===modelId&&published.has(item.id));
const human=route('curriculum-liberty-human-services-bs-online'),history=route('curriculum-liberty-history-bs-online'),psych=route('curriculum-liberty-psychology-bs-online'),addictions=route('curriculum-liberty-psychology-addictions-online');
const cyber=route('curriculum-wgu-catalog-a4bbd78b1b3233b7'),him=route('curriculum-wgu-catalog-bc26f6f5019c6ee3'),campus=route('liberty-criminal-justice-residential');
assert(human&&history&&psych&&addictions&&cyber&&him&&campus,'The actual published test degrees are present');
const factsFor=program=>index.plans[program.id]?.fit?.programRequirements||[];
for(const program of[human,history,psych,addictions,cyber,him,campus])assert(factsFor(program).length,'Generate the reviewed program requirements before running these journeys: '+program.id);
const HUMAN_LIVE='liberty-hser497-live-seminars',HUMAN_COMMUNITY='liberty-hser497-community-service',PSYCH_LICENSE='liberty-psychology-nonlicensure';
assert(factsFor(human).some(fact=>fact.id===HUMAN_LIVE)&&factsFor(human).some(fact=>fact.id===HUMAN_COMMUNITY));
assert(factsFor(him).some(fact=>fact.type==='practicum'),'The exact HIM practice requirement is sourced');
const BASE=(process.env.DEGREEPATH_TEST_URL||'http://127.0.0.1:8133/').replace(/\/?$/,'/'),KEY='degreepath-guide-v3';
const ARTIFACTS=process.env.DEGREESTEPS_REQUIREMENTS_ARTIFACTS||'/tmp/degreesteps-program-requirements';
const contexts=[],errors=[],privateNetwork=[];let browser,currentPage,count=0;

function seed(){
 let value=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),human),null,catalog);
 Object.assign(value.profile,{goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open',assessmentPreference:'writing',proctoringPreference:'avoid'});
 value.learning=[
  {id:'requirements-finished-english',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[],privateNote:'Keep this private completed-course note'},
  {id:'requirements-taking-english',provider:'Sophia',code:'SOPH-0030',title:'English Composition II',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},
  {id:'requirements-saved-art',provider:'Sophia',code:'SOPH-0009',title:'Art History I',credits:3,creditSystem:'semester',status:'saved',evaluations:[]},
  {id:'requirements-quarter-original',provider:'My former college',code:'HIST 999',title:'Original quarter-credit history',credits:4,creditSystem:'quarter',status:'earned',evaluations:[],privateNote:'Keep the original four quarter credits'}
 ];
 value.sheet.notes={[human.modelId]:{'requirements-private-note':'Keep this private program planning note'}};
 value.scenarios={[human.id]:{optionSelections:{'engl-102':'sophia-soph-0030'},weeklyHours:12}};
 value.savings={[human.modelId]:{outsideBudget:200,unitsPerTerm:12}};
 value.journey={...value.journey,completed:true};
 value.whatIf={version:1,selectedIds:['current','route:'+him.id],includeOtherFormats:false,goalReady:true};
 return value;
}
async function open(relative,width){
 const initial=seed(),context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context);
 await mountOfflineSite(context,{origin:new URL(BASE).origin});
 context.on('request',request=>{const text=request.url()+' '+(request.postData()||'');if(['requirements-finished-english','requirements-taking-english','requirements-saved-art','requirements-quarter-original','Keep this private completed-course note','Keep this private program planning note'].some(value=>text.includes(value)))privateNetwork.push({method:request.method(),url:request.url()});});
 await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(initial));},{key:KEY,initial});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(BASE+relative,{waitUntil:'domcontentloaded'});return{page,initial};
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
async function preserved(page,initial){assert.deepEqual(await saved(page),initial,'Reading requirements preserves the full course collection, private notes, preferences, active degree and saved comparison choices');}
async function preservedRecords(page,initial){
 const actual=await saved(page);assert.deepEqual(actual.learning,initial.learning,'Original course quantities, units and statuses remain unchanged');assert.deepEqual(actual.sheet.notes,initial.sheet.notes);assert.equal(actual.selectedPathwayId,initial.selectedPathwayId);
 for(const key of['scenarios','savings'])for(const[id,value]of Object.entries(initial[key]||{}))assert.deepEqual(actual[key]?.[id],value,'Existing '+key+' remain recoverable for '+id);
}
const startCard=(page,program)=>page.locator('.start-card[data-plan="'+program.id+'"]');
const finderCard=(page,program)=>page.locator('.pf-program[data-program="'+program.id+'"]');
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Program facts and source controls fit the viewport');}
async function sourceFacts(container,program,{closed=true}={}){
 const panel=container.locator('.program-requirements').first();await panel.waitFor();
 if(closed)assert.equal(await panel.evaluate(node=>node.open),false,'Detailed requirements are collapsed until the student asks for them');
 if(!await panel.evaluate(node=>node.open))await panel.locator(':scope > summary').click();
 assert.match((await panel.locator(':scope > summary').innerText()).trim(),/^Before you choose$/);
 const expected=factsFor(program),actual=await panel.locator('[data-program-requirement]').evaluateAll(nodes=>nodes.map(node=>node.dataset.programRequirement));
 assert.deepEqual([...actual].sort(),expected.map(fact=>fact.id).sort(),'Only the exact program edition’s sourced facts are displayed, once each');
 for(const fact of expected){
  const row=panel.locator('[data-program-requirement="'+fact.id+'"]');assert.equal(await row.getAttribute('data-requirement-kind'),fact.kind);assert.equal(await row.getAttribute('data-requirement-scope'),fact.scope);
  assert((await row.innerText()).includes(fact.label),'The reviewed label is readable');
  if(fact.scope==='school-policy')assert.match(await row.innerText(),/School policy/,'A school-wide rule is visibly distinguished from a degree-specific condition');
  const links=await row.locator('a[data-source-id]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.sourceId,url:node.href,date:node.dataset.sourceChecked,rel:node.rel})));
  assert.deepEqual(links.map(link=>link.id).sort(),[...new Set(fact.sourceIds)].sort());
  for(const link of links){const source=fact.sources.find(source=>source.id===link.id),url=new URL(link.url);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(link.url,new URL(source.url).href);assert.equal(link.date,source.checkedOn);assert.match(link.date,/^\d{4}-\d{2}-\d{2}$/);assert.match(link.rel,/noopener/);}
 }
 assert.doesNotMatch(await panel.innerText(),/\byou(?:’re| are) (?:automatically )?(?:admitted|approved for admission)|\bno proctored exams\b/i,'Reviewed notes do not invent a personalized admission decision or no-proctor degree claim');
 return panel;
}
async function capture(node,name){if(process.env.DEGREESTEPS_REQUIREMENTS_ARTIFACTS){await fs.mkdir(ARTIFACTS,{recursive:true});await node.scrollIntoViewIfNeeded();await node.screenshot({path:path.join(ARTIFACTS,name+'.png')});}}
async function run(name,fn){
 if(process.env.DEGREESTEPS_REQUIREMENTS_CASE&&!new RegExp(process.env.DEGREESTEPS_REQUIREMENTS_CASE).test(name))return;
 try{await fn();count++;console.log('PASS '+name);}
 catch(error){await fs.mkdir(ARTIFACTS,{recursive:true});if(currentPage&&!currentPage.isClosed()){const label=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();await currentPage.screenshot({path:path.join(ARTIFACTS,label+'-failure.png'),timeout:15000}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,label+'-failure.txt'),String(error.stack||error)+'\nURL: '+currentPage.url()+'\nPage errors: '+JSON.stringify(errors)+'\n\n'+(await currentPage.locator('body').innerText({timeout:15000}).catch(()=>'')).slice(0,24000));}throw error;}
 finally{if(currentPage){const context=currentPage.context();await context.close();const i=contexts.indexOf(context);if(i>=0)contexts.splice(i,1);currentPage=null;}}
}

(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of[390,1440]){
  await run('builder keeps Human requirements scoped and personal-course filters usable at '+width+'px',async()=>{
   const{page,initial}=await open('start.html?q=Liberty&level=bachelor&format=online&confirm=0&fit=0',width);
   const humanCard=startCard(page,human);await humanCard.waitFor();const panel=await sourceFacts(humanCard,human);
   assert.equal(await panel.locator('[data-program-requirement="'+HUMAN_LIVE+'"]').count(),1);assert.equal(await panel.locator('[data-program-requirement="'+HUMAN_COMMUNITY+'"]').count(),1);
   assert.equal(await startCard(page,history).locator('[data-program-requirement="'+HUMAN_LIVE+'"],[data-program-requirement="'+HUMAN_COMMUNITY+'"]').count(),0,'Human community/live requirements do not leak into History');
   await capture(humanCard,'builder-human-requirements-'+width);await preserved(page,initial);
   await page.reload({waitUntil:'domcontentloaded'});await sourceFacts(startCard(page,human),human);await page.locator('#start-personal').check();await startCard(page,human).locator('[data-personal-state="ready"]').waitFor();
   assert.equal((await startCard(page,human).locator('[data-personal-earned]').innerText()).trim(),'3','Published entry facts do not change academic credit matches');await sourceFacts(startCard(page,human),human);
   await page.locator('#start-cbe').check();assert.equal(await page.locator('.start-card').count(),0);await page.locator('[data-clear-filter="cbe"]').click();await startCard(page,human).waitFor();
   await preserved(page,initial);await noOverflow(page);
  });
  await run('finder explains Cyber alternatives HIM practice and campus admission separately at '+width+'px',async()=>{
   const{page,initial}=await open('programs.html?q=Western%20Governors&level=bachelor&format=online&confirm=0&fit=0',width);
   await finderCard(page,cyber).locator('[data-program-details]').click();
   const dialog=page.locator('#program-dialog');await dialog.waitFor();let panel=await sourceFacts(dialog,cyber);
   const entry=panel.locator('[data-program-requirement="wgu-a4bbd78b1b3233b7-entry"]');const text=await entry.innerText();assert.match(text,/AND ONE|at least one/i);for(const part of['2.25','2.75','300','certification'])assert(text.includes(part),'Cyber entry retains the alternative '+part);assert.match(text,/alternatives|not cumulative/i);
   const assessment=panel.locator('[data-requirement-kind="assessment"]');assert.match(await assessment.innerText(),/proctor/i);assert.equal(await assessment.getAttribute('data-requirement-scope'),'school-policy');await preserved(page,initial);await page.locator('#program-dialog-close').click();
   await finderCard(page,him).locator('[data-program-details]').click();panel=await sourceFacts(dialog,him);const practice=panel.locator('[data-program-requirement="wgu-bc26f6f5019c6ee3-practice"]');assert.match(await practice.innerText(),/D255/);assert.match(await practice.innerText(),/D259/);assert.match(await practice.innerText(),/mentor|placement/i);await capture(dialog,'finder-him-requirements-'+width);await page.locator('#program-dialog-close').click();
   await page.goto(BASE+'programs.html?q=Liberty&level=bachelor&format=campus&confirm=0&fit=0',{waitUntil:'domcontentloaded'});await finderCard(page,campus).locator('[data-program-details]').click();panel=await sourceFacts(page.locator('#program-dialog'),campus);
   assert.equal(await panel.locator('[data-program-requirement="liberty-online-good-standing-gpa"]').count(),0,'The online good-standing GPA policy is not copied into residential admission');assert.match(await panel.locator('[data-program-requirement="liberty-resident-individual-admission"]').innerText(),/individually|fixed minimum/i);
   await preserved(page,initial);await noOverflow(page);
  });
  await run('comparison and active plan show the same sourced obligations without altering records at '+width+'px',async()=>{
   const{page,initial}=await open('compare-plans.html?from=courses&degree='+encodeURIComponent(history.id)+'&format=online',width);
   const current=page.locator('[data-scenario="current"]');await current.locator('[data-matched-credits]').waitFor();const panel=await sourceFacts(current,human);
   assert.equal(await current.locator('.comparison-attendance-fact').count(),0,'The old live-seminar note is not duplicated beside the reviewed requirement');
   const alternative=page.locator('[data-scenario="route:'+history.id+'"]');await sourceFacts(alternative,history);assert.equal(await alternative.locator('[data-program-requirement="'+HUMAN_COMMUNITY+'"]').count(),0);await capture(panel,'comparison-human-requirements-'+width);await preserved(page,initial);
   await page.goto(BASE+'plan.html',{waitUntil:'domcontentloaded'});await page.locator('tr.course-plan-row').first().waitFor();const slot=page.locator('#sheet-program-requirements');await slot.locator('.program-requirements').waitFor();await preservedRecords(page,initial);
   const planBaseline=await saved(page);await sourceFacts(slot,human);await preserved(page,planBaseline);await capture(slot,'active-human-requirements-'+width);
   await slot.locator('.program-requirements > summary').click();await preserved(page,planBaseline);await page.reload({waitUntil:'domcontentloaded'});await page.locator('tr.course-plan-row').first().waitFor();await sourceFacts(page.locator('#sheet-program-requirements'),human);await preservedRecords(page,initial);await noOverflow(page);
  });
  await run('public degree pages retain exact attendance and professional scope at '+width+'px',async()=>{
   assert(index.plans[human.id].page&&index.plans[psych.id].page&&index.plans[addictions.id].page);
   const{page,initial}=await open(index.plans[human.id].page.replace(/^\//,''),width);let panel=await sourceFacts(page.locator('article[data-public-plan-id="'+human.id+'"]'),human);assert.match(await panel.locator('[data-program-requirement="'+HUMAN_COMMUNITY+'"]').innerText(),/community/i);await capture(panel,'public-human-requirements-'+width);
   await page.goto(BASE+index.plans[psych.id].page.replace(/^\//,''),{waitUntil:'domcontentloaded'});panel=await sourceFacts(page.locator('article[data-public-plan-id="'+psych.id+'"]'),psych);assert.match(await panel.locator('[data-program-requirement="'+PSYCH_LICENSE+'"]').innerText(),/non-licensure/i);
   await page.goto(BASE+index.plans[addictions.id].page.replace(/^\//,''),{waitUntil:'domcontentloaded'});panel=await sourceFacts(page.locator('article[data-public-plan-id="'+addictions.id+'"]'),addictions);assert.equal(await panel.locator('[data-program-requirement="'+PSYCH_LICENSE+'"]').count(),0,'An exact general-Psychology claim is not silently copied to the Addictions concentration');
   await preserved(page,initial);await noOverflow(page);
  });
 }
 assert(count>0,'At least one real program-requirements journey ran');assert.deepEqual(errors,[]);assert.deepEqual(privateNetwork,[],'Private course records and notes stay outside network requests');console.log(count+' program-requirements browser journeys passed.');
}finally{for(const context of contexts)await context.close();await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
