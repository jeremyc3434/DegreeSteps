(function () {
  'use strict';
  const $ = id => document.getElementById(id), A = window.AuditCurriculum, KEY = 'degreepath-guide-v3';
  const form = $('audit-import-form'), params = new URLSearchParams(location.search), touched = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalized = value => String(value || '').trim().toLowerCase();
  const baselineFields = ['baselineId','baselineRevision','baselineHash','baselineMode','baselineEmphasisId','creditUnitLabel','learningFormat'];
  let rows = [], parsed = null, metadata = null, currentCatalog = null, csvPending = false, busy = false, dirty = false, baselineData = null, baselineRequest = null;
  const emptyRow = () => ({section:'', code:'', title:'', credits:'', requiredAtUniversity:false, sourceUrl:'', upperLevel:false});
  function showError(error) {
    $('audit-message').textContent = error.message || String(error);
    $('audit-message').hidden = false;
    $('audit-baseline-restore').hidden = error.code !== 'baseline-identity-mismatch';
    $('audit-message').scrollIntoView?.({block:'center', behavior:'smooth'});
  }
  function clearError() { $('audit-message').hidden = true; $('audit-message').textContent = ''; $('audit-baseline-restore').hidden = true; }
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
  function values() {
    const result = Object.fromEntries(new FormData(form));
    if (!result.baselineId) for (const field of baselineFields) delete result[field];
    return result;
  }
  async function loadBaselines() {
    if (baselineData) return baselineData;
    if (!window.DegreeRequirementsBaselines) throw Error('The catalog requirements could not be loaded. Your saved workspace is unchanged. Refresh this page and try again.');
    if (!baselineRequest) baselineRequest = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('data/requirements-baselines.json', {credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal});
        if (!response.ok) throw Error('Catalog requirements are unavailable. Your saved workspace is unchanged. Try again shortly.');
        baselineData = window.DegreeRequirementsBaselines.validateCatalog(await response.json());
        return baselineData;
      } finally { clearTimeout(timer); baselineRequest = null; }
    })();
    return baselineRequest;
  }
  async function baselineReference(meta) {
    if (!meta.baselineId) return null;
    const data = await loadBaselines();
    const emphasis = data.emphases.find(item => item.id === meta.baselineEmphasisId);
    if (meta.baselineId !== data.id || Number(meta.baselineRevision) !== data.revision || meta.baselineHash !== data.hash || meta.baselineMode !== 'requirements-only' || !emphasis || meta.creditUnitLabel !== data.creditUnitLabel || meta.learningFormat !== data.learningFormat) {
      throw Error('This saved baseline source reference does not match the reviewed catalog. Keep your requirements saved and choose the appropriate baseline. Its rows have not been replaced.');
    }
    return {data, emphasis};
  }
  function baselineIdentity({data, emphasis}) {
    return {school:data.school, title:data.program+' — '+emphasis.title, programId:'requirements-baseline-umass-global-mypath-bba-'+data.catalogId+'-'+emphasis.id+'-r'+data.revision, level:data.level, modality:data.modality, catalog:data.catalogId, creditSystem:data.creditSystem, sourceUrl:data.source.url};
  }
  async function baselineFor(meta) {
    const reference = await baselineReference(meta);
    if (!reference) return null;
    const identity = baselineIdentity(reference);
    if (Object.entries(identity).some(([field, value]) => field === 'school' ? normalized(meta[field]) !== normalized(value) : field === 'sourceUrl' ? String(meta[field]).split('#')[0] !== value : field === 'catalog' ? String(meta[field]).replace(/[–—]/g,'-') !== value : meta[field] !== value)) {
      throw Object.assign(Error('These degree details no longer match the selected catalog baseline. Use “Restore catalog details” to keep your requirement rows and restore its school, program and catalog, or choose a different baseline.'), {code:'baseline-identity-mismatch'});
    }
    return reference;
  }
  function baselineSummary(value) {
    const host = $('audit-baseline-context');
    if (!value) { host.hidden = true; host.innerHTML = ''; $('audit-code-guidance').textContent = 'Enter each course or requirement. Course codes are optional.'; return; }
    const {data, emphasis} = value;
    $('audit-code-guidance').textContent = 'Use the exact course or competency code for each included requirement. Unresolved elective pools stay in your draft until you add the actual named courses.';
    host.hidden = false;
    host.innerHTML = '<h2>2024–25 MyPath BBA · '+esc(emphasis.title)+'</h2><p>Starting requirements from the reviewed catalog: <strong>120 '+esc(data.creditUnitLabel)+'</strong>. Credit amounts are not counts of competencies. Check your assigned catalog, emphasis and completed work against your university degree audit.</p><p>This is a requirements workspace. It includes no approved outside-course awards or permission to take new courses while enrolled.</p>'+
      (emphasis.requiresAllocation?'<p class="audit-notice">General Business includes a variable pool of 19 equivalent elective credits. It is not one course or a fixed number of courses. Save this draft while you identify the actual courses with the university. Remove the elective-pool row, then add the actual named courses from your degree audit totaling 19 equivalent credits before building a proposed plan.</p>':'')+
      '<p><a href="'+esc(data.source.url)+'#page=116" target="_blank" rel="noopener noreferrer">Read the official 2024–25 catalog requirements</a> · Reviewed '+esc(data.source.checkedOn)+'</p><details><summary>Notes about the source</summary><ul>'+data.conflicts.map(item=>'<li>'+esc(item.detail)+'</li>').join('')+'</ul><p>These source notes do not create prerequisite rules or transfer awards.</p></details>';
    const select = form.elements.creditSystem;
    for (const option of Array.from(select.options)) if (option.value === 'semester') option.textContent = 'Catalog-equivalent credits (MyPath)';
  }
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
    const baseline = model.auditProvenance?.requirementsBaseline;
    return {
      school:requested.school || base.school || base.schoolChoice || '',
      title:requested.title || base.degree || '',
      programId:requested.programId || baseline?.programId || (same && selected !== 'custom-target' ? selected : ''),
      level:params.get('level') || base.degreeLevel || route.level || '',
      modality:params.get('format') || params.get('modality') || (base.modality === 'any' ? '' : base.modality) || (route.modalities?.length === 1 ? route.modalities[0] : ''),
      creditSystem:params.get('units') || params.get('creditSystem') || model.creditSystem || route.creditSystem || route.creditUnit || base.creditSystem || '',
      sourceUrl:params.get('source') || params.get('sourceUrl') || route.url || model.auditProvenance?.referenceUrl || base.sourceUrl || '',
      totalCredits:params.get('totalCredits') || model.totalCredits || route.degreeCredits || '',
      catalog:params.get('catalog') || model.catalog || route.catalog || base.catalog || '',
      institutionMinCredits:model.institutionMinCredits ?? '', upperMinCredits:model.upperMinCredits ?? '',
      ...(baseline ? {baselineId:baseline.id, baselineRevision:baseline.revision, baselineHash:baseline.hash, baselineMode:baseline.scope, baselineEmphasisId:baseline.emphasisId, creditUnitLabel:baseline.creditUnitLabel, learningFormat:'competency-based'} : {})
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
        label('code', values().baselineId ? 'Course / competency code' : 'Course code (optional)', 'maxlength="100" placeholder="BIO 101"') +
        label('title', 'Requirement', 'maxlength="200" placeholder="Course or requirement name"') +
        label('credits', values().baselineId ? 'Equivalent credits' : 'Credits', 'inputmode="decimal" maxlength="12" placeholder="Unknown"') +
        '<label class="audit-row-policy"><span>At university</span><span class="audit-checkbox"><input type="checkbox" data-field="requiredAtUniversity" aria-label="Required at university, row ' + (index + 1) + '"' + (row.requiredAtUniversity ? ' checked' : '') + '>Required here</span></label>' +
        '<label class="audit-row-policy"><span>Course level</span><span class="audit-checkbox"><input type="checkbox" data-field="upperLevel" aria-label="Upper level, row ' + (index + 1) + '"' + (row.upperLevel ? ' checked' : '') + '>Upper level</span></label>' +
        '<button type="button" class="audit-remove-row" data-remove-row="' + index + '" aria-label="Remove requirement row ' + (index + 1) + '">Remove</button>' +
        (row.importNotes ? '<details class="audit-import-notes"><summary>Imported course suggestions</summary><p>Proposed spreadsheet notes · not an accepted transfer award</p><p>' + esc(row.importNotes) + '</p></details>' : '') + '</div>';
    }).join('');
    $('audit-row-count').textContent = rows.length + (rows.length === 1 ? ' row' : ' rows');
  }
  function markChanged() { dirty = true; $('audit-save-status').textContent = 'Unsaved changes.'; }
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
      dirty = false;
      try { if (typeof history !== 'undefined' && history.replaceState) history.replaceState(history.state, '', A.launchURL(context(payload.metadata))); } catch { /* Saving the draft does not depend on browser history. */ }
      $('audit-save-status').innerHTML = 'Saved on this device. <a href="account.html#account-save-form" data-open-plan-save>Save to my account</a> to return from another device.';
    } catch (error) { showError(error); }
  }
  async function review() {
    if (busy) return;
    try {
      clearError();
      if (csvPending) importRows();
      metadata = values();
      const sourceBaseline = await baselineFor(metadata);
      metadata = values();
      if (sourceBaseline) await baselineFor(metadata);
      if (!metadata.level || !metadata.creditSystem) throw Error('Choose the degree level and credit units before reviewing. You can save unfinished progress at any time.');
      rows = readRows();
      const included = rows.filter(row => row.section || row.code || row.title || row.credits || row.sourceUrl || row.requiredAtUniversity || row.upperLevel);
      if (sourceBaseline && included.some(row => row.allocationRequired === true || !String(row.code || '').trim())) throw Error('An elective pool or course choice is still unresolved. Save this draft, remove the elective-pool row, then add the actual named courses from your university degree audit totaling 19 equivalent elective credits. Each included requirement needs its course or competency code; no course count is assumed.');
      parsed = {rows:included.map(row => ({...row, credits:Number(String(row.credits).trim())}))};
      if (parsed.rows.some(row => /^EXAMPLE:/i.test(row.title))) throw Error('Replace every EXAMPLE row with requirements from your own degree audit.');
      const entry = A.create(parsed.rows, {...metadata, totalCredits:Number(metadata.totalCredits), reviewedByStudent:true});
      parsed.totalCredits = entry.model.totalCredits;
      $('audit-degree-summary').textContent = metadata.title + ' · ' + metadata.school + ' · ' + parsed.rows.length + ' requirements · ' + parsed.totalCredits + ' ' + (metadata.creditUnitLabel || (metadata.creditSystem === 'competency-unit' ? 'competency units' : metadata.creditSystem + ' credits'));
      $('audit-review-provenance').textContent = sourceBaseline ? 'These requirements started with the reviewed 2024–25 MyPath catalog. Your edits, assigned catalog, remaining requirements and receiving-credit decisions still need university confirmation. This is not a verified transfer template.' : 'These are student-provided requirements. The university still needs to confirm the catalog, credit rules, and transfer placements.';
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
  $('audit-baseline-restore').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      const reference = await baselineReference(values());
      if (!reference) throw Error('Choose a catalog baseline before restoring its details. Your requirements have not changed.');
      fillFields(baselineIdentity(reference));
      baselineSummary(reference);
      clearError(); markChanged();
      $('audit-save-status').textContent = 'Catalog details restored. Your requirement rows are unchanged. Save progress to keep this correction.';
    } catch (error) { showError(error); }
    finally { busy = false; }
  });
  form.addEventListener('submit', event => { event.preventDefault(); return review(); });
  $('audit-baseline-load').addEventListener('click', async () => {
    if (busy) return;
    try {
      clearError();
      if (dirty) throw Error('Save your current requirements progress before opening a catalog baseline. Your unsaved rows have not been replaced.');
      const choice = {catalogId:$('audit-baseline-catalog').value, emphasisId:$('audit-baseline-emphasis').value};
      if (!choice.catalogId || !choice.emphasisId) throw Error('Choose the catalog and BBA emphasis explicitly. Enrollment in 2024 does not identify your assigned catalog or emphasis.');
      busy = true; $('audit-baseline-load').disabled = true;
      const data = await loadBaselines();
      if (dirty) throw Error('Your requirements changed while the catalog loaded. Save that progress before opening a baseline.');
      const result = window.DegreeRequirementsBaselines.prepareDraft(current(), data, choice, A);
      if (!result.reused) store(result.state);
      location.href = result.href;
    } catch (error) { showError(error); }
    finally { busy = false; $('audit-baseline-load').disabled = false; }
  });
  $('audit-back').addEventListener('click', () => { if (busy) return; clearError(); $('audit-review').hidden = true; $('audit-start').hidden = false; form.elements.title.focus(); });
  $('audit-confirm').addEventListener('change', () => { $('audit-build').disabled = busy || !$('audit-confirm').checked; });
  $('audit-build').addEventListener('click', async () => {
    if (busy || !parsed || !metadata || !$('audit-confirm').checked) return;
    busy = true; $('audit-build').disabled = true; $('audit-back').disabled = true;
    try {
      clearError();
      const sourceBaseline = await baselineFor(metadata);
      if (sourceBaseline && parsed.rows.some(row => row.allocationRequired === true || !String(row.code || '').trim())) throw Error('Resolve the elective pool or course choices before building a proposed plan.');
      let entry = A.create(parsed.rows, {...metadata, totalCredits:Number(metadata.totalCredits), reviewedByStudent:true});
      if (sourceBaseline) {
        entry.model.auditProvenance.requirementsBaseline = {id:metadata.baselineId, revision:Number(metadata.baselineRevision), hash:metadata.baselineHash, emphasisId:metadata.baselineEmphasisId, programId:metadata.programId, catalog:metadata.catalog, creditUnitLabel:metadata.creditUnitLabel, scope:'requirements-only'};
        entry.model.learningFormat = 'competency-based';
        entry.model.coverageLabel = 'Catalog requirements adapted by the student · proposed plan';
      }
      if (currentCatalog && !sourceBaseline) {
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
  if (params.has('baseline')) $('audit-baseline').open = true;
  if (values().baselineId) baselineFor(values()).then(baselineSummary).catch(showError);
  else baselineSummary(null);
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
