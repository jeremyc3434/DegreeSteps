/** GET-only release proof for the isolated staging host; never reads account APIs. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const STAGING_ORIGIN='https://degreesteps-staging.degreesteps-d215df9a.workers.dev';
const PUBLIC_ORIGIN='https://degreesteps.com',MAX_LOCAL_BYTES=16*1024*1024;
const ROBOTS=Buffer.from('User-agent: *\nDisallow: /\n');
const required=[['/','index.html'],['/brand.css','brand.css'],['/data/credit-sources.json','data/credit-sources.json'],['/data/program-catalog.json','data/program-catalog.json'],['/courses.html','courses.html'],['/courses.js','courses.js'],['/data/course-catalog.json','data/course-catalog.json'],['/sitemap.xml','sitemap.xml']];
const optional=[
 '/blog/maine-90-credit-applied-bachelors-degrees/',
 '/blog/wgu-single-courses-prices-transfer-and-assessments/',
 '/blog/purdue-global-exceltrack-and-professional-studies-subscription-costs/',
 '/blog/umpi-yourpace-vs-umass-global-mypath-business/',
 '/credit-sources/google-certificates/',
 '/credit-sources/wgu-single-courses/',
 '/credit-sources/christian-leaders/'
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,details={})=>Object.assign(Error(code),{code,...details});
const pause=ms=>new Promise(accept=>setTimeout(accept,ms));

function privacy(headers){
 const tokens=name=>(headers.get(name)||'').toLowerCase().split(',').map(value=>value.trim());
 if(!tokens('x-robots-tag').includes('noindex')||!tokens('x-robots-tag').includes('nofollow')||!tokens('cache-control').includes('no-store'))throw fail('staging-privacy-headers');
}
function sitemapIndex(bytes){
 const xml=bytes.toString('utf8'),match=xml.match(/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">([\s\S]*)<\/sitemapindex>\s*$/);
 if(!match)return false;
 const row=/<sitemap>\s*<loc>([^<]+)<\/loc>\s*<\/sitemap>/g,urls=[...match[1].matchAll(row)].map(item=>item[1]);
 if(match[1].replace(row,'').trim()||urls.length<2||urls.length>101||new Set(urls).size!==urls.length||urls[0]!==PUBLIC_ORIGIN+'/sitemap-site.xml')return false;
 return urls.slice(1).every(value=>{
  try{const url=new URL(value);return url.origin===PUBLIC_ORIGIN&&!url.username&&!url.password&&!url.hash&&url.pathname==='/sitemap-insights.xml'&&(!url.search||/^\?cursor=[A-Za-z0-9_-]{1,300}$/.test(url.search))&&url.href===value;}catch{return false;}
 });
}
async function boundedBody(response,limit){
 const declared=Number(response.headers.get('content-length'));
 if(declared>limit)throw fail('response-too-large');
 if(!response.body)throw fail('empty-response');
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.byteLength;if(size>limit)throw fail('response-too-large');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}

export async function checkStagingRelease({publicRoot=resolve(import.meta.dirname,'../outputs/cloudflare/public'),fetchImpl=globalThis.fetch,log=()=>{},attempts=3,timeoutMs=10000,retryDelayMs=2000}={}){
 if(!Number.isInteger(attempts)||attempts<1||attempts>3||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(retryDelayMs)||retryDelayMs<0||retryDelayMs>5000)throw fail('invalid-check-bounds');
 // Complete the local preflight before any hosted request. Optional editorial
 // routes are checked whenever their built assets belong to this release.
 const entries=[{route:'/robots.txt',bytes:ROBOTS}];
 for(const [route,file]of [...required,...optional.map(route=>[route,route.slice(1)+'index.html'])]){
  let bytes;try{bytes=await readFile(resolve(publicRoot,file));}catch(error){if(optional.includes(route)&&error.code==='ENOENT')continue;throw fail('built-asset-unavailable',{route});}
  if(!bytes.length||bytes.length>MAX_LOCAL_BYTES)throw fail('built-asset-size',{route});
  entries.push({route,bytes});
 }
 async function verify({route,bytes}){
  const expectedSha256=hash(bytes),limit=Math.max(256*1024,bytes.length+64*1024);
  for(let attempt=1;attempt<=attempts;attempt++){
   const controller=new AbortController();let timer,status=null,sha256=null;
   try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(fail('request-timeout'));controller.abort();},timeoutMs);});
    const received=(async()=>{
     const response=await fetchImpl(STAGING_ORIGIN+route,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Accept-Encoding':'identity'},signal:controller.signal});
     status=response.status;if(status!==200)throw fail('unexpected-status');privacy(response.headers);
     const body=await boundedBody(response,limit);sha256=hash(body);
     const index=route==='/sitemap.xml'&&!body.equals(bytes)&&sitemapIndex(body);
     if(!body.equals(bytes)&&!index)throw fail(route==='/robots.txt'?'robots-disallow-all':'release-bytes-mismatch');
     return {route,status,sha256,expectedSha256,index:!!index};
    })();
    const result=await Promise.race([received,timeout]);log({route,status,sha256,expectedSha256,result:result.index?'sitemap-index':'verified'});return result;
   }catch(error){
    const code=error.code&&/^(?:request-timeout|unexpected-status|staging-privacy-headers|response-too-large|empty-response|robots-disallow-all|release-bytes-mismatch)$/.test(error.code)?error.code:'request-failed';
    log({route,status,sha256,expectedSha256,result:code});
    if(attempt===attempts)throw fail(code,{route,status,sha256,expectedSha256});
   }finally{clearTimeout(timer);controller.abort();}
   await pause(retryDelayMs);
  }
 }
 const results=[];
 for(const entry of entries){
  const result=await verify(entry);results.push(result);
  // Owner-published insights can turn the root sitemap into an index. Only this
  // fixed staging route is fetched; response-supplied links are never followed.
  if(result.index)results.push(await verify({route:'/sitemap-site.xml',bytes:entry.bytes}));
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==2)throw fail('unsupported-arguments');await checkStagingRelease({log:entry=>console.log(JSON.stringify(entry))});}
 catch(error){console.error(JSON.stringify({route:error.route||null,status:error.status??null,sha256:error.sha256||null,result:error.code||'check-failed'}));process.exitCode=1;}
}
