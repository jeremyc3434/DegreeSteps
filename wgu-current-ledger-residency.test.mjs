import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import {REVIEW_PATH,validateResidencyReview,applyReviewedResidency,writeReviewedResidency,parseCatalogCourseTable,parseGuideCourseTable,courseTupleSha256} from './scripts/wgu-current-ledger-residency.mjs';

const read=async path=>JSON.parse(await readFile(path,'utf8')),clone=value=>structuredClone(value),require=createRequire(import.meta.url);
const Planner=require('./dist/planner.js'),Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Catalog=require('./dist/program-catalog.js');
const review=await read(REVIEW_PATH),kit=await loadKit('content/pathway-kits/wgu'),compiled=compileKit(kit).doc;
const expected=new Map([
  ['accounting-bs',[121,72,30.25]],['information-technology-management-bs',[112,64,28]],
  ['computer-science-bs',[121,51,30.25]],['software-engineering',[120,61,30]],['information-technology',[110,47,27.5]]
]);
function normalizedModel(id){const m=clone(compiled.models.find(model=>model.id===id));if(!m.sources)m.sources=clone(compiled.sources);for(const r of m.requirements)r.options.push({id:'university-'+r.id,provider:'University',code:r.code,title:r.title,credits:r.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:r.sourceIds,evidence:'published'});return m;}

test('five bounded current reviews compare every required course, descriptions, program guidelines and policy',async()=>{
  assert.equal(review.programs.length,5);assert.equal(review.automaticApprovals,0);
  for(const proof of review.programs){
    const program=kit.programs.find(program=>program.slug===proof.slug),verified=await validateResidencyReview(program,proof);
    assert.equal(verified.rows.length,proof.requirementCount);assert.equal(verified.published.total,proof.totalCredits);
    assert.equal(courseTupleSha256(verified.published.rows),courseTupleSha256(program.requirements));assert.deepEqual(proof.declaredCapstoneCodes,[]);assert.equal(proof.universalityClaim,false);
    const result=await applyReviewedResidency(program,{reviews:review});assert.deepEqual(result,program,'The source-backed application is stable and does not keep rewriting facts');
    assert.equal(program.modelFields.institutionMinCredits,expected.get(program.slug)[2]);assert.equal(program.modelFields.residencyPolicy,undefined);
    for(const evidence of ['ledger','catalogue','guidelines','policy','descriptions'])assert(program.sources.some(source=>source.id===proof[evidence].sourceId&&source.sha256===proof[evidence].sha256));
  }
  assert.deepEqual((await verifyKit(kit,{asOf:'2026-11-26'})).errors,[]);assert.equal(await runGuards(kit,compiled),7);
});

test('the newer BSIT guide is bound to 202608 rather than silently inheriting the older 202604 catalog table',async()=>{
  const proof=review.programs.find(program=>program.programCode==='BSIT'),program=kit.programs.find(program=>program.slug===proof.slug),body=await readFile(proof.catalogue.capture,'utf8');
  assert.equal(proof.catalogue.mode,'guide-title-table');assert.equal(parseGuideCourseTable(body,{...proof,expectedRows:program.requirements}).rows.length,35);
  const older=await readFile('content/source-captures/11364ddcdee75d27.txt','utf8');assert.throws(()=>parseCatalogCourseTable(older,proof),/different program catalog/);
  assert.throws(()=>parseGuideCourseTable(body,{...proof,catalog:'202604',expectedRows:program.requirements}),/same program edition/);
});

test('all five plans are complete and ready with the previously researched outside mix and no student awards',()=>{
  for(const proof of review.programs){
    const model=normalizedModel(proof.modelId),[total,outside,floor]=expected.get(proof.slug),providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))];
    const plan=Planner.generate(model,{providers,allowConditional:false,completed:[],optimizationNodeBudget:12000});
    assert.equal(plan.validation.academicCountsValid,true,model.id+': '+JSON.stringify(plan.validation.errors));assert.equal(plan.validation.policyChecksComplete,true);
    assert.equal(plan.totals.external,outside);assert.equal(plan.totals.institutional,total-outside);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);assert(plan.totals.institutional>=floor);
    assert.equal(assessPathwayQuality({model,asOf:'2026-11-26',plan}).publication.ready,true,model.id);
    assert(model.requirements.every(row=>!row.institutionalOnly||row.options.every(option=>option.provider==='University')),'The guide-protected courses remain at the institution');
  }
});

test('raw canonical plans reach Journey review-ready rather than obsolete research notices',()=>{
  const models=review.programs.map(proof=>normalizedModel(proof.modelId)),routes=models.map(model=>({id:model.routeIds[0],modelId:model.id,title:model.title,school:model.school,level:'bachelor',modalities:['online'],paceModel:'competency-subscription',degreeCredits:model.totalCredits,creditUnit:model.creditSystem,subjects:['any'],goals:['any-degree','career-growth']})),catalog=Catalog.merge({pathways:routes},{programs:[]});
  for(const route of catalog.pathways){const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog),draft=Journey.buildDraft(state,catalog,models);assert.equal(draft.plan.readiness,'review-ready',route.id+': '+JSON.stringify(draft.plan.validation.errors));assert.deepEqual(draft.targetIssues,[]);assert.deepEqual(draft.targetUnknowns,[]);assert(!draft.plan.researchTasks.some(task=>task.code==='program_research'));}
});

test('changed degree identity, quantity, catalog, scope and retained evidence cannot inherit a residency closure',async()=>{
  const proof=review.programs.find(proof=>proof.programCode==='BSCS'),program=kit.programs.find(program=>program.slug===proof.slug);
  for(const mutate of [p=>p.catalog='202612',p=>p.totalCredits++,p=>p.requirements[0].credits++,p=>p.requirements[0].code='D999',p=>p.requirements[0].title='Different course',p=>p.level='master']){const broken=clone(program);mutate(broken);await assert.rejects(()=>validateResidencyReview(broken,proof));}
  for(const mutate of [p=>p.universalityClaim=true,p=>p.programId=244,p=>p.college='BU',p=>p.declaredCapstoneCodes=['D683'],p=>p.catalogue.sha256='0'.repeat(64),p=>p.descriptions.sha256='0'.repeat(64),p=>p.courseTupleSha256='0'.repeat(64)]){const broken=clone(proof);mutate(broken);await assert.rejects(()=>validateResidencyReview(program,broken));}
});

test('the known AI Engineering capstone counterexample is rejected even though its title omits the word capstone',async()=>{
  const proof=review.programs.find(proof=>proof.programCode==='BSCS'),broken=clone(proof);
  const rows=JSON.parse(await readFile('content/source-captures/fc24b19fc69e3d20.txt','utf8'))[0].courses;
  const program={kind:'pathway-kit-program',slug:'ai-engineering-held-fixture',modelId:'held-ai-fixture',level:'bachelor',catalog:'202607',totalCredits:121,requirements:rows.map(row=>({code:row.courseCode,title:row.courseName,credits:Number(row.competencyUnits)}))};
  Object.assign(broken,{slug:program.slug,modelId:program.modelId,programCode:'BSAIE',programId:244,catalog:'202607',totalCredits:121,requirementCount:40,courseTupleSha256:courseTupleSha256(program.requirements)});
  for(const[kind,name]of Object.entries({ledger:'fc24b19fc69e3d20',catalogue:'43428c7e4c483293',guidelines:'8e546ed90bb52352'})){const sidecar=await read('content/source-captures/'+name+'.json');broken[kind]={sourceId:'held-ai-'+kind,capture:'content/source-captures/'+name+'.txt',url:sidecar.url,sha256:sidecar.sha256};}
  await assert.rejects(()=>validateResidencyReview(program,broken),/declared capstone/);
});

test('the WGU guard requires the bounded review and keeps numerical, source and course identities intact',async()=>{
  for(const mutate of [m=>delete m.currentLedgerResidencyReview,m=>delete m.institutionMinCredits,m=>{delete m.institutionMinCredits;delete m.currentLedgerResidencyReview;delete m.policyEvidence.institutionMinCredits;},m=>m.institutionMinCredits=0,m=>m.currentLedgerResidencyReview.universalityClaim=true,m=>m.currentLedgerResidencyReview.courseTupleSha256='0'.repeat(64),m=>m.currentLedgerResidencyReview.policy.sha256='0'.repeat(64),m=>m.requirements[0].title='Renamed course',m=>m.catalog='202701']){const broken=clone(compiled),model=broken.models.find(model=>model.id===review.programs[0].modelId);mutate(model);await assert.rejects(()=>runGuards(kit,broken));}
  await writeReviewedResidency({check:true});
});
