/** Independent ACE/provider identities joined to separately reviewed Liberty awards. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const list=value=>Array.isArray(value)?value:[],unique=value=>[...new Set(value)];
export const libertyHealthUpperReviewPath='content/curricula/snapshots/liberty/health-upper-provider-identities-2026-11-18-reviewed.json';
const modelId='curriculum-liberty-healthcare-administration-bs-online';
const day=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const key=value=>String(value||'').replace(/\s+/g,'').toUpperCase();
function officialURL(value,domains){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&domains.includes(url.hostname);}catch{return false;}}
export async function readLibertyHealthUpperReview(base=root){return validateLibertyHealthUpperReview(JSON.parse(await readFile(resolve(base,libertyHealthUpperReviewPath),'utf8')));}
export function validateLibertyHealthUpperReview(review){
 assert(review?.version===1&&review.modelId===modelId&&review.school==='Liberty University'&&review.catalogYear==='2026-2027'&&review.format==='Online'&&review.creditSystem==='semester'&&day(review.checkedOn),'Use the exact reviewed healthcare identity packet.');
 assert(Array.isArray(review.sources)&&Array.isArray(review.courses)&&review.courses.length>0,'Healthcare review needs independent sources and courses.');
 const sources=new Map();
 for(const source of review.sources){assert(typeof source.id==='string'&&!sources.has(source.id)&&source.checked===review.checkedOn&&/^[a-f0-9]{64}$/.test(source.sha256||''),'Reviewed sources need their actual captured byte digest and date.');assert(officialURL(source.url,['www.acenet.edu','acenet.edu','study.com','www.study.com','www.liberty.edu']),'Use official ACE, provider and Liberty sources.');sources.set(source.id,source);}
 const seen=new Set();
 for(const course of review.courses){
  assert(/^SDCM-\d{4}$/.test(course.code)&&/^Health 3\d\d$/.test(course.providerCourseCode)&&/^(BUSI|INFO) [34]\d\d$/.test(course.receivingCode)&&!seen.has(course.code),'Use unique exact healthcare course identities.');seen.add(course.code);
  assert(course.provider==='Study.com'&&course.sourceCredits===3&&course.sourceCreditSystem==='semester'&&course.receivingCredits===3&&course.sourceUpper===true&&Number.isInteger(course.aceVersion)&&course.aceVersion>0,'Independent source and receiving quantities must remain explicit.');
  assert(day(course.recommendationStart)&&day(course.recommendationEnd)&&course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn&&course.minScore===70,'Use the active, source-bound ACE recommendation window and passing score.');
  assert(officialURL(sources.get(course.aceSourceId)?.url,['www.acenet.edu','acenet.edu'])&&officialURL(sources.get(course.guideSourceId)?.url,['www.liberty.edu']),'Each course needs independent ACE identity and a receiving-school award.');
  const authority=sources.get(course.aceSourceId),facts=authority.reviewedFacts;
  assert(authority.kind==='ace'&&authority.aceId===course.code&&authority.aceVersion===course.aceVersion&&facts?.providerCourseCode===course.providerCourseCode&&facts.sourceCredits===course.sourceCredits&&facts.sourceCreditSystem===course.sourceCreditSystem&&facts.sourceLevel==='upper-division-baccalaureate'&&facts.minimumPassingScore===course.minScore&&facts.recommendationStart===course.recommendationStart&&facts.recommendationEnd===course.recommendationEnd,'Independent quantities, version and dates must bind to this exact ACE record.');
  assert(officialURL(course.providerCourseUrl,['study.com','www.study.com'])&&(!course.providerSourceId||officialURL(sources.get(course.providerSourceId)?.url,['study.com','www.study.com'])),'Provider offering links and any captured provider evidence must use the real provider.');
  assert(Number.isInteger(course.guidePage)&&course.guidePage>0&&typeof course.guideExtract==='string'&&course.guideExtract.includes(course.code)&&course.guideExtract.includes(course.receivingCode)&&course.guideExtract.replace(/\s+/g,' ').includes(course.providerCourseCode),'Bind the actual named award to its guide page.');
 }
 return review;
}
export function applyLibertyHealthUpperIdentities(input,review){
 if(input?.id!==modelId)return input;
 validateLibertyHealthUpperReview(review);
 assert(input.school===review.school&&input.format==='Online'&&String(input.catalogYear||input.catalog).replace(/[–—]/g,'-')==='2026-2027'&&input.creditSystem==='semester'&&input.totalCredits===120,'Healthcare identity review cannot cross program, format, catalog or units.');
 const model=copy(input),sources=new Map(list(model.sources).map(source=>[source.id,source]));
 for(const source of review.sources)sources.set(source.id,copy(source));
 let placements=0;
 for(const course of review.courses){
  const rows=model.requirements.filter(row=>key(row.code)===key(course.receivingCode));assert(rows.length===1,'Reviewed named healthcare requirement changed: '+course.receivingCode);
  const row=rows[0];assert(row.credits===course.receivingCredits&&!row.institutionalOnly&&!row.researchGap,'A reviewed outside award cannot replace institution-only or differently sized work.');
  const existing=list(row.options).find(option=>option.provider==='Study.com'&&key(option.code)===key(course.code)&&key(option.receivingCode||row.code)===key(course.receivingCode));
  const id=existing?.id||'study-health-reviewed-'+course.code.toLowerCase();
  const independent=[course.aceSourceId,...(course.providerSourceId?[course.providerSourceId]:[])],guideSource=sources.get(course.guideSourceId);
  const option={id,provider:'Study.com',code:course.code,providerCourseCode:course.providerCourseCode,codeAliases:[course.providerCourseCode],codeAliasEvidence:[{alias:course.providerCourseCode,sourceIds:independent}],title:course.title,receivingCode:course.receivingCode,receivingTitle:row.title,credits:course.receivingCredits,creditSystem:'semester',sourceCredits:course.sourceCredits,sourceCreditSystem:'semester',sourceCreditStatus:'reviewed-independent-recommendation',sourceCreditBasis:'The current ACE record independently identifies the issuer, provider course code, quantity and recommendation period; receiving placement is separately sourced.',sourceUpper:true,upper:true,creditOrigin:'alternative',sourceType:'ACE',evidence:'published',evidenceType:'official-receiving-school-equivalency',sourceIds:unique([course.guideSourceId,...list(row.sourceIds)]),identitySourceIds:independent,courseVersion:String(course.aceVersion),recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,recommendationPeriodSourceIds:[course.aceSourceId],minScore:course.minScore,providerCoursePassingPercent:course.minScore,providerCoursePassingSourceIds:[course.aceSourceId],mappingChecked:review.checkedOn,mappingReviewId:review.id,mappingResearchClosed:true,receivingMapStatus:'published-online-receiving-award',mappingScope:'Exact named award in Liberty’s online guide, joined to this catalog’s named healthcare requirement and independently reviewed current source identity.',sourcePage:course.guidePage,url:guideSource.url,courseUrl:course.providerCourseUrl,eligibilityReview:{status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window',sourceIds:independent},degreePlacementEvidence:{modelId,catalogYear:'2026-2027',modality:'online',requirementId:row.id,receivingCode:course.receivingCode,credits:3,creditSystem:'semester',sourceIds:list(row.sourceIds)},conditions:['Complete this exact ACE course version within '+course.recommendationStart+' through '+course.recommendationEnd+'.','Submit the official learning record for Liberty’s individual award and avoid duplicate credit.',...(row.minimumGrade?['Meet the published '+row.minimumGrade+' minimum for this major requirement; no student grade is assumed.']:[])]};
  row.options=[...list(row.options).filter(item=>!(item.provider==='Study.com'&&key(item.code)===key(course.code)&&key(item.receivingCode||row.code)===key(course.receivingCode))),option];placements++;
 }
 model.sources=[...sources.values()];model.healthUpperIdentityReview={id:review.id,checkedOn:review.checkedOn,placements,personalAwardsCreated:0};
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120,'A reviewed course choice cannot change degree quantities.');
 return model;
}
