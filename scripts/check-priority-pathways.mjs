/* Actual-solver acceptance for priority schools. Never edits curriculum or student state. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Catalog=require('../dist/program-catalog.js'),Journey=require('../dist/journey-engine.js'),Planner=require('../dist/planner.js');
const root=resolve(import.meta.dirname,'..'),list=value=>Array.isArray(value)?value:[],finite=value=>typeof value==='number'&&Number.isFinite(value),near=(a,b)=>Math.abs(a-b)<0.001;
export const priorityCandidates=Object.freeze([
  {school:'Liberty University',routeId:'liberty-business-residential'},
  {school:'Thomas Edison State University',routeId:'tesu-general-management'},
  {school:'Western Governors University',routeId:'wgu-catalog-ecceaa488637ac83'},
  {school:'University of Maine at Presque Isle',routeId:'umpi-baba-project-management'}
]);
const https=value=>{try{return new URL(value).protocol==='https:';}catch{return false;}};
const generic=title=>!String(title||'').trim()||/^(?:approved\s+)?(?:free\s+|major\s+|upper.level\s+)?elective(?:\s+\d+)?$/i.test(String(title).trim())||/^(?:choose|select)\b|requirements? still to resolve|course to (?:choose|confirm)/i.test(String(title).trim());
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function inspectDraft(draft,{asOf=new Date().toISOString().slice(0,10)}={}){
  if(!validDay(asOf))throw Error('Use a real acceptance date in YYYY-MM-DD format.');
  const {program,plan}=draft;
  if(!program||!plan)return{status:'directory-only',proposedPlanFullySpecified:false,checks:{hasRequirementLedger:false},issues:[{code:'no-course-model',message:'The program is listed, but its exact requirements and transfer choices have not been loaded.'}],costs:{tuition:null,total:null},timing:{weeks:null}};
  const rows=list(plan.rows),requirements=list(program.requirements),byRequirement=new Map(requirements.map(row=>[row.id,row])),validation=Planner.validate(program,plan),issues=[];
  const accounted=rows.reduce((sum,row)=>sum+(finite(row.credits)?row.credits:0),0),unique=new Set(rows.map(row=>row.requirementId)).size===rows.length&&rows.length===requirements.length&&rows.every(row=>byRequirement.has(row.requirementId));
  const ledger=unique&&finite(program.totalCredits)&&near(accounted,program.totalCredits);
  if(!ledger)issues.push({code:'requirement-ledger',message:'Every degree requirement must appear exactly once and sum to the actual degree total.'});
  if(!validation.academicCountsValid||!plan.validation?.academicCountsValid)issues.push({code:'academic-rules',message:'Transfer caps, residency, level, duplicate-award or requirement allocation rules do not pass the solver validation.'});
  const open=rows.filter(row=>row.credits>0&&(!row.option||row.selectionRequired||row.option.selectionRequired||generic(row.option.title)));
  if(open.length)issues.push({code:'course-choices',message:'Select an actual approved course for each remaining open requirement.',requirementIds:open.map(row=>row.requirementId)});
  const sources=new Map(list(program.sources).map(source=>[source.id,source])),outside=rows.filter(row=>row.option&&row.option.provider!=='University'),unbound=outside.filter(row=>!['published','conditional'].includes(row.option.evidence)||!list(row.option.sourceIds).length||row.option.sourceIds.some(id=>!https(sources.get(id)?.url)));
  if(unbound.length)issues.push({code:'transfer-sources',message:'Each proposed outside course must carry its original usable evidence source.',requirementIds:unbound.map(row=>row.requirementId)});
  const unknownPolicies=list(program.policyReview).filter(rule=>['unverified','unknown','needs-review'].includes(rule.status));
  const policySourceIds=[...new Set([...list(program.policySourceIds),...list(program.residencyPolicy?.sourceIds),...Object.values(program.policyEvidence||{}).flatMap(rule=>list(rule?.sourceIds))])];
  const stalePolicySources=[],undatedPolicySources=[],unboundPolicySources=[];
  for(const id of policySourceIds){const source=sources.get(id),checked=source?.checked||source?.checkedOn||source?.checkedAt;if(!source||!https(source.url))unboundPolicySources.push(id);else if(!validDay(checked))undatedPolicySources.push(id);else if(Date.parse(asOf)-Date.parse(checked)>=30*86400000||Date.parse(checked)>Date.parse(asOf))stalePolicySources.push(id);}
  const freshPolicies=!stalePolicySources.length&&!undatedPolicySources.length&&!unboundPolicySources.length;
  if(!freshPolicies)issues.push({code:'policy-review-due',message:'Recheck the explicit policy evidence before treating its residency and transfer calculation as current.',sourceIds:[...stalePolicySources,...undatedPolicySources,...unboundPolicySources]});
  const fractionalRule=program.residencyPolicy?.type==='institution-fraction-with-capstone-exclusion',institutionBound=Planner.institutionResidencyMinimum(program),institutionKnown=finite(program.institutionMinCredits)||fractionalRule&&finite(institutionBound)&&list(program.residencyPolicy.sourceIds).length>0&&program.residencyPolicy.sourceIds.every(id=>https(sources.get(id)?.url));
  // A documented overall cap also bounds alternative credit when the school
  // has no separate source-type cap; absence of a second cap is not rejection.
  const policyKnown=validation.policyChecksComplete===true&&plan.validation?.policyChecksComplete===true&&institutionKnown&&(finite(program.externalMaxCredits)||institutionKnown)&&(!outside.length||finite(program.alternativeMaxCredits)||finite(program.externalMaxCredits));
  if(!policyKnown)issues.push({code:'credit-policies',message:'Resolve degree-specific transfer, institutional residency and level policies.',fields:unknownPolicies.map(rule=>rule.field)});
  const cost=plan.costs||{},timing=plan.timing||{};
  const truthfulCosts=cost.costComplete===true?finite(cost.total)&&cost.total>=0:cost.total===null;
  const universityUnknown=cost.universityCredits>0&&!(draft.input?.universityRate>0)&&!finite(cost.universitySubscriptionTerms);
  if(!truthfulCosts||universityUnknown&&cost.universityTuition!==null)issues.push({code:'cost-uncertainty',message:'Unknown tuition or fees must remain unknown instead of becoming a zero or complete price.'});
  const truthfulTiming=timing.scenarioWeeks===null||finite(timing.scenarioWeeks)&&timing.scenarioWeeks>=0&&(timing.verified===true||list(timing.assumptions).length>0);
  if(!truthfulTiming)issues.push({code:'timing-uncertainty',message:'Completion estimates need declared assumptions; missing timing must remain unknown.'});
  const checks={hasRequirementLedger:ledger,academicCreditRules:validation.academicCountsValid&&plan.validation?.academicCountsValid,namedCourseChoices:open.length===0,sourceBoundOutsideCourses:unbound.length===0,knownCreditPolicies:policyKnown,freshExplicitPolicySources:freshPolicies,truthfulCostUncertainty:truthfulCosts&&(!universityUnknown||cost.universityTuition===null),truthfulTimingUncertainty:truthfulTiming};
  const fullySpecified=Object.values(checks).every(Boolean),conditional=outside.filter(row=>row.option.evidence==='conditional'),published=outside.filter(row=>row.option.evidence==='published'),sum=rows=>rows.reduce((value,row)=>value+row.credits,0);
  const verifiedAdditionalCapstone=fractionalRule&&program.residencyPolicy.interpretationStatus==='verified-additional-capstone'&&finite(institutionBound);
  const limits={institutionMinCredits:program.institutionMinCredits??null,derivedInstitutionMinimum:verifiedAdditionalCapstone?institutionBound:null,conservativeInstitutionSufficientBound:fractionalRule&&!verifiedAdditionalCapstone?institutionBound:null,residencyInterpretationStatus:fractionalRule?program.residencyPolicy.interpretationStatus||'exact-floor-unresolved':null,residencyCalculationBasis:verifiedAdditionalCapstone?'Derived from the source-verified institutional fraction in addition to the required capstone. The calculated result is not a separately quoted numeric minimum.':fractionalRule?'Source-bound sufficient condition with the capstone excluded; the published exact floor remains unresolved.':'Published absolute institutional minimum',residencyAndOverallPolicyCeiling:verifiedAdditionalCapstone?Math.min(finite(program.externalMaxCredits)?program.externalMaxCredits:Infinity,program.totalCredits-institutionBound):null,externalMaxCredits:program.externalMaxCredits??null,alternativeMaxCredits:program.alternativeMaxCredits??null,upperMinCredits:program.upperMinCredits??null};
  const selectedOutsideMappings=outside.map(row=>({requirementId:row.requirementId,provider:row.option.provider,courseCode:row.option.code||row.option.providerCourseCode||null,title:row.option.title,receivingCredits:row.credits,receivingCreditSystem:program.creditSystem||null,sourceCredits:row.option.sourceCredits??null,sourceCreditSystem:row.option.sourceCreditSystem||null,evidence:row.option.evidence,sourceIds:list(row.option.sourceIds),sources:list(row.option.sourceIds).map(id=>{const source=sources.get(id);return{id,url:source?.url||null,checked:source?.checked||source?.checkedOn||source?.checkedAt||null,evidenceType:source?.evidenceType||null};})}));
  return{status:fullySpecified?'fully-specified-proposed-plan':open.length?'needs-course-choices':!policyKnown||!freshPolicies?'needs-policy-review':'needs-research',proposedPlanFullySpecified:fullySpecified,checks,issues,degreeCredits:program.totalCredits,creditSystem:program.creditSystem||null,catalog:program.catalog||null,requirementCount:requirements.length,accountedCredits:accounted,proposedOutsideCredits:plan.totals.external,proposedAlternativeCredits:plan.totals.alternative,selectedPublishedOutsideCredits:sum(published),selectedConditionalOutsideCredits:sum(conditional),selectedOutsideMappings,evidenceScope:'Published and conditional describe the selected mapping evidence. Source links do not establish individual receiving-school approval, current catalog applicability or awarded credit.',universityCredits:plan.totals.institutional,upperCredits:plan.totals.upper,majorUniversityCredits:plan.totals.majorInstitutional,limits,policySourceFreshness:{sourceIds:policySourceIds,staleSourceIds:stalePolicySources,undatedSourceIds:undatedPolicySources,unboundSourceIds:unboundPolicySources},openCourseChoices:open.map(row=>({requirementId:row.requirementId,title:row.option?.title||byRequirement.get(row.requirementId)?.title||'',provider:row.option?.provider||null})),conditionalCourseChoices:conditional.map(row=>row.requirementId),schoolConfirmationRequired:true,sourceUrls:[...new Set(outside.flatMap(row=>list(row.option.sourceIds).map(id=>sources.get(id)?.url)).filter(Boolean))],costs:{tuition:cost.universityTuition??null,knownSubtotal:cost.knownSubtotal??null,total:cost.total??null,complete:cost.costComplete===true,missing:list(cost.missing)},timing:{weeks:timing.scenarioWeeks??null,verified:timing.verified===true,assumptions:list(timing.assumptions),missing:list(timing.missing)}};
}
export async function inspectPriorityPathways({asOf=new Date().toISOString().slice(0,10),candidates=priorityCandidates}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw Error('Use a real acceptance date in YYYY-MM-DD format.');
  const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8')),registry=await read('dist/data/curriculum-registry.json'),catalog=Catalog.attachRegistry(Catalog.merge(await read('dist/data/pathways.json'),await read('dist/data/program-catalog.json')),registry),models=[];
  for(const file of new Set(registry.models.map(entry=>entry.path))){const pack=await read('dist/'+file);models.push(...(pack.models||[pack]));}
  const results=[];
  for(const candidate of candidates){
    const route=catalog.pathways.find(route=>route.id===candidate.routeId);if(!route)throw Error('Priority acceptance route is missing: '+candidate.routeId);
    if(route.school!==candidate.school)throw Error('Priority acceptance route belongs to another school: '+candidate.routeId);
    let state=Journey.selectRoute(Journey.initialize(null,null,catalog),route,catalog);state.profile.modality=route.modalities?.length===1?route.modalities[0]:'any';state.profile.classroomImportance='open';
    const before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,models);if(JSON.stringify(state)!==before)throw Error('Solver changed the original private state for '+candidate.routeId);
    results.push({school:candidate.school,routeId:route.id,modelId:draft.program?.id||null,title:route.title,...inspectDraft(draft,{asOf})});
  }
  return{version:1,asOf,scope:'A fully specified proposed plan is not university approval or an awarded degree. These checks distinguish a usable course route from a directory listing.',summary:{schools:results.length,fullySpecifiedProposedPlans:results.filter(row=>row.proposedPlanFullySpecified).length,directoryOnly:results.filter(row=>row.status==='directory-only').length,schoolApprovedPlans:0},pathways:results};
}
async function main(){
  const args=process.argv.slice(2);for(let i=0;i<args.length;i++){if(args[i]==='--as-of'){if(!args[++i])throw Error('Add the acceptance date after --as-of.');}else if(!['--write','--require-complete'].includes(args[i]))throw Error('Unknown argument: '+args[i]);}
  const report=await inspectPriorityPathways({...(args.includes('--as-of')?{asOf:args[args.indexOf('--as-of')+1]}:{})});
  if(args.includes('--write')){await mkdir(resolve(root,'content/reviews'),{recursive:true});await writeFile(resolve(root,'content/reviews/priority-pathway-acceptance-'+report.asOf+'.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({asOf:report.asOf,...report.summary,pathways:report.pathways.map(row=>({school:row.school,routeId:row.routeId,status:row.status,credits:row.degreeCredits??null,outsideCredits:row.proposedOutsideCredits??null,universityCredits:row.universityCredits??null,issues:row.issues.map(issue=>issue.code)}))}));
  if(args.includes('--require-complete')&&report.summary.fullySpecifiedProposedPlans!==report.summary.schools)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
