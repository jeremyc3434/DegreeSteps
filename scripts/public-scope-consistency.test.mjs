/* The same example route shows one cost and one timeline everywhere, generic tuition illustrations say so, and every
 * page that describes the plan library uses one scope from the index the finder reads. Reads the built dist pages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Catalog from '../dist/program-catalog.js';
const read=path=>readFileSync(new URL('../dist/'+path,import.meta.url),'utf8');
const text=html=>html.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');
const index=JSON.parse(read('data/plan-library-index.json')),courseIndex=JSON.parse(read('data/plan-course-index.json'));
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);

test('home and the plan page show the Liberty example’s own planning estimate and semesters',()=>{
 const entry=index.plans['liberty-business-residential'],range=money(entry.estimate.min)+'–'+money(entry.estimate.max),terms=entry.timing.universityTerms.min+'–'+entry.timing.universityTerms.max;
 const home=text(read('index.html')),plan=text(read('degree-plans/liberty-business-residential/index.html'));
 assert(home.includes(range),'home shows '+range);assert(plan.includes(range),'plan page shows '+range);
 assert(home.includes(terms+' semesters at Liberty'));assert(plan.includes(terms+' semesters'));
 assert.doesNotMatch(read('index.html'),/data-home-tuition|University tuition alone/,'the example route has no second, tuition-only figure');
});
test('generic tuition calculators are labelled as illustrations, not plans',()=>{
 const compare=text(read('compare/index.html')),home=text(read('index.html'));
 assert.match(compare,/generic tuition illustrations, not DegreeSteps plans/);assert.match(compare,/A generic tuition illustration at each college’s published rate/);
 assert.match(home,/A tuition calculator with generic examples/);assert.doesNotMatch(home,/Compare costs at six colleges/);
});
test('the plan library scope is described once, from the finder’s index',()=>{
 const registry=JSON.parse(read('data/curriculum-registry.json'));
 const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(JSON.parse(read('data/pathways.json')),JSON.parse(read('data/program-catalog.json'))),registry),JSON.parse(read('data/publication-index.json')),registry);
 const selectable=Catalog.planLibraryRoutes(catalog,[],index),selectableIds=new Set(selectable.map(plan=>plan.id)),publishedIds=new Set(Catalog.publishedPlans(catalog).map(plan=>plan.id));
 // Public scope comes from actual chooser routes, not the larger research inventory. A researched but held route
 // (currently GCU) must not acquire a public count or link merely because the inventory labels it "reviewed".
 assert.deepEqual(Object.keys(courseIndex.plans).sort(),[...selectableIds].sort());
 for(const [id,plan]of Object.entries(index.plans))if(plan.tier==='reviewed'&&!plan.published)assert(!selectableIds.has(id),'An unpublished reviewed inventory entry stays out of the chooser: '+id);
 for(const [id,plan]of Object.entries(courseIndex.plans))if(plan.start.tier==='reviewed')assert(publishedIds.has(id),'Every reviewed route offered publicly passes the publication gate: '+id);
 const total=selectable.length,schools=new Set(selectable.map(plan=>plan.school)).size,reviewed=selectable.filter(plan=>publishedIds.has(plan.id)).length;
 const hub=text(read('degree-plans/index.html')),compare=text(read('compare/index.html'));
 assert(hub.includes(total+' researched plans at '+schools+' schools: '+reviewed+' reviewed and '+(total-reviewed)+' that still need school confirmation'));
 assert.match(hub,new RegExp('This library lists the \\d+ reviewed plans'));assert(hub.includes('See all '+total+' plans in the plan finder'));assert.doesNotMatch(hub,/complete plans/);
 assert(compare.includes(total+' researched plans at '+schools+' schools'));
 assert.match(read('programs.js'),/' researched plans at '\+schools\.length\+' schools: '/);
});
