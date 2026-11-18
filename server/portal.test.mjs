import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { handlePortal } from './portal.mjs';
import { handleCollegeAccess } from './college-access.mjs';

const origin='https://degreepath.example';
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
class LocalD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');for(const entry of journal.entries)this.sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));}
  prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i,'Requests may not execute schema DDL');const query=this.sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};}
  async batch(statements){this.sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
  close(){this.sqlite.close();}
}
function fixture(t,environment={}){
  const DB=new LocalD1();t.after(()=>DB.close());
  const env={DB,PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:true,...environment};
  async function call(path,{method='GET',user,body,headers={},authUser,...overrides}={}){
    const h={...headers};if(method!=='GET'){
      if(!Object.hasOwn(h,'Origin'))h.Origin=origin;
      if(!Object.hasOwn(h,'X-Portal-Request'))h['X-Portal-Request']='1';
      if(!Object.hasOwn(h,'Content-Type'))h['Content-Type']='application/json';
    }
    const request=new Request(origin+'/api/portal'+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)}),...overrides});
    const response=await handlePortal(request,{...env,PORTAL_USER:authUser===undefined?(user?{id:user,email:user+'@private.invalid'}:null):authUser});
    return{status:response.status,body:await response.json(),headers:response.headers};
  }
  const create=async(user='alice',overrides={})=>{const response=await call('/plans',{method:'POST',user,body:{title:'My degree route',state:draft(),consent:true,...overrides}});assert.equal(response.status,201,JSON.stringify(response.body));return response.body.item;};
  return{DB,env,call,create};
}
function draft(overrides={}){return{version:3,profile:{school:'Example University',degree:'B.S. Business',priority:'speed'},learning:[{id:'private-record-1',provider:'College',code:'MAT100',credits:3,status:'earned',evaluations:[]}],scenarios:{business:{optionSelections:{math:'outside-math'}}},sheet:{notes:{business:{math:'Private advising note'}}},journey:{view:'home',planReviewed:false},...overrides};}

test('anonymous session reports configured provider without creating a private profile',async t=>{
  const{call,DB}=fixture(t);const response=await call('/session');
  assert.equal(response.status,200);assert.deepEqual(response.body,{user:null,limits:{maxPlans:10,maxStateBytes:524288},authConfigured:true,provider:'email-google'});
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles').get().n,0);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('unconfigured authentication is reported honestly and a missing storage binding is bounded',async()=>{
  const request=new Request(origin+'/api/portal/session');
  assert.equal((await handlePortal(request,{PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:false})).status,200);
  assert.equal((await(await handlePortal(request,{})).json()).authConfigured,false);
  assert.equal((await handlePortal(request,{PORTAL_AUTH_REQUIRED:true,PORTAL_USER:{id:'alice'},PORTAL_AUTH_CONFIGURED:true})).status,503);
});
test('worker-verified identity overrides forged native headers and required auth never falls back to them',async t=>{
  const{call,env}=fixture(t);const forged={'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@private.invalid'};
  assert.equal((await call('/session',{headers:forged})).body.user,null);
  assert.equal((await call('/plans',{headers:forged})).status,401);
  const signed=await call('/session',{user:'alice',headers:forged});assert.equal(signed.body.user.id,'alice');assert.equal(signed.body.user.email,undefined);
  const raw=new Request(origin+'/api/portal/session',{headers:forged});
  const required=await handlePortal(raw,env);assert.equal((await required.json()).user,null);
  const compatibility=await handlePortal(raw,{...env,PORTAL_AUTH_REQUIRED:false});assert.equal((await compatibility.json()).user.id,'victim');
  assert.equal((await call('/session',{authUser:{id:' invalid '}})).status,401);
});
test('all private reads and writes require authentication',async t=>{
  const{call}=fixture(t);
  for(const [path,method,body]of [['/profile','GET'],['/profile','PATCH',{alias:'Alex'}],['/plans','GET'],['/plans','POST',{title:'Mine',state:draft(),consent:true}],['/plans/known-id','GET'],['/plans/known-id','DELETE',{revision:1}]])assert.equal((await call(path,{method,body})).status,401);
});
test('writes enforce origin, fetch context, custom header and JSON without changing saved plans',async t=>{
  const{call,DB}=fixture(t);await call('/session',{user:'alice'});
  const body={title:'Mine',state:draft(),consent:true};
  for(const headers of [{Origin:''},{Origin:'https://attacker.invalid'},{'X-Portal-Request':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await call('/plans',{method:'POST',user:'alice',body,headers})).status,403);
  assert.equal((await call('/plans',{method:'POST',user:'alice',body,headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans').get().n,0);
});
test('saving requires explicit consent and rejects client-provided ownership',async t=>{
  const{call}=fixture(t);
  for(const consent of [undefined,false,'true'])assert.equal((await call('/plans',{method:'POST',user:'alice',body:{title:'Mine',state:draft(),consent}})).body.code,'consent_required');
  assert.equal((await call('/plans',{method:'POST',user:'alice',body:{title:'Mine',state:draft(),consent:true,userId:'bob'}})).status,400);
});
test('private state survives an authenticated cross-device round trip and list results expose metadata only',async t=>{
  const{call,create}=fixture(t);const state=draft(),saved=await create('alice',{state});
  assert.deepEqual(saved.state,state);assert.equal(saved.revision,1);assert.equal(saved.school,state.profile.school);
  const reopened=await call('/plans/'+saved.id,{user:'alice'});assert.deepEqual(reopened.body.item.state,state);
  const list=(await call('/plans',{user:'alice'})).body.items;
  assert.equal(list.length,1);assert.equal(list[0].id,saved.id);assert.equal(list[0].state,undefined);assert.equal(list[0].userId,undefined);assert(!JSON.stringify(list).includes('Private advising note'));
});
test('an actual reviewed degree draft with catalog signatures fits the private-state envelope unchanged',async t=>{
  const{create}=fixture(t),require=createRequire(import.meta.url),Journey=require('../dist/journey-engine.js'),Sheet=require('../dist/sheet-state.js');
  const catalog=JSON.parse(readFileSync(new URL('../dist/data/pathways.json',import.meta.url),'utf8'));
  const models=['tesu','liberty'].map(name=>JSON.parse(readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url),'utf8')));
  const route=catalog.pathways.find(item=>item.id==='tesu-general-management');
  let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
  const draft=Journey.buildDraft(state,catalog,models);state=draft.state;
  state.journey.reviewedSignature=Journey.draftSignature(state,draft);
  state.journey.schoolContactedSignature=state.journey.reviewedSignature;
  assert(Buffer.byteLength(JSON.stringify(state))>100000,'Exercise actual large catalog signatures');
  assert.deepEqual((await create('alice',{state})).state,state);
});
test('another user cannot discover, read, update or delete an owned plan',async t=>{
  const{call,create}=fixture(t);const saved=await create('alice');
  assert.deepEqual((await call('/plans',{user:'bob'})).body.items,[]);
  for(const [method,body]of [['GET'],['PUT',{title:'Take over',state:draft(),revision:1}],['DELETE',{revision:1}]])assert.equal((await call('/plans/'+saved.id,{method,user:'bob',body})).status,404);
  assert.deepEqual((await call('/plans/'+saved.id,{user:'alice'})).body.item,saved);
});
test('revision compare-and-swap rejects stale saves and stale deletes without losing a newer draft',async t=>{
  const{call,create}=fixture(t);const saved=await create();
  const next=draft({learning:[]});const updated=await call('/plans/'+saved.id,{method:'PUT',user:'alice',body:{title:'Updated route',state:next,revision:1}});
  assert.equal(updated.status,200);assert.equal(updated.body.item.revision,2);
  for(const [method,body]of [['PUT',{title:'Old route',state:draft(),revision:1}],['DELETE',{revision:1}]]){const conflict=await call('/plans/'+saved.id,{method,user:'alice',body});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'revision_conflict');}
  const current=(await call('/plans/'+saved.id,{user:'alice'})).body.item;assert.equal(current.title,'Updated route');assert.deepEqual(current.state,next);
  for(const revision of [undefined,0,-1,1.5,'2'])assert.equal((await call('/plans/'+saved.id,{method:'DELETE',user:'alice',body:{revision}})).status,400);
});
test('the ten-plan cap is atomic across concurrent requests and per owner',async t=>{
  const{call}=fixture(t);const attempts=await Promise.all(Array.from({length:14},(_,i)=>call('/plans',{method:'POST',user:'alice',body:{title:'Route '+i,state:draft(),consent:true}})));
  assert.equal(attempts.filter(r=>r.status===201).length,10);assert.equal(attempts.filter(r=>r.body.code==='plan_limit').length,4);
  assert.equal((await call('/plans',{user:'alice'})).body.items.length,10);
  assert.equal((await call('/plans',{method:'POST',user:'bob',body:{title:'Independent route',state:draft(),consent:true}})).status,201);
});
test('plan deletion requires the current revision and never affects another owner',async t=>{
  const{call,create}=fixture(t);const alice=await create('alice'),bob=await create('bob');
  assert.equal((await call('/plans/'+alice.id,{method:'DELETE',user:'alice',body:{revision:1}})).status,200);
  assert.equal((await call('/plans/'+alice.id,{user:'alice'})).status,404);
  assert.equal((await call('/plans/'+bob.id,{user:'bob'})).status,200);
});
test('profiles preserve a private nickname without storing authenticated email',async t=>{
  const{call,DB}=fixture(t);assert.equal((await call('/profile',{user:'alice'})).body.user.alias,'Student');
  const response=await call('/profile',{method:'PATCH',user:'alice',body:{alias:'  Alex Student  '}});assert.equal(response.body.user.alias,'Alex Student');
  assert.equal((await call('/profile',{user:'bob'})).body.user.alias,'Student');
  assert.equal((await call('/profile',{method:'PATCH',user:'alice',body:{alias:'Owner',id:'bob'}})).status,400);
  assert.equal((await call('/profile',{method:'PATCH',user:'alice',body:{alias:'x'}})).status,400);
  assert(!JSON.stringify(DB.sqlite.prepare('SELECT * FROM portal_profiles').all()).includes('@private.invalid'));
});
test('private provider names accompany existing D1 profiles without rewriting aliases or public identities',async t=>{
  const{call,DB}=fixture(t),insert=DB.sqlite.prepare('INSERT INTO portal_profiles (id,alias,created_at,updated_at) VALUES (?,?,1,2)');
  insert.run('alice','Student');insert.run('bob',"  Chosen ' & 雪  ");
  DB.sqlite.prepare('INSERT INTO community_users (id,alias,role,created_at,updated_at) VALUES (?,?,?,?,?)').run('alice','Public pen name','member',1,2);
  const profiles=DB.sqlite.prepare('SELECT * FROM portal_profiles ORDER BY id').all(),community=DB.sqlite.prepare('SELECT * FROM community_users').all();
  for(const [id,alias]of [['alice','Student'],['bob',"  Chosen ' & 雪  "]])for(const path of ['/session','/profile']){
    const result=await call(path,{authUser:{id,email:'private@example.invalid',displayName:'Zoë 李',role:'admin',user_metadata:{full_name:'Do not forward metadata'},access_token:'do-not-forward-token'},headers:{'oai-authenticated-user-id':'foreign-owner'}});
    assert.equal(result.status,200);assert.deepEqual(result.body.user,{id,alias,createdAt:1,updatedAt:2,displayName:'Zoë 李'});
  }
  assert.deepEqual(DB.sqlite.prepare('SELECT * FROM portal_profiles ORDER BY id').all(),profiles);
  assert.deepEqual(DB.sqlite.prepare('SELECT * FROM community_users').all(),community);
  assert.equal((await call('/session',{user:'alice'})).body.user.displayName,undefined);
  const renamed=await call('/profile',{method:'PATCH',authUser:{id:'alice',displayName:'Zoë 李'},body:{alias:'My chosen nickname'}});
  assert.equal(renamed.body.user.alias,'My chosen nickname');assert.equal(renamed.body.user.displayName,'Zoë 李');
  assert.deepEqual(DB.sqlite.prepare('SELECT * FROM portal_profiles WHERE id=?').get('bob'),profiles[1]);
  assert.deepEqual(DB.sqlite.prepare('SELECT * FROM community_users').all(),community);
});
test('private display names never select a D1 owner or bypass the profile write contract',async t=>{
  const{call,create,DB}=fixture(t),saved=await create('alice'),authUser={id:'bob',displayName:'alice',role:'admin',user_metadata:{id:'alice'}};
  const ownerBefore=DB.sqlite.prepare('SELECT * FROM portal_profiles WHERE id=?').get('alice');
  assert.deepEqual((await call('/plans',{authUser})).body.items,[]);
  for(const [method,body]of [['GET'],['PUT',{title:'Take over',state:draft(),revision:1}],['DELETE',{revision:1}]])assert.equal((await call('/plans/'+saved.id,{method,authUser,body})).status,404);
  assert.equal((await call('/profile',{method:'PATCH',authUser,body:{alias:'Public name',displayName:'Client name'}})).status,400);
  for(const displayName of [42,'a'.repeat(81),'Name\u202e','Name\n',[]])assert.equal((await call('/session',{authUser:{id:'bob',displayName}})).body.user.displayName,undefined);
  assert.deepEqual(DB.sqlite.prepare('SELECT * FROM portal_profiles WHERE id=?').get('alice'),ownerBefore);
  assert.equal((await call('/plans/'+saved.id,{user:'alice'})).status,200);
});
test('deleting portal data is explicit, owner scoped, and leaves community records alone',async t=>{
  const{call,create,DB}=fixture(t);await create('alice');const bob=await create('bob');
  DB.sqlite.prepare('INSERT INTO community_users (id,alias,role,created_at,updated_at) VALUES (?,?,?,?,?)').run('alice','Community Alex','member',1,1);
  assert.equal((await call('/profile',{method:'DELETE',user:'alice',body:{confirmation:'delete'}})).status,400);
  assert.equal((await call('/profile',{method:'DELETE',user:'alice',body:{confirmation:'DELETE MY PORTAL DATA'}})).status,200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans WHERE user_id=?').get('alice').n,0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles WHERE id=?').get('alice').n,0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_rate_limits WHERE user_id=?').get('alice').n,0);
  assert.equal((await call('/plans/'+bob.id,{user:'bob'})).status,200);
  assert.equal(DB.sqlite.prepare('SELECT alias FROM community_users WHERE id=?').get('alice').alias,'Community Alex');
});
test('portal deletion atomically withdraws every owned college permission and excludes subsequent leads',async t=>{
  const{call,create,DB}=fixture(t,{COLLEGE_ACCESS_ENABLED:true});await create('alice');const bob=await create('bob');
  const college=DB.sqlite.prepare("INSERT INTO college_organizations (id,name,website,status,revision,created_by,created_at,updated_at) VALUES (?,?,?,'verified',1,'owner',1,1)");
  const member=DB.sqlite.prepare("INSERT INTO college_memberships (organization_id,user_id,role,status,granted_by,created_at,updated_at) VALUES (?,'advisor','advisor','active','owner',1,1)");
  for(const id of ['college-one','college-two']){college.run(id,id,'https://'+id+'.edu');member.run(id);}
  const consent=DB.sqlite.prepare("INSERT INTO college_interest_requests (id,user_id,organization_id,contact_name,contact_email,consent_version,consent_text,consented_at,created_at,updated_at) VALUES (?,?,?,?,?,'college-contact-v1','Explicit college-specific permission',1,1,1)");
  consent.run('alice-one','alice','college-one','Private Alice','alice@private.invalid');consent.run('alice-two','alice','college-two','Private Alice','alice@private.invalid');consent.run('bob-one','bob','college-one','Private Bob','bob@private.invalid');
  const leads=async organizationId=>{const response=await handleCollegeAccess(new Request(origin+'/api/colleges/leads?organizationId='+organizationId),{DB,PORTAL_USER:{id:'advisor',email:'advisor@college.edu'}});assert.equal(response.status,200);return(await response.json()).items;};
  assert.equal((await leads('college-one')).length,2);
  assert.equal((await call('/profile',{method:'DELETE',user:'alice',body:{confirmation:'delete'}})).status,400);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM college_interest_requests WHERE user_id=? AND withdrawn_at IS NULL').get('alice').n,2);
  DB.sqlite.exec("CREATE TRIGGER fail_portal_delete BEFORE DELETE ON portal_profiles WHEN OLD.id='alice' BEGIN SELECT RAISE(ABORT,'test atomic failure'); END");
  assert.equal((await call('/profile',{method:'DELETE',user:'alice',body:{confirmation:'DELETE MY PORTAL DATA'}})).status,500);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM college_interest_requests WHERE user_id=? AND withdrawn_at IS NULL').get('alice').n,2);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM college_access_audit WHERE action='withdraw'").get().n,0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans WHERE user_id=?').get('alice').n,1);
  DB.sqlite.exec('DROP TRIGGER fail_portal_delete');
  assert.equal((await call('/profile',{method:'DELETE',user:'alice',body:{confirmation:'DELETE MY PORTAL DATA'}})).status,200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM college_interest_requests WHERE user_id=? AND withdrawn_at IS NULL').get('alice').n,0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles WHERE id=?').get('alice').n,0);
  assert.equal((await leads('college-two')).length,0);assert.deepEqual((await leads('college-one')).map(row=>row.contactEmail),['bob@private.invalid']);
  assert.equal((await call('/plans/'+bob.id,{user:'bob'})).status,200);
  const audit=DB.sqlite.prepare("SELECT * FROM college_access_audit WHERE action='withdraw'").all();assert.equal(audit.length,2);assert(audit.every(row=>row.actor_id==='alice'&&row.note==='Portal data deleted'));assert(!JSON.stringify(audit).includes('@private.invalid'));assert(!JSON.stringify(audit).includes('Private Alice'));
});
test('malformed, unsupported, excessively deep and oversized snapshots are rejected',async t=>{
  const{call}=fixture(t);const save=state=>call('/plans',{method:'POST',user:'alice',body:{title:'Mine',state,consent:true}});
  for(const state of [null,[],{version:2,profile:{},learning:[]},{version:3,profile:[],learning:[]},{version:3,profile:{},learning:{}},draft({learning:Array.from({length:2001},()=>({}))})])assert.equal((await save(state)).status,400);
  const hostile=JSON.parse(JSON.stringify(draft()).replace('"scenarios":','"__proto__":{},"scenarios":'));assert.equal((await save(hostile)).status,400);
  let deep={};for(let i=0;i<35;i++)deep={child:deep};assert.equal((await save(draft({deep}))).status,400);
  const large=draft({large:'a'.repeat(524288)});assert.equal((await save(large)).status,413);
  const malformed=await call('/plans',{method:'POST',user:'alice',body:{},headers:{'Content-Type':'application/json'},...{body:'invalid'}});assert.equal(malformed.status,400);
});
test('write limits stop runaway saves without overwriting existing records',async t=>{
  const{call,create}=fixture(t);const saved=await create();
  for(let current=1;current<60;current++){
    const response=await call('/plans/'+saved.id,{method:'PUT',user:'alice',body:{title:'Mine',state:draft(),revision:current}});assert.equal(response.status,200);
  }
  const limited=await call('/plans/'+saved.id,{method:'PUT',user:'alice',body:{title:'Unwanted',state:draft(),revision:60}});assert.equal(limited.status,429);
  assert.equal((await call('/plans/'+saved.id,{user:'alice'})).body.item.revision,60);
});
