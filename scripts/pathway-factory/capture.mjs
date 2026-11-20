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
/** Fetches url, stores text + sidecar, returns {path, sidecar, sha256, text}. fetchImpl and now are injectable for tests. */
export async function capture(url,{dir=capturesRoot,fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
  const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Only http(s) URLs can be captured.');
  const response=await fetchImpl(url,{redirect:'follow',headers:{'user-agent':'DegreeSteps-PathwayFactory/1.0 (+source capture)','accept':'text/html,text/plain;q=0.9,*/*;q=0.1'}});
  if(!response.ok)throw Error(`Capture failed: HTTP ${response.status} for ${url}`);
  const type=response.headers?.get?.('content-type')||'';
  if(/pdf/i.test(type))throw Error('PDF capture is not supported yet; save the PDF text with its URL by hand and record it as a capture.');
  const body=await response.text();
  const text=/html/i.test(type)||/^\s*</.test(body)?htmlToText(body):body.replace(/\r\n/g,'\n');
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
