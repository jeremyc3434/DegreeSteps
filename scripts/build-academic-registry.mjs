/* Public academic claims, independent of a student's record or optimization run.
 * Source linkage is provenance, not an assertion that a page proves a claim. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {classifyModelFindings} from './pathway-quality.mjs';

const root=resolve(import.meta.dirname,'..');
export const academicRegistryPath='dist/data/academic-registry.json';
const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values.filter(value=>value!==undefined&&value!==null&&value!==''))].sort();
const clone=value=>JSON.parse(JSON.stringify(value));
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,clone(value[key])]));
const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const sorted=values=>values.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
export function canonicalJSON(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(value[key])).join(',')+'}';
}
export const metadataDigest=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const digestID=hex=>Buffer.from(hex,'hex').subarray(0,16).toString('base64url');
const id=(kind,value)=>kind+'-'+digestID(metadataDigest(value));
function assert(value,message){if(!value)throw new Error(message);}
function assertDate(value){const stamp=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00Z'):NaN;assert(Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value,'A real asOf date in YYYY-MM-DD format is required.');}
function sourceNames(value){
 const names=[];
 const visit=(item)=>{if(!item||typeof item!=='object')return;for(const [key,child] of Object.entries(item)){if(/sourceIds$/i.test(key))names.push(...list(child).filter(value=>typeof value==='string'));else if(/sourceId$/i.test(key)&&typeof child==='string')names.push(child);else if(child&&typeof child==='object')visit(child);}};
 visit(value);return unique(names);
}
function withoutSourceNames(value){
 if(Array.isArray(value))return value.map(withoutSourceNames);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!/sourceIds?$/i.test(key)).map(([key,child])=>[key,withoutSourceNames(child)]));
}
function publicMetadata(source){
 // Only compiled public bibliographic fields. Do not serialize private profiles,
 // credentials, or arbitrary caller objects into the research artifact.
 return pick(source,['url','title','kind','role','roles','scope','provider','programId','modality','catalog','catalogTerm','courseCodes','sections','sourcePage','sourcePages','checked','checkedOn','observed','published','lastUpdated','guideUpdated','modifiedDate','pageLastEdited','revisionId','publicRecordId','publicRecordVersion','agreementId','agreementRecordVersion','approvalStatus','evidenceType','inactiveProgram','retrieval','verification','notes','navigationUrl','sha256','sourceHtmlSha256']);
}
const policyFields=['degreeCreditBalancePolicy','generalEducationMinimums','writingIntensiveRule','totalCredits','minimumDegreeCredits','publishedCreditRange','institutionMinCredits','externalMaxCredits','externalMaxScope','alternativeMaxCredits','upperMinCredits','majorMinInstitutionCredits','majorInstitutionFraction','majorResidencyBasisCredits','upperGroupMinimums','upperGroups','residencyPolicy','publishedResidencyOptions','transferRules','gradePolicy','transferGradePolicy','existingCreditReview','courseCreditExclusions','liberalArtsAllocation','creditConversions','graduationRequirements','univ104Scenario','transferWaiverVariant','overlaps','obligations','paceModel','pacePolicy','pacing','assessmentPlanningScenario'];
const priceFields=['pricing','tuitionComparison','publishedTuitionSchedule','publishedFees','publishedAcceleratedTiming','pricingNotes','financialAid'];
const identityKeys=['provider','providerId','code','codeType','title','aceId','providerCourseCode','courseVersion','version','recommendation','recommendationStart','recommendationEnd','providerCourseEffectiveDates','sourceCredits','sourceCreditSystem','sourceCreditStatus','sourceCreditBasis','sourceCreditVerification','sourceCreditEvidence','providerListedCreditQuantity','providerListedCreditUnit','providerCourseUrl','courseUrl','codeAliases','codeAliasEvidence','identitySourceIds','listingIdentityIds','listingIdentitySourceIds','sourceRevisionId','recommendationPeriodSourceIds','providerCoursePassingPercent','providerCoursePassingSourceIds','studyMethods','assessmentFormat','proctoringRequired','providerPacePolicy'];
const awardKeys=['cost','costEvidence','categoryPlacementReviewed','categoryPlacementReviewId','provider','code','title','receivingCode','reportedReceivingCode','receivingTitle','receivingCategory','credits','creditSystem','upper','sourceUpper','sourceType','creditOrigin','evidence','evidenceOrigin','evidenceType','sourceIds','conditions','mappingScope','mappingEvidence','degreePlacementEvidence','deliveryEvidence','universityMapRecord','receivingMapStatus','mappingResearchClosed','mappingChecked','mappingReviewId','eligibilityReview','issuerReview','minScore','minimumTransferGrade','minimumTransferGradeSourceIds','preapprovalRequired','expiresOn','modalities','degreeLevels','bundleId','bundleCredits','calculatorAwardRange','calculatorInstitutionCode','crossListedReceivingCodes','fulfillsCode','sourcePage','sourcePages','url','guideUpdated','courseChoiceCheckedOn','courseChoiceReviewId','costStatus','costVerified','paceStatus','effortHours'];
const requirementKeys=['degreeCreditBalance','nativeRequirementCredits','id','code','title','publishedRequirementTitle','credits','category','categoryLabel','group','subgroup','curriculumBlock','sourceIds','upper','upperOnly','institutionalOnly','researchGap','allowedCourseCodes','allowedCoursePrefixes','allowedPrefixes','allowedCreditsRange','allowedReceivingCodeExceptions','minCourseLevel','maxCourseLevel','minimumCourseLevel','maximumCourseLevel','minimumCompletedCredits','minimumGrade','minimumGradeWhenUpper','minimumGradeSourceIds','prerequisites','prerequisiteNotes','prerequisitePolicy','prerequisiteSourceIds','selectionRequired','freeElective','requiresLab','bucket','businessArea','allocationBasis','allocationGroup','allocationGroupCredits','allocationOf','allocationSlot','allocationType','alsoSatisfies','satisfiesCategories','excludeAlreadyUsed','categoryAllowed','choiceFor','choiceNote','choiceSelection','proposedSelection','featuredCourseCode','possibleWaiver','transferEligibility','transferRecencyYears','liberalArtsAllocation','gradePolicyNote','notes','conditions'];

/** The revision identifies academic input facts. Date-sensitive findings are a
 * report over that revision, so changing asOf never fabricates a source change. */
function core(registry){
 return {...Object.fromEntries(['schemaVersion','institutions','sources','sourceReferences','requirements','facts','dependencies','reuseGroups'].map(key=>[key,registry[key]])),programs:registry.programs.map(program=>omit(program,['findingIds','quality']))};
}
function fingerprint(fact,sourcesById){
 return metadataDigest({kind:fact.kind,scope:fact.scope,facts:fact.facts,declaredEvidence:fact.declaredEvidence,sourceMetadata:fact.sourceIds.map(sourceId=>sourcesById.get(sourceId)?.metadata),missingLocalSourceIds:fact.sourceBinding.missingLocalSourceIds});
}

/** Pure, deterministic and conservative. No fetching, solver, clock, student
 * data or implicit transfer-award promotion occurs in this function. */
export function buildAcademicRegistry({models,entries=[],asOf,qualityByModel}={}){
 assertDate(asOf);assert(Array.isArray(models),'models must be an array.');
 const entryMap=new Map(entries.map(entry=>[entry.id,entry]));
 const sourceMap=new Map(),referenceMap=new Map(),programMap=new Map(),institutionMap=new Map(),factMap=new Map(),requirementMap=new Map(),edgeMap=new Map(),findingMap=new Map(),reuseMap=new Map();
 const ordered=sorted([...models]);
 assert(new Set(ordered.map(model=>model.id)).size===ordered.length,'Duplicate model IDs are not allowed.');
 const edge=(fromId,toId,kind)=>{const value={fromId,toId,kind};edgeMap.set(id('edge',value),{id:id('edge',value),...value});};
 for(const model of ordered){
  assert(model&&typeof model.id==='string'&&model.id&&typeof model.school==='string'&&model.school,'Every public model needs an ID and school.');
  assert(model.auditProvenance?.status!=='student-provided','Private student-provided models cannot enter the public registry.');
  const institutionId=id('institution',model.school.trim()),entry=entryMap.get(model.id)||{};
  if(!institutionMap.has(institutionId))institutionMap.set(institutionId,{id:institutionId,name:model.school,programIds:[]});
  institutionMap.get(institutionId).programIds.push(model.id);
  const scope={institutionId,school:model.school,programId:model.id,catalogIdentity:clone(model.catalogIdentity||{kind:model.catalogYear?'catalog-year':'declared-catalog',label:model.catalog||null,year:model.catalogYear??null}),format:model.format??null,level:model.level??null,receivingCreditSystem:model.creditSystem??null};
  const program={id:model.id,institutionId,school:model.school,title:model.title??null,catalogIdentity:scope.catalogIdentity,format:scope.format,level:scope.level,creditSystem:scope.receivingCreditSystem,totalCredits:model.totalCredits??null,readyTemplate:entry.readyTemplate===true,routeIds:unique(list(entry.routeIds)),requirementIds:[],factIds:[],findingIds:[],sourceIds:[]};
  if(qualityByModel){const quality=qualityByModel instanceof Map?qualityByModel.get(model.id):qualityByModel[model.id];if(quality)program.quality=clone(quality);}
  programMap.set(model.id,program);
  const localSources=new Map();
  for(const source of list(model.sources)){
   assert(typeof source?.id==='string'&&source.id,'Source references require model-local IDs.');
   const metadata=publicMetadata(source),digest=metadataDigest(metadata),sourceId='source-'+digestID(digest);
   assert(!localSources.has(source.id),'Duplicate local source ID '+source.id+' in '+model.id+'.');
   localSources.set(source.id,sourceId);
   if(!sourceMap.has(sourceId))sourceMap.set(sourceId,{id:sourceId,url:metadata.url??null,title:metadata.title??null,metadataDigest:digest,sourceContentHash:null,metadata,localReferences:[],programIds:[],dependentFactIds:[]});
   const stored=sourceMap.get(sourceId);stored.localReferences.push({modelId:model.id,localSourceId:source.id});stored.programIds.push(model.id);
  }
  const reference=localSourceId=>{
   const referenceId=id('source-ref',{modelId:model.id,localSourceId});
   if(!referenceMap.has(referenceId))referenceMap.set(referenceId,{id:referenceId,modelId:model.id,localSourceId,sourceId:localSources.get(localSourceId)||null,status:localSources.has(localSourceId)?'resolved':'missing'});
   return referenceMap.get(referenceId);
  };
  // Record even currently unused declared bibliography references so model-local
  // identity is auditable without pretending those pages support every policy.
  for(const localId of localSources.keys())reference(localId);
  const addFact=({kind,identity,facts,sourceIds=[],requirementId,optionId,declaredEvidence=null,factScope=scope,candidate})=>{
   const factId=id('fact',{kind,scope:factScope,identity}),names=unique(sourceIds),refs=names.map(reference),canonicalIds=unique(refs.map(ref=>ref.sourceId)),payload=withoutSourceNames(facts);
   let fact=factMap.get(factId);
   if(!fact){fact={id:factId,kind,scope:clone(factScope),facts:clone(payload),declaredEvidence:clone(declaredEvidence),sourceIds:canonicalIds,sourceReferenceIds:refs.map(ref=>ref.id).sort(),programIds:[],requirementIds:[],optionIds:[],sourceBinding:{bound:names.length>0&&refs.every(ref=>ref.sourceId),missingLocalSourceIds:refs.filter(ref=>!ref.sourceId).map(ref=>ref.localSourceId).sort()},evidenceFingerprint:null};factMap.set(factId,fact);}
   else{
    // A canonical identity may only collapse identical facts/evidence. Different
    // values are separate claims, never last-write-wins.
    assert(canonicalJSON(fact.facts)===canonicalJSON(payload)&&canonicalJSON(fact.declaredEvidence)===canonicalJSON(declaredEvidence),'Conflicting canonical fact identity '+factId+'.');
    fact.sourceIds=unique([...fact.sourceIds,...canonicalIds]);fact.sourceReferenceIds=unique([...fact.sourceReferenceIds,...refs.map(ref=>ref.id)]);fact.sourceBinding.missingLocalSourceIds=unique([...fact.sourceBinding.missingLocalSourceIds,...refs.filter(ref=>!ref.sourceId).map(ref=>ref.localSourceId)]);fact.sourceBinding.bound=fact.sourceBinding.bound&&names.length>0&&refs.every(ref=>ref.sourceId);
   }
   fact.programIds.push(model.id);if(requirementId)fact.requirementIds.push(requirementId);if(optionId)fact.optionIds.push(optionId);program.factIds.push(factId);
   // programIds/factIds and sourceReferenceIds are already explicit adjacency
   // indexes. Store only additional semantic dependencies in the edge table.
   for(const ref of refs)if(ref.sourceId)sourceMap.get(ref.sourceId).dependentFactIds.push(factId);
   if(candidate){const candidateKey=id('reuse',candidate);if(!reuseMap.has(candidateKey))reuseMap.set(candidateKey,{id:candidateKey,candidateKey:metadataDigest(candidate),kind,scope:clone(candidate),status:'candidate-only',factIds:[],affectedProgramIds:[],affectedReadyTemplateIds:[],affectedProgramCount:0});const group=reuseMap.get(candidateKey);group.factIds.push(factId);group.affectedProgramIds.push(model.id);if(program.readyTemplate)group.affectedReadyTemplateIds.push(model.id);}
   return fact;
  };
  for(const field of policyFields){
   if(model[field]===undefined)continue;
   const evidence=model.policyEvidence?.[field]??null;
   const explicitNames=unique([...sourceNames(evidence),...sourceNames(model[field]),...list(model[field+'SourceIds']),...(field.startsWith('major')?list(model.majorResidencySourceIds):[]),...(field==='alternativeMaxCredits'?list(model.alternativeCapSourceIds):[])]);
   addFact({kind:'policy',identity:{field},facts:{field,value:clone(model[field]),fieldEvidence:clone(evidence)},sourceIds:explicitNames,declaredEvidence:evidence?{kind:'declared-policy-evidence'}:null,candidate:{institutionId,catalogIdentity:scope.catalogIdentity,format:scope.format,level:scope.level,receivingCreditSystem:scope.receivingCreditSystem,field,value:clone(model[field])}});
  }
  for(const field of priceFields){if(model[field]===undefined)continue;addFact({kind:'pricing-reference',identity:{field},facts:{field,value:clone(model[field])},sourceIds:sourceNames(model[field]),declaredEvidence:{kind:'planning-basis',estimate:true}});}
  for(const requirement of list(model.requirements)){
   assert(typeof requirement?.id==='string'&&requirement.id,'Requirements need model-local IDs.');
   const requirementId=id('requirement',{modelId:model.id,requirementId:requirement.id});
   assert(!requirementMap.has(requirementId),'Duplicate requirement '+model.id+'/'+requirement.id+'.');
   const node={id:requirementId,modelId:model.id,localId:requirement.id,title:requirement.title??null,code:requirement.code??null,credits:requirement.credits??null,creditSystem:model.creditSystem??null,category:requirement.category??null,group:requirement.group??null,factIds:[],courseOptions:[]};requirementMap.set(requirementId,node);program.requirementIds.push(requirementId);
   const attach=fact=>{node.factIds.push(fact.id);return fact;};
   attach(addFact({kind:'requirement',identity:{requirementId:requirement.id},facts:pick(requirement,requirementKeys),sourceIds:sourceNames(pick(requirement,requirementKeys)),requirementId:requirement.id,declaredEvidence:{researchGap:requirement.researchGap===true}}));
   for(const option of list(requirement.options)){
    const optionEvidence=pick(option,['evidence','evidenceType','evidenceOrigin','mappingResearchClosed','receivingMapStatus']);
    const receivingCode=option.receivingCode||requirement.code||null;
    const external=option.provider!=='University';
    let providerFact=null;
    if(external){
     const identityFacts={...pick(option,identityKeys),sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null};
     const identitySources=unique([...list(option.identitySourceIds),...list(option.listingIdentitySourceIds),...sourceNames(option.sourceCreditEvidence),...sourceNames(option.codeAliasEvidence),...list(option.recommendationPeriodSourceIds),...list(option.providerCoursePassingSourceIds)]);
     const version=option.courseVersion??option.version??null;
     const independent=identitySources.length>0&&identitySources.every(name=>localSources.has(name))&&version!==null&&option.sourceCredits!==undefined&&option.sourceCredits!==null&&Boolean(option.sourceCreditSystem)&&Boolean(option.recommendationStart)&&Boolean(option.recommendationEnd);
     // Independent provider identities can be reused globally only with an exact
     // source quantity, version and recommendation period. Receiving awards cannot.
     const providerScope=independent?{provider:option.provider,courseVersion:version,sourceCredits:option.sourceCredits,sourceCreditSystem:option.sourceCreditSystem,recommendationStart:option.recommendationStart,recommendationEnd:option.recommendationEnd,identitySourceMetadata:identitySources.map(name=>sourceMap.get(localSources.get(name)).metadataDigest).sort()}:scope;
     // Keep model-local evidence references in facts; their names may differ even
     // when the public identity is identical, so v1 also isolates that difference.
     providerFact=addFact({kind:'provider-identity',identity:{value:identityFacts},facts:identityFacts,sourceIds:identitySources,requirementId:requirement.id,optionId:option.id,declaredEvidence:pick(option,['sourceCreditStatus','sourceCreditVerification']),factScope:providerScope,candidate:{provider:option.provider,code:option.aceId||option.providerCourseCode||option.code||null,version,sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,recommendationStart:option.recommendationStart??null,recommendationEnd:option.recommendationEnd??null}});
    }
    const awardFacts={...pick(option,awardKeys.filter(key=>key!=='degreePlacementEvidence')),receivingCode,receivingCredits:option.credits??null,receivingCreditSystem:option.creditSystem||model.creditSystem||null,providerIdentityFactId:providerFact?.id??null};
    const awardIdentity={value:awardFacts};
    const award=attach(addFact({kind:external?'equivalence':'institutional-course',identity:awardIdentity,facts:awardFacts,sourceIds:sourceNames(awardFacts),requirementId:requirement.id,optionId:option.id,declaredEvidence:optionEvidence,candidate:external?{institutionId,catalogIdentity:scope.catalogIdentity,format:scope.format,level:scope.level,provider:option.provider,code:option.aceId||option.providerCourseCode||option.code||null,courseVersion:option.courseVersion??option.version??null,sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,recommendationStart:option.recommendationStart??null,recommendationEnd:option.recommendationEnd??null,receivingCode,receivingCredits:option.credits??null,receivingCreditSystem:option.creditSystem||model.creditSystem||null,upper:option.upper??null}:null}));
    if(providerFact)edge(award.id,providerFact.id,'equivalence-uses-provider-identity');
    // Placement is an edge, not another copy of a course and all its evidence.
    // Preserve degree-specific evidence here so it never broadens the award.
    const placement=pick(option,['placementType','selectionRequired','allocationBasis','allocationType','degreePlacementEvidence']);
    const placementRefs=sourceNames(placement).map(reference);
    node.courseOptions.push({optionId:option.id??null,awardFactId:award.id,...placement,sourceReferenceIds:placementRefs.map(ref=>ref.id).sort()});
   }
  }
  const fieldFacts=new Map(),optionFacts=new Map(),requirementFacts=new Map();
  for(const factId of unique(program.factIds)){const fact=factMap.get(factId);if(fact.facts.field){if(!fieldFacts.has(fact.facts.field))fieldFacts.set(fact.facts.field,[]);fieldFacts.get(fact.facts.field).push(factId);}for(const optionId of unique(fact.optionIds)){if(!optionFacts.has(optionId))optionFacts.set(optionId,[]);optionFacts.get(optionId).push(factId);}for(const requirementId of unique(fact.requirementIds)){if(!requirementFacts.has(requirementId))requirementFacts.set(requirementId,[]);requirementFacts.get(requirementId).push(factId);}}
  for(const finding of classifyModelFindings(model,{asOf})){
   const refs=list(finding.sourceIds).map(reference);
   const candidates=finding.field?fieldFacts.get(finding.field)||[]:list(finding.optionIds).length?list(finding.optionIds).flatMap(optionId=>optionFacts.get(optionId)||[]):list(finding.requirementIds).flatMap(requirementId=>requirementFacts.get(requirementId)||[]);
   const matching=unique(candidates).filter(factId=>{
    const fact=factMap.get(factId);
    if(list(finding.requirementIds).length&&!fact.requirementIds.some(value=>finding.requirementIds.includes(value)))return false;
    if(/^(mapping-|provider-eligibility$|conditional-award$|documented-personal-conditions$)/.test(finding.code))return fact.kind==='equivalence';
    if(finding.code==='selected-source-identity')return fact.kind==='provider-identity';
    if(finding.code==='university-course-evidence')return fact.kind==='institutional-course';
    return true;
   });
   findingMap.set(finding.id,{...clone(finding),programIds:[model.id],factIds:matching,sourceIds:unique(refs.map(ref=>ref.sourceId)),sourceReferenceIds:refs.map(ref=>ref.id).sort()});program.findingIds.push(finding.id);
  }
 }
 // Normalize reverse indexes after all merges; fingerprints cover the supporting
 // metadata, not merely IDs. They invalidate a staff attestation after a change.
 for(const fact of factMap.values()){
  for(const key of ['programIds','requirementIds','optionIds'])fact[key]=unique(fact[key]);
  fact.evidenceFingerprint=fingerprint(fact,sourceMap);
  if(fact.sourceBinding.missingLocalSourceIds.length){
   const findingId=id('finding',{factId:fact.id,code:'source-reference-missing',names:fact.sourceBinding.missingLocalSourceIds});
   const finding={id:findingId,modelId:fact.programIds[0],programIds:fact.programIds,factIds:[fact.id],category:'missing-research',code:'source-reference-missing',message:'A declared evidence reference does not resolve in its own program bibliography.',owner:'research',blocking:true,scope:'option',requirementIds:fact.requirementIds,optionIds:fact.optionIds,sourceIds:fact.sourceIds,sourceReferenceIds:fact.sourceReferenceIds};findingMap.set(findingId,finding);for(const programId of fact.programIds)programMap.get(programId).findingIds.push(findingId);
  }
 }
 for(const source of sourceMap.values()){source.programIds=unique(source.programIds);source.dependentFactIds=unique(source.dependentFactIds);source.localReferences.sort((a,b)=>canonicalJSON(a).localeCompare(canonicalJSON(b),'en'));}
 for(const institution of institutionMap.values())institution.programIds=unique(institution.programIds);
 for(const program of programMap.values()){for(const key of ['requirementIds','factIds','findingIds'])program[key]=unique(program[key]);program.sourceIds=unique([...sourceMap.values()].filter(source=>source.programIds.includes(program.id)).map(source=>source.id));}
 for(const requirement of requirementMap.values())requirement.factIds=unique(requirement.factIds);
 const reuseGroups=[...reuseMap.values()].map(group=>{for(const key of ['factIds','affectedProgramIds','affectedReadyTemplateIds'])group[key]=unique(group[key]);group.affectedProgramCount=group.affectedProgramIds.length;return group;}).filter(group=>group.factIds.length>1&&group.affectedProgramCount>1);
 const reviewQueue=[];
 for(const finding of findingMap.values()){
  if(finding.category==='student-task')continue;
  const targets=finding.factIds.length?finding.factIds:[null];
  for(const target of targets){const fact=target?factMap.get(target):null,affectedProgramIds=fact?.programIds||finding.programIds,affectedReadyTemplateIds=affectedProgramIds.filter(programId=>programMap.get(programId)?.readyTemplate);reviewQueue.push({id:id('review',{targetId:target||finding.modelId,findingId:finding.id}),targetType:target?'fact':'program',targetId:target||finding.modelId,category:finding.category,code:finding.code,message:finding.message,findingIds:[finding.id],affectedProgramIds,affectedReadyTemplateIds,impactScore:affectedReadyTemplateIds.length*100+affectedProgramIds.length});}
 }
 const registry={schemaVersion:1,revision:null,contentHash:null,asOf,institutions:sorted([...institutionMap.values()]),sources:sorted([...sourceMap.values()]),sourceReferences:sorted([...referenceMap.values()]),programs:sorted([...programMap.values()]),requirements:sorted([...requirementMap.values()]),facts:sorted([...factMap.values()]),dependencies:sorted([...edgeMap.values()]),findings:sorted([...findingMap.values()]),reuseGroups:sorted(reuseGroups),reviewQueue:reviewQueue.sort((a,b)=>b.impactScore-a.impactScore||a.id.localeCompare(b.id,'en'))};
 registry.contentHash=metadataDigest(core(registry));registry.revision='academic-v1:'+registry.contentHash;
 validateAcademicRegistry(registry);return registry;
}

/** Structural integrity is deliberately separate from academic verification. */
export function validateAcademicRegistry(registry){
 assert(registry?.schemaVersion===1,'Unsupported academic registry schema.');assertDate(registry.asOf);
 const groups=['institutions','sources','sourceReferences','programs','requirements','facts','dependencies','findings','reuseGroups','reviewQueue'];
 for(const name of groups){assert(Array.isArray(registry[name]),name+' must be an array.');assert(new Set(registry[name].map(value=>value.id)).size===registry[name].length,'Duplicate IDs in '+name+'.');}
 const sources=new Map(registry.sources.map(value=>[value.id,value])),refs=new Map(registry.sourceReferences.map(value=>[value.id,value])),facts=new Map(registry.facts.map(value=>[value.id,value])),programs=new Map(registry.programs.map(value=>[value.id,value])),requirements=new Map(registry.requirements.map(value=>[value.id,value])),findings=new Map(registry.findings.map(value=>[value.id,value]));
 for(const source of sources.values()){assert(source.metadataDigest===metadataDigest(source.metadata),'Source metadata digest mismatch.');assert(source.sourceContentHash===null,'This builder does not attest to fetched content hashes.');for(const programId of source.programIds)assert(programs.has(programId),'Source links an unknown program.');for(const factId of source.dependentFactIds)assert(facts.get(factId)?.sourceIds.includes(source.id),'Source backlink mismatch.');}
 for(const ref of refs.values()){assert(programs.has(ref.modelId),'Source reference has an unknown model.');assert(ref.sourceId===null||sources.has(ref.sourceId),'Source reference does not resolve.');assert(ref.status===(ref.sourceId?'resolved':'missing'),'Source resolution status mismatch.');assert(ref.id===id('source-ref',{modelId:ref.modelId,localSourceId:ref.localSourceId}),'Source reference escaped its model-local namespace.');}
 for(const fact of facts.values()){
  assert(typeof fact.kind==='string'&&fact.scope&&fact.facts,'Malformed academic fact.');assert(fact.evidenceFingerprint===fingerprint(fact,sources),'Fact evidence fingerprint mismatch.');
  for(const sourceId of fact.sourceIds)assert(sources.has(sourceId),'Fact references an unknown source.');
  for(const referenceId of fact.sourceReferenceIds){const ref=refs.get(referenceId);assert(ref&&fact.programIds.includes(ref.modelId),'Fact source escaped the model namespace.');assert(ref.sourceId===null||fact.sourceIds.includes(ref.sourceId),'Fact source-reference mismatch.');}
  for(const programId of fact.programIds)assert(programs.get(programId)?.factIds.includes(fact.id),'Fact/program backlink mismatch.');
  const missing=unique(fact.sourceReferenceIds.map(referenceId=>refs.get(referenceId)).filter(ref=>!ref.sourceId).map(ref=>ref.localSourceId));assert(canonicalJSON(missing)===canonicalJSON(fact.sourceBinding.missingLocalSourceIds),'Fact missing-source index mismatch.');assert(fact.sourceBinding.bound===(fact.sourceReferenceIds.length>0&&missing.length===0),'Fact source binding mismatch.');
  if(fact.kind==='provider-identity')assert(Object.hasOwn(fact.facts,'sourceCredits')&&Object.hasOwn(fact.facts,'sourceCreditSystem'),'Original course credits must remain explicitly known or null.');
 }
 for(const program of programs.values()){for(const factId of program.factIds)assert(facts.get(factId)?.programIds.includes(program.id),'Program/fact backlink mismatch.');for(const findingId of program.findingIds)assert(findings.get(findingId)?.programIds.includes(program.id),'Program finding backlink mismatch.');for(const requirementId of program.requirementIds)assert(requirements.get(requirementId)?.modelId===program.id,'Program requirement mismatch.');}
 const nodes=new Set([...sources.keys(),...refs.keys(),...facts.keys(),...programs.keys(),...requirements.keys()]);
 for(const edge of registry.dependencies)assert(nodes.has(edge.fromId)&&nodes.has(edge.toId),'Dependency has an unknown endpoint.');
 for(const finding of findings.values()){assert(['missing-research','conditional-policy','student-task','estimate'].includes(finding.category),'Unknown finding category.');for(const factId of finding.factIds)assert(facts.has(factId),'Finding has an unknown fact.');for(const programId of finding.programIds)assert(programs.has(programId),'Finding has an unknown program.');}
 for(const group of registry.reuseGroups){assert(group.status==='candidate-only'&&group.affectedProgramCount===group.affectedProgramIds.length,'Reuse candidates must not become verified facts.');for(const factId of group.factIds)assert(facts.has(factId),'Reuse group has an unknown fact.');}
 for(const item of registry.reviewQueue){assert(item.targetType==='fact'?facts.has(item.targetId):programs.has(item.targetId),'Review queue has an unknown target.');for(const findingId of item.findingIds)assert(findings.has(findingId),'Review queue has an unknown finding.');}
 assert(registry.contentHash===metadataDigest(core(registry)),'Academic content hash mismatch.');assert(registry.revision==='academic-v1:'+registry.contentHash,'Academic revision mismatch.');return registry;
}

export const academicRegistryLimits={indexBytes:12*1024*1024,shardBytes:8*1024*1024,evidenceBytes:1024*1024};
const bytes=value=>Buffer.byteLength(value,'utf8');
/** Runtime indexes never contain the full evidence graph. Exact conditions and
 * bibliographic metadata live in content-addressed, bounded evidence shards. */
export function buildAcademicRegistryArtifacts(registry){
 validateAcademicRegistry(registry);
 const shards=new Map(),paths=new Map();
 let chunk={schemaVersion:1,facts:[],sources:[],requirements:[],sourceReferences:[],findings:[]};
 let size=bytes(canonicalJSON(chunk)+'\n');
 const flush=()=>{
  if(!Object.entries(chunk).some(([key,value])=>Array.isArray(value)&&value.length))return;
  const serialized=canonicalJSON(chunk)+'\n',hash=createHash('sha256').update(serialized).digest('hex'),path='dist/data/academic-evidence/'+hash+'.json';
  assert(bytes(serialized)<=academicRegistryLimits.evidenceBytes,'An evidence shard exceeds the runtime memory limit.');
  shards.set(path,chunk);for(const collection of Object.values(chunk))if(Array.isArray(collection))for(const value of collection)paths.set(value.id,'/'+path.slice('dist/'.length));
  chunk={schemaVersion:1,facts:[],sources:[],requirements:[],sourceReferences:[],findings:[]};size=bytes(canonicalJSON(chunk)+'\n');
 };
 for(const name of ['facts','sources','requirements','sourceReferences','findings']){
  flush();
  // Keep a program's evidence together. Sorting only by hashed fact ID scatters
  // one degree across the whole library and defeats lazy bounded loading.
  const group=value=>name==='facts'?(value.programIds.length===1?value.programIds[0]:'shared'):'all';
  const values=[...registry[name]].sort((a,b)=>group(a).localeCompare(group(b),'en')||a.id.localeCompare(b.id,'en'));let previous=null;
  for(const value of values){
   const current=group(value);if(previous!==null&&current!==previous)flush();previous=current;
   const itemBytes=bytes(canonicalJSON(value))+1;
   assert(itemBytes<academicRegistryLimits.evidenceBytes-256,'One public evidence record is too large to serve safely.');
   if(size+itemBytes>academicRegistryLimits.evidenceBytes-256)flush();
   chunk[name].push(value);size+=itemBytes;
  }
 }
 flush();
 const scopes=new Map();
 const scopeRef=scope=>{const scopeId=id('scope',scope);if(!scopes.has(scopeId))scopes.set(scopeId,{id:scopeId,...scope});return {$ref:scopeId};};
 const index={...registry,artifactType:'academic-registry-index',evidenceShards:[...shards].map(([path,value])=>({path:'/'+path.slice(5),sha256:path.split('/').at(-1).slice(0,-5),bytes:bytes(canonicalJSON(value)+'\n')}))};
 // Placement and model-local reference IDs are needed on an exact evidence
 // detail, not on overview/queue indexes. The full records above retain them;
 // request-local hydration restores them after checking the fact fingerprint.
 index.facts=registry.facts.map(fact=>({...omit(fact,['facts','declaredEvidence','scope','sourceBinding','optionIds','requirementIds','sourceReferenceIds']),scope:scopeRef(fact.scope),sourceBinding:{bound:fact.sourceBinding.bound,missingReferenceCount:fact.sourceBinding.missingLocalSourceIds.length},label:fact.facts.title||fact.facts.field||fact.kind,detailPath:paths.get(fact.id)}));
 index.sources=registry.sources.map(source=>({...pick(source,['id','url','title','metadataDigest','programIds']),detailPath:paths.get(source.id)}));
 index.programs=registry.programs.map(program=>({...omit(program,['factIds','requirementIds','findingIds','sourceIds']),factCount:program.factIds.length,requirementCount:program.requirementIds.length,findingCount:program.findingIds.length}));
 // Requirements have no runtime lookup endpoint. They remain complete in the
 // content-addressed evidence files and in the validated build registry.
 index.requirements=[];
 index.sourceReferences=[];
 index.sourceReferenceShards=unique(registry.sourceReferences.map(reference=>paths.get(reference.id)));
 index.findings=registry.findings.map(finding=>({...pick(finding,['id','modelId','programIds','factIds','category','code','message','owner','blocking','scope','field','requirementIds','optionIds']),detailPath:paths.get(finding.id)}));
 index.reuseGroups=registry.reuseGroups.map(group=>({...omit(group,['scope']),scope:scopeRef(group.scope)}));
 index.reviewQueue=registry.reviewQueue.map(item=>omit(item,['message']));
 index.scopes=sorted([...scopes.values()]);
 // Additional dependency edges are in the build registry. The compact index
 // already has complete fact/program/source adjacency and exact detail links.
 index.dependencies=[];
 // Fact and finding summaries are the bulk of the index and grow with every degree. They live in per-school
 // registry shards (a fact or finding whose programs span schools goes to the shared shard), loaded on demand.
 const institutionOf=new Map(registry.programs.map(program=>[program.id,program.institutionId])),groupOf=item=>{const owners=unique(list(item.programIds).map(id=>institutionOf.get(id)).filter(Boolean));return owners.length===1?owners[0]:'shared';};
 const grouped=new Map();
 for(const name of ['facts','findings'])for(const item of index[name]){const group=groupOf(item);if(!grouped.has(group))grouped.set(group,{facts:[],findings:[]});grouped.get(group)[name].push(item);}
 const registryShards=new Map();index.registryShards=[];index.factShards={};index.findingShards={};
 for(const group of [...grouped.keys()].sort()){
  const {facts,findings}=grouped.get(group),shard={schemaVersion:1,artifactType:'academic-registry-shard',revision:registry.revision,group,facts,findings};
  const serialized=JSON.stringify(shard)+'\n',hash=createHash('sha256').update(serialized).digest('hex'),path='dist/data/academic-registry-shards/'+hash+'.json';
  assert(bytes(serialized)<=academicRegistryLimits.shardBytes,'Academic registry shard '+group+' exceeds '+academicRegistryLimits.shardBytes+' bytes.');
  registryShards.set(path,shard);
  const number=index.registryShards.length;
  index.registryShards.push({path:'/'+path.slice(5),sha256:hash,bytes:bytes(serialized),group,programIds:unique(facts.concat(findings).flatMap(item=>list(item.programIds))),factCount:facts.length,findingCount:findings.length});
  for(const fact of facts)index.factShards[fact.id]=number;
  for(const finding of findings)index.findingShards[finding.id]=number;
 }
 delete index.facts;delete index.findings;
 const indexBytes=bytes(JSON.stringify(index)+'\n');
 assert(indexBytes<=academicRegistryLimits.indexBytes,'Academic registry index exceeds 12MiB ('+indexBytes+' bytes; '+Object.entries(index).filter(([,value])=>Array.isArray(value)).map(([key,value])=>key+':'+bytes(JSON.stringify(value))).join(', ')+').');
 validateAcademicRegistryArtifacts({index,shards,registryShards});return {index,shards,registryShards};
}
/** The full compact registry (index plus every shard), as the coverage workbench reads it when it needs everything. */
export function mergeAcademicRegistryShards(index,registryShards){
 const loaded=[...registryShards.values()];
 return {...index,facts:loaded.flatMap(shard=>shard.facts),findings:loaded.flatMap(shard=>shard.findings)};
}

export function validateAcademicRegistryArtifacts({index,shards,registryShards=new Map()}){
 assert(index.schemaVersion===1&&index.artifactType==='academic-registry-index','Malformed compact academic registry.');
 assert(index.revision==='academic-v1:'+index.contentHash,'Compact academic revision mismatch.');
 assert(bytes(JSON.stringify(index)+'\n')<=academicRegistryLimits.indexBytes,'Academic index exceeds its byte limit.');
 const available=new Set();
 for(const [path,shard] of shards){const serialized=canonicalJSON(shard)+'\n',hash=createHash('sha256').update(serialized).digest('hex');assert(path==='dist/data/academic-evidence/'+hash+'.json','Evidence path does not match its actual content.');assert(bytes(serialized)<=academicRegistryLimits.evidenceBytes,'Evidence shard exceeds its byte limit.');available.add('/'+path.slice(5));}
 const listed=new Map(list(index.registryShards).map((entry,number)=>[entry.path,number]));
 assert(listed.size===registryShards.size,'Every academic registry shard must be listed once.');
 const facts=[],findings=[];
 for(const [path,shard] of registryShards){
  const serialized=JSON.stringify(shard)+'\n',hash=createHash('sha256').update(serialized).digest('hex'),number=listed.get('/'+path.slice(5));
  assert(path==='dist/data/academic-registry-shards/'+hash+'.json'&&number!==undefined&&index.registryShards[number].sha256===hash,'Registry shard path does not match its actual content.');
  assert(shard.revision===index.revision&&shard.artifactType==='academic-registry-shard','Registry shard belongs to another academic release.');
  assert(bytes(serialized)<=academicRegistryLimits.shardBytes,'Registry shard exceeds its byte limit.');
  for(const fact of shard.facts){assert(index.factShards[fact.id]===number,'A fact is not located in its listed shard.');facts.push(fact);}
  for(const finding of shard.findings){assert(index.findingShards[finding.id]===number,'A finding is not located in its listed shard.');findings.push(finding);}
 }
 for(const [name,items] of [['facts',facts],['findings',findings],...['sources','requirements','sourceReferences'].map(name=>[name,index[name]])])for(const item of items)assert(available.has(item.detailPath),'Index item does not point to an evidence shard ('+name+').');
 for(const fact of facts)assert(!Object.hasOwn(fact,'facts')&&!Object.hasOwn(fact,'declaredEvidence'),'The runtime index must not duplicate fact evidence.');
 return index;
}

export async function readAcademicInputs(base=root,{reviewCutoff=new Date().toISOString().slice(0,10)}={}){
 const registry=JSON.parse(await readFile(resolve(base,'dist/data/curriculum-registry.json'),'utf8'));
 const models=[];
 for(const path of unique(registry.models.map(entry=>entry.path))){assert(typeof path==='string'&&!path.split('/').includes('..'),'Unsafe curriculum model path.');const pack=JSON.parse(await readFile(resolve(base,'dist',path),'utf8'));models.push(...(pack.models||[pack]));}
 const selected=new Set(registry.models.map(entry=>entry.id)),included=models.filter(model=>selected.has(model.id));
 // A scoped source review can be newer than its curriculum package. Evaluate
 // coverage at the latest recorded review without changing any course, catalog
 // or individual evidence date, or treating a fetch timestamp as a review.
 const reviewDates=[registry.checkedOn,...included.flatMap(model=>list(model.sources).flatMap(source=>[source.checked,source.checkedOn,source.checkedAt]))].filter(value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
 assertDate(reviewCutoff);
 assert(!reviewDates.some(value=>value>reviewCutoff),'Academic evidence cannot have a future review date; correct the reviewed source metadata.');
 return {models:included,entries:registry.models,asOf:reviewDates.sort().at(-1)||registry.checkedOn};
}
export async function runAcademicRegistry({base=root,check=false,asOf}={}){
 const input=await readAcademicInputs(base),registry=buildAcademicRegistry({...input,asOf:asOf||input.asOf}),{index,shards,registryShards}=buildAcademicRegistryArtifacts(registry),output=JSON.stringify(index)+'\n',path=resolve(base,academicRegistryPath),evidenceFolder=resolve(base,'dist/data/academic-evidence'),shardFolder=resolve(base,'dist/data/academic-registry-shards');
 const expected=new Set([...shards.keys()].map(path=>path.split('/').at(-1))),expectedShards=new Set([...registryShards.keys()].map(path=>path.split('/').at(-1)));
 if(check){
  assert(await readFile(path,'utf8')===output,'Academic registry is stale. Run node scripts/build-academic-registry.mjs.');
  for(const [shardPath,value] of shards)assert(await readFile(resolve(base,shardPath),'utf8')===canonicalJSON(value)+'\n','Academic evidence shard is stale or changed.');
  assert((await readdir(evidenceFolder)).filter(name=>name.endsWith('.json')).every(name=>expected.has(name)),'Unreferenced stale academic evidence shards remain.');
  for(const [shardPath,value] of registryShards)assert(await readFile(resolve(base,shardPath),'utf8')===JSON.stringify(value)+'\n','Academic registry shard is stale or changed.');
  assert((await readdir(shardFolder)).filter(name=>name.endsWith('.json')).every(name=>expectedShards.has(name)),'Unreferenced stale academic registry shards remain.');
 }else{
  await mkdir(dirname(path),{recursive:true});await mkdir(evidenceFolder,{recursive:true});await mkdir(shardFolder,{recursive:true});
  for(const [shardPath,value] of shards)await writeFile(resolve(base,shardPath),canonicalJSON(value)+'\n');
  for(const [shardPath,value] of registryShards)await writeFile(resolve(base,shardPath),JSON.stringify(value)+'\n');
  await writeFile(path,output);
  for(const name of await readdir(evidenceFolder))if(/^[a-f0-9]{64}\.json$/.test(name)&&!expected.has(name))await unlink(resolve(evidenceFolder,name));
  for(const name of await readdir(shardFolder))if(/^[a-f0-9]{64}\.json$/.test(name)&&!expectedShards.has(name))await unlink(resolve(shardFolder,name));
 }
 return {...index,factCount:Object.keys(index.factShards).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const index=process.argv.indexOf('--as-of');
 const registry=await runAcademicRegistry({check:process.argv.includes('--check'),asOf:index>=0?process.argv[index+1]:undefined});
 console.log('Academic registry: '+registry.programs.length+' programs, '+registry.factCount+' scoped facts in '+registry.registryShards.length+' shards, '+registry.sources.length+' source records, '+registry.reuseGroups.length+' reuse candidates; '+registry.revision+'.');
}
