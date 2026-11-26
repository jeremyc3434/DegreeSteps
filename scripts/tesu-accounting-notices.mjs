/** Reclassify only reviewed Accounting execution/scope messages, without clearing any research finding. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadKit,root} from './pathway-factory/lib.mjs';
import {compileProgram} from './pathway-factory/compile.mjs';
import {groundedSource} from './tesu-course-eligibility.mjs';
const ID='tesu-accounting-execution-notices-2026-11-26',CHECKED='2026-11-26';
const original={
 personal:'Individual catalog eligibility, state CPA eligibility, course currency and registration availability depend on the student; this plan does not make a licensure or admissions decision.',
 retained:'Existing receiving-school transfer candidates retain their original provider/version/format restrictions. No additional provider award is inferred from a matching course title.',
 residency:'The standard nonmilitary residency route is modeled. Military enrollment, foreign-credit rules and Edison Accelerate require a separately evaluated scenario.',
 pricing:'Published tuition is a planning basis; books, provider subscriptions and applicable fees are separate.'
};
const notice=(id,status,owner,message,sourceIds)=>({id,reviewId:ID,checkedOn:CHECKED,status,owner,message,sourceIds});
export const tesuAccountingNotices=Object.freeze({
 personal:notice('tesu-accounting-personal-eligibility','personal-task','student','Use the catalog for your enrollment and have TESU evaluate any previous business courses. If you plan to become a CPA, check your state’s exam and licensing requirements.',['tesu-bsba-accounting-placement-2026-11-26','tesu-accounting-business-policy-2026-11-18','tesu-transcript-course-eligibility-2026-11-26']),
 retained:notice('tesu-accounting-retained-transfer-scope','resolved','DegreeSteps',original.retained,['tesu-provider-review-policy-2026-11-25','tesu-transcript-course-eligibility-2026-11-26']),
 residency:notice('tesu-accounting-personal-residency-route','personal-task','student','If you use military benefits, foreign credits or Edison Accelerate, choose the route that applies to your situation.',['tesu-accounting-residency-2026-11-18'])
});
export function applyTESUAccountingNotices(input){
 const model=structuredClone(input);if(model.id!=='curriculum-tesu-bsba-accounting'||model.school!=='Thomas Edison State University'||model.catalog!=='Current undergraduate catalog · checked November 18, 2026')return model;
 assert.equal(model.totalCredits,120);assert.equal(model.requirements.length,40);assert.equal(model.institutionMinCredits,15);assert.equal(model.alternativeMaxCredits,90);
 const sources=new Map(model.sources.map(source=>[source.id,source])),ids=new Map(Object.entries(tesuAccountingNotices).map(([key,note])=>[note.id,key]));
 for(const note of Object.values(tesuAccountingNotices))for(const id of note.sourceIds){const source=sources.get(id);assert(source,'The reviewed execution condition retains its primary model policy source '+id);const url=new URL(source.url);assert.equal(url.protocol,'https:');assert(url.hostname==='tesu.edu'||url.hostname.endsWith('.tesu.edu')||url.hostname==='tesu.smartcatalogiq.com');}
 const pricing=[...(model.pricingNotes||[])],notes=[];
 for(const note of model.unresolved||[]){
  if(note===original.pricing){if(!pricing.includes(note))pricing.push(note);continue;}
  const key=typeof note==='string'?Object.keys(tesuAccountingNotices).find(key=>original[key]===note):ids.get(note?.id);
  notes.push(key?structuredClone(tesuAccountingNotices[key]):note);
 }
 model.unresolved=notes;model.pricingNotes=pricing;return model;
}
export async function writeTESUAccountingNotices({check=false}={}){
 const kit=await loadKit(resolve(root,'content/pathway-kits/tesu')),program=kit.programs.find(program=>program.modelId==='curriculum-tesu-bsba-accounting'),model=compileProgram(kit,program),reviewed=applyTESUAccountingNotices(model);
 const before=JSON.stringify({...model,unresolved:null,pricingNotes:null});assert.equal(JSON.stringify({...reviewed,unresolved:null,pricingNotes:null}),before,'No degree, policy, identity, equivalency or catalog field changes');
 const degree=await groundedSource(model.sources.find(source=>source.id==='tesu-bsba-accounting-placement-2026-11-26'));assert(degree.body.includes('Students should contact their state board of accountancy for specific details concerning CPA examination requirements.'));
 program.modelFields.unresolved=reviewed.unresolved;program.modelFields.pricingNotes=reviewed.pricingNotes;
 const packet={kind:'tesu-accounting-execution-notice-review',version:1,id:ID,checkedOn:CHECKED,modelId:model.id,catalog:model.catalog,scope:'Only the four exact historical scope/execution/estimate messages are reclassified. Unrecognized notices, provider-specific conditions and unresolved academic policy fields remain blockers.',academicFactsChanged:false,receivingAwardsAdded:0,originalMessages:original,notices:tesuAccountingNotices,pricingNotes:[original.pricing],primaryEvidence:{sourceId:degree.source.id,capture:degree.source.capture,sha256:degree.source.sha256,quote:'Students should contact their state board of accountancy for specific details concerning CPA examination requirements.'}};
 const{file,...authored}=program,writes=[['content/pathway-kits/tesu/programs/bsba-accounting.json',authored],['content/pathway-kits/tesu/accounting-execution-notices-review-2026-11-26.json',packet]];
 for(const[path,value]of writes){const text=JSON.stringify(value,null,2)+'\n';if(check)assert.equal(await readFile(resolve(root,path),'utf8'),text,path+' is stale');else await writeFile(resolve(root,path),text);}
 return {modelId:model.id,personalTasks:reviewed.unresolved.filter(note=>note.status==='personal-task').length,resolvedScopeNotes:reviewed.unresolved.filter(note=>note.status==='resolved').length,academicFactsChanged:false,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await writeTESUAccountingNotices({check:process.argv.includes('--check')})));
