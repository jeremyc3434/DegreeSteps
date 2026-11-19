import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyLibertyVerifiedBasics} from './scripts/liberty-verified-basics.mjs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const review=read('content/reviews/strong-route-known-basics-2026-11-17.json');
const sourceModels=()=>read('content/curricula/liberty.json').models;
const baseline=()=>read('dist/data/liberty.json');

test('published Liberty prices preserve the residential band and online semester-load threshold',()=>{
 for(const input of sourceModels()){
  const model=applyLibertyVerifiedBasics(input,review);
  assert.equal(model.pricing.currency,'USD');assert.equal(model.pricing.catalogYear,'2026-2027');
  assert.deepEqual(model.requirements,input.requirements,'Known pricing cannot create or promote a transfer course');
  if(input.format==='Residential'){
   assert.equal(model.pricing.model,'banded-term');assert.equal(model.pricing.termRate,12695);assert.equal(model.pricing.bandMin,12);assert.equal(model.pricing.bandMax,18);assert.equal(model.pricing.partTimeRate,870);assert.equal(model.pricing.summerRate,475);assert.equal(model.pricing.amount,undefined);
  }else{
   assert.equal(model.pricing.model,'threshold-credit');assert.equal(model.pricing.fullTimeRate,410);assert.equal(model.pricing.partTimeRate,475);assert.equal(model.pricing.fullTimeMin,12);assert.equal(model.publishedFees.find(fee=>fee.id==='technology').amount,349);
  }
  for(const id of model.pricing.sourceIds)assert(model.sources.some(source=>source.id===id&&source.url.startsWith('https://')));
  assert.deepEqual(applyLibertyVerifiedBasics(model,review),model,'Repeated compilation must not duplicate facts');
 }
});

test('Liberty facts fail closed across wrong school, catalog, degree total, format or untrusted source',()=>{
 const input=baseline();
 for(const patch of [{school:'Different college'},{catalog:'2027-2028'},{totalCredits:124},{format:'Online'}])assert.throws(()=>applyLibertyVerifiedBasics({...input,...patch},review));
 const other={...input,id:'unreviewed-degree'};assert.equal(applyLibertyVerifiedBasics(other,review),other);
 const bad=structuredClone(review);bad.sources.find(source=>source.id==='liberty-residential-tuition-2026-2027-reviewed').url='https://example.com/tuition';assert.throws(()=>applyLibertyVerifiedBasics(input,bad));
 const repriced=structuredClone(review);repriced.liberty.pricing.Residential.termRate=410;assert.throws(()=>applyLibertyVerifiedBasics(input,repriced));
});

test('known residency and duplicate-credit policies are bound while selected-option research and personal prerequisites stay separate',()=>{
 const model=applyLibertyVerifiedBasics(baseline(),review);
 assert.equal(model.policyEvidence.institutionMinCredits.value,30);assert.equal(model.policyEvidence.externalMaxCredits.value,90);assert.equal(model.policyEvidence.majorInstitutionFraction.value,.25);
 const texts=model.unresolved.map(item=>typeof item==='string'?item:item.message).join(' ');
 assert.match(texts,/one-credit university fallback/);assert.match(texts,/BUSI 201/);assert.match(texts,/recommendation version/);
 const duplicate=model.unresolved.find(note=>/duplicate-credit check/.test(note.message));assert.equal(duplicate.owner,'student');assert.equal(duplicate.status,'personal-task');assert(duplicate.sourceIds.includes('liberty-residential-duplicate-credit-2026-11-18'));
 assert(!model.unresolved.some(note=>note.status==='unresolved'&&/duplicate-award exclusions/.test(note.message)),'reviewed duplicate policy is not an unresolved research task');
 const fallback=model.unresolved.find(note=>note.selectionRequiredOnly===true);assert.equal(fallback.scope,'selected-options');assert.equal(fallback.blocking,false);assert.deepEqual(fallback.requirementIds,['free-teams-1','free-it-career-1']);
 const identity=model.unresolved.find(note=>note.missingEvidence==='reviewed-source-identity');assert.equal(identity.scope,'selected-options');assert.equal(identity.blocking,false);
 assert(!texts.includes('Confirm major residency calculation,'));
 const waiver=model.unresolved.find(item=>item.appliesWhen==='transfer-waiver');assert.equal(waiver.owner,'student');assert.equal(waiver.status,'personal-task');
 assert.equal(model.requirements.find(row=>row.id==='free-teams-1').options.find(option=>option.provider==='University').selectionRequired,true);
 assert.equal(model.majorMinInstitutionCredits,18,'Do not silently reduce a conservative existing course bound');
 assert.equal(model.policyEvidence.majorResidencyBasisCredits.value,66);
 assert(model.policyEvidence.majorResidencyBasisCredits.sourceIds.includes('liberty-interdisciplinary-degree-2026-2027-reviewed'));
 assert(!model.rulesNotes.some(note=>/confirm the university denominator/.test(note)));
 assert(model.rulesNotes.some(note=>/fractional amount is 16.5 credits/.test(note)));
 assert.equal(model.verifiedBasicsReview.personalAwardsCreated,0);
});

test('the exact current major-course ledger guards against silent curriculum drift',()=>{
 const input=baseline(),changed=structuredClone(input);changed.requirements.find(row=>row.code==='BUSI 105').code='BUSI 999';
 assert.throws(()=>applyLibertyVerifiedBasics(changed,review));
 const duplicate=structuredClone(input);duplicate.requirements.find(row=>row.code==='BUSI 343').code='BUSI 336';assert.throws(()=>applyLibertyVerifiedBasics(duplicate,review));
 const invalid=structuredClone(review);invalid.liberty.baselineMajorLedger.majorRequirementBlocks[0].credits=15;assert.throws(()=>applyLibertyVerifiedBasics(input,invalid));
});

test('published BUSI prerequisite rules are known while personal assessment results stay unknown',()=>{
 const input=baseline(),model=applyLibertyVerifiedBasics(input,review),computer=model.requirements.find(row=>row.id==='busi-201').prerequisitePolicy,inquiry=model.requirements.find(row=>row.id==='busi-205').prerequisitePolicy;
 assert.equal(computer.status,'verified');assert.equal(computer.catalogYear,'2026-2027');assert.deepEqual(computer.rule.anyOf.slice(0,2),[{type:'course',code:'INFT 110'},{type:'course',code:'INFT 111'}]);
 assert.deepEqual(computer.rule.anyOf[2].allOf.map(test=>[test.code,test.minimumCatalogScore]),[['INFT Excel Test',5],['INFT PowerPoint Test',5],['INFT Word Test',5]]);
 assert.deepEqual(inquiry.rule.allOf,[{type:'course',code:'BUSI 201'},{anyOf:[{type:'course',code:'INQR 101'},{type:'assessment',code:'Inquiry Assessment',minimumCatalogScore:80}]}]);assert.equal(inquiry.requiredCourseModality,'Residential');
 assert.equal(model.assessmentPlanningScenario.status,'conditional');assert.equal(model.assessmentPlanningScenario.personalAssessmentStatus,'unknown');assert.equal(model.assessmentPlanningScenario.assessmentsAssumedPassed,false);assert.equal(model.assessmentPlanningScenario.alternativeCourseCreditsIncluded,false);assert.equal(model.assessmentPlanningScenario.extraAcademicCredits,0);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120,'Prerequisite metadata does not award credits or change the degree ledger');
 const tasks=model.unresolved.filter(item=>item.owner==='student'&&item.status==='personal-task'&&item.requirementIds?.some(id=>['busi-201','busi-205'].includes(id)));assert.equal(tasks.length,2);assert(tasks.every(task=>task.sourceIds.every(id=>model.sources.some(source=>source.id===id))));
 assert(!model.unresolved.some(item=>(typeof item==='string'?item:item.message)==='Confirm placement and prerequisite alternatives, especially BUSI 201 and residential BUSI 205.'));
 const claimedPass=structuredClone(review);claimedPass.liberty.baselinePrerequisites.assessmentScenario.assessmentsAssumedPassed=true;assert.throws(()=>applyLibertyVerifiedBasics(input,claimedPass));
});

test('accounting known major rule is separated from personal records without dropping prerequisite research',()=>{
 const input=sourceModels().find(model=>model.id==='curriculum-liberty-accounting-bs-residential'),model=applyLibertyVerifiedBasics(input,review);
 assert.equal(model.majorResidencyBasisCredits,69);assert.equal(model.majorInstitutionFraction,.25);
 assert(model.unresolved.some(item=>item.owner==='student'&&item.status==='personal-task'));
 assert(model.unresolved.some(item=>item.owner==='DegreePath'&&item.status==='unresolved'&&/prerequisites/.test(item.message)));
 const resolved=model.unresolved.find(item=>item.status==='resolved'&&/69-credit/.test(item.message));
 assert(resolved.sourceIds.every(id=>model.sources.some(source=>source.id===id)));
});
