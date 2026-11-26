/** Actual native build with an in-process public-assets binding. No live services are used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {LocalD1} from './scripts/benchmark-scale.mjs';

const root=import.meta.dirname,publicRoot=resolve(root,'outputs/cloudflare/public');
const nativePath=resolve(root,'outputs/cloudflare/runtime/worker.mjs');
const origin='https://native.synthetic.invalid';
// Node retains every distinct ESM URL for the process lifetime. Importing a
// fresh ?fixture= URL also retains that Worker's parsed public curriculum
// packs, making this suite grow with every case. Compile the actual native
// bundle once into a factory instead: each invocation has fresh lexical caches
// which can be collected after its fixture, including mutated-artifact cases.
const nativeSource=readFileSync(nativePath,'utf8');
assert.equal((nativeSource.match(/^export default /gm)||[]).length,1,'The native bundle must have one Worker entry point');
assert.equal((nativeSource.match(/import\("\.\/owner-business\.mjs"\)/g)||[]).length,1,'Resolve the actual lazy owner module relative to its build');
assert(!/^import\s/m.test(nativeSource),'The native fixture expects the built self-contained entry module');
const createNativeWorker=new Function('"use strict";\n'+nativeSource.replace('import("./owner-business.mjs")','import('+JSON.stringify(pathToFileURL(resolve(nativePath,'../owner-business.mjs')).href)+')').replace(/^export default /m,'return '));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.webp':'image/webp'};
function assertNoReadyShortcut(result,message='This degree must not expose a ready-plan shortcut'){
  // Compare small scalar types: a stale negative fixture must report a bounded
  // failure instead of formatting an entire unexpected curriculum graph.
  assert.equal(typeof result.sourcePlan,'undefined',message+' (sourcePlan)');
  assert.equal(typeof result.existingPlan,'undefined',message+' (existingPlan)');
}
async function fixture(t,{database=false}={}){
  const assetCalls=[],external=[];
  const env={ASSETS:{async fetch(request){
    assert(request instanceof Request);const url=new URL(request.url),path=resolve(publicRoot,'.'+url.pathname);assert(path.startsWith(publicRoot+'/'),'Only public build assets can be requested');
    assetCalls.push({path:url.pathname,method:request.method});let bytes;try{bytes=readFileSync(path);}catch{return new Response('Missing synthetic asset',{status:404});}
    const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';
    // Deliberately permissive host headers test the Worker's private-page policy.
    const headers={'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'public, max-age=31536000','ETag':etag};
    if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
    return new Response(request.method==='HEAD'?null:bytes,{headers});
  }},PORTAL_AUTH_FETCH:async()=>{external.push('auth');throw Error('Native fixtures must not contact an identity provider');},AI_CONNECTIONS_FETCH:async()=>{external.push('claude');throw Error('Native fixtures must not contact Claude');}};
  if(database){env.DB=new LocalD1();t.after(()=>env.DB.close());}
  t.mock.method(globalThis,'fetch',async()=>{external.push('global');throw Error('Native fixtures must not perform external HTTP');});
  const worker=createNativeWorker();
  const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env,{waitUntil(){}});
  return{worker,env,call,assetCalls,external};
}

test('the native Worker separates public assets from server code instead of embedding the website',async()=>{
  const native=readFileSync(nativePath),managed=readFileSync(resolve(root,'outputs/site/dist/server/index.js'));
  assert(native.byteLength<1024*1024,'Keep the native module bounded as the public library grows');assert(native.byteLength<managed.byteLength/4);
  const source=native.toString();assert(source.includes('external:true')||source.includes('"external":true'));assert(!source.includes('Add your courses in one upload.</h1>'),'The private workspace document must live in the asset directory');
  assert(readFileSync(resolve(publicRoot,'import-courses.html'),'utf8').includes('Add your courses in one upload.'));
  // Check the real ESM interface once without populating another public cache.
  const worker=(await import(pathToFileURL(nativePath).href)).default;
  for(const entry of ['fetch','queue','scheduled'])assert.equal(typeof worker[entry],'function');
});

test('native assets preserve the exact public routes, bytes, MIME types, HEAD and revalidation',async t=>{
  const f=await fixture(t);
  for(const[path,file]of[['/','index.html'],['/resources/','resources/index.html'],['/brand.css','brand.css'],['/vendor/pdfjs/pdf.worker.mjs','vendor/pdfjs/pdf.worker.mjs'],['/data/credit-import-template.xlsx','data/credit-import-template.xlsx']]){
    const response=await f.call(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('Content-Type'),types[extname(file)]);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(resolve(publicRoot,file)));
    assert.match(response.headers.get('Cache-Control'),/public, max-age=(?:60|300), must-revalidate/);
  }
  const first=await f.call('/brand.css'),etag=first.headers.get('ETag');assert(etag);assert.equal((await f.call('/brand.css',{headers:{'If-None-Match':etag}})).status,304);
  const head=await f.call('/data/credit-import-template.xlsx',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await f.call('/unknown-native-route')).status,404);assert.equal((await f.call('/index.html')).status,301);assert.deepEqual(f.external,[]);
});

test('private native HTML overrides permissive asset-cache headers and API paths never fall through to assets',async t=>{
  const f=await fixture(t);
  for(const path of['/portal.html','/plan.html','/account.html','/courses.html','/import-courses.html','/request-plan.html','/admin.html','/coverage.html']){
    const response=await f.call(path);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex, nofollow/);
  }
  const before=f.assetCalls.length,response=await f.call('/api/portal/plans');assert.equal(response.status,401);assert.equal(f.assetCalls.length,before,'Private API routing cannot return a successful asset page');assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(f.external,[]);
});

test('native public degree resolution loads only the reviewed public build data and invokes no provider',async t=>{
  const f=await fixture(t);
  const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.liberty.edu/government/bachelors/criminal-justice/'}));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.matched,true);assert.equal(data.sourcePlan.qualityReady,true);assert.equal(data.sourcePlan.route.id,'liberty-criminal-justice-residential');assert.equal(data.sourcePlan.model.totalCredits,120);
  assert(f.assetCalls.some(call=>call.path==='/data/curriculum-registry.json'));assert(f.assetCalls.some(call=>call.path.startsWith('/data/')&&call.path.includes('liberty')));assert(f.assetCalls.every(call=>call.path.startsWith('/data/')));assert.deepEqual(f.external,[]);
  assert(f.assetCalls.some(call=>call.path==='/data/baseline-index.json'),'Known degrees use the build-time baseline index');
});

for(const [degreeUrl,modelId,total,outside,university,modality,level='bachelor']of [
  ['https://catalog.liberty.edu/undergraduate/colleges-schools/business/business-administration-data-analysis-major-bs/business-administration-bs-interdisciplinary-business-resident/','liberty-business-residential',120,83,37,'campus'],
  ['https://catalog.liberty.edu/undergraduate/colleges-schools/business/healthcare-administration-major-bs/healthcare-administration-online/','curriculum-liberty-healthcare-administration-bs-online',120,72,48,'online'],
  ['https://catalog.liberty.edu/undergraduate/colleges-schools/behavioral-sciences/psychology-major-bs/psychology-online/','curriculum-liberty-psychology-bs-online',120,78,42,'online'],
  ['https://catalog.liberty.edu/undergraduate/colleges-schools/arts-sciences/interdisciplinary-studies-major-aa/interdisciplinary-studies-aa-online/','curriculum-liberty-interdisciplinary-aa-online',60,39,21,'online','associate']
])test('native exact Liberty catalog resolution preserves the saved degree and credit split: '+modelId,async t=>{
  const f=await fixture(t),lookup=url=>f.call('/api/catalog/degree-link?'+new URLSearchParams({url}));
  const response=await lookup(degreeUrl);assert.equal(response.status,200);const result=await response.json();assert.equal(result.matched,true);
  const plan=result.sourcePlan;assert(plan,'The native asset-backed lookup must open the existing course plan');assert.equal(plan.qualityReady,true);assert.equal(plan.model.id,modelId);assert.equal(plan.model.level,level);assert.equal(plan.route.level,level);assert.deepEqual(plan.route.modalities,[modality]);assert.equal(plan.model.catalog.replace(/[–—]/g,'-'),'2026-2027');
  assert.equal(plan.summary.totalCredits,total);assert.equal(plan.summary.transferCredits,outside);assert.equal(plan.summary.universityCredits,university);assert.equal(plan.model.requirements.reduce((sum,row)=>sum+row.credits,0),total);assert(plan.model.sources.some(source=>source.url===degreeUrl));
  const wrongCatalog=await lookup(degreeUrl+'?catalog=2025-2026');assert.equal(wrongCatalog.status,200);const rejected=await wrongCatalog.json();assertNoReadyShortcut(rejected,'A different catalog must not inherit this baseline');
  assert(f.assetCalls.some(call=>call.path==='/data/publication-index.json'),'The native complete-plan shortcut requires the publication review');assert(f.assetCalls.some(call=>call.path==='/data/baseline-index.json'));assert(f.assetCalls.every(call=>call.path.startsWith('/data/')));assert.deepEqual(f.external,[]);
});

for(const [degreeUrl,title] of [
 ['https://catalog.liberty.edu/undergraduate/colleges-schools/business/business-major-aa/business-aa-online/','Business'],
 ['https://catalog.liberty.edu/undergraduate/colleges-schools/behavioral-sciences/psychology-major-aa/psychology-online/','Psychology']
])test('native unpublished associate curriculum keeps its degree identity without a ready-plan shortcut: '+title,async t=>{
 const f=await fixture(t),response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:degreeUrl}));assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.matched,true);assert.equal(result.target.schoolName,'Liberty University');assert.match(result.target.programName,new RegExp(title,'i'));assert.equal(result.target.level,'associate');assert.equal(result.target.modality,'online');assert.equal(result.target.catalogYear,'2026-2027');assertNoReadyShortcut(result,title+' A.A. retains its publication hold');assert(f.assetCalls.some(call=>call.path==='/data/publication-index.json'));assert.deepEqual(f.external,[]);
});

test('native exact WGU Human Resource Management uses its reviewed CU ledger and publication index',async t=>{
 const f=await fixture(t),url='https://www.wgu.edu/online-business-degrees/human-resources-bachelors-program.html';
 const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url}));assert.equal(response.status,200);const result=await response.json(),plan=result.sourcePlan;assert.equal(result.matched,true);assert(plan);
 assert.equal(plan.model.id,'curriculum-wgu-catalog-2e49db64c32dfc79');assert.equal(plan.model.catalog,'202509');assert.equal(plan.model.creditSystem,'competency-unit');assert.equal(plan.model.totalCredits,117);assert.equal(plan.model.requirements.length,39);assert.equal(plan.model.requirements.reduce((sum,row)=>sum+row.credits,0),117);assert.equal(plan.summary.transferCredits,78);assert.equal(plan.summary.universityCredits,39);assert.deepEqual(plan.route.modalities,['online']);assert(f.assetCalls.some(call=>call.path==='/data/publication-index.json'));assert.deepEqual(f.external,[]);
 const mismatch=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:url+'?catalog=202605'}));assertNoReadyShortcut(await mismatch.json(),'A different program edition must not inherit this CU ledger');
});

test('native exact registry-route discovery rejects cross-school, award, parent and ownership mismatches',async t=>{
 const url='https://catalog.liberty.edu/undergraduate/colleges-schools/behavioral-sciences/psychology-major-bs/psychology-online/';
 for(const change of ['school','level','parent','unknown-route','format','title']){
  const f=await fixture(t),original=f.env.ASSETS.fetch;
  f.env.ASSETS.fetch=async request=>{
   if(new URL(request.url).pathname!=='/data/curriculum-registry.json')return original(request);
   const index=JSON.parse(readFileSync(resolve(publicRoot,'data/curriculum-registry.json'),'utf8')),route=index.routes.find(route=>route.id==='liberty-catalog-fa62c08cdfa0c990-online');assert(route);
   if(change==='school')route.school='Another University';
   if(change==='level')route.level='master';
   if(change==='parent')route.parentId='liberty-catalog-cf514fa45da62116';
   if(change==='unknown-route')route.id='not-owned-by-reviewed-model';
   if(change==='format')route.modalities=['campus'];
   if(change==='title')route.title='Psychology (A.A.) — Online';
   return Response.json(index);
  };
  const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.matched,false,change);assertNoReadyShortcut(result,change);assert.deepEqual(f.external,[]);
 }
});

test('missing, malformed and stale native publication indexes never expose a ready-plan shortcut',async t=>{
 for(const change of ['missing','malformed','stale-curriculum']){
  const f=await fixture(t),original=f.env.ASSETS.fetch;
  f.env.ASSETS.fetch=async request=>{
   if(new URL(request.url).pathname!=='/data/publication-index.json')return original(request);
   if(change==='missing')return new Response('Missing',{status:404});
   if(change==='malformed')return new Response('{invalid');
   const index=JSON.parse(readFileSync(resolve(publicRoot,'data/publication-index.json'),'utf8'));index.curriculumFingerprint='content-v1:'+'0'.repeat(16);return Response.json(index);
  };
  const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.liberty.edu/government/bachelors/criminal-justice/'}));assert.equal(response.status,200);const result=await response.json();assertNoReadyShortcut(result,change);assert.deepEqual(f.external,[]);
 }
});

test('missing, malformed and mismatched baseline artifacts cannot advertise a cached complete plan',async t=>{
 for(const change of ['missing','malformed','planner-mismatch']){
  const f=await fixture(t),original=f.env.ASSETS.fetch;
  f.env.ASSETS.fetch=async request=>{
    if(new URL(request.url).pathname!=='/data/baseline-index.json')return original(request);
    if(change==='missing')return new Response('Missing',{status:404});
    if(change==='malformed')return new Response('{invalid');
    const index=JSON.parse(readFileSync(resolve(publicRoot,'data/baseline-index.json'),'utf8'));index.inputs['/planner.js']='0'.repeat(64);return Response.json(index);
  };
  const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.liberty.edu/government/bachelors/criminal-justice/'}));
  assert.equal(response.status,200,change);const body=await response.json();assertNoReadyShortcut(body,change);assert.deepEqual(f.external,[]);
 }
});

test('a guest cannot load the research graph or administrative review database',async t=>{
  const f=await fixture(t,{database:true}),before=f.assetCalls.length;
  const response=await f.call('/api/admin/academic-coverage');assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control'),/private, no-store/);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  assert.equal(f.assetCalls.length,before);assert.equal(f.env.DB.events.length,0);assert.deepEqual(f.external,[]);
});

test('native coverage loads compact indexes after admin authorization and hydrates only requested evidence',async t=>{
  const f=await fixture(t,{database:true});let email='student@preview.invalid',verifiedUuid='33333333-3333-4333-8333-333333333333';const ownerUuid='11111111-1111-4111-8111-111111111111';
  Object.assign(f.env,{OWNER_CONSOLE_SUBJECT_SHA256:createHash('sha256').update('sb-'+ownerUuid).digest('hex'),COMMUNITY_ADMIN_EMAIL:'owner@preview.invalid',PORTAL_SUPABASE_URL:'https://project.supabase.co',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',PORTAL_AUTH_FETCH:async(url,options)=>{
    assert(url.endsWith('/user'));assert.equal(options.headers.Authorization,'Bearer coverage-test-access');return Response.json({id:verifiedUuid,email,email_confirmed_at:'2026-11-01T00:00:00Z'});
  }});
  const call=(path,body)=>f.call(path,{method:body?'POST':'GET',headers:{Cookie:'__Host-degreepath_access=coverage-test-access',...(body?{Origin:origin,'Content-Type':'application/json','X-Portal-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/api/admin/academic-coverage')).status,403);assert.equal(f.assetCalls.length,0,'A student must not load the graph');
  email='owner@preview.invalid';assert.equal((await call('/api/admin/academic-coverage')).status,403,'A matching display email cannot replace the exact pinned subject');verifiedUuid=ownerUuid;const summary=await call('/api/admin/academic-coverage');assert.equal(summary.status,200);const status=await summary.json();assert(status.summary.programs>0);assert.equal(status.qualitySummary.models,status.summary.programs);
  // The overview reads the index and the per-school registry shards (fact and finding summaries), never evidence.
  assert(f.assetCalls.every(call=>['/data/academic-registry.json','/data/pathway-quality-report.json'].includes(call.path)||/^\/data\/academic-registry-shards\/[a-f0-9]{64}\.json$/.test(call.path)),'The overview must not hydrate any evidence');
  assert(f.assetCalls.some(call=>/^\/data\/academic-registry-shards\//.test(call.path)),'The overview reads the registry shards');
  const list=await(await call('/api/admin/academic-coverage/programs?limit=1')).json();assert.equal(list.items.length,1);
  const details=await call('/api/admin/academic-coverage/programs/'+list.items[0].id);assert.equal(details.status,200);const program=await details.json();assert(program.facts.length>0);assert(program.facts.every(fact=>fact.facts&&fact.evidenceFingerprint));
  assert(f.assetCalls.some(call=>/^\/data\/academic-evidence\/[a-f0-9]{64}\.json$/.test(call.path)));
  const fact=program.facts[0],saved=await call('/api/admin/academic-coverage/facts/'+fact.id+'/review',{registryRevision:status.registryRevision,evidenceFingerprint:fact.evidenceFingerprint,revision:0,decision:'needs-evidence',note:'Synthetic runtime test: this fact needs further evidence.',sourceIds:[],attestation:false});
  assert.equal(saved.status,201);assert.equal((await saved.json()).publicationChanged,false);
  const after=await(await call('/api/admin/academic-coverage/facts/'+fact.id)).json();assert.equal(after.fact.administrativeReview.decision,'needs-evidence');assert.equal(after.history.length,1);assert.equal(after.fact.evidenceFingerprint,fact.evidenceFingerprint);assert.deepEqual(f.external,[]);
  const index=JSON.parse(readFileSync(resolve(publicRoot,'data/academic-registry.json'),'utf8')),impact=new Map();
  const indexFacts=index.registryShards.flatMap(entry=>JSON.parse(readFileSync(resolve(publicRoot,entry.path.slice(1)),'utf8')).facts);
  for(const item of indexFacts)for(const sourceId of item.sourceIds)impact.set(sourceId,(impact.get(sourceId)||0)+1);
  for(const [sourceId]of [...impact].sort((a,b)=>b[1]-a[1]).slice(0,5)){
    const response=await call('/api/admin/academic-coverage/sources/'+sourceId);assert.equal(response.status,200,'A shared guide must stay within the evidence budget');const source=await response.json();assert.equal(source.factsAreSummaries,true);assert(source.facts.length);assert(source.facts.every(item=>item.label&&item.facts===undefined));
  }
});

test('native queue and scheduled entry points preserve bounded dispatch without credentials or paid calls',async t=>{
  const f=await fixture(t,{database:true});let acknowledged=0;
  assert.equal(typeof f.worker.queue,'function');assert.equal(typeof f.worker.scheduled,'function');
  const result=await f.worker.queue({messages:[{body:{jobId:'not-an-opaque-job-id'},ack(){acknowledged++;},retry(){throw Error('Malformed jobs must not be retried');}}]},f.env,{});
  assert.equal(result.invalid,1);assert.equal(result.completed,0);assert.equal(acknowledged,1);
  const scheduled=await f.worker.scheduled({},f.env,{});assert.deepEqual(scheduled,{enabled:false,dispatched:0,pending:0});
  assert.equal(f.env.DB.events.filter(event=>event.write).length,0);assert.deepEqual(f.external,[]);
});
