/** Exact reviewed catalog URLs for the new non-Phoenix cohort; no directory inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
export async function bindExpansionDegreeLinks({check=false}={}){
 const path='dist/data/degree-link-aliases.json',before=await read(path),next=structuredClone(before),registry=await read('dist/data/curriculum-registry.json'),publication=await read('dist/data/publication-index.json'),baselines=await read('dist/data/baseline-index.json'),cohort=await read('test-support/fixtures/degree-expansion/nov27-complete-degree-cohort.json');
 let count=0;
 for(const fixture of cohort.cases.filter(row=>!row.modelId.startsWith('curriculum-phoenix-'))){
  const entry=registry.models.find(row=>row.id===fixture.modelId),published=publication.plans.find(row=>row.modelId===fixture.modelId&&row.publicationReady);assert(entry&&published,'Only an already published exact degree is eligible');
  const document=await read('dist/'+entry.path),model=(document.models||[document]).find(row=>row.id===fixture.modelId),url=model.catalogIdentity?.sourceUrl||model.sources.find(source=>source.roles?.includes('curriculum'))?.url;
  assert(url&&new URL(url).protocol==='https:'&&!new URL(url).search&&!new URL(url).hash);
  assert(model.sources.some(source=>source.url===url&&(source.capture||source.captureSha256||source.sha256)),'Keep the exact retained university degree source');
  const baseline=Object.values(baselines.baselines).find(row=>row.modelId===model.id&&published.routeIds.includes(row.pathwayId));assert(baseline&&baseline.qualityReady);assert(entry.modalities.length===1&&entry.modalities[0]==='online');
  const alias={url,modelId:model.id,pathwayId:baseline.pathwayId,modality:'online',sourceUrl:url,checkedOn:'2026-11-27'},existing=next.aliases.find(row=>row.url.replace(/\/+$/,'')===url.replace(/\/+$/,''));
  if(existing)assert.deepEqual(existing,alias,'An existing exact link cannot be reassigned');else next.aliases.push(alias);count++;
 }
 assert.equal(count,10);
 if(check)assert.deepEqual(before,next,'Stale exact new-degree URL bindings');else await writeFile(resolve(root,path),JSON.stringify(next,null,2)+'\n');
 return{exactCatalogLinks:count,check,personalRecordsChanged:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await bindExpansionDegreeLinks({check:process.argv.includes('--check')})));
