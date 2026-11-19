const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Route=require('./dist/plan-route.js'),View=require('./dist/course-plan-view.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const catalog=require('./dist/data/pathways.json'),models=['liberty','tesu'].map(name=>require('./dist/data/'+name+'.json'));
function initial(id='liberty-business-residential'){return Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(path=>path.modelId===id)),null,catalog);}
function draft(state=initial()){return Journey.buildDraft(state,catalog,models);}
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

test('the overview projects the complete real Liberty plan without changing records, choices or credit awards',()=>{
 const d=freeze(draft()),view=freeze(View.build(d)),before=JSON.stringify([d,view]),route=Route.build(d,view);
 assert.equal(route.available,true);assert.deepEqual(route.phases.map(p=>[p.id,p.value]),[['completed',0],['outside',83],['university',37],['degree',120]]);
 assert.equal(route.confirmedCredits,0);assert.equal(route.needsCourseCredits,0);assert.equal(route.unit,'credits');
 assert.equal(JSON.stringify([d,view]),before);assert.match(Route.render(d,view),/School awards tracked separately/);
});

test('switching a real course recomputes the proposed mix and never increases finished or confirmed credits',()=>{
 const state=initial(),d=draft(state),req=d.program.requirements.find(row=>row.id==='engl-101'),university=req.options.find(option=>option.provider==='University');
 const changed=draft(Sheet.setCourse(state,d.program.id,req.id,university.id)),route=Route.build(changed,View.build(changed));
 assert.deepEqual(route.phases.map(p=>p.value),[0,80,40,120]);assert.equal(route.confirmedCredits,0);assert.deepEqual(changed.state.learning,state.learning);
 assert.deepEqual(Route.build(d,View.build(d)).phases.map(p=>p.value),[0,83,37,120]);
});

test('finished coursework and an explicit school award remain distinct in the overview',()=>{
 const state=initial(),d=draft(state),req=d.program.requirements.find(row=>row.id==='engl-101'),option=req.options.find(option=>option.provider==='Sophia');
 const completed=draft(Sheet.recordProgress(state,d.program,req,option,'completed')),pending=Route.build(completed,View.build(completed));
 assert.deepEqual(pending.phases.map(p=>p.value),[3,80,37,120]);assert.equal(pending.confirmedCredits,0);assert.match(pending.phases[0].detail,/tracked separately/);
 const awarded=draft(Sheet.recordProgress(completed.state,d.program,req,option,'confirmed',{confirmation:true})),confirmed=Route.build(awarded,View.build(awarded));
 assert.equal(confirmed.phases[0].value,3);assert.equal(confirmed.confirmedCredits,3);assert.equal(confirmed.phases[0].detail,'3 school confirmed');
});

test('a completed six-credit source bundle is counted once across receiving requirements',()=>{
 const state=initial('tesu-general-management'),d=draft(state),req=d.program.requirements.find(row=>row.id==='enc1010'),option=req.options.find(option=>option.id==='clep-composition-enc1010');
 const done=draft(Sheet.recordProgress(state,d.program,req,option,'completed')),view=View.build(done),route=Route.build(done,view);
 assert.equal(done.state.learning.length,1);assert.equal(route.phases[0].value,6);assert.equal(route.phases.slice(0,3).reduce((n,p)=>n+p.value,0),120);assert.equal(route.confirmedCredits,0);
});

test('in-progress coursework stays in the planned course mix until it is actually finished',()=>{
 const state=initial(),d=draft(state),req=d.program.requirements.find(row=>row.id==='engl-101'),option=req.options.find(option=>option.provider==='Sophia');
 const taking=draft(Sheet.recordProgress(state,d.program,req,option,'in-progress')),view=View.build(taking),route=Route.build(taking,view);
 assert.equal(view.progress.inProgressCredits,3);assert.deepEqual(route.phases.map(p=>p.value),[0,83,37,120]);assert.equal(route.confirmedCredits,0);
});

test('missing and inconsistent allocations cannot produce a reassuring complete route',()=>{
 const d=draft(),view=View.build(d);
 for(const input of [undefined,{}, {...view,totals:{...view.totals,accounted:119}}, {...view,totals:{...view.totals,transfer:'83'}}, {...view,totals:{...view.totals,transfer:-1}}, {...view,totals:{...view.totals,transfer:NaN}}])assert.equal(Route.build(d,input).available,false);
 assert.equal(Route.render({...d,plan:null},view),'');assert.equal(Route.render({...d,program:null},view),'');
});

test('gaps remain explicit rather than being relabeled as university coursework',()=>{
 const d=draft(),view=View.build(d);view.totals.transfer-=3;view.totals.unmapped+=3;
 const route=Route.build(d,view);assert.equal(route.needsCourseCredits,3);assert.equal(route.phases[1].value,80);assert.equal(route.phases[2].value,37);
 assert.match(Route.render(d,view),/3 credits still need a course/);assert.match(Route.render(d,view),/data-action="checks"/);
});

test('course units, fractional quantities and untrusted display strings remain accurate and escaped',()=>{
 const d=clone(draft()),view=clone(View.build(d));d.program.creditSystem='competency-unit';assert.equal(Route.build(d,view).unit,'units');
 d.program.creditSystem='quarter';assert.match(Route.render(d,view),/quarter credits/);
 d.pathway.school='<img src=x onerror=alert(1)>';view.groups.transfer[0].provider='<script>unsafe</script>';
 const html=Route.render(d,view);assert(!html.includes('<script>'));assert(!html.includes('<img'));assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);
 view.totals.transfer-=.5;view.totals.universityReserved+=.5;assert.equal(Route.build(d,view).phases[1].value,82.5);
});

test('the browser and CommonJS overview share a pure API with no storage or network access',()=>{
 const context={Intl};vm.runInNewContext(fs.readFileSync('dist/plan-route.js','utf8'),context);const d=draft(),view=View.build(d);
 assert.equal(context.DegreePlanRoute.render(d,view),Route.render(d,view));assert.equal(context.fetch,undefined);assert.equal(context.localStorage,undefined);
});
