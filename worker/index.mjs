import { handleAIConnections, resolveAIConnection } from '../server/ai-connections.mjs';
import { canonicalSchoolName, canonicalDegreeTitle } from '../server/degree-identity.mjs';
import { findResearchReference, checkResearchReference } from '../server/research-references.mjs';
import { buildCreditSourceDiscovery } from '../server/credit-source-discovery.mjs';
import { handleCollegeAccess } from '../server/college-access.mjs';
import TemplateAcademicPlanner from '../dist/planner.js';
import TemplateProgramCatalog from '../dist/program-catalog.js';
import { validateAcademicTemplate, canonicalTemplateAcademicModel } from '../server/template-academic.mjs';
import { handleTemplateResearch, runTemplateResearchJob } from '../server/template-research.mjs';
import { processResearchJobs, dispatchResearchOutbox } from '../server/research-jobs.mjs';
import { handleCommunity } from '../server/community.mjs';
import { handlePortal } from '../server/portal.mjs';
import { handleTranscriptImport } from '../server/transcript-import.mjs';
import { handleAuth, resolvePortalIdentity } from '../server/auth.mjs';
import { handleCatalog } from '../server/catalog.mjs';
import { handleCurriculumDiscovery } from '../server/curriculum-discovery.mjs';
import { publicCommunityCache } from '../server/public-community-cache.mjs';
import { handleAcademicCoverage } from '../server/academic-coverage.mjs';
import { handleGrowthMetrics, pruneGrowthMetrics, recordGrowthEvent } from '../server/growth-metrics.mjs';
import { handlePlanAlerts, runPlanAlerts, removePlanAlerts } from '../server/plan-alerts.mjs';
import { handleCoach, pruneCoach } from '../server/coach.mjs';
import { handleLeads, pruneLeads, isLeadsPath } from '../server/leads.mjs';
import { assets } from './assets.generated.mjs';
import { loadOwnerModule } from './owner.generated.mjs';
import {faviconLinks} from '../server/site-icons.mjs';

let programCatalogSnapshot, curriculumRegistrySnapshot, degreeAliasSnapshot, basePathwaysSnapshot, resolvedPlanCatalogSnapshot, researchReferencesSnapshot, creditSourceDiscoverySnapshot;
let academicCoverageSnapshot, baselineSnapshot;
let coachDataSnapshot;
let alertPlanDataSnapshot;
let academicEvidenceCache;
// Public versioned build assets only. Never put account data or credentials in this cache.
let nativePublicAssets;
let nativeAssetPaths;
function initializePublicAssets(env){if(env?.ASSETS?.fetch)nativePublicAssets=env.ASSETS;}
const curriculumPackCache = new Map();
async function decodeStaticAsset(asset) {
  if(asset?.external){
    if(!nativePublicAssets)throw Error('Public asset storage is unavailable');
    // Native manifests store each route once as the object key. Resolve only
    // compiled assets; a caller-supplied path cannot select private storage.
    nativeAssetPaths??=new WeakMap(Object.entries(assets).map(([path,value])=>[value,path]));
    const path=nativeAssetPaths.get(asset);if(!path)throw Error('Public build asset is unavailable');
    const response=await nativePublicAssets.fetch(new Request('https://assets.degreesteps.internal'+path));if(!response.ok)throw Error('Public build asset is unavailable');return response.text();
  }
  if(asset.encoding!=='gzip-base64')return asset.body;
  const bytes=Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
async function publicCatalogSnapshot() {
  if(!programCatalogSnapshot)programCatalogSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/program-catalog.json']));
  return programCatalogSnapshot;
}
async function researchReferenceData() {
  if(!researchReferencesSnapshot)researchReferencesSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/research-references.json']));
  return researchReferencesSnapshot;
}
async function researchReferenceForURL(url) {
  return findResearchReference(await researchReferenceData(),url,{includeStaleChoiceIdentity:true});
}
async function creditSourceDiscovery() {
  if(!creditSourceDiscoverySnapshot)creditSourceDiscoverySnapshot=buildCreditSourceDiscovery(JSON.parse(await decodeStaticAsset(assets['/data/credit-sources.json'])));
  return creditSourceDiscoverySnapshot;
}
async function reviewedCurriculaFor(school) {
  if(!curriculumRegistrySnapshot)curriculumRegistrySnapshot=JSON.parse(await decodeStaticAsset(assets['/data/curriculum-registry.json']));
  const entries=(curriculumRegistrySnapshot.models||[]).filter(entry=>entry.status==='reviewed'&&entry.school===school),models=[];
  for(const path of new Set(entries.map(entry=>entry.path))){
    if(!curriculumPackCache.has(path)){
      const asset=assets['/'+path];if(!asset)continue;
      if(curriculumPackCache.size>=2)curriculumPackCache.delete(curriculumPackCache.keys().next().value);
      const pack=JSON.parse(await decodeStaticAsset(asset));curriculumPackCache.set(path,pack.models||[pack]);
    }
    models.push(...curriculumPackCache.get(path).filter(model=>entries.some(entry=>entry.id===model.id)));
  }
  const legacy=school==='Liberty University'?['liberty','liberty-criminal-justice-online','liberty-criminal-justice-residential']:school==='Thomas Edison State University'?['tesu']:[];
  for(const name of legacy){const asset=assets['/data/'+name+'.json'];if(asset)models.push(JSON.parse(await decodeStaticAsset(asset)));}
  return models;
}

function linkIdentity(value) {
  try {
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;
    url.hash='';for(const name of [...url.searchParams.keys()])if(/^utm_/i.test(name)||/^(?:fbclid|gclid|ref|referrer|email|student_id|lead_id|prospect_id|user_id|contact_id)$/i.test(name))url.searchParams.delete(name);
    url.searchParams.sort();url.pathname=url.pathname.replace(/\/+$/,'')||'/';return url.href;
  }catch{return null;}
}
function catalogIdentity(value) {
  const text=String(value||'').replace(/[–—]/g,'-'),ranges=[...new Set(text.match(/20\d\d-20\d\d/g)||[])];
  return ranges.length===1?ranges[0]:/^20\d\d(?:(?:0[1-9]|1[0-2]))?$/.test(text.trim())?text.trim():null;
}
function reviewedCurrentCatalog(model) {
  const identity=model?.catalogIdentity;
  if(model?.catalogYear||!model?.id||identity?.kind!=='reviewed-current-catalog'||typeof identity.label!=='string'||!identity.label.trim()||identity.label!==model.catalog||!/^20\d\d-\d\d-\d\d$/.test(identity.checkedOn||'')||!Number.isFinite(Date.parse(identity.checkedOn))||new Date(identity.checkedOn).toISOString().slice(0,10)!==identity.checkedOn)return false;
  try{const url=new URL(identity.sourceUrl);return url.protocol==='https:'&&!url.username&&!url.password&&(model.sources||[]).some(source=>source.url===url.href&&(source.checked||source.checkedOn)===identity.checkedOn);}catch{return false;}
}
async function registryModel(entry) {
  if(!curriculumPackCache.has(entry.path)){
    const asset=assets['/'+entry.path];if(!asset)return null;
    if(curriculumPackCache.size>=2)curriculumPackCache.delete(curriculumPackCache.keys().next().value);
    const pack=JSON.parse(await decodeStaticAsset(asset));curriculumPackCache.set(entry.path,pack.models||[pack]);
  }
  return curriculumPackCache.get(entry.path).find(model=>model.id===entry.id)||null;
}
function degreeLevel(value) {
  return ({bachelors:'bachelor',bachelor:'bachelor',associates:'associate',associate:'associate',masters:'master',master:'master',doctoral:'doctorate',doctorate:'doctorate',specialist:'specialist'})[String(value||'').toLowerCase().replace(/[^a-z]/g,'')]||null;
}
async function knownSourcePlan(entry,pathwayId,modality,model) {
  try{
  if(!basePathwaysSnapshot)basePathwaysSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/pathways.json']));
  const catalog=await publicCatalogSnapshot();
  if(!resolvedPlanCatalogSnapshot){
    const publicationAsset=assets['/data/publication-index.json'];if(!publicationAsset)return null;
    const structural=TemplateProgramCatalog.attachRegistry(TemplateProgramCatalog.merge(basePathwaysSnapshot,catalog),curriculumRegistrySnapshot);
    resolvedPlanCatalogSnapshot=TemplateProgramCatalog.attachPublicationIndex(structural,JSON.parse(await decodeStaticAsset(publicationAsset)),curriculumRegistrySnapshot);
  }
  const original=resolvedPlanCatalogSnapshot.pathways.find(route=>route.id===pathwayId);
  if(!original||original.modelId!==entry.id||original.school!==model.school||!original.modalities?.includes(modality)||!entry.routeIds.includes(pathwayId)||!entry.modalities.includes(modality))return null;
  if(!TemplateProgramCatalog.publishedPlans(resolvedPlanCatalogSnapshot,[model]).some(route=>route.id===pathwayId))return null;
  const level=entry.level||degreeLevel(model.level),route={...original,modelId:entry.id,level,modalities:[modality],readyTemplate:true,courseMapStatus:'mapped'};
  if(original.parentId&&(!degreeLevel(model.level)||original.level!==degreeLevel(model.level)||entry.level&&entry.level!==degreeLevel(model.level)))return null;
  // Build-time baselines contain no student records. A missing/stale artifact
  // fails closed; a degree-link request never launches a fresh optimization.
  if(!baselineSnapshot){
    const asset=assets['/data/baseline-index.json'];if(!asset)return null;
    const candidate=JSON.parse(await decodeStaticAsset(asset)),{revision,...content}=candidate;
    if(candidate.schemaVersion!==1||candidate.privateRecordsIncluded!==false||!candidate.baselines||!/^academic-v1:[a-f0-9]{64}$/.test(candidate.registryRevision||'')||!/^20\d\d-\d\d-\d\d$/.test(candidate.asOf||'')||!candidate.inputs||candidate.plannerHash!==candidate.inputs['/planner.js'])return null;
    const required=['/planner.js','/data/academic-registry.json','/data/pathways.json','/data/program-catalog.json','/data/curriculum-registry.json','/data/research-references.json',...curriculumRegistrySnapshot.models.map(entry=>'/'+entry.path)];
    if(required.some(path=>!candidate.inputs[path]))return null;
    for(const [path,hash]of Object.entries(candidate.inputs))if(!/^[a-f0-9]{64}$/.test(hash)||!assets[path]?.etag?.includes(hash.slice(0,24)))return null;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(content)))),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(revision!=='baselines-v1:'+digest)return null;
    baselineSnapshot=candidate;
  }
  const baseline=baselineSnapshot.baselines?.[[entry.id,pathwayId,modality].join('|')];
  if(!baseline||baseline.modelId!==model.id||baseline.validation?.academicCountsValid!==true||baseline.summary?.requirementCount!==model.requirements?.length||baseline.summary?.totalCredits!==model.totalCredits)return null;
  if(!Array.isArray(baseline.rows)||baseline.rows.length!==model.requirements.length||new Set(baseline.rows.map(row=>row.requirementId)).size!==baseline.rows.length)return null;
  const balance=TemplateAcademicPlanner.creditBalancePolicy(model),baselineRows=[];
  if(model.degreeCreditBalancePolicy?.enabled===true&&!balance)return null;
  for(const row of baseline.rows){
    const req=model.requirements.find(req=>req.id===row.requirementId);
    if(!req||row.status!=='planned')return null;
    const derived=balance?.balanceRequirementIds.includes(req.id);
    // An open slot's "choose a course" placeholder is a complete baseline row (the student picks the course later).
    const option=req.options?.find(option=>option.id===row.optionId&&option.provider===row.provider&&(option.code===row.code&&!option.selectionRequired||!balance&&row.code===null&&TemplateAcademicPlanner.openSlotPlaceholder?.(req,option)));
    if(derived&&row.optionId===null){
      if(row.credits!==0||row.provider!==null||row.code!==null)return null;
    }else if(!option)return null;
    if(balance){
      const variable=balance.equivalencies.some(binding=>binding.requirementId===req.id&&binding.awardedCredits===row.credits&&binding.options.some(item=>item.optionId===option?.id&&item.provider===option.provider&&item.code===option.code));
      if(row.credits!==req.credits&&!variable&&!(derived&&option&&row.credits===option.credits))return null;
      if(option&&row.credits!==option.credits)return null;
      baselineRows.push({...req,requirementId:req.id,credits:row.credits,subgroup:req.subgroup||req.group||null,option:option||null,status:'planned',institutional:option?.provider==='University',upper:Boolean(option?.upper),sourceIds:option?.sourceIds||[],selectionRequired:Boolean(req.selectionRequired||option?.selectionRequired),minimumCompletedCredits:Number(req.minimumCompletedCredits)||0,...(derived||variable?{nativeRequirementCredits:req.credits,...(derived?{creditBalanceDerived:true}:{})}:{})});
    }else if(row.credits!==req.credits)return null;
  }
  if(balance){
    // Revalidate the precomputed allocation; never run an optimizer or invent
    // a fourth credit while opening a known degree link.
    const validation=TemplateAcademicPlanner.validate(model,{rows:baselineRows});
    if(!validation.valid||!validation.policyChecksComplete)return null;
    const sum=predicate=>baselineRows.filter(predicate).reduce((total,row)=>total+row.credits,0);
    if(sum(()=>true)!==model.totalCredits||sum(row=>row.option&&row.option.provider!=='University')!==baseline.summary.transferCredits||sum(row=>row.option?.provider==='University')!==baseline.summary.universityCredits||sum(row=>row.option?.upper===true)!==baseline.summary.upperCredits||baseline.summary.institutionMinCredits!==model.institutionMinCredits||baseline.summary.externalMaxCredits!==model.externalMaxCredits)return null;
  }
  const reference=original.url?await researchReferenceForURL(original.url):null;
  if(reference&&checkResearchReference({...model,level,schoolName:model.school,programName:model.title,modality,catalogYear:catalogIdentity(model.catalogYear||model.catalog)},reference).length)return null;
  return{route,model:{...model,level},summary:baseline.summary,qualityReady:true};
  }catch{return null;}
}
async function academicCoverageData(){
  if(!academicCoverageSnapshot){
    const registry=JSON.parse(await decodeStaticAsset(assets['/data/academic-registry.json'])),report=JSON.parse(await decodeStaticAsset(assets['/data/pathway-quality-report.json']));
    if(report.registryRevision!==registry.revision)throw Error('Academic coverage artifacts disagree.');
    academicCoverageSnapshot={registry,report,loadEvidence:loadAcademicEvidence,loadRegistryShards:loadAcademicRegistryShards};
  }
  return academicCoverageSnapshot;
}
/** Per-school academic registry shards (fact and finding summaries), checked against the index's content hashes. */
async function loadAcademicRegistryShards(entries){
  const out=[];let totalBytes=0;
  for(const entry of entries){
    const path=entry?.path;
    if(typeof path!=='string'||!/^\/data\/academic-registry-shards\/[a-f0-9]{64}\.json$/.test(path)||!assets[path]||path.split('/').at(-1).slice(0,-5)!==entry.sha256)throw Error('This registry shard is not part of the current academic release.');
    const body=await decodeStaticAsset(assets[path]),encoded=new TextEncoder().encode(body);
    totalBytes+=encoded.byteLength;
    if(encoded.byteLength>8*1024*1024||totalBytes>40*1024*1024)throw Error('The registry shards exceed the release size limit.');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(digest!==entry.sha256)throw Error('A registry shard failed its content check.');
    out.push(JSON.parse(body));
  }
  return out;
}
async function loadAcademicEvidence(paths){
  if(!Array.isArray(paths)||paths.length>32)throw Error('Choose a smaller evidence group.');
  const facts=[],sources=[];let totalBytes=0;
  for(const path of new Set(paths)){
    if(typeof path!=='string'||!/^\/data\/academic-evidence\/[a-f0-9]{64}\.json$/.test(path)||!assets[path])throw Error('This evidence is not part of the current academic release.');
    let payload;
    if(academicEvidenceCache?.path===path){payload=academicEvidenceCache.payload;totalBytes+=academicEvidenceCache.bytes;}
    else{
      const body=await decodeStaticAsset(assets[path]),encoded=new TextEncoder().encode(body),bytes=encoded.byteLength;
      if(bytes>1100*1024)throw Error('This evidence file exceeds the release size limit.');
      totalBytes+=bytes;
      if(totalBytes>8*1024*1024)throw Error('Choose a smaller evidence group.');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoded)),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(digest!==path.split('/').at(-1).slice(0,-5))throw Error('This evidence file failed its content check.');
      payload=JSON.parse(body);academicEvidenceCache={path,payload,bytes};
    }
    if(totalBytes>8*1024*1024)throw Error('Choose a smaller evidence group.');
    facts.push(...(payload.facts||[]));sources.push(...(payload.sources||[]));
  }
  return {facts,sources};
}
function checkPrivateResearchPlan(artifact) {
  const issues=[],add=message=>{if(!issues.includes(message))issues.push(message);};
  try{
    const converted=canonicalTemplateAcademicModel(artifact),model=converted.model;
    if(!model)return{valid:false,issues:['The complete degree requirements are still needed.']};
    if(artifact.modality==='hybrid')model.format='Hybrid';
    for(const field of ['institutionMinCredits','externalMaxCredits','upperMinCredits'])if(!Number.isFinite(model[field]))add('Confirm '+field+' from the university’s degree policies.');
    if(!Number.isFinite(model.majorMinInstitutionCredits)&&(!Number.isFinite(model.majorInstitutionFraction)||!Number.isFinite(model.majorResidencyBasisCredits)))add('Confirm the university’s major-residency rule.');
    const providers=[...new Set((model.requirements||[]).flatMap(row=>(row.options||[]).map(option=>option.provider)))].filter(provider=>provider!=='University');
    const plan=TemplateAcademicPlanner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
    const validation=TemplateAcademicPlanner.validate(model,plan);
    if(plan.validation?.academicCountsValid!==true||validation.academicCountsValid!==true)add('The course choices do not yet satisfy all degree credit rules.');
    if(plan.rows.length!==model.requirements.length||plan.rows.some(row=>!row.option||!row.option.code||row.option.selectionRequired||row.selectionRequired))add('Choose an actual, sourced course for every degree requirement.');
    if(plan.sequence?.some(step=>step.executionBlocked))add('Resolve the course-order requirements before using this plan.');
    for(const error of [...(plan.setupIssues||[]),...(plan.validation?.errors||[]),...(validation.errors||[])])if(!['conditional_mapping','policy_review','program_research'].includes(error.code))add(error.message||'A degree constraint still needs correction.');
    if(Number(artifact.alternativeMaxCredits)>0&&!plan.rows.some(row=>row.option?.provider!=='University'))add('Find actual approved transfer courses for this degree’s alternative-credit opportunities.');
    return{valid:issues.length===0,issues};
  }catch{return{valid:false,issues:['The proposed courses could not yet be checked together as a degree plan.']};}
}
async function resolveKnownDegreeLink(value) {
  const url=linkIdentity(value);if(!url)return null;
  const catalog=await publicCatalogSnapshot();
  if(!curriculumRegistrySnapshot)curriculumRegistrySnapshot=JSON.parse(await decodeStaticAsset(assets['/data/curriculum-registry.json']));
  if(!degreeAliasSnapshot)degreeAliasSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/degree-link-aliases.json']));
  const aliases=(degreeAliasSnapshot.aliases||[]).filter(alias=>linkIdentity(alias.url)===url);
  const programs=(catalog.programs||[]).filter(program=>linkIdentity(program.url)===url);
  // A reviewed format-specific curriculum can have its own official URL while
  // the directory lists the parent degree. Resolve only that exact registry
  // route, with the same reviewed model, school, award and delivery format.
  for(const route of curriculumRegistrySnapshot.routes||[]){
    if(!route.parentId||linkIdentity(route.url)!==url||!['bachelor','associate','master','doctorate','specialist'].includes(route.level)||route.modalities?.length!==1||!['online','campus'].includes(route.modalities[0]))continue;
    const entry=curriculumRegistrySnapshot.models.find(entry=>entry.readyTemplate===true&&entry.status==='reviewed'&&entry.routeIds?.includes(route.id)&&entry.school===route.school&&(!entry.level||entry.level===route.level)&&entry.modalities?.includes(route.modalities[0])&&canonicalDegreeTitle(entry.title)===canonicalDegreeTitle(route.title));
    const parent=(catalog.programs||[]).find(program=>program.id===route.parentId&&program.school===route.school&&program.level===route.level&&canonicalDegreeTitle(program.title)===canonicalDegreeTitle(route.title));
    if(entry&&parent&&!programs.some(program=>program.id===parent.id))programs.push(parent);
  }
  if(!programs.length&&!aliases.length)return null;
  // A directory URL can name many degrees. Never pick its one mapped degree by accident.
  const identities=new Set(programs.map(program=>[canonicalSchoolName(program.school),canonicalDegreeTitle(program.title),program.level].join('|')));
  if(!aliases.length&&identities.size!==1)return null;
  const routeMatches=(id,entry)=>programs.some(program=>program.id===id)||curriculumRegistrySnapshot.routes?.some(route=>route.id===id&&route.parentId&&route.school===entry.school&&(!entry.level||route.level===entry.level)&&linkIdentity(route.url)===url&&programs.some(program=>program.id===route.parentId&&program.school===route.school&&program.level===route.level&&canonicalDegreeTitle(program.title)===canonicalDegreeTitle(route.title)));
  const choices=[];
  for(const entry of curriculumRegistrySnapshot.models.filter(entry=>entry.readyTemplate===true&&entry.status==='reviewed'&&(aliases.length?aliases.some(alias=>alias.modelId===entry.id&&entry.routeIds?.includes(alias.pathwayId)):entry.routeIds?.some(id=>routeMatches(id,entry))))){
    const model=await registryModel(entry),catalogYear=catalogIdentity(model?.catalogYear||model?.catalog);
    if(!model||!catalogYear&&!reviewedCurrentCatalog(model))continue;
    for(const modality of entry.modalities||[]){
      if(!['online','campus'].includes(modality))continue;
      const alias=aliases.find(alias=>alias.modelId===entry.id&&alias.modality===modality);if(aliases.length&&!alias)continue;
      const level=entry.level||degreeLevel(model.level),pathwayId=alias?.pathwayId||entry.routeIds.find(id=>routeMatches(id,entry));
      const sourcePlan=await knownSourcePlan(entry,pathwayId,modality,model);
      // A reviewed mutable catalog can open its preloaded plan. It must not
      // create a year-specific AI research target with an invented edition.
      if(!catalogYear&&!sourcePlan)continue;
      const target={schoolName:entry.school,programName:entry.title,level,modality,...(catalogYear?{catalogYear}:{catalogLabel:model.catalog}),url:value};
      choices.push(sourcePlan?{target,existingPlan:{pathwayId,modelId:entry.id,title:entry.title,school:entry.school,level,modality,totalCredits:model.totalCredits,institutionMinCredits:model.institutionMinCredits,externalMaxCredits:model.externalMaxCredits},sourcePlan}:{target});
    }
  }
  const unique=[...new Map(choices.map(choice=>[[choice.target.schoolName,choice.target.programName,choice.target.level,choice.target.modality,choice.target.catalogYear].join('|'),choice])).values()];
  if(unique.length===1)return unique[0];
  return unique.length?{needsChoice:true,choices:unique.map(choice=>choice.target)}:null;
}
async function findExistingReadyTemplate(input) {
  if(!curriculumRegistrySnapshot)curriculumRegistrySnapshot=JSON.parse(await decodeStaticAsset(assets['/data/curriculum-registry.json']));
  const identity=canonicalSchoolName,year=catalogIdentity;
  const entries=curriculumRegistrySnapshot.models.filter(entry=>entry.readyTemplate===true&&entry.status==='reviewed'&&identity(entry.school)===identity(input.schoolName)&&entry.modalities?.includes(input.modality)&&canonicalDegreeTitle(entry.title)===canonicalDegreeTitle(input.programName));
  const matches=[];
  for(const entry of entries){
    const model=await registryModel(entry);
    if(!model||(entry.level||degreeLevel(model.level))!==input.level||year(model.catalogYear||model.catalog)!==year(input.catalogYear))continue;
    if(!await knownSourcePlan(entry,entry.routeIds[0],input.modality,model))continue;
    matches.push({pathwayId:entry.routeIds[0],modelId:entry.id,title:entry.title,school:entry.school});
  }
  return matches.length===1?matches[0]:null;
}

async function researchEnvironment(env){
  initializePublicAssets(env);
  const references=await researchReferenceData(),result={...env,TEMPLATE_FIND_EXISTING:findExistingReadyTemplate,TEMPLATE_RESOLVE_LINK:resolveKnownDegreeLink,TEMPLATE_VALIDATE_ACADEMICS:artifact=>validateAcademicTemplate(artifact,{Planner:TemplateAcademicPlanner}),TEMPLATE_CHECK_PRIVATE_PLAN:checkPrivateResearchPlan,TEMPLATE_REFERENCE_FOR_URL:url=>findResearchReference(references,url,{includeStaleChoiceIdentity:true}),TEMPLATE_CHECK_REFERENCE:(artifact,url,choiceId)=>checkResearchReference(artifact,findResearchReference(references,url,{includeStaleChoiceIdentity:true}),{choiceId}),TEMPLATE_CREDIT_SOURCES:await creditSourceDiscovery()};
  try{result.AI_CONNECTION_AVAILABLE=(await resolveAIConnection(env,{includeKey:false})).configured;}catch{result.AI_CONNECTION_AVAILABLE=false;}
  result.AI_CONNECTION_RESOLVE_KEY=async()=>{const connection=await resolveAIConnection(env,{includeKey:true});return connection.apiKey||null;};
  result.RESEARCH_EXECUTE_JOB=(job,execution)=>runTemplateResearchJob(result,job,execution);
  return result;
}
// Degree coach (beta): small public build artifacts only. Never curriculum packs, accounts or student records.
async function coachData(){
  if(!coachDataSnapshot){
    const read=async path=>{const asset=assets[path];if(!asset)throw Error('Coach data is unavailable');return JSON.parse(await decodeStaticAsset(asset));};
    const [library,index,knowledge]=await Promise.all(['/data/plan-library-index.json','/data/coach-index.json','/data/coach-knowledge.json'].map(read));
    coachDataSnapshot={library,index,knowledge};
  }
  return coachDataSnapshot;
}
async function coachResponse(request,env){
  // With COACH_ENABLED unset the handler answers 404 before reading identity, data or keys.
  if(env?.COACH_ENABLED!=='1')return handleCoach(request,{});
  const identity=await resolvePortalIdentity(request,env).catch(()=>({user:null,setCookies:[]}));
  const response=await handleCoach(request,{...env,COACH_USER:identity?.user||null,COACH_DATA:coachData,COACH_RESOLVE_KEY:async()=>(await resolveAIConnection(env,{includeKey:true})).apiKey||null});
  if(!identity?.setCookies?.length)return response;
  const headers=new Headers(response.headers);for(const cookie of identity.setCookies)headers.append('Set-Cookie',cookie);
  return new Response(response.body,{status:response.status,headers});
}
// School inquiries and plan review requests (both off unless their flag is 1): plan titles and school names from the
// public coach index, and the allowlist and offer from /data/lead-settings.json. Never plans, rankings or accounts.
let leadsDataSnapshot;
async function leadsData(){
  if(!leadsDataSnapshot){
    const read=async path=>{const asset=assets[path];if(!asset)throw Error('Lead settings are unavailable');return JSON.parse(await decodeStaticAsset(asset));};
    const [index,settings]=await Promise.all([read('/data/coach-index.json'),read('/data/lead-settings.json')]);
    leadsDataSnapshot={plans:Object.fromEntries(Object.entries(index.plans||{}).map(([id,plan])=>[id,{title:plan?.title,school:plan?.school}])),settings};
  }
  return leadsDataSnapshot;
}
async function leadsResponse(request,env,path){
  const leadsEnv={...env,LEADS_DATA:leadsData};
  if(!path.startsWith('/api/admin/'))return handleLeads(request,leadsEnv);
  const identity=await resolvePortalIdentity(request,env);
  if(identity.unavailable)return Response.json({error:'Sign-in is temporarily unavailable. Please try again.',code:'auth_unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Retry-After':'15'}});
  const privateEnv={...leadsEnv,PORTAL_USER:identity.user};
  const business=await loadOwnerModule(),denied=await business.authorizeConsoleOwner(request,privateEnv);
  const response=denied||await handleLeads(request,privateEnv);
  if(!identity.setCookies?.length)return response;
  const headers=new Headers(response.headers);for(const cookie of identity.setCookies)headers.append('Set-Cookie',cookie);
  return new Response(response.body,{status:response.status,headers});
}
// These callbacks read immutable public reports or configuration state. No
// account records, credentials or private student plans enter the asset cache.
async function ownerPublicReport(kind,env){
  const read=async path=>{if(!assets[path])throw Error('Public build report unavailable');return JSON.parse(await decodeStaticAsset(assets[path]));};
  if(kind==='offers')return read('/data/student-offers.json');
  if(kind==='overview'){
    const [quality,providers]=await Promise.all([read('/data/pathway-quality-report.json'),read('/data/provider-coverage-report.json')]);
    return{counts:{'Ready degree plans':quality.summary.publicationReady,'Curriculum models (including research)':quality.summary.models,'Indexed credit providers':providers.summary.indexedProviders,'Indexed course identities':providers.summary.indexedIdentities},publicationReadyPlans:quality.summary.publicationReady,curriculumModels:quality.summary.models,indexedProviders:providers.summary.indexedProviders,directoryProviders:providers.summary.directoryProviders,indexedCourseIdentities:providers.summary.indexedIdentities,asOf:quality.asOf,source:'reviewed-build-reports'};
  }
  let aiConfigured=null;try{aiConfigured=(await resolveAIConnection(env,{includeKey:false})).configured;}catch{}
  const operations={databaseConfigured:!!env.DB,researchQueueConfigured:typeof env.RESEARCH_QUEUE?.send==='function',deadLetterQueueConfigured:typeof env.RESEARCH_DEAD_LETTER_QUEUE?.send==='function',emailAlertsEnabled:env.EMAIL_ALERTS_ENABLED==='1',emailConfigured:!!env.RESEND_API_KEY,aiConfigured,billingBalance:null,providerBalance:null,source:'runtime-configuration'};
  if(kind==='operations')return operations;
  if(kind==='settings')return{...operations,publicOrigin:'https://degreesteps.com',studentHelpUrl:'/help.html',sitemapUrl:'https://degreesteps.com/sitemap.xml',authProvider:'supabase'};
  return null;
}
function ownerEnvironment(env,business){return{...env,OWNER_PUBLIC_ORIGIN:'https://degreesteps.com',OWNER_PUBLIC_DATA:kind=>ownerPublicReport(kind,env),OWNER_GET_OFFER_REGISTRY:()=>ownerPublicReport('offers',env),OWNER_OFFER_POLICY:business.ownerOfferPolicy};}
async function ownerPublicResponse(request,env){
  const url=new URL(request.url),path=url.pathname;
  const content=path==='/insights/'||/^\/insights\/[a-z0-9-]+\/$/.test(path)||['/api/content/articles','/api/content/faqs','/data/student-offers.json'].includes(path);
  if(!content||!['GET','HEAD'].includes(request.method))return null;
  const json=value=>Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}),fail=(status,message)=>{throw Object.assign(Error(message),{status});};
  if(!env.DB){if(path==='/data/student-offers.json')return null;return Response.json({error:'Student articles are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  try{const business=await loadOwnerModule(),privateEnv=ownerEnvironment(env,business),response=await business.publicOwnerContent(request,privateEnv,{db:env.DB,url,now:Date.now(),json,fail,env:privateEnv,publicOrigin:privateEnv.OWNER_PUBLIC_ORIGIN,offerPolicy:business.ownerOfferPolicy,getOfferRegistry:privateEnv.OWNER_GET_OFFER_REGISTRY});return response&&request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;}
  catch{if(path==='/data/student-offers.json')return null;return Response.json({error:'Student articles are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
// Growth measurement accepts a plan id only when it is in the public plan library index (a small build artifact).
let growthPlanIdsSnapshot;
async function growthPlanIds(){
  if(!growthPlanIdsSnapshot){const asset=assets['/data/plan-library-index.json'];if(!asset)throw Error('Plan index is unavailable');growthPlanIdsSnapshot=new Set(Object.keys(JSON.parse(await decodeStaticAsset(asset)).plans||{}));}
  return growthPlanIdsSnapshot;
}
// Email plan alerts (off unless EMAIL_ALERTS_ENABLED=1). Public build data only: the plan index, registry titles,
// public plan pages and the curriculum model's publication fingerprint. Never student records.
async function alertPlanData(){
  if(!alertPlanDataSnapshot){
    const read=async path=>{const asset=assets[path];if(!asset)throw Error('Plan alert data is unavailable');return JSON.parse(await decodeStaticAsset(asset));};
    const index=await read('/data/plan-library-index.json');if(!curriculumRegistrySnapshot)curriculumRegistrySnapshot=await read('/data/curriculum-registry.json');
    const registry=new Map((curriculumRegistrySnapshot.models||[]).map(entry=>[entry.id,entry])),plans=index.plans||{},entryFor=id=>Object.hasOwn(plans,id)?registry.get(plans[id].modelId):null;
    alertPlanDataSnapshot={plans,
      titleFor:id=>{const entry=entryFor(id);return entry?entry.title+(entry.school?' — '+entry.school:''):'';},
      pageFor:id=>/^[a-z0-9-]{1,128}$/.test(id)&&Boolean(assets['/degree-plans/'+id+'/index.html']),
      modelFingerprint:async id=>{const entry=entryFor(id);if(!entry)return '';const model=await registryModel(entry);return model?TemplateProgramCatalog.publicationModelFingerprint(model,plans[id].level):'';}};
  }
  return alertPlanDataSnapshot;
}
function alertEnvironment(env){return{...env,ALERTS_PLAN_DATA:alertPlanData,ALERTS_GROWTH:value=>recordGrowthEvent(env,value)};}
async function alertsResponse(request,env){
  const target=new URL(request.url),alertEnv=alertEnvironment(env);
  // Unsubscribe links work from email without a sign-in; the random token is the only credential.
  if(target.pathname==='/api/alerts/unsubscribe')return handlePlanAlerts(request,alertEnv);
  const identity=await resolvePortalIdentity(request,env);
  if(identity.unavailable)return Response.json({error:'Sign-in is temporarily unavailable. Your saved plans have not changed. Please try again.',code:'auth_unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Retry-After':'15'}});
  const portalEnv={...env,PORTAL_USER:identity.user,PORTAL_USER_ACCESS_TOKEN:identity.accessToken,PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:identity.configured};
  // Ownership is checked through the same portal handler (D1 or Supabase with the student's own session and RLS).
  const owner=async portalPlanId=>{
    const response=await handlePortal(new Request(target.origin+'/api/portal/plans/'+encodeURIComponent(portalPlanId),{method:'GET'}),portalEnv);
    if(response.status===404||response.status===400)return{owned:false};
    if(!response.ok)throw Error('Saved plans are unavailable');
    const state=(await response.json())?.item?.state;return{owned:true,pathwayId:String(state?.selectedPathwayId||state?.profile?.pathwayId||'')};
  };
  const response=await handlePlanAlerts(request,{...alertEnv,ALERTS_USER:identity.user||null,ALERTS_PLAN_OWNER:owner});
  if(!identity.setCookies?.length)return response;
  const headers=new Headers(response.headers);for(const cookie of identity.setCookies)headers.append('Set-Cookie',cookie);
  return new Response(response.body,{status:response.status,headers});
}
function migrationReadOnly(env){return env?.OPERATOR_MIGRATION_READ_ONLY==='1';}
function migrationReadOnlyResponse(request){
  return new Response(request.method==='HEAD'?null:JSON.stringify({error:'We’re finishing a site update. Your saved work is safe. Please try again shortly.',code:'migration_readonly'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Retry-After':'120'}});
}
export default {
  async queue(batch,env,ctx){
    if(migrationReadOnly(env)){
      // Returning normally would implicitly acknowledge delivered messages.
      // Keep every message pending until the source freeze is lifted.
      if(typeof batch.retryAll==='function')batch.retryAll({delaySeconds:120});
      else for(const message of batch.messages||[])message.retry({delaySeconds:120});
      return;
    }
    return processResearchJobs(batch,await researchEnvironment(env),ctx);
  },
  async scheduled(controller,env,ctx){if(migrationReadOnly(env))return;ctx?.waitUntil?.(pruneGrowthMetrics(env).catch(()=>{}));const minute=new Date(controller?.scheduledTime||Date.now()).getUTCMinutes();if(minute<2){ctx?.waitUntil?.(pruneCoach(env).catch(()=>{}));ctx?.waitUntil?.(pruneLeads(env).catch(()=>{}));}if(env?.EMAIL_ALERTS_ENABLED==='1'&&minute>=30&&minute<32){initializePublicAssets(env);ctx?.waitUntil?.(runPlanAlerts(alertEnvironment(env)).catch(()=>{}));}return dispatchResearchOutbox(await researchEnvironment(env),{limit:10});},
  async fetch(request, env, ctx) {
    const target = new URL(request.url);
    if(target.hostname==='www.degreesteps.com'||target.hostname==='degreesteps.com'&&target.protocol!=='https:'){
      target.protocol='https:';target.hostname='degreesteps.com';return Response.redirect(target.href,308);
    }
    const previewHost=target.hostname.endsWith('.workers.dev');
    if(previewHost&&target.pathname==='/robots.txt'&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:'User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=60, must-revalidate','X-Robots-Tag':'noindex, nofollow'}});
    // GET handlers can also upsert profiles/rate records. During a final source
    // snapshot, pause the entire application API before identity or data access.
    if(target.pathname==='/api/coach'||target.pathname.startsWith('/api/coach/')){
      if(env?.COACH_ENABLED!=='1')return handleCoach(request,{});
      if(migrationReadOnly(env))return migrationReadOnlyResponse(request);
      initializePublicAssets(env);
      return coachResponse(request,env);
    }
    if(isLeadsPath(target.pathname)){
      // With both flags unset these routes answer 404 before reading identity, data or the database.
      if(env?.SCHOOL_INQUIRIES_ENABLED!=='1'&&env?.PLAN_REVIEW_ENABLED!=='1')return handleLeads(request,{});
      if(migrationReadOnly(env))return migrationReadOnlyResponse(request);
      initializePublicAssets(env);
      return leadsResponse(request,env,target.pathname);
    }
    if(target.pathname==='/api/alerts'||target.pathname.startsWith('/api/alerts/')){
      if(env?.EMAIL_ALERTS_ENABLED!=='1')return handlePlanAlerts(request,{});
      if(migrationReadOnly(env))return migrationReadOnlyResponse(request);
      initializePublicAssets(env);
      return alertsResponse(request,env);
    }
    if(migrationReadOnly(env)&&(target.pathname==='/api'||target.pathname.startsWith('/api/'))&&!target.pathname.startsWith('/api/auth/')&&!target.pathname.startsWith('/api/operations/'))return migrationReadOnlyResponse(request);
    initializePublicAssets(env);
    if(['/sitemap.xml','/sitemap-site.xml','/sitemap-insights.xml'].includes(target.pathname)&&env.DB){
      const business=await loadOwnerModule();return business.handleOwnerSitemap(request,env,{business,readStaticXML:()=>decodeStaticAsset(assets['/sitemap.xml']),publicOrigin:'https://degreesteps.com'});
    }
    const publicContent=await ownerPublicResponse(request,env);if(publicContent)return publicContent;
    if(target.pathname==='/api/support/login-help'){
      const business=await loadOwnerModule();return business.handleSupport(request,{...env,PORTAL_USER:null});
    }
    if(target.pathname==='/api/growth/events')return handleGrowthMetrics(request,{...env,GROWTH_PLAN_IDS:growthPlanIds});
    if(target.pathname.startsWith('/api/operations/'))return await (await loadOwnerModule()).handleOperatorSnapshot(request,env)||Response.json({error:'Not found.'},{status:404,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
    if(target.pathname==='/api/catalog/degree-link'){
      const headers={'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'};
      if(request.method!=='GET')return Response.json({error:'Use GET to look up a public degree link.'},{status:405,headers:{...headers,Allow:'GET'}});
      const value=target.searchParams.get('url'),normalized=value&&value.length<=1500?linkIdentity(value):null;
      if(!normalized||[...target.searchParams.keys()].some(key=>key!=='url'))return Response.json({error:'Use one public HTTPS degree link.'},{status:400,headers:{...headers,'Cache-Control':'no-store'}});
      try{
        // Only preloaded public data is read here. This endpoint never launches AI or reads accounts.
        const result=await resolveKnownDegreeLink(normalized),reference=await researchReferenceForURL(normalized);
        const evidence=reference?.requiresRefresh?{referenceNeedsRefresh:true}:reference?{referenceAvailable:true,reference:{version:reference.version,matchedUrl:reference.matchedUrl,packets:reference.packets}}:{};
        return Response.json(result?{matched:true,...result,...evidence}:{matched:false,...evidence},{headers});
      }catch{return Response.json({error:'The saved degree sources could not be opened.'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
    }
    if(target.pathname==='/api/curriculum'){
      try{
        const catalog=await publicCatalogSnapshot(),program=(catalog.programs||[]).find(program=>program.id===target.searchParams.get('program'));
        const reviewedModels=program?await reviewedCurriculaFor(program.school):[];
        return handleCurriculumDiscovery(request,env,{catalog,reviewedModels});
      }catch{return Response.json({error:'The official curriculum could not be opened. Your saved plan has not changed.',code:'catalog_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
    }
    if(target.pathname.startsWith('/api/catalog/')){if(!programCatalogSnapshot){try{programCatalogSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/program-catalog.json']));}catch{}}return handleCatalog(request,programCatalogSnapshot);}
    if (target.pathname.startsWith('/api/auth/') || target.pathname.startsWith('/auth/')) {
      const authResponse = await handleAuth(request,env);
      if (authResponse) return authResponse;
    }
    const templateAPI=target.pathname==='/api/templates'||target.pathname.startsWith('/api/templates/')||target.pathname==='/api/admin/templates'||target.pathname.startsWith('/api/admin/templates/');
    const connectionAPI=target.pathname==='/api/admin/ai-connection'||target.pathname==='/api/admin/ai-connection/test';
    const collegeAPI=target.pathname.startsWith('/api/colleges/')||target.pathname==='/api/admin/colleges';
    const transcriptAPI=target.pathname==='/api/portal/transcript-import';
    const coverageAPI=target.pathname==='/api/admin/academic-coverage'||target.pathname.startsWith('/api/admin/academic-coverage/');
    const growthAPI=target.pathname==='/api/admin/growth-summary';
    const ownerAPI=target.pathname==='/api/owner'||target.pathname.startsWith('/api/owner/'),supportAPI=target.pathname.startsWith('/api/support/'),adminAPI=target.pathname.startsWith('/api/admin/');
    if (target.pathname.startsWith('/api/portal/') || target.pathname.startsWith('/api/community/') || templateAPI || collegeAPI || connectionAPI || coverageAPI || growthAPI || ownerAPI || supportAPI || adminAPI) {
      const publicTemplateRead=request.method==='GET'&&(target.pathname==='/api/templates'||/^\/api\/templates\/tpl-[a-z0-9-]{5,80}$/.test(target.pathname));
      const identity = publicTemplateRead ? {configured:true,user:null,setCookies:[]} : await resolvePortalIdentity(request,env);
      if(identity.unavailable)return Response.json({error:'Sign-in is temporarily unavailable. Your saved plans have not changed. Please try again.',code:'auth_unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Retry-After':'15'}});
      const publicDiscussionCache=await publicCommunityCache(request,identity);
      if(publicDiscussionCache?.hit)return publicDiscussionCache.hit;
      const portalEnv = {...env,PORTAL_USER:identity.user,PORTAL_USER_ACCESS_TOKEN:identity.accessToken,PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:identity.configured,COLLEGE_ACCESS_ENABLED:true,TEMPLATE_FIND_EXISTING:findExistingReadyTemplate,TEMPLATE_RESOLVE_LINK:resolveKnownDegreeLink,TEMPLATE_VALIDATE_ACADEMICS:artifact=>validateAcademicTemplate(artifact,{Planner:TemplateAcademicPlanner}),TEMPLATE_CHECK_PRIVATE_PLAN:checkPrivateResearchPlan};
      let business,ownerDenied;
      if(ownerAPI||supportAPI||adminAPI){business=await loadOwnerModule();if(adminAPI)ownerDenied=await business.authorizeConsoleOwner(request,portalEnv);}
      // Stop before loading research configuration or touching business data.
      if(ownerDenied){const headers=new Headers(ownerDenied.headers);for(const cookie of identity.setCookies||[])headers.append('Set-Cookie',cookie);return new Response(ownerDenied.body,{status:ownerDenied.status,headers});}
      if(templateAPI)Object.assign(portalEnv,await researchEnvironment(env));
      if(transcriptAPI){try{const connection=await resolveAIConnection(env,{includeKey:false});portalEnv.TRANSCRIPT_AI_CONFIGURED=connection.configured;}catch{portalEnv.TRANSCRIPT_AI_CONFIGURED=false;}if(request.method==='POST')portalEnv.TRANSCRIPT_AI_RESOLVE_KEY=async()=>{const connection=await resolveAIConnection(env,{includeKey:true});return{apiKey:connection.apiKey,model:connection.model};};}
      let routedRequest=request;
      if (target.pathname.startsWith('/api/community/')) {
        const headers=new Headers(request.headers);
        headers.delete('oai-authenticated-user-id');
        headers.delete('oai-authenticated-user-email');
        if(identity.user){headers.set('oai-authenticated-user-id',identity.user.id);headers.set('oai-authenticated-user-email',identity.user.email || '');}
        routedRequest=new Request(request,{headers});
      }
      // The coverage handler authorizes the platform administrator before
      // invoking this immutable-asset loader. Student and guest traffic do not
      // load the research graph or read administrative review records.
      const response=ownerDenied|| (ownerAPI ? await business.handleOwnerConsole(routedRequest,ownerEnvironment(portalEnv,business)) : supportAPI ? await business.handleSupport(routedRequest,portalEnv) : growthAPI ? await handleGrowthMetrics(routedRequest,portalEnv) : coverageAPI ? await handleAcademicCoverage(routedRequest,portalEnv,academicCoverageData) : connectionAPI ? await handleAIConnections(routedRequest,portalEnv) : transcriptAPI ? await handleTranscriptImport(routedRequest,portalEnv) : templateAPI ? await handleTemplateResearch(routedRequest,portalEnv,ctx) : collegeAPI ? await handleCollegeAccess(routedRequest,portalEnv) : adminAPI ? Response.json({error:'Not found.'},{status:404,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}}) : target.pathname.startsWith('/api/portal/') ? await handlePortal(routedRequest,portalEnv,ctx) : await handleCommunity(routedRequest,portalEnv,ctx));
      publicDiscussionCache?.store(response,ctx);
      // Deleting a saved plan or all portal data also removes its email alerts (whether or not alerts are on).
      const deletedPlan=request.method==='DELETE'&&response.ok&&identity.user?.id&&target.pathname.match(/^\/api\/portal\/(?:plans\/([^/]+)|profile)$/);
      if(deletedPlan){let portalPlanId;try{portalPlanId=deletedPlan[1]?decodeURIComponent(deletedPlan[1]):undefined;}catch{portalPlanId=null;}if(portalPlanId!==null)await removePlanAlerts(env,{userId:identity.user.id,...(portalPlanId?{portalPlanId}:{})}).catch(()=>{});}
      if (!identity.setCookies?.length) return response;
      const headers=new Headers(response.headers);
      for(const cookie of identity.setCookies)headers.append('Set-Cookie',cookie);
      return new Response(response.body,{status:response.status,headers});
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    if (['/','/index.html'].includes(target.pathname) && ['template','shared','share'].some(name=>target.searchParams.has(name))) return Response.redirect(target.origin+'/portal.html'+target.search,302);
    if(target.pathname==='/index.html')return Response.redirect(target.origin+'/'+target.search,301);
    if(['/app','/portal'].includes(target.pathname))return Response.redirect(target.origin+'/portal.html'+target.search,302);
    if(['/login','/signup'].includes(target.pathname))return Response.redirect(target.origin+'/account.html'+target.search,302);
    let path=target.pathname==='/'?'/index.html':target.pathname;
    if(path.endsWith('/'))path+='index.html';
    if(!assets[path] && assets[path+'/index.html'] && !(path==='/plan-review'&&env?.PLAN_REVIEW_ENABLED!=='1'))return Response.redirect(target.origin+target.pathname+'/'+target.search,308);
    // The Plan review offer page exists only while PLAN_REVIEW_ENABLED is 1.
    const asset=path.startsWith('/plan-review/')&&env?.PLAN_REVIEW_ENABLED!=='1'?null:assets[path];
    if(!asset)return new Response('<!doctype html><html lang="en"><head>'+faviconLinks+'<meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — DegreeSteps</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/brand.css"></head><body><main class="site-container" style="padding:80px 24px"><h1>Let’s find your next step.</h1><p>This page could not be found.</p><p><a href="/">DegreeSteps home</a> · <a href="/resources/">Student resources</a> · <a href="/portal.html">Build my plan</a></p></main></body></html>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
    const privatePage=['/owner.html','/help.html','/portal.html','/plan.html','/account.html','/guided.html','/audit.html','/degree-audit.html','/compare-plans.html','/courses.html','/import-courses.html','/template-import.html','/request-plan.html','/admin.html','/coverage.html','/growth.html','/campuses.html','/ui-demo.html','/start.html'].includes(path);
    if(asset.external){
      if(!env.ASSETS?.fetch)return new Response('Public assets are temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
      const assetURL=new URL(request.url);assetURL.pathname=path;const delivered=await env.ASSETS.fetch(new Request(assetURL,{method:request.method,headers:request.headers}));
      const headers=new Headers(delivered.headers);headers.set('Content-Type',asset.type);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Cache-Control',privatePage?'no-store':path.endsWith('.html')?'public, max-age=60, must-revalidate':'public, max-age=300, must-revalidate');if(privatePage||previewHost)headers.set('X-Robots-Tag','noindex, nofollow');
      return new Response(delivered.body,{status:delivered.status,headers});
    }
    const compressed=asset.encoding==='gzip-base64',acceptGzip=compressed&&/\bgzip\b/i.test(request.headers.get('Accept-Encoding')||'');
    // Retire validators for responses that the edge previously compressed twice.
    const etag=compressed?asset.etag.replace(/"$/,'-encoding-v2"'):asset.etag;
    const headers={'Content-Type':asset.type,'Cache-Control':privatePage?'no-store':path.endsWith('.html')?'public, max-age=60, must-revalidate':'public, max-age=300, must-revalidate','ETag':etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
    if(compressed)headers.Vary='Accept-Encoding';
    if(acceptGzip)headers['Content-Encoding']='gzip';
    if(privatePage||previewHost)headers['X-Robots-Tag']='noindex, nofollow';
    if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers,encodeBody:'manual'});
    let body=null;
    if(request.method!=='HEAD')body=acceptGzip||asset.encoding==='base64'?Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0)):compressed?await decodeStaticAsset(asset):asset.body;
    // These bytes are already gzip encoded when Content-Encoding is present.
    return new Response(body,{headers,encodeBody:'manual'});
  }
};
