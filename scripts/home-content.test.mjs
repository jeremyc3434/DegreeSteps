import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {buildHomeExample,buildHomeTuition,renderHome} from './home-content.mjs';
import {renderCostWidget} from './cost-content.mjs';

const require=createRequire(import.meta.url),Planner=require('../dist/planner.js'),Cost=require('../dist/cost-engine.js');
const registry=require('../dist/data/curriculum-registry.json');
const entry=registry.models.find(item=>item.id==='liberty-business-residential');
const pack=require('../dist/'+entry.path),program=(pack.models||[pack]).find(item=>item.id===entry.id);
const baseline=Object.values(require('../dist/data/baseline-index.json').baselines).find(item=>item.modelId===program.id&&item.pathwayId===program.id);
const example=buildHomeExample({program,baseline,Planner});
const costData=require('../dist/data/cost-comparisons.json'),costEntry=costData.entries.find(item=>item.id==='liberty-residential');
const tuition=buildHomeTuition({example,entry:costEntry,Cost});
const cta=(label,href)=>'<a href="'+href+'">'+label+'</a>';
const render=(data=example,costSection='',comparison=tuition)=>renderHome({cta,articleCard:()=>'',guides:[],costSection,example:data,tuition:comparison});
const routeData=html=>JSON.parse(html.match(/id="home-route-example-data">([\s\S]*?)<\/script>/)[1]);
const textOnly=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const script=await readFile(new URL('../dist/site.js',import.meta.url),'utf8');

function mount(data){
 const listeners={},nodes=new Map(),forbidden=[],select={value:'sophia',disabled:true,addEventListener(name,fn){listeners[name]=fn;}};
 for(const key of ['course-provider','outside','university','route-feedback','choice-source','choice-title','tuition-before','tuition-after','tuition-difference','tuition-before-terms','tuition-after-terms'])nodes.set('[data-home-'+key+']',{textContent:''});
 for(const key of ['mix-outside','mix-university','tuition-before-bar','tuition-after-bar'])nodes.set('[data-home-'+key+']',{style:{}});
 for(const key of ['provider-logo','self-paced-note'])nodes.set('[data-home-'+key+']',{hidden:false});
 nodes.set('[data-home-mix-track]',{attributes:{},setAttribute(name,value){this.attributes[name]=value;}});
 nodes.set('[data-home-course-choice]',select);
 const route={querySelector:selector=>nodes.get(selector)||null},original=JSON.stringify(data),payload={textContent:original};
 const document={querySelector:selector=>selector==='[data-home-route-example]'?route:null,getElementById:id=>id==='home-route-example-data'?payload:null,addEventListener(){}};
 const deny=name=>{forbidden.push(name);throw Error('The public illustration must not access '+name);};
 const context={document,matchMedia:()=>({matches:true,addEventListener(){}}),fetch(){deny('fetch');},navigator:{sendBeacon(){deny('sendBeacon');}}};context.window=context;
 for(const name of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(context,name,{get(){return deny(name);}});
 vm.runInNewContext(script,context);
 assert.deepEqual(forbidden,[],'Initial enhancement never accesses private storage or the network');
 return{nodes,select,listeners,payload,original,change(value){assert.equal(typeof listeners.change,'function','A valid example enables the existing choice control');select.value=value;listeners.change();assert.deepEqual(forbidden,[],'Changing an illustrative course never accesses private storage or the network');}};
}

test('homepage rows reproduce actual baseline requirements and source choices, without completed awards',()=>{
 assert.deepEqual([example.choices.sophia.outside,example.choices.sophia.university,example.total],[83,37,120]);
 assert.equal(example.personalCreditsAwarded,0);
 assert.deepEqual(example.displayRows.map(row=>row.requirementId),['engl-101','engl-102','busi-490']);
 for(const row of example.displayRows){
  const requirement=program.requirements.find(item=>item.id===row.requirementId),saved=baseline.rows.find(item=>item.requirementId===row.requirementId),option=requirement.options.find(item=>item.id===saved.optionId);
  assert.equal(row.code,requirement.code);assert.equal(row.title,requirement.title);assert.equal(row.credits,saved.credits);
  assert.equal(row.provider,option.provider==='University'?program.school:option.provider);assert.equal(saved.status,'planned');
 }
});

test('a wrong provider, unsupported baseline option or completed record cannot become the public worksheet',()=>{
 for(const edit of [row=>row.provider='Another college',row=>row.optionId='unreviewed-option',row=>row.status='confirmed']){
  const changed=structuredClone(baseline);edit(changed.rows.find(item=>item.id==='engl-102'||item.requirementId==='engl-102'));
  assert.throws(()=>buildHomeExample({program,baseline:changed,Planner}),/actual, unfinished baseline/);
 }
});

test('the homepage is three readable vertical chapters with the exact plan and no carousel controls',()=>{
 const html=render(),hero=html.split('<section class="home-credit-strip"')[0];
 assert.match(textOnly(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||''),/^The degree you want\. A smarter way there\.$/);
 const chapters=[...hero.matchAll(/<section\b[^>]*\bid="(home-step-\d+)"[^>]*\bdata-home-step\b[^>]*>/g)];
 assert.deepEqual(chapters.map(row=>row[1]),['home-step-1','home-step-2','home-step-3']);
 for(const [index,title] of ['The degree you want','More ways to earn credit','Your route, made clear'].entries()){
  assert(chapters[index][0].includes('data-step-title="'+title+'"'));
  assert(!/\b(?:hidden|inert|aria-hidden)\b/.test(chapters[index][0]),'Every server-rendered chapter is available');
 }
 assert.match(hero,/<h2 id="home-step-title-2">More ways to earn credit\.<\/h2>/);
 assert.match(textOnly(hero.match(/<h2 id="home-step-title-3">([\s\S]*?)<\/h2>/)?.[1]||''),/^Your route, made clear\.$/);
 assert.doesNotMatch(hero,/data-home-step-(?:viewport|track|back|next|controls|status)\b/);
 assert.doesNotMatch(hero,/role="(?:progressbar|tablist)"|aria-roledescription="(?:carousel|slide)"/);
 assert.match(hero,/Example degree plan/);assert.match(hero,/role="img"[^>]+83 credits[\s\S]+37 credits[\s\S]+120 degree credits/);
 assert.match(hero,/planned coursework, not completed credit/);
 for(const row of example.displayRows){assert(hero.includes(row.code));assert(hero.includes(row.title.replace(/&/g,'&amp;')));}
 const first=hero.slice(hero.indexOf('id="home-step-1"'),hero.indexOf('id="home-step-2"'));
 assert.match(first,/href="\/portal.html"/);assert.match(first,/href="\/portal.html\?view=setup"/);assert.match(first,/href="\/import-courses.html"/);assert.match(first,/No transcript needed/);
 assert.match(hero,/See an example plan/);assert.match(hero,/Sign in when you’re ready to save/);
 assert(hero.includes('href="'+example.planUrl.replace(/&/g,'&amp;')+'">Start a plan for this degree<'));
 assert.match(hero,/See the full starting plan/);assert.match(hero,/Choose your courses when you build your own plan\. This example isn’t saved\./);
 assert.match(hero,/data-home-step-build href="\/portal.html"/);assert(hero.indexOf('data-home-step-build')>hero.indexOf('class="home-journey-actionbar"'));
 assert.equal((hero.match(/data-home-course-choice/g)||[]).length,1);
 assert.equal((html.match(/data-home-route-example\b/g)||[]).length,1);assert.equal((html.match(/id="home-route-example-data"/g)||[]).length,1);
 assert.equal(routeData(html).personalCreditsAwarded,0);
 assert.throws(()=>render({...example,displayRows:[]}),/actual three-course worksheet/);
});

test('tuition illustrations use the same credit scenario and real tuition engine without changing source facts',()=>{
 const beforeExample=JSON.stringify(example),beforeEntry=JSON.stringify(costEntry),value=buildHomeTuition({example,entry:costEntry,Cost});
 assert.equal(value.scope,'tuition-plus-outside-budget');assert.equal(value.outsideBudget,2000);assert.equal(value.unitsPerTerm,15);
 for(const [id,choice] of Object.entries(example.choices)){
  const expected=Cost.calculate(costEntry,{transferUnits:choice.outside,outsideBudget:2000,unitsPerTerm:15}),actual=value.choices[id];
  assert.deepEqual(actual,{before:expected.beforeTotal,after:expected.afterTotal,difference:expected.savings,outside:choice.outside,university:choice.university,beforeTerms:expected.beforeTerms,afterTerms:expected.afterTerms});
  assert.equal(actual.outside+actual.university,120);assert.equal(actual.before-actual.after,actual.difference);
 }
 assert.deepEqual([value.choices.sophia.before,value.choices.sophia.after,value.choices.sophia.difference],[101560,33480,68080]);
 assert.deepEqual([value.choices.university.after,value.choices.university.difference],[36090,65470]);
 assert.equal(JSON.stringify(example),beforeExample);assert.equal(JSON.stringify(costEntry),beforeEntry);assert.deepEqual(value.sources,costEntry.sources);
 const html=render();assert.match(html,/data-home-tuition-after>\$33,480/);assert.match(html,/data-home-tuition-difference>\$68,080/);
 assert.match(html,/Before financial aid/);assert.match(html,/Other fees, books and living costs are extra/);assert.match(html,/outside study and course availability can add time/);
 const withoutTuition=render(example,'',null);assert.doesNotMatch(withoutTuition,/data-home-tuition-after/);assert.equal(routeData(withoutTuition).tuition,null);
});

test('wrong school format, degree size or scenario quantities cannot become the same-plan tuition illustration',()=>{
 for(const options of [
  {example:{...example,modelId:'another-degree'},entry:costEntry},
  {example:{...example,format:'Online'},entry:costEntry},
  {example,entry:{...costEntry,id:'liberty-online'}},
  {example,entry:{...costEntry,totalUnits:121}}
 ])assert.throws(()=>buildHomeTuition({...options,Cost}),/same Liberty campus degree and credit total/);
 const wrongMix=structuredClone(example);wrongMix.choices.university.university++;
 assert.throws(()=>buildHomeTuition({example:wrongMix,entry:costEntry,Cost}),/tuition comparison and proposed course mix disagree/);
 for(const edit of [value=>value.choices.sophia.outside=90,value=>delete value.choices.university,value=>value.choices.university.difference++,value=>value.choices.sophia.after=NaN]){
  const invalid=structuredClone(tuition);edit(invalid);assert.throws(()=>render(example,'',invalid),/tuition example must match every course-choice scenario/);
 }
});

test('changing a course updates source, planned credits, logo, bar and exact-credit tuition together without private data access',()=>{
 const data=routeData(render()),original=JSON.stringify(data),f=mount(data),node=key=>f.nodes.get('[data-home-'+key+']');
 assert.equal(f.select.disabled,false);assert.equal(node('outside').textContent,'83');assert.equal(node('university').textContent,'37');
 assert.equal(node('tuition-after').textContent,'$33,480');assert.equal(node('tuition-difference').textContent,'$68,080');assert.equal(node('provider-logo').hidden,false);assert.equal(node('self-paced-note').hidden,false);
 f.change('university');assert.equal(node('outside').textContent,'80');assert.equal(node('university').textContent,'40');assert.equal(node('course-provider').textContent,'Liberty University');
 assert.equal(node('mix-outside').style.flexGrow,'80');assert.equal(node('mix-university').style.flexGrow,'40');assert.equal(node('choice-source').textContent,'Liberty University');assert.equal(node('choice-title').textContent,data.choices.university.title);
 assert.match(node('mix-track').attributes['aria-label'],/80 credits[\s\S]+40 credits[\s\S]+120 degree credits/);
 assert.equal(node('provider-logo').hidden,true);assert.equal(node('self-paced-note').hidden,true);
 assert.equal(node('tuition-before').textContent,'$101,560');assert.equal(node('tuition-after').textContent,'$36,090');assert.equal(node('tuition-difference').textContent,'$65,470');
 assert.equal(node('tuition-before-terms').textContent,'8');assert.equal(node('tuition-after-terms').textContent,'3');
 assert.equal(node('tuition-after-bar').style.width,(36090/101560*100).toFixed(3)+'%');assert.equal(node('tuition-before-bar').style.width,'100.000%');
 f.change('sophia');assert.equal(node('outside').textContent,'83');assert.equal(node('university').textContent,'37');assert.equal(node('mix-outside').style.flexGrow,'83');assert.equal(node('mix-university').style.flexGrow,'37');
 assert.equal(node('choice-source').textContent,'Sophia');assert.equal(node('choice-title').textContent,data.choices.sophia.title);assert.match(node('mix-track').attributes['aria-label'],/83 credits[\s\S]+37 credits/);
 assert.equal(node('provider-logo').hidden,false);assert.equal(node('self-paced-note').hidden,false);assert.equal(node('tuition-after').textContent,'$33,480');assert.equal(node('tuition-difference').textContent,'$68,080');assert.equal(node('tuition-after-bar').style.width,(33480/101560*100).toFixed(3)+'%');
 assert.equal(f.payload.textContent,f.original);assert.equal(JSON.stringify(data),original);assert.equal(data.personalCreditsAwarded,0);
});

test('malformed tuition keeps the source choice disabled instead of publishing mismatched dynamic totals',()=>{
 for(const edit of [
  data=>data.tuition.scope='tuition-only',
  data=>data.tuition.outsideBudget=-1,
  data=>data.tuition.unitsPerTerm=0,
  data=>delete data.tuition.choices.university,
  data=>data.tuition.choices.sophia.outside=90,
  data=>data.tuition.choices.sophia.after=-1,
  data=>data.tuition.choices.sophia.after=NaN,
  data=>data.tuition.choices.university.difference++,
  data=>data.tuition.choices.university.beforeTerms=-1,
  data=>data.personalCreditsAwarded=3
 ]){
  const data=routeData(render());edit(data);const f=mount(data);
  assert.equal(f.select.disabled,true);assert.equal(f.listeners.change,undefined);assert.equal(f.nodes.get('[data-home-tuition-after]').textContent,'');assert.equal(f.payload.textContent,f.original);
 }
});

test('the expandable calculator retains its complete six-college examples separately from the exact-credit homepage illustration',()=>{
 const calculator=renderCostWidget(costData),html=render(example,calculator);
 assert.equal(new Set(costData.entries.map(item=>item.schoolName)).size,6);assert(html.includes(calculator));
 assert.match(html,/<details class="home-tool-drawer home-cost-drawer"><summary>[\s\S]+Compare costs at six colleges/);
 assert.match(html,/Separate tuition examples with editable assumptions/);
 for(const item of costData.entries)assert(html.includes('<option value="'+item.id+'"'));
 assert.match(html,/data-cost-school/);assert.match(html,/data-cost-transfer/);assert.match(html,/id="degree-cost-data"/);
 assert.deepEqual([routeData(html).tuition.choices.sophia.outside,routeData(html).tuition.choices.sophia.university],[83,37]);
});
