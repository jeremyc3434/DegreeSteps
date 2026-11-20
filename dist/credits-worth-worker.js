/* "What are my credits worth?" calculations run in this browser worker. Course records never leave the device. */
'use strict';
importScripts('planner.js','guide-engine.js','sheet-state.js','journey-engine.js','program-catalog.js','cost-engine.js','plan-estimate-engine.js','credits-worth-engine.js');
const Catalog=self.DegreeProgramCatalog,Worth=self.DegreeCreditsWorth;
const models=new Map();let shared=null,current=0;
const json=async url=>{const response=await fetch(url);if(!response.ok)throw Error('Could not load '+url+'.');return response.json();};
async function base(){
 if(!shared)shared=(async()=>{
  const [pathways,index,baselines,registry]=await Promise.all(['data/pathways.json','data/plan-library-index.json','data/baseline-index.json','data/curriculum-registry.json'].map(json));
  let rates=null;try{rates=await json('data/plan-estimate-rates.json');}catch{rates=null;}
  const catalog=await Catalog.load(pathways);
  return {index,baselines,registry,rates,catalog};
 })().catch(error=>{shared=null;throw error;});
 return shared;
}
// Each group gets its own fetch cache so a large curriculum file can be released after its models are kept.
async function loadModels(ids,registry){
 const wanted=ids.filter(id=>!models.has(id));
 if(wanted.length){const fetcher=url=>fetch(url),loaded=await Catalog.loadModels(wanted,{fetcher,index:registry,includeLegacy:false});for(const model of loaded)models.set(model.id,model);}
 return ids.map(id=>models.get(id)).filter(Boolean);
}
self.addEventListener('message',async event=>{
 const request=event.data;
 if(!request||!Number.isSafeInteger(request.id)||request.kind!=='rank'||!Array.isArray(request.learning))return;
 current=request.id;const started=Date.now();
 try{
  const data=await base();
  const total=Object.values(data.index.plans||{}).filter(entry=>['reviewed','confirmation'].includes(entry?.tier)).length;
  self.postMessage({id:request.id,event:'start',total,subjects:data.index.subjects||{}});
  await Worth.evaluateAll({...data,learning:request.learning},{
   loadModels:ids=>loadModels(ids,data.registry),
   cancelled:()=>current!==request.id,
   onResult:(result,done,count)=>self.postMessage({id:request.id,event:'result',result,done,total:count})
  });
  if(current===request.id)self.postMessage({id:request.id,event:'done',ms:Date.now()-started});
 }catch(error){if(current===request.id)self.postMessage({id:request.id,event:'error',error:typeof error?.message==='string'?error.message:'The plans could not be checked.'});}
});
