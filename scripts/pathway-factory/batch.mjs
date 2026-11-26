/** One resumable research workflow. Outputs are drafts in outputs/, never academic approvals. */
import {readFile,writeFile,mkdir,rename,realpath,rm,stat} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {pathToFileURL} from 'node:url';
import {readCohortInputs,buildCohortPlan} from './cohort.mjs';
import {loadProgramManifests} from './program-manifest.mjs';
import {buildSchoolResearchBatch,schoolConfigurations,captureBatch,readVerifiedSchoolCaptures} from '../build-school-research-batch.mjs';
import {draftComponents,COMPONENT_SOURCE_ROLES,createAnthropicComponentAdapter} from './component-drafts.mjs';
import {htmlToText,pdfToText,parsePageFragment} from './capture.mjs';
import {validateConnectedWebCapture,CONNECTED_WEB_FORMAT} from './connected-web.mjs';
import {canonical,sha256} from './lib.mjs';

const ROOT=resolve(import.meta.dirname,'../..'),list=v=>Array.isArray(v)?v:[];
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=value=>'sha256:'+sha256(JSON.stringify(canonical(value)));
const roleMap={'academic-policy':'university-policy','general-education':'university-course-pool',pricing:'university-price','course-description':'university-course','program-evidence':'university-program','receiving-school-transfer-guide':'university-transfer-map'};
const sourceRole=source=>{
 const allowed=new Set(Object.values(COMPONENT_SOURCE_ROLES).flat());
 const explicit=list(source.roles).filter(role=>allowed.has(role));if(explicit.length)return explicit;
 if(roleMap[source.kind])return [roleMap[source.kind]];
 // URL classification routes extraction work only; the output always remains an unreviewed draft.
 const path=new URL(source.url).pathname.toLowerCase();
 const institutionHost=Object.values(schoolConfigurations).some(school=>school.officialDomains.some(domain=>new URL(source.url).hostname===domain||new URL(source.url).hostname.endsWith('.'+domain)));
 if(source.kind==='university'||institutionHost)return [/\/courses?\//.test(path)?'university-course':/general-education/.test(path)?'university-course-pool':/tuition|fees|expenses/.test(path)?'university-price':/polic|transfer-credit|equivalenc|clep|dsst/.test(path)?'university-policy':'university-program'];
 if(source.kind==='provider'||source.kind==='ace')return ['provider-identity'];
 return [];
};

/** Reads public snapshots once; a missing authoring manifest never changes academic readiness. */
export async function buildBatchPlan({base=ROOT,target=20,schools,asOf=new Date().toISOString().slice(0,10),inputs,manifestRegistry}={}){
 const academic=inputs||await readCohortInputs({base,asOf});
 const registry=manifestRegistry||await loadProgramManifests({root:base,validateBindings:true});
 const cohort=buildCohortPlan({...academic,target,schools,asOf,excludeModelIds:list(registry.legacyIdentities).map(row=>row.modelId)});
 const [directory,curriculum,pathways,aliases]=await Promise.all(['program-catalog','curriculum-registry','pathways','degree-link-aliases'].map(name=>read(resolve(base,'dist/data',name+'.json'))));
 const selected=new Set(cohort.selectedModelIds),selectedModels=academic.models.filter(model=>selected.has(model.id));
 const manifests=[],unsupportedSchools=[],unsupportedDeliveries=[];
 for(const schoolName of [...new Set(selectedModels.map(model=>model.school))].sort()){
  const config=Object.values(schoolConfigurations).find(school=>school.name===schoolName);
  if(!config){unsupportedSchools.push({school:schoolName,modelIds:selectedModels.filter(model=>model.school===schoolName).map(model=>model.id),reason:'No explicit official-domain capture configuration; retained evidence can still be drafted.'});continue;}
  const deliveries=[...new Set(selectedModels.filter(model=>model.school===schoolName).flatMap(model=>{
   let recorded=list(model.modalities);if(!recorded.length)recorded=list(curriculum.models.find(entry=>entry.id===model.id)?.modalities);
   if(!recorded.length){const format=String(model.format||'').trim().toLowerCase();recorded=['online','campus','residential','hybrid'].includes(format)?[format==='residential'?'campus':format]:[];}
   if(!recorded.length)unsupportedDeliveries.push({modelId:model.id,school:schoolName,reason:'No explicit delivery evidence; no modality assumed.'});
   for(const modality of recorded.filter(value=>!['online','campus'].includes(value)))unsupportedDeliveries.push({modelId:model.id,school:schoolName,modality,reason:'Capture runner supports explicit online or campus scope; other delivery evidence stays separate.'});
   return recorded.filter(value=>['online','campus'].includes(value));
  }))].sort();
  for(const modality of deliveries){
   const manifest=buildSchoolResearchBatch({directory,curriculum,pathways,models:academic.models,academicRegistry:academic.registry,degreeLinkAliases:aliases.aliases,schoolId:config.id,modality,selectedModelIds:selectedModels.filter(model=>model.school===schoolName).map(model=>model.id)});
   const jobs=manifest.jobs.filter(job=>list(job.affectedModelIds).some(id=>selected.has(id))),ids=new Set(jobs.map(job=>job.sourceId));
   const scoped={...manifest,programs:manifest.programs.filter(program=>selected.has(program.modelId)),sources:manifest.sources.filter(source=>ids.has(source.id)),jobs,cohortRevision:cohort.revision,scope:'Only selected research cohort models. Capture and drafting never approve or publish a plan.'};
   scoped.revision='cohort-school-batch-v1:'+sha256(JSON.stringify(canonical(scoped)));
   manifests.push(scoped);
  }
 }
 const registered=registry.programs.filter(program=>selected.has(program.modelId));
 const scheduledURLs=new Set(manifests.flatMap(manifest=>manifest.jobs.map(job=>job.url)));
 const deferredSourceWorkGroups=cohort.sourceWorkGroups.filter(group=>!scheduledURLs.has(group.url)).map(group=>({...group,reason:group.url?'No exact institutional capture job. Retained provider evidence, a separately trusted provider capture, or a scoped excerpt is still required.':'The research dependency has no located primary source.'}));
 const core={schemaVersion:1,asOf,cohort,schoolBatches:manifests,unsupportedSchools,unsupportedDeliveries,
  sourceWorkCoverage:{totalGroups:cohort.sourceWorkGroups.length,scheduledGroups:cohort.sourceWorkGroups.length-deferredSourceWorkGroups.length,deferredSourceWorkGroups},
  authoringInventory:{registeredPrograms:registry.programs.length,selectedRegisteredPrograms:registered.map(program=>({modelId:program.modelId,family:program.family,schoolId:program.schoolId,stages:program.stages})),scope:'Reviewed authoring manifest coverage, separate from public plan coverage.'},
  academicPublicationAllowed:false,automaticApprovals:0,privateStudentRecordsIncluded:false};
 return {...core,revision:'factory-batch-v1:'+sha256(JSON.stringify(canonical(core)))};
}

/** Reuse only exact retained source bodies with an intact, matching retrieval receipt. */
export async function readRetainedBatchCaptures({base=ROOT,models,selectedModelIds,limit=250}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Retained capture limit must be 1–1000.');
 const selected=new Set(selectedModelIds),candidates=new Map(),captures=[],rejected=[];
 for(const model of models.filter(model=>selected.has(model.id)))for(const source of list(model.sources)){
  if(!source.capture)continue;
  const key=source.url+'|'+source.capture+'|'+(source.sha256||source.sourceContentHash||'');
  if(!candidates.has(key))candidates.set(key,{source,modelIds:[]});candidates.get(key).modelIds.push(model.id);
 }
 for(const {source,modelIds} of [...candidates.values()].sort((a,b)=>a.source.url.localeCompare(b.source.url)).slice(0,limit)){
  try{
   if(!/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture))throw Error('Unsupported retained capture path.');
   const [text,metadata]=await Promise.all([readFile(resolve(base,source.capture),'utf8'),read(resolve(base,source.capture.replace(/\.txt$/,'.json')))]);
   const hash=sha256(text),expected=[source.sha256,source.sourceContentHash].filter(Boolean).map(value=>value.replace(/^sha256:/,''));
   if(expected.some(value=>value!==hash)||metadata.sha256!==hash||!source.capture.endsWith('/'+hash.slice(0,16)+'.txt')||metadata.url!==source.url)throw Error('Retained source URL or content hash mismatch.');
   if(metadata.captureFormat===CONNECTED_WEB_FORMAT){
    if(source.toolResponseReceipt?.sha256!==metadata.toolResponseReceipt?.sha256)throw Error('Native receipt must also be pinned by its academic source.');
    await validateConnectedWebCapture({...metadata,text},{base});
   }else if(!Number.isInteger(metadata.status)||metadata.status<200||metadata.status>=300)throw Error('Retained source has no successful actual HTTP receipt.');
   const roles=sourceRole(source);if(!roles.length)throw Error('No supported source role for component drafting.');
   captures.push({sourceURL:source.url,text,contentHash:hash,capturedAt:metadata.fetchedAt,roles,
    ...(metadata.rawResponseSha256?{rawContentHash:metadata.rawResponseSha256}:{}),...(metadata.captureFormat?{captureFormat:metadata.captureFormat}:{}),
    ...(metadata.toolResponseReceipt?.sha256?{receiptHash:metadata.toolResponseReceipt.sha256}:{}),modelIds:[...new Set(modelIds)].sort()});
  }catch(error){rejected.push({sourceURL:source.url,capture:source.capture,modelIds:[...new Set(modelIds)].sort(),reason:error.message});}
 }
 return {captures,rejected,availableSources:candidates.size,deferredSources:Math.max(0,candidates.size-limit)};
}

async function outputPath(base,outputDir){
 const root=resolve(base,'outputs'),path=resolve(outputDir||resolve(root,'factory-batch'));
 if(!path.startsWith(root+sep))throw Error('Batch artifacts must be inside outputs/; canonical content is never an output target.');
 await mkdir(root,{recursive:true});
 // Reject an existing symlink ancestor that could redirect artifacts into academic source files.
 let ancestor=path;while(true){try{const actual=await realpath(ancestor);if(!actual.startsWith((await realpath(root))+sep)&&actual!==await realpath(root))throw Error('Batch output resolves outside outputs/.');break;}catch(error){if(error.code!=='ENOENT')throw error;ancestor=dirname(ancestor);}}
 await mkdir(path,{recursive:true});return path;
}
async function atomicJSON(path,value){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(temp,path);}
async function acquireRun(folder){
 const lock=resolve(folder,'.run.lock'),token=randomUUID(),leaseMs=120000;
 try{await mkdir(lock);}catch(error){
  if(error.code!=='EEXIST')throw error;
  const owner=await read(resolve(lock,'owner.json')).catch(()=>null);
  const info=await stat(lock),expires=owner?.expiresAt?Date.parse(owner.expiresAt):info.mtimeMs+leaseMs;
  let alive=false;if(owner?.host===hostname()&&Number.isInteger(owner.pid)){try{process.kill(owner.pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')alive=true;}}
  if(alive||!Number.isFinite(expires)||expires>Date.now())throw Error('This batch output already has a runner. Use another output folder or resume when it finishes.');
  // Exclusive recovery marker prevents a second process from deleting a fresh lock.
  await writeFile(resolve(lock,'recovery'),token,{flag:'wx'});
  const current=await read(resolve(lock,'owner.json')).catch(()=>null);
  if(current?.token!==owner?.token)throw Error('Batch lock owner changed during recovery.');
  const abandoned=lock+'.abandoned-'+token;await rename(lock,abandoned);await rm(abandoned,{recursive:true,force:true});await mkdir(lock);
 }
 const owner={token,pid:process.pid,host:hostname(),expiresAt:new Date(Date.now()+leaseMs).toISOString()};
 await atomicJSON(resolve(lock,'owner.json'),owner);
 let pending=Promise.resolve();const heartbeat=setInterval(()=>{pending=pending.then(async()=>{const current=await read(resolve(lock,'owner.json'));if(current.token!==token)throw Error('Batch lease changed.');owner.expiresAt=new Date(Date.now()+leaseMs).toISOString();await atomicJSON(resolve(lock,'owner.json'),owner);}).catch(()=>{});},30000);heartbeat.unref();
 return async()=>{clearInterval(heartbeat);await pending;const current=await read(resolve(lock,'owner.json')).catch(()=>null);if(current?.token===token)await rm(lock,{recursive:true,force:true});};
}

/** All mutating stages are confined to a research output folder. No compile/publish is called here. */
export async function runBatch({base=ROOT,outputDir,target=20,schools,asOf=new Date().toISOString().slice(0,10),capture=false,resume=true,retryFailed=false,limit=5,concurrency=2,maxTotalBytes=32*1024*1024,retainedLimit=250,allowAI=false,model,complete,maxAICalls=5,dependencies={}}={}){
 if(!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('Each run permits 1–10 new captures and concurrency 1–4.');
 if(!Number.isInteger(maxTotalBytes)||maxTotalBytes<1||maxTotalBytes>160*1024*1024)throw Error('Capture byte budget must be 1–160 MiB.');
 if(!Number.isInteger(maxAICalls)||maxAICalls<1||maxAICalls>25)throw Error('AI call budget must be 1–25.');
 if(allowAI&&!model)throw Error('Opted-in AI requires an explicit configured model.');
 const inputs=dependencies.inputs||await readCohortInputs({base,asOf});
 const plan=await (dependencies.buildBatchPlan||buildBatchPlan)({base,target,schools,asOf,inputs});
 const folder=await outputPath(base,outputDir),manifestPath=resolve(folder,'run.json'),release=await acquireRun(folder);
 let state,aiCalls=0,budgetStopped=false;
 try{
 let previous=null;try{previous=await read(manifestPath);}catch(error){if(error.code!=='ENOENT')throw error;}
 state={schemaVersion:1,batchRevision:plan.revision,status:'running',asOf,previousRevision:previous?.batchRevision||null,inputChanged:Boolean(previous&&previous.batchRevision!==plan.revision),academicPublicationAllowed:false,automaticApprovals:0,stages:[]};
 await atomicJSON(resolve(folder,'plan.json'),plan);await atomicJSON(manifestPath,state);
 let remaining=limit,bytes=maxTotalBytes,availableRawCaptures=0;const schoolReceipts=[],captured=[];
 for(const manifest of plan.schoolBatches){
  const destination=resolve(folder,'schools',manifest.school.id+'-'+manifest.modality);await mkdir(destination,{recursive:true});
  await atomicJSON(resolve(destination,'manifest.json'),manifest);
  if(capture&&remaining>0&&bytes>0){
   const receipt=await (dependencies.captureBatch||captureBatch)(manifest,{outputDir:destination,limit:remaining,concurrency,resume,retryFailed,maxTotalBytes:bytes});
   remaining-=receipt.capturedSources+receipt.failedSources;bytes-=receipt.allocatedBytes||0;schoolReceipts.push(receipt);
   state.stages.push({stage:'capture',schoolId:manifest.school.id,modality:manifest.modality,status:'completed',capturedSources:receipt.capturedSources,failedSources:receipt.failedSources,reusedSources:receipt.reusedSources||0,remainingJobs:receipt.remainingJobs});await atomicJSON(manifestPath,state);
  }
  const verified=await (dependencies.readVerifiedSchoolCaptures||readVerifiedSchoolCaptures)(manifest,{outputDir:destination});
  availableRawCaptures+=verified.length;
  for(const item of verified){
   const source=manifest.sources.find(source=>source.url===item.sourceUrl),roles=source?sourceRole(source):[];
   if(!roles.length)continue;
   try{const range=parsePageFragment(item.sourceUrl);if(new URL(item.sourceUrl).hash==='#recommendation-period-selection')throw Error('ACE period excerpts require their independently retained selection receipt.');
    const text=item.contentType==='application/pdf'?await pdfToText(item.rawBody,{pages:range.pages,columns:range.columns}):/html/.test(item.contentType)?htmlToText(item.rawBody.toString('utf8')):item.rawBody.toString('utf8').replace(/\r\n/g,'\n');
    captured.push({sourceURL:item.sourceUrl,text,contentHash:sha256(text),rawContentHash:item.sourceContentHash.replace(/^sha256:/,''),capturedAt:item.capturedAt,roles});
   }catch(error){state.stages.push({stage:'normalize',sourceURL:item.sourceUrl,status:'failed',reason:error.message});}
  }
 }
 const retained=await (dependencies.readRetainedBatchCaptures||readRetainedBatchCaptures)({base,models:inputs.models,selectedModelIds:plan.cohort.selectedModelIds,limit:retainedLimit});
 const byCapture=new Map();for(const item of [...retained.captures,...captured]){const {modelIds,...value}=item;byCapture.set(digest(value),value);}
 const adapter=allowAI?(complete||createAnthropicComponentAdapter({apiKey:process.env.ANTHROPIC_API_KEY})):null;
 const budgetedComplete=allowAI?async request=>{if(aiCalls>=maxAICalls){budgetStopped=true;throw Error('AI call budget reached.');}if(request.capture.text.length>600000)throw Error('Capture exceeds the bounded AI input size.');aiCalls++;return adapter(request);}:undefined;
 const drafts=await (dependencies.draftComponents||draftComponents)({captures:[...byCapture.values()],cacheDir:resolve(folder,'components-cache'),allowAI,model,complete:budgetedComplete});
 const kinds={'school-policy':['school-policy'],'provider-policy':['school-policy'],'provider-identity':['course'],'receiving-award':['receiving-award'],'named-course-pool':['course-pool','course']};
 const components=list(drafts.components),reviewTasks=plan.cohort.dependencies.map(task=>({...task,candidateComponentIds:components.filter(component=>(!kinds[task.kind]||kinds[task.kind].includes(component.kind))&&list(task.sources).some(source=>source.url===component.binding?.sourceURL)).map(component=>component.id),candidateEvidenceOnly:true,reviewStatus:'needs-review',automaticApproval:false}));
 const usedURLs=new Set([...retained.captures,...captured].map(item=>item.sourceURL));
 const sourceWorkCoverage=(plan.cohort.sourceWorkGroups||[]).map(group=>({id:group.id,url:group.url,retainedDraftAvailable:usedURLs.has(group.url),reviewStatus:'needs-review'}));
 await atomicJSON(resolve(folder,'components.json'),drafts);
 await atomicJSON(resolve(folder,'review-tasks.json'),{schemaVersion:1,batchRevision:plan.revision,reviewTasks,sourceWorkCoverage,deferredSourceWorkGroups:plan.sourceWorkCoverage?.deferredSourceWorkGroups||[],unsupportedSchools:plan.unsupportedSchools,unsupportedDeliveries:plan.unsupportedDeliveries||[],retainedSourceFailures:retained.rejected,academicPublicationAllowed:false,automaticApprovals:0});
 const summary={...plan.cohort.summary,newReadyPlans:0,capturedSources:schoolReceipts.reduce((n,r)=>n+r.capturedSources,0),failedCaptures:schoolReceipts.reduce((n,r)=>n+r.failedSources,0),reusedCaptures:schoolReceipts.reduce((n,r)=>n+(r.reusedSources||0),0),retainedCaptures:retained.captures.length,deferredRetainedSources:retained.deferredSources,rejectedRetainedSources:retained.rejected.length,draftComponents:components.length,componentCache:drafts.cache,aiCalls,pendingCaptureJobs:Math.max(0,plan.schoolBatches.reduce((n,m)=>n+m.jobs.length,0)-availableRawCaptures),reviewTasks:reviewTasks.length,sourceGroupsWithDrafts:sourceWorkCoverage.filter(group=>group.retainedDraftAvailable).length,sourceGroupsNeedingCapture:sourceWorkCoverage.filter(group=>!group.retainedDraftAvailable).length,automaticApprovals:0,academicPublicationAllowed:false};
 state.status='run-complete';state.summary=summary;state.stages.push({stage:'components',status:'completed',count:components.length,cache:drafts.cache});await atomicJSON(manifestPath,state);
 return {plan,summary,outputDir:relative(base,folder),state};
 }catch(error){if(state){state.status='failed';state.aiCalls=aiCalls;state.message=budgetStopped?'AI call budget reached; resume to process the next uncached captures. Completed caches remain intact.':allowAI?'Batch stopped; inspect capture stages and explicit AI configuration/budgets. Completed source and component caches remain resumable.':error.message;await atomicJSON(manifestPath,state);}if(budgetStopped)throw Error(state.message);throw error;}finally{await release();}
}

export function parseBatchArguments(args){
 const options={run:false},valueFlags=new Set(['--target','--schools','--output','--as-of','--limit','--concurrency','--max-bytes','--retained-limit','--model','--ai-limit']);
 for(let i=0;i<args.length;i++){
  const key=args[i];if(valueFlags.has(key)){const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+key+'.');const name={'--output':'outputDir','--as-of':'asOf','--max-bytes':'maxTotalBytes','--retained-limit':'retainedLimit','--ai-limit':'maxAICalls'}[key]||key.slice(2);options[name]=key==='--schools'?value.split(',').filter(Boolean):['--target','--limit','--concurrency','--max-bytes','--retained-limit','--ai-limit'].includes(key)?Number(value):value;}
  else if(key==='--run')options.run=true;else if(key==='--capture')options.capture=true;else if(key==='--retry-failed')options.retryFailed=true;else if(key==='--no-resume')options.resume=false;else if(key==='--allow-ai')options.allowAI=true;else if(key!=='--plan')throw Error('Unknown option '+key+'.');
 }
 if(!options.run&&(options.capture||options.allowAI||options.retryFailed))throw Error('Capture, retry and AI require explicit --run.');
 return options;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const {run,...options}=parseBatchArguments(process.argv.slice(2));const result=run?await runBatch(options):await buildBatchPlan(options);console.log(JSON.stringify(run?{...result.summary,outputDir:result.outputDir}:{revision:result.revision,...result.cohort.summary,registeredAuthoringPrograms:result.authoringInventory.registeredPrograms,unsupportedSchools:result.unsupportedSchools.map(row=>row.school),automaticApprovals:0}));}catch(error){console.error(error.message);process.exitCode=1;}
}
