/* Thomas Edison State University academic invariants, ported from the retired importers (import-tesu-accounting.mjs,
 * import-tesu-finance.mjs, import-tesu-english.mjs, import-tesu-psychology.mjs, import-tesu-liberal-studies.mjs) and from
 * the reviewed TESU policy supplements those importers inherited (add-tesu-official-mappings.mjs, add-tesu-prerequisites.mjs,
 * complete-tesu-named-choices.mjs). Each check receives the compiled curriculum document and throws on a violation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {providerReview} from '../../../scripts/tesu-provider-review.mjs';
import {upiLiberalArtsPlacement} from '../../../scripts/tesu-upi-maps.mjs';
import {placementKind,reviewedRequirementScope} from '../../../scripts/tesu-course-placements.mjs';

const list=v=>Array.isArray(v)?v:[];
const sum=rows=>rows.reduce((n,r)=>n+r.credits,0);
const outside=r=>list(r.options).filter(o=>o.provider!=='University');
const plain=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const sourceSet=m=>new Set(list(m.sources).map(s=>s.id));
const cites=(m,ids)=>{const known=sourceSet(m);return list(ids).length>0&&list(ids).every(id=>known.has(id));};
const credits=(m,predicate)=>sum(m.requirements.filter(predicate));
const model=(doc,id)=>doc.models.find(m=>m.id===id);
const courseEligibilityReview=JSON.parse(readFileSync(new URL('./course-specific-eligibility-review-2026-11-26.json',import.meta.url),'utf8'));
const coursePlacementReview=JSON.parse(readFileSync(new URL('./course-placements-review-2026-11-26.json',import.meta.url),'utf8'));
const additionalPlacementReview=JSON.parse(readFileSync(new URL('./course-placements-review-2026-11-27.json',import.meta.url),'utf8'));
const coursePlacementReviews=[coursePlacementReview,additionalPlacementReview];
const reviewedPlacementFor=(m,id)=>coursePlacementReviews.some(review=>review.id===id&&review.models.some(scope=>scope.modelId===m.id));
function reviewedCourseEligibility(m,o){
 const resolution=o.courseEligibilityResolution;if(!resolution)return false;
 const approved=courseEligibilityReview.claims.find(claim=>claim.provider===o.provider&&claim.providerCourseCode===o.code&&claim.receivingCode===o.receivingCode&&claim.courseVersion===o.courseVersion);
 assert.ok(approved,`${m.title} ${o.id}: exact course eligibility is in the independently source-bound review`);
 const {rowId,...expected}=approved;assert.deepEqual(resolution,expected,`${m.title} ${o.id}: exact reviewed eligibility claim`);
 assert.equal(resolution.targetCatalog,m.catalog||m.catalogYear);assert.equal(resolution.credits,o.credits);assert.equal(resolution.creditSystem,o.creditSystem);assert.equal(resolution.creditOrigin,o.creditOrigin);
 assert.equal(resolution.sourceCredits,o.sourceCredits);assert.equal(resolution.sourceCreditSystem,o.sourceCreditSystem);
 assert.equal(resolution.schoolName,m.school);assert.equal(resolution.catalogYear,o.mappingEvidence?.catalogYear);
 assert.equal(resolution.providerOrganizationCode,o.providerCourseCode);assert.equal(resolution.recommendationStart,o.recommendationStart);assert.equal(resolution.recommendationEnd,o.recommendationEnd);
 assert.equal(o.sourceCreditStatus,'verified');assert.equal(o.mappingResearchClosed,true);assert.equal(o.mappingEvidence?.claimOrigin,'receiving-institution-submitted');
 for(const id of resolution.sourceIds){const source=m.sources.find(source=>source.id===id);assert.ok(source,`${m.title} ${o.id}: resolution source exists`);assert.equal(source.sha256,resolution.sourceHashes[id]);}
 assert.equal(o.eligibilityReview?.providerReviewPending,true);assert.equal(o.eligibilityReview?.fullyApproved,false);assert.equal(Object.hasOwn(o.eligibilityReview,'eligibleToStart'),false);
 return true;
}

/** Reviewed ledger shapes from the importers: 120 semester credits in 40 named requirements, 45 general-education credits. */
const ledgers={
  'curriculum-tesu-bsba-accounting':{groups:{'business-core':42,'area-study':18,'free-electives':15}},
  'curriculum-tesu-bsba-finance':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['FIN-3140','FIN-3340','FIN-3820','FIN-3210','FIN-3310','FDR-4400']},
  'curriculum-tesu-bsba-human-resources-organizational-management':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['MAN-3310','MAN-3110','PSY-3600','PSY-3630','SOC-3620','MAN-4250']},
  'curriculum-tesu-bsba-marketing':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['MKT-4110','MKT-4790','MKT-3060','MKT-3350','MKT-4410','MAN-4320']},
  'curriculum-tesu-bs-computer-information-systems':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['COS-1160','CIS-3200','COS-2410','CIS-3110','CIS-3010','CIS-3510']},
  'curriculum-tesu-bs-healthcare-management':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['HCM-3070','HCM-3080','HCM-3530','HCM-4040','HCM-4050','HCM-4060']},
  'curriculum-tesu-bs-general-management':{groups:{'business-core':42,'area-of-study':18,'free-electives':15},areaCodes:['MAN-3110','MAN-3310','FIN-3310','FIN-3340','MKT-4110','MKT-4790']},
  'curriculum-tesu-ba-english':{categories:{major:45},free:30,requiredEnglish:['LIT-2050','LIT-2060','LIT-2910','LIT-4600']},
  'curriculum-tesu-ba-psychology':{categories:{major:45},free:30},
  'curriculum-tesu-ba-liberal-studies':{categories:{major:45},free:30}
};

/** Every TESU model is a balanced 120-credit semester ledger of 40 requirements, 45 of them general education. */
function semesterLedgers(doc){
  for(const m of doc.models){
    assert.equal(m.school,'Thomas Edison State University');
    assert.equal(m.creditSystem,'semester',`${m.title}: TESU awards semester credits`);
    assert.equal(m.totalCredits,120,`${m.title}: TESU bachelor's degrees publish 120 credits`);
    assert.equal(sum(m.requirements),120,`${m.title}: requirements total ${sum(m.requirements)}, not 120`);
    assert.equal(m.requirements.length,40,`${m.title}: the reviewed ledger has 40 named requirements`);
    assert.equal(new Set(m.requirements.map(r=>r.id)).size,40,`${m.title}: requirement ids must be unique`);
    assert.equal(credits(m,r=>r.category==='general'),45,`${m.title}: 45 general-education credits`);
  }
}
/** The program-specific shapes the importers asserted (business core, area of study, free electives, required English). */
function reviewedLedgerShapes(doc){
  for(const [id,shape] of Object.entries(ledgers)){
    const m=model(doc,id);if(!m)continue;
    for(const [group,value] of Object.entries(shape.groups||{}))assert.equal(credits(m,r=>r.group===group),value,`${m.title}: ${group} carries ${value} credits`);
    for(const [category,value] of Object.entries(shape.categories||{}))assert.equal(credits(m,r=>r.category===category),value,`${m.title}: ${category} carries ${value} credits`);
    if(shape.free)assert.equal(credits(m,r=>r.freeElective===true),shape.free,`${m.title}: ${shape.free} free-elective credits`);
    if(shape.areaCodes)assert.deepEqual(m.requirements.filter(r=>r.group==='area-of-study').map(r=>r.code),shape.areaCodes,`${m.title}: the reviewed area-of-study courses`);
    if(shape.requiredEnglish)assert.deepEqual(m.requirements.filter(r=>r.curriculumBlock==='required-english').map(r=>r.code),shape.requiredEnglish,`${m.title}: the four required English courses`);
  }
}
/** No course is counted twice: every requirement names a distinct receiving course (its code, or its named University choice). */
function distinctNamedCourses(doc){
  for(const m of doc.models){
    const codes=m.requirements.map(r=>r.code||list(r.options).find(o=>o.provider==='University')?.code);
    assert.ok(codes.every(Boolean),`${m.title}: every requirement names its course`);
    assert.equal(new Set(codes.map(plain)).size,codes.length,`${m.title}: a course is counted once`);
  }
}
/** Formal prerequisites point at requirements of the same degree, cite a source and contain no cycle. */
function prerequisitesResolve(doc){
  for(const m of doc.models){
    const byId=new Map(m.requirements.map(r=>[r.id,r])),done=new Set(),active=new Set();
    const visit=id=>{if(done.has(id))return;assert.ok(!active.has(id),`${m.title}: prerequisite cycle at ${id}`);active.add(id);for(const p of list(byId.get(id)?.prerequisites)){assert.ok(byId.has(p),`${m.title}: ${id} needs missing prerequisite ${p}`);visit(p);}active.delete(id);done.add(id);};
    for(const r of m.requirements){visit(r.id);if(list(r.prerequisites).length)assert.ok(cites(m,r.prerequisiteSourceIds),`${m.title} ${r.code}: prerequisites cite a model source`);}
  }
}
/** Standard residency (15), the 90-credit combined alternative cap and the derived 105 outside bound, each source-bound. */
function residencyAndCaps(doc){
  for(const m of doc.models){
    assert.equal(m.institutionMinCredits,15,`${m.title}: the standard 15-credit TESU course residency`);
    assert.equal(m.alternativeMaxCredits,90,`${m.title}: the combined 90-credit noncollegiate cap`);
    assert.equal(m.externalMaxCredits,m.totalCredits-m.institutionMinCredits,`${m.title}: outside credit is the total minus residency`);
    for(const field of ['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits']){
      assert.equal(m.policyEvidence?.[field]?.value,m[field],`${m.title}: ${field} matches its policy evidence`);
      assert.ok(cites(m,m.policyEvidence[field].sourceIds),`${m.title}: ${field} cites a model source`);
    }
    assert.equal(m.upperMinCredits,18,`${m.title}: 18 upper-level credits`);
    assert.ok(credits(m,r=>r.upper===true)>=m.upperMinCredits,`${m.title}: the ledger meets its upper-level minimum`);
    assert.equal(m.transferPolicyReview?.duplicatesCountOnce,true,`${m.title}: duplicate learning counts once`);
  }
}
/** C or better in composition and every area-of-study (and business-core) requirement, with a cited grade policy. */
function gradeMinimums(doc){
  for(const m of doc.models){
    assert.equal(m.gradePolicy?.minimumGrade,'C',`${m.title}: TESU's C minimum`);
    assert.ok(cites(m,m.gradePolicy.sourceIds),`${m.title}: the grade policy cites a model source`);
    for(const r of m.requirements){
      const needsC=['ENC-1010','ENC-1020'].includes(r.code)||(['business-core','area-study','area-of-study'].includes(r.group)&&r.code&&!/^free-/.test(r.id)&&m.id!=='curriculum-tesu-ba-liberal-studies');
      if(needsC){assert.equal(r.minimumGrade,'C',`${m.title} ${r.code}: C or better`);if(r.minimumGradeSourceIds)assert.ok(cites(m,r.minimumGradeSourceIds),`${m.title} ${r.code}: the grade minimum cites a model source`);}
    }
  }
}
/** Institution-only courses (the Cornerstone and the capstone) are taken at TESU: no outside option may satisfy them. */
function institutionOnlyStaysAtTESU(doc){
  for(const m of doc.models){
    const only=m.requirements.filter(r=>r.institutionalOnly===true);
    assert.ok(only.some(r=>r.code==='SOS-1100'),`${m.title}: SOS-1100 is taken at TESU`);
    assert.ok(only.some(r=>/^(BUS-4210|LIB-49[56]0)$/.test(r.code)),`${m.title}: the capstone is taken at TESU`);
    for(const r of only)assert.equal(outside(r).length,0,`${m.title} ${r.code}: an institution-only course has no outside option`);
  }
}
/** Outside awards fit their requirement: no more credits than the slot, semester units, cited model sources. */
function awardsFitTheirRequirement(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    assert.ok(o.credits>0&&o.credits<=r.credits,`${m.title} ${r.id}/${o.id}: awards ${o.credits} credits in a ${r.credits}-credit requirement`);
    if(o.creditSystem!==undefined)assert.equal(o.creditSystem,'semester',`${m.title} ${r.id}/${o.id}: semester credits`);
    assert.ok(cites(m,o.sourceIds),`${m.title} ${r.id}/${o.id}: an outside award cites model sources`);
  }
}
/** Business course currency (importer rule): half the area of study within ten years, the capstone within five. */
function businessCourseCurrency(doc){
  for(const id of ['curriculum-tesu-bsba-accounting','curriculum-tesu-bsba-finance','curriculum-tesu-bsba-human-resources-organizational-management','curriculum-tesu-bsba-marketing','curriculum-tesu-bs-general-management','curriculum-tesu-bs-computer-information-systems','curriculum-tesu-bs-healthcare-management']){
    const m=model(doc,id);if(!m)continue;
    const groups=list(m.existingCreditReview?.groups);
    const area=groups.find(g=>g.maxAgeYears===10),capstone=groups.find(g=>g.id==='business-capstone');
    assert.ok(area&&capstone,`${m.title}: the course-currency review has an area-of-study and a capstone group`);
    assert.equal(area.maxOlderCredits,area.totalCredits/2,`${m.title}: at most half the area of study may be older than ten years`);
    assert.equal(capstone.maxAgeYears,5,`${m.title}: the capstone must be within five years`);assert.equal(capstone.maxOlderCredits,0);
    assert.ok(cites(m,m.existingCreditReview.sourceIds),`${m.title}: the currency rule cites a model source`);
  }
}
/**
 * TESU's Approved Provider Directory (captured 2026-11-25) lists SOPHIA Learning, StraighterLine, Saylor and CLEP as Provisionally
 * Approved – Review Pending. Every such option keeps that restriction visible: a blocking eligibility review or a condition.
 */
const provisionalProviders=['Sophia','StraighterLine','Saylor','CLEP'];
function provisionalProvidersStayRestricted(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    if(!provisionalProviders.includes(o.provider))continue;
    const restricted=o.eligibilityReview?o.eligibilityReview.providerReviewPending===true&&o.eligibilityReview.fullyApproved===false&&cites(m,o.eligibilityReview.sourceIds):list(o.conditions).some(text=>/provisional|no established/i.test(text));
    assert.ok(restricted,`${m.title} ${r.id}/${o.id}: ${o.provider} is provisionally approved at TESU; the option must keep that restriction`);
    if(o.evidenceType==='school-submitted-equivalency')assert.ok(o.eligibilityReview,`${m.title} ${r.id}/${o.id}: a documented receiving match carries its separate provider eligibility review`);
  }
}
/** Every reviewed provider status is source-bound and distinct from a course award. */
function providerStatusesStaySourceBound(doc){
  for(const m of doc.models){
    const review=m.providerEligibilityReview;
    assert.equal(review?.checkedOn,providerReview.checkedOn,m.title+': current provider-directory review');
    assert.ok(cites(m,review?.sourceIds),m.title+': provider review cites its retained source');
    for(const r of m.requirements)for(const o of outside(r)){
      if(![...provisionalProviders,...providerReview.approved].includes(o.provider))continue;
      const eligibility=o.eligibilityReview;
      assert.equal(eligibility?.checkedOn,review.checkedOn,m.title+' '+o.id+': provider status date');
      assert.ok(cites(m,eligibility?.sourceIds),m.title+' '+o.id+': provider status cites its source');
      assert.equal(eligibility.individualApproval,false,m.title+' '+o.id+': provider status is not an individual award');
      assert.equal(Object.hasOwn(eligibility,'eligibleToStart'),false,m.title+' '+o.id+': provider status does not establish enrollment permission');
      assert.equal(eligibility.enrollmentPermission,'not-established-by-provider-status');
      assert.equal(eligibility.providerReviewPending,!providerReview.approved.includes(o.provider),m.title+' '+o.id+': provisional review remains pending');
      if(providerReview.approved.includes(o.provider)){
        assert.equal(eligibility.fullyApproved,true,m.title+' '+o.id+': '+o.provider+' is an approved provider');
        assert.equal(eligibility.status,'approved-provider-course-mapping-separate');
      }else assert.equal(eligibility.providerReviewPending,true,m.title+' '+o.id+': provisional provider review remains pending');
    }
  }
}
/**
 * A TESU-submitted (ACE-published) receiving match names one TESU course for the 2026–2027 catalog. A separately source-bound
 * exact course eligibility resolution can support its published use while the generic provider review stays pending. Otherwise it stays conditional,
 * awards exactly that course's credits in the requirement for that course (or a free-elective block), and never claims an
 * individual approval. Copies of the legacy General Management records keep their own (copied) evidence and are not checked here.
 */
function schoolSubmittedMatchesAreExact(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    if(o.evidenceType!=='school-submitted-equivalency'||/researched in another degree/i.test(o.mappingScope||''))continue;
    const e=o.mappingEvidence||{};
    if(reviewedCourseEligibility(m,o)){
      assert.ok(['published','conditional'].includes(o.evidence),`${m.title} ${r.id}/${o.id}: resolved receiving-course evidence is preserved`);
      if(o.evidence==='conditional')assert.ok(r.freeElective===true||r.liberalArtsAllocation===true,`${m.title} ${r.id}/${o.id}: a separate elective/area placement may remain conditional`);
    }
    else assert.equal(o.evidence,'conditional',`${m.title} ${r.id}/${o.id}: an unresolved school-submitted match stays conditional`);
    assert.equal(o.receivingMapStatus,'published-school-submitted');assert.equal(o.mappingResearchClosed,true);
    assert.equal(e.claimOrigin,'receiving-institution-submitted',`${m.title} ${r.id}/${o.id}: claim origin`);
    assert.equal(e.schoolName,'Thomas Edison State University');assert.equal(e.catalogYear,'2026-2027',`${m.title} ${r.id}/${o.id}: the TESU 2026–2027 catalog`);
    assert.equal(e.individualApproval,false);assert.equal(e.receivingCode,o.receivingCode);assert.equal(e.credits,o.credits);
    assert.ok(cites(m,e.sourceIds),`${m.title} ${r.id}/${o.id}: the receiving match cites a model source`);
    assert.ok(r.code===o.receivingCode||r.freeElective===true&&o.placementType==='elective'||r.liberalArtsAllocation===true&&reviewedPlacementFor(m,o.coursePlacementReviewId)&&upiLiberalArtsPlacement(m,r,o)||r.category==='general'&&reviewedPlacementFor(m,o.coursePlacementReviewId)&&o.degreePlacementEvidence?.placementType==='general-category',`${m.title} ${r.id}/${o.id}: ${o.receivingCode} is placed only in its own requirement, free elective or independently reviewed category allocation`);
  }
}
/** Degree allocation is a separate reviewed claim: current primary degree proof, exact slot and university award, never residency. */
function reviewedCurrentCoursePlacements(doc,kit){
 const rows=new Map(list(kit?.equivalencies?.equivalencies).map(row=>[row.id,row]));
 for(const m of doc.models){
  const reviews=coursePlacementReviews.filter(review=>review.models.some(scope=>scope.modelId===m.id));assert.equal(reviews.length,1,m.title+': exactly one date-scoped placement review');
  const coursePlacementReview=reviews[0],scope=coursePlacementReview.models.find(review=>review.modelId===m.id);assert.ok(scope,m.title+': this exact current degree is in the placement review');
  assert.equal(m.catalog,scope.catalog);assert.equal(m.institutionMinCredits,scope.institutionMinCredits);assert.equal(m.upperMinCredits,scope.upperMinCredits);assert.equal(m.alternativeMaxCredits,scope.alternativeMaxCredits);
  assert.equal(m.transferPolicyReview?.duplicatesCountOnce,true);assert.deepEqual(m.liberalArtsAllocation||null,scope.liberalArtsAllocation);
  assert.deepEqual(m.requirements.map(reviewedRequirementScope),scope.requirements,m.title+': reviewed degree capacity, disciplines, levels, quantities and source identities');
  for(const r of m.requirements)for(const o of outside(r)){
   if(!o.coursePlacementReviewId){if(o.courseEligibilityResolution&&o.evidence==='published'&&(r.freeElective||r.liberalArtsAllocation))assert.fail(m.title+' '+o.id+': published flexible placement needs its independent review');continue;}
   assert.equal(o.coursePlacementReviewId,coursePlacementReview.id);assert.ok(reviewedCourseEligibility(m,o));
   const approved=coursePlacementReview.placements.find(p=>p.modelId===m.id&&p.requirementId===r.id&&p.optionId===o.id&&p.providerCourseCode===o.code&&p.receivingCode===o.receivingCode);
   assert.ok(approved,m.title+' '+r.id+'/'+o.id+': exact reviewed course placement');
   const row=rows.get(approved.rowId);assert.ok(row);assert.equal(placementKind(m,r,row),approved.placementType);
   assert.equal(o.provider,approved.provider);assert.equal(o.courseVersion,approved.courseVersion);assert.equal(o.credits,approved.credits);assert.equal(o.creditSystem,approved.creditSystem);assert.equal(o.creditOrigin,approved.creditOrigin);assert.equal(o.upper,approved.receivingUpper);assert.equal(o.evidence,'published');
   assert.equal(r.institutionalOnly===true,false);assert.equal(o.creditOrigin,'alternative');
   const proof=o.degreePlacementEvidence;assert.ok(proof);assert.equal(proof.modelId,m.id);assert.equal(proof.requirementId,r.id);assert.equal(proof.receivingCode,o.receivingCode);assert.equal(proof.credits,o.credits);assert.equal(proof.creditSystem,o.creditSystem);assert.equal(proof.placementType,approved.placementType);assert.equal(proof.modality,'online');assert.deepEqual(proof.sourceIds,approved.sourceIds);
   assert.ok(cites(m,o.sourceIds)&&approved.sourceIds.every(id=>o.sourceIds.includes(id)));
   for(const id of approved.primarySourceIds){const source=m.sources.find(source=>source.id===id),expected=coursePlacementReview.sources.find(source=>source.id===id);assert.ok(source&&expected);assert.equal(source.kind,'university');assert.equal(source.url,expected.url);assert.equal(source.capture,expected.capture);assert.equal(source.checked,expected.checked);assert(source.checked<=coursePlacementReview.checkedOn,'A placement review cannot predate its retained source review');assert.equal(source.sha256,coursePlacementReview.sourceHashes[id]);assert.equal(source.sourceContentHash,coursePlacementReview.sourceHashes[id]);}
   if(approved.placementType==='elective'){assert.equal(r.freeElective,true);assert.equal(r.excludeAlreadyUsed,true);assert.equal(o.placementType,'elective');assert.equal(o.allocationType,'free-elective');}
   if(approved.placementType==='liberal-arts-area'){assert.equal(o.placementType,'major-elective');assert.equal(o.allocationType,'liberal-arts-area');assert.ok(upiLiberalArtsPlacement(m,r,o));}
   if(approved.placementType==='general-category'){assert.equal(o.placementType,'general-elective');assert.equal(o.allocationType,'general-category');assert.equal(r.category,'general');assert.ok(scope.scientificRequirementIds.includes(r.id)&&scope.scientificPermittedReceivingCodes.includes(o.receivingCode));assert.ok(approved.primarySourceIds.includes('tesu-liberal-taxonomy-placement-2026-11-26'));}
  }
 }
}
/** Institution-wide rows authored in the kit are grounded in a captured TESU-submitted equivalency for their receiving course. */
function authoredRowsAreGrounded(doc,kit){
  for(const row of list(kit?.equivalencies?.equivalencies)){
    if(!row.authored)continue;
    assert.ok(row.scope?.all===true&&row.scope.levels?.length&&row.scope.modalities?.length&&row.scope.catalogs?.length,row.id+': an authored institution-wide row names its levels, formats and catalogs');
    assert.ok(list(row.quotes).some(q=>q.text.includes('Thomas Edison State University')&&q.text.includes(row.receivingCode)),row.id+': quotes TESU\'s equivalency for '+row.receivingCode);
    assert.ok(list(row.quotes).some(q=>/^ACE ID: /.test(q.text)&&q.text.includes(row.code)),row.id+': quotes the exact ACE identity '+row.code);
    assert.equal(row.evidenceType,'school-submitted-equivalency',row.id+': only TESU-submitted equivalencies are authored institution-wide');
  }
}
/** The first UPI packet contains provider assertions, not independently established university course awards. */
function upiProviderCandidatesStayBounded(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    if(o.provider!=='UPI Study')continue;
    const label=m.title+' '+r.id+'/'+o.id,e=o.mappingEvidence;
    assert.equal(o.evidence,'conditional',label+': UPI receiving evidence stays conditional');
    assert.equal(o.evidenceType,'provider-published',label+': the UPI table is provider-published');
    assert.equal(o.mappingResearchClosed,false,label+': the UPI provider table does not close receiving research');
    assert.equal(o.receivingMapStatus,'provider-published-candidate');assert.equal(o.individualApproval,false);
    assert.equal(o.creditOrigin,'alternative',label+': UPI counts toward the combined alternative-credit cap');
    assert.equal(o.sourceType,'alternative');assert.equal(o.sourceCreditSystem,'semester');
    assert.equal(o.upper,/^[A-Z]+-[34]\d{3}$/.test(o.receivingCode),label+': receiving code establishes receiving level independently from the original recommendation');
    assert.equal(o.sourceCredits,o.credits,label+': a provider assertion cannot resolve a source/receiving quantity discrepancy');
    assert.equal(o.minScore,70,label+': the reviewed original ACE course has a 70-point passing standard');
    assert.equal(o.providerCoursePassingPercent,70,label+': preserve the overall course-completion passing standard');
    assert.equal(o.passingScoreScope,'overall-course-completion',label+': a course passing standard is not a separate final-exam minimum');
    assert.ok(cites(m,o.minScoreSourceIds)&&cites(m,o.providerCoursePassingSourceIds),label+': the course passing standard cites its exact recommendation exhibit');
    assert.equal(e?.schoolName,m.school);assert.equal(e?.provider,'UPI Study');assert.equal(e?.publisher,'UPI Study');
    assert.equal(e?.claimOrigin,'provider-published');assert.equal(e?.individualApproval,false);
    assert.equal(e?.receivingCode,o.receivingCode);assert.equal(e?.credits,o.credits);assert.ok(cites(m,e?.sourceIds),label+': UPI receiving claim cites its source');
    assert.ok(cites(m,o.identitySourceIds)&&cites(m,o.recommendationPeriodSourceIds),label+': original course identity and recommendation period stay separately source-bound');
    assert.ok(o.conditions.some(text=>/independent TESU receiving-course award has not been established/.test(text)),label+': provider verification is not represented as a university award');
    assert.equal(o.degreePlacementEvidence?.requirementId,r.id,label+': the exact requirement placement is explicit');
    assert.ok(cites(m,o.degreePlacementEvidence?.sourceIds),label+': the current degree placement cites its published block');
    if(r.freeElective){assert.ok(['elective','electives'].includes(r.category));assert.equal(r.group,'free-electives');assert.equal(r.excludeAlreadyUsed,true);assert.equal(o.placementType,'elective');}
    else if(r.liberalArtsAllocation){
      assert.ok(upiLiberalArtsPlacement(m,r,{receivingCode:o.receivingCode}),label+': liberal-arts allocation must satisfy the sourced discipline and receiving-level restrictions');
      assert.equal(o.placementType,'major-elective');assert.equal(o.allocationType,'liberal-arts-area');
      assert.equal(o.degreePlacementEvidence.placementType,'liberal-arts-area');
    }
    else assert.equal(o.receivingCode,r.code,label+': a named receiving award cannot fill a different named requirement');
  }
}
export const checks=[semesterLedgers,reviewedLedgerShapes,distinctNamedCourses,prerequisitesResolve,residencyAndCaps,gradeMinimums,institutionOnlyStaysAtTESU,awardsFitTheirRequirement,businessCourseCurrency,provisionalProvidersStayRestricted,providerStatusesStaySourceBound,schoolSubmittedMatchesAreExact,authoredRowsAreGrounded,upiProviderCandidatesStayBounded,reviewedCurrentCoursePlacements];
