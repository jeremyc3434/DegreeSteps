/** Degree plan library: subject taxonomy, filter/sort/facet logic and the generated hub markup. No browser needed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {subjectAreas,subjectsFor} from './scripts/subject-areas.mjs';
import {planFacets,renderPlanCard} from './scripts/public-plan-pages.mjs';
const require=createRequire(import.meta.url);
const Library=require('./dist/plan-library.js');

const item=(title,school,o={})=>({title,school,format:'online',level:'bachelor',pace:'',subjects:subjectsFor(title),subjectLabels:[],share:60,cost:null,...o});
const items=[
  item('Business Management','Western Governors University',{share:63,cost:9169,pace:'self-paced'}),
  item('Marketing – B.S.','Western Governors University',{share:62,cost:8897,pace:'self-paced'}),
  item('Psychology (B.S.) — Online','Liberty University',{share:65,cost:21000}),
  item('Business Administration & Data Analysis','Liberty University',{share:69,format:'campus',cost:29314}),
  item('Criminal Justice (A.A.)','Liberty University',{share:50,level:'associate'}),
];

test('subject taxonomy classifies by whole words and allows several subjects',()=>{
  assert.deepEqual(subjectsFor('Business Administration & Data Analysis — Interdisciplinary Business'),['business','technology']);
  assert.deepEqual(subjectsFor('Healthcare Administration (B.S.) — Online'),['business','health']);
  assert.deepEqual(subjectsFor('Interdisciplinary Studies (A.A.)'),['humanities']);
  assert.deepEqual(subjectsFor('Lawn Care'),[],'"law" must not match inside another word');
  assert.equal(new Set(subjectAreas.map(s=>s.id)).size,subjectAreas.length,'subject ids are unique');
});

test('filters combine: OR within a facet, AND across facets, with a minimum outside share',()=>{
  const titles=state=>Library.query(items,state).results.map(i=>i.title);
  assert.deepEqual(titles({subject:'business'}).sort(),['Business Administration & Data Analysis','Business Management','Marketing – B.S.']);
  assert.deepEqual(titles({subject:'business',format:'campus'}),['Business Administration & Data Analysis']);
  assert.deepEqual(titles({subject:'business,psychology',share:60}),['Business Administration & Data Analysis','Psychology (B.S.) — Online','Business Management','Marketing – B.S.']);
  assert.deepEqual(titles({subject:'business,psychology',share:65}).length,4,'only the offered 50/60/70% thresholds apply');
  assert.deepEqual(titles({level:'associate'}),['Criminal Justice (A.A.)']);
  assert.deepEqual(titles({pace:'self-paced',school:'Western Governors University'}).length,2);
  assert.deepEqual(titles({q:'psych liberty'}),['Psychology (B.S.) — Online'],'every search word must match');
  assert.deepEqual(titles({q:'on campus'}),['Business Administration & Data Analysis']);
  assert.deepEqual(titles({subject:'business',format:'campus',share:70}),[]);
});

test('sorting: most outside credit by default, unknown costs last, stable A–Z ties',()=>{
  assert.deepEqual(Library.query(items,{}).results.map(i=>i.share),[69,65,63,62,50]);
  assert.deepEqual(Library.query(items,{sort:'cost'}).results.map(i=>i.cost),[8897,9169,21000,29314,null]);
  assert.equal(Library.query(items,{sort:'az'}).results[0].title,'Business Administration & Data Analysis');
  assert.deepEqual(Library.query(items,{sort:'school'}).results.map(i=>i.school.split(' ')[0]),['Liberty','Liberty','Liberty','Western','Western']);
});

test('facet counts ignore their own facet but respect the others; bad URL state is normalized',()=>{
  const {counts}=Library.query(items,{subject:'business',format:'online'});
  assert.equal(counts.subject.business,2,'subject counts respect format=online');
  assert.equal(counts.subject.psychology,1);
  assert.equal(counts.format.campus,1,'format counts ignore the active format filter');
  const state=Library.normalize({sort:'drop table',share:'99',subject:' business, ,business ',q:'x'.repeat(200)});
  assert.deepEqual([state.sort,state.share,state.subject,state.q.length],['outside',0,['business'],80]);
});

test('learning model, university pace and tuition billing filter independently and combine',()=>{
 const options=[
  item('CBE subscription','Example',{pace:'self-paced',cbe:'1',billing:'subscription'}),
  item('CBE per credit','Example',{pace:'self-paced',cbe:'1',billing:'per-credit'}),
  item('Self-paced course model','Example',{pace:'self-paced',billing:'per-credit'}),
  item('Scheduled subscription','Example',{pace:'scheduled',billing:'subscription'}),
  item('Unknown study facts','Example'),
 ];
 const titles=state=>Library.query(options,state).results.map(option=>option.title).sort();
 assert.deepEqual(titles({cbe:'1'}),['CBE per credit','CBE subscription']);
 assert.deepEqual(titles({pace:'self-paced',billing:'per-credit'}),['CBE per credit','Self-paced course model']);
 assert.deepEqual(titles({cbe:'1',billing:'subscription',pace:'self-paced'}),['CBE subscription']);
 assert.deepEqual(titles({pace:'scheduled',cbe:'1'}),[],'A scheduled subscription does not establish CBE');
 assert.deepEqual(titles({billing:'subscription'}),['CBE subscription','Scheduled subscription']);
 assert.deepEqual(titles({q:'competency based'}),['CBE per credit','CBE subscription']);
 const result=Library.query(options,{cbe:'1'});
 assert.equal(result.counts.billing['per-credit'],1);assert.equal(result.counts.billing.subscription,1);
 assert.equal(result.counts.pace['self-paced'],2);
});

test('new fit filter URL values are strict and unknown metadata never becomes a positive match',()=>{
 const state=Library.normalize({cbe:'1,0,yes',billing:'subscription,__proto__,unknown',pace:'self-paced,scheduled,guess'});
 assert.deepEqual(state.cbe,['1']);assert.deepEqual(state.billing,['subscription']);assert.deepEqual(state.pace,['self-paced','scheduled']);
 const unknown=item('Unknown','Example',{pace:'',cbe:'',billing:''});
 for(const filters of [{cbe:'1'},{billing:'subscription'},{pace:'self-paced'},{pace:'scheduled'}])assert.deepEqual(Library.query([unknown],filters).results,[]);
});

test('a budget cap uses the full known-charge range, excluding partial and unknown prices',()=>{
 const options=[
  item('Within budget','Example',{cost:9000,costMax:15000,costStatus:'planning-range'}),
  item('Higher range','Example',{cost:9000,costMax:20000,costStatus:'planning-range'}),
  item('Partial price','Example',{cost:1000,costMax:5000,costStatus:'partial-range'}),
  item('Unknown price','Example'),
  item('Unclassified range','Example',{cost:100,costMax:1000}),
 ];
 assert.deepEqual(Library.query(options,{budget:15000}).results.map(option=>option.title),['Within budget']);
 assert.deepEqual(Library.query(options,{budget:'25000'}).results.map(option=>option.title).sort(),['Higher range','Within budget']);
 assert.equal(Library.normalize({budget:'14999'}).budget,0);assert.equal(Library.normalize({budget:'25000'}).budget,25000);
 assert.deepEqual(Library.query(options,{sort:'cost'}).results.map(option=>option.cost),[100,1000,9000,9000,null],'Budget caps do not change the existing minimum-estimate sort');
});

test('server-rendered public cards expose the same independent fit facts and keep unknown facts neutral',()=>{
 const plan={id:'sample',shortTitle:'Example degree',degree:'Business Management',school:'Example College',format:'Online',path:'/degree-plans/example/',unit:'semester credits',outside:60,university:60,total:120,model:{level:'bachelor'},fit:{competencyBased:true,selfPaced:true,billing:'per-credit',billingLabel:'Per credit'}};
 const before=JSON.stringify(plan),facets=planFacets(plan),html=renderPlanCard(plan);
 assert.deepEqual([facets.pace,facets.cbe,facets.billing],['self-paced','1','per-credit']);
 assert.match(html,/data-plan-cbe="1"/);assert.match(html,/data-plan-billing="per-credit"/);
 assert.match(html,/Competency-based \(CBE\)/);assert.match(html,/Self-paced/);assert.match(html,/Per credit/);
 assert.equal(JSON.stringify(plan),before,'Rendering does not alter the original degree plan');
 const unknown=renderPlanCard({...plan,fit:{competencyBased:null,selfPaced:null,billing:null}});
 assert.match(unknown,/data-plan-cbe=""/);assert.match(unknown,/data-plan-billing=""/);
 assert.doesNotMatch(unknown,/public-plan-fit-badges/);
 const priced=renderPlanCard({...plan,estimate:{status:'planning-range',costs:{knownRange:{min:12000,max:18000}}}});
 assert.match(priced,/data-plan-cost="12000"/);assert.match(priced,/data-plan-cost-max="18000"/);assert.match(priced,/data-plan-cost-status="planning-range"/);
 const escaped=renderPlanCard({...plan,fit:{competencyBased:true,selfPaced:null,billing:'per-credit',billingLabel:'<img src=x onerror=alert(1)>'}});
 assert.doesNotMatch(escaped,/<img src=x/);assert.match(escaped,/&lt;img src=x/);
 const live=renderPlanCard({...plan,fit:{requirements:[{type:'live-seminars',label:'Live capstone seminars',url:'https://example.edu/capstone'}]}});
 assert.match(live,/Live capstone seminars/);
 const unsourced=renderPlanCard({...plan,fit:{requirements:[{type:'live-seminars',label:'Live seminars required',url:'javascript:alert(1)'}]}});
 assert.doesNotMatch(unsourced,/Live seminars required/);
});

test('the generated hub ships every plan without JS and the library controls hidden until enhanced',()=>{
  const html=readFileSync(new URL('./dist/degree-plans/index.html',import.meta.url),'utf8');
  const cards=html.match(/<article class="public-plan-card"[^>]*>/g)||[];
  assert.ok(cards.length>=11);
  for(const card of cards){
    for(const attr of ['data-plan-format','data-plan-subjects','data-plan-level','data-plan-school','data-plan-share','data-plan-title'])assert.ok(card.includes(attr+'="'),attr+' on every card');
    assert.notEqual(/data-plan-subjects="([^"]*)"/.exec(card)[1],'','every published plan belongs to at least one subject');
  }
  assert.match(html,/<div class="plan-library-bar" data-plan-toolbar hidden>/);
  assert.match(html,/<form id="plan-filters" class="plan-library-filters" data-plan-filters hidden/);
  assert.match(html,/data-no-step-trail/,'the library uses its own sticky toolbar instead of the step trail');
  assert.match(html,/<script src="\/plan-library\.js" defer><\/script>/);
});

test('plan index preview pages point at existing public plan pages for published routes only',async()=>{
  const {readFile,stat}=await import('node:fs/promises'),{resolve}=await import('node:path');
  const index=JSON.parse(await readFile(resolve(import.meta.dirname,'dist/data/plan-library-index.json'),'utf8'));
  const pages=Object.entries(index.plans).filter(([,entry])=>entry.page);
  if(!pages.length)throw Error('expected at least one public preview page');
  for(const [id,entry] of pages){
    if(!/^\/degree-plans\/[a-z0-9-]+\/$/.test(entry.page))throw Error(id+' has an unsafe page path');
    if(entry.published!==true)throw Error(id+' links a public page without being published');
    await stat(resolve(import.meta.dirname,'dist'+entry.page+'index.html'));
  }
});
