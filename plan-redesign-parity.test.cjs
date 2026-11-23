/* Full production worksheet closures with synthetic browser surfaces and local
 * data only. This verifies behavior and rendered controls, not visual layout. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadData}=require('./scripts/audit-student-confirmations.cjs');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js');
const KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
const ids=new Set(['liberty-business-residential','tesu-general-management']);
const data=(()=>{const full=loadData();return{catalog:{...full.catalog,pathways:full.catalog.pathways.filter(route=>ids.has(route.modelId))},models:full.models.filter(model=>ids.has(model.id)),courseCatalog:require('./dist/data/course-catalog.json')};})();
const text=html=>String(html).replace(/<[^>]*>/g,' ').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"').replace(/\s+/g,' ').trim();

function mount({modelId='liberty-business-residential',change,editor=false,trackerResult,fetcher,fixtureData}={}){
  const sample=fixtureData||data;
  const route=sample.catalog.pathways.find(route=>route.modelId===modelId);
  let initial=Journey.selectRoute(Journey.initialize(null,null,sample.catalog),route,sample.catalog);
  initial=Journey.setPriorCredits(initial,'none');initial.journey.completed=true;
  if(change)initial=change(initial)||initial;
  const values=new Map([[KEY,JSON.stringify(initial)]]),nodes=new Map(),events=new Map(),windowEvents=new Map(),elementEvents=new Map(),writes=[],downloads=[],navigations=[],shares=[],requests=[],checklists=[],interactive=[],focusLog=[];
  let documentRef,renderedControlSequence=0,failWrites=false;
  const within=(element,container)=>container==='sheet-dialog'?element?.container==='sheet-dialog-content'||element?.container==='sheet-dialog':element?.container===container;
  function matches(element,selector){
    if(!element.isConnected)return false;
    if(selector==='button')return element.tagName==='BUTTON';
    if(selector.startsWith('#'))return element.id===selector.slice(1);
    const attributes=[...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
    if(!attributes.length)return false;
    return attributes.every(([,name,value])=>{const key=name.startsWith('data-')?name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()):null;const actual=key?element.dataset[key]:element.attributes[name];return value===undefined?actual!==undefined:String(actual)===value;});
  }
  function find(selector,container){
    for(const choice of selector.split(',')){
      const found=interactive.find(element=>(!container||within(element,container))&&matches(element,choice.trim()));if(found)return found;
    }
    // Real browsers create new select nodes when innerHTML replaces the grid.
    // Realize only the requested control from the actual rendered markup.
    const progress=selector.match(/^\[data-progress="([^"]+)"\]$/),grid=nodes.get('sheet-grid');
    if(progress&&(!container||container==='sheet-grid')&&grid){
      const escaped=progress[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const markup=grid.innerHTML.match(new RegExp('<select\\b[^>]*data-progress="'+escaped+'"[^>]*>([\\s\\S]*?)<\\/select>'));
      if(markup){const fresh=node('rendered-progress-'+(++renderedControlSequence));fresh.id='';fresh.tagName='SELECT';fresh.dataset={progress:progress[1]};fresh.container='sheet-grid';fresh.value=markup[1].match(/<option value="([^"]+)" selected/)?.[1]||'planned';interactive.push(fresh);return fresh;}
    }
    return null;
  }
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{id,hidden:false,open:false,isConnected:true,innerHTML:'',textContent:'',value:'',dataset:{},children:[],attributes:{},
        classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},toggle(name,force){const active=force===undefined?!classes.has(name):force;if(active)classes.add(name);else classes.delete(name);return active;},contains:name=>classes.has(name)},
        addEventListener(type,handler){const key=id+':'+type;if(!elementEvents.has(key))elementEvents.set(key,[]);elementEvents.get(key).push(handler);},setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];},hasAttribute(name){return Object.hasOwn(this.attributes,name);},
        querySelector(selector){return selector==='summary'?node(id+'-summary'):find(selector,id);},querySelectorAll(){return[];},insertAdjacentHTML(position,value){this.innerHTML+=value;},
        append(value){this.children.push(value);},prepend(value){this.children.unshift(value);},contains(element){return element===this||within(element,id);},
        focus(){if(!this.isConnected||within(this,'sheet-dialog')&&!node('sheet-dialog').open)return;this.focused=true;if(documentRef)documentRef.activeElement=this;focusLog.push(this);},
        scrollIntoView(){this.scrolled=true;},showModal(){this.open=true;},close(){this.open=false;},closest(selector){if(selector==='button'&&this.tagName==='BUTTON')return this;if(selector==='#sheet-dialog'&&within(this,'sheet-dialog'))return node('sheet-dialog');if(selector==='[data-requirement]'&&this.dataset.compareRow)return{dataset:{requirement:this.dataset.compareRow}};return matches(this,selector)?this:null;}});
      const element=nodes.get(id);let html='';
      Object.defineProperty(element,'innerHTML',{get(){return html;},set(value){html=value;if(id!=='sheet-grid'&&id!=='sheet-dialog-content')return;for(const child of interactive){if(within(child,id)){child.isConnected=false;if(documentRef?.activeElement===child)documentRef.activeElement=node('body');}}}});
    }
    return nodes.get(id);
  }
  const blobs=new Map();let blobSequence=0;
  class FixtureURL extends URL{static createObjectURL(blob){const url='blob:synthetic/'+(++blobSequence);blobs.set(url,blob);return url;}static revokeObjectURL(){}}
  const document={getElementById:node,activeElement:null,body:node('body'),querySelector:selector=>find(selector),querySelectorAll(){return[];},dispatchEvent(){},
    addEventListener(type,handler){if(!events.has(type))events.set(type,[]);events.get(type).push(handler);},
    createElement(tag){const element=node('created-'+nodes.size);element.tagName=tag.toUpperCase();element.click=function(){downloads.push({filename:this.download,blob:blobs.get(this.href)});};return element;}};
  documentRef=document;
  const context={console,URL:FixtureURL,URLSearchParams,Intl,Math,Date,JSON,Blob,TextEncoder,TextDecoder,CSS:{escape:value=>String(value)},document,
    location:{origin:'https://degree.synthetic.invalid',pathname:'/plan.html',search:editor?'?editor=1':'?group=section',assign(value){navigations.push(value);},replace(value){navigations.push(value);}},
    history:{replaceState(){}},navigator:{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}getAll(name){return this.has(name)?[this.get(name)]:[];}},
    setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(){},scrollTo(){},dispatchEvent(){},
    addEventListener(type,handler){if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(handler);},
    localStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){if(failWrites)throw Error('Synthetic storage quota');values.set(key,value);writes.push(copy(JSON.parse(value)));}},
    async fetch(url){requests.push(url);if(fetcher){const response=fetcher(url);if(response)return await response;}if(typeof url!=='string'||!/^data\/[a-zA-Z0-9_.\/-]+\.json$/.test(url)||url.includes('..'))throw Error('No network is permitted.');const file=path.join(__dirname,'dist',url);return fs.existsSync(file)?{ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))}:{ok:false,status:404};},
    __fixtureJSON:JSON.stringify({state:initial,...sample})};
  context.window=context;context.print=()=>{context.__printed=true;};vm.createContext(context);
  const html=fs.readFileSync('dist/plan.html','utf8');
  for(const match of html.matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){
    const source=fs.readFileSync(path.join('dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});
  }
  // Their independent mounted suites cover widget DOM behavior. Keep the real
  // checklist engine here and record the exact complete task model it receives.
  const trackerCalls=[];context.DegreeSavingsTracker=trackerResult===undefined?undefined:{update(node,state,draft,options){trackerCalls.push({id:node.id,options:copy(options||{})});node.innerHTML='Existing savings result';return Promise.resolve(trackerResult);}};context.DegreeMomentum=undefined;
  context.DegreeChecklistView={update(target,state,draft){checklists.push(context.DegreeChecklist.build(state,draft));target.innerHTML='Full checklist mounted';}};
  context.DegreeCommunity={sharePlan(payload){shares.push(copy(payload));}};
  const source=fs.readFileSync('dist/sheet.js','utf8');
  const hook=`const fixture=JSON.parse(__fixtureJSON);state=fixture.state;catalog=fixture.catalog;models=fixture.models;courseCatalog=fixture.courseCatalog;storageBaseline=localStorage.getItem(KEY);
    window.__parity={render,handleAction,rowDialog,compareCourses,applyComparedCourse,comparePreview,loadPlanIndex,chooseDialog,
      getDraft:()=>({state,pathway,program,plan,match,input,guidance}),getProjection:projection,
      search(value){state.sheet.search=value;renderGrid();},filter(value){progressFilter=value;renderGrid();}};
    render();`;
  const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hook+'\n}());');assert.notEqual(instrumented,source,'Use the production boot boundary');
  vm.runInContext(instrumented,context,{filename:'sheet.js'});writes.length=0;
  return {node,api:context.__parity,writes,downloads,navigations,shares,requests,checklists,focusLog,trackerCalls,active:()=>document.activeElement,
    control(name,dataset={},container='sheet-grid',tagName='SELECT'){const control=node(name);control.id='';control.tagName=tagName;control.dataset={...dataset};control.container=container;control.isConnected=true;interactive.push(control);return control;},
    button(name,dataset={},container='sheet-grid'){return this.control(name,dataset,container,'BUTTON');},
    replaceStored:value=>values.set(KEY,JSON.stringify(value)),setWriteFailure:value=>{failWrites=value;},saved:()=>JSON.parse(values.get(KEY)),draft:()=>context.__parity.getDraft(),projection:()=>context.__parity.getProjection(),
    async progress(id,status){const target={id:'',dataset:{progress:id},value:status,closest(){return null;}};for(const handler of events.get('change')||[])await handler({target});},
    async changeControl(control,value){control.value=value;for(const handler of events.get('change')||[])await handler({target:control});for(let i=0;i<12;i++)await Promise.resolve();},
    async submit(id,fields={}){const form={id,values:fields,dataset:{},querySelector(){return null;},append(node){this.error=node;}};for(const handler of events.get('submit')||[])await handler({target:form,preventDefault(){}});return form.error?.textContent||'';},
    async click(button){for(const handler of events.get('click')||[])await handler({target:button});for(let i=0;i<12;i++)await Promise.resolve();},
    async cancelDialog(){let prevented=false;for(const handler of elementEvents.get('sheet-dialog:cancel')||[])await handler({target:node('sheet-dialog'),preventDefault(){prevented=true;}});if(!prevented)node('sheet-dialog').close();for(let i=0;i<12;i++)await Promise.resolve();},
    async settle(){for(let i=0;i<12;i++)await Promise.resolve();}};
}

test('a full Liberty plan retains every rendered course, six columns and the actual curriculum hierarchy',()=>{
  const ui=mount(),draft=ui.draft(),view=ui.projection(),html=ui.node('sheet-grid').innerHTML;
  assert.equal(draft.plan.totals.required,120);assert.equal(draft.plan.totals.accounted,120);
  const rows=[...html.matchAll(/<tr class="course-plan-row" data-requirement="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(rows.toSorted(),Object.values(view.groups).flat().map(entry=>entry.requirementId).toSorted());assert(rows.length>30,'A real complete degree ledger is rendered');
  for(const head of html.matchAll(/<thead>([\s\S]*?)<\/thead>/g))assert.deepEqual([...head[1].matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map(match=>text(match[1])),['Course','Provider','Credits','Counts toward','Progress','Actions']);
  function visit(sections){for(const section of sections){assert(html.includes('="'+section.id+'"'),'Actual section remains present: '+section.title);visit(section.children||[]);}}
  visit(view.sections);assert.match(html,/Other graduation requirements/);
  assert.match(html,/data-progress="engl-101"/);assert.match(html,/data-compare-row="engl-101"/);
  assert.match(ui.node('sheet-titlebar').innerHTML,/Compare degrees/);assert.match(ui.node('sheet-toolbar').innerHTML,/Add my courses/);
  assert.match(ui.node('sheet-footer').innerHTML,/Download plan/);assert.equal(ui.saved().learning.length,0);
});

test('course names open internal details while provider enrollment and evidence stay explicit',()=>{
  const ui=mount();const html=ui.node('sheet-grid').innerHTML;
  assert.match(html,/<button[^>]*class="course-plan-name"[^>]*data-row="engl-101"/);
  assert.doesNotMatch(html,/<a[^>]*class="course-plan-name"/);
  ui.api.rowDialog('engl-101');const details=ui.node('sheet-dialog-content').innerHTML;
  assert.match(details,/English Composition I/);assert.match(details,/ENGL 101/);assert.match(details,/Open course|Find course at Sophia/);assert.match(details,/View transfer evidence/);assert.match(details,/Private note/);assert.match(details,/Change course or provider/);
  assert.equal(ui.writes.length,0,'Opening details does not change records or course choices');
});

test('the default plan previews a course change before applying it and retains all original records',async()=>{
  const ui=mount(),before=ui.saved(),draft=ui.draft(),requirement=draft.program.requirements.find(row=>row.id==='engl-101');
  const university=requirement.options.find(option=>option.provider==='University');assert(university);
  assert.throws(()=>ui.api.applyComparedCourse(requirement.id,university.id),/Preview this course again/);
  await ui.api.compareCourses(requirement.id,university.id);
  const preview=ui.node('sheet-dialog-content').innerHTML;
  assert.match(preview,/Use this course/);assert.match(preview,/data-apply-course="engl-101"/);assert.match(preview,/Pricing, assessments &amp; sources|Pricing, assessments & sources/);
  assert.deepEqual(ui.saved(),before,'Inspecting an alternative cannot apply it');assert.equal(ui.writes.length,0);
  ui.api.applyComparedCourse(requirement.id,university.id);await ui.settle();
  const after=ui.draft();assert.equal(after.plan.rows.find(row=>row.requirementId===requirement.id).option.id,university.id);
  assert.equal(after.plan.totals.external,draft.plan.totals.external-3);
  assert.equal(after.plan.totals.institutional,draft.plan.totals.institutional+3);
  assert.equal(after.plan.totals.accounted,120);assert.deepEqual(ui.saved().learning,before.learning);
  assert.match(ui.node('sheet-grid').innerHTML,/data-requirement="engl-101"/);assert.equal(after.plan.totals.confirmed,0);
});

test('multiple previews link the selected provider course and both close and Escape restore the newly rendered row control',async()=>{
 for(const closeMethod of ['button','escape']){
  const ui=mount(),before=ui.saved(),requirement=ui.draft().program.requirements.find(row=>row.id==='engl-101');
  const university=requirement.options.find(option=>option.provider==='University'),alternative=requirement.options.find(option=>option.provider==='StraighterLine');assert(university&&alternative);
  const expectedURL=data.courseCatalog.courses.find(course=>course.provider==='StraighterLine'&&course.mappingCode===alternative.code).url;
  const original=ui.button('original-course-row',{compareRow:requirement.id});original.focus();
  await ui.click(original);assert.equal(ui.node('sheet-dialog').open,true);assert.equal(original.isConnected,true);
  const firstPreview=ui.button('preview-university',{previewRow:requirement.id,option:university.id},'sheet-dialog-content');firstPreview.focus();await ui.click(firstPreview);
  assert.equal(firstPreview.isConnected,false,'Replacing modal content disconnects its old controls');
  const secondPreview=ui.button('preview-outside-course',{previewRow:requirement.id,option:alternative.id},'sheet-dialog-content');secondPreview.focus();await ui.click(secondPreview);
  const selectedLink=ui.node('sheet-dialog-content').innerHTML.match(/<p class="sheet-preview-course-link"><a href="([^"]+)"/);
  assert(selectedLink,'The selected alternative has an explicit course link');assert.equal(selectedLink[1].replaceAll('&amp;','&'),expectedURL);
  assert.doesNotMatch(selectedLink[1],/\.pdf(?:[?#]|$)/i,'The receiving-school guide is evidence, not the provider enrollment page');
  assert.match(ui.node('sheet-dialog-content').innerHTML,/Current course details/);assert.deepEqual(ui.saved(),before,'Multiple previews do not silently apply an option');assert.equal(ui.writes.length,0);
  const apply=ui.button('apply-selected-course',{applyCourse:requirement.id,option:alternative.id},'sheet-dialog-content');apply.focus();await ui.click(apply);
  assert.equal(ui.draft().plan.rows.find(row=>row.requirementId===requirement.id).option.id,alternative.id);assert.equal(original.isConnected,false,'Applying the choice replaces the original worksheet row');
  assert.match(ui.node('sheet-grid').innerHTML,/data-compare-row="engl-101"/);
  const refreshed=ui.button('newly-rendered-course-row',{compareRow:requirement.id});
  const close=ui.button('persistent-modal-close',{},'sheet-dialog');close.id='close-sheet-dialog';close.focus();if(closeMethod==='button')await ui.click(close);else await ui.cancelDialog();
  assert.equal(ui.node('sheet-dialog').open,false);assert.equal(ui.active(),refreshed,closeMethod+': focus returns to the current worksheet row, not a removed or hidden modal button');
  assert.equal(ui.focusLog.at(-1),refreshed);assert.deepEqual(ui.saved().learning,before.learning);assert.equal(ui.draft().plan.totals.confirmed,0);
 }
});

test('progress remains editable and a finished course requires separate explicit school confirmation',async()=>{
  const ui=mount();await ui.progress('engl-101','in-progress');assert.equal(ui.saved().learning[0].status,'in-progress');assert.equal(ui.draft().plan.totals.confirmed,0);
  ui.api.filter('in-progress');assert.match(ui.node('sheet-grid').innerHTML,/data-requirement="engl-101"/);
  await ui.progress('engl-101','completed');assert.equal(ui.saved().learning[0].status,'earned');assert.equal(ui.draft().plan.totals.reported,3);assert.equal(ui.draft().plan.totals.confirmed,0);
  ui.api.filter('all');ui.api.rowDialog('engl-101');assert.match(ui.node('sheet-dialog-content').innerHTML,/School evaluation pending/);assert.match(ui.node('sheet-dialog-content').innerHTML,/Record school confirmation/);
  await ui.submit('confirm-placement');assert.equal(ui.draft().plan.totals.confirmed,0,'An unchecked confirmation cannot award school credit');
  await ui.submit('confirm-placement',{confirm:'on'});assert.equal(ui.draft().plan.totals.confirmed,3);assert.equal(ui.saved().learning.length,1);
});

test('changing inline course progress restores keyboard focus to the fresh control after the plan rerenders',async()=>{
  const ui=mount(),original=ui.control('original-inline-progress',{progress:'engl-101'});original.value='planned';original.focus();
  await ui.changeControl(original,'in-progress');
  assert.equal(original.isConnected,false,'The existing select is replaced by the production grid render');
  const focused=ui.active();assert.notEqual(focused,original);assert.equal(focused.tagName,'SELECT');assert.equal(focused.dataset.progress,'engl-101');assert.equal(focused.value,'in-progress');
  assert.equal(focused.isConnected,true);assert.equal(ui.saved().learning[0].status,'in-progress');assert.equal(ui.draft().plan.totals.confirmed,0);
});

test('search, shared CLEP allocation and section filters preserve one source enrollment',async()=>{
  const ui=mount({modelId:'tesu-general-management',change:state=>Sheet.setCourse(state,'tesu-general-management','enc1010','clep-composition-enc1010')});
  const entries=Object.values(ui.projection().groups).flat(),bundle=entries.find(entry=>entry.requirementIds.includes('enc1010')&&entry.requirementIds.includes('enc1020'));assert(bundle);assert.equal(bundle.credits,6);
  ui.api.search('composition');const filtered=ui.node('sheet-grid').innerHTML;assert.match(filtered,/6 credits|>6<|six/i);assert.equal((filtered.match(new RegExp('data-requirement="'+bundle.requirementId+'"','g'))||[]).length,1);
  await ui.progress('enc1010','completed');assert.equal(ui.saved().learning.length,1);assert.equal(ui.saved().learning[0].credits,6);assert.equal(ui.draft().plan.totals.reported,6);assert.equal(ui.draft().plan.totals.confirmed,0);
});

test('all tasks, imports, preferences, cost assumptions and export tools remain reachable',async()=>{
  const ui=mount({change:state=>{state.profile.militaryStatus='veteran';state.profile.militaryRecords='jst';return state;}});
  assert(ui.checklists.at(-1).tasks.some(task=>task.id==='military-records'),'The unchanged checklist engine receives military context');
  ui.api.handleAction('all-tasks');assert.equal(ui.node('sheet-task-panel').open,true);assert.equal(ui.writes.length,0,'Opening the checklist is a presentation action');
  ui.api.handleAction('credits');assert.deepEqual(ui.navigations,['import-courses.html?from=plan'],'Add past courses retains the transcript/spreadsheet import entry');
  for(const [action,pattern]of [['more',/Detailed worksheet/],['options',/Military learning/],['cost-time',/sheet-cost-form/],['download',/Worksheet CSV/]]){
    ui.api.handleAction(action);await ui.settle();assert.match(ui.node('sheet-dialog-content').innerHTML,pattern,action+' retains its original form or controls');
  }
  ui.api.handleAction('compare-plans');assert.deepEqual(ui.navigations,['import-courses.html?from=plan','compare-plans.html']);assert.equal(ui.saved().learning.length,0);
});

test('private notes remain in private backups and stay out of worksheet CSV and public sharing',async()=>{
  const secret='Synthetic private advisor note that must never be shared';
  const privateTitle='Synthetic private unmatched transcript course';
  const ui=mount({change:state=>Sheet.updateLearning(Sheet.setNote(state,'liberty-business-residential','engl-101',secret),{id:'private-unmatched-record',provider:'Former college',code:'ORIG101',title:privateTitle,credits:3,creditSystem:'semester',status:'earned',evaluations:[]})});
  ui.api.handleAction('csv');assert.equal(ui.downloads.at(-1).filename,'degreesteps-worksheet.csv');assert(!((await ui.downloads.at(-1).blob.text()).includes(secret)));
  ui.api.handleAction('backup');assert.equal(ui.downloads.at(-1).filename,'degreesteps-private-backup.json');const backup=await ui.downloads.at(-1).blob.text();assert(backup.includes(secret));assert(backup.includes(privateTitle));
  ui.api.handleAction('share');assert.equal(ui.shares.length,1);const shared=JSON.stringify(ui.shares[0]);assert(!shared.includes(secret));assert(!shared.includes(privateTitle));assert.equal(ui.saved().learning.length,1);
});

test('the detailed worksheet retains inline provider/course controls and review tools',()=>{
  const ui=mount({editor:true}),html=ui.node('sheet-grid').innerHTML;
  assert.match(html,/Degree requirement/);assert.match(html,/Where to earn it/);assert.match(html,/data-provider="engl-101"/);assert.match(html,/data-course="engl-101"/);assert.match(html,/data-progress="engl-101"/);
  ui.api.handleAction('checks');assert.match(ui.node('sheet-dialog-content').innerHTML,/Plan checks|checks|requirement counts/i);assert.equal(ui.draft().plan.totals.accounted,120);
});


test('Cost & timing opens a researched range without removing personal price controls or altering courses',async()=>{
 const ui=mount(),before=JSON.stringify(ui.saved());assert.match(ui.node('sheet-toolbar').innerHTML,/Cost &amp; timing|Cost & timing/);
 ui.api.handleAction('cost-time');await ui.settle();await ui.settle();
 const summary=ui.node('sheet-cost-summary').innerHTML;
 assert.match(summary,/plan-estimate/);assert.match(summary,/Published-price planning range/);assert.match(summary,/Outside coursework/);assert.match(summary,/University coursework/);assert.match(summary,/semesters/);
 assert.match(ui.node('sheet-dialog-content').innerHTML,/id="sheet-cost-form"/);assert.match(ui.node('sheet-dialog-content').innerHTML,/name="universityRate"/);
 assert(ui.requests.includes('data/plan-estimate-rates.json'));assert.equal(JSON.stringify(ui.saved()),before);assert.equal(ui.writes.length,0);
});

test('a personal tuition quote stays primary instead of being replaced by a published-price range',async()=>{
 const ui=mount({change:state=>{state.scenarios['liberty-business-residential']={...state.scenarios['liberty-business-residential'],universityRate:100};return state;}}),before=JSON.stringify(ui.saved());
 ui.api.handleAction('cost-time');await ui.settle();await ui.settle();
 assert.doesNotMatch(ui.node('sheet-cost-summary').innerHTML,/Published-price planning range/);assert.match(ui.node('sheet-dialog-content').innerHTML,/name="universityRate"[^>]*value="100"/);assert.equal(JSON.stringify(ui.saved()),before);assert.equal(ui.writes.length,0);
});

// Changed deliberately: the shared planning range now leads whenever it can be calculated (as on plan pages,
// the finder and the planner); an available tuition-only savings result is shown below it as secondary.
test('a researched compact estimate leads the worksheet and any savings result is shown as a secondary tuition comparison',async()=>{
 const unavailable=mount({trackerResult:{available:false}});await unavailable.settle();await unavailable.settle();
 assert.match(unavailable.node('sheet-planning-range').innerHTML,/plan-estimate-compact/);assert.match(unavailable.node('sheet-planning-range').innerHTML,/data-action="cost-time"/);assert.equal(unavailable.node('sheet-planning-range').hidden,false);assert.equal(unavailable.writes.length,0);
 const available=mount({trackerResult:{available:true}});await available.settle();await available.settle();
 assert.match(available.node('sheet-planning-range').innerHTML,/Planning estimate/);assert.match(available.node('sheet-planning-range').innerHTML,/covers tuition, listed fees and outside courses/);
 assert.equal(available.node('sheet-savings-tracker').innerHTML,'Existing savings result');assert(available.requests.includes('data/plan-estimate-rates.json'));assert.equal(available.trackerCalls.filter(call=>call.id==='sheet-savings-tracker').at(-1).options.secondary,true);assert.equal(available.writes.length,0);
});


test('course preferences say they apply to this plan, keep Apply in a sticky footer, and ask before discarding unapplied changes',async()=>{
 for(const closeMethod of ['escape','button']){
  const ui=mount({trackerResult:{available:false}}),before=JSON.stringify(ui.saved());
  ui.api.handleAction('options');const html=ui.node('sheet-dialog-content').innerHTML;
  assert.match(html,/These choices apply to this plan only/);assert.match(html,/Course sources for this plan/);
  assert.match(html,/<div class="sheet-dialog-footer">[\s\S]*type="submit">Apply preferences<\/button><\/div><\/form>/);
  assert.equal(ui.node('sheet-dialog-savings').hidden,true,'The preferences tray starts with its own choices');
  const prompt=ui.control('unapplied-prompt',{unapplied:''},'sheet-options-form','DIV');prompt.hidden=true;const discard=ui.button('discard-options',{discardOptions:''},'sheet-options-form');discard.attributes['data-discard-options']='';
  ui.node('sheet-options-form').values={providers:'Sophia'};
  const close=ui.button('options-close-'+closeMethod,{},'sheet-dialog');close.id='close-sheet-dialog';
  if(closeMethod==='escape')await ui.cancelDialog();else await ui.click(close);
  assert.equal(ui.node('sheet-dialog').open,true,'Unapplied changes are not silently discarded');assert.equal(prompt.hidden,false);assert.equal(ui.active(),discard);
  await ui.click(discard);assert.equal(ui.node('sheet-dialog').open,false);assert.equal(JSON.stringify(ui.saved()),before,'Discard keeps the saved plan unchanged');
  ui.api.handleAction('options');await ui.cancelDialog();assert.equal(ui.node('sheet-dialog').open,false,'Without changes, Escape closes at once');
 }
});

function singleModelData(id){const full=loadData();return{catalog:{...full.catalog,pathways:full.catalog.pathways.filter(route=>route.modelId===id)},models:full.models.filter(model=>model.id===id),courseCatalog:data.courseCatalog};}
test('a WGU worksheet uses competency units in progress, sections, coverage and footer',async()=>{
 const id='curriculum-wgu-catalog-689e417cff765fc9',ui=mount({modelId:id,fixtureData:singleModelData(id)});await ui.settle();
 const grid=ui.node('sheet-grid').innerHTML,route=ui.node('sheet-route').innerHTML;
 assert.match(ui.node('sheet-titlebar').innerHTML,/of 112 competency units finished/);assert.match(grid,/0 \/ 34<\/strong> competency units finished/);assert.match(ui.node('sheet-titlebar').innerHTML,/data-summary-bucket="less">\d+<\/strong> for less/);assert.match(grid,/competency units must be taken at /);assert.match(grid,/<abbr title="Competency units">CUs<\/abbr>/);
 assert.doesNotMatch(grid,/\d credits (?:finished|planned|at the university|not yet mapped)/);assert.match(route,/competency units/);assert.doesNotMatch(route,/<small>units<\/small>/);
 assert.match(ui.node('sheet-footer').innerHTML,/112 competency units/);
});

test('Excelsior shows the partnership residency condition next to the standard minimum and explains a starting-route difference',async()=>{
 const ui=mount({modelId:'curriculum-excelsior-bs-psychology',fixtureData:singleModelData('curriculum-excelsior-bs-psychology')});await ui.settle();await ui.settle();
 let grid=ui.node('sheet-grid').innerHTML;
 assert.match(grid,/At least <strong>7<\/strong> credits must be taken at [^<]+ <small class="course-plan-residency-alt">\(standard enrollment\)<\/small>/);
 assert.match(grid,/data-residency-alternative="15">Partnership students admitted after December 31, 2024: at least 15 credits at the university\./);
 assert(ui.requests.includes('data/baseline-index.json'));
 const key='curriculum-excelsior-bs-psychology',state=ui.draft().state;state.scenarios[key]={...state.scenarios[key],providers:['Sophia','Study.com']};ui.api.render();await ui.settle();
 grid=ui.node('sheet-grid').innerHTML;assert.match(grid,/fewer outside credits than the starting route because StraighterLine is off in your course sources\./);
});

test('applying course preferences returns keyboard focus to the page instead of the document body',async()=>{
 const ui=mount();ui.api.handleAction('options');
 const error=await ui.submit('sheet-options-form',{reportCatalogYear:'2026-2027',providers:'Sophia',proctoringPreference:'open',priority:'balanced'});
 assert.equal(error,'');assert.equal(ui.node('sheet-dialog').open,false);assert.equal(ui.node('sheet-status').textContent,'Course preferences applied to this plan.');
 assert.notEqual(ui.active(),ui.node('body'));assert(ui.active()===ui.node('sheet-status')||ui.active()?.dataset?.action==='options');
});

test('a late cost-range response cannot replace another open dialog',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),ui=mount({fetcher:url=>url==='data/plan-estimate-rates.json'?pending:null});
 ui.api.handleAction('cost-time');await ui.settle();ui.api.handleAction('checks');const checks=ui.node('sheet-dialog-content').innerHTML,before=ui.node('sheet-cost-summary').innerHTML;
 release({ok:true,json:async()=>require('./dist/data/plan-estimate-rates.json')});await ui.settle();await ui.settle();
 assert.equal(ui.node('sheet-dialog-content').innerHTML,checks);assert.equal(ui.node('sheet-cost-summary').innerHTML,before);assert.equal(ui.writes.length,0);
 ui.api.handleAction('cost-time');await ui.settle();await ui.settle();assert.match(ui.node('sheet-cost-summary').innerHTML,/Published-price planning range/);
});

test('a late estimate for an old degree cannot appear in the replacement plan’s savings area',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),ui=mount({trackerResult:{available:false},fetcher:url=>url==='data/plan-estimate-rates.json'?pending:null});
 await ui.settle();const route=data.catalog.pathways.find(route=>route.modelId==='tesu-general-management'),current=ui.api.getDraft().state,preferences=copy(current);preferences.profile.modality='online';preferences.profile.classroomImportance='open';const next=Journey.selectRoute(preferences,route,data.catalog);Object.assign(current,next);ui.api.render();await ui.settle();
 release({ok:true,json:async()=>require('./dist/data/plan-estimate-rates.json')});await ui.settle();await ui.settle();
 assert.equal(ui.draft().program.id,'tesu-general-management');assert.equal(ui.node('sheet-savings-tracker').innerHTML,'Existing savings result');assert.doesNotMatch(ui.node('sheet-planning-range').innerHTML,/plan-estimate/);
 // The replacement is a plan awaiting school confirmation with no reviewed estimate: it says so, as the finder does,
 // and the tuition comparison below is labelled tuition-only.
 assert.match(ui.node('sheet-planning-range').innerHTML,/Cost needs confirmation/);assert.equal(ui.trackerCalls.filter(call=>call.id==='sheet-savings-tracker').at(-1).options.secondary,true);
});


function courseUpdateData({removedRequirement=true,disabledExistingOption=false}={}){
 const route={id:'course-update-route',modelId:'course-update-model',school:'Synthetic University',title:'B.A. Example',level:'bachelor',modalities:['online'],field:'general',fields:['general'],goals:['any-degree','career-growth','change-career']};
 const option=(id,code,provider='University')=>({id,provider,code,title:code,credits:3,creditSystem:'semester',creditOrigin:provider==='University'?'institutional':'alternative',evidence:'published',sourceIds:['catalog']});
 const requirement={id:removedRequirement?'replacement':'writing',code:'WRIT101',title:'Current writing requirement',credits:3,category:'general',options:[option('current-writing','WRIT101'),...(disabledExistingOption?[option('retired-writing','OLD101','Sophia')]:[])]};
 const model={id:route.modelId,school:route.school,title:route.title,level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:3,sources:[{id:'catalog',title:'Current catalog',url:'https://synthetic.invalid/catalog'}],requirements:[requirement,{id:'capstone',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[option('current-capstone','CAP')]}]};
 const registry={models:[{id:model.id,routeIds:[route.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}]};
 return {catalog:{pathways:[route],curriculumRegistry:registry},models:[model],courseCatalog:{courses:[]},route,model};
}
function earlierCourseChoices(state,{removedRequirement=true}={}){
 const id='course-update-model',obsolete=removedRequirement?'retired-elective':'writing';
 state.scenarios[id]={...state.scenarios[id],optionSelections:{[obsolete]:'retired-writing',capstone:'current-capstone'},futureChoice:'Keep the exact future preference'};
 state.sheet.notes={[id]:{[obsolete]:'Keep this note on an earlier requirement',capstone:'My current note'}};
 state.learning=[{id:'original-record',provider:'Former College',code:'HIST101',title:'Original history course',credits:3,creditSystem:'quarter',status:'earned',completedOn:'2025-05-01',grade:'A',privateNote:'Keep my original record',evaluations:[{programId:'other-degree',requirementId:'history',status:'confirmed'}]}];
 return state;
}

test('a removed requirement gets an explicit recovery action that preserves original work and saves earlier choices',async()=>{
 const sample=courseUpdateData(),ui=mount({modelId:sample.model.id,fixtureData:sample,change:state=>earlierCourseChoices(state)}),before=copy(ui.saved());
 assert(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'&&issue.requirementId==='retired-elective'));assert(!ui.draft().plan.rows.some(row=>row.requirementId==='retired-elective'));assert.match(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);
 ui.api.handleAction('checks');assert.match(ui.node('sheet-dialog-content').innerHTML,/Update course choices/);ui.api.handleAction('update-course-choices');
 assert.equal(ui.writes.length,0);assert.match(ui.node('sheet-dialog-content').innerHTML,/Saved versions/);assert.match(ui.node('sheet-dialog-content').innerHTML,/Your completed courses, grades, school evaluations and notes stay the same/);
 assert.doesNotMatch(ui.node('sheet-dialog-content').innerHTML,/type="checkbox"/);assert.deepEqual(ui.saved(),before);
 ui.api.handleAction('keep-course-choices');assert.deepEqual(ui.saved(),before);assert.equal(ui.node('sheet-dialog').open,false);
 ui.api.handleAction('update-course-choices');await ui.cancelDialog();assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);
 ui.api.handleAction('update-course-choices');assert.equal(await ui.submit('sheet-course-update-form'),'');
 const updated=ui.saved(),snapshot=updated.whatIf.snapshots.find(item=>item.label.startsWith('Before course update'));
 assert(snapshot);assert.deepEqual(snapshot.settings.optionSelections,before.scenarios[sample.model.id].optionSelections);assert.equal(updated.scenarios[sample.model.id].optionSelections.capstone,'current-capstone');assert(!Object.hasOwn(updated.scenarios[sample.model.id].optionSelections,'retired-elective'));
 assert.equal(updated.scenarios[sample.model.id].futureChoice,before.scenarios[sample.model.id].futureChoice);assert.deepEqual(updated.learning,before.learning);assert.deepEqual(updated.sheet.notes,before.sheet.notes);assert.deepEqual(updated.profile,before.profile);assert.equal(updated.selectedPathwayId,before.selectedPathwayId);assert.equal(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);assert.equal(ui.draft().plan.totals.accounted,6);assert.equal(ui.writes.length,1);
 const reloaded=mount({modelId:sample.model.id,fixtureData:sample,change:()=>copy(updated)});assert.equal(reloaded.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);assert.deepEqual(reloaded.saved().learning,before.learning);
});

test('a withdrawn course option can be refreshed while a completed school-confirmed original record stays intact',async()=>{
 const sample=courseUpdateData({removedRequirement:false}),ui=mount({modelId:sample.model.id,fixtureData:sample,change:state=>{state=earlierCourseChoices(state,{removedRequirement:false});state.learning=[{...state.learning[0],code:'ENG101',title:'Original completed writing',creditSystem:'semester',evaluations:[{programId:sample.model.id,requirementId:'writing',status:'confirmed'}]}];return state;}}),before=copy(ui.saved());
 assert(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'));const completed=ui.draft().plan.totals.confirmed;assert.equal(completed,3,'The original school-confirmed award is actually applied before the preference update');
 ui.api.handleAction('update-course-choices');assert.match(ui.node('sheet-dialog-content').innerHTML,/earlier course option is no longer listed/);assert.match(ui.node('sheet-dialog-content').innerHTML,/Your original recorded course stays in this requirement/);assert.equal(await ui.submit('sheet-course-update-form'),'');
 assert.deepEqual(ui.saved().learning,before.learning);assert.deepEqual(ui.saved().sheet.notes,before.sheet.notes);assert.equal(ui.draft().plan.totals.confirmed,completed);assert(!Object.hasOwn(ui.saved().scenarios[sample.model.id].optionSelections,'writing'));assert.equal(ui.saved().scenarios[sample.model.id].optionSelections.capstone,'current-capstone');
});

test('a course excluded only by source preferences is not silently removed as an obsolete choice',()=>{
 const sample=courseUpdateData({removedRequirement:false,disabledExistingOption:true}),ui=mount({modelId:sample.model.id,fixtureData:sample,change:state=>{state=earlierCourseChoices(state,{removedRequirement:false});state.scenarios[sample.model.id].providers=[];state.scenarios[sample.model.id].mappedProvidersReviewed=['Sophia'];return state;}});
 assert(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'));assert.doesNotMatch(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);const before=copy(ui.saved());ui.api.handleAction('update-course-choices');assert.match(ui.node('sheet-dialog-content').innerHTML,/Your course choices are current/);assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);
});

test('waiver settings preserve valid course pins from either current requirement list',()=>{
 const sample=courseUpdateData({removedRequirement:false}),waiverCourse={...copy(sample.model.requirements[0]),id:'waiver-writing',options:[{...copy(sample.model.requirements[0].options[0]),id:'waiver-writing-course'}]};
 sample.model.transferWaiverVariant={requirements:[waiverCourse,copy(sample.model.requirements[1])]};
 for(const useWaivers of [true,false]){
  const ui=mount({modelId:sample.model.id,fixtureData:sample,change:state=>{state.scenarios[sample.model.id]={...state.scenarios[sample.model.id],useWaivers,optionSelections:{writing:'current-writing','waiver-writing':'waiver-writing-course',capstone:'current-capstone'}};return state;}}),before=copy(ui.saved());
  assert.doesNotMatch(ui.node('sheet-review-note').innerHTML,/data-action="update-course-choices"/);ui.api.handleAction('update-course-choices');assert.match(ui.node('sheet-dialog-content').innerHTML,/Your course choices are current/);assert.deepEqual(ui.saved(),before);assert.equal(ui.writes.length,0);
 }
});

test('an explicit course replacement archives a withdrawn option without another approval step',async()=>{
 const sample=courseUpdateData({removedRequirement:false}),ui=mount({modelId:sample.model.id,fixtureData:sample,editor:true,change:state=>earlierCourseChoices(state,{removedRequirement:false})}),before=copy(ui.saved());
 const control=ui.control('withdrawn-writing',{course:'writing'});await ui.changeControl(control,'current-writing');
 assert.equal(ui.node('sheet-dialog').open,false);assert.equal(ui.writes.length,1);assert(ui.saved().whatIf.snapshots.some(snapshot=>snapshot.settings.optionSelections.writing==='retired-writing'));
 assert.equal(ui.saved().scenarios[sample.model.id].optionSelections.writing,'current-writing');assert.deepEqual(ui.saved().learning,before.learning);assert.deepEqual(ui.saved().sheet.notes,before.sheet.notes);
});

test('a withdrawn option stays unchanged when automatic archival cannot be saved',async()=>{
 const sample=courseUpdateData({removedRequirement:false});
 for(const failure of ['storage','full']){
  const ui=mount({modelId:sample.model.id,fixtureData:sample,change:state=>{state=earlierCourseChoices(state,{removedRequirement:false});if(failure==='full'){const draft=Journey.buildDraft(state,sample.catalog,sample.models),Catalog=require('./dist/program-catalog.js');state.whatIf={version:1,snapshots:Array.from({length:20},(_,index)=>Catalog.planSnapshot(state,draft,{id:'kept-'+index,label:'Saved version '+index}))};}return state;}}),before=copy(ui.saved());
  if(failure==='storage')ui.setWriteFailure(true);await ui.changeControl(ui.control('withdrawn-writing-'+failure,{course:'writing'}),'current-writing');
  assert.deepEqual(ui.saved(),before);assert.deepEqual(ui.draft().state.scenarios[sample.model.id].optionSelections,before.scenarios[sample.model.id].optionSelections);assert.deepEqual(ui.draft().state.learning,before.learning);assert.equal(ui.writes.length,0);
 }
});

test('repeating recovery with different saved preferences preserves both earlier versions',async()=>{
 const sample=courseUpdateData(),first=mount({modelId:sample.model.id,fixtureData:sample,change:state=>earlierCourseChoices(state)});
 first.api.handleAction('update-course-choices');assert.equal(await first.submit('sheet-course-update-form'),'');
 const firstSaved=copy(first.saved()),oldSnapshot=copy(firstSaved.whatIf.snapshots[0]);
 const next=mount({modelId:sample.model.id,fixtureData:sample,change:()=>{const state=copy(firstSaved);state.scenarios[sample.model.id].optionSelections=copy(oldSnapshot.settings.optionSelections);state.profile.priority='speed';state.savings={[sample.model.id]:{monthlyHousing:750,privateEstimate:'Keep this estimate'}};return state;}}),before=copy(next.saved());
 next.api.handleAction('update-course-choices');assert.equal(await next.submit('sheet-course-update-form'),'');
 const snapshots=next.saved().whatIf.snapshots;assert.equal(snapshots.length,2);assert.deepEqual(snapshots.find(snapshot=>snapshot.id===oldSnapshot.id),oldSnapshot);assert.equal(snapshots[1].priority,'speed');assert.deepEqual(snapshots[1].savings,before.savings[sample.model.id]);assert.deepEqual(next.saved().learning,before.learning);
});

test('recovery refuses stale plans, full saved-version history and failed storage without dropping earlier choices',async()=>{
 const sample=courseUpdateData();
 const stale=mount({modelId:sample.model.id,fixtureData:sample,change:state=>earlierCourseChoices(state)});stale.api.handleAction('update-course-choices');const concurrent=copy(stale.saved());concurrent.learning.push({id:'new-course',provider:'Other College',title:'New record from another tab',code:'MATH101',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});stale.replaceStored(concurrent);assert.match(await stale.submit('sheet-course-update-form'),/another|changed|updated|refresh/i);assert.deepEqual(stale.saved(),concurrent);assert.equal(stale.writes.length,0);
 const full=mount({modelId:sample.model.id,fixtureData:sample,change:state=>{state=earlierCourseChoices(state);const draft=Journey.buildDraft(state,sample.catalog,sample.models),Catalog=require('./dist/program-catalog.js');state.whatIf={version:1,snapshots:Array.from({length:20},(_,index)=>Catalog.planSnapshot(state,draft,{id:'kept-'+index,label:'Saved version '+index}))};return state;}}),fullBefore=copy(full.saved());full.api.handleAction('update-course-choices');assert.match(await full.submit('sheet-course-update-form'),/saved versions are full/);assert.deepEqual(full.saved(),fullBefore);assert.equal(full.writes.length,0);
 const storage=mount({modelId:sample.model.id,fixtureData:sample,change:state=>earlierCourseChoices(state)}),storageBefore=copy(storage.saved());storage.api.handleAction('update-course-choices');storage.setWriteFailure(true);assert.match(await storage.submit('sheet-course-update-form'),/could not be saved/);assert.deepEqual(storage.saved(),storageBefore);assert.deepEqual(storage.draft().state.learning,storageBefore.learning);assert.deepEqual(storage.draft().state.scenarios[sample.model.id].optionSelections,storageBefore.scenarios[sample.model.id].optionSelections);assert.equal(storage.writes.length,0);
});

test('the real Psychology ledger update recovers its removed elective pin without reassigning completed credits',async()=>{
 const all=loadData(),model=all.models.find(model=>model.id==='curriculum-liberty-psychology-bs-online'),route=all.catalog.pathways.find(route=>route.modelId===model.id),valid=model.requirements.find(row=>row.id!=='univ-104'&&row.options.some(option=>option.provider==='University')),validOption=valid.options.find(option=>option.provider==='University'),sample={catalog:{...all.catalog,pathways:[route]},models:[model],courseCatalog:{courses:[]}};
 assert(!model.requirements.some(row=>row.id==='free-electives-12'));assert.equal(model.requirements.find(row=>row.id==='univ-104').credits,3);
 const ui=mount({modelId:model.id,fixtureData:sample,change:state=>{state.scenarios[model.id]={...state.scenarios[model.id],optionSelections:{'free-electives-12':'university-free-electives-12',[valid.id]:validOption.id}};state.sheet.notes={[model.id]:{'free-electives-12':'My earlier elective note'}};state.learning=[{id:'past-learning',provider:'Former College',code:'HIST101',title:'Original college history',credits:3,creditSystem:'quarter',grade:'A',status:'earned',evaluations:[]}];return state;}}),before=copy(ui.saved());
 assert(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'&&issue.requirementId==='free-electives-12'));ui.api.handleAction('update-course-choices');assert.equal(await ui.submit('sheet-course-update-form'),'');
 assert.equal(ui.saved().scenarios[model.id].optionSelections[valid.id],validOption.id);assert(!Object.hasOwn(ui.saved().scenarios[model.id].optionSelections,'free-electives-12'));assert.deepEqual(ui.saved().learning,before.learning);assert.deepEqual(ui.saved().sheet.notes,before.sheet.notes);assert.equal(ui.draft().plan.totals.accounted,120);assert.equal(ui.draft().plan.validation.academicCountsValid,true);assert.equal(ui.draft().plan.setupIssues.some(issue=>issue.code==='invalid_selection'),false);assert(ui.saved().whatIf.snapshots.some(snapshot=>snapshot.settings.optionSelections['free-electives-12']==='university-free-electives-12'));
});

test('a plan that needs school confirmation shows its open questions on the worksheet, hidden only on request',async()=>{
  const ui=mount({modelId:'tesu-general-management'}),slot=ui.node('sheet-school-check');
  assert.equal(slot.innerHTML,'','nothing is shown before the optional index loads');
  await ui.api.loadPlanIndex();
  const index=require('./dist/data/plan-library-index.json').plans['tesu-general-management'];assert.equal(index.tier,'confirmation');
  const html=slot.innerHTML;assert.equal(slot.hidden,false);
  assert.match(html,/<h2 id="sheet-school-check-title">Before you pay for courses, ask the school:<\/h2>/);
  assert.equal((html.match(/<li>/g)||[]).length,index.questions.length,'every open question is listed');
  assert.doesNotMatch(html,/<li>Ask the school:/i,'the repeated prefix is removed');
  assert.match(html,/This course plan is complete, but these points are not yet confirmed in the school’s published rules\./);
  assert.match(html,/data-action="hide-school-check" aria-expanded="true"/);
  ui.api.handleAction('hide-school-check');
  assert.match(slot.innerHTML,/is-collapsed/);assert.match(slot.innerHTML,new RegExp(index.questions.length+' questions to ask the school'));
  assert.match(slot.innerHTML,/data-action="show-school-check" aria-expanded="false"/);assert.doesNotMatch(slot.innerHTML,/<li>/);
  assert.equal(ui.writes.length,0,'showing or hiding the questions never changes the saved plan');
  ui.api.render();assert.match(slot.innerHTML,/is-collapsed/,'the choice holds across a re-render');
  ui.api.handleAction('show-school-check');assert.equal((slot.innerHTML.match(/<li>/g)||[]).length,index.questions.length,'the questions can always be shown again');
});

test('reviewed plans show nothing new and the worksheet works without the plan index',async()=>{
  const reviewed=mount();await reviewed.api.loadPlanIndex();
  assert.equal(require('./dist/data/plan-library-index.json').plans['liberty-business-residential'].tier,'reviewed');
  assert.equal(reviewed.node('sheet-school-check').innerHTML,'');assert.equal(reviewed.node('sheet-school-check').hidden,true);
  const offline=mount({modelId:'tesu-general-management',fetcher:url=>url==='data/plan-library-index.json'?Promise.reject(Error('offline')):null});
  assert.equal(await offline.api.loadPlanIndex(),null,'a failed index load is silent');
  assert.equal(offline.node('sheet-school-check').innerHTML,'');assert.match(offline.node('sheet-grid').innerHTML,/course-plan-row/,'the worksheet still renders');
  const broken=mount({modelId:'tesu-general-management',fetcher:url=>url==='data/plan-library-index.json'?Promise.resolve({ok:true,json:async()=>['not an index']}):null});
  await broken.api.loadPlanIndex();assert.equal(broken.node('sheet-school-check').innerHTML,'');
});

test('the worksheet degree finder offers the browsing subjects and keeps an older saved subject',async()=>{
  const Guide=require('./dist/guide-engine.js'),labels=require('./dist/data/plan-library-index.json').subjects;
  const options=html=>[...(html.match(/<select name="field">([\s\S]*?)<\/select>/)||['',''])[1].matchAll(/<option value="([^"]+)"( selected)?>([^<]*)<\/option>/g)].map(match=>[match[1],text(match[3]),Boolean(match[2])]);
  const ui=mount();await ui.api.loadPlanIndex();ui.api.chooseDialog();
  const fresh=options(ui.node('sheet-dialog-content').innerHTML);
  assert.deepEqual(fresh.map(([id])=>id),['any',...Guide.subjectIds]);
  for(const id of Guide.subjectIds)assert.equal(fresh.find(([value])=>value===id)[1],text(labels[id].replaceAll('&','&amp;')),id);
  for(const old of ['general','law','aviation','science','arts','social-science'])assert(!fresh.some(([id])=>id===old),'retired subject '+old+' is not offered to new choices');
  // A chosen route copies its own field into the profile, so set the older value as a saved profile would hold it.
  const legacy=mount();legacy.draft().state.profile.field='aviation';legacy.api.chooseDialog();
  const kept=options(legacy.node('sheet-dialog-content').innerHTML);
  assert.deepEqual(kept.at(-1),['aviation','Aviation',true],'an older saved subject stays selected instead of resetting');
  const current=mount();current.draft().state.profile.field='technology';current.api.chooseDialog();
  assert.deepEqual(options(current.node('sheet-dialog-content').innerHTML).filter(([,,selected])=>selected).map(([id])=>id),['technology']);
});

test('the worksheet degree finder filters strictly by subject and an older saved subject still filters',async()=>{
  // Only reviewed plans are offered; attach the real publication list for this fixture's routes.
  const Catalog=require('./dist/program-catalog.js'),registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json');
  const modelIds=new Set(data.models.map(model=>model.id)),published={...data,catalog:Catalog.attachPublicationIndex({...data.catalog,curriculumRegistry:registry},{...publication,plans:publication.plans.filter(plan=>modelIds.has(plan.modelId))},registry)};
  const recommended=async(field,fetcher)=>{const ui=mount({fixtureData:published,fetcher});ui.api.chooseDialog();await ui.submit('sheet-choose-form',{goal:'any-degree',degreeLevel:'bachelor',modality:'any',field,classroomImportance:'open',militaryStatus:'none',priority:'balanced'});await ui.settle();return{ui,ids:[...ui.node('sheet-recommendations').innerHTML.matchAll(/data-route="([^"]+)"/g)].map(match=>match[1]).sort()};};
  const business=await recommended('business');assert.deepEqual(business.ids,['liberty-business-residential']);assert.equal(business.ui.saved().profile.field,'business');
  const tech=await recommended('technology');
  assert.deepEqual(tech.ids,['liberty-business-residential'],'a plan tagged with the subject in the plan index is offered even though its catalog field is business');
  assert.equal(tech.ui.saved().profile.field,'technology');
  const psychology=await recommended('psychology');assert.deepEqual(psychology.ids,[],'a subject never returns another subject’s plans');
  assert.match(psychology.ui.node('sheet-recommendations').innerHTML,/No researched route matches all these choices yet/);
  assert.deepEqual((await recommended('law')).ids,[],'an older saved subject still filters');
  const offline=url=>url==='data/plan-library-index.json'?Promise.resolve({ok:false,status:503}):null;
  assert.deepEqual((await recommended('business',offline)).ids,['liberty-business-residential'],'without the index the finder still works from catalog fields');
  assert.deepEqual((await recommended('technology',offline)).ids,[],'without the index a subject only matches its own or nearest older field');
});
