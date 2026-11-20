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
 * Extracts a PDF's text layer: one line per visual row (items sharing a baseline, left to right), pages separated by a
 * blank line. No OCR: a scanned PDF without a text layer is rejected instead of captured empty.
 */
export async function pdfToText(bytes){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),useWasm:false,enableXfa:false,disableFontFace:true,useSystemFonts:true,isEvalSupported:false,stopAtErrors:true,verbosity:0});
  const doc=await task.promise,pages=[];
  try{
    for(let n=1;n<=doc.numPages;n++){
      const items=(await (await doc.getPage(n)).getTextContent()).items.filter(item=>typeof item.str==='string'&&item.str.trim());
      const rows=[];
      for(const item of items.map(i=>({x:i.transform[4],y:i.transform[5],end:i.transform[4]+(i.width||0),str:i.str,h:Math.abs(i.transform[3])||i.height||10})).sort((a,b)=>b.y-a.y||a.x-b.x)){
        const row=rows.find(r=>Math.abs(r.y-item.y)<=Math.max(2,item.h*0.4));
        if(row)row.items.push(item);else rows.push({y:item.y,items:[item]});
      }
      pages.push(rows.sort((a,b)=>b.y-a.y).map(row=>{
        let line='',end=null;
        for(const item of row.items.sort((a,b)=>a.x-b.x)){line+=(end!==null&&item.x-end>0.15*item.h?' ':'')+item.str;end=item.end;}
        return line.replace(/\s+/g,' ').trim();
      }).filter(Boolean).join('\n'));
    }
  }finally{await task.destroy();}
  const text=pages.join('\n\n').trim();
  if(!text)throw Error('The PDF has no text layer; it cannot be captured without OCR.');
  return text+'\n';
}
/** Fetches url, stores text + sidecar, returns {path, sidecar, sha256, text}. fetchImpl and now are injectable for tests. */
export async function capture(url,{dir=capturesRoot,fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
  const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Only http(s) URLs can be captured.');
  const response=await fetchImpl(url,{redirect:'follow',headers:{'user-agent':'DegreeSteps-PathwayFactory/1.0 (+source capture)','accept':'text/html,text/plain;q=0.9,*/*;q=0.1'}});
  if(!response.ok)throw Error(`Capture failed: HTTP ${response.status} for ${url}`);
  const type=response.headers?.get?.('content-type')||'';
  const bytes=typeof response.arrayBuffer==='function'?new Uint8Array(await response.arrayBuffer()):null;
  const pdf=/pdf/i.test(type)||Boolean(bytes)&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
  if(pdf&&!bytes)throw Error('A PDF response must be read as bytes.');
  const body=pdf?'':bytes?new TextDecoder().decode(bytes):await response.text();
  const text=pdf?await pdfToText(bytes):/html/i.test(type)||/^\s*</.test(body)?htmlToText(body):body.replace(/\r\n/g,'\n');
  const hash=sha256(text),name=hash.slice(0,16);
  await mkdir(dir,{recursive:true});
  const path=join(dir,name+'.txt'),sidecar=join(dir,name+'.json');
  await writeFile(path,text);
  await writeFile(sidecar,JSON.stringify({url,finalUrl:response.url||url,fetchedAt:now().toISOString(),sha256:hash,contentType:type,status:response.status,characters:text.length},null,2)+'\n');
  return {path,sidecar,sha256:hash,text,relative:path.startsWith(root+'/')?path.slice(root.length+1):path};
}
async function main(){
  const args=parseArgs(process.argv.slice(2)),url=args._[0];
  if(!url)throw Error('Usage: capture.mjs <url> [--dir content/source-captures]');
  const result=await capture(url,{dir:args.dir?resolve(args.dir):capturesRoot});
  console.log(JSON.stringify({url,capture:result.relative,sha256:result.sha256,characters:result.text.length}));
}
if(isMain(import.meta))await main();
