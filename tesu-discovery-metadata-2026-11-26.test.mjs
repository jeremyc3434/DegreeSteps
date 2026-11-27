/** Exact current-catalog TESU discovery context; no personal credit awards or
 * admission, assessment-free study or accelerated-section guarantees. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {validateProgramRequirementPacket,assembleProgramRequirements,loadProgramRequirementReviews} from './scripts/program-requirements-metadata.mjs';
import {buildProgramFit} from './scripts/program-fit-metadata.mjs';
import {validateConnectedWebCapture} from './scripts/pathway-factory/connected-web.mjs';
import {TESU_BUSINESS_METADATA_TARGETS} from './scripts/tesu-business-metadata.mjs';
import Catalog from './dist/program-catalog.js';
import Journey from './dist/journey-engine.js';
import Savings from './dist/savings-engine.js';
import Comparison from './dist/plan-comparison-engine.js';
import Cost from './dist/cost-engine.js';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const packet=await read('./content/discovery/tesu-program-requirements.json');
const reviews=await read('./content/discovery/program-fit-reviews.json');
const kit=await loadKit(join(kitsRoot,'tesu'));
const label='Current undergraduate catalog · checked November 18, 2026';
const ids=['curriculum-tesu-ba-english','curriculum-tesu-ba-liberal-studies','curriculum-tesu-ba-psychology','curriculum-tesu-bsba-accounting','curriculum-tesu-bsba-finance'];
const models=ids.map(id=>{const program=kit.programs.find(program=>program.modelId===id);assert(program,id);return compileProgram(kit,program);});
const clone=value=>structuredClone(value);
const businessIds=TESU_BUSINESS_METADATA_TARGETS.map(target=>target.modelId),originalSourceIds=new Set(['tesu-ba-english-placement-2026-11-26','tesu-ba-liberal-studies-placement-2026-11-26','tesu-ba-psychology-placement-2026-11-26','tesu-bsba-accounting-placement-2026-11-26','tesu-bsba-finance-placement-2026-11-26','tesu-current-course-engagement-20261126','tesu-standard-online-assessments-20261126','tesu-accelerated-course-option-20261126']);

async function verifyCapture(source){
 const body=await readFile(new URL(source.capture,import.meta.url),'utf8');
 const metadata=await read('./'+source.capture.replace(/\.txt$/,'.json'));
 assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256,source.id+' body hash');
 assert.equal(metadata.sha256,source.sha256);assert.equal(metadata.url,source.url);assert.equal(source.checkedOn,'2026-11-26');assert.equal(source.kind,'university');
 if(originalSourceIds.has(source.id)||source.id==='tesu-standard-online-structure-20261126'){assert.equal(metadata.status,200);assert.equal(metadata.fetchedAt.slice(0,10),'2026-11-26','The original source and standard-online policy reviews keep their exact retrieval dates');}
 else{assert(packet.reviews.some(review=>review.modelIds.some(id=>businessIds.includes(id))&&review.catalogIdentity?.sourceId===source.id),'Only an exact new business-degree identity can extend the source scope');assert(metadata.fetchedAt.slice(0,10)<=source.checkedOn,'A new identity review preserves the actual retained retrieval date');
  if(metadata.captureFormat==='connected-web-rendered-extract'){assert(source.toolResponseReceipt);assert.deepEqual(source.toolResponseReceipt,metadata.toolResponseReceipt);await validateConnectedWebCapture({...metadata,text:body});}else assert.equal(metadata.status,200);
 }
 const normalized=value=>String(value).replace(/\s+/g,' ').trim();assert(normalized(body).includes(normalized(source.quote)),source.id+' literal primary passage');
 return body;
}

test('five prior TESU identities retain their exact rereview while only the three newly sourced business degrees extend discovery',async()=>{
 validateProgramRequirementPacket(packet);assert.deepEqual(packet.reviews.flatMap(review=>review.modelIds).sort(),[...ids,...businessIds].sort());assert.equal(packet.sources.length,originalSourceIds.size+businessIds.length);for(const id of originalSourceIds)assert(packet.sources.some(source=>source.id===id));
 for(const model of models){
  const identity=model.catalogIdentity,review=packet.reviews.find(review=>review.modelIds.includes(model.id));
  assert.equal(model.catalog,label);assert.equal(identity.label,label);assert.equal(identity.checkedOn,'2026-11-26');assert.equal(identity.priorCheckedOn,'2026-11-18');
  const source=packet.sources.find(source=>source.id===review.catalogIdentity.sourceId);assert(source);
  assert.equal(source.id,identity.sourceId);assert.equal(source.sha256,identity.sourceSha256);assert.equal(source.capture,identity.capture);assert.equal(source.url,identity.sourceUrl);
  assert.equal(review.catalogIdentity.sourceSha256,source.sha256);assert.equal(review.catalogIdentity.checkedOn,'2026-11-26');assert.equal(review.catalogIdentity.label,label);
  assert.equal(review.programBindings.length,1);assert.equal(review.programBindings[0].degreeUrl,source.url);assert(model.sourceIds.includes(source.id));
  const modelSource=model.sources.find(item=>item.id===source.id);assert(modelSource);assert.equal(modelSource.sha256,source.sha256);assert.equal(modelSource.capture,source.capture);
  const body=await verifyCapture(source);assert.match(body,/Total Credit Hours:\s*120/);assert.equal(model.totalCredits,120);
 }
});

test('every TESU contextual fact is source-backed, compact and scoped to the applicable school policy',async()=>{
 for(const source of packet.sources)await verifyCapture(source);
 const loaded=await loadProgramRequirementReviews();assert.equal(loaded.length,5);assert(loaded.some(value=>value.reviews.some(review=>review.id===packet.reviews[0].id)));
 for(const model of models){
  const before=JSON.stringify(model),facts=assembleProgramRequirements(model,[packet]);assert.equal(facts.length,3,model.id);
  assert.deepEqual(new Set(facts.map(fact=>fact.kind)),new Set(['attendance','assessment']));
  for(const fact of facts){assert.equal(fact.scope,'school-policy');assert.equal(fact.prominent,false);assert(fact.sources.every(source=>/^https:\/\//.test(source.url)));assert.doesNotMatch(fact.label,/admission|GPA|no exams|no proctor|license|licensure/i);}
  const acceleration=facts.find(fact=>fact.type==='accelerated-course-options');assert.match(acceleration.detail,/separate course format/);assert.match(acceleration.detail,/does not assume/);
  const assessment=facts.find(fact=>fact.kind==='assessment');assert.match(assessment.label,/formats vary/);assert.match(assessment.detail,/individual.*course/);
  assert.equal(JSON.stringify(model),before,'Discovery never modifies the academic model or source records');
  assert(facts.every(fact=>!['completed','confirmed','credits','earned','profile','privateNote'].some(key=>Object.hasOwn(fact,key))));
 }
});

test('current-catalog context fails closed for mismatched edition, delivery, source body identity or exact degree binding',()=>{
 for(const model of models){
  for(const mutate of[
   value=>value.id='unreviewed-degree',value=>value.catalog='Future undergraduate catalog',value=>value.format='Residential',
   value=>value.catalogIdentity.checkedOn='2026-11-18',value=>value.catalogIdentity.label='Future undergraduate catalog',
   value=>value.catalogIdentity.sourceUrl='https://tesu.edu/unrelated-degree',value=>value.sourceIds=[],
   value=>value.sources.find(source=>source.id===value.catalogIdentity.sourceId).sha256='0'.repeat(64),
   value=>value.sources.find(source=>source.id===value.catalogIdentity.sourceId).checkedOn='2026-11-25',
   value=>value.sources.find(source=>source.id===value.catalogIdentity.sourceId).kind='community',
   value=>value.sources.find(source=>source.id===value.catalogIdentity.sourceId).capture='content/source-captures/unreviewed.txt'
  ]){const changed=clone(model);mutate(changed);assert.deepEqual(assembleProgramRequirements(changed,[packet]),[],model.id+' mismatched model cannot inherit context');}
  for(const mutate of[
   (review,source)=>source.sha256='0'.repeat(64),(review,source)=>source.url='https://tesu.edu/unrelated-degree',
   (review,source)=>source.kind='community',(review,source)=>source.checkedOn='2026-11-25',
   (review,source)=>source.capture='unretained.txt',review=>review.programBindings[0].degreeUrl='https://tesu.edu/unrelated-degree'
  ]){const changed=clone(packet),review=changed.reviews.find(review=>review.modelIds.includes(model.id)),source=changed.sources.find(source=>source.id===review.catalogIdentity.sourceId);mutate(review,source);assert.deepEqual(assembleProgramRequirements(model,[changed]),[],model.id+' mismatched evidence cannot inherit context');}
 }
});

test('TESU scheduled discovery classification describes the standard online baseline and preserves alternative formats',async()=>{
 const review=reviews.reviews.find(review=>review.modelIds.includes(ids[0]));assert(review);
 assert.deepEqual([...review.modelIds].sort(),[...ids].sort());assert.equal(review.catalogYear,label);assert.equal(review.baselineFormat,'standard-online-coursework');assert.equal(review.modality,'online');assert.equal(review.paceModel,'course-term');
 const body=await verifyCapture(review.source);assert.match(body,/detailed week-by-week assignment schedule/i);assert(review.notes.some(note=>/e-Pack.*TECEP.*accelerated/i.test(note)));
 for(const model of models){
  const fit=buildProgramFit({model,reviews,requirementReviews:[packet]});assert.equal(fit.selfPaced,false);assert.equal(fit.competencyBased,null);assert.equal(fit.learningReviewId,review.id);assert.equal(fit.programRequirements.length,3);
  assert.equal(fit.sources.learning.url,review.source.url);assert.deepEqual(fit.sources.learning.sourceIds,[review.source.id]);
  for(const patch of[{catalog:'Future undergraduate catalog'},{format:'Residential'},{id:'unreviewed-degree'}])assert.equal(buildProgramFit({model:{...model,...patch},reviews}).learningReviewId,undefined);
 }
});

test('all five refreshed catalog identities preserve usable Savings and Comparison bindings without refreshing tuition evidence',async()=>{
 const registry=await read('./dist/data/curriculum-registry.json');
 const catalog=Catalog.attachRegistry(Catalog.merge(await read('./dist/data/pathways.json'),await read('./dist/data/program-catalog.json')),registry);
 const costs=await read('./dist/data/cost-comparisons.json'),entry=costs.entries.find(entry=>entry.id==='tesu-standard');assert(entry);
 for(const canonical of models){
  const registered=registry.models.find(model=>model.id===canonical.id);assert(registered);
  const document=await read('./dist/'+registered.path),model=(document.models||[document]).find(model=>model.id===canonical.id);assert(model);
  assert.deepEqual(model.tuitionComparison,canonical.tuitionComparison,'The actual published model carries the canonical refreshed comparison binding');
  const binding=model.tuitionComparison;assert.equal(binding.checkedOn,'2026-11-26');assert.deepEqual(binding.catalogIdentity,model.catalogIdentity);
  assert.equal(binding.entryId,'tesu-standard');assert.equal(binding.modelId,model.id);assert.equal(binding.pricingSourceCheckedOn,'2026-11-18');assert.equal(binding.pricingSourceIds.length,1);
  for(const id of binding.pricingSourceIds){const source=model.sources.find(source=>source.id===id);assert(source);assert.equal(source.url,binding.sourceUrl);assert.equal(source.checkedOn||source.checked,'2026-11-18','A fresh catalog binding cannot relabel historical tuition evidence as newly reviewed');}
  assert.match(binding.reviewScope,/no new price review is claimed/);
  const route=catalog.pathways.find(route=>route.modelId===model.id);assert(route,model.id+' remains selectable');
  const state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality='online';state.profile.hasPrior='none';
  const draft=Journey.buildDraft(state,catalog,[model]);assert(draft.plan,model.id+' builds its actual student draft');
  const before=JSON.stringify([state,draft,costs]),savings=Savings.calculate(state,draft,costs);assert.equal(savings.available,true,model.id+': '+savings.reason);assert.equal(savings.rateBasis,'published');assert.equal(savings.earned.transferCredits,0);
  const remaining=draft.plan.rows.filter(row=>row.status==='planned'&&row.institutional).reduce((sum,row)=>sum+row.credits,0);
  const expected=Cost.calculate({...entry,totalUnits:remaining,scenarioTransferLimit:0},{transferUnits:0,outsideBudget:0,unitsPerTerm:savings.assumptions.unitsPerTerm});
  assert.equal(Comparison.remainingCosts(draft,state,costs).universityTuition,expected.afterTuition,model.id+' what-if uses the same reviewed remaining-tuition basis');
  assert.equal(JSON.stringify([state,draft,costs]),before,'Cost calculation does not change student records or primary-source dates');
  for(const change of[program=>program.tuitionComparison.checkedOn='2026-11-18',program=>program.tuitionComparison.catalogIdentity.checkedOn='2026-11-18']){const changed=clone(draft);change(changed.program);assert.equal(Savings.calculate(state,changed,costs).available,false,model.id+' stale catalog bindings remain rejected');}
 }
});
