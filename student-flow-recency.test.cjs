const test=require('node:test'),assert=require('node:assert/strict'),Guide=require('./dist/guide-engine.js');
const model=require('./dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
function source(completedOn,extra={}){return{id:'original-project-course',provider:'Sophia',code:'SOPH-0013',title:'My completed Project Management course',credits:3,creditSystem:'semester',status:'earned',grade:'A',completedOn,evaluations:[],...extra};}
test('an old completed source course does not satisfy a receiving requirement with a sourced five-year recency rule',context=>{
  context.mock.timers.enable({apis:['Date'],now:new Date('2026-11-17T12:00:00Z')});
  const req=model.requirements.find(req=>req.code==='C722');assert.equal(req.transferRecencyYears,5);assert.equal(model.transferRules.courseSpecificRecencyYears.C722,5);
  const record=source('2018-01-15'),before=structuredClone(record),match=Guide.matchInventory(model,[record]);
  assert(!match.completed.some(placement=>placement.requirementId===req.id),'The published current match does not erase the receiving school’s age limit');assert(match.unmatched.some(item=>item.id===record.id));assert.deepEqual(record,before,'Original historical coursework remains preserved');
});
test('recent work with the same published identity can still fill that requirement provisionally',context=>{
  context.mock.timers.enable({apis:['Date'],now:new Date('2026-11-17T12:00:00Z')});
  const req=model.requirements.find(req=>req.code==='C722'),record=source('2026-11-01'),match=Guide.matchInventory(model,[record]);
  assert(match.completed.some(placement=>placement.requirementId===req.id&&placement.learningId===record.id&&placement.status==='reported'));assert.equal(record.evaluations.length,0);
});
