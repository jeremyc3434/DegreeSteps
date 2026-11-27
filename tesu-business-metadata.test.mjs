/** Metadata/price reuse is independently scoped; it never publishes a degree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {buildProgramFit} from './scripts/program-fit-metadata.mjs';
import {assembleProgramRequirements} from './scripts/program-requirements-metadata.mjs';
import Estimate from './dist/plan-estimate-engine.js';
import Planner from './dist/planner.js';
import Facts from './dist/program-opportunities.js';
import {TESU_BUSINESS_METADATA_TARGETS as targets,TESU_BUSINESS_CATALOG_LABEL as label,TESU_BUSINESS_RATE_ID,loadTESUBusinessPriceBasis,buildTESUBusinessTuitionBinding,buildTESUBusinessRateProfile,validateTESUBusinessMetadataModel,buildTESUBusinessMetadata} from './scripts/tesu-business-metadata.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8')),copy=structuredClone;
const rates=await read('./content/estimates/plan-estimate-rates.json'),requirements=await read('./content/discovery/tesu-program-requirements.json'),fitReviews=await read('./content/discovery/program-fit-reviews.json'),basis=await loadTESUBusinessPriceBasis(rates);
const cohortDates=[...new Set(targets.map(target=>target.reviewedOn))],profiles=cohortDates.map(reviewedOn=>buildTESUBusinessRateProfile(basis,{targets:targets.filter(target=>target.reviewedOn===reviewedOn),rateId:'tesu-standard-business-expansion-'+reviewedOn.replaceAll('-','')}));
const withProfiles=()=>({...copy(rates),entries:[...rates.entries.filter(entry=>!profiles.some(profile=>profile.id===entry.id)),...profiles]});
async function fixtureModel(target,capture){
 const meta=await read('./content/source-captures/'+capture+'.json'),source={id:'test-metadata-only-'+target.slug,title:target.title,url:meta.url,kind:'university',checkedOn:'2026-11-26',capture:'content/source-captures/'+capture+'.txt',sha256:meta.sha256},identity={kind:'reviewed-current-catalog',label,sourceId:source.id,sourceUrl:source.url,checkedOn:'2026-11-26',sourceSha256:meta.sha256,capture:source.capture};
 const model={id:target.modelId,school:'Thomas Edison State University',title:target.title,level:'bachelor',catalog:label,catalogYear:null,format:'Online',creditSystem:'semester',totalCredits:120,catalogIdentity:identity,sources:[source],sourceIds:[source.id],requirements:[]};
 const binding=buildTESUBusinessTuitionBinding({modelId:model.id,catalogIdentity:identity},basis);model.sources.push(...binding.sources);model.tuitionComparison=binding.tuitionComparison;return model;
}

test('new business price bindings reuse exact retained tuition and itemized fees without changing any old review date',async()=>{
 const before=JSON.stringify(rates),profile=buildTESUBusinessRateProfile(basis);Estimate.assertRates(withProfiles());assert.equal(new Set(profiles.flatMap(row=>row.modelIds)).size,targets.length);for(const row of profiles){assert.deepEqual(row.modelIds,targets.filter(target=>row.id.endsWith(target.reviewedOn.replaceAll('-',''))).map(target=>target.modelId));assert.deepEqual(row.tuition,basis.entry.tuition);assert.deepEqual(row.sourceIds,basis.entry.sourceIds);}
 assert.equal(profile.id,TESU_BUSINESS_RATE_ID);assert.deepEqual(profile.modelIds,targets.filter(target=>target.reviewedOn==='2026-11-26').map(target=>target.modelId));assert.deepEqual(profile.catalogs,[label]);assert.equal(profile.degreeUnits,120);assert.equal(profile.creditSystem,'semester');assert.equal(profile.modality,'online');assert.equal(profile.institutionMinimumUnits,15);assert.equal(profile.tuition.type,'banded-term');assert.equal(profile.tuition.termRate,4652);assert.equal(profile.tuition.partTimeRate,584);assert.equal(profile.oneTimeFees,148);assert.equal(profile.feesPerTerm,0);assert(!profile.modelIds.includes('tesu-general-management'),'The older standalone model keeps its separate price scope');
 assert.deepEqual(profile.tuition,basis.entry.tuition);assert.deepEqual(profile.feeBreakdown,basis.entry.feeBreakdown);assert.deepEqual(profile.pace,basis.entry.pace);assert.deepEqual(profile.sourceIds,basis.entry.sourceIds);assert.equal(basis.tuitionSource.checkedOn,'2026-11-25');
 for(const source of basis.sources){const body=await readFile(new URL(source.reviewBasis.document,import.meta.url),'utf8');assert.equal(createHash('sha256').update(body).digest('hex'),source.reviewBasis.sha256);assert.equal(source.checkedOn,'2026-11-25');assert.equal(source.reviewBasis.fetchedAt.slice(0,10),'2026-11-25');}
 assert.equal(JSON.stringify(rates),before);
 for(const mutate of[value=>value.entries.find(entry=>entry.id===basis.entry.id).tuition.termRate=0,value=>value.entries.find(entry=>entry.id===basis.entry.id).oneTimeFees=0,value=>value.entries.find(entry=>entry.id===basis.entry.id).feeBreakdown[0].amount=49,value=>value.entries.find(entry=>entry.id===basis.entry.id).pace.defaultMax=18,value=>value.sources.find(source=>source.id===basis.tuitionSource.id).checkedOn='2026-11-26',value=>value.sources.find(source=>source.id===basis.tuitionSource.id).reviewBasis.sha256='0'.repeat(64),value=>value.sources.find(source=>source.id===basis.tuitionSource.id).url='https://unrelated.example/tuition']){const changed=copy(rates);mutate(changed);await assert.rejects(()=>loadTESUBusinessPriceBasis(changed));}
});

test('retained HR and Marketing pages support their own exact discovery identity without becoming complete plan fixtures',async()=>{
 for(const[target,capture]of[[targets[0],'08ba94f0898450bf'],[targets[1],'60df9ea927fc193a']]){
  const model=await fixtureModel(target,capture),before=JSON.stringify(model),verified=await validateTESUBusinessMetadataModel(model);assert.equal(verified.target.modelId,model.id);assert.equal(verified.source.checkedOn,'2026-11-26');assert.equal(model.tuitionComparison.checkedOn,model.catalogIdentity.checkedOn);assert.equal(model.tuitionComparison.pricingSourceCheckedOn,'2026-11-25');assert.equal(model.tuitionComparison.modelId,model.id);assert.equal(model.completeExecutablePathway,undefined);assert.deepEqual(model.requirements,[],'This fixture proves metadata binding, not a fabricated 120-credit ledger');assert.equal(JSON.stringify(model),before);
  for(const mutate of[value=>value.id=targets[2].modelId,value=>value.level='master',value=>value.totalCredits=119,value=>value.creditSystem='quarter',value=>value.format='Residential',value=>value.catalog='2026-2027',value=>value.sourceIds=[],value=>value.catalogIdentity.sourceSha256='0'.repeat(64),value=>value.sources[0].sha256='0'.repeat(64),value=>value.catalogIdentity.sourceUrl='https://tesu.smartcatalogiq.com/current/unrelated-degree/']){const changed=copy(model);mutate(changed);await assert.rejects(()=>validateTESUBusinessMetadataModel(changed));}
 }
});

test('exact new model rates reject another catalog, delivery, credit unit or size before estimating any price',async()=>{
 const bound=withProfiles();
 for(const target of targets){const model={id:target.modelId,school:'Thomas Edison State University',level:'bachelor',catalog:label,catalogYear:null,format:'Online',creditSystem:'semester',totalCredits:120,institutionMinCredits:15},plan={programId:target.modelId,rows:[],validation:{academicCountsValid:false}};
  for(const patch of[{catalog:'Current undergraduate catalog · checked October 28, 2026'},{format:'Residential'},{creditSystem:'quarter'},{totalCredits:121}])assert.equal(Estimate.calculate({program:{...model,...patch},plan,rates:bound}).reasonCode,'degree-rate-mismatch',target.modelId);
  assert.equal(Estimate.calculate({program:model,plan,rates:bound}).reasonCode,'estimate-needs-review','Prices cannot manufacture an academic plan');
 }
});

test('all exact manifest-authored programs acquire accurate scheduled, billing, assessment and savings context',async()=>{
 const kit=await loadKit('content/pathway-kits/tesu'),authored=targets.map(target=>{const program=kit.programs.find(program=>program.modelId===target.modelId);assert(program,'The exact authored degree must exist: '+target.modelId);return program;});
 const models=authored.map(program=>compileProgram(kit,program)),before=JSON.stringify({models,fitReviews,requirements,rates}),result=await buildTESUBusinessMetadata({models,fitReviews,requirements,rates});assert.equal(result.publicationDecisionsMade,0);assert.equal(result.studentCreditAwards,0);assert.equal(result.priceSourcesRefreshed,0);assert.deepEqual(result.rates.sources,rates.sources);assert.equal(JSON.stringify({models,fitReviews,requirements,rates}),before);
 const again=await buildTESUBusinessMetadata({models,fitReviews:result.fitReviews,requirements:result.requirements,rates:result.rates});assert.deepEqual(again,result,'The shared metadata writer composes idempotently');
 for(const model of models){const facts=assembleProgramRequirements(model,[result.requirements]);assert.equal(facts.length,3);assert(facts.every(fact=>fact.scope==='school-policy'&&fact.prominent===false));assert(facts.some(fact=>fact.type==='assessment-formats-vary'));assert(!facts.some(fact=>/no proctor|no exams|self.paced|admission guaranteed/i.test(fact.label)));
  const degreeSource=model.sources.find(source=>source.id===model.catalogIdentity.sourceId);if(degreeSource.toolResponseReceipt){for(const mutate of[source=>delete source.toolResponseReceipt,source=>source.toolResponseReceipt.sha256='0'.repeat(64),source=>source.toolResponseReceipt.sourceUrl='https://tesu.smartcatalogiq.com/current/unrelated-degree']){const changed=copy(model);mutate(changed.sources.find(source=>source.id===changed.catalogIdentity.sourceId));await assert.rejects(()=>validateTESUBusinessMetadataModel(changed));}}
  const institutional=Planner.generate(model,{providers:[],allowConditional:false,completed:[],optimizationNodeBudget:12000}),estimate=Estimate.calculate({program:model,plan:institutional,rates:result.rates});assert.equal(estimate.available,true,model.id+': '+estimate.reason);assert.equal(estimate.rateEntryId,'tesu-standard-business-expansion-'+targets.find(target=>target.modelId===model.id).reviewedOn.replaceAll('-',''));assert.deepEqual(estimate.counts,{totalUnits:120,outsideUnits:0,universityUnits:120,remainingUniversityUnits:120,finishedUnits:0,remainingOutsideCourses:0,creditSystem:'semester'});assert.deepEqual(estimate.costs.universityFees,{min:148,max:148});assert(estimate.sources.some(source=>source.id==='tesu-tuition-2026-11-25'&&source.checkedOn==='2026-11-25'));assert(estimate.sources.some(source=>source.id==='tesu-fees-2026-11-25'&&source.checkedOn==='2026-11-25'));
  const fit=buildProgramFit({model,reviews:result.fitReviews,requirementReviews:[result.requirements],estimate,rates:result.rates});assert.equal(fit.selfPaced,false);assert.equal(fit.competencyBased,null);assert.equal(fit.billing,'flat-term');assert.equal(fit.sources.learning.checkedOn,'2026-11-26');assert.equal(fit.programRequirements.length,3);assert.equal(Facts.fitsFilters(fit,{selfPaced:true}),false);assert.equal(Facts.fitsFilters(fit,{billing:'subscription'}),false);assert.equal(Facts.fitsFilters(fit,{billing:'flat-term',selfPaced:false}),true);
 }
});
