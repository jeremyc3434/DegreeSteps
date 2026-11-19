import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {applyLibertyCJStudyIdentities as apply,libertyCJStudyIdentityReview as review} from './scripts/liberty-cj-study-identities.mjs';
const require=createRequire(import.meta.url),P=require('./dist/planner.js'),clone=value=>JSON.parse(JSON.stringify(value));
const read=format=>JSON.parse(readFileSync(new URL('./dist/data/liberty-criminal-justice-'+format+'.json',import.meta.url),'utf8'));
const target=(model,proof)=>model.requirements.find(row=>row.id===proof.requirementId).options.find(option=>option.provider==='Study.com'&&option.code===proof.aceId);
const generate=model=>P.generate(model,{providers:[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University'),allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});

test('two current Study identity reviews preserve the existing published receiving awards and fresh academic feasibility',()=>{
 for(const proof of review.courses){
  const input=read(proof.format.toLowerCase()),before=JSON.stringify(input),old=clone(target(input,proof)),model=apply(input),option=target(model,proof),plan=generate(model);
  assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(apply(model)),JSON.stringify(model));
  assert.equal(option.courseVersion,String(proof.aceVersion));assert.equal(option.recommendationStart,proof.recommendationStart);assert.equal(option.recommendationEnd,proof.recommendationEnd);assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceUpper,false);assert.equal(option.providerCoursePassingPercent,70);
  for(const key of ['credits','receivingCode','evidence','mappingChecked','guideUpdated','conditions','minScore','minimumTransferGrade'])assert.deepEqual(option[key],old[key],key);
  assert(option.mappingReviewId);assert(option.identitySourceIds.includes(proof.identitySourceIds[0]));assert(option.sourceIds.includes(proof.receivingGuideSourceId));assert.equal(plan.validation.academicCountsValid,true);assert(plan.rows.every(row=>row.status==='planned'));assert.equal(plan.rows.reduce((sum,row)=>sum+row.credits,0),120);
 }
});
test('historical recommendation windows, source quantities, and versions are never silently replaced',()=>{
 const proof=review.courses[1];
 for(const change of [{courseVersion:'3'},{recommendationStart:'2023-11-01',recommendationEnd:'2026-10-31'},{sourceCredits:4},{sourceCreditSystem:'quarter'},{evidence:'conditional'},{receivingCode:'OTHER 100'}]){
  const model=read('residential');Object.assign(target(model,proof),change);const before=JSON.stringify(model);assert.equal(apply(model),model);assert.equal(JSON.stringify(model),before);
 }
});
test('other degrees, delivery formats, catalogs and private student-provided models are outside the review',()=>{
 for(const change of [{id:'another-degree'},{format:'Residential'},{catalog:'2025-2026',catalogYear:'2025-2026'},{auditProvenance:{status:'student-provided'}}]){
  const model=read('online');Object.assign(model,change);assert.equal(apply(model),model);
 }
});
test('source authorities and exact current ACE periods are required for a supporting review',()=>{
 const input=read('online');
 for(const mutate of [packet=>packet.sources[0].url='https://forum.example/guesses',packet=>packet.sources[0].sourceHtmlSha256=null,packet=>packet.courses[0].recommendationStart='2027-05-01',packet=>packet.sources.find(source=>source.id===packet.courses[0].receivingGuideSourceId).scope.format='Residential']){
  const packet=clone(review);mutate(packet);assert.throws(()=>apply(input,packet));
 }
 assert(review.sources.filter(source=>source.kind==='provider').every(source=>source.rawBodyCaptured===false&&!source.sourceHtmlSha256));
});
