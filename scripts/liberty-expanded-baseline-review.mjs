/** Scope a reviewed online baseline; public equivalencies remain separate from personal awards. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {libertyProviderIdentityReview} from './liberty-provider-identities.mjs';
import {readLibertyHealthUpperReview} from './liberty-health-upper-identities.mjs';
import {readReviewedOnlineAwards} from './liberty-online-guide-awards.mjs';
const list=value=>Array.isArray(value)?value:[],copy=value=>JSON.parse(JSON.stringify(value));
const catalog=value=>String(value||'').replace(/[–—]/g,'-');
export const libertyExpandedBaselineReview=JSON.parse(await readFile(new URL('../content/curricula/snapshots/liberty/expanded-online-baseline-review-2026-11-19.json',import.meta.url),'utf8'));
const healthIdentityReview=await readLibertyHealthUpperReview(),onlineAwards=await readReviewedOnlineAwards();
const official=source=>{try{const url=new URL(source?.url);return url.protocol==='https:'&&!url.username&&!url.password&&['catalog.liberty.edu','www.liberty.edu'].includes(url.hostname);}catch{return false;}};
export function applyLibertyExpandedBaselineReview(input,review=libertyExpandedBaselineReview){
 const scope=list(review?.scopes).find(value=>value.modelId===input?.id);
 if(!scope){
  const hold=list(review?.researchHolds).find(hold=>hold.modelId===input?.id);
  if(!hold||input.school!==review.school||input.format!==hold.format||catalog(input.catalogYear||input.catalog)!==hold.catalogYear||input.creditSystem!==hold.creditSystem||input.totalCredits!==hold.totalCredits||input.auditProvenance?.status==='student-provided')return input;
  const sources=new Map(list(input.sources).map(source=>[source.id,source]));
  if(!hold.sourceIds.every(id=>official(sources.get(id))&&sources.get(id)?.sha256===hold.sha256))return input;
  const model=copy(input);model.unresolved=[...list(model.unresolved).filter(note=>note?.id!==hold.id),{id:hold.id,message:hold.message,owner:'DegreeSteps',status:'unresolved',field:'prerequisites',sourceIds:[...hold.sourceIds]}];
  model.businessPrerequisiteResearchHold={id:hold.id,checkedOn:review.checkedOn,pdfPages:[...hold.pdfPages],personalAwardsCreated:0};return model;
 }
 if(input.school!==review.school||input.format!==scope.format||catalog(input.catalogYear||input.catalog)!==scope.catalogYear||input.creditSystem!==scope.creditSystem||input.totalCredits!==scope.totalCredits||input.auditProvenance?.status==='student-provided')return input;
 assert(review.version===1&&review.checkedOn==='2026-11-19','Use the exact baseline review packet.');
 const model=copy(input),sources=new Map(list(model.sources).map(value=>[value.id,value]));
 const scopedSourceIds=new Set([...scope.degreeSourceIds,...scope.policySourceIds,...scope.prerequisiteSourceIds]);
 for(const source of review.sources){if(!scopedSourceIds.has(source.id))continue;assert(official(source)&&/^[a-f0-9]{64}$/.test(source.sha256||''),'Baseline classification needs its original official capture hash.');sources.set(source.id,copy(source));}
 assert(scope.degreeSourceIds.every(id=>official(sources.get(id)))&&scope.policySourceIds.every(id=>official(sources.get(id)))&&scope.prerequisiteSourceIds.every(id=>official(sources.get(id))),'The exact degree, policy and course sources must remain bound.');
 assert(model.requirements.reduce((sum,row)=>sum+row.credits,0)===scope.totalCredits&&model.majorResidencyBasisCredits===scope.majorResidencyBasisCredits&&model.majorInstitutionFraction===.25,'The reviewed degree ledger or residency denominator changed.');
 assert(model.institutionMinCredits===30&&model.externalMaxCredits===90&&!Number.isFinite(model.alternativeMaxCredits),'A separately published or conflicting credit ceiling needs its own review.');
 model.sources=[...sources.values()];
 model.policyReview=list(model.policyReview).filter(value=>!(value?.field==='alternativeMaxCredits'&&(value.reviewId===review.id||value.status==='unverified'&&value.message==='Confirm the combined limit on alternative credit sources.')));
 model.policyReview.push({field:'alternativeMaxCredits',reviewId:review.id,status:'not-applicable',sourceIds:[...scope.policySourceIds],checkedOn:review.checkedOn,message:'The reviewed online undergraduate policy does not publish a separate aggregate alternative-credit ceiling. This route retains the 90-credit overall transfer ceiling and 30-credit Liberty minimum; no numeric alternative-credit allowance or individual award is inferred.'});
 model.policyEvidence={...model.policyEvidence,majorResidencyBasisCredits:{value:scope.majorResidencyBasisCredits,creditSystem:'semester',sourceIds:[...scope.degreeSourceIds],calculation:scope.majorLedgerCalculation}};
 const readyOptions=new Map();
 if(scope.retainedUniv104){
  const prior=model.requirements.find(row=>row.id===scope.retainedUniv104.replacesRequirementId),existing=model.requirements.find(row=>row.id==='univ-104');
  assert(!model.appliedTransferWaiver,'A waiver-specific allocation needs separate review.');
  if(!existing){assert(prior?.freeElective===true&&prior.credits===3,'The retained UNIV 104 allocation must replace one published three-credit elective.');
   const course={id:'univ-104',code:'UNIV 104',title:'Instructional Technology for Successful Online Learning',credits:3,category:'general',group:'technology',upper:false,institutionalOnly:true,sourceIds:[...scope.degreeSourceIds],options:[{id:'university-univ-104',provider:'University',code:'UNIV 104',title:'Instructional Technology for Successful Online Learning',credits:3,upper:false,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:[...scope.degreeSourceIds]}]};
   model.requirements=model.requirements.map(row=>row.id===prior.id?course:row);
   if(Array.isArray(model.curriculumSections))model.curriculumSections=model.curriculumSections.map(section=>({...section,requirementIds:list(section.requirementIds).filter(id=>id!==prior.id)}));
  }else assert(existing.credits===3&&existing.options.some(option=>option.provider==='University'&&option.code==='UNIV 104'&&option.credits===3)&&!prior,'Keep the retained three-credit UNIV 104 scenario.');
  // The original import described root categories as sections. The worksheet reserves
  // those root IDs; model the catalog's actual components as children instead.
  const legacySections=list(model.curriculumSections);
  if(legacySections.length===3&&legacySections.every(section=>!section.parentId&&['general','major','electives'].includes(section.id))&&new Set(legacySections.map(section=>section.id)).size===3){
   const groups=[['general-education','General education / foundational skills','general',row=>row.category==='general',36],['major-foundations','Major foundational courses','major',row=>row.category==='major'&&row.group==='major-foundations',12],['major-core','Psychology major core','major',row=>row.category==='major'&&row.group==='major-core',39],['free-electives','Free electives','elective',row=>row.category==='electives',33]];
   const sections=groups.map(([id,title,parentId,include,credits])=>{const rows=model.requirements.filter(include);assert(rows.reduce((sum,row)=>sum+row.credits,0)===credits,'Keep the reviewed Psychology component allocation.');return{id,title,parentId,requirementIds:rows.map(row=>row.id),sourceId:scope.degreeSourceIds[0]};});
   assert(sections.flatMap(section=>section.requirementIds).length===model.requirements.length,'Every Psychology requirement belongs to one allocated component.');
   // These six credits also meet general education, but are owned and counted once
   // in major foundations, as the catalog and this baseline's allocation specify.
   assert(['biol-102','psyc-101'].every(id=>model.requirements.some(row=>row.id===id&&row.credits===3&&row.group==='major-foundations')),'Keep the documented Psychology general-education overlaps.');
   sections[0].sharedRequirementIds=['biol-102','psyc-101'];
   model.curriculumSections=sections;
  }
  model.rulesNotes=list(model.rulesNotes).map(note=>note===scope.retainedUniv104.previousAllocationNote?scope.retainedUniv104.nextAllocationNote:/UNIV 104.*zero.credit|zero credits.*scenario/i.test(note)?'UNIV 104 retains three credits in this baseline. An approved zero-credit determination can release those hours for electives within the published range; no waiver is assumed.':note);
  model.obligations=list(model.obligations).map(note=>note.title==='UNIV 104 evaluation'?{...note,title:'UNIV 104 retained',notes:'This baseline includes the printed three-credit UNIV 104 case and 33 unrestricted elective credits. An individually approved zero-credit case can change that allocation within the published range.'}:note);
 }
 for(const choice of scope.choices.filter(choice=>choice.provider==='Study.com')){
  const row=model.requirements.find(row=>row.id===choice.requirementId),course=healthIdentityReview.courses.find(course=>course.code===choice.providerCode&&course.receivingCode===choice.receivingCode),award=onlineAwards.awards.find(award=>award.provider==='Study.com'&&award.code===choice.providerCode&&award.receivingCode===choice.receivingCode);
  assert(row?.freeElective===true&&row.category==='electives'&&row.credits===3&&!row.institutionalOnly&&!row.allowedCoursePrefixes?.length&&!row.allowedCourseCodes?.length&&course&&award&&course.receivingCredits===3&&award.credits===3&&course.sourceCredits===3&&course.sourceCreditSystem==='semester'&&course.sourceUpper===true&&course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn,'Use a reviewed current independent Study identity and exact online receiving award in an unrestricted elective.');
  assert(!model.requirements.some(other=>other.id!==row.id&&other.code===course.receivingCode),'A Study elective cannot duplicate a fixed degree requirement.');
  const guide=onlineAwards.sources.find(source=>source.id===course.guideSourceId);assert(guide?.modality==='online'&&guide.provider==='Study.com'&&official(guide)&&guide.sourceContentHash==='sha256:'+healthIdentityReview.sources.find(source=>source.id===course.guideSourceId)?.sha256,'Keep the exact same reviewed online guide, not another degree’s placement.');
  for(const source of healthIdentityReview.sources)sources.set(source.id,copy(source));
  const id='liberty-reviewed-study-'+course.code.toLowerCase()+'-'+row.id,independent=[course.aceSourceId,...(course.providerSourceId?[course.providerSourceId]:[])];
  const option={id,provider:'Study.com',code:course.code,title:course.title,providerCourseCode:course.providerCourseCode,codeAliases:[course.providerCourseCode],credits:3,creditSystem:'semester',sourceCredits:3,sourceCreditSystem:'semester',sourceUpper:true,upper:true,creditOrigin:'alternative',sourceType:'ACE',sourceCreditStatus:'reviewed-independent-recommendation',sourceCreditEvidence:{status:'reviewed',sourceIds:independent,aceVersion:course.aceVersion,checkedOn:healthIdentityReview.checkedOn},identitySourceIds:independent,receivingCode:course.receivingCode,receivingTitle:award.receivingTitle,evidence:'published',evidenceType:'official-receiving-school-equivalency',sourceIds:[course.guideSourceId,...row.sourceIds],url:guide.url,courseUrl:course.providerCourseUrl,providerCourseUrl:course.providerCourseUrl,courseVersion:String(course.aceVersion),recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,recommendationPeriodSourceIds:[course.aceSourceId],minScore:course.minScore,providerCoursePassingPercent:course.minScore,providerCoursePassingSourceIds:[course.aceSourceId],mappingChecked:review.checkedOn,mappingReviewId:review.id,mappingResearchClosed:true,receivingMapStatus:'published-online-receiving-award',mappingScope:'Exact institution-wide online receiving-course award independently placed in this catalog’s unrestricted free-elective component. No named major requirement is substituted.',sourcePage:award.sourcePage,eligibilityReview:{status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window',sourceIds:independent,checkedOn:healthIdentityReview.checkedOn},degreePlacementEvidence:{modelId:model.id,catalogYear:scope.catalogYear,modality:'online',requirementId:row.id,receivingCode:course.receivingCode,credits:3,creditSystem:'semester',placementType:'free-elective',sourceIds:[...row.sourceIds]},conditions:['Complete this exact reviewed provider version within its recommendation window '+course.recommendationStart+' through '+course.recommendationEnd+'.','Submit the official transcript for Liberty’s individual evaluation and avoid duplicate learning.']};
  row.options=[...row.options.filter(existing=>existing.id!==id),option];readyOptions.set(row.id+'|'+option.code,option);
 }
 model.sources=[...sources.values()];
 for(const row of model.requirements)for(const option of list(row.options)){
  const identity=option.sourceCreditEvidence,placement=option.degreePlacementEvidence,eligibility=option.eligibilityReview;
  const pending=eligibility?.eligibleToStart===false&&eligibility.status==='needs-independent-provider-review'&&eligibility.recommendationPeriodStatus==='version-period-link-still-to-review',alreadyReviewed=eligibility?.eligibleToStart===true&&eligibility.status==='current-provider-version-reviewed'&&eligibility.recommendationPeriodStatus==='reviewed-current-window'&&eligibility.reviewId===review.id;
  if(option.provider!=='Sophia'||!pending&&!alreadyReviewed||identity?.status!=='reviewed'||option.sourceCreditStatus!=='verified-current-provider-and-ace')continue;
  const original=libertyProviderIdentityReview.courses.find(course=>course.aceId===option.code);
  if(!original||original.activeOffering!==true||original.sourceCredits!==option.sourceCredits||String(original.aceVersion)!==String(option.courseVersion)||original.recommendationStart!==option.recommendationStart||original.recommendationEnd!==option.recommendationEnd||!original.identitySourceIds.every(id=>list(identity.sourceIds).includes(id)&&list(option.identitySourceIds).includes(id)&&sources.get(id)?.url===libertyProviderIdentityReview.sources.find(source=>source.id===id)?.url&&sources.get(id)?.sha256===libertyProviderIdentityReview.sources.find(source=>source.id===id)?.sha256))continue;
  if(option.sourceCredits!==3||option.sourceCreditSystem!=='semester'||option.credits!==3||String(identity.aceVersion)!==String(option.courseVersion)||option.recommendationStart>review.checkedOn||option.recommendationEnd<review.checkedOn||!/^20\d\d-\d\d-\d\d$/.test(option.recommendationStart)||!/^20\d\d-\d\d-\d\d$/.test(option.recommendationEnd))continue;
  if(option.mappingResearchClosed!==true||option.receivingMapStatus!=='published-online-receiving-award'||option.evidenceType!=='official-receiving-school-equivalency'||!option.mappingReviewId||!option.mappingChecked||placement?.modelId!==model.id||placement.catalogYear!==scope.catalogYear||placement.modality!=='online'||placement.requirementId!==row.id||placement.receivingCode!==option.receivingCode||placement.credits!==row.credits||placement.creditSystem!=='semester')continue;
  const identitySources=list(identity.sourceIds).map(id=>sources.get(id)),periodSources=list(option.recommendationPeriodSourceIds).map(id=>sources.get(id)),awardSource=list(option.sourceIds).map(id=>sources.get(id)).find(source=>source?.evidenceType==='official-receiving-school-equivalency'&&source?.modality==='online'&&official(source)&&/^[a-f0-9]{64}$/.test(source.sha256||String(source.sourceContentHash||'').replace(/^sha256:/,'')));
  if(!awardSource||identitySources.length<3||identitySources.some(source=>!source||!/^[a-f0-9]{64}$/.test(source.sha256||''))||!identitySources.some(source=>source.kind==='provider')||!identitySources.some(source=>source.kind==='ace')||!periodSources.length||periodSources.some(source=>source?.kind!=='ace'))continue;
  option.eligibilityReview={status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window',sourceIds:[...identity.sourceIds,...option.recommendationPeriodSourceIds],checkedOn:review.checkedOn,reviewId:review.id};
  option.evidence='published';
  option.conditions=['Complete this exact reviewed provider version within its recommendation window '+option.recommendationStart+' through '+option.recommendationEnd+'.','Submit the official transcript for Liberty’s individual transfer evaluation, personal catalog eligibility, minimum grades and duplicate-learning check.','Provider membership charges and your actual completion time remain separate from this published course match.'];
  readyOptions.set(row.id+'|'+option.code,option);
 }
 const selections={};
 for(const choice of scope.choices){
  const row=model.requirements.find(row=>row.id===choice.requirementId),option=readyOptions.get(choice.requirementId+'|'+choice.providerCode);
  assert(row?.freeElective===true&&row.category==='electives'&&row.credits===3&&!row.allowedCoursePrefixes?.length&&!row.allowedCourseCodes?.length&&(row.upperOnly!==true||option?.upper===true)&&option?.receivingCode===choice.receivingCode&&option.provider===(choice.provider||'Sophia')&&option.upper===(choice.upper===true),'Keep the exact reviewed three-credit free-elective choice.');
  assert(!model.requirements.some(other=>other.id!==row.id&&other.code===choice.receivingCode),'A reviewed free elective cannot duplicate a fixed degree requirement.');
  selections[row.id]=option.id;
 }
 assert(new Set(scope.choices.map(choice=>choice.providerCode)).size===scope.choices.length,'Use every original course at most once.');
 model.reviewedBaselineChoices={version:1,modelId:model.id,catalogYear:scope.catalogYear,format:scope.format,creditSystem:scope.creditSystem,totalCredits:scope.totalCredits,checkedOn:review.checkedOn,reviewId:review.id,sourceIds:[...scope.degreeSourceIds,...scope.policySourceIds],optionSelections:selections};
 const covered=new Set(scope.replacedNotes),notes=[];
 for(const note of list(model.unresolved)){const text=typeof note==='string'?note:note?.message;if(!covered.has(text)&&!String(note?.id||'').startsWith(review.id+':'))notes.push(note);}
 notes.push({id:review.id+':personal-records',message:'Submit official records for Liberty’s individual transfer award, admission/catalog rights, state-specific general-education additions and duplicate-learning check.',owner:'student',status:'personal-task',sourceIds:[...scope.degreeSourceIds,...scope.policySourceIds]});
 notes.push({id:review.id+':retained-allocation',message:scope.allocationReview,status:'resolved',sourceIds:[...scope.degreeSourceIds]});
 notes.push({id:review.id+':additional-options',message:'Additional outside options may improve this route. Named university fallback courses do not establish that outside credit is prohibited.',blocking:false,sourceIds:[...scope.degreeSourceIds]});
 notes.push({id:review.id+':prerequisite-registration',message:'Before registration, record accepted prerequisite credit or the published assessment results and select available sections. No assessment pass or future section availability is assumed.',owner:'student',status:'personal-task',sourceIds:[...scope.prerequisiteSourceIds]});
 for(const task of list(scope.additionalPersonalTasks))notes.push({id:review.id+':'+task.id,message:task.message,owner:'student',status:'personal-task',sourceIds:[...task.sourceIds]});
 model.unresolved=notes;
 for(const fact of scope.courseReviews){
  const row=model.requirements.find(row=>row.code===fact.code);assert(row&&row.credits===fact.credits,'A reviewed university course changed.');
  for(const code of fact.prerequisiteCodes)assert(model.requirements.some(other=>other.code===code),'The reviewed prerequisite is absent from this degree ledger: '+code);
  row.prerequisites=fact.prerequisiteCodes.map(code=>model.requirements.find(other=>other.code===code).id);
  row.prerequisitePolicy={status:'verified',catalogYear:scope.catalogYear,format:'Online',rule:copy(fact.rule),noCoursePrerequisitesListed:fact.noCoursePrerequisitesListed,sourceIds:[...scope.prerequisiteSourceIds],checkedOn:review.checkedOn,...(fact.publishedPrerequisiteAlternatives?{publishedAlternatives:fact.publishedPrerequisiteAlternatives}:{})};
  if(fact.personalRegistrationRestrictions)row.registrationPolicy={...copy(fact.personalRegistrationRestrictions),sourceIds:[...scope.prerequisiteSourceIds],checkedOn:review.checkedOn,personalEligibilityConfirmed:false};
  row.prerequisiteSourceIds=[...scope.prerequisiteSourceIds];
  row.offeringPolicy={offeredFormats:[...fact.offeredFormats],sourceIds:[...scope.prerequisiteSourceIds],checkedOn:review.checkedOn,actualSectionAvailabilityConfirmed:false};
 }
 model.expandedBaselineReview={id:review.id,checkedOn:review.checkedOn,sourceRetrievalOn:'2026-11-18',personalAwardsCreated:0,numericAlternativeCapInvented:false};
 return model;
}
