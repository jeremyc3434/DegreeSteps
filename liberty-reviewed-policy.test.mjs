import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyLibertyReviewedPolicy} from './scripts/liberty-reviewed-policy.mjs';
const review=JSON.parse(readFileSync(new URL('./content/curricula/snapshots/liberty/shared-online-policy-2026-2027-reviewed.json',import.meta.url)));
// Synthetic copy exercises application mechanics and negative provenance flags
// without mutating the real reviewed packet.
const corroboratedFixture={...review,reviewStatus:'verified',rawCapture:{...review.rawCapture,supportsResidencyFacts:true}};
const fixture=()=>({id:'curriculum-liberty-business-aa-online',school:'Liberty University',level:'associate',format:'Online',catalog:'2026–2027',totalCredits:60,institutionMinCredits:15,externalMaxCredits:45,majorInstitutionFraction:.25,majorResidencyBasisCredits:27,upperMinCredits:null,alternativeMaxCredits:null,policyReview:[{field:'institutionMinCredits',status:'unverified'},{field:'alternativeMaxCredits',status:'unverified'}],sources:[],unresolved:['Individual evaluation still applies.']});
test('reviewed residency binds exact associate scope while preserving alternative-credit and individual gaps',()=>{
 const original=fixture(),before=JSON.stringify(original),model=applyLibertyReviewedPolicy(original,corroboratedFixture);
 assert.equal(JSON.stringify(original),before);assert.equal(model.policyEvidence.institutionMinCredits.value,15);assert.equal(model.policyEvidence.externalMaxCredits.value,45);assert.equal(model.policyEvidence.majorInstitutionFraction.value,.25);assert.equal(model.policyReview[0].status,'confirmed');assert.equal(model.policyReview[1].status,'unverified');assert.equal(model.alternativeMaxCredits,null);assert.equal(model.upperMinCredits,null);assert.equal(model.majorResidencyBasisCredits,27);assert.deepEqual(model.unresolved,original.unresolved);
});
test('a scoped policy rejects catalog, format, level and numeric conflicts without applying to other programs',()=>{
 for(const change of [{catalog:'2025–2026'},{format:'Residential'},{level:'bachelor'},{institutionMinCredits:12},{majorInstitutionFraction:.5}])assert.throws(()=>applyLibertyReviewedPolicy({...fixture(),...change},corroboratedFixture));
 const other={...fixture(),id:'another-school-program'};assert.equal(applyLibertyReviewedPolicy(other,corroboratedFixture),other);
});
test('legacy bachelor level spelling remains scoped and repeat application does not duplicate sources',()=>{
 const original={...fixture(),id:'liberty-criminal-justice-online',level:"Bachelor's",totalCredits:120,institutionMinCredits:30,externalMaxCredits:90,majorResidencyBasisCredits:45};const once=applyLibertyReviewedPolicy(original,corroboratedFixture),twice=applyLibertyReviewedPolicy(once,corroboratedFixture);assert.deepEqual(twice,once);assert.equal(twice.sources.length,1);
});
test('pending or non-corroborating raw evidence cannot confirm policy reviews or append evidence',()=>{
 for(const packet of [{...review,reviewStatus:'needs-current-policy-corroboration'},{...corroboratedFixture,reviewStatus:'needs-current-policy-corroboration'},{...corroboratedFixture,rawCapture:{supportsResidencyFacts:false}},{...corroboratedFixture,rawCapture:undefined}]){
  const original=fixture(),before=JSON.stringify(original),result=applyLibertyReviewedPolicy(original,packet);assert.equal(result,original);assert.equal(JSON.stringify(original),before);assert.equal(result.policyReview[0].status,'unverified');assert.equal(result.sources.length,0);
 }
});
