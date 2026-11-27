import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewHealthcareSources,assertHealthcareCourseBody,HEALTHCARE_SOURCE_INDEX} from './scripts/tesu-healthcare-source-review.mjs';

test('Healthcare Management is independently proven from the current exact degree and six complete primary course bodies',async()=>{
 const result=await reviewHealthcareSources();assert.equal(result.totalCredits,120);assert.equal(result.majorCredits,18);assert.equal(result.courseSources,6);assert.equal(result.outsideAwardsCreated,0);assert.equal(result.publicationDecisions,0);
});

test('source-based course validation rejects a newly introduced prerequisite and invented credit or delivery claims',async()=>{
 const {courses}=JSON.parse(await readFile(HEALTHCARE_SOURCE_INDEX,'utf8')),course=courses[0],body=await readFile(course.source.capture,'utf8');
 assertHealthcareCourseBody(course,body);
 assert.throws(()=>assertHealthcareCourseBody(course,body+'\nPrerequisite\nHCM-3080\n'),/new formal prerequisite/);
 assert.throws(()=>assertHealthcareCourseBody({...course,credits:4},body));
 assert.throws(()=>assertHealthcareCourseBody({...course,upper:false},body));
 assert.throws(()=>assertHealthcareCourseBody({...course,deliveryMethods:['Online','e-Pack']},body));
 assert.throws(()=>assertHealthcareCourseBody({...course,code:'HCM-3080'},body),/exact current/);
});

test('actual clicked short URL is retained for HCM-3080; no guessed alias or filename substitutes for its primary identity',async()=>{
 const {courses}=JSON.parse(await readFile(HEALTHCARE_SOURCE_INDEX,'utf8')),course=courses.find(row=>row.code==='HCM-3080');
 assert(course.source.url.endsWith('/3000/hcm-308'));assert(course.source.toolResponseReceipt.sourceUrl===course.source.url);
 const body=await readFile(course.source.capture,'utf8');assertHealthcareCourseBody(course,body);assert(body.startsWith('HCM-3080 Healthcare Legal and Ethical Considerations\n'));
});
