/* The student's allocated degree ledger, never a school's maximum transfer allowance. */
(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./cost-engine.js') : root.DegreeCostComparison,
    common ? require('./planner.js') : root.DegreePlanner,
    common ? () => require('./course-plan-view.js') : () => root.DegreeCoursePlanView);
  if (common) module.exports = api;
  else root.DegreeSavings = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Cost, Planner, courseView) {
  'use strict';
  const PROGRAMS = Object.freeze({'liberty-business-residential':'liberty-residential','liberty-criminal-justice-residential':'liberty-residential','liberty-criminal-justice-online':'liberty-online', 'tesu-general-management':'tesu-standard'});
  const REVIEW_ERRORS = new Set(['program_research', 'reported_credit', 'conditional_mapping', 'selection_required', 'unknown_provenance', 'waiver_confirmation', 'policy_review']);
  const STATUSES = new Set(['planned', 'reported', 'confirmed', 'unresolved']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const near = (a, b) => Math.abs(a - b) < 0.000001;
  const blankMoney = () => ({transferCredits:0,beforeTuition:null,afterTuition:null,tuitionAvoided:null,outsideBudget:null,netDifference:null,beforeTerms:null,afterTerms:null,termsAvoided:null});
  function empty(programId, entryId, reason, reasonCode) {
    return {
      available:false, reason, reasonCode, programId:programId || null, entryId:entryId || null,
      projected:blankMoney(), earned:{transferCredits:0,reportedCredits:0,confirmedCredits:0},
      confirmed:{transferCredits:0,tuitionAvoided:null,termsAvoided:null},
      rateBasis:null, provisional:true, researchGapCredits:0, notes:[], assumptions:null
    };
  }
  function amount(value, label, {integer = false, min = 0, max = 100000} = {}) {
    if (typeof value === 'string') {
      value = value.trim();
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new TypeError('Enter a valid ' + label + '.');
      value = Number(value);
    }
    if (!finite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new RangeError('Enter a valid ' + label + '.');
    if (!integer && !near(value * 100, Math.round(value * 100))) throw new RangeError('Enter ' + label + ' with no more than two decimal places.');
    return value;
  }
  // Check each allocated requirement once. Source-credit awards can legitimately
  // fill several rows, so deduplicating provider course IDs would undercount.
  function ledger(program, plan) {
    if (!Array.isArray(program.requirements) || !Array.isArray(plan.rows)) throw new Error('Your course list needs a fresh degree check before we can estimate savings.');
    const requirements = new Map();
    for (const req of program.requirements) {
      if (!req || !req.id || requirements.has(req.id) || !finite(req.credits) || req.credits < 0) throw new Error('Your course list contains an inconsistent degree requirement.');
      requirements.set(req.id, req);
    }
    if (plan.rows.length !== requirements.size) throw new Error('Your course list needs every degree requirement exactly once.');
    const seen = new Set();
    let total = 0, projected = 0, reported = 0, confirmed = 0, unknown = 0;
    for (const row of plan.rows) {
      const req = row && requirements.get(row.requirementId);
      if (!req || seen.has(row.requirementId) || !finite(row.credits) || row.credits < 0 || !near(row.credits, req.credits) || !STATUSES.has(row.status)) throw new Error('Your course list has duplicate or inconsistent credit placements. Review it before relying on a savings estimate.');
      seen.add(row.requirementId); total += row.credits;
      if (row.unknownProvenance) {unknown += row.credits; continue;}
      const provider = typeof row.option?.provider === 'string' ? row.option.provider.trim().toLowerCase() : '';
      const external = provider && provider !== 'university' && row.institutional !== true && row.status !== 'unresolved';
      if (!external) continue;
      projected += row.credits;
      if (row.status === 'reported') reported += row.credits;
      if (row.status === 'confirmed') confirmed += row.credits;
    }
    if (!finite(program.totalCredits) || !near(total, program.totalCredits)) throw new Error('Your course list does not yet account for the full degree.');
    return {projected,reported,confirmed,unknown,total};
  }
  function projection(result) {
    return {
      transferCredits:result.transferUnits, beforeTuition:result.beforeTuition,
      afterTuition:result.afterTuition, tuitionAvoided:money(result.beforeTuition - result.afterTuition),
      outsideBudget:result.outsideBudget, netDifference:result.savings,
      beforeTerms:result.beforeTerms, afterTerms:result.afterTerms,
      termsAvoided:result.universityTermsAvoided,
      ...(result.teachingWeeks ? {teachingWeeks:result.teachingWeeks} : {})
    };
  }
  function reviewedBinding(program, entry, binding) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding) || program.auditProvenance?.status === 'student-provided') return false;
    const year = value => String(value || '').trim().replace(/[\u2013\u2014]/g,'-');
    const mode = value => /^(?:residential|on campus|campus)$/i.test(String(value || '').trim()) ? 'campus' : /^online$/i.test(String(value || '').trim()) ? 'online' : null;
    const catalogYear = year(binding.catalogYear), checked = binding.checkedOn;
    if (!/^20\d{2}-20\d{2}$/.test(catalogYear) || Number(catalogYear.slice(5)) !== Number(catalogYear.slice(0,4)) + 1 || catalogYear !== year(program.catalogYear || program.catalog)) return false;
    if (typeof checked !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(checked) || !Number.isFinite(Date.parse(checked)) || new Date(checked).toISOString().slice(0,10) !== checked) return false;
    if (program.school !== entry.schoolName || program.level !== 'bachelor' || program.creditSystem !== 'semester' || program.totalCredits !== entry.totalUnits || !mode(program.format) || mode(program.format) !== mode(entry.format)) return false;
    let source;
    try {source = new URL(binding.sourceUrl);if (source.protocol !== 'https:' || source.username || source.password) return false;} catch {return false;}
    return Array.isArray(entry.sources) && entry.sources.some(item => item.url === source.href) && Array.isArray(program.sources) && program.sources.some(item => item.url === source.href);
  }
  function selectedCourseCoverage(program, plan) {
    const sources=new Set((program.sources||[]).map(source=>source.id)),requirements=new Map(program.requirements.map(requirement=>[requirement.id,requirement]));
    let missing=0,outsideOpportunities=0;
    for(const row of plan.rows){
      if(['reported','confirmed'].includes(row.status))continue;
      const option=row.option,requirement=requirements.get(row.requirementId),code=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const named=option?.provider==='University'&&!row.selectionRequired&&!option.selectionRequired&&!requirement?.researchGap&&code(option.code)&&String(option.title||'').trim()&&option.evidence==='published'&&finite(option.credits)&&near(option.credits,row.credits)&&Array.isArray(option.sourceIds)&&option.sourceIds.length&&option.sourceIds.every(id=>sources.has(id))&&(requirement?.options||[]).some(candidate=>candidate.id===option.id&&candidate.provider==='University'&&code(candidate.code)===code(option.code)&&candidate.evidence==='published'&&candidate.credits===option.credits);
      const university=option?.provider==='University';
      let gap=!option;
      if(option)gap=university?!(row.placementReason==='required-university'||requirement?.institutionalOnly===true||row.placementReason==='reserved-university'||named):['research-gap','conditional-gap','excluded-source'].includes(row.placementReason);
      if(gap)missing+=row.credits;
      else if(university&&row.placementReason==='research-gap')outsideOpportunities+=row.credits;
    }
    return{missing,outsideOpportunities};
  }
  function calculate(state, draft, costData) {
    state = object(state); draft = object(draft); costData = object(costData);
    const program = object(draft.program), plan = object(draft.plan);
    const programId = program.id || null, legacyEntryId = PROGRAMS[programId], binding = program.tuitionComparison;
    const entryId = legacyEntryId || (typeof binding?.entryId === 'string' ? binding.entryId : null);
    let result = empty(programId, entryId,
      'Choose a degree with a researched course plan to see your personal time and tuition estimate.', 'course-map-needed');
    if (!program.id || !Array.isArray(plan.rows)) return result;
    if (!entryId && binding === undefined) return result;
    const entry = Array.isArray(costData.entries) && costData.entries.find(item => item.id === entryId);
    if (!entry || entry.totalUnits !== program.totalCredits || plan.programId !== program.id || !legacyEntryId && !reviewedBinding(program,entry,binding)) {
      result.reason = 'We need a matching tuition model and course plan for this exact degree before estimating savings.';
      result.reasonCode = 'cost-model-needed'; return result;
    }
    let counts, validation;
    try {
      counts = ledger(program, plan);
      if (!Planner || typeof Planner.validate !== 'function') throw new Error('Refresh the degree check before estimating savings.');
      validation = Planner.validate(program, plan);
      const blockers = [...(Array.isArray(plan.setupIssues) ? plan.setupIssues : []), ...(validation.errors || []), ...(plan.validation?.errors || [])].filter(error => !REVIEW_ERRORS.has(error.code));
      if (validation.academicCountsValid !== true || plan.validation?.academicCountsValid !== true || blockers.length) throw new Error('Resolve the course-plan issues first so your savings estimate uses a degree plan that meets its credit rules.');
      if (!Number.isInteger(counts.projected) || !Number.isInteger(counts.confirmed) || counts.projected > entry.scenarioTransferLimit) throw new Error('Review the allocated transfer credits before estimating tuition.');
      const threshold = program.appliedTransferWaiver?.minimumQualifyingTransferCredits;
      if (finite(threshold) && counts.confirmed < threshold) {
        result.reason = 'This route uses a transfer waiver. Confirm the qualifying transfer credits with the university before relying on its savings estimate.';
        result.reasonCode = 'waiver-needs-confirmation';
        result.earned = {transferCredits:counts.reported + counts.confirmed,reportedCredits:counts.reported,confirmedCredits:counts.confirmed};
        result.projected.transferCredits = counts.projected;
        result.confirmed.transferCredits = counts.confirmed;
        return result;
      }
    } catch (error) {
      result.reason = error.message;
      result.reasonCode = 'plan-needs-review'; return result;
    }
    try {
      const settings = object(object(state.savings)[programId]);
      const budget = amount(own(settings, 'outsideBudget') ? settings.outsideBudget : (costData.defaultOutsideBudget === undefined ? 2000 : costData.defaultOutsideBudget), 'outside-credit budget');
      const unitsPerTerm = amount(own(settings, 'unitsPerTerm') ? settings.unitsPerTerm : entry.pace?.defaultUnits, 'credits per term', {integer:true,min:1,max:1000});
      const scenario = object(object(state.scenarios)[programId]);
      let rateBasis = 'published', effectiveEntry = entry, quotedRate = null;
      if (own(scenario, 'universityRate') && scenario.universityRate !== '' && scenario.universityRate !== null && scenario.universityRate !== undefined) {
        const rate = amount(scenario.universityRate, 'university tuition per credit', {max:1000000});
        if (rate > 0) {
          quotedRate = rate; rateBasis = 'your-quote';
          effectiveEntry = {...entry,model:{type:'per-credit',rate}};
        }
      }
      const projected = Cost.calculate(effectiveEntry, {transferUnits:counts.projected,outsideBudget:budget,unitsPerTerm});
      const confirmed = Cost.calculate(effectiveEntry, {transferUnits:counts.confirmed,outsideBudget:0,unitsPerTerm});
      const gap = finite(plan.coverage?.researchGapCredits) ? plan.coverage.researchGapCredits : plan.rows.reduce((sum, row) => sum + (/research-gap/.test(row.placementReason || '') ? row.credits : 0), 0);
      // An outside alternative can be unresearched while its selected university
      // course is named and usable. Keep those opportunities separate from an
      // actual missing requirement; the existing raw coverage field is retained.
      const selected = courseView?.()?.build(draft), fallback = selected ? null : selectedCourseCoverage(program,plan);
      const missingCourses = finite(selected?.totals?.unmapped) ? selected.totals.unmapped : fallback.missing;
      const outsideOpportunities = selected ? selected.groups.universityReserved.filter(row=>row.placementReason==='research-gap').reduce((sum,row)=>sum+row.credits,0) : fallback.outsideOpportunities;
      const conditional = plan.rows.filter(row=>row.status==='planned'&&row.option?.provider!=='University'&&row.option?.evidence==='conditional').reduce((sum,row)=>sum+row.credits,0);
      const policyQuestions = (validation.errors || []).filter(error => error.code === 'policy_review');
      const notes = [
        ...policyQuestions.map(error => 'DegreeSteps is researching this school rule: ' + (error.message || error.field || 'The applicable academic rule is not yet sourced.')),
        'This estimate follows the outside credits actually placed in your course plan, not the school’s maximum transfer allowance.',
        conditional ? conditional+' selected outside credits have specific eligibility conditions. Review the affected course options in your plan.' : 'Published course matches are included in this plan. Your school awards personal credit from your official records.',
        'The outside-credit budget is your planning allowance, not a complete priced course package.',
        'University terms avoided exclude time spent earning outside credits, transfer processing, prerequisites and course scheduling.'
      ];
      if (missingCourses > 0) notes.push('DegreeSteps still needs named course choices for '+missingCourses+' credits. They are priced at university tuition in this partial estimate.');
      if (outsideOpportunities > 0) notes.push('This route selects university courses for '+outsideOpportunities+' credits without mapped outside alternatives. Additional transfer options may change the estimate.');
      if (counts.reported > 0) notes.push(counts.reported + ' completed outside credits are reported by you and still need the university’s transfer evaluation.');
      if (counts.unknown > 0) notes.push(counts.unknown + ' credits have an unidentified source and are excluded from transfer savings until that source is verified.');
      if (program.appliedTransferWaiver) notes.push('The university must also confirm the transfer waiver itself. Waived requirements do not create earned credits.');
      notes.push(rateBasis === 'your-quote' ? 'Tuition uses your per-credit quote. Check what your quote includes before making a payment decision.' : 'Tuition uses published sticker rates before financial aid, scholarships and discounts.');
      if (rateBasis === 'published' && entryId === 'tesu-standard') notes.push('TESU uses the standard out-of-state tuition case. New Jersey residency, military pricing and other discounts can change your actual tuition.');
      notes.push('This is a tuition comparison. Other fees, books and living expenses are excluded. It is not a guaranteed graduation date, actual refund or awarded saving.');
      const assumptions = {
        outsideBudget:budget, unitsPerTerm, rateBasis, quotedRate,
        termLabel:projected.termLabel, checkedOn:costData.checkedOn || null,
        modelType:effectiveEntry.model.type, rateModel:{...effectiveEntry.model},
        publishedRateCase:entryId === 'tesu-standard' ? 'standard-out-of-state' : /^online$/i.test(entry.format || '') ? 'online-undergraduate' : 'residential-undergraduate',
        scope:'university-tuition-plus-outside-budget', totalCredits:program.totalCredits,
        requiresSchoolApproval:true, excludesOutsideStudyTime:true
      };
      return {
        available:true, reason:null, reasonCode:null, programId, entryId,
        projected:projection(projected),
        earned:{transferCredits:counts.reported + counts.confirmed,reportedCredits:counts.reported,confirmedCredits:counts.confirmed},
        confirmed:{transferCredits:counts.confirmed,tuitionAvoided:money(confirmed.beforeTuition - confirmed.afterTuition),termsAvoided:confirmed.universityTermsAvoided},
        rateBasis, provisional:policyQuestions.length > 0 || !validation.valid || Boolean(plan.provisional) || gap > 0 || counts.unknown > 0,
        researchGapCredits:gap, unmappedCredits:missingCourses, outsideOptionResearchCredits:outsideOpportunities, notes, assumptions,
        basisKey:JSON.stringify({programId,entryId,model:effectiveEntry.model,budget,unitsPerTerm})
      };
    } catch (error) {
      result.reason = error.message || 'Review your cost and pace assumptions before estimating savings.';
      result.reasonCode = 'assumptions-need-review';
      result.projected.transferCredits = counts.projected;
      result.earned = {transferCredits:counts.reported + counts.confirmed,reportedCredits:counts.reported,confirmedCredits:counts.confirmed};
      result.confirmed.transferCredits = counts.confirmed;
      return result;
    }
  }
  function delta(previous, next) {
    const none = {changed:false,projectedCredits:0,earnedCredits:0,confirmedCredits:0,netDifference:null,termsAvoided:null,assumptionsChanged:false,message:''};
    if (!previous || !next || !previous.available || !next.available || previous.programId !== next.programId || previous.entryId !== next.entryId) return none;
    const projectedCredits = next.projected.transferCredits - previous.projected.transferCredits;
    const earnedCredits = next.earned.transferCredits - previous.earned.transferCredits;
    const confirmedCredits = next.earned.confirmedCredits - previous.earned.confirmedCredits;
    const netDifference = money(next.projected.netDifference - previous.projected.netDifference);
    const termsAvoided = next.projected.termsAvoided - previous.projected.termsAvoided;
    const assumptionsChanged = previous.basisKey !== next.basisKey;
    const changed = Boolean(projectedCredits || earnedCredits || confirmedCredits || netDifference || termsAvoided || assumptionsChanged);
    let message = '';
    if (assumptionsChanged) message = 'Your estimate reflects your updated budget, tuition quote or study pace.';
    else if (projectedCredits > 0) {
      message = projectedCredits + ' more credits covered in your proposed transfer path.';
      if (netDifference > 0) message += ' Your estimated net tuition saving increased by ' + Cost.money(netDifference) + '.';
      else if (netDifference === 0) message += ' The billed tuition estimate is unchanged at this course load.';
      if (termsAvoided > 0) message += ' Your university course load now uses ' + termsAvoided + ' fewer ' + (next.assumptions?.termLabel || 'term') + (termsAvoided === 1 ? '' : 's') + '.';
    } else if (projectedCredits < 0) message = Math.abs(projectedCredits) + ' fewer credits are covered by your proposed transfer path. Your tuition and term estimates have been recalculated.';
    else if (confirmedCredits > 0) message = confirmedCredits + ' more transfer credits confirmed in your records. These credits were already included in your proposed savings estimate.';
    else if (earnedCredits > 0) message = earnedCredits + ' more outside credits marked completed. Your university still needs to evaluate reported credits; these courses were already included in your proposed savings estimate.';
    else if (earnedCredits < 0 || confirmedCredits < 0) message = 'Your completed transfer-credit progress has been updated.';
    return {changed,projectedCredits,earnedCredits,confirmedCredits,netDifference,termsAvoided,assumptionsChanged,message};
  }
  return Object.freeze({calculate,delta});
}));
