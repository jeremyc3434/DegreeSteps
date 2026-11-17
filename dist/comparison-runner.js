/* Latest-request worker coordination. No storage, AI, or backend requests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeComparisonRunner=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const failure=(message,code)=>Object.assign(new Error(message),{code});
 function create(config={}){
  const engine=config.engine||root.DegreePlanComparison,journey=config.journey||root.DegreeJourney,schedule=config.schedule||((fn,delay)=>setTimeout(fn,delay)),cancelSchedule=config.cancelSchedule||clearTimeout;
  const delayMs=Number.isFinite(config.delayMs)?Math.max(0,Math.min(1000,config.delayMs)):100,timeoutMs=Number.isFinite(config.timeoutMs)&&config.timeoutMs>0?Math.min(120000,config.timeoutMs):45000;
  const factory=config.workerFactory||(typeof root.Worker==='function'?()=>new root.Worker('degree-comparison-worker.js'):null);
  let available=Boolean(factory),active=null,sequence=0,disposed=false;
  function finish(job,error,value){
   if(active!==job)return;
   active=null;if(job.launch!==null)cancelSchedule(job.launch);clearTimeout(job.timer);job.worker?.terminate();
   if(error)job.reject(error);else job.resolve(value);
  }
  function cancel(){if(active)finish(active,failure('A newer comparison replaced this request.','superseded'));}
  function run(kind,payload){
   cancel();
   if(disposed)return Promise.reject(failure('This comparison screen is closed.','disposed'));
   if(!['build','matrix','draft'].includes(kind))return Promise.reject(failure('Choose a supported comparison action.','invalid-request'));
   return new Promise((resolve,reject)=>{
    const job={id:++sequence,resolve,reject,launch:null,timer:null,worker:null};active=job;
    job.launch=schedule(()=>{
     if(active!==job)return;job.launch=null;
     if(available){
      try{job.worker=factory();if(!job.worker||typeof job.worker.postMessage!=='function')throw Error('Worker unavailable');}
      catch{available=false;job.worker?.terminate();job.worker=null;}
     }
     job.timer=setTimeout(()=>finish(job,failure('This comparison took too long. Your saved plan is unchanged. Reload this page to try again.','timeout')),timeoutMs);
     if(job.worker){
      job.worker.onmessage=event=>{const result=event.data;if(active!==job||result?.id!==job.id)return;if(result.ok===true)finish(job,null,result.value);else if(result.ok===false)finish(job,failure(result.error||'The comparison could not finish. Your plan is unchanged.','calculation-failed'));};
      job.worker.onerror=event=>{event.preventDefault?.();finish(job,failure('The comparison could not load. Reload this page to try again. Your plan is unchanged.','worker-failed'));};
      try{job.worker.postMessage({id:job.id,kind,payload});}catch{finish(job,failure('The comparison inputs could not be sent. Your plan is unchanged.','invalid-input'));}
      return;
     }
     // Older browsers get a visible notice and a paint opportunity first. The
     // pure engine still has its own bounded search; no remote service is used.
     config.onFallback?.('Your browser is comparing courses on this device. This may take a few seconds; your saved plan is unchanged.');
     job.launch=schedule(()=>{
      if(active!==job)return;job.launch=null;const started=Date.now();
      try{
       if(!engine)throw Error('The comparison engine is unavailable. Reload this page to try again.');
       const value=kind==='build'?engine.build(payload.state,payload.catalog,payload.models,payload.costs,payload.options||{}):kind==='matrix'?engine.courseMatrix(payload.view,payload.catalog,payload.models):journey.buildDraft(payload.state,payload.catalog,payload.models);
       if(Date.now()-started>timeoutMs)finish(job,failure('This comparison took too long. Your plan is unchanged.','timeout'));else finish(job,null,value);
      }catch(error){finish(job,failure(error.message||'The comparison could not finish. Your plan is unchanged.','calculation-failed'));}
     },32);
    },delayMs);
   });
  }
  return Object.freeze({run,cancel,destroy(){disposed=true;cancel();},get workerAvailable(){return available;}});
 }
 return Object.freeze({create});
}));
