/* My courses: the one course list a student keeps on this device (the `learning` records in the
 * `degreepath-guide-v3` draft). Every page shows it the same way and sends new courses to the same two
 * places: upload first (import-courses.html), with manual entry (plan.html?task=credits&manual=1) as the
 * fallback. This file only reads storage; adding, editing and removing stay with those shared pages.
 * Course progress (Finished, Taking, Not started) is the student's own record. It is never a school's
 * transfer award, and credits keep the units on the original record. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.DegreeMyCourses = api;
    const run = () => api.mountAll(root.document);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run); else run();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'degreepath-guide-v3';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const providerKey = value => {
    const registry = root.DegreeCreditProviders;
    if (registry?.key) try {return registry.key(value);} catch {}
    const n = norm(value);
    return ({sophialearning:'sophia',sophiaorg:'sophia',studycom:'studycom',collegelevelexaminationprogram:'clep'})[n] || n;
  };
  // Pages that can send a student to the shared upload and manual-entry pages, and get them back.
  const FROM = new Set(['courses','credits-worth','degrees','programs','portal','plan','transfer']);
  const MANUAL_FROM = new Set(['courses','credits-worth','degrees','programs']);

  /** Reads the shared list without changing it. */
  function read(storage) {
    let raw;
    try {raw = (storage || root.localStorage).getItem(KEY);} catch {return {available:false, readable:false, learning:[]};}
    if (raw === null || raw === undefined) return {available:true, readable:true, learning:[]};
    try {
      const state = JSON.parse(raw);
      if (state?.version !== 3 || !state.profile || typeof state.profile !== 'object' || !Array.isArray(state.learning)) throw Error('Unknown draft');
      return {available:true, readable:true, learning:state.learning.filter(record => record && typeof record === 'object')};
    } catch {return {available:true, readable:false, learning:[]};}
  }

  const UNITS = {
    semester: ['semester credit', 'semester credits'],
    quarter: ['quarter credit', 'quarter credits'],
    'competency-unit': ['competency unit (CU)', 'competency units (CUs)']
  };
  const round = value => Math.round(value * 100) / 100;
  /** Course progress counts and finished credits kept in their original units (never converted or summed across units). */
  function summary(learning) {
    const records = Array.isArray(learning) ? learning : [];
    const result = {total:records.length, finished:0, taking:0, notStarted:0, finishedCredits:{semester:0, quarter:0, 'competency-unit':0}, finishedToConfirm:0};
    for (const record of records) {
      if (record.status === 'earned') {
        result.finished++;
        const credits = Number(record.credits);
        if (Number.isFinite(credits) && credits > 0 && UNITS[record.creditSystem]) result.finishedCredits[record.creditSystem] = round(result.finishedCredits[record.creditSystem] + credits);
        else result.finishedToConfirm++;
      } else if (record.status === 'in-progress') result.taking++;
      else result.notStarted++;
    }
    return result;
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function progressText(s) {
    if (!s.total) return '';
    return [s.finished ? s.finished + ' finished' : '', s.taking ? s.taking + ' taking' : '', s.notStarted ? s.notStarted + ' not started' : ''].filter(Boolean).join(' · ');
  }
  function creditsText(s) {
    const parts = Object.entries(s.finishedCredits).filter(([, n]) => n > 0).map(([system, n]) => plural(n, UNITS[system][0], UNITS[system][1]));
    if (s.finishedToConfirm) parts.push(plural(s.finishedToConfirm, 'finished course', 'finished courses') + ' with credits to confirm');
    return parts.length ? 'On your records: ' + parts.join(' · ') : '';
  }
  function links(from) {
    const source = FROM.has(from) ? from : 'courses';
    return {
      upload: '/import-courses.html?from=' + encodeURIComponent(source),
      manual: '/plan.html?task=credits&manual=1&from=' + encodeURIComponent(MANUAL_FROM.has(source) ? source : 'courses'),
      view: '/courses.html?tab=mine'
    };
  }
  /** The same course-list panel everywhere. Upload is the primary action; manual entry is the fallback. */
  function panelHTML(view, options = {}) {
    const s = summary(view.learning), href = links(options.from), id = 'ds-my-courses-' + (options.id || 'panel');
    const heading = '<h2 class="ds-my-courses-title" id="' + esc(id) + '">My courses' + (s.total ? ' <span class="ds-my-courses-count">' + s.total + '</span>' : '') + '</h2>';
    let body;
    if (!view.available) body = '<p class="ds-my-courses-note">This browser can’t open device storage, so My courses isn’t available here.</p>';
    else if (!view.readable) body = '<p class="ds-my-courses-note">Your saved courses couldn’t be read. They have not been changed. <a href="/courses.html?tab=mine">Open My courses</a> to recover them.</p>';
    else if (!s.total) body = '<p class="ds-my-courses-lede">' + esc(options.empty || 'Add your courses once. The degree finder, every plan and your comparisons all use the same list.') + '</p>';
    else body = '<p class="ds-my-courses-progress">' + esc(progressText(s)) + '</p>' + (creditsText(s) ? '<p class="ds-my-courses-credits">' + esc(creditsText(s)) + '</p>' : '') + '<p class="ds-my-courses-note">Your own records. Each school decides what it accepts.</p>';
    const actions = options.actions !== false && view.available && view.readable
      ? '<div class="ds-my-courses-actions"><a class="ds-my-courses-upload" href="' + esc(href.upload) + '">' + (s.total ? 'Add more courses' : 'Upload transcript or spreadsheet') + '</a><a class="ds-my-courses-manual" href="' + esc(href.manual) + '">Enter a course by hand</a>' + (s.total ? '<a class="ds-my-courses-view" href="' + esc(href.view) + '">View My courses</a>' : '') + '</div>'
      : '';
    return '<section class="ds-my-courses' + (s.total ? ' ds-my-courses-has' : '') + '" aria-labelledby="' + esc(id) + '" data-my-courses-total="' + s.total + '"><div class="ds-my-courses-copy">' + heading + body + '</div>' + actions + '</section>';
  }

  /** The student's record for a provider course, matched by provider and course code (aliases included). */
  function findRecord(learning, provider, code) {
    const p = providerKey(provider), c = norm(code);
    if (!p || !c) return null;
    return (Array.isArray(learning) ? learning : []).find(record => providerKey(record.provider) === p && [record.code, ...(Array.isArray(record.codeAliases) ? record.codeAliases : [])].some(value => value && norm(value) === c)) || null;
  }
  const progressName = status => status === 'earned' ? 'Finished' : status === 'in-progress' ? 'Taking' : 'Not started';
  /** Transfer course pages: show whether this course is already in My courses, or how to add it. */
  function transferHTML(view, provider, code) {
    if (!view.available || !view.readable) return '';
    const record = findRecord(view.learning, provider, code);
    if (record) return '<p class="ds-my-course-state"><strong>In My courses · ' + esc(progressName(record.status)) + '</strong> <a href="/courses.html?tab=mine&amp;record=' + encodeURIComponent(record.id) + '">View or change it</a></p><p class="ds-my-course-next"><a class="site-button" href="/start.html">Find degrees for my courses</a></p>';
    return '';
  }

  function render(element, storage) {
    const view = read(storage);
    if (element.hasAttribute('data-my-courses')) {
      element.innerHTML = panelHTML(view, {from:element.getAttribute('data-my-courses-from') || '', id:element.id || 'panel', empty:element.getAttribute('data-my-courses-empty') || '', actions:element.getAttribute('data-my-courses-actions') !== 'none'});
    } else if (element.hasAttribute('data-my-course-add')) {
      const html = transferHTML(view, element.getAttribute('data-provider'), element.getAttribute('data-code'));
      const fallback = element.querySelector('[data-my-course-default]');
      let state = element.querySelector('[data-my-course-state]');
      if (!state) {state = element.ownerDocument.createElement('div'); state.setAttribute('data-my-course-state', ''); element.appendChild(state);}
      state.innerHTML = html;
      if (fallback) fallback.hidden = Boolean(html);
    }
    return view;
  }
  function mountAll(doc) {
    const nodes = () => [...doc.querySelectorAll('[data-my-courses],[data-my-course-add]')];
    if (!nodes().length) return;
    const update = () => {for (const node of nodes()) render(node);};
    update();
    const win = doc.defaultView;
    win?.addEventListener?.('storage', event => {if (event.key === KEY || event.key === null) update();});
    win?.addEventListener?.('degreepath:save', update);
    win?.addEventListener?.('pageshow', update);
  }
  return Object.freeze({KEY, read, summary, progressText, creditsText, links, panelHTML, findRecord, transferHTML, render, mountAll});
}));
