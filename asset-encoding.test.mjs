/** Model the edge's automatic encoding, which Node's Response does not perform. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

const source=readFileSync(new URL('./outputs/site/dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const NativeResponse=globalThis.Response,origin='https://degreepath.test';
const paths=['/data/pathways.json','/data/cost-comparisons.json','/data/school-insights.json','/data/curriculum-registry.json','/data/liberty.json','/data/tesu.json','/data/curricula/wgu.json','/data/curricula/liberty-online-expansion.json','/data/curricula/liberty-residential-expansion.json'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function edge(t){
  const encoding=new WeakMap();
  class CloudflareResponse extends NativeResponse {
    constructor(body,init={}){super(body,init);encoding.set(this,init.encodeBody||'automatic');}
  }
  globalThis.Response=CloudflareResponse;
  t.after(()=>{globalThis.Response=NativeResponse;});
  return{
    mode:response=>encoding.get(response),
    call:(path,options={})=>worker.fetch(new Request(origin+path,options),{},{}),
    async wire(response){
      const body=Buffer.from(await response.arrayBuffer());
      return body.length&&response.headers.get('Content-Encoding')==='gzip'&&encoding.get(response)!=='manual'?gzipSync(body):body;
    }
  };
}

test('browser single decompression yields real JSON for initial datasets and compiled model packs',async t=>{
  const cf=edge(t);
  for(const path of paths){
    const expected=readFileSync(new URL('./dist'+path,import.meta.url));
    const response=await cf.call(path,{headers:{'Accept-Encoding':'gzip'}});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('Content-Encoding'),'gzip',path);
    const browserBytes=gunzipSync(await cf.wire(response));
    assert.equal(browserBytes[0],0x7b,'Browser must receive JSON, not a second gzip stream: '+path);
    assert.equal(cf.mode(response),'manual','Precompressed response must opt out of automatic edge compression: '+path);
    assert.equal(hash(browserBytes),hash(expected),path+' changed after one browser decompression');
    assert.doesNotThrow(()=>JSON.parse(browserBytes.toString('utf8')),path+' must parse on page startup');
  }
});

test('identity requests still receive uncompressed JSON and match the gzip representation',async t=>{
  const cf=edge(t);
  for(const path of paths){
    const response=await cf.call(path,{headers:{'Accept-Encoding':'identity'}});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('Content-Encoding'),null,path);
    assert.equal(response.headers.get('Vary'),'Accept-Encoding',path);
    const body=await cf.wire(response),expected=readFileSync(new URL('./dist'+path,import.meta.url));
    assert.equal(hash(body),hash(expected),path);
    assert.doesNotThrow(()=>JSON.parse(body.toString('utf8')),path);
  }
});

test('HEAD and conditional requests preserve encoding metadata and invalidate the prior broken cache',async t=>{
  const cf=edge(t),path='/data/pathways.json';
  const initial=await cf.call(path,{headers:{'Accept-Encoding':'gzip'}}),etag=initial.headers.get('ETag');
  assert.match(etag,/-encoding-v2"$/,'Fix must replace validators for old double-compressed responses');
  const expected=readFileSync(new URL('./dist'+path,import.meta.url));
  const oldETag='W/"'+hash(expected).slice(0,24)+'"';
  assert.notEqual(etag,oldETag);
  const stale=await cf.call(path,{headers:{'Accept-Encoding':'gzip','If-None-Match':oldETag}});
  assert.equal(stale.status,200,'An ordinary reload must replace cached broken bytes');
  assert.equal(stale.headers.get('ETag'),etag);
  assert.equal(hash(gunzipSync(await cf.wire(stale))),hash(expected));
  const head=await cf.call(path,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});
  assert.equal(head.status,200);assert.equal(head.headers.get('Content-Encoding'),'gzip');
  assert.equal(head.headers.get('ETag'),etag);assert.equal(cf.mode(head),'manual');
  assert.equal((await cf.wire(head)).length,0);
  const unchanged=await cf.call(path,{headers:{'Accept-Encoding':'gzip','If-None-Match':etag}});
  assert.equal(unchanged.status,304);assert.equal(unchanged.headers.get('Vary'),'Accept-Encoding');
  assert.equal(unchanged.headers.get('ETag'),etag);assert.equal(cf.mode(unchanged),'manual');
  assert.equal((await cf.wire(unchanged)).length,0);
});
