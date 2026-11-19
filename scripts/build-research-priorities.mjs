/** A deterministic, cross-school owner research backlog. This does not publish degree maps or launch paid research. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {assertProviderDiscovery} from './provider-directory-discovery.mjs';
const require=createRequire(import.meta.url),Catalog=require('../dist/program-catalog.js');
const root=resolve(import.meta.dirname,'..');
const paths={programCatalog:'dist/data/program-catalog.json',pathways:'dist/data/pathways.json',registry:'dist/data/curriculum-registry.json',quality:'dist/data/pathway-quality-report.json',schoolInsights:'content/school-insights.json',inventory:'content/research-batches/ace-inventory-2026-11-18.json',providerDiscovery:'dist/data/provider-directory-candidates.json'};
const outputs=['content/research-batches/research-priorities.json','dist/data/research-priorities.json'];
const list=v=>Array.isArray(v)?v:[],text=v=>typeof v==='string'?v.trim():'',copy=v=>JSON.parse(JSON.stringify(v)),num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const norm=v=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const schoolKey=name=>['purdueglobal','purdueuniversityglobal'].includes(norm(name))?'purdueglobal':norm(name);
const slug=v=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const digest=v=>createHash('sha256').update(v).digest('hex');
const secure=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const uniqueURLs=values=>[...new Set(values.map(secure).filter(Boolean))].sort();
const day=value=>/^20\d{2}-\d{2}-\d{2}$/.test(text(value))?value:null;
const groups=[
 ['substantial-transfer-campus-map-gap','High-transfer campus pathways need maps','A campus institution has a sourced institutional transfer ceiling of at least 60 credits and unresolved program coverage. This threshold prioritizes research; it does not establish a degree-specific transfer percentage.'],
 ['alternative-credit-map-gap','Published alternative-credit routes need maps','A school publishes accepted or case-by-case alternative-credit information, but degree mappings or publication review remain incomplete. Acceptance is not a degree placement.'],
 ['competency-self-paced-map-gap','Self-paced and competency routes need review','Published self-paced or competency formats have missing degree maps or review findings. Source eligibility and graduate rules remain program-specific.'],
 ['existing-model-review','Finish review of existing models','A degree model exists but has not passed the publication review. Resolve its actual findings rather than start another outline.'],
 ['campus-transfer-policy-review','Campus routes need exact policy or course evidence','Campus availability is known, but a usable exact transfer map or its policy scope needs research. Unknown ceilings remain unknown.'],
 ['online-transfer-policy-review','Online routes need exact policy or course evidence','Online availability is known, but exact receiving requirements and usable transfer options are not yet complete.'],
 ['catalog-evidence-review','Resolve directory and delivery evidence','A listed program lacks enough explicit delivery, policy or model evidence to assign a stronger research group.'],
 ['maintain-publication-ready','Maintain reviewed, publication-ready models','The exact model passed the existing publication checks. Continue source monitoring without calling all other programs at its school verified.'],
 ['inventory-candidate-review','Review staged inventory discoveries','These records come from the uploaded research inventory and have not been independently cleared for publication. Future, partial, prerequisite and credential scopes remain distinct.']
].map(([id,label,reason],order)=>({id,label,reason,order}));
const order=new Map(groups.map(g=>[g.id,g.order]));
const accepted=channel=>['accepted','case-by-case'].includes(channel.status)&&Boolean(secure(channel.sourceUrl));
function policyChannels(raw){
 const result={};for(const kind of ['institutional','ace','nccrs','graduate']){
  const p=raw?.[kind]&&typeof raw[kind]==='object'?copy(raw[kind]):{};
  const reportedStatus=['accepted','case-by-case','not-accepted','not-verified'].includes(p.status)?p.status:'not-verified',sourceUrl=secure(p.sourceUrl),status=sourceUrl?reportedStatus:'not-verified',sourced=status!=='not-verified'&&Boolean(sourceUrl);
  result[kind]={...p,status,reportedStatus,reportedMaximumCredits:num(p.maximumCredits),maximumCredits:sourced?num(p.maximumCredits):null,unit:sourced?(text(p.unit)||text(p.creditUnit)||null):null,sourceUrl,notes:text(p.notes),scope:'Reported school-level policy; exact degree, catalog, format and source applicability require review.'};
 }return result;
}
function action(kind,label){return {id:kind,label,kind};}
function modelPolicy(model){
 const sources=new Map(list(model?.sources).map(s=>[s.id,s]));
 const urlsFor=ids=>list(ids).length&&list(ids).every(id=>secure(sources.get(id)?.url))?uniqueURLs(ids.map(id=>sources.get(id).url)):[];
 const reviewed=field=>{const evidence=model?.policyEvidence?.[field];return evidence&&evidence.value===model?.[field]&&evidence.creditSystem===model?.creditSystem?urlsFor(evidence.sourceIds):[];};
 const totalSources=reviewed('externalMaxCredits').length?reviewed('externalMaxCredits'):urlsFor(model?.policySourceIds),altSources=reviewed('alternativeMaxCredits').length?reviewed('alternativeMaxCredits'):urlsFor(model?.alternativeCapSourceIds);
 return {scope:'Exact degree model only; not a school-wide acceptance claim.',degreeQuantity:num(model?.totalCredits),unit:text(model?.creditSystem)||null,totalTransferMaximum:totalSources.length?num(model?.externalMaxCredits):null,alternativeCreditMaximum:altSources.length?num(model?.alternativeMaxCredits):null,totalLimitSourceUrls:totalSources,alternativeLimitSourceUrls:altSources};
}
function chooseGroup({publicationReady,modelId,modalities,school,level,sourceStatus,coveredByVariantIds}){
 if(publicationReady)return 'maintain-publication-ready';
 if(list(coveredByVariantIds).length)return 'existing-model-review';
 if(sourceStatus==='staged-inventory-only')return 'inventory-candidate-review';
 const undergrad=['associate','bachelor'].includes(level),campus=modalities.includes('campus'),channels=school.transferEvidence;
 if(undergrad&&campus&&accepted(channels.institutional)&&channels.institutional.maximumCredits!==null&&channels.institutional.maximumCredits>=60)return 'substantial-transfer-campus-map-gap';
 if(undergrad&&(accepted(channels.ace)||accepted(channels.nccrs)))return 'alternative-credit-map-gap';
 if(school.paceModels.some(v=>['self-paced','competency-subscription'].includes(v)))return 'competency-self-paced-map-gap';
 if(modelId)return 'existing-model-review';
 if(campus)return 'campus-transfer-policy-review';
 if(modalities.includes('online'))return 'online-transfer-policy-review';
 return 'catalog-evidence-review';
}
export function buildResearchPriorities(input){
 const {programCatalog={},pathways={},registry={},quality={},schoolInsights={},inventory={},models=[]}=input;
 const providerDiscovery=input.providerDiscovery?copy(assertProviderDiscovery(input.providerDiscovery)):null;
 const fingerprints=Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>[name,digest(JSON.stringify(value))]));
 const inputDays=[programCatalog.checkedAt,programCatalog.expandedCheckedOn,registry.checkedOn,quality.asOf,schoolInsights.compiledOn,inventory.sourceDate,inventory.stagedOn,...models.flatMap(m=>[m.checkedOn,m.mappingCheckedOn,m.evidenceCheckedOn])].map(day).filter(Boolean).sort();
 const asOf=inputDays.at(-1)||'2026-11-19';
 const merged=Catalog.attachRegistry(Catalog.merge({pathways:list(pathways.pathways)},programCatalog),registry);
 const schoolMap=new Map(),profileMap=new Map(list(schoolInsights.schools).map(s=>[schoolKey(s.name),s]));
 function ensureSchool(name,details={}){
  const key=schoolKey(name);if(!key||/^choose\b/i.test(name))return null;
  if(!schoolMap.has(key)){const profile=profileMap.get(key),sources=new Map(list(profile?.sources).map(s=>[s.id,s]));schoolMap.set(key,{id:text(details.id)||text(profile?.id)||slug(name),name,sourceStatus:'existing-catalog-or-model',deliveryModes:[],paceModels:[],transferEvidence:policyChannels(details.transferPolicy),profileTransferSummary:profile?.transferPolicy?{label:text(profile.transferPolicy.label),note:text(profile.transferPolicy.note),evidenceUrls:uniqueURLs(list(profile.transferPolicy.sourceIds).map(id=>sources.get(id)?.url))}:null,evidenceUrls:[],programIds:[],coverage:{directoryPrograms:0,programCount:0,models:0,availableTemplates:0,publicationReady:0,unmappedPrograms:0,needsResearchPrograms:0}});}
  const school=schoolMap.get(key);school.deliveryModes=[...new Set([...school.deliveryModes,...list(details.deliveryModes).filter(m=>['campus','online'].includes(m))])].sort();school.paceModels=[...new Set([...school.paceModels,...list(details.paceModels)])].sort();
  if(details.transferPolicy)school.transferEvidence=policyChannels(details.transferPolicy);
  school.evidenceUrls=uniqueURLs([...school.evidenceUrls,details.url,...list(details.sources).map(s=>s.url),...Object.values(school.transferEvidence).map(c=>c.sourceUrl),...list(school.profileTransferSummary?.evidenceUrls)]);
  return school;
 }
 for(const school of list(programCatalog.schools))ensureSchool(school.name,school);
 for(const p of list(programCatalog.programs)){const s=ensureSchool(p.school);if(s)s.coverage.directoryPrograms++;}
 const modelMap=new Map(models.map(m=>[m.id,m])),registryMap=new Map(list(registry.models).map(m=>[m.id,m])),qualityMap=new Map(list(quality.programs).map(p=>[p.modelId,p]));
 const programs=[],careerGuides=[];
 for(const route of list(merged.pathways)){
  const school=ensureSchool(route.school);if(!school){careerGuides.push({id:route.id,title:route.title,status:'career-stage-guide-needs-institution'});continue;}
  const modelId=text(route.modelId)||null,entry=registryMap.get(modelId),model=modelMap.get(modelId),q=qualityMap.get(modelId);
  const publicationReady=q?.publication?.ready===true,availableTemplate=entry?.readyTemplate===true;
  const modalities=[...new Set(list(route.modalities).filter(m=>['campus','online'].includes(m)))].sort();
  school.deliveryModes=[...new Set([...school.deliveryModes,...modalities])].sort();if(text(route.paceModel))school.paceModels=[...new Set([...school.paceModels,route.paceModel])].sort();
  const evidenceUrls=uniqueURLs([route.url,...list(route.sources).map(s=>s.url),...list(model?.sources).map(s=>s.url)]);
  const status=publicationReady?'publication-ready':availableTemplate?'available-proposed-template':modelId?'model-needs-research':'directory-only';
  const tasks=[];if(!modalities.length)tasks.push(action('resolve-delivery','Resolve the exact online or campus program format.'));
  if(!modelId)tasks.push(action('map-degree-requirements','Capture the exact degree requirements, catalog and remaining university coursework.'));
  if(!publicationReady)tasks.push(action('map-transfer-options','Map eligible original courses to named requirements; apply source caps, residency, major and upper-level rules.'));
  if(modelId&&!publicationReady)tasks.push(action('resolve-model-findings','Resolve this model’s recorded publication findings: '+(list(q?.publication?.reasonCodes).join(', ')||'publication review not complete')+'.'));
  if(publicationReady)tasks.push(action('monitor-sources','Maintain the reviewed source versions and rerun academic validation after changes.'));
  const program={id:route.id,parentId:route.parentId||null,schoolId:school.id,title:route.title,level:text(route.level)||null,catalog:route.catalog||model?.catalog||null,modalities,sourceStatus:route.catalogCollection?'official-directory-listing':modelId?'existing-degree-model':'curated-pathway',coverageStatus:status,groupId:null,modelId,availableTemplate,publicationReady,publicationReasonCodes:list(q?.publication?.reasonCodes),programPolicy:modelPolicy(model),evidenceUrls,nextActions:tasks,limitsAreNotCoursePlacements:true};
  programs.push(program);school.programIds.push(program.id);
 }
 // Each program is grouped after the school’s full known delivery/pace data is
 // assembled. No inferred popularity, campus rating or keyword volume is used.
 // Use explicit parent links only. A similarly named model is not coverage.
 for(const parent of programs){
  if(parent.modelId||!parent.modalities.length)continue;
  const children=programs.filter(child=>child.parentId===parent.id&&child.schoolId===parent.schoolId&&child.level===parent.level&&child.availableTemplate);
  if(!children.length||!parent.modalities.every(mode=>children.some(child=>child.modalities.includes(mode))))continue;
  parent.coveredByVariantIds=children.map(child=>child.id).sort();parent.coverageStatus='covered-by-planning-variant';
  parent.nextActions=[action('review-existing-variant','Review the existing mapped planning variant before starting duplicate degree research: '+parent.coveredByVariantIds.join(', ')+'.')];
 }
 for(const p of programs){const s=[...schoolMap.values()].find(s=>s.id===p.schoolId);p.groupId=chooseGroup({...p,school:s});}
 const inventoryCandidates=list(inventory.scenarios).map(s=>{const priorities=list(inventory.candidatePriorities),prioritized=priorities.some(p=>schoolKey(p.school)===schoolKey(s.school)&&p.degree===s.degree&&p.catalog===s.catalog);return {id:s.id,school:s.school,degree:s.degree,catalog:s.catalog,provider:s.provider,scope:s.scope,mappedReceivingQuantity:s.mappedReceivingQuantity,receivingUnit:s.receivingUnit,workbookDegreeQuantity:s.workbookDegreeQuantity,evidenceUrls:list(s.evidenceUrls),verificationStatus:'staged-unreviewed',publicationAllowed:false,prioritized,groupId:'inventory-candidate-review'};}).sort((a,b)=>Number(b.prioritized)-Number(a.prioritized)||a.school.localeCompare(b.school)||a.degree.localeCompare(b.degree)||a.provider.localeCompare(b.provider));
 for(const school of schoolMap.values()){
  const rows=programs.filter(p=>p.schoolId===school.id),ids=[...new Set(rows.map(p=>p.modelId).filter(Boolean))];
  school.programIds.sort();school.coverage={...school.coverage,programCount:rows.length,models:ids.length,availableTemplates:ids.filter(id=>registryMap.get(id)?.readyTemplate===true).length,publicationReady:ids.filter(id=>qualityMap.get(id)?.publication?.ready===true).length,unmappedPrograms:rows.filter(p=>!p.modelId&&!list(p.coveredByVariantIds).length).length,needsResearchPrograms:rows.filter(p=>p.modelId&&!p.publicationReady).length};
  const pending=rows.filter(p=>!p.publicationReady);school.groupId=(pending.length?pending:rows).map(p=>p.groupId).sort((a,b)=>order.get(a)-order.get(b))[0]||'catalog-evidence-review';
  school.nextActions=[];
  const i=school.transferEvidence.institutional,a=school.transferEvidence.ace;
  if(school.deliveryModes.includes('campus')&&accepted(i)&&i.maximumCredits!==null&&i.maximumCredits>=60)school.nextActions.push(action('institutional-course-source-map','Build the campus route from eligible institutionally taught courses; the '+i.maximumCredits+'-credit policy ceiling is not an alternative-credit allowance.'));
  if(accepted(a))school.nextActions.push(action('alternative-credit-scope','Review exact alternative-credit eligibility'+(a.maximumCredits!==null?' and its separate '+a.maximumCredits+'-credit ceiling':'')+' before mapping courses.'));
  if(school.coverage.unmappedPrograms)school.nextActions.push(action('map-directory-gaps','Build exact degree maps for '+school.coverage.unmappedPrograms+' directory or curated program entries without models.'));
  if(school.coverage.needsResearchPrograms)school.nextActions.push(action('resolve-existing-models','Resolve remaining evidence and publication findings in '+school.coverage.needsResearchPrograms+' modeled program entries.'));
  if(!school.nextActions.length)school.nextActions.push(action('monitor-sources','Maintain current source versions and validate changed rules.'));
 }
 const schools=[...schoolMap.values()].sort((a,b)=>order.get(a.groupId)-order.get(b.groupId)||a.name.localeCompare(b.name));
 programs.sort((a,b)=>order.get(a.groupId)-order.get(b.groupId)||a.schoolId.localeCompare(b.schoolId)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 const priorityGroups=groups.map(g=>({...g,schoolCount:schools.filter(s=>s.groupId===g.id).length,programCount:programs.filter(p=>p.groupId===g.id).length,inventoryCandidateCount:inventoryCandidates.filter(p=>p.groupId===g.id).length}));
 const out={schemaRevision:'research-priorities-v1',revision:'',asOf,inputFingerprints:fingerprints,academicRegistryRevision:quality.registryRevision||null,scope:'Cross-school research prioritization from the existing directory, exact model registry, recorded publication checks and sourced policy channels. This static backlog does not publish a degree map, grant student credit, establish popularity or start a research job.',summary:{schools:schools.length,programs:programs.length,directoryPrograms:list(programCatalog.programs).length,modelPrograms:programs.filter(p=>p.modelId).length,availableTemplates:list(registry.models).filter(m=>m.readyTemplate===true).length,publicationReady:list(quality.programs).filter(p=>p.publication?.ready===true).length,unmappedPrograms:programs.filter(p=>!p.modelId&&!list(p.coveredByVariantIds).length).length,inventoryCandidates:inventoryCandidates.length,priorityInventoryDegreeCandidates:list(inventory.candidatePriorities).length,careerStageGuides:careerGuides.length},methodology:{ordering:'Transparent evidence/action groups; alphabetical ties. No popularity score or invented campus ratings.',substantialInstitutionalThreshold:60,thresholdMeaning:'A research triage heuristic in the source policy’s stated units. It is not proof that half of any exact degree transfers.',policyLimits:'Institutional, ACE, NCCRS and graduate rules remain separate, with exact program limits recorded only when bound to model sources.',unknowns:'Unknown maximums, units, formats and receiving awards stay unknown. Staged inventory quantities are claims awaiting independent review.',visibility:'Owner/reviewer planning backlog; not a student degree catalog or a live job queue.'},priorityGroups,schools,programs,inventoryCandidates,careerGuides,publicationAllowed:false,privateStudentRecordsIncluded:false,runtimeAiCalls:0};
 // Discovery is a separate, unpublished stage. It never enters the degree catalog,
 // inventory totals, existing school counts, model readiness or transfer-cap logic.
 if(providerDiscovery)out.providerDiscovery=providerDiscovery;
 out.revision='research-priorities-v1:'+digest(JSON.stringify(out));return out;
}
export async function readInputs(){
 const input={};for(const [key,path]of Object.entries(paths))input[key]=JSON.parse(await readFile(resolve(root,path),'utf8'));
 const packs=new Map();for(const entry of list(input.registry.models)){if(!packs.has(entry.path))packs.set(entry.path,JSON.parse(await readFile(resolve(root,'dist',entry.path),'utf8')));}
 const all=new Map();for(const pack of packs.values())for(const m of list(pack.models).length?pack.models:[pack])all.set(m.id,m);input.models=[...all.values()].sort((a,b)=>a.id.localeCompare(b.id));return input;
}
export async function buildResearchPriorityFiles({check=false}={}){
 const value=buildResearchPriorities(await readInputs()),bytes=JSON.stringify(value,null,2)+'\n';
 for(const file of outputs){const path=resolve(root,file);if(check){if(await readFile(path,'utf8')!==bytes)throw Error('Research priority artifact is stale: '+file);}else{await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}}
 return {revision:value.revision,asOf:value.asOf,summary:value.summary,outputs,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: node scripts/build-research-priorities.mjs [--check]');console.log(JSON.stringify(await buildResearchPriorityFiles({check:process.argv.includes('--check')})));}
