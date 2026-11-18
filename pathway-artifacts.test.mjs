import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compilePathwayArtifacts,baselineKey} from './scripts/build-pathway-quality-report.mjs';
const source=id=>({id,url:'https://school.edu/'+id,checked:'2026-11-18'});
function fixture(){
 const model={id:'sample-degree',school:'Sample University',title:'Business',level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,externalMaxCredits:3,upperMinCredits:0,majorMinInstitutionCredits:0,sources:[source('catalog'),source('map')],requirements:[{id:'writing',code:'ENG 101',title:'Writing',credits:3,sourceIds:['catalog'],options:[{id:'alt',provider:'Sophia',code:'ENG1001',receivingCode:'ENG 101',evidence:'published',sourceIds:['map']}]},{id:'capstone',code:'BUS 499',title:'Capstone',credits:3,sourceIds:['catalog'],options:[{id:'uni',provider:'University',code:'BUS 499',sourceIds:['catalog']}]}]};
 const entry={id:model.id,school:model.school,title:model.title,level:'bachelor',readyTemplate:true,routeIds:['business-online'],modalities:['online']};
 const catalog={pathways:[{id:'business-online',modelId:model.id,school:model.school,title:model.title,level:'bachelor',modalities:['online'],url:'https://school.edu/business'}]};
 return {models:[model],entries:[entry],catalog,registry:{revision:'academic-v1:'+'a'.repeat(64)},references:{packets:[]},asOf:'2026-11-18'};
}
function generate(model,preferences){assert.deepEqual(preferences.completed,[]);return {rows:model.requirements.map(requirement=>({requirementId:requirement.id,credits:requirement.credits,status:'planned',option:requirement.options[0]})),validation:{academicCountsValid:true,policyChecksComplete:true},costs:{costComplete:false,total:null,knownSubtotal:0},timing:{}};}
test('one solver run supplies every baseline route and keeps estimates separate from research',()=>{
 const input=fixture();input.entries[0].routeIds.push('business-online-alternate');input.catalog.pathways.push({...input.catalog.pathways[0],id:'business-online-alternate'});let calls=0;
 const result=compilePathwayArtifacts({...input,generate:(...args)=>{calls++;return generate(...args);}});
 assert.equal(calls,1);assert.equal(Object.keys(result.baselineIndex.baselines).length,2);assert.equal(result.report.programs[0].execution.awardedCreditsInBaseline,0);assert.equal(result.report.programs[0].estimates.cost.status,'partial-estimate');assert.equal(result.baselineIndex.privateRecordsIncluded,false);
 assert.equal(result.baselineIndex.baselines[baselineKey('sample-degree','business-online','online')].summary.transferCredits,3);
});
test('unbalanced or incomplete academic baselines never enter the cached degree-link index',()=>{
 const input=fixture(),result=compilePathwayArtifacts({...input,generate:()=>({rows:[],validation:{academicCountsValid:false,policyChecksComplete:false}})});
 assert.equal(Object.keys(result.baselineIndex.baselines).length,0);assert.equal(result.report.programs[0].status,'unavailable');assert.equal(result.report.programs[0].publication.ready,false);
});
test('a registry route cannot borrow another school, model, level or study format',()=>{
 for(const change of [{school:'Other University'},{modelId:'other-degree'},{level:'master'},{modalities:['campus']}]){
  const input=fixture();Object.assign(input.catalog.pathways[0],change);
  assert.equal(Object.keys(compilePathwayArtifacts({...input,generate}).baselineIndex.baselines).length,0);
 }
});
test('compiled artifact pairs use exactly the same academic registry and no student awards',()=>{
 const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8')),registry=read('./dist/data/academic-registry.json'),report=read('./dist/data/pathway-quality-report.json'),baselines=read('./dist/data/baseline-index.json');
 assert.equal(report.registryRevision,registry.revision);assert.equal(baselines.registryRevision,registry.revision);assert.equal(report.programs.length,registry.programs.length);assert.equal(report.summary.models,registry.programs.length);
 for(const baseline of Object.values(baselines.baselines)){assert(baseline.rows.every(row=>row.status==='planned'));assert.equal(baseline.rows.length,baseline.summary.requirementCount);assert.equal(baseline.rows.reduce((sum,row)=>sum+row.credits,0),baseline.summary.totalCredits);}
});
