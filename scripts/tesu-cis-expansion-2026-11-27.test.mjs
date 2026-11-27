import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {root} from './pathway-factory/lib.mjs';
import {buildCISExpansionProposal,assertCISRetainedSource} from './tesu-cis-expansion-2026-11-27.mjs';

test('current CIS degree has a balanced named baseline and correct mixed-level area',async()=>{
 const {program}=await buildCISExpansionProposal();
 assert.equal(program.title,'B.S. in Computer Information Systems');
 assert.equal(program.requirements.length,40);
 assert.equal(program.requirements.reduce((n,r)=>n+r.credits,0),120);
 const area=program.requirements.filter(r=>r.group==='area-of-study');
 assert.equal(area.reduce((n,r)=>n+r.credits,0),18);
 assert.deepEqual(area.filter(r=>r.upper).map(r=>r.code),['CIS-3200','CIS-3110','CIS-3010','CIS-3510']);
 assert.deepEqual(area.filter(r=>!r.upper).map(r=>r.code),['COS-1160','COS-2410']);
 assert.equal(new Set(program.requirements.map(r=>r.optionRows[0].inline.code)).size,40);
 assert(program.requirements.every(row=>row.optionRows.every(option=>option.inline?.provider==='University')),'Authoring a degree does not approve an outside award');
});

test('formal alternate prerequisite uses already-required C programming; C++ is not invented',async()=>{
 const {program}=await buildCISExpansionProposal(),software=program.requirements.find(r=>r.code==='CIS-3510'),data=program.requirements.find(r=>r.code==='COS-2410');
 assert.deepEqual(software.prerequisites,['cos1160']);
 assert.deepEqual(software.originalPrerequisiteCodes,['COS-1160 or COS-2130']);
 assert(program.requirements.some(r=>r.id==='cos1160'));
 assert.equal(data.prerequisites,undefined);
 assert(data.advisoryNote.includes('C++'));
 assert(data.advisoryNote.includes('not established merely by selecting C Programming'));
 assert(!program.requirements.some(r=>r.code==='COS-1110'),'The Java course is not asserted to fulfill C++ preparation');
});

test('actual tool receipt binds complete exact primary degree and course bodies',async()=>{
 const packet=JSON.parse(await readFile(root+'/content/pathway-kits/tesu/business-cis-expansion-review-2026-11-27.json','utf8'));
 for(const source of [packet.degree.source,...packet.courses.map(c=>c.source)]){
  const body=await assertCISRetainedSource(source);
  assert(body.length>100);
  await assert.rejects(assertCISRetainedSource({...source,sha256:'0'.repeat(64)}));
 }
});

test('CIS review preserves scoped policies and the original source review dates',async()=>{
 const {program,sources,manifestEntry}=await buildCISExpansionProposal();
 assert.equal(program.review.reviewedOn,'2026-11-27');
 assert.equal(program.modelFields.catalogIdentity.checkedOn,'2026-11-27');
 assert.equal(program.modelFields.tuitionComparison.pricingSourceCheckedOn,'2026-11-25');
 assert.equal(sources.find(s=>s.id==='tesu-business-course-cis-3010-20261126').checked,'2026-11-26');
 assert.equal(program.modelFields.policyEvidence.alternativeMaxCredits.value,90);
 assert.equal(program.modelFields.policyEvidence.institutionMinCredits.value,15);
 assert.deepEqual(manifestEntry.curriculum.majorRequirements.filter(r=>r.upper).map(r=>r.code),['CIS-3200','CIS-3110','CIS-3010','CIS-3510']);
 assert.equal(manifestEntry.publicationAuthority,'existing-academic-gates');
});
