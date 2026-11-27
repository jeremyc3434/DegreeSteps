import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {extractConnectedWebBody,validateConnectedWebCapture,CONNECTED_WEB_FORMAT,CONNECTED_WEB_TOOL} from './connected-web.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const url='https://catalog.example.edu/current/courses/mkt-4410',citationRef='turn123view0';
const bodyLines=['# MKT-4410 Digital Marketing','Advisory: Consider 【2†MKT-3060】: Electronic Enterprise.','### Credits','','3','## Prerequisite','','MAR-3060','### Delivery Methods','【3†Online†www.example.edu】'];
function receipt(lines=bodyLines){return {kind:'connected-web-tool-response',version:1,tool:CONNECTED_WEB_TOOL,observedAt:'2026-11-26T04:35:08Z',response:{isError:false,content:[{type:'text',text:'University Course ('+url+')\n【'+citationRef+'】 [wordlim: 200] Crawled: today; Content type: text/html; Total lines: '+lines.length+'\n'+lines.map((line,n)=>'L'+n+': '+line).join('\n')}]}};}
async function fixture(){const base=await mkdtemp(join(tmpdir(),'connected-web-proof-')),raw=receipt(),bytes=JSON.stringify(raw,null,2)+'\n',hash=sha(bytes),path='content/source-captures/retrievals/'+hash+'.json';await mkdir(dirname(join(base,path)),{recursive:true});await writeFile(join(base,path),bytes);const observation=extractConnectedWebBody(raw,{url,citationRef});return {base,raw,bytes,path,page:{url,text:observation.text,sha256:sha(observation.text),status:null,captureFormat:CONNECTED_WEB_FORMAT,citationRef,fetchedAt:raw.observedAt,originHttpStatus:null,rawBodyCaptured:false,extraction:observation.extraction,toolResponseReceipt:{path,sha256:hash,citationRef,sourceUrl:url}},close:()=>rm(base,{recursive:true,force:true})};}

test('native capture reconstructs the complete main body while preserving distinct formal and advisory codes',async()=>{
 const f=await fixture();try{const proof=await validateConnectedWebCapture(f.page,{base:f.base});assert.equal(proof.status,null);assert.match(proof.text,/Advisory: Consider MKT-3060/);assert.match(proof.text,/Prerequisite\n\nMAR-3060/);assert.equal(proof.extraction.firstLine,0);assert.equal(proof.extraction.lastLine,9);assert.equal(proof.observedAt,f.raw.observedAt);}finally{await f.close();}
});

test('joint body and sidecar-hash changes cannot rewrite the source pinned by the actual receipt',async()=>{
 const f=await fixture();try{const text=f.page.text.replace('MAR-3060','MKT-3060');await assert.rejects(()=>validateConnectedWebCapture({...f.page,text,sha256:sha(text)},{base:f.base}),/exactly reconstruct/);const changed=structuredClone(f.raw);changed.response.content[0].text=changed.response.content[0].text.replace('MAR-3060','MKT-3060');await writeFile(join(f.base,f.path),JSON.stringify(changed,null,2)+'\n');await assert.rejects(()=>validateConnectedWebCapture({...f.page,text,sha256:sha(text)},{base:f.base}),/pinned actual tool response/);}finally{await f.close();}
});

test('wrong URL, citation, missing line, duplicate line and truncated tail are rejected',()=>{
 const raw=receipt();assert.throws(()=>extractConnectedWebBody(raw,{url:url+'-other',citationRef}),/exact URL\/citation/);assert.throws(()=>extractConnectedWebBody(raw,{url,citationRef:'turn123view1'}),/exact URL\/citation/);
 for(const change of [text=>text.replace('L7: MAR-3060\n',''),text=>text.replace('L7: MAR-3060','L6: MAR-3060'),text=>text.replace('L9: 【3†Online†www.example.edu】','')]){const altered=structuredClone(raw);altered.response.content[0].text=change(altered.response.content[0].text);assert.throws(()=>extractConnectedWebBody(altered,{url,citationRef}),/contiguous/);}
 const noTitle=receipt(bodyLines.map(line=>line.replace('# MKT-4410','MKT-4410')));assert.throws(()=>extractConnectedWebBody(noTitle,{url,citationRef}),/actual page heading/);
});

test('native title/URL line wrapping preserves exact identity without accepting page-body or metadata URLs',()=>{
 const original=receipt(),wrapped=structuredClone(original);
 wrapped.response.content[0].text=wrapped.response.content[0].text.replace('University Course ('+url+')','\n\tUniversity Course\n ('+url+')');
 assert.deepEqual(extractConnectedWebBody(wrapped,{url,citationRef}),extractConnectedWebBody(original,{url,citationRef}));
 const bodyOnly=receipt([...bodyLines,'Read more at ('+url+')']);
 bodyOnly.response.content[0].text=bodyOnly.response.content[0].text.replace('University Course ('+url+')','University Course (https://catalog.example.edu/wrong)');
 assert.throws(()=>extractConnectedWebBody(bodyOnly,{url,citationRef}),/exact URL\/citation/);
 const metadataOnly=structuredClone(bodyOnly);
 metadataOnly.response.content[0].text=metadataOnly.response.content[0].text.replace('Crawled: today;','Crawled: today; Source: open({"ref_id":"'+url+'"});');
 assert.throws(()=>extractConnectedWebBody(metadataOnly,{url,citationRef}),/exact URL\/citation/);
 assert.throws(()=>extractConnectedWebBody(wrapped,{url:url+'-different',citationRef}),/exact URL\/citation/);
 assert.throws(()=>extractConnectedWebBody(wrapped,{url,citationRef:'turn123view1'}),/exact URL\/citation/);
});

test('unknown native HTTP status cannot be relabeled as an origin response or use an invented retrieval time',async()=>{
 const f=await fixture();try{for(const changes of [{status:200},{originHttpStatus:200},{rawBodyCaptured:true},{captureFormat:'origin-http-body'},{fetchedAt:'2026-11-25T04:35:08Z'}])await assert.rejects(()=>validateConnectedWebCapture({...f.page,...changes},{base:f.base}));const bad=receipt();bad.observedAt='2026-99-26T04:35:08Z';assert.throws(()=>extractConnectedWebBody(bad,{url,citationRef}),/actual native observation time/);}finally{await f.close();}
});

test('receipt addresses, fingerprints and failed tool responses fail closed',async()=>{
 const f=await fixture();try{for(const changes of [{path:'../../private.json'},{sha256:'0'.repeat(64)},{sourceUrl:url+'-other'},{citationRef:'turn123view1'}])await assert.rejects(()=>validateConnectedWebCapture({...f.page,toolResponseReceipt:{...f.page.toolResponseReceipt,...changes}},{base:f.base}));const bad=receipt();bad.response.isError=true;assert.throws(()=>extractConnectedWebBody(bad,{url,citationRef}),/failed native tool/);}finally{await f.close();}
});
