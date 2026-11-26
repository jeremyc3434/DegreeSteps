import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fetchPage,storeCapture,acePeriodSelectionExcerpt} from './scripts/pathway-factory/capture.mjs';
const base='https://www.acenet.edu/National-Guide/Pages/Course.aspx?cid=11111111-1111-4111-8111-111111111111',url=base+'#recommendation-period-selection';
const select='<select name="period"><option value="?cid=22222222-2222-4222-8222-222222222222">11/1/2026 - 10/31/2029</option><option selected="selected" value="?cid=11111111-1111-4111-8111-111111111111">11/1/2023 - 10/31/2026</option></select>',body='<html><body><h1>Example older exhibit</h1>'+select+'</body></html>';
test('a replayable ACE excerpt retains the selected older period and every option instead of assuming the first period',async t=>{
 const page=await fetchPage(url,{fetchImpl:async()=>new Response(body,{headers:{'content-type':'text/html'}})});
 assert.equal(page.text,select+'\n');assert.equal(page.captureFormat,'raw-html-recommendation-period-select-excerpt');assert.equal(page.rawResponseSha256,createHash('sha256').update(body).digest('hex'));
 const dir=await mkdtemp(join(tmpdir(),'ace-period-'));t.after(()=>rm(dir,{recursive:true,force:true}));const stored=await storeCapture(page,{dir,now:()=>new Date('2026-11-26T00:00:00Z')}),meta=JSON.parse(await readFile(stored.sidecar,'utf8'));
 assert.equal(meta.url,url);assert.equal(meta.captureFormat,page.captureFormat);assert.equal(meta.rawResponseSha256,page.rawResponseSha256);assert.equal(meta.sha256,page.sha256);
 const repeat=await fetchPage(url,{fetchImpl:async()=>new Response(body,{headers:{'content-type':'text/html'}})});assert.equal(repeat.sha256,page.sha256);
 const ordinary=await fetchPage(base,{fetchImpl:async()=>new Response(body,{headers:{'content-type':'text/html'}})});assert.equal(ordinary.captureFormat,undefined);assert.notEqual(ordinary.text,page.text);
});
test('an excerpt rejects absent, ambiguous and cross-exhibit selected controls',()=>{
 for(const html of [select.replace(' selected="selected"',''),select+select,select.replace('selected="selected" value="?cid=11111111-1111-4111-8111-111111111111"','selected="selected" value="?cid=33333333-3333-4333-8333-333333333333"')])assert.throws(()=>acePeriodSelectionExcerpt(html,url));
 assert.throws(()=>acePeriodSelectionExcerpt(select,'https://example.edu/Course.aspx?cid=11111111-1111-4111-8111-111111111111'));
});
