import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { handleTranscriptImport } from './transcript-import.mjs';

const origin='https://degreepath.example',path='/api/portal/transcript-import';
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const fakeKey='fake-server-only-credential-not-real';
class LocalD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');for(const entry of journal.entries)this.sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));}
  prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i);const query=this.sqlite.prepare(sql);return{bind:(...values)=>({run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};}
  close(){this.sqlite.close();}
}
function png(width=100,height=100,length=33){const bytes=Buffer.alloc(length);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes.toString('base64');}
const page=(n=1,data=png())=>({page:n,mediaType:'image/png',data});
const input=(overrides={})=>({consent:true,documentKind:'completed-transcript',provider:'Example College',pages:[page()],...overrides});
const row=(overrides={})=>({provider:'Example College',code:'ENG101',title:'English Composition',credits:3,creditSystem:'semester',status:'earned',completedOn:'2025-08-01',grade:'A',score:null,page:1,sourceText:'ENG101 English Composition 3.00 A',...overrides});
const extracted=(overrides={})=>({documentKind:'completed-transcript',rows:[row()],issues:[],...overrides});
function vendor(data=extracted(),overrides={}){return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}],...overrides}),{headers:{'Content-Type':'application/json'}});}
function fixture(t,overrides={}){
  const DB=new LocalD1(),calls=[],resolved=[];t.after(()=>DB.close());
  const env={DB,PORTAL_USER:{id:'student-1'},TRANSCRIPT_AI_CONFIGURED:true,TRANSCRIPT_AI_RESOLVE_KEY:async()=>{resolved.push(true);return{apiKey:fakeKey,model:'claude-test-model'};},TRANSCRIPT_AI_FETCH:async(url,options)=>{calls.push({url,options});return vendor();},...overrides};
  const request=(body=input(),options={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'X-Portal-Request':'1','Content-Type':'application/json',...options.headers},body:typeof body==='string'?body:JSON.stringify(body),...Object.fromEntries(Object.entries(options).filter(([key])=>key!=='headers'))});
  const send=(body=input(),options={})=>handleTranscriptImport(request(body,options),env);
  const call=async(body=input(),options={})=>{const response=await send(body,options);return{status:response.status,body:await response.json(),headers:response.headers};};
  const runs=()=>DB.sqlite.prepare('SELECT * FROM transcript_import_runs ORDER BY started_at,id').all();
  return{DB,env,calls,resolved,request,send,call,runs};
}
function privateResponse(response){assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);assert.match(response.headers.get('vary'),/Cookie/);assert.doesNotMatch(JSON.stringify(response.body),new RegExp(fakeKey));}

test('status is public, private-cache-only, and does not decrypt a key or create an account',async t=>{
  const f=fixture(t);f.env.PORTAL_USER=null;
  const response=await handleTranscriptImport(new Request(origin+path),f.env),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.configured,true);assert.equal(body.requiresSignIn,true);assert.equal(body.limits.maxPages,25);assert.equal(body.limits.maxTotalImageBytes,8*1024*1024);assert.equal(body.limits.timeoutSeconds,90);assert.equal(f.resolved.length,0);assert.equal(f.calls.length,0);assert.equal(f.runs().length,0);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles').get().n,0);privateResponse({headers:response.headers,body});
  assert.equal(await handleTranscriptImport(new Request(origin+'/api/other'),f.env),null);
});
test('only Worker-verified signed-in identity can invoke AI',async t=>{
  const f=fixture(t);f.env.PORTAL_USER=null;
  const response=await f.call(input(),{headers:{'oai-authenticated-user-id':'victim','x-portal-user-id':'victim'}});
  assert.equal(response.status,401);assert.equal(response.body.code,'sign_in_required');assert.equal(f.calls.length,0);assert.equal(f.runs().length,0);
  f.env.PORTAL_USER={id:'\ninvalid'};assert.equal((await f.call()).status,401);
});
test('same-origin JSON, explicit consent, and an exact bounded input contract are mandatory',async t=>{
  const f=fixture(t);
  for(const headers of [{Origin:''},{Origin:'https://elsewhere.invalid'},{'X-Portal-Request':''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.call(input(),{headers})).status,403);
  assert.equal((await f.call(input(),{headers:{'Content-Type':'text/plain'}})).status,415);
  for(const consent of [false,null,undefined,'true'])assert.equal((await f.call(input({consent}))).body.code,'consent_required');
  for(const body of [input({url:'https://attacker.invalid'}),input({apiKey:fakeKey}),input({model:'client-selected'}),input({studentId:'victim'}),input({documentKind:'official-evaluation'}),input({provider:'x'.repeat(121)}),input({pages:[{...page(),url:'https://attacker.invalid'}]})])assert.equal((await f.call(body)).status,400);
  assert.equal((await f.call('{')).status,400);assert.equal(f.runs().length,0);assert.equal(f.calls.length,0);assert.equal(f.resolved.length,0);
});
test('unconfigured DB or credentials fail without a provider call or quota attempt',async t=>{
  const f=fixture(t);f.env.TRANSCRIPT_AI_CONFIGURED=false;assert.equal((await f.call()).status,503);f.env.TRANSCRIPT_AI_CONFIGURED=true;
  f.env.TRANSCRIPT_AI_RESOLVE_KEY=async()=>({apiKey:'short',model:'claude-test'});assert.equal((await f.call()).status,503);assert.equal(f.calls.length,0);assert.equal(f.runs().length,0);
  f.env.TRANSCRIPT_AI_RESOLVE_KEY=async()=>{throw Error('raw private connection exception');};const response=await f.call();assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(response.body),/private connection/);assert.equal(f.runs().length,0);
  f.env.DB=null;assert.equal((await f.call()).status,503);
});
test('PNG signature, IHDR dimensions, media type, page order and count are checked before billing',async t=>{
  const f=fixture(t);
  for(const pages of [[],Array.from({length:26},(_,i)=>page(i+1))])assert.equal((await f.call(input({pages}))).status,413);
  for(const pages of [[page(0)],[page(2),page(1)],[page(1),page(1)],[page(10001)],[{...page(),mediaType:'application/pdf'}],[page(1,'JVBERi0xLjc=')],[page(1,'not+valid=base64')]])assert.equal((await f.call(input({pages}))).status,400);
  for(const data of [png(0,100),png(100,0),png(2001,1),png(1,2001)])assert.equal((await f.call(input({pages:[page(1,data)]}))).status,413);
  const badChunk=Buffer.from(png(),'base64');badChunk.writeUInt32BE(12,8);assert.equal((await f.call(input({pages:[page(1,badChunk.toString('base64'))]}))).status,400);
  assert.equal(f.calls.length,0);assert.equal(f.runs().length,0);
});
test('decoded image bytes and pixel totals enforce cost bounds independently of page count',async t=>{
  const f=fixture(t);
  assert.equal((await f.call(input({pages:[page(1,png(100,100,2*1024*1024+1))]}))).status,413);
  assert.equal((await f.call(input({pages:Array.from({length:5},(_,i)=>page(i+1,png(100,100,2*1024*1024)))}))).status,413);
  assert.equal((await f.call(input({pages:Array.from({length:11},(_,i)=>page(i+1,png(2000,2000)))}))).status,413);
  assert.equal((await f.call(input(),{headers:{'Content-Length':String(12*1024*1024+1)}})).status,413);
  assert.equal(f.calls.length,0);assert.equal(f.runs().length,0);
});
test('one configured-model request has no tools, redirects, URL lookup or client credentials',async t=>{
  const f=fixture(t),response=await f.call();assert.equal(response.status,200);privateResponse(response);
  assert.equal(f.calls.length,1);assert.equal(f.resolved.length,1);const {url,options}=f.calls[0],payload=JSON.parse(options.body);
  assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers['anthropic-version'],'2026-10-21');assert.equal(options.headers.Authorization,'Bearer '+fakeKey);assert(options.signal instanceof AbortSignal);
  assert.equal(payload.model,'claude-test-model');assert.equal(payload.max_tokens,8000);assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,1);assert.equal(payload.messages[0].content.at(-1).source.data,page().data);assert.equal(payload.messages[0].content.at(-1).source.media_type,'image/png');assert.match(payload.messages[0].content[0].text,/untrusted document data/);assert.doesNotMatch(options.body,new RegExp(fakeKey));
  assert.deepEqual(response.body.rows,[{...row(),requiresReview:true,warnings:[]}]);assert.equal(response.body.requiresReview,true);
  const stored=f.runs();assert.equal(stored.length,1);assert.deepEqual(Object.keys(stored[0]).sort(),['id','started_at','user_id']);assert.equal(stored[0].user_id,'student-1');assert.doesNotMatch(JSON.stringify(stored),/English|ENG101|Example College|iVBOR|fake-server/);
});
test('unknown original credits and units stay unknown, and exact original page numbers survive',async t=>{
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted({rows:[row({credits:null,creditSystem:null,page:4,completedOn:'Fall 2025',grade:'',status:'earned',sourceText:'ENG101 English Composition completed'}),row({credits:'3',creditSystem:'credits',page:4,completedOn:'2025-02-30',grade:'A'})]}))});
  const response=await f.call(input({pages:[page(4)]}));assert.equal(response.status,200);assert.equal(response.body.rows.length,2);
  for(const item of response.body.rows){assert.equal(item.credits,null);assert.equal(item.creditSystem,null);assert.equal(item.completedOn,'');assert.equal(item.page,4);assert(item.warnings.some(w=>/credit amount/.test(w)));}
});
test('degree audits cannot turn receiving-school requirements or awards into earned original credits',async t=>{
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted())});
  const response=await f.call(input({documentKind:'degree-audit'}));assert.equal(response.status,200);assert.equal(response.body.documentKind,'degree-audit');assert.equal(response.body.rows[0].status,'review');assert.equal(response.body.rows[0].credits,null);assert.equal(response.body.rows[0].creditSystem,null);
  f.env.TRANSCRIPT_AI_FETCH=async()=>vendor(extracted({documentKind:'unknown'}));const unknown=await f.call(input({documentKind:'unknown'}));assert.equal(unknown.body.rows[0].status,'review');assert.equal(unknown.body.rows[0].credits,null);
});
test('receiving-school grades and award excerpts stay blocked after server and import review',async t=>{
  const grades=['TR','T','TA','TB','TC','TD','TE','TF','TP','TRANSFER'],phrases=['transfer credit awarded','transfer credits awarded','work accepted','accepted from','credit transferred'];
  const rows=[...grades.map(grade=>row({grade})),...phrases.map(phrase=>row({sourceText:'ENG101 English Composition 3.00 A '+phrase}))];
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted({rows}))}),response=await f.call();assert.equal(response.status,200);assert.equal(response.body.rows.length,rows.length);
  for(const item of response.body.rows){assert.equal(item.isTransfer,true);assert.equal(item.status,'review');assert.equal(item.code,'');assert.equal(item.credits,null);assert.equal(item.creditSystem,null);assert.equal(item.completedOn,'');assert.equal(item.score,null);assert(item.warnings.some(value=>/receiving-school transfer award/.test(value)));}
  assert.deepEqual(response.body.rows.slice(0,grades.length).map(item=>item.grade),grades);
  const require=createRequire(import.meta.url),Engine=require('../dist/record-import-engine.js'),parsed=Engine.fromRecords(response.body.rows,{documentKind:response.body.documentKind,extraction:'ai'});
  for(const item of parsed.rows){assert.equal(item.source.isTransfer,true);assert(item.issues.some(issue=>issue.code==='receiving-transfer-row'));item.record={...item.record,code:'ENG101',credits:3,creditSystem:'semester',status:'earned',grade:'A'};item.selected=true;}
  const prepared=Engine.prepareImport([],parsed.rows);assert.equal(prepared.ok,false);assert.equal(prepared.additions.length,0);assert(prepared.issues.some(issue=>issue.code==='receiving-transfer-row'));
});
test('failed or unfinished work cannot be marked earned, and planned records remain planned',async t=>{
  const grades=['F','WF','W','I','INCOMPLETE','IP'];const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted({rows:[...grades.map(grade=>row({grade})),row({status:'planned',grade:'',sourceText:'ENG101 planned'}),row({status:'earned',grade:'',sourceText:'ENG101 English Composition'})]}))});
  const response=await f.call();assert.equal(response.status,200);for(const item of response.body.rows.slice(0,6))assert.equal(item.status,'review');assert.equal(response.body.rows[6].status,'planned');assert.equal(response.body.rows[7].status,'review');
});
test('unsupported grades, noncredit outcomes and negated completion text remain unresolved',async t=>{
  const rows=[...['N','NP','NC','U','AU','AUDIT','FAIL','62'].map(grade=>row({grade,sourceText:'ENG101 completed earned'})),...['ENG101 not completed','ENG101 no credit awarded','ENG101 earned 0.00','ENG101 in progress','ENG101 remaining'].map(sourceText=>row({grade:'',sourceText}))];
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted({rows}))}),response=await f.call();assert.equal(response.status,200);assert.equal(response.body.rows.length,rows.length);for(const item of response.body.rows)assert.equal(item.status,'review');
});
test('PII headers, totals and summary awards are filtered, while legitimate retakes stay separate',async t=>{
  const rows=[row(),row({grade:'B',completedOn:'2026-01-10'}),row({title:'Cumulative Credits',code:'TOTAL'}),row({title:'Grade Point Average',code:'GPA'}),row({title:'Transfer credit award',code:'TRN'}),row({sourceText:'Student ID 123456789; ENG101 3.00 A'}),row({sourceText:'Name: Jamie Doe ENG101 3.00 A'}),row({sourceText:'ENG101 3.00 A student@example.com'}),row({code:'123456789'}),row({page:9})];
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>vendor(extracted({rows,issues:['Student name: Jamie Doe','Course code is faint.']}))}),response=await f.call();assert.equal(response.status,200);assert.equal(response.body.rows.length,2);assert.equal(response.body.rows[0].grade,'A');assert.equal(response.body.rows[1].grade,'B');assert.doesNotMatch(JSON.stringify(response.body),/Jamie|123456789|student@example|Cumulative/);assert(response.body.issues.includes('Course code is faint.'));
});
test('model-added ownership, evaluations or official claims are rejected rather than persisted',async t=>{
  const f=fixture(t);let i=0;for(const extra of [{evaluations:[{trusted:true}]},{studentId:'secret'},{sourceProgramId:'liberty'},{approved:true}]){f.env.PORTAL_USER={id:'claims-'+i++};f.env.TRANSCRIPT_AI_FETCH=async()=>vendor(extracted({rows:[row(extra)]}));const response=await f.call();assert.equal(response.status,502);assert.equal(response.body.code,'invalid_extraction');assert.doesNotMatch(JSON.stringify(response.body),/secret|liberty|trusted/);}
});
test('student and global attempts are durable, atomic and independent of plan-write quotas',async t=>{
  const f=fixture(t),responses=await Promise.all(Array.from({length:7},()=>f.call()));assert.equal(responses.filter(r=>r.status===200).length,3);assert.equal(responses.filter(r=>r.status===429).length,4);assert.equal(f.calls.length,3);assert.equal(f.runs().length,3);
  const original=f.env.PORTAL_USER;for(let i=0;i<7;i++){f.env.PORTAL_USER={id:'other-'+i};assert.equal((await f.call()).status,200);}f.env.PORTAL_USER={id:'last'};assert.equal((await f.call()).status,429);assert.equal(f.calls.length,10);assert.equal(f.runs().length,10);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_rate_limits').get().n,0);f.env.PORTAL_USER=original;
  f.DB.sqlite.prepare('UPDATE transcript_import_runs SET started_at=?').run(Date.now()-86400001);assert.equal((await f.call()).status,200);
});
test('server quota settings can only lower default caps',async t=>{
  const f=fixture(t,{TRANSCRIPT_IMPORT_STUDENT_DAILY_LIMIT:1,TRANSCRIPT_IMPORT_DAILY_LIMIT:2});assert.equal((await f.call()).status,200);assert.equal((await f.call()).status,429);f.env.PORTAL_USER={id:'other'};assert.equal((await f.call()).status,200);f.env.PORTAL_USER={id:'third'};assert.equal((await f.call()).status,429);
  f.env.TRANSCRIPT_IMPORT_STUDENT_DAILY_LIMIT=999;f.env.TRANSCRIPT_IMPORT_DAILY_LIMIT=999;const status=await(await handleTranscriptImport(new Request(origin+path),f.env)).json();assert.equal(status.limits.perStudentPerDay,3);assert.equal(status.limits.perDay,10);
});
test('provider failures are generic, consume one attempt, and never retry or echo private bodies',async t=>{
  const f=fixture(t);for(const status of [401,429,302]){f.env.TRANSCRIPT_AI_FETCH=async()=>{f.calls.push(true);return new Response('raw provider credential '+fakeKey+' student Jane Doe',{status,headers:{Location:'https://unexpected.invalid'}});};const response=await f.call();assert.equal(response.status,status===429?503:502);assert.doesNotMatch(JSON.stringify(response.body),/Jane|credential|unexpected|fake-server/);}
  assert.equal(f.calls.length,3);assert.equal(f.runs().length,3);assert.equal((await f.call()).status,429);
});
test('oversized, malformed and truncated provider output cannot become an import proposal',async t=>{
  const cases=[()=>new Response('x'.repeat(524289)),()=>new Response('not JSON'),()=>vendor(extracted(),{stop_reason:'max_tokens'}),()=>vendor(extracted({rows:Array.from({length:501},()=>row())})),()=>vendor({...extracted(),official:true}),()=>vendor(extracted(),{content:[{type:'text',text:'not JSON'}]})];
  const f=fixture(t);for(let i=0;i<cases.length;i++){f.env.PORTAL_USER={id:'format-'+i};f.env.TRANSCRIPT_AI_FETCH=async()=>cases[i]();const response=await f.call();assert.equal(response.status,502);assert.equal(response.body.rows,undefined);}
});
test('deadline and browser cancellation abort the one outbound request without retry',async t=>{
  const f=fixture(t,{TRANSCRIPT_AI_TIMEOUT_MS:15,TRANSCRIPT_AI_FETCH:async(url,options)=>{f.calls.push(options);return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('provider private timeout details')),{once:true});if(options.signal.aborted)reject(Error('aborted'));});}});
  const timed=await f.call();assert.equal(timed.status,503);assert.equal(timed.body.code,'scan_interrupted');assert(f.calls[0].signal.aborted);assert.equal(f.calls.length,1);
  f.env.TRANSCRIPT_AI_TIMEOUT_MS=90000;const controller=new AbortController(),pending=f.call(input(),{signal:controller.signal});setTimeout(()=>controller.abort(),10);const cancelled=await pending;assert.equal(cancelled.status,503);assert.equal(f.calls.length,2);assert(f.calls[1].signal.aborted);assert.equal(f.runs().length,2);
});
test('the deadline also bounds an uncooperative fetch or stalled response stream',async t=>{
  const f=fixture(t,{TRANSCRIPT_AI_TIMEOUT_MS:10,TRANSCRIPT_AI_FETCH:async()=>new Promise(()=>{})});const pending=await f.call();assert.equal(pending.status,503);assert.equal(pending.body.code,'scan_interrupted');
  f.env.TRANSCRIPT_AI_FETCH=async()=>new Response(new ReadableStream({start(){}}));const stalled=await f.call();assert.equal(stalled.status,503);assert.equal(stalled.body.code,'scan_interrupted');
});
test('SSE accepts immediately, returns the same proposal, and keeps documents out of progress events',async t=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>{await pending;return vendor();}}),response=await f.send(input(),{headers:{Accept:'text/event-stream'}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);privateResponse({headers:response.headers,body:{}});const reader=response.body.getReader(),first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/event: accepted\n/);assert.doesNotMatch(first,/ENG101|iVBOR/);release();let rest='';for(;;){const part=await reader.read();if(part.done)break;rest+=new TextDecoder().decode(part.value);}assert.match(rest,/event: result\n/);const data=JSON.parse(rest.match(/event: result\ndata: ([^\n]+)/)[1]);assert.equal(data.rows[0].code,'ENG101');assert.equal(data.requiresReview,true);
});
test('SSE provider errors are structured and stream cancellation aborts pending work',async t=>{
  const f=fixture(t,{TRANSCRIPT_AI_FETCH:async()=>new Response('private details',{status:500})}),response=await f.send(input(),{headers:{Accept:'text/event-stream'}}),text=await response.text();assert.match(text,/event: accepted/);assert.match(text,/event: error/);assert.match(text,/"status":502/);assert.doesNotMatch(text,/private details/);
  let signal;f.env.TRANSCRIPT_AI_FETCH=async(url,options)=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));};const next=await f.send(input(),{headers:{Accept:'text/event-stream'}}),reader=next.body.getReader();await reader.read();await reader.cancel();assert(signal.aborted);
});
