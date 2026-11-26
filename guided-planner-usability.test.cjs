const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Guide=require('./dist/guide-engine.js'),Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js'),Planner=require('./dist/planner.js'),Estimate=require('./dist/plan-estimate-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));

// Subject taxonomy -----------------------------------------------------------
const route=(id,field,subjects,title=id)=>({id,school:'Example University',title,level:'bachelor',field,fields:[field],modalities:['online'],goals:['any-degree','career-growth','change-career'],...(subjects?{subjects}:{})});
const psychology=route('psych','social-science',['psychology'],'Psychology BS'),justice=route('cj','social-science',['criminal-justice'],'Criminal Justice BS'),ux=route('ux','arts',['technology'],'User Experience Design BS'),finance=route('fin','business',['accounting-finance'],'Finance BS'),business=route('mgmt','business',['business'],'Business Management BS');
const all={pathways:[psychology,justice,ux,finance,business]};
const ids=field=>Guide.recommend({field,degreeLevel:'bachelor'},all,[],[]).map(fit=>fit.pathway.id).sort();

test('the wizard subjects cover the browsing taxonomy and each returns its own plans',()=>{
 assert.deepEqual(Guide.subjectIds,['business','accounting-finance','technology','health','psychology','criminal-justice','education','humanities','faith']);
 for(const id of Guide.subjectIds)assert.equal(Guide.normalizeProfile({field:id}).field,id,id+' survives normalization');
 assert.deepEqual(ids('psychology'),['psych']);
 assert.deepEqual(ids('criminal-justice'),['cj']);
 assert.deepEqual(ids('technology'),['ux'],'a UX design degree is technology & data, not only arts');
 assert.deepEqual(ids('accounting-finance'),['fin']);
 assert.deepEqual(ids('business'),['mgmt']);
 assert.deepEqual(ids('education'),[]);
 assert.equal(ids('any').length,5);
});
test('older saved field ids keep working instead of resetting or breaking',()=>{
 for(const id of ['social-science','general','science','arts','law','aviation'])assert.equal(Guide.normalizeProfile({field:id}).field,id);
 assert.deepEqual(ids('social-science'),['cj','psych'],'Social sciences still finds psychology and criminal justice');
 assert.deepEqual(ids('arts'),['ux'],'an old route field still matches');
 // Without the index (no route.subjects) a new subject falls back to the nearest old field.
 const bare={pathways:all.pathways.map(item=>{const next={...item};delete next.subjects;return next;})};
 assert.deepEqual(Guide.recommend({field:'psychology',degreeLevel:'bachelor'},bare,[],[]).map(fit=>fit.pathway.id).sort(),['cj','psych']);
 assert.deepEqual(Guide.recommend({field:'accounting-finance',degreeLevel:'bachelor'},bare,[],[]).map(fit=>fit.pathway.id).sort(),['fin','mgmt']);
});
test('a subject answer is accepted by the journey and checked against the chosen route',()=>{
 let state=Journey.initialize(null,null,all);state=Journey.applyAnswer(state,'start','explore',all);state=Journey.applyAnswer(state,'field','psychology',all);
 assert.equal(state.profile.field,'psychology');
 assert.throws(()=>Journey.applyAnswer(state,'field','astrology',all));
 const conflict=Guide.assessTarget({field:'psychology'},justice,[]);assert(conflict.conflicts.some(issue=>issue.field==='field'));
 assert.equal(Guide.assessTarget({field:'psychology'},psychology,[]).conflicts.some(issue=>issue.field==='field'),false);
});

// Manual course identity ------------------------------------------------------
function program(options){
 return {id:'model',school:'Example University',title:'Example',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,externalMaxCredits:3,sources:[{id:'s',url:'https://example.edu/catalog'}],
  requirements:[{id:'eng',code:'ENG101',title:'English Composition I',credits:3,category:'general',options},{id:'cap',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[{id:'cap',provider:'University',code:'CAP',credits:3,title:'Capstone',evidence:'published',sourceIds:['s']}]}]};
}
const sophia=[{id:'sophia-0015',provider:'Sophia',code:'SOPH-0015',codeAliases:['ENG1001'],credits:3,title:'English Composition I',evidence:'published',sourceIds:['s']}];
const manual=extra=>({id:'manual',provider:'Sophia',code:'',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',evaluations:[],...extra});

test('a manual entry is matched by provider and a written course code, without changing the saved record',()=>{
 const model=program(sophia);
 for(const record of [manual({title:'SOPH-0015 English Composition I'}),manual({code:'SOPH 0015'}),manual({code:'soph-0015 English Composition I'}),manual({provider:'Sophia Learning',code:'',title:'ENG1001 English Composition I'})]){
  const before=copy(record),resolved=Guide.resolveRecordIdentity(model,record);
  assert.equal(resolved.code.replace(/[^A-Z0-9]/gi,'').toUpperCase(),'SOPH0015',JSON.stringify(record));assert.deepEqual(record,before,'the original record is unchanged');
  const match=Guide.matchInventory(model,[record]);assert.deepEqual(match.completed.map(placement=>[placement.requirementId,placement.optionId,placement.learningId]),[['eng','sophia-0015','manual']]);
 }
 // The exact code still works unchanged.
 assert.equal(Guide.resolveRecordIdentity(model,manual({code:'SOPH-0015'})).code,'SOPH-0015');
});
test('titles alone, other providers and ambiguous codes are not matched and are flagged for review',()=>{
 const model=program(sophia);
 assert.equal(Guide.matchInventory(model,[manual()]).completed.length,0,'a title alone is never an identity');
 assert.equal(Guide.matchInventory(model,[manual({provider:'Study.com',code:'SOPH-0015'})]).completed.length,0,'identity never crosses providers');
 const catalogRecord=manual({catalogCourseId:'sophia-listing',codeBasis:'curated-course-map',title:'SOPH-0015 English Composition I'});
 assert.equal(Guide.resolveRecordIdentity(model,catalogRecord),catalogRecord,'catalog listings keep their own identity rules');
 const twice=program([...sophia,{id:'sophia-0030',provider:'Sophia',code:'SOPH-0030',credits:3,title:'English Composition II',evidence:'published',sourceIds:['s']}]),ambiguous=manual({title:'SOPH-0015 / SOPH-0030 English Composition'});
 assert.equal(Guide.resolveRecordIdentity(twice,ambiguous),ambiguous);assert.equal(Guide.manualIdentityAmbiguous(twice,ambiguous),true);
 assert.equal(Guide.matchInventory(twice,[ambiguous]).completed.length,0);
 assert.equal(Guide.manualIdentityAmbiguous(model,manual({title:'SOPH-0015 English Composition I'})),false);
});

test('one hand-typed line naming two codes never counts toward a plan that lists only one of them',()=>{
 const model=program(sophia),before=manual({code:'SOPH-0015 SOPH-0048',title:'Two courses on one line'}),record=copy(before);
 assert.equal(Guide.resolveRecordIdentity(model,record),record,'the listed code is not picked out of the line');
 assert.equal(Guide.manualIdentityAmbiguous(model,record),true,'shown as Needs review');
 assert.equal(Guide.manualCodeLineHasSeveralCodes(record),true);
 assert.equal(Guide.matchInventory(model,[record]).completed.length,0);
 assert.deepEqual(record,before,'the saved record is unchanged');
 for(const code of ['SOPH-0048 / SOPH-0015','SOPH 0015, SOPH 0048']){const other=manual({code});assert.equal(Guide.matchInventory(model,[other]).completed.length,0,code);assert.equal(Guide.manualIdentityAmbiguous(model,other),true,code);}
 // A code and its own listed alias name one course, so that line is still matched.
 const alias=manual({code:'SOPH-0015 ENG1001'});
 assert.deepEqual(Guide.matchInventory(model,[alias]).completed.map(item=>item.optionId),['sophia-0015']);assert.equal(Guide.manualIdentityAmbiguous(model,alias),false);
 // Two codes this degree doesn't list at all stay "no listed match", not "needs review".
 const unlisted=manual({code:'SOPH-0098 SOPH-0099'});assert.equal(Guide.manualIdentityAmbiguous(model,unlisted),false);assert.equal(Guide.matchInventory(model,[unlisted]).completed.length,0);
 // One code on its own line still matches as before.
 assert.equal(Guide.matchInventory(model,[manual({code:'SOPH 0015'})]).completed.length,1);
 // Catalog-listed courses are never read as hand-typed lines.
 assert.equal(Guide.manualCodeLineHasSeveralCodes(manual({catalogCourseId:'sophia-listing',code:'SOPH-0015 SOPH-0048'})),false);
});

// Portal ----------------------------------------------------------------------
function portalData(){
 const r={id:'campus-degree',modelId:'campus-model',school:'Example University',title:'Psychology BS',level:'bachelor',field:'social-science',fields:['social-science'],modalities:['online'],goals:['any-degree','career-growth','change-career']};
 const model={id:'campus-model',school:r.school,title:r.title,level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:3,sources:[{id:'catalog',url:'https://example.edu/catalog'}],requirements:[{id:'writing',code:'ENG101',title:'Writing',credits:3,category:'general',options:[{id:'sophia-writing',provider:'Sophia',code:'S1',credits:3,title:'Writing',creditSystem:'semester',evidence:'published',sourceIds:['catalog']}]},{id:'capstone',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[{id:'capstone-option',provider:'University',code:'CAP',credits:3,title:'Capstone',creditSystem:'semester',evidence:'published',sourceIds:['catalog']}]}]};
 const registry={models:[{id:model.id,routeIds:[r.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}]};
 const publicationIndex={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'1'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:[{modelId:model.id,routeIds:[r.id],level:Catalog.publicationLevel(r.level),publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(model,r.level)}]};
 return {catalog:Catalog.attachPublicationIndex({pathways:[r],curriculumRegistry:registry},publicationIndex,registry),models:[model],route:r};
}
const planIndex={subjects:{business:'Business & management',psychology:'Psychology & human services'},plans:{'campus-degree':{tier:'confirmation',subjects:['psychology'],questions:['Ask the school: is there a time limit on how old transfer credit can be?','Ask the school to confirm 2 proposed course matches for this exact program before paying for them.']},other:{tier:'reviewed',subjects:['psychology'],questions:[]}}};
function portal({publicationReady=true}={}){
 const d=portalData();if(!publicationReady)d.catalog.publicationIndex.plans=[];const initial=Journey.initialize(null,null,d.catalog),storage=new Map([['degreepath-guide-v3',JSON.stringify(initial)]]),nodes=new Map(),handlers=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,values:{},innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){}},focus(){},querySelector(){return null;},setAttribute(){},insertAdjacentHTML(){}});return nodes.get(id);};
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},body:node('body')},location:{pathname:'/portal.html',search:'',assign(){},replace(){}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}getAll(name){const value=this.get(name);return value===undefined?[]:Array.isArray(value)?value:[value];}},CustomEvent:class{},setTimeout(){},clearTimeout(){},dispatchEvent(){},addEventListener(){},scrollTo(){},navigator:{},__fixture:JSON.stringify({state:initial,...d,planIndex})};context.window=context;vm.createContext(context);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});}
 context.fetch=async()=>({ok:false});
 const hooks=`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;planIndex=fixture.planIndex;attachSubjects();render=function(){save();};prepareRecommendations=async()=>{};window.__t={state:()=>state,set:value=>{state=value;},catalog:()=>catalog,answer,start:startProfile,steps:profileSteps,body:profileBody,fields:fieldChoicesFor,check:schoolCheckHTML,results:recommendationResultsBody,notice:updateResultNotice,announceFinding:()=>{announce(FINDING_NOTICE);resultNotice=FINDING_NOTICE;},card:routeCard,setRates:value=>{estimateRates=value;},choose:()=>{state=Journey.selectRoute(state,fixture.route,catalog);state.journey.profileFlowVersion=1;startProfile('target','degree');}};`;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8').replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());'),context,{filename:'portal.js'});
 return {api:context.__t,node,d,async submit(values){const form=node('portal-profile-form');form.values=values;for(const handler of handlers.get('submit')||[])await handler({target:form,preventDefault(){}});}};
}

test('the subject question uses the taxonomy labels and keeps a legacy saved value selectable',()=>{
 const f=portal();
 assert.deepEqual(copy(f.api.fields('any').map(([id])=>id)),['any',...Guide.subjectIds]);
 assert.equal(f.api.fields('psychology').find(([id])=>id==='psychology')[1],'Psychology & human services');
 assert.deepEqual(copy(f.api.fields('social-science').at(-1)),['social-science','Social sciences (psychology or criminal justice)']);
 assert.deepEqual(copy(f.api.catalog().pathways[0].subjects),['psychology'],'route subjects come from the plan index');
});
test('military service is a visible question with service records shown for service members',async()=>{
 const f=portal();await f.api.answer('explore');await f.submit({goal:'any-degree',field:'psychology',degreeLevel:'bachelor'});
 assert.equal(f.api.state().profile.field,'psychology');assert.equal(f.api.state().journey.step,'prior');
 const html=f.api.body('prior');
 assert.match(html,/<fieldset class="portal-military-field"><legend>Military service<\/legend>/);assert.doesNotMatch(html,/<details[^>]*><summary>Military/);
 assert.match(html,/Have you served in the U\.S\. military\?/);assert.match(html,/id="portal-profile-military-records" hidden/);
 await f.submit({prior:'none',military:'veteran',militaryRecords:'jst'});assert.equal(f.api.state().profile.militaryStatus,'veteran');
});
test('a chosen degree skips the goal question and keeps the saved goal',async()=>{
 const f=portal(),state=f.api.state();state.profile.goal='career-growth';f.api.set(state);f.api.choose();
 assert.equal(f.api.state().journey.step,'prior');assert.deepEqual(copy(f.api.steps()),['prior','format','priority']);
 assert.match(f.api.body('prior'),/Your degree: Psychology BS · Example University/);
 await f.submit({prior:'none',military:'none'});await f.submit({learningPace:'any',campusLocation:'any',campusTime:'any'});await f.submit({priority:'cost',proctoringPreference:'open',assessmentPreference:'mixed'});
 const saved=f.api.state();assert.equal(saved.profile.goal,'career-growth');assert.equal(saved.journey.answers.purpose,'career-growth');assert.equal(saved.journey.intakeCompleted,true);assert.equal(saved.selectedPathwayId,'campus-degree');
});
test('an existing private unfinished plan retains its research questions',()=>{
 const f=portal({publicationReady:false});f.api.choose();const html=f.api.check(f.d.route);
 assert.match(html,/Before you pay for courses, ask the school:/);
 assert.match(html,/<li>Is there a time limit on how old transfer credit can be\?<\/li>/,'the repeated "Ask the school:" prefix is removed');
 assert.match(html,/<li>Ask the school to confirm 2 proposed course matches/);
 assert.equal(f.api.check({id:'other'}),'','reviewed plans show no confirmation box');
});
test('the finding status becomes a result summary once results render',()=>{
 const f=portal(),state=f.api.state();state.journey={...state.journey,view:'questions',step:'routes'};state.profile.field='psychology';f.api.set(state);
 f.api.announceFinding();assert.equal(f.node('portal-notice').textContent,'Finding course plans for your choices…');
 const html=f.api.results();f.api.notice();
 assert.equal(f.node('portal-notice').textContent,'Found 1 course plan for your choices.');
 // A stale confirmation label cannot downgrade a publication-ready result.
 assert.doesNotMatch(html,/portal-tier-confirm">Needs school confirmation/);assert.doesNotMatch(html,/Before you pay for courses \(2\)/);assert.match(html,/Reviewed plan/);
 state.journey.step='prior';f.api.set(state);f.api.notice();assert.equal(f.node('portal-notice').textContent,'','leaving results clears the summary');
});

test('a route card shows a remaining planning estimate only from the same engine and prices',()=>{
 const f=portal(),model=f.d.models[0];
 const rates={schemaRevision:'plan-estimate-rates-v1',checkedOn:'2026-11-01',sources:[{id:'r',title:'Rates',url:'https://example.edu/rates',checkedOn:'2026-11-01'}],
  entries:[{id:'e',school:model.school,creditSystem:'semester',modality:'online',degreeUnits:6,modelIds:[model.id],catalogs:['2026'],sourceIds:['r'],tuition:{type:'per-credit',rate:100},feesPerTerm:0,oneTimeFees:0,feeBreakdown:[{label:'None',amount:0,frequency:'per-term'},{label:'None',amount:0,frequency:'one-time'}],pace:{min:1,max:6,defaultMin:3,defaultMax:6},termLabel:'term',termMonths:4}],
  providers:[{provider:'Sophia',type:'subscription',amount:99,sourceIds:['r']}]};
 const program={...model,catalogYear:'2026'},record={id:'done',provider:'Sophia',code:'S1',title:'Writing',credits:3,creditSystem:'semester',status:'earned',evaluations:[]};
 const make=status=>Planner.generate(program,{providers:['Sophia'],priority:'transfer',completed:status==='reported'?Guide.matchInventory(program,[record]).completed:[]});
 assert.equal(make('reported').rows[0].status,'reported');
 const full=Estimate.calculate({program,plan:make('planned'),rates});assert.equal(full.available,true,JSON.stringify(full));
 f.api.setRates(rates);
 const result={pathway:f.api.catalog().pathways[0],model};
 const finished={draft:{program,plan:make('reported')},summary:{creditSystem:'semester',collectionFitCredits:3,mappedExternalCredits:3,reviewCourses:[{status:'earned',title:'Another course'}]}};
 const html=f.api.card(result,finished);
 assert.match(html,/Your remaining planning estimate<\/dt><dd>\$300<\/dd>/);assert.match(html,/Full-route planning estimate<\/dt><dd>\$399<\/dd>/);assert.match(html,/minus about \$99 of outside-course charges for the 3 credits/);
 assert.match(html,/1 finished course needs review/);
 assert.doesNotMatch(html,/Your remaining cost estimate/,'the fee-confirmed remaining cost is not faked');
 const none={draft:{program,plan:make('planned')},summary:{creditSystem:'semester',mappedExternalCredits:3}};
 assert.doesNotMatch(f.api.card(result,none),/Your remaining planning estimate/,'no finished courses, no personal range');
 f.api.setRates(null);assert.doesNotMatch(f.api.card(result,finished),/remaining planning/,'without reviewed rates nothing is shown');
});

test('a route always matches its own catalog field even when its browsing subject differs (regression)',()=>{
 const Guide=require('./dist/guide-engine.js');
 const finance={id:'x',field:'business',subjects:['accounting-finance']};
 assert.equal(Guide.subjectMatches(finance,'business',true),true,'selecting a plan copies its field into the profile; it must not conflict with itself');
 assert.equal(Guide.subjectMatches(finance,'business'),false,'subject filtering stays strict');
 assert.equal(Guide.subjectMatches(finance,'accounting-finance'),true);
 assert.equal(Guide.subjectMatches(finance,'psychology'),false);
 const r=Guide.assessTarget({...Guide.normalizeProfile({}),field:'business'},{...finance,level:'bachelor',modalities:['online'],goals:['any-degree'],school:'Western Governors University',title:'Finance – B.S.'},[]);
 assert.equal(r.conflicts.filter(c=>c.field==='field').length,0);
});
