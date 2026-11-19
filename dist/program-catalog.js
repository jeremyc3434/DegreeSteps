/* Program availability is independent of verified course-transfer maps. */
(function(root,factory){const common=typeof module==='object'&&module.exports,api=factory(()=>common?require('./planner.js'):root.DegreePlanner);if(common)module.exports=api;else root.DegreeProgramCatalog=api;}(typeof globalThis!=='undefined'?globalThis:this,function(planner){
 'use strict';
 const modelFiles=Object.freeze(['data/tesu.json','data/liberty.json','data/liberty-criminal-justice-residential.json','data/liberty-criminal-justice-online.json']);
 const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function field(title){const s=String(title||'').toLowerCase().replace(/\b(?:bachelor|master|associate)(?:['’]s)?\s+of\s+(?:arts|science)\b/g,'');if(/nurs|health|medic|clinical|nutrition|therapy|counseling|social work/.test(s))return'health';if(/education|teaching|instruction|curriculum/.test(s))return'education';if(/aviation|aeronautic|pilot/.test(s))return'aviation';if(/juris|law|paralegal|legal studies/.test(s))return'law';if(/business|account|financ|marketing|human resources?|logistics|supply chain|entrepreneur|economics/.test(s))return'business';if(/computer|information tech|cyber|software|data|engineering/.test(s))return'technology';if(/business|account|financ|marketing|management|logistics|supply chain|leadership|entrepreneur|economics/.test(s))return'business';if(/psychology|sociology|criminal|political|government|social/.test(s))return'social-science';if(/biology|chemistry|physics|science|mathematics|geology|zoology/.test(s))return'science';if(/art|design|music|film|theatre|theater|acting|photograph|animation/.test(s))return'arts';if(/english|history|writing|religion|bible|biblical|theology|divinity|philosophy|language|apologetics/.test(s))return'humanities';return'general';}
 function merge(base,data){
  const existing=(Array.isArray(base?.pathways)?base.pathways:[]).map(route=>['Western Governors University','University of Maine at Presque Isle'].includes(route.school)?{...route,paceModel:route.paceModel||'competency-subscription'}:route),sources=new Map((data?.sources||[]).map(s=>[s.id,s]));
  const ids=new Set(existing.map(p=>p.id)),names=new Set(existing.map(p=>norm(p.school)+'|'+norm(p.title)));
  const added=[];
  for(const p of data?.programs||[]){if(!p.id||!p.school||!p.title||ids.has(p.id)||!p.catalogCollection&&names.has(norm(p.school)+'|'+norm(p.title)))continue;
   const f=field(p.title),goals=['any-degree','career-growth','change-career'];
   if(f==='education')goals.push('teacher');if(f==='aviation')goals.push('pilot');if(/juris doctor|j\.d\.|pre.?law/i.test(p.title))goals.push('lawyer');if(/nurs|clinical|medicine|physician|therapy|counseling|social work/i.test(p.title))goals.push('health-professional');
   const source=sources.get(p.sourceId);
   added.push({...p,field:f,fields:[f],goals,routeType:'catalog-program',summary:'Officially listed program. A degree-specific transfer map is still needed.',sources:[{title:'Official degree requirements and program listing',url:p.url},{title:'University program directory',url:source?.url||p.url}],constraints:['Confirm this exact degree’s current requirements, transfer limits, academic residency and delivery format.','A listing does not establish course equivalency, admission eligibility or professional licensure.'],proposedActions:['Open the official degree requirements.','Add your previous courses and request a school transfer evaluation.','Confirm outside-course matches before enrolling.'],mechanisms:[],catalogCheckedAt:source?.checkedAt||data.checkedAt,courseMapStatus:p.courseMapStatus||'not-mapped'});ids.add(p.id);names.add(norm(p.school)+'|'+norm(p.title));
  }
  return {...base,pathways:[...existing,...added],programDirectory:{version:data?.version,checkedAt:data?.checkedAt,expandedCheckedOn:data?.expandedCheckedOn,sources:data?.sources||[],programCount:data?.programs?.length||0,schools:data?.schools||[],expansionCoverage:data?.expansionCoverage||null}};
 }
 function search(data,query={}){let rows=(data?.programs||[]).filter(p=>(!query.school||norm(p.school)===norm(query.school)||p.schoolId===query.school)&&(!query.level||p.level===query.level)&&(!query.modality||p.modalities.includes(query.modality))&&(!query.q||norm(p.title).includes(norm(query.q))));rows=rows.sort((a,b)=>a.school.localeCompare(b.school)||a.title.localeCompare(b.title));const offset=Math.max(0,Math.min(100000,Number.parseInt(query.offset)||0)),limit=Math.max(1,Math.min(100,Number.parseInt(query.limit)||30));return{total:rows.length,offset,limit,checkedAt:data.checkedAt,programs:rows.slice(offset,offset+limit),scope:data.scope};}
 function variants(route,catalog){return(route?.planningVariants||[]).map(id=>(catalog?.pathways||[]).find(item=>item.id===id)).filter(Boolean);}
 function reviewedCreditBalance(model){if(model?.degreeCreditBalancePolicy?.enabled!==true)return null;try{return planner()?.creditBalancePolicy?.(model)||null;}catch{return null;}}
 function creditedOption(model,requirement,option,balance){
  if(Math.abs(option.credits-requirement.credits)<0.001)return true;
  if(!balance)return false;
  if(balance.balanceRequirementIds.includes(requirement.id))return requirement.options.length===1&&requirement.options[0]===option;
  const binding=balance.equivalencies.find(item=>item.requirementId===requirement.id);
  return Boolean(binding&&option.credits===binding.awardedCredits&&binding.options.some(item=>item.optionId===option.id&&item.provider===option.provider&&item.code===option.code));
 }
 function courseChoiceCounts(model){
  const rows=array(model?.requirements),sources=array(model?.sources);
  const onlyPlaceholders=row=>!array(row.options).some(option=>option&&!option.selectionRequired);
  const publishedFreeElective=row=>row.freeElective===true&&array(row.sourceIds).some(id=>sources.some(source=>source.id===id&&https(source.url)));
  return {openCourseChoices:rows.filter(row=>row.selectionRequired||onlyPlaceholders(row)).length,unresolvedRequiredChoices:rows.filter(row=>onlyPlaceholders(row)&&!publishedFreeElective(row)).length};
 }
 // Availability means a complete proposed requirement plan, not university approval.
 function modelReadiness(model){
  const rows=array(model?.requirements),total=model?.totalCredits;
  if(!model||!Number.isFinite(total)||total<=0||!rows.length)return {available:false,reason:'Requirements are not available.'};
  const balance=reviewedCreditBalance(model);
  if(model.degreeCreditBalancePolicy?.enabled===true&&!balance)return {available:false,reason:'The earned-credit balance lacks its reviewed GCU policy and course evidence.'};
  if(model.coverage==='partial'||rows.some(row=>row?.researchGap))return {available:false,reason:'Some degree requirements still need research.'};
  if(rows.some(row=>!identified(row?.id)||!present(row.title)||!Number.isFinite(row.credits)||row.credits<0||!array(row.options).some(option=>identified(option?.id)&&present(option.provider)&&Number.isFinite(option.credits)&&creditedOption(model,row,option,balance))))return {available:false,reason:'A requirement still needs a usable course choice.'};
  if(new Set(rows.map(row=>row.id)).size!==rows.length)return {available:false,reason:'Degree requirements have duplicate identifiers.'};
  const accounted=rows.reduce((sum,row)=>sum+row.credits,0);
  if(Math.abs(accounted-total)>0.001)return {available:false,reason:'The requirements do not account for the full degree.'};
  const choices=courseChoiceCounts(model);if(choices.unresolvedRequiredChoices)return {available:false,reason:'Required course choices still need selectable courses.',totalCredits:total,...choices};
  return {available:true,reason:'Complete proposed course plan.',totalCredits:total,...choices};
 }
 function isPlanAvailable(route,catalog,models=[]){
  if(!route||route.routeType==='career-guide'||route.intakeVerified===false||/approval.?pending|pending.?approval|upcoming|planned|coming.?soon|closed|inactive|discontinued|unavailable|not-available/.test(String(route.status||route.availability||'').toLowerCase()))return false;
  if(!route.modelId)return variants(route,catalog).some(child=>isPlanAvailable(child,catalog,models));
  const entry=array(catalog?.curriculumRegistry?.models).find(item=>item.id===route.modelId&&array(item.routeIds).includes(route.id));
  // A model identifier alone is not evidence that all requirements are mapped.
  if(!entry||entry.coverage!=='complete'||entry.readyTemplate!==true||entry.unresolvedRequiredChoices!==0)return false;
  const model=array(models).find(item=>item.id===route.modelId);
  return !model||modelReadiness(model).available;
 }
 function availablePlans(catalog,models=[]){return array(catalog?.pathways).filter(route=>route.modelId&&isPlanAvailable(route,catalog,models));}
 function planChoiceCount(route,catalog,models=[]){
  const model=array(models).find(item=>item.id===route?.modelId);if(model){const readiness=modelReadiness(model);return readiness.available?readiness.openCourseChoices:null;}
  const entry=array(catalog?.curriculumRegistry?.models).find(item=>item.id===route?.modelId),count=entry?.openCourseChoices??route?.openCourseChoices;
  return Number.isInteger(count)&&count>=0?count:null;
 }
 // A saved version identifies the degree, never a copy of the student's records.
 function targetIdentity(state,draft={}){
  const profile=state?.profile||{},selected=state?.selectedPathwayId||profile.pathwayId,offered=draft.pathway||{},given=offered.id===selected&&(offered.school&&(profile.school||profile.schoolChoice)&&norm(offered.school)!==norm(profile.school||profile.schoolChoice)||offered.title&&profile.degree&&norm(offered.title)!==norm(profile.degree))?{id:selected}:offered,givenId=given.id==='custom-target'&&selected?selected:given.id||selected;
  const remembered=state?.targetIdentity?.version===1&&state.targetIdentity.route?.id===givenId&&norm(state.targetIdentity.route.school)===norm(profile.school||profile.schoolChoice)&&norm(state.targetIdentity.route.title)===norm(profile.degree)?state.targetIdentity.route:{};
  const route={...remembered,...given,id:givenId},model=draft.program||{};
  const school=route.school||profile.school||profile.schoolChoice,title=route.title||profile.degree;
  if(!identified(givenId)||!present(school)||!present(title))return null;
  const modalities=array(route.modalities).filter(mode=>['online','campus'].includes(mode));if(!modalities.length&&['online','campus'].includes(profile.modality))modalities.push(profile.modality);
  const identity={version:1,route:{id:givenId,school,title,level:route.level||model.level||profile.degreeLevel||'unsure',modalities,creditSystem:route.creditSystem||model.creditSystem||(['semester','quarter','competency-unit'].includes(profile.creditSystem)?profile.creditSystem:null),catalog:route.catalog||model.catalog||profile.catalog||'',url:route.url||profile.sourceUrl||'',...(route.modelId?{modelId:route.modelId}:{}),...(route.field?{field:route.field}:{}),...(Array.isArray(route.fields)?{fields:route.fields.filter(value=>typeof value==='string')}:{}),...(Array.isArray(route.goals)?{goals:route.goals.filter(value=>typeof value==='string')}:{}),...(Array.isArray(route.stageLevels)?{stageLevels:route.stageLevels.filter(value=>typeof value==='string')}:{}),routeType:route.routeType||(!route.modelId?'custom':'degree'),...(route.sources?{sources:array(route.sources).map(source=>({title:source.title||'',url:source.url||''}))}:{})},profile:{entry:profile.entry||'target',school:profile.school||school,schoolChoice:profile.schoolChoice||school,degree:profile.degree||title,pathwayId:givenId,degreeLevel:profile.degreeLevel||route.level||'unsure',field:profile.field||'any'}};
  return copy(identity);
 }
 function targetFingerprint(identity){const route=identity?.route||{},value=JSON.stringify([norm(route.school),norm(route.title),norm(route.level),array(route.modalities).slice().sort(),route.creditSystem||'',norm(route.catalog)]);let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
 function planHistoryId(state,draft,prefix='before-switch:'){const identity=targetIdentity(state,draft);return identity?prefix+identity.route.id+':'+targetFingerprint(identity):prefix+(draft?.pathway?.id||state?.selectedPathwayId||state?.profile?.pathwayId||'');}
 function planSnapshot(state,draft,options={}){
  const identity=targetIdentity(state,draft);if(!identity)throw Error('The previous degree identity could not be read. Your current plan has not been replaced.');
  const route=identity.route,pathway=draft?.pathway||{},same=pathway.id===route.id&&(!pathway.school||norm(pathway.school)===norm(route.school))&&(!pathway.title||norm(pathway.title)===norm(route.title)),key=same?pathway.modelId||pathway.id:route.modelId||route.id;
  return{id:options.id||planHistoryId(state,draft),label:String(options.label||'Previous plan · '+route.title).trim().slice(0,120),pathwayId:route.id,targetIdentity:identity,priority:state.profile?.priority,settings:copy(state.scenarios?.[key]||{}),savings:copy(state.savings?.[key]||{}),savedAt:new Date().toISOString()};
 }
 function rememberPlan(state,draft){
  if(state?.sheet?.isExample||!draft?.pathway?.id||!targetIdentity(state,draft))return state;
  const next=JSON.parse(JSON.stringify(state)),id=planHistoryId(state,draft),rows=Array.isArray(next.whatIf?.snapshots)?next.whatIf.snapshots:[],existing=rows.find(row=>row.id===id);
  if(rows.length>=20&&!existing)return state;
  const snapshot=planSnapshot(state,draft,{id});
  next.whatIf={...next.whatIf,version:1,snapshots:[...rows.filter(row=>row.id!==id),snapshot]};return next;
 }
 function resolveTarget(state,catalog){
  const id=state?.selectedPathwayId||state?.profile?.pathwayId,route=(catalog?.pathways||[]).find(item=>item.id===id),choices=variants(route,catalog);
  const remembered=state?.targetIdentity?.version===1&&state.targetIdentity.route?.id===id?state.targetIdentity.route:null;
  if(remembered&&route&&(norm(remembered.school)!==norm(route.school)||norm(remembered.title)!==norm(route.title)||remembered.level&&route.level&&norm(remembered.level)!==norm(route.level)||remembered.modelId&&route.modelId&&remembered.modelId!==route.modelId||remembered.creditSystem&&route.creditSystem&&remembered.creditSystem!==route.creditSystem||remembered.catalog&&route.catalog&&norm(remembered.catalog)!==norm(route.catalog)))return{state,resolved:false,variants:[]};
  if(!choices.length)return{state,resolved:false,variants:choices};
  const mode=state.profile?.modality!=='any'?state.profile?.modality:state.profile?.classroomImportance==='essential'?'campus':null;
  const chosen=choices.find(item=>mode&&item.modalities?.includes(mode));
  if(!chosen)return{state,resolved:false,variants:choices};
  const next=JSON.parse(JSON.stringify(state));next.selectedPathwayId=chosen.id;
  delete next.targetIdentity;
  next.profile={...next.profile,school:chosen.school,schoolChoice:chosen.school,degree:chosen.title,pathwayId:chosen.id,field:chosen.field,degreeLevel:chosen.level};
  next.journey={...next.journey,planReviewed:false,schoolContacted:false,resolvedProgramId:route.id,answers:{...next.journey?.answers,school:chosen.school,degree:chosen.id}};
  next.sheet={...next.sheet,isExample:false};
  return{state:next,resolved:true,variants:choices};
 }
 const registryURL='data/curriculum-registry.json';
 const legacyEntries=modelFiles.map(path=>({id:({'data/tesu.json':'tesu-general-management','data/liberty.json':'liberty-business-residential'})[path]||path.replace(/^data\//,'').replace(/\.json$/,''),path,routeIds:[],status:'reviewed'}));
 const defaultCache={files:new Map(),registries:new Map()},fetchCaches=new WeakMap();
 const runtimeCurricula=new Map();
 const copy=value=>JSON.parse(JSON.stringify(value));
 const array=value=>Array.isArray(value)?value:[];
 const identified=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['__proto__','constructor','prototype'].includes(value);
 const present=value=>typeof value==='string'&&value.trim().length>0;
 const creditUnits=['semester','quarter','competency-unit'];
 const levels=['associate','bachelor','master','doctorate','specialist'];
 const modes=value=>Array.isArray(value)&&value.every(mode=>['online','campus'].includes(mode));
 const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const dateOnly=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 function localJSON(path){return typeof path==='string'&&/^data\/[A-Za-z0-9_./-]+\.json$/.test(path)&&!path.split('/').includes('..')&&!path.includes('//');}
 function https(url){try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password;}catch{return false;}}
 function cacheFor(options){if(!options.fetcher)return defaultCache;let cache=fetchCaches.get(options.fetcher);if(!cache){cache={files:new Map(),registries:new Map()};fetchCaches.set(options.fetcher,cache);}return cache;}
 async function jsonFile(path,options={}){const cache=cacheFor(options),fetcher=options.fetcher||globalThis.fetch;if(typeof fetcher!=='function')throw Error('Curriculum fetching is unavailable.');if(!cache.files.has(path))cache.files.set(path,Promise.resolve().then(()=>fetcher(path)).then(async response=>{if(!response.ok){const error=Error('Could not load '+path+'.');error.status=response.status;throw error;}return response.json();}).catch(error=>{cache.files.delete(path);throw error;}));return cache.files.get(path);}
 function validateRegistry(value){
  if(!value||value.version!==1||!Array.isArray(value.models)||value.routes!==undefined&&!Array.isArray(value.routes))throw Error('The reviewed curriculum registry is invalid.');
  const ids=new Set(),routes=new Set();
  const models=value.models.map(entry=>{
   if(!entry||!identified(entry.id)||ids.has(entry.id)||!localJSON(entry.path)||!Array.isArray(entry.routeIds)||entry.routeIds.some(id=>!identified(id))||new Set(entry.routeIds).size!==entry.routeIds.length||entry.status==='reviewed'&&(!entry.routeIds.length||!present(entry.school))||entry.modalities!==undefined&&!modes(entry.modalities)||entry.creditUnit!==undefined&&!creditUnits.includes(entry.creditUnit)||entry.readyTemplate!==undefined&&typeof entry.readyTemplate!=='boolean'||entry.unresolvedRequiredChoices!==undefined&&(!Number.isInteger(entry.unresolvedRequiredChoices)||entry.unresolvedRequiredChoices<0||entry.unresolvedRequiredChoices>200)||entry.openCourseChoices!==undefined&&(!Number.isInteger(entry.openCourseChoices)||entry.openCourseChoices<0||entry.openCourseChoices>200)||entry.degreeCredits!==undefined&&(!Number.isFinite(entry.degreeCredits)||entry.degreeCredits<=0||entry.degreeCredits>500))throw Error('A curriculum registry entry has invalid or duplicate identifiers.');
   const legacy=legacyEntries.find(item=>item.id===entry.id);if(legacy&&legacy.path!==entry.path)throw Error('A curriculum registry cannot replace an established curriculum.');
   ids.add(entry.id);
   // Only reviewed entries activate automatic plans. Pending entries may remain
   // in the registry without claiming that a degree is ready to build.
   if(entry.status==='reviewed')for(const id of entry.routeIds){if(routes.has(id))throw Error('A degree is assigned to more than one reviewed curriculum.');routes.add(id);}
   return copy(entry);
  });
  const declared=new Set();for(const route of array(value.routes)){if(!identified(route?.id)||declared.has(route.id)||!present(route.school)||!present(route.title)||!https(route.url)||!levels.includes(route.level)||!modes(route.modalities)||route.parentId!==undefined&&(!identified(route.parentId)||route.parentId===route.id))throw Error('A reviewed degree variant has invalid source metadata.');declared.add(route.id);}
  return {...copy(value),models};
 }
 function attachRegistry(base,value){
  const index=validateRegistry(value),byRoute=new Map();
  for(const entry of index.models.filter(entry=>entry.status==='reviewed'))for(const id of entry.routeIds)byRoute.set(id,entry);
  const available=array(base?.pathways).map(copy),byId=new Map(available.map(route=>[route.id,route]));
  for(const declared of array(index.routes)){const existing=byId.get(declared.id);if(existing){if(norm(existing.school)!==norm(declared.school)||norm(existing.title)!==norm(declared.title)||existing.level&&existing.level!==declared.level||existing.url&&existing.url!==declared.url)throw Error('A reviewed variant conflicts with an existing degree identity.');continue;}const parent=declared.parentId?byId.get(declared.parentId):null;if(declared.parentId&&(!parent||norm(parent.school)!==norm(declared.school)))throw Error('A reviewed degree variant has no matching school and parent.');const f=field(declared.title),route={...(parent?copy(parent):{}),...copy(declared),field:parent?.field||f,fields:parent?.fields||[f],goals:parent?.goals||['any-degree','career-growth','change-career'],routeType:'reviewed-curriculum',courseMapStatus:'not-mapped',sources:[{title:'Official program requirements',url:declared.url}]};delete route.modelId;delete route.planningVariants;available.push(route);byId.set(route.id,route);if(parent)parent.planningVariants=[...new Set([...array(parent.planningVariants),route.id])];}
  const pathways=available.map(route=>{const entry=byRoute.get(route.id);if(!entry)return route;if(entry.school&&norm(entry.school)!==norm(route.school))throw Error('A reviewed curriculum belongs to a different school than its degree listing.');
   if(route.modelId&&route.modelId!==entry.id)throw Error('The registry would replace an existing degree curriculum with another model.');
   const modalities=array(entry.modalities).filter(mode=>['online','campus'].includes(mode));
   return {...route,modelId:entry.id,courseMapStatus:entry.coverage==='complete'?'mapped':'partial',curriculumCheckedOn:entry.checkedOn||index.checkedOn,curriculumCoverage:entry.coverage||'partial',readyTemplate:entry.readyTemplate===true,unresolvedRequiredChoices:entry.unresolvedRequiredChoices,...(Number.isInteger(entry.openCourseChoices)?{openCourseChoices:entry.openCourseChoices}:{}),...(entry.pricing?{pricing:copy(entry.pricing)}:{}),...(Number.isFinite(entry.degreeCredits)?{degreeCredits:entry.degreeCredits,creditUnit:entry.creditUnit}:{}),...(entry.paceModel?{paceModel:entry.paceModel}:{}),...(!array(route.modalities).length&&modalities.length?{modalities}:{} )};
  });
  return {...base,pathways,curriculumRegistry:{version:index.version,checkedOn:index.checkedOn,available:true,modelCount:index.models.filter(entry=>entry.status==='reviewed').length,models:index.models.filter(entry=>entry.status==='reviewed').map(entry=>({id:entry.id,routeIds:[...entry.routeIds],school:entry.school,title:entry.title,coverage:entry.coverage||'partial',readyTemplate:entry.readyTemplate===true,unresolvedRequiredChoices:entry.unresolvedRequiredChoices,...(Number.isInteger(entry.openCourseChoices)?{openCourseChoices:entry.openCourseChoices}:{})}))}};
 }
 async function readRegistry(options={}){
  if(options.index)return validateRegistry(options.index);
  const cache=cacheFor(options),path=options.indexUrl||registryURL;if(!localJSON(path))throw Error('Choose a local curriculum registry.');
  if(!cache.registries.has(path))cache.registries.set(path,jsonFile(path,options).then(validateRegistry).catch(error=>{cache.registries.delete(path);throw error;}));return cache.registries.get(path);
 }
 async function loadIndex(base,options={}){
  try{return attachRegistry(base,await readRegistry(options));}
  catch(error){if(options.required)throw error;return {...base,curriculumRegistry:{available:false,modelCount:0,error:error.message}};}
 }
 function validateModel(model,entry){
  if(!model||model.id!==entry.id||!identified(model.id)||!present(model.school)||!present(model.title)||!Number.isFinite(model.totalCredits)||model.totalCredits<=0||model.totalCredits>500||!creditUnits.includes(model.creditSystem||'semester')||!Array.isArray(model.requirements)||!model.requirements.length||!Array.isArray(model.sources)||!model.sources.length)throw Error('A reviewed curriculum is incomplete or does not match its registry entry.');
  if(entry.school&&norm(entry.school)!==norm(model.school))throw Error('A curriculum source belongs to a different school.');
  if(entry.degreeCredits!==undefined&&Math.abs(entry.degreeCredits-model.totalCredits)>0.001||entry.creditUnit&&entry.creditUnit!==(model.creditSystem||'semester'))throw Error('A curriculum credit total or unit does not match its registry entry.');
  const sourceIds=new Set();for(const source of model.sources){if(!identified(source?.id)||sourceIds.has(source.id)||!https(source.url))throw Error('A curriculum has an invalid source reference.');sourceIds.add(source.id);}
  const balance=reviewedCreditBalance(model);
  if(model.degreeCreditBalancePolicy?.enabled===true&&!balance)throw Error('A curriculum earned-credit balance lacks its reviewed GCU policy and course evidence.');
  const sourced=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>sourceIds.has(id));
  if(model.creditConversions!==undefined&&!Array.isArray(model.creditConversions))throw Error('A curriculum credit conversion lacks valid source evidence.');
  for(const conversion of array(model.creditConversions))if(!creditUnits.includes(conversion?.from)||!creditUnits.includes(conversion.to)||conversion.from===conversion.to||!Number.isFinite(conversion.ratio)||conversion.ratio<=0||!sourced(conversion.sourceIds))throw Error('A curriculum credit conversion lacks valid source evidence.');
  for(const name of ['institutionMinCredits','upperMinCredits','externalMaxCredits','alternativeMaxCredits'])if(model[name]!=null&&(!Number.isFinite(model[name])||model[name]<0||model[name]>model.totalCredits))throw Error('A curriculum has an invalid credit policy limit.');
  const requirementIds=new Set();let credits=0;
  for(const requirement of model.requirements){if(!identified(requirement?.id)||requirementIds.has(requirement.id)||!present(requirement.title)||!Number.isFinite(requirement.credits)||requirement.credits<0||!Array.isArray(requirement.options)||!requirement.options.length&&!requirement.researchGap||requirement.sourceIds!==undefined&&!sourced(requirement.sourceIds))throw Error('A curriculum has invalid requirement allocations.');requirementIds.add(requirement.id);credits+=requirement.credits;const optionIds=new Set();
   for(const option of requirement.options){if(!identified(option?.id)||optionIds.has(option.id)||!present(option.provider)||!present(option.title)||!Number.isFinite(option.credits)||!creditedOption(model,requirement,option,balance)||!['published','conditional'].includes(option.evidence)||!sourced(option.sourceIds)||option.identitySourceIds!==undefined&&!sourced(option.identitySourceIds)||option.creditSystem!==undefined&&option.creditSystem!==(model.creditSystem||'semester')||option.sourceCredits!==undefined&&(!Number.isFinite(option.sourceCredits)||option.sourceCredits<=0||!creditUnits.includes(option.sourceCreditSystem))||option.sourceCreditSystem!==undefined&&option.sourceCredits===undefined)throw Error('A curriculum option lacks a reviewed credit award or valid evidence.');optionIds.add(option.id);}
  }
  if(model.residencyPolicy!==undefined){
   const rule=model.residencyPolicy,bound=rule?.conservativeSufficientCondition,ids=rule?.capstoneRequirementIds;
   if(model.creditSystem!=='competency-unit'||rule?.type!=='institution-fraction-with-capstone-exclusion'||rule.creditSystem!==undefined&&rule.creditSystem!==model.creditSystem||!Number.isFinite(rule.fraction)||rule.fraction<=0||rule.fraction>1||!sourced(rule.sourceIds)||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||!Number.isFinite(bound?.basisCredits)||Math.abs(bound.basisCredits-model.totalCredits)>0.001||!Number.isFinite(bound.minimumNonCapstoneInstitutionCUs)||Math.abs(bound.minimumNonCapstoneInstitutionCUs-bound.basisCredits*rule.fraction)>0.001)throw Error('A curriculum has an unsupported capstone-exclusion residency calculation.');
   const capstones=ids.map(id=>model.requirements.find(row=>row.id===id)),capstoneCredits=capstones.reduce((sum,row)=>sum+(row?.credits||0),0);
   if(capstones.some(row=>!row||row.institutionalOnly!==true||row.credits<=0)||!Number.isFinite(rule.capstoneCredits)||Math.abs(rule.capstoneCredits-capstoneCredits)>0.001||bound.minimumNonCapstoneInstitutionCUs+capstoneCredits>model.totalCredits)throw Error('A curriculum residency calculation needs exact university-only capstone requirements.');
   if(rule.interpretationStatus==='verified-additional-capstone'&&(!Number.isFinite(rule.calculatedMinimumInstitutionCUs)||Math.abs(rule.calculatedMinimumInstitutionCUs-bound.minimumNonCapstoneInstitutionCUs-capstoneCredits)>0.001))throw Error('The published residency fraction and additional capstone do not match the calculated minimum.');
  }
  if(Math.abs(credits-model.totalCredits)>0.001)throw Error('The curriculum allocations do not add up to its published credit total.');
  return copy(model);
 }
 async function loadModels(ids=[],options={}){
  let index;try{index=await readRegistry(options);}catch(error){if(options.required)throw error;index={models:[]};}
  const reviewed=index.models.filter(entry=>entry.status==='reviewed'),byId=new Map(reviewed.map(entry=>[entry.id,entry])),byRoute=new Map(reviewed.flatMap(entry=>entry.routeIds.map(id=>[id,entry]))),legacyById=new Map(legacyEntries.map(entry=>[entry.id,entry]));
  const wanted=new Map(options.includeLegacy===false?[]:legacyEntries.map(entry=>[entry.id,entry]));
  for(const id of array(ids)){const entry=byId.get(id)||byRoute.get(id)||legacyById.get(id)||runtimeCurricula.get(id);if(!entry)throw Error('No sourced curriculum is registered for '+String(id)+'.');wanted.set(entry.id,entry);}
  return Promise.all([...wanted.values()].map(async entry=>{if(entry.runtimeModel)return validateModel(entry.runtimeModel,entry);const payload=await jsonFile(entry.path,options),models=Array.isArray(payload)?payload:Array.isArray(payload?.models)?payload.models:[payload],model=models.find(model=>model?.id===entry.id);return validateModel(model,entry);}));
 }
 function validateDiscovery(value){
  if(value?.version!==1||value.status!=='ready'||!identified(value.programId)||!sha256(value.source?.hash)||!sha256(value.source?.requirementsHash)||value.model?.id!=='source-curriculum-'+value.source.requirementsHash.slice(0,32)||value.route?.id!==value.programId+'-source-'+value.source.requirementsHash.slice(0,16)||!identified(value.route.id)||value.route.parentId!==value.programId||value.route.modelId!==value.model.id||!present(value.route.school)||!present(value.route.title)||!levels.includes(value.route.level)||!modes(value.route.modalities)||!https(value.source.url)||value.route.url!==value.source.url||!dateOnly(value.source.checkedOn)||value.source.reviewStatus!=='automated-public-source'||value.source.algorithm!==undefined&&value.source.algorithm!=='sha256')throw Error('The university requirement response is incomplete.');
  const model=validateModel(value.model,{id:value.model.id,school:value.route.school});
  if(norm(model.title)!==norm(value.route.title)||model.level&&model.level!==value.route.level||!model.sources.some(source=>source.url===value.source.url)||model.sourceDiscovery&&(model.sourceDiscovery.programId!==value.programId||model.sourceDiscovery.requirementsHash!==value.source.requirementsHash||model.sourceDiscovery.hash!==value.source.hash||model.sourceDiscovery.url!==value.source.url))throw Error('The university requirement identity does not match its source.');
  if(value.variant!==undefined&&!/^[a-f0-9]{16}$/.test(value.variant))throw Error('Choose a university-provided curriculum variant.');
  model.completeExecutablePathway=false;model.sourceStatus='automated-public-source';
  return {version:1,status:'ready',programId:value.programId,model,route:{...copy(value.route),modelId:model.id,sourceStatus:'automated-public-source',sourceProgramId:value.programId},source:{url:value.source.url,hash:value.source.hash,requirementsHash:value.source.requirementsHash,algorithm:'sha256',checkedOn:value.source.checkedOn,reviewStatus:'automated-public-source'},...(value.variant?{variant:value.variant}:{})};
 }
 function sourceModels(state){const models=new Map();for(const value of array(state?.sourceCurricula)){try{const model=validateDiscovery(value).model;models.set(model.id,model);}catch{}}return [...models.values()];}
 function attachSourceCurricula(base,state){
  const pathways=array(base?.pathways).map(copy),byId=new Map(pathways.map(route=>[route.id,route]));
  for(const raw of array(state?.sourceCurricula)){let value;try{value=validateDiscovery(raw);}catch{continue;}const existing=byId.get(value.route.id),parent=byId.get(value.programId);if(!parent||norm(parent.school)!==norm(value.route.school)||parent.level&&parent.level!==value.route.level)continue;if(existing&&(existing.modelId!==value.model.id||norm(existing.school)!==norm(value.route.school)||existing.parentId!==value.programId))continue;
   const inherited=existing||parent||{},route={...copy(inherited),...value.route,field:inherited.field||field(value.route.title),fields:inherited.fields||[field(value.route.title)],goals:inherited.goals||['any-degree','career-growth','change-career'],courseMapStatus:'source-imported',sourceStatus:'automated-public-source',curriculumCheckedOn:value.source.checkedOn};
   delete route.planningVariants;if(existing)pathways[pathways.findIndex(item=>item.id===route.id)]=route;else pathways.push(route);byId.set(route.id,route);parent.planningVariants=[...new Set([...array(parent.planningVariants),route.id])];runtimeCurricula.set(value.model.id,{id:value.model.id,school:value.model.school,runtimeModel:value.model});
  }
  return {...base,pathways};
 }
 function rememberDiscovery(state,result){
  const value=validateDiscovery(result),next=copy(state),entries=array(next.sourceCurricula).filter(item=>item.model?.id!==value.model.id);
  if(entries.length>=5)throw Error('Keep at most five catalog imports in one saved workspace. Export a backup before removing an older import.');entries.push(value);
  if(new TextEncoder().encode(JSON.stringify(entries)).byteLength>300000)throw Error('These catalog imports exceed the workspace size limit. Keep a private backup before reducing the saved imports.');
  next.sourceCurricula=entries;
  if(new TextEncoder().encode(JSON.stringify(next)).byteLength>480000)throw Error('This saved workspace is too large for an account copy. Export a backup and remove unused imports before adding another.');
  return next;
 }
 async function discover(route,options={}){
  if(!identified(route?.id))throw Error('Choose a listed degree before importing its requirements.');
  if(options.variant&&!/^[a-f0-9]{16}$/.test(options.variant))throw Error('Choose a university-provided curriculum variant.');
  const path='api/curriculum?program='+encodeURIComponent(route.id)+(options.variant?'&variant='+encodeURIComponent(options.variant):''),cache=cacheFor(options),fetcher=options.fetcher||globalThis.fetch;
  if(!cache.discoveries)cache.discoveries=new Map();if(options.force)cache.discoveries.delete(path);if(!cache.discoveries.has(path))cache.discoveries.set(path,(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetcher(path,{signal:controller.signal});let data;try{data=await response.json();}catch{throw Error('The university requirements could not be read.');}if(!response.ok)return {status:'needs-audit',programId:route.id,reason:present(data?.error)?data.error:present(data?.reason)?data.reason:'The university requirements could not be imported automatically.'};if(data?.programId!==route.id||!['ready','choose-variant','needs-audit'].includes(data.status))throw Error('The university response does not match the selected degree.');if(data.status==='ready'){const value=validateDiscovery({...data,...(options.variant?{variant:options.variant}:{})});if(route.school&&norm(route.school)!==norm(value.route.school)||route.level&&route.level!==value.route.level)throw Error('The university response belongs to a different degree.');return value;}if(data.status==='choose-variant'){const ids=new Set();if(!Array.isArray(data.variants)||!data.variants.length||data.variants.length>80||data.variants.some(variant=>!variant||!/^[a-f0-9]{16}$/.test(variant.id)||ids.has(variant.id)||!ids.add(variant.id)||!present(variant.title)||!https(variant.url)||!modes(variant.modalities)||!https(data.source?.url)||new URL(variant.url).hostname!==new URL(data.source.url).hostname))throw Error('The university format choices could not be verified.');}return copy(data);}catch(error){return {status:'needs-audit',programId:route.id,reason:error.name==='AbortError'?'The university source took too long to respond. You can build from your degree audit.':error.message};}finally{clearTimeout(timer);}})());const pending=cache.discoveries.get(path),result=await pending;if(result.status==='needs-audit'&&cache.discoveries.get(path)===pending)cache.discoveries.delete(path);return copy(result);
 }
 function modelsForRoutes(routes,options={}){return loadModels([...new Set(array(Array.isArray(routes)?routes:routes?.pathways).filter(route=>route?.modelId).map(route=>route.modelId))],options);}
 async function load(base,options={}){return loadIndex(merge(base,await jsonFile('data/program-catalog.json',options)),options);}
 return Object.freeze({merge,search,load,field,modelFiles,variants,courseChoiceCounts,modelReadiness,isPlanAvailable,availablePlans,planChoiceCount,resolveTarget,rememberPlan,targetIdentity,targetFingerprint,planHistoryId,planSnapshot,attachRegistry,loadIndex,loadModels,modelsForRoutes,validateRegistry,validateModel,discover,validateDiscovery,attachSourceCurricula,sourceModels,rememberDiscovery});
}));
