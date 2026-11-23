/* Row sheet: an accessible modal panel (bottom sheet on phones, side panel on wider screens; see ds-components.css).
   DegreeSheetUI.open({title, subtitle, content, trigger, onClose}) returns {close, element, body}.
   content is a Node or a function(body) that fills the body; strings are inserted as text, never as HTML.
   Focus moves into the sheet, Tab stays inside it, Escape or the close button closes it, and focus returns to the
   control that opened it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.DegreeSheetUI = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  let counter = 0, active = null;

  function focusables(container) {
    return [...container.querySelectorAll(FOCUSABLE)].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && (node.offsetParent !== null || node === container.ownerDocument.activeElement));
  }

  function open(options = {}) {
    if (active) active.close();
    const doc = options.document || document, id = 'ds-sheet-' + (++counter);
    const trigger = options.trigger || doc.activeElement;
    const backdrop = doc.createElement('div');
    backdrop.className = 'ds-sheet-backdrop';
    const sheet = doc.createElement('div');
    sheet.className = 'ds-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', id + '-title');
    sheet.tabIndex = -1;
    const head = doc.createElement('div');
    head.className = 'ds-sheet-head';
    const titles = doc.createElement('div');
    titles.className = 'ds-sheet-titles';
    const title = doc.createElement('h2');
    title.className = 'ds-sheet-title';
    title.id = id + '-title';
    title.textContent = options.title || 'Details';
    titles.append(title);
    if (options.subtitle) {
      const subtitle = doc.createElement('p');
      subtitle.className = 'ds-sheet-subtitle';
      subtitle.textContent = options.subtitle;
      titles.append(subtitle);
    }
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'ds-sheet-close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    head.append(titles, close);
    const body = doc.createElement('div');
    body.className = 'ds-sheet-body';
    if (typeof options.content === 'function') options.content(body);
    else if (options.content && typeof options.content === 'object' && 'nodeType' in options.content) body.append(options.content);
    else if (options.content != null) body.textContent = String(options.content);
    sheet.append(head, body);
    backdrop.append(sheet);

    let closed = false;
    const finish = reason => {
      if (closed) return;
      closed = true;
      doc.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      doc.documentElement.classList.remove('ds-sheet-open');
      if (active === handle) active = null;
      if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) trigger.focus();
      if (typeof options.onClose === 'function') options.onClose(reason);
    };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish('escape'); return; }
      if (event.key !== 'Tab') return;
      const items = focusables(sheet);
      if (!items.length) { event.preventDefault(); sheet.focus(); return; }
      const first = items[0], last = items[items.length - 1], current = doc.activeElement;
      if (event.shiftKey && (current === first || !sheet.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !sheet.contains(current))) { event.preventDefault(); first.focus(); }
    };
    close.addEventListener('click', () => finish('close'));
    backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) finish('backdrop'); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.append(backdrop);
    doc.documentElement.classList.add('ds-sheet-open');
    const first = focusables(body)[0];
    (first || close).focus();
    const handle = {element: sheet, body, close: () => finish('api')};
    active = handle;
    return handle;
  }

  return Object.freeze({open, isOpen: () => Boolean(active)});
}));
