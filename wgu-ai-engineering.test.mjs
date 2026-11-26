import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {loadAIEngineeringEvidence,validateAICatalog,PROGRAM,REVIEW_PATH,PAGE} from './scripts/wgu-ai-engineering.mjs';
import {buildPrograms} from './scripts/wgu-agreement-ledgers.mjs';
import {validateDataAnalyticsReview,REVIEW_PATH as BSDA_REVIEW} from './scripts/wgu-data-analytics.mjs';
const read=async path=>JSON.parse(await readFile(path,'utf8'));

test('AI Engineering has an independently cross-checked current 40-course ledger while its unresolved source conflict stays unpublished',async()=>{
  const {review,rows,courses,capstone,guideline,pricing}=await loadAIEngineeringEvidence();
  assert.equal(review.program.programId,244);assert.equal(review.program.catalog,'202607');
  assert.equal(rows.length,40);assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),121);
  assert.equal(capstone.courseCode,'E090');assert.equal(capstone.courseName,'Applied AI Engineering');assert.equal(Number(capstone.competencyUnits),3);
  assert(!courses.some(course=>/capstone/i.test(course.courseName)),'A title keyword search alone misses the explicit required capstone role');
  assert.equal(guideline.transferArea,'Additional Transfer');assert.equal(review.publicationAllowed,false);
  assert.deepEqual(pricing,{tuitionPerTerm:4200,resourceFeePerTerm:200,amount:4400,period:'6 months'});
  const school=await read('content/pathway-kits/wgu/school.json');
  assert(!school.programOrder.includes(PROGRAM.slug));assert(!school.routes.some(route=>route.id==='wgu-bs-ai-engineering-reviewed'));
  assert(!school.publish.documents.some(document=>document.programs?.includes(PROGRAM.slug)));
  await assert.rejects(()=>access('content/pathway-kits/wgu/programs/'+PROGRAM.slug+'.json'));
});

test('review rejects pending catalog substitution, fabricated nontransferability, missing role proof, and altered source identity',async()=>{
  const original=await read(REVIEW_PATH);
  for(const change of [
    value=>value.program.programId=270,
    value=>value.program.catalog='202702',
    value=>value.publicationAllowed=true,
    value=>value.identifiedCapstoneCourseCodes=[],
    value=>value.capstoneReview.receivingGuidelineTransferArea='Non-Transferable',
    value=>value.capstoneReview.quote='E090 - Applied AI Engineering - This is an invented capstone course.',
    value=>value.capstoneReview.competencyUnits=4,
    value=>value.captures.find(source=>source.role==='curriculum').sha256='0'.repeat(64),
    value=>value.captures.find(source=>source.provider==='Study.com').receivingCheckedOn='2026-11-26',
    value=>value.supportingCaptures.find(source=>source.role==='capstone-description').columns=1
  ]){
    const changed=structuredClone(original);change(changed);await assert.rejects(()=>loadAIEngineeringEvidence(changed));
  }
});

test('catalog cross-check preserves quantities without treating the API order as a standard-path sequence',async()=>{
  const evidence=await loadAIEngineeringEvidence(),body=evidence.support.get('catalog-ledger').body;
  assert.equal(evidence.rows[0].code,'E077');assert.notEqual(evidence.courses[0].courseCode,'E077');
  const changed=structuredClone(evidence.courses);changed.find(course=>course.courseCode==='E090').competencyUnits='4';
  assert.throws(()=>validateAICatalog(body,changed));
  assert.throws(()=>validateAICatalog(body.replace('BSAIE 202607 Total CUs: 121','BSAIE 202702 Total CUs: 121'),evidence.courses));
  await validateDataAnalyticsReview(await read(BSDA_REVIEW));
});

test('the authoring hook refuses to relabel the AI capstone as a university-only course contrary to its exact current guideline',async()=>{
  const {review}=await loadAIEngineeringEvidence(),proof=review.capstoneReview,source=review.supportingCaptures.find(source=>source.role==='capstone-description');
  const sourceId='wgu-ai-engineering-capstone-role-review-20261126',study=review.captures.find(source=>source.provider==='Study.com');
  const seed={modelId:'curriculum-wgu-bs-ai-engineering-reviewed',routeIds:['wgu-bs-ai-engineering-reviewed'],title:'AI Engineering – B.S.',modelFields:{pricing:{model:'subscription',amount:4400,period:'6 months',sourceIds:[sourceId]}},
    supplementalSources:[{id:sourceId,url:source.url,kind:'university',capture:source.capture,sha256:source.sha256,sourceContentHash:'sha256:'+source.sha256,scope:{programId:244,programCode:'BSAIE',catalogYear:'202607'}}],
    reviewedCapstoneCourses:[{code:proof.courseCode,title:proof.courseTitle,programId:244,programCode:'BSAIE',catalogTerm:'202607',sourceId,sourceSha256:source.sha256,quote:proof.quote}]};
  await assert.rejects(()=>buildPrograms({check:true,configs:[PROGRAM],review:{id:review.id,checkedOn:review.checkedOn,reviewer:'Source review; publication held'},seeds:{[PROGRAM.slug]:seed},captureReviews:Object.fromEntries(review.captures.map(source=>[source.url,source.sha256])),studyReview:{id:review.id+'-retained-receiving-map',checkedOn:'2026-11-25',provider:'Study.com',agreementId:study.agreementId,agreementRecordVersion:study.agreementRecordVersion,sourceSha256:study.sha256,scope:{programs:[{programId:244,programCode:'BSAIE',catalog:'202607'}]}}}),/A required capstone must remain a university-only course/);
});
