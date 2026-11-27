/** Honest, replayable native web extracts. This transport makes no origin HTTP-status claim. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './lib.mjs';

export const CONNECTED_WEB_FORMAT='connected-web-rendered-extract';
export const CONNECTED_WEB_TOOL='mcp__codex_apps__search_service_web_run';
export const CONNECTED_WEB_CLEANING='native-main-body-v1';
const digest=value=>createHash('sha256').update(value).digest('hex');
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().replace('.000Z','Z')===value.replace('.000Z','Z');

/** Keep displayed link labels, heading words and table cells; remove only native presentation markup. */
export function cleanConnectedWebLine(line){
  return line.replace(/【\d+†([^】]+)】/g,(_,label)=>label.split('†')[0]).replace(/^#{1,6}\s+/,'').replace(/\s*\|\s*/g,'\t');
}

/** The exact citation/header binds this extract to one observed page. Starting
 * at its first displayed H1, every line through the declared page end must be
 * present. A caller cannot select just a convenient prerequisite-free excerpt. */
export function extractConnectedWebBody(receipt,{url,citationRef}){
  assert.equal(receipt?.kind,'connected-web-tool-response');assert.equal(receipt.version,1);assert.equal(receipt.tool,CONNECTED_WEB_TOOL);
  assert(instant(receipt.observedAt),'Retain the actual native observation time');
  assert.equal(receipt.response?.isError,false,'A failed native tool result cannot become primary evidence');
  const parsed=new URL(url);assert.equal(parsed.protocol,'https:');assert(!parsed.username&&!parsed.password);
  assert(/^turn\d+[A-Za-z]+\d+$/.test(citationRef||''),'Retain the native citation reference');
  const blocks=(receipt.response.content||[]).filter(block=>block.type==='text'&&typeof block.text==='string').flatMap(block=>block.text.split(/\n-{20,}\n/));
  const matches=blocks.filter(block=>{
    // The native renderer can wrap a page title and its URL onto separate
    // lines. Join only its header before the first citation: a URL mentioned
    // in page text or source metadata is never accepted as the page identity.
    const citation=block.match(/^【([^】]+)】/m);
    const header=citation?block.slice(0,citation.index).trim().replace(/\s+/g,' '):'';
    const headerUrl=header.match(/\((https?:\/\/[^\s;)]+)(?:\s*;[^)]*)?\)\s*$/)?.[1];
    return headerUrl===url&&citation?.[1]===citationRef;
  });
  assert.equal(matches.length,1,'One exact URL/citation-bound native entry is required');
  const block=matches[0],totalPageLines=Number(block.match(/Total lines:\s*(\d+)/)?.[1]);assert(Number.isInteger(totalPageLines)&&totalPageLines>0);
  const lines=[...block.matchAll(/^L(\d+): ?(.*)$/gm)].map(match=>({line:Number(match[1]),text:match[2]}));
  const first=lines.find(row=>/^#\s+\S/.test(row.text));assert(first,'Retain the actual page heading and complete main body');
  const body=lines.filter(row=>row.line>=first.line),firstLine=first.line,lastLine=totalPageLines-1;
  assert.deepEqual(body.map(row=>row.line),Array.from({length:lastLine-firstLine+1},(_,index)=>firstLine+index),'Native main-body lines must be contiguous through the declared page end');
  const text=body.map(row=>cleanConnectedWebLine(row.text)).join('\n').trim()+'\n';
  return {text,extraction:{scope:'complete-rendered-main-body',cleaning:CONNECTED_WEB_CLEANING,firstLine,lastLine,totalPageLines,noLineGaps:true},sourceTitle:cleanConnectedWebLine(first.text),nativeCrawlerReported:block.match(/Crawled:\s*([^;\n]+);/)?.[1]||null,observedAt:receipt.observedAt};
}

/** The receipt hash must also be pinned by the academic source review that
 * consumes this capture; never derive that expected hash from an editable
 * sidecar alone. This validator reconstructs the exact retained body. */
export async function validateConnectedWebCapture(page,{base=root}={}){
  assert.equal(page?.status,null,'Native extraction has unknown origin HTTP status');assert.equal(page.captureFormat,CONNECTED_WEB_FORMAT);
  assert(page.originHttpStatus===undefined||page.originHttpStatus===null);assert(page.rawBodyCaptured===undefined||page.rawBodyCaptured===false);
  const proof=page.toolResponseReceipt;assert(proof&&/^[a-f0-9]{64}$/.test(proof.sha256||''));
  assert.equal(proof.path,'content/source-captures/retrievals/'+proof.sha256+'.json','Use a content-addressed committed native receipt');
  assert.equal(proof.sourceUrl,page.url);assert.equal(proof.citationRef,page.citationRef);
  const bytes=await readFile(resolve(base,proof.path));assert.equal(digest(bytes),proof.sha256,'The pinned actual tool response must remain intact');
  const receipt=JSON.parse(bytes.toString('utf8')),observation=extractConnectedWebBody(receipt,{url:page.url,citationRef:page.citationRef});
  if(page.fetchedAt!==undefined)assert.equal(page.fetchedAt,observation.observedAt,'Native retrieval time is the observed receipt time, not an invented origin fetch');
  assert.deepEqual(page.extraction,observation.extraction,'Do not shorten or relabel the source extraction');
  assert.equal(page.text,observation.text,'The retained body must exactly reconstruct from the citation-bound actual tool response');
  assert.equal(page.sha256,digest(observation.text),'The body content hash must agree');
  return {...observation,sha256:page.sha256,toolResponseReceipt:proof,citationRef:page.citationRef,status:null,captureFormat:CONNECTED_WEB_FORMAT};
}
