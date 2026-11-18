/* A flexible BALS allocation is not fourteen mandatory Psychology courses. */
const test=require('node:test'),assert=require('node:assert/strict');
const facts=require('./content/curricula/snapshots/tesu/liberal-studies-current-2026-11-18-reviewed.json'),psychologyFacts=require('./content/curricula/snapshots/tesu/psychology-current-2026-11-18-reviewed.json'),baseline=require('./dist/data/tesu.json');
const clone=value=>JSON.parse(JSON.stringify(value)),load=()=>import('./scripts/import-tesu-liberal-studies.mjs');
const receiving=option=>String(option.receivingCode||option.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
test('BALS has a complete independently sourced general-option ledger with named choices but flexible area allocations',async()=>{
 const {buildTESULiberalStudies,run}=await load(),before=JSON.stringify([facts,psychologyFacts,baseline]),doc=buildTESULiberalStudies(facts,psychologyFacts,baseline),model=doc.models[0];
 assert.equal((await run({check:true})).newProviderEquivalencies,0);assert.equal(JSON.stringify([facts,psychologyFacts,baseline]),before);
 assert.equal(model.id,'curriculum-tesu-ba-liberal-studies');assert.equal(model.requirements.length,40);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 assert.equal(model.requirements.filter(row=>row.category==='general').reduce((sum,row)=>sum+row.credits,0),45);
 assert.equal(model.requirements.filter(row=>row.category==='major').reduce((sum,row)=>sum+row.credits,0),45);
 const slots=model.requirements.filter(row=>row.liberalArtsAllocation);assert.equal(slots.length,14);assert(slots.every(row=>!row.code&&!row.freeElective));
 assert.equal(slots.filter(row=>row.minCourseLevel===1000).length,2);assert.equal(slots.filter(row=>row.minCourseLevel===2000).length,7);assert.equal(slots.filter(row=>row.upperOnly&&row.minCourseLevel===3000).length,5);
 assert(slots.every(row=>row.maxCourseLevel===4999&&row.credits===3));
 const choices=model.requirements.map(row=>row.options.find(option=>option.provider==='University'));assert.equal(new Set(choices.map(option=>option.code)).size,40);assert(choices.every(option=>option.code&&option.title&&!option.selectionRequired));
 assert.deepEqual(model.requirements.filter(row=>row.freeElective).map(row=>{const option=row.options.find(option=>option.provider==='University');return[option.code,option.title,option.credits];}),facts.degree.selectedFreeElectives);
});
test('the baseline keeps only permitted university course options and does not manufacture course prerequisites or an academic year',async()=>{
 const {buildTESULiberalStudies}=await load(),model=buildTESULiberalStudies(facts,psychologyFacts,baseline).models[0];
 const general=model.requirements.filter(row=>row.category==='general');assert(general.some(row=>row.code==='HIS-1210'));assert(!general.some(row=>row.code==='PHI-1300'));
 assert(!model.requirements.some(row=>row.options.some(option=>option.provider==='University'&&option.code==='PHI-1300')),'TECEP-only Critical Reasoning is not a university-course fallback');
 const math=general.find(row=>row.code==='MAT-1210');assert(math);assert.match(model.rulesNotes.join(' '),/MAT-1050/);
 const capstone=model.requirements.find(row=>row.id==='lib4950');assert(capstone.institutionalOnly);assert.equal(capstone.credits,3);assert.equal(capstone.upper,true);assert.equal(capstone.minimumCompletedCredits,undefined);
 assert.equal(model.catalogYear,null);assert.equal(model.catalogIdentity.kind,'reviewed-current-catalog');assert.equal(model.tuitionComparison.modelId,model.id);assert.deepEqual(model.tuitionComparison.catalogIdentity,model.catalogIdentity);
 assert.equal(model.existingCreditReview,undefined,'Business course-age rules are not copied onto a humanities B.A.');
 assert(model.requirements.filter(row=>row.liberalArtsAllocation).every(row=>!row.prerequisites?.length));
});
test('professional course exceptions retain exact existing awards without blanket business eligibility or freshened evidence',async()=>{
 const {buildTESULiberalStudies}=await load(),model=buildTESULiberalStudies(facts,psychologyFacts,baseline).models[0],sources=new Map(model.sources.map(source=>[source.id,source]));
 const oldOptions=baseline.requirements.flatMap(row=>row.options),exceptions=new Set(facts.taxonomy.allowedReceivingCodeExceptions.map(code=>code.replace('-','')));
 for(const row of model.requirements.filter(row=>row.liberalArtsAllocation)){
  for(const prefix of ['ACC','BUS','CIS','FIN','LAW','MAN','MKT','LIB'])assert(!row.allowedCoursePrefixes.includes(prefix));
  for(const option of row.options.filter(option=>option.provider!=='University')){
   assert(exceptions.has(receiving(option)));assert.equal(option.evidence,'conditional');assert.equal(option.credits,3);
   assert(Number(option.receivingCode.match(/\d+/)[0])>=row.minCourseLevel);if(row.upperOnly)assert.equal(option.upper,true);
   const original=oldOptions.find(old=>old.id===option.id);assert(original);for(const field of ['code','provider','sourceCredits','sourceCreditSystem','upper'])assert.deepEqual(option[field],original[field]);
   for(const id of original.sourceIds){assert(option.sourceIds.includes(id));assert.deepEqual(sources.get(id),baseline.sources.find(source=>source.id===id));}
  }
 }
 assert.equal(model.liberalArtsAllocation.minimumSubjects,2);assert.equal(model.liberalArtsAllocation.maximum1000Credits,6);assert.equal(model.liberalArtsAllocation.requirementIds.length,14);assert(!model.liberalArtsAllocation.requirementIds.includes('lib4950'));
 for(const prefix of ['ENG','ENC','LIT'])assert.equal(model.liberalArtsAllocation.subjectByPrefix[prefix],'english');
});
test('changed totals, duplicate selections, applied prefixes and unsupported prerequisite fallbacks cannot enter this ledger',async()=>{
 const {buildTESULiberalStudies}=await load();
 for(const mutate of [f=>f.degree.totalCredits=121,f=>f.degree.slotFallbacks[1].code=f.degree.slotFallbacks[0].code,f=>f.taxonomy.allowedCoursePrefixes.push('ACC'),f=>f.courses['COM-3300'].prerequisites=['COM-2090']]){const altered=clone(facts);mutate(altered);assert.throws(()=>buildTESULiberalStudies(altered,psychologyFacts,baseline));}
});
test('compiled BALS remains selectable and returns a named complete route with transfer providers disabled',()=>{
 const C=require('./dist/program-catalog.js'),J=require('./dist/journey-engine.js'),S=require('./dist/sheet-state.js'),Savings=require('./dist/savings-engine.js');
 const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
 const model=require('./dist/data/curricula/tesu-liberal-studies.json').models[0],route=catalog.pathways.find(route=>route.modelId===model.id);assert(route);assert(C.isPlanAvailable(route,catalog,[model]));
 const allocation=model.requirements.filter(row=>row.liberalArtsAllocation);assert.deepEqual(allocation.map(row=>row.upperOnly),[false,false,...Array(7).fill(false),...Array(5).fill(true)],'Four-digit 1000/2000 receiving levels are not upper-level courses');
 for(const providers of [undefined,[]]){
  const state=J.selectRoute(J.initialize(null,null,catalog),route,catalog);state.profile.modality='online';if(providers)state.scenarios[model.id]={...S.scenario(state,model.id),providers};
  const before=JSON.stringify([state,model]),draft=J.buildDraft(state,catalog,[model]);assert.equal(JSON.stringify([state,model]),before);assert.equal(draft.plan.validation.academicCountsValid,true,JSON.stringify(draft.plan.validation.errors));assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.totals.confirmed,0);assert(draft.plan.rows.every(row=>row.option?.code&&!row.selectionRequired));
  assert.equal(Savings.calculate(state,draft,require('./dist/data/cost-comparisons.json')).available,true);
  if(providers){assert(draft.plan.rows.every(row=>row.option.provider==='University'));assert.equal(new Set(draft.plan.rows.map(row=>row.option.code)).size,40);}
 }
});
