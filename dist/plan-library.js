/* Degree plan library: search, facet filters, sorting and paging over the public plan cards.
 * Progressive enhancement: without JS every plan is listed, grouped by school. Shareable state lives in the URL. */
(function (root) {
  'use strict';
  const MULTI = ['subject', 'format', 'level', 'pace', 'school'];
  const PAGE = 12;

  /** Normalizes URL-style state into a predictable shape. */
  function normalize(state) {
    const out = { q: String(state.q || '').trim().slice(0, 80), sort: ['outside', 'cost', 'az', 'school'].includes(state.sort) ? state.sort : 'outside', share: [50, 60, 70].includes(Number(state.share)) ? Number(state.share) : 0 };
    for (const key of MULTI) out[key] = [...new Set((Array.isArray(state[key]) ? state[key] : String(state[key] || '').split(',')).map(v => String(v).trim()).filter(Boolean))];
    return out;
  }
  const words = text => String(text || '').toLowerCase().replace(/[^a-z0-9%+]+/g, ' ').split(' ').filter(Boolean);
  /** True when an item passes every active filter. `skip` ignores one facet (used for facet counts). */
  function matches(item, state, skip) {
    if (state.q) {
      const hay = words([item.title, item.school, item.subjectLabels.join(' '), item.format === 'online' ? 'online' : 'on campus campus residential', item.level].join(' ')).join(' ');
      if (!words(state.q).every(word => hay.includes(word))) return false;
    }
    if (skip !== 'share' && item.share < state.share) return false;
    if (skip !== 'subject' && state.subject.length && !state.subject.some(s => item.subjects.includes(s))) return false;
    for (const key of ['format', 'level', 'pace', 'school']) if (skip !== key && state[key].length && !state[key].includes(item[key])) return false;
    return true;
  }
  /** Stable comparator for a sort key; unknown costs always sort last. */
  function compare(sort) {
    const az = (a, b) => a.title.localeCompare(b.title) || a.school.localeCompare(b.school);
    if (sort === 'cost') return (a, b) => (a.cost === null) - (b.cost === null) || (a.cost ?? 0) - (b.cost ?? 0) || az(a, b);
    if (sort === 'az') return az;
    if (sort === 'school') return (a, b) => a.school.localeCompare(b.school) || az(a, b);
    return (a, b) => b.share - a.share || az(a, b);
  }
  /** Pure: filtered, sorted items plus per-facet option counts. */
  function query(items, rawState) {
    const state = normalize(rawState);
    const results = items.filter(item => matches(item, state)).sort(compare(state.sort));
    const counts = {};
    for (const key of MULTI) {
      counts[key] = {};
      for (const item of items) if (matches(item, state, key)) for (const value of key === 'subject' ? item.subjects : [item[key]]) if (value) counts[key][value] = (counts[key][value] || 0) + 1;
    }
    return { state, results, counts };
  }
  const api = { normalize, matches, query, PAGE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.DegreeStepsPlanLibrary = api;

  const library = document.querySelector('[data-plan-library]');
  if (!library) return;
  const $ = selector => library.querySelector(selector), $$ = selector => [...library.querySelectorAll(selector)];
  const form = $('[data-plan-filters]'), toolbar = $('[data-plan-toolbar]'), results = $('[data-plan-results]');
  const search = $('[data-plan-search]'), sort = $('[data-plan-sort]'), toggle = $('[data-plan-filter-toggle]');
  const count = $('[data-plan-count]'), active = $('[data-plan-active]'), empty = $('[data-plan-empty]'), more = $('[data-plan-more]'), badge = $('[data-plan-filter-count]');
  const copy = $('[data-plan-copy]');
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); copy.textContent = 'Link copied'; } catch { copy.textContent = 'Copy the address bar to share'; } setTimeout(() => { copy.textContent = 'Copy link to this list'; }, 2400); });
  }
  const groups = new Map($$('[data-plan-group]').map(group => [group.dataset.planGroup, group]));
  const labelFor = (name, value) => { const input = form.querySelector('input[name="' + name + '"][value="' + CSS.escape(value) + '"]'); return input ? input.nextElementSibling.textContent : value; };
  const items = $$('.public-plan-card').map(card => ({
    card, title: card.dataset.planTitle || '', school: card.dataset.planSchool || '', format: card.dataset.planFormat || '', level: card.dataset.planLevel || '', pace: card.dataset.planPace || '',
    subjects: (card.dataset.planSubjects || '').split(' ').filter(Boolean), share: Number(card.dataset.planShare) || 0, cost: card.dataset.planCost ? Number(card.dataset.planCost) : null
  }));
  for (const item of items) item.subjectLabels = item.subjects.map(s => labelFor('subject', s));
  // The flat (non-grouped) list gets its own heading so card headings keep a valid outline.
  const flatHeading = document.createElement('h2'); flatHeading.className = 'sr-only'; flatHeading.textContent = 'Matching degree plans'; flatHeading.hidden = true; results.appendChild(flatHeading);
  const flat = document.createElement('div'); flat.className = 'public-plan-cards plan-library-flat'; flat.hidden = true; results.appendChild(flat);
  let limit = PAGE;

  function readURL() {
    const params = new URLSearchParams(location.search), state = {};
    for (const key of ['q', 'sort', 'share', ...MULTI]) if (params.has(key)) state[key] = params.get(key);
    return normalize(state);
  }
  function writeURL(state) {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.sort !== 'outside') params.set('sort', state.sort);
    if (state.share) params.set('share', String(state.share));
    for (const key of MULTI) if (state[key].length) params.set(key, state[key].join(','));
    const next = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
    if (next !== location.pathname + location.search + location.hash) history.replaceState(null, '', next);
  }
  function readForm() {
    const state = { q: search.value, sort: sort.value, share: (form.querySelector('input[name="share"]:checked') || {}).value };
    for (const key of MULTI) state[key] = $$('input[name="' + key + '"]:checked').map(input => input.value);
    return normalize(state);
  }
  function fillForm(state) {
    search.value = state.q; sort.value = state.sort;
    for (const input of $$('[data-plan-filters] input')) input.checked = input.name === 'share' ? Number(input.value) === state.share : (state[input.name] || []).includes(input.value);
  }
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function render(state, { resetPage = false } = {}) {
    if (resetPage) limit = PAGE;
    const { results: list, counts } = query(items, state);
    const grouped = state.sort === 'school';
    const shown = new Set(list.slice(0, limit).map(item => item.card));
    // Grouped view keeps school sections; other sorts use one flat, ordered grid.
    flat.hidden = grouped; flatHeading.hidden = grouped || list.length === 0;
    for (const item of items) item.card.hidden = !shown.has(item.card);
    if (grouped) {
      for (const item of [...items].sort((a, b) => a.title.localeCompare(b.title))) groups.get(item.school)?.querySelector('.public-plan-cards')?.appendChild(item.card);
      for (const [school, group] of groups) group.hidden = !list.slice(0, limit).some(item => item.school === school);
    } else {
      for (const item of list) flat.appendChild(item.card);
      for (const item of items) if (!shown.has(item.card) && item.card.parentElement !== flat) flat.appendChild(item.card);
      for (const group of groups.values()) group.hidden = true;
    }
    library.classList.toggle('is-grouped', grouped);

    // Facet counts reflect the other active filters; empty options are disabled unless selected.
    for (const input of $$('[data-plan-filters] input[type="checkbox"]')) {
      const n = counts[input.name]?.[input.value] || 0, label = input.closest('label');
      label.querySelector('[data-facet-count]').textContent = n;
      input.disabled = n === 0 && !input.checked; label.classList.toggle('is-empty', input.disabled);
    }
    const filters = MULTI.reduce((n, key) => n + state[key].length, 0) + (state.share ? 1 : 0);
    badge.hidden = !filters; badge.textContent = filters ? String(filters) : '';
    count.textContent = list.length === items.length && !state.q && !filters ? plural(items.length, 'researched plan') : list.length + ' of ' + plural(items.length, 'plan') + ' match' + (list.length === 1 ? 'es' : '');
    empty.hidden = list.length > 0;
    more.hidden = list.length <= limit;
    more.textContent = 'Show ' + Math.min(PAGE, list.length - limit) + ' more plans';

    const pills = [];
    if (state.q) pills.push(['q', state.q, '“' + state.q + '”']);
    for (const key of MULTI) for (const value of state[key]) pills.push([key, value, labelFor(key, value)]);
    if (state.share) pills.push(['share', String(state.share), state.share + '%+ outside credit']);
    active.innerHTML = '';
    for (const [key, value, text] of pills) {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'plan-pill'; button.textContent = text; button.setAttribute('aria-label', 'Remove filter: ' + text);
      button.addEventListener('click', () => { const next = readForm(); if (key === 'q') next.q = ''; else if (key === 'share') next.share = 0; else next[key] = next[key].filter(v => v !== value); apply(next); count.focus?.(); });
      li.appendChild(button); active.appendChild(li);
    }
    if (pills.length > 1) { const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.className = 'plan-pill-clear'; button.textContent = 'Clear all'; button.addEventListener('click', () => apply(normalize({ sort: sort.value }))); li.appendChild(button); active.appendChild(li); }
    writeURL(state);
  }
  function apply(state) { fillForm(state); render(state, { resetPage: true }); }

  // Mobile: the filter panel opens as a sheet; desktop keeps it as a sidebar.
  const narrow = window.matchMedia('(max-width: 900px)');
  function setOpen(open) {
    library.classList.toggle('filters-open', open); toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('plan-filters-locked', open && narrow.matches);
    if (open && narrow.matches) form.querySelector('input,button')?.focus(); else if (!open && narrow.matches) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(!library.classList.contains('filters-open')));
  for (const button of $$('[data-plan-filter-close]')) button.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && library.classList.contains('filters-open')) setOpen(false); });
  narrow.addEventListener('change', () => setOpen(false));

  let typing = null;
  search.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => render(readForm(), { resetPage: true }), 120); });
  sort.addEventListener('change', () => render(readForm(), { resetPage: true }));
  form.addEventListener('change', () => render(readForm(), { resetPage: true }));
  form.addEventListener('submit', event => event.preventDefault());
  for (const button of $$('[data-plan-clear]')) button.addEventListener('click', () => apply(normalize({ sort: sort.value })));
  more.addEventListener('click', () => { const first = limit; limit += PAGE; render(readForm()); const next = query(items, readForm()).results[first]; next?.card.querySelector('a')?.focus(); });

  toolbar.hidden = false; form.hidden = false; library.classList.add('is-enhanced');
  count.tabIndex = -1;
  apply(readURL());
})(typeof window !== 'undefined' ? window : globalThis);
