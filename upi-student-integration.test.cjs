'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Library=require('./dist/course-library-engine.js'),Sheet=require('./dist/sheet-state.js'),View=require('./dist/course-plan-view.js');
const course={id:'upi-reviewed-course',provider:'UPI Study',title:'Principles of Statistics',code:null,mappingCode:'UPIS-0003',providerCourseCode:'Statistics 101',credits:3,creditSystem:'semester',creditOrigin:'alternative',courseVersion:'1',recommendationStart:'2024-09-01',recommendationEnd:'2027-08-31',url:'https://www.upistudy.com/courses/principles-of-statistics',creditBasis:'reviewed-provider-and-ace'};
test('a saved UPI course preserves its independent original version, quantity and dates without awarding credit',()=>{
 const initial=Library.initialize(null),next=Library.saveCourse(initial,course),record=next.learning[0];
 assert.equal(initial.learning.length,0);assert.equal(record.status,'saved');assert.equal(record.code,'UPIS-0003');assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.equal(record.courseVersion,'1');assert.equal(record.creditOrigin,'alternative');assert.equal(record.recommendationStart,'2024-09-01');assert.equal(record.recommendationEnd,'2027-08-31');assert.deepEqual(record.evaluations,[]);assert.equal(Library.courseKind(course),'course');
 assert.equal(Library.saveCourse(next,course).learning.length,1);
 const links=View.courseLinks(course,{courses:[course]});assert.equal(links.courseUrl,course.url);assert.equal(links.providerUrl,'https://www.upistudy.com/collections');
});
test('correcting source identity clears stale recommendation metadata and changing a version invalidates old evaluation claims',()=>{
 const initial=Library.saveCourse(Library.initialize(null),course),record=initial.learning[0];record.status='earned';record.evaluations=[{programId:'sample-program',requirementId:'sample-row',status:'confirmed'}];
 const versionChange=Sheet.updateLearning(initial,{...record,courseVersion:'2'});assert.equal(versionChange.learning[0].courseVersion,'2');assert.deepEqual(versionChange.learning[0].evaluations,[]);assert.equal(initial.learning[0].courseVersion,'1');
 const sourceChange=Sheet.updateLearning(initial,{...record,provider:'Other College',code:'STAT101'});for(const field of['courseVersion','recommendationStart','recommendationEnd','catalogCourseId'])assert.equal(sourceChange.learning[0][field],undefined,field);assert.deepEqual(sourceChange.learning[0].evaluations,[]);
});
