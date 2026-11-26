import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {assessPathwayQuality,compileScopedResearchNotices} from './scripts/pathway-quality.mjs';
import {PROGRAMS,routes,REVIEW_PATH,validateCloudNetworkReview} from './scripts/wgu-cloud-network.mjs';
import {promotedCodes,renamedSophiaSource,promoteSophiaIdentities,applySophiaPromotions,verifySophiaPromotions} from './scripts/wgu-promote-sophia-identities.mjs';
import {loadDataAnalyticsIdentities} from './scripts/wgu-data-analytics-identities.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');
const read=async path=>JSON.parse(await readFile(path,'utf8'));

test('each cloud track has independently scoped active metadata, exact maps and a distinct current nontransferable capstone',async()=>{
  const review=await validateCloudNetworkReview(await read(REVIEW_PATH));
  assert.deepEqual(review.programs.map(item=>[item.program.programId,item.totalCredits,item.requirements,item.capstoneCourseCodes[0]]),[[246,109,34,'E029'],[247,112,35,'E030'],[248,112,32,'E032'],[249,112,35,'E031']]);
  const changed=structuredClone(review);changed.programs[1].program.programId=246;await assert.rejects(()=>validateCloudNetworkReview(changed));
  const changedCap=structuredClone(review);changedCap.programs[2].capstoneCourseCodes=['E030'];await assert.rejects(()=>validateCloudNetworkReview(changedCap));
});

test('four complete self-paced cloud plans pass publication quality with exact CU caps and one use per original source',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),verified=await verifyKit(kit,{asOf:'2026-11-26'});assert.deepEqual(verified.errors,[]);
  const {doc}=compileKit(kit);await runGuards(kit,doc);
  const qualities=[];
  for(const program of PROGRAMS){
    const authored=kit.programs.find(item=>item.slug===program.slug),compiled=doc.models.find(model=>model.id===authored.modelId);assert(compiled);
    assert.equal(compiled.catalog,'202608');assert.equal(compiled.externalMaxCredits,compiled.totalCredits*.75);assert.equal(compiled.alternativeMaxCredits,compiled.totalCredits*.75);
    assert.equal(compiled.residencyPolicy.calculatedMinimumInstitutionCUs,compiled.totalCredits*.25+4);
    assert.equal(compiled.requirements.reduce((sum,row)=>sum+row.credits,0),compiled.totalCredits);assert.equal(compiled.pricing.amount,4125);
    const executable=structuredClone(compiled);for(const row of executable.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
    const model=compileScopedResearchNotices(executable,{asOf:'2026-11-26'}),plan=Planner.generate(model,{providers:['Study.com','Sophia','Saylor','StraighterLine'],allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
    assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.equal(plan.rows.length,model.requirements.length);
    const outside=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+':'+row.option.code)).size,outside.length);assert(plan.totals.external<=model.totalCredits*.75);assert(plan.totals.institutional>=model.residencyPolicy.calculatedMinimumInstitutionCUs);
    for(const row of outside){assert.equal(row.option.universityMapRecord.programId,program.programId);assert.equal(row.option.universityMapRecord.catalogTerm,'202608');assert.equal(row.option.creditSystem,'competency-unit');assert.equal(row.option.sourceCreditSystem,'semester');assert(row.option.sourceCredits>0);}
    const fixed=new Set(model.requirements.filter(row=>row.institutionalOnly).map(row=>row.id));for(const row of plan.rows.filter(row=>fixed.has(row.requirementId)))assert.equal(row.option.provider,'University');
    const quality=assessPathwayQuality({model,plan,route:{...routes.find(route=>route.id===authored.routeIds[0]),modelId:model.id},asOf:'2026-11-26'});
    assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings.filter(item=>item.blocking)));assert.equal(quality.acceleration.mechanism,'self-paced');assert(quality.execution.personalTasks.some(task=>/admission/.test(task.message)));qualities.push(quality);
  }
  assert.equal(new Set(qualities.map(quality=>quality.modelId)).size,4);
});

test('five global Sophia promotions use independent global source IDs without rewriting the other verified definitions',async()=>{
  await promoteSophiaIdentities({check:true});
  const provider=await read('content/pathway-kits/providers/sophia.json'),sources=new Map(provider.sources.map(source=>[source.id,source]));
  for(const code of promotedCodes){const course=provider.courses.find(course=>course.code===code);assert.equal(course.sourceCreditStatus,'verified');assert.equal(course.sourceCreditSystem,'semester');assert(course.identitySourceIds.length);for(const id of course.identitySourceIds){assert(id.startsWith('shared-sophia--'));assert(sources.has(id));assert(sources.get(id).originalSourceId.startsWith('wgu-global-sophia--'));}}
  assert.equal(renamedSophiaSource('wgu-global-sophia--example'),'shared-sophia--example');
  const school=await read('content/pathway-kits/wgu/school.json');assert(!school.sourceOverrides?.some(id=>id.startsWith('shared-sophia--')));
});

test('the Sophia promotion composes with independently appended course facts and rejects changed owned evidence',async()=>{
  const input=await loadDataAnalyticsIdentities(),provider=await read('content/pathway-kits/providers/sophia.json');
  const extension={code:'SOPH-9999',title:'Independent reviewed extension',sourceCredits:3,sourceCreditSystem:'semester',identityReviewId:'other-batch',identitySourceIds:['other-batch-source']},source={id:'other-batch-source',url:'https://www.sophia.org/another-reviewed-course/',kind:'provider'};
  const extended=structuredClone(provider);extended.courses.push(extension);extended.sources.push(source);const before=structuredClone(extended),installed=applySophiaPromotions(extended,input);
  assert.deepEqual(extended,before,'Review application must not mutate its shared input');assert.deepEqual(installed.courses.map(course=>course.code),extended.courses.map(course=>course.code),'Another batch retains its course order');assert.deepEqual(installed.sources.map(source=>source.id),extended.sources.map(source=>source.id),'Another batch retains its source order');assert.deepEqual(installed.courses.at(-1),extension);assert.deepEqual(installed.sources.at(-1),source);assert.deepEqual(verifySophiaPromotions(installed,input),installed);assert.deepEqual(applySophiaPromotions(installed,input),installed);
  const damaged=structuredClone(installed);damaged.courses.find(course=>course.code===promotedCodes[0]).sourceCredits=999;assert.throws(()=>verifySophiaPromotions(damaged,input),/independently proved Sophia/);
  const changedSource=structuredClone(installed),ownedSource=changedSource.sources.find(source=>source.id.startsWith('shared-sophia--'));ownedSource.url+='?changed';assert.throws(()=>applySophiaPromotions(changedSource,input));
  for(const collection of ['sources','courses']){const duplicate=structuredClone(installed),owned=collection==='sources'?duplicate.sources.find(source=>source.id.startsWith('shared-sophia--')):duplicate.courses.find(course=>course.code===promotedCodes[0]);duplicate[collection].push(structuredClone(owned));assert.throws(()=>applySophiaPromotions(duplicate,input),/exactly once/);}
});
