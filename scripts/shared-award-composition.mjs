/** Compile explicitly reviewed, reusable facts into proposed course options.
 * This module does not fetch sources, approve candidates, change academic rules,
 * choose a student's courses, award credit, or publish a degree program. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Planner from '../dist/planner.js';

const list=value=>Array.isArray(value)?value:[],copy=value=>JSON.parse(JSON.stringify(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value),positive=value=>finite(value)&&value>0;
const id=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=240;
const unique=values=>[...new Set(values)];
const sameCode=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.trim().toUpperCase().replace(/\s+/g,'')===b.trim().toUpperCase().replace(/\s+/g,'');
const level=value=>({bachelor:'bachelor',bachelors:'bachelor',associate:'associate',associates:'associate',master:'master',masters:'master',doctorate:'doctorate',doctoral:'doctorate',specialist:'specialist'})[String(value||'').toLowerCase().replace(/[^a-z]/g,'')];
const modality=value=>/^online$/i.test(value||'')?'online':/^(residential|campus|on campus)$/i.test(value||'')?'campus':null;
const catalog=value=>String(value||'').replace(/[–—]/g,'-');
const date=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const roles=source=>list(source?.roles);
const sourceSchool=source=>source?.scope?.schoolName||source?.scope?.school||source?.school;
const hash=value=>'shared-option-'+createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const identityFields=['provider','code','title','providerCourseCode','codeAliases','aceId','courseVersion','sourceCredits','sourceCreditSystem','sourceUpper','sourceCreditBasis','sourceCreditEvidence','providerCourseUrl','providerCoursePassingPercent','providerCoursePassingSourceIds','sourceCreditVerification','recommendationStart','recommendationEnd','recommendationPeriodSourceIds','identitySourceIds','listingIdentityIds','listingIdentitySourceIds','codeAliasEvidence','eligibilityReview','providerRetirementMonth','providerRetirementSourceIds','sourceType','creditOrigin','conditions'];
function refs(ids,sources,test,message){assert(Array.isArray(ids)&&ids.length>0&&unique(ids).length===ids.length&&ids.every(value=>id(value)&&sources.has(value)&&test(sources.get(value))),message);}
function safeURL(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
function sourceDate(source){return source.checkedOn||source.checked;}
function reviewedSource(source,asOf){
 assert(id(source?.id)&&safeURL(source.url),'A shared source needs an ID and public HTTPS URL.');
 assert(date(sourceDate(source))&&sourceDate(source)<=asOf,'A shared source needs a real, non-future review date.');
 assert(/^sha256:[a-f0-9]{64}$/.test(source.sourceContentHash||'')||/^[a-f0-9]{64}$/.test(source.sha256||''),'A shared source needs its captured body hash.');
 assert(['university','provider','accreditor','ace'].includes(source.kind)&&Array.isArray(source.roles)&&source.roles.length,'A shared source needs an explicit authority and evidence role.');
}
const institutionEvidence=(source,scope,acceptedRoles)=>{
 const declared=source?.scope,levels=list(declared?.levels).length?declared.levels:[declared?.level];
 return source.kind==='university'&&sourceSchool(source)===scope.school&&roles(source).some(role=>acceptedRoles.includes(role))&&declared&&catalog(declared.catalogYear||declared.catalog)===catalog(scope.catalog)&&declared.modality===scope.modality&&levels.includes(scope.level);
};

export function validateSharedAwardBundle(bundle,{asOf=bundle?.checkedOn}={}){
 assert(bundle?.version===1&&id(bundle.id)&&bundle.reviewStatus==='approved'&&date(bundle.checkedOn)&&date(asOf)&&bundle.checkedOn<=asOf,'Only an explicitly approved, dated shared-award bundle can be composed.');
 for(const key of ['sources','providerCourses','awards','placementRules'])assert(Array.isArray(bundle[key]),'A shared bundle needs '+key+'.');
 const sources=new Map(),courses=new Map(),awards=new Map(),rules=new Set();
 for(const source of bundle.sources){reviewedSource(source,asOf);assert(!sources.has(source.id),'Duplicate shared source ID.');sources.set(source.id,source);}
 for(const course of bundle.providerCourses){
  assert(id(course?.id)&&!courses.has(course.id)&&id(course.provider)&&course.provider!=='University'&&id(course.code)&&id(course.title)&&['string','number'].includes(typeof course.courseVersion)&&String(course.courseVersion).length>0,'A provider course needs one exact versioned identity.');
  assert(positive(course.sourceCredits)&&['semester','quarter','competency-unit'].includes(course.sourceCreditSystem),'Original source quantities and units must be independently known.');
  assert(date(course.recommendationStart)&&date(course.recommendationEnd)&&course.recommendationStart<=course.recommendationEnd,'Keep the actual recommendation period.');
  refs(course.identitySourceIds,sources,source=>['provider','accreditor','ace'].includes(source.kind)&&roles(source).includes('provider-identity'),'A provider identity needs independent provider or accreditor evidence.');
  if(course.recommendationPeriodSourceIds)refs(course.recommendationPeriodSourceIds,sources,source=>['provider','accreditor','ace'].includes(source.kind)&&roles(source).includes('provider-identity'),'Recommendation dates need independent source evidence.');
  for(const key of ['sourceCreditEvidence','sourceCreditVerification'])if(course[key]){refs(course[key].sourceIds,sources,source=>['provider','accreditor','ace'].includes(source.kind)&&roles(source).includes('provider-identity'),'Optional provider evidence must retain independent resolved sources.');if(course[key].credits!==undefined)assert(course[key].credits===course.sourceCredits,'Provider quantity evidence conflicts with the canonical source quantity.');if(course[key].creditSystem!==undefined)assert(course[key].creditSystem===course.sourceCreditSystem,'Provider unit evidence conflicts with the canonical source unit.');}
  if(course.eligibilityReview){assert(course.eligibilityReview.eligibleToStart===true&&!['not-eligible','needs-independent-provider-review'].includes(course.eligibilityReview.status),'An unresolved eligibility decision cannot be inherited.');if(course.eligibilityReview.sourceIds)refs(course.eligibilityReview.sourceIds,sources,()=>true,'Eligibility evidence must resolve.');}
  assert(course.receivingCode===undefined&&course.credits===undefined,'Provider facts cannot contain receiving awards.');
  courses.set(course.id,course);
 }
 for(const award of bundle.awards){
  const scope=award?.scope,course=courses.get(award?.providerCourseId);
  assert(id(award?.id)&&!awards.has(award.id)&&course&&id(award.receivingCode)&&positive(award.credits)&&['semester','quarter','competency-unit'].includes(award.creditSystem)&&typeof award.upper==='boolean'&&award.evidence==='published','A receiving award needs its exact provider identity, published quantity and unit.');
  assert(scope&&id(scope.school)&&id(scope.catalog)&&['online','campus'].includes(scope.modality)&&['associate','bachelor','master','doctorate','specialist'].includes(scope.level),'Receiving awards need school, catalog, modality and degree-level scope.');
  const explicit=Array.isArray(scope.programIds)&&scope.programIds.length>0&&unique(scope.programIds).length===scope.programIds.length&&scope.programIds.every(id);
  const schoolwide=scope.allPrograms===true&&Array.isArray(scope.excludedProgramIds)&&unique(scope.excludedProgramIds).length===scope.excludedProgramIds.length&&scope.excludedProgramIds.every(id);
  assert(explicit!==schoolwide,'Use either explicit program applicability or an expressly reviewed schoolwide scope with exclusions.');
  assert(typeof award.scopeQuote==='string'&&award.scopeQuote.trim().length>=12,'Award applicability needs its reviewed source extract.');
  refs(award.sourceIds,sources,source=>institutionEvidence(source,scope,['receiving-map']),'Receiving awards need the receiving institution’s published course map.');
  refs(award.scopeSourceIds,sources,source=>institutionEvidence(source,scope,['receiving-map','policy']),'Shared applicability needs receiving-school scope evidence.');
  const identityURLs=new Set(course.identitySourceIds.map(id=>sources.get(id).url));
  assert(award.sourceIds.every(value=>!course.identitySourceIds.includes(value)&&!identityURLs.has(sources.get(value).url)),'Provider quantities and receiving awards need independent evidence.');
  awards.set(award.id,award);
 }
 for(const rule of bundle.placementRules){
  assert(id(rule?.id)&&!rules.has(rule.id)&&['exact','free-elective'].includes(rule.kind)&&Array.isArray(rule.modelIds)&&rule.modelIds.length>0&&unique(rule.modelIds).length===rule.modelIds.length&&rule.modelIds.every(id),'Placement rules need explicit models and one placement kind.');rules.add(rule.id);
  assert(Array.isArray(rule.sourceIds)&&rule.sourceIds.length>0&&unique(rule.sourceIds).length===rule.sourceIds.length&&rule.sourceIds.every(id),'Placement rules need source evidence.');
  for(const field of ['requirementIds','awardIds'])if(rule[field]!==undefined)assert(Array.isArray(rule[field])&&rule[field].length>0&&unique(rule[field]).length===rule[field].length&&rule[field].every(id),field+' must be a nonempty exact ID list.');
  if(rule.awardIds)assert(rule.awardIds.every(id=>awards.has(id)),'A placement rule names an unknown award.');
 }
 return {sources,courses,awards,asOf};
}
function modelAllows(model,award){
 const scope=award.scope;
 return model.school===scope.school&&catalog(model.catalogYear||model.catalog)===catalog(scope.catalog)&&modality(model.format)===scope.modality&&level(model.level)===scope.level&&model.creditSystem===award.creditSystem&&(scope.programIds?scope.programIds.includes(model.id):!scope.excludedProgramIds.includes(model.id));
}
function validModelPolicies(model){
 for(const field of ['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorMinInstitutionCredits','majorResidencyBasisCredits'])if(model[field]!==undefined&&(!finite(model[field])||model[field]<0||model[field]>model.totalCredits))return false;
 if(model.residencyPolicy&&Planner.institutionResidencyMinimum(model)===null)return false;
 if(model.majorInstitutionFraction!==undefined&&(!finite(model.majorInstitutionFraction)||model.majorInstitutionFraction<0||model.majorInstitutionFraction>1||!positive(model.majorResidencyBasisCredits)))return false;
 return true;
}
function rowAllows(row,award,kind,fixed){
 if(row.institutionalOnly||row.researchGap||row.credits!==award.credits||!positive(row.credits))return false;
 const named=[row.code,...list(row.allowedCourseCodes)].filter(value=>typeof value==='string'&&value.trim());
 if(kind==='exact'){if(!named.some(code=>sameCode(code,award.receivingCode)))return false;}
 else {
  if(row.freeElective!==true||row.category!=='electives'||row.categoryAllowed===false||row.majorElective===true||row.inMajor===true||fixed.some(code=>sameCode(code,award.receivingCode)))return false;
  // A flexible label does not prove that additional distribution, laboratory,
  // writing, accreditation or origin requirements are met. These need a typed
  // placement rule before this v1 unrestricted-elective pool can serve them.
  const unsupported=['requiresLab','writingIntensive','requiresWritingIntensive','writingIntensiveRequired','liberalArtsOnly','liberalArtsAllocation','requiredAccreditation','requiredCreditOrigin','allowedCreditOrigins','requiredProviderTypes','minimumSourceCredits','minimumSourceCourseCredits','requiredCourseAttributes','courseAttributeRequirements','excludedCourseCodes','excludedCoursePrefixes','excludedProviders'];
  if(unsupported.some(key=>row[key]!==undefined&&row[key]!==null&&row[key]!==false&&(!Array.isArray(row[key])||row[key].length>0)))return false;
  if(named.length&&!named.some(code=>sameCode(code,award.receivingCode)))return false;
 }
 const match=award.receivingCode.match(/^([A-Za-z]+)\s*[- ]?\s*(\d{3,4}|[1-4]XX)$/),prefix=match?.[1],courseLevel=match?Number(match[2].replace('XX','00')):null;
 const prefixes=unique([...list(row.allowedCoursePrefixes),...list(row.allowedPrefixes)]);
 if(prefixes.length&&(!prefix||!prefixes.some(value=>sameCode(value,prefix))))return false;
 const minimum=row.minCourseLevel??row.minimumCourseLevel,maximum=row.maxCourseLevel??row.maximumCourseLevel;
 if(minimum!==undefined&&(!finite(minimum)||courseLevel===null||courseLevel<minimum)||maximum!==undefined&&(!finite(maximum)||courseLevel===null||courseLevel>maximum))return false;
 if((row.upperOnly||row.upper)&&!award.upper)return false;
 return true;
}
function sourceBindings(ids,sources,model){return ids.length>0&&ids.every(id=>{const source=sources.get(id);return source&&safeURL(source.url)&&source.kind!=='provider'&&source.kind!=='accreditor'&&source.kind!=='ace'&&(!sourceSchool(source)||sourceSchool(source)===model.school);});}
function sameOption(option,course,award,row){return option.provider===course.provider&&sameCode(option.code,course.code)&&sameCode(option.receivingCode||row.code,award.receivingCode)&&option.credits===award.credits&&(!option.creditSystem||option.creditSystem===award.creditSystem);}
function conflictingIdentity(option,course){
 return option.courseVersion!==undefined&&String(option.courseVersion)!==String(course.courseVersion)||option.sourceCredits!==undefined&&option.sourceCredits!==course.sourceCredits||option.sourceCreditSystem!==undefined&&option.sourceCreditSystem!==course.sourceCreditSystem||option.recommendationStart!==undefined&&option.recommendationStart!==course.recommendationStart||option.recommendationEnd!==undefined&&option.recommendationEnd!==course.recommendationEnd||option.eligibilityReview?.eligibleToStart===false||Boolean(option.bundleId)||option.selectionRequired===true;
}
function optionFrom(course,award,row,model,bundle,rule,prior){
 const value=Object.fromEntries(identityFields.filter(key=>course[key]!==undefined).map(key=>[key,copy(course[key])])),ids=unique([...award.sourceIds,...row.sourceIds,...rule.sourceIds,...award.scopeSourceIds]);
 return {...copy(prior||{}),...value,id:prior?.id||hash([bundle.id,model.id,row.id,award.id]),credits:award.credits,creditSystem:award.creditSystem,receivingCode:award.receivingCode,receivingTitle:award.receivingTitle||award.receivingCode,upper:award.upper,creditOrigin:course.creditOrigin||'alternative',sourceType:course.sourceType||'alternative',evidence:'published',evidenceType:'official-receiving-school-equivalency',sourceIds:ids,identitySourceIds:[...course.identitySourceIds],sourceCreditStatus:'verified-current-provider-and-ace',sourceCreditEvidence:course.sourceCreditEvidence||{status:'reviewed',sourceIds:[...course.identitySourceIds],checkedOn:bundle.checkedOn,courseVersion:course.courseVersion},sourceCreditVerification:course.sourceCreditVerification||{credits:course.sourceCredits,creditSystem:course.sourceCreditSystem,sourceIds:[...course.identitySourceIds]},recommendationPeriodSourceIds:course.recommendationPeriodSourceIds||[...course.identitySourceIds],url:course.url||course.providerCourseUrl,courseUrl:course.url||course.providerCourseUrl,mappingChecked:bundle.checkedOn,mappingReviewId:bundle.id,mappingResearchClosed:true,receivingMapStatus:'published-shared-reviewed-award',mappingScope:award.scopeQuote,degreePlacementEvidence:{modelId:model.id,catalogYear:catalog(model.catalogYear||model.catalog),modality:modality(model.format),requirementId:row.id,receivingCode:award.receivingCode,credits:row.credits,creditSystem:model.creditSystem,placementType:rule.kind==='exact'?'exact-named-requirement':'free-elective',sourceIds:unique([...row.sourceIds,...rule.sourceIds])},...(rule.kind==='free-elective'?{placementType:'elective',categoryPlacementReviewed:true,categoryPlacementReviewId:bundle.id}:{}),sharedAwardProvenance:{bundleId:bundle.id,providerCourseId:course.id,awardId:award.id,placementRuleId:rule.id,checkedOn:bundle.checkedOn},conditions:unique([...list(prior?.conditions),...list(course.conditions),...list(award.conditions),...(row.minimumGrade?['This degree requirement requires '+row.minimumGrade+' or higher; the university’s treatment of pass grades remains applicable.']:[]),'The university evaluates original records, minimum grades and duplicate learning separately; this proposed option creates no student credit award.'])};
}

/** Pure composition. Academic limits and all original requirement quantities remain unchanged. */
export function composeSharedAwards(input,bundle,{asOf=bundle?.checkedOn}={}){
 assert(Array.isArray(input)&&new Set(input.map(model=>model.id)).size===input.length,'Compose a unique list of compiled models.');
 const {sources:sharedSources,courses,awards}=validateSharedAwardBundle(bundle,{asOf}),models=copy(input);
 const report={schemaVersion:1,bundleId:bundle.id,asOf,modelsConsidered:models.length,modelsChanged:0,addedOptions:0,updatedOptions:0,retainedPublishedOptions:0,held:[],applications:[],studentCreditsAwarded:0,publicationDecisionsMade:0};
 for(const model of models){
  const rules=bundle.placementRules.filter(rule=>rule.modelIds.includes(model.id));if(!rules.length||![...awards.values()].some(award=>modelAllows(model,award)))continue;
  if(model.auditProvenance?.status==='student-provided'){report.held.push({modelId:model.id,reason:'private-model'});continue;}
  if(!positive(model.totalCredits)||!Array.isArray(model.requirements)||model.requirements.reduce((sum,row)=>sum+row.credits,0)!==model.totalCredits||!validModelPolicies(model)){report.held.push({modelId:model.id,reason:'invalid-ledger-or-policy'});continue;}
  const sources=new Map(list(model.sources).map(source=>[source.id,source]));
  for(const [id,source]of sharedSources){const prior=sources.get(id);assert(!prior||prior.url===source.url&&(!prior.sha256||prior.sha256===(source.sha256||source.sourceContentHash?.slice(7)))&&(!prior.sourceContentHash||prior.sourceContentHash===(source.sourceContentHash||'sha256:'+source.sha256)),'A shared source ID conflicts with the compiled model.');sources.set(id,source);}
  let changed=false;const used=new Set(),fixed=model.requirements.filter(row=>!row.freeElective).flatMap(row=>[row.code,...list(row.allowedCourseCodes)]).filter(Boolean);
  for(const rule of rules){
   assert(sourceBindings(rule.sourceIds,sources,model),'A placement rule needs receiving-school curriculum or policy evidence for its exact model.');
   for(const row of model.requirements){
    if(rule.requirementIds&&!rule.requirementIds.includes(row.id))continue;
    if(!sourceBindings(list(row.sourceIds),sources,model))continue;
    for(const award of awards.values()){
     if(rule.awardIds&&!rule.awardIds.includes(award.id)||!modelAllows(model,award)||!rowAllows(row,award,rule.kind,fixed))continue;
     const course=courses.get(award.providerCourseId);
     if(course.recommendationStart>asOf||course.recommendationEnd<asOf){report.held.push({modelId:model.id,requirementId:row.id,awardId:award.id,reason:'inactive-provider-version'});continue;}
     row.options=list(row.options);const matches=row.options.filter(option=>sameOption(option,course,award,row));
     if(matches.some(prior=>conflictingIdentity(prior,course)||prior.upper!==undefined&&prior.upper!==award.upper)){report.held.push({modelId:model.id,requirementId:row.id,awardId:award.id,reason:'conflicting-existing-provider-fact'});continue;}
     // Multiple old IDs may name the same exact course/award. Keep every ID and
     // option, reconcile each only when every existing identity is compatible.
     // This preserves saved selections without treating aliases as new credit.
     for(const prior of matches.length?matches:[undefined]){
      const option=optionFrom(course,award,row,model,bundle,rule,prior);
      if(prior&&JSON.stringify(prior)===JSON.stringify(option))continue;
      if(prior){row.options[row.options.indexOf(prior)]=option;report.updatedOptions++;if(prior.evidence==='published')report.retainedPublishedOptions++;}else{assert(!row.options.some(value=>value.id===option.id),'Generated option ID collides.');row.options.push(option);report.addedOptions++;}
      if(row.selectionRequired===true)row.selectionRequired=false;
      for(const id of [...option.sourceIds,...option.identitySourceIds,...option.recommendationPeriodSourceIds,...list(course.sourceCreditEvidence?.sourceIds),...list(course.sourceCreditVerification?.sourceIds),...list(course.eligibilityReview?.sourceIds)])used.add(id);
      changed=true;report.applications.push({modelId:model.id,requirementId:row.id,providerCourseId:course.id,awardId:award.id,optionId:option.id,placement:rule.kind});
     }
    }
   }
  }
  if(changed){const originals=new Set(list(model.sources).map(source=>source.id));model.sources=[...sources.values()].filter(source=>originals.has(source.id)||used.has(source.id)).map(copy);report.modelsChanged++;}
 }
 return {models,report};
}
