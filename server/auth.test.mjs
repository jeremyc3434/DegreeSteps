import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuth, resolvePortalIdentity } from './auth.mjs';

const origin='https://degreepath.example', providerOrigin='https://sample.supabase.co';
const uuid='8c6e3329-dd44-4d9d-8f2e-4ce233af0cbd';
const verified={id:uuid,email:'student@example.com',email_confirmed_at:'2026-11-01T00:00:00Z'};
const tokens={access_token:'provider-issued-access-token',refresh_token:'provider-issued-refresh-token',expires_in:3600};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fixture(handler) {
 const calls=[];
 const env={PORTAL_SUPABASE_URL:providerOrigin,PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test-key',PORTAL_AUTH_FETCH:async(url,init)=>{const call={url:new URL(url),init,body:init.body?JSON.parse(init.body):undefined};calls.push(call);return handler?handler(call):answer({external:{email:true,google:true}});}};
 return {env,calls};
}
function request(path,{method='GET',body,cookie,headers={}}={}) {
 const h=new Headers(headers);
 if(method==='POST'){if(!h.has('Origin'))h.set('Origin',origin);if(!h.has('X-Portal-Request'))h.set('X-Portal-Request','1');if(!h.has('Content-Type'))h.set('Content-Type','application/json');}
 if(cookie)h.set('Cookie',cookie);
 return new Request(origin+path,{method,headers:h,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
const cookieJar=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function call(env,path,options) {const response=await handleAuth(request(path,options),env);return {response,status:response.status,data:response.headers.get('Content-Type')?.includes('json')?await response.json():null};}

test('sign-in identity is available independently of saved-plan storage and never returns credentials',async()=>{
 const {env,calls}=fixture(c=>{assert.equal(c.url.pathname,'/auth/v1/user');return answer(verified);});
 env.DB={prepare(){throw Error('Identity must not access the plan database');}};
 env.PORTAL_DATA_FETCH=()=>{throw Error('Identity must not call the plan service');};
 const result=await call(env,'/api/auth/session',{cookie:'__Host-degreepath_access='+tokens.access_token});
 assert.equal(result.status,200);assert.deepEqual(result.data,{configured:true,user:{id:'sb-'+uuid,email:verified.email}});assert.equal(calls.length,1);
 assert.equal(result.response.headers.get('Cache-Control'),'no-store, private');assert.equal(result.response.headers.get('Vary'),'Cookie');
 assert(!JSON.stringify(result.data).includes(tokens.access_token));assert(!JSON.stringify(result.data).includes(env.PORTAL_SUPABASE_PUBLISHABLE_KEY));
 const guest=await call(env,'/api/auth/session');assert.deepEqual(guest.data,{configured:true,user:null});assert.equal(calls.length,1);
 assert.deepEqual((await call({},'/api/auth/session')).data,{configured:false,user:null});
});

test('independent sign-in checks rotate expired credentials and distinguish provider outages from sign-out',async()=>{
 const refreshed=fixture(c=>c.url.pathname.endsWith('/token')?answer(tokens):c.init.headers.Authorization==='Bearer expired'?answer({},401):answer(verified));
 const result=await call(refreshed.env,'/api/auth/session',{cookie:'__Host-degreepath_access=expired; __Host-degreepath_refresh=old-refresh'});
 assert.equal(result.status,200);assert.equal(result.data.user.id,'sb-'+uuid);assert.equal(result.response.headers.getSetCookie().length,2);
 const unavailable=fixture(()=>answer({error:'temporary outage'},503));
 const failed=await call(unavailable.env,'/api/auth/session',{cookie:'__Host-degreepath_access=existing-access; __Host-degreepath_refresh=existing-refresh'});
 assert.equal(failed.status,503);assert.equal(failed.data.code,'auth_unavailable');assert.equal(failed.response.headers.getSetCookie().length,0);assert(!Object.hasOwn(failed.data,'user'));
});

test('missing or invalid configuration advertises no enabled accounts and never invents an identity',async()=>{
 const status=await call({},'/api/auth/status');assert.equal(status.status,200);assert.deepEqual(status.data.providers,[]);assert.equal(status.data.configured,false);
 const login=await call({},'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password'}});assert.equal(login.status,503);assert.equal(login.data.code,'auth_not_configured');
 assert.deepEqual(await resolvePortalIdentity(request('/api/portal/session',{headers:{'oai-authenticated-user-id':'native-user'}}),{}),{configured:false,user:null,setCookies:[]});
 const wrong=await call({PORTAL_SUPABASE_URL:'http://unsafe.example',PORTAL_SUPABASE_PUBLISHABLE_KEY:'x'},'/api/auth/status');assert.equal(wrong.data.configured,false);
 assert.equal(await handleAuth(request('/guides/'),{}),null);
});

test('provider discovery reports actual enabled providers and never exposes a publishable key or password',async()=>{
 const {env,calls}=fixture(()=>answer({external:{email:true,google:false},disable_signup:false}));
 const status=await call(env,'/api/auth/status');assert.equal(status.data.configured,true);assert.deepEqual(status.data.providers,['email']);
 assert.equal(calls[0].url.href,providerOrigin+'/auth/v1/settings');assert.equal(calls[0].init.headers.apikey,env.PORTAL_SUPABASE_PUBLISHABLE_KEY);
 assert(!JSON.stringify(status.data).includes(env.PORTAL_SUPABASE_PUBLISHABLE_KEY));assert.equal(status.response.headers.get('Cache-Control'),'no-store, private');
 const google=await call(env,'/auth/google');assert.equal(google.status,303);assert.equal(google.response.headers.get('Location'),'/account.html?authError=unavailable');
});

test('write endpoints enforce same-origin custom-header JSON and bounded exact request shapes',async()=>{
 const {env,calls}=fixture();
 for(const headers of [{Origin:'https://attacker.example'},{Origin:'null'},{'X-Portal-Request':'0'},{'Sec-Fetch-Site':'cross-site'}]){
  const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'pw'},headers});assert.equal(result.status,403);
 }
 assert.equal((await call(env,'/api/auth/login',{method:'POST',body:{},headers:{'Content-Type':'text/plain'}})).status,415);
 assert.equal((await call(env,'/api/auth/login',{method:'POST',body:{email:'bad',password:'pw'}})).status,400);
 assert.equal((await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'pw',userId:uuid}})).status,400);
 assert.equal((await call(env,'/api/auth/signup',{method:'POST',body:{email:'student@example.com',password:'short'}})).status,400);
 assert.equal((await call(env,'/api/auth/login',{method:'POST',body:'x'.repeat(17000)})).status,413);
 assert.equal(calls.length,0,'rejected input never reaches the provider');
});

test('email login validates the issued session with the provider and keeps tokens in secure HttpOnly cookies',async()=>{
 const {env,calls}=fixture(call=>call.url.pathname.endsWith('/token')?answer(tokens):answer(verified));
 const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'correct password',returnTo:'https://attacker.example'}});
 assert.equal(result.status,200);assert.equal(result.data.user.id,'sb-'+uuid);assert.equal(result.data.returnTo,'/account.html');
 assert.deepEqual(calls[0].body,{email:'student@example.com',password:'correct password'});assert.equal(calls[0].url.searchParams.get('grant_type'),'password');
 assert.equal(calls[1].url.pathname,'/auth/v1/user');assert.equal(calls[1].init.headers.Authorization,'Bearer '+tokens.access_token);
 const cookies=result.response.headers.getSetCookie();assert(cookies.some(c=>c.startsWith('__Host-degreepath_access=')));assert(cookies.some(c=>c.startsWith('__Host-degreepath_refresh=')));
 assert(cookies.every(c=>c.includes('; HttpOnly; Secure; SameSite=Lax')));assert(cookies.every(c=>c.includes('; Path=/;')));
 assert(!JSON.stringify(result.data).includes(tokens.access_token));assert(!JSON.stringify(result.data).includes(tokens.refresh_token));
});

test('failed login is generic and an unconfirmed provider identity cannot create an application session',async()=>{
 const failed=fixture(()=>answer({msg:'Email exists, password is wrong.'},400));
 const invalid=await call(failed.env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'wrong'}});
 assert.equal(invalid.status,401);assert(!JSON.stringify(invalid.data).includes('Email exists'));
 const unconfirmed=fixture(c=>c.url.pathname.endsWith('/token')?answer(tokens):answer({...verified,email_confirmed_at:null}));
 const pending=await call(unconfirmed.env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});assert.equal(pending.status,401);assert.equal(pending.response.headers.getSetCookie().length,0);
});

test('existing access identity is obtained from /user rather than unsigned claims or native headers',async()=>{
 const {env,calls}=fixture(()=>answer(verified));
 const identity=await resolvePortalIdentity(request('/api/portal/session',{cookie:'__Host-degreepath_access=pretend.jwt.claims',headers:{'oai-authenticated-user-id':'attacker'}}),env);
 assert.equal(identity.user.id,'sb-'+uuid);assert.equal(calls.length,1);assert.equal(calls[0].init.headers.Authorization,'Bearer pretend.jwt.claims');
 const noProof=await resolvePortalIdentity(request('/api/portal/session',{headers:{'oai-authenticated-user-id':'attacker'}}),env);assert.equal(noProof.user,null);assert.equal(calls.length,1);
});

test('private display names come only from the verified provider user and expose no other metadata',async()=>{
 const metadata={full_name:'  Zoë   李  ',name:'Lower priority',given_name:'Last priority',id:'another-owner',email:'another@example.invalid',role:'admin',is_admin:true,avatar_url:'https://private.invalid/avatar',private_note:'never-forward-this'};
 const {env,calls}=fixture(c=>{assert.equal(c.url.pathname,'/auth/v1/user');return answer({...verified,user_metadata:metadata,app_metadata:{role:'admin'},role:'service_role'});});
 const unsigned=Buffer.from(JSON.stringify({user_metadata:{full_name:'Unsigned name'},role:'admin'})).toString('base64url');
 const result=await call(env,'/api/auth/session',{cookie:'__Host-degreepath_access=header.'+unsigned+'.signature',headers:{'oai-authenticated-user-id':'another-owner','oai-authenticated-user-name':'Header name'}});
 assert.equal(result.status,200);assert.deepEqual(result.data,{configured:true,user:{id:'sb-'+uuid,email:verified.email,displayName:'Zoë 李'}});
 assert.equal(calls.length,1);assert.equal(calls[0].init.headers.Authorization,'Bearer header.'+unsigned+'.signature');
 for(const secret of ['private_note','never-forward-this','avatar_url','another-owner','service_role','is_admin',env.PORTAL_SUPABASE_PUBLISHABLE_KEY,unsigned])assert(!JSON.stringify(result.data).includes(secret),secret);
 const noCookie=await call(env,'/api/auth/session',{headers:{'oai-authenticated-user-id':'another-owner','oai-authenticated-user-name':'Header name'}});assert.equal(noCookie.data.user,null);assert.equal(calls.length,1);
});

test('provider display-name fallback is bounded, Unicode-aware and rejects unsafe or non-text metadata',async()=>{
 const invalid=['','   ',null,42,false,{},['Array name'],'Ada\u0000Lovelace','Ada\tLovelace','Ada\nLovelace','Ada\u007fLovelace','Ada\u0085Lovelace','Ada\u202eLovelace','Ada\u200bLovelace','Ada\u2028Lovelace','Ada\u2029Lovelace','Ada\ud800Lovelace','a'.repeat(81),'雪'.repeat(81),'😀'.repeat(81)];
 const cases=[
  [{full_name:'Full Name',name:'Other Name',given_name:'Given'},'Full Name'],
  [{name:'  María\u00a0  李  ',given_name:'Given'},'María 李'],
  [{given_name:'Олександра'},'Олександра'],
  [{full_name:'Jose\u0301 山田'},'Jose\u0301 山田'],
  [{full_name:'😀'.repeat(80)},'😀'.repeat(80)],
  ...invalid.map(full_name=>[{full_name,name:'Safe fallback',given_name:'Given'},'Safe fallback']),
  ...invalid.map(name=>[{full_name:null,name,given_name:'Given'},'Given']),
  ...invalid.map(given_name=>[{given_name},undefined]),
  ...[undefined,null,42,'Plain string',['Array metadata'],{nickname:'Unused name',displayName:'Unused name',email:'email-name@example.invalid'}].map(metadata=>[metadata,undefined])
 ];
 for(const [metadata,expected]of cases){
  const {env}=fixture(()=>answer({...verified,user_metadata:metadata}));
  const result=await call(env,'/api/auth/session',{cookie:'__Host-degreepath_access=verified-access'});
  assert.deepEqual(result.data.user,{id:'sb-'+uuid,email:verified.email,...(expected?{displayName:expected}:{})},JSON.stringify(metadata));
 }
 const unconfirmed=fixture(()=>answer({...verified,email_confirmed_at:null,user_metadata:{full_name:'A name does not confirm identity',email_confirmed_at:true,role:'admin'}}));
 assert.equal((await resolvePortalIdentity(request('/api/portal/session',{cookie:'__Host-degreepath_access=unconfirmed'}),unconfirmed.env)).user,null);
});

test('login and refreshed sessions ignore token-response names and retain only the checked user display name',async()=>{
 const malicious={...tokens,user:{...verified,user_metadata:{full_name:'Token-response name'},role:'admin'},user_metadata:{full_name:'Token-root name'},role:'admin'};
 for(const mode of ['login','refresh']){
  const {env,calls}=fixture(c=>c.url.pathname.endsWith('/token')?answer(malicious):c.init.headers.Authorization==='Bearer expired-access'?answer({...verified,user_metadata:{full_name:'Expired name'}},401):answer({...verified,user_metadata:{given_name:'Verified fresh name',role:'admin',private_key:'never-forward-this'}}));
  const result=mode==='login'?await call(env,'/api/auth/login',{method:'POST',body:{email:verified.email,password:'correct password'}}):await call(env,'/api/auth/session',{cookie:'__Host-degreepath_access=expired-access; __Host-degreepath_refresh=old-refresh'});
  assert.equal(result.status,200);assert.deepEqual(result.data.user,{id:'sb-'+uuid,email:verified.email,displayName:'Verified fresh name'});
  assert.equal(calls.at(-1).url.pathname,'/auth/v1/user');assert.equal(calls.at(-1).init.headers.Authorization,'Bearer '+tokens.access_token);
  assert.equal(calls.length,mode==='login'?2:3);assert.equal(result.response.headers.getSetCookie().filter(value=>value.startsWith('__Host-degreepath_access=')||value.startsWith('__Host-degreepath_refresh=')).length,2);
  for(const secret of [tokens.access_token,tokens.refresh_token,'Token-response name','Token-root name','Expired name','private_key','never-forward-this','role',env.PORTAL_SUPABASE_PUBLISHABLE_KEY])assert(!JSON.stringify(result.data).includes(secret),mode+' '+secret);
 }
 const {env,calls}=fixture();
 assert.equal((await call(env,'/api/auth/login',{method:'POST',body:{email:verified.email,password:'correct password',displayName:'Request name'}})).status,400);assert.equal(calls.length,0);
});

test('expired access refreshes through the provider, validates the new identity and rotates both cookies',async()=>{
 const {env,calls}=fixture(c=>c.url.pathname.endsWith('/token')?answer({...tokens,access_token:'fresh-access',refresh_token:'fresh-refresh'}):c.init.headers.Authorization==='Bearer expired-access'?answer({error:'expired'},401):answer(verified));
 const identity=await resolvePortalIdentity(request('/api/portal/plans',{cookie:'__Host-degreepath_access=expired-access; __Host-degreepath_refresh=old-refresh'}),env);
 assert.equal(identity.user.id,'sb-'+uuid);assert.equal(calls.length,3);assert.deepEqual(calls[1].body,{refresh_token:'old-refresh'});assert.equal(calls[1].url.searchParams.get('grant_type'),'refresh_token');
 assert(identity.setCookies.some(c=>c.includes('fresh-access')));assert(identity.setCookies.some(c=>c.includes('fresh-refresh')));
 const refused=fixture(()=>answer({error:'invalid'},401));const invalid=await resolvePortalIdentity(request('/api/portal/plans',{cookie:'__Host-degreepath_refresh=old-refresh'}),refused.env);assert.equal(invalid.user,null);assert(invalid.setCookies.every(c=>c.includes('Max-Age=0')));
});

test('a temporary provider outage does not erase stored refresh credentials',async()=>{
 const {env}=fixture(()=>{throw new Error('private provider diagnostics');});
 const identity=await resolvePortalIdentity(request('/api/portal/session',{cookie:'__Host-degreepath_access=old; __Host-degreepath_refresh=still-valid'}),env);
 assert.equal(identity.user,null);assert.equal(identity.unavailable,true);assert.deepEqual(identity.setCookies,[]);
 const failed=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});assert.equal(failed.status,503);assert(!JSON.stringify(failed.data).includes('private provider diagnostics'));
});

test('temporary refresh and post-refresh verification failures stay unavailable without clearing cookies',async()=>{
 for(const failure of ['refresh','verification'])for(const status of [429,503]){
  const {env,calls}=fixture(c=>{
   if(c.url.pathname.endsWith('/token'))return failure==='refresh'?answer({error:'private-upstream-failure'},status):answer({...tokens,access_token:'rotated-access'});
   if(c.init.headers.Authorization==='Bearer expired-access')return answer({error:'expired'},401);
   assert.equal(c.init.headers.Authorization,'Bearer rotated-access');return answer({error:'private-upstream-failure'},status);
  });
  const identity=await resolvePortalIdentity(request('/api/portal/plans',{cookie:'__Host-degreepath_access=expired-access; __Host-degreepath_refresh=retained-refresh'}),env);
  assert.equal(identity.user,null,failure+' '+status);assert.equal(identity.unavailable,true,failure+' '+status);assert.deepEqual(identity.setCookies,[]);
  assert.equal(calls.length,failure==='refresh'?2:3);assert(!JSON.stringify(identity).includes('private-upstream-failure'));
 }
});

test('Google OAuth uses PKCE and a same-browser HttpOnly verifier, and safely exchanges a callback code',async()=>{
 const {env,calls}=fixture(c=>c.url.pathname.endsWith('/settings')?answer({external:{email:true,google:true}}):c.url.pathname.endsWith('/token')?answer(tokens):answer(verified));
 const begin=await call(env,'/auth/google?returnTo='+encodeURIComponent('//attacker.example'));
 assert.equal(begin.status,303);const location=new URL(begin.response.headers.get('Location'));
 assert.equal(location.origin,providerOrigin);assert.equal(location.searchParams.get('provider'),'google');assert.equal(location.searchParams.get('redirect_to'),origin+'/auth/complete');assert.equal(location.searchParams.get('code_challenge_method'),'s256');assert.match(location.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);
 const flowCookie=cookieJar(begin.response);assert(flowCookie.startsWith('__Host-degreepath_flow='));assert(!location.href.includes('code_verifier'));
 const missing=await call(env,'/auth/complete?code=auth-code');assert.equal(missing.response.headers.get('Location'),'/account.html?authError=expired');
 const complete=await call(env,'/auth/complete?code=auth-code',{cookie:flowCookie});assert.equal(complete.status,303);assert.equal(complete.response.headers.get('Location'),'/account.html');
 const exchange=calls.find(c=>c.url.searchParams.get('grant_type')==='pkce');assert.equal(exchange.body.auth_code,'auth-code');assert.match(exchange.body.code_verifier,/^[A-Za-z0-9_-]{64}$/);
 const expected=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exchange.body.code_verifier))).toString('base64url');assert.equal(location.searchParams.get('code_challenge'),expected);
 assert(complete.response.headers.getSetCookie().some(c=>c.startsWith('__Host-degreepath_access=')));
});

test('email signup and recovery use PKCE and do not disclose account existence',async()=>{
 const {env,calls}=fixture(()=>answer({id:uuid,email:'student@example.com'}));
 const signup=await call(env,'/api/auth/signup',{method:'POST',body:{email:'student@example.com',password:'secure password',returnTo:'/portal.html'}});
 assert.equal(signup.status,201);assert.equal(signup.data.needsConfirmation,true);assert.match(signup.data.message,/this browser/);
 assert.equal(calls[0].url.pathname,'/auth/v1/signup');assert.equal(calls[0].url.searchParams.get('redirect_to'),origin+'/auth/complete');assert.equal(calls[0].body.code_challenge_method,'s256');assert.match(calls[0].body.code_challenge,/^[A-Za-z0-9_-]{43}$/);
 const unknown=fixture(()=>answer({error:'User not found'},404)), existing=fixture(()=>answer({}));
 const a=await call(unknown.env,'/api/auth/forgot',{method:'POST',body:{email:'unknown@example.com'}}),b=await call(existing.env,'/api/auth/forgot',{method:'POST',body:{email:'student@example.com'}});
 assert.equal(a.status,b.status);assert.equal(a.data.message,b.data.message);assert(!JSON.stringify(a.data).includes('not found'));
});

test('a completed recovery flow opens password entry and password changes revoke and clear the local session',async()=>{
 const {env,calls}=fixture(c=>c.url.pathname.endsWith('/recover')?answer({}):c.url.pathname.endsWith('/token')?answer(tokens):c.init.method==='PUT'?answer(verified):c.url.pathname.endsWith('/logout')?answer({}):answer(verified));
 const start=await call(env,'/api/auth/forgot',{method:'POST',body:{email:'student@example.com'}});
 const callback=await call(env,'/auth/complete?code=reset-code',{cookie:cookieJar(start.response)});
 assert.equal(callback.response.headers.get('Location'),'/account.html?mode=recovery');assert(callback.response.headers.getSetCookie().some(c=>c.startsWith('__Host-degreepath_recovery=1')));
 const change=await call(env,'/api/auth/passwordchange',{method:'POST',body:{password:'new secure password'},cookie:cookieJar(callback.response)});
 assert.equal(change.status,200);assert.match(change.data.message,/Sign in/);assert(change.response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 const update=calls.find(c=>c.init.method==='PUT');assert.equal(update.url.pathname,'/auth/v1/user');assert.deepEqual(update.body,{password:'new secure password'});assert(calls.some(c=>c.url.pathname.endsWith('/logout')&&c.url.searchParams.get('scope')==='global'));
});

test('sign-out clears every auth cookie even without provider configuration and rejects cross-site requests',async()=>{
 const logout=await call({},'/api/auth/logout',{method:'POST',body:{}});assert.equal(logout.status,200);assert.equal(logout.response.headers.getSetCookie().length,4);assert(logout.response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 assert.equal((await call({},'/api/auth/logout',{method:'POST',body:{},headers:{Origin:'https://attacker.example'}})).status,403);
});


test('signup failures never claim an email was sent when provider configuration or validation failed',async()=>{
 for (const [status,code,expected] of [[401,'invalid_api_key',503],[403,'email_address_not_authorized',503],[422,'weak_password',400],[422,'validation_failed',400],[400,'signup_disabled',503]]) {
  const {env}=fixture(()=>answer({code,message:'Private provider diagnostic'},status));
  const result=await call(env,'/api/auth/signup',{method:'POST',body:{email:'student@example.com',password:'long enough password'}});
  assert.equal(result.status,expected,code);assert.equal(result.data.needsConfirmation,undefined);assert(!JSON.stringify(result.data).includes('Private provider diagnostic'));assert.equal(result.response.headers.getSetCookie().length,0);
 }
 const {env}=fixture(()=>answer({code:'user_already_exists'},422));
 const duplicate=await call(env,'/api/auth/signup',{method:'POST',body:{email:'student@example.com',password:'long enough password'}});
 assert.equal(duplicate.status,201);assert.match(duplicate.data.message,/or sign in/);
});

test('a Supabase secret or service-role key is rejected rather than used for student authentication',async()=>{
 for(const key of ['sb_secret_do-not-use',Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature']) {
  const {env,calls}=fixture();env.PORTAL_SUPABASE_PUBLISHABLE_KEY=key;
  const result=await call(env,'/api/auth/status');assert.equal(result.data.configured,false);assert.equal(calls.length,0);
 }
});


test('misconfigured recovery mail returns unavailable rather than implying a reset link was sent',async()=>{
 const {env}=fixture(()=>answer({code:'email_address_not_authorized'},403));
 const result=await call(env,'/api/auth/forgot',{method:'POST',body:{email:'student@example.com'}});
 assert.equal(result.status,503);assert.equal(result.data.ok,undefined);assert.equal(result.response.headers.getSetCookie().length,0);
});


test('oversized encoded session cookies fail explicitly instead of claiming a browser session was saved',async()=>{
 for (const issued of [{...tokens,access_token:'x'.repeat(3950)},{...tokens,refresh_token:'x'.repeat(3950)},{...tokens,access_token:'%'.repeat(1350)}]) {
  const {env}=fixture(c=>c.url.pathname.endsWith('/token')?answer(issued):answer(verified));
  const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});
  assert.equal(result.status,502);assert.match(result.data.error,/too large/);assert.equal(result.data.ok,undefined);assert.equal(result.response.headers.getSetCookie().length,0);
 }
 const {env}=fixture(c=>c.url.pathname.endsWith('/token')?answer({...tokens,access_token:'x'.repeat(3800)}):answer(verified));
 const accepted=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});
 assert.equal(accepted.status,200);assert(accepted.response.headers.getSetCookie().every(value=>Buffer.byteLength(value)<=4000));
});

test('provider JSON streams are capped before the full body is consumed',async()=>{
 let cancelled=false, pulls=0;
 const {env}=fixture(()=>new Response(new ReadableStream({
  pull(controller){pulls++;controller.enqueue(new Uint8Array(30000));},
  cancel(){cancelled=true;}
 }),{headers:{'Content-Type':'application/json'}}));
 const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});
 assert.equal(result.status,502);assert.match(result.data.error,/oversized/);assert(cancelled);assert(pulls<=5,'the adapter must stop reading once the bound is crossed');assert.equal(result.response.headers.getSetCookie().length,0);
 let declaredCancelled=false;
 env.PORTAL_AUTH_FETCH=async()=>new Response(new ReadableStream({cancel(){declaredCancelled=true;}}),{headers:{'Content-Length':'100001'}});
 const declared=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long password'}});
 assert.equal(declared.status,502);assert(declaredCancelled);
});

test('workspace sign-in returns keep approved pages and preserve only school context',async()=>{
 const {env}=fixture(call=>call.url.pathname.endsWith('/token')?answer(tokens):answer(verified));
 for(const path of ['/request-plan.html','/admin.html']){const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password',returnTo:path}});assert.equal(result.data.returnTo,path);}
 const result=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password',returnTo:'/school.html?school=Liberty%20University&template=tpl-reviewed&redirect=https://attacker.example'}});
 assert.equal(result.data.returnTo,'/school.html?school=Liberty+University&template=tpl-reviewed');
 for(const source of ['all','students','starters']){const community=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password',returnTo:'/community.html?tab=feed&source='+source+'&context=school%3Awgu&next=https://attacker.example'}});assert.equal(community.data.returnTo,'/community.html?tab=feed&source='+source+'&context=school%3Awgu');}
 const invalidSource=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password',returnTo:'/community.html?tab=feed&source=owner'}});assert.equal(invalidSource.data.returnTo,'/community.html?tab=feed');
 const unsafe=await call(env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password',returnTo:'//attacker.example/admin.html'}});assert.equal(unsafe.data.returnTo,'/account.html');
});

test('Worker-supported manual redirects discover email and reject token redirects without forwarding credentials',async()=>{
 const good=fixture(call=>{assert.equal(call.init.redirect,'manual','Cloudflare Workers does not support redirect:error');return answer({external:{email:true,google:false}});});
 const status=await call(good.env,'/api/auth/status');assert.deepEqual(status.data.providers,['email']);
 const redirected=fixture(call=>{assert.equal(call.init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://attacker.example/collect'}});});
 const login=await call(redirected.env,'/api/auth/login',{method:'POST',body:{email:'student@example.com',password:'long-password'}});assert.equal(login.status,503);assert.equal(redirected.calls.length,1);assert.equal(redirected.calls[0].url.origin,providerOrigin);assert(!JSON.stringify(login.data).includes(redirected.env.PORTAL_SUPABASE_PUBLISHABLE_KEY));assert.equal(login.response.headers.getSetCookie().length,0);
});
