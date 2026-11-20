/** Acceptance for actual reviewed source reuse, separate from student credit awards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Planner from './dist/planner.js';
import Catalog from './dist/program-catalog.js';
import Journey from './dist/journey-engine.js';
import Sheet from './dist/sheet-state.js';
import {composeSharedAwards} from './scripts/shared-award-composition.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registry=read('./dist/data/curriculum-registry.json'),quality=read('./dist/data/pathway-quality-report.json'),baselines=read('./dist/data/baseline-index.json');
const bundle=read('./content/reuse/liberty-undergraduate-awards.json'),report=read('./dist/data/shared-award-composition.json'),wguBatch=read('./content/reuse/wgu-business-awards.json');
const packs=new Map(),modelFor=id=>{const entry=registry.models.find(entry=>entry.id===id);assert(entry,id);if(!packs.has(entry.path))packs.set(entry.path,read('./dist/'+entry.path));const pack=packs.get(entry.path);return (pack.models||[pack]).find(model=>model.id===id);};
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(read('./dist/data/pathways.json'),read('./dist/data/program-catalog.json')),registry),read('./dist/data/publication-index.json'),registry);
const newPrograms=new Map([
 ['BSMKT',{outside:69,university:43,total:112}],['BSFIN',{outside:78,university:43,total:121}],['BSUXD',{outside:60,university:55,total:115}],['BSC',{outside:60,university:55,total:115}]
]);

test('the actual school batch applies one approved fact bundle across several degrees with auditable source lineage',()=>{
 assert.equal(bundle.reviewStatus,'approved');assert.equal(report.bundleId,bundle.id);assert.equal(report.bundleFingerprint,createHash('sha256').update(JSON.stringify(bundle)).digest('hex'));
 // Liberty publishes from its pathway kit, which already carries the bundle's placements; the registry composes the bundle
 // again only as an audit that must change nothing. The applications are the published options that cite the bundle.
 const factoryModels=registry.models.filter(entry=>entry.school==='Liberty University'&&entry.path.startsWith('data/curricula/')).map(entry=>modelFor(entry.id));
 const applications=factoryModels.flatMap(model=>model.requirements.flatMap(row=>row.options.filter(option=>option.sharedAwardProvenance?.bundleId===bundle.id).map(option=>({modelId:model.id,requirementId:row.id,optionId:option.id,awardId:option.sharedAwardProvenance.awardId,providerCourseId:option.sharedAwardProvenance.providerCourseId}))));
 assert(new Set(applications.map(item=>item.modelId)).size>=6);assert(applications.length>400);
 for(const model of factoryModels){const audit=report.reports.find(result=>result.modelId===model.id);if(audit){assert.equal(audit.addedOptions,0);assert.equal(audit.updatedOptions,0);}assert(!report.unprocessedProgramIds.includes(model.id));}
 assert.equal(report.summary.addedOptions,0);assert.equal(report.summary.updatedOptions,0);
 assert.equal(report.privateStudentRecordsIncluded,false);assert.equal(report.studentCreditsAwarded,0);assert.equal(report.publicationDecisionsMade,0);
 const awards=new Map(bundle.awards.map(award=>[award.id,award])),courses=new Map(bundle.providerCourses.map(course=>[course.id,course])),rules=new Map(bundle.placementRules.map(rule=>[rule.id,rule]));
 const seenModels=new Set(),reuseCounts=new Map();let exact=0,free=0;
 for(const result of report.reports){assert.equal(result.studentCreditsAwarded,0);assert.equal(result.publicationDecisionsMade,0);}
 for(const modelId of new Set(applications.map(item=>item.modelId))){
  const model=modelFor(modelId);
  assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),model.totalCredits);assert.equal(model.creditSystem,'semester');
  for(const application of applications.filter(item=>item.modelId===modelId)){
   const row=model.requirements.find(row=>row.id===application.requirementId),option=row.options.find(option=>option.id===application.optionId),award=awards.get(application.awardId),course=courses.get(application.providerCourseId),rule=rules.get(option.sharedAwardProvenance.placementRuleId);
   assert(row&&option&&award&&course&&rule);assert.equal(row.institutionalOnly===true,false);assert.equal(option.evidence,'published');assert.equal(option.mappingReviewId,bundle.id);
   assert.equal(model.school,award.scope.school);assert.equal(model.catalogYear||model.catalog,award.scope.catalog);assert.equal(model.format,'Online');assert(award.scope.programIds.includes(model.id));assert(rule.modelIds.includes(model.id));
   assert.equal(option.provider,course.provider);assert.equal(option.code,course.code);assert.equal(option.courseVersion,course.courseVersion);assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);
   assert.equal(option.credits,award.credits);assert.equal(option.creditSystem,award.creditSystem);assert.equal(option.receivingCode,award.receivingCode);assert(option.recommendationStart<=report.checkedOn&&option.recommendationEnd>=report.checkedOn);
   assert.equal(option.degreePlacementEvidence.modelId,model.id);assert.equal(option.degreePlacementEvidence.requirementId,row.id);
   for(const id of [...award.sourceIds,...award.scopeSourceIds,...rule.sourceIds]){assert(option.sourceIds.includes(id));const shared=bundle.sources.find(source=>source.id===id),compiled=model.sources.find(source=>source.id===id);assert(compiled&&shared);assert.equal(compiled.sourceContentHash,shared.sourceContentHash);}
   assert(course.identitySourceIds.every(id=>option.identitySourceIds.includes(id)&&!award.sourceIds.includes(id)));
   if(rule.kind==='free-elective'){free++;assert.equal(row.freeElective,true);assert.equal(row.category,'electives');assert.equal(row.majorElective===true,false);assert.equal(option.categoryPlacementReviewed,true);}else{exact++;assert([row.code,...(row.allowedCourseCodes||[])].some(code=>String(code).replace(/\s/g,'').toUpperCase()===award.receivingCode.replace(/\s/g,'').toUpperCase()));}
   seenModels.add(model.id);reuseCounts.set(course.id,(reuseCounts.get(course.id)||new Set()).add(model.id));
  }
 }
 assert.equal(seenModels.size,new Set(applications.map(item=>item.modelId)).size);assert(exact>0&&free>0);assert([...reuseCounts.values()].some(ids=>ids.size>=5),'The same reviewed provider identity must actually reach several degrees');
});

test('composing the compiled batch again preserves option IDs, ledger totals and all existing academic policies',()=>{
 const models=registry.models.filter(entry=>entry.school==='Liberty University'&&entry.path.startsWith('data/curricula/')).map(entry=>modelFor(entry.id)),before=JSON.stringify(models);
 const again=composeSharedAwards(models,bundle,{asOf:bundle.checkedOn});
 assert.equal(JSON.stringify(models),before,'Compilation never mutates its inputs');assert.equal(JSON.stringify(again.models)===before,true,'The actual source batch is idempotent');
 assert.equal(again.report.addedOptions,0);assert.equal(again.report.updatedOptions,0);
 for(const model of again.models){const original=models.find(item=>item.id===model.id);assert.equal(model.totalCredits,original.totalCredits);assert.deepEqual(model.residencyPolicy,original.residencyPolicy);assert.deepEqual(model.policyReview,original.policyReview);assert.equal(model.majorResidencyBasisCredits,original.majorResidencyBasisCredits);assert.equal(model.institutionMinCredits,original.institutionMinCredits);assert.equal(model.externalMaxCredits,original.externalMaxCredits);}
});

test('four real WGU programs open as complete ready course plans with unique original learning and exact CU totals',()=>{
 for(const [code,expected]of newPrograms){
  const review=wguBatch.programs.find(program=>program.programCode===code);assert(review,code);const model=modelFor(review.modelId),route=catalog.pathways.find(route=>route.modelId===model.id);
  assert(Catalog.publishedPlans(catalog,[model]).some(item=>item.id===route.id));assert.equal(quality.programs.find(program=>program.modelId===model.id).publication.ready,true);
  const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog),before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,[model]),plan=draft.plan;
  assert.equal(plan.readiness,'review-ready',code+' must not leave a published student plan behind generic research errors');assert.deepEqual(plan.validation.errors,[]);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);
  assert.equal(plan.totals.accounted,expected.total);assert.equal(plan.totals.external,expected.outside);assert.equal(plan.totals.institutional,expected.university);assert.equal(plan.totals.reported,0);assert.equal(plan.totals.confirmed,0);assert.equal(plan.coverage.conditionalExternalCredits,0);assert.equal(model.creditSystem,'competency-unit');
  const outside=plan.rows.filter(row=>row.option?.provider!=='University'),identities=outside.map(row=>row.option.provider+'|'+row.option.code);assert.equal(new Set(identities).size,identities.length,'One original course earns credit only once in '+code);
  for(const row of plan.rows){assert.equal(row.status,'planned');assert(row.option&&!row.selectionRequired);assert.equal(row.option.evidence,'published');if(row.option.provider!=='University'){assert.equal(row.option.universityMapRecord.programId,review.programId);assert.equal(row.option.mappingEvidence.catalogYear,review.catalogTerm);assert(row.option.identitySourceIds.length>0);assert.equal(row.option.sourceCreditSystem,'semester');assert.equal(row.option.creditSystem,'competency-unit');}}
  assert.equal(JSON.stringify(state),before);assert.deepEqual(state.learning,[]);
 }
});

test('shared receiving facts do not clear the Accounting and IT Management residency exceptions',()=>{
 for(const code of ['BSACC','BSITM']){
  const review=wguBatch.programs.find(program=>program.programCode===code),model=modelFor(review.modelId),result=quality.programs.find(program=>program.modelId===model.id);
  assert(model.requirements.some(row=>row.options.some(option=>option.evidence==='published'&&option.universityMapRecord?.programId===review.programId)),'The shared batch supplies real awards before the remaining exception is resolved');
  assert.equal(result.publication.ready,false);assert(result.findings.some(finding=>finding.blocking&&finding.code==='policy-unresolved'&&finding.field==='institutionMinCredits'));
  assert(model.unresolved.some(note=>/required.capstone applicability/.test(typeof note==='string'?note:note.message)));
  assert(!Catalog.publishedPlans(catalog,[model]).some(route=>route.modelId===model.id));
 }
});

test('earlier published degrees retain exact degree totals while reviewed source expansion improves transfer coverage without personal awards',()=>{
 const expected=[['curriculum-wgu-catalog-ecceaa488637ac83',69,41,110],['liberty-business-residential',83,37,120],['liberty-criminal-justice-online',72,48,120],['liberty-criminal-justice-residential',74,46,120],['curriculum-liberty-healthcare-administration-bs-online',72,48,120],['curriculum-liberty-psychology-bs-online',78,42,120],['curriculum-wgu-catalog-2e49db64c32dfc79',78,39,117]];
 for(const [id,outside,university,total]of expected){
  const baseline=Object.values(baselines.baselines).find(item=>item.modelId===id),model=modelFor(id);assert(baseline,id);
  assert.equal(quality.programs.find(program=>program.modelId===id).publication.ready,true);assert.equal(model.totalCredits,total);
  assert.equal(baseline.summary.transferCredits,outside);assert.equal(baseline.summary.universityCredits,university);assert.equal(baseline.summary.totalCredits,total);
  assert.equal(outside+university,total);assert.equal(baseline.rows.reduce((sum,row)=>sum+row.credits,0),total);
  assert.equal(baseline.rows.filter(row=>row.provider!=='University').reduce((sum,row)=>sum+row.credits,0),outside);
  assert.equal(baseline.rows.filter(row=>row.provider==='University').reduce((sum,row)=>sum+row.credits,0),university);
  assert.equal(new Set(baseline.rows.map(row=>row.requirementId)).size,baseline.rows.length);
  assert.equal(baseline.rows.length,model.requirements.length);assert(baseline.rows.every(row=>row.status==='planned'));
  for(const row of baseline.rows){const requirement=model.requirements.find(item=>item.id===row.requirementId),option=requirement?.options.find(item=>item.id===row.optionId);assert(option,id+' keeps an exact selected option');assert.equal(row.provider,option.provider);assert.equal(row.code,option.code);assert.equal(row.credits,option.credits);assert.equal(option.evidence,'published');}
  assert(!('learning'in baseline));assert(!('completed'in baseline));assert(!('studentRecords'in baseline));
 }
 const beforeExpansion=new Map([['curriculum-liberty-healthcare-administration-bs-online',66],['curriculum-wgu-catalog-2e49db64c32dfc79',66]]);
 for(const [id,previousOutside]of beforeExpansion){const baseline=Object.values(baselines.baselines).find(item=>item.modelId===id);assert(baseline.summary.transferCredits>previousOutside,'New independently reviewed awards must improve '+id);}
});
