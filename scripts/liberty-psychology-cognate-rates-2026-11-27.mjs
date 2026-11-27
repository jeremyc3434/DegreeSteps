/** Bind new standard online undergraduate editions to the existing reviewed
 * 2026–27 price basis. No price-source date, amount, or prior program changes. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import Estimate from '../dist/plan-estimate-engine.js';
const root=resolve(import.meta.dirname,'..'),read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
export const rateId='liberty-online-psychology-cognates-20261127';
export async function bindLibertyPsychologyRates({check=false}={}){
 const path='content/estimates/plan-estimate-rates.json',rates=await read(path),review=await read('content/curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json');
 assert.equal(review.id,'liberty-psychology-cognates-2026-11-27');assert.equal(review.programs.length,5);
 const base=rates.entries.find(entry=>entry.id==='liberty-online-2026-27');assert(base);
 assert.equal(base.school,'Liberty University');assert.equal(base.modality,'online');assert.equal(base.creditSystem,'semester');assert.equal(base.degreeUnits,120);assert.deepEqual(base.catalogs,['2026-2027']);
 assert.deepEqual(base.tuition,{type:'threshold-credit',fullTimeRate:410,partTimeRate:475,fullTimeMin:12});assert.equal(base.feesPerTerm,349);assert.equal(base.oneTimeFees,100);
 assert.deepEqual(base.sourceIds,['liberty-online-tuition-fees']);
 const source=rates.sources.find(source=>source.id===base.sourceIds[0]);assert.equal(source?.url,'https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-online-program/');assert.equal(source.checkedOn,'2026-11-19');
 for(const entry of review.programs){
  const program=await read('content/pathway-kits/liberty/programs/'+entry.slug+'.json'),pricing=program.modelFields.pricing;
  assert.equal(program.modelId,entry.modelId);assert.equal(program.level,'bachelor');assert.equal(program.totalCredits,120);assert.deepEqual(program.modalities,['online']);assert.equal(program.catalog.replace(/[–—]/g,'-'),'2026-2027');
  assert.equal(program.review.reviewedOn,review.checkedOn);assert.equal(pricing.model,'threshold-credit');assert.equal(pricing.catalogYear,'2026-2027');assert.equal(pricing.sourceUrl,source.url);
  for(const key of ['fullTimeRate','partTimeRate','fullTimeMin'])assert.equal(pricing[key],base.tuition[key],entry.modelId+': retain the same reviewed standard undergraduate rate');
 }
 const modelIds=review.programs.map(entry=>entry.modelId);
 assert(!rates.entries.some(entry=>entry.id!==rateId&&entry.modelIds.some(id=>modelIds.includes(id))),'Another price profile already owns a new edition');
 const profile={...structuredClone(base),id:rateId,modelIds};
 const at=rates.entries.findIndex(entry=>entry.id===rateId);
 if(check){assert(at>=0,'Install the scoped Liberty cognate price binding');assert.deepEqual(rates.entries[at],profile);}
 else{if(at<0)rates.entries.push(profile);else assert.deepEqual(rates.entries[at],profile,'Re-review a changed price basis rather than silently replacing it');Estimate.assertRates(rates);await writeFile(resolve(root,path),JSON.stringify(rates,null,2)+'\n');}
 return{models:modelIds,rateId,originalPriceSourceCheckedOn:source.checkedOn,priceSourcesRefreshed:0,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert(process.argv.slice(2).every(arg=>arg==='--check'));console.log(JSON.stringify(await bindLibertyPsychologyRates({check:process.argv.includes('--check')})));}
