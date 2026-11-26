import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileKit} from './scripts/pathway-factory/compile.mjs';
import {ROUTE as dataRoute} from './scripts/wgu-data-analytics.mjs';
import {routes as cloudRoutes} from './scripts/wgu-cloud-network.mjs';
const require=createRequire(import.meta.url),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Catalog=require('./dist/program-catalog.js');

async function fixture(){
  const kit=await loadKit('content/pathway-kits/wgu'),{doc}=compileKit(kit);
  const routes=[dataRoute,...cloudRoutes].map(route=>({...route,modelId:kit.programs.find(program=>program.routeIds.includes(route.id)).modelId,routeType:'catalog-program',field:'technology',fields:['technology'],goals:['any-degree','career-growth','change-career']}));
  const catalog=Catalog.merge({pathways:routes},{programs:[]}),models=doc.models.filter(model=>routes.some(route=>route.modelId===model.id));
  // The registry normally supplies these exact named university alternatives.
  // Do not run the quality notice compiler: Journey must accept canonical data.
  for(const model of models)for(const row of model.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
  return {catalog,models};
}
const seed=(catalog,route)=>Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);

test('the five new canonical WGU plans are Journey review-ready while student tasks and informational coverage remain visible',async()=>{
  const {catalog,models}=await fixture(),original=structuredClone(models);assert.equal(models.length,5);
  for(const route of catalog.pathways){
    const model=models.find(model=>model.id===route.modelId),draft=Journey.buildDraft(seed(catalog,route),catalog,models);
    assert.equal(draft.plan?.readiness,'review-ready',JSON.stringify(draft.plan?.validation));assert.deepEqual(draft.targetIssues,[]);assert.deepEqual(draft.targetUnknowns,[]);assert.deepEqual(draft.plan.validation.errors,[]);
    assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.validation.policyChecksComplete,true);
    assert.equal(draft.plan.totals.reported,0);assert.equal(draft.plan.totals.confirmed,0);
    assert.equal(draft.plan.totals.external,model.id==='curriculum-wgu-bs-data-analytics-reviewed'?62:34);
    assert.equal(draft.plan.totals.institutional,model.id==='curriculum-wgu-bs-data-analytics-reviewed'?60:model.totalCredits===109?75:78);
    assert(model.unresolved.every(note=>note.owner==='student'&&note.status==='personal-task'));
    assert(draft.plan.personalTasks.some(task=>/admission/.test(task.message)&&task.sourceIds.length>0));
    assert(model.rulesNotes.some(note=>/additional approved provider matches may exist/.test(note)));assert.equal(model.transferEvidenceReview.allPossibleSourcesGloballyReviewed,false);
    assert(Object.values(model.transferRules.publishedNotes).some(note=>/past five years/.test(note)),'Retain the actual IT currency policy');
    assert(!draft.plan.researchTasks.some(task=>task.code==='program_research'));
  }
  assert.deepEqual(models,original,'Draft generation must not rewrite academic evidence or the student-task classification');
});

test('a missing residency proof still blocks a new WGU Journey draft',async()=>{
  const {catalog,models}=await fixture(),model=models.find(model=>model.id==='curriculum-wgu-bs-cloud-network-engineering-general-reviewed');
  model.residencyPolicy.calculatedMinimumInstitutionCUs=-1;
  const route=catalog.pathways.find(route=>route.modelId===model.id),draft=Journey.buildDraft(seed(catalog,route),catalog,models);
  assert.equal(draft.plan.readiness,'draft');assert.equal(draft.plan.validation.policyChecksComplete,false);assert(draft.plan.validation.errors.length>0);
});
