/* Every "Build this plan" action must open a plan the portal accepts. The audit found the main builder (start.html)
   sending 116 of its 162 cards to "This course plan is not available". These tests run the real builder boot and card
   code on the shipped data, the portal's own acceptance check, and every static plan link, with one shared rule:
   DegreeProgramCatalog.canOpenPublicPlan / openablePlanIds. No browser or network is used. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Catalog=require('./dist/program-catalog.js');
const data=name=>require('./dist/data/'+name);
const registry=data('curriculum-registry.json'),publication=data('publication-index.json'),library=data('plan-library-index.json');
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(data('pathways.json'),data('program-catalog.json')),registry),publication,registry);
const openable=Catalog.openablePlanIds(catalog);
const files={'data/pathways.json':data('pathways.json'),'data/program-catalog.json':data('program-catalog.json'),'data/plan-library-index.json':library};

function environment(search=''){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:false,value:'',checked:false,href:'',style:{},dataset:{},addEventListener(){},setAttribute(){},removeAttribute(){},closest(){return null;},insertAdjacentHTML(){},querySelector(){return {outerHTML:'<legend>Filter</legend>'};},querySelectorAll(){return [];},focus(){}});return elements.get(id);};
 const location={search,pathname:'/start.html',assigned:'',assign(value){this.assigned=value;}};
 const document={getElementById:element,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},body:{},activeElement:null,title:''};
 // The page's catalog loader reads the same shipped registry and reviewed-plan list a browser would fetch.
 const PageCatalog={...Catalog,loadIndex:base=>Catalog.loadIndex(base,{index:registry,publicationIndex:publication,required:true})};
 const window={document,location,DegreeProgramOpportunities:require('./dist/program-opportunities.js'),addEventListener(){},scrollTo(){}};
 const fetch=async url=>{const value=files[String(url).replace(/^\//,'')];return value?{ok:true,json:async()=>JSON.parse(JSON.stringify(value))}:{ok:false,json:async()=>null};};
 const context={window,document,location,URLSearchParams,URL,console,Intl,Map,Set,WeakMap,CSS:{escape:value=>value},history:{replaceState(){}},localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem(){return null;},setItem(){}},DegreeProgramCatalog:PageCatalog,fetch,setTimeout,clearTimeout};
 window.DegreeProgramCatalog=PageCatalog;
 return {context,elements,location};
}
async function builder(search='',{notice=''}={}){
 const env=environment(search),source=fs.readFileSync('dist/start.js','utf8');
 const marker='(async()=>{try{';assert.equal(source.split(marker).length,2,'the builder boot is found once');
 vm.runInNewContext(source.replace(marker,'globalThis.builder={rows:()=>rows,openIds:()=>openIds,card,filters,creditsUrl,planUrl};\n'+marker),env.context);
 for(let i=0;i<200&&!env.elements.get('start-count')?.textContent&&!env.elements.get('start-error')?.textContent;i++)await new Promise(done=>setTimeout(done,10));
 const shown=env.elements.get('start-error')?.hidden===false?env.elements.get('start-error').textContent:'';if(notice)assert.match(shown,notice);else assert.equal(shown,'','the builder loads without an error');
 return {...env,api:env.context.builder};
}
function portalRules(){
 const env=environment(),source=fs.readFileSync('dist/portal.js','utf8'),context={...env.context,window:{...env.context.window,DegreeJourney:require('./dist/journey-engine.js'),DegreeSheet:require('./dist/sheet-state.js')}};
 assert.equal(source.split('\n  boot();').length,2,'the portal boot is found once');
 vm.runInNewContext(source.replace('\n  boot();','\n  globalThis.portalRules={setup(value){catalog=value;state={};models=[];},accepts(id){const route=catalog.pathways.find(item=>item.id===id);return Boolean(route&&(reviewedRoute(route)||privateExistingRoute(route))&&routeHasMap(route));},usePublicPlan};'),context);
 const rules=context.portalRules;rules.setup(catalog);return rules;
}

test('the shared rule is the publication list: reviewed plans plus plans that only need course rows confirmed',()=>{
 assert.equal(openable.size,Catalog.publishedPlans(catalog).length+Catalog.confirmationPlans(catalog).length);
 // A confirmation plan opens only when its blockers are course-level; school-level blockers keep it closed.
 for(const [id,plan] of Object.entries(library.plans))if(plan.tier==='confirmation')assert.equal(openable.has(id),plan.buildable===true,id);
 assert.ok(Object.values(library.plans).some(plan=>plan.tier==='confirmation'&&plan.buildable===true),'some plans that need confirmation are buildable');
 assert.ok(Object.values(library.plans).some(plan=>plan.tier==='confirmation'&&plan.buildable===false&&plan.blockers.length),'plans blocked by a school rule name it');
 assert.equal(new Set(Catalog.planLibraryRoutes(catalog).map(route=>route.modelId)).size,Catalog.planLibraryRoutes(catalog).length);
 for(const route of catalog.pathways)assert.equal(Catalog.canOpenPublicPlan(route,catalog),openable.has(route.id));
 assert.equal(Catalog.canOpenPublicPlan(null,catalog),false);assert.equal(Catalog.canOpenPublicPlan({id:'not-a-plan'},catalog),false);
});

test('every builder card that offers "Build this plan" opens in the portal; every other card offers "Request this plan"',async()=>{
 const env=await builder(),rows=env.api.rows(),portal=portalRules();
 const confirmationIds=Object.keys(library.plans).filter(id=>library.plans[id].tier==='confirmation'),confirmation=confirmationIds.length,blocked=confirmationIds.filter(id=>!openable.has(id)).length;
 assert.equal(rows.length,Catalog.planLibraryRoutes(catalog).length+confirmation,'one card per reviewed curriculum plus each plan that needs school confirmation');
 assert.equal(new Set(rows.map(p=>p.id)).size,rows.length);
 let built=0,requested=0;
 for(const p of rows){
  const html=env.api.card(p),buildable=openable.has(p.id);
  assert.equal(portal.accepts(p.id),buildable,p.id+': the builder and the portal agree');
  if(buildable){
   built++;assert.match(html,/data-build-plan=/,p.id);assert.match(html,/>Build this plan</,p.id);assert.doesNotMatch(html,/Request this plan|Not ready to build/,p.id);
   // A buildable plan that needs school confirmation keeps its badge and says how many rows to check.
   if(library.plans[p.id]?.tier==='confirmation'){assert.match(html,/Needs school confirmation/,p.id);assert.match(html,/to check with the school/,p.id);}
   const next=new URL(env.api.planUrl(p,'later'),'https://degreesteps.test/');assert.equal(next.pathname,'/portal.html');
   const id=next.searchParams.get('usePlan')||next.searchParams.get('program');assert.ok(portal.accepts(id),p.id+' hands the portal a plan it opens');
  }else{
   requested++;assert.doesNotMatch(html,/data-build-plan=|Build this plan|Review my plan/,p.id+' never offers a dead-end build');
   assert.match(html,/data-request-plan=/,p.id);assert.match(html,/>Request this plan</,p.id);assert.match(html,/Not ready to build yet/,p.id);
   const href=html.match(/data-request-plan="[^"]*"[^>]*href="([^"]+)"/)[1].replace(/&amp;/g,'&'),url=new URL(href,'https://degreesteps.test/');
   assert.equal(url.pathname,'/request-plan.html');if(url.searchParams.get('source'))assert.match(url.searchParams.get('source'),/^https:\/\//);
  }
 }
 assert.equal(built,rows.length-blocked);assert.equal(requested,blocked);
 const pending=rows.filter(p=>openable.has(p.id)&&library.plans[p.id]?.tier==='confirmation').length;
 assert.match(env.elements.get('start-count').textContent,new RegExp('^'+rows.length+' degrees · '+built+' ready to build \\('+pending+' need school confirmation\\) · '+requested+' not ready yet$'));
});

test('the portal still refuses a plan blocked by a school-level rule, whichever page links to it',async()=>{
 const portal=portalRules(),id=Object.keys(library.plans).find(key=>library.plans[key].tier==='confirmation'&&!openable.has(key));
 await assert.rejects(portal.usePublicPlan(id),/This course plan is not available/);
});

test('deep links: an alias or a buildable confirmation plan opens step 2; a plan blocked by a school rule is shown with its request action',async()=>{
 const aliases=publication.plans.filter(plan=>plan.routeIds.length>1).flatMap(plan=>plan.routeIds);
 assert.ok(aliases.length>=2,'the UMPI program has two incoming catalog links');
 for(const id of aliases){const env=await builder('?plan='+id);assert.equal(env.elements.get('start-step-credits').hidden,false,id+' opens step 2');}
 const buildable=Object.keys(library.plans).find(key=>library.plans[key].tier==='confirmation'&&openable.has(key));
 assert.equal((await builder('?plan='+buildable)).elements.get('start-step-credits').hidden,false,buildable+' needs confirmation but opens step 2');
 const pending=Object.keys(library.plans).find(key=>library.plans[key].tier==='confirmation'&&!openable.has(key)),env=await builder('?plan='+pending,{notice:/isn’t ready to build yet/});
 assert.notEqual(env.elements.get('start-step-credits').hidden,false);assert.match(env.elements.get('start-error').textContent,/school’s rules for it still has to be confirmed/);
 assert.match(env.elements.get('start-results').innerHTML,new RegExp('data-request-plan="'+pending+'"'));
});

test('no static page links a plan the portal would refuse',()=>{
 const pages=[];(function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.html'))pages.push(full);}})('dist');
 let links=0;const refused=[];
 for(const page of pages)for(const match of fs.readFileSync(page,'utf8').matchAll(/portal\.html\?([^"'\s>]+)/g)){
  const query=new URLSearchParams(match[1].replace(/&amp;/g,'&')),id=query.get('usePlan')||query.get('program');if(!id)continue;links++;
  if(!openable.has(id))refused.push(path.relative('dist',page)+' → '+id);
 }
 assert.ok(links>50,'plan links were found');assert.deepEqual(refused,[]);
});

test('a confirmation entry that does not bind to this catalog fails closed (left out, never openable)',()=>{
 const entry=publication.confirmationPlans[0],bad={...publication,confirmationPlans:[{...entry,routeIds:['not-a-route']},...publication.confirmationPlans.slice(1)]};
 const loose=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(data('pathways.json'),data('program-catalog.json')),registry),bad,registry);
 for(const id of entry.routeIds)assert.equal(Catalog.canOpenPublicPlan({id},loose),false,id);
 assert.equal(Catalog.openablePlanIds(loose).size,openable.size-entry.routeIds.length);
});
