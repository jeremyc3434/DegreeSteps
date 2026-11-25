/** Bounded provider-published TESU candidate. No official receiving award is inferred. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {tesuProviderEligibility} from './tesu-provider-review.mjs';
const root=resolve(import.meta.dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
export const studyEnglishReview=JSON.parse(readFileSync(resolve(root,'content/pathway-kits/tesu/study-english104-review-2026-11-25.json'),'utf8'));
export const studyEnglishOptionId='studycom-sdcm-0057-enc1010-reviewed-2026-11-25';
export function studyEnglishOption(model,requirement){
 if(model.school!==studyEnglishReview.school||requirement.code!=='ENC-1010'||requirement.credits!==3||requirement.institutionalOnly)return null;
 const [mapping,identity]=studyEnglishReview.sources,course=studyEnglishReview.providerCourse;
 const degreeSourceIds=requirement.sourceIds?.length?copy(requirement.sourceIds):model.sources.some(s=>s.id==='tesu-degree')?['tesu-degree']:[];
 if(!degreeSourceIds.length)return null;
 return {id:studyEnglishOptionId,...copy(course),...copy(studyEnglishReview.receivingCandidate),receivingTitle:requirement.title,creditOrigin:'alternative',identitySourceIds:[identity.id],identityReviewId:studyEnglishReview.id,identityCheckedOn:studyEnglishReview.checkedOn,sourceCreditStatus:'verified',sourceCreditEvidence:{credits:3,creditSystem:'semester',sourceIds:[identity.id]},recommendationPeriodSourceIds:[identity.id],providerCoursePassingSourceIds:[identity.id],url:identity.url,mappingChecked:studyEnglishReview.checkedOn,mappingReviewId:studyEnglishReview.id,mappingScope:'Current provider-published ENC-1010 candidate, independently identified by ACE. No TESU-submitted receiving award has been established.',mappingEvidence:{schoolName:studyEnglishReview.school,provider:'Study.com',providerCourseCode:course.code,receivingCode:'ENC-1010',credits:3,creditSystem:'semester',sourceIds:[mapping.id],claimOrigin:'provider-published',publisher:'Study.com',scope:'provider-published-university-course-candidate',individualApproval:false},degreePlacementEvidence:{modelId:model.id,schoolName:model.school,programName:model.title,requirementId:requirement.id,receivingCode:'ENC-1010',credits:3,creditSystem:'semester',sourceIds:degreeSourceIds,scope:'The exact degree names ENC-1010; this does not establish acceptance of the provider course.'},sourceIds:[mapping.id,identity.id,...degreeSourceIds],conditions:copy(studyEnglishReview.conditions),eligibilityReview:tesuProviderEligibility('Study.com')};
}
export function applyTESUStudyEnglish104(input){
 const model=copy(input);
 if(model.school!==studyEnglishReview.school)return model;
 for(const requirement of model.requirements||[]){
  const candidate=studyEnglishOption(model,requirement);if(!candidate)continue;
  for(const source of studyEnglishReview.sources)if(!model.sources.some(s=>s.id===source.id))model.sources.push(copy(source));
  const index=requirement.options.findIndex(o=>o.id===candidate.id);if(index<0)requirement.options.push(candidate);else requirement.options[index]=candidate;
 }
 return model;
}
