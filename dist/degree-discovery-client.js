/* Read-only course-fit discovery. Private records go only to a same-origin browser worker. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeDiscoveryClient=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const KEY='degreepath-guide-v3',scripts=new Map();
 const failure=(message,code)=>Object.assign(new Error(message),{code});
 const dependencies=[['DegreePlanner','planner.js'],['DegreeGuide','guide-engine.js'],['DegreeSheet','sheet-state.js'],['DegreeJourney','journey-engine.js'],['DegreeCostComparison','cost-engine.js'],['DegreeCoursePlanView','course-plan-view.js'],['DegreeSavings','savings-engine.js'],['DegreePlanEstimate','plan-estimate-engine.js'],['DegreePlanComparison','plan-comparison-engine.js'],['DegreeDiscoveryFit','degree-discovery-fit.js'],['DegreeComparisonRunner','comparison-runner.js']];
 function script(globalName,path){
  if(root[globalName])return Promise.resolve();
  if(!scripts.has(path))scripts.set(path,new Promise((resolve,reject)=>{
   const element=root.document.createElement('script');element.src=path;element.async=false;
   element.onload=()=>root[globalName]?resolve():reject(failure('Course matching could not load. Try again.','load-failed'));
   element.onerror=()=>{element.remove();scripts.delete(path);reject(failure('Course matching could not load. Try again.','load-failed'));};
   root.document.head.appendChild(element);
  }).catch(error=>{scripts.delete(path);throw error;}));
  return scripts.get(path);
 }
 async function loadDependencies(){for(const [name,path]of dependencies)await script(name,path);}
 function create(config={}){
  const catalog=config.catalog,Catalog=config.catalogAPI||root.DegreeProgramCatalog,fetcher=config.fetcher||((...args)=>root.fetch(...args));
  let sequence=0,closed=false,jobs=null,dataPromise=null;
  function raw(){try{return(config.storage||root.localStorage).getItem(KEY);}catch{throw failure('Your courses could not be opened. Open My courses to try again.','storage-unavailable');}}
  function read(){
   const version=raw();if(!version)return{version,state:null};
   let state;try{state=JSON.parse(version);}catch{throw failure('Your course collection could not be read. Your saved records have not changed.','invalid-storage');}
   if(state?.version!==3||!state.profile||typeof state.profile!=='object'||Array.isArray(state.profile)||!Array.isArray(state.learning))throw failure('Your course collection needs recovery. Your saved records have not changed.','invalid-storage');
   return{version,state};
  }
  function hasCourses(){return(read().state?.learning||[]).some(record=>record&&['earned','in-progress','planned','saved'].includes(record.status));}
  function cancel(){++sequence;jobs?.cancel();}
  function current(ticket,version){if(closed||ticket!==sequence)throw failure('A newer search replaced this request.','superseded');if(raw()!==version)throw failure('Your courses changed. Matching the latest collection will refresh these results.','courses-changed');}
  async function data(){
   if(!dataPromise)dataPromise=Promise.all(['data/cost-comparisons.json','data/plan-estimate-rates.json'].map(async path=>{const response=await fetcher(path);if(!response.ok)throw failure('Course matching data could not load. Try again.','load-failed');return response.json();})).catch(error=>{dataPromise=null;throw error;});
   return dataPromise;
  }
  async function run(routeIds,options={}){
   cancel();const ticket=sequence;
   if(closed)throw failure('This degree search is closed.','disposed');
   const snapshot=read(),published=Catalog.publishedPlans(catalog),allowed=new Set(published.map(route=>route.id));
   const ids=[...new Set(Array.isArray(routeIds)?routeIds:[])].filter(id=>typeof id==='string'&&allowed.has(id));
   if(ids.length>64)throw failure('Narrow your degree search before matching your courses.','too-many-routes');
   if(!snapshot.state||!snapshot.state.learning.some(record=>record&&['earned','in-progress','planned','saved'].includes(record.status))||!ids.length)return{routeIds:ids,results:[],checkedCount:0,totalCount:ids.length,complete:true};
   await(config.loadDependencies||loadDependencies)();current(ticket,snapshot.version);
   const routes=published.filter(route=>ids.includes(route.id));
   const [models,[costs,estimateRates]]=await Promise.all([Catalog.modelsForRoutes(routes,{includeLegacy:false,required:true}),data()]);
   current(ticket,snapshot.version);
   if(!jobs)jobs=(config.runnerFactory||(()=>root.DegreeComparisonRunner.create({timeoutMs:90000})))();
   const value=await jobs.run('discovery',{state:snapshot.state,catalog,models,costs,estimateRates,options:{routeIds:ids,publication:catalog.publicationIndex,priority:'collection',...(options.discoveryProfile?{discoveryProfile:options.discoveryProfile}:{})}},{onProgress:progress=>{try{current(ticket,snapshot.version);options.onProgress?.(progress);}catch{/* The final result reports changed records; obsolete progress stays hidden. */}}});
   current(ticket,snapshot.version);return value;
  }
  return Object.freeze({hasCourses,run,cancel,destroy(){closed=true;cancel();jobs?.destroy();}});
 }
 return Object.freeze({create});
}));
