/** Promote five already-proved original course identities for every school kit.
 * Sources use global IDs; exact receiving awards remain each school's work. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadDataAnalyticsIdentities} from './wgu-data-analytics-identities.mjs';
import {root,stringifyKit,sourceRefs,isMain} from './pathway-factory/lib.mjs';
export const promotedCodes=['SOPH-0015','SOPH-0021','SOPH-0030','SOPH-0041','SOPH-0065'];
export const renamedSophiaSource=id=>'shared-sophia--'+id.replace(/^wgu-global-sophia--/,'');
function renameRefs(value){
  if(Array.isArray(value))return value.map(renameRefs);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,Array.isArray(child)&&(key==='sourceIds'||/SourceIds$/.test(key))?child.map(renamedSophiaSource):renameRefs(child)]));
}
export async function promoteSophiaIdentities({check=false}={}){
  const {bundle,sophiaCandidates}=await loadDataAnalyticsIdentities(),path=resolve(root,'content/pathway-kits/providers/sophia.json');
  const original=JSON.parse(await readFile(path,'utf8')),provider=structuredClone(original),courses=sophiaCandidates.filter(course=>promotedCodes.includes(course.code));assert.equal(courses.length,5);
  const needed=new Set(sourceRefs(courses).map(ref=>ref.id)),identityIds=new Set(courses.flatMap(course=>course.identitySourceIds)),periodIds=new Set(courses.flatMap(course=>course.recommendationPeriodSourceIds||[]));
  const sources=bundle.sources.filter(source=>needed.has(source.id)).map(source=>({...structuredClone(source),id:renamedSophiaSource(source.id),originalSourceId:source.id,upstreamOriginalSourceId:source.originalSourceId,copiedFrom:'content/reuse/wgu-sophia-provider-identities.json',roles:[...(identityIds.has(source.id)?['provider-identity']:[]),...(periodIds.has(source.id)?['recommendation-period']:[])]}));
  for(const source of sources){const existing=provider.sources.find(item=>item.id===source.id);if(existing)assert.deepEqual(existing,source);else provider.sources.push(source);}
  for(const input of courses){
    const {provider:_provider,creditOrigin:_origin,sourceType:_type,...facts}=renameRefs(input),index=provider.courses.findIndex(course=>course.code===facts.code);assert(index>=0);
    provider.courses[index]={...provider.courses[index],...facts};
  }
  for(const before of original.courses.filter(course=>!promotedCodes.includes(course.code)))assert.deepEqual(provider.courses.find(course=>course.code===before.code),before,'Do not revise other verified or unknown original courses');
  const text=stringifyKit(provider,['courses'])+'\n';
  if(check)assert.equal(await readFile(path,'utf8'),text,'Promote the independently proved Sophia course facts');else await writeFile(path,text);
  return {promotedCodes,sourcesAdded:sources.length,oldReceivingAwardsChanged:0,studentCreditsAwarded:0};
}
if(isMain(import.meta))console.log(JSON.stringify(await promoteSophiaIdentities({check:process.argv.includes('--check')})));
