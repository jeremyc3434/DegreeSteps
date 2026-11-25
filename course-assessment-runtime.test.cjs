'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Assessment=require('./dist/course-assessment.js'),packet=require('./content/discovery/course-assessment-reviews.json');
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
test('all outside options in the 22 published templates have researched identities without making university claims',()=>{
 const publication=require('./dist/data/publication-index.json'),registry=require('./dist/data/curriculum-registry.json'),ids=new Set(publication.plans.filter(item=>item.publicationReady).map(item=>item.modelId)),models=new Map(),identities=new Map();assert.equal(ids.size,22);
 for(const entry of registry.models.filter(entry=>ids.has(entry.id))){const data=require('./dist/'+entry.path);for(const model of Array.isArray(data)?data:data.models||[data])if(ids.has(model.id))models.set(model.id,model);}
 for(const model of models.values())for(const row of model.requirements)for(const option of row.options){const fact=Assessment.describe(model,option);if(option.provider==='University'){assert.equal(fact.status,'unknown');continue;}assert(fact.reviewId,option.provider+' '+option.code+' has its own reviewed identity');assert(fact.sources.length>0);identities.set(option.provider+':'+option.code,fact.status);}
 assert.equal(identities.size,219);assert.equal([...identities.values()].filter(status=>status==='unmonitored').length,134);assert.equal([...identities.values()].filter(status=>status==='restricted').length,18);
});
test('browser and CommonJS use identical reviewed policies',()=>{
 const context={URL,console};vm.runInNewContext(fs.readFileSync('dist/course-assessment.js','utf8'),context);assert(context.DegreeCourseAssessment.valid);
 for(const [provider,code]of[['Sophia','SOPH-0015'],['StraighterLine','OOSL-0002'],['StraighterLine','OOSL-0005'],['Christian Leaders Institute','BIB 111']])assert.deepEqual(clone(context.DegreeCourseAssessment.describe(null,outside(provider,code))),Assessment.describe(null,outside(provider,code)));
});
