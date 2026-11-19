'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Library=require('./dist/course-library-engine.js'),Features=require('./dist/course-attributes.js'),attributes=require('./dist/data/course-attributes.json');
const all=[...require('./dist/data/course-catalog.json').courses,...require('./dist/data/curriculum-course-index.json').courses],study=all.find(c=>c.id===attributes.courses.find(c=>c.code==='SDCM-0001').courseIds[0]),sl=all.find(c=>c.id===attributes.policies.find(p=>p.provider==='StraighterLine').courseIds[0]);
const KEY='degreepath-guide-v3',copy=v=>JSON.parse(JSON.stringify(v));
function mount(){
 const nodes=new Map(),events=[],values=new Map([[KEY,JSON.stringify(Library.initialize(null))]]);let block=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:['course-kind','course-status','course-pace','course-assessment','course-credit-origin'].includes(id)?'all':'',innerHTML:'',textContent:'',hidden:false,open:false,addEventListener(){},setAttribute(){},querySelectorAll(){return[];},querySelector(){return{focus(){}};},showModal(){this.open=true;},focus(){},close(){this.open=false;},insertAdjacentHTML(){}});return nodes.get(id);};
 const context={console,URL,URLSearchParams,Intl,document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},createElement(){return{dataset:{},setAttribute(){}};}},DegreeCourseLibrary:Library,DegreeCourseAttributes:Features,DegreeCoursePlanView:{courseLinks(){return{};}},localStorage:{getItem:key=>values.get(key)||null,setItem(key,value){if(block)throw Error('quota');values.set(key,value);}},dispatchEvent:event=>events.push(event),addEventListener(){},location:{search:''},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},__catalog:copy([study,sl]),__attributes:attributes};context.window=context;
 let source=fs.readFileSync('dist/courses.js','utf8');const at=source.lastIndexOf('  (async()=>{');source=source.slice(0,at)+`state=Library.initialize(null);catalog={courses:__catalog,sources:[]};attributes=__attributes;window.ui={render,save,details,recordFeatureCourse,empty:()=>{providerContext={id:'asu-ulc',name:'ASU Universal Learner Courses',indexed:false};return emptyHTML(true);}};\n}());`;
 vm.runInNewContext(source,context);
 return{ui:context.ui,node,events,saved:()=>JSON.parse(values.get(KEY)),block:()=>{block=true;}};
}
test('the actual library filter and visible course badges use one reviewed assessment fact',()=>{
 const f=mount();f.node('course-assessment').value='no-proctor';f.ui.render();const html=f.node('courses-results').innerHTML;
 assert(html.includes(study.title));assert(!html.includes(sl.title));assert.match(html,/No proctored exams/);assert.match(html,/ACE-recommended/);assert(!html.includes('Self-paced course'));
 f.ui.details(study.id);const details=f.node('course-details-content').innerHTML;assert.match(details,/Course features and sources/);assert.match(details,/Nov 18, 2026/);assert.match(details,/College Saver non-proctored/);
});
test('a confirmed new course save emits one anonymous activation event; duplicate and failed saves emit none',()=>{
 const f=mount();assert(f.ui.save(study.id));assert.equal(f.saved().learning.length,1);assert.equal(f.events.filter(e=>e.type==='DegreeSteps:growth').length,1);assert.deepEqual(copy(f.events.find(e=>e.type==='DegreeSteps:growth').detail),{event:'course_saved',context:'workspace'});
 f.ui.save(study.id);assert.equal(f.events.filter(e=>e.type==='DegreeSteps:growth').length,1);const before=JSON.stringify(f.saved().learning);f.block();assert.equal(f.ui.save(sl.id),false);assert.equal(JSON.stringify(f.saved().learning),before);assert.equal(f.events.filter(e=>e.type==='DegreeSteps:growth').length,1);
});
test('an unindexed known source has actionable alternatives that retain the provider context',()=>{
 const html=mount().ui.empty();assert.match(html,/ASU Universal Learner Courses/);assert.match(html,/credit-sources\/asu-ulc\//);assert.match(html,/import-courses.html/);assert.match(html,/degree-plans\//);
});

test('a past earned course does not inherit current-offering assessment or recommendation badges',()=>{const f=mount();assert.equal(f.ui.recordFeatureCourse({status:'earned',catalogCourseId:study.id,provider:study.provider,code:study.code,completedOn:'2020-01-01'}),null);});
