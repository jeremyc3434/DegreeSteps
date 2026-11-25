import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildProviderCoverageReport} from './scripts/build-provider-coverage-report.mjs';
const require=createRequire(import.meta.url),UI=require('./dist/coverage.js');
const source=readFileSync('./dist/coverage.js','utf8'),html=readFileSync('./dist/coverage.html','utf8'),revision='academic-v1:fixture',base='/api/admin/academic-coverage';
const report=()=>buildProviderCoverageReport({directory:{sources:[{id:'upi-study',name:'UPI Study',kind:'alternative-provider'}]},courseCatalogs:[],models:[],publication:{registryRevision:revision,plans:[]},baselines:{registryRevision:revision},rates:{sources:[],providers:[]},assessment:{schemaVersion:1,sources:[],reviews:[]},asOf:'2026-11-25'});
const inventory=()=>({schemaRevision:'research-priorities-v1',revision:'research-priorities-v1:fixture',asOf:'2026-11-25',summary:{schools:0,programs:0,modelPrograms:0,availableTemplates:0,publicationReady:0,unmappedPrograms:0,inventoryCandidates:0},priorityGroups:[],schools:[],programs:[],inventoryCandidates:[],providerCoverage:report()});
function fixture({access={user:{id:'reviewer'},isAdmin:true},onFetch}={}){
 const nodes=new Map(),calls=[],fetches=[],events={};let currentAccess=access;
 for(const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi))nodes.set(m[3],{id:m[3],hidden:/\bhidden\b/.test(m[2]),disabled:false,value:'',textContent:'',innerHTML:'',dataset:{},attrs:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,value){this.attrs[name]=value;},focus(){}});
 const sandbox={module:{exports:{}},URL,URLSearchParams,Date,JSON,Set,Map,AbortController,console,addEventListener:(name,fn)=>{events[name]=fn;},fetch:async(path,options)=>{fetches.push({path,options});return onFetch?onFetch(path,options):{ok:true,json:async()=>inventory()};}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const W={async api(path){calls.push(path);if(path==='/api/colleges/status')return currentAccess;if(path===base)return{registryRevision:revision,summary:{programs:0,readyTemplates:0,facts:0,sources:0},institutions:[]};if(path.startsWith(base+'/programs?'))return{registryRevision:revision,items:[],total:0};if(path.startsWith(base+'/queue?'))return{registryRevision:revision,items:[]};throw Error('Unexpected request '+path);}};
 const app=sandbox.module.exports.start({getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},W),flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{app,nodes,calls,fetches,events,flush,setAccess:value=>{currentAccess=value;}};
}
test('admin provider coverage exposes the profile-only gap without calling a listing a usable plan',()=>{
 const text=UI.providerCoverageHTML(report(),revision);assert.match(text,/UPI Study/);assert.match(text,/Listed only/);assert.match(text,/<strong>1<\/strong> sources listed/);assert.match(text,/<strong>0<\/strong> providers with courses/);assert.match(text,/0 school-sourced/);assert.match(text,/0 provider-published/);assert.match(text,/Provider rate missing/);assert.match(text,/not an individual credit award/);assert(!/integrated|guaranteed transfer|University approved/i.test(text));
});
test('report labels are escaped and malformed, inflated or mismatched-revision data fail without hiding other coverage',()=>{
 const data=report();data.providers[0].name='<img src=x onerror=alert(1)>';const markup=UI.providerCoverageHTML(data,revision);assert(!markup.includes('<img'));assert.match(markup,/&lt;img/);
 for(const change of [d=>d.registryRevision='old',d=>d.privateStudentRecordsIncluded=true,d=>d.publicationAllowed=true,d=>d.summary.providersUsedInReadyBaselines=999,d=>d.providers[0].indexedIdentities=-1,d=>d.providers[0].receivingClaims.total=99,d=>d.providers.push(d.providers[0]),d=>d.providers=[null]]){const d=report();change(d);assert.match(UI.providerCoverageHTML(d,revision),/counts are unavailable/);}
});
test('provider report uses the already authorized inventory fetch and remains hidden for anonymous and college-only accounts',async()=>{
 for(const access of[{user:null,isAdmin:false},{user:{id:'college'},isAdmin:false}]){const f=fixture({access});await f.flush();assert.equal(f.fetches.length,0);assert.equal(f.nodes.get('coverage-provider-integration').hidden,true);assert.equal(f.nodes.get('coverage-provider-integration-content').innerHTML,'');}
 const f=fixture();await f.flush();assert.deepEqual(f.calls.slice(0,2),['/api/colleges/status',base]);assert.equal(f.fetches.length,1);assert.equal(f.fetches[0].path,'/data/research-priorities.json');assert.equal(f.nodes.get('coverage-provider-integration').hidden,false);assert.match(f.nodes.get('coverage-provider-integration-content').innerHTML,/UPI Study/);assert.equal(f.calls.some(path=>path.includes('launch')),false);
});
test('logout clears integration counts and a delayed prior response cannot restore them',async()=>{
 let finish;const f=fixture({onFetch:()=>new Promise(resolve=>{finish=resolve;})});await f.flush();assert.equal(f.fetches.length,1);f.setAccess({user:null,isAdmin:false});f.events['degreepath:account']();assert.equal(f.nodes.get('coverage-provider-integration').hidden,true);assert.equal(f.nodes.get('coverage-provider-integration-content').innerHTML,'');finish({ok:true,json:async()=>inventory()});await f.flush();assert.equal(f.nodes.get('coverage-provider-integration-content').innerHTML,'');assert.equal(f.nodes.get('coverage-workspace').hidden,true);
});
test('missing reports preserve the older inventory and stale reports show a local explanation',async()=>{
 const old=fixture({onFetch:async()=>{const data=inventory();delete data.providerCoverage;return{ok:true,json:async()=>data};}});await old.flush();assert.equal(old.nodes.get('coverage-provider-integration').hidden,true);assert.equal(old.nodes.get('coverage-workspace').hidden,false);
 const stale=fixture({onFetch:async()=>{const data=inventory();data.providerCoverage.registryRevision='older';return{ok:true,json:async()=>data};}});await stale.flush();assert.equal(stale.nodes.get('coverage-provider-integration').hidden,false);assert.match(stale.nodes.get('coverage-provider-integration-content').innerHTML,/counts are unavailable/);assert.equal(stale.nodes.get('coverage-workspace').hidden,false);assert.equal(stale.nodes.get('coverage-priorities-retry').hidden,true);
});
