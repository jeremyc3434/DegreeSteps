/* Exercise the actual finder UI with local catalog assets and no network or writes. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./dist/program-catalog.js'),P=require('./dist/program-opportunities.js'),{publishedFinderRows}=require('./dist/programs.js');
const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json'),library=require('./dist/data/plan-library-index.json');
const catalog=C.attachPublicationIndex(C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),publication,registry),approved=publication.plans.filter(plan=>plan.publicationReady===true),expectedSchools=[...new Set(approved.map(plan=>registry.models.find(model=>model.id===plan.modelId).school))].sort();
const expectedModels=[...new Set(approved.map(plan=>plan.modelId))],allCount=expectedModels.length+' course plans · '+expectedSchools.length+' schools';
const source=fs.readFileSync('dist/programs.js','utf8'),html=fs.readFileSync('dist/programs.html','utf8'),original=JSON.stringify({version:3,selectedPathwayId:'umpi-catalog-22746d64f0509cd3',profile:{goal:'teacher',degreeLevel:'master',modality:'online'},learning:[{id:'private-quarter-course',credits:4,creditSystem:'quarter',status:'saved'}],sheet:{notes:{private:'Keep my note'}}});
function fixture(search=''){
 const nodes=new Map(),clicks=[],events=new Map(),writes=[],location={search};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,open:false,innerHTML:'',textContent:'',dataset:{},handlers:new Map(),setAttribute(){},querySelector(){return node(id+'-child');},addEventListener(type,fn){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(fn);},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 for(const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))node(match[1]).options=[...match[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(option=>({value:option[1],textContent:option[2]}));
 const payloads={'data/pathways.json':require('./dist/data/pathways.json'),'data/program-catalog.json':require('./dist/data/program-catalog.json'),'data/opportunity-catalog.json':require('./dist/data/opportunity-catalog.json'),'data/credit-sources.json':require('./dist/data/credit-sources.json'),'data/plan-library-index.json':library,'data/plan-freshness.json':{plans:{}},'data/baseline-index.json':require('./dist/data/baseline-index.json')};
 const context={console,URLSearchParams,location,history:{replaceState(_state,_title,url){location.search=new URL(url,'https://degreesteps.test/').search;}},document:{getElementById:node,querySelectorAll:()=>[],addEventListener(type,fn){if(type==='click')clicks.push(fn);}},window:{DegreeProgramOpportunities:P,dispatchEvent(){},addEventListener(type,fn){events.set(type,fn);}},DegreeProgramCatalog:{...C,loadIndex:async()=>catalog},localStorage:{getItem:()=>original,setItem(...args){writes.push(args);}},fetch:async url=>({ok:true,json:async()=>payloads[url]}),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 vm.runInNewContext(source,context);
 const ready=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(node('program-error').textContent,'');};
 const shown=()=>[...node('program-results').innerHTML.matchAll(/data-program="([^"]+)"/g)].map(match=>match[1]);
 const press=(id,dataset={})=>{const button={id,dataset,hasAttribute:name=>name==='data-clear-all'&&Object.hasOwn(dataset,'clearAll'),closest:selector=>selector==='button'?button:null};for(const fn of clicks)fn({target:button,button:0});};
 const change=(id,value)=>{node(id).value=value;for(const fn of node('program-filters').handlers.get('change')||[])fn({target:node(id)});};
 const openPlan=id=>{let prevented=false;const link={closest:selector=>selector==='[data-program]'?{dataset:{program:id}}:null,getAttribute:()=> 'portal.html?usePlan='+id},target={closest:selector=>selector==='a.pf-open-plan'?link:null};for(const fn of clicks)fn({target,button:0,preventDefault(){prevented=true;}});return prevented;};
 return{ready,node,shown,press,change,openPlan,writes,location,pop(search){location.search=search;events.get('popstate')?.();}};
}

test('the finder selects one exact published model and leaves every incoming route alias intact',()=>{
 const before=catalog.pathways.length,rows=publishedFinderRows(catalog.pathways,catalog);assert.equal(rows.length,expectedModels.length);assert.deepEqual(rows.map(route=>route.modelId).sort(),[...expectedModels].sort());assert.equal(new Set(rows.map(route=>route.modelId)).size,rows.length);assert.deepEqual([...new Set(rows.map(route=>route.school))].sort(),expectedSchools);assert.equal(expectedSchools.length,4);
 const maol=rows.filter(route=>route.modelId==='curriculum-umpi-maol-yourpace');assert.equal(maol.length,1);assert.equal(maol[0].id,'umpi-maol');assert(catalog.pathways.some(route=>route.id==='umpi-catalog-22746d64f0509cd3'));assert.equal(catalog.pathways.length,before);
 assert(!rows.some(route=>route.modelId==='curriculum-liberty-business-aa-online'));assert(!rows.some(route=>route.school==='University of Phoenix'));assert.deepEqual(publishedFinderRows(rows,{publicationIndex:{plans:[]}}),[],'Without publication proof a complete-looking card cannot be offered');
 const marketingId='curriculum-tesu-bsba-marketing',marketing=Object.values(library.plans).find(plan=>plan.modelId===marketingId);assert(registry.models.some(model=>model.id===marketingId),'Marketing remains in the academic research inventory');assert.equal(marketing?.tier,'confirmation');assert.equal(marketing.published,false,'The unresolved formal MAR-3060 requirement keeps Marketing out of public starting plans');assert(!approved.some(plan=>plan.modelId===marketingId));assert(!rows.some(route=>route.modelId===marketingId));
});

test('the actual finder reports the complete published set and renders no held cards or duplicate models',async()=>{
 const f=fixture();await f.ready();assert.equal(f.node('program-count').textContent,allCount);assert.equal(f.node('program-more-filters').open,false);assert.equal(f.node('program-active-filters').hidden,true);
 const schoolOptions=[...f.node('program-school').innerHTML.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);assert.deepEqual(schoolOptions,expectedSchools);f.press('program-more');assert.equal(f.shown().length,expectedModels.length);
 const modelIds=f.shown().map(id=>catalog.pathways.find(route=>route.id===id)?.modelId);assert.equal(new Set(modelIds).size,expectedModels.length);assert.deepEqual(modelIds.sort(),[...expectedModels].sort());assert(!f.node('program-results').innerHTML.includes('Needs school confirmation'));assert.equal(f.node('program-legend').hidden,true);assert.equal(f.writes.length,0);
 assert.match(f.node('program-coverage-child').innerHTML,/request-plan\.html/);assert.match(f.node('program-coverage-child').innerHTML,/degree-audit\.html/,'A different degree remains possible through the scratch builder');
});

test('old confirmation URLs cannot reveal drafts, add a redundant chip or keep More filters open',async()=>{
 for(const confirm of ['0','1']){const f=fixture('?confirm='+confirm);await f.ready();assert.equal(f.node('program-count').textContent,allCount);assert.equal(f.node('program-more-filters').open,false);assert.equal(f.node('program-active-filters').hidden,true);assert.equal(f.node('program-more-summary').textContent,'More filters');f.change('program-school','Liberty University');assert.equal(f.node('program-count').textContent,'10 course plans · 1 school');f.press('',{clearAll:''});assert.equal(f.node('program-count').textContent,allCount);assert.equal(f.node('program-more-filters').open,false);assert.equal(f.location.search,'');assert.equal(f.writes.length,0);}
 assert.match(html,/<input[^>]+id="program-confirm"[^>]+hidden[^>]+disabled/);assert(!html.includes('Include plans that need school confirmation'));
});

test('current fit filters and catalog-alias search work without changing the saved degree or student records',async()=>{
 const f=fixture('?school=Western+Governors+University&level=master&cbe=1&billing=subscription');await f.ready();assert.equal(f.node('program-count').textContent,'3 course plans · 1 school');assert(f.shown().every(id=>catalog.pathways.find(route=>route.id===id)?.level==='master'));assert.equal(f.node('program-more-filters').open,true);
 f.pop('?q=umpi-catalog-22746d64f0509cd3');assert.deepEqual(f.shown(),['umpi-maol']);assert.equal(f.node('program-more-filters').open,false);assert.equal(f.writes.length,0);assert.equal(JSON.parse(original).selectedPathwayId,'umpi-catalog-22746d64f0509cd3');assert.match(f.node('program-results').innerHTML,/portal\.html\?usePlan=umpi-maol/);
});

test('a saved route alias opens the same actual degree without a false switch warning',async()=>{
 const f=fixture();await f.ready();assert.equal(f.openPlan('umpi-maol'),false,'The catalog alias and canonical card refer to the same actual model');assert.equal(f.node('program-switch-dialog').open,false);assert.equal(f.writes.length,0);assert.equal(f.openPlan('tesu-ba-english'),true,'Changing to a different actual model still asks before replacing the active plan');assert.equal(f.node('program-switch-dialog').open,true);assert.equal(f.writes.length,0);assert.equal(JSON.parse(original).selectedPathwayId,'umpi-catalog-22746d64f0509cd3');
});
