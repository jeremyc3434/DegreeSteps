'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('dist/growth-metrics.js','utf8'),choice='degreesteps-growth-choice-v1';
function fixture({path='/',dnt='0',gpc=false,storedChoice,blockedStorage=false,visibility='visible',plans=[],failFetch=false}={}){
 const calls=[],reads=[],writes=[],handlers=new Map(),observers=[];
 const toggle={checked:false,disabled:false,addEventListener(name,fn){this.handler=fn;}},status={textContent:''};
 const document={readyState:'complete',visibilityState:visibility,body:{dataset:{}},querySelectorAll(selector){return selector==='[data-growth-toggle]'?[toggle]:selector==='[data-growth-status]'?[status]:selector==='[data-growth-plan]'?plans:[];},addEventListener(name,fn){handlers.set('document:'+name,fn);}};
 Object.defineProperty(document,'referrer',{get(){throw Error('Referrer must never be read');}});Object.defineProperty(document,'cookie',{get(){throw Error('Cookies must never be read');}});
 const location={pathname:path};Object.defineProperty(location,'search',{get(){throw Error('Private query values must never be read');}});
 const context={document,location,navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},localStorage:{getItem(key){reads.push(key);if(blockedStorage)throw Error('Unavailable');return key===choice?storedChoice:JSON.stringify({transcript:'PRIVATE STUDENT TRANSCRIPT'});},setItem(key,value){writes.push([key,value]);}},fetch(url,options){if(failFetch)throw Error('Offline');calls.push({url,options,payload:JSON.parse(options.body)});return Promise.resolve({status:204});},addEventListener(name,fn){handlers.set(name,fn);},IntersectionObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}}};context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(code,context);
 return{api:context.DegreeGrowth,calls,reads,writes,document,handlers,observers,toggle,status,dispatch(detail){handlers.get('DegreeSteps:growth')?.({detail});}};
}

test('public page measurement sends only bounded event facts without identifiers, private storage or query/referrer access',()=>{
 const f=fixture({path:'/blog/old-credits/'});assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].payload,{event:'landing_view',context:'article'});assert.equal(f.calls[0].url,'/api/growth/events');assert.equal(f.calls[0].options.credentials,'omit');assert.equal(f.calls[0].options.referrerPolicy,'no-referrer');assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.headers['X-Growth-Request'],'1');assert(f.reads.every(key=>key===choice));assert.deepEqual(f.writes,[]);
 assert.equal(f.api.track('landing_view','article'),false);assert.equal(f.calls.length,1);
});

test('DNT, GPC, a saved opt-out and inaccessible storage prevent optional measurement',()=>{
 for(const options of[{dnt:'1'},{gpc:true},{storedChoice:'off'},{blockedStorage:true}]){
  const f=fixture(options);assert.equal(f.calls.length,0);assert.equal(f.api.isEnabled(),false);assert.equal(f.api.track('course_saved','workspace'),false);
 }
 const f=fixture({gpc:true});assert.equal(f.api.setEnabled(true),false);assert.equal(f.toggle.disabled,true);assert.match(f.status.textContent,/browser privacy signal/);
});

test('the privacy control changes only its anonymous measurement preference and never uploads existing student records',()=>{
 const f=fixture({storedChoice:'off'});assert.equal(f.calls.length,0);assert.equal(f.api.setEnabled(true),true);assert.deepEqual(f.writes,[[choice,'on']]);
 f.dispatch({event:'course_saved',context:'workspace'});assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].payload,{event:'course_saved',context:'workspace'});
 assert.equal(f.api.setEnabled(false),false);assert.deepEqual(f.writes[1],[choice,'off']);f.dispatch({event:'account_plan_saved',context:'workspace'});assert.equal(f.calls.length,1);
});

test('actual visible public plans produce one preview event, while a hidden tab or unknown plan does not',()=>{
 const plan={dataset:{growthPlan:'liberty-business-residential'},hidden:false},unknown={dataset:{growthPlan:'private-draft-id'},hidden:false};
 const f=fixture({path:'/degree-plans/liberty-business-residential/',visibility:'hidden',plans:[plan,unknown]});assert.equal(f.observers.length,0);assert.equal(f.calls.filter(c=>c.payload.event==='plan_previewed').length,0);
 f.document.visibilityState='visible';f.handlers.get('document:visibilitychange')();assert.equal(f.observers.length,1);f.observers[0].callback([{isIntersecting:false}]);assert.equal(f.calls.length,1);f.observers[0].callback([{isIntersecting:true}]);assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.planId,'liberty-business-residential');assert.equal(f.observers[0].disconnected,true);
 f.handlers.get('document:visibilitychange')();assert.equal(f.observers.length,1);assert.equal(f.calls.length,2);
});

test('action hooks accept only known public facts, deduplicate in memory, and never retry a failed request',()=>{
 const f=fixture({path:'/plan.html'});assert.equal(f.calls.length,0);
 f.dispatch({event:'account_plan_saved',context:'workspace',email:'student@example.com'});f.dispatch({event:'course_saved',context:'workspace',planId:'private-transcript'});assert.equal(f.calls.length,0);
 f.dispatch({event:'account_plan_saved',context:'workspace'});f.dispatch({event:'account_plan_saved',context:'workspace'});assert.equal(f.calls.length,1);
 assert.equal(f.api.track('unknown','workspace'),false);assert.equal(f.api.track('plan_started','https://private.example'),false);
 const offline=fixture({path:'/plan.html',failFetch:true});assert.equal(offline.api.track('plan_started','workspace'),true);assert.equal(offline.api.track('plan_started','workspace'),false);
});
