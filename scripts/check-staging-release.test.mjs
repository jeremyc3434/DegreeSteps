import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkStagingRelease,STAGING_ORIGIN} from './check-staging-release.mjs';

const headers={'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'};
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://degreesteps.com/</loc></url></urlset>\n';
const index='<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>https://degreesteps.com/sitemap-site.xml</loc></sitemap>\n<sitemap><loc>https://degreesteps.com/sitemap-insights.xml</loc></sitemap>\n</sitemapindex>\n';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'staging-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bodies=new Map([['/robots.txt','User-agent: *\nDisallow: /\n'],['/','<h1>Built release</h1>'],['/brand.css','body { color: black; }'],['/data/credit-sources.json','{"sources":[]}'],['/data/program-catalog.json','{"programs":[]}'],['/sitemap.xml',sitemap]]);
 for(const[route,body]of bodies){if(route==='/robots.txt')continue;const file=join(root,route==='/'?'index.html':route);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,body);}
 const calls=[],logs=[];
 const fetchImpl=async(url,options)=>{
  assert.equal(new URL(url).origin,STAGING_ORIGIN);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  assert.equal(options.body,undefined);assert.deepEqual(Object.keys(options.headers),['Accept-Encoding']);
  const route=new URL(url).pathname;calls.push(route);assert(bodies.has(route),'Only built allowlisted public routes are requested');return new Response(bodies.get(route),{headers});
 };
 return{root,bodies,calls,logs,options:{publicRoot:root,fetchImpl,log:entry=>logs.push(entry),attempts:1,retryDelayMs:0}};
}

test('staging proof compares built bytes with fixed anonymous GETs and includes present editorial assets',async t=>{
 const f=await fixture(t),route='/credit-sources/google-certificates/',body='<h1>A reviewed certificate source</h1>';
 await mkdir(join(f.root,route),{recursive:true});await writeFile(join(f.root,route,'index.html'),body);f.bodies.set(route,body);
 const results=await checkStagingRelease(f.options);assert.equal(results.length,7);assert.deepEqual(f.calls,[...f.bodies.keys()]);
 assert(results.every(item=>item.sha256===item.expectedSha256&&item.status===200));assert.equal(f.logs.length,7);
 assert(!JSON.stringify(f.logs).includes('<h1>'));assert(!f.calls.some(path=>path.startsWith('/api/')));
});
test('a dynamic sitemap index verifies the fixed static shard without following returned URLs',async t=>{
 const f=await fixture(t);f.bodies.set('/sitemap.xml',index);f.bodies.set('/sitemap-site.xml',sitemap);
 const result=await checkStagingRelease(f.options);assert.equal(result.find(item=>item.route==='/sitemap.xml').index,true);assert.equal(f.calls.at(-1),'/sitemap-site.xml');
 f.bodies.set('/sitemap.xml',index.replace('https://degreesteps.com/sitemap-insights.xml','https://untrusted.example/sitemap-insights.xml'));
 await assert.rejects(checkStagingRelease(f.options),{code:'release-bytes-mismatch'});assert(!f.calls.includes('/sitemap-insights.xml'));
 f.bodies.set('/sitemap.xml',index);f.bodies.set('/sitemap-site.xml',sitemap.replace('degreesteps.com','stale.example'));
 await assert.rejects(checkStagingRelease(f.options),{code:'release-bytes-mismatch',route:'/sitemap-site.xml'});
});
test('a stale release retries within the bound and reports only route, status and hashes',async t=>{
 const f=await fixture(t);f.bodies.set('/','<h1>Old release with private-looking source content</h1>');
 await assert.rejects(checkStagingRelease({...f.options,attempts:3}),{code:'release-bytes-mismatch',route:'/'});
 assert.equal(f.calls.filter(path=>path==='/').length,3);assert.equal(f.calls.includes('/brand.css'),false);
 assert(!JSON.stringify(f.logs).includes('private-looking'));assert.match(f.logs.at(-1).sha256,/^[a-f0-9]{64}$/);
});
test('a newly propagated release succeeds on a bounded retry',async t=>{
 const f=await fixture(t),fetchImpl=f.options.fetchImpl;let rootCalls=0;
 const result=await checkStagingRelease({...f.options,attempts:2,fetchImpl:async(url,options)=>{if(new URL(url).pathname==='/'&&rootCalls++===0)return new Response('stale',{headers});return fetchImpl(url,options);}});
 assert.equal(rootCalls,2);assert.equal(result.length,6);
});
test('response bounds grow with a legitimate multi-megabyte built catalog',async t=>{
 const f=await fixture(t),body=JSON.stringify({programs:[],notes:'a'.repeat(4*1024*1024)});
 await writeFile(join(f.root,'data/program-catalog.json'),body);f.bodies.set('/data/program-catalog.json',body);
 const results=await checkStagingRelease(f.options);assert.equal(results.find(item=>item.route==='/data/program-catalog.json').sha256,results.find(item=>item.route==='/data/program-catalog.json').expectedSha256);
});
test('robots must disallow every crawler and every route must retain staging privacy headers',async t=>{
 const f=await fixture(t),fetchImpl=f.options.fetchImpl;
 f.bodies.set('/robots.txt','User-agent: *\nAllow: /\n');await assert.rejects(checkStagingRelease(f.options),{code:'robots-disallow-all'});
 f.bodies.set('/robots.txt','User-agent: *\nDisallow: /\n');
 for(const changed of [{'X-Robots-Tag':'noindex','Cache-Control':'no-store'},{'X-Robots-Tag':'nofollow','Cache-Control':'no-store'},{'X-Robots-Tag':'noindex, nofollow','Cache-Control':'public, max-age=60'}]){
  await assert.rejects(checkStagingRelease({...f.options,fetchImpl:async(url,options)=>{await fetchImpl(url,options);return new Response(f.bodies.get(new URL(url).pathname),{headers:changed});}}),{code:'staging-privacy-headers'});
 }
});
test('HTTP failures, redirects and oversized streamed bodies cannot pass as a release',async t=>{
 const f=await fixture(t);
 for(const status of [302,404,503])await assert.rejects(checkStagingRelease({...f.options,fetchImpl:async()=>new Response('untrusted diagnostic',{status,headers})}),{code:'unexpected-status'});
 await assert.rejects(checkStagingRelease({...f.options,fetchImpl:async()=>new Response('small',{headers:{...headers,'Content-Length':'9999999'}})}),{code:'response-too-large'});
 await assert.rejects(checkStagingRelease({...f.options,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(256*1024+1));controller.close();}}),{headers})}),{code:'response-too-large'});
 assert(!JSON.stringify(f.logs).includes('untrusted diagnostic'));
});
test('the deadline aborts a stalled request and provider diagnostics are not logged',async t=>{
 const f=await fixture(t);let signal;
 await assert.rejects(checkStagingRelease({...f.options,timeoutMs:10,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}}),{code:'request-timeout'});assert.equal(signal.aborted,true);
 await assert.rejects(checkStagingRelease({...f.options,fetchImpl:async()=>{throw Error('secret provider diagnostic');}}),{code:'request-failed'});assert(!JSON.stringify(f.logs).includes('secret provider'));
});
test('a missing mandatory build artifact fails before any network request',async t=>{
 const f=await fixture(t);await rm(join(f.root,'data/program-catalog.json'));
 await assert.rejects(checkStagingRelease(f.options),{code:'built-asset-unavailable',route:'/data/program-catalog.json'});assert.deepEqual(f.calls,[]);
});
