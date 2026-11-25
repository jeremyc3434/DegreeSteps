/** Editorial-source behavior against real SQLite; no production data or auth accounts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommunity } from './community.mjs';
import { publicCommunityCache } from './public-community-cache.mjs';

const origin='https://degreesteps.example';
const guides=[
  ['ds-guide-planning','DegreeSteps Planning Guide'],['ds-guide-transfers','DegreeSteps Transfer Guide'],
  ['ds-guide-courses','DegreeSteps Course Guide'],['ds-guide-campus','DegreeSteps Campus Guide'],
  ['ds-guide-military','DegreeSteps Military Guide'],['ds-guide-careers','DegreeSteps Career Guide'],
  ['ds-guide-money','DegreeSteps Cost Guide'],['ds-guide-momentum','DegreeSteps Study Guide']
];
const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(schema);t.after(()=>sqlite.close());
  const DB={prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i,'No runtime schema changes');const query=sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const env={DB,COMMUNITY_ADMIN_EMAIL:'owner@example.invalid'};
  function user(id,alias='Student member',role='member'){sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,1,1) ON CONFLICT(id) DO NOTHING').run(id,alias,role);}
  function post(id,author,stamp,{context='school:tesu',kind='question',deleted=false,title='A planning question'}={}){user(author);sqlite.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,author,context,kind,title,'An openly prepared planning example with a source to confirm.',stamp,stamp,deleted?stamp+1:null);}
  function comment(id,author,postId,stamp,{parentId=null,deleted=false,context='post:'+postId}={}){user(author);sqlite.prepare('INSERT INTO community_comments(id,user_id,context,parent_id,body,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?)').run(id,author,context,parentId,'A prepared guide answer or real student reply.',stamp,stamp,deleted?stamp+1:null);}
  async function call(path,{method='GET',actor,email,body}={}){const headers={};if(actor)headers['oai-authenticated-user-id']=actor;if(email)headers['oai-authenticated-user-email']=email;if(method!=='GET'){headers.Origin=origin;headers['X-Community-Request']='1';headers['Content-Type']='application/json';}const response=await handleCommunity(new Request(origin+'/api/community'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{});return{status:response.status,body:await response.json()};}
  for(const[id]of guides)user(id,'An untrusted stored nickname');
  return{sqlite,DB,env,user,post,comment,call};
}
const question=extra=>({kind:'question',context:'school:tesu',title:'A real student question',body:'Which current school rule applies to my plan?',...extra});
function sourceFixture(f){
  f.post('student-new','alice',20);f.post('student-old','bob',10);
  f.post('guide-new','ds-guide-planning',40);f.post('guide-old','ds-guide-transfers',30);
}

test('all eight trusted non-login authors receive explicit editorial origin and canonical guide names',async t=>{
  const registry=JSON.parse(readFileSync(new URL('../content/community/starter-profiles.json',import.meta.url),'utf8'));
  assert.deepEqual(registry.profiles.map(({id,alias})=>[id,alias]),guides,'Published guide identities and API attribution agree');
  const f=fixture(t);for(const[id]of guides){f.post('post-'+id,id,100);f.comment('comment-'+id,id,'post-'+id,101);}
  const feed=await f.call('/feed?source=starters');assert.equal(feed.body.items.length,8);
  for(const[id,alias]of guides){const post=feed.body.items.find(row=>row.id==='post-'+id);assert.equal(post.origin,'degreesteps-starter');assert.deepEqual(post.author,{alias,isYou:false,kind:'degreesteps-guide'});assert.equal(post.guideAnswers,1);assert.equal(post.studentComments,0);assert.equal(post.likes,0);assert.equal(post.upvotes,0);const comments=await f.call('/comments?context=post:'+post.id);assert.equal(comments.body.items[0].origin,'degreesteps-starter');assert.deepEqual(comments.body.items[0].author,{alias,isYou:false,kind:'degreesteps-guide'});}
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reactions').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n,0);
});
test('reserved guide identities cannot sign in, bootstrap owners, edit profiles, post, react or submit evidence',async t=>{
  const f=fixture(t);f.post('starter-thread','ds-guide-planning',1);
  for(const[id]of guides){for(const[path,method,body]of [['/session','GET'],['/profile','POST',{alias:'Real learner'}],['/posts','POST',question()],['/comments','POST',{context:'post:starter-thread',body:'A fake student reply'}],['/posts/starter-thread/reactions','POST',{reaction:'like',active:true}],['/evidence','POST',{}]])assert.equal((await f.call(path,{method,body,actor:id,email:'owner@example.invalid'})).status,401,path+' '+id);}
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM community_users WHERE role='owner'").get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_comments').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n,0);
});
test('a student cannot earn editorial labels through alias, prefix, or writable payload fields',async t=>{
  const f=fixture(t);f.user('alice','DegreeSteps Planning Guide');
  for(const alias of [...guides.map(([,alias])=>alias),'  degreesteps   planning guide  ','DEGREESTEPS PLANNING GUIDE'])assert.equal((await f.call('/profile',{method:'POST',actor:'alice',body:{alias}})).status,400);
  for(const extra of [{origin:'degreesteps-starter'},{author:{kind:'degreesteps-guide'}},{source:'starters'}])assert.equal((await f.call('/posts',{method:'POST',actor:'alice',body:question(extra)})).status,400);
  assert.equal((await f.call('/profile',{method:'POST',actor:'alice',body:{alias:'DegreeSteps Planning Guide',origin:'degreesteps-starter'}})).status,400);
  const created=await f.call('/posts',{method:'POST',actor:'alice',body:question()});assert.equal(created.status,201);assert.equal(created.body.item.origin,undefined);assert.equal(created.body.item.author.kind,undefined);assert.equal(created.body.item.author.alias,'DegreeSteps Planning Guide');
  f.user('ds-guide-planning-extra','DegreeSteps Planning Guide');f.post('prefix-lookalike','ds-guide-planning-extra',1);const lookalike=await f.call('/posts/prefix-lookalike');assert.equal(lookalike.body.item.origin,undefined);assert.equal(lookalike.body.item.author.kind,undefined);
  f.post('ds-starter-0123456789abcdef0123','alice',1);assert.equal((await f.call('/posts/ds-starter-0123456789abcdef0123')).body.item.origin,undefined);
  assert.equal((await f.call('/feed?source=starters')).body.items.length,0);
  f.post('unrelated-publication-id','ds-guide-planning',2);assert.equal((await f.call('/posts/unrelated-publication-id')).body.item.origin,'degreesteps-starter');
});
test('fresh default feed puts every real student post before newer prepared threads',async t=>{
  const f=fixture(t);sourceFixture(f);const result=await f.call('/feed');assert.deepEqual(result.body.items.map(row=>row.id),['student-new','student-old','guide-new','guide-old']);assert.equal(result.body.cursor,null);
  const students=await f.call('/feed?source=students'),starters=await f.call('/feed?source=starters');assert.deepEqual(students.body.items.map(row=>row.id),['student-new','student-old']);assert.deepEqual(starters.body.items.map(row=>row.id),['guide-new','guide-old']);
});
test('phase-aware pagination crosses the student/starter boundary once without gaps or duplicates',async t=>{
  const f=fixture(t);sourceFixture(f);f.post('student-tie-z','charlie',20);f.post('student-tie-a','dana',20);f.post('guide-tie-z','ds-guide-money',40);const expected=['student-tie-z','student-tie-a','student-new','student-old','guide-tie-z','guide-new','guide-old'];
  for(const limit of [1,2,3,5]){let cursor=null,ids=[],phases=[];for(let i=0;i<10;i++){const result=await f.call('/feed?limit='+limit+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(result.status,200);ids.push(...result.body.items.map(row=>row.id));cursor=result.body.cursor;if(!cursor)break;const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());assert.equal(decoded[0],'feed-v1');phases.push(decoded[2]);}assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,expected.length);assert(!phases.some((phase,i)=>phase===0&&phases.slice(0,i).includes(1)));}
});
test('source filters retain exact context, kind and signed-in mine constraints across pages',async t=>{
  const f=fixture(t);sourceFixture(f);f.post('guide-liberty','ds-guide-campus',60,{context:'school:liberty'});f.post('student-template','alice',50,{kind:'template'});
  assert.deepEqual((await f.call('/feed?source=starters&context=school:liberty')).body.items.map(row=>row.id),['guide-liberty']);assert.deepEqual((await f.call('/feed?source=students&kind=template')).body.items.map(row=>row.id),['student-template']);
  assert.equal((await f.call('/feed?source=students&mine=1')).status,401);assert.deepEqual((await f.call('/feed?source=students&mine=1',{actor:'alice'})).body.items.map(row=>row.id),['student-template','student-new']);assert.deepEqual((await f.call('/feed?source=starters&mine=1',{actor:'alice'})).body.items,[]);
  const first=await f.call('/feed?source=starters&limit=1');assert(first.body.cursor);const second=await f.call('/feed?source=starters&limit=1&cursor='+encodeURIComponent(first.body.cursor));assert.notEqual(second.body.items[0].id,first.body.items[0].id);
});
test('legacy two-part feed cursors keep chronological continuation and generic comments stay compatible',async t=>{
  const f=fixture(t);sourceFixture(f);let result=await f.call('/feed?limit=1&cursor='+encoded([40,'guide-new']));assert.equal(result.body.items[0].id,'guide-old');assert.equal(JSON.parse(Buffer.from(result.body.cursor,'base64url').toString()).length,2);result=await f.call('/feed?limit=10&cursor='+encodeURIComponent(result.body.cursor));assert.deepEqual(result.body.items.map(row=>row.id),['student-new','student-old']);
  f.comment('answer-one','ds-guide-planning','guide-new',1);f.comment('student-answer','alice','guide-new',2);f.comment('answer-three','ds-guide-courses','guide-new',3);
  const comments=await f.call('/comments?context=post:guide-new&limit=1');const commentCursor=JSON.parse(Buffer.from(comments.body.cursor,'base64url').toString());assert.equal(commentCursor.length,2);const more=await f.call('/comments?context=post:guide-new&limit=5&cursor='+encodeURIComponent(comments.body.cursor));assert.deepEqual(more.body.items.map(row=>row.id),['student-answer','answer-one']);
});
test('invalid source and phase cursors are rejected without weakening other pagination endpoints',async t=>{
  const f=fixture(t);sourceFixture(f);const cursor=(await f.call('/feed?limit=1')).body.cursor;
  for(const query of ['source=unknown','source=','source=students&source=starters','source=starters&cursor='+encodeURIComponent(cursor),'cursor='+encoded(['feed-v1','all',2,20,'student-new']),'cursor='+encoded(['feed-v1','all',0,-1,'student-new']),'cursor='+encoded(['feed-v1','all',0,20,'bad/id'])])assert.equal((await f.call('/feed?'+query)).status,400,query);
  assert.equal((await f.call('/comments?context=post:guide-new&cursor='+encodeURIComponent(cursor))).status,400);
});
test('two prepared answers start at zero student replies and live interactions update only real counts',async t=>{
  const f=fixture(t);f.post('guide-thread','ds-guide-planning',1);f.comment('guide-answer-one','ds-guide-transfers','guide-thread',2);f.comment('guide-answer-two','ds-guide-money','guide-thread',3);
  let item=(await f.call('/posts/guide-thread')).body.item;assert.equal(item.comments,2);assert.equal(item.guideAnswers,2);assert.equal(item.studentComments,0);assert.equal(item.likes,0);assert.equal(item.upvotes,0);
  let summary=(await f.call('/context?context=post:guide-thread')).body;assert.equal(summary.guideAnswers,2);assert.equal(summary.studentComments,0);
  const reply=await f.call('/comments',{method:'POST',actor:'alice',body:{context:'post:guide-thread',parentId:'guide-answer-one',body:'How would this apply to my own credits?'}});assert.equal(reply.status,201);assert.equal(reply.body.item.author.kind,undefined);assert.equal(reply.body.item.origin,undefined);
  assert.equal((await f.call('/posts/guide-thread/reactions',{method:'POST',actor:'alice',body:{reaction:'upvote',active:true}})).status,200);await f.call('/posts/guide-thread/reactions',{method:'POST',actor:'alice',body:{reaction:'upvote',active:true}});
  item=(await f.call('/posts/guide-thread')).body.item;assert.equal(item.comments,3);assert.equal(item.guideAnswers,2);assert.equal(item.studentComments,1);assert.equal(item.upvotes,1);assert.equal((await f.call('/feed?source=students')).body.items.length,0);summary=(await f.call('/context?context=post:guide-thread')).body;assert.equal(summary.studentComments,1);
});
test('context discovery counts only live exact-scope starter threads and direct guide answers remain distinct',async t=>{
  const f=fixture(t);sourceFixture(f);f.post('guide-removed','ds-guide-campus',60,{deleted:true});f.post('guide-other-school','ds-guide-campus',60,{context:'school:liberty'});let result=await f.call('/context?context=school:tesu');assert.equal(result.body.starterDiscussions,2);assert.equal(result.body.comments,0);f.comment('direct-guide','ds-guide-courses',null,4,{context:'school:tesu'});f.comment('direct-student','alice',null,5,{context:'school:tesu'});result=await f.call('/context?context=school:tesu');assert.equal(result.body.guideAnswers,1);assert.equal(result.body.studentComments,1);assert.equal(result.body.starterDiscussions,2);assert.equal((await f.call('/context?context=school:liberty')).body.starterDiscussions,1);
});
test('reports and moderator removal work for starter posts and guide answers without privileged student edits',async t=>{
  const f=fixture(t);f.post('guide-thread','ds-guide-planning',1);f.comment('guide-answer','ds-guide-courses','guide-thread',2);
  assert.equal((await f.call('/posts/guide-thread',{method:'PATCH',actor:'alice',body:question()})).status,403);assert.equal((await f.call('/comments/guide-answer',{method:'DELETE',actor:'alice'})).status,403);
  assert.equal((await f.call('/reports',{method:'POST',actor:'alice',body:{targetType:'comment',targetId:'guide-answer',reason:'The linked policy has changed.'}})).status,201);
  const queue=await f.call('/moderation/reports',{actor:'owner',email:'owner@example.invalid'});assert.equal(queue.body.items.length,1);const report=queue.body.items[0];assert.equal((await f.call('/moderation/reports/'+report.id,{method:'PATCH',actor:'owner',body:{status:'reviewed',removeTarget:true}})).status,200);
  let detail=await f.call('/posts/guide-thread');assert.equal(detail.body.item.guideAnswers,0);assert.equal(detail.body.item.studentComments,0);assert.equal((await f.call('/posts/guide-thread',{method:'DELETE',actor:'owner'})).status,200);assert.deepEqual((await f.call('/feed?source=starters')).body.items,[]);assert.equal((await f.call('/context?context=school:tesu')).body.starterDiscussions,undefined);assert.equal((await f.call('/comments?context=post:guide-thread')).status,404);
});
test('the student phase excludes removed posts while all origins retain ordinary public access controls',async t=>{
  const f=fixture(t);sourceFixture(f);f.post('deleted-real','alice',100,{deleted:true});f.post('deleted-guide','ds-guide-planning',101,{deleted:true});const result=await f.call('/feed');assert.deepEqual(result.body.items.map(row=>row.id),['student-new','student-old','guide-new','guide-old']);assert(result.body.items.every(row=>!row.canEdit&&!row.canDelete));assert.equal((await f.call('/posts/deleted-guide')).status,404);
});
test('anonymous source filters use distinct short-lived cache entries and authenticated requests bypass caching',async()=>{
  const entries=new Map(),pending=[],cache={async match(request){return entries.get(request.url)?.clone()||null;},async put(request,response){entries.set(request.url,response.clone());}},ctx={waitUntil(value){pending.push(value);}},anonymous={user:null,setCookies:[]};
  const request=source=>new Request(origin+'/api/community/feed?source='+source);
  const students=await publicCommunityCache(request('students'),anonymous,{cache,now:()=>1000});assert(students);students.store(Response.json({items:[{id:'real-student'}]}),ctx);await Promise.all(pending);
  assert((await publicCommunityCache(request('students'),anonymous,{cache,now:()=>1001})).hit);assert.equal((await publicCommunityCache(request('starters'),anonymous,{cache,now:()=>1001})).hit,null);assert.equal((await publicCommunityCache(request('all'),anonymous,{cache,now:()=>1001})).hit,null);assert.equal(await publicCommunityCache(request('students'),{user:{id:'alice'},setCookies:[]},{cache}),null);assert.equal(await publicCommunityCache(new Request(origin+'/api/community/feed?source=all&source=students'),anonymous,{cache}),null);
});
