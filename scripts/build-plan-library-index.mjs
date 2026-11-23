/* Compact index for the in-app plan finder: review tier, browsing subjects and plain-language open questions per route.
 * Derived only from the curriculum registry and the pathway quality report; it never changes a plan or its findings. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {subjectAreas,subjectsFor} from './subject-areas.mjs';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'dist/data/plan-library-index.json');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));

/** Student-facing questions. School-level findings become one concrete question each; course-level findings are counted. */
const policyQuestion={alternativeMaxCredits:'Ask the school: what is the most ACE- or NCCRS-recommended credit you accept toward this degree?',externalMaxCredits:'Ask the school: what is the most transfer credit you accept toward this degree?',institutionMinCredits:'Ask the school: how many credits must I earn at the school itself for this degree?'};
const researchQuestion=[
  [/time limit/i,'Ask the school: is there a time limit on how old transfer credit can be? Its published sources disagree.'],
  [/catalog eligibility|written transfer evaluation|residency allocation/i,'Ask the school for a written transfer evaluation that confirms these courses for your catalog year, including any major-course residency rules.'],
  [/state-specific/i,'Ask the school whether your state changes the general-education requirements in this plan.'],
  [/time limit|currency|years? old/i,'Ask the school whether older credits still count.']
];
const levelOf=value=>{const v=String(value||'').toLowerCase();return /associate/.test(v)?'associate':/master/.test(v)?'master':/doctor/.test(v)?'doctorate':/bachelor/.test(v)?'bachelor':'';};
const generic='Some of the school’s published rules for this program are still being confirmed. Ask the school to confirm this plan before paying for outside courses.';
const plural=(n,word)=>n+' '+word+(n===1?'':/(ch|sh|s|x)$/.test(word)?'es':'s');
export function questionsFor(findings){
  const blocking=findings.filter(f=>f.blocking),out=[];let unmatched=false;
  for(const f of blocking.filter(f=>f.code==='policy-unresolved'))out.push(policyQuestion[f.field]||generic);
  for(const f of blocking.filter(f=>f.code==='unresolved-research')){const hit=researchQuestion.find(([re])=>re.test(f.message||''));if(hit)out.push(hit[1]);else unmatched=true;}
  const optionsFor=codes=>new Set(blocking.filter(f=>codes.includes(f.code)).flatMap(f=>f.optionIds?.length?f.optionIds:[f.code+':'+(f.requirementIds||[]).join(',')]));
  const matches=optionsFor(['mapping-scope','mapping-applicability','conditional-award']).size,providers=optionsFor(['provider-eligibility']).size;
  if(matches)out.push('Ask the school to confirm '+plural(matches,'proposed course match')+' for this exact program before paying for '+(matches===1?'it':'them')+'.');
  if(providers)out.push('Check the provider’s current enrollment terms for '+plural(providers,'outside course')+' before you enroll.');
  if(blocking.some(f=>f.code==='catalog-identity'))out.push('Ask the school which catalog year applies to you.');
  const openChoices=new Set(blocking.filter(f=>f.code==='open-course-choice').flatMap(f=>f.requirementIds||[])).size;
  if(openChoices)out.push('Pick a course for '+plural(openChoices,'open course choice')+' in this plan, then ask the school to confirm '+(openChoices===1?'it counts':'they count')+'.');
  if(unmatched||!out.length)out.push(generic);
  return [...new Set(out)];
}

export function buildIndex({registry,quality,estimates={},starts={},timings={},pages=new Map()}){
  const byModel=new Map(quality.programs.map(p=>[p.modelId,p])),plans={};
  for(const model of registry.models){
    const report=byModel.get(model.id);
    if(!report||model.readyTemplate!==true||report.research?.status==='unavailable')continue;
    const reviewed=report.publication?.ready===true||report.research?.status==='research-ready';
    const questions=reviewed?[]:questionsFor(report.findings||[]);
    for(const routeId of model.routeIds||[])plans[routeId]={modelId:model.id,tier:reviewed?'reviewed':'confirmation',published:report.publication?.ready===true,level:levelOf(model.level),subjects:subjectsFor(model.title),questions,openItems:reviewed?0:(report.findings||[]).filter(f=>f.blocking).length,...(starts[routeId]?{start:starts[routeId]}:{}),...(estimates[routeId]?{estimate:estimates[routeId]}:{}),...(timings[routeId]?{timing:timings[routeId]}:{}),...(pages.has(routeId)?{page:pages.get(routeId)}:{})};
  }
  return {kind:'degreesteps-plan-library-index',version:1,registryRevision:quality.registryRevision,asOf:quality.asOf,subjects:Object.fromEntries(subjectAreas.map(s=>[s.id,s.label])),plans:Object.fromEntries(Object.entries(plans).sort(([a],[b])=>a.localeCompare(b)))};
}

if(import.meta.url===`file://${process.argv[1]}`){
  // Starting-route numbers and the shared planning estimate for every plan, computed exactly as the public plan pages
  // do (the starting route's saved selections, then the plan-estimate engine). Partial estimates name unpriced providers.
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url);
  const Planner=require('../dist/planner.js'),Estimate=require('../dist/plan-estimate-engine.js');
  const [registry,baselines,rates]=await Promise.all(['dist/data/curriculum-registry.json','dist/data/baseline-index.json','dist/data/plan-estimate-rates.json'].map(read));
  const docs=new Map(),estimates={},starts={},timings={},priced=new Set((rates.providers||[]).map(item=>item.provider));
  for(const baseline of Object.values(baselines.baselines||{})){
    const entry=registry.models.find(item=>item.id===baseline.modelId);if(!entry)continue;
    if(!docs.has(entry.path))docs.set(entry.path,await read('dist/'+entry.path));
    const doc=docs.get(entry.path),model=(doc.models||[doc]).find(item=>item.id===baseline.modelId);if(!model)continue;
    starts[baseline.pathwayId]={outside:baseline.summary.transferCredits,university:baseline.summary.universityCredits,total:baseline.summary.totalCredits};
    const providers=[...new Set(model.requirements.flatMap(req=>(req.options||[]).map(option=>option.provider)))].filter(provider=>provider&&provider!=='University');
    const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId])),optimizationNodeBudget:12000});
    if(plan.totals?.external!==baseline.summary.transferCredits)continue;
    const estimate=Estimate.calculate({program:model,plan,rates}),range=estimate?.costs?.knownRange;
    if(!range||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min<=0)continue;
    // Study time from the same estimate: outside months and university terms at the engine's default pace assumptions.
    const timing=estimate.timing;
    if(timing?.outsideMonths&&timing?.universityTerms)timings[baseline.pathwayId]={outsideMonths:{min:timing.outsideMonths.min,max:timing.outsideMonths.max},universityTerms:{min:timing.universityTerms.min,max:timing.universityTerms.max},termLabel:timing.termLabel,termMonths:timing.universityTermMonths??null};
    if(estimate.status==='planning-range')estimates[baseline.pathwayId]={min:range.min,max:range.max};
    else if(estimate.status==='partial-range'){const used=[...new Set(plan.rows.map(row=>row.option?.provider).filter(provider=>provider&&provider!=='University'))];estimates[baseline.pathwayId]={min:range.min,max:range.max,partial:true,unpriced:used.filter(provider=>!priced.has(provider))};}
  }
  // The public, read-only plan page for routes that have one (finder "Just preview").
  const {loadPublicPlans}=await import('./public-plan-pages.mjs'),pages=new Map((await loadPublicPlans(resolve(root,'dist'))).map(plan=>[plan.id,plan.path]));
  const index=buildIndex({registry,quality:await read('dist/data/pathway-quality-report.json'),estimates,starts,timings,pages});
  const text=JSON.stringify(index)+'\n',tiers=Object.values(index.plans).reduce((n,p)=>(n[p.tier]=(n[p.tier]||0)+1,n),{});
  if(process.argv.includes('--check')){let current='';try{current=await readFile(output,'utf8');}catch{}assert.equal(current,text,'dist/data/plan-library-index.json is stale; run node scripts/build-plan-library-index.mjs');}
  else await writeFile(output,text);
  console.log(JSON.stringify({output:'dist/data/plan-library-index.json',routes:Object.keys(index.plans).length,tiers,check:process.argv.includes('--check')}));
}
