import test from 'node:test';
import assert from 'node:assert/strict';
import { learningActor, learningStorageConfiguration, learningListCourses, learningListProjects, learningGetCourse, learningGetProject, learningGetRun, learningMutate, learningProjectOwned } from './learning-storage.mjs';

const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',courseId='33333333-3333-4333-8333-333333333333',projectId='44444444-4444-4444-8444-444444444444';
const base={PORTAL_USER:{id:'sb-'+alice,displayName:'Alice',email:'not-forwarded@example.invalid'},PORTAL_USER_ACCESS_TOKEN:'verified-alice-token',PORTAL_SUPABASE_URL:'https://identity.example.invalid',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only'};
function fixture(answer=[]){const calls=[];return{calls,env:{...base,LEARNING_DATA_FETCH:async(url,options)=>{calls.push({url:new URL(url),options,body:options.body?JSON.parse(options.body):null});return typeof answer==='function'?answer(url,options):Response.json(answer);}}};}

test('learning storage uses only verified sb identities and excludes unrelated claims',()=>{
  assert.equal(learningActor({}),null);assert.deepEqual(learningActor(base),{id:'sb-'+alice,uuid:alice,displayName:'Alice'});
  for(const value of['alice','sb-invalid',{id:alice},{id:'sb-'+alice+'?x'}])assert.throws(()=>learningActor({PORTAL_USER:typeof value==='object'?value:{id:value}}),e=>e.status===401);
});
test('learning storage rejects service keys and malformed session configuration',()=>{
  for(const patch of[{PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_accepted'},{PORTAL_SUPABASE_URL:'http://identity.example.invalid'},{PORTAL_SUPABASE_URL:'https://user:pass@identity.example.invalid'},{PORTAL_SUPABASE_URL:'https://identity.example.invalid/path'},{PORTAL_USER_ACCESS_TOKEN:''},{PORTAL_USER_ACCESS_TOKEN:'token\r\nInjected:1'}])assert.throws(()=>learningStorageConfiguration({...base,...patch}),e=>e.status===503);
});
test('course and project lists select summaries rather than every private document',async()=>{
  const f=fixture();await learningListCourses(f.env,learningActor(f.env));await learningListProjects(f.env,learningActor(f.env),courseId);
  assert.equal(f.calls[0].url.searchParams.get('user_id'),'eq.'+alice);assert.equal(f.calls[1].url.searchParams.get('course_id'),'eq.'+courseId);
  assert(!f.calls[0].url.searchParams.get('select').includes('syllabus'));assert(!f.calls[1].url.searchParams.get('select').includes('artifact'));assert(!f.calls[1].url.searchParams.get('select').includes('prompt'));
  assert.equal(f.calls[0].options.headers.Authorization,'Bearer verified-alice-token');assert.equal(f.calls[0].options.headers.apikey,base.PORTAL_SUPABASE_PUBLISHABLE_KEY);assert.equal(f.calls[0].options.redirect,'manual');
});
test('RPC binds expected actor as well as the real session JWT',async()=>{
  const f=fixture({id:courseId,user_id:alice,title:'Course'});await learningMutate(f.env,'course_create',null,null,{title:'Course'});
  assert.equal(f.calls[0].url.pathname,'/rest/v1/rpc/degreesteps_learning_mutate');assert.deepEqual(f.calls[0].body,{p_actor_id:alice,p_operation:'course_create',p_id:null,p_revision:null,p_data:{title:'Course'}});
  assert(!JSON.stringify(f.calls[0].body).includes('not-forwarded'));
});
test('mismatched JWT and actor cannot mutate a different workspace',async()=>{
  const f=fixture(()=>Response.json({message:'owner_mismatch'},{status:403}));await assert.rejects(learningMutate({...f.env,PORTAL_USER:{id:'sb-'+bob}},'course_create',null,null,{title:'Forged'}),e=>e.status===403&&e.code==='owner_mismatch');
});
test('private detail ownership is checked even if storage returns a foreign row',async()=>{
  const f=fixture([{id:courseId,user_id:bob,title:'Not yours'}]);await assert.rejects(learningGetCourse(f.env,learningActor(f.env),courseId),e=>e.status===503);assert.equal(await learningProjectOwned(f.env,'bad&user_id=neq.'+alice),false);assert.equal(f.calls.length,1);
});
test('not found and owner checks expose no other-user document',async()=>{
  const f=fixture();await assert.rejects(learningGetProject(f.env,learningActor(f.env),projectId),e=>e.status===404&&e.code==='project_not_found');assert.equal(await learningProjectOwned(f.env,projectId),false);assert.equal(await learningGetRun(f.env,learningActor(f.env),projectId),null);
});
test('private provider redirects are never followed with the student JWT',async()=>{
  const f=fixture(()=>new Response('',{status:302,headers:{Location:'https://attacker.example.invalid'}}));await assert.rejects(learningListCourses(f.env,learningActor(f.env)),e=>e.status===503);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.redirect,'manual');
});
test('oversized and malformed storage responses fail without returning provider details',async()=>{
  for(const response of[new Response('private',{headers:{'Content-Length':'1500001'}}),new Response('not JSON private error')]){const f=fixture(()=>response);await assert.rejects(learningListCourses(f.env,learningActor(f.env)),e=>e.status===503&&!e.message.includes('private error'));}
});
test('known storage errors provide actionable conflict and rate-limit recovery',async()=>{
  for(const [message,status]of[['revision_conflict',409],['run_in_progress',409],['write_limit',429],['workspace_limit',409]]){const f=fixture(()=>Response.json({message},{status}));await assert.rejects(learningMutate(f.env,'project_update',projectId,1,{title:'Changed'}),e=>e.status===status&&e.code===message);}
});
