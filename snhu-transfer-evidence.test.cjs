const test=require('node:test'),assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const document=require('./content/curricula/snhu.json');
const Guide=require('./dist/guide-engine.js');
const load=()=>import('./scripts/add-snhu-transfer-evidence.mjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const business=document.models.find(model=>/Business Administration/.test(model.title));
const data=document.models.find(model=>/Data Analytics/.test(model.title));
const row=(model,code)=>model.requirements.find(requirement=>requirement.code===code);
const original=(provider,code,extra={})=>({id:provider+'-'+code,provider,code,title:'Original transcript course',credits:3,creditSystem:'semester',status:'earned',evaluations:[],...extra});

test('SNHU source regeneration preserves parallel original courses and both complete ledgers',async()=>{
  const {supplementDocument}=await load();
  assert.deepEqual(supplementDocument(document),document);
  assert.equal(document.models.length,2);
  for(const model of document.models){
    assert.equal(model.requirements.reduce((sum,requirement)=>sum+requirement.credits,0),120);
    for(const code of ['ENG130','ENG190']){
      const choices=row(model,code).options;
      assert.equal(choices.filter(option=>option.provider==='Sophia').length,2);
      assert.equal(choices.filter(option=>option.provider==='Study.com').length,1);
    }
    for(const requirement of model.requirements.filter(requirement=>requirement.category==='electives')){
      assert.deepEqual(requirement.options.filter(option=>option.receivingCode==='GENELE').map(option=>option.code).sort(),['SOPH-0031','SOPH-0066']);
    }
  }
  assert.deepEqual(row(data,'MAT136').options.filter(option=>option.provider==='Sophia').map(option=>option.code).sort(),['SOPH-0001','SOPH-0055']);
});

test('six Study mappings retain independent source quantities and reviewed identity aliases',async()=>{
  const {mappings,reviewId}=await load(),study=mappings.filter(mapping=>mapping.provider==='Study.com');
  assert.equal(study.length,6);
  for(const mapping of study){
    const placements=document.models.flatMap(model=>model.requirements.flatMap(requirement=>requirement.options)).filter(option=>option.provider==='Study.com'&&option.code===mapping.code);
    assert(placements.length>0,mapping.providerCourseCode);
    for(const option of placements){
      assert.equal(option.mappingReviewId,reviewId);assert.equal(option.evidence,'conditional');assert.equal(option.evidenceOrigin,'provider-published-equivalency');
      assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.credits,3);assert.equal(option.creditSystem,'semester');
      assert.equal(option.receivingCode,mapping.receivingCode);assert(option.codeAliases.includes(mapping.providerCourseCode));
      assert(option.identitySourceIds.every(id=>document.sources.some(source=>source.id===id)));
      assert(option.conditions.some(note=>/no individual student award/i.test(note)));assert.equal(option.minScore,undefined);
    }
  }
  const calculus=row(data,'MAT225').options.find(option=>option.code==='SOPH-0060');
  assert.equal(calculus.sourceCredits,4);assert.equal(calculus.credits,3);
});

test('new choices use exact receiving awards and do not manufacture statistics or precalculus substitutions',async()=>{
  const {reviewedOptions}=await load();
  for(const code of ['MAT140','MAT243','DAD220','MKT205','BUS225'])assert.deepEqual(reviewedOptions({code,credits:3,options:[]}),[]);
  assert.deepEqual(reviewedOptions({title:'Principles of Statistics',credits:3,options:[]}),[]);
  assert.deepEqual(reviewedOptions({code:'ENG130',credits:3,institutionalOnly:true}),[]);
  assert.equal(row(data,'MAT243').options.length,0);assert.equal(row(data,'MAT140').options.length,0);
  assert(row(business,'MAT240').options.some(option=>option.code==='SDCM-0068'));
});

test('real Guide matches ACE and original provider codes while rejecting wrong provenance or source quantities',()=>{
  for(const [provider,code]of [['Study.com','SDCM-0057'],['Study.com','English 104'],['Sophia','SOPH-0050'],['Sophia','ENG1010']]){
    const result=Guide.matchInventory(business,[original(provider,code,{grade:'C-'})]);
    assert.equal(result.completed.length,1,provider+' '+code);assert.equal(result.completed[0].requirementId,'eng130');assert.equal(result.completed[0].status,'reported');
  }
  for(const record of [original('Sophia','SDCM-0057'),original('Study.com','SDCM-0057',{credits:4}),original('Study.com','',{title:'College Composition I'})])assert.equal(Guide.matchInventory(business,[record]).completed.length,0);
  const duplicates=Guide.matchInventory(business,[original('Study.com','SDCM-0057'),original('Study.com','English 104')]);
  assert.equal(duplicates.completed.length,1);
  const sameAward=Guide.matchInventory(data,[original('Sophia','SOPH-0001'),original('Sophia','SOPH-0055')]);
  assert.equal(sameAward.completed.length,1,'two source alternatives cannot award MAT136 twice');
});

test('real Guide enforces transfer-only C- and leaves unknown grades conditional',()=>{
  for(const grade of ['D+','D','D-','F','W','I'])assert.equal(Guide.matchInventory(business,[original('Study.com','SDCM-0057',{grade})]).completed.length,0,grade);
  for(const grade of ['C-','C','A','P','']){
    const result=Guide.matchInventory(business,[original('Study.com','SDCM-0057',{grade})]);
    assert.equal(result.completed.length,1,grade||'unknown');assert.equal(result.completed[0].status,'reported');
  }
  assert.equal(business.transferGradePolicy.minimumGrade,'C-');
  assert(business.requirements.every(requirement=>requirement.minimumGrade===undefined));
  const model=clone(business),requirement=row(model,'ENG130');
  requirement.options.push({id:'university-eng130',provider:'University',code:'ENG130',title:requirement.title,credits:3,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:requirement.sourceIds});
  const home=original('University','ENG130',{institution:model.school,sourceProgramId:model.id,creditOrigin:'institutional',grade:'D'});
  assert.equal(Guide.matchInventory(model,[home]).completed.length,1,'transfer policy does not set a university completion minimum');
  const unknownOption=requirement.options.find(option=>option.code==='SDCM-0057');
  assert(unknownOption.conditions.some(note=>/missing grades require SNHU evaluation/.test(note)));
});

test('current school policy and tuition metadata retain unresolved fees',()=>{
  for(const model of document.models){
    assert.equal(model.institutionMinCredits,30);assert.equal(model.externalMaxCredits,90);assert.equal(model.majorMinInstitutionCredits,12);
    assert.equal(model.pricing.model,'per-credit');assert.equal(model.pricing.amount,354);assert.equal(model.pricing.checkedOn,'2026-11-11');
    assert.equal(model.pricing.sourceUrl,'https://www.snhu.edu/tuition-and-financial-aid/online');
    assert(model.pricing.notes.some(note=>/not assumed to be zero/.test(note)));
  }
});

test('SNHU evidence check is idempotent and read-only',async()=>{
  const {run}=await load(),path=new URL('./content/curricula/snhu.json','file://'+__filename),before=await readFile(path,'utf8');
  const result=await run({check:true});assert.equal(result.models,2);assert.equal(result.reviewedProviderCourses,10);assert.equal(result.check,true);
  assert.equal(await readFile(path,'utf8'),before);
});
