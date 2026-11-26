/** Durable public-source capture state. Retrieval never approves academic claims. */
import {createHash,randomUUID} from 'node:crypto';
import {link,mkdir,open,readFile,rename,rm,stat} from 'node:fs/promises';
import {hostname} from 'node:os';
import {dirname,resolve,sep} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const contractVersion='school-official-raw-bytes-v2';
export const captureLedgerName='capture-ledger.json';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const serialize=value=>JSON.stringify(canonical(value));
const iso=clock=>new Date(clock()).toISOString();
const validTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

/** The builder supplies the hash of the exact affected program inputs. Older
 * manifests safely fall back to their whole revision instead of stale reuse. */
export function captureJobFingerprint(manifest,job){
  const source=manifest.sources.find(item=>item.id===job.sourceId);
  return 'sha256:'+hash(serialize({contractVersion,validatorRevision:manifest.validatorRevision||null,policyRevision:manifest.policyRevision||null,school:manifest.school,modality:manifest.modality,source,job:{id:job.id,url:job.url,sourceId:job.sourceId,inputFingerprint:job.inputFingerprint||manifest.revision}}));
}

async function atomicJSON(path,value){
  await mkdir(dirname(path),{recursive:true});
  const temporary=path+'.'+randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  try{await rename(temporary,path);}finally{await rm(temporary,{force:true});}
}
async function immutableFile(path,body){
  await mkdir(dirname(path),{recursive:true});
  const temporary=path+'.'+randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);
  try{
    try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
    // A hard link installs the complete, fsynced file atomically without ever
    // replacing an existing content-addressed artifact after a process crash.
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const prior=await readFile(path);if(!prior.equals(body))throw new Error('Immutable capture artifact failed its content hash check.');}
  }finally{await rm(temporary,{force:true});}
}
function inside(outputDir,path){
  if(typeof path!=='string'||!path||path.includes('\\'))throw new Error('Invalid capture artifact path.');
  const target=resolve(outputDir,path),root=resolve(outputDir)+sep;
  if(!target.startsWith(root))throw new Error('Capture artifact path escapes its output directory.');
  return target;
}
async function readJSON(path){return JSON.parse(await readFile(path,'utf8'));}
function processAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}

/** A directory lease prevents two runners from claiming the same source.
 * Owner tokens fence stale writers; abandoned jobs are recovered after expiry. */
async function acquireLease(outputDir,{clock,leaseMs}){
  const path=resolve(outputDir,'.capture-ledger.lock'),token=randomUUID(),ownerFile=resolve(path,'owner.json');
  for(let attempt=0;attempt<3;attempt++){
    try{await mkdir(path);break;}catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner=null;try{owner=await readJSON(ownerFile);}catch{}
      const info=await stat(path),expires=owner?.expiresAt?Date.parse(owner.expiresAt):info.mtimeMs+leaseMs;
      if(!Number.isFinite(expires)||expires>clock()||owner?.host===hostname()&&Number.isInteger(owner?.pid)&&processAlive(owner.pid))throw new Error('The school capture ledger is leased by another runner. Resume after that runner finishes.');
      // Only one contender may reclaim this particular abandoned directory.
      let reclaim;try{reclaim=await open(resolve(path,'recovery.lock'),'wx');}catch(error){if(error.code==='EEXIST')throw new Error('An abandoned capture lease is already being recovered.');throw error;}
      await reclaim.close();
      const current=await readJSON(ownerFile).catch(()=>null);
      if(current?.token!==owner?.token||current?.expiresAt!==owner?.expiresAt)throw new Error('Capture lease changed during recovery; retry the run.');
      const abandoned=path+'.abandoned-'+randomUUID();await rename(path,abandoned);await rm(abandoned,{recursive:true,force:true});
      if(attempt===2)throw new Error('Could not acquire the school capture lease.');
    }
  }
  const owner={token,host:hostname(),pid:process.pid,expiresAt:new Date(clock()+leaseMs).toISOString()};
  await atomicJSON(ownerFile,owner);
  let released=false,failure=null,pending=Promise.resolve();
  const renew=()=>{
    pending=pending.then(async()=>{if(released)return;if(failure)throw failure;const current=await readJSON(ownerFile);if(current.token!==token)throw new Error('The capture lease was lost; this runner cannot update the ledger.');owner.expiresAt=new Date(clock()+leaseMs).toISOString();await atomicJSON(ownerFile,owner);});
    return pending.catch(error=>{failure=error;throw error;});
  };
  const heartbeat=setInterval(()=>{renew().catch(()=>{});},Math.max(1000,Math.floor(leaseMs/3)));heartbeat.unref();
  return {token,renew,async release(){clearInterval(heartbeat);try{await pending;}catch{}released=true;const current=await readJSON(ownerFile).catch(()=>null);if(current?.token===token)await rm(path,{recursive:true,force:true});},expiresAt:()=>new Date(clock()+leaseMs).toISOString()};
}

function validLedger(value,manifest){
  if(!value||value.schemaVersion!==1||value.schoolId!==manifest.school.id||value.modality!==manifest.modality||!value.jobs||typeof value.jobs!=='object'||Array.isArray(value.jobs))throw new Error('Capture ledger is invalid or belongs to a different school or delivery format. Preserve it and restore a valid ledger before resuming.');
  for(const [id,entry] of Object.entries(value.jobs))if(!entry||entry.jobId!==id||typeof entry.fingerprint!=='string'||!['queued','running','captured','capture-failed'].includes(entry.status)||!Number.isInteger(entry.attempts)||entry.attempts<0||entry.history&&!Array.isArray(entry.history)||entry.status==='running'&&!validTime(entry.lease?.expiresAt)||entry.startedAt&&!validTime(entry.startedAt)||entry.completedAt&&!validTime(entry.completedAt))throw new Error('Capture ledger contains an invalid job. Preserve it and restore a valid ledger before resuming.');
  return value;
}
async function verifiedCapture(outputDir,entry){
  try{
    const descriptor=entry.capture;if(!descriptor||!/^sha256:[a-f0-9]{64}$/.test(descriptor.receiptHash||''))return false;
    const bytes=await readFile(inside(outputDir,descriptor.receiptPath));
    if('sha256:'+hash(bytes)!==descriptor.receiptHash)return false;
    const receipt=JSON.parse(bytes),body=await readFile(inside(outputDir,receipt.bodyPath));
    return receipt.jobId===entry.jobId&&receipt.jobFingerprint===entry.fingerprint&&receipt.sourceId===entry.sourceId&&receipt.url===entry.url&&receipt.status==='captured'&&receipt.reviewStatus==='unreviewed'&&receipt.evidenceEffect==='none'&&validTime(receipt.capturedAt)&&receipt.bytes===body.length&&receipt.sourceContentHash==='sha256:'+hash(body)&&receipt.sourceContentHash===descriptor.sourceContentHash;
  }catch{return false;}
}
/** Read only evidence whose saved receipt AND raw bytes still verify. Text is
 * the raw captured document, not an invented readable/PDF extraction. */
export async function readVerifiedSchoolCaptures(manifest,{outputDir}={}){
  if(!outputDir)throw new Error('Capture output directory is required.');
  let ledger;try{ledger=validLedger(await readJSON(resolve(outputDir,captureLedgerName)),manifest);}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const captures=[];
  for(const job of manifest.jobs){
    const entry=ledger.jobs[job.id],source=manifest.sources.find(item=>item.id===job.sourceId);
    if(!entry||entry.status!=='captured'||entry.sourceId!==job.sourceId||entry.url!==job.url||entry.fingerprint!==captureJobFingerprint(manifest,job)||!await verifiedCapture(outputDir,entry))continue;
    const receipt=await readJSON(inside(outputDir,entry.capture.receiptPath)),rawBody=await readFile(inside(outputDir,receipt.bodyPath));
    captures.push({jobId:job.id,sourceId:source.id,sourceUrl:source.url,finalUrl:receipt.finalUrl||source.url,sourceContentHash:receipt.sourceContentHash,capturedAt:receipt.capturedAt,roles:source.roles||[],contentType:receipt.contentType,rawBody,text:receipt.contentType==='application/pdf'?null:rawBody.toString('utf8'),reviewStatus:'unreviewed',evidenceEffect:'none',receipt});
  }
  return captures;
}
function remember(entry,reason,at){
  const prior={fingerprint:entry.fingerprint,status:entry.status,attempts:entry.attempts,reason,at,...(entry.capture?{capture:entry.capture}:{})};
  return [...(entry.history||[]),prior];
}

export async function captureJobsDurably(manifest,{outputDir,limit=5,concurrency=2,capture,now=()=>new Date().toISOString(),resume=true,retryFailed=false,maxBytes=8*1024*1024,maxTotalBytes=limit*maxBytes,clock=Date.now,leaseMs=120000}={}){
  if(!outputDir||!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Capture requires an output directory, 1–10 sources and concurrency 1–4.');
  if(typeof capture!=='function'||typeof now!=='function'||typeof clock!=='function'||typeof resume!=='boolean'||typeof retryFailed!=='boolean'||!Number.isInteger(leaseMs)||leaseMs<30000||leaseMs>1800000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||!Number.isInteger(maxTotalBytes)||maxTotalBytes<1||maxTotalBytes>160*1024*1024)throw new Error('Capture limits exceed the bounded research contract.');
  const retrievalNow=()=>{const value=now();if(!validTime(value))throw new Error('Capture timestamps must be valid UTC ISO timestamps.');return value;};retrievalNow();
  if(!manifest?.school?.id||!['online','campus'].includes(manifest.modality)||!Array.isArray(manifest.sources)||!Array.isArray(manifest.jobs))throw new Error('A scoped school research manifest is required.');
  const sources=new Map(manifest.sources.map(source=>[source.id,source]));
  if(sources.size!==manifest.sources.length||new Set(manifest.jobs.map(job=>job.id)).size!==manifest.jobs.length||manifest.jobs.some(job=>!sources.has(job.sourceId)||sources.get(job.sourceId).url!==job.url))throw new Error('Capture jobs require unique identities and their exact source URLs.');
  await mkdir(outputDir,{recursive:true});const lease=await acquireLease(outputDir,{clock,leaseMs}),path=resolve(outputDir,captureLedgerName);
  let writes=Promise.resolve();
  try{
    let ledger;try{ledger=validLedger(await readJSON(path),manifest);}catch(error){if(error.code==='ENOENT')ledger={schemaVersion:1,schoolId:manifest.school.id,modality:manifest.modality,createdAt:iso(clock),updatedAt:iso(clock),jobs:{}};else throw new Error('Cannot resume the capture ledger: '+error.message);}
    const save=()=>{const snapshot=JSON.parse(JSON.stringify({...ledger,updatedAt:iso(clock)}));writes=writes.then(async()=>{await lease.renew();await atomicJSON(path,snapshot);});return writes;};
    const currentIds=new Set(manifest.jobs.map(job=>job.id));let reusedSources=0,invalidatedJobs=0,recoveredJobs=0;
    for(const entry of Object.values(ledger.jobs))entry.retired=!currentIds.has(entry.jobId);
    for(const job of manifest.jobs){
      const fingerprint=captureJobFingerprint(manifest,job),prior=ledger.jobs[job.id];
      if(!prior){ledger.jobs[job.id]={jobId:job.id,sourceId:job.sourceId,url:job.url,fingerprint,status:'queued',attempts:0,retired:false};continue;}
      prior.retired=false;
      let reason=prior.fingerprint!==fingerprint||prior.sourceId!==job.sourceId||prior.url!==job.url?'input-changed':!resume&&prior.status==='captured'?'refresh-requested':null;
      if(!reason&&prior.status==='captured'){if(await verifiedCapture(outputDir,prior))reusedSources++;else reason='artifact-integrity-failed';}
      if(reason){ledger.jobs[job.id]={jobId:job.id,sourceId:job.sourceId,url:job.url,fingerprint,status:'queued',attempts:0,retired:false,history:remember(prior,reason,iso(clock))};invalidatedJobs++;}
      else if(prior.status==='running'&&Date.parse(prior.lease?.expiresAt||'')<=clock()){prior.history=remember(prior,'expired-job-lease',iso(clock));prior.status='queued';delete prior.lease;delete prior.attemptId;recoveredJobs++;}
    }
    await save();
    const eligible=manifest.jobs.filter(job=>{const entry=ledger.jobs[job.id];return entry.status==='queued'||retryFailed&&entry.status==='capture-failed';}).slice(0,limit);
    const results=new Array(eligible.length);let next=0,allocatedBytes=0;
    const workers=await Promise.allSettled(Array.from({length:Math.min(concurrency,eligible.length)},async()=>{
      while(next<eligible.length&&allocatedBytes<maxTotalBytes){
        const index=next++,job=eligible[index],source=sources.get(job.sourceId),entry=ledger.jobs[job.id],allowance=Math.min(maxBytes,maxTotalBytes-allocatedBytes),attemptId=randomUUID();allocatedBytes+=allowance;
        entry.status='running';entry.attempts++;entry.attemptId=attemptId;entry.startedAt=retrievalNow();entry.lease={ownerToken:lease.token,expiresAt:lease.expiresAt()};delete entry.error;
        await save();
        try{
          const {receipt,body:rawBody}=await capture(source,{school:manifest.school,now:retrievalNow,maxBytes:allowance}),body=Buffer.from(rawBody||[]),expectedHash='sha256:'+hash(body);
          if(!body.length||body.length>allowance||receipt?.sourceContentHash!==expectedHash||receipt.status!=='captured'||receipt.sourceId!==source.id||receipt.url!==source.url||receipt.reviewStatus!=='unreviewed'||receipt.evidenceEffect!=='none'||!validTime(receipt.capturedAt)||receipt.bytes!==undefined&&receipt.bytes!==body.length||Object.hasOwn(receipt,'reviewedAt')||!['application/pdf','text/plain','application/json','text/html','application/xhtml+xml'].includes(receipt.contentType))throw new Error('Capture returned inconsistent bytes, source identity, timestamps or review metadata.');
          const file=expectedHash.replace(':','-')+(receipt.contentType==='application/pdf'?'.pdf':receipt.contentType==='text/plain'?'.txt':receipt.contentType==='application/json'?'.json':'.html'),bodyPath='bodies/'+file;
          await immutableFile(inside(outputDir,bodyPath),body);
          const result={schemaVersion:1,sourceId:source.id,url:source.url,finalUrl:receipt.finalUrl||source.url,redirects:receipt.redirects||[],status:'captured',sourceContentHash:expectedHash,capturedAt:receipt.capturedAt,bytes:body.length,contentType:receipt.contentType,reviewStatus:'unreviewed',evidenceEffect:'none',etag:receipt.etag||null,lastModified:receipt.lastModified||null,bodyPath,jobId:job.id,jobFingerprint:entry.fingerprint,attemptId},receiptPath='receipts/'+hash(job.id)+'/'+attemptId+'.json',receiptBytes=Buffer.from(JSON.stringify(result,null,2)+'\n');
          await immutableFile(inside(outputDir,receiptPath),receiptBytes);
          entry.status='captured';entry.completedAt=retrievalNow();entry.capture={receiptPath,receiptHash:'sha256:'+hash(receiptBytes),sourceContentHash:expectedHash,bodyPath};results[index]=result;
        }catch(error){
          const result={sourceId:job.sourceId,url:job.url,jobId:job.id,status:'capture-failed',capturedAt:retrievalNow(),message:String(error.message).slice(0,500),reviewStatus:'unreviewed',evidenceEffect:'none'};
          entry.status='capture-failed';entry.completedAt=retrievalNow();entry.error=result.message;results[index]=result;
        }
        delete entry.lease;delete entry.attemptId;await save();
      }
    }));
    const failedWorker=workers.find(worker=>worker.status==='rejected');if(failedWorker)throw failedWorker.reason;
    const attempted=results.filter(Boolean),pending=manifest.jobs.map(job=>ledger.jobs[job.id]);
    const receipt={schemaVersion:1,batchRevision:manifest.revision,schoolId:manifest.school.id,startedScope:attempted.length+' queued official sources; no AI calls and no claim verification.',capturedSources:attempted.filter(result=>result.status==='captured').length,failedSources:attempted.filter(result=>result.status!=='captured').length,reusedSources,invalidatedJobs,recoveredJobs,remainingJobs:pending.filter(entry=>entry.status!=='captured').length,deferredFailedSources:pending.filter(entry=>entry.status==='capture-failed').length,allocatedBytes,maxTotalBytes,ledgerPath:captureLedgerName,results:attempted};
    ledger.lastBatchRevision=manifest.revision;await save();await atomicJSON(resolve(outputDir,'capture-receipt.json'),receipt);return receipt;
  }finally{try{await writes;}finally{await lease.release();}}
}
