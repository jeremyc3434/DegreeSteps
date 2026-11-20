import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSophiaIdentityBundle,inputPaths} from './build-wgu-sophia-identities.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const inputs=Object.fromEntries(Object.entries(inputPaths).map(([key,path])=>[key,read(path)]));
const clone=value=>JSON.parse(JSON.stringify(value));

test('independent Sophia cache joins reviewed provider facts across schools without importing any receiving award',()=>{
 const original=JSON.stringify(inputs),bundle=buildSophiaIdentityBundle(inputs);
 assert.equal(bundle.courses.length,18);assert.equal(bundle.provider,'Sophia');assert.equal(bundle.studentCreditsAwarded,0);assert.equal(bundle.publicationDecisionsMade,0);
 assert.deepEqual(bundle,read('content/reuse/wgu-sophia-provider-identities.json'));
 const ids=new Set(bundle.sources.map(source=>source.id));assert.equal(ids.size,bundle.sources.length);
 for(const c of bundle.courses){
  assert.equal(c.provider,'Sophia');assert.equal(c.sourceCreditStatus,'verified');assert.equal(c.sourceCreditSystem,'semester');assert(c.sourceCredits>0);assert(Number.isInteger(c.courseVersion));
  assert.equal(c.sourceCreditVerification.credits,c.sourceCredits);assert.deepEqual(c.sourceCreditVerification.sourceIds,c.identitySourceIds);assert(c.identitySourceIds.every(id=>ids.has(id)));assert(c.recommendationPeriodSourceIds.every(id=>ids.has(id)));
  assert(c.recommendationStart<='2026-11-20'&&c.recommendationEnd>='2026-11-20');
  for(const key of ['receivingCode','receivingTitle','mappingEvidence','universityMapRecord','credits','evidence','minScore'])assert.equal(Object.hasOwn(c,key),false,key);
 }
 assert.equal(JSON.stringify(inputs),original);assert.deepEqual(buildSophiaIdentityBundle(inputs),bundle);
});

test('source quantities and review windows remain exact when independent identities are reused',()=>{
 const b=buildSophiaIdentityBundle(inputs),get=code=>b.courses.find(c=>c.code===code);
 assert.equal(get('SOPH-0006').title,'Art History I');assert.equal(get('SOPH-0006').sourceCredits,3);assert.equal(get('SOPH-0029').sourceCredits,3);assert.equal(get('SOPH-0027').sourceCredits,3);
 assert.equal(get('SOPH-0021').sourceCredits,1);assert.equal(get('SOPH-0041').sourceCredits,1,'One-credit source courses may never inherit a three-credit university award');
 assert.equal(get('SOPH-0080').recommendationEnd,'2027-01-31');
 for(const source of b.sources)assert(source.id.startsWith('wgu-global-sophia--'));
});

test('unreviewed versions, expired windows, conflicting source quantities and university-only references cannot enter the identity cache',()=>{
 for(const mutate of [i=>i.liberty.courses[0].activeOffering=false,i=>i.liberty.courses[0].aceVersion=null,i=>i.liberty.courses[0].sourceCredits=4,i=>i.liberty.courses[0].recommendationEnd='2026-10-31',i=>i.liberty.courses[0].recommendationStart='2027-01-01',i=>i.liberty.courses[0].identitySourceIds=['unknown-source'],i=>i.liberty.sources.find(s=>s.id===i.liberty.courses[0].identitySourceIds[0]).url='https://www.liberty.edu/course-map/',i=>i.gcu.sourceIdentities[0].status='unreviewed']){
  const altered=clone(inputs);mutate(altered);assert.throws(()=>buildSophiaIdentityBundle(altered));
 }
});
