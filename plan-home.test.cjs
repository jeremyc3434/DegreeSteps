const test=require('node:test'),assert=require('node:assert/strict');
const Home=require('./dist/plan-home.js'),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js');
const catalog=require('./dist/data/pathways.json'),models=['tesu','liberty'].map(n=>require('./dist/data/'+n+'.json'));
function setup(){let s=Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(p=>p.modelId==='tesu-general-management'));s=Journey.initialize(s,null,catalog);s.profile.hasPrior='none';return s;}
const win=s=>Home.nextWin(s,Journey.buildDraft(s,catalog,models));
test('new zero-credit plan points at a named transfer course instead of generic review',()=>{const w=win(setup());assert.equal(w.id,'first-course');assert.match(w.href,/plan\.html\?course=/);assert.match(w.detail,/Sophia|CLEP|Study/);});
test('service education changes the immediate action',()=>{const s=setup();s.profile.militaryStatus='veteran';s.profile.militaryRecords='ccaf';const w=win(s);assert.equal(w.id,'service-records');assert.match(w.title,/CCAF/);assert.match(w.href,/#service-records/);});
test('finished course with missing facts gets a correction action and no assumed credit award',()=>{let s=setup();s=Sheet.updateLearning(s,{id:'old-course',provider:'Past college',title:'English',code:'ENG101',credits:null,creditSystem:null,status:'earned'});const d=Journey.buildDraft(s,catalog,models);const w=Home.nextWin(s,d);assert.equal(w.id,'credit-details');assert.match(w.href,/record=old-course/);assert.equal(d.plan.totals.reported,0);});
test('unmatched finished college coursework gets a targeted evaluation task',()=>{let s=setup();s=Sheet.updateLearning(s,{id:'old-course',provider:'Past college',title:'English',code:'ENG101',credits:3,creditSystem:'semester',status:'earned'});const w=win(s);assert.equal(w.id,'evaluation');assert.match(w.detail,/Unreviewed does not mean rejected/);});
test('unsupported exact degree keeps the goal and asks DegreeSteps to research its link',()=>{const s=setup();s.profile.school='Example University';s.profile.degree='Psychology BS';s.profile.pathwayId='custom-target';s.selectedPathwayId='custom-target';const w=win(s);assert.equal(w.id,'requirements');assert.equal(w.href,'request-plan.html');assert.doesNotMatch(w.title,/Get the requirements/);});
test('an incompatible mapped target asks for a goal review rather than missing requirements',()=>{const s=setup();s.profile.goal='teacher';s.journey.answers={purpose:'licensed-career',career:'teacher',prior:'none'};const w=win(s);assert.equal(w.id,'goal-fit');assert.match(w.href,/view=edit/);});
test('a course in progress for another goal does not displace the next applicable course',()=>{const s=setup();s.learning=[{id:'unrelated',provider:'Another college',code:'ART999',title:'Unrelated studio course',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]}];const before=JSON.stringify(s),w=win(s);assert.equal(w.id,'first-course');assert.doesNotMatch(w.detail,/Unrelated/);assert.equal(JSON.stringify(s),before);});
test('an applicable in-progress course links directly to its original record',()=>{const s=setup();s.learning=[{id:'taking-writing',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]}];const w=win(s);assert.equal(w.id,'taking');assert.match(w.href,/record=taking-writing/);assert.match(w.title,/English Composition/);});
test('known competency units need destination evaluation rather than a request for missing units',()=>{const s=setup();s.learning=[{id:'completed-cu',provider:'University',institution:'WGU',sourceProgramId:'prior-wgu-degree',code:'D123',title:'Completed competency',credits:3,creditSystem:'competency-unit',status:'earned',evaluations:[]}];const d=Journey.buildDraft(s,catalog,models),w=Home.nextWin(s,d);assert.equal(w.id,'evaluation');assert.equal(d.plan.totals.reported,0);assert.equal(s.learning[0].creditSystem,'competency-unit');});
test('next steps prefer a documented course and keep missing map research with DegreeSteps',()=>{const s=setup(),draft=Journey.buildDraft(s,catalog,models);draft.plan.rows=[{requirementId:'candidate',status:'planned',option:{provider:'Study.com',title:'Candidate',evidence:'conditional'}},{requirementId:'documented',status:'planned',option:{provider:'Sophia',title:'Documented course',evidence:'published'}}];const next=Home.nextWin(s,draft);assert.equal(next.href,'plan.html?course=documented');assert.equal(next.label,'View this course');assert.doesNotMatch(next.detail,/Confirm|approval/);draft.plan.rows.shift();draft.plan.rows[0].option.evidence='conditional';const pending=Home.nextWin(s,draft);assert.match(pending.detail,/DegreeSteps still needs to resolve/);assert.doesNotMatch(pending.detail,/ask your school|research this/i);});


test('an applicable taking course stays actionable while unmatched records retain their evaluation checklist',()=>{
 const Checklist=require('./dist/student-checklist.js');
 let state=setup();state.learning=[
  {id:'old-english',provider:'Past college',title:'Original college English',code:'ENG101',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},
  {id:'taking-writing',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]}
 ];
 const before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,models),next=Home.nextWin(state,draft);
 assert.equal(next.id,'taking');assert.match(next.href,/record=taking-writing/);assert.equal(draft.match.unmatched.some(record=>record.id==='old-english'),true);
 const checklist=Checklist.build(state,draft);assert(checklist.tasks.some(task=>task.id==='request-school-feedback'&&task.status==='todo'));assert(checklist.tasks.some(task=>task.id==='review-school-feedback'&&task.status==='todo'));
 assert.equal(JSON.stringify(state),before,'A next-step recommendation cannot award, remove or rewrite course records');
 for(const issue of [
  {...draft,targetReviewNeeded:true},
  {...draft,plan:{...draft.plan,validation:{...draft.plan.validation,academicCountsValid:false}}},
  {...draft,plan:{...draft.plan,setupIssues:[{code:'invalid_selection'}]}}
 ])assert.notEqual(Home.nextWin(state,issue).id,'taking','An actual goal or course conflict must remain ahead of routine progress');
 const unknown={...state,learning:[{...state.learning[0],credits:null,creditSystem:null},state.learning[1]]};
 assert.equal(Home.nextWin(unknown,Journey.buildDraft(unknown,catalog,models)).id,'credit-details');
});

test('past coursework opens the batch uploader directly while starting from zero skips the upload task',()=>{
 const state=setup();state.profile.hasPrior='some';state.journey={...state.journey,completed:true,creditsDeferred:false,answers:{...state.journey.answers,prior:'some'}};
 const before=JSON.stringify(state),next=win(state);
 assert.equal(next.id,'past-courses');assert.equal(next.href,'import-courses.html?from=plan');assert.equal(next.label,'Upload my courses');assert.match(next.detail,/transcript or spreadsheet/);assert.equal(next.defer,true);assert.equal(JSON.stringify(state),before);
 state.profile.hasPrior='none';state.journey.answers.prior='none';assert.notEqual(win(state).id,'past-courses');
});

test('military next steps open the focused record task and respect Waiting or Done for this degree',()=>{
 const Checklist=require('./dist/student-checklist.js');
 for(const status of ['waiting','done']){
  const state=setup();state.profile.militaryStatus='veteran';state.profile.militaryRecords='ccaf';
  const draft=Journey.buildDraft(state,catalog,models),checklist=Checklist.build(state,draft),next=Home.nextWin(state,draft),url=new URL(next.href,'https://degreesteps.com/');
  assert.equal(url.searchParams.get('action'),'military-records');assert.equal(url.hash,'#service-records');
  const updated=Checklist.apply(state,draft,{type:'set-task',taskId:'military-records',status,planContext:checklist.planContext}),before=JSON.stringify(updated),updatedDraft=Journey.buildDraft(updated,catalog,models);
  assert.equal(Home.nextWin(updated,updatedDraft).id,'first-course','A requested or completed record task must not trap a veteran on the same next action');
  assert.equal(JSON.stringify(updated),before);assert.deepEqual(updated.learning,state.learning);assert.equal(updatedDraft.plan.totals.reported,0);
  const other=Sheet.selectPathway(updated,catalog.pathways.find(route=>route.modelId==='liberty-business-residential'));
  assert.equal(Home.nextWin(other,Journey.buildDraft(other,catalog,models)).id,'service-records','A task saved for another degree must not dismiss this degree’s record step');
 }
});

test('the browser can load the checklist after plan-home and still use its current validated task status',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),Checklist=require('./dist/student-checklist.js'),context={DegreeJourney:Journey};
 vm.runInNewContext(fs.readFileSync('./dist/plan-home.js','utf8'),context);
 const state=setup();state.profile.militaryStatus='active';
 assert.equal(context.DegreePlanHome.nextWin(state,Journey.buildDraft(state,catalog,models)).id,'service-records');
 const draft=Journey.buildDraft(state,catalog,models),checklist=Checklist.build(state,draft),updated=Checklist.apply(state,draft,{type:'set-task',taskId:'military-records',status:'waiting',planContext:checklist.planContext});
 context.DegreeChecklist=Checklist;
 assert.equal(context.DegreePlanHome.nextWin(updated,Journey.buildDraft(updated,catalog,models)).id,'first-course');
 const invalid=JSON.parse(JSON.stringify(updated));invalid.checklist={version:1,plans:'unreadable'};
 assert.equal(context.DegreePlanHome.nextWin(invalid,Journey.buildDraft(invalid,catalog,models)).id,'service-records');
});
