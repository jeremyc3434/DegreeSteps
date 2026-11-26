import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,root,sourceIndex} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {applyTESUCourseEligibility,buildCourseResolution,groundedSource,reviewedRows} from './scripts/tesu-course-eligibility.mjs';
import {assertTESUPlacementInventory} from './test-support/tesu-placement-inventory.mjs';
const read=async path=>JSON.parse(await readFile(root+'/'+path,'utf8'));
const packet=await read('content/pathway-kits/tesu/course-specific-eligibility-review-2026-11-26.json');
const clone=structuredClone,normalize=value=>String(value).replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();

test('35 exact course eligibility decisions retain original source dates, real hashes and provisional provider status',async()=>{
 assert.equal(packet.claims.length,35);assert.equal(packet.providerApprovalStatusChanged,false);assert.equal(packet.individualCreditAwards,0);
 const sources=new Map(packet.sources.map(source=>[source.id,source]));
 for(const claim of packet.claims){
  assert.equal(claim.kind,'institution-submitted-course-award');assert.equal(claim.status,'resolved');assert.equal(claim.catalogYear,'2026-2027');assert.equal(claim.provider,'Sophia');assert.equal(claim.individualApproval,false);assert.equal(claim.providerApprovalStatusUnchanged,true);
  assert.equal(claim.enrollmentPermission,'not-established-by-this-course-map');assert(claim.recommendationStart<=packet.checkedOn&&claim.recommendationEnd>=packet.checkedOn);
  for(const id of claim.sourceIds){const source=sources.get(id);assert(source);const body=await readFile(root+'/'+source.capture,'utf8'),hash=createHash('sha256').update(body).digest('hex');assert.equal(hash,claim.sourceHashes[id]);assert.equal(hash,source.sha256);assert.equal(hash,source.sourceContentHash);const sidecar=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(sidecar.sha256,hash);assert.equal(sidecar.status,200);for(const q of claim.quotes.filter(q=>q.sourceId===id))assert(normalize(body).includes(normalize(q.text)));
   if(claim.receivingSourceIds.includes(id)){assert.equal(source.kind,'ace');assert(source.roles.includes('receiving-institution-submitted-equivalency'));assert.equal(source.checked,id.startsWith('tesu-soph-')?'2026-11-26':'2026-11-20','An eligibility review does not refresh the retained map retrieval');}
  }
 }
 const review=await read('content/pathway-kits/tesu/provider-review-2026-11-25.json');assert.equal(review.checkedOn,'2026-11-25');assert(review.provisional.includes('Sophia'));assert(!review.approved.includes('Sophia'));
});

test('compiled eight-program scope resolves course awards while preserving the original five and independently reviewed candidates',async()=>{
 const kit=await loadKit(root+'/content/pathway-kits/tesu'),doc=compileKit(kit).doc;assert.equal(doc.models.length,8);assertTESUPlacementInventory(doc.models);assert.equal(await runGuards(kit,doc),15);
 let resolved=0,heldUPI=0,heldSophia=0;
 for(const model of doc.models)for(const r of model.requirements)for(const o of r.options){
  if(o.courseEligibilityResolution){resolved++;assert.equal(o.eligibilityReview.providerReviewPending,true);assert.equal(o.eligibilityReview.fullyApproved,false);assert.equal(o.mappingEvidence.individualApproval,false);assert.equal(o.courseEligibilityResolution.targetCatalog,model.catalog);assert.equal(o.sourceCreditStatus,'verified');if(o.evidence==='conditional')assert(r.freeElective||r.liberalArtsAllocation);}
  if(o.provider==='UPI Study'){heldUPI++;assert.equal(o.evidence,'conditional');assert.equal(o.mappingResearchClosed,false);assert.equal(o.courseEligibilityResolution,undefined);}
  if(o.provider==='Sophia'&&!o.courseEligibilityResolution){heldSophia++;assert.equal(o.evidence,'conditional');}
 }
 assert(resolved>100&&heldUPI>100&&heldSophia>0,'The review covers reused formal awards without promoting unrelated candidates');
});

test('exact course eligibility guards reject changed identities, credits, units, catalogs, hashes and false individual or provider approval',async()=>{
 const kit=await loadKit(root+'/content/pathway-kits/tesu'),original=compileKit(kit).doc;
 const mutations=[
  o=>{o.courseEligibilityResolution.providerCourseCode='OTHER-0001';},o=>{o.courseEligibilityResolution.courseVersion++;},o=>{o.courseEligibilityResolution.catalogYear='2027-2028';},o=>{o.courseEligibilityResolution.receivingCode='MAT-1050';},o=>{o.courseEligibilityResolution.credits=6;},o=>{o.courseEligibilityResolution.creditSystem='competency-unit';},o=>{o.courseEligibilityResolution.recommendationEnd='2020-01-01';},o=>{o.courseEligibilityResolution.sourceHashes[o.courseEligibilityResolution.receivingSourceIds[0]]='0'.repeat(64);},o=>{o.courseEligibilityResolution.individualApproval=true;},o=>{o.eligibilityReview.fullyApproved=true;},o=>{o.eligibilityReview.providerReviewPending=false;}
 ];
 for(const mutate of mutations){const doc=clone(original),option=doc.models[0].requirements.flatMap(r=>r.options).find(o=>o.courseEligibilityResolution);mutate(option);await assert.rejects(runGuards(kit,doc));}
});

test('new course resolution requires actual university-submitted award authority and independent original identity',async()=>{
 const kit=await loadKit(root+'/content/pathway-kits/tesu'),sources=new Map();for(const source of packet.sources)sources.set(source.id,await groundedSource(source));
 const row=kit.equivalencies.equivalencies.find(reviewedRows),options={sources,catalog:kit.programs[0].catalog,transcript:sources.get('tesu-transcript-course-eligibility-2026-11-26'),policy:sources.get('tesu-provider-review-policy-2026-11-25')};
 assert.equal((await buildCourseResolution(row,options)).providerCourseCode,row.code);
 for(const change of [r=>{r.authored=false;},r=>{r.extra.mappingEvidence.claimOrigin='provider-published';},r=>{r.identity.courseVersion++;},r=>{r.identity.sourceCreditVerification.credits=4;},r=>{r.identity.recommendationEnd='2020-01-01';},r=>{r.extra.eligibilityReview.fullyApproved=true;}]){const changed=clone(row);change(changed);await assert.rejects(buildCourseResolution(changed,options));}
 const badSources=new Map(sources),id=row.extra.mappingEvidence.sourceIds[0],entry=clone(sources.get(id));entry.source.roles=['provider-identity'];badSources.set(id,entry);await assert.rejects(buildCourseResolution(row,{...options,sources:badSources}));
});

test('the exact eligibility authoring workflow is idempotent and check mode writes nothing',async()=>{
 const files=['content/pathway-kits/tesu/equivalencies.json','content/pathway-kits/tesu/school.json','content/pathway-kits/tesu/provider-review-2026-11-25.json','content/pathway-kits/tesu/course-specific-eligibility-review-2026-11-26.json'];const before=await Promise.all(files.map(file=>readFile(root+'/'+file,'utf8')));const report=await applyTESUCourseEligibility({check:true});assert.equal(report.exactClaims,35);assert.equal(report.providerApprovalStatusChanged,false);assert.deepEqual(await Promise.all(files.map(file=>readFile(root+'/'+file,'utf8'))),before);
});
