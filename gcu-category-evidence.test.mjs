import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Planner from './dist/planner.js';
import {addGCUTransferOptions} from './scripts/add-gcu-transfer-options.mjs';
import {addGCUInstitutionalOptions} from './scripts/add-gcu-institutional-options.mjs';
import {assessPathwayQuality,classifyModelFindings} from './scripts/pathway-quality.mjs';

const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const native=await read('./content/curricula/gcu-bsba-campus.json');
const sophia=await read('./content/research/gcu-sophia-review-2026-11-19.json');
const institutions=await read('./content/research/gcu-institutional-maps-2026-11-19.json');
const model=addGCUInstitutionalOptions(addGCUTransferOptions(native.models[0],sophia),institutions);
const selectedElective=model.requirements.find(row=>row.id==='open-soc102').options.find(option=>option.provider==='ASU Universal Learner'&&option.code==='CIS308');
const plan=Planner.generate(model,{providers:model.defaultProviders,allowConditional:true,completed:[],priority:'transfer',optionSelections:{'open-soc102':selectedElective.id}});
const quality=()=>assessPathwayQuality({model,plan,asOf:'2026-11-19'});

test('published institutional categories retain exact receiving and degree evidence without invented course codes',()=>{
 assert.equal(plan.validation.academicCountsValid,true);
 assert.equal(plan.totals.accounted,120);
 assert.ok(plan.rows.some(row=>row.option?.receivingCategory==='Elective Transfer - UD'));
 assert.equal(quality().findings.some(f=>f.code==='mapping-evidence'),false);
 assert.equal(quality().findings.some(f=>f.code==='conditional-award'),false);
 assert.equal(quality().publication.ready,false);
 assert.ok(quality().publication.reasonCodes.includes('acceleration-not-established'));
});

test('a category label cannot replace missing receiving evidence or program allocation evidence',()=>{
 for(const mutate of [option=>{option.mappingEvidence.sourceIds=['missing-proof'];},option=>{option.degreePlacementEvidence.requirementId='another-requirement';},option=>{option.categoryPlacementReviewed=false;}]){
  const copy=structuredClone(model),row=plan.rows.find(row=>row.option?.receivingCategory==='Elective Transfer - UD');
  const requirement=copy.requirements.find(req=>req.id===row.requirementId);
  mutate(requirement.options.find(option=>option.id===row.option.id));
  const findings=classifyModelFindings(copy,{plan,asOf:'2026-11-19'});
  assert.ok(findings.some(f=>f.code==='mapping-evidence'&&f.requirementIds.includes(row.requirementId)));
 }
});

test('ASU course fees come from reviewed university prices without presenting a complete degree quote',()=>{
 const selected=plan.rows.filter(row=>row.status==='planned'&&row.option?.provider==='ASU Universal Learner');
 const courses=new Set(selected.map(row=>row.option.code));
 const price=plan.costs.providerCosts.find(item=>item.provider==='ASU Universal Learner');
 assert.equal(price?.basis,'published-per-course-fees');
 assert.equal(price.amount,courses.size*425);
 assert.equal(plan.costs.total,null);
 assert.equal(plan.costs.costComplete,false);
 const altered=structuredClone(model);
 for(const requirement of altered.requirements)for(const option of requirement.options)if(option.provider==='ASU Universal Learner')option.costEvidence.sourceIds=['unreviewed-price'];
 const result=Planner.generate(altered,{providers:altered.defaultProviders,allowConditional:true,completed:[],priority:'transfer'});
 assert.equal(result.costs.providerCosts.some(item=>item.provider==='ASU Universal Learner'&&Number.isFinite(item.amount)),false);
 assert.equal(result.costs.total,null);
});
