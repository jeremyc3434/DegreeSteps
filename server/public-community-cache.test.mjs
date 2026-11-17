import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCommunityCache } from './public-community-cache.mjs';

const origin='https://degreepath.example';
const anonymous={user:null,setCookies:[]};
function fixture(){
 let clock=100000,reads=0,writes=0;
 const entries=new Map(),pending=[];
 const cache={async match(key){reads++;return entries.get(key.url)?.clone();},async put(key,response){writes++;entries.set(key.url,response);}};
 return {cache,entries,now:()=>clock,advance:ms=>{clock+=ms;},ctx:{waitUntil:value=>pending.push(value)},flush:()=>Promise.all(pending),counts:()=>({reads,writes})};
}
const request=(path='/api/community/feed',options={})=>new Request(origin+path,options);
const content=(value={items:[{id:'public-post',body:'Public discussion',author:{alias:'Public alias',isYou:false}}]})=>Response.json(value,{headers:{'Cache-Control':'no-store','Vary':'Cookie, oai-authenticated-user-id'}});

test('anonymous successful reads reuse exact public content for ten seconds while browsers remain no-store',async()=>{
 const f=fixture(),first=await publicCommunityCache(request(),anonymous,f);
 assert.equal(first.hit,null);
 const response=content();first.store(response,f.ctx);await f.flush();
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const second=await publicCommunityCache(request(),anonymous,f);
 assert(second.hit);assert.equal(second.hit.headers.get('Cache-Control'),'no-store');
 assert.equal(second.hit.headers.get('X-DegreePath-Public-Cache-Until'),null);
 assert.deepEqual(await second.hit.json(),await response.json());
 f.advance(9999);assert((await publicCommunityCache(request(),anonymous,f)).hit);
 f.advance(1);assert.equal((await publicCommunityCache(request(),anonymous,f)).hit,null);
 assert.equal(f.counts().writes,1);
});

test('account credentials and resolved or rotating identities never read or write this cache',async()=>{
 const f=fixture();
 for(const name of ['Cookie','Authorization','Proxy-Authorization','oai-authenticated-user-id','oai-authenticated-user-email']){
  assert.equal(await publicCommunityCache(request(undefined,{headers:{[name]:'private-value'}}),anonymous,f),null,name);
  assert.equal(await publicCommunityCache(request(undefined,{headers:{[name]:''}}),anonymous,f),null,name+' empty');
 }
 for(const identity of [undefined,{}, {user:{id:'private-user'}},{user:null,unavailable:true},{user:null,setCookies:['__Host-degreepath_access=rotated']}])assert.equal(await publicCommunityCache(request(),identity,f),null);
 assert.deepEqual(f.counts(),{reads:0,writes:0});
});

test('only exact public discussion GET routes are eligible; private and evidence routes stay live',async()=>{
 const f=fixture();
 for(const path of ['/api/community/session','/api/community/profile','/api/community/moderation/reports','/api/community/moderation/evidence','/api/community/evidence','/api/community/evidence/summary?programId=liberty&catalogYear=2026','/api/templates','/api/templates/requests','/api/admin/ai-connection','/api/colleges/leads?organizationId=one','/api/portal/plans','/api/auth/status','/account.html','/api/community/posts/post-1/reactions'])assert.equal(await publicCommunityCache(request(path),anonymous,f),null,path);
 assert.equal(await publicCommunityCache(request('/api/community/feed',{method:'POST',body:'{}'}),anonymous,f),null);
 for(const path of ['/api/community/feed?unknown=one','/api/community/feed?context=school:one&context=school:two','/api/community/posts/post-1?context=school:one','/api/community/context?limit=2','/api/community/comments?catalogYear=2026'])assert.equal(await publicCommunityCache(request(path),anonymous,f),null,path);
 assert.deepEqual(f.counts(),{reads:0,writes:0});
 for(const path of ['/api/community/feed?context=school:one&kind=plan&limit=12&cursor=abc','/api/community/context?context=school:one','/api/community/comments?context=program:one&limit=20','/api/community/posts/post-1'])assert(await publicCommunityCache(request(path),anonymous,f),path);
});

test('hosts, filters, pagination and complete public URL identities never share a cache entry',async()=>{
 const f=fixture(),first=await publicCommunityCache(request('/api/community/feed?context=school:one&limit=20'),anonymous,f);
 first.store(content(),f.ctx);await f.flush();
 for(const path of ['/api/community/feed?context=school:two&limit=20','/api/community/feed?context=school:one&limit=10','/api/community/feed?context=school:one&limit=20&cursor=next','/api/community/context?context=school:one'])assert.equal((await publicCommunityCache(request(path),anonymous,f)).hit,null,path);
 assert.equal((await publicCommunityCache(new Request('https://other.example/api/community/feed?context=school:one&limit=20'),anonymous,f)).hit,null);
});

test('errors, HTML, redirects, private cookie responses and wildcard variation are never stored',async()=>{
 const f=fixture(),handle=await publicCommunityCache(request(),anonymous,f);
 for(const status of [400,401,403,404,429,500,503])handle.store(Response.json({error:'live error'},{status}),f.ctx);
 handle.store(new Response('<html>error</html>',{headers:{'Content-Type':'text/html'}}),f.ctx);
 handle.store(new Response(null,{status:302,headers:{Location:'/account.html'}}),f.ctx);
 handle.store(Response.json({user:{id:'private-user'}},{headers:{'Set-Cookie':'__Host-degreepath_access=private'}}),f.ctx);
 handle.store(Response.json({items:[]},{headers:{Vary:'*'}}),f.ctx);
 await f.flush();assert.equal(f.counts().writes,0);
});

test('missing or failing Cache API cannot break the origin route and never serves stale entries',async()=>{
 assert.equal(await publicCommunityCache(request(),anonymous,{cache:null}),null);
 const broken={async match(){throw Error('cache unavailable');},async put(){throw Error('cache unavailable');}};
 const waits=[],handle=await publicCommunityCache(request(),anonymous,{cache:broken});assert.equal(handle.hit,null);
 handle.store(content(),{waitUntil:promise=>waits.push(promise)});await Promise.all(waits);
 const stale=content();stale.headers.set('X-DegreePath-Public-Cache-Until','90000');
 const old=await publicCommunityCache(request(),anonymous,{cache:{async match(){return stale;},async put(){}},now:()=>100000});assert.equal(old.hit,null);
});
