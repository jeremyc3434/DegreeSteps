import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,sourceRefs} from './pathway-factory/lib.mjs';
import {compileProgram,runGuards} from './pathway-factory/compile.mjs';
import Planner from '../dist/planner.js';
import {assessPathwayQuality} from './pathway-quality.mjs';
import CoursePlanView from '../dist/course-plan-view.js';

const reviewId='liberty-residential-psychology-baseline-2026-11-25';
const kit=await loadKit(new URL('../content/pathway-kits/liberty',import.meta.url).pathname);
const canonical=kit.programs.find(program=>program.slug==='psychology-bs-residential');
const reviewedRows=kit.equivalencies.equivalencies.filter(row=>row.mappingReviewId===reviewId);
const model=compileProgram(kit,canonical);
// Apply only the registry's documented generated institutional option step;
// no school augmentation, global build or write occurs in this focused test.
for(const row of model.requirements)if(!row.options.some(option=>option.provider==='University'))row.options.push({id:'university-'+row.id,provider:'University',title:row.title,...(row.code?{code:row.code}:{}),credits:row.credits,upper:Boolean(row.upper),creditSystem:'semester',creditOrigin:'institutional',sourceIds:[...row.sourceIds],evidence:'published'});
const clone=value=>JSON.parse(JSON.stringify(value));
const planFor=(input,selections=input.reviewedBaselineChoices.optionSelections,providers=['Sophia','Study.com'],allowConditional=false)=>Planner.generate(input,{providers,allowConditional,priority:'transfer',completed:[],optionSelections:selections,optimizationNodeBudget:12000});
const plan=planFor(model);
const quality=(input,planned=planFor(input))=>assessPathwayQuality({model:input,plan:planned,asOf:'2026-11-25'});

test('residential Psychology has a complete feasible 60-outside and 60-Liberty baseline',()=>{
 const report=quality(model,plan);
 assert.equal(report.publication.ready,true);
 assert.equal(report.research.blockingFindings,0);
 assert.equal(report.research.conditionalFindings,0);
 assert.deepEqual([plan.totals.accounted,plan.totals.external,plan.totals.institutional,plan.totals.majorInstitutional,plan.totals.upper],[120,60,60,27,54]);
 assert.deepEqual(plan.validation.errors,[]);
 assert.equal(plan.validation.academicCountsValid,true);
 assert.equal(plan.validation.policyChecksComplete,true);
 assert.equal(plan.totals.confirmed,0);
 assert.equal(plan.totals.reported,0);
 assert.equal(new Set(plan.rows.filter(row=>row.option.provider!=='University').map(row=>row.option.provider+'|'+row.option.code)).size,20);
 assert.deepEqual(Object.keys(canonical.modelFields.reviewedBaselineChoices.optionSelections).sort(),canonical.requirements.map(row=>row.id).sort());
 assert.deepEqual(CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{}).curriculumIssues,[]);
});

test('new awards keep campus receiving evidence and independently dated original provider identities',()=>{
 assert.equal(reviewedRows.length,20);
 const sources=new Map(model.sources.map(source=>[source.id,source]));
 for(const row of reviewedRows){
  assert.equal(row.authored,true);
  assert.deepEqual(row.scope.programs,['psychology-bs-residential']);
  assert.deepEqual(row.scope.modalities,['campus']);
  assert.deepEqual(row.scope.catalogs,['2026–2027']);
  assert(row.sourceIds.some(id=>sources.get(id)?.url.startsWith('https://www.liberty.edu/residential/')));
  assert.equal(row.identity.sourceCredits,3);
  assert.equal(row.identity.sourceCreditSystem,'semester');
  assert(row.identity.recommendationStart<='2026-11-25'&&row.identity.recommendationEnd>='2026-11-25');
  assert(row.identity.identitySourceIds.every(id=>!row.sourceIds.includes(id)));
  assert.equal(row.extra.degreePlacementEvidence.modelId,model.id);
  assert.equal(row.extra.degreePlacementEvidence.modality,'campus');
  assert.equal(row.extra.eligibilityReview.eligibleToStart,true);
  assert.equal(row.extra.residentialPsychologyAwardReview.individualAwardsCreated,0);
  assert(sourceRefs(row).every(ref=>sources.has(ref.id)));
 }
 assert.equal(model.alternativeMaxCredits,undefined);
 assert.equal(model.externalMaxCredits,90);
 assert.equal(model.institutionMinCredits,30);
 assert.equal(model.majorResidencyBasisCredits,51);
 assert.equal(model.policyReview.find(note=>note.field==='alternativeMaxCredits').status,'not-applicable');
});

test('fresh campus captures ground every exact receiving award and retain the independently reviewed provider identities',async()=>{
 const sources=new Map(model.sources.map(source=>[source.id,source])),bodies=new Map();
 for(const row of reviewedRows){
  assert.equal(row.quotes.length,1);const quote=row.quotes[0],source=sources.get(quote.sourceId);assert(source);assert.equal(source.modality,'campus');assert.equal(source.checked,'2026-11-25');assert(row.sourceIds.includes(source.id));
  if(!bodies.has(source.id)){const text=await readFile(new URL('../'+source.capture,import.meta.url),'utf8'),meta=JSON.parse(await readFile(new URL('../'+source.capture.replace(/\.txt$/,'.json'),import.meta.url),'utf8'));assert.equal(createHash('sha256').update(text).digest('hex'),meta.sha256);assert.equal(source.captureSha256,meta.sha256);assert.equal(source.sourceContentHash,'sha256:'+meta.sha256);assert.equal(meta.finalUrl,source.url);bodies.set(source.id,text);}
  assert(bodies.get(source.id).includes(quote.text));assert(quote.text.startsWith(row.code+' '));assert(quote.text.includes(' '+row.receivingCode+' '+row.receivingTitle+' 3'));assert.equal(row.extra.guideUpdated,row.provider==='Sophia'?'2026-11':'2026-05');
 }
});

test('PSYC 497 and all retained institutional requirements preserve their actual format and prerequisite rules',()=>{
 const chosen=id=>plan.rows.find(row=>row.requirementId===id).option;
 const capstone=canonical.requirements.find(row=>row.id==='psyc-497');
 assert.equal(chosen('psyc-497').code,'PSYC 497');
 assert.equal(chosen('psyc-497').provider,'University');
 assert.equal(capstone.credits,3);
 assert.deepEqual(capstone.prerequisites,['psyc-101','psyc-255']);
 assert(capstone.offeringPolicy.offeredFormats.includes('Residential'));
 assert.equal(capstone.offeringPolicy.actualSectionAvailabilityConfirmed,false);
 assert.equal(capstone.registrationPolicy,undefined);
 assert.equal(chosen('univ-101').credits,1);
 assert.equal(chosen('inft-110').credits,3);
 for(const id of ['rlgn-105','evan-101','bibl-105','bibl-110','theo-201','theo-202'])assert.equal(chosen(id).provider,'University');
 assert.equal(chosen('free-electives-11').code,'PHED 208');
 assert.equal(chosen('free-electives-11').credits,2);
 assert.deepEqual(plan.rows.filter(row=>/^free-electives-(?:6|7|8|9|10)$/.test(row.requirementId)).map(row=>row.option.code),['PSYC 305','PSYC 306','PSYC 307','PSYC 308','PSYC 309']);
 for(const id of ['free-electives-8','free-electives-9','free-electives-10'])assert(canonical.requirements.find(row=>row.id===id).prerequisites.includes('free-electives-6'));
 assert.equal(model.appliedTransferWaiver,undefined);
 assert.equal(model.assessmentsPassed,undefined);
});

test('real unreviewed alternatives and newly unresolved academic facts still block publication',()=>{
 const pending=model.requirements.find(row=>row.id==='evan-101').options.find(option=>option.provider==='Christian Leaders Institute');
 const conditionalPlan=planFor(model,{...model.reviewedBaselineChoices.optionSelections,'evan-101':pending.id},['Sophia','Study.com','Christian Leaders Institute'],true);
 assert.equal(conditionalPlan.rows.find(row=>row.requirementId==='evan-101').option.id,pending.id);
 assert.equal(quality(model,conditionalPlan).publication.ready,false);
 const unresolved=clone(model);unresolved.unresolved.push('A newly discovered residential Psychology academic rule has not been reviewed.');
 assert.equal(quality(unresolved).publication.ready,false);
});

test('existing Liberty degree and award guards accept the reviewed model without weaker publication rules',async()=>{
 assert((await runGuards(kit,{models:[model]}))>0);
});
