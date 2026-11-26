import test from 'node:test';
import assert from 'node:assert/strict';
import {loadKit,mergeProviderIdentity,clone,list,awardFields,kitDirs} from './scripts/pathway-factory/lib.mjs';
import {compileOption} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';

const kit=await loadKit('content/pathway-kits/liberty');
const course=kit.providers.get('CLEP').courses.find(course=>course.code==='CLEP-0039');
const legacyRows=kit.equivalencies.equivalencies.filter(row=>row.provider==='CLEP'&&row.code===course.code);
const priorMerge=(course,row)=>{const identity={...clone(course),...clone(row.identity||{})};for(const field of list(row.identityOmit))delete identity[field];return identity;};

test('the four canonical Financial Accounting rows retain exact original evidence and all receiving awards',()=>{
  assert.equal(legacyRows.length,4);
  for(const row of legacyRows){
    const before=JSON.stringify({course,row}),prior=priorMerge(course,row),identity=mergeProviderIdentity(course,row);
    assert.equal(identity.sourceCredits,3);
    assert.deepEqual(identity.sourceCreditVerification,course.sourceCreditVerification);
    assert.deepEqual(identity.identitySourceIds,[...row.identity.identitySourceIds,...course.identitySourceIds]);
    assert.equal(identity.sourceCreditBasis,course.sourceCreditBasis);
    const {identitySourceIds,sourceCreditBasis,...changedRest}=identity;
    const {identitySourceIds:oldSources,sourceCreditBasis:oldBasis,...priorRest}=prior;
    assert.deepEqual(changedRest,priorRest,'Only inherited provenance is normalized');
    const option=compileOption(kit,{slug:'test'}, {id:'test'},row,['online']);
    for(const field of awardFields)if(row[field]!==undefined&&field!=='conditions')assert.deepEqual(option[field],row[field],field+' remains a receiving-school fact');
    assert.deepEqual(option.conditions,row.conditionIds.map(id=>kit.equivalencies.conditionLibrary[id]));
    assert.equal(JSON.stringify({course,row}),before,'Never mutate shared identities or canonical receiving rows');
  }
});

test('a distinct receiving quantity never replaces the original exam quantity',()=>{
  const row={...clone(legacyRows[0]),credits:6,receivingCode:'TEST 101'};
  const option=compileOption(kit,{slug:'test'},{id:'test'},row,['online']);
  assert.equal(option.sourceCredits,3);
  assert.equal(option.sourceCreditVerification.credits,3);
  assert.equal(option.credits,6);
  assert.equal(option.receivingCode,'TEST 101');
  assert.deepEqual(option.sourceIds,row.sourceIds);
});

test('explicit original-fact overrides and source-specific basis reviews keep their exact original behavior',()=>{
  for(const override of [{sourceCredits:null},{sourceCreditSystem:'quarter'},{sourceCreditStatus:'unknown'},{sourceCreditVerification:{credits:1,creditSystem:'semester',sourceIds:['different-original']}},{sourceUpper:true},{aceId:'CLEP-0001'},{courseVersion:1},{recommendationStart:'2020-01-01'},{recommendationEnd:'2021-01-01'},{recommendationPeriodSourceIds:['older-period']},{identityReviewId:'other-review'},{identityCheckedOn:'2020-01-01'},{providerCourseCode:'A different exam'},{sourceCreditBasis:'This row intentionally retains a separate original review.'}]){
    const row=clone(legacyRows[0]);Object.assign(row.identity,override);
    assert.deepEqual(mergeProviderIdentity(course,row),priorMerge(course,row),JSON.stringify(override));
  }
});

test('explicit omissions are never restored by the provenance normalization',()=>{
  for(const field of ['sourceCredits','sourceCreditSystem','sourceCreditStatus','sourceCreditVerification','sourceUpper','aceId','courseVersion','recommendationStart','recommendationEnd','recommendationPeriodSourceIds','identityReviewId','identityCheckedOn','identitySourceIds','sourceCreditBasis','providerCourseCode']){
    const row={...clone(legacyRows[0]),identityOmit:[field]},merged=mergeProviderIdentity(course,row);
    assert(!Object.hasOwn(merged,field),field);
    assert.deepEqual(merged,priorMerge(course,row),'An intentional original omission blocks automatic normalization');
  }
  const urlOmitted={...clone(legacyRows[0]),identityOmit:['url']},merged=mergeProviderIdentity(course,urlOmitted);
  assert(!Object.hasOwn(merged,'url'));
  assert(merged.identitySourceIds.includes(course.identitySourceIds[0]));
});

test('unreviewed, mismatched, incomplete and inactive shared originals are not promoted',()=>{
  for(const change of [{code:'CLEP-0001'},{aceId:'CLEP-0001'},{identityReviewId:'unreviewed'},{sourceCreditStatus:'unknown'},{sourceCredits:0},{sourceCredits:'3'},{sourceCreditSystem:'quarter'},{identitySourceIds:[]},{sourceCreditVerification:{credits:6,creditSystem:'semester',sourceIds:course.identitySourceIds}},{sourceCreditVerification:{credits:3,creditSystem:'semester',sourceIds:[]}},{sourceCreditBasis:''},{courseVersion:null},{identityCheckedOn:'2026-99-01'},{recommendationStart:'2027-01-01'},{recommendationEnd:'2026-01-01'}]){
    const changed={...clone(course),...change};
    assert.deepEqual(mergeProviderIdentity(changed,legacyRows[0]),priorMerge(changed,legacyRows[0]),JSON.stringify(change));
  }
  const otherProvider={...clone(legacyRows[0]),provider:'Sophia'};
  assert.deepEqual(mergeProviderIdentity(course,otherProvider),priorMerge(course,otherProvider));
});

test('all fresh CLEP identity collisions are resolved without changing row order or other school overrides',async()=>{
  let reviewedRows=0,normalized=0;
  for(const dir of await kitDirs()){
    const school=await loadKit(dir),ids=school.equivalencies.equivalencies.map(row=>row.id),provider=school.providers.get('CLEP');
    for(const row of school.equivalencies.equivalencies.filter(row=>row.provider==='CLEP')){
      const original=provider?.courses.find(course=>course.code===row.code);
      if(original?.identityReviewId!=='clep-current-independent-identities-2026-11-26')continue;
      reviewedRows++;const prior=priorMerge(original,row),identity=mergeProviderIdentity(original,row);
      if(school.school.id==='liberty'){
        normalized++;assert(original.identitySourceIds.every(id=>identity.identitySourceIds.includes(id)));
        assert.equal(identity.sourceCreditBasis,original.sourceCreditBasis);
      }else assert.deepEqual(identity,prior);
    }
    assert.deepEqual(school.equivalencies.equivalencies.map(row=>row.id),ids);
  }
  assert.equal(reviewedRows,62);
  assert.equal(normalized,40);
});

test('the verifier checks newly inherited original evidence instead of the stale row-only list',async()=>{
  const changed=clone(kit),missing=course.identitySourceIds[0];
  changed.providers=new Map(kit.providers);
  const provider=clone(kit.providers.get('CLEP'));
  provider.sources=provider.sources.filter(source=>source.id!==missing);
  changed.providers.set('CLEP',provider);
  changed.school.sources=changed.school.sources.filter(source=>source.id!==missing);
  for(const program of changed.programs)program.sources=(program.sources||[]).filter(source=>source.id!==missing);
  const result=await verifyKit(changed,{asOf:'2026-11-26'});
  assert(result.errors.some(error=>error.code==='unknown-source'&&error.message.includes(missing)&&error.message.includes('identitySourceIds')));
});
