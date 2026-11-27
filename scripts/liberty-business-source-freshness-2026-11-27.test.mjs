import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {academicDigest,reviewLibertyBusinessSources,reviewPath,modelPath} from './liberty-business-source-freshness-2026-11-27.mjs';
const packet=JSON.parse(await readFile(reviewPath,'utf8')),model=JSON.parse(await readFile(modelPath,'utf8'));
test('monthly primary-source maintenance is reversible, exact and idempotent',async()=>{
 const before=structuredClone(model);before.sources=before.sources.map(source=>packet.sources.find(value=>value.sourceId===source.id)?.previousDescriptor||source);
 const after=await reviewLibertyBusinessSources(before);assert.deepEqual(after,model);assert.deepEqual(await reviewLibertyBusinessSources(after),after);
 assert.equal(academicDigest(before),academicDigest(after));assert.deepEqual(after.requirements,before.requirements);assert.deepEqual(after.reviewedBaselineChoices,before.reviewedBaselineChoices);
 assert.equal(after.sources.find(source=>source.id==='sophia').originalCapturedAt,'2026-11-25T23:09:17.530Z');assert.equal(after.sources.find(source=>source.id==='sophia').latestRetrievedAt,'2026-11-27T15:15:37.759Z');
});
test('freshness refresh fails closed for missing evidence or fabricated retrieval time',async()=>{
 const readText=async path=>{const raw=await readFile(path,'utf8');return path===packet.sources[1].capture?raw.replace('SOPH-0022 HIST1001 US History I 3 HIUS 221','SOPH-0022 HIST1001 US History I 3 HIUS 999'):raw;};
 await assert.rejects(reviewLibertyBusinessSources(model,{readText}));
 const changed=structuredClone(packet);changed.sources[1].fetchedAt='2026-11-27T00:00:00.000Z';await assert.rejects(reviewLibertyBusinessSources(model,{packet:changed}));
});
test('a source refresh cannot change academic rules, options or approved choices',async()=>{
 for(const mutate of [m=>m.requirements[0].credits++,m=>m.reviewedBaselineChoices.optionSelections['engl-101']='university-engl-101',m=>m.externalMaxCredits=120]){
  const changed=structuredClone(model);mutate(changed);await assert.rejects(reviewLibertyBusinessSources(changed),/preserve every academic/);
 }
});
