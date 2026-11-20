/** Compact, public, build-time data for the degree coach (Worker tools read only these and plan-library-index.json).
 *  dist/data/coach-knowledge.json  <- content/coach/knowledge.md (vetted site copy for the `explain` tool)
 *  dist/data/coach-index.json      <- plan titles/schools/formats/page links and the published transfer-course matches,
 *                                     from the same loaders that generate /degree-plans/ and /transfer/ pages.
 * The coach never parses multi-megabyte curriculum packs at request time. Use --check to verify both files are current.
 * When the plan library itself is absent from dist (an older branch), the index step is skipped and says so. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
const list=value=>Array.isArray(value)?value:[];
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const LINK=/^\/[a-z0-9][a-z0-9\/._?=&%-]*$/i;

/** Parse content/coach/knowledge.md into topics. Only `## id` sections with Title/Sources/Links lines and prose. */
export function parseKnowledge(markdown){
 const topics={};
 const body=String(markdown).replace(/<!--[\s\S]*?-->/g,'');
 for(const section of body.split(/^## /m).slice(1)){
  const [head,...lines]=section.split('\n'),id=head.trim();
  assert(/^[a-z][a-z0-9-]{1,40}$/.test(id),'Coach knowledge topic ids must be short slugs: '+id);
  const field=name=>(lines.find(line=>line.startsWith(name+':'))||'').slice(name.length+1).trim();
  const text=lines.filter(line=>line.trim()&&!/^(Title|Sources|Links):/.test(line)).join(' ').replace(/\s+/g,' ').trim();
  const links=field('Links').split(',').map(link=>link.trim()).filter(Boolean);
  assert(field('Title')&&field('Sources')&&text,'Coach knowledge topic '+id+' needs a title, sources and text.');
  assert(text.length<=1400,'Coach knowledge topic '+id+' is too long for a short tool result.');
  for(const link of links)assert(LINK.test(link),'Coach knowledge links must be same-site paths: '+link);
  topics[id]={title:field('Title'),text,links};
 }
 assert(Object.keys(topics).length>=1,'Coach knowledge has no topics.');
 return {kind:'degreesteps-coach-knowledge',version:1,topics};
}

const formatLabel=modalities=>list(modalities).includes('campus')&&list(modalities).includes('online')?'Online or on campus':list(modalities).includes('campus')?'On campus':'Online';
const unitLabel=system=>system==='competency-unit'?'competency units':system==='quarter'?'quarter credits':'semester credits';
function levelOf(route,entry){
 const value=String(route?.level||entry?.level||'').toLowerCase();
 if(value)return value.replace(/s$/,'');
 const title=String(entry?.title||'');
 return /\b(?:M\.?S\.?|M\.?A\.?|MBA|Master)/.test(title)?'master':/\b(?:A\.?A\.?|A\.?S\.?|Associate)/.test(title)?'associate':/\b(?:B\.?S\.?|B\.?A\.?|BSBA|BLS|Bachelor)/.test(title)?'bachelor':'';
}

/** Plans and transfer-course matches for the plans the finder lists. */
export async function buildCoachIndex(distPath=dist){
 const read=async path=>JSON.parse(await readFile(resolve(distPath,path),'utf8'));
 const library=await read('data/plan-library-index.json'),registry=await read('data/curriculum-registry.json');
 const {loadPublicPlans}=await import(pathToFileURL(resolve(distPath,'../scripts/public-plan-pages.mjs')).href);
 const {loadTransferCourses}=await import(pathToFileURL(resolve(distPath,'../scripts/transfer-pages.mjs')).href);
 const publicPlans=await loadPublicPlans(distPath),pages=new Map(publicPlans.map(plan=>[plan.id,plan.path]));
 const entries=new Map(registry.models.map(entry=>[entry.id,entry])),routes=new Map(list(registry.routes).map(route=>[route.id,route]));
 const plans={};
 for(const [routeId,info] of Object.entries(library.plans).sort(([a],[b])=>a.localeCompare(b))){
  const entry=entries.get(info.modelId);if(!entry)continue;
  const route=routes.get(routeId);
  plans[routeId]={title:entry.title,school:entry.school,level:levelOf(route,entry),format:formatLabel(entry.modalities),unit:unitLabel(entry.creditUnit==='competency-unit'||entry.creditUnit==='competency'?'competency-unit':entry.creditUnit),...(pages.has(routeId)?{page:pages.get(routeId)}:{})};
 }
 const courses=(await loadTransferCourses(distPath,{publicPlans})).map(course=>{
  const byRoute=new Map();
  for(const match of course.matches){if(!plans[match.routeId])continue;const row=byRoute.get(match.routeId)||{routeId:match.routeId,tier:match.tier,requirements:[],credits:match.credits};if(!row.requirements.includes(((match.receivingCode?match.receivingCode+' ':'')+match.receivingTitle).trim()))row.requirements.push(((match.receivingCode?match.receivingCode+' ':'')+match.receivingTitle).trim());byRoute.set(match.routeId,row);}
  return {provider:course.provider,code:course.code,title:course.title,path:course.path,matches:[...byRoute.values()]};
 }).filter(course=>course.matches.length);
 return {kind:'degreesteps-coach-index',version:1,registryRevision:library.registryRevision,asOf:library.asOf,plans,courses};
}

async function writeOrCheck(path,value,check){
 const text=JSON.stringify(value)+'\n';
 if(check){let current='';try{current=await readFile(path,'utf8');}catch{}assert.equal(current,text,path.replace(root+'/','')+' is stale; run node scripts/build-coach-index.mjs');}
 else await writeFile(path,text);
 return Buffer.byteLength(text);
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const check=process.argv.includes('--check'),report={check};
 report.knowledgeBytes=await writeOrCheck(resolve(dist,'data/coach-knowledge.json'),parseKnowledge(await readFile(resolve(root,'content/coach/knowledge.md'),'utf8')),check);
 if(await exists(resolve(dist,'data/plan-library-index.json'))&&await exists(resolve(root,'scripts/transfer-pages.mjs'))){
  const index=await buildCoachIndex();report.plans=Object.keys(index.plans).length;report.courses=index.courses.length;
  report.indexBytes=await writeOrCheck(resolve(dist,'data/coach-index.json'),index,check);
 }else report.index='skipped: this checkout has no plan library index or transfer-page loader';
 console.log(JSON.stringify({coach:report}));
}
