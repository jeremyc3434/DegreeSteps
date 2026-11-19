import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPublicPlans,buildPublicPlan,publicPlanDefinitions,renderPublicPlan,renderPublicPlanHub} from './public-plan-pages.mjs';
const plans=await loadPublicPlans();

test('public degree previews reproduce the four reviewed zero-record baselines in their actual receiving units',()=>{
 assert.equal(plans.length,4);
 for(const plan of plans){
  assert.equal(plan.plan.validation.academicCountsValid,true);assert.equal(plan.quality.publication.ready,true);
  assert.equal(plan.plan.totals.accounted,plan.total);assert.equal(plan.plan.totals.external,plan.outside);assert.equal(plan.plan.totals.institutional,plan.university);
  assert.equal(plan.view.progress.completedCredits,0);assert.equal(plan.plan.totals.confirmed,0);assert.equal(plan.plan.totals.reported,0);
  assert.equal(plan.view.totals.unmapped,0);assert.equal(plan.view.curriculumIssues.length,0);
 }
 assert.deepEqual(plans.map(plan=>[plan.outside,plan.university,plan.total]),[[69,41,110],[83,37,120],[72,48,120],[74,46,120]]);
 assert.equal(plans[0].unit,'competency units');assert(plans.slice(1).every(plan=>plan.unit==='semester credits'));
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
