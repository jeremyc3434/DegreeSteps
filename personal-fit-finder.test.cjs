'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Facts=require('./dist/program-opportunities.js'),Fit=require('./dist/degree-discovery-fit.js');
const source=fs.readFileSync('dist/programs.js','utf8'),html=fs.readFileSync('dist/programs.html','utf8');
const original={version:3,selectedPathwayId:'my-active-degree',profile:{pathwayId:'my-active-degree',field:'business',degreeLevel:'master',modality:'online',goal:'teacher'},learning:[{id:'quarter-original',provider:'My college',code:'ENG101',credits:4,creditSystem:'quarter',status:'earned',privateNote:'Keep the original quantity and note'},{id:'saved-course',provider:'Sophia',code:'HIST1001',credits:3,creditSystem:'semester',status:'saved'}],sheet:{notes:{private:'Keep this note'}},whatIf:{selectedIds:['current','route:already-picked']}};
function result(id,{done=0,future=0,total=120,unit='semester',range={min:4000,max:6000},partial=false,eligible=true}={}){
 const inProgress=Math.min(future,3),saved=Math.max(0,future-inProgress);
 return{pathwayId:id,available:true,eligible,summary:{degreeCredits:total,creditSystem:unit,universityCreditsRemaining:30,remainingCredits:total-done,collectionFitFraction:(done+future)/total,completedFitFraction:done/total,fitBreakdown:{completedCredits:done,inProgressCredits:inProgress,savedCredits:saved,plannedCredits:0,potentialCredits:future}},estimate:range?{available:true,status:partial?'partial-range':'planning-range',costs:{knownRange:range}}:null};
}
function fixture(search='',{hasCourses=true}={}){
 const nodes=new Map(),click=[],windowEvents=new Map(),requests=[],timers=new Map(),writes=[],historyURLs=[];let nextTimer=0,cancels=0;
 function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,innerHTML:'',textContent:'',hidden:false,dataset:{},events:new Map(),setAttribute(key,value){this[key]=value;},addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(fn);},querySelector(){return node(id+'-child');},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return nodes.get(id);}
 for(const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))node(match[1]).options=[...match[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(option=>({value:option[1],textContent:option[2]}));
 const routes=['a-quarter','b-semester','partial','unknown','confirmation'].map(id=>({id,modelId:'model-'+id,school:'Example College',title:id,level:'bachelor',modalities:[id==='a-quarter'?'campus':'online'],catalog:'2026-2027',url:'https://example.edu/'+id}));
 const plans=Object.fromEntries(routes.map(route=>[route.id,{modelId:route.modelId,tier:route.id==='confirmation'?'confirmation':'reviewed',subjects:['business'],questions:route.id==='confirmation'?['A school rule needs review.']:[],start:{outside:60,university:60,total:120},estimate:{min:1000,max:route.id==='a-quarter'?30000:10000},fit:{modelId:route.modelId,catalogYear:'2026-2027',modality:route.modalities[0],competencyBased:true,selfPaced:true,billing:'subscription',paceLabel:'Self-paced',billingLabel:'Subscription',tuitionLabel:'$2,000 per term'}}]));
 const catalog={pathways:routes,publicationIndex:{available:true,plans:routes.filter(route=>route.id!=='confirmation').map(route=>({modelId:route.modelId,publicationReady:true,routeIds:[route.id]}))}},C={merge:()=>catalog,loadIndex:async()=>catalog,publishedPlans:()=>routes.filter(route=>route.id!=='confirmation'),isPlanAvailable:()=>true,planChoiceCount:()=>0};
 const payloads={'data/pathways.json':{},'data/program-catalog.json':{},'data/opportunity-catalog.json':{schools:[]},'data/credit-sources.json':{sources:[]},'data/plan-library-index.json':{plans,subjects:{business:'Business'}},'data/plan-freshness.json':{plans:{}},'data/baseline-index.json':{baselines:{}}};
 const saved=JSON.stringify(original),location={search};
 const client={hasCourses:()=>{if(hasCourses instanceof Error)throw hasCourses;return hasCourses;},cancel(){cancels++;},run(routeIds,options){return new Promise((resolve,reject)=>requests.push({routeIds:[...routeIds],options,resolve,reject}));}};
 const context={URLSearchParams,URL,console,location,history:{replaceState(_state,_title,url){historyURLs.push(url);location.search=new URL(url,'https://degreesteps.test').search;}},document:{getElementById:node,querySelectorAll:()=>[],activeElement:null,addEventListener(type,fn){if(type==='click')click.push(fn);}},DegreeProgramCatalog:C,localStorage:{getItem:()=>saved,setItem(...args){writes.push(args);}},fetch:async url=>({ok:true,json:async()=>structuredClone(payloads[url]||{})}),setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},window:{DegreeProgramOpportunities:Facts,DegreeDiscoveryFit:Fit,DegreeDiscoveryClient:{create:()=>client},dispatchEvent(){},addEventListener(type,fn){windowEvents.set(type,fn);}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 vm.runInNewContext(source,context);
 const tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 const ready=async()=>{await tick();assert(!node('program-error').textContent,node('program-error').textContent);};
 const shown=()=>[...node('program-results').innerHTML.matchAll(/<article class="pf-program" data-program="([^"]+)"/g)].map(match=>match[1]);
 function change(id,value){const n=node(id);if(typeof value==='boolean')n.checked=value;else n.value=value;const direct=n.events.get('change')||[];if(direct.length)for(const fn of direct)fn({target:n});else for(const fn of node('program-filters').events.get('change')||[])fn({target:n});}
 async function launch(){const work=[...timers.values()];timers.clear();for(const fn of work)fn();await tick();}
 async function finish(results,index=requests.length-1){requests[index].resolve({results,totalCount:results.length,checkedCount:results.length,complete:true});await tick();}
 return{ready,node,shown,change,launch,finish,requests,writes,saved,location,historyURLs,windowEvents,get cancels(){return cancels;},body:()=>node('program-results').innerHTML,pop(search){location.search=search;windowEvents.get('popstate')?.();}};
}

test('personal finder evaluates reviewed routes only, keeps partial progress stable, and uses shared cross-unit ranking',async()=>{
 const f=fixture();await f.ready();assert(f.node('program-personal').checked);assert.equal(f.node('program-sort').value,'fit');
 assert.equal(f.node('program-personal-status')['aria-busy'],'true');await f.launch();
 assert.deepEqual(f.requests[0].routeIds,['a-quarter','b-semester','partial','unknown']);assert(!f.requests[0].routeIds.includes('confirmation'));
 const before=f.body();f.requests[0].options.onProgress({phase:'candidate',checkedCount:1,totalCount:4,candidate:result('b-semester',{done:9,future:3})});
 assert.equal(f.body(),before,'Candidate progress never reorders or replaces a card being read');assert.match(f.node('program-personal-status').textContent,/1 of 4/);
 await f.finish([result('a-quarter',{done:12,total:180,unit:'quarter'}),result('b-semester',{done:9,future:3}),result('partial',{done:0}),result('unknown',{range:null})]);
 assert.equal(f.shown()[0],'b-semester','A larger normalized degree share wins even when another program has more raw units');
 assert.match(f.body(),/data-personal-earned>9<\/span>/);assert.match(f.body(),/data-personal-in-progress>3<\/strong>/);assert.match(f.body(),/data-personal-university>30<\/span>/);
 assert.match(f.body(),/data-personal-review="b-semester" href="compare-plans.html\?from=courses&amp;degree=b-semester&amp;format=online">Review my plan/);
 assert.match(f.body(),/quarter credits/);assert.equal(f.node('program-personal-status')['aria-busy'],'false');assert.equal(f.writes.length,0);assert.equal(f.saved,JSON.stringify(original));
});

test('personal budget uses the complete remaining-range maximum and never a cheap template, partial range, or missing price',async()=>{
 const f=fixture('?budget=15000');await f.ready();await f.launch();
 await f.finish([result('a-quarter',{done:12,total:180,unit:'quarter',range:{min:3000,max:5000}}),result('b-semester',{done:3,range:{min:15000,max:20000}}),result('partial',{partial:true,range:{min:1,max:2}}),result('unknown',{range:null})]);
 assert.deepEqual(f.shown(),['a-quarter'],'An expensive zero-credit template becomes affordable only from its actual personal estimate');
 assert.match(f.body(),/Estimated remaining cost/);assert.match(f.body(),/data-min="3000" data-max="5000"/);assert.equal(f.node('program-budget-label').textContent,'Remaining planning range up to');
 f.change('program-budget','');await f.launch();
 assert(f.shown().includes('partial'));assert.match(f.body(),/Known remaining charges/);assert.match(f.body(),/Estimate unavailable/);
 assert(!/data-personal-cost[^>]*>\$0/.test(f.body()));assert.equal(f.writes.length,0);
});

test('opting out cancels work, persists in the URL, ignores stale results, and restores template controls',async()=>{
 const f=fixture('?format=online&pace=self-paced&billing=subscription&confirm=0');await f.ready();await f.launch();
 f.change('program-personal',false);const before=f.body();assert(f.cancels>0);assert.equal(new URLSearchParams(f.location.search).get('fit'),'0');assert.equal(f.node('program-sort-fit').disabled,true);
 await f.finish([result('b-semester',{done:99,future:0})]);assert.equal(f.body(),before);assert(!f.body().includes('data-personal-earned'));assert.match(f.body(),/Planning estimate/);
 const reload=fixture(f.location.search);await reload.ready();await reload.launch();assert.equal(reload.node('program-personal').checked,false);assert.equal(reload.requests.length,0);
 assert.equal(new URLSearchParams(reload.location.search).get('billing'),'subscription');assert.equal(f.writes.length,0);
});

test('explicit browsing intent changes only the calculation and no-course visitors retain the original experience',async()=>{
 const f=fixture('?level=bachelor&subject=business&format=campus');await f.ready();await f.launch();
 assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].options.discoveryProfile)),{degreeLevel:'bachelor',field:'business',modality:'campus',classroomImportance:'essential'});
 assert.deepEqual(f.requests[0].routeIds,['a-quarter']);assert.equal(f.saved,JSON.stringify(original));assert.equal(f.writes.length,0);
 const empty=fixture('?fit=1',{hasCourses:false});await empty.ready();await empty.launch();assert.equal(empty.node('program-personal-section').hidden,true);assert.equal(empty.requests.length,0);assert.equal(empty.node('program-sort').value,'');assert.match(empty.body(),/Planning estimate/);
});

test('calculation errors and malformed course storage stay recoverable without invented personal metrics',async()=>{
 const f=fixture();await f.ready();await f.launch();f.requests[0].reject(Object.assign(new Error('Synthetic failure'),{code:'calculation-failed'}));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.node('program-personal-status')['aria-busy'],'false');assert.equal(f.node('program-personal-retry').hidden,false);assert.match(f.node('program-personal-status').textContent,/saved courses and plan are unchanged/);assert(!f.body().includes('data-personal-earned'));assert(f.shown().length>0);assert.equal(f.writes.length,0);
 const malformed=fixture('',{hasCourses:new Error('Unsupported saved record')});await malformed.ready();await malformed.launch();assert.equal(malformed.node('program-personal-section').hidden,false);assert.equal(malformed.node('program-personal').disabled,true);assert.equal(malformed.requests.length,0);assert.equal(malformed.writes.length,0);
});


test('visible All controls clear stale search restrictions without changing saved goals or preferences',async()=>{
 const f=fixture();await f.ready();await f.launch();
 assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].options.discoveryProfile)),{field:'any',degreeLevel:'unsure',modality:'any',classroomImportance:'open'});
 assert(f.requests[0].routeIds.includes('a-quarter'),'A saved online preference cannot silently exclude a campus plan from All formats');
 assert(f.requests[0].routeIds.includes('b-semester'));
 f.pop('?format=campus');await f.launch();
 assert.deepEqual(f.requests[1].routeIds,['a-quarter']);
 assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].options.discoveryProfile)),{field:'any',degreeLevel:'unsure',modality:'campus',classroomImportance:'essential'});
 assert.equal(Object.hasOwn(f.requests[1].options.discoveryProfile,'goal'),false,'Search controls never override a licensed-career goal');
 assert.equal(f.saved,JSON.stringify(original));assert.equal(JSON.parse(f.saved).profile.goal,'teacher');assert.equal(JSON.parse(f.saved).profile.degreeLevel,'master');assert.equal(JSON.parse(f.saved).profile.modality,'online');assert.equal(f.writes.length,0);
});
