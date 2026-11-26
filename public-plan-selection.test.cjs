/* Public choices share reviewed model identities; private plans are never deleted. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Catalog=require('./dist/program-catalog.js'),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js'),Library=require('./dist/course-library-engine.js'),Comparison=require('./dist/plan-comparison-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const route=(id,modelId,school='Published College')=>({id,modelId,school,title:id,level:'bachelor',field:'business',fields:['business'],goals:['any-degree'],modalities:['online'],url:'https://college.example.edu/'+id});
 const pathways=[route('alias','published'),route('held','held','Research College'),route('canonical','published'),route('second','second')];
 const models=['published','second','held'].map(id=>({id,school:id==='held'?'Research College':'Published College',title:id==='published'?'canonical':id,level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:3,institutionMinCredits:3,externalMaxCredits:0,upperMinCredits:0,sources:[{id:'catalog',url:'https://college.example.edu/catalog'}],requirements:[{id:'capstone',code:'CAP101',title:'Capstone',credits:3,sourceIds:['catalog'],options:[{id:'university',provider:'University',code:'CAP101',title:'Capstone',credits:3,evidence:'published',sourceIds:['catalog']}]}]}));
 const registry={models:models.map(model=>({id:model.id,routeIds:pathways.filter(route=>route.modelId===model.id).map(route=>route.id),coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}))};
 const publication={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'a'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:models.filter(model=>model.id!=='held').map(model=>({modelId:model.id,routeIds:model.id==='published'?['canonical','alias']:['second'],level:'bachelor',publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(model,'bachelor')}))};
 const catalog=Catalog.attachPublicationIndex({pathways,curriculumRegistry:registry},publication,registry),planIndex={plans:Object.fromEntries(pathways.map(route=>[route.id,{tier:route.id==='held'?'confirmation':'reviewed',published:route.id!=='held',subjects:['business'],level:'bachelor'}]))};
 const state=Journey.initialize(null,null,catalog);Object.assign(state.profile,{school:'Published College',degreeLevel:'bachelor',field:'business',goal:'any-degree',modality:'online'});
 return {catalog,models,planIndex,state};
}
function mount(file,input=fixture()){
 const f=copy(input),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,innerHTML:'',textContent:'',dataset:{},classList:{add(){},toggle(){},remove(){}},addEventListener(){},setAttribute(){},focus(){},querySelector(){return null;},querySelectorAll(){return[];},elements:{}});return nodes.get(id);};
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(selector){return selector==='.portal-degree-more'?node('portal-degree-more'):null;},querySelectorAll(){return[];},addEventListener(){},body:node('body')},location:{pathname:'/plan.html',search:''},localStorage:{getItem(){return JSON.stringify(f.state);},setItem(){throw Error('Inspecting public choices must not write private storage.');}},setTimeout(){},clearTimeout(){},addEventListener(){},dispatchEvent(){},navigator:{},DegreeProgramCatalog:Catalog,DegreeJourney:Journey,DegreeSheet:Sheet,DegreeGuide:Guide,DegreeCourseLibrary:Library,DegreePlanComparison:Comparison,__fixture:f};context.window=context;
 const source=fs.readFileSync('dist/'+file,'utf8');let instrumented;
 if(file==='portal.js')instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,`state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;planIndex=__fixture.planIndex;window.__api={routes:availableRoutes,guided:()=>guidedRoutes(catalog,models),schools:()=>questionBody('school'),degrees:()=>{renderDegreeOptions();return $('portal-degree-results').innerHTML;},finder:finderLink,use:usePublicPlan,state:()=>state};}());`);
 else{const boundary=source.indexOf(' (async()=>{try{const data=await Promise.all');assert(boundary>0);instrumented=source.slice(0,boundary)+`state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;planIndex=__fixture.planIndex;window.__api={routes:readyRoutes,library:libraryRoutes,comparison:comparisonCatalog,options,schools:()=>{schoolOptions();return $('compare-school').innerHTML;},degrees:()=>{degrees();return $('compare-degree').innerHTML;},state:()=>state};}());`;}
 assert.notEqual(instrumented,source);vm.runInNewContext(instrumented,context,{filename:file});return {api:context.__api,node,context};
}
test('the shared public list excludes confirmation holds, prefers the reviewed canonical alias and fails closed',()=>{
 const f=fixture(),before=JSON.stringify(f);
 assert.deepEqual(Catalog.planLibraryRoutes(f.catalog,f.models,f.planIndex).map(route=>route.id),['canonical','second']);
 assert.deepEqual(Catalog.publishedPlans(f.catalog,f.models).map(route=>route.id),['alias','canonical','second'],'Exact published aliases remain resolvable.');
 const missing=copy(f.catalog);missing.pathways=missing.pathways.filter(route=>route.id!=='canonical');assert.deepEqual(Catalog.planLibraryRoutes(missing,f.models).map(route=>route.id),['alias','second']);
 for(const publicationIndex of [undefined,{available:false,plans:f.catalog.publicationIndex.plans}])assert.deepEqual(Catalog.planLibraryRoutes({...f.catalog,publicationIndex},f.models,f.planIndex),[]);
 assert.equal(JSON.stringify(f),before);
});
test('portal school choices, degree buttons, guided results and finder counts use the same reviewed models',async()=>{
 const f=fixture(),{api}=mount('portal.js',f);
 assert.deepEqual(Array.from(api.routes(),route=>route.id),['canonical','second']);assert.deepEqual(Array.from(api.guided(),route=>route.id),['canonical','second']);
 assert(!api.schools().includes('Research College'));const degrees=api.degrees();assert(degrees.includes('data-degree-preview="canonical"'));assert(!degrees.includes('data-degree-preview="alias"'));assert(!degrees.includes('data-degree-preview="held"'));
 assert.match(api.finder(0),/See all 2 .* plans in the plan finder/);assert(!api.finder(2));
 const before=JSON.stringify(api.state());await assert.rejects(()=>api.use('held'),/not available/);assert.equal(JSON.stringify(api.state()),before);
 const unavailable=fixture();delete unavailable.catalog.publicationIndex;const absent=mount('portal.js',unavailable);assert.equal(absent.api.routes().length,0);assert(!absent.api.schools().includes('<option value="Published College"'));assert.equal(absent.api.finder(0),'');
});
test('comparison suggestions and picker exclude held routes while current, saved and earlier explicit private choices stay recoverable',()=>{
 const f=fixture(),held=f.catalog.pathways.find(route=>route.id==='held');f.state=Journey.initialize(Sheet.selectPathway(f.state,held),null,f.catalog);
 f.state.learning=[{id:'original',provider:'My college',code:'OLD101',title:'My original course',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];f.state.sheet.notes={private:'Keep my note'};f.state.scenarios.held={optionSelections:{capstone:'university'}};f.state.whatIf={version:1,selectedIds:['route:held','saved:old-held'],snapshots:[{id:'old-held',pathwayId:'held',label:'My earlier plan',settings:{}}]};
 const before=JSON.stringify(f.state),{api,node}=mount('compare-plans.js',f);
 assert.deepEqual(Array.from(api.routes(),route=>route.id),['canonical','second']);assert(!api.schools().includes('Research College'));node('compare-school').value='Published College';assert(!api.degrees().includes('route:held'));assert(!api.degrees().includes('route:alias'));
 assert.deepEqual(Array.from(api.options().selectedIds),['route:held','saved:old-held']);assert(api.comparison().pathways.some(route=>route.id==='held'));
 const draft=Journey.buildDraft(api.state(),api.comparison(),f.models);assert.equal(draft.pathway.id,'held');assert.deepEqual(copy(draft.state.learning),f.state.learning);assert.deepEqual(copy(draft.state.sheet.notes),f.state.sheet.notes);
 assert.equal(JSON.stringify(api.state()),before,'Public filtering never rewrites or drops private state.');
 const versions=copy(f);versions.state.whatIf={version:1,selectedIds:['saved:first','saved:second'],snapshots:[{id:'first',pathwayId:'held',label:'Earlier version',settings:{}},{id:'second',pathwayId:'held',label:'Later version',settings:{optionSelections:{capstone:'university'}}}]};
 const saved=mount('compare-plans.js',versions).api;assert.deepEqual(Array.from(saved.options().selectedIds),['saved:first','saved:second']);
 const compared=Comparison.build(saved.state(),saved.comparison(),versions.models,{entries:[]},{...saved.options(),deferMatrix:true});
 assert(compared.scenarios.some(scenario=>scenario.id==='saved:first'));assert(compared.scenarios.some(scenario=>scenario.id==='saved:second'),'Two deliberately saved versions remain distinct despite sharing one academic model.');
});
test('an active published alias stays exact without becoming a duplicate automatic alternative',()=>{
 const f=fixture();f.state=Journey.initialize(Sheet.selectPathway(f.state,f.catalog.pathways.find(route=>route.id==='alias')),null,f.catalog);const {api}=mount('compare-plans.js',f),routes=api.comparison().pathways;
 assert(routes.some(route=>route.id==='alias'));assert(!routes.some(route=>route.id==='canonical'));assert.equal(routes.filter(route=>route.modelId==='published').length,1);assert.equal(api.state().selectedPathwayId,'alias');
});
test('production public representative counts equal publication-ready model counts, without removing exact published aliases',()=>{
 const registry=require('./dist/data/curriculum-registry.json'),catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),require('./dist/data/publication-index.json'),registry),routes=Catalog.planLibraryRoutes(catalog,[],require('./dist/data/plan-library-index.json')),raw=Catalog.publishedPlans(catalog);
 assert.equal(routes.length,catalog.publicationIndex.plans.length);assert.equal(new Set(routes.map(route=>route.modelId)).size,routes.length);assert(raw.length>=routes.length);
 for(const proof of catalog.publicationIndex.plans)assert.equal(routes.find(route=>route.modelId===proof.modelId).id,proof.routeIds[0]);
});
