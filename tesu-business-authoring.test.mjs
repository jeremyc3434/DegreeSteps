import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTESUBusinessBlocks,reviewedTESUBusinessSource} from './scripts/tesu-business-blocks.mjs';
import {preserveTESUBusinessEnrichments,assertTESUBusinessAcademicParity,buildReviewedTESUBusinessProgram} from './scripts/tesu-business-programs.mjs';
import {loadTESUBusinessPriceBasis,buildTESUBusinessTuitionBinding} from './scripts/tesu-business-metadata.mjs';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {checks} from './content/pathway-kits/tesu/guards.mjs';
import Planner from './dist/planner.js';

const degree=await reviewedTESUBusinessSource({id:'tesu-bsba-marketing-current-2026-11-26',kind:'university',title:'Current TESU Marketing curriculum',url:'https://tesu.smartcatalogiq.com/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bsba-in-marketing/',checked:'2026-11-26',capture:'content/source-captures/60df9ea927fc193a.txt'});
const blocks=await createTESUBusinessBlocks({slug:'bsba-marketing',title:'B.S.B.A. in Marketing',degreeSource:degree.source,degreeBody:degree.body});
const expected={slug:'bsba-marketing',modelId:'curriculum-tesu-bsba-marketing',modelFields:blocks.modelFields,modelSourceIds:blocks.modelSourceIds,requirements:blocks.requirements};
const pricing=buildTESUBusinessTuitionBinding({modelId:expected.modelId,catalogIdentity:expected.modelFields.catalogIdentity},await loadTESUBusinessPriceBasis());
expected.modelFields.tuitionComparison=pricing.tuitionComparison;expected.modelSourceIds.push(...pricing.modelSourceIds);
const known=new Set([...expected.modelSourceIds,'independently-reviewed-placement-source']);

test('business authoring round-trips independent placements and source enrichment while owning academic fields',()=>{
 const later=structuredClone(expected);
 later.modelSourceIds.push('independently-reviewed-placement-source');
 later.requirements[0].optionRows.push({row:'an-independently-owned-placement',mode:'an-independent-stage'});
 const replay=preserveTESUBusinessEnrichments(expected,later);
 assert.deepEqual(replay,later);assert.doesNotThrow(()=>assertTESUBusinessAcademicParity(later,expected,known));
 assert.deepEqual(preserveTESUBusinessEnrichments(expected,replay),replay);
});

test('business authoring never accepts unrelated academic, catalog, price or source tampering as enrichment',()=>{
 const mutations=[p=>p.requirements[0].credits=6,p=>p.requirements[0].optionRows[0].inline.code='UNRELATED-999',p=>p.requirements.find(r=>r.code==='BUS-4210').institutionalOnly=false,p=>p.modelFields.catalogIdentity.checkedOn='2026-11-25',p=>p.modelFields.upperGroupMinimums[0].credits=9,p=>p.modelFields.tuitionComparison.pricingSourceCheckedOn='2026-11-26',p=>p.modelFields.tuitionComparison.entryId='a-different-price',p=>p.modelFields.alternativeMaxCredits=120,p=>p.modelSourceIds.push('unretained-source'),p=>p.modelFields.sourceIds=[],p=>p.modelSourceIds=p.modelSourceIds.filter(id=>id!==degree.source.id)];
 for(const mutate of mutations){const changed=structuredClone(expected);mutate(changed);assert.throws(()=>assertTESUBusinessAcademicParity(changed,expected,known));}
});

test('source-backed course delivery and actual formal prerequisites cannot be changed by editing the review index',async()=>{
 const review=JSON.parse(await readFile('content/pathway-kits/tesu/business-expansion-review-2026-11-25.json','utf8')),index=JSON.parse(await readFile('content/pathway-kits/tesu/business-course-sources-2026-11-26.json','utf8'));
 const hr=review.programs.find(program=>program.slug==='bsba-human-resources-organizational-management');
 const changed=structuredClone(index);changed.courses.find(course=>course.code==='PSY-3630').deliveryMethods=['Online'];
 await assert.rejects(buildReviewedTESUBusinessProgram(hr,changed),/delivery methods/);
 const weakened=structuredClone(hr);delete weakened.prerequisites['PSY-3630'];delete weakened.originalPrerequisiteCodes['PSY-3630'];
 await assert.rejects(buildReviewedTESUBusinessProgram(weakened,index),/newly published formal prerequisite/);
 const marketing=structuredClone(review.programs.find(program=>program.slug==='bsba-marketing'));marketing.originalPrerequisiteCodes['MKT-4410']=['MKT-3060'];
 await assert.rejects(buildReviewedTESUBusinessProgram(marketing,index),/all formal prerequisite course codes/,'An advisory code cannot silently replace the University formal spelling');
});

test('each new degree has40distinct named University choices, including five independently sourced free courses',async()=>{
 const kit=await loadKit('content/pathway-kits/tesu'),distinct=checks.find(check=>check.name==='distinctNamedCourses');assert(distinct);
 for(const program of kit.programs.filter(p=>['bsba-human-resources-organizational-management','bsba-marketing','bs-general-management'].includes(p.slug))){
  const model=compileProgram(kit,program),choices=model.requirements.map(row=>[row.id,row.options.find(option=>option.provider==='University')]);
  assert.equal(choices.length,40);assert(choices.every(([,option])=>option?.code&&option.sourceIds.length));assert.equal(new Set(choices.map(([,option])=>option.code)).size,40);
  const free=model.requirements.filter(row=>row.freeElective).map(row=>row.options.find(option=>option.provider==='University').code);assert.deepEqual(free,['ART-1000','ANT-1010','PSY-1010','HIS-1210','BUS-1010']);
  const plan=Planner.generate(model,{providers:[],allowConditional:false,completed:[],optionSelections:Object.fromEntries(choices.map(([id,option])=>[id,option.id]))});
  assert.equal(plan.rows.length,40);assert(plan.rows.every(row=>row.option.provider==='University'));assert.equal(new Set(plan.rows.map(row=>row.option.code)).size,40);assert.equal(plan.validation.academicCountsValid,true);
  const wrong=structuredClone(model);wrong.requirements.find(row=>row.freeElective).options.find(option=>option.provider==='University').code='MAN-3110';
  if(program.slug!=='bsba-marketing')assert.throws(()=>distinct({models:[wrong]}),/counted once/,'A University-only duplicate is rejected by the academic authoring guard too');
 }
});
