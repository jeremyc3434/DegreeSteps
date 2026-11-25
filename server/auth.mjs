/** Managed Supabase Auth adapter. Passwords and identity verification stay with the provider. */
const DegreePathAuth = (() => {
  'use strict';
  const ACCESS = '__Host-degreepath_access', REFRESH = '__Host-degreepath_refresh';
  const FLOW = '__Host-degreepath_flow', RECOVERY = '__Host-degreepath_recovery';
  const PREFIX = '/api/auth/', MAX_BODY = 16384, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const allowedReturn = new Set(['/account.html', '/portal.html', '/plan.html', '/request-plan.html', '/admin.html', '/coverage.html', '/growth.html', '/campuses.html', '/school.html', '/community.html', '/courses.html', '/programs.html', '/compare-plans.html', '/degree-audit.html', '/template-import.html']);
  class AuthError extends Error {constructor(status, message) {super(message); this.status = status;}}
  const error = (status, message) => {throw new AuthError(status, message);};
  function configuration(env) {
    try {
      const url = new URL(String(env.PORTAL_SUPABASE_URL || ''));
      const key = String(env.PORTAL_SUPABASE_PUBLISHABLE_KEY || '').trim();
      if (key.startsWith('sb_secret_')) return null;
      if (key.split('.').length === 3) {
        try {const claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))); if (claims.role && claims.role !== 'anon') return null;} catch {return null;}
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || !key || key.length > 4096 || /[\r\n]/.test(key)) return null;
      return {url:url.origin, key};
    } catch {return null;}
  }
  function responseHeaders(cookies = []) {
    const h = new Headers({'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store, private', 'Pragma':'no-cache', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Vary':'Cookie'});
    for (const cookie of cookies) h.append('Set-Cookie',cookie);
    return h;
  }
  function json(value, status = 200, cookies = []) {return new Response(JSON.stringify(value),{status,headers:responseHeaders(cookies)});}
  function redirect(path, cookies = []) {const h = responseHeaders(cookies); h.delete('Content-Type'); h.set('Location',path); return new Response(null,{status:303,headers:h});}
  function safeReturn(value) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/account.html';
    try {const url = new URL(value,'https://local.invalid'); if (!allowedReturn.has(url.pathname)) return '/account.html'; if (url.pathname === '/school.html') {const query = new URLSearchParams(); const school = url.searchParams.get('school'), template = url.searchParams.get('template'); if (school && school.length <= 200) query.set('school',school); if (template && /^[A-Za-z0-9_-]{1,100}$/.test(template)) query.set('template',template); return url.pathname + (query.size ? '?' + query.toString() : '');} if (url.pathname === '/community.html') {const query=new URLSearchParams();for(const name of ['tab','source','post','template','context','school','level','format']){const value=url.searchParams.get(name);if(!value||value.length>200||/[\r\n\u0000]/.test(value))continue;if(name==='tab'&&!['feed','templates'].includes(value))continue;if(name==='source'&&!['all','students','starters'].includes(value))continue;if(['post','template'].includes(name)&&!/^[A-Za-z0-9_-]{1,120}$/.test(value))continue;if(name==='context'&&!/^(school|program|course|template|post):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value))continue;query.set(name,value);}return url.pathname+(query.size?'?'+query.toString():'');} return url.pathname;} catch {return '/account.html';}
  }
  function cookies(request) {
    const result = {};
    for (const entry of (request.headers.get('Cookie') || '').split(';')) {
      const equals = entry.indexOf('='); if (equals < 1) continue;
      const name = entry.slice(0,equals).trim();
      if (![ACCESS,REFRESH,FLOW,RECOVERY].includes(name)) continue;
      try {const value = decodeURIComponent(entry.slice(equals+1).trim()); if (value.length <= 8192) result[name] = value;} catch {/* malformed cookie is not an identity */}
    }
    return result;
  }
  function cookie(name,value,maxAge) {return name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';}
  const clearSession = () => [cookie(ACCESS,'',0),cookie(REFRESH,'',0),cookie(RECOVERY,'',0)];
  const clearAll = () => [...clearSession(),cookie(FLOW,'',0)];
  function tokenCookies(tokens) {
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.access_token.length > 8192 || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || tokens.refresh_token.length > 8192) error(502,'The sign-in provider returned an incomplete session. Please try again.');
    const maxAge = Math.min(7200,Math.max(60,Number(tokens.expires_in) || 3600));
    const output = [cookie(ACCESS,tokens.access_token,Math.floor(maxAge)),cookie(REFRESH,tokens.refresh_token,60*60*24*30)];
    if (output.some(value => new TextEncoder().encode(value).byteLength > 4000)) error(502,'The sign-in session is too large to store securely. Please try another sign-in method.');
    return output;
  }
  function base64url(bytes) {let binary=''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
  function encode(value) {return base64url(new TextEncoder().encode(JSON.stringify(value)));}
  function decode(value) {try {const b64=value.replaceAll('-','+').replaceAll('_','/'); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0))));} catch {return null;}}
  async function newFlow(returnTo, kind) {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const data = {verifier,returnTo:safeReturn(returnTo),kind,createdAt:Date.now()};
    return {data,challenge,cookie:cookie(FLOW,encode(data),kind === 'google' ? 600 : 3600)};
  }
  function readFlow(request) {
    const value = cookies(request)[FLOW], data = value ? decode(value) : null;
    const lifetime = data?.kind === 'google' ? 600000 : 3600000;
    if (!data || !['google','signup','recovery'].includes(data.kind) || !/^[A-Za-z0-9_-]{64}$/.test(data.verifier || '') || typeof data.createdAt !== 'number' || Date.now()-data.createdAt > lifetime || data.createdAt > Date.now()+30000) return null;
    data.returnTo = safeReturn(data.returnTo); return data;
  }
  async function providerData(response, controller) {
    const limit = 100000;
    if (Number(response.headers.get('Content-Length')) > limit) {
      await response.body?.cancel(); controller.abort();
      error(502,'The sign-in provider returned an oversized response. Please try again.');
    }
    if (!response.body) return null;
    const reader = response.body.getReader(); let total=0, chunks=[];
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limit) {await reader.cancel(); controller.abort(); error(502,'The sign-in provider returned an oversized response. Please try again.');}
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset=0;
    for (const chunk of chunks) {bytes.set(chunk,offset); offset += chunk.byteLength;}
    try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {return null;}
  }
  async function provider(env, config, path, {method='GET',body,token} = {}) {
    const headers = {'apikey':config.key, 'Accept':'application/json', 'Accept-Encoding':'identity'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),10000);
    try {
      const fetcher = typeof env.PORTAL_AUTH_FETCH === 'function' ? env.PORTAL_AUTH_FETCH : fetch;
      const response = await fetcher(config.url + '/auth/v1' + path,{method,headers,redirect:'manual',signal:controller.signal,...(body === undefined ? {} : {body:JSON.stringify(body)})});
      if (response.status >= 300 && response.status < 400) error(503,'The sign-in service returned an unexpected redirect. Please try again.');
      const data = await providerData(response,controller);
      if (path === '/settings' && (!response.ok || !data?.external)) console.warn('Account provider settings unavailable', {status:response.status,contentType:response.headers.get('Content-Type'),encoding:response.headers.get('Content-Encoding') || 'identity',responseParsed:data !== null});
      return {ok:response.ok,status:response.status,data};
    } catch (err) {if (err instanceof AuthError) throw err; console.warn('Account provider request unavailable',{route:path.split('?')[0],timeout:controller.signal.aborted,errorName:err?.name||'Error'}); error(503,'The sign-in service is temporarily unavailable. Please try again.');}
    finally {clearTimeout(timer);}
  }
  async function enabledProviders(env,config) {
    const settings = await provider(env,config,'/settings');
    if (!settings.ok || !settings.data?.external) return [];
    return ['email','google'].filter(name => settings.data.external[name] === true);
  }
  function displayName(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    for (const key of ['full_name','name','given_name']) {
      const value = metadata[key];
      // Provider metadata is editable presentation data, never an authorization claim.
      if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) continue;
      const clean = value.trim().replace(/\s+/gu,' '), length = Array.from(clean).length;
      if (length > 0 && length <= 80) return clean;
    }
    return null;
  }
  function userIdentity(value) {
    const user = value?.user || value;
    if (!user || typeof user.id !== 'string' || !UUID.test(user.id) || typeof user.email !== 'string' || user.email.length > 254 || !user.email_confirmed_at) return null;
    const name = displayName(user.user_metadata);
    return {id:'sb-' + user.id.toLowerCase(),email:user.email,...(name ? {displayName:name} : {})};
  }
  async function validateToken(env,config,token) {
    const result = await provider(env,config,'/user',{token});
    return {ok:result.ok,user:result.ok ? userIdentity(result.data) : null,status:result.status};
  }
  async function resolvePortalIdentity(request, env) {
    const config = configuration(env);
    if (!config) return {configured:false,user:null,setCookies:[]};
    const jar = cookies(request), access = jar[ACCESS], refresh = jar[REFRESH];
    if (!access && !refresh) return {configured:true,user:null,setCookies:[]};
    try {
      if (access) {
        const checked = await validateToken(env,config,access);
        if (checked.user) return {configured:true,user:checked.user,setCookies:[],accessToken:access};
        if (![401,403].includes(checked.status)) return {configured:true,user:null,setCookies:[],unavailable:true};
      }
      if (!refresh) return {configured:true,user:null,setCookies:clearSession()};
      const rotated = await provider(env,config,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});
      if (!rotated.ok) {const unavailable=rotated.status >= 500 || rotated.status === 429;return {configured:true,user:null,setCookies:unavailable ? [] : clearSession(),...(unavailable ? {unavailable:true} : {})};}
      const checked = await validateToken(env,config,rotated.data?.access_token);
      if (!checked.user) {const unavailable=checked.status >= 500 || checked.status === 429;return {configured:true,user:null,setCookies:unavailable ? [] : clearSession(),...(unavailable ? {unavailable:true} : {})};}
      return {configured:true,user:checked.user,setCookies:tokenCookies(rotated.data),accessToken:rotated.data.access_token};
    } catch {return {configured:true,user:null,setCookies:[],unavailable:true};}
  }
  function csrf(request) {
    if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('X-Portal-Request') !== '1' || request.headers.get('Sec-Fetch-Site') === 'cross-site') error(403,'Refresh this page and try again.');
    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) error(415,'Use a JSON request.');
  }
  async function body(request,allowed) {
    csrf(request);
    const declared = Number(request.headers.get('Content-Length'));
    if (declared > MAX_BODY) error(413,'This sign-in request is too large.');
    const reader = request.body?.getReader(); let size=0, chunks=[];
    if (reader) while (true) {const {value,done}=await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) {await reader.cancel(); error(413,'This sign-in request is too large.');} chunks.push(value);}
    const raw = new Uint8Array(size); let offset=0; for (const chunk of chunks) {raw.set(chunk,offset); offset+=chunk.byteLength;}
    let result; try {result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));} catch {error(400,'Enter valid sign-in details.');}
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(key=>!allowed.includes(key))) error(400,'This sign-in request contains unsupported fields.');
    return result;
  }
  function email(value) {if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) error(400,'Enter a valid email address.'); return value.trim();}
  function password(value, strong = true) {if (typeof value !== 'string' || value.length > 256 || value.length < (strong ? 10 : 1)) error(400,strong ? 'Use a password with at least 10 characters.' : 'Enter your password.'); return value;}
  function signInFailure(result) {
    if (result.status === 429) error(429,'Too many sign-in attempts. Please wait and try again.');
    if (result.status >= 500) error(503,'The sign-in service is temporarily unavailable. Please try again.');
    error(401,'We couldn’t sign you in. Check your email, password, and email confirmation.');
  }
  async function establish(env,config,tokens) {
    if (!tokens?.access_token) error(502,'The sign-in provider returned an incomplete session. Please try again.');
    const checked = await validateToken(env,config,tokens.access_token);
    if (!checked.user) error(401,'Confirm your email address before signing in.');
    return {user:checked.user,cookies:tokenCookies(tokens)};
  }
  async function handleAuth(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith(PREFIX) && !['/auth/google','/auth/complete'].includes(path)) return null;
    const config = configuration(env);
    try {
      if (path === '/api/auth/session' && request.method === 'GET') {
        const identity = await resolvePortalIdentity(request,env);
        if (identity.unavailable) return json({error:'We couldn’t check your sign-in. Please try again.',code:'auth_unavailable'},503,identity.setCookies);
        return json({configured:identity.configured,user:identity.user},200,identity.setCookies);
      }
      if (path === '/api/auth/status' && request.method === 'GET') {
        if (!config) return json({configured:false,providers:[],recovery:false,message:'Student account sign-in is being connected. You can still build a draft on this device.'});
        let providers=[]; try {providers=await enabledProviders(env,config);} catch {/* unavailable settings mean no provider is advertised */}
        return json({configured:true,providers,recovery:cookies(request)[RECOVERY] === '1',...(providers.length ? {} : {message:'The account provider is not ready. Please try again later.'})});
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        await body(request,[]);
        if (config) {try {const identity=await resolvePortalIdentity(request,env); if (identity.accessToken) await provider(env,config,'/logout?scope=local',{method:'POST',token:identity.accessToken});} catch {/* local sign-out still succeeds if provider is unavailable */}}
        return json({ok:true,message:'You’re signed out on this browser.'},200,clearAll());
      }
      if (!config) return json({error:'Email and Google sign-in have not been connected yet. Your device draft is still available.',code:'auth_not_configured'},503);
      if (path === '/auth/google' && request.method === 'GET') {
        const providers=await enabledProviders(env,config);
        if (!providers.includes('google')) return redirect('/account.html?authError=unavailable');
        const flow=await newFlow(url.searchParams.get('returnTo'),'google');
        const destination=new URL(config.url+'/auth/v1/authorize');
        destination.searchParams.set('provider','google'); destination.searchParams.set('redirect_to',url.origin+'/auth/complete');
        destination.searchParams.set('code_challenge',flow.challenge); destination.searchParams.set('code_challenge_method','s256');
        return redirect(destination.href,[flow.cookie]);
      }
      if (path === '/auth/complete' && request.method === 'GET') {
        const flow=readFlow(request), code=url.searchParams.get('code');
        if (url.searchParams.has('error')) return redirect('/account.html?authError=cancelled',[cookie(FLOW,'',0)]);
        if (!flow || !code || code.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(code)) return redirect('/account.html?authError=expired',[cookie(FLOW,'',0)]);
        const exchanged=await provider(env,config,'/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:flow.verifier}});
        if (!exchanged.ok) return redirect('/account.html?authError=expired',[cookie(FLOW,'',0)]);
        const session=await establish(env,config,exchanged.data), out=[...session.cookies,cookie(FLOW,'',0)];
        const destination=new URL(flow.returnTo,url.origin);
        if (flow.kind === 'recovery') {destination.pathname='/account.html'; destination.searchParams.set('mode','recovery'); out.push(cookie(RECOVERY,'1',600));}
        else if (flow.kind === 'signup') destination.searchParams.set('auth','confirmed');
        return redirect(destination.pathname+destination.search,out);
      }
      if (!path.startsWith(PREFIX)) return json({error:'This sign-in route does not support that method.'},405);
      if (request.method !== 'POST') return json({error:'This sign-in route requires a POST request.'},405);
      if (path === '/api/auth/login') {
        const value=await body(request,['email','password','returnTo']);
        const result=await provider(env,config,'/token?grant_type=password',{method:'POST',body:{email:email(value.email),password:password(value.password,false)}});
        if (!result.ok) signInFailure(result);
        const session=await establish(env,config,result.data);
        return json({ok:true,user:session.user,returnTo:safeReturn(value.returnTo),message:'You’re signed in.'},200,[...session.cookies,cookie(RECOVERY,'',0)]);
      }
      if (path === '/api/auth/signup') {
        const value=await body(request,['email','password','returnTo']), flow=await newFlow(value.returnTo,'signup');
        const result=await provider(env,config,'/signup?redirect_to='+encodeURIComponent(url.origin+'/auth/complete'),{method:'POST',body:{email:email(value.email),password:password(value.password),code_challenge:flow.challenge,code_challenge_method:'s256'}});
        if (!result.ok) {
          if (result.data?.code === 'weak_password') error(400,'Choose a stronger password with at least 10 characters.');
          if (['signup_disabled','email_provider_disabled'].includes(result.data?.code)) error(503,'New email accounts are not enabled yet. Please try again later.');
          if (result.status === 429) error(429,'Too many account requests. Please wait and try again.');
          if ([401,403].includes(result.status) || result.status >= 500 || ['invalid_api_key','email_address_not_authorized'].includes(result.data?.code)) error(503,'Email account creation is not available yet. Please try again later.');
          if (['user_already_exists','email_exists'].includes(result.data?.code)) {
            // The same message avoids exposing account existence; it does not
            // assert that this request sent a fresh message.
            return json({ok:true,needsConfirmation:true,message:'Check your email for a confirmation link, or sign in if you already have an account. Open any confirmation link in this browser.'},201,[flow.cookie]);
          }
          error(400,'We couldn’t create that account. Check your email and password, or sign in if you already have an account.');
        }
        if (result.data?.access_token) {const session=await establish(env,config,result.data); return json({ok:true,needsConfirmation:false,user:session.user,returnTo:safeReturn(value.returnTo)},200,[...session.cookies,cookie(FLOW,'',0)]);}
        return json({ok:true,needsConfirmation:true,message:'Check your email for a confirmation link. Open it in this browser to finish creating your account.'},201,[flow.cookie]);
      }
      if (path === '/api/auth/forgot') {
        const value=await body(request,['email','returnTo']), flow=await newFlow('/account.html','recovery');
        const result=await provider(env,config,'/recover?redirect_to='+encodeURIComponent(url.origin+'/auth/complete'),{method:'POST',body:{email:email(value.email),code_challenge:flow.challenge,code_challenge_method:'s256'}});
        if (result.status === 429) error(429,'Too many reset requests. Please wait and try again.');
        if ([401,403].includes(result.status) || result.status >= 500 || ['invalid_api_key','email_address_not_authorized','email_provider_disabled'].includes(result.data?.code)) error(503,'Password reset email is temporarily unavailable. Please try again later.');
        return json({ok:true,message:'If an account exists for that email, you’ll receive a reset link. Open it in this browser.'},200,[flow.cookie]);
      }
      if (path === '/api/auth/passwordchange') {
        const value=await body(request,['password']), identity=await resolvePortalIdentity(request,env);
        if (identity.unavailable) return json({error:'The sign-in service is temporarily unavailable. Please try again.'},503);
        if (!identity.user) return json({error:'Your reset or sign-in session has expired. Request a new reset link.'},401,identity.setCookies);
        const result=await provider(env,config,'/user',{method:'PUT',body:{password:password(value.password)},token:identity.accessToken});
        if (!result.ok) {if(result.status === 429) error(429,'Too many requests. Please wait and try again.'); error(400,'We couldn’t update that password. Try a different password or request a new reset link.');}
        try {await provider(env,config,'/logout?scope=global',{method:'POST',token:identity.accessToken});} catch {/* password change succeeded; clear local session regardless */}
        return json({ok:true,message:'Your password is updated. Sign in with your new password.'},200,clearAll());
      }
      return json({error:'That sign-in route was not found.'},404);
    } catch (err) {
      if (path === '/auth/complete' || path === '/auth/google') return redirect('/account.html?authError=unavailable',[cookie(FLOW,'',0)]);
      return json({error:err instanceof AuthError ? err.message : 'We couldn’t complete that sign-in request. Please try again.'},err instanceof AuthError ? err.status : 500);
    }
  }
  return {handleAuth,resolvePortalIdentity};
})();

export async function handleAuth(request, env) {return DegreePathAuth.handleAuth(request, env);}
export async function resolvePortalIdentity(request, env) {return DegreePathAuth.resolvePortalIdentity(request, env);}
