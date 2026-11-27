import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Planner from '../dist/planner.js';
import Sheet from '../dist/sheet-state.js';
import Journey from '../dist/journey-engine.js';
import Catalog from '../dist/program-catalog.js';
import View from '../dist/course-plan-view.js';
import {loadKit} from './pathway-factory/lib.mjs';
import {compileKit} from './pathway-factory/compile.mjs';
import {verifyKit} from './pathway-factory/verify.mjs';
import {assessPathwayQuality} from './pathway-quality.mjs';
import {REVIEW_PATH,validateAPUSReview,run} from './apus-associate-baselines-2026-11-27.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const review=await read(REVIEW_PATH),kit=await loadKit('content/pathway-kits/apus'),{doc}=compileKit(kit);
const models=review.programs.map(program=>({...doc.models.find(model=>model.id===program.modelId),sources:doc.sources}));
const generate=(model,extra={})=>Planner.generate(model,{providers:['Sophia'],allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000,...extra});
const byCode=(model,code)=>model.requirements.find(requirement=>requirement.code===code);
const quality=(model,plan)=>assessPathwayQuality({model,plan,asOf:'2026-11-27'});

test('APU cohort is reproducible, grounded in full primary bodies, and factory-verifiable',async()=>{
 await validateAPUSReview(review);assert.equal((await run({check:true})).changed,0);
 const checked=await verifyKit(kit,{asOf:'2026-11-27'});assert.deepEqual(checked.errors,[]);
 assert.equal(review.providerIdentities.length,14);assert.equal(review.courses.length,47);
 for(const course of review.courses){assert.equal(course.credits,3);assert.equal(course.creditSystem,'semester');assert(course.detailsQuote.includes('Course Code: '+course.code));}
});

test('source capture, receiving award, original identity and unit mutations fail their independent review gates',async()=>{
 const changes=[
  packet=>packet.finder.sha256='0'.repeat(64),
  packet=>packet.providerIdentities[0].receivingAwardQuote=packet.providerIdentities[0].receivingAwardQuote.replace('3 SH','4 SH'),
  packet=>packet.providerIdentities[0].original.sourceCreditSystem='quarter',
  packet=>packet.providerIdentities[0].original.aceId='SOPH-9999',
  packet=>packet.providerIdentities[0].original.recommendationEnd='2035-12-31',
  packet=>packet.scope.receivingInstitution='American Military University'
 ];
 for(const change of changes){const packet=structuredClone(review);change(packet);await assert.rejects(validateAPUSReview(packet));}
});

for(const model of models)test(model.title+' is a complete source-backed 30-outside/30-APU starting plan',()=>{
 assert.deepEqual(Catalog.validateModel(model,{id:model.id,school:model.school}),model,'The actual public runtime accepts every bounded option identifier and evidence reference');
 const plan=generate(model),report=quality(model,plan);
 assert.equal(model.school,'American Public University');assert.equal(model.institutionCode,'APU');assert.equal(model.catalogYear,'2026-2027');
 assert.equal(model.totalCredits,60);assert.equal(model.creditSystem,'semester');assert.equal(model.requirements.length,20);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),60);
 assert.deepEqual([model.externalMaxCredits,model.alternativeMaxCredits,model.institutionMinCredits],[45,30,15]);
 assert.equal(report.publication.ready,true);assert.deepEqual(report.findings,[]);assert.deepEqual(plan.validation.errors,[]);
 assert.deepEqual([plan.totals.external,plan.totals.alternative,plan.totals.institutional,plan.totals.confirmed,plan.totals.reported],[30,30,30,0,0]);
 assert.equal(plan.rows.every(row=>row.status==='planned'&&!row.selectionRequired&&row.option?.code&&row.option?.title),true);
 const selected=plan.rows.filter(row=>row.option.provider!=='University').map(row=>row.option.provider+'|'+row.option.code);assert.equal(new Set(selected).size,10);
 const codes=plan.rows.map(row=>row.option.provider==='University'?row.option.code:row.option.receivingCode);assert.equal(new Set(codes).size,20);
 for(const row of plan.rows.filter(row=>row.option.provider!=='University')){
  const option=row.option;assert.equal(option.evidence,'published');assert.equal(option.evidenceType,'official-receiving-school-equivalency');assert.equal(option.receivingInstitution,'American Public University');
  assert.equal(option.degreePlacementEvidence.modelId,model.id);assert.equal(option.degreePlacementEvidence.requirementId,row.requirementId);
  assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceCredits,3);
  assert(option.recommendationStart>=option.receivingAwardEffectiveStart&&option.recommendationEnd<=option.receivingAwardEffectiveEnd);
 }
 assert.equal(model.curriculumSections.flatMap(section=>section.requirementIds).length,20);
 const view=View.build({program:model,plan,state:{learning:[]},match:{completed:[]}},{});
 assert.deepEqual(view.curriculumIssues,[],'The public degree-plan renderer accepts every section and parent');
 assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),60);
 assert.equal(view.sections.find(section=>section.id==='general').credits,30);
 assert.equal(view.sections.find(section=>section.id==='capstone').credits,3);
 const leaves=node=>node.children.length?node.children.flatMap(leaves):[node];
 const visible=view.sections.flatMap(leaves).flatMap(section=>section.entries.flatMap(entry=>entry.requirementIds));
 assert.equal(visible.length,20);assert.equal(new Set(visible).size,20,'Each requirement remains visible exactly once');
 assert.equal(view.sections.flatMap(leaves).reduce((sum,section)=>sum+section.credits,0),60);
});

test('the runtime rejects an overlong option identifier instead of widening its validation boundary',()=>{
 const model=structuredClone(models[0]);model.requirements[0].options[0].id='x'.repeat(201);
 assert.throws(()=>Catalog.validateModel(model,{id:model.id,school:model.school}),/reviewed credit award or valid evidence/);
});

test('formal accounting/math alternatives and final-course requirements survive actual planner sequencing',()=>{
 const business=models.find(model=>model.title.includes('Business')),criminal=models.find(model=>model.title.includes('Criminal')),cyber=models.find(model=>model.title.includes('Cybersecurity'));
 assert.deepEqual(byCode(business,'FINC201').prerequisites,[byCode(business,'ACCT105').id]);
 assert.deepEqual(byCode(cyber,'MATH302').prerequisites,[byCode(cyber,'MATH110').id]);
 const last=byCode(criminal,'CMRJ295');assert.equal(last.minimumCompletedCredits,49);assert.equal(last.prerequisites.length,19);
 const capstone=byCode(cyber,'ISSC298');assert.equal(capstone.minimumCompletedCredits,57);assert.deepEqual(capstone.prerequisites,cyber.requirements.filter(row=>row.code.startsWith('ISSC')&&row.code!=='ISSC298').map(row=>row.id));
 for(const [model,code]of[[criminal,'CMRJ295'],[cyber,'ISSC298']]){const plan=generate(model);assert.equal(plan.validation.academicCountsValid,true);const order=plan.sequence;assert.equal(order.at(-1).code,code);}
});

test('an extra ACE course cannot raise APU alternative credit above 30',()=>{
 const model=models.find(model=>model.title.includes('Criminal')),plan=generate(model);assert.equal(plan.totals.alternative,30);
 const allOutside={};for(const requirement of model.requirements){const option=requirement.options.find(option=>option.provider==='Sophia');if(option)allOutside[requirement.id]=option.id;}
 const pinned=generate(model,{optionSelections:allOutside});assert(pinned.validation.errors.length>0||pinned.totals.alternative<=30,'No forced 33-credit nontraditional plan is valid');
});

test('new reviewed editions preserve every legacy open-slot model and private choice without migration',async()=>{
 const catalog={pathways:kit.school.routes,schools:[]};
 for(const packet of review.programs){
  const bytes=await readFile(new URL('../'+packet.legacyProgramPath,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),packet.legacyProgramSha256);
  const legacy=doc.models.find(model=>model.id===packet.legacyModelId);assert(legacy&&legacy.id!==packet.modelId);
  const oldSlot=legacy.requirements.find(requirement=>Planner.isOpenSlot(requirement));assert(oldSlot);
  let state=Journey.initialize(null,null,catalog);state.selectedPathwayId=packet.legacyRouteIds[0];
  state=Sheet.setSlotChoice(state,legacy.id,oldSlot.id,{code:'ARTH200',title:'My earlier Art Appreciation selection',credits:3});
  state.sheet.notes={[legacy.id]:{[oldSlot.id]:'PRIVATE-OLDER-NOTE'}};
  state.learning=[{id:'private-legacy-record',provider:'Former college',code:'OLD123',title:'Original course',credits:4,creditSystem:'quarter',status:'earned',evaluations:[]}];
  const before=structuredClone(state),serialized=JSON.stringify(state);
  for(const initialize of[Sheet.initialize,Journey.initialize]){const restored=initialize(serialized,null,catalog);assert.equal(restored.selectedPathwayId,before.selectedPathwayId);assert.deepEqual(restored.sheet.slotChoices,before.sheet.slotChoices);assert.deepEqual(restored.sheet.notes,before.sheet.notes);assert.deepEqual(restored.learning,before.learning);}
  assert.equal(Sheet.slotChoice(state,legacy.id,oldSlot.id).code,'ARTH200');assert.equal(Sheet.slotChoice(state,packet.modelId,oldSlot.id),null);
  assert.equal(Planner.isOpenSlot(legacy.requirements.find(row=>row.id===oldSlot.id)),true);
 }
});

test('published APU awards never escape to the unrevised bachelor programs or other System institutions',()=>{
 const rows=kit.equivalencies.equivalencies.filter(row=>row.id.startsWith('apu-reviewed-associates-2026-11-27-'));
 assert.equal(rows.length,14);for(const row of rows){assert.deepEqual(row.scope.programs,review.programs.map(program=>program.slug));assert.deepEqual(row.scope.levels,['associate']);assert.deepEqual(row.scope.catalogs,['2026-2027']);assert.equal(row.scope.all,undefined);}
 const bachelor=doc.models.find(model=>model.id==='curriculum-apus-bachelor-of-arts-in-management');assert(bachelor);assert.equal(bachelor.requirements.flatMap(row=>row.options).some(option=>option.mappingReviewId===review.id),false);
 for(const packet of review.programs)assert(kit.school.routes.some(route=>route.id===packet.route.id&&route.school==='American Public University'));
});
