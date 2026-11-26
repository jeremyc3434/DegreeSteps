'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const packet=require('./content/discovery/course-assessment-reviews.json'),Assessment=require('./dist/course-assessment.js').create(packet,{asOf:'2026-11-25'});
test('expanded current Study identities retain the documented College Saver and Pro assessment format',()=>{
 for(const code of['SDCM-0006','SDCM-0028','SDCM-0034','SDCM-0058','SDCM-0196','SDCM-0199','SDCM-0201','SDCM-0212','SDCM-0213','SDCM-0216','SDCM-0219','SDCM-0220','SDCM-0240','SDCM-0249','SDCM-0253','SDCM-0255','SDCM-0259']){const option={provider:'Study.com',code};assert.equal(Assessment.describe(null,option).status,'unmonitored',code);assert(Assessment.allowsOption(null,option,{proctoringPreference:'avoid'}),code);}
 const unchangedPolicyIds=['study-no-proctor-2026','study-identity-verification-2026','study-exam-policies-2026'];
 for(const id of unchangedPolicyIds){const source=packet.sources.find(source=>source.id===id);assert(source,id);assert.equal(source.checkedOn,'2026-11-24','Adding current course bindings does not refresh unchanged policy evidence.');}
 const newCourseSources=[['sophia-soph-0062-assessments-2026-11-25','Sophia','SOPH-0062'],['study-sdcm-0210-assessments-2026-11-25','Study.com','SDCM-0210'],['study-sdcm-0218-assessments-2026-11-25','Study.com','SDCM-0218']];
 for(const [id,provider,code] of newCourseSources){const source=packet.sources.find(source=>source.id===id);assert(source,id);assert.equal(source.checkedOn,'2026-11-25',id+' retains its independently reviewed course-evidence date');assert.equal(source.provider,provider);assert(source.courseCodes.includes(code));}
 assert.deepEqual(packet.sources.filter(source=>source.id.startsWith('study-')).map(source=>source.id).sort(),[...unchangedPolicyIds,...newCourseSources.filter(([id])=>id.startsWith('study-')).map(([id])=>id)].sort(),'Every Study source has an explicit reviewed date expectation.');
});
test('UPI current nonlab courses honor an avoid-proctor preference and do not extend to unknown lab codes',()=>{
 const review=packet.reviews.find(r=>r.id==='upi-current-nonlab-proctored-finals');assert.equal(review.courseCodes.length,22);
 for(const code of review.courseCodes){const option={provider:'UPI Study',code};assert.equal(Assessment.describe(null,option).status,'monitored',code);assert.equal(Assessment.allowsOption(null,option,{proctoringPreference:'avoid'}),false,code);}
 assert.equal(Assessment.describe(null,{provider:'UPI Study',code:'UNREVIEWED-LAB'}).status,'unknown');
});

test('UPI catalog filters expose only source-grounded ACE, pace and assessment badges for the current version',()=>{
 const Attributes=require('./dist/course-attributes.js'),catalog=require('./dist/data/course-catalog.json'),data=require('./dist/data/course-attributes.json');
 const courses=catalog.courses.filter(course=>course.provider==='UPI Study');assert.equal(courses.length,22);
 for(const course of courses){const fact=Attributes.resolve(course,data,'2026-11-25');assert.equal(fact.pace,'self-paced',course.mappingCode);assert.equal(fact.creditOrigin,'ace',course.mappingCode);assert.equal(fact.assessment,'proctored',course.mappingCode);assert.equal(Attributes.matches(course,data,{assessment:'no-proctor'},'2026-11-25'),false);const changed={...course,courseVersion:Number(course.courseVersion)+1};assert.equal(Attributes.resolve(changed,data,'2026-11-25').creditOrigin,'unknown','An unsupported new source version does not inherit the old ACE badge.');}
});
