/** A brief edge cache for credential-free public discussion reads only. */
const PUBLIC_COMMUNITY_TTL_MS = 10000;
const CACHE_UNTIL = 'X-DegreePath-Public-Cache-Until';
const CACHE_VERSION = 'discussion-v2';
const QUERY_KEYS = {
  '/api/community/feed': new Set(['context','kind','limit','cursor','source']),
  '/api/community/context': new Set(['context']),
  '/api/community/comments': new Set(['context','limit','cursor'])
};

function publicCommunityKey(request,identity) {
  if(request.method!=='GET'||identity?.user!==null||!Array.isArray(identity.setCookies)||identity.unavailable||identity.setCookies.length)return null;
  for(const name of ['Cookie','Authorization','Proxy-Authorization','oai-authenticated-user-id','oai-authenticated-user-email'])if(request.headers.has(name))return null;
  const url=new URL(request.url);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)return null;
  const allowed=QUERY_KEYS[url.pathname]||(/^\/api\/community\/posts\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(url.pathname)?new Set():null);
  if(!allowed)return null;
  for(const name of url.searchParams.keys())if(!allowed.has(name)||url.searchParams.getAll(name).length!==1)return null;
  // Preserve the complete public route and query. Never merge contexts, schools,
  // program IDs, cursors, hosts or filtered feeds into one cache entry.
  url.pathname='/__degreepath_public_cache/'+CACHE_VERSION+url.pathname;
  url.hash='';
  return new Request(url.href,{method:'GET'});
}
function cacheableResponse(response) {
  return response?.status===200&&!response.headers.has('Set-Cookie')&&/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||'')&&response.headers.get('Vary')!=='*';
}
function clientResponse(response) {
  const headers=new Headers(response.headers);
  headers.delete(CACHE_UNTIL);
  headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
}

export async function publicCommunityCache(request,identity,{cache=globalThis.caches?.default,now=Date.now}={}) {
  const key=publicCommunityKey(request,identity);
  if(!key||!cache||typeof cache.match!=='function'||typeof cache.put!=='function')return null;
  let hit=null;
  try{
    const stored=await cache.match(key),expires=Number(stored?.headers.get(CACHE_UNTIL));
    if(cacheableResponse(stored)&&Number.isFinite(expires)&&expires>now()&&expires<=now()+PUBLIC_COMMUNITY_TTL_MS)hit=clientResponse(stored);
  }catch{/* A cache outage must never prevent the live discussion read. */}
  return {hit,store(response,ctx){
    if(!cacheableResponse(response))return;
    const copy=response.clone(),headers=new Headers(copy.headers);
    headers.set('Cache-Control','public, max-age=10');
    headers.set(CACHE_UNTIL,String(now()+PUBLIC_COMMUNITY_TTL_MS));
    const pending=Promise.resolve().then(()=>cache.put(key,new Response(copy.body,{status:200,headers}))).catch(()=>{});
    if(typeof ctx?.waitUntil==='function'){try{ctx.waitUntil(pending);}catch{/* Best-effort cache write only. */}}
  }};
}
