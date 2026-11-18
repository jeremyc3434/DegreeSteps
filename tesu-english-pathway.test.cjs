/* Current English requirements retain proposed subject choices as choices. */
const test=require('node:test'),assert=require('node:assert/strict');
const facts=require('./content/curricula/snapshots/tesu/english-current-2026-11-18-reviewed.json'),base=require('./dist/data/tesu.json');
const copy=value=>JSON.parse(JSON.stringify(value)),load=()=>import('./scripts/import-tesu-english.mjs');
test('English has a complete independently sourced 120-credit ledger without invented outside awards',async()=>{
 const {buildTESUEnglish,run}=await load(),before=JSON.stringify([facts,base]),document=buildTESUEnglish(facts,base),model=document.models[0];
 assert.equal((await run({check:true})).newProviderEquivalencies,0);assert.equal(JSON.stringify([facts,base]),before);
 const sum=predicate=>model.requirements.filter(predicate).reduce((n,row)=>n+row.credits,0);
 assert.equal(sum(()=>true),120);assert.equal(sum(row=>row.category==='general'),45);assert.equal(sum(row=>row.category==='major'),45);assert.equal(sum(row=>row.freeElective),30);assert.equal(model.requirements.length,40);
 assert.equal(new Set(model.requirements.map(row=>row.code||row.options[0].code)).size,40);
 assert(model.requirements.every(row=>row.options.length&&row.options.every(option=>option.provider==='University'&&option.code&&option.evidence==='published')));
 assert.deepEqual(model.requirements.filter(row=>row.curriculumBlock==='required-english').map(row=>row.code),['LIT-2050','LIT-2060','LIT-2910','LIT-4600']);
 const selected=model.requirements.filter(row=>row.curriculumBlock==='english-electives');assert.equal(selected.length,6);
 assert.deepEqual(model.requirements.filter(row=>row.curriculumBlock==='humanities-electives').map(row=>row.code),['ART-1000','HUM-1030','PHI-2860','MAN-3730']);
 const managerial=model.requirements.find(row=>row.code==='MAN-3730');assert(managerial.sourceIds.includes('tesu-english-humanities-selection-2026-11-18'));assert(facts.courses['MAN-3730'].deliveryMethods.includes('Online'));
 for(const row of selected){assert.match(row.code,/^(ENG|LIT)-/);assert.equal(row.credits,3);assert.match(row.choiceNote,/Proposed editable/);assert.equal(row.proposedSelection.credits,18);assert(facts.courses[row.code].deliveryMethods.includes('Online'));assert.equal(facts.courses[row.code].tecepOnly,false);}
 assert(model.requirements.some(row=>row.code==='MAT-1050'));assert(model.requirements.some(row=>row.code==='SOC-2910'));assert(!model.requirements.some(row=>row.code==='PHI-1300'));
});
test('formal literature prerequisites and upper-level allocation stay distinct from advisory language',async()=>{
 const {buildTESUEnglish}=await load(),model=buildTESUEnglish(facts,base).models[0],byCode=new Map(model.requirements.filter(row=>row.code).map(row=>[row.code,row]));
 for(const code of ['LIT-4600','LIT-3010','LIT-3020','LIT-3310'])assert.deepEqual(byCode.get(code).prerequisites,['enc1020']);
 for(const code of ['LIT-2050','LIT-2060','LIT-2910','LIT-2210','ENG-2010','ENG-2050','LIB-4950'])assert.equal(byCode.get(code).prerequisites,undefined);
 assert.equal(byCode.get('LIT-2910').upper,false,'An advisory calling it an upper-level class does not change the published 2000-level credit code');
 assert.deepEqual(model.upperGroupMinimums,[{group:'area-of-study',credits:18}]);assert.equal(model.requirements.filter(row=>row.category==='major'&&row.upper).reduce((n,row)=>n+row.credits,0),18);
 assert.equal(byCode.get('LIB-4950').minimumCompletedCredits,undefined);
 for(const row of model.requirements)for(const id of row.prerequisites||[])assert(model.requirements.some(other=>other.id===id));
});
test('technical writing choices preserve separate identities and publish their no-double-credit condition',async()=>{
 const {buildTESUEnglish}=await load(),model=buildTESUEnglish(facts,base).models[0],row=model.requirements.find(row=>row.code==='ENG-2010');
 assert.deepEqual(row.allowedCourseCodes,['ENG-2010','ENG-2020']);assert.deepEqual(row.options.map(option=>option.code),['ENG-2010','ENG-2020']);assert.equal(new Set(row.options.map(option=>option.id)).size,2);
 for(const option of row.options){assert(option.conditions.some(condition=>/does not award credit for both/.test(condition)));assert(!option.codeAliases?.includes(option.code==='ENG-2010'?'ENG-2020':'ENG-2010'));}
 assert.deepEqual(model.courseCreditExclusions[0].codes,['ENG-2010','ENG-2020']);assert(model.courseCreditExclusions[0].sourceIds.every(id=>model.sources.some(source=>source.id===id)));
});
test('source-bound pricing, grade scope and residency remain specific to this B.A.',async()=>{
 const {buildTESUEnglish}=await load(),model=buildTESUEnglish(facts,base).models[0];
 assert.equal(model.catalogYear,null);assert.deepEqual(model.tuitionComparison.catalogIdentity,model.catalogIdentity);assert.equal(model.tuitionComparison.modelId,model.id);assert.equal(model.tuitionComparison.entryId,'tesu-standard');
 assert.equal(model.institutionMinCredits,15);assert.equal(model.externalMaxCredits,105);assert.equal(model.alternativeMaxCredits,90);assert.equal(model.existingCreditReview,undefined);
 for(const code of ['SOS-1100','LIB-4950'])assert.equal(model.requirements.find(row=>row.code===code).institutionalOnly,true);
 for(const row of model.requirements){const c=row.category==='major'||['ENC-1010','ENC-1020'].includes(row.code);assert.equal(row.minimumGrade,c?'C':undefined,row.id);for(const id of [...row.sourceIds,...(row.minimumGradeSourceIds||[]),...(row.prerequisiteSourceIds||[])])assert(model.sources.some(source=>source.id===id),id);}
 assert.equal(model.unresolved.length,0);const sections=model.curriculumSections.flatMap(section=>section.requirementIds);assert.equal(sections.length,40);assert.equal(new Set(sections).size,40);
 const wrong=copy(base);wrong.requirements.find(row=>row.code==='COM-2090').credits=4;assert.throws(()=>buildTESUEnglish(facts,wrong));
});
test('compiled English opens complete proposed course plans with and without transfer providers',()=>{
 const C=require('./dist/program-catalog.js'),J=require('./dist/journey-engine.js'),S=require('./dist/savings-engine.js');
 const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
 const model=require('./dist/data/curricula/tesu-english.json').models[0],route=catalog.pathways.find(route=>route.modelId===model.id);assert(route);assert(C.isPlanAvailable(route,catalog,[model]));
 for(const providers of [undefined,[]]){
  const state=J.selectRoute(J.initialize(null,null,catalog),route,catalog);state.profile.modality='online';if(providers)state.scenarios[model.id]={providers};const before=JSON.stringify(state),draft=J.buildDraft(state,catalog,[model]);
  assert.equal(JSON.stringify(state),before);assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.validation.academicCountsValid,true,JSON.stringify(draft.plan.validation.errors));assert(draft.plan.rows.every(row=>row.option?.code&&!row.selectionRequired));assert.equal(draft.plan.totals.confirmed,0);
  assert(!draft.plan.validation.errors.some(error=>error.code==='program_research'),'Published baseline statements must not become generic research homework');
  if(providers)assert.equal(draft.plan.totals.institutional,120);else assert(draft.plan.totals.external>=60,'An accelerated template should demonstrate at least half the degree from researched outside choices');
  assert.equal(S.calculate(state,draft,require('./dist/data/cost-comparisons.json')).available,true);
 }
});
