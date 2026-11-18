/** Temporary owner setup on workers.dev. Never use this entry point for student traffic. */
import worker from '../outputs/cloudflare/worker.mjs';

const authRoutes=new Map([
  ['/api/auth/status','GET'],['/api/auth/session','GET'],
  ['/api/auth/login','POST'],['/api/auth/logout','POST'],
  ['/auth/google','GET'],['/auth/complete','GET']
]);
const aiRoutes=new Map([
  ['/api/admin/ai-connection',new Set(['GET','PUT','DELETE'])],
  ['/api/admin/ai-connection/test',new Set(['POST'])]
]);
const setupPages=new Set(['/','/index.html','/admin.html','/account.html']);
const currentSite='https://degreepath-open-2026.ccollins203.chatgpt.site';

function privateResponse(response) {
  const headers=new Headers(response.headers);
  for(const name of ['CDN-Cache-Control','Cloudflare-CDN-Cache-Control','Vercel-CDN-Cache-Control','Surrogate-Control','Expires','Age'])headers.delete(name);
  headers.set('Cache-Control','private, no-store');
  headers.set('Pragma','no-cache');
  headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers,encodeBody:'manual'});
}
const json=(value,status)=>privateResponse(Response.json(value,{status}));
const paused=()=>json({error:'This host is being set up. Student plans and research are paused here.',code:'bootstrap_only'},503);
const policy="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'";
function text(body,type,request,status=200) {
  return privateResponse(new Response(request.method==='HEAD'?null:body,{status,headers:{'Content-Type':type,'Content-Security-Policy':policy}}));
}

const css=`:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#14253d;background:#f6f8fc}*{box-sizing:border-box}body{margin:0;padding:32px 20px 64px}main{max-width:640px;margin:0 auto}.brand{font-size:28px;font-weight:800;letter-spacing:-1px;color:#14253d;text-decoration:none}.brand span{color:#3856ef}.card{background:#fff;border:1px solid #dae2ef;border-radius:20px;padding:32px;margin-top:32px}h1{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:0 0 16px}h2{font-size:24px;margin:0 0 16px}p{font-size:17px;line-height:1.6;color:#53637c}label{display:block;font-size:16px;font-weight:650;margin:20px 0 8px}input{font:inherit;width:100%;min-height:48px;border:1px solid #b8c6da;border-radius:9px;padding:12px}button,.button{font:inherit;font-weight:650;display:inline-block;background:#3856ef;color:white;border:0;border-radius:9px;min-height:48px;padding:13px 18px;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:wait}.secondary{background:#edf1ff;color:#2543bf}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}a{color:#2543bf;text-underline-offset:3px}#notice{padding:14px 16px;border-radius:9px;background:#edf1ff;color:#254176;white-space:pre-line}#notice[data-error=true]{background:#fff0ee;color:#9c2821}.small{font-size:15px}[hidden]{display:none!important}:focus-visible{outline:3px solid #e0a900;outline-offset:3px}@media(max-width:480px){body{padding:24px 16px}.card{padding:24px}h1{font-size:28px}.actions>*{width:100%;text-align:center}}`;
const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Connect DegreeSteps</title><link rel="stylesheet" href="/bootstrap.css"><script src="/bootstrap.js" defer></script></head><body><main><a class="brand" href="/admin.html" aria-label="DegreeSteps setup">Degree<span>Steps</span></a><section class="card"><h1>Finish connecting DegreeSteps</h1><p>Sign in with the owner account, then reconnect Claude on this host.</p><p class="small">Student planning remains on the <a href="${currentSite}" rel="noopener noreferrer">current DegreeSteps site</a> while setup finishes.</p><p id="notice" role="status" aria-live="polite">Checking sign-in…</p><section id="login" hidden><h2>Sign in</h2><a id="google" class="button" href="/auth/google?returnTo=%2Fadmin.html" hidden>Continue with Google</a><form id="login-form" hidden><label for="email">Email</label><input id="email" type="email" autocomplete="username" required maxlength="254"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required maxlength="256"><div class="actions"><button type="submit">Sign in with email</button></div></form></section><section id="connection" hidden><h2>Reconnect Claude</h2><p id="connection-status">Checking secure storage…</p><form id="key-form" autocomplete="off"><label for="api-key">Claude Console API key</label><input id="api-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" required><p class="small">Your key is encrypted on the server. It is never saved in this browser. A connection check does not generate degree research.</p><div class="actions"><button id="save" type="submit" disabled>Save and test connection</button><button id="test" class="secondary" type="button" hidden>Test saved connection</button></div></form><div class="actions"><button id="refresh" class="secondary" type="button">Refresh status</button><button id="signout" class="secondary" type="button">Sign out</button></div></section><button id="retry" class="secondary" type="button" hidden>Try again</button></section></main></body></html>`;
const script=`(()=>{'use strict';const $=id=>document.getElementById(id);let connection=null,busy=false,confirmedRevision=null;
function notice(message,error=false){$('notice').textContent=message;$('notice').dataset.error=String(error);}
async function api(path,{method='GET',body}={}){const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Accept':'application/json',...(body===undefined?{}:{'Content-Type':'application/json','X-Portal-Request':'1'})},...(body===undefined?{}:{body:JSON.stringify(body)})});let value;try{value=await response.json();}catch{throw Error('invalid_response');}if(!response.ok){const error=Error('request_failed');error.status=response.status;throw error;}return value;}
function controls(){for(const id of ['save','test','refresh','signout'])$(id).disabled=busy||id==='save'&&!connection?.storageReady;$('api-key').disabled=busy||!connection?.storageReady;$('login-form').querySelector('button').disabled=busy;}
function showConnection(value){if(typeof value?.storageReady!=='boolean'||!Number.isSafeInteger(value.revision))throw Error('invalid_connection');connection=value;$('connection').hidden=false;$('login').hidden=true;$('retry').hidden=true;$('test').hidden=!value.configured;$('connection-status').textContent=!value.storageReady?'Secure key storage is not ready yet. Ask the operator to finish the server setup.':confirmedRevision===value.revision?'Claude accepted the connection on this host.':'Paste your key to connect this host, or test the saved connection. A connection copied from the previous host needs to be reconnected.';controls();}
async function load(){notice('Checking sign-in…');$('retry').hidden=true;try{const [settings,session]=await Promise.all([api('/api/auth/status'),api('/api/auth/session')]);if(!session.user){connection=null;confirmedRevision=null;$('connection').hidden=true;$('login').hidden=false;$('google').hidden=!settings.providers?.includes('google');$('login-form').hidden=!settings.providers?.includes('email');notice(settings.configured?'Sign in with the DegreeSteps owner account.':'Sign-in setup is not complete yet. Ask the operator to finish connecting this host.',!settings.configured);return;}showConnection(await api('/api/admin/ai-connection'));notice('You are signed in. Reconnect Claude below.');}catch(error){$('connection').hidden=true;if(error.status===403){notice('This account is not the DegreeSteps owner. Sign out and use the owner account.',true);$('connection').hidden=false;$('key-form').hidden=true;}else{notice('Setup could not be loaded. Try again shortly.',true);$('retry').hidden=false;}}}
async function action(run){if(busy)return;busy=true;controls();try{await run();}catch(error){const message=error.status===403?'Only the signed-in DegreeSteps owner can change this connection.':error.status===401?'Your sign-in expired. Sign in again.':error.status===409?'The connection changed in another window. Refresh its status before trying again.':error.status===429?'The connection limit was reached. Try again later.':error.status===400?'Claude could not verify that key. Check your Claude Console key and model access.':'The connection could not be confirmed. Refresh its status and try again.';notice(message,true);}finally{$('api-key').value='';$('password').value='';busy=false;controls();}}
$('login-form').addEventListener('submit',event=>{event.preventDefault();let password=$('password').value;$('password').value='';action(async()=>{let request;try{request=api('/api/auth/login',{method:'POST',body:{email:$('email').value,password,returnTo:'/admin.html'}});}finally{password='';}await request;await load();});});
$('key-form').addEventListener('submit',event=>{event.preventDefault();let apiKey=$('api-key').value.trim();$('api-key').value='';if(!connection?.storageReady||!apiKey)return;action(async()=>{notice('Checking Claude…');let request;try{request=api('/api/admin/ai-connection',{method:'PUT',body:{revision:connection.revision,apiKey}});}finally{apiKey='';}const value=await request;confirmedRevision=value.revision;showConnection(value);notice('Claude is connected and verified. Student research remains paused until launch.');});});
$('test').addEventListener('click',()=>action(async()=>{if(!connection)return;notice('Checking saved connection…');const value=await api('/api/admin/ai-connection/test',{method:'POST',body:{revision:connection.revision}});confirmedRevision=value.revision;showConnection(value);notice('Claude accepted the saved connection. No degree research was generated.');}));
$('refresh').addEventListener('click',()=>action(load));$('retry').addEventListener('click',()=>action(load));$('signout').addEventListener('click',()=>action(async()=>{await api('/api/auth/logout',{method:'POST',body:{}});connection=null;confirmedRevision=null;$('key-form').hidden=false;await load();}));
for(const name of ['pagehide','pageshow'])window.addEventListener(name,()=>{$('api-key').value='';$('password').value='';});load();})();`;

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),path=url.pathname;
    if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))return paused();
    // Authorization stays in the normal handlers. The bootstrap host must never
    // grant owner access from an email setting or use an unverified PORTAL_USER.
    const delegatedEnv={...env};
    for(const name of ['COMMUNITY_ADMIN_EMAIL','PORTAL_USER','PORTAL_USER_ACCESS_TOKEN','PORTAL_AUTH_REQUIRED','PORTAL_AUTH_CONFIGURED'])delete delegatedEnv[name];
    if(authRoutes.get(path)===request.method){
      if(path==='/auth/google'){url.searchParams.set('returnTo','/admin.html');request=new Request(url,request);}
      return privateResponse(await worker.fetch(request,delegatedEnv,ctx));
    }
    if(aiRoutes.get(path)?.has(request.method)&&!url.search)return privateResponse(await worker.fetch(request,delegatedEnv,ctx));
    if(path==='/api'||path.startsWith('/api/')||path.startsWith('/auth/'))return paused();
    if(!['GET','HEAD'].includes(request.method))return privateResponse(new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}}));
    if(path==='/robots.txt')return text('User-agent: *\nDisallow: /\n','text/plain; charset=utf-8',request);
    if(path==='/bootstrap.js')return text(script,'text/javascript; charset=utf-8',request);
    if(path==='/bootstrap.css')return text(css,'text/css; charset=utf-8',request);
    if(setupPages.has(path))return text(page,'text/html; charset=utf-8',request);
    return text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DegreeSteps setup</title><h1>This host is being set up.</h1><p><a href="'+currentSite+'">Open the current DegreeSteps site</a></p><p><a href="/admin.html">Owner setup</a></p></html>','text/html; charset=utf-8',request,503);
  }
};
