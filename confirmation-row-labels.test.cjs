/* Plans that open while they need school confirmation label every unsettled row honestly, in the worksheet and the
   CSV export: "You choose this course" (open choice), "Counts if: …" (documented condition), "Confirm with school"
   (match for this degree not published), and "Published match for this degree" only for evidenced rows. Never "Accepted". */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const View=require('./dist/course-plan-view.js'),Sheet=require('./dist/sheet-state.js'),Planner=require('./dist/planner.js');
const review=require('./dist/data/option-review.json'),index=require('./dist/data/plan-library-index.json'),baselines=require('./dist/data/baseline-index.json');
const registry=require('./dist/data/curriculum-registry.json');
const modelFor=id=>{const entry=registry.models.find(item=>item.id===id);const doc=JSON.parse(fs.readFileSync('dist/'+entry.path,'utf8'));return (doc.models||[doc]).find(item=>item.id===id);};

test('every buildable confirmation plan has a row review, and its counts match the labels',()=>{
 const buildable=Object.entries(index.plans).filter(([,plan])=>plan.tier==='confirmation'&&plan.buildable);
 assert.ok(buildable.length>0);
 for(const [routeId,plan] of buildable){
  assert.ok(review.models[plan.modelId],routeId+' has option review');assert.ok(plan.rows,routeId+' has row counts');
  const model=modelFor(plan.modelId),baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===routeId);
  const counts={settled:0,choose:0,conditional:0,confirm:0};
  for(const row of baseline.rows){const req=model.requirements.find(item=>item.id===row.requirementId),option=req.options.find(item=>item.id===row.optionId);counts[View.reviewKind(req,option,review.models[plan.modelId])]++;}
  assert.deepEqual(counts,plan.rows,routeId);
 }
});

test('worksheet and CSV labels for each kind of row',()=>{
 const [routeId,plan]=Object.entries(index.plans).find(([,plan])=>plan.buildable&&plan.rows?.choose&&plan.rows?.confirm&&plan.rows?.conditional&&plan.rows?.settled>0);
 const model=modelFor(plan.modelId),map=review.models[model.id],baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===routeId);
 const seen=new Set();
 globalThis.DegreeOptionReview={[model.id]:map};
 const rows=baseline.rows.map(row=>{const req=model.requirements.find(item=>item.id===row.requirementId),option=req.options.find(item=>item.id===row.optionId);return {requirementId:req.id,title:req.title,credits:row.credits,status:'planned',option,conditions:[]};});
 const built=View.build({program:model,plan:{rows,totals:{}},state:{learning:[]}});
 const labels=Object.values(built.groups).flat().map(entry=>entry.evidenceLabel);
 for(const label of labels){
  if(label==='You choose this course')seen.add('choose');else if(label==='Confirm with school')seen.add('confirm');else if(/^Counts if/.test(label))seen.add('conditional');else if(label==='Published match for this degree')seen.add('published');
  assert.doesNotMatch(label,/accepted/i);
 }
 for(const kind of ['choose','confirm','conditional'])assert.ok(seen.has(kind),routeId+' shows '+kind);
 const csv=Sheet.exportCSV(model,{rows},{},(req,option)=>View.reviewLabel(req,option,map));
 assert.match(csv,/You choose this course/);assert.match(csv,/Confirm with school/);assert.match(csv,/Counts if/);assert.doesNotMatch(csv,/accepted/i);
 delete globalThis.DegreeOptionReview;
 // Without a review (reviewed plans) the existing evidence labels are unchanged.
 const plain=Object.values(View.build({program:model,plan:{rows,totals:{}},state:{learning:[]}}).groups).flat().map(entry=>entry.evidenceLabel);
 assert.ok(!plain.some(label=>/Confirm with school|^Counts if|Published match for this degree/.test(label)));
});
