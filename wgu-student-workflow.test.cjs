const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),View=require('./dist/course-plan-view.js'),Checklist=require('./dist/student-checklist.js');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const original=require('./dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83'),route=catalog.pathways.find(route=>route.modelId===original.id),clone=value=>JSON.parse(JSON.stringify(value));
function draft(model=original,state){let next=state||Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);next.profile.hasPrior='none';next.journey={...next.journey,answers:{...next.journey?.answers,prior:'none'}};return Journey.buildDraft(next,catalog,[model]);}
test('the documented WGU route has 36 trackable courses and no invented missing-course task',()=>{
 const d=draft(),before=JSON.stringify(d),view=View.build(d),tasks=Checklist.build(d.state,d);
 assert.equal(d.plan.validation.valid,true);assert.equal(d.plan.totals.external,69);assert.equal(d.plan.totals.institutional,41);
 assert.equal(original.residencyPolicy.creditScope,'active-program');assert.equal(original.residencyPolicy.calculatedMinimumInstitutionCUs,31.5);assert(original.residencyPolicy.sourceIds.includes('wgu-residency-policy-23797-20260918'));assert(original.residencyPolicy.sourceIds.every(id=>original.sources.some(source=>source.id===id&&/^https:\/\//.test(source.url))));assert.equal(d.plan.totals.confirmed,0,'Published course and residency rules do not create a personal award');
 assert.equal(view.groups.unmapped.length,0);assert.equal(view.totals.universityRequired,26);assert.equal(view.totals.universityReserved,15);assert.equal(d.plan.coverage.researchGapCredits,15);
 assert(!tasks.tasks.some(task=>task.id==='get-requirements'));assert.equal(tasks.tasks.filter(task=>task.kind==='course').length,36);assert(tasks.tasks.filter(task=>task.kind==='course').every(task=>task.status==='todo'));
 const deadline=tasks.tasks.find(task=>task.id==='check-transfer-deadline');assert.match(deadline.detail,/5th of the month before/);assert.match(deadline.detail,/not accepted after/);assert.equal(deadline.actionLabel,'View published transfer deadline');assert(deadline.sources.length);assert.equal(deadline.dueOn,'');
 assert.equal(JSON.stringify(d),before);
});
test('a named university course with no outside map turns yellow and then done from actual course records',()=>{
 const first=draft(),row=first.plan.rows.find(row=>row.option.provider==='University'&&row.placementReason==='research-gap'),req=original.requirements.find(req=>req.id===row.requirementId);
 let state=Sheet.recordProgress(first.state,original,req,row.option,'in-progress'),d=draft(original,state),view=View.build(d),tasks=Checklist.build(d.state,d);
 assert.equal(view.progress.inProgressCredits,row.credits);assert.equal(view.progress.completedCredits,0);assert(tasks.tasks.some(task=>task.requirementIds?.includes(row.requirementId)&&task.status==='doing'));
 state=Sheet.recordProgress(d.state,original,req,row.option,'completed');d=draft(original,state);view=View.build(d);tasks=Checklist.build(d.state,d);
 assert.equal(view.progress.completedCredits,row.credits);assert.equal(view.progress.confirmedCredits,0);assert(tasks.tasks.some(task=>task.requirementIds?.includes(row.requirementId)&&task.status==='done'));assert.equal(tasks.tasks.find(task=>task.id==='finish-coursework').status,'todo');
});
test('unbound deadline facts cannot replace the deadline-research fallback',()=>{
 const model=clone(original);model.pacePolicy.transcriptDeadline.sourceIds=['missing-source'];const d=draft(model),tasks=Checklist.build(d.state,d),deadline=tasks.tasks.find(task=>task.id==='check-transfer-deadline');
 assert.equal(deadline.actionLabel,'Plan transcript delivery');assert.match(deadline.detail,/still needs to source this program’s exact transfer deadline/);assert(!deadline.detail.includes('5th'));assert.equal((deadline.sources||[]).length,0,'An unbound policy must not be rendered as a sourced deadline');assert.equal(deadline.dueOn,'');assert.equal(deadline.href,'portal.html?view=school&action=check-transfer-deadline');
});
test('saving an approved Sophia course shapes the degree while three source credits become only two WGU units',()=>{
 const first=draft();let state=Sheet.updateLearning(first.state,{id:'saved-operations',provider:'Sophia',code:'SOPH-0086',title:'Operations Management',credits:3,creditSystem:'semester',status:'saved'}),d=draft(original,state);
 const placement=d.collectionMatch.placements.find(item=>item.learningId==='saved-operations'),req=original.requirements.find(req=>req.id===placement?.requirementId);
 assert(placement);assert.equal(req.code,'D079');assert.equal(placement.credits,2);assert.equal(d.plan.rows.find(row=>row.requirementId===req.id).option.provider,'Sophia');assert.equal(View.build(d).progress.completedCredits,0);assert.equal(View.build(d).progress.inProgressCredits,0);
 state=Sheet.updateLearning(d.state,{...d.state.learning.find(item=>item.id==='saved-operations'),status:'in-progress'});d=draft(original,state);assert.equal(View.build(d).progress.inProgressCredits,2);assert.equal(d.state.learning.find(item=>item.id==='saved-operations').credits,3);
 state=Sheet.updateLearning(d.state,{...d.state.learning.find(item=>item.id==='saved-operations'),status:'earned'});d=draft(original,state);assert.equal(View.build(d).progress.completedCredits,2);assert.equal(View.build(d).progress.confirmedCredits,0);assert.equal(d.state.learning.find(item=>item.id==='saved-operations').creditSystem,'semester');
});
