/** Supabase Postgres private storage. Requests retain the verified user's JWT and RLS. */
const portalPostgresApi=(()=>{
  const PREFIX='/api/portal',MAX_PLANS=10,MAX_STATE_BYTES=524288,MAX_REQUEST_BYTES=528384,MAX_RESPONSE_BYTES=1048576;
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/;
  class ApiError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new ApiError(status,message,code);};
  function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}});}
  function object(value,name='Payload'){if(!value||typeof value!=='object'||Array.isArray(value))fail(400,name+' must be an object.');return value;}
  function only(value,keys){object(value);if(Object.keys(value).some(key=>!keys.includes(key)))fail(400,'Payload contains unsupported fields.');}
  function text(value,name,min,max){if(typeof value!=='string')fail(400,name+' must be text.');const clean=value.trim(),length=Array.from(clean).length;if(length<min||length>max||/[\u0000-\u001f\u007f]/.test(clean))fail(400,name+' must be '+min+'–'+max+' characters.');return clean;}
  function id(value){if(typeof value!=='string'||!ID.test(value))fail(400,'Invalid plan ID.');return value;}
  function revision(value){if(!Number.isSafeInteger(value)||value<1)fail(400,'Include the current saved-plan revision.');return value;}
  function protectWrite(request){if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Portal-Request')!=='1')fail(403,'Use the same-origin DegreeSteps portal form.');const site=request.headers.get('Sec-Fetch-Site');if(site&&!['same-origin','none'].includes(site))fail(403,'Cross-origin writes are not allowed.');}
  async function boundedJSON(response,limit,requestBody=false){
    const declared=Number(response.headers.get('Content-Length'));if(declared>limit){await response.body?.cancel();fail(requestBody?413:503,requestBody?'Request is too large.':'Private storage returned an invalid response.',requestBody?'request_too_large':'storage_unavailable');}
    const reader=response.body?.getReader();if(!reader)fail(requestBody?400:503,requestBody?'Send a JSON request body.':'Private storage returned an invalid response.');
    const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,body='';
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){await reader.cancel();fail(requestBody?413:503,requestBody?'Request is too large. Keep each saved plan under 512 KB.':'Private storage returned an oversized response.');}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();return JSON.parse(body);}catch(error){if(error instanceof ApiError)throw error;fail(requestBody?400:503,requestBody?'Invalid JSON.':'Private storage returned an invalid response.');}
  }
  async function payload(request){if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.');return object(await boundedJSON(request,MAX_REQUEST_BYTES,true));}
  function validateState(value){
    object(value,'Plan state');if(value.version!==3||!value.profile||typeof value.profile!=='object'||Array.isArray(value.profile)||!Array.isArray(value.learning))fail(400,'Use a current DegreeSteps draft with a profile and original learning records.');
    if(value.learning.length>2000)fail(400,'A saved plan can include at most 2,000 learning records.');let nodes=0;
    function inspect(item,depth=0){if(depth>30||++nodes>50000)fail(400,'The plan structure is too complex.');if(item===null||typeof item==='boolean'||typeof item==='string')return;if(typeof item==='number'){if(!Number.isFinite(item))fail(400,'Plan numbers must be finite.');return;}if(typeof item!=='object')fail(400,'The plan must contain JSON values.');if(Array.isArray(item)){for(const child of item)inspect(child,depth+1);return;}for(const[key,child]of Object.entries(item)){if(key.length>256||['__proto__','prototype','constructor'].includes(key))fail(400,'The plan contains an unsupported field.');inspect(child,depth+1);}}
    inspect(value);if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_STATE_BYTES)fail(413,'This plan is larger than 512 KB. Keep a private backup and reduce its size before saving to your account.');
    text(value.profile.school||value.profile.schoolChoice||'','School',0,120);text(value.profile.degree||'','Degree',0,200);return value;
  }
  function actor(env){
    const user=env.PORTAL_USER;if(!user?.id)return null;
    if(typeof user.id!=='string'||!user.id.startsWith('sb-')||!UUID.test(user.id.slice(3)))fail(401,'Sign in to your verified account before opening private plans.');
    return{id:user.id,uuid:user.id.slice(3).toLowerCase()};
  }
  function configuration(env,user){
    let url;try{url=new URL(String(env.PORTAL_SUPABASE_URL||''));}catch{fail(503,'Private account storage is not configured.','storage_not_configured');}
    const key=String(env.PORTAL_SUPABASE_PUBLISHABLE_KEY||'').trim(),token=env.PORTAL_USER_ACCESS_TOKEN;
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||!key||key.length>4096||/[\r\n]/.test(key)||key.startsWith('sb_secret_'))fail(503,'Private account storage is not configured.','storage_not_configured');
    if(!key.startsWith('sb_publishable_')){
      try{const claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(claims.role!=='anon')throw Error();}catch{fail(503,'Use a publishable API key for private account storage.','storage_not_configured');}
    }
    if(!user||typeof token!=='string'||!token||token.length>16384||/[\r\n]/.test(token))fail(503,'Private account storage needs the verified sign-in session.','storage_not_configured');
    return{url:url.origin,key,token};
  }
  function storageError(status,data){
    const code=typeof data?.message==='string'?data.message:'';
    const messages={revision_conflict:[409,'This account copy changed on another device. Reload it before saving or deleting.'],migration_source_changed:[409,'The older account copy changed. Review the latest migration details before trying again.'],plan_limit:[409,'You have 10 saved plans. Remove a plan before saving another.'],plan_not_found:[404,'Saved plan not found.'],consent_required:[400,'Confirm that you want to save this private draft to your account.'],confirmation_required:[400,'Type DELETE MY PORTAL DATA to delete your private portal records.'],write_limit:[429,'Too many account changes. Try again after the hourly limit resets.'],owner_mismatch:[403,'This sign-in session does not own the requested account.'],sign_in_required:[401,'Sign in to open your private portal.'],invalid_migration:[400,'Review the older account copies before migrating.'],invalid_page:[400,'Choose a valid saved-plan page.']};
    if(messages[code])fail(messages[code][0],messages[code][1],code);
    if(status===401)fail(401,'Your sign-in session has expired. Sign in again.','sign_in_required');
    if(status===403)fail(403,'This sign-in session cannot open the requested account.','owner_mismatch');
    if(data?.code==='23514'&&String(data.message).includes('state_check'))fail(413,'The stored plan exceeds the 512 KB storage limit.','state_too_large');
    if(['23502','23514','22P02','22023','23505'].includes(data?.code))fail(400,'The saved-plan data is invalid. Review the draft and try again.','invalid_plan');
    fail(503,'Private account storage is temporarily unavailable. Your device draft and older account copies have not been changed.','storage_unavailable');
  }
  async function rpc(env,config,user,name,body={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response;
    try{
      const fetcher=typeof env.PORTAL_DATA_FETCH==='function'?env.PORTAL_DATA_FETCH:fetch;
      // Workers supports manual/follow only. Never follow a redirect with the student's JWT.
      response=await fetcher(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_actor_id:user.uuid,...body}),redirect:'manual',signal:controller.signal});
      if(response.status>=300&&response.status<400){await response.body?.cancel();fail(503,'Private account storage is temporarily unavailable. Your device draft and older account copies have not been changed.','storage_unavailable');}
      const data=await boundedJSON(response,MAX_RESPONSE_BYTES);if(!response.ok)storageError(response.status,data);return data;
    }catch(error){if(error instanceof ApiError)throw error;fail(503,'Private account storage is temporarily unavailable. Your device draft and older account copies have not been changed.','storage_unavailable');}finally{clearTimeout(timer);}
  }
  const statement=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const first=(db,sql,...values)=>statement(db,sql,...values).first();
  async function shadowIdentity(env,user){
    if(!env.DB)return;const existing=await first(env.DB,'SELECT id FROM portal_profiles WHERE id=?',user.id);if(existing)return;
    const stamp=Date.now();await statement(env.DB,'INSERT INTO portal_profiles (id,alias,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',user.id,'Student',stamp,stamp).run();
  }
  async function account(env,config,user){const value=await rpc(env,config,user,'degreesteps_profile_get');if(value?.id!==user.id)fail(503,'Private storage returned an invalid account.','storage_unavailable');await shadowIdentity(env,user);return value;}
  function metadata(row){return{id:row.id,title:row.title,school:row.school||'',degree:row.degree||'',revision:row.revision,createdAt:row.createdAt??row.created_at,updatedAt:row.updatedAt??row.updated_at};}
  function cursor(value){if(!value)return null;try{if(value.length>400)throw Error();const parsed=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));if(!Array.isArray(parsed)||parsed.length!==2||!Number.isSafeInteger(parsed[0])||parsed[0]<0||typeof parsed[1]!=='string'||!ID.test(parsed[1]))throw Error();return parsed;}catch{fail(400,'Choose a valid saved-plan page.');}}
  const encodeCursor=row=>btoa(JSON.stringify([row.updatedAt,row.id])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  async function legacySnapshot(env,user){
    if(!env.DB)fail(503,'Older account storage could not be checked. Your saved plans have not been changed.','legacy_unavailable');
    let profile,rows;try{profile=await first(env.DB,'SELECT alias,created_at,updated_at FROM portal_profiles WHERE id=?',user.id);rows=(await statement(env.DB,'SELECT id,title,school,degree,state_json,revision,created_at,updated_at FROM portal_plans WHERE user_id=? ORDER BY id LIMIT 11',user.id).all()).results||[];}catch{fail(503,'Older account storage could not be checked. Your saved plans have not been changed.','legacy_unavailable');}
    if(rows.length>10)fail(409,'Your older account has more than 10 plans. Download its backup before choosing which copies to move.','legacy_plan_limit');
    const alias=text(profile?.alias||'Student','Display name',2,60),items=rows.map(row=>{let state;try{state=JSON.parse(row.state_json);}catch{fail(409,'An older saved plan needs recovery. Download a backup before changing it.','legacy_invalid');}validateState(state);return{...metadata(row),state};});
    const fingerprint=JSON.stringify({version:1,owner:user.id,alias,profileUpdatedAt:profile?.updated_at||0,items:rows.map(row=>({id:row.id,title:row.title,school:row.school,degree:row.degree,stateJson:row.state_json,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}))});
    const manifest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),byte=>byte.toString(16).padStart(2,'0')).join('');
    return{alias,items,manifest,revisions:items.map(item=>({id:item.id,revision:item.revision})).sort((a,b)=>a.id.localeCompare(b.id))};
  }
  async function migration(request,env,config,user,path,body){
    if(request.method==='GET'){
      const snapshot=await legacySnapshot(env,user);
      if(path==='/migration/backup')return json({source:'legacy-d1',exportedAt:Date.now(),profile:{alias:snapshot.alias},manifest:snapshot.manifest,items:snapshot.items});
      const marker=await rpc(env,config,user,'degreesteps_migration_status');
      const changed=marker&&marker.manifest!==snapshot.manifest,complete=marker&&!changed,available=!marker&&(snapshot.items.length>0||snapshot.alias!=='Student');
      return json({source:'legacy-d1',status:changed?'conflict':complete?'complete':available?'available':'empty',available,migrated:!!marker,manifest:snapshot.manifest,profile:{alias:snapshot.alias},items:snapshot.items.map(metadata),...(changed?{message:'The older account copy changed after migration. Keep a backup and review both copies before making further changes.'}:{})});
    }
    if(request.method!=='POST'||path!=='/migration')fail(405,'Method not allowed.');
    only(body,['consent','manifest','revisions']);if(body.consent!==true)fail(400,'Confirm that you want to move these older private plans to your account.','consent_required');
    if(typeof body.manifest!=='string'||!/^[a-f0-9]{64}$/.test(body.manifest)||!Array.isArray(body.revisions)||body.revisions.length>10)fail(400,'Review the older account copies before migrating.');
    const supplied=body.revisions.map(item=>{only(item,['id','revision']);return{id:id(item.id),revision:revision(item.revision)};}).sort((a,b)=>a.id.localeCompare(b.id));
    const snapshot=await legacySnapshot(env,user);
    if(body.manifest!==snapshot.manifest||JSON.stringify(supplied)!==JSON.stringify(snapshot.revisions))fail(409,'The older account copy changed. Review the latest migration details before trying again.','migration_source_changed');
    // Re-read the source immediately before the target transaction; the selected backend freezes legacy writes.
    const checked=await legacySnapshot(env,user);if(checked.manifest!==snapshot.manifest)fail(409,'The older account copy changed. Review the latest migration details before trying again.','migration_source_changed');
    const result=await rpc(env,config,user,'degreesteps_migrate_legacy',{p_manifest:snapshot.manifest,p_alias:snapshot.alias,p_items:snapshot.items,p_consent:true});
    return json({migrated:true,source:'legacy-d1',...result});
  }
  async function legacyDeletion(env,user){
    if(!env.DB)return;const stamp=Date.now(),cleanup=env.COLLEGE_ACCESS_ENABLED===true?[
      statement(env.DB,"INSERT INTO college_access_audit (id,actor_id,action,target_id,note,organization_id,created_at) SELECT lower(hex(randomblob(16))),?,'withdraw',id,'Portal data deleted',organization_id,? FROM college_interest_requests WHERE user_id=? AND withdrawn_at IS NULL",user.id,stamp,user.id),
      statement(env.DB,'UPDATE college_interest_requests SET withdrawn_at=?,updated_at=? WHERE user_id=? AND withdrawn_at IS NULL',stamp,stamp,user.id)
    ]:[];
    try{await env.DB.batch([...cleanup,statement(env.DB,'DELETE FROM portal_plans WHERE user_id=?',user.id),statement(env.DB,'DELETE FROM portal_rate_limits WHERE user_id=?',user.id),statement(env.DB,'DELETE FROM portal_profiles WHERE id=?',user.id)]);}catch{fail(503,'Older copies and college-sharing permissions could not be removed. Try again to finish deleting your portal data.','deletion_incomplete');}
  }
  async function handle(request,env){
    const url=new URL(request.url),path=url.pathname.slice(PREFIX.length),method=request.method,user=actor(env),limits={maxPlans:MAX_PLANS,maxStateBytes:MAX_STATE_BYTES};
    if(method==='GET'&&path==='/session'&&!user)return json({user:null,limits,authConfigured:env.PORTAL_AUTH_CONFIGURED===true,provider:'email-google',storageBackend:'supabase'});
    if(!user)fail(401,'Sign in to open your private portal.');const config=configuration(env,user);
    if(!['GET','POST','PATCH','PUT','DELETE'].includes(method))fail(405,'Method not allowed.');let body=null;if(method!=='GET'){protectWrite(request);body=await payload(request);}
    if(path==='/session'&&method==='GET')return json({user:await account(env,config,user),limits,authConfigured:env.PORTAL_AUTH_CONFIGURED===true,provider:'email-google',storageBackend:'supabase'});
    if(path==='/migration'||path==='/migration/backup')return migration(request,env,config,user,path,body);
    if(path==='/profile'){
      if(method==='GET')return json({user:await account(env,config,user)});
      if(method==='PATCH'){only(body,['alias']);const alias=text(body.alias,'Display name',2,60);return json({user:await rpc(env,config,user,'degreesteps_profile_update',{p_alias:alias})});}
      if(method==='DELETE'){
        only(body,['confirmation']);if(body.confirmation!=='DELETE MY PORTAL DATA')fail(400,'Type DELETE MY PORTAL DATA to delete your private portal records.');
        await legacyDeletion(env,user);
        try{return json(await rpc(env,config,user,'degreesteps_portal_delete',{p_confirmation:body.confirmation}));}catch(error){fail(error.status===429?429:503,'Older copies and college-sharing permissions were removed. Retry to finish deleting your private account plans.','deletion_incomplete');}
      }
      fail(405,'Method not allowed.');
    }
    if(path==='/plans'){
      if(method==='GET'){
        if([...url.searchParams.keys()].some(key=>!['limit','cursor'].includes(key))||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))fail(400,'Choose a valid saved-plan page.');
        const raw=url.searchParams.get('limit')||'10';if(!/^\d{1,2}$/.test(raw)||Number(raw)<1||Number(raw)>10)fail(400,'Limit must be between 1 and 10.');const limit=Number(raw),before=cursor(url.searchParams.get('cursor'));
        const items=await rpc(env,config,user,'degreesteps_plan_list',{p_limit:limit+1,p_before_updated_at:before?.[0]??null,p_before_id:before?.[1]??null});
        if(!Array.isArray(items)||items.length>11)fail(503,'Private storage returned an invalid plan list.','storage_unavailable');const page=items.slice(0,limit).map(metadata);return json({items:page,cursor:items.length>limit?encodeCursor(page.at(-1)):null});
      }
      if(method==='POST'){only(body,['title','state','consent']);if(body.consent!==true)fail(400,'Confirm that you want to save this private device draft to your account.','consent_required');const title=text(body.title,'Plan name',1,120),state=validateState(body.state);return json({item:await rpc(env,config,user,'degreesteps_plan_save',{p_id:crypto.randomUUID(),p_title:title,p_state:state,p_revision:null,p_consent:true})},201);}
      fail(405,'Method not allowed.');
    }
    const match=path.match(/^\/plans\/([^/]+)$/);if(match){let planId;try{planId=id(decodeURIComponent(match[1]));}catch{fail(400,'Invalid plan ID.');}
      if(method==='GET')return json({item:await rpc(env,config,user,'degreesteps_plan_get',{p_id:planId})});
      if(method==='PUT'){only(body,['title','state','revision']);const current=revision(body.revision),title=text(body.title,'Plan name',1,120),state=validateState(body.state);return json({item:await rpc(env,config,user,'degreesteps_plan_save',{p_id:planId,p_title:title,p_state:state,p_revision:current,p_consent:false})});}
      if(method==='DELETE'){only(body,['revision']);return json(await rpc(env,config,user,'degreesteps_plan_delete',{p_id:planId,p_revision:revision(body.revision)}));}
      fail(405,'Method not allowed.');
    }
    fail(404,'Portal endpoint not found.');
  }
  return async(request,env={})=>{try{return await handle(request,env);}catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);return json({error:'Private account storage is temporarily unavailable. Your device draft and older account copies have not been changed.',code:'storage_unavailable'},503);}};
})();
export async function handlePortalPostgres(request,env){return portalPostgresApi(request,env);}
