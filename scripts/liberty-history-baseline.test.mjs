import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Planner from '../dist/planner.js';
import {assessPathwayQuality} from './pathway-quality.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const program=await read('content/pathway-kits/liberty/programs/history-bs-online.json');
const review=await read('content/curricula/snapshots/liberty/history-online-baseline-review-2026-11-24.json');
const model=(await read('dist/data/curricula/liberty-history-online.json')).models.find(value=>value.id===program.modelId);
const planFor=(value=model,selections=value.reviewedBaselineChoices.optionSelections)=>Planner.generate(value,{providers:value.defaultProviders,allowConditional:true,priority:'transfer',completed:[],optionSelections:selections,optimizationNodeBudget:12000});

test('History publishes a complete distinct 120-credit baseline while preserving residency and original credits',()=>{
 const plan=planFor(),quality=assessPathwayQuality({model,plan,asOf:review.checkedOn});
 assert.equal(quality.publication.ready,true);
 assert.equal(quality.research.blockingFindings,0);
 assert.equal(quality.research.conditionalFindings,0);
 assert.deepEqual([plan.totals.accounted,plan.totals.external,plan.totals.institutional,plan.totals.upper],[120,69,51,42]);
 assert.equal(plan.totals.majorInstitutional,36);
 assert.equal(plan.totals.confirmed,0);
 assert.equal(plan.totals.reported,0);
 assert(plan.rows.every(row=>row.status==='planned'&&row.option.evidence==='published'));
 assert.equal(plan.validation.academicCountsValid,true);
 assert.equal(plan.validation.policyChecksComplete,true);
 assert.deepEqual(plan.validation.errors,[]);
 const automatic=Planner.generate(model,{providers:model.defaultProviders,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
 assert.deepEqual(automatic.rows.map(row=>row.option.id),plan.rows.map(row=>row.option.id));
 const outside=plan.rows.filter(row=>row.option.provider!=='University');
 assert.equal(new Set(outside.map(row=>row.option.provider+'|'+row.option.code)).size,outside.length);
 for(const row of outside){
  assert.equal(row.option.credits,row.credits);
  assert(row.option.sourceCredits>0);
  assert.equal(row.option.sourceCreditSystem,'semester');
 }
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 assert.equal(model.requirements.filter(row=>row.category==='general').reduce((sum,row)=>sum+row.credits,0),36);
 assert.equal(model.requirements.filter(row=>row.category==='major').reduce((sum,row)=>sum+row.credits,0),42);
 assert.equal(model.requirements.filter(row=>row.freeElective).reduce((sum,row)=>sum+row.credits,0),42);
 assert.equal(model.majorResidencyBasisCredits,42);
 assert.equal(model.majorInstitutionFraction,.25);
 assert.equal(model.institutionMinCredits,30);
 assert.equal(model.externalMaxCredits,90);
 assert.equal(model.alternativeMaxCredits,undefined);
 assert.equal(model.requirements.find(row=>row.id==='univ-104').credits,3);
 assert.deepEqual(['rlgn-104','theo-104'].map(id=>model.requirements.find(row=>row.id===id).credits),[4,4]);
});

test('all fourteen free-elective choices have exact current receiving and separate independent identity evidence',()=>{
 const plan=planFor(),free=plan.rows.filter(row=>row.requirementId.startsWith('free-electives-'));
 assert.equal(free.length,14);
 assert.deepEqual(free.map(row=>row.option.code),['SDCM-0173','SDCM-0207','SDCM-0172','SDCM-0209','SOPH-0006','SOPH-0029','SOPH-0016','SOPH-0027','SOPH-0065','SOPH-0080','SOPH-0011','SOPH-0012','SOPH-0005','SOPH-0030']);
 for(const {requirementId,option} of free){
  const placement=option.degreePlacementEvidence;
  assert.equal(placement.modelId,model.id);
  assert.equal(placement.catalogYear,'2026-2027');
  assert.equal(placement.modality,'online');
  assert.equal(placement.requirementId,requirementId);
  assert.equal(placement.receivingCode,option.receivingCode);
  assert.equal(placement.credits,3);
  assert.equal(placement.creditSystem,'semester');
  assert.equal(placement.placementType,'free-elective');
  assert(placement.sourceIds.length);
  assert.equal(option.eligibilityReview.eligibleToStart,true);
  assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');
  assert.equal(option.sourceCreditEvidence.status,'reviewed');
  assert.equal(option.sourceCredits,review.choices.find(choice=>choice.requirementId===requirementId).sourceCredits);
  assert(option.identitySourceIds.length);
  assert(option.recommendationStart<=review.checkedOn&&option.recommendationEnd>=review.checkedOn);
  assert(!model.requirements.some(row=>row.code===option.receivingCode));
 }
 assert(!free.some(row=>['SOPH-0021','SOPH-0041','SOPH-0022','SOPH-0025'].includes(row.option.code)));
 assert.deepEqual(plan.rows.filter(row=>['hius-221','hius-222'].includes(row.requirementId)).map(row=>row.option.code),['SOPH-0022','SOPH-0025']);
});

test('HIST 491 retains the correct course alternatives, senior standing and online registration conditions',()=>{
 const row=model.requirements.find(row=>row.id==='hist-491'),method=model.requirements.find(row=>row.id==='hist-300');
 assert.deepEqual(row.prerequisites,['hist-300','hieu-322']);
 assert.equal(row.minimumCompletedCredits,72);
 assert.equal(row.registrationPolicy.seniorStatusRequired,true);
 assert.equal(row.registrationPolicy.minimumCompletedCredits,72);
 assert.equal(row.registrationPolicy.personalEligibilityConfirmed,false);
 const rule=row.prerequisitePolicy.rule;
 assert.equal(rule.allOf[0].code,'HIST 300');
 const alternatives=rule.allOf[1].anyOf.map(value=>value.code);
 assert(alternatives.includes('HIEU 322'));
 assert(!alternatives.includes('HIUS 313'));
 assert.equal(method.advisoryTiming.registrationRestriction,false);
 assert.match(method.advisoryTiming.message,/first semester of the junior year/);
 for(const fact of review.courseReviews){
  const requirement=model.requirements.find(value=>value.id===fact.requirementId);
  assert.equal(requirement.prerequisitePolicy.status,'verified');
  assert(requirement.offeringPolicy.offeredFormats.includes('Online'));
  assert.equal(requirement.offeringPolicy.actualSectionAvailabilityConfirmed,false);
  assert.deepEqual(requirement.prerequisitePolicy.rule,fact.rule);
 }
 assert(model.unresolved.some(value=>value.owner==='student'&&value.status==='personal-task'&&/72 earned semester credits/.test(value.message)));
});

test('conditional alternatives and a newly discovered academic question remain blocking when selected',()=>{
 const pending=model.requirements.find(row=>row.id==='hist-300').options.find(option=>option.provider==='Study.com'&&option.eligibilityReview?.eligibleToStart===false);
 assert(pending);
 const plan=planFor(model,{...model.reviewedBaselineChoices.optionSelections,'hist-300':pending.id});
 const quality=assessPathwayQuality({model,plan,asOf:review.checkedOn});
 assert.equal(quality.publication.ready,false);
 assert(quality.findings.some(value=>value.code==='provider-eligibility'&&value.blocking));
 const changed=structuredClone(model);
 changed.unresolved.push('A newly discovered academic rule remains unreviewed.');
 assert.equal(assessPathwayQuality({model:changed,plan:planFor(changed),asOf:review.checkedOn}).publication.ready,false);
 assert.deepEqual(program.modelFields.defaultProviders,['Sophia','Study.com','StraighterLine','CLEP','DSST']);
 const cli=model.requirements.find(row=>row.id==='theo-104').options.find(option=>option.provider==='Christian Leaders Institute');
 assert(cli&&cli.evidence==='conditional');
 assert.equal(planFor().rows.find(row=>row.requirementId==='theo-104').option.provider,'University');
});
