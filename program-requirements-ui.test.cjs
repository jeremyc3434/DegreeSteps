'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Facts=require('./dist/program-opportunities.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const source=(overrides={})=>({id:'policy-source',url:'https://college.example/official-policy',title:'Official college policy',checkedOn:'2026-11-24',...overrides});
const fact=(overrides={})=>({id:'entry-options',kind:'admission',scope:'program',label:'Choose an entry route',detail:'Applicants may qualify with 30 college credits or three years of relevant experience.',sourceIds:['policy-source'],sources:[source()],...overrides});

test('reviewed requirements preserve alternatives, source identity and frozen inputs',()=>{
 const input=freeze({programRequirements:[fact({scope:'school-policy',prominent:true})]}),before=JSON.stringify(input);
 const result=Facts.programRequirements(input);assert.equal(result.length,1);
 assert.equal(result[0].detail,input.programRequirements[0].detail,'Admission alternatives remain an OR, not a new eligibility rule');
 assert.deepEqual(result[0].sourceIds,['policy-source']);assert.equal(result[0].sources[0].checkedOn,'2026-11-24');
 const html=Facts.requirementsHTML(input,{compact:true});
 assert.match(html,/Before you choose/);assert.match(html,/program-requirements-compact/);assert.match(html,/30 college credits or three years/);
 assert.match(html,/School policy/);assert.match(html,/data-requirement-scope="school-policy"/);assert.match(html,/data-source-id="policy-source"/);assert.match(html,/data-source-checked="2026-11-24"/);
 assert.equal(JSON.stringify(input),before);
});

test('requirement text and official source labels are escaped instead of becoming active HTML',()=>{
 const input={programRequirements:[fact({label:'<img src=x onerror=alert(1)>',detail:'Use <script>alert(1)</script> or <svg onload=alert(2)>.',sources:[source({title:'<iframe src=x> & policy',url:'https://college.example/policy?choice="quoted"&route=one'})]})]};
 const html=Facts.requirementsHTML(input);
 assert.doesNotMatch(html,/<img|<script|<svg|<iframe| onerror="| onload="/);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.match(html,/&lt;iframe/);assert.match(html,/&amp; policy/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/choice="quoted"/,'URL quoting cannot break the link attribute');
});

test('missing, unsafe, undated or partly unresolved evidence never becomes a displayed fact',()=>{
 const invalid=[
  fact({sources:[]}),fact({sourceIds:[]}),fact({sourceIds:['missing']}),
  ...['javascript:alert(1)','http://college.example/policy','https://user:password@college.example/policy'].map(url=>fact({sources:[source({url})]})),
  ...['','2026-02-30','2025-02-29','2026-11-24T00:00:00Z'].map(checkedOn=>fact({sources:[source({checkedOn})]})),
  fact({sourceIds:['policy-source','missing']}),fact({sourceIds:['policy-source','unsafe-source'],sources:[source(),source({id:'unsafe-source',url:'javascript:alert(1)'})]}),
  fact({id:'not an id'}),fact({scope:undefined}),fact({scope:'global'}),fact({kind:'price'}),fact({label:''}),fact({detail:'  '})
 ];
 for(const item of invalid){const input={programRequirements:[item]};assert.deepEqual(Facts.programRequirements(input),[],JSON.stringify(item));assert.equal(Facts.requirementsHTML(input),'');assert.deepEqual(Facts.requirementBadges(input),[]);}
 const leap={programRequirements:[fact({sources:[source({checkedOn:'2024-02-29'})]})]};assert.equal(Facts.programRequirements(leap).length,1,'A genuine leap day is a valid review date');
});

test('absent and malformed facts stay absent rather than implying no attendance, exams or licensing',()=>{
 for(const input of [undefined,null,{}, {programRequirements:[]},{programRequirements:'no exams'},{programRequirements:[null,false,{},fact({scope:null})]}]){
  assert.equal(Facts.requirementsHTML(input),'');assert.deepEqual(Facts.requirementBadges(input),[]);assert.deepEqual(Facts.programRequirements(input),[]);
 }
});

test('only explicitly prominent program or course obligations become badges',()=>{
 const input={programRequirements:[
  fact({id:'school-testing',kind:'assessment',scope:'school-policy',prominent:true,label:'Some courses use monitored exams'}),
  fact({id:'live-capstone',kind:'attendance',scope:'course',prominent:true,label:'Live capstone seminars'}),
  fact({id:'fieldwork',kind:'attendance',scope:'program',prominent:true,label:'Practical experience required'}),
  fact({id:'not-prominent',prominent:false,label:'Entry documents'}),
  fact({id:'string-prominent',prominent:'true',label:'Not a boolean'})
 ]};
 assert.deepEqual(Facts.requirementBadges(input),['Live capstone seminars','Practical experience required']);
 const html=Facts.requirementsHTML(input);assert.match(html,/Some courses use monitored exams/);assert.match(html,/Entry documents/,'Nonprominent facts remain available in the expandable disclosure');
});

test('duplicate facts and repeated badge labels do not repeat disclosures',()=>{
 const first=fact({id:'live-a',kind:'attendance',scope:'course',prominent:true,label:'Live seminars',detail:'The capstone has required live seminars.',sourceIds:['policy-source','policy-source']});
 const input=freeze({programRequirements:[first,copy(first),{...copy(first),id:'live-b'},fact({id:'live-c',kind:'attendance',scope:'course',prominent:true,label:'Live seminars',detail:'A different sourced seminar condition.'})]});
 const result=Facts.programRequirements(input);assert.equal(result.length,2);assert.deepEqual(result[0].sourceIds,['policy-source']);
 assert.equal((Facts.requirementsHTML(input).match(/data-program-requirement=/g)||[]).length,2);assert.deepEqual(Facts.requirementBadges(input),['Live seminars']);
});

test('the shared degree details replace a legacy live notice only with the exact reviewed attendance type',()=>{
 const program={id:'human',url:'https://college.example/human-services'},legacy={requirements:[{type:'live-seminars',label:'Legacy live attendance',courseCode:'CAP 497',url:'https://college.example/capstone'}]};
 const live=fact({id:'capstone-live',kind:'attendance',scope:'course',type:'live-seminars',label:'Live capstone seminars',detail:'This capstone has required live seminars.'});
 const exact=Facts.detailsHTML(program,null,{...legacy,programRequirements:[live]});
 assert.doesNotMatch(exact,/Legacy live attendance/);assert.match(exact,/data-program-requirement="capstone-live"/);
 for(const replacement of [{...live,scope:'school-policy'},{...live,kind:'assessment'},{...live,type:'field-experience'},{...live,sources:[]}]){
  assert.match(Facts.detailsHTML(program,null,{...legacy,programRequirements:[replacement]}),/Legacy live attendance/,'General, unrelated or unsupported facts do not erase the actual course obligation');
 }
});

function comparisonRenderer(){
 const script=fs.readFileSync(require.resolve('./dist/compare-plans.js'),'utf8'),at=script.indexOf(" document.addEventListener('click'");assert(at>0);
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'collection',checked:false,innerHTML:'',textContent:'',hidden:false});return nodes.get(id);};
 const context={document:{getElementById:node},location:{search:''},URL,URLSearchParams,Intl,console};
 context.window={DegreeProgramOpportunities:Facts};
 const suffix="window.__requirementsRender=(scenario,index)=>{catalog={pathways:[]};planIndex=index;return degreeFitHTML(scenario);};}());";
 vm.runInNewContext(script.slice(0,at)+suffix,context,{filename:'compare-plans.js'});return context.window.__requirementsRender;
}
function comparisonFixture(requirements=[fact()]){
 const scenario={id:'route:exact-route',state:{learning:[{id:'private-course',credits:4,creditSystem:'quarter',status:'earned',privateNote:'Keep my note'}],scenarios:{old:{weeklyHours:12}},sheet:{notes:{old:'Keep these settings'}}},draft:{pathway:{id:'exact-route',modelId:'exact-model',school:'Example College',title:'Exact degree',modalities:['online']},program:{id:'exact-model',school:'Example College',title:'Exact degree',format:'Online',catalogYear:'2026–2027',sources:[],requirements:[]}}};
 const index={plans:{'exact-route':{modelId:'exact-model',fit:{modelId:'exact-model',catalogYear:'2026-2027',modality:'online',programRequirements:requirements}}}};
 return{scenario,index};
}

test('comparison only shows requirements bound to the actual model, catalog and delivery format',()=>{
 const render=comparisonRenderer(),data=freeze(comparisonFixture()),before=JSON.stringify(data);
 const html=render(data.scenario,data.index);assert.match(html,/data-program-requirement="entry-options"/);assert.match(html,/Before you choose/);assert.equal(JSON.stringify(data),before);
 for(const mutate of [
  value=>value.index.plans['exact-route'].modelId='different-model',
  value=>value.index.plans['exact-route'].fit.modelId='different-model',
  value=>value.index.plans['exact-route'].fit.catalogYear='2025-2026',
  value=>value.index.plans['exact-route'].fit.modality='campus',
  value=>value.scenario.draft.pathway.modalities=['campus'],
  value=>delete value.scenario.draft.program.catalogYear
 ]){const changed=copy(data);mutate(changed);assert.doesNotMatch(render(changed.scenario,changed.index),/data-program-requirements|entry-options/);}
});

test('comparison preserves genuine live capstone evidence unless a sourced program or course fact replaces it',()=>{
 const render=comparisonRenderer(),live=fact({id:'live-capstone',kind:'attendance',scope:'course',type:'live-seminars',prominent:true,label:'Live capstone seminars',detail:'Required live capstone seminars.'}),base=comparisonFixture([live]);
 base.scenario.draft.program.requirements=[{id:'capstone',title:'Capstone',registrationPolicy:{synchronousSeminars:true,sourceIds:['capstone-source']}}];
 base.scenario.draft.program.sources=[{id:'capstone-source',url:'https://college.example/capstone'}];
 const before=JSON.stringify(base),exact=render(base.scenario,base.index);
 assert.doesNotMatch(exact,/class="comparison-attendance-fact"/);assert.equal((exact.match(/data-program-requirement="live-capstone"/g)||[]).length,1);assert.equal(JSON.stringify(base),before);
 for(const change of [{scope:'school-policy'},{kind:'assessment'},{type:'field-experience'},{sources:[]}]){
  const changed=copy(base);Object.assign(changed.index.plans['exact-route'].fit.programRequirements[0],change);
  assert.match(render(changed.scenario,changed.index),/class="comparison-attendance-fact"/);
 }
});
