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
    if (Array.isArray(p.programIds) && p.programIds.includes(program.id)) return p;
    // A university-wide number is unsafe when delivery models or prices differ.
    if (p.model === 'subscription' && program.paceModel === 'competency-subscription' &&
        Array.isArray(school.paceModels) && school.paceModels.length === 1 && school.paceModels[0] === program.paceModel) return p;
    return null;
  }
  function priceText(program, school) {
    const p = applicablePricing(program, school);
    if (!p || !isPositive(p.amount) || !p.period || !['subscription', 'per-credit', 'per-term', 'per-year', 'annual', 'per-semester'].includes(p.model)) return UNKNOWN_TUITION;
    let amount;
    try { amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency || 'USD', maximumFractionDigits: Number.isInteger(p.amount) ? 0 : 2 }).format(p.amount); }
    catch (_) { return UNKNOWN_TUITION; }
    return amount + ' per ' + String(p.period).replace(/^per\s+/i, '');
  }
  function paceText(program) {
    if (!program) return 'Pace needs confirmation';
    const p = program.pricing || program.effectivePricing;
    if (program.paceModel === 'competency-subscription') {const period=p&&p.period?String(p.period).replace(/^per\s+/i,'').replace(/^(\d+)\s+(weeks?|months?)$/,(_,n,unit)=>n+'-'+unit.replace(/s$/,'')):'';return period?'Self-paced · '+period+' terms':'Self-paced subscription';}
    if (program.paceModel === 'self-paced') {
      const weeks = program.blockWeeks || program.termWeeks;
      return isPositive(weeks) ? 'Self-paced within ' + weeks + '-week blocks' : p && p.model === 'per-credit' ? 'Self-paced; tuition charged per credit' : 'Self-paced';
    }
    if (program.paceModel === 'course-term') return 'Courses follow a term schedule';
    return 'Pace needs confirmation';
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
  function detailsHTML(program, school) {
    if (!program) return '';
    const state = availability(program), price = applicablePricing(program, school);
    const row = (label, value) => '<div><dt>' + escapeHTML(label) + '</dt><dd>' + escapeHTML(value) + '</dd></div>';
    const source = price && price.sourceUrl || program.url;
    let html = '<div class="program-facts"><dl>' + row('Tuition', priceText(program, school)) + row('Pace', paceText(program));
    if (!state.canChoose) html += row('Availability', state.statusLabel);
    if (isPositive(program.degreeCredits)) {
      const unit = program.creditUnit === 'quarter' ? 'quarter credits' : program.creditUnit === 'semester' ? 'semester credits' : program.creditUnit === 'competency-unit' ? 'competency units' : 'credits';
      html += row('Degree requirements', program.degreeCredits + ' ' + unit);
    }
    html += '</dl>' + (source ? '<span class="program-fact-source">' + link(source, 'Official program and tuition') + '</span>' : '') + '</div>';
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
  return Object.freeze({ priceText, paceText, availability, schoolFor, detailsHTML });
}));
