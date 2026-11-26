/** Source-fact research queue. Grouping work never approves a claim or a plan. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readAcademicInputs} from './build-academic-registry.mjs';

const root=resolve(import.meta.dirname,'..'),list=value=>Array.isArray(value)?value:[],unique=values=>[...new Set(values)].sort();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const code=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const priority=school=>/liberty/i.test(school)?0:/thomas edison/i.test(school)?1:/maine at presque/i.test(school)?2:/western governors/i.test(school)?3:4;
const sourceKey=source=>source?{url:source.url,hash:source.sourceContentHash||source.sha256||null,kind:source.kind||null}:null;
function scope(model){return{school:model.school,catalog:model.catalogYear||model.catalog||null,level:model.level||null,modality:model.format||list(model.modalities).join(',')||null,creditSystem:model.creditSystem||null};}
const reviewFields=new Set(['status','provider','fullyApproved','sourceIds','owner','individualApproval','checkedOn','reviewId','scope','providerReviewPending','enrollmentPermission']);
const digest=value=>typeof value==='string'&&/^(?:sha256:)?[a-f0-9]{64}$/.test(value)?value.replace(/^sha256:/,''):null;
const https=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';return url.href;}catch{return null;}};
function pendingProviderReview(option){
 const review=option?.eligibilityReview;
 // Recognize the provider-level pending-review contract only. Other/course-
 // specific decisions stay separate, even when their prose looks similar.
 return review&&review.provider===option.provider&&review.status==='provisionally-approved-review-pending'&&review.providerReviewPending===true&&review.fullyApproved===false&&review.individualApproval===false&&review.enrollmentPermission==='not-established-by-provider-status'&&typeof review.reviewId==='string'&&review.reviewId.trim()&&typeof review.scope==='string'&&review.scope.trim()&&/^20\d{2}-\d{2}-\d{2}$/.test(review.checkedOn||'')&&list(review.sourceIds).length&&Object.keys(review).every(key=>reviewFields.has(key))?review:null;
}
function policyCaptureKey(source){
 const hashes=[source?.sourceContentHash,source?.sha256].filter(value=>value!==undefined).map(digest);
 if(source?.kind!=='university'||!https(source.url)||!/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture||'')||!hashes.length||hashes.some(value=>!value)||new Set(hashes).size!==1)return null;
 return JSON.stringify({url:https(source.url),capture:source.capture,sha256:hashes[0],kind:source.kind});
}
/** Verify source bodies rather than trusting a declared hash. This reads only
 * retained public policy captures; missing/changed/ambiguous proof means no
 * shared task, never an inferred approval or a weaker publication gate. */
export async function readProviderPolicyCaptures(models,{base=root}={}){
 const receipts=new Map(),pending=new Map();
 for(const model of models){const sources=new Map(list(model.sources).map(source=>[source.id,source]));
  for(const requirement of list(model.requirements))for(const option of list(requirement.options)){
   const review=pendingProviderReview(option);if(!review)continue;
   for(const id of unique(review.sourceIds)){const source=sources.get(id),key=policyCaptureKey(source);if(!key||pending.has(key))continue;
    pending.set(key,(async()=>{try{
     const [body,sidecar]=await Promise.all([readFile(resolve(base,source.capture),'utf8'),readFile(resolve(base,source.capture.replace(/\.txt$/,'.json')),'utf8')]);
     const metadata=JSON.parse(sidecar),actual=createHash('sha256').update(body).digest('hex'),declared=JSON.parse(key);
     if(actual!==declared.sha256||digest(metadata.sha256)!==actual||![metadata.url,metadata.finalUrl].some(url=>https(url)===declared.url)||!(metadata.status>=200&&metadata.status<300)||!Number.isFinite(Date.parse(metadata.fetchedAt)))return;
     receipts.set(key,{url:declared.url,hash:'sha256:'+actual,kind:'university'});
    }catch{/* Unverified policy evidence stays program-specific. */}})());
   }
  }
 }
 await Promise.all(pending.values());return receipts;
}
function providerPolicyTask(model,context,sources,requirements,receipts){
 const exactScope=scope(model);
 if(!context.optionIds.length||!context.requirementIds.length||!['school','catalog','level','modality','creditSystem'].every(key=>typeof exactScope[key]==='string'&&exactScope[key].trim()))return null;
 const claims=[];let identity,policyEvidence;
 for(const requirementId of context.requirementIds){const row=requirements.get(requirementId);if(!row)return null;
  for(const option of list(row.options).filter(option=>context.optionIds.includes(option.id))){
   const review=pendingProviderReview(option);if(!review)return null;
   const proof=unique(review.sourceIds).map(id=>{const key=policyCaptureKey(sources.get(id));return key&&receipts.get(key);});
   if(proof.some(value=>!value))return null;
   const evidence=[...new Map(proof.map(source=>[JSON.stringify(source),source])).values()].sort((a,b)=>a.url.localeCompare(b.url)||a.hash.localeCompare(b.hash));
   const candidate={kind:'provider-policy',scope:exactScope,provider:option.provider,providerReviewStatus:review.status,reviewId:review.reviewId,reviewCheckedOn:review.checkedOn,providerReviewScope:review.scope,reviewScopeHash:hash(review.scope),enrollmentPermission:review.enrollmentPermission,policyEvidence:evidence};
   if(identity&&hash(canonical(identity))!==hash(canonical(candidate)))return null;
   identity=candidate;policyEvidence=evidence;
   const receiving=option.universityMapRecord||option.mappingEvidence||{};
   if(list(option.conditions).some(condition=>typeof condition!=='string'))return null;
   claims.push({requirementId,optionId:option.id,provider:option.provider,sourceCourse:option.code,courseVersion:option.courseVersion??null,sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,creditOrigin:option.creditOrigin||null,receivingCode:option.receivingCode||row.code||null,receivingCredits:option.credits,receivingCreditSystem:option.creditSystem||model.creditSystem,receivingProgramId:receiving.programId??null,agreementId:receiving.agreementId??null,mappingScope:option.mappingScope||null,mappingSourceIds:unique(list(option.sourceIds)),recommendationStart:option.recommendationStart||null,recommendationEnd:option.recommendationEnd||null,conditions:[...list(option.conditions)]});
  }
 }
 if(!identity||!context.optionIds.every(id=>claims.some(claim=>claim.optionId===id)))return null;
 return{identity,context:{...context,courseClaims:claims.sort((a,b)=>a.requirementId.localeCompare(b.requirementId)||a.optionId.localeCompare(b.optionId))},sources:policyEvidence};
}

export function buildExpansionQueue({models,quality,providerPolicyCaptures=new Map()}){
  const byModel=new Map(models.map(model=>[model.id,model])),tasks=new Map();let occurrences=0;
  const add=(identity,context,sourceRefs)=>{
    const id='expansion-'+hash(canonical(identity)).slice(0,24);
    if(!tasks.has(id))tasks.set(id,{id,...identity,contexts:[],sources:[],reviewStatus:'needs-review',automaticApproval:false});
    const task=tasks.get(id);
    if(!task.contexts.some(value=>value.findingId===context.findingId))task.contexts.push(context);
    for(const source of sourceRefs)if(source&&!task.sources.some(value=>value.url===source.url&&value.hash===source.hash&&value.kind===source.kind))task.sources.push(source);
  };
  for(const program of list(quality.programs)){
    const model=byModel.get(program.modelId);if(!model)throw Error('Quality report references an unknown model: '+program.modelId);
    const sources=new Map(list(model.sources).map(source=>[source.id,source]));
    const requirements=new Map(list(model.requirements).map(row=>[row.id,row]));
    for(const finding of list(program.findings).filter(item=>item.blocking&&item.owner==='research')){
      occurrences++;
      const context={modelId:model.id,title:model.title,findingId:finding.id,code:finding.code,requirementIds:unique(list(finding.requirementIds)),optionIds:unique(list(finding.optionIds)),sourceIds:unique(list(finding.sourceIds)),message:finding.message};
      const refs=unique(list(finding.sourceIds)).map(id=>sourceKey(sources.get(id))).filter(Boolean);
      const base=scope(model);
      if(finding.code==='policy-unresolved'&&finding.field){
        add({kind:'school-policy',scope:base,field:finding.field},context,refs);continue;
      }
      if(finding.code==='provider-eligibility'){
        const shared=providerPolicyTask(model,context,sources,requirements,providerPolicyCaptures);
        if(shared){add(shared.identity,shared.context,shared.sources);continue;}
      }
      if(finding.code==='open-course-choice'){
        for(const id of context.requirementIds){const row=requirements.get(id);if(!row)continue;
          add({kind:'named-course-pool',scope:base,slotKind:row.slot?.kind||null,label:row.slot?.label||row.title,upperOnly:row.upperOnly===true||row.upper===true,allowedCodes:unique(list(row.allowedCourseCodes)),allowedPrefixes:unique([...list(row.allowedCoursePrefixes),...list(row.allowedPrefixes)])},context,[...refs,...list(row.sourceIds).map(id=>sourceKey(sources.get(id))).filter(Boolean)]);
        }continue;
      }
      if(['mapping-evidence','conditional-award','provider-identity','provider-course-identity'].includes(finding.code)&&context.optionIds.length){
        for(const requirementId of context.requirementIds){const row=requirements.get(requirementId);if(!row)continue;
          for(const option of list(row.options).filter(option=>context.optionIds.includes(option.id))){
            const receiving=option.universityMapRecord||option.mappingEvidence||{};
            add({kind:finding.code.includes('identity')?'provider-identity':'receiving-award',scope:base,provider:option.provider,sourceCourse:code(option.code),courseVersion:option.courseVersion??null,sourceCredits:option.sourceCredits??null,sourceCreditSystem:option.sourceCreditSystem??null,creditOrigin:option.creditOrigin||null,receivingCode:code(option.receivingCode||row.code)||null,receivingCategory:option.receivingCategory||null,receivingCredits:option.credits,receivingCreditSystem:option.creditSystem||model.creditSystem,receivingProgramId:receiving.programId??null,agreementId:receiving.agreementId??null,recommendationStart:option.recommendationStart||null,recommendationEnd:option.recommendationEnd||null,sourceEvidence:unique(list(option.sourceIds).map(id=>sources.get(id)).filter(Boolean).map(source=>hash(canonical(sourceKey(source)))))},context,refs);
          }
        }continue;
      }
      // Unknown or genuinely program-specific issues must not acquire a
      // school-wide scope merely because their text resembles another issue.
      add({kind:'program-review',scope:base,modelId:model.id,code:finding.code,requirementIds:context.requirementIds,optionIds:context.optionIds},context,refs);
    }
  }
  const items=[...tasks.values()].map(task=>({...task,affectedModelIds:unique(task.contexts.map(context=>context.modelId)),occurrences:task.contexts.length,contexts:task.contexts.sort((a,b)=>a.modelId.localeCompare(b.modelId)||a.findingId.localeCompare(b.findingId)),sources:task.sources.sort((a,b)=>a.url.localeCompare(b.url)||String(a.hash).localeCompare(String(b.hash))),reviewInstructions:task.kind==='school-policy'?'Review the exact policy for every listed catalog, level and delivery scope. Record exceptions before applying a shared fact.':task.kind==='provider-policy'?'Review the captured receiving-university provider policy for these exact catalog, degree-level and delivery scopes. Provider status does not approve any listed course, receiving award, degree placement, recommendation version or student enrollment. Those claims keep their separate research findings and course contexts.':task.kind==='named-course-pool'?'Review the primary catalog eligibility rule and exact course choices. Similar labels are research candidates, not proof of interchangeability.':'Review original provider identity, exact receiving award and each listed degree placement separately. A shared receiving award is not an individual credit decision.'}));
  items.sort((a,b)=>priority(a.scope.school)-priority(b.scope.school)||b.affectedModelIds.length-a.affectedModelIds.length||b.occurrences-a.occurrences||a.id.localeCompare(b.id));
  const counts=Object.fromEntries(unique(items.map(item=>item.kind)).map(kind=>[kind,items.filter(item=>item.kind===kind).length]));
  const result={schemaVersion:1,asOf:quality.asOf,registryRevision:quality.registryRevision,scope:'Public-source research dependencies, not new transfer approvals or ready-program counts.',privateStudentRecordsIncluded:false,automaticApprovals:0,runtimeAiCalls:0,summary:{models:models.length,readyPlans:list(quality.programs).filter(program=>program.publication?.ready).length,blockingFindingOccurrences:occurrences,distinctReviewTasks:items.length,reviewTasksByKind:counts},tasks:items};
  return{...result,revision:'expansion-queue-v1:'+hash(canonical(result))};
}

export async function writeExpansionQueue({base=root,check=false}={}){
  const {models}=await readAcademicInputs(base),quality=JSON.parse(await readFile(resolve(base,'dist/data/pathway-quality-report.json'),'utf8'));
  const providerPolicyCaptures=await readProviderPolicyCaptures(models,{base});
  const report=buildExpansionQueue({models,quality,providerPolicyCaptures}),body=JSON.stringify(report)+'\n',path=resolve(base,'dist/data/plan-expansion-queue.json');
  if(check){if(await readFile(path,'utf8')!==body)throw Error('Plan expansion queue is stale. Rebuild it after the academic quality report.');}
  else await writeFile(path,body);
  return{revision:report.revision,...report.summary,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await writeExpansionQueue({check:process.argv.includes('--check')})));
