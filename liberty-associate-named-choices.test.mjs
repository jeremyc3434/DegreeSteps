import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {applyCompiled,reviewPath} from './scripts/liberty-associate-named-choices.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js');
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8')),registry=read('./dist/data/curriculum-registry.json'),review=read('./'+reviewPath),ids=review.programs.map(program=>program.modelId);
function fixture(id){const entry=registry.models.find(entry=>entry.id===id);assert(entry);const document=read('./dist/'+entry.path);return {entry,model:document.models.find(model=>model.id===id)};}
function baseline(model){return Planner.generate(model,{providers:[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University'),allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});}
for(const id of ids)test(id+' has a full named zero-record baseline without weakening residency',()=>{
 const {entry,model:original}=fixture(id),before=JSON.stringify(original),model=applyCompiled(original),plan=baseline(model);
 Catalog.validateModel(model,entry);assert.equal(JSON.stringify(original),before);assert.deepEqual(applyCompiled(model),model);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),60);assert(plan.rows.every(row=>row.option?.code&&!row.selectionRequired&&!row.option.selectionRequired));assert.equal(plan.validation.academicCountsValid,true);
 const university=plan.rows.filter(row=>row.option.provider==='University'),universityMajor=university.filter(row=>row.category==='major');assert(university.reduce((sum,row)=>sum+row.credits,0)>=model.institutionMinCredits);assert(universityMajor.reduce((sum,row)=>sum+row.credits,0)>=model.majorResidencyBasisCredits*model.majorInstitutionFraction);
 assert.equal(new Set(university.map(row=>row.option.code)).size,university.length,'University fallback choices may not duplicate a single course');
 assert(plan.rows.filter(row=>row.option.provider!=='University').reduce((sum,row)=>sum+row.credits,0)>=30);assert(plan.rows.every(row=>row.status==='planned'));
 assert.equal(model.institutionMinCredits,original.institutionMinCredits);assert.equal(model.externalMaxCredits,original.externalMaxCredits);assert.equal(model.majorResidencyBasisCredits,original.majorResidencyBasisCredits);assert.equal(model.majorInstitutionFraction,original.majorInstitutionFraction);
});
test('the two-credit general elective becomes two sourced one-credit alternatives, preserving the 24-credit major ledger',()=>{
 const model=applyCompiled(fixture(ids[0]).model),rows=model.requirements.filter(row=>row.id.endsWith('-8-a')||row.id.endsWith('-8-b'));
 assert.equal(rows.length,2);assert(rows.every(row=>row.credits===1&&row.freeElective));assert.equal(model.requirements.filter(row=>row.category==='major').reduce((sum,row)=>sum+row.credits,0),24);
 assert.deepEqual(rows.map(row=>row.options.find(option=>option.provider==='University').code),['INFT 102','INFT 103']);
 for(const row of rows)for(const option of row.options.filter(option=>option.provider==='Sophia')){assert.equal(option.credits,1);assert.equal(option.sourceCreditStatus,'unknown');assert.equal(Object.hasOwn(option,'sourceCredits'),false);assert.equal(option.evidence,'conditional');assert(['SCOM 1XX','CSIS 1XX'].includes(option.receivingCode));}
});
test('psychology elective university choices use distinct allowed PSYC courses and the existing sourced prerequisite route',()=>{
 const model=applyCompiled(fixture(ids[1]).model),rows=model.requirements.filter(row=>row.id.startsWith('psychology-elective-'));
 assert.deepEqual(rows.map(row=>row.options.find(option=>option.provider==='University').code),['PSYC 312','PSYC 365','PSYC 380']);
 for(const row of rows){assert.deepEqual(row.prerequisites,['psyc-101','psyc-255']);assert.equal(row.prerequisitePolicy.status,'verified');assert.equal(row.prerequisitePolicy.rule.allOf[1].code,'PSYC 255');}
});
test('reviewed choices fail closed when catalog, delivery, ledger, program source or allowed prefix changes',()=>{
 for(const mutate of [model=>model.catalogYear='2025-2026',model=>model.format='Residential',model=>model.majorResidencyBasisCredits=99,model=>model.sources=model.sources.filter(source=>source.id!=='liberty-psychology-aa-online-2026'),model=>model.requirements.find(row=>row.id==='psychology-elective-2').allowedCoursePrefixes=['BUSI']]){
  const model=structuredClone(fixture(ids[1]).model);mutate(model);assert.throws(()=>applyCompiled(model));
 }
 const other={id:'not-a-reviewed-associate',school:'Other University'};assert.equal(applyCompiled(other),other);
});
