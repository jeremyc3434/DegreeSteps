/**
 * AI-assisted program drafting. Captures the catalog page, then (only when ANTHROPIC_API_KEY is set) asks Claude to
 * extract the requirement ledger with a verbatim quote per requirement. Output is a status:"draft" program file that
 * is verified immediately and never compiles until a human sets review {status:"reviewed", reviewer, reviewedOn}.
 * Usage: node scripts/pathway-factory/draft.mjs --school <kit-dir-or-id> --program-url <url> [--slug <slug>] [--no-fallback]
 *        node scripts/pathway-factory/draft.mjs --school <kit-dir-or-id> --batch --program-urls <file> [--summary <file.json>]
 * Batch mode sends every draft in one Message Batches request (half price, asynchronous), polls until it ends and then
 * writes each result exactly as single mode does. At most MAX_BATCH_URLS pages per run.
 */
import {resolve,join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {slug as slugify,sha256,creditSystems,levels,today as todayDate,readJSON,writeJSON,exists,resolveKitDir,loadKit,parseArgs,isMain,root,capturesRoot,list} from './lib.mjs';
import {capture,fetchPage,storeCapture} from './capture.mjs';
import {verifyKit,formatFindings} from './verify.mjs';
/** Requirement id: program slug plus code or title, capped at 120 characters (stable hash suffix) so compiled option ids stay
 *  within the catalog's 200-character id limit when a long title (such as a concentration list) has no code. */
export function requirementId(slug,label){const id=`${slug}-${slugify(label)}`;return id.length<=120?id:id.slice(0,100).replace(/-+$/,'')+'-'+sha256(id).slice(0,8);}

export const MODEL='claude-opus-5-5';
export const API_URL='https://api.anthropic.com/v1/messages';
export const BATCHES_URL='https://api.anthropic.com/v1/messages/batches';
export const API_VERSION='2023-06-01';
export const MAX_BATCH_URLS=25;
const MAX_TOKENS=16000;
const MAX_CAPTURE_CHARS=600000;
const categories=['general-education','core','major','concentration','elective','capstone','other'];

export const draftSchema={type:'object',additionalProperties:false,required:['title','level','catalog','totalCredits','creditSystem','totalCreditsQuote','requirements','gaps'],properties:{
  title:{type:'string',description:'Exact program title as printed.'},
  level:{type:'string',enum:levels},
  catalog:{type:'string',description:'Catalog year/term exactly as printed, or "unstated".'},
  totalCredits:{type:'number',description:'Total credits required for the degree, as printed.'},
  creditSystem:{type:'string',enum:creditSystems,description:'semester, quarter, or competency-unit (WGU-style CUs). Never convert between them.'},
  totalCreditsQuote:{type:'string',description:'Verbatim span from the capture that states the total.'},
  requirements:{type:'array',items:{type:'object',additionalProperties:false,required:['code','title','credits','category','institutionalOnly','quote'],properties:{
    code:{type:'string',description:'Receiving-school course code as printed, or "" if none is printed.'},
    title:{type:'string'},
    credits:{type:'number',description:'Credits in the program credit system, as printed.'},
    category:{type:'string',enum:categories},
    institutionalOnly:{type:'boolean',description:'true only when the capture says this must be completed at the school.'},
    quote:{type:'string',description:'Verbatim, contiguous span copied from the capture that names this requirement (and its credits when printed).'}
  }}},
  gaps:{type:'array',items:{type:'string'},description:'Anything needed for a complete ledger that the capture does not state.'}
}};
export const systemPrompt=`You extract degree requirement ledgers from captured university catalog text for DegreeSteps.
Rules:
- Use only the captured text. Never add courses, credits, codes or policies from memory.
- Every requirement must carry a quote that is copied character-for-character from the capture (a short contiguous span that names the course or block). A reviewer will reject any quote that is not found verbatim.
- Keep the school's own credit units. Quarter hours and competency units are not semester hours; do not convert.
- Elective or general-education blocks listed only as a credit amount become one requirement with that credit amount and an empty code.
- Do not list outside-provider options (Sophia, Study.com, CLEP and so on); equivalencies are maintained separately.
- If the capture does not support a complete ledger, return what it supports and list the missing facts in gaps.`;

/** The Messages request body for one capture (shared by single and batch mode). Batch requests never carry fallbacks. */
export function draftParams({text,url}){
  if(text.length>MAX_CAPTURE_CHARS)throw Error(`Capture is ${text.length} characters; split the catalog into narrower pages instead of truncating it.`);
  return {model:MODEL,max_tokens:MAX_TOKENS,system:systemPrompt,output_config:{effort:'high',format:{type:'json_schema',schema:draftSchema}},
    messages:[{role:'user',content:[{type:'text',text:`<catalog_capture url="${url}">\n${text}\n</catalog_capture>\n\nDraft this program's requirement ledger.`}]}]};
}
/** Reads a Message object: refusal and max_tokens stops fail loudly, otherwise the JSON draft is parsed. */
export function interpretMessage(payload){
  if(payload?.stop_reason==='refusal')throw Error('The model declined to draft this page'+(payload.stop_details?.category?` (${payload.stop_details.category})`:'')+'. Draft it by hand.');
  if(payload?.stop_reason==='max_tokens')throw Error('The draft hit max_tokens before finishing; capture a narrower catalog page.');
  const textBlock=list(payload?.content).find(block=>block.type==='text');
  if(!textBlock)throw Error('The API response had no text block.');
  return {draft:JSON.parse(textBlock.text),model:payload.model||MODEL};
}
const apiHeaders=apiKey=>({'content-type':'application/json','x-api-key':apiKey,'anthropic-version':API_VERSION});
/** Calls the Messages API with plain fetch and a JSON-schema output format. Returns the parsed draft object. */
export async function requestDraft({text,url,apiKey,fetchImpl=globalThis.fetch,fallback=true}){
  const headers=apiHeaders(apiKey),body=draftParams({text,url});
  // Server-side refusal fallback (beta): lets a declined request finish on the default fallback model instead of failing.
  if(fallback){headers['anthropic-beta']='server-side-fallback-2026-07-01';body.fallbacks='default';}
  const response=await fetchImpl(API_URL,{method:'POST',headers,body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Error(`Anthropic API error ${response.status}: ${payload?.error?.type||''} ${payload?.error?.message||''}`.trim());
  return interpretMessage(payload);
}

/**
 * Offline token estimate for a batch (no API call). Claude's tokenizer averages roughly 3.5 characters per token on
 * English catalog text; the fixed overhead covers the system prompt and JSON schema. Output is bounded by max_tokens;
 * typical drafts (ledger plus adaptive thinking) use a few thousand.
 */
export const CHARS_PER_TOKEN=3.5,TYPICAL_OUTPUT_TOKENS=6000;
export function estimateTokens(params){
  const chars=JSON.stringify({system:params.system,schema:params.output_config.format.schema,messages:params.messages}).length;
  return {input:Math.ceil(chars/CHARS_PER_TOKEN),maxOutput:params.max_tokens,typicalOutput:TYPICAL_OUTPUT_TOKENS};
}
/** Batch prices for MODEL in USD per million tokens (half the standard $4 / $20). */
export const BATCH_PRICE={input:2,output:10};
export function estimateCost({input,output}){return input/1e6*BATCH_PRICE.input+output/1e6*BATCH_PRICE.output;}

/**
 * Submits one Message Batch, polls until processing_status is "ended", then reads the JSONL results. Returns a Map of
 * custom_id -> {message} | {error}. On maxWaitMs the batch is cancelled (unprocessed requests are not billed) and an
 * error is thrown.
 */
export async function runBatch(requests,{apiKey,fetchImpl=globalThis.fetch,pollMs=60000,maxWaitMs=5.5*3600*1000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log}){
  const headers=apiHeaders(apiKey);
  const call=async(url,init={})=>{const response=await fetchImpl(url,{headers,...init});if(!response.ok){const payload=await response.json().catch(()=>null);throw Error(`Anthropic API error ${response.status}: ${payload?.error?.type||''} ${payload?.error?.message||''}`.trim());}return response;};
  let batch=await (await call(BATCHES_URL,{method:'POST',body:JSON.stringify({requests})})).json();
  log(`Submitted batch ${batch.id} with ${requests.length} request(s).`);
  const started=Date.now();
  while(batch.processing_status!=='ended'){
    if(Date.now()-started>maxWaitMs){
      await call(`${BATCHES_URL}/${batch.id}/cancel`,{method:'POST'}).catch(()=>{});
      throw Error(`Batch ${batch.id} did not end within ${Math.round(maxWaitMs/60000)} minutes; it was cancelled (unprocessed requests are not billed).`);
    }
    await sleep(pollMs);
    batch=await (await call(`${BATCHES_URL}/${batch.id}`)).json();
    const c=batch.request_counts||{};
    log(`Batch ${batch.id}: ${batch.processing_status} (processing ${c.processing??'?'}, succeeded ${c.succeeded??'?'}, errored ${c.errored??'?'})`);
  }
  const text=await (await call(batch.results_url||`${BATCHES_URL}/${batch.id}/results`)).text();
  const results=new Map();
  for(const line of text.split('\n')){
    if(!line.trim())continue;
    const item=JSON.parse(line),result=item.result||{};
    // Results arrive in any order; they are keyed by custom_id, never by position.
    if(result.type==='succeeded')results.set(item.custom_id,{message:result.message});
    else results.set(item.custom_id,{error:result.type==='errored'?`Request errored: ${result.error?.error?.type||result.error?.type||''} ${result.error?.error?.message||result.error?.message||''}`.trim():`Request ${result.type||'missing'} before it was processed.`});
  }
  return {batch,results};
}

/** Builds the draft program file from a model response. Pure. */
export function buildDraftProgram({draft,kit,slug,url,capturePath,checked,model,routeIds}){
  const sourceId=`${kit.school.id}-${slug}-catalog-${checked}`;
  const ids=new Set();
  const requirements=draft.requirements.map(r=>{let id=requirementId(slug,r.code||r.title);const base=id;let n=2;while(ids.has(id))id=`${base}-${n++}`;ids.add(id);
    return {id,code:r.code,title:r.title,credits:r.credits,category:r.category,institutionalOnly:r.institutionalOnly,sourceIds:[sourceId],quotes:[{sourceId,text:r.quote}]};});
  const program={kind:'pathway-kit-program',version:1,slug,routeIds,title:draft.title,level:draft.level,catalog:draft.catalog,totalCredits:draft.totalCredits};
  if(draft.creditSystem!==kit.school.creditSystem)program.creditSystem=draft.creditSystem;
  Object.assign(program,{catalogUrl:url,status:'draft',review:{status:'draft',draftedBy:model,draftedOn:checked},
    sources:[{id:sourceId,title:`${draft.title} catalog page`,url,checked,capture:capturePath}],quotes:[{sourceId,text:draft.totalCreditsQuote}],gaps:list(draft.gaps),requirements});
  return program;
}
async function routeIdsFor(url,base){
  try{const catalog=await readJSON(resolve(base,'dist/data/program-catalog.json'));const clean=u=>String(u).replace(/[#?].*$/,'').replace(/\/$/,'');return catalog.programs.filter(p=>clean(p.url)===clean(url)).map(p=>p.id);}catch{return [];}
}

/** Writes one drafted program into the kit (never over a reviewed one) and verifies it. */
async function writeDraft({kitDir,draft,model,programUrl,capturePath,slug,today,base,log,taken=new Set()}){
  const kit=await loadKit(kitDir);
  let programSlug=slug||slugify(draft.title);
  if(!slug){const stem=programSlug;let n=2;while(taken.has(programSlug))programSlug=`${stem}-${n++}`;}
  taken.add(programSlug);
  const path=join(kitDir,'programs',programSlug+'.json');
  if(await exists(path)){const prior=await readJSON(path);if(prior.review?.status!=='draft')throw Error(`${path} is ${prior.review?.status}; drafts never overwrite reviewed programs.`);}
  const program=buildDraftProgram({draft,kit,slug:programSlug,url:programUrl,capturePath,checked:today,model,routeIds:await routeIdsFor(programUrl,base)});
  await writeJSON(path,program);
  const result=await verifyKit(await loadKit(kitDir),{asOf:today,base});
  const mine=result.errors.filter(e=>e.file===`programs/${programSlug}.json`);
  log(formatFindings(kit,result));
  log(`Draft written to ${path}. ${mine.length?mine.length+' verification error(s) in this draft must be fixed by a reviewer.':'It passes verification.'} It will not compile until a reviewer sets review {status:"reviewed", reviewer, reviewedOn}.`);
  return {program,path,verification:result,errors:mine,slug:programSlug};
}
const relativeTo=(path,base)=>path.startsWith(base+'/')?path.slice(base.length+1):path;

export async function draftProgram({kitDir,programUrl,slug,apiKey=process.env.ANTHROPIC_API_KEY,fetchImpl=globalThis.fetch,today=todayDate(),captureDir=capturesRoot,base=root,fallback=true,log=console.log}){
  await loadKit(kitDir);
  const captured=await capture(programUrl,{dir:captureDir,fetchImpl});
  const capturePath=relativeTo(captured.path,base);
  if(!apiKey){
    log(`Captured ${programUrl} -> ${capturePath}\nANTHROPIC_API_KEY is not set, so no AI draft was requested. Draft programs/<slug>.json by hand with status "draft" and a verbatim quote from that capture for every requirement, then run npm run factory:verify.`);
    return {capture:capturePath,program:null};
  }
  const {draft,model}=await requestDraft({text:captured.text,url:programUrl,apiKey,fetchImpl,fallback});
  const written=await writeDraft({kitDir,draft,model,programUrl,capturePath,slug,today,base,log});
  return {capture:capturePath,...written};
}

/**
 * Reads a URL list: one per line (spaces also separate, since a one-line form field may join lines); blank lines and
 * # comment lines are ignored. Validated (https only) and de-duplicated.
 */
export function parseUrlList(text){
  const urls=[...new Set(String(text||'').split(/\r?\n/).filter(line=>!line.trim().startsWith('#')).join(' ').split(/\s+/).filter(Boolean))];
  for(const url of urls){let parsed;try{parsed=new URL(url);}catch{throw Error(`Not a URL: ${url}`);}if(parsed.protocol!=='https:')throw Error(`Only https catalog URLs are accepted: ${url}`);}
  if(!urls.length)throw Error('No program URLs were given.');
  if(urls.length>MAX_BATCH_URLS)throw Error(`${urls.length} URLs given; at most ${MAX_BATCH_URLS} per run.`);
  return urls;
}

/**
 * Batch mode: capture every URL, submit all drafts as one Message Batch, poll until it ends, then write each result.
 * A capture, refusal, max_tokens stop or errored request fails only that URL. Returns a per-URL summary.
 */
export async function draftBatch({kitDir,programUrls,apiKey=process.env.ANTHROPIC_API_KEY,fetchImpl=globalThis.fetch,today=todayDate(),captureDir=capturesRoot,base=root,log=console.log,pollMs,maxWaitMs,sleep}){
  if(programUrls.length>MAX_BATCH_URLS)throw Error(`${programUrls.length} URLs given; at most ${MAX_BATCH_URLS} per run.`);
  const newSchool=!await exists(join(kitDir,'school.json'));
  if(!newSchool)await loadKit(kitDir);
  const items=[];
  for(const[index,url]of programUrls.entries()){
    const item={url,customId:`draft-${index+1}`,status:'pending'};items.push(item);
    try{
      const captured=await storeCapture(await fetchPage(url,{fetchImpl,timeoutMs:60000}),{dir:captureDir});
      item.capture=relativeTo(captured.path,base);item.text=captured.text;
      item.params=draftParams({text:captured.text,url});
    }catch(error){item.status='failed';item.error=error.message;}
  }
  const ready=items.filter(item=>item.params);
  if(!apiKey||!ready.length){
    if(!apiKey)log('ANTHROPIC_API_KEY is not set, so no batch was submitted. The captures are stored; draft by hand or rerun with a key.');
    for(const item of ready)item.status='captured';
    return summarize(items);
  }
  const estimates=ready.map(item=>estimateTokens(item.params));
  const input=estimates.reduce((n,e)=>n+e.input,0),typical=estimates.reduce((n,e)=>n+e.typicalOutput,0),max=estimates.reduce((n,e)=>n+e.maxOutput,0);
  log(`Estimated tokens (offline, ~${CHARS_PER_TOKEN} chars/token): ${input} input, ~${typical} output typical (${max} max) for ${ready.length} draft(s).`);
  log(`Estimated batch cost: ~$${estimateCost({input,output:typical}).toFixed(2)} typical, $${estimateCost({input,output:max}).toFixed(2)} at most (batch rates $${BATCH_PRICE.input}/$${BATCH_PRICE.output} per MTok).`);
  const {batch,results}=await runBatch(ready.map(item=>({custom_id:item.customId,params:item.params})),{apiKey,fetchImpl,log,...(pollMs!==undefined&&{pollMs}),...(maxWaitMs!==undefined&&{maxWaitMs}),...(sleep&&{sleep})});
  const taken=new Set();
  let skeleton=null;
  for(const item of ready){
    item.batchId=batch.id;
    const result=results.get(item.customId);
    try{
      if(!result)throw Error('The batch returned no result for this request.');
      if(result.error)throw Error(result.error);
      const usage=result.message.usage;if(usage)item.usage={input:usage.input_tokens,output:usage.output_tokens};
      const {draft,model}=interpretMessage(result.message);
      if(newSchool&&!skeleton)skeleton=await writeSchoolSkeleton(kitDir,{creditSystem:draft.creditSystem,today});
      const written=await writeDraft({kitDir,draft,model,programUrl:item.url,capturePath:item.capture,today,base,log,taken});
      Object.assign(item,{status:'drafted',slug:written.slug,path:relativeTo(written.path,base),errors:written.errors});
    }catch(error){item.status='failed';item.error=error.message;log(`${item.url}: ${error.message}`);}
  }
  return {...summarize(items,batch.id),newSchool:skeleton?relativeTo(skeleton,base):null};
}
/**
 * A new school id gets a minimal school.json so its drafts verify. The name is a placeholder a reviewer must replace
 * with the official name before anything is published; the credit system comes from the first draft.
 */
export async function writeSchoolSkeleton(kitDir,{creditSystem,today}){
  const id=kitDir.split(/[\\/]/).filter(Boolean).pop();
  if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw Error(`School id ${id} must be lowercase letters, digits and hyphens.`);
  const path=join(kitDir,'school.json');
  await writeJSON(path,{kind:'pathway-kit-school',version:1,id,name:`${id} (official school name needed)`,creditSystem,checkedOn:today,sources:[]});
  return path;
}
function summarize(items,batchId=null){
  return {batchId,items:items.map(({text,params,...item})=>item)};
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.batch){
    if(!args.school||!args['program-urls'])throw Error('Usage: draft.mjs --school <kit-dir-or-id> --batch --program-urls <file> [--summary <file.json>]');
    const programUrls=parseUrlList(await readFile(resolve(args['program-urls']),'utf8'));
    const summary=await draftBatch({kitDir:resolveKitDir(args.school),programUrls});
    if(args.summary)await writeFile(resolve(args.summary),JSON.stringify(summary,null,2)+'\n');
    const drafted=summary.items.filter(item=>item.status==='drafted');
    console.log(`${drafted.length}/${summary.items.length} drafted; ${drafted.filter(item=>!item.errors.length).length} pass verification.`);
    if(summary.items.some(item=>item.status==='failed'||item.errors?.length))process.exitCode=2;
    return;
  }
  if(!args.school||!args['program-url'])throw Error('Usage: draft.mjs --school <kit-dir-or-id> --program-url <url> [--slug <slug>] [--no-fallback]');
  const result=await draftProgram({kitDir:resolveKitDir(args.school),programUrl:args['program-url'],slug:args.slug,fallback:!args['no-fallback']});
  if(result.errors?.length)process.exitCode=2;
}
if(isMain(import.meta))await main();
