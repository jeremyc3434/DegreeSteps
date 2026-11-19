/** Reviewed receiving awards from Liberty's online guides. Provider/ACE facts
 * remain separate, and composite awards never become prorated source courses. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const reviewedOnlineAwardPath='content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json';
const root=resolve(import.meta.dirname,'..'),list=value=>Array.isArray(value)?value:[];
const copy=value=>JSON.parse(JSON.stringify(value)),key=value=>String(value||'').replace(/\s+/g,'').toUpperCase();
const normalizeLevel=value=>({associate:'associate',associates:'associate',bachelor:'bachelor',bachelors:'bachelor'})[String(value||'').toLowerCase().replace(/[^a-z]/g,'')];
const numericLevel=code=>{const match=String(code||'').match(/ ([1-4])(?:\d\d|XX)$/);return match?Number(match[1])*100:null;};
const exactCode=value=>/^[A-Z]{2,6} \d{3}$/.test(value||'');
const date=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export async function readReviewedOnlineAwards(base=root){return validateReviewedOnlineAwards(JSON.parse(await readFile(resolve(base,reviewedOnlineAwardPath),'utf8')));}
export function validateReviewedOnlineAwards(packet){
 assert(packet?.version===1&&packet.school==='Liberty University'&&packet.catalogYear==='2026-2027'&&packet.format==='Online'&&packet.creditSystem==='semester'&&date(packet.checkedOn),'Use the scoped reviewed online guide packet.');
 assert(Array.isArray(packet.sources)&&Array.isArray(packet.awards)&&Array.isArray(packet.heldAwards),'The reviewed guide packet needs sources and award rows.');
 const sources=new Map();
 for(const source of packet.sources){const url=new URL(source.url);assert(url.protocol==='https:'&&url.hostname==='www.liberty.edu'&&url.pathname.startsWith('/online/')&&url.pathname.endsWith('.pdf')&&!url.username&&!url.password,'Use official online transfer PDFs.');assert(!sources.has(source.id)&&source.modality==='online'&&source.checked===packet.checkedOn&&/^sha256:[a-f0-9]{64}$/.test(source.sourceContentHash||''),'A reviewed guide needs its actual captured body hash.');sources.set(source.id,source);}
 const seen=new Set();
 for(const award of packet.awards){
  assert(['Sophia','Study.com'].includes(award.provider)&&/^(?:SOPH|SDCM)-\d{4}$/.test(award.code)&&typeof award.providerCourseCode==='string'&&award.providerCourseCode&&typeof award.title==='string'&&award.title,'A guide award needs its exact source identity.');
  assert(/^[A-Z]{2,6} (?:\d{3}|[1-4]XX)$/.test(award.receivingCode)&&Number.isFinite(award.credits)&&award.credits>0&&award.credits<=30&&award.creditSystem==='semester','Receiving course and quantity must be explicit.');
  assert(award.sourceCredits===null&&award.sourceCreditSystem===null&&award.sourceCreditStatus==='unknown','A receiving-school guide cannot independently establish the source quantity.');
  assert(award.sourceIds.length===1&&award.sourceIds.every(id=>sources.get(id)?.provider===award.provider)&&Number.isInteger(award.sourcePage)&&award.sourcePage>0&&typeof award.reviewedExtract==='string'&&award.reviewedExtract.length>10,'Each award needs exact guide/page evidence.');
  assert(award.upper===(numericLevel(award.receivingCode)>=300),'Level follows the receiving award.');
  const identity=[award.provider,key(award.code),key(award.receivingCode)].join('|');assert(!seen.has(identity),'Duplicate receiving award.');seen.add(identity);
 }
 assert(packet.summary.singleAwardRows===packet.awards.length&&packet.summary.heldCompositeAwards===packet.heldAwards.length,'Guide coverage counts disagree.');
 return packet;
}

function permitted(award,row){
 if(row.institutionalOnly||row.researchGap||award.levelConflict||row.credits!==award.credits)return false;
 const upper=award.upper,level=numericLevel(award.receivingCode),prefix=award.receivingCode.split(' ')[0];
 if(row.upperOnly&&!upper||Number(row.minCourseLevel||row.minimumCourseLevel||0)>level||Number(row.maxCourseLevel||row.maximumCourseLevel||999)<level)return false;
 const prefixes=list(row.allowedCoursePrefixes).concat(list(row.allowedPrefixes));if(prefixes.length&&!prefixes.map(key).includes(key(prefix)))return false;
 const named=[row.code,...list(row.allowedCourseCodes)].filter(exactCode).map(key);
 return named.includes(key(award.receivingCode))||list(award.crossListedReceivingCodes).some(code=>named.includes(key(code)))||row.freeElective===true&&row.category==='electives';
}
function optionFrom(award,row,model,packet,existing){
 const sourceIds=[...award.sourceIds],requirementSources=list(row.sourceIds),receivingCode=award.receivingCode;
 const independentIdentity=list(existing?.identitySourceIds).length>0&&existing.identitySourceIds.every(id=>{
  const source=list(model.sources).find(source=>source.id===id);try{const url=new URL(source?.url);return url.protocol==='https:'&&!url.username&&!url.password&&['sophia.org','study.com','acenet.edu'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain));}catch{return false;}
 });
 const oldConditions=list(existing?.conditions).filter(value=>!/^This receiving-course award was researched for |^Confirm this exact receiving award applies to your selected degree, catalog and delivery format before purchase\./.test(value));
 const option={...copy(existing||{}),id:existing?.id||award.id,provider:award.provider,code:award.code,providerCourseCode:independentIdentity&&existing.providerCourseCode||award.providerCourseCode,title:independentIdentity&&existing.title||award.title,receivingCode,receivingTitle:award.receivingTitle,credits:award.credits,creditSystem:'semester',...(independentIdentity?{}:{sourceCredits:null,sourceCreditSystem:null,sourceCreditStatus:'unknown',sourceCreditBasis:award.sourceCreditBasis}),creditOrigin:'alternative',upper:award.upper,evidence:'conditional',evidenceType:'official-receiving-school-equivalency',sourceIds:[...new Set([...sourceIds,...requirementSources])],url:packet.sources.find(source=>source.id===sourceIds[0]).url,sourcePage:award.sourcePage,mappingChecked:packet.checkedOn,mappingReviewId:packet.id,mappingResearchClosed:true,receivingMapStatus:'published-online-receiving-award',mappingScope:'The online guide names this receiving award. Its proposed placement uses this degree’s separately sourced exact requirement or unrestricted free-elective allocation.',...(list(award.crossListedReceivingCodes).length?{crossListedReceivingCodes:[receivingCode,...award.crossListedReceivingCodes],...(key(row.code)!==key(receivingCode)&&list(award.crossListedReceivingCodes).some(code=>key(code)===key(row.code))?{fulfillsCode:row.code}:{})}:{}),degreePlacementEvidence:{modelId:model.id,catalogYear:packet.catalogYear,modality:'online',requirementId:row.id,receivingCode,credits:row.credits,creditSystem:'semester',placementType:row.freeElective?'free-elective':'exact-named-requirement',sourceIds:[...requirementSources]},...(independentIdentity&&existing.eligibilityReview?{}:{eligibilityReview:{...(existing?.eligibilityReview||{}),eligibleToStart:false,status:'needs-independent-provider-review',recommendationPeriodStatus:'version-period-link-still-to-review',sourceIds:[...new Set([...list(existing?.eligibilityReview?.sourceIds),...sourceIds])]}}),conditions:[...new Set([...oldConditions,...(!independentIdentity?['The exact provider version, recommendation period and independently issued source-credit quantity still need research before enrollment.']:[]),'Liberty evaluates the student’s awarded credits, catalog eligibility, minimum grades and duplicate learning separately.',...(row.minimumGrade?['This requirement needs '+row.minimumGrade+' or higher; no pass-grade equivalence is presumed.']:[])])],...(row.freeElective?{placementType:'elective'}:{})};
 // Runtime curriculum options omit an unknown quantity; the reviewed packet
 // and normalized fact registry retain explicit null/status provenance.
 if(option.sourceCredits===null){delete option.sourceCredits;delete option.sourceCreditSystem;}
 return option;
}

/** Exact named matches are exhaustive. Flexible pools retain enough distinct
 * sources for every free-elective slot plus provider alternatives, without
 * copying every guide row into every slot of every degree. */
export function applyCompiled(input,packet,{includeResearchCandidates=false}={}){
 if(input?.school!=='Liberty University'||input.format!=='Online'||input.creditSystem!=='semester'||input.auditProvenance?.status==='student-provided'||!normalizeLevel(input.level)||String(input.catalogYear||input.catalog||'').replace(/[–—]/g,'-')!=='2026-2027')return input;
 validateReviewedOnlineAwards(packet);
 assert(typeof includeResearchCandidates==='boolean','Choose an explicit research-candidate setting.');
 const model=copy(input),rows=list(model.requirements),fixed=new Set(rows.filter(row=>!row.freeElective).flatMap(row=>[row.code,...list(row.allowedCourseCodes)]).filter(Boolean).map(key));
 const free=rows.filter(row=>row.freeElective&&row.category==='electives'),poolSize=Math.max(12,free.length+6),usedSources=new Set();
 let added=0,scoped=0;
 for(const row of rows){
  if(!list(row.sourceIds).length||!row.sourceIds.every(id=>{try{const url=new URL(list(model.sources).find(source=>source.id===id)?.url);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='liberty.edu'||url.hostname.endsWith('.liberty.edu'));}catch{return false;}}))continue;
  let awards=packet.awards.filter(award=>permitted(award,row));
  if(row.freeElective){
   awards=awards.filter(award=>!fixed.has(key(award.receivingCode))&&!list(award.crossListedReceivingCodes).some(code=>fixed.has(key(code))));
   awards.sort((a,b)=>Number(b.upper)-Number(a.upper)||Number(exactCode(b.receivingCode))-Number(exactCode(a.receivingCode))||Number(b.provider==='Sophia')-Number(a.provider==='Sophia')||a.code.localeCompare(b.code));
   const existingCodes=new Set(list(row.options).map(option=>option.provider+'|'+key(option.code)+'|'+key(option.receivingCode||row.code)));
   const pool=new Set(awards.slice(0,poolSize));awards=awards.filter(award=>pool.has(award)||existingCodes.has(award.provider+'|'+key(award.code)+'|'+key(award.receivingCode)));
  }
  for(const award of awards){
   const receivingCodes=[award.receivingCode,...list(award.crossListedReceivingCodes)].map(key),existing=list(row.options).find(option=>option.provider===award.provider&&key(option.code)===key(award.code)&&receivingCodes.includes(key(option.receivingCode||row.code))&&option.credits===award.credits);
   if(!existing&&!includeResearchCandidates)continue;
   if(existing?.evidence==='published')continue;
   const next=optionFrom(award,row,model,packet,existing);row.options=list(row.options);
   if(existing){row.options[row.options.indexOf(existing)]=next;scoped++;}else{row.options.push(next);added++;}
   if(row.selectionRequired&&next.code)row.selectionRequired=false;
   for(const id of next.sourceIds)if(packet.sources.some(source=>source.id===id))usedSources.add(id);
  }
 }
 const sources=new Map(list(model.sources).map(source=>[source.id,source]));for(const source of packet.sources)if(usedSources.has(source.id))sources.set(source.id,copy(source));model.sources=[...sources.values()];
 if(usedSources.size)model.onlineGuideAwardReview={id:packet.id,checkedOn:packet.checkedOn,scope:'Exact receiving awards and proposed degree placements only; provider quantities and eligibility remain separate.',sourceIds:[...usedSources]};
 return model;
}
