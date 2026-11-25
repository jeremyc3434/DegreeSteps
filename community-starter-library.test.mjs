import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {loadCommunityStarters,communityStarterSQL,communityStarterReport,publishedId} from './scripts/build-community-starters.mjs';
const fixture=()=>({profiles:{profiles:[{id:'ds-guide-planning',alias:'DegreeSteps Planning Guide'},{id:'ds-guide-courses',alias:'DegreeSteps Course Guide'}]},threads:[{id:'example',publishedId:publishedId('example'),authorId:'ds-guide-planning',context:'school:wgu',title:"A student's course choice",body:"Example situation: I'm choosing a course, not reporting a transfer outcome.",url:'https://degreesteps.com/courses.html',replies:[{authorId:'ds-guide-courses',body:"Compare the school's exact receiving course before choosing."},{authorId:'ds-guide-planning',body:'Keep the original course units and review date with your plan.'}]}]});
function db(){const db=new DatabaseSync(':memory:');db.exec(readFileSync('db/schema.sql','utf8'));return db;}
test('the reviewed library contains 200 distinct scenarios, 400 guide answers and eight explicitly editorial profiles',async()=>{
 const data=await loadCommunityStarters(),report=communityStarterReport(data);assert.equal(data.threads.length,200);assert.equal(report.preparedGuideAnswers,400);assert.equal(report.guideProfiles,8);assert.equal(report.simulatedReactions,0);assert.equal(report.simulatedOutcomeReports,0);assert.equal(report.signInAccountsCreated,0);assert.match(data.profiles.disclosure,/not individual students or sign-in accounts/);
 const database=db();try{database.exec(communityStarterSQL(data));assert.equal(database.prepare('SELECT COUNT(*) n FROM community_posts').get().n,200);assert.equal(database.prepare('SELECT COUNT(*) n FROM community_comments').get().n,400);assert.equal(database.prepare('SELECT COUNT(*) n FROM community_users').get().n,8);for(const table of ['community_reactions','community_context_reactions','community_evidence','community_evidence_flags','community_reports'])assert.equal(database.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);assert.equal(database.prepare('SELECT COUNT(*) n FROM community_posts WHERE plan_json IS NOT NULL').get().n,0);}finally{database.close();}
});
test('publication is idempotent, preserves student replies and reactions, and never refreshes unchanged creation or update dates',()=>{
 const database=db(),data=fixture(),post=data.threads[0].publishedId;try{
  const sql=communityStarterSQL(data);database.exec(sql);database.exec("INSERT INTO community_users VALUES ('actual-student','Student','member',1,1)");database.prepare('INSERT INTO community_comments VALUES (?,?,?,?,?,?,?,?)').run('real-reply','actual-student','post:'+post,null,'My real question.',2,2,null);database.prepare('INSERT INTO community_reactions VALUES (?,?,?,?)').run(post,'actual-student','upvote',3);
  const before=database.prepare('SELECT * FROM community_posts WHERE id=?').get(post),comments=database.prepare('SELECT * FROM community_comments ORDER BY id').all();database.exec(sql);assert.deepEqual(database.prepare('SELECT * FROM community_posts WHERE id=?').get(post),before);assert.deepEqual(database.prepare('SELECT * FROM community_comments ORDER BY id').all(),comments);assert.equal(database.prepare('SELECT COUNT(*) n FROM community_reactions').get().n,1);assert.equal(database.prepare('SELECT COUNT(*) n FROM community_users').get().n,3);
 }finally{database.close();}
});
test('later editorial corrections keep original dates and engagement but cannot restore moderated posts or answers',()=>{
 const database=db(),data=fixture(),post=data.threads[0].publishedId,comment=post+'-guide-1';try{
  database.exec(communityStarterSQL(data));const created=database.prepare('SELECT created_at n FROM community_posts WHERE id=?').get(post).n;data.threads[0].body+=' Revised guidance.';database.exec(communityStarterSQL(data));assert.match(database.prepare('SELECT body FROM community_posts WHERE id=?').get(post).body,/Revised guidance/);assert.equal(database.prepare('SELECT created_at n FROM community_posts WHERE id=?').get(post).n,created);
  database.prepare('UPDATE community_comments SET deleted_at=5 WHERE id=?').run(comment);data.threads[0].replies[0].body='This updated answer must stay hidden.';database.exec(communityStarterSQL(data));assert.equal(database.prepare('SELECT deleted_at FROM community_comments WHERE id=?').get(comment).deleted_at,5);assert.notEqual(database.prepare('SELECT body FROM community_comments WHERE id=?').get(comment).body,data.threads[0].replies[0].body);
  database.prepare('UPDATE community_posts SET deleted_at=6 WHERE id=?').run(post);data.threads[0].body='This updated post must stay hidden.';database.exec(communityStarterSQL(data));const row=database.prepare('SELECT * FROM community_posts WHERE id=?').get(post);assert.equal(row.deleted_at,6);assert.notEqual(row.body,data.threads[0].body);
 }finally{database.close();}
});
test('an existing student record cannot be reassigned or overwritten by a colliding editorial ID',()=>{
 const database=db(),data=fixture(),post=data.threads[0].publishedId;try{
  database.exec("INSERT INTO community_users VALUES ('actual-student','Student','member',1,1)");database.prepare('INSERT INTO community_posts (id,user_id,context,kind,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(post,'actual-student','school:wgu','question','A real question','Original real content',1,1);database.exec(communityStarterSQL(data));const row=database.prepare('SELECT * FROM community_posts WHERE id=?').get(post);assert.equal(row.user_id,'actual-student');assert.equal(row.body,'Original real content');assert.equal(database.prepare('SELECT COUNT(*) n FROM community_comments').get().n,0);
 }finally{database.close();}
});
