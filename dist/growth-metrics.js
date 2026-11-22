/* First-party daily counters. No visitor IDs, cookies, private drafts or URLs are sent. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeGrowth=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const CHOICE='degreesteps-growth-choice-v1';
  const EVENTS=['landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied'];
  const CONTEXTS=['home','article','provider','school','degree-plan','workspace','transfer'];
  const PROVIDERS=['Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other'];
  const ACTIONS=['open','copy'];
  // Plan ids must be in the public plan library index. The index is read only when an event names a plan.
  const PLAN=/^[a-z0-9][a-z0-9-]{0,127}$/,PLAN_INDEX='/data/plan-library-index.json';
  let planIndex=null;
  function planIds(){
    if(!planIndex)planIndex=Promise.resolve().then(()=>root.fetch(PLAN_INDEX,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'})).then(response=>response&&response.ok?response.json():null).then(data=>data&&data.plans&&typeof data.plans==='object'?new Set(Object.keys(data.plans)):null).catch(()=>null);
    return planIndex;
  }
  function send(payload){
    try{Promise.resolve(root.fetch('/api/growth/events',{method:'POST',headers:{'Content-Type':'application/json','X-Growth-Request':'1'},body:JSON.stringify(payload),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',keepalive:true})).catch(()=>{});}catch{/* Measurement never blocks a student action or retries a request. */}
  }
  const sent=new Set(),watched=new WeakSet();let memoryChoice=null;
  const signals=()=>root.navigator?.globalPrivacyControl===true||root.navigator?.doNotTrack==='1'||root.doNotTrack==='1';
  function enabled(){
    if(signals())return false;if(memoryChoice!==null)return memoryChoice;
    try{return root.localStorage?.getItem(CHOICE)!=='off';}catch{return false;}
  }
  function context(){
    const explicit=root.document?.body?.dataset?.growthContext;if(CONTEXTS.includes(explicit))return explicit;
    const path=root.location?.pathname||'/';
    if(path==='/')return'home';if(/^\/transfer\//.test(path))return'transfer';if(/^\/(?:guides|blog)\//.test(path))return'article';if(/^\/credit-sources\//.test(path))return'provider';if(/^\/schools\//.test(path))return'school';if(/^\/degree-plans\//.test(path))return'degree-plan';
    return /\.html$/.test(path)?'workspace':'article';
  }
  // track(event, context, planId) or track(event, context, {planId, provider, action}).
  function track(event,source=context(),dimensions){
    const dims=typeof dimensions==='string'?{planId:dimensions}:dimensions&&typeof dimensions==='object'?dimensions:{};
    const {planId,provider,action}=dims;
    if(!enabled()||!EVENTS.includes(event)||!CONTEXTS.includes(source)||planId!==undefined&&!(typeof planId==='string'&&PLAN.test(planId))||!root.fetch)return false;
    if(event==='provider_click'?!PROVIDERS.includes(provider):provider!==undefined)return false;
    if(event==='school_email'?!ACTIONS.includes(action):action!==undefined)return false;
    const key=event+'|'+source+'|'+(planId||'')+'|'+(provider||action||'');if(sent.has(key)||sent.size>=64)return false;sent.add(key);
    const payload={event,context:source,...(planId?{planId}:{}),...(provider?{provider}:{}),...(action?{action}:{})};
    if(!planId){send(payload);return true;}
    // An id outside the public index is never sent; without the index the event is counted without a plan.
    planIds().then(ids=>{if(!ids){delete payload.planId;send(payload);}else if(ids.has(planId))send(payload);},()=>{});
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
      const id=node.dataset?.growthPlan;if(typeof id!=='string'||!PLAN.test(id)||node.hidden||watched.has(node))return;watched.add(node);
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
    if(!excluded&&context()!=='workspace')track('landing_view');if(context()==='transfer')track('transfer_page_view','transfer');preview();
    root.document?.addEventListener?.('visibilitychange',preview);
    // Outbound provider links carry data-outbound-provider (see outbound.js). Only the fixed provider name is sent.
    root.document?.addEventListener?.('click',event=>{
      const link=event?.target?.closest?.('a[data-outbound-provider]');if(!link)return;
      const provider=link.getAttribute('data-outbound-provider');track('provider_click',context(),{provider:PROVIDERS.includes(provider)?provider:'other'});
    },true);
  }
  root.addEventListener?.('DegreeSteps:growth',event=>{
    const detail=event?.detail;if(!detail||typeof detail!=='object'||Array.isArray(detail)||Object.keys(detail).some(key=>!['event','context','planId','provider','action'].includes(key)))return;
    const dims={};for(const key of ['planId','provider','action'])if(detail[key]!==undefined)dims[key]=detail[key];
    track(detail.event,detail.context===undefined?context():detail.context,dims);
  });
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
  return Object.freeze({track,context,isEnabled:enabled,setEnabled,choiceKey:CHOICE,events:EVENTS,providers:PROVIDERS});
}));
