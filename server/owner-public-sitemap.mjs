/** Public sitemap metadata only; no owner sessions, drafts, bodies or credentials. */
const ORIGIN='https://degreesteps.com',XMLNS='http://www.sitemaps.org/schemas/sitemap/0.9';
const PAGE_SIZE=999,MAX_PAGES=100,TTL=60000;
const snapshots=new WeakMap();
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const problem=()=>Object.assign(Error('Invalid published sitemap metadata.'),{invalidSitemap:true});
const validCursor=value=>Array.isArray(value)&&value.length===2&&Number.isSafeInteger(value[0])&&value[0]>=0&&typeof value[1]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value[1]);
const encode=value=>btoa(JSON.stringify(['insights-v1',...value])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function decode(value){try{if(typeof value!=='string'||value.length>300)throw Error();const parsed=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));if(!Array.isArray(parsed)||parsed.length!==3||parsed[0]!=='insights-v1'||!validCursor(parsed.slice(1)))throw Error();return parsed.slice(1);}catch{throw problem();}}
function article(item,now){
  if(!item||typeof item.url!=='string'||item.url.length>2048)return null;
  let url;try{url=new URL(item.url);}catch{return null;}
  if(url.origin!==ORIGIN||url.username||url.password||url.port||url.search||url.hash||!/^\/insights\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(url.pathname))return null;
  if(typeof item.lastmod!=='string'||!Number.isFinite(Date.parse(item.lastmod))||Date.parse(item.lastmod)>now+86400000||Date.parse(item.lastmod)<946684800000)return null;
  return{url:url.href,lastmod:new Date(item.lastmod).toISOString()};
}
async function snapshot(env,business,now){
  const cached=snapshots.get(env.DB);if(cached&&cached.expires>now&&cached.loader===business.ownerContentSitemap)return cached.value;
  const pages=[],seen=new Set(),seenCursors=new Set();let cursor=null;
  const ctx={db:env.DB,env,publicOrigin:ORIGIN,now,fail(status,message){throw Object.assign(Error(message),{status});}};
  for(let index=0;index<MAX_PAGES;index++){
    const page=await business.ownerContentSitemap(ctx,{limit:PAGE_SIZE,cursor});
    if(!page||!Array.isArray(page.items)||page.items.length>PAGE_SIZE||page.cursor!==null&&!validCursor(page.cursor))throw problem();
    const items=[];for(const candidate of page.items){const item=article(candidate,now);if(item&&!seen.has(item.url)){seen.add(item.url);items.push(item);}}
    if(items.length)pages.push({token:cursor?encode(cursor):null,items});
    if(page.cursor===null){
      if(pages.length){const lastmod=pages.flatMap(page=>page.items).reduce((latest,item)=>item.lastmod>latest?item.lastmod:latest,'');pages[0].items.unshift({url:ORIGIN+'/insights/',lastmod});}
      const value={pages};snapshots.set(env.DB,{expires:now+TTL,loader:business.ownerContentSitemap,value});return value;
    }
    const key=encode(page.cursor);if(seenCursors.has(key)||cursor&&!(page.cursor[0]<cursor[0]||page.cursor[0]===cursor[0]&&page.cursor[1]<cursor[1]))throw problem();seenCursors.add(key);cursor=page.cursor;
  }
  throw problem();
}
function urlset(items){return'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="'+XMLNS+'">\n'+items.map(item=>'<url><loc>'+esc(item.url)+'</loc><lastmod>'+esc(item.lastmod)+'</lastmod></url>').join('\n')+'\n</urlset>\n';}
function sitemapIndex(pages){const maps=[ORIGIN+'/sitemap-site.xml',...pages.map(page=>ORIGIN+'/sitemap-insights.xml'+(page.token?'?cursor='+encodeURIComponent(page.token):''))];return'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="'+XMLNS+'">\n'+maps.map(url=>'<sitemap><loc>'+esc(url)+'</loc></sitemap>').join('\n')+'\n</sitemapindex>\n';}
async function xmlResponse(request,body,mode){
  if(typeof body!=='string'||!body.trim().startsWith('<?xml')||body.length>50*1024*1024)throw problem();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(value=>value.toString(16).padStart(2,'0')).join(''),etag='"sitemap-'+hash+'"';
  const headers={'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','ETag':etag,'X-DegreeSteps-Sitemap':mode};
  if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});return new Response(request.method==='HEAD'?null:body,{headers});
}
const unavailable=()=>new Response('Sitemap temporarily unavailable.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Retry-After':'60','X-Content-Type-Options':'nosniff'}});
export async function handleOwnerSitemap(request,env,{business,readStaticXML,publicOrigin=ORIGIN}={}){
  const url=new URL(request.url),path=url.pathname;if(!['/sitemap.xml','/sitemap-site.xml','/sitemap-insights.xml'].includes(path))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed.',{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(publicOrigin!==ORIGIN||typeof readStaticXML!=='function')return unavailable();
  const staticResponse=async mode=>{try{return await xmlResponse(request,await readStaticXML(),mode);}catch{return unavailable();}};
  if(path==='/sitemap-site.xml')return staticResponse('static');
  let token=null;
  if(path==='/sitemap-insights.xml'){
    if([...url.searchParams.keys()].some(key=>key!=='cursor')||url.searchParams.getAll('cursor').length>1)return new Response('Invalid sitemap cursor.',{status:400,headers:{'Cache-Control':'no-store'}});
    if(url.searchParams.has('cursor')){try{token=encode(decode(url.searchParams.get('cursor')));}catch{return new Response('Invalid sitemap cursor.',{status:400,headers:{'Cache-Control':'no-store'}});}}
  }
  if(!env?.DB||typeof business?.ownerContentSitemap!=='function')return path==='/sitemap.xml'?staticResponse('static-fallback'):unavailable();
  let data;try{data=await snapshot(env,business,Date.now());}catch(error){return path==='/sitemap.xml'&&!error?.invalidSitemap?staticResponse('static-fallback'):unavailable();}
  if(path==='/sitemap.xml')return data.pages.length?xmlResponse(request,sitemapIndex(data.pages),'index'):staticResponse('static');
  const page=data.pages.find(page=>page.token===token);if(!page)return new Response('Sitemap page not found.',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return xmlResponse(request,urlset(page.items),'published-insights');
}
