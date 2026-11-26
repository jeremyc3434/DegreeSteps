import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,kitsRoot,clone,inScope,sourceRefs} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {reviewInterdisciplinaryAA,reviewId} from './scripts/liberty-interdisciplinary-aa-baseline-2026-11-25.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import Planner from './dist/planner.js';
import CoursePlanView from './dist/course-plan-view.js';

const kit=await loadKit(kitsRoot+'/liberty'),canonical=kit.programs.find(program=>program.slug==='interdisciplinary-aa-online');
function modelFor(input=kit){
 const program=input.programs.find(program=>program.slug===canonical.slug),model=compileProgram(input,program);
 // Match the registry's generic institutional fallback for fixed requirements;
 // all elective choices and the retained UNIV option are authored in the kit.
 for(const row of model.requirements)if(!row.options.some(option=>option.provider==='University'))row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,upper:!!row.upper,creditSystem:'semester',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
 return model;
}
function planFor(model,selections=model.reviewedBaselineChoices.optionSelections,providers=['Sophia','Study.com','CLEP','DSST','StraighterLine']){return Planner.generate(model,{providers,allowConditional:false,priority:'transfer',completed:[],optionSelections:selections,optimizationNodeBudget:12000});}

test('Interdisciplinary A.A. retains the printed UNIV course and 20-credit elective allocation in a balanced 60-credit baseline',()=>{
 const rows=canonical.requirements,fields=canonical.modelFields,sum=values=>values.reduce((total,row)=>total+row.credits,0);
 assert.equal(sum(rows),60);assert.equal(sum(rows.filter(row=>row.category==='general')),39);assert.equal(sum(rows.filter(row=>row.category==='major')),21);assert.equal(sum(rows.filter(row=>row.freeElective)),20);
 assert.equal(rows.find(row=>row.id==='univ-104').credits,3);assert(!rows.some(row=>row.id==='interdisciplinary-general-electives-7'));
 assert.equal(fields.majorResidencyBasisCredits,21);assert.equal(fields.institutionMinCredits,15);assert.equal(fields.externalMaxCredits,45);assert.equal(fields.alternativeMaxCredits,undefined);assert.equal(fields.sharedPolicyResolution.majorResidencyBasisCredits,21);
 assert.equal(fields.appliedTransferWaiver,undefined);assert.equal(fields.assessmentsPassed,undefined);
 for(const code of ['RLGN 104','BIBL 104','THEO 104'])assert.equal(rows.find(row=>row.code===code).credits,4);
 assert.equal(fields.reviewedBaselineChoices.reviewId,reviewId);assert.deepEqual(Object.keys(fields.reviewedBaselineChoices.optionSelections).sort(),rows.map(row=>row.id).sort());
 assert.deepEqual(fields.curriculumSections.flatMap(section=>section.requirementIds).sort(),rows.map(row=>row.id).sort());
});

test('the fresh named baseline has 39 published outside credits and six Liberty major credits without student-earned awards',()=>{
 const model=modelFor(),plan=planFor(model),quality=assessPathwayQuality({model,plan,asOf:'2026-11-25'});
 assert.equal(quality.publication.ready,true,JSON.stringify(quality.findings));assert.equal(quality.research.blockingFindings,0);assert.equal(quality.research.conditionalFindings,0);
 assert.equal(plan.totals.accounted,60);assert.equal(plan.totals.external,39);assert.equal(plan.totals.institutional,21);assert.equal(plan.totals.majorInstitutional,6);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);
 assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);assert(plan.rows.every(row=>row.status==='planned'));
 const outside=plan.rows.filter(row=>row.option.provider!=='University');assert.equal(new Set(outside.map(row=>row.option.provider+'|'+row.option.code)).size,outside.length);
 for(const row of outside){const option=row.option,placement=option.degreePlacementEvidence;assert.equal(option.evidence,'published');assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.credits,3);assert.equal(placement.modelId,model.id);assert.equal(placement.requirementId,row.requirementId);assert.equal(placement.catalogYear,'2026-2027');assert.equal(placement.modality,'online');assert.equal(placement.receivingCode,option.receivingCode);assert(option.recommendationStart<='2026-11-25'&&option.recommendationEnd>='2026-11-25');}
 assert.deepEqual(plan.rows.filter(row=>row.requirementId.startsWith('interdisciplinary-general-electives')).map(row=>row.option.receivingCode||row.option.code),['HIUS 221','HIUS 222','ENVR 215','PHIL 201','PHIL 210','SOCI 200','INFT 102','INFT 103']);
 assert.deepEqual(CoursePlanView.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{}).curriculumIssues,[]);
});

test('reuse remains exact to the reviewed associate degree, online format, catalog and placement',()=>{
 const model=modelFor(),selection=canonical.modelFields.reviewedBaselineChoices.optionSelections,allSources=new Map(model.sources.map(source=>[source.id,source]));
 for(const row of canonical.requirements){const choice=(row.optionRows||[]).find(entry=>entry?.row?.startsWith('liberty-online-baseline-'));if(!choice)continue;const award=kit.equivalencies.equivalencies.find(value=>value.id===choice.row);assert(award.scope.programs.includes(canonical.slug));assert(!award.scope.all);assert(inScope(award,canonical,kit));assert(!inScope(award,{...canonical,slug:'unsupported-online-associate'},kit));const compiled=model.requirements.find(value=>value.id===row.id).options.find(option=>option.id===selection[row.id]);for(const ref of sourceRefs(compiled))assert(allSources.has(ref.id),ref.id);}
 assert(kit.programs.filter(program=>program.slug!==canonical.slug).every(program=>!program.modelFields.reviewedBaselineChoices||program.modelFields.reviewedBaselineChoices.reviewId!==reviewId));
});

test('the retained original PDF capture grounds the actual program, credits, residency and named registration facts',async()=>{
 const source=canonical.sources.find(source=>source.id===reviewId+'-catalog'),text=await readFile(source.capture,'utf8'),meta=JSON.parse(await readFile(source.capture.replace(/\.txt$/,'.json'),'utf8'));
 assert.equal(createHash('sha256').update(text).digest('hex'),meta.sha256);assert.equal(meta.documentSha256,source.sha256);assert.equal(meta.extractedOn,'2026-11-25');assert.equal(meta.fetchedAt,'2026-11-24T05:03:49.806Z');
 const normalize=value=>value.replace(/\s+/g,' ');
 for(const quote of ['Interdisciplinary Studies (A.A.) - Online','Choose 20-23 credit hours of General Electives 20-23','25% of major taken through Liberty University','15 Hours must be completed through Liberty University','UNIV 104 Instructional Technology for Successful Online Learning 3 Credit Hour(s)','INDS 200 Interdisciplinary Careers 1 Credit Hour(s)','INFT 102 PowerPoint 1 Credit Hour(s)','INFT 103 Excel 1 Credit Hour(s)','SOCI 200 Introduction to Sociology 3 Credit Hour(s)'])assert(normalize(text).includes(normalize(quote)),quote);
});

test('a conditional CLI selection and newly discovered research remain blockers; review application is idempotent',()=>{
 const model=modelFor(),row=model.requirements.find(row=>row.id==='theo-104'),cli=row.options.find(option=>option.provider==='Christian Leaders Institute');assert(cli);assert.equal(cli.evidence,'conditional');assert.equal(cli.sourceCredits,undefined);assert.equal(cli.providerListedCreditQuantity,3);
 const selections={...model.reviewedBaselineChoices.optionSelections,'theo-104':cli.id},plan=Planner.generate(model,{providers:['Sophia','Study.com','Christian Leaders Institute'],allowConditional:true,completed:[],priority:'transfer',optionSelections:selections});
 assert.equal(assessPathwayQuality({model,plan,asOf:'2026-11-25'}).publication.ready,false);assert.equal(cli.credits,4);
 const changed=clone({...kit,providers:undefined});changed.providers=kit.providers;changed.programs.find(program=>program.slug===canonical.slug).modelFields.unresolved.push('A new degree-specific rule requires research.');const reviewed=reviewInterdisciplinaryAA(changed),updated=modelFor(reviewed);assert.equal(assessPathwayQuality({model:updated,plan:planFor(updated),asOf:'2026-11-25'}).publication.ready,false);
 const repeated=reviewInterdisciplinaryAA(kit);assert.deepEqual(repeated.programs.find(program=>program.slug===canonical.slug),canonical);assert.deepEqual(repeated.equivalencies,kit.equivalencies);
});

test('Psychology and Business A.A. retain their distinct unresolved academic constraints',()=>{
 const psychology=kit.programs.find(program=>program.slug==='psychology-aa-online'),business=kit.programs.find(program=>program.slug==='business-aa-online');
 assert.equal(psychology.totalCredits,60);assert.equal(psychology.requirements.reduce((sum,row)=>sum+row.credits,0),60);assert(psychology.requirements.some(row=>row.code==='SOCI 200'));assert(!psychology.requirements.some(row=>row.code==='UNIV 104'));
 const allocation=psychology.modelFields.unresolved.find(note=>note.id==='liberty-psychology-aa-online-specific-research-hold-2026-11-25');assert(allocation);assert.equal(allocation.status,'unresolved');assert.match(allocation.message,/60–63/);assert.match(allocation.message,/PSYC 101 is a major course/);
 const conflict=business.modelFields.unresolved.find(note=>note.id==='liberty-business-aa-online-specific-research-hold-2026-11-25');assert(conflict);assert.equal(conflict.status,'unresolved');assert.match(conflict.message,/BUSI 301.*BUSI 105/);assert.match(conflict.message,/residentially only/);assert.equal(business.modelFields.assessmentsPassed,undefined);
});
