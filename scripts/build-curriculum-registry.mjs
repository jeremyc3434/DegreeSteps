/* Compile researched requirements and exact receiving-school equivalencies.
 * No course or transfer award is inferred from a degree name. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {validateDocument as validateNamedAwards,scopeAllows as awardScopeAllows,outputPath as namedAwardsPath} from './build-liberty-named-awards.mjs';
import {validateDSSTAwards} from './liberty-dsst-awards.mjs';
import {applyLibertyAccountingNamedChoices} from './liberty-accounting-named-choices.mjs';
import {applyCourseListingIdentities} from './reviewed-course-identities.mjs';
import {supplementModel as applyReviewedLibertyMaps} from './add-liberty-official-mappings.mjs';
import {applyLibertyVerifiedBasics} from './liberty-verified-basics.mjs';
import {addLibertyCLIOptions,readLibertyCLIReview} from './add-liberty-cli-awards.mjs';
import {reviewedSourceDate} from './reviewed-source-date.mjs';
import {applyLibertyCurrentEvidence} from './liberty-current-evidence.mjs';
import {composeSharedAwards} from './shared-award-composition.mjs';
import {libertySharedAwardsPath} from './build-liberty-shared-awards.mjs';
import {applyLibertySharedPolicyResolutions} from './liberty-shared-policies.mjs';
import {compileScopedResearchNotices} from './pathway-quality.mjs';
import {addGCUTransferOptions} from './add-gcu-transfer-options.mjs';
import {addGCUInstitutionalOptions} from './add-gcu-institutional-options.mjs';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const Catalog=require('../dist/program-catalog.js');
const Planner=require('../dist/planner.js');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const list=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const slug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'');
const clone=v=>JSON.parse(JSON.stringify(v));
const positive=v=>Number.isFinite(v)&&v>0;
const check=process.argv.includes('--check');
const directory=await read('dist/data/program-catalog.json');
const base=await read('dist/data/pathways.json');
const routes=new Map([...list(base.pathways),...directory.programs].map(p=>[p.id,p]));
const gcuTransferReview=await read('content/research/gcu-sophia-review-2026-11-19.json');
const gcuInstitutionalReview=await read('content/research/gcu-institutional-maps-2026-11-19.json');
const shared=new Map();
function namespaceSourceReferences(value,known,rename,name=''){
  if(Array.isArray(value))return /sourceIds$/i.test(name)?value.map(id=>known.has(id)?rename(id):id):value.map(item=>namespaceSourceReferences(item,known,rename));
  if(typeof value==='string'&&/sourceId$/i.test(name))return known.has(value)?rename(value):value;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[name==='sourcePages'&&known.has(key)?rename(key):key,namespaceSourceReferences(item,known,rename,key)]));
  return value;
}
for(const file of Catalog.modelFiles){const model=await read('dist/'+file),rename=id=>model.id+'--'+id,sources=(model.sources||[]).map(s=>({...clone(s),id:rename(s.id)}));for(const req of model.requirements||[]){if(!req.code)continue;const id=key(model.school)+'|'+key(req.code);if(!shared.has(id))shared.set(id,[]);for(const option of req.options||[]){if(option.provider==='University')continue;const copy=namespaceSourceReferences(option,new Set((model.sources||[]).map(source=>source.id)),rename);shared.get(id).push({option:{...copy,receivingCode:copy.receivingCode||req.code,evidence:'conditional',mappingScope:'Same-school receiving-course award researched in another degree; exact degree and delivery-format application require confirmation.',conditions:[...list(copy.conditions),'This receiving-course award was researched for '+model.title+' ('+(model.format||'format requires confirmation')+'). Confirm current equivalency, course version, delivery format and application to this exact degree before purchase.']},creditSystem:model.creditSystem||'semester',degreeLevels:['associate','bachelor'],sourceModalities:modelModalities(model,list(base.pathways).filter(route=>route.modelId===model.id)),sources});}}}
const namedAwards=validateNamedAwards(await read(namedAwardsPath));
for(const award of namedAwards.awards){const id=key(namedAwards.school)+'|'+key(award.receivingCode);if(!shared.has(id))shared.set(id,[]);shared.get(id).push({option:clone(award),award,creditSystem:award.creditSystem,degreeLevels:award.degreeLevels,sources:namedAwards.sources.filter(source=>award.sourceIds.includes(source.id))});}
const dsstAwards=validateDSSTAwards(await read('content/transfer-awards/liberty-dsst-reviewed-2026-11-17.json'));
for(const award of dsstAwards.awards){const id=key(dsstAwards.school)+'|'+key(award.receivingCode);if(!shared.has(id))shared.set(id,[]);shared.get(id).push({option:clone(award),award,creditSystem:award.creditSystem,degreeLevels:award.degreeLevels,sources:dsstAwards.sources.filter(source=>[...award.sourceIds,...award.identitySourceIds].includes(source.id))});}
const libertyAccountingChoices=await read('content/curricula/snapshots/liberty/accounting-residential-named-choices-2026-2027-reviewed.json');
const libertyVerifiedBasics=await read('content/reviews/strong-route-known-basics-2026-11-17.json');
const libertyCLIReview=await readLibertyCLIReview();
const sharedAwardBundle=await read(libertySharedAwardsPath),sharedAwardReports=[];
function modelModalities(model,records){return /^online$/i.test(model.format||'')?['online']:/^(residential|campus|on campus)$/i.test(model.format||'')?['campus']:[...new Set(records.flatMap(record=>list(record.modalities)))];}
function sharedAwardApplies(match,model,records){
  const levels=[...new Set([model.level,...records.map(record=>record.level)].filter(Boolean))];
  if(!levels.length||match.degreeLevels&&!levels.every(level=>match.degreeLevels.includes(level)))return false;
  if(!match.award){const modes=modelModalities(model,records);return modes.length>0&&Array.isArray(match.sourceModalities)&&modes.every(mode=>match.sourceModalities.includes(mode));}
  const modes=modelModalities(model,records);return modes.length>0&&levels.every(level=>modes.every(modality=>awardScopeAllows(match.award,{school:model.school,level,modality})));
}
function sharedOption(match,model,records){const option=clone(match.option),modes=modelModalities(model,records);if(option.sourceCredits===null){delete option.sourceCredits;delete option.sourceCreditSystem;}if(match.award&&modes.length===1){const source=match.sources.find(source=>source.modality===modes[0]);if(source){option.url=source.url;option.sourcePage=option.sourcePages?.[source.id]??option.sourcePage;}}return option;}
const folder=resolve(root,'content/curricula');
await mkdir(folder,{recursive:true});await mkdir(resolve(root,'dist/data/curricula'),{recursive:true});
const registry={version:1,checkedOn:sharedAwardBundle.checkedOn,routes:[],models:[]},report=[],courseIndex=new Map(),courseSources=new Map();
const outputs=new Map(),ids=new Set();
const canonicalLevel=value=>({bachelors:'bachelor',bachelor:'bachelor',associates:'associate',associate:'associate',masters:'master',master:'master',doctoral:'doctorate',doctorate:'doctorate',specialist:'specialist'})[key(value)]||null;
function sourceMap(...arrays){const result=new Map();for(const s of arrays.flat()){if(!s?.id||!s.url)continue;const old=result.get(s.id);assert(!old||old.url===s.url,'Conflicting source identity '+s.id);result.set(s.id,clone(s));}return result;}
function compile(raw,document){
  assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'Curriculum model must be an object');
  assert(Array.isArray(raw.routeIds)&&raw.routeIds.length===new Set(raw.routeIds).size,'Curriculum needs unique exact route IDs: '+raw.id);
  assert(Array.isArray(raw.requirements)&&raw.requirements.length,'Curriculum requirements must be a nonempty array: '+raw.id);
  const model=clone(raw),routeIds=[...new Set(list(model.routeIds))];
  assert(routeIds.length,'Curriculum needs exact catalog route IDs: '+model.id);
  const records=routeIds.map(id=>{assert(routes.has(id),'Unknown catalog ID '+id);const r=routes.get(id);assert(key(r.school)===key(model.school),'Wrong school for '+id);return r;});
  assert(positive(model.totalCredits),'Published credit total required: '+model.id);
  let sources=sourceMap(document.sources||[],model.sources||[]),requirements=[];
  const balance=Planner.creditBalancePolicy({...model,sources:[...sources.values()]});
  assert(model.degreeCreditBalancePolicy?.enabled!==true||balance,'Unsupported earned-credit balance: '+model.id);
  const fixedCodes=new Set(list(model.requirements).flatMap(req=>[req.code,...list(req.allowedCourseCodes)]).filter(Boolean).map(key));
  const reqIds=new Set();
  for(const original of list(model.requirements)){
    assert(original&&typeof original==='object'&&!Array.isArray(original),'Invalid requirement in '+model.id);
    const req=clone(original);assert(req.id&&!reqIds.has(req.id),'Duplicate requirement '+model.id+':'+req.id);reqIds.add(req.id);
    assert(req.options===undefined||Array.isArray(req.options),'Requirement options must be an array: '+model.id+':'+req.id);
    assert(req.sourceIds===undefined||Array.isArray(req.sourceIds),'Requirement sources must be an array: '+model.id+':'+req.id);
    assert(positive(req.credits)||req.credits===0,'Invalid requirement credits '+model.id+':'+req.id);
    req.category=req.category||'major';req.sourceIds=list(req.sourceIds).length?req.sourceIds:list(model.sourceIds);
    const splits=req.bucket===true&&req.credits>3?Array.from({length:Math.ceil(req.credits/3)},(_,i)=>Math.min(3,req.credits-i*3)):[req.credits];
    for(let i=0;i<splits.length;i++){
      const derived=balance?.balanceRequirementIds.includes(req.id),binding=balance?.equivalencies.find(item=>item.requirementId===req.id);
      const row={...clone(req),id:splits.length>1?req.id+'-'+(i+1):req.id,credits:splits[i],options:list(req.options).filter(o=>o.credits===splits[i]||splits.length===1&&(derived||binding?.options.some(identity=>identity.optionId===o.id&&identity.provider===o.provider&&identity.code===o.code)))};
      if(splits.length>1){row.title=req.title+' · allocation '+(i+1);row.allocationOf=req.id;row.selectionRequired=true;delete row.code;}
      if(req.bucket||req.allocationSlot||req.researchGap)row.selectionRequired=true;
      if((req.freeElective||req.bucket||req.allocationSlot)&&req.upper||[req.minCourseLevel,req.minimumCourseLevel].some(value=>{const level=Number(value);return level>=(level>=1000?3000:300);}))row.upperOnly=true;
      if(!req.institutionalOnly){const receivingCodes=[req.code,...list(req.allowedCourseCodes)].filter(Boolean);for(const receivingCode of receivingCodes)for(const match of shared.get(key(model.school)+'|'+key(receivingCode))||[]){if(!sharedAwardApplies(match,model,records)||match.option.credits!==row.credits||match.creditSystem!==(model.creditSystem||'semester'))continue;if(row.options.some(o=>o.id===match.option.id))continue;row.options.push(sharedOption(match,model,records));sources=sourceMap([...sources.values()],match.sources);}}
      if(!req.institutionalOnly&&(req.freeElective===true||list(req.allowedCoursePrefixes).length)){for(const [identity,matches] of shared){if(!identity.startsWith(key(model.school)+'|'))continue;for(const match of matches){const receiving=String(match.option.receivingCode||'').match(/^([A-Za-z]+)[\s-]*(\d+)/),minimum=Number(req.minCourseLevel||req.minimumCourseLevel||0),maximum=Number(req.maxCourseLevel||req.maximumCourseLevel||Infinity);if(!sharedAwardApplies(match,model,records)||match.option.credits!==row.credits||match.creditSystem!==(model.creditSystem||'semester')||fixedCodes.has(key(match.option.receivingCode))||row.options.some(o=>o.id===match.option.id)||row.upperOnly&&!match.option.upper)continue;if((minimum||Number.isFinite(maximum))&&(!receiving||Number(receiving[2])<minimum||Number(receiving[2])>maximum))continue;if(list(req.allowedCoursePrefixes).length&&(!receiving||!req.allowedCoursePrefixes.map(key).includes(key(receiving[1]))))continue;row.options.push({...sharedOption(match,model,records),placementType:'elective',evidence:'conditional',conditions:[...list(match.option.conditions),'Proposed use in this published elective block. The receiving course must meet its department and level restrictions and must not also count elsewhere in this degree; confirm your catalog and allocation.']});sources=sourceMap([...sources.values()],match.sources);}}}
      if(!row.options.some(o=>o.provider==='University')){
        assert(row.sourceIds.length,'Requirement needs a curriculum source: '+model.id+':'+row.id);
        row.options.push({id:'university-'+slug(row.id),provider:'University',title:row.title,...(row.code?{code:row.code}:{}),credits:row.credits,upper:Boolean(row.upper),creditSystem:model.creditSystem||'semester',creditOrigin:'institutional',sourceIds:[...row.sourceIds],evidence:'published',...(row.selectionRequired?{selectionRequired:true,conditions:['Choose a specific course allowed by this published requirement.']}:{})});
      }
      if(row.options.some(o=>o.provider!=='University'&&o.code)||row.selectionRequired&&row.options.some(o=>o.code&&!o.selectionRequired))row.selectionRequired=false;
      if(row.minimumGrade)for(const option of row.options)option.conditions=[...list(option.conditions),'This requirement needs a grade of '+row.minimumGrade+' or higher; confirm the school’s treatment of pass grades.'];
      requirements.push(row);
    }
  }
  const sum=requirements.reduce((s,r)=>s+r.credits,0),gap=Math.round((model.totalCredits-sum)*1000)/1000;
  assert(gap>=-0.001,'Requirements exceed degree total; resolve choice groups/overlaps: '+model.id+' '+sum+'/'+model.totalCredits);
  if(gap>0.001){requirements.push({id:'requirements-still-to-resolve',title:'Requirements still to resolve from the degree catalog',credits:gap,category:'unresolved',researchGap:true,options:[],notes:'The published degree total exceeds the imported allocations by '+gap+' credits. This is an explicit research gap, not a proposed course or transfer award.'});model.coverage='partial';model.unresolved=[...list(model.unresolved),gap+' degree credits still need their exact requirements imported.'];}
  model.requirements=requirements;model.sources=[...sources.values()];
  if(Array.isArray(model.defaultProviders)&&requirements.some(row=>row.options.some(option=>option.provider==='DSST'&&option.evidence==='published')))model.defaultProviders=[...new Set([...model.defaultProviders,'DSST'])];
  model.policyReview=list(model.policyReview);
  const documentedResolution=field=>model.policyReview.some(item=>item.field===field&&['verified','confirmed','resolved','not-applicable'].includes(item.status)&&list(item.sourceIds).length&&item.sourceIds.every(id=>sources.has(id)));
  if(!Number.isFinite(model.institutionMinCredits)&&!(model.residencyPolicy&&Planner.institutionResidencyMinimum(model)!==null))model.policyReview.push({field:'institutionMinCredits',status:'unverified',message:'Confirm how many credits must be earned at this university for this exact degree.'});
  if(records.some(r=>r.level==='bachelor')&&!Number.isFinite(model.upperMinCredits)&&!documentedResolution('upperMinCredits'))model.policyReview.push({field:'upperMinCredits',status:'unverified',message:'Confirm the degree’s upper-level credit minimum.'});
  if(requirements.some(r=>r.options.some(o=>o.provider!=='University'))&&!Number.isFinite(model.alternativeMaxCredits)&&!documentedResolution('alternativeMaxCredits'))model.policyReview.push({field:'alternativeMaxCredits',status:'unverified',message:'Confirm the combined limit on alternative credit sources.'});
  const sections=list(model.curriculumSections).map(s=>({...s,requirementIds:list(s.requirementIds).flatMap(id=>requirements.filter(r=>r.id===id||r.allocationOf===id).map(r=>r.id))}));
  if(sections.length)model.curriculumSections=sections;
  Object.assign(model,applyLibertyCurrentEvidence(model,{compiled:true}));
  Object.assign(model,applyLibertySharedPolicyResolutions(model));
  const composed=composeSharedAwards([model],sharedAwardBundle,{asOf:sharedAwardBundle.checkedOn});
  Object.assign(model,composed.models[0]);
  sharedAwardReports.push({...composed.report,modelId:model.id});
  model.evidenceCheckedOn=model.evidenceCheckedOn||document.checkedOn;
  model.coverageLabel=model.coverageLabel||(gap>0?'Published curriculum with specific remaining research gaps':'Published degree requirements with source-linked course choices');
  model.completeExecutablePathway=false; // Individual admission and transfer approval remain necessary.
  delete model.routeIds;
  Object.assign(model,compileScopedResearchNotices(model,{asOf:sharedAwardBundle.checkedOn}));
  const choices=Catalog.courseChoiceCounts(model);
  const entry={id:model.id,path:'',routeIds,school:model.school,title:model.title,format:model.format,...choices,readyTemplate:model.coverage==='complete'&&gap<=0&&Catalog.modelReadiness(model).available,degreeCredits:model.totalCredits,creditUnit:model.creditSystem,paceModel:model.paceModel||records.find(r=>r.paceModel)?.paceModel,...(model.pricing?{pricing:clone(model.pricing)}:{}),modalities:[...new Set(records.flatMap(r=>r.modalities||[]))],coverage:model.coverage==='complete'&&gap<=0?'complete':'partial',status:'reviewed',checkedOn:document.checkedOn};
  if(model.format&&/^online$/i.test(model.format))entry.modalities=['online'];
  if(model.format&&/^(residential|campus|on campus)$/i.test(model.format))entry.modalities=['campus'];
  Catalog.validateModel(model,entry);return {model,entry,gap};
}
async function output(path,value){outputs.set(path,JSON.stringify(value)+'\n');}
for(const name of (await readdir(folder)).filter(n=>n.endsWith('.json')).sort()){
  const doc=await read('content/curricula/'+name),models=[];
  assert(doc&&doc.version===1&&/^20\d{2}-\d{2}-\d{2}$/.test(doc.checkedOn||'')&&new Date(doc.checkedOn).toISOString().slice(0,10)===doc.checkedOn,'Curriculum document needs a valid version and checked date: '+name);
  assert(Array.isArray(doc.models||doc.programs),'Curriculum document needs a models array: '+name);
  assert(doc.sources===undefined||Array.isArray(doc.sources),'Curriculum document sources must be an array: '+name);
  assert(doc.routes===undefined||Array.isArray(doc.routes),'Curriculum document routes must be an array: '+name);
  for(const route of list(doc.routes)){assert(!routes.has(route.id),'A declared degree variant conflicts with an existing catalog ID '+route.id);if(route.parentId){const parent=routes.get(route.parentId);assert(parent&&key(parent.school)===key(route.school),'A degree variant has an invalid parent');}routes.set(route.id,clone(route));registry.routes.push(clone(route));}
  if(!registry.checkedOn||doc.checkedOn>registry.checkedOn)registry.checkedOn=doc.checkedOn;
  for(const raw of list(doc.models||doc.programs)){
    if(['planned','upcoming','approval-pending','inactive'].includes(raw.status))continue;
    const named=applyLibertyAccountingNamedChoices(raw,libertyAccountingChoices);
    const mapped=named.school==='Liberty University'&&['Online','Residential'].includes(named.format)?applyReviewedLibertyMaps(named):named;
    const scoped=applyCourseListingIdentities(addLibertyCLIOptions(applyLibertyVerifiedBasics(mapped,libertyVerifiedBasics),libertyCLIReview,list(raw.routeIds).map(id=>routes.get(id)).filter(Boolean)));
    const enriched=scoped.id==='curriculum-gcu-bsba-campus'?addGCUInstitutionalOptions(addGCUTransferOptions(scoped,gcuTransferReview),gcuInstitutionalReview):scoped;
    const {model,entry,gap}=compile(enriched,doc);assert(!ids.has(model.id),'Duplicate curriculum model '+model.id);ids.add(model.id);entry.path='data/curricula/'+name;registry.models.push(entry);models.push(model);
    report.push({id:model.id,school:model.school,title:model.title,totalCredits:model.totalCredits,importedRequirementCredits:model.totalCredits-gap,unresolvedCredits:gap,requirements:model.requirements.length,externalOptions:model.requirements.reduce((s,r)=>s+r.options.filter(o=>o.provider!=='University').length,0),coverage:entry.coverage});
    for(const requirement of model.requirements)for(const option of requirement.options){
      if(option.provider==='University'||!option.code)continue;
      const identity=key(option.provider)+'|'+key(option.code),mapped=model.id+':'+requirement.id;
      if(courseIndex.has(identity)){const previous=courseIndex.get(identity);if(!previous.mappedCourseIds.includes(mapped))previous.mappedCourseIds.push(mapped);continue;}
      const independentSource=['verified-current-provider-and-ace','reviewed-independent-recommendation'].includes(option.sourceCreditStatus);
      const source=model.sources.find(s=>(independentSource?list(option.recommendationPeriodSourceIds):option.sourceIds).includes(s.id))||model.sources.find(s=>option.sourceIds.includes(s.id));if(!source)continue;
      const evidenceCheckedAt=reviewedSourceDate(source);
      courseSources.set(source.id,{...source,checkedAt:evidenceCheckedAt,scope:independentSource?'Independently reviewed provider credit quantity and current ACE recommendation; degree placement remains separately sourced.':'Original receiving-school course mapping. Provider credit recommendations and individual degree applicability require confirmation.'});
      let url=null;try{const u=new URL(option.providerCourseUrl||option.courseUrl||option.url);if(u.protocol==='https:'&&!u.username&&!u.password&&['sophia.org','study.com','straighterline.com','clep.collegeboard.org','saylor.org','getcollegecredit.com','christianleaders.org','christianleadersinstitute.org'].some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain)))url=u.href;}catch{}
      let providerDirectoryUrl=null;try{const u=new URL(option.providerDirectoryUrl);if(option.provider==='Christian Leaders Institute'&&u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='christianleaders.org'&&u.pathname==='/course/index.php'&&/^\d+$/.test(u.searchParams.get('categoryid')||''))providerDirectoryUrl=u.href;}catch{}
      const sourceCredits=positive(option.sourceCredits)?option.sourceCredits:null;
      courseIndex.set(identity,{id:'mapped-'+createHash('sha256').update(identity).digest('hex').slice(0,20),provider:option.provider,providerId:option.providerId||slug(option.provider),title:option.title,code:option.code,codeAliases:list(option.codeAliases),url,...(providerDirectoryUrl?{providerDirectoryUrl}:{}),evidenceUrl:option.url||source.url,credits:sourceCredits,creditSystem:sourceCredits?option.sourceCreditSystem||null:null,creditBasis:sourceCredits?independentSource?'reviewed-provider-and-ace':'curated-course-map':'not-yet-known',sourceId:source.id,checkedAt:evidenceCheckedAt,indexedAt:doc.checkedOn,recommendationStatus:independentSource?'reviewed-current-window':'requires-review',mappingStatus:option.evidence==='conditional'?'conditional-receiving-map':'published-receiving-map',mappedCourseIds:[mapped],subject:'Other'});
    }
  }
  await output('dist/data/curricula/'+name,{version:1,checkedOn:doc.checkedOn,models});
}
// Established standalone curricula already have reviewed, exact modelId links in
// pathways.json. Register those same files; do not compile new course awards or
// infer associations from a degree title, source URL, or neighboring program.
for(const path of Catalog.modelFiles){
  const model=await read('dist/'+path),records=list(base.pathways).filter(route=>route.modelId===model.id),readiness=Catalog.modelReadiness(model);
  if(!readiness.available||!records.length)continue;
  assert(!ids.has(model.id),'A standalone curriculum is already registered: '+model.id);
  const level=canonicalLevel(model.level),modalities=modelModalities(model,records);
  assert(level&&records.every(route=>route.level===level),'A standalone curriculum has conflicting degree levels: '+model.id);
  assert(records.every(route=>key(route.school)===key(model.school)&&list(route.modalities).length&&list(route.modalities).every(mode=>modalities.includes(mode))),'A standalone curriculum has conflicting school or delivery-format associations: '+model.id);
  const dates=[model.evidenceCheckedOn,model.officialMappingCheckedOn,...list(model.sources).map(source=>source.checked||source.checkedOn)].filter(value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&new Date(value).toISOString().slice(0,10)===value).sort(),checkedOn=dates.at(-1);
  assert(checkedOn,'A standalone curriculum needs dated source evidence: '+model.id);
  const entry={id:model.id,path,routeIds:records.map(route=>route.id),school:model.school,title:model.title,level,format:model.format,...Catalog.courseChoiceCounts(model),readyTemplate:true,degreeCredits:model.totalCredits,creditUnit:model.creditSystem,modalities,coverage:'complete',status:'reviewed',checkedOn};
  Catalog.validateModel(model,entry);ids.add(model.id);registry.models.push(entry);
  report.push({id:model.id,school:model.school,title:model.title,totalCredits:model.totalCredits,importedRequirementCredits:model.requirements.reduce((sum,row)=>sum+row.credits,0),unresolvedCredits:0,requirements:model.requirements.length,externalOptions:model.requirements.reduce((sum,row)=>sum+row.options.filter(option=>option.provider!=='University').length,0),coverage:'complete',sourceKind:'established-standalone'});
}
const aliasDocument=await read('dist/data/degree-link-aliases.json'),aliasURLs=new Set();
assert(aliasDocument.version===1&&Array.isArray(aliasDocument.aliases),'Degree link aliases need a versioned alias list');
for(const alias of aliasDocument.aliases){
  const entry=registry.models.find(entry=>entry.id===alias.modelId),url=new URL(alias.url),source=new URL(alias.sourceUrl),identity=url.href.replace(/\/+$/,'');
  assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search&&source.protocol==='https:'&&!source.username&&!source.password,'Degree link aliases need exact public university links');
  assert(!aliasURLs.has(identity),'Degree link alias is assigned more than once: '+alias.url);aliasURLs.add(identity);
  assert(entry?.readyTemplate===true&&entry.routeIds.includes(alias.pathwayId)&&entry.modalities.includes(alias.modality),'Degree link alias does not identify an available exact degree and format: '+alias.url);
  assert(/^20\d{2}-\d{2}-\d{2}$/.test(alias.checkedOn||'')&&new Date(alias.checkedOn).toISOString().slice(0,10)===alias.checkedOn,'Degree link alias needs a valid checked date');
  const payload=entry.path.startsWith('data/curricula/')?JSON.parse(outputs.get('dist/'+entry.path)):await read('dist/'+entry.path),model=(payload.models||[payload]).find(model=>model.id===entry.id);
  assert(model&&model.sources.some(reference=>reference.url===alias.sourceUrl),'Degree link alias needs its actual reviewed curriculum source: '+alias.url);
  assert(url.hostname.split('.').slice(-2).join('.')===source.hostname.split('.').slice(-2).join('.'),'Degree link alias and source belong to different university domains');
}
Catalog.validateRegistry(registry);
await output('dist/data/shared-award-composition.json',{schemaVersion:1,checkedOn:sharedAwardBundle.checkedOn,bundleId:sharedAwardBundle.id,bundleFingerprint:createHash('sha256').update(JSON.stringify(sharedAwardBundle)).digest('hex'),unprocessedProgramIds:[...new Set(sharedAwardBundle.placementRules.flatMap(rule=>rule.modelIds))].filter(id=>!sharedAwardReports.some(report=>report.modelId===id)).sort(),summary:{modelsConsidered:sharedAwardReports.length,modelsChanged:sharedAwardReports.reduce((n,r)=>n+r.modelsChanged,0),addedOptions:sharedAwardReports.reduce((n,r)=>n+r.addedOptions,0),updatedOptions:sharedAwardReports.reduce((n,r)=>n+r.updatedOptions,0),retainedPublishedOptions:sharedAwardReports.reduce((n,r)=>n+r.retainedPublishedOptions,0),heldOptions:sharedAwardReports.reduce((n,r)=>n+r.held.length,0)},reports:sharedAwardReports.filter(r=>r.modelsChanged||r.held.length),privateStudentRecordsIncluded:false,studentCreditsAwarded:0,publicationDecisionsMade:0});
await output('dist/data/curriculum-registry.json',registry);
await output('dist/data/curriculum-coverage.json',{version:1,checkedOn:registry.checkedOn,modelCount:report.length,coveredRouteCount:new Set(registry.models.flatMap(m=>m.routeIds)).size,models:report});
await output('dist/data/curriculum-course-index.json',{version:1,checkedAt:registry.checkedOn,scope:'Source-linked course identities discovered in researched degree requirements. These listings are not an individual transfer award.',sources:[...courseSources.values()],courses:[...courseIndex.values()]});
// Validate the entire source set before updating any generated artifact.
for(const [path,json] of outputs)if(check)assert.equal(await readFile(resolve(root,path),'utf8'),json,path+' is stale');else await writeFile(resolve(root,path),json);
console.log(JSON.stringify({models:report.length,completeRequirementLedgers:report.filter(r=>r.unresolvedCredits===0).length,routeCount:new Set(registry.models.flatMap(m=>m.routeIds)).size,externalOptions:report.reduce((s,r)=>s+r.externalOptions,0),checked:check}));
