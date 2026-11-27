import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {cliCourseReview,validateCLICourseReview,validateCLICaptures,applyCLICourseCatalog} from './cli-course-catalog.mjs';
const root=resolve(import.meta.dirname,'..'),copy=structuredClone,require=createRequire(import.meta.url),Library=require('../dist/course-library-engine.js');
const catalog=JSON.parse(await readFile(resolve(root,'dist/data/course-catalog.json'),'utf8')),provider='Christian Leaders Institute';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('fourteen original CLI offerings retain native receipt integrity and independent semester-unit evidence',async()=>{
 await validateCLICaptures();assert.equal(cliCourseReview.courses.length,14);
 const original=copy(catalog),result=applyCLICourseCatalog(original),reviewed=result.courses.filter(row=>row.identityReviewId===cliCourseReview.id);
 assert.equal(reviewed.length,14);assert.deepEqual(original,catalog);assert.equal(result.checkedAt,catalog.checkedAt);
 assert.deepEqual(result.courses.filter(row=>row.provider!==provider),catalog.courses.filter(row=>row.provider!==provider));
 assert.deepEqual(applyCLICourseCatalog(result),result,'Replaying the same source review is deterministic.');
 for(const proof of cliCourseReview.courses){const row=reviewed.find(row=>row.identityId===proof.identityId);assert.equal(row.credits,proof.sourceCredits);assert.equal(row.sourceCredits,proof.sourceCredits);assert.equal(row.creditSystem,'semester');assert.equal(row.recommendationStatus,'not-applicable-institutional');assert.equal(row.academicCreditRouteRequired,true);assert.equal(row.eligibilityStatus,'unresolved');assert.equal(row.schoolAcceptance,'not-established-by-course-listing');assert.equal(row.sourceUpper,null);}
});
test('existing catalog IDs and all receiving associations survive while new identities use stable exact-code IDs',()=>{
 const input=copy(catalog),the=input.courses.find(row=>row.provider===provider&&row.code==='THE 101');
 the.mappedCourseIds=['liberty-existing-plan:theo-104'];the.mappingStatus='plan-course-identity';the.receivingCode='THEO 104';the.receivingCredits=4;the.mappingEvidence={evidence:'conditional',source:'existing-school-review'};the.schoolAcceptance='existing-receiving-claim-retained';
 const result=applyCLICourseCatalog(input),row=result.courses.find(row=>row.id===the.id);
 for(const field of ['id','mappedCourseIds','mappingStatus','receivingCode','receivingCredits','mappingEvidence','planIdentitySourceIds','schoolAcceptance'])assert.deepEqual(row[field],the[field]);
 assert.equal(row.credits,3);assert.equal(row.receivingCredits,4);
 const isolated=applyCLICourseCatalog({courses:[],sources:[],checkedAt:'2026-11-01'});
 assert.equal(isolated.courses.length,14);for(const item of isolated.courses){assert.match(item.id,/^christianleadersinstitute-plan-(?:bib|min|the)\d{3}$/);assert.deepEqual(item.mappedCourseIds,[]);assert.equal(item.mappingStatus,'source-listing');}
 assert.deepEqual(applyCLICourseCatalog(result),result);
});
test('saving THE101 uses its original three credits and creates no earned record or receiving award',()=>{
 const row=applyCLICourseCatalog(catalog).courses.find(row=>row.provider===provider&&row.code==='THE 101'),state=Library.initialize(null),saved=Library.saveCourse(state,row),record=saved.learning[0];
 assert.equal(state.learning.length,0);assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.equal(record.code,'THE 101');assert.equal(record.status,'saved');assert.deepEqual(record.evaluations,[]);assert.equal(record.completedOn,'');assert.equal(record.recommendationStatus,'not-applicable-institutional');
 assert.equal(Library.saveCourse(saved,row).learning.length,1);assert.equal(record.receivingCode,undefined);
});
test('unestablished prerequisites remain null while reviewed prerequisites retain their status and evidence',()=>{
 const rows=applyCLICourseCatalog(catalog).courses;
 for(const proof of cliCourseReview.courses){const row=rows.find(row=>row.identityId===proof.identityId);assert.deepEqual(row.prerequisites,proof.prerequisites);assert.equal(row.prerequisiteStatus,proof.prerequisiteStatus);}
 assert.equal(rows.find(row=>row.identityId===cliCourseReview.courses[0].identityId).prerequisites,null);
 const changed=copy(cliCourseReview);changed.courses[0].prerequisites=[];assert.throws(()=>validateCLICourseReview(changed),/Unknown prerequisites/);
});
test('matching uses provider plus exact normalized code and never infers identity from titles or URLs',()=>{
 const proof=cliCourseReview.courses[0],input={courses:[{id:'same-title',provider,title:proof.title,code:'BIB 999',mappingCode:'BIB 999',credits:null,url:proof.courseUrl},{id:'other-provider',provider:'Other Provider',title:proof.title,code:proof.code,credits:3},{id:'existing-normalized',provider,title:'Old label',code:'bib-111',mappingCode:'BIB111',credits:null,mappedCourseIds:[],mappingStatus:'plan-course-identity'}],sources:[]},result=applyCLICourseCatalog(input);
 assert.deepEqual(result.courses.find(row=>row.id==='same-title'),input.courses[0]);assert.deepEqual(result.courses.find(row=>row.id==='other-provider'),input.courses[1]);assert.equal(result.courses.find(row=>row.id==='existing-normalized').credits,3);assert.equal(result.courses.filter(row=>row.provider===provider&&['BIB 111','bib-111'].includes(row.code)).length,1);
});
test('duplicates, conflicting original quantities, units, codes and source identities fail closed',()=>{
 const enriched=applyCLICourseCatalog(catalog),first=enriched.courses.find(row=>row.identityReviewId===cliCourseReview.id);
 for(const patch of [{credits:4},{sourceCredits:4},{creditSystem:'quarter'},{sourceCreditSystem:'quarter'},{mappingCode:'THE 999'},{aceId:'INVENTED-0001'},{recommendationEnd:'2027-01-01'}]){const changed=copy(enriched);Object.assign(changed.courses.find(row=>row.id===first.id),patch);assert.throws(()=>applyCLICourseCatalog(changed));}
 const duplicate=copy(enriched);duplicate.courses.push({...copy(first),id:'same-code-second-id'});assert.throws(()=>applyCLICourseCatalog(duplicate),/exact CLI source code/);
 const wrongSource=copy(enriched);wrongSource.sources.find(source=>source.id===cliCourseReview.sources[0].id).url='https://other.example/';assert.throws(()=>applyCLICourseCatalog(wrongSource),/Conflicting provider source/);
 const wrongId={courses:[{id:'christianleadersinstitute-plan-bib111',provider:'Other Provider',code:'OTHER 101'}],sources:[]};assert.throws(()=>applyCLICourseCatalog(wrongId),/stable CLI source ID/);
});
test('unverified units, provider authority, source identities and eligibility or ACE promotions are rejected',()=>{
 for(const change of [r=>r.eligibility.status='eligible',r=>r.freeCdsStudyAwardsAcademicCredit=true,r=>r.courses[0].sourceCredits=4,r=>r.courses[0].sourceCreditSystem='quarter',r=>r.courses[0].sourceUpper=true,r=>r.courses[0].identitySourceIds=['liberty-credit-shortage-policy-live'],r=>r.courses[0].unitProofSourceIds=['cli-theology-course-offerings-live'],r=>r.courses[0].courseUrl='https://degrees.christianleaders.org.attacker.example/biblical-courses/',r=>r.courses[0].aceId='FAKE-0001',r=>r.courses[0].recommendationEnd='2027-01-01',r=>r.courses[0].receivingCode='THEO 104',r=>r.courses[0].eligibleToStart=true,r=>r.courses[0].academicCreditRouteRequired=false,r=>r.courses[0].schoolAcceptance='accepted',r=>{r.courses.push(copy(r.courses[0]));r.courseCount++;},r=>r.eligibility.sourceIds=['missing-source']]){const changed=copy(cliCourseReview);change(changed);assert.throws(()=>validateCLICourseReview(changed));}
});
async function receiptFixture(t){
 const base=await mkdtemp(resolve(tmpdir(),'cli-native-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const review=copy(cliCourseReview),course=copy(review.courses[0]);review.courses=[course];review.courseCount=1;delete review.retainedPacketReferences;
 const ids=[...course.identitySourceIds,...course.unitProofSourceIds,'cli-academic-route-live'];review.sources=review.sources.filter(source=>ids.includes(source.id));review.eligibility={status:'unresolved',academicTranscriptRequired:true,personalAdmissionGuaranteed:false,sourceIds:['cli-academic-route-live']};
 const receiptPath='content/research-batches/cli-fixture/native.json',body=JSON.stringify({kind:'native-result',result:{body:[...review.sources.flatMap(source=>[source.url,source.shortQuote]),course.sourceQuote,course.unitProofQuote].join('\n')}})+'\n';
 for(const source of review.sources){source.nativeReceiptPath=receiptPath;source.nativeReceiptSha256=sha(body);}
 const manifest={kind:'shared-transfer-evidence-retention-manifest',version:1,files:[{path:receiptPath,sha256:sha(body),bytes:Buffer.byteLength(body),kind:'connector-parsed-native-result',originHttpCapture:false}]},manifestPath='content/research-batches/cli-fixture/manifest.json',manifestBytes=JSON.stringify(manifest)+'\n';
 review.manifestPath=manifestPath;review.manifestSha256=sha(manifestBytes);review.retention={manifestPath,manifestSha256:review.manifestSha256,originHttpCaptureClaimed:false};
 for(const [path,bytes]of [[receiptPath,body],[manifestPath,manifestBytes]]){await mkdir(dirname(resolve(base,path)),{recursive:true});await writeFile(resolve(base,path),bytes);}
 return{review,base,receiptPath};
}
test('capture validation checks exact retained bytes and requires identity and unit quotes in their cited receipts',async t=>{
 const f=await receiptFixture(t);await validateCLICaptures(f.review,{base:f.base});
 const badQuote=copy(f.review);badQuote.courses[0].title='Invented title';badQuote.courses[0].sourceQuote=badQuote.courses[0].sourceQuote.replace('Old Testament Survey','Invented title');await assert.rejects(validateCLICaptures(badQuote,{base:f.base}),/course quote is absent/);
 const badUnit=copy(f.review);badUnit.courses[0].unitProofQuote='An invented semester credit hour value';await assert.rejects(validateCLICaptures(badUnit,{base:f.base}),/unit proof is absent/);
 const badReceipt=copy(f.review);badReceipt.sources[0].nativeReceiptSha256='0'.repeat(64);await assert.rejects(validateCLICaptures(badReceipt,{base:f.base}),/source receipt/);
 await writeFile(resolve(f.base,f.receiptPath),'{}\n');await assert.rejects(validateCLICaptures(f.review,{base:f.base}),/receipt byte count changed/);
 const wrongManifest=copy(f.review);wrongManifest.manifestSha256='0'.repeat(64);wrongManifest.retention.manifestSha256=wrongManifest.manifestSha256;await assert.rejects(validateCLICaptures(wrongManifest,{base:f.base}),/manifest bytes changed/);
});
