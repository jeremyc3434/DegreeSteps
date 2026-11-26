/** Exact current price and discovery bindings for the reviewed WGU batch.
 * These records describe scenarios and entry requirements, not personal credit
 * awards, admission decisions, guaranteed prices or course-specific proctoring. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import Estimate from './dist/plan-estimate-engine.js';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {validateProgramRequirementPacket,assembleProgramRequirements} from './scripts/program-requirements-metadata.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const rates=await read('./content/estimates/plan-estimate-rates.json'),reviews=await read('./content/discovery/wgu-program-requirements.json'),kit=await loadKit(join(kitsRoot,'wgu'));
// Exact independent expectations, including original PAMS catalog codes rather
// than assigning every degree a made-up current-year catalog.
const family=[
 ['curriculum-wgu-catalog-b2a8a37d4fbedabd',34,'201404',4850,'b484222cf858a3a9',true],
 ['curriculum-wgu-catalog-b83ee97289a0732a',35,'201408',4850,'cb97d614df755c77',true],
 ['curriculum-wgu-catalog-c4a7efe739d67a5c',36,'202507',4850,'32731087fcd70232',true],
 ['curriculum-wgu-catalog-358f1e10651bf3d8',121,'202503',3850,'725b734d7cd21c38',false],
 ['curriculum-wgu-catalog-bf14bd14e87ae7aa',112,'202609',3850,'d13d54adf9b2bc03',false],
 ['curriculum-wgu-bs-computer-science-reviewed',121,'202611',4125,'6a40ebf32d431d9d',false],
 ['curriculum-wgu-catalog-d734fb4b04eded7c',110,'202608',3925,'80e2d42228d6482b',false],
 ['curriculum-wgu-catalog-3a9fedcacbfcccae',120,'202610',4125,'905aab91cfb56d18',false]
];
const models=new Map(family.map(([id])=>{
 const program=kit.programs.find(program=>program.modelId===id);assert(program,id+' has its actual canonical ledger');
 const model=compileProgram(kit,program);model.sources??=kit.school.sources;
 return[id,model];
}));

test('eight exact WGU degrees bind current captured tuition, mandatory resources and separately sourced application fees',async()=>{
 Estimate.assertRates(rates);assert.equal(family.length,8);
 for(const[id,units,catalog,tuition,capture,graduate]of family){
  const matching=rates.entries.filter(entry=>entry.modelIds.includes(id));assert.equal(matching.length,1,id);const entry=matching[0],model=models.get(id);
  assert.deepEqual(entry.modelIds,[id]);assert.deepEqual(entry.catalogs,[catalog]);assert.equal(entry.degreeUnits,units);assert.equal(entry.creditSystem,'competency-unit');assert.equal(entry.modality,'online');assert.equal(entry.school,'Western Governors University');
  assert.equal(model.totalCredits,units);assert.equal(model.catalogYear||model.catalog,catalog);assert.equal(model.creditSystem,entry.creditSystem);
  assert.equal(entry.tuition.type,'paid-term');assert.equal(entry.tuition.termRate,tuition);assert.equal(entry.feesPerTerm,200);assert.equal(entry.oneTimeFees,65);assert.equal(entry.termMonths,6);assert.equal(entry.termLabel,'6-month term');
  assert.equal(entry.feeBreakdown.filter(fee=>fee.frequency==='per-term').reduce((sum,fee)=>sum+fee.amount,0),200);assert.equal(entry.feeBreakdown.filter(fee=>fee.frequency==='one-time').reduce((sum,fee)=>sum+fee.amount,0),65);
  assert(entry.sourceIds.includes('wgu-november-catalog'),'The application fee retains its separate institutional-catalog authority');
  const source=entry.sourceIds.map(id=>rates.sources.find(source=>source.id===id)).find(source=>source.capture==='content/source-captures/'+capture+'.txt');assert(source,id+' exact current program price source');
  assert.equal(source.url,model.pricing.sourceUrl);assert.equal(source.checkedOn,'2026-11-26');assert.equal(source.kind,'university');
  const body=await readFile(new URL(source.capture,import.meta.url),'utf8'),metadata=await read('./'+source.capture.replace(/\.txt$/,'.json')),digest=createHash('sha256').update(body).digest('hex');
  assert.equal(source.sha256,digest);assert.equal(source.sourceContentHash,'sha256:'+digest);assert.equal(metadata.sha256,digest);
  const number=String(tuition).slice(0,-3)+',?'+String(tuition).slice(-3);
  assert(new RegExp('Tuition per six-month term is\\s+\\$\\s*'+number).test(body),id+' tuition amount belongs to its six-month heading');
  assert(/E-Books (?:&|and) Resources Fee\s+\+\s+\$\s*200/.test(body),id+' the $200 resource fee is explicit');
  assert.deepEqual(entry.pace,graduate?{min:8,max:36,defaultMin:8,defaultMax:16}:{min:12,max:60,defaultMin:12,defaultMax:24});
  assert(entry.missing.length>0&&entry.notes.some(note=>/planning assumptions/.test(note))&&entry.notes.some(note=>/no degree total or completion time is guaranteed/.test(note)),id+' excludes unsupported price and time guarantees');
 }
});

test('new requirements use exact program/catalog bindings and keep general assessment policy separate from graduate admission',async()=>{
 validateProgramRequirementPacket(reviews);
 const policy=reviews.sources.find(source=>source.id==='wgu-assessment-policy-20261124');assert.equal(policy.checkedOn,'2026-11-24','Reusing a policy does not refresh its primary evidence date');
 for(const[id,,catalog,,,graduate]of family){
  const model=models.get(id),matching=reviews.reviews.filter(review=>review.modelIds.includes(id));assert.equal(matching.length,1,id);const review=matching[0];
  assert.deepEqual(review.modelIds,[id]);assert.equal(review.catalogYear,catalog);assert.equal(review.modality,'online');assert.equal(review.programBindings[0].degreeUrl,model.pricing.sourceUrl);
  const facts=assembleProgramRequirements(model,[reviews]),assessment=facts.find(fact=>fact.kind==='assessment');assert(assessment,id+' has usable research facts');assert.equal(assessment.scope,'school-policy');assert.equal(assessment.prominent,false);assert.match(assessment.detail,/requirements vary/);assert.deepEqual(assessment.sourceIds,['wgu-assessment-policy-20261124']);
  const admissions=facts.filter(fact=>fact.kind==='admission');assert.equal(admissions.length,graduate?2:0,id+' undergraduate admission is not copied from the MBA family');
  if(graduate){
   assert(admissions.some(fact=>fact.type==='prior-degree'));assert(admissions.some(fact=>fact.type==='no-gre-gmat'&&/for admission/.test(fact.label)));
   const source=reviews.sources.find(source=>admissions[0].sourceIds.includes(source.id));assert.equal(source.checkedOn,'2026-11-26');assert.equal(source.url,model.pricing.sourceUrl);
   const body=await readFile(new URL(source.capture,import.meta.url),'utf8');assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert(body.includes(source.quote));assert(source.quote.split(/\s+/).length<=25);
   assert(/bachelor’s degree from a recognized, accredited institution/.test(body));assert(/You do not need to take the GRE or GMAT to be admitted to this program/.test(body));
  }
  for(const patch of[{catalogYear:'209901'},{format:'Residential'},{id:'unreviewed-degree'}])assert.deepEqual(assembleProgramRequirements({...model,...patch},[reviews]),[],id+' unrelated scope cannot inherit these facts');
 }
});

test('price profiles reject wrong catalog, units, delivery or degree size before any cost can be shown',()=>{
 for(const[id]of family){const model=models.get(id),plan={programId:id,rows:[],validation:{academicCountsValid:false}};
  for(const patch of[{catalogYear:'209901'},{creditSystem:'semester'},{format:'Residential'},{totalCredits:model.totalCredits+1}])assert.equal(Estimate.calculate({program:{...model,...patch},plan,rates}).reasonCode,'degree-rate-mismatch',id);
  const result=Estimate.calculate({program:model,plan,rates});assert.equal(result.available,false);assert.equal(result.reasonCode,'estimate-needs-review','A researched rate alone does not invent a valid academic plan');
 }
});
