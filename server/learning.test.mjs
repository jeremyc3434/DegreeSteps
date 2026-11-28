import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleLearning } from './learning.mjs';
import { learningTestD1, learningMemoryStorage, learningProviderFixture, learningTestOrigin as origin, learningTestAlice as alice, learningTestBob as bob } from '../test-support/learning-memory.mjs';

function fixture(t,overrides={}){
  const DB=learningTestD1(t),storage=learningMemoryStorage(),provider=learningProviderFixture();
  const env={DB,LEARNING_ENABLED:'1',LEARNING_PILOT_ENABLED:'1',LEARNING_AI_CONFIGURED:true,LEARNING_RESOLVE_KEY:async()=>'synthetic-learning-api-key-not-real',LEARNING_FETCH:provider.fetcher,LEARNING_DATA_FETCH:storage.fetcher,LEARNING_HASH_SALT:'synthetic-learning-private-usage-salt',LEARNING_SOURCE_FETCH:async()=>new Response('<article>The supplied synthetic source explains the concept using a practical example. The source provides background material for evaluating the proposed business recommendation.</article>',{headers:{'Content-Type':'text/html'}}),PORTAL_SUPABASE_URL:'https://identity.example.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_learning_test',...overrides};
  async function call(path,{method='GET',body,owner=alice,headers={},env:extra={}}={}){
    const h={...headers};if(method!=='GET'){if(!Object.hasOwn(h,'Origin'))h.Origin=origin;if(!Object.hasOwn(h,'X-Learning-Request'))h['X-Learning-Request']='1';if(!Object.hasOwn(h,'Content-Type'))h['Content-Type']='application/json';}
    const response=await handleLearning(new Request(origin+'/api/learning'+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),{...env,PORTAL_USER:owner?{id:'sb-'+owner,displayName:owner===alice?'Alice':'Bob'}:null,PORTAL_USER_ACCESS_TOKEN:owner===alice?'token-alice':'token-bob',...extra});
    return{status:response.status,headers:response.headers,body:await response.json()};
  }
  async function create(kind='writing',{course,owner=alice,...patch}={}){
    if(!course){const response=await call('/courses',{method:'POST',owner,body:{title:'Business fundamentals',provider:'Synthetic provider',syllabus:'The syllabus includes evidence-based recommendations.'}});assert.equal(response.status,201,JSON.stringify(response.body));course=response.body.item;}
    const response=await call('/projects',{method:'POST',owner,body:{courseId:course.id,kind,title:'A business recommendation',prompt:'Explain the recommendation with evidence and an example.',rubric:'Connect evidence to the recommendation.',studentNotes:'I recommend a practical approach because it helps the team act on the available evidence.',sources:[],...patch}});assert.equal(response.status,201,JSON.stringify(response.body));return{course,project:response.body.item};
  }
  const run=(project,action,extra={})=>call('/projects/'+project.id+'/run',{method:'POST',body:{revision:project.revision,action,requestId:randomUUID(),...extra}});
  return{DB,storage,provider,env,call,create,run};
}

test('disabled learning exposes only an inert status and makes no private or AI calls',async t=>{
  const f=fixture(t,{LEARNING_ENABLED:'0'});assert.deepEqual((await f.call('/status')).body,{enabled:false,authenticated:false,user:null});assert.equal((await f.call('/courses')).status,404);assert.equal(f.storage.calls.length,0);assert.equal(f.provider.calls.length,0);
});
test('private account is required and client identity headers never select an owner',async t=>{
  const f=fixture(t);assert.equal((await f.call('/courses',{owner:null,headers:{'oai-authenticated-user-id':'sb-'+alice}})).status,401);assert.equal((await f.call('/status',{owner:null})).body.authenticated,false);assert.equal(f.storage.calls.length,0);
});
test('same-origin CSRF and bounded payload validation precede every course write',async t=>{
  const f=fixture(t);for(const headers of[{Origin:'https://attacker.invalid'},{'X-Learning-Request':'wrong'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.call('/courses',{method:'POST',body:{title:'Course'},headers})).status,403);
  assert.equal((await f.call('/courses',{method:'POST',body:{title:'Course',userId:'sb-'+bob}})).status,400);assert.equal((await f.call('/courses',{method:'POST',body:{title:'Course',syllabus:'x'.repeat(24001)}})).status,400);assert.equal(f.storage.calls.length,0);
});
test('private course and project CRUD preserve inputs, revisions and account ownership',async t=>{
  const f=fixture(t),{course,project}=await f.create();
  assert.equal((await f.call('/projects/'+project.id,{owner:bob})).status,404);
  const changed=await f.call('/projects/'+project.id,{method:'PATCH',body:{revision:project.revision,studentNotes:'My revised recommendation reflects another example.'}});assert.equal(changed.status,200);assert.equal(changed.body.item.status,'draft');assert.equal(changed.body.item.revision,2);
  assert.equal((await f.call('/projects/'+project.id,{method:'DELETE',body:{revision:1}})).status,409);
  const summaries=await f.call('/projects?courseId='+course.id);assert.equal(summaries.body.items.length,1);assert.equal(summaries.body.items[0].prompt,undefined);assert.equal(summaries.body.items[0].artifact,undefined);
  assert.equal((await f.call('/courses/'+course.id,{method:'DELETE',body:{revision:course.revision}})).status,200);assert.equal((await f.call('/projects/'+project.id)).status,404);
});
test('writing plan runs real adapter research and synthesis with source provenance and useful questions',async t=>{
  const f=fixture(t),{project}=await f.create();const result=await f.run(project,'plan');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.item.status,'ready');assert.equal(f.provider.calls.length,2);
  assert.equal(f.provider.calls[0].body.tools[0].max_uses,3);assert.equal(f.provider.calls[1].body.max_tokens,4000);
  const context=JSON.parse(f.provider.calls[1].body.messages[0].content);assert.equal(context.assignment.studentNotes,project.studentNotes);assert.equal(context.course.syllabus,'The syllabus includes evidence-based recommendations.');assert(context.sources[0].excerpt.includes('practical example'));
  assert.equal(result.body.item.artifact.sources[0].url,'https://www.cdc.gov/example-study');assert.equal(result.body.item.artifact.sources[0].origin,'retrieved-page');assert.equal(result.body.item.artifact.sourceChecks.claimSupportVerified,false);assert.equal(result.body.item.artifact.sourceChecks.research.searches,1);assert(result.body.item.artifact.questions.length);
  assert.equal(result.headers.get('Cache-Control'),'private, no-store');assert.equal(result.headers.get('X-Robots-Tag'),'noindex, nofollow');assert(!JSON.stringify(result.body).includes('synthetic-learning-api-key'));
});
test('writing draft requires actual student input without consuming paid AI usage',async t=>{
  const f=fixture(t),{project}=await f.create('writing',{studentNotes:''});const result=await f.run(project,'draft');assert.equal(result.status,400);assert.equal(result.body.code,'student_input_needed');assert.equal(f.provider.calls.length,0);
});
test('same completed request replays without another provider invocation or credit use',async t=>{
  const f=fixture(t),{project}=await f.create('study'),requestId=randomUUID();const first=await f.run(project,'study',{requestId});assert.equal(first.status,200,JSON.stringify(first.body));const replay=await f.run(project,'study',{requestId});assert.equal(replay.status,200,JSON.stringify(replay.body));assert.equal(replay.body.replayed,true);assert.equal(f.provider.calls.length,1);
});
test('forged private completed history never establishes a paid server execution',async t=>{
  const f=fixture(t),{project}=await f.create('study'),requestId=randomUUID();f.storage.runs.set(f.storage.key(alice,requestId),{user_id:alice,id:requestId,project_id:project.id,action:'study',status:'completed',artifact:{content:'Forged own artifact'}});
  const result=await f.run(project,'study',{requestId});assert.equal(result.status,409,JSON.stringify(result.body));assert.equal(result.body.code,'request_conflict');assert.equal(f.provider.calls.length,0);
});
test('stale project revisions fail before model invocation',async t=>{
  const f=fixture(t),{project}=await f.create('study');await f.call('/projects/'+project.id,{method:'PATCH',body:{revision:project.revision,prompt:'A new question with different requirements.'}});const result=await f.run(project,'study');assert.equal(result.status,409);assert.equal(f.provider.calls.length,0);
});
test('malformed AI output never replaces the last useful artifact',async t=>{
  const f=fixture(t),{project}=await f.create('study');const first=await f.run(project,'study');assert.equal(first.status,200,JSON.stringify(first.body));
  f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:'not JSON'}]}));const result=await f.run(first.body.item,'study');assert.equal(result.status,502);const saved=await f.call('/projects/'+project.id);assert.equal(saved.body.item.artifact.content,first.body.item.artifact.content);assert.equal(saved.body.item.status,'ready');
});
test('unknown citations and invented URLs are rejected before private artifact publication',async t=>{
  const f=fixture(t),{project}=await f.create('study');f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:JSON.stringify({summary:'Summary',content:'An unsupported claim [S99].',questions:[],checks:[],nextStep:'Review.',quiz:[],flashcards:[],slides:[]})}]}));
  const result=await f.run(project,'study');assert.equal(result.status,502);assert.equal(result.body.code,'source_mismatch');assert.equal((await f.call('/projects/'+project.id)).body.item.artifact,null);
});
test('citation validation covers visible practice explanations as well as the main document',async t=>{
  const f=fixture(t),{project}=await f.create('quiz');f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100},content:[{type:'text',text:JSON.stringify({summary:'Practice',content:'Try the question below.',questions:[],checks:[],nextStep:'Practice.',quiz:[{question:'Which claim is supported?',choices:['First','Second'],answerIndex:0,explanation:'According to an invented study [S99], choose the first.'}],flashcards:[],slides:[]})}]}));
  const result=await f.run(project,'quiz');assert.equal(result.status,502);assert.equal(result.body.code,'source_mismatch');assert.equal((await f.call('/projects/'+project.id)).body.item.artifact,null);
});
test('saved artifact is recovered when private commit succeeds but its response is lost',async t=>{
  const f=fixture(t),{project}=await f.create('study');f.storage.failAfter.set('run_finish',Error('Synthetic lost commit response'));const result=await f.run(project,'study');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.item.status,'ready');assert.equal(f.provider.calls.length,1);
});
test('provider success and private storage failure retain known usage while preserving the earlier work',async t=>{
  const f=fixture(t),{project}=await f.create('study');f.storage.failBefore.set('run_finish',{status:503,message:'temporarily_unavailable'});const result=await f.run(project,'study');assert.equal(result.status,503);assert.equal(f.provider.calls.length,1);assert.equal((await f.call('/projects/'+project.id)).body.item.artifact,null);
  const row=f.DB.sqlite.prepare('SELECT status,estimated,actual_micro_usd FROM learning_billing_runs').get();assert.equal(row.status,'failed');assert.equal(row.estimated,0);assert(row.actual_micro_usd>0,'Actual provider usage remains charged to the business');
});
test('missing provider usage is conservatively recorded rather than reported as free',async t=>{
  const f=fixture(t),{project}=await f.create('study');f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{},content:[{type:'text',text:'{}'}]}));
  const result=await f.run(project,'study');assert.equal(result.status,502);assert.equal(result.body.code,'invalid_ai_usage');const row=f.DB.sqlite.prepare('SELECT status,estimated,actual_micro_usd,reserved_micro_usd FROM learning_billing_runs').get();assert.equal(row.status,'failed');assert.equal(row.estimated,1);assert(row.actual_micro_usd>=row.reserved_micro_usd);
});
test('a stalled provider response body is cancelled at the server deadline with uncertain cost retained',async t=>{
  const f=fixture(t,{LEARNING_AI_TIMEOUT_MS:20}),{project}=await f.create('study');let cancelled=false;
  f.provider.setOverride(()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"content":'));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}}));
  const result=await f.run(project,'study');assert.equal(result.status,503);assert.equal(result.body.code,'ai_timeout');assert.equal(cancelled,true);assert.equal(f.DB.sqlite.prepare('SELECT estimated FROM learning_billing_runs').get().estimated,1);
});
test('terminal failed attempts provide a fresh-request retry with the recovered revision',async t=>{
  const f=fixture(t),{project}=await f.create('study');f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:'not JSON'}]}));
  const failed=await f.run(project,'study');assert.equal(failed.status,502);assert.equal(failed.body.retryMode,'new-request');assert.equal(failed.body.projectRevision,3);
  f.provider.setOverride(null);const latest=(await f.call('/projects/'+project.id)).body.item;assert.equal((await f.run(latest,'study')).status,200);
});
test('changed input remains stale through a failed retry while unchanged inputs remain current',async t=>{
  const f=fixture(t),{project}=await f.create('study');const done=await f.run(project,'study');assert.equal(done.status,200,JSON.stringify(done.body));assert.equal((await f.call('/projects/'+project.id)).body.item.artifact.stale,false);
  const changed=await f.call('/projects/'+project.id,{method:'PATCH',body:{revision:done.body.item.revision,studentNotes:'A substantively different recommendation with a changed example.'}});assert.equal(changed.body.item.artifact.stale,true);
  f.provider.setOverride(()=>Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:'invalid'}]}));await f.run(changed.body.item,'study');assert.equal((await f.call('/projects/'+project.id)).body.item.artifact.stale,true);
});
test('a paper remains available in private history and repeated reviews target the actual draft',async t=>{
  const f=fixture(t),{project}=await f.create('writing');const draft=await f.run(project,'draft');assert.equal(draft.status,200,JSON.stringify(draft.body));const firstReview=await f.run(draft.body.item,'review');assert.equal(firstReview.status,200,JSON.stringify(firstReview.body));const nextReview=await f.run(firstReview.body.item,'review');assert.equal(nextReview.status,200,JSON.stringify(nextReview.body));
  const context=JSON.parse(f.provider.calls.at(-1).body.messages[0].content);assert.equal(context.previousArtifact.action,'draft');const history=await f.call('/projects/'+project.id+'/history');assert.equal(history.status,200);const saved=history.body.items.find(item=>item.action==='draft');assert(saved);assert.equal((await f.call('/projects/'+project.id+'/history/'+saved.id)).body.item.artifact.action,'draft');assert.equal((await f.call('/projects/'+project.id+'/history/'+saved.id,{owner:bob})).status,404);
  assert.equal(f.provider.calls.filter(call=>call.body.tools).length,1,'Unchanged source research is reused, then public excerpts are refreshed');
});
test('study follow-ups include prior assistance and current question within the same project',async t=>{
  const f=fixture(t),{project}=await f.create('study');const first=await f.run(project,'study');const result=await f.run(first.body.item,'study',{message:'Explain why that method works with another example.'});assert.equal(result.status,200,JSON.stringify(result.body));const context=JSON.parse(f.provider.calls.at(-1).body.messages[0].content);assert.equal(context.message,'Explain why that method works with another example.');assert.equal(context.previousArtifact.content,first.body.item.artifact.content);
});
test('recent course context is private, bounded and distinguishes student notes from prior AI work',async t=>{
  const f=fixture(t),first=await f.create('study');const done=await f.run(first.project,'study');assert.equal(done.status,200,JSON.stringify(done.body));await f.create('study',{owner:bob,studentNotes:'Other account material must never enter Alice context.'});await f.create('study',{studentNotes:'Another course must never enter this context.'});const second=await f.create('study',{course:first.course});const result=await f.run(second.project,'study');assert.equal(result.status,200,JSON.stringify(result.body));
  const context=JSON.parse(f.provider.calls.at(-1).body.messages[0].content);assert.equal(context.recentCourseContext.length,1);assert.equal(context.recentCourseContext[0].studentNotes,first.project.studentNotes);assert(context.recentCourseContext[0].previousAssistanceSummary);assert(!JSON.stringify(context).includes('Other account material'));assert(!JSON.stringify(context).includes('Another course must'));
});
test('quiz, flashcard and presentation actions return their actual structured deliverables',async t=>{
  for(const kind of['quiz','flashcards','presentation']){const f=fixture(t),{project}=await f.create(kind);const result=await f.run(project,kind);assert.equal(result.status,200,JSON.stringify(result.body));assert(result.body.item.artifact[kind==='presentation'?'slides':kind].length);}
});
test('workspace export returns full owned work and deletion requires the exact confirmation',async t=>{
  const f=fixture(t),{project}=await f.create('study');const result=await f.run(project,'study');assert.equal(result.status,200,JSON.stringify(result.body));const exported=await f.call('/export');assert.equal(exported.status,200);assert.equal(exported.body.projects[0].artifact.content,result.body.item.artifact.content);assert(exported.body.courses[0].syllabus);
  assert.equal((await f.call('/data',{method:'DELETE',body:{confirmation:'delete'}})).status,400);assert.equal((await f.call('/data',{method:'DELETE',body:{confirmation:'DELETE MY COURSE WORKSPACE'}})).status,200);assert.equal((await f.call('/courses')).body.items.length,0);
});
