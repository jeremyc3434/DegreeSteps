const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const document=require('./content/curricula/liberty.json');
const load=()=>import('./scripts/add-liberty-official-mappings.mjs');
const row=(model,code)=>model.requirements.find(row=>row.code===code);
const model=id=>document.models.find(model=>model.id===id);
// content/curricula/liberty.json is published by the Liberty pathway kit; its exact official-guide placements are the reviewed guide awards.
const officialPlacements=doc=>doc.models.flatMap(model=>model.requirements.flatMap(requirement=>(requirement.options||[]).filter(option=>option.mappingReviewId==='liberty-official-2026-11-10'&&option.evidence==='published').map(option=>({model,requirement,option}))));
const publishCheck=()=>cp.spawnSync(process.execPath,['scripts/pathway-factory/compile.mjs','liberty','--publish','--check'],{cwd:__dirname,encoding:'utf8',timeout:60000});
test('reviewed exact awards retain modality, identities, credits and guide dates',async()=>{
 const {guideSource}=await load(),published=publishCheck();
 assert.equal(published.status,0,'the committed source is reproducible: '+(published.stderr||published.stdout));
 let count=0;
 for(const {model,requirement,option} of officialPlacements(document)){
  count++;assert.equal(option.mappingReviewId,'liberty-official-2026-11-10');assert.equal(option.credits,requirement.credits);if(option.provider==='CLEP'){assert.equal(option.sourceCredits,undefined);assert.equal(option.sourceCreditSystem,undefined);}else{assert.equal(option.sourceCredits,option.credits);assert.equal(option.sourceCreditSystem,'semester');}assert.equal(option.creditSystem,'semester');assert.equal(option.evidence,'published');assert(option.providerCourseCode);assert(option.conditions.some(note=>/No student award/.test(note)));
  const source=model.sources.find(source=>option.sourceIds.includes(source.id));assert(source);assert.equal(source.guideUpdated,option.guideUpdated);assert.equal(source.checked,'2026-11-10');
  if(option.provider==='CLEP')assert.equal(option.minScore,50);
 }
 assert(count>300);assert.equal(guideSource('Sophia','online').guideUpdated,'2026-07');assert.equal(guideSource('Sophia','residential').guideUpdated,'2026-05');
 const visual=row(model('curriculum-liberty-psychology-bs-online'),'ARTS 209').options.find(option=>option.code==='SOPH-0009');assert.equal(visual.title,'Visual Communications');assert.equal(visual.providerCourseCode,'COMM1005');
});
test('exact major awards improve psychology, business and quantitative requirements',()=>{
 const psychology=model('curriculum-liberty-psychology-bs-online');
 for(const [code,identity]of [['PSYC 255','SDCM-0043'],['PSYC 430','SDCM-0178'],['PSYC 380','SDCM-0181'],['PSYC 365','SDCM-0183'],['PSYC 312','SDCM-0182']])assert(row(psychology,code).options.some(option=>option.code===identity));
 const finance=row(model('curriculum-liberty-business-bs-online'),'BUSI 320').options.find(option=>option.code==='SDCM-0153');assert.equal(finance.sourceCredits,3);assert.equal(finance.receivingCode,'BUSI 320');assert(finance.conditions.some(note=>/Finance Principles/.test(note)));
 assert(row(model('curriculum-liberty-computer-science-general-residential'),'MATH 250').options.some(option=>option.code==='SDCM-0210'));
});
test('exact code matching never upgrades generic electives or bypasses residential restrictions',async()=>{
 const {officialOptions}=await load();
 for(const code of ['CJUS 400','CJUS 340','ACCT 212','BUSI 301','CSCN 112'])assert.deepEqual(officialOptions({code,credits:3},'online'),[]);
 assert.deepEqual(officialOptions({code:'MATH 131',credits:4,institutionalOnly:true},'residential'),[]);
 assert.deepEqual(officialOptions({code:'',credits:3,bucket:true,title:'Criminal Law'},'online'),[]);
 assert(officialOptions({code:'BUSI 105',credits:3},'residential').some(option=>option.code==='SOPH-0014'));assert(!officialOptions({code:'BUSI 105',credits:3},'online').length);
 const statistics=officialOptions({code:'BUSI 230',credits:3},'online').find(option=>option.code==='SOPH-0005');assert.equal(statistics.receivingCode,'MATH 201');assert.equal(statistics.fulfillsCode,'BUSI 230');
});
test('grade scopes and conservative online Business technology credits survive regeneration',()=>{
 const business=model('curriculum-liberty-business-bs-online');assert.equal(row(business,'UNIV 104').credits,3);assert.equal(business.requirements.filter(row=>row.category==='electives').reduce((sum,row)=>sum+row.credits,0),39);assert.equal(business.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(business.majorResidencyBasisCredits,51);assert.equal(row(business,'BUSI 342').minimumGrade,'C');assert.equal(row(business,'ACCT 211').minimumGrade,undefined);
 const human=model('curriculum-liberty-human-services-bs-online');assert.equal(row(human,'PSYC 101').minimumGrade,'C');assert.equal(row(human,'MATH 201').minimumGrade,'C');
 const legacy=require('./dist/data/liberty.json');assert.equal(row(legacy,'BUSI 342').minimumGrade,'C');assert.equal(row(legacy,'ACCT 211').minimumGrade,undefined);assert(legacy.transferWaiverVariant?.requirements.length);
 for(const name of ['online','residential']){const criminal=require('./dist/data/liberty-criminal-justice-'+name+'.json');assert.equal(row(criminal,'CJUS 310').minimumGrade,'C');assert.equal(row(criminal,'CJUS 200').minimumGrade,'C');assert.equal(row(criminal,'CJUS 400').options.filter(option=>option.provider!=='University').length,0);}
});
test('check mode validates upstream artifacts without mutations',async()=>{
 // The three standalone legacy models still take their guide mappings from the importer; content/curricula/liberty.json is checked by the factory publish.
 const {run}=await load(),result=await run({check:true});assert.equal(result.check,true);assert.equal(result.files,3);assert.equal(publishCheck().status,0);
 const identities=new Set(officialPlacements(document).map(({option})=>option.provider+'|'+option.code));
 for(const file of ['liberty','liberty-criminal-justice-online','liberty-criminal-justice-residential'])for(const row of require('./dist/data/'+file+'.json').requirements)for(const option of row.options||[])if(option.mappingReviewId==='liberty-official-2026-11-10')identities.add(option.provider+'|'+option.code);
 assert(identities.size>90);
});
test('the real Guide enforces reviewed CLEP scores while source quantities stay unknown',()=>{
 const Guide=require('./dist/guide-engine.js'),criminal=require('./dist/data/liberty-criminal-justice-online.json');
 const requirement=row(criminal,'GOVT 220'),clep=requirement.options.find(option=>option.code==='CLEP-0007');
 assert.equal(clep.minScore,50);assert.equal(clep.sourceCredits,undefined);assert.equal(clep.sourceCreditSystem,undefined);
 const record={id:'clep-american-government',provider:'CLEP',code:'CLEP-0007',title:'American Government',status:'earned',credits:3,creditSystem:'semester',evaluations:[]};
 assert.equal(Guide.matchInventory(criminal,[{...record,score:49}]).completed.length,0);
 const accepted=Guide.matchInventory(criminal,[{...record,score:50}]);assert.equal(accepted.completed.length,1);assert.equal(accepted.completed[0].requirementId,requirement.id);assert.equal(accepted.completed[0].status,'reported');
});
