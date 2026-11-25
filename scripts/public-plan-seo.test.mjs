/** Redesign 5/6: public plan pages for every finder plan, structured data that mirrors the page, and data-only answers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPublicPlans,renderPublicPlan,renderPublicPlanHub,planStructuredData,planQuestions,planAnswerLine,evidenceClass} from './public-plan-pages.mjs';
const plans=await loadPublicPlans();

const existingSlugs=['liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential','liberty-healthcare-administration-bs-online','liberty-psychology-bs-online','wgu-business-management','wgu-communications','wgu-cybersecurity-and-information-assurance','wgu-finance','wgu-health-information-management-b-s-from-the-leavitt-school-of-health','wgu-health-science','wgu-healthcare-administration','wgu-human-resource-management','wgu-marketing','wgu-project-management','wgu-psychology','wgu-public-health','wgu-supply-chain-and-operations-management','wgu-user-experience-design'];
const unescape=value=>String(value).replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);

test('every finder plan gets a public page or a recorded reason, with stable existing URLs and readable unique slugs',async()=>{
 const library=JSON.parse(await readFile(new URL('../dist/data/plan-library-index.json',import.meta.url),'utf8'));
 const ids=new Set(plans.map(plan=>plan.id)),skipped=new Map(plans.skipped.map(item=>[item.id,item.reason]));
 for(const id of Object.keys(library.plans))assert(ids.has(id)||skipped.get(id),id+' has neither a page nor a reason');
 assert(plans.length>=140,'confirmation-tier plans get pages too');
 const slugs=plans.map(plan=>plan.slug);assert.equal(new Set(slugs).size,slugs.length);
 for(const slug of existingSlugs)assert(slugs.includes(slug),'existing page URL kept: '+slug);
 for(const plan of plans){
  assert.match(plan.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.doesNotMatch(plan.slug,/catalog-[0-9a-f]{8}/,'new slugs are readable: '+plan.slug);
  assert.equal(library.plans[plan.id]?.page,plan.path,'the finder links the same page: '+plan.id);
  assert.match(plan.title,/: transfer plan and cost$/);
 }
 const titles=plans.map(plan=>plan.title);assert.equal(new Set(titles).size,titles.length,'no two plan pages share a title');
});

test('confirmation-tier pages say so in the title area, the FAQ and the hub card',()=>{
 const hub=renderPublicPlanHub(plans);
 for(const plan of plans){
  const html=renderPublicPlan(plan,plans),confirmation=plan.tier==='confirmation',hero=html.slice(0,html.indexOf('</h1>'));
  assert.equal(hero.includes('<p class="seo-plan-badge">Needs school confirmation</p>'),confirmation,plan.id);
  const answer=planQuestions(plan).find(item=>/^Has .+ confirmed this plan\?$/.test(item.q)).a;
  assert.equal(answer.startsWith('Not yet.'),confirmation,plan.id);
 }
 assert.equal((hub.match(/data-plan-tier="confirmation"/g)||[]).length,plans.filter(plan=>plan.tier==='confirmation').length);
 assert.equal((hub.match(/<article class="public-plan-card"/g)||[]).length,plans.length);
});

test('structured data: EducationalOccupationalProgram has its required facts and the FAQPage mirrors the visible questions exactly',()=>{
 for(const plan of plans){
  const [page,program,faq]=planStructuredData(plan,'https://degreesteps.com'),html=renderPublicPlan(plan,plans);
  assert.equal(page['@type'],'WebPage');assert.equal(program['@type'],'EducationalOccupationalProgram');assert.equal(faq['@type'],'FAQPage');
  for(const item of [page,program,faq])assert.equal(item['@context'],'https://schema.org');
  assert.equal(program.provider['@type'],'CollegeOrUniversity');assert.equal(program.provider.name,plan.school);
  assert(program.name&&program.url==='https://degreesteps.com'+plan.path&&['online','onsite'].includes(program.educationalProgramMode),plan.id);
  if(plan.unit==='semester credits')assert.equal(program.numberOfCredits,plan.total);else assert.equal(program.numberOfCredits,undefined,'non-semester units are not reported as credits');
  assert.equal(program.timeToComplete,undefined,'no unsourced completion time');
  const range=plan.estimate?.costs?.knownRange;
  if(program.offers){assert.equal(program.offers.priceSpecification.minPrice,range.min);assert.equal(program.offers.priceSpecification.maxPrice,range.max);assert.equal(program.offers.priceSpecification.priceCurrency,'USD');}
  else assert(!(range&&range.min>0),plan.id+' has an estimate but no offer');
  const visible=[...html.matchAll(/<details class="seo-plan-faq"><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(match=>({q:unescape(match[1]),a:unescape(match[2])}));
  assert.deepEqual(faq.mainEntity.map(item=>({q:item.name,a:item.acceptedAnswer.text})),visible,plan.id);
  for(const item of faq.mainEntity){assert.equal(item['@type'],'Question');assert.equal(item.acceptedAnswer['@type'],'Answer');}
  assert(visible.length>=2,plan.id);
 }
});

test('every factual answer traces to the plan data: course matches, evidence wording, limits and cost',()=>{
 for(const plan of plans){
  const sources=new Map((plan.model.sources||[]).map(source=>[source.id,source]));
  for(const item of planQuestions(plan)){
   const match=/^Does (.+) transfer to (.+)\?$/.exec(item.q);
   if(match){
    assert.equal(match[2],plan.school);
    const found=plan.model.requirements.flatMap(req=>(req.options||[]).map(option=>({req,option}))).filter(({option})=>option.provider+' '+option.title===match[1]);
    assert(found.length,plan.id+': '+item.q+' names a course in the plan');
    const classes=found.map(({option})=>evidenceClass(option,sources));
    assert(classes.some(cls=>cls!=='other'),'only school or provider-published evidence is cited');
    if(item.a.startsWith('Yes'))assert(plan.tier!=='confirmation'&&found.some(({option})=>evidenceClass(option,sources)==='school'&&option.evidence==='published'),plan.id+': an unconditional yes needs published school evidence');
    if(/publishes this match/.test(item.a))assert.match(item.a,/does not come from/);
   }
   if(/^How many credits can I transfer/.test(item.q))assert(item.a.includes(' is '+plan.model.externalMaxCredits+' '+plan.unit),plan.id);
   if(/^How much does this plan cost/.test(item.q)){const range=plan.estimate.costs.knownRange;assert(item.a.includes(money(range.min)+' to '+money(range.max)),plan.id);}
  }
  const line=planAnswerLine(plan);assert(plan.outside===0||line.startsWith(plan.outside+' of the '+plan.total+' '+plan.unit),plan.id);
 }
});

test('open choices on a public page link to that degree’s community discussion with absolute URLs',()=>{
 const slotPlan=plans.find(plan=>plan.id==='apus-bachelor-of-arts-in-psychology');assert(slotPlan);
 const html=renderPublicPlan(slotPlan,plans);
 assert.match(html,/id="seo-choices"/);assert.match(html,/Choose any approved /);
 assert.doesNotMatch(html,/href="community\.html/,'relative community links would break under /degree-plans/');
 assert.match(html,/href="\/community\.html\?tab=feed&amp;context=program%3Acurriculum-apus-bachelor-of-arts-in-psychology/);
});

test('the built site lists every plan page in the sitemap with one title and canonical each',async()=>{
 const sitemap=await readFile(new URL('../dist/sitemap.xml',import.meta.url),'utf8');
 const titles=new Set(),canonicals=new Set();
 for(const plan of plans){
  assert(sitemap.includes('<loc>https://degreesteps.com'+plan.path+'</loc>'),plan.path);
  const html=await readFile(new URL('../dist'+plan.path+'index.html',import.meta.url),'utf8');
  const title=/<title>([^<]*)<\/title>/.exec(html)[1],canonical=/<link rel="canonical" href="([^"]+)"/.exec(html)[1];
  assert(!titles.has(title)&&!canonicals.has(canonical),plan.path);titles.add(title);canonicals.add(canonical);
  assert.equal(canonical,'https://degreesteps.com'+plan.path);
  const types=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1])['@type']);
  for(const type of ['WebPage','EducationalOccupationalProgram','FAQPage','BreadcrumbList'])assert(types.includes(type),plan.path+' '+type);
 }
});
