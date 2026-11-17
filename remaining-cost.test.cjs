const test=require('node:test'),assert=require('node:assert/strict');
const E=require('./dist/plan-comparison-engine.js'),P=require('./dist/planner.js'),J=require('./dist/journey-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const option=(provider,code,credits=3,extra={})=>({id:provider+'-'+code,provider,code,title:code,credits,creditSystem:'semester',evidence:'published',sourceIds:['test-source'],...extra});
function program(){
 const req=(id,opts,extra={})=>({id,code:id,title:id,credits:3,category:'general',options:opts,...extra});
 return{id:'cost-test',school:'Test University',title:'Test degree',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:15,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:12,sources:[{id:'test-source',title:'Synthetic fixture only',url:'https://example.edu/catalog'}],requirements:[
  req('writing',[option('Sophia','S1')]),req('history',[option('Study.com','H1')]),
  req('composition1',[option('CLEP','C1',3,{bundleId:'composition',bundleCredits:6})]),req('composition2',[option('CLEP','C1',3,{bundleId:'composition',bundleCredits:6})]),
  req('capstone',[option('University','CAP')],{institutionalOnly:true})
 ]};
}
const inputs=extra=>({priority:'transfer',providers:['Sophia','Study.com','CLEP'],universityRate:100,providerMonths:{Sophia:2,'Study.com':3},fees:50,feesConfirmed:true,taxesConfirmed:true,examFeesConfirmed:true,...extra});
function draft(p=program(),input=inputs()) {return{program:p,input,plan:P.generate(p,input)};}
test('remaining study estimate prices subscriptions once and one bundled exam once',()=>{
 const d=draft(),before=JSON.stringify(d),cost=E.remainingCosts(d,{},{});
 assert.equal(cost.universityTuition,300);assert.equal(cost.outsideCourses,198+705+97);assert.equal(cost.estimatedBaseCost,1300);assert.equal(cost.total,1350);assert.equal(cost.complete,true);assert.equal(cost.items.find(item=>item.provider==='Sophia').months,2);assert.equal(cost.items.find(item=>item.provider==='CLEP').exams,1);assert.equal(JSON.stringify(d),before);
});
test('finished source actions and completed university courses are not repurchased',()=>{
 const p=program(),completed=[{requirementId:'writing',optionId:'Sophia-S1',status:'confirmed'},{requirementId:'capstone',optionId:'University-CAP',status:'confirmed',institution:p.school,sourceProgramId:p.id}],d=draft(p,inputs({completed})),cost=E.remainingCosts(d,{},{});
 assert.equal(d.plan.rows.find(row=>row.requirementId==='writing').status,'confirmed');assert.equal(cost.universityTuition,0);assert.equal(cost.outsideCourses,705+97);assert(!cost.items.some(item=>item.provider==='Sophia'));assert.equal(cost.total,852);
});
test('unknown fees preserve a useful scoped estimate without claiming a complete total',()=>{
 const d=draft(program(),inputs({fees:0,feesConfirmed:false,taxesConfirmed:false,examFeesConfirmed:false})),cost=E.remainingCosts(d,{},{});
 assert.equal(cost.estimatedBaseCost,1300);assert.equal(cost.knownSubtotal,1300);assert.equal(cost.fees,null);assert.equal(cost.total,null);assert.equal(cost.complete,false);assert(cost.missing.some(reason=>/fees/.test(reason)));assert(cost.exclusions.some(reason=>/Financial aid/.test(reason)));assert(!cost.missing.some(reason=>/Housing/.test(reason)));
});
test('an unpriced provider remains unknown rather than becoming a free course',()=>{
 const p=program();p.requirements[0].options=[option('StraighterLine','ENG101')];const d=draft(p,inputs({providers:['StraighterLine','Study.com','CLEP']})),cost=E.remainingCosts(d,{},{});
 assert.equal(cost.outsideCourses,null);assert.equal(cost.estimatedBaseCost,null);assert.equal(cost.total,null);assert.equal(cost.knownSubtotal,300+705+97+50);assert.equal(cost.items.find(item=>item.provider==='StraighterLine').amount,null);assert(cost.missing.includes('StraighterLine pricing'));
});
test('paid university terms require an explicit estimate and are not inferred from transferred credits',()=>{
 const p=program();p.pricing={model:'subscription',amount:1800,period:'8 weeks',currency:'USD',sourceUrl:'https://example.edu/tuition'};
 const missing=E.remainingCosts(draft(p,inputs({universityRate:0})),{},{});assert.equal(missing.universityTuition,null);assert.equal(missing.estimatedBaseCost,null);
 const quoted=E.remainingCosts(draft(p,inputs({universityRate:0,universitySubscriptionTerms:2})),{},{});assert.equal(quoted.universityTuition,3600);assert.equal(quoted.estimatedBaseCost,4600);assert.equal(quoted.universityTerms,2);assert.match(quoted.items[0].detail,/Published subscription price.*estimated paid terms/);
});
test('confirmed CLEP voucher zeroes exam charge only and leaves unconfirmed administration costs open',()=>{
 const cost=E.remainingCosts(draft(program(),inputs({modernStates:true,voucherConfirmed:true,examFeesConfirmed:false})),{},{});assert.equal(cost.items.find(item=>item.provider==='CLEP').amount,0);assert.equal(cost.estimatedBaseCost,1203);assert.equal(cost.total,null);assert(cost.missing.includes('CLEP administration/proctoring charges'));
});

function rankingFixture(){
 const p=program();p.id='expensive';p.title='Course-fit degree';p.totalCredits=6;p.externalMaxCredits=3;p.requirements=p.requirements.filter(row=>['writing','capstone'].includes(row.id));p.pricing={model:'per-credit',amount:500,currency:'USD',sourceUrl:'https://example.edu/expensive-tuition'};
 const cheap=copy(p);cheap.id='cheap';cheap.title='Lower tuition degree';cheap.pricing.amount=50;cheap.requirements[0].options=[option('University','UNI101')];
 const routes=[p,cheap].map(model=>({id:model.id,modelId:model.id,school:model.school,title:model.title,level:'bachelor',field:'general',fields:['general'],goals:['any-degree','career-growth','change-career'],modalities:['online']})),catalog={pathways:routes};
 let state=J.initialize(null,null,catalog);state.profile={...state.profile,goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'online',priority:'balanced'};state.learning=[{id:'saved-writing',provider:'Sophia',code:'S1',title:'Writing',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}];state.scenarios={expensive:{providers:['Sophia'],allowConditional:true,sophiaWeeks:1,termWeeks:10,termCredits:3},cheap:{providers:['Sophia'],allowConditional:true,termWeeks:1,termCredits:6}};
 return{state,catalog,models:[p,cheap]};
}
const compare=fixture=>E.build(fixture.state,fixture.catalog,fixture.models,{}, {fromCourses:true,deferMatrix:true});
test('explicit cost and speed priorities can change the automatic shortlist without changing shared records',()=>{
 const f=rankingFixture();const balanced=compare(f);assert.equal(balanced.scenarios[0].pathwayId,'expensive');
 f.state.profile.priority='cost';const before=JSON.stringify(f.state),cost=compare(f);assert.equal(cost.scenarios[0].pathwayId,'cheap');assert.equal(cost.recommendation.id,'route:cheap');assert.equal(cost.recommendation.metric,'estimatedBaseCost');assert.equal(cost.recommendation.partial,true);assert.match(cost.rankBasis,/Unconfirmed fees/);assert.equal(JSON.stringify(f.state),before);
 f.state.profile.priority='speed';const speed=compare(f);assert.equal(speed.scenarios[0].pathwayId,'cheap');assert.equal(speed.recommendation.metric,'estimatedWeeks');assert.equal(speed.recommendation.id,'route:cheap');
});
test('visible comparison priority overrides setup priority and unknown prices never rank as zero',()=>{
 const f=rankingFixture();f.state.profile.priority='cost';f.state.whatIf={priority:'collection'};assert.equal(compare(f).scenarios[0].pathwayId,'expensive');
 f.state.profile.priority='balanced';f.state.whatIf.priority='cost';assert.equal(compare(f).scenarios[0].pathwayId,'cheap');
 const override=E.build(f.state,f.catalog,f.models,{}, {fromCourses:true,deferMatrix:true,priority:'collection'});assert.equal(override.scenarios[0].pathwayId,'expensive');
 delete f.models[1].pricing;const unknown=compare(f);assert.equal(unknown.recommendation,null);assert.equal(unknown.scenarios[0].pathwayId,'expensive');assert.match(unknown.rankBasis,/need tuition/);assert.equal(unknown.scenarios.find(row=>row.pathwayId==='cheap').summary.estimatedBaseCost,null);
});
test('displayed price and adopted route use the same saved-course selections',()=>{
 const f=rankingFixture(),view=compare(f),selected=view.scenarios.find(row=>row.pathwayId==='expensive'),before=JSON.stringify(f.state.learning);
 const adopted=E.applyScenario(f.state,selected.id,f.catalog,{collectionSelections:selected.summary.collectionSelections}),d=J.buildDraft(adopted,f.catalog,f.models),cost=E.remainingCosts(d,adopted,{});
 assert.deepEqual(d.plan.rows.map(row=>[row.requirementId,row.option.id]),selected.draft.plan.rows.map(row=>[row.requirementId,row.option.id]));assert.equal(cost.estimatedBaseCost,selected.summary.estimatedBaseCost);assert.equal(JSON.stringify(adopted.learning),before);assert.equal(adopted.learning[0].status,'saved');
});
