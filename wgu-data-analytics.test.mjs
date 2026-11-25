import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {assessPathwayQuality,compileScopedResearchNotices} from './scripts/pathway-quality.mjs';
import {validateDataAnalyticsReview,REVIEW_PATH,PROGRAM,ROUTE} from './scripts/wgu-data-analytics.mjs';
import {loadDataAnalyticsIdentities} from './scripts/wgu-data-analytics-identities.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');
const read=async path=>JSON.parse(await readFile(path,'utf8'));

test('independent provider review preserves source units, current issuer evidence and dated recommendation facts',async()=>{
  const review=await loadDataAnalyticsIdentities();assert.equal(review.bundle.courses.length,18);
  assert.deepEqual(review.packet.courses.map(course=>[course.code,course.sourceCredits,course.sourceCreditSystem,course.sourceUpper]),[['SDCM-0210',3,'semester',false],['SDCM-0218',3,'semester',false],['SOPH-0062',3,'semester',false]]);
  for(const course of review.packet.courses){assert(!Object.hasOwn(course,'credits'));assert(!Object.hasOwn(course,'courseVersion'));assert(!Object.hasOwn(course,'recommendationEnd'));}
  for(const source of review.packet.sources.filter(source=>source.captureMethod==='native-public-web-rendered-extract')){assert.equal(source.rawBodyCaptured,false);assert(!Object.hasOwn(source,'status'));}
  const composition=review.sophiaCandidates.find(course=>course.code==='SOPH-0015');assert(composition.recommendationPeriodSourceIds.length>0);
  assert(!composition.identitySourceIds.includes('wgu-global-sophia--sophia-ace-composition-i-period-2026-11-19'),'Period indexes remain period evidence instead of being mislabeled original-course credit exhibits');
  await assert.rejects(()=>loadDataAnalyticsIdentities({asOf:'2026-11-24'}));
});

test('BSDA curriculum and every receiving agreement belong to exact active program92/catalog202309',async()=>{
  const review=await validateDataAnalyticsReview(await read(REVIEW_PATH));
  assert.equal(review.program.programId,92);assert.equal(review.program.catalog,'202309');
  for(const change of [value=>value.program.programId=254,value=>value.totalCredits++,value=>value.programRecordVersion++,value=>value.capstoneCourseCodes=['D687'],value=>value.captures.find(source=>source.provider==='Study.com').agreementRecordVersion++]){
    const changed=structuredClone(review);change(changed);await assert.rejects(()=>validateDataAnalyticsReview(changed));
  }
});

test('new Data Analytics plan is complete, deduplicated, within program-specific CU rules and publication-ready',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),verified=await verifyKit(kit,{asOf:'2026-11-25'});assert.deepEqual(verified.errors,[]);
  const {doc,documents}=compileKit(kit);await runGuards(kit,doc);
  const source=doc.models.find(model=>model.id==='curriculum-wgu-bs-data-analytics-reviewed');assert(source);
  const review=await read(REVIEW_PATH);assert.equal(source.catalog,'202309');assert.equal(source.totalCredits,review.totalCredits);assert.equal(source.requirements.length,review.requirements);
  assert.equal(source.requirements.reduce((sum,row)=>sum+row.credits,0),source.totalCredits);assert.equal(source.externalMaxCredits,source.totalCredits*.75);assert.equal(source.alternativeMaxCredits,source.totalCredits*.75);
  assert.equal(source.pricing.amount,4125);assert.equal(source.pricing.amount,source.pricing.tuitionPerTerm+source.pricing.resourceFeePerTerm);
  const compiled=structuredClone(source);for(const row of compiled.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
  const model=compileScopedResearchNotices(compiled,{asOf:'2026-11-25'}),providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University');
  const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.equal(plan.rows.length,source.requirements.length);
  const outside=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+':'+row.option.code)).size,outside.length);
  assert(outside.reduce((sum,row)=>sum+row.credits,0)>=source.totalCredits*.5);assert(plan.totals.external<=source.totalCredits*.75);
  const capstone=model.requirements.find(row=>model.residencyPolicy.capstoneRequirementIds.includes(row.id));assert.equal(capstone.institutionalOnly,true);assert.equal(plan.rows.find(row=>row.requirementId===capstone.id).option.provider,'University');
  for(const row of outside){const option=row.option;assert.equal(option.sourceCreditSystem,'semester');assert(option.sourceCredits>0);assert.equal(option.creditSystem,'competency-unit');assert.equal(option.universityMapRecord.programId,92);assert.equal(option.universityMapRecord.catalogTerm,'202309');assert.equal(option.credits,row.credits);}
  const database=model.requirements.find(row=>row.code==='D427').options.find(option=>option.code==='SDCM-0218');assert.equal(database.sourceCredits,3);assert.equal(database.credits,4);
  const discrete=model.requirements.filter(row=>['D420','D421'].includes(row.code)).flatMap(row=>row.options.filter(option=>option.code==='SDCM-0210'));assert.equal(discrete.length,2);for(const option of discrete){assert.equal(option.sourceCredits,3);assert.equal(option.credits,1);}assert.equal(outside.filter(row=>row.option.code==='SDCM-0210').length,1);
  const quality=assessPathwayQuality({model,plan,route:{...ROUTE,modelId:model.id},asOf:'2026-11-25'});assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings.filter(finding=>finding.blocking)));
  assert(quality.execution.personalTasks.some(task=>/admission/.test(task.message)));
  assert(!model.requirements.find(row=>row.code==='C955').options.some(option=>option.code==='SDCM-0025'),'The known Business212/SDCM0025 conflict remains held in the new program');
  assert(documents.find(document=>document.path==='content/curricula/wgu-pathway-kit.json').doc.models.some(model=>model.id===source.id));
  assert(kit.school.programOrder.includes(PROGRAM.slug));assert(kit.school.routes.some(route=>route.id===ROUTE.id));
});

test('the BSDA route does not alter other compiled WGU programs',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),withNew=compileKit(kit);
  const original=structuredClone({...kit,providers:undefined});original.providers=kit.providers;
  original.programs=original.programs.filter(program=>program.slug!==PROGRAM.slug);
  original.equivalencies.equivalencies=original.equivalencies.equivalencies.filter(row=>!row.scope?.programs?.includes(PROGRAM.slug));
  original.school.routes=original.school.routes.filter(route=>route.id!==ROUTE.id);
  for(const document of original.school.publish.documents){if(document.programs)document.programs=document.programs.filter(slug=>slug!==PROGRAM.slug);if(document.routes)document.routes=document.routes.filter(route=>route.id!==ROUTE.id);}
  const before=compileKit(original);
  assert.equal(before.doc.models.length,kit.programs.length-1);assert.deepEqual(withNew.doc.models.filter(model=>model.id!=='curriculum-wgu-bs-data-analytics-reviewed'),before.doc.models);
  assert.deepEqual(withNew.documents.find(document=>document.path==='content/curricula/wgu.json'),before.documents.find(document=>document.path==='content/curricula/wgu.json'));
});
