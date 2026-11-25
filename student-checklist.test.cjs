const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Checklist = require('./dist/student-checklist.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const CoursePlan = require('./dist/course-plan-view.js');
const Library = require('./dist/course-library-engine.js');
const catalog = require('./dist/data/pathways.json');
const models = ['tesu','liberty'].map(name=>require('./dist/data/'+name+'.json'));
const [tesu,liberty] = models;
const clone = value=>JSON.parse(JSON.stringify(value));
const freeze = value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const stateFor = model=>Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(route=>route.modelId===model.id)),null,catalog);
const draftFor = state=>Journey.buildDraft(state,catalog,models);
const task = (built,id)=>built.tasks.find(item=>item.id===id);
const act = (state,draft,action)=>Checklist.apply(state,draft,{...action,planContext:Checklist.build(state,draft).planContext});
const set = (state,draft,id,status)=>act(state,draft,{type:'set-task',taskId:id,status});
const initial = stateFor(tesu), initialDraft = draftFor(initial);
function customTarget(school='My Regional University',degree='My exact degree') {
  return {...Library.initialize(null),selectedPathwayId:'custom-target',profile:{...Library.initialize(null).profile,school,schoolChoice:school,degree,pathwayId:'custom-target',hasPrior:'none'}};
}

test('browser and CommonJS builds are pure, private projections with bounded course groups',()=>{
  const browser={DegreeCoursePlanView:CoursePlan};
  vm.runInNewContext(fs.readFileSync('./dist/student-checklist.js','utf8'),browser);
  const state=freeze(clone(initial)),draft=freeze(clone(initialDraft)),before=JSON.stringify([state,draft]);
  const built=Checklist.build(state,draft);
  assert.equal(built.scope,tesu.id);assert.equal(built.valid,true);
  const browserState=freeze(customTarget()),browserDraft=freeze(draftFor(browserState));
  assert.equal(browser.DegreeChecklist.build(browserState,browserDraft).progress.total,Checklist.build(browserState,browserDraft).progress.total);
  assert.equal(built.groups.find(group=>group.id==='courses').collapsed,true);
  assert(built.groups.find(group=>group.id==='courses').tasks.every(item=>item.automatic&&!item.canSetStatus));
  assert(built.tasks.every(item=>item.dueOn===''));
  assert.equal(JSON.stringify([state,draft]),before);
  assert.equal(browser.fetch,undefined);assert.equal(browser.localStorage,undefined);
  const changed=browser.DegreeChecklist.apply(browserState,browserDraft,{type:'set-task',taskId:'review-plan',status:'done',planContext:Checklist.build(browserState,browserDraft).planContext});
  assert.equal(task(browser.DegreeChecklist.build(changed,browserDraft),'review-plan').status,'done');
});

test('fresh and example workspaces keep the chosen goal open without inventing prior-credit tasks',()=>{
  for (const state of [Journey.initialize(null,null,catalog),Sheet.initialize(null,null,catalog)]) {
    const built=Checklist.build(state,draftFor(state));
    assert.equal(built.scope,'unselected-goal');
    assert.equal(task(built,'choose-goal').status,'todo');
    assert.equal(task(built,'choose-goal').canSetStatus,false);
    assert.equal(built.nextTask.id,'choose-goal');
    assert.equal(built.tasks.some(item=>item.kind==='course'||item.id==='finish-coursework'||item.id.startsWith('obligation-')),false);
    assert.equal(built.tasks.some(item=>item.id==='gather-records'),state.profile.hasPrior!=='none');
  }
});

test('military, protected careers, missing requirements, campus and noncourse obligations become honest steps',()=>{
  const state=stateFor(liberty),draft=draftFor(state);
  state.profile={...state.profile,militaryStatus:'veteran',militaryBranch:'air-force',militaryRecords:'not-sure',hasPrior:'some',goal:'teacher'};
  const built=Checklist.build(state,{...draft,state});
  assert.match(task(built,'military-records').title,/CCAF/);
  assert.equal(task(built,'military-records').href,'portal.html?view=school&action=military-records#service-records');
  assert.match(task(built,'professional-entry').detail,/jurisdiction/);
  assert(task(built,'gather-records'));assert(task(built,'send-transcripts'));assert.equal(task(built,'get-requirements'),undefined);
  const missing=clone(draft);missing.state=clone(state);missing.plan.rows[0].option=null;assert(task(Checklist.build(state,missing),'get-requirements'));
  assert(task(built,'campus-arrangements'));
  for (const obligation of liberty.obligations) {
    const item=built.tasks.find(item=>item.title===obligation.title);
    assert(item);assert.equal(item.canSetStatus,true);assert.equal(item.dueOn,'');assert.match(item.href,/^https:\/\//);
    assert(item.sources.some(source=>liberty.sources.some(s=>s.url===source.url)));
  }
  state.profile={...state.profile,militaryBranch:'army',militaryRecords:'jst'};
  assert.match(task(Checklist.build(state,{...draft,state}),'military-records').title,/JST/);
});

test('school administration tasks open their focused request while plan review and evaluations retain their own actions',()=>{
  const state=stateFor(liberty);state.profile.hasPrior='some';
  const built=Checklist.build(state,draftFor(state));
  for (const id of ['send-transcripts','check-application-deadline','check-transfer-deadline','enroll-at-school','campus-arrangements','apply-to-graduate']) {
    assert.equal(task(built,id).href,'portal.html?view=school&action='+id,id);
  }
  assert.equal(task(built,'review-plan').href,'portal.html?view=review');
  assert.equal(task(built,'request-school-feedback').href,'portal.html?view=school');
  assert.equal(task(built,'review-school-feedback').href,'plan.html?task=checks');
});

test('manual task edits clone the full private workspace and never alter records or evaluations',()=>{
  const state=clone(initial);
  const original=tesu.requirements.find(item=>item.id==='enc1010').options.find(item=>item.provider==='Sophia');
  state.learning=[{id:'original',provider:'Sophia',code:original.code,title:original.title,credits:3,status:'earned',creditSystem:'semester',evaluations:[{programId:'another-degree',requirementId:'other',status:'confirmed'}]}];
  state.sheet.notes={private:'keep'};state.whatIf={snapshots:[{id:'keep'}]};state.futureField={nested:['keep']};
  const draft=draftFor(state),before=JSON.stringify(state);
  const next=act(state,draft,{type:'set-task',taskId:'request-school-feedback',status:'done',dueOn:'2028-02-29',notes:'Email sent; school response pending.'});
  assert.equal(JSON.stringify(state),before);
  for (const key of Object.keys(state)) if(key!=='checklist') assert.deepEqual(next[key],state[key],key);
  assert.equal(task(Checklist.build(next,draft),'request-school-feedback').status,'done');
  assert.equal(task(Checklist.build(next,draft),'review-school-feedback').status,'todo');
  assert.equal(next.journey.schoolContacted,state.journey.schoolContacted);
});

test('custom task add, edit, finish, delete and reload retain stable IDs and private bounds',()=>{
  let state=act(initial,initialDraft,{type:'add-task',title:'Ask about evening classes',notes:'My private note',dueOn:'2027-01-02'});
  let ownTask=Checklist.build(state,initialDraft).tasks.find(item=>item.custom);
  const id=ownTask.id;
  state=act(state,initialDraft,{type:'edit-task',taskId:id,title:'Ask about weekend classes',notes:'Updated',status:'doing'});
  ownTask=task(Checklist.build(clone(state),initialDraft),id);
  assert.equal(ownTask.title,'Ask about weekend classes');assert.equal(ownTask.status,'doing');assert.equal(ownTask.dueOn,'2027-01-02');
  state=set(state,initialDraft,id,'done');
  assert.equal(task(Checklist.build(state,initialDraft),id).status,'done');
  state=act(state,initialDraft,{type:'delete-task',taskId:id});
  assert.equal(task(Checklist.build(state,initialDraft),id),undefined);
  state=act(state,initialDraft,{type:'add-task',title:'A new task'});
  assert.notEqual(Checklist.build(state,initialDraft).tasks.find(item=>item.custom).id,id);
  assert.deepEqual(state.learning,initial.learning);
});

test('switching degrees retains both checklists and returning restores the old manual statuses',()=>{
  let state=set(initial,initialDraft,'check-application-deadline','done');
  state=act(state,initialDraft,{type:'add-task',title:'TESU-only task'});
  const originalScope=Checklist.build(state,initialDraft).scope;
  state=Sheet.selectPathway(state,catalog.pathways.find(route=>route.modelId===liberty.id));
  let draft=draftFor(state);
  assert.equal(task(Checklist.build(state,draft),'check-application-deadline').status,'todo');
  state=set(state,draft,'check-transfer-deadline','waiting');
  assert(state.checklist.plans[originalScope]);assert(state.checklist.plans[liberty.id]);
  state=Sheet.selectPathway(state,catalog.pathways.find(route=>route.modelId===tesu.id));draft=draftFor(state);
  assert.equal(task(Checklist.build(state,draft),'check-application-deadline').status,'done');
  assert(Checklist.build(state,draft).tasks.some(item=>item.title==='TESU-only task'));
  assert.equal(state.checklist.plans[liberty.id].items['check-transfer-deadline'].status,'waiting');
});

test('distinct unlisted targets including non-Latin names retain separate scopes',()=>{
  const first=customTarget('第一大学','工商管理'),second=customTarget('第二大学','计算机科学');
  const a=Checklist.build(first,draftFor(first)),b=Checklist.build(second,draftFor(second));
  assert.notEqual(a.scope,b.scope);assert.match(a.scope,/^custom-target-/);
  let state=act(first,draftFor(first),{type:'add-task',title:'Private first-target step'});
  state={...second,checklist:state.checklist};
  assert.equal(Checklist.build(state,draftFor(state)).tasks.some(item=>item.custom),false);
  assert.equal(task(Checklist.build(state,draftFor(state)),'get-requirements').status,'todo');
});

test('current-plan review reopens for courses, catalog and original evidence but stays done for prices and checklist edits',()=>{
  const state=set(initial,initialDraft,'review-plan','done');
  const before=Checklist.build(state,initialDraft);
  const priced=clone(state);priced.scenarios[tesu.id]={...priced.scenarios[tesu.id],universityRate:999,fees:222,feesConfirmed:true,providerMonths:{Sophia:25}};priced.savings={extra:500};priced.sheet.search='cosmetic';
  const priceDraft=clone(initialDraft);priceDraft.program.pricing={amount:999};priceDraft.plan.costs={total:99999};priceDraft.plan.timing={scenarioWeeks:700};
  assert.equal(Checklist.build(priced,priceDraft).signature,before.signature);
  assert.equal(task(Checklist.build(priced,priceDraft),'review-plan').status,'done');
  const custom=act(state,initialDraft,{type:'add-task',title:'Does not change my academic plan'});
  assert.equal(Checklist.build(custom,initialDraft).signature,before.signature);
  for (const update of [draft=>draft.program.catalog+=' amended',draft=>draft.program.sources[0].checked='2027-02-01',draft=>draft.program.requirements[0].options[0].conditions=['New school condition'],draft=>draft.plan.rows[0].option.id+='-different']) {
    const changed=clone(initialDraft);update(changed);
    assert.equal(task(Checklist.build(state,changed),'review-plan').status,'todo');
    assert.equal(task(Checklist.build(state,changed),'review-plan').reopened,true);
  }
  const next=clone(state);next.learning=[{id:'new-record',provider:'College',title:'Original course',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];
  assert.equal(task(Checklist.build(next,draftFor(next)),'review-plan').status,'todo');
});

test('course tasks follow actual progress and one reviewed CLEP bundle remains one original action',()=>{
  const req=tesu.requirements.find(item=>item.id==='enc1010'),option=req.options.find(item=>item.id==='clep-composition-enc1010');
  let state=Sheet.setCourse(Sheet.setCourse(initial,tesu.id,'enc1010',option.id),tesu.id,'enc1020','clep-composition-enc1020');
  let draft=draftFor(state),built=Checklist.build(state,draft);
  let course=built.tasks.find(item=>item.kind==='course'&&item.requirementIds?.includes('enc1010'));
  const id=course.id;
  assert.equal(course.status,'todo');assert.deepEqual(course.requirementIds,['enc1010','enc1020']);
  assert.equal(built.tasks.filter(item=>item.requirementIds?.includes('enc1020')).length,1);
  const before=JSON.stringify(state);
  assert.throws(()=>set(state,draft,id,'done'),/existing progress form/);assert.equal(JSON.stringify(state),before);
  state=act(state,draft,{type:'set-task',taskId:id,notes:'Taking this next',dueOn:'2027-03-01'});
  assert.equal(state.learning.length,0);
  state=Sheet.recordProgress(state,tesu,req,option,'in-progress');draft=draftFor(state);
  course=task(Checklist.build(state,draft),id);assert(course);assert.equal(course.status,'doing');assert.equal(course.notes,'Taking this next');
  state=Sheet.recordProgress(state,tesu,req,option,'completed');draft=draftFor(state);
  course=task(Checklist.build(state,draft),id);assert.equal(course.status,'done');assert.equal(state.learning.length,1);
  assert.equal(state.learning[0].credits,6);assert.equal(draft.plan.totals.confirmed,0);
  assert.equal(task(Checklist.build(state,draft),'review-school-feedback').status,'todo');
});

test('saved interests stay open and a real library completion preserves task identity through a catalog alias',()=>{
  let state=Library.saveCourse(initial,{id:'english',provider:'Sophia',title:'English Composition I',code:'SOPH-0015',credits:3,creditSystem:'semester'});
  let draft=draftFor(state),course=Checklist.build(state,draft).tasks.find(item=>item.requirementIds?.includes('enc1010'));
  const id=course.id;assert.equal(course.status,'todo');
  state=Library.setStatus(state,state.learning[0].id,'earned');draft=draftFor(state);
  assert.equal(task(Checklist.build(state,draft),id).status,'done');
});

test('hard target and curriculum conflicts come before a taking course and cannot be dismissed as a completed review',()=>{
  const req=tesu.requirements.find(item=>item.id==='enc1010'),option=req.options.find(item=>item.provider==='Sophia');
  let state=Sheet.recordProgress(initial,tesu,req,option,'in-progress');
  state.journey={...state.journey,answers:{...state.journey.answers,prior:'none'},creditsDeferred:false};
  let draft=draftFor(state);
  state=set(state,draft,'review-plan','done');draft=draftFor(state);
  assert(Checklist.build(state,draft).tasks.some(item=>item.kind==='course'&&item.status==='doing'));
  const conflicts=[
    {update:changed=>{changed.targetIssues=[{field:'modality',current:'campus',required:'online'}];changed.targetReviewNeeded=true;},href:'portal.html?view=edit'},
    {update:changed=>changed.plan.setupIssues.push({code:'invalid_selection',message:'Saved choice is unavailable.'}),href:'plan.html?task=checks'},
    {update:changed=>changed.plan.setupIssues.push({code:'selection_conflict',message:'Saved choices cannot fit together.'}),href:'plan.html?task=checks'},
    {update:changed=>changed.plan.validation.academicCountsValid=false,href:'plan.html?task=checks'}
  ];
  for (const {update,href} of conflicts) {
    const changed=clone(draft);update(changed);
    const built=Checklist.build(state,changed);
    assert.equal(built.nextTask.id,'review-plan');assert.equal(built.nextTask.href,href);
    assert.equal(built.nextTask.status,'todo');assert.equal(built.nextTask.canSetStatus,false);
    assert.equal(task(built,'request-school-feedback').status,'todo');
    assert.equal(built.tasks.some(item=>item.status==='confirmed'),false);
  }
  const target=clone(state);target.profile.goal='teacher';
  const targetDraft=draftFor(target);assert.equal(targetDraft.targetReviewNeeded,true);assert.equal(targetDraft.plan,null);
  assert.equal(Checklist.build(target,targetDraft).nextTask.id,'review-plan');
});

test('an unresolved original-record decision precedes taking without making ordinary school tasks block coursework',()=>{
  const req=tesu.requirements.find(item=>item.id==='enc1010'),option=req.options.find(item=>item.provider==='Sophia');
  const taking=Sheet.recordProgress(initial,tesu,req,option,'in-progress');
  for (const changes of [
    {profile:{hasPrior:'unknown'},journey:{creditsDeferred:false}},
    {profile:{hasPrior:'some'},journey:{creditsDeferred:false}},
    {profile:{hasPrior:'none'},journey:{creditsDeferred:true}}
  ]) {
    const state={...taking,profile:{...taking.profile,...changes.profile},journey:{...taking.journey,...changes.journey}};
    const built=Checklist.build(state,draftFor(state));
    assert(built.tasks.some(item=>item.kind==='course'&&item.status==='doing'));
    assert.equal(built.nextTask.id,'gather-records');
  }
  let state={...taking,journey:{...taking.journey,answers:{...taking.journey.answers,prior:'none'},creditsDeferred:false}};
  let draft=draftFor(state);
  state=set(state,draft,'review-plan','done');draft=draftFor(state);
  const reviewed=Checklist.build(state,draft);
  assert.equal(task(reviewed,'review-plan').status,'done');
  assert.equal(task(reviewed,'request-school-feedback').status,'todo');
  assert.equal(reviewed.nextTask.kind,'course');assert.equal(reviewed.nextTask.status,'doing');
  const staleProfile={...state,profile:{...state.profile,hasPrior:'unknown'}};
  assert.equal(Checklist.build(staleProfile,draftFor(staleProfile)).nextTask.kind,'course');
  const routine=clone(draft);routine.plan.validation.errors.push({code:'conditional_mapping',message:'School confirmation remains open.'});
  assert.equal(Checklist.build(state,routine).nextTask.kind,'course');
  for (const status of ['done','waiting']) {
    let deferred={...state,journey:{...state.journey,creditsDeferred:true}};
    let deferredDraft=draftFor(deferred);deferred=set(deferred,deferredDraft,'gather-records',status);deferredDraft=draftFor(deferred);
    const built=Checklist.build(deferred,deferredDraft);
    assert.equal(task(built,'gather-records').status,status);
    assert.equal(built.nextTask.kind,'course');assert.equal(built.nextTask.status,'doing');
    assert.equal(deferred.journey.creditsDeferred,true);
  }
  state=Sheet.updateLearning(state,{provider:'Original college',title:'Completed original course',credits:3,creditSystem:'semester',status:'earned'});
  state.journey={...state.journey,answers:{...state.journey.answers,prior:'some'},creditsDeferred:false};
  assert.equal(Checklist.build(state,draftFor(state)).nextTask.kind,'course');
});

test('saved interests with unknown prior learning ask for the record decision before the routine plan review',()=>{
  let state=Library.saveCourse(initial,{id:'interest',provider:'Sophia',title:'English Composition I',code:'SOPH-0015',credits:3,creditSystem:'semester'});
  state.profile.hasPrior='unknown';
  const built=Checklist.build(state,draftFor(state));
  assert.equal(built.nextTask.id,'gather-records');
  assert.equal(state.learning[0].status,'saved');
});

test('waiting remains visible without blocking actionable steps and all-done has a meaningful terminal state',()=>{
  const target=customTarget();let draft=draftFor(target),state=set(target,draft,'review-plan','waiting');
  let built=Checklist.build(state,draft);
  assert.notEqual(built.nextTask.id,'review-plan');assert(built.tasks.some(item=>item.status==='waiting'));
  state=set(state,draft,'get-requirements','doing');assert.equal(Checklist.build(state,draft).nextTask.id,'get-requirements');
  for (const item of Checklist.build(state,draft).tasks) if(item.canSetStatus) state=set(state,draft,item.id,'done');
  built=Checklist.build(state,draft);
  assert.equal(built.nextTask,null);assert.equal(built.allDone,true);assert.equal(built.progress.done,built.progress.total);
});

test('stale goals, records, choices and plan contexts fail before any write',()=>{
  const original=Checklist.build(initial,initialDraft),switched=Sheet.selectPathway(initial,catalog.pathways.find(route=>route.modelId===liberty.id));
  assert.equal(Checklist.build(switched,initialDraft).valid,false);
  assert.throws(()=>act(switched,initialDraft,{type:'add-task',title:'Stale degree'}),/degree goal changed/);
  const altered=clone(initial);altered.learning=[{id:'new-record',status:'saved'}];
  assert.equal(Checklist.build(altered,initialDraft).valid,false);
  const choices=Sheet.setCourse(initial,tesu.id,'enc1010','clep-composition-enc1010');
  assert.equal(Checklist.build(choices,initialDraft).valid,false);
  const providers=clone(initialDraft.state);providers.scenarios[tesu.id].providers=[];
  assert.equal(Checklist.build(providers,initialDraft).valid,false);
  assert.throws(()=>Checklist.apply(initial,initialDraft,{type:'set-task',taskId:'review-plan',status:'done',planContext:original.planContext+'bad'}),/plan changed/);
  assert.equal(initial.checklist,undefined);
});

test('row-only completion without an original earned record cannot complete a course',()=>{
  const draft=clone(initialDraft);draft.plan.rows[0].status='reported';
  const built=Checklist.build(initial,draft),course=built.tasks.find(item=>item.requirementIds?.includes(draft.plan.rows[0].requirementId));
  assert(course);assert.notEqual(course.status,'done');
});

test('valid legacy review and request metadata migrate without treating a sent request as school approval',()=>{
  const state=clone(initial),signature=Journey.draftSignature(state,initialDraft);
  state.journey={...state.journey,planReviewed:true,reviewedSignature:signature,schoolContacted:true,schoolContactedSignature:signature};
  let built=Checklist.build(state,initialDraft);
  assert.equal(task(built,'review-plan').status,'done');assert.equal(task(built,'request-school-feedback').status,'done');
  assert.equal(task(built,'review-school-feedback').status,'todo');
  const priced=clone(state);priced.scenarios[tesu.id]={universityRate:800,fees:150};
  assert.equal(task(Checklist.build(priced,initialDraft),'review-plan').status,'done');
  const migrated=act(priced,initialDraft,{type:'add-task',title:'Keep the legacy review'});
  assert.equal(migrated.checklist.plans[tesu.id].items['review-plan'].signature,Checklist.build(migrated,initialDraft).signature);
  assert(migrated.journey.reviewedSignature.length<250);assert(Journey.reviewSignatureMatches(migrated.journey.reviewedSignature,signature));assert(Journey.reviewSignatureMatches(migrated.journey.schoolContactedSignature,signature));assert(Buffer.byteLength(JSON.stringify(migrated))<Checklist.limits.maxBytes);
  const academic=clone(initialDraft);academic.program.catalog+=' changed';
  built=Checklist.build(state,academic);
  assert.equal(task(built,'review-plan').status,'todo');assert.equal(task(built,'request-school-feedback').status,'todo');
  assert.deepEqual(migrated.learning,state.learning);
});

test('invalid actions, statuses, dates, field lengths, task IDs and corrupt stores fail closed',()=>{
  const actions=[
    {type:'set-task',taskId:'unknown',status:'done'},
    {type:'set-task',taskId:'review-plan',status:'approved'},
    {type:'set-task',taskId:'review-plan',dueOn:'2027-02-29'},
    {type:'set-task',taskId:'review-plan',dueOn:'tomorrow'},
    {type:'set-task',taskId:'review-plan',notes:'x'.repeat(1001)},
    {type:'add-task',title:'x'.repeat(161)},
    {type:'add-task',title:'   '},
    {type:'delete-task',taskId:'review-plan'},
    {type:'edit-task',taskId:'review-plan',title:'Fake renamed task'},
    {type:'set-task',taskId:'choose-goal',status:'done'},
    {type:'unknown'},
    {type:'set-task',taskId:'review-plan',status:'done',unexpected:'value'}
  ];
  for (const action of actions) assert.throws(()=>act(initial,initialDraft,action));
  const saved=set(initial,initialDraft,'review-plan','done');
  const corruptions=[state=>state.checklist.version=2,state=>state.checklist.plans[tesu.id].items['review-plan'].status='approved',state=>state.checklist.plans[tesu.id].items['review-plan'].dueOn='2026-02-30',state=>state.checklist.plans[tesu.id].items.evil={},state=>state.checklist.plans[tesu.id].custom=[{id:'custom-1',title:'bad',notes:'',dueOn:'',status:'todo'}]];
  for (const corrupt of corruptions) {
    const bad=clone(saved);corrupt(bad);const before=JSON.stringify(bad);
    assert.equal(Checklist.build(bad,initialDraft).valid,false);
    assert.throws(()=>act(bad,initialDraft,{type:'add-task',title:'Do not overwrite corrupted tasks'}));
    assert.equal(JSON.stringify(bad),before);
  }
});

test('custom task count and full workspace byte limits reject oversized updates without touching originals',()=>{
  let state=initial;
  for(let i=0;i<50;i++) state=act(state,initialDraft,{type:'add-task',title:'Private task '+i});
  assert.equal(Checklist.build(state,initialDraft).tasks.filter(item=>item.custom).length,50);
  const before=JSON.stringify(state);
  assert.throws(()=>act(state,initialDraft,{type:'add-task',title:'One too many'}),/50 custom/);
  assert.equal(JSON.stringify(state),before);
  const large={...initial,privateBackup:'学'.repeat(160000)};
  assert.throws(()=>act(large,initialDraft,{type:'add-task',title:'Too large'}),/too large/);
  assert.equal(large.checklist,undefined);
});

test('large ledgers collapse course task overflow and condense unmapped requirements',()=>{
  const count=100,requirements=Array.from({length:count},(_,i)=>({id:'req-'+i,title:'Course '+i,credits:1,category:'major'}));
  const state={profile:{school:'Test school',degree:'Exact degree',hasPrior:'none'},selectedPathwayId:'large-degree',learning:[]};
  const draft={state,pathway:{id:'large-degree',school:'Test school',title:'Exact degree'},program:{id:'large-degree',school:'Test school',totalCredits:count,requirements},plan:{validation:{academicCountsValid:true},rows:requirements.map(req=>({requirementId:req.id,title:req.title,credits:1,status:'planned',option:{provider:'Sophia',code:req.id,title:req.title,credits:1}}))}};
  const built=Checklist.build(state,draft),courses=built.groups.find(group=>group.id==='courses');
  assert.equal(courses.tasks.length,61);assert.equal(task(built,'course-overflow').automatic,true);assert.match(task(built,'course-overflow').title,/40 more/);
});
