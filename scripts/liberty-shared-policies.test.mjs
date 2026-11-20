import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLibertySharedPolicyResolutions as apply,libertySharedPolicyReview as review} from './liberty-shared-policies.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const model=(id='curriculum-liberty-psychology-aa-online')=>{const scope=review.programs.find(p=>p.id===id);return{id:scope.id,school:review.school,format:scope.format,level:scope.level,catalogYear:review.catalogYear,totalCredits:scope.totalCredits,creditSystem:'semester',institutionMinCredits:scope.totalCredits*.25,externalMaxCredits:scope.totalCredits*.75,majorInstitutionFraction:.25,majorResidencyBasisCredits:scope.level==='associate'?27:51,requirements:[{id:'writing',credits:3}],sources:[],policyReview:[{field:'alternativeMaxCredits',status:'unverified',message:'Confirm the combined limit on alternative credit sources.'},{field:'upperMinCredits',status:'unverified',message:'Unrelated upper policy remains open.'}]};};
test('one reviewed policy conclusion applies to all eleven explicit compatible degree scopes without changing the ledgers',()=>{
 for(const scope of review.programs){const input=model(scope.id),before=JSON.stringify(input),next=apply(input);assert.notEqual(next,input);assert.equal(JSON.stringify(input),before);assert.deepEqual(next.requirements,input.requirements);assert.equal(next.alternativeMaxCredits,undefined);assert.equal(next.policyReview.find(x=>x.field==='alternativeMaxCredits').status,'not-applicable');assert.equal(next.policyReview.find(x=>x.field==='upperMinCredits').status,'unverified');assert.equal(next.majorResidencyBasisCredits,input.majorResidencyBasisCredits);assert.equal(next.sharedPolicyResolution.personalAwardsCreated,0);assert.deepEqual(apply(next),next);}
});
test('associate degrees retain their own fifteen-credit residency and forty-five-credit outside ceiling',()=>{const next=apply(model());assert.equal(next.institutionMinCredits,15);assert.equal(next.externalMaxCredits,45);assert.equal(next.majorResidencyBasisCredits,27);assert.equal(next.sharedPolicyResolution.totalCredits,60);});
test('wrong school, delivery, catalog, degree level, program identity, student draft or units cannot inherit the conclusion',()=>{
 for(const changes of [{school:'Another University'},{format:'Residential'},{catalogYear:'2025-2026'},{level:'master'},{id:'unreviewed-liberty-degree'},{totalCredits:120},{creditSystem:'quarter'},{auditProvenance:{status:'student-provided'}}]){const input={...model(),...changes};assert.equal(apply(input),input);}
});
test('numeric caps and degree-specific conflicting residency remain unchanged for separate review',()=>{
 for(const changes of [{alternativeMaxCredits:30},{alternativeMaxCredits:0},{alternativeMaxCredits:'unknown'},{institutionMinCredits:18},{externalMaxCredits:42},{majorInstitutionFraction:.5}]){const input={...model(),...changes};assert.equal(apply(input),input);}
});
test('missing actual capture, changed policy conclusions and conflicting source bytes reject reuse',()=>{
 for(const mutate of [r=>r.reviewStatus='candidate',r=>r.rawCapture.supportsResidencyFacts=false,r=>r.rawCapture.sha256='0'.repeat(64),r=>r.policies.alternativeMaxCredits=45,r=>r.source.url='https://provider.example/catalog']){const changed=copy(review);mutate(changed);assert.throws(()=>apply(model(),changed));}
 const input=model();input.sources=[{...review.source,sha256:'f'.repeat(64)}];assert.throws(()=>apply(input),/conflicting/);
});

test('program-specific alternative-credit restrictions and exceptions cannot be cleared by the shared policy',()=>{
 for(const exception of [{field:'alternativeMaxCredits',status:'unverified',message:'This degree may allow a maximum of 24 alternative credits.'},{field:'alternativeMaxCredits',status:'confirmed',message:'Approved specialized degree restriction.',value:24,sourceIds:['program-policy']},{field:'alternativeMaxCredits',status:'unverified',message:'Confirm the combined limit on alternative credit sources.',exception:'Nursing-specific approval required.'},{field:'alternativeMaxCredits',status:'unverified',message:'Confirm the combined limit on alternative credit sources.',reviewId:'another-policy-review'}]){const input=model();input.policyReview.push(exception);const before=JSON.stringify(input);assert.equal(apply(input),input);assert.equal(JSON.stringify(input),before);}
});

test('non-array policy structures remain untouched instead of losing unrelated restrictions',()=>{
 for(const value of [{alternativeMaxCredits:{status:'unverified',value:24},upperMinCredits:{status:'unverified'}},'Confirm a specialized degree cap.',null]){const input=model();input.policyReview=value;const before=JSON.stringify(input);assert.equal(apply(input),input);assert.equal(JSON.stringify(input),before);}
});
