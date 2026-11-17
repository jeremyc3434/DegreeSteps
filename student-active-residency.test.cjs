const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createRequire}=require('node:module');
const projectRequire=createRequire(path.join(__dirname,'package.json'));
const Guide=projectRequire('./dist/guide-engine.js'),Planner=projectRequire('./dist/planner.js');
const model=projectRequire('./dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
const original={id:'previous-wgu-record',provider:'University',institution:model.school,sourceProgramId:'previous-wgu-degree',code:'C715',title:'Organizational Behavior',credits:3,creditSystem:'competency-unit',status:'earned',grade:'A',completedOn:'2025-11-01',evaluations:[]};

test('previous WGU program learning cannot automatically count as active-program residency',()=>{
  const before=JSON.stringify(original),match=Guide.matchInventory(model,[original]);
  const plan=Planner.generate(model,{completed:match.completed,providers:['Sophia','Study.com']});
  assert(!plan.rows.some(row=>row.priorLearning&&row.code==='C715'&&row.institutional),'the current handbook excludes prior-program work unless a reviewed exception applies');
  assert.equal(JSON.stringify(original),before);
});

test('same active-program coursework retains its actual institutional identity',()=>{
  const match=Guide.matchInventory(model,[{...original,sourceProgramId:model.id}]);
  assert(match.completed.some(placement=>placement.sourceProvider==='University'));
  const plan=Planner.generate(model,{completed:match.completed,providers:['Sophia','Study.com']});
  assert(plan.rows.some(row=>row.priorLearning&&row.code==='C715'&&row.institutional));
});

test('alternative-origin learning cannot become institutional credit through a university label',()=>{
  const claimed={...original,sourceProgramId:model.id,sourceType:'ace'};
  assert.equal(Guide.matchInventory(model,[claimed]).completed.length,0);
  const req=model.requirements.find(req=>req.code==='C715'),option=req.options.find(option=>option.provider==='University');
  claimed.evaluations=[{programId:model.id,requirementId:req.id,optionId:option.id,status:'reported'}];
  const match=Guide.matchInventory(model,[claimed]),plan=Planner.generate(model,{completed:match.completed,providers:['Sophia','Study.com']});
  const row=plan.rows.find(row=>row.requirementId===req.id);
  assert.equal(row.institutional,false);
  assert.equal(row.unknownProvenance,true);
  assert(plan.validation.errors.some(issue=>issue.code==='unknown_provenance'));
});
