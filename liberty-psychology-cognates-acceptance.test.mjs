import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Planner from './dist/planner.js';
import CoursePlanView from './dist/course-plan-view.js';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const packet=read('./content/curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json'),registry=read('./dist/data/curriculum-registry.json');
const expected={
 'psychology-criminal-psychology-online':60,
 'psychology-developmental-psychology-online':63,
 'psychology-christian-counseling-online':69,
 'psychology-crisis-counseling-online':69,
 'psychology-military-resilience-online':69
};
for(const item of packet.programs)test(item.slug+' is a usable publication-ready complete route with no fictional credit',()=>{
 const entry=registry.models.find(model=>model.id===item.modelId);assert(entry,'Run factory:refresh to publish the authored cohort before acceptance');
 const model=read('./dist/'+entry.path).models.find(model=>model.id===item.modelId),input={providers:['Sophia','Study.com','StraighterLine','CLEP','DSST'],allowConditional:false,priority:'transfer',completed:[],optionSelections:model.reviewedBaselineChoices.optionSelections,optimizationNodeBudget:12000};
 const plan=Planner.generate(model,input),quality=assessPathwayQuality({model,plan,asOf:'2026-11-27'});
 assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings));assert.equal(quality.research.blockingFindings,0);assert.equal(quality.research.conditionalFindings,0);
 assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.external,expected[item.slug]);assert.equal(plan.totals.institutional,120-expected[item.slug]);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);
 assert(plan.rows.every(row=>row.option.code&&!row.selectionRequired&&row.status==='planned'));
 const outside=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+'|'+row.option.code)).size,outside.length);assert(outside.some(row=>row.option.provider==='Study.com'));assert(outside.some(row=>row.option.provider==='Sophia'));
 const view=CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{});assert.deepEqual(view.curriculumIssues,[]);assert.equal(view.sections.reduce((n,section)=>n+section.credits,0),120);
 const publication=read('./dist/data/publication-index.json').plans.find(plan=>plan.modelId===item.modelId);assert.equal(publication?.publicationReady,true);assert(publication.routeIds.includes(item.routeId));
});
