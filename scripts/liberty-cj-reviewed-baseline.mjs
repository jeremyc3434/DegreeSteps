/** Classify two existing CJ baselines without inventing source checks or awards. */
import assert from 'node:assert/strict';
const list=value=>Array.isArray(value)?value:[];
const clone=value=>JSON.parse(JSON.stringify(value));
const message=value=>typeof value==='string'?value:value?.message;
const legacy={
 evaluation:'Obtain Liberty’s individual evaluation of all prior and planned credit, including duplicate-learning decisions, source versions/recommendation windows, and exact major-residency calculation.',
 alternatives:'Research additional outside awards for the exact unmapped major and general-education requirements. University fallback rows are not proof that outside credit is disallowed.',
 waivers:'Confirm transfer-triggered religion waivers and technology/UNIV exemptions. Any waived hours need nonduplicating replacement electives to maintain 120 total credits.',
 schedule:'Verify remaining university/provider prerequisites and term availability; CJUS 420 is listed for fall. No executable term-by-term graduation schedule is established.',
 oneCredit:'Confirm the two one-credit Sophia free electives apply individually and do not duplicate prior learning; if using university fallbacks, choose actual one-credit courses.'
};
export function applyLibertyCJReviewedBaseline(input,review){
 const scope=list(review?.scopes).find(scope=>scope.modelId===input?.id);if(!scope)return input;
 assert(review.version===1&&review.school==='Liberty University'&&review.catalogYear==='2026-2027','Use the exact CJ baseline classification packet');
 assert(input.school===review.school&&input.title===scope.title&&['bachelor','bachelors'].includes(String(input.level).toLowerCase().replace(/[^a-z]/g,''))&&input.format===scope.format&&String(input.catalogYear||input.catalog).replace(/[–—]/g,'-')===review.catalogYear&&input.totalCredits===120,'The CJ review does not apply to this program/catalog/format');
 const model=clone(input),sources=new Map(list(model.sources).map(source=>[source.id,source]));
 assert(sources.get('degree')?.url===scope.degreeUrl,'The exact CJ degree source changed');
 for(const id of ['degree','cjus-courses','govt-courses','sophia','study','clep'])assert(sources.has(id),'The CJ classification needs its existing source reference');
 const major=model.requirements.filter(row=>row.category==='major');
 assert(major.reduce((sum,row)=>sum+row.credits,0)===45&&major.length===15&&major.every(row=>row.credits===3&&review.majorCourseCodes.includes(row.code))&&new Set(major.map(row=>row.code)).size===15,'The reviewed 45-credit CJ major ledger changed');
 assert(model.majorResidencyBasisCredits===45&&model.majorInstitutionFraction===.25&&model.majorMinInstitutionCredits===12,'The existing CJ major-residency policy changed');
 assert(model.requirements.reduce((sum,row)=>sum+row.credits,0)===120&&scope.retainedBaselineRequirements.every(id=>model.requirements.some(row=>row.id===id&&row.credits>0)),'A waiver was applied or the retained baseline changed');
 assert(!model.appliedTransferWaiver,'A waiver-specific plan needs a separate policy review');
 for(const source of list(review.sources)){
  if(review.scopes.some(candidate=>candidate.reviewedDegreeSourceId===source.id)&&source.id!==scope.reviewedDegreeSourceId)continue;
  if(Array.isArray(source.formats)&&!source.formats.includes(model.format))continue;
  assert(/^https:\/\/(?:catalog|www)\.liberty\.edu\//.test(source.url)&&/^[a-f0-9]{64}$/.test(source.sourceHtmlSha256||source.sha256||'')&&source.checkedOn==='2026-11-18','A CJ current-source review needs its actual body hash');
  sources.set(source.id,clone(source));
 }
 model.sources=[...sources.values()];
 const degreeEvidenceId=scope.reviewedDegreeSourceId||'degree';
 const courseReview=new Map(list(review.courseReviews).map(item=>[item.code,item]));
 for(const row of model.requirements){
  const proof=courseReview.get(row.code);if(!proof)continue;
  assert(proof.credits===row.credits&&proof.offeredFormats.includes(model.format),'The current course offering does not match this CJ baseline');
  const required=proof.baselinePrerequisiteCodes[model.format],ids=required.map(code=>model.requirements.find(candidate=>candidate.code===code)?.id);
  assert(ids.every(Boolean),'A published CJ prerequisite course is not in this baseline');
  assert(JSON.stringify([...list(row.prerequisites)].sort())===JSON.stringify([...ids].sort()),'The existing CJ prerequisite allocation disagrees with its current source');
  row.prerequisitePolicy={status:'verified',catalogYear:'2026-2027',format:model.format,rule:{allOf:required.map(code=>({type:'course',code}))},noCoursePrerequisitesListed:proof.noCoursePrerequisitesListed,sourceIds:[...proof.sourceIds],checkedOn:proof.checkedOn,...(proof.publishedPrerequisiteAlternatives?{publishedAlternatives:clone(proof.publishedPrerequisiteAlternatives)}:{})};
  row.prerequisiteSourceIds=[...proof.sourceIds];
  row.offeringPolicy={offeredFormats:[...proof.offeredFormats],...(proof.publishedOfferingNote?{publishedNote:proof.publishedOfferingNote}:{}),sourceIds:[...proof.sourceIds],checkedOn:proof.checkedOn,actualSectionAvailabilityConfirmed:false};
  if(row.prerequisiteNotes?.startsWith('Confirm current university prerequisites'))row.prerequisiteNotes='The reviewed course catalog lists no course prerequisite. Personal registration eligibility and available sections remain separate.';
 }
 const receiving=list(review.receivingAwardReviews).find(proof=>proof.modelId===model.id);
 if(receiving){
  assert(receiving.catalogYear==='2026-2027'&&receiving.format===model.format,'Receiving awards cannot cross CJ formats or catalogs');
  const source=sources.get(receiving.sourceId);assert(source?.scope?.modelId===model.id&&source.scope.format===model.format&&source.evidenceType==='official-receiving-school-equivalency','Use the exact current format guide and degree scope');
  for(const award of receiving.awards){
   const row=model.requirements.find(row=>row.id===award.requirementId);assert(row?.code===award.receivingCode&&row.credits===award.receivingCredits,'The reviewed receiving requirement or quantity changed');
   assert(Number.isInteger(award.sourcePage)&&award.sourcePage>0&&typeof award.reviewedExtract==='string'&&award.reviewedExtract.length>10,'Keep the exact guide row and actual physical PDF page');
   for(const option of list(row.options)){
    if(option.provider!=='Sophia'||option.code!==award.aceId||option.evidence!=='published'||option.receivingCode!==award.receivingCode||option.credits!==award.receivingCredits)continue;
    option.sourceIds=[...new Set([...list(option.sourceIds),receiving.sourceId])];
    if(!option.mappingReviewId)option.mappingReviewId=review.id+'-'+model.format.toLowerCase()+'-existing-sophia-awards';
    if(!option.mappingChecked)option.mappingChecked=review.classificationReviewedOn;
    option.sourcePage=award.sourcePage;option.sourcePages={...option.sourcePages,[receiving.sourceId]:award.sourcePage};
   }
  }
 }
 const note=(id,text,extra={})=>({id:review.id+':'+id,message:text,owner:'DegreePath',status:'unresolved',...extra});
 const noteGroups={evaluation:['individual-evaluation','provider-identity','major-ledger'],alternatives:['additional-options'],waivers:['retained-waivers','optional-waiver'],schedule:['remaining-prerequisites','registration'],oneCredit:['one-credit-duplicates','one-credit-published','one-credit-personal-duplicate','one-credit-fallbacks']};
 const normalized=[],seenGroups=new Set();
 for(const item of list(model.unresolved)){
  const own=typeof item?.id==='string'&&item.id.startsWith(review.id+':'),suffix=own?item.id.slice(review.id.length+1):null;
  const group=own?Object.keys(noteGroups).find(key=>noteGroups[key].includes(suffix)):Object.keys(legacy).find(key=>legacy[key]===message(item));
  if(group){if(!seenGroups.has(group)){normalized.push(legacy[group]);seenGroups.add(group);}}else normalized.push(item);
 }
 const updated=[];
 for(const item of normalized){
  const text=message(item);
  if(text===legacy.evaluation){
   updated.push(note('individual-evaluation','Submit official learning records for Liberty’s individual transfer evaluation; personal acceptance, duplicate learning and catalog eligibility depend on those records.',{owner:'student',status:'personal-task',sourceIds:['degree','sophia','study']}));
   updated.push(note('provider-identity','The current provider recommendation version and recommendation window still need review for any selected outside option without that evidence.',{scope:'selected-options',missingEvidence:'reviewed-source-identity',blocking:false,sourceIds:['sophia','study','clep']}));
   updated.push(note('major-ledger','The baseline allocates 45 major credits once. The existing 25% major-residency fraction equals 11.25 credits; the model conservatively retains at least 12 credits through whole three-credit Liberty major courses.',{status:'resolved',sourceIds:[degreeEvidenceId]}));
  }else if(text===legacy.alternatives){
   updated.push(note('additional-options','Additional outside awards can improve this route. The existing named university choices remain valid baseline courses; their presence does not establish that outside credit is disallowed.',{blocking:false,sourceIds:['degree','sophia','study','clep']}));
  }else if(text===legacy.waivers){
   updated.push(note('retained-waivers','This 120-credit baseline retains the listed religion and introductory technology requirements. It applies no transfer-triggered religion, technology or UNIV waiver and awards no assumed replacement-elective credit.',{status:'resolved',requirementIds:[...scope.retainedBaselineRequirements],sourceIds:[degreeEvidenceId]}));
   updated.push(note('optional-waiver','If a personal transfer award qualifies for a waiver, have Liberty apply the waiver and approve nonduplicating replacement electives before changing this retained baseline.',{owner:'student',status:'personal-task',appliesWhen:'transfer-waiver',sourceIds:['degree']}));
  }else if(text===legacy.schedule){
   const pending=model.requirements.filter(row=>typeof row.prerequisiteNotes==='string'&&row.prerequisiteNotes.startsWith('Confirm current university prerequisites'));
   if(pending.length)updated.push(note('remaining-prerequisites','The selected university courses still need exact source-bound prerequisite review where the baseline retains a generic scheduling note.',{scope:'selected-options',requirementIds:pending.map(row=>row.id),optionIds:pending.flatMap(row=>list(row.options).filter(option=>option.provider==='University').map(option=>option.id)),sourceIds:[...new Set(pending.flatMap(row=>list(row.sourceIds)))]}));
   updated.push(note('registration','Before registering, check available sections, accepted prerequisite credit and transcript deadlines. The reviewed CJUS 420 catalog block lists a fall offering; this baseline does not establish an executable finish date.',{owner:'student',status:'personal-task',sourceIds:['liberty-cj-cjus-catalog-2026-2027-reviewed','liberty-cj-govt-catalog-2026-2027-reviewed']}));
  }else if(text===legacy.oneCredit){
   const duplicate=review.duplicateAwardReview;
   if(duplicate?.format===model.format&&duplicate.sameCourseCountsOnce===true&&duplicate.mutualExclusionPublished===false){
    assert(duplicate.sourceIds.every(id=>sources.has(id))&&duplicate.priorStudentAwardsEvaluated===false,'The duplicate-credit source scope is incomplete');
    for(const award of duplicate.awards){const row=model.requirements.find(row=>row.id===award.requirementId);assert(row?.credits===award.credits&&row.code===award.receivingCode&&row.options.some(option=>option.provider==='Sophia'&&option.code===award.aceId&&option.receivingCode===award.receivingCode),'The named one-credit baseline award changed');}
    updated.push(note('one-credit-published','The current residential guide publishes two distinct one-credit source courses and receiving elective subjects. The catalog permits the same course to count only once; this fresh baseline uses each named source course once.',{status:'resolved',requirementIds:duplicate.awards.map(award=>award.requirementId),sourceIds:[...duplicate.sourceIds]}));
    updated.push(note('one-credit-personal-duplicate','Include prior coursework and exam awards in Liberty’s individual transfer evaluation so the same course is not counted twice. This baseline does not clear a conflict with an unknown prior record.',{owner:'student',status:'personal-task',requirementIds:duplicate.awards.map(award=>award.requirementId),sourceIds:[...duplicate.sourceIds]}));
   }else updated.push(note('one-credit-duplicates','The exact duplicate-award exclusions for the selected one-credit Sophia electives still need source review; no prior-learning conflict has been cleared by this baseline.',{scope:'selected-options',optionIds:['sophia-soph-0021','sophia-soph-0041'],sourceIds:['sophia']}));
   updated.push(note('one-credit-fallbacks','If a one-credit university fallback is selected, choose an actual named course for that requirement.',{scope:'selected-options',requirementIds:['free-teams-1','free-it-career-1'],selectionRequiredOnly:true,sourceIds:['degree']}));
  }else updated.push(item);
 }
 const seen=new Set();model.unresolved=updated.filter(item=>{const key=item?.id||JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;});
 model.policyEvidence={...model.policyEvidence,majorResidencyBasisCredits:{value:45,creditSystem:'semester',sourceIds:[degreeEvidenceId],calculation:'The fifteen three-credit rows in this exact CJ Major Requirements ledger total 45 credits.'},majorInstitutionFraction:{value:.25,sourceIds:[degreeEvidenceId]},majorMinInstitutionCredits:{value:12,creditSystem:'semester',sourceIds:[degreeEvidenceId],calculation:'45 × 25% = 11.25; whole three-credit courses conservatively retain at least 12 Liberty major credits.'}};
 model.cjBaselineClassificationReview={id:review.id,classificationReviewedOn:review.classificationReviewedOn,newSourceRetrievals:review.newSourceRetrievals===true,personalAwardsCreated:0};
 return model;
}
