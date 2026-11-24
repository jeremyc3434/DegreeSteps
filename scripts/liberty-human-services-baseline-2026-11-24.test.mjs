import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Planner from '../dist/planner.js';
import CoursePlanView from '../dist/course-plan-view.js';
import {assessPathwayQuality} from './pathway-quality.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const canonical=await read('content/pathway-kits/liberty/programs/human-services-bs-online.json');
const review=await read('content/curricula/snapshots/liberty/human-services-online-baseline-review-2026-11-24.json');
const providers=['Sophia','Study.com','StraighterLine','CLEP','DSST'];
const choices=canonical.modelFields.reviewedBaselineChoices.optionSelections;
const byId=new Map(canonical.requirements.map(row=>[row.id,row]));
const selectedInline=row=>row.optionRows.filter(entry=>entry.inline).map(entry=>entry.inline).find(option=>option.id===choices[row.id]);

// Check the authored ledger directly so regeneration cannot conceal an omitted
// UNIV course, duplicate foundation allocation or unresolved major placeholder.
test('canonical Human Services retains 120 credits, UNIV 104 and the exact 72-credit major component',()=>{
 const sum=rows=>rows.reduce((total,row)=>total+row.credits,0);
 assert.equal(sum(canonical.requirements),120);
 assert.equal(byId.get('univ-104').credits,3);
 assert.equal(sum(canonical.requirements.filter(row=>row.category==='general')),30);
 assert.equal(sum(canonical.requirements.filter(row=>row.group==='major-foundations')),15);
 assert.equal(sum(canonical.requirements.filter(row=>row.group==='major-core'||row.group==='major-electives')),57);
 assert.equal(sum(canonical.requirements.filter(row=>row.freeElective)),18);
 assert.equal(canonical.requirements.filter(row=>row.freeElective).length,6);
 assert(!byId.has('free-electives-7'));
 assert.equal(canonical.modelFields.majorResidencyBasisCredits,72);
 assert.equal(canonical.modelFields.majorMinInstitutionCredits,18);
 assert.equal(canonical.modelFields.upperMinCredits,30);
 for(const code of ['RLGN 104','BIBL 104','THEO 104'])assert.equal(canonical.requirements.find(row=>row.code===code).credits,4);
 assert.equal(canonical.modelFields.appliedTransferWaiver,undefined);
 const sections=canonical.modelFields.curriculumSections;
 assert.deepEqual(sections.flatMap(section=>section.requirementIds).sort(),canonical.requirements.map(row=>row.id).sort());
 assert(sections.every(section=>section.parentId&&!['general','major','electives'].includes(section.id)));
 assert.deepEqual(sections.find(section=>section.id==='general-education').sharedRequirementIds,['biol-102','engl-102','math-201','psyc-101']);
 assert.deepEqual(Object.keys(choices).sort(),canonical.requirements.map(row=>row.id).sort());
});

test('canonical Human Services preserves five distinct eligible named major choices and the noncredit capstone chain',()=>{
 assert.deepEqual(review.majorChoices.map(choice=>choice.code),['PSYC 306','SOWK 432','PSYC 312','PSYC 320','PSYC 380']);
 const fixed=new Set(canonical.requirements.map(row=>row.code).filter(Boolean));
 const selected=review.majorChoices.map(choice=>choice.code);
 assert.equal(new Set(selected).size,5);
 assert(selected.every(code=>!fixed.has(code)));
 for(const choice of review.majorChoices){
  const row=byId.get(choice.requirementId),number=Number(choice.code.split(' ')[1]);
  assert(number>=300&&number<=499);
  if(row.allowedCourseCodes)assert(row.allowedCourseCodes.includes(choice.code));
  if(row.allowedPrefixes)assert(row.allowedPrefixes.includes(choice.code.split(' ')[0]));
  assert(row.offeringPolicy.offeredFormats.includes('Online'));
  assert.equal(row.offeringPolicy.actualSectionAvailabilityConfirmed,false);
 }
 for(const id of ['human-services-psychology-elective','human-services-social-work-elective','human-services-mixed-elective-2'])assert(selectedInline(byId.get(id))?.code);
 const capstone=byId.get('hser-497'),obligation=canonical.modelFields.obligations.find(row=>row.id==='hser-465');
 assert.equal(obligation.code,'HSER 465');assert.equal(obligation.credits,0);
 assert(!canonical.requirements.some(row=>row.code==='HSER 465'));
 assert.deepEqual(obligation.prerequisites,['hser-201','hser-270','hser-415']);
 assert.deepEqual(capstone.prerequisitePolicy.noncreditPrerequisiteObligationIds,['hser-465']);
 assert(capstone.prerequisitePolicy.rule.allOf.some(rule=>rule.code==='HSER 465'));
 assert.equal(capstone.registrationPolicy.minimumOverallGpa,2);
 assert.equal(capstone.registrationPolicy.seniorStanding,true);
 assert.equal(capstone.registrationPolicy.requiredMajor,'Human Services B.S.');
 assert.equal(capstone.registrationPolicy.departmentApprovalRequired,true);
 assert.equal(capstone.registrationPolicy.approvalTiming,'preceding semester');
 assert.equal(capstone.registrationPolicy.synchronousSeminars,'biweekly');
 assert.equal(capstone.registrationPolicy.communityServiceRequired,true);
 assert.equal(capstone.registrationPolicy.personalEligibilityConfirmed,false);
 assert.equal(byId.get('psyc-430').code,'PSYC 430');
 assert.deepEqual(byId.get('sowk-325').prerequisites,['hser-201','engl-102','hser-270']);
 assert(byId.get('sowk-325').prerequisitePolicy.rule.allOf.some(rule=>rule.code==='SOWK 270'));
 assert.equal(byId.get('sowk-325').prerequisitePolicy.prerequisiteEquivalences[0].satisfiedByCode,'HSER 270');
 assert.deepEqual(byId.get('hser-270').equivalentCourseCodes,['SOWK 270']);
 const visiting=new Set(),done=new Set();
 function visit(id){assert(!visiting.has(id),'Prerequisite cycle at '+id);if(done.has(id))return;visiting.add(id);for(const dependency of byId.get(id)?.prerequisites||[]){assert(byId.has(dependency));visit(dependency);}visiting.delete(id);done.add(id);}
 for(const id of byId.keys())visit(id);
 assert.equal(canonical.modelFields.eligibilityReview.personalEligibilityConfirmed,false);
 assert.equal(canonical.modelFields.assessmentsPassed,undefined);
});

test('compiled Human Services provides a fresh 60 outside / 60 Liberty plan with no academic research blocker',async()=>{
 const model=(await read('dist/data/curricula/liberty.json')).models.find(model=>model.id===canonical.modelId);
 assert.equal(model.reviewedBaselineChoices.reviewId,review.id,'Regenerate the compiled curriculum after the canonical and shared-award changes.');
 const before=JSON.stringify(model);
 const plan=Planner.generate(model,{providers,allowConditional:false,priority:'transfer',completed:[],optionSelections:model.reviewedBaselineChoices.optionSelections,optimizationNodeBudget:12000});
 const quality=assessPathwayQuality({model,plan,asOf:review.checkedOn});
 assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings));
 assert.equal(quality.research.blockingFindings,0);assert.equal(quality.research.conditionalFindings,0);
 assert.equal(plan.totals.external,60);assert.equal(plan.totals.institutional,60);
 assert.equal(plan.totals.majorInstitutional,45);assert.equal(plan.totals.upper,54);
 assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);
 assert(plan.rows.every(row=>row.status==='planned'));
 const chosen=id=>plan.rows.find(row=>row.requirementId===id).option;
 assert.equal(chosen('univ-104').provider,'University');assert.equal(chosen('univ-104').credits,3);
 assert.deepEqual(review.majorChoices.map(choice=>chosen(choice.requirementId).receivingCode||chosen(choice.requirementId).code),review.majorChoices.map(choice=>choice.code));
 for(const [id,code,receiving]of [['human-services-mixed-elective-1','SDCM-0182','PSYC 312'],['human-services-mixed-elective-3','SDCM-0181','PSYC 380']]){
  const option=chosen(id);assert.equal(option.provider,'Study.com');assert.equal(option.code,code);assert.equal(option.receivingCode,receiving);
  assert.equal(option.credits,3);assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceUpper,true);assert.equal(option.upper,true);
  assert.equal(option.evidence,'published');assert.equal(option.eligibilityReview.eligibleToStart,true);
  assert(option.identitySourceIds.length>0);assert(option.recommendationStart<=review.checkedOn&&option.recommendationEnd>=review.checkedOn);
  assert.equal(option.degreePlacementEvidence.modelId,model.id);assert.equal(option.degreePlacementEvidence.requirementId,id);
 }
 assert.deepEqual(plan.rows.filter(row=>row.requirementId.startsWith('free-electives-')).map(row=>row.option.code),['SDCM-0173','SDCM-0207','SDCM-0172','SDCM-0209','SOPH-0022','SOPH-0025']);
 const outside=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+'|'+row.option.code)).size,outside.length);
 assert.deepEqual(CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{}).curriculumIssues,[]);
 assert.equal(JSON.stringify(model),before);
});

test('the retained CLI theology alternative stays conditional when explicitly selected',async()=>{
 const model=(await read('dist/data/curricula/liberty.json')).models.find(model=>model.id===canonical.modelId);
 const theology=model.requirements.find(row=>row.id==='theo-104'),alternative=theology.options.find(option=>option.provider==='Christian Leaders Institute');assert(alternative);
 const plan=Planner.generate(model,{providers:[...providers,'Christian Leaders Institute'],allowConditional:true,priority:'transfer',completed:[],optionSelections:{...model.reviewedBaselineChoices.optionSelections,'theo-104':alternative.id}});
 assert.equal(plan.rows.find(row=>row.requirementId==='theo-104').option.id,alternative.id);
 assert.equal(alternative.credits,4);assert.equal(alternative.providerListedCreditQuantity,3);
 assert.equal(alternative.sourceCredits,undefined);assert.equal(alternative.sourceCreditSystem,undefined);assert.equal(alternative.sourceCreditStatus,'unknown');
 assert.equal(assessPathwayQuality({model,plan,asOf:review.checkedOn}).publication.ready,false);
 assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
});
