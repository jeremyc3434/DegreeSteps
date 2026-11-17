/** Actual native build with an in-process public-assets binding. No live services are used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {LocalD1} from './scripts/benchmark-scale.mjs';

const root=import.meta.dirname,publicRoot=resolve(root,'outputs/cloudflare/public');
const nativePath=resolve(root,'outputs/cloudflare/worker.mjs');
const origin='https://native.synthetic.invalid';
let serial=0;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.webp':'image/webp'};
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
  const worker=(await import(pathToFileURL(nativePath).href+'?native-test='+serial++)).default;
  const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env,{waitUntil(){}});
  return{worker,env,call,assetCalls,external};
}

test('the native Worker separates public assets from server code instead of embedding the website',()=>{
  const native=readFileSync(nativePath),managed=readFileSync(resolve(root,'outputs/site/dist/server/index.js'));
  assert(native.byteLength<1024*1024,'Keep the native module bounded as the public library grows');assert(native.byteLength<managed.byteLength/4);
  const source=native.toString();assert(source.includes('external:true')||source.includes('"external":true'));assert(!source.includes('Add your courses in one upload.</h1>'),'The private workspace document must live in the asset directory');
  assert(readFileSync(resolve(publicRoot,'import-courses.html'),'utf8').includes('Add your courses in one upload.'));
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
  for(const path of['/portal.html','/plan.html','/account.html','/courses.html','/import-courses.html','/request-plan.html','/admin.html']){
    const response=await f.call(path);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex, nofollow/);
  }
  const before=f.assetCalls.length,response=await f.call('/api/portal/plans');assert.equal(response.status,401);assert.equal(f.assetCalls.length,before,'Private API routing cannot return a successful asset page');assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(f.external,[]);
});

test('native public degree resolution loads only the reviewed public build data and invokes no provider',async t=>{
  const f=await fixture(t);
  const response=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.liberty.edu/government/bachelors/criminal-justice/'}));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.matched,true);assert.equal(data.sourcePlan.qualityReady,true);assert.equal(data.sourcePlan.route.id,'liberty-criminal-justice-residential');assert.equal(data.sourcePlan.model.totalCredits,120);
  assert(f.assetCalls.some(call=>call.path==='/data/curriculum-registry.json'));assert(f.assetCalls.some(call=>call.path.startsWith('/data/')&&call.path.includes('liberty')));assert(f.assetCalls.every(call=>call.path.startsWith('/data/')));assert.deepEqual(f.external,[]);
});

test('native queue and scheduled entry points preserve bounded dispatch without credentials or paid calls',async t=>{
  const f=await fixture(t,{database:true});let acknowledged=0;
  assert.equal(typeof f.worker.queue,'function');assert.equal(typeof f.worker.scheduled,'function');
  const result=await f.worker.queue({messages:[{body:{jobId:'not-an-opaque-job-id'},ack(){acknowledged++;},retry(){throw Error('Malformed jobs must not be retried');}}]},f.env,{});
  assert.equal(result.invalid,1);assert.equal(result.completed,0);assert.equal(acknowledged,1);
  const scheduled=await f.worker.scheduled({},f.env,{});assert.deepEqual(scheduled,{enabled:false,dispatched:0,pending:0});
  assert.equal(f.env.DB.events.filter(event=>event.write).length,0);assert.deepEqual(f.external,[]);
});
