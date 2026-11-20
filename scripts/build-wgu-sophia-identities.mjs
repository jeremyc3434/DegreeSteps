/** Independent Sophia identities only; receiving-school awards are deliberately excluded. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=resolve(import.meta.dirname,'..');
const copy=value=>JSON.parse(JSON.stringify(value));
const unique=values=>[...new Set(values)];
const date=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&new Date(value).toISOString().slice(0,10)===value;
export const outputPath='content/reuse/wgu-sophia-provider-identities.json';
export const inputPaths={liberty:'content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json',gcu:'content/research/gcu-sophia-review-2026-11-19.json'};
export function buildSophiaIdentityBundle({liberty,gcu}){
 assert(liberty.version===1&&liberty.id==='sophia-liberty-baseline-identities-2026-11-18'&&liberty.checkedOn==='2026-11-18');
 assert(gcu.schemaVersion===1&&gcu.checkedOn==='2026-11-19'&&Array.isArray(gcu.sourceIdentities));
 const sources=new Map(),courses=new Map();
 function add(input,review,kind){
  const refs=new Map(review.sources.map(source=>[source.id,source]));
  const code=input.aceId,version=input.aceVersion,ids=unique([...(input.identitySourceIds||[]),...(input.recommendationPeriodSourceIds||[])]);
  assert(/^SOPH-\d{4}$/.test(code)&&input.activeOffering===true&&Number.isInteger(version)&&version>0,'Identity needs its reviewed current exact ACE code and version.');
  assert(input.sourceCreditSystem==='semester'&&Number.isFinite(input.sourceCredits)&&input.sourceCredits>0&&typeof input.sourceUpper==='boolean','Original provider quantities must be explicitly reviewed, never inferred from a receiving award.');
  assert(date(input.recommendationStart)&&date(input.recommendationEnd)&&input.recommendationStart<='2026-11-20'&&input.recommendationEnd>='2026-11-20','Use the actual current recommendation period.');
  if(kind==='gcu')assert(input.status==='current-ace-identity-reviewed');
  assert(ids.length&&ids.every(id=>refs.has(id)),'All independent identity sources must remain bound.');
  const rename=id=>'wgu-global-sophia--'+id;
  for(const id of ids){
   const old=refs.get(id),url=new URL(old.url),host=url.hostname;
   assert(url.protocol==='https:'&&!url.username&&!url.password&&(host==='sophia.org'||host.endsWith('.sophia.org')||host==='acenet.edu'||host==='www.acenet.edu'),'University or partner mapping alone cannot establish a provider identity.');
   const source={...copy(old),id:rename(id),kind:host==='acenet.edu'||host==='www.acenet.edu'?'ace':'provider',roles:['provider-identity'],provider:'Sophia',originalSourceId:id};
   const previous=sources.get(source.id);assert(!previous||JSON.stringify(previous)===JSON.stringify(source),'Conflicting independent source metadata.');sources.set(source.id,source);
  }
  const course={provider:'Sophia',title:input.title,code,aceId:code,providerCourseCode:input.providerCourseCode,codeAliases:[input.providerCourseCode],sourceCredits:input.sourceCredits,sourceCreditSystem:'semester',sourceUpper:input.sourceUpper,creditOrigin:'alternative',sourceType:'alternative',url:input.courseUrl,identitySourceIds:ids.map(rename),sourceCreditStatus:'verified',sourceCreditVerification:{credits:input.sourceCredits,creditSystem:'semester',sourceIds:ids.map(rename)},sourceCreditBasis:'Exact original Sophia/ACE identity and semester quantity from independently reviewed provider or accreditor records; receiving-school mappings are excluded.',courseVersion:version,recommendationStart:input.recommendationStart,recommendationEnd:input.recommendationEnd,recommendationPeriodSourceIds:(input.recommendationPeriodSourceIds||[]).map(rename),identityCheckedOn:input.providerIdentityReviewedOn||review.checkedOn,identityReviewId:kind==='gcu'?gcu.id:liberty.id,...(input.minimumPassingScore?{providerCoursePassingPercent:input.minimumPassingScore}:{}),...(input.providerCourseEffectiveDates||input.providerPublishedCourseEffectiveDates?{providerCourseEffectiveDates:input.providerCourseEffectiveDates||input.providerPublishedCourseEffectiveDates}:{})};
  assert(course.providerCourseCode&&course.url&&course.title);
  const previous=courses.get(code);
  if(previous){assert(previous.sourceCredits===course.sourceCredits&&previous.sourceCreditSystem===course.sourceCreditSystem&&previous.courseVersion===course.courseVersion&&previous.recommendationStart===course.recommendationStart&&previous.recommendationEnd===course.recommendationEnd,'Conflicting current provider facts require separate review.');return;}
  courses.set(code,course);
 }
 for(const course of liberty.courses)add(course,liberty,'liberty');
 for(const course of gcu.sourceIdentities)add(course,gcu,'gcu');
 assert(courses.size===18,'Changed independent review coverage needs deliberate review.');
 return {version:1,id:'wgu-sophia-independent-provider-identities-20261120',provider:'Sophia',checkedOn:'2026-11-20',scope:'Global independent provider identities. Original source credit quantities, identifiers, recommendation periods and current offering evidence only; no WGU or other receiving-school award is inherited.',notes:['No course was admitted merely because a receiving award was published.','Other approved Sophia source codes still require independent issuer-identity research; this bundle does not claim exhaustive Sophia coverage.'],sources:[...sources.values()].sort((a,b)=>a.id.localeCompare(b.id)),courses:[...courses.values()].sort((a,b)=>a.code.localeCompare(b.code)),inputFingerprints:Object.fromEntries(Object.entries({liberty,gcu}).map(([name,input])=>[name,createHash('sha256').update(JSON.stringify(input)).digest('hex')])),studentCreditsAwarded:0,publicationDecisionsMade:0};
}
export async function run({check=false}={}){
 const inputs=Object.fromEntries(await Promise.all(Object.entries(inputPaths).map(async([name,path])=>[name,JSON.parse(await readFile(resolve(ROOT,path),'utf8'))])));
 const bundle=buildSophiaIdentityBundle(inputs),path=resolve(ROOT,outputPath),body=JSON.stringify(bundle,null,2)+'\n';
 if(check)assert.equal(await readFile(path,'utf8'),body,'Independent Sophia identities are stale.');else{await mkdir(dirname(path),{recursive:true});await writeFile(path,body);}
 return {courses:bundle.courses.length,sources:bundle.sources.length,check};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
