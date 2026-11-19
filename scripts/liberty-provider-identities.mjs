/* Independently reviewed provider identities. Receiving awards stay separate. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const reviewPath=new URL('../content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json',import.meta.url);
export const libertyProviderIdentityReview=JSON.parse(await readFile(reviewPath,'utf8'));
const list=value=>Array.isArray(value)?value:[],clone=value=>JSON.parse(JSON.stringify(value));
const uniq=values=>[...new Set(values)];
function validate(review){
 assert(review?.version===1&&review.id==='sophia-liberty-baseline-identities-2026-11-18'&&review.checkedOn==='2026-11-18','Use the current reviewed Sophia identity packet.');
 const sources=new Map(list(review.sources).map(source=>[source.id,source]));
 for(const source of sources.values()){const url=new URL(source.url),allowed=source.kind==='ace'?url.hostname==='www.acenet.edu':source.kind==='provider'?['www.sophia.org','cdn2.sophia.org'].includes(url.hostname):source.kind==='university'&&['www.liberty.edu','catalog.liberty.edu'].includes(url.hostname);assert(url.protocol==='https:'&&!url.username&&!url.password&&allowed,'Use the exact official provider, ACE or Liberty policy source.');}
 const ids=new Set();
 for(const course of list(review.courses)){
  assert(/^SOPH-\d{4}$/.test(course.aceId)&&!ids.has(course.aceId)&&Number.isSafeInteger(course.aceVersion)&&course.aceVersion>0,'Keep one exact reviewed current ACE course version.');ids.add(course.aceId);
  assert(course.activeOffering===true&&course.sourceCreditSystem==='semester'&&[1,3].includes(course.sourceCredits)&&course.sourceUpper===false,'Preserve the independently documented original semester quantity and level.');
  assert(/^20\d\d-\d\d-\d\d$/.test(course.recommendationStart)&&/^20\d\d-\d\d-\d\d$/.test(course.recommendationEnd)&&course.recommendationStart<course.recommendationEnd,'Use actual independent ACE recommendation dates.');
  assert(course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn,'A future or expired ACE period cannot be labeled the current reviewed version.');
  assert(list(course.identitySourceIds).length>=3&&list(course.recommendationPeriodSourceIds).length>=1&&[...course.identitySourceIds,...course.recommendationPeriodSourceIds].every(id=>sources.has(id)),'Retain independent provider, linked syllabus and exact ACE period evidence.');
  assert(course.identitySourceIds.some(id=>sources.get(id).kind==='provider')&&course.identitySourceIds.some(id=>sources.get(id).kind==='ace')&&course.recommendationPeriodSourceIds.every(id=>sources.get(id).kind==='ace'),'Provider identity and independent ACE periods need their respective authorities.');
  assert(course.identitySourceIds.every(id=>/^[a-f0-9]{64}$/.test(sources.get(id).sha256||''))&&/^[a-f0-9]{64}$/.test(course.syllabusSHA256||''),'Current identity evidence needs captured raw body hashes, including the provider-linked syllabus.');
 }
 return sources;
}
function identityFields(course){
 return {aceId:course.aceId,courseVersion:String(course.aceVersion),providerCourseCode:course.providerCourseCode,sourceCredits:course.sourceCredits,sourceCreditSystem:course.sourceCreditSystem,sourceUpper:course.sourceUpper,sourceCreditStatus:'verified-current-provider-and-ace',sourceCreditBasis:'Current provider offering and independently reviewed ACE National Guide source-credit recommendation.',providerCourseUrl:course.courseUrl,providerCoursePassingPercent:course.minimumPassingScore,providerCoursePassingSourceIds:[...course.identitySourceIds],recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,recommendationPeriodSourceIds:[...course.recommendationPeriodSourceIds],sourceCreditEvidence:{status:'reviewed',sourceIds:[...course.identitySourceIds],aceVersion:course.aceVersion,checkedOn:'2026-11-18'},...(course.providerRetirementMonth?{providerRetirementMonth:course.providerRetirementMonth,providerRetirementSourceIds:[...course.providerRetirementSourceIds]}:{})};
}
export function applyLibertyProviderIdentities(input,review=libertyProviderIdentityReview){
 if(input?.school!=='Liberty University'||!['Online','Residential'].includes(input.format)||String(input.catalogYear||input.catalog||'').replace(/[–—]/g,'-')!=='2026-2027'||!['bachelor','associate',"Bachelor's","Associate's"].includes(input.level))return input;
 const sources=validate(review),model=clone(input),used=new Set();
 for(const requirement of list(model.requirements))for(const option of list(requirement.options)){
  if(option.provider!=='Sophia')continue;
  const matches=review.courses.filter(course=>[option.code,...list(option.codeAliases)].includes(course.aceId));if(matches.length!==1)continue;const course=matches[0];
  // A quantity disagreement is research, not permission to silently replace it.
  if(option.sourceCredits!=null&&option.sourceCredits!==course.sourceCredits||option.sourceCreditSystem!=null&&option.sourceCreditSystem!==course.sourceCreditSystem||option.courseVersion!=null&&String(option.courseVersion)!==String(course.aceVersion)||option.recommendationStart!=null&&option.recommendationStart!==course.recommendationStart||option.recommendationEnd!=null&&option.recommendationEnd!==course.recommendationEnd)continue;
  const originalCode=option.providerCourseCode;
  Object.assign(option,identityFields(course));
  option.codeAliases=uniq([...list(option.codeAliases),...(originalCode&&originalCode!==course.aceId?[originalCode]:[]),course.providerCourseCode]).filter(code=>code!==option.code);
  option.identitySourceIds=uniq([...list(option.identitySourceIds),...course.identitySourceIds,...list(course.providerRetirementSourceIds)]);
  option.listingIdentityIds=uniq([...list(option.listingIdentityIds),course.primaryListingId]);
  option.listingIdentitySourceIds=uniq([...list(option.listingIdentitySourceIds),...course.identitySourceIds]);
  if(course.providerRetirementMonth)option.conditions=uniq([...list(option.conditions),'ACE lists Ancient Greek Philosophers as retiring in May 2027. The reviewed current recommendation ends on '+course.recommendationEnd+'.']);
  if(course.completionWindowNote)option.conditions=uniq([...list(option.conditions),course.completionWindowNote]);
  option.identitySourceIds.forEach(id=>used.add(id));course.recommendationPeriodSourceIds.forEach(id=>used.add(id));list(course.providerRetirementSourceIds).forEach(id=>used.add(id));
 }
 if(used.size){const existing=new Map(list(model.sources).map(source=>[source.id,source]));for(const id of used)if(sources.has(id))existing.set(id,clone(sources.get(id)));model.sources=[...existing.values()];}
 return model;
}

export function applyLibertyBaselineDuplicatePolicy(input,review=libertyProviderIdentityReview){
 const proof=review.duplicateAwardReview;
 if(proof?.status!=='verified'||input?.id!==proof.modelId||input.school!=='Liberty University'||input.format!==proof.format||String(input.catalogYear||input.catalog||'').replace(/[–—]/g,'-')!==proof.catalogYear)return input;
 const sources=validate(review);
 if(!proof.sourceIds.every(id=>sources.has(id)))return input;
 for(const [index,award] of proof.awards.entries()){
  const row=list(input.requirements).find(row=>row.id===proof.requirementIds[index]);
  if(row?.code!==award.receivingCode||row.credits!==award.receivingCredits||!list(row.options).some(option=>option.provider==='Sophia'&&[option.code,...list(option.codeAliases)].includes(award.aceId)))return input;
 }
 const model=clone(input),existing=new Map(list(model.sources).map(source=>[source.id,source]));
 for(const id of proof.sourceIds)existing.set(id,clone(sources.get(id)));model.sources=[...existing.values()];
 model.unresolved=list(model.unresolved).map(item=>{
  if(item?.message!=='DegreeSteps is reviewing duplicate-award exclusions for the selected one-credit Sophia electives against any prior awards.')return item;
  return {message:'Submit official prior-learning records for Liberty’s duplicate-credit check before enrolling in these electives. The same course can count only once toward the degree; these two planned courses have distinct published source identities and receiving elective departments.',owner:'student',status:'personal-task',requirementIds:[...proof.requirementIds],sourceIds:[...proof.sourceIds]};
 });
 model.duplicateAwardPolicyReview={id:review.id,checkedOn:review.checkedOn,scope:'Fresh published baseline and existing duplicate-credit policy; no prior student awards are presumed eligible.',sourceIds:[...proof.sourceIds]};
 return model;
}

export function applyLibertyBaselineReceivingReview(input,review=libertyProviderIdentityReview){
 const proof=review.receivingAwardReview;
 if(input?.id!==proof?.modelId||input.school!==proof.school||input.format!==proof.format||String(input.catalogYear||input.catalog||'').replace(/[–—]/g,'-')!==proof.catalogYear)return input;
 const sources=validate(review),source=sources.get(proof.sourceId);
 assert(source?.kind==='university'&&source.evidenceType==='official-receiving-school-equivalency'&&proof.page===1,'Use the exact reviewed residential receiving guide.');
 const model=clone(input);let changed=false;
 for(const award of proof.awards){
  const row=list(model.requirements).find(row=>row.id===award.requirementId);
  if(row?.code!==award.receivingCode||row.credits!==award.receivingCredits)continue;
  for(const option of list(row.options)){
   if(option.provider!=='Sophia'||option.code!==award.aceId||option.evidence!=='published'||option.receivingCode&&option.receivingCode!==award.receivingCode||option.credits!=null&&option.credits!==award.receivingCredits)continue;
   option.receivingCode=award.receivingCode;option.mappingChecked=proof.checkedOn;option.mappingReviewId=review.id+'-residential-existing-awards';option.guideUpdated=source.guideUpdated;option.sourcePage=proof.page;
   option.sourceIds=uniq([...list(option.sourceIds),proof.sourceId]);
   option.mappingScope='Exact existing residential receiving-course award independently reviewed in Liberty’s currently linked Sophia guide; placement uses the independently sourced degree requirement code. Individual awards remain subject to Liberty evaluation.';
   changed=true;
  }
 }
 if(changed){const existing=new Map(list(model.sources).map(source=>[source.id,source]));existing.set(source.id,clone(source));model.sources=[...existing.values()];}
 return model;
}

export function applyLibertyProviderCourseCatalog(input,review=libertyProviderIdentityReview){
 const sources=validate(review),catalog=clone(input),used=new Set();
 for(const course of review.courses){
  const listing=list(catalog.courses).find(item=>item.id===course.primaryListingId&&item.provider==='Sophia'&&item.url===course.courseUrl);if(!listing)continue;
  if(listing.credits!=null&&listing.credits!==course.sourceCredits)continue;
  Object.assign(listing,{mappingCode:course.aceId,credits:course.sourceCredits,creditSystem:course.sourceCreditSystem,creditBasis:'reviewed-provider-and-ace',identityReviewId:review.id,identitySourceIds:[...course.identitySourceIds],recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,recommendationVersion:String(course.aceVersion),recommendationPeriodSourceIds:[...course.recommendationPeriodSourceIds]});
  listing.codeAliases=uniq([...list(listing.codeAliases),course.aceId,course.providerCourseCode]);
  [...course.identitySourceIds,...course.recommendationPeriodSourceIds].forEach(id=>used.add(id));
 }
 const existing=new Map(list(catalog.sources).map(source=>[source.id,source]));for(const id of used)existing.set(id,{...clone(sources.get(id)),provider:'Sophia',name:sources.get(id).title,status:'identity-review',count:0,checkedAt:review.checkedOn,scope:'Reviewed provider identity and ACE recommendation period; receiving awards remain separate.'});catalog.sources=[...existing.values()];return catalog;
}
