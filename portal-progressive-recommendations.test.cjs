const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js'),copy=value=>JSON.parse(JSON.stringify(value)),KEY='degreepath-guide-v3',tick=()=>new Promise(resolve=>setImmediate(resolve));

// A small DOM tree exercises the actual incremental DOM operations, including
// node identity and focus. It intentionally provides no browser or paid service.
function dom(){
 const document={activeElement:null};
 class Node{
  constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.parentElement=null;this.hidden=false;this.value=attrs.value||'';this.max=attrs.max||'';this.classList={toggle(){},add(){},remove(){}};this.dataset={};for(const [name,value]of Object.entries(attrs))if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
  get id(){return this.attrs.id||'';}
  append(child){child.parentElement=this;this.children.push(child);}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  get innerHTML(){return this.children.map(child=>child.tagName==='#TEXT'?child.text:'<'+child.tagName.toLowerCase()+Object.entries(child.attrs).map(([k,v])=>' '+k+'="'+v+'"').join('')+'>'+child.innerHTML+'</'+child.tagName.toLowerCase()+'>').join('');}
  set innerHTML(value){if(this.contains(document.activeElement))document.activeElement=document.body;this.children=[];parse(this,String(value));}
  get textContent(){return this.tagName==='#TEXT'?this.text:this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.children=[];const child=new Node('#text');child.text=String(value);this.append(child);}
  insertAdjacentHTML(where,html){assert.equal(where,'beforeend');parse(this,html);}
  matches(selector){if(selector.startsWith('[')){const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return Boolean(match&&Object.hasOwn(this.attrs,match[1])&&(match[2]===undefined||this.attrs[match[1]]===match[2]));}if(selector.startsWith('.'))return(this.attrs.class||'').split(/\s+/).includes(selector.slice(1));return this.tagName===selector.toUpperCase();}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  setAttribute(name,value){this.attrs[name]=String(value);}
  focus(){document.activeElement=this;}
 }
 function parse(parent,html){const stack=[parent];for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(token.startsWith('<')){const name=token.match(/^<([a-zA-Z0-9-]+)/)?.[1];if(!name)continue;const attrs={};for(const match of token.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g))attrs[match[1]]=match[2];const child=new Node(name,attrs);stack.at(-1).append(child);if(!['input','br','hr','img','meta','link'].includes(name)&&!token.endsWith('/>'))stack.push(child);}else{const child=new Node('#text');child.text=token;stack.at(-1).append(child);}}}
 document.body=new Node('body');document.activeElement=document.body;document.getElementById=id=>[document.body,...document.body.querySelectorAll('[id]')].find(node=>node.id===id)||null;document.querySelectorAll=selector=>document.body.querySelectorAll(selector);document.querySelector=selector=>document.body.querySelector(selector);
 for(const id of ['portal-content','portal-loading','portal-savings','portal-home-link','portal-saved','portal-account-link'])document.body.append(new Node('div',{id}));
 return document;
}
function data(){
 const routes=[['alpha','First checked degree'],['beta','Second checked degree'],['gamma','Third checked degree'],['unpriced','Unpriced fourth degree']].map(([id,title])=>({id,modelId:id,title,school:'Synthetic University',level:'bachelor',field:'general',fields:['general'],goals:['any-degree'],modalities:['online']}));
 const models=routes.map(route=>({id:route.id,title:route.title,school:route.school,totalCredits:3,creditSystem:'semester',sources:[],requirements:[{id:'capstone',title:'Capstone',credits:3,category:'major',options:[{id:'capstone',provider:'University',title:'Capstone',credits:3}]}]}));
 const registry={models:routes.map(route=>({id:route.modelId,routeIds:[route.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}))};
 const publicationIndex={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'2'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:routes.map(route=>({modelId:route.modelId,routeIds:[route.id],level:Catalog.publicationLevel(route.level),publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(models.find(model=>model.id===route.modelId),route.level)}))};
 const catalog=Catalog.attachPublicationIndex({pathways:routes,curriculumRegistry:registry},publicationIndex,registry);
 let state=Journey.initialize(null,null,catalog);state=Journey.applyAnswer(state,'start','explore',catalog);Object.assign(state.profile,{goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'online',priority:'cost'});state.journey.step='routes';state.learning=[{id:'private-record',provider:'College',code:'ENG1',title:'Private original course',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];state.sheet.notes={private:'Keep private'};
 return{state,catalog,models};
}
const summary=(extra={})=>({creditSystem:'semester',mappedExternalCredits:3,remainingCost:null,estimatedBaseCost:1200,universityTuitionRemaining:1200,estimatedWeeks:10,collectionFitCredits:3,...extra});
function fixture({actualBoot=false}={}){
 const d=data(),document=dom(),handlers=new Map(),storage=new Map([[KEY,JSON.stringify(d.state)]]),jobs=[];let writes=0,solves=0,cancels=0,recommendations=0,sessions=0;
 document.addEventListener=(type,fn)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);};
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document,location:{pathname:'/portal.html',search:'',replace(){},assign(){}},history:{replaceState(){}},navigator:{},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){writes++;storage.set(key,value);}},CustomEvent:class{},setTimeout(){},clearTimeout(){},scrollTo(){},dispatchEvent(){},addEventListener(type,fn){if(!handlers.has('window:'+type))handlers.set('window:'+type,[]);handlers.get('window:'+type).push(fn);},fetch:async url=>({ok:true,json:async()=>url==='data/pathways.json'?copy(d.catalog):{entries:[]}}),DegreeAccount:{session(){sessions++;return Promise.resolve({user:{id:'synthetic'}});}},__fixture:JSON.stringify(d),__ordinaryRenders:0};context.window=context;vm.createContext(context);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});}
 context.DegreeAccount={session(){sessions++;return Promise.resolve({user:{id:'synthetic'}});}};
 const recommend=context.DegreeJourney.recommend;
 if(actualBoot)context.DegreeProgramCatalog={...context.DegreeProgramCatalog,load:async()=>copy(d.catalog),loadModels:async()=>copy(d.models)};
 context.DegreeJourney={...context.DegreeJourney,recommend(state,catalog,models){recommendations++;assert.equal(state.learning.length,0,'Main-thread descriptors must exclude the original course inventory.');assert.equal(models.length,0,'Main-thread descriptors must not receive solver models.');return recommend(state,catalog,models);},buildDraft(){solves++;throw Error('A progress render must not solve a plan on the main thread.');}};
 context.DegreeComparisonRunner={create:()=>({cancel(){cancels++;},run(kind,payload,runtime){assert.equal(kind,'build');return new Promise((resolve,reject)=>jobs.push({payload,resolve,reject,emit:runtime.onProgress}));}})};
 const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),setup=actualBoot?`const ordinaryRender=render;render=function(...args){window.__ordinaryRenders++;return ordinaryRender(...args);};`:`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;render=function(){if(degreePreview)$('portal-content').innerHTML='<section id="preview">Preview '+esc(degreePreview.route.title)+'</section>';else renderQuestion();};`,hooks=setup+`window.__portal={prepare:prepareRecommendations,html:routesBody,view:()=>recommendationView,pending:()=>recommendationPending,progress:()=>recommendationProgress,cache:()=>recommendationCache,state:()=>state,action,preview:id=>previewDegree(catalog.pathways.find(route=>route.id===id)),refresh:refreshRecommendations,cancel:cancelRecommendations};`;
 const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+(actualBoot?'window.__boot=boot();':'')+'\n}());');assert.notEqual(instrumented,source);vm.runInContext(instrumented,context,{filename:'portal.js'});
 const api=context.__portal,ids=d.catalog.pathways.map(route=>'route:'+route.id);
 const started=job=>job.emit({phase:'started',complete:false,recommendation:null,matchingRouteIds:ids,matchingRouteCount:ids.length});
 const candidate=(job,id,index,extra={})=>job.emit({phase:'candidate',complete:false,recommendation:null,matchingRouteCount:ids.length,checkedCount:index,candidate:{id:'route:'+id,pathwayId:id,available:true,eligible:true,reason:null,summary:summary(),...extra}});
 const final=label=>({label,recommendation:null,rankBasis:'Available estimates are ordered after every matching plan is checked.',rankingScope:{orderedRouteIds:ids,orderingMetric:'estimatedBaseCost',unestimatedCount:1},scenarios:d.catalog.pathways.map(route=>({id:'route:'+route.id,pathwayId:route.id,summary:summary(route.id==='unpriced'?{estimatedBaseCost:null}: {})})),rankedCandidates:d.catalog.pathways.map(route=>({id:'route:'+route.id,pathwayId:route.id,available:true,eligible:true,summary:summary()}))});
 return{api,jobs,document,started,candidate,final,boot:()=>context.__boot,ordinaryRenders:()=>context.__ordinaryRenders,sessions:()=>sessions,writes:()=>writes,solves:()=>solves,recommendations:()=>recommendations,cancels:()=>cancels,stored:()=>storage.has(KEY)?JSON.parse(storage.get(KEY)):null,raw:()=>storage.get(KEY),setStored:value=>storage.set(KEY,JSON.stringify(value)),setRaw:value=>value===null?storage.delete(KEY):storage.set(KEY,value),async event(type,event={}){for(const fn of handlers.get('window:'+type)||[])fn(event);await tick();}};
}

test('three validated plans appear before completion with a count bar and every matching name retained',async()=>{
 const f=fixture(),original=f.stored(),pending=f.api.prepare();await tick();const job=f.jobs[0];assert(job);f.started(job);
 assert.equal(f.document.getElementById('portal-comparison-progress').value,0);assert.doesNotMatch(f.api.html(),/No course plan matches/);
 const checkButton=f.document.querySelectorAll('[data-degree-preview]').find(node=>node.dataset.degreePreview==='unpriced');checkButton.focus();
 for(const [index,id]of ['alpha','beta','gamma'].entries())f.candidate(job,id,index+1);
 const html=f.api.html();assert.equal(f.api.pending(),true);assert.equal(f.api.view(),null);assert.equal(f.api.cache().size,0);assert.equal(f.document.getElementById('portal-ready-plans').querySelectorAll('.portal-route-card').length,3);assert.equal(f.document.getElementById('portal-comparison-progress').value,3);assert.equal(f.document.getElementById('portal-comparison-progress').max,4);assert.match(f.document.getElementById('portal-comparison-status').textContent,/Checked 3 of 4/);
 for(const name of ['First checked degree','Second checked degree','Third checked degree','Unpriced fourth degree'])assert.match(html,new RegExp(name));
 assert.match(html,/All matching plans \(4\)/);assert.match(html,/order may change/);assert.doesNotMatch(html,/cheapest|best plan|winner|recommended|comparison complete/i);assert.match(html,/3 proposed transfer credits/);assert.equal(f.document.activeElement,checkButton);assert.equal(f.document.querySelectorAll('[data-degree-preview]').find(node=>node.dataset.degreePreview==='unpriced'),checkButton);assert.equal(f.solves(),0);assert.equal(f.writes(),0);assert.deepEqual(f.stored(),original);
 f.candidate(job,'unpriced',4,{summary:summary({estimatedBaseCost:null,remainingCost:null})});assert.equal(f.document.getElementById('portal-ready-plans').querySelectorAll('.portal-route-card').length,3);assert.equal(f.api.cache().size,0);
 job.resolve(f.final('complete'));await pending;assert.equal(f.api.pending(),false);assert.equal(f.api.progress(),null);assert.equal(f.api.cache().size,1);assert.equal(f.api.view().label,'complete');assert.equal(f.document.activeElement.dataset.degreePreview,'unpriced');assert.equal(f.solves(),0);assert.equal(f.writes(),0);
 const calls=f.jobs.length;await f.api.prepare();assert.equal(f.jobs.length,calls);assert(f.recommendations()>0);
});

test('malformed, unavailable, and ineligible packets never become ready cards',async()=>{
 const f=fixture(),pending=f.api.prepare();await tick();const job=f.jobs[0];f.started(job);
 job.emit(null);job.emit({phase:'candidate',checkedCount:1,matchingRouteCount:4,candidate:{id:'route:intruder',pathwayId:'intruder',available:true,eligible:true,summary:summary()}});f.candidate(job,'alpha',1,{summary:null});assert.equal(f.api.progress().checked,0);
 f.candidate(job,'alpha',1,{available:false,summary:null,reason:'Academic credit rules need review.'});f.candidate(job,'beta',2,{eligible:false});assert.equal(f.api.progress().checked,2);assert.equal(f.document.getElementById('portal-ready-plans').querySelectorAll('.portal-route-card').length,0);assert.match(f.api.html(),/Academic credit rules need review/);assert.doesNotMatch(f.api.html(),/No course plan matches/);
 f.candidate(job,'gamma',3,{summary:summary({creditSystem:'competency-unit'})});assert.match(f.api.html(),/3 proposed transfer competency units/);const html=f.api.html();f.candidate(job,'gamma',4);assert.equal(f.api.html(),html);
 job.reject(Error('Synthetic comparison failure'));await pending;assert.equal(f.api.cache().size,0);assert.equal(f.api.progress(),null);assert.match(f.api.html(),/Try comparison again/);assert.doesNotMatch(f.api.html(),/cheapest|best plan|winner|recommended/i);assert.equal(f.solves(),0);assert.equal(f.writes(),0);
});

test('preview, Back, and cancellation ignore late progress and final results',async()=>{
 for(const navigation of ['preview','back','cancel']){
  const f=fixture(),pending=f.api.prepare();await tick();const job=f.jobs[0];f.started(job);f.candidate(job,'alpha',1);
  if(navigation==='preview')await f.api.preview('alpha');else if(navigation==='back')await f.api.action('back');else f.api.cancel();
  const html=f.document.getElementById('portal-content').innerHTML;assert.equal(f.api.pending(),false);assert.equal(f.api.progress(),null);const cancellations=f.cancels();assert(cancellations>0);
  f.candidate(job,'beta',2);job.resolve(f.final('late'));await pending;assert.equal(f.api.view(),null);assert.equal(f.api.cache().size,0);assert.equal(f.document.getElementById('portal-content').innerHTML,html);
 }
});

test('course edits in another tab immediately clear partials and restart pending work',async()=>{
 for(const event of ['storage','focus']){
  const f=fixture(),pending=f.api.prepare();await tick();const first=f.jobs[0];f.started(first);f.candidate(first,'alpha',1);const previous=f.api.progress();
  const saved=f.stored();saved.learning[0].title='Updated original course';f.setStored(saved);await f.event(event,event==='storage'?{key:KEY}:{});
  assert.equal(f.jobs.length,2);assert.notEqual(f.api.progress(),previous);assert.equal(f.api.progress().checked,0);assert.equal(f.document.getElementById('portal-ready-plans').querySelectorAll('.portal-route-card').length,0);assert.equal(f.jobs[1].payload.state.learning[0].title,'Updated original course');assert.equal(f.api.cache().size,0);
  f.candidate(first,'beta',2);first.resolve(f.final('stale'));await pending;assert.equal(f.api.view(),null);assert.equal(f.api.pending(),true);assert.equal(f.api.progress().checked,0);
  const second=f.jobs[1];f.started(second);f.candidate(second,'alpha',1);second.resolve(f.final('fresh'));await tick();assert.equal(f.api.view().label,'fresh');assert.equal(f.api.cache().size,1);assert.equal(f.writes(),0);assert.equal(f.solves(),0);
 }
});

test('missing or corrupt storage clears an in-progress comparison immediately',async()=>{
 for(const raw of [null,'broken JSON',JSON.stringify({version:3,profile:{}})]){
  const f=fixture(),pending=f.api.prepare();await tick();const job=f.jobs[0];f.started(job);f.candidate(job,'alpha',1);f.setRaw(raw);await f.event('storage',{key:KEY});
  assert.equal(f.api.pending(),false);assert.equal(f.api.progress(),null);assert.equal(f.api.view(),null);assert.equal(f.api.cache().size,0);assert.equal(f.document.getElementById('portal-ready-plans'),null);assert.match(f.api.html(),/earlier comparison has been cleared/);
  f.candidate(job,'beta',2);job.resolve(f.final('late'));await pending;assert.equal(f.api.view(),null);assert.equal(f.writes(),0);
 }
});

test('changed imported requirements restart pending work and cache only the fresh final result',async()=>{
 const f=fixture(),pending=f.api.prepare();await tick();const first=f.jobs[0];f.started(first);f.candidate(first,'alpha',1);assert.equal(f.api.cache().size,0);
 const saved=f.stored();saved.sourceCurricula=[{status:'invalid-test-import',programId:'changed-original-source'}];f.setStored(saved);await f.event('storage',{key:KEY});
 assert.equal(f.jobs.length,2);assert.equal(f.api.progress().checked,0);assert.equal(f.document.getElementById('portal-ready-plans').querySelectorAll('.portal-route-card').length,0);assert.deepEqual(copy(f.jobs[1].payload.state.sourceCurricula),saved.sourceCurricula);assert.equal(f.api.cache().size,0);
 f.candidate(first,'beta',2);first.resolve(f.final('old-source'));await pending;assert.equal(f.api.view(),null);assert.equal(f.api.progress().checked,0);assert.equal(f.api.cache().size,0);
 const second=f.jobs[1];f.started(second);f.candidate(second,'gamma',1);assert.equal(f.api.cache().size,0);second.resolve(f.final('updated-source'));await tick();
 assert.equal(f.api.view().label,'updated-source');assert.equal(f.api.cache().size,1);const [cacheKey,cached]=[...f.api.cache().entries()][0];assert.deepEqual(JSON.parse(cacheKey).sourceCurricula,saved.sourceCurricula);assert.equal(cached.label,'updated-source');assert.equal(f.solves(),0);assert.equal(f.writes(),0);
});

test('boot starts the account header before comparison completes and never saves after a search',async()=>{
 for(const raw of [null,'broken JSON']){
  const f=fixture({actualBoot:true});let bootFinished=false;f.boot().then(()=>{bootFinished=true;});await tick();
  assert.equal(bootFinished,true,'Boot must finish while comparison work is still pending.');assert.equal(f.sessions(),1);assert.equal(f.document.getElementById('portal-account-link').textContent,'My account');assert.equal(f.ordinaryRenders(),0);assert.equal(f.writes(),0);assert.equal(f.jobs.length,1);
  const job=f.jobs[0];f.started(job);f.candidate(job,'alpha',1);f.setRaw(raw);await f.event('storage',{key:KEY});
  assert.equal(f.api.pending(),false);assert.equal(f.api.progress(),null);assert.match(f.api.html(),/earlier comparison has been cleared/);
  job.resolve(f.final('late boot result'));await tick();
  assert.equal(f.api.view(),null);assert.equal(f.api.cache().size,0);assert.equal(f.ordinaryRenders(),0);assert.equal(f.writes(),0);assert.equal(f.raw(),raw===null?undefined:raw,'Completion must not recreate or replace missing/corrupt saved storage.');
 }
});
