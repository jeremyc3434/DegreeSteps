const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const Sheet = require('./dist/sheet-state.js');
const Guide = require('./dist/guide-engine.js');
const Planner = require('./dist/planner.js');
const Journey = require('./dist/journey-engine.js');
const clone = value => JSON.parse(JSON.stringify(value));
let model;
before(async () => {
  const {buildGCUCampusBSBA} = await import('./scripts/import-gcu-curriculum.mjs');
  const {addGCUTransferOptions} = await import('./scripts/add-gcu-transfer-options.mjs');
  model = addGCUTransferOptions(buildGCUCampusBSBA().models[0],require('./content/research/gcu-sophia-review-2026-11-19.json'));
  assert(Planner.creditBalancePolicy(model));
});
const fresh = () => ({profile:{},learning:[],scenarios:{},sheet:{}});
const requirement = id => model.requirements.find(req => req.id === id);
const sourceOption = id => requirement(id).options.find(option => option.provider === 'Sophia');
const balance = amount => model.requirements.find(req => req.options.some(option => option.provider === 'University' && option.code === 'LDR-'+(460+amount)));

test('a content-equivalent course progresses using its original three source credits, without changing native four', () => {
  const req=requirement('bus352'),option=sourceOption(req.id),initial=fresh(),before=clone(initial);
  const active=Sheet.recordProgress(initial,model,req,option,'in-progress');
  assert.equal(active.learning[0].credits,3); assert.equal(active.learning[0].creditSystem,'semester');
  assert.equal(active.learning[0].status,'in-progress'); assert.deepEqual(active.learning[0].evaluations,[]);
  assert.equal(req.credits,4); assert.deepEqual(initial,before);
  const done=Sheet.recordProgress(active,model,req,option,'completed',{completedOn:'2026-11-19'}),item=done.learning[0];
  assert.equal(item.credits,3); assert.equal(item.status,'earned'); assert.equal(item.id,active.learning[0].id);
  assert.deepEqual(item.evaluations,[{programId:model.id,requirementId:req.id,optionId:option.id,status:'reported'}]);
  assert.equal(item.completedOn,'2026-11-19'); assert.equal(req.credits,4);
});

test('each zero-native balance row records one real named institutional course with its exact original award', () => {
  for(const amount of [1,2,3]) {
    const req=balance(amount),option=req.options[0]; assert.equal(req.credits,0);
    const active=Sheet.recordProgress(fresh(),model,req,option,'in-progress');
    const done=Sheet.recordProgress(active,model,req,option,'completed'),item=done.learning[0];
    assert.equal(item.credits,amount); assert.equal(item.creditSystem,'semester'); assert.equal(item.provider,'University');
    assert.equal(item.institution,'Grand Canyon University'); assert.equal(item.sourceProgramId,model.id);
    assert.equal(item.evaluations[0].optionId,option.id); assert.equal(item.evaluations[0].status,'reported');
    assert.equal(req.credits,0);
  }
});

test('confirmation remains an explicit action on a known completed source record for both kinds of award', () => {
  for(const [req,option] of [[requirement('bus352'),sourceOption('bus352')],[balance(1),balance(1).options[0]]]) {
    assert.throws(()=>Sheet.recordProgress(fresh(),model,req,option,'confirmed',{confirmation:true}),/confirmation|saved completed/);
    const done=Sheet.recordProgress(fresh(),model,req,option,'completed');
    assert.throws(()=>Sheet.recordProgress(done,model,req,option,'confirmed'),/explicit confirmation/);
    const confirmed=Sheet.recordProgress(done,model,req,option,'confirmed',{confirmation:true,recordId:done.learning[0].id});
    assert.equal(confirmed.learning[0].credits,option.sourceCredits);
    assert.equal(confirmed.learning[0].evaluations[0].status,'confirmed');
    assert.throws(()=>Sheet.recordProgress(confirmed,model,req,option,'in-progress'),/completed|earned/);
  }
});

test('a local flag, edited option, invalid mapping source or zero award cannot bypass progress quantity rules', () => {
  const req=requirement('bus352'),option=sourceOption(req.id);
  for(const edit of [item=>{item.credits=4;},item=>{item.sourceCredits=4;},item=>{item.code='SOPH-FORGED';},item=>{item.sourceIds=[];}]) {
    const bad=clone(option); edit(bad);
    assert.throws(()=>Sheet.recordProgress(fresh(),model,req,bad,'completed'));
  }
  for(const edit of [program=>{program.degreeCreditBalancePolicy.enabled=false;},program=>{program.degreeCreditBalancePolicy.maxBalanceCredits=99;},program=>{program.degreeCreditBalancePolicy.sourceIds=[];}]) {
    const bad=clone(model); edit(bad); const target=bad.requirements.find(item=>item.id===req.id),outside=target.options.find(item=>item.id===option.id);
    assert.throws(()=>Sheet.recordProgress(fresh(),bad,target,outside,'completed'));
    const zero=bad.requirements.find(item=>item.id===balance(1).id);
    assert.throws(()=>Sheet.recordProgress(fresh(),bad,zero,zero.options[0],'completed'));
  }
  const bad=clone(model),zero=bad.requirements.find(item=>item.id===balance(1).id);zero.options[0].sourceCredits=0;
  assert.throws(()=>Sheet.recordProgress(fresh(),bad,zero,zero.options[0],'completed'));
});

test('existing source quantities are preserved and reviewed instead of overwritten to fit the mapping', () => {
  const req=requirement('bus352'),option=sourceOption(req.id),done=Sheet.recordProgress(fresh(),model,req,option,'completed');
  for(const changes of [{credits:4},{credits:2},{creditSystem:'quarter'},{credits:null}]) {
    const saved=clone(done);Object.assign(saved.learning[0],changes);const before=clone(saved);
    assert.throws(()=>Sheet.recordProgress(saved,model,req,option,'completed',{recordId:saved.learning[0].id}));
    assert.deepEqual(saved,before);
  }
});

test('institutional balance progress never reuses another college or program source as GCU residency', () => {
  const req=balance(1),option=req.options[0],done=Sheet.recordProgress(fresh(),model,req,option,'completed');
  for(const changes of [{institution:'Another College'},{sourceProgramId:'another-program'}]) {
    const other=clone(done);Object.assign(other.learning[0],changes);
    assert.throws(()=>Sheet.recordProgress(other,model,req,option,'completed',{recordId:other.learning[0].id}),/does not match/);
    const next=Sheet.recordProgress(other,model,req,option,'completed');
    assert.equal(next.learning.length,2);assert.equal(next.learning[1].institution,model.school);assert.equal(next.learning[1].sourceProgramId,model.id);
    assert.deepEqual(next.learning[0],other.learning[0]);
  }
});

test('canonical earned-three allocation consumes three source credits and cannot allocate that action twice', () => {
  const req=requirement('bus352'),option=sourceOption(req.id),done=Sheet.recordProgress(fresh(),model,req,option,'completed');
  const replay=Sheet.recordProgress(done,model,req,option,'completed');
  assert.equal(replay.learning.length,1);assert.equal(replay.learning[0].evaluations.length,1);
  assert.equal(replay.learning[0].credits,3);
  const forged=clone(done);forged.learning[0].evaluations.push({programId:model.id,requirementId:'fin350',optionId:sourceOption('fin350').id,status:'confirmed'});
  assert.throws(()=>Sheet.recordProgress(forged,model,req,option,'completed'),/allocated/);
});

test('completed and confirmed original courses round-trip through inventory matching and the actual-credit planner', () => {
  const req=requirement('bus352'),option=sourceOption(req.id),balanceReq=balance(1);
  let value=Sheet.recordProgress(fresh(),model,req,option,'completed');
  value=Sheet.recordProgress(value,model,balanceReq,balanceReq.options[0],'completed');
  for(const status of ['reported','confirmed']) {
    if(status==='confirmed')for(const target of [req,balanceReq]) {
      const source=target.id===req.id?option:target.options[0],record=value.learning.find(item=>item.code===source.code);
      value=Sheet.recordProgress(value,model,target,source,'confirmed',{confirmation:true,recordId:record.id});
    }
    const inventory=Guide.matchInventory(model,value.learning);
    assert.equal(inventory.completed.length,2);assert.equal(inventory.unmatched.length,0);
    assert(inventory.completed.every(item=>item.status===status && item.optionId));
    const plan=Planner.generate(model,{providers:['Sophia'],priority:'transfer',completed:inventory.completed});
    assert(plan.validation.academicCountsValid,JSON.stringify(plan.blockers));
    assert.equal(plan.totals.accounted,120);assert.equal(plan.rows.find(row=>row.requirementId===req.id).credits,3);
    assert.equal(plan.rows.find(row=>row.requirementId===balanceReq.id).credits,1);
    assert.equal(status==='reported'?plan.totals.reported:plan.totals.confirmed,4);
  }
});

test('a transcript spreadsheet source remains three original credits and matches the reviewed destination content', () => {
  const option=sourceOption('bus352'),records=Sheet.parseCSV('provider,code,title,credits,creditSystem,status\nSophia,'+option.code+',Original transcript title,3,semester,earned\n');
  const inventory=Guide.matchInventory(model,records);
  assert.equal(records[0].credits,3);assert.equal(inventory.completed.length,1);
  assert.equal(inventory.completed[0].requirementId,'bus352');assert.equal(inventory.completed[0].optionId,option.id);
  const plan=Planner.generate(model,{providers:['Sophia'],priority:'transfer',completed:inventory.completed});
  assert(plan.validation.academicCountsValid);assert.equal(plan.totals.accounted,120);
  assert.equal(plan.rows.find(row=>row.requirementId==='bus352').credits,3);
});

test('the student journey rebuild retains exact completed courses and derived institutional earned amounts', () => {
  const route={id:'gcu-bsba-campus',modelId:model.id,school:model.school,title:model.title,level:'bachelor',field:'business',fields:['business'],modalities:['campus'],goals:['any-degree','career-growth']},catalog={pathways:[route]};
  let value=Sheet.selectPathway(Journey.initialize(null,null,catalog),route);
  value.scenarios[model.id]={providers:['Sophia'],allowConditional:true,universityRate:450,fees:0};value.profile.priority='transfer';
  const req=requirement('bus352'),option=sourceOption(req.id),balanceReq=balance(1);
  value=Sheet.recordProgress(value,model,req,option,'completed');
  value=Sheet.recordProgress(value,model,balanceReq,balanceReq.options[0],'completed');
  const draft=Journey.buildDraft(value,catalog,[model]);
  assert(draft.plan);assert(draft.plan.validation.academicCountsValid,JSON.stringify(draft.plan.blockers));
  assert.equal(draft.plan.rows.find(row=>row.requirementId===req.id).status,'reported');
  assert.equal(draft.plan.rows.find(row=>row.requirementId===balanceReq.id).status,'reported');
  assert.equal(draft.plan.totals.reported,4);assert.equal(draft.plan.totals.accounted,120);
  assert.equal(req.credits,4);assert.equal(balanceReq.credits,0);
});
