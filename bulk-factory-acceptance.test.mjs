/** Independent release acceptance for the reusable school batch factory.
 * The 45-model oracle predates this implementation. Candidate/research counts
 * must never become publication counts or a student's earned-credit record. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm,writeFile,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import Catalog from './dist/program-catalog.js';
import Planner from './dist/planner.js';
import Sheet from './dist/sheet-state.js';
import Journey from './dist/journey-engine.js';
import {readCohortInputs,buildCohortPlan} from './scripts/pathway-factory/cohort.mjs';
import {loadProgramManifests,createProgramManifestRegistry,selectProgramManifests} from './scripts/pathway-factory/program-manifest.mjs';
import {buildSchoolResearchBatch,captureBatch,schoolConfigurations,readVerifiedSchoolCaptures} from './scripts/build-school-research-batch.mjs';
import {captureJobFingerprint} from './scripts/pathway-factory/school-capture-ledger.mjs';
import {runBatch,readRetainedBatchCaptures} from './scripts/pathway-factory/batch.mjs';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {adoptReviewedChoicePools,champlainChoicePacketPath} from './scripts/pathway-factory/reviewed-choice-pools.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [golden,registry,publication,quality,baselineIndex,library,courseIndex,pathways,directory]=await Promise.all([
  read('./test-support/fixtures/bulk-factory/released-45-83eb4ad.json'),
  read('./dist/data/curriculum-registry.json'),read('./dist/data/publication-index.json'),
  read('./dist/data/pathway-quality-report.json'),read('./dist/data/baseline-index.json'),
  read('./dist/data/plan-library-index.json'),read('./dist/data/plan-course-index.json'),
  read('./dist/data/pathways.json'),read('./dist/data/program-catalog.json')
]);
const ready=publication.plans.filter(plan=>plan.publicationReady),readyById=new Map(ready.map(plan=>[plan.modelId,plan]));
const reports=new Map(quality.programs.map(report=>[report.modelId,report]));
const baselines=Object.values(baselineIndex.baselines),packs=new Map();
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(pathways,directory),registry),publication,registry);
const units=rows=>rows.reduce((total,row)=>total+row.credits,0);
const code=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
async function modelFor(modelId){
  const entry=registry.models.find(entry=>entry.id===modelId);assert(entry,modelId+' registry identity');
  if(!packs.has(entry.path))packs.set(entry.path,await read('./dist/'+entry.path));
  const pack=packs.get(entry.path),model=(pack.models||[pack]).find(model=>model.id===modelId);
  assert(model,modelId+' runtime model');return model;
}
const optionFor=(model,row)=>model.requirements.find(requirement=>requirement.id===row.requirementId)?.options.find(option=>option.id===row.optionId);

test('the independently frozen 45 published degree contracts survive bulk expansion',async()=>{
  assert.equal(golden.releaseCommit,'83eb4ad8d6769e0cd09af8c276e541ff864e1b0b');
  assert.equal(golden.sourceAcademicRevision,'academic-v1:05a13de7931842f440df5a568520a6d6508a249cebd96c6b909748cef606ef07');
  assert.equal(golden.models.length,45);assert.equal(new Set(golden.models.map(model=>model.modelId)).size,45);
  for(const expected of golden.models){
    const receipt=readyById.get(expected.modelId),model=await modelFor(expected.modelId),report=reports.get(expected.modelId);
    assert(receipt,expected.modelId+' remains actually publication-ready');
    assert.equal(model.school,expected.school);assert.equal(model.level,expected.academicLevel);
    assert.equal(model.totalCredits,expected.degreeUnits);assert.equal(model.creditSystem,expected.creditSystem);
    assert.equal(String(model.catalogYear||model.catalog||'').replace(/[–—]/g,'-'),expected.catalog);
    assert.equal(model.requirements.length,expected.requirementCount);assert.equal(units(model.requirements),expected.degreeUnits);
    assert.equal(report.publication.ready,true);assert.equal(report.research.completeRequirementLedger,true);
    assert.equal(report.research.completeNamedBaseline,true);assert.equal(report.research.academicCountsValid,true);
    assert.equal(report.research.blockingFindings,0);assert.equal(report.metrics.conditionalOutsideCredits,0);
    assert(report.metrics.publishedOutsideCredits>=expected.minimumPublishedOutsideUnits,expected.modelId+' preserves established outside-credit gains');
    for(const field of ['reportedRecordsCount','confirmedRecordsCount','awardedCreditsInBaseline'])assert.equal(report.execution[field],0);
    for(const routeId of expected.routeIds){
      assert(receipt.routeIds.includes(routeId),routeId+' remains a valid incoming route');
      assert.equal(library.plans[routeId]?.modelId,expected.modelId);assert.equal(library.plans[routeId]?.tier,'reviewed');
    }
    for(const previous of expected.baselines){
      const baseline=baselines.find(baseline=>baseline.modelId===expected.modelId&&baseline.pathwayId===previous.pathwayId);
      assert(baseline,previous.pathwayId+' published baseline remains available');
      assert.equal(baseline.qualityReady,true);assert.equal(baseline.validation.academicCountsValid,true);assert.equal(baseline.validation.policyChecksComplete,true);
      assert.equal(baseline.summary.totalCredits,expected.degreeUnits);assert(baseline.summary.transferCredits>=previous.minimumOutsideUnits);
      assert.equal(units(baseline.rows),expected.degreeUnits);assert(baseline.rows.every(row=>row.status==='planned'));
    }
  }
});

test('all historical selected receiving awards retain exact identities, quantities, units and recommendation versions',async()=>{
  // Better new choices may change the optimized selection, but cannot silently
  // rewrite or remove the established evidence behind a student's saved choice.
  for(const expected of golden.models){
    const model=await modelFor(expected.modelId);
    for(const baseline of expected.baselines)for(const previous of baseline.rows){
      const option=optionFor(model,previous);assert(option,model.id+' retains saved choice '+previous.optionId);
      for(const [field,value]of Object.entries(previous))if(!['requirementId','optionId'].includes(field)){
        assert.deepEqual(option[field],value,model.id+' '+previous.requirementId+' '+field+' remains exact');
      }
    }
  }
});

test('discovery, matching and counts follow only actual publication receipts, never a cohort target',()=>{
  assert.equal(publication.curriculumFingerprint,Catalog.publicationFingerprint(registry));
  assert.equal(publication.privateRecordsIncluded,false);assert.equal(baselineIndex.privateRecordsIncluded,false);
  const expected=[...readyById.keys()].sort(),offered=Catalog.planLibraryRoutes(catalog);
  assert.deepEqual(offered.map(route=>route.modelId).sort(),expected);assert.equal(new Set(offered.map(route=>route.modelId)).size,expected.length);
  assert.deepEqual(Object.values(courseIndex.plans).map(plan=>plan.modelId).sort(),expected);
  assert.equal(quality.summary.publicationReady,expected.length);assert.equal(courseIndex.selectionPolicy,'publication-ready-models-v1');
  for(const route of offered){assert.equal(library.plans[route.id]?.published,true);assert.equal(library.plans[route.id]?.tier,'reviewed');}
  // Source capture, numerical feasibility and reviewed metadata cannot clear
  // these independent unresolved institutional prerequisites or policy scopes.
  for(const modelId of ['curriculum-tesu-bsba-marketing','curriculum-wgu-bs-ai-engineering-reviewed','tesu-general-management'])assert(!readyById.has(modelId),modelId+' is still held until its own evidence clears');
});

test('every current published baseline is named, totals correctly, and awards a receiving course only once',async()=>{
  for(const receipt of ready){
    const model=await modelFor(receipt.modelId);
    for(const baseline of baselines.filter(baseline=>baseline.modelId===model.id&&receipt.routeIds.includes(baseline.pathwayId))){
      assert.equal(units(baseline.rows),model.totalCredits);
      const receiving=[],original=new Map();
      for(const row of baseline.rows){
        const option=optionFor(model,row);assert(option,model.id+' named baseline choice');
        assert.equal(row.status,'planned');assert.equal(row.credits,option.credits);assert(option.code,model.id+' no unnamed University fallback');
        const institution=option.provider==='University',award=code(institution?option.code:option.receivingCode);
        if(award)receiving.push(award);
        if(institution)continue;
        assert.equal(option.evidence,'published',model.id+' outside choices need exact published awards');
        const key=option.provider+'|'+code(option.code),rows=original.get(key)||[];rows.push({row,option});original.set(key,rows);
      }
      assert.equal(new Set(receiving).size,receiving.length,model.id+' cannot allocate a receiving course twice');
      for(const rows of original.values())if(rows.length>1){
        const first=rows[0].option;assert(first.bundleId&&Number.isFinite(first.bundleCredits),model.id+' repeated original learning needs a reviewed bundled award');
        assert(rows.every(({option})=>option.bundleId===first.bundleId&&option.bundleCredits===first.bundleCredits));
        assert(rows.reduce((n,{row})=>n+row.credits,0)<=first.bundleCredits,model.id+' cannot overallocate an original award');
      }
    }
  }
});

for(const modelId of ['curriculum-tesu-bs-general-management','curriculum-wgu-bs-computer-science-reviewed']){
  test(modelId+' adopting a reusable plan proposes coursework without manufacturing completed student credit',async()=>{
    const receipt=readyById.get(modelId);assert(receipt,modelId+' actual publication receipt');
    const model=await modelFor(modelId),route=Catalog.planLibraryRoutes(catalog).find(route=>route.modelId===modelId);
    assert(route);const baseline=baselines.find(baseline=>baseline.modelId===modelId&&receipt.routeIds.includes(baseline.pathwayId));assert(baseline);
    const providers=[...new Set(baseline.rows.map(row=>row.provider).filter(provider=>provider!=='University'))];
    let state=Sheet.initialize(null,null,catalog);
    state=Sheet.selectPathway(state,route,catalog);
    state.scenarios[modelId]={...state.scenarios[modelId],providers,allowConditional:false,optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId]))};
    const before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,[model]);
    assert(draft.plan,modelId+' usable proposed plan');assert.equal(JSON.stringify(state),before,'Reading a route never mutates student state');
    assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.validation.policyChecksComplete,true);
    assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);assert.equal(draft.plan.coverage.conditionalExternalCredits,0);
    assert.equal(state.learning.length,0);assert(draft.plan.rows.every(row=>row.status==='planned'));
    assert.equal(Planner.validate(model,draft.plan).academicCountsValid,true);
  });
}

test('the actual next-20 cohort accounts for complete scoped blockers and grants zero publication approvals',async()=>{
  const inputs=await readCohortInputs({asOf:quality.asOf}),cohort=buildCohortPlan({...inputs,asOf:quality.asOf,target:20});
  const readyIds=ready.map(plan=>plan.modelId).sort();assert.deepEqual(cohort.currentReadyModelIds,readyIds);
  assert.equal(cohort.summary.currentReady,readyIds.length);assert.equal(cohort.targetAdditionalPrograms,20);
  assert.equal(cohort.selectedModelIds.length,Math.min(20,cohort.summary.candidateInventory));
  assert.equal(new Set(cohort.selectedModelIds).size,cohort.selectedModelIds.length);
  assert(cohort.selectedModelIds.every(id=>!readyById.has(id)),'Existing published plans cannot inflate the additional cohort');
  assert(!cohort.selectedModelIds.includes('tesu-general-management'),'The separately retained legacy draft does not consume a new-program slot');
  assert.equal(cohort.academicallyVerified,false);assert.equal(cohort.automaticApprovals,0);assert.equal(cohort.summary.automaticApprovals,0);
  assert.equal(cohort.privateStudentRecordsIncluded,false);assert.equal(cohort.algorithm.heuristic,true);assert.equal(cohort.algorithm.optimalityClaim,false);
  assert.equal(cohort.summary.potentialReady,cohort.programs.filter(program=>program.potentialReadyIfAllResearchSucceeds).length);
  for(const program of cohort.programs){
    const model=inputs.models.find(model=>model.id===program.modelId),report=inputs.quality.programs.find(report=>report.modelId===program.modelId);
    assert(model&&report);assert.equal(report.publication.ready,false);assert.equal(program.scope.school,model.school);
    assert.equal(program.scope.creditSystem,model.creditSystem);assert.equal(program.scope.catalog,model.catalogYear||model.catalog||null);
    assert.deepEqual(program.blockingFindingIds,report.findings.filter(finding=>finding.blocking).map(finding=>finding.id).sort());
    for(const finding of report.findings.filter(finding=>finding.blocking)){
      const coverage=program.findingDependencies.find(item=>item.findingId===finding.id);assert(coverage,'Every blocker must be accounted for');
      assert(coverage.fullyRepresented||program.unrepresentedBlockers.some(item=>item.findingId===finding.id),'No blocker can disappear behind a queue-only count');
      for(const taskId of coverage.taskIds){
        const task=cohort.dependencies.find(task=>task.id===taskId);assert(task);assert.equal(task.automaticApproval,false);assert.deepEqual(task.scope,program.scope);
        assert(task.contexts.some(context=>context.modelId===program.modelId&&context.findingId===finding.id),'Reusable work retains exact program placement context');
      }
    }
    assert.equal(program.potentialReadyIfAllResearchSucceeds,program.unrepresentedBlockers.length===0);
  }
  for(const group of cohort.sourceWorkGroups)assert.equal(group.automaticApprovals,0,'A shared capture URL cannot approve all its claims');
  assert.deepEqual(buildCohortPlan({...inputs,asOf:quality.asOf,target:20}),cohort,'The same retained inputs produce the same cohort');
  const changed=structuredClone(inputs),first=changed.models.find(model=>model.sources?.length);
  first.sources[0].sha256='f'.repeat(64);
  try{
    assert.notEqual(buildCohortPlan({...changed,asOf:quality.asOf,target:20}).revision,cohort.revision,'A changed source body cannot reuse the old cohort revision');
  }catch(error){
    // Exact queue claims may already pin this body, in which case rebuilding
    // fails closed until the academic queue is refreshed rather than caching a
    // new proposal from internally inconsistent evidence.
    assert.match(error.message,/Stale original-course or receiving-award identity|[Ss]tale.*source/);
  }
  const policyChanged=structuredClone(inputs);policyChanged.models[0].externalMaxCredits=(policyChanged.models[0].externalMaxCredits||0)+1;
  assert.notEqual(buildCohortPlan({...policyChanged,asOf:quality.asOf,target:20}).revision,cohort.revision,'A changed receiving-school policy invalidates the cohort revision');
});

test('a new data-only authoring entry registers without inheriting approvals or crossing school scope',async()=>{
  const actual=await loadProgramManifests({validateBindings:true});
  const document=structuredClone(actual.documents.find(document=>document.school.id==='tesu'));assert(document);
  const example=structuredClone(document.programs[0]),id='qa-new-program';
  example.slug=id;example.modelId='curriculum-tesu-'+id;example.title='QA synthetic programme';
  example.programPath=document.school.kitPath+'/programs/'+id+'.json';example.outputPath='content/curricula/tesu-'+id+'.json';example.routeIds=['tesu-'+id];
  example.pricing.comparison.modelId=example.modelId;
  // A reviewed ledger can be registered without adding a production-code case.
  // It remains authoring inventory; retained canonical evidence and all gates
  // are still required before the programme could ever be offered to students.
  example.stages=[];delete example.authoring;delete example.metadataBasis;
  document.programs.push(example);
  const registered=createProgramManifestRegistry([document]);assert(registered.get(example.modelId));
  assert.equal(registered.get(example.modelId).publicationAuthority,'existing-academic-gates');
  assert.equal(readyById.has(example.modelId),false);assert(!Catalog.planLibraryRoutes(catalog).some(route=>route.modelId===example.modelId));
  assert(selectProgramManifests(registered,{schoolId:'tesu'}).some(entry=>entry.modelId===example.modelId));
  assert.equal(selectProgramManifests(registered,{schoolId:'wgu'}).length,0);
  const foreign=structuredClone(document);foreign.programs.at(-1).schoolId='wgu';
  assert.throws(()=>createProgramManifestRegistry([foreign]),/school scope/,'Registration must reject foreign-school inheritance');
  const inventedApproval=structuredClone(document);inventedApproval.programs.at(-1).published=true;
  assert.throws(()=>createProgramManifestRegistry([inventedApproval]),/cannot set published/,'A new roster entry is never a publication receipt');
});

test('bounded durable captures resume real progress, verify retained bodies, and invalidate changed scope or contracts',async()=>{
  const outputDir=await mkdtemp(join(tmpdir(),'degreesteps-bulk-capture-')),calls=[];
  const manifest={schemaVersion:1,revision:'synthetic-unchanged-research',school:schoolConfigurations.liberty,modality:'online',policyRevision:'policy-v1',validatorRevision:'validator-v1',
    sources:[1,2,3].map(number=>({id:'source-'+number,url:'https://www.liberty.edu/qa-source-'+number,roles:['academic-policy']})),
    jobs:[1,2,3].map(number=>({id:'capture-source-'+number,sourceId:'source-'+number,url:'https://www.liberty.edu/qa-source-'+number,inputFingerprint:'exact-program-scope-'+number}))};
  const snapshot=JSON.stringify(manifest),publicBefore=await readFile(new URL('./dist/data/publication-index.json',import.meta.url),'utf8');
  const capture=async source=>{
    calls.push(source.id);const body=Buffer.from('Retained primary source body '+source.id+'\n');
    return {body,receipt:{sourceId:source.id,url:source.url,finalUrl:source.url,status:'captured',contentType:'text/plain',capturedAt:'2026-11-26T12:00:00.000Z',sourceContentHash:'sha256:'+createHash('sha256').update(body).digest('hex'),reviewStatus:'unreviewed',evidenceEffect:'none'}};
  };
  try{
    const one=await captureBatch(manifest,{outputDir,limit:1,concurrency:1,capture});assert.equal(one.capturedSources,1);assert.equal(one.remainingJobs,2);
    const two=await captureBatch(manifest,{outputDir,limit:1,concurrency:1,capture});assert.equal(two.capturedSources,1);assert.equal(two.reusedSources,1);assert.equal(two.remainingJobs,1);
    assert.deepEqual(calls,['source-1','source-2'],'Resume advances beyond the captured first source');
    const three=await captureBatch(manifest,{outputDir,limit:3,capture});assert.equal(three.capturedSources,1);assert.equal(three.reusedSources,2);assert.equal(three.remainingJobs,0);
    const reused=await captureBatch(manifest,{outputDir,limit:3,capture});assert.equal(reused.capturedSources,0);assert.equal(reused.reusedSources,3);assert.equal(calls.length,3);
    const verified=await readVerifiedSchoolCaptures(manifest,{outputDir});assert.equal(verified.length,3);
    assert(verified.every(source=>source.reviewStatus==='unreviewed'&&source.evidenceEffect==='none'&&!Object.hasOwn(source.receipt,'reviewedAt')));
    assert.equal(JSON.stringify(manifest),snapshot,'Capturing sources cannot edit academic input metadata');
    const changedSource=structuredClone(manifest);changedSource.sources[0].sourceContentHash='sha256:'+'f'.repeat(64);
    const sourceRefresh=await captureBatch(changedSource,{outputDir,limit:3,capture});assert.equal(sourceRefresh.invalidatedJobs,1);assert.equal(sourceRefresh.capturedSources,1);assert.equal(sourceRefresh.reusedSources,2);
    const policy=structuredClone(changedSource);policy.policyRevision='policy-v2';
    const policyRefresh=await captureBatch(policy,{outputDir,limit:3,capture});assert.equal(policyRefresh.invalidatedJobs,3);assert.equal(policyRefresh.reusedSources,0);
    const validator=structuredClone(policy);validator.validatorRevision='validator-v2';
    const validatorRefresh=await captureBatch(validator,{outputDir,limit:3,capture});assert.equal(validatorRefresh.invalidatedJobs,3);assert.equal(validatorRefresh.reusedSources,0);
    const newPlacement=structuredClone(validator);newPlacement.jobs[0].inputFingerprint='different-program-placement';
    const placementRefresh=await captureBatch(newPlacement,{outputDir,limit:3,capture});assert.equal(placementRefresh.invalidatedJobs,1);assert.equal(placementRefresh.reusedSources,2);
    const ledger=JSON.parse(await readFile(join(outputDir,'capture-ledger.json'),'utf8'));
    await writeFile(join(outputDir,ledger.jobs['capture-source-1'].capture.bodyPath),'Corrupted cached body');
    assert.equal((await readVerifiedSchoolCaptures(newPlacement,{outputDir})).length,2,'A body hash mismatch is never reused as research evidence');
    const repair=await captureBatch(newPlacement,{outputDir,limit:3,capture});assert.equal(repair.invalidatedJobs,1);assert.equal(repair.failedSources,1);assert.equal(repair.capturedSources,0,'Corrupted immutable evidence needs restoration instead of being overwritten');
    const campus=structuredClone(newPlacement);campus.modality='campus';
    assert.notEqual(captureJobFingerprint(newPlacement,newPlacement.jobs[0]),captureJobFingerprint(campus,campus.jobs[0]));
    await assert.rejects(captureBatch(campus,{outputDir,limit:3,capture}),/different school or delivery format/,'A delivery change cannot silently inherit captured ledger scope');
    assert.equal(await readFile(new URL('./dist/data/publication-index.json',import.meta.url),'utf8'),publicBefore,'Public source retrieval alone never publishes a plan');
  }finally{await rm(outputDir,{recursive:true,force:true});}
});

test('the integrated controller shares a bounded capture budget and reuses verified sources and component drafts without approval',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-bulk-controller-')),requests=[];
  const batches=['liberty','tesu'].map(schoolId=>{
    const school=schoolConfigurations[schoolId],source={id:schoolId+'-policy',url:'https://www.'+school.officialDomains[0]+'/qa-policy',kind:'academic-policy'};
    return {schemaVersion:1,revision:schoolId+'-manifest-v1',school,modality:'online',policyRevision:'policy-v1',validatorRevision:'validator-v1',sources:[source],jobs:[{id:'capture-'+source.id,sourceId:source.id,url:source.url,inputFingerprint:schoolId+'-exact-scope'}]};
  });
  const plan={revision:'synthetic-controller-plan-v1',schoolBatches:batches,unsupportedSchools:[],cohort:{selectedModelIds:['candidate-liberty','candidate-tesu'],summary:{currentReady:ready.length,plannedCandidates:2,potentialReady:0,automaticApprovals:0},dependencies:batches.map(batch=>({id:batch.school.id+'-review',scope:{school:batch.school.name,modality:'online'},sources:batch.sources,automaticApproval:false}))}};
  const capture=async source=>{
    requests.push(source.id);const body=Buffer.from(source.id+' policy\nTransfer students may bring up to 90 semester transfer credits; institutional residency remains at least 30 credits.\n');
    return {body,receipt:{sourceId:source.id,url:source.url,finalUrl:source.url,status:'captured',contentType:'text/plain',capturedAt:'2026-11-26T12:00:00.000Z',sourceContentHash:'sha256:'+createHash('sha256').update(body).digest('hex'),reviewStatus:'unreviewed',evidenceEffect:'none'}};
  };
  let aiCalls=0;
  const options={base,asOf:quality.asOf,limit:1,concurrency:1,capture:true,complete:async()=>{aiCalls++;throw Error('AI must remain opt-in');},dependencies:{
    inputs:{models:[]},buildBatchPlan:async()=>structuredClone(plan),
    captureBatch:(manifest,options)=>captureBatch(manifest,{...options,capture}),
    readRetainedBatchCaptures:async()=>({captures:[],rejected:[],availableSources:0,deferredSources:0})
  }};
  const publicBefore=await readFile(new URL('./dist/data/publication-index.json',import.meta.url),'utf8');
  try{
    const first=await runBatch(options);assert.equal(first.summary.capturedSources,1);assert.deepEqual(requests,['liberty-policy'],'Global capture budget applies across all schools');
    assert.equal(first.summary.newReadyPlans,0);assert.equal(first.summary.academicPublicationAllowed,false);assert.equal(first.summary.automaticApprovals,0);
    const second=await runBatch(options);assert.equal(second.summary.capturedSources,1);assert.equal(second.summary.reusedCaptures,1);assert.equal(second.state.inputChanged,false);
    assert.deepEqual(requests,['liberty-policy','tesu-policy'],'Resume proceeds to the next school instead of spending the run on a previously captured source');
    const third=await runBatch(options);assert.equal(third.summary.capturedSources,0);assert.equal(third.summary.reusedCaptures,2);assert.equal(requests.length,2);
    assert(third.summary.draftComponents>=2);assert(third.summary.componentCache.hits>=2,'Unchanged bound source text is extracted once');assert.equal(aiCalls,0);
    const folder=join(base,third.outputDir),reviews=JSON.parse(await readFile(join(folder,'review-tasks.json'),'utf8')),components=JSON.parse(await readFile(join(folder,'components.json'),'utf8'));
    assert.equal(reviews.academicPublicationAllowed,false);assert.equal(reviews.automaticApprovals,0);
    assert.equal(reviews.reviewTasks.length,2);
    for(const task of reviews.reviewTasks){
      assert.equal(task.reviewStatus,'needs-review');assert.equal(task.automaticApproval,false);assert.equal(task.candidateEvidenceOnly,true);assert(task.candidateComponentIds.length>0);assert.equal(task.componentIds,undefined,'Source-linked candidates are not proof that an academic finding is resolved');
      for(const id of task.candidateComponentIds){const component=components.components.find(component=>component.id===id);assert(component);assert(task.sources.some(source=>source.url===component.binding.sourceURL),'Draft evidence remains bound to this exact task source');assert.equal(component.publicationAllowed,false);assert.equal(component.reviewStatus,'unreviewed');}
    }
    plan.revision='synthetic-controller-plan-v2';plan.schoolBatches[0].validatorRevision='validator-v2';
    const changed=await runBatch(options);assert.equal(changed.state.inputChanged,true);assert.equal(changed.summary.capturedSources,1);assert.equal(changed.summary.newReadyPlans,0);
    assert.equal(await readFile(new URL('./dist/data/publication-index.json',import.meta.url),'utf8'),publicBefore);
    await assert.rejects(runBatch({...options,outputDir:join(base,'content','pathway-kits')}),/inside outputs/,'The controller cannot target canonical academic content');
  }finally{await rm(base,{recursive:true,force:true});}
});

test('concurrent controller runs cannot overwrite a live run, and its lock is released when work finishes',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-bulk-lock-'));
  let release,entered;const hold=new Promise(resolve=>{release=resolve;}),inside=new Promise(resolve=>{entered=resolve;});
  const plan={revision:'lock-check',schoolBatches:[],unsupportedSchools:[],cohort:{selectedModelIds:[],dependencies:[],summary:{currentReady:ready.length,plannedCandidates:0}}};
  const dependencies={inputs:{models:[]},buildBatchPlan:async()=>plan,readRetainedBatchCaptures:async()=>({captures:[],rejected:[],deferredSources:0}),draftComponents:async()=>{entered();await hold;return {components:[],cache:{hits:0,misses:0}};}};
  const first=runBatch({base,dependencies});
  try{
    await inside;
    await assert.rejects(runBatch({base,dependencies}),/already has a runner/,'Only one process may write this run and its component cache');
    release();assert.equal((await first).state.status,'run-complete');
    assert.equal((await runBatch({base,dependencies})).state.status,'run-complete','A finished run does not leave the next resume blocked');
  }finally{release();await first.catch(()=>{});await rm(base,{recursive:true,force:true});}
});

test('an expired ownerless controller lock recovers while a fresh ownerless lock remains protected',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-bulk-ownerless-')),lock=join(base,'outputs/factory-batch/.run.lock');
  const plan={revision:'ownerless-lock-check',schoolBatches:[],unsupportedSchools:[],cohort:{selectedModelIds:[],dependencies:[],summary:{currentReady:0,plannedCandidates:0}}};
  const dependencies={inputs:{models:[]},buildBatchPlan:async()=>plan,readRetainedBatchCaptures:async()=>({captures:[],rejected:[],deferredSources:0}),draftComponents:async()=>({components:[],cache:{hits:0,misses:0}})};
  try{
    await mkdir(lock,{recursive:true});
    await assert.rejects(runBatch({base,dependencies}),/already has a runner/,'A newly created directory may belong to a runner still writing its owner receipt');
    const expired=new Date(Date.now()-3*60*1000);await utimes(lock,expired,expired);
    const recovered=await runBatch({base,dependencies});assert.equal(recovered.state.status,'run-complete');assert.equal(recovered.summary.newReadyPlans,0);
    await assert.rejects(readFile(join(lock,'owner.json'),'utf8'),{code:'ENOENT'},'Recovery removes the finished replacement lease');
    assert.equal((await runBatch({base,dependencies})).state.status,'run-complete','A recovered run does not leave the following resume blocked');
  }finally{await rm(base,{recursive:true,force:true});}
});

test('selected program evidence survives a missing directory route without inventing delivery or researching an unselected degree',()=>{
  const school=schoolConfigurations.tesu,known={id:'qa-tesu-known',school:school.name,title:'Recorded online program',modalities:['online'],sources:[{id:'degree',url:'https://www.tesu.edu/qa-known'}],externalMaxCredits:90};
  const unknown={id:'qa-tesu-unknown',school:school.name,title:'Delivery not recorded',sources:[{id:'degree',url:'https://www.tesu.edu/qa-unknown'}]};
  const unselected={id:'qa-tesu-unselected',school:school.name,title:'Unselected program',modalities:['online'],sources:[{id:'degree',url:'https://www.tesu.edu/qa-unselected'}]};
  const inputs={schoolId:'tesu',modality:'online',selectedModelIds:[known.id,unknown.id],directory:{programs:[],sources:[]},curriculum:{checkedOn:'2026-11-26',models:[],routes:[]},pathways:{pathways:[]},models:[known,unknown,unselected]};
  const manifest=buildSchoolResearchBatch(inputs);
  assert.equal(manifest.summary.knownOnlinePrograms,0);assert.equal(manifest.summary.readyTemplates,0);assert.equal(manifest.programs.length,0);
  assert.equal(manifest.unlinkedModels.find(model=>model.id===known.id)?.reason,'exact-route-missing');
  assert.equal(manifest.unlinkedModels.find(model=>model.id===unknown.id)?.modality,null);
  assert.equal(manifest.unlinkedModels.find(model=>model.id===unknown.id)?.reason,'model-delivery-evidence-missing');
  assert.equal(manifest.jobs.length,1);assert.deepEqual(manifest.jobs[0].affectedModelIds,[known.id]);assert.equal(manifest.jobs[0].url,known.sources[0].url);
  assert(!manifest.sources.some(source=>source.url===unknown.sources[0].url||source.url===unselected.sources[0].url));
  const unrelatedChange=structuredClone(inputs);unrelatedChange.models[2].externalMaxCredits=120;
  assert.equal(buildSchoolResearchBatch(unrelatedChange).revision,manifest.revision,'An unrelated degree change does not invalidate selected-program source work');
  const relevantChange=structuredClone(inputs);relevantChange.models[0].externalMaxCredits=60;
  assert.notEqual(buildSchoolResearchBatch(relevantChange).jobs[0].inputFingerprint,manifest.jobs[0].inputFingerprint,'Selected program policy drift invalidates its source-work contract');
  assert.throws(()=>buildSchoolResearchBatch({...inputs,selectedModelIds:[]}),/empty selection/,'An empty explicit cohort cannot expand silently to the whole school');
});

test('AI extraction is explicit, bounded per run, and resumes its previously completed cache without another paid call',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-bulk-ai-'));
  const captures=['a','b'].map(id=>{const text='Transfer policy '+id+' permits up to 90 semester credits with 30 institutional residency credits.\n';return {sourceURL:'https://www.liberty.edu/qa-policy-'+id,text,contentHash:createHash('sha256').update(text).digest('hex'),capturedAt:'2026-11-26T12:00:00.000Z',roles:['university-policy']};});
  const plan={revision:'ai-budget-check',schoolBatches:[],unsupportedSchools:[],cohort:{selectedModelIds:[],dependencies:[],summary:{currentReady:ready.length,plannedCandidates:0}}};
  let calls=0;const complete=async()=>{calls++;return {components:[],gaps:[]};};
  const options={base,allowAI:true,model:'qa-claude-mock-no-network',complete,maxAICalls:1,dependencies:{inputs:{models:[]},buildBatchPlan:async()=>plan,readRetainedBatchCaptures:async()=>({captures,rejected:[],deferredSources:0})}};
  try{
    await assert.rejects(runBatch({...options,model:undefined}),/explicit configured model/);assert.equal(calls,0);
    await assert.rejects(runBatch(options));assert.equal(calls,1,'Budget exhaustion must happen before the second provider call');
    const failed=JSON.parse(await readFile(join(base,'outputs/factory-batch/run.json'),'utf8'));assert.equal(failed.status,'failed');assert.equal(failed.academicPublicationAllowed,false);
    const resumed=await runBatch(options);assert.equal(calls,2,'The next run spends one call only for the remaining uncached source');assert.equal(resumed.state.status,'run-complete');assert.equal(resumed.summary.componentCache.hits,1);
    const reused=await runBatch(options);assert.equal(calls,2);assert.equal(reused.summary.componentCache.hits,2);assert.equal(reused.summary.newReadyPlans,0);assert.equal(reused.summary.automaticApprovals,0);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('the first real shared university pools preserve all original awards and degree units while adding unique named choices',async()=>{
  const actual=await loadKit(join(import.meta.dirname,'content/pathway-kits/champlain')),packet=await read('./'+champlainChoicePacketPath);
  const before=structuredClone(actual),poolIds=new Set(packet.pools.map(pool=>pool.id)),sourceIds=new Set(packet.sources.map(source=>source.id));
  before.school.institutionChoicePools=(before.school.institutionChoicePools||[]).filter(pool=>!poolIds.has(pool.id));before.school.sources=before.school.sources.filter(source=>!sourceIds.has(source.id));
  for(const program of before.programs)for(const requirement of program.requirements)if(requirement.slot?.institutionChoicePoolIds){requirement.slot.institutionChoicePoolIds=requirement.slot.institutionChoicePoolIds.filter(id=>!poolIds.has(id));if(!requirement.slot.institutionChoicePoolIds.length)delete requirement.slot.institutionChoicePoolIds;}
  const options={base:import.meta.dirname,asOf:quality.asOf,allowedUniversityHosts:['online.champlain.edu']},adopted=await adoptReviewedChoicePools(before,packet,options);
  assert.equal(adopted.report.publicationPromotionAllowed,false);assert(adopted.report.namedChoices>0);assert(adopted.report.addedUniversityOptions>0);
  assert.deepEqual(adopted.kit.equivalencies,before.equivalencies,'A named receiving-university choice cannot establish a new outside award');
  assert.deepEqual(adopted.kit.school.policies,before.school.policies);
  let added=0;
  for(const program of adopted.kit.programs){
    const previous=compileProgram(before,before.programs.find(row=>row.slug===program.slug)),current=compileProgram(adopted.kit,program);
    assert.deepEqual(current.requirements.map(row=>[row.id,row.credits]),previous.requirements.map(row=>[row.id,row.credits]));assert.equal(units(current.requirements),current.totalCredits);assert.equal(current.creditSystem,previous.creditSystem);
    const named=[];
    for(const old of previous.requirements){
      const row=current.requirements.find(row=>row.id===old.id);
      for(const option of old.options)assert.deepEqual(row.options.find(candidate=>candidate.id===option.id),option,'Historic option IDs, order-independent identities and source quantities are preserved');
      const additions=row.options.filter(option=>!old.options.some(previous=>previous.id===option.id));added+=additions.length;
      for(const option of additions){assert.equal(option.provider,'University');assert.equal(option.creditOrigin,'institutional');assert.equal(option.credits,3);assert.equal(option.creditSystem,'semester');assert.equal(option.upper,false);assert.equal(option.receivingCode,undefined);assert.equal(option.mappingEvidence,undefined);}
      if(row.namedInstitutionChoicesReviewed)named.push(...row.options.filter(option=>option.provider==='University').map(option=>code(option.code)));
    }
    assert.equal(new Set(named).size,named.length,'A reused menu cannot count the same named university course in two slots');
  }
  assert.equal(added,adopted.report.addedUniversityOptions);
  for(const [field,value]of [['creditSystem','quarter'],['upper',true],['provider','Sophia']]){
    const invalid=structuredClone(packet);invalid.pools[0].courses[0][field]=value;await assert.rejects(adoptReviewedChoicePools(before,invalid,options),/No outside/);
  }
  const foreign=structuredClone(packet);foreign.schoolId='liberty';await assert.rejects(adoptReviewedChoicePools(before,foreign,options),/exact receiving school/);
  const duplicate=structuredClone(packet);duplicate.placements.push(structuredClone(duplicate.placements[0]));await assert.rejects(adoptReviewedChoicePools(before,duplicate,options),/same exact tuple/);
});

test('a retained draft can use a hash-verified receipt while an explicitly mismatched academic-source hash is rejected',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-bulk-retained-')),text='Transfer credits are limited by the receiving university policy.\n',hash=createHash('sha256').update(text).digest('hex');
  const capture='content/source-captures/'+hash.slice(0,16)+'.txt',url='https://www.liberty.edu/policies/transfer-credit/';
  const source={id:'qa-source',kind:'university',url,capture},models=[{id:'qa-candidate',sources:[source]}];
  try{
    await mkdir(join(base,'content/source-captures'),{recursive:true});await writeFile(join(base,capture),text);await writeFile(join(base,capture.replace(/\.txt$/,'.json')),JSON.stringify({url,sha256:hash,status:200,fetchedAt:'2026-11-26T12:00:00.000Z'}));
    const retained=await readRetainedBatchCaptures({base,models,selectedModelIds:['qa-candidate']});
    assert.equal(retained.captures.length,1);assert.equal(retained.rejected.length,0);assert.equal(retained.captures[0].contentHash,hash);assert.equal(retained.captures[0].sourceURL,url);
    assert.deepEqual(retained.captures[0].modelIds,['qa-candidate']);assert.equal(source.sha256,undefined,'Source retrieval never manufactures an academic source hash or review');
    const wrong=structuredClone(models);wrong[0].sources[0].sha256='0'.repeat(64);
    const rejected=await readRetainedBatchCaptures({base,models:wrong,selectedModelIds:['qa-candidate']});assert.equal(rejected.captures.length,0);assert.equal(rejected.rejected.length,1);assert.match(rejected.rejected[0].reason,/hash mismatch/);
    assert.equal((await readRetainedBatchCaptures({base,models,selectedModelIds:['other-program']})).captures.length,0,'A capture is still limited to its declared program consumers');
  }finally{await rm(base,{recursive:true,force:true});}
});
