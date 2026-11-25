'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Features=require('./dist/course-attributes.js'),data=require('./dist/data/course-attributes.json'),catalog=require('./dist/data/course-catalog.json'),index=require('./dist/data/curriculum-course-index.json');
const today='2026-11-19',all=[...catalog.courses,...index.courses],find=id=>all.find(c=>c.id===id);
test('actual current offerings show reviewed features and the same values drive course filters',()=>{
 const studyRow=data.courses.find(r=>r.code==='SDCM-0001'),study=find(studyRow.courseIds[0]),features=Features.resolve(study,data,today);
 assert.equal(features.assessment,'no-proctor');assert.equal(features.pace,'self-paced');assert.equal(features.creditOrigin,'ace');assert.equal(features.badges.length,3);assert(Features.matches(study,data,{assessment:'no-proctor',pace:'self-paced',creditOrigin:'ace'},today));assert(!Features.matches(study,data,{assessment:'proctored'},today));
 assert(features.evidence.every(e=>e.checkedOn&&e.sources.every(s=>s.url.startsWith('https://'))));
 const sl=all.find(c=>c.provider==='StraighterLine'&&data.policies.find(p=>p.provider==='StraighterLine').courseIds.includes(c.id));assert.equal(Features.resolve(sl,data,today).assessment,'unknown','A directory-wide StraighterLine listing does not establish monitoring for this course');assert.equal(Features.resolve(sl,data,today).pace,'self-paced');assert(!Features.matches(sl,data,{assessment:'no-proctor'},today));
});
test('unknown and unreviewed course versions never inherit an ACE or no-proctor claim',()=>{
 const r=data.courses.find(r=>r.provider==='Study.com'),c=find(r.courseIds[0]);
 assert.equal(Features.resolve({...c,recommendationVersion:'999'},data,today).assessment,'unknown');assert.equal(Features.resolve({...c,recommendationEnd:'2020-01-01'},data,today).creditOrigin,'unknown');
 assert.equal(Features.resolve({...c,id:'a-different-course'},data,today).creditOrigin,'unknown');assert.equal(Features.resolve({...c,provider:'Another school'},data,today).assessment,'unknown');
 assert.equal(Features.resolve(c,data,'2030-01-01').creditOrigin,'unknown');assert(Features.matches({id:'unknown',provider:'Sophia'},data,{pace:'unknown',assessment:'unknown'},today));
});
test('Sophia source credit and self-paced status are independent; accreditation and acceptance are never inferred',()=>{
 const reviewed=data.courses.find(r=>r.provider==='Sophia'),c=find(reviewed.courseIds[0]),unreviewed=catalog.courses.find(c=>c.provider==='Sophia'&&!data.courses.some(r=>r.courseIds.includes(c.id)));
 assert.equal(Features.resolve(c,data,today).creditOrigin,'ace');assert.equal(Features.resolve(unreviewed,data,today).pace,'self-paced');assert.equal(Features.resolve(unreviewed,data,today).creditOrigin,'unknown');assert.equal(Features.resolve(unreviewed,data,today).assessment,'unknown');
 for(const course of [c,unreviewed])assert(!Features.resolve(course,data,today).badges.some(b=>/accredited|accepted|approved/i.test(b.label)));
});
test('exact course overrides defeat provider assumptions and unsafe or stale evidence stays neutral',()=>{
 const c={id:'one',provider:'Source'},policy={provider:'Source',courseIds:['one'],checkedOn:today,attributes:{assessment:'no-proctor'},sources:[{url:'https://example.edu/policy'}]};
 let d={policies:[policy],courses:[{...policy,attributes:{assessment:'proctored'}}]};assert.equal(Features.resolve(c,d,today).assessment,'proctored');
 d={policies:[{...policy,sources:[{url:'javascript:alert(1)'}]}],courses:[]};assert.equal(Features.resolve(c,d,today).assessment,'unknown');
 d={policies:[{...policy,checkedOn:'2026-01-01'}],courses:[]};assert.equal(Features.resolve(c,d,today).assessment,'unknown');
 assert.equal(Features.resolve(c,{policies:[{...policy,checkedOn:'2027-01-01'}]},today).assessment,'unknown');
});
test('feature reads and filtering do not change original course records or their receiving evidence',()=>{
 const course=JSON.parse(JSON.stringify(all.find(c=>c.provider==='Study.com'))),before=JSON.stringify(course);
 Features.resolve(course,data,today);Features.matches(course,data,{assessment:'unknown'},today);assert.equal(JSON.stringify(course),before);
 const ids=new Set(all.map(c=>c.id));for(const r of [...data.policies,...data.courses])for(const id of r.courseIds)assert(ids.has(id),id);
 assert(data.providers.some(p=>p.id==='asu-ulc'));assert(data.providers.some(p=>p.id==='saylor'));
});
