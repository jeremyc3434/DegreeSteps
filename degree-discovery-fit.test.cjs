'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Fit=require('./dist/degree-discovery-fit.js'),Engine=require('./dist/plan-comparison-engine.js'),Estimate=require('./dist/plan-estimate-engine.js'),Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'dist',name),'utf8'));
const registry=read('data/curriculum-registry.json'),publication=read('data/publication-index.json'),rates=read('data/plan-estimate-rates.json'),costs=read('data/cost-comparisons.json');
const full=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(read('data/pathways.json'),read('data/program-catalog.json')),registry),publication,registry);
const packs=new Map(),models=new Map();
for(const entry of publication.plans){const row=registry.models.find(item=>item.id===entry.modelId);if(!packs.has(row.path))packs.set(row.path,read(row.path));const pack=packs.get(row.path);models.set(row.id,(pack.models||[pack]).find(model=>model.id===row.id));}
const modelIds=['curriculum-liberty-human-services-bs-online','curriculum-liberty-history-bs-online','curriculum-wgu-catalog-ecceaa488637ac83'];
function fixture(){
 const catalog={...full,pathways:full.pathways.filter(route=>modelIds.includes(route.modelId))},routes=catalog.pathways;
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),routes[0]),null,catalog);
 Object.assign(state.profile,{goal:'any-degree',field:'any',degreeLevel:'bachelor',modality:'online',classroomImportance:'open'});
 state.learning=[{id:'private-finished',provider:'Sophia',code:'SOPH-0015',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[]},{id:'private-taking',provider:'Sophia',code:'SOPH-0030',title:'English Composition II',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},{id:'private-saved',provider:'Sophia',code:'SOPH-0009',title:'Art History I',credits:3,creditSystem:'semester',status:'saved',evaluations:[]},{id:'private-quarter',provider:'My old college',code:'HIST 999',title:'My original course',credits:4,creditSystem:'quarter',status:'earned',privateNote:'Private course note',evaluations:[]}];
 state.sheet.notes={private:'Private advisor note'};state.whatIf={selectedIds:['current','saved:private-choice'],snapshots:[{id:'private-choice',label:'Private saved degree'}]};state.savings={private:{quote:12345}};
 return{state,catalog,models:modelIds.map(id=>models.get(id)),costs,options:{routeIds:routes.map(route=>route.id),estimateRates:rates,publication}};
}
test('published discovery uses the whole-plan engine and shared personalized ranges without changing private records',()=>{
 const f=fixture(),before=JSON.stringify(f),progress=[],value=Fit.evaluate(f.state,f.catalog,f.models,f.costs,f.options,{onProgress:row=>progress.push(row)});
 assert.equal(value.complete,true);assert.equal(value.results.length,3);assert.equal(value.checkedCount,3);assert.equal(value.totalCount,3);assert(value.results.every(row=>row.available&&row.eligible));
 assert.equal(JSON.stringify(f),before,'Original quantities, credit units, course statuses, notes, active target and comparison choices remain intact');
 assert.equal(progress[0].phase,'started');assert.deepEqual(progress.map(row=>row.checkedCount),[0,1,2,3]);
 for(const result of value.results){
  const base=structuredClone(f.state);base.selectedPathwayId='';delete base.targetIdentity;Object.assign(base.profile,{entry:'explore',school:'',schoolChoice:'',degree:'',pathwayId:''});base.sheet.isExample=true;base.whatIf.selectedIds=[];
  const scenario=Engine.build(base,{...f.catalog,pathways:[f.catalog.pathways.find(route=>route.id===result.pathwayId)]},f.models,costs,{selectedIds:['route:'+result.pathwayId],fromCourses:true,deferMatrix:true,priority:'collection'}).scenarios[0];
  assert.equal(result.summary.collectionFitCredits,scenario.summary.collectionFitCredits);
  assert.equal(result.summary.applicableCompletedCredits,scenario.summary.applicableCompletedCredits);
  assert.deepEqual(result.estimate,Estimate.calculate({program:scenario.draft.program,plan:scenario.draft.plan,rates}),'The same actual draft gets the same reviewed planning estimate as comparison');
  const fit=result.summary.fitBreakdown;assert.equal(fit.completedCredits,result.summary.applicableCompletedCredits);assert.equal(fit.potentialCredits,fit.inProgressCredits+fit.savedCredits+fit.plannedCredits);assert.equal(result.summary.collectionFitCredits,fit.completedCredits+fit.potentialCredits);
 }
 const serialized=JSON.stringify({value,progress});for(const privateText of ['private-finished','private-taking','private-saved','private-quarter','Private course note','Private advisor note','Private saved degree'])assert(!serialized.includes(privateText),'Compact projections omit '+privateText);
 assert(!serialized.includes('estimatedBaseCost'),'Legacy scalar costs cannot be mistaken for the shared source-bound range');
});
test('publication and exact model fingerprint gates independently reject unsupported discovery targets',()=>{
 const f=fixture(),unpublished=full.pathways.find(route=>route.modelId&&!publication.plans.some(entry=>entry.routeIds.includes(route.id)));
 assert(unpublished);const catalog={...f.catalog,pathways:[...f.catalog.pathways,unpublished]},options={...f.options,routeIds:[unpublished.id,f.options.routeIds[0],f.options.routeIds[0]]};
 const value=Fit.evaluate(f.state,catalog,f.models,costs,options);assert.equal(value.results.length,2);assert.equal(value.results[0].summary,null);assert.equal(value.results[0].estimate,null);assert.equal(value.results[0].available,false);assert.equal(value.results[1].available,true);
 for(const invalidate of [copy=>{copy.catalog.publicationIndex.available=false;},copy=>{copy.models.find(model=>model.id===copy.catalog.pathways[0].modelId).title+=' Different edition';},copy=>{copy.options.publication.registryRevision='wrong';},copy=>{copy.options.publication.plans=[];}]){
  const copy=structuredClone(f);invalidate(copy);const result=Fit.evaluate(copy.state,copy.catalog,copy.models,costs,{...copy.options,routeIds:[copy.catalog.pathways[0].id]}).results[0];assert.equal(result.available,false);assert.equal(result.summary,null);assert.equal(result.estimate,null);
 }
 assert.throws(()=>Fit.evaluate(f.state,f.catalog,f.models,costs,{routeIds:Array(65).fill(f.options.routeIds[0])}),/64/);
});
test('career and study preferences remain effective while explicit search changes affect only detached calculations',()=>{
 const f=fixture(),before=JSON.stringify(f.state);f.state.profile.goal='teacher';
 const protectedResult=Fit.evaluate(f.state,f.catalog,f.models,costs,f.options);assert(protectedResult.results.every(result=>!result.eligible&&result.summary===null));
 f.state.profile.goal='any-degree';f.state.profile.modality='campus';f.state.profile.classroomImportance='essential';
 assert(Fit.evaluate(f.state,f.catalog,f.models,costs,f.options).results.every(result=>!result.eligible));
 const override={...f.options,discoveryProfile:{modality:'online',classroomImportance:'open',field:'any',degreeLevel:'bachelor'}};
 assert(Fit.evaluate(f.state,f.catalog,f.models,costs,override).results.every(result=>result.eligible));assert.equal(f.state.profile.modality,'campus');assert.equal(f.state.profile.classroomImportance,'essential');
 assert.throws(()=>Fit.evaluate(f.state,f.catalog,f.models,costs,{...override,discoveryProfile:{goal:'any-degree'}}),/supported/);
 assert.throws(()=>Fit.evaluate(f.state,f.catalog,f.models,costs,{...override,discoveryProfile:{modality:'whatever'}}),/valid/);
 assert.equal(JSON.parse(before).selectedPathwayId,f.state.selectedPathwayId);
});
test('missing personalized prices remain unknown and cannot enter budget ranking as zero',()=>{
 const f=fixture(),unknown=Fit.evaluate(f.state,f.catalog,f.models,costs,{routeIds:[f.options.routeIds[0]]}).results[0];assert(unknown.available);assert.equal(unknown.estimate,null);
 const estimate=(min,max,status='planning-range')=>({available:true,status,costs:{currency:'USD',complete:false,scope:'known-remaining-course-charges-before-aid',knownRange:{min,max}},timing:{outsideMonths:{min:1,max:2},universityTerms:{min:1,max:2},totalMonths:{min:7,max:14}}});
 const row=(id,fraction,price)=>({pathwayId:id,available:true,eligible:true,summary:{collectionFitFraction:fraction,completedFitFraction:fraction/2},estimate:price});
 const values=[row('unknown',.9,null),row('partial',.8,estimate(1,2,'partial-range')),row('high',.4,estimate(100,400)),row('low',.5,estimate(150,200))],before=JSON.stringify(values);
 assert.deepEqual(Fit.rank(values,'cost').map(row=>row.pathwayId),['high','low','unknown','partial'],'Like comparison, $100–400 sorts before $150–200 by the lower estimate; a budget cap must separately use the upper estimate');assert.deepEqual(Fit.rank(values,'collection').map(row=>row.pathwayId),['unknown','partial','low','high']);assert.equal(JSON.stringify(values),before);
 const tied=[row('wide',.9,estimate(100,400)),row('narrow',.2,estimate(100,200))];assert.equal(Fit.rank(tied,'cost')[0].pathwayId,'narrow','Equal lower estimates break ties by midpoint before course-fit fractions');
 const timing=[row('longer-upper',.5,estimate(100,200)),row('shorter-upper',.5,estimate(100,200))];timing[0].estimate.timing.totalMonths={min:3,max:12};timing[1].estimate.timing.totalMonths={min:4,max:8};assert.equal(Fit.rank(timing,'time')[0].pathwayId,'longer-upper','Study-time ordering uses the same lower-then-midpoint range policy as comparison');
 timing[1].estimate.timing.totalMonths.min=3;assert.equal(Fit.rank(timing,'time')[0].pathwayId,'shorter-upper');
 assert.equal(Fit.rank([{...row('units',.6,null),summary:{collectionFitFraction:.6,completedFitFraction:.3,collectionFitCredits:6}},{...row('credits',.5,null),summary:{collectionFitFraction:.5,completedFitFraction:.3,collectionFitCredits:100}}])[0].pathwayId,'units','Cross-unit course fit compares degree shares rather than raw amounts');
});
test('reading saved records is reversible, explicit, and never calls storage writes',()=>{
 const f=fixture(),storage={getItem:key=>{assert.equal(key,'degreepath-guide-v3');return JSON.stringify(f.state);},setItem:()=>assert.fail('Discovery cannot write course records')};
 assert.deepEqual(Fit.readState(storage),f.state);assert(Fit.hasCourses(f.state));assert(!Fit.hasCourses({learning:[]}));assert.equal(Fit.readState({getItem:()=>null}),null);
 for(const raw of ['not json','{"version":2,"learning":[]}','{"version":3,"profile":[],"learning":[]}'])assert.throws(()=>Fit.readState({getItem:()=>raw}),/not been changed/);
});
test('discovery progress observers receive detached summaries and cannot alter results',()=>{
 const f=fixture();const result=Fit.evaluate(f.state,f.catalog,f.models,costs,{...f.options,routeIds:[f.options.routeIds[0]]},{onProgress:event=>{if(event.candidate){event.candidate.summary.collectionFitCredits=999;throw Error('Broken UI');}}});
 assert(result.results[0].summary.collectionFitCredits<999);assert(result.results[0].available);
});
test('the actual browser worker dispatches discovery locally without records in progress or terminal summaries',async()=>{
 const f=fixture(),messages=[],networkCalls=[],listeners=[];
 const sandbox={console,URL,URLSearchParams,Intl,postMessage:value=>messages.push(structuredClone(value)),addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn);},fetch:()=>{networkCalls.push('fetch');throw Error('No network');}};
 sandbox.self=sandbox;const context=vm.createContext(sandbox);sandbox.importScripts=(...urls)=>urls.forEach(url=>vm.runInContext(fs.readFileSync(path.join(__dirname,'dist',url),'utf8'),context,{filename:url}));
 vm.runInContext(fs.readFileSync(path.join(__dirname,'dist/degree-comparison-worker.js'),'utf8'),context);
 const payload={state:f.state,catalog:f.catalog,models:f.models,costs,estimateRates:rates,options:{...f.options,routeIds:[f.options.routeIds[0]],estimateRates:undefined}};
 for(const listener of listeners)await listener({data:structuredClone({id:7,kind:'discovery',payload})});
 const terminal=messages.filter(message=>typeof message.ok==='boolean');assert.equal(terminal.length,1);assert.equal(terminal[0].ok,true);assert.equal(terminal[0].value.results.length,1);assert(terminal[0].value.results[0].estimate.available);assert.equal(messages[0].event,'progress');assert.equal(messages.at(-1).ok,true);assert.deepEqual(networkCalls,[]);assert(!JSON.stringify(messages).includes('Private course note'));
});
test('a newer discovery request terminates old work and ignores its late candidates and result',async t=>{
 const Runner=require('./dist/comparison-runner.js'),workers=[],progress=[];
 const runner=Runner.create({delayMs:0,timeoutMs:1000,workerFactory:()=>{const worker={postMessage:value=>worker.request=structuredClone(value),terminate:()=>worker.terminated=true};workers.push(worker);return worker;}});t.after(()=>runner.destroy());
 const wait=async index=>{for(let i=0;i<100&&!workers[index]?.request;i++)await new Promise(resolve=>setTimeout(resolve,1));assert(workers[index]?.request);return workers[index];};
 const first=runner.run('discovery',{options:{routeIds:['old']}},{onProgress:row=>progress.push(row)}),rejected=assert.rejects(first,error=>error.code==='superseded'),old=await wait(0),late=old.onmessage;
 late({data:{id:old.request.id,event:'progress',value:'first candidate'}});
 const second=runner.run('discovery',{options:{routeIds:['new']}},{onProgress:row=>progress.push(row)}),current=await wait(1);assert(old.terminated);
 late({data:{id:old.request.id,event:'progress',value:'stale candidate'}});late({data:{id:old.request.id,ok:true,value:'stale result'}});
 current.onmessage({data:{id:current.request.id,event:'progress',value:'latest candidate'}});current.onmessage({data:{id:current.request.id,ok:true,value:'latest result'}});
 assert.equal(await second,'latest result');await rejected;assert.deepEqual(progress,['first candidate','latest candidate']);assert(current.terminated);
});
test('Worker-unavailable discovery fallback uses the same adapter and shared rates after a paint opportunity',async t=>{
 const Runner=require('./dist/comparison-runner.js'),f=fixture(),notices=[],scheduled=new Map();let token=0;
 const payload={state:f.state,catalog:f.catalog,models:f.models,costs,estimateRates:rates,options:{routeIds:[f.options.routeIds[0]]}},before=JSON.stringify(payload),calls=[];
 const runner=Runner.create({engine:Engine,discovery:{evaluate(...args){calls.push(args);return Fit.evaluate(...args);}},delayMs:0,timeoutMs:10000,workerFactory:()=>{throw Error('Workers unavailable');},schedule(fn){scheduled.set(++token,fn);return token;},cancelSchedule(id){scheduled.delete(id);},onFallback:message=>notices.push(message)});t.after(()=>runner.destroy());
 const pending=runner.run('discovery',payload);assert.equal(calls.length,0);
 for(let i=0;i<3&&scheduled.size;i++){const [id,fn]=scheduled.entries().next().value;scheduled.delete(id);fn();await Promise.resolve();}
 const result=await pending;assert.equal(calls.length,1);assert(result.results[0].available);assert(result.results[0].estimate.available);assert.equal(notices.length,1);assert.equal(JSON.stringify(payload),before);
});
