import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async file=>JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));
test('MyPath historical price quotes cannot leak into current pricing or separate credit-hour degree models',async()=>{
 const [discovery,library]=await Promise.all([read('dist/data/program-catalog.json'),read('dist/data/plan-library-index.json')]);
 const mypath=discovery.programs.filter(p=>p.schoolId==='umass-global'&&['associate','bachelor'].includes(p.level));
 assert.equal(mypath.length,3);
 for(const program of mypath){
  assert.equal(program.effectivePricing.amount,null);assert.equal(program.effectivePricing.reviewStatus,'current-year-not-verified');
  assert(program.effectivePricing.historicalQuotes.some(quote=>quote.amount===3500&&quote.academicYear==='2025-2026'));
 }
 const creditHour=Object.values(library.plans).filter(p=>p.modelId?.startsWith('curriculum-umass-global-'));
 assert.equal(creditHour.length,6);
 for(const route of creditHour){assert.equal(route.fit.selfPaced,false);assert.notEqual(route.fit.billing,'subscription');}
});
test('new Google ACE source totals never overwrite the retained receiving-school quantities or create personal awards',async()=>{
 const [source,receiving]=await Promise.all([read('dist/data/credit-sources.json'),read('content/pathway-kits/umpi/undergraduate-public-receiving-review-2026-11-26.json')]);
 const versions=source.sources.find(s=>s.id==='google-certificates').recommendationReview.records;
 for(const [aceId,original,awarded]of [['GOOG-0007',10,9],['GOOG-0008',7,6],['GOOG-0009',10,9]]){
  const current=versions.find(r=>r.aceId===aceId),row=receiving.rows.find(r=>r.normalizedAceCode===aceId);
  assert.equal(current.sourceCredits,original);assert.equal(current.version,2);assert.equal(current.recommendationEnd,'2026-11-30');
  assert.equal(row.targetUnits,awarded);assert.equal(row.originalCreditQuantity,null);assert.equal(row.originalIdentityIndependentlyReviewed,false);
 }
 assert.equal(receiving.publicationAllowed,false);assert.equal(receiving.studentRecordsIncluded,false);
});
