import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPublicPlans,buildPublicPlan,publicPlanDefinitions,renderPublicPlan,renderPublicPlanHub,removeObsoletePreviews} from './public-plan-pages.mjs';
const plans=await loadPublicPlans();

test('public degree previews reproduce all fully reviewed zero-record baselines in their actual receiving units',async()=>{
 const quality=JSON.parse(await readFile(new URL('../dist/data/pathway-quality-report.json',import.meta.url),'utf8'));
 assert(plans.length>=4);assert.deepEqual(new Set(plans.map(plan=>plan.modelId)),new Set(quality.programs.filter(program=>program.publication.ready).map(program=>program.modelId)));
 for(const plan of plans){
  assert.equal(plan.plan.validation.academicCountsValid,true);assert.equal(plan.quality.publication.ready,true);
  assert.equal(plan.plan.totals.accounted,plan.total);assert.equal(plan.plan.totals.external,plan.outside);assert.equal(plan.plan.totals.institutional,plan.university);
  assert.equal(plan.view.progress.completedCredits,0);assert.equal(plan.plan.totals.confirmed,0);assert.equal(plan.plan.totals.reported,0);
  assert.equal(plan.view.totals.unmapped,0);assert.equal(plan.view.curriculumIssues.length,0);
 }
 assert.deepEqual(plans.slice(0,4).map(plan=>[plan.outside,plan.university,plan.total]),[[69,41,110],[83,37,120],[72,48,120],[74,46,120]]);
 assert.equal(plans[0].unit,'competency units');assert(plans.slice(1,4).every(plan=>plan.unit==='semester credits'));
});

test('crawlable course tables contain every requirement once and keep shared references and noncredit work outside credit totals',()=>{
 for(const plan of plans){
  const html=renderPublicPlan(plan,plans);
  const allocations=[...html.matchAll(/data-degree-credits="([0-9.]+)"/g)].map(match=>Number(match[1]));
  assert.equal(allocations.reduce((total,value)=>total+value,0),plan.total,plan.id);
  const ids=[...html.matchAll(/data-requirement-ids="([^"]+)"/g)].flatMap(match=>match[1].split(' '));
  assert.equal(ids.length,plan.model.requirements.length);assert.equal(new Set(ids).size,ids.length);
  for(const requirement of plan.model.requirements)assert(ids.includes(requirement.id),requirement.id);
  assert(html.includes('data-growth-plan="'+plan.id+'"'));assert(html.includes(plan.useHref));assert.match(html,/No account or transcript needed/);
  assert(!html.includes('data-growth-plan="'+plan.modelId+'"')||plan.modelId===plan.id);
  assert(!/\$334\b|guaranteed graduation|School confirmed/i.test(html));
 }
 const liberty=renderPublicPlan(plans[1],plans);assert.match(liberty,/Christian service/);assert.match(liberty,/counted in its primary section/);
 assert.match(renderPublicPlan(plans[0],plans),/\$4,050 per 6 months/);
});

test('source changes cannot silently publish an incomplete or mismatched degree preview',()=>{
 const plan=plans[0],definition=publicPlanDefinitions[0],entry={routeIds:[plan.id]};
 const build=patch=>buildPublicPlan(definition,{model:plan.model,entry,baseline:plan.baseline,quality:plan.quality,...patch});
 assert.throws(()=>build({quality:{publication:{ready:false}}}),/publication-ready/);
 const wrong=structuredClone(plan.baseline);wrong.rows[0].optionId='not-a-reviewed-option';assert.throws(()=>build({baseline:wrong}),/selection/);
 assert.throws(()=>build({model:{...plan.model,totalCredits:120}}),/degree size/);
 assert.throws(()=>build({entry:{routeIds:['different-route']}}),/exact curriculum/);
});

test('hub cards lead to full public routes while only full previews declare a measured plan view',()=>{
 const html=renderPublicPlanHub(plans);assert(!html.includes('data-growth-plan='));
 for(const plan of plans)assert(html.includes(plan.path));
 assert.match(html,/Browse available plans/);assert.match(html,/import-courses.html/);
});

test('public plan prices use their actual selected courses with visible assumptions and no private record awards',async()=>{
 const rates=JSON.parse(await readFile(new URL('../dist/data/plan-estimate-rates.json',import.meta.url),'utf8'));
 const priced=new Set(rates.entries.flatMap(entry=>entry.modelIds));
 for(const plan of plans.filter(plan=>priced.has(plan.modelId))){
  assert.equal(plan.estimate.available,true,plan.id);assert.equal(plan.estimate.costs.complete,false);
  assert.equal(plan.estimate.counts.totalUnits,plan.total);
  const html=renderPublicPlan(plan,plans);
  assert.match(html,/Cost & timing/);assert.match(html,/Before aid/);assert.match(html,/Rates, pace assumptions &amp; exclusions|Rates, pace assumptions & exclusions/);
  assert.match(html,/not a complete cost of attendance/);assert.match(html,/No account or transcript needed/);
 }
});

test('withdrawn generated previews disappear while approved plans and unrelated material remain',async t=>{
 const dist=await mkdtemp(join(tmpdir(),'degreesteps-preview-review-'));t.after(()=>rm(dist,{recursive:true,force:true}));
 const generated='<article data-public-plan-id="example"><section class="public-plan-hero">A proposed course plan</section></article>';
 for(const [name,html] of [['approved',generated],['withdrawn',generated],['manual-guide','<h1>A manually maintained student guide</h1>'],['with-assets',generated]]){
  await mkdir(join(dist,'degree-plans',name),{recursive:true});await writeFile(join(dist,'degree-plans',name,'index.html'),html);
 }
 await writeFile(join(dist,'degree-plans','with-assets','keep.txt'),'Keep this unrelated asset.');
 assert.deepEqual(await removeObsoletePreviews(dist,[{slug:'approved'}]),['/degree-plans/withdrawn/','/degree-plans/with-assets/'].sort());
 await access(join(dist,'degree-plans','approved','index.html'));await access(join(dist,'degree-plans','manual-guide','index.html'));await access(join(dist,'degree-plans','with-assets','keep.txt'));
 await assert.rejects(access(join(dist,'degree-plans','withdrawn','index.html')),{code:'ENOENT'});
 assert.deepEqual(await removeObsoletePreviews(dist,[{slug:'approved'}]),[]);
});

test('plan pages list only the sources the plan cites, grouped, without the shared school document',async()=>{
 const {referencedSourceIds}=await import('./public-plan-pages.mjs');
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../dist/degree-plans/wgu-marketing/index.html',import.meta.url),'utf8');
 const count=Number(/Sources for this plan \((\d+)\)/.exec(html)?.[1]);
 const doc=JSON.parse(await readFile(new URL('../dist/data/curricula/wgu.json',import.meta.url),'utf8')),model=doc.models.find(m=>/Marketing/.test(m.title));
 assert.equal(count,model.sources.filter(source=>referencedSourceIds(model).has(source.id)&&/^https:/.test(source.url)).length);
 assert.ok(count<model.sources.length,'unrelated program sources are not listed');
 assert.doesNotMatch(html,/Nursing|Master of Business Administration \(MBA\) program guide/i);
 assert.doesNotMatch(html,/class="public-plan-degree"/,'the degree title is not repeated under the heading');
});
