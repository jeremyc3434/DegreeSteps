'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Assessment=require('./dist/course-assessment.js'),packet=require('./content/discovery/course-assessment-reviews.json');
const {createHash}=require('node:crypto');
const clone=value=>JSON.parse(JSON.stringify(value));
const outside=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3});
test('current universal policies describe only the reviewed course identities and retain identity checks',()=>{
 for(const [provider,code]of[['Sophia','SOPH-0015'],['Study.com','SDCM-0057']]){
  const option=outside(provider,code),fact=Assessment.describe(null,option);assert.equal(fact.status,'unmonitored');assert.match(fact.detail,/Identity verification/i);assert(fact.sources.length>0);assert(Assessment.allowsOption(null,option,{proctoringPreference:'avoid'}));
 }
 assert.equal(Assessment.describe(null,outside('Study.com','unknown-new-course')).status,'unknown');
 assert.equal(Assessment.describe(null,{...outside('Another provider','SOPH-0015'),proctoringRequired:false}).status,'unknown','A loose imported flag or another provider cannot borrow a Sophia policy');
});
test('a secured final, no-final grading table and open-note quizzes remain distinct',()=>{
 const secured=outside('StraighterLine','OOSL-0002'),writing=outside('StraighterLine','OOSL-0005'),cli=outside('Christian Leaders Institute','BIB 111');
 assert.equal(Assessment.describe(null,secured).status,'restricted');assert.match(Assessment.describe(null,secured).detail,/no live proctor/i);assert(!Assessment.allowsOption(null,secured,{proctoringPreference:'avoid'}));
 assert.equal(Assessment.describe(null,writing).status,'unknown');assert.equal(Assessment.describe(null,writing).label,'No final exam listed');assert(Assessment.allowsOption(null,writing,{proctoringPreference:'avoid'}));
 assert.equal(Assessment.describe(null,cli).status,'unknown');assert.match(Assessment.describe(null,cli).label,/open-note/);
 for(const [provider,code]of[['CLEP','CLEP-0041'],['Saylor','SAYA-0044'],['DSST','DANT-0018']])assert.equal(Assessment.describe(null,outside(provider,code)).status,'monitored');
});
test('university assessment claims need the exact model, catalog, format and canonical course',()=>{
 const option=outside('University','ENG 101'),model={id:'test-program',catalogYear:'2026-2027',format:'Online',requirements:[{id:'english',options:[option]}]};
 const data={schemaVersion:1,sources:[{id:'official',url:'https://college.example.edu/course',title:'Course assessment',checkedOn:'2026-11-24',quote:''}],reviews:[{id:'course-review',provider:'University',scope:'course',courseCodes:['ENG 101'],status:'monitored',label:'Monitored exam',detail:'This exact course requires a monitored assessment.',sourceIds:['official'],programBindings:[{modelId:model.id,catalogYear:model.catalogYear,format:'online'}]}]};
 const engine=Assessment.create(data);assert(engine.valid);assert.equal(engine.describe(model,option).status,'monitored');assert(engine.allowsOption(model,option,{proctoringPreference:'avoid'}),'An outside-course preference cannot eliminate required university work');
 for(const change of[{id:'other'},{catalogYear:'2025-2026'},{format:'Residential'},{requirements:[]}])assert.equal(engine.describe({...model,...change},option).status,'unknown');
 const invalid=clone(data);invalid.reviews[0].scope='provider-policy';assert(!Assessment.create(invalid).valid);
 const badCatalog=clone(data);badCatalog.reviews[0].programBindings[0].catalogYear='2026-2029';assert(!Assessment.create(badCatalog).valid);
});
test('remaining-course counts deduplicate source bundles and exclude historical credit rows',()=>{
 const study=outside('Study.com','SDCM-0057'),sophia={...outside('Sophia','SOPH-0015'),bundleId:'same-source'},uni=outside('University','CAP 400');
 const plan={rows:[{requirementId:'finished',status:'confirmed',credits:3,option:study},{requirementId:'reported',status:'reported',credits:3,option:study},{requirementId:'one',status:'planned',credits:3,option:sophia},{requirementId:'two',status:'planned',credits:3,option:sophia},{requirementId:'uni',status:'planned',credits:3,option:uni},{requirementId:'unplaced',status:'planned',credits:3,option:null}]},before=clone(plan);
 const summary=Assessment.summarize({id:'test-program'},plan);assert.deepEqual(summary.outside,{total:1,unmonitored:1,monitored:0,restricted:0,unknown:0});assert.equal(summary.university.unknown,1);assert.equal(summary.unplaced,1);assert.deepEqual(summary.courses[0].requirementIds,['one','two']);assert.deepEqual(plan,before);
});
test('unsafe or ambiguous evidence fails closed and returned facts cannot mutate later answers',()=>{
 const option=outside('Sophia','SOPH-0015'),first=Assessment.describe(null,option);first.sources[0].url='https://changed.example';assert.notEqual(Assessment.describe(null,option).sources[0].url,first.sources[0].url);
 const bad=clone(packet);bad.sources[0].url='https://user:password@example.edu/';const engine=Assessment.create(bad);assert(!engine.valid);assert.equal(engine.describe(null,option).status,'unknown');
 const duplicate=clone(packet);duplicate.reviews.push({...clone(duplicate.reviews[0]),id:'other-policy'});assert(!Assessment.create(duplicate).valid);
});
test('expired or future reviews cannot advertise an unmonitored course',()=>{
 const option=outside('Sophia','SOPH-0015');
 assert.equal(Assessment.describe(null,option,'2026-11-23').status,'unknown');
 assert.equal(Assessment.describe(null,option,'2027-02-22').status,'unmonitored');
 assert.equal(Assessment.describe(null,option,'2027-02-23').status,'unknown');
 assert.equal(Assessment.create(packet,{asOf:'2027-02-23'}).statusFor(null,option),'unknown');
 assert(!Assessment.create(packet,{asOf:'2026-02-30'}).valid);
});
test('all outside options in every currently published template have researched identities without making university claims',()=>{
 const publication=require('./dist/data/publication-index.json'),registry=require('./dist/data/curriculum-registry.json'),quality=require('./dist/data/pathway-quality-report.json'),ids=new Set(publication.plans.filter(item=>item.publicationReady).map(item=>item.modelId)),models=new Map(),identities=new Map();
 assert(ids.size>0,'Assessment coverage must inspect a nonempty published library');assert.equal(ids.size,quality.summary.publicationReady);
 assert.deepEqual([...ids].sort(),quality.programs.filter(program=>program.publication.ready).map(program=>program.modelId).sort(),'The entire quality-approved library must receive assessment coverage');
 for(const entry of registry.models.filter(entry=>ids.has(entry.id))){const data=require('./dist/'+entry.path);for(const model of Array.isArray(data)?data:data.models||[data])if(ids.has(model.id))models.set(model.id,model);}
 assert.deepEqual([...models.keys()].sort(),[...ids].sort(),'Every currently published model must actually be inspected');
 const expected=new Set([...models.values()].flatMap(model=>model.requirements.flatMap(row=>row.options.filter(option=>option.provider!=='University').map(option=>option.provider+':'+option.code)))),reviews=new Map(packet.reviews.map(review=>[review.id,review]));
 for(const model of models.values())for(const row of model.requirements)for(const option of row.options){const fact=Assessment.describe(model,option);if(option.provider==='University'){assert.equal(fact.status,'unknown');continue;}assert(fact.reviewId,option.provider+' '+option.code+' has its own reviewed identity');assert(fact.sources.length>0);const review=reviews.get(fact.reviewId);assert(review,'Every described assessment must cite an actual reviewed policy');assert.equal(fact.status,review.status);identities.set(option.provider+':'+option.code,fact.status);}
 assert(expected.size>0);assert.deepEqual([...identities.keys()].sort(),[...expected].sort(),'New published source identities must receive the same review coverage as existing ones');
 assert.equal(identities.get('Study.com:SDCM-0068'),'unmonitored','The independently verified Statistics expansion is covered by its actual Study.com assessment review');
 assert.equal(identities.get('Sophia:SOPH-0015'),'unmonitored');assert.equal(identities.get('StraighterLine:OOSL-0002'),'restricted');
});
test('new BSDA assessment reviews retain captured original-course identities and distinguish explicit facts from unknown requirements',()=>{
 const engine=Assessment.create(packet,{asOf:'2026-11-25'});assert(engine.valid);
 const bindings=[['Sophia','SOPH-0062','sophia-soph-0062-assessments-2026-11-25'],['Study.com','SDCM-0210','study-sdcm-0210-assessments-2026-11-25'],['Study.com','SDCM-0218','study-sdcm-0218-assessments-2026-11-25']];
 for(const [provider,code,id]of bindings){
  const review=packet.reviews.find(review=>review.id===id),source=packet.sources.find(source=>source.id===id),identity=review.courseIdentity;
  assert.equal(review.scope,'course');assert.deepEqual(review.courseCodes,[code]);assert.equal(identity.aceId,code);assert.equal(identity.sourceCredits,3);assert.equal(identity.sourceCreditSystem,'semester');assert.deepEqual(identity.sourceIds,[id]);
  assert.equal(source.provider,provider);assert(source.courseCodes.includes(code)&&source.courseCodes.includes(identity.providerCourseCode));assert(review.sourceIds.includes(id));
  const text=fs.readFileSync(source.capture,'utf8'),meta=JSON.parse(fs.readFileSync(source.capture.replace(/\.txt$/,'.json'),'utf8')),digest=createHash('sha256').update(text).digest('hex');
  assert.equal(digest,source.sha256);assert.equal(digest,meta.sha256||meta.extractedTextSha256);assert.equal(meta.url,source.url);
  const normalize=value=>value.replace(/\s+/g,' ');assert(normalize(text).includes(normalize(source.quote)));assert(text.includes(code)&&text.includes(identity.providerCourseCode));
  assert.equal(source.rawBodyCaptured,false);assert.equal(review.reviewedAssessmentFacts.requiredLab,null);assert(review.reviewMethod.trim());
  const fact=engine.describe(null,outside(provider,code));assert.equal(fact.reviewId,id);assert.equal(fact.scope,'course');assert.equal(fact.status,'unmonitored');assert(fact.sources.some(source=>source.id===id));
  assert.equal(engine.describe(null,outside(provider,code),'2026-11-24').status,'unknown','The new exact course review cannot be applied before it was checked');
  assert.equal(engine.describe(null,outside(provider,code),'2027-02-23').status,'unknown','Expired provider policy cannot be replaced by a newer identity capture');
 }
 const java=packet.reviews.find(review=>review.id===bindings[0][2]),math=packet.reviews.find(review=>review.id===bindings[1][2]),database=packet.reviews.find(review=>review.id===bindings[2][2]);
 assert.equal(java.reviewedAssessmentFacts.touchstones,1);assert.equal(java.reviewedAssessmentFacts.separateFinalExam,null);assert.equal(java.reviewedAssessmentFacts.exclusivelyWrittenAssessment,null);
 assert(java.sourceIds.includes('sophia-assessments-2026'));assert(math.sourceIds.includes('study-exam-policies-2026'));assert(database.sourceIds.includes('study-no-proctor-2026'));
 assert.equal(math.reviewedAssessmentFacts.finalExam,true);assert.equal(database.reviewedAssessmentFacts.finalExam,false);assert.equal(database.reviewedAssessmentFacts.sqlAssignments,3);assert.match(database.detail,/no final exam/);
 assert.equal(engine.describe(null,outside('Study.com','unknown-new-course')).status,'unknown');assert.equal(engine.describe(null,outside('University','D427')).status,'unknown');
});
test('browser and CommonJS use identical reviewed policies',()=>{
 const context={URL,console};vm.runInNewContext(fs.readFileSync('dist/course-assessment.js','utf8'),context);assert(context.DegreeCourseAssessment.valid);
 for(const [provider,code]of[['Sophia','SOPH-0015'],['StraighterLine','OOSL-0002'],['StraighterLine','OOSL-0005'],['Christian Leaders Institute','BIB 111']])assert.deepEqual(clone(context.DegreeCourseAssessment.describe(null,outside(provider,code))),Assessment.describe(null,outside(provider,code)));
});
