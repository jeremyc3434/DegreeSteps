/** Reuse the documented online undergraduate policy scope. This resolves an
 * absent aggregate alternative-credit rule; it never manufactures a ceiling. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const copy=value=>JSON.parse(JSON.stringify(value)),list=value=>Array.isArray(value)?value:[];
const catalog=value=>String(value||'').replace(/[–—]/g,'-');
const level=value=>({associate:'associate',associates:'associate',bachelor:'bachelor',bachelors:'bachelor'})[String(value||'').toLowerCase().replace(/[^a-z]/g,'')];
export const libertySharedPolicyReview=JSON.parse(await readFile(new URL('../content/curricula/snapshots/liberty/shared-online-policy-2026-2027-reviewed.json',import.meta.url),'utf8'));
export function applyLibertySharedPolicyResolutions(input,review=libertySharedPolicyReview){
 const scope=list(review?.programs).find(row=>row.id===input?.id);
 if(input?.policyReview!==undefined&&!Array.isArray(input.policyReview))return input;
 if(!scope||input.school!==review.school||input.format!=='Online'||scope.format!=='Online'||catalog(input.catalogYear||input.catalog)!==review.catalogYear||level(input.level)!==scope.level||input.totalCredits!==scope.totalCredits||input.creditSystem!=='semester'||input.auditProvenance?.status==='student-provided')return input;
 // A numeric cap, a conflicting residency rule, or explicit degree exception
 // cannot inherit this absence-of-a-separate-rule conclusion.
 if(input.alternativeMaxCredits!==undefined&&input.alternativeMaxCredits!==null||input.institutionMinCredits!==input.totalCredits*.25||input.externalMaxCredits!==input.totalCredits*.75||input.majorInstitutionFraction!==.25)return input;
 assert(review.version===1&&review.reviewStatus==='verified'&&review.rawCapture?.supportsResidencyFacts===true&&review.rawCapture.sha256===review.source.sha256&&review.rawSourceContentHash==='sha256:'+review.source.sha256&&/^[a-f0-9]{64}$/.test(review.source.sha256||''),'Shared policy conclusions require their actual reviewed catalog body.');
 assert(review.school==='Liberty University'&&review.catalogYear==='2026-2027'&&review.policies.creditSystem==='semester'&&review.policies.degreeInstitutionFraction===.25&&review.policies.majorInstitutionFraction===.25&&review.policies.alternativeMaxCredits===null&&review.policies.alternativeCapStatus==='No separate aggregate alternative-credit ceiling established by this review.','Use the documented current online undergraduate policy conclusions.');
 const url=new URL(review.source.url);assert(url.protocol==='https:'&&url.hostname==='catalog.liberty.edu'&&url.pathname==='/pdf/LibertyUniversity2026-2027UndergraduateCatalog.pdf'&&!url.username&&!url.password,'Only the reviewed official full catalog establishes this policy conclusion.');
 const knownGeneric=check=>check?.field==='alternativeMaxCredits'&&check.status==='unverified'&&check.message==='Confirm the combined limit on alternative credit sources.'&&check.reviewId===undefined&&!Object.hasOwn(check,'value')&&!Object.hasOwn(check,'maximumCredits')&&!Object.hasOwn(check,'exception');
 const ourResolution=check=>check?.field==='alternativeMaxCredits'&&check.status==='not-applicable'&&check.reviewId===review.id&&list(check.sourceIds).length===1&&check.sourceIds[0]===review.source.id&&!Object.hasOwn(check,'value')&&!Object.hasOwn(check,'maximumCredits')&&!Object.hasOwn(check,'exception');
 // A named program exception or differently reviewed restriction is never
 // erased by the general catalog's silence about an aggregate ceiling.
 const checks=list(input.policyReview).filter(check=>check?.field==='alternativeMaxCredits');
 if(checks.some(check=>!knownGeneric(check)&&!ourResolution(check)))return input;
 const model=copy(input),sources=new Map(list(model.sources).map(source=>[source.id,source])),old=sources.get(review.source.id);
 assert(!old||old.url===review.source.url&&(!old.sha256||old.sha256===review.source.sha256),'A conflicting school-policy source requires review.');
 sources.set(review.source.id,copy(review.source));model.sources=[...sources.values()];
 model.policyReview=list(model.policyReview).filter(check=>check?.field!=='alternativeMaxCredits');
 model.policyReview.push({field:'alternativeMaxCredits',status:'not-applicable',reviewId:review.id,sourceIds:[review.source.id],checkedOn:review.checkedOn,message:'The reviewed online undergraduate catalog publishes no separate aggregate alternative-credit ceiling. Its documented overall transfer and degree/major residency rules remain enforced. Each outside course still requires its own published receiving award and provider eligibility; no numeric alternative-credit allowance or student award is inferred.'});
 model.sharedPolicyResolution={id:review.id,sourceContentHash:review.rawSourceContentHash,catalogYear:review.catalogYear,modality:'online',level:scope.level,totalCredits:scope.totalCredits,degreeInstitutionCredits:model.institutionMinCredits,overallOutsideCeiling:model.externalMaxCredits,majorResidencyBasisCredits: model.majorResidencyBasisCredits??null,resolvedFields:['alternativeMaxCredits'],numericAlternativeCapInvented:false,personalAwardsCreated:0};
 return model;
}
