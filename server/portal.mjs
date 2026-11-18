import { handlePortalPostgres } from './portal-postgres.mjs';
/** Private degree-plan API. The Worker supplies verified identity, never a request body. */
const portalApi = (() => {
  const PREFIX='/api/portal', MAX_PLANS=10, MAX_STATE_BYTES=524288, MAX_REQUEST_BYTES=MAX_STATE_BYTES+4096;
  const LIMITS={save:60,profile:20,delete:40}, WINDOW=60*60*1000;
  const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/;
  class ApiError extends Error {constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new ApiError(status,message,code);};
  const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const first=(db,sql,...values)=>stmt(db,sql,...values).first();
  const run=(db,sql,...values)=>stmt(db,sql,...values).run();
  const all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[];
  const changes=result=>result?.meta?.changes??result?.changes??0;
  const limits=()=>({maxPlans:MAX_PLANS,maxStateBytes:MAX_STATE_BYTES});
  function json(body,status=200) {return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization, oai-authenticated-user-id'
  }});}
  function object(value,name='Payload') {if(!value||typeof value!=='object'||Array.isArray(value))fail(400,name+' must be an object.');return value;}
  function only(value,keys) {object(value);if(Object.keys(value).some(k=>!keys.includes(k)))fail(400,'Payload contains unsupported fields.');}
  function text(value,name,min,max) {
    if(typeof value!=='string')fail(400,name+' must be text.');
    const clean=value.trim(),length=Array.from(clean).length;
    if(length<min||length>max||/[\u0000-\u001f\u007f]/.test(clean))fail(400,name+' must be '+min+'–'+max+' characters.');
    return clean;
  }
  function identity(request,env) {
    let raw;
    if(env.PORTAL_USER!==undefined)raw=env.PORTAL_USER?.id;
    else if(env.PORTAL_AUTH_REQUIRED===true||env.PORTAL_AUTH_REQUIRED==='true')return null;
    else raw=request.headers.get('oai-authenticated-user-id');
    if(raw===undefined||raw===null||raw==='')return null;
    if(typeof raw!=='string'||raw.length>256||raw.trim()!==raw||/[\u0000-\u001f\u007f]/.test(raw))fail(401,'Invalid sign-in identity.');
    const name=env.PORTAL_USER?.displayName;
    const displayName=typeof name==='string'&&name.trim()&&Array.from(name).length<=80&&!/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(name)?name:null;
    return {id:raw,...(displayName?{displayName}:{})};
  }
  function protectWrite(request) {
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('X-Portal-Request')!=='1')fail(403,'Use the same-origin DegreeSteps portal form.');
    const site=request.headers.get('sec-fetch-site');
    if(site&&!['same-origin','none'].includes(site))fail(403,'Cross-origin writes are not allowed.');
  }
  async function payload(request) {
    if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.');
    const declared=request.headers.get('content-length');
    if(declared&&Number(declared)>MAX_REQUEST_BYTES)fail(413,'Request is too large. Keep each saved plan under 512 KB.');
    const reader=request.body?.getReader();if(!reader)fail(400,'Send a JSON request body.');
    const decoder=new TextDecoder();let body='',bytes=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_REQUEST_BYTES){await reader.cancel();fail(413,'Request is too large. Keep each saved plan under 512 KB.');}body+=decoder.decode(chunk.value,{stream:true});}
    body+=decoder.decode();
    try{return object(JSON.parse(body));}catch(error){if(error instanceof ApiError)throw error;fail(400,'Invalid JSON.');}
  }
  function revision(value) {if(!Number.isSafeInteger(value)||value<1)fail(400,'Include the current saved-plan revision.');return value;}
  function planId(value) {if(typeof value!=='string'||!ID.test(value))fail(400,'Invalid plan ID.');return value;}
  function state(value) {
    object(value,'Plan state');
    if(value.version!==3||!value.profile||typeof value.profile!=='object'||Array.isArray(value.profile)||!Array.isArray(value.learning))fail(400,'Use a current DegreeSteps draft with a profile and original learning records.');
    if(value.learning.length>2000)fail(400,'A saved plan can include at most 2,000 learning records.');
    let nodes=0;
    function inspect(item,depth=0) {
      if(depth>30||++nodes>50000)fail(400,'The plan structure is too complex.');
      if(item===null||typeof item==='boolean'||typeof item==='string')return;
      if(typeof item==='number'){if(!Number.isFinite(item))fail(400,'Plan numbers must be finite.');return;}
      if(typeof item!=='object')fail(400,'The plan must contain JSON values.');
      if(Array.isArray(item)){for(const child of item)inspect(child,depth+1);return;}
      for(const [key,child]of Object.entries(item)){
        if(key.length>256||['__proto__','prototype','constructor'].includes(key))fail(400,'The plan contains an unsupported field.');
        inspect(child,depth+1);
      }
    }
    inspect(value);
    const encoded=JSON.stringify(value);
    if(new TextEncoder().encode(encoded).byteLength>MAX_STATE_BYTES)fail(413,'This plan is larger than 512 KB. Keep a private backup and reduce its size before saving to your account.');
    return {encoded,school:text(value.profile.school||value.profile.schoolChoice||'','School',0,120),degree:text(value.profile.degree||'','Degree',0,200)};
  }
  async function profile(db,user) {
    let row=await first(db,'SELECT id,alias,created_at,updated_at FROM portal_profiles WHERE id=?',user.id);
    if(!row){
      const stamp=Date.now();
      await run(db,'INSERT INTO portal_profiles (id,alias,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',user.id,'Student',stamp,stamp);
      row=await first(db,'SELECT id,alias,created_at,updated_at FROM portal_profiles WHERE id=?',user.id);
    }
    return {id:row.id,alias:row.alias,createdAt:row.created_at,updatedAt:row.updated_at,...(user.displayName?{displayName:user.displayName}:{})};
  }
  async function rate(db,user,action) {
    const stamp=Math.floor(Date.now()/WINDOW)*WINDOW;
    const result=await run(db,`INSERT INTO portal_rate_limits (user_id,action,window_start,count) VALUES (?,?,?,1)
      ON CONFLICT(user_id,action) DO UPDATE SET count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END,
      window_start=excluded.window_start WHERE portal_rate_limits.window_start!=excluded.window_start OR portal_rate_limits.count<?`,user.id,action,stamp,LIMITS[action]);
    if(!changes(result))fail(429,'Too many account changes. Try again after the hourly limit resets.');
  }
  function planView(row,includeState=false) {return {id:row.id,title:row.title,school:row.school,degree:row.degree,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,...(includeState?{state:JSON.parse(row.state_json)}:{})};}
  async function ownedPlan(db,user,id) {
    const row=await first(db,'SELECT * FROM portal_plans WHERE id=? AND user_id=?',id,user.id);
    if(!row)fail(404,'Saved plan not found.');return row;
  }
  async function handle(request,env) {
    const url=new URL(request.url),path=url.pathname.slice(PREFIX.length),method=request.method;
    const user=identity(request,env);
    if(method==='GET'&&path==='/session'&&!user)return json({user:null,limits:limits(),authConfigured:env.PORTAL_AUTH_CONFIGURED===true,provider:'email-google'});
    if(!user)fail(401,'Sign in to open your private portal.');
    if(!env.DB)fail(503,'Private account storage is not configured.');
    if(!['GET','POST','PATCH','PUT','DELETE'].includes(method))fail(405,'Method not allowed.');
    if(method!=='GET')protectWrite(request);
    const body=method==='GET'?null:await payload(request);
    const account=await profile(env.DB,user);
    if(path==='/session'&&method==='GET')return json({user:account,limits:limits(),authConfigured:env.PORTAL_AUTH_CONFIGURED===true,provider:'email-google'});
    if(path==='/profile') {
      if(method==='GET')return json({user:account});
      if(method==='PATCH'){
        only(body,['alias']);const alias=text(body.alias,'Display name',2,60);await rate(env.DB,user,'profile');
        await run(env.DB,'UPDATE portal_profiles SET alias=?,updated_at=? WHERE id=?',alias,Date.now(),user.id);
        return json({user:await profile(env.DB,user)});
      }
      if(method==='DELETE'){
        only(body,['confirmation']);if(body.confirmation!=='DELETE MY PORTAL DATA')fail(400,'Type DELETE MY PORTAL DATA to delete your private portal records.');
        await rate(env.DB,user,'delete');
        const stamp=Date.now(),collegeCleanup=env.COLLEGE_ACCESS_ENABLED===true?[
          stmt(env.DB,"INSERT INTO college_access_audit (id,actor_id,action,target_id,note,organization_id,created_at) SELECT lower(hex(randomblob(16))),?,'withdraw',id,'Portal data deleted',organization_id,? FROM college_interest_requests WHERE user_id=? AND withdrawn_at IS NULL",user.id,stamp,user.id),
          stmt(env.DB,'UPDATE college_interest_requests SET withdrawn_at=?,updated_at=? WHERE user_id=? AND withdrawn_at IS NULL',stamp,stamp,user.id)
        ]:[];
        await env.DB.batch([
          ...collegeCleanup,
          stmt(env.DB,'DELETE FROM portal_plans WHERE user_id=?',user.id),
          stmt(env.DB,'DELETE FROM portal_rate_limits WHERE user_id=?',user.id),
          stmt(env.DB,'DELETE FROM portal_profiles WHERE id=?',user.id)
        ]);
        return json({deleted:true,scope:'portal'});
      }
      fail(405,'Method not allowed.');
    }
    if(path==='/plans') {
      if(method==='GET')return json({items:(await all(env.DB,'SELECT id,title,school,degree,revision,created_at,updated_at FROM portal_plans WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 10',user.id)).map(row=>planView(row))});
      if(method==='POST') {
        only(body,['title','state','consent']);if(body.consent!==true)fail(400,'Confirm that you want to save this private device draft to your account.','consent_required');
        const title=text(body.title,'Plan name',1,120),data=state(body.state),id=crypto.randomUUID(),stamp=Date.now();await rate(env.DB,user,'save');
        const result=await run(env.DB,`INSERT INTO portal_plans (id,user_id,title,school,degree,state_json,revision,created_at,updated_at)
          SELECT ?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM portal_plans WHERE user_id=?)<?`,id,user.id,title,data.school,data.degree,data.encoded,stamp,stamp,user.id,MAX_PLANS);
        if(!changes(result))fail(409,'You have 10 saved plans. Remove a plan before saving another.','plan_limit');
        return json({item:planView(await ownedPlan(env.DB,user,id),true)},201);
      }
      fail(405,'Method not allowed.');
    }
    const match=path.match(/^\/plans\/([^/]+)$/);
    if(match) {
      let id;try{id=planId(decodeURIComponent(match[1]));}catch(error){if(error instanceof ApiError)throw error;fail(400,'Invalid plan ID.');}
      if(method==='GET')return json({item:planView(await ownedPlan(env.DB,user,id),true)});
      if(method==='PUT') {
        only(body,['title','state','revision']);const current=revision(body.revision),title=text(body.title,'Plan name',1,120),data=state(body.state);
        await ownedPlan(env.DB,user,id);await rate(env.DB,user,'save');
        const result=await run(env.DB,'UPDATE portal_plans SET title=?,school=?,degree=?,state_json=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?',title,data.school,data.degree,data.encoded,Date.now(),id,user.id,current);
        if(!changes(result))fail(409,'This account copy changed on another device. Reload it before saving your changes.','revision_conflict');
        return json({item:planView(await ownedPlan(env.DB,user,id),true)});
      }
      if(method==='DELETE') {
        only(body,['revision']);const current=revision(body.revision);await ownedPlan(env.DB,user,id);await rate(env.DB,user,'delete');
        const result=await run(env.DB,'DELETE FROM portal_plans WHERE id=? AND user_id=? AND revision=?',id,user.id,current);
        if(!changes(result))fail(409,'This account copy changed on another device. Reload it before deleting.','revision_conflict');
        return json({deleted:true,id});
      }
      fail(405,'Method not allowed.');
    }
    fail(404,'Portal endpoint not found.');
  }
  return async(request,env={})=>{
    try{return await handle(request,env);}catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);return json({error:'Private account storage is temporarily unavailable. Try again; your device draft has not been changed.'},500);}
  };
})();

export async function handlePortal(request,env={}) {
  if(env.PORTAL_STORAGE_BACKEND==='supabase')return handlePortalPostgres(request,env);
  if(env.PORTAL_STORAGE_BACKEND&&!['d1',''].includes(env.PORTAL_STORAGE_BACKEND))return new Response(JSON.stringify({error:'Private account storage is not configured.',code:'storage_not_configured'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
  return portalApi(request,env);
}
