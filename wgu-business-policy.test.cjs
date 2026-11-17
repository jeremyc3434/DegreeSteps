const test=require('node:test'),assert=require('node:assert/strict');
const document=require('./content/curricula/wgu.json'),review=require('./content/curricula/snapshots/wgu/bsmgt-202611-reviewed-university-policy.json');
const model=document.models.find(row=>row.id==='curriculum-wgu-catalog-ecceaa488637ac83');
test('the current university catalog supplies every named Business Management course and its CU award',()=>{
 assert.equal(model.catalog,'202605');assert.equal(model.creditSystem,'competency-unit');assert.equal(model.totalCredits,110);assert.equal(model.requirements.length,36);
 assert.deepEqual(model.requirements.map(row=>[row.id,row.code,row.title,row.credits]),review.curriculum.rows.map(row=>[row.id,row.code,row.title,row.awardedCUs]));
 assert.equal(new Set(model.requirements.map(row=>row.code)).size,36);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),110);
 assert(model.requirements.every(row=>row.sourceIds.includes('wgu-bsmgt-catalog-202611')));
});
test('nontransferable WGU courses and the capstone remain separate from the general transfer ceiling',()=>{
 const fixed=model.requirements.filter(row=>row.institutionalOnly);assert.deepEqual(fixed.map(row=>row.code).sort(),['C717','C721','D099','D175','D253','D361','QGT1','QHT1'].sort());
 assert.equal(fixed.reduce((sum,row)=>sum+row.credits,0),26);assert(fixed.every(row=>!row.options.length&&row.transferEligibility.status==='nontransferable'));
 assert.equal(model.externalMaxCredits,82.5);assert.equal(model.alternativeMaxCredits,82.5);assert.equal(model.institutionMinCredits,undefined);assert.equal(model.upperMinCredits,undefined);
 const policy=model.residencyPolicy;assert.equal(policy.interpretationStatus,'verified-additional-capstone');assert.equal(policy.fraction,.25);assert.equal(policy.capstoneCredits,4);assert.deepEqual(policy.capstoneRequirementIds,['bsmgt-business-management-capstone-written-project']);assert.equal(policy.conservativeSufficientCondition.minimumNonCapstoneInstitutionCUs,27.5);assert.equal(policy.conservativeSufficientCondition.basisCredits,110);assert.equal(policy.calculatedMinimumInstitutionCUs,31.5);assert(policy.sourceIds.includes('wgu-residency-policy-23797-20260918'));
});
test('current tuition includes resource charges once per term and keeps the application fee separate',()=>{
 const pricing=model.pricing;assert.equal(pricing.amount,4050);assert.equal(pricing.amount,pricing.tuitionPerTerm+pricing.resourceFeePerTerm);assert.equal(pricing.period,'6 months');assert.equal(pricing.effectiveTermsBeginning,'2026-10-01');assert.equal(pricing.oneTimeFees.length,1);assert.equal(pricing.oneTimeFees[0].amount,65);assert.equal(pricing.oneTimeFees[0].frequency,'one-time');
 assert.equal(model.pacePolicy.termMonths,6);assert.equal(model.pacePolicy.startDayOfMonth,1);assert.equal(model.pacePolicy.fullTimeMinimumCUsPerTerm,12);assert.equal(model.pacePolicy.transcriptDeadline.dayOfMonth,5);assert.equal(model.pacePolicy.transcriptDeadline.monthsBeforeStart,1);assert.equal(model.pacePolicy.transferBeforeInitialTerm,true);
});
test('approved receiving maps retain their independent original semester quantities and exact scope',()=>{
 const options=model.requirements.flatMap(row=>row.options);assert(options.length>0);assert(options.every(option=>option.evidence==='published'&&option.creditSystem==='competency-unit'&&option.sourceCreditSystem==='semester'&&option.universityMapRecord.programId===240));
 const law=model.requirements.find(row=>row.code==='D078').options.find(option=>option.code==='SOPH-0032');assert(law);assert.equal(law.sourceCredits,3);assert.equal(law.credits,2);
 assert.equal(model.requirements.find(row=>row.code==='D388').transferRecencyYears,5);assert.equal(model.requirements.find(row=>row.code==='C722').transferRecencyYears,5);assert.equal(model.requirements.find(row=>row.code==='C955').transferRecencyYears,undefined);
 assert.deepEqual(model.unresolved,[]);assert(model.personalEvaluationReminder);assert.equal(model.researchGaps.length,5);
 const upper=model.policyReview.find(row=>row.field==='upperMinCredits');assert.equal(upper.status,'resolved');assert.equal(upper.resolution,'covered-by-complete-named-curriculum');assert.deepEqual(upper.sourceIds,['wgu-bsmgt-catalog-202611','wgu-bsmgt-guide']);assert.equal(model.upperMinCredits,undefined);assert.equal(law.sourceCredits,3);assert.equal(law.credits,2);
});
