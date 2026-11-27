/** Offline audit of published starting plans, never a claim of exhaustive transfer coverage. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import Planner from '../dist/planner.js';
import {assessPathwayQuality,mappingFinding} from './pathway-quality.mjs';

const root=resolve(import.meta.dirname,'..'),list=v=>Array.isArray(v)?v:[],text=v=>typeof v==='string'?v.trim():'',clone=v=>structuredClone(v);
const unique=v=>[...new Set(v)].sort(),near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.001;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(canonical(v))).digest('hex');
const edition=v=>String(v||'').replace(/[–—]/g,'-');
const count=values=>Object.fromEntries(unique(values).map(key=>[key,values.filter(v=>v===key).length]));
const checked=s=>s?.checkedOn||s?.checked||s?.checkedAt||null;
const realDate=value=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||''))return false;const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;};
const reasonMessage=(code,finding)=>reasons[code]||(code.startsWith('research:')?finding?.message||'This candidate has unresolved research.':code.startsWith('constraint:')?'This frozen substitution fails '+code.slice(11).replaceAll('_',' ')+'.':code);
const scope=m=>({school:m.school,catalog:edition(m.catalogYear||m.catalog),format:m.format,level:m.level,creditSystem:m.creditSystem});
const sourceProof=(m,ids)=>unique(ids).map(id=>{const s=list(m.sources).find(s=>s.id===id);return {id,url:s?.url||null,checkedOn:checked(s),hash:s?.sourceContentHash||s?.captureSha256||s?.sha256||null};});
export const reportPath='dist/data/transfer-maximization-report.json';
export const DEFAULT_NODE_BUDGET=12000;
const reasons={
 'conditional-mapping':'This outside option is conditional and is excluded from the strict published-only search.',
 'institution-only':'The requirement must be completed at the receiving university.',
 'selection-required':'A specific source course or requirement choice has not been established.',
 'award-quantity':'The receiving award does not match this requirement’s allocated credit quantity.',
 'credit-unit':'The award uses a different credit unit.',
 'upper-level':'This requirement needs an upper-level award.',
 'source-reference':'The option has missing source references.',
 'evidence-status':'The option has no usable published or conditional evidence status.',
 'provider-default':'This provider is absent from the model or generic starting preferences; the audit itself enables every listed provider.',
 'known-single-swap':'A strict published single-course substitution passes the unchanged publication checks.',
 'search-budget':'The bounded search did not prove an optimum within this model.'
};
function privateBaseline(b){
 const keys=['learning','profile','student','studentId','userId','learningId','privateNote','evaluations','records'];
 return keys.some(k=>Object.hasOwn(b||{},k))||list(b?.rows).some(r=>r?.status!=='planned'||keys.some(k=>Object.hasOwn(r||{},k)));
}
function baselineErrors(model,baseline){
 if(!baseline)return ['missing-published-baseline'];
 if(privateBaseline(baseline))return ['private-or-earned-records'];
 const errors=[];if(baseline.modelId!==model.id)errors.push('baseline-model');
 if(!near(baseline.summary?.totalCredits,model.totalCredits))errors.push('baseline-total');
 if(list(baseline.rows).length!==list(model.requirements).length||new Set(list(baseline.rows).map(r=>r.requirementId)).size!==list(model.requirements).length)errors.push('baseline-ledger');
 for(const row of list(baseline.rows)){
  const req=list(model.requirements).find(r=>r.id===row.requirementId),option=list(req?.options).find(o=>o.id===row.optionId&&o.provider===row.provider);
  if(!req||!option||req.selectionRequired||option.selectionRequired||!text(option.code)||!text(option.title)||!near(row.credits,req.credits)||!near(option.credits,req.credits))errors.push('unnamed-or-unsupported-baseline');
 }
 return unique(errors);
}
function identity(option,model){
 return {provider:option.provider,code:option.aceId||option.providerCourseCode||option.code||null,version:option.courseVersion??option.version??null,
  sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,recommendationStart:option.recommendationStart??null,recommendationEnd:option.recommendationEnd??null,
  evidence:sourceProof(model,[...list(option.identitySourceIds),...list(option.sourceCreditEvidence?.sourceIds),...list(option.sourceCreditVerification?.sourceIds),...list(option.recommendationPeriodSourceIds)])};
}
function selectedRows(plan){return list(plan.rows).map(r=>({requirementId:r.requirementId,optionId:r.option?.id||null,provider:r.option?.provider||null,code:r.option?.code||null,credits:r.credits}));}
function changedRows(before,after){return selectedRows(after).filter(r=>{const old=before.rows.find(o=>o.requirementId===r.requirementId);return old?.option?.id!==r.optionId||old?.option?.provider!==r.provider;});}
function counterfactual(model,base,row,option){
 const trial={...base,setupIssues:[],rows:base.rows.map(old=>old.requirementId===row.requirementId?{...old,option:clone(option),credits:option.credits,upper:Boolean(option.upper),institutional:false,selectionRequired:Boolean(option.selectionRequired),conditions:list(option.conditions),sourceIds:list(option.sourceIds)}:old)};
 const validation=Planner.validate(model,trial);
 return {academicCountsValid:validation.academicCountsValid,policyChecksComplete:validation.policyChecksComplete,errorCodes:unique(validation.errors.map(e=>e.code))};
}

/** Pure public-input entry point. Injections support focused solver/guard tests. */
export function buildTransferMaximizationReport({publication,registry,baselines,models,inputFingerprints={},nodeBudget=DEFAULT_NODE_BUDGET,generate=Planner.generate,assess=assessPathwayQuality}={}){
 assert(Number.isSafeInteger(nodeBudget)&&nodeBudget>=1&&nodeBudget<=250000,'Use a bounded positive node budget.');
 const asOf=publication?.asOf;assert(realDate(asOf),'Use the publication artifact’s real review date.');
 const published=list(publication.plans).filter(p=>p.publicationReady===true).sort((a,b)=>a.modelId.localeCompare(b.modelId,'en'));
 assert.equal(new Set(published.map(p=>p.modelId)).size,published.length,'Publication model identities must be unique.');
 const sourceModels=new Map(list(models).map(m=>[m.id,m])),programs=[],reviewGroups=new Map();
 for(const pub of published){
  const model=sourceModels.get(pub.modelId),entry=list(registry.models).find(e=>e.id===pub.modelId);
  if(!model||!entry){programs.push({modelId:pub.modelId,status:'not-auditable',baselineErrors:['missing-public-model'],rows:[]});continue;}
  const baseline=Object.values(baselines?.baselines||{}).find(b=>b.modelId===model.id&&list(pub.routeIds).includes(b.pathwayId)),invalid=baselineErrors(model,baseline);
  if(invalid.length){programs.push({modelId:model.id,status:'not-auditable',baselineErrors:invalid,rows:[]});continue;}
  const providers=unique(model.requirements.flatMap(r=>list(r.options).map(o=>o.provider)).filter(p=>p&&p!=='University'));
  const pins=Object.fromEntries(baseline.rows.map(r=>[r.requirementId,r.optionId]));
  const input={providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:pins,optimizationNodeBudget:nodeBudget};
  const base=generate(model,input),route={id:baseline.pathwayId,modelId:model.id,school:model.school,level:entry.level||model.level,modalities:[/^online$/i.test(model.format)?'online':'campus']};
  const baseQuality=assess({model,plan:base,route,asOf});
  const exact=base.rows.length===baseline.rows.length&&base.rows.every(r=>r.status==='planned'&&r.option?.id===pins[r.requirementId]&&!r.selectionRequired)&&near(base.totals.external,baseline.summary.transferCredits);
  if(!exact||!baseQuality.publication.ready){programs.push({modelId:model.id,status:'not-auditable',baselineErrors:unique([!exact?'baseline-reproduction':null,!baseQuality.publication.ready?'baseline-not-publication-ready':null].filter(Boolean)),rows:[]});continue;}
  const report={modelId:model.id,school:model.school,title:model.title,...scope(model),routeId:baseline.pathwayId,status:'audited',baseline:{degreeCredits:model.totalCredits,outsideCredits:base.totals.external,universityCredits:base.totals.institutional,earnedCredits:0},rows:[]};
  for(const row of base.rows.filter(r=>r.option?.provider==='University')){
   const req=model.requirements.find(r=>r.id===row.requirementId),alternatives=list(req.options).filter(o=>o.provider!=='University');
   const available=Planner.availableOptions(model,req.id,input),strict=Planner.availableOptions(model,req.id,{...input,allowConditional:false}),local=new Set(available.map(o=>o.id)),publishedIDs=new Set(strict.map(o=>o.id));
   const universityReason=req.institutionalOnly===true?{
    code:'institution-only',message:'The reviewed model explicitly marks this requirement as university-only; the references identify the model’s supporting source provenance.',sourceReferences:sourceProof(model,list(req.institutionalOnlySourceIds).length?req.institutionalOnlySourceIds:list(req.sourceIds)),sourceCoverageEstablished:false
   }:alternatives.length?{
    code:'outside-alternatives-not-selected',message:'The model lists outside alternatives; their specific research and degree-rule explanations appear below.',sourceReferences:[],sourceCoverageEstablished:false
   }:{
    code:'no-listed-outside-option',message:'The current model lists no outside option for this requirement. This does not establish that other credit sources were researched or that none can transfer.',sourceReferences:[],sourceCoverageEstablished:false
   };
   const detail={requirementId:req.id,code:req.code||null,title:req.title,credits:req.credits,universityReason,authoredStartingChoice:model.reviewedBaselineChoices?.optionSelections?.[req.id]===row.option.id,alternatives:[]};
   for(const option of alternatives){
    const codes=[];if(req.institutionalOnly)codes.push('institution-only');if(req.selectionRequired||option.selectionRequired||!text(option.code)||!text(option.title))codes.push('selection-required');if(!near(req.credits,option.credits))codes.push('award-quantity');if(option.creditSystem&&option.creditSystem!==model.creditSystem)codes.push('credit-unit');if(req.upperOnly&&option.upper!==true)codes.push('upper-level');
    const sources=new Set(list(model.sources).map(s=>s.id));if(!list(option.sourceIds).length||list(option.sourceIds).some(id=>!sources.has(id)))codes.push('source-reference');if(!['published','conditional'].includes(option.evidence))codes.push('evidence-status');if(option.evidence==='conditional')codes.push('conditional-mapping');
    if(!list(model.defaultProviders||['Sophia','Study.com','CLEP']).includes(option.provider))codes.push('provider-default');
    const finding=mappingFinding(model,req,option,{asOf});if(finding?.blocking)codes.push('research:'+finding.code);
    const frozen=local.has(option.id)&&!codes.includes('selection-required')?counterfactual(model,base,row,option):null;
    if(frozen)codes.push(...frozen.errorCodes.map(c=>'constraint:'+c));
    let safeSingleSwap=false;
    if(publishedIDs.has(option.id)&&frozen?.academicCountsValid&&!finding?.blocking){
     const changed=generate(model,{...input,allowConditional:false,optionSelections:{...pins,[req.id]:option.id}}),q=assess({model,plan:changed,route,asOf});safeSingleSwap=q.publication.ready===true&&changed.totals.external>base.totals.external;
     if(safeSingleSwap)codes.push('known-single-swap');
    }
    const original=identity(option,model),groupId='identity-review-'+hash(original).slice(0,24),reasonCodes=unique(codes);
    detail.alternatives.push({optionId:option.id,provider:option.provider,code:option.code||null,receivingCode:option.receivingCode||null,credits:option.credits,sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,evidence:option.evidence,engineAvailable:local.has(option.id),strictPublishedAvailable:publishedIDs.has(option.id),identityReviewGroupId:groupId,reasonCodes,reasons:reasonCodes.map(code=>({code,message:reasonMessage(code,finding)})),frozenSubstitution:frozen,safePublishedSingleSwap:safeSingleSwap});
    if(!reviewGroups.has(groupId))reviewGroups.set(groupId,{id:groupId,originalIdentity:original,status:'candidate-review-group',automaticApproval:false,individualAwardsCreated:0,contexts:[]});
    reviewGroups.get(groupId).contexts.push({modelId:model.id,requirementId:req.id,optionId:option.id,receivingScope:scope(model),receivingCode:option.receivingCode||null,receivingCredits:option.credits,receivingCreditSystem:option.creditSystem||model.creditSystem,sourceIds:list(option.sourceIds),reasonCodes});
   }
   detail.alternatives.sort((a,b)=>a.provider.localeCompare(b.provider,'en')||String(a.code).localeCompare(String(b.code),'en')||a.optionId.localeCompare(b.optionId,'en'));report.rows.push(detail);
  }
  if(report.rows.some(row=>row.alternatives.length)){
   // Remove default hints on an audit copy; every ledger, award and academic rule remains intact.
   const searchModel=clone(model);delete searchModel.reviewedBaselineChoices;
   // Retain the independently revalidated public baseline as a feasible floor.
   // The planner's bound suggestion contract seeds an incumbent, never hard pins.
   const suggestedChoices={version:1,modelId:model.id,catalogYear:model.catalogYear||model.catalog,format:model.format,creditSystem:model.creditSystem,totalCredits:model.totalCredits,checkedOn:asOf,reviewId:baselines.revision||'validated-public-baseline:'+hash({modelId:model.id,asOf,pins}),sourceIds:unique(base.rows.flatMap(row=>list(row.option?.sourceIds))),optionSelections:clone(pins)};
   const strictProviders=unique(model.requirements.flatMap(r=>list(r.options).filter(o=>o.provider!=='University'&&o.evidence==='published'&&!o.selectionRequired).map(o=>o.provider)));
   const candidate=generate(searchModel,{providers:strictProviders,allowConditional:false,priority:'transfer',completed:[],optionSelections:{},suggestedChoices,optimizationNodeBudget:nodeBudget}),quality=assess({model,plan:candidate,route,asOf});
   const valid=quality.publication.ready===true&&candidate.validation.academicCountsValid===true&&candidate.validation.policyChecksComplete===true&&candidate.rows.every(r=>r.status==='planned'&&!r.selectionRequired&&r.option?.evidence==='published');
   report.search={scope:'listed-published-options-under-current-model-rules',allPossibleSourcesResearched:false,conditionalOptionsEnabled:false,incumbentPolicy:'validated-published-baseline-as-suggestion',explicitOptionSelections:0,nodeBudget,status:candidate.optimization?.status||'not-reported',optimalityProven:valid&&candidate.optimization?.optimalityProven===true,budgetExhausted:candidate.optimization?.budgetExhausted===true,statesVisited:candidate.optimization?.statesVisited??null,candidateOutsideCredits:candidate.totals.external,validatedOutsideCredits:valid?candidate.totals.external:null,publicationReady:quality.publication.ready,blockingCodes:unique(list(quality.findings).filter(f=>f.blocking).map(f=>f.code)),validatedImprovement:valid&&candidate.totals.external>base.totals.external,additionalOutsideCredits:valid?Math.max(0,candidate.totals.external-base.totals.external):null,changedRows:changedRows(base,candidate)};
  }else report.search={scope:'listed-published-options-under-current-model-rules',allPossibleSourcesResearched:false,status:'no-university-row-with-listed-alternative',validatedImprovement:false,additionalOutsideCredits:0,optimalityProven:false};
  programs.push(report);
 }
 const rows=programs.flatMap(p=>p.rows),options=rows.flatMap(r=>r.alternatives),audited=programs.filter(p=>p.status==='audited'),improvements=programs.filter(p=>p.search?.validatedImprovement),groups=[...reviewGroups.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const payload={schemaVersion:1,kind:'degreesteps-transfer-maximization-audit',asOf,scope:'Published complete named starting plans only. Search proof applies to listed options and current model rules; exhaustive provider coverage and a universal maximum are not established.',privateStudentRecordsIncluded:false,earnedCreditsInBaseline:0,automaticApprovals:0,runtimeAiCalls:0,configuration:{nodeBudget,baselineChoices:'reproduce-before-unpinned-audit',searchEvidence:'strict-published'},inputFingerprints:canonical(inputFingerprints),summary:{publicationReadyModels:published.length,auditedModels:audited.length,notAuditableModels:programs.length-audited.length,modelsWithUniversityAlternatives:audited.filter(p=>p.rows.some(row=>row.alternatives.length)).length,totalUniversityRows:rows.length,universityRowsWithAlternatives:rows.filter(row=>row.alternatives.length).length,candidatePlacements:options.length,publishedCandidatePlacements:options.filter(o=>o.evidence==='published').length,conditionalCandidatePlacements:options.filter(o=>o.evidence==='conditional').length,originalIdentityReviewGroups:groups.length,strictPublishedAlternativeRows:rows.filter(r=>r.alternatives.some(o=>o.strictPublishedAvailable)).length,safePublishedSingleSwapRows:rows.filter(r=>r.alternatives.some(o=>o.safePublishedSingleSwap)).length,validatedImprovementModels:improvements.length,additionalOutsideCreditsAcrossAlternativePlans:improvements.reduce((n,p)=>n+p.search.additionalOutsideCredits,0),knownModelOptimumProven:audited.filter(p=>p.search?.optimalityProven).length,searchBudgetExhausted:audited.filter(p=>p.search?.budgetExhausted).length,reasonOccurrences:count(options.flatMap(o=>o.reasonCodes))},programs,researchReviewGroups:groups};
 return {...payload,revision:'transfer-maximization-v1:'+hash(payload)};
}
export function assertNoValidatedTransferImprovements(report){
 assert.equal(report.privateStudentRecordsIncluded,false);assert.equal(report.earnedCreditsInBaseline,0);
 assert(report.summary?.publicationReadyModels>0,'Cannot certify an empty publication audit.');
 const unaudited=list(report.programs).filter(program=>program.status!=='audited');
 assert.equal(unaudited.length,0,'Cannot certify published plans without a valid complete public baseline: '+unaudited.map(program=>program.modelId).join(', '));
 assert.equal(list(report.programs).length,report.summary.publicationReadyModels,'Every actual published plan must be present in the audit.');
 assert.equal(report.summary.auditedModels,report.summary.publicationReadyModels,'Every actual published plan must be audited.');
 const missed=list(report.programs).filter(p=>p.search?.validatedImprovement||list(p.rows).some(r=>list(r.alternatives).some(o=>o.safePublishedSingleSwap)));
 assert.equal(missed.length,0,'Validated additional transfer credit is available in: '+missed.map(p=>p.modelId).join(', '));return report;
}
export async function readTransferMaximizationInputs(base=root){
 const fingerprints={},read=async path=>{const raw=await readFile(resolve(base,path));fingerprints[path]=hash(raw);return JSON.parse(raw);};
 const [publication,registry,baselines]=await Promise.all(['dist/data/publication-index.json','dist/data/curriculum-registry.json','dist/data/baseline-index.json'].map(read)),models=[];
 const paths=unique(list(publication.plans).filter(p=>p.publicationReady===true).map(p=>list(registry.models).find(e=>e.id===p.modelId)?.path).filter(Boolean));
 for(const path of paths){const doc=await read('dist/'+path);models.push(...list(doc.models||[doc]));}
 for(const path of ['scripts/build-transfer-maximization-report.mjs','scripts/pathway-quality.mjs','dist/planner.js','dist/course-assessment.js'])fingerprints[path]=hash(await readFile(resolve(base,path)));
 return {publication,registry,baselines,models,inputFingerprints:fingerprints};
}
export async function runTransferMaximizationReport({base=root,check=false,failOnImprovement=false,nodeBudget=DEFAULT_NODE_BUDGET}={}){
 const report=buildTransferMaximizationReport({...await readTransferMaximizationInputs(base),nodeBudget}),bytes=JSON.stringify(report)+'\n',path=resolve(base,reportPath);
 if(check)assert.equal(await readFile(path,'utf8'),bytes,'Transfer-maximization report is stale; run node scripts/build-transfer-maximization-report.mjs.');else await writeFile(path,bytes);
 if(failOnImprovement)assertNoValidatedTransferImprovements(report);
 return {output:reportPath,revision:report.revision,check,...report.summary};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);assert(args.every(arg=>['--check','--fail-on-improvement'].includes(arg)),'Use --check and/or --fail-on-improvement.');
 console.log(JSON.stringify(await runTransferMaximizationReport({check:args.includes('--check'),failOnImprovement:args.includes('--fail-on-improvement')})));
}
