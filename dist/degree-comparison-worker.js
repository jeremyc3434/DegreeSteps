/* Private comparison calculations stay in this browser worker. */
'use strict';
importScripts('planner.js','guide-engine.js','sheet-state.js','journey-engine.js','program-catalog.js','cost-engine.js','savings-engine.js','course-plan-view.js','plan-comparison-engine.js');
self.addEventListener('message',event=>{
 const request=event.data;
 if(!request||!Number.isSafeInteger(request.id)||request.id<1||!['build','matrix','draft'].includes(request.kind))return;
 try{
  const payload=request.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(payload.models))throw Error('The comparison inputs could not be read. Your saved plan is unchanged.');
  const engine=self.DegreePlanComparison;
  const value=request.kind==='build'?engine.build(payload.state,payload.catalog,payload.models,payload.costs,payload.options||{}):request.kind==='matrix'?engine.courseMatrix(payload.view,payload.catalog,payload.models):self.DegreeJourney.buildDraft(payload.state,payload.catalog,payload.models);
  self.postMessage({id:request.id,ok:true,value});
 }catch(error){self.postMessage({id:request.id,ok:false,error:typeof error?.message==='string'?error.message:'The comparison could not be completed. Your saved plan is unchanged.'});}
});
