import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fetchPage,storeCapture} from './scripts/pathway-factory/capture.mjs';
import {CONNECTED_WEB_FORMAT,CONNECTED_WEB_TOOL,extractConnectedWebBody} from './scripts/pathway-factory/connected-web.mjs';

const url='https://catalog.example.edu/current/business';
const at=date=>()=>new Date(date);
const page=async(text='Business degree: 120 credits.',address=url)=>fetchPage(address,{fetchImpl:async()=>({ok:true,status:200,url:address,headers:{get:()=> 'text/plain'},text:async()=>text})});
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'capture-history-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('re-fetching unchanged evidence preserves the original bytes and records the actual later retrieval separately',async t=>{
  const dir=await workspace(t),source=await page();
  const first=await storeCapture(source,{dir,now:at('2026-11-01T10:00:00Z')});
  const original=await readFile(first.sidecar,'utf8');
  const later=await storeCapture({...source,finalUrl:url+'/',contentType:'text/plain; charset=utf-8'},{dir,now:at('2026-11-26T11:00:00Z')});
  assert.equal(later.path,first.path);
  assert.equal(await readFile(first.sidecar,'utf8'),original,'a later fetch cannot rewrite evidence cited by an older review');
  assert.equal(await readFile(first.path,'utf8'),source.text);
  const receipt=JSON.parse(await readFile(later.retrievalReceipt,'utf8'));
  assert.equal(receipt.kind,'source-retrieval');
  assert.equal(receipt.capture,first.relative);
  assert.equal(receipt.sha256,source.sha256);
  assert.equal(receipt.url,url);
  assert.equal(receipt.finalUrl,url+'/');
  assert.equal(receipt.fetchedAt,'2026-11-26T11:00:00.000Z');
  assert.equal(JSON.parse(original).fetchedAt,'2026-11-01T10:00:00.000Z');
  const again=await storeCapture({...source,finalUrl:url+'/',contentType:'text/plain; charset=utf-8'},{dir,now:at('2026-11-26T11:00:00Z')});
  assert.equal(again.retrievalReceipt,later.retrievalReceipt,'replaying the same observation is idempotent');
});

test('concurrent later retrievals retain every distinct observation without replacing the first review evidence',async t=>{
  const dir=await workspace(t),source=await page();
  const first=await storeCapture(source,{dir,now:at('2026-11-01T10:00:00Z')}),original=await readFile(first.sidecar,'utf8');
  const results=await Promise.all(Array.from({length:8},(_,i)=>storeCapture(source,{dir,now:()=>new Date(Date.UTC(2026,10,26,11,i))})));
  assert.equal(new Set(results.map(result=>result.retrievalReceipt)).size,8);
  const folder=join(dir,'retrievals',source.sha256.slice(0,16));
  assert.equal((await readdir(folder)).length,8);
  const dates=await Promise.all(results.map(async result=>JSON.parse(await readFile(result.retrievalReceipt,'utf8')).fetchedAt));
  assert.equal(new Set(dates).size,8);
  assert.equal(await readFile(first.sidecar,'utf8'),original);
});

test('changed source content creates a distinct immutable capture and preserves the previously cited body',async t=>{
  const dir=await workspace(t),first=await storeCapture(await page(),{dir,now:at('2026-11-01T10:00:00Z')});
  const original=await readFile(first.sidecar,'utf8');
  const changed=await storeCapture(await page('Business degree: 123 credits.'),{dir,now:at('2026-11-26T11:00:00Z')});
  assert.notEqual(changed.path,first.path);
  assert.equal(await readFile(first.path,'utf8'),'Business degree: 120 credits.');
  assert.equal(await readFile(first.sidecar,'utf8'),original);
  assert.equal(await readFile(changed.path,'utf8'),'Business degree: 123 credits.');
});

test('a matching body at another URL cannot relabel the original source identity',async t=>{
  const dir=await workspace(t),first=await storeCapture(await page(),{dir,now:at('2026-11-01T10:00:00Z')});
  const original=await readFile(first.sidecar,'utf8');
  const other=await page('Business degree: 120 credits.','https://another.example.edu/degree');
  await assert.rejects(storeCapture(other,{dir}),/another URL; use a separate capture directory/);
  assert.equal(await readFile(first.sidecar,'utf8'),original);
  const separate=await storeCapture(other,{dir:join(dir,'separate-source')});
  assert.equal(JSON.parse(await readFile(separate.sidecar,'utf8')).url,other.url);
  assert.equal(await readFile(first.sidecar,'utf8'),original);
});

test('forged hashes, failed responses, corrupt stored evidence and incomplete pairs are rejected rather than repaired silently',async t=>{
  const dir=await workspace(t),source=await page();
  await assert.rejects(storeCapture({...source,sha256:'0'.repeat(64)},{dir}),/match its full SHA-256/);
  await assert.rejects(storeCapture({...source,status:404},{dir}),/actual successful HTTP/);
  assert.deepEqual(await readdir(dir),[]);
  const saved=await storeCapture(source,{dir,now:at('2026-11-01T10:00:00Z')}),original=await readFile(saved.sidecar,'utf8');
  await writeFile(saved.path,'tampered evidence');
  await assert.rejects(storeCapture(source,{dir}),/integrity failed/);
  assert.equal(await readFile(saved.path,'utf8'),'tampered evidence');
  assert.equal(await readFile(saved.sidecar,'utf8'),original);
  await rm(saved.sidecar);
  await assert.rejects(storeCapture(source,{dir}),/capture is incomplete/);
  assert.equal(await readFile(saved.path,'utf8'),'tampered evidence');
});

test('native evidence retains its unknown HTTP status and actual observation time with verifiable raw proof',async t=>{
  const base=await workspace(t),dir=join(base,'content/source-captures'),digest=value=>createHash('sha256').update(value).digest('hex');
  async function observed(citationRef,observedAt){
    const response={isError:false,content:[{type:'text',text:'Degree ('+url+')\n【'+citationRef+'】 [wordlim: 200] Crawled: today; Content type: text/html; Source: open({}); Total lines: 4\nL0: Navigation\nL1: # Business degree\nL2: Total Credit Hours: 120\nL3: '}]};
    const receipt={kind:'connected-web-tool-response',version:1,tool:CONNECTED_WEB_TOOL,observedAt,response},bytes=JSON.stringify(receipt)+'\n';
    const proof={path:'content/source-captures/retrievals/'+digest(bytes)+'.json',sha256:digest(bytes),citationRef,sourceUrl:url};
    await mkdir(join(dir,'retrievals'),{recursive:true});await writeFile(join(base,proof.path),bytes);
    const extracted=extractConnectedWebBody(receipt,{url,citationRef});
    return {url,text:extracted.text,sha256:digest(extracted.text),status:null,captureFormat:CONNECTED_WEB_FORMAT,citationRef,toolResponseReceipt:proof,extraction:extracted.extraction};
  }
  const firstPage=await observed('turn900view0','2026-11-26T12:00:00Z');
  const first=await storeCapture(firstPage,{dir,base,now:at('2030-01-01T00:00:00Z')}),original=await readFile(first.sidecar,'utf8'),meta=JSON.parse(original);
  assert.equal(meta.status,null);assert.equal(meta.originHttpStatus,null);assert.equal(meta.rawBodyCaptured,false);
  assert.equal(meta.fetchedAt,'2026-11-26T12:00:00Z','The writer clock cannot invent a different native retrieval time');
  assert.deepEqual(meta.toolResponseReceipt,firstPage.toolResponseReceipt);
  const secondPage=await observed('turn901view0','2026-11-26T13:00:00Z'),second=await storeCapture(secondPage,{dir,base});
  assert.equal(await readFile(first.sidecar,'utf8'),original);
  const later=JSON.parse(await readFile(second.retrievalReceipt,'utf8'));
  assert.equal(later.fetchedAt,'2026-11-26T13:00:00Z');assert.deepEqual(later.toolResponseReceipt,secondPage.toolResponseReceipt);
  const inventedText=secondPage.text+'An invented transfer guarantee.\n';
  await assert.rejects(storeCapture({...secondPage,text:inventedText,sha256:digest(inventedText)},{dir,base}),/exactly reconstruct/);
  await assert.rejects(storeCapture({...secondPage,status:200},{dir,base}),/unknown origin HTTP status/);
});
