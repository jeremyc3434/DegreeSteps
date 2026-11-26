/** Compact course-identity index for "What are my credits worth?" (dist/data/plan-course-index.json).
 * For each publication-ready canonical model: its route, starting-route baseline rows, every option identity key,
 * and its result with no finished courses (from the same engine the page runs). The page then downloads a
 * curriculum only when a student's finished course could touch that plan. Use --check to verify it is current. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'dist/data/plan-course-index.json');
const require=createRequire(import.meta.url);
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));

export async function buildCourseIndex(){
 const Catalog=require('../dist/program-catalog.js'),Worth=require('../dist/credits-worth-engine.js');
 const fetcher=async file=>{try{const value=await read('dist/'+file);return {ok:true,json:async()=>value};}catch{return {ok:false,json:async()=>null};}};
 const [library,baselines,rates,registry,pathways]=await Promise.all(['dist/data/plan-library-index.json','dist/data/baseline-index.json','dist/data/plan-estimate-rates.json','dist/data/curriculum-registry.json','dist/data/pathways.json'].map(read));
 const catalog=await Catalog.load(pathways,{fetcher});
 const entries=Catalog.planLibraryRoutes(catalog,[],library).map(route=>{
  const entry=library.plans[route.id];assert(entry?.modelId===route.modelId&&entry.tier==='reviewed'&&entry.published===true,'The public course index needs an exact reviewed publication entry: '+route.id);return[route.id,entry];
 }).sort(([a],[b])=>a.localeCompare(b));
 const models=await Catalog.loadModels([...new Set(entries.map(([,entry])=>entry.modelId))],{fetcher,includeLegacy:false});
 const byModel=new Map(registry.models.map(entry=>[entry.id,entry]));
 const perPlan=[],allKeys=new Set();
 for(const [routeId,entry] of entries){
  const route=catalog.pathways.find(item=>item.id===routeId),model=models.find(item=>item.id===entry.modelId);
  const baseline=Object.values(baselines.baselines).find(item=>item.pathwayId===routeId&&item.modelId===entry.modelId);
  assert(route&&model&&baseline,'Plan '+routeId+' needs its route, curriculum and baseline.');
  assert(baseline.qualityReady===true&&baseline.researchStatus==='research-ready'&&baseline.validation?.academicCountsValid===true&&baseline.validation?.policyChecksComplete===true,'The public course index cannot offer an unfinished research baseline: '+routeId);
  const keys=Worth.planKeys(model);keys.forEach(item=>allKeys.add(item));
  const trimmed={modelId:baseline.modelId,pathwayId:baseline.pathwayId,summary:{transferCredits:baseline.summary?.transferCredits},rows:baseline.rows.map(row=>({requirementId:row.requirementId,optionId:row.optionId,provider:row.provider,credits:row.credits}))};
  const start=Worth.evaluatePlan({route,model,baseline:trimmed,indexEntry:entry,learning:[],rates});
  delete start.records;delete start.matches;
  perPlan.push([routeId,{modelId:entry.modelId,path:byModel.get(entry.modelId)?.path||'',route,baseline:trimmed,keys,start}]);
 }
 const keys=[...allKeys].sort(),position=new Map(keys.map((item,i)=>[item,i]));
 const availableSubjects=new Set(entries.flatMap(([,entry])=>entry.subjects||[]));
 return {kind:'degreesteps-plan-course-index',version:1,selectionPolicy:'publication-ready-models-v1',registryRevision:library.registryRevision,ratesCheckedOn:rates.checkedOn,baselineRevision:baselines.revision||null,subjects:Object.fromEntries(Object.entries(library.subjects).filter(([id])=>availableSubjects.has(id))),keys,
  plans:Object.fromEntries(perPlan.map(([routeId,plan])=>[routeId,{...plan,keys:plan.keys.map(item=>position.get(item))}]))};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const index=await buildCourseIndex(),text=JSON.stringify(index)+'\n';
 if(process.argv.includes('--check')){let current='';try{current=await readFile(output,'utf8');}catch{}assert.equal(current,text,'dist/data/plan-course-index.json is stale; run node scripts/build-plan-course-index.mjs');}
 else await writeFile(output,text);
 console.log(JSON.stringify({output:'dist/data/plan-course-index.json',plans:Object.keys(index.plans).length,keys:index.keys.length,bytes:Buffer.byteLength(text),check:process.argv.includes('--check')}));
}
