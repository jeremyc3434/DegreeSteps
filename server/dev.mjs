/** Loopback preview only. This file is never included in the production Worker. */
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { handleCatalog } from './catalog.mjs';
import { handleCurriculumDiscovery } from './curriculum-discovery.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { handleCommunity } from './community.mjs';
import { handlePortal } from './portal.mjs';
import { handleAuth, resolvePortalIdentity } from './auth.mjs';
import { handleCoach } from './coach.mjs';
import { handleGrowthMetrics } from './growth-metrics.mjs';
import { handleCollegeAccess } from './college-access.mjs';
const root=resolve(import.meta.dirname,'..'),staticRoot=resolve(root,'dist');
const port=Number(process.env.DEGREEPATH_PREVIEW_PORT)||8099;
await mkdir(resolve(root,'.local-community'),{recursive:true});
const sqlite=new DatabaseSync(resolve(root,'.local-community/preview.sqlite'));
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('CREATE TABLE IF NOT EXISTS __preview_migrations (tag TEXT PRIMARY KEY)');
const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
for(const migration of journal.entries){
  if(sqlite.prepare('SELECT tag FROM __preview_migrations WHERE tag=?').get(migration.tag))continue;
  sqlite.exec(await readFile(resolve(root,'drizzle',migration.tag+'.sql'),'utf8'));
  sqlite.prepare('INSERT INTO __preview_migrations(tag) VALUES (?)').run(migration.tag);
}
const DB={
  prepare(sql){const query=sqlite.prepare(sql);return{bind(...values){return{first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})};}};},
  async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const env={DB,COMMUNITY_ADMIN_EMAIL:'owner@preview.invalid',COMMUNITY_CATALOGS:await Promise.all(['tesu','liberty','liberty-criminal-justice-residential','liberty-criminal-justice-online'].map(async name=>JSON.parse(await readFile(resolve(staticRoot,'data',name+'.json'),'utf8'))))};
try{const registry=JSON.parse(await readFile(resolve(staticRoot,'data/curriculum-registry.json'),'utf8')),packs=new Map();for(const entry of registry.models||[]){if(entry.status!=='reviewed')continue;if(!packs.has(entry.path)){const payload=JSON.parse(await readFile(resolve(staticRoot,entry.path),'utf8'));packs.set(entry.path,payload.models||[payload]);}const model=packs.get(entry.path).find(model=>model.id===entry.id);if(model&&!env.COMMUNITY_CATALOGS.some(row=>row.id===model.id))env.COMMUNITY_CATALOGS.push(model);}}catch(error){if(error.code!=='ENOENT')throw error;}
const users={alice:{id:'preview-alice',email:'alice@preview.invalid'},bob:{id:'preview-bob',email:'bob@preview.invalid'},owner:{id:'preview-owner',email:'owner@preview.invalid'}};
const mime={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',csv:'text/csv; charset=utf-8',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const target=new URL(req.url,'http://127.0.0.1:'+port);
    if(target.pathname==='/api/curriculum'){
      const catalog=JSON.parse(await readFile(resolve(staticRoot,'data/program-catalog.json'),'utf8'));
      const response=await handleCurriculumDiscovery(new Request(target,{method:req.method}),env,{catalog,reviewedModels:env.COMMUNITY_CATALOGS});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:await response.text());return;
    }
    if(target.pathname.startsWith('/api/catalog/')){let data;try{data=JSON.parse(await readFile(resolve(staticRoot,'data/program-catalog.json'),'utf8'));}catch{}const response=handleCatalog(new Request(target,{method:req.method}),data);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:await response.text());return;}
    if(target.pathname==='/__preview/signin'||target.pathname==='/signin-with-chatgpt'||target.pathname==='/signout-with-chatgpt'){
      const signout=target.pathname==='/signout-with-chatgpt',name=['alice','bob','owner'].includes(target.searchParams.get('user'))?target.searchParams.get('user'):'alice';
      const run=target.searchParams.get('run')||'',scoped=/^[A-Za-z0-9_-]{1,64}$/.test(run)?name+'_'+run:name;
      if(scoped!==name)users[scoped]={...users[name],id:users[name].id+'-'+run};
      const candidate=target.searchParams.get('return_to')||'/community.html',returnTo=candidate.startsWith('/')&&!candidate.startsWith('//')?candidate:'/community.html';
      res.writeHead(303,{'Location':returnTo,'Set-Cookie':'degreepath_preview_user='+(signout?'':scoped)+'; Path=/; HttpOnly; SameSite=Lax'+(signout?'; Max-Age=0':'')});res.end();return;
    }
    if(target.pathname==='/api/coach'||target.pathname.startsWith('/api/coach/')){
      // Degree coach preview: off unless COACH_ENABLED=1. COACH_FETCH=mock answers from a scripted local model (no network).
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,String(value));
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>64*1024){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
      const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&chunks.length?{body:Buffer.concat(chunks)}:{})});
      const match=(req.headers.cookie||'').match(/(?:^|;\s*)degreepath_preview_user=([A-Za-z0-9_-]+)/),user=users[match?.[1]]||null;
      const coachEnv=process.env.COACH_ENABLED==='1'?{DB,COACH_ENABLED:'1',COACH_USER:user,COACH_HASH_SALT:process.env.COACH_HASH_SALT||'preview-only-coach-salt',COACH_MODEL:process.env.COACH_MODEL,COACH_DAILY_USD_CAP:process.env.COACH_DAILY_USD_CAP,COACH_ANON_DAILY_LIMIT:process.env.COACH_ANON_DAILY_LIMIT,COACH_USER_DAILY_LIMIT:process.env.COACH_USER_DAILY_LIMIT,
        COACH_DATA:async()=>Object.fromEntries(await Promise.all([['library','plan-library-index'],['index','coach-index'],['knowledge','coach-knowledge']].map(async([name,file])=>[name,JSON.parse(await readFile(resolve(staticRoot,'data',file+'.json'),'utf8'))]))),
        ...(process.env.COACH_FETCH==='mock'?{COACH_FETCH:(await import('./coach-mock.mjs')).createMockCoachFetch(),COACH_RESOLVE_KEY:async()=>'preview-mock-key-not-a-real-credential'}:{COACH_RESOLVE_KEY:async()=>process.env.ANTHROPIC_API_KEY||null})}:{};
      const response=await handleCoach(request,coachEnv);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return;
    }
    if(target.pathname==='/api/growth/events'||target.pathname==='/api/admin/growth-summary'||target.pathname==='/api/colleges/status'){
      // Aggregate counters and the owner report, as in the Worker. Signed-in preview users come from the loopback cookie only.
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value&&!key.startsWith('oai-authenticated-'))headers.set(key,String(value));
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
      const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&chunks.length?{body:Buffer.concat(chunks)}:{})});
      const match=(req.headers.cookie||'').match(/(?:^|;\s*)degreepath_preview_user=([A-Za-z0-9_-]+)/),user=users[match?.[1]]||null;
      const planIds=async()=>new Set(Object.keys(JSON.parse(await readFile(resolve(staticRoot,'data/plan-library-index.json'),'utf8')).plans||{}));
      const response=target.pathname==='/api/colleges/status'?await handleCollegeAccess(request,{...env,PORTAL_USER:user,COLLEGE_ACCESS_ENABLED:true}):await handleGrowthMetrics(request,{...env,PORTAL_USER:user,GROWTH_PLAN_IDS:planIds});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return;
    }
    if(target.pathname.startsWith('/api/community/')||target.pathname.startsWith('/api/portal/')||target.pathname.startsWith('/api/auth/')||target.pathname.startsWith('/auth/')){
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value&&!key.startsWith('oai-authenticated-'))headers.set(key,String(value));
      const match=(req.headers.cookie||'').match(/(?:^|;\s*)degreepath_preview_user=([A-Za-z0-9_-]+)/),user=users[match?.[1]];
      if(user){headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);}
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
      const body=chunks.length?Buffer.concat(chunks):undefined;
      const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body?{body}:{} )});
      let response;
      if(target.pathname.startsWith('/api/auth/')||target.pathname.startsWith('/auth/'))response=await handleAuth(request,env);
      else{const identity=await resolvePortalIdentity(request,env);const requestEnv={...env,PORTAL_USER:user||identity.user,PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:!!user||identity.configured};response=target.pathname.startsWith('/api/portal/')?await handlePortal(request,requestEnv):await handleCommunity(request,env,{waitUntil:promise=>promise.catch(console.error)});}
      if(!response){res.writeHead(404);res.end();return;}
      const responseHeaders=Object.fromEntries(response.headers);const setCookies=response.headers.getSetCookie();if(setCookies.length)responseHeaders['Set-Cookie']=setCookies;res.writeHead(response.status,responseHeaders);res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(['/','/index.html'].includes(target.pathname)&&['template','shared','share'].some(name=>target.searchParams.has(name))){res.writeHead(302,{Location:'/portal.html'+target.search});res.end();return;}
    let requested=target.pathname==='/'?'/index.html':decodeURIComponent(target.pathname);
    if(requested.endsWith('/'))requested+='index.html';
    let path=resolve(staticRoot,'.'+requested);
    try{if((await stat(path)).isDirectory()){res.writeHead(308,{Location:target.pathname+'/'+target.search});res.end();return;}}catch{}
    if(!path.startsWith(staticRoot+sep)){res.writeHead(404);res.end();return;}
    if(!(await stat(path)).isFile())throw Error('Not a file');
    // Compress text like the production asset host does, so preview download sizes and timings are realistic.
    const type=mime[path.split('.').pop()]||'application/octet-stream',zip=/^(text\/|application\/(json|javascript))/.test(type)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
    const body=req.method==='HEAD'?undefined:zip?gzipSync(await readFile(path),{level:6}):await readFile(path);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',...(zip?{'Content-Encoding':'gzip',Vary:'Accept-Encoding'}:{})});res.end(body);
  }catch(error){if(!res.headersSent)res.writeHead(error?.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end('Preview request unavailable.');}
});
server.listen(port,'127.0.0.1',()=>console.log('DegreeSteps preview: http://127.0.0.1:'+port+'/ (local SQLite and loopback-only test sign-in)'));
process.on('SIGINT',()=>server.close(()=>{sqlite.close();process.exit(0);}));
