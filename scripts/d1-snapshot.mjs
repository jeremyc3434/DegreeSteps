/** Offline snapshot checks and insert planning. This module never contacts a live service. */
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,relative,dirname,basename,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const journal=JSON.parse(readFileSync(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
export const SNAPSHOT_LIMITS=Object.freeze({rowsPerTable:1000,totalRows:5000,rowBytes:1048576,tableBytes:2097152,totalBytes:4194304,responseBytes:8388608,aggregateRows:20000,aggregateBytes:3145728});
const aggregateTable='growth_daily_counts';
const identifier=/^[a-z][a-z0-9_]*$/;
const hashPattern=/^[a-f0-9]{64}$/;
const decimal=/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const minInteger=-(1n<<63n),maxInteger=(1n<<63n)-1n;
const internals=new Set(['sqlite_sequence','_cf_KV','_cf_METADATA','d1_migrations','__drizzle_migrations']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
export class SnapshotError extends Error {constructor(code,message){super(message);this.name='SnapshotError';this.code=code;}}
const fail=(code,message)=>{throw new SnapshotError(code,message);};
const utf8=value=>Buffer.byteLength(value,'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
function exactKeys(value,keys,where){if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!own(value,key)))fail('invalid_shape','Unexpected '+where+' fields.');}

/** JSON objects use lexical keys. Arrays retain their order. No coercion or omitted values. */
export function canonicalJSON(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))fail('invalid_json','Snapshot contains a non-finite number.');return JSON.stringify(value);}
  if(Array.isArray(value)){if(Object.keys(value).length!==value.length)fail('invalid_json','Snapshot contains an incomplete array.');return'['+value.map(canonicalJSON).join(',')+']';}
  if(!object(value))fail('invalid_json','Snapshot contains a non-JSON value.');
  return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(value[key])).join(',')+'}';
}
export function sortedRows(rows){return rows.map(row=>({row,canonical:canonicalJSON(row)})).sort((a,b)=>a.canonical<b.canonical?-1:a.canonical>b.canonical?1:0).map(item=>item.row);}
export function tableDigest(rows){return digest(canonicalJSON(sortedRows(rows)));}
export function snapshotContentDigest(snapshot){return digest(canonicalJSON({format:snapshot.format,version:snapshot.version,integerEncoding:snapshot.integerEncoding,schemaSha256:snapshot.schemaSha256,tables:snapshot.tables.map(table=>({name:table.name,columns:table.columns,count:table.count,sha256:table.sha256}))}));}

export function createTrustedDatabase(){
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA foreign_keys=ON');
    for(const entry of journal.entries){if(!/^[0-9]{4}_[a-z0-9_]+$/.test(entry.tag))fail('migration_registry','Unrecognized repository migration.');db.exec(readFileSync(resolve(root,'drizzle',entry.tag+'.sql'),'utf8'));}
    return db;
  }catch(error){db.close();throw error;}
}
function tablesFrom(db){
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name).filter(name=>!internals.has(name)&&!name.startsWith('sqlite_')).map(name=>{
    if(!identifier.test(name))fail('schema_mismatch','Repository contains an unsupported table identifier.');
    const columns=db.prepare('PRAGMA table_info("'+name+'")').all().map(column=>({name:column.name,type:column.type.toUpperCase()==='INTEGER'?'integer':column.type.toUpperCase()==='TEXT'?'text':null}));
    if(columns.some(column=>!identifier.test(column.name)||!column.type))fail('schema_mismatch','Repository contains an unsupported column.');
    return{name,columns};
  });
}
function schemaFrom(db,tables){
  const names=new Set(tables.map(table=>table.name));
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all().filter(row=>names.has(row.tbl_name)).map(row=>({type:row.type,name:row.name,tbl_name:row.tbl_name,sql:row.sql}));
}
function normalizeSQL(value){
  if(value===null)return null;
  if(typeof value!=='string')fail('schema_mismatch','Schema SQL must be text or null.');
  let result='',quote=null,space=false;
  for(let index=0;index<value.length;index++){
    const char=value[index];
    if(quote){result+=char;if(char===quote){if(value[index+1]===quote){result+=value[++index];}else quote=null;}continue;}
    if(char==="'"||char==='"'||char==='`'||char==='['){if(space&&result)result+=' ';space=false;quote=char==='['?']':char;result+=char;continue;}
    if(/\s/.test(char)){space=true;continue;}
    if(space&&result)result+=' ';space=false;result+=char;
  }
  return result.trim().replace(/;$/,'');
}
function normalizedSchema(schema){return schema.map(item=>({...item,sql:normalizeSQL(item.sql)}));}
function origin(value){
  try{const parsed=new URL(value);if(typeof value!=='string'||parsed.protocol!=='https:'||parsed.origin!==value||parsed.username||parsed.password)throw Error();return value;}catch{fail('invalid_origin','Snapshot source must be an exact HTTPS origin.');}
}

/** Read back integer columns as decimal strings, including signed 64-bit boundary values. */
export function readDatabaseSnapshot(db,{sourceOrigin='https://synthetic.invalid',createdAt=new Date().toISOString()}={}){
  origin(sourceOrigin);
  const definitions=tablesFrom(db),schema=schemaFrom(db,definitions);
  const tables=definitions.map(table=>{
    const selection=table.columns.map(column=>column.type==='integer'?'CAST("'+column.name+'" AS TEXT) AS "'+column.name+'"':'"'+column.name+'"').join(',');
    const rows=sortedRows(db.prepare('SELECT '+selection+' FROM "'+table.name+'"').all().map(row=>({...row})));
    return{name:table.name,columns:table.columns.map(column=>column.name),rows,count:rows.length,sha256:tableDigest(rows)};
  });
  const snapshot={format:'degreesteps-d1-snapshot',version:1,integerEncoding:'decimal-string',sourceOrigin,createdAt,schema,schemaSha256:digest(canonicalJSON(schema)),tables};
  snapshot.sha256=snapshotContentDigest(snapshot);return snapshot;
}

function validateStructure(snapshot,definitions,expectedSchema,{expectedOrigin,expectedSha256}={}){
  exactKeys(snapshot,['format','version','integerEncoding','sourceOrigin','createdAt','schema','schemaSha256','tables','sha256'],'snapshot');
  if(snapshot.format!=='degreesteps-d1-snapshot'||snapshot.version!==1||snapshot.integerEncoding!=='decimal-string')fail('unsupported_format','Use a complete DegreeSteps D1 snapshot version 1 with decimal-string integers.');
  origin(snapshot.sourceOrigin);if(expectedOrigin!==undefined&&origin(expectedOrigin)!==snapshot.sourceOrigin)fail('source_mismatch','Snapshot came from a different source origin.');
  if(typeof snapshot.createdAt!=='string'||!Number.isFinite(Date.parse(snapshot.createdAt))||new Date(snapshot.createdAt).toISOString()!==snapshot.createdAt)fail('invalid_date','Snapshot creation time must be an ISO timestamp.');
  if(!Array.isArray(snapshot.schema)||!Array.isArray(snapshot.tables)||snapshot.tables.length!==definitions.length)fail('incomplete_snapshot','Snapshot must include every application table and schema.');
  if(snapshot.schema.length!==expectedSchema.length)fail('schema_mismatch','Snapshot schema object count differs from repository migrations.');
  for(const item of snapshot.schema){exactKeys(item,['type','name','tbl_name','sql'],'schema object');if(!['table','index','trigger'].includes(item.type)||typeof item.name!=='string'||typeof item.tbl_name!=='string'||!(item.sql===null||typeof item.sql==='string'))fail('schema_mismatch','Snapshot contains an invalid schema object.');}
  if(!hashPattern.test(snapshot.schemaSha256)||digest(canonicalJSON(snapshot.schema))!==snapshot.schemaSha256)fail('digest_mismatch','Snapshot schema digest does not match its content.');
  if(canonicalJSON(normalizedSchema(snapshot.schema))!==canonicalJSON(normalizedSchema(expectedSchema)))fail('schema_mismatch','Snapshot schema differs from repository migrations. Supplied SQL was not executed.');
  let totalRows=0,totalBytes=0,privateRows=0,privateBytes=0,aggregateRows=0,aggregateBytes=0;
  for(let index=0;index<definitions.length;index++){
    const definition=definitions[index],table=snapshot.tables[index];
    exactKeys(table,['name','columns','rows','count','sha256'],'table');
    if(table.name!==definition.name||!Array.isArray(table.columns)||canonicalJSON(table.columns)!==canonicalJSON(definition.columns.map(column=>column.name)))fail('schema_mismatch','Snapshot table or column registry is incomplete or changed.');
    if(!Array.isArray(table.rows)||!Number.isSafeInteger(table.count)||table.count!==table.rows.length)fail('incomplete_snapshot','Snapshot row count is incomplete.');
    const publicAggregate=definition.name===aggregateTable;
    if(table.count>(publicAggregate?SNAPSHOT_LIMITS.aggregateRows:SNAPSHOT_LIMITS.rowsPerTable))fail('snapshot_too_large','Snapshot exceeds the per-table row budget.');
    let tableBytes=0;
    for(const row of table.rows){
      exactKeys(row,table.columns,'row');
      for(const column of definition.columns){
        const value=row[column.name];if(value===null)continue;
        if(typeof value!=='string')fail('invalid_cell','Snapshot database cells must be text or null.');
        if(column.type==='integer'){
          if(!decimal.test(value)||value.length>20)fail('invalid_integer','Snapshot INTEGER values must be exact decimal strings.');
          const number=BigInt(value);if(number<minInteger||number>maxInteger)fail('invalid_integer','Snapshot INTEGER value exceeds signed 64-bit storage.');
        }
      }
      const rowBytes=utf8(canonicalJSON(row));if(rowBytes>SNAPSHOT_LIMITS.rowBytes)fail('snapshot_too_large','Snapshot exceeds the encoded row budget.');tableBytes+=rowBytes;
    }
    if(tableBytes>(publicAggregate?SNAPSHOT_LIMITS.aggregateBytes:SNAPSHOT_LIMITS.tableBytes))fail('snapshot_too_large','Snapshot exceeds the encoded table budget.');
    totalRows+=table.count;totalBytes+=tableBytes;
    if(publicAggregate){aggregateRows+=table.count;aggregateBytes+=tableBytes;}else{privateRows+=table.count;privateBytes+=tableBytes;}
    if(!hashPattern.test(table.sha256)||tableDigest(table.rows)!==table.sha256)fail('digest_mismatch','Snapshot table digest does not match its content.');
  }
  if(privateRows>SNAPSHOT_LIMITS.totalRows||privateBytes>SNAPSHOT_LIMITS.totalBytes||aggregateRows>SNAPSHOT_LIMITS.aggregateRows||aggregateBytes>SNAPSHOT_LIMITS.aggregateBytes||utf8(canonicalJSON(snapshot))>SNAPSHOT_LIMITS.responseBytes)fail('snapshot_too_large','Snapshot exceeds the complete export budget.');
  if(!hashPattern.test(snapshot.sha256)||snapshotContentDigest(snapshot)!==snapshot.sha256)fail('digest_mismatch','Snapshot content digest does not match its manifest.');
  if(expectedSha256!==undefined&&(!hashPattern.test(expectedSha256)||snapshot.sha256!==expectedSha256))fail('source_mismatch','Snapshot differs from the expected authenticated-export digest.');
  return{totalRows,totalBytes};
}

function insertionStatements(snapshot){
  return snapshot.tables.flatMap(table=>table.rows.map(row=>({sql:'INSERT INTO "'+table.name+'" ('+table.columns.map(column=>'"'+column+'"').join(',')+') VALUES ('+table.columns.map(()=>'?').join(',')+')',params:table.columns.map(column=>row[column])})));
}
function report(snapshot,counts){return{format:snapshot.format,version:snapshot.version,sourceOrigin:snapshot.sourceOrigin,createdAt:snapshot.createdAt,sha256:snapshot.sha256,schemaSha256:snapshot.schemaSha256,tableCount:snapshot.tables.length,totalRows:counts.totalRows,encodedRowBytes:counts.totalBytes,tables:snapshot.tables.map(table=>({name:table.name,count:table.count,sha256:table.sha256})),restoredAgainstRepositoryMigrations:true,foreignKeyViolations:0,integrity:'ok',cutoverVerified:false,capacityCertified:false};}

/** Returns an open in-memory database. The caller must close it. No snapshot SQL runs. */
export function restoreSnapshot(snapshot,options={}){
  const db=createTrustedDatabase();let transaction=false;
  try{
    const definitions=tablesFrom(db),expectedSchema=schemaFrom(db,definitions),counts=validateStructure(snapshot,definitions,expectedSchema,options);
    db.exec('BEGIN');transaction=true;db.exec('PRAGMA defer_foreign_keys=ON');
    for(const statement of insertionStatements(snapshot))db.prepare(statement.sql).run(...statement.params);
    if(db.prepare('PRAGMA foreign_key_check').all().length)fail('constraint_violation','Snapshot contains missing or mismatched ownership/foreign-key references.');
    db.exec('COMMIT');transaction=false;
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('constraint_violation','Restored snapshot failed SQLite integrity verification.');
    const roundTrip=readDatabaseSnapshot(db,{sourceOrigin:snapshot.sourceOrigin,createdAt:snapshot.createdAt});
    if(roundTrip.sha256!==snapshot.sha256)fail('roundtrip_mismatch','Snapshot values changed during SQLite restoration.');
    return{database:db,report:report(snapshot,counts)};
  }catch(error){if(transaction)try{db.exec('ROLLBACK');}catch{}db.close();if(error instanceof SnapshotError)throw error;fail('constraint_violation','Snapshot does not satisfy repository schema, uniqueness, type or ownership constraints.');}
}
export function verifySnapshot(snapshot,options={}){const restored=restoreSnapshot(snapshot,options);try{return restored.report;}finally{restored.database.close();}}
export function planSnapshotImport(snapshot,options={}){
  const verification=verifySnapshot(snapshot,options),inserts=insertionStatements(snapshot);
  return{format:'degreesteps-d1-import-plan',version:1,sourceSha256:snapshot.sha256,sourceOrigin:snapshot.sourceOrigin,requiresEmptyDestination:true,requiresAtomicBatch:true,overwritesExisting:false,cutoverVerified:false,statementCount:inserts.length+2,verification,statements:[{sql:'PRAGMA defer_foreign_keys=ON',params:[]},...inserts,{sql:'PRAGMA foreign_key_check',params:[]}]};
}
export function compareSnapshots(left,right,options={}){
  const first=verifySnapshot(left,{expectedOrigin:options.leftOrigin,expectedSha256:options.leftSha256});
  const second=verifySnapshot(right,{expectedOrigin:options.rightOrigin,expectedSha256:options.rightSha256});
  const changed=first.tables.filter((table,index)=>table.sha256!==second.tables[index].sha256||table.count!==second.tables[index].count).map(table=>table.name);
  return{equal:first.sha256===second.sha256,sourceSha256:first.sha256,destinationSha256:second.sha256,schemaEqual:first.schemaSha256===second.schemaSha256,changedTables:changed,tableCount:first.tableCount,sourceRows:first.totalRows,destinationRows:second.totalRows,cutoverVerified:false};
}

async function loadSnapshot(path){const size=(await stat(path)).size;if(size>SNAPSHOT_LIMITS.responseBytes)fail('snapshot_too_large','Snapshot file exceeds the export budget.');let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path)));}catch{fail('invalid_json','Snapshot file is not valid UTF-8 JSON.');}return data;}
async function writePrivate(path,value){
  const safe=target=>{
    const inside=relative(root,target);
    if(inside.startsWith('..'+sep)||inside==='..')return true;
    if(!inside.startsWith('outputs'+sep))return false;
    // Ignored build outputs can still be public assets or deployment archives.
    return !['outputs'+sep+'cloudflare','outputs'+sep+'site'].some(directory=>inside===directory||inside.startsWith(directory+sep));
  };
  const target=resolve(path);if(!safe(target))fail('unsafe_output','Private import plans must be outside the repository or in ignored, non-deployable outputs/.');
  await mkdir(dirname(target),{recursive:true,mode:0o700});const actual=resolve(await realpath(dirname(target)),basename(target));
  if(!safe(actual))fail('unsafe_output','Private import plans must be outside the repository or in ignored, non-deployable outputs/.');
  await writeFile(actual,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return actual;
}
const help=`Offline DegreeSteps D1 snapshot tools (Node.js 24)\n\n  node scripts/d1-snapshot.mjs --verify snapshot.json [--expect-origin https://host] [--expect-sha256 HEX]\n  node scripts/d1-snapshot.mjs --compare source.json destination.json\n  node scripts/d1-snapshot.mjs --plan snapshot.json --out /private/path/import-plan.json [--expect-origin https://host] [--expect-sha256 HEX]\n\nVerification restores only into an in-memory database using repository migrations.\nImport plans contain private records; new files are mode 0600 and are never written to tracked paths.\nApply plans only to a verified EMPTY destination using one atomic provider batch with foreign keys enabled.\nNo network, destination changes, write freeze, secret decryption or production cutover occurs here.\nContent digests detect changes; they are not signatures or proof of source authority.\n`;
export async function main(args=process.argv.slice(2)){
  if(args.length===1&&args[0]==='--help'){process.stdout.write(help);return;}
  const options={},positionals=[];let mode=null,out;
  for(let index=0;index<args.length;index++){
    const flag=args[index];if(['--verify','--compare','--plan'].includes(flag)){if(mode)fail('usage','Choose exactly one snapshot operation.');mode=flag;}
    else if(['--expect-origin','--expect-sha256','--out'].includes(flag)){const value=args[++index];if(!value||value.startsWith('--'))fail('usage','A snapshot option needs a value.');if(flag==='--out'){if(out!==undefined)fail('usage','Output was specified twice.');out=value;}else{const key=flag==='--expect-origin'?'expectedOrigin':'expectedSha256';if(own(options,key))fail('usage','A snapshot option was specified twice.');options[key]=value;}}
    else if(flag.startsWith('--'))fail('usage','Unknown snapshot option.');else positionals.push(flag);
  }
  if(!mode||positionals.length!==(mode==='--compare'?2:1)||(mode==='--plan')!==Boolean(out)||mode==='--compare'&&Object.keys(options).length)fail('usage','Use --help for the supported offline snapshot operations.');
  const first=await loadSnapshot(resolve(positionals[0]));
  if(mode==='--verify')console.log(JSON.stringify(verifySnapshot(first,options)));
  else if(mode==='--compare')console.log(JSON.stringify(compareSnapshots(first,await loadSnapshot(resolve(positionals[1])))));
  else {const plan=planSnapshotImport(first,options),path=await writePrivate(out,plan);console.log(JSON.stringify({output:path,private:true,sourceSha256:plan.sourceSha256,tableCount:plan.verification.tableCount,totalRows:plan.verification.totalRows,statementCount:plan.statementCount,requiresEmptyDestination:true,requiresAtomicBatch:true,cutoverVerified:false}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({error:error instanceof SnapshotError?error.message:'The offline snapshot operation failed.',code:error instanceof SnapshotError?error.code:'operation_failed'}));process.exitCode=1;});
