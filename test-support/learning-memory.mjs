/** Synthetic account/AI adapters for local learning tests. Never shipped to the Worker. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const learningTestOrigin='https://degreesteps.example';
export const learningTestAlice='11111111-1111-4111-8111-111111111111';
export const learningTestBob='22222222-2222-4222-8222-222222222222';
const clone=value=>JSON.parse(JSON.stringify(value));
export function learningTestD1(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const entry of journal.entries)sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
  t?.after(()=>sqlite.close());
  return{sqlite,prepare(sql){const stmt=sqlite.prepare(sql);return{bind(...values){return{first:async()=>stmt.get(...values)||null,all:async()=>({results:stmt.all(...values)}),run:async()=>({meta:{changes:Number(stmt.run(...values).changes)}})};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
export function learningMemoryStorage(){
  const courses=new Map(),projects=new Map(),runs=new Map(),calls=[],failBefore=new Map(),failAfter=new Map();let clock=100;
  const key=(owner,id)=>owner+':'+id;
  const error=(message,status=409)=>Response.json({message},{status});
  async function fetcher(url,options){
    const parsed=new URL(url),resource=parsed.pathname.split('/').at(-1),owner=options.headers.Authorization==='Bearer token-alice'?learningTestAlice:options.headers.Authorization==='Bearer token-bob'?learningTestBob:null;
    const body=options.body?JSON.parse(options.body):null;calls.push({url:parsed,options,body});if(!owner)return error('sign_in_required',401);
    if(resource!=='degreesteps_learning_mutate'){
      const table=resource==='degreesteps_learning_courses'?courses:resource==='degreesteps_learning_projects'?projects:resource==='degreesteps_learning_runs'?runs:null;
      if(!table)throw Error('Unexpected synthetic storage table '+resource);
      if(parsed.searchParams.get('user_id')!=='eq.'+owner)return Response.json([]);
      let rows=[...table.values()].filter(row=>row.user_id===owner);
      for(const field of['id','course_id','project_id','status']){const filter=parsed.searchParams.get(field);if(filter?.startsWith('eq.'))rows=rows.filter(row=>row[field]===filter.slice(3));if(filter?.startsWith('neq.'))rows=rows.filter(row=>row[field]!==filter.slice(4));}
      rows.sort((a,b)=>b.updated_at-a.updated_at||a.id.localeCompare(b.id));rows=rows.slice(0,Number(parsed.searchParams.get('limit'))||100);
      const select=parsed.searchParams.get('select');
      if(select&&select!=='*')rows=rows.map(row=>Object.fromEntries(select.split(',').map(field=>{if(field==='artifact_summary:artifact->>summary')return['artifact_summary',row.artifact?.summary??null];if(field==='artifact_checks:artifact->checks')return['artifact_checks',row.artifact?.checks??null];return[field,row[field]];})));
      return Response.json(clone(rows));
    }
    const op=body.p_operation,d=body.p_data||{},id=body.p_id,revision=body.p_revision;
    if(body.p_actor_id!==owner)return error('owner_mismatch',403);
    if(failBefore.has(op)){const fail=failBefore.get(op);failBefore.delete(op);if(fail instanceof Error)throw fail;return error(fail.message||'storage_failure',fail.status||503);}
    let out;
    const stamp=()=>++clock;
    if(op==='course_create'){const row={user_id:owner,id:randomUUID(),title:d.title,provider:d.provider||'',syllabus:d.syllabus||'',revision:1,created_at:stamp(),updated_at:clock};courses.set(key(owner,row.id),row);out=row;}
    else if(op==='project_create'){
      if(!courses.has(key(owner,d.courseId)))return error('course_not_found',404);
      const row={user_id:owner,id:randomUUID(),course_id:d.courseId,kind:d.kind,title:d.title,prompt:d.prompt,rubric:d.rubric||'',student_notes:d.studentNotes||'',sources:d.sources||[],artifact:null,status:'draft',active_run_id:null,active_until:null,last_run_id:null,revision:1,created_at:stamp(),updated_at:clock};projects.set(key(owner,row.id),row);out=row;
    }else if(op==='delete_all'){for(const table of[courses,projects,runs])for(const[k,row]of table)if(row.user_id===owner)table.delete(k);out={deleted:true};}
    else if(op.startsWith('course_')){
      const row=courses.get(key(owner,id));if(!row)return error('course_not_found',404);if(row.revision!==revision)return error('revision_conflict');
      if(op==='course_delete'){courses.delete(key(owner,id));for(const[k,p]of projects)if(p.user_id===owner&&p.course_id===id){projects.delete(k);for(const[rk,r]of runs)if(r.user_id===owner&&r.project_id===p.id)runs.delete(rk);}out={deleted:true};}
      else{Object.assign(row,d,{revision:row.revision+1,updated_at:stamp()});for(const p of projects.values())if(p.user_id===owner&&p.course_id===id)Object.assign(p,{status:'draft',revision:p.revision+1});out=row;}
    }else{
      const row=projects.get(key(owner,id));if(!row)return error('project_not_found',404);
      if(op==='run_claim'){
        const prior=runs.get(key(owner,d.requestId));
        if(prior?.status==='completed')out={project:row,run:prior,replayed:true};
        else{if(row.revision!==revision)return error('revision_conflict');if(row.active_until>Date.now())return error('run_in_progress');const run={user_id:owner,id:d.requestId,project_id:id,action:d.action,message:d.message||'',status:'working',artifact:null,created_at:stamp(),updated_at:clock};runs.set(key(owner,d.requestId),run);Object.assign(row,{status:'working',active_run_id:d.requestId,active_until:Date.now()+360000,revision:row.revision+1,updated_at:stamp()});out={project:row,replayed:false};}
      }else if(op==='run_finish'||op==='run_fail'){
        if(row.revision!==revision||row.active_run_id!==d.requestId)return error('revision_conflict');const run=runs.get(key(owner,d.requestId));if(!run)return error('request_conflict');
        if(op==='run_finish'){Object.assign(run,{status:'completed',artifact:d.artifact,updated_at:stamp()});Object.assign(row,{artifact:d.artifact,status:'ready',last_run_id:d.requestId});}
        else{Object.assign(run,{status:'failed',error_code:d.errorCode,updated_at:stamp()});row.status=row.artifact?'ready':'draft';}
        Object.assign(row,{active_run_id:null,active_until:null,revision:row.revision+1,updated_at:stamp()});out=row;
      }else{
        if(row.revision!==revision)return error('revision_conflict');if(row.active_until>Date.now())return error('run_in_progress');
        if(op==='project_delete'){projects.delete(key(owner,id));for(const[k,r]of runs)if(r.user_id===owner&&r.project_id===id)runs.delete(k);out={deleted:true};}
        else if(op==='project_update'){for(const[field,value]of Object.entries(d))row[field==='studentNotes'?'student_notes':field]=value;Object.assign(row,{status:'draft',revision:row.revision+1,updated_at:stamp()});out=row;}
        else throw Error('Unexpected synthetic mutation '+op);
      }
    }
    if(failAfter.has(op)){const fail=failAfter.get(op);failAfter.delete(op);throw fail;}
    return Response.json(clone(out));
  }
  return{courses,projects,runs,calls,fetcher,failBefore,failAfter,key};
}
export function learningProviderFixture({artifact,usage}={}){
  const calls=[];let override=null;
  const fetcher=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,options,body});if(override)return override(url,options,body);
    if(body.tools)return Response.json({stop_reason:'end_turn',content:[{type:'web_search_tool_result',tool_use_id:'search-1',content:[{type:'web_search_result',url:'https://www.cdc.gov/example-study',title:'Synthetic primary source',encrypted_content:'synthetic-not-an-api-key'}]},{type:'text',text:'Synthetic search summary.',citations:[{type:'web_search_result_location',url:'https://www.cdc.gov/example-study',title:'Synthetic primary source',cited_text:'The supplied synthetic source explains the concept using a practical example.'}]}],usage:{input_tokens:200,output_tokens:100,server_tool_use:{web_search_requests:1}}});
    const context=JSON.parse(body.messages[0].content),action=context.action;
    const value=artifact||{summary:'A useful next step for this assignment.',content:'A worked explanation using the student’s ideas.'+(context.sources.length?' Evidence is connected to this explanation ['+context.sources[0].id+'].':''),questions:[{id:'q1',question:'Which recommendation would you make?',why:'Your reasoning shapes the argument.'}],checks:[{label:'Evidence',status:'review',detail:'Review how each source supports the argument.'}],nextStep:'Develop your recommendation with one example.',quiz:action==='quiz'?[{question:'Which choice follows the worked method?',choices:['Apply the method','Guess'],answerIndex:0,explanation:'Apply the demonstrated reasoning.'}]:[],flashcards:action==='flashcards'?[{front:'What is the concept?',back:'The concept explained in context.'}]:[],slides:action==='presentation'?[{title:'Recommendation',bullets:['Explain the recommendation'],speakerNotes:'Use the student’s example.'}]:[]};
    return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],usage:usage||{input_tokens:1000,output_tokens:500}});
  };
  return{calls,fetcher,setOverride:value=>{override=value;}};
}
