import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Planner from '../dist/planner.js';
import Journey from '../dist/journey-engine.js';
import Sheet from '../dist/sheet-state.js';
import {compileScopedResearchNotices,classifyModelFindings,assessPathwayQuality} from './pathway-quality.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const document=JSON.parse(readFileSync(new URL('../dist/data/curricula/wgu.json',import.meta.url),'utf8'));
const actual=document.models.find(model=>model.id==='curriculum-wgu-catalog-2e49db64c32dfc79');
const input={providers:['Sophia','Study.com'],allowConditional:true,priority:'transfer',completed:[]};
const actualPlan=Planner.generate(actual,input),asOf='2026-11-20';
const notices={
 identifiers:'WGU course identifiers are not printed in the guide; titles are retained without invented course codes.',
 more:'University courses without an outside option are not proof that no transfer exists. Additional approved provider matches require further current program-specific research.',
 personal:'Confirm the student’s applicable program catalog; the official program-guide version is recorded above.',
 awards:'These are the complete named standard-path courses in the cited WGU guide. Current individual transfer approval and receiving level remain unresolved on each outside option.'
};
function fixture(message=notices.more){const model=copy(actual),plan=copy(actualPlan);model.unresolved=[message];return {model,plan,asOf};}
const classification=(f,message)=>classifyModelFindings(f.model,{asOf:f.asOf,plan:f.plan}).find(item=>item.message===message);

test('real reviewed WGU ledger classifies scope questions without deleting their source text or changing plan math',()=>{
 const f=fixture();f.model.unresolved=Object.values(notices);const before=JSON.stringify(f);
 assert.equal(f.plan.validation.academicCountsValid,true);assert.equal(f.plan.validation.policyChecksComplete,true);
 const findings=classifyModelFindings(f.model,{asOf,plan:f.plan});
 for(const [key,code]of [['identifiers','curriculum-identifier-format'],['more','additional-transfer-options'],['personal','personal-catalog-selection'],['awards','selected-transfer-awards-reviewed']]){
  const item=findings.find(item=>item.message===notices[key]);assert.equal(item?.code,code,key);assert.equal(item.blocking,false);assert.deepEqual(item.sourceIds.toSorted(),f.model.curriculumReview.sourceIds.toSorted());
 }
 const result=assessPathwayQuality(f);assert.equal(result.publication.ready,true);assert.equal(result.metrics.feasibleOutsideCredits,78);assert.equal(result.metrics.degreeCredits,117);assert.equal(result.execution.awardedCreditsInBaseline,0);assert.equal(JSON.stringify(f),before);
});

test('additional options remain a research finding until an actual complete solver-checked baseline exists',()=>{
 for(const change of [f=>delete f.plan,f=>f.plan.validation.academicCountsValid=false,f=>f.plan.validation.policyChecksComplete=false,f=>f.plan.rows.pop(),f=>f.plan.rows[0].option.id='unsupported-choice',f=>f.plan.rows[0].option.code='',f=>f.plan.rows[0].selectionRequired=true,f=>f.plan.rows[0].status='reported',f=>f.plan.rows[0].credits+=1]){
  const f=fixture();change(f);const item=classification(f,notices.more);assert.equal(item.code,'unresolved-research');assert.equal(item.blocking,true);
 }
});

test('scope notice cannot close research for another school, catalog, format, level, stale review or changed ledger',()=>{
 for(const change of [f=>f.model.school='Other University',f=>f.model.catalog='202605',f=>f.model.format='Residential',f=>f.model.level='master',f=>f.model.creditSystem='semester',f=>f.model.auditProvenance={status:'student-provided'},f=>delete f.model.curriculumReview,f=>f.model.curriculumReview.checkedOn='2026-10-01',f=>f.model.curriculumReview.ledgerSha256='invalid',f=>f.model.curriculumReview.programId=240,f=>f.model.curriculumReview.recordVersion+=1,f=>f.model.requirements[0].researchGap=true,f=>f.model.requirements[0].sourceIds=['unrelated'],f=>f.model.requirements[0].credits+=1,f=>f.model.sources.find(source=>source.id===f.model.curriculumReview.sourceIds[0]).approvalStatus='Draft',f=>f.model.sources.find(source=>source.id===f.model.curriculumReview.sourceIds[0]).url='https://wgu.edu.attacker.example/catalog',f=>f.model.sources.find(source=>source.id===f.model.curriculumReview.sourceIds[1]).scope.modality='campus']){
  const f=fixture(notices.identifiers);change(f);assert.equal(classification(f,notices.identifiers).code,'unresolved-research');
 }
 const future=fixture(notices.identifiers);future.asOf='2026-11-16';assert.equal(classification(future,notices.identifiers).blocking,true);
});

test('batch adapters can use source-bound typed topics while unverified, unbound and unknown topics still block',()=>{
 const f=fixture();const note={kind:'degree-research-notice',topic:'additional-transfer-options',status:'informational',message:'Additional approved alternatives may improve this complete route.',sourceIds:[...f.model.curriculumReview.sourceIds]};
 f.model.unresolved=[note];assert.equal(classification(f,note.message).code,'additional-transfer-options');
 for(const change of [n=>n.topic='unresearched-laboratory-policy',n=>n.status='unverified',n=>n.sourceIds=[],n=>n.sourceIds=['unrelated'],n=>delete n.kind]){const other=copy(f);change(other.model.unresolved[0]);assert.equal(classification(other,note.message).code,'unresolved-research');}
 const unknown=fixture('An additional exact residency exception still needs research.');assert.equal(classification(unknown,unknown.model.unresolved[0]).blocking,true);
});

test('a documented curriculum does not resolve conditional or wrong-program source awards',()=>{
 for(const change of [f=>f.model.requirements.find(row=>row.options.some(option=>option.provider!=='University')).options.filter(option=>option.provider!=='University').forEach(option=>option.evidence='conditional'),f=>{const row=f.plan.rows.find(row=>row.option.provider!=='University'),r=f.model.requirements.find(r=>r.id===row.requirementId),o=r.options.find(o=>o.id===row.option.id);o.mappingEvidence.catalogYear='202605';},f=>{const row=f.plan.rows.find(row=>row.option.provider!=='University'),r=f.model.requirements.find(r=>r.id===row.requirementId),o=r.options.find(o=>o.id===row.option.id);o.eligibilityReview={eligibleToStart:false};},f=>{const row=f.plan.rows.find(row=>row.option.provider!=='University'),r=f.model.requirements.find(r=>r.id===row.requirementId),o=r.options.find(o=>o.id===row.option.id);o.identitySourceIds=o.mappingEvidence.sourceIds;},f=>{const row=f.plan.rows.find(row=>row.option.provider!=='University'),r=f.model.requirements.find(r=>r.id===row.requirementId),o=r.options.find(o=>o.id===row.option.id);o.sourceCredits+=1;},f=>{const source=f.model.sources.find(source=>source.roles?.includes('receiving-map')&&source.scope?.programName===f.model.title);source.scope.modality='campus';},f=>{const row=f.plan.rows.find(row=>row.option.provider!=='University'),r=f.model.requirements.find(r=>r.id===row.requirementId),o=r.options.find(o=>o.id===row.option.id);o.identitySourceIds=f.model.curriculumReview.sourceIds;o.sourceCreditVerification.sourceIds=f.model.curriculumReview.sourceIds;}]){
  const f=fixture(notices.awards);change(f);assert.equal(classification(f,notices.awards).code,'unresolved-research');assert.equal(classification(f,notices.awards).blocking,true);
 }
 const f=fixture(notices.more);f.model.policyReview.push({field:'institutionMinCredits',status:'unverified',message:'New exact capstone residency question.'});assert.equal(assessPathwayQuality(f).publication.ready,false);assert(assessPathwayQuality(f).findings.some(item=>item.code==='policy-unresolved'));
});


test('compilation keeps four expanded WGU worksheets and their journey drafts valid while preserving original notes and exact credit ledgers',()=>{
 const ids=['curriculum-wgu-catalog-689e417cff765fc9','curriculum-wgu-catalog-d6925a8fbb6e8d9a','curriculum-wgu-catalog-c023977432f945c3','curriculum-wgu-catalog-f5987d0b65c06f56'];
 for(const id of ids){
  const raw=copy(document.models.find(model=>model.id===id));assert(raw,id);raw.unresolved=[notices.awards,notices.more];const batchAsOf='2026-11-20',before=JSON.stringify(raw),compiled=compileScopedResearchNotices(raw,{asOf:batchAsOf});
  assert.equal(JSON.stringify(raw),before,'Compilation does not mutate source models');assert.deepEqual(compiled.requirements,raw.requirements);assert.deepEqual(compiled.sources,raw.sources);assert.equal(compiled.totalCredits,raw.totalCredits);assert.deepEqual(compiled.unresolved.map(note=>note.message),raw.unresolved);
  assert(compiled.unresolved.every(note=>note.kind==='degree-research-notice'&&note.blocking===false&&note.status==='informational'));
  const plan=Planner.generate(compiled,input);assert.equal(plan.validation.valid,true,id+': '+JSON.stringify(plan.validation.errors));assert.equal(plan.readiness,'review-ready');assert.equal(plan.rows.reduce((total,row)=>total+row.credits,0),raw.totalCredits);assert.equal(assessPathwayQuality({model:compiled,plan,asOf:batchAsOf}).publication.ready,true);
  const unplanned=classifyModelFindings(compiled,{asOf:batchAsOf});assert(!unplanned.some(finding=>finding.blocking),'Academic registry agrees with the actual compiled baseline');
  const route={id:id+'-fixture-route',modelId:id,school:raw.school,title:raw.title,level:'bachelor',field:'business',fields:['business'],goals:['any-degree'],modalities:['online'],paceModel:'competency-subscription'},catalog={pathways:[route]};
  let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);Object.assign(state.profile,{goal:'any-degree',modality:'online',degreeLevel:'bachelor',field:'business',hasPrior:'none'});state.journey={...state.journey,completed:true,intakeCompleted:true,view:'home',answers:{...state.journey.answers,purpose:'any-degree',prior:'none'}};
  const draft=Journey.buildDraft(state,catalog,[compiled]);assert(draft.plan,id+' must have an executable journey worksheet');assert.equal(draft.plan.validation.valid,true,id+': '+JSON.stringify(draft.plan.validation.errors));assert.equal(draft.plan.readiness,'review-ready');assert.equal(draft.state.learning.length,0);assert.equal(draft.plan.totals.confirmed,0);
  assert.deepEqual(compileScopedResearchNotices(compiled,{asOf:batchAsOf}),compiled,'Recompilation is deterministic');
 }
});

test('failed compiled notice proofs block even when a prior artifact says nonblocking, resolved, or personal',()=>{
 const f=fixture(notices.awards),compiled=compileScopedResearchNotices(f.model,{asOf});assert.equal(compiled.unresolved[0].blocking,false);
 for(const change of [m=>m.school='Other University',m=>m.catalog='202605',m=>m.curriculumReview.recordVersion+=1,m=>m.sources.find(source=>source.id===m.curriculumReview.sourceIds[0]).checked='2026-10-01',m=>m.unresolved[0].sourceIds=['missing'],m=>m.unresolved[0].status='resolved',m=>m.unresolved[0].status='personal-task',m=>m.unresolved[0].scope='selected-options',m=>m.unresolved[0].appliesWhen='transfer-waiver',m=>m.unresolved[0].noticeCompilation.baselineOptionSelections=Object.fromEntries(Object.keys(m.unresolved[0].noticeCompilation.baselineOptionSelections).map(key=>[key,'invented-choice'])),m=>m.requirements[0].options.filter(option=>option.provider!=='University').forEach(option=>option.sourceCredits+=1)]){
  const model=copy(compiled);change(model);let findings=classifyModelFindings(model,{asOf});assert(findings.some(item=>item.code==='unresolved-research'&&item.blocking),'No optional/personal/resolved fallback may suppress a failed typed proof');
  const reset=compileScopedResearchNotices(model,{asOf});assert(reset.unresolved.some(note=>note.blocking===true&&note.status==='unresolved'),'Recompilation makes a failed prior artifact blocking for Planner too');
 }
 const later=classifyModelFindings(compiled,{asOf:'2026-12-19'});assert(later.some(item=>item.blocking));
});

test('changing a compiled course choice to conditional still requires review and a new genuine question remains blocking',()=>{
 const f=fixture(notices.awards),compiled=compileScopedResearchNotices(f.model,{asOf});const basePlan=Planner.generate(compiled,input),selected=basePlan.rows.find(row=>row.option.provider!=='University'),requirement=compiled.requirements.find(row=>row.id===selected.requirementId),conditional=copy(requirement.options.find(option=>option.id===selected.option.id));
 conditional.id+='-conditional-review';conditional.evidence='conditional';conditional.conditions=['The receiving-program applicability requires a separate review.'];requirement.options.push(conditional);
 const changed=Planner.generate(compiled,{...input,optionSelections:{[requirement.id]:conditional.id}});assert.equal(changed.validation.valid,false);assert(changed.validation.errors.some(issue=>issue.code==='conditional_mapping'));assert.equal(assessPathwayQuality({model:compiled,plan:changed,asOf}).publication.ready,false);
 const genuine=compileScopedResearchNotices({...f.model,unresolved:[notices.awards,'A new residency policy needs source review.']},{asOf});assert(genuine.unresolved.includes('A new residency policy needs source review.'));assert.equal(Planner.generate(genuine,input).validation.valid,false);assert(classifyModelFindings(genuine,{asOf}).some(item=>item.message==='A new residency policy needs source review.'&&item.blocking));
});
