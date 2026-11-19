(function () {
  'use strict';
  const W = window.DegreeTemplateWorkspace, $ = id => document.getElementById(id), e = W.esc;
  const form = $('degree-request-form'), input = $('degree-url'), storageKey = 'degreepath-degree-link-v2';
  let requests = [], user = null, configured = false, busy = false, loading = false, poll = null;
  let currentTemplate = null, currentChoices = [], currentPublic = false, currentSourcePlan = null;
  let selectedReference = null, pendingRecovery = null;
  let progressTimer = null, progressGeneration = 0, progressURL = '', progressStartedAt = 0, resumeChecked = false, operationSequence = 0;
  const activeStorageKey = 'degreepath-research-active-v1';
  const contextStorageKey='degreesteps-degree-context-v1';
  let requestContext=null;
  let explicitEntry=false,entryURL='';
  const list = W.list, known = value => typeof value === 'number' && Number.isFinite(value);
  function activeResearchJob(value) {
    const template = value?.template || value, job = value?.researchJob || template?.researchJob;
    return Boolean(job && typeof job.id === 'string' && job.id && ['queued','dispatched','running','retry'].includes(job.status));
  }
  function queuedResearch(value) {const template = value?.template || value; return template?.status !== 'researching' && activeResearchJob(value);}
  function pendingResearch(value) {const template = value?.template || value; return template?.status === 'researching' || activeResearchJob(value);}
  function interruptedResearch(item) {return !activeResearchJob(item) && (item?.stale === true || item?.progress?.stale === true || item?.status === 'researching' && item?.canResume === true);}
  function responseTemplate(data) {
    const template = data.template || data.request?.template;
    return template && data.researchJob ? {...template,queued:data.queued === true,researchJob:data.researchJob} : template;
  }
  function queuedProgress() {
    $('research-stage-label').textContent = 'Your degree research is queued';
    $('research-stage-detail').textContent = 'Your request is saved and will start when a research slot is available. You can leave this page and return to its saved progress.';
  }
  function referenceID(value) { return typeof value === 'string' && value.trim().length <= 120 ? value.trim() : ''; }
  function selectedReferenceFor(url) { return selectedReference?.url === url ? selectedReference.referenceChoice : ''; }
  function rememberReference(url, value, waitingToStart = false) {
    const referenceChoice = referenceID(value);
    selectedReference = referenceChoice ? {url,referenceChoice} : null;
    if (waitingToStart) { try { if (referenceChoice) sessionStorage.setItem(activeStorageKey,JSON.stringify({url,referenceChoice,waitingToStart:true})); else sessionStorage.removeItem(activeStorageKey); } catch {} }
  }
  function progressItem(response, referenceChoice) {
    const items = response.item ? [response.item,...list(response.items)] : list(response.items);
    if (referenceChoice) return items.find(item => referenceID(item.referenceChoice) === referenceChoice) || null;
    return response.item || (items.length === 1 ? items[0] : null);
  }
  function notice(message, error = false) {
    const node = $('request-message'); node.textContent = studentText(message); node.hidden = !message; node.dataset.error = String(error);
  }
  function studentText(value) {
    let text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    if (/^(?:load failed|failed to fetch|network request failed|networkerror.*)$/i.test(text)) return 'Your connection was interrupted. Your degree link and saved research are still here.';
    if (/majorInstitutionFraction|majorResidencyBasisCredits|majorMinInstitutionCredits/i.test(text)) return 'DegreeSteps still needs a source for this degree’s major residency requirement.';
    if (/institutionMinCredits/i.test(text)) return 'DegreeSteps still needs a source for the minimum coursework at this college.';
    if (/alternativeMaxCredits/i.test(text)) return 'DegreeSteps still needs a source for the alternative-credit limit.';
    if (/externalMaxCredits/i.test(text)) return 'DegreeSteps still needs a source for the overall transfer-credit limit.';
    if (/upperMinCredits/i.test(text)) return 'DegreeSteps still needs to establish the upper-level course requirement.';
    if (/complete published degree total|complete degree total|full university requirement list|full credit ledger/i.test(text)) return 'We still need the complete course list for this degree.';
    if (/exact school, degree, study format|exact school, degree, level/i.test(text)) return 'We need to confirm the exact degree and study format from the college’s page.';
    if (/source-bound|source-backed|source scope|receiving-map|provider-identity|policyEvidence|sourceIds|planArtifact|planBuildable|qualityReady|canonical|template_id|artifact_json|SQL|ANTHROPIC|AI_CONNECTION|[{}]/i.test(text)) return 'Some course details still need reliable information from the college.';
    if (/\b[a-z]+[A-Z][A-Za-z]+\b/.test(text) && !/Study\.com|DegreePath|DegreeSteps/.test(text)) return 'DegreeSteps still needs evidence for some course details.';
    return text.slice(0,600);
  }
  function studentIssues(template, artifact) {
    const raw = list(template?.studentIssues).length ? template.studentIssues : [...list(template?.planIssues),...list(template?.unresolved),...list(artifact?.unresolved)];
    return [...new Set(raw.map(item => studentText(typeof item === 'string' ? item : item?.message || '')).filter(Boolean))];
  }
  function stopProgress({finished = false} = {}) {
    progressGeneration++; if (progressTimer) clearTimeout(progressTimer); progressTimer = null;
    if (finished) { try { sessionStorage.removeItem(activeStorageKey); } catch {} }
  }
  function updateProgress(progress) {
    if (!progress || typeof progress !== 'object') return;
    const stages = {
      identifying:['Identifying your exact degree','Checking the college, program, study format, and catalog.'],
      requirements:['Reading the degree requirements','Finding the complete course list, including general education, the major, and electives.'],
      transfers:['Researching transfer courses','Looking for supported outside courses and the college’s transfer rules.'],
      checking:['Checking the whole plan','Checking the credit totals, required college courses, and course order.'],
      refining:['Resolving the remaining gaps','Taking a closer look at details needed for a dependable course plan.'],
      complete:['Your course plan is ready','Opening the checked course plan and its sources.'],
      'needs-attention':['Your saved research needs another step','We’ll show what is still needed and how to continue.']
    };
    const copy = stages[progress.stage]; if (!copy) return;
    $('research-stage-label').textContent = copy[0]; $('research-stage-detail').textContent = copy[1];
    const sources = Number(progress.sourceCount), requirements = Number(progress.requirementCount), counts = [];
    if (Number.isSafeInteger(sources) && sources > 0) counts.push(sources + ' sources found');
    if (Number.isSafeInteger(requirements) && requirements > 0) counts.push(requirements + ' degree requirements found');
    $('research-progress-counts').textContent = counts.join(' · ');
    const start = Number(progress.startedAt); if (Number.isFinite(start) && start > 0 && start <= Date.now()) progressStartedAt = start;
  }
  async function readProgress(url) {
    return W.api('/api/templates/research-status?url=' + encodeURIComponent(url));
  }
  function showInterrupted(item, url) {
    const id = item.templateId || item.id;
    if (typeof id !== 'string' || !Number.isSafeInteger(item.revision)) return false;
    operationSequence++; stopProgress(); if (poll) clearTimeout(poll); poll = null; setBusy(false);
    currentTemplate = {...item,id,url,canResume:true}; currentSourcePlan = null; currentChoices = [];
    rememberReference(url,item.referenceChoice);
    input.value = url; rememberURL(url);
    $('request-result').innerHTML = '<div class="link-result-head"><div><span class="tw-badge">Saved research</span><h2>' + e(degreeName(item,null)) + '</h2><p class="link-result-school">' + degreeSubtitle(item,null) + '</p></div><button class="tw-button tw-secondary" type="button" data-change-link>Try another degree</button></div><div class="link-unfinished"><h3>Research was interrupted.</h3><p>Continue from the saved findings to finish checking this degree plan.</p><div class="tw-actions"><button class="tw-button" type="button" data-rebuild-plan>Resume research →</button><button class="tw-button tw-secondary" type="button" data-change-link>Use another degree link</button></div><p class="link-help">Resuming starts a new AI research run. It will not start until you choose Resume research.</p></div>';
    revealResult(); return true;
  }
  function beginProgress(url, startedAt, watchOnly = false, choice = '') {
    stopProgress(); progressURL = url; progressStartedAt = Number(startedAt) || Date.now();
    const referenceChoice = referenceID(choice);
    const generation = progressGeneration;
    $('research-stage-label').textContent = 'Starting your degree research…';
    $('research-stage-detail').textContent = 'We’ll check the college’s requirements and transfer rules before showing your plan. Careful research can take a few minutes. Keep this page open while we build your plan.';
    $('research-progress-counts').textContent = ''; $('research-elapsed').textContent = '';
    try { sessionStorage.setItem(activeStorageKey,JSON.stringify({url,startedAt:progressStartedAt,...(referenceChoice ? {referenceChoice} : {})})); } catch {}
    const tick = async () => {
      if (generation !== progressGeneration) return;
      const elapsed = Math.max(0,Math.floor((Date.now() - progressStartedAt) / 1000));
      $('research-elapsed').textContent = elapsed < 60 ? elapsed + ' seconds elapsed' : Math.floor(elapsed / 60) + ' min ' + String(elapsed % 60).padStart(2,'0') + ' sec elapsed';
      try {
        const response = await readProgress(url);
        if (generation !== progressGeneration) return;
        const item = progressItem(response,referenceChoice);
        if (item && interruptedResearch(item) && showInterrupted(item,url)) return;
        if (item?.progress) updateProgress(item.progress); else if (!referenceChoice && response.progress) updateProgress(response.progress);
        if (queuedResearch(item)) queuedProgress();
        if (watchOnly && item && !pendingResearch(item) && await recoverSavedResult(url,referenceChoice,item)) { stopProgress({finished:true}); setBusy(false); return; }
      } catch { if (watchOnly) $('research-stage-detail').textContent = 'Reconnecting to your saved progress. Keep this page open to check its latest status.'; }
      if (generation === progressGeneration) progressTimer = setTimeout(tick,2500);
    };
    progressTimer = setTimeout(tick,1200);
  }
  function rememberURL(value) { try { sessionStorage.setItem(storageKey, value); } catch {} }
  function signInHTML() { return '<a class="tw-button" href="account.html?returnTo=request-plan.html">Sign in to build my plan →</a>'; }
  function formatMode(value) { return ({online:'Online',campus:'On campus',hybrid:'Hybrid'})[value] || ''; }
  function stateLabel(status, template) { if (queuedResearch(template)) return 'Waiting for research'; return ({queued:'Link saved',researching:'Finding your path',draft:'Saved research',ready:'Reviewed template',failed:'Research needs attention',rejected:'Needs more research'})[status] || 'Saved degree'; }
  function meaningful(value) { return typeof value === 'string' && value.trim() && !/^(?:unconfirmed|unknown|pending)$/i.test(value) ? value.trim() : ''; }
  function degreeName(template, artifact) { return meaningful(artifact?.programName || artifact?.title || template.programName) || 'Your degree'; }
  function degreeSubtitle(template, artifact) { return [meaningful(artifact?.schoolName || artifact?.school || template.schoolName),formatMode(artifact?.modality || template.modality),meaningful(artifact?.catalogYear || artifact?.catalog || template.catalogYear)].filter(Boolean).map(e).join(' · '); }
  function revealResult() {
    $('request-intro').hidden = true; $('request-entry').hidden = true;
    $('request-result').hidden = false; $('request-result').focus();
    $('request-result').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function editLink() {
    operationSequence++; stopProgress(); setBusy(false); selectedReference = null; pendingRecovery = null;
    if (poll) clearTimeout(poll); poll = null;
    try { sessionStorage.removeItem(activeStorageKey); } catch {}
    $('request-intro').hidden = false; $('request-entry').hidden = false; $('request-result').hidden = true;
    notice(''); input.focus(); $('request-entry').scrollIntoView({block:'center',behavior:'smooth'});
  }
  function setBusy(value) {
    busy = value; $('request-submit').disabled = value; input.disabled = value;
    $('request-submit').innerHTML = value ? 'Building your plan…' : 'Build my degree plan <span aria-hidden="true">→</span>';
    $('request-progress').hidden = !value; form.setAttribute('aria-busy',String(value));
  }
  function renderHistory() {
    $('request-history-count').textContent = requests.length ? '(' + requests.length + ')' : '';
    if (!user) { $('request-history').innerHTML = '<p>Sign in to save your degree plans and find them here.</p>' + signInHTML(); return; }
    $('request-history').innerHTML = requests.length ? '<div class="link-history-list">' + requests.map(item => {
      const t = item.template || item, a = W.artifactOf(t);
      return '<article class="tw-item"><div><h3>' + e(degreeName(t,a)) + '</h3><p>' + degreeSubtitle(t,a) + '</p><span class="tw-badge" data-state="' + e(t.status) + '">' + e(stateLabel(t.status,t)) + '</span></div><button class="tw-button tw-secondary" type="button" data-view-request="' + e(item.id) + '">Open plan</button></article>';
    }).join('') + '</div>' : '<p>Your degree plans will appear here. Start with a degree link above.</p>';
  }
  function schedulePoll() {
    if (poll) clearTimeout(poll); poll = null;
    if (requests.some(item => pendingResearch(item))) poll = setTimeout(() => { poll = null; refresh({quiet:true}); },8000);
  }
  async function refresh({quiet = false} = {}) {
    if (loading) return; loading = true;
    try {
      const session = await DegreeAccount.session(true); user = session.user;
      if (!user) { renderHistory(); return; }
      const data = await W.api('/api/templates/requests'); requests = list(data.items); configured = data.configured === true;
      renderHistory(); schedulePoll();
      if (!resumeChecked) { resumeChecked = true; await restoreActiveProgress(); }
      if (pendingResearch(currentTemplate)) {
        const item = requests.find(item => (item.template || item).id === currentTemplate.id), next = item?.template || item;
        if (next && !pendingResearch(next)) {stopProgress({finished:true}); setBusy(false); showResearch(item);}
        else if (next && next.status !== currentTemplate.status) {showResearch(item); if (queuedResearch(next)) queuedProgress();}
      }
    } catch (error) { if (!quiet) notice(error.message,true); } finally { loading = false; }
  }
  function sourceMap(artifact) { return new Map(list(artifact?.sources).filter(s => s && typeof s.id === 'string' && W.safeURL(s.url)).map(s => [s.id,s])); }
  function sourceLink(ids, sources, label = 'Source') {
    const source = list(ids).map(id => sources.get(id)).find(Boolean);
    return source ? '<a href="' + e(W.safeURL(source.url)) + '" target="_blank" rel="noopener noreferrer">' + e(label) + ' ↗</a>' : '';
  }
  function policyFact(artifact, field, sources) {
    const claim = artifact?.policyEvidence?.[field];
    return known(artifact?.[field]) && claim?.value === artifact[field] && list(claim.sourceIds).length && claim.sourceIds.every(id => sources.get(id)?.kind === 'university' && list(sources.get(id)?.roles).includes('policy')) ? {value:artifact[field],sourceIds:claim.sourceIds} : null;
  }
  function observations(artifact, field, sources) {
    return list(artifact?.[field]).filter(item => typeof item?.text === 'string' && item.text.trim() && list(item.sourceIds).length && item.sourceIds.every(id => sources.has(id))).slice(0,4);
  }
  function insightsHTML(artifact, plan) {
    const sources = sourceMap(artifact), transfer = policyFact(plan,'externalMaxCredits',sources), alternative = policyFact(plan,'alternativeMaxCredits',sources), residency = policyFact(plan,'institutionMinCredits',sources);
    const providers = [...new Set(list(plan?.requirements).flatMap(row => list(row.options).filter(option => option.provider !== 'University').map(option => option.provider)))], cards = [];
    if (transfer) cards.push('<article class="link-insight"><h3>College transfer limit</h3><strong class="link-insight-value">' + e(transfer.value) + ' credits</strong><p>Maximum outside credits under the cited policy. ' + sourceLink(transfer.sourceIds,sources) + '</p></article>');
    if (residency) cards.push('<article class="link-insight"><h3>Minimum at this college</h3><strong class="link-insight-value">' + e(residency.value) + ' credits</strong><p>Credits required through the college. ' + sourceLink(residency.sourceIds,sources) + '</p></article>');
    if (providers.length) cards.push('<article class="link-insight"><h3>Outside course sources</h3><strong class="link-insight-value">' + e(providers.length) + ' found</strong><p>' + e(providers.join(', ')) + '</p></article>');
    const pros = observations(artifact,'pros',sources), cons = observations(artifact,'cons',sources);
    const items = values => '<ul>' + values.map(item => '<li>' + e(item.text) + ' ' + sourceLink(item.sourceIds,sources) + '</li>').join('') + '</ul>';
    const alternativeHTML = alternative ? '<p class="link-alternative-limit"><strong>Alternative course credit limit:</strong> ' + e(alternative.value) + ' credits. ' + sourceLink(alternative.sourceIds,sources) + '</p>' : '';
    const focused = ['cost','pace','recognition'].map(field => ({field,claim:artifact?.insights?.[field]})).filter(({field,claim}) => typeof claim?.text === 'string' && list(claim.sourceIds).length && claim.sourceIds.every(id => sources.has(id) && list(sources.get(id).roles).includes(field)));
    const focusedHTML = focused.length ? '<div class="link-observations">' + focused.map(({field,claim}) => '<div><h3>' + ({cost:'Cost',pace:'How fast could it go?',recognition:'Degree recognition'})[field] + '</h3><p>' + e(claim.text) + ' ' + sourceLink(claim.sourceIds,sources) + '</p></div>').join('') + '</div>' : '';
    return (cards.length ? '<div class="link-insights" aria-label="Degree insights">' + cards.join('') + '</div>' : '') + alternativeHTML + focusedHTML + ((pros.length || cons.length) ? '<div class="link-observations">' + (pros.length ? '<div><h3>What could work for you</h3>' + items(pros) + '</div>' : '') + (cons.length ? '<div><h3>What to factor in</h3>' + items(cons) + '</div>' : '') + '</div>' : '');
  }
  function sectionTitle(value) {
    const titles = {general:'General education','general-education':'General education','gen-ed':'General education',major:'Major requirements','major-core':'Major core','major-foundations':'Major foundations',elective:'Electives',electives:'Electives',concentration:'Concentration',support:'Supporting courses',capstone:'Capstone'};
    return titles[value] || String(value || 'Degree requirements').replace(/[-_]/g,' ').replace(/^./,c => c.toUpperCase());
  }
  function planHTML(plan, preview) {
    const rows = list(plan?.requirements); if (!rows.length) return '';
    const proposed = preview?.plan?.validation?.academicCountsValid === true;
    const groups = new Map();
    rows.forEach((row,index) => { const sourceSection = list(plan.curriculumSections).find(section => list(section.requirementIds).includes(row.id) || section.id === row.group); const name = sourceSection?.title || sectionTitle(row.section || row.category); if (!groups.has(name)) groups.set(name,[]); groups.get(name).push({row,index}); });
    const credits = rows.reduce((sum,row) => sum + (known(row.credits) ? row.credits : 0),0);
    const optionLink = option => { const url = W.safeURL(option?.url); return url ? '<a class="link-course-title" href="' + e(url) + '" target="_blank" rel="noopener noreferrer">' + e(option.title || option.code) + ' ↗</a>' : '<span class="link-course-title">' + e(option.title || option.code) + '</span>'; };
    return '<section class="link-sheet" aria-label="Degree course plan"><div class="link-sheet-heading"><h3>Your course plan</h3><p>' + e(credits) + ' of ' + e(known(plan.totalCredits) ? plan.totalCredits : '?') + ' credits outlined · ' + e(rows.length) + ' requirements</p></div>' + (!proposed ? '<p class="link-sheet-candidates">These are supported course options. Open My plan to arrange your route and see any remaining degree checks.</p>' : '') + [...groups].map(([name,group]) => '<details class="link-sheet-section" open><summary><strong>' + e(name) + '</strong><span>' + e(group.reduce((sum,{row}) => sum + (known(row.credits) ? row.credits : 0),0)) + ' credits</span></summary><div class="tw-table-wrap"><table><thead><tr><th scope="col">Degree requirement</th><th scope="col">' + (proposed ? 'Proposed course' : 'Supported course options') + '</th><th scope="col">' + (proposed ? 'Where to take it' : 'Available sources') + '</th><th scope="col">Credits</th></tr></thead><tbody>' + group.map(({row,index}) => {
      const choices = list(row.options), choice = proposed ? (preview.rows?.find(candidate => candidate.requirementId === row.id) || preview.rows?.[index])?.option : null;
      const title = proposed ? (choice ? optionLink(choice) + (choice.code ? '<span class="link-course-note">' + e(choice.code) + '</span>' : '') : '<span class="link-course-pending">Choose an approved course</span>') : (choices.length ? choices.slice(0,3).map(option => '<div class="link-course-choice">' + optionLink(option) + '</div>').join('') + (choices.length > 3 ? '<span class="link-course-note">' + (choices.length - 3) + ' more options in My plan</span>' : '') : '<span class="link-course-pending">Choose an approved course</span>');
      const providers = proposed ? (choice ? [choice.provider] : []) : [...new Set(choices.map(option => option.provider))];
      return '<tr><td><span class="link-course-code">' + e(row.code || 'Requirement') + '</span><span class="link-course-title">' + e(row.title) + '</span></td><td>' + title + '</td><td>' + (providers.length ? providers.map(provider => '<span class="link-course-provider">' + e(provider === 'University' ? 'Your college' : provider) + '</span>').join('<br>') + '<span class="link-course-note">' + (row.requiredAtUniversity || row.institutionalOnly ? 'Required at your college' : choice?.evidence === 'conditional' ? 'Conditions shown in My plan' : 'Sources included in My plan') + '</span>' : '<span class="link-course-pending">Course choice pending</span>') + '</td><td>' + e(known(row.credits) ? row.credits : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div></details>').join('') + '</section>';
  }
  function sourceHTML(artifact) {
    const sources = list(artifact?.sources).filter(s => W.safeURL(s?.url));
    return sources.length ? '<details class="link-sources"><summary>Sources behind this plan (' + sources.length + ')</summary><ul>' + W.sourceHTML(sources) + '</ul></details>' : '';
  }
  function issueDetails(issues) {
    return issues.length ? '<details class="link-gap-details"><summary>Research DegreeSteps still needs to complete</summary><p>These are gaps in our source research, not tasks for you to investigate.</p><ul>' + issues.slice(0,10).map(issue => '<li>' + e(issue) + '</li>').join('') + '</ul></details>' : '';
  }
  function showResearch(item, publicMode = false) {
    const template = item.template || item, artifact = W.artifactOf(template), ready = template.status === 'ready';
    currentTemplate = template; currentPublic = publicMode; currentChoices = []; currentSourcePlan = null;
    rememberReference(template.url || input.value.trim(),template.referenceChoice);
    const plan = ready ? artifact : template.planArtifact || null, reliable = ready || template.qualityReady === true;
    const issues = studentIssues(template,plan), hasRows = list(plan?.requirements).length > 0;
    const waiting = pendingResearch(template), queued = queuedResearch(template);
    const canContinue = !waiting && !ready && !reliable && configured && ['queued','draft','failed','rejected'].includes(template.status);
    let body = '<div class="link-result-head"><div><span class="tw-badge" data-state="' + e(reliable ? 'ready' : template.status) + '">' + (ready ? 'Reviewed degree plan' : reliable ? 'AI-researched plan' : 'Saved research') + '</span><h2>' + e(degreeName(template,plan || artifact)) + '</h2><p class="link-result-school">' + degreeSubtitle(template,plan || artifact) + '</p></div><button type="button" class="tw-button tw-secondary" data-change-link>Try another degree</button></div>';
    if (waiting) {
      body += queued ? '<div class="link-ready-message"><h3>Your degree research is queued.</h3><p>Your request is saved and will begin when a research slot is available. You can leave this page and return to its saved progress. You do not need to submit it again.</p><div class="tw-actions"><button class="tw-button tw-secondary" type="button" data-refresh-result>Check saved progress</button><button class="tw-button tw-secondary" type="button" data-change-link>Use another link</button></div></div>' : '<div class="link-ready-message"><h3>We’re still checking this plan.</h3><p>Careful research can take a few minutes. Your link and saved findings remain available if you leave and return.</p><div class="tw-actions"><button class="tw-button tw-secondary" type="button" data-refresh-result>Check saved progress</button><button class="tw-button tw-secondary" type="button" data-change-link>Use another link</button></div></div>';
    } else if (!reliable || !artifact) {
      body += '<div class="link-unfinished"><h3>This route needs more research.</h3><p>Your link is saved. DegreeSteps has not finished establishing the requirements and transfer choices for this route.</p><div class="tw-actions">' + (canContinue ? '<button type="button" class="tw-button" data-rebuild-plan>Continue building this plan →</button>' : '') + '<button class="tw-button tw-secondary" type="button" data-change-link>Use another degree link</button></div>' + (canContinue ? '<p class="link-help">Continues the source checks with a new AI research run.</p>' : '<p class="link-help">You can also <a href="programs.html">choose an available degree plan</a>.</p>') + '</div>';
      body += issueDetails(issues);
      if (hasRows) body += '<details class="link-findings"><summary>See the requirements found so far (' + e(list(plan.requirements).length) + ')</summary>' + planHTML(plan,null) + sourceHTML(plan) + '</details>';
    } else {
      body += '<p class="link-result-lead">Your course plan is ready to open. Use your saved courses, adjust the route, and track your progress in My plan.</p><div class="link-result-callout"><div><strong>Make this degree plan yours.</strong><p>Your saved courses come with you.</p></div>' + (ready ? '<label class="link-result-consent"><input type="checkbox" data-review-template>I reviewed the proposed degree requirements.</label>' : '') + '<button class="tw-button" type="button" data-open-plan' + (ready ? ' disabled' : '') + '>Open my degree plan →</button></div>';
      body += insightsHTML(plan || {},plan);
      const reminders = issues.length ? issues : ['Send official transcripts for your completed courses so the college can apply credit to your own record.'];
      body += '<div class="link-student-notes"><h3>' + (issues.length ? 'Research notes' : 'Your records') + '</h3><ul>' + reminders.slice(0,3).map(issue => '<li>' + e(issue) + '</li>').join('') + '</ul></div>';
      if (issues.length > 3) body += issueDetails(issues.slice(3));
      if (hasRows) { let preview = null; try { if (typeof W.previewResearchPlan === 'function') preview = W.previewResearchPlan(template); } catch {} body += planHTML(plan,preview); }
      body += sourceHTML(plan || artifact);
    }
    $('request-result').innerHTML = body; revealResult();
  }
  function showSourcePlan(sourcePlan, existing) {
    let preview = null; try { preview = W.previewSourcePlan(sourcePlan); } catch {}
    if (!preview?.model || preview.plan?.validation?.academicCountsValid !== true) throw Error('This degree plan still needs a complete course check. Please try another degree link.');
    currentSourcePlan = sourcePlan; currentTemplate = null; currentChoices = [];
    const model = preview.model, summary = sourcePlan.summary || {}, total = known(preview.totalCredits) ? preview.totalCredits : model.totalCredits;
    const transfer = known(preview.transferCredits) ? preview.transferCredits : preview.plan.totals?.external;
    const university = known(preview.universityCredits) ? preview.universityCredits : preview.plan.totals?.institutional;
    const mode = model.format === 'Online' ? 'Online' : model.format === 'Residential' ? 'On campus' : formatMode(sourcePlan.route?.modalities?.length === 1 ? sourcePlan.route.modalities[0] : '');
    const providers = [...new Set(list(preview.rows).map(row => row.option?.provider).filter(provider => provider && provider !== 'University'))];
    $('request-result').innerHTML = '<div class="link-result-head"><div><span class="tw-badge" data-state="ready">Source-checked degree plan</span><h2>' + e(model.title) + '</h2><p class="link-result-school">' + [model.school,mode,model.catalog || model.catalogYear].filter(Boolean).map(e).join(' · ') + '</p></div><button class="tw-button tw-secondary" type="button" data-change-link>Try another degree</button></div><p class="link-result-lead">This degree already has a complete course plan. The route below uses its transfer, major, and college-credit requirements.</p><div class="link-result-callout"><div><strong>Your full course plan is ready.</strong><p>Open it with your saved courses and progress.</p></div><button class="tw-button" type="button" data-open-source-plan>Open my degree plan →</button></div><div class="link-insights" aria-label="Proposed degree route"><article class="link-insight"><h3>Degree total</h3><strong class="link-insight-value">' + e(total) + ' credits</strong><p>' + e(list(model.requirements).length) + ' requirements in this plan.</p></article><article class="link-insight"><h3>Planned transfer courses</h3><strong class="link-insight-value">' + e(known(transfer) ? transfer : 0) + ' credits</strong><p>' + e(providers.join(', ') || 'No outside courses selected.') + '</p></article><article class="link-insight"><h3>At the college</h3><strong class="link-insight-value">' + e(known(university) ? university : 0) + ' credits</strong><p>Includes the college coursework required by this route.</p></article></div><div class="link-student-notes"><h3>Your next steps</h3><ul><li>Add courses you have already taken so your plan avoids repeats.</li><li>Open your next course and track your progress. Send official transcripts as you finish transfer courses.</li></ul></div>' + planHTML(model,preview) + sourceHTML(model);
    revealResult();
  }
  function showExisting(existing) {
    currentTemplate = null; currentChoices = []; currentSourcePlan = null;
    const query = new URLSearchParams();
    if (existing.pathwayId) query.set('program',existing.pathwayId);
    if (existing.school || existing.schoolName) query.set('school',existing.school || existing.schoolName);
    if (existing.level) query.set('level',existing.level);
    if (existing.modality) query.set('format',existing.modality);
    const href = 'portal.html?' + query.toString();
    $('request-result').innerHTML = '<div class="link-ready-message"><span class="tw-badge" data-state="ready">Plan found</span><h2>' + e(existing.title || existing.programName || 'Your degree plan is ready.') + '</h2><p class="link-result-school">' + e(existing.school || existing.schoolName || '') + '</p><p class="link-result-lead">This degree already has an available course plan. Open it with your saved courses and start making it yours.</p><div class="tw-actions"><a class="tw-button" href="' + e(href) + '">Open my degree plan →</a><button class="tw-button tw-secondary" type="button" data-change-link>Try another degree</button></div></div>';
    revealResult();
  }
  function showChoices(choices) {
    currentChoices = choices; currentTemplate = null; currentSourcePlan = null;
    selectedReference = null;
    $('request-result').innerHTML = '<div class="link-result-head"><div><span class="tw-badge">One quick choice</span><h2>Which version of this degree?</h2><p class="link-result-school">This link includes more than one option. Pick the one you want to plan for.</p></div><button class="tw-button tw-secondary" type="button" data-change-link>Change link</button></div><div class="link-choice-list">' + choices.map((choice,index) => '<button type="button" class="link-choice" data-choose-target="' + index + '"><span><strong>' + e(choice.label || choice.programName || choice.title || 'Degree option') + '</strong><small>' + [choice.label ? choice.programName || choice.title : '',choice.schoolName || choice.school,formatMode(choice.modality),choice.catalogYear].filter(Boolean).map(e).join(' · ') + '</small></span><span aria-hidden="true">→</span></button>').join('') + '</div>';
    revealResult();
  }
  function displayResponse(data) {
    pendingRecovery = null;
    configured = data.configured === true;
    if (data.sourcePlan) { notice(''); showSourcePlan(data.sourcePlan,data.existingPlan || {}); }
    else if (data.existingPlan) { notice(''); showExisting(data.existingPlan); }
    else if (data.needsChoice || list(data.choices).length) { notice(''); showChoices(list(data.choices)); }
    else if (data.template || data.request?.template) {
      const template = responseTemplate(data);
      const item = data.request ? {...data.request,template} : {id:template.id,template};
      requests = [item,...requests.filter(previous => (previous.template || previous).id !== template.id)];
      notice(''); renderHistory(); showResearch({template}); schedulePoll();
    } else throw Error('We could not identify a degree from this link. Try its specific degree or catalog page.');
  }
  async function recoverSavedResult(url, referenceChoice = '', knownItem = null, operation = operationSequence, generation = progressGeneration) {
    try {
      const item = knownItem || progressItem(await readProgress(url),referenceChoice);
      if (!recoveryCurrent(operation,generation)) return false;
      if (!item || pendingResearch(item)) return false;
      const data = await W.api('/api/templates/requests'), saved = list(data.items).find(row => (row.template || row).id === item.templateId);
      if (!recoveryCurrent(operation,generation)) return false;
      if (!saved) return false;
      requests = list(data.items); configured = data.configured === true; pendingRecovery = null; notice(''); renderHistory(); schedulePoll(); showResearch(saved); return true;
    } catch { return false; }
  }
  function recoveryCurrent(operation, generation) { return operation === operationSequence && generation === progressGeneration; }
  function connectionFailure(error) { return ['RESEARCH_CONNECTION_INTERRUPTED','NETWORK_UNAVAILABLE'].includes(error?.code) || error?.name === 'TypeError' || /^(?:load failed|failed to fetch|network request failed|networkerror.*)$/i.test(error?.message || ''); }
  function showConnectionCheck(url, referenceChoice, startedAt, signIn = false) {
    stopProgress(); setBusy(false); rememberReference(url,referenceChoice); pendingRecovery = {url,referenceChoice,startedAt};
    $('request-result').innerHTML = '<div class="link-result-head"><div><span class="tw-badge">Your degree link is saved</span><h2>Let’s check your saved research.</h2></div><button type="button" class="tw-button tw-secondary" data-change-link>Use another degree link</button></div><div class="link-unfinished"><p>The connection was interrupted before we could show your result. Check saved progress before starting again.</p><div class="tw-actions">' + (signIn ? signInHTML() : '<button type="button" class="tw-button" data-check-saved-progress>Check saved progress →</button>') + '</div><p class="link-help">Checking progress does not start another AI research run. Your link and saved findings will be here when you return.</p></div>';
    notice(''); revealResult();
  }
  function watchSavedResearch(item, url, referenceChoice, startedAt) {
    pendingRecovery = null; notice('');
    showResearch({template:{...item,id:item.templateId || item.id,url,referenceChoice:referenceChoice || item.referenceChoice}});
    setBusy(true); beginProgress(url,startedAt,true,referenceChoice); updateProgress(item.progress);
    if (queuedResearch(item)) queuedProgress();
    else $('research-stage-detail').textContent = 'Checking your saved research. Keep this page open while we find its latest status.';
  }
  async function recoverDisconnected(url, referenceChoice, startedAt, operation = operationSequence) {
    const generation = progressGeneration;
    try {
      const status = await readProgress(url), item = progressItem(status,referenceChoice);
      if (!recoveryCurrent(operation,generation)) return false;
      if (status.configured !== undefined) configured = status.configured === true;
      if (item) {
        if (interruptedResearch(item) && showInterrupted(item,url)) { pendingRecovery = null; return false; }
        if (pendingResearch(item)) { watchSavedResearch(item,url,referenceChoice,startedAt); return true; }
        const recovered = await recoverSavedResult(url,referenceChoice,item,operation,generation);
        if (!recoveryCurrent(operation,generation)) return false;
        if (recovered) { stopProgress({finished:true}); return false; }
      }
      showConnectionCheck(url,referenceChoice,startedAt);
    } catch (error) { if (recoveryCurrent(operation,generation)) showConnectionCheck(url,referenceChoice,startedAt,error.status === 401); }
    return false;
  }
  function receiveResearchResponse(data, url, referenceChoice, startedAt) {
    const template = responseTemplate(data);
    if (!data.sourcePlan && !data.existingPlan && !data.needsChoice && pendingResearch(template)) {
      displayResponse(data); watchSavedResearch(template,url,referenceChoice || referenceID(template.referenceChoice),startedAt); return true;
    }
    stopProgress({finished:true}); displayResponse(data); return false;
  }
  async function restoreActiveProgress() {
    const operation = operationSequence, generation = progressGeneration;
    let saved; try { saved = JSON.parse(sessionStorage.getItem(activeStorageKey) || 'null'); } catch { return; }
    if (!saved || typeof saved.url !== 'string' || !W.safeURL(saved.url)) return;
    if(explicitEntry&&(!entryURL||W.safeURL(saved.url)!==W.safeURL(entryURL)))return;
    const referenceChoice = referenceID(saved.referenceChoice);
    rememberReference(saved.url,referenceChoice);
    input.value = saved.url; rememberURL(saved.url);
    if (saved.waitingToStart === true) return;
    try {
      const data = await readProgress(saved.url), item = progressItem(data,referenceChoice);
      if (!recoveryCurrent(operation,generation)) return;
      if (!item) { showConnectionCheck(saved.url,referenceChoice,saved.startedAt); return; }
      if (interruptedResearch(item) && showInterrupted(item,saved.url)) return;
      if (!pendingResearch(item)) { const recovered = await recoverSavedResult(saved.url,referenceChoice,item,operation,generation); if (!recoveryCurrent(operation,generation)) return; if (recovered) stopProgress({finished:true}); else showConnectionCheck(saved.url,referenceChoice,saved.startedAt); return; }
      watchSavedResearch(item,saved.url,referenceChoice,saved.startedAt);
      if (queuedResearch(item)) queuedProgress();
      else $('research-stage-detail').textContent = 'Checking the saved progress for this degree. If research was interrupted, you can continue from the saved result.';
    } catch (error) { if (recoveryCurrent(operation,generation)) showConnectionCheck(saved.url,referenceChoice,saved.startedAt,error.status === 401); }
  }
  async function submitTarget(target) {
    if (busy) return;
    const operation = ++operationSequence;
    const url = typeof target.url === 'string' ? target.url.trim() : '';
    if(requestContext){try{sessionStorage.setItem(contextStorageKey,JSON.stringify({...requestContext,url}));}catch{}}
    const referenceChoice = referenceID(target.referenceChoice);
    let watching = false;
    rememberReference(url,referenceChoice,true); input.value = url;
    rememberURL(url); notice(''); setBusy(true); $('request-account-note').innerHTML = '';
    try {
      const session = await DegreeAccount.session(true); user = session.user;
      if (!user) { notice('Sign in to build and save your plan. Your degree link will be here when you return.'); $('request-account-note').innerHTML = signInHTML(); return; }
      beginProgress(url,undefined,false,referenceChoice);
      const contextDetails=requestContext?['Starting preference: '+(requestContext.format==='campus'?'on-campus study':requestContext.format==='online'?'online study':'the selected study format'),requestContext.school?'College of interest: '+requestContext.school:'',requestContext.campus?'Campus of interest: '+requestContext.campus:'','Use the official degree page and explicitly selected version to establish the actual program.'].filter(Boolean).join('. '):'';
      const details=[typeof target.details==='string'?target.details:'',contextDetails].filter(Boolean).join('\n').slice(0,4000);
      const body = referenceChoice ? {url,referenceChoice,startResearch:true,...(details?{details}:{})} : {...target,url,startResearch:true,...(details?{details}:{})};
      const data = await W.api('/api/templates/requests',{method:'POST',body});
      if (operation !== operationSequence) return;
      watching = receiveResearchResponse(data,url,referenceChoice,progressStartedAt);
      try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem('degreepath-research-form-v1'); } catch {}
    } catch (error) {
      if (operation !== operationSequence) return;
      if (error.status === 401) { rememberReference(url,referenceChoice,true); notice('Sign in to continue. Your degree link is saved.'); $('request-account-note').innerHTML = signInHTML(); }
      else if (connectionFailure(error)) watching = await recoverDisconnected(url,referenceChoice,progressStartedAt);
      else if (!await recoverSavedResult(url,referenceChoice)) notice(error.message || 'Research was interrupted. Your link and saved findings are still here. Continue when you are ready.',true);
    } finally { if (operation === operationSequence && !watching) { stopProgress(); setBusy(false); } }
  }
  form.addEventListener('submit',event => { event.preventDefault(); if (busy || !form.reportValidity()) return; const url = input.value.trim(), referenceChoice = selectedReferenceFor(url); submitTarget({url,...(referenceChoice ? {referenceChoice} : {})}); });
  $('request-history').addEventListener('click',event => {
    const button = event.target.closest('[data-view-request]'); if (!button) return;
    const item = requests.find(item => item.id === button.dataset.viewRequest); if (!item) return; const template = item.template || item;
    operationSequence++; stopProgress(); setBusy(false); pendingRecovery = null;
    if (template.status !== 'ready' && template.qualityReady !== true && !pendingResearch(template) && template.url) submitTarget({url:template.url,...(referenceID(template.referenceChoice) ? {referenceChoice:template.referenceChoice} : {})});
    else if (pendingResearch(template)) watchSavedResearch(template,template.url || input.value.trim(),referenceID(template.referenceChoice),template.researchJob?.queuedAt || Date.now());
    else showResearch(item);
  });
  $('request-result').addEventListener('change',event => {
    if (!event.target.matches('[data-review-template]')) return;
    const button = $('request-result').querySelector('[data-open-plan]'); if (button) button.disabled = !event.target.checked;
  });
  $('request-result').addEventListener('click',async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-change-link')) return editLink();
    if (button.hasAttribute('data-refresh-result')) return refresh();
    if (button.hasAttribute('data-check-saved-progress') && pendingRecovery) {
      const recovery = pendingRecovery, operation = ++operationSequence; button.disabled = true;
      await recoverDisconnected(recovery.url,recovery.referenceChoice,recovery.startedAt,operation); return;
    }
    if (button.hasAttribute('data-rebuild-plan') && currentTemplate) {
      if (busy) return;
      const operation = ++operationSequence;
      const template = currentTemplate, savedURL = template.url || input.value.trim();
      let watching = false;
      rememberReference(savedURL,template.referenceChoice); rememberURL(savedURL); input.value = savedURL; notice(''); setBusy(true); beginProgress(savedURL,undefined,false,template.referenceChoice); button.disabled = true; $('request-result').hidden = true;
      $('request-progress').scrollIntoView({block:'center',behavior:'smooth'});
      try {
        const data = await W.api('/api/templates/requests/' + encodeURIComponent(template.id) + '/research',{method:'POST',body:{revision:template.revision}});
        if (operation !== operationSequence) return;
        watching = receiveResearchResponse(data,savedURL,referenceID(template.referenceChoice),progressStartedAt);
      } catch (error) { if (operation === operationSequence) { if (connectionFailure(error)) watching = await recoverDisconnected(savedURL,referenceID(template.referenceChoice),progressStartedAt); else { notice(error.message || 'New research could not start. Your saved result is unchanged.',true); $('request-result').hidden = false; button.disabled = false; } } }
      finally { if (operation === operationSequence && !watching) { stopProgress(); setBusy(false); } }
      return;
    }
    if (button.dataset.chooseTarget !== undefined) {
      const choice = currentChoices[Number(button.dataset.chooseTarget)]; if (!choice) return;
      button.disabled = true;
      const target = referenceID(choice.referenceChoice) ? {url:choice.url,referenceChoice:choice.referenceChoice} : Object.fromEntries(['schoolName','programName','level','modality','catalogYear','url'].filter(key => typeof choice[key] === 'string').map(key => [key,choice[key]]));
      if (!target.url) target.url = input.value.trim();
      await submitTarget(target); button.disabled = false; return;
    }
    if (button.hasAttribute('data-open-builder') && currentTemplate) {
      button.disabled = true; try { W.openBuilder(currentTemplate); } catch (error) { notice(error.message,true); button.disabled = false; } return;
    }
    if (button.hasAttribute('data-open-source-plan') && currentSourcePlan) {
      button.disabled = true; const label = button.textContent; button.textContent = 'Opening your plan…';
      try { await W.openSourcePlan(currentSourcePlan); } catch (error) { notice(error.message,true); button.disabled = false; button.textContent = label; }
      return;
    }
    if (!button.hasAttribute('data-open-plan') || !currentTemplate) return;
    button.disabled = true; const label = button.textContent; button.textContent = 'Opening your plan…';
    try {
      if (currentTemplate.status === 'ready') {
        const reviewed = $('request-result').querySelector('[data-review-template]')?.checked === true;
        if (!reviewed) throw Error('Review the proposed degree requirements before using this template.');
        await W.openReviewedTemplate(currentTemplate,{reviewedByStudent:true});
      } else await W.openResearchPlan(currentTemplate);
    } catch (error) { notice(error.message,true); button.disabled = false; button.textContent = label; }
  });
  $('refresh-requests').addEventListener('click',() => refresh());
  try {
    const saved = sessionStorage.getItem(storageKey); if (saved && saved.length <= 1500) input.value = saved;
    else { const old = JSON.parse(sessionStorage.getItem('degreepath-research-form-v1') || 'null'); if (typeof old?.url === 'string') input.value = old.url.slice(0,1500); }
  } catch {}
  try {
    const saved = JSON.parse(sessionStorage.getItem(activeStorageKey) || 'null');
    if (typeof saved?.url === 'string' && W.safeURL(saved.url)) rememberReference(saved.url,saved.referenceChoice);
  } catch {}
  const params = new URLSearchParams(location.search), source = params.get('source') || params.get('url');
  explicitEntry=Boolean(source||params.has('school')||params.has('format')||params.has('campus'));entryURL=source||'';
  if (source) input.value = source.slice(0,1500);
  const contextSchool=(params.get('school')||'').trim(),contextFormat=params.get('format'),contextCampus=(params.get('campus')||'').trim();
  const campusLabel=contextCampus.length<=160&&!/[\u0000-\u001f\u007f]/.test(contextCampus)?contextCampus:'';
  if(contextSchool&&contextSchool.length<=120&&!/[\u0000-\u001f\u007f]/.test(contextSchool)||['campus','online'].includes(contextFormat)||campusLabel){
    requestContext={school:contextSchool.length<=120&&!/[\u0000-\u001f\u007f]/.test(contextSchool)?contextSchool:'',format:['campus','online'].includes(contextFormat)?contextFormat:'',...(campusLabel?{campus:campusLabel}:{}),createdAt:Date.now()};
    if(!source)input.value='';
  }else{try{const raw=sessionStorage.getItem(contextStorageKey)||'null',saved=raw.length<=4096?JSON.parse(raw):null;if(saved&&typeof saved.school==='string'&&saved.school.length<=120&&!/[\u0000-\u001f\u007f]/.test(saved.school)&&(saved.campus===undefined||typeof saved.campus==='string'&&saved.campus.length<=160&&!/[\u0000-\u001f\u007f]/.test(saved.campus))&&['','campus','online'].includes(saved.format)&&typeof saved.url==='string'&&saved.url===input.value.trim()&&typeof saved.createdAt==='number'&&saved.createdAt<=Date.now()&&Date.now()-saved.createdAt<3600000)requestContext=saved;}catch{}}
  if(requestContext){const node=$('request-context');if(node){node.hidden=false;node.textContent=(requestContext.format==='campus'?'On-campus degree':requestContext.format==='online'?'Online degree':'Degree research')+(requestContext.school?' at '+requestContext.school:'')+(requestContext.campus?' — '+requestContext.campus:'')+'. Paste the link to the specific degree you want.';}}
  input.addEventListener('input',() => rememberURL(input.value));
  const publicId = params.get('template');
  if (publicId) {
    $('request-entry').hidden = true; $('request-intro').hidden = true; $('request-history-panel').hidden = true;
    W.api('/api/templates/' + encodeURIComponent(publicId)).then(data => {
      if (data.template?.status !== 'ready') throw Error('This template is being reviewed. Choose an available plan or try its official degree link.');
      showResearch({template:data.template},true);
    }).catch(error => { notice(error.message,true); $('request-result').innerHTML = '<div class="tw-actions"><a class="tw-button" href="programs.html">Explore available plans</a><button class="tw-button tw-secondary" type="button" data-change-link>Try a degree link</button></div>'; revealResult(); });
  } else refresh();
  window.addEventListener('beforeunload',() => { stopProgress(); if (poll) clearTimeout(poll); });
}());
