import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const review = read('./content/catalog/liberty-psychology-study-identities-reviewed-2026-11-24.json');
const guide = read('./content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json');
const sourceById = new Map(review.sources.map(source => [source.id, source]));
const isoFromUs = value => {
  const [month, day, year] = value.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

test('retained primary ACE captures prove the exact current version, source credits and selected recommendation period', () => {
  for (const course of review.courses) {
    const source = course.identitySourceIds.map(id => sourceById.get(id)).find(source => source.kind === 'ace');
    assert.equal(new URL(source.url).hostname, 'www.acenet.edu');
    assert.equal(source.rawBodyCaptured, true);
    assert.match(source.sourceHtmlSha256, /^[a-f0-9]{64}$/);
    const capture = readFileSync(new URL(`./${source.capture}`, import.meta.url));
    assert.equal(createHash('sha256').update(capture).digest('hex'), source.captureSha256);
    const body = capture.toString('utf8');
    assert(body.includes(`ACE ID:\n${course.aceId}\nVersion:\n${course.aceVersion}\nOrganization's ID:\n${course.providerCourseCode}\n`));
    assert(body.includes(`Minimum Passing Score:\n${course.minimumPassingScore}\n`));
    assert(body.includes(`Level\nCredits (SH)\nSubject\nUpper-Division Baccalaureate\n${course.sourceCredits}\n`));
    assert(body.includes(`ACE Credit Recommendation Period:\n${source.selectedRecommendationPeriod}\n`));
    const [start, end] = source.selectedRecommendationPeriod.split(' - ').map(isoFromUs);
    assert.equal(start, course.recommendationStart);
    assert.equal(end, course.recommendationEnd);
    assert(start <= review.checkedOn && end >= review.checkedOn);
    assert.equal(course.sourceCreditSystem, 'semester');
    assert.equal(course.sourceUpper, true);
    for (const key of ['aceVersion', 'recommendationStart', 'recommendationEnd', 'sourceCredits', 'sourceCreditSystem', 'sourceUpper', 'minimumPassingScore']) {
      assert.equal(course[key], source.observed[key], key);
    }
  }
});

test('independent source identities preserve the two exact existing Liberty online named awards', () => {
  assert.deepEqual(review.courses.map(course => [course.aceId, course.receivingCode]), [
    ['SDCM-0181', 'PSYC 380'],
    ['SDCM-0182', 'PSYC 312']
  ]);
  assert.equal(new Set(review.courses.map(course => course.receivingAwardId)).size, 2);
  assert.equal(review.courses.reduce((sum, course) => sum + course.receivingCredits, 0), 6);
  for (const course of review.courses) {
    const award = guide.awards.find(award => award.id === course.receivingAwardId);
    assert(award);
    for (const [proofKey, guideKey] of [['aceId', 'code'], ['providerCourseCode', 'providerCourseCode'], ['title', 'title'], ['receivingCode', 'receivingCode'], ['receivingCredits', 'credits'], ['receivingUpper', 'upper']]) {
      assert.equal(course[proofKey], award[guideKey], proofKey);
    }
    assert(award.sourceIds.includes(course.receivingGuideSourceId));
    assert.equal(course.receivingGuidePage, award.sourcePage);
    const receivingSource = sourceById.get(course.receivingGuideSourceId);
    const retainedGuideSource = guide.sources.find(source => source.id === receivingSource.id);
    assert.equal(receivingSource.sha256, retainedGuideSource.sha256);
    assert.equal(receivingSource.scope.format, 'Online');
    assert(!course.identitySourceIds.includes(course.receivingGuideSourceId));
    assert(!course.recommendationPeriodSourceIds.includes(course.receivingGuideSourceId));
  }
  assert.equal(review.personalAwardsCreated, 0);
  assert.equal(review.universityGradeRulesChanged, false);
  assert.equal(review.historicalVersionsRetargeted, false);
  assert.equal(review.receivingAwardsChanged, false);
});

test('active provider syllabus evidence binds exact ACE identities without claiming blocked raw captures or school grade rules', () => {
  for (const course of review.courses) {
    const source = course.identitySourceIds.map(id => sourceById.get(id)).find(source => source.kind === 'provider');
    assert.equal(new URL(source.url).hostname, 'study.com');
    assert.equal(source.url, course.courseUrl);
    for (const key of ['aceId', 'providerCourseCode', 'title', 'sourceCredits', 'sourceCreditSystem', 'sourceUpper', 'minimumPassingScore']) {
      assert.equal(course[key], source.observed[key], key);
    }
    assert.equal(source.observed.offered, true);
    assert.equal(source.rawBodyCaptured, false);
    assert.equal(source.directRawFetchStatus, 403);
    assert.equal(source.sourceHtmlSha256, undefined);
    assert.equal(source.captureSha256, undefined);
    assert.equal(source.observed.finalExamRequired, false);
    assert.equal(source.observed.requiredAssignments, course.aceId === 'SDCM-0181' ? 3 : 4);
    assert.equal(source.observed.assignmentPoints + source.observed.chapterTestPoints, 300);
    assert.equal(source.observed.individualComponentPassingFloorRequired, false);
    assert.deepEqual(course.assessmentSourceIds, [source.id]);
  }
});
