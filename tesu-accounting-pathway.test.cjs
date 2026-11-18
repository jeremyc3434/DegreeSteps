const test=require('node:test');
const assert=require('node:assert/strict');
const facts=require('./content/curricula/snapshots/tesu/accounting-current-2026-11-18-reviewed.json');
const baseline=require('./dist/data/tesu.json');
const Planner=require('./dist/planner.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const load=()=>import('./scripts/import-tesu-accounting.mjs');

test('Accounting independently builds its exact 120-credit ledger without mutating General Management or creating transfer evidence',async()=>{
 const {buildTESUAccounting,run}=await load(),input=clone(baseline),before=clone(input),document=buildTESUAccounting(facts,input),model=document.models[0];
 assert.deepEqual(input,before);assert.equal((await run({check:true})).newProviderEquivalencies,0);
 assert.equal(document.routes[0].id,'tesu-bsba-accounting');assert.equal(document.routes[0].parentId,undefined);
 assert.equal(model.id,'curriculum-tesu-bsba-accounting');assert.equal(model.requirements.length,40);
 assert.equal(new Set(model.requirements.map(row=>row.code||row.options.find(option=>option.provider==='University')?.code)).size,40);
 const credits=group=>model.requirements.filter(row=>row.group===group).reduce((sum,row)=>sum+row.credits,0);
 assert.equal(model.requirements.filter(row=>row.category==='general').reduce((sum,row)=>sum+row.credits,0),45);
 assert.equal(credits('business-core'),42);assert.equal(credits('area-study'),18);assert.equal(credits('free-electives'),15);
 assert(model.requirements.every(row=>row.sourceIds.length&&(row.code?row.options.length===0:row.freeElective&&row.options.length===1&&row.options[0].provider==='University'&&row.options[0].code)));
 assert.deepEqual(model.requirements.filter(row=>row.group==='area-study').map(row=>row.code),['ACC-2010','ACC-2020','ACC-3030','ACC-4010','ACC-4020','ACC-4210']);
 assert(!model.requirements.some(row=>row.code==='ACC-4110'));
 assert(!model.rulesNotes.some(note=>/at least three of.*accounting.*finance.*management/i.test(note)));
 assert.equal(model.requirements.find(row=>row.id==='free-art1000').options[0].title,'A World of Art');
 assert(model.requirements.filter(row=>row.freeElective).every(row=>row.code===undefined&&row.options[0].selectionRequired!==true),'unrestricted capacity is not an exact receiving-course requirement');
});

test('Accounting preserves exact current-catalog identity without claiming an edition or reusing a different degree pricing identity',async()=>{
 const {buildTESUAccounting}=await load(),model=buildTESUAccounting(facts,baseline).models[0];
 assert.equal(model.catalogYear,null);assert.equal(model.catalogIdentity.kind,'reviewed-current-catalog');
 assert.equal(model.catalogIdentity.checkedOn,'2026-11-18');assert(model.sources.some(source=>source.url===model.catalogIdentity.sourceUrl&&source.checked===model.catalogIdentity.checkedOn));
 assert.deepEqual(model.tuitionComparison.catalogIdentity,model.catalogIdentity);assert.equal(model.tuitionComparison.modelId,model.id);assert.equal(model.tuitionComparison.entryId,'tesu-standard');
 assert(model.sources.some(source=>source.url===model.tuitionComparison.sourceUrl&&source.checked===model.tuitionComparison.checkedOn));
 assert.equal(model.institutionMinCredits,15);assert.equal(model.externalMaxCredits,105);assert.equal(model.alternativeMaxCredits,90);
 assert.match(model.policyEvidence.externalMaxCredits.calculation,/120.*15/);
 for(const code of ['SOS-1100','BUS-4210'])assert.equal(model.requirements.find(row=>row.code===code).institutionalOnly,true);
});

test('Accounting prerequisites and minimum grades follow the selected major rather than the General Management elective placement',async()=>{
 const {buildTESUAccounting}=await load(),model=buildTESUAccounting(facts,baseline).models[0],row=code=>model.requirements.find(row=>row.code===code);
 assert.deepEqual(row('ACC-2010').prerequisites,['acc1020']);assert.equal(row('ACC-2010').minimumGrade,'C');
 assert.equal(row('ACC-2020').prerequisites,undefined);assert.match(row('ACC-2020').prerequisiteNotes,/Advisory.*ACC-2010/);
 assert.deepEqual(row('ACC-4010').prerequisites,['acc2010']);assert.deepEqual(row('ACC-4020').prerequisites,['acc2010','acc4010']);
 assert.deepEqual(row('ACC-4210').prerequisites,['acc1010','acc1020']);assert.equal(row('ACC-3030').prerequisites,undefined);
 for(const requirement of model.requirements){
  const needsC=['ENC-1010','ENC-1020'].includes(requirement.code)||['business-core','area-study'].includes(requirement.group);
  assert.equal(requirement.minimumGrade,needsC?'C':undefined,requirement.code);
  for(const id of [...(requirement.sourceIds||[]),...(requirement.prerequisiteSourceIds||[]),...(requirement.minimumGradeSourceIds||[])])assert(model.sources.some(source=>source.id===id),requirement.code+' '+id);
 }
 const assigned=model.curriculumSections.flatMap(section=>section.requirementIds);
 assert.equal(assigned.length,40);assert.equal(new Set(assigned).size,40);
});

test('Accounting upper-group validation cannot use upper free electives to replace upper business-core coursework',async()=>{
 const {buildTESUAccounting}=await load(),model=buildTESUAccounting(facts,baseline).models[0];
 assert.deepEqual(model.upperGroupMinimums,[{group:'area-of-study',credits:12},{group:'business-core',credits:6}]);
 for(const row of model.requirements)if(!row.options.length)row.options=[{id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,upper:row.upper,evidence:'published',sourceIds:row.sourceIds}];
 const original=Planner.generate(model,{providers:[]});assert.equal(original.validation.academicCountsValid,true,JSON.stringify(original.validation.errors));
 for(const row of model.requirements)if(row.subgroup==='business-core'&&row.code!=='BUS-4210'){row.options[0].upper=false;row.upper=false;}
 const elective=model.requirements.find(row=>row.group==='free-electives');elective.options[0].upper=true;elective.upper=true;
 const errors=Planner.generate(model,{providers:[]}).validation.errors;
 assert(!errors.some(error=>error.code==='upper_minimum'),'overall18 can still be reached using free-elective upper credits');
 assert(errors.some(error=>error.code==='group_upper'),'exact business-core requirement must fail');
});

test('Accounting importer rejects drift in the corroborated common-credit ledger and invalid four-course selections',async()=>{
 const {buildTESUAccounting}=await load();
 const wrong=clone(baseline);wrong.requirements.find(row=>row.code==='COM-2090').credits=4;assert.throws(()=>buildTESUAccounting(facts,wrong));
 for(const selectedAccounting of [['ACC-3030','ACC-4010','ACC-4020','ACC-4020'],['ACC-3030','ACC-4010','ACC-4020','ACC-9999']])assert.throws(()=>buildTESUAccounting({...clone(facts),degree:{...clone(facts.degree),selectedAccounting}},baseline));
});
