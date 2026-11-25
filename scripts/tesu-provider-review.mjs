/** Current TESU provider status is independent of a receiving-course award. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
export const providerReview=JSON.parse(readFileSync(resolve(root,'content/pathway-kits/tesu/provider-review-2026-11-25.json'),'utf8'));
const copy=value=>JSON.parse(JSON.stringify(value));
export function tesuProviderEligibility(provider,existing={}){
 const approved=providerReview.approved.includes(provider),provisional=providerReview.provisional.includes(provider);
 if(!approved&&!provisional)return copy(existing);
 const retained=copy(existing);delete retained.eligibleToStart;
 return {...retained,status:approved?'approved-provider-course-mapping-separate':'provisionally-approved-review-pending',provider,fullyApproved:approved,providerReviewPending:provisional,enrollmentPermission:'not-established-by-provider-status',sourceIds:[providerReview.source.id,providerReview.policySource.id],checkedOn:providerReview.checkedOn,reviewId:providerReview.id,owner:'DegreeSteps',individualApproval:false,scope:providerReview.scope};
}
/** Idempotent review of the legacy General Management model; no mapping status or date is advanced. */
export function applyTESUProviderReview(input){
 const model=copy(input);
 if(model.school!==providerReview.school)return model;
 for(const reviewedSource of [providerReview.source,providerReview.policySource]){const index=(model.sources||=[]).findIndex(source=>source.id===reviewedSource.id);
 if(index<0)model.sources.push(copy(reviewedSource));else model.sources[index]=copy(reviewedSource);}
 model.providerEligibilityReview={id:providerReview.id,checkedOn:providerReview.checkedOn,sourceIds:[providerReview.source.id,providerReview.policySource.id],approvedProviders:copy(providerReview.approved),provisionalProviders:copy(providerReview.provisional),scope:providerReview.scope};
 for(const requirement of model.requirements||[])for(const option of requirement.options||[]){
  if(!providerReview.approved.includes(option.provider)&&!providerReview.provisional.includes(option.provider))continue;
  option.eligibilityReview=tesuProviderEligibility(option.provider,option.eligibilityReview);
 }
 return model;
}
