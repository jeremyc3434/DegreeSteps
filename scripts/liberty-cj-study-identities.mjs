/** Exact current Study identities for two already-published CJ receiving awards. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export const libertyCJStudyIdentityReview=JSON.parse(await readFile(new URL('../content/catalog/liberty-cj-study-identities-reviewed-2026-11-18.json',import.meta.url),'utf8'));
const list=value=>Array.isArray(value)?value:[],clone=value=>JSON.parse(JSON.stringify(value)),uniq=values=>[...new Set(values)];
function validatedSources(review){
 assert(review?.version===1&&review.id==='liberty-cj-study-identities-2026-11-18'&&review.checkedOn==='2026-11-18'&&review.catalogYear==='2026-2027','Use the exact current CJ Study review.');
 const sources=new Map(list(review.sources).map(source=>[source.id,source]));
 for(const source of sources.values()){
  const url=new URL(source.url),host=source.kind==='ace'?'www.acenet.edu':source.kind==='provider'?'study.com':source.kind==='university'?'www.liberty.edu':null;
  assert(url.protocol==='https:'&&!url.username&&!url.password&&url.hostname===host,'Only the exact official ACE, provider and receiving-guide authorities are allowed.');
 }
 for(const course of list(review.courses)){
  assert(['liberty-criminal-justice-online','liberty-criminal-justice-residential'].includes(course.modelId)&&course.sourceCredits===3&&course.sourceCreditSystem==='semester'&&course.sourceUpper===false&&course.minimumPassingScore===70&&course.activeOffering===true,'Keep the reviewed current source quantity, level and passing score.');
  assert(course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn&&/^20\d\d-\d\d-\d\d$/.test(course.recommendationStart)&&/^20\d\d-\d\d-\d\d$/.test(course.recommendationEnd),'An expired or future recommendation cannot be called current.');
  assert(course.identitySourceIds.every(id=>sources.has(id))&&course.identitySourceIds.some(id=>sources.get(id).kind==='ace')&&course.identitySourceIds.some(id=>sources.get(id).kind==='provider')&&course.recommendationPeriodSourceIds.every(id=>sources.get(id)?.kind==='ace'),'Provider offering and independently reviewed ACE identity/period sources must be separate.');
  const guide=sources.get(course.receivingGuideSourceId);assert(guide?.kind==='university'&&guide.scope?.format===course.format&&guide.guideUpdated==='2026-05'&&guide.sourcePage===1&&/^[a-f0-9]{64}$/.test(guide.sha256||''),'The exact receiving guide and actual PDF hash are required.');
  for(const id of course.recommendationPeriodSourceIds)assert(/^[a-f0-9]{64}$/.test(sources.get(id).sourceHtmlSha256||''),'The ACE period needs its actual retrieved exhibit body.');
 }
 return sources;
}
export function applyLibertyCJStudyIdentities(input,review=libertyCJStudyIdentityReview){
 const proof=list(review?.courses).find(course=>course.modelId===input?.id);if(!proof)return input;
 if(input.auditProvenance?.status==='student-provided'||input.school!=='Liberty University'||input.format!==proof.format||String(input.catalogYear||input.catalog||'').replace(/[–—]/g,'-')!==review.catalogYear)return input;
 const sources=validatedSources(review),model=clone(input),row=list(model.requirements).find(row=>row.id===proof.requirementId),used=new Set();
 if(row?.code!==proof.receivingCode||row.credits!==proof.receivingCredits)return input;
 for(const option of list(row.options)){
  if(option.provider!=='Study.com'||option.code!==proof.aceId||option.evidence!=='published'||option.receivingCode!==proof.receivingCode||option.credits!==proof.receivingCredits)continue;
  // A historical version or conflicting quantity must remain a separate fact.
  if(option.sourceCredits!=null&&option.sourceCredits!==proof.sourceCredits||option.sourceCreditSystem!=null&&option.sourceCreditSystem!==proof.sourceCreditSystem||option.courseVersion!=null&&String(option.courseVersion)!==String(proof.aceVersion)||option.recommendationStart!=null&&option.recommendationStart!==proof.recommendationStart||option.recommendationEnd!=null&&option.recommendationEnd!==proof.recommendationEnd)continue;
  Object.assign(option,{aceId:proof.aceId,courseVersion:String(proof.aceVersion),providerCourseCode:proof.providerCourseCode,sourceCredits:proof.sourceCredits,sourceCreditSystem:'semester',sourceUpper:false,sourceCreditStatus:'verified-current-provider-and-ace',sourceCreditBasis:'Exact current ACE course exhibit and provider offering; receiving award separately reviewed.',providerCourseUrl:proof.courseUrl,providerCoursePassingPercent:70,providerCoursePassingSourceIds:[...proof.recommendationPeriodSourceIds],recommendationStart:proof.recommendationStart,recommendationEnd:proof.recommendationEnd,recommendationPeriodSourceIds:[...proof.recommendationPeriodSourceIds],sourceCreditEvidence:{status:'reviewed',sourceIds:[...proof.identitySourceIds],aceVersion:proof.aceVersion,checkedOn:review.checkedOn}});
  option.identitySourceIds=uniq([...list(option.identitySourceIds),...proof.identitySourceIds]);
  option.codeAliases=uniq([...list(option.codeAliases),proof.providerCourseCode]).filter(code=>code!==option.code);
  option.sourceIds=uniq([...list(option.sourceIds),proof.receivingGuideSourceId]);
  // Preserve previous dates/grades; add only the missing reviewed-award identity.
  if(!option.mappingReviewId)option.mappingReviewId=review.id+'-'+proof.format.toLowerCase()+'-existing-award';
  if(!option.mappingChecked)option.mappingChecked=review.checkedOn;
  [...proof.identitySourceIds,...proof.recommendationPeriodSourceIds,proof.receivingGuideSourceId].forEach(id=>used.add(id));
 }
 if(!used.size)return input;
 const current=new Map(list(model.sources).map(source=>[source.id,source]));for(const id of used)current.set(id,clone(sources.get(id)));model.sources=[...current.values()];
 return model;
}
