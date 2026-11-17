import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {completeTESUChoices,validateEvidence,evidencePath} from './scripts/complete-tesu-named-choices.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');
const model=JSON.parse(await readFile(new URL('./dist/data/tesu.json',import.meta.url),'utf8'));
const evidence=JSON.parse(await readFile(new URL('./'+evidencePath,import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value)),input={providers:['Sophia','Study.com','CLEP'],allowConditional:true,priority:'transfer',optimizationNodeBudget:12000};
const plan=Planner.generate(model,input);
test('TESU transfer-first plan fills all120 credits with actual named courses under its separate caps',()=>{
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.external,90);assert.equal(plan.totals.alternative,90);assert.equal(plan.totals.institutional,30);
 assert.equal(model.institutionMinCredits,15);assert.equal(model.externalMaxCredits,105);assert.equal(model.alternativeMaxCredits,90);
 for(const field of ['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits']){assert.equal(model.policyEvidence[field].value,model[field]);assert(model.policyEvidence[field].sourceIds.length);assert(model.policyEvidence[field].sourceIds.every(id=>model.sources.some(source=>source.id===id)));}
 assert(plan.rows.every(row=>row.option&&row.option.code&&!row.selectionRequired));
 assert(!plan.validation.errors.some(error=>['selection_required','duplicate_receiving_course','duplicate_source','alternative_cap','institution_residency','upper_minimum'].includes(error.code)));
 assert(plan.validation.errors.some(error=>error.code==='conditional_mapping'),'Existing outside candidates do not become individually approved transfer awards');
});
test('the six selected placeholder credits become named published TESU courses without adding outside claims',()=>{
 const old=clone(model);for(const id of ['elective2','elective3','elective4','elective5']){const row=old.requirements.find(row=>row.id===id),university=row.options.find(option=>option.provider==='University');university.code='ELECTIVE-'+id.slice(-1);university.selectionRequired=true;}
 const before=Planner.generate(old,input);assert.equal(before.rows.filter(row=>row.selectionRequired).reduce((total,row)=>total+row.credits,0),6);
 assert.equal(plan.rows.filter(row=>row.selectionRequired).length,0);assert.equal(before.totals.external,plan.totals.external);
 const beforeOutside=old.requirements.flatMap(row=>row.options).filter(option=>option.provider!=='University'),afterOutside=model.requirements.flatMap(row=>row.options).filter(option=>option.provider!=='University');assert.deepEqual(beforeOutside,afterOutside);
 for(const id of ['elective4','elective5']){const row=plan.rows.find(row=>row.requirementId===id);assert.equal(row.option.provider,'University');assert.equal(row.option.evidence,'published');assert(!/^ELECTIVE/.test(row.option.code));}
});
test('selected university elective options bind actual same-school course and curriculum sources',()=>{
 for(const choice of evidence.electiveChoices){const row=model.requirements.find(row=>row.id===choice.requirementId),option=row.options.find(option=>option.provider==='University');assert.equal(option.code,choice.code);assert.equal(option.title,choice.title);assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.creditOrigin,'institutional');assert.equal(option.selectionRequired,false);assert(row.sourceIds.includes('tesu-gm-current-program-2026-11-17'));for(const id of option.sourceIds){const source=model.sources.find(source=>source.id===id);assert(source&&source.checked==='2026-11-17');assert(['www.tesu.edu','www2.tesu.edu','tesu.smartcatalogiq.com'].includes(new URL(source.url).hostname));}}
 const fixedCodes=new Set(model.requirements.filter(row=>!/^elective[2-5]$/.test(row.id)).map(row=>row.code));assert(evidence.electiveChoices.every(choice=>!fixedCodes.has(choice.code)));
});
test('named-course supplement is idempotent and cannot change another university or residency route',()=>{
 assert.deepEqual(completeTESUChoices(model),model);for(const mutate of [m=>m.id='another-model',m=>m.school='Another University',m=>m.totalCredits=121,m=>m.creditSystem='quarter',m=>m.institutionMinCredits=6,m=>m.alternativeMaxCredits=105]){const bad=clone(model);mutate(bad);assert.throws(()=>completeTESUChoices(bad));}
 for(const mutate of [d=>d.sources[0].url='https://tesu.edu.attacker.test/catalog',d=>d.electiveChoices[0].sourceIds=['unknown'],d=>d.electiveChoices[0].creditSystem='quarter',d=>d.electiveChoices[0].credits=4,d=>d.electiveChoices[1].code=d.electiveChoices[0].code,d=>d.residency.separateWaiverOption.modeled=true]){const bad=clone(evidence);mutate(bad);assert.throws(()=>validateEvidence(bad));}
});
test('published prices and four-week course format do not become a complete degree quote or schedule',()=>{
 assert.deepEqual(model.publishedTuitionSchedule.standardPerCredit,{newJerseyAndPennsylvania:449,otherUSStates:584});assert.equal(model.publishedTuitionSchedule.flatRatePerTerm.maximumIncludedCredits,18);assert.equal(model.publishedFees.edisonAccelerateResidencyWaiver,3468);assert.equal(model.publishedFees.includedInDegreeTotal,false);
 assert.equal(model.publishedAcceleratedTiming.wholeDegreeWeeks,null);assert.equal(plan.timing.scenarioWeeks,null);assert.equal(plan.costs.costComplete,false);
 const accelerated=model.requirements.flatMap(row=>row.options).filter(option=>option.deliveryEvidence?.acceleratedSessionWeeks===4);assert.deepEqual(accelerated.map(option=>option.code),['PSY-1010']);assert(accelerated[0].studyMethods.includes('AC'));
 assert(model.internalResearchFindings.some(item=>item.id==='tesu-edx-not-general-management'&&item.status==='excluded'));
 assert(!model.requirements.flatMap(row=>row.options).some(option=>['ASU Universal Learner','TEL','Outlier','Upper Iowa','TESU TECEP'].includes(option.provider)),'No unsupported outside awards or exam residency were manufactured');
});
