/** Source-bound AI Engineering research. This review deliberately publishes no plan. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateWguProgramReview} from './wgu-data-analytics.mjs';
import {root,isMain,normalizeText} from './pathway-factory/lib.mjs';

export const REVIEW_PATH='content/pathway-kits/wgu/reviews/ai-engineering-2026-11-26.json';
export const PROGRAM={slug:'ai-engineering-bs',code:'BSAIE',programId:244,catalog:'202607',college:'IT'};
export const PAGE='https://www.wgu.edu/online-it-degrees/ai-engineering.html';
export const CATALOG='https://www.wgu.edu/content/dam/wgu-65-assets/western-governors/documents/institutional-catalog/2026/WGU%20Institutional%20Catalog%20-%20November%202026.pdf';
const POLICY='https://cm.wgu.edu/t5/WGU-Student-Policy-Handbook/2-1-11-Residency-Requirements-and-Credentialing/ta-p/23797';
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const text=path=>readFile(resolve(root,path),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const compact=value=>normalizeText(value).replace(/[^a-z0-9]/g,'');

/** The independent printed ledger, including two titles wrapped after CU/term cells. */
export function validateAICatalog(body,courses){
  assert(body.includes('BSAIE 202607 Total CUs: 121'));
  const lines=body.split(/\r?\n/).map(line=>line.trim()),rows=[];
  for(let index=0;index<lines.length;index++){
    const match=lines[index].match(/^([A-Z]{2,5} \d{4}) ([A-Z]\d{3}) (.+?) (\d+) (\d+)$/);
    if(!match)continue;
    const [,ccn,code,initialTitle,cu,term]=match,course=courses.find(course=>course.courseCode===code);
    assert(course,'The printed ledger cannot add a course absent from the active API ledger');
    let title=initialTitle;
    for(let offset=1;compact(title)!==compact(course.courseName)&&offset<=2;offset++)title+=' '+lines[index+offset];
    assert.equal(compact(title),compact(course.courseName),'Printed title must identify the same exact course '+code);
    assert.equal(Number(cu),Number(course.competencyUnits));rows.push({code,title,credits:Number(cu),term:Number(term),ccn});
  }
  assert.equal(rows.length,40);assert.equal(new Set(rows.map(row=>row.code)).size,40);
  assert.deepEqual(rows.map(row=>row.code).sort(),courses.map(course=>course.courseCode).sort(),'The API and printed catalog contain the same exact course set; API ordering is not a standard-path term sequence');
  assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),121);
  return rows;
}

export async function loadAIEngineeringEvidence(review=undefined){
  review??=await read(REVIEW_PATH);
  await validateWguProgramReview(review,{program:PROGRAM,reviewId:'wgu-ai-engineering-exact-program-review-2026-11-26',pageUrl:PAGE,checkedOn:'2026-11-26'});
  assert.equal(review.publicationAllowed,false,'This receipt does not authorize a public plan');
  assert.equal(review.disposition,'held-capstone-transfer-policy-conflict');
  assert.deepEqual(review.capstoneCourseCodes,[],'This generic field records literal title matches, not a semantic absence of capstones');
  assert.deepEqual(review.identifiedCapstoneCourseCodes,['E090']);
  assert.equal(review.requirements,40);assert.equal(review.totalCredits,121);assert.equal(review.programRecordVersion,17);
  for(const source of review.captures){
    const meta=await read(source.capture.replace(/\.txt$/,'.json'));
    assert.equal(source.fetchedAt,meta.fetchedAt,'Retain the original retrieval date');
    if(source.role==='receiving-map')assert.equal(source.receivingCheckedOn,'2026-11-25','Do not present the retained agreement review as a new fetch');
  }
  assert.equal(review.supportingCaptures.length,3);
  const support=new Map();
  for(const source of review.supportingCaptures){
    const body=await text(source.capture),meta=await read(source.capture.replace(/\.txt$/,'.json'));
    assert.equal(hash(body),source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);assert.equal(meta.fetchedAt,source.fetchedAt);assert(meta.fetchedAt.slice(0,10)<=review.checkedOn);
    assert(!support.has(source.role));support.set(source.role,{...source,body});
    if(source.role==='residency-policy')assert.equal(meta.finalUrl,POLICY);
    else{
      assert.equal(meta.finalUrl,CATALOG);assert.equal(meta.status,206);assert.equal(meta.documentSha256,source.documentSha256);assert.equal(meta.pages,source.pages);assert.equal(meta.columns,source.columns);
      assert.equal(meta.documentSha256,'3cd41c5e76898570ecb3ce76954c19a56dc9cfbd9b1fbb7c649224be58ffcde5');
    }
  }
  assert.equal(support.get('catalog-ledger')?.pages,'132-133');assert.equal(support.get('catalog-ledger').columns,1);
  assert.equal(support.get('capstone-description')?.pages,'333-333');assert.equal(support.get('capstone-description').columns,2);
  const role=key=>review.captures.find(source=>source.role===key);
  const courses=(await read(role('curriculum').capture))[0].courses,rows=validateAICatalog(support.get('catalog-ledger').body,courses);
  const descriptions=courses.filter(course=>/\bcapstone course\b/i.test(course.courseDescription));assert.deepEqual(descriptions.map(course=>course.courseCode),['E090']);
  const capstone=descriptions[0],proof=review.capstoneReview;
  assert.equal(proof.courseCode,capstone.courseCode);assert.equal(proof.courseTitle,capstone.courseName);assert.equal(proof.competencyUnits,Number(capstone.competencyUnits));assert.equal(proof.competencyUnits,3);
  assert.equal(proof.sourceCapture,support.get('capstone-description').capture);assert.equal(proof.sourceSha256,support.get('capstone-description').sha256);
  assert(support.get('capstone-description').body.includes(proof.quote));assert(proof.quote.startsWith('E090 - Applied AI Engineering - This capstone course'));
  const guidelines=await read(role('guidelines').capture),receiving=guidelines.filter(row=>row.PAMS_bannerCode==='E090'&&JSON.parse(row.programs).includes(PROGRAM.programId));
  assert.equal(receiving.length,1);const guideline=receiving[0];
  assert.equal(guideline.id,proof.receivingGuidelineRecordId);assert.equal(guideline.recordVersion,proof.receivingGuidelineRecordVersion);assert.equal(guideline.transferArea,proof.receivingGuidelineTransferArea);assert.equal(guideline.transferArea,'Additional Transfer');assert.equal(guideline.transferRequirements,proof.receivingGuidelineText);
  assert.deepEqual(guidelines.filter(row=>row.transferArea==='Non-Transferable'&&JSON.parse(row.programs).includes(PROGRAM.programId)).map(row=>row.PAMS_bannerCode),['E083']);
  const policy=normalizeText(support.get('residency-policy').body);assert(policy.includes('in addition to any required capstone course(s) or clinical(s).'));assert(policy.includes('for undergraduate degree programs, students must earn at least 25%'));
  const page=normalizeText(await text(role('program-page').capture));
  assert(page.includes('tuition per six-month term is $4200'));assert(/e-books (?:and|&) resources fee \+ \$ 200/.test(page));
  assert(page.includes('competency-based')&&page.includes('40 courses'));
  for(const phrase of ['high school diploma','advanced mathematics and programming','2.25 gpa','2.75','pre-calculus','ap computer science a'])assert(page.includes(phrase),'Retain the actual program admission readiness: '+phrase);
  const metadata=await read(role('metadata').capture),future=metadata.find(program=>program.id===270);assert.equal(future?.catalogTerm,'202702');assert.equal(future.approvalStatus,'Pending');
  return {review,courses,rows,capstone,guideline,support,pricing:{tuitionPerTerm:4200,resourceFeePerTerm:200,amount:4400,period:'6 months'}};
}

if(isMain(import.meta)){
  const result=await loadAIEngineeringEvidence();
  console.log(JSON.stringify({program:result.review.program,totalCredits:121,requirements:40,publicationAllowed:false,disposition:result.review.disposition,capstone:{code:'E090',credits:3,receivingTransferArea:result.guideline.transferArea},pricing:result.pricing},null,2));
}
