(function () {
  'use strict';
  const $ = id => document.getElementById(id), A = window.AuditCurriculum, KEY = 'degreepath-guide-v3';
  const form = $('audit-import-form'), params = new URLSearchParams(location.search), touched = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalized = value => String(value || '').trim().toLowerCase();
  let rows = [], parsed = null, metadata = null, currentCatalog = null, csvPending = false, busy = false;
  const emptyRow = () => ({section:'', code:'', title:'', credits:'', requiredAtUniversity:false, sourceUrl:'', upperLevel:false});
  function showError(error) {
    $('audit-message').textContent = error.message || String(error);
    $('audit-message').hidden = false;
    $('audit-message').scrollIntoView?.({block:'center', behavior:'smooth'});
  }
  function clearError() { $('audit-message').hidden = true; $('audit-message').textContent = ''; }
  function current() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch { throw Error('Your saved workspace could not be accessed. Nothing has been replaced. Keep this page open and try saving again.'); }
    if (!raw) return DegreeSheet.initialize(null, null, {pathways:[]});
    let state;
    try { state = JSON.parse(raw); } catch { throw Error('Your saved workspace could not be read. It has not been changed. Restore your saved data before saving requirements.'); }
    if (state?.version !== 3 || !state.profile || typeof state.profile !== 'object' || Array.isArray(state.profile) || !Array.isArray(state.learning)) {
      throw Error('Your saved workspace could not be read. It has not been changed. Restore your saved data before saving requirements.');
    }
    return state;
  }
  function store(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw Error('Your progress could not be saved on this device. Your previous saved workspace has not been replaced. Keep this page open and try again.'); }
    dispatchEvent(new CustomEvent('degreepath:save', {detail:{deviceSaved:true}}));
  }
  function values() { return Object.fromEntries(new FormData(form)); }
  function context(meta = values()) {
    return {school:meta.school, degree:meta.title, programId:meta.programId, level:meta.level, modality:meta.modality, creditSystem:meta.creditSystem, sourceUrl:meta.sourceUrl, catalog:meta.catalog};
  }
  function fillFields(fields, emptyOnly = false) {
    for (const [name, value] of Object.entries(fields || {})) {
      const field = form.elements[name];
      if (!field || value === undefined || value === null || emptyOnly && (touched.has(name) || field.value)) continue;
      const text = String(value).slice(0, field.maxLength > 0 ? field.maxLength : 200);
      if (field.tagName === 'SELECT' && !Array.from(field.options).some(option => option.value === text)) continue;
      field.value = text;
    }
  }
  function initialFields(state) {
    const profile = state?.sheet?.isExample ? {} : state?.profile || {};
    const selected = state?.sheet?.isExample ? '' : state?.selectedPathwayId || profile.pathwayId || '';
    const requested = {school:params.get('school'), title:params.get('degree') || params.get('title'), programId:params.get('program') || params.get('programId')};
    const same = (!requested.school || normalized(requested.school) === normalized(profile.school)) && (!requested.title || normalized(requested.title) === normalized(profile.degree)) && (!requested.programId || requested.programId === selected);
    const saved = same ? [...(state?.customCurricula || []), ...(state?.sourceCurricula || [])].find(entry => entry.route?.id === selected || entry.model?.id === selected) : null;
    const identity = same && state?.targetIdentity?.version === 1 && state.targetIdentity.route?.id === selected && normalized(state.targetIdentity.route.school) === normalized(profile.school || profile.schoolChoice) && normalized(state.targetIdentity.route.title) === normalized(profile.degree) ? state.targetIdentity.route : null;
    const route = saved?.route || identity || {}, model = saved?.model || {}, base = same ? profile : {};
    return {
      school:requested.school || base.school || base.schoolChoice || '',
      title:requested.title || base.degree || '',
      programId:requested.programId || (same && selected !== 'custom-target' ? selected : ''),
      level:params.get('level') || base.degreeLevel || route.level || '',
      modality:params.get('format') || params.get('modality') || (base.modality === 'any' ? '' : base.modality) || (route.modalities?.length === 1 ? route.modalities[0] : ''),
      creditSystem:params.get('units') || params.get('creditSystem') || model.creditSystem || route.creditSystem || route.creditUnit || base.creditSystem || '',
      sourceUrl:params.get('source') || params.get('sourceUrl') || route.url || model.auditProvenance?.referenceUrl || base.sourceUrl || '',
      totalCredits:params.get('totalCredits') || model.totalCredits || route.degreeCredits || '',
      catalog:params.get('catalog') || model.catalog || route.catalog || base.catalog || '',
      institutionMinCredits:model.institutionMinCredits ?? '', upperMinCredits:model.upperMinCredits ?? ''
    };
  }
  function savedDraft(state, target) {
    const exact = A.readDraft(state, target);
    if (exact && (!target.degree || normalized(exact.context.degree) === normalized(target.degree))) return exact;
    if (!target.school || !(target.degree || target.programId)) return null;
    // The directory can fill an ID or credit context after an unfinished draft was
    // saved. Resolve that same target without mixing different known catalogs.
    const matching = (state?.auditDrafts?.drafts || []).filter(draft => {
      const candidate = draft.context;
      if (normalized(candidate.school) !== normalized(target.school)) return false;
      if (target.degree && normalized(candidate.degree) !== normalized(target.degree)) return false;
      if (candidate.programId && target.programId ? candidate.programId !== target.programId : normalized(candidate.degree) !== normalized(target.degree)) return false;
      for (const key of ['level','catalog','creditSystem','modality']) {
        const known = key === 'creditSystem' ? draft.metadata.creditSystem : candidate[key];
        if (known && target[key] && normalized(known) !== normalized(target[key])) return false;
      }
      return true;
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return matching.length ? A.readDraft(state, matching[0].context) : null;
  }
  function readRows() {
    return Array.from($('audit-editor-rows').children).map((element, index) => {
      const row = {...emptyRow(), ...rows[index]};
      for (const input of element.querySelectorAll('[data-field]')) row[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
      return row;
    });
  }
  function renderRows() {
    if (!rows.length) rows = [emptyRow()];
    $('audit-editor-rows').innerHTML = rows.map((row, index) => {
      const label = (name, title, extra = '') => '<label><span>' + title + '</span><input data-field="' + name + '" aria-label="' + title + ', row ' + (index + 1) + '" value="' + esc(row[name]) + '" ' + extra + '></label>';
      return '<div class="audit-editor-row" data-row="' + index + '">' +
        label('section', 'Section', 'maxlength="100" placeholder="Major requirements"') +
        label('code', 'Course code (optional)', 'maxlength="100" placeholder="BIO 101"') +
        label('title', 'Requirement', 'maxlength="200" placeholder="Course or requirement name"') +
        label('credits', 'Credits', 'inputmode="decimal" maxlength="12" placeholder="Unknown"') +
        '<label class="audit-row-policy"><span>At university</span><span class="audit-checkbox"><input type="checkbox" data-field="requiredAtUniversity" aria-label="Required at university, row ' + (index + 1) + '"' + (row.requiredAtUniversity ? ' checked' : '') + '>Required here</span></label>' +
        '<label class="audit-row-policy"><span>Course level</span><span class="audit-checkbox"><input type="checkbox" data-field="upperLevel" aria-label="Upper level, row ' + (index + 1) + '"' + (row.upperLevel ? ' checked' : '') + '>Upper level</span></label>' +
        '<button type="button" class="audit-remove-row" data-remove-row="' + index + '" aria-label="Remove requirement row ' + (index + 1) + '">Remove</button>' +
        (row.importNotes ? '<details class="audit-import-notes"><summary>Imported course suggestions</summary><p>Proposed spreadsheet notes · not an accepted transfer award</p><p>' + esc(row.importNotes) + '</p></details>' : '') + '</div>';
    }).join('');
    $('audit-row-count').textContent = rows.length + (rows.length === 1 ? ' row' : ' rows');
  }
  function markChanged() { $('audit-save-status').textContent = 'Unsaved changes.'; }
  function importRows() {
    const result = A.parseTable($('audit-csv').value);
    rows = result.rows.map(row => ({...emptyRow(), ...row}));
    csvPending = false;
    renderRows();
    const details = [...(result.warnings || [])];
    if (result.skipped?.length && !details.length) details.push(result.skipped.length + ' summary or heading rows were left out.');
    $('audit-import-status').textContent = rows.length + ' requirements imported. ' + details.join(' ');
    $('audit-import-status').hidden = false;
    markChanged();
    return result;
  }
  function draftPayload() { return {metadata:values(), rows:readRows(), csv:$('audit-csv').value, mode:csvPending ? 'paste' : 'rows'}; }
  function saveProgress() {
    if (busy) return;
    try {
      clearError();
      const payload = draftPayload();
      if (!payload.metadata.school.trim() || !payload.metadata.title.trim()) throw Error('Add your school and degree name to save this progress. The remaining details can wait.');
      const latest = current();
      store(A.saveDraft(latest, context(payload.metadata), payload));
      try { if (typeof history !== 'undefined' && history.replaceState) history.replaceState(history.state, '', A.launchURL(context(payload.metadata))); } catch { /* Saving the draft does not depend on browser history. */ }
      $('audit-save-status').innerHTML = 'Saved on this device. <a href="account.html#account-save-form" data-open-plan-save>Save to my account</a> to return from another device.';
    } catch (error) { showError(error); }
  }
  function review() {
    if (busy) return;
    try {
      clearError();
      if (csvPending) importRows();
      metadata = values();
      if (!metadata.level || !metadata.creditSystem) throw Error('Choose the degree level and credit units before reviewing. You can save unfinished progress at any time.');
      rows = readRows();
      const included = rows.filter(row => row.section || row.code || row.title || row.credits || row.sourceUrl || row.requiredAtUniversity || row.upperLevel);
      parsed = {rows:included.map(row => ({...row, credits:Number(String(row.credits).trim())}))};
      if (parsed.rows.some(row => /^EXAMPLE:/i.test(row.title))) throw Error('Replace every EXAMPLE row with requirements from your own degree audit.');
      const entry = A.create(parsed.rows, {...metadata, totalCredits:Number(metadata.totalCredits), reviewedByStudent:true});
      parsed.totalCredits = entry.model.totalCredits;
      $('audit-degree-summary').textContent = metadata.title + ' · ' + metadata.school + ' · ' + parsed.rows.length + ' requirements · ' + parsed.totalCredits + ' ' + (metadata.creditSystem === 'competency-unit' ? 'competency units' : metadata.creditSystem + ' credits');
      $('audit-preview-rows').innerHTML = parsed.rows.map(row => '<tr><td>' + esc(row.section || 'Major requirements') + '</td><td>' + esc(row.code || 'Choose a course') + '</td><td>' + esc(row.title) + (row.upperLevel ? ' <small>(upper level)</small>' : '') + '</td><td>' + esc(row.credits) + '</td><td>' + esc(row.requiredAtUniversity ? 'Required' : 'Confirm transfer options') + '</td></tr>').join('');
      $('audit-total').textContent = parsed.totalCredits;
      $('audit-confirm').checked = false;
      $('audit-build').disabled = true;
      $('audit-start').hidden = true;
      $('audit-review').hidden = false;
      $('audit-review').scrollIntoView?.({block:'start', behavior:'smooth'});
    } catch (error) { showError(error); }
  }
  const blob = new Blob([A.template], {type:'text/csv;charset=utf-8'}), templateURL = URL.createObjectURL(blob);
  $('audit-template').href = templateURL;
  addEventListener('pagehide', () => URL.revokeObjectURL(templateURL), {once:true});
  form.addEventListener('input', event => {
    if (event.target.name) touched.add(event.target.name);
    if (['school','title'].includes(event.target.name)) { form.elements.programId.value = ''; touched.add('programId'); }
    if (event.target.id === 'audit-csv') csvPending = true;
    if (event.target.dataset.field) csvPending = false;
    markChanged();
  });
  $('audit-add-row').addEventListener('click', () => {
    if (rows.length >= (A.limits?.maxRows || 500)) { showError(Error('Use at most 500 requirement rows.')); return; }
    rows = readRows(); rows.push(emptyRow()); renderRows(); markChanged();
    $('audit-editor-rows').lastElementChild.querySelector('input').focus();
  });
  $('audit-editor-rows').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-row]');
    if (!remove) return;
    const index = Number(remove.dataset.removeRow);
    rows = readRows(); rows.splice(index, 1); renderRows(); csvPending = false; markChanged();
    $('audit-editor-rows').children[Math.min(index, rows.length - 1)].querySelector('input').focus();
  });
  $('audit-import-rows').addEventListener('click', () => { try { clearError(); importRows(); } catch (error) { showError(error); } });
  $('audit-file').addEventListener('change', async event => {
    try {
      clearError(); const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 150000) throw Error('Choose a requirements file smaller than 150 KB.');
      $('audit-csv').value = await file.text(); csvPending = true; markChanged(); importRows();
    } catch (error) { showError(error); }
  });
  $('audit-save').addEventListener('click', saveProgress);
  form.addEventListener('submit', event => { event.preventDefault(); review(); });
  $('audit-back').addEventListener('click', () => { if (busy) return; clearError(); $('audit-review').hidden = true; $('audit-start').hidden = false; form.elements.title.focus(); });
  $('audit-confirm').addEventListener('change', () => { $('audit-build').disabled = busy || !$('audit-confirm').checked; });
  $('audit-build').addEventListener('click', async () => {
    if (busy || !parsed || !metadata || !$('audit-confirm').checked) return;
    busy = true; $('audit-build').disabled = true; $('audit-back').disabled = true;
    try {
      clearError();
      let entry = A.create(parsed.rows, {...metadata, totalCredits:Number(metadata.totalCredits), reviewedByStudent:true});
      if (currentCatalog) {
        const matching = currentCatalog.pathways.filter(route => route.school === entry.route.school && route.modelId);
        let models = [];
        try { models = await DegreeProgramCatalog.modelsForRoutes(matching, {includeLegacy:false}); } catch { /* The reviewed requirements can stand alone when outside-course research is unavailable. */ }
        if (models.length) entry.model = A.inheritEquivalencies(entry.model, models);
      }
      const latest = current();
      const withDraft = A.saveDraft(latest, context(metadata), {metadata, rows, csv:$('audit-csv').value, mode:'rows'});
      let next = A.commit(withDraft, entry, {catalog:currentCatalog});
      if (parsed.rows.some(row => row.importNotes)) {
        for (const [index, row] of parsed.rows.entries()) if (row.importNotes) next = DegreeSheet.setNote(next, entry.model.id, 'audit-row-' + (index + 1), 'Imported suggestions · not an accepted transfer award\n' + row.importNotes);
        A.validatePrivateWork(next);
      }
      store(next);
      location.href = 'plan.html';
    } catch (error) { showError(error); busy = false; $('audit-build').disabled = !$('audit-confirm').checked; $('audit-back').disabled = false; }
  });
  // Establish the saved degree and draft before any directory request can fail or wait.
  let loadedState = null;
  try {
    loadedState = current();
    fillFields(initialFields(loadedState));
    const target = context();
    const draft = savedDraft(loadedState, target);
    if (draft) {
      fillFields({...draft.metadata, programId:draft.metadata.programId || target.programId});
      Object.keys(draft.metadata).forEach(name => touched.add(name));
      rows = draft.rows || [];
      $('audit-csv').value = draft.csv || '';
      csvPending = draft.mode === 'paste';
      $('audit-save-status').textContent = 'Saved progress restored. Continue where you left off.';
      if (csvPending) $('audit-paste').open = true;
    }
  } catch (error) { fillFields(initialFields(null)); showError(error); }
  renderRows();
  const initial = context();
  (async () => {
    try {
      const response = await fetch('data/pathways.json');
      if (!response.ok) throw Error('Directory unavailable');
      currentCatalog = await DegreeProgramCatalog.loadIndex(await DegreeProgramCatalog.load(await response.json()));
      const target = currentCatalog.pathways.find(route => initial.programId ? route.id === initial.programId : normalized(route.school) === normalized(initial.school) && normalized(route.title) === normalized(initial.degree));
      if (!target || initial.school && normalized(target.school) !== normalized(initial.school) || initial.degree && normalized(target.title) !== normalized(initial.degree) || normalized(form.elements.school.value) !== normalized(initial.school) || normalized(form.elements.title.value) !== normalized(initial.degree)) return;
      fillFields({school:target.school, title:target.title, programId:target.id, level:target.level, sourceUrl:target.url || target.sources?.[0]?.url, modality:target.modalities?.length === 1 ? target.modalities[0] : '', totalCredits:target.degreeCredits, creditSystem:target.creditUnit}, true);
    } catch {
      $('audit-directory-status').textContent = 'The degree directory is unavailable. You can still enter requirements and save your progress.';
      $('audit-directory-status').hidden = false;
    }
  })();
}());
