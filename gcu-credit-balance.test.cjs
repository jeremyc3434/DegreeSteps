const assert = require('node:assert/strict');
const test = require('node:test');
const Planner = require('./dist/planner.js');
const native = require('./content/curricula/gcu-bsba-campus.json').models[0];
const clone = value => JSON.parse(JSON.stringify(value));
const row = (plan,id) => plan.rows.find(item => item.requirementId === id);
const binding = (program,id) => program.degreeCreditBalancePolicy.equivalencies.find(item => item.requirementId === id);
const selected = (program,ids) => Object.fromEntries(ids.map(id => [id,binding(program,id).options[0].optionId]));
const input = {providers:['Sophia'],priority:'transfer',universityRate:450,fees:0,feesConfirmed:true,taxesConfirmed:true,examFeesConfirmed:true,optimizationNodeBudget:100000};

// Synthetic course matches exercise the quantity model, not real published
// transfer evidence. Production receives independently researched map sources.
function fixture(ids = ['bit200','acc240','mkt315','bus352','bus332'], upper = []) {
  const program = clone(native);
  program.id = 'gcu-credit-balance-test';
  program.sources.push({id:'test-gcu-map',url:'https://transfersearch.gcu.edu/test-fixture'}, {id:'test-provider',url:'https://www.sophia.org/test-fixture'});
  const policy = program.degreeCreditBalancePolicy = {
    enabled:true,kind:'gcu-earned-credit-balance-v1',creditSystem:'semester',minimumDegreeCredits:120,maxBalanceCredits:6,
    sourceIds:['gcu-baccalaureate-transfer-fall-2026-2026-11-19','gcu-degree-credit-shortfall-fall-2026-2026-11-19'],
    writingIntensiveRequirementIds:['bus340','bus485'],balanceRequirementIds:[],equivalencies:[]
  };
  for (const id of ids) {
    const req = program.requirements.find(item => item.id === id);
    const option = {id:'test-sophia-'+id,provider:'Sophia',code:'TEST-'+id,title:'Synthetic '+id,receivingCode:req.code,
      credits:3,sourceCredits:3,creditSystem:'semester',sourceCreditSystem:'semester',creditOrigin:'ace',upper:upper.includes(id),
      ...(upper.includes(id) ? {sourceUpper:true} : {}),evidence:'published',sourceIds:['test-gcu-map','test-provider']};
    req.options.push(option);
    policy.equivalencies.push({requirementId:id,nativeCredits:4,awardedCredits:3,options:[{optionId:option.id,provider:option.provider,code:option.code,sourceCredits:3,sourceCreditSystem:'semester',sourceIds:['test-gcu-map']}]});
  }
  const candidates = native.degreeCreditBalancePolicy.courseIdentityCandidates;
  for (const [index,amount] of [1,2,3].entries()) {
    const candidate = candidates.find(item => item.code === 'LDR-'+(461+index));
    assert(candidate,'Native research needs the named current Service Learning identity');
    const id = 'degree-credit-balance-'+(461+index); policy.balanceRequirementIds.push(id);
    program.requirements.push({id,code:candidate.code,title:candidate.title,credits:0,category:'elective',subgroup:'degree-credit-balance',institutionalOnly:true,sourceIds:[...candidate.sourceIds],
      options:[{id:'university-'+id,provider:'University',code:candidate.code,title:candidate.title,credits:amount,sourceCredits:amount,creditSystem:'semester',sourceCreditSystem:'semester',creditOrigin:'institutional',upper:true,evidence:'published',sourceIds:[...candidate.sourceIds]}]});
  }
  return program;
}

test('native curriculum remains 120, with no invented balancing work when nothing transfers', () => {
  const program = fixture(), before = JSON.stringify(program);
  assert.equal(Planner.creditBalancePolicy(program),program.degreeCreditBalancePolicy);
  const plan = Planner.generate(program,{...input,providers:[]});
  assert(plan.validation.valid,JSON.stringify(plan.blockers));
  assert.equal(plan.totals.accounted,120); assert.equal(plan.totals.institutional,120);
  for (const id of program.degreeCreditBalancePolicy.balanceRequirementIds) {
    assert.equal(row(plan,id).credits,0); assert.equal(row(plan,id).option,null);
    assert.equal(row(plan,id).nativeRequirementCredits,0); assert.equal(row(plan,id).creditBalanceDerived,true);
    assert(!plan.sequence.some(action => action.requirementIds.includes(id)));
  }
  assert.equal(JSON.stringify(program),before,'generation must not modify reviewed source data');
});

test('three earned credits fulfill four-credit content and one real named course fills the shortfall', () => {
  const program = fixture(['bit200']);
  const plan = Planner.generate(program,input);
  assert(plan.validation.valid,JSON.stringify(plan.blockers));
  assert.equal(row(plan,'bit200').credits,3); assert.equal(row(plan,'bit200').nativeRequirementCredits,4);
  assert.equal(row(plan,'bit200').option.sourceCredits,3);
  assert.equal(program.requirements.find(req => req.id === 'bit200').credits,4);
  const active = plan.rows.filter(item => item.creditBalanceDerived && item.option);
  assert.deepEqual(active.map(item => [item.option.code,item.credits]),[['LDR-461',1]]);
  assert.equal(plan.totals.accounted,120); assert.equal(plan.totals.external,3);
  assert.equal(plan.totals.institutional,117); assert.equal(plan.totals.majorInstitutional,60);
  assert.equal(plan.coverage.mappedExternalCredits,3);
  assert.equal(plan.costs.universityCredits,117);
});

test('each exact deficit from zero through six uses distinct reviewed 1/2/3-credit identities only', () => {
  const ids = ['bit200','acc240','mkt315','bus352','bus332','bit301'];
  const program = fixture(ids);
  for (let count = 0; count <= 6; count++) {
    const selections = {...Object.fromEntries(ids.map(id => [id,'university-'+id])),...selected(program,ids.slice(0,count))};
    const plan = Planner.generate(program,{...input,optionSelections:selections});
    assert(plan.validation.valid,'deficit '+count+': '+JSON.stringify(plan.blockers));
    const active = plan.rows.filter(item => item.creditBalanceDerived && item.option);
    assert.equal(active.reduce((sum,item) => sum+item.credits,0),count);
    assert.equal(new Set(active.map(item => item.option.code)).size,active.length);
    assert(active.every(item => [1,2,3].includes(item.credits) && item.option.provider === 'University'));
    assert.equal(plan.totals.accounted,120); assert.equal(plan.totals.external,count*3);
    assert.equal(plan.totals.institutional,120-count*3);
  }
});

test('source-backed upper award earns three upper credits, never four; lower source does not inherit native level', () => {
  for (const isUpper of [false,true]) {
    const program = fixture(['mkt315'],isUpper ? ['mkt315'] : []);
    const plan = Planner.generate(program,input);
    assert(plan.validation.valid);
    const coreUpper = plan.rows.filter(item => item.subgroup === 'business-core' && item.upper).reduce((sum,item) => sum+item.credits,0);
    assert.equal(coreUpper,isUpper ? 55 : 52);
    assert.equal(plan.totals.upper,isUpper ? 56 : 53); // one genuine upper service credit
  }
});

test('seventh shortfall is infeasible when forced; automatic search can select at most six such transfers', () => {
  const ids = ['bit200','acc240','mkt315','bus352','bus332','bit301','ecn361'];
  const program = fixture(ids);
  const forced = Planner.generate(program,{...input,optionSelections:selected(program,ids)});
  assert(!forced.validation.academicCountsValid);
  assert(forced.blockers.some(error => error.code === 'credit_balance'));
  assert(forced.blockers.some(error => error.code === 'total_credits'));
  assert.equal(forced.rows.filter(item => item.creditBalanceDerived && item.option).length,0);
  const automatic = Planner.generate(program,input);
  assert(automatic.validation.valid,JSON.stringify(automatic.blockers));
  assert.equal(automatic.totals.external,18); assert.equal(automatic.totals.accounted,120);
  assert.equal(automatic.optimization.status,'optimal-for-model');
});

test('actual transfer caps and institutional/major/upper minima still constrain the optimized plan', () => {
  const program = fixture();
  program.alternativeMaxCredits = 8;
  const capped = Planner.generate(program,input);
  assert(capped.validation.valid); assert.equal(capped.totals.alternative,6);
  const forced = Planner.generate(program,{...input,optionSelections:selected(program,['bit200','acc240','mkt315'])});
  assert(forced.blockers.some(error => error.code === 'alternative_cap'));
  program.alternativeMaxCredits = 30; program.upperGroupMinimums = [{group:'business-core',credits:56}];
  const upper = Planner.generate(program,input);
  assert(upper.validation.valid); assert.equal(upper.totals.external,6);
  assert.equal(row(upper,'mkt315').option.provider,'University');
});

test('earned general education minima cannot be backfilled with elective Service Learning credits', () => {
  const program = fixture(['phi105','mat144']);
  const forced = Planner.generate(program,{...input,optionSelections:selected(program,['phi105','mat144'])});
  assert(forced.blockers.some(error => error.code === 'general_education_minimum'));
  assert.equal(forced.totals.accounted,120);
  const automatic = Planner.generate(program,input);
  assert(automatic.validation.valid); assert.equal(automatic.totals.external,3);
});

test('writing-intensive native courses cannot be replaced on content equivalency alone', () => {
  const program = fixture(['bus340']);
  assert(Planner.creditBalancePolicy(program));
  assert.deepEqual(Planner.availableOptions(program,'bus340',input).map(option => option.provider),['University']);
  const plan = Planner.generate(program,{...input,optionSelections:selected(program,['bus340'])});
  assert(plan.blockers.some(error => error.code === 'invalid_selection'));
  assert.equal(row(plan,'bus340').option.provider,'University');
});

test('switching a scenario back to native work removes balancing actions and restores actual costs', () => {
  const program = fixture(['bit200']);
  const accelerated = Planner.generate(program,input);
  const nativePlan = Planner.generate(program,{...input,optionSelections:{bit200:'university-bit200'}});
  assert.equal(accelerated.totals.external,3); assert.equal(nativePlan.totals.external,0);
  assert.equal(nativePlan.totals.accounted,120);
  assert(!nativePlan.rows.some(item => item.creditBalanceDerived && item.option));
  assert.equal(nativePlan.costs.universityCredits,120);
  assert(!nativePlan.sequence.some(action => /^LDR-46/.test(action.code)));
});

test('an explicit credit-balance action is derived from need, never a selectable source of extra credit', () => {
  const program = fixture(['bit200']), id = program.degreeCreditBalancePolicy.balanceRequirementIds[2];
  const plan = Planner.generate(program,{...input,providers:[],optionSelections:{[id]:'university-'+id}});
  assert(plan.blockers.some(error => error.code === 'invalid_selection'));
  assert.equal(plan.totals.accounted,120);
  assert.equal(row(plan,id).option,null);
});

test('invalid policy/quantity/source/identity changes cannot enable a variable-credit exception', () => {
  const changes = [
    program => {program.school = 'Another University';},
    program => {program.degreeCreditBalancePolicy.sourceIds = ['test-provider'];},
    program => {program.sources.find(item => item.id === 'test-gcu-map').url = 'https://gcu.edu.attacker.example/map';},
    program => {program.degreeCreditBalancePolicy.equivalencies[0].awardedCredits = 4;},
    program => {program.degreeCreditBalancePolicy.equivalencies[0].options[0].code = 'different-source';},
    program => {program.requirements.find(item => item.id === 'bit200').options[1].sourceCredits = null;},
    program => {program.requirements.find(item => item.id === 'bit200').options[1].credits = -3;},
    program => {program.requirements.find(item => item.id === 'bit200').options[1].sourceCreditSystem = 'quarter';},
    program => {program.requirements.find(item => item.id === 'bit200').options[1].upper = true;},
    program => {program.degreeCreditBalancePolicy.maxBalanceCredits = 9;},
    program => {program.degreeCreditBalancePolicy.automaticRepeatAllowed = true;},
    program => {program.requirements.at(-1).options[0].credits = 4;},
    program => {program.requirements.at(-1).options[0].receivingCourseRepeatable = true;},
    program => {program.requirements.at(-1).options[0].code = 'LDR-461';},
    program => {program.generalEducationMinimums = [];},
    program => {program.degreeCreditBalancePolicy.writingIntensiveRequirementIds = [];}
  ];
  for (const change of changes) {
    const program = fixture(['bit200']); change(program);
    assert.equal(Planner.creditBalancePolicy(program),null,change.toString());
    const plan = Planner.generate(program,input);
    assert(!plan.validation.valid); assert(plan.blockers.some(error => error.code === 'credit_balance_policy'));
  }
});

test('the exact GCU Sophia partner table is valid mapping evidence, never a general policy authority', () => {
  const program = fixture(['bit200']);
  program.sources.find(source => source.id === 'test-gcu-map').url = 'https://gcu.sophia.org/';
  assert(Planner.creditBalancePolicy(program)); assert(Planner.generate(program,input).validation.valid);
  for (const host of ['www.sophia.org','othercollege.sophia.org','gcu.sophia.org.attacker.example']) {
    const bad = clone(program); bad.sources.find(source => source.id === 'test-gcu-map').url = 'https://'+host+'/';
    assert.equal(Planner.creditBalancePolicy(bad),null,host);
  }
  const badPolicy = clone(program); badPolicy.degreeCreditBalancePolicy.sourceIds = ['test-gcu-map'];
  assert.equal(Planner.creditBalancePolicy(badPolicy),null);
  const badProvider = clone(program);
  badProvider.requirements.find(req => req.id === 'bit200').options[1].provider = 'Study.com';
  badProvider.degreeCreditBalancePolicy.equivalencies[0].options[0].provider = 'Study.com';
  assert.equal(Planner.creditBalancePolicy(badProvider),null);
});

test('completed mapped work earns its actual three credits without repurchase; existing balance work is used once', () => {
  const program = fixture(['bit200']), optionId = binding(program,'bit200').options[0].optionId;
  const balanceId = program.degreeCreditBalancePolicy.balanceRequirementIds[0];
  const plan = Planner.generate(program,{...input,providers:[],completed:[{requirementId:'bit200',optionId,status:'confirmed'},
    {requirementId:balanceId,optionId:'university-'+balanceId,status:'confirmed'}]});
  assert(plan.validation.valid,JSON.stringify(plan.blockers));
  assert.equal(plan.totals.accounted,120); assert.equal(plan.totals.confirmed,4);
  assert.equal(row(plan,'bit200').credits,3); assert.equal(row(plan,balanceId).credits,1);
  assert(!plan.sequence.some(action => action.requirementIds.includes('bit200') || action.requirementIds.includes(balanceId)));
  assert.equal(plan.costs.universityCredits,116); assert.equal(plan.costs.providerCosts.length,0);
});

test('a completed one-credit balance source can remain unapplied when a changed plan needs exactly two', () => {
  const program=fixture(['bit200','acc240']),ids=program.degreeCreditBalancePolicy.balanceRequirementIds;
  const completed=[{requirementId:ids[0],optionId:'university-'+ids[0],status:'confirmed'}],before=clone(completed);
  const plan=Planner.generate(program,{...input,completed,optionSelections:selected(program,['bit200','acc240'])});
  assert(plan.validation.valid,JSON.stringify(plan.blockers));assert.equal(plan.totals.accounted,120);
  assert.equal(plan.totals.external,6);assert.equal(plan.totals.confirmed,0);
  assert.equal(row(plan,ids[0]).credits,0);assert.equal(row(plan,ids[0]).option,null);
  assert.equal(row(plan,ids[1]).credits,2);assert.equal(row(plan,ids[1]).option.code,'LDR-462');assert.equal(row(plan,ids[1]).status,'planned');
  assert(!plan.sequence.some(action=>action.code==='LDR-461'));
  assert.deepEqual(completed,before,'The unused original completion remains available privately.');
  // The same completed source is still used, with no new course action, when
  // another what-if choice changes the exact shortfall back to one credit.
  const changed=Planner.generate(program,{...input,completed,optionSelections:{...selected(program,['bit200']),acc240:'university-acc240'}});
  assert(changed.validation.valid);assert.equal(changed.totals.accounted,120);assert.equal(row(changed,ids[0]).status,'confirmed');
  assert.equal(changed.totals.confirmed,1);assert(!changed.sequence.some(action=>/^LDR-46/.test(action.code)));
});

test('six completed balance credits allocate only the exact one-plus-three subset when a changed plan needs four', () => {
  const nativeIds=['bit200','acc240','mkt315','bus352'],program=fixture(nativeIds),ids=program.degreeCreditBalancePolicy.balanceRequirementIds;
  const completed=ids.map(requirementId=>({requirementId,optionId:'university-'+requirementId,status:'confirmed'})),before=clone(completed);
  const plan=Planner.generate(program,{...input,completed,optionSelections:selected(program,nativeIds)});
  assert(plan.validation.valid,JSON.stringify(plan.blockers));assert.equal(plan.totals.accounted,120);
  assert.equal(plan.totals.external,12);assert.equal(plan.totals.confirmed,4);
  assert.deepEqual(plan.rows.filter(row=>row.creditBalanceDerived && row.option).map(row=>[row.option.code,row.credits,row.status]),[['LDR-461',1,'confirmed'],['LDR-463',3,'confirmed']]);
  assert.equal(row(plan,ids[1]).credits,0);assert.equal(row(plan,ids[1]).option,null);
  assert(!plan.sequence.some(action=>/^LDR-46/.test(action.code)),'Selected completions must not generate repurchase actions.');
  assert.deepEqual(completed,before);assert.equal(completed.length,3);
  // Bounded assignment revisits several different deficits; inactive internal
  // candidate rows must not lose access to those original completed awards.
  const automatic=Planner.generate(program,{...input,completed,optimizationNodeBudget:100000});
  assert(automatic.validation.valid);assert.equal(automatic.totals.accounted,120);assert.equal(automatic.totals.confirmed,4);
});

test('a source-bound course already in progress wins a balance tie without becoming earned credit', () => {
  const reqs=['bit200','acc240','mkt315'],program=fixture(reqs),id=program.degreeCreditBalancePolicy.balanceRequirementIds[0],option=program.requirements.find(req=>req.id===id).options[0];
  const taking={requirementId:id,optionId:option.id,provider:option.provider,code:option.code,credits:1,creditSystem:'semester',sourceCredits:1,sourceCreditSystem:'semester',institution:program.school,sourceProgramId:program.id,learningId:'existing-ldr461-source',status:'in-progress'};
  const settings={...input,optionSelections:selected(program,reqs)},plan=Planner.generate(program,{...settings,plannedLearning:[taking]});
  assert(plan.validation.valid,JSON.stringify(plan.blockers));assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
  assert.deepEqual(plan.rows.filter(row=>row.creditBalanceDerived && row.option).map(row=>row.option.code),['LDR-461','LDR-462']);
  assert.equal(row(plan,id).plannedLearningStatus,'in-progress');assert.equal(row(plan,id).credits,1);assert.equal(row(plan,id).status,'planned');
  for(const patch of [{institution:'Another college'},{sourceProgramId:'another-program'},{sourceCredits:3},{sourceCreditSystem:'quarter'},{credits:3},{code:'LDR-463'},{provider:'Sophia'},{optionId:'unknown-option'},{learningId:''}]) {
    const unsupported=Planner.generate(program,{...settings,plannedLearning:[{...taking,...patch}]});
    assert(unsupported.validation.valid);assert.deepEqual(unsupported.rows.filter(row=>row.creditBalanceDerived && row.option).map(row=>row.option.code),['LDR-463'],JSON.stringify(patch));
  }
});

test('a zero search budget retains a valid, already balanced incumbent and does not claim optimality', () => {
  const program = fixture(), plan = Planner.generate(program,{...input,optimizationNodeBudget:0});
  assert(plan.validation.valid,JSON.stringify(plan.blockers)); assert.equal(plan.totals.accounted,120);
  assert.equal(plan.optimization.status,'best-found'); assert.equal(plan.optimization.optimalityProven,false);
});

test('plan validation detects edited earned quantity, source identity, balance quantity and metadata without repairing them', () => {
  const program = fixture(['bit200']), valid = Planner.generate(program,input);
  const changes = [
    plan => {row(plan,'bit200').credits = 4; row(plan,'bit200').option.credits = 4;},
    plan => {row(plan,'bit200').option.sourceCredits = 4;},
    plan => {row(plan,'bit200').option.sourceUpper = true;},
    plan => {row(plan,'bit200').nativeRequirementCredits = 3;},
    plan => {row(plan,'bit200').sourceIds = ['test-provider'];},
    plan => {const active=plan.rows.find(item => item.creditBalanceDerived && item.option); active.credits=2; active.option.credits=2;},
    plan => {const active=plan.rows.find(item => item.creditBalanceDerived && item.option); active.option.code='SLV-999';},
    plan => {const active=plan.rows.find(item => item.creditBalanceDerived && item.option); active.creditBalanceDerived=false;},
    plan => {const inactive=plan.rows.find(item => item.creditBalanceDerived && !item.option); inactive.credits=-1;}
  ];
  for (const change of changes) {
    const plan = clone(valid); change(plan); const before = JSON.stringify(plan);
    const validation = Planner.validate(program,plan);
    assert(!validation.valid,change.toString());
    assert.equal(validation.academicCountsValid,false,change.toString());
    assert.equal(JSON.stringify(plan),before);
  }
});

test('inactive narrative policy never relaxes old fixed-credit requirements', () => {
  const program = fixture(['bit200']); program.degreeCreditBalancePolicy.enabled = false;
  assert.equal(Planner.creditBalancePolicy(program),null);
  assert(!Planner.availableOptions(program,'bit200',input).some(option => option.provider === 'Sophia'));
  const original = Planner.generate(clone(native),{providers:[]});
  assert(original.validation.valid); assert.equal(original.totals.accounted,120);
  assert(original.rows.every(item => !item.creditBalanceDerived && item.nativeRequirementCredits === undefined));
});

test('canonical GCU mixed-provider planning finds the cheaper complete pair replacement within its existing budget', async () => {
  const {buildGCUCampusBSBA}=await import('./scripts/import-gcu-curriculum.mjs');
  const {addGCUTransferOptions}=await import('./scripts/add-gcu-transfer-options.mjs');
  const {addGCUInstitutionalOptions}=await import('./scripts/add-gcu-institutional-options.mjs');
  const program=addGCUInstitutionalOptions(addGCUTransferOptions(buildGCUCampusBSBA().models[0],require('./content/research/gcu-sophia-review-2026-11-19.json')),require('./content/research/gcu-institutional-maps-2026-11-19.json'));
  const settings={providers:['Sophia','ASU Universal Learner'],priority:'transfer'};
  const plan=Planner.generate(program,settings);
  assert(plan.validation.valid,JSON.stringify(plan.blockers));
  assert.deepEqual([plan.totals.accounted,plan.totals.external,plan.totals.institutional],[120,26,94]);
  assert.equal(plan.costs.knownSubtotal,949,'One Sophia membership plus two published ASU course fees; university tuition and other missing costs remain unknown.');
  assert.equal(plan.totals.alternative,18);assert.equal(plan.rows.filter(row=>row.option?.provider==='ASU Universal Learner').length,2);
  assert.equal(row(plan,'bit200').option.provider,'University');assert.equal(row(plan,'bus352').option.provider,'Sophia');
  assert(plan.optimization.pairedRepairStatesVisited>0);assert(plan.optimization.statesVisited<=12000);
  assert.equal(plan.optimization.status,'best-found');assert.equal(plan.optimization.optimalityProven,false);
  const fixed=program.requirements.find(req=>req.id==='bit200').options.find(option=>option.provider==='ASU Universal Learner');
  const preferred=Planner.generate(program,{...settings,optionSelections:{bit200:fixed.id}});
  assert(preferred.validation.valid);assert.equal(row(preferred,'bit200').option.id,fixed.id,'A cheaper automatic pair cannot override a student selection.');
  const completed=[{requirementId:'bit200',optionId:fixed.id,status:'confirmed'}];
  const existing=Planner.generate(program,{...settings,completed});
  assert(existing.validation.valid);assert.equal(row(existing,'bit200').option.id,fixed.id);assert.equal(row(existing,'bit200').status,'confirmed');
  assert.equal(existing.totals.confirmed,3,'Completed source credit is preserved at its actual award, without replacement.');
});
