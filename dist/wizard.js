/* DegreeSteps: a local, preloaded, adaptive degree-building experience. */
(function () {
  'use strict';
  const KEY = 'degreepath-guide-v3';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const url = value => typeof value === 'string' && /^https:\/\//i.test(value) ? value : '#';
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  const uid = () => globalThis.crypto?.randomUUID?.() || 'learning-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const label = value => ({ 'any-degree': 'A degree that opens doors', 'career-growth': 'Advance in my career', 'change-career': 'Change careers', teacher: 'Become a teacher', lawyer: 'Prepare for a legal career', pilot: 'Pursue a flying career', 'health-professional': 'Enter a health profession', associate: 'Associate degree', bachelor: 'Bachelor’s degree', master: 'Master’s degree', doctorate: 'Doctoral degree', unsure: 'Help me choose a level', any: 'Open to options', online: 'Online', campus: 'On campus', balanced: 'A balance of time and cost', speed: 'Finish sooner', cost: 'Spend less', transfer: 'Use the most applicable transfer credit', none: 'No military connection', active: 'Active duty', veteran: 'Veteran', reserve: 'Reserve / National Guard', dependent: 'Military family member', mixed: 'A mix of assessments', exams: 'Exams', writing: 'Writing', projects: 'Projects', general: 'Flexible / general studies', business: 'Business', technology: 'Technology', education: 'Education', health: 'Health', law: 'Law', aviation: 'Aviation', essential: 'In-person learning is essential', preferred: 'I would prefer some classroom time', open: 'I’m flexible' }[value] || value || 'Not specified');
  const defaults = { entry: '', goal: 'any-degree', degreeLevel: 'bachelor', field: 'any', school: '', degree: '', pathwayId: '', modality: 'any', classroomImportance: 'open', country: 'US', state: '', priority: 'balanced', weeklyHours: 10, budget: '', deadline: '', militaryStatus: 'none', militaryBranch: '', militaryRecords: 'not-sure', hasPrior: 'none', priorCreditEstimate: 0, assessmentPreference: 'mixed', proctoringPreference: 'open', goalDetail: '' };
  let state = { version: 3, profile: { ...defaults }, learning: [], step: 'start', view: 'wizard', selectedPathwayId: '', resultTab: 'plan', scenarios: {}, baseline: null };
  let catalog = null, models = [], candidates = [], current = null, currentPlan = null, currentProgram = null, inventoryMatch = null, guidance = null, imported = [];
  let learningMode = 'manual', activeLearningId = null, activeLearningDraft = null, localSaving = true;
  let communityMount = null, communityRevision = 0, pendingShare = new URLSearchParams(location.search).get('share') === '1';
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140);
  const schoolKey = name => ({'Thomas Edison State University':'tesu','Liberty University':'liberty','University of Maine at Presque Isle':'umpi','Western Governors University':'wgu','Charter Oak State College':'cosc','Southern New Hampshire University':'snhu','Purdue Global':'purdue-global'}[name] || slug(name));
  const courseContext = option => 'course:' + (slug(option.provider) + '-' + slug((option.codeAliases || []).find(code => /^SOPH-/i.test(code)) || option.code || option.id)).slice(0,160);
  function discussionButton(context, title, caption = 'Discuss this choice') {
    return '<button type="button" class="button ghost small" data-discuss-context="' + esc(context) + '" data-discuss-title="' + esc(title) + '">' + esc(caption) + '</button>';
  }
  const guide = () => window.DegreeGuide;
  const profile = () => guide().normalizeProfile({ ...defaults, ...state.profile });
  const text = value => typeof value === 'string' ? value : value?.text || value?.description || value?.title || '';
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ({ compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', audit: '<path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h3"/>', arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>', book: '<path d="M3 5c4-2 6-2 9 0 3-2 5-2 9 0v15c-4-2-6-2-9 0-3-2-5-2-9 0zM12 5v15"/>', check: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', wallet: '<path d="M4 6h15v14H4V6Zm0 0 12-3v3m-1 5h6v5h-6z"/>', school: '<path d="m2 9 10-6 10 6M4 10v10h16V10M9 20v-6h6v6M2 20h20"/>', plus: '<path d="M12 5v14M5 12h14"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>' }[name] || '<circle cx="12" cy="12" r="8"/>') + '</svg>';

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); localSaving = true; }
    catch { localSaving = false; }
    if ($('save-status')) $('save-status').textContent = localSaving ? 'Saved on this device' : 'Download your plan to keep a copy';
  }
  function restore() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY));
      if (stored?.version === 3 && Array.isArray(stored.learning) && stored.profile) {
        state = { ...state, ...stored, profile: { ...defaults, ...stored.profile }, scenarios: stored.scenarios || {} };
      } else {
        const legacy = JSON.parse(localStorage.getItem('degreepath-pathway-v2'));
        if (legacy) {
          const migrated = guide().migrateLegacy(legacy);
          state.profile = { ...defaults, ...migrated.profile };
          state.learning = migrated.learning || [];
          state.legacyImported = true;
          state.legacyBackup = migrated.legacyBackup || legacy;
        }
      }
    } catch { /* Keep an accessible fresh draft without deleting older data. */ }
    const requestedEntry = new URLSearchParams(location.search).get('entry');
    if (['explore', 'target', 'audit'].includes(requestedEntry)) {
      state.profile.entry = requestedEntry; state.view = 'wizard'; state.step = requestedEntry === 'explore' ? 'goal' : 'direction';
    }
  }
  function steps() {
    const result = guide().steps(profile());
    return result.map(step => typeof step === 'string' ? step : step.id);
  }
  function stepHeading(title, description, eyebrow = 'YOUR DEGREE, YOUR WAY') {
    return '<p class="step-eyebrow">' + esc(eyebrow) + '</p><h2 class="step-title">' + esc(title) + '</h2><p class="step-description">' + esc(description) + '</p>';
  }
  function choice(field, value, title, description, image = '') {
    const selected = state.profile[field] === value;
    return '<button type="button" class="choice-card' + (selected ? ' selected' : '') + '" data-set="' + esc(field) + '" data-value="' + esc(value) + '" aria-pressed="' + selected + '">' + (image ? '<span class="choice-icon">' + icon(image) + '</span>' : '') + '<span class="choice-copy"><strong>' + esc(title) + '</strong><span>' + esc(description) + '</span></span><span class="choice-check">' + (selected ? icon('check') : '') + '</span></button>';
  }
  function options(values, selected) {
    return values.map(item => { const value = typeof item === 'string' ? item : item[0], title = typeof item === 'string' ? label(item) : item[1]; return '<option value="' + esc(value) + '"' + (String(selected) === String(value) ? ' selected' : '') + '>' + esc(title) + '</option>'; }).join('');
  }
  function fieldSelect(field, title, values, hint = '') {
    return '<label class="field"><span class="field-label">' + esc(title) + '</span><select class="select" data-field="' + esc(field) + '">' + options(values, state.profile[field]) + '</select>' + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function fieldInput(field, title, type = 'text', hint = '', attributes = '') {
    return '<label class="field"><span class="field-label">' + esc(title) + '</span><input class="input" type="' + type + '" data-field="' + esc(field) + '" value="' + esc(state.profile[field]) + '" ' + attributes + '>' + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function tip(title, content) {
    return '<aside class="advisor-tip"><span class="tip-icon">' + icon('spark') + '</span><div><strong>' + esc(title) + '</strong><p>' + esc(content) + '</p></div></aside>';
  }

  function renderStart() {
    return stepHeading('Where would you like to begin?', 'Choose the starting point that feels like you. We’ll ask only what helps build your route.') + '<div class="choice-grid">' + choice('entry', 'explore', 'Help me find my best route', 'I’m open to schools and degrees. Show me the possibilities.', 'compass') + choice('entry', 'target', 'I know my school or degree', 'Build around a university, major, or career I have in mind.', 'target') + choice('entry', 'audit', 'Audit my credits or compare a change', 'Show what counts, what remains, and what happens if I change my plan.', 'audit') + '</div>' + (state.legacyImported ? tip('Your earlier work is here', 'We preserved your previous credit entries. Review them in Your experience before building the new plan.') : '') + '<p class="field-hint privacy-note">No account required. Your draft stays in this browser, and you can download a copy.</p>';
  }
  function renderGoal() {
    const goals = [
      ['any-degree', 'Open more doors', 'I need an accredited degree for work or a personal milestone.'],
      ['career-growth', 'Move forward in my career', 'Build on what I know for a promotion or my next role.'],
      ['change-career', 'Make a career change', 'Find a degree that supports a new direction.'],
      ['teacher', 'Become a teacher', 'Include classroom preferences and teacher-licensure requirements.'],
      ['lawyer', 'Pursue a legal career', 'Plan the degree stage and the law-school path separately.'],
      ['pilot', 'Pursue a flying career', 'Keep academic credit and flight qualifications in view.'],
      ['health-professional', 'Enter a health profession', 'Respect prerequisites, placements, and professional approval.']
    ];
    const career = (catalog.careerGoals || []).find(goal => goal.id === state.profile.goal);
    return stepHeading('What do you want this degree to make possible?', 'Your reason matters. The quickest useful route depends on where you want to go.') + '<div class="chip-group goal-choices" role="group" aria-label="Your goal">' + goals.map(([id, title, description]) => '<button type="button" class="chip' + (state.profile.goal === id ? ' selected' : '') + '" data-set="goal" data-value="' + id + '" aria-pressed="' + (state.profile.goal === id) + '"><strong>' + title + '</strong><span>' + description + '</span></button>').join('') + '</div>' + fieldSelect('degreeLevel', 'Which degree stage are you considering?', ['unsure', 'associate', 'bachelor', 'master', 'doctorate']) + fieldInput('goalDetail', 'Anything else you want us to keep in mind?', 'text', 'Optional. Examples: an employer’s degree requirement, graduate school, or a particular job.', 'maxlength="300" placeholder="What would make this a success for you?"') + (career?.licenseSensitive ? tip('Your career has a separate finish line', 'Earning a degree and meeting professional requirements are different steps. Your plan will keep licensing, admissions, or flight training visible.') : tip('You can keep your options open', 'When the degree itself is the goal, flexible majors may make more of your existing learning useful. We’ll include eligible options across schools.'));
  }
  function renderDirection() {
    const p = state.profile, exact = p.entry === 'target' || p.entry === 'audit';
    let html = stepHeading(exact ? 'What should we build around?' : 'What kind of experience fits your life?', exact ? 'Start with your school and degree. We’ll keep their specific rules at the center of your plan.' : 'Stay open to options, or narrow the search. Classroom experience can matter as much as speed.');
    if (exact) {
      const schools = [...new Set(catalog.pathways.filter(pathway => pathway.routeType !== 'career-guide').map(pathway => pathway.school))].sort();
      const knownSchool = schools.includes(p.school), degrees = catalog.pathways.filter(pathway => pathway.school === p.school);
      html += '<div class="form-grid">' + fieldSelect('schoolChoice', 'University or school', [['', 'Choose a school'], ...schools.map(school => [school, school]), ['custom', 'Another school']], '') + (knownSchool ? fieldSelect('pathwayId', 'Degree or pathway', [['', 'Choose a degree'], ...degrees.map(pathway => [pathway.id, pathway.title]), ['custom', 'Another degree at this school']]) : '') + '</div>';
      if (p.schoolChoice === 'custom' || (!knownSchool && p.school)) html += fieldInput('school', 'School name', 'text', '', 'maxlength="120" placeholder="Your university"');
      if (p.pathwayId === 'custom' || p.schoolChoice === 'custom' || (!degrees.length && p.school)) html += fieldInput('degree', 'Exact degree or major', 'text', 'We will preserve your target even when a detailed template is still being researched.', 'maxlength="160" placeholder="Degree and major"');
      html += '<details class="optional-fields"><summary>Add the purpose and degree stage <span>Useful for career-specific requirements</span></summary>' + fieldSelect('goal', 'What is the goal?', ['any-degree', 'career-growth', 'change-career', 'teacher', 'lawyer', 'pilot', 'health-professional']) + fieldSelect('degreeLevel', 'Degree stage', ['unsure', 'associate', 'bachelor', 'master', 'doctorate']) + fieldInput('goalDetail', 'Your motivation or career goal', 'text', '', 'maxlength="300"') + '</details>';
    } else {
      html += fieldSelect('field', 'Do you have a subject in mind?', [['any', 'Show any eligible degree'], 'general', 'business', 'technology', 'education', 'health', 'law', 'aviation']);
    }
    html += '<div class="field"><span class="field-label">Where would you like to learn?</span><div class="choice-grid three">' + choice('modality', 'any', 'I’m flexible', 'Compare formats.', 'compass') + choice('modality', 'online', 'Online', 'Fit study around life.', 'book') + choice('modality', 'campus', 'On campus', 'Keep the campus experience.', 'school') + '</div></div>';
    html += fieldSelect('classroomImportance', 'How important is in-person learning?', ['open', 'preferred', 'essential']);
    if (p.modality === 'campus' || p.classroomImportance !== 'open') html += tip('Transfer credits can support a campus degree', 'Outside courses can reduce campus coursework, but major residency, annual course offerings, and the time you want on campus still shape the finish.');
    else html += tip('The school makes the rules', 'A course can be accepted by one school and count differently at another. We build around the receiving degree, not just the number of credits a provider offers.');
    if (p.school) html += '<div class="community-context"><div><strong>Learn from people exploring this school.</strong><p>Ask a question or compare approaches while the school’s rules are in view.</p></div>' + discussionButton('school:' + schoolKey(p.school), p.school, 'Open school discussion') + '</div>';
    return html;
  }
  function learningList(compact = false) {
    if (!state.learning.length) return '<div class="empty-state"><span>' + icon('book') + '</span><p>No individual records added yet.</p><small>You can still explore. A rough credit estimate is kept separate from matched courses.</small></div>';
    return '<div class="learning-list">' + state.learning.map(item => '<div class="learning-item"><span class="learning-symbol">' + icon('book') + '</span><div><strong>' + esc(item.title || item.code) + '</strong><span>' + esc(item.provider) + ' · ' + esc(item.credits) + ' ' + esc(item.creditSystem || 'semester') + ' credits · ' + (item.status === 'in-progress' ? 'In progress' : item.status === 'planned' ? 'Proposed' : 'Earned; placement to evaluate') + '</span></div><div class="inline-actions"><button type="button" class="button ghost small" data-edit-learning="' + esc(item.id) + '">Edit</button>' + (!compact ? '<button type="button" class="button ghost small" data-remove-learning="' + esc(item.id) + '" aria-label="Remove ' + esc(item.title) + '">Remove</button>' : '') + '</div></div>').join('') + '</div>';
  }
  function renderExperience() {
    return stepHeading('Let’s start with what you already have.', 'College courses, exams, certificates, and military learning can all matter. Add details now or refine the draft later.') + fieldSelect('hasPrior', 'What is your starting point?', [['none', 'I’m starting with no prior credits'], ['some', 'I have some college or alternative credits'], ['degree', 'I already hold a degree'], ['unknown', 'I’m not sure what might count']]) + (state.profile.hasPrior !== 'none' ? fieldInput('priorCreditEstimate', 'Roughly how many college credits do you have?', 'number', 'Optional estimate. It will not be subtracted from a degree until actual learning is matched.', 'min="0" max="400" step="0.5"') : '') + '<div class="section-heading"><div><h3>Your learning inventory</h3><p>One set of records. Reusable across schools.</p></div><button type="button" class="button secondary small" data-action="add-learning">' + icon('plus') + ' Add learning</button></div>' + learningList() + fieldSelect('militaryStatus', 'Do you have a military connection?', ['none', 'active', 'veteran', 'reserve', 'dependent']) + tip(state.profile.militaryStatus === 'none' ? 'Old credits are worth checking' : 'Military learning deserves its own review', state.profile.militaryStatus === 'none' ? 'Keep the original provider, course code, and completion date. Those details help distinguish a useful requirement match from credit that only fills electives.' : 'Your service record and benefit eligibility are different inputs. We’ll include record-specific next steps and keep benefit amounts unassumed.');
  }
  function renderMilitary() {
    if (state.profile.militaryStatus === 'dependent') return stepHeading('Let’s include the opportunities available to you.', 'Military family benefits and your own academic learning are separate parts of the plan.') + fieldInput('state', 'State where you live or plan to use benefits', 'text', 'Optional. School, state, and individual eligibility can change the funding options.', 'maxlength="80"') + tip('Benefits belong to an individual eligibility decision', 'Check transferred VA benefits, survivor or dependent assistance, and school or state programs. A family connection does not establish an award or amount.') + '<div class="notice"><strong>Your learning inventory should contain your own records.</strong><p>A sponsor’s training, JST, occupational code, or military academic status does not become your degree credit. Add courses, exams, and credentials you personally earned.</p></div>';
    const branch = state.profile.militaryBranch;
    return stepHeading('Let’s include your military opportunities.', 'We’ll adapt the record checklist to your service and flag the benefits worth checking.') + '<div class="form-grid">' + fieldSelect('militaryBranch', 'Service branch', [['', 'Choose a branch'], ['army', 'Army'], ['navy', 'Navy'], ['marines', 'Marine Corps'], ['coast-guard', 'Coast Guard'], ['air-force', 'Air Force'], ['space-force', 'Space Force'], ['other', 'Other / prefer not to say']]) + fieldSelect('militaryRecords', 'What learning record do you have?', [['not-sure', 'Help me identify it'], ['jst', 'Joint Services Transcript (JST)'], ['ccaf', 'CCAF / Air University record'], ['other', 'Another military or college record']]) + '</div>' + fieldInput('militaryOccupation', 'Occupation or specialty code', 'text', 'Optional context. A code alone will not be awarded degree credit.', 'maxlength="50" placeholder="MOS, rating, AFSC, or equivalent"') + fieldInput('state', 'State where you live or plan to use benefits', 'text', 'Optional. State, school, and benefit eligibility can change the best funding choice.', 'maxlength="80"') + tip(branch === 'air-force' || branch === 'space-force' ? 'Check your Air University and college records' : 'Start with the official record', branch === 'air-force' || branch === 'space-force' ? 'A CCAF or other Air University transcript can reveal completed academic work. Your school still decides which awards apply to this degree.' : 'For eligible services, a JST can document training and occupational learning. The receiving university determines how that learning fits the degree.') + '<div class="notice"><strong>Check benefits before activating paid study.</strong><p>DANTES testing, tuition assistance, employer support, and VA education benefits have separate eligibility rules. We’ll link the official tools; this draft assumes no automatic award or reimbursement.</p></div>';
  }
  function renderPreferences() {
    const p = state.profile;
    return stepHeading('What would make this route work for you?', 'Choose the main priority. We’ll keep the alternatives visible so you can understand the tradeoffs.') + '<div class="choice-grid two">' + choice('priority', 'balanced', 'Find a good balance', 'Keep cost, time, and fit in view.', 'compass') + choice('priority', 'speed', 'Finish sooner', 'Reduce the remaining work and scheduling obstacles.', 'clock') + choice('priority', 'cost', 'Spend less', 'Compare future expenses, subscriptions, and university work.', 'wallet') + choice('priority', 'transfer', 'Maximize useful transfer', 'Use outside learning that reduces actual requirements.', 'book') + '</div><div class="form-grid">' + fieldInput('weeklyHours', 'Hours you can study each week', 'number', 'Used to frame your workload. It is not a completion guarantee.', 'min="1" max="80" step="1"') + fieldInput('budget', 'Remaining budget, if you have one', 'number', 'Optional total, before any unconfirmed benefits.', 'min="0" max="1000000" step="50" placeholder="Leave open"') + fieldInput('deadline', 'Preferred finish date', 'date', 'Optional goal. Course availability and graduation dates still need confirmation.') + fieldSelect('assessmentPreference', 'How do you prefer to demonstrate learning?', ['mixed', 'exams', 'writing', 'projects']) + '</div>' + fieldSelect('proctoringPreference', 'Are proctored exams comfortable for you?', [['open', 'Yes, or I’m open to them'], ['avoid', 'I would prefer to avoid them']]) + '<details class="optional-fields"><summary>Location and professional requirements <span>Especially useful for licensed careers</span></summary><div class="form-grid">' + fieldSelect('country', 'Where will you use the degree?', [['US', 'United States'], ['CA', 'Canada'], ['other', 'Another country']]) + fieldInput('state', 'State, province, or licensing jurisdiction', 'text', 'Admission and professional requirements are specific to the receiving organization.', 'maxlength="80"') + '</div></details>' + tip(p.priority === 'cost' ? 'The cheapest course is not always the cheapest degree' : p.priority === 'speed' ? 'Speed is about the whole calendar' : 'Transfer should move you toward graduation', p.priority === 'cost' ? 'A flat-rate university term, an existing certification, or employer funding can change the best route. We keep unquoted tuition separate from known provider expenses.' : p.priority === 'speed' ? 'Prerequisites, grading, exam limits, transcript processing, and campus term offerings can matter more than a school’s headline transfer percentage.' : 'A course only helps when it satisfies a real remaining requirement. Extra or duplicate credits are kept separate from useful progress.');
  }
  function summaryRows() {
    const p = state.profile;
    const rows = [
      ['Your purpose', label(p.goal) + (p.goalDetail ? ' · ' + p.goalDetail : ''), p.entry === 'explore' ? 'goal' : 'direction'],
      ['Degree stage', label(p.degreeLevel), p.entry === 'explore' ? 'goal' : 'direction'],
      ['School and degree', p.school ? p.school + (p.degree ? ' · ' + p.degree : '') : p.field === 'any' ? 'Open to any eligible school and degree' : label(p.field), 'direction'],
      ['Learning experience', label(p.modality) + ' · ' + label(p.classroomImportance), 'direction'],
      ['Starting point', state.learning.length + ' learning record' + (state.learning.length === 1 ? '' : 's') + (number(p.priorCreditEstimate) ? ' · about ' + number(p.priorCreditEstimate) + ' reported credits to evaluate' : ''), 'experience'],
      ['Military connection', label(p.militaryStatus), p.militaryStatus === 'none' ? 'experience' : 'military'],
      ['What matters most', label(p.priority) + ' · ' + p.weeklyHours + ' study hours / week', 'preferences']
    ];
    if (p.budget !== '' && p.budget != null || p.deadline) rows.push(['Budget and target', (p.budget !== '' && p.budget != null ? money(number(p.budget)) + ' remaining budget' : 'Budget open') + (p.deadline ? ' · target ' + dateLabel(p.deadline) : ''), 'preferences']);
    return rows;
  }
  function renderReview() {
    return stepHeading('Here’s what your plan will be built around.', 'You can change any answer. We’ll show the route, its alternatives, and the specific questions still needing confirmation.') + '<div class="summary-list">' + summaryRows().map(([title, value, step]) => '<div class="summary-item"><div><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong></div><button class="button ghost small" type="button" data-goto="' + step + '">Edit</button></div>').join('') + '</div>' + tip('A useful draft, even while records are pending', 'Matched learning, proposed courses, and unresolved items stay distinct. You’ll see what to do next without treating a proposed transfer as an official award.');
  }
  function renderJourney() {
    const p = state.profile, answered = summaryRows().filter((_, index) => index !== 5 || p.militaryStatus !== 'none');
    $('journey-panel').innerHTML = '<p class="step-eyebrow">YOUR ROUTE SO FAR</p><h3>A plan that follows<br>your priorities.</h3><div class="journey-line">' + answered.slice(0, 5).map(([title, value]) => '<div class="journey-stop"><span></span><div><small>' + esc(title) + '</small><strong>' + esc(value) + '</strong></div></div>').join('') + '</div><div class="journey-note">' + icon('shield') + '<p>Specific school rules.<br>Your learning and preferences.<br>A clear next step.</p></div>';
  }
  function renderWizard(focus = false) {
    state.view = 'wizard'; $('wizard-view').hidden = false; $('results-view').hidden = true;
    const flow = steps(); if (!flow.includes(state.step)) state.step = flow[0] || 'start';
    const index = flow.indexOf(state.step), titles = { start: 'Start', goal: 'Your goal', direction: 'Your direction', experience: 'Your experience', military: 'Military', preferences: 'Your priorities', review: 'Review' };
    $('wizard-progress').innerHTML = '<div class="progress-label"><span>Step ' + (index + 1) + ' of ' + flow.length + '</span><span>' + titles[state.step] + '</span></div><div class="wizard-track" role="progressbar" aria-label="Degree builder progress" aria-valuenow="' + (index + 1) + '" aria-valuemin="1" aria-valuemax="' + flow.length + '"><span style="width:' + ((index + 1) / flow.length * 100) + '%"></span></div>';
    const screens = { start: renderStart, goal: renderGoal, direction: renderDirection, experience: renderExperience, military: renderMilitary, preferences: renderPreferences, review: renderReview };
    $('step-panel').innerHTML = (state.templateOrigin ? '<div class="notice"><strong>' + (state.templateOrigin.error ? 'This community plan needs another step' : 'Starting from ' + esc(state.templateOrigin.title)) + '</strong><p>' + (state.templateOrigin.error ? esc(state.templateOrigin.error) : 'These are proposed curriculum choices. Your own learning inventory is unchanged, and school approval remains separate.' + (state.templateOrigin.unmatchedChoices ? ' ' + state.templateOrigin.unmatchedChoices + ' shared choices could not be matched to a reviewed option and were not imported.' : '')) + '</p></div>' : '') + screens[state.step]() + '<p id="step-error" class="form-error" role="alert"></p>';
    $('back-step').disabled = index === 0;
    $('next-step').innerHTML = (state.step === 'review' ? 'Build my degree plan' : 'Continue') + icon('arrow');
    renderJourney(); save();
    if (focus) { $('step-panel').focus({ preventScroll: true }); $('wizard-view').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function validateStep() {
    const p = state.profile;
    if (state.step === 'start' && !['explore', 'target', 'audit'].includes(p.entry)) return 'Choose where you would like to begin.';
    if (state.step === 'direction') {
      if (p.entry !== 'explore' && (!p.school.trim() || !p.degree.trim())) return 'Choose a school and degree, or enter the target you want to explore.';
      if (p.modality === 'online' && p.classroomImportance === 'essential') return 'You selected online only and essential in-person learning. Choose the preference you want this search to follow.';
    }
    if (state.step === 'preferences' && (!Number.isFinite(Number(p.weeklyHours)) || number(p.weeklyHours) < 1 || number(p.weeklyHours) > 80)) return 'Enter between 1 and 80 study hours per week.';
    if (state.step === 'experience' && (number(p.priorCreditEstimate) < 0 || number(p.priorCreditEstimate) > 400)) return 'Keep the rough credit estimate between 0 and 400. You can record additional learning individually.';
    return '';
  }
  function nextStep() {
    const error = validateStep(); if (error) { $('step-error').textContent = error; $('step-error').scrollIntoView({ block: 'nearest' }); return; }
    if (state.step === 'review') { buildResults(); return; }
    const flow = steps(), index = flow.indexOf(state.step); state.step = flow[index + 1] || 'review'; renderWizard(true);
  }
  function backStep() { const flow = steps(); state.step = flow[Math.max(0, flow.indexOf(state.step) - 1)]; renderWizard(true); }

  function scenarioFor(pathway) {
    const key = pathway?.modelId || pathway?.id || 'custom';
    if (!state.scenarios[key]) state.scenarios[key] = { providers: ['Sophia', 'Study.com', 'CLEP'], allowConditional: true, useWaivers: false, universityRate: '', fees: '', sophiaMonths: 1, studyMonths: 1, sophiaWeeks: '', studyWeeks: '', clepWeeks: '', termWeeks: '', termCredits: '', concurrency: 1, optionSelections: {} };
    return state.scenarios[key];
  }
  function modelFor(pathway) {
    const raw = models.find(model => model.id === pathway?.modelId); if (!raw) return null;
    const variant = raw.transferWaiverVariant;
    if (scenarioFor(pathway).useWaivers && variant) return { ...raw, requirements: variant.requirements, rulesNotes: [...raw.rulesNotes, ...variant.rulesNotes], unresolved: variant.unresolved, appliedTransferWaiver: { minimumQualifyingTransferCredits: variant.minimumQualifyingTransferCredits, condition: variant.condition } };
    return raw;
  }
  function planningInput(pathway, model) {
    const s = scenarioFor(pathway), match = guide().matchInventory(model, state.learning);
    const providers = s.providers.filter(provider => !(state.profile.proctoringPreference === 'avoid' && provider === 'CLEP'));
    return { completed: match.completed, providers, priority: state.profile.priority === 'balanced' ? 'balanced' : state.profile.priority, allowConditional: s.allowConditional, universityRate: Math.max(0, number(s.universityRate)), fees: Math.max(0, number(s.fees)), providerMonths: { Sophia: Math.max(1, number(s.sophiaMonths)), 'Study.com': Math.max(1, number(s.studyMonths)) }, optionSelections: s.optionSelections || {}, weeklyHours: number(state.profile.weeklyHours), timing: { externalWeeks: { Sophia: number(s.sophiaWeeks) || null, 'Study.com': number(s.studyWeeks) || null, CLEP: number(s.clepWeeks) || null }, externalConcurrency: number(s.concurrency), universityTermWeeks: number(s.termWeeks) || null, universityCreditsPerTerm: number(s.termCredits) || null } };
  }
  function customPathway() {
    const p = state.profile;
    return { id: 'custom-target', school: p.school || 'Your chosen school', title: p.degree || 'Your career pathway', level: p.degreeLevel, field: p.field, modalities: [p.modality], coverage: 'school-profile', summary: 'Your exact target is saved. A course-level template is not yet available for this combination; the guide keeps the required research and decisions visible.', modelId: null, constraints: ['Obtain the exact degree requirements and current transfer policies before relying on course placements.'], sources: [], mechanisms: ['Evaluate existing learning', 'Identify accepted outside credit', 'Reserve required university work'], proposedActions: ['Find the official degree requirements and catalog year for this exact program.', 'Request the school’s evaluation of your prior learning and source-specific transfer limits.', 'Build the remaining course map from the confirmed requirements before purchasing outside courses.'] };
  }
  function buildResults(scroll = true) {
    try {
      save();
      candidates = guide().recommend(profile(), catalog, models, state.learning).filter(candidate => candidate.eligible !== false);
      const knownTarget = catalog.pathways.some(pathway => pathway.id === state.profile.pathwayId || pathway.school === state.profile.school && pathway.title === state.profile.degree);
      if (state.profile.school && state.profile.degree && !candidates.length && !knownTarget) candidates = [{ pathway: customPathway(), score: 0, reasons: ['Keeps your exact university and degree as the target.'] }];
      if (!candidates.length) {
        state.view = 'results'; $('wizard-view').hidden = true; $('results-view').hidden = false;
        $('result-header').innerHTML = '<p class="step-eyebrow">YOUR PRIORITIES ARE SAVED</p><h2 class="result-heading">Let’s keep your goal intact.</h2><p>Our current research does not include a route matching all of these choices. We have not substituted an unrelated degree.</p>';
        $('recommendation-grid').innerHTML = '';
        const career = (catalog.careerGoals || []).find(item => item.id === state.profile.goal);
        $('result-details').innerHTML = '<div class="details-section"><h3>Useful next steps</h3><ol class="action-list">' + (career?.advice?.length ? career.advice : ['Check your intended school’s exact program and transfer requirements.', 'Keep your credit inventory together while we expand the available templates.', 'Change a preference if you want to explore a wider set of routes.']).map(item => '<li class="action-item">' + esc(text(item)) + '</li>').join('') + '</ol><button class="button" data-action="edit-profile">Adjust my choices ' + icon('arrow') + '</button></div>';
        $('result-actions').innerHTML = '<button class="button secondary" data-action="download-profile">Download my profile and learning</button>';
        save(); if (scroll) $('results-view').scrollIntoView({ behavior: 'smooth' }); return;
      }
      current = candidates.find(candidate => candidate.pathway.id === state.selectedPathwayId) || candidates[0];
      state.selectedPathwayId = current.pathway.id;
      currentProgram = modelFor(current.pathway);
      inventoryMatch = currentProgram ? guide().matchInventory(currentProgram, state.learning) : { completed: [], unmatched: [...state.learning] };
      currentPlan = currentProgram ? DegreePlanner.generate(currentProgram, planningInput(current.pathway, currentProgram)) : null;
      guidance = guide().buildGuidance(profile(), current.pathway, state.learning, catalog);
      state.view = 'results'; $('wizard-view').hidden = true; $('results-view').hidden = false;
      if (!state.baseline) state.baseline = baselineSnapshot();
      renderResults(); save();
      if (pendingShare) { pendingShare = false; setTimeout(shareCurrentPlan, 0); }
      if (scroll) $('results-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('DegreeSteps could not assemble this draft.', error);
      const target = $('step-error') || $('error-state');
      target.hidden = false; target.textContent = 'We could not build this draft. Your inputs are still saved. Try adjusting a choice or reopening the builder.';
    }
  }
  function coverageName(pathway) { return pathway.modelId ? 'Course-level draft' : pathway.routeType === 'career-guide' ? 'Career pathway guide' : pathway.coverage === 'researched-template' ? 'Researched pathway guide' : 'School / career guide'; }
  function dateLabel(value) { if (!value) return 'Not independently checked'; const date = new Date(value + 'T12:00:00'); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function baselineSnapshot() { return { profile: clone(state.profile), selectedPathwayId: state.selectedPathwayId, scenarios: clone(state.scenarios), externalCredits: currentPlan?.coverage.mappedExternalCredits ?? null, confirmedCredits: currentPlan?.totals.confirmed ?? null, modeledSubtotal: currentPlan?.costs.modeledSubtotal ?? null, scenarioWeeks: currentPlan?.timing.scenarioWeeks ?? null, school: current?.pathway.school || '', title: current?.pathway.title || '', savedAt: new Date().toISOString() }; }
  function renderResults() {
    const pathway = current.pathway, p = state.profile;
    $('result-header').innerHTML = '<div><p class="step-eyebrow">YOUR NEXT CHAPTER, MAPPED</p><h2 class="result-heading">' + esc(p.goal === 'any-degree' ? 'A route that opens doors.' : 'Your goal. A clearer route.') + '</h2><p>' + esc(p.goalDetail || label(p.goal)) + ' <span class="header-dot">·</span> ' + esc(label(p.modality)) + ' <span class="header-dot">·</span> ' + esc(label(p.priority)) + '</p></div><button type="button" class="button secondary" data-action="edit-profile">Edit my answers</button>';
    const shown = [current, ...candidates.filter(candidate => candidate.pathway.id !== pathway.id)].slice(0, 3);
    $('recommendation-grid').className = (shown.length === 1 ? 'single-route' : shown.length === 2 ? 'two-routes' : '') + (state.alternativesOpen ? ' show-alternatives' : '');
    $('recommendation-grid').innerHTML = shown.map((candidate, index) => {
      const route = candidate.pathway, selected = route.id === pathway.id, fact = route.creditFacts || {};
      const reasons = candidate.reasons || [];
      return '<article class="route-card' + (selected ? ' recommended selected' : ' alternative-route') + '"><div class="route-card-top"><span class="badge ' + (selected ? 'green' : 'muted') + '">' + (selected ? 'Your selected route' : 'Alternative ' + index) + '</span><span class="route-format">' + esc((route.modalities || []).map(label).join(' / ')) + '</span></div><p class="route-school">' + esc(route.school) + '</p><h3>' + esc(route.title) + '</h3><p>' + esc(reasons[0] || route.summary) + '</p><div class="route-meta"><span>' + esc(coverageName(route)) + '</span>' + (fact.maxTransferCredits != null ? '<span>Up to ' + esc(fact.maxTransferCredits) + ' transfer credits¹</span>' : '') + '</div><button type="button" class="button ' + (selected ? '' : 'secondary') + '" data-route="' + esc(route.id) + '" aria-pressed="' + selected + '">' + (selected ? 'Viewing this route' : 'Explore this route') + (selected ? icon('check') : icon('arrow')) + '</button></article>' + (index === 0 && shown.length > 1 ? '<button type="button" id="toggle-alternatives" class="button secondary mobile-alternatives" data-action="toggle-alternatives" aria-expanded="' + Boolean(state.alternativesOpen) + '">' + (state.alternativesOpen ? 'Hide alternatives' : 'Compare ' + (shown.length - 1) + ' alternative routes') + icon('arrow') + '</button>' : '');
    }).join('');
    if (shown.length < 3) $('recommendation-grid').innerHTML += '<div class="comparison-note"><strong>' + (p.entry === 'explore' ? 'These are the matching routes in our current research.' : 'Your exact target is being respected.') + '</strong><p>' + (p.entry === 'explore' ? 'We show eligible matches without filling the list with unrelated degrees.' : 'Use What if to compare priorities, course sources, or a different school. Your learning inventory stays intact.') + '</p></div>';
    $('result-details').innerHTML = '<div class="result-workspace"><div class="tabs" role="tablist" aria-label="Your plan views">' + [['plan', 'Your playbook'], ['audit', 'Degree audit'], ['what-if', 'What if'], ['sources', 'Sources & checks']].map(([id, title]) => '<button type="button" class="tab' + (state.resultTab === id ? ' active' : '') + '" role="tab" aria-selected="' + (state.resultTab === id) + '" id="tab-' + id + '" aria-controls="result-panel" data-tab="' + id + '">' + title + '</button>').join('') + '</div><div id="result-panel" role="tabpanel" aria-labelledby="tab-' + esc(state.resultTab) + '">' + ({ plan: renderPlaybook, audit: renderAudit, 'what-if': renderWhatIf, sources: renderSources }[state.resultTab] || renderPlaybook)() + '</div></div>';
    $('result-actions').innerHTML = '<p>¹ A transfer ceiling is a policy limit. Your degree must have suitable matches, required university work, and an individual evaluation.</p><div class="inline-actions">' + (currentPlan ? '<button type="button" class="button" data-action="share-plan">Share this plan</button>' : '<a class="button secondary" href="community.html?tab=feed">Discuss this route</a>') + '<button type="button" class="button secondary" data-action="download-plan">Download my plan</button><button type="button" class="button ghost" data-action="print-plan">Print / save PDF</button><button type="button" class="button ghost" data-action="download-profile">Export profile & learning</button></div>';
    attachCommunity();
  }
  function nextActions() {
    const actions = [];
    const conflict = currentPlan && (!currentPlan.validation.academicCountsValid || currentPlan.setupIssues?.some(item => ['invalid_selection', 'selection_conflict'].includes(item.code)));
    if (conflict) actions.push({ title: 'Resolve the conflicts in this scenario', detail: 'The selected courses do not currently satisfy all degree rules. Review the flagged items in Degree audit or reset your course choices before starting this block.' });
    if (['active', 'veteran', 'reserve'].includes(state.profile.militaryStatus)) actions.push({ title: 'Gather your service learning record', detail: state.profile.militaryBranch === 'air-force' || state.profile.militaryBranch === 'space-force' || state.profile.militaryRecords === 'ccaf' ? 'Request your relevant CCAF / Air University and college records for the receiving school.' : 'Identify the appropriate JST or other official service record and request the school’s evaluation.' });
    else if (state.profile.militaryStatus === 'dependent') actions.push({ title: 'Check your own education-benefit eligibility', detail: 'Confirm transferred or dependent benefits and school/program approval. Academic credit should come from learning you personally earned.' });
    if (number(state.profile.priorCreditEstimate) || inventoryMatch?.unmatched?.length || currentPlan?.totals.reported) actions.push({ title: 'Get your existing learning evaluated', detail: 'Send the original records to ' + current.pathway.school + '. Your rough estimate and unmatched learning have not been counted as approved degree credit.' });
    if (currentPlan) {
      const conditional = currentPlan.rows.filter(row => row.status === 'planned' && row.option?.evidence === 'conditional' && row.option.provider !== 'University');
      if (conditional.length) actions.push({ title: 'Resolve the key transfer questions', detail: 'This draft includes ' + conditional.length + ' conditional course placements. Use Sources & checks to send the school one focused review packet before buying those options.' });
      const first = (currentPlan.sequence || []).find(action => action.provider !== 'University');
      if (first && !conflict) actions.push({ title: 'Begin your ' + first.provider + ' course block', detail: first.title + '. ' + (conditional.length ? 'After the relevant conditions are confirmed, follow the course group below.' : 'Confirm its applicability to your individual degree before purchase.') });
    }
    const proposed = guidance?.nextActions || current.pathway.proposedActions || [];
    for (const item of proposed) actions.push(typeof item === 'string' ? { title: item, detail: '' } : { title: item.title || item.label || text(item), detail: item.detail || item.description || '' });
    const seen = new Set();
    return actions.filter(item => { if (!item.title || seen.has(item.title)) return false; seen.add(item.title); return true; }).slice(0, 3);
  }
  function residencyDisplay() {
    const c=currentPlan?.coverage||{};
    if(Number.isFinite(c.publishedInstitutionMinimum))return{value:c.publishedInstitutionMinimum,label:'published university-credit minimum¹',description:'The published minimum is '+c.publishedInstitutionMinimum+' university credits.'};
    if(Number.isFinite(c.derivedInstitutionMinimum))return{value:c.derivedInstitutionMinimum,label:'university CU minimum, including capstone¹',description:'The published residency rule requires '+c.derivedInstitutionMinimum+' university competency units, including the additional capstone.'};
    if(Number.isFinite(c.conservativeInstitutionMinimum))return{value:c.conservativeInstitutionMinimum,label:'conservative university-CU calculation¹',description:'This proposed route keeps at least '+c.conservativeInstitutionMinimum+' university competency units under a conservative capstone calculation.'};
    return{value:'Under review',label:'university-credit requirement¹',description:'The university-credit rule is still being researched.'};
  }
  function renderMetrics() {
    if (!currentPlan) {
      const fact = current.pathway.creditFacts || {};
      return '<div class="notice"><strong>' + esc(coverageName(current.pathway)) + '</strong><p>This route includes a researched structure and next steps. Its individual course map is still incomplete; no personalized applicable-credit total, full price, or finish date has been calculated.</p></div>' + (fact.institutionalMinCredits != null ? '<div class="metric-grid"><div class="metric"><strong>' + esc(fact.institutionalMinCredits) + '</strong><span>published institutional minimum¹</span></div><div class="metric"><strong>' + esc(state.learning.length) + '</strong><span>learning records ready for review</span></div></div>' : '');
    }
    const plan = currentPlan, c = plan.coverage, residency = residencyDisplay();
    const quote = plan.costs.universityTuition === null ? 'Tuition needed' : money(plan.costs.modeledSubtotal);
    const hasBudget = state.profile.budget !== '' && state.profile.budget != null;
    const budgetNote = hasBudget ? '<p class="metric-note"><strong>Your budget target: ' + money(number(state.profile.budget)) + '.</strong> ' + (plan.costs.modeledSubtotal > number(state.profile.budget) ? 'The modeled partial expenses already exceed this target; funding or a different route is needed.' : 'A complete school quote and the missing charges are still needed to determine whether this route fits.') + '</p>' : '';
    const deadlineNote = state.profile.deadline ? '<p class="metric-note"><strong>Your target date: ' + dateLabel(state.profile.deadline) + '.</strong> Course availability, record processing, and conferral still need a calendar check.</p>' : '';
    return '<div class="metric-grid"><div class="metric"><strong>' + c.mappedExternalCredits + '<small> / ' + currentProgram.totalCredits + '</small></strong><span>proposed outside-credit placements</span></div><div class="metric"><strong>' + plan.totals.confirmed + '</strong><span>school-confirmed credits, as reported by you</span></div><div class="metric"><strong>' + residency.value + '</strong><span>' + residency.label + '</span></div><div class="metric"><strong class="metric-text">' + quote + '</strong><span>' + (plan.costs.universityTuition === null ? money(plan.costs.modeledSubtotal) + ' modeled provider/entered expenses' : 'modeled subtotal; missing costs still listed') + '</span></div></div>' + (c.conditionalExternalCredits ? '<p class="metric-note"><span class="badge amber">Proposed, with conditions</span> ' + c.conditionalExternalCredits + ' of the outside credits use conditional mappings. They are included to show the possible route and are not an approved transfer award.</p>' : '<p class="metric-note">Published mappings support this draft; individual degree applicability still needs evaluation.</p>') + (currentPlan.timing.scenarioWeeks !== null ? '<p class="metric-note">Your timing assumptions produce about ' + Math.round(currentPlan.timing.scenarioWeeks * 10) / 10 + ' weeks of modeled coursework. Grading, admission, course availability, and conferral delays are not included.</p>' : '<p class="metric-note">A finish date needs course-level pace and a school schedule. Your ' + esc(state.profile.weeklyHours) + ' weekly study hours are saved; we have not converted them into an unsupported graduation promise.</p>') + budgetNote + deadlineNote;
  }
  function renderPlaybook() {
    const pathway = current.pathway;
    let html = '<section class="details-section"><div class="section-heading"><div><p class="step-eyebrow">THE ROUTE IN FRONT OF YOU</p><h3>' + esc(pathway.school) + '</h3><p>' + esc(pathway.summary) + '</p></div><span class="badge muted">' + esc(coverageName(pathway)) + '</span></div>' + renderMetrics() + renderAcademicIssues() + '</section>';
    html += '<section class="details-section next-actions-section"><p class="step-eyebrow">KEEP IT SIMPLE</p><h3>Your next three actions</h3><ol class="action-list">' + nextActions().map((action, index) => '<li class="action-item"><span class="action-number">0' + (index + 1) + '</span><div><strong>' + esc(action.title) + '</strong><p>' + esc(action.detail) + '</p></div></li>').join('') + '</ol></section>';
    const notes = [...(guidance?.careerNotes || []), ...(guidance?.militaryNotes || [])].map(text).filter(Boolean);
    if (notes.length) html += '<section class="details-section"><h3>Keep your real goal in view</h3><ul class="plain-list">' + notes.slice(0, 5).map(note => '<li>' + esc(note) + '</li>').join('') + '</ul></section>';
    if (currentPlan) html += renderCourseGroups();
    else html += renderMilestones();
    const tips = (guidance?.tips || []).map(item => ({ title: typeof item === 'string' ? 'A useful way to save' : item.title || 'A useful way to save', text: text(item) }));
    if (tips.length) html += '<section class="details-section"><h3>Small decisions. Better options.</h3>' + tips.slice(0, 3).map(item => tip(item.title, item.text)).join('') + '</section>';
    html += '<section class="details-section"><div class="section-heading"><div><p class="step-eyebrow">BETTER PLANS, TOGETHER</p><h3>What are others finding?</h3><p>Discuss this exact program. Community experience supplements the school’s official rules.</p></div><a class="button secondary small" href="community.html?tab=templates">Explore starter templates</a></div><div id="route-community"></div></section>';
    return html;
  }
  function renderCourseGroups() {
    const plan = currentPlan, grouped = new Map();
    for (const row of plan.rows.filter(row => row.status === 'planned' && row.option && row.option.provider !== 'University')) {
      const key = row.option.provider;
      if (!grouped.has(key)) grouped.set(key, new Map());
      const actionKey = row.option.bundleId || row.option.code || row.option.id;
      if (!grouped.get(key).has(actionKey)) grouped.get(key).set(actionKey, []);
      grouped.get(key).get(actionKey).push(row);
    }
    let html = '<section class="details-section"><p class="step-eyebrow">THE OUTSIDE-COURSE PLAYBOOK</p><h3>Build the credit that moves you forward.</h3><p>Each course below has a specific proposed place in this degree. Bundle components count once, and conditions stay with the course.</p>';
    if (!grouped.size) html += '<div class="empty-state"><p>No outside course matches are enabled in this scenario.</p><small>Try different sources in What if. Missing mappings remain research gaps, rather than proof that university study is required.</small></div>';
    for (const [provider, actions] of grouped) {
      const credits = [...actions.values()].flat().reduce((sum, row) => sum + row.credits, 0);
      html += '<div class="course-group"><div class="course-group-heading"><h4>' + esc(provider) + '</h4><span>' + actions.size + ' learning action' + (actions.size === 1 ? '' : 's') + ' · ' + credits + ' proposed credits</span></div>';
      let index = 0;
      for (const rows of actions.values()) {
        const item = rows[0].option, conditional = item.evidence === 'conditional';
        const requirement = currentProgram.requirements.find(req => req.id === rows[0].requirementId);
        const conditions = [...new Set(rows.flatMap(row => row.conditions || []))];
        html += '<details class="course-row"' + (index++ === 0 ? ' open' : '') + '><summary><div><strong>' + esc(item.title) + '</strong><span>' + esc(item.receivingCode || item.code) + ' · ' + rows.reduce((sum, row) => sum + row.credits, 0) + ' proposed credits</span></div><span class="badge ' + (conditional ? 'amber' : 'green') + '">' + (conditional ? 'Check conditions' : 'Published mapping') + '</span></summary><div class="course-detail"><p><strong>Why it is here:</strong> ' + rows.map(row => { const req = currentProgram.requirements.find(r => r.id === row.requirementId); return esc(req?.categoryLabel || row.title) + ' (' + esc(row.option.receivingCode || row.code) + ')'; }).join('; ') + '.</p>' + (item.allocationType === 'category-substitution' ? '<p>This is an alternative within the requirement category. It does not claim equivalency to the featured university course.</p>' : '') + (conditions.length ? '<ul class="condition-list">' + conditions.map(condition => '<li>' + esc(condition) + '</li>').join('') + '</ul>' : '') + (item.minScore ? '<p>Published minimum score: ' + esc(item.minScore) + '.</p>' : '') + '<div class="inline-actions"><a class="text-link" href="' + url(item.url) + '" target="_blank" rel="noopener">Review this option ' + icon('arrow') + '</a><button type="button" class="button ghost small" data-complete-row="' + esc(rows[0].requirementId) + '">I’ve completed this</button><button type="button" class="button ghost small" data-source-row="' + esc(rows[0].requirementId) + '">Why we recommend it</button>' + discussionButton(courseContext(item), item.provider + ' · ' + item.title, 'Ask about this course') + '</div></div></details>';
      }
      html += '</div>';
    }
    html += '</section><section class="details-section"><p class="step-eyebrow">THE UNIVERSITY FINISH</p><h3>Keep required work separate from open questions.</h3><p>' + residencyDisplay().description + ' This draft assigns ' + plan.coverage.universityAssignedCredits + ' credits to university options, including ' + plan.coverage.researchGapCredits + ' credits with unresolved outside mapping. That assigned total is not a verified university-only workload.</p><details class="finish-details"><summary>See the university block and research gaps</summary><ul class="plain-list">' + plan.rows.filter(row => row.option?.provider === 'University' || !row.option).map(row => '<li><strong>' + esc(row.title) + '</strong> · ' + row.credits + ' credits<br><span>' + esc(placementLabel(row)) + '</span></li>').join('') + '</ul></details></section>';
    if (inventoryMatch.unmatched?.length || number(state.profile.priorCreditEstimate)) html += tip('Your earlier learning is still part of the plan', (inventoryMatch.unmatched?.length || 0) + ' individual record(s) remain unmatched in this degree. ' + (number(state.profile.priorCreditEstimate) ? 'Your rough ' + number(state.profile.priorCreditEstimate) + '-credit estimate remains separate from the applied totals. ' : '') + 'A university evaluation may reduce the remaining plan.');
    return html;
  }
  function renderMilestones() {
    const path = current.pathway;
    const milestones = guidance?.milestones?.length ? guidance.milestones : [
      { title: 'Confirm the exact degree and catalog', detail: 'Use the current school requirements, your career goal, and any protected catalog rights.' },
      { title: 'Evaluate the learning you already have', detail: 'Preserve original sources, completion dates, grades, and any school evaluation.' },
      { title: 'Assemble the outside-credit block', detail: 'Choose accepted courses, exams, and credentials for actual remaining requirements. Resolve source caps and duplicates.' },
      { title: 'Plan the institutional finish', detail: 'Reserve residency, major and upper-level requirements, placements, prerequisites, and available terms.' },
      { title: 'Submit records and complete graduation', detail: 'Reconcile the final evaluation, finish required coursework, and apply for conferral.' }
    ];
    return '<section class="details-section"><p class="step-eyebrow">THE FULL PROPOSED ROUTE</p><h3>Your planning milestones</h3><p>These steps describe the route structure. The course-level allocations still need to be completed for this exact degree.</p><ol class="action-list">' + milestones.map((item, index) => '<li class="action-item"><span class="action-number">0' + (index + 1) + '</span><div><strong>' + esc(typeof item === 'string' ? item : item.title || item.label) + '</strong><p>' + esc(item.detail || item.description || '') + '</p></div></li>').join('') + '</ol>' + (path.finishWork?.length ? '<h4>Institutional work to keep in view</h4><ul class="plain-list">' + path.finishWork.map(item => '<li>' + esc(text(item)) + '</li>').join('') + '</ul>' : '') + (path.constraints?.length ? '<h4>Rules this route must satisfy</h4><ul class="plain-list">' + path.constraints.map(item => '<li>' + esc(text(item)) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  function placementLabel(row) {
    return ({ 'existing-credit': 'School-confirmed placement, as reported by you', 'existing-unconfirmed': 'Existing learning; school evaluation pending', 'mapped-external': 'Published outside mapping; individual applicability pending', 'conditional-external': 'Proposed outside mapping with conditions', 'required-university': 'Specific university requirement', 'reserved-university': 'Reserved to satisfy university or major minimums', 'research-gap': 'Outside alternatives still being researched', 'conditional-gap': 'Conditional outside options disabled', 'excluded-source': 'Outside source excluded by your settings' })[row.placementReason] || 'Placement needs review';
  }
  function renderAudit() {
    if (!currentPlan) return '<section class="details-section"><h3>A course-level audit is not yet available for this target.</h3><p>Your selected school, degree, goal, and learning records are preserved. The researched route remains available in Your playbook; a completed audit requires the exact requirement and equivalency map.</p>' + learningList(true) + '<button class="button secondary" data-action="add-learning">Add a learning record</button></section>';
    const plan = currentPlan;
    return '<section class="details-section"><div class="section-heading"><div><h3>Your full proposed degree audit</h3><p>' + esc(currentProgram.school + ' · ' + currentProgram.catalog) + ' · ' + currentProgram.totalCredits + ' ' + esc(currentProgram.creditSystem || 'semester') + ' credits</p></div><button class="button secondary small" data-action="add-learning">Add learning</button></div>' + (plan.validation.academicCountsValid ? '<p class="audit-status"><span class="badge green">Credit-count checks passed</span> Conditions and individual awards still require resolution.</p>' : '<div class="notice amber"><strong>This scenario has academic conflicts.</strong><p>Your selections have been preserved. Review the errors below before relying on the totals.</p></div>') + '<div class="audit-scroll"><table class="audit-table"><thead><tr><th>Requirement</th><th>Credits</th><th>Selected learning</th><th>Placement</th></tr></thead><tbody>' + plan.rows.map(row => {
      const req = currentProgram.requirements.find(item => item.id === row.requirementId);
      return '<tr><th scope="row"><strong>' + esc(req?.categoryLabel || row.title) + '</strong><span>' + esc(req?.allocationType === 'category-choice' ? 'Approved category choice' : row.code) + (row.upper ? ' · upper level' : '') + '</span></th><td>' + row.credits + '</td><td><strong>' + esc(row.option?.provider || 'Unresolved') + '</strong><span>' + esc(row.option?.title || 'Course selection needed') + '</span><span>' + esc(row.option?.receivingCode || '') + '</span>' + (row.status === 'planned' ? courseSelect(row, req) : '') + '</td><td><span class="badge ' + (row.placementReason === 'existing-credit' ? 'green' : row.placementReason?.includes('conditional') || row.placementReason?.includes('gap') ? 'amber' : 'muted') + '">' + esc(placementLabel(row)) + '</span></td></tr>';
    }).join('') + '</tbody><tfoot><tr><th>Unique degree hours accounted for</th><td>' + plan.totals.accounted + '</td><td colspan="2">Confirmed: ' + plan.totals.confirmed + ' · Existing, pending evaluation: ' + plan.totals.reported + ' · Proposed: ' + plan.totals.planned + '</td></tr></tfoot></table></div><div class="notice"><strong>Accepted, applicable, and completed are different states.</strong><p>Source ceilings, upper-level credit, major residency, duplicates, and unresolved equivalencies are checked separately. A full 120-credit draft is not a completed or officially approved degree.</p></div>' + renderAcademicIssues() + '</section>';
  }
  function courseSelect(row, req) {
    const settings = scenarioFor(current.pathway);
    const selected = settings.optionSelections?.[row.requirementId] || '';
    const input = planningInput(current.pathway, currentProgram);
    const values = DegreePlanner.availableOptions ? DegreePlanner.availableOptions(currentProgram, row.requirementId, input) : (req?.options || []).filter(option => (option.provider === 'University' || !req.institutionalOnly && input.providers.includes(option.provider)) && (option.evidence !== 'conditional' || input.allowConditional));
    const unavailable = selected && !values.some(option => option.id === selected);
    return '<label class="field compact-field"><span class="screen-reader-only">Change source for ' + esc(row.title) + '</span><select class="select" data-selection="' + esc(row.requirementId) + '"><option value="">Let the planner choose</option>' + (unavailable ? '<option value="' + esc(selected) + '" selected disabled>Saved choice is unavailable — reset or choose another</option>' : '') + values.map(option => '<option value="' + esc(option.id) + '"' + (selected === option.id ? ' selected' : '') + '>' + esc(option.provider + ' · ' + option.title + (option.evidence === 'conditional' ? ' · conditional' : '')) + '</option>').join('') + '</select></label>';
  }
  function renderAcademicIssues() {
    if (!currentPlan) return '';
    const academic = currentPlan.validation.errors.filter(item => !['conditional_mapping', 'reported_credit', 'program_research', 'selection_required'].includes(item.code));
    return academic.length ? '<div class="notice amber"><h4>Resolve these scenario conflicts</h4><ul>' + academic.map(item => '<li>' + esc(item.message) + '</li>').join('') + '</ul></div>' : '';
  }
  function scenarioInput(field, title, attributes = '', hint = '') {
    const s = scenarioFor(current.pathway);
    return '<label class="field"><span class="field-label">' + esc(title) + '</span><input class="input" type="number" data-scenario="' + field + '" value="' + esc(s[field]) + '" ' + attributes + '>' + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function renderWhatIf() {
    const s = scenarioFor(current.pathway), eligibleRoutes = candidates;
    let html = '<section class="details-section"><p class="step-eyebrow">CHANGE A CHOICE. SEE THE EFFECT.</p><h3>What if your route changed?</h3><p>Your learning inventory stays the same. Each school keeps its own rules and price assumptions.</p><div class="form-grid">' + fieldSelect('priority', 'Compare another priority', ['balanced', 'speed', 'cost', 'transfer']) + '<label class="field"><span class="field-label">Compare a matching route</span><select class="select" id="what-if-route">' + options(eligibleRoutes.map(candidate => [candidate.pathway.id, candidate.pathway.school + ' · ' + candidate.pathway.title]), current.pathway.id) + '</select><span class="field-hint">Edit your answers to change a school, major, degree level, or learning format.</span></label></div>';
    const baseline = state.baseline;
    if (baseline) {
      const change = (now, before, unit) => now == null || before == null ? 'Not comparable yet' : (now - before > 0 ? '+' : '') + Math.round((now - before) * 10) / 10 + ' ' + unit;
      html += '<div class="what-if-baseline"><div><small>Compared with your saved baseline</small><strong>' + esc(baseline.school + ' · ' + baseline.title) + '</strong></div><div class="delta-grid"><span><b>' + esc(change(currentPlan?.coverage.mappedExternalCredits, baseline.externalCredits, 'outside credits')) + '</b>Proposed applicable outside credit</span><span><b>' + esc(currentPlan?.costs.universityTuition === null ? 'Tuition quote still needed' : change(currentPlan?.costs.modeledSubtotal, baseline.modeledSubtotal, 'USD')) + '</b>Partial modeled cost change</span></div><div class="inline-actions"><button class="button ghost small" data-action="save-baseline">Use this as my baseline</button><button class="button ghost small" data-action="restore-baseline">Restore baseline choices</button></div></div>';
    }
    if (!currentPlan) return html + '<div class="notice"><strong>Course-level what-if calculations need a complete requirement map.</strong><p>You can compare this route’s structure and update your choices. We have not invented course allocations or cost differences for this guide.</p></div></section>';
    html += '<h4>Sources and scenario choices</h4><div class="filters">' + ['Sophia', 'Study.com', 'CLEP'].map(provider => '<label class="check-option"><input type="checkbox" data-provider="' + provider + '"' + (s.providers.includes(provider) ? ' checked' : '') + '> ' + provider + '</label>').join('') + '<label class="check-option"><input type="checkbox" data-setting="allowConditional"' + (s.allowConditional ? ' checked' : '') + '> Show proposed options with unresolved conditions</label></div>';
    if (state.profile.proctoringPreference === 'avoid') html += '<p class="field-hint">CLEP is excluded from generated choices because you prefer to avoid proctored exams. Other providers’ assessment details still need individual review.</p>';
    if (models.find(model => model.id === current.pathway.modelId)?.transferWaiverVariant) html += '<label class="check-option"><input type="checkbox" data-setting="useWaivers"' + (s.useWaivers ? ' checked' : '') + '> Explore the conditional Liberty transfer-waiver scenario</label><p class="field-hint">Waivers cover named requirements and award zero credits. This scenario needs the qualifying approved transfer total and school confirmation.</p>';
    html += '<details class="optional-fields"><summary>Add price assumptions <span>Stored separately for this school</span></summary><div class="form-grid">' + scenarioInput('universityRate', 'School tuition per credit ($)', 'min="0" step="0.01" placeholder="Your quote"', 'Per-credit scenarios only. Flat-rate terms need a separate complete quote.') + scenarioInput('fees', 'Other future costs ($)', 'min="0" step="0.01" placeholder="Fees, housing, records…"') + scenarioInput('sophiaMonths', 'Sophia membership months', 'min="1" max="36" step="1"') + scenarioInput('studyMonths', 'Study.com membership months', 'min="1" max="36" step="1"') + '</div><p class="field-hint">Provider prices are dated assumptions, not current checkout quotes. Exam, proctoring, transcript, benefit, residency-waiver and institutional charges may remain missing. Whole-term tuition can change the best strategy.</p></details>';
    html += '<details class="optional-fields"><summary>Explore timing assumptions <span>Coursework scenario, separate from a graduation date</span></summary><div class="form-grid">' + scenarioInput('sophiaWeeks', 'Weeks per Sophia course', 'min="0.1" max="104" step="0.1" placeholder="Your estimate"') + scenarioInput('studyWeeks', 'Weeks per Study.com course', 'min="0.1" max="104" step="0.1" placeholder="Your estimate"') + scenarioInput('clepWeeks', 'Weeks preparing per CLEP exam', 'min="0.1" max="104" step="0.1" placeholder="Your estimate"') + scenarioInput('termWeeks', 'University term length (weeks)', 'min="1" max="52" step="0.5" placeholder="Confirm with school"') + scenarioInput('termCredits', 'University credits per term', 'min="1" max="30" step="1" placeholder="Your permitted load"') + '<label class="field"><span class="field-label">Outside actions at once</span><select class="select" data-scenario="concurrency">' + options([['1', 'One'], ['2', 'Up to two']], String(s.concurrency)) + '</select></label></div><p class="field-hint">The calculation assumes external work first and school courses every term. Actual grading, processing, school offerings, start dates, and conferral need a separate calendar check. It cannot establish your graduation date.</p></details>';
    html += '<p>To replace a specific course source, open Degree audit and choose an alternative in that requirement’s row. The full set of constraints is recalculated.</p>' + renderMetrics() + renderAcademicIssues() + '<div class="inline-actions"><button class="button secondary" data-action="recalculate">Recalculate these assumptions ' + icon('arrow') + '</button><button class="button ghost" data-action="open-audit">Change a course source</button><button class="button ghost" data-action="reset-selections">Reset course choices</button></div></section>';
    return html;
  }
  function allSources() {
    const found = new Map();
    const career = (catalog.careerGoals || []).find(item => item.id === state.profile.goal);
    for (const source of [...(current?.pathway.sources || []), ...(currentProgram?.sources || []), ...(career?.sources || [])]) if (source?.url && !found.has(source.url)) found.set(source.url, source);
    if (state.profile.militaryStatus !== 'none') for (const resource of catalog.militaryResources || []) {
      if (resource.appliesTo?.length && !resource.appliesTo.includes(state.profile.militaryStatus)) continue;
      const airService = ['air-force', 'space-force'].includes(state.profile.militaryBranch);
      if (resource.id === 'ccaf' && !airService && state.profile.militaryRecords !== 'ccaf') continue;
      if (resource.id === 'jst' && airService && state.profile.militaryRecords !== 'jst') continue;
      if (resource.url && !found.has(resource.url)) found.set(resource.url, resource);
    }
    return [...found.values()];
  }
  function renderSources() {
    const plan = currentPlan, byProvider = new Map();
    if (plan) for (const row of plan.rows.filter(row => row.option?.evidence === 'conditional' && row.status === 'planned')) {
      const provider = row.option.provider;
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider).push(row);
    }
    const due = new Date(catalog.nextReviewOn + 'T23:59:59Z') < new Date();
    return '<section class="details-section" id="route-data-notes"><p class="step-eyebrow">KNOW WHAT SUPPORTS THE PLAN</p><h3>Sources, dates, and the open questions.</h3><p>Planning research reviewed ' + dateLabel(catalog.reviewedOn) + '. Monthly review target: ' + dateLabel(catalog.nextReviewOn) + (due ? ' — a new review is due.' : '.') + ' Individual course maps and provider prices retain their own dates.</p><div class="notice"><strong>' + esc(coverageName(current.pathway)) + '</strong><p>' + (currentProgram ? 'This degree has a full requirement ledger with partial or conditional course mappings. The ledger is independently checked; it is a proposed plan awaiting the relevant confirmations.' : 'This route is a researched structure or school profile. Its course-by-course transfer map has not been completed, so it is not presented as a finished degree audit.') + '</p></div>' + (byProvider.size ? '<h4>The important checks, grouped for review</h4>' + [...byProvider].map(([provider, rows]) => '<details class="check-group"><summary>' + esc(provider) + ' · ' + rows.length + ' conditional placements</summary><p>Ask the school to confirm current source acceptance, the relevant course versions and dates, and applicability to your selected catalog. The course-level conditions are included in the downloaded plan.</p><ul>' + rows.map(row => '<li>' + esc(row.option.title) + ' → ' + esc(row.option.receivingCode || row.code) + '</li>').join('') + '</ul></details>').join('') : '') + (currentProgram?.unresolved?.length ? '<h4>Program questions still open</h4><ul class="plain-list">' + currentProgram.unresolved.map(item => '<li>' + esc(text(item)) + '</li>').join('') + '</ul>' : '') + (plan ? '<details class="check-group"><summary>Cost and timing details</summary><p>Provider pricing reference date: ' + dateLabel(DegreePlanner.providerPricing.checked) + '.</p><h4>Missing cost information</h4><ul>' + plan.costs.missing.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul><h4>Timing assumptions</h4><ul>' + plan.timing.assumptions.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul></details>' : '') + '<h4>Evidence for this route</h4><div class="source-list">' + allSources().map(source => '<a href="' + url(source.url) + '" target="_blank" rel="noopener"><div><strong>' + esc(source.title || source.label || source.id || 'Source') + '</strong><span>' + esc(source.type || source.evidenceType || 'Source reference') + ' · ' + (source.checkedOn ? 'Checked ' + dateLabel(source.checkedOn) : source.pageLastEdited ? 'Source edited ' + esc(source.pageLastEdited) : 'Review the source date and scope') + '</span></div>' + icon('arrow') + '</a>').join('') + '</div></section>';
  }

  function knownLearning() {
    const found = new Map();
    for (const model of models) for (const req of model.requirements) for (const option of req.options || []) {
      if (option.provider === 'University') continue;
      const key = option.provider + '|' + option.code;
      if (!found.has(key)) found.set(key, { provider: option.provider, code: option.code, title: option.title, credits: option.bundleCredits || option.credits });
    }
    return [...found.values()].sort((a, b) => (a.provider + a.title).localeCompare(b.provider + b.title));
  }
  function openLearning(itemId = null, draft = null) {
    activeLearningId = itemId; activeLearningDraft = draft; learningMode = 'manual'; imported = [];
    renderLearningDialog(); if (!$('learning-dialog').open) $('learning-dialog').showModal();
  }
  function renderLearningDialog() {
    const item = state.learning.find(record => record.id === activeLearningId) || activeLearningDraft || {};
    const providerList = ['Other college', 'Sophia', 'Study.com', 'CLEP', 'DSST', 'AP', 'StraighterLine', 'Saylor', 'Military training', 'Professional certificate', 'Other'];
    if (item.provider && !providerList.includes(item.provider)) providerList.unshift(item.provider);
    const model = state.view === 'results' ? currentProgram : models.find(model => model.id === catalog.pathways.find(pathway => pathway.id === state.profile.pathwayId)?.modelId);
    $('learning-dialog-content').innerHTML = '<p class="step-eyebrow">YOUR REUSABLE LEARNING INVENTORY</p><h2>' + (activeLearningId ? 'Edit learning' : 'What have you learned?') + '</h2><p>Keep the original source and record details. A match remains provisional until your school evaluates it.</p><div class="tabs"><button class="tab' + (learningMode === 'manual' ? ' active' : '') + '" data-learning-mode="manual" type="button">Add a record</button><button class="tab' + (learningMode === 'csv' ? ' active' : '') + '" data-learning-mode="csv" type="button">Import a course CSV</button></div>' + (learningMode === 'csv' ? renderImport() : '<form id="learning-form"><label class="field"><span class="field-label">Find a course already in our maps <small>optional</small></span><select class="select" id="known-learning"><option value="">Enter my own record</option>' + knownLearning().map((record, index) => '<option value="' + index + '">' + esc(record.provider + ' · ' + record.title + ' · ' + record.code) + '</option>').join('') + '</select></label><div class="form-grid"><label class="field"><span class="field-label">Original credit source</span><select class="select" name="provider">' + options(providerList, item.provider || 'Other college') + '</select></label><label class="field"><span class="field-label">Course code or identifier</span><input class="input" name="code" maxlength="100" value="' + esc(item.code) + '" placeholder="As shown on your record"></label></div><label class="field"><span class="field-label">Course, exam, or credential name</span><input class="input" name="title" required maxlength="160" value="' + esc(item.title) + '"></label><div class="form-grid"><label class="field"><span class="field-label">Credits on the original record</span><input class="input" name="credits" type="number" min="0.1" max="200" step="0.1" required value="' + esc(item.credits || 3) + '"></label><label class="field"><span class="field-label">Credit units</span><select class="select" name="creditSystem">' + options([['semester', 'Semester'], ['quarter', 'Quarter']], item.creditSystem || 'semester') + '</select></label><label class="field"><span class="field-label">Learning status</span><select class="select" name="status">' + options([['earned', 'Completed / earned'], ['in-progress', 'In progress'], ['planned', 'Considering it']], item.status || 'earned') + '</select></label><label class="field"><span class="field-label">Completed on <small>optional</small></span><input class="input" name="completedOn" type="date" value="' + esc(item.completedOn) + '"></label></div>' + (model ? '<details class="optional-fields"><summary>Record an existing university evaluation <span>Only if this school has already evaluated the item</span></summary><label class="check-option"><input type="checkbox" name="schoolConfirmed"> ' + esc(model.school) + ' has confirmed a specific requirement placement</label><label class="field"><span class="field-label">Confirmed requirement in this degree</span><select class="select" name="requirementId"><option value="">Choose the school-confirmed placement</option>' + model.requirements.map(req => '<option value="' + esc(req.id) + '">' + esc(req.categoryLabel || req.title) + ' · ' + req.credits + ' credits</option>').join('') + '</select></label><p class="field-hint">Confirmation applies to this school and degree only. It will not automatically carry into another school’s audit.</p></details>' : '') + '<p class="form-error" id="learning-error" role="alert"></p><button type="submit" class="button">Save learning record ' + icon('plus') + '</button></form>');
    const form = $('learning-form');
    if (form) {
      const priorEvaluation = (item.evaluations || []).find(evaluation => evaluation.programId === model?.id && evaluation.status === 'confirmed');
      if (priorEvaluation) { form.elements.schoolConfirmed.checked = true; form.elements.requirementId.value = priorEvaluation.requirementId; }
      form.onsubmit = event => { event.preventDefault(); saveLearning(form, model); };
    }
  }
  function saveLearning(form, model) {
    const fields = new FormData(form), credits = number(fields.get('credits'));
    if (!credits || credits > 200 || !String(fields.get('title')).trim()) { $('learning-error').textContent = 'Add a course name and between 0.1 and 200 credits.'; return; }
    const existing = state.learning.find(record => record.id === activeLearningId);
    const item = { ...(existing || {}), id: existing?.id || uid(), provider: String(fields.get('provider')), code: String(fields.get('code') || '').trim(), title: String(fields.get('title')).trim(), credits, creditSystem: String(fields.get('creditSystem')), status: String(fields.get('status')), completedOn: String(fields.get('completedOn') || ''), evaluations: [] };
    const sameIdentity = existing && ['provider', 'code', 'title', 'credits', 'creditSystem', 'status', 'completedOn'].every(key => String(existing[key] || '') === String(item[key] || ''));
    if (sameIdentity) item.evaluations = [...(existing.evaluations || [])].filter(evaluation => evaluation.programId !== model?.id);
    if (fields.get('schoolConfirmed') && model) {
      const req = model.requirements.find(req => req.id === fields.get('requirementId'));
      if (!req) { $('learning-error').textContent = 'Choose the requirement shown on the school’s evaluation.'; return; }
      if (item.status !== 'earned') { $('learning-error').textContent = 'Only completed learning can be recorded as an existing confirmed award.'; return; }
      item.evaluations.push({ programId: model.id, requirementId: req.id, status: 'confirmed' });
    }
    if (existing) state.learning.splice(state.learning.indexOf(existing), 1, item); else state.learning.push(item);
    state.profile.hasPrior = 'some'; save(); $('learning-dialog').close(); refreshAfterLearning();
  }
  let importedSource='',importRevision=0;
  function clearImportPreview(){imported=[];importedSource='';importRevision++;if($('import-preview'))$('import-preview').innerHTML='';if($('import-error'))$('import-error').textContent='';return importRevision;}
  function renderImport() {
    imported=[];importedSource='';importRevision++;
    return DegreeCreditImport.helpHTML()+'<div class="field"><label class="field-label" for="learning-csv">Paste a course CSV or choose a file</label><p class="field-hint">Imports add learning records. School-confirmed placements are recorded separately. Updates to source details clear earlier confirmations.</p><input id="learning-file" type="file" accept=".csv,text/csv"><textarea class="input" id="learning-csv" rows="7" maxlength="100000" placeholder="provider,code,title,credits\nSophia,SOPH-0015,English Composition I,3"></textarea></div><button type="button" class="button secondary" data-action="preview-import">Preview records</button><p id="import-error" class="form-error" role="alert"></p><div id="import-preview"></div>';
  }
  const learningIdentity = item => [item.provider, item.code || item.title].map(value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
  function sameLearningDetails(left, right) {
    return ['provider', 'code', 'title', 'credits', 'creditSystem', 'status', 'completedOn'].every(key => String(left[key] || '').trim().toLowerCase() === String(right[key] || '').trim().toLowerCase());
  }
  function clearLearningConfirmation(form) {
    if (!activeLearningId || !form?.elements.schoolConfirmed) return;
    form.elements.schoolConfirmed.checked = false;
    let note = form.querySelector('.confirmation-reset');
    if (!note) { note = document.createElement('p'); note.className = 'field-hint confirmation-reset'; form.elements.schoolConfirmed.closest('label').after(note); }
    note.textContent = 'Record details changed. Reconfirm the school’s placement only if it applies to these updated details.';
  }
  function parseCSV(raw) {
    const rows = []; let cells = [], cell = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const character = raw[i];
      if (character === '"') { if (quoted && raw[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (character === ',' && !quoted) { cells.push(cell); cell = ''; }
      else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && raw[i + 1] === '\n') i++; cells.push(cell); if (cells.some(value => value.trim())) rows.push(cells); cells = []; cell = ''; }
      else cell += character;
    }
    if (quoted) throw Error('A quoted CSV value is unfinished. Check the file and try again.');
    cells.push(cell); if (cells.some(value => value.trim())) rows.push(cells);
    if(rows.length<2)throw Error('Add at least one course below the header row before uploading.');
    if(rows.length>501)throw Error('Use at most 500 learning records per CSV.');
    const header = rows.shift().map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase());
    for (const required of ['provider', 'title', 'credits']) if (!header.includes(required)) throw Error('The CSV needs provider, title, and credits columns.');
    return rows.map((values, index) => {
      const record = Object.fromEntries(header.map((key, position) => [key, (values[position] || '').trim()]));
      if (!record.provider || !record.title || !(number(record.credits) > 0) || number(record.credits) > 200) throw Error('Check the provider, title, and credit amount on row ' + (index + 2) + '.');
      if (record.creditsystem && !['semester', 'quarter'].includes(record.creditsystem)) throw Error('Use semester or quarter credit units on row ' + (index + 2) + '.');
      const statuses = { '': 'earned', earned: 'earned', completed: 'earned', complete: 'earned', 'in-progress': 'in-progress', 'in progress': 'in-progress', ongoing: 'in-progress', planned: 'planned', proposed: 'planned', considering: 'planned' };
      const status = statuses[(record.status || '').toLowerCase()];
      if (!status) throw Error('Use earned, in-progress, or planned status on row ' + (index + 2) + '.');
      return { id: uid(), provider: record.provider.slice(0, 120), code: (record.code || '').slice(0, 100), title: record.title.slice(0, 160), credits: number(record.credits), creditSystem: record.creditsystem || 'semester', status, completedOn: /^\d{4}-\d{2}-\d{2}$/.test(record.completedon || '') ? record.completedon : '', evaluations: [] };
    });
  }
  function refreshAfterLearning() { if (state.view === 'results') buildResults(false); else renderWizard(false); }
  function openRowSources(requirementId) {
    const row = currentPlan?.rows.find(item => item.requirementId === requirementId); if (!row) return;
    const sources = currentProgram.sources.filter(source => row.sourceIds.includes(source.id));
    $('source-dialog-content').innerHTML = '<p class="step-eyebrow">WHY THIS COURSE IS IN YOUR DRAFT</p><h2>' + esc(row.option?.title || row.title) + '</h2><p>Proposed placement: ' + esc(row.title) + ' · ' + esc(row.option?.receivingCode || row.code) + '.</p><ul class="condition-list">' + row.conditions.map(condition => '<li>' + esc(condition) + '</li>').join('') + '</ul><div class="source-list">' + sources.map(source => '<a href="' + url(source.url) + '" target="_blank" rel="noopener">' + esc(source.title) + icon('arrow') + '</a>').join('') + '</div>';
    $('source-dialog').showModal();
  }
  function completeRow(requirementId) {
    const row = currentPlan?.rows.find(item => item.requirementId === requirementId); if (!row?.option) return;
    const option = row.option;
    const same = state.learning.find(item => item.provider === option.provider && item.code === option.code);
    if (same) { openLearning(same.id); return; }
    openLearning(null, { provider: option.provider, code: option.code, title: option.title, credits: option.bundleCredits || option.credits, creditSystem: currentProgram.creditSystem || 'semester', status: 'earned', completedOn: '', evaluations: [] });
  }
  function downloadFile(name, data, type = 'application/json') {
    const objectURL = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
    link.href = objectURL; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  }
  function downloadPlan() {
    if (!current) return;
    const lines = ['DegreeSteps — YOUR PROPOSED DEGREE ROUTE', 'Prepared ' + new Date().toISOString(), current.pathway.school, current.pathway.title, 'Coverage: ' + coverageName(current.pathway), '', 'YOUR PRIORITIES', ...summaryRows().map(([title, value]) => title + ': ' + value), '', 'YOUR NEXT THREE ACTIONS', ...nextActions().map((action, index) => (index + 1) + '. ' + action.title + '\n' + action.detail), '', 'LEARNING INVENTORY', ...state.learning.map(item => [item.provider, item.code, item.title, item.credits + ' ' + item.creditSystem + ' credits', item.status].join(' | '))];
    if (currentPlan) lines.push('', 'DRAFT CREDIT ACCOUNTING', 'Degree size: ' + currentProgram.totalCredits, 'Proposed outside credits: ' + currentPlan.coverage.mappedExternalCredits, 'School-confirmed by your report: ' + currentPlan.totals.confirmed, 'Existing pending evaluation: ' + currentPlan.totals.reported, 'University-credit rule: ' + residencyDisplay().description, 'Research gaps among university-assigned rows: ' + currentPlan.coverage.researchGapCredits, 'Academic count checks: ' + (currentPlan.validation.academicCountsValid ? 'passed' : 'CONFLICTS'), '', 'FULL REQUIREMENT MAP', ...currentPlan.rows.map(row => { const req = currentProgram.requirements.find(item => item.id === row.requirementId); return [req?.categoryLabel || row.title, row.credits + ' credits', row.option?.provider, row.option?.title, 'Receiving award: ' + (row.option?.receivingCode || row.code), placementLabel(row)].join(' | ') + '\n' + row.conditions.join('\n'); }), '', 'MODELED FUTURE EXPENSES', money(currentPlan.costs.modeledSubtotal) + ' partial subtotal', ...currentPlan.costs.missing.map(item => 'Missing: ' + item), '', 'TIMING ASSUMPTIONS', ...currentPlan.timing.assumptions, '', 'OPEN ITEMS', ...currentPlan.blockers.map(item => item.message));
    else lines.push('', 'ROUTE STRUCTURE', ...((guidance?.milestones || []).map(item => text(item))), ...(current.pathway.proposedActions || []).map(text), '', 'OPEN REQUIREMENTS', ...(current.pathway.constraints || []).map(text), 'A course-level audit is not yet available for this target. No personalized accepted-credit total, complete price, or finish date was inferred.');
    lines.push('', 'SOURCE LINKS', ...allSources().map(source => (source.title || source.label || 'Source') + '\n' + source.url), '', 'Research reviewed: ' + catalog.reviewedOn + '; monthly review target: ' + catalog.nextReviewOn, 'This is a proposed route. Individual evaluation, course versions, catalog rights, actual schedules, and career requirements need their stated confirmations.');
    downloadFile('degreesteps-' + current.pathway.id + '.txt', lines.join('\n'), 'text/plain');
  }

  function updateProfile(field, value, redraw = false) {
    state.profile[field] = value;
    if (field === 'schoolChoice') { state.profile.school = value === 'custom' ? '' : value; state.profile.pathwayId = ''; state.profile.degree = ''; }
    if (field === 'pathwayId') {
      const pathway = catalog.pathways.find(item => item.id === value);
      if (pathway) { state.profile.school = pathway.school; state.profile.degree = pathway.title; state.profile.degreeLevel = pathway.level; state.profile.field = pathway.field; }
      else if (value === 'custom') state.profile.degree = '';
    }
    if (field === 'goal' && ['teacher', 'lawyer', 'pilot', 'health-professional'].includes(value) && state.profile.entry === 'explore') state.profile.field = { teacher: 'education', lawyer: 'law', pilot: 'aviation', 'health-professional': 'health' }[value];
    if (field === 'militaryStatus' && value === 'none' && state.step === 'military') state.step = 'experience';
    save();
    if (state.view === 'results') { buildResults(false); return; }
    if (redraw) renderWizard(false); else renderJourney();
  }
  function handleAction(action) {
    if (action === 'add-learning') openLearning();
    else if (action === 'share-plan') shareCurrentPlan();
    else if (action === 'toggle-alternatives') { state.alternativesOpen = !state.alternativesOpen; $('recommendation-grid').classList.toggle('show-alternatives', state.alternativesOpen); const button = $('toggle-alternatives'); button.setAttribute('aria-expanded', String(state.alternativesOpen)); button.innerHTML = (state.alternativesOpen ? 'Hide alternatives' : 'Compare ' + Math.min(2, candidates.length - 1) + ' alternative routes') + icon('arrow'); save(); }
    else if (action === 'edit-profile') { state.step = state.profile.entry === 'explore' ? 'goal' : 'direction'; renderWizard(true); }
    else if (action === 'recalculate') buildResults(false);
    else if (action === 'reset-selections') { scenarioFor(current.pathway).optionSelections = {}; buildResults(false); }
    else if (action === 'open-audit') { state.resultTab = 'audit'; renderResults(); }
    else if (action === 'save-baseline') { state.baseline = baselineSnapshot(); save(); renderResults(); }
    else if (action === 'restore-baseline' && state.baseline) { const baseline = clone(state.baseline); state.profile = { ...defaults, ...baseline.profile }; state.selectedPathwayId = baseline.selectedPathwayId; state.scenarios = baseline.scenarios; buildResults(false); }
    else if (action === 'download-plan') downloadPlan();
    else if (action === 'download-profile') downloadFile('degreesteps-profile-and-learning.json', JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), profile: state.profile, learning: state.learning, scenarios: state.scenarios }, null, 2));
    else if (action === 'print-plan') { state.resultTab = currentPlan ? 'audit' : 'plan'; renderResults(); window.print(); }
    else if (action === 'preview-import') {
      clearImportPreview();
      try {
        imported = parseCSV($('learning-csv').value);importedSource=$('learning-csv').value;
        const existing = new Map(state.learning.map(item => [learningIdentity(item), item]));
        $('import-error').textContent = '';
        $('import-preview').innerHTML = '<h3>Review ' + imported.length + ' record' + (imported.length === 1 ? '' : 's') + '</h3><ul class="plain-list">' + imported.slice(0, 30).map(item => { const prior = existing.get(learningIdentity(item)), disposition = prior ? sameLearningDetails(prior, item) ? 'Unchanged' : 'Update existing record; clear prior confirmations' : 'New record'; return '<li><strong>' + esc(item.title) + '</strong> · ' + esc(item.provider) + ' · ' + item.credits + ' ' + item.creditSystem + ' credits · ' + esc(item.status) + '<br><span class="badge ' + (prior && !sameLearningDetails(prior, item) ? 'amber' : 'muted') + '">' + disposition + '</span></li>'; }).join('') + '</ul>' + (imported.length > 30 ? '<p>' + (imported.length - 30) + ' additional rows passed the same format checks.</p>' : '') + '<button type="button" class="button" data-action="confirm-import">Apply these records</button>';
      } catch (error) { imported = []; $('import-error').textContent = error.message; $('import-preview').innerHTML = ''; }
    } else if (action === 'confirm-import' && imported.length) {
      if(importedSource!==$('learning-csv').value){clearImportPreview();$('import-error').textContent='Preview your current CSV before importing.';return;}
      const existing = new Map(state.learning.map(item => [learningIdentity(item), item]));
      for (const item of imported) {
        const prior = existing.get(learningIdentity(item));
        if (prior && sameLearningDetails(prior, item)) continue;
        if (prior) { const replacement = { ...item, id: prior.id, evaluations: [] }; state.learning.splice(state.learning.indexOf(prior), 1, replacement); existing.set(learningIdentity(item), replacement); }
        else { state.learning.push(item); existing.set(learningIdentity(item), item); }
      }
      imported = []; importedSource=''; state.profile.hasPrior = 'some'; save(); $('learning-dialog').close(); refreshAfterLearning();
    }
  }
  function attachCommunity() {
    const revision = ++communityRevision;
    communityMount?.destroy?.(); communityMount = null;
    const element = $('route-community'), client = window.DegreeCommunity;
    if (!element || !client || !current) return;
    const fromTemplate = state.templateOrigin?.pathwayId===current.pathway.id && state.templateOrigin.context;
    const context = fromTemplate || 'program:' + current.pathway.id;
    client.mountContext(element, {context, title:state.templateOrigin ? 'Discuss this starting template' : current.pathway.title}).then(mounted => {
      if (revision === communityRevision) communityMount = mounted;
      else mounted?.destroy?.();
    }).catch(() => { if (revision === communityRevision) element.textContent = 'The discussion could not be loaded. Your degree draft is still available.'; });
  }
  function shareCurrentPlan() {
    const client = window.DegreeCommunity;
    if (!client || !currentPlan || !currentProgram) return;
    if (!currentPlan.validation.academicCountsValid || currentPlan.setupIssues?.some(item => ['invalid_selection','selection_conflict'].includes(item.code))) {
      $('source-dialog-content').innerHTML = '<h2>Resolve this scenario before sharing.</h2><p>The audit contains degree-rule conflicts. Fix the flagged course choices, then review the public plan preview.</p>';
      $('source-dialog').showModal(); return;
    }
    const courses = currentPlan.rows.filter(row => row.status === 'planned' && row.option).map(row => ({
      requirementId:row.requirementId,requirement:currentProgram.requirements.find(req=>req.id===row.requirementId)?.categoryLabel || row.title,
      courseId:row.option.id,title:row.option.title,provider:row.option.provider,credits:row.credits,...(url(row.option.url)!=='#'?{url:row.option.url}:{})
    }));
    const plan = {schoolId:schoolKey(current.pathway.school),schoolName:current.pathway.school,programId:currentProgram.id,programName:current.pathway.title,strategy:state.profile.priority,totalCredits:currentProgram.totalCredits,courses};
    client.sharePlan({plan,title:current.pathway.title + ' — proposed route',body:'A proposed curriculum to compare and improve. It includes conditional mappings and research gaps that need current school confirmation. Only proposed course choices are shared; this is not an official transfer evaluation or a completed transcript.'});
  }
  async function applyCommunityEntry() {
    const params = new URLSearchParams(location.search), starterId = params.get('template'), sharedId = params.get('shared');
    if (!starterId && !sharedId) return;
    let pathway = null, title = '', context = '', publicPlan = null, strategy = 'balanced';
    try {
      if (starterId) {
        const response = await fetch('data/community-templates.json'); if (!response.ok) throw Error('Starter unavailable');
        const data = await response.json(), starter = data.templates?.find(item=>item.id===starterId);
        if (!starter) throw Error('This starter could not be found.');
        pathway = catalog.pathways.find(item=>item.id===starter.pathwayId); title=starter.title;context='template:'+starter.id;strategy=starter.strategy;
      } else if (sharedId && /^[A-Za-z0-9_-]{1,120}$/.test(sharedId) && window.DegreeCommunity) {
        const {item} = await window.DegreeCommunity.api('/posts/'+encodeURIComponent(sharedId));
        publicPlan=window.DegreeCommunity.safePlan(item.plan); if (!publicPlan) throw Error('This post does not include a reusable course plan.');
        pathway=catalog.pathways.find(route=>route.modelId===publicPlan.programId || route.id===publicPlan.programId);title=item.title;context='post:'+item.id;strategy=publicPlan.strategy;
      }
      if (!pathway) throw Error('A compatible researched degree template is not yet available for this plan.');
      state.profile={...state.profile,entry:'target',schoolChoice:pathway.school,school:pathway.school,degree:pathway.title,pathwayId:pathway.id,degreeLevel:pathway.level,field:pathway.field,priority:['balanced','speed','cost','transfer'].includes(strategy)?strategy:'balanced'};
      if (state.profile.modality!=='any' && !pathway.modalities.includes(state.profile.modality)) state.profile.modality=pathway.modalities[0] || 'any';
      state.selectedPathwayId=pathway.id;state.templateOrigin={title,context,pathwayId:pathway.id};state.view='wizard';state.step='direction';
      if (publicPlan) {
        const model=models.find(item=>item.id===pathway.modelId), selections={}; let unmatched=0;
        for (const course of publicPlan.courses) {
          const req=model?.requirements.find(item=>item.id===course.requirementId), option=req?.options.find(item=>item.id===course.courseId && item.provider===course.provider && item.credits===course.credits);
          if (option) selections[req.id]=option.id; else unmatched++;
        }
        scenarioFor(pathway).optionSelections=selections;
        state.templateOrigin.unmatchedChoices=unmatched;
      }
    } catch(error) { state.view='wizard';state.step='start';state.templateOrigin={title:'a saved community link',context:'',error:error.message}; }
  }
  function events() {
    $('next-step').addEventListener('click', nextStep); $('back-step').addEventListener('click', backStep);
    $('close-learning').onclick = () => $('learning-dialog').close(); $('close-sources').onclick = () => $('source-dialog').close();
    document.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.set) updateProfile(button.dataset.set, button.dataset.value, true);
      else if (button.dataset.goto) { state.step = button.dataset.goto; renderWizard(true); }
      else if (button.dataset.action) handleAction(button.dataset.action);
      else if (button.dataset.route) { state.selectedPathwayId = button.dataset.route; buildResults(false); }
      else if (button.dataset.tab) { state.resultTab = button.dataset.tab; save(); renderResults(); $('tab-' + state.resultTab)?.focus({ preventScroll: true }); }
      else if (button.dataset.editLearning) openLearning(button.dataset.editLearning);
      else if (button.dataset.removeLearning) { state.learning = state.learning.filter(item => item.id !== button.dataset.removeLearning); save(); refreshAfterLearning(); }
      else if (button.dataset.learningMode) { learningMode = button.dataset.learningMode; renderLearningDialog(); }
      else if (button.dataset.completeRow) completeRow(button.dataset.completeRow);
      else if (button.dataset.sourceRow) openRowSources(button.dataset.sourceRow);
      else if (button.dataset.discussContext && window.DegreeCommunity) window.DegreeCommunity.openThread({context:button.dataset.discussContext,title:button.dataset.discussTitle});
    });
    document.addEventListener('input', event => {
      const target = event.target;
      if(target.id==='learning-csv')clearImportPreview();
      if (target.closest('#learning-form') && ['provider', 'code', 'title', 'credits', 'creditSystem', 'status', 'completedOn'].includes(target.name)) clearLearningConfirmation($('learning-form'));
      if (target.dataset.field && !['SELECT', 'INPUT'].includes(target.tagName)) return;
      if (target.dataset.field && target.tagName !== 'SELECT') { state.profile[target.dataset.field] = target.type === 'number' ? target.value === '' ? '' : Number(target.value) : target.value; save(); renderJourney(); }
      if (target.dataset.scenario) { scenarioFor(current.pathway)[target.dataset.scenario] = target.value; save(); }
    });
    document.addEventListener('change', event => {
      const target = event.target;
      if (target.closest('#learning-form') && ['provider', 'code', 'title', 'credits', 'creditSystem', 'status', 'completedOn'].includes(target.name)) clearLearningConfirmation($('learning-form'));
      if (target.dataset.field) updateProfile(target.dataset.field, target.type === 'number' ? number(target.value) : target.value, target.tagName === 'SELECT');
      else if (target.dataset.provider) { const s = scenarioFor(current.pathway); s.providers = [...document.querySelectorAll('[data-provider]:checked')].map(input => input.dataset.provider); buildResults(false); }
      else if (target.dataset.setting) { scenarioFor(current.pathway)[target.dataset.setting] = target.checked; buildResults(false); }
      else if (target.dataset.selection) { scenarioFor(current.pathway).optionSelections[target.dataset.selection] = target.value; if (!target.value) delete scenarioFor(current.pathway).optionSelections[target.dataset.selection]; buildResults(false); }
      else if (target.dataset.scenario) { scenarioFor(current.pathway)[target.dataset.scenario] = target.value; save(); }
      else if (target.id === 'what-if-route') { state.selectedPathwayId = target.value; buildResults(false); }
      else if (target.id === 'known-learning' && target.value !== '') { const item = knownLearning()[Number(target.value)], form = $('learning-form'); if (item && form) { for (const field of ['provider', 'code', 'title', 'credits']) form.elements[field].value = item[field]; clearLearningConfirmation(form); } }
      else if (target.id === 'learning-file') {
        const ticket=clearImportPreview(),box=$('learning-csv'),file = target.files?.[0];box.value='';if(!file)return; if (file.size > 100000) { $('import-error').textContent = 'Use a CSV smaller than 100 KB.'; return; }
        const reader = new FileReader(); reader.onload = () => {if(ticket===importRevision&&box.isConnected)box.value=String(reader.result||'');}; reader.onerror = () => {if(ticket===importRevision&&box.isConnected)$('import-error').textContent = 'The file could not be read. You can paste the CSV instead.';}; reader.readAsText(file);
      }
    });
    document.addEventListener('keydown', event => {
      if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...document.querySelectorAll('#result-details [role="tab"]')], index = tabs.indexOf(event.target); if (index < 0) return;
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click();
    });
  }
  async function init() {
    try {
      const responses = await Promise.all(['data/pathways.json', 'data/liberty.json', 'data/tesu.json'].map(async path => { const response = await fetch(path); if (!response.ok) throw Error('A research file did not load.'); return response.json(); }));
      catalog = responses[0]; models = responses.slice(1); restore();
      await applyCommunityEntry();
      if (state.profile.school && !state.profile.schoolChoice) state.profile.schoolChoice = catalog.pathways.some(pathway => pathway.school === state.profile.school) ? state.profile.school : 'custom';
      $('loading-state').hidden = true; $('error-state').hidden = true; events();
      if (state.view === 'results') buildResults(false); else renderWizard(false);
    } catch (error) {
      console.error(error); $('loading-state').hidden = true; $('error-state').hidden = false;
      $('error-state').innerHTML = '<h2>The research files could not load.</h2><p>Your saved draft has not been deleted. Refresh to try again, or open the earlier audit.</p><a class="button secondary" href="audit.html">Open existing audit</a>';
    }
  }
  init();
})();
