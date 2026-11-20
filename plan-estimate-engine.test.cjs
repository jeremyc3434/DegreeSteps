const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Estimate=require('./dist/plan-estimate-engine.js'),Planner=require('./dist/planner.js'),Cost=require('./dist/cost-engine.js');
const registry=require('./dist/data/curriculum-registry.json'),baselines=require('./dist/data/baseline-index.json'),rates=require('./dist/data/plan-estimate-rates.json');
const ids=['liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential','curriculum-wgu-catalog-ecceaa488637ac83'];
function fixture(id=ids[0],changes={}){
 const row=registry.models.find(item=>item.id===id),pack=JSON.parse(fs.readFileSync('dist/'+row.path,'utf8')),program=(pack.models||[pack]).find(item=>item.id===id),baseline=Object.values(baselines.baselines).find(item=>item.modelId===id);
 const selections={...Object.fromEntries(baseline.rows.map(item=>[item.requirementId,item.optionId])),...changes};
 const providers=[...new Set(program.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))];
 const plan=Planner.generate(program,{providers,priority:'transfer',allowConditional:true,completed:[],optionSelections:selections});
 return{program,plan,rates};
}

test('reviewed rate sources and named university fee components reconcile, without turning exclusions into zero',()=>{
 assert.equal(Estimate.assertRates(rates),rates);assert.equal(rates.entries.length,9);
 for(const entry of rates.entries){
  assert.equal(entry.feeBreakdown.filter(row=>row.frequency==='per-term').reduce((sum,row)=>sum+row.amount,0),entry.feesPerTerm);
  assert.equal(entry.feeBreakdown.filter(row=>row.frequency==='one-time').reduce((sum,row)=>sum+row.amount,0),entry.oneTimeFees);
 }
 assert(rates.exclusions.some(value=>/tax/i.test(value)));
});

test('all four exact researched routes produce source-backed known-charge ranges without modifying the academic ledger',()=>{
 for(const id of ids){
  const f=fixture(id),before=JSON.stringify(f),result=Estimate.calculate(f);
  assert.equal(result.available,true,id+': '+result.reason);assert.equal(result.status,'planning-range');
  assert.equal(result.costs.complete,false);assert(result.costs.knownRange.min>0&&result.costs.knownRange.max>=result.costs.knownRange.min);
  assert.equal(result.counts.totalUnits,f.program.totalCredits);
  assert.equal(result.counts.outsideUnits,result.counts.totalUnits-result.counts.universityUnits);
  assert.equal(result.counts.finishedUnits,0);assert(result.costs.missing.length>0);assert(result.sources.length>=3);
  assert(result.timing.assumptions.some(value=>/planning assumption/.test(value)));assert(result.notes.some(value=>/not a complete cost of attendance/.test(value)));
  assert.equal(JSON.stringify(f),before,'Estimates do not award credits or change saved academic facts');
 }
});

test('Liberty campus bills the actual 37 university credits and all known semester and completion fees',()=>{
 const f=fixture(),result=Estimate.calculate(f);
 assert.deepEqual([result.counts.outsideUnits,result.counts.remainingUniversityUnits],[83,37]);
 assert.deepEqual(result.timing.universityTerms,{min:3,max:4});assert.equal(result.timing.totalMonths,null,'No invented campus calendar finish date');
 assert.deepEqual(result.costs.universityFees,{min:1990,max:2620});
 assert.deepEqual(result.costs.knownRange,{min:29314,max:43176});
 const clep=result.costs.providerBreakdown.find(item=>item.provider==='CLEP');assert.equal(clep.courses,1);assert.equal(clep.cost.min,97);
 assert(result.costs.missing.some(value=>/CLEP.*administration/.test(value)));
});

test('WGU prices the actual 110-CU Business Management degree and term fees, without a 120-credit comparison substitution',()=>{
 const f=fixture(ids[3]),result=Estimate.calculate(f);
 assert.equal(result.counts.creditSystem,'competency-unit');assert.deepEqual([result.counts.totalUnits,result.counts.outsideUnits,result.counts.remainingUniversityUnits],[110,69,41]);
 assert.deepEqual(result.timing.universityTerms,{min:2,max:4});assert.equal(result.timing.universityTermMonths,6);
 assert.deepEqual(result.costs.universityTuition,{min:7700,max:15400});assert.deepEqual(result.costs.universityFees,{min:465,max:865});
 assert.deepEqual(result.costs.knownRange,{min:9169,max:18036});
 assert.deepEqual(result.timing.totalMonths,{min:19,max:36});assert.equal(result.counts.remainingOutsideCourses,23);
 const wrong=structuredClone(f);wrong.program.totalCredits=120;assert.equal(Estimate.calculate(wrong).reasonCode,'degree-rate-mismatch');
});

test('the separate HR rate binding preserves its 117-CU edition and uses the HR-specific current tuition source',()=>{
 const id='curriculum-wgu-catalog-2e49db64c32dfc79',entry=registry.models.find(item=>item.id===id),pack=JSON.parse(fs.readFileSync('dist/'+entry.path,'utf8')),program=pack.models.find(item=>item.id===id);
 const plan=Planner.generate(program,{providers:['Sophia','Study.com'],priority:'transfer',allowConditional:true,completed:[]}),result=Estimate.calculate({program,plan,rates});
 assert.equal(result.available,true,result.reason);assert.equal(result.counts.totalUnits,117);assert.equal(result.counts.creditSystem,'competency-unit');assert.equal(result.rateEntryId,'wgu-human-resource-management-reviewed');
 assert.equal(result.costs.universityTuition.min,result.timing.universityTerms.min*3850);assert.equal(result.costs.universityTuition.max,result.timing.universityTerms.max*3850);
 assert.equal(result.costs.universityFees.min,result.timing.universityTerms.min*200+65);assert.equal(result.costs.universityFees.max,result.timing.universityTerms.max*200+65);
 assert(result.sources.some(source=>source.id==='wgu-hr-tuition'));assert(!result.sources.some(source=>source.id==='wgu-business-tuition'));
 const wrong=structuredClone(program);wrong.catalog='202605';assert.equal(Estimate.calculate({program:wrong,plan,rates}).reasonCode,'degree-rate-mismatch');
 assert.equal(result.costs.complete,false,'A price model does not promote the route or establish a complete cost of attendance');
});

test('Liberty Healthcare uses the exact online bachelor ledger and standard undergraduate price, with applicable course charges still explicit',()=>{
 const id='curriculum-liberty-healthcare-administration-bs-online',entry=registry.models.find(item=>item.id===id),pack=JSON.parse(fs.readFileSync('dist/'+entry.path,'utf8')),program=(pack.models||[pack]).find(item=>item.id===id);
 const plan=Planner.generate(program,{providers:['Sophia','Study.com','CLEP'],priority:'transfer',allowConditional:true,completed:[]}),result=Estimate.calculate({program,plan,rates});
 assert.equal(result.available,true,result.reason);assert.equal(result.rateEntryId,'liberty-online-2026-27');
 assert.deepEqual([result.counts.totalUnits,result.counts.outsideUnits,result.counts.remainingUniversityUnits],[120,72,48]);
 const fixed=Estimate.calculate({program,plan,rates,assumptions:{universityUnitsPerTermMin:18,universityUnitsPerTermMax:18}});
 assert.deepEqual(fixed.timing.universityTerms,{min:3,max:3});assert.deepEqual(fixed.costs.universityTuition,{min:48*410,max:48*410},'The final twelve-credit semester qualifies for the published full-time rate');assert.deepEqual(fixed.costs.universityFees,{min:3*349+100,max:3*349+100});
 assert(result.sources.some(source=>source.id==='liberty-online-tuition-fees'));assert(!result.sources.some(source=>source.id==='liberty-campus-fees'));
 assert(result.costs.missing.some(value=>/course-specific charges/.test(value)));assert.equal(result.costs.complete,false);
 const wrong=structuredClone(program);wrong.format='Residential';assert.equal(Estimate.calculate({program:wrong,plan,rates}).reasonCode,'degree-rate-mismatch');
});

test('the reviewed Psychology route prices its retained UNIV 104 and actual 42 Liberty credits',()=>{
 const id='curriculum-liberty-psychology-bs-online',entry=registry.models.find(item=>item.id===id),pack=JSON.parse(fs.readFileSync('dist/'+entry.path,'utf8')),program=pack.models.find(item=>item.id===id);
 const plan=Planner.generate(program,{providers:['Sophia','Study.com','CLEP'],priority:'transfer',allowConditional:true,completed:[]}),result=Estimate.calculate({program,plan,rates});
 assert.equal(result.available,true,result.reason);assert.equal(result.rateEntryId,'liberty-online-2026-27');assert.deepEqual([result.counts.totalUnits,result.counts.outsideUnits,result.counts.remainingUniversityUnits],[120,78,42]);
 assert.equal(program.requirements.find(row=>row.id==='univ-104').credits,3,'Pricing cannot invent a personal waiver');
 const fixed=Estimate.calculate({program,plan,rates,assumptions:{universityUnitsPerTermMin:18,universityUnitsPerTermMax:18}});
 assert.deepEqual(fixed.timing.universityTerms,{min:3,max:3});
 assert.deepEqual(fixed.costs.universityTuition,{min:36*410+6*475,max:36*410+6*475},'The final six-credit semester uses the published part-time rate');
 assert.deepEqual(fixed.costs.universityFees,{min:3*349+100,max:3*349+100});assert.equal(result.costs.complete,false);
});

test('tuition changes follow actual selected sources rather than the maximum transfer allowance',()=>{
 const base=fixture(),row=base.program.requirements.find(item=>item.id==='engl-101'),university=row.options.find(item=>item.provider==='University');
 const changed=fixture(ids[0],{[row.id]:university.id}),a=Estimate.calculate(base),b=Estimate.calculate(changed);
 assert.deepEqual([b.counts.outsideUnits,b.counts.remainingUniversityUnits],[80,40]);
 assert.equal(b.counts.remainingOutsideCourses,a.counts.remainingOutsideCourses-1);
 assert(b.costs.knownRange.min>a.costs.knownRange.min);
 assert.equal(a.counts.totalUnits,b.counts.totalUnits);
});

test('finished outside courses are not bought or scheduled a second time, while school acceptance stays separate',()=>{
 const f=fixture(ids[1]),before=Estimate.calculate(f),first=f.plan.rows.find(row=>row.option.provider==='Sophia');
 first.status='reported';
 const after=Estimate.calculate(f);assert.equal(after.available,true,after.reason);
 assert.equal(after.counts.finishedUnits,first.credits);assert.equal(after.counts.remainingOutsideCourses,before.counts.remainingOutsideCourses-1);
 assert(after.costs.outsideCourses.min<=before.costs.outsideCourses.min);
 assert(after.notes.some(value=>/school acceptance of reported credit remains separate/.test(value)));
});

test('Sophia prices the cheapest published membership combination, including prepaid coverage, without coupons',()=>{
 const exactFourMonths=Estimate.calculate({...fixture(),assumptions:{outsideCoursesPerMonthMin:5.5,outsideCoursesPerMonthMax:5.5}});
 const four=exactFourMonths.costs.providerBreakdown.find(item=>item.provider==='Sophia');
 assert.deepEqual(four.months,{min:4,max:4});assert.deepEqual(four.cost,{min:299,max:299});
 const slower=Estimate.calculate({...fixture(),assumptions:{outsideCoursesPerMonthMin:2,outsideCoursesPerMonthMax:2}}),eleven=slower.costs.providerBreakdown.find(item=>item.provider==='Sophia');
 assert.deepEqual(eleven.months,{min:11,max:11});assert.deepEqual(eleven.cost,{min:799,max:799});
 assert(slower.notes.some(value=>/Prepaid plans require the upfront payment/.test(value)));
 assert.equal(exactFourMonths.costs.complete,false);
});

test('an unpriced selected provider leaves a partial range and an explicit price omission',()=>{
 const f=fixture(),req=f.program.requirements.find(row=>row.options.some(option=>option.provider==='StraighterLine'));
 const selected=req.options.find(option=>option.provider==='StraighterLine');
 const changed=fixture(ids[0],{[req.id]:selected.id}),result=Estimate.calculate(changed);
 assert.equal(result.available,true,result.reason);assert.equal(result.status,'partial-range');
 assert(result.costs.missing.some(note=>/StraighterLine membership and individual course charges are not included/.test(note)));
 assert.equal(result.costs.outsideCourses,null,'An unpriced basket must not be displayed as zero outside-course cost');
 assert(result.sources.some(source=>source.id==='straighterline-membership-course-pricing'));
 assert.equal(result.costs.providerBreakdown.find(item=>item.provider==='StraighterLine').cost,null);
 assert.equal(result.costs.complete,false);
});

test('personal pace can model part-time semesters and faster competency study while preserving billing units',()=>{
 const campus=Estimate.calculate({...fixture(),assumptions:{outsideCoursesPerMonthMin:4,outsideCoursesPerMonthMax:8,universityUnitsPerTermMin:6,universityUnitsPerTermMax:6}});
 assert.equal(campus.available,true);assert.deepEqual(campus.timing.universityTerms,{min:7,max:7});
 assert.equal(campus.costs.universityTuition.min,37*870);assert.equal(campus.costs.universityFees.min,7*630+100);
 const wgu=Estimate.calculate({...fixture(ids[3]),assumptions:{universityUnitsPerTermMin:41,universityUnitsPerTermMax:41}});
 assert.equal(wgu.available,true);assert.deepEqual(wgu.timing.universityTerms,{min:1,max:1});assert.deepEqual(wgu.costs.universityTuition,{min:3850,max:3850});
 assert.deepEqual(wgu.costs.universityFees,{min:265,max:265});
 for(const assumptions of [{outsideCoursesPerMonthMin:0},{outsideCoursesPerMonthMax:'4'},{outsideCoursesPerMonthMin:8,outsideCoursesPerMonthMax:4},{universityUnitsPerTermMax:19},{universityUnitsPerTermMin:1.5},{overrideTuition:1}])assert.equal(Estimate.calculate({...fixture(),assumptions}).available,false);
});

test('wrong editions, formats, sources or broken ledgers cannot acquire a credible-looking cost range',()=>{
 for(const edit of [f=>f.program.catalog='2027-2028',f=>f.program.format='Online',f=>f.program.school='Another school',f=>f.program.creditSystem='competency-unit',f=>f.plan.programId='another-plan']){
  const f=fixture();edit(f);assert.equal(Estimate.calculate(f).available,false);
 }
 for(const edit of [f=>f.plan.rows.push(f.plan.rows[0]),f=>f.plan.rows[0].option.code='FORGED',f=>f.plan.rows[0].credits++,f=>f.plan.rows[0].unknownProvenance=true,f=>f.plan.validation.academicCountsValid=false]){
  const f=fixture();edit(f);assert.equal(Estimate.calculate(f).available,false);
 }
 for(const edit of [r=>r.sources[0].url='javascript:alert(1)',r=>r.sources[0].checkedOn='2026-02-30',r=>r.entries[0].feesPerTerm=0,r=>r.entries[0].oneTimeFees=-1,r=>r.entries[0].tuition.termRate=0,r=>r.providers[0].amount=-1,r=>r.providers[0].packages[0].months=0,r=>r.entries[1].modelIds.push(ids[0])]){
  const r=structuredClone(rates);edit(r);assert.throws(()=>Estimate.assertRates(r));assert.equal(Estimate.calculate({...fixture(),rates:r}).available,false);
 }
});

test('the reviewed data generator reproduces the browser rate file without network or private records',async()=>{
 const {buildPlanEstimateRates}=await import('./scripts/build-plan-estimate-rates.mjs');
 const result=await buildPlanEstimateRates({check:true});assert.equal(result.exactModels,14);assert.equal(result.check,true);
 const source=fs.readFileSync('dist/plan-estimate-engine.js','utf8');
 assert(!/\b(?:fetch|localStorage|sessionStorage|indexedDB)\s*[.(]/.test(source));
});
