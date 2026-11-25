/** Staging-only entry point. Never use this wrapper for the public production domain. */
import worker from '../outputs/cloudflare/runtime/worker.mjs';

function stagingResponse(response) {
  const headers=new Headers(response.headers);
  for(const name of ['CDN-Cache-Control','Cloudflare-CDN-Cache-Control','Vercel-CDN-Cache-Control','Surrogate-Control','Expires','Age'])headers.delete(name);
  headers.set('Cache-Control','no-store');
  headers.set('X-Robots-Tag','noindex, nofollow');
  // Preserve the actual bytes if the delegated asset response is already encoded.
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers,encodeBody:'manual'});
}

export default {
  async fetch(request,env,ctx) {
    if(new URL(request.url).pathname==='/robots.txt'){
      const read=['GET','HEAD'].includes(request.method);
      return stagingResponse(new Response(request.method==='HEAD'?null:read?'User-agent: *\nDisallow: /\n':'Method not allowed',{
        status:read?200:405,
        headers:{'Content-Type':'text/plain; charset=utf-8',...(read?{}:{Allow:'GET, HEAD'})}
      }));
    }
    return stagingResponse(await worker.fetch(request,env,ctx));
  },
  queue(batch,env,ctx){return worker.queue(batch,env,ctx);},
  scheduled(controller,env,ctx){return worker.scheduled(controller,env,ctx);}
};
