/** Staging wraps the actual native build; fixtures never call a live provider. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import worker from './worker/staging.mjs';
import {LocalD1} from './scripts/benchmark-scale.mjs';

const origin='https://staging.synthetic.invalid',provider='https://identity.synthetic.invalid';
const publicRoot=resolve(import.meta.dirname,'outputs/cloudflare/public');
function fixture(t,{database=false}={}){
  const assets=[],external=[];
  const env={ASSETS:{async fetch(request){
    const pathname=new URL(request.url).pathname,path=resolve(publicRoot,'.'+pathname);
    assert(path.startsWith(publicRoot+'/'));assets.push({pathname,method:request.method});
    let bytes;try{bytes=readFileSync(path);}catch{return new Response('Missing fixture asset',{status:404});}
    const headers={'Cache-Control':'public, max-age=31536000','CDN-Cache-Control':'public, s-maxage=31536000','Cloudflare-CDN-Cache-Control':'public, s-maxage=31536000','Vercel-CDN-Cache-Control':'public, s-maxage=31536000','Surrogate-Control':'max-age=31536000',Expires:'Wed, 01 Jan 2031 00:00:00 GMT',Age:'900',ETag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
    if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
    return new Response(request.method==='HEAD'?null:bytes,{headers});
  }},PORTAL_AUTH_FETCH:async()=>{throw Error('No identity provider is configured for this fixture');},AI_CONNECTIONS_FETCH:async()=>{throw Error('No AI provider is configured for this fixture');}};
  if(database){env.DB=new LocalD1();t.after(()=>env.DB.close());}
  t.mock.method(globalThis,'fetch',async(...args)=>{external.push(String(args[0]));throw Error('Staging tests cannot perform external HTTP');});
  return{env,assets,external,call:(path,options={})=>worker.fetch(new Request(origin+path,options),env,{waitUntil(){}})};
}
function privacy(response){
  assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  for(const name of['CDN-Cache-Control','Cloudflare-CDN-Cache-Control','Vercel-CDN-Cache-Control','Surrogate-Control','Expires','Age'])assert.equal(response.headers.get(name),null,name);
}

test('staging serves actual public/private bytes and removes permissive CDN cache directives',async t=>{
  const f=fixture(t);
  for(const[path,file]of[['/','index.html'],['/plan.html','plan.html'],['/brand.css','brand.css'],['/data/credit-import-template.xlsx','data/credit-import-template.xlsx']]){
    const response=await f.call(path);assert.equal(response.status,200,path);privacy(response);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(resolve(publicRoot,file)));
  }
  assert.deepEqual(f.external,[]);
});

test('staging preserves redirect destinations, real 404s, HEAD and conditional status semantics',async t=>{
  const f=fixture(t);
  const redirect=await f.call('/index.html?from=test');assert.equal(redirect.status,301);assert.equal(redirect.headers.get('Location'),origin+'/?from=test');privacy(redirect);
  const missing=await f.call('/not-a-staging-page');assert.equal(missing.status,404);privacy(missing);
  const denied=await f.call('/plan.html',{method:'POST',body:'fixture'});assert.equal(denied.status,405);assert.equal(denied.headers.get('Allow'),'GET, HEAD');privacy(denied);
  const head=await f.call('/brand.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);privacy(head);
  const first=await f.call('/brand.css'),etag=first.headers.get('ETag');assert(etag);
  const unchanged=await f.call('/brand.css',{headers:{'If-None-Match':etag}});assert.equal(unchanged.status,304);assert.equal((await unchanged.arrayBuffer()).byteLength,0);privacy(unchanged);
  assert.deepEqual(f.external,[]);
});

test('staging robots prohibits crawling for GET/HEAD without exposing production sitemap rules',async t=>{
  const f=fixture(t);
  const get=await f.call('/robots.txt');assert.equal(get.status,200);assert.equal(await get.text(),'User-agent: *\nDisallow: /\n');privacy(get);
  const head=await f.call('/robots.txt?check=1',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');privacy(head);
  const post=await f.call('/robots.txt',{method:'POST',body:'fixture'});assert.equal(post.status,405);assert.equal(post.headers.get('Allow'),'GET, HEAD');privacy(post);
  assert.equal(f.assets.length,0);assert.deepEqual(f.external,[]);
});

test('staging public catalog APIs retain usable reviewed data and private APIs retain authorization',async t=>{
  const f=fixture(t);
  const lookup=await f.call('/api/catalog/degree-link?'+new URLSearchParams({url:'https://www.liberty.edu/government/bachelors/criminal-justice/'}));assert.equal(lookup.status,200);privacy(lookup);
  const data=await lookup.json();assert.equal(data.matched,true);assert.equal(data.sourcePlan.qualityReady,true);assert.equal(data.sourcePlan.model.totalCredits,120);
  const calls=f.assets.length,privateResponse=await f.call('/api/portal/plans');assert.equal(privateResponse.status,401);privacy(privateResponse);assert.equal(f.assets.length,calls,'Private API errors do not fall through to asset pages');
  assert.deepEqual(f.external,[]);
});

test('staging sign-in preserves independently issued HttpOnly cookies and exact provider validation',async t=>{
  const f=fixture(t),calls=[];
  f.env.PORTAL_SUPABASE_URL=provider;f.env.PORTAL_SUPABASE_PUBLISHABLE_KEY='sb_publishable_staging_fixture';
  f.env.PORTAL_AUTH_FETCH=async(url,init)=>{
    const target=new URL(url);assert.equal(target.origin,provider);calls.push(target.pathname);
    if(target.pathname==='/auth/v1/settings')return Response.json({external:{email:true,google:true}});
    if(target.pathname==='/auth/v1/token')return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
    assert.equal(target.pathname,'/auth/v1/user');assert.equal(init.headers.Authorization,'Bearer fixture-access');
    return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'student@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});
  };
  const login=await f.call('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Portal-Request':'1'},body:JSON.stringify({email:'student@example.invalid',password:'fixture password',returnTo:'/plan.html'})});
  assert.equal(login.status,200);privacy(login);
  const data=await login.json();assert.equal(data.returnTo,'/plan.html');assert(!JSON.stringify(data).includes('fixture-access'));
  const cookies=login.headers.getSetCookie();assert.equal(cookies.length,3);assert(cookies.some(value=>value.startsWith('__Host-degreepath_access=fixture-access;')));assert(cookies.some(value=>value.startsWith('__Host-degreepath_refresh=fixture-refresh;')));assert(cookies.every(value=>value.includes('Path=/;')&&value.includes('HttpOnly; Secure; SameSite=Lax')));
  assert.deepEqual(calls,['/auth/v1/token','/auth/v1/user']);assert.deepEqual(f.external,[]);
  const authorize=await f.call('/auth/google?returnTo=/plan.html');assert.equal(authorize.status,303);privacy(authorize);
  const destination=new URL(authorize.headers.get('Location'));assert.equal(destination.origin,provider);assert.equal(destination.searchParams.get('redirect_to'),origin+'/auth/complete');
  const flow=authorize.headers.getSetCookie();assert.equal(flow.length,1);assert(flow[0].startsWith('__Host-degreepath_flow='));assert(flow[0].includes('HttpOnly; Secure; SameSite=Lax'));
});

test('staging delegates queue and scheduled handlers without paid calls or synthetic identity injection',async t=>{
  const f=fixture(t,{database:true});let acknowledged=0;
  const result=await worker.queue({messages:[{body:{jobId:'not-an-opaque-job-id'},ack(){acknowledged++;},retry(){throw Error('Malformed jobs cannot be retried');}}]},f.env,{});
  assert.equal(result.invalid,1);assert.equal(result.completed,0);assert.equal(acknowledged,1);
  assert.deepEqual(await worker.scheduled({},f.env,{}),{enabled:false,dispatched:0,pending:0});
  assert.equal(f.env.DB.events.filter(event=>event.write).length,0);assert.deepEqual(f.external,[]);
});
