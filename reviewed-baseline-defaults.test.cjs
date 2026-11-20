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
