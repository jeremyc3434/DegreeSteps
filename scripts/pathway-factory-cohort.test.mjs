import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildExpansionQueue} from './build-plan-expansion-queue.mjs';
import {buildCohortPlan,cohortScope,formatCohortSummary,readCohortInputs} from './pathway-factory/cohort.mjs';

const asOf='2026-11-26', revision='academic-synthetic-v1';
const model=(id,courses=['X'],overrides={})=>({id,title:'Program '+id,school:'Synthetic University',catalog:'2026-2027',
  level:'bachelor',format:'Online',creditSystem:'semester',sources:[{id:'primary',url:'https://synthetic.invalid/official-map',kind:'university',checkedOn:asOf,sha256:'a'.repeat(64)}],
  requirements:courses.map(course=>({id:course,code:'ENG '+course,title:course,credits:3,options:[{id:'option-'+course,
    provider:'Synthetic Provider',code:course,courseVersion:'1',sourceCredits:3,sourceCreditSystem:'semester',creditOrigin:'alternative',
    receivingCode:'ENG '+course,receivingCredits:3,credits:3,creditSystem:'semester',sourceIds:['primary']}]})),...overrides});
const finding=(id,course,overrides={})=>({id:id+'-finding-'+course,code:'mapping-evidence',blocking:true,owner:'research',
  requirementIds:[course],optionIds:['option-'+course],sourceIds:['primary'],message:'Exact transfer award needs review.',...overrides});
const program=(m,overrides={})=>({modelId:m.id,school:m.school,title:m.title,publication:{ready:false,reasonCodes:['mapping-evidence']},
  acceleration:{eligible:true,mechanism:'mapped-transfer'},metrics:{outsideFraction:0.75},findings:m.requirements.map(row=>finding(m.id,row.id)),...overrides});
function fixture(models,programs=models.map(m=>program(m))) {
  const quality={asOf,registryRevision:revision,programs},queue=buildExpansionQueue({models,quality});
  return {models,quality,queue,publication:{asOf,registryRevision:revision,plans:programs.filter(p=>p.publication.ready).map(p=>({modelId:p.modelId,publicationReady:true}))},
    registry:{asOf,revision,programs:models.map(m=>({id:m.id}))},asOf};
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

test('whole-program yield selects shared completion work rather than a singleton or an unrelated high occurrence task',()=>{
  const input=fixture([model('a'),model('b'),model('c',['Y'])]),report=buildCohortPlan({...input,target:2});
  assert.deepEqual(report.selectedModelIds,['a','b']);assert.equal(report.dependencies.length,1);
  assert.equal(report.selectionSteps[0].wholeProgramsCovered,2);assert.equal(report.summary.potentialReady,2);
  assert.deepEqual(report.dependencies[0].contexts.map(c=>c.modelId),['a','b']);
  assert.equal(report.academicallyVerified,false);assert.equal(report.automaticApprovals,0);assert.equal(report.dependencies[0].automaticApproval,false);
});
test('diamond dependency closure requires every task but reuses the shared exact award once',()=>{
  const input=fixture([model('a',['X','Y']),model('b',['Y','Z']),model('c',['X','Z'])]),report=buildCohortPlan({...input,target:3});
  assert.equal(report.dependencies.length,3);assert.equal(report.summary.potentialReady,3);
  for(const candidate of report.programs){assert.equal(candidate.dependencyTaskIds.length,2);assert.equal(candidate.findingDependencies.length,2);assert(candidate.findingDependencies.every(d=>d.fullyRepresented));}
  assert.deepEqual(report.selectionSteps.map(s=>s.wholeProgramsCovered),[1,2]);
});
test('complete finding closure cannot silently drop one option when a finding maps to several original course awards',()=>{
  const m=model('a');m.requirements[0].options.push({...m.requirements[0].options[0],id:'second',code:'SECOND'});
  const p=program(m);p.findings[0].optionIds.push('second');
  const input=fixture([m],[p]);assert.equal(input.queue.tasks.length,2);input.queue.tasks.pop();
  const report=buildCohortPlan({...input,target:1});assert.equal(report.summary.potentialReady,0);
  assert.equal(report.programs[0].unrepresentedBlockers[0].code,'mapping-evidence');
});
test('all blockers include nonresearch findings and separate publication reasons, which remain explicit unknown holds',()=>{
  const a=model('a'),b=model('b');const pa=program(a),pb=program(b);
  pa.findings.push(finding('a','unresolved',{code:'academic-constraint',owner:'academic',requirementIds:[],optionIds:[],sourceIds:[]}));
  pa.publication.reasonCodes.push('academic-constraint');pb.publication.reasonCodes.push('acceleration-not-established');
  const report=buildCohortPlan({...fixture([a,b],[pa,pb]),target:2});
  assert.equal(report.summary.potentialReady,0);assert.equal(report.summary.heldCandidates,2);
  assert.deepEqual(report.programs.map(p=>p.unrepresentedBlockers.map(h=>h.code)),[['academic-constraint'],['acceleration-not-established']]);
  assert(report.programs[0].blockingFindingIds.includes('a-finding-unresolved'));
});
test('current-ready programs and explicit legacy identities cannot inflate additional complete degree targets',()=>{
  const a=model('a'),b=model('b'),legacy=model('legacy');const pa=program(a,{publication:{ready:true,reasonCodes:[]},findings:[]});
  const input=fixture([a,b,legacy],[pa,program(b),program(legacy)]);
  const report=buildCohortPlan({...input,target:20,programManifests:[{legacyIdentities:[{modelId:'legacy'}]}]});
  assert.equal(report.summary.currentReady,1);assert.deepEqual(report.selectedModelIds,['b']);assert.equal(report.summary.targetShortfall,19);
  assert.equal(report.excludedCandidates[0].modelId,'legacy');assert.equal(report.currentReadyModelIds[0],'a');
  const excluded=buildCohortPlan({...input,target:2,excludeModelIds:['b','legacy']});assert.equal(excluded.selectedModelIds.length,0);
});
test('school filtering applies to candidates while preserving global ready count and scoped sources',()=>{
  const a=model('a'),b=model('b',['Y'],{school:'Thomas Edison State University'}),c=model('c',['Z'],{school:'Western Governors University'});
  const input=fixture([a,b,c],[program(a,{publication:{ready:true,reasonCodes:[]},findings:[]}),program(b),program(c)]);
  const report=buildCohortPlan({...input,target:5,schools:['tesu','wgu']});assert.equal(report.summary.currentReady,1);assert.deepEqual(report.selectedModelIds,['b','c']);
  assert.deepEqual(buildCohortPlan({...input,target:5,school:'tesu'}).selectedModelIds,['b']);
});
test('identical names preserve catalog, modality, level, unit, agreement, version, period and source quantity scopes',()=>{
  const models=[model('a'),model('b',['X'],{catalog:'2027-2028'}),model('c',['X'],{format:'Residential'}),model('d',['X'],{level:'master'}),model('e',['X'],{creditSystem:'quarter'}),model('f'),model('g'),model('h'),model('i')];
  models[5].requirements[0].options[0].courseVersion='2';models[6].requirements[0].options[0].universityMapRecord={programId:12,agreementId:33};
  models[7].requirements[0].options[0].recommendationStart='2026-01-01';models[8].requirements[0].options[0].sourceCredits=4;
  const input=fixture(models),report=buildCohortPlan({...input,target:9});assert.equal(report.dependencies.length,9);
  assert.equal(new Set(report.dependencies.map(t=>t.sourceTaskFingerprint)).size,9);assert.equal(report.sourceWorkGroups.length,1);
  assert.equal(report.sourceWorkGroups[0].scopeFingerprints.length,5);assert.equal(report.sourceWorkGroups[0].automaticApprovals,0);
  assert.deepEqual(report.programs.find(p=>p.modelId==='c').scope,cohortScope(models[2]));
});
test('a queue context cannot acquire a sibling catalog or a changed original-course identity',()=>{
  const input=fixture([model('a'),model('b',['X'],{catalog:'2027-2028'})]);input.queue.tasks[0].scope.catalog='2030-2031';
  assert.throws(()=>buildCohortPlan({...input,target:2}),/exact academic scope/);
  const second=fixture([model('a')]);second.models[0].requirements[0].options[0].courseVersion='99';
  assert.throws(()=>buildCohortPlan({...second,target:1}),/original-course/);
  const third=fixture([model('a')]);third.models[0].sources[0].sha256='b'.repeat(64);
  assert.throws(()=>buildCohortPlan({...third,target:1}),/original-course/);
});
test('semantic PDF and ACE recommendation fragments retain separate source work identities',()=>{
  const models=[model('a'),model('b',['Y']),model('c',['Z']),model('d',['V'])];
  for(const [index,m] of models.entries())m.sources[0].url=index<2?'https://synthetic.invalid/map.pdf#pages='+(index+1)+'&columns=2':'https://synthetic.invalid/ace#recommendation-period-selection-'+index;
  const report=buildCohortPlan({...fixture(models),target:4});assert.equal(report.sourceWorkGroups.length,4);
  assert(report.sourceWorkGroups.every(group=>group.url.includes('#')));
});
test('stale, mismatched and future academic artifacts fail closed',()=>{
  for(const mutate of [
    input=>{input.queue.registryRevision='different';},input=>{input.publication.asOf='2026-11-25';},
    input=>{input.registry.asOf='2026-11-27';},input=>{input.asOf='2027-01-01';},
    input=>{input.models[0].sources[0].checkedOn='2026-11-27';},input=>{input.quality.programs=[];},
    input=>{input.publication.plans=[{modelId:'a',publicationReady:true}];}
  ]){const input=fixture([model('a')]);mutate(input);assert.throws(()=>buildCohortPlan({...input,target:1}),/Stale|stale|future|Future/);}
});
test('planner is deterministic, immutable and fingerprints every input without exposing student fields',()=>{
  const input=fixture([model('b'),model('a')]);input.models[0].studentEmail='private@example.invalid';
  const before=JSON.stringify(input);freeze(input);
  const a=buildCohortPlan({...input,target:2}),b=buildCohortPlan({...input,target:2});assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before);
  assert(!JSON.stringify(a).includes('private@example.invalid'));assert.equal(Object.keys(a.fingerprints).length,7);
  assert(Object.values(a.fingerprints).every(value=>/^sha256:[a-f0-9]{64}$/.test(value)));
});
test('actual snapshot dry run preserves 45 ready plans and all 20 candidate dependencies without canonical writes',async()=>{
  const base=resolve(import.meta.dirname,'..'),paths=['publication-index','pathway-quality-report','plan-expansion-queue','academic-registry'].map(name=>resolve(base,'dist/data',name+'.json'));
  const before=await Promise.all(paths.map(path=>readFile(path,'utf8'))),input=await readCohortInputs({base,asOf});
  assert.equal(input.models.length,167);assert.equal(input.queue.tasks.length,741);
  const report=buildCohortPlan({...input,target:20,asOf});assert.equal(report.summary.currentReady,45);assert.equal(report.summary.plannedCandidates,20);
  assert(report.summary.potentialReady<=17);assert(report.summary.heldCandidates>=3);assert(!report.selectedModelIds.includes('tesu-general-management'));
  assert(report.selectedModelIds.every(id=>!report.currentReadyModelIds.includes(id)));assert.equal(report.summary.automaticApprovals,0);
  for(const program of report.programs){
    const findings=input.quality.programs.find(p=>p.modelId===program.modelId).findings.filter(f=>f.blocking);
    assert.deepEqual(program.blockingFindingIds,findings.map(f=>f.id).sort());
    for(const finding of findings)assert(program.findingDependencies.some(d=>d.findingId===finding.id&&d.fullyRepresented)||program.unrepresentedBlockers.some(h=>h.findingId===finding.id));
    assert(program.dependencyTaskIds.every(id=>report.dependencies.some(task=>task.id===id&&task.contexts.some(c=>c.modelId===program.modelId))));
  }
  assert.match(formatCohortSummary(report),/45 current ready plans unchanged.*20 planned candidates.*not academically verified.*0 automatic approvals/);
  assert.deepEqual(await Promise.all(paths.map(path=>readFile(path,'utf8'))),before);
});
