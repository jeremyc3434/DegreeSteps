const test=require('node:test'),assert=require('node:assert/strict');
const Sheet=require('./dist/sheet-state.js'),View=require('./dist/course-plan-view.js'),Journey=require('./dist/journey-engine.js'),Comparison=require('./dist/plan-comparison-engine.js');
const base=require('./dist/data/liberty.json'),catalog=require('./dist/data/pathways.json'),costs=require('./dist/data/cost-comparisons.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(unknown=true){
 const model=clone(base),requirement=model.requirements.find(row=>row.id==='engl-101'),option=requirement.options.find(row=>row.provider==='Sophia');
 if(unknown){option.sourceCreditStatus='unknown';delete option.sourceCredits;delete option.sourceCreditSystem;}
 const route=catalog.pathways.find(row=>row.modelId===model.id);
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 state=Sheet.setCourse(state,model.id,requirement.id,option.id);
 return{model,requirement,option,state};
}
function original(option,changes={}){return{id:'original-source',provider:option.provider,code:option.code,title:option.title,credits:6,creditSystem:'semester',status:'planned',evaluations:[],...changes};}
function projection(f){return View.build(Journey.buildDraft(f.state,catalog,[f.model])).groups.transfer.find(row=>row.requirementId===f.requirement.id);}
function comparison(f,candidate){return Comparison.build(f.state,catalog,[f.model],costs,{selectedIds:['current'],includeOtherFormats:true,deferMatrix:true,...(candidate?{candidate}: {})});}
test('a receiving-only proposal retains its degree credits without inventing original source credits',()=>{
 const f=fixture(),before=JSON.stringify(f),entry=projection(f);
 assert(entry);assert.equal(entry.credits,3);assert.equal(entry.sourceCredits,null);assert.equal(entry.progressState,'not-started');assert.equal(JSON.stringify(f),before);
 f.option.sourceCredits=4;assert.equal(projection(f).sourceCredits,null);f.option.sourceCreditSystem='quarter';assert.equal(projection(f).sourceCredits,4);
});
test('a known original record supplies progress and keeps its original quantity separate from the award',()=>{
 const f=fixture();f.state.learning=[original(f.option,{status:'in-progress'})];
 let entry=projection(f);assert.equal(entry.sourceCredits,6);assert.equal(entry.credits,3);assert.equal(entry.progressState,'in-progress');
 const before=JSON.stringify(f.state),next=Sheet.recordProgress(f.state,f.model,f.requirement,f.option,'completed');
 assert.equal(JSON.stringify(f.state),before);assert.equal(next.learning.length,1);assert.equal(next.learning[0].credits,6);assert.equal(next.learning[0].creditSystem,'semester');assert.equal(next.learning[0].status,'earned');assert.equal(next.learning[0].evaluations[0].status,'reported');
 const completed=View.build(Journey.buildDraft(next,catalog,[f.model])).groups.completed.find(row=>row.requirementId===f.requirement.id);assert.equal(completed.sourceCredits,6);assert.equal(completed.credits,3);
});
test('progress requires actual source facts and rejects missing facts before mutating state',()=>{
 for(const record of [null,{credits:null},{creditSystem:null},{credits:0}])for(const progress of ['in-progress','completed','confirmed']){
  const f=fixture();if(record)f.state.learning=[original(f.option,record)];const before=JSON.stringify(f.state);
  assert.throws(()=>Sheet.recordProgress(f.state,f.model,f.requirement,f.option,progress,{confirmation:true}),/My courses/);assert.equal(JSON.stringify(f.state),before);
 }
});
test('a known original source can be started and explicitly confirmed without overwriting its credits',()=>{
 const f=fixture();f.state.learning=[original(f.option)];
 const started=Sheet.recordProgress(f.state,f.model,f.requirement,f.option,'in-progress');assert.equal(started.learning[0].credits,6);assert.equal(started.learning[0].status,'in-progress');
 const finished=Sheet.recordProgress(started,f.model,f.requirement,f.option,'completed');
 assert.throws(()=>Sheet.recordProgress(finished,f.model,f.requirement,f.option,'confirmed'),/explicit confirmation/);
 const confirmed=Sheet.recordProgress(finished,f.model,f.requirement,f.option,'confirmed',{confirmation:true});assert.equal(confirmed.learning[0].credits,6);assert.equal(confirmed.learning[0].evaluations[0].status,'confirmed');
});
test('comparison proposals and receiving-derived candidates keep unknown source quantities and units',()=>{
 const f=fixture();let view=comparison(f),course=view.courses.find(row=>row.provider===f.option.provider&&row.code===f.option.code);
 assert(course);assert.equal(course.credits,null);assert.equal(course.creditSystem,null);assert.equal(course.origin,'plan-choice');
 const candidate={provider:f.option.provider,code:f.option.code,title:f.option.title,credits:3,creditSystem:'semester',creditBasis:'curated-course-map'};
 view=comparison(f,candidate);course=view.courses.find(row=>row.provider===f.option.provider&&row.code===f.option.code);assert.equal(course.credits,null);assert.equal(course.creditSystem,null);assert.equal(f.state.learning.length,0);
});
test('comparison accepts independently known source facts and preserves the student library record',()=>{
 const f=fixture(),candidate={provider:f.option.provider,code:f.option.code,title:f.option.title,credits:6,creditSystem:'quarter',creditBasis:'provider-directory'};
 let view=comparison(f,candidate),course=view.courses.find(row=>row.provider===f.option.provider&&row.code===f.option.code);assert.equal(course.credits,6);assert.equal(course.creditSystem,'quarter');
 f.state.learning=[original(f.option,{credits:5,status:'saved'})];view=comparison(f,candidate);course=view.courses.find(row=>row.provider===f.option.provider&&row.code===f.option.code);assert.equal(course.credits,5);assert.equal(course.creditSystem,'semester');assert.equal(course.origin,'library');
});
test('legacy options without an explicit unknown flag retain their existing progress and display behavior',()=>{
 const f=fixture(false),entry=projection(f);assert.equal(entry.sourceCredits,3);assert.equal(entry.credits,3);
 const next=Sheet.recordProgress(f.state,f.model,f.requirement,f.option,'completed');assert.equal(next.learning[0].credits,3);assert.equal(next.learning[0].creditSystem,'semester');assert.equal(next.learning[0].status,'earned');
 const view=comparison(f),course=view.courses.find(row=>row.provider===f.option.provider&&row.code===f.option.code);assert.equal(course.credits,3);assert.equal(course.creditSystem,'semester');
});
