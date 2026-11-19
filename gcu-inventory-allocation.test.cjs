const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const Guide=require('./dist/guide-engine.js'),Planner=require('./dist/planner.js');
const clone=value=>structuredClone(value);
let model;
before(async()=>{const {buildGCUCampusBSBA}=await import('./scripts/import-gcu-curriculum.mjs'),{addGCUTransferOptions}=await import('./scripts/add-gcu-transfer-options.mjs');model=addGCUTransferOptions(buildGCUCampusBSBA().models[0],require('./content/research/gcu-sophia-review-2026-11-19.json'));assert(Planner.creditBalancePolicy(model));});
const req=(program,id)=>program.requirements.find(r=>r.id===id);
const option=(program,id)=>req(program,id).options.find(o=>o.provider==='Sophia');
const record=(program,id,status='earned')=>{const o=option(program,id);return {id:'source-'+id,provider:o.provider,code:o.code,title:'Original '+o.title,credits:o.sourceCredits,creditSystem:o.sourceCreditSystem,status,completedOn:status==='earned'?'2026-11-19':'',evaluations:[]};};
const input={providers:['Sophia'],allowConditional:true,priority:'transfer',universityRate:0,fees:0};
const choices=(program,ids)=>Object.fromEntries(program.degreeCreditBalancePolicy.equivalencies.map(b=>[b.requirementId,ids.includes(b.requirementId)?b.options.find(o=>o.provider==='Sophia').optionId:req(program,b.requirementId).options.find(o=>o.provider==='University').id]));

test('a three-credit original course projects three receiving credits into four-credit content without mutating records',()=>{
 const records=[record(model,'bus352')],before=JSON.stringify(records),match=Guide.matchInventory(model,records);
 assert.equal(match.completed.length,1);assert.equal(match.completed[0].requirementId,'bus352');assert.equal(match.completed[0].credits,3);assert.equal(match.completed[0].optionId,option(model,'bus352').id);
 const plan=Planner.generate(model,{...input,optionSelections:choices(model,['bus352']),completed:match.completed});assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.blockers));assert.equal(plan.totals.accounted,120);assert.equal(req(model,'bus352').credits,4);assert.equal(plan.rows.find(r=>r.requirementId==='bus352').credits,3);assert.equal(JSON.stringify(records),before);
});

test('saved and in-progress interests survive subset menu matching with their actual three-credit quantity',()=>{
 for(const status of ['saved','in-progress']){
  const records=[record(model,'bus352',status)],before=JSON.stringify(records),match=Guide.matchCollection(model,records);
  assert.equal(match.placements.length,1);assert.equal(match.placements[0].credits,3);assert.equal(match.placements[0].status,status);assert.equal(match.optionSelections.bus352,option(model,'bus352').id);
  const plan=Planner.generate(model,{...input,optionSelections:{...choices(model,['bus352']),...match.optionSelections},plannedLearning:match.placements});assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.reported,0);assert.equal(plan.totals.confirmed,0);assert.equal(JSON.stringify(records),before);
 }
});

test('one-, two-, and three-credit original GCU balance courses retain exact earned quantities and program scope',()=>{
 const majorIds=['fin350','bus352','ecn361'];
 for(const amount of [1,2,3]){
  const balance=model.requirements.find(r=>r.options.some(o=>o.provider==='University'&&o.code==='LDR-'+(460+amount))),o=balance.options[0];
  const records=[...majorIds.slice(0,amount).map(id=>record(model,id)),{id:'gcu-earned-'+amount,provider:'University',institution:model.school,sourceProgramId:model.id,code:o.code,title:o.title,credits:amount,creditSystem:'semester',status:'earned',completedOn:'2026-11-19',evaluations:[]}];
  const match=Guide.matchInventory(model,records);assert.equal(match.completed.length,amount+1);const applied=match.completed.find(p=>p.learningId==='gcu-earned-'+amount);assert.equal(applied.credits,amount);assert.equal(applied.optionId,o.id);
  const plan=Planner.generate(model,{...input,optionSelections:choices(model,majorIds.slice(0,amount)),completed:match.completed});assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.blockers));assert.equal(plan.totals.accounted,120);assert.equal(plan.rows.find(r=>r.requirementId===balance.id).credits,amount);assert.equal(plan.rows.find(r=>r.requirementId===balance.id).status,'reported');assert(!plan.sequence.some(action=>action.requirementIds.includes(balance.id)));
 }
});

test('untrusted row flags, malformed policies and forged explicit source identities do not authorize smaller awards',()=>{
 const p=clone(model);p.degreeCreditBalancePolicy.enabled=false;assert.equal(Planner.creditBalancePolicy(p),null);assert.equal(Guide.matchInventory(p,[record(p,'bus352')]).completed.length,0);
 for(const patch of [{provider:'Other college'},{code:'UNRELATED'},{credits:4},{creditSystem:'quarter'}]){
  const original={...record(model,'bus352'),...patch,evaluations:[{programId:model.id,requirementId:'bus352',optionId:option(model,'bus352').id,status:'confirmed'}]};
  assert.equal(Guide.matchInventory(model,[original]).completed.length,0,JSON.stringify(patch));assert.deepEqual(original.credits,patch.credits??3);
 }
 const forged=clone(model);forged.degreeCreditBalancePolicy.equivalencies.find(b=>b.requirementId==='bus352').options[0].sourceIds=['unreviewed'];assert.equal(Planner.creditBalancePolicy(forged),null);assert.equal(Guide.matchInventory(forged,[{...record(forged,'bus352'),creditBalanceDerived:true,nativeRequirementCredits:4}]).completed.length,0);
});

test('balance credit from another institution, another program or an edited source quantity is not GCU residency',()=>{
 const balance=model.requirements.find(r=>r.options.some(o=>o.code==='LDR-461')),o=balance.options[0];
 const original={id:'one',provider:'University',institution:model.school,sourceProgramId:model.id,code:o.code,title:o.title,credits:1,creditSystem:'semester',status:'earned',evaluations:[{programId:model.id,requirementId:balance.id,optionId:o.id,status:'confirmed'}]};
 for(const patch of [{institution:'Another University'},{sourceProgramId:'another-gcu-program'},{credits:3},{creditSystem:'quarter'}])for(const evaluations of [original.evaluations,[]])assert.equal(Guide.matchInventory(model,[{...original,...patch,evaluations}]).completed.length,0,JSON.stringify(patch));
});

 test('taking a derived balance course keeps real progress without generating a forbidden manual selection',()=>{
 const balance=model.requirements.find(r=>r.options.some(o=>o.code==='LDR-461')),o=balance.options[0],taking={id:'taking-balance',provider:'University',institution:model.school,sourceProgramId:model.id,code:o.code,title:o.title,credits:1,creditSystem:'semester',status:'in-progress',evaluations:[]};
 const match=Guide.matchCollection(model,[taking]);assert.equal(match.placements[0].credits,1);assert.equal(match.placements[0].status,'in-progress');assert.equal(match.optionSelections[balance.id],undefined);assert.equal(match.selections[balance.id],undefined);
 const plan=Planner.generate(model,{...input,optionSelections:{...choices(model,['bus352']),...match.optionSelections},plannedLearning:match.placements});assert.equal(plan.validation.academicCountsValid,true);assert(!plan.setupIssues.some(issue=>issue.code==='invalid_selection'));const row=plan.rows.find(r=>r.requirementId===balance.id);assert.equal(row.credits,1);assert.equal(row.plannedLearningStatus,'in-progress');assert.equal(plan.totals.reported,0);assert.equal(plan.totals.confirmed,0);
 });

 test('recommendation reasons use three actual receiving credits rather than four native content credits',()=>{
 const route={id:'gcu-recommendation-test',modelId:model.id,school:model.school,title:model.title,level:'bachelor',field:'business',fields:['business'],modalities:['campus'],goals:['any-degree','career-growth','change-career']};
 const results=Guide.recommend({degreeLevel:'bachelor',field:'business',modality:'campus'},{pathways:[route]},[model],[record(model,'bus352')]);assert.equal(results.length,1);assert(results[0].reasons.some(reason=>reason.startsWith('3 existing credits')));assert(!results[0].reasons.some(reason=>reason.startsWith('4 existing credits')));
 });
