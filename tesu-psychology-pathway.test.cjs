/* A named Psychology plan preserves its own requirements, not BSBA rules. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js');
const facts=require('./content/curricula/snapshots/tesu/psychology-current-2026-11-18-reviewed.json');
const raw=require('./content/curricula/tesu-psychology.json').models[0],baseline=require('./dist/data/tesu.json');
const clone=value=>JSON.parse(JSON.stringify(value));
test('raw Psychology ledger chooses forty distinct named courses within the published 45/45/30 split',()=>{
 assert.equal(raw.totalCredits,120);assert.equal(raw.requirements.length,40);assert.equal(raw.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 for(const [category,credits]of [['general',45],['major',45],['electives',30]])assert.equal(raw.requirements.filter(row=>row.category===category).reduce((sum,row)=>sum+row.credits,0),credits);
 assert.equal(new Set(raw.requirements.map(row=>row.code||row.options.find(option=>option.provider==='University')?.code)).size,40);
 assert(raw.requirements.every(row=>row.options.some(option=>option.provider==='University'&&option.code&&option.evidence==='published')));
 const free=raw.requirements.filter(row=>row.freeElective);assert.equal(free.length,10);assert(free.every(row=>!row.code&&!row.selectionRequired),'Unrestricted capacity must not imply an exact receiving-course equivalency');
 assert.equal(raw.requirements.filter(row=>row.code==='PSY-1010').length,1);assert(raw.requirements.find(row=>row.id==='psy1010').category==='major');
 assert.equal(raw.curriculumSections.flatMap(section=>section.requirementIds).length,40);
});
test('Psychology formal prerequisites, academic grade scope and advisory language remain separate',()=>{
 const get=code=>raw.requirements.find(row=>row.code===code);
 assert.deepEqual(get('PSY-3500').prerequisites,['psy1010']);assert.deepEqual(get('STA-2010').prerequisites,['mat1210']);
 for(const code of ['PSY-3000','PSY-3520','PSY-3600']){assert.equal(get(code).prerequisites,undefined);assert.match(get(code).prerequisiteNotes,/advised/);}
 assert.match(get('LIB-4960').prerequisiteNotes,/Near-completion/);assert.equal(get('LIB-4960').minimumCompletedCredits,undefined);
 assert(raw.requirements.filter(row=>row.category==='major').every(row=>row.minimumGrade==='C'));
 assert.equal(get('ENC-1010').minimumGrade,'C');assert.equal(get('ENC-1020').minimumGrade,'C');assert.equal(get('MAT-1210').minimumGrade,undefined);
 assert(raw.requirements.filter(row=>row.freeElective).every(row=>row.minimumGrade===undefined));
 assert.deepEqual(raw.requirements.filter(row=>row.institutionalOnly).map(row=>row.code).sort(),['LIB-4960','SOS-1100']);
 assert.equal(raw.existingCreditReview,undefined,'BSBA business currency must not be borrowed by Psychology');
 assert.equal(raw.transferRecencyYears,undefined);
});
test('upper-level free electives cannot replace the eighteen upper credits required inside Psychology',()=>{
 const model=clone(raw);for(const row of model.requirements)for(const option of row.options){if(row.category==='major'&&row.code!=='LIB-4960')option.upper=false;if(row.freeElective)option.upper=true;}
 const plan=Planner.generate(model,{providers:[],allowConditional:true,completed:[]});
 assert(plan.totals.upper>=18,'The overall upper count alone is insufficient');assert.equal(plan.validation.academicCountsValid,false);assert(plan.validation.errors.some(error=>error.code==='group_upper'));
});
test('offline Psychology import is deterministic, source-bound and does not mutate reused records or manufacture an edition',async()=>{
 const {buildTESUPsychology}=await import('./scripts/import-tesu-psychology.mjs');
 const before=JSON.stringify([facts,baseline]),built=buildTESUPsychology(facts,baseline);
 // TESU publishes this document from its pathway kit; the retired importer's reviewed ledger must be exactly what the kit publishes.
 const {assertKitLedger}=await import('./scripts/tesu-kit-ledger-check.mjs');assertKitLedger(require('./content/curricula/tesu-psychology.json'),built,'TESU Psychology');assert.equal(JSON.stringify([facts,baseline]),before);
 assert.equal(raw.catalogYear,null);assert.equal(raw.catalogIdentity.kind,'reviewed-current-catalog');assert.equal(raw.tuitionComparison.modelId,raw.id);assert.deepEqual(raw.tuitionComparison.catalogIdentity,raw.catalogIdentity);
 assert(raw.sources.some(source=>source.url===raw.catalogIdentity.sourceUrl&&source.checked===raw.catalogIdentity.checkedOn));
 assert.equal(raw.alternativeMaxCredits,90);assert.equal(raw.institutionMinCredits,15);assert.equal(raw.externalMaxCredits,105);assert.deepEqual(raw.upperGroupMinimums,[{group:'area-of-study',credits:18}]);
});
test('compiled Psychology is selectable and generates a complete proposed high-transfer route without personal awards',()=>{
 const pack=JSON.parse(fs.readFileSync('dist/data/curricula/tesu-psychology.json')),model=pack.models.find(model=>model.id===raw.id),registry=require('./dist/data/curriculum-registry.json');
 const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),route=catalog.pathways.find(route=>route.modelId===model.id);
 assert(route);assert(Catalog.isPlanAvailable(route,catalog,[model]));
 const state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality='online';const before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,[model]);
 assert.equal(JSON.stringify(state),before);assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.totals.confirmed,0);
 assert(!draft.plan.validation.errors.some(error=>error.code==='program_research'),'A complete published ledger must not create generic missing-research homework');
 assert(draft.plan.totals.external>=60,'The default route should expose the researched outside-credit opportunities');assert(draft.plan.totals.alternative<=90);assert(draft.plan.totals.institutional>=15);assert(draft.plan.rows.every(row=>row.option&&!row.selectionRequired));
 const codes=draft.plan.rows.map(row=>row.option?.receivingCode||row.option?.code).filter(Boolean);assert.equal(new Set(codes).size,codes.length,'No receiving award is allocated twice');
});
