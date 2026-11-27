import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadKit,root} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {applyTESUCoursePlacements,placementKind,TESU_PLACEMENT_REVIEW,TESU_PLACEMENT_ADDITIONS_REVIEW,copiedTESUPlacementSuperseded} from './scripts/tesu-course-placements.mjs';
import {groundedSource} from './scripts/tesu-course-eligibility.mjs';
import {reviewedTESUBusinessSource} from './scripts/tesu-business-blocks.mjs';
import {assertTESUExpandedPlacementInventory} from './test-support/tesu-placement-inventory.mjs';
const packet=JSON.parse(await readFile(root+'/content/pathway-kits/tesu/course-placements-review-2026-11-26.json','utf8'));
const kit=await loadKit(root+'/content/pathway-kits/tesu'),original=compileKit(kit).doc,copy=structuredClone;
const cohorts=assertTESUExpandedPlacementInventory(original.models),additionalPacket=cohorts.packet;
const normalize=v=>String(v).replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();

test('eight degree blocks retain primary source proof while the original996 placements are preserved',async()=>{
 assert.equal(packet.models.length,8);assert.equal(packet.placements.length,1297);assert.deepEqual(packet.models.map(model=>model.modelId).sort(),cohorts.historical.map(model=>model.id).sort());assert.equal(packet.residencyCreditAwarded,0);assert.equal(packet.providerApprovalStatusChanged,false);
 const sources=new Map();for(const source of packet.sources){const entry=source.captureFormat==='connected-web-rendered-extract'?await reviewedTESUBusinessSource(source):await groundedSource(source);assert.equal(source.kind,'university');assert.equal(source.checked,'2026-11-26');assert.equal(entry.source.sha256,packet.sourceHashes[source.id]);sources.set(source.id,entry);}
 for(const model of packet.models){assert.equal(model.freeElectiveCredits,model.allocatedFreeCredits+model.fixedElectiveCredits);assert.equal(model.institutionMinCredits,15);assert.equal(model.upperMinCredits,18);assert.equal(model.alternativeMaxCredits,90);for(const q of model.quotes)assert(normalize(sources.get(q.sourceId).body).includes(normalize(q.text)));}
 for(const q of packet.classificationQuotes)assert(normalize(sources.get(q.sourceId).body).includes(normalize(q.text)));
 const finance=packet.models.find(m=>m.modelId==='curriculum-tesu-bsba-finance');assert.equal(finance.allocatedFreeCredits,12);assert.equal(finance.fixedElectiveCredits,3);
});

test('two November27 ledgers independently prove202 placements with current degree sources and retained taxonomy dates',async()=>{
 assert.equal(additionalPacket.models.length,2);assert.equal(additionalPacket.placements.length,202);assert.equal(additionalPacket.residencyCreditAwarded,0);assert.equal(additionalPacket.providerApprovalStatusChanged,false);assert.equal(additionalPacket.supersededLegacyPlacements.length,0);
 const sources=new Map();for(const source of additionalPacket.sources){const entry=source.captureFormat==='connected-web-rendered-extract'?await reviewedTESUBusinessSource(source,{reviewedOn:'2026-11-27'}):await groundedSource(source);assert.equal(source.kind,'university');assert.equal(entry.source.sha256,additionalPacket.sourceHashes[source.id]);assert.equal(source.checked,source.id==='tesu-liberal-taxonomy-placement-2026-11-26'?'2026-11-26':'2026-11-27');sources.set(source.id,entry);}
 for(const model of additionalPacket.models){assert.equal(model.freeElectiveCredits,15);assert.equal(model.freeElectiveCredits,model.allocatedFreeCredits+model.fixedElectiveCredits);assert.equal(model.institutionMinCredits,15);assert.equal(model.upperMinCredits,18);assert.equal(model.alternativeMaxCredits,90);for(const q of model.quotes)assert(normalize(sources.get(q.sourceId).body).includes(normalize(q.text)));}
 for(const q of additionalPacket.classificationQuotes)assert(normalize(sources.get(q.sourceId).body).includes(normalize(q.text)));
 for(const placement of additionalPacket.placements){const model=original.models.find(model=>model.id===placement.modelId),requirement=model.requirements.find(row=>row.id===placement.requirementId),option=requirement.options.find(option=>option.id===placement.optionId);assert(option);assert.equal(option.coursePlacementReviewId,TESU_PLACEMENT_ADDITIONS_REVIEW);assert.equal(option.degreePlacementEvidence.modelId,model.id);assert.equal(option.degreePlacementEvidence.requirementId,requirement.id);assert(option.degreePlacementEvidence.sourceIds.includes(additionalPacket.models.find(scope=>scope.modelId===model.id).degreeSourceId));}
});

test('reviewed course awards populate exact, free-elective and constrained Liberal Studies slots without promoting UPI or copied candidates',async()=>{
 assert.equal(await runGuards(kit,original),15);const kinds=new Set();let held=0;
 for(const m of original.models)for(const r of m.requirements)for(const o of r.options){
  if(o.coursePlacementReviewId){assert.equal(o.coursePlacementReviewId,cohorts.additions.some(model=>model.id===m.id)?TESU_PLACEMENT_ADDITIONS_REVIEW:TESU_PLACEMENT_REVIEW);assert.equal(o.evidence,'published');assert.equal(o.courseEligibilityResolution.kind,'institution-submitted-course-award');assert.equal(o.eligibilityReview.providerReviewPending,true);assert.equal(o.eligibilityReview.fullyApproved,false);kinds.add(o.degreePlacementEvidence.placementType);if(r.freeElective)assert.equal(o.receivingCode,o.mappingEvidence.receivingCode);}
  if(o.provider==='UPI Study'||o.provider==='Sophia'&&!o.courseEligibilityResolution){held++;assert.equal(o.evidence,'conditional');assert.equal(o.coursePlacementReviewId,undefined);}
 }
 assert.deepEqual([...kinds].sort(),['elective','exact-course','general-category','liberal-arts-area']);assert(held>100);
 const liberal=original.models.find(m=>m.id==='curriculum-tesu-ba-liberal-studies');assert(liberal.requirements.some(r=>r.upperOnly&&r.options.some(o=>o.coursePlacementReviewId&&o.receivingCode==='MAN-3110')));assert(liberal.requirements.filter(r=>r.upperOnly).every(r=>r.options.filter(o=>o.coursePlacementReviewId).every(o=>o.upper)));
});

test('placement review rejects wrong degree capacity, requirements, evidence hashes, quantities, units, level and origin',async()=>{
 const mutations=[
  (m,r,o)=>{o.coursePlacementReviewId='other-review';},(m,r,o)=>{o.degreePlacementEvidence.modelId='other-degree';},(m,r,o)=>{o.degreePlacementEvidence.requirementId='other-requirement';},(m,r,o)=>{o.degreePlacementEvidence.receivingCode='ART-1000';},(m,r,o)=>{o.degreePlacementEvidence.credits=6;},(m,r,o)=>{o.degreePlacementEvidence.creditSystem='quarter';},(m,r,o)=>{o.creditOrigin='institutional';},(m,r,o)=>{o.upper=!o.upper;},(m,r,o)=>{r.excludeAlreadyUsed=false;},(m,r,o)=>{r.category='major';},(m,r,o)=>{r.credits=6;},(m,r,o)=>{r.institutionalOnly=true;},(m,r,o)=>{m.catalog='2027-2028';},(m,r,o)=>{m.sources.find(s=>s.id===packet.models.find(p=>p.modelId===m.id).degreeSourceId).sha256='0'.repeat(64);},(m,r,o)=>{o.degreePlacementEvidence.sourceIds=o.degreePlacementEvidence.sourceIds.filter(id=>id!==packet.models.find(p=>p.modelId===m.id).degreeSourceId);},(m,r,o)=>{delete o.coursePlacementReviewId;}
 ];
 for(const mutate of mutations){const doc=copy(original),m=doc.models.find(m=>m.id==='curriculum-tesu-ba-english'),r=m.requirements.find(r=>r.freeElective&&r.options.some(o=>o.coursePlacementReviewId)),o=r.options.find(o=>o.coursePlacementReviewId);mutate(m,r,o);await assert.rejects(runGuards(kit,doc));}
 for(const mutate of [m=>{m.liberalArtsAllocation.maximum1000Credits=12;},m=>{m.requirements.find(r=>r.liberalArtsAllocation&&r.upperOnly).minCourseLevel=1000;},m=>{m.requirements.find(r=>r.liberalArtsAllocation).allowedCoursePrefixes.push('BUS');}]){const doc=copy(original);mutate(doc.models.find(m=>m.id==='curriculum-tesu-ba-liberal-studies'));await assert.rejects(runGuards(kit,doc));}
});

test('allocator only offers a separately resolved current university award to eligible college-level, nonduplicating degree capacity',()=>{
 const model=original.models.find(m=>m.id==='curriculum-tesu-ba-liberal-studies'),row=kit.equivalencies.equivalencies.find(row=>row.extra?.courseEligibilityResolution&&row.receivingCode==='MAN-3110'),intro=model.requirements.find(r=>r.liberalArtsAllocation&&!r.upperOnly),upper=model.requirements.find(r=>r.liberalArtsAllocation&&r.upperOnly);
 assert.equal(placementKind(model,intro,row),'liberal-arts-area');assert.equal(placementKind(model,upper,row),'liberal-arts-area');
 const lower=kit.equivalencies.equivalencies.find(row=>row.extra?.courseEligibilityResolution&&row.receivingCode==='ECO-1110');assert.equal(placementKind(model,upper,lower),null);
 for(const mutate of [r=>{r.credits=4;},r=>{r.creditSystem='quarter';},r=>{r.extra.mappingEvidence.claimOrigin='provider-published';},r=>{delete r.extra.courseEligibilityResolution;}]){const changed=copy(row);mutate(changed);assert.equal(placementKind(model,intro,changed),null);}
 const protectedRequirement=model.requirements.find(r=>r.institutionalOnly);assert.equal(placementKind(model,protectedRequirement,row),null);
});

test('degree-placement authoring is deterministic and check mode makes no changes',async()=>{
 const paths=['content/pathway-kits/tesu/course-placements-review-2026-11-26.json','content/pathway-kits/tesu/course-placements-review-2026-11-27.json','content/pathway-kits/tesu/equivalencies.json','content/pathway-kits/tesu/school.json',...kit.programs.map(p=>'content/pathway-kits/tesu/programs/'+p.slug+'.json')];const before=await Promise.all(paths.map(p=>readFile(root+'/'+p,'utf8')));const result=await applyTESUCoursePlacements({check:true});assert.equal(result.placements,packet.placements.length+additionalPacket.placements.length);assert.equal(result.models,packet.models.length+additionalPacket.models.length);assert.deepEqual(Object.fromEntries(result.byModel.map(model=>[model.modelId,model.placements])),{...cohorts.historicalCounts,...cohorts.additionalCounts});assert.deepEqual(await Promise.all(paths.map(p=>readFile(root+'/'+p,'utf8'))),before);
});

test('only20 exact duplicate copied placements are superseded while distinct versions, grades and ineligible scopes stay separate',()=>{
 assert.equal(packet.supersededLegacyPlacements.length,20);assert.equal(new Set(packet.supersededLegacyPlacements.map(p=>p.oldRowId)).size,5);
 for(const review of packet.supersededLegacyPlacements){const model=original.models.find(m=>m.id===review.modelId),requirement=model.requirements.find(r=>r.id===review.requirementId),candidate=kit.equivalencies.equivalencies.find(row=>row.id===review.oldRowId),replacement=kit.equivalencies.equivalencies.find(row=>row.id===review.replacementRowId),program=kit.programs.find(p=>p.modelId===model.id);assert(candidate&&replacement,'Original research records remain archived');assert(copiedTESUPlacementSuperseded(model,requirement,candidate,replacement));assert(!program.requirements.find(r=>r.id===requirement.id).optionRows.some(entry=>(typeof entry==='string'?entry.split('@')[0]:entry.row)===candidate.id));assert(requirement.options.some(o=>o.courseEligibilityResolution&&o.receivingCode===candidate.receivingCode));}
 const review=packet.supersededLegacyPlacements[0],model=original.models.find(m=>m.id===review.modelId),requirement=model.requirements.find(r=>r.id===review.requirementId),candidate=kit.equivalencies.equivalencies.find(row=>row.id===review.oldRowId),replacement=kit.equivalencies.equivalencies.find(row=>row.id===review.replacementRowId);
 for(const mutate of [r=>{r.identity.courseVersion=1;},r=>{r.identity.recommendationStart='2020-01-01';},r=>{r.identity.recommendationEnd='2023-12-31';},r=>{r.minimumGrade='B';},r=>{r.minScore=80;},r=>{r.receivingCode='BIO-2080';},r=>{r.provider='Another provider';},r=>{r.credits=4;},r=>{r.id='another-row';}]){const changed=copy(candidate);mutate(changed);assert.equal(copiedTESUPlacementSuperseded(model,requirement,changed,replacement),false);}
 assert.equal(copiedTESUPlacementSuperseded({...model,format:'Residential'},requirement,candidate,replacement),false);assert.equal(copiedTESUPlacementSuperseded(model,{...requirement,institutionalOnly:true},candidate,replacement),false);assert.equal(copiedTESUPlacementSuperseded(model,{...requirement,id:'other-requirement'},candidate,replacement),false);const pending=copy(replacement);delete pending.extra.courseEligibilityResolution;assert.equal(copiedTESUPlacementSuperseded(model,requirement,candidate,pending),false);
});
