/* Public, catalog-specific school outcomes. Private planner state is never read. */
(function (root, factory) {
  const client = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = client;
  if (root) root.DegreeEvidence = client;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const summaries = new Map(), programs = new Map();
  const statuses = {
    'community-verified': 'Community verified',
    'student-reported': 'Student reported',
    mixed: 'Mixed outcomes',
    outdated: 'Older reports',
    unreported: 'No reports yet'
  };
  const labels = {
    course: { success: 'Accepted as planned', changed: 'Accepted differently', rejected: 'Not accepted' },
    plan: { success: 'Completed as posted', changed: 'Completed with changes', rejected: 'Could not complete' }
  };
  const defaultDisclaimer = 'Community outcomes are specific to the catalog and course placement or exact published plan shown. They do not guarantee school acceptance.';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const community = () => { if (!root.DegreeCommunity) throw new Error('The community service is not available. Reload and try again.'); return root.DegreeCommunity; };
  const today = () => new Date().toISOString().slice(0, 10);
  let revision = 0, restoreFocus = null, restoreSelector = '';

  function catalogYear(value) {
    value = clean(value).replace(/[–—]/g, '-');
    if (/^(?:19|20|21)\d{2}(?:0[1-9]|1[0-2])$/.test(value)) return value;
    const match = /^(19\d{2}|20\d{2}|21\d{2})(?:-(19\d{2}|20\d{2}|21\d{2}))?$/.exec(value);
    return match && (!match[2] || Number(match[2]) === Number(match[1]) + 1) ? value : '';
  }
  function normalizeTarget(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a course placement or published plan first.');
    const kind = input.kind, year = catalogYear(input.catalogYear);
    if (!['course', 'plan'].includes(kind) || !year) throw new Error('Choose the exact catalog year or version for this outcome.');
    const target = { kind };
    for (const key of kind === 'course' ? ['programId', 'requirementId', 'courseId'] : ['postId']) {
      const value = clean(input[key]);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)) throw new Error('This evidence target is incomplete. Reload the plan and try again.');
      target[key] = value;
    }
    target.catalogYear = year;
    return target;
  }
  const keyFor = target => JSON.stringify(normalizeTarget(target));
  const queryFor = target => Object.entries(normalizeTarget(target)).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
  const programKey = (id, year) => clean(id) + '|' + catalogYear(year);
  function getSummary(target) { try { return summaries.get(keyFor(target)) || null; } catch (_) { return null; } }
  function badgeHTML(summary, options) {
    options = options || {};
    summary = summary || {};
    const status = Object.hasOwn(statuses, summary.status) ? summary.status : 'unreported';
    const total = count(summary.reportCount), text = statuses[status] + (total ? ' · ' + total + ' report' + (total === 1 ? '' : 's') : '');
    const help = status === 'community-verified'
      ? 'At least two different member accounts have recent, moderator-reviewed successful outcomes with public proof for this exact scope and catalog, with no unresolved recent conflict. School acceptance is not guaranteed.'
      : 'Read the dated student outcomes for this exact scope and catalog. School acceptance is not guaranteed.';
    const tag = options.button ? 'button' : 'span';
    return '<' + tag + (options.button ? ' type="button"' : '') + ' class="evidence-badge evidence-' + status + '" title="' + esc(help) + '"' + (options.button ? ' aria-label="' + esc(text + '. View school outcomes') + '"' : '') + '>' + esc(text) + '</' + tag + '>';
  }
  async function loadProgram(programId, year, refresh) {
    const target = normalizeTarget({ kind: 'course', programId, requirementId: 'summary', courseId: 'summary', catalogYear: year });
    const key = programKey(target.programId, target.catalogYear);
    if (!refresh && programs.has(key)) return programs.get(key);
    const pending = community().api('/evidence/summary?programId=' + encodeURIComponent(target.programId) + '&catalogYear=' + encodeURIComponent(target.catalogYear)).then(data => {
      if (programs.get(key) !== pending) return data;
      for (const [cachedKey] of summaries) {
        const cached = JSON.parse(cachedKey);
        if (cached.kind === 'course' && cached.programId === target.programId && cached.catalogYear === target.catalogYear) summaries.delete(cachedKey);
      }
      for (const item of data.items || []) {
        try {
          const actual = normalizeTarget(item.target);
          if (actual.kind === 'course' && actual.programId === target.programId && actual.catalogYear === target.catalogYear) summaries.set(keyFor(actual), item.summary);
        } catch (_) { /* Ignore malformed or unrelated summaries. */ }
      }
      return data;
    }).catch(error => { if (programs.get(key) === pending) programs.delete(key); throw error; });
    programs.set(key, pending);
    return pending;
  }
  function reportPayload(target, values) {
    values = values || {};
    const result = { target: normalizeTarget(target), outcome: values.outcome, evaluatedOn: clean(values.evaluatedOn), details: clean(values.details), consent: values.consent === true };
    if (!Object.hasOwn(labels[result.target.kind], result.outcome)) throw new Error('Choose the school outcome.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.evaluatedOn) || !Number.isFinite(Date.parse(result.evaluatedOn + 'T12:00:00Z')) || new Date(result.evaluatedOn + 'T12:00:00Z').toISOString().slice(0, 10) !== result.evaluatedOn || result.evaluatedOn < '1900-01-01' || result.evaluatedOn > today()) throw new Error('Enter the actual school evaluation or degree conferral date, no later than today.');
    if (!result.details || result.details.length > 1000) throw new Error('Describe the school outcome in 1–1,000 characters.');
    if (!result.consent) throw new Error('Confirm that this is your own school outcome and that you consent to publishing the redacted report.');
    if (clean(values.evidenceUrl)) {
      const href = community().safeLink(clean(values.evidenceUrl));
      if (!href) throw new Error('Use a complete public http:// or https:// proof link without credentials.');
      result.evidenceUrl = href;
    }
    return result;
  }
  function errorHTML(error) {
    return '<p class="evidence-error" role="alert">' + esc(error && error.message || error) + '</p>' + (error && error.status === 401 ? community().signinLink('Sign in to report an outcome') : '');
  }
  function displayDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(value))) return 'Date unavailable';
    const d = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Date unavailable';
  }
  function drawer(title) {
    const doc = root.document;
    let dialog = doc.getElementById('evidence-dialog');
    if(!dialog?.open){
      restoreFocus=doc.activeElement;restoreSelector='';
      const row=restoreFocus?.dataset?.outcomeRow,post=restoreFocus?.dataset?.planOutcomes;
      if(row&&/^[A-Za-z0-9_-]+$/.test(row))restoreSelector='[data-requirement="'+row+'"] [data-row]';
      else if(post&&/^[A-Za-z0-9_-]+$/.test(post))restoreSelector='[data-post-id="'+post+'"] [data-open-post]';
    }
    doc.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
    if (!dialog) {
      dialog = doc.createElement('dialog');
      dialog.id = 'evidence-dialog';
      dialog.className = 'evidence-drawer';
      dialog.setAttribute('aria-labelledby', 'evidence-heading');
      dialog.innerHTML = '<div class="evidence-topline"><span>COMMUNITY OUTCOMES</span><button type="button" class="evidence-close" aria-label="Close school outcomes">×</button></div><div id="evidence-content"></div>';
      doc.body.appendChild(dialog);
      dialog.querySelector('.evidence-close').onclick = () => dialog.close();
      dialog.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const controls=Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')).filter(node=>node.getClientRects().length&&node.tabIndex>=0);
        const first=controls[0],last=controls.at(-1),active=doc.activeElement;
        if(!first){event.preventDefault();dialog.focus();return;}
        if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
      });
      dialog.addEventListener('close', () => {
        if(dialog.open)return;
        revision++;
        const hidden=restoreFocus?.closest?.('dialog')?.open===false;
        const focus=restoreFocus?.isConnected&&!hidden?restoreFocus:restoreSelector&&doc.querySelector?.(restoreSelector)||doc.getElementById('sheet-grid')||doc.getElementById('community-app');
        focus?.focus?.({preventScroll:true});
      });
    }
    const content = dialog.querySelector('#evidence-content');
    content.innerHTML = '<h2 id="evidence-heading">' + esc(title) + '</h2><p role="status">Loading school outcomes…</p>';
    if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }
    return { dialog, content };
  }
  function yearOptions(year,locked) {
    if(locked)return '<option value="'+esc(year)+'" selected>'+esc(year)+'</option>';
    const current = new Date().getUTCFullYear(), years = new Set([year]);
    if (/^\d{6}$/.test(year)) {
      const date=new Date(),monthIndex=date.getUTCFullYear()*12+date.getUTCMonth();
      for(let offset=1;offset>=-24;offset--){const index=monthIndex+offset,value=String(Math.floor(index/12))+String(index%12+1).padStart(2,'0');if(catalogYear(value))years.add(value);}
    } else for (let start = current + 1; start >= current - 12; start--) years.add(start + '-' + (start + 1));
    return [...years].sort().reverse().map(value => '<option value="' + esc(value) + '"' + (value === year ? ' selected' : '') + '>' + esc(value) + '</option>').join('');
  }
  function chooseCatalog(input,options) {
    options=options||{};
    const target=normalizeTarget(Object.assign({},input,{catalogYear:'2000'}));delete target.catalogYear;
    const modal=drawer('Choose the catalog'),ticket=++revision;
    modal.content.innerHTML='<h2 id="evidence-heading">Which catalog did the school use?</h2><p>This shared plan does not record a catalog. Choose the exact year or version from the school’s evaluation to view or report outcomes.</p><form class="evidence-catalog-form"><label class="evidence-field"><span>Catalog year or version</span><input name="catalogYear" required maxlength="9" placeholder="2026-2027 or 202605"></label><button type="submit" class="button">View outcomes</button><div class="evidence-catalog-status" role="status"></div></form>';
    const form=modal.content.querySelector('.evidence-catalog-form');
    form.onsubmit=event=>{event.preventDefault();if(ticket!==revision||!modal.dialog.open)return;const year=catalogYear(form.elements.catalogYear.value);if(!year){form.querySelector('.evidence-catalog-status').textContent='Use the exact catalog year or version, such as 2026-2027 or 202605.';return;}if(form.reportValidity())open(Object.assign({},target,{catalogYear:year}),options);};
    return modal;
  }
  function reportHTML(item, kind, moderation) {
    const alias = item.author && item.author.alias || 'Community member', href = community().safeLink(item.evidenceUrl);
    const reviewLabel = item.reviewStatus === 'reviewed' ? 'Moderator reviewed' : item.reviewStatus === 'dismissed' ? 'Dismissed from badge' : 'Awaiting moderator review';
    return '<article class="evidence-report" data-evidence-id="' + esc(item.id) + '"><div class="evidence-report-top"><strong>' + esc(labels[kind] && labels[kind][item.outcome] || 'School outcome') + '</strong><span>' + esc(reviewLabel) + '</span></div><p class="evidence-byline">' + esc(alias) + (item.author && item.author.isYou ? ' · You' : '') + ' · <time datetime="' + esc(item.evaluatedOn) + '">' + esc(displayDate(item.evaluatedOn)) + '</time></p><p class="evidence-details">' + esc(item.details) + '</p><p class="evidence-proof">' + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">View public proof ↗</a>' : 'No public proof link supplied') + '</p>' + (moderation ? '<p class="evidence-scope">' + esc(item.target && item.target.catalogYear) + ' · ' + esc(kind === 'plan' ? 'Published plan ' + (item.target && item.target.postId || '') : [item.target && item.target.programId, item.target && item.target.requirementId, item.target && item.target.courseId].filter(Boolean).join(' / ')) + '</p>' : '') + '<div class="evidence-report-actions">' + (!moderation && item.canDelete ? '<button type="button" class="button ghost small" data-remove-evidence>' + (item.author && item.author.isYou ? 'Remove my report' : 'Remove report') + '</button>' : '') + (!moderation && (item.canFlag || item.flaggedByYou) ? '<button type="button" class="button ghost small" data-flag-evidence' + (item.flaggedByYou ? ' disabled' : '') + '>' + (item.flaggedByYou ? 'Flag sent' : 'Flag for review') + '</button>' : '') + '</div>' + (item.reviewNote && item.author && item.author.isYou ? '<p class="evidence-review-note">Moderator note: ' + esc(item.reviewNote) + '</p>' : '') + '<div class="evidence-report-feedback" role="status"></div></article>';
  }
  function announce(target) {
    if (root.document && root.CustomEvent) root.document.dispatchEvent(new root.CustomEvent('degreepath:evidence-updated', { detail: { target } }));
  }
  function invalidate(target) {
    summaries.delete(keyFor(target));
    if (target.kind === 'course') programs.delete(programKey(target.programId, target.catalogYear));
  }
  async function open(input, options) {
    options = options || {};
    let target;
    try { target = normalizeTarget(input); } catch (error) { revision++; const modal = drawer('School outcomes'); modal.content.innerHTML = '<h2 id="evidence-heading">School outcomes</h2>' + errorHTML(error); return modal; }
    const title = options.title || (target.kind === 'plan' ? 'Published plan outcomes' : 'Course transfer outcomes');
    const modal = drawer(title), ticket = ++revision;
    let result = null, user = null, sessionError = null, loading = false, loadRevision = 0;
    const active = () => ticket === revision && modal.dialog.open;
    async function load(cursor) {
      if (!active()) return;
      const loadTicket = ++loadRevision;
      if (!cursor) modal.content.innerHTML = '<h2 id="evidence-heading">' + esc(title) + '</h2><p role="status">Loading school outcomes…</p>';
      try {
        const data = await community().api('/evidence?' + queryFor(target) + '&limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        if (!active() || loadTicket !== loadRevision) return;
        if (cursor && result) { const ids = new Set(result.items.map(item => item.id)); data.items = result.items.concat((data.items || []).filter(item => !ids.has(item.id))); }
        result = data;
        result.items = Array.isArray(result.items) ? result.items : [];
        summaries.set(keyFor(target), data.summary);
        render();
      } catch (error) {
        if (!active() || loadTicket !== loadRevision) return;
        modal.content.innerHTML = '<h2 id="evidence-heading">' + esc(title) + '</h2>' + errorHTML(error) + '<button type="button" class="button secondary" data-evidence-retry>Retry outcomes</button>';
        modal.content.querySelector('[data-evidence-retry]').onclick = () => load();
      }
    }
    async function changed() { invalidate(target); if (active()) await load(); announce(target); }
    function render() {
      const summary = result.summary || {}, own = result.own, items = result.items.slice();
      if (own && !items.some(item => item.id === own.id)) items.unshift(own);
      modal.content.innerHTML = '<h2 id="evidence-heading">' + esc(title) + '</h2><label class="evidence-field evidence-year"><span>Catalog year or version</span><select name="evidenceCatalogYear" aria-label="Catalog year or version">' + yearOptions(target.catalogYear, options.catalogLocked) + '</select></label><p class="evidence-scope">' + (target.kind === 'plan' ? 'Evidence for this exact published plan and catalog.' : 'Evidence for this course in this program requirement and catalog.') + '</p><div class="evidence-summary">' + badgeHTML(summary) + '<p>' + esc(result.disclaimer || defaultDisclaimer) + '</p><details><summary>What this badge means</summary><p>Community verified requires at least two different member accounts with successful school outcomes in the last 12 months, each reviewed by a moderator with a public proof link, for this exact catalog and scope. An unresolved recent changed or rejected outcome prevents verification. Flagged successes do not count until reviewed again. A student cannot review their own report.</p><dl><div><dt>Recent successful outcomes</dt><dd>' + count(summary.recentSuccesses) + '</dd></div><div><dt>Reviewed successes with public proof</dt><dd>' + count(summary.reviewedSuccesses) + '</dd></div><div><dt>Recent conflicting outcomes</dt><dd>' + count(summary.recentConflicts) + '</dd></div><div><dt>Reports over 12 months old</dt><dd>' + count(summary.oldReports) + '</dd></div></dl></details></div>' + (sessionError ? '<p class="evidence-error" role="alert">Sign-in status could not be checked. Public outcomes are still available.</p>' : '') + '<section class="evidence-outcomes" aria-label="Dated school outcomes">' + (items.length ? items.map(item => reportHTML(item, target.kind, false)).join('') : '<p class="evidence-empty">No school outcomes have been reported for this catalog yet.</p>') + '</section>' + (result.cursor ? '<button type="button" class="button ghost small" data-evidence-more>Load more outcomes</button>' : '') + '<section class="evidence-contribute"><h3>' + (own ? 'Update your school outcome' : 'Report your school outcome') + '</h3><p>' + (target.kind === 'plan' ? 'Report whether you completed this exact posted plan, using your degree conferral or final school evaluation date.' : 'Use the school’s actual transfer evaluation date. Completing a provider course alone is not an acceptance outcome.') + '</p>' + (user ? formHTML(own) : '<p>Sign in to share your own outcome.</p>' + community().signinLink('Sign in to report an outcome')) + '</section>';
      modal.content.querySelector('[name=evidenceCatalogYear]').onchange = event => { open(Object.assign({}, target, { catalogYear: event.currentTarget.value }), options); };
      const more = modal.content.querySelector('[data-evidence-more]');
      if (more) more.onclick = async () => { more.disabled = true; await load(result.cursor); };
      bindReports(items);
      const form = modal.content.querySelector('.evidence-form');
      if (form) form.onsubmit = async event => {
        event.preventDefault();
        if (loading) return;
        const feedback = form.querySelector('.evidence-submit-status');
        try {
          const payload = reportPayload(target, { outcome: form.elements.outcome.value, evaluatedOn: form.elements.evaluatedOn.value, details: form.elements.details.value, evidenceUrl: form.elements.evidenceUrl.value, consent: form.elements.consent.checked });
          if (!form.reportValidity()) return;
          loading = true; form.querySelector('[type=submit]').disabled = true; feedback.textContent = 'Publishing your outcome…';
          await community().api('/evidence', { method: 'POST', body: payload });
          if (active()) await changed(); else { invalidate(target); announce(target); }
        } catch (error) { if (active()) { feedback.innerHTML = errorHTML(error); form.querySelector('[type=submit]').disabled = false; } }
        finally { loading = false; }
      };
    }
    function formHTML(own) {
      return '<form class="evidence-form">' + (own ? '<p class="evidence-hint">Updating your report sends it for moderator review again.</p>' : '') + '<label class="evidence-field"><span>School outcome</span><select name="outcome" required><option value="">Choose the outcome</option>' + Object.entries(labels[target.kind]).map(([value, label]) => '<option value="' + value + '"' + (own && own.outcome === value ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select></label><label class="evidence-field"><span>' + (target.kind === 'plan' ? 'Degree conferral / final school evaluation date' : 'School transfer evaluation date') + '</span><input type="date" name="evaluatedOn" required min="1900-01-01" max="' + today() + '" value="' + esc(own && own.evaluatedOn || '') + '"></label><label class="evidence-field"><span>What did the school decide?</span><textarea name="details" required maxlength="1000" rows="4" placeholder="Describe the evaluated placement or any changes. Leave personal records out.">' + esc(own && own.details || '') + '</textarea></label><label class="evidence-field"><span>Public proof link <small>Optional</small></span><input type="url" name="evidenceUrl" maxlength="2048" placeholder="https://" value="' + esc(own && own.evidenceUrl || '') + '"></label><p class="evidence-hint">A moderator must review a public proof link for a report to count toward verification. Link only redacted public material. Keep transcripts, student portals, names and student IDs private.</p><label class="evidence-consent"><input type="checkbox" name="consent" required><span>This is my own school evaluation or degree outcome. I removed private information and consent to publishing my alias, outcome, date, details and optional public proof link.</span></label><button type="submit" class="button">' + (own ? 'Update public outcome' : 'Publish outcome') + '</button><div class="evidence-submit-status" role="status"></div></form>';
    }
    function bindReports(items) {
      modal.content.querySelectorAll('[data-evidence-id]').forEach(card => {
        const item = items.find(report => String(report.id) === card.dataset.evidenceId), feedback = card.querySelector('.evidence-report-feedback');
        if (!item) return;
        const remove = card.querySelector('[data-remove-evidence]');
        if (remove) remove.onclick = () => {
          feedback.innerHTML = '<p>Remove your public outcome?</p><button type="button" class="button secondary small" data-confirm-evidence-delete>Remove report</button> <button type="button" class="button ghost small" data-cancel-evidence-delete>Cancel</button>';
          feedback.querySelector('[data-cancel-evidence-delete]').onclick = () => { feedback.innerHTML = ''; };
          feedback.querySelector('[data-confirm-evidence-delete]').onclick = async event => {
            event.currentTarget.disabled = true;
            try { await community().api('/evidence/' + encodeURIComponent(item.id), { method: 'DELETE' }); await changed(); }
            catch (error) { if (active()) feedback.innerHTML = errorHTML(error); }
          };
        };
        const flag = card.querySelector('[data-flag-evidence]');
        if (flag && !item.flaggedByYou) flag.onclick = () => {
          feedback.innerHTML = '<form class="evidence-flag-form"><label class="evidence-field"><span>Why should a moderator review this outcome?</span><textarea name="reason" required minlength="3" maxlength="1000" rows="3"></textarea></label><p class="evidence-hint">This reason is sent to moderators.</p><button type="submit" class="button secondary small">Send flag</button> <button type="button" class="button ghost small" data-cancel-evidence-flag>Cancel</button><div class="evidence-flag-status" role="status"></div></form>';
          feedback.querySelector('[data-cancel-evidence-flag]').onclick = () => { feedback.innerHTML = ''; };
          feedback.querySelector('form').onsubmit = async event => {
            event.preventDefault(); const form = event.currentTarget;
            if (!form.reportValidity()) return;
            form.querySelector('[type=submit]').disabled = true;
            try { await community().api('/evidence/' + encodeURIComponent(item.id) + '/flags', { method: 'POST', body: { reason: form.elements.reason.value.trim() } }); await changed(); }
            catch (error) { if (active()) { form.querySelector('.evidence-flag-status').innerHTML = errorHTML(error); form.querySelector('[type=submit]').disabled = false; } }
          };
        };
      });
    }
    try { user = await community().getSession(); } catch (error) { sessionError = error; }
    if (active()) await load();
    return modal;
  }
  async function moderate() {
    const modal = drawer('Review school outcomes'), ticket = ++revision;
    const active = () => ticket === revision && modal.dialog.open;
    let items = [], cursor = null, filter = '', user = null, loadRevision = 0;
    async function load(after) {
      const loadTicket = ++loadRevision;
      const data = await community().api('/moderation/evidence?limit=20' + (filter ? '&status=' + encodeURIComponent(filter) : '') + (after ? '&cursor=' + encodeURIComponent(after) : ''));
      if (!active() || loadTicket !== loadRevision) return;
      const ids = new Set(items.map(item => item.id));
      items = after ? items.concat((data.items || []).filter(item => !ids.has(item.id))) : data.items || [];
      cursor = data.cursor; render();
    }
    function render() {
      modal.content.innerHTML = '<h2 id="evidence-heading">Review school outcomes</h2><p>Check that the linked public proof supports the stated school decision, date, exact scope and catalog. Reviewing a report does not guarantee future acceptance.</p><label class="evidence-field"><span>Review queue</span><select name="evidenceReviewFilter">' + [['','Pending and flagged'],['pending','Pending'],['flagged','Flagged'],['reviewed','Reviewed'],['dismissed','Dismissed']].map(([value,label]) => '<option value="' + value + '"' + (filter === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label><div class="evidence-moderation-list">' + (items.length ? items.map(item => '<section class="evidence-moderation-item" data-review-evidence-id="' + esc(item.id) + '">' + reportHTML(item, item.target && item.target.kind || 'course', true) + (count(item.flagCount) ? '<details><summary>' + count(item.flagCount) + ' moderation flag' + (count(item.flagCount) === 1 ? '' : 's') + '</summary>' + (item.flags || []).map(flag => '<p>' + esc(flag.reason) + '</p>').join('') + '</details>' : '') + (item.canReview === false || item.author && item.author.isYou ? '<p class="evidence-hint">Another moderator must review your own report.</p>' : '<label class="evidence-field"><span>Review note <small>Optional; visible to the author and moderators</small></span><textarea name="reviewNote" maxlength="1000" rows="2">' + esc(item.reviewNote || '') + '</textarea></label><div class="evidence-review-actions"><button type="button" class="button secondary small" data-evidence-review="reviewed">Mark reviewed</button><button type="button" class="button ghost small" data-evidence-review="dismissed">Dismiss from badge</button></div>') + '<div class="evidence-review-status" role="status"></div></section>').join('') : '<p class="evidence-empty">No school outcomes in this review queue.</p>') + '</div>' + (cursor ? '<button type="button" class="button secondary" data-more-evidence-review>Load more outcomes</button>' : '') + '<div class="evidence-queue-status" role="status"></div>';
      modal.content.querySelector('[name=evidenceReviewFilter]').onchange = async event => { filter = event.currentTarget.value; try { await load(); } catch (error) { if (active()) modal.content.querySelector('.evidence-queue-status').innerHTML = errorHTML(error); } };
      modal.content.querySelectorAll('[data-review-evidence-id]').forEach(card => {
        const item = items.find(report => String(report.id) === card.dataset.reviewEvidenceId);
        card.querySelectorAll('[data-evidence-review]').forEach(button => button.onclick = async () => {
          if (!item || item.canReview === false || item.author && item.author.isYou) return;
          card.querySelectorAll('[data-evidence-review]').forEach(control => { control.disabled = true; });
          try {
            const body = { status: button.dataset.evidenceReview }, note = card.querySelector('[name=reviewNote]').value.trim();
            if (note) body.note = note;
            await community().api('/evidence/' + encodeURIComponent(item.id) + '/review', { method: 'PATCH', body });
            const target = normalizeTarget(item.target);
            invalidate(target);
            try { const fresh = await community().api('/evidence?' + queryFor(target) + '&limit=1'); summaries.set(keyFor(target), fresh.summary); } catch (_) { /* The next program load can retry the refreshed summary. */ }
            announce(item.target);
            await load();
          } catch (error) { if (active()) { card.querySelector('.evidence-review-status').innerHTML = errorHTML(error); card.querySelectorAll('[data-evidence-review]').forEach(control => { control.disabled = false; }); } }
        });
      });
      const more = modal.content.querySelector('[data-more-evidence-review]');
      if (more) more.onclick = async () => { more.disabled = true; try { await load(cursor); } catch (error) { if (active()) { modal.content.querySelector('.evidence-queue-status').innerHTML = errorHTML(error); more.disabled = false; } } };
    }
    try {
      user = await community().getSession();
      if (!active()) return modal;
      if (!user) { modal.content.innerHTML = '<h2 id="evidence-heading">Review school outcomes</h2><p>Sign in with a moderator account to review outcomes.</p>' + community().signinLink('Sign in'); return modal; }
      if (!['moderator', 'owner'].includes(user.role)) { modal.content.innerHTML = '<h2 id="evidence-heading">Review school outcomes</h2><p>Moderator access is required.</p>'; return modal; }
      await load();
    } catch (error) { if (active()) { modal.content.innerHTML = '<h2 id="evidence-heading">Review school outcomes</h2>' + errorHTML(error) + '<button type="button" class="button secondary" data-retry-evidence-review>Retry review queue</button>'; modal.content.querySelector('[data-retry-evidence-review]').onclick = moderate; } }
    return modal;
  }
  return { badgeHTML, open, chooseCatalog, catalogYear, loadProgram, getSummary, moderate, normalizeTarget, reportPayload };
}));
