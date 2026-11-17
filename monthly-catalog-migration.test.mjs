import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const schema=readFileSync(new URL('./db/schema.sql',import.meta.url),'utf8'),migration=readFileSync(new URL('./drizzle/0008_monthly_evidence_catalog.sql',import.meta.url),'utf8');

test('monthly-catalog migration preserves reports, moderation flags and foreign keys inside a transaction',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');db.exec(schema.replace('IN (4,6,9)','IN (4,9)'));
 for(const id of ['student','moderator','reporter'])db.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,'member',1,1);
 db.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,plan_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('legacy-post','student','program:wgu','plan','Legacy public plan','A real public plan fixture.','{}',1,1);
 function add(overrides={}){
  const row={id:'old-course',user_id:'student',target_kind:'course',target_key:'["course","wgu","math","sophia"]',program_id:'wgu',requirement_id:'math',course_id:'sophia',post_id:null,catalog_year:'2026-2027',curriculum_fingerprint:'',outcome:'success',evaluated_on:'2026-11-01',details:'A reviewed historical school outcome.',evidence_url:'https://example.edu/public-proof',consent_at:1,review_status:'reviewed',review_note:'Public proof checked.',reviewed_at:2,reviewed_by:'moderator',created_at:1,updated_at:2,deleted_at:null,...overrides};
  db.prepare('INSERT INTO community_evidence('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));
 }
 add();add({id:'old-plan',target_kind:'plan',target_key:'["plan","legacy-post"]',program_id:null,requirement_id:null,course_id:null,post_id:'legacy-post',catalog_year:'2025',curriculum_fingerprint:'a'.repeat(64),review_status:'dismissed',deleted_at:3});
 db.prepare('INSERT INTO community_evidence_flags(evidence_id,user_id,reason,created_at,resolved_at) VALUES(?,?,?,?,?)').run('old-course','reporter','Please review this outcome.',2,null);
 db.prepare('INSERT INTO community_evidence_flags(evidence_id,user_id,reason,created_at,resolved_at) VALUES(?,?,?,?,?)').run('old-plan','reporter','An already resolved flag.',2,3);
 const before=db.prepare('SELECT * FROM community_evidence ORDER BY id').all(),flags=db.prepare('SELECT * FROM community_evidence_flags ORDER BY evidence_id,user_id').all();
 assert.throws(()=>add({id:'not-yet-monthly',catalog_year:'202605'}),/CHECK/);
 assert.doesNotMatch(migration,/PRAGMA\s+foreign_keys\s*=\s*OFF/i,'Migration must work with active foreign-key enforcement');
 db.exec('BEGIN');try{db.exec(migration);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 assert.deepEqual(db.prepare('SELECT * FROM community_evidence ORDER BY id').all(),before);
 assert.deepEqual(db.prepare('SELECT * FROM community_evidence_flags ORDER BY evidence_id,user_id').all(),flags);
 assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 add({id:'monthly-course',catalog_year:'202605'});assert.equal(db.prepare('SELECT catalog_year FROM community_evidence WHERE id=?').get('monthly-course').catalog_year,'202605');
 assert.throws(()=>add({id:'duplicate-monthly-course',catalog_year:'202605'}),/UNIQUE/);
 assert.throws(()=>db.prepare('INSERT INTO community_evidence_flags(evidence_id,user_id,reason,created_at) VALUES(?,?,?,?)').run('missing-report','reporter','Invalid parent must fail.',4),/FOREIGN KEY/);
 for(const name of ['community_evidence_scope','community_evidence_program','community_evidence_queue','community_evidence_user_scope','community_evidence_flags_queue'])assert(db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('index',name),name+' must survive');
});
