import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIndependentProviderIdentitySource} from './pathway-quality.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const copy=value=>JSON.parse(JSON.stringify(value)),asOf='2026-11-20';
const packets=[read('content/reuse/liberty-undergraduate-awards.json'),read('content/reuse/wgu-provider-identities.json'),read('content/reuse/wgu-straighterline-provider-identities.json'),read('content/reuse/wgu-saylor-provider-identities.json')];

test('current independently reviewed publisher and ACE sources for all four providers remain eligible across receiving universities',()=>{
 const counts=new Map();
 for(const packet of packets){
  const sources=new Map(packet.sources.map(source=>[source.id,source]));
  for(const course of packet.courses||packet.providerCourses||[]){
   for(const id of course.identitySourceIds){
    const source=sources.get(id);assert(source,id);
    assert.equal(isIndependentProviderIdentitySource(source,course,{asOf}),true,course.provider+' '+course.code+' '+id+' '+source.url);
    counts.set(course.provider,(counts.get(course.provider)||0)+1);
   }
  }
 }
 assert.deepEqual([...counts.keys()].toSorted(),['Saylor','Sophia','StraighterLine','Study.com']);assert([...counts.values()].every(count=>count>0));
});

test('only actual ACE organization and course exhibits qualify, with every declared provider and course binding enforced',()=>{
 const packet=packets[2],course=packet.courses[0],source=packet.sources.find(source=>source.kind==='ace'&&source.courseCodes.includes(course.code));assert(source);
 for(const change of [s=>s.url=s.url.replace('www.acenet.edu','www.acenet.edu.attacker.example'),s=>s.url=s.url.replace('80099b28-9016-e811-810f-5065f38bf0e1','76099b28-9016-e811-810f-5065f38bf0e1'),s=>s.url=s.url.replace('org=StraighterLine','org=Sophia'),s=>s.url='https://www.acenet.edu/National-Guide/Pages/Organization.aspx?oid=80099b28-9016-e811-810f-5065f38bf0e1',s=>s.kind='university',s=>s.roles=['receiving-map'],s=>s.provider='Study.com',s=>s.courseCodes=['OOSL-9999'],s=>s.aceId='OOSL-9999',s=>s.reviewedFacts={providerCourseCode:'OTHER999'},s=>s.observed={aceId:course.code,offered:false},s=>s.reviewedFacts={sourceCredits:99},s=>s.checked='2026-10-01']){
  const changed=copy(source);change(changed);assert.equal(isIndependentProviderIdentitySource(changed,course,{asOf}),false,JSON.stringify(changed));
 }
 const wrongProvider=copy(course);wrongProvider.provider='Sophia';assert.equal(isIndependentProviderIdentitySource(source,wrongProvider,{asOf}),false);
});

test('mismatched provider sites, university mappings and unrelated accreditors cannot stand in for original identities',()=>{
 const packet=packets[3],course=packet.courses[0],source=packet.sources[0];assert.equal(isIndependentProviderIdentitySource(source,course,{asOf}),true);
 for(const url of ['https://www.wgu.edu/transfer-table','https://marketing-api-gateway.wgu.edu/partner/v1/public/partner-agreement/668','https://www.study.com/course/saylor-identity','https://support.saylor.org.attacker.example/courses','https://unrelated-accreditor.example/current-course']){
  const changed={...source,url,kind:url.includes('accreditor')?'accreditor':'provider'};assert.equal(isIndependentProviderIdentitySource(changed,course,{asOf}),false,url);
 }
 const changed={...source,observed:{provider:'Study.com',aceId:course.code}};assert.equal(isIndependentProviderIdentitySource(changed,course,{asOf}),false);
});

test('official Credly organization recommendation pages require explicit issuer and course binding, never a learner badge or another provider',()=>{
 const course=copy(packets[0].providerCourses.find(course=>course.provider==='Sophia'));
 const source={id:'synthetic-official-credly-organization-recommendation',kind:'accreditor',provider:'Sophia',roles:['provider-identity'],courseCodes:[course.code],url:'https://www.credly.com/org/sophia-learning-llc/badge/reviewed-course',checked:asOf};
 assert.equal(isIndependentProviderIdentitySource(source,course,{asOf}),true);
 for(const change of [s=>s.provider='Study.com',s=>s.courseCodes=['SDCM-0001'],s=>s.url='https://www.credly.com/badges/learner-award-id',s=>s.url='https://www.credly.com/org/study-com/badge/other-provider',s=>s.url='https://www.credly.com/org/unrelated-publisher/badge/course',s=>s.url='https://www.credly.com.attacker.example/org/sophia-learning-llc/badge/course',s=>delete s.provider,s=>delete s.courseCodes,s=>s.roles=['student-review']]){const changed=copy(source);change(changed);assert.equal(isIndependentProviderIdentitySource(changed,course,{asOf}),false);}
});
