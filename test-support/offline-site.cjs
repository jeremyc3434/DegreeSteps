/* Run browser behavior against real local assets without opening a network port.
 * Server/database behavior is covered by the separate backend test suites. */
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const types={html:'text/html',js:'text/javascript',json:'application/json',css:'text/css',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webp:'image/webp',csv:'text/csv',txt:'text/plain'};
async function mountOfflineSite(context,{origin='http://127.0.0.1:8133'}={}){
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort('blockedbyclient');
  if(url.pathname==='/api/auth/status')return route.fulfill({json:{configured:false,user:null,providers:{email:false,google:false}}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Server APIs are verified in separate backend tests.'}});
  let relative;try{relative=decodeURIComponent(url.pathname);}catch{return route.fulfill({status:400,body:'Invalid URL'});}
  const file=path.resolve(root,'.'+relative+(relative.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:404,body:'Not found'});
  try{const body=await fs.readFile(file);return route.fulfill({status:200,body,contentType:types[path.extname(file).slice(1)]||'application/octet-stream',headers:{'Cache-Control':'no-store'}});}catch{return route.fulfill({status:404,body:'Not found'});}
 });
}
module.exports={mountOfflineSite};
