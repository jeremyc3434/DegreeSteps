/** Additive source-bound Phoenix metadata; never approves an academic model. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateProgramRequirementPacket,assembleProgramRequirements} from './program-requirements-metadata.mjs';
import Estimate from '../dist/plan-estimate-engine.js';
const root=resolve(import.meta.dirname,'..'),clone=x=>structuredClone(x),read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
export const PHOENIX_RATES='content/estimates/phoenix-graduate-rates-2026-11-27.json';
export const PHOENIX_REQUIREMENTS='content/discovery/phoenix-program-requirements.json';
const digest=x=>createHash('sha256').update(x).digest('hex');
export async function validatePhoenixGraduateMetadata(){
 const [review,requirements,rates,document]=await Promise.all([read('content/curricula/snapshots/cbe/phoenix-graduate-review-2026-11-27.json'),read(PHOENIX_REQUIREMENTS),read(PHOENIX_RATES),read('content/curricula/cbe.json')]);
 validateProgramRequirementPacket(requirements);assert.equal(rates.entries.length,4);assert.equal(requirements.reviews.length,4);
 const expected=new Set(review.programs.map(p=>p.modelId));assert.equal(expected.size,4);
 for(const source of [...requirements.sources,...rates.sources]){
  const current=review.sources.find(x=>x.id===source.id);assert(current&&current.url===source.url&&current.sha256===source.sha256&&current.capture===source.capture&&current.checked===source.checkedOn);
  const bytes=await readFile(resolve(root,source.capture)),meta=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(digest(bytes),source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);assert.equal(meta.status,200);assert.equal(meta.fetchedAt,current.originalRetrievedAt);
 }
 for(const entry of rates.entries){
  assert.equal(entry.modelIds.length,1);assert(expected.has(entry.modelIds[0]));const model=document.models.find(x=>x.id===entry.modelIds[0]),definition=review.programs.find(x=>x.modelId===model.id);
  assert.equal(model.graduateCBEReview.id,review.id);assert.equal(model.institutionMinCredits,entry.degreeUnits);assert.equal(model.externalMaxCredits,0);assert.equal(model.alternativeMaxCredits,0);assert.equal(model.creditSystem,entry.creditSystem);assert.equal(model.totalCredits,entry.degreeUnits);assert(entry.catalogs.includes(model.catalogYear));
  const facts=assembleProgramRequirements(model,[requirements]);assert(facts.length>=3);assert(facts.some(x=>x.prominent&&x.kind==='admission'&&/experience/.test(x.label)));
  assert.equal(entry.pace.max,12);assert.equal(model.pacing.maximumCoursesPerTerm,4);assert(model.requirements.every(x=>x.credits===3));assert.equal(model.requirements.find(x=>x.code===definition.capstoneCode).minimumCompletedCredits,definition.capstoneMinimumCredits);
  assert.equal(entry.feesPerTerm,0);assert.equal(entry.oneTimeFees,0);assert(entry.sourceIds.includes('phoenix-graduate-fees-20261127'));
  if(entry.creditSystem==='competency-unit'){assert.equal(entry.tuition.type,'paid-term');assert.equal(entry.tuition.termRate,2749);assert.equal(entry.pace.min,6);assert.equal(model.pacing.maximumUniversityCreditsPer12Months,39);assert(facts.some(x=>x.prominent&&x.type==='non-licensure'));assert(facts.some(x=>x.prominent&&x.type==='financial-aid-restriction'));}
  else{assert.equal(entry.tuition.type,'per-credit');assert.equal(entry.tuition.rate,300);assert.equal(entry.pace.min,9);}
 }
 return {review,requirements,rates,models:document.models.filter(x=>expected.has(x.id))};
}
export function mergePhoenixRates(existing,packet){
 const result=clone(existing);result.checkedOn=[existing.checkedOn,packet.checkedOn].sort().at(-1);const ids=new Set(packet.entries.flatMap(x=>x.modelIds)),entryIds=new Set(packet.entries.map(x=>x.id));
 assert(!result.entries.some(entry=>entry.modelIds.some(id=>ids.has(id))&&!entryIds.has(entry.id)),'Another reviewed estimate already owns one of these exact Phoenix programs');
 result.entries=result.entries.filter(entry=>!entryIds.has(entry.id));result.entries.push(...clone(packet.entries));
 for(const source of packet.sources){const old=result.sources.find(x=>x.id===source.id);if(old)assert.deepEqual(old,source,'A prior Phoenix source may not silently change');else result.sources.push(clone(source));}
 Estimate.assertRates(result);return result;
}
export async function buildPhoenixGraduateMetadata({applyRates=false,check=false}={}){
 const {rates,models}=await validatePhoenixGraduateMetadata();if(applyRates){const path='content/estimates/plan-estimate-rates.json',existing=await read(path),merged=mergePhoenixRates(existing,rates),bytes=JSON.stringify(merged,null,2)+'\n';if(check)assert.equal(await readFile(resolve(root,path),'utf8'),bytes,'Merge the exact reviewed Phoenix rates after other school metadata writers finish');else await writeFile(resolve(root,path),bytes);}
 return {models:models.map(x=>x.id),prominentEligibility:true,reviewedRateEntries:rates.entries.length,appliedRates:applyRates,check,personalAdmissionsGranted:0,outsideAwardsCreated:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert(process.argv.slice(2).every(x=>['--apply-rates','--check'].includes(x)));console.log(JSON.stringify(await buildPhoenixGraduateMetadata({applyRates:process.argv.includes('--apply-rates'),check:process.argv.includes('--check')})));}
