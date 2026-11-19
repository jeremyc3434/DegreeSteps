/* First-party daily counters. No visitor IDs, cookies, private drafts or URLs are sent. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeGrowth=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const CHOICE='degreesteps-growth-choice-v1';
  const EVENTS=['landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed'];
  const CONTEXTS=['home','article','provider','school','degree-plan','workspace'];
  const PLANS=['wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential'];
  const sent=new Set(),watched=new WeakSet();let memoryChoice=null;
  const signals=()=>root.navigator?.globalPrivacyControl===true||root.navigator?.doNotTrack==='1'||root.doNotTrack==='1';
  function enabled(){
    if(signals())return false;if(memoryChoice!==null)return memoryChoice;
    try{return root.localStorage?.getItem(CHOICE)!=='off';}catch{return false;}
  }
  function context(){
    const explicit=root.document?.body?.dataset?.growthContext;if(CONTEXTS.includes(explicit))return explicit;
    const path=root.location?.pathname||'/';
    if(path==='/')return'home';if(/^\/(?:guides|blog)\//.test(path))return'article';if(/^\/credit-sources\//.test(path))return'provider';if(/^\/schools\//.test(path))return'school';if(/^\/degree-plans\//.test(path))return'degree-plan';
    return /\.html$/.test(path)?'workspace':'article';
  }
  function track(event,source=context(),planId){
    if(!enabled()||!EVENTS.includes(event)||!CONTEXTS.includes(source)||planId!==undefined&&!PLANS.includes(planId)||!root.fetch)return false;
    const key=event+'|'+source+'|'+(planId||'');if(sent.has(key)||sent.size>=64)return false;sent.add(key);
    const payload={event,context:source,...(planId?{planId}:{})};
    try{Promise.resolve(root.fetch('/api/growth/events',{method:'POST',headers:{'Content-Type':'application/json','X-Growth-Request':'1'},body:JSON.stringify(payload),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',keepalive:true})).catch(()=>{});}catch{/* Measurement never blocks a student action or retries a request. */}
    return true;
  }
  function controls(){
    root.document?.querySelectorAll?.('[data-growth-toggle]').forEach(input=>{input.checked=enabled();input.disabled=signals();});
    root.document?.querySelectorAll?.('[data-growth-status]').forEach(node=>{node.textContent=signals()?'Your browser privacy signal has turned off optional aggregate measurement.':enabled()?'Anonymous aggregate measurement is on for this browser.':'Optional aggregate measurement is off for this browser.';});
  }
  function setEnabled(value){
    if(typeof value!=='boolean')return enabled();memoryChoice=value;
    try{root.localStorage?.setItem(CHOICE,value?'on':'off');}catch{/* The current page still respects the choice when browser storage is unavailable. */}
    controls();return enabled();
  }
  function preview(){
    if(root.document?.visibilityState==='hidden')return;
    root.document?.querySelectorAll?.('[data-growth-plan]').forEach(node=>{
      const id=node.dataset?.growthPlan;if(!PLANS.includes(id)||node.hidden||watched.has(node))return;watched.add(node);
      if(typeof root.IntersectionObserver==='function'){
        const observer=new root.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){track('plan_previewed','degree-plan',id);observer.disconnect();}},{threshold:0.05});observer.observe(node);
      }else{
        const rect=node.getBoundingClientRect?.();if(!rect||rect.bottom>0&&rect.top<(root.innerHeight||800))track('plan_previewed','degree-plan',id);
      }
    });
  }
  function init(){
    controls();
    root.document?.querySelectorAll?.('[data-growth-toggle]').forEach(input=>input.addEventListener('change',()=>setEnabled(input.checked)));
    const excluded=/\/(?:admin|coverage|growth)\.html$/.test(root.location?.pathname||'');
    if(!excluded&&context()!=='workspace')track('landing_view');preview();
    root.document?.addEventListener?.('visibilitychange',preview);
  }
  root.addEventListener?.('DegreeSteps:growth',event=>{
    const detail=event?.detail;if(!detail||typeof detail!=='object'||Array.isArray(detail)||Object.keys(detail).some(key=>!['event','context','planId'].includes(key)))return;
    track(detail.event,detail.context===undefined?context():detail.context,detail.planId);
  });
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
  return Object.freeze({track,context,isEnabled:enabled,setEnabled,choiceKey:CHOICE});
}));
