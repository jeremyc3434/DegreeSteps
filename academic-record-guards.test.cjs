const test=require('node:test'),assert=require('node:assert/strict');
const Guide=require('./dist/guide-engine.js'),Sheet=require('./dist/sheet-state.js'),Planner=require('./dist/planner.js');
const source={id:'school',url:'https://example.edu/degree/'};
const option=(provider,code,extra={})=>({id:provider+'-'+code,provider,code,title:code,credits:3,sourceIds:['school'],evidence:'published',...extra});
const model=()=>({id:'new-degree',school:'Example University',title:'Example degree',totalCredits:3,creditSystem:'semester',institutionMinCredits:0,sources:[source],requirements:[{id:'english',code:'ENG101',title:'Composition',credits:3,category:'general',minimumGrade:'C',options:[option('Sophia','SOPH-0015'),option('University','ENG101')]}]});
const record=(extra={})=>({id:'source',provider:'Sophia',code:'SOPH-0015',title:'Composition',credits:3,creditSystem:'semester',status:'earned',evaluations:[],...extra});
test('a known failing or insufficient grade does not satisfy a sourced minimum',()=>{
 for(const grade of['D','C-','F','W','I'])assert.equal(Guide.matchInventory(model(),[record({grade})]).completed.length,0,grade);
 assert.equal(Guide.matchInventory(model(),[record({grade:'C'})]).completed[0].status,'reported');
 assert.equal(Guide.matchInventory(model(),[record()]).completed[0].status,'reported','Unknown grade is pending review, never a confirmed award');
});
test('an explicit placement does not override a known failing grade',()=>{assert.equal(Guide.matchInventory(model(),[record({grade:'D',evaluations:[{programId:'new-degree',requirementId:'english',optionId:'Sophia-SOPH-0015',status:'confirmed'}]})]).completed.length,0);});
test('published exam score and completion-date recommendation limits apply to original records',()=>{
 const m=model();m.requirements[0].options[0]={...option('CLEP','CLEP-1'),minScore:50,recommendationStart:'2024-01-01',recommendationEnd:'2026-12-31'};
 assert.equal(Guide.matchInventory(m,[record({provider:'CLEP',code:'CLEP-1',score:49,completedOn:'2025-01-01'})]).completed.length,0);
 assert.equal(Guide.matchInventory(m,[record({provider:'CLEP',code:'CLEP-1',score:50,completedOn:'2023-12-31'})]).completed.length,0);
 assert.equal(Guide.matchInventory(m,[record({provider:'CLEP',code:'CLEP-1',score:50,completedOn:'2025-01-01'})]).completed[0].status,'reported');
});
test('the same original university course can provisionally follow a student into another degree at that university',()=>{
 const original=record({provider:'University',code:'ENG101',institution:'Example University',sourceProgramId:'previous-degree',grade:'B'}),before=JSON.stringify(original);
 const match=Guide.matchInventory(model(),[original]);assert.equal(match.completed[0].optionId,'University-ENG101');assert.equal(match.completed[0].status,'reported');assert.equal(JSON.stringify(original),before);
 for(const change of[{institution:'Another University'},{creditOrigin:'ace'},{code:'ENG102'}])assert.equal(Guide.matchInventory(model(),[{...original,...change}]).completed.length,0);
});
test('changing a recorded grade clears old placement confirmations and CSV preserves supplied grades and scores',()=>{
 const records=Sheet.parseCSV('provider,code,title,credits,creditSystem,status,grade,score\nCLEP,CLEP-1,Exam,3,semester,earned,P,51');assert.equal(records[0].grade,'P');assert.equal(records[0].score,51);
 const state={learning:[{...record({grade:'B'}),evaluations:[{programId:'new-degree',requirementId:'english',status:'confirmed'}]}]};const next=Sheet.updateLearning(state,{...state.learning[0],grade:'D'});assert.deepEqual(next.learning[0].evaluations,[]);assert.equal(state.learning[0].grade,'B');
});
test('different providers cannot award the same receiving-school course twice',()=>{
 const m=model();m.totalCredits=6;m.requirements[0].options[0].receivingCode='ENG101';m.requirements.push({id:'elective',code:'ELEC101',title:'Elective',credits:3,category:'elective',options:[option('Study.com','ENGLISH-101',{receivingCode:'ENG101'}),option('University','ELEC101')]});
 const plan=Planner.generate(m,{providers:['Sophia','Study.com'],allowConditional:true,priority:'transfer'});assert.equal(plan.totals.external,3);assert(!plan.validation.errors.some(error=>error.code==='duplicate_receiving_course'));
});
