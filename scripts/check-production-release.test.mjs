import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkProductionRelease,PRODUCTION_ORIGIN} from './check-production-release.mjs';

const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://degreesteps.com/</loc></url></urlset>\n';
const index='<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://degreesteps.com/sitemap-site.xml</loc></sitemap><sitemap><loc>https://degreesteps.com/sitemap-insights.xml</loc></sitemap></sitemapindex>\n';
const responseHeaders=route=>['/courses.html','/portal.html','/degree-audit.html'].includes(route)?{'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'}:{'Cache-Control':'public, max-age=60'};
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'production-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bodies=new Map([['/robots.txt','User-agent: *\nAllow: /\nDisallow: /api/\n'],['/','<h1>Reviewed production release</h1>'],['/brand.css','body { color: black; }'],['/data/credit-sources.json','{"sources":[]}'],['/data/program-catalog.json','{"programs":[]}'],['/courses.html','<h1>My courses</h1>'],['/courses.js','document.title="My courses";'],['/data/course-catalog.json','{"courses":[]}'],['/portal.html','<h1>Student portal</h1>'],['/portal.js','document.title="Student portal";'],['/guide-engine.js','const guideVersion=1;'],['/sheet-state.js','const sheetVersion=1;'],['/student-checklist.js','const checklistVersion=1;'],['/journey-engine.js','const journeyVersion=1;'],['/school.js','const schoolVersion=1;'],['/degree-audit.html','<h1>My degree requirements</h1>'],['/degree-audit.js','const requirementsEditorVersion=1;'],['/requirements-baselines.js','const requirementsBaselineVersion=1;'],['/data/requirements-baselines.json','{"baselines":[]}'],['/sheet.js','const sheetDisplayVersion=1;'],['/sitemap.xml',sitemap]]);
 for(const [route,body]of bodies){const file=join(root,route==='/'?'index.html':route);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,body);}
 const calls=[],logs=[];
 const fetchImpl=async(url,options)=>{
  assert.equal(new URL(url).origin,'https://degreesteps.com');assert.equal(PRODUCTION_ORIGIN,'https://degreesteps.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);assert.deepEqual(Object.keys(options.headers),['Accept-Encoding','User-Agent']);assert.equal(options.headers['User-Agent'],'DegreeSteps-Release-Verification/1.0 (+https://degreesteps.com)');
  const route=new URL(url).pathname;calls.push(route);assert(bodies.has(route),'Only fixed built public-asset routes are requested');return new Response(bodies.get(route),{headers:responseHeaders(route)});
 };
 return{root,bodies,calls,logs,options:{publicRoot:root,fetchImpl,log:entry=>logs.push(entry),attempts:1,retryDelayMs:0}};
}

test('production checks exact built bytes on fixed anonymous GET routes, including new content',async t=>{
 const f=await fixture(t);
 for(const [route,body]of [['/blog/asu-universal-learner-vs-sophia/','<h1>ASU versus Sophia</h1>'],['/credit-sources/asu-ulc/','<h1>ASU credit purchase</h1>'],['/guides/ace-nccrs-and-accreditation/','<h1>Accreditation and recommendations</h1>'],['/guides/compare-transfer-credit-sources/','<h1>Compare credit sources</h1>'],['/blog/plan-subscriptions-before-paying/','<h1>Plan subscription costs</h1>'],['/blog/sophia-study-com-straighterline-which-first/','<h1>Choose a course provider</h1>'],['/guides/transfer-credit-after-enrolling/','<h1>Outside courses after enrollment</h1>'],['/guides/earn-college-credit-in-high-school/','<h1>College credit in high school</h1>'],['/guides/military-credit-jst-ccaf/','<h1>Military credit and benefits</h1>'],['/blog/do-old-college-credits-still-count/','<h1>Older college credits</h1>']]){await mkdir(join(f.root,route),{recursive:true});await writeFile(join(f.root,route,'index.html'),body);f.bodies.set(route,body);}
 const results=await checkProductionRelease(f.options);assert.equal(results.length,31);assert.deepEqual(f.calls,[...f.bodies.keys()]);assert(results.every(item=>item.status===200&&item.sha256===item.expectedSha256));assert(!f.calls.some(route=>route.startsWith('/api/')));assert(!JSON.stringify(f.logs).includes('<h1>'));
});
test('requirements editor and baseline assets reject a stale deployed release',async t=>{
 for(const route of ['/degree-audit.html','/degree-audit.js','/requirements-baselines.js','/data/requirements-baselines.json','/sheet.js']){
  const f=await fixture(t);f.bodies.set(route,f.bodies.get(route)+' stale');
  await assert.rejects(checkProductionRelease(f.options),{code:'release-bytes-mismatch',route});assert.equal(f.calls.at(-1),route);
 }
});
test('a dynamic production sitemap verifies only its fixed static shard',async t=>{
 const f=await fixture(t);f.bodies.set('/sitemap.xml',index);f.bodies.set('/sitemap-site.xml',sitemap);
 const results=await checkProductionRelease(f.options);assert.equal(results.find(item=>item.route==='/sitemap.xml').index,true);assert.equal(f.calls.at(-1),'/sitemap-site.xml');
 f.bodies.set('/sitemap.xml',index.replace('https://degreesteps.com/sitemap-insights.xml','https://untrusted.example/sitemap-insights.xml'));await assert.rejects(checkProductionRelease(f.options),{code:'release-bytes-mismatch'});assert(!f.calls.includes('/sitemap-insights.xml'));
});
test('public production routes reject staging headers and robot-blocking HTML',async t=>{
 const f=await fixture(t),fetchImpl=f.options.fetchImpl;
 for(const directive of ['noindex, nofollow','googlebot: noindex','none'])await assert.rejects(checkProductionRelease({...f.options,fetchImpl:async(url,options)=>{const response=await fetchImpl(url,options);response.headers.set('X-Robots-Tag',directive);return response;}}),{code:'production-public-indexing'});
 for(const html of ['<meta name="robots" content="noindex, follow">','<meta content="none" name="googlebot">']){
  f.bodies.set('/',html);await writeFile(join(f.root,'index.html'),html);await assert.rejects(checkProductionRelease(f.options),{code:'production-public-indexing',route:'/'});
 }
});
test('private course, portal and requirements pages keep noindex and no-store on production',async t=>{
 const f=await fixture(t),fetchImpl=f.options.fetchImpl;
 for(const route of ['/courses.html','/portal.html','/degree-audit.html'])for(const header of ['X-Robots-Tag','Cache-Control'])await assert.rejects(checkProductionRelease({...f.options,fetchImpl:async(url,options)=>{const response=await fetchImpl(url,options);if(new URL(url).pathname===route)response.headers.delete(header);return response;}}),{code:'production-private-page-headers',route});
});
test('staging robots are rejected remotely and before requests when present in the build',async t=>{
 const f=await fixture(t);f.bodies.set('/robots.txt','User-agent: *\nDisallow: /\n');await assert.rejects(checkProductionRelease(f.options),{code:'production-robots-block-all'});
 await writeFile(join(f.root,'robots.txt'),f.bodies.get('/robots.txt'));f.calls.length=0;await assert.rejects(checkProductionRelease(f.options),{code:'production-robots-block-all'});assert.deepEqual(f.calls,[]);
});
test('wrong release bytes retry finitely and logs omit provider body content',async t=>{
 const f=await fixture(t);f.bodies.set('/','<h1>Stale secret-looking content</h1>');await assert.rejects(checkProductionRelease({...f.options,attempts:3}),{code:'release-bytes-mismatch',route:'/'});assert.equal(f.calls.filter(route=>route==='/').length,3);assert(!JSON.stringify(f.logs).includes('secret-looking'));assert.match(f.logs.at(-1).sha256,/^[a-f0-9]{64}$/);
});
test('redirects, HTTP failures and oversized responses cannot certify production',async t=>{
 const f=await fixture(t);
 for(const status of [302,404,503])await assert.rejects(checkProductionRelease({...f.options,fetchImpl:async()=>new Response('untrusted diagnostic',{status})}),{code:'unexpected-status'});
 await assert.rejects(checkProductionRelease({...f.options,fetchImpl:async()=>new Response('small',{headers:{'Content-Length':'99999999'}})}),{code:'response-too-large'});
 await assert.rejects(checkProductionRelease({...f.options,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(256*1024+1));controller.close();}}))}),{code:'response-too-large'});
});
test('timeouts abort, invalid bounds and missing assets fail before certification',async t=>{
 const f=await fixture(t);let signal;
 await assert.rejects(checkProductionRelease({...f.options,timeoutMs:10,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}}),{code:'request-timeout'});assert.equal(signal.aborted,true);
 for(const override of [{attempts:4},{timeoutMs:30001},{retryDelayMs:5001}])await assert.rejects(checkProductionRelease({...f.options,...override}),{code:'invalid-check-bounds'});
 for(const route of ['/courses.html','/portal.html','/portal.js','/guide-engine.js','/sheet-state.js','/student-checklist.js','/journey-engine.js','/school.js','/degree-audit.html','/degree-audit.js','/requirements-baselines.js','/data/requirements-baselines.json','/sheet.js']){const missing=await fixture(t);await rm(join(missing.root,route));await assert.rejects(checkProductionRelease(missing.options),{code:'built-asset-unavailable',route});assert.deepEqual(missing.calls,[]);}
});
test('the approved deploy workflow retains production confirmation and runs hosted verification',async()=>{
 const source=await readFile(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(source,/data_migration_verified:[\s\S]*?default: false/);assert.match(source,/name: Production gate\n\s+if: env\.TARGET == 'production'/);assert.match(source,/name: Production configuration check\n\s+if: env\.TARGET == 'production'/);
 assert.match(source,/name: Verify the deployed production release\n\s+if: env\.TARGET == 'production'\n\s+run: node scripts\/check-production-release\.mjs/);assert(source.indexOf('name: Verify the deployed production release')>source.indexOf('name: Deploy Worker'));assert.match(source,/name: Verify the deployed staging release\n\s+if: env\.TARGET == 'staging'/);
});
