const test=require('node:test'),assert=require('node:assert/strict');
const Guide=require('./dist/guide-engine.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Checklist=require('./dist/student-checklist.js');
const catalog=require('./dist/data/pathways.json'),models=['tesu','liberty'].map(name=>require('./dist/data/'+name+'.json'));
const copy=value=>JSON.parse(JSON.stringify(value));
function initial(){const model=models[0],route=catalog.pathways.find(row=>row.modelId===model.id);return Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);}
const draft=state=>Journey.buildDraft(state,catalog,models),tasks=state=>Checklist.build(state,draft(state));
const task=(state,id)=>tasks(state).tasks.find(row=>row.id===id);
function status(state,id,value){return Checklist.apply(state,draft(state),{type:'set-task',taskId:id,status:value,planContext:tasks(state).planContext});}

test('optional learner context is bounded and never adds defaults or replaces the target identity',()=>{
 const legacy=Guide.normalizeProfile({school:'Target University',degree:'Target degree'});
 for(const name of ['learnerStage','currentSchool','currentProgram','planningIntent'])assert(!Object.hasOwn(legacy,name));
 const profile=Guide.normalizeProfile({...legacy,learnerStage:'enrolled',currentSchool:'  Current\nCollege '+ 'x'.repeat(160),currentProgram:'MyPath\u0000 Business '+ 'y'.repeat(200),planningIntent:'finish-current'});
 assert.equal(profile.school,legacy.school);assert.equal(profile.degree,legacy.degree);assert.equal(profile.currentSchool.length,120);assert.equal(profile.currentProgram.length,160);assert(!/[\u0000-\u001f]/.test(profile.currentSchool+profile.currentProgram));assert.equal(profile.planningIntent,'finish-current');
 assert(!Object.hasOwn(Guide.normalizeProfile({learnerStage:'returning',planningIntent:'finish-current'}),'planningIntent'));
 assert(!Object.hasOwn(Guide.normalizeProfile({learnerStage:'invalid'}),'learnerStage'));
});
test('sheet reload keeps current-school context separate and preserves legacy original records byte for byte',()=>{
 const saved=initial();saved.profile={...saved.profile,learnerStage:'enrolled',currentSchool:'UMass Global',currentProgram:'MyPath business',planningIntent:'finish-current'};
 saved.learning=[{id:'old-1999',provider:'Former College',institution:'Former College',code:'BUS101',title:'Business',credits:3,creditSystem:'semester',grade:'B+',completedOn:'1999-05-21',status:'earned',evaluations:[{programId:'older-program',requirementId:'old-placement',status:'confirmed'}],privateNote:'Keep original'}];saved.sheet.notes={private:'Keep this note'};
 const before=JSON.stringify(saved.learning),next=Sheet.initialize(JSON.stringify(saved),null,catalog);
 assert.equal(next.profile.currentSchool,'UMass Global');assert.equal(next.profile.school,saved.profile.school);assert.equal(next.selectedPathwayId,saved.selectedPathwayId);assert.equal(JSON.stringify(next.learning),before);assert.deepEqual(next.sheet.notes,saved.sheet.notes);
 const old=initial(),reloaded=Sheet.initialize(JSON.stringify(old),null,catalog);for(const key of ['learnerStage','currentSchool','currentProgram','planningIntent'])assert(!Object.hasOwn(reloaded.profile,key));
});
test('an enrolled student gets audit and course-approval actions instead of new-admission tasks',()=>{
 const state=initial();state.profile={...state.profile,learnerStage:'enrolled',currentSchool:'UMass Global',currentProgram:'Business',planningIntent:'finish-current'};const before=JSON.stringify(state);
 assert(task(state,'current-degree-audit'));assert.equal(task(state,'current-degree-audit').href,'degree-audit.html');assert.match(task(state,'current-degree-audit').detail,/proposed workspace/);
 assert.match(task(state,'outside-course-approval').detail,/before you pay/);assert.equal(task(state,'outside-course-approval').href,'portal.html?view=school&action=outside-course-approval');
 for(const id of ['check-application-deadline','check-transfer-deadline','enroll-at-school'])assert.equal(task(state,id),undefined);
 assert.equal(JSON.stringify(state),before);
 for(const intent of ['compare','unsure']){const comparing=copy(state);comparing.profile.planningIntent=intent;for(const id of ['check-application-deadline','check-transfer-deadline','enroll-at-school'])assert(task(comparing,id),intent+' keeps the selected destination’s admission and transfer steps');}
});
test('returning and high-school context never expires, completes or awards learning',()=>{
 const state=initial();state.profile.learnerStage='returning';state.learning=[{id:'old-credit',provider:'Former College',code:'BUS101',title:'Introduction to Business',credits:3,creditSystem:'semester',grade:'B',completedOn:'1999-05-21',status:'earned',evaluations:[]}];const before=JSON.stringify(state.learning);
 assert.equal(JSON.stringify(draft(state).state.learning),before);assert(task(state,'gather-records'));
 const highSchool=initial();highSchool.profile.learnerStage='high-school';highSchool.profile.hasPrior='none';assert.deepEqual(draft(highSchool).state.learning,[]);assert(!task(highSchool,'current-degree-audit'));assert.equal(tasks(highSchool).tasks.some(row=>row.id==='outside-course-approval'),false);
});
test('military service and family contexts get benefits questions with no funding assumption',()=>{
 for(const militaryStatus of ['active','veteran','reserve','dependent']){
  const state=initial();state.profile.militaryStatus=militaryStatus;const before=JSON.stringify(state);const benefits=task(state,'military-benefits');assert(benefits);assert.match(benefits.detail,/No discount or benefit is assumed/);assert.equal(benefits.href,'portal.html?view=school&action=military-benefits');assert.equal(Boolean(task(state,'military-records')),militaryStatus!=='dependent');assert.equal(JSON.stringify(state),before);
  const done=status(state,'military-benefits','done'),reopened=status(done,'military-benefits','todo');assert.equal(task(done,'military-benefits').status,'done');assert.equal(task(reopened,'military-benefits').status,'todo');assert.deepEqual(reopened.learning,state.learning);assert.deepEqual(reopened.scenarios,state.scenarios);
 }
});
test('changing the current program reopens approval without losing notes or course progress',()=>{
 let state=initial();state.profile={...state.profile,learnerStage:'enrolled',currentSchool:'UMass Global',currentProgram:'Business',planningIntent:'finish-current'};state=status(state,'outside-course-approval','done');assert.equal(task(state,'outside-course-approval').status,'done');
 const changed=copy(state);changed.profile.currentProgram='Business with another concentration';const approval=task(changed,'outside-course-approval');assert.equal(approval.status,'todo');assert.equal(approval.reopened,true);assert.deepEqual(changed.learning,state.learning);assert.deepEqual(changed.scenarios,state.scenarios);
});
