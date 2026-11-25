/*
 * DegreeSteps requirement planner. Browser global and CommonJS export.
 * generate(program,input) returns a draft requirement ledger, source-linked actions,
 * academic validation, modeled future costs and explicit unresolved conditions.
 * compare(program,input) returns transfer-first, speed and cost drafts.
 * Published evidence is never described as an individual transfer award.
 * Reported prior learning is retained provisionally, with no repurchase action.
 * Costs are scenarios: subscriptions are charged once per provider/window, bundles
 * and duplicate source actions are charged once. Unknown costs stay unknown.
 */
(function (root) {
  'use strict';
  const Assessment = typeof module === 'object' && module.exports ? require('./course-assessment.js') : root.DegreeCourseAssessment;
  const providerPricing = Object.freeze({
    checked: '2026-10-28',
    Sophia: { monthly: 99, label: 'Monthly membership; tax additional', source: 'https://www.sophia.org/plans-and-pricing/' },
    'Study.com': { monthly: 235, checked:'2026-11-17',label: 'College Saver Pro: unlimited monthly completions, up to three active courses; tax additional', source: 'https://study.com/college/pricing.html' },
    CLEP: { exam: 97, label: 'Exam only; administration/proctoring additional unless confirmed', source: 'https://clep.collegeboard.org/clep-exams' },
    DSST: { exam:100,checked:'2026-11-17',label:'Exam fee; testing-center administration charges are additional',source:'https://getcollegecredit.com/exam/money-and-banking/' }
  });
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const sum = (items, fn) => items.reduce((s, item) => s + fn(item), 0);
  const near = (a, b) => Math.abs(a - b) < 0.001;
  const reqCredits = req => number(req.credits);
  const optionKey = option => option.bundleId ? 'bundle:' + option.bundleId : (option.provider + ':' + (option.code || option.id));
  const sourceActionKey = option => option.provider + ':' + (option.code || (option.bundleId ? 'bundle:' + option.bundleId : option.id));
  const sameLearningAction = (left, right) => optionKey(left) === optionKey(right) || Boolean(left.code && left.provider === right.provider && left.code === right.code);
  const isAlternative = option => {
    const origin = String(option.creditOrigin || option.sourceType || '').toLowerCase().replace(/[\s_]/g, '-');
    if (['institutional', 'institutional-credit', 'college', 'college-issued', 'regionally-accredited', 'university'].includes(origin)) return false;
    if (['ace', 'ace-recommended', 'nccrs', 'nccrs-recommended', 'alternative', 'alternative-credit', 'noncollegiate', 'non-collegiate', 'exam', 'credit-by-exam'].includes(origin)) return true;
    return ['Sophia', 'Study.com', 'CLEP', 'DSST', 'Saylor', 'StraighterLine'].includes(option.provider);
  };
  const isUniversity = row => row.option && row.option.provider === 'University';
  const hasInstitutionalCredit = row => isUniversity(row) && !row.institutionUnknown;
  const creditSystem = p => p.creditSystem || 'semester';
  const comparableTimingCache = new WeakMap();
  const tuitionAssumptionsCache = new WeakMap();

  function normalizedInput(input) {
    const normalized = Object.assign({ completed: [], providers: ['Sophia', 'Study.com', 'CLEP'], priority: 'transfer', allowConditional: false, weeklyHours: 10, universityRate: 0, fees: 0, providerMonths: {}, examBudget: 97, modernStates: false, optionSelections: {} }, input || {});
    if (normalized.optionSelections === undefined) normalized.optionSelections = {};
    return normalized;
  }

  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
  // A competency program can exclude its capstone from institutional residency.
  // Keep an unresolved exact floor separate from a documented sufficient bound.
  // This bound uses the whole degree as its denominator and keeps the excluded
  // capstone at the university, so either published denominator reading is met.
  function institutionResidencyMinimum(program) {
    const explicit = program.institutionMinCredits;
    if (explicit != null && (!finite(explicit) || explicit < 0)) return null;
    const rule = program.residencyPolicy;
    if (rule === undefined) return explicit == null ? 0 : explicit;
    const bound = rule?.conservativeSufficientCondition, ids = rule?.capstoneRequirementIds;
    const sources = new Set((program.sources || []).map(source => source.id));
    if (creditSystem(program) !== 'competency-unit' || rule?.type !== 'institution-fraction-with-capstone-exclusion' || rule.creditSystem !== undefined && rule.creditSystem !== creditSystem(program) ||
        !finite(rule.fraction) || rule.fraction <= 0 || rule.fraction > 1 ||
        !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
        !Array.isArray(rule.sourceIds) || !rule.sourceIds.length || rule.sourceIds.some(id => !sources.has(id)) ||
        !finite(bound?.basisCredits) || !near(bound.basisCredits, program.totalCredits) ||
        !finite(bound.minimumNonCapstoneInstitutionCUs) ||
        !near(bound.minimumNonCapstoneInstitutionCUs, rule.fraction * bound.basisCredits)) return null;
    const capstones = ids.map(id => (program.requirements || []).find(row => row.id === id));
    if (capstones.some(row => !row || row.institutionalOnly !== true || !finite(row.credits) || row.credits <= 0)) return null;
    const capstoneCredits = sum(capstones, row => row.credits);
    if (!finite(rule.capstoneCredits) || !near(rule.capstoneCredits, capstoneCredits)) return null;
    const minimum = bound.minimumNonCapstoneInstitutionCUs + capstoneCredits;
    if (rule.interpretationStatus === 'verified-additional-capstone' && (!finite(rule.calculatedMinimumInstitutionCUs) || !near(rule.calculatedMinimumInstitutionCUs, minimum))) return null;
    return minimum <= program.totalCredits ? Math.max(explicit || 0, minimum) : null;
  }
  function majorResidencyMinimum(program) {
    const explicit = program.majorMinInstitutionCredits;
    // Older ledgers may publish only an absolute minimum. A fractional rule
    // needs its reviewed denominator; missing policy must never become zero.
    if (explicit != null && (!finite(explicit) || explicit < 0)) return null;
    const hasFraction = Object.prototype.hasOwnProperty.call(program, 'majorInstitutionFraction');
    const hasBasis = Object.prototype.hasOwnProperty.call(program, 'majorResidencyBasisCredits');
    if (!hasFraction && !hasBasis) return explicit == null ? 0 : explicit;
    const fraction = program.majorInstitutionFraction, basis = program.majorResidencyBasisCredits;
    if (!hasFraction || !hasBasis || !finite(fraction) || fraction < 0 || fraction > 1 || !finite(basis) || basis <= 0 || !finite(program.totalCredits) || basis > program.totalCredits) return null;
    return Math.max(explicit == null ? 0 : explicit, fraction * basis);
  }
  function policyIssues(program) {
    const issues = [];
    for (const value of [program.policyReview, program.unresolvedChecks]) {
      const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([field, check]) => typeof check === 'object' && check !== null ? {field, ...check} : {field, message:check}) : typeof value === 'string' ? [value] : [];
      for (const check of items) {
        if (check == null || check === false || check === true || typeof check === 'object' && ['verified', 'confirmed', 'resolved', 'not-applicable'].includes(check.status)) continue;
        const message = typeof check === 'string' ? check : typeof check.message === 'string' ? check.message : typeof check.notes === 'string' ? check.notes : 'Confirm the program rule for ' + (check.field || 'this degree') + '.';
        if (message && !issues.some(issue => issue.message === message)) issues.push({code:'policy_review', owner:'DegreePath', ...(check.field ? {field:check.field} : {}), message});
      }
    }
    return issues;
  }
  function conditionalReview(row, option) {
    const documented = option.mappingResearchClosed === true && /^published-/.test(option.receivingMapStatus || '');
    const eligibility = option.eligibilityReview;
    const providerPending = eligibility?.eligibleToStart === false;
    const target = option.provider + ' — ' + option.title + ' → ' + (option.receivingCategory || row.code || row.title);
    let message = providerPending && documented ? target + ' is a documented receiving-course match. DegreeSteps is checking ' + option.provider + ' provider eligibility before recommending enrollment.' : 'DegreeSteps is reviewing the documented conditions for ' + target + '.';
    if (providerPending && eligibility.recommendationPeriodStatus === 'version-period-link-still-to-review') message += ' The exact source-course recommendation dates also remain under review.';
    return {code:'conditional_mapping', owner:'DegreePath', requirementId:row.requirementId, provider:option.provider, researchKind:providerPending ? 'provider-eligibility' : 'course-mapping', mappingDocumented:documented, message, sourceIds:[...new Set([...(option.sourceIds || []),...(eligibility?.sourceIds || [])])], details:[...(option.conditions || [])]};
  }
  function unresolvedItems(program, rows) {
    const errors = [], researchNotes = [], personalTasks = [], resolvedNotes = [], sources = new Map((program.sources || []).map(source => [source.id,source]));
    const bound = ids => Array.isArray(ids) && ids.length > 0 && ids.every(id => {try {const url = new URL(sources.get(id)?.url); return url.protocol === 'https:' && !url.username && !url.password;} catch {return false;}});
    const requirements = new Map((program.requirements || []).map(requirement=>[requirement.id,requirement]));
    const optionIds = new Set((program.requirements || []).flatMap(requirement=>(requirement.options || []).map(option=>option.id)));
    for (const unresolved of program.unresolved || []) {
      const note = typeof unresolved === 'string' ? {message:unresolved} : unresolved && typeof unresolved === 'object' ? {...unresolved} : {message:String(unresolved)};
      const sourceBound = bound(note.sourceIds);
      if (note.status === 'resolved' && sourceBound) {resolvedNotes.push(note); continue;}
      if (note.status === 'personal-task' && note.owner === 'student' && sourceBound) {
        if (note.appliesWhen !== 'transfer-waiver' || program.appliedTransferWaiver) personalTasks.push(note);
        continue;
      }
      const scoped = note.scope === 'selected-options' && sourceBound &&
        (note.requirementIds === undefined || Array.isArray(note.requirementIds) && note.requirementIds.length > 0 && note.requirementIds.every(id=>requirements.has(id))) &&
        (note.optionIds === undefined || Array.isArray(note.optionIds) && note.optionIds.length > 0 && note.optionIds.every(id=>optionIds.has(id))) &&
        (note.selectionRequiredOnly === undefined || typeof note.selectionRequiredOnly === 'boolean') &&
        (note.missingEvidence === undefined || note.missingEvidence === 'reviewed-source-identity');
      if (scoped) {
        for (const row of rows || []) {
          if (row.status !== 'planned' || !row.option || note.requirementIds && !note.requirementIds.includes(row.requirementId) || note.optionIds && !note.optionIds.includes(row.option.id)) continue;
          const requirement = requirements.get(row.requirementId), option = (requirement?.options || []).find(option=>option.id===row.option.id&&option.provider===row.option.provider&&option.code===row.option.code);
          if (!option || note.selectionRequiredOnly && !option.selectionRequired && !requirement.selectionRequired) continue;
          if (note.missingEvidence) {
            if (option.provider === 'University') continue;
            const checked = option.mappingChecked || option.mappingCheckedOn;
            const reviewedIdentity = Boolean(String(option.code || '').trim()) && bound(option.identitySourceIds) && Boolean(String(option.mappingReviewId || '').trim()) && /^\d{4}-\d{2}-\d{2}$/.test(checked || '') && Number.isFinite(Date.parse(checked));
            if (reviewedIdentity) continue;
          }
          const message = note.missingEvidence ? 'DegreeSteps is reviewing the exact source-course identity and recommendation version for ' + option.provider + ' — ' + option.title + ' (' + option.code + ') → ' + (option.receivingCategory || row.code || row.title) + '.' : note.message + ' Selected option: ' + option.provider + ' — ' + option.title + ' → ' + (option.receivingCategory || row.code || row.title) + '.';
          const item = {...note,code:'program_research',owner:'DegreePath',requirementId:row.requirementId,optionId:option.id,provider:option.provider,message};
          (note.blocking === false ? researchNotes : errors).push(item);
        }
        continue;
      }
      const item = {...note, code:'program_research', owner:'DegreePath', message:note.message || JSON.stringify(unresolved)};
      (note.blocking === false && sourceBound && note.scope === undefined ? researchNotes : errors).push(item);
    }
    return {errors,researchNotes,personalTasks,resolvedNotes};
  }
  // Scores are lexicographic so a tuition quote cannot outweigh an earlier
  // modeled completion in speed mode. Other objectives keep their existing score.
  function compareScores(a, b) {
    const left = Array.isArray(a) ? a : [a], right = Array.isArray(b) ? b : [b];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const delta = (left[i] || 0) - (right[i] || 0);
      if (Math.abs(delta) > 0.000001) return delta < 0 ? -1 : 1;
    }
    return 0;
  }

  function futureActions(rows) {
    const actions = new Map();
    for (const row of rows.filter(row => row.status === 'planned' && row.option && !isUniversity(row))) {
      const key = optionKey(row.option);
      if (!actions.has(key)) actions.set(key, { key, provider: row.option.provider, rows: [], prerequisites: row.option.prerequisites || [] });
      actions.get(key).rows.push(row);
    }
    return [...actions.values()];
  }

  function universityDepth(rows) {
    const future = new Map(rows.filter(row => row.status === 'planned' && isUniversity(row)).map(row => [row.requirementId, row]));
    const memo = new Map(), visiting = new Set();
    function depth(id) {
      if (!future.has(id)) return 0;
      if (memo.has(id)) return memo.get(id);
      if (visiting.has(id)) return future.size + 1;
      visiting.add(id);
      const value = 1 + Math.max(0, ...(future.get(id).prerequisites || []).map(depth));
      visiting.delete(id); memo.set(id, value); return value;
    }
    return Math.max(0, ...[...future.keys()].map(depth));
  }

  function timingModel(program, rows, input) {
    const settings = input.timing || {}, durations = settings.externalWeeks || {}, missing = [];
    const actions = futureActions(rows), school = rows.filter(row => row.status === 'planned' && isUniversity(row));
    const concurrency = Number(settings.externalConcurrency) === 2 ? 2 : 1;
    const assumptions = [
      'Durations and course load are your estimates, not verified provider or university completion times.',
      'External learning is completed before university coursework; at most ' + concurrency + ' external action(s) run at once.',
      'University prerequisites occupy separate terms. Courses are assumed available every term without enrollment gaps.',
      'Admissions, evaluation, transcript processing, grading delays, breaks and retakes are not included.'
    ];
    let externalWeeks = 0, universityTerms = 0, universityTermLoads = [], schedulingBlocked = false;
    const allRows = new Map(rows.map(row => [row.requirementId, row]));
    const actionForRequirement = new Map();
    actions.forEach(action => action.rows.forEach(row => actionForRequirement.set(row.requirementId, action.key)));
    const endTimes = new Map(), lanes = Array(concurrency).fill(0), remainingActions = [...actions];
    for (const provider of new Set(actions.map(action => action.provider))) {
      if (!positive(durations[provider])) missing.push('Your estimated weeks per ' + provider + ' course/exam preparation');
    }
    if (actions.some(action => !positive(durations[action.provider]))) externalWeeks = null;
    else while (remainingActions.length) {
      const eligible = remainingActions.filter(action => (action.prerequisites || []).every(id => {
        const prerequisite = allRows.get(id);
        return prerequisite && (prerequisite.status !== 'planned' || (actionForRequirement.has(id) && endTimes.has(actionForRequirement.get(id))));
      })).sort((a, b) => Number(durations[b.provider]) - Number(durations[a.provider]));
      if (!eligible.length) {
        missing.push('External prerequisite order requires review before a timing scenario can be calculated.');
        externalWeeks = null; schedulingBlocked = true; break;
      }
      const action = eligible[0], lane = lanes.indexOf(Math.min(...lanes));
      const ready = Math.max(0, ...(action.prerequisites || []).map(id => endTimes.get(actionForRequirement.get(id)) || 0));
      const end = Math.max(lanes[lane], ready) + Number(durations[action.provider]);
      lanes[lane] = end; endTimes.set(action.key, end);
      remainingActions.splice(remainingActions.indexOf(action), 1);
      externalWeeks = Math.max(...lanes);
    }
    if (school.length && !positive(settings.universityCreditsPerTerm)) {
      missing.push('Your planned university credits per term'); universityTerms = null; universityTermLoads = null;
    } else if (school.length) {
      const capacity = Number(settings.universityCreditsPerTerm);
      const done = new Set(rows.filter(row => row.status !== 'planned' || !isUniversity(row)).map(row => row.requirementId));
      const remaining = [...school];
      if (remaining.some(row => row.credits > capacity)) {
        missing.push('The university course load must accommodate the largest planned course.');
        universityTerms = null; universityTermLoads = null; schedulingBlocked = true;
      } else while (remaining.length) {
        const completedCredits = sum(rows.filter(row => done.has(row.requirementId)), row => row.credits);
        const eligible = remaining.filter(row => (row.prerequisites || []).every(id => done.has(id)) && completedCredits + 0.001 >= number(row.minimumCompletedCredits));
        // Prioritize courses that unlock other work, then fit larger courses.
        eligible.sort((a, b) => remaining.filter(row => row.prerequisites.includes(b.requirementId)).length - remaining.filter(row => row.prerequisites.includes(a.requirementId)).length || b.credits - a.credits);
        let available = capacity; const enrolled = [];
        for (const row of eligible) if (row.credits <= available + 0.001) { enrolled.push(row); available -= row.credits; }
        if (!enrolled.length) {
          missing.push('University prerequisites contain a missing dependency or cycle, or a minimum completed-credit threshold prevents a supported term sequence; confirm the course order.');
          universityTerms = null; universityTermLoads = null; schedulingBlocked = true; break;
        }
        universityTerms++;
        universityTermLoads.push(sum(enrolled,row=>row.credits));
        for (const row of enrolled) { done.add(row.requirementId); remaining.splice(remaining.indexOf(row), 1); }
      }
    }
    if (school.length && !positive(settings.universityTermWeeks)) missing.push('Your assumed university term length in weeks');
    const scenarioReady = externalWeeks !== null && universityTerms !== null && (!school.length || positive(settings.universityTermWeeks)) && !schedulingBlocked;
    const scenarioWeeks = scenarioReady ? Math.round((externalWeeks + universityTerms * Number(settings.universityTermWeeks || 0)) * 10) / 10 : null;
    if (rows.some(row => row.status === 'reported')) missing.push('Pending prior-learning evaluation is assumed applicable in this scenario.');
    missing.push('Your intended start date, actual course availability and time needed for your remaining work');
    return {
      estimatedWeeks: scenarioWeeks, scenarioWeeks, universityTerms, universityTermLoads, externalWeeks,
      basis: scenarioWeeks === null ? 'workload-proxy' : 'user-estimates', assumptions,
      missing: [...new Set(missing)], verified: false,
      universityCredits: sum(school, row => row.credits),
      universityCriticalTerms: universityDepth(rows), externalActions: actions.length
    };
  }

  function hasComparableTiming(program, input) {
    const cached = comparableTimingCache.get(input);
    if (cached && cached.program === program) return cached.value;
    const settings = input.timing || {}, durations = settings.externalWeeks || {};
    if (!positive(settings.universityTermWeeks) || !positive(settings.universityCreditsPerTerm)) {
      comparableTimingCache.set(input, { program, value: false }); return false;
    }
    const providers = new Set((program.requirements || []).flatMap(req => optionsFor(program, req, input).filter(option => option.provider !== 'University').map(option => option.provider)));
    const value = [...providers].every(provider => positive(durations[provider]));
    comparableTimingCache.set(input, { program, value }); return value;
  }

  // A three-credit GCU content match does not award a fourth credit. This
  // narrow, source-bound policy keeps native requirements and earned credit
  // separate, without giving other ledgers a variable-credit exception.
  function gcuSources(program, ids) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return false;
    const sources = new Map((Array.isArray(program.sources) ? program.sources : []).filter(source => source && typeof source === 'object').map(source => [source.id,source]));
    return ids.every(id => {
      if (typeof id !== 'string' || !id || id !== id.trim()) return false;
      try {const url = new URL(sources.get(id)?.url); return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'gcu.edu' || url.hostname.endsWith('.gcu.edu'));} catch {return false;}
    });
  }
  function gcuMappingSources(program, ids, provider) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return false;
    const sources = new Map((Array.isArray(program.sources) ? program.sources : []).filter(source => source && typeof source === 'object').map(source => [source.id,source]));
    return ids.every(id => {
      if (typeof id !== 'string' || !id || id !== id.trim()) return false;
      try {const url = new URL(sources.get(id)?.url); return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'gcu.edu' || url.hostname.endsWith('.gcu.edu') || provider === 'Sophia' && url.hostname === 'gcu.sophia.org');} catch {return false;}
    });
  }
  function generalEducationRules(program) {
    if (!Array.isArray(program.generalEducationMinimums) || !program.generalEducationMinimums.length) return null;
    const seen = new Set(), rules = [];
    for (const rule of program.generalEducationMinimums) {
      const names = rule?.group !== undefined && rule?.groups === undefined ? [rule.group] : rule?.group === undefined && Array.isArray(rule?.groups) ? rule.groups : [];
      if (!names.length || new Set(names).size !== names.length || names.some(name => typeof name !== 'string' || !name || name !== name.trim() || seen.has(name)) || !finite(rule?.credits) || rule.credits < 0 || !gcuSources(program,rule.sourceIds)) return null;
      if (names.some(name => !(program.requirements || []).some(req => req.category === 'general' && (req.subgroup || req.group) === name))) return null;
      names.forEach(name => seen.add(name)); rules.push({names,credits:rule.credits});
    }
    if ((program.requirements || []).some(req => req.category === 'general' && !seen.has(req.subgroup || req.group))) return null;
    return rules;
  }
  function creditBalancePolicy(program) {
    const policy = program?.degreeCreditBalancePolicy, requirements = program?.requirements;
    if (policy?.enabled !== true || policy.kind !== 'gcu-earned-credit-balance-v1' || program.school !== 'Grand Canyon University' || creditSystem(program) !== 'semester' || policy.creditSystem !== 'semester' || program.totalCredits !== 120 || policy.minimumDegreeCredits !== 120 || policy.maxBalanceCredits !== 6 || !gcuSources(program,policy.sourceIds) || !Array.isArray(requirements) || !requirements.length || requirements.some(req => !req || typeof req.id !== 'string' || !req.id || !finite(req.credits) || req.credits < 0) || new Set(requirements.map(req => req.id)).size !== requirements.length || !near(sum(requirements,reqCredits),120)) return null;
    const ids = policy.balanceRequirementIds;
    if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 || policy.automaticRepeatAllowed === true || policy.repeatabilityEstablished === true || !Array.isArray(policy.equivalencies) || !policy.equivalencies.length || !generalEducationRules(program)) return null;
    const balances = ids.map(id => requirements.find(req => req.id === id));
    const expected = new Map([['LDR-461',1],['LDR-462',2],['LDR-463',3]]), codes = new Set();
    for (const req of balances) {
      const option = req?.options?.[0], amount = expected.get(option?.code);
      if (!req || req.credits !== 0 || req.category !== 'elective' || req.institutionalOnly !== true || req.selectionRequired || !Array.isArray(req.options) || req.options.length !== 1 || !amount || codes.has(option.code) || req.code !== option.code || option.provider !== 'University' || option.evidence !== 'published' || option.credits !== amount || option.creditSystem !== 'semester' || option.sourceCredits !== amount || option.sourceCreditSystem !== 'semester' || option.creditOrigin !== 'institutional' || option.upper !== true || option.bundleId || option.receivingCourseRepeatable || !gcuSources(program,req.sourceIds) || !gcuSources(program,option.sourceIds)) return null;
      codes.add(option.code);
    }
    const boundIds = new Set();
    for (const binding of policy.equivalencies) {
      const req = requirements.find(req => req.id === binding?.requirementId);
      if (!req || ids.includes(req.id) || boundIds.has(req.id) || req.credits !== 4 || binding.nativeCredits !== 4 || binding.awardedCredits !== 3 || !gcuSources(program,req.sourceIds) || req.institutionalOnly || !Array.isArray(req.options) || !Array.isArray(binding.options) || !binding.options.length) return null;
      boundIds.add(req.id); const options = new Set();
      for (const identity of binding.options) {
        const option = req.options?.find(option => option.id === identity?.optionId && option.provider === identity?.provider && option.code === identity?.code);
        if (!option || options.has(option.id) || option.provider === 'University' || typeof option.provider !== 'string' || !option.provider || typeof option.code !== 'string' || !option.code || option.credits !== 3 || option.sourceCredits !== 3 || option.creditSystem !== 'semester' || option.sourceCreditSystem !== 'semester' || identity.sourceCredits !== 3 || identity.sourceCreditSystem !== 'semester' || !['published','conditional'].includes(option.evidence) || option.bundleId || !gcuMappingSources(program,identity.sourceIds,option.provider) || !Array.isArray(option.sourceIds) || identity.sourceIds.some(id => !option.sourceIds.includes(id)) || option.sourceIds.some(id => !(program.sources || []).some(source => source.id === id))) return null;
        if (option.upper === true && option.sourceUpper !== true) return null;
        options.add(option.id);
      }
    }
    const writingIds = policy.writingIntensiveRequirementIds;
    const writing = requirements.filter(req => req.category === 'major' && req.writingIntensive === true || ['BUS-340','BUS-485'].includes(req.code));
    if (!Array.isArray(writingIds) || new Set(writingIds).size !== writingIds.length || writingIds.length !== writing.length || writing.some(req => !writingIds.includes(req.id) || !gcuSources(program,req.writingIntensiveSourceIds || req.sourceIds))) return null;
    return policy;
  }
  function contentCreditBinding(policy, requirement, option) {
    if (!policy || !option) return null;
    const binding = policy.equivalencies.find(binding => binding.requirementId === requirement.id);
    return binding?.options.some(identity => identity.optionId === option.id && identity.provider === option.provider && identity.code === option.code) ? binding : null;
  }
  function reviewedCreditIdentity(option) {
    return ['id','provider','code','credits','sourceCredits','creditSystem','sourceCreditSystem','upper','sourceUpper','creditOrigin','sourceType','receivingCode','receivingCourseRepeatable','evidence','sourceIds'].map(field => option[field] ?? null);
  }
  function balanceShortfall(policy, rows, requirements) {
    return sum(rows.filter(row => !policy.balanceRequirementIds.includes(row.requirementId)), row => {
      const req = requirements.find(req => req.id === row.requirementId);
      return req && contentCreditBinding(policy,req,row.option) ? req.credits - row.credits : 0;
    });
  }
  function normalizeCreditBalance(program, rows, suppliedPolicy, plannedLearning) {
    const policy = suppliedPolicy || creditBalancePolicy(program);
    if (!policy) return rows;
    const requirements = program.requirements || [], balanceIds = policy.balanceRequirementIds;
    const balanceRows = rows.filter(row => balanceIds.includes(row.requirementId));
    // A completed source remains in My courses even when this particular
    // degree no longer needs it. Remember its original row only across this
    // in-memory search's candidate objects; never change the learning record or
    // serialize a second completion claim into an inactive ledger row.
    const completedAwards = normalizeCreditBalance.completedAwards || (normalizeCreditBalance.completedAwards = new WeakMap());
    const existing = new Map(balanceRows.map(row => [row.requirementId,['reported','confirmed'].includes(row.status) && row.option ? row : completedAwards.get(row)]));
    const taking = new Set(balanceRows.filter(row => {
      const req = requirements.find(req => req.id === row.requirementId),option = req.options[0];
      return (Array.isArray(plannedLearning) ? plannedLearning : []).some(item => item?.status === 'in-progress' && item.requirementId === req.id && item.optionId === option.id && item.provider === option.provider && item.code === option.code && item.credits === option.sourceCredits && item.creditSystem === option.sourceCreditSystem && item.sourceCredits === option.sourceCredits && item.sourceCreditSystem === option.sourceCreditSystem && item.institution === program.school && item.sourceProgramId === program.id && typeof item.learningId === 'string' && item.learningId.trim());
    }).map(row => row.requirementId));
    const needed = balanceShortfall(policy,rows,requirements);
    let chosen = null, bestScore = null;
    // Each named course is available once; no repeatability or generic credit
    // is inferred. Prefer using completed awards, but do not force a surplus
    // source into a strict 120-credit plan or repurchase a selected completion.
    for (let mask = 0; mask < 1 << balanceRows.length; mask++) {
      const selected = balanceRows.filter((row,index) => mask & 1 << index);
      const amount = sum(selected,row => requirements.find(req => req.id === row.requirementId).options[0].credits);
      if (!near(amount,needed)) continue;
      const newRows = selected.filter(row => !existing.get(row.requirementId));
      const score = [sum(newRows,row => requirements.find(req => req.id === row.requirementId).options[0].credits),
        -sum(selected.filter(row => existing.get(row.requirementId)?.status === 'confirmed'),row => existing.get(row.requirementId).credits),
        -sum(newRows.filter(row => taking.has(row.requirementId)),row => requirements.find(req => req.id === row.requirementId).options[0].credits),newRows.length,selected.length];
      if (!chosen || compareScores(score,bestScore) < 0) {chosen = selected; bestScore = score;}
    }
    const selectedIds = new Set((chosen || []).map(row => row.requirementId));
    return rows.map(row => {
      if (!balanceIds.includes(row.requirementId)) return row;
      const req = requirements.find(req => req.id === row.requirementId);
      const completed = existing.get(req.id);
      if (selectedIds.has(req.id) && completed) return completed;
      const allocated = makeRow(req,selectedIds.has(req.id) ? req.options[0] : null,'planned',program,policy);
      if (completed) completedAwards.set(allocated,completed);
      return allocated;
    });
  }

  function optionsFor(program, requirement, input) {
    const balance = creditBalancePolicy(program), derived = balance?.balanceRequirementIds.includes(requirement.id);
    const sources = new Set((program.sources || []).map(s => s.id));
    return (requirement.options || []).filter(option => {
      if (!option || !option.provider || !finite(option.credits) || !near(option.credits, reqCredits(requirement)) && !derived && !contentCreditBinding(balance,requirement,option)) return false;
      if (option.creditSystem && option.creditSystem !== creditSystem(program)) return false;
      if (!['published', 'conditional'].includes(option.evidence)) return false;
      if(requirement.upperOnly===true&&option.upper!==true)return false;
      if (!Array.isArray(option.sourceIds) || !option.sourceIds.length || option.sourceIds.some(id => !sources.has(id))) return false;
      if (option.evidence === 'conditional' && !input.allowConditional) return false;
      if (balance?.writingIntensiveRequirementIds.includes(requirement.id) && option.provider !== 'University') return false;
      if (option.provider === 'University') return true;
      if (requirement.institutionalOnly || !input.providers.includes(option.provider)) return false;
      return assessmentAllowsOption(program, option, input, requirement.id);
    });
  }

  function assessmentFor(program, option) {
    return Assessment?.describe?.(program, option) || {status:'unknown',label:'Assessment format not classified',detail:'',sources:[]};
  }
  // Assessment preferences apply to future choices. Actual completed work and
  // an academically matched current enrollment keep their exact placements.
  // This exception never bypasses the academic/provider guards in optionsFor.
  function assessmentAllowsOption(program, option, input = {}, requirementId) {
    if (!option || typeof option !== 'object') return false;
    if (input.proctoringPreference !== 'avoid' || option?.provider === 'University') return true;
    const placements = [...(Array.isArray(input.completed) ? input.completed.filter(item => ['confirmed','reported'].includes(item?.status)) : []), ...(Array.isArray(input.plannedLearning) ? input.plannedLearning.filter(item => item?.status === 'in-progress' && typeof item.learningId === 'string' && item.learningId.trim()) : [])];
    const retained = placements.some(item => (!requirementId || item.requirementId === requirementId) && (['confirmed','reported'].includes(item.status) || item.optionId === option.id) && (Array.isArray(program?.requirements) ? program.requirements : []).some(req => req?.id === item.requirementId && (Array.isArray(req.options) ? req.options : []).some(canonical => canonical?.id === option.id && canonical.provider === option.provider && canonical.code === option.code && canonical.credits === option.credits)));
    if (retained) return true;
    return Assessment?.allowsOption ? Assessment.allowsOption(program, option, input) : !['monitored','restricted'].includes(assessmentFor(program,option).status);
  }

  function availableOptions(program, requirementId, input) {
    const requirement = (program.requirements || []).find(requirement => requirement.id === requirementId);
    return requirement ? optionsFor(program, requirement, normalizedInput(input)).map(option => Object.assign({}, option)) : [];
  }

  function makeRow(req, option, status = 'planned', program, suppliedPolicy) {
    const policy = suppliedPolicy || program && creditBalancePolicy(program), derived = policy?.balanceRequirementIds.includes(req.id);
    const variable = contentCreditBinding(policy,req,option);
    return {
      requirementId: req.id, code: req.code, title: req.title, credits: derived || variable ? option ? option.credits : 0 : reqCredits(req), category: req.category,
      ...(derived || variable ? {nativeRequirementCredits:reqCredits(req),...(derived ? {creditBalanceDerived:true} : {})} : {}),
      subgroup: req.subgroup || req.group || null, option: option ? Object.assign({}, option) : null, status,
      selectionRequired: Boolean(req.selectionRequired || (option && option.selectionRequired)),
      institutional: Boolean(option && option.provider === 'University'), upper: Boolean(option && option.upper),
      conditions: option && option.conditions ? [...option.conditions] : [], sourceIds: option && option.sourceIds ? [...option.sourceIds] : [],
      notes: req.notes || '', satisfiesCategories: req.satisfiesCategories || [],
      prerequisites: req.prerequisites || [], prerequisiteNotes: req.prerequisiteNotes || '',
      minimumCompletedCredits: positive(req.minimumCompletedCredits) ? Number(req.minimumCompletedCredits) : 0
    };
  }

  function totals(program, rows) {
    const available = rows.filter(row => row.option);
    return {
      required: number(program.totalCredits), accounted: sum(available, row => row.credits),
      confirmed: sum(available.filter(row => row.status === 'confirmed'), row => row.credits),
      reported: sum(available.filter(row => row.status === 'reported'), row => row.credits),
      planned: sum(available.filter(row => row.status === 'planned'), row => row.credits),
      external: sum(available.filter(row => !hasInstitutionalCredit(row)), row => row.credits),
      // Unknown prior-learning provenance is counted conservatively against the
      // alternative-source ceiling until the student supplies a school evaluation.
      alternative: sum(available.filter(row => isAlternative(row.option) || row.unknownProvenance), row => row.credits),
      institutional: sum(available.filter(hasInstitutionalCredit), row => row.credits),
      upper: sum(available.filter(row => row.upper), row => row.credits),
      majorInstitutional: sum(available.filter(row => row.category === 'major' && hasInstitutionalCredit(row)), row => row.credits)
    };
  }

  function coverageModel(program, rows, input) {
    const requirements = new Map((program.requirements || []).map(req => [req.id, req]));
    const notes = [
      'Published source ceilings are limits, not a promise that every degree requirement has an outside option.',
      'University fallback rows without a verified outside mapping are research gaps, not established university-only requirements.',
      'Mapped outside options still need an individual degree evaluation; conditional options require their listed policy questions to be resolved.'
    ];
    for (const row of rows) {
      const req = requirements.get(row.requirementId);
      if (row.status === 'confirmed' || row.status === 'reported') row.placementReason = row.status === 'confirmed' ? 'existing-credit' : 'existing-unconfirmed';
      else if (!row.option) row.placementReason = 'research-gap';
      else if (row.option.provider !== 'University') row.placementReason = row.option.evidence === 'conditional' ? 'conditional-external' : 'mapped-external';
      else if (req && req.institutionalOnly) row.placementReason = 'required-university';
      else {
        const usable = req ? optionsFor(program, req, input).filter(option => option.provider !== 'University') : [];
        const conditional = req ? optionsFor(program, req, Object.assign({}, input, { allowConditional: true })).filter(option => option.provider !== 'University' && option.evidence === 'conditional') : [];
        const anyMapped = req ? optionsFor(program, req, Object.assign({}, input, { providers: [...new Set((req.options || []).filter(option => option.provider !== 'University').map(option => option.provider))], allowConditional: true })).filter(option => option.provider !== 'University') : [];
        row.placementReason = usable.length ? 'reserved-university' : conditional.length ? 'conditional-gap' : anyMapped.length ? 'excluded-source' : 'research-gap';
      }
      row.fundingStatus = row.placementReason;
    }
    const outside = rows.filter(row => row.option && !hasInstitutionalCredit(row));
    const mapped = outside.filter(row => ['published', 'conditional'].includes(row.option.evidence) || row.status === 'confirmed');
    const knownPriorInstitutional = sum(outside.filter(row => row.status === 'confirmed' && ['College', 'Community college', 'Four-year college', 'Institutional transfer'].includes(row.option.provider) && !row.unknownProvenance), row => row.credits);
    const residencyMinimum = institutionResidencyMinimum(program),derivedResidency = program.residencyPolicy?.interpretationStatus === 'verified-additional-capstone' && residencyMinimum !== null;
    const overallCeiling = finite(program.institutionMinCredits) || derivedResidency ? Math.max(0, Math.min(number(program.totalCredits) - (derivedResidency ? residencyMinimum : program.institutionMinCredits), finite(program.externalMaxCredits) ? program.externalMaxCredits : Infinity)) : program.residencyPolicy && residencyMinimum !== null && finite(program.externalMaxCredits) ? program.externalMaxCredits : null;
    const providerOnly = (input.providers || []).every(provider => {
      const options = (program.requirements || []).flatMap(requirement => (requirement.options || []).filter(option => option.provider === provider));
      return options.length ? options.every(isAlternative) : isAlternative({provider});
    });
    let sourceCeiling = overallCeiling;
    if (sourceCeiling !== null && providerOnly && finite(program.alternativeMaxCredits)) {
      sourceCeiling = Math.min(sourceCeiling, program.alternativeMaxCredits + knownPriorInstitutional);
      notes.push('The combined alternative-credit ceiling is separate from the overall transfer ceiling; fewer required school credits may need eligible institutional transfer credit as well.');
    }
    if (sourceCeiling !== null && !(input.providers || []).length) sourceCeiling = Math.min(sourceCeiling, sum(outside.filter(row => row.status !== 'planned'), row => row.credits));
    const creditsByReason = reason => sum(rows.filter(row => row.placementReason === reason), row => row.credits);
    const mappedExternalCredits = sum(mapped, row => row.credits);
    return {
      mappedExternalCredits,
      publishedExternalCredits: sum(mapped.filter(row => row.option.evidence === 'published' || row.status === 'confirmed'), row => row.credits),
      conditionalExternalCredits: sum(mapped.filter(row => row.option.evidence === 'conditional' && row.status !== 'confirmed'), row => row.credits),
      reportedExternalCredits: sum(outside.filter(row => row.status === 'reported'), row => row.credits),
      universityAssignedCredits: sum(rows.filter(hasInstitutionalCredit), row => row.credits),
      requiredUniversityCredits: creditsByReason('required-university'),
      reservedUniversityCredits: creditsByReason('reserved-university'),
      researchGapCredits: creditsByReason('research-gap'),
      conditionalGapCredits: creditsByReason('conditional-gap'),
      excludedSourceCredits: creditsByReason('excluded-source'),
      existingUniversityCredits: sum(rows.filter(row => row.status !== 'planned' && hasInstitutionalCredit(row)), row => row.credits),
      publishedInstitutionMinimum: finite(program.institutionMinCredits) ? program.institutionMinCredits : null,
      ...(program.residencyPolicy ? derivedResidency ? {derivedInstitutionMinimum:residencyMinimum,residencyCalculationBasis:'Calculated from the university’s required degree-unit fraction, with the capstone completed in addition.'} : {conservativeInstitutionMinimum:residencyMinimum,residencyCalculationBasis:'Conservative sufficient bound; the exact published capstone-exclusion floor is unresolved.'} : {}),
      sourceCeiling, unmappedToCeiling: sourceCeiling === null ? null : Math.max(0, sourceCeiling - mappedExternalCredits),
      notes
    };
  }

  function sourceUseErrors(rows) {
    const actions = new Map(), bundles = new Map(), errors = [];
    const awards=new Map();
    for(const row of rows){const option=row.option;if(!option||option.selectionRequired||row.selectionRequired||option.receivingCourseRepeatable)continue;const code=option.provider==='University'?option.code:option.receivingCode;if(typeof code!=='string'||!code.trim())continue;const identity=code.toUpperCase().replace(/[^A-Z0-9]/g,''),previous=awards.get(identity);if(previous&&(previous.option.provider!=='University'||option.provider!=='University'))errors.push({code:'duplicate_receiving_course',message:'The same receiving-school course cannot count twice: '+code,requirementId:row.requirementId});else awards.set(identity,row);}
    for (const row of rows.filter(r => r.option && r.option.provider !== 'University')) {
      if (row.option.provider === 'Prior learning' && !row.option.code) continue;
      const key = sourceActionKey(row.option), previous = actions.get(key);
      const bundle = row.option.bundleId && bundles.get(row.option.bundleId);
      if (bundle && bundle !== key) errors.push({ code: 'duplicate_source', message: 'A bundled award must refer to one original learning action.', requirementId: row.requirementId });
      if (row.option.bundleId) bundles.set(row.option.bundleId, key);
      if (!previous) actions.set(key, { rows: [row], credits: row.credits, option: row.option });
      else {
        previous.rows.push(row); previous.credits += row.credits;
        if (!row.option.bundleId || row.option.bundleId !== previous.option.bundleId || !near(number(row.option.bundleCredits), number(previous.option.bundleCredits)) || previous.credits > number(row.option.bundleCredits) + 0.001) {
          errors.push({ code: 'duplicate_source', message: 'The same learning action is allocated more than once: ' + (row.option.code || row.option.title), requirementId: row.requirementId });
        }
      }
    }
    return errors;
  }

  function upperGroupRules(program) {
    const raw = program.upperGroupMinimums;
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) return [{valid:false}];
    return raw.map(rule => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !finite(rule.credits) || rule.credits < 0) return {valid:false};
      const single = Object.prototype.hasOwnProperty.call(rule, 'group'), union = Object.prototype.hasOwnProperty.call(rule, 'groups');
      const names = single && !union ? [rule.group] : union && !single && Array.isArray(rule.groups) ? rule.groups : [];
      if (!names.length || names.some(name => typeof name !== 'string' || !name.trim() || name !== name.trim()) || new Set(names).size !== names.length) return {valid:false};
      return {valid:true, names, credits:rule.credits};
    });
  }

  // Receiving identities are destination awards, never the original provider's
  // similarly named course. University options already name destination work.
  function receivingCourse(option) {
    const value = option && (option.receivingCode || (option.provider === 'University' ? option.code : null));
    if (typeof value !== 'string') return null;
    const match = value.trim().toUpperCase().match(/^([A-Z]{2,8})[\s-]?(\d{4})$/);
    return match ? {prefix:match[1], level:Number(match[2]), code:match[1]+'-'+match[2]} : null;
  }

  function tesuPolicySources(program, ids) {
    if (program.school !== 'Thomas Edison State University' || !Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string'||!id.trim()||id!==id.trim()) || new Set(ids).size !== ids.length) return false;
    const sources = new Map((program.sources || []).map(source=>[source.id,source]));
    return ids.every(id=>{try {const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password&&['tesu.edu','www.tesu.edu','tesu.smartcatalogiq.com'].includes(url.hostname);}catch{return false;}});
  }

  function receivingPolicyErrors(program, rows) {
    if (program.liberalArtsAllocation===undefined && program.courseCreditExclusions===undefined) return [];
    const errors = [], requirements = new Map((program.requirements || []).map(row=>[row.id,row]));
    const policy = program.liberalArtsAllocation;
    if (policy !== undefined) {
      const ids = policy?.requirementIds, prefixes = policy?.subjectByPrefix, exceptions = policy?.subjectByReceivingCode;
      const dictionary = value => value && typeof value==='object' && !Array.isArray(value) && Object.values(value).every(subject=>typeof subject==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(subject));
      const valid = policy?.kind==='tesu-liberal-studies-option-a' && tesuPolicySources(program,policy.sourceIds) && Array.isArray(ids) && ids.length===14 && new Set(ids).size===14 && ids.every(id=>requirements.has(id)&&requirements.get(id).category==='major'&&requirements.get(id).credits===3) && !ids.includes(policy.capstoneRequirementId) && requirements.get(policy.capstoneRequirementId)?.institutionalOnly===true && requirements.get(policy.capstoneRequirementId)?.credits===3 && policy.minimumSubjects===2 && policy.maximum1000Credits===6 && dictionary(prefixes) && Object.keys(prefixes).length>0 && Object.keys(prefixes).every(prefix=>/^[A-Z]{2,8}$/.test(prefix)) && dictionary(exceptions) && Object.keys(exceptions).every(code=>receivingCourse({provider:'University',code})?.code===code);
      if (!valid) errors.push({code:'liberal_arts_policy',message:'The Liberal Studies allocation needs its reviewed subject, level and source rules before these choices can be relied on.'});
      else {
        const subjects = new Set(); let introductory = 0;
        for (const row of rows.filter(row=>ids.includes(row.requirementId))) {
          if (!row.option) continue;
          const requirement=requirements.get(row.requirementId), receiving=receivingCourse(row.option);
          const minimum=requirement.minCourseLevel ?? requirement.minimumCourseLevel, maximum=requirement.maxCourseLevel ?? requirement.maximumCourseLevel;
          const explicit=receiving&&Object.prototype.hasOwnProperty.call(exceptions,receiving.code)&&Array.isArray(requirement.allowedReceivingCodeExceptions)&&requirement.allowedReceivingCodeExceptions.includes(receiving.code);
          const ordinary=receiving&&Object.prototype.hasOwnProperty.call(prefixes,receiving.prefix)&&Array.isArray(requirement.allowedCoursePrefixes)&&requirement.allowedCoursePrefixes.includes(receiving.prefix);
          if (!receiving || !ordinary&&!explicit || !finite(minimum)||!finite(maximum)||minimum<1000||maximum>4999||minimum>maximum||receiving.level<minimum||receiving.level>maximum) {
            errors.push({code:'liberal_arts_course_scope',message:'This Liberal Studies choice needs a supported receiving-school subject and course level.',requirementId:row.requirementId}); continue;
          }
          if (receiving.level<2000) introductory+=row.credits;
          let subject=explicit?exceptions[receiving.code]:prefixes[receiving.prefix];
          // English composition, English and Literature are one discipline for
          // this breadth check even if a malformed label tries to split them.
          if (['ENC','ENG','LIT'].includes(receiving.prefix)) subject='english';
          subjects.add(subject);
        }
        if (introductory>policy.maximum1000Credits+0.001) errors.push({code:'liberal_arts_intro_limit',message:'The Liberal Studies area may contain no more than six 1000-level credits.'});
        if (subjects.size<policy.minimumSubjects) errors.push({code:'liberal_arts_subjects',message:'The Liberal Studies selection needs at least two distinct liberal-arts subjects; its capstone does not create a second subject.'});
      }
    }
    if (program.courseCreditExclusions !== undefined) {
      if (!Array.isArray(program.courseCreditExclusions)) errors.push({code:'credit_exclusion_policy',message:'The course overlap rule needs its reviewed receiving-course identities and sources.'});
      else for (const rule of program.courseCreditExclusions) {
        const codes = rule?.codes, normalized=Array.isArray(codes)?codes.map(code=>receivingCourse({provider:'University',code})?.code):[];
        if (!tesuPolicySources(program,rule?.sourceIds)||normalized.length<2||normalized.some(code=>!code)||new Set(normalized).size!==normalized.length) {errors.push({code:'credit_exclusion_policy',message:'The course overlap rule needs its reviewed receiving-course identities and sources.'});continue;}
        const used = new Set(rows.filter(row=>row.option).map(row=>receivingCourse(row.option)?.code).filter(code=>normalized.includes(code)));
        if (used.size>1) errors.push({code:'excluded_course_credit',message:'These distinct courses cannot both count toward the degree: '+normalized.join(' / ')+'.'});
      }
    }
    return errors;
  }

  function academicErrors(program, rows) {
    const errors = [], t = totals(program, rows), ids = new Set(), balance = creditBalancePolicy(program);
    if (program.degreeCreditBalancePolicy?.enabled === true && !balance) errors.push({code:'credit_balance_policy',message:'The earned-credit balance requires its reviewed GCU course identities, quantities, curriculum and policy sources.'});
    for (const row of rows) {
      const requirement = (program.requirements || []).find(req => req.id === row.requirementId);
      const derived = balance?.balanceRequirementIds.includes(row.requirementId), variable = requirement && contentCreditBinding(balance,requirement,row.option);
      if (ids.has(row.requirementId)) errors.push({ code: 'duplicate_requirement', message: 'A requirement appears more than once: ' + row.requirementId });
      ids.add(row.requirementId);
      if (!row.option && !(derived && row.credits === 0)) errors.push({ code: 'unfilled_requirement', message: 'No supported option fills ' + row.title, requirementId: row.requirementId });
      if (!finite(row.credits) || row.credits < 0) errors.push({code:'credit_quantity',message:'The earned-credit quantity must be an exact nonnegative number.',requirementId:row.requirementId});
      if (row.option && !near(number(row.option.credits), row.credits)) errors.push({ code: 'credit_mismatch', message: 'Awarded credits do not match the allocated requirement.', requirementId: row.requirementId });
      if (row.option && row.option.creditSystem && row.option.creditSystem !== creditSystem(program)) errors.push({ code: 'credit_system', message: 'Credit system requires explicit normalization.', requirementId: row.requirementId });
      if (requirement && requirement.institutionalOnly && row.option && row.option.provider !== 'University') errors.push({ code: 'institution_only', message: 'This requirement must be completed through the university.', requirementId: row.requirementId });
      if(requirement?.upperOnly&&row.option&&!row.upper)errors.push({code:'requirement_level',message:'This requirement needs an upper-level course.',requirementId:row.requirementId});
      if (requirement && !near(reqCredits(requirement), row.credits) && !(variable && row.credits === variable.awardedCredits) && !(derived && row.option && row.option.provider === 'University' && row.option.code === requirement.code && row.credits === requirement.options[0].credits)) errors.push({ code: 'requirement_credits', message: 'The plan allocation differs from the published requirement.', requirementId: row.requirementId });
      if (balance && (derived || variable) && (row.nativeRequirementCredits !== requirement.credits || derived && row.creditBalanceDerived !== true)) errors.push({code:'credit_balance_tampered',message:'Native requirement content and actual earned credit must retain their reviewed, separate quantities.',requirementId:row.requirementId});
      if (balance && (derived || variable) && row.option) {
        const canonical = requirement.options.find(option => option.id === row.option.id && option.provider === row.option.provider && option.code === row.option.code);
        if (!canonical || JSON.stringify(reviewedCreditIdentity(canonical)) !== JSON.stringify(reviewedCreditIdentity(row.option)) || JSON.stringify(canonical.sourceIds || []) !== JSON.stringify(row.sourceIds || [])) errors.push({code:'credit_balance_tampered',message:'A content or balance award must retain its reviewed source identity, exact earned quantity, level and evidence.',requirementId:row.requirementId});
      }
      if (balance && variable && row.creditBalanceDerived !== undefined) errors.push({code:'credit_balance_tampered',message:'A transfer course is not derived Service Learning credit.',requirementId:row.requirementId});
      if (balance && !derived && !variable && (row.creditBalanceDerived || row.nativeRequirementCredits !== undefined)) errors.push({code:'credit_balance_tampered',message:'A credit-balance exception cannot be applied to an unreviewed course.',requirementId:row.requirementId});
      if (balance?.writingIntensiveRequirementIds.includes(row.requirementId) && row.option && row.option.provider !== 'University') errors.push({code:'writing_intensive',message:'Retain the university writing-intensive course; an outside content match alone does not establish this requirement.',requirementId:row.requirementId});
      if (row.option && row.upper !== Boolean(row.option.upper)) errors.push({ code: 'upper_classification', message: 'Upper-level classification differs from the destination award.', requirementId: row.requirementId });
      if (positive(requirement?.minimumCompletedCredits) && Number(requirement.minimumCompletedCredits) > number(program.totalCredits) - row.credits + 0.001) errors.push({code:'aggregate_prerequisite', message:'The completed-credit prerequisite for ' + row.title + ' exceeds the other credits in this degree ledger.', requirementId:row.requirementId});
    }
    if (balance) {
      const shortfall = balanceShortfall(balance,rows,program.requirements || []), allocated = sum(rows.filter(row => balance.balanceRequirementIds.includes(row.requirementId) && row.option),row => row.credits);
      if (!Number.isInteger(shortfall) || shortfall < 0 || shortfall > balance.maxBalanceCredits || !near(allocated,shortfall)) errors.push({code:'credit_balance',message:'The actual transfer-credit shortfall must be filled exactly by the reviewed, distinct GCU Service Learning courses; no repeat or extra credit is assumed.'});
      for (const group of generalEducationRules(program)) {
        const earned = sum(rows.filter(row => row.option && row.category === 'general' && group.names.includes(row.subgroup)),row => row.credits);
        if (earned + 0.001 < group.credits) errors.push({code:'general_education_minimum',message:'The '+group.names.join(' / ')+' area needs at least '+group.credits+' actual earned general education credits; service-learning electives cannot fill it.'});
      }
    }
    if (!near(t.accounted, t.required)) errors.push({ code: 'total_credits', message: 'The modeled requirement ledger accounts for ' + t.accounted + ' of ' + t.required + ' credits.' });
    const institutionMinimum = institutionResidencyMinimum(program);
    if (institutionMinimum === null) errors.push({code:'institution_residency_policy',message:'The institutional residency rule needs a source-bound credit calculation.'});
    else if (t.institutional + 0.001 < institutionMinimum) errors.push({ code: 'institution_residency', message: program.residencyPolicy ? 'This route needs at least ' + institutionMinimum + ' university competency units to meet the ' + (program.residencyPolicy.interpretationStatus === 'verified-additional-capstone' ? 'published degree-fraction-plus-capstone rule.' : 'conservative capstone-exclusion calculation.') : 'At least ' + institutionMinimum + ' credits must be earned through the university.' });
    const majorMinimum = majorResidencyMinimum(program);
    if (majorMinimum === null) errors.push({ code: 'major_residency_policy', message: 'Confirm the major-residency policy values. Any fraction needs its positive major-credit basis within the degree total; an absolute minimum must be a nonnegative number.' });
    else if (t.majorInstitutional + 0.001 < majorMinimum) errors.push({ code: 'major_residency', message: 'At least ' + majorMinimum + ' major credits must be earned through the university in this model.' });
    if (t.upper + 0.001 < number(program.upperMinCredits)) errors.push({ code: 'upper_minimum', message: 'At least ' + program.upperMinCredits + ' upper-level credits are required.' });
    if (finite(program.externalMaxCredits) && t.external > program.externalMaxCredits + 0.001) errors.push({ code: 'external_cap', message: 'The proposed outside-university credit exceeds this model’s total transfer ceiling.' });
    if (finite(program.alternativeMaxCredits) && t.alternative > program.alternativeMaxCredits + 0.001) errors.push({ code: 'alternative_cap', message: 'The proposed alternative credit exceeds the combined source-type ceiling.' });
    const waiver = program.appliedTransferWaiver;
    if (waiver && t.external + 0.001 < number(waiver.minimumQualifyingTransferCredits)) errors.push({ code: 'waiver_transfer_threshold', message: 'This proposed waiver scenario requires at least ' + waiver.minimumQualifyingTransferCredits + ' qualifying approved transfer credits; the current plan does not even reach that proposed transfer total.' });

    for (const group of upperGroupRules(program)) {
      if (!group.valid) {errors.push({code:'upper_group_policy',message:'The upper-level credit rule needs a nonnegative minimum and distinct named requirement groups.'});continue;}
      const credits = sum(rows.filter(row => group.names.includes(row.subgroup) && row.upper), row => row.credits);
      if (credits + 0.001 < group.credits) errors.push({ code: 'group_upper', message: 'The ' + group.names.join(' / ') + ' group needs at least ' + group.credits + ' upper-level credits.' });
    }
    return [...errors, ...sourceUseErrors(rows), ...receivingPolicyErrors(program,rows)];
  }

  function providerQuoteKeys(rows, provider) {
    return [...new Set((Array.isArray(rows) ? rows : []).filter(row => row.status === 'planned' && row.option?.provider === provider && provider !== 'University').map(row => optionKey(row.option)))].sort();
  }

  function providerQuote(input, rows, provider) {
    const quotes=input.providerQuotes,bad=detail=>({valid:false,detail:provider+' quote '+detail});
    if(quotes===undefined)return null;
    if(!quotes || typeof quotes!=='object' || Array.isArray(quotes))return bad('storage needs review before relying on this estimate');
    if(!Object.prototype.hasOwnProperty.call(quotes,provider))return null;
    const quote=quotes[provider];
    if(!quote || typeof quote!=='object' || Array.isArray(quote) || !finite(quote.amount) || quote.amount<0 || quote.amount>10000000 || Math.abs(quote.amount*100-Math.round(quote.amount*100))>0.000001)return bad('needs a valid remaining amount, including an explicit 0 if nothing remains to pay');
    if(quote.includesTaxes!==undefined&&typeof quote.includesTaxes!=='boolean' || quote.includesExamFees!==undefined&&typeof quote.includesExamFees!=='boolean')return bad('needs its included charges checked again');
    if(!Array.isArray(quote.courseKeys) || !quote.courseKeys.length || quote.courseKeys.length>500 || quote.courseKeys.some(key=>typeof key!=='string'||!key||key.length>500) || new Set(quote.courseKeys).size!==quote.courseKeys.length || JSON.stringify([...quote.courseKeys].sort())!==JSON.stringify(providerQuoteKeys(rows,provider)))return bad('needs updating for the remaining course list');
    let source='';
    if(quote.sourceUrl!==undefined&&quote.sourceUrl!==''){
      try{const link=new URL(quote.sourceUrl);if(typeof quote.sourceUrl!=='string'||quote.sourceUrl.length>1500||link.protocol!=='https:'||link.username||link.password)return bad('needs a public https price link');source=link.href;}catch{return bad('needs a public https price link');}
    }
    return{valid:true,amount:Math.round(quote.amount*100)/100,includesTaxes:quote.includesTaxes===true,includesExamFees:quote.includesExamFees===true,source,courseKeys:[...quote.courseKeys]};
  }

  function tuitionAssumptions(program, input) {
    const cached = tuitionAssumptionsCache.get(input);
    if (cached && cached.program === program) return cached.value;
    const pricing = program.pricing || {}, sources = new Map((program.sources || []).map(source=>[source.id,source]));
    const sourceBound = Array.isArray(pricing.sourceIds) && pricing.sourceIds.length > 0 && pricing.sourceIds.every(id=>{try {const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}});
    const subscription = ['subscription','per-term','per-semester'].includes(pricing.model) && positive(pricing.amount) && (!pricing.currency || pricing.currency === 'USD');
    const paidTerms = Number.isInteger(Number(input.universitySubscriptionTerms)) && Number(input.universitySubscriptionTerms) > 0 ? Number(input.universitySubscriptionTerms) : null;
    const semesterModel = ['banded-term','threshold-credit'].includes(pricing.model);
    const boundSemesterPricing = sourceBound && semesterModel && creditSystem(program) === 'semester' && pricing.period === 'semester' && pricing.currency === 'USD';
    const semesterRates = pricing.model === 'banded-term' ? positive(pricing.termRate) && positive(pricing.partTimeRate) && positive(pricing.bandMin) && positive(pricing.bandMax) && Number(pricing.bandMin) <= Number(pricing.bandMax) : pricing.model === 'threshold-credit' && positive(pricing.fullTimeRate) && positive(pricing.partTimeRate) && positive(pricing.fullTimeMin);
    const semesterLoad = positive(input.timing?.universityCreditsPerTerm) && (pricing.model !== 'banded-term' || Number(input.timing.universityCreditsPerTerm) <= Number(pricing.bandMax));
    const comparable = number(input.universityRate) > 0 || sourceBound && subscription && paidTerms !== null || boundSemesterPricing && semesterRates && semesterLoad;
    const value = {pricing,sourceBound,subscription,paidTerms,semesterModel,boundSemesterPricing,comparable:Boolean(comparable)};
    tuitionAssumptionsCache.set(input, {program,value});
    return value;
  }

  function subscriptionTermConflict(program, rows, input, assumption) {
    if (number(input.universityRate) > 0 || !assumption.sourceBound || !assumption.subscription || !assumption.paidTerms || !positive(input.timing?.universityCreditsPerTerm) || !positive(input.timing?.universityTermWeeks)) return null;
    const period = String(assumption.pricing.period || '').trim(), parsed = /^(\d+(?:\.\d+)?)\s*(weeks?|months?)$/i.exec(period);
    if (!parsed) return null;
    // Match the explicit study period with the billing period before comparing
    // their counts. An eight-week study subterm is not a six-month paid term.
    const billingWeeks = Number(parsed[1]) * (/^month/i.test(parsed[2]) ? 52 / 12 : 1), assumedTermWeeks = Number(input.timing.universityTermWeeks);
    if (!positive(billingWeeks) || Math.abs(assumedTermWeeks - billingWeeks) > 0.1) return null;
    const modeledTerms = timingModel(program,rows,input).universityTerms;
    if (!Number.isInteger(modeledTerms) || modeledTerms <= assumption.paidTerms) return null;
    return {code:'subscription-term-count-conflict',paidTerms:assumption.paidTerms,modeledTerms,period,assumedTermWeeks,message:'Your course-load schedule uses ' + modeledTerms + ' university terms, but tuition assumes ' + assumption.paidTerms + ' paid terms of ' + period + '. Update your paid terms or course-load estimate.'};
  }

  function costModel(program, rows, input) {
    const future = rows.filter(row => row.status === 'planned' && row.option), providerCosts = [], missing = [], providers = new Set(future.map(row => row.option.provider));
    let subtotal = 0;
    const universityCredits = sum(future.filter(isUniversity), row => row.credits);
    const assumption = tuitionAssumptions(program,input), {pricing,subscription,semesterModel,boundSemesterPricing} = assumption;
    let semesterTuition = null, semesterLoads = null;
    if (boundSemesterPricing && positive(input.timing?.universityCreditsPerTerm) && (pricing.model !== 'banded-term' || Number(input.timing.universityCreditsPerTerm) <= pricing.bandMax)) {
      const loads = timingModel(program,rows,input).universityTermLoads;
      const validLoads = Array.isArray(loads) && loads.every(load=>positive(load));
      if (validLoads && pricing.model === 'banded-term' && positive(pricing.termRate) && positive(pricing.partTimeRate) && positive(pricing.bandMin) && positive(pricing.bandMax) && pricing.bandMin <= pricing.bandMax && loads.every(load=>load<=pricing.bandMax)) {
        semesterTuition = Math.round(sum(loads,load=>load>=pricing.bandMin ? Number(pricing.termRate) : load*Number(pricing.partTimeRate))*100)/100; semesterLoads=loads;
      } else if (validLoads && pricing.model === 'threshold-credit' && positive(pricing.fullTimeRate) && positive(pricing.partTimeRate) && positive(pricing.fullTimeMin)) {
        semesterTuition = Math.round(sum(loads,load=>load*(load>=pricing.fullTimeMin ? Number(pricing.fullTimeRate) : Number(pricing.partTimeRate)))*100)/100; semesterLoads=loads;
      }
    }
    const subscriptionTerms = assumption.paidTerms;
    const universityTuition = !universityCredits ? 0 : number(input.universityRate) > 0 ? universityCredits * number(input.universityRate) : subscription && subscriptionTerms ? Number(pricing.amount) * subscriptionTerms : semesterTuition;
    if (universityTuition === null) missing.push(subscription ? 'Your expected number of university subscription terms and the program’s included-course limits' : semesterModel && boundSemesterPricing ? 'Your planned university course load per billing semester, within the published tuition limits' : 'Current university tuition quote'); else subtotal += universityTuition;
    const termConflict = universityCredits > 0 ? subscriptionTermConflict(program,rows,input,assumption) : null;
    if (termConflict) missing.push(termConflict.message);
    const fees = Math.max(0, number(input.fees)); subtotal += fees;
    if (!input.feesConfirmed) missing.push('University and transcript fees verified against your quote');
    const quoted=new Set();
    for(const provider of providers){
      if(provider==='University')continue;
      const quote=providerQuote(input,rows,provider);if(!quote)continue;quoted.add(provider);
      if(!quote.valid){providerCosts.push({provider,amount:null,detail:quote.detail,source:'',basis:'student-quote',quoteStatus:'needs-review'});missing.push(quote.detail);continue;}
      providerCosts.push({provider,amount:quote.amount,detail:'Your remaining-total quote for '+quote.courseKeys.length+' distinct course or exam action(s). Confirm this basket and checkout amount before paying.',source:quote.source,basis:'student-quote',quoteStatus:'current',courseKeys:quote.courseKeys,includesTaxes:quote.includesTaxes,includesExamFees:quote.includesExamFees});subtotal+=quote.amount;
      if(!quote.includesTaxes)missing.push(provider+' taxes and checkout charges included in your quote');
      if(['CLEP','DSST','Saylor'].includes(provider)&&!quote.includesExamFees)missing.push(provider+' administration/proctoring charges included in your quote');
    }
    // These reviewed university courses charge per distinct source course,
    // regardless of how many degree allocations that course satisfies.
    if(providers.has('ASU Universal Learner')&&!quoted.has('ASU Universal Learner')){
      const actions=futureActions(rows).filter(action=>action.provider==='ASU Universal Learner').map(action=>({...action,option:action.rows[0].option}));
      const sources=new Map((program.sources||[]).map(source=>[source.id,source]));
      const reviewed=actions.length>0&&actions.every(action=>{
        const option=action.option,price=option.costEvidence;
        return option.creditOrigin==='institutional'&&option.costVerified===true&&option.costStatus==='reviewed-provider-course-fees'&&price?.currency==='USD'&&price.basis==='per-course'&&finite(price.enrollmentFee)&&price.enrollmentFee>=0&&finite(price.creditConversionFee)&&price.creditConversionFee>=0&&positive(price.totalCourseCost)&&near(price.enrollmentFee+price.creditConversionFee,price.totalCourseCost)&&near(option.cost,price.totalCourseCost)&&Array.isArray(price.sourceIds)&&price.sourceIds.length&&price.sourceIds.every(id=>{
          try{const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='asu.edu'||url.hostname.endsWith('.asu.edu'));}catch{return false;}
        });
      });
      if(reviewed){
        const amount=sum(actions,action=>action.option.costEvidence.totalCourseCost),first=actions[0].option.costEvidence;
        providerCosts.push({provider:'ASU Universal Learner',amount,detail:actions.length+' distinct ASU course(s); includes published enrollment and transcript-credit fees.',source:sources.get(first.sourceIds[0]).url,basis:'published-per-course-fees',courseKeys:actions.map(action=>sourceActionKey(action.option)),includesTaxes:false});
        subtotal+=amount;quoted.add('ASU Universal Learner');missing.push('ASU applicable taxes or additional checkout charges');
      }
    }
    for (const provider of ['Sophia', 'Study.com']) {
      if (!providers.has(provider)||quoted.has(provider)) continue;
      const months = Math.max(1, Math.ceil(number(input.providerMonths && input.providerMonths[provider], 1)));
      const amount = months * providerPricing[provider].monthly;
      providerCosts.push({ provider, amount, months, detail: months + ' month(s) × $' + providerPricing[provider].monthly + ' (modeled subscription)', source: providerPricing[provider].source }); subtotal += amount;
    }
    if (providers.has('CLEP')&&!quoted.has('CLEP')) {
      const exams = new Set(future.filter(row => row.option.provider === 'CLEP').map(row => optionKey(row.option))).size;
      const amount = input.modernStates && input.voucherConfirmed ? 0 : exams * Math.max(0, number(input.examBudget, providerPricing.CLEP.exam));
      providerCosts.push({ provider: 'CLEP', amount, exams, detail: exams + ' distinct exam(s)' + (input.modernStates && input.voucherConfirmed ? ' · voucher confirmed by user' : ' · exam fee scenario'), source: providerPricing.CLEP.source }); subtotal += amount;
      if (input.modernStates && !input.voucherConfirmed) missing.push('Modern States voucher eligibility and issuance; retail exam fees retained until confirmed');
      if (!input.examFeesConfirmed) missing.push('CLEP administration/proctoring charges');
    }
    if(providers.has('DSST')&&!quoted.has('DSST')){
      const exams=new Set(future.filter(row=>row.option.provider==='DSST').map(row=>optionKey(row.option))).size,amount=exams*providerPricing.DSST.exam;
      providerCosts.push({provider:'DSST',amount,exams,detail:exams+' distinct exam(s) × $100; testing-center charges additional',source:providerPricing.DSST.source});subtotal+=amount;
      if(!input.examFeesConfirmed)missing.push('DSST testing-center administration charges');
    }
    for (const provider of providers) {
      if (!['University', 'Sophia', 'Study.com', 'CLEP','DSST'].includes(provider)&&!quoted.has(provider)) missing.push(provider + ' pricing');
    }
    if (['Sophia', 'Study.com'].some(p => providers.has(p)&&!quoted.has(p)) && !input.taxesConfirmed) missing.push('Provider taxes and checkout price');
    if (program.format === 'Residential' && !input.housingConfirmed) missing.push('Housing, meals and campus expenses');
    return { knownSubtotal: Math.round(subtotal * 100) / 100, modeledSubtotal: Math.round(subtotal * 100) / 100, total: missing.length ? null : Math.round(subtotal * 100) / 100, costComplete: !missing.length, universityTuition, universityCredits, comparableUniversityTuition:universityCredits === 0 || assumption.comparable && finite(universityTuition), ...(termConflict ? {universityTermConflict:termConflict} : {}), universityRateBasis:!(number(input.universityRate) > 0) && semesterTuition !== null ? 'published-semester-load-scenario' : subscription && subscriptionTerms && !(number(input.universityRate) > 0) ? 'student-estimated-subscription-terms' : input.universityRateBasis || (number(input.universityRate) > 0 ? 'student-quote' : 'unknown'), universityRateSourceUrl:input.universityRateSourceUrl || (subscription || boundSemesterPricing ? pricing.sourceUrl || '' : ''), universityPricing:program.pricing ? {...program.pricing} : null, ...(semesterLoads ? {universityTermLoads:semesterLoads,universityBillingPeriod:'semester',universityLoadAssumption:'Tuition uses your assumed billing-semester course load and the modeled prerequisite order. Fees, housing and personal completion time remain separate.'} : {}), ...(subscription ? {universitySubscriptionTerms:subscriptionTerms, subscriptionAssumption:'Paid terms are your estimate, separate from your assumed study periods. A quoted term count does not establish completion capacity.'} : {}), ...(['Sophia','Study.com'].some(provider=>providers.has(provider)&&!quoted.has(provider)) ? {providerBillingAssumption:'Paid provider membership months are your estimate, separate from study duration; no conversion of preparation weeks into billed months is inferred.'} : {}), providerCosts, fees, missing };
  }

  function candidateScore(program, rows, input, priority) {
    const cost = costModel(program, rows, input), t = totals(program, rows), providerCount = new Set(rows.filter(r => r.status === 'planned' && r.option && r.option.provider !== 'University').map(r => r.option.provider)).size;
    const unpricedProviders = new Set(rows.filter(r => r.status === 'planned' && r.option && r.option.provider!=='University'&&!cost.providerCosts.some(item=>item.provider===r.option.provider&&finite(item.amount))).map(r=>r.option.provider)).size;
    // Keep academic feasibility and the student's time/cost/transfer objective
    // first. When those are tied, published unmonitored work is a better match
    // than an unknown format. Unknown options remain available for caps and
    // residency constraints; they never acquire an unmonitored claim.
    const assessmentTieBreak = score => input.proctoringPreference === 'avoid' ? [...(Array.isArray(score) ? score : [score]),futureActions(rows).filter(action => action.rows.some(row => (Assessment?.statusFor?.(program,row.option) || assessmentFor(program,row.option).status) === 'unknown')).length] : score;
    if (priority === 'campus') return assessmentTieBreak(t.external * 100000 + cost.knownSubtotal);
    if (priority === 'transfer') return assessmentTieBreak([-t.external, unpricedProviders, cost.knownSubtotal, providerCount]);
    if (priority === 'speed') {
      if (hasComparableTiming(program, input)) {
        const timing = timingModel(program, rows, input);
        return assessmentTieBreak([timing.scenarioWeeks === null ? Number.MAX_SAFE_INTEGER : timing.scenarioWeeks, timing.universityTerms || 0, timing.universityCredits, timing.externalActions, unpricedProviders, cost.knownSubtotal]);
      }
      // Without comparable duration inputs the objective uses workload only.
      // These are the same measures returned by timingModel; constructing a
      // full course schedule at every search node cannot change this score.
      return assessmentTieBreak([sum(rows.filter(row=>row.status==='planned'&&isUniversity(row)),row=>row.credits), universityDepth(rows), futureActions(rows).length, unpricedProviders, cost.knownSubtotal]);
    }
    // Compare known native tuition, including source-bound flat-term pricing.
    // If those assumptions are absent, preserve the transfer-first fallback.
    const comparable = tuitionAssumptions(program,input).comparable;
    const universityPenalty = comparable ? finite(cost.universityTuition) ? 0 : Number.MAX_SAFE_INTEGER : t.institutional * 10000;
    if (priority === 'balanced') return assessmentTieBreak([universityPenalty, unpricedProviders, providerCount * 250 + cost.knownSubtotal]);
    return assessmentTieBreak([universityPenalty, unpricedProviders, cost.knownSubtotal]);
  }

  function subsets(items) {
    const result = [[]];
    for (const item of items.slice(0, 8)) for (const current of [...result]) result.push([...current, item]);
    // Keep larger source libraries usable without exponential enumeration. The
    // all-source pass can combine providers beyond the exhaustive first eight.
    if (items.length > 8) result.push([...items], ...items.slice(8).map(item => [item]));
    return result;
  }

  // All decisions use the same reviewed options and scoring model as the draft.
  // Greedy baskets provide an incumbent; this search can move an action between
  // requirements, choose another university award, and repair several minima at
  // once. A deterministic state budget bounds work independently of wall time.
  function assignmentSearch(program, input, base, menus, initial, usableErrors) {
    const balance = creditBalancePolicy(program), normalize = rows => normalizeCreditBalance(program,rows,balance,input.plannedLearning);
    const requested = Number(input.optimizationNodeBudget);
    const nodeBudget = Number.isInteger(requested) && requested >= 0 ? Math.min(requested, 100000) : 12000;
    const requirements = program.requirements || [], groups = upperGroupRules(program);
    let best = normalize(initial), bestScore = candidateScore(program, best, input, input.priority);
    let bestUsable = !usableErrors(best).length, statesVisited = 0, budgetExhausted = false;
    const eligibleCredits = base.reduce((credits, row, index) => credits + (row.option || menus[index].length ? row.credits : 0), 0);
    const pruningTolerance = 0.00000001 * Math.max(1, Math.abs(eligibleCredits));
    const externalLimit = finite(program.externalMaxCredits) ? program.externalMaxCredits : Infinity;
    const alternativeLimit = finite(program.alternativeMaxCredits) ? program.alternativeMaxCredits : Infinity;
    const institutionMinimum = institutionResidencyMinimum(program) ?? Infinity, majorMinimum = majorResidencyMinimum(program) ?? Infinity;
    const externalMinimum = number(program.appliedTransferWaiver?.minimumQualifyingTransferCredits);
    const units = base.filter(row => row.credits > 0).map(row => row.credits * 1000);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const creditStep = units.length && units.every(value => Math.abs(value - Math.round(value)) < 0.00000001) ? units.map(Math.round).reduce(gcd) / 1000 : 0;
    const snapUp = value => creditStep ? Math.ceil((value - pruningTolerance) / creditStep) * creditStep : value - pruningTolerance;
    const snapDown = value => creditStep ? Math.floor((value + pruningTolerance) / creditStep) * creditStep : value + pruningTolerance;
    // Search order differs from ledger/scheduling order. Rounding a sum at a
    // half-cent/week boundary must remain optimistic despite floating drift.
    const roundLower = (value, scale) => Math.round((value - Math.max(0.00000001, Math.abs(value) * 0.000000000001)) * scale) / scale;
    const partsFor = row => {
      const filled = Boolean(row.option), institutional = filled && hasInstitutionalCredit(row);
      return [filled && !institutional ? row.credits : 0, filled && (isAlternative(row.option) || row.unknownProvenance) ? row.credits : 0,
        institutional ? row.credits : 0, institutional && row.category === 'major' ? row.credits : 0,
        filled && row.upper ? row.credits : 0, row.status === 'planned' && institutional ? row.credits : 0,
        ...groups.map(group => group.valid && filled && row.upper && group.names.includes(row.subgroup) ? row.credits : 0)];
    };
    const metaFor = row => {
      const option = row.option, source = option && option.provider !== 'University' && !(option.provider === 'Prior learning' && !option.code) ? sourceActionKey(option) : null;
      const code = option && !option.selectionRequired && !row.selectionRequired && !option.receivingCourseRepeatable ? (option.provider === 'University' ? option.code : option.receivingCode) : null;
      return { row, parts: partsFor(row), source, bundle: source && option.bundleId, receiving: typeof code === 'string' && code.trim() ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        provider: option && row.status === 'planned' && option.provider !== 'University' ? option.provider : null,
        action: option && row.status === 'planned' && option.provider !== 'University' ? optionKey(option) : null };
    };
    const allMenus = menus.map(menu => menu.map(metaFor));
    const maximumBundleLimits = new Map();
    allMenus.flat().forEach(meta => { if (meta.bundle) maximumBundleLimits.set(meta.bundle, Math.max(maximumBundleLimits.get(meta.bundle) || 0, number(meta.row.option.bundleCredits))); });
    const minimumPlannedCredits = sum(allMenus, menu => menu.length && menu.every(meta => meta.row.status === 'planned' && meta.row.option) ? menu[0].row.credits : 0);
    const maximumActionCredits = Math.max(1, ...allMenus.flat().filter(meta => meta.provider).map(meta => Math.max(meta.row.credits, number(meta.row.option.bundleCredits) + 0.001)));
    const working = base.slice(), fixed = [], decisions = [];
    for (let index = 0; index < base.length; index++) {
      if (allMenus[index].length > 1) decisions.push({ index, choices: allMenus[index] });
      else {
        const meta = allMenus[index][0] || metaFor(base[index]);
        working[index] = meta.row; fixed.push(meta);
      }
    }
    // Scarce menus go first, making shared-action displacement an ordinary
    // assignment decision instead of committing the action to the first row.
    const frequencies = new Map();
    allMenus.flat().forEach(meta => { if (meta.source) frequencies.set(meta.source, (frequencies.get(meta.source) || 0) + 1); });
    decisions.sort((a, b) => a.choices.length - b.choices.length || Math.max(0, ...b.choices.map(meta => frequencies.get(meta.source) || 0)) - Math.max(0, ...a.choices.map(meta => frequencies.get(meta.source) || 0)) || a.index - b.index);
    for (const decision of decisions) decision.choices.sort((a, b) => Number(b.row.option?.id === initial[decision.index].option?.id) - Number(a.row.option?.id === initial[decision.index].option?.id) || b.parts[0] - a.parts[0]);
    const dimensions = 6 + groups.length, count = decisions.length;
    const minimum = Array.from({ length: count + 1 }, () => Array(dimensions).fill(0));
    const maximum = Array.from({ length: count + 1 }, () => Array(dimensions).fill(0));
    for (let depth = count - 1; depth >= 0; depth--) for (let part = 0; part < dimensions; part++) {
      minimum[depth][part] = minimum[depth + 1][part] + Math.min(...decisions[depth].choices.map(meta => meta.parts[part]));
      maximum[depth][part] = maximum[depth + 1][part] + Math.max(...decisions[depth].choices.map(meta => meta.parts[part]));
    }
    const current = Array(dimensions).fill(0), sources = new Map(), bundles = new Map(), receiving = new Map(), providers = new Map(), actions = new Map(), actionWeeks = new Map(), exams = new Map();
    const knownProviders = new Set(['University', 'Sophia', 'Study.com', 'CLEP', 'DSST']);
    const quotedProvider = provider => input.providerQuotes && typeof input.providerQuotes === 'object' && !Array.isArray(input.providerQuotes) && Object.prototype.hasOwnProperty.call(input.providerQuotes,provider);
    const settings = input.timing || {}, durations = settings.externalWeeks || {}, comparableTiming = input.priority === 'speed' && hasComparableTiming(program, input);
    const concurrency = Number(settings.externalConcurrency) === 2 ? 2 : 1;
    let unpricedProviders = 0;
    function canAdd(meta) {
      const option = meta.row.option;
      if (meta.source) {
        const previous = sources.get(meta.source), bundle = meta.bundle && bundles.get(meta.bundle);
        if (bundle && bundle.source !== meta.source) return false;
        // The validator checks bundle limits in original ledger order; search
        // order may differ. Use the largest eligible limit here and leave its
        // near-equality check to the complete, original-order ledger.
        if (previous && (!meta.bundle || meta.bundle !== previous.bundle || previous.credits + meta.row.credits > maximumBundleLimits.get(meta.bundle) + 0.001 + pruningTolerance)) return false;
      }
      const award = meta.receiving && receiving.get(meta.receiving);
      return !award || !(award.external || option.provider !== 'University');
    }
    const increment = (map, key, delta) => {
      const value = (map.get(key) || 0) + delta;
      if (value) map.set(key, value); else map.delete(key);
    };
    function add(meta, delta) {
      for (let part = 0; part < dimensions; part++) current[part] += delta * meta.parts[part];
      const option = meta.row.option;
      if (meta.source) {
        let source = sources.get(meta.source);
        if (!source) { source = { credits: 0, count: 0, bundle: meta.bundle }; sources.set(meta.source, source); }
        source.credits += delta * meta.row.credits; source.count += delta;
        if (!source.count) sources.delete(meta.source);
        if (meta.bundle) {
          const previous = bundles.get(meta.bundle) || { source: meta.source, count: 0 };
          previous.count += delta;
          if (previous.count) bundles.set(meta.bundle, previous); else bundles.delete(meta.bundle);
        }
      }
      if (meta.receiving) {
        const award = receiving.get(meta.receiving) || { count: 0, external: 0 };
        award.count += delta; award.external += option.provider === 'University' ? 0 : delta;
        if (award.count) receiving.set(meta.receiving, award); else receiving.delete(meta.receiving);
      }
      if (meta.provider) {
        // A partial basket may still fit a valid quoted basket. Treat its quote
        // optimistically in the lower bound; the complete cost model validates
        // every quote against the exact remaining actions.
        if (!knownProviders.has(meta.provider) && !quotedProvider(meta.provider)) unpricedProviders += delta > 0 ? Number(!providers.has(meta.provider)) : -Number(providers.get(meta.provider) === 1);
        increment(providers, meta.provider, delta);
        if (meta.provider === 'CLEP') increment(exams, meta.action, delta);
        if (delta > 0 && !actions.has(meta.action)) actionWeeks.set(meta.action, number(durations[meta.provider]));
        increment(actions, meta.action, delta);
        if (delta < 0 && !actions.has(meta.action)) actionWeeks.delete(meta.action);
      }
    }
    let fixedConflict = false;
    for (const meta of fixed) { if (!canAdd(meta)) fixedConflict = true; add(meta, 1); }
    const nonplannedInstitutional = sum(fixed.filter(meta => meta.row.status !== 'planned'), meta => meta.parts[2]);
    const fees = Math.max(0, number(input.fees)), universityRate = number(input.universityRate);
    const tuition = tuitionAssumptions(program,input), {pricing,subscription} = tuition, subscriptionTerms = tuition.paidTerms;
    function bounds(depth) {
      const low = minimum[depth], high = maximum[depth];
      if (current[0] + low[0] > externalLimit + 0.001 + pruningTolerance || current[1] + low[1] > alternativeLimit + 0.001 + pruningTolerance || current[2] + high[2] + 0.001 + pruningTolerance < institutionMinimum || current[3] + high[3] + 0.001 + pruningTolerance < majorMinimum || current[4] + high[4] + 0.001 + pruningTolerance < number(program.upperMinCredits)) return null;
      if (current[0] + high[0] + 0.001 + pruningTolerance < externalMinimum) return null;
      for (let group = 0; group < groups.length; group++) if (current[6 + group] + high[6 + group] + 0.001 + pruningTolerance < number(groups[group].credits)) return null;
      // Validation accepts a 0.001-credit policy tolerance. Relax by exactly
      // that amount, then use the ledger's credit lattice when available; a
      // bound must never reject an award accepted by the academic validator.
      const minInstitutional = snapUp(Math.max(current[2] + low[2], institutionMinimum - 0.001, majorMinimum - 0.001, eligibleCredits - externalLimit - 0.001));
      const maxExternal = snapDown(Math.min(current[0] + high[0], externalLimit + 0.001, eligibleCredits - minInstitutional));
      const minUniversity = snapUp(Math.max(current[5] + low[5], minInstitutional - nonplannedInstitutional, 0));
      let universityLower = universityRate > 0 ? minUniversity * universityRate : minUniversity > 0 && tuition.sourceBound && subscription && subscriptionTerms ? Number(pricing.amount) * subscriptionTerms : 0;
      if (!(universityRate > 0) && tuition.boundSemesterPricing && tuition.comparable && ['cost','balanced'].includes(input.priority)) {
        // Any feasible term pays at least this per-credit amount. Dependencies
        // and partially filled final terms can only increase the modeled bill.
        const minimumRate = pricing.model === 'banded-term' ? Math.min(Number(pricing.partTimeRate),Number(pricing.termRate)/Number(pricing.bandMax)) : Math.min(Number(pricing.fullTimeRate),Number(pricing.partTimeRate));
        universityLower = minUniversity * minimumRate;
      }
      let cost = fees + universityLower;
      for (const provider of ['Sophia', 'Study.com']) if (providers.has(provider) && !quotedProvider(provider)) cost += Math.max(1, Math.ceil(number(input.providerMonths && input.providerMonths[provider], 1))) * providerPricing[provider].monthly;
      if (!(input.modernStates && input.voucherConfirmed) && !quotedProvider('CLEP')) cost += exams.size * Math.max(0, number(input.examBudget, providerPricing.CLEP.exam));
      cost = roundLower(cost, 100);
      let score;
      if (input.priority === 'campus') score = snapUp(Math.max(current[0] + low[0], externalMinimum - 0.001)) * 100000 + cost;
      else if (input.priority === 'transfer') score = [-maxExternal, unpricedProviders, cost, providers.size];
      else if (input.priority === 'speed') {
        // Once the preceding university-credit bound is attained, all other
        // required future credits need external actions. Even the largest
        // reviewed bundle cannot cover more than this many receiving credits.
        const minActions = Math.max(actions.size, Math.ceil(Math.max(0, minimumPlannedCredits - minUniversity - 0.001) / maximumActionCredits));
        if (comparableTiming) {
          const terms = Math.ceil(Math.max(0, minUniversity - 0.00000001) / (Number(settings.universityCreditsPerTerm) + 0.001));
          // Assigned external work cannot disappear. Work divided by concurrency
          // and the credit-load term minimum are optimistic schedule bounds.
          const externalDuration = sum([...actionWeeks.values()], value => value);
          const weeks = roundLower(externalDuration / concurrency + terms * Number(settings.universityTermWeeks), 10);
          score = [weeks, terms, minUniversity, minActions, unpricedProviders, cost];
        } else score = [minUniversity, minUniversity > 0 ? 1 : 0, minActions, unpricedProviders, cost];
      } else {
        const universityWeight = tuition.comparable ? 0 : 10000;
        score = [minInstitutional * universityWeight, unpricedProviders, ...(input.priority === 'balanced' ? [providers.size * 250 + cost] : [cost])];
      }
      return { score, maxExternal };
    }
    function consider(rows) {
      rows = normalize(rows);
      if (usableErrors(rows).length) return;
      const score = candidateScore(program, rows, input, input.priority), order = compareScores(score, bestScore);
      if (!bestUsable || order < 0 || order === 0 && input.priority !== 'campus' && totals(program, rows).external > totals(program, best).external) {
        best = rows.slice(); bestScore = score; bestUsable = true;
      }
    }
    let augmentationStatesVisited = 0;
    const augmentationLimit = Math.min(256, Math.floor(nodeBudget / 4));
    function displace(rows, protectedRows, remainingDepth) {
      if (augmentationStatesVisited >= augmentationLimit) return;
      augmentationStatesVisited++; statesVisited++;
      const conflicts = sourceUseErrors(rows);
      if (!conflicts.length) { consider(rows); return; }
      if (!remainingDepth) return;
      // Follow only the actions/receiving awards displaced by this proposed
      // change. This cheaply repairs short augmenting chains in large menus.
      for (let index = 0; index < rows.length; index++) {
        if (protectedRows.has(index) || allMenus[index].length < 2) continue;
        const option = rows[index].option;
        if (!option || ![...protectedRows].some(other => {
          const proposed = rows[other].option;
          return proposed && (sameLearningAction(option, proposed) || sourceUseErrors([rows[other], rows[index]]).length);
        })) continue;
        for (const meta of allMenus[index]) {
          if (meta.row.option?.id === option.id) continue;
          const trial = rows.slice(); trial[index] = meta.row;
          const nextProtected = new Set(protectedRows); nextProtected.add(index);
          displace(trial, nextProtected, remainingDepth - 1);
          if (augmentationStatesVisited >= augmentationLimit) return;
        }
      }
    }
    if (bestUsable && !fixedConflict && augmentationLimit) {
      for (const decision of decisions) {
        for (const meta of decision.choices) {
          if (meta.row.option?.id === best[decision.index].option?.id) continue;
          const trial = best.slice(); trial[decision.index] = meta.row;
          displace(trial, new Set([decision.index]), 3);
          if (augmentationStatesVisited >= augmentationLimit) break;
        }
        if (augmentationStatesVisited >= augmentationLimit) break;
      }
    }
    // Variable earned-credit balances can make a useful substitution require a
    // simultaneous release elsewhere. Examine a bounded two-row neighborhood
    // around the traversal's best incumbent: complete candidates can improve a provider
    // mix even when either individual change would lose transfer credit or
    // exceed the reviewed shortfall capacity. Fixed student choices are absent
    // from decisions, and every trial uses the ordinary academic/objective checks.
    let pairedRepairStatesVisited = 0;
    const alternatives = balance ? decisions.map(decision => Math.max(0,decision.choices.length - 1)) : [];
    const neighborhoodSize = alternatives.reduce((total,value,index) => total + value + value * sum(alternatives.slice(index + 1),other => other),0);
    const pairedRepairLimit = balance && !fixedConflict ? Math.min(1024,Math.floor(nodeBudget / 4),2 * neighborhoodSize) : 0;
    const traversalNodeBudget = nodeBudget - pairedRepairLimit;
    function repairPairs() {
      if (!balance || !bestUsable || fixedConflict || !pairedRepairLimit || !budgetExhausted) return;
      for (let pass = 0; pass < 2 && pairedRepairStatesVisited < pairedRepairLimit; pass++) {
        const incumbent = best, seed = best.slice();
        const trial = (left,leftChoice,right,rightChoice) => {
          if (pairedRepairStatesVisited >= pairedRepairLimit || statesVisited >= nodeBudget) return false;
          pairedRepairStatesVisited++; statesVisited++;
          const rows = seed.slice(); rows[left.index] = leftChoice.row;
          if (right) rows[right.index] = rightChoice.row;
          consider(rows); return true;
        };
        for (let leftIndex = 0; leftIndex < decisions.length && pairedRepairStatesVisited < pairedRepairLimit; leftIndex++) {
          const left = decisions[leftIndex];
          for (const leftChoice of left.choices) {
            if (leftChoice.row.option?.id === seed[left.index].option?.id) continue;
            if (!trial(left,leftChoice)) break;
            for (let rightIndex = leftIndex + 1; rightIndex < decisions.length && pairedRepairStatesVisited < pairedRepairLimit; rightIndex++) {
              const right = decisions[rightIndex];
              for (const rightChoice of right.choices) {
                if (rightChoice.row.option?.id === seed[right.index].option?.id) continue;
                if (!trial(left,leftChoice,right,rightChoice)) break;
              }
            }
          }
        }
        if (best === incumbent) break;
      }
    }
    function visit(depth) {
      if (statesVisited >= traversalNodeBudget) { budgetExhausted = true; return; }
      statesVisited++;
      // Derived institutional credits depend on the complete transfer basket.
      // Fixed-credit lattice and objective bounds are not valid for this opt-in
      // model. Preserve the deterministic node budget and exact leaf checks.
      const bound = balance ? null : bounds(depth);
      if (!balance && !bound) return;
      if (!balance && bestUsable) {
        const order = compareScores(bound.score, bestScore);
        if (order > 0 || order === 0 && (input.priority === 'campus' || bound.maxExternal <= totals(program, best).external + 0.001)) return;
      }
      if (depth === count) { consider(working); return; }
      const decision = decisions[depth];
      for (const meta of decision.choices) {
        if (!canAdd(meta)) continue;
        working[decision.index] = meta.row; add(meta, 1); visit(depth + 1); add(meta, -1);
        if (budgetExhausted) break;
      }
    }
    // Even a one-choice menu may repair an unresolved starting row. Inspecting
    // this complete deterministic assignment does not consume a search state.
    if (!count && !fixedConflict) consider(working);
    else if (!fixedConflict) visit(0);
    repairPairs();
    const academicValid = !academicErrors(program, best).length, complete = !budgetExhausted;
    return { rows: best, optimization: { method: 'bounded-assignment-search', status: complete ? academicValid ? 'optimal-for-model' : 'infeasible-for-model' : 'best-found',
      optimalityProven: complete && academicValid, infeasibilityProven: complete && !academicValid, statesVisited, augmentationStatesVisited, ...(balance ? {pairedRepairStatesVisited} : {}), nodeBudget, budgetExhausted, objectiveScore: bestScore } };
  }

  function evaluatedPriorBundles(program, completed, setupIssues) {
    const requirements = new Map((program.requirements || []).map(req => [req.id, req]));
    const groups = new Map(), approved = new Map();
    const storedOption = prior => (requirements.get(prior.requirementId)?.options || []).find(option => option.id === prior.optionId);
    const sourceIdentity = prior => {
      const option = storedOption(prior), code = option?.code || prior.code;
      return code ? (option?.provider || prior.sourceProvider || 'Prior learning') + ':' + code : null;
    };
    for (const prior of completed.values()) {
      // Reviewed canonical bundles already carry their own allocation limits.
      if (storedOption(prior) || (prior.bundleId === undefined && prior.bundleCredits === undefined)) continue;
      const expectedId = typeof prior.learningId === 'string' && prior.learningId ? 'evaluated:' + program.id + ':' + prior.learningId : null;
      if (!expectedId || prior.bundleId !== expectedId || !finite(prior.bundleCredits) || prior.bundleCredits <= 0 || !['confirmed', 'reported'].includes(prior.status)) {
        setupIssues.push({ code: 'invalid_prior_bundle', message: 'An existing-learning bundle lacks a consistent school-evaluated identity or credit limit.', requirementId: prior.requirementId });
        continue;
      }
      if (!groups.has(prior.bundleId)) groups.set(prior.bundleId, []);
      groups.get(prior.bundleId).push(prior);
    }
    for (const [bundleId, entries] of groups) {
      const first = entries[0], identity = sourceIdentity(first);
      const allocated = sum(entries, prior => reqCredits(requirements.get(prior.requirementId)));
      const consistent = entries.length > 1 && entries.every(prior =>
        prior.learningId === first.learningId && prior.sourceProvider === first.sourceProvider && prior.code === first.code &&
        (prior.creditSystem || creditSystem(program)) === creditSystem(program) && near(prior.bundleCredits, first.bundleCredits) && reqCredits(requirements.get(prior.requirementId)) > 0);
      const reused = identity && [...completed.values()].some(prior => !entries.includes(prior) && sourceIdentity(prior) === identity);
      // The adapter supplies the total receiving award, not spare capacity that
      // could authorize another allocation or an unrelated repeat of the source.
      if (!consistent || !near(allocated, first.bundleCredits) || reused) {
        setupIssues.push({ code: 'invalid_prior_bundle', message: 'Existing-learning bundle components must be distinct, share one source record and credit limit, and exactly account for the evaluated award.', requirementId: first.requirementId });
        continue;
      }
      for (const prior of entries) approved.set(prior.requirementId, { bundleId, bundleCredits: first.bundleCredits });
    }
    return approved;
  }

  function reviewedDefaults(program,input) {
    const review=program.reviewedBaselineChoices,own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
    const edition=value=>String(value||'').replace(/[–—]/g,'-');
    if(!review||review.version!==1||review.modelId!==program.id||review.format!==program.format||review.creditSystem!==creditSystem(program)||review.totalCredits!==program.totalCredits||edition(review.catalogYear)!==edition(program.catalogYear||program.catalog)||!review.reviewId||!/^20\d{2}-\d{2}-\d{2}$/.test(review.checkedOn||'')||!Array.isArray(review.sourceIds)||!review.sourceIds.length||review.sourceIds.some(id=>!(program.sources||[]).some(source=>source.id===id))||!review.optionSelections||typeof review.optionSelections!=='object'||Array.isArray(review.optionSelections)||input.optionSelections==null||typeof input.optionSelections!=='object'||Array.isArray(input.optionSelections))return {};
    const entries=Object.entries(review.optionSelections),requirements=program.requirements||[];
    if(entries.some(([id,optionId])=>typeof optionId!=='string'||!requirements.some(requirement=>requirement.id===id&&(requirement.options||[]).some(option=>option.id===optionId))))return {};
    const done=new Set((input.completed||[]).filter(item=>['reported','confirmed'].includes(item.status)).map(item=>item.requirementId)),defaults={};
    for(const [id,optionId] of entries)if(!own(input.optionSelections,id)&&!done.has(id)&&availableOptions(program,id,input).some(option=>option.id===optionId&&!option.selectionRequired))defaults[id]=optionId;
    return defaults;
  }
  function generate(program, inputValue, withoutReviewedDefaults=false) {
    const input = normalizedInput(inputValue), setupIssues = [], warnings = [], requirements = program.requirements || [];
    if(!withoutReviewedDefaults){
      const defaults=reviewedDefaults(program,input);
      if(Object.keys(defaults).length){
        const candidate=generate(program,{...input,optionSelections:{...defaults,...input.optionSelections}},true);
        // A researched starting choice is a default, never a restriction on
        // personal records, enabled providers or a student's own selections.
        if(candidate.validation?.academicCountsValid&&!candidate.setupIssues.some(issue=>['invalid_selection','selection_conflict'].includes(issue.code)))return candidate;
      }
    }
    const balance = creditBalancePolicy(program), normalizedRows = new WeakMap();
    const normalize = rows => {
      if (!balance) return rows;
      if (!normalizedRows.has(rows)) normalizedRows.set(rows,normalizeCreditBalance(program,rows,balance,input.plannedLearning));
      return normalizedRows.get(rows);
    };
    // Eligibility is fixed for this generation. Preserve original option and
    // requirement identities: published IDs need not be unique in a draft.
    const eligibleOptions = new WeakMap();
    const optionsForRequirement = requirement => {
      if (!eligibleOptions.has(requirement)) eligibleOptions.set(requirement, optionsFor(program, requirement, input));
      return eligibleOptions.get(requirement);
    };
    // Scenario choices use exactly the same evidence and source eligibility as
    // automatic choices. Invalid requests remain explicit blockers even though
    // the ledger can still show its supported automatic fallback.
    const selectedOptions = new Map(), selections = input.optionSelections;
    if (selections === null || typeof selections !== 'object' || Array.isArray(selections)) {
      setupIssues.push({ code: 'invalid_selection', message: 'Scenario selections must identify a supported option for each requirement.' });
    } else for (const [requirementId, optionId] of Object.entries(selections || {})) {
      const requirement = requirements.find(req => req.id === requirementId);
      const option = requirement && typeof optionId === 'string' && optionId && optionsForRequirement(requirement).find(option => option.id === optionId);
      if (!option || balance?.balanceRequirementIds.includes(requirementId)) setupIssues.push({ code: 'invalid_selection', message: balance?.balanceRequirementIds.includes(requirementId) ? 'Service Learning credit is allocated automatically only for the actual transfer-credit shortfall.' : requirement ? 'The course chosen for ' + requirement.title + ' comes from a source that is turned off or no longer listed. Choose another course for it, or turn that source back on in Course preferences.' : 'A scenario selection does not match a requirement in this program.', requirementId });
      else selectedOptions.set(requirementId, option);
    }
    const completed = new Map();
    for (const item of input.completed || []) {
      if (!requirements.some(req => req.id === item.requirementId)) { setupIssues.push({ code: 'unknown_completed_requirement', message: 'An existing-credit entry does not match this program.', requirementId: item.requirementId }); continue; }
      if (completed.has(item.requirementId)) { warnings.push('Duplicate existing-credit entries were consolidated for ' + item.requirementId + '.'); continue; }
      completed.set(item.requirementId, item);
    }
    const priorBundles = evaluatedPriorBundles(program, completed, setupIssues);
    const base = requirements.map(req => {
      const options = optionsForRequirement(req), university = options.find(o => o.provider === 'University');
      const prior = completed.get(req.id);
      if (prior && ['confirmed', 'reported'].includes(prior.status)) {
        if (prior.creditSystem && prior.creditSystem !== creditSystem(program)) setupIssues.push({ code: 'credit_system', message: 'Prior learning uses a different credit system. Normalize it before applying.', requirementId: req.id });
        const storedOption = (req.options || []).find(o => o.id === prior.optionId);
        // A confirmed degree evaluation may be stronger evidence than a current
        // generic provider mapping. Unnamed records never count as school residency.
        const option = storedOption || Object.assign({ id: 'prior-' + req.id, provider: 'Prior learning', title: prior.title || 'Existing learning assigned to this requirement', code: prior.code || '', ...(typeof prior.receivingCode==='string'&&prior.receivingCode.trim()?{receivingCode:prior.receivingCode}:{}), credits: reqCredits(req), upper: Boolean(req.upper), sourceIds: [], evidence: 'student-record' }, priorBundles.get(req.id));
        const row = makeRow(req, option, prior.status,program,balance);
        if (selectedOptions.has(req.id) && selectedOptions.get(req.id).id !== option.id) warnings.push('Existing learning for ' + req.title + ' takes precedence over the scenario replacement; no replacement will be purchased.');
        row.selectionRequired = false;
        row.priorLearning = true;
        row.institutionUnknown = !storedOption;
        row.unknownProvenance = !storedOption && !prior.sourceProvider;
        if (!storedOption && prior.sourceProvider) row.option.provider = prior.sourceProvider;
        if (row.unknownProvenance) row.conditions.push('Identify the original learning source before relying on source-specific transfer limits; unknown provenance is reserved against the alternative-credit cap.');
        if (prior.status === 'reported') row.conditions.push('Awaiting university confirmation that this learning satisfies this requirement. Do not purchase a replacement yet.');
        return row;
      }
      if (selectedOptions.has(req.id)) return makeRow(req, selectedOptions.get(req.id),'planned',program,balance);
      if (balance?.balanceRequirementIds.includes(req.id)) return makeRow(req,null,'planned',program,balance);
      return makeRow(req, university || null, university ? 'planned' : 'unresolved',program,balance);
    });
    // Selecting an action already in the inventory requests evaluation of that
    // learning, never another purchase. Non-bundled double allocation remains a
    // duplicate_source error; a legitimate remaining bundle award stays pending.
    for (const row of base.filter(row => selectedOptions.has(row.requirementId) && row.status === 'planned' && row.option && !isUniversity(row))) {
      const priorAction = base.find(prior => ['reported', 'confirmed'].includes(prior.status) && prior.option && sameLearningAction(prior.option, row.option));
      if (!priorAction) continue;
      row.status = 'reported'; row.priorLearning = true;
      row.conditions.push('This learning action already appears in your inventory. Request evaluation of its applicability here; do not purchase or repeat it.');
    }
    const optionMenus = requirements.map((req, index) => {
      if (balance?.balanceRequirementIds.includes(req.id)) return [base[index]];
      if (selectedOptions.has(req.id) || ['reported', 'confirmed'].includes(base[index].status)) return [base[index]];
      return optionsForRequirement(req).map(option => {
        const priorAction = base.find(row => ['reported', 'confirmed'].includes(row.status) && row.option && sameLearningAction(row.option, option));
        const inferredFromBundle = option.provider !== 'University' && priorAction && option.bundleId;
        const row = makeRow(req, option, inferredFromBundle ? 'reported' : 'planned',program,balance);
        if (inferredFromBundle) {
          row.priorLearning = true;
          row.conditions.push('This bundled learning action already appears in your inventory. Request evaluation of its remaining award; do not purchase or repeat it.');
        }
        return row;
      });
    });
    const researchGaps = new Set(requirements.filter((req, index) => !base[index].option && !optionMenus[index].length).map(req => req.id));
    const immutableCreditGap = researchGaps.size > 0 || !near(sum(requirements, reqCredits), number(program.totalCredits));
    // A known unsupported row stays a visible blocker. It must not veto every
    // otherwise eligible substitution in the supported part of the ledger.
    const usableErrors = rows => academicErrors(program, normalize(rows)).filter(error => !(error.code === 'unfilled_requirement' && researchGaps.has(error.requirementId)) && !(error.code === 'total_credits' && immutableCreditGap));
    // Start with institutional options, then choose eligible external substitutions
    // while preserving academic minima. Enumerating provider sets captures shared
    // subscription costs without pricing every course as another membership.
    const selectedProviders = [...new Set(base.filter(row => selectedOptions.has(row.requirementId) && row.status === 'planned' && row.option && !isUniversity(row)).map(row => row.option.provider))];
    const strategies = input.priority === 'campus' ? [selectedProviders] : subsets(input.providers.filter(provider => !selectedProviders.includes(provider))).map(providers => [...selectedProviders, ...providers]);
    // Greedy trials replace the rows array instead of mutating it. Reuse its
    // objective while testing replacements, and keep this memo local: the
    // assignment search below reuses mutable arrays and must score them afresh.
    const greedyScores=new WeakMap();
    const baseProposalScores = requirements.map(() => new WeakMap());
    const greedyScore=rows=>{
      if(!greedyScores.has(rows))greedyScores.set(rows,candidateScore(program,normalize(rows),input,input.priority));
      return greedyScores.get(rows);
    };
    let best = base, bestScore = greedyScore(base);
    let bestAcademicValid = !usableErrors(best).length;
    for (const allowed of strategies) {
      let rows = base.map(row => Object.assign({}, row));
      const proposals = [];
      requirements.forEach((req, index) => {
        if (!['planned', 'unresolved'].includes(rows[index].status) || selectedOptions.has(req.id)) return;
        for (const option of optionsForRequirement(req).filter(o => o.provider !== 'University' && allowed.includes(o.provider))) proposals.push({ index, option });
      });
      // Favor exact options with high tuition displacement; retain upper-level
      // degree credit and prefer shared provider memberships over extra exams.
      if (input.priority === 'speed') for (const proposal of proposals) {
        // Every basket starts from the same base ledger. Score each original
        // option once here; later substitutions still use their actual rows.
        const cache = baseProposalScores[proposal.index];
        if (!cache.has(proposal.option)) {
          const trial = rows.slice(); trial[proposal.index] = makeRow(requirements[proposal.index], proposal.option,'planned',program,balance);
          cache.set(proposal.option, greedyScore(trial));
        }
        proposal.speedScore = cache.get(proposal.option);
      }
      proposals.sort((a, b) => {
        if (input.priority === 'speed') {
          return compareScores(a.speedScore, b.speedScore) || a.index - b.index;
        }
        const aCost = a.option.provider === 'CLEP' ? number(input.examBudget, 97) : 0;
        const bCost = b.option.provider === 'CLEP' ? number(input.examBudget, 97) : 0;
        return aCost - bCost || Number(b.option.upper) - Number(a.option.upper) || a.index - b.index;
      });
      for (const proposal of proposals) {
        const old = rows[proposal.index];
        if (old.option && old.option.provider !== 'University') continue;
        const trial = rows.slice();
        const priorAction = rows.find(row => ['reported', 'confirmed'].includes(row.status) && row.option && sameLearningAction(row.option, proposal.option));
        const inferredFromBundle = priorAction && proposal.option.bundleId;
        trial[proposal.index] = makeRow(requirements[proposal.index], proposal.option, inferredFromBundle ? 'reported' : 'planned',program,balance);
        if (inferredFromBundle) {
          trial[proposal.index].priorLearning = true;
          trial[proposal.index].conditions.push('This bundled learning action already appears in your inventory. Request evaluation of its remaining award; do not purchase or repeat it.');
        }
        if (!usableErrors(trial).length) rows = trial;
      }
      // Prune substitutions whose actual marginal modeled cost is worse. Keeping
      // the provider basket intact first allows several courses to share a fee
      // even when its first individual course would cost more than university.
      for (let index = 0; index < rows.length; index++) {
        if (selectedOptions.has(rows[index].requirementId) || rows[index].status !== 'planned' || !rows[index].option || rows[index].option.provider === 'University') continue;
        const fallback = base[index]; if (!fallback.option) continue;
        const trial = rows.slice(); trial[index] = fallback;
        if (!usableErrors(trial).length && compareScores(greedyScore(trial), greedyScore(rows)) < 0) rows = trial;
      }
      // Speed can prefer a more expensive source for the same requirement.
      // Reconsider already-selected external options rather than keeping the
      // first provider merely because it was visited first in the basket.
      if (input.priority === 'speed') {
        for (let pass = 0; pass < 2; pass++) {
          let changed = false;
          for (let index = 0; index < rows.length; index++) {
            if (rows[index].status !== 'planned' || selectedOptions.has(rows[index].requirementId)) continue;
            for (const option of optionsForRequirement(requirements[index]).filter(option => option.provider === 'University' || allowed.includes(option.provider))) {
              if (rows[index].option && option.id === rows[index].option.id) continue;
              const trial = rows.slice(); trial[index] = makeRow(requirements[index], option,'planned',program,balance);
              if (!usableErrors(trial).length && compareScores(greedyScore(trial), greedyScore(rows)) < 0) { rows = trial; changed = true; }
            }
          }
          if (!changed) break;
        }
      }
      const score = greedyScore(rows);
      const academicValid = !usableErrors(rows).length;
      const preferValidity = academicValid !== bestAcademicValid;
      if (preferValidity ? academicValid : compareScores(score, bestScore) < 0 || (compareScores(score, bestScore) === 0 && totals(program, rows).external > totals(program, best).external && input.priority !== 'campus')) { best = rows; bestScore = score; bestAcademicValid = academicValid; }
    }
    const searched = assignmentSearch(program, input, base, optionMenus, best, usableErrors);
    best = searched.rows;
    bestAcademicValid = !academicErrors(program, best).length;
    if (selectedOptions.size && !bestAcademicValid) setupIssues.push({ code: 'selection_conflict', message: 'Selected options were retained, but no combination meeting all degree rules was found. Change a selection or resolve the degree-rule blockers before using this scenario.' });
    const labels = { transfer: 'Most transfer credit', cost: 'Cost-focused route', balanced: 'Fewer provider handoffs', speed: 'Speed-focused route', campus: 'Campus-first route' };
    const plan = { programId: program.id, priority: input.priority, label: labels[input.priority] || labels.cost, rows: best, totals: totals(program, best), costs: costModel(program, best, input), warnings, setupIssues, optimization: searched.optimization, assumptions: ['Published equivalencies are not an individual transfer award.', 'The degree ledger uses this dataset’s catalog version; admission/enrollment determines actual catalog rights.', program.pricing?.sourceIds?.length ? 'University tuition uses the cited pricing. Your remaining paid terms and personal charges depend on your scenario.' : 'Subscription windows and prices are scenario inputs.'], timing: timingModel(program, best, input) };
    plan.coverage = coverageModel(program, plan.rows, input);
    if (input.priority === 'speed' && !hasComparableTiming(program, input)) plan.timing.assumptions.unshift('Speed is ranked by less remaining university credit, then shorter modeled university prerequisite chains and fewer external actions; enter timing estimates to compare scenario duration.');
    const validation = validate(program, plan);
    plan.validation = validation;
    plan.blockers = validation.errors;
    plan.researchTasks = [...validation.errors.filter(issue => issue.owner === 'DegreePath'),...validation.researchNotes];
    if (plan.coverage.researchGapCredits) plan.researchTasks.push({code:'outside-option-research', owner:'DegreePath', blocking:false, credits:plan.coverage.researchGapCredits, message:'Research additional outside options for ' + plan.coverage.researchGapCredits + ' credits currently assigned to university courses.'});
    if (plan.coverage.conditionalGapCredits) plan.researchTasks.push({code:'excluded-conditional-options', owner:'DegreePath', blocking:false, credits:plan.coverage.conditionalGapCredits, message:'Review the conditional outside options excluded from ' + plan.coverage.conditionalGapCredits + ' credits.'});
    plan.personalTasks = validation.personalTasks;
    plan.resolvedNotes = validation.resolvedNotes;
    plan.readiness = validation.valid ? 'review-ready' : 'draft';
    for (const row of plan.rows) {
      const record = (Array.isArray(input.plannedLearning) ? input.plannedLearning : []).find(item => item.requirementId === row.requirementId && item.optionId === row.option?.id && ['saved', 'planned', 'in-progress'].includes(item.status));
      if (record && row.status === 'planned') {
        row.plannedLearningId = record.learningId; row.plannedLearningStatus = record.status; row.reusesSavedCourse = true;
      }
    }
    plan.sequence = sequence(plan.rows);
    plan.nextActions = nextActions(program, plan);
    return plan;
  }

  function validate(program, plan) {
    const academic = academicErrors(program, plan.rows || []), errors = [...(plan.setupIssues || []), ...academic], warnings = [], conditionalProviders = new Map();
    const expected = new Set((program.requirements || []).map(r => r.id));
    const knownSources = new Set((program.sources || []).map(source => source.id));
    if ((plan.rows || []).length !== expected.size || (plan.rows || []).some(r => !expected.has(r.requirementId))) errors.push({ code: 'ledger_shape', message: 'The plan must contain every modeled requirement exactly once.' });
    for (const row of plan.rows || []) {
      const requirement = (program.requirements || []).find(req => req.id === row.requirementId);
      const canonical = requirement && (requirement.options || []).find(option => row.option && option.id === row.option.id && option.provider === row.option.provider && option.code === row.option.code);
      if (!['planned', 'reported', 'confirmed', 'unresolved'].includes(row.status)) errors.push({ code: 'invalid_status', message: 'The requirement has an unknown completion state.', requirementId: row.requirementId });
      if (requirement && (row.category !== requirement.category || (row.subgroup || null) !== (requirement.subgroup || requirement.group || null))) errors.push({ code: 'requirement_classification', message: 'The requirement category or subgroup differs from the reviewed catalog ledger.', requirementId: row.requirementId });
      const academicIdentity = option => ['creditSystem', 'sourceCreditSystem', 'sourceCredits', 'sourceUpper', 'creditOrigin', 'sourceType', 'bundleId', 'bundleCredits'].map(field => option[field] ?? null);
      if (canonical && (!near(number(canonical.credits), number(row.option.credits)) || Boolean(canonical.upper) !== Boolean(row.option.upper) || JSON.stringify(canonical.sourceIds || []) !== JSON.stringify(row.option.sourceIds || []) || JSON.stringify(academicIdentity(canonical)) !== JSON.stringify(academicIdentity(row.option)))) errors.push({ code: 'mapping_tampered', message: 'The selected award amount, level, source type, source quantity, bundle or evidence differs from its reviewed mapping.', requirementId: row.requirementId });
      if (creditBalancePolicy(program) && canonical && JSON.stringify(row.sourceIds || []) !== JSON.stringify(canonical.sourceIds || [])) errors.push({code:'mapping_tampered',message:'The row evidence must retain its reviewed source identities.',requirementId:row.requirementId});
      if (requirement && number(row.minimumCompletedCredits) !== number(requirement.minimumCompletedCredits)) errors.push({code:'prerequisite_tampered', message:'The completed-credit prerequisite differs from the reviewed requirement.', requirementId:row.requirementId});
      if (row.status === 'planned' && row.option && !canonical) errors.push({ code: 'unsupported_option', message: 'The selected option is not part of this reviewed requirement mapping.', requirementId: row.requirementId });
      if (row.status === 'planned' && row.option && (!canonical || !['published', 'conditional'].includes(canonical.evidence) || !canonical.sourceIds || !canonical.sourceIds.length || canonical.sourceIds.some(id => !knownSources.has(id)))) errors.push({ code: 'missing_evidence', message: 'The course option lacks usable catalog or mapped evidence.', requirementId: row.requirementId });
      if (row.status === 'reported') errors.push({ code: 'reported_credit', owner:'student', message: 'Send the original record for a university evaluation of ' + row.title + '.', requirementId: row.requirementId });
      if (row.unknownProvenance) errors.push({ code: 'unknown_provenance', message: 'Identify and verify the original learning source for ' + row.title + ' before relying on source-specific limits.', requirementId: row.requirementId });
      if (row.selectionRequired || (requirement && requirement.selectionRequired && !['confirmed', 'reported'].includes(row.status))) errors.push({ code: 'selection_required', message: 'Choose an approved specific course for ' + row.title + '.', requirementId: row.requirementId });
      if (row.option && (row.option.evidence === 'conditional' || canonical && canonical.evidence === 'conditional')) {
        errors.push(conditionalReview(row,canonical || row.option));
        if (row.status === 'planned' && row.option.provider !== 'University') conditionalProviders.set(row.option.provider,(conditionalProviders.get(row.option.provider) || 0) + 1);
      }
      if (row.status === 'planned' && row.option && row.option.provider !== 'University' && canonical?.evidence !== 'conditional' && row.option.preapprovalRequired === true) warnings.push('School pre-approval is required for ' + row.option.provider + ' — ' + row.option.title + '; its published course match is separate from your approval.');
    }
    for (const [provider,count] of conditionalProviders) warnings.push('DegreeSteps is reviewing documented conditions for ' + count + ' selected ' + provider + ' course' + (count === 1 ? '' : 's') + '. The specific open items are attached to each course.');
    if (program.appliedTransferWaiver) errors.push({ code: 'waiver_confirmation', message: 'The university must confirm the transfer-triggered waiver, the qualifying approved transfer total, and degree applicability of its replacement elective credits before this waiver scenario is actionable.' });
    const unresolved = unresolvedItems(program,plan.rows); errors.push(...unresolved.errors);
    const policies = policyIssues(program); errors.push(...policies);
    return { valid: !errors.length, academicCountsValid: !academic.length, policyChecksComplete:!policies.length && !academic.some(error => ['major_residency_policy','institution_residency_policy'].includes(error.code)), errors, warnings, researchNotes:unresolved.researchNotes, personalTasks:unresolved.personalTasks, resolvedNotes:unresolved.resolvedNotes };
  }

  function nextActions(program, plan) {
    const actions = [], reported = plan.rows.filter(r => r.status === 'reported');
    const policy = policyIssues(program)[0]; if (policy) actions.push('DegreeSteps is reviewing this program policy: ' + policy.message);
    if (reported.length) actions.push('Request a university evaluation of your ' + reported.length + ' reported prior-learning item(s) before purchasing replacements.');
    const conditional = plan.rows.filter(row => row.status === 'planned' && row.option && row.option.provider !== 'University' && row.option.evidence === 'conditional');
    if (conditional.length) actions.push(conditionalReview(conditional[0],conditional[0].option).message + (conditional.length > 1 ? ' ' + (conditional.length - 1) + ' other selected course conditions are also in the DegreeSteps research queue.' : ''));
    if (program.appliedTransferWaiver) actions.push('Ask the university to confirm the ' + program.appliedTransferWaiver.minimumQualifyingTransferCredits + '-credit transfer waiver and the proposed replacement electives. Waived requirements do not award credit.');
    const seen = new Set();
    const orderedRows = (plan.sequence || []).flatMap(step => step.requirementIds.map(id => plan.rows.find(row => row.requirementId === id)));
    for (const row of orderedRows.filter(r => r.status === 'planned' && r.option && r.option.provider !== 'University')) {
      const key = optionKey(row.option); if (seen.has(key)) continue; seen.add(key);
      actions.push((row.plannedLearningStatus === 'in-progress' ? 'Continue your in-progress course: ' : row.option.evidence === 'published' && row.option.preapprovalRequired !== true ? row.reusesSavedCourse ? 'Use your collected course: ' : 'Start: ' : 'After approval: ') + row.option.provider + ' — ' + row.option.title + (row.option.minScore ? ' (minimum score ' + row.option.minScore + ')' : '') + ' → ' + (row.option.receivingCategory || row.code || row.title) + '.');
    }
    if (plan.coverage.researchGapCredits) actions.push('DegreeSteps is researching more outside options for ' + plan.coverage.researchGapCredits + ' credits currently assigned to university courses.');
    if (plan.coverage.conditionalGapCredits) actions.push('DegreeSteps is reviewing the conditional outside options excluded from ' + plan.coverage.conditionalGapCredits + ' credits.');
    actions.push('Send official transcripts and exam results to the university as you complete your transfer courses.');
    actions.push(...(plan.personalTasks || []).map(task => task.message));
    if (plan.costs.missing.length) actions.push('Complete the price assumptions: ' + plan.costs.missing.join('; ') + '.');
    actions.push('Set your study pace and intended university start to estimate your finish date.');
    return actions;
  }

  function sequence(rows) {
    const planned = rows.filter(row => row.status === 'planned' && row.option), output = [], done = new Set(rows.filter(row => ['confirmed', 'reported'].includes(row.status)).map(row => row.requirementId)), actions = new Map();
    // Destination course prerequisites apply to university enrollment. They are not
    // automatically treated as the external provider's enrollment prerequisites.
    const remaining = [...planned].sort((a, b) => Number(a.option.provider === 'University') - Number(b.option.provider === 'University'));
    while (remaining.length) {
      const completedCredits = sum(rows.filter(row => done.has(row.requirementId)), row => row.credits);
      let index = remaining.findIndex(row => (row.option.provider !== 'University' || (row.prerequisites || []).every(id => done.has(id) || !planned.some(r => r.requirementId === id))) && completedCredits + 0.001 >= number(row.minimumCompletedCredits));
      const blocked = index < 0;
      if (index < 0) index = 0; // A draft still displays all work; it claims no feasible term schedule.
      const row = remaining.splice(index, 1)[0], key = row.option.provider === 'University' ? row.requirementId : optionKey(row.option);
      if (actions.has(key)) actions.get(key).requirementIds.push(row.requirementId);
      else {
        const step = { order: output.length + 1, requirementIds: [row.requirementId], provider: row.option.provider, title: row.option.title, code: row.option.code, after: row.option.provider === 'University' ? row.prerequisites || [] : row.option.prerequisites || [], notes: row.prerequisiteNotes || '', timingVerified: false, ...(row.minimumCompletedCredits ? {minimumCompletedCredits:row.minimumCompletedCredits} : {}), ...(blocked ? {executionBlocked:true, notes:[row.prerequisiteNotes, 'Confirm prerequisite completion before starting this course.'].filter(Boolean).join(' ')} : {}), ...(row.plannedLearningStatus ? {learningStatus:row.plannedLearningStatus} : {}) };
        actions.set(key, step); output.push(step);
      }
      done.add(row.requirementId);
    }
    return output;
  }

  function compare(program, input) {
    return ['transfer', 'speed', 'cost'].map(priority => generate(program, Object.assign({}, input || {}, { priority })));
  }
  // An open slot is a sourced requirement block the student fills with a course of their choice (owner-approved,
  // 2026-11-23). Until they choose, it is planned as one course at the school: the registry's "choose a course"
  // placeholder, which has no course code. It is a complete plan row, never a named course.
  const SLOT_KINDS = ['gen-ed', 'major-elective', 'free-elective', 'concentration'];
  function isOpenSlot(requirement) {
    const slot = requirement && requirement.slot;
    return Boolean(slot && typeof slot === 'object' && SLOT_KINDS.includes(slot.kind) && typeof slot.label === 'string' && slot.label.trim() && requirement.allocationSlot === true && !requirement.institutionalOnly);
  }
  function openSlotPlaceholder(requirement, option) {
    return Boolean(isOpenSlot(requirement) && option && option.provider === 'University' && option.selectionRequired === true && !(typeof option.code === 'string' && option.code.trim()) && Math.abs(Number(option.credits) - Number(requirement.credits)) < 0.001 && (requirement.options || []).some(item => item.id === option.id && item.provider === 'University'));
  }
  const api = Object.freeze({ generate, compare, validate, availableOptions, assessmentFor, assessmentAllowsOption, providerPricing, providerQuoteKeys, institutionResidencyMinimum, creditBalancePolicy, isOpenSlot, openSlotPlaceholder });
  root.DegreePlanner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
