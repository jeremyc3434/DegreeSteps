import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const review = read('./content/catalog/liberty-upper-psychology-study-identities-reviewed-2026-11-24.json');
const guide = read('./content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json');
const sources = new Map(review.sources.map(source => [source.id, source]));
const iso = value => {
  const [month, day, year] = value.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

test('upper Psychology identities retain exact current ACE versions and independently issued semester credits', () => {
  assert.deepEqual(review.courses.map(course => [course.aceId, course.providerCourseCode, course.aceVersion]), [
    ['SDCM-0178', 'Psychology 306', 3],
    ['SDCM-0183', 'Psychology 314', 2]
  ]);
  for (const course of review.courses) {
    const ace = course.identitySourceIds.map(id => sources.get(id)).find(source => source.kind === 'ace');
    const url = new URL(ace.url);
    assert.equal(url.hostname, 'www.acenet.edu');
    assert.equal(url.searchParams.get('oid'), '82099b28-9016-e811-810f-5065f38bf0e1');
    assert.equal(ace.rawBodyCaptured, true);
    const capture = readFileSync(new URL(`./${ace.capture}`, import.meta.url));
    assert.equal(createHash('sha256').update(capture).digest('hex'), ace.captureSha256);
    const body = capture.toString('utf8');
    assert(body.includes(`ACE ID:\n${course.aceId}\nVersion:\n${course.aceVersion}\n`));
    assert(body.includes(`Organization's ID:\n${ace.observed.organizationCourseId}\n`));
    assert(body.includes(`Minimum Passing Score:\n${course.minimumPassingScore}\n`));
    assert(body.includes(`Upper-Division Baccalaureate\n${course.sourceCredits}\n`));
    assert(body.includes(`ACE Credit Recommendation Period:\n${ace.selectedRecommendationPeriod}\n`));
    const [start, end] = ace.selectedRecommendationPeriod.split(' - ').map(iso);
    assert.equal(start, course.recommendationStart);
    assert.equal(end, course.recommendationEnd);
    assert(start <= review.checkedOn && end >= review.checkedOn);
    assert.equal(course.sourceCredits, 3);
    assert.equal(course.sourceCreditSystem, 'semester');
    assert.equal(course.sourceUpper, true);
    assert.equal(course.minimumPassingScore, 70);
    for (const key of ['aceId', 'aceVersion', 'recommendationStart', 'recommendationEnd', 'sourceCredits', 'sourceCreditSystem', 'sourceUpper', 'minimumPassingScore']) {
      assert.equal(ace.observed[key], course[key], key);
    }
    assert(course.recommendationPeriodSourceIds.every(id => sources.get(id).kind === 'ace'));
    assert(!course.identitySourceIds.includes(course.receivingGuideSourceId));
  }
});

test('independent source versions remain separate from the exact existing Liberty online awards', () => {
  assert.deepEqual(review.courses.map(course => [course.aceId, course.receivingCode]), [
    ['SDCM-0178', 'PSYC 430'], ['SDCM-0183', 'PSYC 365']
  ]);
  for (const course of review.courses) {
    const award = guide.awards.find(award => award.id === course.receivingAwardId);
    assert(award);
    for (const [courseKey, awardKey] of [['aceId', 'code'], ['providerCourseCode', 'providerCourseCode'], ['title', 'title'], ['receivingCode', 'receivingCode'], ['receivingCredits', 'credits'], ['receivingUpper', 'upper']]) {
      assert.equal(course[courseKey], award[awardKey], courseKey);
    }
    assert.equal(course.receivingGuidePage, award.sourcePage);
    const source = sources.get(course.receivingGuideSourceId);
    assert.equal(source.sha256, guide.sources.find(item => item.id === source.id).sha256);
    assert.equal(source.scope.format, 'Online');
    assert.equal(source.scope.catalogYear, review.catalogYear);
  }
  assert.equal(review.personalAwardsCreated, 0);
  assert.equal(review.historicalVersionsRetargeted, false);
  assert.equal(review.receivingAwardsChanged, false);
  assert.equal(review.universityGradeRulesChanged, false);
});

test('active course-specific syllabi preserve the different Psychology 306 and 314 assessments', () => {
  for (const course of review.courses) {
    const provider = course.identitySourceIds.map(id => sources.get(id)).find(source => source.kind === 'provider');
    assert.equal(provider.url, course.courseUrl);
    assert.equal(new URL(provider.url).hostname, 'study.com');
    assert.equal(provider.rawBodyCaptured, false);
    assert.equal(provider.captureSha256, undefined);
    assert.equal(provider.sourceHtmlSha256, undefined);
    for (const key of ['aceId', 'providerCourseCode', 'title', 'sourceCredits', 'sourceCreditSystem', 'sourceUpper']) assert.equal(provider.observed[key], course[key], key);
    assert.equal(provider.observed.offered, true);
    assert.equal(course.activeOffering, true);
    assert.deepEqual(course.assessmentSourceIds, [provider.id]);
  }
  const abnormal = sources.get('provider-study-psychology306-current-web-2026-11-24').observed;
  const learning = sources.get('provider-study-psychology314-current-web-2026-11-24').observed;
  assert.equal(abnormal.requiredAssignments, 2);
  assert.equal(abnormal.finalExamRequired, true);
  assert.equal(abnormal.assignmentPoints + abnormal.chapterTestPoints + abnormal.finalExamPoints, 300);
  assert.equal(abnormal.minimumPassingScore, 70);
  assert.equal(abnormal.individualComponentPassingFloorRequired, false);
  assert.equal(abnormal.finalExamProctored, false);
  assert.equal(abnormal.finalExamOpenBook, true);
  assert.equal(learning.requiredAssignments, 3);
  assert.equal(learning.finalExamRequired, false);
  assert.equal(learning.assignmentPoints + learning.chapterTestPoints, 300);
  assert.equal(learning.minimumPassingScore, undefined, 'Use the explicit ACE minimum without inventing an unstated provider rule.');
});
