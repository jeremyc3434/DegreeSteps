import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm,access,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createTrustedDatabase,readDatabaseSnapshot,canonicalJSON,tableDigest,snapshotContentDigest,verifySnapshot} from './d1-snapshot.mjs';
import {mergeBootstrapSnapshots,SnapshotMergeError,main} from './merge-bootstrap-snapshot.mjs';

const root=resolve(import.meta.dirname,'..');
const owner='sb-11111111-1111-4111-8111-111111111111';
const sourceOrigin='https://source.synthetic.invalid',bootstrapOrigin='https://bootstrap.synthetic.invalid';
const masterCreatedAt='2026-11-18T03:29:05.000Z',masterStamp=Date.parse(masterCreatedAt);
const createdAt='2026-11-18T03:35:00.000Z';
const oldCipher=Buffer.from('Synthetic old ciphertext, not a real credential. '.repeat(2)).toString('base64');
const newCipher=Buffer.from('Synthetic new ciphertext, not a real credential. '.repeat(2)).toString('base64');
const clone=value=>JSON.parse(JSON.stringify(value));
const table=(snapshot,name)=>snapshot.tables.find(item=>item.name===name);
function rehash(snapshot){for(const item of snapshot.tables){item.count=item.rows.length;item.sha256=tableDigest(item.rows);}snapshot.sha256=snapshotContentDigest(snapshot);return snapshot;}
const options={masterCreatedAt,createdAt,expectedSourceOrigin:sourceOrigin,expectedBootstrapOrigin:bootstrapOrigin};
const rejection=fn=>assert.throws(fn,error=>error instanceof SnapshotMergeError);

function fixture(t){
  const db=createTrustedDatabase();t.after(()=>db.close());
  db.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'Synthetic owner','owner',1,2);
  db.prepare('INSERT INTO portal_profiles(id,alias,created_at,updated_at) VALUES(?,?,?,?)').run(owner,'Synthetic private student',1,2);
  db.prepare('INSERT INTO portal_plans(id,user_id,title,school,degree,state_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('synthetic-plan',owner,'Synthetic plan','Synthetic College','Synthetic degree',JSON.stringify({courses:[{credits:4,creditSystem:'quarter'}],note:'Synthetic private course notes.'}),1,1,2);
  db.prepare('INSERT INTO degree_templates(id,canonical_key,school_name,program_name,level,modality,catalog_year,status,artifact_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('tpl-synthetic','synthetic|degree|2026','Synthetic College','Synthetic degree','bachelor','online','2026','draft',JSON.stringify({requirements:[{credits:3}]}),1,2);
  db.prepare('INSERT INTO ai_service_connections(id,ciphertext,iv,revision,verified_at,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('anthropic',oldCipher,'a'.repeat(24),1,masterStamp-5000,owner,masterStamp-10000,masterStamp-5000);
  db.prepare('INSERT INTO ai_connection_events(id,service,actor_id,action,revision,source,created_at) VALUES(?,?,?,?,?,?,?)').run('event-baseline','anthropic',owner,'connect',1,'managed',masterStamp-5000);
  db.prepare('INSERT INTO ai_connection_rate_limits(user_id,window_start,count) VALUES(?,?,?)').run(owner,Math.floor(masterStamp/3600000)*3600000,1);
  const base=readDatabaseSnapshot(db,{sourceOrigin,createdAt:'2026-11-18T03:29:04.000Z'});
  const source=clone(base),bootstrap=clone(base);source.createdAt=createdAt;bootstrap.createdAt=createdAt;bootstrap.sourceOrigin=bootstrapOrigin;
  table(source,'degree_templates').rows[0].school_name='Fresh source college update';
  const plan=table(source,'portal_plans').rows[0];plan.state_json=JSON.stringify({courses:[{credits:4,creditSystem:'quarter'}],note:'Fresh private notes 🧭 漢字 '.repeat(1500)});plan.revision='2';
  table(source,'ai_connection_events').rows.push({id:'event-source-extra',service:'anthropic',actor_id:owner,action:'test',revision:'1',source:'managed',created_at:String(masterStamp-1000)});
  table(source,'ai_connection_rate_limits').rows[0].count='3';
  const connection=table(bootstrap,'ai_service_connections').rows[0];Object.assign(connection,{ciphertext:newCipher,iv:'b'.repeat(24),revision:'2',verified_at:String(masterStamp+1000),updated_at:String(masterStamp+1000)});
  table(bootstrap,'ai_connection_events').rows.push({id:'event-bootstrap-rotate',service:'anthropic',actor_id:owner,action:'rotate',revision:'2',source:'managed',created_at:String(masterStamp+1000)});
  table(bootstrap,'ai_connection_rate_limits').rows[0].count='2';
  return{base,source:rehash(source),bootstrap:rehash(bootstrap)};
}

test('intentional merge preserves fresh source plans and overlays only the new verified credential tables',t=>{
  const f=fixture(t),before=canonicalJSON(f),result=mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,{...options,expectedBaseSha256:f.base.sha256});
  assert.equal(canonicalJSON(f),before,'Inputs are not mutated');
  const {snapshot,report}=result;assert.equal(verifySnapshot(snapshot).tableCount,29);assert.equal(snapshot.sourceOrigin,sourceOrigin);assert.equal(snapshot.createdAt,createdAt);
  const overlay=new Set(['ai_service_connections','ai_connection_events','ai_connection_rate_limits']);
  for(const item of snapshot.tables)if(!overlay.has(item.name))assert.equal(item.sha256,table(f.source,item.name).sha256,item.name);
  assert.equal(table(snapshot,'ai_service_connections').rows[0].ciphertext,newCipher);
  assert.equal(table(snapshot,'ai_service_connections').rows[0].iv,'b'.repeat(24));
  const ids=table(snapshot,'ai_connection_events').rows.map(row=>row.id).sort();assert.deepEqual(ids,['event-baseline','event-bootstrap-rotate','event-source-extra']);
  assert.equal(table(snapshot,'ai_connection_rate_limits').rows[0].count,'4','Same-window usage subtracts the shared baseline once');
  assert.equal(JSON.parse(table(snapshot,'portal_plans').rows[0].state_json).courses[0].creditSystem,'quarter');
  assert.equal(report.intentionalOverlay,true);assert.equal(report.sourceParity,false);assert.equal(report.cutoverVerified,false);assert.equal(report.mergedSha256,snapshot.sha256);
  assert.deepEqual([...report.changedTables].sort(),[...overlay].sort());
  const safe=JSON.stringify(report);for(const secret of [newCipher,oldCipher,owner,'Fresh private notes'])assert(!safe.includes(secret));
});

test('an unchanged source produces the exact bootstrap content checksum',t=>{
  const f=fixture(t),source=clone(f.base);source.createdAt=createdAt;
  const merged=mergeBootstrapSnapshots(f.base,source,f.bootstrap,options);
  assert.equal(merged.snapshot.sha256,f.bootstrap.sha256);
});

test('an unchanged source also preserves exact bootstrap content after its rate window advances',t=>{
  const f=fixture(t),oldWindow=table(f.base,'ai_connection_rate_limits').rows[0];oldWindow.window_start=String(BigInt(oldWindow.window_start)-3600000n);rehash(f.base);
  const source=clone(f.base);source.createdAt=createdAt;
  assert.equal(mergeBootstrapSnapshots(f.base,source,f.bootstrap,options).snapshot.sha256,f.bootstrap.sha256);
});

test('a first managed connection can be promoted when the baseline has no credential',t=>{
  const f=fixture(t);
  for(const snapshot of [f.base,f.source]){table(snapshot,'ai_service_connections').rows=[];table(snapshot,'ai_connection_events').rows=[];table(snapshot,'ai_connection_rate_limits').rows=[];rehash(snapshot);}
  const row=table(f.bootstrap,'ai_service_connections').rows[0];row.revision='1';row.created_at=row.updated_at;
  table(f.bootstrap,'ai_connection_events').rows=[{id:'event-first-connect',service:'anthropic',actor_id:owner,action:'connect',revision:'1',source:'managed',created_at:row.updated_at}];
  table(f.bootstrap,'ai_connection_rate_limits').rows[0].count='1';rehash(f.bootstrap);
  const merged=mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options).snapshot;
  assert.equal(verifySnapshot(merged).tableCount,29);assert.equal(table(merged,'ai_service_connections').rows[0].ciphertext,newCipher);
});

test('rate merging keeps the latest window and preserves source-only and bootstrap-only users',t=>{
  for(const branch of ['source','bootstrap']){
    const f=fixture(t),earlier=String(Math.floor(masterStamp/3600000)*3600000-3600000);
    for(const snapshot of [f.base,f.source,f.bootstrap])table(snapshot,'ai_connection_rate_limits').rows[0].window_start=earlier;
    const selected=table(f[branch],'ai_connection_rate_limits').rows[0];selected.window_start=String(BigInt(earlier)+3600000n);selected.count='4';
    table(f.source,'ai_connection_rate_limits').rows.push({user_id:'source-rate-user',window_start:earlier,count:'2'});
    table(f.bootstrap,'ai_connection_rate_limits').rows.push({user_id:'bootstrap-rate-user',window_start:selected.window_start,count:'3'});
    rehash(f.base);rehash(f.source);rehash(f.bootstrap);const merged=mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options).snapshot;
    const rates=new Map(table(merged,'ai_connection_rate_limits').rows.map(row=>[row.user_id,row]));
    assert.equal(rates.get(owner).count,'4');assert.equal(rates.get(owner).window_start,selected.window_start);
    assert.equal(rates.get('source-rate-user').count,'2');assert.equal(rates.get('bootstrap-rate-user').count,'3');
  }
});

test('same-window counter regression is rejected rather than granting extra connection attempts',t=>{
  const f=fixture(t);table(f.base,'ai_connection_rate_limits').rows[0].count='4';rehash(f.base);
  rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));
});

test('identical audit IDs are deduplicated and conflicting audit IDs are rejected',t=>{
  const f=fixture(t);assert.equal(mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options).snapshot.tables.find(x=>x.name==='ai_connection_events').count,3);
  table(f.source,'ai_connection_events').rows.push({...table(f.bootstrap,'ai_connection_events').rows.find(row=>row.id==='event-bootstrap-rotate'),action:'test'});rehash(f.source);
  rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));
});

test('unexpected bootstrap changes outside the three credential tables fail closed',t=>{
  const f=fixture(t);table(f.bootstrap,'degree_templates').rows[0].school_name='Unexpected bootstrap change';rehash(f.bootstrap);
  rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));
});

test('source credential changes after the baseline require explicit reconciliation',t=>{
  for(const field of ['verified_at','ciphertext','revision']){
    const f=fixture(t),row=table(f.source,'ai_service_connections').rows[0];
    row[field]=field==='ciphertext'?Buffer.from('Another source ciphertext, never a real key. '.repeat(2)).toString('base64'):String(BigInt(row[field])+1n);rehash(f.source);
    rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));
  }
});

test('the credential actor must remain an existing owner in the fresh source snapshot',t=>{
  for(const remove of [false,true]){
    const f=fixture(t),users=table(f.source,'community_users');if(remove)users.rows=[];else users.rows[0].role='member';rehash(f.source);
    assert.equal(verifySnapshot(f.source).tableCount,29,'The source remains a structurally valid snapshot');
    rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));
  }
});

test('stale, unchanged, malformed or unaudited bootstrap credentials cannot be promoted',t=>{
  for(const change of [
    f=>{table(f.bootstrap,'ai_service_connections').rows[0].ciphertext=oldCipher;},
    f=>{table(f.bootstrap,'ai_service_connections').rows[0].revision='1';},
    f=>{table(f.bootstrap,'ai_service_connections').rows[0].verified_at=String(masterStamp-1);},
    f=>{table(f.bootstrap,'ai_service_connections').rows[0].iv='z'.repeat(24);},
    f=>{table(f.bootstrap,'ai_service_connections').rows[0].ciphertext='!'.repeat(80);},
    f=>{table(f.bootstrap,'ai_connection_events').rows=table(f.bootstrap,'ai_connection_events').rows.filter(row=>row.id!=='event-bootstrap-rotate');},
    f=>{table(f.bootstrap,'ai_connection_events').rows.find(row=>row.id==='event-bootstrap-rotate').source='environment';}
  ]){const f=fixture(t);change(f);rehash(f.bootstrap);rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,options));}
});

test('capture identities, baseline digest and master-key creation time are explicitly checked',t=>{
  const f=fixture(t);
  for(const extra of [{masterCreatedAt:undefined},{masterCreatedAt:'not-a-date'},{expectedBaseSha256:'0'.repeat(64)},{expectedSourceOrigin:'https://different.synthetic.invalid'},{expectedBootstrapOrigin:'https://different.synthetic.invalid'}])rejection(()=>mergeBootstrapSnapshots(f.base,f.source,f.bootstrap,{...options,...extra}));
});

test('CLI writes a new private snapshot, prints only a safe receipt and rejects public output locations',async t=>{
  const f=fixture(t),directory=await mkdtemp(resolve(tmpdir(),'degreesteps-merge-cli-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const files={};for(const [key,value]of Object.entries(f)){files[key]=resolve(directory,key+'.json');await writeFile(files[key],JSON.stringify(value),{mode:0o600});}
  const out=resolve(directory,'merged.json');
  const args=target=>['--base',files.base,'--source',files.source,'--bootstrap',files.bootstrap,'--master-created-at',masterCreatedAt,'--out',target];
  const lines=[],logger=t.mock.method(console,'log',value=>lines.push(String(value)));t.after(()=>logger.mock.restore());
  await main(args(out));assert.equal((await stat(out)).mode&0o777,0o600);const merged=JSON.parse(await readFile(out,'utf8'));assert.equal(verifySnapshot(merged).tableCount,29);
  const output=lines.join('\n');for(const secret of [newCipher,oldCipher,owner,'Fresh private notes'])assert(!output.includes(secret));
  await assert.rejects(main(args(out)),undefined,'Existing files are never overwritten');
  for(const forbidden of [resolve(root,'dist/must-not-write-merged-snapshot.json'),resolve(root,'outputs/cloudflare/public/must-not-write-merged-snapshot.json'),resolve(root,'outputs/site/dist/must-not-write-merged-snapshot.json')]){
    await assert.rejects(main(args(forbidden)));await assert.rejects(access(forbidden));
  }
  const alias=resolve(directory,'public-alias');await symlink(resolve(root,'dist'),alias);
  await assert.rejects(main(args(resolve(alias,'must-not-write-merged-snapshot.json'))));
});

test('CLI refuses nonprivate and malformed input without echoing private content',async t=>{
  const f=fixture(t),directory=await mkdtemp(resolve(tmpdir(),'degreesteps-merge-invalid-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const files={};for(const [key,value]of Object.entries(f)){files[key]=resolve(directory,key+'.json');await writeFile(files[key],JSON.stringify(value),{mode:0o600});}
  const args=['--base',files.base,'--source',files.source,'--bootstrap',files.bootstrap,'--master-created-at',masterCreatedAt,'--out',resolve(directory,'must-not-write.json')];
  await chmod(files.base,0o644);await assert.rejects(main(args));await chmod(files.base,0o600);
  await writeFile(files.source,'PRIVATE malformed input must not be echoed');
  await assert.rejects(main(args),error=>!error.message.includes('PRIVATE malformed input'));
  await assert.rejects(access(resolve(directory,'must-not-write.json')));
});
