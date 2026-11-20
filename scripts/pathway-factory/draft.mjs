/**
 * AI-assisted program drafting. Captures the catalog page, then (only when ANTHROPIC_API_KEY is set) asks Claude to
 * extract the requirement ledger with a verbatim quote per requirement. Output is a status:"draft" program file that
 * is verified immediately and never compiles until a human sets review {status:"reviewed", reviewer, reviewedOn}.
 * Usage: node scripts/pathway-factory/draft.mjs --school <kit-dir-or-id> --program-url <url> [--slug <slug>] [--no-fallback]
 */
import {resolve,join} from 'node:path';
import {slug as slugify,creditSystems,levels,today as todayDate,readJSON,writeJSON,exists,resolveKitDir,loadKit,parseArgs,isMain,root,capturesRoot,list} from './lib.mjs';
import {capture} from './capture.mjs';
import {verifyKit,formatFindings} from './verify.mjs';

export const MODEL='claude-opus-5-5';
export const API_URL='https://api.anthropic.com/v1/messages';
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

/** Calls the Messages API with plain fetch and a JSON-schema output format. Returns the parsed draft object. */
export async function requestDraft({text,url,apiKey,fetchImpl=globalThis.fetch,fallback=true}){
  if(text.length>MAX_CAPTURE_CHARS)throw Error(`Capture is ${text.length} characters; split the catalog into narrower pages instead of truncating it.`);
  const headers={'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'};
  const body={model:MODEL,max_tokens:16000,system:systemPrompt,output_config:{effort:'high',format:{type:'json_schema',schema:draftSchema}},
    messages:[{role:'user',content:[{type:'text',text:`<catalog_capture url="${url}">\n${text}\n</catalog_capture>\n\nDraft this program's requirement ledger.`}]}]};
  // Server-side refusal fallback (beta): lets a declined request finish on the default fallback model instead of failing.
  if(fallback){headers['anthropic-beta']='server-side-fallback-2026-07-01';body.fallbacks='default';}
  const response=await fetchImpl(API_URL,{method:'POST',headers,body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Error(`Anthropic API error ${response.status}: ${payload?.error?.type||''} ${payload?.error?.message||''}`.trim());
  if(payload.stop_reason==='refusal')throw Error('The model declined to draft this page'+(payload.stop_details?.category?` (${payload.stop_details.category})`:'')+'. Draft it by hand.');
  if(payload.stop_reason==='max_tokens')throw Error('The draft hit max_tokens before finishing; capture a narrower catalog page.');
  const textBlock=list(payload.content).find(block=>block.type==='text');
  if(!textBlock)throw Error('The API response had no text block.');
  return {draft:JSON.parse(textBlock.text),model:payload.model||MODEL};
}

/** Builds the draft program file from a model response. Pure. */
export function buildDraftProgram({draft,kit,slug,url,capturePath,checked,model,routeIds}){
  const sourceId=`${kit.school.id}-${slug}-catalog-${checked}`;
  const ids=new Set();
  const requirements=draft.requirements.map(r=>{let id=`${slug}-${slugify(r.code||r.title)}`;const base=id;let n=2;while(ids.has(id))id=`${base}-${n++}`;ids.add(id);
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

export async function draftProgram({kitDir,programUrl,slug,apiKey=process.env.ANTHROPIC_API_KEY,fetchImpl=globalThis.fetch,today=todayDate(),captureDir=capturesRoot,base=root,fallback=true,log=console.log}){
  const kit=await loadKit(kitDir);
  const captured=await capture(programUrl,{dir:captureDir,fetchImpl});
  const capturePath=captured.path.startsWith(base+'/')?captured.path.slice(base.length+1):captured.path;
  if(!apiKey){
    log(`Captured ${programUrl} -> ${capturePath}\nANTHROPIC_API_KEY is not set, so no AI draft was requested. Draft programs/<slug>.json by hand with status "draft" and a verbatim quote from that capture for every requirement, then run npm run factory:verify.`);
    return {capture:capturePath,program:null};
  }
  const {draft,model}=await requestDraft({text:captured.text,url:programUrl,apiKey,fetchImpl,fallback});
  const programSlug=slug||slugify(draft.title);
  const path=join(kitDir,'programs',programSlug+'.json');
  if(await exists(path)){const prior=await readJSON(path);if(prior.review?.status!=='draft')throw Error(`${path} is ${prior.review?.status}; drafts never overwrite reviewed programs.`);}
  const program=buildDraftProgram({draft,kit,slug:programSlug,url:programUrl,capturePath,checked:today,model,routeIds:await routeIdsFor(programUrl,base)});
  await writeJSON(path,program);
  const result=await verifyKit(await loadKit(kitDir),{asOf:today,base});
  const mine=result.errors.filter(e=>e.file===`programs/${programSlug}.json`);
  log(formatFindings(kit,result));
  log(`Draft written to ${path}. ${mine.length?mine.length+' verification error(s) in this draft must be fixed by a reviewer.':'It passes verification.'} It will not compile until a reviewer sets review {status:"reviewed", reviewer, reviewedOn}.`);
  return {capture:capturePath,program,path,verification:result,errors:mine};
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.school||!args['program-url'])throw Error('Usage: draft.mjs --school <kit-dir-or-id> --program-url <url> [--slug <slug>] [--no-fallback]');
  const result=await draftProgram({kitDir:resolveKitDir(args.school),programUrl:args['program-url'],slug:args.slug,fallback:!args['no-fallback']});
  if(result.errors?.length)process.exitCode=2;
}
if(isMain(import.meta))await main();
