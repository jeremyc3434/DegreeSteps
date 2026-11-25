/** Synthetic local SQLite query-shape checks, not hosted throughput claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCommunity} from './community.mjs';

const origin='https://community-scale.example';
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
function fixture(t,{populated=false,migrationCount=journal.entries.length}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const entry of journal.entries.slice(0,migrationCount))sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
 t.after(()=>sqlite.close());const statements=[];
 const DB={prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i,'Request paths may not change the schema');const query=sqlite.prepare(sql);return{bind(...args){return{async first(){statements.push({sql,args,method:'first'});return query.get(...args)||null;},async all(){statements.push({sql,args,method:'all'});return{results:query.all(...args)};},async run(){statements.push({sql,args,method:'run'});return{meta:{changes:Number(query.run(...args).changes)}};}};}};},async batch(items){sqlite.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const env={DB,COMMUNITY_ADMIN_EMAIL:'owner@example.invalid'};
 const user=sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES (?,?,?,?,?)');
 for(const [id,alias,role]of[['alice','Alice','member'],['bob','Bob','member'],['viewer','Returning learner','member'],['owner','Owner','owner']])user.run(id,alias,role,1,1);
 if(populated){
  const post=sqlite.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
  const reaction=sqlite.prepare('INSERT INTO community_reactions(post_id,user_id,reaction,created_at) VALUES (?,?,?,?)');
  const comment=sqlite.prepare('INSERT INTO community_comments(id,user_id,context,body,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)');
  sqlite.exec('BEGIN');
  for(let n=0;n<10000;n++){const id='p'+String(n).padStart(5,'0'),stamp=100000+n;post.run(id,n%2?'bob':'alice',n%3?'school:tesu':'school:liberty',n%5?'question':'template','Synthetic transfer question '+n,'Synthetic course-planning discussion',stamp,stamp);reaction.run(id,'alice','like',stamp);reaction.run(id,'bob','upvote',stamp);if(n%3===0)reaction.run(id,'viewer','like',stamp);comment.run('c'+String(n).padStart(5,'0')+'a','viewer','post:'+id,'Synthetic active reply',stamp,stamp,null);comment.run('c'+String(n).padStart(5,'0')+'b','viewer','post:'+id,'Synthetic reply, sometimes removed',stamp,stamp,n%2?stamp+1:null);}
  sqlite.exec('COMMIT');
 }
 async function call(path,{user,method='GET',body,email}={}){const headers={};if(user)headers['oai-authenticated-user-id']=user;if(email)headers['oai-authenticated-user-email']=email;if(method!=='GET')Object.assign(headers,{Origin:origin,'Content-Type':'application/json','X-Community-Request':'1'});const response=await handleCommunity(new Request(origin+'/api/community'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{});return{status:response.status,body:await response.json(),headers:response.headers};}
 return{sqlite,statements,call};
}
const writes=statements=>statements.filter(item=>item.method==='run');

test('a populated feed aggregates one bounded page in one snapshot with indexed activity lookups',async t=>{
 const f=fixture(t,{populated:true});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n,10000);
 assert(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reactions').get().n>20000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_comments').get().n,20000);
 const response=await f.call('/feed?limit=50');assert.equal(response.status,200);assert.equal(response.body.items.length,50);assert(response.body.cursor);
 assert.equal(f.statements.length,1,'Anonymous page reads must remain a single database statement');
 const query=f.statements[0];assert.match(query.sql,/post_page AS MATERIALIZED/);assert.match(query.sql,/LIMIT \?/);assert.equal(query.args[0],51,'Only the bounded page plus one cursor row is materialized');
 const plan=f.sqlite.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.args).map(row=>row.detail).join('\n');
 assert.match(plan,/SEARCH p USING INDEX community_posts_feed/);
 assert.match(plan,/SEARCH r USING COVERING INDEX .*post_id=\?/);
 assert.match(plan,/SEARCH c USING COVERING INDEX community_comments_context .*context=\? AND deleted_at=\?/);
 assert.doesNotMatch(plan,/CORRELATED SCALAR SUBQUERY/,'Counts and personal flags must not execute separately for every returned post');
 assert.equal(writes(f.statements).length,0);
 for(const row of response.body.items){const n=Number(row.id.slice(1));assert.equal(row.likes,n%3===0?2:1);assert.equal(row.upvotes,1);assert.equal(row.comments,n%2?1:2);assert.equal(row.liked,false);assert.equal(row.upvoted,false);}
 const second=await f.call('/feed?limit=50&cursor='+encodeURIComponent(response.body.cursor));assert.equal(second.status,200);assert.equal(second.body.items.length,50);assert(!second.body.items.some(row=>response.body.items.some(first=>first.id===row.id)));
});

test('guide classification stays covering and page-bounded without reading comment bodies',async t=>{
 const f=fixture(t,{populated:true});
 const user=f.sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES (?,?,\'member\',1,1)');
 user.run('ds-guide-planning','DegreeSteps Planning Guide');user.run('ds-guide-transfers','DegreeSteps Transfer Guide');
 const post=f.sqlite.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at) VALUES (?,\'ds-guide-planning\',\'school:tesu\',\'question\',\'Prepared planning example\',\'An openly editorial planning example.\',?,?)');
 const comment=f.sqlite.prepare('INSERT INTO community_comments(id,user_id,context,body,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)');
 f.sqlite.exec('BEGIN');
 for(let n=0;n<200;n++){const id='guide-'+n;post.run(id,200000+n,200000+n);for(let answer=0;answer<2;answer++)comment.run(id+'-answer-'+answer,'ds-guide-transfers','post:'+id,'Prepared answer outside the selected student page.',200000+n,200000+n,null);}
 comment.run('guide-kept-one','ds-guide-planning','post:p09999','A'.repeat(2999),300000,300000,null);
 comment.run('guide-kept-two','ds-guide-transfers','post:p09999','B'.repeat(2999),300001,300001,null);
 comment.run('guide-removed','ds-guide-planning','post:p09999','Removed editorial answer',300002,300002,300003);
 comment.run('real-added','alice','post:p09999','A real additional student reply',300004,300004,null);
 f.sqlite.exec('COMMIT');
 const response=await f.call('/feed?limit=50');assert.equal(response.status,200);assert.equal(response.body.items.length,50);assert(response.body.items.every(row=>!row.origin));
 assert.equal(f.statements.length,1,'A full student page does not query unrelated prepared threads');
 const query=f.statements[0];assert.equal(query.args[0],51);assert.match(query.sql,/post_page AS MATERIALIZED/);
 const plan=f.sqlite.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.args).map(row=>row.detail).join('\n');
 assert.match(plan,/SEARCH c USING COVERING INDEX community_comments_context .*context=\? AND deleted_at=\?/);
 assert.doesNotMatch(plan,/SCAN c\b|CORRELATED SCALAR SUBQUERY/);
 const commentRoot=f.sqlite.prepare("SELECT rootpage FROM sqlite_schema WHERE type='table' AND name='community_comments'").get().rootpage;
 const indexRoot=f.sqlite.prepare("SELECT rootpage FROM sqlite_schema WHERE type='index' AND name='community_comments_context'").get().rootpage;
 const instructions=f.sqlite.prepare('EXPLAIN '+query.sql).all(...query.args);
 assert(instructions.some(row=>row.opcode==='OpenRead'&&row.p2===indexRoot),'SQLite opens the covering comment index');
 assert(!instructions.some(row=>row.opcode==='OpenRead'&&row.p2===commentRoot),'SQLite never opens the comment table or its large bodies for feed counts');
 const target=response.body.items.find(row=>row.id==='p09999');assert.equal(target.comments,4);assert.equal(target.guideAnswers,2);assert.equal(target.studentComments,2);
 assert(response.body.items.filter(row=>row.id!=='p09999').every(row=>row.guideAnswers===0));
 assert.equal(writes(f.statements).length,0);
});

test('the covering-index migration preserves existing discussion rows and chronological index prefix',async t=>{
 const migrationIndex=journal.entries.findIndex(entry=>entry.tag==='0018_community_comment_authors');assert(migrationIndex>=0,'Exercise the appended index-only migration');
 const migration=journal.entries[migrationIndex],f=fixture(t,{migrationCount:migrationIndex});
 assert.deepEqual(f.sqlite.prepare("PRAGMA index_info('community_comments_context')").all().map(row=>row.name),['context','deleted_at','created_at','id']);
 f.sqlite.prepare("INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES ('ds-guide-planning','DegreeSteps Planning Guide','member',1,1)").run();
 f.sqlite.prepare("INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at) VALUES ('existing-thread','alice','school:tesu','question','An existing thread','Original public text',1,1)").run();
 const insert=f.sqlite.prepare('INSERT INTO community_comments(id,user_id,context,body,created_at,updated_at,deleted_at) VALUES (?,?,\'post:existing-thread\',?,?,?,?)');
 insert.run('existing-student','alice','Student text with a newline.\nKeep punctuation & Unicode ✓.',1,1,null);
 insert.run('existing-guide','ds-guide-planning','Prepared guide answer',2,2,null);
 insert.run('existing-removed','bob','Removed text stays removed',3,3,4);
 const before=f.sqlite.prepare('SELECT * FROM community_comments ORDER BY id').all();
 f.sqlite.exec(readFileSync(new URL('../drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM community_comments ORDER BY id').all(),before);
 assert.deepEqual(f.sqlite.prepare("PRAGMA index_info('community_comments_context')").all().map(row=>row.name),['context','deleted_at','created_at','id','user_id']);
 const response=await f.call('/posts/existing-thread');assert.equal(response.status,200);assert.equal(response.body.item.comments,2);assert.equal(response.body.item.guideAnswers,1);assert.equal(response.body.item.studentComments,1);
});

test('returning members and already-bootstrapped owners browse without database writes',async t=>{
 const f=fixture(t,{populated:true});
 for(const [user,email]of[['viewer','viewer@example.invalid'],['owner','owner@example.invalid']]){f.statements.length=0;const response=await f.call('/feed?limit=50',{user,email});assert.equal(response.status,200);assert.equal(f.statements.length,2,'An existing member lookup plus one bounded page statement');assert.equal(writes(f.statements).length,0,'Reading the feed must not create redundant identity writes');if(user==='viewer')for(const row of response.body.items){const n=Number(row.id.slice(1));assert.equal(row.liked,n%3===0);assert.equal(row.upvoted,false);}assert(!JSON.stringify(response.body).includes(email));}
 assert.equal(f.sqlite.prepare('SELECT alias FROM community_users WHERE id=?').get('viewer').alias,'Returning learner');
});

test('preexisting rows and subsequent idempotent reactions and soft-deleted comments retain exact totals',async t=>{
 const f=fixture(t,{populated:true}),path='/posts/p09998',initial=await f.call(path,{user:'viewer'});assert.equal(initial.body.item.likes,1);assert.equal(initial.body.item.upvotes,1);assert.equal(initial.body.item.comments,2);
 for(let attempt=0;attempt<2;attempt++){const response=await f.call(path+'/reactions',{method:'POST',user:'viewer',body:{reaction:'upvote',active:true}});assert.equal(response.status,200);assert.equal(response.body.item.upvotes,2);assert.equal(response.body.item.upvoted,true);}
 const removed=await f.call(path+'/reactions',{method:'POST',user:'viewer',body:{reaction:'upvote',active:false}});assert.equal(removed.body.item.upvotes,1);assert.equal(removed.body.item.upvoted,false);
 assert.equal((await f.call('/comments/c09998b',{method:'DELETE',user:'viewer'})).status,200);
 assert.equal((await f.call(path,{user:'viewer'})).body.item.comments,1);
 assert.equal((await f.call('/context?context=post:p09998',{user:'viewer'})).body.comments,1);
 assert.equal((await f.call(path,{method:'DELETE',user:'bob'})).status,403);
 assert.equal((await f.call(path,{method:'DELETE',user:'alice'})).status,200);
 assert.equal((await f.call(path)).status,404);
 assert(!(await f.call('/feed?limit=50')).body.items.some(row=>row.id==='p09998'));
});

test('editorial context reactions use one aggregate pass and count only live comments',async t=>{
 const f=fixture(t),insert=f.sqlite.prepare('INSERT INTO community_context_reactions(context,user_id,reaction,created_at) VALUES (?,?,?,?)');insert.run('school:tesu','alice','like',1);insert.run('school:tesu','viewer','like',1);insert.run('school:tesu','viewer','upvote',1);f.sqlite.prepare('INSERT INTO community_comments(id,user_id,context,body,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)').run('kept','alice','school:tesu','An active comment',1,1,null);f.sqlite.prepare('INSERT INTO community_comments(id,user_id,context,body,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)').run('removed','alice','school:tesu','A removed comment',1,1,2);
 const response=await f.call('/context?context=school:tesu',{user:'viewer'});assert.equal(response.status,200);assert.deepEqual(response.body,{context:'school:tesu',likes:2,upvotes:1,liked:true,upvoted:true,comments:1});assert.equal(f.statements.length,2);assert.equal(writes(f.statements).length,0);const query=f.statements[1],plan=f.sqlite.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.args).map(row=>row.detail).join('\n');assert.match(plan,/SEARCH community_context_reactions USING COVERING INDEX .*context=\?/);assert.equal((query.sql.match(/FROM community_context_reactions/g)||[]).length,1);
 assert.deepEqual((await f.call('/context?context=school:empty')).body,{context:'school:empty',likes:0,upvotes:0,liked:false,upvoted:false,comments:0});
});

test('first sign-in creates one member and later owner promotion remains durable without repeated writes',async t=>{
 const f=fixture(t);const first=await f.call('/session',{user:'new-member'});assert.equal(first.status,200);assert.equal(first.body.user.role,'member');assert.equal(writes(f.statements).length,1);f.statements.length=0;assert.equal((await f.call('/session',{user:'new-member'})).status,200);assert.equal(writes(f.statements).length,0);
 f.statements.length=0;const promoted=await f.call('/session',{user:'new-member',email:'owner@example.invalid'});assert.equal(promoted.body.user.role,'owner');assert.equal(writes(f.statements).length,1);f.statements.length=0;assert.equal((await f.call('/session',{user:'new-member',email:'owner@example.invalid'})).body.user.role,'owner');assert.equal(writes(f.statements).length,0);
});
