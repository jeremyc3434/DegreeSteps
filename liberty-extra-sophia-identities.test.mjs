import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const readText=path=>readFileSync(new URL('./'+path,import.meta.url),'utf8');
const read=path=>JSON.parse(readText(path));
const hash=path=>createHash('sha256').update(readFileSync(new URL('./'+path,import.meta.url))).digest('hex');
const paths={
 global:'content/reuse/wgu-sophia-provider-identities.json',
 original:'content/research/gcu-sophia-review-2026-11-19.json',
 receiving:'content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json',
 activeSources:'content/pathway-kits/wgu/school.json',
 activeSnapshot:'content/curricula/snapshots/wgu/sophia-business-current-web.txt'
};
// Preserve the exact input reviewed on November 24 as the active school kit gains new programs.
const historicalInputs={'content/pathway-kits/wgu/school.json':'content/curricula/snapshots/wgu/school-provider-input-2026-11-24.json'};
const review=read('content/catalog/liberty-extra-sophia-identities-reviewed-2026-11-24.json');
const global=read(paths.global),original=read(paths.original),receiving=read(paths.receiving);
const sources=new Map(review.sources.map(source=>[source.id,source]));
const expected=[
 ['SOPH-0005','STAT1001',5,'2024-10-01','2027-09-30','MATH 201'],
 ['SOPH-0011','ECON1002',5,'2025-10-01','2028-09-30','ECON 213'],
 ['SOPH-0012','ECON1001',5,'2025-10-01','2028-09-30','ECON 214'],
 ['SOPH-0030','ENG1002',3,'2025-11-01','2028-10-31','ENGL 102']
];
const usDate=iso=>iso.split('-').map(Number).filter((_,index)=>index>0).join('/')+'/'+Number(iso.slice(0,4));

test('local rereview binds its immutable inputs and preserves current source metadata and original dates',()=>{
 assert.equal(review.version,1);
 assert.equal(review.id,'liberty-extra-sophia-identities-2026-11-24');
 assert.equal(review.checkedOn,'2026-11-24');
 assert.equal(review.reviewType,'local-rereview-of-existing-captured-primary-evidence');
 assert.equal(review.networkRetrievalPerformed,false);
 assert.equal(review.studentCreditsAwarded,0);
 assert.deepEqual(Object.keys(review.inputFingerprints).sort(),[...Object.values(paths),'content/source-captures/c934c7f174a51a06.txt','content/source-captures/c934c7f174a51a06.json'].sort());
 for(const [path,fingerprint] of Object.entries(review.inputFingerprints))assert.equal(hash(historicalInputs[path]||path),fingerprint,path);
 const originals=new Map([...global.sources,...receiving.sources,...read(paths.activeSources).sources].map(source=>[source.id,source]));
 assert.equal(sources.size,review.sources.length);
 for(const source of review.sources){
  if(source.id==='liberty-online-math-201-course-title-2026-11-24'){
   assert.equal(source.kind,'university');
   assert.deepEqual(source.roles,['receiving-course-title']);
   assert.equal(source.retrievedOn,'2026-11-20');
  }else{
   assert.deepEqual(source,originals.get(source.id),'Original source metadata must not be refreshed or rewritten: '+source.id);
   assert.notEqual(source.checkedOn||source.checked,review.checkedOn);
  }
 }
});

test('four current source identities retain their original semester quantities and finite ACE versions',()=>{
 assert.deepEqual(review.courses.map(course=>[course.code,course.providerCourseCode,course.aceVersion,course.recommendationStart,course.recommendationEnd,course.receivingCode]),expected);
 for(const course of review.courses){
  const cached=global.courses.find(row=>row.code===course.code),native=original.sourceIdentities.find(row=>row.aceId===course.code);
  assert.equal(course.provider,'Sophia');
  for(const key of ['code','aceId','title','providerCourseCode','url','sourceCredits','sourceCreditSystem','sourceUpper','recommendationStart','recommendationEnd','identitySourceIds','recommendationPeriodSourceIds','identityCheckedOn','identityReviewId'])assert.deepEqual(course[key],cached[key],course.code+' '+key);
  assert.equal(course.aceVersion,cached.courseVersion);
  assert.equal(course.aceVersion,native.aceVersion);
  assert.equal(course.sourceCredits,3);
  assert.equal(course.sourceCreditSystem,'semester');
  assert.equal(course.sourceUpper,false);
  assert.equal(course.minScore,cached.providerCoursePassingPercent);
  assert.equal(course.minScore,native.minimumPassingScore);
  assert.equal(course.identityCheckedOn,'2026-11-19');
  assert(course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn);
  for(const id of [...course.identitySourceIds,...course.recommendationPeriodSourceIds]){
   const source=sources.get(id);
   assert(source,'Missing independent identity source '+id);
   assert(['ace','provider'].includes(source.kind));
   assert(['www.acenet.edu','www.sophia.org','cdn2.sophia.org'].includes(new URL(source.url).hostname));
  }
  assert(course.recommendationPeriodSourceIds.every(id=>sources.get(id).kind==='ace'));
 }
});

test('normalized ACE captures independently contain each exact code, version, credit quantity and current period',()=>{
 for(const course of review.courses){
  const captures=course.normalizedCaptures;
  assert.equal(captures.filter(capture=>capture.kind==='ace-course-record').length,1);
  for(const capture of captures){
   const metadata=read(capture.metadataPath),text=readText(capture.capturePath);
   assert.equal(capture.hashBasis,'normalized-capture-text');
   assert.equal(hash(capture.capturePath),capture.sha256,capture.capturePath);
   assert.equal(capture.sha256,metadata.sha256);
   assert.deepEqual(capture.captureMetadata,metadata,'Do not replace original capture times with the rereview date.');
   assert.equal(metadata.fetchedAt.slice(0,10),'2026-11-20');
   assert.equal(metadata.status,200);
   assert.equal(metadata.characters,text.length);
   assert(course.identitySourceIds.includes(capture.sourceId));
   const originalUrl=new URL(sources.get(capture.sourceId).url),capturedUrl=new URL(metadata.url);
   originalUrl.searchParams.sort();capturedUrl.searchParams.sort();
   assert.equal(capturedUrl.href,originalUrl.href);
   if(capture.kind==='ace-course-record'){
    assert.equal(metadata.contentType,'text/html; charset=utf-8');
    assert(text.includes('ACE ID:\n'+course.code+'\nVersion:\n'+course.aceVersion+'\nOrganization\'s ID:\n'+course.providerCourseCode+'\n'));
    assert(text.includes('Minimum Passing Score:\n'+course.minScore+'\n'));
    assert(text.includes('ACE Credit Recommendation Period:\n'+usDate(course.recommendationStart)+' - '+usDate(course.recommendationEnd)+'\n'));
    assert(text.includes('Level\nCredits (SH)\nSubject\nLower-Division Baccalaureate\n'+course.sourceCredits+'\n'));
   }else{
    assert.equal(capture.kind,'provider-linked-syllabus');
    assert.equal(metadata.contentType,'application/pdf');
    assert(text.includes(course.providerCourseCode+': '+course.title));
    assert(text.includes('3 semester\nhours'));
    assert(text.includes('(ACE ID: '+course.code+').'));
    assert(text.includes('COURSE EFFECTIVE DATES: October 2025 - Present'));
   }
  }
 }
});

test('current offering proof uses exact Sophia listing rows without inheriting WGU receiving claims',()=>{
 for(const course of review.courses){
  const evidence=course.activeOfferingEvidence,native=original.sourceIdentities.find(row=>row.aceId===course.code);
  assert.equal(course.activeOffering,true);
  assert.equal(course.activeOffering,native.activeOffering);
  assert.equal(evidence.reviewPath,paths.original);
  assert.equal(evidence.reviewId,original.id);
  assert.equal(evidence.reviewedOn,original.checkedOn);
  assert.equal(evidence.reviewCourseCode,native.aceId);
  assert.equal(evidence.status,'current-ace-identity-reviewed');
  assert.equal(evidence.snapshotPath,paths.activeSnapshot);
  assert.equal(hash(evidence.snapshotPath),evidence.snapshotSha256);
  assert.equal(evidence.snapshotHashBasis,'stored-web-reader-text');
  assert.deepEqual(course.activeOfferingSourceIds,[evidence.sourceId]);
  assert.equal(new URL(sources.get(evidence.sourceId).url).hostname,'wgucollegeofbusiness.sophia.org');
  assert.equal(evidence.sourceCheckedOn,sources.get(evidence.sourceId).checked);
  const row=readText(evidence.snapshotPath).split('\n')[evidence.physicalLineNumber-1];
  assert.equal(evidence.reviewedExtract,row);
  assert(row.includes(course.title));
  assert(row.includes('| '+course.code+'  | '+course.sourceCredits+'  |'));
  assert(!course.receivingSourceIds.includes(evidence.sourceId));
  for(const key of ['receivingCode','receivingTitle','credits','evidence','mappingReviewId','universityMapRecord'])assert.equal(Object.hasOwn(global.courses.find(row=>row.code===course.code),key),false,key);
 }
});

test('Liberty online awards remain independent from source-credit and active-offering evidence',()=>{
 assert.equal(receiving.format,'Online');
 assert.equal(receiving.catalogYear,'2026-2027');
 assert.equal(new Set(review.courses.map(course=>course.receivingCode)).size,4);
 const guide=sources.get('liberty-online-sophia-guide-full-2026-11-18');
 assert.equal(guide.modality,'online');
 assert.equal(guide.guideUpdated,'2026-07');
 assert.equal(guide.sha256,'c4eaeb58cc874354573a0c7fe5047c4138216e197fec270218a84326c36d3031');
 assert.equal(guide.url,'https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf');
 for(const course of review.courses){
  const award=receiving.awards.find(row=>row.id===course.receivingAwardId);
  assert.equal(award.code,course.code);
  assert.equal(award.providerCourseCode,course.providerCourseCode);
  assert.equal(course.receivingCode,award.receivingCode);
  if(course.code==='SOPH-0005'){
   assert.equal(course.receivingGuideParsedTitle,award.receivingTitle,'Retain the raw guide footnote separately from the current catalog course title.');
   assert.equal(course.receivingTitle,'Introduction to Probability and Statistics');
   const proof=course.receivingTitleEvidence,metadata=read(proof.metadataPath),titleSource=sources.get(proof.sourceIds[0]);
   assert.deepEqual(course.receivingTitleSourceIds,proof.sourceIds);
   assert.equal(hash(proof.capturePath),proof.sha256);
   assert.equal(proof.sha256,metadata.sha256);
   assert.equal(proof.hashBasis,'normalized-capture-text');
   assert.deepEqual(proof.captureMetadata,metadata);
   assert.equal(titleSource.url,metadata.url);
   assert.equal(new URL(titleSource.url).hostname,'catalog.liberty.edu');
   assert.equal(proof.reviewedExtract,'MATH 201 '+course.receivingTitle+' 3 3');
   assert(readText(proof.capturePath).split('\n').includes(proof.reviewedExtract));
   assert(proof.sourceIds.every(id=>!course.receivingSourceIds.includes(id)),'A course-title listing must not establish the transfer award.');
  }else assert.equal(course.receivingTitle,award.receivingTitle);
  assert.equal(course.credits,award.credits);
  assert.equal(course.receivingCreditSystem,award.creditSystem);
  assert.equal(course.receivingReviewedExtract,award.reviewedExtract);
  assert.equal(course.sourcePage,1);
  assert.equal(course.sourcePage,award.sourcePage);
  assert.equal(course.receivingCheckedOn,'2026-11-18');
  assert.deepEqual(course.receivingSourceIds,award.sourceIds);
  assert.deepEqual(course.crossListedReceivingCodes,award.crossListedReceivingCodes);
  assert(course.receivingSourceIds.every(id=>sources.get(id).evidenceType==='official-receiving-school-equivalency'));
  assert(course.identitySourceIds.every(id=>!course.receivingSourceIds.includes(id)));
  assert.equal(award.sourceCredits,null,'Receiving guide alone cannot establish independent source credits.');
  assert.equal(award.sourceCreditStatus,'unknown');
  assert(!['MATH 121','ENGL 101'].includes(course.receivingCode),'The additional award must not duplicate History\'s fixed quantitative/writing awards.');
 }
 assert.deepEqual(review.courses.find(course=>course.code==='SOPH-0005').crossListedReceivingCodes,['BUSI 230']);
});
