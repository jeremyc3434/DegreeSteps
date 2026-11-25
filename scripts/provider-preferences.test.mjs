/** Production worksheet closure mounted with synthetic state and local engines. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Sheet from '../dist/sheet-state.js';
import Journey from '../dist/journey-engine.js';
import Guide from '../dist/guide-engine.js';
import Planner from '../dist/planner.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const source=readFileSync(new URL('../dist/sheet.js',import.meta.url),'utf8');
const mapped=['Sophia','Study.com','CLEP','Saylor','StraighterLine'];
const route={id:'preference-route',modelId:'preference-degree',school:'Example University',title:'Example degree',level:'bachelor',modalities:['online']};
function mount({scenario,proctoringPreference='open',providers=mapped,defaults}={}){
 const model={id:route.modelId,school:route.school,title:route.title,level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:3,requirements:[{id:'writing',code:'ENG101',title:'Composition',credits:3,options:[...providers,'University'].map(provider=>({id:provider+'-writing',provider,code:'ENG101',title:'Composition',credits:3}))}],...(defaults?{defaultProviders:defaults}:{})};
 const initial={version:3,profile:{priority:'transfer',proctoringPreference},selectedPathwayId:route.id,learning:[{id:'original-course',provider:'Former College',code:'BIO101',status:'earned',credits:4,creditSystem:'semester',evaluations:[]}],sheet:{notes:{private:'Keep this note'}},scenarios:scenario===undefined?{}:{[model.id]:copy(scenario)}};
 let writes=0;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',classList:{add(){}},addEventListener(){}});return nodes.get(id);};
 const document={getElementById:node,addEventListener(){},dispatchEvent(){},body:node('body')};
 const context={console,URL,URLSearchParams,Intl,Math,Date,JSON,document,location:{search:'',pathname:'/plan.html'},localStorage:{getItem(){return JSON.stringify(initial);},setItem(){writes++;}},setTimeout(){},clearTimeout(){},addEventListener(){},DegreeSheet:Sheet,DegreeGuide:Guide,DegreePlanner:Planner,DegreeJourney:Journey,__fixture:JSON.stringify({initial,model,route})};
 context.window=context;vm.createContext(context);
 const hook=`const fixture=JSON.parse(__fixture);state=fixture.initial;models=[fixture.model];pathway=fixture.route;program=models[0];window.__providerPreferences={settings,updateSettings,state:()=>state,program:()=>program};`;
 const mounted=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hook+'\n}());');assert.notEqual(mounted,source,'Mount the production worksheet boot boundary');
 vm.runInContext(mounted,context,{filename:'sheet.js'});
 return {api:context.__providerPreferences,writes:()=>writes,initial:copy(initial),settings(){return copy(context.__providerPreferences.settings());},state(){return copy(context.__providerPreferences.state());}};
}

test('newly mapped sources do not enable themselves over a stored provider selection or course pin',()=>{
 for(const selected of [['Sophia'],[],['Study.com','StraighterLine']]){
  const scenario={providers:selected,mappedProvidersReviewed:['Sophia','Study.com','CLEP'],optionSelections:{writing:'University-writing'},providerMonths:{'Study.com':2},fees:9};
  const ui=mount({scenario}),settings=ui.settings(),state=ui.state();
  assert.deepEqual(settings.providers,selected);assert.deepEqual(settings.mappedProvidersReviewed,mapped);
  assert.deepEqual(settings.optionSelections,scenario.optionSelections);assert.deepEqual(settings.providerMonths,scenario.providerMonths);assert.equal(settings.fees,9);
  assert.deepEqual(state.learning,ui.initial.learning);assert.deepEqual(state.sheet,ui.initial.sheet);assert.equal(ui.writes(),0,'Reading settings cannot write private storage');
  assert.deepEqual(ui.settings(),settings,'Repeated settings reads cannot progressively enable sources');
  const reloaded=mount({scenario:state.scenarios[route.modelId]}),withAnotherSource=mount({scenario:state.scenarios[route.modelId],providers:[...mapped,'DSST']});
  assert.deepEqual(reloaded.settings().providers,selected);assert.deepEqual(withAnotherSource.settings().providers,selected);assert.deepEqual(withAnotherSource.settings().mappedProvidersReviewed,[...mapped,'DSST']);
 }
});

test('a genuinely fresh scenario gets all mapped sources while non-provider settings survive',()=>{
 for(const scenario of [undefined,{fees:12,optionSelections:{writing:'University-writing'}},{fees:12,optionSelections:{writing:'University-writing'},mappedProvidersReviewed:mapped}]){
  const ui=mount({scenario}),settings=ui.settings();assert.deepEqual(settings.providers,mapped);assert.deepEqual(settings.mappedProvidersReviewed,mapped);
  if(scenario){assert.equal(settings.fees,12);assert.deepEqual(settings.optionSelections,scenario.optionSelections);}
  assert.deepEqual(ui.state().learning,ui.initial.learning);assert.equal(ui.writes(),0);
 }
 const reviewedDefaults=mount({defaults:['Sophia','Unavailable Provider']});assert.deepEqual(reviewedDefaults.settings().providers,['Sophia'],'Program-specific reviewed defaults match Journey preparation');
});

test('removing or reintroducing mapped providers updates discovery without changing saved choices',()=>{
 const ui=mount({scenario:{providers:['Sophia'],mappedProvidersReviewed:[...mapped,'DSST']}});
 assert.deepEqual(ui.settings().providers,['Sophia']);assert.deepEqual(ui.settings().mappedProvidersReviewed,mapped);
 const after=ui.state().scenarios[route.modelId],reintroduced=mount({scenario:after,providers:[...mapped,'DSST']});
 assert.deepEqual(reintroduced.settings().providers,['Sophia']);assert.deepEqual(reintroduced.settings().mappedProvidersReviewed,[...mapped,'DSST']);
});

test('the actual planning input keeps source choices separate from the course-level assessment preference',()=>{
 const ui=mount({proctoringPreference:'avoid'});assert.deepEqual(ui.settings().providers,mapped);
 const state=ui.state(),before=copy(state),input=Journey.planningInput(state,route,{completed:[]},ui.api.program());
 assert.deepEqual(input.providers,mapped);assert.equal(input.proctoringPreference,'avoid');assert.deepEqual(state,before,'Applying assessment preferences cannot rewrite the stored source choices');
 const explicit=mount({scenario:{providers:['Sophia','Saylor','StraighterLine']},proctoringPreference:'avoid'});explicit.settings();
 const selected=Journey.planningInput(explicit.state(),route,{completed:[]},explicit.api.program());assert.deepEqual(selected.providers,['Sophia','Saylor','StraighterLine']);assert.equal(selected.proctoringPreference,'avoid');
 assert.deepEqual(explicit.settings().providers,['Sophia','Saylor','StraighterLine']);
});
