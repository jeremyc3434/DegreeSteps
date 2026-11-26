import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadKit,clone} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');
const asOf='2026-11-26';
const kit=await loadKit('content/pathway-kits/umpi');
const compiled=()=>compileKit(kit).doc;

test('MAOL uses the existing factory with a complete distinct twelve-course graduate ledger',async()=>{
  assert.deepEqual((await verifyKit(kit,{asOf})).errors,[]);
  const doc=compiled();assert.equal(doc.models.length,1);assert.equal(await runGuards(kit,doc),4);
  assert.equal(doc.models[0].requirements.reduce((sum,row)=>sum+row.credits,0),36);
  assert.deepEqual(doc.models[0].routeIds,['umpi-maol','umpi-catalog-22746d64f0509cd3']);
  assert.equal(kit.equivalencies.equivalencies.length,0,'An undergraduate partner table cannot create a graduate award');
});

test('the all-UMPI MAOL baseline is research-ready through its sourced self-paced mechanism',()=>{
  const doc=compiled(),model=doc.models[0];
  const plan=Planner.generate(model,{providers:[],allowConditional:false,priority:'transfer',completed:[]});
  const quality=assessPathwayQuality({model,plan,asOf});
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);
  assert.equal(plan.rows.length,12);assert.equal(plan.totals.institutional,36);assert.equal(plan.totals.external,0);assert.equal(plan.totals.alternative,0);
  assert.equal(quality.status,'research-ready');assert.equal(quality.publication.ready,true);
  assert.equal(quality.acceleration.mechanism,'self-paced');assert.equal(quality.metrics.feasibleOutsideCredits,0);
  assert.equal(quality.estimates.cost.total,null);assert.equal(quality.estimates.timing.weeks,null,'No completion duration is supplied');
  assert.equal(quality.execution.awardedCreditsInBaseline,0);
});

test('MAOL guards reject incorrect credit quantities, undergraduate policies and invented alternative awards',async()=>{
  const fail=async(mutate,pattern)=>{const doc=clone(compiled());mutate(doc.models[0]);await assert.rejects(runGuards(kit,doc),pattern);};
  await fail(model=>model.requirements[0].credits=4,/36|three credits/);
  await fail(model=>model.alternativeMaxCredits=90,/No ACE maximum/);
  await fail(model=>model.majorMinInstitutionCredits=12,/undergraduate major residency/);
  await fail(model=>model.externalMaxCredits=90,/graduate transfer ceiling/);
  await fail(model=>model.requirements[0].options[0].provider='Sophia',/graduate receiving awards/);
  await fail(model=>model.sources.find(source=>source.id.includes('board-proposal')).documentPeriod='2026–2027',/historical period/);
});

test('an unsupported current identity or stale active source cannot keep MAOL publication readiness',()=>{
  const quality=mutate=>{const model=clone(compiled().models[0]);mutate(model);return assessPathwayQuality({model,plan:Planner.generate(model,{providers:[],completed:[]}),asOf});};
  assert.equal(quality(model=>{delete model.catalogIdentity;}).publication.ready,false);
  const stale=quality(model=>{model.sources.find(source=>source.id.includes('current-academic-map')).checkedOn='2026-10-01';});
  assert.equal(stale.publication.ready,false);assert(stale.findings.some(finding=>finding.code==='source-review-due'));
});
