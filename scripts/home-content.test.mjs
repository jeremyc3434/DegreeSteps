import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {buildHomeExample,buildHomeEstimate,renderHome} from './home-content.mjs';
import {renderCostWidget} from './cost-content.mjs';

const require=createRequire(import.meta.url),Planner=require('../dist/planner.js'),Estimate=require('../dist/plan-estimate-engine.js');
const registry=require('../dist/data/curriculum-registry.json');
const entry=registry.models.find(item=>item.id==='liberty-business-residential');
const pack=require('../dist/'+entry.path),program=(pack.models||[pack]).find(item=>item.id===entry.id);
const baseline=Object.values(require('../dist/data/baseline-index.json').baselines).find(item=>item.modelId===program.id&&item.pathwayId===program.id);
const example=buildHomeExample({program,baseline,Planner});
const costData=require('../dist/data/cost-comparisons.json'),rates=require('../dist/data/plan-estimate-rates.json'),indexEntry=require('../dist/data/plan-library-index.json').plans[program.id];
const estimate=buildHomeEstimate({example,program,baseline,Planner,Estimate,rates,indexEntry});
const cta=(label,href)=>'<a href="'+href+'">'+label+'</a>';
const render=(data=example,costSection='',comparison=estimate)=>renderHome({cta,articleCard:()=>'',guides:[],costSection,example:data,estimate:comparison});
const routeData=html=>JSON.parse(html.match(/id="home-route-example-data">([\s\S]*?)<\/script>/)[1]);
const textOnly=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const script=await readFile(new URL('../dist/site.js',import.meta.url),'utf8');

function mount(data){
 const listeners={},nodes=new Map(),forbidden=[],select={value:'sophia',disabled:true,addEventListener(name,fn){listeners[name]=fn;}};
 for(const key of ['course-provider','outside','university','route-feedback','choice-source','choice-title','estimate-range','estimate-terms','estimate-outside'])nodes.set('[data-home-'+key+']',{textContent:''});
 for(const key of ['mix-outside','mix-university'])nodes.set('[data-home-'+key+']',{style:{}});
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

test('the homepage has one clear route focal point, connected course steps and no carousel controls',()=>{
 const html=render(),hero=html.split('<section class="home-credit-strip"')[0];
 assert.match(textOnly(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||''),/^Your degree\. Within reach\.$/);
 assert.equal((html.match(/<h1\b/g)||[]).length,1,'one page title');
 assert.equal(textOnly(hero.match(/<h2 id="home-steps-title"[^>]*>([\s\S]*?)<\/h2>/)?.[1]||''),example.school);assert.match(hero,/class="home-outside-focus"/);assert.match(hero,/credits through lower-cost courses/);
 assert.match(html,/<form class="home-search-form" action="\/start.html" method="get"/);assert.match(html,/href="\/start.html\?step=quiz"/);assert.equal((html.match(/class="home-search-chip"/g)||[]).length,5);
 const chapters=[...hero.matchAll(/<section\b[^>]*\bid="(home-step-\d+)"[^>]*\bdata-home-step\b[^>]*>/g)];
 assert.deepEqual(chapters.map(row=>row[1]),['home-step-1','home-step-2','home-step-3']);
 for(const [index,title] of ['Find your degree','Choose your courses','Take your next step'].entries()){
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
 assert.match(first,/href="\/start.html"/);assert.match(first,/href="\/start.html\?step=quiz"/);assert.match(first,/href="\/import-courses.html"/);assert.match(first,/No transcript needed/);
 assert.match(hero,/See the plan/);assert.match(hero,/Sign in when you’re ready to save/);
 assert(hero.includes('href="'+example.planUrl.replace(/&/g,'&amp;')+'">Start a plan for this degree<'));
 assert.match(hero,/See the full starting plan/);assert.match(hero,/Choose your courses when you build your own plan\. This example isn’t saved\./);
 assert.match(first,/href="\/start.html">Build my plan/);assert.doesNotMatch(hero,/class="home-journey-actionbar"/,'the page never overlays a second sticky conversion action');
 assert.equal((hero.match(/data-home-course-choice/g)||[]).length,1);
 assert.equal((html.match(/data-home-route-example\b/g)||[]).length,1);assert.equal((html.match(/id="home-route-example-data"/g)||[]).length,1);
 assert.equal(routeData(html).personalCreditsAwarded,0);
 assert.throws(()=>render({...example,displayRows:[]}),/actual three-course worksheet/);
});

test('the homepage cost line is the plan’s own planning estimate, the same as its plan page and the finder',()=>{
 const before=JSON.stringify(example);
 assert.equal(estimate.scope,'plan-estimate');assert.equal(estimate.planUrl,'/degree-plans/liberty-business-residential/');
 assert.deepEqual([estimate.choices.sophia.min,estimate.choices.sophia.max],[indexEntry.estimate.min,indexEntry.estimate.max]);
 assert.deepEqual(estimate.choices.sophia.universityTerms,indexEntry.timing.universityTerms);assert.deepEqual(estimate.choices.sophia.outsideMonths,indexEntry.timing.outsideMonths);
 for(const [id,choice] of Object.entries(example.choices)){const value=estimate.choices[id];assert.equal(value.outside,choice.outside);assert.equal(value.university,choice.university);assert(value.min>0&&value.max>=value.min);}
 assert(estimate.choices.university.min>estimate.choices.sophia.min,'taking the writing course at Liberty costs more');
 assert.equal(JSON.stringify(example),before);
 const html=render(),money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 assert(html.includes('data-home-estimate-range>'+money(indexEntry.estimate.min)+'–'+money(indexEntry.estimate.max)+'<'));
 assert.match(html,/Planning estimate · Before financial aid/);assert.match(html,/same planning estimate as <a href="\/degree-plans\/liberty-business-residential\/">this plan’s page<\/a>/);
 assert.doesNotMatch(html,/University tuition alone|difference in this example/);
 const withoutEstimate=render(example,'',null);assert.doesNotMatch(withoutEstimate,/data-home-estimate-range/);assert.equal(routeData(withoutEstimate).estimate,null);
});

test('a different plan, mismatched course mix or estimate cannot become the homepage example',()=>{
 assert.throws(()=>buildHomeEstimate({example:{...example,modelId:'another-degree'},program,baseline,Planner,Estimate,rates,indexEntry}),/same Liberty campus degree/);
 const wrongMix=structuredClone(example);wrongMix.choices.university.university++;
 assert.throws(()=>buildHomeEstimate({example:wrongMix,program,baseline,Planner,Estimate,rates,indexEntry}),/estimate and proposed course mix disagree/);
 assert.throws(()=>buildHomeEstimate({example,program,baseline,Planner,Estimate,rates,indexEntry:{estimate:{min:1,max:2}}}),/equal the plan page and plan finder estimate/);
 for(const edit of [value=>value.choices.sophia.outside=90,value=>delete value.choices.university,value=>value.choices.university.min=NaN,value=>value.scope='tuition-only']){
  const invalid=structuredClone(estimate);edit(invalid);assert.throws(()=>render(example,'',invalid),/homepage estimate must match every course-choice scenario/);
 }
});

test('changing a course updates source, planned credits, logo, bar and planning estimate together without private data access',()=>{
 const data=routeData(render()),original=JSON.stringify(data),f=mount(data),node=key=>f.nodes.get('[data-home-'+key+']'),money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 const sophia=data.estimate.choices.sophia,university=data.estimate.choices.university;
 assert.equal(f.select.disabled,false);assert.equal(node('outside').textContent,'83');assert.equal(node('university').textContent,'37');
 assert.equal(node('estimate-range').textContent,money(sophia.min)+'–'+money(sophia.max));assert.equal(node('estimate-terms').textContent,sophia.universityTerms.min+'–'+sophia.universityTerms.max);
 f.change('university');assert.equal(node('outside').textContent,'80');assert.equal(node('university').textContent,'40');assert.equal(node('course-provider').textContent,'Liberty University');
 assert.equal(node('mix-outside').style.flexGrow,'80');assert.equal(node('mix-university').style.flexGrow,'40');assert.equal(node('choice-title').textContent,data.choices.university.title);
 assert.equal(node('provider-logo').hidden,true);assert.equal(node('self-paced-note').hidden,true);
 assert.equal(node('estimate-range').textContent,money(university.min)+'–'+money(university.max));
 f.change('sophia');assert.equal(node('outside').textContent,'83');assert.equal(node('estimate-range').textContent,money(sophia.min)+'–'+money(sophia.max));
 assert.equal(f.payload.textContent,f.original);assert.equal(JSON.stringify(data),original);assert.equal(data.personalCreditsAwarded,0);
});

test('a malformed estimate keeps the source choice disabled instead of publishing mismatched dynamic totals',()=>{
 for(const edit of [
  data=>data.estimate.scope='tuition-only',
  data=>delete data.estimate.choices.university,
  data=>data.estimate.choices.sophia.outside=90,
  data=>data.estimate.choices.sophia.min=-1,
  data=>data.estimate.choices.sophia.max=NaN,
  data=>data.estimate.choices.university.universityTerms.min=-1,
  data=>data.personalCreditsAwarded=3
 ]){
  const data=routeData(render());edit(data);const f=mount(data);
  assert.equal(f.select.disabled,true);assert.equal(f.listeners.change,undefined);assert.equal(f.nodes.get('[data-home-estimate-range]').textContent,'');assert.equal(f.payload.textContent,f.original);
 }
});

test('the expandable calculator retains its complete six-college examples separately from the exact-credit homepage illustration',()=>{
 const calculator=renderCostWidget(costData),html=render(example,calculator);
 assert.equal(new Set(costData.entries.map(item=>item.schoolName)).size,6);assert(html.includes(calculator));
 assert.match(html,/<details class="home-tool-drawer home-cost-drawer"><summary>[\s\S]+A tuition calculator with generic examples/);
 assert.match(html,/Generic tuition examples at six colleges’ published rates/);
 for(const item of costData.entries)assert(html.includes('<option value="'+item.id+'"'));
 assert.match(html,/data-cost-school/);assert.match(html,/data-cost-transfer/);assert.match(html,/id="degree-cost-data"/);
 assert.deepEqual([routeData(html).estimate.choices.sophia.outside,routeData(html).estimate.choices.sophia.university],[83,37]);
});
