'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Library=require('./dist/course-library-engine.js'),Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js');
const KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
const course={id:'focus-english',provider:'Sophia',title:'English Composition I',code:'SOPH-0015',credits:3,creditSystem:'semester',subject:'English',url:'https://www.sophia.org/online-courses/english-composition-i/'};

// Run the shipped event handlers with replaceable row nodes. This fixture models
// focus and dialogs only; it does not claim to replace a real-browser layout test.
function mount(initial=Library.initialize(null),search=null){
  const nodes=new Map(),handlers=new Map(),events=[],values=new Map([[KEY,JSON.stringify(initial)]]);let blocked=false;
  const decode=value=>String(value).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const document={activeElement:null,addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},getElementById:id=>node(id),querySelector(selector){return selector==='dialog[open]'?[...nodes.values()].find(n=>n.tagName==='dialog'&&n.open)||null:null;},querySelectorAll(){return[];},createElement:()=>make('p')};
  function make(tag='div',id='',parent=null,attrs={}){
    const listeners=new Map(),element={id,tagName:tag,parent,attrs,dataset:{},children:[],value:'',textContent:'',hidden:false,open:false,disabled:false,checked:false,required:false};let html='';
    for(const[key,value]of Object.entries(attrs))if(key.startsWith('data-'))element.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
    Object.defineProperty(element,'innerHTML',{get:()=>html,set(value){html=String(value);element.children=[];for(const match of html.matchAll(/<(button|select|summary|input)\b([^>]*)>/g)){const fields={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))fields[a[1]]=decode(a[2]||'');element.children.push(make(match[1],fields.id||'',element,fields));}}});
    element.setAttribute=(key,value)=>{attrs[key]=String(value);};element.hasAttribute=key=>Object.hasOwn(attrs,key);
    element.matches=selector=>{const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return match?element.hasAttribute(match[1])&&(match[2]===undefined||attrs[match[1]]===match[2]):selector===tag;};
    element.contains=child=>{for(let item=child;item;item=item.parent)if(item===element)return true;return false;};
    element.querySelectorAll=selector=>element.children.filter(child=>child.matches(selector));element.querySelector=selector=>element.querySelectorAll(selector)[0]||null;
    element.closest=selector=>{for(let item=element;item;item=item.parent)if(item.matches(selector))return item;return null;};
    element.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
    element.emit=(type,extra={})=>{const event={target:element,preventDefault(){},...extra};for(const fn of listeners.get(type)||[])fn(event);};
    element.focus=()=>{document.activeElement=element;};
    element.click=()=>{element.focus();element.emit('click');for(const fn of handlers.get('click')||[])fn({target:element});};
    element.showModal=()=>{element.open=true;};element.close=()=>{element.open=false;element.emit('close');};element.append=child=>element.children.push(child);
    return element;
  }
  function node(id){if(!nodes.has(id)){const tag=id.endsWith('-dialog')?'dialog':'div',element=make(tag,id);if(['course-kind','course-status','course-pace','course-assessment','course-credit-origin'].includes(id))element.value='all';nodes.set(id,element);}return nodes.get(id);}
  node('course-details-content').parent=node('course-details-dialog');
  const form=node('course-status-form');form.parent=node('course-status-dialog');form.elements={};
  for(const name of ['provider','code','title','credits','creditSystem','completedOn','grade','score','clearEvaluations']){const input=make('input','',form);let value='';Object.defineProperty(input,'value',{get:()=>value,set:next=>{value=String(next);}});form.elements[name]=input;}
  form.reset=()=>{for(const input of Object.values(form.elements)){input.value='';input.checked=false;}};form.checkValidity=()=>true;form.reportValidity=()=>{};
  const context={console,URL,URLSearchParams,Intl,document,DegreeCourseLibrary:Library,DegreeSheet:Sheet,DegreeCoursePlanView:{courseLinks:()=>({})},localStorage:{getItem:key=>values.get(key)||null,setItem(key,value){if(blocked)throw Error('quota');values.set(key,value);}},dispatchEvent:event=>events.push(event),addEventListener(){},location:{search:search||''},fetch:async url=>({ok:true,json:async()=>url.includes('course-catalog')?{courses:[copy(course)],sources:[]}:url.includes('course-attributes')?{version:1,policies:[],courses:[]}: {courses:[],sources:[]}}),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},__initial:copy(initial),__course:copy(course)};context.window=context;
  let source=fs.readFileSync('dist/courses.js','utf8');const boot=source.lastIndexOf('  (async()=>{');
  source=search===null?source.slice(0,boot)+'state=Library.initialize(__initial);catalog={courses:[__course],sources:[]};window.ui={render,setTab};\n}());':source.slice(0,boot)+'window.ui={render,setTab};window.__boot='+source.slice(boot).trimStart();
  vm.runInNewContext(source,context);if(search===null)context.ui.render();
  return{ui:context.ui,node,document,events,ready:context.__boot||Promise.resolve(),saved:()=>JSON.parse(values.get(KEY)),block(){blocked=true;},control(attribute,id,root='courses-results'){return node(root).querySelectorAll('['+attribute+']').find(item=>item.attrs[attribute]===id);},change(control,value){control.focus();control.value=value;for(const fn of handlers.get('change')||[])fn({target:control});},editProgress(value){node('course-edit-progress').value=value;node('course-edit-progress').emit('change');},cancel(dialog){const button=make('button','',node(dialog),{'data-course-dialog-close':''});button.click();}};
}

test('Save becomes View saved, opens the saved editor, and canceling removal preserves the original course',()=>{
  const f=mount();const first=f.control('data-course-save',course.id);first.click();
  const record=f.saved().learning[0],savedControl=f.control('data-course-save',course.id);
  assert.equal(f.document.activeElement,savedControl,'focus follows the replacement Save control');
  assert.match(savedControl.attrs['aria-label'],/^View saved course:/);assert(!savedControl.hasAttribute('aria-pressed'));
  assert.equal(record.status,'saved');savedControl.click();assert(f.node('course-details-dialog').open);
  const edit=f.control('data-course-edit',record.id,'course-details-content');assert.equal(f.document.activeElement,edit);
  edit.click();assert(f.node('course-status-dialog').open);assert.equal(f.node('course-status-form').elements.title.value,course.title);
  f.cancel('course-status-dialog');assert.deepEqual(f.saved().learning,[record]);
  f.control('data-course-save',course.id).click();f.control('data-course-remove',record.id,'course-details-content').click();
  assert(f.node('course-remove-dialog').open);f.cancel('course-remove-dialog');
  assert.deepEqual(f.saved().learning,[record]);assert.equal(f.document.activeElement,f.control('data-course-save',course.id));
  assert.equal(f.events.filter(event=>event.type==='DegreeSteps:growth').length,1);
});

test('View saved never deletes finished coursework, school placements, or private plan data',()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),record=initial.learning[0];record.status='earned';record.completedOn='2025-05-01';record.evaluations=[{pathwayId:'private-degree',status:'confirmed',requirementId:'writing'}];initial.sheet.notes={private:'Keep my note'};
  const f=mount(initial);f.control('data-course-save',course.id).click();
  assert.deepEqual(f.saved(),initial);assert(f.node('course-details-dialog').open);
  f.control('data-course-remove',record.id,'course-details-content').click();f.cancel('course-remove-dialog');assert.deepEqual(f.saved(),initial);
  f.control('data-course-save',course.id).click();f.control('data-course-remove',record.id,'course-details-content').click();f.node('course-remove-confirm').click();
  assert.equal(f.saved().learning.length,0,'only the explicit confirmation removes the record');assert.deepEqual(f.saved().sheet.notes,initial.sheet.notes);
});

test('course progress changes retain keyboard focus and remain reversible',()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id,f=mount(initial);f.ui.setTab('mine');
  for(const status of ['in-progress','earned','saved']){
    const previous=f.control('data-course-status',id);f.change(previous,status);
    assert.equal(f.saved().learning[0].status,status);assert.notEqual(f.document.activeElement,previous);assert.equal(f.document.activeElement,f.control('data-course-status',id));
  }
  assert.equal(f.saved().learning[0].credits,3);assert.deepEqual(f.saved().learning[0].evaluations,[]);
});

test('a status edit hidden by its filter explains the move and offers a focused way back',()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id,f=mount(initial);f.ui.setTab('mine');f.node('course-status').value='saved';f.ui.render();
  f.change(f.control('data-course-status',id),'in-progress');
  assert.equal(f.saved().learning[0].status,'in-progress');assert(!f.control('data-course-status',id));assert.equal(f.document.activeElement,f.node('courses-clear-filters'));
  assert.match(f.node('courses-status').textContent,/English Composition I is taking.*filters hide it.*Clear filters/);
  f.node('courses-clear-filters').click();assert(f.control('data-course-status',id));assert.equal(f.document.activeElement,f.node('course-search'));assert(f.node('courses-clear-filters').hidden);
});

test('changing an evaluated course can be canceled, then explicitly saved with focus restored after filtering',()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id;initial.learning[0].evaluations=[{programId:'original-degree',requirementId:'writing',status:'confirmed'}];
  const f=mount(initial);f.ui.setTab('mine');f.node('course-status').value='saved';f.ui.render();
  f.change(f.control('data-course-status',id),'in-progress');assert(f.node('course-status-dialog').open);assert.deepEqual(f.saved(),initial);
  f.cancel('course-status-dialog');assert.deepEqual(f.saved(),initial);assert.equal(f.document.activeElement,f.control('data-course-status',id));
  f.change(f.control('data-course-status',id),'in-progress');const form=f.node('course-status-form');form.emit('submit');
  assert(f.node('course-status-dialog').open);assert.deepEqual(f.saved(),initial);assert.match(f.node('course-status-error').textContent,/Confirm.*clears/);
  form.elements.clearEvaluations.checked=true;form.emit('submit');assert(!f.node('course-status-dialog').open);
  assert.equal(f.saved().learning[0].status,'in-progress');assert.deepEqual(f.saved().learning[0].evaluations,[]);assert.equal(f.document.activeElement,f.node('courses-clear-filters'));assert.match(f.node('courses-status').textContent,/filters hide it/);
});

test('failed progress saves keep the original status and course control available',()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id,f=mount(initial);f.ui.setTab('mine');f.block();
  const control=f.control('data-course-status',id);f.change(control,'earned');
  assert.deepEqual(f.saved(),initial);assert.equal(control.value,'saved');assert.equal(f.document.activeElement,control);assert.match(f.node('courses-error').textContent,/could not save/);
});

test('a real record URL opens a progress selector and can finish the course without losing its source facts',async()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id;initial.learning[0].status='in-progress';initial.sheet.notes={private:'Keep this note'};
  const f=mount(initial,'?tab=mine&record='+encodeURIComponent(id));await f.ready;
  assert(f.node('course-status-dialog').open);assert.equal(f.node('course-edit-progress').value,'in-progress');assert.equal(f.document.activeElement,f.node('course-edit-progress'));
  assert.match(fs.readFileSync('dist/courses.html','utf8'),/<label>Course progress<select id="course-edit-progress" name="status" required>/);
  f.editProgress('earned');assert(!f.node('course-completion-date-field').hidden);assert(!f.node('course-status-form').elements.completedOn.disabled);
  f.node('course-status-form').elements.completedOn.value='2026-11-19';f.node('course-status-form').emit('submit');
  const saved=f.saved(),record=saved.learning[0];assert(!f.node('course-status-dialog').open);assert.equal(record.status,'earned');assert.equal(record.completedOn,'2026-11-19');
  for(const key of ['provider','code','title','credits','creditSystem','catalogCourseId','creditBasis','sourceUrl','codeAliases'])assert.deepEqual(record[key],initial.learning[0][key],'Progress preserves '+key);
  assert.deepEqual(record.evaluations,[]);assert.deepEqual(saved.sheet.notes,initial.sheet.notes);
});

test('a deep-linked confirmed completion can be canceled or explicitly reversed with stale placements cleared',async()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id,record=initial.learning[0];
  record.status='earned';record.completedOn='2026-10-01';record.grade='A';record.evaluations=[{programId:'original-degree',requirementId:'writing',status:'confirmed'}];
  const program={id:'original-degree',school:'Example University',totalCredits:3,creditSystem:'semester',requirements:[{id:'writing',title:'Writing',credits:3,options:[{id:'sophia-writing',provider:'Sophia',code:course.code,title:course.title,credits:3,evidence:'published'}]}]};
  const completedCredits=state=>Guide.matchInventory(program,state.learning).completed.reduce((sum,row)=>sum+program.requirements.find(requirement=>requirement.id===row.requirementId).credits,0);
  assert.equal(completedCredits(initial),3);
  const canceled=mount(initial,'?tab=mine&record='+id);await canceled.ready;canceled.editProgress('saved');assert(canceled.node('course-status-form').elements.clearEvaluations.required);canceled.cancel('course-status-dialog');assert.deepEqual(canceled.saved(),initial);
  const f=mount(initial,'?tab=mine&record='+id);await f.ready;f.editProgress('in-progress');const form=f.node('course-status-form');
  assert(form.elements.clearEvaluations.required);assert(!f.node('course-status-confirmation-field').hidden);form.emit('submit');assert.deepEqual(f.saved(),initial);assert(f.node('course-status-dialog').open);
  form.elements.clearEvaluations.checked=true;form.emit('submit');const reversed=f.saved().learning[0];
  assert.equal(reversed.status,'in-progress');assert.equal(reversed.completedOn,'');assert.deepEqual(reversed.evaluations,[]);
  assert.equal(completedCredits(f.saved()),0,'The reversed course no longer contributes completed degree credits');
  for(const key of ['provider','code','title','credits','creditSystem','catalogCourseId','grade','sourceUrl'])assert.equal(reversed[key],record[key]);
});

test('deep-linked progress edits retain the editor on failed save and preserve legacy planned records on inspection',async()=>{
  const initial=Library.saveCourse(Library.initialize(null),course),id=initial.learning[0].id;initial.learning[0].status='planned';
  const inspected=mount(initial,'?tab=mine&record='+id);await inspected.ready;assert.equal(inspected.node('course-edit-progress').value,'saved');inspected.node('course-status-form').emit('submit');assert.deepEqual(inspected.saved(),initial);
  const failed=mount(initial,'?tab=mine&record='+id);await failed.ready;failed.block();failed.editProgress('earned');failed.node('course-status-form').emit('submit');
  assert.deepEqual(failed.saved(),initial);assert(failed.node('course-status-dialog').open);assert.equal(failed.node('course-edit-progress').value,'earned');assert.match(failed.node('courses-error').textContent,/could not save/);
});
