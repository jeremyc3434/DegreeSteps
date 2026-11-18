/* Existing transfer awards remain intact when the reviewed course sequence is corrected. */
const test=require('node:test'),assert=require('node:assert/strict');
const baseline=require('./dist/data/tesu.json'),facts=require('./content/curricula/snapshots/tesu/finance-current-2026-11-18-reviewed.json');
const accountingFacts=require('./content/curricula/snapshots/tesu/accounting-current-2026-11-18-reviewed.json');
const copy=value=>JSON.parse(JSON.stringify(value));
const modules=Promise.all([import('./scripts/add-tesu-prerequisites.mjs'),import('./scripts/import-tesu-accounting.mjs')]);
const edges={'ACC-1020':['acc1010'],'FIN-3010':['acc1010'],'BUS-2100':['mat1210'],'STA-2010':['mat1210'],'MAN-3720':['man2100']};
test('five reviewed common-course dependencies bind to their exact official course sources',async()=>{
 const [{applyTESUPrerequisites}]=await modules,before=JSON.stringify([baseline,facts]),model=applyTESUPrerequisites(baseline,facts);
 for(const[code,prerequisites]of Object.entries(edges)){
  const row=model.requirements.find(row=>row.code===code);assert.deepEqual(row.prerequisites,prerequisites);
  assert.equal(row.prerequisiteSourceIds.length,1);const source=model.sources.find(source=>source.id===row.prerequisiteSourceIds[0]);assert(source);assert.equal(source.checked,'2026-11-18');assert(source.url.endsWith('/'+code.toLowerCase()));
 }
 assert.match(model.requirements.find(row=>row.code==='BUS-2100').prerequisiteNotes,/MAT-1050 or MAT-1210/);
 assert.match(model.requirements.find(row=>row.code==='MAN-3720').prerequisiteNotes,/legacy MAN-210/);
 assert.equal(JSON.stringify([baseline,facts]),before);
});
test('correcting prerequisites does not alter any outside option, source-credit quantity or old source-review date',async()=>{
 const [{applyTESUPrerequisites}]=await modules,model=applyTESUPrerequisites(baseline,facts);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 for(const original of baseline.requirements){const revised=model.requirements.find(row=>row.id===original.id);assert.deepEqual(revised.options,original.options);assert.equal(revised.credits,original.credits);assert.deepEqual(revised.sourceIds,original.sourceIds);}
 for(const original of baseline.sources)assert.deepEqual(model.sources.find(source=>source.id===original.id),original);
 for(const key of ['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','publishedTuitionSchedule','publishedFees','receivingMapReview'])assert.deepEqual(model[key],baseline[key]);
 assert.deepEqual(applyTESUPrerequisites(model,facts),model,'A second generation cannot change the reviewed source state');
});
test('Accounting inherits the same named course prerequisites without receiving a new transfer approval',async()=>{
 const [{applyTESUPrerequisites},{buildTESUAccounting}]=await modules;
 const model=buildTESUAccounting(accountingFacts,applyTESUPrerequisites(baseline,facts)).models[0];
 for(const[code,prerequisites]of Object.entries(edges)){
  const row=model.requirements.find(row=>row.code===code);assert.deepEqual(row.prerequisites,prerequisites);assert(row.prerequisiteSourceIds.every(id=>model.sources.some(source=>source.id===id)));assert.deepEqual(row.options,[],'The curriculum generator does not invent outside credit');
 }
});
test('wrong institution, missing dependencies, changed source identity and cycles cannot acquire this supplement',async()=>{
 const [{applyTESUPrerequisites}]=await modules;
 const wrong=copy(baseline);wrong.school='Another institution';assert.throws(()=>applyTESUPrerequisites(wrong,facts),/exact reviewed/);
 const missing=copy(baseline);missing.requirements=missing.requirements.filter(row=>row.code!=='MAT-1210');assert.throws(()=>applyTESUPrerequisites(missing,facts),/must include/);
 const source=copy(facts);source.sources.find(source=>source.id==='tesu-finance-acc1020-2026-11-18').url='https://example.edu/acc-1020';assert.throws(()=>applyTESUPrerequisites(baseline,source),/official TESU/);
 const cycle=copy(facts);cycle.courses['FIN-3010'].prerequisites=['ACC-1020'];cycle.courses['ACC-1020'].prerequisites=['FIN-3010'];assert.throws(()=>applyTESUPrerequisites(baseline,cycle),/cycle/);
});
