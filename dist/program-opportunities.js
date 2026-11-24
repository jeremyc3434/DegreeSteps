/* Shared program facts. Listing a degree never establishes a course equivalency. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.DegreeProgramOpportunities = api; root.ProgramOpportunities = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const UNKNOWN_TUITION = 'Tuition needs confirmation';
  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isPositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const items = value => Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()) : typeof value === 'string' && value.trim() ? [value] : [];
  // Research records also contain instructions for catalog maintainers, not students.
  const studentNotes = value => items(value).map(text => text.split(/(?<=[.!?])\s+/).filter(sentence => !/\bdo not (?:imply|present|promise|treat|infer|extrapolate)|must be modeled|\binventory\b|directory card|\bindexed\b|\binaccessible\b|leave.*unverified/i.test(sentence)).join(' ')).filter(Boolean);
  const graduate = program => /^(master|masters|doctorate|doctoral|specialist|graduate)$/.test(String(program && program.level || '').toLowerCase());

  function safeURL(value) {
    try { const url = new URL(String(value || '')); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  function link(url, label) { const href = safeURL(url); return href ? '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(label || 'Source') + '</a>' : ''; }
  function schoolFor(data, program) {
    const schools = Array.isArray(data) ? data : data && (data.schools || data.programDirectory && data.programDirectory.schools) || [];
    if (!program || !Array.isArray(schools)) return null;
    const id = program.schoolId || program.institutionId || (program.school && typeof program.school === 'object' ? program.school.id : null);
    if (id) { const exact = schools.find(s => s.id === id); if (exact) return exact; }
    const name = typeof program.school === 'string' ? program.school : program.schoolName || program.school && program.school.name;
    if (name) { const exact = schools.find(s => normalize(s.name || s.school) === normalize(name)); if (exact) return exact; }
    return schools.find(s => (s.programs || []).some(p => p.id === program.id)) || null;
  }
  function applicablePricing(program, school) {
    if (program && program.pricing && typeof program.pricing === 'object') return program.pricing;
    const p = school && school.pricing;
    if (!p || !program) return null;
    if (Array.isArray(p.programIds)) return p.programIds.includes(program.id) ? p : null;
    // A university-wide number is unsafe when delivery models or prices differ.
    if (p.model === 'subscription' && program.paceModel === 'competency-subscription' &&
        Array.isArray(school.paceModels) && school.paceModels.length === 1 && school.paceModels[0] === program.paceModel) return p;
    return null;
  }
  function priceText(program, school) {
    const p = applicablePricing(program, school);
    if (!p || !p.period) return UNKNOWN_TUITION;
    const money = value => {
      try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency || 'USD', maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value); }
      catch (_) { return null; }
    };
    const period = String(p.period).replace(/^per\s+/i, '');
    if (p.model === 'threshold-credit') {
      if (!isPositive(p.fullTimeRate) || !isPositive(p.partTimeRate) || !Number.isInteger(p.fullTimeMin) || p.fullTimeMin < 1) return UNKNOWN_TUITION;
      const low = money(Math.min(p.fullTimeRate, p.partTimeRate)), high = money(Math.max(p.fullTimeRate, p.partTimeRate)), full = money(p.fullTimeRate);
      if (!low || !high || !full) return UNKNOWN_TUITION;
      return (low === high ? low : low + '–' + high) + ' per credit (' + full + ' at ' + p.fullTimeMin + '+ credits per ' + period + ')';
    }
    if (p.model === 'banded-term') {
      if (!isPositive(p.termRate) || !Number.isInteger(p.bandMin) || !Number.isInteger(p.bandMax) || p.bandMin < 1 || p.bandMax < p.bandMin) return UNKNOWN_TUITION;
      const amount = money(p.termRate), partTime = isPositive(p.partTimeRate) ? money(p.partTimeRate) : null;
      if (!amount) return UNKNOWN_TUITION;
      return amount + ' per ' + period + ' (' + p.bandMin + '–' + p.bandMax + ' credits)' + (partTime ? '; ' + partTime + ' per credit below ' + p.bandMin : '');
    }
    if (!isPositive(p.amount) || !['subscription', 'per-credit', 'per-term', 'per-year', 'annual', 'per-semester'].includes(p.model)) return UNKNOWN_TUITION;
    const amount = money(p.amount);
    if (!amount) return UNKNOWN_TUITION;
    return amount + ' per ' + String(p.period).replace(/^per\s+/i, '');
  }
  // Learning model, pace and billing are independent facts. Unknown never means no.
  function learningFacts(program) {
    const p = program || {}, pace = p.paceModel;
    return {
      competencyBased: typeof p.competencyBased === 'boolean' ? p.competencyBased : pace === 'competency-subscription' ? true : null,
      selfPaced: typeof p.selfPaced === 'boolean' ? p.selfPaced : ['competency-subscription', 'self-paced'].includes(pace) ? true : pace === 'course-term' ? false : null
    };
  }
  function paceText(program) {
    if (!program) return 'Pace needs confirmation';
    const pace = learningFacts(program);
    if (pace.selfPaced === false) return 'Courses follow a term schedule';
    const p = program.pricing || program.effectivePricing;
    if (pace.selfPaced === true && program.paceModel === 'competency-subscription') {const period=p&&['subscription','per-term','per-semester','banded-term'].includes(p.model)&&p.period?String(p.period).replace(/^per\s+/i,'').replace(/^(\d+)\s+(weeks?|months?)$/,(_,n,unit)=>n+'-'+unit.replace(/s$/,'')):'';return period?'Self-paced · '+period+' terms':'Self-paced';}
    if (pace.selfPaced === true) {
      const weeks = program.blockWeeks || program.termWeeks;
      return isPositive(weeks) ? 'Self-paced within ' + weeks + '-week blocks' : p && p.model === 'per-credit' ? 'Self-paced; tuition charged per credit' : 'Self-paced';
    }
    return 'Pace needs confirmation';
  }
  function fitFacts(program, school) {
    const p = program || {}, learning = learningFacts(p), pricing = applicablePricing(p, school);
    const models = {'per-credit':'per-credit','threshold-credit':'per-credit',subscription:'subscription','per-term':'flat-term','per-semester':'flat-term','banded-term':'flat-term','per-year':'annual',annual:'annual'};
    const billing = pricing && Object.hasOwn(models, pricing.model) ? models[pricing.model] : null;
    const labels = {'per-credit':'Per credit',subscription:'Subscription','flat-term':'Flat price per term',annual:'Annual tuition'};
    const date = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
      const parsed = new Date(value + 'T00:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
    };
    const ids = value => [...new Set(items(value))];
    const rawPeriod = pricing && pricing.period ? String(pricing.period).replace(/^per\s+/i, '').trim() : '';
    const weeks = p.blockWeeks || p.termWeeks;
    const termLabel = rawPeriod && !/^(?:semester |quarter |competency )?credits?$/i.test(rawPeriod) ? rawPeriod : isPositive(weeks) ? weeks + ' weeks' : null;
    return {
      ...learning, billing, termLabel, tuitionLabel:priceText(p, school), paceLabel:paceText(p), billingLabel:labels[billing] || 'Billing type not listed',
      sources: {
        learning: {
          url:safeURL(p.paceSourceUrl) || safeURL(p.learningSourceUrl) || safeURL(p.url),
          sourceIds:ids(p.paceSourceIds || p.learningSourceIds || p.pacePolicy && p.pacePolicy.sourceIds || p.sourceId),
          checkedOn:date(p.paceCheckedOn || p.learningCheckedOn || p.checkedOn || p.catalogCheckedAt)
        },
        billing: {
          url:safeURL(pricing && pricing.sourceUrl), sourceIds:ids(pricing && (pricing.sourceIds || pricing.sourceId)), checkedOn:date(pricing && pricing.checkedOn)
        }
      }
    };
  }
  function fitsFilters(facts, filters) {
    const values = facts && typeof facts === 'object' ? facts : {}, selected = filters || {};
    for (const key of ['competencyBased', 'selfPaced']) {
      const wanted = selected[key];
      if (wanted === undefined || wanted === null || wanted === '') continue;
      if (typeof wanted !== 'boolean' || values[key] !== wanted) return false;
    }
    const billing = selected.billing;
    if (billing !== undefined && billing !== null && billing !== '' && (!['per-credit','subscription','flat-term','annual'].includes(billing) || values.billing !== billing)) return false;
    return true;
  }
  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date) : '';
  }
  function availability(program) {
    const status = String(program && (program.status || program.availability) || '').toLowerCase();
    if (/approval.?pending|pending.?approval/.test(status)) return { canChoose: false, statusLabel: 'Awaiting program approval' };
    if (/upcoming|planned|coming.?soon/.test(status)) return { canChoose: false, statusLabel: dateLabel(program.availableFrom) ? 'Starts ' + dateLabel(program.availableFrom) : 'Coming soon' };
    if (/closed|inactive|discontinued|unavailable|not-available/.test(status)) return { canChoose: false, statusLabel: 'Not currently available' };
    if (program && program.intakeVerified === false) return { canChoose: false, statusLabel: 'Confirm new-student availability' };
    return { canChoose: true, statusLabel: 'Listed by the school' };
  }
  function programPolicy(program, school, kind) {
    const direct = program && program.transferPolicy || {}, general = school && school.transferPolicy || {};
    if (direct[kind]) return direct[kind];
    const grad = graduate(program), graduatePolicy = direct.graduate || general.graduate;
    if (kind === 'institutional') {
      if (isPositive(direct.maximumCredits) || direct.maximumCredits === 0 || direct.status) return direct;
      return grad ? graduatePolicy || { status: 'not-verified', notes: 'Graduate transfer requirements need confirmation.' } : general.institutional || { status: 'not-verified' };
    }
    if (grad) {
      if (graduatePolicy && graduatePolicy.status === 'not-accepted') return { ...graduatePolicy, notes: graduatePolicy.notes || 'Transfer credit is not accepted for this graduate program.' };
      if (general[kind] && general[kind].status === 'not-accepted') return general[kind];
      return { status: 'not-verified', notes: 'Undergraduate ' + kind.toUpperCase() + ' acceptance does not establish graduate credit. Confirm eligible graduate-level work for this degree.', sourceUrl: graduatePolicy && graduatePolicy.sourceUrl || general[kind] && general[kind].sourceUrl };
    }
    return general[kind] || { status: 'not-verified' };
  }
  function policyLabel(policy, kind, program) {
    if (!policy) return 'Needs confirmation';
    if (policy.status === 'not-accepted') return 'Not accepted';
    if (isPositive(policy.maximumCredits)) {
      const unit = policy.creditUnit || program && program.creditUnit;
      const unitText = unit === 'quarter' ? 'quarter credits' : unit === 'semester' ? 'semester credits' : unit === 'competency-unit' ? 'competency units' : 'credits';
      return 'Up to ' + policy.maximumCredits + ' ' + unitText;
    }
    if (isPositive(policy.maximumPercent)) return 'Up to ' + policy.maximumPercent + '%; program limits apply';
    if (policy.status === 'accepted') return 'Eligible courses accepted';
    if (policy.status === 'case-by-case') return 'School review required';
    return graduate(program) && kind !== 'institutional' ? 'Graduate credit needs confirmation' : 'Needs confirmation';
  }
  function detailsHTML(program, school, fitOverride) {
    if (!program) return '';
    const state = availability(program), price = applicablePricing(program, school), fit = fitOverride && typeof fitOverride === 'object' ? fitOverride : fitFacts(program, school);
    const row = (label, value) => '<div><dt>' + escapeHTML(label) + '</dt><dd>' + escapeHTML(value) + '</dd></div>';
    const source = safeURL(fit.sources && fit.sources.billing && fit.sources.billing.url) || safeURL(price && price.sourceUrl) || safeURL(program.url);
    const learningSource = typeof fit.selfPaced === 'boolean' || typeof fit.competencyBased === 'boolean' ? safeURL(fit.sources && fit.sources.learning && fit.sources.learning.url) : '';
    let html = '<div class="program-facts"><dl>' + row('Tuition', typeof fit.tuitionLabel === 'string' ? fit.tuitionLabel : priceText(program, school)) + row('Pace', typeof fit.paceLabel === 'string' ? fit.paceLabel : paceText(program));
    if (typeof fit.competencyBased === 'boolean') html += row('Learning model', fit.competencyBased ? 'Competency-based (CBE)' : 'Course-based');
    if (['per-credit','subscription','flat-term','annual'].includes(fit.billing)) html += row('Tuition billing', fit.billingLabel || fitFacts(program, school).billingLabel);
    if (!state.canChoose) html += row('Availability', state.statusLabel);
    if (isPositive(program.degreeCredits)) {
      const unit = program.creditUnit === 'quarter' ? 'quarter credits' : program.creditUnit === 'semester' ? 'semester credits' : program.creditUnit === 'competency-unit' ? 'competency units' : 'credits';
      html += row('Degree requirements', program.degreeCredits + ' ' + unit);
    }
    html += '</dl>' + (source || learningSource ? '<span class="program-fact-source">' + (source ? link(source, 'Official program and tuition') : '') + (learningSource && learningSource !== source ? (source ? ' · ' : '') + link(learningSource, 'Learning format source') : '') + '</span>' : '') + '</div>';
    const attendance=Array.isArray(fit.requirements)?fit.requirements.filter(item=>item&&typeof item.label==='string'&&safeURL(item.url)):[];
    if(attendance.length)html+='<div class="program-conditions"><strong>Attendance requirements</strong><ul>'+attendance.map(item=>'<li>'+escapeHTML(item.label)+(item.courseCode?' · '+escapeHTML(item.courseCode):'')+' '+link(item.url,'Course requirement source')+'</li>').join('')+'</ul></div>';
    const policies = [['institutional', 'College-earned credits'], ['ace', 'ACE courses'], ['nccrs', 'NCCRS courses']].map(([kind, label]) => ({ kind, label, policy: programPolicy(program, school, kind) }));
    html += '<div class="program-policy"><dl>' + policies.map(p => row(p.label, policyLabel(p.policy, p.kind, program))).join('') + '</dl></div>';
    const requirements = items(program.prerequisites);
    if (requirements.length) html += '<div class="program-conditions"><strong>Before you apply</strong><ul>' + requirements.map(text => '<li>' + escapeHTML(text) + '</li>').join('') + '</ul></div>';
    const aid = program.financialAid || {};
    const restrictions = [];
    if (aid.federalAidEligible === false) restrictions.push('Not eligible for federal student aid.');
    if (aid.veteransBenefitsEligible === false) restrictions.push('Veterans benefits are not currently available.');
    if (!state.canChoose) restrictions.unshift(state.statusLabel + '. Check the official program before making an enrollment plan.');
    if (restrictions.length) html += '<div class="program-conditions"><ul>' + restrictions.map(text => '<li>' + escapeHTML(text) + '</li>').join('') + '</ul>' + link(aid.sourceUrl || program.url, 'Check eligibility') + '</div>';
    const notes = [...new Set([...studentNotes(price && price.notes), ...studentNotes(program.notes)])];
    const hasPolicyNotes = policies.some(p => studentNotes(p.policy && p.policy.notes).length);
    if (notes.length || hasPolicyNotes) {
      html += '<details class="program-conditions"><summary>Transfer rules, fees and conditions</summary>';
      if (notes.length) html += '<ul>' + notes.map(text => '<li>' + escapeHTML(text) + '</li>').join('') + '</ul>';
      policies.forEach(p => {
        const lines = studentNotes(p.policy && p.policy.notes);
        if (lines.length) html += '<p><strong>' + escapeHTML(p.label) + ':</strong> ' + lines.map(escapeHTML).join(' ') + ' ' + link(p.policy.sourceUrl, 'Policy source') + '</p>';
      });
      html += '</details>';
    }
    return html;
  }
  return Object.freeze({ priceText, paceText, fitFacts, fitsFilters, transferPolicyFor:programPolicy, availability, schoolFor, detailsHTML });
}));
