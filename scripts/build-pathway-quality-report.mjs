/* Compile zero-record baselines once, without changing public template gates. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readAcademicInputs} from './build-academic-registry.mjs';
import {assessPathwayQuality} from './pathway-quality.mjs';
import {summarizePlanningEstimate} from './planning-estimate-summary.mjs';
import {requirementsFingerprint} from './review-pathways.mjs';
import {findResearchReference,checkResearchReference} from '../server/research-references.mjs';
const require=createRequire(import.meta.url),Planner=require('../dist/planner.js'),Catalog=require('../dist/program-catalog.js');
const root=resolve(import.meta.dirname,'..'),list=value=>Array.isArray(value)?value:[];
export function baselineKey(modelId,pathwayId,modality){return [modelId,pathwayId,modality].join('|');}
function catalogYear(model){const label=String(model.catalogYear||model.catalog||'').replace(/[–—]/g,'-'),years=[...new Set(label.match(/20\d\d-20\d\d/g)||[])];return years.length===1?years[0]:/^20\d\d(?:(?:0[1-9]|1[0-2]))?$/.test(label.trim())?label.trim():null;}
function modality(model){return /^(residential|campus|on campus)$/i.test(model.format)?'campus':/^online$/i.test(model.format)?'online':/^hybrid$/i.test(model.format)?'hybrid':null;}
function templateSummary(model,entry,plan){
 const sum=predicate=>list(plan.rows).filter(predicate).reduce((total,row)=>total+row.credits,0);
 return {totalCredits:model.totalCredits,requirementCount:list(model.requirements).length,sourceCount:list(model.sources).length,transferCredits:sum(row=>row.option&&row.option.provider!=='University'),universityCredits:sum(row=>row.option?.provider==='University'),upperCredits:sum(row=>row.option?.upper===true),institutionMinCredits:model.institutionMinCredits,externalMaxCredits:model.externalMaxCredits,checkedOn:entry.checkedOn||model.evidenceCheckedOn||null};
}
export function compilePathwayArtifacts({models,entries,catalog,registry,references,asOf,inputHashes={},generate=Planner.generate,planningRates,planningAsOf=asOf}){
 const entryMap=new Map(entries.map(entry=>[entry.id,entry])),programs=[],baselines={};
 for(const original of [...models].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
  const entry=entryMap.get(original.id)||{},originalRoute=list(catalog.pathways).find(route=>route.modelId===original.id)||list(catalog.pathways).find(route=>list(entry.routeIds).includes(route.id));
  const level=entry.level||original.level||originalRoute?.level,mode=modality(original),model={...original,...(level?{level}:{})};
  const route=originalRoute?{...originalRoute,modelId:model.id,level,modalities:mode?[mode]:list(originalRoute.modalities),readyTemplate:entry.readyTemplate===true}:undefined;
  const providers=[...new Set(list(model.requirements).flatMap(row=>list(row.options).map(option=>option.provider)))].filter(provider=>provider&&provider!=='University');
  let plan,error=null;
  try{plan=generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});}catch{error='The baseline could not be compiled.';plan={rows:[],validation:{academicCountsValid:false,policyChecksComplete:false}};}
  const quality=assessPathwayQuality({model,plan,route,asOf});
  if(planningRates)quality.estimates.planning=summarizePlanningEstimate({model,plan,rates:planningRates,asOf:planningAsOf});
  programs.push({...quality,school:model.school,title:model.title,format:model.format,readyTemplate:entry.readyTemplate===true,...(error?{compileError:error}:{})});
  // Preserve the existing degree-link compatibility contract. The independent
  // research-quality report is deliberately not a silent public gate change.
  const balancePolicy=Planner.creditBalancePolicy?.(model),inactiveBalance=row=>Boolean(balancePolicy?.balanceRequirementIds.includes(row.requirementId)&&row.creditBalanceDerived===true&&row.credits===0&&row.option===null);
  const complete=plan.validation?.academicCountsValid===true&&list(plan.rows).length===list(model.requirements).length&&list(plan.rows).every(row=>inactiveBalance(row)||!balancePolicy&&row.status==='planned'&&Planner.openSlotPlaceholder(list(model.requirements).find(req=>req.id===row.requirementId),row.option)||row.option&&!row.selectionRequired&&row.option.code&&!row.option.selectionRequired);
  for(const pathwayId of list(entry.routeIds))for(const format of list(entry.modalities)){
   const targetRoute=list(catalog.pathways).find(route=>route.id===pathwayId);
   if(!complete||!targetRoute||targetRoute.modelId!==model.id||targetRoute.school!==model.school||targetRoute.level&&targetRoute.level!==level||!list(targetRoute.modalities).includes(format)||!['online','campus'].includes(format)||mode&&format!==mode)continue;
   const reference=targetRoute.url?findResearchReference(references,targetRoute.url,{includeStaleChoiceIdentity:true,now:Date.parse(asOf+'T00:00:00Z')}):null;
   if(reference&&checkResearchReference({...model,schoolName:model.school,programName:model.title,modality:format,catalogYear:catalogYear(model)},reference).length)continue;
   const key=baselineKey(model.id,pathwayId,format);
   baselines[key]={modelId:model.id,pathwayId,modality:format,academicFingerprint:requirementsFingerprint(model),qualityReady:true,summary:templateSummary(model,entry,plan),rows:list(plan.rows).map(row=>({requirementId:row.requirementId,optionId:row.option?.id??null,provider:row.option?.provider??null,code:row.option?.code??null,credits:row.credits,status:'planned'})),validation:{academicCountsValid:true,policyChecksComplete:plan.validation.policyChecksComplete===true},researchStatus:quality.status};
  }
 }
 const counts=(values,select)=>Object.fromEntries(values.map(value=>[value,programs.filter(program=>select(program)===value).length]));
 const report={schemaVersion:1,registryRevision:registry.revision,asOf,scope:'Baseline research coverage. No student credit is awarded by this report.',summary:{models:programs.length,availableTemplates:programs.filter(program=>program.readyTemplate).length,publicationReady:programs.filter(program=>program.publication.ready).length,research:counts(['research-ready','conditional','needs-research','unavailable'],program=>program.status),execution:{personalTaskPrograms:programs.filter(program=>program.execution.personalTasks.length).length},estimates:{cost:counts(['complete-estimate','partial-estimate','not-estimated'],program=>program.estimates.cost.status),timing:counts(['source-supported-scenario','assumption-based-scenario','not-estimated'],program=>program.estimates.timing.status)}},programs};
 const baselineIndex={schemaVersion:1,registryRevision:registry.revision,asOf,plannerHash:inputHashes['/planner.js']||null,inputs:inputHashes,privateRecordsIncluded:false,baselines};
 if(planningRates)report.summary.estimates.planning={asOf:planningAsOf,availableRanges:programs.filter(program=>program.estimates.planning.available).length,pricedProviderRanges:programs.filter(program=>program.estimates.planning.status==='planning-range').length,partialProviderRanges:programs.filter(program=>program.estimates.planning.status==='partial-range').length,assumptionBasedTimingRanges:programs.filter(program=>program.estimates.planning.timing?.status==='assumption-based-range').length,notEstimated:programs.filter(program=>!program.estimates.planning.available).length};
 baselineIndex.revision='baselines-v1:'+createHash('sha256').update(JSON.stringify(baselineIndex)).digest('hex');
 const publicationIndex={schemaVersion:1,registryRevision:registry.revision,asOf,privateRecordsIncluded:false,plans:programs.filter(program=>program.publication.ready).map(program=>({modelId:program.modelId,publicationReady:true,level:Catalog.publicationLevel(models.find(model=>model.id===program.modelId)?.level||list(catalog.pathways).find(route=>route.modelId===program.modelId)?.level),modelFingerprint:Catalog.publicationModelFingerprint(models.find(model=>model.id===program.modelId),list(catalog.pathways).find(route=>route.modelId===program.modelId)?.level),routeIds:[...new Set(Object.values(baselines).filter(baseline=>baseline.modelId===program.modelId&&baseline.researchStatus==='research-ready').map(baseline=>baseline.pathwayId))]})).filter(plan=>plan.routeIds.length)};
 return {report,baselineIndex,publicationIndex};
}
export async function runPathwayArtifacts({base=root,check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(base,path),'utf8'));
 const {models,entries,asOf}=await readAcademicInputs(base),registry=await read('dist/data/academic-registry.json'),curricula=await read('dist/data/curriculum-registry.json');
 const catalog=Catalog.attachRegistry(Catalog.merge(await read('dist/data/pathways.json'),await read('dist/data/program-catalog.json')),curricula);
 const paths=[...new Set(['planner.js','course-assessment.js','data/academic-registry.json','data/pathways.json','data/program-catalog.json','data/curriculum-registry.json','data/research-references.json',...entries.map(entry=>entry.path)])].sort();
 const inputHashes=Object.fromEntries(await Promise.all(paths.map(async path=>['/'+path,createHash('sha256').update(await readFile(resolve(base,'dist',path))).digest('hex')])));
 const planningRates=await read('dist/data/plan-estimate-rates.json');
 // Prices and curricula have separate review cycles. A price-only review must
 // neither advance academic evidence dates nor look future-dated against them.
 const planningAsOf=[asOf,planningRates.checkedOn].sort().at(-1);
 const {report,baselineIndex,publicationIndex}=compilePathwayArtifacts({models,entries,catalog,registry,references:await read('dist/data/research-references.json'),asOf,inputHashes,planningRates,planningAsOf});
 publicationIndex.curriculumFingerprint=Catalog.publicationFingerprint(curricula);
 for(const [path,payload] of [['dist/data/pathway-quality-report.json',report],['dist/data/baseline-index.json',baselineIndex],['dist/data/publication-index.json',publicationIndex]]){
  const serialized=JSON.stringify(payload)+'\n';
  if(check){if(await readFile(resolve(base,path),'utf8')!==serialized)throw Error(path+' is stale. Run node scripts/build-pathway-quality-report.mjs.');}
  else{await mkdir(resolve(base,'dist/data'),{recursive:true});await writeFile(resolve(base,path),serialized);}
 }
 return {report,baselineIndex,publicationIndex};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);if(args.some(arg=>arg!=='--check'))throw Error('Use --check or no arguments.');
 const {report,baselineIndex}=await runPathwayArtifacts({check:args.includes('--check')});
 console.log(JSON.stringify({qualityReport:report.summary,precomputedBaselines:Object.keys(baselineIndex.baselines).length,registryRevision:report.registryRevision}));
}
