/* One header for the whole site. The public-site generator renders it as static HTML (Node) and the workspace shell
   renders the same markup in the browser. Navigation works without JavaScript: the menu button only appears, and the
   links only collapse on small screens, after enhance() runs. Reads the plan draft only to choose where "My plan"
   goes; it never writes storage. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.DegreeHeader = api;
    const run = () => api.enhanceAll(root.document);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run);
    else run();
  }
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const DRAFT_KEY = 'degreepath-guide-v3';
  const DESTINATIONS = Object.freeze([
    Object.freeze({id:'degrees', label:'Degrees', publicHref:'/degree-plans/', appHref:'/programs.html', shell:'programs'}),
    Object.freeze({id:'transfer', label:'Transfer courses', publicHref:'/transfer/', appHref:'/transfer/', shell:'transfer'}),
    Object.freeze({id:'community', label:'Community', publicHref:'/community.html?tab=feed', appHref:'/community.html?tab=feed', shell:'community'}),
    Object.freeze({id:'plan', label:'My plan', publicHref:'/plan.html', appHref:'/plan.html', shell:'plan', fallbackHref:'/start.html'}),
    Object.freeze({id:'account', label:'Sign in', publicHref:'/account.html', appHref:'/account.html', shell:'account'})
  ]);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const menuIcon = '<svg class="ds-header-toggle-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const wordmark = '<span>Degree</span><span class="ds-wordmark-steps">Steps</span>';

  /** Header HTML. surface: 'public' | 'app'. current: a destination id. actions: trusted HTML for the right side. */
  function html(options = {}) {
    const surface = options.surface === 'app' ? 'app' : 'public';
    const current = options.current || '';
    const id = 'ds-header-menu-' + surface;
    const links = DESTINATIONS.map(item => {
      const href = surface === 'app' ? item.appHref : item.publicHref;
      const attributes = ['href="' + esc(href) + '"', 'class="ds-header-link ds-header-link--' + item.id + '"', 'data-header-destination="' + item.id + '"'];
      if (surface === 'app') attributes.push('data-shell-nav="' + item.shell + '"');
      if (item.fallbackHref) attributes.push('data-fallback-href="' + esc(item.fallbackHref) + '"');
      if (current === item.id) attributes.push('aria-current="page"');
      const label = item.id === 'account' && options.accountLabel ? options.accountLabel : item.label;
      return '<a ' + attributes.join(' ') + (item.id === 'account' ? ' data-header-account' : '') + '>' + esc(label) + '</a>';
    }).join('');
    return '<header class="ds-header ds-header--' + surface + (options.className ? ' ' + esc(options.className) : '') + '" data-ds-header>'
      + '<div class="ds-header-inner">'
      + '<a class="ds-header-brand ds-wordmark' + (surface === 'public' ? ' site-brand' : '') + '" href="/" aria-label="DegreeSteps home">' + wordmark + '</a>'
      + '<button type="button" class="ds-header-toggle" aria-expanded="false" aria-controls="' + id + '" hidden>' + menuIcon + '<span>Menu</span></button>'
      + '<nav class="ds-header-nav" id="' + id + '" aria-label="Main navigation">' + links + '</nav>'
      + (options.actions ? '<div class="ds-header-actions">' + options.actions + '</div>' : '')
      + '</div></header>';
  }

  /** True when this device holds a chosen degree plan (the same rule the account save action uses). */
  function hasPlan(storage) {
    try {
      const raw = storage && storage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      return Boolean(draft && !draft.sheet?.isExample && (draft.selectedPathwayId || draft.profile?.pathwayId));
    } catch { return false; }
  }

  function enhance(header, options = {}) {
    if (!header || header.dataset.dsHeaderReady) return;
    header.dataset.dsHeaderReady = '1';
    const doc = header.ownerDocument, win = doc.defaultView;
    let storage = null;
    try { storage = options.storage || win.localStorage; } catch { storage = null; }
    for (const link of header.querySelectorAll('[data-fallback-href]')) if (!hasPlan(storage)) link.setAttribute('href', link.getAttribute('data-fallback-href'));
    const toggle = header.querySelector('.ds-header-toggle'), nav = header.querySelector('.ds-header-nav');
    if (!toggle || !nav) return;
    toggle.hidden = false;
    header.classList.add('ds-header--enhanced');
    const set = open => {
      toggle.setAttribute('aria-expanded', String(open));
      header.classList.toggle('ds-header--open', open);
      if (typeof win.CustomEvent === 'function') header.dispatchEvent(new win.CustomEvent('ds-header-menu', {detail: {open}}));
    };
    set(false);
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => { if (event.target.closest('a')) set(false); });
    header.addEventListener('keydown', event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
    });
    doc.addEventListener('click', event => {
      if (toggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) set(false);
    });
  }

  function enhanceAll(doc) {
    if (typeof doc?.querySelectorAll !== 'function') return;
    for (const header of doc.querySelectorAll('[data-ds-header]')) enhance(header);
  }

  return Object.freeze({DESTINATIONS, DRAFT_KEY, html, hasPlan, enhance, enhanceAll});
}));
