import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema.mjs';
import {D1_SNAPSHOT_TABLES,D1_SNAPSHOT_SCHEMA} from '../db/d1-snapshot-registry.mjs';
import {handleOperatorSnapshot} from './operator-snapshot.mjs';

const origin='https://operator-source.synthetic.invalid',key='a'.repeat(64);
const tokenHash=createHash('sha256').update(key).digest('hex');
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.prepared=[];this.batches=0;this.returnedDataRows=null;this.sqlite.exec('PRAGMA foreign_keys=ON');for(const migration of journal.entries)this.sqlite.exec(readFileSync(new URL('../drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));}
  prepare(sql){this.prepared.push(sql);assert.match(sql,/^(?:WITH|SELECT)\b/);return{sql};}
  async batch(statements){this.batches++;assert.equal(statements.length,3);this.sqlite.exec('BEGIN');try{const results=statements.map(statement=>({success:true,results:this.sqlite.prepare(statement.sql).all()}));this.returnedDataRows=results[1].results;this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function fixture(t,overrides={}){const DB=new D1();t.after(()=>DB.sqlite.close());return{DB,env:{DB,OPERATOR_EXPORT_TOKEN_SHA256:tokenHash,OPERATOR_EXPORT_EXPIRES_AT:new Date(Date.now()+20*60000).toISOString(),OPERATOR_EXPORT_ORIGIN:origin,...overrides}};}
const request=({url=origin+'/api/operations/snapshot',method='POST',body={},headers={}}={})=>new Request(url,{method,headers:{'X-DegreeSteps-Export-Key':key,'Content-Type':'application/json',...headers},...(['GET','HEAD'].includes(method)?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
async function call(env,options){const response=await handleOperatorSnapshot(request(options),env);return{response,status:response?.status,data:response?await response.json():null};}
function seedUser(DB,id='synthetic-user',alias='Synthetic owner',created=1){DB.sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES (?,?,\'owner\',?,2)').run(id,alias,created);}
function seedTemplate(DB,{id='tpl-'+('1'.repeat(32)),artifact=JSON.stringify({title:'Synthetic plan'})}={}){DB.sqlite.prepare("INSERT INTO degree_templates(id,canonical_key,school_name,program_name,level,modality,catalog_year,status,artifact_json,created_at,updated_at) VALUES (?,?,'Synthetic University','Synthetic Degree','bachelor','online','2026-2027','draft',?,1,2)").run(id,id,artifact);}

test('fixed registry exactly covers every migration-owned table and column type',t=>{
  const f=fixture(t),expected=Object.values(schema).map(table=>{const value=getTableConfig(table);return{name:value.name,columns:value.columns.map(column=>({name:column.name,type:column.getSQLType()}))};}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  assert.equal(expected.length,29);assert.deepEqual(D1_SNAPSHOT_TABLES,expected);
  const actual=f.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(row=>row.name);assert.deepEqual(actual,expected.map(table=>table.name));
  for(const table of expected)assert.deepEqual(f.DB.sqlite.prepare('PRAGMA table_info("'+table.name+'")').all().map(column=>({name:column.name,type:column.type.toLowerCase()})),table.columns);
  assert.deepEqual(D1_SNAPSHOT_SCHEMA.map(row=>({...row})),f.DB.sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().filter(row=>actual.includes(row.tbl_name)&&['table','index','trigger'].includes(row.type)).map(row=>({...row})));
});

test('export stays disabled by default and accepts no student identity as operator authorization',async t=>{
  const f=fixture(t);assert.equal(await handleOperatorSnapshot(new Request(origin+'/api/portal/session'),f.env),null);
  for(const env of [{},{...f.env,OPERATOR_EXPORT_TOKEN_SHA256:undefined},{...f.env,OPERATOR_EXPORT_EXPIRES_AT:new Date(Date.now()-1).toISOString()},{...f.env,OPERATOR_EXPORT_EXPIRES_AT:new Date(Date.now()+61*60000).toISOString()},{...f.env,OPERATOR_EXPORT_ORIGIN:origin+'/path'}]){const result=await call(env);assert.equal(result.status,404);assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);}
  for(const headers of [{'X-DegreeSteps-Export-Key':''},{'X-DegreeSteps-Export-Key':'b'.repeat(64)},{'X-DegreeSteps-Export-Key':'a'.repeat(63),Cookie:'__Host-degreepath_access=pretend','Authorization':'Bearer pretend'}]){const result=await call({...f.env,PORTAL_USER:{id:'owner',role:'owner'}},{headers});assert.equal(result.status,401);assert(!JSON.stringify(result.data).includes(key));}
  assert.equal((await call(f.env,{url:'https://different.synthetic.invalid/api/operations/snapshot'})).status,404);assert.equal(f.DB.batches,0);assert.equal(f.DB.prepared.length,0);
});

test('method, query, body and content type cannot select SQL or alter the fixed export',async t=>{
  const f=fixture(t);assert.equal((await call(f.env,{method:'GET'})).status,405);assert.equal((await call(f.env,{method:'GET'})).response.headers.get('Allow'),'POST');
  for(const options of [{url:origin+'/api/operations/snapshot?table=community_users'},{body:{sql:'DELETE FROM community_users'}},{body:[]},{body:'not-json'}])assert.equal((await call(f.env,options)).status,400);
  assert.equal((await call(f.env,{headers:{'Content-Type':'text/plain'}})).status,415);assert.equal((await call(f.env,{body:{data:'x'.repeat(300)}})).status,413);assert.equal(f.DB.batches,0);
});

test('one atomic read batch preserves complete large text, nulls, exact int64 values and encrypted cells',async t=>{
  const f=fixture(t),large=JSON.stringify({title:'Synthetic plan',detail:'Course evidence "quoted" 🧭 \\ newline\n'.repeat(4500)});
  assert(Buffer.byteLength(large)>100000);seedUser(f.DB,'synthetic-user','Synthetic owner',9223372036854775807n);seedTemplate(f.DB,{artifact:large});
  f.DB.sqlite.prepare("INSERT INTO ai_service_connections(id,ciphertext,iv,revision,verified_at,updated_by,created_at,updated_at) VALUES ('anthropic',?, ?,1,1,'synthetic-user',1,2)").run('ciphertext-fixture-'.repeat(4),'a'.repeat(24));
  const before=f.DB.sqlite.prepare('SELECT total_changes() AS n').get().n,result=await call(f.env);assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(f.DB.batches,1);assert.equal(f.DB.prepared.length,3);assert(f.DB.prepared.every(sql=>sql.length<100000),'D1 statement text remains under its documented bound');assert(f.DB.prepared.every(sql=>!(/\bUNION\b/i.test(sql))),'Avoid Cloudflare compound-SELECT limits rather than relying on local SQLite limits');assert.equal(f.DB.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
  assert.equal(result.data.format,'degreesteps-d1-snapshot');assert.equal(result.data.version,1);assert.equal(result.data.integerEncoding,'decimal-string');assert.equal(result.data.tables.length,29);assert.equal(result.data.sourceOrigin,origin);assert(!Number.isNaN(Date.parse(result.data.createdAt)));
  const templates=result.data.tables.find(table=>table.name==='degree_templates');assert.equal(templates.rows[0].artifact_json,large);assert.equal(templates.rows[0].source_url,null);
  assert.equal(result.data.tables.find(table=>table.name==='community_users').rows[0].created_at,'9223372036854775807');assert.equal(result.data.tables.find(table=>table.name==='ai_service_connections').rows[0].ciphertext,'ciphertext-fixture-'.repeat(4));
  assert(result.data.schema.some(row=>row.type==='index'&&row.sql===null));assert(!result.data.schema.some(row=>row.tbl_name==='sqlite_sequence'));
  assert.equal(result.data.schemaSha256,hash(result.data.schema));for(const table of result.data.tables){assert.equal(table.count,table.rows.length);assert.equal(table.sha256,hash(table.rows));}
  assert.equal(result.data.sha256,hash({format:result.data.format,version:result.data.version,integerEncoding:result.data.integerEncoding,schemaSha256:result.data.schemaSha256,tables:result.data.tables.map(({name,columns,count,sha256})=>({name,columns,count,sha256}))}));
  assert.equal(result.response.headers.get('Cache-Control'),'private, no-store');assert.equal(result.response.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.match(result.response.headers.get('Content-Disposition'),/attachment/);assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);
});

test('digests and row ordering do not depend on insertion order, source origin or export timestamp',async t=>{
  const a=fixture(t),b=fixture(t,{OPERATOR_EXPORT_ORIGIN:'https://other-source.synthetic.invalid'});seedUser(a.DB,'second-user','Second owner');seedUser(a.DB,'first-user','First owner');seedUser(b.DB,'first-user','First owner');seedUser(b.DB,'second-user','Second owner');
  const first=await call(a.env),second=await call(b.env,{url:'https://other-source.synthetic.invalid/api/operations/snapshot'});assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.data.sha256,second.data.sha256);assert.deepEqual(first.data.tables,second.data.tables);
});

test('oversized tables refuse the entire snapshot without returning truncated rows',async t=>{
  const f=fixture(t);const insert=f.DB.sqlite.prepare("INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES (?,'Synthetic member','member',1,2)");for(let n=0;n<1001;n++)insert.run('synthetic-user-'+n);
  const result=await call(f.env);assert.equal(result.status,413);assert.equal(result.data.code,'snapshot_too_large');assert(!Object.hasOwn(result.data,'tables'));assert.deepEqual(f.DB.returnedDataRows,[]);
});

test('row byte caps and unknown schema refuse a misleading partial export',async t=>{
  const large=fixture(t);seedTemplate(large.DB);large.DB.sqlite.prepare('UPDATE degree_templates SET unresolved_json=?').run(JSON.stringify(['x'.repeat(1100000)]));
  const tooLarge=await call(large.env);assert.equal(tooLarge.status,413);assert.equal(tooLarge.data.code,'snapshot_too_large');assert.deepEqual(large.DB.returnedDataRows,[]);
  const unknown=fixture(t);unknown.DB.sqlite.exec('CREATE TABLE unknown_application_records(id text)');assert.equal((await call(unknown.env)).data.code,'snapshot_schema_mismatch');
  const drift=fixture(t);drift.DB.sqlite.exec('ALTER TABLE community_users ADD COLUMN unexpected text');assert.equal((await call(drift.env)).data.code,'snapshot_schema_mismatch');
});

test('global row caps reject a database whose individual tables remain below their limits',async t=>{
  const f=fixture(t),users=f.DB.sqlite.prepare("INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES (?,'Synthetic member','member',1,2)"),profiles=f.DB.sqlite.prepare("INSERT INTO portal_profiles(id,alias,created_at,updated_at) VALUES (?,'Synthetic student',1,2)"),communityRates=f.DB.sqlite.prepare("INSERT INTO community_rate_limits(user_id,action,window_start,count) VALUES (?,'profile',1,1)"),portalRates=f.DB.sqlite.prepare("INSERT INTO portal_rate_limits(user_id,action,window_start,count) VALUES (?,'profile',1,1)"),reactions=f.DB.sqlite.prepare("INSERT INTO community_context_reactions(context,user_id,reaction,created_at) VALUES ('school:synthetic',?,'like',1)");
  for(let n=0;n<1000;n++){const id='synthetic-'+n;users.run(id);profiles.run(id);communityRates.run(id);portalRates.run(id);reactions.run(id);}
  f.DB.sqlite.prepare("INSERT INTO community_posts(id,user_id,context,kind,title,body,created_at,updated_at) VALUES ('one-post','synthetic-0','school:synthetic','question','Synthetic question','Synthetic content',1,2)").run();
  const result=await call(f.env);assert.equal(result.status,413);assert.equal(result.data.code,'snapshot_too_large');assert.deepEqual(f.DB.returnedDataRows,[]);
});

test('global encoded-byte caps stop data transfer even when rows and tables individually fit',async t=>{
  const f=fixture(t),artifact=JSON.stringify({detail:'x'.repeat(490000)});
  for(let n=0;n<3;n++)seedTemplate(f.DB,{id:'tpl-'+String(n+1).repeat(32),artifact});
  const cache=f.DB.sqlite.prepare("INSERT INTO curriculum_source_cache(cache_key,program_id,payload_json,checked_at,expires_at) VALUES (?,'synthetic-program',?,'2026-11-01','2026-12-01')");
  for(let n=0;n<2;n++)cache.run('cache-'+n,JSON.stringify({detail:'x'.repeat(790000)}));
  f.DB.sqlite.prepare("INSERT INTO portal_profiles(id,alias,created_at,updated_at) VALUES ('synthetic-portal','Synthetic student',1,2)").run();
  const plans=f.DB.sqlite.prepare("INSERT INTO portal_plans(id,user_id,title,state_json,created_at,updated_at) VALUES (?,'synthetic-portal','Synthetic plan',?,1,2)");
  for(let n=0;n<3;n++)plans.run('private-plan-'+n,artifact);
  const result=await call(f.env);assert.equal(result.status,413);assert.equal(result.data.code,'snapshot_too_large');assert.deepEqual(f.DB.returnedDataRows,[]);
});

test('database failures are private and never leak query text or stored source records',async t=>{
  const f=fixture(t,{DB:{prepare(sql){return{sql};},async batch(){throw Error('Sensitive stored record and SQL should not escape');}}});
  const result=await call(f.env);assert.equal(result.status,503);assert.equal(result.data.code,'snapshot_unavailable');assert(!JSON.stringify(result.data).includes('Sensitive'));assert(!JSON.stringify(result.data).includes(key));
  assert.equal(result.data.operatorDiagnostic,'d1_unknown');
});

test('schema mismatch exposes bounded operator-only DDL metadata without any stored rows',async t=>{
  const f=fixture(t);seedUser(f.DB,'synthetic-owner','PRIVATE SOURCE RECORD');f.DB.sqlite.exec('ALTER TABLE community_users ADD COLUMN unexpected_metadata text');
  const result=await call(f.env);assert.equal(result.status,503);assert.equal(result.data.code,'snapshot_schema_mismatch');assert(Array.isArray(result.data.operatorSchema));assert(result.data.operatorSchema.some(row=>row.name==='community_users'&&row.sql.includes('unexpected_metadata')));
  assert(result.data.operatorSchema.every(row=>Object.keys(row).sort().join(',')==='name,sql,tbl_name,type'));assert(result.data.operatorSchema.length<=256);assert(Buffer.byteLength(JSON.stringify(result.data.operatorSchema))<=128*1024);assert(!Object.hasOwn(result.data,'tables'));assert(!JSON.stringify(result.data).includes('PRIVATE SOURCE RECORD'));assert(!JSON.stringify(result.data).includes(key));
  const unauthorized=await call(f.env,{headers:{'X-DegreeSteps-Export-Key':'b'.repeat(64)}});assert.equal(unauthorized.status,401);assert(!Object.hasOwn(unauthorized.data,'operatorSchema'));
  const disabled=await call({...f.env,OPERATOR_EXPORT_TOKEN_SHA256:undefined});assert.equal(disabled.status,404);assert(!Object.hasOwn(disabled.data,'operatorSchema'));
});

test('the exact managed Sites migration table is internal while other unknown tables still fail closed',async t=>{
  const f=fixture(t);f.DB.sqlite.exec('CREATE TABLE __appgarden_migrations(id text PRIMARY KEY,metadata text)');f.DB.sqlite.prepare('INSERT INTO __appgarden_migrations(id,metadata) VALUES (?,?)').run('synthetic-platform-migration','INTERNAL PLATFORM METADATA');
  const result=await call(f.env);assert.equal(result.status,200);assert.equal(result.data.tables.length,29);assert.equal(result.data.schema.length,99);assert(!result.data.tables.some(table=>table.name==='__appgarden_migrations'));assert(!result.data.schema.some(row=>row.name==='__appgarden_migrations'));assert(!JSON.stringify(result.data).includes('INTERNAL PLATFORM METADATA'));
  f.DB.sqlite.exec('CREATE TABLE __appgarden_other_records(id text)');const unknown=await call(f.env);assert.equal(unknown.status,503);assert.equal(unknown.data.code,'snapshot_schema_mismatch');
});

test('oversized schema diagnostics are omitted completely rather than truncated or returned with data',async t=>{
  for(const kind of ['entries','bytes']){
    const f=fixture(t),batch=f.DB.batch.bind(f.DB);
    f.DB.batch=async statements=>{const results=await batch(statements);if(kind==='entries')for(let n=0;n<256;n++)results[2].results.push({type:'index',name:'synthetic_extra_'+n,tbl_name:'community_users',sql:'CREATE INDEX synthetic_extra_'+n+' ON community_users(id)'});else results[2].results[0].sql='CREATE INDEX synthetic_extra ON community_users(id) /*'+'x'.repeat(129*1024)+'*/';return results;};
    const result=await call(f.env);assert.equal(result.status,503);assert.equal(result.data.code,'snapshot_schema_mismatch');assert(!Object.hasOwn(result.data,'operatorSchema'));assert(!Object.hasOwn(result.data,'tables'));assert(Buffer.byteLength(JSON.stringify(result.data))<1024);
  }
});

test('authorized D1 failure diagnostics expose fixed categories without raw SQL, values or credentials',async t=>{
  for(const [message,expected]of [
    ['parser stack overflow near private_sql_text','d1_parser_limit'],
    ['D1_ERROR: SQL statement too long private_sql_text','d1_query_size_limit'],
    ['no such column: private_column_name','d1_missing_column'],
    ['no such table: private_table_name','d1_missing_table'],
    ['too many SQL queries private_sql_text','d1_query_count_limit'],
    ['not authorized: SQLITE_AUTH private_sql_text','d1_unsupported_operation'],
    ['near private_sql_text: syntax error','d1_sql_syntax'],
    ['database not found private_database_name','d1_binding_unavailable'],
    ['request timed out private_sql_text','d1_timeout']
  ]){
    const f=fixture(t,{DB:{prepare(sql){return{sql};},async batch(){throw new Error('D1_ERROR: request failed',{cause:new Error(message+' '+key)});}}});
    const result=await call(f.env);assert.equal(result.status,503);assert.equal(result.data.operatorDiagnostic,expected);assert(!JSON.stringify(result.data).includes('private_'));assert(!JSON.stringify(result.data).includes(key));
    const unauthorized=await call(f.env,{headers:{'X-DegreeSteps-Export-Key':'b'.repeat(64)}});assert.equal(unauthorized.status,401);assert(!Object.hasOwn(unauthorized.data,'operatorDiagnostic'));
  }
});
