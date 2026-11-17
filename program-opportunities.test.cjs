const test = require('node:test');
const assert = require('node:assert/strict');
const facts = require('./dist/program-opportunities.js');
const research = require('./content/research/cbe-schools.json');

test('program tuition overrides school rates and missing tuition is never free', () => {
  const school = { paceModels: ['competency-subscription'], pricing: { model: 'subscription', amount: 3500, period: '24 weeks' } };
  assert.equal(facts.priceText({ paceModel: 'competency-subscription', pricing: { model: 'subscription', amount: 4030, period: '24 weeks' } }, school), '$4,030 per 24 weeks');
  assert.equal(facts.priceText({ paceModel: 'competency-subscription', pricing: { model: 'subscription', amount: null, period: '24 weeks' } }, school), 'Tuition needs confirmation');
  assert.equal(facts.priceText({ paceModel: 'course-term' }, school), 'Tuition needs confirmation');
  assert.equal(facts.priceText({ pricing: { model: 'subscription', amount: 0, period: 'term' } }, school), 'Tuition needs confirmation');
});

test('future, unapproved and intake-unverified options cannot become enrollment actions', () => {
  assert.equal(facts.availability({ status: 'upcoming', availableFrom: '2026-12-01' }).canChoose, false);
  assert.match(facts.availability({ status: 'upcoming', availableFrom: '2026-12-01' }).statusLabel, /December 1, 2026/);
  assert.equal(facts.availability({ status: 'approval-pending' }).canChoose, false);
  assert.equal(facts.availability({ status: 'available', intakeVerified: false }).canChoose, false);
  assert.equal(facts.availability({ status: 'available' }).canChoose, true);
});

test('school lookup works for research files and merged program directories', () => {
  const school = research.schools[0], program = school.programs[0];
  assert.equal(facts.schoolFor(research, program), school);
  assert.equal(facts.schoolFor({ programDirectory: { schools: research.schools } }, { schoolId: school.id }), school);
  assert.equal(facts.schoolFor(research, { school: school.name }), school);
  assert.equal(facts.schoolFor(research, { schoolId: 'unknown' }), null);
});

test('graduate rules override broad undergraduate alternative-credit acceptance', () => {
  const school = research.schools.find(s => s.id === 'university-of-phoenix');
  const html = facts.detailsHTML(school.programs.find(p => p.id === 'phoenix-cb-mba'), school);
  assert.match(html, /College-earned credits<\/dt><dd>Not accepted/);
  assert.match(html, /ACE courses<\/dt><dd>Not accepted/);
  assert.doesNotMatch(html, /Eligible courses accepted/);
  assert.doesNotMatch(html, /Do not promise/);
  const umass = research.schools.find(s => s.id === 'umass-global');
  const mba = facts.detailsHTML(umass.programs.find(p => p.id === 'umass-mypath-mba'), umass);
  assert.match(mba, /Up to 12 semester credits/);
  assert.match(mba, /Graduate credit needs confirmation/);
});

test('quarter-credit limits retain their unit', () => {
  const school = research.schools.find(s => s.id === 'walden-university');
  const html = facts.detailsHTML(school.programs.find(p => p.level === 'bachelor'), school);
  assert.match(html, /Up to 135 quarter credits/);
  assert.match(html, /Up to 90 quarter credits/);
  assert.doesNotMatch(html, /135 semester credits/);
});

test('untrusted content is escaped and only HTTPS source links are rendered', () => {
  const program = { level: 'bachelor', paceModel: '<svg onload=alert(1)>', url: 'javascript:alert(1)', prerequisites: ['<img src=x onerror=alert(1)>'], notes: ['<script>alert(1)</script>'], pricing: { model: 'subscription', amount: 100, period: '<b>week</b>', sourceUrl: 'https://example.com/" onclick="alert(1)' } };
  const school = { transferPolicy: { ace: { status: 'accepted', notes: '<iframe src=x>', sourceUrl: 'javascript:alert(1)' }, institutional: { status: 'case-by-case', sourceUrl: 'https://username:password@example.com' } } };
  const html = facts.detailsHTML(program, school);
  assert.doesNotMatch(html, /<script|<img|<iframe|href="javascript:|href="https:\/\/username/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;b&gt;week&lt;\/b&gt;/);
  assert.doesNotMatch(html, / onclick="alert/);
});
