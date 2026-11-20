/* Compact index for the in-app plan finder: review tier, browsing subjects and plain-language open questions per route.
 * Derived only from the curriculum registry and the pathway quality report; it never changes a plan or its findings. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {subjectAreas,subjectsFor} from './subject-areas.mjs';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'dist/data/plan-library-index.json');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));

/** Student-facing wording for each blocking finding category. Unknown codes fall back to a generic, honest line. */
export const questionText=Object.freeze({
  'policy-unresolved':'A school transfer policy for this program, such as its limit on outside credit, still needs confirmation.',
  'unresolved-research':'Some of the school’s published rules for this program are still being confirmed.',
  'provider-eligibility':'Some outside courses need the provider’s current enrollment terms confirmed.',
  'mapping-scope':'Some course matches were documented for a related degree or format and need confirmation for this one.',
  'mapping-applicability':'Some course matches need confirmation that they apply to this exact program.',
  'conditional-award':'Some course matches carry conditions the school must approve.',
  'catalog-identity':'The catalog year or edition for this program needs confirmation.'
});
const fallback='Some details of this plan still need confirmation with the school.';

export function buildIndex({registry,quality}){
  const byModel=new Map(quality.programs.map(p=>[p.modelId,p])),plans={};
  for(const model of registry.models){
    const report=byModel.get(model.id);
    if(!report||model.readyTemplate!==true||report.research?.status==='unavailable')continue;
    const reviewed=report.publication?.ready===true||report.research?.status==='research-ready';
    const codes=[...new Set((report.findings||[]).filter(f=>f.blocking).map(f=>f.code))];
    const questions=reviewed?[]:[...new Set(codes.map(code=>questionText[code]||fallback))];
    for(const routeId of model.routeIds||[])plans[routeId]={modelId:model.id,tier:reviewed?'reviewed':'confirmation',published:report.publication?.ready===true,subjects:subjectsFor(model.title),questions,openItems:reviewed?0:(report.findings||[]).filter(f=>f.blocking).length};
  }
  return {kind:'degreesteps-plan-library-index',version:1,registryRevision:quality.registryRevision,asOf:quality.asOf,subjects:Object.fromEntries(subjectAreas.map(s=>[s.id,s.label])),plans:Object.fromEntries(Object.entries(plans).sort(([a],[b])=>a.localeCompare(b)))};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const index=buildIndex({registry:await read('dist/data/curriculum-registry.json'),quality:await read('dist/data/pathway-quality-report.json')});
  const text=JSON.stringify(index)+'\n',tiers=Object.values(index.plans).reduce((n,p)=>(n[p.tier]=(n[p.tier]||0)+1,n),{});
  if(process.argv.includes('--check')){let current='';try{current=await readFile(output,'utf8');}catch{}assert.equal(current,text,'dist/data/plan-library-index.json is stale; run node scripts/build-plan-library-index.mjs');}
  else await writeFile(output,text);
  console.log(JSON.stringify({output:'dist/data/plan-library-index.json',routes:Object.keys(index.plans).length,tiers,check:process.argv.includes('--check')}));
}
