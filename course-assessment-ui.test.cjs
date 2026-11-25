'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const View=require('./dist/course-assessment-view.js'),Assessment=require('./dist/course-assessment.js'),Sheet=require('./dist/sheet-state.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const source={id:'assessment-policy',url:'https://provider.example/assessment-policy',title:'Published assessment policy',checkedOn:'2026-11-24'};
const course=(overrides={})=>({key:'sophia:eng101',provider:'Sophia',code:'ENG101',title:'Composition',university:false,status:'unmonitored',label:'Open-book, unproctored',detail:'Identity verification is separate from a monitored exam.',sources:[source],...overrides});
const summary=courses=>({courses});
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('remaining-course summary separates outside exam policies from university coursework',()=>{
 const data=freeze(summary([course(),course({key:'clep:history',provider:'CLEP',code:'HIST',title:'History',status:'monitored'}),course({key:'sl:math',provider:'StraighterLine',code:'MATH',title:'Algebra',status:'restricted'}),course({key:'university:capstone',provider:'University',title:'Capstone',university:true,status:'unknown',sources:[]})])),before=JSON.stringify(data);
 const html=View.render(data,{compact:true});assert.match(html,/1 without monitored exams · 1 monitored · 1 with screen or browser restrictions/);assert.match(html,/At the university/);assert.match(html,/Outside-course labels do not describe university assessments/);assert.match(html,/1 university assessment format is not classified/);assert.doesNotMatch(html,/exam.free degree|no proctor required/i);assert.equal(JSON.stringify(data),before);
 assert.match(html,/^<details class="course-assessments course-assessments-compact"/);assert.doesNotMatch(html,/^<details[^>]*\bopen(?:\s|=|>)/,'The details start closed');
});

test('repeated source actions count once and source details preserve reviewed dates',()=>{
 const first=course(),html=View.render(summary([first,copy(first)]));assert.match(html,/1 without monitored exams/);assert.doesNotMatch(html,/2 without monitored exams/);assert.equal((html.match(/data-assessment-source="assessment-policy"/g)||[]).length,1);assert.match(html,/data-source-checked="2026-11-24"/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});

test('unknown, unsourced and unsafe assessment claims never become no-monitored-exam counts',()=>{
 for(const broken of [[],[{...source,url:'javascript:alert(1)'}],[{...source,url:'http://provider.example/policy'}],[{...source,url:'https://user:password@provider.example/policy'}],[{...source,checkedOn:'2026-02-30'}]]){
  const data=course({sources:broken}),html=View.render(summary([data]));assert.match(html,/1 not classified/);assert.doesNotMatch(html,/1 without monitored exams|Open-book, unproctored|javascript:|password@/);
 }
 const missing=View.render(summary([course({status:'unknown',sources:[],label:'No monitored exams'})]));assert.match(missing,/1 not classified/);assert.doesNotMatch(missing,/No monitored exams/);
 assert.equal(View.render(null),'');assert.equal(View.render({courses:[null,{},course({key:''})]}),'');
});

test('assessment rendering escapes course, provider, evidence and fact text',()=>{
 const data=course({provider:'<img src=x>',title:'<script>alert(1)</script>',detail:'<svg onload=alert(1)>',sources:[{...source,title:'<iframe src=x>',url:'https://provider.example/policy?x="value"&y=one'}]}),html=View.render(summary([data]));
 assert.doesNotMatch(html,/<img|<script|<svg|<iframe/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.match(html,/&lt;iframe/);assert.doesNotMatch(html,/x="value"/);
 const fact=View.factHTML({...data,label:'<strong>Unproctored</strong>'});assert.match(fact,/&lt;strong/);assert.doesNotMatch(fact,/<strong>Unproctored<\/strong>/);
});

test('a sourced quiz-format description can stay unknown for monitoring',()=>{
 const data=course({status:'unknown',label:'Timed open-note quizzes',detail:'The course publishes timed open-note quizzes; monitoring is not specified.'}),html=View.render(summary([data]));assert.match(html,/1 not classified/);assert.match(html,/Timed open-note|timed open-note/);assert.match(html,/Monitoring not classified/);assert.doesNotMatch(html,/without monitored exams/);
});

function worksheet({task='',summaryValue=summary([course()]),assessmentAllowsOption=()=>true}={}){
 const script=fs.readFileSync(require.resolve('./dist/sheet.js'),'utf8');
 const options=[{id:'sl-writing',provider:'StraighterLine',code:'ENG101',title:'Composition'},{id:'sl-monitored',provider:'StraighterLine',code:'MAT101',title:'Algebra'},{id:'sl-taking',provider:'StraighterLine',code:'BIO101',title:'Biology'},{id:'clep-done',provider:'CLEP',code:'HIST',title:'History'},{id:'sophia-writing',provider:'Sophia',code:'ENG102',title:'Composition II'}];
 const program={id:'assessment-degree',school:'Example College',title:'Degree',requirements:options.map((option,index)=>({id:['writing','math','taking','done','sophia'][index],code:option.code,title:option.title,credits:3,options:[option]}))};
 const providers=['StraighterLine','CLEP','Sophia'];
 const initial={version:3,profile:{proctoringPreference:'open'},learning:[{id:'taking-biology',provider:'StraighterLine',code:'BIO101',status:'in-progress',credits:4,creditSystem:'quarter',privateNote:'Keep my original quantity'}],scenarios:{[program.id]:{providers,mappedProvidersReviewed:providers,optionSelections:Object.fromEntries(program.requirements.map(row=>[row.id,row.options[0].id]))}},sheet:{notes:{[program.id]:{private:'Keep my note'}}}};
 const nodes=new Map(),node=id=>{if(!nodes.has(id)){let html='';const item={id,writes:0,textContent:'',hidden:false,classList:{add(){},toggle(){}},addEventListener(){}};Object.defineProperty(item,'innerHTML',{get:()=>html,set:value=>{html=value;item.writes++;}});nodes.set(id,item);}return nodes.get(id);};
 const calls=[];const document={getElementById:node,addEventListener(){},dispatchEvent(){},body:node('body')};
 const Planner={assessmentFor:(_program,option)=>({status:'unmonitored',label:option?.id==='sl-writing'?'Writing assignments, no monitored final':'Source-backed assessment label',sources:[source]}),assessmentAllowsOption:(...args)=>{calls.push(copy(args));return assessmentAllowsOption(...args);}};
 const context={document,location:{search:task?'?task='+task:'',pathname:'/plan.html'},URL,URLSearchParams,Intl,Math,Date,JSON,console,setTimeout(){},clearTimeout(){},addEventListener(){},localStorage:{getItem(){return JSON.stringify(initial);},setItem(){throw Error('The UI read path must not save records');}},DegreeSheet:Sheet,DegreePlanner:Planner,DegreeCourseAssessment:{summarize(){return copy(summaryValue);}},DegreeCourseAssessmentView:View,__fixture:JSON.stringify({initial,program})};context.window=context;
 const hook="const fixture=JSON.parse(__fixture);state=fixture.initial;program=fixture.program;models=[program];pathway={id:'assessment-route',modelId:program.id,title:program.title};plan={rows:program.requirements.map(row=>({requirementId:row.id,status:row.id==='done'?'confirmed':'planned',option:row.options[0]}))};input={plannedLearning:[{requirementId:'taking',optionId:'sl-taking',status:'in-progress'}]};window.__assessmentUI={cleanup:coursePreferenceSelections,label:optionAssessment,render:renderCourseAssessments,state:()=>state,setSummary:value=>window.DegreeCourseAssessment.summarize=()=>value};";
 const mounted=script.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hook+'\n}());');assert.notEqual(mounted,script);vm.runInNewContext(mounted,context,{filename:'sheet.js'});
 return {api:context.__assessmentUI,nodes,node,calls,initial,program};
}

test('worksheet preference cleanup delegates exact course rules and keeps completed and enrolled choices',()=>{
 const ui=worksheet({assessmentAllowsOption:(_program,option,input,requirementId)=>{
  assert.equal(input.proctoringPreference,'avoid');assert.equal(requirementId,option.id==='sl-writing'?'writing':option.id==='sl-monitored'?'math':option.id==='sl-taking'?'taking':'sophia');
  if(option.id==='sl-taking')assert.equal(input.plannedLearning[0].optionId,'sl-taking');
  return option.id!=='sl-monitored';
 }}),before=JSON.stringify(ui.api.state()),result=ui.api.cleanup(['StraighterLine','CLEP','Sophia'],'avoid');
 assert.deepEqual(copy(result.replacedIds),['math']);assert.equal(result.selections.writing,'sl-writing','An eligible course is not hidden because another course from its provider uses a monitored exam');assert.equal(result.selections.taking,'sl-taking');assert.equal(result.selections.done,'clep-done');assert.equal(ui.calls.some(call=>call[1]?.id==='clep-done'),false,'A completed course is outside preference cleanup');assert.equal(JSON.stringify(ui.api.state()),before,'Previewing cleanup cannot mutate source records, pins, original units or notes');
 assert.equal(ui.api.label(ui.program.requirements[0].options[0]),'Writing assignments, no monitored final');
});

test('an explicit provider exclusion still removes future planning pins independently of assessment preference',()=>{
 const ui=worksheet(),before=JSON.stringify(ui.api.state()),result=ui.api.cleanup(['CLEP','Sophia'],'open');assert.deepEqual(copy(result.replacedIds),['writing','math','taking']);assert.equal(result.selections.done,'clep-done');assert.equal(result.selections.sophia,'sophia-writing');assert.equal(JSON.stringify(ui.api.state()),before);
});

test('ordinary plan redraw preserves native assessment disclosure state and does not save presentation state',()=>{
 const ui=worksheet(),node=ui.node('sheet-course-assessments');ui.api.render();assert.equal(node.hidden,false);assert.equal(node.writes,1);node.innerHTML=node.innerHTML.replace('<details ','<details open ');const afterOpening=node.writes;ui.api.render();assert.equal(node.writes,afterOpening);assert.match(node.innerHTML,/<details open /);
 ui.api.setSummary(summary([course({status:'monitored'})]));ui.api.render();assert.equal(node.writes,afterOpening+1);assert.match(node.innerHTML,/1 monitored/);
 const task=worksheet({task:'cost-time'});task.api.render();assert.equal(task.node('sheet-course-assessments').hidden,true);assert.equal(task.node('sheet-course-assessments').innerHTML,'');
});

test('comparison and worksheet use the same scoped assessment presentation without mutating scenario state',()=>{
 const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8'),at=script.indexOf(" document.addEventListener('click'");assert(at>0);const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
 const data=freeze(summary([course(),course({key:'u:1',provider:'University',title:'Capstone',status:'unknown',university:true,sources:[]})])),context={document:{getElementById:node},location:{search:''},URL,URLSearchParams,Intl,console};context.window={DegreeCourseAssessment:{summarize:()=>data},DegreeCourseAssessmentView:View};
 vm.runInNewContext(script.slice(0,at)+'window.__renderAssessment=courseAssessmentsHTML;}());',context);
 const scenario=freeze({draft:{program:{id:'program'},plan:{rows:[]}},state:{learning:[{credits:4,creditSystem:'quarter',status:'earned',privateNote:'Keep this note'}]}}),before=JSON.stringify(scenario);assert.equal(context.window.__renderAssessment(scenario),View.render(data,{compact:true}));assert.equal(JSON.stringify(scenario),before);assert.equal(context.window.__renderAssessment({draft:{}}),'');
});
