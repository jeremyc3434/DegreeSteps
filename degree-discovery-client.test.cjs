const test = require('node:test');
const assert = require('node:assert/strict');
const Client = require('./dist/degree-discovery-client.js');

const KEY = 'degreepath-guide-v3';
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function originalState() {
  return {
    version:3, selectedPathwayId:'my-active-degree',
    profile:{goal:'any-degree', degreeLevel:'bachelor', modality:'online'},
    learning:[
      {id:'finished-original', provider:'Sophia', code:'SOPH-0015', credits:3, creditSystem:'semester', status:'earned', evaluations:[]},
      {id:'saved-original', provider:'Original college', code:'ORIG 101', credits:4, creditSystem:'quarter', status:'saved', privateNote:'Synthetic private record note'}
    ],
    sheet:{notes:{'my-active-degree':{one:'Synthetic private plan note'}}},
    scenarios:{'my-active-degree':{optionSelections:{one:'original-choice'}}},
    whatIf:{selectedIds:['current','saved:untouched'], snapshots:[{id:'untouched',label:'Keep my version'}]}
  };
}
function fixture(overrides={}) {
  let stored = overrides.raw === undefined ? JSON.stringify(originalState()) : overrides.raw;
  const writes = [], requests = [], modelsRequested = [], jobs = [], dependencyCalls = [];
  const routes = [{id:'published-a',modelId:'model-a'}, {id:'published-b',modelId:'model-b'}];
  const catalog = {pathways:[...routes,{id:'directory-only',modelId:'unpublished'}], publicationIndex:{available:true,plans:[{routeIds:routes.map(route=>route.id)}]}};
  const runner = {
    cancelCalls:0, destroyCalls:0,
    cancel(){this.cancelCalls++;}, destroy(){this.destroyCalls++;},
    async run(kind,payload,runtime){jobs.push({kind,payload,runtime});return{routeIds:payload.options.routeIds,results:payload.options.routeIds.map(pathwayId=>({pathwayId,available:true,eligible:true})),complete:true};}
  };
  const config = {
    catalog,
    storage:{getItem(key){assert.equal(key,KEY);return stored;},setItem(...args){writes.push(args);throw Error('Discovery cannot write course records.');},removeItem(...args){writes.push(args);throw Error('Discovery cannot delete course records.');}},
    catalogAPI:{publishedPlans(value){assert.equal(value,catalog);return routes;},async modelsForRoutes(values,options){modelsRequested.push({routes:values,options});return values.map(route=>({id:route.modelId}));}},
    async fetcher(...args){requests.push(args);return{ok:true,async json(){return{source:args[0]};}};},
    async loadDependencies(){dependencyCalls.push(true);},
    runnerFactory(){return runner;}
  };
  Object.assign(config,overrides.config||{});
  return {client:Client.create(config),config,catalog,routes,runner,writes,requests,modelsRequested,jobs,dependencyCalls,raw:()=>stored,replace:value=>{stored=value;}};
}

test('a visitor without course records gets ordinary discovery without dependency loads, data requests or worker work',async()=>{
  for(const raw of [null,JSON.stringify({...originalState(),learning:[]})]){
    const f=fixture({raw});assert.equal(f.client.hasCourses(),false);
    const result=await f.client.run(['published-a']);
    assert.deepEqual(result.results,[]);assert.equal(result.complete,true);
    assert.equal(f.requests.length,0);assert.equal(f.modelsRequested.length,0);assert.equal(f.dependencyCalls.length,0);assert.equal(f.jobs.length,0);assert.deepEqual(f.writes,[]);
    assert.equal(f.raw(),raw);
  }
});

test('only requested published degrees are loaded; private original courses never enter public-data requests or storage writes',async()=>{
  const f=fixture(),before=f.raw();assert.equal(f.client.hasCourses(),true);
  const result=await f.client.run(['published-b','directory-only','published-b',null,'not-listed'],{discoveryProfile:{modality:'campus',degreeLevel:'bachelor'}});
  assert.deepEqual(result.routeIds,['published-b']);
  assert.deepEqual(f.modelsRequested,[{routes:[f.routes[1]],options:{includeLegacy:false,required:true}}]);
  assert.deepEqual(f.requests,[['data/cost-comparisons.json'],['data/plan-estimate-rates.json']]);
  assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].kind,'discovery');
  assert.deepEqual(f.jobs[0].payload.state,JSON.parse(before));
  assert.deepEqual(f.jobs[0].payload.options.discoveryProfile,{modality:'campus',degreeLevel:'bachelor'});
  assert.equal(f.jobs[0].payload.options.publication,f.catalog.publicationIndex);
  assert.deepEqual(f.jobs[0].payload.costs,{source:'data/cost-comparisons.json'});
  assert.deepEqual(f.jobs[0].payload.estimateRates,{source:'data/plan-estimate-rates.json'});
  f.jobs[0].payload.state.learning[1].credits=99;
  assert.equal(f.raw(),before,'even a mutable worker input cannot alter the stored original quantities');
  assert.deepEqual(f.writes,[]);
});

test('an empty or wholly unpublished request does no matching and does not load private input dependencies',async()=>{
  const f=fixture(),before=f.raw();
  for(const ids of [[],['directory-only'],['missing']])assert.deepEqual((await f.client.run(ids)).results,[]);
  assert.equal(f.requests.length,0);assert.equal(f.jobs.length,0);assert.equal(f.dependencyCalls.length,0);assert.equal(f.raw(),before);assert.deepEqual(f.writes,[]);
});

test('a newer search supersedes an older request while lazy dependencies are loading',async()=>{
  const gate=deferred();let count=0;
  const f=fixture({config:{loadDependencies(){return ++count===1?gate.promise:Promise.resolve();}}});
  const old=f.client.run(['published-a']);const rejected=assert.rejects(old,{code:'superseded'});
  const latest=await f.client.run(['published-b']);gate.resolve();await rejected;
  assert.deepEqual(latest.routeIds,['published-b']);assert.equal(f.jobs.length,1);assert.deepEqual(f.jobs[0].payload.options.routeIds,['published-b']);
  assert.deepEqual(f.writes,[]);
});

test('a newer search supersedes delayed model loading without starting an obsolete worker request',async()=>{
  const gate=deferred();const f=fixture();
  f.config.catalogAPI.modelsForRoutes=async routes=>routes[0].id==='published-a'?gate.promise:[{id:'model-b'}];
  const old=f.client.run(['published-a']);const rejected=assert.rejects(old,{code:'superseded'});await nextTurn();
  const latest=await f.client.run(['published-b']);gate.resolve([{id:'model-a'}]);await rejected;
  assert.deepEqual(latest.routeIds,['published-b']);assert.equal(f.jobs.length,1);assert.deepEqual(f.jobs[0].payload.options.routeIds,['published-b']);
  assert.deepEqual(f.writes,[]);
});

test('obsolete worker progress and final replies cannot replace a newer search',async()=>{
  const f=fixture(),pending=[],progress=[];
  f.runner.run=(kind,payload,runtime)=>{const gate=deferred();pending.push({kind,payload,runtime,...gate});return gate.promise;};
  const old=f.client.run(['published-a'],{onProgress:value=>progress.push({request:'old',value})});const rejected=assert.rejects(old,{code:'superseded'});await nextTurn();
  const latest=f.client.run(['published-b'],{onProgress:value=>progress.push({request:'latest',value})});await nextTurn();
  assert.equal(pending.length,2);
  pending[0].runtime.onProgress({checkedCount:1});pending[1].runtime.onProgress({checkedCount:1});
  assert.deepEqual(progress,[{request:'latest',value:{checkedCount:1}}]);
  pending[0].resolve({routeIds:['published-a'],results:[],complete:true});await rejected;
  pending[1].resolve({routeIds:['published-b'],results:[],complete:true});assert.deepEqual((await latest).routeIds,['published-b']);
  assert(f.runner.cancelCalls>=1);assert.deepEqual(f.writes,[]);
});

test('courses changed during matching suppress progress and reject the stale result without overwriting the newer collection',async()=>{
  const f=fixture(),gate=deferred(),progress=[];let runtime;
  f.runner.run=(kind,payload,value)=>{runtime=value;return gate.promise;};
  const request=f.client.run(['published-a'],{onProgress:value=>progress.push(value)});const rejected=assert.rejects(request,{code:'courses-changed'});await nextTurn();
  const changed=JSON.parse(f.raw());changed.learning.push({id:'new-original',provider:'My college',code:'NEW 201',credits:5,creditSystem:'quarter',status:'in-progress'});
  const latest=JSON.stringify(changed);f.replace(latest);runtime.onProgress({checkedCount:1});assert.deepEqual(progress,[]);
  gate.resolve({results:[],complete:true});await rejected;
  assert.equal(f.raw(),latest);assert.deepEqual(f.writes,[]);
});

test('a search captures its course snapshot once before asynchronous loading and rejects a changed collection at completion',async()=>{
  const f=fixture(),dependencyGate=deferred(),workerGate=deferred(),original=f.raw();
  const storage=f.config.storage;let reads=0,payload;
  f.config.storage={...storage,getItem(key){reads++;return storage.getItem(key);}};
  f.config.loadDependencies=()=>{
    assert.equal(reads,1,'the initial course-presence decision uses the captured state instead of rereading storage');
    return dependencyGate.promise;
  };
  f.runner.run=(kind,input)=>{payload=input;return workerGate.promise;};
  const request=f.client.run(['published-a']);const rejected=assert.rejects(request,{code:'courses-changed'});
  assert.equal(reads,1);assert.equal(f.requests.length,0);assert.equal(f.modelsRequested.length,0);
  dependencyGate.resolve();await nextTurn();
  assert.deepEqual(payload.state,JSON.parse(original),'the worker receives the same original snapshot that started the search');
  const newer=JSON.parse(original);newer.profile.goal='teacher';newer.learning[1].credits=5;
  const latest=JSON.stringify(newer);f.replace(latest);
  workerGate.resolve({routeIds:['published-a'],results:[],complete:true});await rejected;
  assert.equal(f.raw(),latest,'a stale result never restores the old career goal or original course amounts');
  assert.deepEqual(f.writes,[]);
});

test('malformed saved collections fail closed and are never replaced or sent to a worker',async()=>{
  const malformed=['not-json',JSON.stringify({version:2,profile:{},learning:[]}),JSON.stringify({version:3,profile:{},learning:{}}),JSON.stringify({version:3,learning:[]}),
    ...[null,[],[{goal:'teacher'}],'teacher',true,42].map(profile=>JSON.stringify({...originalState(),profile}))];
  for(const raw of malformed){
    const f=fixture({raw});assert.throws(()=>f.client.hasCourses(),{code:'invalid-storage'});await assert.rejects(f.client.run(['published-a']),{code:'invalid-storage'});
    assert.equal(f.raw(),raw);assert.deepEqual(f.writes,[]);assert.equal(f.requests.length,0);assert.equal(f.jobs.length,0);
  }
});

test('a failed public-data load can retry with the same original course bank',async()=>{
  let calls=0;
  const custom=fixture({config:{async fetcher(path){calls++;return{ok:calls!==1,async json(){return{source:path};}};}}});
  const snapshot=custom.raw();await assert.rejects(custom.client.run(['published-a']),{code:'load-failed'});assert.equal(custom.jobs.length,0);
  assert.deepEqual((await custom.client.run(['published-b'])).routeIds,['published-b']);assert.equal(calls,4);
  assert.equal(custom.raw(),snapshot);assert.deepEqual(custom.writes,[]);
});

test('blocked browser storage produces a recoverable error without data requests or replacement records',async()=>{
  const f=fixture({config:{storage:{getItem(){throw Error('Storage blocked');},setItem(){assert.fail('Do not replace inaccessible records');}}}});
  assert.throws(()=>f.client.hasCourses(),{code:'storage-unavailable'});
  await assert.rejects(f.client.run(['published-a']),{code:'storage-unavailable'});
  assert.equal(f.requests.length,0);assert.equal(f.jobs.length,0);
});

test('destroy cancels work and prevents future private calculations',async()=>{
  const f=fixture();await f.client.run(['published-a']);f.client.destroy();
  assert.equal(f.runner.destroyCalls,1);await assert.rejects(f.client.run(['published-b']),{code:'disposed'});assert.equal(f.jobs.length,1);assert.deepEqual(f.writes,[]);
});
