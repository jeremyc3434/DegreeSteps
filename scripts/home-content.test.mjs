import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {buildHomeExample,renderHome} from './home-content.mjs';
import {renderCostWidget} from './cost-content.mjs';

const require=createRequire(import.meta.url),Planner=require('../dist/planner.js');
const registry=require('../dist/data/curriculum-registry.json');
const entry=registry.models.find(item=>item.id==='liberty-business-residential');
const pack=require('../dist/'+entry.path),program=(pack.models||[pack]).find(item=>item.id===entry.id);
const baseline=Object.values(require('../dist/data/baseline-index.json').baselines).find(item=>item.modelId===program.id&&item.pathwayId===program.id);
const example=buildHomeExample({program,baseline,Planner});
const cta=(label,href)=>'<a href="'+href+'">'+label+'</a>';
const render=(data=example,costSection='')=>renderHome({cta,articleCard:()=>'',guides:[],costSection,example:data});

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
  const changed=structuredClone(baseline);edit(changed.rows.find(item=>item.requirementId==='engl-102'));
  assert.throws(()=>buildHomeExample({program,baseline:changed,Planner}),/actual, unfinished baseline/);
 }
});

test('the three-step introduction retains the exact proposed plan and readable fallback without requiring account or transcript',()=>{
 const html=render(),hero=html.slice(html.indexOf('<section class="home-route-hero home-steps-hero"'),html.indexOf('</section>'));
 assert.match(hero,/Example degree plan/);assert.match(hero,/role="img"[^>]+83 credits[\s\S]+37 credits[\s\S]+120 degree credits/);
 assert(!hero.includes('role="progressbar"'));assert.match(hero,/planned coursework, not completed credit/);
 for(const row of example.displayRows){assert(hero.includes(row.code));assert(hero.includes(row.title.replace(/&/g,'&amp;')));}
 assert.match(hero,/See an example plan/);assert.match(hero,/Sign in when you’re ready to save/);
 assert.equal((hero.match(/data-home-step\s/g)||[]).length,3);
 for(const title of ['Find your degree','We find the courses','Follow your plan'])assert(hero.includes('data-step-title="'+title+'"'));
 const first=hero.slice(hero.indexOf('id="home-step-1"'),hero.indexOf('id="home-step-2"'));
 assert.match(first,/href="\/programs.html"/);assert.match(first,/href="\/portal.html\?view=setup"/);assert.match(first,/href="\/import-courses.html"/);
 assert(!/<article\b[^>]*(?:hidden|inert)/.test(hero),'Server-rendered cards remain available without JavaScript');
 assert.match(hero,/data-home-step-controls hidden/);assert.match(hero,/data-home-step-build href="\/portal.html"/);
 assert(hero.indexOf('data-home-step-build')>hero.indexOf('</article>\n  </div></div>'));
 assert.equal((hero.match(/data-home-course-choice/g)||[]).length,1);
 assert.equal((html.match(/data-home-route-example\b/g)||[]).length,1);assert.equal((html.match(/id="home-route-example-data"/g)||[]).length,1);
 assert.throws(()=>render({...example,displayRows:[]}),/actual three-course worksheet/);
});

test('the retained course-choice demonstration changes the proposed mix without storage, network or credit awards',async()=>{
 const html=render(),data=JSON.parse(html.match(/id="home-route-example-data">([\s\S]*?)<\/script>/)[1]);
 const listeners={},nodes=new Map(),select={value:'sophia',disabled:true,addEventListener(name,fn){listeners[name]=fn;}};
 for(const key of ['course-provider','outside','university','route-feedback','choice-source','choice-title'])nodes.set('[data-home-'+key+']',{textContent:''});
 const outsideBar={style:{}},universityBar={style:{}},track={attributes:{},setAttribute(name,value){this.attributes[name]=value;}};
 nodes.set('[data-home-mix-outside]',outsideBar);nodes.set('[data-home-mix-university]',universityBar);nodes.set('[data-home-mix-track]',track);
 nodes.set('[data-home-course-choice]',select);
 const route={querySelector:selector=>nodes.get(selector)||null},document={querySelector:selector=>selector==='[data-home-route-example]'?route:null,getElementById:()=>({textContent:JSON.stringify(data)}),addEventListener(){}};
 const context={document,matchMedia:()=>({matches:true,addEventListener(){}}),fetch(){throw Error('The example must not make requests');},localStorage:{getItem(){throw Error('No private data reads');},setItem(){throw Error('No private data changes');}}};context.window=context;
 vm.runInNewContext(await readFile(new URL('../dist/site.js',import.meta.url),'utf8'),context);
 assert.equal(select.disabled,false);assert.equal(nodes.get('[data-home-outside]').textContent,'83');
 select.value='university';listeners.change();assert.equal(nodes.get('[data-home-outside]').textContent,'80');assert.equal(nodes.get('[data-home-university]').textContent,'40');assert.match(nodes.get('[data-home-course-provider]').textContent,/Liberty/);
 assert.equal(outsideBar.style.flexGrow,'80');assert.equal(universityBar.style.flexGrow,'40');assert.equal(nodes.get('[data-home-choice-source]').textContent,'Liberty University');assert.equal(nodes.get('[data-home-choice-title]').textContent,data.choices.university.title);assert.match(track.attributes['aria-label'],/80 credits[\s\S]+40 credits[\s\S]+120 degree credits/);
 select.value='sophia';listeners.change();assert.equal(nodes.get('[data-home-outside]').textContent,'83');assert.equal(nodes.get('[data-home-university]').textContent,'37');
 assert.equal(outsideBar.style.flexGrow,'83');assert.equal(universityBar.style.flexGrow,'37');assert.equal(nodes.get('[data-home-choice-source]').textContent,'Sophia');assert.match(track.attributes['aria-label'],/83 credits[\s\S]+37 credits/);
 assert.equal(data.personalCreditsAwarded,0);
});

test('the expandable cost comparison retains the complete real six-college calculator',()=>{
 const costs=require('../dist/data/cost-comparisons.json'),calculator=renderCostWidget(costs),html=render(example,calculator);
 assert.equal(new Set(costs.entries.map(item=>item.schoolName)).size,6);assert(html.includes(calculator));
 assert.match(html,/<details class="home-tool-drawer home-cost-drawer"><summary>[\s\S]+Compare costs at six colleges/);
 for(const item of costs.entries)assert(html.includes('<option value="'+item.id+'"'));
 assert.match(html,/data-cost-school/);assert.match(html,/data-cost-transfer/);assert.match(html,/id="degree-cost-data"/);
});
