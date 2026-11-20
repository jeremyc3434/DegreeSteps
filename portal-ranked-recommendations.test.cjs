const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Journey=require('./dist/journey-engine.js'),Comparison=require('./dist/plan-comparison-engine.js'),Catalog=require('./dist/program-catalog.js');
const copy=value=>JSON.parse(JSON.stringify(value)),KEY='degreepath-guide-v3';
function data(){
 const source={id:'catalog',title:'Synthetic university catalog',url:'https://example.edu/catalog'},opt=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['catalog']});
 const base={id:'course-fit',school:'Test University',title:'Course-fit degree',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:3,sources:[source],pricing:{model:'per-credit',amount:500,currency:'USD',sourceUrl:'https://example.edu/tuition'},requirements:[{id:'writing',code:'writing',title:'Writing',credits:3,category:'general',options:[opt('Sophia','S1')]},{id:'capstone',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[opt('University','CAP')]}]};
 const models=[base];
 for(const [id,title,rate] of [['cheap','Lower tuition',50],['fast','Faster study',600],['unknown','Unpriced option',null]]){const p=copy(base);p.id=id;p.title=title;if(rate===null)delete p.pricing;else p.pricing.amount=rate;if(id==='cheap')p.requirements[0].options=[opt('University','UNI101')];models.push(p);}
 const pathways=models.map(model=>({id:model.id,modelId:model.id,school:model.school,title:model.title,level:'bachelor',field:'general',fields:['general'],goals:['any-degree','career-growth','change-career'],modalities:['online'],paceModel:model.id==='course-fit'?'self-paced':'term-based'}));
 const registry={models:models.map(model=>({id:model.id,routeIds:[model.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}))};
 const publicationIndex={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'2'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:pathways.map(route=>({modelId:route.modelId,routeIds:[route.id],level:Catalog.publicationLevel(route.level),publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(models.find(model=>model.id===route.modelId),route.level)}))};
 const catalog=Catalog.attachPublicationIndex({pathways,curriculumRegistry:registry},publicationIndex,registry);
 let state=Journey.initialize(null,null,catalog);state=Journey.applyAnswer(state,'start','explore',catalog);Object.assign(state.profile,{goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'online',priority:'cost'});state.journey.step='routes';
 state.learning=[{id:'interest',provider:'Sophia',code:'S1',title:'Writing',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}];state.scenarios={};
 for(const p of models)state.scenarios[p.id]={providers:['Sophia'],allowConditional:true,sophiaWeeks:1,termWeeks:p.id==='fast'?1:10,termCredits:p.id==='fast'?6:3};
 state.sheet.notes={private:'My private note'};state.whatIf={selectedIds:['route:unknown'],priority:'collection'};
 return{state,catalog,models};
}
function fixture({initial,stored,fetcher,runner,withoutPublication=false}={}){
 const d=data();if(withoutPublication)delete d.catalog.publicationIndex;initial=copy(initial||d.state);stored=copy(stored||initial);const storage=new Map([[KEY,JSON.stringify(stored)]]),nodes=new Map(),handlers=new Map();let writes=0,calls=0,fetches=0,cancels=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){}},focus(){},querySelector(){return null;}});return nodes.get(id);};
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},body:node('body')},location:{pathname:'/portal.html',search:'',assign(){},replace(){}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){writes++;storage.set(key,value);}},FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}},CustomEvent:class{},setTimeout(){},clearTimeout(){},dispatchEvent(){},addEventListener(type,fn){if(!handlers.has('window:'+type))handlers.set('window:'+type,[]);handlers.get('window:'+type).push(fn);},scrollTo(){},navigator:{},fetch:async()=>{fetches++;return fetcher?fetcher():{ok:true,json:async()=>({entries:[]})};},__fixture:JSON.stringify({state:initial,stored,catalog:d.catalog,models:d.models})};context.window=context;vm.createContext(context);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const s=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(s.includes('module.exports'))vm.runInContext(s,context,{filename:match[1]});}
 context.DegreeComparisonRunner={create:()=>({cancel(){cancels++;},run(kind,payload){calls++;return runner?runner(payload):Promise.resolve(Comparison.build(copy(payload.state),copy(payload.catalog),copy(payload.models),copy(payload.costs),copy(payload.options)));}})};
 const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),hooks=`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;activePlanState=actualSavedTarget(fixture.stored)?clone(fixture.stored):null;render=function(){window.__rendered=routesBody();};window.__portal={prepare:prepareRecommendations,html:routesBody,view:()=>recommendationView,pending:()=>recommendationPending,state:()=>state,action,setProfile:changes=>Object.assign(state.profile,changes),card:routeCard,rate:publishedRate};`;
 vm.runInContext(source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());'),context,{filename:'portal.js'});
 return{api:context.__portal,node,calls:()=>calls,fetches:()=>fetches,cancels:()=>cancels,writes:()=>writes,stored:()=>JSON.parse(storage.get(KEY)),setStored:value=>storage.set(KEY,JSON.stringify(value)),async windowEvent(type,event={}){for(const fn of handlers.get('window:'+type)||[])await fn(event);await new Promise(resolve=>setImmediate(resolve));},rendered:()=>context.__rendered,async submit(values){for(const handler of handlers.get('submit')||[])await handler({target:{id:'portal-explore-form',values},preventDefault(){}});}};
}

test('the wizard uses cost and speed estimates instead of remembered comparison settings',async()=>{
 const f=fixture(),before=copy(f.api.state());await f.api.prepare();let view=copy(f.api.view());assert.equal(view.scenarios[0].pathwayId,'cheap');assert.equal(view.recommendation,null);assert.equal(view.rankingScope.unestimatedCount,1);assert.equal(f.writes(),0);assert.deepEqual(copy(f.api.state()),before);assert.deepEqual(f.stored(),before);
 const html=f.api.html();assert.match(html,/Tuition \+ courses estimate/);assert.match(html,/\$300/);assert.match(html,/Fees and other extras are excluded/);assert.doesNotMatch(html,/cheapest|lowest.cost|fastest/i);assert.match(html,/More matching plans \(1\)/);assert.match(html,/1 other plan has no comparable estimate/);assert.match(html,/<summary>How these plans are ordered<\/summary>/);assert.match(html,/Unpriced option/);assert.equal((html.match(/data-degree-preview=/g)||[]).length,4);
 f.api.setProfile({priority:'speed'});await f.api.prepare();view=copy(f.api.view());assert.equal(view.scenarios[0].pathwayId,'fast');assert.match(f.api.html(),/Estimated study time/);assert.match(f.api.html(),/weeks/);assert.equal(f.api.state().learning[0].status,'saved');assert.equal(f.api.state().sheet.notes.private,'My private note');
});

test('fresh wizard suggestions do not inherit or overwrite an intentionally empty or manual Compare selection',async()=>{
 for(const selectedIds of [[],['route:unknown'],['route:fast']]){
  const initial=data().state;initial.whatIf.selectedIds=selectedIds;const before=copy(initial),payloads=[];
  const f=fixture({initial,runner:payload=>{payloads.push(copy(payload));return Promise.resolve(Comparison.build(copy(payload.state),copy(payload.catalog),copy(payload.models),copy(payload.costs),copy(payload.options)));}});
  await f.api.prepare();const view=copy(f.api.view());
  assert.equal(view.scenarios.length,3);assert.equal(view.scenarios[0].pathwayId,'cheap');
  assert.equal(view.mappedProgramsChecked,4,'A new search evaluates every eligible plan, rather than the remembered comparison.');
  assert.equal(payloads.length,1);assert(!Object.hasOwn(payloads[0].options,'selectedIds'));
  assert(!Object.hasOwn(payloads[0].state.whatIf,'selectedIds'));
  assert.deepEqual(copy(f.api.state()),before);assert.deepEqual(f.stored(),before);assert.equal(f.writes(),0);
 }
});

test('optional study preferences cannot override an explicit cost or speed priority on displayed cards',async()=>{
 const f=fixture();f.api.setProfile({learningPace:'self-paced',priority:'cost'});await f.api.prepare();
 let html=f.api.html();assert.match(html,/Self-paced option/);assert(html.indexOf('data-degree-preview="cheap"')<html.indexOf('data-degree-preview="course-fit"'));assert.match(html,/Available tuition \+ course estimates first/);
 f.api.setProfile({priority:'speed'});await f.api.prepare();html=f.api.html();assert(html.indexOf('data-degree-preview="fast"')<html.indexOf('data-degree-preview="course-fit"'));assert.match(html,/Available study-time estimates first/);
});

test('render and Back reuse the prepared search without rebuilding it',async()=>{
 const f=fixture();await f.api.prepare();const calls=f.calls(),fetches=f.fetches(),original=copy(f.api.view().rankingScope.orderedRouteIds);f.api.html();f.api.html();await f.api.prepare();assert.equal(f.calls(),calls);assert.equal(f.fetches(),fetches);assert.deepEqual(copy(f.api.view().rankingScope.orderedRouteIds),original);
 f.api.state().journey.step='about';f.api.state().journey.intakeReturnStep='routes';f.api.state().journey.answers.start='explore';await f.api.action('back');assert.equal(f.api.state().journey.step,'routes');assert.equal(f.calls(),calls);
});

test('cost-loading errors keep course choices visible and retry without changing the saved plan',async()=>{
 let fail=true;const f=fixture({fetcher:()=>fail?{ok:false,status:503}:{ok:true,json:async()=>({entries:[]})}}),before=f.stored();await f.api.prepare();assert.equal(f.api.pending(),false);assert.equal(f.api.view(),null);assert.match(f.api.html(),/shown by your preferences/);assert.match(f.api.html(),/Try comparison again/);assert.equal((f.api.html().match(/data-degree-preview=/g)||[]).length,4);assert.deepEqual(f.stored(),before);assert.equal(f.writes(),0);
 fail=false;await f.api.action('retry-recommendations');assert.equal(f.api.view().scenarios[0].pathwayId,'cheap');assert.doesNotMatch(f.api.html(),/Try comparison again/);assert.equal(f.fetches(),2);
});

test('a slower earlier request cannot replace the results for newer preferences',async()=>{
 const jobs=[];const f=fixture({runner:payload=>new Promise(resolve=>jobs.push({payload,resolve}))});const first=f.api.prepare();await new Promise(resolve=>setImmediate(resolve));assert.equal(jobs.length,1);assert.equal(f.api.pending(),true);assert.match(f.api.html(),/Comparing your course plans/);
 f.api.setProfile({priority:'speed'});const second=f.api.prepare();await new Promise(resolve=>setImmediate(resolve));assert.equal(jobs.length,2);const resolveJob=job=>job.resolve(Comparison.build(copy(job.payload.state),copy(job.payload.catalog),copy(job.payload.models),{},copy(job.payload.options)));
 resolveJob(jobs[1]);await second;assert.equal(f.api.view().scenarios[0].pathwayId,'fast');resolveJob(jobs[0]);await first;assert.equal(f.api.view().scenarios[0].pathwayId,'fast');assert.equal(f.api.pending(),false);assert.equal(f.writes(),0);
});

test('existing degree and original records remain saved while discovery calculates alternatives',async()=>{
 const d=data(),active=Journey.selectRoute(d.state,d.catalog.pathways[0],d.catalog);active.journey.completed=true;active.journey.view='home';const initial=Journey.applyAnswer(active,'start','explore',d.catalog);initial.journey.view='questions';initial.journey.step='routes';const f=fixture({initial,stored:active}),before=f.stored();await f.api.prepare();assert.equal(f.api.view().hasTarget,false);assert.equal(f.api.view().scenarios.length,3);assert.equal(f.writes(),0);assert.deepEqual(f.stored(),before);assert.equal(f.stored().selectedPathwayId,'course-fit');
});

test('subscription rates require bound sources and never imply a degree total or number of paid terms',()=>{
 const f=fixture(),base={pricing:{model:'subscription',amount:4050,currency:'USD',period:'6-month term',sourceIds:['rate']},sources:[{id:'rate',url:'https://example.edu/tuition'}]};assert.equal(f.api.rate(base),'$4,050 / 6-month term');
 for(const invalid of [{...base,auditProvenance:{status:'student-provided'}},{...base,pricing:{...base.pricing,sourceUrl:'https://other.edu/price'}},{...base,pricing:{...base.pricing,sourceIds:[]}},{...base,sources:[]},{...base,sources:[{id:'rate',url:'javascript:alert(1)'}]},{...base,sources:[{id:'rate',url:'https://user:secret@example.edu/tuition'}]}])assert.equal(f.api.rate(invalid),'');
 const d=data(),fit={pathway:d.catalog.pathways[0],model:base},html=f.api.card(fit);assert.match(html,/Published university rate/);assert.match(html,/Total depends on paid terms needed/);assert.doesNotMatch(html,/Remaining cost estimate|Tuition \+ courses estimate/);
});

 test('returning from another tab refreshes recommendations from the latest original course collection',async()=>{
 const f=fixture();await f.api.prepare();const before=f.calls(),saved=f.stored();saved.learning[0].status='earned';f.setStored(saved);await f.windowEvent('focus');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls(),before+1);assert(f.api.view().scenarios.some(row=>row.summary?.applicableCompletedCredits===3));assert.equal(f.stored().learning[0].status,'earned');assert.equal(f.writes(),0);await f.windowEvent('storage',{key:'unrelated'});assert.equal(f.calls(),before+1);
});


test('a structurally complete fixture without publication review cannot become a wizard recommendation',async()=>{
 const f=fixture({withoutPublication:true}),before=f.stored();await f.api.prepare();
 assert.equal(f.api.view().scenarios.length,0);assert.equal(f.api.view().mappedProgramsChecked,0);
 assert.equal((f.api.html().match(/data-degree-preview=/g)||[]).length,0);assert.match(f.api.html(),/No course plan matches yet/);
 assert.deepEqual(f.stored(),before);assert.equal(f.writes(),0);
});
