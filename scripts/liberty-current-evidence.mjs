/* Build-only reviewed evidence. No student records or runtime research calls. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {applyCompiled as applyAssociateChoices} from './liberty-associate-named-choices.mjs';
import {applyCompiled as applyOnlineGuideAwards,readReviewedOnlineAwards} from './liberty-online-guide-awards.mjs';
import {applyLibertyProviderIdentities,applyLibertyProviderCourseCatalog,applyLibertyBaselineReceivingReview,applyLibertyBaselineDuplicatePolicy} from './liberty-provider-identities.mjs';
import {applyLibertyCJReviewedBaseline} from './liberty-cj-reviewed-baseline.mjs';
import {applyLibertyReviewedPolicy} from './liberty-reviewed-policy.mjs';
import {applyLibertyHealthUpperIdentities,readLibertyHealthUpperReview} from './liberty-health-upper-identities.mjs';
import {applyLibertyCJStudyIdentities} from './liberty-cj-study-identities.mjs';
import {applyLibertyExpandedBaselineReview} from './liberty-expanded-baseline-review.mjs';
const root=resolve(import.meta.dirname,'..'),read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const guide=await readReviewedOnlineAwards(),cj=await read('content/curricula/snapshots/liberty/criminal-justice-baselines-2026-2027-reviewed.json'),policy=await read('content/curricula/snapshots/liberty/shared-online-policy-2026-2027-reviewed.json');
const healthcare=await readLibertyHealthUpperReview();

export function applyLibertyCurrentEvidence(input,{compiled=false}={}){
 if(input?.school!=='Liberty University')return input;
 let model=applyLibertyReviewedPolicy(input,policy);
 if(compiled){model=applyAssociateChoices(model);model=applyOnlineGuideAwards(model,guide);}
 model=applyLibertyBaselineReceivingReview(model);
 model=applyLibertyBaselineDuplicatePolicy(model);
 model=applyLibertyProviderIdentities(model);
 model=applyLibertyHealthUpperIdentities(applyLibertyCJStudyIdentities(applyLibertyCJReviewedBaseline(model,cj)),healthcare);
 return compiled?applyLibertyExpandedBaselineReview(model):model;
}

export async function reviewCourseCatalog({check=false}={}){
 const path=resolve(root,'dist/data/course-catalog.json'),original=JSON.parse(await readFile(path,'utf8')),reviewed=applyLibertyProviderCourseCatalog(original);
 if(check)assert.deepEqual(original,reviewed,'Run node scripts/liberty-current-evidence.mjs to update independently reviewed course identities.');
 else await writeFile(path,JSON.stringify(reviewed,null,2)+'\n');
 return {check,providerIdentities:reviewed.courses.filter(course=>course.identityReviewId==='sophia-liberty-baseline-identities-2026-11-18').length};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);assert(args.every(arg=>arg==='--check'),'Use --check or no arguments.');console.log(JSON.stringify(await reviewCourseCatalog({check:args.includes('--check')})));
}
