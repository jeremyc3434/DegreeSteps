/** Degree plan library: subject taxonomy, filter/sort/facet logic and the generated hub markup. No browser needed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {subjectAreas,subjectsFor} from './scripts/subject-areas.mjs';
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
