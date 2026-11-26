import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildExpansionQueue,readProviderPolicyCaptures} from './build-plan-expansion-queue.mjs';
const model=(id,overrides={})=>({id,title:id,school:'Synthetic University',catalog:'2026-2027',format:'Online',level:'bachelor',creditSystem:'semester',sources:[{id:'map',url:'https://synthetic.invalid/official-map',kind:'university',sha256:'a'.repeat(64)}],requirements:[{id:'english',code:'ENG 101',credits:3,options:[{id:'course',provider:'Synthetic provider',code:'COURSE 1',credits:3,sourceCredits:3,creditSystem:'semester',sourceCreditSystem:'semester',creditOrigin:'alternative',receivingCode:'ENG 101',courseVersion:'2',sourceIds:['map']}]}],...overrides});
const program=(id,overrides={})=>({modelId:id,publication:{ready:false},findings:[{id:id+'-mapping',code:'mapping-evidence',blocking:true,owner:'research',scope:'option',requirementIds:['english'],optionIds:['course'],sourceIds:['map'],message:'Needs receiving-school review.'}],...overrides});
const quality=programs=>({programs,asOf:'2026-11-25',registryRevision:'synthetic-v1'});
test('one school award review retains separate exact degree-placement contexts and approves nothing',()=>{
 const report=buildExpansionQueue({models:[model('a'),model('b')],quality:quality([program('a'),program('b')])});
 assert.equal(report.tasks.length,1);assert.deepEqual(report.tasks[0].affectedModelIds,['a','b']);assert.equal(report.tasks[0].contexts.length,2);assert.equal(report.summary.blockingFindingOccurrences,2);assert.equal(report.summary.readyPlans,0);assert.equal(report.automaticApprovals,0);assert.equal(report.tasks[0].automaticApproval,false);assert.equal(report.runtimeAiCalls,0);
});
test('award review tasks preserve catalog, delivery, degree level, unit, origin and exact agreement-program boundaries',()=>{
 const original=model('a'),variants=[model('b',{catalog:'2027-2028'}),model('c',{format:'Residential'}),model('d',{level:'master'}),model('e',{creditSystem:'quarter'}),model('f'),model('g')];
 variants[4].requirements[0].options[0].universityMapRecord={programId:92,agreementId:242};variants[5].requirements[0].options[0].creditOrigin='institutional';
 const models=[original,...variants],report=buildExpansionQueue({models,quality:quality(models.map(row=>program(row.id)))});assert.equal(report.tasks.length,7);
});
test('different provider versions and source bodies remain separate; task revisions are deterministic',()=>{
 const a=model('a'),b=model('b'),c=model('c');b.requirements[0].options[0].courseVersion='3';c.sources[0].sha256='b'.repeat(64);
 const input={models:[a,b,c],quality:quality(['a','b','c'].map(id=>program(id)))};const report=buildExpansionQueue(input);assert.equal(report.tasks.length,3);assert.equal(report.revision,buildExpansionQueue({models:[c,b,a],quality:quality([...input.quality.programs].reverse())}).revision);
});
test('similar unknown findings stay program-specific and source reports never expose student records',()=>{
 const models=[model('a',{studentEmail:'private@example.invalid'}),model('b')],programs=models.map(row=>program(row.id,{findings:[{id:row.id+'-specific',code:'new-specific-rule',blocking:true,owner:'research',message:'Same wording.'}]}));
 const report=buildExpansionQueue({models,quality:quality(programs)});assert.equal(report.tasks.length,2);assert(!JSON.stringify(report).includes('private@example.invalid'));assert.equal(report.privateStudentRecordsIncluded,false);
});
test('a stale quality report fails rather than silently omitting a missing model',()=>{assert.throws(()=>buildExpansionQueue({models:[],quality:quality([program('missing')])}),/unknown model/);});

const pendingReview=()=>({status:'provisionally-approved-review-pending',provider:'Synthetic provider',fullyApproved:false,providerReviewPending:true,individualApproval:false,enrollmentPermission:'not-established-by-provider-status',reviewId:'school-provider-policy-review',checkedOn:'2026-11-25',scope:'Provider approval status only; receiving awards and personal eligibility are separate.',sourceIds:['policy']});
async function policyFixture(){
 const base=await mkdtemp(join(tmpdir(),'degree-provider-policy-'));await mkdir(join(base,'content/source-captures'),{recursive:true});
 const source=async(body,url='https://synthetic.invalid/provider-policy')=>{
  const sha256=createHash('sha256').update(body).digest('hex'),capture='content/source-captures/'+sha256.slice(0,16)+'.txt';
  await writeFile(join(base,capture),body);await writeFile(join(base,capture.replace(/\.txt$/,'.json')),JSON.stringify({url,sha256,status:200,fetchedAt:'2026-11-25T10:00:00Z'}));
  return{id:'policy',kind:'university',url,capture,sourceContentHash:'sha256:'+sha256};
 };
 const policy=await source('Synthetic University: the provider is provisionally approved and course evaluation is separate.');
 const pending=(id,overrides={})=>{const result=model(id,overrides);result.sources.push({...policy});result.requirements[0].options[0].eligibilityReview=pendingReview();return result;};
 const finding=id=>program(id,{findings:[{id:id+'-eligibility',code:'provider-eligibility',blocking:true,owner:'research',scope:'option',requirementIds:['english'],optionIds:['course'],sourceIds:['map','policy'],message:'The provider review is pending; receiving awards remain separate.'}]});
 const build=async models=>buildExpansionQueue({models,quality:quality(models.map(row=>finding(row.id))),providerPolicyCaptures:await readProviderPolicyCaptures(models,{base})});
 return{base,source,policy,pending,finding,build,cleanup:()=>rm(base,{recursive:true,force:true})};
}
test('one hash-verified provider policy groups research while preserving different receiving awards and course contexts',async()=>{
 const f=await policyFixture();try{
  const a=f.pending('a'),b=f.pending('b');
  a.requirements[0].options[0].universityMapRecord={programId:92,agreementId:242};b.requirements[0].options[0].universityMapRecord={programId:93,agreementId:242};b.requirements[0].options[0].courseVersion='3';
  a.requirements[0].options[0].conditions=['First exact degree exception.'];b.requirements[0].options[0].conditions=['Different exact degree exception.'];
  const models=[a,b],before=JSON.stringify(models),programs=models.map(row=>{const eligibility=f.finding(row.id);eligibility.findings.push(...program(row.id).findings);return eligibility;});
  const captures=await readProviderPolicyCaptures(models,{base:f.base}),report=buildExpansionQueue({models,quality:quality(programs),providerPolicyCaptures:captures});
  const shared=report.tasks.filter(task=>task.kind==='provider-policy');assert.equal(shared.length,1);assert.equal(report.tasks.filter(task=>task.kind==='receiving-award').length,2,'Program-specific receiving awards are not approved or collapsed by provider policy');
  assert.deepEqual(shared[0].affectedModelIds,['a','b']);assert.equal(shared[0].occurrences,2);assert.equal(report.summary.blockingFindingOccurrences,4);assert.equal(report.summary.readyPlans,0);
  assert.deepEqual(shared[0].contexts.map(context=>context.courseClaims[0].receivingProgramId),[92,93]);assert.deepEqual(shared[0].contexts.map(context=>context.courseClaims[0].courseVersion),['2','3']);
  assert.deepEqual(shared[0].contexts.map(context=>context.courseClaims[0].conditions),[['First exact degree exception.'],['Different exact degree exception.']]);assert.equal(shared[0].providerReviewScope,pendingReview().scope);
  assert(shared[0].contexts.every(context=>context.optionIds[0]==='course'&&context.sourceIds.includes('map')));assert.equal(shared[0].sources.length,1);assert.match(shared[0].sources[0].hash,/^sha256:[a-f0-9]{64}$/);
  assert.equal(report.automaticApprovals,0);assert.equal(shared[0].automaticApproval,false);assert.equal(report.runtimeAiCalls,0);assert.equal(JSON.stringify(models),before,'Queue construction never mutates academic evidence');
  const reverse=buildExpansionQueue({models:[b,a],quality:quality([...programs].reverse()),providerPolicyCaptures:new Map([...captures].reverse())});assert.equal(report.revision,reverse.revision);
 }finally{await f.cleanup();}
});
test('provider policy sharing preserves school, catalog, delivery, level, unit, provider and review boundaries',async()=>{
 const f=await policyFixture();try{
  const a=f.pending('a'),variants=[f.pending('school',{school:'Another University'}),f.pending('catalog',{catalog:'2027-2028'}),f.pending('format',{format:'Residential'}),f.pending('level',{level:'master'}),f.pending('units',{creditSystem:'quarter'}),f.pending('provider'),f.pending('review'),f.pending('scope'),f.pending('date')];
  variants[5].requirements[0].options[0].provider='Another provider';variants[5].requirements[0].options[0].eligibilityReview.provider='Another provider';
  variants[6].requirements[0].options[0].eligibilityReview.reviewId='another-policy-review';variants[7].requirements[0].options[0].eligibilityReview.scope='A distinct explicit program exception.';variants[8].requirements[0].options[0].eligibilityReview.checkedOn='2026-11-24';
  const report=await f.build([a,...variants]);assert.equal(report.tasks.length,10);assert(report.tasks.every(task=>task.kind==='provider-policy'&&task.contexts.length===1));
  const changed=f.pending('changed-body');changed.sources[1]=await f.source('Synthetic University: a newly captured policy body has different restrictions.');
  const versions=await f.build([a,changed]);assert.equal(versions.tasks.length,2);assert.notEqual(versions.tasks[0].policyEvidence[0].hash,versions.tasks[1].policyEvidence[0].hash,'Different retained policy bodies do not share a research decision');
 }finally{await f.cleanup();}
});
test('unverified, missing, changed and mismatched policy captures never acquire shared scope',async()=>{
 const changes=[
  ['unknown hash',(models)=>{for(const row of models)delete row.sources[1].sourceContentHash;}],
  ['declared stale hash',(models)=>{for(const row of models)row.sources[1].sourceContentHash='sha256:'+'b'.repeat(64);}],
  ['provider source',(models)=>{for(const row of models)row.sources[1].kind='provider';}],
  ['noncapture path',(models)=>{for(const row of models)row.sources[1].capture='private-not-a-public-capture.txt';}],
  ['changed text',async(models,f)=>writeFile(join(f.base,models[0].sources[1].capture),'Modified text without the retained hash.')],
  ['wrong metadata hash',async(models,f)=>{const path=join(f.base,models[0].sources[1].capture.replace(/\.txt$/,'.json'));await writeFile(path,JSON.stringify({url:models[0].sources[1].url,sha256:'c'.repeat(64),status:200,fetchedAt:'2026-11-25T10:00:00Z'}));}],
  ['wrong source URL',(models)=>{for(const row of models)row.sources[1].url='https://synthetic.invalid/unrelated-policy';}]
 ];
 for(const[label,mutate]of changes){const f=await policyFixture();try{
  const models=[f.pending('a'),f.pending('b')];await mutate(models,f);const report=await f.build(models);assert.equal(report.tasks.length,2,label);assert(report.tasks.every(task=>task.kind==='program-review'&&task.contexts.length===1),label);
 }finally{await f.cleanup();}}
 const f=await policyFixture();try{const models=[f.pending('a'),f.pending('b')];const report=buildExpansionQueue({models,quality:quality(models.map(row=>f.finding(row.id)))});assert.equal(report.tasks.length,2,'Declared hashes alone do not replace actual capture verification');}finally{await f.cleanup();}
});
test('unrecognized and course-specific reviews remain separate and cannot leak student fields',async()=>{
 const mutations=[review=>review.status='unrecognized-status',review=>review.individualApproval=true,review=>review.fullyApproved=true,review=>review.providerReviewPending=false,review=>review.enrollmentPermission='individual-enrollment-approved',review=>review.courseVersion='4',review=>review.recommendationPeriodStatus='version-period-link-still-to-review',review=>review.studentEmail='PRIVATE-STUDENT@example.invalid'];
 const f=await policyFixture();try{for(const mutate of mutations){const models=[f.pending('a'),f.pending('b')];for(const row of models)mutate(row.requirements[0].options[0].eligibilityReview);const report=await f.build(models);assert.equal(report.tasks.length,2);assert(report.tasks.every(task=>task.kind==='program-review'));assert(!JSON.stringify(report).includes('PRIVATE-STUDENT'));}}
 finally{await f.cleanup();}
});
test('unknown catalog or delivery scope never becomes a shared provider decision',async()=>{
 const f=await policyFixture();try{for(const field of ['school','catalog','level','format','creditSystem']){const models=[f.pending('a',{[field]:null}),f.pending('b',{[field]:null})];const report=await f.build(models);assert.equal(report.tasks.length,2,field);assert(report.tasks.every(task=>task.kind==='program-review'),field);}}
 finally{await f.cleanup();}
});
