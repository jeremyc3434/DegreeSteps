/** Bind reviewed university policies without inferring provider-award approval. */
import assert from 'node:assert/strict';
const list=value=>Array.isArray(value)?value:[];
const clone=value=>JSON.parse(JSON.stringify(value));
const edition=value=>String(value||'').replace(/[–—]/g,'-');
const level=value=>({'associate':'associate','bachelor':'bachelor',"Bachelor's":'bachelor'})[value];
export function applyLibertyReviewedPolicy(input,review){
 // A retrieval is not necessarily evidence for the numeric policy. Keep the
 // original model untouched while a relocation or missing passage is reviewed.
 if(review?.reviewStatus!=='verified'||review?.rawCapture?.supportsResidencyFacts!==true)return input;
 const scope=list(review?.programs).find(program=>program.id===input?.id);
 if(!scope)return input;
 assert(review.version===1&&review.school==='Liberty University'&&review.catalogYear==='2026-2027','Use the reviewed Liberty online policy packet.');
 assert(input.school===review.school&&input.format==='Online'&&scope.format==='Online'&&edition(input.catalogYear||input.catalog)===review.catalogYear&&level(input.level)===scope.level&&input.totalCredits===scope.totalCredits,'Liberty policy evidence must match the exact program, delivery, level and catalog.');
 const facts=review.policies,source=review.source;
 const url=new URL(source.url);
 assert(url.protocol==='https:'&&!url.username&&!url.password&&url.hostname==='catalog.liberty.edu'&&url.pathname==='/pdf/LibertyUniversity2026-2027UndergraduateCatalog.pdf'&&source.checked===review.checkedOn,'Use the exact reviewed online academic policy.');
 assert(facts.degreeInstitutionFraction===.25&&facts.majorInstitutionFraction===.25,'Do not substitute a different residency policy.');
 assert(input.institutionMinCredits===input.totalCredits*facts.degreeInstitutionFraction&&input.externalMaxCredits===input.totalCredits-input.institutionMinCredits&&input.majorInstitutionFraction===facts.majorInstitutionFraction,'A conflicting degree-specific residency value needs separate review.');
 const model=clone(input),sourceIds=[source.id];
 const sources=new Map(list(model.sources).map(item=>[item.id,item]));sources.set(source.id,clone(source));model.sources=[...sources.values()];
 model.policyEvidence={...model.policyEvidence,
  institutionMinCredits:{value:model.institutionMinCredits,creditSystem:'semester',sourceIds,calculation:'25% of this published degree total must be completed at Liberty.'},
  externalMaxCredits:{value:model.externalMaxCredits,creditSystem:'semester',sourceIds,calculation:'Published degree total less the 25% institutional minimum.',scope:'Overall outside-credit ceiling only. This does not establish a separate aggregate alternative-credit ceiling or a particular provider award.'},
  majorInstitutionFraction:{value:.25,sourceIds,scope:'25% of the exact major/minor component, unless the degree completion plan specifies otherwise. The denominator remains degree-specific.'}
 };
 const resolved=new Set(['institutionMinCredits','externalMaxCredits','majorInstitutionFraction']);
 if(Array.isArray(model.policyReview))model.policyReview=model.policyReview.map(item=>resolved.has(item?.field)?{...item,status:'confirmed',sourceIds,checkedOn:review.checkedOn,message:'The published online undergraduate residency policy is bound to this program; degree-specific exceptions remain separate.'}:item);
 model.sharedOnlinePolicyReview={id:review.id,checkedOn:review.checkedOn,sourceIds,fields:[...resolved],alternativeCreditCeilingEstablished:false,personalAwardsCreated:0};
 return model;
}
