/* Full production worksheet closures with synthetic browser surfaces and local
 * data only. This verifies behavior and rendered controls, not visual layout. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadData}=require('./scripts/audit-student-confirmations.cjs');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js');
const KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
const ids=new Set(['liberty-business-residential','tesu-general-management']);
const data=(()=>{const full=loadData();return{catalog:{...full.catalog,pathways:full.catalog.pathways.filter(route=>ids.has(route.modelId))},models:full.models.filter(model=>ids.has(model.id)),courseCatalog:require('./dist/data/course-catalog.json')};})();
const text=html=>String(html).replace(/<[^>]*>/g,' ').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"').replace(/\s+/g,' ').trim();

function mount({modelId='liberty-business-residential',change,editor=false}={}){
  const route=data.catalog.pathways.find(route=>route.modelId===modelId);
  let initial=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);
  initial=Journey.setPriorCredits(initial,'none');initial.journey.completed=true;
  if(change)initial=change(initial)||initial;
  const values=new Map([[KEY,JSON.stringify(initial)]]),nodes=new Map(),events=new Map(),windowEvents=new Map(),elementEvents=new Map(),writes=[],downloads=[],navigations=[],shares=[],requests=[],checklists=[],interactive=[],focusLog=[];
  let documentRef,renderedControlSequence=0;
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
    location:{origin:'https://degree.synthetic.invalid',pathname:'/plan.html',search:editor?'?editor=1':'',assign(value){navigations.push(value);},replace(value){navigations.push(value);}},
    history:{replaceState(){}},navigator:{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}getAll(name){return this.has(name)?[this.get(name)]:[];}},
    setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(){},scrollTo(){},dispatchEvent(){},
    addEventListener(type,handler){if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(handler);},
    localStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){values.set(key,value);writes.push(copy(JSON.parse(value)));}},
    async fetch(url){requests.push(url);if(typeof url!=='string'||!/^data\/[a-zA-Z0-9_.\/-]+\.json$/.test(url)||url.includes('..'))throw Error('No network is permitted.');const file=path.join(__dirname,'dist',url);return fs.existsSync(file)?{ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))}:{ok:false,status:404};},
    __fixtureJSON:JSON.stringify({state:initial,...data})};
  context.window=context;context.print=()=>{context.__printed=true;};vm.createContext(context);
  const html=fs.readFileSync('dist/plan.html','utf8');
  for(const match of html.matchAll(/<script\b[^>]*\bsrc="([A-Za-z0-9_-]+\.js)"[^>]*>/g)){
    const source=fs.readFileSync(path.join('dist',match[1]),'utf8');if(source.includes('module.exports'))vm.runInContext(source,context,{filename:match[1]});
  }
  // Their independent mounted suites cover widget DOM behavior. Keep the real
  // checklist engine here and record the exact complete task model it receives.
  context.DegreeSavingsTracker=undefined;context.DegreeMomentum=undefined;
  context.DegreeChecklistView={update(target,state,draft){checklists.push(context.DegreeChecklist.build(state,draft));target.innerHTML='Full checklist mounted';}};
  context.DegreeCommunity={sharePlan(payload){shares.push(copy(payload));}};
  const source=fs.readFileSync('dist/sheet.js','utf8');
  const hook=`const fixture=JSON.parse(__fixtureJSON);state=fixture.state;catalog=fixture.catalog;models=fixture.models;courseCatalog=fixture.courseCatalog;storageBaseline=localStorage.getItem(KEY);
    window.__parity={render,handleAction,rowDialog,compareCourses,applyComparedCourse,comparePreview,
      getDraft:()=>({state,pathway,program,plan,match,input,guidance}),getProjection:projection,
      search(value){state.sheet.search=value;renderGrid();},filter(value){progressFilter=value;renderGrid();}};
    render();`;
  const instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hook+'\n}());');assert.notEqual(instrumented,source,'Use the production boot boundary');
  vm.runInContext(instrumented,context,{filename:'sheet.js'});writes.length=0;
  return {node,api:context.__parity,writes,downloads,navigations,shares,requests,checklists,focusLog,active:()=>document.activeElement,
    control(name,dataset={},container='sheet-grid',tagName='SELECT'){const control=node(name);control.id='';control.tagName=tagName;control.dataset={...dataset};control.container=container;control.isConnected=true;interactive.push(control);return control;},
    button(name,dataset={},container='sheet-grid'){return this.control(name,dataset,container,'BUTTON');},
    saved:()=>JSON.parse(values.get(KEY)),draft:()=>context.__parity.getDraft(),projection:()=>context.__parity.getProjection(),
    async progress(id,status){const target={id:'',dataset:{progress:id},value:status,closest(){return null;}};for(const handler of events.get('change')||[])await handler({target});},
    async changeControl(control,value){control.value=value;for(const handler of events.get('change')||[])await handler({target:control});for(let i=0;i<12;i++)await Promise.resolve();},
    async submit(id,fields={}){const form={id,values:fields,dataset:{},querySelector(){return null;},append(){}};for(const handler of events.get('submit')||[])await handler({target:form,preventDefault(){}});},
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
  ui.api.handleAction('credits');assert.deepEqual(ui.navigations,['import-courses.html'],'Add past courses retains the transcript/spreadsheet import entry');
  for(const [action,pattern]of [['more',/Detailed worksheet/],['options',/Military learning/],['cost-time',/sheet-cost-form/],['download',/Worksheet CSV/]]){
    ui.api.handleAction(action);await ui.settle();assert.match(ui.node('sheet-dialog-content').innerHTML,pattern,action+' retains its original form or controls');
  }
  ui.api.handleAction('compare-plans');assert.deepEqual(ui.navigations,['import-courses.html','compare-plans.html']);assert.equal(ui.saved().learning.length,0);
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
