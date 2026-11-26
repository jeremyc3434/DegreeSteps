import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compilePathwayArtifacts,baselineKey} from './scripts/build-pathway-quality-report.mjs';

const Planner=createRequire(import.meta.url)('./dist/planner.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const outside=(id,provider,code,receivingCode,evidence='published')=>({id,provider,code,receivingCode,credits:3,sourceCredits:3,sourceCreditSystem:'semester',evidence,sourceIds:['map','provider']});
 const university=code=>({id:'university-'+code,provider:'University',code,credits:3,evidence:'published',sourceIds:['degree']});
 const model={id:'fixture-degree',school:'Example University',title:'Exact Bachelor Degree',level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,upperMinCredits:3,policySourceIds:['degree'],sources:[{id:'degree',url:'https://example.edu/degree',checked:'2026-11-17'},{id:'map',url:'https://example.edu/transfers',checked:'2026-11-17'},{id:'provider',url:'https://provider.example/courses',checked:'2026-11-17'}],policyReview:[],unresolved:[],requirements:[
  {id:'writing',code:'ENG-101',title:'Writing',credits:3,options:[outside('writing-outside','Sophia','SOPH-1','ENG-101'),university('ENG-101')]},
  {id:'math',code:'MAT-101',title:'Mathematics',credits:3,options:[outside('math-outside','Study.com','SDCM-2','MAT-101'),university('MAT-101')]},
  {id:'business',code:'BUS-101',title:'Business',credits:3,options:[outside('business-conditional','Study.com','SDCM-3','BUS-101','conditional'),university('BUS-101')]},
  {id:'capstone',code:'CAP-400',title:'Capstone',credits:3,options:[{...university('CAP-400'),upper:true}]}
 ]};
 const route={id:'fixture-online',modelId:model.id,school:model.school,title:model.title,level:'bachelor',modalities:['online'],url:'https://example.edu/degree'};
 const entry={id:model.id,school:model.school,title:model.title,level:'bachelor',readyTemplate:true,routeIds:[route.id],modalities:['online']};
 return {models:[model],entries:[entry],catalog:{pathways:[route]},registry:{revision:'academic-v1:'+'a'.repeat(64)},references:{packets:[]},asOf:'2026-11-18'};
}
function plan(model,allowConditional){
 return {rows:model.requirements.map(requirement=>({requirementId:requirement.id,credits:requirement.credits,status:'planned',selectionRequired:false,option:copy(requirement.options.find(option=>allowConditional||option.evidence!=='conditional'))})),validation:{academicCountsValid:true,policyChecksComplete:true,errors:[]},costs:{costComplete:false,total:null,knownSubtotal:200},timing:{scenarioWeeks:null,assumptions:[]}};
}
function compile(input,adjust=()=>{}){
 const calls=[];
 const result=compilePathwayArtifacts({...input,generate:(model,preferences)=>{
  calls.push(copy(preferences));
  assert.deepEqual(preferences.completed,[],'Publication selection never imports or awards student records.');
  const candidate=plan(model,preferences.allowConditional);adjust(candidate,preferences,model);return candidate;
 }});
 return {...result,calls,program:result.report.programs[0],baseline:result.baselineIndex.baselines[baselineKey('fixture-degree','fixture-online','online')]};
}

test('a complete published route stays usable while its higher-transfer conditional candidate remains research',()=>{
 const input=fixture(),before=copy(input);
 input.entries[0].routeIds.push('fixture-alternate');input.catalog.pathways.push({...input.catalog.pathways[0],id:'fixture-alternate'});
 const untouched=copy(input),result=compile(input);
 assert.deepEqual(result.calls.map(call=>call.allowConditional),[true,false]);
 assert.equal(result.program.publication.ready,true);assert.equal(result.program.status,'research-ready');
 assert.equal(result.program.metrics.feasibleOutsideCredits,6);assert.equal(result.program.metrics.conditionalOutsideCredits,0);
 assert.equal(result.baseline.summary.transferCredits,6);assert.equal(result.baseline.summary.universityCredits,6);
 assert.equal(result.baseline.rows.find(row=>row.requirementId==='business').optionId,'university-BUS-101');
 assert.deepEqual(result.publicationIndex.plans[0].routeIds,['fixture-online','fixture-alternate']);
 const receipt=result.program.baselineSelection;
 assert.equal(receipt.selected,'published-only-baseline');assert.equal(receipt.conditionalCandidatePreserved,true);
 assert.equal(receipt.conditionalCandidate.transferCredits,9);assert.equal(receipt.conditionalCandidate.publicationReady,false);
 assert(receipt.conditionalCandidate.reasonCodes.includes('conditional-award'));
 assert.equal(receipt.conditionalCandidate.rows.find(row=>row.requirementId==='business').optionId,'business-conditional');
 assert.equal(receipt.publishedOnlyCandidate.publicationReady,true);assert.deepEqual(receipt.publishedOnlyCandidate.rows,result.baseline.rows);
 assert.deepEqual(result.baseline.baselineSelection,receipt);assert.equal(result.program.execution.awardedCreditsInBaseline,0);
 assert(result.baseline.rows.every(row=>row.status==='planned'));assert.deepEqual(input,untouched);
 assert.deepEqual(input.models,before.models,'No candidate evidence or model choices are silently upgraded.');
});

test('the real transfer optimizer publishes its feasible sourced route rather than its conditional maximum',()=>{
 const input=fixture(),calls=[],result=compilePathwayArtifacts({...input,generate:(model,preferences)=>{calls.push(preferences.allowConditional);return Planner.generate(model,preferences);}});
 assert.deepEqual(calls,[true,false]);
 const program=result.report.programs[0],baseline=result.baselineIndex.baselines[baselineKey('fixture-degree','fixture-online','online')];
 assert.equal(program.publication.ready,true);assert.equal(result.publicationIndex.plans.length,1);
 assert.equal(program.baselineSelection.conditionalCandidate.transferCredits,9);
 assert.equal(baseline.summary.transferCredits,6);assert.equal(baseline.validation.academicCountsValid,true);assert.equal(baseline.validation.policyChecksComplete,true);
 assert.equal(baseline.rows.find(row=>row.requirementId==='business').provider,'University');
 assert.equal(program.execution.awardedCreditsInBaseline,0);
});

test('unknown academic policy still blocks both candidates and preserves the higher-transfer research scenario',()=>{
 const input=fixture();input.models[0].policyReview=[{field:'institutionMinCredits',status:'unverified',message:'The exact residency policy is not established.',sourceIds:['degree']}];
 const result=compile(input);
 assert.equal(result.calls.length,2);assert.equal(result.program.publication.ready,false);assert.equal(result.publicationIndex.plans.length,0);
 assert.equal(result.program.metrics.feasibleOutsideCredits,9);assert.equal(result.baseline.summary.transferCredits,9);
 assert.equal(result.program.baselineSelection.selected,'conditional-research-candidate');
 assert.equal(result.program.baselineSelection.publishedOnlyCandidate.publicationReady,false);
 assert(result.program.baselineSelection.publishedOnlyCandidate.reasonCodes.includes('policy-unresolved'));
 assert.equal(result.baseline.rows.find(row=>row.requirementId==='business').optionId,'business-conditional');
});

test('a ready default remains exactly selected with one solver call even when unused conditional options exist',()=>{
 const input=fixture(),result=compile(input,(candidate,preferences,model)=>{
  candidate.rows.find(row=>row.requirementId==='business').option=copy(model.requirements.find(row=>row.id==='business').options[1]);
 });
 assert.equal(result.calls.length,1);assert.equal(result.calls[0].allowConditional,true);
 assert.equal(result.program.publication.ready,true);assert.equal(result.baseline.summary.transferCredits,6);
 assert.equal(result.program.baselineSelection,undefined);assert.equal(result.baseline.baselineSelection,undefined);
 assert.equal(result.publicationIndex.plans.length,1);
});

test('an unrelated research failure does not add solver work when no selected conditional mapping is held',()=>{
 const input=fixture();input.models[0].policyReview=[{field:'cap',status:'unknown',message:'The credit cap is not established.'}];
 const result=compile(input,(candidate,preferences,model)=>{candidate.rows.find(row=>row.requirementId==='business').option=copy(model.requirements[2].options[1]);});
 assert.equal(result.calls.length,1);assert.equal(result.program.publication.ready,false);assert.equal(result.program.baselineSelection,undefined);
});

test('published-only candidates must pass every existing source, feasibility, policy, acceleration and estimate gate',()=>{
 const cases=[
  ['policy scope',candidate=>{candidate.validation.policyChecksComplete=false;},'academic-policy-scope'],
  ['academic feasibility',candidate=>{candidate.validation.academicCountsValid=false;},'academic-feasibility'],
  ['reviewed option identity',candidate=>{candidate.rows[0].option.id='invented-course';},'unsupported-baseline-choice'],
  ['source binding',candidate=>{candidate.rows[0].option.sourceIds=['missing-source'];},'source-reference'],
  ['accelerated transfer share',(candidate,model)=>{candidate.rows[1].option=copy(model.requirements[1].options[1]);},'acceleration-not-established'],
  ['complete estimate',candidate=>{candidate.costs={costComplete:true,total:null};},'invalid-complete-cost']
 ];
 for(const [name,change,reason] of cases){
  const result=compile(fixture(),(candidate,preferences,model)=>{if(!preferences.allowConditional)change(candidate,model);});
  assert.equal(result.calls.length,2,name);assert.equal(result.program.publication.ready,false,name);assert.equal(result.publicationIndex.plans.length,0,name);
  assert.equal(result.program.metrics.feasibleOutsideCredits,9,name);assert.equal(result.baseline.summary.transferCredits,9,name);
  assert.equal(result.program.baselineSelection.selected,'conditional-research-candidate',name);
  assert(result.program.baselineSelection.publishedOnlyCandidate.reasonCodes.includes(reason),name);
 }
});

test('a failed published-only compilation does not erase the original conditional candidate',()=>{
 const result=compile(fixture(),(candidate,preferences)=>{if(!preferences.allowConditional)throw Error('Synthetic solver failure');});
 assert.equal(result.calls.length,2);assert.equal(result.program.publication.ready,false);assert.equal(result.publicationIndex.plans.length,0);
 assert.equal(result.baseline.summary.transferCredits,9);assert.equal(result.program.baselineSelection.selected,'conditional-research-candidate');
 assert.match(result.program.baselineSelection.publishedOnlyCandidate.compileError,/could not be compiled/);
 assert.equal(result.program.compileError,undefined,'The retained original baseline compiled successfully.');
});
