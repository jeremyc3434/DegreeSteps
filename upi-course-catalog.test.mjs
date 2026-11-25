import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {upiCourseReview,validateUPICourseReview,validateUPICaptures,applyUPICourseCatalog} from './scripts/upi-course-catalog.mjs';
const require=createRequire(import.meta.url),Library=require('./dist/course-library-engine.js');
const existing=JSON.parse(await readFile(new URL('./dist/data/course-catalog.json',import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));

test('reviewed UPI catalog has independently captured current source quantities and offerings',async()=>{
  await validateUPICaptures();
  assert(upiCourseReview.courses.length>=20,'The first useful batch should cover the complete reviewed active ACE catalog rather than a single example.');
  const original=clone(existing),result=applyUPICourseCatalog(original),rows=result.courses.filter(course=>course.provider==='UPI Study');
  assert.equal(rows.length,upiCourseReview.courses.length);
  assert.deepEqual(result.courses.filter(course=>course.provider!=='UPI Study'),existing.courses.filter(course=>course.provider!=='UPI Study'),'Other provider course facts and dates stay untouched.');
  assert.deepEqual(original,existing,'The source catalog is not mutated.');
  assert.equal(result.checkedAt,existing.checkedAt,'A UPI review does not refresh other catalog source dates.');
  assert.deepEqual(applyUPICourseCatalog(result),result,'Repeated builds retain stable source listing IDs and facts.');
  assert(rows.every(course=>course.mappingStatus==='source-listing'&&course.mappedCourseIds.length===0&&course.schoolAcceptance==='not-established-by-course-listing'));
});

test('a one-credit ACE recommendation is not turned into a three-credit course',()=>{
  const row=applyUPICourseCatalog(existing).courses.find(course=>course.provider==='UPI Study'&&course.mappingCode==='UPIS-0025');
  assert(row,'Retain the reviewed Environmental Science exhibit.');
  assert.equal(row.credits,1);assert.equal(row.creditSystem,'semester');assert.equal(row.creditBasis,'ace-recommendation');
  assert.equal(row.price,250,'The exact reviewed standalone purchase is shown independently of credit quantity.');
  assert.equal(row.priceEvidence.includesMembership,false);assert.equal(row.priceEvidence.includesTranscript,false);
  const proof=upiCourseReview.courses.find(course=>course.aceId==='UPIS-0025');
  assert.equal(proof.currentOffering.advertisedCredits,3,'The provider/NCCRS quantity claim stays separate from the one-credit ACE recommendation.');
  assert.match(proof.currentOffering.creditNote,/ACE.*1 semester credit.*NCCRS.*3 semester credits/);
});

test('saving a reviewed source course creates a saved original record, never earned or awarded credit',()=>{
  const course=applyUPICourseCatalog(existing).courses.find(item=>item.provider==='UPI Study'&&item.mappingCode==='UPIS-0003');
  assert(course);
  const state=Library.initialize(null),saved=Library.saveCourse(state,course);
  assert.equal(state.learning.length,0);assert.equal(saved.learning.length,1);
  const record=saved.learning[0];assert.equal(record.provider,'UPI Study');assert.equal(record.code,'UPIS-0003');assert.equal(record.status,'saved');assert.equal(record.credits,course.credits);assert.equal(record.creditSystem,'semester');assert.deepEqual(record.evaluations,[]);assert.equal(record.completedOn,'');
  assert.equal(record.courseVersion,course.courseVersion);assert.equal(record.recommendationStart,course.recommendationStart);assert.equal(record.recommendationEnd,course.recommendationEnd);assert.equal(record.creditOrigin,'alternative');assert.equal(Library.courseKind(course),'course');
  assert.equal(Library.saveCourse(saved,course).learning.length,1,'Saving twice does not duplicate original learning.');
});

test('unreviewed acceptance, quantities, recommendation systems and periods fail closed',()=>{
  const changes=[
    review=>review.courses[0].mappingStatus='reviewed-destination-example',
    review=>review.courses[0].schoolAcceptance='approved-at-all-schools',
    review=>review.courses[0].mappedCourseIds=['some-school:some-requirement'],
    review=>review.courses[0].sourceCredits=null,
    review=>review.courses[0].recommendationEnd='2025-12-31',
    review=>review.courses[0].recommendationStart='2027-01-01',
    review=>review.courses[0].recommendationStart='2026-13-01',
    review=>review.courses[0].creditBasis='NCCRS',
    review=>review.courses[0].courseUrl='https://www.upistudy.com.attacker.example/courses/example',
    review=>review.courses[0].identitySourceIds=['unknown-source'],
    review=>review.courses.push(clone(review.courses[0]))
  ];
  for(const change of changes){const review=clone(upiCourseReview);change(review);assert.throws(()=>validateUPICourseReview(review));}
});

test('source capture changes and conflicts with an existing original identity require review',async()=>{
  const changed=clone(upiCourseReview);changed.sources[0].sha256='0'.repeat(64);await assert.rejects(validateUPICaptures(changed),/capture changed/);
  const wrongQuantity=clone(upiCourseReview);wrongQuantity.courses[0].sourceCredits+=1;await assert.rejects(validateUPICaptures(wrongQuantity),/source fact differs/);
  const inventedAlias=clone(upiCourseReview);inventedAlias.courses[0].codeAliases.push('MATH 220');await assert.rejects(validateUPICaptures(inventedAlias),/Source aliases must come/);
  const result=applyUPICourseCatalog(existing),first=result.courses.find(course=>course.provider==='UPI Study');
  first.credits+=1;assert.throws(()=>applyUPICourseCatalog(result),/source quantity/);
  const wrongIdentity=applyUPICourseCatalog(existing);wrongIdentity.courses.find(course=>course.provider==='UPI Study').mappingCode='UPIS-9999';assert.throws(()=>applyUPICourseCatalog(wrongIdentity),/original course identity/);
});

test('independently established receiving associations survive a source catalog refresh',()=>{
  const result=applyUPICourseCatalog(existing),first=result.courses.find(course=>course.provider==='UPI Study');
  first.mappedCourseIds=['reviewed-school-model:reviewed-requirement'];first.mappingStatus='reviewed-destination-example';
  const refreshed=applyUPICourseCatalog(result),row=refreshed.courses.find(course=>course.id===first.id);
  assert.deepEqual(row.mappedCourseIds,first.mappedCourseIds);assert.equal(row.mappingStatus,'reviewed-destination-example');
  assert.deepEqual(applyUPICourseCatalog(refreshed),refreshed);
});

test('course details show only an exact reviewed standalone price and distinguish membership and fees',async()=>{
  const result=applyUPICourseCatalog(existing),rows=result.courses.filter(course=>course.provider==='UPI Study');
  assert(rows.length>0&&rows.every(course=>course.price===250&&course.priceEvidence.amount===250&&course.priceEvidence.code===course.mappingCode));
  for(const row of rows){
    assert.match(row.priceNote,/\$250 standalone course purchase/);assert.match(row.priceNote,/Eligible memberships may cost less/);assert.match(row.priceNote,/transcript fees and taxes are separate/);
    assert.equal(row.priceEvidence.includesMembership,false);assert.equal(row.priceEvidence.includesTranscript,false);assert.equal(row.priceEvidence.includesTaxes,false);
  }
  const proof=upiCourseReview.courses[0];
  const otherVersion=clone(upiCourseReview);otherVersion.courses[0].courseVersion+=1;
  assert.equal(applyUPICourseCatalog(existing,otherVersion).courses.find(row=>row.mappingCode===proof.aceId).price,null,'An unmatched version cannot inherit the provider-wide price.');
  const forgedOffering=clone(upiCourseReview);forgedOffering.courses[0].currentOffering.price=1;
  const unpriced=applyUPICourseCatalog(existing,forgedOffering).courses.find(row=>row.mappingCode===proof.aceId);
  assert.equal(unpriced.price,null);assert.equal(unpriced.priceEvidence,null);assert(!unpriced.priceNote.includes('$250'),'A mismatched provider quote cannot leave stale purchase wording.');
  const rates=JSON.parse(await readFile(new URL('./content/estimates/plan-estimate-rates.json',import.meta.url),'utf8'));
  const wrongQuote=rates.providers.find(row=>row.provider==='UPI Study'&&row.type==='per-course').courseQuotes.find(quote=>quote.code===proof.aceId);wrongQuote.amount=1;
  assert.equal(applyUPICourseCatalog(existing,upiCourseReview,{rates}).courses.find(row=>row.mappingCode===proof.aceId).price,null,'Only the source-bound matching quote can set a displayed price.');
});
