'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('./dist/program-opportunities.js');
const source=fs.readFileSync('dist/programs.js','utf8'),html=fs.readFileSync('dist/programs.html','utf8');
const original={version:3,selectedPathwayId:'my-existing-plan',profile:{school:'My college'},learning:[{id:'original-quarter-course',credits:4,creditSystem:'quarter',status:'earned',privateNote:'Keep my original record'}],sheet:{notes:{private:'Keep my note'}}};
function fixture(search='',{graduate=false,fitOverride={}}={}){
 const nodes=new Map(),click=[],windowEvents=new Map(),historyURLs=[],writes=[],location={search};
 function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,innerHTML:'',textContent:'',hidden:false,dataset:{},events:new Map(),setAttribute(name,value){this[name]=value;},addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(fn);},querySelector(){return node(id+'-child');},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return nodes.get(id);}
 for(const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))node(match[1]).options=[...match[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(option=>({value:option[1],textContent:option[2]}));
 const presets=['all','campus','online','self-paced'].map(preset=>({dataset:{preset},setAttribute(name,value){this[name]=value;}}));
 const definition=[
  ['online-sub','online',true,true,'subscription'],
  ['online-per','online',true,true,'per-credit'],
  ['online-term','online',false,false,'per-credit'],
  ['unknown','online',null,null,null],
  ['campus-sub','campus',true,true,'subscription'],
  ['confirm-sub','online',true,true,'subscription'],
  ['directory-only','online',true,true,'subscription'],
  ['unpublished-reviewed','online',true,true,'subscription']
 ];
 if(graduate)definition.push(['graduate-denied','online',true,true,'per-credit'],['graduate-capped','online',true,true,'per-credit']);
 const routes=definition.map(([id,format])=>({id,school:'Example College',title:id,catalog:'2026-2027',level:id.startsWith('graduate-')?'master':'bachelor',modalities:[format],...(id==='directory-only'?{}:{modelId:'model-'+id}),...(id==='graduate-capped'?{transferPolicy:{maximumCredits:12,creditUnit:'semester',sourceUrl:'https://example.edu/mba/transfer'}}:{}),url:'https://example.edu/'+id}));
 const plans=Object.fromEntries(definition.map(([id,format,competencyBased,selfPaced,billing])=>[id,{modelId:'model-'+id,tier:id==='confirm-sub'?'confirmation':'reviewed',subjects:['business'],questions:id==='confirm-sub'?['Confirm this exact transfer rule.']:[],start:{outside:60,university:60,total:120},fit:{modelId:'model-'+id,catalogYear:'2026-2027',modality:format,competencyBased,selfPaced,billing,paceLabel:selfPaced===null?'Pace needs confirmation':selfPaced?'Self-paced':'Term-based',billingLabel:billing==='subscription'?'Subscription tuition':billing==='per-credit'?'Per credit':null,tuitionLabel:billing==='subscription'?'$2,000 per six-month term':billing==='per-credit'?'$300 per credit':null,...(id==='online-sub'?fitOverride:{})},...(id==='unknown'?{}:{estimate:id==='online-sub'?{min:10000,max:15000}:id==='campus-sub'?{min:5000,max:12000,partial:true,unpriced:['Unknown provider']}:{min:12000,max:25000}})}]));
 const curated=routes.filter(route=>!['directory-only','confirm-sub','unpublished-reviewed'].includes(route.id));
 const catalog={pathways:routes,publicationIndex:{available:true,plans:curated.map(route=>({modelId:route.modelId,publicationReady:true,routeIds:[route.id]}))}};
 const C={merge:()=>catalog,loadIndex:async()=>catalog,publishedPlans:()=>curated,isPlanAvailable:route=>Boolean(route.modelId),planChoiceCount:()=>0};
 const school={name:'Example College',transferPolicy:{ace:{status:'accepted'},institutional:{status:'accepted'},graduate:{status:'not-accepted'}}};
 const payloads={'data/pathways.json':{},'data/program-catalog.json':{},'data/opportunity-catalog.json':{schools:[school]},'data/credit-sources.json':{sources:[]},'data/plan-library-index.json':{plans,subjects:{business:'Business'}},'data/plan-freshness.json':{plans:{}},'data/baseline-index.json':{baselines:{}}};
 const saved=JSON.stringify(original),context={URLSearchParams,URL,console,location,history:{replaceState(_state,_title,url){historyURLs.push(url);location.search=new URL(url,'https://degreesteps.test/').search;}},document:{getElementById:node,querySelectorAll:selector=>selector==='[data-preset]'?presets:[],activeElement:null,addEventListener(type,fn){if(type==='click')click.push(fn);}},DegreeProgramCatalog:C,localStorage:{getItem:()=>saved,setItem(...args){writes.push(args);}},fetch:async url=>({ok:true,json:async()=>structuredClone(payloads[url]||{})}),window:{DegreeProgramOpportunities:P,dispatchEvent(){},addEventListener(type,fn){windowEvents.set(type,fn);}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 vm.runInNewContext(source,context);
 const ready=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));assert(!node('program-error').textContent,node('program-error').textContent);};
 const shown=()=>[...node('program-results').innerHTML.matchAll(/<article class="pf-program" data-program="([^"]+)"/g)].map(match=>match[1]).sort();
 function press(dataset,id=''){const button={dataset,id,hasAttribute:name=>name==='data-clear-all'&&Object.hasOwn(dataset,'clearAll'),closest:selector=>selector==='button'?button:null};for(const handler of click)handler({target:button,button:0});}
 function change(id,value){const n=node(id);if(typeof value==='boolean')n.checked=value;else n.value=value;for(const fn of node('program-filters').events.get('change')||[])fn({target:n});}
 return{ready,node,shown,press,change,historyURLs,writes,location,presets,saved,pop(search){location.search=search;windowEvents.get('popstate')?.();}};
}

test('format, self-paced, CBE and subscription filters combine without promoting unpublished degree listings',async()=>{
 const f=fixture('?format=online&pace=self-paced&cbe=1&billing=subscription&confirm=0');await f.ready();
 assert.deepEqual(f.shown(),['online-sub']);
 assert.match(f.node('program-results').innerHTML,/Competency-based \(CBE\)/);assert.match(f.node('program-results').innerHTML,/Subscription tuition/);
 assert.match(f.node('program-results').innerHTML,/<strong>60<\/strong> at/,'The actual remaining school coursework stays visible');
 f.change('program-confirm',true);assert.deepEqual(f.shown(),['online-sub'],'A legacy confirmation toggle cannot expose an unpublished plan');
 assert(!f.node('program-results').innerHTML.includes('data-program="directory-only"'));assert(!f.node('program-results').innerHTML.includes('data-program="unpublished-reviewed"'));
 f.change('program-billing','per-credit');assert.deepEqual(f.shown(),['online-per'],'Self-paced CBE does not require subscription tuition');
});

test('legacy self-paced links remain compatible and a format shortcut does not clear the independent pace choice',async()=>{
 const f=fixture('?type=self-paced&billing=subscription&confirm=0');await f.ready();assert.deepEqual(f.shown(),['campus-sub','online-sub']);
 f.press({preset:'online'});assert.deepEqual(f.shown(),['online-sub']);assert.equal(f.node('program-pace').value,'self-paced');
 const params=new URLSearchParams(f.location.search);assert.equal(params.get('format'),'online');assert.equal(params.get('pace'),'self-paced');assert.equal(params.get('billing'),'subscription');assert.equal(params.has('type'),false);
 f.press({preset:'all'});assert.deepEqual(f.shown(),['campus-sub','online-sub']);assert.equal(f.node('program-pace').value,'self-paced');
});

test('active filters can be removed independently, restored on reload/back, and cleared without changing a private plan',async()=>{
 const f=fixture('?subject=business&level=bachelor&format=online&pace=self-paced&cbe=1&billing=subscription&confirm=0');await f.ready();
 f.press({clearFilter:'billing'});assert.deepEqual(f.shown(),['online-per','online-sub']);
 assert.equal(f.node('program-cbe').checked,true);assert.equal(f.node('program-pace').value,'self-paced');assert.equal(new URLSearchParams(f.location.search).get('format'),'online');
 const restored=fixture(f.location.search);await restored.ready();assert.deepEqual(restored.shown(),f.shown());
 f.pop('?format=campus&billing=subscription&confirm=0');assert.deepEqual(f.shown(),['campus-sub']);
 f.press({clearAll:''});assert.equal(f.location.search,'');assert.equal(f.node('program-cbe').checked,false);assert.equal(f.node('program-confirm').checked,true);assert.equal(f.node('program-active-filters').hidden,true);
 assert.equal(f.writes.length,0);assert.equal(f.saved,JSON.stringify(original));
});

test('a maximum planning range excludes unknown, partial and over-budget estimates rather than treating them as free',async()=>{
 const f=fixture('?budget=15000');await f.ready();assert.deepEqual(f.shown(),['online-sub']);
 assert.equal(f.node('program-more-filters').open,true);assert.match(f.node('program-more-summary').textContent,/\(1\)/);
 assert.match(f.node('program-active-filters').innerHTML,/Planning range up to \$15,000/);
 f.press({clearFilter:'budget'});assert(f.shown().includes('unknown'));assert(f.shown().includes('campus-sub'));assert(!new URLSearchParams(f.location.search).has('budget'));
});

test('unknown fit traits do not satisfy strict filters and unsupported URL choices are ignored safely',async()=>{
 const f=fixture('?format=online&pace=scheduled&confirm=0');await f.ready();assert.deepEqual(f.shown(),['online-term']);
 const invalid=fixture('?pace=instant&cbe=true&billing=free&budget=-1&q=%3Cimg');await invalid.ready();
 assert.equal(invalid.node('program-pace').value,'');assert.equal(invalid.node('program-cbe').checked,false);assert.equal(invalid.node('program-billing').value,'');assert.equal(invalid.node('program-budget').value,'');
 assert.match(invalid.node('program-active-filters').innerHTML,/&lt;img/);assert.doesNotMatch(invalid.node('program-active-filters').innerHTML,/<img/);
});

test('credit-source filters honor graduate restrictions and exact program transfer caps',async()=>{
 const f=fixture('?credit=ace',{graduate:true});await f.ready();
 assert(f.shown().includes('online-sub'),'The school’s published undergraduate acceptance remains eligible');
 assert(!f.shown().includes('graduate-denied'));assert(!f.shown().includes('graduate-capped'),'Undergraduate ACE acceptance cannot establish graduate credit');
 f.change('program-credit','institutional');
 assert(f.shown().includes('graduate-capped'),'A separately published twelve-credit graduate transfer allowance remains eligible');
 assert(!f.shown().includes('graduate-denied'));
 assert.equal(f.writes.length,0);
});

test('indexed fit facts must match the current program model, catalog and delivery format',async()=>{
 const query='?format=online&pace=self-paced&cbe=1&billing=subscription&confirm=0';
 for(const fitOverride of [{modelId:'another-model'},{catalogYear:'2025-2026'},{modality:'campus'}]){
  const f=fixture(query,{fitOverride});await f.ready();
  assert.deepEqual(f.shown(),[],'Mismatched metadata cannot establish the selected pace, CBE or billing traits');
 }
 const normalized=fixture(query,{fitOverride:{catalogYear:'2026–2027'}});await normalized.ready();
 assert.deepEqual(normalized.shown(),['online-sub'],'Equivalent catalog punctuation preserves correctly scoped facts');
});
