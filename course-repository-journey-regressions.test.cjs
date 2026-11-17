/* Reproduce personal-course edit journeys using actual UI handlers and state engine. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Library=require('./dist/course-library-engine.js'),copy=value=>JSON.parse(JSON.stringify(value)),KEY='degreepath-guide-v3';
function sourceState({code='ENG101',evaluations=[]}={}){
  const state=Library.initialize(null);state.learning=[{id:'personal-course',provider:'My former college',code,title:'Writing I',credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-09-01',grade:'A',evaluations:copy(evaluations)}];state.profile.hasPrior='some';return state;
}
function mount(initial){
  const values=new Map([[KEY,JSON.stringify(initial)]]),nodes=new Map(),handlers=new Map();
  const field=()=>{let value='';return{get value(){return value;},set value(next){value=String(next??'');},checked:false,required:false,disabled:false,focus(){}};};
  function node(id){if(!nodes.has(id)){const n={id,hidden:false,open:false,dataset:{},textContent:'',innerHTML:'',value:'',addEventListener(type,handler){if(!handlers.has(id+':'+type))handlers.set(id+':'+type,[]);handlers.get(id+':'+type).push(handler);},setAttribute(){},querySelectorAll(){return[];},querySelector(){return null;},append(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}};nodes.set(id,n);}return nodes.get(id);}
  const form=node('course-status-form');form.elements=Object.fromEntries(['provider','code','title','credits','creditSystem','completedOn','grade','score','clearEvaluations'].map(name=>[name,field()]));form.reset=()=>{for(const input of Object.values(form.elements)){input.value='';input.checked=false;}};form.checkValidity=()=>!form.elements.clearEvaluations.required||form.elements.clearEvaluations.checked;form.reportValidity=()=>{};
  const document={getElementById:node,querySelector:selector=>selector==='dialog[open]'&&node('course-status-dialog').open?node('course-status-dialog'):null,querySelectorAll(){return[];},addEventListener(){},createElement(){return{dataset:{},setAttribute(){}};}};
  const context={console,URL,URLSearchParams,Intl,document,DegreeCourseLibrary:Library,DegreeSheet:require('./dist/sheet-state.js'),location:{search:''},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},addEventListener(){},dispatchEvent(){},localStorage:{getItem:key=>values.get(key)||null,setItem(key,value){values.set(key,value);}},__initial:copy(initial)};context.window=context;
  let source=fs.readFileSync(path.join(__dirname,'dist/courses.js'),'utf8');const at=source.lastIndexOf('  (async()=>{');assert(at>=0,'The production course-library boot boundary exists.');
  source=source.slice(0,at)+`state=Library.initialize(__initial);render=function(){};window.__ui={editStatus};\n}());`;
  vm.runInNewContext(source,context,{filename:'courses.js'});
  return{open(id='personal-course'){const record=JSON.parse(values.get(KEY)).learning.find(record=>record.id===id);context.__ui.editStatus(record,record.status);},saved:()=>JSON.parse(values.get(KEY)),replaceStored:state=>values.set(KEY,JSON.stringify(state)),async submit(patch,{clearEvaluations=false}={}){for(const[key,value]of Object.entries(patch))form.elements[key].value=value;form.elements.clearEvaluations.checked=clearEvaluations;for(const handler of handlers.get('course-status-form:submit')||[])await handler({target:form,preventDefault(){}});},async refresh(){for(const handler of handlers.get('course-status-refresh:click')||[])await handler({});},review:()=>({visible:!node('course-status-review').hidden,unsaved:node('course-status-unsaved-values').innerHTML,message:node('course-status-review-message').textContent,saveDisabled:node('course-status-save').disabled}),error:()=>node('course-status-error').textContent,dialogOpen:()=>node('course-status-dialog').open,form};
}
test('a record correction link can actually edit the course identity requested by degree-fit guidance',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'dist/courses.html'),'utf8'),form=html.match(/<form id="course-status-form">([\s\S]*?)<\/form>/)?.[1];assert(form);
  for(const name of ['provider','code','title'])assert.match(form,new RegExp('name="'+name+'"'),'Edit course details needs a '+name+' field, not only progress and credit quantities');
  const ui=mount(sourceState({code:''}));ui.open();await ui.submit({provider:'My former college',code:'ENG101',title:'Writing I'});assert.equal(ui.saved().learning[0].code,'ENG101');
});
test('an older edit dialog cannot silently replace source facts and approvals added in another tab',async()=>{
  const initial=sourceState(),ui=mount(initial);ui.open();assert.equal(ui.form.elements.clearEvaluations.required,false);
  const concurrent=copy(initial);Object.assign(concurrent.learning[0],{credits:4,creditSystem:'quarter',score:95,evaluations:[{programId:'newly-evaluated-degree',requirementId:'composition',status:'confirmed'}]});ui.replaceStored(concurrent);
  await ui.submit({grade:'B'});
  assert.deepEqual(ui.saved().learning,concurrent.learning,'Refresh or review the changed source record before overwriting it and clearing a new school evaluation');
  assert.equal(ui.dialogOpen(),true);assert.match(ui.error(),/changed|updated|review|reopen/i);
});
test('an explicitly acknowledged academic edit still updates the record and clears its stale placement',async()=>{
  const initial=sourceState({evaluations:[{programId:'old-degree',requirementId:'writing',status:'confirmed'}]}),ui=mount(initial);ui.open();assert.equal(ui.form.elements.clearEvaluations.required,false,'No-op inspection is not a request to clear placements');
  await ui.submit({grade:'B'},{clearEvaluations:true});const record=ui.saved().learning[0];assert.equal(record.grade,'B');assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.deepEqual(record.evaluations,[]);assert.equal(ui.dialogOpen(),false);
});
test('correcting a catalog course never carries its old aliases, source evidence or approval to the new identity',async()=>{
  const initial=sourceState({evaluations:[{programId:'old-degree',requirementId:'writing',status:'confirmed'}]});Object.assign(initial.learning[0],{catalogCourseId:'old-listed-course',codeAliases:['OLD-ACE-001'],sourceListingCode:'Old provider code',sourceUrl:'https://example.edu/old-course',sourceCheckedAt:'2026-11-01',codeBasis:'provider-listing',recommendationStatus:'current',creditBasis:'curated-course-map',mappedCourseIds:['old-option'],sourceProgramId:'old-program',institution:'Old school'});
  const ui=mount(initial);ui.open();const correction={provider:'Correct original college',code:'ENG 102',title:'Writing II'};
  await ui.submit(correction);assert.deepEqual(ui.saved().learning,initial.learning,'Existing evaluations require visible consent before correcting the source identity');
  await ui.submit(correction,{clearEvaluations:true});const record=ui.saved().learning[0];assert.equal(record.provider,correction.provider);assert.equal(record.code,correction.code);assert.equal(record.title,correction.title);assert.equal(record.credits,3);assert.equal(record.creditSystem,'semester');assert.equal(record.grade,'A');assert.equal(record.completedOn,'2026-09-01');assert.deepEqual(record.evaluations,[]);
  for(const name of ['catalogCourseId','codeAliases','sourceListingCode','sourceUrl','sourceCheckedAt','recommendationStatus','mappedCourseIds','sourceProgramId','institution'])assert.equal(record[name],undefined,'A different source must not inherit '+name);
  assert.equal(record.codeBasis,'student-record');assert.equal(record.creditBasis,'not-yet-known','Unchanged quantities from the old catalog must not become a student-confirmed quantity for the corrected course');
});
test('reviewing a concurrent update retains unsaved input and requires fresh consent for its newly added placement',async()=>{
  const initial=sourceState(),ui=mount(initial);ui.open();const current=copy(initial);Object.assign(current.learning[0],{credits:4,creditSystem:'quarter',score:95,evaluations:[{programId:'new-degree',requirementId:'writing',status:'confirmed'}]});ui.replaceStored(current);
  await ui.submit({grade:'B'});assert(ui.review().visible);assert.equal(ui.review().saveDisabled,true);assert.match(ui.review().unsaved,/<dd>B<\/dd>/);assert.equal(ui.form.elements.grade.value,'B');assert.deepEqual(ui.saved().learning,current.learning);
  await ui.refresh();assert.equal(ui.review().saveDisabled,false);assert.equal(ui.form.elements.credits.value,'4');assert.equal(ui.form.elements.creditSystem.value,'quarter');assert.equal(ui.form.elements.score.value,'95');assert.equal(ui.form.elements.grade.value,'A');assert.equal(ui.form.elements.clearEvaluations.checked,false);assert.match(ui.review().unsaved,/<dd>B<\/dd>/);assert.deepEqual(ui.saved().learning,current.learning);
  await ui.submit({grade:'B'});assert.equal(ui.form.elements.clearEvaluations.required,true);assert.deepEqual(ui.saved().learning,current.learning,'Loading the latest details is not consent to clear its newly added placement');
  await ui.submit({grade:'B'},{clearEvaluations:true});const saved=ui.saved().learning[0];assert.equal(saved.grade,'B');assert.equal(saved.credits,4);assert.equal(saved.creditSystem,'quarter');assert.equal(saved.score,95);assert.deepEqual(saved.evaluations,[]);
});
test('a correction uses the current plan state and does not overwrite unrelated changes in another tab',async()=>{
  const initial=sourceState(),ui=mount(initial);ui.open();const latest=copy(initial);latest.profile.degree='New degree chosen elsewhere';latest.scenarios['new-degree']={optionSelections:{writing:'specific-course'}};ui.replaceStored(latest);
  await ui.submit({grade:'B'});assert.equal(ui.saved().learning[0].grade,'B');assert.equal(ui.saved().profile.degree,latest.profile.degree);assert.deepEqual(ui.saved().scenarios,latest.scenarios);
});
test('an old editor cannot resurrect a course removed in another tab',async()=>{
  const initial=sourceState(),ui=mount(initial);ui.open();const latest=copy(initial);latest.learning=[];ui.replaceStored(latest);await ui.submit({grade:'B'});assert.deepEqual(ui.saved().learning,[]);assert.equal(ui.dialogOpen(),true);assert.match(ui.error(),/removed/i);assert.match(ui.review().unsaved,/<dd>B<\/dd>/);
});
test('saving unchanged catalog credit estimates does not relabel them as original student-record quantities',async()=>{
  const initial=sourceState();Object.assign(initial.learning[0],{catalogCourseId:'listed-course',creditBasis:'curated-course-map',codeBasis:'provider-listing',sourceUrl:'https://example.edu/course'});const ui=mount(initial);ui.open();await ui.submit({});assert.equal(ui.saved().learning[0].creditBasis,'curated-course-map');assert.equal(ui.saved().learning[0].catalogCourseId,'listed-course');
});
test('inspecting and saving an evaluated record unchanged does not ask to clear or normalize its original facts',async()=>{
  const initial=sourceState({evaluations:[{programId:'old-degree',requirementId:'writing',status:'confirmed'}]});Object.assign(initial.learning[0],{grade:'Pass',institution:'Original college',sourceProgramId:'original-program'});const ui=mount(initial);ui.open();await ui.submit({});assert.deepEqual(ui.saved().learning,initial.learning);assert.equal(ui.dialogOpen(),false);assert.equal(ui.form.elements.clearEvaluations.required,false);
});
test('correcting a saved interest preserves unknown quantities and never turns it into finished credit',async()=>{
  const initial=sourceState({code:''});Object.assign(initial.learning[0],{status:'saved',credits:null,creditSystem:null,completedOn:'',grade:'',catalogCourseId:'old-listing',codeAliases:['OLD-ALIAS']});const ui=mount(initial);ui.open();await ui.submit({code:'NEW-001'});const record=ui.saved().learning[0];assert.equal(record.code,'NEW-001');assert.equal(record.status,'saved');assert.equal(record.credits,null);assert.equal(record.creditSystem,null);assert.deepEqual(record.evaluations,[]);assert.equal(record.catalogCourseId,undefined);assert.equal(record.codeAliases,undefined);
});
