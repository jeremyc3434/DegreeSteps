import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Planner from '../dist/planner.js';
import CoursePlanView from '../dist/course-plan-view.js';
import {assessPathwayQuality} from './pathway-quality.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const program=await read('content/pathway-kits/liberty/programs/psychology-addictions-online.json');
const review=await read('content/curricula/snapshots/liberty/psychology-addictions-online-baseline-review-2026-11-24.json');
const providers=['Sophia','Study.com','StraighterLine','CLEP','DSST'];
const row=code=>program.requirements.find(row=>row.code===code);
const codes=rule=>rule?.type==='course'?[rule.code]:[...(rule?.allOf||[]),...(rule?.anyOf||[])].flatMap(codes);

test('Addictions retains the printed UNIV case, cognate and capstone in one complete 120-credit allocation',()=>{
 assert.equal(program.modelId,review.scope.modelId);assert.equal(program.catalog.replace('–','-'),review.scope.catalogYear);assert.deepEqual(program.modalities,['online']);
 assert.equal(program.requirements.length,39);assert.equal(program.requirements.reduce((sum,row)=>sum+row.credits,0),120);
 assert.deepEqual(program.modelFields.curriculumSections.map(section=>[section.id,section.requirementIds.reduce((sum,id)=>sum+program.requirements.find(row=>row.id===id).credits,0)]),[['general-education',36],['major-foundations',12],['major-core',39],['addictions-recovery-cognate',9],['free-electives',24]]);
 const ids=program.modelFields.curriculumSections.flatMap(section=>section.requirementIds);assert.equal(new Set(ids).size,39);assert.equal(ids.length,39);
 assert.deepEqual(program.modelFields.curriculumSections[0].sharedRequirementIds,['biol-102','psyc-101']);
 assert.equal(row('UNIV 104').credits,3);assert.equal(row('UNIV 104').institutionalOnly,true);assert(!program.requirements.some(row=>row.id==='free-electives-9'));
 assert.equal(row('PSYC 306').title,'Advanced Theory and Treatment of Substance Abuse');assert.equal(row('PSYC 306').credits,3);assert.equal(row('PSYC 306').selectionRequired,false);
 assert.equal(row('PSYC 491').credits,3);assert.equal(program.modelFields.majorResidencyBasisCredits,60);assert.equal(review.ledger.majorInstitutionCredits,15);assert.equal(program.modelFields.institutionMinCredits,30);assert.equal(program.modelFields.upperMinCredits,30);assert.equal(program.modelFields.externalMaxCredits,90);
 assert.equal(program.modelFields.alternativeMaxCredits,undefined);assert.equal(program.modelFields.appliedTransferWaiver,undefined);
 assert.equal(Object.keys(program.modelFields.reviewedBaselineChoices.optionSelections).length,39);
});

test('selected online Psychology prerequisites are complete and preserve the distinct online clauses',()=>{
 for(const fact of review.courseReviews){const requirement=row(fact.code);assert.deepEqual(requirement.prerequisitePolicy.rule,fact.rule);assert.deepEqual(requirement.prerequisites,fact.selectedPrerequisiteCodes.map(code=>row(code).id));assert(requirement.offeringPolicy.offeredFormats.includes('Online'));assert.equal(requirement.offeringPolicy.actualSectionAvailabilityConfirmed,false);}
 assert.deepEqual(row('PSYC 255').prerequisitePolicy.rule.anyOf.map(value=>value.code),['PSYC 200','PSYC 210','PSYC 101','GEED 201']);
 assert(row('PSYC 354').prerequisites.includes('math-121'));assert(row('PSYC 354').prerequisites.includes('psyc-255'));assert(row('PSYC 355').prerequisites.includes('psyc-354'));assert(row('PSYC 421').prerequisites.includes('psyc-355'));
 for(const code of ['PSYC 305','PSYC 306','PSYC 307'])assert(row(code).prerequisites.includes('psyc-255'));
 assert(!codes(row('PSYC 307').prerequisitePolicy.rule).includes('PSYC 305'));assert(codes(row('PSYC 307').prerequisitePolicy.publishedAlternatives.Residential).includes('PSYC 305'));
 assert.deepEqual(row('PSYC 491').prerequisites,['psyc-255','psyc-101']);assert(!codes(row('PSYC 491').prerequisitePolicy.rule).includes('PSYC 440'));assert(!program.requirements.some(row=>row.code==='PSYC 440'));
 assert.deepEqual(row('PSYC 491').offeringPolicy.offeredFormats,['Online']);assert.equal(row('PSYC 491').registrationPolicy.minimumPrerequisiteGrade,'C');assert.equal(row('PSYC 491').registrationPolicy.juniorOrSeniorStatusRequired,true);assert.equal(row('PSYC 491').registrationPolicy.minimumCompletedPsychologyCredits,18);assert.equal(row('PSYC 491').registrationPolicy.personalEligibilityConfirmed,false);
 assert(program.modelFields.unresolved.some(note=>note.owner==='student'&&note.status==='personal-task'&&/18 completed PSYC/.test(note.message)));
});

test('eight independent current provider identities fill only distinct three-credit unrestricted electives',async()=>{
 const bundle=await read('content/reuse/liberty-undergraduate-awards.json'),identity=new Map(bundle.providerCourses.map(course=>[course.id,course]));
 assert.equal(review.choices.length,8);assert.equal(new Set(review.choices.map(choice=>choice.provider+'|'+choice.providerCode)).size,8);assert.equal(new Set(review.choices.map(choice=>choice.receivingCode)).size,8);
 assert.deepEqual(review.choices.slice(0,4).map(choice=>[choice.providerCode,choice.receivingCode]),[['SDCM-0173','BUSI 302'],['SDCM-0207','BUSI 304'],['SDCM-0172','BUSI 311'],['SDCM-0209','BUSI 419']]);
 const fixed=new Set(program.requirements.filter(row=>!row.freeElective).flatMap(row=>[row.code,...(row.allowedCourseCodes||[])]));
 for(const choice of review.choices){
  const requirement=program.requirements.find(row=>row.id===choice.requirementId),award=bundle.awards.find(award=>award.id===choice.awardId),course=identity.get(award.providerCourseId);
  assert.equal(requirement.freeElective,true);assert.equal(requirement.category,'electives');assert.equal(requirement.credits,3);assert.equal(requirement.allowedCourseCodes,undefined);assert.equal(requirement.allowedCoursePrefixes,undefined);assert(!fixed.has(choice.receivingCode));
  assert.equal(course.provider,choice.provider);assert.equal(course.code,choice.providerCode);assert.equal(course.sourceCredits,3);assert.equal(course.sourceCreditSystem,'semester');assert.equal(award.credits,3);assert.equal(award.upper,choice.upper);assert.equal(award.receivingCode,choice.receivingCode);assert(award.scope.programIds.includes(program.modelId));assert(course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn);
  assert.equal(program.modelFields.reviewedBaselineChoices.optionSelections[choice.requirementId],choice.optionId);assert.deepEqual(choice.sourceIds,['liberty-psychology-addictions-online-2026']);
 }
 assert(!Object.values(program.modelFields.reviewedBaselineChoices.optionSelections).some(id=>/christian-leaders/.test(id)));
});

test('the generated Addictions baseline is fully named and published with 69 outside and 51 Liberty credits',async()=>{
 const doc=await read('dist/data/curricula/liberty.json'),model=doc.models.find(model=>model.id===program.modelId);
 const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:model.reviewedBaselineChoices?.optionSelections,optimizationNodeBudget:12000}),report=assessPathwayQuality({model,plan,asOf:'2026-11-24'});
 assert.equal(report.publication.ready,true);assert.equal(report.research.blockingFindings,0);assert.equal(report.research.conditionalFindings,0);
 assert.deepEqual([report.metrics.degreeCredits,report.metrics.feasibleOutsideCredits,report.metrics.conditionalOutsideCredits],[120,69,0]);assert.equal(plan.totals.institutional,51);assert.equal(plan.totals.upper,60);assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);assert(plan.rows.every(row=>row.status==='planned'&&!row.selectionRequired&&row.option.code&&row.option.title));
 const unique=plan.rows.filter(row=>row.option.provider!=='University').map(row=>row.option.provider+'|'+row.option.code);assert.equal(new Set(unique).size,unique.length);
 for(const choice of review.choices){const picked=plan.rows.find(row=>row.requirementId===choice.requirementId).option;assert.equal(picked.code,choice.providerCode);assert.equal(picked.receivingCode,choice.receivingCode);assert.equal(picked.evidence,'published');assert.equal(picked.eligibilityReview.eligibleToStart,true);assert.equal(picked.degreePlacementEvidence.modelId,model.id);assert.equal(picked.degreePlacementEvidence.requirementId,choice.requirementId);assert.equal(picked.degreePlacementEvidence.catalogYear,'2026-2027');assert.equal(picked.degreePlacementEvidence.modality,'online');assert.equal(picked.degreePlacementEvidence.placementType,'free-elective');}
 const view=CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{});assert.deepEqual(view.curriculumIssues,[]);assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),120);
 const children=view.sections.flatMap(section=>section.children);assert.deepEqual(children.map(section=>[section.id,section.credits]),[['general-education',36],['major-foundations',12],['major-core',39],['addictions-recovery-cognate',9],['free-electives',24]]);
 const automatic=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});assert.equal(assessPathwayQuality({model,plan:automatic,asOf:'2026-11-24'}).publication.ready,true);
 const cli=model.requirements.find(row=>row.id==='theo-104').options.find(option=>option.provider==='Christian Leaders Institute');assert(cli);assert.equal(cli.evidence,'conditional');assert(!plan.rows.some(row=>row.option.provider==='Christian Leaders Institute'));
});
