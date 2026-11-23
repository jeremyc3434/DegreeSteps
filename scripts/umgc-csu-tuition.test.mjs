import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Estimate=require('../dist/plan-estimate-engine.js');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const rates=read('content/estimates/plan-estimate-rates.json'),index=read('dist/data/plan-library-index.json');
const capture=file=>readFileSync(new URL('../content/source-captures/'+file+'.txt',import.meta.url),'utf8').replace(/\s+/g,' ');
const schools={'University of Maryland Global Campus':'umgc','Columbia Southern University':'columbia-southern'};

test('every published UMGC and Columbia Southern plan has exactly one reviewed estimate entry and a planning range',()=>{
  assert.equal(Estimate.assertRates(rates),rates);
  const plans=Object.values(index.plans).filter(plan=>/^curriculum-(umgc|columbia-southern)-/.test(plan.modelId));
  assert.ok(plans.length>=35);
  for(const plan of plans){
    const entries=rates.entries.filter(entry=>entry.modelIds.includes(plan.modelId));
    assert.equal(entries.length,1,plan.modelId);
    assert.ok(Object.hasOwn(schools,entries[0].school));
    assert.ok(plan.estimate&&plan.estimate.min>0&&plan.estimate.max>=plan.estimate.min&&!plan.estimate.partial,plan.modelId);
  }
});

test('the rates and fees used are the ones printed on the captured school pages',()=>{
  const umgc=capture('d99c671e6d71d759'),csu=capture('ce1320e395ba226d'),csuSite=capture('9916265b088c1e95'),csuTerms=capture('5418c128c8ace48f');
  assert.match(umgc,/Out-of-State Tuition Rates Summer 2026 Fall 2026 Winter 2027 Spring 2027 Standard Undergraduate Programs \$499 per credit/);
  assert.match(umgc,/Technology Fee \$15 per credit/);
  assert.match(umgc,/Application for Admission Fee, Undergraduate and Graduate \* \$50/);
  assert.match(umgc,/Diploma or Certificate Fee ‡ \$50/);
  assert.match(csu,/Undergraduate \$278\.00/);
  assert.match(csu,/Undergraduate \(per course\) \$35/);
  assert.match(csu,/Petition to Graduate \$100/);
  assert.match(csuSite,/\$278/);
  assert.match(csuTerms,/4 terms, 36 weeks of instruction/);
  const by=school=>rates.entries.filter(entry=>entry.school===school);
  for(const entry of by('University of Maryland Global Campus')){assert.equal(entry.tuition.rate,499);assert.equal(entry.feesPerUnit,15);assert.equal(entry.oneTimeFees,100);}
  for(const entry of by('Columbia Southern University')){assert.equal(entry.tuition.rate,278);assert.equal(entry.feesPerUnit,11.67);assert.equal(entry.oneTimeFees,100);}
});

test('a hand-checked estimate: Columbia Southern B.S. Accounting and UMGC B.S. Accounting',()=>{
  const csu=index.plans['columbia-southern-b-s-accounting'],umgc=index.plans['umgc-bachelor-of-science-in-accounting'];
  // 81 CSU credits × $278 + 81 × $11.67 technology + $100 petition, plus Sophia $299–$596.
  assert.deepEqual({university:csu.start.university,estimate:csu.estimate},{university:81,estimate:{min:23862.27,max:24159.27}});
  // 90 UMGC credits × $499 + 90 × $15 technology + $50 application + $50 diploma, plus Sophia $297–$398.
  assert.deepEqual({university:umgc.start.university,estimate:umgc.estimate},{university:90,estimate:{min:46657,max:46758}});
});
