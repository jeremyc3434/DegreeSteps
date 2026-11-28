/** Private course data is always read/written using the verified student's JWT.
 * No service-role key, D1 fallback or browser-local copy of private course work. */
const learningStorageApi=(()=>{
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const ERRORS={
    revision_conflict:[409,'This work changed in another tab. Reload it before continuing.'],
    run_in_progress:[409,'This project is already being worked on. Open it again shortly.'],
    request_conflict:[409,'Start a new request for this project.'],
    workspace_limit:[409,'Your course workspace is full. Export and remove older work before adding more.'],
    write_limit:[429,'You made many workspace changes. Try again after the hourly limit resets.'],
    course_not_found:[404,'Course not found.'],project_not_found:[404,'Project not found.'],
    owner_mismatch:[403,'This sign-in session cannot open the requested work.'],
    owner_immutable:[403,'The owner of saved work cannot be changed.'],
    sign_in_required:[401,'Sign in to open your course workspace.'],
    confirmation_required:[400,'Type DELETE MY COURSE WORKSPACE to remove your course work.']
  };
  class StorageError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  const fail=(status,message,code)=>{throw new StorageError(status,message,code);};
  function actor(env){
    const user=env.PORTAL_USER;
    if(!user?.id)return null;
    if(typeof user.id!=='string'||!user.id.startsWith('sb-')||!UUID.test(user.id.slice(3)))fail(401,'Sign in to open your course workspace.','sign_in_required');
    return{id:user.id,uuid:user.id.slice(3).toLowerCase(),...(typeof user.displayName==='string'&&user.displayName.length<=80?{displayName:user.displayName}:{})};
  }
  function configuration(env){
    let url;try{url=new URL(String(env.PORTAL_SUPABASE_URL||''));}catch{fail(503,'Your course workspace is not connected yet.','storage_unavailable');}
    const key=String(env.PORTAL_SUPABASE_PUBLISHABLE_KEY||'').trim(),token=env.PORTAL_USER_ACCESS_TOKEN;
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||!key||key.length>4096||/[\r\n]/.test(key)||key.startsWith('sb_secret_'))fail(503,'Your course workspace is not connected yet.','storage_unavailable');
    if(!key.startsWith('sb_publishable_')){
      try{const claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(claims.role!=='anon')throw Error();}catch{fail(503,'Your course workspace needs a publishable API key.','storage_unavailable');}
    }
    if(typeof token!=='string'||!token||token.length>16384||/[\r\n]/.test(token))fail(503,'Your sign-in session needs to be refreshed.','storage_unavailable');
    return{url:url.origin,key,token};
  }
  async function jsonBody(response,limit=1500000){
    if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel();fail(503,'Private storage returned too much data.','storage_unavailable');}
    const reader=response.body?.getReader();if(!reader)fail(503,'Private storage could not be read.','storage_unavailable');
    const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>limit){await reader.cancel();fail(503,'Private storage returned too much data.','storage_unavailable');}value+=decoder.decode(chunk.value,{stream:true});}value+=decoder.decode();return JSON.parse(value);}catch(error){if(error instanceof StorageError)throw error;fail(503,'Private storage could not be read.','storage_unavailable');}
  }
  function errorFrom(response,data){
    const message=typeof data?.message==='string'?data.message:'';
    if(ERRORS[message])fail(ERRORS[message][0],ERRORS[message][1],message);
    if(response.status===401)fail(401,'Your sign-in expired. Sign in again to continue.','sign_in_required');
    if(response.status===403)fail(403,'This sign-in session cannot open the requested work.','owner_mismatch');
    if(['23502','23503','23505','23514','22P02','22023'].includes(data?.code))fail(400,'Some course or assignment details are invalid. Review them and try again.','invalid_workspace');
    fail(503,'Your course workspace is temporarily unavailable. Your work has not been replaced.','storage_unavailable');
  }
  async function request(env,path,{method='GET',body,limit}={}){
    const config=configuration(env),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const fetcher=env.LEARNING_DATA_FETCH||env.PORTAL_DATA_FETCH||fetch;
      const response=await fetcher(config.url+'/rest/v1/'+path,{method,headers:{apikey:config.key,Authorization:'Bearer '+config.token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,redirect:'manual'});
      if(response.status>=300&&response.status<400){await response.body?.cancel();fail(503,'Private storage redirected unexpectedly.','storage_unavailable');}
      const data=await jsonBody(response,limit);if(!response.ok)errorFrom(response,data);return data;
    }catch(error){if(error instanceof StorageError)throw error;fail(503,'Your course workspace is temporarily unavailable. Try again shortly.','storage_unavailable');}finally{clearTimeout(timer);}
  }
  function courseView(row){return{id:row.id,title:row.title,provider:row.provider,syllabus:row.syllabus,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};}
  function projectView(row){return{id:row.id,courseId:row.course_id,kind:row.kind,title:row.title,prompt:row.prompt,rubric:row.rubric,studentNotes:row.student_notes,sources:row.sources,artifact:row.artifact,status:row.status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,activeRunId:row.active_run_id||null,activeUntil:row.active_until||null,lastRunId:row.last_run_id||null};}
  async function list(env,table,user,extra='',select='*',limit=101){
    const rows=await request(env,table+'?user_id=eq.'+user.uuid+'&select='+encodeURIComponent(select)+'&order=updated_at.desc,id&limit='+limit+extra);
    if(!Array.isArray(rows))fail(503,'Private storage returned an invalid list.','storage_unavailable');
    if(rows.some(row=>row.user_id&&row.user_id!==user.uuid))fail(503,'Private storage returned an invalid owner.','storage_unavailable');return rows;
  }
  async function get(env,table,user,id){const rows=await list(env,table,user,'&id=eq.'+id,'*',1);if(!rows[0])fail(404,table.endsWith('courses')?'Course not found.':'Project not found.',table.endsWith('courses')?'course_not_found':'project_not_found');return rows[0];}
  async function mutate(env,operation,id=null,revision=null,data={}){const user=actor(env);if(!user)fail(401,'Sign in to open your course workspace.','sign_in_required');return request(env,'rpc/degreesteps_learning_mutate',{method:'POST',body:{p_actor_id:user.uuid,p_operation:operation,p_id:id,p_revision:revision,p_data:data}});}
  return{actor,configuration,request,list,get,mutate,courseView,projectView,StorageError};
})();

export function learningActor(env){return learningStorageApi.actor(env);}
export function learningStorageConfiguration(env){return learningStorageApi.configuration(env);}
export function learningCourseView(row){return learningStorageApi.courseView(row);}
export function learningProjectView(row){return learningStorageApi.projectView(row);}
export async function learningListCourses(env,user){return(await learningStorageApi.list(env,'degreesteps_learning_courses',user,'','id,title,provider,revision,created_at,updated_at',51)).map(learningStorageApi.courseView);}
export async function learningGetCourse(env,user,id){return learningStorageApi.courseView(await learningStorageApi.get(env,'degreesteps_learning_courses',user,id));}
export async function learningListProjects(env,user,courseId){return(await learningStorageApi.list(env,'degreesteps_learning_projects',user,courseId?'&course_id=eq.'+courseId:'','id,course_id,kind,title,status,revision,created_at,updated_at,active_run_id,active_until,last_run_id',101)).map(learningStorageApi.projectView);}
export async function learningGetProject(env,user,id){return learningStorageApi.projectView(await learningStorageApi.get(env,'degreesteps_learning_projects',user,id));}
export async function learningGetRun(env,user,id){const rows=await learningStorageApi.list(env,'degreesteps_learning_runs',user,'&id=eq.'+id,'*',1);return rows[0]||null;}
export async function learningProjectHistory(env,user,projectId){
  const rows=await learningStorageApi.list(env,'degreesteps_learning_runs',user,'&project_id=eq.'+projectId+'&status=eq.completed','id,project_id,action,status,created_at,updated_at',20);
  return rows.map(row=>({id:row.id,projectId:row.project_id,action:row.action,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}));
}
export async function learningCourseContext(env,user,courseId,excludeProjectId){
  const rows=await learningStorageApi.list(env,'degreesteps_learning_projects',user,'&course_id=eq.'+courseId+'&id=neq.'+excludeProjectId,'id,kind,title,student_notes,artifact_summary:artifact->>summary,artifact_checks:artifact->checks',4);
  return rows.map(row=>({id:row.id,kind:row.kind,title:String(row.title||'').slice(0,160),studentNotes:String(row.student_notes||'').slice(0,1500),previousAssistanceSummary:String(row.artifact_summary||'').slice(0,700),previousChecks:Array.isArray(row.artifact_checks)?row.artifact_checks.slice(0,3).map(check=>({label:String(check?.label||'').slice(0,120),status:['pass','review','missing'].includes(check?.status)?check.status:'review',detail:String(check?.detail||'').slice(0,400)})):[]}));
}
export async function learningMutate(env,operation,id,revision,data){return learningStorageApi.mutate(env,operation,id,revision,data);}
export async function learningProjectOwned(env,projectId){if(typeof projectId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId))return false;try{const user=learningStorageApi.actor(env);if(!user)return false;await learningStorageApi.get(env,'degreesteps_learning_projects',user,projectId);return true;}catch(error){if(error.status===404||error.status===401)return false;throw error;}}
