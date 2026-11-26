/**
 * Captures a source page as plain text: content/source-captures/<sha256-prefix>.txt plus a JSON sidecar.
 * A capture records what a page said when fetched. It never changes a source's checked date or approves a claim.
 * Usage: node scripts/pathway-factory/capture.mjs <url> [--dir content/source-captures]
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sha256,capturesRoot,root,parseArgs,isMain} from './lib.mjs';

const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',middot:'·',bull:'•',copy:'©',reg:'®',trade:'™',rarr:'→',larr:'←',eacute:'é'};
export function decodeEntities(text){
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,code)=>{
    if(code[0]==='#'){const n=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return Number.isFinite(n)&&n>0&&n<0x110000?String.fromCodePoint(n):match;}
    return named[code.toLowerCase()]??match;
  });
}
/** Strips an HTML document to readable text, one block element per line. */
export function htmlToText(html){
  let text=String(html).replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi,' ');
  text=text.replace(/<br\s*\/?>/gi,'\n').replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|tr|table|thead|tbody|h[1-6]|dt|dd|dl|blockquote|pre|figure|figcaption|form|fieldset|details|summary)\b[^>]*>/gi,'\n').replace(/<\/(td|th)\s*>/gi,'\t');
  text=decodeEntities(text.replace(/<[^>]+>/g,' '));
  return text.split('\n').map(line=>line.replace(/[ \t ]+/g,' ').trim()).filter(Boolean).join('\n')+'\n';
}
/**
 * Page ranges for big catalog PDFs: `<pdf-url>#pages=34-37,120-123` captures only those pages (1-based, inclusive; one
 * page is `#pages=12`). Add `&columns=2` for a two-column layout: each page is read left column first, then right column,
 * instead of joining both columns on one line. The fragment is never sent to the server; it stays in the capture's url so
 * a later re-fetch (freshness) extracts exactly the same pages the same way.
 */
export const MAX_PAGE_RANGES=20,MAX_RANGED_PAGES=80;
export function parsePageFragment(url){
  const parsed=new URL(url),hash=parsed.hash.replace(/^#/,'');
  parsed.hash='';
  const fetchUrl=parsed.toString();
  if(!hash)return {fetchUrl,pages:null,columns:1};
  const params=new URLSearchParams(hash),keys=[...params.keys()];
  if(!keys.includes('pages')){
    if(keys.includes('columns'))throw Error(`#columns needs #pages in ${url}`);
    return {fetchUrl:url,pages:null,columns:1};// an ordinary in-page anchor is left as it was
  }
  const unknown=keys.filter(k=>!['pages','columns'].includes(k));
  if(unknown.length)throw Error(`Unknown page-range option ${unknown.join(', ')} in ${url}`);
  const spec=params.get('pages')||'';
  if(!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(spec))throw Error(`Invalid #pages=${spec} in ${url}: use 34-37,120-123`);
  const ranges=spec.split(',').map(part=>{const [a,b=a]=part.split('-').map(Number);return [a,b];});
  if(ranges.some(([a,b])=>a<1||b<a))throw Error(`Invalid page range in #pages=${spec}: pages start at 1 and each range must run forward`);
  if(ranges.length>MAX_PAGE_RANGES)throw Error(`#pages has more than ${MAX_PAGE_RANGES} ranges`);
  const sorted=[...ranges].sort((x,y)=>x[0]-y[0]);
  for(let i=1;i<sorted.length;i++)if(sorted[i][0]<=sorted[i-1][1])throw Error(`Overlapping page ranges in #pages=${spec}`);
  const count=ranges.reduce((n,[a,b])=>n+b-a+1,0);
  if(count>MAX_RANGED_PAGES)throw Error(`#pages selects ${count} pages; the limit is ${MAX_RANGED_PAGES}`);
  const columns=params.has('columns')?Number(params.get('columns')):1;
  if(![1,2].includes(columns))throw Error(`#columns must be 1 or 2 in ${url}`);
  return {fetchUrl,pages:ranges,columns,spec};
}
function rowsToLines(items){
  const rows=[];
  for(const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){
    const row=rows.find(r=>Math.abs(r.y-item.y)<=Math.max(2,item.h*0.4));
    if(row)row.items.push(item);else rows.push({y:item.y,items:[item]});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>{
    let line='',end=null;
    for(const item of row.items.sort((a,b)=>a.x-b.x)){line+=(end!==null&&item.x-end>0.15*item.h?' ':'')+item.str;end=item.end;}
    return line.replace(/\s+/g,' ').trim();
  }).filter(Boolean);
}
/**
 * Finds a two-column page's gutter: the widest vertical band in the middle 30-70% of the text's width that almost no text
 * crosses, with text on both sides. A few crossing lines (a full-width running header, a page footer) are tolerated, and
 * rotated text (side tabs) is ignored. Returns the split x, or null (the page is then read as one column).
 */
export function columnGutter(items){
  const flat=items.filter(i=>!i.rotated);
  if(flat.length<6)return null;
  const left=Math.min(...flat.map(i=>i.x)),right=Math.max(...flat.map(i=>i.end)),width=right-left;
  if(!(width>0))return null;
  const lo=left+width*0.3,hi=left+width*0.7,cells=200,step=(hi-lo)/cells,count=new Array(cells).fill(0);
  for(const i of flat){
    const from=Math.max(0,Math.floor((i.x-lo)/step)),to=Math.min(cells-1,Math.ceil((i.end-lo)/step)-1);
    for(let c=from;c<=to;c++)count[c]++;
  }
  const tolerated=Math.max(2,Math.floor(flat.length*0.03));
  let best=null,start=null;
  for(let c=0;c<=cells;c++){
    if(c<cells&&count[c]<=tolerated){if(start===null)start=c;continue;}
    if(start!==null&&(!best||c-start>best.len))best={start,len:c-start};
    start=null;
  }
  if(!best||best.len*step<Math.max(6,width*0.015))return null;
  const split=lo+(best.start+best.len/2)*step,l=flat.filter(i=>i.end<=split).length,r=flat.filter(i=>i.x>=split).length;
  return l>=3&&r>=3?split:null;
}
/**
 * Extracts a PDF's text layer: one line per visual row (items sharing a baseline, left to right), pages separated by a
 * blank line. No OCR: a scanned PDF without a text layer is rejected instead of captured empty. `pages` (from
 * parsePageFragment) limits the pages read; `columns: 2` reads each page's left column before its right column.
 */
export async function pdfToText(bytes,{pages=null,columns=1}={}){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),useWasm:false,enableXfa:false,disableFontFace:true,useSystemFonts:true,isEvalSupported:false,stopAtErrors:true,verbosity:0});
  const doc=await task.promise,out=[];
  try{
    const numbers=pages?pages.flatMap(([a,b])=>Array.from({length:b-a+1},(_,k)=>a+k)):Array.from({length:doc.numPages},(_,k)=>k+1);
    const beyond=numbers.find(n=>n>doc.numPages);
    if(beyond)throw Error(`The PDF has ${doc.numPages} pages; #pages asks for page ${beyond}.`);
    for(const n of numbers){
      const items=(await (await doc.getPage(n)).getTextContent()).items.filter(item=>typeof item.str==='string'&&item.str.trim())
        .map(i=>({x:i.transform[4],y:i.transform[5],end:i.transform[4]+(i.width||0),str:i.str,h:Math.abs(i.transform[3])||i.height||10,rotated:Math.abs(i.transform[1])>0.01||Math.abs(i.transform[2])>0.01}));
      const split=columns===2?columnGutter(items):null;
      // Items that straddle the gutter (a running header) are read with the left column, where they start.
      const lines=split===null?rowsToLines(items):[...rowsToLines(items.filter(i=>i.x<split)),...rowsToLines(items.filter(i=>i.x>=split))];
      out.push(lines.join('\n'));
    }
  }finally{await task.destroy();}
  const text=out.join('\n\n').trim();
  if(!text)throw Error(pages?'The selected PDF pages have no text layer; they cannot be captured without OCR.':'The PDF has no text layer; it cannot be captured without OCR.');
  return text+'\n';
}
export const USER_AGENT='DegreeSteps-PathwayFactory/1.0 (+source capture)';
export const ACE_PERIOD_SELECTION_FRAGMENT='#recommendation-period-selection';
/** Preserve which recommendation period the requested exhibit actually selects.
 * The full select is retained, rather than treating its first option as active. */
export function acePeriodSelectionExcerpt(html,url){
 const address=new URL(url);
 if(address.hostname!=='www.acenet.edu'||!/^\/National-Guide\/Pages\/Course\.aspx$/i.test(address.pathname)||!address.searchParams.get('cid'))throw Error('ACE period excerpts require an exact public course exhibit URL.');
 const selects=[...String(html).matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)].filter(match=>{
  const options=[...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  return options.some(option=>/\d{1,2}\/\d{1,2}\/\d{4}/.test(decodeEntities(option[2])))&&options.some(option=>/(?:^|\s)selected(?:\s|=|$)/i.test(option[1]));
 });
 if(selects.length!==1)throw Error('An ACE period capture needs exactly one explicitly selected recommendation-period control.');
 const selected=[...selects[0][1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].filter(option=>/(?:^|\s)selected(?:\s|=|$)/i.test(option[1]));
 if(selected.length!==1)throw Error('An ACE period control must select exactly one option.');
 const value=decodeEntities(selected[0][1].match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1]||''),target=new URL(value,address);
 if(target.origin!==address.origin||target.pathname!==address.pathname||target.searchParams.get('cid')!==address.searchParams.get('cid'))throw Error('The selected ACE period must belong to the requested exhibit.');
 return selects[0][0]+'\n';
}
/**
 * Fetches url and converts it to capture text without writing anything. Returns {text, sha256, url, finalUrl, contentType,
 * status}. A non-2xx response throws an Error with .status. timeoutMs (optional) aborts a slow request.
 */
export async function fetchPage(url,{fetchImpl=globalThis.fetch,userAgent=USER_AGENT,timeoutMs}={}){
  const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Only http(s) URLs can be captured.');
  const range=parsePageFragment(url);
  const init={redirect:'follow',headers:{'user-agent':userAgent,'accept':'text/html,text/plain;q=0.9,*/*;q=0.1'}};
  if(timeoutMs)init.signal=AbortSignal.timeout(timeoutMs);
  const response=await fetchImpl(range.fetchUrl,init);
  if(!response.ok)throw Object.assign(Error(`Capture failed: HTTP ${response.status} for ${url}`),{status:response.status});
  const type=response.headers?.get?.('content-type')||'';
  const bytes=typeof response.arrayBuffer==='function'?new Uint8Array(await response.arrayBuffer()):null;
  const pdf=/pdf/i.test(type)||Boolean(bytes)&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
  if(pdf&&!bytes)throw Error('A PDF response must be read as bytes.');
  if(range.pages&&!pdf)throw Error(`#pages applies only to PDFs; ${range.fetchUrl} is not a PDF.`);
  const body=pdf?'':bytes?new TextDecoder().decode(bytes):await response.text();
  const selectedPeriod=parsed.hash===ACE_PERIOD_SELECTION_FRAGMENT;
  if(selectedPeriod&&(pdf||!(/html/i.test(type)||/^\s*</.test(body))))throw Error('ACE recommendation-period excerpts require an HTML exhibit.');
  const text=selectedPeriod?acePeriodSelectionExcerpt(body,url):pdf?await pdfToText(bytes,{pages:range.pages,columns:range.columns}):/html/i.test(type)||/^\s*</.test(body)?htmlToText(body):body.replace(/\r\n/g,'\n');
  const page={text,sha256:sha256(text),url,finalUrl:response.url||range.fetchUrl,contentType:type,status:response.status};
  if(selectedPeriod)Object.assign(page,{captureFormat:'raw-html-recommendation-period-select-excerpt',rawResponseSha256:sha256(body)});
  if(range.pages)Object.assign(page,{pages:range.spec,columns:range.columns,documentSha256:sha256(bytes)});
  // The raw HTML stays off the sidecar; freshness uses it for sources that fingerprint a parsed table (Sophia partner pages).
  if(!pdf&&body&&(/html/i.test(type)||/^\s*</.test(body)))Object.defineProperty(page,'html',{value:body,enumerable:false});
  return page;
}
/** Writes a fetched page as <sha256 prefix>.txt plus its JSON sidecar. Returns {path, sidecar, sha256, text, relative}. */
export async function storeCapture(page,{dir=capturesRoot,now=()=>new Date()}={}){
  const name=page.sha256.slice(0,16);
  await mkdir(dir,{recursive:true});
  const path=join(dir,name+'.txt'),sidecar=join(dir,name+'.json');
  await writeFile(path,page.text);
  const ranged=page.pages?{pages:page.pages,columns:page.columns,documentSha256:page.documentSha256}:{};
  const excerpt=page.captureFormat?{captureFormat:page.captureFormat,rawResponseSha256:page.rawResponseSha256}:{};
  await writeFile(sidecar,JSON.stringify({url:page.url,finalUrl:page.finalUrl,fetchedAt:now().toISOString(),sha256:page.sha256,contentType:page.contentType,status:page.status,characters:page.text.length,...ranged,...excerpt},null,2)+'\n');
  return {path,sidecar,sha256:page.sha256,text:page.text,relative:path.startsWith(root+'/')?path.slice(root.length+1):path};
}
/** Fetches url, stores text + sidecar, returns {path, sidecar, sha256, text}. fetchImpl and now are injectable for tests. */
export async function capture(url,{dir=capturesRoot,fetchImpl=globalThis.fetch,now=()=>new Date(),timeoutMs}={}){
  return storeCapture(await fetchPage(url,{fetchImpl,timeoutMs}),{dir,now});
}
async function main(){
  const args=parseArgs(process.argv.slice(2)),url=args._[0];
  if(!url)throw Error('Usage: capture.mjs <url> [--dir content/source-captures]');
  const result=await capture(url,{dir:args.dir?resolve(args.dir):capturesRoot});
  console.log(JSON.stringify({url,capture:result.relative,sha256:result.sha256,characters:result.text.length}));
}
if(isMain(import.meta))await main();
