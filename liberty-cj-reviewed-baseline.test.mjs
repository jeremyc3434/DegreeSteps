import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {applyLibertyCJReviewedBaseline as apply} from './scripts/liberty-cj-reviewed-baseline.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const review=read('./content/curricula/snapshots/liberty/criminal-justice-baselines-2026-2027-reviewed.json');
const model=format=>read('./dist/data/liberty-criminal-justice-'+format+'.json');
const generate=model=>Planner.generate(model,{providers:[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University'),allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});

test('CJ note classification preserves exact academic choices, source dates and zero-record feasibility',()=>{
 for(const format of ['online','residential']){
  const input=model(format),before=JSON.stringify(input),oldPlan=generate(input),output=apply(input,review),plan=generate(output);
  const academicOptions=rows=>rows.map(row=>[row.id,row.credits,row.prerequisites,row.options.map(option=>[option.id,option.provider,option.code,option.credits,option.evidence,option.receivingCode,option.courseVersion,option.recommendationStart,option.recommendationEnd,option.minScore])]);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(academicOptions(output.requirements),academicOptions(input.requirements));for(const source of input.sources)assert.deepEqual(output.sources.find(item=>item.id===source.id),source);assert.equal(JSON.stringify(apply(output,review)),JSON.stringify(output));
  assert.equal(plan.validation.academicCountsValid,true);assert.deepEqual(plan.rows.map(row=>[row.requirementId,row.option?.id,row.status]),oldPlan.rows.map(row=>[row.requirementId,row.option?.id,row.status]));assert(plan.rows.every(row=>row.status==='planned'));
  for(const row of plan.rows.filter(row=>row.option.provider==='University'))assert.equal(output.requirements.find(requirement=>requirement.id===row.requirementId).prerequisitePolicy?.status,'verified','Every selected university baseline course needs its actual reviewed prerequisite block');
  assert.equal(output.policyEvidence.majorResidencyBasisCredits.value,45);assert.equal(output.majorMinInstitutionCredits,12);assert.equal(output.cjBaselineClassificationReview.newSourceRetrievals,true);
 }
});
test('the exact catalog, format and major ledger are required for reviewed classifications',()=>{
 for(const mutate of [m=>m.catalog='2025-2026',m=>m.format='Other',m=>m.majorResidencyBasisCredits=48,m=>m.requirements.find(row=>row.category==='major').credits=4,m=>m.appliedTransferWaiver=true]){
  const input=model('online');mutate(input);assert.throws(()=>apply(input,review));
 }
 const other={id:'another-degree',unresolved:['An unknown requirement']};assert.equal(apply(other,review),other);
});
test('personal tasks and optional waivers never erase precise unfinished research or waive retained credits',()=>{
 const input=model('residential');input.unresolved.push('An unknown essential academic rule still needs evidence.');const output=apply(input,review);
 assert(output.unresolved.some(note=>note==='An unknown essential academic rule still needs evidence.'));
 assert(output.unresolved.some(note=>note.owner==='student'&&note.status==='personal-task'&&note.sourceIds.length));
 assert(output.unresolved.some(note=>note.status==='unresolved'&&note.missingEvidence==='reviewed-source-identity'));
 assert(output.unresolved.some(note=>note.status==='unresolved'&&note.id.endsWith(':remaining-prerequisites')));
 assert(output.unresolved.some(note=>note.status==='resolved'&&note.id.endsWith(':one-credit-published')));assert(output.unresolved.some(note=>note.owner==='student'&&note.status==='personal-task'&&note.id.endsWith(':one-credit-personal-duplicate')));assert(!output.unresolved.some(note=>note.status==='unresolved'&&note.id.endsWith(':one-credit-duplicates')));
 const retained=review.scopes.find(scope=>scope.modelId===input.id).retainedBaselineRequirements;
 assert(retained.every(id=>output.requirements.find(row=>row.id===id)?.credits===input.requirements.find(row=>row.id===id)?.credits));assert.equal(output.appliedTransferWaiver,undefined);
});
