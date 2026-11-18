/** Short-lived operator-only, read-only D1 export. Never enable this as a student/admin feature. */
import { D1_SNAPSHOT_TABLES, D1_SNAPSHOT_SCHEMA } from '../db/d1-snapshot-registry.mjs';

const OperatorSnapshotApi=(()=>{
  'use strict';
  const PATH='/api/operations/snapshot',FORMAT='degreesteps-d1-snapshot';
  const MAX_ROWS=1000,MAX_TOTAL_ROWS=5000,MAX_RAW_TABLE_BYTES=4*1024*1024;
  const MAX_ROW_BYTES=1024*1024,MAX_TABLE_BYTES=2*1024*1024,MAX_DATA_BYTES=4*1024*1024,MAX_HTTP_BYTES=8*1024*1024;
  const TTL=60*60*1000,encoder=new TextEncoder();
  const tables=D1_SNAPSHOT_TABLES;
  const lexical=(a,b)=>a<b?-1:a>b?1:0;
  const identifier=value=>{if(!/^[a-z][a-z0-9_]*$/.test(value))throw Error('Invalid fixed snapshot identifier');return '"'+value+'"';};
  const literal=value=>"'"+value.replaceAll("'","''")+"'";
  class SnapshotError extends Error{constructor(status,message,code,diagnostic,operatorSchema){super(message);this.status=status;this.code=code;this.diagnostic=diagnostic;this.operatorSchema=operatorSchema;}}
  const fail=(status,message,code)=>{throw new SnapshotError(status,message,code);};
  function headers(extra={}){return{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'X-DegreeSteps-Export-Key',...extra};}
  function response(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:headers(extra)});}
  function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
  async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(typeof value==='string'?value:canonical(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
  function sameDigest(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;let difference=0;for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
  function configuration(env,url){
    const hash=env.OPERATOR_EXPORT_TOKEN_SHA256,expiry=env.OPERATOR_EXPORT_EXPIRES_AT,origin=env.OPERATOR_EXPORT_ORIGIN;
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||typeof expiry!=='string'||typeof origin!=='string')return null;
    const now=Date.now(),expires=Date.parse(expiry);if(!Number.isFinite(expires)||expires<=now||expires-now>TTL)return null;
    let expected;try{expected=new URL(origin);}catch{return null;}
    if(expected.protocol!=='https:'||expected.origin!==origin||expected.username||expected.password||url.origin!==origin)return null;
    return{hash,origin};
  }
  async function body(request){
    if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Use an empty JSON object.','snapshot_invalid_request');
    if(Number(request.headers.get('Content-Length'))>256)fail(413,'Use an empty JSON object.','snapshot_invalid_request');
    const reader=request.body?.getReader();let size=0,raw='';const decoder=new TextDecoder('utf-8',{fatal:true});
    try{if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256){await reader.cancel();fail(413,'Use an empty JSON object.','snapshot_invalid_request');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
    catch(error){if(error instanceof SnapshotError)throw error;fail(400,'Use an empty JSON object.','snapshot_invalid_request');}
    let value;try{value=JSON.parse(raw||'{}');}catch{fail(400,'Use an empty JSON object.','snapshot_invalid_request');}
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length)fail(400,'No snapshot filters or SQL are accepted.','snapshot_invalid_request');
  }
  function rowExpression(table){return'json_object('+table.columns.flatMap(column=>[literal(column.name),column.type==='integer'?'CAST('+identifier(column.name)+' AS TEXT)':identifier(column.name)]).join(',')+')';}
  function tableStats(table){
    const columns=table.columns.map(column=>identifier(column.name)),row=rowExpression(table);
    const raw=columns.map(column=>'COALESCE(length(CAST('+column+' AS BLOB)),0)').join('+');
    const invalid=table.columns.map(column=>'('+identifier(column.name)+' IS NOT NULL AND typeof('+identifier(column.name)+')<>'+literal(column.type)+')').join(' OR ');
    const allowed='row_count<='+MAX_ROWS+' AND raw_bytes<='+MAX_RAW_TABLE_BYTES+' AND bad_types=0';
    return'(WITH bounded AS NOT MATERIALIZED (SELECT '+columns.join(',')+' FROM '+identifier(table.name)+' LIMIT '+(MAX_ROWS+1)+'), raw AS (SELECT count(*) AS row_count,COALESCE(sum('+raw+'),0) AS raw_bytes,COALESCE(sum(CASE WHEN '+invalid+' THEN 1 ELSE 0 END),0) AS bad_types FROM bounded) SELECT json_object(\'row_count\',row_count,\'raw_bytes\',raw_bytes,\'bad_types\',bad_types,\'encoded_bytes\',CASE WHEN '+allowed+' THEN (SELECT COALESCE(sum(length(CAST('+row+' AS BLOB))),0) FROM bounded) ELSE NULL END,\'max_row_bytes\',CASE WHEN '+allowed+' THEN (SELECT COALESCE(max(length(CAST('+row+' AS BLOB))),0) FROM bounded) ELSE NULL END) FROM raw)';
  }
  // D1 imposes a smaller compound-SELECT limit than local SQLite. A fixed JSON
  // registry and CASE subqueries avoid UNION terms while keeping one read batch.
  const tableNames=literal(JSON.stringify(tables.map(table=>table.name)));
  const fields=['row_count','raw_bytes','bad_types','encoded_bytes','max_row_bytes'];
  const statsSql='WITH snapshot_statistics AS MATERIALIZED (SELECT value AS name,CASE value '+tables.map(table=>'WHEN '+literal(table.name)+' THEN '+tableStats(table)).join(' ')+' END AS metadata_json FROM json_each('+tableNames+')),snapshot_stats AS (SELECT name,'+fields.map(field=>'json_extract(metadata_json,'+literal('$.'+field)+') AS '+field).join(',')+' FROM snapshot_statistics) ';
  const valid='count(*)='+tables.length+' AND sum(row_count)<='+MAX_TOTAL_ROWS+' AND sum(COALESCE(encoded_bytes,'+(MAX_DATA_BYTES+1)+'))<='+MAX_DATA_BYTES+' AND sum(CASE WHEN row_count>'+MAX_ROWS+' OR bad_types<>0 OR encoded_bytes IS NULL OR encoded_bytes>'+MAX_TABLE_BYTES+' OR max_row_bytes>'+MAX_ROW_BYTES+' THEN 1 ELSE 0 END)=0';
  const queries=[
    statsSql+'SELECT * FROM snapshot_stats ORDER BY name',
    statsSql+', snapshot_allowed AS (SELECT CASE WHEN '+valid+' THEN 1 ELSE 0 END AS ok FROM snapshot_stats) SELECT registry.value AS table_name,packed.value AS row_json FROM json_each('+tableNames+') AS registry CROSS JOIN json_each(CASE WHEN (SELECT ok FROM snapshot_allowed)=1 THEN CASE registry.value '+tables.map(table=>'WHEN '+literal(table.name)+' THEN (SELECT json_group_array(json('+rowExpression(table)+')) FROM '+identifier(table.name)+')').join(' ')+' ELSE \'[]\' END ELSE \'[]\' END) AS packed',
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE (type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','__drizzle_migrations','__appgarden_migrations')) OR type='view' OR (type IN ('index','trigger') AND tbl_name IN ("+tables.map(table=>literal(table.name)).join(',')+')) ORDER BY type,name'
  ];
  function validateStats(rows){
    if(!Array.isArray(rows)||rows.length!==tables.length)fail(503,'The application schema changed. Review the export before continuing.','snapshot_schema_mismatch');
    let count=0,bytes=0;
    for(let i=0;i<tables.length;i++){
      const row=rows[i];if(row.name!==tables[i].name||!Number.isSafeInteger(row.row_count)||row.row_count<0||!Number.isSafeInteger(row.raw_bytes)||row.raw_bytes<0)fail(503,'The migration snapshot could not be verified.','snapshot_invalid_result');
      if(row.row_count>MAX_ROWS||row.raw_bytes>MAX_RAW_TABLE_BYTES||row.bad_types!==0||!Number.isSafeInteger(row.encoded_bytes)||row.encoded_bytes<0||row.encoded_bytes>MAX_TABLE_BYTES||!Number.isSafeInteger(row.max_row_bytes)||row.max_row_bytes>MAX_ROW_BYTES)fail(413,'This database exceeds the bounded snapshot limits. Use a provider export.','snapshot_too_large');
      count+=row.row_count;bytes+=row.encoded_bytes;
    }
    if(count>MAX_TOTAL_ROWS||bytes>MAX_DATA_BYTES)fail(413,'This database exceeds the bounded snapshot limits. Use a provider export.','snapshot_too_large');
  }
  function databaseDiagnostic(error){
    // Only fixed enums escape the operator boundary: never SQL, cell contents, keys or raw errors.
    let text='',current=error;
    for(let depth=0;current&&depth<4;depth++){
      try{text+=' '+String(typeof current==='string'?current:current.message||'').slice(0,4096);current=typeof current==='object'?current.cause:null;}catch{break;}
    }
    if(/snapshot_timeout|timed?\s*out|deadline/i.test(text))return'd1_timeout';
    if(/parser stack|stack overflow|expression tree|too many terms|too many levels|query.*complex/i.test(text))return'd1_parser_limit';
    if(/statement.*too long|sql.*too (?:long|large)|query.*too (?:long|large)|string or blob too big|SQLITE_TOOBIG/i.test(text))return'd1_query_size_limit';
    if(/no such column|unknown column|has no column/i.test(text))return'd1_missing_column';
    if(/no such table|unknown table/i.test(text))return'd1_missing_table';
    if(/too many sql|too many quer|query count|subrequest limit/i.test(text))return'd1_query_count_limit';
    if(/not authorized|SQLITE_AUTH|not permitted|unsupported|no such function/i.test(text))return'd1_unsupported_operation';
    if(/syntax error|incomplete input|unrecognized token|near .*syntax/i.test(text))return'd1_sql_syntax';
    if(/binding|database.*not found|database.*unavailable|database.*does not exist/i.test(text))return'd1_binding_unavailable';
    return'd1_unknown';
  }
  function schemaDiagnostic(schema){
    // Only authenticated schema-mismatch responses can include this bounded DDL projection.
    // Do not truncate: an incomplete definition would make drift review misleading.
    if(!Array.isArray(schema)||schema.length>256||schema.some(row=>typeof row.type!=='string'||row.type.length>32||typeof row.name!=='string'||row.name.length>256||typeof row.tbl_name!=='string'||row.tbl_name.length>256||(row.sql!==null&&typeof row.sql!=='string')))return undefined;
    const projected=schema.map(({type,name,tbl_name,sql})=>({type,name,tbl_name,sql}));
    if(encoder.encode(JSON.stringify(projected)).byteLength>128*1024)return undefined;
    return projected;
  }
  async function snapshot(env,origin){
    if(typeof env.DB?.batch!=='function'||typeof env.DB?.prepare!=='function')fail(503,'The migration database is not available.','snapshot_unavailable');
    let answer,timer;
    try{answer=await Promise.race([env.DB.batch(queries.map(sql=>env.DB.prepare(sql))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('snapshot_timeout')),25000);})]);}
    catch(error){throw new SnapshotError(503,'The migration snapshot could not be created.','snapshot_unavailable',databaseDiagnostic(error));}finally{clearTimeout(timer);}
    if(!Array.isArray(answer)||answer.length!==3||answer.some(result=>result.success===false||!Array.isArray(result.results)))fail(503,'The migration snapshot could not be verified.','snapshot_invalid_result');
    const stats=answer[0].results;validateStats(stats);
    const schema=answer[2].results.map(row=>({type:row.type,name:row.name,tbl_name:row.tbl_name,sql:row.sql})).sort((a,b)=>lexical(a.type,b.type)||lexical(a.name,b.name));
    if(schema.some(row=>!['table','index','trigger'].includes(row.type)||!tables.some(table=>table.name===row.tbl_name)||typeof row.name!=='string'||(row.sql!==null&&typeof row.sql!=='string'))||canonical(schema)!==canonical(D1_SNAPSHOT_SCHEMA))throw new SnapshotError(503,'The application schema changed. Review the export before continuing.','snapshot_schema_mismatch',undefined,schemaDiagnostic(schema));
    const grouped=new Map(tables.map(table=>[table.name,[]]));
    for(const item of answer[1].results){
      if(!grouped.has(item.table_name)||typeof item.row_json!=='string')fail(503,'The migration snapshot could not be verified.','snapshot_invalid_result');
      let row;try{row=JSON.parse(item.row_json);}catch{fail(503,'The migration snapshot could not be verified.','snapshot_invalid_result');}
      const table=tables.find(table=>table.name===item.table_name),keys=Object.keys(row||{}).sort();
      if(!row||Array.isArray(row)||canonical(keys)!==canonical(table.columns.map(column=>column.name).sort()))fail(503,'The migration snapshot could not be verified.','snapshot_invalid_result');
      for(const column of table.columns){const value=row[column.name];if(value!==null&&(typeof value!=='string'||column.type==='integer'&&!/^-?(?:0|[1-9][0-9]*)$/.test(value)))fail(503,'The migration snapshot contains an unsupported cell type.','snapshot_invalid_result');}
      grouped.get(item.table_name).push(row);
    }
    const exported=[];
    for(let i=0;i<tables.length;i++){
      const table=tables[i],rows=grouped.get(table.name).map(row=>[canonical(row),row]).sort((a,b)=>lexical(a[0],b[0])).map(pair=>pair[1]);
      if(rows.length!==stats[i].row_count)fail(503,'The migration snapshot is incomplete.','snapshot_invalid_result');
      exported.push({name:table.name,columns:table.columns.map(column=>column.name),rows,count:rows.length,sha256:await digest(rows)});
    }
    const schemaSha256=await digest(schema),base={format:FORMAT,version:1,integerEncoding:'decimal-string',schemaSha256,tables:exported.map(({name,columns,count,sha256})=>({name,columns,count,sha256}))};
    const value={format:FORMAT,version:1,integerEncoding:'decimal-string',sourceOrigin:origin,createdAt:new Date().toISOString(),schema,schemaSha256,tables:exported,sha256:await digest(base)};
    const serialized=JSON.stringify(value);if(encoder.encode(serialized).byteLength>MAX_HTTP_BYTES)fail(413,'This database exceeds the bounded snapshot limits. Use a provider export.','snapshot_too_large');
    return new Response(serialized,{headers:headers({'Content-Disposition':'attachment; filename="degreesteps-d1-snapshot.json"'})});
  }
  return async(request,env={})=>{
    const url=new URL(request.url);if(url.pathname!==PATH)return null;
    try{
      const config=configuration(env,url);if(!config)return response({error:'Not found.'},404);
      const key=request.headers.get('X-DegreeSteps-Export-Key');if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||!sameDigest(await digest(key),config.hash))return response({error:'Operator authorization is required.'},401);
      if(request.method!=='POST')return response({error:'Use POST.'},405,{Allow:'POST'});
      if(url.search)fail(400,'No snapshot filters or SQL are accepted.','snapshot_invalid_request');
      await body(request);return await snapshot(env,config.origin);
    }catch(error){if(error instanceof SnapshotError)return response({error:error.message,code:error.code,...(error.diagnostic?{operatorDiagnostic:error.diagnostic}:{}),...(error.code==='snapshot_schema_mismatch'&&error.operatorSchema?{operatorSchema:error.operatorSchema}:{})},error.status);return response({error:'The migration snapshot could not be created.',code:'snapshot_unavailable'},503);}
  };
})();

export async function handleOperatorSnapshot(request,env){return OperatorSnapshotApi(request,env);}
