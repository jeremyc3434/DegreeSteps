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
import { handleOperatorSnapshot } from '../server/operator-snapshot.mjs';
import { assets } from './assets.generated.mjs';

let programCatalogSnapshot, curriculumRegistrySnapshot, degreeAliasSnapshot, basePathwaysSnapshot, resolvedPlanCatalogSnapshot, researchReferencesSnapshot, creditSourceDiscoverySnapshot;
// Public versioned build assets only. Never put account data or credentials in this cache.
let nativePublicAssets;
function initializePublicAssets(env){if(env?.ASSETS?.fetch)nativePublicAssets=env.ASSETS;}
const curriculumPackCache = new Map();
async function decodeStaticAsset(asset) {
  if(asset?.external){if(!nativePublicAssets)throw Error('Public asset storage is unavailable');const response=await nativePublicAssets.fetch(new Request('https://assets.degreesteps.internal'+asset.path));if(!response.ok)throw Error('Public build asset is unavailable');return response.text();}
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
  if(!basePathwaysSnapshot)basePathwaysSnapshot=JSON.parse(await decodeStaticAsset(assets['/data/pathways.json']));
  const catalog=await publicCatalogSnapshot();
  if(!resolvedPlanCatalogSnapshot)resolvedPlanCatalogSnapshot=TemplateProgramCatalog.attachRegistry(TemplateProgramCatalog.merge(basePathwaysSnapshot,catalog),curriculumRegistrySnapshot);
  const original=resolvedPlanCatalogSnapshot.pathways.find(route=>route.id===pathwayId);
  if(!original||!entry.routeIds.includes(pathwayId)||!entry.modalities.includes(modality))return null;
  const level=entry.level||degreeLevel(model.level),route={...original,modelId:entry.id,level,modalities:[modality],readyTemplate:true,courseMapStatus:'mapped'};
  try{
    const normalized={...model,level},providers=[...new Set((model.requirements||[]).flatMap(row=>(row.options||[]).map(option=>option.provider)))].filter(provider=>provider!=='University');
    const reference=original.url?await researchReferenceForURL(original.url):null;
    const scope={...normalized,schoolName:model.school,programName:model.title,modality,catalogYear:catalogIdentity(model.catalogYear||model.catalog)};
    if(reference&&checkResearchReference(scope,reference).length)return null;
    const plan=TemplateAcademicPlanner.generate(normalized,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
    if(plan.validation?.academicCountsValid!==true||plan.rows.length!==model.requirements.length||plan.rows.some(row=>!row.option||row.selectionRequired||!row.option.code||row.option.selectionRequired))return null;
    const sum=predicate=>plan.rows.filter(predicate).reduce((total,row)=>total+row.credits,0);
    return{route,model:normalized,summary:{totalCredits:model.totalCredits,requirementCount:model.requirements.length,sourceCount:(model.sources||[]).length,transferCredits:sum(row=>row.option.provider!=='University'),universityCredits:sum(row=>row.option.provider==='University'),upperCredits:sum(row=>row.option.upper===true),institutionMinCredits:model.institutionMinCredits,externalMaxCredits:model.externalMaxCredits,checkedOn:entry.checkedOn||model.evidenceCheckedOn||null},qualityReady:true};
  }catch{return null;}
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
  if(!programs.length&&!aliases.length)return null;
  // A directory URL can name many degrees. Never pick its one mapped degree by accident.
  const identities=new Set(programs.map(program=>[canonicalSchoolName(program.school),canonicalDegreeTitle(program.title),program.level].join('|')));
  if(!aliases.length&&identities.size!==1)return null;
  const choices=[];
  for(const entry of curriculumRegistrySnapshot.models.filter(entry=>entry.readyTemplate===true&&entry.status==='reviewed'&&(aliases.length?aliases.some(alias=>alias.modelId===entry.id&&entry.routeIds?.includes(alias.pathwayId)):entry.routeIds?.some(id=>programs.some(program=>program.id===id))))){
    const model=await registryModel(entry),catalogYear=catalogIdentity(model?.catalogYear||model?.catalog);
    if(!model||!catalogYear)continue;
    for(const modality of entry.modalities||[]){
      if(!['online','campus'].includes(modality))continue;
      const alias=aliases.find(alias=>alias.modelId===entry.id&&alias.modality===modality);if(aliases.length&&!alias)continue;
      const level=entry.level||degreeLevel(model.level),pathwayId=alias?.pathwayId||entry.routeIds[0];
      const target={schoolName:entry.school,programName:entry.title,level,modality,catalogYear,url:value};
      const sourcePlan=await knownSourcePlan(entry,pathwayId,modality,model);
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
export default {
  async queue(batch,env,ctx){return processResearchJobs(batch,await researchEnvironment(env),ctx);},
  async scheduled(controller,env,ctx){return dispatchResearchOutbox(await researchEnvironment(env),{limit:10});},
  async fetch(request, env, ctx) {
    initializePublicAssets(env);
    const target = new URL(request.url);
    if(target.pathname.startsWith('/api/operations/'))return await handleOperatorSnapshot(request,env)||Response.json({error:'Not found.'},{status:404,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
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
    if (target.pathname.startsWith('/api/portal/') || target.pathname.startsWith('/api/community/') || templateAPI || collegeAPI || connectionAPI) {
      const publicTemplateRead=request.method==='GET'&&(target.pathname==='/api/templates'||/^\/api\/templates\/tpl-[a-z0-9-]{5,80}$/.test(target.pathname));
      const identity = publicTemplateRead ? {configured:true,user:null,setCookies:[]} : await resolvePortalIdentity(request,env);
      if(identity.unavailable)return Response.json({error:'Sign-in is temporarily unavailable. Your saved plans have not changed. Please try again.',code:'auth_unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Retry-After':'15'}});
      const publicDiscussionCache=await publicCommunityCache(request,identity);
      if(publicDiscussionCache?.hit)return publicDiscussionCache.hit;
      const portalEnv = {...env,PORTAL_USER:identity.user,PORTAL_USER_ACCESS_TOKEN:identity.accessToken,PORTAL_AUTH_REQUIRED:true,PORTAL_AUTH_CONFIGURED:identity.configured,COLLEGE_ACCESS_ENABLED:true,TEMPLATE_FIND_EXISTING:findExistingReadyTemplate,TEMPLATE_RESOLVE_LINK:resolveKnownDegreeLink,TEMPLATE_VALIDATE_ACADEMICS:artifact=>validateAcademicTemplate(artifact,{Planner:TemplateAcademicPlanner}),TEMPLATE_CHECK_PRIVATE_PLAN:checkPrivateResearchPlan};
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
      const response=connectionAPI ? await handleAIConnections(routedRequest,portalEnv) : transcriptAPI ? await handleTranscriptImport(routedRequest,portalEnv) : templateAPI ? await handleTemplateResearch(routedRequest,portalEnv,ctx) : collegeAPI ? await handleCollegeAccess(routedRequest,portalEnv) : target.pathname.startsWith('/api/portal/') ? await handlePortal(routedRequest,portalEnv,ctx) : await handleCommunity(routedRequest,portalEnv,ctx);
      publicDiscussionCache?.store(response,ctx);
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
    if(!assets[path] && assets[path+'/index.html'])return Response.redirect(target.origin+target.pathname+'/'+target.search,308);
    const asset=assets[path];
    if(!asset)return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — DegreeSteps</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/brand.css"></head><body><main class="site-container" style="padding:80px 24px"><h1>Let’s find your next step.</h1><p>This page could not be found.</p><p><a href="/">DegreeSteps home</a> · <a href="/resources/">Student resources</a> · <a href="/portal.html">Build my plan</a></p></main></body></html>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
    const privatePage=['/portal.html','/plan.html','/account.html','/guided.html','/audit.html','/degree-audit.html','/compare-plans.html','/courses.html','/import-courses.html','/request-plan.html','/admin.html'].includes(path);
    if(asset.external){
      if(!env.ASSETS?.fetch)return new Response('Public assets are temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
      const assetURL=new URL(request.url);assetURL.pathname=path;const delivered=await env.ASSETS.fetch(new Request(assetURL,{method:request.method,headers:request.headers}));
      const headers=new Headers(delivered.headers);headers.set('Content-Type',asset.type);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Cache-Control',privatePage?'no-store':path.endsWith('.html')?'public, max-age=60, must-revalidate':'public, max-age=300, must-revalidate');if(privatePage)headers.set('X-Robots-Tag','noindex, nofollow');
      return new Response(delivered.body,{status:delivered.status,headers});
    }
    const compressed=asset.encoding==='gzip-base64',acceptGzip=compressed&&/\bgzip\b/i.test(request.headers.get('Accept-Encoding')||'');
    // Retire validators for responses that the edge previously compressed twice.
    const etag=compressed?asset.etag.replace(/"$/,'-encoding-v2"'):asset.etag;
    const headers={'Content-Type':asset.type,'Cache-Control':privatePage?'no-store':path.endsWith('.html')?'public, max-age=60, must-revalidate':'public, max-age=300, must-revalidate','ETag':etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
    if(compressed)headers.Vary='Accept-Encoding';
    if(acceptGzip)headers['Content-Encoding']='gzip';
    if(privatePage)headers['X-Robots-Tag']='noindex, nofollow';
    if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers,encodeBody:'manual'});
    let body=null;
    if(request.method!=='HEAD')body=acceptGzip||asset.encoding==='base64'?Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0)):compressed?await decodeStaticAsset(asset):asset.body;
    // These bytes are already gzip encoded when Content-Encoding is present.
    return new Response(body,{headers,encodeBody:'manual'});
  }
};
