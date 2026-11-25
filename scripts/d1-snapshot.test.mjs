import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,stat,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {canonicalJSON,tableDigest,snapshotContentDigest,createTrustedDatabase,readDatabaseSnapshot,verifySnapshot,restoreSnapshot,planSnapshotImport,compareSnapshots,SNAPSHOT_LIMITS,SnapshotError,main} from './d1-snapshot.mjs';
import {handleOperatorSnapshot} from '../server/operator-snapshot.mjs';

const root=resolve(import.meta.dirname,'..'),owner='sb-11111111-1111-4111-8111-111111111111',sourceOrigin='https://source.synthetic.invalid';
const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const table=(snapshot,name)=>snapshot.tables.find(item=>item.name===name);
function rehash(snapshot){snapshot.schemaSha256=hash(snapshot.schema);for(const item of snapshot.tables){item.count=item.rows.length;item.sha256=tableDigest(item.rows);}snapshot.sha256=snapshotContentDigest(snapshot);return snapshot;}
function fixture(t){
 const db=createTrustedDatabase();t.after(()=>db.close());
 const note='Synthetic private note: quarter credits stay quarter credits. "Quotes" and \\slashes, 漢字 and emoji 🎓.\n'.repeat(150);
 const state={version:3,profile:{school:'Synthetic College',degree:'Synthetic degree'},learning:[{id:'synthetic-original',provider:'Synthetic College',credits:4,creditSystem:'quarter',status:'earned',evaluations:[{programId:'synthetic-degree',requirementId:'math',status:'confirmed',receivingCredits:3}]}],sheet:{notes:{private:note}}};
 db.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'Synthetic owner','owner',1,2);
 db.prepare('INSERT INTO portal_profiles(id,alias,created_at,updated_at) VALUES(?,?,?,?)').run(owner,"'); DROP TABLE portal_plans; --",1,2);
 db.prepare('INSERT INTO portal_plans(id,user_id,title,school,degree,state_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('synthetic-plan',owner,'Synthetic plan','Synthetic College','Synthetic degree',JSON.stringify(state),7,1,2);
 db.prepare('INSERT INTO ai_service_connections(id,ciphertext,iv,revision,verified_at,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('anthropic',Buffer.from('Synthetic encrypted placeholder, never an actual credential.').toString('base64'),'a'.repeat(24),3,2,owner,1,2);
 db.prepare('INSERT INTO ai_connection_events(id,service,actor_id,action,revision,source,created_at) VALUES(?,?,?,?,?,?,?)').run('synthetic-connection-event','anthropic',owner,'connect',3,'managed',2);
 db.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('synthetic-post',owner,'school:synthetic','question','Synthetic question','Synthetic community text.',1,2);
 const comments=db.prepare('INSERT INTO community_comments(id,user_id,context,parent_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
 comments.run('synthetic-parent',owner,'post:synthetic-post',null,'ZZZ parent sorts after its child',1,2);
 comments.run('synthetic-child',owner,'post:synthetic-post','synthetic-parent','AAA child sorts before its parent',2,2);
 db.prepare('INSERT INTO degree_templates(id,canonical_key,school_name,program_name,level,modality,catalog_year,status,artifact_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('tpl-synthetic','synthetic|degree|2026','Synthetic College','Synthetic degree','bachelor','online','2026','draft',JSON.stringify({title:'Synthetic degree',requirements:[{id:'synthetic-requirement',credits:3,notes:note}]}),1,2);
 db.prepare('INSERT INTO template_requests(id,user_id,template_id,details,created_at) VALUES(?,?,?,?,?)').run('synthetic-request',owner,'tpl-synthetic','Synthetic request',1);
 db.prepare('INSERT INTO academic_fact_reviews(fact_id,evidence_fingerprint,registry_revision,revision,decision,note,source_ids_json,attestation,reviewer_id,last_event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-fact','a'.repeat(64),'academic-v1:'+('b'.repeat(64)),2,'needs-evidence','Synthetic evidence review retains its exact source scope.','["synthetic-source"]',0,owner,'synthetic-review-event',1,2);
 db.prepare('INSERT INTO academic_fact_review_events(id,fact_id,evidence_fingerprint,registry_revision,revision,decision,note,source_ids_json,attestation,reviewer_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-review-event','synthetic-fact','a'.repeat(64),'academic-v1:'+('b'.repeat(64)),2,'needs-evidence','Synthetic evidence review retains its exact source scope.','["synthetic-source"]',0,owner,2);
 const snapshot=readDatabaseSnapshot(db,{sourceOrigin,createdAt:'2026-11-18T00:00:00.000Z'});
 return{db,snapshot,state,note};
}
const rejected=(fn,code)=>assert.throws(fn,error=>error instanceof SnapshotError&&(!code||error.code===code));

test('full snapshot restores all 57 tables with original JSON, units, revisions and encrypted text intact',t=>{
 const f=fixture(t),result=restoreSnapshot(f.snapshot,{expectedOrigin:sourceOrigin,expectedSha256:f.snapshot.sha256});t.after(()=>result.database.close());
 assert.equal(result.report.tableCount,57);assert.equal(result.report.integrity,'ok');assert.equal(result.report.foreignKeyViolations,0);assert.equal(result.report.cutoverVerified,false);
 const restored=result.database.prepare('SELECT state_json,revision FROM portal_plans').get();assert.equal(restored.state_json,JSON.stringify(f.state));assert.equal(restored.revision,7);
 assert.equal(JSON.parse(restored.state_json).learning[0].creditSystem,'quarter');assert.equal(JSON.parse(restored.state_json).learning[0].evaluations[0].status,'confirmed');
 assert.equal(result.database.prepare('SELECT ciphertext FROM ai_service_connections').get().ciphertext,f.db.prepare('SELECT ciphertext FROM ai_service_connections').get().ciphertext);
 assert.equal(result.database.prepare('SELECT alias FROM portal_profiles').get().alias,"'); DROP TABLE portal_plans; --");
 assert.equal(result.database.prepare('SELECT revision,registry_revision,evidence_fingerprint FROM academic_fact_reviews').get().revision,2);assert.equal(result.database.prepare('SELECT registry_revision FROM academic_fact_review_events').get().registry_revision,'academic-v1:'+('b'.repeat(64)));
 assert(table(f.snapshot,'degree_templates').rows[0].artifact_json.length>10000,'Exercise cells larger than model projections');
 const safe=JSON.stringify(result.report);assert(!safe.includes(f.note.slice(0,80)));assert(!safe.includes(owner));assert(!safe.includes('ciphertext'));
});

test('actual atomic exporter output verifies and restores through the independent offline importer',async t=>{
 const f=fixture(t),key='a'.repeat(64),executed=[];
 const DB={prepare(sql){assert.match(sql,/^(?:WITH|SELECT)\b/);return{sql};},async batch(statements){assert.equal(statements.length,3);f.db.exec('BEGIN');try{const results=statements.map(statement=>{executed.push(statement.sql);return{success:true,results:f.db.prepare(statement.sql).all()};});f.db.exec('COMMIT');return results;}catch(error){f.db.exec('ROLLBACK');throw error;}}};
 const response=await handleOperatorSnapshot(new Request(sourceOrigin+'/api/operations/snapshot',{method:'POST',headers:{'X-DegreeSteps-Export-Key':key,'Content-Type':'application/json'},body:'{}'}),{DB,OPERATOR_EXPORT_ORIGIN:sourceOrigin,OPERATOR_EXPORT_EXPIRES_AT:new Date(Date.now()+60000).toISOString(),OPERATOR_EXPORT_TOKEN_SHA256:createHash('sha256').update(key).digest('hex')});
 assert.equal(response.status,200,await response.clone().text());const snapshot=await response.json(),verified=verifySnapshot(snapshot,{expectedOrigin:sourceOrigin,expectedSha256:f.snapshot.sha256});
 assert.equal(verified.sha256,f.snapshot.sha256);assert.equal(verified.tableCount,57);assert.equal(executed.length,3);assert.equal(table(snapshot,'portal_plans').rows[0].state_json,JSON.stringify(f.state));
});

test('offline restore accepts bounded anonymous aggregates while keeping the original private-table cap',t=>{
 const f=fixture(t),insert=f.db.prepare("INSERT INTO growth_daily_counts(day,event,context,plan_id,count) VALUES(?,'landing_view','home','',1)");
 for(let n=0;n<1500;n++)insert.run(new Date(Date.UTC(2020,0,1+n)).toISOString().slice(0,10));
 const snapshot=readDatabaseSnapshot(f.db,{sourceOrigin}),result=restoreSnapshot(snapshot);t.after(()=>result.database.close());assert.equal(result.database.prepare('SELECT count(*) AS n FROM growth_daily_counts').get().n,1500);assert.equal(result.database.prepare('SELECT state_json FROM portal_plans').get().state_json,JSON.stringify(f.state));
 const privateOverflow=clone(snapshot),rows=table(privateOverflow,'portal_profiles').rows;
 while(rows.length<=1000)rows.push({...rows[0],id:'private-profile-'+rows.length});rehash(privateOverflow);rejected(()=>verifySnapshot(privateOverflow),'snapshot_too_large');
 const renamed=clone(snapshot);table(renamed,'portal_plans').name='growth_daily_counts';rehash(renamed);rejected(()=>verifySnapshot(renamed),'schema_mismatch');
});

test('restoration defers foreign keys so canonical row order can put child comments before parents',t=>{
 const f=fixture(t),rows=table(f.snapshot,'community_comments').rows;
 assert.equal(rows[0].id,'synthetic-child');assert.equal(rows[1].id,'synthetic-parent');
 const restored=restoreSnapshot(f.snapshot);t.after(()=>restored.database.close());assert.equal(restored.database.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('signed 64-bit SQLite INTEGER boundaries round-trip as decimal strings without JS number rounding',t=>{
 const f=fixture(t),insert=f.db.prepare('INSERT INTO ai_connection_rate_limits(user_id,window_start,count) VALUES(?,?,1)');
 insert.run('synthetic-max','9223372036854775807');insert.run('synthetic-min','-9223372036854775808');
 const snapshot=readDatabaseSnapshot(f.db,{sourceOrigin}),restored=restoreSnapshot(snapshot);t.after(()=>restored.database.close());
 const values=restored.database.prepare('SELECT CAST(window_start AS TEXT) AS value FROM ai_connection_rate_limits ORDER BY user_id').all().map(row=>row.value);
 assert.deepEqual(values,['9223372036854775807','-9223372036854775808']);assert.equal(restored.report.sha256,snapshot.sha256);
});

test('content comparison ignores capture origin/time and row order but detects exact course-data changes',t=>{
 const f=fixture(t),copy=clone(f.snapshot);copy.sourceOrigin='https://destination.synthetic.invalid';copy.createdAt='2026-11-19T00:00:00.000Z';table(copy,'community_comments').rows.reverse();
 assert.equal(compareSnapshots(f.snapshot,copy).equal,true);
 const changed=clone(copy),row=table(changed,'portal_plans').rows[0],state=JSON.parse(row.state_json);state.learning[0].credits=5;row.state_json=JSON.stringify(state);rehash(changed);
 const diff=compareSnapshots(f.snapshot,changed);assert.equal(diff.equal,false);assert.deepEqual(diff.changedTables,['portal_plans']);assert(!JSON.stringify(diff).includes('Synthetic private note'));
});

test('missing tables, unknown tables/columns and bounded tool projections are rejected as incomplete exports',t=>{
 const f=fixture(t);
 const missing=clone(f.snapshot);missing.tables.pop();rejected(()=>verifySnapshot(missing),'incomplete_snapshot');
 const unknown=clone(f.snapshot);unknown.tables[0].name='unrecognized_table';rejected(()=>verifySnapshot(unknown),'schema_mismatch');
 const column=clone(f.snapshot);table(column,'portal_plans').rows[0].extra_private_field='not allowed';rejected(()=>verifySnapshot(column),'invalid_shape');
 const projection=clone(f.snapshot);projection.model_projection={truncated:true,truncated_values:2};rejected(()=>verifySnapshot(projection),'invalid_shape');
 const partial=clone(f.snapshot);table(partial,'portal_plans').count=2;rejected(()=>verifySnapshot(partial),'incomplete_snapshot');
});

test('table, schema and root digests cannot be silently changed or mismatched against the expected export',t=>{
 const f=fixture(t);
 const tableChange=clone(f.snapshot);table(tableChange,'portal_plans').rows[0].title='Changed';rejected(()=>verifySnapshot(tableChange),'digest_mismatch');
 const schemaChange=clone(f.snapshot);schemaChange.schema[0].sql='Changed';rejected(()=>verifySnapshot(schemaChange),'digest_mismatch');
 const rootChange=clone(f.snapshot);rootChange.sha256='0'.repeat(64);rejected(()=>verifySnapshot(rootChange),'digest_mismatch');
 rejected(()=>verifySnapshot(f.snapshot,{expectedSha256:'0'.repeat(64)}),'source_mismatch');
 rejected(()=>verifySnapshot(f.snapshot,{expectedOrigin:'https://other.synthetic.invalid'}),'source_mismatch');
});

test('snapshot SQL is compared against trusted migrations and is never executed',async t=>{
 const f=fixture(t),directory=await mkdtemp(resolve(tmpdir(),'degreesteps-snapshot-sql-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const injected=clone(f.snapshot),path=resolve(directory,'must-not-exist.sqlite');injected.schema.find(row=>row.type==='table').sql+="; ATTACH DATABASE '"+path+"' AS stolen";rehash(injected);
 rejected(()=>verifySnapshot(injected),'schema_mismatch');await assert.rejects(access(path));
});

test('duplicate primary keys and missing owner foreign keys cannot become a valid import plan',t=>{
 const f=fixture(t),duplicate=clone(f.snapshot);table(duplicate,'portal_plans').rows.push(clone(table(duplicate,'portal_plans').rows[0]));rehash(duplicate);
 rejected(()=>planSnapshotImport(duplicate),'constraint_violation');
 const wrongOwner=clone(f.snapshot);table(wrongOwner,'portal_plans').rows[0].user_id='nonexistent-synthetic-owner';rehash(wrongOwner);rejected(()=>verifySnapshot(wrongOwner),'constraint_violation');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM portal_plans').get().n,1,'The original database is not modified by verification');
});

test('INTEGER coercions, unsafe ranges, unknown JSON cells and incomplete row fields fail closed',t=>{
 const f=fixture(t);
 for(const value of [7,'01','-0','1.5','9223372036854775808','-9223372036854775809',null]){
  const snapshot=clone(f.snapshot);table(snapshot,'portal_plans').rows[0].revision=value;rehash(snapshot);rejected(()=>verifySnapshot(snapshot));
 }
 const objectCell=clone(f.snapshot);table(objectCell,'portal_plans').rows[0].state_json={version:3};rehash(objectCell);rejected(()=>verifySnapshot(objectCell),'invalid_cell');
 const absent=clone(f.snapshot);delete table(absent,'portal_plans').rows[0].state_json;rehash(absent);rejected(()=>verifySnapshot(absent),'invalid_shape');
});

test('per-row and per-table budgets reject oversized exports rather than dropping content',t=>{
 const f=fixture(t),rowLarge=clone(f.snapshot);table(rowLarge,'degree_templates').rows[0].school_name='x'.repeat(SNAPSHOT_LIMITS.rowBytes);rehash(rowLarge);rejected(()=>verifySnapshot(rowLarge),'snapshot_too_large');
 const countLarge=clone(f.snapshot),users=table(countLarge,'community_users');users.rows=Array.from({length:1001},(_,index)=>({...users.rows[0],id:'synthetic-user-'+index}));rehash(countLarge);rejected(()=>verifySnapshot(countLarge),'snapshot_too_large');
});

test('import plans contain parameterized INSERTs only and require an empty atomic destination',t=>{
 const f=fixture(t),plan=planSnapshotImport(f.snapshot);assert.equal(plan.requiresEmptyDestination,true);assert.equal(plan.requiresAtomicBatch,true);assert.equal(plan.overwritesExisting,false);assert.equal(plan.cutoverVerified,false);
 assert.equal(plan.statements[0].sql,'PRAGMA defer_foreign_keys=ON');assert.equal(plan.statements.at(-1).sql,'PRAGMA foreign_key_check');
 for(const statement of plan.statements.slice(1,-1)){assert.match(statement.sql,/^INSERT INTO "[a-z_]+" /);assert(!statement.sql.includes(' ON CONFLICT'));assert(!statement.sql.includes('DROP TABLE'));assert(Array.isArray(statement.params));}
 const restored=createTrustedDatabase();t.after(()=>restored.close());restored.exec('BEGIN');for(const statement of plan.statements){if(statement.params.length)restored.prepare(statement.sql).run(...statement.params);else restored.exec(statement.sql);}restored.exec('COMMIT');
 assert.equal(readDatabaseSnapshot(restored,{sourceOrigin}).sha256,f.snapshot.sha256);
});

test('CLI verification prints a safe report, writes private plans only to explicit 0600 new files, and refuses tracked paths',async t=>{
 const f=fixture(t),directory=await mkdtemp(resolve(tmpdir(),'degreesteps-snapshot-cli-'));t.after(()=>rm(directory,{recursive:true,force:true}));const input=resolve(directory,'source.json'),out=resolve(directory,'import-plan.json');await writeFile(input,JSON.stringify(f.snapshot),{mode:0o600});
 const cli=async(...args)=>{const lines=[],logger=t.mock.method(console,'log',value=>lines.push(String(value)));try{await main(args);return lines.join('\n');}finally{logger.mock.restore();}};
 const verified=await cli('--verify',input,'--expect-origin',sourceOrigin);assert.equal(JSON.parse(verified).tableCount,57);assert(!verified.includes('Synthetic private note'));
 await cli('--plan',input,'--out',out);assert.equal((await stat(out)).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(out,'utf8')).sourceSha256,f.snapshot.sha256);
 await assert.rejects(cli('--plan',input,'--out',out),undefined,'An existing file is not overwritten');
 const forbidden=resolve(root,'dist/must-not-write-private-plan.json');await assert.rejects(cli('--plan',input,'--out',forbidden),error=>error.code==='unsafe_output');await assert.rejects(access(forbidden));
 const publicOutput=resolve(root,'outputs/cloudflare/public/must-not-write-private-plan.json');await assert.rejects(cli('--plan',input,'--out',publicOutput),error=>error.code==='unsafe_output');await assert.rejects(access(publicOutput));
 const same=await cli('--compare',input,input);assert.equal(JSON.parse(same).equal,true);
});

test('malformed CLI input does not echo private text and invalid UTF-8 is rejected',async t=>{
 const directory=await mkdtemp(resolve(tmpdir(),'degreesteps-snapshot-bad-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const[filename,content]of[['bad.json','Synthetic private content that must never be printed'],['bad-utf8.json',Buffer.from([0x7b,0x22,0xff,0x22,0x7d])]]){
  const input=resolve(directory,filename);await writeFile(input,content);await assert.rejects(main(['--verify',input]),error=>error.code==='invalid_json'&&!error.message.includes('Synthetic private content'));
 }
});
