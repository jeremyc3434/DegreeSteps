const test=require('node:test'),assert=require('node:assert/strict');
const Planner=require('./dist/planner.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const source='review',university=(id,upper=false)=>({id:'university-'+id,provider:'University',title:id,code:id.toUpperCase(),credits:3,upper,evidence:'published',sourceIds:[source]});
 const external=(id,code)=>({id,provider:'Sophia',title:id,code,receivingCode:'ENG101',credits:3,sourceCredits:3,sourceCreditSystem:'semester',creditOrigin:'alternative',evidence:'published',sourceIds:[source]});
 const model={id:'reviewed-default-degree',school:'Example University',title:'Example degree',level:'bachelor',format:'Online',catalogYear:'2026-2027',creditSystem:'semester',totalCredits:9,institutionMinCredits:3,externalMaxCredits:6,upperMinCredits:3,sources:[{id:source,url:'https://example.edu/catalog/',checked:'2026-11-19'}],requirements:[{id:'writing',code:'ENG101',title:'Writing',credits:3,options:[external('other-writing','SOPH-A'),external('reviewed-writing','SOPH-B'),university('writing')]},{id:'capstone',code:'CAP400',title:'Capstone',credits:3,upper:true,institutionalOnly:true,options:[university('capstone',true)]},{id:'elective',code:'ELE101',title:'Elective',credits:3,options:[{...external('other-elective','SOPH-C'),receivingCode:'ELE101'},{...external('reviewed-elective','SOPH-D'),receivingCode:'ELE101'},university('elective')]}]};
 model.reviewedBaselineChoices={version:1,modelId:model.id,catalogYear:model.catalogYear,format:model.format,creditSystem:model.creditSystem,totalCredits:model.totalCredits,checkedOn:'2026-11-19',reviewId:'exact-degree-review',sourceIds:[source],optionSelections:{writing:'reviewed-writing',elective:'reviewed-elective'}};
 return model;
}
const input={providers:['Sophia'],allowConditional:true,priority:'transfer',completed:[]};
const chosen=plan=>Object.fromEntries(plan.rows.map(row=>[row.requirementId,row.option?.id]));
test('a source-bound reviewed route becomes the same complete starting plan without mutating a student or academic model',()=>{
 const model=fixture(),settings=copy(input),before=JSON.stringify([model,settings]);
 const plan=Planner.generate(model,settings);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.accounted,9);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(chosen(plan).writing,'reviewed-writing');assert.equal(chosen(plan).elective,'reviewed-elective');
 assert.equal(JSON.stringify([model,settings]),before);
});
test('explicit choices and reported or confirmed records take precedence over starting defaults',()=>{
 const model=fixture();
 const selected=Planner.generate(model,{...input,optionSelections:{writing:'other-writing'}});
 assert.equal(chosen(selected).writing,'other-writing');assert.equal(chosen(selected).elective,'reviewed-elective');
 for(const status of ['reported','confirmed']){
  const plan=Planner.generate(model,{...input,completed:[{requirementId:'writing',optionId:'other-writing',provider:'Sophia',sourceProvider:'Sophia',code:'SOPH-A',credits:3,creditSystem:'semester',status}]});
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(chosen(plan).writing,'other-writing');assert.equal(plan.rows.find(row=>row.requirementId==='writing').status,status);
 }
});
test('provider and evidence preferences cannot be overridden by a reviewed default',()=>{
 const model=fixture(),none=Planner.generate(model,{...input,providers:[]});
 assert.equal(none.validation.academicCountsValid,true);assert(none.rows.every(row=>row.option.provider==='University'));assert.equal(none.setupIssues.length,0);
 const conditional=copy(model);conditional.requirements[0].options.find(option=>option.id==='reviewed-writing').evidence='conditional';
 const plan=Planner.generate(conditional,{...input,allowConditional:false});
 assert.equal(plan.validation.academicCountsValid,true);assert.notEqual(chosen(plan).writing,'reviewed-writing');assert.equal(plan.setupIssues.length,0);
});
test('a default that conflicts with residency falls back to a valid assignment without deleting a personal choice',()=>{
 const model=fixture();model.institutionMinCredits=6;model.externalMaxCredits=3;
 const plan=Planner.generate(model,input);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.external,3);assert.equal(plan.totals.institutional,6);assert.equal(plan.setupIssues.length,0);
 const selected=Planner.generate(model,{...input,optionSelections:{writing:'other-writing'}});
 assert.equal(selected.validation.academicCountsValid,true);assert.equal(chosen(selected).writing,'other-writing');assert.equal(chosen(selected).elective,'university-elective');
});
test('invalid personal choices remain visible blockers instead of being replaced by default choices',()=>{
 const plan=Planner.generate(fixture(),{...input,optionSelections:{writing:'removed-course'}});
 assert(plan.setupIssues.some(issue=>issue.code==='invalid_selection'&&issue.requirementId==='writing'));
});
test('another degree, edition, source, credit quantity or unusable option cannot supply starting defaults',()=>{
 for(const edit of [review=>review.modelId='different-degree',review=>review.catalogYear='2025-2026',review=>review.format='Residential',review=>review.creditSystem='competency-unit',review=>review.totalCredits=120,review=>review.sourceIds=['missing'],review=>review.optionSelections.writing='not-a-course']){
  const model=fixture();edit(model.reviewedBaselineChoices);const control=copy(model);delete control.reviewedBaselineChoices;
  assert.deepEqual(chosen(Planner.generate(model,input)),chosen(Planner.generate(control,input)));
 }
});

test('a reviewed university starter cannot hide an eligible published transfer improvement',()=>{
 const model=fixture();model.reviewedBaselineChoices.optionSelections.writing='university-writing';
 const settings={...input,allowConditional:false},before=JSON.stringify([model,settings]);
 const starter=Planner.generate(model,{...settings,optionSelections:model.reviewedBaselineChoices.optionSelections});
 assert.equal(starter.validation.academicCountsValid,true);assert.equal(starter.totals.external,3);
 const improved=Planner.generate(model,settings);
 assert.equal(improved.validation.academicCountsValid,true);assert.equal(improved.totals.external,6);assert.equal(improved.totals.institutional,3);assert.equal(improved.rows.find(row=>row.requirementId==='writing').option.provider,'Sophia');
 assert.equal(improved.optimization.optimalityProven,true);assert.equal(improved.optimization.budgetExhausted,false);assert(improved.optimization.statesVisited>0,'Optimality is established using the available menus, not the pinned starter');
 assert.equal(JSON.stringify([model,settings]),before);
});

test('a cheaper published provider can replace the reviewed starter without losing transfer credit',()=>{
 const model=fixture();for(const requirement of model.requirements)for(const option of requirement.options)if(option.id.startsWith('reviewed-'))option.provider='Study.com';
 const settings={...input,providers:['Sophia','Study.com'],allowConditional:false,priority:'cost',universityRate:100};
 const starter=Planner.generate(model,{...settings,optionSelections:model.reviewedBaselineChoices.optionSelections}),improved=Planner.generate(model,settings);
 assert.equal(starter.validation.academicCountsValid,true);assert.equal(starter.costs.knownSubtotal,535);
 assert.equal(improved.validation.academicCountsValid,true);assert.equal(improved.totals.external,starter.totals.external);assert.equal(improved.costs.knownSubtotal,399);
 assert(improved.rows.filter(row=>row.option.provider!=='University').every(row=>row.option.provider==='Sophia'));
 assert.equal(improved.optimization.optimalityProven,true);
});

test('a valid reviewed starter survives a zero search budget without a false optimality claim',()=>{
 const model=fixture(),settings={...input,optimizationNodeBudget:0},before=JSON.stringify([model,settings]);
 const plan=Planner.generate(model,settings);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(chosen(plan).writing,'reviewed-writing');assert.equal(chosen(plan).elective,'reviewed-elective');assert.equal(plan.totals.external,6);
 assert.equal(plan.optimization.status,'best-found');assert.equal(plan.optimization.optimalityProven,false);assert.equal(plan.optimization.budgetExhausted,true);assert.equal(plan.optimization.statesVisited,0);
 assert.equal(JSON.stringify([model,settings]),before);
});

test('explicit university choices and existing university records remain protected when transfer alternatives exist',()=>{
 const model=fixture(),selected=Planner.generate(model,{...input,optionSelections:{writing:'university-writing'}});
 assert.equal(selected.validation.academicCountsValid,true);assert.equal(chosen(selected).writing,'university-writing');assert.equal(selected.totals.external,3);
 for(const status of ['reported','confirmed']){
  const record={requirementId:'writing',optionId:'university-writing',provider:'University',sourceProvider:'University',code:'WRITING',credits:3,creditSystem:'semester',status},before=JSON.stringify(record);
  const plan=Planner.generate(model,{...input,completed:[record]});
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(chosen(plan).writing,'university-writing');assert.equal(plan.rows.find(row=>row.requirementId==='writing').status,status);assert.equal(plan.totals.external,3);assert.equal(JSON.stringify(record),before);
 }
});

test('improvement can reallocate one original source across two requirements without double counting it',()=>{
 const model=fixture(),shared={...model.requirements[0].options.find(option=>option.id==='other-writing'),id:'shared-elective',receivingCode:'ELE101'};
 model.requirements[2].options=[shared,model.requirements[2].options.find(option=>option.provider==='University')];
 model.reviewedBaselineChoices.optionSelections={writing:'other-writing',elective:'university-elective'};
 const starter=Planner.generate(model,{...input,optionSelections:model.reviewedBaselineChoices.optionSelections}),improved=Planner.generate(model,input);
 assert.equal(starter.validation.academicCountsValid,true);assert.equal(starter.totals.external,3);
 assert.equal(improved.validation.academicCountsValid,true);assert.equal(improved.totals.external,6);assert.equal(chosen(improved).writing,'reviewed-writing');assert.equal(chosen(improved).elective,'shared-elective');
 const outside=improved.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+':'+row.option.code)).size,outside.length);assert.equal(improved.optimization.optimalityProven,true);
});

test('a faster unnamed placeholder cannot replace an executable reviewed course',()=>{
 const model=fixture();model.requirements[0].options.find(option=>option.provider==='University').selectionRequired=true;
 const plan=Planner.generate(model,{...input,priority:'speed',timing:{externalWeeks:{Sophia:10},externalConcurrency:1,universityTermWeeks:1,universityCreditsPerTerm:9}});
 assert.equal(plan.validation.valid,true);assert.equal(plan.readiness,'review-ready');assert(plan.rows.every(row=>!row.selectionRequired));assert.equal(plan.rows.find(row=>row.requirementId==='writing').option.provider,'Sophia');
 const explicit=Planner.generate(model,{...input,optionSelections:{writing:'university-writing'}});assert.equal(chosen(explicit).writing,'university-writing');assert(explicit.blockers.some(blocker=>blocker.code==='selection_required'),'A deliberate incomplete student choice remains visible');
});

test('a faster named fallback with unresolved course research cannot displace a source-complete starter',()=>{
 const model=fixture();model.unresolved=[{scope:'selected-options',optionIds:['university-writing'],sourceIds:['review'],message:'The exact prerequisite policy for this university course still needs review.'}];
 const plan=Planner.generate(model,{...input,priority:'speed',timing:{externalWeeks:{Sophia:10},externalConcurrency:1,universityTermWeeks:1,universityCreditsPerTerm:9}});
 assert.equal(plan.validation.valid,true);assert.equal(plan.readiness,'review-ready');assert.equal(plan.rows.find(row=>row.requirementId==='writing').option.provider,'Sophia');assert.equal(plan.blockers.length,0);
 const explicit=Planner.generate(model,{...input,optionSelections:{writing:'university-writing'}});assert.equal(chosen(explicit).writing,'university-writing');assert(explicit.blockers.some(blocker=>blocker.code==='program_research'),'Explicit unresolved choices retain their source-review blocker');
});

test('receipt-derived suggestions seed a tie but remain optimizable and never become student locks',()=>{
 const model=fixture(),suggestedChoices=copy(model.reviewedBaselineChoices);delete model.reviewedBaselineChoices;
 const seeded=Planner.generate(model,{...input,suggestedChoices});assert.equal(chosen(seeded).writing,'reviewed-writing');assert.equal(chosen(seeded).elective,'reviewed-elective');
 suggestedChoices.optionSelections.writing='university-writing';const before=JSON.stringify(suggestedChoices),improved=Planner.generate(model,{...input,suggestedChoices});
 assert.equal(improved.validation.valid,true);assert.equal(improved.totals.external,6);assert.equal(improved.rows.find(row=>row.requirementId==='writing').option.provider,'Sophia');assert.equal(JSON.stringify(suggestedChoices),before);
 const explicit=Planner.generate(model,{...input,suggestedChoices,optionSelections:{writing:'university-writing'}});assert.equal(chosen(explicit).writing,'university-writing');assert.equal(explicit.totals.external,3);
});

test('stale or malformed suggested starters cannot create locks, setup errors, or another catalog identity',()=>{
 const model=fixture(),suggested=copy(model.reviewedBaselineChoices);delete model.reviewedBaselineChoices;const control=chosen(Planner.generate(model,input));
 for(const edit of [hint=>hint.modelId='another-degree',hint=>hint.catalogYear='2025-2026',hint=>hint.format='Residential',hint=>hint.sourceIds=['unretained-source'],hint=>hint.totalCredits=120,hint=>hint.optionSelections.writing='removed-course']){const hint=copy(suggested);edit(hint);const plan=Planner.generate(model,{...input,suggestedChoices:hint});assert.deepEqual(chosen(plan),control);assert.equal(plan.setupIssues.length,0);}
});
