import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildUMPITransferEvidence,packetPath} from './scripts/umpi-transfer-evidence.mjs';

test('UMPI current-linked CLEP evidence retains exact primary receiving awards without publishing degree placements',async()=>{
 const packet=await buildUMPITransferEvidence();
 assert.deepEqual(packet,JSON.parse(await readFile(new URL(packetPath,import.meta.url),'utf8')));
 assert.equal(packet.publicationAllowed,false);assert.equal(packet.degreePlansCreated,0);assert.equal(packet.automaticApprovals,0);
 assert.equal(packet.receivingAwards.length,19);assert.equal(new Set(packet.receivingAwards.map(row=>row.sourceCourseCode)).size,19);
 for(const row of packet.receivingAwards){assert.equal(row.catalog,null);assert.deepEqual(row.programs,[]);assert.deepEqual(row.degreePlacements,[]);assert.equal(row.individualApproval,false);assert.equal(row.originalSourceCredits,null);assert.equal(row.originalSourceCreditSystem,null);assert(row.universityPublishedAward);}
 for(const source of packet.sources){const bytes=await readFile(new URL(source.capture,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);assert(source.checkedOn<=packet.checkedOn);assert.equal(source.reviewedOn,'2026-11-26');}
 const awards=new Map(packet.receivingAwards.map(row=>[row.sourceCourseCode,row]));
 assert.deepEqual(awards.get('CLEP-0039').receivingCourseCodes,['BUS 150']);assert.equal(awards.get('CLEP-0039').receivingCredits,3);
 assert.deepEqual(awards.get('CLEP-0025').receivingCourseCodes,['BUS 350']);assert.equal(awards.get('CLEP-0025').minScore,50);
 assert.deepEqual(awards.get('CLEP-0029').receivingCourseCodes,['BUS 330']);
});

test('unequal original/receiving quantities and duplicate or combined awards remain separate research constraints',async()=>{
 const packet=await buildUMPITransferEvidence(),awards=new Map(packet.receivingAwards.map(row=>[row.sourceCourseCode,row]));
 const collegeMath=awards.get('CLEP-0004');assert.equal(collegeMath.receivingCredits,6);assert.equal(collegeMath.originalSourceCredits,null);
 const original=await readFile(new URL('content/source-captures/00060187b2939864.txt',import.meta.url),'utf8');
 assert.match(original,/ACE ID: CLEP-0004\n05\/01\/2023 to 04\/30\/2029\nRecommended credits: 3/,'The current original recommendation differs from the university table; six cannot be copied into source quantity');
 const macro=awards.get('CLEP-0027'),micro=awards.get('CLEP-0030');
 assert.deepEqual(macro.receivingCourseCodes,['ECO 207']);assert.deepEqual(micro.receivingCourseCodes,['ECO 207']);assert.equal(macro.sameReceivingCourseGroup,micro.sameReceivingCourseGroup);
 assert(macro.duplicateCreditNote&&micro.duplicateCreditNote);assert.equal(macro.receivingCredits,3);assert.equal(micro.receivingCredits,3);
 const comp=awards.get('CLEP-0040');assert.equal(comp.receivingCredits,6);assert.deepEqual(comp.receivingCourseCodes,['ENG 101','ENG 121']);assert(!Object.hasOwn(comp,'perCourseCredits'));assert(comp.allocationNote.includes('no per-course split'));
});

test('specific teacher restrictions and the CPL classification question survive the review',async()=>{
 const packet=await buildUMPITransferEvidence(),restriction=packet.restrictions.find(row=>row.id==='education-certification-clep-section-a');
 assert.equal(restriction.maximumCredits,6);assert.equal(restriction.minimumScore,60);assert.match(restriction.scope,/teacher certification/);
 const cpl=packet.policyFacts.find(row=>row.id==='published-general-bachelor-cpl-cap');assert.equal(cpl.value,30);assert.equal(cpl.applicationResolved,false);
 assert.match(cpl.scope,/YourPace.*unresolved/);assert(!packet.policyFacts.some(row=>row.id==='alternativeMaxCredits'||row.value===90),'Overall residency arithmetic must not become an ACE-specific ceiling');
});
