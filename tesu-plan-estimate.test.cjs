/* Academic approval and price review are independent. Use the exact current TESU course basket. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const Planner=require('./dist/planner.js'),Estimate=require('./dist/plan-estimate-engine.js'),View=require('./dist/plan-estimate-view.js');
const registry=require('./dist/data/curriculum-registry.json'),rates=require('./dist/data/plan-estimate-rates.json'),baselines=require('./dist/data/baseline-index.json');
const review=require('./content/estimates/tesu-rate-bindings-reviewed-2026-11-25.json');
function fixture(id='curriculum-tesu-bsba-accounting'){
 const row=registry.models.find(m=>m.id===id),pack=JSON.parse(fs.readFileSync('dist/'+row.path)),program=(pack.models||[pack]).find(m=>m.id===id),baseline=Object.values(baselines.baselines).find(b=>b.modelId===id);
 const providers=[...new Set(program.requirements.flatMap(row=>row.options.map(o=>o.provider)).filter(p=>p!=='University'))];
 const plan=Planner.generate(program,{providers,priority:'transfer',allowConditional:true,completed:[],...(baseline?{optionSelections:Object.fromEntries(baseline.rows.map(r=>[r.requirementId,r.optionId]))}:{})});
 return {program,plan,rates};
}
test('TESU tuition and required fees retain the actual primary response, review date and source hash',()=>{
 assert.equal(review.checkedOn,'2026-11-25');assert.equal(review.modelIds.length,6);
 const entry=rates.entries.find(e=>e.id===review.rateEntryId);assert.deepEqual(entry.modelIds,review.modelIds);
 for(const source of review.sources){
  assert.equal(source.reviewBasis.httpStatus,200);const bytes=fs.readFileSync(source.reviewBasis.document);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.reviewBasis.sha256);
  assert.deepEqual(rates.sources.find(s=>s.id===source.id),source);
 }
 const tuition=fs.readFileSync(review.sources[0].reviewBasis.document,'utf8'),fees=fs.readFileSync(review.sources[1].reviewBasis.document,'utf8');
 assert.match(tuition,/Out-of-state residents\s+\$4,652/);assert.match(tuition,/Out-of-state Residents\s+\$584/);
 assert.match(tuition,/9 to 18 credits per term/);assert.match(tuition,/effective August 2026/);
 assert.match(fees,/Application\s+\$50/);assert.match(fees,/Graduation Audit Fee\*\*\s+\$98/);
 assert.deepEqual(entry.feeBreakdown.map(f=>f.amount),[50,98]);assert.equal(entry.oneTimeFees,148);
 assert.equal(rates.sources.find(s=>s.id==='study-pricing').checkedOn,'2026-11-19','A new TESU review does not refresh an unrelated Study.com source');
});
for(const id of review.modelIds)test('source-bound remaining-cost range for exact TESU degree '+id,()=>{
 const f=fixture(id),before=JSON.stringify(f),result=Estimate.calculate(f);
 assert.equal(result.available,true,result.reason);assert.equal(result.rateEntryId,review.rateEntryId);
 assert.equal(result.rateScope,'Standard out-of-state undergraduate tuition · non-military');
 assert.equal(result.counts.totalUnits,120);assert.equal(result.counts.remainingUniversityUnits,f.plan.rows.filter(r=>r.option.provider==='University').reduce((n,r)=>n+r.credits,0));
 assert.equal(result.costs.complete,false);assert.equal(result.timing.totalMonths,null,'No tuition term duration is invented from an academic calendar');
 assert.deepEqual(result.costs.universityFees,{min:148,max:148});assert(result.costs.knownRange.min>0);assert(result.sources.some(s=>s.id==='tesu-tuition-2026-11-25'));
 assert(result.notes.some(n=>/New Jersey\/Pennsylvania/.test(n)));assert(result.notes.some(n=>/Edison Accelerate/.test(n)));assert(result.notes.some(n=>/TECEP and portfolio/.test(n)));
 assert.match(View.render(result),/Standard out-of-state undergraduate tuition · non-military/);assert.match(View.render(result,{compact:true}),/Standard out-of-state/);
 assert.match(View.render(result),/terms/);assert.equal(JSON.stringify(f),before,'Price calculation does not change academic approvals, course allocations or progress');
});
test('TESU bills the published named university coursework beyond its fifteen-credit residency minimum',()=>{
 const f=fixture(),result=Estimate.calculate(f),baseline=Object.values(baselines.baselines).find(row=>row.modelId===f.program.id),universityRows=f.plan.rows.filter(row=>row.option.provider==='University');
 assert.equal(baseline.researchStatus,'research-ready');assert.equal(baseline.summary.transferCredits,63);assert.equal(baseline.summary.universityCredits,57);
 assert.equal(universityRows.reduce((sum,row)=>sum+row.credits,0),57);assert(universityRows.every(row=>row.option.code&&!row.option.selectionRequired&&baseline.rows.some(pin=>pin.requirementId===row.requirementId&&pin.optionId===row.option.id&&pin.credits===row.credits)));
 assert.equal(f.program.institutionMinCredits,15);assert.equal(result.counts.remainingUniversityUnits,57);
 // At the reviewed9–15 credit loads: four full-price terms is the minimum;
 // six9-credit terms plus one3-credit part-time term is the maximum.
 assert.deepEqual(result.costs.universityTuition,{min:4*4652,max:6*4652+3*584});assert.deepEqual(result.timing.universityTerms,{min:4,max:7});
 const perCredit=Estimate.calculate({...f,assumptions:{universityUnitsPerTermMin:3,universityUnitsPerTermMax:3}});
 assert.deepEqual(perCredit.costs.universityTuition,{min:57*584,max:57*584});assert.deepEqual(perCredit.timing.universityTerms,{min:19,max:19});
 assert.deepEqual(perCredit.costs.universityFees,{min:148,max:148});
});
test('TESU completed coursework reduces both new tuition and provider purchases without claiming a school award',()=>{
 const f=fixture(),before=Estimate.calculate(f),university=f.plan.rows.find(r=>r.option.provider==='University'),outside=f.plan.rows.find(r=>r.option.provider!=='University');
 university.status='reported';outside.status='reported';const after=Estimate.calculate(f);
 assert.equal(after.available,true,after.reason);assert.equal(after.counts.remainingUniversityUnits,before.counts.remainingUniversityUnits-university.credits);
 assert.equal(after.counts.remainingOutsideCourses,before.counts.remainingOutsideCourses-1);assert.equal(after.counts.finishedUnits,university.credits+outside.credits);
 const fixed=Estimate.calculate({...f,assumptions:{universityUnitsPerTermMin:3,universityUnitsPerTermMax:3}});
 assert.equal(fixed.costs.universityTuition.min,(before.counts.remainingUniversityUnits-university.credits)*584);
 assert(after.notes.some(n=>/school acceptance of reported credit remains separate/.test(n)));
});
test('a different TESU residency scenario or degree edition cannot inherit the standard-residency quote',()=>{
 for(const patch of [{institutionMinCredits:6},{institutionMinCredits:24},{catalog:'2027-2028'},{format:'Residential'},{totalCredits:123}]){
  const f=fixture();Object.assign(f.program,patch);const result=Estimate.calculate(f);assert.equal(result.available,false,JSON.stringify(patch));
  assert.equal(result.reasonCode,Object.hasOwn(patch,'institutionMinCredits')?'residency-rate-mismatch':'degree-rate-mismatch');
 }
});
test('rate scope and scenario notes reject invalid shapes, and the view escapes user-visible scope',()=>{
 const source=rates.entries.find(e=>e.id===review.rateEntryId);
 for(const patch of [{populationLabel:''},{notes:['']},{institutionMinimumUnits:-1},{institutionMinimumUnits:121}]){
  const copy=structuredClone(rates);Object.assign(copy.entries.find(e=>e.id===source.id),patch);assert.throws(()=>Estimate.assertRates(copy));
 }
 const estimate=Estimate.calculate(fixture());estimate.rateScope='<img src=x onerror=alert(1)>';
 assert.match(View.render(estimate),/&lt;img/);assert(!View.render(estimate).includes('<img'));
});
