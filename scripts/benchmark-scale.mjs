/** Local synthetic scale evidence against the built Worker. Never contacts a service. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import os from 'node:os';

const ROOT=resolve(import.meta.dirname,'..'),ORIGIN='https://scale.synthetic.invalid',AUTH_ORIGIN='https://identity.synthetic.invalid';
export const defaults=Object.freeze({students:1000,plansPerStudent:10,posts:5000,reactionsPerPost:10,commentsPerPost:2,samples:100,warmup:10,saveRaces:24,reactionCycles:20});
const copy=value=>JSON.parse(JSON.stringify(value));
export const syntheticUUID=index=>'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0');
export const ownerId=index=>'sb-'+syntheticUUID(index);
export const planId=(student,slot=0)=>'scale-plan-'+String(student).padStart(5,'0')+'-'+slot;
const postId=index=>'scale-post-'+String(index).padStart(7,'0');
const compact=sql=>sql.replace(/\s+/g,' ').trim();
export function distribution(values){const sorted=[...values].sort((a,b)=>a-b),at=fraction=>sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*fraction)-1))]||0;return{samples:values.length,min:sorted[0]||0,median:at(.5),p95:at(.95),max:sorted.at(-1)||0};}
function memory(){const value=process.memoryUsage();return{rssBytes:value.rss,heapUsedBytes:value.heapUsed,heapTotalBytes:value.heapTotal,externalBytes:value.external,arrayBuffersBytes:value.arrayBuffers};}
export function syntheticState(student,slot=0,tag='seed'){
  return{version:3,profile:{school:'Example Benchmark University',degree:'Synthetic undergraduate route '+slot,hasPrior:'some',syntheticOwner:student},selectedPathwayId:'synthetic-benchmark-route',learning:Array.from({length:18},(_,index)=>({id:'synthetic-course-'+index,provider:index%2?'Example Original College':'Sophia',code:'BENCH'+index,title:'Synthetic original course '+index,credits:3,creditSystem:'semester',status:index<9?'earned':'saved',completedOn:index<9?'2025-05-01':'',evaluations:[]})),scenarios:{},sheet:{isExample:false,notes:{private:'SYNTHETIC-PRIVATE-OWNER-'+student+' '+'.'.repeat(256)}},checklist:{version:1,plans:{}},saveTag:tag};
}

export class LocalD1 {
  constructor(){
    this.sqlite=new DatabaseSync(':memory:');this.events=[];this.failNext=false;this.requests=new AsyncLocalStorage();
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const journal=JSON.parse(readFileSync(resolve(ROOT,'drizzle/meta/_journal.json'),'utf8'));
    this.migrations=journal.entries.map(entry=>entry.tag);
    for(const tag of this.migrations)this.sqlite.exec(readFileSync(resolve(ROOT,'drizzle',tag+'.sql'),'utf8'));
  }
  prepare(sql){
    if(this.failNext){this.failNext=false;throw Error('Synthetic local database failure');}
    assert.doesNotMatch(sql,/^\s*(?:CREATE|ALTER|DROP|PRAGMA)\b/i,'API requests cannot change the schema');
    const statement=this.sqlite.prepare(sql),db=this;
    return{bind(...values){
      async function execute(kind){
        // Yield before each operation so Promise.all requests can genuinely
        // interleave reads and writes. SQLite execution itself stays serial.
        await Promise.resolve();const started=performance.now();let result,returnedRows=0,changes=0;
        try{if(kind==='first'){result=statement.get(...values)||null;returnedRows=result?1:0;}else if(kind==='all'){const rows=statement.all(...values);returnedRows=rows.length;result={results:rows};}else{const row=statement.run(...values);changes=Number(row.changes);result={meta:{changes}};}return result;}
        finally{db.events.push({sql:compact(sql),values,kind,requestId:db.requests.getStore()?.id,elapsedMs:performance.now()-started,returnedRows,changes,write:/^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)});}
      }
      return{first:()=>execute('first'),all:()=>execute('all'),run:()=>execute('run')};
    }};
  }
  async batch(statements){this.sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  explain(event){try{return this.sqlite.prepare('EXPLAIN QUERY PLAN '+event.sql).all(...event.values).map(row=>row.detail);}catch{return[];}}
  close(){this.sqlite.close();}
}

function seed(DB,config){
  const db=DB.sqlite,started=performance.now(),stamp=Date.now()-30*24*60*60*1000;
  const profile=db.prepare('INSERT INTO portal_profiles (id,alias,created_at,updated_at) VALUES (?,?,?,?)');
  const member=db.prepare('INSERT INTO community_users (id,alias,role,created_at,updated_at) VALUES (?,?,?,?,?)');
  const plan=db.prepare('INSERT INTO portal_plans (id,user_id,title,school,degree,state_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)');
  const post=db.prepare('INSERT INTO community_posts (id,user_id,context,kind,title,body,plan_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const reaction=db.prepare('INSERT INTO community_reactions (post_id,user_id,reaction,created_at) VALUES (?,?,?,?)');
  const comment=db.prepare('INSERT INTO community_comments (id,user_id,context,body,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  const payloadBytes=[],publicPlanBytes=[];let sharedPlans=0;db.exec('BEGIN');
  try{
    for(let student=0;student<config.students;student++){
      const id=ownerId(student);profile.run(id,'Synthetic student '+student,stamp,stamp);member.run(id,'Synthetic member '+student,'member',stamp,stamp);
      for(let slot=0;slot<config.plansPerStudent;slot++){const state=syntheticState(student,slot),encoded=JSON.stringify(state);payloadBytes.push(Buffer.byteLength(encoded));plan.run(planId(student,slot),id,'Synthetic saved route '+slot,state.profile.school,state.profile.degree,encoded,stamp+slot,stamp+slot);}
    }
    for(let index=0;index<config.posts;index++){
      const id=postId(index),author=index%config.students,time=stamp+index,kind=['question','plan','template'][index%3];
      const shared=kind==='question'?null:JSON.stringify({schoolId:'synthetic-school',schoolName:'Example Benchmark University',programId:'synthetic-program',programName:'Synthetic public route',catalogYear:'2026-2027',strategy:'transfer',totalCredits:120,courses:Array.from({length:24},(_,course)=>({requirementId:'requirement-'+course,requirement:'Synthetic requirement '+course,courseId:'course-'+course,title:'Synthetic public course '+course,provider:course%2?'Example College':'Sophia',credits:3,url:null}))});
      if(shared){sharedPlans++;publicPlanBytes.push(Buffer.byteLength(shared));}
      post.run(id,ownerId(author),'school:scale-'+index%10,kind,'Synthetic transfer discussion '+index,'Synthetic public discussion. Contains no private plan or real student information. '.repeat(3),shared,time,time);
      for(let offset=0;offset<config.reactionsPerPost;offset++)reaction.run(id,ownerId((author+offset+1)%config.students),offset%2?'upvote':'like',time);
      for(let offset=0;offset<config.commentsPerPost;offset++)comment.run('scale-comment-'+index+'-'+offset,ownerId((author+offset+2)%config.students),'post:'+id,'Synthetic course-planning reply.',time+offset,time+offset);
    }
    post.run('scale-reaction-target',ownerId(0),'school:scale-reactions','question','Synthetic idempotent reaction target','Only synthetic reactions are used in this local workload.',null,stamp,stamp);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  db.exec('ANALYZE');
  return{durationMs:performance.now()-started,seedTimestamp:new Date(stamp).toISOString(),students:config.students,privatePlans:config.students*config.plansPerStudent,communityPosts:config.posts+1,publicPlansAndTemplates:sharedPlans,publicPlanBytes:distribution(publicPlanBytes),communityReactions:config.posts*config.reactionsPerPost,communityComments:config.posts*config.commentsPerPost,planStateBytes:distribution(payloadBytes),sqliteAllocatedBytes:db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size};
}

function configuration(options={}){
  const config={...defaults,...options};
  for(const [name,min,max] of [['students',1000,5000],['plansPerStudent',10,10],['posts',1000,10000],['reactionsPerPost',0,20],['commentsPerPost',0,4],['samples',1,500],['warmup',0,100],['saveRaces',1,100],['reactionCycles',1,100]])assert(Number.isSafeInteger(config[name])&&config[name]>=min&&config[name]<=max,`${name} must be an integer between ${min} and ${max}`);
  return config;
}
export async function createHarness(options={}){
  const config=configuration(options),beforeImport=memory(),file=resolve(ROOT,'outputs/site/dist/server/index.js'),source=readFileSync(file,'utf8'),sha256=createHash('sha256').update(source).digest('hex');
  const priorFetch=globalThis.fetch,externalRequests=[],blockedFetch=async(...args)=>{externalRequests.push(String(args[0]));throw Error('External HTTP is forbidden in the synthetic scale harness.');};globalThis.fetch=blockedFetch;
  let DB;
  try{
    const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;DB=new LocalD1();
    const seeded=seed(DB,config),afterSeed=memory(),authCalls=[];let requestSequence=0;
    const env={DB,PORTAL_SUPABASE_URL:AUTH_ORIGIN,PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_scale_fixture',PORTAL_AUTH_FETCH:async(url,settings={})=>{
      assert.equal(url,AUTH_ORIGIN+'/auth/v1/user','Only the local fake user verifier is allowed');authCalls.push({route:'/user',requestId:DB.requests.getStore()?.id});
      if(env.syntheticAuthFailure)return Response.json({error:'Synthetic identity outage'},{status:503});
      const match=/^Bearer synthetic-student-(\d+)$/.exec(settings.headers?.Authorization||'');if(!match)return Response.json({error:'Invalid synthetic token'},{status:401});
      const index=Number(match[1]);if(!Number.isSafeInteger(index)||index<0||index>config.students+5)return Response.json({error:'Invalid synthetic token'},{status:401});
      return Response.json({id:syntheticUUID(index),email:'synthetic-'+index+'@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});
    }};
    async function call(path,{method='GET',student=0,body,headers={}}={}){
      const start=performance.now(),queryStart=DB.events.length,id='request-'+(++requestSequence);
      return DB.requests.run({id},async()=>{
      const request=new Request(ORIGIN+path,{method,headers:{...(student===null?{}:{Cookie:'__Host-degreepath_access=synthetic-student-'+student}),...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json','X-Portal-Request':'1','X-Community-Request':'1'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const response=await worker.fetch(request,env,{waitUntil(promise){promise.catch(()=>{});}}),text=await response.text();let data;try{data=JSON.parse(text);}catch{data={nonJson:true};}
      return{status:response.status,body:data,headers:response.headers,elapsedMs:performance.now()-start,queryStart,queries:DB.events.slice(queryStart).filter(event=>event.requestId===id),authCalls:authCalls.filter(event=>event.requestId===id).length,responseBytes:Buffer.byteLength(text)};
      });
    }
    return{DB,config,env,call,seeded,authCalls,externalRequests,memory:{beforeImport,afterSeed},worker:{path:relative(ROOT,file),sha256,bytes:Buffer.byteLength(source)},close(){DB.close();if(globalThis.fetch===blockedFetch)globalThis.fetch=priorFetch;}};
  }catch(error){DB?.close();if(globalThis.fetch===blockedFetch)globalThis.fetch=priorFetch;throw error;}
}
function querySummary(events,DB){
  const unique=new Map();for(const event of events){let value=unique.get(event.sql);if(!value){value={sql:event.sql,executions:0,returnedRows:0,changes:0,write:event.write,queryPlan:event.write?[]:DB.explain(event)};unique.set(event.sql,value);}value.executions++;value.returnedRows+=event.returnedRows;value.changes+=event.changes;}
  return{statements:events.length,readStatements:events.filter(event=>!event.write).length,writeStatements:events.filter(event=>event.write).length,insertStatements:events.filter(event=>/^INSERT\b/i.test(event.sql)).length,returnedRows:events.reduce((sum,event)=>sum+event.returnedRows,0),maxRowsReturnedByOneStatement:Math.max(0,...events.map(event=>event.returnedRows)),sqlExecutionMs:distribution(events.map(event=>event.elapsedMs)),queries:[...unique.values()]};
}
function summarize(calls,events,DB){return{requestCount:calls.length,latencyMs:distribution(calls.map(call=>call.elapsedMs)),queriesPerRequest:distribution(calls.map(call=>call.queries.length)),responseBytes:distribution(calls.map(call=>call.responseBytes)),mockIdentityCalls:calls.reduce((sum,call)=>sum+call.authCalls,0),sql:querySummary(events,DB)};}
const telemetry=({elapsedMs,queries,authCalls,responseBytes})=>({elapsedMs,queries,authCalls,responseBytes});
function checked(response,status){assert.equal(response.status,status,JSON.stringify(response.body));return response.body;}

export async function exercisePrivateReads(harness,{samples=harness.config.samples,warmup=harness.config.warmup}={}){
  const{call,DB,config}=harness;
  for(let index=0;index<warmup;index++){const student=index%config.students;checked(await call('/api/portal/plans',{student}),200);checked(await call('/api/portal/plans/'+planId(student),{student}),200);}
  const start=DB.events.length,calls=[];
  for(let index=0;index<samples;index++){
    const student=(index*17)%config.students,list=await call('/api/portal/plans',{student});calls.push(telemetry(list));const body=checked(list,200);
    assert.match(list.headers.get('Cache-Control')||'',/private/);assert.match(list.headers.get('Cache-Control')||'',/no-store/);
    assert.equal(body.items.length,10);assert(body.items.every(item=>item.id.startsWith('scale-plan-'+String(student).padStart(5,'0')+'-')&&!Object.hasOwn(item,'state')));
    const detail=await call('/api/portal/plans/'+planId(student,index%10),{student});calls.push(telemetry(detail));assert.equal(checked(detail,200).item.state.profile.syntheticOwner,student);
  }
  const result=summarize(calls,DB.events.slice(start),DB);result.checks={ownerResultsIsolated:true,listLimitedToTen:true,listOmitsStatePayload:true,existingOwnerReadsPerformNoWrites:result.sql.writeStatements===0};return result;
}
export async function exerciseSaveRaces(harness,{races=harness.config.saveRaces}={}){
  const{call,DB,config}=harness,start=DB.events.length,pairs=[],calls=[];let rejected=0;
  for(let index=0;index<races;index++){
    const student=(index*23)%config.students,id=planId(student),previous=DB.sqlite.prepare('SELECT revision FROM portal_plans WHERE id=?').get(id).revision;
    const started=performance.now(),results=await Promise.all(['first','second'].map(tag=>call('/api/portal/plans/'+id,{student,method:'PUT',body:{title:'Synthetic '+tag+' save',revision:previous,state:syntheticState(student,0,'race-'+index+'-'+tag)}})));
    pairs.push(performance.now()-started);calls.push(...results.map(telemetry));assert.deepEqual(results.map(result=>result.status).sort((a,b)=>a-b),[200,409]);const winner=results.find(result=>result.status===200),loser=results.find(result=>result.status===409);assert.equal(loser.body.code,'revision_conflict');assert.match(loser.body.error,/another device|reload|changed/i);rejected++;
    const stored=DB.sqlite.prepare('SELECT revision,state_json FROM portal_plans WHERE id=?').get(id);assert.equal(stored.revision,previous+1);assert.equal(JSON.parse(stored.state_json).saveTag,winner.body.item.state.saveTag);
  }
  const result=summarize(calls,DB.events.slice(start),DB);result.pairedSaveLatencyMs=distribution(pairs);result.note='Two interleaved in-process callers, one serial SQLite connection; this proves compare-and-swap behavior, not distributed write throughput.';result.checks={sameRevisionWinners:races,sameRevisionConflicts:rejected,noLostWinningPayload:true,revisionAdvancedExactlyOnce:true};return result;
}
export async function exerciseCommunity(harness,{samples=harness.config.samples,reactionCycles=harness.config.reactionCycles}={}){
  const{call,DB,config}=harness,start=DB.events.length,reads=[],writes=[];
  for(let index=0;index<samples;index++){
    const student=(index*13)%config.students,path='/api/community/feed?context=school:scale-'+index%10+'&limit=20',first=await call(path,{student});reads.push(telemetry(first));const a=checked(first,200);assert.equal(a.items.length,20);assert(a.cursor);assert(a.items.every(item=>item.context==='school:scale-'+index%10));
    const second=await call(path+'&cursor='+encodeURIComponent(a.cursor),{student});reads.push(telemetry(second));const b=checked(second,200);assert.equal(b.items.length,20);const seen=new Set(a.items.map(item=>item.id));assert(b.items.every(item=>!seen.has(item.id)));
    for(const item of [a.items[0],b.items[0]]){
      const actual=DB.sqlite.prepare("SELECT COUNT(*) AS n FROM community_reactions WHERE post_id=? AND reaction='like'").get(item.id).n;assert.equal(item.likes,actual);assert.equal(item.comments,config.commentsPerPost);
      const mine=DB.sqlite.prepare("SELECT COUNT(*) AS n FROM community_reactions WHERE post_id=? AND user_id=? AND reaction='like'").get(item.id,ownerId(student)).n;assert.equal(item.liked,mine>0);
    }
    if(index%4===0){const mine=await call('/api/community/feed?mine=1&limit=20',{student});reads.push(telemetry(mine));const owned=checked(mine,200);assert(owned.items.length>0&&owned.items.length<=20);assert(owned.items.every(item=>item.author.isYou===true&&item.canEdit===true));const expected=DB.sqlite.prepare('SELECT id FROM community_posts WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 20').all(ownerId(student)).map(row=>row.id);assert.deepEqual(owned.items.map(item=>item.id),expected);}
  }
  const readEvents=DB.events.slice(start),reactionStart=DB.events.length;
  for(let index=0;index<reactionCycles;index++){
    const student=(index*31)%config.students,path='/api/community/posts/scale-reaction-target/reactions';
    for(const active of [true,true,false]){const response=await call(path,{student,method:'POST',body:{reaction:'like',active}});writes.push(telemetry(response));const item=checked(response,200).item;assert.equal(item.liked,active);assert.equal(item.likes,active?1:0);}
  }
  const ownerQueries=readEvents.filter(event=>/FROM community_posts p/.test(event.sql)&&/p\.user_id\s*=\s*\?/.test(event.sql));
  return{reads:summarize(reads,readEvents,DB),reactions:summarize(writes,DB.events.slice(reactionStart),DB),checks:{cursorPagesDoNotOverlap:true,pageSizeTwenty:true,ownerFeedOnlyIncludesOwnPosts:true,ownerFeedUsesUserIndex:ownerQueries.length>0&&ownerQueries.every(event=>DB.explain(event).some(detail=>/SEARCH p USING (?:COVERING )?INDEX.*\(user_id=\?/.test(detail))),reactionAndCommentCountsAccurate:true,repeatedReactionIsIdempotent:true,existingMemberReadsPerformNoWrites:readEvents.every(event=>!event.write)}};
}
export async function exerciseBoundaries(harness){
  const{call,DB,env}=harness;let original=DB.sqlite.prepare('SELECT state_json,revision FROM portal_plans WHERE id=?').get(planId(0));
  if(original.revision===1){checked(await call('/api/portal/plans/'+planId(0),{method:'PUT',body:{title:'Synthetic boundary fixture',revision:1,state:JSON.parse(original.state_json)}}),200);original=DB.sqlite.prepare('SELECT state_json,revision FROM portal_plans WHERE id=?').get(planId(0));}
  const denied=await call('/api/portal/plans/'+planId(0),{student:1});assert.equal(denied.status,404);assert(!JSON.stringify(denied.body).includes('SYNTHETIC-PRIVATE'));
  const forged=await call('/api/portal/plans',{student:null,headers:{'oai-authenticated-user-id':ownerId(0),'oai-authenticated-user-email':'synthetic-0@example.invalid'}});assert.equal(forged.status,401);
  const updateOther=await call('/api/portal/plans/'+planId(0),{student:1,method:'PUT',body:{title:'Forbidden cross-owner update',revision:original.revision,state:syntheticState(1)}});assert.equal(updateOther.status,404);
  const deleteOther=await call('/api/portal/plans/'+planId(0),{student:1,method:'DELETE',body:{revision:original.revision}});assert.equal(deleteOther.status,404);
  const staleDelete=await call('/api/portal/plans/'+planId(0),{method:'DELETE',body:{revision:original.revision-1}});assert.equal(staleDelete.status,409);assert.equal(staleDelete.body.code,'revision_conflict');
  const capped=await call('/api/portal/plans',{method:'POST',body:{title:'Eleventh saved plan',state:syntheticState(0),consent:true}});assert.equal(capped.status,409);assert.equal(capped.body.code,'plan_limit');
  const csrf=await call('/api/portal/plans/'+planId(0),{method:'PUT',headers:{Origin:'https://other.synthetic.invalid'},body:{title:'Cross-site write',revision:original.revision,state:syntheticState(0)}});assert.equal(csrf.status,403);
  const oversized=syntheticState(0);oversized.largeSyntheticNote='x'.repeat(530000);const tooLarge=await call('/api/portal/plans/'+planId(0),{method:'PUT',body:{title:'Oversized synthetic state',revision:original.revision,state:oversized}});assert.equal(tooLarge.status,413);
  const beforeFailure=DB.events.length;env.syntheticAuthFailure=true;const unavailable=await call('/api/portal/plans');env.syntheticAuthFailure=false;assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'auth_unavailable');assert.equal(unavailable.headers.get('Set-Cookie'),null);assert.equal(DB.events.length,beforeFailure);
  DB.failNext=true;const databaseError=await call('/api/portal/plans');assert.equal(databaseError.status,500);assert.match(databaseError.body.error,/storage|unavailable|draft/i);
  assert.deepEqual(DB.sqlite.prepare('SELECT state_json,revision FROM portal_plans WHERE id=?').get(planId(0)),original);
  const nearCap=harness.config.students-1;DB.sqlite.prepare('DELETE FROM portal_plans WHERE id=? AND user_id=?').run(planId(nearCap,9),ownerId(nearCap));
  const capRace=await Promise.all(['first','second'].map(tag=>call('/api/portal/plans',{student:nearCap,method:'POST',body:{title:'Synthetic cap race '+tag,state:syntheticState(nearCap,9,'cap-'+tag),consent:true}})));assert.deepEqual(capRace.map(result=>result.status).sort((a,b)=>a-b),[201,409]);assert.equal(capRace.find(result=>result.status===409).body.code,'plan_limit');assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans WHERE user_id=?').get(ownerId(nearCap)).n,10);
  return{crossOwnerReadDenied:true,crossOwnerWriteDenied:true,crossOwnerDeleteDenied:true,staleDeletePreservesLatestSave:true,forgedIdentityHeadersDenied:true,planLimitIsClearConflict:true,concurrentCreateCannotExceedPlanLimit:true,crossSiteWriteDenied:true,oversizedStateRejected:true,authOutageFailsClosedBeforeDatabase:true,authOutagePreservesSessionCookies:true,databaseFailureIsClearAndPreservesData:true,externalHttpRequests:harness.externalRequests.length};
}
export async function runBenchmark(options={}){
  const started=performance.now(),harness=await createHarness(options);
  try{
    const privateReads=await exercisePrivateReads(harness),saveRaces=await exerciseSaveRaces(harness),community=await exerciseCommunity(harness),boundaries=await exerciseBoundaries(harness);
    return{version:1,generatedAt:new Date().toISOString(),scope:'LOCAL SYNTHETIC MEASUREMENT ONLY — not Cloudflare, D1, Supabase or production capacity',method:{builtWorker:true,database:'Node DatabaseSync SQLite in memory through a D1-shaped adapter',http:'In-process Request/Response; no sockets or external HTTP',identity:'Synthetic Supabase user verifier; no remote provider latency',ai:'Not invoked and not configured',cache:'Warm process; no Cloudflare cache or geographic distribution',concurrency:'Interleaved Promise.all save pairs on one serial SQLite connection',warmupRequests:harness.config.warmup*2,sqliteStatistics:'ANALYZE after synthetic seeding',timing:'performance.now wall time including JSON parsing and mock identity',readMetric:'SQL rows returned; not rows scanned or D1 billed rows',garbageCollection:'Not forced'},environment:{node:process.version,platform:process.platform,architecture:process.arch,cpuCount:os.cpus().length,cpuModel:os.cpus()[0]?.model||'unknown',sqlite:process.versions.sqlite},worker:harness.worker,config:harness.config,dataset:harness.seeded,workloads:{privateReads,saveRaces,community},checks:boundaries,memory:{...harness.memory,afterWorkloads:memory()},durationMs:performance.now()-started,limits:['Local SQLite, CPU, memory, storage and identity mocks do not model Cloudflare queues, D1 limits, network round trips, Supabase RLS or connection pooling.','These observations cannot establish a supported number of concurrent students or requests per second.','Use a separately authorized staging deployment, real backend telemetry and a graduated load test before publishing a production capacity target.']};
  }finally{harness.close();}
}
function markdown(report){
  const rows=[['Private plan list/open',report.workloads.privateReads],['Community cursor page',report.workloads.community.reads],['Community reaction',report.workloads.community.reactions],['Same-revision save caller',report.workloads.saveRaces]];
  return['# Local synthetic scale benchmark','',report.scope,'',`Node ${report.environment.node}; SQLite ${report.environment.sqlite}; ${report.environment.platform}/${report.environment.architecture}.`,`${report.dataset.students.toLocaleString()} synthetic students; ${report.dataset.privatePlans.toLocaleString()} private plans; ${report.dataset.communityPosts.toLocaleString()} posts; ${report.dataset.communityReactions.toLocaleString()} reactions.`,`Built Worker SHA-256: ${report.worker.sha256}`,'','| Workload | Requests | Median ms | p95 ms | Median SQL queries | SQL writes |','|---|---:|---:|---:|---:|---:|',...rows.map(([name,value])=>`| ${name} | ${value.requestCount} | ${value.latencyMs.median.toFixed(3)} | ${value.latencyMs.p95.toFixed(3)} | ${value.queriesPerRequest.median} | ${value.sql.writeStatements} |`),'',`Existing owner read writes: ${report.workloads.privateReads.sql.writeStatements}. Existing community-member read writes: ${report.workloads.community.reads.sql.writeStatements}.`,`CAS pairs: ${report.workloads.saveRaces.checks.sameRevisionWinners} winners and ${report.workloads.saveRaces.checks.sameRevisionConflicts} explicit conflicts.`,`RSS after seed: ${(report.memory.afterSeed.rssBytes/1048576).toFixed(1)} MiB; after workloads: ${(report.memory.afterWorkloads.rssBytes/1048576).toFixed(1)} MiB.`,'','## Limits','',...report.limits.map(value=>'- '+value),'','The JSON report includes actual query text, EXPLAIN QUERY PLAN details, returned-row counts and per-workload query statistics. It contains synthetic data only.',''].join('\n');
}
async function main(){
  const options={},args=process.argv.slice(2);let output='outputs/benchmarks/scale-local.json';
  const names={'students':'students','posts':'posts','samples':'samples','warmup':'warmup','save-races':'saveRaces','reaction-cycles':'reactionCycles','reactions-per-post':'reactionsPerPost'};
  for(let index=0;index<args.length;index++){const arg=args[index];if(arg==='--out'){output=args[++index];continue;}if(arg==='--help'){console.log('node scripts/benchmark-scale.mjs [--students 1000] [--posts 5000] [--samples 100] [--warmup 10] [--save-races 24] [--out outputs/benchmarks/scale-local.json]\nLocal synthetic data only; no external requests, credentials or production endpoint. Build first with npm run build.');return;}const key=names[arg.replace(/^--/,'')];if(!arg.startsWith('--')||!key)throw Error('Unknown benchmark argument: '+arg);options[key]=Number(args[++index]);}
  const destination=resolve(ROOT,output),allowed=resolve(ROOT,'outputs/benchmarks')+'/';assert(destination.startsWith(allowed)&&destination.endsWith('.json'),'Write reports only under ignored outputs/benchmarks/*.json');
  const report=await runBenchmark(options);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(report,null,2)+'\n');writeFileSync(destination.replace(/\.json$/,'.md'),markdown(report));
  console.log(JSON.stringify({report:relative(ROOT,destination),students:report.dataset.students,plans:report.dataset.privatePlans,privateReadP95Ms:report.workloads.privateReads.latencyMs.p95,readSideWrites:report.workloads.privateReads.sql.writeStatements,communityReadSideWrites:report.workloads.community.reads.sql.writeStatements,ownerFeedUsesUserIndex:report.workloads.community.checks.ownerFeedUsesUserIndex,casPairs:report.workloads.saveRaces.checks.sameRevisionWinners,externalRequests:report.checks.externalHttpRequests,scope:'local-only'},null,2));
  if(report.workloads.privateReads.sql.writeStatements||report.workloads.community.reads.sql.writeStatements||!report.workloads.community.checks.ownerFeedUsesUserIndex||report.checks.externalHttpRequests)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
