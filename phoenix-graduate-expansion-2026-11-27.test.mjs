import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Planner from './dist/planner.js';
import Estimate from './dist/plan-estimate-engine.js';
import Facts from './dist/program-opportunities.js';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import {buildProgramFit} from './scripts/program-fit-metadata.mjs';
import {assembleProgramRequirements,loadProgramRequirementReviews} from './scripts/program-requirements-metadata.mjs';
import {validatePhoenixGraduateMetadata,mergePhoenixRates} from './scripts/phoenix-graduate-metadata.mjs';
const read=async path=>JSON.parse(await readFile(path,'utf8')),data=await validatePhoenixGraduateMetadata();
const rates=mergePhoenixRates(await read('content/estimates/plan-estimate-rates.json'),data.rates);
function normalized(original){const model=structuredClone(original);for(const row of model.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:model.creditSystem,creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});return model;}
const options={providers:[],allowConditional:false,completed:[]};

test('four exact primary-catalog graduate ledgers pass existing publication gates with no outside awards',()=>{
 const expected=[['phoenix-cb-mba',33,'semester',11,21],['phoenix-cb-mis',36,'semester',12,21],['phoenix-cb-mha',36,'semester',12,21],['phoenix-da-ms-psychology',36,'competency-unit',12,24]];
 for(const [id,total,units,count,min]of expected){const model=normalized(data.models.find(x=>x.id==='curriculum-'+id)),plan=Planner.generate(model,options);assert.equal(model.totalCredits,total);assert.equal(model.creditSystem,units);assert.equal(model.requirements.length,count);assert.equal(plan.totals.institutional,total);assert.equal(plan.totals.external,0);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);assert(plan.rows.every(x=>x.status==='planned'&&x.option.provider==='University'));
  const quality=assessPathwayQuality({model,plan,route:{id,modelId:model.id,school:model.school,title:model.title,level:'master',modalities:['online'],paceModel:model.paceModel,url:model.paceSourceUrl},asOf:'2026-11-27'});assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings));assert.equal(quality.acceleration.mechanism,'self-paced');
  const definition=data.review.programs.find(x=>x.routeId===id),at=plan.sequence.findIndex(x=>x.code===definition.capstoneCode);assert(at>=0);assert.equal(plan.sequence[at].minimumCompletedCredits,min);assert(at*3>=min,'The operative sequence must put enough completed university credits before the capstone');
 }
});

test('exact tuition and term constraints produce supported full-degree ranges without model/pricing substitutions',()=>{
 const expected={'curriculum-phoenix-cb-mba':[9900,9900,3,4],'curriculum-phoenix-cb-mis':[10800,10800,3,4],'curriculum-phoenix-cb-mha':[10800,10800,3,4],'curriculum-phoenix-da-ms-psychology':[8247,16494,3,6]};
 for(const original of data.models){const model=normalized(original),plan=Planner.generate(model,options),estimate=Estimate.calculate({program:model,plan,rates}),[low,high,min,max]=expected[model.id];assert.equal(estimate.available,true);assert.deepEqual(estimate.costs.knownRange,{min:low,max:high});assert.deepEqual(estimate.timing.universityTerms,{min,max});assert.equal(estimate.counts.outsideUnits,0);assert.equal(estimate.counts.remainingUniversityUnits,model.totalCredits);assert.equal(estimate.costs.universityFees.min,0);assert.equal(estimate.costs.complete,false);assert.equal(Estimate.calculate({program:model,plan,rates,assumptions:{universityUnitsPerTermMax:13}}).available,false);
  const wrong=structuredClone(model);wrong.catalogYear='2025-2026';assert.equal(Estimate.calculate({program:wrong,plan,rates}).available,false);wrong.catalogYear='2026-2027';wrong.creditSystem=model.creditSystem==='semester'?'competency-unit':'semester';assert.equal(Estimate.calculate({program:wrong,plan,rates}).available,false);
 }
 const da=data.models.find(x=>x.creditSystem==='competency-unit');assert.equal(da.pacing.maximumCoursesPerTerm,4);assert.equal(da.pacing.maximumUniversityCreditsPer12Months,39);assert.equal(da.financialAid.federalAidEligible,false);assert.match(da.financialAid.notes,/not eligible for Title IV/);
});

test('admission and financing facts are prominent only for the exact program edition and mode',async()=>{
 const packets=await loadProgramRequirementReviews();assert(packets.some(x=>x.reviews.some(y=>y.id==='phoenix-mha-graduate-requirements-2026-11-27')));
 for(const model of data.models){const facts=assembleProgramRequirements(model,[data.requirements]);assert(facts.length>=3);const labels=Facts.requirementBadges({programRequirements:facts});assert(labels.some(x=>/experience/.test(x)));
  for(const mutate of [m=>m.catalogYear='2025-2026',m=>m.format='Residential',m=>m.id='unrelated']){const changed=structuredClone(model);mutate(changed);assert.deepEqual(assembleProgramRequirements(changed,[data.requirements]),[]);}
 }
 const mba=assembleProgramRequirements(data.models.find(x=>x.id==='curriculum-phoenix-cb-mba'),[data.requirements]);assert(mba.some(x=>/three/.test(x.detail)&&/five/.test(x.detail)),'The catalog alternate admissions path cannot be dropped in favor of shorter marketing copy');
 const mha=assembleProgramRequirements(data.models.find(x=>x.id==='curriculum-phoenix-cb-mha'),[data.requirements]);assert(mha.some(x=>x.prominent&&x.type==='workplace-access'));assert(mha.some(x=>/oversight or management of staff/.test(x.detail)));
 const psych=assembleProgramRequirements(data.models.find(x=>x.id==='curriculum-phoenix-da-ms-psychology'),[data.requirements]);assert(psych.some(x=>x.prominent&&x.type==='non-licensure'));assert(psych.some(x=>x.prominent&&x.type==='financial-aid-restriction'));
});

test('the primary-source bindings remain intact and invented providers cannot enter an all-university baseline',async()=>{
 for(const model of data.models)for(const source of model.sources){const body=await readFile(source.capture);assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(model.graduateCBEReview.outsideAwardsCreated,0);}
 const cloned=structuredClone(data.models[0]);cloned.requirements[0].options.push({id:'invented-sophia',provider:'Sophia',code:'SOPH-0015',credits:3});const broken=normalized(cloned);const plan=Planner.generate(broken,options);assert(plan.rows.every(row=>row.option.provider==='University'),'Institutional-only rules prevent an invented provider option from entering the baseline');
});


test('every released Phoenix graduate route is discoverable through existing CBE, self-paced and exact billing filters',()=>{
 for(const model of data.models){
  const fit=buildProgramFit({model,requirementReviews:[data.requirements]}),billing=model.creditSystem==='competency-unit'?'subscription':'per-credit';
  assert.equal(fit.competencyBased,true);assert.equal(fit.selfPaced,true);assert.equal(fit.billing,billing);
  assert.equal(Facts.fitsFilters(fit,{competencyBased:true,selfPaced:true,billing}),true);
  assert.equal(Facts.fitsFilters(fit,{billing:billing==='subscription'?'per-credit':'subscription'}),false);
  assert.equal(fit.sources.learning.checkedOn,'2026-11-27');assert(fit.sources.learning.sourceIds.length>0);
  for(const id of fit.sources.learning.sourceIds)assert(model.sources.some(source=>source.id===id&&source.checked==='2026-11-27'&&source.sha256&&source.capture));
 }
});
