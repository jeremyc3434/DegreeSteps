/** Tests the actual built Worker boundary, with SQLite and a local mocked auth provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const source=readFileSync(new URL('./outputs/site/dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const origin='https://degreepath.example', id='11111111-1111-4111-8111-111111111111';
const journal=JSON.parse(readFileSync(new URL('./drizzle/meta/_journal.json',import.meta.url),'utf8'));
const publicProgram=JSON.parse(readFileSync(new URL('./dist/data/program-catalog.json',import.meta.url),'utf8')).programs.find(program=>program.school==='Liberty University'&&program.title==='Master of Arts in History (M.A.)');
assert(publicProgram,'The public catalogue must contain the history program used by these boundary fixtures');
function fixture(t,configured=true,{email='student@preview.invalid'}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const migration of journal.entries)sqlite.exec(readFileSync(new URL('./drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));t.after(()=>sqlite.close());
 const DB={prepare(sql){const query=sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};},async batch(statements){sqlite.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const env={DB,COMMUNITY_ADMIN_EMAIL:'owner@preview.invalid',...(configured?{PORTAL_SUPABASE_URL:'https://project.supabase.co',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',PORTAL_AUTH_FETCH:async(url,options={})=>{assert(url.startsWith('https://project.supabase.co/auth/v1/'));if(url.endsWith('/settings'))return Response.json({external:{email:true,google:true}});if(url.endsWith('/user'))return options.headers.Authorization==='Bearer verified-access'?Response.json({id,email,email_confirmed_at:'2026-11-01T00:00:00Z'}):Response.json({error:'invalid'}, {status:401});if(url.includes('/logout'))return new Response(null,{status:204});throw Error('Unexpected provider call');}}:{})};
 const call=(path,{method='GET',signedIn=false,headers={},body}={})=>worker.fetch(new Request(origin+path,{method,headers:{...(signedIn?{Cookie:'__Host-degreepath_access=verified-access'}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json','X-Portal-Request':'1','X-Community-Request':'1'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil:()=>{}});
 return{call,sqlite,env};
}
function noNetwork(t){let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Boundary fixtures must not fetch external catalogues');});return()=>assert.equal(calls,0,'Cached or rejected curriculum requests must not access the network');}
function readyCurriculum(){
 const requirementsHash=createHash('sha256').update('synthetic history requirement revision').digest('hex'),modelId='source-curriculum-'+requirementsHash.slice(0,32),retrievedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+86400000).toISOString();
 const model={id:modelId,school:publicProgram.school,title:publicProgram.title,level:'master',totalCredits:36,catalog:'2026-2027',reviewStatus:'automated-public-source',completeExecutablePathway:false,sources:[{id:'official-history',url:publicProgram.url}],requirements:[{id:'history-501',code:'HIST 501',credits:3,options:[{id:'university-hist501',provider:'University',code:'HIST 501',credits:3},{id:'borrowed-history',provider:'Accredited College',code:'HIS 600',receivingCode:'HIST 501',credits:3,evidence:'conditional',sourceIds:['official-history']}]}]};
 return{version:1,status:'ready',programId:publicProgram.id,model,route:{...publicProgram,id:publicProgram.id+'-source-'+requirementsHash.slice(0,16),parentId:publicProgram.id,modelId},source:{url:publicProgram.url,hash:'a'.repeat(64),requirementsHash},retrievedAt,expiresAt,cached:false};
}
function storeCurriculum(sqlite,key,payload){
 sqlite.prepare('INSERT INTO curriculum_source_cache (cache_key, program_id, source_url, payload_json, source_hash, checked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, expires_at=excluded.expires_at').run(key,payload.programId,payload.source?.url||null,JSON.stringify(payload),payload.source?.hash||null,payload.retrievedAt,payload.expiresAt);
}
const evidencePath=target=>'/api/community/evidence?'+new URLSearchParams(target);
const sourceEvidenceTarget=payload=>({kind:'course',programId:payload.model.id,requirementId:payload.model.requirements[0].id,courseId:payload.model.requirements[0].options[1].id,catalogYear:'2026-2027'});
test('public routes serve real HTML while app/account routes stay outside search',async()=>{
 for(const path of ['/','/resources/','/blog/','/guides/']){const r=await worker.fetch(new Request(origin+path),{},{});assert.equal(r.status,200,path);assert.match(await r.text(),/<main/);}
 for(const path of ['/portal.html','/plan.html','/account.html','/degree-audit.html']){const r=await worker.fetch(new Request(origin+path),{},{});assert.equal(r.status,200,path);assert.match(r.headers.get('X-Robots-Tag'),/noindex/);assert.equal(r.headers.get('Cache-Control'),'no-store');}
 const homepage=await(await worker.fetch(new Request(origin+'/'),{},{})).text();assert(!homepage.includes('id="portal-question-title"'));assert(homepage.includes('Build my plan'));
 const sitemap=await worker.fetch(new Request(origin+'/sitemap.xml'),{},{});assert.match(sitemap.headers.get('Content-Type'),/xml/);
});
test('bulk course upload serves private workspace HTML and exact same-origin binary/module assets',async()=>{
 const page=await worker.fetch(new Request(origin+'/import-courses.html'),{},{});assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');assert.match(page.headers.get('X-Robots-Tag'),/noindex/);assert.match(await page.text(),/Add your courses in one upload/);
 for(const [path,type]of[['/data/credit-import-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['/vendor/pdfjs/pdf.worker.mjs','application/javascript; charset=utf-8'],['/vendor/pdfjs/pdf.mjs','application/javascript; charset=utf-8']]){const expected=readFileSync(new URL('./dist'+path,import.meta.url)),response=await worker.fetch(new Request(origin+path),{},{});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),type);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);}
});
test('the built portal passes only the verified session into owner-scoped Postgres RPCs',async t=>{
 const done=noNetwork(t),f=fixture(t);f.env.PORTAL_STORAGE_BACKEND='supabase';const calls=[];
 f.env.PORTAL_DATA_FETCH=async(url,options)=>{assert(url.startsWith('https://project.supabase.co/rest/v1/rpc/'));assert.equal(options.headers.Authorization,'Bearer verified-access');assert.equal(options.headers.apikey,'sb_publishable_mock');const body=JSON.parse(options.body);assert.equal(body.p_actor_id,id);calls.push({name:url.split('/').at(-1),body});if(url.endsWith('/degreesteps_profile_get'))return Response.json({id:'sb-'+id,alias:'Student',createdAt:1,updatedAt:1});if(url.endsWith('/degreesteps_plan_list'))return Response.json([]);throw Error('Unexpected RPC');};
 const session=await f.call('/api/portal/session',{signedIn:true});assert.equal(session.status,200);const body=await session.json();assert.equal(body.storageBackend,'supabase');assert.equal(body.user.id,'sb-'+id);assert(!JSON.stringify(body).includes('verified-access'));
 const listed=await f.call('/api/portal/plans',{signedIn:true});assert.equal(listed.status,200);assert.deepEqual((await listed.json()).items,[]);assert.deepEqual(calls.map(c=>c.name),['degreesteps_profile_get','degreesteps_plan_list']);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans').get().n,0);done();
});
test('a Postgres outage never silently changes the selected backend or exposes legacy plans',async t=>{
 const done=noNetwork(t),f=fixture(t);f.env.PORTAL_STORAGE_BACKEND='supabase';f.env.PORTAL_DATA_FETCH=async()=>Response.json({message:'provider-private-error'},{status:500});
 const response=await f.call('/api/portal/plans',{signedIn:true});assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'storage_unavailable');assert(!JSON.stringify(body).includes('provider-private-error'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');done();
});
test('the built transcript route uses verified identity and the encrypted server-only Claude connection',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t),path='/api/portal/transcript-import';let providerCalls=0;
 const publicStatus=await f.call(path);assert.equal(publicStatus.status,200);assert.deepEqual((await publicStatus.json()).requiresSignIn,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM transcript_import_runs').get().n,0);
 assert.equal((await f.call(path,{method:'POST',headers:{'oai-authenticated-user-id':'owner','x-portal-user-id':'owner'},body:{}})).status,401);
 assert.equal((await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}})).status,200);
 const status=await(await f.call(path,{signedIn:true})).json();assert.equal(status.configured,true);assert.equal(status.requiresSignIn,false);assertNoConnectionSecret(status);
 f.env.TRANSCRIPT_AI_FETCH=async(url,options)=>{providerCalls++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers.Authorization,'Bearer '+testConnectionKey);const body=JSON.parse(options.body);assert.equal(body.tools,undefined);assert.equal(body.max_tokens,8000);return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({documentKind:'completed-transcript',rows:[{provider:'Sophia',code:'SOPH-0001',title:'College Algebra',credits:3,creditSystem:'semester',status:'earned',grade:'P',score:null,completedOn:'',page:1,sourceText:'SOPH-0001 College Algebra 3 semester credits P'}],issues:[]})}]});};
 const body={consent:true,documentKind:'completed-transcript',pages:[{page:1,mediaType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}]},response=await f.call(path,{method:'POST',signedIn:true,body});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');const result=await response.json();assert.equal(result.rows.length,1);assert.equal(result.requiresReview,true);assertNoConnectionSecret(result);assert.equal(providerCalls,1);assert.equal(f.sqlite.prepare('SELECT user_id FROM transcript_import_runs').get().user_id,'sb-'+id);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles').get().n,0);done();
});
test('large public JSON serves matching gzip and identity bytes with representation-aware caching',async()=>{
 for(const path of ['/data/program-catalog.json','/data/curriculum-registry.json']){
  const expected=readFileSync(new URL('./dist'+path,import.meta.url)),identity=await worker.fetch(new Request(origin+path),{},{}),compressed=await worker.fetch(new Request(origin+path,{headers:{'Accept-Encoding':'gzip'}}),{},{});
  assert.equal(identity.status,200,path);assert.equal(compressed.status,200,path);assert.equal(identity.headers.get('Content-Encoding'),null);assert.equal(compressed.headers.get('Content-Encoding'),'gzip');assert.match(identity.headers.get('Content-Type'),/^application\/json/);assert.equal(identity.headers.get('Vary'),'Accept-Encoding');assert.equal(compressed.headers.get('Vary'),'Accept-Encoding');
  assert.deepEqual(Buffer.from(await identity.arrayBuffer()),expected);const bytes=Buffer.from(await compressed.arrayBuffer());assert.equal(bytes[0],0x1f);assert.equal(bytes[1],0x8b);assert.deepEqual(gunzipSync(bytes),expected);
  const etag=identity.headers.get('ETag');assert.match(etag,/^W\//);assert.equal(compressed.headers.get('ETag'),etag);
  const head=await worker.fetch(new Request(origin+path,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}}),{},{});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Encoding'),'gzip');assert.equal(head.headers.get('ETag'),etag);assert.equal((await head.arrayBuffer()).byteLength,0);
  const unchanged=await worker.fetch(new Request(origin+path,{headers:{'Accept-Encoding':'gzip','If-None-Match':etag}}),{},{});assert.equal(unchanged.status,304);assert.equal(unchanged.headers.get('Vary'),'Accept-Encoding');assert.equal((await unchanged.arrayBuffer()).byteLength,0);
 }
});
test('curriculum API resolves public catalogue IDs, requires durable cache, and rejects caller URLs and writes',async t=>{
 const assertNoNetwork=noNetwork(t),directory=await worker.fetch(new Request(origin+'/api/catalog/programs?school=liberty&level=master&q=Master%20of%20Arts%20in%20History'),{},{});assert.equal(directory.status,200);assert((await directory.json()).programs.some(program=>program.id===publicProgram.id));
 const path='/api/curriculum?program='+publicProgram.id,missingDB=await worker.fetch(new Request(origin+path),{},{});assert.equal(missingDB.status,503);assert.equal((await missingDB.json()).code,'cache_unavailable');assert.equal(missingDB.headers.get('Cache-Control'),'no-store');
 assert.equal((await worker.fetch(new Request(origin+'/api/curriculum?program=unknown'),{},{})).status,404);
 assert.equal((await worker.fetch(new Request(origin+path+'&url=https://169.254.169.254/metadata'),{},{})).status,400);
 assert.equal((await worker.fetch(new Request(origin+'/api/curriculum?program='+encodeURIComponent(publicProgram.url)),{},{})).status,404);
 const write=await worker.fetch(new Request(origin+path,{method:'POST'}),{},{});assert.equal(write.status,405);assert.equal(write.headers.get('Allow'),'GET');assertNoNetwork();
});
test('curriculum API serves ready and exact variant choices from D1 without external requests',async t=>{
 const assertNoNetwork=noNetwork(t),{call,sqlite}=fixture(t,false),payload=readyCurriculum(),key='courseleaf-v1:'+publicProgram.id+':';
 storeCurriculum(sqlite,key+'default',payload);
 let response=await call('/api/curriculum?program='+publicProgram.id);assert.equal(response.status,200);let data=await response.json();assert.equal(data.status,'ready');assert.equal(data.cached,true);assert.deepEqual(data.model,payload.model);assert.deepEqual(data.route,payload.route);
 const variantId='0123456789abcdef',choices={...payload,status:'choose-variant',model:undefined,route:undefined,variants:[{id:variantId,title:'History (M.A.) — Online',url:publicProgram.url+'online/',modalities:['online']}]};
 storeCurriculum(sqlite,key+'default',choices);storeCurriculum(sqlite,key+variantId,payload);
 response=await call('/api/curriculum?program='+publicProgram.id);data=await response.json();assert.equal(data.status,'choose-variant');assert.equal(data.cached,true);assert.deepEqual(data.variants,choices.variants);
 response=await call('/api/curriculum?program='+publicProgram.id+'&variant='+variantId);data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'ready');assert.equal(data.cached,true);assert.equal(data.model.id,payload.model.id);
 assert.equal((await call('/api/curriculum?program='+publicProgram.id+'&variant=https://evil.example/')).status,400);assertNoNetwork();
});
test('community evidence accepts immutable source curriculum revisions and rejects invalid course or revision identities',async t=>{
 const assertNoNetwork=noNetwork(t),{call,sqlite}=fixture(t),payload=readyCurriculum(),target=sourceEvidenceTarget(payload),key='revision:'+payload.model.id;
 storeCurriculum(sqlite,key,payload);
 const empty=await call(evidencePath(target));assert.equal(empty.status,200);const view=await empty.json();assert.deepEqual(view.target,target);assert.equal(view.summary.status,'unreported');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_users').get().n,0);
 const saved=await call('/api/community/evidence',{signedIn:true,method:'POST',body:{target,outcome:'success',evaluatedOn:new Date().toISOString().slice(0,10),details:'Synthetic evaluation of this exact receiving-course option.',evidenceUrl:'https://example.org/redacted-evaluation',consent:true}});assert.equal(saved.status,201);assert.equal((await saved.json()).item.target.programId,payload.model.id);
 const summary=await call('/api/community/evidence/summary?'+new URLSearchParams({programId:payload.model.id,catalogYear:target.catalogYear}));assert.equal(summary.status,200);assert.equal((await summary.json()).items.length,1);
 for(const invalid of [{...target,requirementId:'other-requirement'},{...target,courseId:'other-course'},{...target,courseId:'university-hist501'},{...target,programId:'source-curriculum-'+'f'.repeat(32)}])assert.equal((await call(evidencePath(invalid))).status,400,JSON.stringify(invalid));
 for(const invalid of [
  {...payload,model:{...payload.model,id:'source-curriculum-'+'b'.repeat(32)}},
  {...payload,source:{...payload.source,requirementsHash:'c'.repeat(64)}},
  {...payload,source:{...payload.source,requirementsHash:'invalid'}},
  {...payload,status:'needs-audit'},
  {...payload,expiresAt:'2000-01-01T00:00:00.000Z'}
 ]){storeCurriculum(sqlite,key,invalid);assert.equal((await call(evidencePath(target))).status,400);}
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_evidence').get().n,1);assertNoNetwork();
});
test('photography keeps exact binary bytes and supports HEAD and conditional caching',async()=>{
 const path='/images/degreepath-hero.webp',expected=readFileSync(new URL('./dist'+path,import.meta.url));
 const response=await worker.fetch(new Request(origin+path),{},{});
 assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/^image\/webp/);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected,'The Worker must return the original photo, not a base64 string or text-decoded bytes');
 const etag=response.headers.get('ETag');assert(etag);
 const head=await worker.fetch(new Request(origin+path,{method:'HEAD'}),{},{});
 assert.equal(head.status,200);assert.equal(head.headers.get('ETag'),etag);assert.match(head.headers.get('Content-Type'),/^image\/webp/);assert.equal((await head.arrayBuffer()).byteLength,0);
 const unchanged=await worker.fetch(new Request(origin+path,{headers:{'If-None-Match':etag}}),{},{});
 assert.equal(unchanged.status,304);assert.equal(unchanged.headers.get('ETag'),etag);assert.equal((await unchanged.arrayBuffer()).byteLength,0);
});
test('legacy plan links and directory URLs resolve without turning unknown URLs into successful pages',async()=>{
 const legacy=await worker.fetch(new Request(origin+'/?template=seed-liberty-residential'),{},{});assert.equal(legacy.status,302);assert.equal(legacy.headers.get('Location'),origin+'/portal.html?template=seed-liberty-residential');
 const directory=await worker.fetch(new Request(origin+'/resources'),{},{});assert.equal(directory.status,308);assert.equal(directory.headers.get('Location'),origin+'/resources/');
 const missing=await worker.fetch(new Request(origin+'/this-page-does-not-exist'),{},{});assert.equal(missing.status,404);assert.match(missing.headers.get('X-Robots-Tag'),/noindex/);
});
test('native or client supplied identity headers cannot bypass email/Google account authentication',async t=>{
 const{call}=fixture(t,false),headers={'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'owner@preview.invalid'};
 const account=await call('/api/portal/session',{headers});assert.equal((await account.json()).user,null);
 assert.equal((await call('/api/portal/plans',{headers})).status,401);
 const community=await call('/api/community/session',{headers});assert.equal((await community.json()).user,null);
 assert.equal((await call('/api/auth/login',{method:'POST',body:{email:'student@preview.invalid',password:'not-a-live-password'}})).status,503);
});
test('auth-provider user outages return503 without pretending private sessions expired or exposing saved records',async t=>{
 const done=noNetwork(t),{call,env,sqlite}=fixture(t),healthy=env.PORTAL_AUTH_FETCH;
 const privateMarker='Private outage fixture learning record',state={version:3,profile:{school:'Private School',degree:'Private degree'},learning:[{title:privateMarker,credits:3}]};
 const saved=await call('/api/portal/plans',{signedIn:true,method:'POST',body:{title:'Private outage plan',state,consent:true}});assert.equal(saved.status,201);const item=(await saved.json()).item;
 let lookups=0;env.PORTAL_AUTH_FETCH=async(url)=>{lookups++;assert(url.endsWith('/user'));return Response.json({error:'private-provider-outage-detail'},{status:503});};
 for(const path of ['/api/portal/session','/api/portal/plans','/api/portal/plans/'+item.id,'/api/templates/requests','/api/admin/templates','/api/admin/ai-connection','/api/colleges/status','/api/community/session']){
  const response=await call(path,{signedIn:true});assert.equal(response.status,503,path);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(response.headers.getSetCookie(),[],path+' must preserve sign-in cookies');
  const body=await response.json();assert.equal(typeof body.error,'string');assert(!Object.hasOwn(body,'user'),path+' must not report an anonymous session');assert(!Object.hasOwn(body,'items'));
  const encoded=JSON.stringify(body);for(const marker of [privateMarker,'private-provider-outage-detail','verified-access'])assert(!encoded.includes(marker));
 }
 assert.equal(lookups,8);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans').get().n,1);
 env.PORTAL_AUTH_FETCH=healthy;const recovered=await call('/api/portal/plans/'+item.id,{signedIn:true});assert.equal(recovered.status,200);assert.deepEqual((await recovered.json()).item.state,state);done();
});
test('auth-provider refresh outages preserve cookies and return503 instead of401 or an anonymous session',async t=>{
 const done=noNetwork(t),{call,env,sqlite}=fixture(t);let checks=0,refreshes=0;
 env.PORTAL_AUTH_FETCH=async(url,options={})=>{
  if(url.endsWith('/user')){checks++;assert.equal(options.headers.Authorization,'Bearer expired-access');return Response.json({error:'invalid'},{status:401});}
  assert(url.endsWith('/token?grant_type=refresh_token'));refreshes++;assert.deepEqual(JSON.parse(options.body),{refresh_token:'retained-refresh'});return Response.json({error:'private-refresh-outage-detail'},{status:503});
 };
 for(const path of ['/api/portal/session','/api/portal/plans']){
  const response=await call(path,{headers:{Cookie:'__Host-degreepath_access=expired-access; __Host-degreepath_refresh=retained-refresh'}});assert.equal(response.status,503,path);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(response.headers.getSetCookie(),[]);
  const body=await response.json();assert.equal(typeof body.error,'string');assert(!Object.hasOwn(body,'user'));assert(!JSON.stringify(body).includes('private-refresh-outage-detail'));assert(!JSON.stringify(body).includes('retained-refresh'));
 }
 assert.equal(checks,2);assert.equal(refreshes,2);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM portal_profiles').get().n,0);done();
});
test('auth-provider outages leave static, catalog, public-template and genuinely anonymous reads available',async t=>{
 const done=noNetwork(t),{call,env}=fixture(t);let lookups=0;env.PORTAL_AUTH_FETCH=async()=>{lookups++;throw Error('Public and anonymous reads must not resolve a session');};
 for(const path of ['/','/plan.html','/api/catalog/programs?school=liberty','/api/templates']){const response=await call(path,{signedIn:true});assert.equal(response.status,200,path);assert.deepEqual(response.headers.getSetCookie(),[]);await response.arrayBuffer();}
 const missing=await call('/api/templates/tpl-public-does-not-exist',{signedIn:true});assert.equal(missing.status,404);assert.deepEqual(missing.headers.getSetCookie(),[]);
 for(const path of ['/api/portal/session','/api/community/session']){const response=await call(path);assert.equal(response.status,200,path);assert.equal((await response.json()).user,null);}
 assert.equal(lookups,0);done();
});
test('public discussion edge caching skips repeatD1 reads without caching signed-in, cookie-bearing or evidence responses',async t=>{
 const done=noNetwork(t),{call,env,sqlite}=fixture(t),previousCaches=Object.getOwnPropertyDescriptor(globalThis,'caches'),entries=new Map();let matches=0,puts=0,prepared=0;
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{async match(key){matches++;return entries.get(key.url)?.clone();},async put(key,response){puts++;entries.set(key.url,response.clone());}}}});
 t.after(()=>{if(previousCaches)Object.defineProperty(globalThis,'caches',previousCaches);else delete globalThis.caches;});
 const prepare=env.DB.prepare;env.DB.prepare=function(...args){prepared++;return prepare.apply(this,args);};
 const created=await call('/api/community/posts',{signedIn:true,method:'POST',body:{kind:'question',context:'school:tesu',title:'Public cache boundary fixture',body:'Can this outside course help my degree?'}});assert.equal(created.status,201);const post=(await created.json()).item;
 const reaction=await call('/api/community/posts/'+post.id+'/reactions',{signedIn:true,method:'POST',body:{reaction:'like',active:true}});assert.equal(reaction.status,200);await reaction.arrayBuffer();
 const feed='/api/community/feed?context=school:tesu',beforeFirst=prepared,first=await call(feed);assert.equal(first.status,200);const firstBody=await first.json();assert(prepared>beforeFirst,'first anonymous feed readsD1');assert.equal(firstBody.items[0].author.isYou,false);assert.equal(firstBody.items[0].liked,false);assert.equal(firstBody.items[0].likes,1);await Promise.resolve();assert.equal(puts,1);assert.equal(entries.size,1);
 const beforeHit=prepared,hit=await call(feed);assert.equal(hit.status,200);assert.deepEqual(await hit.json(),firstBody);assert.equal(prepared,beforeHit,'the cached anonymous feed does not prepare anyD1 query');assert.equal(hit.headers.get('Cache-Control'),'no-store');assert.equal(hit.headers.get('X-DegreePath-Public-Cache-Until'),null);assert.deepEqual(hit.headers.getSetCookie(),[]);
 const publicCounts={matches,puts},beforePrivate=prepared,personal=await call(feed,{signedIn:true});assert.equal(personal.status,200);const own=(await personal.json()).items[0];assert.equal(own.author.isYou,true);assert.equal(own.liked,true);assert.equal(own.canEdit,true);assert(prepared>beforePrivate,'signed-in feed bypasses the anonymous cache and readsD1');assert.deepEqual({matches,puts},publicCounts);
 for(const Cookie of ['','__Host-degreepath_access=invalid-access']){const beforeCookie=prepared,response=await call(feed,{headers:{Cookie}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.items[0].author.isYou,false);assert.equal(data.items[0].liked,false);assert(prepared>beforeCookie,'even empty or invalid Cookie headers bypass the public cache');assert.deepEqual({matches,puts},publicCounts);}
 const payload=readyCurriculum();storeCurriculum(sqlite,'revision:'+payload.model.id,payload);const evidence='/api/community/evidence/summary?'+new URLSearchParams({programId:payload.model.id,catalogYear:'2026-2027'});
 for(let i=0;i<2;i++){const beforeEvidence=prepared,response=await call(evidence);assert.equal(response.status,200);await response.json();assert(prepared>beforeEvidence,'community verification always reads current evidence');assert.deepEqual({matches,puts},publicCounts);}
 done();
});
test('one verified managed identity owns private plans and community participation without publishing private data',async t=>{
 const{call,sqlite}=fixture(t),headers={'oai-authenticated-user-id':'wrong-native-user'};
 const state={version:3,profile:{school:'My School',degree:'My degree'},learning:[{title:'Private old course',credits:3}],sheet:{notes:{private:'Private advising note'}}};
 const saved=await call('/api/portal/plans',{signedIn:true,headers,method:'POST',body:{title:'My private plan',state,consent:true}});assert.equal(saved.status,201);const item=(await saved.json()).item;
 assert.equal(sqlite.prepare('SELECT user_id FROM portal_plans').get().user_id,'sb-'+id);
 const read=await call('/api/portal/plans/'+item.id,{signedIn:true});assert.deepEqual((await read.json()).item.state,state);
 const list=await(await call('/api/portal/plans',{signedIn:true})).text();assert(!list.includes('Private old course'));assert(!list.includes('Private advising note'));
 assert.equal((await call('/api/portal/plans/'+item.id,{headers})).status,401);
 const community=await(await call('/api/community/session',{signedIn:true,headers})).json();assert.equal(community.user.id,'sb-'+id);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n,0);
});
test('signing out clears managed cookies and cannot leave a native community session active',async t=>{
 const{call}=fixture(t);const out=await call('/api/auth/logout',{signedIn:true,method:'POST',body:{}});assert.equal(out.status,200);const cookies=out.headers.getSetCookie();assert(cookies.some(value=>value.startsWith('__Host-degreepath_access=;')&&value.includes('Max-Age=0')));
 const after=await call('/api/community/session',{headers:{'oai-authenticated-user-id':'old-native-user','oai-authenticated-user-email':'old@preview.invalid'}});assert.equal((await after.json()).user,null);
});

test('public template manifests avoid identity lookups and preserve private request boundaries',async t=>{
 const {call,env}=fixture(t);let lookups=0;env.PORTAL_AUTH_FETCH=async()=>{lookups++;throw Error('Public template browsing must not validate student sessions.');};
 const response=await call('/api/templates',{signedIn:true});assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.items,[]);assert.equal(data.configured,false);assert.equal(lookups,0);
 const privateRequests=await call('/api/templates/requests',{headers:{'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'owner@preview.invalid'}});assert.equal(privateRequests.status,401);assert.equal(lookups,0);
});
test('the built Worker reuses an exact curated plan before creating or charging for research',async t=>{
 const done=noNetwork(t),{call,sqlite}=fixture(t);const body={schoolName:'Liberty University',programName:'B.S. in Healthcare Administration',level:'bachelor',modality:'online',catalogYear:'2026-2027',startResearch:true};
 let response=await call('/api/templates/requests',{method:'POST',signedIn:true,body});assert.equal(response.status,200);let data=await response.json();assert.equal(data.reused,true);assert.equal(data.existingPlan.modelId,'curriculum-liberty-healthcare-administration-bs-online');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_requests').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);
 response=await call('/api/templates/requests',{method:'POST',signedIn:true,body:{...body,catalogYear:'2025-2026'}});assert.equal(response.status,202);data=await response.json();assert.equal(data.existingPlan,undefined);assert.equal(data.configured,false);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_requests').get().n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('new management routes reject spoofed roles and static management pages stay outside search',async t=>{
 const {call}=fixture(t);for(const path of ['/api/admin/templates','/api/admin/colleges']){let response=await call(path,{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@preview.invalid'}});assert.equal(response.status,401);response=await call(path,{signedIn:true});assert.equal(response.status,403);}
 for(const path of ['/request-plan.html','/admin.html']){const response=await call(path);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);}
});

const connectionPath='/api/admin/ai-connection',testConnectionKey='worker-fixture-claude-key-not-a-real-credential',testConnectionMaster='c3'.repeat(32);
function assertNoConnectionSecret(value){const text=JSON.stringify(value);for(const key of [testConnectionKey,testConnectionMaster])assert(!text.includes(key),'Browser responses must not expose credential material');assert.doesNotMatch(text,/"(?:apiKey|ciphertext|iv)"/);}
function connectWorkerFixture(t){
 const f=fixture(t,true,{email:'owner@preview.invalid'}),checks=[];f.env.AI_CONNECTIONS_MASTER_KEY=testConnectionMaster;
 f.env.AI_CONNECTIONS_FETCH=async(url,options)=>{checks.push({url,options});assert.equal(url,'https://api.anthropic.com/v1/messages/count_tokens');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+testConnectionKey);assert.equal(options.headers['anthropic-version'],'2026-10-21');const body=JSON.parse(options.body);assert.deepEqual(body.messages,[{role:'user',content:'Connection check.'}]);assert.equal(body.max_tokens,undefined);assert.equal(body.tools,undefined);return Response.json({input_tokens:4});};
 return{...f,checks};
}
test('the built Claude connection boundary rejects anonymous, spoofed, member and moderator identities',async t=>{
 const done=noNetwork(t),f=fixture(t),spoof={'oai-authenticated-user-id':'sb-'+id,'oai-authenticated-user-email':'owner@preview.invalid','X-User-Role':'owner'};
 const actions=[{method:'GET'},{method:'PUT',body:{revision:0,apiKey:testConnectionKey}},{method:'DELETE',body:{revision:0}},{path:connectionPath+'/test',method:'POST',body:{revision:0}}];
 for(const action of actions){const {path=connectionPath,...options}=action;assert.equal((await f.call(path,{...options,headers:spoof})).status,401);assert.equal((await f.call(path,{...options,headers:{...spoof,Cookie:'__Host-degreepath_access=unverified-owner'}})).status,401);}
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_users').get().n,0);
 await f.call('/api/community/session',{signedIn:true});
 for(const role of ['member','moderator']){f.sqlite.prepare('UPDATE community_users SET role=? WHERE id=?').run(role,'sb-'+id);for(const action of actions){const {path=connectionPath,...options}=action;assert.equal((await f.call(path,{...options,signedIn:true,headers:spoof})).status,403,role+' '+options.method);}}
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_service_connections').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_connection_events').get().n,0);done();
});
test('the built Worker bootstraps only a provider-verified owner and saves/tests an encrypted Claude credential',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t),initial=await f.call(connectionPath,{signedIn:true,headers:{'oai-authenticated-user-id':'wrong-client-id'}});assert.equal(initial.status,200);assert.match(initial.headers.get('Cache-Control'),/no-store/);assert.equal(initial.headers.get('Vary'),'Cookie');const status=await initial.json();assert.equal(status.canManage,true);assert.equal(status.configured,false);assert.equal(status.storageReady,true);assert.equal(status.revision,0);assertNoConnectionSecret(status);assert.equal(f.sqlite.prepare('SELECT id,role FROM community_users').get().id,'sb-'+id);assert.equal(f.sqlite.prepare('SELECT role FROM community_users').get().role,'owner');
 const saved=await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}});assert.equal(saved.status,200);const data=await saved.json();assert.equal(data.configured,true);assert.equal(data.source,'managed');assert.equal(data.revision,1);assertNoConnectionSecret(data);
 const record=f.sqlite.prepare('SELECT * FROM ai_service_connections').get();assert.equal(record.updated_by,'sb-'+id);assert.match(record.iv,/^[0-9a-f]{24}$/);assert(record.ciphertext.length>testConnectionKey.length);assert(!JSON.stringify(record).includes(testConnectionKey));assert(!Buffer.from(record.ciphertext,'base64').toString().includes(testConnectionKey));assert.equal(f.checks.length,1);
 const tested=await f.call(connectionPath+'/test',{signedIn:true,method:'POST',body:{revision:1}});assert.equal(tested.status,200);const result=await tested.json();assert.equal(result.tested,true);assert.equal(result.revision,1);assertNoConnectionSecret(result);assert.equal(f.checks.length,2);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);assert.deepEqual(f.sqlite.prepare('SELECT action FROM ai_connection_events ORDER BY rowid').all().map(row=>row.action),['connect','test']);done();
});
test('saved Claude configuration reaches admin/public metadata without revealing its credential or authenticating public browsing',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t);assert.equal((await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}})).status,200);
 const admin=await f.call('/api/admin/templates/config',{signedIn:true});assert.equal(admin.status,200);const config=await admin.json();assert.equal(config.configured,true);assertNoConnectionSecret(config);
 let authLookups=0;f.env.PORTAL_AUTH_FETCH=async()=>{authLookups++;throw Error('Public metadata must not authenticate a visitor');};
 const publicResponse=await f.call('/api/templates',{signedIn:true});assert.equal(publicResponse.status,200);const manifest=await publicResponse.json();assert.equal(manifest.configured,true);assert.deepEqual(manifest.items,[]);assertNoConnectionSecret(manifest);assert.equal(authLookups,0);assert.equal(f.checks.length,1);done();
});
function workerResearchArtifact(){
 const scope={schoolName:'Example University',programName:'Business B.S.',level:'bachelor',modality:'online',catalogYear:'2026-2027'},artifact={...scope,officialUniversityUrl:'https://catalog.example.edu/business/',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,upperMinCredits:3,majorInstitutionFraction:.25,majorResidencyBasisCredits:6,policySourceIds:['policies'],unresolved:[],pros:[],cons:[],sources:[{id:'catalog',url:'https://catalog.example.edu/business/',title:'Synthetic published curriculum',kind:'university',roles:['curriculum'],scope,checked:new Date().toISOString().slice(0,10)},{id:'policies',url:'https://catalog.example.edu/policies/',title:'Synthetic published policy',kind:'university',roles:['policy'],scope,checked:new Date().toISOString().slice(0,10)}],requirements:[1,2,3,4].map(n=>({id:'course-'+n,code:n===4?'BUSI 401':'BUSI 10'+n,title:'Synthetic named course '+n,section:n>2?'major':'general',credits:3,requiredAtUniversity:n===4,upper:n===4,sourceIds:['catalog'],prerequisites:[],options:[{id:'university-'+n,provider:'University',code:n===4?'BUSI 401':'BUSI 10'+n,title:'Synthetic named course '+n,credits:3,creditSystem:'semester',upper:n===4,sourceIds:['catalog'],url:'https://catalog.example.edu/course-'+n+'/',evidence:'published'}]}))};
 artifact.policyEvidence=Object.fromEntries(['institutionMinCredits','externalMaxCredits','upperMinCredits','majorInstitutionFraction','majorResidencyBasisCredits'].map(field=>[field,{value:artifact[field],sourceIds:['policies']}]));return artifact;
}
function workerFetchedCurriculum(artifact){
 const source=artifact.sources.find(source=>source.kind==='university'&&source.roles.includes('curriculum'));
 return{type:'web_fetch_tool_result',tool_use_id:'srvtoolu_fixture_curriculum',content:{type:'web_fetch_result',url:source.url,retrieved_at:new Date().toISOString(),content:{type:'document',title:source.title,source:{type:'text',media_type:'text/plain',data:'Synthetic official curriculum. '+artifact.requirements.map(row=>row.code+' '+row.title+' '+row.credits+' credits').join('\n')},citations:{enabled:true}}}};
}
test('authenticated research in the built Worker decrypts the saved key, keeps outputs private drafts and reuses its result',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t),artifact=workerResearchArtifact();let researchCalls=0;assert.equal((await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}})).status,200);assert.equal(f.env.ANTHROPIC_API_KEY,undefined,'This fixture must use D1 rather than an environment API key');
 f.env.TEMPLATE_RESEARCH_FETCH=async(url,options)=>{researchCalls++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+testConnectionKey);assert(!options.body.includes(testConnectionKey));assert(!options.body.includes('Private student request note'));const body=JSON.parse(options.body);assert.equal(body.max_tokens,8192);assert.equal(body.tools[0].max_uses,3);return Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:200},content:[{type:'web_search_tool_result',content:artifact.sources.map(source=>({type:'web_search_result',url:source.url,title:source.title}))},workerFetchedCurriculum(artifact),{type:'text',text:JSON.stringify(artifact)}]});};
 const target={schoolName:artifact.schoolName,programName:artifact.programName,level:artifact.level,modality:artifact.modality,catalogYear:artifact.catalogYear,url:artifact.officialUniversityUrl,startResearch:true,details:'Private student request note'};
 const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:target});assert.equal(response.status,202);const result=await response.json();assert.equal(result.configured,true);assert.equal(result.template.status,'draft');assertNoConnectionSecret(result);assert.equal(researchCalls,1);assert.equal(f.sqlite.prepare('SELECT status FROM template_research_runs').get().status,'completed');assert.equal(f.sqlite.prepare('SELECT input_tokens FROM template_research_runs').get().input_tokens,100);
 const published=await(await f.call('/api/templates')).json();assert.deepEqual(published.items,[]);assertNoConnectionSecret(published);const reused=await(await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:target})).json();assert.equal(reused.reused,true);assert.equal(reused.template.id,result.template.id);assert.equal(researchCalls,1);assert.equal(f.checks.length,1);done();
});
test('the built connection boundary rejects redirects and cross-origin replacement without changing the saved credential',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t);await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}});const before=f.sqlite.prepare('SELECT ciphertext,iv,revision FROM ai_service_connections').get();let redirects=0;
 f.env.AI_CONNECTIONS_FETCH=async(url,options)=>{redirects++;assert.equal(url,'https://api.anthropic.com/v1/messages/count_tokens');assert.equal(options.redirect,'manual');return new Response('Unsafe provider content '+testConnectionKey,{status:302,headers:{Location:'https://attacker.example/collect'}});};
 const rejected=await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:1}});assert.equal(rejected.status,502);assertNoConnectionSecret(await rejected.json());assert.equal(redirects,1);assert.deepEqual(f.sqlite.prepare('SELECT ciphertext,iv,revision FROM ai_service_connections').get(),before);
 const crossOrigin=await f.call(connectionPath,{signedIn:true,method:'PUT',headers:{Origin:'https://other.example'},body:{apiKey:testConnectionKey,revision:1}});assert.equal(crossOrigin.status,403);assert.equal(redirects,1);assertNoConnectionSecret(await crossOrigin.json());done();
});

test('one degree URL resolves a ready curated plan without a key, research row or provider call',async t=>{
 const done=noNetwork(t),f=fixture(t),url='https://www.phoenix.edu/online-business-degrees/mba-competency-based-degree.html';
 for(const value of [url,url+'?utm_source=student&ref=friend']){
  const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url:value,startResearch:true}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.reused,true);assert.equal(data.sourcePlan.route.id,'phoenix-cb-mba');assert.equal(data.sourcePlan.route.level,'master');assert.deepEqual(data.sourcePlan.route.modalities,['online']);assert.equal(data.sourcePlan.qualityReady,true);
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM degree_templates').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('URL identity keeps meaningful catalog parameters and never selects one degree from a shared directory',async t=>{
 const done=noNetwork(t),f=fixture(t);
 for(const url of ['https://www.phoenix.edu/online-business-degrees/mba-competency-based-degree.html?catalog=2025','https://asuonline.asu.edu/online-degree-programs/undergraduate/']){
  const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,startResearch:true}});assert.equal(response.status,202);const data=await response.json();assert.equal(data.existingPlan,undefined);assert.equal(data.template.status,'queued');assert.notEqual(data.template.level,'bachelor','Unidentified degree level must not be invented');
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
function completeLinkArtifact(){
 const a=workerResearchArtifact();a.totalCredits=120;a.institutionMinCredits=30;a.externalMaxCredits=90;a.alternativeMaxCredits=90;a.upperMinCredits=30;a.majorResidencyBasisCredits=60;
 a.requirements=Array.from({length:40},(_,i)=>{const upper=i>=30,code='BUSI '+(upper?400+i:100+i);return{id:'course-'+i,code,title:'Synthetic course '+i,section:i<20?'general':'major',credits:3,requiredAtUniversity:i===39,upper,sourceIds:['catalog'],prerequisites:[],options:[{id:'university-'+i,provider:'University',code,title:'Synthetic course '+i,credits:3,creditSystem:'semester',upper,sourceIds:['catalog'],url:'https://catalog.example.edu/course-'+i+'/',evidence:'published'}]};});
 a.policyEvidence=Object.fromEntries(['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorInstitutionFraction','majorResidencyBasisCredits'].map(field=>[field,{value:a[field],sourceIds:['policies']}]));const scope=Object.fromEntries(['schoolName','programName','level','modality','catalogYear'].map(field=>[field,a[field]]));
 a.sources.push({id:'receiving-map',url:'https://catalog.example.edu/sophia-equivalencies/',title:'Synthetic official receiving map',kind:'university',roles:['receiving-map'],scope,checked:new Date().toISOString().slice(0,10)},{id:'provider-course',url:'https://www.sophia.org/online-courses/business/business-example/',title:'Synthetic provider identity',kind:'provider',roles:['provider-identity'],provider:'Sophia',courseCodes:['SOPH-1001'],checked:new Date().toISOString().slice(0,10)});
 a.requirements[0].options.unshift({id:'sophia-example',provider:'Sophia',code:'SOPH-1001',receivingCode:a.requirements[0].code,title:'Synthetic provider course',credits:3,creditSystem:'semester',upper:false,sourceIds:['receiving-map'],identitySourceIds:['provider-course'],url:a.sources.at(-1).url,evidence:'conditional',creditOrigin:'alternative',sourceCreditStatus:'unknown',mappingEvidence:{...scope,provider:'Sophia',providerCourseCode:'SOPH-1001',receivingCode:a.requirements[0].code,credits:3,creditSystem:'semester',creditOrigin:'alternative',sourceIds:['receiving-map']}});return a;
}
test('one unfamiliar URL returns a full sourced 120-credit private plan with named transfers and reuses it',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t),artifact=completeLinkArtifact();let calls=0;assert.equal((await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}})).status,200);
 f.env.TEMPLATE_RESEARCH_FETCH=async(url,options)=>{calls++;const prompt=JSON.parse(options.body);assert.equal(prompt.max_tokens,16384);assert.equal(prompt.tools[0].max_uses,6);assert.equal(options.headers.Authorization,'Bearer '+testConnectionKey);assert(prompt.messages[0].content.includes('christian-leaders'));assert(prompt.messages[0].content.includes('Westcott'));assert(prompt.tools[1].allowed_domains.includes('davaracademy.com'));assert(prompt.tools[1].allowed_domains.includes('coopersmithcc.net'));return Response.json({stop_reason:'end_turn',usage:{input_tokens:200,output_tokens:8000},content:[{type:'web_search_tool_result',content:artifact.sources.map(source=>({type:'web_search_result',url:source.url,title:source.title}))},workerFetchedCurriculum(artifact),{type:'text',text:JSON.stringify(artifact)}]});};
 const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url:artifact.officialUniversityUrl,startResearch:true}});assert.equal(response.status,202);const result=await response.json();assert.equal(result.template.planBuildable,true,JSON.stringify(result.template.planIssues));assert.equal(result.template.status,'draft');assert.equal(result.template.planArtifact.totalCredits,120);assert.equal(result.template.planArtifact.requirements.length,40);assert(result.template.planArtifact.requirements[0].options.some(option=>option.provider==='Sophia'&&option.code==='SOPH-1001'));assertNoConnectionSecret(result);
 const reused=await(await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url:artifact.officialUniversityUrl+'?utm_campaign=friend',startResearch:true}})).json();assert.equal(reused.reused,true);assert.equal(reused.template.id,result.template.id);assert.equal(calls,1);assert.equal((await(await f.call('/api/templates')).json()).items.length,0);done();
});

const libertyResidentialLink='https://www.liberty.edu/government/bachelors/criminal-justice/';
function seedIncompleteLiberty(sqlite){
 const stamp=Date.now()-600000,id='tpl-0123456789abcdef0123456789abcdef';
 sqlite.prepare("INSERT INTO degree_templates (id,canonical_key,school_name,program_name,level,modality,catalog_year,source_url,status,artifact_json,unresolved_json,revision,created_at,updated_at) VALUES (?,?, 'liberty','criminal justice','bachelor','online','2026-2027',?,'draft',?, ?,2,?,?)").run(id,'obsolete-liberty-cache',libertyResidentialLink,JSON.stringify({schoolName:'liberty',programName:'criminal justice',level:'bachelor',modality:'online',catalogYear:'2026-2027',totalCredits:120,requirements:[],sources:[],unresolved:[]}),JSON.stringify(['Confirm majorResidencyBasisCredits from the exact program policies.']),stamp,stamp);
 sqlite.prepare('INSERT INTO template_requests (id,user_id,template_id,details,created_at) VALUES (?,?,?,?,?)').run('old-liberty-request','sb-11111111-1111-4111-8111-111111111111',id,'',stamp);return id;
}
test('the exact reported Liberty link overrides an incomplete online cache with the full residential course plan',async t=>{
 const done=noNetwork(t),f=fixture(t);seedIncompleteLiberty(f.sqlite);
 const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url:libertyResidentialLink,startResearch:true}});assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.sourcePlan.qualityReady,true);assert.equal(result.sourcePlan.route.id,'liberty-criminal-justice-residential');assert.deepEqual(result.sourcePlan.route.modalities,['campus']);assert.equal(result.sourcePlan.model.level,'bachelor');assert.equal(result.sourcePlan.model.requirements.length,44);assert.equal(result.sourcePlan.summary.totalCredits,120);assert.equal(result.sourcePlan.summary.transferCredits,74);assert.equal(result.sourcePlan.summary.universityCredits,46);assert.equal(result.sourcePlan.summary.upperCredits,30);assert(result.sourcePlan.model.sources.some(source=>source.url.includes('/criminal-justice-resident/')));
 const providers=new Set(result.sourcePlan.model.requirements.flatMap(row=>row.options.map(option=>option.provider)));for(const provider of ['Sophia','Study.com','StraighterLine','CLEP'])assert(providers.has(provider));assert.equal(result.template,undefined);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('reopening the old Liberty request resolves its actual residential degree before attempting a paid rebuild',async t=>{
 const done=noNetwork(t),f=fixture(t),templateId=seedIncompleteLiberty(f.sqlite);
 const response=await f.call('/api/templates/requests/'+templateId+'/research',{signedIn:true,method:'POST',body:{revision:2}});assert.equal(response.status,200);const result=await response.json();assert.equal(result.sourcePlan.route.id,'liberty-criminal-justice-residential');assert.equal(result.sourcePlan.summary.totalCredits,120);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('evidenced online and residential aliases stay separate and specialization or catalog queries never inherit the general plan',async t=>{
 const done=noNetwork(t),f=fixture(t);
 for(const [url,modality,rows]of [['https://www.liberty.edu/residential/government/bachelors/criminal-justice/','campus',44],['https://www.liberty.edu/online/government/bachelors/criminal-justice/','online',39],['https://www.liberty.edu/online-at-liberty/bachelor-of-science-in-criminal-justice/','online',39]]){
  const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,startResearch:true}});assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.sourcePlan.route.modalities,[modality]);assert.equal(data.sourcePlan.model.requirements.length,rows);assert.equal(data.sourcePlan.summary.totalCredits,120);
 }
 for(const url of [libertyResidentialLink+'crime-scene-investigation/',libertyResidentialLink+'?catalog=2025']){
  const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,startResearch:true}});assert.equal(response.status,202);const data=await response.json();assert.equal(data.sourcePlan,undefined);assert.equal(data.existingPlan,undefined);
 }
 done();
});

test('the public degree-link lookup verifies only preloaded source plans and never reads accounts or launches research',async t=>{
 const done=noNetwork(t),url='/api/catalog/degree-link?'+new URLSearchParams({url:libertyResidentialLink+'?utm_source=test'}),response=await worker.fetch(new Request(origin+url),{},{});assert.equal(response.status,200);const data=await response.json();assert.equal(data.matched,true);assert.equal(data.sourcePlan.route.id,'liberty-criminal-justice-residential');assert.equal(data.sourcePlan.summary.totalCredits,120);assert.equal(data.sourcePlan.summary.transferCredits,74);assert.equal(data.sourcePlan.summary.universityCredits,46);assert.equal(data.configured,undefined);assert.equal(data.user,undefined);assert.equal(data.template,undefined);
 assert.equal((await worker.fetch(new Request(origin+'/api/catalog/degree-link?url=http%3A%2F%2Flocalhost'),{},{})).status,400);
 assert.equal((await worker.fetch(new Request(origin+url,{method:'POST'}),{},{})).status,405);
 const unknown=await worker.fetch(new Request(origin+'/api/catalog/degree-link?'+new URLSearchParams({url:'https://unlisted.example.edu/degree/'})),{},{});assert.deepEqual(await unknown.json(),{matched:false});done();
});

test('public reference packets expose sourced facts without claiming additional ready degree plans',async t=>{
 const done=noNetwork(t),response=await worker.fetch(new Request(origin+'/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.south.edu/doctor-of-business-administration-program-overview/'})),{},{});assert.equal(response.status,200);const result=await response.json();assert.equal(result.matched,false);assert.equal(result.referenceAvailable,true);assert.equal(result.sourcePlan,undefined);const packet=result.reference.packets[0],total=packet.facts.find(fact=>fact.field==='totalCredits');assert.equal(total.value,90);assert.equal(total.creditSystem,'quarter');assert(packet.ambiguities.some(item=>item.affects.includes('courseCount')));assert.equal(result.user,undefined);assert.equal(result.configured,undefined);done();
});
test('a month-coded WGU catalog reuses the exact published course plan without database research or network calls',async t=>{
 const done=noNetwork(t),{call,sqlite}=fixture(t),url='https://www.wgu.edu/online-business-degrees/business-management-bachelors-program.html';
 const response=await call('/api/catalog/degree-link?'+new URLSearchParams({url}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.matched,true);assert.equal(data.sourcePlan.model.catalog,'202605');assert.equal(data.sourcePlan.qualityReady,true);assert.equal(data.sourcePlan.summary.transferCredits,69);assert.equal(data.sourcePlan.summary.universityCredits,41);
 const reuse=await call('/api/templates/requests',{method:'POST',signedIn:true,body:{url,startResearch:true}});assert.equal(reuse.status,200);const result=await reuse.json();assert.equal(result.reused,true);assert.equal(result.sourcePlan.model.id,'curriculum-wgu-catalog-ecceaa488637ac83');assert.equal(result.sourcePlan.model.catalog,'202605');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_requests').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);
 const other=await call('/api/catalog/degree-link?'+new URLSearchParams({url:url+'?catalog=202503'}));assert.equal((await other.json()).sourcePlan,undefined);done();
});
test('invalid month-coded catalog versions are rejected before creating research requests',async t=>{
 const done=noNetwork(t),{call,sqlite}=fixture(t);
 for(const catalogYear of ['202600','202613','2026057']){const response=await call('/api/templates/requests',{method:'POST',signedIn:true,body:{schoolName:'Western Governors University',programName:'Business Management – B.S.',level:'bachelor',modality:'online',catalogYear,url:'https://www.wgu.edu/online-business-degrees/business-management-bachelors-program.html',startResearch:true}});assert.equal(response.status,400);}
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM template_requests').get().n,0);done();
});
function referenceDoctoralArtifact(unit){
 const a=workerResearchArtifact();Object.assign(a,{schoolName:'South College',programName:'Doctor of Business Administration',level:'doctorate',modality:'online',catalogYear:'2026-2028',officialUniversityUrl:'https://www.south.edu/doctor-of-business-administration-program-overview/',creditSystem:unit,totalCredits:90,institutionMinCredits:90,externalMaxCredits:0,alternativeMaxCredits:0,upperMinCredits:0,majorInstitutionFraction:0,majorResidencyBasisCredits:0});
 const scope=Object.fromEntries(['schoolName','programName','level','modality','catalogYear'].map(field=>[field,a[field]]));a.sources=[{id:'catalog',url:a.officialUniversityUrl,title:'Synthetic doctoral curriculum fixture',kind:'university',roles:['curriculum','degree-identity'],scope,checked:new Date().toISOString().slice(0,10)},{id:'policies',url:'https://www.south.edu/academic-policies/fixture/',title:'Synthetic doctoral policy fixture',kind:'university',roles:['policy'],scope,checked:new Date().toISOString().slice(0,10)}];
 a.requirements=Array.from({length:10},(_,i)=>({id:'doctoral-'+i,code:'DBA '+(700+i),title:'Synthetic doctoral requirement '+i,section:'major',credits:9,requiredAtUniversity:true,upper:false,sourceIds:['catalog'],prerequisites:[],options:[{id:'university-'+i,provider:'University',code:'DBA '+(700+i),title:'Synthetic doctoral requirement '+i,credits:9,creditSystem:unit,upper:false,sourceIds:['catalog'],url:a.officialUniversityUrl,evidence:'published'}]}));
 a.policyEvidence=Object.fromEntries(['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorInstitutionFraction','majorResidencyBasisCredits'].map(field=>[field,{value:a[field],sourceIds:['policies']}]));return a;
}
test('reference facts reject a mathematically balanced wrong-unit AI plan and guide one sourced repair',async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t);await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}});let calls=0;
 f.env.TEMPLATE_RESEARCH_FETCH=async(url,options)=>{calls++;const body=JSON.parse(options.body),a=referenceDoctoralArtifact(calls===1?'semester':'quarter');assert(body.messages[0].content.includes('south-college-dba-cbe'));assert(body.messages[0].content.includes('Curated reference data'));assert.equal(body.tools[1].type,'web_fetch_20250910');assert.equal(body.tools[1].max_uses,4);assert.equal(body.tools[1].max_content_tokens,8000);if(calls===2)assert(body.messages[0].content.includes('quarter'));return Response.json({stop_reason:'end_turn',usage:{input_tokens:300,output_tokens:2000},content:[{type:'web_search_tool_result',content:a.sources.map(source=>({type:'web_search_result',url:source.url,title:source.title}))},workerFetchedCurriculum(a),{type:'text',text:JSON.stringify(a)}]});};
 const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url:'https://www.south.edu/doctor-of-business-administration-program-overview/',startResearch:true}});assert.equal(response.status,202);const result=await response.json();assert.equal(calls,2,'A wrong credit unit must not be accepted just because the ledger totals balance');assert.equal(result.template.qualityReady,true,JSON.stringify(result.template.studentIssues));assert.equal(result.template.planArtifact.creditSystem,'quarter');assert.equal(result.template.planArtifact.totalCredits,90);assert.equal(result.template.artifact.researchProvenance.version,4);assert(result.template.artifact.researchProvenance.fetchedURLs.includes(result.template.url));assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,2);assertNoConnectionSecret(result);done();
});
test('ambiguous official learning formats ask one question before research and keep selected requests separate',async t=>{
 const done=noNetwork(t),f=fixture(t),references=JSON.parse(readFileSync(new URL('./dist/data/research-references.json',import.meta.url),'utf8')),packet=references.packets.find(packet=>packet.id.includes('walden')),url=packet.degreeUrls[0];
 const preflight=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,startResearch:true}});assert.equal(preflight.status,200);const choice=await preflight.json();assert.equal(choice.needsChoice,true);assert.equal(choice.referenceChoices,true);assert.deepEqual(choice.choices.map(item=>item.referenceChoice),['course-based','tempo']);assert(choice.choices.every(item=>item.label&&item.url===url));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM degree_templates').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_requests').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);
 assert.equal((await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,referenceChoice:'invented-format',startResearch:true}})).status,400);
 const items=[];for(const referenceChoice of ['course-based','tempo']){const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body:{url,referenceChoice,startResearch:false}});assert.equal(response.status,202);const data=await response.json();assert.equal(data.template.referenceChoice,referenceChoice);items.push(data.template);}
 assert.notEqual(items[0].id,items[1].id);const progress=await(await f.call('/api/templates/research-status?'+new URLSearchParams({url}),{signedIn:true})).json();assert.deepEqual(progress.items.map(item=>item.referenceChoice).sort(),['course-based','tempo']);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('expired known format choices block new research instead of allowing AI to silently select a route',async t=>{
 const done=noNetwork(t),f=fixture(t),references=JSON.parse(readFileSync(new URL('./dist/data/research-references.json',import.meta.url),'utf8')),packet=references.packets.find(packet=>packet.id.includes('walden')),url=packet.degreeUrls[0];t.mock.method(Date,'now',()=>Date.parse(packet.checkedOn+'T00:00:00Z')+46*86400000);
 const lookup=await(await f.call('/api/catalog/degree-link?'+new URLSearchParams({url}))).json();assert.equal(lookup.matched,false);assert.equal(lookup.referenceNeedsRefresh,true);assert.equal(lookup.reference,undefined);
 for(const body of [{url,startResearch:true},{url,referenceChoice:'tempo',startResearch:true}]){const response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',body});assert.equal(response.status,503);assert.match((await response.json()).error,/sources need an update/i);}
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM degree_templates').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM template_research_runs').get().n,0);done();
});
test('the built Worker sends an accepted stream before Claude finishes and keeps research outcomes private', {timeout:10000}, async t=>{
 const done=noNetwork(t),f=connectWorkerFixture(t),artifact=workerResearchArtifact();await f.call(connectionPath,{signedIn:true,method:'PUT',body:{apiKey:testConnectionKey,revision:0}});let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);t.after(()=>release());let calls=0;
 f.env.TEMPLATE_RESEARCH_FETCH=async()=>{calls++;entered();await gate;return Response.json({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:200},content:[{type:'web_search_tool_result',content:artifact.sources.map(source=>({type:'web_search_result',url:source.url,title:source.title}))},workerFetchedCurriculum(artifact),{type:'text',text:JSON.stringify(artifact)}]});};
 const body={schoolName:artifact.schoolName,programName:artifact.programName,level:artifact.level,modality:artifact.modality,catalogYear:artifact.catalogYear,url:artifact.officialUniversityUrl,startResearch:true},response=await f.call('/api/templates/requests',{signedIn:true,method:'POST',headers:{Accept:'text/event-stream'},body});assert.equal(response.status,202);assert.match(response.headers.get('Content-Type'),/^text\/event-stream/);assert.match(response.headers.get('Cache-Control'),/no-store/);const reader=response.body.getReader(),first=await reader.read(),decoder=new TextDecoder();let stream=decoder.decode(first.value,{stream:true});assert.match(stream,/event: accepted/);await started;assert.equal(calls,1);assert.equal(f.sqlite.prepare('SELECT status FROM template_research_runs').get().status,'running');
 release();while(true){const part=await reader.read();if(part.done)break;stream+=decoder.decode(part.value,{stream:true});}stream+=decoder.decode();const final=stream.split(/\r?\n\r?\n/).find(event=>/^event: result/m.test(event));assert(final);const result=JSON.parse(final.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n'));assert.equal(result.status,202);assert.equal(result.body.template.status,'draft');assert.equal(result.body.template.planArtifact.totalCredits,12);assertNoConnectionSecret(stream);assert.equal(calls,1);
 const anonymous=await f.call('/api/templates/requests',{method:'POST',headers:{Accept:'text/event-stream'},body});assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('Content-Type'),/application\/json/);assert.equal((await(await f.call('/api/templates')).json()).items.length,0);done();
});
