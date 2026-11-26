/** Retain exact ACE exhibit dropdown bindings from real public HTML receipts. No network or period inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './pathway-factory/lib.mjs';
import {decodeEntities,htmlToText} from './pathway-factory/capture.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function periodOptions(html){return [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].map(m=>({attributes:m[1].replace(/\s+/g,' ').trim(),options:[...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(o=>({value:decodeEntities(o[1].match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1]||''),selected:/\bselected\b/i.test(o[1]),label:decodeEntities(o[2].replace(/<[^>]*>/g,'')).trim()}))})).filter(s=>s.options.some(o=>/\d{1,2}\/\d{1,2}\/\d{4}/.test(o.label)));}
export function optionCourseId(value,base){try{const url=new URL(value,base);return url.hostname==='www.acenet.edu'&&url.pathname==='/National-Guide/Pages/Course.aspx'&&url.searchParams.get('oid')==='76099b28-9016-e811-810f-5065f38bf0e1'?url.searchParams.get('cid')?.toLowerCase():null;}catch{return null;}}
export async function importTESUOriginalPeriods(receipts,{check=false}={}){
 const sources=[],exhibits=[],writes=[];
 for(const receipt of receipts){
  const url=new URL(receipt.url);assert.equal(url.hostname,'www.acenet.edu');assert.equal(url.pathname,'/National-Guide/Pages/Course.aspx');assert.equal(url.searchParams.get('oid'),'76099b28-9016-e811-810f-5065f38bf0e1');assert.equal(receipt.status,200);assert.equal(receipt.requestMethod,'GET');assert.equal(receipt.finalUrl,receipt.url);assert(/^SOPH-\d{4}$/.test(receipt.code));
  const raw=await readFile(receipt.raw),rawSha=hash(raw);assert.equal(rawSha,receipt.rawSha256);const html=raw.toString('utf8'),text=htmlToText(html),textSha=hash(text);assert.equal(textSha,receipt.textSha256);assert(text.includes('ACE ID:\n'+receipt.code+'\nVersion:\n'));
  const selects=periodOptions(html),cid=url.searchParams.get('cid'),matches=selects.flatMap(s=>s.options).filter(o=>optionCourseId(o.value,receipt.url)===cid.toLowerCase());assert.equal(matches.length,1,receipt.code+' exact course CID binds one period');assert.equal(matches[0].selected,true,receipt.code+' exact CID is explicitly selected');
  assert(/^\d{1,2}\/\d{1,2}\/\d{4} - \d{1,2}\/\d{1,2}\/\d{4}$/.test(matches[0].label));
  // Keep the exact complete period <select>, including all option values and selected attributes. It is an excerpt, not a full page.
  const markup=[...html.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)].map(m=>m[0]).filter(m=>/\d{1,2}\/\d{1,2}\/\d{4}/.test(m)).join('\n')+'\n',selectionSha=hash(markup);
  const capture='content/source-captures/'+selectionSha.slice(0,16)+'.txt',id='tesu-'+receipt.code.toLowerCase()+'-exact-period-option-2026-11-26';
  const captureUrl=receipt.url+'#recommendation-period-selection';
  const source={id,title:'ACE '+receipt.code+' exact recommendation-period select markup (complete select excerpt)',url:captureUrl,checked:'2026-11-26',capture,sha256:selectionSha,sourceContentHash:selectionSha,kind:'ace',roles:['recommendation-period'],captureFormat:'raw-html-recommendation-period-select-excerpt',rawResponseSha256:rawSha};sources.push(source);
  const meta={url:captureUrl,finalUrl:receipt.finalUrl+'#recommendation-period-selection',fetchedAt:receipt.requestedAt,sha256:selectionSha,contentType:'text/html',status:200,requestMethod:'GET',captureFormat:source.captureFormat,rawResponseSha256:rawSha,extractedTextSha256:textSha,exactExhibitCourseId:cid};
  writes.push([capture,markup],[capture.replace(/\.txt$/,'.json'),JSON.stringify(meta,null,2)+'\n']);
  exhibits.push({code:receipt.code,url:receipt.url,finalUrl:receipt.finalUrl,requestedAt:receipt.requestedAt,status:200,requestMethod:'GET',rawSha256:rawSha,textSha256:textSha,selectionCapture:capture,selectionSha256:selectionSha,selectionSourceId:id,selects});
 }
 const packet={kind:'tesu-ace-exact-exhibit-period-bindings',version:1,checkedOn:'2026-11-26',method:'The exact requested ACE exhibit CID is matched to its own original HTML dropdown option value. The first or newest displayed option is never assumed to belong to the requested course version.',sources,exhibits};
 writes.push(['content/pathway-kits/tesu/original-period-bindings-2026-11-26.json',JSON.stringify(packet,null,2)+'\n']);
 for(const [path,text]of writes){if(check)assert.equal(await readFile(resolve(root,path),'utf8'),text,path+' is stale');else await writeFile(resolve(root,path),text);}
 return {exhibits:exhibits.length,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert(process.argv[2],'Pass the retained public HTML receipt JSON.');console.log(JSON.stringify(await importTESUOriginalPeriods(JSON.parse(await readFile(resolve(process.argv[2]),'utf8')),{check:process.argv.includes('--check')})));}
