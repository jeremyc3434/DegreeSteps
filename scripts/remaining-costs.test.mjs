import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Estimate=require('../dist/plan-estimate-engine.js');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const rates=read('content/estimates/plan-estimate-rates.json'),index=read('dist/data/plan-library-index.json');
const capture=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\s+/g,' ');

test('every published plan except the documented GCU exception has a planning estimate',()=>{
  assert.equal(Estimate.assertRates(rates),rates);
  const missing=Object.entries(index.plans).filter(([,plan])=>!plan.estimate).map(([id])=>id).sort();
  // GCU's Sophia options award 3 credits against 4-credit native requirements, which the estimate engine does not price;
  // tesu-general-management is an unpublished model.
  assert.deepEqual(missing,['gcu-bsba-campus','tesu-general-management']);
});

test('every rate added on 2026-11-23 quotes text that appears on its captured page',()=>{
  const added=rates.sources.filter(source=>source.reviewBasis?.quotes);
  assert.ok(added.length>=12);
  for(const source of added){
    const text=capture(source.reviewBasis.capture);
    for(const quote of source.reviewBasis.quotes)assert.ok(text.includes(quote.replace(/\s+/g,' ')),source.id+': '+quote);
  }
  const by=id=>rates.entries.find(entry=>entry.id===id);
  assert.equal(by('tesu-online-2026-27').tuition.termRate,4652);
  assert.equal(by('tesu-online-2026-27').tuition.partTimeRate,584);
  assert.equal(by('liberty-online-2026-27-60').tuition.fullTimeRate,410);
  assert.deepEqual(['wgu-computer-science-2026-11','wgu-accounting-2026-11','wgu-software-engineering-2026-11','wgu-it-management-2026-11','wgu-information-technology-2026-11'].map(id=>by(id).tuition.termRate),[4125,3850,4125,3850,3925]);
  assert.equal(by('phoenix-cb-mba-2026-27').tuition.rate,300);
  assert.equal(by('phoenix-da-msp-2026-27').tuition.termRate,2749);
});

test('hand-checked estimates: TESU B.A. Psychology, Liberty Psychology A.A. online, Phoenix M.S. Psychology',()=>{
  // TESU: 48 TESU credits at 12/term = 4 × $4,652 = $18,608; at 9/term = 5 × $4,652 + 3 × $584 = $25,012; + $148 fees; Sophia $497–$799.
  assert.deepEqual(index.plans['tesu-ba-psychology'].estimate,{min:19253,max:25959});
  // Liberty: 21 credits as 18+3 = $8,805 or 12+9 = $9,195; fees 2 × $349 + $100 = $798; Study.com 4–7 months × $235.
  assert.deepEqual(index.plans['liberty-catalog-c8df4d8834411386-online'].estimate,{min:10543,max:11638});
  // Phoenix Direct Assessment: 36 units at 9 or 6 per 12-week term = 4–6 terms × $2,749.
  assert.deepEqual(index.plans['phoenix-da-ms-psychology'].estimate,{min:10996,max:16494});
  // Phoenix CB MBA: 33 credits × $300, no fees.
  assert.deepEqual(index.plans['phoenix-cb-mba'].estimate,{min:9900,max:9900});
});
