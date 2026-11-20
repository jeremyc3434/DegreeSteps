/** Reproducible reviewed prices. No network requests or student records. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import Estimate from '../dist/plan-estimate-engine.js';
const root=resolve(import.meta.dirname,'..');
export async function buildPlanEstimateRates({check=false}={}){
 const rates=JSON.parse(await readFile(resolve(root,'content/estimates/plan-estimate-rates.json'),'utf8'));
 Estimate.assertRates(rates);const bytes=JSON.stringify(rates,null,2)+'\n',path=resolve(root,'dist/data/plan-estimate-rates.json');
 if(check){if(await readFile(path,'utf8')!==bytes)throw Error('The reviewed plan-estimate rates are stale.');}
 else{await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
 return{entries:rates.entries.length,exactModels:rates.entries.reduce((sum,entry)=>sum+entry.modelIds.length,0),providers:rates.providers.length,checkedOn:rates.checkedOn,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: node scripts/build-plan-estimate-rates.mjs [--check]');console.log(JSON.stringify(await buildPlanEstimateRates({check:process.argv.includes('--check')})));}
