/* One outbound layer for links to course providers, used in the browser and by the page generators.
   It only renders a link that has already been chosen. It never reads or changes which plans, schools
   or courses are shown, or their order: planning, ranking and the plan index never load this file.

   With every provider at status "none" (the shipped setting) a link keeps its href, target, rel and text
   exactly; the only addition is data-outbound-provider, which lets growth-metrics.js count an anonymous
   provider_click with the provider's fixed name. When a provider is "affiliate", its params are added to the
   URL, rel becomes "sponsored noopener", and a visible "Partner link" note links to the disclosure page. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeOutbound=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const PROVIDERS=Object.freeze(['Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute']);
  const STATUSES=['none','affiliate'],DISCLOSURE_PATH='/why-its-free/',SETTINGS_PATH='/data/partners.json';
  const KEYS={sophia:'Sophia',sophialearning:'Sophia',studycom:'Study.com',straighterline:'StraighterLine',saylor:'Saylor',sayloracademy:'Saylor',clep:'CLEP',dsst:'DSST',christianleadersinstitute:'Christian Leaders Institute'};
  const HOSTS=[[/(^|\.)sophia\.org$/,'Sophia'],[/(^|\.)study\.com$/,'Study.com'],[/(^|\.)straighterline\.com$/,'StraighterLine'],[/(^|\.)saylor\.org$/,'Saylor'],[/^clep\.collegeboard\.org$/,'CLEP'],[/(^|\.)getcollegecredit\.com$/,'DSST'],[/(^|\.)christianleaders\.org$/,'Christian Leaders Institute']];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PARAM_KEY=/^[A-Za-z0-9_.-]{1,40}$/;
  const none=()=>({providers:Object.fromEntries(PROVIDERS.map(name=>[name,{status:'none',params:{},disclosure:true}]))});
  let current=none();

  /** The fixed provider name for a provider label (or, failing that, the link's host); otherwise "other". */
  function providerName(provider,href){
    const key=String(provider||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(KEYS[key])return KEYS[key];
    try{const host=new URL(href).hostname.toLowerCase().replace(/^www\./,'');for(const [pattern,name]of HOSTS)if(pattern.test(host))return name;}catch{/* Not a URL: no host to match. */}
    return 'other';
  }
  /** Checks partner settings. Unknown providers, statuses or unsafe params are refused; an affiliate must be disclosed. */
  function normalize(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.providers||typeof raw.providers!=='object'||Array.isArray(raw.providers))throw Error('Partner settings need a providers object.');
    const result=none();
    for(const [name,value]of Object.entries(raw.providers)){
      if(!PROVIDERS.includes(name))throw Error('Unknown provider in partner settings: '+name);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['status','params','disclosure','note'].includes(key)))throw Error('Partner settings for '+name+' have unsupported fields.');
      if(!STATUSES.includes(value.status))throw Error('Partner status for '+name+' must be "none" or "affiliate".');
      const params=value.params===undefined?{}:value.params;
      if(!params||typeof params!=='object'||Array.isArray(params)||Object.entries(params).some(([key,param])=>!PARAM_KEY.test(key)||typeof param!=='string'||!param||param.length>200||/[\u0000-\u001f]/.test(param)))throw Error('Partner params for '+name+' must be short text values.');
      if(value.status==='affiliate'&&value.disclosure!==true)throw Error('An affiliate link for '+name+' must be disclosed.');
      if(value.status==='affiliate'&&!Object.keys(params).length)throw Error('An affiliate link for '+name+' needs its partner params.');
      result.providers[name]={status:value.status,params:{...params},disclosure:value.disclosure!==false};
    }
    return result;
  }
  function configure(raw){current=normalize(raw);return current;}
  function settings(){return current;}
  function partnerFor(name,options){const value=(options||current).providers?.[name];return value&&value.status==='affiliate'?value:null;}
  function partnerHref(href,partner){
    try{const url=new URL(href);if(url.protocol!=='https:')return href;for(const [key,value]of Object.entries(partner.params))url.searchParams.set(key,value);return url.href;}catch{return href;}
  }
  /**
   * Renders one outbound provider link. `html` is the link's inner HTML, already escaped by the caller,
   * so existing markup is reproduced exactly. `provider` "University" (a school's own course) is not a provider link.
   */
  function link({href,html,provider,className='',target='_blank',rel='noopener',settings:options}={}){
    const school=!provider||provider==='University',name=school?'':providerName(provider,href),partner=school?null:partnerFor(name,options);
    const finalHref=partner?partnerHref(href,partner):href,finalRel=partner?'sponsored noopener':rel;
    const anchor='<a'+(className?' class="'+esc(className)+'"':'')+' href="'+esc(finalHref)+'"'+(target?' target="'+esc(target)+'"':'')+(finalRel?' rel="'+esc(finalRel)+'"':'')+(name?' data-outbound-provider="'+esc(name)+'"':'')+'>'+html+'</a>';
    return partner?anchor+' <small class="outbound-partner-note">Partner link · <a href="'+DISCLOSURE_PATH+'">Why DegreeSteps is free</a></small>':anchor;
  }
  /** In the browser, read the published settings once. Until then (or if unreadable) every link stays plain. */
  function load(){
    if(typeof root.fetch!=='function'||!root.document)return Promise.resolve(current);
    return Promise.resolve().then(()=>root.fetch(SETTINGS_PATH,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'})).then(response=>response&&response.ok?response.json():null).then(data=>{if(data)configure(data);return current;}).catch(()=>current);
  }
  const api=Object.freeze({PROVIDERS,DISCLOSURE_PATH,providerName,normalize,configure,settings,link});
  if(root.document&&!(typeof module==='object'&&module.exports))load();
  return api;
}));
