/** Measures "What are my credits worth?" bytes and time-to-results, before (full check: the plan course index is
 * blocked so the worker uses its original full computation) and after (lightweight index), for no courses, one
 * Sophia course and five mixed courses, unthrottled and with Chrome DevTools "Fast 3G" emulation over CDP.
 * Serves dist/ with gzip like the production host. Synthetic records only; needs Playwright (not a core test).
 * Usage: node scripts/credits-worth-download-benchmark.mjs [--out file.json] */
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
const Library=require('../dist/course-library-engine.js'),courses=JSON.parse(await readFile(resolve(dist,'data/course-catalog.json'),'utf8')).courses;
const types={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2'};
const cache=new Map();let log=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://x');let path=decodeURIComponent(url.pathname);if(path.endsWith('/'))path+='index.html';
 const file=resolve(dist,'.'+path);if(!file.startsWith(dist)){res.writeHead(403).end();return;}
 let entry=cache.get(file);
 if(!entry){try{const raw=await readFile(file);entry={raw,gz:gzipSync(raw)};cache.set(file,entry);}catch{res.writeHead(404).end();return;}}
 const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'')&&/^(js|css|json|html|svg)$/.test(extname(file).slice(1));
 const body=gzip?entry.gz:entry.raw;log.push({path,raw:entry.raw.length,sent:body.length});
 res.writeHead(200,{'Content-Type':types[extname(file).slice(1)]||'application/octet-stream','Cache-Control':'no-store',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(body);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const BASE='http://127.0.0.1:'+server.address().port;
const record=id=>{let state=Library.saveCourse(Library.initialize(null),courses.find(c=>c.id===id));return Library.setStatus(state,state.learning[0].id,'earned').learning[0];};
const manual=(id,o)=>({id,status:'earned',completedOn:'',credits:3,creditSystem:'semester',evaluations:[],...o});
const scenarios={
 'no courses':[],
 'one Sophia course':[record('sophia-a3da6b3d489d7580d2')],
 'five mixed courses':[record('sophia-a3da6b3d489d7580d2'),record('clep-c5e1b4829165978126'),record('straighterline-aa4562f7b3ea0d6f4e'),manual('m-title',{provider:'Sophia',code:'',title:'SOPH-0015 English Composition I',codeBasis:'not-yet-known'}),manual('m-none',{provider:'Example Community College',code:'HIS 999',title:'Local History Seminar',codeBasis:'student-record'})]
};
const draft=learning=>({version:3,profile:{entry:'explore',degreeLevel:'unsure',hasPrior:learning.length?'some':'unknown'},selectedPathwayId:'',learning,scenarios:{},sheet:{isExample:false,notes:{},search:'',filter:'all'},journey:{version:1,view:'questions',step:'start',answers:{},completed:false,creditsDeferred:false},courseFirst:true});
// Chrome DevTools "Fast 3G" preset.
const FAST3G={offline:false,latency:562.5,downloadThroughput:1.6*1024*1024/8*0.9,uploadThroughput:750*1024/8*0.9};
const browser=await chromium.launch(),results=[];
for(const network of ['unthrottled','Fast 3G'])for(const mode of ['before (full)','after (index)'])for(const [name,learning] of Object.entries(scenarios)){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 if(mode.startsWith('before'))await context.route('**/data/plan-course-index.json',route=>route.abort());
 await context.addInitScript(value=>{try{localStorage.setItem('degreepath-guide-v3',value);}catch{}},JSON.stringify(draft(learning)));
 const page=await context.newPage();
 if(network==='Fast 3G'){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',FAST3G);}
 log=[];const started=Date.now();
 await page.goto(BASE+'/credits-worth.html',{waitUntil:'domcontentloaded',timeout:0});
 let firstMs=null;
 if(learning.length){await page.waitForSelector('#cw-list .cw-card',{timeout:0});firstMs=Date.now()-started;await page.waitForFunction(()=>/plans checked/.test(document.getElementById('cw-count').textContent),null,{timeout:0});}
 else await page.waitForSelector('#cw-provider option[value="Sophia"]',{state:'attached',timeout:0});
 const ms=Date.now()-started,text=await page.textContent('#cw-count');
 const sum=filter=>log.filter(filter).reduce((n,item)=>n+item.sent,0),rawSum=filter=>log.filter(filter).reduce((n,item)=>n+item.raw,0);
 const curricula=item=>/^\/data\/(curricula\/|liberty|tesu)/.test(item.path);
 const row={network,mode,scenario:name,firstResultsMs:firstMs,ms,result:text,requests:log.length,sentBytes:sum(()=>true),rawBytes:rawSum(()=>true),curriculumFiles:log.filter(curricula).length,curriculumSentBytes:sum(curricula),curriculumRawBytes:rawSum(curricula)};
 results.push(row);console.log(JSON.stringify(row));
 await context.close();
}
await browser.close();server.close();
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:null;
if(out)await writeFile(out,JSON.stringify(results,null,1)+'\n');
