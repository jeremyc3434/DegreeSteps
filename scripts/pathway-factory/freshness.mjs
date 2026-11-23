/**
 * Weekly source freshness check. Re-fetches every captured source page (content/source-captures/*.json sidecars and
 * every kit or provider source with a capture), one request at a time, and compares the normalized text hash with the
 * capture the kits cite. A changed page is reported with the kits, programs and plan routes that cite it and the quotes
 * that no longer appear; nothing in a kit is edited and no checked date moves. Fetch failures are recorded as
 * "unreachable" without failing the run.
 *
 * Usage: node scripts/pathway-factory/freshness.mjs [--as-of YYYY-MM-DD] [--report content/freshness/report.json]
 *          [--plan-freshness dist/data/plan-freshness.json] [--previous <old plan-freshness.json>] [--dry-run]
 *          [--url <substring>] [--limit N] [--delay ms] [--timeout ms] [--summary-md <file>]
 * --dry-run writes only the report (to --report) and never stores new captures or plan-freshness.json.
 */
import {readFile,readdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tableSignature,parseRows} from './import-sophia-partner.mjs';
import {list,sha256,normalizeText,today as todayDate,dateOnly,readJSON,writeJSON,exists,loadKit,kitDirs,loadProviders,sourceRefs,sourceIndex,inScope,rowStatus,parseArgs,isMain,root} from './lib.mjs';
import {fetchPage,storeCapture,parsePageFragment} from './capture.mjs';
import {quotedClaims} from './verify.mjs';

export const FRESHNESS_USER_AGENT='DegreeSteps-FreshnessCheck/1.0 (+https://degreesteps.com; weekly source freshness check)';
export const reportPath=resolve(root,'content/freshness/report.json');
export const planFreshnessPath=resolve(root,'dist/data/plan-freshness.json');
export const normalizedHash=text=>sha256(normalizeText(text));
const rel=(path,base)=>{const full=resolve(base,path);return full.startsWith(base+'/')?full.slice(base.length+1):full;};

/** Source ids each program depends on: its own, school policies and defaults, and every in-scope row with its provider identity. */
export function programSourceIds(kit,program){
  const ids=new Set([...list(program.sources).map(s=>s.id),...sourceRefs(program).map(r=>r.id),...sourceRefs({policies:kit.school.policies,programDefaults:kit.school.programDefaults}).map(r=>r.id)]);
  for(const row of list(kit.equivalencies.equivalencies)){
    if(rowStatus(row)!=='published'||!inScope(row,program,kit))continue;
    for(const ref of sourceRefs(row))ids.add(ref.id);
    const course=list(kit.providers.get(row.provider)?.courses).find(c=>c.code===row.code);
    if(course)for(const ref of sourceRefs({...course,...(row.identity||{})}))ids.add(ref.id);
  }
  return ids;
}

/**
 * Everything the check needs from the repository: per URL, the captures to compare against and who cites them.
 * A URL cited by a kit is compared with the capture(s) the kit cites; an uncited sidecar with its latest capture.
 */
export async function collectTargets({base=root,kitsDir=resolve(base,'content/pathway-kits'),capturesDir=resolve(base,'content/source-captures')}={}){
  const targets=new Map(),target=url=>{if(!targets.has(url))targets.set(url,{url,cited:new Map(),sidecars:[]});return targets.get(url);};
  const sidecarUrl=new Map();
  if(await exists(capturesDir))for(const name of (await readdir(capturesDir)).filter(n=>n.endsWith('.json')).sort()){
    const meta=await readJSON(join(capturesDir,name)),capture=rel(join(capturesDir,name.replace(/\.json$/,'.txt')),base);
    if(!meta.url)continue;
    sidecarUrl.set(capture,meta.url);target(meta.url).sidecars.push({capture,fetchedAt:meta.fetchedAt||''});
  }
  const providers=await loadProviders(join(kitsDir,'providers')),kits=[];
  for(const dir of await kitDirs(kitsDir))kits.push(await loadKit(dir,{providers}));
  const cite=(source,owner)=>{
    if(!source?.capture)return null;
    const capture=rel(source.capture,base),url=sidecarUrl.get(capture)||source.url;
    const t=target(url);if(!t.cited.has(capture))t.cited.set(capture,{capture,sources:[]});
    const entry=t.cited.get(capture);if(!entry.sources.some(s=>s.id===source.id&&s.owner===owner))entry.sources.push({id:source.id,owner});
    if(source.tableSha256)entry.tableSha256=source.tableSha256;
    return capture;
  };
  for(const doc of providers.values())for(const s of list(doc.sources))cite(s,doc.file);
  for(const kit of kits){
    for(const s of list(kit.school.sources))cite(s,`${kit.school.id}/school.json`);
    for(const p of kit.programs)for(const s of list(p.sources))cite(s,`${kit.school.id}/${p.file}`);
  }
  return {targets:[...targets.values()].sort((a,b)=>a.url.localeCompare(b.url)),kits};
}

/** Kits, programs (with plan route ids) and missing quotes affected by stale captures, given the new page text. */
export function affected(kits,stale,newText,base=root){
  const normalizedNew=normalizeText(newText),kitIds=new Set(),programs=[],missingQuotes=[];
  for(const kit of kits){
    for(const program of kit.programs){
      const index=sourceIndex(kit,program),ids=programSourceIds(kit,program);
      if([...ids].some(id=>stale.has(index.get(id)?.source?.capture&&rel(index.get(id).source.capture,base)))){kitIds.add(kit.school.id);programs.push({kit:kit.school.id,slug:program.slug,title:program.title,status:program.review?.status||program.status||'',routeIds:list(program.routeIds)});}
    }
    for(const{claim,file,label}of quotedClaims(kit)){
      const programSources=kit.programs.find(p=>p.file===file)?.sources;
      for(const q of list(claim.quotes)){
        const capture=sourceIndex(kit,{sources:programSources}).get(q.sourceId)?.source?.capture;
        if(!capture||!stale.has(rel(capture,base)))continue;
        kitIds.add(kit.school.id);
        if(!normalizedNew.includes(normalizeText(q.text)))missingQuotes.push({kit:kit.school.id,file,claim:label,sourceId:q.sourceId,text:q.text});
      }
    }
  }
  return {kits:[...kitIds].sort(),programs,missingQuotes};
}

/** The site's rechecking flags: plan route id -> {status:"rechecking", since}. An earlier since is kept. */
export function planFreshness(changed,{asOf,previous}={}){
  const plans={};
  for(const entry of changed)for(const program of entry.programs)for(const id of program.routeIds){
    const since=previous?.plans?.[id]?.since;plans[id]={status:'rechecking',since:dateOnly(since)&&since<=asOf?since:asOf};
  }
  return {kind:'plan-freshness',version:1,generatedOn:asOf,plans:Object.fromEntries(Object.entries(plans).sort(([a],[b])=>a.localeCompare(b)))};
}

export async function checkFreshness({base=root,kitsDir,capturesDir,asOf=todayDate(),fetchImpl=globalThis.fetch,write=true,delayMs=1000,timeoutMs=30000,filter='',limit=Infinity,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log,now=()=>new Date()}={}){
  capturesDir??=resolve(base,'content/source-captures');
  const {targets:all,kits}=await collectTargets({base,kitsDir:kitsDir??resolve(base,'content/pathway-kits'),capturesDir});
  const targets=all.filter(t=>t.url.includes(filter)).slice(0,limit);
  const changed=[],unchanged=[],unreachable=[];
  // Page-ranged sources (`#pages=…`) of one catalog PDF share a single download per run; each compares only its own pages.
  const documents=new Map();
  const sharedFetch=async(url,init)=>{
    if(!documents.has(url))documents.set(url,(async()=>{
      const response=await fetchImpl(url,init);
      const bytes=response.ok&&typeof response.arrayBuffer==='function'?new Uint8Array(await response.arrayBuffer()):null;
      return {ok:response.ok,status:response.status,url:response.url,headers:response.headers,bytes,text:bytes?null:response.text?.bind(response)};
    })());
    const saved=await documents.get(url);
    return {ok:saved.ok,status:saved.status,url:saved.url,headers:saved.headers,...(saved.bytes?{arrayBuffer:async()=>saved.bytes.slice().buffer}:{text:saved.text})};
  };
  for(const[index,t]of targets.entries()){
    const range=(()=>{try{return parsePageFragment(t.url);}catch{return {pages:null};}})();
    if(index&&delayMs&&!(range.pages&&documents.has(range.fetchUrl)))await sleep(delayMs);
    const compare=t.cited.size?[...t.cited.keys()]:[...t.sidecars].sort((a,b)=>a.fetchedAt.localeCompare(b.fetchedAt)).slice(-1).map(s=>s.capture);
    let page;
    try{page=await fetchPage(t.url,{fetchImpl:range.pages?sharedFetch:fetchImpl,userAgent:FRESHNESS_USER_AGENT,timeoutMs});}
    catch(error){unreachable.push({url:t.url,status:error.status??null,error:error.name==='TimeoutError'||error.name==='AbortError'?`timed out after ${timeoutMs} ms`:error.message});log(`unreachable ${t.url}: ${unreachable.at(-1).error}`);continue;}
    const newHash=normalizedHash(page.text),old=[];
    // Pages fingerprinted by a parsed table (Sophia partner pages show live review counts) change only when the table does.
    const tableHashes=compare.map(c=>t.cited.get(c)?.tableSha256).filter(Boolean);
    if(tableHashes.length===compare.length&&page.html&&tableHashes.every(h=>h===tableSignature(parseRows(page.html)))){unchanged.push(t.url);continue;}
    for(const capture of compare){
      const path=resolve(base,capture);
      old.push({capture,hash:await exists(path)?normalizedHash(await readFile(path,'utf8')):null});
    }
    const stale=old.filter(o=>o.hash!==newHash);
    if(!stale.length){unchanged.push(t.url);continue;}
    let newCapture=null;
    if(write){const name=page.sha256.slice(0,16),path=join(capturesDir,name+'.txt');newCapture=rel(path,base);if(!await exists(path))await storeCapture(page,{dir:capturesDir,now});}
    const who=affected(kits,new Set(stale.map(o=>o.capture)),page.text,base);
    const citedBy=stale.flatMap(o=>t.cited.get(o.capture)?.sources||[]);
    changed.push({url:t.url,oldHash:stale[0].hash,newHash,oldCaptures:stale,newCapture,citedBy,...who});
    log(`changed ${t.url}: ${who.programs.length} program(s), ${who.missingQuotes.length} missing quote(s)`);
  }
  const report={kind:'freshness-report',version:1,checkedOn:asOf,userAgent:FRESHNESS_USER_AGENT,summary:{sources:targets.length,changed:changed.length,unchanged:unchanged.length,unreachable:unreachable.length,programs:new Set(changed.flatMap(c=>c.programs.map(p=>p.kit+'/'+p.slug))).size,missingQuotes:changed.reduce((n,c)=>n+c.missingQuotes.length,0)},changed,unreachable,unchanged};
  return report;
}

export function summaryMarkdown(report,{planFlags=0,verifyExit=null}={}){
  const s=report.summary,lines=[`## Source freshness ${report.checkedOn}`,'',`${s.sources} captured source page(s) re-fetched: ${s.changed} changed, ${s.unchanged} unchanged, ${s.unreachable} unreachable.`];
  if(s.changed)lines.push(`${s.programs} program(s) cite a changed page; ${s.missingQuotes} quote(s) no longer appear; ${planFlags} plan route(s) marked "rechecking".`);
  if(verifyExit!==null)lines.push(`\`factory:verify --as-of ${report.checkedOn}\` ${verifyExit===0?'passed':'reported errors (see the job log)'}.`);
  if(report.changed.length){
    lines.push('','### Changed pages');
    for(const c of report.changed){
      lines.push('',`- ${c.url}`,`  - capture ${c.oldCaptures.map(o=>'`'+o.capture+'`').join(', ')} → ${c.newCapture?'`'+c.newCapture+'`':'(not stored)'}; hash ${String(c.oldHash).slice(0,12)} → ${c.newHash.slice(0,12)}`);
      if(c.programs.length)lines.push(`  - cited by ${c.programs.map(p=>`${p.kit}/${p.slug}`).join(', ')}`);
      else if(c.citedBy.length)lines.push(`  - cited by ${c.citedBy.map(x=>x.owner).join(', ')}`);
      for(const q of c.missingQuotes.slice(0,10))lines.push(`  - missing quote (${q.kit} ${q.claim}): "${String(q.text).slice(0,140).replace(/\s+/g,' ')}"`);
      if(c.missingQuotes.length>10)lines.push(`  - … ${c.missingQuotes.length-10} more missing quote(s) in report.json`);
    }
  }
  if(report.unreachable.length){lines.push('','### Unreachable (not treated as changed)');for(const u of report.unreachable)lines.push(`- ${u.url}: ${u.error}`);}
  return lines.join('\n')+'\n';
}

async function main(){
  const args=parseArgs(process.argv.slice(2)),asOf=args['as-of']||todayDate(),dry=Boolean(args['dry-run']);
  if(!dateOnly(asOf))throw Error('--as-of must be YYYY-MM-DD');
  const report=await checkFreshness({asOf,write:!dry,filter:typeof args.url==='string'?args.url:'',limit:args.limit?Number(args.limit):Infinity,delayMs:args.delay!==undefined?Number(args.delay):1000,timeoutMs:args.timeout?Number(args.timeout):30000});
  const out=args.report?resolve(args.report):reportPath;
  await writeJSON(out,report);
  let flags={plans:{}},flagsChanged=false;
  if(!dry){
    const target=args['plan-freshness']?resolve(args['plan-freshness']):planFreshnessPath;
    let previous=null;try{previous=await readJSON(args.previous?resolve(args.previous):target);}catch{}
    let committed=null;try{committed=await readJSON(target);}catch{}
    flags=planFreshness(report.changed,{asOf,previous});
    flagsChanged=JSON.stringify(flags.plans)!==JSON.stringify(committed?.plans||{});
    // No flags and no file: nothing to write, so the site stays exactly as it was.
    if(Object.keys(flags.plans).length||committed)await writeJSON(target,flags);
  }
  const md=summaryMarkdown(report,{planFlags:Object.keys(flags.plans).length});
  console.log(md);
  if(args['summary-md'])await appendFile(resolve(args['summary-md']),md);
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`changed=${report.summary.changed}\nplan_flags=${Object.keys(flags.plans).length}\nflags_changed=${flagsChanged}\n`);
}
if(isMain(import.meta))await main();
