const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Planner = require('./dist/planner.js');
const Guide = require('./dist/guide-engine.js');
const Journey = require('./dist/journey-engine.js');
const Catalog = require('./dist/program-catalog.js');
const clone = value => JSON.parse(JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));

function fixture(unresolved = []) {
  return {id:'guidance-fixture',school:'Example University',title:'Example Degree',creditSystem:'semester',format:'Online',totalCredits:3,institutionMinCredits:3,majorMinInstitutionCredits:0,upperMinCredits:0,sources:[{id:'catalog',url:'https://example.edu/catalog'}],unresolved,requirements:[{id:'r',code:'R101',title:'University course',category:'general',credits:3,institutionalOnly:true,options:[{id:'u',provider:'University',code:'R101',title:'University course',credits:3,evidence:'published',sourceIds:['catalog']}]}]};
}

test('source-bound resolved facts and personal records stop becoming research blockers', () => {
  const program = fixture([
    {message:'The published residency minimum is three credits.',status:'resolved',owner:'DegreePath',sourceIds:['catalog']},
    {message:'Send your previous transcripts for an individual evaluation.',status:'personal-task',owner:'student',sourceIds:['catalog']},
    {message:'Request the optional transfer waiver.',status:'personal-task',owner:'student',sourceIds:['catalog'],appliesWhen:'transfer-waiver'}
  ]);
  const before = JSON.stringify(program), plan = Planner.generate(program);
  assert.equal(plan.validation.valid,true);
  assert.equal(plan.resolvedNotes.length,1);
  assert.equal(plan.personalTasks.length,1);
  assert(plan.nextActions.includes(program.unresolved[1].message));
  assert(!plan.nextActions.includes(program.unresolved[2].message));
  assert.equal(JSON.stringify(program),before);
  const waived = Planner.generate({...program,appliedTransferWaiver:{minimumQualifyingTransferCredits:45}});
  assert.equal(waived.personalTasks.length,2);
  assert(waived.validation.errors.some(issue=>issue.code==='waiver_confirmation'));
});

test('unbound resolutions and genuine remaining research retain blockers', () => {
  for (const note of [
    {message:'Claimed resolved fact',status:'resolved',sourceIds:['missing']},
    {message:'Unbound personal note',status:'personal-task',owner:'student',sourceIds:[]},
    {message:'Unbound optional note',status:'personal-task',owner:'student',sourceIds:[],appliesWhen:'transfer-waiver'},
    {message:'Verify the exact provider course version.',owner:'DegreePath',sourceIds:['catalog']},
    'Legacy unresolved course mapping'
  ]) {
    const plan = Planner.generate(fixture([note]));
    assert.equal(plan.validation.valid,false);
    assert(plan.validation.errors.some(issue=>issue.code==='program_research'&&issue.owner==='DegreePath'));
    assert.equal(plan.personalTasks.length,0);
    assert.equal(plan.resolvedNotes.length,0);
  }
});

test('actual WGU route guidance replaces the obsolete map-needed card with executable course steps', () => {
  const registry = read('dist/data/curriculum-registry.json');
  const catalog = Catalog.attachRegistry(Catalog.merge(read('dist/data/pathways.json'),read('dist/data/program-catalog.json')),registry);
  const models = [...new Set(registry.models.map(entry=>entry.path))].flatMap(file=>{const pack=read('dist/'+file);return pack.models||[pack];});
  const route = catalog.pathways.find(row=>row.id==='wgu-catalog-ecceaa488637ac83');
  const state = Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);
  const before = JSON.stringify(state), draft = Journey.buildDraft(state,catalog,models);
  assert.equal(draft.plan.totals.external,69);
  assert.equal(draft.plan.validation.valid,true);
  assert.match(draft.guidance.summary,/69 competency units from outside courses/);
  assert.match(draft.guidance.summary,/41 at Western Governors University/);
  assert(!/map.*needed|confirmation|confirm outside/i.test(draft.guidance.summary));
  assert.equal(draft.guidance.nextActions.length,3);
  assert(draft.guidance.nextActions.every(action=>action.startsWith('Start: ')));
  assert(!draft.plan.nextActions.some(action=>/Confirm.*(?:prerequisites|transcript deadlines)/.test(action)));
  assert(draft.plan.researchTasks.some(task=>task.code==='outside-option-research'&&task.owner==='DegreePath'&&task.blocking===false));
  assert.equal(JSON.stringify(state),before);
});

test('guidance does not borrow another degree context or convert pending conditions into Start steps', () => {
  const program = fixture(), plan = Planner.generate(program);
  const route = {id:'other',title:'Other degree',summary:'Other exact target',proposedActions:['Choose the exact target.']};
  const guidance = Guide.buildGuidance({},route,[],{}, {program,plan});
  assert.equal(guidance.summary,'Other exact target');
  assert(!guidance.researchTasks);

  const tesu = read('dist/data/tesu.json'), proposed = Planner.generate(tesu,{providers:['Sophia','Study.com','CLEP'],allowConditional:true,priority:'transfer'});
  const mapped = proposed.researchTasks.filter(task=>task.code==='conditional_mapping'&&task.mappingDocumented);
  assert.equal(mapped.length,5);
  assert(mapped.every(task=>task.owner==='DegreePath'&&task.researchKind==='provider-eligibility'&&/documented receiving-course match/.test(task.message)));
  assert(proposed.validation.errors.some(issue=>issue.code==='conditional_mapping'));
  assert(!proposed.nextActions.some(action=>action.startsWith('Start: ')));
  assert(proposed.validation.warnings.length < proposed.rows.filter(row=>row.option?.evidence==='conditional').length);
  const copy = clone(tesu), first = copy.requirements.find(row=>row.id==='enc1010');
  assert.equal(first.options.find(option=>option.provider==='Sophia').evidence,'conditional');
});

test('personal prior-credit evaluation remains a blocker separate from platform research', () => {
  const program = fixture();
  const plan = Planner.generate(program,{completed:[{requirementId:'r',optionId:'u',status:'reported',sourceProvider:'University',creditSystem:'semester'}]});
  const issue = plan.validation.errors.find(issue=>issue.code==='reported_credit');
  assert(issue);
  assert.equal(issue.owner,'student');
  assert(!plan.researchTasks.some(task=>task.code==='reported_credit'));
  assert.equal(plan.totals.reported,3);
  assert.equal(plan.totals.confirmed,0);
});

test('WGU published transfer-grade rules reject D and preserve uncertain business scope conservatively', () => {
  const program = read('dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
  const record = {id:'business-record',provider:'Study.com',code:'SDCM-0009',title:'Business 107',credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-11-01',evaluations:[],grade:'D'};
  const rejected = Guide.matchInventory(program,[record]);
  assert.equal(rejected.completed.length,0);
  assert.equal(rejected.unmatched[0].id,record.id);
  assert(Guide.matchInventory(program,[{...record,grade:'C'}]).completed.some(row=>row.requirementId==='bsmgt-organizational-behavior'));
  assert.equal(Guide.matchInventory(program,[{...record,grade:'C-'}]).completed.length,0);
  const sociology = {id:'nonbusiness-record',provider:'Sophia',code:'SOPH-0051',credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-11-01',evaluations:[],grade:'C-'};
  const reviewed = clone(program), requirement = reviewed.requirements.find(row=>row.code==='C273');
  reviewed.transferRules.gradeScopeSourceIds=[];
  requirement.transferGradeScope='other';
  requirement.transferGradeScopeSourceIds=[program.transferRules.sourceIds[0]];
  assert(Guide.matchInventory(reviewed,[sociology]).completed.some(row=>row.requirementId===requirement.id));
  requirement.transferGradeScopeSourceIds=['unknown-source'];
  assert.equal(Guide.matchInventory(reviewed,[sociology]).completed.length,0);
  const byCode=clone(program);
  byCode.transferRules.gradeScopeSourceIds=[program.transferRules.sourceIds[0]];
  byCode.transferRules.businessReceivingCourseCodes=['C715'];
  byCode.transferRules.otherReceivingCourseCodes=['C273'];
  assert(Guide.matchInventory(byCode,[sociology]).completed.length>0,'reviewed receiving-code scope overrides the legacy core category');
  byCode.transferRules.businessReceivingCourseCodes.push('C273');
  assert.equal(Guide.matchInventory(byCode,[sociology]).completed.length,0,'conflicting scope lists cannot select the easier grade rule');
  assert.equal(record.grade,'D');
});

function semesterFixture(pricing) {
  const program = fixture();
  program.totalCredits=13;program.institutionMinCredits=13;
  program.requirements=[3,3,3,3,1].map((credits,index)=>({id:'r'+index,code:'U'+index,title:'University course '+index,credits,category:'general',institutionalOnly:true,options:[{id:'u'+index,provider:'University',code:'U'+index,title:'University course '+index,credits,evidence:'published',sourceIds:['catalog']}]}));
  program.pricing={...pricing,period:'semester',currency:'USD',sourceIds:['catalog'],sourceUrl:program.sources[0].url};
  return program;
}

test('published semester tuition uses assumed actual term loads and leaves absent load or fees unknown', () => {
  const program=semesterFixture({model:'banded-term',termRate:12695,bandMin:12,bandMax:18,partTimeRate:870});
  const unknown=Planner.generate(program);
  assert.equal(unknown.costs.universityTuition,null);
  assert(unknown.costs.missing.some(reason=>reason.includes('course load per billing semester')));
  const plan=Planner.generate(program,{timing:{universityCreditsPerTerm:12}});
  assert.deepEqual(plan.timing.universityTermLoads,[12,1]);
  assert.deepEqual(plan.costs.universityTermLoads,[12,1]);
  assert.equal(plan.costs.universityTuition,12695+870);
  assert.equal(plan.costs.universityRateBasis,'published-semester-load-scenario');
  assert.equal(plan.costs.total,null);
  assert.equal(plan.timing.scenarioWeeks,null,'a known billed rate does not establish completion time');
  assert.equal(Planner.generate(program,{timing:{universityCreditsPerTerm:19}}).costs.universityTuition,null);
  const unbound=clone(program);unbound.pricing.sourceIds=['missing'];
  assert.equal(Planner.generate(unbound,{timing:{universityCreditsPerTerm:12}}).costs.universityTuition,null);
});

test('threshold tuition charges actual semester loads and honors prerequisite splits', () => {
  const program=semesterFixture({model:'threshold-credit',fullTimeRate:410,partTimeRate:475,fullTimeMin:12});
  const plan=Planner.generate(program,{timing:{universityCreditsPerTerm:12}});
  assert.equal(plan.costs.universityTuition,12*410+475);
  program.requirements[1].prerequisites=['r0'];
  program.requirements[2].prerequisites=['r1'];
  program.requirements[3].prerequisites=['r2'];
  const split=Planner.generate(program,{timing:{universityCreditsPerTerm:12}});
  assert(split.costs.universityTermLoads.every(load=>load<12));
  assert.equal(split.costs.universityTuition,13*475);
});

test('unselected fallback research does not block a named plan and selected placeholders retain academic checks', () => {
  const program=fixture([{message:'Choose a named fallback course if this alternative is used.',owner:'DegreePath',status:'unresolved',scope:'selected-options',requirementIds:['r'],selectionRequiredOnly:true,blocking:false,sourceIds:['catalog']}]);
  program.requirements[0].options.push({id:'placeholder',provider:'University',code:'ELECTIVE',title:'Choose an approved elective',credits:3,selectionRequired:true,evidence:'published',sourceIds:['catalog']});
  const named=Planner.generate(program,{optionSelections:{r:'u'}});
  assert.equal(named.validation.valid,true);
  assert.equal(named.validation.researchNotes.length,0);
  const selected=Planner.generate(program,{optionSelections:{r:'placeholder'}});
  assert(selected.validation.errors.some(issue=>issue.code==='selection_required'));
  assert(!selected.validation.errors.some(issue=>issue.code==='program_research'));
  assert(selected.validation.researchNotes.some(note=>note.optionId==='placeholder'&&note.blocking===false));
  const invalid=clone(program);invalid.unresolved[0].requirementIds=['missing'];
  assert(Planner.generate(invalid).validation.errors.some(issue=>issue.code==='program_research'));
});

test('source identity research names only selected outside choices missing reviewed proof', () => {
  const program=fixture([{message:'Review exact source version.',owner:'DegreePath',scope:'selected-options',missingEvidence:'reviewed-source-identity',sourceIds:['catalog']}]);
  program.totalCredits=6;
  program.requirements.push({id:'outside',code:'OUT101',title:'Outside requirement',category:'general',credits:3,options:[{id:'outside-sophia',provider:'Sophia',code:'SOPH-EXACT',title:'Exact source course',credits:3,evidence:'published',sourceIds:['catalog']}]});
  const input={providers:['Sophia'],optionSelections:{outside:'outside-sophia'}};
  const pending=Planner.generate(program,input);
  const issue=pending.validation.errors.find(issue=>issue.code==='program_research');
  assert.equal(issue.requirementId,'outside');
  assert.equal(issue.optionId,'outside-sophia');
  assert.match(issue.message,/Sophia — Exact source course \(SOPH-EXACT\) → OUT101/);
  const option=program.requirements[1].options[0];
  Object.assign(option,{identitySourceIds:['catalog'],mappingReviewId:'reviewed-map',mappingChecked:'2026-11-17'});
  assert(!Planner.generate(program,input).validation.errors.some(issue=>issue.code==='program_research'));
  option.evidence='conditional';
  assert(Planner.generate(program,{...input,allowConditional:true}).validation.errors.some(issue=>issue.code==='conditional_mapping'));
});

test('Liberty actual 83-credit transfer route does not inherit unselected fallback or blanket version blockers', () => {
  const program=read('dist/data/liberty.json');
  const plan=Planner.generate(program,{providers:['Sophia','Study.com','CLEP'],allowConditional:true,priority:'transfer'});
  assert.equal(plan.totals.external,83);
  assert.equal(plan.totals.institutional,37);
  assert(!plan.validation.errors.some(issue=>/fallback|one-credit|recommendation window|major residency calculation/i.test(issue.message)));
  assert(!plan.validation.researchNotes.some(note=>note.requirementId==='engl-101'),'reviewed exact source identity is not sent back to generic research');
  const versionNotes=plan.validation.researchNotes.filter(note=>note.missingEvidence==='reviewed-source-identity');
  assert.equal(versionNotes.length,0,'independently reviewed provider identities close the seven former source-version gaps');
  assert.equal(plan.validation.valid,true);
  assert(!plan.validation.errors.some(issue=>issue.code==='program_research'&&/BUSI 201/.test(issue.message)));
  assert(plan.personalTasks.some(task=>/Before BUSI 201/.test(task.message)&&task.sourceIds.includes('liberty-busi-prerequisites-2026-2027-reviewed')));
  assert.equal(program.assessmentPlanningScenario.personalAssessmentStatus,'unknown');
  assert.equal(program.assessmentPlanningScenario.assessmentsAssumedPassed,false);
  assert.equal(program.assessmentPlanningScenario.alternativeCourseCreditsIncluded,false);
});
