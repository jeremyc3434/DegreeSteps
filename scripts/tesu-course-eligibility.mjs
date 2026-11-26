/** Exact course awards do not change TESU's separate provider-directory status. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadKit,sourceIndex,root} from './pathway-factory/lib.mjs';
import {periodOptions,optionCourseId} from './import-tesu-original-periods.mjs';
import {decodeEntities} from './pathway-factory/capture.mjs';

const REVIEW='tesu-exact-course-eligibility-2026-11-26',CHECKED='2026-11-26';
const TRANSCRIPT={id:'tesu-transcript-course-eligibility-2026-11-26',title:'TESU official transcript instructions distinguish source evaluation from university course awards',url:'https://www.tesu.edu/student-resources/transfer-credits/send-transcripts.php',checked:CHECKED,capture:'content/source-captures/3a196002fa16af8d.txt',kind:'university',roles:['transfer-policy','provider-policy']};
const normalize=value=>String(value||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
const sha=value=>createHash('sha256').update(value).digest('hex');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const periodReview=await read('content/pathway-kits/tesu/original-period-bindings-2026-11-26.json');
export const reviewedRows=row=>row.authored===true&&row.provider==='Sophia'&&row.evidenceType==='school-submitted-equivalency'&&row.extra?.mappingResearchClosed===true&&row.extra?.mappingEvidence?.claimOrigin==='receiving-institution-submitted';

export async function groundedSource(source){
 assert(source&&/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture||''),'Retain the real capture for '+source?.id);
 const bytes=await readFile(resolve(root,source.capture)),body=bytes.toString('utf8'),hash=sha(bytes),meta=await read(source.capture.replace(/\.txt$/,'.json'));
 assert.equal(meta.sha256,hash,source.id+' capture/sidecar integrity');
 assert.equal(new URL(meta.finalUrl||meta.url).hostname,new URL(source.url).hostname,source.id+' actual source host');
 assert.equal(meta.status,200,source.id+' retained public source');
 for(const field of ['sha256','sourceContentHash'])if(source[field])assert.equal(source[field],hash,source.id+' '+field);
 return {source:{...source,sha256:hash,sourceContentHash:hash},body};
}

function quote(source,text,body){assert(normalize(body).includes(normalize(text)),source.id+' does not contain the reviewed claim: '+text);return {sourceId:source.id,text};}

export async function buildCourseResolution(row,{sources,catalog,transcript,policy}){
 assert(reviewedRows(row),row.id+' is not an institution-submitted authored award');
 const map=row.extra.mappingEvidence,identity=row.identity||{};
 assert.equal(map.schoolName,'Thomas Edison State University');assert.equal(map.catalogYear,'2026-2027');assert.equal(map.individualApproval,false);
 assert.equal(map.provider,row.provider);assert.equal(map.providerCourseCode,row.code);assert.equal(map.receivingCode,row.receivingCode);assert.equal(map.credits,row.credits);assert.equal(map.creditSystem,'semester');
 assert.equal(identity.courseVersion,map.courseVersion);assert.equal(identity.providerCourseCode,map.providerOrganizationCode);assert.equal(identity.sourceCreditStatus,'verified');
 const sourceCredits=identity.sourceCredits??identity.sourceCreditVerification?.credits;
 assert(Number.isFinite(sourceCredits)&&sourceCredits>0);assert.equal(identity.sourceCreditVerification.creditSystem,'semester');assert.equal(identity.sourceCreditVerification.credits,sourceCredits);
 assert(/^20\d\d-\d\d-\d\d$/.test(identity.recommendationStart||'')&&/^20\d\d-\d\d-\d\d$/.test(identity.recommendationEnd||''));
 assert(identity.recommendationStart<=CHECKED&&identity.recommendationEnd>=CHECKED,row.id+' recommendation is active on the actual review date');
 assert.equal(row.extra.eligibilityReview?.providerReviewPending,true);assert.equal(row.extra.eligibilityReview?.fullyApproved,false);
 const receivingSourceIds=[...map.sourceIds];assert(receivingSourceIds.length>0);
 const evidence=[];
 for(const id of receivingSourceIds){
  const entry=sources.get(id);assert(entry?.source.kind==='ace'&&entry.source.roles?.includes('receiving-institution-submitted-equivalency'),id+' has actual institution-submitted authority');
  const claim=row.quotes.find(q=>q.sourceId===id&&q.text.includes(map.catalogYear)&&q.text.includes(map.schoolName)&&q.text.includes(row.receivingCode));assert(claim,row.id+' exact receiving claim');
  evidence.push(quote(entry.source,claim.text,entry.body));
  const exactIdentity=row.quotes.find(q=>q.sourceId===id&&q.text.includes('ACE ID: '+row.code)&&q.text.includes('Version: '+identity.courseVersion));assert(exactIdentity,row.id+' exact source version');
  evidence.push(quote(entry.source,exactIdentity.text,entry.body));
  const original=normalize(entry.body).match(/Level Credits \(SH\) Subject (Lower|Upper)-Division Baccalaureate (\d+(?:\.\d+)?)/);assert(original,row.id+' independently printed original semester-hour quantity');assert.equal(Number(original[2]),sourceCredits);if(identity.sourceUpper!==undefined)assert.equal(identity.sourceUpper,original[1]==='Upper');evidence.push(quote(entry.source,original[0],entry.body));
 }
 const selected=periodReview.exhibits.find(exhibit=>exhibit.code===row.code);assert(selected,row.id+' has exact raw recommendation-period binding');
 const period=sources.get(selected.selectionSourceId);assert(period&&period.source.kind==='ace'&&period.source.roles.includes('recommendation-period'));assert.equal(period.source.captureFormat,'raw-html-recommendation-period-select-excerpt');assert.equal(period.source.sha256,selected.selectionSha256);
 const courseId=new URL(period.source.url).searchParams.get('cid'),options=periodOptions(period.body).flatMap(select=>select.options),matching=options.filter(option=>optionCourseId(option.value,period.source.url)===courseId?.toLowerCase());assert.equal(matching.length,1);assert.equal(matching[0].selected,true);
 const selectedOption=matching[0],dates=selectedOption.label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2})\/(\d{1,2})\/(\d{4})$/);assert(dates);const start=dates[3]+'-'+dates[1].padStart(2,'0')+'-'+dates[2].padStart(2,'0'),end=dates[6]+'-'+dates[4].padStart(2,'0')+'-'+dates[5].padStart(2,'0');assert.equal(start,identity.recommendationStart);assert.equal(end,identity.recommendationEnd);
 assert(receivingSourceIds.every(id=>new URL(sources.get(id).source.url).searchParams.get('cid')===courseId),'The award and selected recommendation period bind the same exact source exhibit');
 const tag=[...period.body.matchAll(/<option\b[^>]*>[\s\S]*?<\/option>/gi)].map(m=>m[0]).find(tag=>/\bselected\b/i.test(tag)&&decodeEntities(tag).includes(selectedOption.value));assert(tag);evidence.push(quote(period.source,tag,period.body));
 const recommendationSourceIds=[period.source.id],recommendationPeriodSelection={kind:'ace-exact-exhibit-period-option',checkedOn:CHECKED,sourceId:period.source.id,sourceHash:period.source.sha256,sourceUrl:period.source.url,courseId,courseVersion:identity.courseVersion,optionValue:selectedOption.value,periodLabel:selectedOption.label,recommendationStart:start,recommendationEnd:end};
 evidence.push(quote(transcript.source,'Please note that Sophia, LLC courses are recommended for credit by ACE and Sophia courses must come to TESU on a Credly transcript to be reviewed for transfer credit.',transcript.body));
 evidence.push(quote(policy.source,'Being an “Approved Provider” does not guarantee 100% acceptance of courses or learning experiences by TESU. These decisions are made by TESU and communicated to the approved provider.',policy.body));
 const policySourceIds=[transcript.source.id,policy.source.id],sourceIds=[...new Set([...receivingSourceIds,...policySourceIds,...recommendationSourceIds])];
 const sourceHashes=Object.fromEntries(sourceIds.map(id=>[id,sources.get(id).source.sha256]));
 return {kind:'institution-submitted-course-award',status:'resolved',reviewId:REVIEW,checkedOn:CHECKED,schoolName:map.schoolName,provider:row.provider,providerCourseCode:row.code,providerOrganizationCode:identity.providerCourseCode,courseVersion:identity.courseVersion,catalogYear:map.catalogYear,targetCatalog:catalog,receivingCode:row.receivingCode,credits:row.credits,creditSystem:row.creditSystem,creditOrigin:'alternative',sourceCredits,sourceCreditSystem:'semester',recommendationStart:identity.recommendationStart,recommendationEnd:identity.recommendationEnd,recommendationPeriodSelection,sourceIds,sourceHashes,receivingSourceIds,policySourceIds,recommendationSourceIds,quotes:evidence,individualApproval:false,providerApprovalStatusUnchanged:true,enrollmentPermission:'not-established-by-this-course-map'};
}

export async function applyTESUCourseEligibility({check=false}={}){
 const kit=await loadKit(resolve(root,'content/pathway-kits/tesu')),school=kit.school,equivalencies=kit.equivalencies,providerPolicy=await read('content/pathway-kits/tesu/provider-review-2026-11-25.json');
 const catalog=kit.programs[0].catalog;assert(kit.programs.every(program=>program.catalog===catalog),'The reviewed five programs share the exact catalog identity');
 const index=sourceIndex(kit,kit.programs[0]),sources=new Map();
 const directory=await groundedSource({...providerPolicy.source,kind:'university',roles:['provider-policy']}),policy=await groundedSource({...providerPolicy.policySource,kind:'university',roles:['provider-policy']}),transcript=await groundedSource(TRANSCRIPT);
 for(const entry of [directory,policy,transcript])sources.set(entry.source.id,entry);
 for(const source of periodReview.sources)sources.set(source.id,await groundedSource(source));
 const rows=equivalencies.equivalencies.filter(reviewedRows);assert.equal(rows.length,35,'The reviewed claim inventory is explicit: 22 prior plus 13 exact active additions');
 for(const row of rows)for(const id of row.extra.mappingEvidence.sourceIds)if(!sources.has(id))sources.set(id,await groundedSource(index.get(id)?.source));
 const claims=[];
 for(const row of rows){
  const beforeEligibility=JSON.stringify(row.extra.eligibilityReview),resolution=await buildCourseResolution(row,{sources,catalog,transcript,policy});
  row.evidence='published';row.extra.courseEligibilityResolution=resolution;
  assert.equal(JSON.stringify(row.extra.eligibilityReview),beforeEligibility,'Do not promote the generic provider status');
  claims.push({rowId:row.id,...resolution});
 }
 const providerSourceIds=new Set([...kit.providers.values()].flatMap(provider=>(provider.sources||[]).map(source=>source.id)));
 for(const {source}of sources.values()){
  const at=school.sources.findIndex(existing=>existing.id===source.id);
  if(at<0)school.sources.push(source);else school.sources[at]={...school.sources[at],...source};
  if(providerSourceIds.has(source.id)&&!(school.sourceOverrides||=[]).includes(source.id))school.sourceOverrides.push(source.id);
 }
 for(const program of kit.programs){const sourceIds=rows.flatMap(row=>[...row.sourceIds,...row.extra.courseEligibilityResolution.sourceIds]);program.modelSourceIds=[...new Set([...program.modelSourceIds,TRANSCRIPT.id,...sourceIds])];}
 // Existing historical review dates and provider flags stay intact; this packet is a separate course-specific review.
 for(const source of [providerPolicy.source,providerPolicy.policySource]){const retained=sources.get(source.id).source;Object.assign(source,{sha256:retained.sha256,sourceContentHash:retained.sourceContentHash,kind:retained.kind,roles:retained.roles});}
 const packet={kind:'tesu-exact-course-eligibility-review',version:1,id:REVIEW,checkedOn:CHECKED,schoolName:'Thomas Edison State University',scope:'Current university-submitted receiving-course awards only. Provider approval remains provisional; this does not grant student enrollment permission, individual credit, universal provider acceptance or new degree placement.',providerApprovalStatusChanged:false,individualCreditAwards:0,models:kit.programs.map(p=>({modelId:p.modelId,catalog:p.catalog})),sources:[...sources.values()].map(entry=>entry.source),claims};
 const serialize=value=>JSON.stringify(value,null,2)+'\n';
 const writes=[['content/pathway-kits/tesu/equivalencies.json',serialize(equivalencies)],['content/pathway-kits/tesu/school.json',serialize(school)],['content/pathway-kits/tesu/provider-review-2026-11-25.json',serialize(providerPolicy)],['content/pathway-kits/tesu/course-specific-eligibility-review-2026-11-26.json',serialize(packet)],...kit.programs.map(program=>{const {file,...authored}=program;return ['content/pathway-kits/tesu/programs/'+program.slug+'.json',serialize(authored)];})];
 for(const [path,text]of writes)if(check)assert.equal(await readFile(resolve(root,path),'utf8'),text,path+' is stale');else await writeFile(resolve(root,path),text);
 return {reviewId:REVIEW,exactClaims:claims.length,providerApprovalStatusChanged:false,individualCreditAwards:0,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await applyTESUCourseEligibility({check:process.argv.includes('--check')})));
