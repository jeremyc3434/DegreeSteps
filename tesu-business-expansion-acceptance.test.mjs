/** End-to-end academic acceptance for the next TESU business batch. The prior
 * release fixture is immutable evidence, not generated expected output. New
 * templates are inspected only when their actual publication receipt exists. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import Catalog from './dist/program-catalog.js';
import Planner from './dist/planner.js';
import Journey from './dist/journey-engine.js';
import Savings from './dist/savings-engine.js';
import Comparison from './dist/plan-comparison-engine.js';
import Sheet from './dist/sheet-state.js';
import Worksheet from './dist/sheet.js';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {validateConnectedWebCapture} from './scripts/pathway-factory/connected-web.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [golden,registry,publication,quality,baselineIndex,library,courseIndex,pathways,directory,costs,kit]=await Promise.all([
 read('./test-support/fixtures/tesu-business-expansion/released-43-0f4ebe.json'),
 read('./dist/data/curriculum-registry.json'),read('./dist/data/publication-index.json'),
 read('./dist/data/pathway-quality-report.json'),read('./dist/data/baseline-index.json'),
 read('./dist/data/plan-library-index.json'),read('./dist/data/plan-course-index.json'),
 read('./dist/data/pathways.json'),read('./dist/data/program-catalog.json'),read('./dist/data/cost-comparisons.json'),loadKit(join(kitsRoot,'tesu'))
]);
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(pathways,directory),registry),publication,registry);
const ready=publication.plans.filter(plan=>plan.publicationReady),readyById=new Map(ready.map(plan=>[plan.modelId,plan]));
const reports=new Map(quality.programs.map(report=>[report.modelId,report]));
const baselines=Object.values(baselineIndex.baselines),packs=new Map(),clone=structuredClone;
const code=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const edition=value=>String(value||'').replace(/[–—]/g,'-');
const level=value=>{const match=/^(associate|bachelor|master)(?:['’]s)?(?: degree)?$/i.exec(String(value||'').trim());return match?.[1].toLowerCase()||null;};
const sum=(rows,predicate=()=>true)=>rows.filter(predicate).reduce((total,row)=>total+row.credits,0);
const group=row=>row.subgroup||row.group||'';
const area=row=>/^area-(?:of-)?study$/.test(group(row));
const candidates=[
 {id:'curriculum-tesu-bsba-human-resources-organizational-management',slug:'bsba-human-resources-organizational-management',route:'tesu-bsba-human-resources-organizational-management',areaCodes:['MAN-3310','MAN-3110','PSY-3600','PSY-3630','SOC-3620','MAN-4250'],chains:[['MAN-3310','MAN-2100'],['PSY-3630','SOC-1010']],measuredOutside:66,measuredUniversity:54},
 {id:'curriculum-tesu-bsba-marketing',slug:'bsba-marketing',route:'tesu-bsba-marketing',areaCodes:['MKT-4110','MKT-4790','MKT-3060','MKT-3350','MKT-4410','MAN-4320'],chains:[],heldFormalPrerequisite:'MAR-3060'},
 {id:'curriculum-tesu-bs-general-management',slug:'bs-general-management',route:'tesu-bs-general-management',areaCodes:['MAN-3110','MAN-3310','FIN-3310','FIN-3340','MKT-4110','MKT-4790'],chains:[['MAN-3310','MAN-2100']],measuredOutside:66,measuredUniversity:54}
];
const coreCodes=['ACC-1010','ACC-1020','CIS-1070','LAW-2010','MAN-2100','MKT-2010','FIN-3010','ECO-1110','ECO-1120','BUS-2100','STA-2010','MAN-3730','MAN-3720','BUS-4210'];
async function modelFor(id){
 const entry=registry.models.find(entry=>entry.id===id);assert(entry,id+' registry entry');
 if(!packs.has(entry.path))packs.set(entry.path,await read('./dist/'+entry.path));
 const packet=packs.get(entry.path),model=(packet.models||[packet]).find(model=>model.id===id);assert(model,id+' actual runtime model');return model;
}
function baselineFor(id){const receipt=readyById.get(id);assert(receipt,id+' publication receipt');const baseline=baselines.find(baseline=>baseline.modelId===id&&receipt.routeIds.includes(baseline.pathwayId));assert(baseline,id+' actual published baseline');return baseline;}
function publishedPlan(model){
 const baseline=baselineFor(model.id),providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))];
 const input={providers,priority:'transfer',allowConditional:false,completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId])),optimizationNodeBudget:12000};
 return Planner.generate(model,input);
}
function assertAcademicPlan(model,plan){
 const validation=Planner.validate(model,plan);assert.equal(validation.academicCountsValid,true,model.id+': '+JSON.stringify(validation.errors));assert.equal(validation.policyChecksComplete,true,model.id);
 assert.equal(sum(plan.rows),model.totalCredits);assert(plan.rows.every(row=>row.status==='planned'&&row.option?.code&&!row.selectionRequired),model.id+' complete named proposed choices');
 assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);assert.equal(plan.coverage.conditionalExternalCredits,0);
 const original=new Map();for(const row of plan.rows.filter(row=>!row.institutional)){const key=row.option.provider+'|'+code(row.option.code);if(!original.has(key))original.set(key,[]);original.get(key).push(row);}
 for(const rows of original.values())if(rows.length>1){const first=rows[0].option;assert(first.bundleId&&Number.isFinite(first.bundleCredits),model.id+' repeated original learning needs an explicit bundled award');assert(rows.every(row=>row.option.bundleId===first.bundleId&&row.option.bundleCredits===first.bundleCredits));assert(sum(rows)<=first.bundleCredits,model.id+' original bundled award cannot be overallocated');}
 const receiving=plan.rows.map(row=>code(row.institutional?row.option.code:row.option.receivingCode)).filter(Boolean);assert.equal(new Set(receiving).size,receiving.length,model.id+' receiving courses counted once');
 assert(plan.sequence.every(step=>!step.executionBlocked),model.id+' the source-backed prerequisites permit an actual course order');
}
function setOption(row,option){row.option=clone(option);row.institutional=option.provider==='University';row.upper=Boolean(option.upper);row.credits=option.credits;row.sourceIds=[...option.sourceIds];row.selectionRequired=false;return row;}

test('all 43 released academic contracts survive the new business batch, including prior outside-credit gains',async()=>{
 assert.equal(golden.releaseCommit,'0f4ebe6e1e73c3705028f0c21393d08218a0555c');assert.equal(golden.models.length,43);assert.equal(new Set(golden.models.map(model=>model.modelId)).size,43);
 assert.equal(publication.curriculumFingerprint,Catalog.publicationFingerprint(registry));assert.equal(baselineIndex.privateRecordsIncluded,false);
 for(const expected of golden.models){
  const receipt=readyById.get(expected.modelId),report=reports.get(expected.modelId),model=await modelFor(expected.modelId);assert(receipt,expected.modelId+' remains ready');
  assert.equal(model.school,expected.school);assert.equal(model.totalCredits,expected.degreeUnits);assert.equal(model.creditSystem,expected.creditSystem);assert.equal(edition(model.catalogYear||model.catalog),expected.catalog);assert.equal(level(model.level),expected.academicLevel);assert.equal(model.requirements.length,expected.requirementCount);assert.equal(sum(model.requirements),expected.degreeUnits);
  assert.equal(report.publication.ready,true);assert.equal(report.research.academicCountsValid,true);assert.equal(report.research.completeRequirementLedger,true);assert.equal(report.research.completeNamedBaseline,true);assert.equal(report.research.blockingFindings,0);assert.equal(report.metrics.conditionalOutsideCredits,0);assert(report.metrics.publishedOutsideCredits>=expected.minimumPublishedOutsideUnits,expected.modelId+' keeps published outside-credit gains');
  for(const field of ['reportedRecordsCount','confirmedRecordsCount','awardedCreditsInBaseline'])assert.equal(report.execution[field],0);
  for(const routeId of expected.routeIds){assert(receipt.routeIds.includes(routeId),routeId+' incoming alias remains valid');assert.equal(library.plans[routeId]?.modelId,expected.modelId);assert.equal(library.plans[routeId]?.tier,'reviewed');assert.equal(library.plans[routeId]?.level,expected.academicLevel);}
  for(const baseline of baselines.filter(plan=>plan.modelId===model.id&&receipt.routeIds.includes(plan.pathwayId))){assert.equal(baseline.qualityReady,true);assert.equal(baseline.validation.academicCountsValid,true);assert.equal(baseline.validation.policyChecksComplete,true);assert.equal(baseline.summary.totalCredits,expected.degreeUnits);assert(baseline.summary.transferCredits>=expected.minimumPublishedOutsideUnits);assert.equal(sum(baseline.rows),expected.degreeUnits);assert(baseline.rows.every(row=>row.status==='planned'&&row.provider&&row.code));}
 }
});

test('public discovery and course matching expose exactly the measured ready model set, with no guessed next count',()=>{
 const offered=Catalog.planLibraryRoutes(catalog),approvedIds=[...readyById.keys()].sort(),offeredIds=offered.map(route=>route.modelId);
 assert.deepEqual([...offeredIds].sort(),approvedIds);assert.equal(new Set(offeredIds).size,offeredIds.length);
 assert.equal(quality.summary.publicationReady,approvedIds.length);assert.equal(courseIndex.selectionPolicy,'publication-ready-models-v1');
 assert.deepEqual(Object.values(courseIndex.plans).map(plan=>plan.modelId).sort(),approvedIds);
 for(const route of offered){const item=library.plans[route.id];assert.equal(item?.published,true);assert.equal(item?.tier,'reviewed');assert.equal(item?.modelId,route.modelId);assert.equal(item?.level,level(route.level));}
 for(const candidate of candidates){const shown=offered.filter(route=>route.modelId===candidate.id);assert.equal(shown.length,readyById.has(candidate.id)?1:0);}
 assert(!offered.some(route=>route.modelId==='tesu-general-management'),'The separately retained legacy General Management draft is not automatically promoted by a similar name');
 assert(!offered.some(route=>route.modelId==='curriculum-wgu-bs-ai-engineering-reviewed'));assert(!offered.some(route=>route.modelId.includes('umpi')&&route.level==='bachelor'));
});

for(const candidate of candidates){
 test(candidate.slug+' canonical area, prerequisites and institutional policies are grounded in its own complete ledger',async()=>{
  const program=kit.programs.find(program=>program.modelId===candidate.id);assert(program,candidate.id+' has an authored ledger');
  const model=compileProgram(kit,program);assert.equal(program.slug,candidate.slug);assert.equal(model.school,'Thomas Edison State University');assert.equal(model.level,'bachelor');assert.equal(model.creditSystem,'semester');assert.equal(model.totalCredits,120);assert.equal(model.requirements.length,40);assert.equal(sum(model.requirements),120);
  assert.equal(sum(model.requirements,row=>row.category==='general'),45);assert.equal(sum(model.requirements,row=>group(row)==='business-core'),42);assert.equal(sum(model.requirements,area),18);assert.equal(sum(model.requirements,row=>row.freeElective===true),15);
  assert.deepEqual(model.requirements.filter(row=>group(row)==='business-core').map(row=>row.code).sort(),[...coreCodes].sort());assert.deepEqual(model.requirements.filter(area).map(row=>row.code).sort(),[...candidate.areaCodes].sort());
  assert.equal(model.institutionMinCredits,15);assert.equal(model.externalMaxCredits,105);assert.equal(model.alternativeMaxCredits,90);assert.equal(model.upperMinCredits,18);
  assert(model.upperGroupMinimums.some(rule=>rule.credits===12&&[rule.group,...rule.groups||[]].some(name=>/^area-(?:of-)?study$/.test(name))),'The 12 upper area credits are an academic constraint, not just a note');
  assert(model.upperGroupMinimums.some(rule=>rule.credits===18&&Array.isArray(rule.groups)&&rule.groups.includes('business-core')&&rule.groups.some(name=>/^area-(?:of-)?study$/.test(name))),'The additional upper course must belong to the area or business core, not a free elective');
  for(const row of model.requirements.filter(row=>group(row)==='business-core'||area(row)||['ENC-1010','ENC-1020'].includes(row.code)))assert.equal(row.minimumGrade,'C',candidate.id+' '+row.code+' grade minimum');
  for(const requiredCode of ['SOS-1100','BUS-4210'])assert.equal(model.requirements.find(row=>row.code===requiredCode)?.institutionalOnly,true);
  for(const [later,earlier]of candidate.chains){const dependent=model.requirements.find(row=>row.code===later),prerequisite=model.requirements.find(row=>row.code===earlier);assert(dependent&&prerequisite);assert(dependent.prerequisites?.includes(prerequisite.id),later+' enforces '+earlier+' in the actual academic sequence');assert(dependent.prerequisiteSourceIds?.length,later+' retains prerequisite source identities');}
  if(candidate.slug.includes('human-resources')){const row=model.requirements.find(row=>row.code==='PSY-3630');assert.equal(row.prerequisites.length,1,'The selected SOC-1010 alternative does not invent a requirement to take both introductory courses');}
  if(candidate.heldFormalPrerequisite){const row=model.requirements.find(row=>row.code==='MKT-4410');assert.deepEqual(row.originalPrerequisiteCodes,['MAR-3060']);assert.deepEqual(row.unresolvedPrerequisiteCodes,['MAR-3060'],'Advisory MKT-3060 does not satisfy an unresolved formal MAR-3060 prerequisite');assert(model.unresolved.some(note=>note.owner==='DegreeSteps'&&note.status==='needs-research'&&/MAR-3060/.test(note.message)),'The unresolved institutional prerequisite remains DegreeSteps research rather than student homework');}
  if(candidate.slug==='bs-general-management'){assert.deepEqual([...new Set(model.requirements.filter(area).map(row=>row.code.split('-')[0]))].sort(),['FIN','MAN','MKT']);assert(!model.requirements.some(row=>row.code==='ACC-4010'),'The revised area genuinely removes the dependent Accounting course instead of dropping its prerequisite');}
  const identity=model.catalogIdentity,source=model.sources.find(source=>source.id===identity?.sourceId);assert.equal(identity?.kind,'reviewed-current-catalog');assert.equal(source?.kind,'university');assert.equal(source.url,identity.sourceUrl);assert.equal(source.sha256,identity.sourceSha256);assert.equal(source.capture,identity.capture);
  const body=await readFile(new URL(source.capture,import.meta.url),'utf8'),meta=await read('./'+source.capture.replace(/\.txt$/,'.json'));assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);
  if(meta.captureFormat==='connected-web-rendered-extract'){assert.equal(meta.status,null,'A native extract cannot invent an origin HTTP response');assert(source.toolResponseReceipt,'The academic review pins its receipt independently of editable sidecar metadata');assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt);await validateConnectedWebCapture({...meta,text:body});}else assert.equal(meta.status,200);
  assert(Number.isFinite(Date.parse(meta.fetchedAt)));assert(meta.fetchedAt.slice(0,10)<=identity.checkedOn,'A review can reuse an earlier retained body without changing its actual retrieval date');assert.match(body,/Total Credit Hours:\s*120/);
 });

 test(candidate.slug+(candidate.heldFormalPrerequisite?' remains unpublished while its formal prerequisite is unresolved':' published baseline is complete, source-bound and executable with actual duplicate, residency and upper constraints'),async()=>{
  if(candidate.heldFormalPrerequisite){
   assert.equal(readyById.has(candidate.id),false,'A balanced numerical ledger does not establish that the formal prerequisite is met');
   const model=await modelFor(candidate.id),row=model.requirements.find(row=>row.code==='MKT-4410');assert.deepEqual(row.unresolvedPrerequisiteCodes,['MAR-3060']);
   const plan=Planner.generate(model,{providers:['Sophia','Study.com','CLEP','UPI Study'],priority:'transfer',allowConditional:false,completed:[],optimizationNodeBudget:12000});assert.equal(plan.validation.academicCountsValid,true,'The prerequisite hold remains independent of complete numerical allocation');assert.equal(plan.coverage.conditionalExternalCredits,0,'This negative is not held by an unrelated conditional provider choice');
   const assessed=assessPathwayQuality({model,plan,route:catalog.pathways.find(route=>route.id===candidate.route),asOf:quality.asOf});assert.equal(assessed.publication.ready,false);assert(assessed.findings.some(finding=>finding.blocking&&finding.category==='missing-research'&&/MAR-3060/.test(finding.message)),'The source-bound unresolved formal prerequisite blocks actual publication');assert.equal(reports.get(candidate.id).publication.ready,false);assert(!Object.values(courseIndex.plans).some(plan=>plan.modelId===candidate.id));assert(!Catalog.planLibraryRoutes(catalog).some(route=>route.modelId===candidate.id));return;
  }
  assert(readyById.has(candidate.id),candidate.id+' has its actually validated publication receipt');
  const model=await modelFor(candidate.id),plan=publishedPlan(model),baseline=baselineFor(model.id),report=reports.get(model.id);assertAcademicPlan(model,plan);assert.equal(report.publication.ready,true);assert.equal(report.research.blockingFindings,0);
  assert.equal(plan.totals.external,candidate.measuredOutside,model.id+' preserves the actual new published outside-credit result');assert.equal(plan.totals.institutional,candidate.measuredUniversity);assert.equal(plan.totals.external,baseline.summary.transferCredits);assert.equal(plan.totals.external,report.metrics.publishedOutsideCredits);assert(plan.totals.institutional>=15);assert(plan.totals.alternative<=90);assert(plan.totals.upper>=18);assert(sum(plan.rows,row=>area(row)&&row.upper)>=12);
  for(const row of plan.rows.filter(row=>!row.institutional)){const proof=row.option.degreePlacementEvidence;assert.equal(row.option.evidence,'published');assert.equal(proof?.modelId,model.id,row.option.code+' belongs to this degree, not another program with similar requirements');assert.equal(proof.requirementId,row.requirementId);assert.equal(proof.receivingCode,row.option.receivingCode);assert.notEqual(row.option.individualApproval,true);if(row.option.eligibilityReview?.providerReviewPending){assert.equal(row.option.courseEligibilityResolution?.individualApproval,false);assert.equal(row.option.eligibilityReview.fullyApproved,false,'A course-specific award does not promote provisional provider governance');}}
  const institutional=Planner.generate(model,{providers:[],allowConditional:false,completed:[],optimizationNodeBudget:12000});assertAcademicPlan(model,institutional);assert.equal(institutional.totals.institutional,120);
  const byCode=new Map(model.requirements.filter(row=>row.code).map(row=>[row.code,row]));
  for(const [later,earlier]of candidate.chains){const dependent=byCode.get(later),prerequisite=byCode.get(earlier),steps=institutional.sequence,after=steps.find(step=>step.requirementIds.includes(dependent.id)),before=steps.find(step=>step.requirementIds.includes(prerequisite.id));assert(after&&before);assert(after.after.includes(prerequisite.id));assert(before.order<after.order,later+' cannot be scheduled before '+earlier);const missingModel=clone(model);missingModel.requirements=missingModel.requirements.filter(row=>row.id!==prerequisite.id);const missing=Planner.generate(missingModel,{providers:[],allowConditional:false,completed:[],optimizationNodeBudget:12000}).sequence.find(step=>step.requirementIds.includes(dependent.id));assert.equal(missing.executionBlocked,true,later+' blocks when its actual prerequisite is missing');}
  const duplicated=clone(plan),outside=duplicated.rows.find(row=>!row.institutional),target=duplicated.rows.find(row=>row.requirementId!==outside.requirementId&&row.credits===outside.credits);setOption(target,outside.option);const duplicateErrors=Planner.validate(model,duplicated);assert.equal(duplicateErrors.academicCountsValid,false);assert(duplicateErrors.errors.some(error=>error.code==='duplicate_source'||error.code==='duplicate_receiving_course'),'The same original course/receiving award cannot fill two degree positions');
  const lowerArea=clone(plan);for(const row of lowerArea.rows.filter(area)){row.upper=false;row.option.upper=false;}assert(Planner.validate(model,lowerArea).errors.some(error=>error.code==='group_upper'),'Enough total credits cannot replace upper-level area credit');
  // Controlled classification distributions isolate the published upper-credit
  // policy. Mapping-integrity checks remain separate and unchanged.
  const upperDistribution=(areaCourses,includeFree)=>{const changed=clone(plan);for(const row of changed.rows){row.upper=false;row.option.upper=false;}const selected=changed.rows.filter(area).slice(0,areaCourses),capstone=changed.rows.find(row=>model.requirements.find(requirement=>requirement.id===row.requirementId).code==='BUS-4210');selected.push(capstone);if(includeFree)selected.push(changed.rows.find(row=>model.requirements.find(requirement=>requirement.id===row.requirementId).freeElective));for(const row of selected){assert(row);row.upper=true;row.option.upper=true;}return changed;};
  const freeCannotSubstitute=upperDistribution(4,true),badUpper=Planner.validate(model,freeCannotSubstitute);assert.equal(sum(freeCannotSubstitute.rows,row=>row.upper),18);assert(!badUpper.errors.some(error=>error.code==='upper_minimum'),'The negative has enough upper credits in total');assert(badUpper.errors.some(error=>error.code==='group_upper'),'12 area + 3 capstone + 3 upper free-elective credits cannot satisfy the extra business/area course');
  const extraAreaCounts=Planner.validate(model,upperDistribution(6,false));assert(!extraAreaCounts.errors.some(error=>['group_upper','upper_minimum'].includes(error.code)),'18 upper area credits plus the capstone do not require another upper business-core course');
  const lowResidency=clone(plan);for(const row of lowResidency.rows.filter(row=>row.institutional&&!model.requirements.find(requirement=>requirement.id===row.requirementId).institutionalOnly)){row.institutional=false;row.option.provider='Prior learning';row.option.creditOrigin='institutional';}assert(Planner.validate(model,lowResidency).errors.some(error=>error.code==='institution_residency'),'Institutional-origin transfer is not TESU residency');
  if(candidate.slug==='bs-general-management'){
   const selectedArea=plan.rows.filter(area).map(row=>(row.option.receivingCode||row.option.code).split('-')[0]);assert(new Set(selectedArea).size>=3,'The actual GM plan spans at least three business disciplines');
   const target=byCode.get('FIN-3310'),replacement=byCode.get('MAN-3310').options.find(option=>option.provider==='University');assert(replacement);const unsupported=Planner.generate(model,{providers:[],allowConditional:false,completed:[],optionSelections:{[target.id]:replacement.id},optimizationNodeBudget:12000});assert(unsupported.setupIssues.some(issue=>issue.code==='invalid_selection'),'A three-discipline area cannot be changed to an unsupported second Management course');
  }
 });

 if(!candidate.heldFormalPrerequisite)test(candidate.slug+' opens with researched filters, prices, Savings and Comparison',async()=>{
  assert(readyById.has(candidate.id));const model=await modelFor(candidate.id),listing=library.plans[candidate.route],fit=listing?.fit;
  assert(fit);assert.equal(fit.modelId,model.id);assert.equal(fit.modality,'online');assert.equal(fit.creditSystem,'semester');assert.equal(fit.selfPaced,false);assert.equal(fit.competencyBased,null);assert.equal(fit.billing,'flat-term');assert.match(fit.sources.learning.url,/^https:\/\//);assert.match(fit.sources.billing.url,/^https:\/\//);assert(fit.programRequirements.length>0,'Sourced school/course context follows the new exact current-catalog binding');
  const route=catalog.pathways.find(route=>route.id===candidate.route);assert(route);const state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality='online';state.profile.hasPrior='none';const before=JSON.stringify(state);
  const adopted=await Worksheet.reviewedBaselineState({state,catalog,model,pathway:route,index:baselineIndex,readAsset:path=>readFile(new URL('./dist'+path,import.meta.url),'utf8'),Planner,Catalog,Sheet,Journey,asOf:quality.asOf,subtle:webcrypto.subtle});assert(adopted,'The actual checksum- and publication-verified worksheet helper adopts the published-only baseline');assert.equal(JSON.stringify(state),before,'Adoption never writes to the original student draft');
  const baseline=baselineFor(model.id),selections=adopted.scenarios[model.id].optionSelections;assert.equal(Object.keys(selections).length,baseline.rows.length);for(const row of baseline.rows)assert.equal(selections[row.requirementId],row.optionId,'Adoption preserves the exact researched choice for '+row.requirementId);
  const adoptedBefore=JSON.stringify(adopted),draft=Journey.buildDraft(adopted,catalog,[model]);assert(draft.plan);assertAcademicPlan(model,draft.plan);assert.equal(draft.plan.totals.external,candidate.measuredOutside);assert.equal(Savings.calculate(adopted,draft,costs).available,true,'The student reaches the degree with working catalog-bound Savings');assert(Number.isFinite(Comparison.remainingCosts(draft,adopted,costs).universityTuition),'What-if Comparison prices the remaining university work');assert.equal(JSON.stringify(adopted),adoptedBefore,'Opening the template and estimates do not change student records');
 });
}
