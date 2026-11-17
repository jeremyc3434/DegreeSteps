/* Student journeys through the real reviewed maps. These tests never alter fixtures or student storage. */
const test=require('node:test'),assert=require('node:assert/strict');
const Comparison=require('./dist/plan-comparison-engine.js'),Journey=require('./dist/journey-engine.js'),Checklist=require('./dist/student-checklist.js');
const base=require('./dist/data/pathways.json'),costs=require('./dist/data/cost-comparisons.json');
const ids=['tesu-general-management','liberty-business-residential','liberty-criminal-justice-online','wgu-teacher-preparation'];
const catalog={...base,pathways:base.pathways.filter(route=>ids.includes(route.id))};
const models=[require('./dist/data/tesu.json'),require('./dist/data/liberty.json'),require('./dist/data/liberty-criminal-justice-online.json')];
const copy=value=>JSON.parse(JSON.stringify(value));
function starting(profile={}){
  const state=Journey.initialize(null,null,catalog);
  state.selectedPathwayId='';state.sheet.isExample=false;
  state.profile={...state.profile,entry:'explore',school:'',schoolChoice:'',degree:'',pathwayId:'',goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'online',classroomImportance:'open',...profile};
  return state;
}
const course=(id,code,status='earned',extra={})=>({id,provider:'Sophia',code,title:code,credits:3,creditSystem:'semester',status,grade:'A',evaluations:[],...extra});
function compare(state,options={},prices=costs){
  const before=copy(state),view=Comparison.build(state,catalog,models,prices,{fromCourses:true,deferMatrix:true,...options});
  assert.deepEqual(state,before,'exploring routes must not alter the student’s original facts');return view;
}
function balanced(scenario){
  assert(scenario.available,'a covered route must produce a usable proposed ledger');
  assert(scenario.eligible,'suggested routes must respect the student’s goals and format');
  const rows=scenario.draft.plan.rows;
  assert.equal(new Set(rows.map(row=>row.requirementId)).size,rows.length);
  assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),scenario.summary.degreeCredits);
  assert.equal(scenario.draft.plan.validation.academicCountsValid,true);
}

test('a beginner receives complete online requirement ledgers and separate tuition/course estimates without invented completion',()=>{
  const state=starting({priority:'cost'}),view=compare(state);
  assert.equal(view.scenarios.length,2);
  for(const scenario of view.scenarios){
    balanced(scenario);assert(scenario.draft.pathway.modalities.includes('online'));
    assert.equal(scenario.summary.applicableCompletedCredits,0);
    assert.equal(scenario.summary.remainingCredits,120);
    assert(scenario.summary.universityCreditsRemaining>=30);
    const cost=scenario.summary.costBreakdown;
    assert(cost.universityTuition>0);assert(cost.outsideCourses>0);
    assert.equal(scenario.summary.estimatedBaseCost,cost.universityTuition+cost.outsideCourses);
    assert.equal(scenario.summary.remainingCost,null,'unverified charges are not described as a complete quote');
    assert(cost.missing.length>0);assert.equal(cost.complete,false);
    assert(scenario.draft.guidance.nextActions.length>0&&scenario.draft.guidance.nextActions.length<=3);
  }
  assert.equal(view.recommendation.metric,'estimatedBaseCost');
  assert.equal(view.recommendation.partial,true);
  assert.match(view.recommendation.reason,/exclud|unconfirmed/i);
});

test('returning students reuse earned and saved courses separately, with duplicate records counted once',()=>{
  const state=starting();state.learning=[course('finished','SOPH-0015'),course('duplicate','SOPH-0015','saved'),course('next-writing','SOPH-0030','saved')];
  const view=compare(state),tesu=view.scenarios.find(scenario=>scenario.pathwayId==='tesu-general-management');balanced(tesu);
  assert.equal(tesu.summary.applicableCompletedCredits,3);
  assert.equal(tesu.summary.fitBreakdown.savedCredits,3);
  assert.equal(tesu.summary.collectionFitCredits,6);
  assert.equal(tesu.summary.remainingCredits,117);
  assert.equal(view.courses.filter(record=>record.recordIds.includes('finished')).length,1);
  assert.deepEqual(state.learning.map(record=>record.status),['earned','saved','saved']);
  const adopted=Comparison.applyScenario(state,tesu.id,catalog,{collectionSelections:tesu.summary.collectionSelections});
  assert.deepEqual(adopted.learning,state.learning);
  const draft=Journey.buildDraft(adopted,catalog,models);
  assert.equal(draft.plan.totals.reported+draft.plan.totals.confirmed,3);
  assert.equal(draft.plan.totals.confirmed,0,'an exact proposed match is not individual school approval');
});

test('military learners keep unmatched service learning and receive a service-record next action rather than automatic credit',()=>{
  const state=starting({militaryStatus:'veteran',militaryBranch:'army',militaryRecords:'jst'});
  state.learning=[course('service-training','MOS-UNKNOWN','earned',{provider:'JST',title:'Service leadership training',credits:9,grade:'',privateNote:'Keep the original service record'})];
  const view=compare(state);
  assert(view.scenarios.length>0);
  for(const scenario of view.scenarios){balanced(scenario);assert.equal(scenario.summary.applicableCompletedCredits,0);assert.equal(scenario.summary.collectionNeedsEvaluation,1);assert(scenario.summary.reviewCourses.some(record=>record.id==='service-training'));assert.match(scenario.draft.guidance.militaryNotes.join(' '),/Joint Services Transcript|JST/);}
  const chosen=view.scenarios[0],tasks=Checklist.build(chosen.state,chosen.draft);
  assert(tasks.tasks.some(task=>task.id==='military-records'&&/JST/.test(task.title)));
  assert.equal(state.learning[0].credits,9);assert.deepEqual(state.learning[0].evaluations,[]);
});

test('students who require campus study are not steered into a lower-cost online degree',()=>{
  const state=starting({modality:'campus',classroomImportance:'essential',priority:'cost'}),view=compare(state);
  assert.equal(view.scenarios.length,1);
  const scenario=view.scenarios[0];balanced(scenario);
  assert.equal(scenario.pathwayId,'liberty-business-residential');assert.deepEqual(scenario.draft.pathway.modalities,['campus']);
  const tasks=Checklist.build(scenario.state,scenario.draft);
  assert(tasks.tasks.some(task=>task.id==='campus-arrangements'));
  assert.equal(state.profile.modality,'campus');assert.equal(state.profile.classroomImportance,'essential');
});

test('changing a degree preserves notes and source approvals while recalculating applicability at the new school',()=>{
  const route=catalog.pathways.find(route=>route.id==='tesu-general-management');
  let state=Journey.selectRoute(starting(),route,catalog);state.sheet.notes={private:'Keep my advisor note'};
  state.learning=[course('approved-writing','SOPH-0015','earned',{evaluations:[{programId:'tesu-general-management',requirementId:'enc1010',optionId:'sophia-enc1010-3',status:'confirmed'}]})];
  state=Comparison.saveScenario(state,Journey.buildDraft(state,catalog,models),'Before changing degrees');
  const before=copy(state),next=Comparison.applyScenario(state,'route:liberty-business-residential',catalog,{includeOtherFormats:true});
  assert.deepEqual(state,before);assert.deepEqual(next.learning,before.learning);assert.deepEqual(next.sheet.notes,before.sheet.notes);
  const draft=Journey.buildDraft(next,catalog,models);assert.equal(draft.program.id,'liberty-business-residential');
  assert.equal(draft.plan.totals.confirmed,0,'TESU approval must not become Liberty approval');
  assert.equal(draft.plan.totals.reported,3);assert.equal(next.learning[0].evaluations[0].programId,'tesu-general-management');
  const restored=Comparison.applyScenario(next,'saved:'+state.whatIf.snapshots[0].id,catalog);
  assert.deepEqual(restored.learning,next.learning);assert.equal(restored.selectedPathwayId,'tesu-general-management');
});

test('missing prices cannot turn a route into a free degree or a cost recommendation',()=>{
  const state=starting({priority:'cost'}),view=compare(state,{selectedIds:['route:tesu-general-management']},{entries:[]});
  const scenario=view.scenarios[0];balanced(scenario);
  assert.equal(scenario.summary.universityTuitionRemaining,null);assert.equal(scenario.summary.estimatedBaseCost,null);assert.equal(scenario.summary.remainingCost,null);
  assert(scenario.summary.costBreakdown.knownSubtotal>0,'known provider charges may still be shown separately');
  assert.equal(scenario.summary.costBreakdown.complete,false);assert.equal(view.recommendation,null);
  assert.match(view.rankBasis,/need tuition|course fit/i);
});

test('a teaching goal remains an approval-dependent professional route rather than a generic business recommendation',()=>{
  const state=starting({goal:'teacher',field:'education'}),view=compare(state);
  assert.equal(view.scenarios.length,1);assert.equal(view.scenarios[0].pathwayId,'wgu-teacher-preparation');assert.equal(view.scenarios[0].eligible,true);
  assert.equal(view.scenarios[0].summary,null);assert.equal(view.scenarios[0].available,false);
  assert.match(view.scenarios[0].draft.guidance.careerNotes.join(' '),/approved preparation|licensing|supervised classroom/);
  assert.equal(view.recommendation,null);assert.equal(state.learning.length,0);
});
