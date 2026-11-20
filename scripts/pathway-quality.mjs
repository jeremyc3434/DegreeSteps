/* Catalog research quality. Never awards student credit or runs the optimizer. */
import {createHash} from 'node:crypto';
import Planner from '../dist/planner.js';

const list=value=>Array.isArray(value)?value:[];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const near=(left,right)=>Math.abs(left-right)<0.001;
const text=value=>typeof value==='string'?value.trim():'';
const day=86400000;
const level=value=>({bachelor:'bachelor',bachelors:'bachelor',associate:'associate',associates:'associate',master:'master',masters:'master',doctorate:'doctorate',doctoral:'doctorate',specialist:'specialist'})[text(value).toLowerCase().replace(/[^a-z]/g,'')]||null;
const format=value=>/^(online)$/i.test(text(value))?'online':/^(residential|campus|on campus)$/i.test(text(value))?'campus':/^(hybrid)$/i.test(text(value))?'hybrid':null;
const unique=values=>[...new Set(values.filter(Boolean))].sort();
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function date(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return null;const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?stamp:null;}
function https(value){try{const address=new URL(value);return address.protocol==='https:'&&!address.username&&!address.password?address.href:null;}catch{return null;}}
function sourceMap(model){return new Map(list(model?.sources).map(source=>[source.id,source]));}
function bound(sources,ids){return list(ids).length>0&&ids.every(id=>https(sources.get(id)?.url));}
function sourceDate(source){return [source?.checked,source?.checkedOn,source?.checkedAt].find(value=>date(value)!==null)||null;}
function assertDate(value){if(date(value)===null)throw Error('Use a real quality-review date in YYYY-MM-DD format.');}
function idFor(modelId,code,value){return String(modelId||'unidentified')+':'+code+':'+createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);}
function finding(model,category,code,message,extra={}){
 const requirementIds=unique(list(extra.requirementIds)),optionIds=unique(list(extra.optionIds)),sourceIds=unique(list(extra.sourceIds));
 const value={category,code,message,requirementIds,optionIds,sourceIds,field:extra.field||null};
 return {id:idFor(model?.id,code,value),modelId:model?.id||null,category,code,message,owner:category==='student-task'?'student':'research',blocking:category==='missing-research'||category==='conditional-policy',scope:optionIds.length?'option':'program',...extra,requirementIds,optionIds,sourceIds};
}

// These statements delimit a baseline; they do not establish a missing academic fact.
// Unknown notes deliberately remain research findings instead of being blanket-cleared.
function scopeNote(message){
 if(/^(?:Individual catalog eligibility, state CPA eligibility, course currency and registration availability depend on the student; this plan does not make a licensure or admissions decision|Personal admission\/catalog eligibility, course currency and future registration availability depend on the individual record)\.$/.test(message))return 'student-task';
 if(/^This (?:baseline|model|plan) uses (?:the )?standard nonmilitary residency; military, foreign-credit and Edison Accelerate scenarios need their applicable policies\.$/.test(message)||/^The standard nonmilitary residency route is modeled\. Military enrollment, foreign-credit rules and Edison Accelerate require a separately evaluated scenario\.$/.test(message))return 'student-task';
 if(/^Published (?:standard )?tuition is a (?:provisional )?planning basis; (?:books, provider subscriptions and applicable fees are separate|provider subscriptions, books and applicable fees remain separate)\.$/.test(message))return 'estimate';
 if(/^Existing receiving-school (?:transfer candidates|awards) retain their original provider(?:\/version\/format restrictions|, course-version, credit-unit, delivery and individual-evaluation conditions)\. No (?:additional )?provider award is inferred from (?:a matching course title|a course title)\.$/.test(message))return 'student-task';
 return null;
}
// Legacy importers emitted prose for several distinct questions. Keep those
// strings auditable, but classify the question from current scoped evidence.
// New batch adapters can emit the same typed topics directly; an unknown topic
// or an unproved topic remains a normal blocking research item.
const wguNoticeTopics=new Map([
 ['WGU course identifiers are not printed in the guide; titles are retained without invented course codes.','curriculum-identifiers'],
 ['University courses without an outside option are not proof that no transfer exists. Additional approved provider matches require further current program-specific research.','additional-transfer-options'],
 ['Confirm the student’s applicable program catalog; the official program-guide version is recorded above.','personal-catalog-selection'],
 ['These are the complete named standard-path courses in the cited WGU guide. Current individual transfer approval and receiving level remain unresolved on each outside option.','selected-transfer-awards']
]);
function currentSource(source,asOf){
 const checked=date(sourceDate(source)),now=date(asOf);
 return https(source?.url)&&checked!==null&&checked<=now&&now-checked<30*day;
}
function officialWgu(source){
 try{const url=new URL(source?.url);return source.kind==='university'&&url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='wgu.edu'||url.hostname.endsWith('.wgu.edu'));}catch{return false;}
}
function reviewedWguLedger(model,sources,asOf){
 const review=model?.curriculumReview,requirements=list(model?.requirements),catalog=text(model?.catalogYear||model?.catalog);
 if(model?.school!=='Western Governors University'||level(model.level)!=='bachelor'||format(model.format)!=='online'||model.creditSystem!=='competency-unit'||model.auditProvenance?.status==='student-provided'||!/^20\d{2}(?:0[1-9]|1[0-2])$/.test(catalog))return null;
 if(review?.status!=='current-complete-named-ledger'||review.catalog!==catalog||!Number.isInteger(review.programId)||review.programId<=0||!text(review.programCode)||!Number.isInteger(review.recordVersion)||review.recordVersion<=0||!/^[a-f0-9]{64}$/.test(review.ledgerSha256||''))return null;
 const reviewDate=date(review.checkedOn),now=date(asOf),ids=list(review.sourceIds);
 if(reviewDate===null||reviewDate>now||now-reviewDate>=30*day||ids.length<2||new Set(ids).size!==ids.length)return null;
 const scoped=source=>officialWgu(source)&&currentSource(source,asOf)&&sourceDate(source)===review.checkedOn&&source.scope?.schoolName===model.school&&source.scope?.programId===review.programId&&source.scope?.programCode===review.programCode&&source.scope?.catalogYear===catalog&&source.scope?.level==='bachelor'&&source.scope?.modality==='online'&&source.scope?.creditSystem==='competency-unit';
 const evidence=ids.map(id=>sources.get(id));
 if(!evidence.every(scoped)||!evidence.some(source=>source.publicRecordId===review.programId&&source.publicRecordVersion===review.recordVersion&&source.approvalStatus==='Approved'&&source.inactiveProgram===0))return null;
 if(!finite(model.totalCredits)||model.totalCredits<=0||!requirements.length||new Set(requirements.map(row=>row.id)).size!==requirements.length||!near(requirements.reduce((sum,row)=>sum+(finite(row.credits)?row.credits:0),0),model.totalCredits))return null;
 if(requirements.some(row=>!text(row.id)||!text(row.title)||!finite(row.credits)||row.credits<=0||row.researchGap||!list(row.sourceIds).some(id=>ids.includes(id))))return null;
 return {sourceIds:ids,catalog,review};
}
function completeNamedBaseline(model,plan){
 const requirements=list(model?.requirements),rows=list(plan?.rows),byId=new Map(requirements.map(row=>[row.id,row]));
 return plan?.validation?.academicCountsValid===true&&plan?.validation?.policyChecksComplete===true&&requirements.length>0&&rows.length===requirements.length&&new Set(rows.map(row=>row.requirementId)).size===rows.length&&rows.every(row=>{
  const requirement=byId.get(row.requirementId),option=list(requirement?.options).find(option=>option.id===row.option?.id&&option.provider===row.option?.provider&&option.code===row.option?.code);
  return requirement&&row.status==='planned'&&!row.selectionRequired&&option&&!option.selectionRequired&&text(option.code)&&text(option.title)&&near(row.credits,requirement.credits)&&near(option.credits,requirement.credits);
 });
}
const identityAuthorities={
 Sophia:{domains:['sophia.org'],aceOrganizationId:'76099b28-9016-e811-810f-5065f38bf0e1',acePrefix:'SOPH',names:['sophia','sophialearning','sophialearningllc']},
 'Study.com':{domains:['study.com'],aceOrganizationId:'82099b28-9016-e811-810f-5065f38bf0e1',acePrefix:'SDCM',names:['studycom','studycomllc']},
 StraighterLine:{domains:['straighterline.com'],aceOrganizationId:'80099b28-9016-e811-810f-5065f38bf0e1',acePrefix:'OOSL',names:['straighterline']},
 Saylor:{domains:['saylor.org'],aceOrganizationId:'68099b28-9016-e811-810f-5065f38bf0e1',acePrefix:'SAYA',names:['saylor','sayloracademy','sayloruniversity']}
};
const normalizedIdentity=value=>text(value).toLowerCase().replace(/[^a-z0-9]/g,'');
function declaredIdentityMatches(source,option,authority){
 const aliases=new Set([option.code,option.aceId,option.providerCourseCode,...list(option.codeAliases)].map(normalizedIdentity).filter(Boolean));
 for(const provider of [source.provider,source.scope?.provider,source.observed?.provider])if(provider!==undefined&&!authority.names.includes(normalizedIdentity(provider)))return false;
 for(const codes of [source.courseCodes,source.scope?.courseCodes])if(codes!==undefined&&(!Array.isArray(codes)||!codes.length||!codes.some(code=>aliases.has(normalizedIdentity(code)))))return false;
 for(const record of [source,source.observed,source.reviewedFacts]){
  if(!record||typeof record!=='object')continue;
  for(const value of [record.aceId,record.providerCourseCode])if(value!==undefined&&!aliases.has(normalizedIdentity(value)))return false;
  if(record.sourceCredits!==undefined&&!near(record.sourceCredits,option.sourceCredits)||record.sourceCreditSystem!==undefined&&record.sourceCreditSystem!==option.sourceCreditSystem||record.offered===false)return false;
  for(const key of ['recommendationStart','recommendationEnd'])if(record[key]!==undefined&&record[key]!==option[key])return false;
  const version=record.aceVersion??record.courseVersion;
  if(version!==undefined&&String(version)!==String(option.courseVersion??option.version))return false;
 }
 const aceCode=text(option.aceId||option.code).toUpperCase();
 return !/^[A-Z]{4}-\d{4}$/.test(aceCode)||aceCode.startsWith(authority.acePrefix+'-');
}
/** Publisher identity is independent from the receiving university award.
 * Provider pages and exact ACE/Credly recommendation exhibits are both valid
 * primary sources. Domain, declared issuer/course bindings and current dates
 * must agree; an arbitrary accreditor or another school's map never qualifies. */
export function isIndependentProviderIdentitySource(source,option,{asOf}={}){
 assertDate(asOf);
 const authority=identityAuthorities[option?.provider];
 if(!authority||!currentSource(source,asOf)||officialWgu(source)||!declaredIdentityMatches(source,option,authority))return false;
 const url=new URL(source.url),host=url.hostname,owns=domain=>host===domain||host.endsWith('.'+domain),roles=list(source.roles);
 if(source.roles!==undefined&&!roles.some(role=>['provider-identity','source-credit-recommendation','recommendation-period'].includes(role)))return false;
 if(authority.domains.some(owns))return !source.kind||source.kind==='provider';
 if(owns('acenet.edu')){
  if(!['ace','accreditor'].includes(source.kind)||!/^\/National-Guide\/Pages\/Course\.aspx$/i.test(url.pathname)||!roles.includes('provider-identity'))return false;
  const cid=url.searchParams.get('cid'),organizationId=url.searchParams.get('oid'),organization=url.searchParams.get('org');
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cid||'')||organizationId&&organizationId.toLowerCase()!==authority.aceOrganizationId||organization&&!authority.names.includes(normalizedIdentity(organization)))return false;
  return organizationId?.toLowerCase()===authority.aceOrganizationId||Boolean(organization&&authority.names.includes(normalizedIdentity(organization)));
 }
 if(owns('credly.com')){
  // Public organization recommendation pages are source documents. A learner's
  // individual awarded badge is not a provider-course definition.
  const organization=url.pathname.match(/^\/(?:org|organizations)\/([^/]+)\/badge\//i)?.[1],issuer=normalizedIdentity(organization),knownIssuer=authority.names.includes(issuer)||['americancounciloneducation','americancounciloneducationace'].includes(issuer);
  return ['ace','accreditor','provider'].includes(source.kind)&&roles.includes('provider-identity')&&knownIssuer&&authority.names.includes(normalizedIdentity(source.provider||source.scope?.provider))&&list(source.courseCodes).some(code=>[option.code,option.aceId,option.providerCourseCode,...list(option.codeAliases)].some(value=>normalizedIdentity(value)===normalizedIdentity(code)));
 }
 return false;
}
function reviewedSelectedAwards(model,plan,sources,asOf){
 const selected=selectedOptions(model,plan).filter(({option})=>option?.provider!=='University');
 if(!selected.length)return false;
 return selected.every(({requirement,option})=>{
  const award=option.mappingEvidence,identity=option.sourceCreditVerification,awardIds=list(award?.sourceIds),identityIds=list(option.identitySourceIds);
  if(mappingFinding(model,requirement,option)||option.evidence!=='published'||option.evidenceType!=='official-receiving-school-equivalency'||!text(option.mappingReviewId)||date(option.mappingChecked)===null||date(option.mappingChecked)>date(asOf)||date(asOf)-date(option.mappingChecked)>=30*day||option.eligibilityReview?.eligibleToStart===false)return false;
  if(award?.schoolName!==model.school||award.programName!==model.title||award.catalogYear!==text(model.catalogYear||model.catalog)||award.level!=='bachelor'||award.modality!=='online'||award.provider!==option.provider||award.providerCourseCode!==option.code||award.receivingCode!==requirement.code||!near(award.credits,option.credits)||award.creditSystem!==model.creditSystem||!bound(sources,awardIds)||!awardIds.every(id=>list(option.sourceIds).includes(id)))return false;
  if(!awardIds.every(id=>{const source=sources.get(id);return officialWgu(source)&&currentSource(source,asOf)&&source.scope?.schoolName===model.school&&source.scope?.programName===model.title&&source.scope?.catalogYear===award.catalogYear&&source.scope?.level==='bachelor'&&source.scope?.modality==='online'&&list(source.roles).includes('receiving-map');}))return false;
  return option.sourceCreditStatus==='verified'&&finite(option.sourceCredits)&&option.sourceCredits>0&&['semester','quarter','competency-unit'].includes(option.sourceCreditSystem)&&near(identity?.credits,option.sourceCredits)&&identity?.creditSystem===option.sourceCreditSystem&&bound(sources,identityIds)&&identityIds.every(id=>!awardIds.includes(id)&&isIndependentProviderIdentitySource(sources.get(id),option,{asOf}))&&bound(sources,identity?.sourceIds)&&identity.sourceIds.every(id=>!awardIds.includes(id)&&isIndependentProviderIdentitySource(sources.get(id),option,{asOf}));
 });
}
function noticeModelDigest(model){
 const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const {unresolved,...academic}=model;
 return createHash('sha256').update(JSON.stringify(canonical(academic))).digest('hex');
}
function compiledNoticeBaseline(model,input,{asOf,sources}){
 const proof=input.noticeCompilation,choices=proof?.baselineOptionSelections,requirements=list(model.requirements);
 if(proof?.version!==1||proof.modelId!==model.id||proof.catalog!==text(model.catalogYear||model.catalog)||proof.modality!==format(model.format)||proof.creditSystem!==model.creditSystem||proof.academicInputSha256!==noticeModelDigest(model)||date(proof.classifiedAsOf)===null||date(proof.classifiedAsOf)>date(asOf)||!plain(choices)||Object.keys(choices).length!==requirements.length)return null;
 if(!list(input.sourceIds).every(id=>proof.sourceReviewDates?.[id]===sourceDate(sources.get(id)))||requirements.some(row=>!text(choices[row.id])||!list(row.options).some(option=>option.id===choices[row.id])))return null;
 try{return Planner.generate(model,{providers:unique(requirements.flatMap(row=>list(row.options).map(option=>option.provider)).filter(provider=>provider!=='University')),allowConditional:true,priority:'transfer',completed:[],optionSelections:choices});}catch{return null;}
}
function classifyScopedNotice(model,input,{asOf,plan,sources}){
 const typed=plain(input)&&input.kind==='degree-research-notice'&&input.scope===undefined&&input.appliesWhen===undefined&&input.requirementIds===undefined&&input.optionIds===undefined&&['curriculum-identifiers','additional-transfer-options','personal-catalog-selection','selected-transfer-awards'].includes(input.topic)&&input.status===(input.topic==='personal-catalog-selection'?'personal-task':'informational');
 const topic=typeof input==='string'?wguNoticeTopics.get(input):typed?input.topic:null;
 if(!topic)return null;
 const ledger=reviewedWguLedger(model,sources,asOf);
 if(!ledger||typed&&(!bound(sources,input.sourceIds)||!input.sourceIds.every(id=>ledger.sourceIds.includes(id))))return null;
 const compiledBaseline=typed&&input.noticeCompilation?compiledNoticeBaseline(model,input,{asOf,sources}):null;
 if(typed&&input.noticeCompilation&&!compiledBaseline)return null;
 const common={blocking:false,classificationBasis:'current-scoped-ledger-and-typed-question',sourceIds:[...ledger.sourceIds],field:topic};
 if(topic==='curriculum-identifiers')return {category:'missing-research',code:'curriculum-identifier-format',...common};
 if(topic==='personal-catalog-selection')return {category:'student-task',code:'personal-catalog-selection',executionRequired:true,...common};
 const evaluatedPlan=plan||compiledBaseline;
 if(!completeNamedBaseline(model,evaluatedPlan))return null;
 if(topic==='additional-transfer-options')return {category:'missing-research',code:'additional-transfer-options',...common};
 if(topic==='selected-transfer-awards'&&reviewedSelectedAwards(model,evaluatedPlan,sources,asOf))return {category:'missing-research',code:'selected-transfer-awards-reviewed',...common};
 return null;
}
/** Compile source-proven notice states for the student planner as well as the
 * publication report. This changes notice metadata only: no academic course,
 * transfer award, numeric rule, source review date or learner record is changed. */
export function compileScopedResearchNotices(model,{asOf}={}){
 assertDate(asOf);
 const notices=list(model?.unresolved),known=note=>typeof note==='string'?wguNoticeTopics.has(note):plain(note)&&note.kind==='degree-research-notice';
 if(!notices.some(known))return model;
 const sources=sourceMap(model),providers=unique(list(model.requirements).flatMap(row=>list(row.options).map(option=>option.provider)).filter(provider=>provider!=='University'));
 let plan=null;
 try{plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[]});}catch{/* A failed baseline cannot support a nonblocking compilation. */}
 const unresolved=notices.map(input=>{
  if(!known(input))return input;
  const message=typeof input==='string'?input:text(input.message),proof=classifyScopedNotice(model,input,{asOf,plan,sources});
  if(!proof){
   if(typeof input==='string')return input;
   return {...input,status:'unresolved',owner:'DegreeSteps',blocking:true,noticeProofStatus:'needs-current-scoped-evidence'};
  }
  const topic=typeof input==='string'?wguNoticeTopics.get(input):input.topic;
  return {...(plain(input)?input:{}),kind:'degree-research-notice',topic,message,status:proof.category==='student-task'?'personal-task':'informational',owner:proof.category==='student-task'?'student':'DegreeSteps',blocking:false,sourceIds:[...proof.sourceIds],noticeProofStatus:'current-scoped-evidence',noticeCompilation:{version:1,modelId:model.id,catalog:text(model.catalogYear||model.catalog),modality:format(model.format),creditSystem:model.creditSystem,classificationCode:proof.code,classifiedAsOf:asOf,academicInputSha256:noticeModelDigest(model),baselineOptionSelections:Object.fromEntries(list(plan?.rows).map(row=>[row.requirementId,row.option?.id||null])),sourceReviewDates:Object.fromEntries(proof.sourceIds.map(id=>[id,sourceDate(sources.get(id))]))}};
 });
 return {...model,unresolved};
}
function selectedOptions(model,plan){
 const requirements=new Map(list(model?.requirements).map(row=>[row.id,row]));
 if(!plan)return list(model?.requirements).flatMap(requirement=>list(requirement.options).map(option=>({requirement,option})));
 return list(plan.rows).filter(row=>row.status==='planned'&&row.option).map(row=>{
  const requirement=requirements.get(row.requirementId),option=list(requirement?.options).find(option=>option.id===row.option.id&&option.provider===row.option.provider&&option.code===row.option.code);
  return {requirement,option:option||row.option};
 });
}
function selectedNote(note,plan){
 if(!plan||note.scope!=='selected-options')return true;
 return list(plan.rows).some(row=>row.status==='planned'&&row.option&&(!note.requirementIds||note.requirementIds.includes(row.requirementId))&&(!note.optionIds||note.optionIds.includes(row.option.id))&&(!note.selectionRequiredOnly||row.selectionRequired||row.option.selectionRequired));
}
function reviewedCategoryPlacement(model,requirement,option,sources){
 const award=option?.mappingEvidence,placement=option?.degreePlacementEvidence;
 return option?.categoryPlacementReviewed===true&&option.evidenceType==='official-receiving-school-equivalency'&&option.receivingMapStatus==='published-institutional-category'&&option.mappingResearchClosed===true&&
  text(option.receivingCategory)&&award?.receivingCategory===option.receivingCategory&&placement?.receivingCategory===option.receivingCategory&&
  award.schoolName===model.school&&award.publisher===model.school&&award.provider===option.provider&&award.providerCourseCode===option.code&&near(award.credits,option.credits)&&award.creditSystem===model.creditSystem&&bound(sources,award.sourceIds)&&
  placement.modelId===model.id&&placement.schoolName===model.school&&placement.catalogYear===model.catalogYear&&placement.modality===format(model.format)&&placement.requirementId===requirement.id&&near(placement.actualAllocatedCredits,option.credits)&&placement.creditSystem===model.creditSystem&&bound(sources,placement.sourceIds)&&
  (placement.placementType==='general-category'&&requirement.category==='general'||placement.placementType==='free-elective-category'&&requirement.freeElective===true);
}
function mappingFinding(model,requirement,option){
 const sources=sourceMap(model),details={requirementIds:[requirement?.id],optionIds:[option?.id],sourceIds:list(option?.sourceIds)};
 if(option?.provider==='University')return null;
 const typedCategory=['general-category','free-elective-category'].includes(option?.allocationType)&&!text(option?.receivingCode);
 const receivingIdentity=typedCategory?reviewedCategoryPlacement(model,requirement,option,sources):text(option?.receivingCode||requirement?.code);
 if(!text(option?.code)||!receivingIdentity||!bound(sources,option?.sourceIds))return finding(model,'missing-research','mapping-evidence','An outside course needs its exact source identity, receiving award and usable evidence references.',details);
 const eligibility=option.eligibilityReview,documented=option.mappingResearchClosed===true&&/^published-/.test(option.receivingMapStatus||'');
 if(eligibility?.eligibleToStart===false)return finding(model,'conditional-policy','provider-eligibility','The receiving match may be documented, but provider eligibility is not cleared for enrollment.',{...details,sourceIds:[...details.sourceIds,...list(eligibility.sourceIds)],mappingDocumented:documented,evidenceStrength:documented?'documented':'conditional'});
 if(/same.school.*(?:another degree|other degree)|exact degree.*require confirmation|researched in another degree/i.test(option.mappingScope||''))return finding(model,'missing-research','mapping-scope','A receiving match researched for another pathway needs an explicit applicable school, format and catalog scope.',details);
 if(option.evidence==='published')return null;
 if(option.evidence!=='conditional')return finding(model,'missing-research','mapping-status','The outside award has no published or reviewed conditional mapping status.',details);
 if(documented&&list(option.conditions).length>0&&list(option.conditions).every(condition=>!/unknown|pending|unverified|provisional|confirm.*(?:school|equival|policy|program|course|grade|award)|var(?:y|ies) by degree|program.specific/i.test(condition)&&/individual|transcript|pass(?:ing)?|minimum grade|before.*enroll|complete.*before|recommendation (?:window|period).*\d{4}/i.test(condition)))return finding(model,'student-task','documented-personal-conditions','The receiving match is documented; the student must satisfy its published personal conditions.',{...details,blocking:false,evidenceStrength:'documented',executionRequired:true});
 if(/var(?:y|ies) by degree|confirm.*exact program|program.specific|receiving.*title/i.test(list(option.conditions).join(' '))||option.evidenceType==='provider-partnership')return finding(model,'missing-research','mapping-applicability','A provider or title-level match still needs exact receiving-program applicability.',details);
 return finding(model,'conditional-policy','conditional-award','The selected outside award has documented conditions that have not been cleared as enrollment-ready.',{...details,evidenceStrength:'conditional'});
}

export function classifyModelFindings(model,{asOf,plan}={}){
 assertDate(asOf);
 const sources=sourceMap(model),items=[];
 const add=(category,code,message,extra)=>items.push(finding(model,category,code,message,extra));
 for(const input of [model?.policyReview,model?.unresolvedChecks]){
  const checks=Array.isArray(input)?input:plain(input)?Object.entries(input).map(([field,value])=>plain(value)?{field,...value}:{field,message:value}):typeof input==='string'?[input]:[];
  for(const check of checks){
   if(check==null||check===false||check===true||plain(check)&&['verified','confirmed','resolved','not-applicable'].includes(check.status))continue;
   add('missing-research','policy-unresolved',typeof check==='string'?check:text(check?.message)||text(check?.notes)||'A degree-specific academic policy needs reviewed evidence.',{field:check?.field||null,sourceIds:list(check?.sourceIds)});
  }
 }
 for(const input of list(model?.unresolved)){
  const note=typeof input==='string'?{message:input}:plain(input)?input:{message:String(input)};
  const typedNotice=plain(input)&&input.kind==='degree-research-notice';
  if(!typedNotice&&!selectedNote(note,plan))continue;
  if(!typedNotice&&note.status==='resolved'&&bound(sources,note.sourceIds))continue;
  if(!typedNotice&&note.appliesWhen==='transfer-waiver'&&!model.appliedTransferWaiver)continue;
  const message=text(note.message)||'A degree research item has not been classified.';
  const extra={field:note.field||null,requirementIds:list(note.requirementIds),optionIds:list(note.optionIds),sourceIds:list(note.sourceIds)};
  const scopedNotice=classifyScopedNotice(model,input,{asOf,plan,sources});
  if(scopedNotice){const {category,code,...proof}=scopedNotice;add(category,code,message,{...extra,...proof});continue;}
  if(typedNotice){add('missing-research','unresolved-research',message,{...extra,blocking:true,classificationBasis:'typed-notice-proof-not-established'});continue;}
  if(note.missingEvidence==='reviewed-source-identity'){
   for(const {requirement,option} of selectedOptions(model,plan)){
    if(option?.provider==='University'||note.requirementIds&&!note.requirementIds.includes(requirement?.id)||note.optionIds&&!note.optionIds.includes(option?.id)||note.selectionRequiredOnly&&!option?.selectionRequired&&!requirement?.selectionRequired)continue;
    if(text(option?.code)&&bound(sources,option?.identitySourceIds)&&text(option?.mappingReviewId)&&date(option?.mappingChecked||option?.mappingCheckedOn)!==null)continue;
    add('missing-research','selected-source-identity','The exact original course identity, version and recommendation period need reviewed provider evidence.',{...extra,requirementIds:[requirement?.id],optionIds:[option?.id],sourceIds:unique([...extra.sourceIds,...list(option?.sourceIds)]),blocking:true,legacyBlocking:note.blocking!==false,publicationPolicy:'complete-source-and-award-evidence'});
   }
   continue;
  }
  if(/duplicate.award exclusions?/i.test(message)){
   add('missing-research','duplicate-award-research',message,{...extra,blocking:true,legacyBlocking:note.blocking!==false,publicationPolicy:'complete-source-and-award-evidence'});continue;
  }
  if(note.owner==='student'&&note.status==='personal-task'&&bound(sources,note.sourceIds))add('student-task','personal-condition',message,{...extra,blocking:false,executionRequired:true});
  else if(typeof input==='string'&&scopeNote(message))add(scopeNote(message),'baseline-scope',message,{...extra,blocking:false,executionRequired:false,classificationBasis:'recognized-scope-statement'});
  else if(note.blocking===false&&bound(sources,note.sourceIds))add('missing-research','optional-research',message,{...extra,blocking:false});
  else add('missing-research','unresolved-research',message,extra);
 }
 for(const {requirement,option} of selectedOptions(model,plan)){
  const item=mappingFinding(model,requirement,option);if(item)items.push(item);
  if(option?.preapprovalRequired===true)add('student-task','preapproval-required','Obtain the university’s required individual pre-approval before purchasing this course.',{requirementIds:[requirement?.id],optionIds:[option.id],sourceIds:list(option.sourceIds),blocking:false,executionRequired:true});
 }
 const grouped=new Map();
 for(const item of items){
  const key=JSON.stringify([item.category,item.code,item.message,item.optionIds,item.sourceIds,item.field,item.blocking]);
  if(!grouped.has(key))grouped.set(key,item);else grouped.get(key).requirementIds=unique([...grouped.get(key).requirementIds,...item.requirementIds]);
 }
 return [...grouped.values()].map(item=>({...item,id:idFor(model?.id,item.code,[item.category,item.message,item.requirementIds,item.optionIds,item.sourceIds,item.field,item.blocking])}));
}

function catalogIdentity(model,sources){
 const label=text(model?.catalogYear||model?.catalog).replace(/[–—]/g,'-'),ranges=unique(label.match(/20\d{2}-20\d{2}/g)||[]);
 if(ranges.length===1&&Number(ranges[0].slice(5))===Number(ranges[0].slice(0,4))+1)return {kind:'academic-year',value:ranges[0]};
 if(/^20\d{2}(?:(?:0[1-9]|1[0-2]))?$/.test(label))return {kind:label.length===6?'monthly-catalog':'calendar-year',value:label};
 const identity=model?.catalogIdentity;
 if(identity?.kind==='reviewed-current-catalog'&&text(identity.label)&&identity.label===model.catalog&&date(identity.checkedOn)!==null&&https(identity.sourceUrl)&&[...sources.values()].some(source=>https(source.url)===https(identity.sourceUrl)&&sourceDate(source)===identity.checkedOn))return {kind:'reviewed-current-catalog',value:https(identity.sourceUrl),reviewedOn:identity.checkedOn};
 return null;
}
function estimateAxes(model,plan,add){
 const cost=plan?.costs||{},timing=plan?.timing||{},rounded=value=>Math.round(value*100)/100;
 const breakdown=finite(cost.universityTuition)&&cost.universityTuition>=0&&finite(cost.fees)&&cost.fees>=0&&Array.isArray(cost.providerCosts)&&cost.providerCosts.every(quote=>finite(quote.amount)&&quote.amount>=0);
 const componentTotal=breakdown?rounded(cost.universityTuition+cost.fees+cost.providerCosts.reduce((sum,quote)=>sum+quote.amount,0)):null;
 const complete=cost.costComplete===true&&finite(cost.total)&&cost.total>=0&&finite(cost.knownSubtotal)&&near(cost.total,cost.knownSubtotal)&&breakdown&&near(cost.total,componentTotal)&&Array.isArray(cost.missing)&&cost.missing.length===0&&!cost.universityTermConflict;
 if(cost.costComplete===true&&!complete)add('estimate','invalid-complete-cost','A complete price claim needs a reconciled nonnegative tuition, provider and fee breakdown with no missing price assumptions.',{blocking:true});
 if(cost.costComplete!==true&&cost.total!=null)add('estimate','unqualified-total','An incomplete price cannot be presented as a complete total.',{blocking:true});
 if(timing.scenarioWeeks!=null&&(!finite(timing.scenarioWeeks)||timing.scenarioWeeks<0||timing.verified!==true&&!list(timing.assumptions).length))add('estimate','unsupported-duration','A finish-time estimate needs valid units and declared assumptions.',{blocking:true});
 return {cost:{status:complete?'complete-estimate':finite(cost.knownSubtotal)||finite(cost.universityTuition)?'partial-estimate':'not-estimated',total:complete?cost.total:null,knownSubtotal:finite(cost.knownSubtotal)?cost.knownSubtotal:null,feesComplete:complete,missing:list(cost.missing).filter(value=>typeof value==='string')},timing:{status:finite(timing.scenarioWeeks)?timing.verified===true?'source-supported-scenario':'assumption-based-scenario':'not-estimated',weeks:finite(timing.scenarioWeeks)?timing.scenarioWeeks:null,assumptions:list(timing.assumptions).filter(value=>typeof value==='string')}};
}

function derivedValidationFindings(model,plan,findings){
 const sources=sourceMap(model),output=[],rows=list(plan?.rows);
 for(const [collection,issues] of [['errors',plan?.validation?.errors],['researchNotes',plan?.validation?.researchNotes],['personalTasks',plan?.validation?.personalTasks]])for(const issue of list(issues)){
  const message=text(issue?.message);if(!message)continue;
  const requirementIds=unique([...list(issue.requirementIds),issue.requirementId]),optionIds=unique([...list(issue.optionIds),issue.optionId]);
  const relevant=rows.filter(row=>(!requirementIds.length||requirementIds.includes(row.requirementId))&&(!optionIds.length||optionIds.includes(row.option?.id)));
  const sourceIds=unique([...list(issue.sourceIds),...relevant.flatMap(row=>list(row.option?.sourceIds))]);
  if(list(model?.unresolved).some(note=>typeof note==='string'&&note===message&&scopeNote(note)))continue;
  if(findings.some(item=>item.message===message&&requirementIds.every(id=>item.requirementIds.includes(id))))continue;
  if(issue.code==='conditional_mapping'&&relevant.some(row=>findings.some(item=>item.optionIds.includes(row.option?.id)&&item.requirementIds.includes(row.requirementId))))continue;
  let category='missing-research',blocking=collection==='errors'||issue.blocking!==false,code='validation-'+text(issue.code||collection),extra={};
  if(collection==='personalTasks'||issue.owner==='student'&&['personal-task','reported_credit'].includes(issue.status||issue.code)){
   if(bound(sources,sourceIds)){category='student-task';blocking=false;extra.executionRequired=true;}
  }else if(issue.code==='conditional_mapping'||issue.code==='waiver_confirmation')category='conditional-policy';
  const criticalIdentity=issue.missingEvidence==='reviewed-source-identity',criticalDuplicate=/duplicate.award exclusions?/i.test(message);
  if(criticalIdentity&&findings.some(item=>item.code==='selected-source-identity'&&requirementIds.every(id=>item.requirementIds.includes(id))&&optionIds.every(id=>item.optionIds.includes(id))))continue;
  if(criticalDuplicate&&findings.some(item=>item.code==='duplicate-award-research'&&optionIds.every(id=>item.optionIds.includes(id))))continue;
  // Legacy planner notes were allowed to be nonblocking display warnings. A
  // complete published pathway still needs these actual source/award facts.
  if(criticalIdentity||criticalDuplicate){category='missing-research';blocking=true;code=criticalIdentity?'selected-source-identity':'duplicate-award-research';extra.publicationPolicy='complete-source-and-award-evidence';}
  output.push(finding(model,category,code,message,{...extra,requirementIds,optionIds,sourceIds,blocking,scope:requirementIds.length||optionIds.length?'selected-options':'program',legacyBlocking:issue.blocking!==false,derivedFrom:'validation.'+collection,field:issue.field||null}));
 }
 return output;
}

export function assessPathwayQuality({model,plan,route,asOf,studentPlan,minimumOutsideFraction=0.5}={}){
 assertDate(asOf);
 if(!finite(minimumOutsideFraction)||minimumOutsideFraction<0||minimumOutsideFraction>1)throw Error('Use a transfer-coverage fraction between zero and one.');
 if(list(plan?.rows).some(row=>['reported','confirmed'].includes(row.status)))throw Error('Catalog quality requires a fresh baseline; provide private results separately as studentPlan.');
 const findings=classifyModelFindings(model,{asOf,plan}),sources=sourceMap(model);
 findings.push(...derivedValidationFindings(model,plan,findings));
 const add=(category,code,message,extra={})=>findings.push(finding(model,category,code,message,extra));
 const identity=catalogIdentity(model,sources),degreeLevel=level(model?.level||route?.level),mode=format(model?.format),requirements=list(model?.requirements),rows=list(plan?.rows),required=new Map(requirements.map(row=>[row.id,row]));
 const identified=Boolean(text(model?.id)&&text(model?.school)&&text(model?.title)&&degreeLevel&&mode);
 if(!identified)add('missing-research','exact-program-identity','The exact school, degree level and study format need a stable researched identity.');
 if(!identity)add('missing-research','catalog-identity','The applicable catalog needs an exact edition or a source-bound reviewed current-catalog identity.');
 if(route&&(route.modelId!==model?.id||text(route.school)!==text(model?.school)||list(route.modalities).length&&!route.modalities.includes(mode)))add('missing-research','route-identity','The available route must identify this same researched degree and study format.');
 const ledger=finite(model?.totalCredits)&&model.totalCredits>0&&required.size===requirements.length&&requirements.length>0&&requirements.every(row=>text(row.id)&&text(row.title)&&finite(row.credits)&&row.credits>=0&&!row.researchGap)&&near(requirements.reduce((sum,row)=>sum+row.credits,0),model.totalCredits);
 if(!ledger)add('missing-research','incomplete-ledger','Every published degree requirement must be allocated once and the quantities must equal the degree total.');
 const balance=Planner.creditBalancePolicy(model),balanceValid=model?.degreeCreditBalancePolicy?.enabled!==true||Boolean(balance);
 if(!balanceValid)add('missing-research','earned-credit-policy','The earned-credit balance needs its exact reviewed GCU course identities and policy evidence.');
 const completeRow=row=>{
  const requirement=required.get(row.requirementId);
  if(row.status!=='planned'||!requirement||row.selectionRequired)return false;
  if(balance?.balanceRequirementIds.includes(requirement.id)){
   if(row.creditBalanceDerived!==true||row.nativeRequirementCredits!==0)return false;
   if(row.option===null)return row.credits===0;
   if(!row.option)return false;
   const option=requirement.options[0];return row.option.id===option.id&&row.option.provider===option.provider&&row.option.code===option.code&&near(row.credits,option.credits)&&near(row.option.credits,option.credits)&&!row.option.selectionRequired;
  }
  if(!row.option||!text(row.option.code)||row.option.selectionRequired)return false;
  if(near(row.credits,requirement.credits))return !balance||near(row.option.credits,row.credits)&&list(requirement.options).some(option=>option.id===row.option.id&&option.provider===row.option.provider&&option.code===row.option.code&&near(option.credits,row.credits));
  const binding=balance?.equivalencies.find(item=>item.requirementId===requirement.id);
  return Boolean(binding&&row.nativeRequirementCredits===requirement.credits&&near(row.credits,binding.awardedCredits)&&near(row.option.credits,binding.awardedCredits)&&binding.options.some(option=>option.optionId===row.option.id&&option.provider===row.option.provider&&option.code===row.option.code));
 };
 const completePlan=ledger&&balanceValid&&rows.length===requirements.length&&new Set(rows.map(row=>row.requirementId)).size===rows.length&&rows.every(completeRow)&&(!balance||near(rows.reduce((sum,row)=>sum+(finite(row.credits)?row.credits:0),0),model.totalCredits));
  if(!completePlan)add('missing-research','baseline-course-choices','A complete named, solver-checked baseline course plan is required.');
 if(plan?.validation?.academicCountsValid!==true)add('missing-research','academic-feasibility','The baseline does not pass the existing academic allocation and credit-rule checks.');
 if(plan?.validation?.policyChecksComplete!==true&&!findings.some(item=>item.code==='policy-unresolved'))add('missing-research','academic-policy-scope','Required credit, residency or level policies are not fully established.');
 for(const row of rows){
  const requirement=required.get(row.requirementId),option=list(requirement?.options).find(option=>option.id===row.option?.id&&option.provider===row.option?.provider&&option.code===row.option?.code);
  if(row.option&&!option)add('missing-research','unsupported-baseline-choice','A baseline choice is not part of the reviewed curriculum.',{requirementIds:[row.requirementId]});
  if(row.option?.provider==='University'&&!bound(sources,row.option.sourceIds))add('missing-research','university-course-evidence','A named university course needs its curriculum or offering evidence.',{requirementIds:[row.requirementId],sourceIds:list(row.option.sourceIds)});
 }
 const usedIds=unique([...rows.flatMap(row=>[...list(row.option?.sourceIds),...list(row.option?.identitySourceIds),...list(row.option?.eligibilityReview?.sourceIds),...list(row.option?.sourceCreditEvidence?.sourceIds)]),...list(model?.policySourceIds),...list(model?.residencyPolicy?.sourceIds),...list(model?.gradePolicy?.sourceIds),...list(model?.transferPolicyReview?.sourceIds),...list(model?.existingCreditReview?.sourceIds),...Object.values(model?.policyEvidence||{}).flatMap(rule=>list(rule?.sourceIds))]);
 for(const id of usedIds){
  const source=sources.get(id),review=sourceDate(source),stamp=date(review);
  if(!https(source?.url))add('missing-research','source-reference','An active evidence reference is missing or invalid.',{sourceIds:[id]});
  else if(stamp===null||stamp>date(asOf)||date(asOf)-stamp>=30*day)add('missing-research','source-review-due','An active evidence reference needs a real current review date.',{sourceIds:[id]});
 }
 const outside=rows.filter(row=>row.option&&row.option.provider!=='University'),sum=values=>values.reduce((total,row)=>total+(finite(row.credits)?row.credits:0),0),outsideCredits=sum(outside),outsideFraction=ledger?outsideCredits/model.totalCredits:null;
 const price=model?.pricing||{},selfPaced=/(?:competency|self.paced|direct.assessment)/.test(String(model?.paceModel||route?.paceModel||model?.learningFormat||'').toLowerCase())&&bound(sources,price.sourceIds)&&https(price.sourceUrl)&&[...sources.values()].some(source=>https(source.url)===https(price.sourceUrl));
 const undergraduate=['associate','bachelor'].includes(degreeLevel),mechanism=undergraduate&&outsideFraction>=minimumOutsideFraction?'mapped-transfer':selfPaced?'self-paced':null;
 const acceleration={eligible:mechanism!==null,mechanism,minimumOutsideFraction:undergraduate?minimumOutsideFraction:null,reason:mechanism?null:undergraduate?'The actual optimized outside-credit share does not reach the accelerated-library threshold.':'A source-supported accelerated or self-paced mechanism is not established.'};
 const estimates=estimateAxes(model,plan,add),blockingResearch=findings.filter(item=>item.blocking&&item.category==='missing-research'),conditional=findings.filter(item=>item.blocking&&item.category==='conditional-policy');
 const unavailable=!model||!ledger||!completePlan||plan?.validation?.academicCountsValid!==true;
 const status=unavailable?'unavailable':blockingResearch.length?'needs-research':conditional.length?'conditional':'research-ready';
 const invalidEstimates=findings.filter(item=>item.category==='estimate'&&item.blocking),publicationReady=status==='research-ready'&&acceleration.eligible&&!invalidEstimates.length;
 const publicTasks=findings.filter(item=>item.category==='student-task').map(({id,code,message,sourceIds,requirementIds,executionRequired})=>({id,code,message,sourceIds,requirementIds,executionRequired:executionRequired===true}));
 return {version:1,asOf,modelId:model?.id||null,status,publication:{ready:publicationReady,reasonCodes:unique([...blockingResearch,...conditional,...invalidEstimates].map(item=>item.code).concat(acceleration.eligible?[]:['acceleration-not-established']))},research:{status,blockingFindings:blockingResearch.length,conditionalFindings:conditional.length,exactProgramIdentity:identified,exactCatalogIdentity:identity,completeRequirementLedger:ledger,completeNamedBaseline:completePlan,academicCountsValid:plan?.validation?.academicCountsValid===true},acceleration,execution:{personalTasks:publicTasks,reportedRecordsCount:list(studentPlan?.rows).filter(row=>row.status==='reported').length,confirmedRecordsCount:list(studentPlan?.rows).filter(row=>row.status==='confirmed').length,awardedCreditsInBaseline:0},estimates,metrics:{degreeCredits:finite(model?.totalCredits)?model.totalCredits:null,feasibleOutsideCredits:completePlan&&plan?.validation?.academicCountsValid===true?outsideCredits:null,outsideFraction:completePlan&&plan?.validation?.academicCountsValid===true?outsideFraction:null,publishedOutsideCredits:sum(outside.filter(row=>row.option.evidence==='published')),conditionalOutsideCredits:sum(outside.filter(row=>row.option.evidence==='conditional'))},findings};
}
