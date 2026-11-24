/* Actual GCU overlay and worksheet closures. No student storage or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Planner=require('./dist/planner.js'),View=require('./dist/course-plan-view.js'),Momentum=require('./dist/student-progress.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const input={priority:'transfer',providers:['Sophia'],providerMonths:{Sophia:1},universityRate:0,fees:0};
let modelPromise;
async function model(){
 if(!modelPromise)modelPromise=import('./scripts/add-gcu-transfer-options.mjs').then(({addGCUTransferOptions})=>addGCUTransferOptions(require('./content/curricula/gcu-bsba-campus.json').models[0],require('./content/research/gcu-sophia-review-2026-11-19.json')));
 return clone(await modelPromise);
}
async function fixture(ids=['bus352']){
 const program=await model(),optionSelections=Object.fromEntries(program.degreeCreditBalancePolicy.equivalencies.map(binding=>[binding.requirementId,ids.includes(binding.requirementId)?binding.options[0].optionId:'university-'+binding.requirementId]));
 const plan=Planner.generate(program,{...input,optionSelections});assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.blockers));
 return {program,plan,input:{...input,optionSelections},state:{profile:{school:program.school,degree:program.title},sheet:{isExample:false,search:'',filter:'all',notes:{}},learning:[]},match:{completed:[]},pathway:{id:program.id,school:program.school,title:program.title,modalities:['campus']}};
}
const row=(draft,id)=>draft.plan.rows.find(item=>item.requirementId===id);
const entries=view=>Object.values(view.groups).flat();
const leaves=node=>node.children?.length?node.children.flatMap(leaves):[node];
function worksheet(draft,{editor=false}={}){
 const nodes=new Map(),downloads=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{id,hidden:false,open:false,innerHTML:'',textContent:'',dataset:{},scrollLeft:0,scrollTop:0,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){}});return nodes.get(id);}
 class DownloadURL extends URL{static createObjectURL(blob){downloads.push(blob.parts.join(''));return 'blob:degree-test';}static revokeObjectURL(){}}
 const context={URL:DownloadURL,URLSearchParams,Intl,JSON,Math,Date,console,Blob:class{constructor(parts){this.parts=parts;}},document:{body:node('body'),activeElement:null,getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},createElement(){return{click(){}};}},location:{search:editor?'?editor=1':'',assign(){},replace(){}},localStorage:{getItem(){return null;},setItem(){throw Error('Rendering must not save records');}},setTimeout(){return 1;},clearTimeout(){},addEventListener(){},DegreeSheet:Sheet,DegreePlanner:Planner,DegreeCoursePlanView:View,DegreeJourney:Journey,__fixture:clone(draft)};context.window=context;
 const source=fs.readFileSync('./dist/sheet.js','utf8'),boundary=source.lastIndexOf('  boot();');assert(boundary>0);
 const hooks=`state=__fixture.state;program=__fixture.program;plan=__fixture.plan;pathway=__fixture.pathway;match=__fixture.match;input=__fixture.input;catalog={pathways:[]};guidance={};courseView=projection();
 openDialog=function(html,label){window.__dialog={html,label};};
 window.__test={grid:renderGrid,row:rowDialog,checks:checksDialog,next:nextDialog,action:handleAction};}());`;
 vm.runInNewContext(source.slice(0,boundary)+hooks,context,{filename:'sheet.js'});
 return {node,downloads,grid(){context.__test.grid();return node('sheet-grid').innerHTML;},row(id){context.__test.row(id);return context.__dialog?.html||'';},checks(){context.__test.checks();return context.__dialog.html;},next(){context.__test.next();return context.__dialog.html;},csv(){context.__test.action('csv');return downloads.at(-1);}};
}

test('native GCU stays at zero finished and 120 planned credits, without three unused balance courses in any section',async()=>{
 const draft=await fixture([]),before=JSON.stringify(draft);freeze(draft);const view=View.build(draft);
 assert.equal(view.progress.valid,true);assert.equal(view.progress.totalCredits,120);assert.equal(view.progress.completedCredits,0);assert.equal(view.progress.inProgressCredits,0);assert.equal(view.progress.remainingCredits,120);assert.equal(view.totals.accounted,120);assert.equal(view.totals.unmapped,0);assert.equal(entries(view).length,30);assert.equal(View.visibleRows(draft).length,30);assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),120);assert.deepEqual(view.curriculumIssues,[]);
 for(const id of draft.program.degreeCreditBalancePolicy.balanceRequirementIds){assert(!entries(view).some(entry=>entry.requirementIds.includes(id)));assert(!view.sections.flatMap(leaves).some(section=>section.requirementIds.includes(id)));}
 assert.equal(Momentum.summarize(draft.state,draft).allocationValid,true);assert.equal(JSON.stringify(draft),before);
});
test('real three-credit content and one real balance credit stay separate while section and subsection totals use actual 120',async()=>{
 const draft=await fixture(),before=JSON.stringify(draft);freeze(draft);const view=View.build(draft),transfer=entries(view).find(entry=>entry.requirementId==='bus352'),extra=entries(view).filter(entry=>entry.creditBalanceDerived);
 assert.equal(draft.program.requirements.find(req=>req.id==='bus352').credits,4);assert.equal(transfer.credits,3);assert.equal(transfer.sourceCredits,3);assert.equal(transfer.nativeRequirementCredits,4);assert.deepEqual(extra.map(entry=>[entry.code,entry.credits,entry.nativeRequirementCredits]),[['LDR-461',1,0]]);assert.equal(view.totals.accounted,120);assert.equal(view.progress.valid,true);assert.equal(view.sections.find(section=>section.id==='major').credits,63);assert.equal(view.sections.find(section=>section.id==='elective').credits,17);
 for(const section of view.sections){assert.equal(section.progress.valid,true);assert.equal(section.progress.totalCredits,section.credits);for(const leaf of leaves(section))assert.equal(leaf.progress.totalCredits,leaf.requirementCredits);}
 assert.equal(view.sections.flatMap(leaves).reduce((sum,section)=>sum+section.credits,0),120);assert.equal(View.visibleRows(draft).length,31);assert.equal(JSON.stringify(draft),before,'A presentation projection must not persist different degree requirements');
});
test('started, completed and confirmed external coursework counts three, never the native four; milestones keep school confirmation separate',async()=>{
 const draft=await fixture(),outside=row(draft,'bus352');draft.state.learning=[{id:'source-course',provider:outside.option.provider,code:outside.option.code,title:outside.option.title,credits:3,creditSystem:'semester',status:'in-progress'}];
 let view=View.build(draft);assert.equal(view.progress.inProgressCredits,3);assert.equal(view.progress.completedCredits,0);assert.equal(view.progress.remainingCredits,117);assert.equal(entries(view).find(entry=>entry.requirementId==='bus352').progressState,'in-progress');
 draft.state.learning[0].status='earned';outside.status='reported';view=View.build(draft);assert.equal(view.progress.completedCredits,3);assert.equal(view.progress.pendingReviewCredits,3);assert.equal(view.progress.confirmedCredits,0);let summary=Momentum.summarize(draft.state,draft);assert.equal(summary.allocationValid,true);assert.equal(summary.reportedTransferCredits,3);assert.equal(summary.confirmedTransferCredits,0);
 outside.status='confirmed';view=View.build(draft);summary=Momentum.summarize(draft.state,draft);assert.equal(view.progress.completedCredits,3);assert.equal(view.progress.confirmedCredits,3);assert.equal(view.progress.pendingReviewCredits,0);assert.equal(summary.confirmedTransferCredits,3);assert.equal(summary.reportedTransferCredits,0);assert.equal(row(draft,'bus352').option.sourceCredits,3);
 for(const field of ['totalCredits','completedCredits','inProgressCredits','confirmedCredits','pendingReviewCredits','remainingCredits'])assert.equal(view.sections.reduce((sum,section)=>sum+section.progress[field],0),view.progress[field],field);
});
test('a finished two-credit balance course counts in its elective section and a fully finished valid plan reaches exactly 120',async()=>{
 const draft=await fixture(['bus352','fin350']),extra=draft.plan.rows.find(item=>item.creditBalanceDerived&&item.option);assert.equal(extra.credits,2);draft.state.learning=[{id:'university-course',provider:'University',institution:draft.program.school,sourceProgramId:draft.program.id,code:extra.option.code,title:extra.option.title,credits:2,creditSystem:'semester',status:'in-progress'}];
 let view=View.build(draft);assert.equal(view.progress.inProgressCredits,2);assert.equal(view.sections.find(section=>section.id==='elective').progress.inProgressCredits,2);assert.equal(Momentum.summarize(draft.state,draft).confirmedTransferCredits,0);
 for(const item of View.visibleRows(draft))item.status='confirmed';draft.state.learning[0].status='earned';view=View.build(draft);assert.equal(view.progress.valid,true);assert.equal(view.progress.completedCredits,120);assert.equal(view.progress.completedPercent,100);assert.equal(view.progress.remainingCredits,0);assert.equal(Momentum.summarize(draft.state,draft).confirmedTransferCredits,6);assert.equal(view.sections.reduce((sum,section)=>sum+section.progress.completedCredits,0),120);
});
test('a forged row flag, incomplete ledger, changed credit quantity or broken evidence cannot enable actual-credit exceptions or hide rows',async()=>{
 const original=await fixture();
 for(const change of [draft=>{row(draft,'bus352').credits=4;row(draft,'bus352').option.credits=4;},draft=>{draft.plan.rows.find(item=>item.creditBalanceDerived).creditBalanceDerived=false;},draft=>{row(draft,'bus352').sourceIds=[];},draft=>{draft.plan.rows.push(clone(row(draft,'bus352')));},draft=>{draft.plan.rows=draft.plan.rows.filter(item=>item.requirementId!=='bus352');},draft=>{draft.program.degreeCreditBalancePolicy.sourceIds=['missing-policy'];}]){
  const draft=clone(original);change(draft);draft.plan.validation.academicCountsValid=true;const before=JSON.stringify(draft);assert.equal(View.progress(draft).valid,false);assert.equal(View.build(draft).progress.valid,false);assert.equal(Momentum.summarize(draft.state,draft).allocationValid,false);assert.equal(Momentum.summarize(draft.state,draft).confirmedTransferCredits,0);assert.equal(View.visibleRows(draft).length,draft.plan.rows.length,'Invalid ledgers must not silently hide conflicts');assert.equal(JSON.stringify(draft),before);
 }
 const unrelated={program:{id:'ordinary',totalCredits:3,requirements:[{id:'course',credits:3},{id:'zero',credits:0}]},plan:{programId:'ordinary',validation:{academicCountsValid:true},rows:[{requirementId:'course',credits:3,status:'planned',option:{provider:'University'}},{requirementId:'zero',credits:0,option:null,creditBalanceDerived:true}]}};assert.equal(View.visibleRows(unrelated).length,2,'An untrusted row marker is never a hiding instruction');
});
test('the actual course grid, detailed/printed worksheet, review drawer and CSV omit only inactive balance work',async()=>{
 const draft=await fixture(),active=draft.plan.rows.find(item=>item.creditBalanceDerived&&item.option),inactive=draft.plan.rows.filter(item=>item.creditBalanceDerived&&!item.option);
 for(const editor of [false,true]){
  const ui=worksheet(draft,{editor}),grid=ui.grid();for(const item of inactive)assert(!grid.includes('data-requirement="'+item.requirementId+'"'));assert(grid.includes('data-requirement="'+active.requirementId+'"'));assert(grid.includes('data-progress="'+active.requirementId+'"'));assert(!grid.includes('data-compare-row="'+active.requirementId+'"'));assert(!grid.includes('The GCU course is 4 credits'),'Keep quantity explanations in drawers');
  const extraDetails=ui.row(active.requirementId);assert.match(extraDetails,/adds 1 credit needed to reach the 120-credit degree minimum/);assert(!extraDetails.includes('Compare 0 course options'));const transferDetails=ui.row('bus352');assert.match(transferDetails,/adds 3 degree credits\. The GCU course is 4 credits/);
  const checks=ui.checks();for(const item of inactive)assert(!checks.includes('data-row="'+item.requirementId+'"'));const csv=ui.csv();for(const item of inactive)assert(!csv.includes(draft.program.requirements.find(req=>req.id===item.requirementId).title));assert(csv.includes(active.option.title));assert.equal(csv.trim().split('\r\n').length,32);assert(!ui.next().includes('Course selection required'));
 }
 const native=await fixture([]),ui=worksheet(native);assert.equal(ui.csv().trim().split('\r\n').length,31);for(const id of native.program.degreeCreditBalancePolicy.balanceRequirementIds)assert(!ui.grid().includes('data-requirement="'+id+'"'));
});
test('browser progress uses the same validated policy as CommonJS, and cannot apply it without the planner dependency',async()=>{
 const draft=await fixture(),source=fs.readFileSync('./dist/course-plan-view.js','utf8'),browser={DegreePlanner:Planner,URL};vm.runInNewContext(source,browser);assert.equal(browser.DegreeCoursePlanView.progress(draft).valid,true);assert.equal(browser.DegreeCoursePlanView.visibleRows(draft).length,31);const absent={URL};vm.runInNewContext(source,absent);assert.equal(absent.DegreeCoursePlanView.progress(draft).valid,false);assert.equal(absent.DegreeCoursePlanView.visibleRows(draft).length,33);
});
test('real worksheet progress controls save actual Sophia and Service Learning credits, then rebuild a complete 120-credit ledger',async()=>{
 const program=await model(),route={id:program.id,modelId:program.id,title:program.title,school:program.school,modalities:['campus'],level:'Bachelor',degreeCredits:120,catalog:'Fall 2026',schoolId:'gcu',field:'business'},catalog={pathways:[route]};
 let state=Sheet.selectPathway(Sheet.initialize(null,null,catalog),route);state.profile.modality='campus';state.profile.hasPrior='none';state.scenarios[program.id]={...Sheet.scenario(state,program.id),providers:['Sophia'],optionSelections:Object.fromEntries(program.degreeCreditBalancePolicy.equivalencies.map(binding=>[binding.requirementId,binding.requirementId==='bus352'?binding.options[0].optionId:'university-'+binding.requirementId]))};
 const ui=require('./test-support/student-flow-harness.cjs').worksheet(state,{catalog,models:[program]});
 await ui.progress('bus352','in-progress');assert.equal(ui.state().learning.length,1);assert.equal(ui.state().learning[0].credits,3);assert.equal(View.build(ui.draft()).progress.inProgressCredits,3);
 await ui.progress('bus352','completed');let draft=ui.draft();assert.equal(row(draft,'bus352').credits,3);assert.equal(row(draft,'bus352').status,'reported');assert.equal(row(draft,'bus352').nativeRequirementCredits,4);assert.equal(View.build(draft).progress.completedCredits,3);assert.equal(Momentum.summarize(draft.state,draft).reportedTransferCredits,3);
 const extra=draft.plan.rows.find(item=>item.creditBalanceDerived&&item.option);assert.equal(extra.credits,1);await ui.progress(extra.requirementId,'in-progress');assert.equal(ui.state().learning.find(record=>record.provider==='University').credits,1);assert.equal(View.build(ui.draft()).progress.inProgressCredits,1);
 await ui.progress(extra.requirementId,'completed');draft=ui.draft();assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.totals.accounted,120);assert.equal(row(draft,extra.requirementId).credits,1);assert.equal(row(draft,extra.requirementId).status,'reported');assert.equal(View.build(draft).progress.completedCredits,4);assert.equal(Momentum.summarize(draft.state,draft).reportedTransferCredits,3);assert.equal(Momentum.summarize(draft.state,draft).completedCourses,2);assert.equal(program.requirements.find(req=>req.id==='bus352').credits,4);
});
test('a selected three-credit ASU course preserves actual 26 outside and 94 GCU credits with correct mixed-source progress',async()=>{
 const {addGCUInstitutionalOptions}=await import('./scripts/add-gcu-institutional-options.mjs'),program=addGCUInstitutionalOptions(await model(),require('./content/research/gcu-institutional-maps-2026-11-19.json'));
 // Keep both source quantities in this rendering scenario even when the
 // automatic lower-cost route uses Sophia instead of the three-credit ASU choice.
 const selected=program.requirements.find(req=>req.id==='bit200').options.find(option=>option.provider==='ASU Universal Learner'&&option.code==='CIS105');assert(selected);
 const plan=Planner.generate(program,{...input,providers:['Sophia','ASU Universal Learner'],optionSelections:{bit200:selected.id}}),draft={program,plan,state:{learning:[]},match:{completed:[]}},before=JSON.stringify(program);let view=View.build(draft);
 assert.equal(row(draft,'bit200').option.id,selected.id);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.external,26);assert.equal(plan.totals.institutional,94);assert.equal(view.totals.transfer,26);assert.equal(view.totals.accounted,120);assert.equal(view.progress.valid,true);assert.equal(view.totals.unmapped,0);assert.equal(view.progress.completedCredits,0);assert.equal(view.progress.remainingCredits,120);assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),120);assert.equal(view.sections.flatMap(leaves).reduce((sum,section)=>sum+section.credits,0),120);
 const asu=plan.rows.filter(item=>item.option?.provider==='ASU Universal Learner');for(const credits of [3,4]){const course=asu.find(item=>item.credits===credits);assert(course);draft.state.learning.push({id:'asu-'+credits,provider:course.option.provider,code:course.option.code,title:course.option.title,credits,creditSystem:'semester',status:'in-progress'});}
 view=View.build(draft);assert.equal(view.progress.inProgressCredits,7);assert.equal(view.progress.remainingCredits,113);assert.equal(view.sections.reduce((sum,section)=>sum+section.progress.inProgressCredits,0),7);assert.equal(JSON.stringify(program),before);assert.equal(program.requirements.reduce((sum,req)=>sum+req.credits,0),120);
});
