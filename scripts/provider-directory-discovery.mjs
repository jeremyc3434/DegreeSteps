/**
 * Provider directories create research leads, never transfer awards or degree templates.
 *
 * Offline: node scripts/provider-directory-discovery.mjs [--check]
 * Import reviewed facts: node scripts/provider-directory-discovery.mjs --import-source source.json
 * Explicit operator refresh: node scripts/provider-directory-discovery.mjs --refresh --as-of YYYY-MM-DD
 *
 * The normal build is deterministic and makes no network requests. Refresh is opt-in,
 * host-allowlisted, bounded, and preserves last-good observations on blocked/dynamic pages.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const snapshotPath='content/research-batches/provider-directory-snapshots.json';
const outputPaths=['content/research-batches/provider-directory-candidates.json','dist/data/provider-directory-candidates.json'];
const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const digest=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>text(value).replace(/\s+/g,' ');
const day=value=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(text(value)))return null;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;};
const clone=value=>JSON.parse(JSON.stringify(value));
const relations=new Set(['matrix-listed','directory-listed','transcript-recipient','claimed-partner']);
const statuses=new Set(['extracted','partial','limited','blocked','dynamic','unavailable']);
export const DIRECTORY_SOURCES=Object.freeze([
 {id:'study-school-directory',label:'Study.com school directory',provider:'Study.com',url:'https://study.com/college/school/index.html',adapter:'unavailable',official:true},
 {id:'sophia-school-directory',label:'Sophia school finder',provider:'Sophia',url:'https://www.sophia.org/find-your-school/',adapter:'unavailable',official:true},
 {id:'saylor-credit-directory',label:'Saylor credit partners',provider:'Saylor',url:'https://www.saylor.org/Partners/Credit',adapter:'unavailable',official:true},
 {id:'straighterline-colleges',label:'StraighterLine college directory',provider:'StraighterLine',url:'https://www.straighterline.com/colleges/',adapter:'straighterline-links',official:true},
 {id:'hfcc-provider-directory',label:'Homeschooling for College Credit provider matrix',provider:null,url:'https://homeschoolingforcollegecredit.org/partnership-colleges-by-provider/',adapter:'hfcc-matrix',official:false}
]);
const sourceById=new Map(DIRECTORY_SOURCES.map(source=>[source.id,source]));
const providers=new Set(DIRECTORY_SOURCES.map(source=>source.provider).filter(Boolean));
const entities={amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘'};
export function decodeHtml(value){return String(value).replace(/&#(x[\da-f]+|\d+);|&([a-z]+);/gi,(all,number,name)=>{if(number){const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):parseInt(number,10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}return entities[name.toLowerCase()]??all;});}
const strip=value=>clean(decodeHtml(String(value).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ')));
function schoolName(value){const name=clean(value);if(name.length<3||name.length>200||/[<>\u0000-\u001f]/.test(name))throw Error('Use a plain, bounded institution name.');return name;}
export function schoolIdentity(value){
 // Acronyms supplied beside a full name are aliases, not different institutions.
 // Keep locations/divisions and similar campus/system names distinct.
 return clean(value).replace(/\s*\((?:WGU|UMPI|UMGC|TESU|COSC|GCU|LU)\)\s*$/i,'').replace(/^The\s+/i,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function secure(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function observationKey(value){return [value.sourceId,value.provider,clean(value.name).toLowerCase(),value.relation,value.url].join('|');}
function deduplicateObservations(records){
 // Retain observed name variants for identity review; only collapse the same
 // provider/name/source relation. Stable latest-date ties avoid import-order drift.
 const sorted=[...records].sort((a,b)=>observationKey(a).localeCompare(observationKey(b))||a.observedOn.localeCompare(b.observedOn)||JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return [...new Map(sorted.map(record=>[observationKey(record),record])).values()].sort((a,b)=>observationKey(a).localeCompare(observationKey(b)));
}
function sourceDateFromMatrix(html){const caption=strip(html.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]||'');const found=caption.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);return found?day(found[3]+'-'+found[1]+'-'+found[2]):null;}

export function parseHfccMatrix(html,{checkedOn,sourceDate=sourceDateFromMatrix(html)}={}){
 if(!day(checkedOn))throw Error('Record the actual directory review date.');
 if(typeof html!=='string'||Buffer.byteLength(html)>3*1024*1024)throw Error('Use a provider directory under 3 MiB.');
 const table=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].find(([,value])=>/Study\.com/i.test(value)&&/Sophia\.org/i.test(value)&&/Straighterline\.com/i.test(value));
 if(!table)throw Error('The expected provider matrix was not found; keep the previous observations.');
 const rows=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)],head=[...(rows[0]?.[1]||'').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(([,value])=>strip(value));
 const expected=['College','Study.com','Sophia.org','Saylor.org','Straighterline.com'];
 if(head.length!==5||head.some((value,index)=>!value.toLowerCase().startsWith(expected[index].toLowerCase())))throw Error('Provider matrix columns changed; review before assigning relationships.');
 const records=[];
 for(const [,row]of rows.slice(1)){
  const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([,value])=>strip(value));
  if(!cells.length)continue;
  if(cells.length!==5)throw Error('Provider matrix row structure changed; no partial import was applied.');
  const name=schoolName(cells[0]);
  for(let index=1;index<5;index++){
   const mark=cells[index];if(!mark)continue;if(!/^x$/i.test(mark))throw Error('Unknown provider matrix marker; no acceptance was inferred.');
   records.push({sourceId:'hfcc-provider-directory',provider:['Study.com','Sophia','Saylor','StraighterLine'][index-1],name,relation:'matrix-listed',url:sourceById.get('hfcc-provider-directory').url,observedOn:checkedOn,sourceDate});
  }
 }
 if(!records.length)throw Error('The provider matrix returned no observations; keep the previous observations.');
 return deduplicateObservations(records);
}

export function parseStraighterlineDirectory(html,{checkedOn}={}){
 if(!day(checkedOn))throw Error('Record the actual directory review date.');
 if(typeof html!=='string'||Buffer.byteLength(html)>3*1024*1024)throw Error('Use a provider directory under 3 MiB.');
 const visible=html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' '),records=[];
 for(const [,rawUrl,body]of visible.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  let url;try{url=new URL(decodeHtml(rawUrl),'https://www.straighterline.com/');}catch{continue;}
  if(url.protocol!=='https:'||url.hostname!=='www.straighterline.com'||!/^\/colleges\/[a-z0-9-]+\/*$/i.test(url.pathname))continue;
  const name=strip(body);if(!name||/^(?:learn more|read more|view all|show.*|colleges)$/i.test(name))continue;
  // Do not derive an institution from a decorative card, logo alt text or slug.
  if(!/\b(?:university|universities|college|institute|academy|school|seminary)\b/i.test(name)||name.split(/\s+/).length<2)continue;
  url.pathname=url.pathname.replace(/\/+$/,'')+'/';url.hash='';url.search='';
  records.push({sourceId:'straighterline-colleges',provider:'StraighterLine',name:schoolName(name),relation:'directory-listed',url:url.href,observedOn:checkedOn,sourceDate:null});
 }
 if(!records.length)throw Error('No named college-page links were extracted; keep the previous observations.');
 return deduplicateObservations(records);
}

function normalizedSource(raw){
 const definition=sourceById.get(raw?.id);if(!definition||raw.url!==definition.url)throw Error('Use a known provider-directory source and its canonical URL.');
 if(!day(raw.checkedOn)||!statuses.has(raw.status)||text(raw.note).length>1200)throw Error('Record a valid source date, extraction status and bounded note.');
 const sourceDate=raw.sourceDate===null||raw.sourceDate===undefined?null:day(raw.sourceDate);if(raw.sourceDate&&!sourceDate)throw Error('Use an exact source publication date.');
 return {...definition,checkedOn:raw.checkedOn,status:raw.status,note:text(raw.note),sourceDate,lastAttemptOn:day(raw.lastAttemptOn)||raw.checkedOn,lastGoodOn:day(raw.lastGoodOn)||null,httpStatus:Number.isInteger(raw.httpStatus)?raw.httpStatus:null,contentSha256:/^[a-f0-9]{64}$/.test(raw.contentSha256||'')?raw.contentSha256:null};
}
export function normalizeSnapshot(input){
 if(input?.version!==1||!Array.isArray(input.sources)||!Array.isArray(input.observations)||input.sources.length>5||input.observations.length>2000)throw Error('Use a version 1 normalized directory snapshot with bounded sources and observations.');
 const sources=input.sources.map(normalizedSource),sourceMap=new Map(sources.map(source=>[source.id,source]));if(sourceMap.size!==sources.length)throw Error('A source appears more than once.');
 const observations=input.observations.map(raw=>{
  const allowed=new Set(['sourceId','provider','name','relation','url','observedOn','sourceDate']);
  if(!raw||Object.keys(raw).some(key=>!allowed.has(key)))throw Error('Directory observations can contain discovery facts only, not policy or publication claims.');
  const source=sourceMap.get(raw.sourceId);if(!source||!providers.has(raw.provider)||!relations.has(raw.relation)||!day(raw.observedOn))throw Error('Every observation needs its provider, source, relation and actual review date.');
  if(source.provider&&source.provider!==raw.provider)throw Error('A directory observation names the wrong provider.');
  const url=secure(raw.url);if(!url||new URL(url).hostname!==new URL(source.url).hostname)throw Error('The observation must link to its known directory host.');
  const sourceDate=raw.sourceDate?day(raw.sourceDate):null;if(raw.sourceDate&&!sourceDate)throw Error('Use an exact source publication date.');
  return {sourceId:source.id,provider:raw.provider,name:schoolName(raw.name),relation:raw.relation,url,observedOn:raw.observedOn,sourceDate};
 });
 return {version:1,sources:sources.sort((a,b)=>a.id.localeCompare(b.id)),observations:deduplicateObservations(observations)};
}

const historyNames=/\b(?:brandman|alderson broaddus|art institutes|granite state college|american sentinel|northcentral university|suny empire state college|new england institute of business)\b/i;
function afterDays(value,count){const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);}
export function assertProviderDiscovery(report){
 if(report?.schemaRevision!=='provider-directory-discovery-v1'||report?.publicationAllowed!==false||report?.summary?.eligibleStudentPlans!==0||!Array.isArray(report.candidates)||report.candidates.length>500||report.summary.candidates!==report.candidates.length)throw Error('Use a bounded, unpublished provider discovery report.');
 if(report.candidates.some(row=>!row||row.reviewStatus!=='needs-institution-review'||row.studentEligible!==false||row.publicationAllowed!==false||row.accreditation?.status!=='unreviewed'||row.accreditation?.body!==null||['totalTransferMaximum','alternativeCreditMaximum','actualMappedCredits','unit'].some(field=>row.policyReview?.[field]!==null)))throw Error('Provider discovery cannot assert accreditation, academic policy or student eligibility.');
 return report;
}
export function buildProviderDiscovery(snapshot,knownSchools=[]){
 const normalized=normalizeSnapshot(snapshot),sourceMap=new Map(normalized.sources.map(source=>[source.id,source]));
 const known=new Map();for(const school of list(knownSchools))if(school?.id&&school?.name&&!known.has(schoolIdentity(school.name)))known.set(schoolIdentity(school.name),school.id);
 const rows=new Map();
 for(const observation of normalized.observations){
  const identity=schoolIdentity(observation.name),source=sourceMap.get(observation.sourceId);let candidate=rows.get(identity);
  if(!candidate){candidate={id:'provider-school-'+digest(identity).slice(0,16),name:observation.name,observedNames:[],providers:[],sourceIds:[],sourceEvidence:[],reviewStatus:'needs-institution-review',accreditation:{status:'unreviewed',body:null},operatingStatus:'unreviewed',campusScope:'unreviewed',policyReview:{totalTransferMaximum:null,alternativeCreditMaximum:null,actualMappedCredits:null,unit:null},knownSchoolId:known.get(identity)||null,reviewFlags:[],studentEligible:false,publicationAllowed:false,nextActions:[{id:'verify-institution',label:'Verify current institution identity, operating status and regional institutional accreditation.'},{id:'verify-provider-scope',label:'Review the receiving university’s exact provider policy, program and campus or online scope.'},{id:'map-degree',label:'Map exact course requirements, alternative-credit caps, residency and source versions.'},{id:'apply-readiness-gates',label:'Run the existing degree-model evidence and completeness checks before any student publication.'}]};rows.set(identity,candidate);}
  candidate.observedNames.push(observation.name);candidate.providers.push(observation.provider);candidate.sourceIds.push(observation.sourceId);
  candidate.sourceEvidence.push({sourceId:observation.sourceId,provider:observation.provider,url:observation.url,relation:observation.relation,checkedOn:observation.observedOn,sourceDate:observation.sourceDate,historical:!!observation.sourceDate&&observation.sourceDate<observation.observedOn,sourceAccessStatus:source.status});
  if(observation.sourceDate&&observation.sourceDate<observation.observedOn)candidate.reviewFlags.push('historical-source-needs-current-policy');
  if(historyNames.test(observation.name))candidate.reviewFlags.push('historical-name-or-status-review');
  if(observation.relation==='transcript-recipient')candidate.reviewFlags.push('transcript-receipt-is-not-acceptance');
  if(['blocked','dynamic','unavailable'].includes(source.status))candidate.reviewFlags.push('source-currently-unavailable');
 }
 const unique=values=>[...new Set(values)].sort();
 const candidates=[...rows.values()].map(candidate=>({...candidate,observedNames:unique(candidate.observedNames),providers:unique(candidate.providers),sourceIds:unique(candidate.sourceIds),reviewFlags:unique(candidate.reviewFlags),sourceEvidence:[...new Map(candidate.sourceEvidence.map(value=>[JSON.stringify(value),value])).values()].sort((a,b)=>(a.sourceId+a.url+a.relation).localeCompare(b.sourceId+b.url+b.relation))})).sort((a,b)=>Number(!!b.knownSchoolId)-Number(!!a.knownSchoolId)||a.name.localeCompare(b.name));
 if(candidates.length>500)throw Error('More than 500 candidates need an explicit bounded research batch.');
 const sources=normalized.sources.map(source=>({...source,nextReviewOn:afterDays(source.lastAttemptOn,30),observations:normalized.observations.filter(value=>value.sourceId===source.id).length}));
 const asOf=sources.map(source=>source.lastAttemptOn).sort().at(-1)||null;
 const report={schemaRevision:'provider-directory-discovery-v1',revision:'',asOf,scope:'Internal discovery leads only. Listed, claimed partner and transcript-recipient evidence does not establish transfer acceptance, regional accreditation, campus availability or a complete degree plan.',summary:{sources:sources.length,candidates:candidates.length,providerRelationships:candidates.reduce((sum,candidate)=>sum+candidate.providers.length,0),blockedSources:sources.filter(source=>source.status==='blocked').length,limitedSources:sources.filter(source=>source.status!=='extracted').length,eligibleStudentPlans:0,knownSchoolCandidates:candidates.filter(candidate=>candidate.knownSchoolId).length},methodology:{sourceReviewCadenceDays:30,preferredAlternativeCreditFraction:0.5,lowerTransferReviewFraction:0.25,thresholdMeaning:'Research priorities only. A lower-transfer route can be valuable for a desired campus; neither percentage overrides evidence, source caps, or student goals.',accreditationGate:'Verify current accreditation by the user-approved regional institutional accrediting bodies. All directory-only candidates remain unreviewed.',capSeparation:'Overall transfer ceiling, ACE/noncollegiate combined allowance and actually mapped degree credits are independent facts.',studentVisibility:'No discovery candidate enters the degree picker or becomes a ready template from this artifact.',identity:'Conservative exact-name/acronym normalization. Similar systems, campuses, online divisions and historical names are not silently merged.',sourceCounts:'Provider marketing counts and transcript recipients are not verified acceptance totals.'},sources,candidates,publicationAllowed:false,privateStudentRecordsIncluded:false,runtimeAiCalls:0};
 report.revision='provider-directory-discovery-v1:'+digest(JSON.stringify(report));return assertProviderDiscovery(report);
}

/** Merge a bounded source import without replacing another source or losing old leads. */
export function mergeSourceSnapshot(existing,update){
 const old=normalizeSnapshot(existing),next=normalizeSnapshot(update);
 if(next.sources.length!==1)throw Error('Import exactly one reviewed directory source at a time.');
 const source=next.sources[0],prior=old.sources.find(value=>value.id===source.id),hasFacts=next.observations.length>0;
 const keepGood=!hasFacts&&prior?.lastGoodOn;
 const mergedSource=keepGood?{...source,lastGoodOn:prior.lastGoodOn,note:(source.note+' Last-good observations are retained with their original dates.').slice(0,1200)}:source;
 return normalizeSnapshot({version:1,sources:[...old.sources.filter(value=>value.id!==source.id),mergedSource],observations:[...old.observations,...next.observations]});
}

export async function fetchDirectorySource(definition,{fetcher=globalThis.fetch,signal}={}){
 if(!definition||sourceById.get(definition.id)?.url!==definition.url)throw Error('Refresh only a registered directory source.');
 const allowedHosts=new Set(DIRECTORY_SOURCES.map(source=>new URL(source.url).hostname));let url=definition.url;
 for(let redirects=0;redirects<=3;redirects++){
  const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||!allowedHosts.has(target.hostname))throw Error('Directory refresh left the approved HTTPS source hosts.');
  const response=await fetcher(url,{redirect:'manual',signal,headers:{'User-Agent':'DegreeSteps-Directory-Research/1.0','Accept':'text/html'}});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw Error('Directory redirect did not supply a location.');url=new URL(location,url).href;continue;}
  if(!response.ok)return {status:response.status,url,html:''};
  if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||''))throw Error('Directory refresh did not return HTML.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>3*1024*1024){await reader.cancel();throw Error('Directory response exceeded 3 MiB.');}chunks.push(part.value);}}finally{reader.releaseLock();}
  return {status:response.status,url,html:Buffer.concat(chunks.map(value=>Buffer.from(value))).toString('utf8')};
 }throw Error('Directory exceeded its redirect limit.');
}
export async function refreshDirectorySnapshot(existing,{asOf,fetcher=globalThis.fetch}={}){
 if(!day(asOf))throw Error('An explicit --as-of date is required for source refresh.');let snapshot=normalizeSnapshot(existing);
 for(const definition of DIRECTORY_SOURCES){
  const prior=snapshot.sources.find(value=>value.id===definition.id),base={...definition,checkedOn:prior?.checkedOn||asOf,lastAttemptOn:asOf,lastGoodOn:prior?.lastGoodOn||null,sourceDate:prior?.sourceDate||null,status:'unavailable',note:'',httpStatus:null};let observations=[];
  try{
   const result=await fetchDirectorySource(definition,{fetcher,signal:AbortSignal.timeout(15000)});base.httpStatus=result.status;
   if(result.status!==200){base.status='blocked';base.note='The source returned HTTP '+result.status+'. No acceptance or withdrawal was inferred.';}
   else if(definition.adapter==='unavailable'){base.status='dynamic';base.note='This directory needs a reviewed structured extraction. Its marketing text is not an institution-level acceptance list.';}
   else{observations=definition.adapter==='hfcc-matrix'?parseHfccMatrix(result.html,{checkedOn:asOf}):parseStraighterlineDirectory(result.html,{checkedOn:asOf});base.status=definition.adapter==='hfcc-matrix'?'limited':'partial';base.checkedOn=asOf;base.lastGoodOn=asOf;base.sourceDate=definition.adapter==='hfcc-matrix'?sourceDateFromMatrix(result.html):null;base.contentSha256=digest(result.html);base.note=definition.adapter==='hfcc-matrix'?'Historical third-party matrix. Every relationship needs current receiving-school confirmation.':'Named provider college-page links only. This extraction is not an exhaustive partnership or acceptance inventory.';}
  }catch(error){base.status='unavailable';base.note='Refresh did not replace the previous observations: '+String(error?.message||'source unavailable').slice(0,600);}
  snapshot=mergeSourceSnapshot(snapshot,{version:1,sources:[base],observations});
 }return snapshot;
}

export async function readProviderDirectoryInputs(){
 const snapshot=JSON.parse(await readFile(resolve(root,snapshotPath),'utf8'));
 const catalog=JSON.parse(await readFile(resolve(root,'dist/data/program-catalog.json'),'utf8')),insights=JSON.parse(await readFile(resolve(root,'content/school-insights.json'),'utf8'));
 return {snapshot,knownSchools:[...list(catalog.schools),...list(insights.schools)]};
}
export async function buildProviderDirectoryFiles({check=false}={}){
 const {snapshot,knownSchools}=await readProviderDirectoryInputs(),report=buildProviderDiscovery(snapshot,knownSchools),bytes=JSON.stringify(report,null,2)+'\n';
 for(const file of outputPaths){const path=resolve(root,file);if(check){if(await readFile(path,'utf8')!==bytes)throw Error('Provider discovery artifact is stale: '+file);}else{await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}}
 return {revision:report.revision,summary:report.summary,outputs:outputPaths,check};
}
async function main(args){
 if(args.length===0||args.length===1&&args[0]==='--check'){console.log(JSON.stringify(await buildProviderDirectoryFiles({check:args[0]==='--check'})));return;}
 if(args.length===2&&args[0]==='--import-source'){
  const {snapshot}=await readProviderDirectoryInputs(),update=JSON.parse(await readFile(resolve(args[1]),'utf8')),merged=mergeSourceSnapshot(snapshot,update);await writeFile(resolve(root,snapshotPath),JSON.stringify(merged,null,2)+'\n');console.log(JSON.stringify(await buildProviderDirectoryFiles()));return;
 }
 if(args.length===3&&args[0]==='--refresh'&&args[1]==='--as-of'){
  const {snapshot}=await readProviderDirectoryInputs(),updated=await refreshDirectorySnapshot(snapshot,{asOf:args[2]});await writeFile(resolve(root,snapshotPath),JSON.stringify(updated,null,2)+'\n');console.log(JSON.stringify(await buildProviderDirectoryFiles()));return;
 }
 throw Error('Usage: node scripts/provider-directory-discovery.mjs [--check | --import-source file.json | --refresh --as-of YYYY-MM-DD]');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main(process.argv.slice(2));
