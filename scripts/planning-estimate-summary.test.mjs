import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {summarizePlanningEstimate} from './planning-estimate-summary.mjs';
import {compilePathwayArtifacts} from './build-pathway-quality-report.mjs';
const require=createRequire(import.meta.url),Planner=require('../dist/planner.js');
const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
function fixture(){
 const registry=read('dist/data/curriculum-registry.json'),entry=registry.models.find(model=>model.id==='liberty-business-residential'),document=read('dist/'+entry.path),model=(document.models||[document]).find(model=>model.id===entry.id),baseline=Object.values(read('dist/data/baseline-index.json').baselines).find(item=>item.modelId===model.id);
 const providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))],plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId]))});
 return {model,plan,rates:read('dist/data/plan-estimate-rates.json'),asOf:'2026-11-26',entry,registry};
}
test('catalog ranges use the worksheet prices and retain exclusions, sources and assumed pacing',()=>{
 const f=fixture(),before=JSON.stringify(f),result=summarizePlanningEstimate(f);
 assert.equal(result.available,true);assert.equal(result.status,'planning-range');assert.equal(result.complete,false);
 assert(result.knownRange.min>0&&result.knownRange.max>=result.knownRange.min);assert(result.missing.length>0);
 assert(result.sources.every(source=>source.url.startsWith('https://')&&source.checkedOn));
 assert.equal(result.timing.totalMonths,null,'A campus term count is not an invented finish date');
 assert(result.timing.assumptions.some(value=>/planning assumption/.test(value)));
 assert.equal(JSON.stringify(f),before,'The report cannot change academic rows or prices');
});
test('missing provider charges remain an explicitly partial range, never a cheap complete degree',()=>{
 const f=fixture();assert(f.plan.rows.some(row=>row.option?.provider==='Sophia'));
 f.rates.providers=f.rates.providers.filter(provider=>provider.provider!=='Sophia');
 const result=summarizePlanningEstimate(f);assert.equal(result.available,true);assert.equal(result.status,'partial-range');assert.equal(result.complete,false);assert(result.missing.some(note=>/Sophia/.test(note)));
});
test('wrong editions, stale or future active price sources, malformed dates and private records fail closed',()=>{
 const f=fixture(),initial=summarizePlanningEstimate(f);
 assert.equal(summarizePlanningEstimate({...f,model:{...f.model,catalog:'2099-2100'}}).available,false);
 for(const changedDate of ['2026-10-01','2026-12-01','2026-99-99']){
  const rates=structuredClone(f.rates),source=rates.sources.find(source=>source.id===initial.sources[0].id);source.checkedOn=changedDate;
  assert.equal(summarizePlanningEstimate({...f,rates}).available,false,changedDate);
 }
 for(const asOf of ['2026-99-99','2026-02-30'])assert.throws(()=>summarizePlanningEstimate({...f,asOf}),/real planning-estimate review date/);
 const plan=structuredClone(f.plan);plan.rows[0].status='reported';assert.throws(()=>summarizePlanningEstimate({...f,plan}),/fresh baseline/);
 assert.equal(summarizePlanningEstimate({...f,rates:undefined}).reasonCode,'rates-not-supplied');
});
test('adding a researched price range does not promote academic publication or turn legacy prices into a quote',()=>{
 const f=fixture(),route={id:'reviewed-test-route',modelId:f.model.id,school:f.model.school,title:f.model.title,level:'bachelor',modalities:['campus']},entry={...f.entry,routeIds:[route.id],modalities:['campus']};
 const input={models:[f.model],entries:[entry],catalog:{pathways:[route]},registry:{revision:'academic-v1:'+'a'.repeat(64)},references:{},asOf:f.asOf,generate:()=>structuredClone(f.plan)};
 const before=compilePathwayArtifacts(input),after=compilePathwayArtifacts({...input,planningRates:f.rates});
 assert.deepEqual(after.publicationIndex,before.publicationIndex);assert.deepEqual(after.baselineIndex,before.baselineIndex);
 assert.deepEqual(after.report.programs[0].estimates.cost,before.report.programs[0].estimates.cost);
 assert.equal(after.report.programs[0].estimates.planning.available,true);assert.equal(after.report.summary.estimates.planning.availableRanges,1);
 const newerRates=structuredClone(f.rates);newerRates.checkedOn='2026-11-27';newerRates.sources.find(source=>source.id===after.report.programs[0].estimates.planning.sources[0].id).checkedOn='2026-11-27';
 const priceOnly=compilePathwayArtifacts({...input,planningRates:newerRates,planningAsOf:'2026-11-27'});
 assert.equal(priceOnly.report.asOf,f.asOf);assert.equal(priceOnly.report.summary.estimates.planning.asOf,'2026-11-27');assert.equal(priceOnly.report.programs[0].estimates.planning.available,true);
 assert.deepEqual(priceOnly.publicationIndex,before.publicationIndex);assert.deepEqual(priceOnly.baselineIndex,before.baselineIndex);
});

test('coverage workbench shows sourced ranges separately from complete quotes and escapes source content',()=>{
 const UI=require('../dist/coverage.js'),estimate=summarizePlanningEstimate(fixture());
 const html=UI.programHTML({program:{title:'Sample degree',quality:{estimates:{planning:estimate}}}});
 assert.match(html,/Researched planning range/);assert.match(html,/before aid/);assert.match(html,/not a complete price quote/);assert.match(html,/No calendar completion date/);
 estimate.missing=['<img src=x onerror=alert(1)>'];assert(!UI.programHTML({program:{quality:{estimates:{planning:estimate}}}}).includes('<img src=x'));
 const summary=UI.summaryHTML({qualitySummary:{publicationReady:22,estimates:{planning:{availableRanges:12,partialProviderRanges:2,assumptionBasedTimingRanges:7}}}});
 assert.match(summary,/22 publication-ready plans/);assert.match(summary,/12 researched planning ranges/);assert.match(summary,/2 ranges omit some provider prices/);
 assert(!UI.programHTML({program:{quality:{estimates:{planning:{available:false}}}}}).includes('Researched planning range'));
});
