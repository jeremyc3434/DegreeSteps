'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('dist/growth-metrics.js','utf8'),choice='degreesteps-growth-choice-v1';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({path='/',dnt='0',gpc=false,storedChoice,blockedStorage=false,visibility='visible',plans=[],failFetch=false,planIndex=['liberty-business-residential','tesu-bsba-accounting']}={}){
 const calls=[],reads=[],writes=[],handlers=new Map(),observers=[],indexReads=[];
 const toggle={checked:false,disabled:false,addEventListener(name,fn){this.handler=fn;}},status={textContent:''};
 const document={readyState:'complete',visibilityState:visibility,body:{dataset:{}},querySelectorAll(selector){return selector==='[data-growth-toggle]'?[toggle]:selector==='[data-growth-status]'?[status]:selector==='[data-growth-plan]'?plans:[];},addEventListener(name,fn){handlers.set('document:'+name,fn);}};
 Object.defineProperty(document,'referrer',{get(){throw Error('Referrer must never be read');}});Object.defineProperty(document,'cookie',{get(){throw Error('Cookies must never be read');}});
 const location={pathname:path};Object.defineProperty(location,'search',{get(){throw Error('Private query values must never be read');}});
 const context={document,location,navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},localStorage:{getItem(key){reads.push(key);if(blockedStorage)throw Error('Unavailable');return key===choice?storedChoice:JSON.stringify({transcript:'PRIVATE STUDENT TRANSCRIPT'});},setItem(key,value){writes.push([key,value]);}},fetch(url,options){if(failFetch)throw Error('Offline');if(url==='/data/plan-library-index.json'){indexReads.push(options);return planIndex?Promise.resolve({ok:true,json:async()=>({plans:Object.fromEntries(planIndex.map(id=>[id,{}]))})}):Promise.reject(Error('Unavailable'));}calls.push({url,options,payload:JSON.parse(options.body)});return Promise.resolve({status:204});},addEventListener(name,fn){handlers.set(name,fn);},IntersectionObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}}};context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(code,context);
 return{api:context.DegreeGrowth,calls,reads,writes,document,handlers,observers,toggle,status,indexReads,dispatch(detail){handlers.get('DegreeSteps:growth')?.({detail});},click(target){handlers.get('document:click')?.({target});}};
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

test('actual visible public plans produce one preview event, while a hidden tab, malformed id or plan outside the public index does not',async()=>{
 const plan={dataset:{growthPlan:'liberty-business-residential'},hidden:false},malformed={dataset:{growthPlan:'Private draft/1'},hidden:false},unknown={dataset:{growthPlan:'private-draft-id'},hidden:false};
 const f=fixture({path:'/degree-plans/liberty-business-residential/',visibility:'hidden',plans:[plan,malformed,unknown]});assert.equal(f.observers.length,0);assert.equal(f.calls.filter(c=>c.payload.event==='plan_previewed').length,0);
 f.document.visibilityState='visible';f.handlers.get('document:visibilitychange')();assert.equal(f.observers.length,2);f.observers[0].callback([{isIntersecting:false}]);assert.equal(f.calls.length,1);f.observers[0].callback([{isIntersecting:true}]);f.observers[1].callback([{isIntersecting:true}]);await settle();assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.planId,'liberty-business-residential');assert.equal(f.observers[0].disconnected,true);
 assert.equal(f.indexReads.length,1,'The public plan index is read once, only because a plan was named');assert.equal(f.indexReads[0].credentials,'omit');
 f.handlers.get('document:visibilitychange')();assert.equal(f.observers.length,2);assert.equal(f.calls.length,2);
});

test('pages without a plan never read the plan index, and an unreadable index keeps the event without its plan',async()=>{
 const f=fixture({path:'/guides/x/'});f.dispatch({event:'finder_used',context:'workspace'});await settle();assert.equal(f.indexReads.length,0);
 const offline=fixture({path:'/plan.html',planIndex:null});offline.dispatch({event:'plan_built',context:'workspace',planId:'liberty-business-residential'});await settle();assert.deepEqual(offline.calls.map(c=>c.payload),[{event:'plan_built',context:'workspace'}]);
});

test('funnel v2 events send only fixed details: an allowlisted provider for provider_click and open/copy for school_email',async()=>{
 const f=fixture({path:'/plan.html'});
 for(const event of['finder_used','guided_started','guided_results','credits_worth_used','share_link_copied'])assert.equal(f.api.track(event,'workspace'),true,event);
 assert(f.api.events.includes('guided_quiz_started'),'the quiz opening is an allowed browser event');
 assert.equal(f.api.track('plan_built','workspace',{planId:'tesu-bsba-accounting'}),true);
 assert.equal(f.api.track('provider_click','workspace',{provider:'Sophia'}),true);assert.equal(f.api.track('provider_click','workspace',{provider:'sophia.org/course?ref=x'}),false);assert.equal(f.api.track('provider_click','workspace'),false);
 assert.equal(f.api.track('school_email','workspace',{action:'open'}),true);assert.equal(f.api.track('school_email','workspace',{action:'copy'}),true);assert.equal(f.api.track('school_email','workspace',{action:'send'}),false);assert.equal(f.api.track('school_email','workspace'),false);
 assert.equal(f.api.track('finder_used','workspace',{provider:'Sophia'}),false);assert.equal(f.api.track('guided_started','workspace',{action:'open'}),false);
 f.dispatch({event:'school_email',context:'workspace',action:'copy',email:'student@example.com'});
 await settle();
 assert.deepEqual(f.calls.map(c=>c.payload),[{event:'finder_used',context:'workspace'},{event:'guided_started',context:'workspace'},{event:'guided_results',context:'workspace'},{event:'credits_worth_used',context:'workspace'},{event:'share_link_copied',context:'workspace'},{event:'provider_click',context:'workspace',provider:'Sophia'},{event:'school_email',context:'workspace',action:'open'},{event:'school_email',context:'workspace',action:'copy'},{event:'plan_built',context:'workspace',planId:'tesu-bsba-accounting'}]);
 assert(f.calls.every(c=>c.options.keepalive===true&&c.options.credentials==='omit'));
});

test('clicks on outbound provider links count the fixed provider name only, and transfer pages count a transfer view',()=>{
 const f=fixture({path:'/transfer/sophia/eng-101/'});assert.deepEqual(f.calls.map(c=>c.payload),[{event:'landing_view',context:'transfer'},{event:'transfer_page_view',context:'transfer'}]);
 const link=attr=>({closest:selector=>selector==='a[data-outbound-provider]'?{getAttribute:name=>name==='data-outbound-provider'?attr:null,href:'https://sophia.org/private?student=1'}:null});
 f.click(link('Sophia'));f.click(link('Sophia'));f.click(link('Unlisted Academy'));f.click({closest:()=>null});
 assert.deepEqual(f.calls.slice(2).map(c=>c.payload),[{event:'provider_click',context:'transfer',provider:'Sophia'},{event:'provider_click',context:'transfer',provider:'other'}]);
 assert(!JSON.stringify(f.calls).includes('student=1'));
});

test('action hooks accept only known public facts, deduplicate in memory, and never retry a failed request',()=>{
 const f=fixture({path:'/plan.html'});assert.equal(f.calls.length,0);
 f.dispatch({event:'account_plan_saved',context:'workspace',email:'student@example.com'});f.dispatch({event:'course_saved',context:'workspace',planId:'private-transcript'});assert.equal(f.calls.length,0);
 f.dispatch({event:'account_plan_saved',context:'workspace'});f.dispatch({event:'account_plan_saved',context:'workspace'});assert.equal(f.calls.length,1);
 assert.equal(f.api.track('unknown','workspace'),false);assert.equal(f.api.track('plan_started','https://private.example'),false);
 const offline=fixture({path:'/plan.html',failFetch:true});assert.equal(offline.api.track('plan_started','workspace'),true);assert.equal(offline.api.track('plan_started','workspace'),false);
});

test('revenue-feature events: school_inquiry sends only action submitted, plan_review_request sends no detail',()=>{
 const f=fixture({path:'/plan.html'});f.calls.length=0;
 assert.equal(f.api.track('school_inquiry','workspace',{action:'open'}),false);assert.equal(f.api.track('school_inquiry','workspace'),false);
 assert.equal(f.api.track('plan_review_request','article',{action:'submitted'}),false);
 assert.equal(f.api.track('school_inquiry','workspace',{action:'submitted'}),true);assert.equal(f.api.track('plan_review_request','article'),true);
 assert.deepEqual(f.calls.map(call=>call.payload),[{event:'school_inquiry',context:'workspace',action:'submitted'},{event:'plan_review_request',context:'article'}]);
});
