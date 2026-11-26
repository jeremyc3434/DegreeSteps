import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTESUBusinessBlocks,assertTESUBusinessBlockEvidence,reviewedTESUBusinessSource} from './scripts/tesu-business-blocks.mjs';

const source={id:'tesu-bsba-marketing-current-2026-11-26',kind:'university',title:'Current TESU Marketing curriculum',url:'https://tesu.smartcatalogiq.com/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bsba-in-marketing/',checked:'2026-11-26',capture:'content/source-captures/60df9ea927fc193a.txt'};
const degree=await reviewedTESUBusinessSource(source);

test('shared business blocks independently ground the exact new degree instead of copying an outcome',async()=>{
 const {requirements,modelFields}=await createTESUBusinessBlocks({slug:'bsba-marketing',title:'B.S.B.A. in Marketing',degreeSource:degree.source,degreeBody:degree.body});
 assert.equal(requirements.length,34);assert.equal(requirements.reduce((n,r)=>n+r.credits,0),102);
 assert.equal(requirements.filter(r=>r.category==='general').length,15);
 assert.equal(requirements.filter(r=>r.group==='business-core').length,14);
 assert.equal(requirements.filter(r=>r.freeElective).length,5);
 assert.ok(requirements.every(r=>r.optionRows.every(entry=>entry.inline?.provider==='University')),'No old receiving placement or conditional course is copied');
 assert.ok(requirements.filter(r=>!r.freeElective).every(r=>r.sourceIds.includes(source.id)));
 assert.equal(modelFields.catalogIdentity.checkedOn,'2026-11-26');assert.equal(modelFields.catalogIdentity.sourceSha256,degree.source.sha256);
 assert.deepEqual(modelFields.upperGroupMinimums,[{group:'area-of-study',credits:12},{group:'business-core',credits:3},{groups:['area-of-study','business-core'],credits:18}],'Free upper credits cannot replace the additional business/area upper course');
 assert.equal(modelFields.existingCreditReview.groups[0].requirementIds.length,0,'A new area must be explicitly authored');
 assert.ok(!JSON.stringify(modelFields).includes('CPA'));
});

test('changed degree quantities, course identities and upper-area rules cannot reuse a business block',async()=>{
 const {requirements}=await createTESUBusinessBlocks({slug:'bsba-marketing',title:'B.S.B.A. in Marketing',degreeSource:degree.source,degreeBody:degree.body});
 for(const [before,after]of [['Professional Business Requirements (42 Credits)','Professional Business Requirements (39 Credits)'],['Total Credit Hours: 120','Total Credit Hours: 117'],['College Algebra\n3','College Algebra\n4'],['Complete 12 upper-level credits','Complete 9 upper-level credits'],['one additional 3 credit course','one additional 0 credit course'],['minimum of 18 credits at the upper level','minimum of 15 credits at the upper level']]){
  assert.ok(degree.body.includes(before),before+' is an actual captured fact');assert.throws(()=>assertTESUBusinessBlockEvidence(degree.body.replace(before,after),requirements));
 }
 const changed=structuredClone(requirements);changed.find(r=>r.code==='ACC-1010').credits=6;
 assert.throws(()=>assertTESUBusinessBlockEvidence(degree.body,changed));
 assert.doesNotThrow(()=>assertTESUBusinessBlockEvidence(degree.body.replace('Capstone, and','Capstone and'),requirements),'Only a literal punctuation variant is equivalent');
});

test('a source cannot masquerade as another degree URL or predate the actual captured body',async()=>{
 await assert.rejects(reviewedTESUBusinessSource({...source,url:source.url+'unrelated'}),/exact primary URL/);
 await assert.rejects(reviewedTESUBusinessSource({...source,checked:'2026-11-24'}),/honest retrieval/);
});

test('native primary body and sidecar cannot be jointly changed independently of the pinned raw tool receipt',async()=>{
 const packet=JSON.parse(await readFile('content/pathway-kits/tesu/business-course-sources-2026-11-26.json','utf8')),original=packet.courses.find(course=>course.code==='MKT-4410').source;
 const {body}=await reviewedTESUBusinessSource(original);
 await assert.rejects(reviewedTESUBusinessSource({...original,sha256:'0'.repeat(64)}),/independently pinned/);
 await assert.rejects(reviewedTESUBusinessSource({...original,toolResponseReceipt:{...original.toolResponseReceipt,sha256:'0'.repeat(64)}}),/raw receipt hash/);
 const dir=await mkdtemp(join(tmpdir(),'tesu-native-source-proof-'));
 try{
  const changedBody=body.replace('MAR-3060','MKT-3060'),changedHash=createHash('sha256').update(changedBody).digest('hex');assert.notEqual(changedBody,body);
  const meta=JSON.parse(await readFile(original.capture.replace(/\.txt$/,'.json'),'utf8')),capture=join(dir,changedHash.slice(0,16)+'.txt');
  await writeFile(capture,changedBody);await writeFile(capture.replace(/\.txt$/,'.json'),JSON.stringify({...meta,sha256:changedHash}));
  await assert.rejects(reviewedTESUBusinessSource({...original,capture,sha256:changedHash,sourceContentHash:changedHash}),/exactly reconstruct/,'Body and sidecar integrity alone cannot rewrite a formal prerequisite');
  await writeFile(capture,body);await writeFile(capture.replace(/\.txt$/,'.json'),JSON.stringify({...meta,status:200}));
  await assert.rejects(reviewedTESUBusinessSource({...original,capture}),/explicit native rendered extraction/,'Native transport cannot be relabeled as an HTTP200 origin body');
 }finally{await rm(dir,{recursive:true,force:true});}
});
