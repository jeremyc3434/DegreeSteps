/* Worksheet consistency: one planning range, the degree's own units, starting-route differences
   and sourced alternative residency rules. Synthetic and repository data only; no browser or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Sheet=require('./dist/sheet-state.js'),Estimate=require('./dist/plan-estimate-engine.js'),View=require('./dist/plan-estimate-view.js'),Planner=require('./dist/planner.js'),Savings=require('./dist/savings-engine.js'),CoursePlan=require('./dist/course-plan-view.js');
const rates=require('./dist/data/plan-estimate-rates.json'),registry=require('./dist/data/curriculum-registry.json'),baselines=require('./dist/data/baseline-index.json'),excelsior=require('./dist/data/curricula/excelsior.json'),prices=require('./dist/data/cost-comparisons.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function baselineFor(modelId){return Object.values(baselines.baselines).find(item=>item.modelId===modelId&&item.pathwayId===registry.models.find(model=>model.id===modelId).routeIds[0]);}
function startingRoute(modelId,dropProviders=[]){
 const row=registry.models.find(item=>item.id===modelId),pack=JSON.parse(fs.readFileSync('dist/'+row.path,'utf8')),program=(pack.models||[pack]).find(item=>item.id===modelId),baseline=baselineFor(modelId);
 const providers=[...new Set(baseline.rows.map(r=>r.provider).filter(p=>p&&p!=='University'))].filter(p=>!dropProviders.includes(p));
 const selections=Object.fromEntries(baseline.rows.filter(r=>!dropProviders.includes(r.provider)).map(r=>[r.requirementId,r.optionId]));
 return{program,baseline,providers,plan:Planner.generate(program,{providers,priority:'transfer',allowConditional:true,completed:[],optionSelections:selections})};
}

test('Excelsior is priced only from its retained per-credit tuition and itemized per-credit fees',()=>{
 const entry=rates.entries.find(item=>item.id==='excelsior-online-2026-11'),source=rates.sources.find(item=>item.id==='excelsior-undergraduate-tuition');
 assert.deepEqual(entry.modelIds.sort(),excelsior.models.map(model=>model.id).sort());
 for(const model of excelsior.models){
  assert.equal(model.pricing.model,'per-credit');assert.equal(entry.tuition.rate,model.pricing.amount);assert.equal(source.url,model.pricing.sourceUrl);
  for(const fee of model.pricing.fees)assert(entry.feeBreakdown.some(row=>row.label===fee.label&&row.amount===fee.amount&&row.frequency===(fee.per==='credit'?'per-unit':'one-time')),fee.label);
  assert.equal(entry.degreeUnits,model.totalCredits);assert.deepEqual(entry.catalogs,[model.catalogYear]);
 }
 const bytes=fs.readFileSync(source.reviewBasis.document);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.reviewBasis.sha256);
 const capture=bytes.toString('utf8');
 assert.match(capture,/Tuition \(non nursing programs\)\n\$510 per credit hour/);assert.match(capture,/Academic Services Fee\n\$40 per credit hour/);assert.match(capture,/Technology Fee\n\$28 per course credit/);assert.match(capture,/Graduation Fee\n\$125/);
 assert.equal(entry.feesPerUnit,68);assert.equal(entry.feesPerTerm,0);assert.equal(entry.oneTimeFees,125);
 assert(entry.missing.some(note=>/Partner tuition/.test(note)&&/15-Excelsior-credit/.test(note)));
});

test('the Excelsior starting route gets a planning range that charges tuition and fees on each remaining university credit and never prices StraighterLine at zero',()=>{
 const {program,plan}=startingRoute('curriculum-excelsior-bs-psychology'),before=JSON.stringify({program,plan});
 const result=Estimate.calculate({program,plan,rates});
 assert.equal(result.available,true,result.reason);assert.equal(result.rateEntryId,'excelsior-online-2026-11');
 assert.equal(result.counts.remainingUniversityUnits,42);
 assert.deepEqual(result.costs.universityTuition,{min:42*510,max:42*510});
 assert.deepEqual(result.costs.universityFees,{min:42*68+125,max:42*68+125});
 assert.equal(result.status,'partial-range','StraighterLine has no reviewed price, so the range is labelled partial');
 assert.equal(result.costs.providerBreakdown.find(item=>item.provider==='StraighterLine').cost,null);assert.equal(result.costs.outsideCourses,null);
 assert.equal(result.timing.termLabel,'trimester');assert.equal(result.timing.totalMonths,null,'No invented trimester length');
 assert.equal(JSON.stringify({program,plan}),before);
 const compact=View.render(result,{compact:true});assert.match(compact,/Planning estimate/);assert.match(compact,/trimesters/);assert.match(compact,/Some selected course prices are not included: StraighterLine/);
 const without=startingRoute('curriculum-excelsior-bs-psychology',['StraighterLine']),full=Estimate.calculate({program:without.program,plan:without.plan,rates});
 assert.equal(full.status,'planning-range');assert(full.costs.knownRange.min>result.costs.knownRange.min,'Moving 3 credits to Excelsior adds their tuition and fees');
});

test('per-unit university fees must reconcile with their named components',()=>{
 for(const edit of [r=>{r.entries.find(e=>e.id==='excelsior-online-2026-11').feesPerUnit=40;},r=>{r.entries.find(e=>e.id==='excelsior-online-2026-11').feesPerUnit=-1;},r=>{r.entries.find(e=>e.id==='excelsior-online-2026-11').feeBreakdown[0].frequency='per-week';}]){
  const value=clone(rates);edit(value);assert.throws(()=>Estimate.assertRates(value));
 }
 const legacy=clone(rates);for(const entry of legacy.entries)if(entry.feesPerUnit===undefined)assert(!entry.feeBreakdown.some(fee=>fee.frequency==='per-unit'));
 assert.equal(Estimate.assertRates(legacy),legacy);
});

test('the Liberty Criminal Justice Online worksheet range equals the plan-library range for its starting route',()=>{
 const index=require('./dist/data/plan-library-index.json').plans['liberty-criminal-justice-online'].estimate;
 const {program,plan}=startingRoute('liberty-criminal-justice-online'),result=Estimate.calculate({program,plan,rates});
 assert.deepEqual({min:result.costs.knownRange.min,max:result.costs.knownRange.max},index);
 const compact=View.render(result,{compact:true});assert.match(compact,/Planning estimate/);assert.match(compact,/covers tuition, listed fees and outside courses/);
 assert.doesNotMatch(compact,/Tuition, courses &amp; listed fees/);assert.match(View.render(result),/Tuition, courses &amp; listed fees/,'The full cost view keeps its detailed heading');
});

test('units follow the degree credit system',()=>{
 assert.equal(Sheet.creditUnit('competency-unit',112),'competency units');assert.equal(Sheet.creditUnit('competency-unit',1),'competency unit');
 assert.equal(Sheet.creditUnit('semester',120),'credits');assert.equal(Sheet.creditUnit('semester',1),'credit');assert.equal(Sheet.creditUnit('quarter',4),'quarter credits');assert.equal(Sheet.creditUnit(undefined,3),'credits');
});

test('a difference from the starting route names providers the student turned off, or stays neutral',()=>{
 const baseline={summary:{transferCredits:78},rows:[{provider:'Sophia'},{provider:'StraighterLine'},{provider:'Study.com'},{provider:'University'},{provider:null}]};
 const frozen=JSON.stringify(baseline);
 const off=Sheet.routeCreditDifference({baseline,plannedCredits:75,providers:['Sophia','Study.com'],creditSystem:'semester'});
 assert.equal(off.difference,-3);assert.deepEqual(off.providersOff,['StraighterLine']);assert.equal(off.text,'3 fewer outside credits than the starting route because StraighterLine is off in your course sources.');
 const two=Sheet.routeCreditDifference({baseline,plannedCredits:60,providers:['Sophia'],creditSystem:'semester'});assert.match(two.text,/because StraighterLine and Study\.com are off in your course sources/);
 const neutral=Sheet.routeCreditDifference({baseline,plannedCredits:72,providers:['Sophia','StraighterLine','Study.com'],creditSystem:'semester'});
 assert.equal(neutral.text,'6 fewer outside credits than the starting route because of your current choices.');assert.deepEqual(neutral.providersOff,[]);
 const more=Sheet.routeCreditDifference({baseline,plannedCredits:81,providers:['Sophia'],creditSystem:'semester'});
 assert.equal(more.text,'3 more outside credits than the starting route because of your current choices.','More credits are never blamed on a turned-off provider');
 const cu=Sheet.routeCreditDifference({baseline:{summary:{transferCredits:69},rows:[{provider:'Study.com'}]},plannedCredits:68,providers:[],creditSystem:'competency-unit'});
 assert.equal(cu.text,'1 fewer outside competency unit than the starting route because Study.com is off in your course sources.');
 assert.equal(Sheet.routeCreditDifference({baseline,plannedCredits:78,providers:[],creditSystem:'semester'}),null);
 for(const input of [{},{baseline:{summary:{}},plannedCredits:3,providers:[]},{baseline,plannedCredits:NaN,providers:[]},{baseline,plannedCredits:3}])assert.equal(Sheet.routeCreditDifference(input),null);
 assert.equal(JSON.stringify(baseline),frozen);
});

test('the real Excelsior starting route explains the StraighterLine difference from its own baseline',()=>{
 const without=startingRoute('curriculum-excelsior-bs-psychology',['StraighterLine']);
 const result=Sheet.routeCreditDifference({baseline:without.baseline,plannedCredits:without.plan.coverage.mappedExternalCredits,providers:without.providers,creditSystem:without.program.creditSystem});
 assert.equal(without.baseline.summary.transferCredits,78);assert.equal(result.difference,without.plan.coverage.mappedExternalCredits-78);assert(result.difference<0);
 assert.match(result.text,/fewer outside credits than the starting route because StraighterLine is off in your course sources\.$/);
 const same=startingRoute('curriculum-excelsior-bs-psychology');assert.equal(Sheet.routeCreditDifference({baseline:same.baseline,plannedCredits:same.plan.coverage.mappedExternalCredits,providers:same.providers,creditSystem:'semester'}),null);
});

test('the Excelsior partnership residency condition is surfaced next to the standard 7 from the program’s own sourced policy',()=>{
 for(const model of excelsior.models){
  assert.equal(model.institutionMinCredits,7,'The standard minimum is unchanged');
  const alt=Sheet.residencyAlternative(model,7);
  assert.equal(alt.value,15);assert.deepEqual(alt.sourceIds,model.policyEvidence.institutionMinCredits.partnershipAlternative.sourceIds);
  assert.equal(alt.text,'Partnership students admitted after December 31, 2024: at least 15 credits at the university.');
  assert.equal(Sheet.residencyAlternative(model,15),null,'Never shown when it is not stricter than the displayed minimum');
 }
 const unsourced=clone(excelsior.models[0]);unsourced.policyEvidence.institutionMinCredits.partnershipAlternative.sourceIds=[];assert.equal(Sheet.residencyAlternative(unsourced,7),null);
 assert.equal(Sheet.residencyAlternative(require('./dist/data/liberty.json'),30),null);
});

function trackerUI(){
 const content={innerHTML:''},delta={textContent:''},strip={className:''},details={open:false},apply={addEventListener(){}},node={hidden:false,dataset:{},innerHTML:'',contains(){return false;},querySelector(selector){
  if(selector==='.savings-strip')return this.innerHTML?strip:null;if(selector==='.savings-content')return content;if(selector==='.savings-delta')return delta;
  if(selector==='.savings-details')return content.innerHTML.includes('savings-details')?details:null;if(selector==='.savings-apply')return content.innerHTML.includes('savings-apply')?apply:null;return null;}};
 const context={window:{DegreeSavings:Savings,DegreeCoursePlanView:CoursePlan},fetch:async()=>({ok:true,json:async()=>structuredClone(prices)}),document:{activeElement:null},location:{href:'https://example.test/plan.html'},URL,Intl,console};
 vm.runInNewContext(fs.readFileSync(require.resolve('./dist/savings-tracker.js'),'utf8'),context);return{node,content,strip,tracker:context.window.DegreeSavingsTracker};
}
const {loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js'),data=loadData();
function draftFor(routeId){const route=data.catalog.pathways.find(route=>route.id===routeId);let state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state=Journey.setPriorCredits(state,'none');return{state,draft:Journey.buildDraft(state,data.catalog,data.models)};}

test('under a planning range the savings figure is labelled as a tuition-only comparison, not a competing total',async()=>{
 const {state,draft}=draftFor('liberty-criminal-justice-online'),ui=trackerUI(),before=structuredClone(state);
 const result=await ui.tracker.update(ui.node,state,draft,{simple:true,secondary:true});assert.equal(result.available,true);
 assert.match(ui.strip.className,/savings-secondary/);
 assert.match(ui.content.innerHTML,/Tuition-only comparison/);assert.match(ui.content.innerHTML,/University fees are not counted here, so this is not the planning estimate/);
 assert.match(ui.content.innerHTML,/than taking every course at the university/);assert.doesNotMatch(ui.content.innerHTML,/Estimated savings|other fees extra/);
 assert.match(ui.content.innerHTML,/The planning estimate above covers tuition, listed fees and outside courses/);
 const primary=trackerUI();await primary.tracker.update(primary.node,state,draft,{simple:true});assert.match(primary.content.innerHTML,/Estimated savings/);assert.match(primary.content.innerHTML,/Excludes university fees/);
 assert.deepEqual(state,before);
});

test('under a planning range an unavailable savings comparison stays quiet instead of saying the estimate is pending',async()=>{
 const {state,draft}=draftFor('excelsior-bs-psychology'),ui=trackerUI();
 const result=await ui.tracker.update(ui.node,state,draft,{simple:true,secondary:true});assert.equal(result.available,false);
 assert.equal(ui.node.hidden,true);assert.equal(ui.node.innerHTML,'');
 const alone=trackerUI();await alone.tracker.update(alone.node,state,draft,{simple:true});assert.match(alone.content.innerHTML,/Costs &amp; savings|Costs & savings/);assert.equal(alone.node.hidden,false);
 const back=await ui.tracker.update(ui.node,state,draft,{simple:true});assert.equal(back.available,false);assert.equal(ui.node.hidden,false,'Without a range the pending message returns');
});
