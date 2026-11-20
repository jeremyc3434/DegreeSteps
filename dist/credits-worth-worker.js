/* "What are my credits worth?" calculations run in this browser worker. Course records never leave the device. */
'use strict';
// Only the small ranking engine loads up front: plans no finished course can touch are answered from the index
// before the planner scripts are fetched. The planner loads the first time a curriculum is needed.
importScripts('credits-worth-engine.js');
const Worth=self.DegreeCreditsWorth;
function planner(){if(!self.DegreeProgramCatalog)importScripts('planner.js','guide-engine.js','sheet-state.js','journey-engine.js','program-catalog.js','cost-engine.js','plan-estimate-engine.js');return self.DegreeProgramCatalog;}
const models=new Map();let courseIndex=null,registry=null,rates=null,full=null,current=0;
const json=async url=>{const response=await fetch(url);if(!response.ok)throw Error('Could not load '+url+'.');return response.json();};
// The compact identity index lets plans no finished course could touch skip their curriculum download.
async function loadCourseIndex(){if(!courseIndex)courseIndex=json('data/plan-course-index.json').then(value=>{if(!Worth.validCourseIndex(value))throw Error('The plan course index is unavailable.');return value;}).catch(error=>{courseIndex=null;throw error;});return courseIndex;}
async function loadRegistry(){if(!registry)registry=json('data/curriculum-registry.json').catch(error=>{registry=null;throw error;});return registry;}
async function loadRates(){if(!rates)rates=json('data/plan-estimate-rates.json').catch(()=>null);return rates;}
// Fallback when the index cannot load: the original full computation.
async function loadFull(){
 if(!full)full=(async()=>{
  const [pathways,index,baselines,reg]=await Promise.all(['data/pathways.json','data/plan-library-index.json','data/baseline-index.json'].map(json).concat(loadRegistry()));
  return {index,baselines,registry:reg,rates:await loadRates(),catalog:await planner().load(pathways)};
 })().catch(error=>{full=null;throw error;});
 return full;
}
// Each group gets its own fetch cache so a large curriculum file can be released after its models are kept.
async function loadModels(ids){
 const wanted=ids.filter(id=>!models.has(id)),Catalog=planner();
 if(wanted.length){const reg=await loadRegistry(),fetcher=url=>fetch(url),loaded=await Catalog.loadModels(wanted,{fetcher,index:reg,includeLegacy:false});for(const model of loaded)models.set(model.id,model);}
 return ids.map(id=>models.get(id)).filter(Boolean);
}
self.addEventListener('message',async event=>{
 const request=event.data;
 if(!request||!Number.isSafeInteger(request.id)||request.kind!=='rank'||!Array.isArray(request.learning))return;
 current=request.id;const started=Date.now(),cancelled=()=>current!==request.id;
 const onResult=(result,done,count)=>self.postMessage({id:request.id,event:'result',result,done,total:count});
 try{
  let index=null;try{index=await loadCourseIndex();}catch{index=null;}
  if(index){
   self.postMessage({id:request.id,event:'start',total:Object.keys(index.plans).length,subjects:index.subjects||{}});
   await Worth.evaluateWithIndex(index,{learning:request.learning},{loadModels,loadRates,cancelled,onResult});
  }else{
   const data=await loadFull();
   const total=Object.values(data.index.plans||{}).filter(entry=>['reviewed','confirmation'].includes(entry?.tier)).length;
   self.postMessage({id:request.id,event:'start',total,subjects:data.index.subjects||{}});
   await Worth.evaluateAll({...data,learning:request.learning},{loadModels,cancelled,onResult});
  }
  if(!cancelled())self.postMessage({id:request.id,event:'done',ms:Date.now()-started});
 }catch(error){if(!cancelled())self.postMessage({id:request.id,event:'error',error:typeof error?.message==='string'?error.message:'The plans could not be checked.'});}
});
