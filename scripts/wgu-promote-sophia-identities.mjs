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
export function applySophiaPromotions(original,{bundle,sophiaCandidates}){
  assert.equal(original.provider,'Sophia');
  const provider=structuredClone(original),courses=sophiaCandidates.filter(course=>promotedCodes.includes(course.code));assert.equal(courses.length,5);assert.equal(new Set(courses.map(course=>course.code)).size,5);
  const needed=new Set(sourceRefs(courses).map(ref=>ref.id)),identityIds=new Set(courses.flatMap(course=>course.identitySourceIds)),periodIds=new Set(courses.flatMap(course=>course.recommendationPeriodSourceIds||[]));
  const sources=bundle.sources.filter(source=>needed.has(source.id)).map(source=>({...structuredClone(source),id:renamedSophiaSource(source.id),originalSourceId:source.id,upstreamOriginalSourceId:source.originalSourceId,copiedFrom:'content/reuse/wgu-sophia-provider-identities.json',roles:[...(identityIds.has(source.id)?['provider-identity']:[]),...(periodIds.has(source.id)?['recommendation-period']:[])]}));
  assert.equal(new Set(sources.map(source=>source.id)).size,sources.length,'A promoted source must have one exact identity');
  for(const source of sources){assert(provider.sources.filter(item=>item.id===source.id).length<=1,'A promoted source must occur exactly once');const existing=provider.sources.find(item=>item.id===source.id);if(existing)assert.deepEqual(existing,source);else provider.sources.push(source);}
  for(const input of courses){
    const {provider:_provider,creditOrigin:_origin,sourceType:_type,...facts}=renameRefs(input);assert.equal(provider.courses.filter(course=>course.code===facts.code).length,1,'A promoted original course must occur exactly once');const index=provider.courses.findIndex(course=>course.code===facts.code);
    provider.courses[index]={...provider.courses[index],...facts};
  }
  for(const before of original.courses.filter(course=>!promotedCodes.includes(course.code)))assert.deepEqual(provider.courses.find(course=>course.code===before.code),before,'Do not revise other verified or unknown original courses');
  return provider;
}
export function verifySophiaPromotions(original,input){
  const expected=applySophiaPromotions(original,input);
  // Shared provider batches own their own facts and array order. Whitespace
  // changes by a different reproducible writer cannot invalidate these facts.
  assert.deepEqual(original,expected,'Promote the independently proved Sophia course facts');
  return expected;
}
export async function promoteSophiaIdentities({check=false}={}){
  const input=await loadDataAnalyticsIdentities(),path=resolve(root,'content/pathway-kits/providers/sophia.json'),original=JSON.parse(await readFile(path,'utf8'));
  const provider=check?verifySophiaPromotions(original,input):applySophiaPromotions(original,input);
  if(!check)await writeFile(path,stringifyKit(provider,['courses'])+'\n');
  const sources=provider.sources.filter(source=>source.copiedFrom==='content/reuse/wgu-sophia-provider-identities.json'&&source.id.startsWith('shared-sophia--'));
  return {promotedCodes,sourcesAdded:sources.length,oldReceivingAwardsChanged:0,studentCreditsAwarded:0};
}
if(isMain(import.meta))console.log(JSON.stringify(await promoteSophiaIdentities({check:process.argv.includes('--check')})));
