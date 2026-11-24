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

test('CBE, self-paced study and billing stay independent instead of becoming one shortcut', () => {
  const phoenix = research.schools.find(s => s.id === 'university-of-phoenix');
  const rawMBA = phoenix.programs.find(p => p.id === 'phoenix-cb-mba');
  const mba = facts.fitFacts({ ...rawMBA, competencyBased:true }, phoenix);
  assert.equal(mba.competencyBased, true);
  assert.equal(mba.selfPaced, true);
  assert.equal(mba.billing, 'per-credit');
  assert.equal(mba.billingLabel, 'Per credit');
  assert.equal(mba.termLabel, '16 weeks');
  assert.match(mba.tuitionLabel, /^\$300 per credit$/);
  assert.match(mba.paceLabel, /16-week blocks/);
  assert.equal(facts.fitFacts(rawMBA, phoenix).competencyBased, null, 'A self-paced label alone does not establish competency-based assessment');
  const subscription = facts.fitFacts({ pricing:{model:'subscription', amount:1000, period:'12 weeks'} });
  assert.equal(subscription.billing, 'subscription');
  assert.equal(subscription.competencyBased, null, 'A payment arrangement alone does not establish CBE');
  assert.equal(subscription.selfPaced, null, 'A payment arrangement alone does not establish self-paced coursework');
  const unpricedPace = facts.fitFacts({paceModel:'competency-subscription'});
  assert.equal(unpricedPace.selfPaced, true);
  assert.equal(unpricedPace.billing, null);
  assert.equal(unpricedPace.paceLabel, 'Self-paced', 'A pace label does not fill in an unbound billing arrangement');
  assert.equal(facts.fitFacts({paceModel:'competency-subscription', pricing:{model:'per-credit', amount:300, period:'credit'}}).paceLabel, 'Self-paced');
  const explicit = facts.fitFacts({ paceModel:'competency-subscription', competencyBased:false, selfPaced:false, pricing:{model:'subscription', amount:1000, period:'12 weeks'} });
  assert.equal(explicit.competencyBased, false);
  assert.equal(explicit.selfPaced, false);
  assert.equal(explicit.billing, 'subscription');
  assert.doesNotMatch(explicit.paceLabel, /Self-paced/);
});

test('unknown degree facts do not become scheduled, course-based or affordable from a school name or delivery mode', () => {
  for (const program of [{}, {school:'Western Governors University', modalities:['online'], creditUnit:'competency-unit'}, {school:'Liberty University', format:'Online'}]) {
    const fit = facts.fitFacts(program);
    assert.equal(fit.competencyBased, null);
    assert.equal(fit.selfPaced, null);
    assert.equal(fit.billing, null);
    assert.equal(facts.fitsFilters(fit, {competencyBased:false}), false);
    assert.equal(facts.fitsFilters(fit, {selfPaced:false}), false);
    assert.equal(facts.fitsFilters(fit, {billing:'per-credit'}), false);
    assert.equal(facts.fitsFilters(fit, {}), true);
  }
  const scheduled = facts.fitFacts({paceModel:'course-term'});
  assert.equal(scheduled.selfPaced, false);
  assert.equal(scheduled.competencyBased, null, 'Scheduled classes may still use competency-based assessment');
  assert.equal(facts.fitsFilters(scheduled, {selfPaced:false}), true);
  assert.equal(facts.fitsFilters(scheduled, {competencyBased:false}), false);
  assert.equal(facts.fitFacts({competencyBased:'true', selfPaced:'false'}).competencyBased, null);
  assert.equal(facts.fitFacts({competencyBased:'true', selfPaced:'false'}).selfPaced, null);
});

test('fit filters use exact known facts and never coerce unknown or malformed values', () => {
  const fit = facts.fitFacts({paceModel:'competency-subscription', pricing:{model:'subscription', amount:3500, period:'24 weeks'}});
  assert.equal(facts.fitsFilters(fit, {competencyBased:true, selfPaced:true, billing:'subscription'}), true);
  assert.equal(facts.fitsFilters(fit, {selfPaced:false}), false);
  assert.equal(facts.fitsFilters(fit, {billing:'flat-term'}), false);
  assert.equal(facts.fitsFilters(fit, {selfPaced:'true'}), false);
  assert.equal(facts.fitsFilters(fit, {billing:'tuition-per-credit-or-term'}), false);
  assert.equal(facts.fitsFilters(null, {competencyBased:true}), false);
  assert.equal(facts.fitsFilters(null, {}), true);
});

test('per-credit thresholds and bounded term tuition render their actual billing conditions', () => {
  const online = {pricing:{model:'threshold-credit', fullTimeRate:410, partTimeRate:475, fullTimeMin:12, period:'semester', sourceUrl:'https://college.example/online-rates'}};
  const campus = {pricing:{model:'banded-term', termRate:12695, bandMin:12, bandMax:18, partTimeRate:870, period:'semester', sourceUrl:'https://college.example/campus-rates'}};
  assert.equal(facts.priceText(online), '$410–$475 per credit ($410 at 12+ credits per semester)');
  assert.equal(facts.fitFacts(online).billing, 'per-credit');
  assert.equal(facts.fitFacts(online).termLabel, 'semester');
  assert.equal(facts.priceText(campus), '$12,695 per semester (12–18 credits); $870 per credit below 12');
  assert.equal(facts.fitFacts(campus).billing, 'flat-term');
  assert.equal(facts.fitsFilters(facts.fitFacts(campus), {billing:'subscription'}), false);
  assert.doesNotMatch(facts.priceText(campus), /unlimited|overload|self-paced/i);
  assert.equal(facts.priceText({pricing:{...campus.pricing, bandMax:11}}), 'Tuition needs confirmation');
  assert.equal(facts.priceText({pricing:{...online.pricing, fullTimeRate:0}}), 'Tuition needs confirmation');
  assert.equal(facts.fitFacts({pricing:{model:'annual', amount:10000, period:'year'}}).billing, 'annual');
  assert.equal(facts.fitFacts({pricing:{model:'tuition-per-credit-or-term', amount:1000, period:'term'}}).billing, null);
  for (const model of ['toString', 'constructor', '__proto__']) assert.equal(facts.fitFacts({pricing:{model, amount:1000, period:'term'}}).billing, null);
});

test('program pricing scope remains exact even at a school with one subscription family', () => {
  const school = {paceModels:['competency-subscription'], pricing:{model:'subscription', amount:3500, period:'24 weeks', programIds:['included'], sourceUrl:'https://college.example/reviewed-rate'}};
  assert.equal(facts.fitFacts({id:'included', paceModel:'competency-subscription'}, school).billing, 'subscription');
  assert.equal(facts.fitFacts({id:'excluded', paceModel:'competency-subscription'}, school).billing, null);
  assert.equal(facts.priceText({id:'excluded', paceModel:'competency-subscription'}, school), 'Tuition needs confirmation');
  assert.equal(facts.fitFacts({id:'excluded', pricing:{model:'per-credit', amount:300, period:'credit'}}, school).billing, 'per-credit');
});

test('fit evidence cites exact program and price facts without selecting a random school source', () => {
  const program = {url:'https://college.example/exact-degree', paceModel:'self-paced', paceSourceUrl:'https://college.example/exact-format', paceSourceIds:['format-review','format-review'], paceCheckedOn:'2026-11-24', pricing:{model:'per-credit', amount:300, period:'credit', sourceUrl:'https://college.example/exact-price', sourceIds:['price-review'], checkedOn:'2026-11-19'}};
  const before = JSON.stringify(program), fit = facts.fitFacts(program, {sources:[{url:'https://wrong.example/unrelated'}]});
  assert.deepEqual(fit.sources.learning, {url:'https://college.example/exact-format', sourceIds:['format-review'], checkedOn:'2026-11-24'});
  assert.deepEqual(fit.sources.billing, {url:'https://college.example/exact-price', sourceIds:['price-review'], checkedOn:'2026-11-19'});
  assert.equal(facts.fitFacts({url:'https://college.example/exact-degree', selfPaced:true}).sources.learning.url, 'https://college.example/exact-degree');
  assert.equal(facts.fitFacts({selfPaced:true}, {sources:[{url:'https://wrong.example/unrelated'}]}).sources.learning.url, '');
  assert.equal(facts.fitFacts({...program, paceCheckedOn:'2026-02-30'}).sources.learning.checkedOn, null);
  assert.equal(facts.fitFacts({...program, paceSourceUrl:'javascript:alert(1)'}).sources.learning.url, 'https://college.example/exact-degree');
  assert.equal(JSON.stringify(program), before);
});

test('degree details can show bound index facts rather than stale parent labels, with escaped text and safe sources', () => {
  const program = {id:'child', level:'bachelor', url:'https://college.example/exact-degree', paceModel:'course-term', pricing:{model:'per-credit', amount:300, period:'credit'}};
  const before = JSON.stringify(program), fit = facts.fitFacts({url:program.url, competencyBased:true, selfPaced:true, pricing:{model:'subscription', amount:3500, period:'24 weeks', sourceUrl:'https://college.example/child-price'}});
  const html = facts.detailsHTML(program, null, fit);
  assert.match(html, /Competency-based \(CBE\)/);
  assert.match(html, /Tuition billing<\/dt><dd>Subscription/);
  assert.match(html, /\$3,500 per 24 weeks/);
  assert.match(html, /Self-paced/);
  assert.doesNotMatch(html, /Courses follow a term schedule|\$300 per credit/);
  assert.match(html, /https:\/\/college\.example\/child-price/);
  assert.match(html, /Learning format source/);
  const untrusted = facts.detailsHTML(program, null, {...fit, tuitionLabel:'<img src=x onerror=alert(1)>', paceLabel:'<script>alert(1)</script>', sources:{billing:{url:'javascript:alert(1)'}, learning:{url:'https://user:password@wrong.example/'}}});
  assert.doesNotMatch(untrusted, /<img|<script|href="javascript:|href="https:\/\/user:/);
  assert.match(untrusted, /&lt;img/);
  const unknown = facts.detailsHTML({url:program.url, modalities:['online']});
  assert.doesNotMatch(unknown, /Learning model|Tuition billing/);
  assert.equal(JSON.stringify(program), before);
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

test('discovery credit-source filters use the same exact-program and graduate policies as details', () => {
  const phoenix=research.schools.find(s=>s.id==='university-of-phoenix');
  const mba=phoenix.programs.find(p=>p.id==='phoenix-cb-mba');
  assert.equal(facts.transferPolicyFor(mba,phoenix,'ace').status,'not-accepted');
  assert.equal(facts.transferPolicyFor(mba,phoenix,'nccrs').status,'not-accepted');
  const umass=research.schools.find(s=>s.id==='umass-global');
  const graduate=umass.programs.find(p=>p.id==='umass-mypath-mba');
  assert.equal(facts.transferPolicyFor(graduate,umass,'institutional').maximumCredits,12);
  assert.notEqual(facts.transferPolicyFor(graduate,umass,'ace').status,'accepted');
  assert.equal(facts.transferPolicyFor({level:'bachelor',transferPolicy:{ace:{status:'not-accepted'}}},{transferPolicy:{ace:{status:'accepted'}}},'ace').status,'not-accepted');
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
