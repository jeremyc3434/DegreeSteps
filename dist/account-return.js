/* Only named DegreeSteps pages can resume an account action. No private draft is read. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DegreeAccountReturn=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='degreepath-auth-return-v1',TTL=24*60*60*1000;
  const paths=new Set(['/account.html','/portal.html','/plan.html','/request-plan.html','/admin.html','/coverage.html','/growth.html','/campuses.html','/school.html','/community.html','/courses.html','/programs.html','/compare-plans.html','/degree-audit.html','/template-import.html', '/owner.html', '/help.html']);
  const context=/^(school|program|course|template|post):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
  const identifier=/^[A-Za-z0-9_-]{1,120}$/;
  const bounded=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\\\u0000-\u001f\u007f]/.test(value);
  function normalize(value,origin='https://degreepath.invalid'){
    if(typeof value!=='string'||!value||value.length>2048||value!==value.trim()||/[\\\u0000-\u001f\u007f]/.test(value)||value.startsWith('//'))return null;
    const rawPath=value.split(/[?#]/,1)[0];
    if(/%|(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath))return null;
    if(!/^(?:https?:\/\/|\/?[A-Za-z-]+\.html(?:[?#]|$))/.test(value))return null;
    try{
      const base=new URL(origin),url=new URL(value,base.origin+'/');
      if(!['http:','https:'].includes(url.protocol)||url.origin!==base.origin||url.username||url.password||!paths.has(url.pathname))return null;
      const query=new URLSearchParams();
      if(url.pathname==='/school.html'){
        const school=url.searchParams.get('school'),template=url.searchParams.get('template');
        if(bounded(school))query.set('school',school);
        if(template&&/^[A-Za-z0-9_-]{1,100}$/.test(template))query.set('template',template);
      }else if(url.pathname==='/community.html'){
        const tab=url.searchParams.get('tab');if(['feed','templates'].includes(tab))query.set('tab',tab);
        const source=url.searchParams.get('source');if(['all','students','starters'].includes(source))query.set('source',source);
        for(const key of ['post','template']){const value=url.searchParams.get(key);if(value&&identifier.test(value))query.set(key,value);}
        const target=url.searchParams.get('context');if(target&&context.test(target))query.set('context',target);
        for(const key of ['school','level','format']){const value=url.searchParams.get(key);if(bounded(value))query.set(key,value);}
      }
      return url.pathname+(query.size?'?'+query.toString():'');
    }catch{return null;}
  }
  function clear(storage){try{storage?.removeItem(KEY);}catch{/* The current safe destination can still be used. */}}
  function remember(storage,path,now=Date.now()){
    const safe=normalize(path);if(!safe||safe==='/account.html'){clear(storage);return;}
    try{storage?.setItem(KEY,JSON.stringify({path:safe,expiresAt:now+TTL}));}catch{/* Authentication remains available when session storage is blocked. */}
  }
  function read(storage,origin,now=Date.now()){
    try{const value=JSON.parse(storage?.getItem(KEY)||'null'),path=normalize(value?.path,origin);if(!path||path==='/account.html'||!Number.isFinite(value.expiresAt)||value.expiresAt<=now||value.expiresAt>now+TTL){clear(storage);return null;}return path;}catch{clear(storage);return null;}
  }
  function resolve(search,storage,origin,now=Date.now()){
    const params=new URLSearchParams(search);
    if(params.has('returnTo')){
      const path=normalize(params.get('returnTo'),origin);if(!path){clear(storage);return '/account.html';}remember(storage,path,now);return path;
    }
    // A plain account visit does not revive a previous, completed sign-in task.
    if(params.get('mode')==='recovery'||params.has('authError')||params.get('auth')==='confirmed')return read(storage,origin,now)||'/account.html';
    return '/account.html';
  }
  return Object.freeze({KEY,TTL,normalize,safeReturn:normalize,resolve,remember,read,clear});
}));
