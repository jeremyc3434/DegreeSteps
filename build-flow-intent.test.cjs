/* Exercise the actual front-door URL, price and native planning handoff code without a browser or production data. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js'),Catalog=require('./dist/program-catalog.js');
const library=require('./dist/data/plan-library-index.json');
const registry=require('./dist/data/curriculum-registry.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const plain=value=>JSON.parse(JSON.stringify(value));
function environment(search=''){
 const elements=new Map(),events={};
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:false,value:'',checked:false,addEventListener(){},querySelector(){return {outerHTML:'<legend>Filter</legend>'};},focus(){}});return elements.get(id);};
 const location={search,pathname:'/portal.html',assigned:'',assign(value){this.assigned=value;}};
 const document={getElementById:element,addEventListener(name,callback){events[name]=callback;},querySelector(){return null;},body:{},activeElement:null};
 const window={document,location,DegreeJourney:Journey,DegreeSheet:Sheet,DegreeGuide:Guide,DegreeProgramOpportunities:require('./dist/program-opportunities.js'),addEventListener(){},scrollTo(){}};
 const context={window,document,location,URLSearchParams,URL,console,Intl,Map,Set,WeakMap,CSS:{escape:value=>value},history:{replaceState(_a,_b,value){location.assigned=value;}},localStorage:{getItem(){return null;},setItem(){}},DegreeProgramCatalog:Catalog,DegreeGuide:Guide,fetch:async()=>{throw Error('No network in this test');}};
 return {context,elements,events,location};
}
function start(search=''){
 const env=environment(search),source=fs.readFileSync('dist/start.js','utf8');
 const exposed='globalThis.frontDoor={setIndex:value=>index=value,setRows:value=>rows=value,filters,answers,sorted,card,openCredits,finishQuiz,planUrl,creditsUrl,syncUrl};';
 vm.runInNewContext(source.replace('(async()=>{try{',exposed+'\n(async()=>{try{'),env.context);
 env.api=env.context.frontDoor;env.api.setIndex(library);return env;
}
function portal(search=''){
 const env=environment(search),source=fs.readFileSync('dist/portal.js','utf8');
 vm.runInNewContext(source.replace('  boot();','  globalThis.frontDoor={builderIntent,applyBuilderIntent,setCatalog:value=>catalog=value};'),env.context);
 env.api=env.context.frontDoor;env.api.setCatalog(catalog);return env;
}
const route=id=>catalog.pathways.find(item=>item.id===id),seed=id=>Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route(id)),null,catalog);

test('partial prices identify missing charges in both the degree card and credits step',()=>{
 const env=start(),p=route('excelsior-bs-business-no-concentration'),html=env.api.card(p);
 assert.match(html,/Known charges so far/);assert.match(html,/StraighterLine prices not included/);assert.doesNotMatch(html,/>Est\. cost</);assert.match(html,/20,067/);assert.match(html,/20,935/);
 env.api.openCredits(p);assert.match(env.elements.get('start-picked').innerHTML,/Known charges so far/);assert.match(env.elements.get('start-picked').innerHTML,/StraighterLine prices not included/);
});
test('an incomplete cheaper price cannot outrank a complete planning range',()=>{
 const env=start();const data={plans:{partial:{estimate:{min:10,max:20,partial:true}},complete:{estimate:{min:500,max:600}},missing:{}}};env.api.setIndex(data);
 const items=['partial','missing','complete'].map(id=>({id,title:id,school:'School'})),before=JSON.stringify(items);
 assert.deepEqual(plain(env.api.sorted(items)).map(p=>p.id),['complete','partial','missing']);assert.equal(JSON.stringify(items),before);
});
test('quiz answers use native intent values and survive filtering, selection, reload and back navigation',()=>{
 const initial=start();Object.assign(initial.api.answers,{purpose:'change',sort:'time',level:'bachelor',subject:'psychology',format:'online'});initial.api.finishQuiz();
 const resultUrl=new URL(initial.location.assigned,'https://degreesteps.test/');assert.equal(resultUrl.searchParams.get('purpose'),'change-career');assert.equal(resultUrl.searchParams.get('priority'),'speed');
 const results=start(resultUrl.search);Object.assign(results.api.filters,{subject:'psychology',format:'online',sort:'time',level:'bachelor'});results.api.syncUrl();assert.match(results.location.assigned,/purpose=change-career/);
 const chosen=route('apus-bachelor-of-arts-in-psychology'),credits=new URL(results.api.creditsUrl(chosen),'https://degreesteps.test/'),reloaded=start(credits.search);Object.assign(reloaded.api.filters,{subject:'psychology',format:'online',sort:'time',level:'bachelor'});reloaded.api.openCredits(chosen);
 assert.match(reloaded.elements.get('start-credits-back').href,/purpose=change-career/);const handoff=new URL(reloaded.api.planUrl(chosen,'upload'),'https://degreesteps.test/');
 assert.equal(handoff.searchParams.get('purpose'),'change-career');assert.equal(handoff.searchParams.get('priority'),'speed');assert.equal(handoff.searchParams.get('then'),'upload');
 const receiver=portal(handoff.search),intent=receiver.api.builderIntent(),state=seed(chosen.id);state.learning=[{id:'original-course',provider:'College',code:'ENG101',title:'Composition',credits:3,creditSystem:'semester',status:'earned'}];state.sheet.notes={private:'Keep this note'};const before=JSON.stringify(state),next=receiver.api.applyBuilderIntent(state,intent);
 assert.equal(next.profile.goal,'change-career');assert.equal(next.profile.priority,'speed');assert.equal(next.journey.answers.purpose,'change-career');assert.deepEqual(plain(next.learning),state.learning);assert.deepEqual(plain(next.sheet.notes),state.sheet.notes);assert.equal(JSON.stringify(state),before);
});
test('licensed intent remains unresolved until an exact profession is supplied, without inventing qualification',()=>{
 const env=portal('?from=quiz&purpose=licensed-career&priority=speed'),state=seed('apus-bachelor-of-arts-in-psychology'),next=env.api.applyBuilderIntent(state,env.api.builderIntent());
 assert.equal(next.journey.answers.purpose,'licensed-career');assert.equal(next.profile.priority,'speed');assert.equal(next.profile.goal,'any-degree');assert.equal(next.journey.answers.career,undefined);
 const exact=portal('?from=quiz&purpose=licensed-career&priority=speed&career=teacher'),chosen=exact.api.applyBuilderIntent(state,exact.api.builderIntent());
 assert.equal(chosen.profile.goal,'teacher');assert.equal(chosen.journey.answers.career,'teacher');assert.equal(chosen.profile.priority,'speed');
 const entry=registry.models.find(item=>item.id===route('apus-bachelor-of-arts-in-psychology').modelId),pack=require('./dist/'+entry.path);const draft=Journey.buildDraft(chosen,catalog,pack.models||[pack]);assert.equal(draft.plan,null);assert(draft.targetReviewNeeded||draft.targetUnknowns.some(item=>item.field==='goal'));
});
test('ordinary degree links preserve saved preferences and reject unrecognized quiz values',()=>{
 const state=seed('apus-bachelor-of-arts-in-psychology');state.profile.goal='career-growth';state.profile.priority='cost';
 for(const query of ['', '?purpose=change-career&priority=speed','?from=quiz&purpose=administrator&priority=unlimited']){const env=portal(query),intent=env.api.builderIntent();assert.equal(intent,null);assert.equal(env.api.applyBuilderIntent(state,intent),state);}
 const env=portal('?from=quiz&purpose=licensed-career&priority=speed&career=administrator');assert.equal(env.api.builderIntent().career,null);
});
