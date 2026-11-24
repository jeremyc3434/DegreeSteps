/* Public curriculum updates exercised with entirely synthetic private records.
 * Historical slots/options were checked against production b608a49. Runtime
 * uses only committed current data, so this also runs in a shallow checkout. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js');
const Catalog=require('./dist/program-catalog.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const models=[...require('./dist/data/curricula/liberty.json').models,...require('./dist/data/curricula/liberty-history-online.json').models];

// Reuse the existing full production worksheet mount without registering its
// separate parity suite. The shared mount instruments only sheet.js's boot;
// rendering, notices, the update form and storage writes are production code.
const harnessSource=fs.readFileSync(path.join(__dirname,'plan-redesign-parity.test.cjs'),'utf8');
const mountStart=harnessSource.indexOf('function mount('),mountEnd=harnessSource.indexOf('\ntest(',mountStart);
assert(mountStart>=0&&mountEnd>mountStart,'The shared worksheet fixture boundary remains available');
const mount=new Function('Journey','Sheet','assert','fs','path','vm','KEY','copy','data','__dirname',harnessSource.slice(mountStart,mountEnd)+'\nreturn mount;')(
  Journey,Sheet,assert,fs,path,vm,'degreepath-guide-v3',copy,null,__dirname);

function fixture(modelId,legacyRequirementId){
  const model=models.find(item=>item.id===modelId),route=catalog.pathways.find(item=>item.modelId===modelId);
  assert(model&&route,'The actual reviewed degree and its catalog route are present');
  const sample={catalog:{...catalog,pathways:[route]},models:[model],courseCatalog:{courses:[]},model,route};
  let state=Journey.selectRoute(Journey.initialize(null,null,sample.catalog),route,sample.catalog);
  state=Journey.setPriorCredits(state,'some');state.journey.completed=true;
  state.scenarios[modelId]={providers:['Sophia','Study.com','CLEP'],allowConditional:true,universityRate:'412',fees:'79',futurePreference:'PRIVATE-EXACT-PREFERENCE',optionSelections:{[legacyRequirementId]:'sophia-soph-0055','engl-101':'university-engl-101'}};
  state.scenarios['unrelated-degree']={optionSelections:{other:'keep-other-choice'},fees:'27'};
  const evaluation=(status,optionId)=>({programId:modelId,requirementId:legacyRequirementId,status,...(optionId?{optionId}:{})});
  state.learning=[
    {id:'earned-reviewed-source',provider:'Sophia',code:'SOPH-0055',title:'Introduction to College Mathematics',credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-09-01',grade:'A',notes:'PRIVATE-SOURCE-NOTE',evaluations:[evaluation('confirmed','sophia-soph-0055'),{programId:'unrelated-degree',requirementId:'other',status:'confirmed'}]},
    {id:'earned-unmatched-source',provider:'Former College',code:'ORIGINAL301',title:'Original individually evaluated learning',credits:4,creditSystem:'quarter',status:'earned',completedOn:'2025-05-01',grade:'B',privateNote:'PRIVATE-TRANSCRIPT-NOTE',evaluations:[evaluation('confirmed')]},
    {id:'taking-original-source',provider:'Study.com',code:'SDCM-0014',title:'College Mathematics',credits:3,creditSystem:'semester',status:'in-progress',grade:'',notes:'PRIVATE-PROGRESS-NOTE',evaluations:[evaluation('reported','studycom-sdcm-0014')]},
    {id:'saved-original-source',provider:'Study.com',code:'SDCM-0064',title:'Quantitative Literacy',credits:null,creditSystem:null,status:'saved',notes:'PRIVATE-SAVED-NOTE',evaluations:[evaluation('reported','studycom-sdcm-0064')]}
  ];
  state.sheet.notes={[modelId]:{[legacyRequirementId]:'PRIVATE-EARLIER-SLOT-NOTE','engl-101':'PRIVATE-CURRENT-SLOT-NOTE'}};
  state.sheet.slotChoices={[modelId]:{[legacyRequirementId]:{courseName:'My earlier elective',notes:'PRIVATE-SLOT-CHOICE'}}};
  state.baseline={school:route.school,externalCredits:18,privateDetail:'PRIVATE-BASELINE'};
  state.savings={[modelId]:{monthlyHousing:750,privateEstimate:'PRIVATE-ESTIMATE'}};
  state.whatIf={version:1,selectedIds:['saved:existing-private-version'],snapshots:[{...Catalog.planSnapshot(state,{pathway:route,program:model},{id:'existing-private-version',label:'My earlier saved version'}),savedAt:'2026-11-23T12:00:00.000Z'}]};
  return{sample,state};
}

function assertPrivateState(actual,before){
  assert.deepEqual(actual.learning,before.learning,'Original source quantities, units, statuses, grades and evaluations stay exact');
  assert.deepEqual(actual.sheet.notes,before.sheet.notes);
  assert.deepEqual(actual.sheet.slotChoices,before.sheet.slotChoices);
  assert.deepEqual(actual.baseline,before.baseline);
  assert.deepEqual(actual.savings,before.savings);
  assert.deepEqual(actual.scenarios['unrelated-degree'],before.scenarios['unrelated-degree']);
  assert.deepEqual(actual.whatIf.snapshots.find(item=>item.id==='existing-private-version'),before.whatIf.snapshots[0]);
  assert.deepEqual(actual.whatIf.selectedIds,before.whatIf.selectedIds);
  assert.deepEqual(actual.profile,before.profile);
  assert.equal(actual.selectedPathwayId,before.selectedPathwayId);
}

for(const [label,modelId,removed] of [
  ['Human Services','curriculum-liberty-human-services-bs-online','free-electives-7'],
  ['Addictions & Recovery','curriculum-liberty-psychology-addictions-online','free-electives-9']
]){
  test(label+' updates the removed elective choice only after explicit recovery and retains every original record',async()=>{
    const {sample,state}=fixture(modelId,removed),before=copy(state),serialized=JSON.stringify(state);
    assert(!sample.model.requirements.some(row=>row.id===removed));
    assert.equal(sample.model.requirements.find(row=>row.id==='univ-104').credits,3);
    for(const initialize of [Sheet.initialize,Journey.initialize]){
      const restored=initialize(serialized,null,sample.catalog);
      assertPrivateState(restored,before);
      assert.deepEqual(restored.scenarios,before.scenarios,'Opening the current model must not erase an earlier choice');
    }
    const draft=Journey.buildDraft(Journey.initialize(serialized,null,sample.catalog),sample.catalog,sample.models);
    assertPrivateState(draft.state,before);
    assert.equal(draft.state.scenarios[modelId].optionSelections[removed],'sophia-soph-0055');
    assert(draft.plan.setupIssues.some(issue=>issue.code==='invalid_selection'&&issue.requirementId===removed));
    assert(draft.match.completed.some(item=>item.learningId==='earned-reviewed-source'&&item.status==='reported'&&item.requirementId!==removed),'An available current match is a proposal, not a forged confirmation');
    assert(draft.match.unmatched.some(item=>item.id==='earned-unmatched-source'),'Unmapped original learning stays available for review');
    assert.equal(JSON.stringify(state),serialized,'Reading and planning do not mutate the saved input');

    const ui=mount({modelId,fixtureData:sample,change:()=>copy(state)}),savedBefore=copy(ui.saved());
    assert.match(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);
    assert.match(ui.node('sheet-grid').innerHTML,/courses\.html\?tab=mine/,'Unmatched source records have a visible next step');
    assert.equal(ui.writes.length,0);
    ui.api.handleAction('update-course-choices');
    assert.match(ui.node('sheet-dialog-content').innerHTML,/This requirement is no longer in the current course list/);
    assert.match(ui.node('sheet-dialog-content').innerHTML,/Your completed courses, grades, school evaluations and notes stay the same/);
    assert.deepEqual(ui.saved(),savedBefore,'Reviewing recovery does not apply it');
    ui.api.handleAction('keep-course-choices');
    assert.deepEqual(ui.saved(),savedBefore,'Keeping earlier choices retains the obsolete pin');
    ui.api.handleAction('update-course-choices');
    assert.equal(await ui.submit('sheet-course-update-form'),'');

    const updated=ui.saved(),current=ui.draft();
    assertPrivateState(updated,savedBefore);
    assert(!Object.hasOwn(updated.scenarios[modelId].optionSelections,removed));
    assert.equal(updated.scenarios[modelId].optionSelections['engl-101'],'university-engl-101');
    assert.equal(updated.scenarios[modelId].futurePreference,'PRIVATE-EXACT-PREFERENCE');
    const archived=updated.whatIf.snapshots.find(item=>item.label.startsWith('Before course update'));
    assert(archived,'Earlier course choices receive a separate saved version');
    assert.deepEqual(archived.settings,savedBefore.scenarios[modelId]);
    assert.equal(updated.whatIf.snapshots.length,savedBefore.whatIf.snapshots.length+1);
    assert.equal(current.plan.validation.academicCountsValid,true);
    assert.equal(current.plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);
    assert.equal(current.plan.totals.accounted,120);
    assert.equal(current.plan.totals.confirmed,0,'The removed-slot confirmation is not transferred to a different requirement');
    assert.equal(current.plan.totals.reported,3,'Known original learning remains proposed credit in a current matching slot');
    assert.equal(current.plan.rows.find(row=>row.requirementId==='univ-104').status,'planned','The newly required UNIV 104 course receives no invented completion');
    assert(current.match.unmatched.some(item=>item.id==='earned-unmatched-source'));
    assert.doesNotMatch(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);
    assert.equal(ui.writes.length,1);
    const reloaded=mount({modelId,fixtureData:sample,change:()=>copy(updated)});
    assertPrivateState(reloaded.saved(),savedBefore);
    assert.equal(reloaded.draft().plan.validation.academicCountsValid,true);
    assert.equal(reloaded.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);
  });
}

test('History retains supported earlier choices and exact private records through the updated same-degree model',()=>{
  // History kept its 39 requirement IDs. Its changed elective menu adds an
  // option; the old SOPH-0055 choice remains supported in free-electives-13.
  const modelId='curriculum-liberty-history-bs-online',slot='free-electives-13';
  const {sample,state}=fixture(modelId,slot),before=copy(state);
  assert(sample.model.requirements.find(row=>row.id===slot).options.some(option=>option.id==='sophia-soph-0055'));
  const restored=Journey.initialize(JSON.stringify(state),null,sample.catalog),draft=Journey.buildDraft(restored,sample.catalog,sample.models);
  assertPrivateState(draft.state,before);
  assert.deepEqual(draft.state.scenarios[modelId].optionSelections,before.scenarios[modelId].optionSelections);
  for(const field of ['providers','allowConditional','universityRate','fees','futurePreference'])assert.deepEqual(draft.state.scenarios[modelId][field],before.scenarios[modelId][field]);
  assert(draft.match.completed.some(item=>item.learningId==='earned-reviewed-source'&&item.requirementId===slot&&item.status==='confirmed'),'A surviving exact evaluated placement retains its confirmation');
  const ui=mount({modelId,fixtureData:sample,change:()=>copy(state)});
  assertPrivateState(ui.saved(),before);
  assert.equal(ui.draft().plan.validation.academicCountsValid,true);
  assert.equal(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);
  assert.doesNotMatch(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);
  assert.equal(ui.writes.length,0);
});
