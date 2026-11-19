import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Catalog from './dist/program-catalog.js';
import Planner from './dist/planner.js';
import {addGCUTransferOptions} from './scripts/add-gcu-transfer-options.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const raw=JSON.parse(await readFile(new URL('./content/curricula/gcu-bsba-campus.json',import.meta.url),'utf8')).models[0];
const review=JSON.parse(await readFile(new URL('./content/research/gcu-sophia-review-2026-11-19.json',import.meta.url),'utf8'));
const enriched=()=>addGCUTransferOptions(raw,review);
const entry={id:raw.id,school:raw.school,degreeCredits:120,creditUnit:'semester'};
const copy=value=>JSON.parse(JSON.stringify(value));

test('catalog accepts only the source-validated actual-credit GCU balance',()=>{
 const model=enriched(),policy=Planner.creditBalancePolicy(model);assert(policy);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 assert.doesNotThrow(()=>Catalog.validateModel(model,entry));assert.equal(Catalog.modelReadiness(model).available,true);
 assert.equal(Catalog.courseChoiceCounts(model).unresolvedRequiredChoices,0);
 for(const id of policy.balanceRequirementIds){const row=model.requirements.find(r=>r.id===id);assert.equal(row.credits,0);assert(row.options[0].credits>0);assert(!row.options.some(o=>o.credits===0));}
 for(const binding of policy.equivalencies){const row=model.requirements.find(r=>r.id===binding.requirementId);assert.equal(row.credits,4);for(const identity of binding.options){const option=row.options.find(o=>o.id===identity.optionId);assert.equal(option.credits,3);assert.equal(option.sourceCredits,3);}}
});

test('disabled, unsupported, inflated or unsourced balances fail closed',()=>{
 for(const mutate of [m=>m.degreeCreditBalancePolicy.enabled=false,m=>m.degreeCreditBalancePolicy.kind='generic-balance',m=>m.degreeCreditBalancePolicy.sourceIds=[],m=>m.requirements.find(r=>r.options.some(o=>o.provider==='Sophia')).options.find(o=>o.provider==='Sophia').credits=4,m=>m.requirements.find(r=>r.id===m.degreeCreditBalancePolicy.balanceRequirementIds[0]).options[0].credits=0]){
  const model=enriched();mutate(model);assert.throws(()=>Catalog.validateModel(model,entry));
  if(model.degreeCreditBalancePolicy.enabled===true)assert.equal(Catalog.modelReadiness(model).available,false);
 }
 const other=enriched();other.school='Another University';assert.throws(()=>Catalog.validateModel(other,{...entry,school:other.school}));assert.equal(Catalog.modelReadiness(other).available,false);
});

test('quality recognizes real earned credits and inactive balancing rows without changing the 50-percent publication threshold',()=>{
 const model=enriched(),plan=Planner.generate(model,{providers:['Sophia'],allowConditional:true,priority:'transfer'});
 assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.validation.errors));
 const quality=assessPathwayQuality({model,plan,asOf:'2026-11-19'});
 assert.equal(quality.research.completeRequirementLedger,true);assert.equal(quality.research.completeNamedBaseline,true);
 assert.equal(plan.totals.accounted,120);assert.equal(quality.metrics.feasibleOutsideCredits,plan.totals.external);
 assert.equal(quality.acceleration.minimumOutsideFraction,0.5);assert.equal(quality.publication.ready,false);
 assert(quality.metrics.feasibleOutsideCredits<60);
 const native=Planner.generate(model,{providers:[],allowConditional:true,priority:'transfer'}),nativeQuality=assessPathwayQuality({model,plan:native,asOf:'2026-11-19'});
 assert.equal(native.validation.academicCountsValid,true);assert.equal(nativeQuality.research.completeNamedBaseline,true);
 assert(native.rows.filter(r=>r.creditBalanceDerived).every(r=>r.option===null&&r.credits===0));
});

test('quality rejects inflated rows or inactive balancing placeholders carrying fake credit',()=>{
 const model=enriched(),plan=Planner.generate(model,{providers:['Sophia'],allowConditional:true,priority:'transfer'});
 const outside=copy(plan),row=outside.rows.find(r=>r.option?.provider==='Sophia');assert(row);row.credits=4;row.option.credits=4;
 assert.equal(assessPathwayQuality({model,plan:outside,asOf:'2026-11-19'}).research.completeNamedBaseline,false);
 const compensated=copy(outside),one=compensated.rows.find(r=>r.creditBalanceDerived&&r.credits===1);assert(one);one.option=null;one.credits=0;
 assert.equal(compensated.rows.reduce((sum,r)=>sum+r.credits,0),120);assert.equal(assessPathwayQuality({model,plan:compensated,asOf:'2026-11-19'}).research.completeNamedBaseline,false);
 const native=Planner.generate(model,{providers:[],allowConditional:true,priority:'transfer'}),inactive=native.rows.find(r=>r.creditBalanceDerived);assert(inactive);inactive.credits=1;
 assert.equal(assessPathwayQuality({model,plan:native,asOf:'2026-11-19'}).research.completeNamedBaseline,false);
});
