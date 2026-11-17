const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Library=require('./dist/course-library-engine.js'),Guide=require('./dist/guide-engine.js');
test('the actual primary Business Law listing saves its reviewed identity and projects two WGU CUs from three source credits',()=>{
 const source=require('./dist/data/course-catalog.json').courses.find(course=>course.provider==='Sophia'&&course.url==='https://www.sophia.org/online-courses/business/business-law/'),model=require('./dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
 const state=Library.saveCourse(Library.initialize(null),source),record=state.learning[0],before=JSON.stringify(record),matched=Guide.matchCollection(model,state.learning);
 assert.equal(record.code,'SOPH-0032');assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.equal(record.status,'saved');assert(matched.placements.some(row=>row.requirementId===model.requirements.find(req=>req.code==='D078').id&&row.credits===2));assert.equal(JSON.stringify(record),before);assert.deepEqual(record.evaluations,[]);
});
