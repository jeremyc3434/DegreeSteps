import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildLibertySharedAwards,readLibertySharedAwardInputs,writeLibertySharedAwards} from './build-liberty-shared-awards.mjs';
const inputs=await readLibertySharedAwardInputs(),bundle=buildLibertySharedAwards(inputs),copy=value=>JSON.parse(JSON.stringify(value));
test('a single deterministic bundle joins independent provider identity to official receiving awards for eleven explicit program scopes',()=>{
 assert.equal(bundle.reviewStatus,'approved');assert.equal(bundle.providerCourses.length,16);assert.equal(bundle.awards.length,32);assert.equal(bundle.scopeReview.programIds.length,11);assert.equal(bundle.placementRules.length,4);assert.deepEqual(buildLibertySharedAwards(inputs),bundle);
 const courses=new Map(bundle.providerCourses.map(course=>[course.id,course])),sources=new Map(bundle.sources.map(source=>[source.id,source]));
 for(const award of bundle.awards){const course=courses.get(award.providerCourseId);assert(course);assert(award.sourceIds.every(id=>sources.get(id).kind==='university'&&sources.get(id).roles.includes('receiving-map')));assert(course.identitySourceIds.every(id=>sources.get(id).roles.includes('provider-identity')&&!award.sourceIds.includes(id)));assert.equal(award.scope.school,'Liberty University');assert.equal(award.scope.catalog,'2026-2027');assert.equal(award.scope.modality,'online');assert(award.scope.programIds.every(id=>bundle.scopeReview.programIds.includes(id)));assert.equal(award.creditSystem,'semester');assert.equal(course.sourceCreditSystem,'semester');assert.equal(award.credits,course.sourceCredits);assert.equal(award.scope.allPrograms,undefined);}
 assert.equal(bundle.publicationAllowed,false);assert.equal(bundle.personalAwardsCreated,0);assert.equal(bundle.runtimeAiCalls,0);
});
test('current source dates and captured hashes survive aliases, and no receiving guide becomes independent provider proof',()=>{
 for(const source of bundle.sources){assert.match(source.sourceContentHash,/^sha256:[a-f0-9]{64}$/);assert(source.originalSourceId);assert(['2026-11-18','2026-11-20'].includes(source.checked||source.checkedOn));assert.equal(source.id.startsWith('liberty-shared-source-'),true);if(source.roles.includes('provider-identity'))assert(['ace','provider'].includes(source.kind));}
 const rawIDs=new Set([...inputs.identities.sources,...inputs.health.sources,...inputs.extraIdentities.sources,...inputs.guide.sources,inputs.policy.source].map(source=>source.id));for(const source of bundle.sources)assert(rawIDs.has(source.originalSourceId));
});
test('upper-level Study.com awards keep exact source windows while one-credit Sophia courses remain one-credit awards',()=>{
 const course=bundle.providerCourses.find(course=>course.code==='SDCM-0173');assert.equal(course.sourceCredits,3);assert.equal(course.sourceUpper,true);assert.equal(course.courseVersion,String(inputs.health.courses.find(course=>course.code==='SDCM-0173').aceVersion));assert(course.recommendationStart&&course.recommendationEnd);
 const one=bundle.providerCourses.find(course=>course.code==='SOPH-0021');assert.equal(one.sourceCredits,1);const awards=bundle.awards.filter(award=>award.providerCourseId===one.id);assert.equal(awards.length,2);assert(awards.every(award=>award.credits===1&&award.receivingCode==='SCOM 1XX'));
});
test('unknown versions, missing captured identity hashes and changed receiving quantities do not produce an approved bundle',()=>{
 for(const mutate of [data=>data.identities.courses[0].aceVersion=null,data=>data.identities.courses[0].activeOffering=false,data=>data.identities.courses[0].recommendationEnd='2020-01-01',data=>delete data.identities.sources.find(source=>source.id===data.identities.courses[0].identitySourceIds[0]).sha256,data=>data.guide.awards.find(award=>award.code==='SOPH-0016').credits=4,data=>data.policy.rawCapture.supportsResidencyFacts=false,data=>data.policy.rawSourceContentHash='sha256:'+'0'.repeat(64)]){const bad=copy(inputs);mutate(bad);assert.throws(()=>buildLibertySharedAwards(bad));}
});
test('the committed reusable artifact is reproducible and its source packets remain immutable',async()=>{
 const before=JSON.stringify(inputs);assert.deepEqual(await writeLibertySharedAwards({check:true}),{bundleId:bundle.id,providerCourses:16,awards:32,programs:11,placementRules:4,check:true});assert.equal(JSON.stringify(inputs),before);
 const saved=JSON.parse(await readFile(new URL('../content/reuse/liberty-undergraduate-awards.json',import.meta.url),'utf8'));assert.deepEqual(saved,bundle);
});

test('additional independent identities join all applicable official awards without per-program overrides',()=>{
 for(const [code,receivingCode] of [['SDCM-0170','INFO 320'],['SDCM-0169','BUSI 344']]){
  const course=bundle.providerCourses.find(course=>course.code===code);assert(course);assert.equal(course.courseVersion,'4');assert.equal(course.sourceCredits,3);assert.equal(course.sourceUpper,true);assert.equal(course.recommendationStart,'2024-05-01');assert.equal(course.recommendationEnd,'2027-05-31');assert.equal(course.providerCoursePassingPercent,70);
  const awards=bundle.awards.filter(award=>award.providerCourseId===course.id);assert.equal(awards.length,2);assert(awards.every(award=>award.receivingCode===receivingCode&&award.upper===true&&award.credits===3));assert.deepEqual(awards.map(a=>a.scope.level).sort(),['associate','bachelor']);
  assert(course.identitySourceIds.every(id=>bundle.sources.find(s=>s.id===id).kind==='ace'));assert.equal(course.providerOfferingObservation.supportsIdentityHash,false);
 }
 assert(!bundle.providerCourses.some(c=>c.code==='SDCM-0208'));assert(!bundle.awards.some(a=>a.receivingCode==='BUSI 323'));assert.match(bundle.inputFingerprints.extraIdentities,/^[a-f0-9]{64}$/);
});
test('the generic additional pool refuses duplicate identities, unknown units, expired windows and receiving-map identity proof',()=>{
 const mutations=[
  d=>d.extraIdentities.courses.push(copy(d.extraIdentities.courses[0])),
  d=>d.extraIdentities.courses[0].sourceCreditSystem='quarter',
  d=>d.extraIdentities.courses[0].sourceCredits=null,
  d=>d.extraIdentities.courses[0].courseVersion='',
  d=>d.extraIdentities.courses[0].activeOffering=false,
  d=>d.extraIdentities.courses[0].recommendationEnd='2024-04-30',
  d=>d.extraIdentities.courses[0].eligibilityReview.eligibleToStart=false,
  d=>d.extraIdentities.sources[0].kind='university',
  d=>d.extraIdentities.sources[0].roles=['receiving-map'],
  d=>d.extraIdentities.sources[0].courseCodes=['SDCM-9999'],
  d=>{delete d.extraIdentities.sources[0].sourceContentHash;delete d.extraIdentities.sources[0].sha256;},
  d=>d.extraIdentities.reviewStatus='unreviewed'
 ];for(const mutate of mutations){const bad=copy(inputs);mutate(bad);assert.throws(()=>buildLibertySharedAwards(bad));}
});
