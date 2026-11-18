/** Offline, explicit three-table credential overlay. No network or secret decryption. */
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,relative,dirname,basename,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJSON,sortedRows,tableDigest,snapshotContentDigest,verifySnapshot,SNAPSHOT_LIMITS,SnapshotError} from './d1-snapshot.mjs';

const root=resolve(import.meta.dirname,'..');
const overlayNames=['ai_connection_events','ai_connection_rate_limits','ai_service_connections'];
const overlays=new Set(overlayNames),maxInteger=(1n<<63n)-1n;
export class SnapshotMergeError extends Error{constructor(code,message){super(message);this.name='SnapshotMergeError';this.code=code;}}
const fail=(code,message)=>{throw new SnapshotMergeError(code,message);};
const table=(snapshot,name)=>snapshot.tables.find(item=>item.name===name);
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const epoch=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail('invalid_time','Use an explicit ISO timestamp for the server encryption-key creation time.');
  return BigInt(Date.parse(value));
};
function indexed(rows,key){return new Map(rows.map(row=>[row[key],row]));}
function checked(snapshot,options){try{return verifySnapshot(snapshot,options);}catch(error){if(error instanceof SnapshotError)throw new SnapshotMergeError(error.code,error.message);throw error;}}
function retained(baseRows,branchRows,key,code){
  const branch=indexed(branchRows,key);
  for(const row of baseRows)if(!branch.has(row[key])||!equal(row,branch.get(row[key])))fail(code,'An existing connection audit record changed or disappeared. Reconcile it explicitly.');
}
function credential(base,source,bootstrap,masterTime){
  const old=table(base,'ai_service_connections').rows,current=table(bootstrap,'ai_service_connections').rows;
  if(!equal(old,table(source,'ai_service_connections').rows))fail('source_connection_changed','The source connection changed after the baseline. Reconcile it explicitly before selecting a credential.');
  if(current.length!==1)fail('connection_missing','Reconnect Claude successfully on the bootstrap host before merging.');
  const row=current[0],previous=old[0];
  if(row.id!=='anthropic'||typeof row.ciphertext!=='string'||row.ciphertext.length<44||row.ciphertext.length>5600||!/^([A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.ciphertext)||Buffer.from(row.ciphertext,'base64').toString('base64')!==row.ciphertext||!/^([a-f0-9]{24})$/.test(row.iv||''))fail('invalid_credential','The bootstrap connection does not contain a supported encrypted credential.');
  if(BigInt(row.revision)<=BigInt(previous?.revision||'0')||row.ciphertext===previous?.ciphertext||row.iv===previous?.iv)fail('credential_not_rotated','A newly encrypted bootstrap credential is required.');
  const captured=epoch(bootstrap.createdAt);
  if(row.verified_at===null||BigInt(row.verified_at)<masterTime||BigInt(row.updated_at)<masterTime||BigInt(row.updated_at)>BigInt(row.verified_at)||BigInt(row.verified_at)>captured)fail('credential_not_fresh','The bootstrap credential must have a successful check after the new encryption key was installed.');
  if(previous&&row.created_at!==previous.created_at)fail('connection_history_changed','The original connection creation time changed. Reconcile it explicitly.');
  const actor=table(source,'community_users').rows.find(user=>user.id===row.updated_by);
  if(actor?.role!=='owner')fail('owner_missing','The connection actor must still be an owner in the final source snapshot.');
  const baseIDs=new Set(table(base,'ai_connection_events').rows.map(event=>event.id));
  const fresh=table(bootstrap,'ai_connection_events').rows.filter(event=>!baseIDs.has(event.id)&&event.service==='anthropic'&&event.actor_id===row.updated_by&&event.revision===row.revision&&event.source==='managed'&&BigInt(event.created_at)>=masterTime);
  if(!fresh.some(event=>['connect','rotate'].includes(event.action)&&event.created_at===row.updated_at)||!fresh.some(event=>['connect','rotate','test'].includes(event.action)&&event.created_at===row.verified_at))fail('connection_audit_missing','The new encrypted credential needs matching successful owner connection and validation audit records.');
  return current;
}
function mergeEvents(base,source,bootstrap){
  const name='ai_connection_events',before=table(base,name).rows,a=table(source,name).rows,b=table(bootstrap,name).rows;
  retained(before,a,'id','source_audit_changed');retained(before,b,'id','bootstrap_audit_changed');
  const combined=indexed(a,'id');
  for(const row of b){if(combined.has(row.id)&&!equal(row,combined.get(row.id)))fail('audit_conflict','A connection audit identifier has conflicting contents.');combined.set(row.id,row);}
  return [...combined.values()];
}
function mergeRates(base,source,bootstrap){
  const name='ai_connection_rate_limits',before=indexed(table(base,name).rows,'user_id'),a=indexed(table(source,name).rows,'user_id'),b=indexed(table(bootstrap,name).rows,'user_id');
  for(const [id,row] of before)for(const branch of [a,b]){
    const next=branch.get(id);
    if(!next||BigInt(next.window_start)<BigInt(row.window_start)||(next.window_start===row.window_start&&BigInt(next.count)<BigInt(row.count)))fail('rate_limit_regression','A baseline connection rate counter disappeared or regressed.');
  }
  return [...new Set([...a.keys(),...b.keys()])].map(id=>{
    const left=a.get(id),right=b.get(id);if(!left)return right;if(!right)return left;
    if(left.window_start!==right.window_start)return BigInt(left.window_start)>BigInt(right.window_start)?left:right;
    const prior=before.get(id),overlap=prior?.window_start===left.window_start?BigInt(prior.count):0n;
    const count=BigInt(left.count)+BigInt(right.count)-overlap;
    if(count<=0n||count>maxInteger)fail('rate_limit_overflow','The combined connection rate counter is outside supported storage.');
    return{...left,count:count.toString()};
  });
}

/** All input SQL is verified as metadata; only trusted repository migrations execute. */
export function mergeBootstrapSnapshots(base,source,bootstrap,options={}){
  if(Object.keys(options).some(key=>!['masterCreatedAt','createdAt','expectedBaseSha256','expectedSourceOrigin','expectedBootstrapOrigin'].includes(key)))fail('invalid_options','Unknown merge option.');
  const masterTime=epoch(options.masterCreatedAt);
  checked(base,{expectedOrigin:options.expectedSourceOrigin,expectedSha256:options.expectedBaseSha256});
  checked(source,{expectedOrigin:options.expectedSourceOrigin||base.sourceOrigin});
  checked(bootstrap,{expectedOrigin:options.expectedBootstrapOrigin});
  if(epoch(base.createdAt)>masterTime||epoch(source.createdAt)<epoch(base.createdAt)||epoch(bootstrap.createdAt)<masterTime)fail('snapshot_order','Snapshot capture times do not match the baseline and bootstrap sequence.');
  for(const item of base.tables)if(!overlays.has(item.name)&&table(bootstrap,item.name).sha256!==item.sha256)fail('bootstrap_outside_overlay','Bootstrap data changed outside the three permitted connection tables.');
  const connection=credential(base,source,bootstrap,masterTime),events=mergeEvents(base,source,bootstrap),rates=mergeRates(base,source,bootstrap);
  const snapshot=structuredClone(source),createdAt=options.createdAt||new Date().toISOString();
  if(new Date(Number(epoch(createdAt))).toISOString()!==createdAt||epoch(createdAt)<epoch(source.createdAt)||epoch(createdAt)<epoch(bootstrap.createdAt))fail('invalid_merge_time','The merged snapshot timestamp must be canonical ISO and no earlier than its inputs.');
  snapshot.createdAt=createdAt;
  const replacements=new Map([['ai_service_connections',connection],['ai_connection_events',events],['ai_connection_rate_limits',rates]]);
  for(const item of snapshot.tables)if(replacements.has(item.name)){item.rows=sortedRows(structuredClone(replacements.get(item.name)));item.count=item.rows.length;item.sha256=tableDigest(item.rows);}
  snapshot.sha256=snapshotContentDigest(snapshot);
  const verification=checked(snapshot,{expectedOrigin:source.sourceOrigin});
  const changedTables=source.tables.filter(item=>item.sha256!==table(snapshot,item.name).sha256).map(item=>item.name);
  const report={format:'degreesteps-bootstrap-overlay',version:1,baselineSha256:base.sha256,sourceSha256:source.sha256,bootstrapSha256:bootstrap.sha256,mergedSha256:snapshot.sha256,intentionalOverlay:true,sourceParity:false,overlayTables:overlayNames,changedTables,tableCount:verification.tableCount,totalRows:verification.totalRows,nonConnectionSourcePreserved:true,bootstrapNonConnectionRowsUnchanged:true,connectionAuditMatched:true,credentialDecryptionVerified:false,rateLimitMerge:'newest window; equal-window counts add, subtracting only the shared baseline overlap',matchesBootstrap:snapshot.sha256===bootstrap.sha256,requiresFreshEmptyDestination:snapshot.sha256!==bootstrap.sha256,sourceFreezeVerified:false,cutoverVerified:false};
  return{snapshot,report};
}

async function loadPrivate(path){
  const info=await stat(path);if(!info.isFile()||(info.mode&0o077)!==0||info.size>SNAPSHOT_LIMITS.responseBytes)fail('unsafe_input','Use bounded private snapshot files without group or public permissions.');
  let value;try{const bytes=await readFile(path);if(bytes.length>SNAPSHOT_LIMITS.responseBytes)fail('snapshot_too_large','A snapshot exceeds the export budget.');value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){if(error instanceof SnapshotMergeError)throw error;fail('invalid_json','A private snapshot is not valid UTF-8 JSON.');}return value;
}
async function writePrivate(path,value){
  const safe=target=>{const inside=relative(root,target);return inside==='..'||inside.startsWith('..'+sep)||inside.startsWith('outputs'+sep)&&!['outputs'+sep+'cloudflare','outputs'+sep+'site'].some(directory=>inside===directory||inside.startsWith(directory+sep));};
  const target=resolve(path);if(!safe(target))fail('unsafe_output','Merged private snapshots must be outside tracked or deployable repository paths.');
  await mkdir(dirname(target),{recursive:true,mode:0o700});const actual=resolve(await realpath(dirname(target)),basename(target));if(!safe(actual))fail('unsafe_output','Merged private snapshots must be outside tracked or deployable repository paths.');
  await writeFile(actual,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return actual;
}
const help='Offline bootstrap overlay\n\n  node scripts/merge-bootstrap-snapshot.mjs --base BASE --source FROZEN_SOURCE --bootstrap BOOTSTRAP --master-created-at ISO --out NEW_PRIVATE_FILE [--expect-base-sha256 HEX] [--expect-source-origin HTTPS_ORIGIN] [--expect-bootstrap-origin HTTPS_ORIGIN]\n\nThe three inputs must be complete private snapshots. Only connection tables are overlaid. No network, live writes, secret decryption or source-freeze certification occurs.\n';
export async function main(args=process.argv.slice(2)){
  if(args.length===1&&args[0]==='--help'){process.stdout.write(help);return;}
  const allowed=new Set(['--base','--source','--bootstrap','--master-created-at','--out','--expect-base-sha256','--expect-source-origin','--expect-bootstrap-origin']),values={};
  for(let index=0;index<args.length;index++){const key=args[index],value=args[++index];if(!allowed.has(key)||!value||value.startsWith('--')||Object.hasOwn(values,key))fail('usage','Use --help for the supported offline overlay operation.');values[key]=value;}
  if(['--base','--source','--bootstrap','--master-created-at','--out'].some(key=>!values[key]))fail('usage','Use --help for the supported offline overlay operation.');
  const base=await loadPrivate(resolve(values['--base'])),source=await loadPrivate(resolve(values['--source'])),bootstrap=await loadPrivate(resolve(values['--bootstrap']));
  const {snapshot,report}=mergeBootstrapSnapshots(base,source,bootstrap,{masterCreatedAt:values['--master-created-at'],expectedBaseSha256:values['--expect-base-sha256'],expectedSourceOrigin:values['--expect-source-origin'],expectedBootstrapOrigin:values['--expect-bootstrap-origin']});
  const output=await writePrivate(values['--out'],snapshot);console.log(JSON.stringify({output,private:true,...report}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({error:error instanceof SnapshotMergeError||error instanceof SnapshotError?error.message:'The offline snapshot overlay failed.',code:error instanceof SnapshotMergeError||error instanceof SnapshotError?error.code:'operation_failed'}));process.exitCode=1;});
