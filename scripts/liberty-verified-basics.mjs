/** Current Liberty undergraduate facts, scoped to reviewed degree/catalog identities. */
import assert from 'node:assert/strict';

const clone=value=>JSON.parse(JSON.stringify(value));
const catalog=value=>String(value||'').replace(/[\u2013\u2014]/g,'-');
const list=value=>Array.isArray(value)?value:[];
const message=value=>typeof value==='string'?value:value?.message;
const boundSource=(source)=>{
 const url=new URL(source.url);
 assert(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='liberty.edu'||url.hostname.endsWith('.liberty.edu')),'Liberty facts need an official university source');
 return clone(source);
};

export function applyLibertyVerifiedBasics(input,review){
 const facts=review?.liberty,scope=list(facts?.scopes).find(scope=>scope.id===input?.id);
 if(!scope)return input;
 assert(review.version===1&&facts.school==='Liberty University'&&facts.catalogYear==='2026-2027','Use the reviewed Liberty fact packet');
 assert(input.school==='Liberty University'&&input.format===scope.format&&input.totalCredits===scope.totalCredits&&catalog(input.catalogYear||input.catalog)===facts.catalogYear,'Liberty pricing does not match this exact degree/catalog/format');
 const model=clone(input),pricing=clone(facts.pricing[scope.format]);
 assert(pricing?.currency==='USD'&&pricing.catalogYear===facts.catalogYear&&pricing.sourceIds?.length,'A scoped published price is required');
 if(scope.format==='Residential')assert(pricing.model==='banded-term'&&pricing.termRate===12695&&pricing.bandMin===12&&pricing.bandMax===18&&pricing.partTimeRate===870&&pricing.summerRate===475,'Do not flatten the residential semester band into a per-credit rate');
 else assert(pricing.model==='threshold-credit'&&pricing.fullTimeRate===410&&pricing.partTimeRate===475&&pricing.fullTimeMin===12,'Use semester-load-based undergraduate online rates');
 const existingSources=new Map(list(model.sources).map(source=>[source.id,source]));
 const ids=new Set(pricing.sourceIds);
 if(scope.format==='Online')for(const fee of facts.onlineFees)for(const id of fee.sourceIds)ids.add(id);
 if(scope.format==='Residential')ids.add('liberty-residential-academic-policy-2026-2027-reviewed');
 if(model.id==='liberty-business-residential')for(const id of facts.baselineMajorLedger.sourceIds)ids.add(id);
 if(model.id==='liberty-business-residential')for(const id of facts.baselinePrerequisites.sourceIds)ids.add(id);
 for(const id of ids){const source=list(review.sources).find(source=>source.id===id);assert(source,'A reviewed price or policy source is missing');existingSources.set(id,boundSource(source));}
 model.sources=[...existingSources.values()];model.pricing=pricing;
 if(scope.format==='Online'){
  const fees=new Map(list(model.publishedFees).map(fee=>[fee.id,fee]));
  for(const fee of facts.onlineFees)fees.set(fee.id,clone(fee));model.publishedFees=[...fees.values()];
 }
 if(scope.format==='Residential'){
  assert(model.institutionMinCredits===model.totalCredits*.25&&model.externalMaxCredits===model.totalCredits*.75,'Do not silently change degree-specific residency values');
  const sourceIds=['liberty-residential-academic-policy-2026-2027-reviewed'];
  model.policyEvidence={...model.policyEvidence,
   institutionMinCredits:{value:model.institutionMinCredits,creditSystem:'semester',sourceIds,calculation:'25% of the published degree-credit total must be completed through Liberty.'},
   externalMaxCredits:{value:model.externalMaxCredits,creditSystem:'semester',sourceIds,calculation:'Published degree total minus the 25% institutional minimum.',scope:'Overall ceiling only; exact course applicability, major/minor residency and source-specific policies remain separate.'},
   ...(model.majorInstitutionFraction===.25?{majorInstitutionFraction:{value:.25,sourceIds,scope:'Published fraction; the denominator is the exact degree major/minor ledger, not the whole degree.'}}:{})
  };
 }
 if(model.id==='liberty-business-residential'){
  const ledger=facts.baselineMajorLedger,majorRows=model.requirements.filter(row=>row.category==='major');
  assert(ledger.modelId===model.id&&ledger.majorLedgerCredits===66&&ledger.majorRequirementBlocks.reduce((sum,block)=>sum+block.credits,0)===66&&ledger.institutionFraction===.25&&ledger.derivedFractionalCredits===16.5&&ledger.retainedConservativeCourseBound===18,'Use the exact reviewed major ledger, not another degree denominator');
  assert(model.majorResidencyBasisCredits===66&&model.majorInstitutionFraction===.25&&model.majorMinInstitutionCredits===18&&majorRows.reduce((sum,row)=>sum+row.credits,0)===66,'Reviewed major-policy evidence no longer matches this model');
  const fixed=ledger.majorRequirementBlocks.flatMap(block=>list(block.requiredCourses)),codes=new Set(fixed.map(course=>course.code));
  for(const course of fixed)assert(majorRows.some(row=>row.code===course.code&&row.credits===course.credits),'A required major course changed');
  const cognate=ledger.majorRequirementBlocks.find(block=>block.id==='interdisciplinary-business-cognate'),choices=majorRows.filter(row=>!codes.has(row.code));
  assert(choices.length===4&&new Set(majorRows.map(row=>row.code)).size===majorRows.length&&choices.every(row=>{const match=String(row.code).match(/^([A-Z]+) (\d{3})$/);return match&&row.credits===3&&cognate.allowedPrefixes.includes(match[1])&&Number(match[2])>=300&&Number(match[2])<=499;}),'Selected cognate courses must satisfy the published department/level choices without duplicates');
  model.policyEvidence.majorResidencyBasisCredits={value:66,creditSystem:'semester',sourceIds:[...ledger.sourceIds],calculation:'18 major-foundational + 36 major-course + 12 cognate credits in the published Major Requirements section.'};
  model.policyEvidence.majorInstitutionFraction={value:.25,sourceIds:[...ledger.sourceIds,'liberty-residential-academic-policy-2026-2027-reviewed'],scope:'Applied to the reviewed 66-credit Major Requirements ledger; the mathematical amount is 16.5 credits and the existing planner conservatively retains 18 credits of named university courses.'};
  model.rulesNotes=list(model.rulesNotes).map(text=>text==='At least 25% of major/cognate coursework must be Liberty coursework. This model conservatively reserves 18 credits from a 66-credit major/foundation/cognate ledger; confirm the university denominator.'?'At least 25% of major/cognate coursework must be Liberty coursework. The reviewed Major Requirements ledger has 66 credits: 18 foundational, 36 major-course and 12 cognate credits. Its fractional amount is 16.5 credits; this model retains a sufficient 18 credits through whole three-credit university courses.':text);
  const prerequisites=facts.baselinePrerequisites;
  assert(prerequisites.modelId===model.id&&prerequisites.catalogYear==='2026-2027'&&prerequisites.format==='Residential'&&prerequisites.status==='verified','Prerequisite rules must match this catalog and delivery format');
  assert(prerequisites.assessmentScenario.extraAcademicCredits===0&&prerequisites.assessmentScenario.assessmentsAssumedPassed===false&&prerequisites.assessmentScenario.personalAssessmentStatus==='unknown','Do not turn a conditional assessment route into a personally completed prerequisite');
  for(const fact of prerequisites.requirements){
   const row=model.requirements.find(row=>row.id===fact.requirementId);assert(row&&row.code===fact.courseCode&&row.credits===3&&fact.sourceIds.length,'Prerequisite course scope changed');
   row.prerequisitePolicy={status:'verified',catalogYear:'2026-2027',format:'Residential',rule:clone(fact.rule),...(fact.requiredCourseModality?{requiredCourseModality:fact.requiredCourseModality}:{}),sourceIds:[...fact.sourceIds],checkedOn:review.checkedOn};
  }
  model.assessmentPlanningScenario=clone(prerequisites.assessmentScenario);
  // The two one-credit university fallback rows are still placeholders. Keep that
  // research visible instead of pretending all optional alternatives are named.
  const updated=[];
  for(const item of list(model.unresolved)){
   const text=message(item);
   if(text==='Confirm the selected one-credit Sophia electives apply without duplicate-credit conflicts; university fallback courses still need selection if those external options are not used.'){
    updated.push({message:'These optional one-credit university fallback choices still need named courses if selected.',owner:'DegreePath',status:'unresolved',scope:'selected-options',requirementIds:['free-teams-1','free-it-career-1'],selectionRequiredOnly:true,blocking:false,sourceIds:['degree']});
    updated.push({message:'DegreeSteps is reviewing duplicate-award exclusions for the selected one-credit Sophia electives against any prior awards.',owner:'DegreePath',status:'unresolved',scope:'selected-options',optionIds:['sophia-soph-0021','sophia-soph-0041'],blocking:false,sourceIds:['sophia','policy']});
   }else if(text==='Confirm placement and prerequisite alternatives, especially BUSI 201 and residential BUSI 205.'){
    updated.push({message:'Before BUSI 201, record accepted INFT 110 or INFT 111 credit, or qualifying Excel, PowerPoint and Word assessment results. If extra prerequisite courses are needed, update your elective allocation.',owner:'student',status:'personal-task',requirementIds:['busi-201'],sourceIds:[...prerequisites.sourceIds]});
    updated.push({message:'Before residential BUSI 205, complete BUSI 201 and record INQR 101 credit or an Inquiry Assessment score of at least 80. BUSI 205 must be taken residentially for this route.',owner:'student',status:'personal-task',requirementIds:['busi-205'],sourceIds:['liberty-busi-prerequisites-2026-2027-reviewed']});
    updated.push({message:'The current BUSI 201 and residential BUSI 205 prerequisite alternatives are published and source-bound. Your assessment results remain unknown; this plan does not assume you passed or add uncompleted prerequisite credits.',owner:'DegreePath',status:'resolved',sourceIds:[...prerequisites.sourceIds]});
   }else if(text==='Evaluate transfer-triggered religion waivers against the student’s actual approved transfer total.'){
    updated.push({message:'If you want to use transfer-based religion waivers, ask Liberty to apply them to your official transfer award and replace waived credits with degree-applicable electives.',owner:'student',status:'personal-task',appliesWhen:'transfer-waiver',sourceIds:['degree']});
   }else if(text==='Confirm major residency calculation, individual transfer award, provider recommendation version and current course scheduling.'){
    updated.push({message:'The current provider recommendation version and recommendation window still need review for any outside option without that evidence.',owner:'DegreePath',status:'unresolved',scope:'selected-options',missingEvidence:'reviewed-source-identity',blocking:false,sourceIds:['sophia','study','clep']});
    updated.push({message:'Submit your official learning records for Liberty’s individual transfer evaluation and check available sections before enrolling.',owner:'student',status:'personal-task',sourceIds:['policy']});
    // The selected plan safely exceeds its existing conservative 18-credit
    // bound. This note resolves the published fraction, not an unreviewed award.
    updated.push({message:'The reviewed degree has a 66-credit Major Requirements ledger. Its published 25% residency fraction is 16.5 credits; this model conservatively retains 18 credits of named major courses through Liberty.',owner:'DegreePath',status:'resolved',sourceIds:[...ledger.sourceIds,'liberty-residential-academic-policy-2026-2027-reviewed']});
   }else if(text==='The current provider recommendation version and recommendation window still need review for any outside option without that evidence.'){
    updated.push({...item,scope:'selected-options',missingEvidence:'reviewed-source-identity',blocking:false});
   }else if(text==='The published residential policy requires 25% of the degree and 25% of the major/minor through Liberty. This model continues to enforce its degree-specific major bound.'){
    updated.push({message:'The reviewed degree has a 66-credit Major Requirements ledger. Its published 25% residency fraction is 16.5 credits; this model conservatively retains 18 credits of named major courses through Liberty.',owner:'DegreePath',status:'resolved',sourceIds:[...ledger.sourceIds,'liberty-residential-academic-policy-2026-2027-reviewed']});
   }else updated.push(item);
  }
  model.unresolved=updated;
 }
 if(model.id==='curriculum-liberty-accounting-bs-residential'){
  const updated=[];
  for(const item of list(model.unresolved)){
   if(message(item)==='Confirm individual catalog eligibility, major-course residency allocation, course prerequisites, and written transfer evaluation.'){
    updated.push({message:'Confirm that your admission and enrollment history entitles you to the 2026–2027 catalog, and send official records for Liberty’s individual degree audit.',owner:'student',status:'personal-task',sourceIds:['liberty-accounting-bs-residential-2026']});
    updated.push({message:'Check course-specific prerequisites and outside-course recommendation versions where current evidence has not yet been recorded.',owner:'DegreePath',status:'unresolved',sourceIds:['liberty-accounting-bs-residential-2026']});
    updated.push({message:'The published 25% major-residency fraction is enforced against this model’s reviewed 69-credit major ledger; individual transfer awards remain separate.',owner:'DegreePath',status:'resolved',sourceIds:['liberty-accounting-bs-residential-2026','liberty-residential-academic-policy-2026-2027-reviewed']});
   }else updated.push(item);
  }
  model.unresolved=updated;
 }
 model.verifiedBasicsReview={id:review.id,checkedOn:review.checkedOn,pricingScope:'standard-undergraduate',personalAwardsCreated:0};
 return model;
}
