import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import {applyLibertyProviderIdentities,applyLibertyProviderCourseCatalog,applyLibertyBaselineDuplicatePolicy,applyLibertyBaselineReceivingReview,libertyProviderIdentityReview as review} from './scripts/liberty-provider-identities.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
function model(overrides={}){return {id:'sample-liberty',school:'Liberty University',level:'associate',format:'Online',catalog:'2026-2027',requirements:[{id:'elective',code:'SCOM 1XX',credits:1,options:[{id:'teams',provider:'Sophia',code:'SOPH-0021',title:'Developing Effective Teams',credits:1,creditSystem:'semester',receivingCode:'SCOM 1XX',evidence:'conditional',sourceIds:['guide'],mappingReviewId:'old-review',mappingChecked:'2026-11-10'}]}],sources:[{id:'guide',url:'https://www.liberty.edu/online/guide.pdf'}],...overrides};}
test('current provider facts keep receiving awards, evidence status and review dates independent',()=>{
 const original=model(),before=copy(original),result=applyLibertyProviderIdentities(original),option=result.requirements[0].options[0];
 assert.deepEqual(original,before);assert.equal(option.sourceCredits,1);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.courseVersion,'4');assert.equal(option.recommendationStart,'2024-10-01');assert.equal(option.recommendationEnd,'2027-09-30');
 assert.equal(option.credits,1);assert.equal(option.receivingCode,'SCOM 1XX');assert.equal(option.evidence,'conditional');assert.equal(option.mappingReviewId,'old-review');assert.equal(option.mappingChecked,'2026-11-10');assert.deepEqual(option.sourceIds,['guide']);
 assert(option.identitySourceIds.some(id=>id.includes('current-provider')));assert(option.identitySourceIds.some(id=>id.includes('current-ace')));assert(option.recommendationPeriodSourceIds.every(id=>result.sources.some(source=>source.id===id)));
 assert.deepEqual(applyLibertyProviderIdentities(result),result);
});
test('source quantities are distinct from receiving quantities and conflicts stay unresolved',()=>{
 const m=model();m.requirements[0].options[0].credits=3;const result=applyLibertyProviderIdentities(m);assert.equal(result.requirements[0].options[0].credits,3);assert.equal(result.requirements[0].options[0].sourceCredits,1);
 for(const fields of [{sourceCredits:3},{sourceCreditSystem:'quarter'},{courseVersion:'1'},{recommendationStart:'2021-01-01'},{recommendationEnd:'2023-12-31'}]){
  const input=model();Object.assign(input.requirements[0].options[0],fields);assert.deepEqual(applyLibertyProviderIdentities(input),input);
 }
});
test('same names, ambiguous identities, other providers, catalogs and institutions cannot borrow facts',()=>{
 for(const fields of [{school:'Other University'},{format:'Hybrid'},{catalog:'2025-2026'},{level:'master'}]){const input=model(fields);assert.equal(applyLibertyProviderIdentities(input),input);}
 for(const fields of [{provider:'Study.com'},{code:'Unknown',title:'Developing Effective Teams'},{codeAliases:['SOPH-0041']}]){const input=model();Object.assign(input.requirements[0].options[0],fields);assert.deepEqual(applyLibertyProviderIdentities(input),input);}
 const future=copy(review);future.courses[0].recommendationStart='2027-02-01';future.courses[0].recommendationEnd='2030-01-31';assert.throws(()=>applyLibertyProviderIdentities(model(),future),/future or expired ACE period/);
});
test('all ten exact source identities bind finite current ACE periods and preserve retirement warning',()=>{
 assert.equal(review.courses.length,10);
 const science=review.courses.find(course=>course.aceId==='SOPH-0016'),greek=review.courses.find(course=>course.aceId==='SOPH-0027');assert.equal(science.providerCourseCode,'SCIE1005');assert.equal(science.aceVersion,5);assert.equal(greek.providerRetirementMonth,'2027-05');assert.equal(greek.recommendationEnd,'2027-05-31');
 for(const course of review.courses){assert(course.recommendationStart<'2026-11-18');assert(course.recommendationEnd>'2026-11-18');assert.equal(course.sourceUpper,false);assert.equal(course.minimumPassingScore,70);assert(course.recommendationPeriodSourceIds.every(id=>review.sources.find(source=>source.id===id)?.kind==='ace'));}
});
test('Health, Fitness, and Wellness binds the current version instead of its future recommendation',()=>{
 const course=review.courses.find(course=>course.aceId==='SOPH-0080');assert.equal(course.aceVersion,2);assert.equal(course.providerCourseCode,'HLTH1011');assert.equal(course.recommendationStart,'2024-02-01');assert.equal(course.recommendationEnd,'2027-01-31');assert(course.aceUrl.includes('7fae248f-7dd5-ee11-9079-000d3a5cb302'));assert.equal(course.futureRecommendation.aceVersion,3);assert.equal(course.futureRecommendation.appliedToCurrentOption,false);
 const input=model();Object.assign(input.requirements[0].options[0],{code:course.aceId,codeAliases:[],title:course.title,credits:3,receivingCode:'HLTH 216'});
 const result=applyLibertyProviderIdentities(input),option=result.requirements[0].options[0];assert.equal(option.courseVersion,'2');assert.equal(option.recommendationEnd,'2027-01-31');assert(option.conditions.some(condition=>condition.includes('January 31, 2027')));
 const future=copy(input);future.requirements[0].options[0].courseVersion='3';assert.deepEqual(applyLibertyProviderIdentities(future),future);
});
test('catalog identities use exact stored listing URLs and preserve course IDs and receiving references',()=>{
 const catalog=JSON.parse(readFileSync(new URL('./dist/data/course-catalog.json',import.meta.url),'utf8')),result=applyLibertyProviderCourseCatalog(catalog);
 for(const course of review.courses){const original=catalog.courses.find(row=>row.id===course.primaryListingId),next=result.courses.find(row=>row.id===course.primaryListingId);assert.equal(next.url,original.url);assert.deepEqual(next.mappedCourseIds,original.mappedCourseIds);assert.equal(next.mappingCode,course.aceId);assert.equal(next.credits,course.sourceCredits);assert.equal(next.recommendationEnd,course.recommendationEnd);}
 assert.deepEqual(applyLibertyProviderCourseCatalog(result),result);
});
test('the exact full-catalog rule supports a personal record task while an unverified policy stays held',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./dist/data/liberty.json',import.meta.url),'utf8')),message='DegreeSteps is reviewing duplicate-award exclusions for the selected one-credit Sophia electives against any prior awards.';
 baseline.unresolved=baseline.unresolved.filter(item=>!(item.owner==='student'&&item.message?.includes('duplicate-credit check')));
 baseline.unresolved.push({message,owner:'DegreePath',status:'unresolved',sourceIds:['sophia','policy']});
 const result=applyLibertyBaselineDuplicatePolicy(baseline);
 assert(baseline.unresolved.some(item=>item.message===message));assert(!result.unresolved.some(item=>item.message===message));assert(result.unresolved.some(item=>item.owner==='student'&&item.message.includes('duplicate-credit check')));assert(result.unresolved.some(item=>item.missingEvidence==='reviewed-source-identity'));assert.deepEqual(result.requirements,baseline.requirements);assert.deepEqual(applyLibertyBaselineDuplicatePolicy(result),result);
 const held=copy(review);held.duplicateAwardReview.status='awaiting-exact-current-rule-body';assert.equal(applyLibertyBaselineDuplicatePolicy(baseline,held),baseline);
 const changed=copy(baseline);changed.requirements.find(row=>row.id==='free-teams-1').code='CSIS 1XX';assert.equal(applyLibertyBaselineDuplicatePolicy(changed),changed);
});
test('independent current guide reviews bind only the seven unchanged published residential business awards',()=>{
 const original=JSON.parse(readFileSync(new URL('./dist/data/liberty.json',import.meta.url),'utf8')),result=applyLibertyBaselineReceivingReview(original);
 for(const proof of review.receivingAwardReview.awards){const before=original.requirements.find(row=>row.id===proof.requirementId).options.find(option=>option.code===proof.aceId),after=result.requirements.find(row=>row.id===proof.requirementId).options.find(option=>option.code===proof.aceId);assert.equal(after.evidence,before.evidence);assert.equal(after.credits,before.credits);assert.equal(after.receivingCode,proof.receivingCode);assert.equal(after.mappingChecked,'2026-11-18');assert(after.sourceIds.includes(review.receivingAwardReview.sourceId));}
 assert.deepEqual(applyLibertyBaselineReceivingReview(result),result);
 const online={...copy(original),format:'Online'};assert.equal(applyLibertyBaselineReceivingReview(online),online);
 const changed=copy(original);changed.requirements.find(row=>row.id==='envr-215').credits=4;assert.deepEqual(applyLibertyBaselineReceivingReview(changed).requirements.find(row=>row.id==='envr-215'),changed.requirements.find(row=>row.id==='envr-215'));
 const conditional=copy(original);conditional.requirements.find(row=>row.id==='envr-215').options.find(option=>option.code==='SOPH-0016').evidence='conditional';assert.equal(applyLibertyBaselineReceivingReview(conditional).requirements.find(row=>row.id==='envr-215').options.find(option=>option.code==='SOPH-0016').evidence,'conditional');
});
test('the actual business baseline closes documented research while keeping personal awards and prices separate',()=>{
 const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),baseline=JSON.parse(readFileSync(new URL('./dist/data/liberty.json',import.meta.url),'utf8'));
 const model=applyLibertyProviderIdentities(applyLibertyBaselineDuplicatePolicy(applyLibertyBaselineReceivingReview(baseline))),providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University');
 const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000}),quality=assessPathwayQuality({model,plan,asOf:'2026-11-18'});
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.researchNotes.length,0);assert.equal(quality.status,'research-ready');assert.equal(quality.publication.ready,true);assert.equal(quality.metrics.feasibleOutsideCredits,83);assert.equal(quality.execution.awardedCreditsInBaseline,0);assert(quality.execution.personalTasks.some(task=>task.message.includes('duplicate-credit check')));assert.equal(quality.estimates.cost.status,'partial-estimate');
});
