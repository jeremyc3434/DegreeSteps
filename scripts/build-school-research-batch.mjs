/** Build a school research backlog, then optionally capture a bounded public-source batch.
 * Captured bytes are research input. They never approve a course, policy or template. */
import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readAcademicInputs} from './build-academic-registry.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values)].sort();
const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(value);
export const schoolBatchPath='content/research-batches/liberty-online.json';
export const schoolConfigurations={liberty:{id:'liberty',name:'Liberty University',officialDomains:['liberty.edu']}};

export function officialURL(raw,school=schoolConfigurations.liberty){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||!school.officialDomains.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw new Error('Source must be a public HTTPS URL on the school’s official domains.');
  if(/[\u0000-\u0020\u007f]/.test(url.href)||/%(?:0a|0d)/i.test(url.href))throw new Error('Invalid source URL.');
  url.hash='';return url.href;
}

function sourceKind(url){
  const path=new URL(url).pathname.toLowerCase();
  if(/equivalenc|transfer.*guide|transfer.*credit|clep|dsst/.test(path))return 'receiving-school-transfer-guide';
  if(/academic-information-policies|academic-policies/.test(path))return 'academic-policy';
  if(/general-education-courses/.test(path))return 'general-education';
  if(/expenses|tuition|fees/.test(path))return 'pricing';
  if(/\/programs\/?$/.test(path))return 'school-directory';
  if(/\/courses\//.test(path))return 'course-description';
  return 'program-evidence';
}

export function buildSchoolResearchBatch({directory,curriculum,pathways,models,academicRegistry=null,degreeLinkAliases=[],schoolId='liberty',modality='online'}){
  const school=schoolConfigurations[schoolId];
  if(!school||modality!=='online')throw new Error('This pilot supports the explicitly configured Liberty online batch.');
  const parents=list(directory.programs).filter(program=>program.schoolId===schoolId||program.school===school.name).sort((a,b)=>a.id.localeCompare(b.id));
  if(!parents.length)throw new Error('School directory is empty; refusing an empty batch.');
  const modelMap=new Map(models.filter(model=>model.school===school.name).map(model=>[model.id,model]));
  const entries=list(curriculum.models).filter(entry=>entry.school===school.name&&list(entry.modalities).includes(modality));
  const allRoutes=new Map([...parents,...list(pathways.pathways),...list(curriculum.routes)].filter(route=>route.school===school.name).map(route=>[route.id,route]));
  const entryByRoute=new Map(entries.flatMap(entry=>list(entry.routeIds).map(id=>[id,entry])));
  const onlineRoutes=[...allRoutes.values()].filter(route=>list(route.modalities).includes(modality)).sort((a,b)=>a.id.localeCompare(b.id));
  const sourceMap=new Map();
  function addSource(raw,{programIds=[],modelIds=[],localSourceIds=[],title=null,role=null}={}){
    let url;try{url=officialURL(raw,school);}catch{return null;}
    if(!sourceMap.has(url))sourceMap.set(url,{id:'source-'+hash(url).slice(0,24),url,titles:[],programIds:[],modelIds:[],localSourceIds:[],roles:[],kind:sourceKind(url)});
    const source=sourceMap.get(url);source.programIds.push(...programIds);source.modelIds.push(...modelIds);source.localSourceIds.push(...localSourceIds);if(title)source.titles.push(title);if(role)source.roles.push(role);return source.id;
  }
  const exactPrograms=onlineRoutes.map(route=>{
    const entry=entryByRoute.get(route.id),model=entry?modelMap.get(entry.id):null;
    const alias=list(degreeLinkAliases).find(alias=>alias.pathwayId===route.id&&alias.modelId===entry?.id&&alias.modality===modality);
    let url=null;try{url=officialURL(route.url||alias?.sourceUrl,school);}catch{}
    const sourceIds=[addSource(url,{programIds:[route.id],modelIds:entry?[entry.id]:[],title:route.title,role:'exact-program'})].filter(Boolean);
    for(const source of list(route.sources)){const id=addSource(source.url,{programIds:[route.id],modelIds:entry?[entry.id]:[],title:source.title,role:'route-evidence'});if(id)sourceIds.push(id);}
    for(const source of list(model?.sources)){
      const id=addSource(source.url,{programIds:[route.id],modelIds:[model.id],localSourceIds:[model.id+':'+source.id],title:source.title,role:'model-evidence'});if(id)sourceIds.push(id);
    }
    const registryProgram=academicRegistry?.programs?.find(item=>item.id===entry?.id);
    const findings=list(academicRegistry?.findings).filter(finding=>list(finding.programIds).includes(entry?.id)||finding.programId===entry?.id);
    const openPolicies=list(model?.policyReview).filter(policy=>!['verified','confirmed','resolved','not-applicable'].includes(policy.status));
    return {id:route.id,parentId:route.parentId||null,title:route.title,url,discoveryStatus:url?'exact-program-url-known':'exact-program-url-missing',level:route.level||model?.level||null,modality,catalog:model?.catalog||null,catalogYear:model?.catalogYear||null,modelId:entry?.id||null,readyTemplate:entry?.readyTemplate===true,coverage:entry?.coverage||'directory-only',sourceIds:unique(sourceIds),factIds:unique(list(registryProgram?.factIds)),findingIds:unique(findings.map(finding=>finding.id)),backlog:{openPolicyFields:unique(openPolicies.map(policy=>policy.field)),unresolvedRequirementIds:unique(list(model?.requirements).filter(requirement=>requirement.researchGap).map(requirement=>requirement.id)),unclassifiedNotes:list(model?.unresolved)}};
  });
  const exactByParent=new Map();for(const program of exactPrograms){const parent=program.parentId||program.id;if(!exactByParent.has(parent))exactByParent.set(parent,[]);exactByParent.get(parent).push(program.id);}
  // A parent listing with no delivery evidence is a discovery candidate, not an online offering.
  const discoveryCandidates=parents.map(parent=>({id:parent.id,title:parent.title,url:officialURL(parent.url,school),level:parent.level||null,knownOnlineVariantIds:unique(exactByParent.get(parent.id)||[]),deliveryStatus:list(parent.modalities).includes(modality)?'online-listed':'needs-delivery-discovery',sourceId:addSource(parent.url,{programIds:[parent.id],title:parent.title,role:'delivery-discovery'})}));
  for(const source of list(directory.sources).filter(source=>source.id===schoolId))addSource(source.url,{programIds:parents.map(parent=>parent.id),title:source.scope,role:'school-directory'});
  const sources=[...sourceMap.values()].map(source=>({...source,titles:unique(source.titles),programIds:unique(source.programIds),modelIds:unique(source.modelIds),localSourceIds:unique(source.localSourceIds),roles:unique(source.roles),affectedExactPrograms:exactPrograms.filter(program=>program.url&&program.sourceIds.includes(source.id)).length,sourceContentHash:null,captureStatus:'not-captured'})).sort((a,b)=>b.affectedExactPrograms-a.affectedExactPrograms||a.url.localeCompare(b.url));
  const jobs=sources.map(source=>({id:'capture-'+source.id,stage:source.roles.includes('delivery-discovery')&&!source.modelIds.length?'delivery-discovery':'capture-evidence',sourceId:source.id,url:source.url,kind:source.kind,priority:source.affectedExactPrograms*100+(source.kind==='academic-policy'?80:/transfer-guide/.test(source.kind)?70:source.kind==='general-education'?60:source.kind==='school-directory'?50:0),affectedProgramIds:source.programIds,affectedModelIds:source.modelIds,status:'queued'})).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const core={schemaVersion:1,school:{id:schoolId,name:school.name,officialDomains:school.officialDomains},modality,inputAsOf:curriculum.checkedOn||null,academicRegistryRevision:academicRegistry?.revision||null,scope:'All existing Liberty directory parents are included for delivery discovery. Only variants with explicit online modality and an exact program URL are counted as known online programs. Capturing a source does not verify its claims or publish a template.',summary:{directoryCandidates:discoveryCandidates.length,onlineRouteCandidates:exactPrograms.length,knownOnlinePrograms:exactPrograms.filter(program=>program.url).length,activeCurriculumModels:unique(exactPrograms.map(program=>program.modelId).filter(Boolean)).length,readyTemplates:unique(exactPrograms.filter(program=>program.readyTemplate).map(program=>program.modelId)).length,uniqueOfficialSources:sources.length,sharedExactProgramSources:sources.filter(source=>source.affectedExactPrograms>1).length,queuedJobs:jobs.length},programs:exactPrograms,deliveryDiscovery:discoveryCandidates,sources,jobs};
  return {...core,revision:'school-batch-v1:'+hash(stable(core))};
}

// Resolve and pin every redirect destination. HTTPS hostname verification remains enabled.
export function publicAddress(address){
  const version=isIP(address);if(version===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0||a>=224);}
  if(version!==6)return false;
  const value=address.toLowerCase();
  // Only global unicast; reject IPv4-mapped, loopback, link-local and documentation space.
  const words=value.split(':'),special2001=words[0]==='2001'&&(parseInt(words[1]||'0',16)<0x200||parseInt(words[1]||'0',16)===0xdb8);
  return /^[23][0-9a-f]{0,3}:/.test(value)&&!special2001&&!value.startsWith('2002:');
}
async function publicRecords(parsed,signal,resolveDNS){
  if(signal.aborted)throw new Error('Source capture timed out.');
  let abort;
  const cancelled=new Promise((_resolve,reject)=>{abort=()=>reject(new Error('Source capture timed out.'));signal.addEventListener('abort',abort,{once:true});});
  let records;try{records=await Promise.race([resolveDNS(parsed.hostname,{all:true,verbatim:true}),cancelled]);}finally{signal.removeEventListener('abort',abort);}
  if(!records.length||records.some(record=>!publicAddress(record.address)))throw new Error('Source hostname resolved to a non-public network address.');
  return records;
}
export async function pinnedResponse(url,{signal,maxBytes,resolveDNS=lookup,request=httpsRequest}){
  const parsed=new URL(url),records=await publicRecords(parsed,signal,resolveDNS);
  return new Promise((resolveResponse,reject)=>{
    const record=records[0],req=request(parsed,{method:'GET',signal,headers:{'User-Agent':'DegreeSteps-Academic-Research/1.0 (+https://degreesteps.com)','Accept':'text/html,application/pdf,text/plain;q=0.8','Accept-Encoding':'identity'},lookup:(_hostname,options,callback)=>options?.all?callback(null,[record]):callback(null,record.address,record.family)},response=>{
      const chunks=[];let bytes=0;
      if(Number(response.headers['content-length'])>maxBytes){response.destroy();reject(new Error('Source exceeds capture byte limit.'));return;}
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy(new Error('Source exceeds capture byte limit.'));}else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolveResponse({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
    });req.on('error',reject);req.end();
  });
}

// Proxy-only build environments still pin the checked destination IP. Curl
// retains the original TLS hostname and uses proxy credentials from its
// environment. Cookies and proxy settings never enter capture receipts.
export async function proxyResponse(url,{signal,maxBytes,resolveDNS=lookup,run=promisify(execFile)}){
 const address=new URL(url),records=await publicRecords(address,signal,resolveDNS);
 const destination=records[0].family===6?'['+records[0].address+']':records[0].address,folder=await mkdtemp(resolve(tmpdir(),'degreesteps-source-'));
 try{
  const headersPath=resolve(folder,'headers'),bodyPath=resolve(folder,'body');
  const args=['--silent','--show-error','--max-time','20','--max-filesize',String(maxBytes),'--proto','=https','--proto-redir','=https','--connect-to',address.hostname+':443:'+destination+':443','--user-agent','DegreeSteps-Academic-Research/1.0 (+https://degreesteps.com)','--header','Accept-Encoding: identity','--dump-header',headersPath,'--output',bodyPath,'--write-out','%{http_code}',url];
  let result;try{result=await run('curl',args,{signal,maxBuffer:65536});}catch{throw new Error(signal.aborted?'Source capture timed out.':'The proxy source request failed.');}
  const status=Number(result.stdout);if(!Number.isInteger(status)||status<100||status>599)throw new Error('Source response status is invalid.');
  const blocks=(await readFile(headersPath,'latin1')).trim().split(/\r?\n\r?\n/),headers={};
  for(const line of blocks.at(-1).split(/\r?\n/).slice(1)){const colon=line.indexOf(':');if(colon<1)continue;const key=line.slice(0,colon).trim().toLowerCase();if(['content-type','content-length','location','etag','last-modified'].includes(key))headers[key]=line.slice(colon+1).trim();}
  const body=await readFile(bodyPath);if(body.length>maxBytes)throw new Error('Source exceeds capture byte limit.');
  return {status,headers,body};
 }finally{await rm(folder,{recursive:true,force:true});}
}

export async function captureSource(source,{school=schoolConfigurations.liberty,maxBytes=8*1024*1024,timeoutMs=20000,maxRedirects=3,fetchResponse=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.ALL_PROXY||process.env.all_proxy?proxyResponse:pinnedResponse,now=()=>new Date().toISOString()}={}){
  if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxRedirects)||maxRedirects<0||maxRedirects>5)throw new Error('Capture limits exceed the bounded research contract.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);let current=officialURL(source.url,school);const redirects=[];
  try{
    for(let hop=0;hop<=maxRedirects;hop++){
      const response=await fetchResponse(current,{signal:controller.signal,maxBytes});
      if([301,302,303,307,308].includes(response.status)){
        if(hop===maxRedirects)throw new Error('Source exceeded redirect limit.');
        if(!response.headers.location)throw new Error('Source redirect has no destination.');
        const next=officialURL(new URL(response.headers.location,current).href,school);redirects.push({from:current,to:next,status:response.status});current=next;continue;
      }
      if(response.status!==200)throw new Error('Source returned HTTP '+response.status+'.');
      if(!response.body?.length||response.body.length>maxBytes)throw new Error('Source body is empty or exceeds the capture byte limit.');
      const contentType=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      if(!['text/html','application/xhtml+xml','text/plain','application/pdf','application/json'].includes(contentType))throw new Error('Source did not return an allowed academic document type.');
      const body=Buffer.from(response.body),sourceContentHash='sha256:'+hash(body);
      return {receipt:{schemaVersion:1,sourceId:source.id,url:source.url,finalUrl:current,redirects,status:'captured',sourceContentHash,capturedAt:now(),bytes:body.length,contentType,reviewStatus:'unreviewed',evidenceEffect:'none',etag:response.headers.etag||null,lastModified:response.headers['last-modified']||null},body};
    }
  }finally{clearTimeout(timeout);}
}

export async function captureBatch(manifest,{outputDir,limit=5,concurrency=2,capture=captureSource,now=()=>new Date().toISOString()}={}){
  if(!outputDir||!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Capture requires an output directory, 1–10 sources and concurrency 1–4.');
  const sources=new Map(manifest.sources.map(source=>[source.id,source])),selected=manifest.jobs.slice(0,limit),results=new Array(selected.length);let next=0;
  await mkdir(resolve(outputDir,'bodies'),{recursive:true});
  await Promise.all(Array.from({length:Math.min(concurrency,selected.length)},async()=>{while(next<selected.length){const index=next++,job=selected[index],source=sources.get(job.sourceId);try{const {receipt,body}=await capture(source,{school:manifest.school,now});const file=receipt.sourceContentHash.replace(':','-')+(receipt.contentType==='application/pdf'?'.pdf':receipt.contentType==='text/plain'?'.txt':receipt.contentType==='application/json'?'.json':'.html');await writeFile(resolve(outputDir,'bodies',file),body);results[index]={...receipt,bodyPath:'bodies/'+file,jobId:job.id};}catch(error){results[index]={sourceId:job.sourceId,url:job.url,jobId:job.id,status:'capture-failed',capturedAt:now(),message:String(error.message).slice(0,500),reviewStatus:'unreviewed',evidenceEffect:'none'};}}}));
  const receipt={schemaVersion:1,batchRevision:manifest.revision,schoolId:manifest.school.id,startedScope:'Top '+selected.length+' queued official sources; no AI calls and no claim verification.',capturedSources:results.filter(result=>result.status==='captured').length,failedSources:results.filter(result=>result.status!=='captured').length,results};
  await writeFile(resolve(outputDir,'capture-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

export async function runSchoolResearchBatch({base=ROOT,check=false,capture=false,limit=5,concurrency=2,outputDir=resolve(base,'outputs/research-batches/liberty-online')}={}){
  const read=async path=>JSON.parse(await readFile(resolve(base,path),'utf8'));
  const [{models},directory,curriculum,pathways,aliasDocument]=await Promise.all([readAcademicInputs(base),read('dist/data/program-catalog.json'),read('dist/data/curriculum-registry.json'),read('dist/data/pathways.json'),read('dist/data/degree-link-aliases.json')]);
  let academicRegistry=null;try{academicRegistry=await read('dist/data/academic-registry.json');}catch(error){if(error.code!=='ENOENT')throw error;}
  const manifest=buildSchoolResearchBatch({directory,curriculum,pathways,models,academicRegistry,degreeLinkAliases:aliasDocument.aliases});
  const path=resolve(base,schoolBatchPath),serialized=JSON.stringify(manifest,null,2)+'\n';
  if(check){if(await readFile(path,'utf8')!==serialized)throw new Error(schoolBatchPath+' is stale.');}else{await mkdir(dirname(path),{recursive:true});await writeFile(path,serialized);}
  if(capture){await mkdir(outputDir,{recursive:true});await writeFile(resolve(outputDir,'manifest.json'),serialized);const receipt=await captureBatch(manifest,{outputDir,limit,concurrency});return {manifest,receipt,outputDir:relative(base,outputDir)};}
  return {manifest};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=key=>{const index=args.indexOf(key);return index<0?undefined:args[index+1];};
  const result=await runSchoolResearchBatch({check:args.includes('--check'),capture:args.includes('--capture'),limit:Number(value('--limit')||5),concurrency:Number(value('--concurrency')||2)});
  console.log(JSON.stringify({revision:result.manifest.revision,...result.manifest.summary,...(result.receipt?{capturedSources:result.receipt.capturedSources,failedSources:result.receipt.failedSources,outputDir:result.outputDir}:{}),checked:args.includes('--check')}));
}
