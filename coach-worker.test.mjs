/** Degree coach through the actual built Worker: off by default, and on only with COACH_ENABLED=1. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('./outputs/site/dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const origin='https://degreepath.example';
const journal=JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json',import.meta.url),'utf8'));
function database(t){
  const sqlite=new DatabaseSync(':memory:');for(const migration of journal.entries)sqlite.exec(readFileSync(new URL('./drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));t.after(()=>sqlite.close());
  return{sqlite,prepare(sql){const query=sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};},async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}};
}

test('built Worker: the coach API does not exist unless COACH_ENABLED is 1',async t=>{
  const DB=database(t);let called=0;
  for(const env of [{},{DB,COACH_ENABLED:'0',ANTHROPIC_API_KEY:'sk-ant-'+'x'.repeat(40),COACH_FETCH:async()=>{called++;}}]){
    const status=await worker.fetch(new Request(origin+'/api/coach/status'),env,{});assert.equal(status.status,200);assert.deepEqual(await status.json(),{enabled:false});
    const ask=await worker.fetch(new Request(origin+'/api/coach/ask',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Coach-Request':'1'},body:'{"question":"hi"}'}),env,{});assert.equal(ask.status,404);
  }
  assert.equal(called,0);assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM coach_questions').get().n,0);
  // Pages load the coach script, which shows nothing unless the status endpoint enables it.
  for(const page of ['/programs.html','/portal.html','/plan.html']){const html=await (await worker.fetch(new Request(origin+page),{},{})).text();assert.match(html,/<script src="\/coach\.js" defer><\/script>/);}
  for(const page of ['/index.html','/account.html']){const response=await worker.fetch(new Request(origin+page),{},{});if(response.status===200)assert.doesNotMatch(await response.text(),/coach\.js/);}
  const script=await worker.fetch(new Request(origin+'/coach.js'),{},{});assert.equal(script.status,200);
});

test('built Worker: enabled coach answers through the mocked provider and records usage',async t=>{
  const DB=database(t),calls=[];
  const env={DB,COACH_ENABLED:'1',COACH_HASH_SALT:'worker-test-salt-0123456789',ANTHROPIC_API_KEY:'sk-ant-worker-test-'+'k'.repeat(30),COACH_FETCH:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'m',type:'message',role:'assistant',content:[{type:'text',text:'See /programs.html\nNext step: Open the finder.'}],stop_reason:'end_turn',usage:{input_tokens:900,output_tokens:40,cache_creation_input_tokens:2500,cache_read_input_tokens:0}});}};
  const status=await (await worker.fetch(new Request(origin+'/api/coach/status'),env,{})).json();
  assert.equal(status.enabled,true);assert.equal(status.limit,15);assert.equal(status.remaining,15);assert.equal(status.signedIn,false);
  const response=await worker.fetch(new Request(origin+'/api/coach/ask',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Coach-Request':'1','CF-Connecting-IP':'192.0.2.4'},body:JSON.stringify({question:'Where do I start?'})}),env,{});
  assert.equal(response.status,200);const body=await response.json();assert.match(body.answer,/programs\.html/);assert.equal(body.remaining,14);
  assert.equal(calls.length,1);assert.equal(calls[0].model,'claude-haiku-5-5');
  assert.equal(DB.sqlite.prepare('SELECT calls FROM coach_spend_days').get().calls,1);
  DB.sqlite.prepare("INSERT INTO coach_questions (id,created_at,day,question,status,model) VALUES ('expired',?,'2026-01-01','old','answered','claude-haiku-5-5')").run(Date.now()-181*86400000);
  const pending=[];await worker.scheduled({scheduledTime:Date.parse('2026-11-20T10:00:00Z')},env,{waitUntil:promise=>pending.push(promise)});await Promise.allSettled(pending);
  assert.deepEqual(DB.sqlite.prepare('SELECT id FROM coach_questions').all().map(row=>row.id).filter(id=>id==='expired'),[],'the hourly sweep deletes rows older than 180 days');
  assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM coach_questions').get().n,1,'fresh rows survive the retention sweep');
});
