const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js');
const KEY='degreepath-guide-v3',DRAFT='degreesteps-profile-draft-v1',copy=value=>JSON.parse(JSON.stringify(value));
function data(){
 const route={id:'campus-degree',modelId:'campus-model',school:'Example University',title:'Business BS',level:'bachelor',field:'business',fields:['business'],modalities:['campus'],goals:['any-degree','career-growth','change-career']};
 const model={id:'campus-model',school:route.school,title:route.title,level:'bachelor',format:'Residential',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:3,sources:[{id:'catalog',url:'https://example.edu/catalog'}],requirements:[{id:'writing',code:'ENG101',title:'Writing',credits:3,category:'general',options:[{id:'sophia-writing',provider:'Sophia',code:'S1',credits:3,title:'Writing',creditSystem:'semester',evidence:'published',sourceIds:['catalog']}]},{id:'capstone',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[{id:'capstone-option',provider:'University',code:'CAP',credits:3,title:'Capstone',creditSystem:'semester',evidence:'published',sourceIds:['catalog']}]}]};
 const registry={models:[{id:model.id,routeIds:[route.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}]};
 // This synthetic route is deliberately reviewed. Bind the fixture's discovery
 // metadata to its exact model instead of treating a complete ledger as review.
 const publicationIndex={schemaVersion:1,privateRecordsIncluded:false,registryRevision:'academic-v1:'+'1'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),plans:[{modelId:model.id,routeIds:[route.id],level:Catalog.publicationLevel(route.level),publicationReady:true,modelFingerprint:Catalog.publicationModelFingerprint(model,route.level)}]};
 const catalog=Catalog.attachPublicationIndex({pathways:[route],curriculumRegistry:registry},publicationIndex,registry);
 return {catalog,models:[model],route};
}
function fixture({initial,stored,extraStorage={},dataset}={}){
 const d=dataset||data();initial=copy(initial||Journey.initialize(null,null,d.catalog));stored=copy(stored||initial);const storage=new Map([[KEY,JSON.stringify(stored)],...Object.entries(extraStorage)]),nodes=new Map(),handlers=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,values:{},innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){}},focus(){},querySelector(){return null;},setAttribute(){},insertAdjacentHTML(){}});return nodes.get(id);};
 const context={console,URL,URLSearchParams,Intl,TextEncoder,TextDecoder,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},body:node('body')},location:{pathname:'/portal.html',search:'',assign(value){context.__destination=value;},replace(value){context.__destination=value;}},history:{replaceState(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}getAll(name){const value=this.get(name);return value===undefined?[]:Array.isArray(value)?value:[value];}},CustomEvent:class{},setTimeout(){},clearTimeout(){},dispatchEvent(){},addEventListener(){},scrollTo(){},navigator:{},__fixture:JSON.stringify({state:initial,stored,...d})};context.window=context;vm.createContext(context);
 for(const match of fs.readFileSync(path.join(__dirname,'dist/portal.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){const source=fs.readFileSync(path.join(__dirname,'dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});}
 context.fetch=async()=>({ok:true,json:async()=>({templates:[{id:'example-template',pathwayId:'campus-degree',title:'Example campus plan',strategy:'balanced'}]})});
 const source=fs.readFileSync(path.join(__dirname,'dist/portal.js'),'utf8'),hooks=`const fixture=JSON.parse(__fixture);state=fixture.state;catalog=fixture.catalog;models=fixture.models;activePlanState=actualSavedTarget(fixture.stored)?clone(fixture.stored):null;render=function(){save();};prepareRecommendations=async()=>{window.__prepared=(window.__prepared||0)+1;};window.__profile={state:()=>state,continueFromQuiz:query=>startQuizContinuation(new URLSearchParams(query)),updatedCourses:()=>profileCourseChoicesUpdated,answer,action,start:startProfile,body:profileBody,question:questionBody,summary:profileSummaryHTML,resume:restoreProfileDraft,publicRoute:()=>openPublicRoute(new URLSearchParams('template=example-template')),choose:()=>{state=Journey.selectRoute(state,fixture.route,catalog);state.journey.profileFlowVersion=1;startProfile('target','degree');}};`;
 vm.runInContext(source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());'),context,{filename:'portal.js'});
 return{api:context.__profile,node,context,state:()=>copy(context.__profile.state()),stored:()=>JSON.parse(storage.get(KEY)),storage:()=>Object.fromEntries(storage),replaceStored:value=>storage.set(KEY,JSON.stringify(value)),async submit(values){const form=node('portal-profile-form');form.values=values;for(const handler of handlers.get('submit')||[])await handler({target:form,preventDefault(){}});},async edit(values,type='change'){const form=node('portal-profile-form');form.values=values;for(const handler of handlers.get(type)||[])await handler({target:{closest:()=>form,matches:()=>false}});}};
}
const goal={goal:'career-growth',field:'business',degreeLevel:'bachelor'},prior={prior:'some',military:'veteran',militaryRecords:'jst'},online={format:'online',learningPace:'self-paced',campusLocation:'any',campusTime:'any'},priority={priority:'cost',budget:'6000',weeklyHours:'12',proctoringPreference:'avoid',assessmentPreference:'projects'};
function selectedValue(html,name){
 const options=html.match(new RegExp('<select name="'+name+'">([\\s\\S]*?)<\\/select>'))?.[1];assert(options,'The existing preference is available in the form: '+name);
 const values=[...options.matchAll(/<option value="([^"]*)"([^>]*)>/g)];assert(values.length);return(values.find(match=>/\bselected\b/.test(match[2]))||values[0])[1];
}
async function exploreToPriorities(f){f.api.continueFromQuiz('');await f.submit(goal);await f.submit({prior:'none',military:'none'});await f.submit(online);assert.equal(f.state().journey.step,'priority');}
test('the monitored-exam choice is visible before optional details and clearly scoped to outside courses',async()=>{
 const f=fixture();await exploreToPriorities(f);const html=f.api.body('priority'),optional=html.indexOf('<details class="portal-tip">'),preference=html.indexOf('name="proctoringPreference"');
 assert(preference>=0&&preference<optional,'A student can see the exam preference without opening optional details');
 assert.match(html,/Exams in outside courses/);assert.match(html,/Show all eligible courses/);assert.match(html,/Prefer courses without monitored exams/);
 assert.match(html,/Self-paced courses can still have monitored exams\. Your university may also require exams\./);
 assert(html.indexOf('name="budget"')>optional);assert(html.indexOf('name="weeklyHours"')>optional);assert(html.indexOf('name="assessmentPreference"')>optional);
 assert.equal((html.match(/name="proctoringPreference"/g)||[]).length,1);assert.doesNotMatch(html,/<select name="proctoringPreference"[^>]*\brequired\b/);
});
test('self-paced learners can continue with the existing open-exam default without adding budget or study-time answers',async()=>{
 const f=fixture();await exploreToPriorities(f);const html=f.api.body('priority');
 assert.equal(selectedValue(html,'proctoringPreference'),'open');assert.equal(selectedValue(html,'assessmentPreference'),'mixed');
 await f.submit({priority:'balanced',proctoringPreference:selectedValue(html,'proctoringPreference'),assessmentPreference:selectedValue(html,'assessmentPreference')});
 const state=f.state();assert.equal(state.journey.step,'routes');assert.equal(state.journey.profileCompleted,true);assert.equal(state.profile.learningPace,'self-paced');assert.equal(state.profile.proctoringPreference,'open');assert.equal(state.profile.assessmentPreference,'mixed');assert.deepEqual(state.learning,[]);assert.equal(f.context.__prepared,1);assert.doesNotMatch(f.api.summary(),/without monitored exams/);
});
test('an existing assessment choice remains editable after Back and reload while the active plan stays saved',async()=>{
 const initial=activeState();Object.assign(initial.profile,{proctoringPreference:'avoid',assessmentPreference:'writing'});
 const f=fixture({initial});f.api.start('preferences');await f.submit({prior:'some',military:'none'});await f.submit({learningPace:'self-paced',campusLocation:'any',campusTime:'any'});
 assert.equal(selectedValue(f.api.body('priority'),'proctoringPreference'),'avoid');assert.equal(selectedValue(f.api.body('priority'),'assessmentPreference'),'writing');
 const edits={priority:'speed',proctoringPreference:'open',assessmentPreference:'exams',budget:'',weeklyHours:''};await f.edit(edits);assert.deepEqual(f.stored(),initial);
 await f.api.action('back');assert.equal(f.state().journey.step,'format');await f.submit({learningPace:'self-paced',campusLocation:'any',campusTime:'any'});assert.equal(selectedValue(f.api.body('priority'),'proctoringPreference'),'open');
 const saved=f.stored(),next=fixture({initial:Journey.initialize(saved,null,data().catalog),stored:saved,extraStorage:f.storage()});assert.equal(next.api.resume('preferences'),true);assert.equal(next.state().journey.step,'priority');assert.equal(selectedValue(next.api.body('priority'),'proctoringPreference'),'open');assert.equal(selectedValue(next.api.body('priority'),'assessmentPreference'),'exams');
 await next.submit(edits);const result=next.stored();assert.equal(result.profile.proctoringPreference,'open');assert.equal(result.profile.assessmentPreference,'exams');assert.equal(result.profile.priority,'speed');assert.equal(result.profile.modality,'campus');assert.equal(result.selectedPathwayId,initial.selectedPathwayId);assert.deepEqual(result.learning,initial.learning);assert.deepEqual(result.scenarios,initial.scenarios);assert.deepEqual(result.sheet.notes,initial.sheet.notes);assert.doesNotMatch(next.api.summary(),/without monitored exams/);
});
test('exploration asks existing coursework and military context before personalized results',async()=>{
 const f=fixture();f.api.continueFromQuiz('');assert.equal(f.state().journey.step,'purpose');assert.match(f.api.body('purpose'),/What would a degree help you do/);assert.doesNotMatch(f.api.body('purpose'),/name="(?:priority|format|prior)"/);
 await f.submit(goal);assert.equal(f.state().journey.step,'prior');assert.equal(f.context.__prepared,undefined);assert.doesNotMatch(f.api.body('prior'),/type="file"/);
 await f.submit(prior);assert.equal(f.state().profile.militaryStatus,'veteran');assert.equal(f.state().profile.hasPrior,'some');assert.equal(f.state().journey.step,'format');assert.equal(f.context.__prepared,undefined);
 await f.submit(online);assert.equal(f.state().journey.step,'priority');await f.submit(priority);
 const state=f.state();assert.equal(state.journey.step,'routes');assert.equal(state.journey.profileCompleted,true);assert.equal(state.journey.intakeCompleted,true);assert.equal(state.profile.budget,6000);assert.equal(state.profile.weeklyHours,12);assert.equal(state.profile.proctoringPreference,'avoid');assert.equal(f.context.__prepared,1);assert.deepEqual(state.learning,[]);assert.match(f.api.summary(),/Prefer self-paced courses/);assert.match(f.api.summary(),/Prefer outside courses without monitored exams/);assert.doesNotMatch(f.api.summary(),/Prefer no proctored exams/);
});
test('online students skip campus fields while campus choices are retained across Back and reload',async()=>{
 const f=fixture();f.api.continueFromQuiz('');await f.submit(goal);await f.submit(prior);await f.edit(online);await f.submit(online);assert.match(f.api.body('format'),/id="portal-profile-campus" hidden/);
 await f.api.action('back');assert.equal(f.state().journey.step,'format');assert.equal(f.state().profile.learningPace,'self-paced');
 const campus={format:'campus',learningPace:'any',campusLocation:'near-home',homeState:'VA',campusInterests:['sports','housing'],campusTime:'two-years'};await f.edit(campus);await f.submit(campus);
 const saved=f.stored(),next=fixture({initial:Journey.initialize(saved,null,data().catalog),stored:saved,extraStorage:f.storage()});assert.equal(next.api.resume(),true);assert.equal(next.state().journey.step,'priority');await next.api.action('back');assert.deepEqual(next.state().profile.campusInterests,['sports','housing']);assert.match(next.api.body('format'),/value="VA" selected/);assert.match(next.api.body('format'),/name="campusInterests" value="sports" checked/);assert.match(next.api.body('format'),/Your degree requirements determine the semesters you need/);
});
test('a known degree completes personalization once and preserves its campus format',async()=>{
 const f=fixture();f.api.choose();assert.equal(f.state().journey.step,'prior');await f.submit({prior:'none',military:'none'});const html=f.api.body('format');assert.doesNotMatch(html,/name="format"/);assert.match(html,/Your current degree/);await f.submit({learningPace:'any',campusLocation:'relocate',campusTime:'one-year',campusInterests:['sports']});await f.submit({...priority,priority:'speed'});
 assert.equal(f.state().selectedPathwayId,'campus-degree');assert.equal(f.state().profile.modality,'campus');assert.equal(f.state().journey.completed,true);assert.equal(f.state().journey.intakeCompleted,true);assert.equal(f.state().journey.profileCompleted,true);assert.equal(f.state().journey.profileFlow,undefined);
});
function activeState(){const d=data();let state=Journey.selectRoute(Journey.initialize(null,null,d.catalog),d.route,d.catalog);state.journey={...state.journey,intakeCompleted:true,completed:true,view:'home'};state.learning=[{id:'original',provider:'Former College',code:'HIST101',title:'History',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];state.sheet.notes={private:'Keep this private note'};state.scenarios={'campus-model':{optionSelections:{writing:'sophia-writing'}}};return state;}
test('preference-only updates preserve the current degree and latest courses, notes and scenarios',async()=>{
 const initial=activeState(),f=fixture({initial});f.api.start('preferences');assert.deepEqual(f.stored(),initial);await f.submit({prior:'some',military:'none'});assert.doesNotMatch(f.api.body('format'),/name="format"/);
 await f.submit({learningPace:'any',campusLocation:'near-home',homeState:'VA',campusTime:'two-years',campusInterests:['housing']});
 const newer=f.stored();newer.learning.push({id:'new-course',provider:'Former College',title:'Math',code:'MATH101',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});newer.sheet.notes.new='Added in another tab';newer.scenarios['campus-model'].futureChoice='Keep this';f.replaceStored(newer);
 await f.submit(priority);const saved=f.stored();assert.deepEqual(saved.learning,newer.learning);assert.deepEqual(saved.sheet.notes,newer.sheet.notes);assert.deepEqual(saved.scenarios,newer.scenarios);assert.equal(saved.selectedPathwayId,initial.selectedPathwayId);assert.equal(saved.profile.modality,'campus');assert.equal(saved.profile.goal,initial.profile.goal);assert.equal(saved.profile.priority,'cost');assert.deepEqual(saved.profile.campusInterests,['housing']);assert.equal(f.state().journey.view,'home');assert.equal(f.storage()[DRAFT],undefined);
});
test('returning profile submission replaces blocked future exam pins while preserving current and completed courses',async()=>{
 const d=data(),model=d.models[0],outside=(id,provider,code)=>({id,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['catalog']});
 const row=(id,code)=>({id,code:id.toUpperCase(),title:id,credits:3,category:'general',options:[outside('clep-'+id,'CLEP',code),outside('sophia-'+id,'Sophia','SOPH-'+id)]});
 model.totalCredits=12;model.externalMaxCredits=9;model.requirements=[row('writing','CLEP-0041'),row('taking','CLEP-0007'),row('finished','CLEP-0030'),model.requirements[1]];
 const publication={...d.catalog.publicationIndex,plans:[{...d.catalog.publicationIndex.plans[0],modelFingerprint:Catalog.publicationModelFingerprint(model,d.route.level)}]};d.catalog=Catalog.attachPublicationIndex(d.catalog,publication,d.catalog.curriculumRegistry);
 let initial=Journey.selectRoute(Journey.initialize(null,null,d.catalog),d.route,d.catalog);initial.journey={...initial.journey,intakeCompleted:true,completed:true,view:'home'};
 initial.learning=[{id:'currently-enrolled',provider:'CLEP',code:'CLEP-0007',title:'American Government',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},{id:'finished-credit',provider:'CLEP',code:'CLEP-0030',title:'Principles of Microeconomics',credits:3,creditSystem:'semester',status:'earned',evaluations:[],privateNote:'Keep this original record'}];
 initial.sheet.notes={private:'Keep my note'};initial.scenarios[model.id]={providers:['CLEP','Sophia'],optionSelections:{writing:'clep-writing',taking:'clep-taking',finished:'clep-finished'},fees:14};initial.scenarios['another-degree']={optionSelections:{exam:'keep-this-choice'}};
 const f=fixture({initial,dataset:d});f.api.start('preferences');await f.submit({prior:'some',military:'none'});await f.submit({learningPace:'any',campusLocation:'any',campusTime:'any'});assert.deepEqual(f.stored(),initial,'Browsing preferences cannot replace course choices');
 await f.submit(priority);const saved=f.stored();assert.equal(saved.profile.proctoringPreference,'avoid');assert.equal(f.api.updatedCourses(),1);assert.equal(f.node('portal-step-error').textContent,'');
 assert.deepEqual(saved.scenarios[model.id],{...initial.scenarios[model.id],optionSelections:{taking:'clep-taking',finished:'clep-finished'}});assert.deepEqual(saved.scenarios['another-degree'],initial.scenarios['another-degree']);assert.deepEqual(saved.learning,initial.learning);assert.deepEqual(saved.sheet.notes,initial.sheet.notes);
 const next=Journey.buildDraft(saved,d.catalog,d.models);assert.equal(next.plan.validation.academicCountsValid,true);assert(!next.plan.setupIssues.some(issue=>issue.code==='invalid_selection'));assert.equal(next.plan.rows.find(item=>item.requirementId==='taking').plannedLearningStatus,'in-progress');
});
test('a conflicting starting-from-zero answer never erases an existing learning record',async()=>{
 const initial=activeState(),f=fixture({initial});f.api.start('preferences');await f.submit({prior:'none',military:'none'});assert.equal(f.state().journey.step,'prior');assert.match(f.node('portal-step-error').textContent,/saved completed learning/);assert.deepEqual(f.stored(),initial);
});
test('unfinished preferences survive reload without publishing changes to the active plan',async()=>{
 const initial=activeState(),f=fixture({initial});f.api.start('preferences');await f.submit({prior:'some',military:'veteran',militaryRecords:'jst'});await f.edit({learningPace:'self-paced',campusLocation:'near-home',homeState:'ME',campusInterests:['sports']});assert.deepEqual(f.stored(),initial);
 const next=fixture({initial:Journey.initialize(initial,null,data().catalog),stored:initial,extraStorage:f.storage()});assert.equal(next.api.resume('preferences'),true);assert.equal(next.state().journey.step,'format');assert.match(next.api.body('format'),/value="ME" selected/);await next.api.action('cancel-profile');assert.deepEqual(next.stored(),initial);assert.equal(next.state().journey.view,'home');
});
test('invalid optional budgets and a degree changed in another tab cannot overwrite the saved plan',async()=>{
 const initial=activeState(),f=fixture({initial});f.api.start('preferences');await f.submit({prior:'some',military:'none'});await f.submit({learningPace:'any',campusLocation:'any',campusTime:'any'});await f.submit({...priority,budget:'-5'});assert.match(f.node('portal-step-error').textContent,/Enter a budget/);assert.deepEqual(f.stored(),initial);
 const changed=f.stored();changed.selectedPathwayId='another-degree';changed.profile.pathwayId='another-degree';f.replaceStored(changed);await f.submit(priority);assert.match(f.node('portal-step-error').textContent,/active degree changed/);assert.deepEqual(f.stored(),changed);
});

test('a fresh public template starts the same early profile while existing personalized students keep the fast path',async()=>{
 const fresh=fixture();await fresh.api.publicRoute();assert.equal(fresh.state().journey.step,'prior');assert.equal(fresh.state().journey.profileFlow.mode,'target');assert.equal(fresh.state().journey.profileFlowVersion,1);assert.equal(fresh.state().templateOrigin.title,'Example campus plan');
 const initial=activeState(),returning=fixture({initial});await returning.api.publicRoute();assert.equal(returning.state().journey.view,'home');assert.equal(returning.state().journey.intakeCompleted,true);assert.equal(returning.state().journey.profileFlow,undefined);assert.deepEqual(returning.state().learning,initial.learning);
});
test('a first selected degree can resume personalization after its initial draft is saved',async()=>{
 const f=fixture();f.api.choose();assert.equal(f.state().journey.step,'prior');const saved=f.stored();assert.equal(saved.selectedPathwayId,'campus-degree');const next=fixture({initial:Journey.initialize(saved,null,data().catalog),stored:saved,extraStorage:f.storage()});assert.equal(next.api.resume('target'),true);assert.equal(next.state().journey.step,'prior');assert.equal(next.state().selectedPathwayId,'campus-degree');
});


test('the three starting choices keep existing courses and notes while advanced entry points remain optional',async()=>{
 const initial=activeState();initial.journey.step='start';
 const view=fixture({initial}),html=view.api.question('start'),primary=html.split('<details class="portal-tip portal-more-starts">')[0];
 assert.deepEqual([...primary.matchAll(/data-answer="([^"]+)"/g)].map(match=>match[1]),['target','audit','explore'],'the same order and words as Build my plan: Find a degree, Use my courses, Help me choose');
 assert.match(primary,/Find a degree|Change my degree/);assert.match(primary,/Use my courses/);assert.match(primary,/Help me choose/);
 assert.match(html,/<details class="portal-tip portal-more-starts"><summary>More ways to start<\/summary>/);
 assert.match(html,/href="request-plan.html"/);assert.match(html,/href="degree-audit.html"/);assert.match(html,/href="courses.html\?tab=browse"/);
 for(const choice of ['explore','target','audit']){
  const f=fixture({initial}),before=f.state();await f.api.answer(choice);
  assert.deepEqual(f.state().learning,before.learning,choice+' keeps the original course collection');
  assert.deepEqual(f.state().sheet.notes,before.sheet.notes,choice+' keeps private notes');
  if(choice==='audit')assert.equal(f.context.__destination,'start.html?sort=fit','courses already in My courses are matched to degrees instead of being uploaded again');
  if(choice==='target')assert.equal(f.state().journey.step,'school');
  if(choice==='explore')assert.equal(f.context.__destination,'start.html?step=quiz','Help me choose is the same flow as Build my plan: the quiz first');
 }
 const fresh=activeState();fresh.journey.step='start';fresh.learning=[];const empty=fixture({initial:fresh});await empty.api.answer('audit');
 assert.equal(empty.context.__destination,'import-courses.html?from=portal','an empty course list starts with the upload');
});

// Help me choose is one flow: the 1-minute quiz (start.html?step=quiz), then these questions as an optional continuation.
test('the continuation after the quiz keeps its answers and still asks every portal question, saving the same data',async()=>{
 const initial=activeState(),f=fixture({initial}),before=f.state();
 f.api.continueFromQuiz('purpose=career-growth&subject=business&level=bachelor&format=online&priority=speed');
 let state=f.state();
 assert.equal(state.journey.step,'prior','a quiz goal answers the first question, so past courses and military service come next');
 assert.equal(state.journey.profileFlow.mode,'explore');assert.equal(state.journey.profileFlow.fromQuiz,true);
 assert.equal(state.profile.goal,'career-growth');assert.equal(state.profile.field,'business');assert.equal(state.profile.degreeLevel,'bachelor');
 assert.equal(state.selectedPathwayId,'','exploring never picks a degree for the student');
 assert.deepEqual(state.learning,before.learning,'My courses are kept');assert.deepEqual(state.sheet.notes,before.sheet.notes,'private notes are kept');
 assert.match(f.api.body('purpose'),/name="goal"/,'Back still reaches the goal question');
 assert.match(f.api.body('prior'),/name="prior"/);assert.match(f.api.body('prior'),/name="military"/);
 await f.submit(prior);state=f.state();assert.equal(state.journey.step,'format');assert.equal(state.profile.militaryStatus,'veteran');assert.equal(state.profile.hasPrior,'some');
 assert.equal(selectedValue(f.api.body('format'),'format'),'online','the quiz format is preselected');
 await f.submit(online);assert.equal(f.state().journey.step,'priority');
 assert.equal(selectedValue(f.api.body('priority'),'priority'),'speed','the quiz priority is preselected');
 await f.submit(priority);state=f.state();
 assert.equal(state.journey.step,'routes');assert.equal(state.journey.profileCompleted,true);
 assert.equal(state.profile.budget,6000);assert.equal(state.profile.weeklyHours,12);assert.equal(state.profile.proctoringPreference,'avoid');assert.equal(state.profile.priority,'cost');
 assert.equal(f.context.__prepared,1,'matching runs once, at the end');
});
test('the quiz continuation asks which licensed career, ignores unknown values and resumes after reload',async()=>{
 const f=fixture();f.api.continueFromQuiz('purpose=licensed-career&subject=not-a-subject&level=phd&format=moon&priority=fast');
 const state=f.state();assert.equal(state.journey.step,'purpose','a licensed career still asks which one');
 assert.match(f.api.body('purpose'),/value="teacher"/);
 assert.equal(selectedValue(f.api.body('purpose'),'field'),'any');assert.equal(selectedValue(f.api.body('purpose'),'degreeLevel'),'unsure');
 await f.submit({goal:'teacher',field:'any',degreeLevel:'bachelor'});assert.equal(f.state().journey.step,'prior');
 const saved=f.stored(),next=fixture({initial:Journey.initialize(saved,null,data().catalog),stored:saved,extraStorage:f.storage()});
 assert.equal(next.api.resume(),true);assert.equal(next.state().journey.step,'prior');assert.equal(next.state().journey.profileFlow.fromQuiz,true);
});
test('a licensed-career quiz answer is never replaced by the generic "Earn a degree" goal',async()=>{
 // Without a career, the goal question offers only the licensed careers, with none preselected.
 const ask=fixture();ask.api.continueFromQuiz('purpose=licensed-career&level=bachelor');
 const body=ask.api.body('purpose');
 assert.doesNotMatch(body,/value="any-degree"/,'no generic goal to fall back to');
 for(const career of ['teacher','lawyer','pilot','health-professional'])assert.match(body,new RegExp('value="'+career+'"'));
 assert.equal(selectedValue(body.replace('<select required ','<select '),'goal'),'','no career is chosen for the student');assert.match(body,/<select required name="goal">/);
 assert.match(body,/<div id="portal-profile-subject" hidden>/,'a licensed career does not ask for a subject');
 // With the career from the quiz, it is carried into the profile and the journey, and the next question is past courses.
 const f=fixture();f.api.continueFromQuiz('purpose=licensed-career&career=teacher&level=bachelor&format=online&priority=cost');
 const state=f.state();
 assert.equal(state.journey.step,'prior');assert.equal(state.profile.goal,'teacher');
 assert.equal(state.journey.answers.purpose,'licensed-career');assert.equal(state.journey.answers.career,'teacher');
 assert.equal(selectedValue(f.api.body('purpose'),'goal'),'teacher','Back shows the career, not "Earn a degree"');
 // An unknown career is ignored, so the career question is asked again.
 const unknown=fixture();unknown.api.continueFromQuiz('purpose=licensed-career&career=astronaut');
 assert.equal(unknown.state().journey.step,'purpose');assert.equal(selectedValue(unknown.api.body('purpose').replace('<select required ','<select '),'goal'),'');
});
