const test=require('node:test'),assert=require('node:assert/strict');
const Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js'),Journey=require('./dist/journey-engine.js'),View=require('./dist/course-plan-view.js');
const {worksheet}=require('./test-support/student-flow-harness.cjs');
const catalog=require('./dist/data/pathways.json'),liberty=require('./dist/data/liberty.json'),tesu=require('./dist/data/tesu.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(program=liberty){
 const route=catalog.pathways.find(item=>item.modelId===program.id),state=Sheet.selectPathway(Sheet.initialize(null,null,catalog),route);
 state.profile.modality=route.modalities[0];state.profile.hasPrior='none';state.sheet.notes={[program.id]:{'private-note':'Keep my note'}};
 return {state,catalog,models:[program],program};
}
function source(overrides={}){return {id:'original-course',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-10-10',grade:'A',privateNote:'Original private source note',evaluations:[{programId:liberty.id,requirementId:'engl-101',optionId:'sophia-soph-0015',status:'reported'}],...overrides};}
function entry(ui,id){return ui.draft().plan.rows.find(row=>row.requirementId===id);}

test('an explicit correction keeps the original source and private data while retracting completion facts',()=>{
 const f=setup(),record=source({codeAliases:['ENG1001'],identitySourceIds:['identity-proof'],sourceUrl:'https://provider.example/course'});f.state.learning=[record,source({id:'other',code:'OTHER',evaluations:[]})];
 const before=clone(f.state),corrected=Sheet.correctProgress(f.state,record.id,'in-progress');
 assert.deepEqual(f.state,before);assert.equal(corrected.learning[0].id,record.id);assert.equal(corrected.learning[0].status,'in-progress');assert.equal(corrected.learning[0].completedOn,'');assert.deepEqual(corrected.learning[0].evaluations,[]);
 for(const key of ['provider','code','title','credits','creditSystem','grade','privateNote','codeAliases','identitySourceIds','sourceUrl'])assert.deepEqual(corrected.learning[0][key],record[key],key);
 assert.deepEqual(corrected.learning[1],before.learning[1]);assert.deepEqual(corrected.sheet,before.sheet);assert.deepEqual(corrected.scenarios,before.scenarios);
 const planned=Sheet.correctProgress(corrected,record.id,'planned');assert.equal(planned.learning[0].status,'planned');assert.equal(planned.learning.length,2);assert.deepEqual(Guide.matchInventory(liberty,[planned.learning[0]]).completed,[]);
});

test('correction requires acknowledgment for school-confirmed placements in any degree',()=>{
 const f=setup(),record=source({evaluations:[...source().evaluations,{programId:'another-school-degree',requirementId:'other-writing',status:'confirmed'}]});f.state.learning=[record];const before=clone(f.state);
 assert.throws(()=>Sheet.correctProgress(f.state,record.id,'planned'),error=>error.code==='confirmation_required');assert.deepEqual(f.state,before);
 const corrected=Sheet.correctProgress(f.state,record.id,'planned',{confirmation:true,expectedRecord:JSON.stringify(record)});
 assert.equal(corrected.learning[0].status,'planned');assert.deepEqual(corrected.learning[0].evaluations,[]);assert.equal(corrected.learning[0].credits,3);assert.equal(corrected.learning[0].privateNote,record.privateNote);
});

test('stale and ambiguous source corrections fail without changing records or creating an award',()=>{
 const f=setup();f.state.learning=[source()];const before=clone(f.state);
 assert.throws(()=>Sheet.correctProgress(f.state,'missing','planned'));
 assert.throws(()=>Sheet.correctProgress(f.state,'original-course','completed'));
 assert.throws(()=>Sheet.correctProgress(f.state,'original-course','in-progress',{expectedRecord:'older snapshot'}));
 assert.throws(()=>Sheet.correctProgress({...f.state,learning:[source(),source()]},'original-course','planned'));
 assert.deepEqual(f.state,before);
 const unknown=source({credits:null,creditSystem:null});const retracted=Sheet.correctProgress({...f.state,learning:[unknown]},unknown.id,'planned');
 assert.equal(retracted.learning[0].credits,null);assert.equal(retracted.learning[0].creditSystem,null);assert.deepEqual(retracted.learning[0].evaluations,[]);
});

test('a completed exam is corrected as one source across its whole reviewed bundle',()=>{
 const f=setup(tesu),req=id=>tesu.requirements.find(row=>row.id===id),option=(id,choice)=>req(id).options.find(row=>row.id===choice);
 const finished=Sheet.recordProgress(f.state,tesu,req('enc1010'),option('enc1010','clep-composition-enc1010'),'completed');
 assert.equal(finished.learning.length,1);assert.equal(finished.learning[0].credits,6);assert.equal(finished.learning[0].evaluations.length,2);
 const corrected=Sheet.correctProgress(finished,finished.learning[0].id,'in-progress');
 assert.equal(corrected.learning.length,1);assert.equal(corrected.learning[0].credits,6);assert.equal(corrected.learning[0].status,'in-progress');assert.deepEqual(corrected.learning[0].evaluations,[]);assert.deepEqual(Guide.matchInventory(tesu,corrected.learning).completed,[]);
 assert.throws(()=>Sheet.recordProgress(finished,tesu,req('enc1010'),option('enc1010','clep-composition-enc1010'),'in-progress'),/completed|earned/i,'The old unacknowledged downgrade guard remains.');
});

test('the actual worksheet keeps Finished editable and supports Finished to Taking to Not started to Finished across reloads',async()=>{
 const f=setup(),ui=worksheet(f.state,{catalog:f.catalog,models:f.models}),id='engl-101';
 await ui.progress(id,'completed');const original=ui.state().learning[0];assert.equal(entry(ui,id).status,'reported');assert.equal(View.build(ui.draft()).progress.completedCredits,3);
 let grid=ui.grid();assert.match(grid,new RegExp('data-progress="'+id+'"'));assert.match(ui.row(id).html,/<option value="completed" selected>Finished/);
 await ui.progress(id,'in-progress');assert.equal(ui.state().learning[0].id,original.id);assert.equal(ui.state().learning[0].status,'in-progress');assert.deepEqual(ui.state().learning[0].evaluations,[]);assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(View.build(ui.draft()).progress.inProgressCredits,3);
 assert.equal(entry(ui,id).option.id,'sophia-soph-0015');assert.equal(ui.state().sheet.notes[liberty.id]['private-note'],'Keep my note');
 const reloaded=worksheet(ui.saved(),{catalog:f.catalog,models:f.models});assert.equal(View.build(reloaded.draft()).progress.inProgressCredits,3);assert.match(reloaded.row(id).html,/<option value="in-progress" selected>/);
 await reloaded.progress(id,'planned');assert.equal(reloaded.state().learning[0].id,original.id);assert.equal(reloaded.state().learning[0].status,'planned');assert.equal(View.build(reloaded.draft()).progress.inProgressCredits,0);assert.equal(View.build(reloaded.draft()).progress.completedCredits,0);
 await reloaded.progress(id,'completed');assert.equal(reloaded.state().learning.length,1);assert.equal(reloaded.state().learning[0].id,original.id);assert.equal(View.build(reloaded.draft()).progress.completedCredits,3);assert.equal(reloaded.state().learning[0].evaluations[0].status,'reported');
});

test('a correction leaves the Finished filter so the changed course remains visible',async()=>{
 const f=setup(),ui=worksheet(f.state,{catalog:f.catalog,models:f.models}),id='engl-101';await ui.progress(id,'completed');await ui.click({progressFilter:'completed'});assert(!ui.grid().includes('data-requirement="engl-102"'));
 await ui.progress(id,'planned');const grid=ui.grid();assert(grid.includes('data-requirement="'+id+'"'));assert(grid.includes('data-requirement="engl-102"'));assert.match(grid,new RegExp('data-requirement="'+id+'"[^>]*data-course-progress="not-started"'));
});

test('changing one finished CLEP component in the worksheet reverses the one shared exam record',async()=>{
 const f=setup(tesu),req=tesu.requirements.find(row=>row.id==='enc1010'),option=req.options.find(option=>option.id==='clep-composition-enc1010');
 const state=Sheet.recordProgress(f.state,tesu,req,option,'completed'),ui=worksheet(state,{catalog:f.catalog,models:f.models}),id=state.learning[0].id;
 assert.equal(View.build(ui.draft()).progress.completedCredits,6);assert.match(ui.grid(),/data-progress="enc1010"/);
 await ui.progress('enc1010','in-progress');assert.equal(ui.state().learning.length,1);assert.equal(ui.state().learning[0].id,id);assert.equal(ui.state().learning[0].credits,6);assert.deepEqual(ui.state().learning[0].evaluations,[]);assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(View.build(ui.draft()).progress.inProgressCredits,6);
 await ui.progress('enc1020','planned');assert.equal(ui.state().learning[0].id,id);assert.equal(View.build(ui.draft()).progress.inProgressCredits,0);
 await ui.progress('enc1010','completed');assert.equal(ui.state().learning.length,1);assert.equal(ui.state().learning[0].id,id);assert.equal(ui.state().learning[0].evaluations.length,2);assert.equal(View.build(ui.draft()).progress.completedCredits,6);
});

test('an imported course without a curated option can be corrected without deleting its source facts',async()=>{
 const f=setup(),record=source({provider:'Original College',institution:'Original College',code:'WRIT101',title:'My original college writing course',evaluations:[{programId:liberty.id,requirementId:'engl-101',status:'reported'}]});f.state.learning=[record];
 const ui=worksheet(f.state,{catalog:f.catalog,models:f.models});assert.equal(entry(ui,'engl-101').status,'reported');assert.match(ui.row('engl-101').html,/data-progress="engl-101"/);
 await ui.progress('engl-101','planned');const corrected=ui.state().learning[0];assert.equal(corrected.id,record.id);assert.equal(corrected.provider,record.provider);assert.equal(corrected.code,record.code);assert.equal(corrected.credits,record.credits);assert.equal(corrected.privateNote,record.privateNote);assert.equal(corrected.status,'planned');assert.deepEqual(corrected.evaluations,[]);assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(ui.state().sheet.notes[liberty.id]['private-note'],'Keep my note');
});

test('a common provider alias still shows the corrected In progress state rather than a false Not started selector',async()=>{
 const f=setup();f.state.learning=[source({provider:'Sophia Learning',code:'SOPH0015'})];const ui=worksheet(f.state,{catalog:f.catalog,models:f.models});
 assert.equal(entry(ui,'engl-101').status,'reported');await ui.progress('engl-101','in-progress');assert.equal(ui.state().learning[0].provider,'Sophia Learning');assert.equal(ui.state().learning[0].code,'SOPH0015');assert.match(ui.row('engl-101').html,/<option value="in-progress" selected>/);assert.equal(View.build(ui.draft()).progress.inProgressCredits,3);
});

test('school-confirmed corrections are reviewable, cancellable and never applied without acknowledgment',async()=>{
 const f=setup(),req=liberty.requirements.find(row=>row.id==='engl-101'),option=req.options.find(option=>option.id==='sophia-soph-0015');
 let state=Sheet.recordProgress(f.state,liberty,req,option,'completed');const record=state.learning[0];state=Sheet.updateLearning(state,record,{confirmation:true,confirmCurrentProgram:{programId:liberty.id,requirementId:req.id,optionId:option.id}});
 const ui=worksheet(state,{catalog:f.catalog,models:f.models}),before=ui.state();assert.equal(entry(ui,req.id).status,'confirmed');assert.match(ui.row(req.id).html,/data-progress="engl-101"/);
 await ui.progress(req.id,'in-progress');assert(ui.dialogOpen());assert.match(ui.dialog().html,/sheet-progress-correction-form/);assert.deepEqual(ui.state(),before);
 assert.match(await ui.submitProgressCorrection(false),/Confirm the course correction/);assert.deepEqual(ui.state(),before);
 await ui.click({cancelProgressCorrection:''});assert.equal(ui.dialogOpen(),false);assert.deepEqual(ui.state(),before);
 await ui.progress(req.id,'in-progress');await ui.submitProgressCorrection();assert.equal(ui.state().learning[0].status,'in-progress');assert.deepEqual(ui.state().learning[0].evaluations,[]);assert.equal(View.build(ui.draft()).progress.confirmedCredits,0);assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(View.build(ui.draft()).progress.inProgressCredits,3);
});

test('source corrections preserve an explicit alternative course choice instead of overwriting it',async()=>{
 const f=setup(),req=liberty.requirements.find(row=>row.id==='engl-101'),outside=req.options.find(option=>option.id==='sophia-soph-0015'),university=req.options.find(option=>option.provider==='University');
 let state=Sheet.recordProgress(f.state,liberty,req,outside,'completed');state=Sheet.setCourse(state,liberty.id,req.id,university.id);const ui=worksheet(state,{catalog:f.catalog,models:f.models});
 await ui.progress(req.id,'in-progress');assert.equal(ui.state().scenarios[liberty.id].optionSelections[req.id],university.id);assert.equal(ui.state().learning[0].status,'in-progress');assert.equal(ui.state().learning[0].credits,3);
});

test('university coursework remains the same original course when its Finished status is corrected',async()=>{
 const f=setup(),ui=worksheet(f.state,{catalog:f.catalog,models:f.models}),id='busi-490';await ui.progress(id,'completed');const record=ui.state().learning[0];assert.equal(record.provider,'University');assert.equal(record.institution,liberty.school);assert.equal(record.sourceProgramId,liberty.id);
 await ui.progress(id,'planned');const corrected=ui.state().learning[0];assert.equal(corrected.id,record.id);assert.equal(corrected.credits,record.credits);assert.equal(corrected.institution,record.institution);assert.equal(corrected.sourceProgramId,record.sourceProgramId);assert.equal(corrected.status,'planned');assert.equal(View.build(ui.draft()).progress.completedCredits,0);
});

test('GCU three-credit content matches and real one-credit balance courses remain exact when completion is corrected',async()=>{
 const {buildGCUCampusBSBA}=await import('./scripts/import-gcu-curriculum.mjs'),{addGCUTransferOptions}=await import('./scripts/add-gcu-transfer-options.mjs');
 const model=addGCUTransferOptions(buildGCUCampusBSBA().models[0],require('./content/research/gcu-sophia-review-2026-11-19.json'));
 const route={id:model.id,modelId:model.id,title:model.title,school:model.school,modalities:['campus'],level:'bachelor',degreeCredits:120},catalog={pathways:[route]};
 let state=Sheet.selectPathway(Sheet.initialize(null,null,catalog),route);state.profile.modality='campus';state.scenarios[model.id]={...Sheet.scenario(state,model.id),providers:['Sophia'],optionSelections:Object.fromEntries(model.degreeCreditBalancePolicy.equivalencies.map(binding=>[binding.requirementId,binding.requirementId==='bus352'?binding.options[0].optionId:'university-'+binding.requirementId]))};
 const data={catalog,models:[model]},ui=worksheet(state,data);await ui.progress('bus352','completed');assert.equal(ui.state().learning[0].credits,3);assert.equal(View.build(ui.draft()).progress.completedCredits,3);
 await ui.progress('bus352','in-progress');assert.equal(ui.state().learning[0].credits,3);assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(View.build(ui.draft()).progress.inProgressCredits,3);assert.equal(entry(ui,'bus352').credits,3);assert.equal(ui.draft().plan.totals.accounted,120);
 const extra=ui.draft().plan.rows.find(row=>row.creditBalanceDerived&&row.option);assert.equal(extra.credits,1);await ui.progress(extra.requirementId,'completed');const university=ui.state().learning.find(record=>record.provider==='University');assert.equal(university.credits,1);
 await ui.progress(extra.requirementId,'planned');assert.equal(ui.state().learning.find(record=>record.id===university.id).credits,1);assert.equal(ui.state().learning.find(record=>record.id===university.id).status,'planned');assert.equal(View.build(ui.draft()).progress.completedCredits,0);assert.equal(ui.draft().plan.validation.academicCountsValid,true);assert.equal(ui.draft().plan.totals.accounted,120);assert(!Object.prototype.hasOwnProperty.call(ui.state().scenarios[model.id].optionSelections,extra.requirementId),'Derived balance work stays automatic.');
});
