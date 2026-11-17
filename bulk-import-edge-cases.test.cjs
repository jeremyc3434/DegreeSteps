/* Lower-level academic guards for reviewed bulk rows. Uploaded IDs, catalog trust,
 * conflict consent and concurrent-preview checks belong to the import boundary. */
const test=require('node:test'),assert=require('node:assert/strict');
const Sheet=require('./dist/sheet-state.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function source(id,patch={}){return{id,provider:'Example Original College',code:id,title:'Synthetic course '+id,credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-01-15',grade:'A',evaluations:[],...patch};}
function state(records=[]){return{version:3,profile:{hasPrior:'some',goal:'any-degree'},selectedPathwayId:'keep-my-degree',learning:copy(records),scenarios:{'keep-my-degree':{optionSelections:{writing:'specific-course'}}},sheet:{notes:{degree:{course:'Keep private note'}}},savings:{degree:{tuitionEstimate:1000}},checklist:{version:1,plans:{}}};}
test('a reviewed mixed batch preserves original quarter/CU units, unknowns and unearned statuses',()=>{
  const original=state(),before=copy(original),rows=[source('quarter-course',{credits:4,creditSystem:'quarter',grade:'B+'}),source('competency-course',{provider:'Example Competency University',creditSystem:'competency-unit',grade:'Pass'}),source('exam',{provider:'CLEP',code:'American Government',title:'American Government',grade:'',score:63}),source('saved-unknown',{credits:null,creditSystem:null,status:'saved',grade:'',completedOn:''}),source('taking-course',{status:'in-progress',grade:'',completedOn:''}),source('finished-unknown',{credits:null,creditSystem:null,grade:'',completedOn:''})];
  const next=Sheet.mergeLearning(original,rows);assert.deepEqual(original,before,'Preparing a batch must not mutate the current collection');assert.equal(next.learning.length,6);
  assert.equal(next.learning[0].credits,4);assert.equal(next.learning[0].creditSystem,'quarter');assert.equal(next.learning[1].credits,3);assert.equal(next.learning[1].creditSystem,'competency-unit');assert.equal(next.learning[1].grade,'PASS');assert.equal(next.learning[2].score,63);
  for(const id of ['saved-unknown','finished-unknown']){const row=next.learning.find(item=>item.id===id);assert.equal(row.credits,null);assert.equal(row.creditSystem,null);}
  assert.equal(next.learning.find(item=>item.id==='saved-unknown').status,'saved');assert.equal(next.learning.find(item=>item.id==='taking-course').status,'in-progress');assert(next.learning.every(item=>item.evaluations.length===0));
  for(const field of ['selectedPathwayId','scenarios','sheet','savings','checklist'])assert.deepEqual(next[field],original[field]);
});
test('a later conflicting duplicate cannot partially mutate a previously reviewed collection',()=>{
  const existing=source('kept-course',{evaluations:[{programId:'degree',requirementId:'writing',status:'confirmed'}]}),original=state([existing]),before=copy(original),rows=[source('new-course'),source('repeated-course'),source('repeated-course',{credits:4})];
  assert.throws(()=>Sheet.mergeLearning(original,rows),/conflict|duplicate/i);assert.deepEqual(original,before,'A failed batch must leave existing records and evaluations intact');
});
test('identical rows do not duplicate original learning or replace an unchanged school evaluation',()=>{
  const existing=source('kept-course',{evaluations:[{programId:'degree',requirementId:'writing',status:'confirmed'}]}),original=state([existing]),incoming=source('new-upload-id',{code:'kept-course',title:existing.title}),next=Sheet.mergeLearning(original,[incoming,copy(incoming)]);
  assert.equal(next.learning.length,1);assert.equal(next.learning[0].id,existing.id);assert.deepEqual(next.learning[0].evaluations,existing.evaluations);assert.deepEqual(original.learning,[existing]);
});
test('evaluation claims inside imported rows never become school-confirmed awards',()=>{
  const rows=[source('untrusted-claim',{evaluations:[{programId:'degree',requirementId:'writing',status:'confirmed',optionId:'school-option'}]})],before=copy(rows),next=Sheet.mergeLearning(state(),rows);
  assert.deepEqual(next.learning[0].evaluations,[]);assert.deepEqual(rows,before,'The source proposal stays available for review without being mutated');
});
test('unsupported units and invalid dates stop the batch without changing saved facts',()=>{
  for(const invalid of [{creditSystem:'ECTS'},{completedOn:'2026-02-30'},{completedOn:'11/12/23'},{credits:0},{grade:'invented grade'}]){
    const original=state([source('kept-course')]),before=copy(original);assert.throws(()=>Sheet.mergeLearning(original,[source('first-valid-course'),source('bad-course',invalid)]));assert.deepEqual(original,before);
  }
});
test('matching course codes at different original colleges remain separate source records',()=>{
  const rows=[source('first-college',{provider:'Example First College',code:'ENG101'}),source('second-college',{provider:'Example Second College',code:'ENG101',creditSystem:'quarter',credits:4})],next=Sheet.mergeLearning(state(),rows);
  assert.equal(next.learning.length,2);assert.equal(next.learning[0].provider,'Example First College');assert.equal(next.learning[1].provider,'Example Second College');assert.equal(next.learning[0].creditSystem,'semester');assert.equal(next.learning[1].creditSystem,'quarter');
});
