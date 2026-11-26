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
const review=read('content/catalog/liberty-core-sophia-identities-reviewed-2026-11-24.json');
const receiving=read(paths.receiving),original=read(paths.original),global=read(paths.global);
const sources=new Map(review.sources.map(source=>[source.id,source]));
const expectedAwards=[
 ['SOPH-0015','ENGL 101'],
 ['SOPH-0024','COMS 101'],
 ['SOPH-0020','ETHC 101'],
 ['SOPH-0002','BIOL 102'],
 ['SOPH-0048','PSYC 101'],
 ['SOPH-0001','MATH 121'],
 ['SOPH-0009','ARTS 209'],
 ['SOPH-0078','PSYC 210']
];
const existingCaptures=new Map([
 ['SOPH-0015',{providerCourseCode:'ENG1001',aceVersion:4,start:'2024-04-01',end:'2027-03-31',sha256:'11632c8a48430bbe235d6a452836a01f28aacdc3d6f80aa55298c3e7c674242f'}],
 ['SOPH-0024',{providerCourseCode:'COMM1002',aceVersion:5,start:'2026-08-01',end:'2029-07-31',sha256:'fab9edb38527cfd30462b5ba8d94d1cde2e5473943e10607a195e7ac3b2db821'}],
 ['SOPH-0002',{providerCourseCode:'SCIE1020 (formerly HumBio1001)',aceVersion:5,start:'2025-05-01',end:'2028-04-30',sha256:'8a99ebd2c03147412a1765d903701cf814f1ba777806d49d59486206efe142eb'}],
 ['SOPH-0001',{providerCourseCode:'MATH1001 (formerly CA1001)',aceVersion:6,start:'2025-05-01',end:'2028-04-30',sha256:'d6cd86c61775dc3796f842e9292ce8317915e84282a2abe2d7337192c7c5ddfc'}]
]);
const iso=date=>{
 const [month,day,year]=date.split('/');
 return year+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0');
};
const canonicalUrl=value=>{
 const url=new URL(value);
 url.searchParams.sort();
 return url.href;
};

test('core Sophia packet fingerprints its independent inputs and preserves original capture provenance',()=>{
 assert.equal(review.version,1);
 assert.equal(review.id,'liberty-core-sophia-identities-2026-11-24');
 assert.equal(review.checkedOn,'2026-11-24');
 assert.equal(review.networkRetrievalPerformed,true);
 assert.equal(review.studentCreditsAwarded,0);
 assert.equal(sources.size,review.sources.length,'Source IDs must be unique.');
 assert(Object.keys(review.inputFingerprints).length>0);
 for(const path of [paths.receiving,paths.activeSnapshot])assert(Object.hasOwn(review.inputFingerprints,path),path);
 for(const [path,fingerprint] of Object.entries(review.inputFingerprints)){
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(hash(historicalInputs[path]||path),fingerprint,path);
 }
 const originals=new Map([...global.sources,...receiving.sources,...read(paths.activeSources).sources].map(source=>[source.id,source]));
 for(const source of review.sources){
  assert(source.id&&source.url);
  if(originals.has(source.id))assert.deepEqual(source,originals.get(source.id),'Imported source metadata must retain its original review date: '+source.id);
 }
});

test('eight exact Sophia identities retain finite current ACE periods and original three-semester-credit quantities',()=>{
 assert.deepEqual(review.courses.map(course=>[course.code,course.receivingCode]).sort(),expectedAwards.toSorted());
 assert.equal(new Set(review.courses.map(course=>course.code)).size,8);
 assert.equal(new Set(review.courses.map(course=>course.receivingAwardId)).size,8);
 for(const course of review.courses){
  assert.equal(course.provider,'Sophia');
  assert.equal(course.code,course.aceId);
  assert.equal(course.sourceCredits,3);
  assert.equal(course.sourceCreditSystem,'semester');
  assert.equal(course.sourceUpper,false);
  assert.equal(course.minScore,70);
  assert(Number.isInteger(course.aceVersion)&&course.aceVersion>0);
  assert.match(course.recommendationStart,/^\d{4}-\d{2}-\d{2}$/);
  assert.match(course.recommendationEnd,/^\d{4}-\d{2}-\d{2}$/);
  assert(course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn,course.code+' must use its current selected version.');
  assert(course.identityCheckedOn<=review.checkedOn);
  assert(course.identitySourceIds.length>0);
  assert(course.recommendationPeriodSourceIds.length>0);
  for(const id of [...course.identitySourceIds,...course.recommendationPeriodSourceIds]){
   const source=sources.get(id);
   assert(source,'Missing independent source '+id);
   assert(['ace','provider'].includes(source.kind));
   assert(['www.acenet.edu','www.sophia.org','cdn2.sophia.org'].includes(new URL(source.url).hostname));
  }
  assert(course.recommendationPeriodSourceIds.every(id=>sources.get(id).kind==='ace'));
  const known=existingCaptures.get(course.code);
  if(known){
   assert.equal(course.providerCourseCode,known.providerCourseCode);
   assert.equal(course.aceVersion,known.aceVersion);
   assert.equal(course.recommendationStart,known.start);
   assert.equal(course.recommendationEnd,known.end);
  }
 }
});

test('normalized ACE bodies independently bind exact identities, selected recommendation dates, levels and quantities',()=>{
 const freshCodes=[];
 for(const course of review.courses){
  const captures=course.normalizedCaptures;
  assert.equal(captures.filter(capture=>capture.kind==='ace-course-record').length,1,course.code);
  for(const capture of captures){
   const metadata=read(capture.metadataPath),text=readText(capture.capturePath),source=sources.get(capture.sourceId);
   assert.equal(capture.hashBasis,'normalized-capture-text');
   assert.equal(hash(capture.capturePath),capture.sha256,capture.capturePath);
   assert.equal(capture.sha256,metadata.sha256);
   assert.deepEqual(capture.captureMetadata,metadata,'Original capture dates must not become the local review date.');
   assert.equal(metadata.status,200);
   assert.equal(metadata.characters,text.length);
   assert(course.identitySourceIds.includes(capture.sourceId));
   assert(source);
   assert.equal(canonicalUrl(metadata.url),canonicalUrl(source.url));
   if(capture.kind==='ace-course-record'){
    assert.equal(source.kind,'ace');
    assert.equal(new URL(metadata.url).hostname,'www.acenet.edu');
    assert.equal(metadata.contentType,'text/html; charset=utf-8');
    const identity=text.match(/ACE ID:\n([^\n]+)\nVersion:\n(\d+)\nOrganization's ID:\n([^\n]+)\n/);
    assert(identity,'Missing exact ACE identity block for '+course.code);
    assert.equal(identity[1],course.aceId);
    assert.equal(Number(identity[2]),course.aceVersion);
    assert.equal(identity[3],course.providerCourseCode);
    const score=text.match(/Minimum Passing Score:\n(\d+)\n/);
    assert(score);
    assert.equal(Number(score[1]),course.minScore);
    const period=text.match(/ACE Credit Recommendation Period:\n(\d{1,2}\/\d{1,2}\/\d{4}) - (\d{1,2}\/\d{1,2}\/\d{4})\n/);
    assert(period,'Missing selected current ACE recommendation period for '+course.code);
    assert.equal(iso(period[1]),course.recommendationStart);
    assert.equal(iso(period[2]),course.recommendationEnd);
    const quantity=text.match(/Level\nCredits \(SH\)\nSubject\n([^\n]+)\n(\d+)\n/);
    assert(quantity);
    assert.equal(quantity[1],'Lower-Division Baccalaureate');
    assert.equal(Number(quantity[2]),course.sourceCredits);
    const known=existingCaptures.get(course.code);
    if(known){
     assert.equal(metadata.fetchedAt.slice(0,10),'2026-11-20');
     assert.equal(capture.sha256,known.sha256);
    }else{
     assert.equal(metadata.fetchedAt.slice(0,10),'2026-11-24');
     freshCodes.push(course.code);
    }
   }else{
    assert.equal(capture.kind,'provider-linked-syllabus');
    assert.equal(source.kind,'provider');
    assert.equal(metadata.contentType,'application/pdf');
    assert(text.includes(course.aceId));
    assert(text.includes('3 semester'));
   }
  }
 }
 assert.deepEqual(freshCodes.sort(),['SOPH-0009','SOPH-0020','SOPH-0048','SOPH-0078']);
});

test('active offering proof binds exact provider listing rows without importing WGU receiving claims',()=>{
 for(const course of review.courses){
  const evidence=course.activeOfferingEvidence,source=sources.get(evidence.sourceId);
  assert.equal(course.activeOffering,true);
  assert.equal(evidence.snapshotPath,paths.activeSnapshot);
  assert.equal(hash(evidence.snapshotPath),evidence.snapshotSha256);
  assert.equal(evidence.snapshotHashBasis,'stored-web-reader-text');
  assert(source);
  assert.equal(new URL(source.url).hostname,'wgucollegeofbusiness.sophia.org');
  assert.equal(evidence.sourceCheckedOn,source.checked);
  assert(Number.isInteger(evidence.physicalLineNumber)&&evidence.physicalLineNumber>0);
  const row=readText(evidence.snapshotPath).split('\n')[evidence.physicalLineNumber-1];
  assert.equal(evidence.reviewedExtract,row);
  assert(row.includes(course.title));
  assert(row.includes('| '+course.code+'  | '+course.sourceCredits+'  |'));
  assert.equal(typeof evidence.scope,'string');
  assert(!course.receivingSourceIds.includes(evidence.sourceId));
  if(evidence.reviewPath){
   const native=original.sourceIdentities.find(row=>row.aceId===course.code);
   assert.equal(course.code,'SOPH-0015','Only independently reviewed original records may supply a review binding.');
   assert.equal(evidence.reviewPath,paths.original);
   assert.equal(evidence.reviewId,original.id);
   assert.equal(evidence.reviewedOn,original.checkedOn);
   assert.equal(evidence.reviewCourseCode,native.aceId);
   assert.equal(native.activeOffering,true);
  }
 }
});

test('each Liberty award uses the current official online guide independently of source identity proof',()=>{
 assert.equal(receiving.format,'Online');
 assert.equal(receiving.catalogYear,'2026-2027');
 const guide=sources.get('liberty-online-sophia-guide-full-2026-11-18');
 assert.deepEqual(guide,receiving.sources.find(source=>source.id===guide.id));
 assert.equal(guide.modality,'online');
 assert.equal(guide.guideUpdated,'2026-07');
 assert.equal(guide.sha256,'c4eaeb58cc874354573a0c7fe5047c4138216e197fec270218a84326c36d3031');
 assert.equal(guide.url,'https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf');
 for(const course of review.courses){
  const award=receiving.awards.find(row=>row.id===course.receivingAwardId);
  assert(award,'Missing receiving award '+course.receivingAwardId);
  assert.equal(award.provider,'Sophia');
  assert.equal(award.code,course.code);
  assert.equal(course.receivingProviderCourseCode,award.providerCourseCode,'Preserve receiving-guide alias spelling independently from the ACE organization code.');
  assert.equal(course.receivingCode,award.receivingCode);
  assert.equal(course.receivingTitle,award.receivingTitle);
  assert.equal(course.credits,3);
  assert.equal(course.credits,award.credits);
  assert.equal(course.receivingCreditSystem,'semester');
  assert.equal(course.receivingCreditSystem,award.creditSystem);
  assert.equal(course.sourcePage,award.sourcePage);
  assert.equal(course.receivingReviewedExtract,award.reviewedExtract);
  assert.equal(course.receivingCheckedOn,'2026-11-18');
  assert.deepEqual(course.receivingSourceIds,award.sourceIds);
  assert.deepEqual(course.crossListedReceivingCodes,award.crossListedReceivingCodes);
  assert(course.receivingSourceIds.every(id=>sources.get(id).evidenceType==='official-receiving-school-equivalency'));
  assert(course.identitySourceIds.every(id=>!course.receivingSourceIds.includes(id)));
  assert(course.recommendationPeriodSourceIds.every(id=>!course.receivingSourceIds.includes(id)));
  assert.equal(award.sourceCredits,null,'Receiving-guide quantities must not become independent source-credit evidence.');
  assert.equal(award.sourceCreditStatus,'unknown');
 }
 assert.equal(review.courses.find(course=>course.code==='SOPH-0009').sourcePage,2);
});
