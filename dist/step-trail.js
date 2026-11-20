/* Step trail: a sticky, scroll-aware step bar built from a public page's own section headings.
 * Progressive enhancement only: without JS (or with fewer than three steps) the page is unchanged. */
(function () {
  'use strict';
  const main = document.querySelector('main');
  // The homepage already runs its own visitor-paced step journey.
  if (!main || document.querySelector('[data-home-steps]') || document.body.hasAttribute('data-no-step-trail')) return;

  const SKIP = 'nav, aside, footer, dialog, details:not([open]), [hidden], [data-trail-skip]';
  const headings = [...main.querySelectorAll('h2')].filter(h => !h.closest(SKIP) && h.getClientRects().length);
  if (headings.length < 3) return;

  const labelOf = (h, last) => {
    if (h.dataset.trailLabel) return h.dataset.trailLabel;
    if (last && h.closest('.final-cta')) return 'Your next step';
    const copy = h.cloneNode(true);
    copy.querySelectorAll('span, small, .sr-only').forEach(node => node.remove());
    const text = copy.textContent.replace(/\s+/g, ' ').trim().replace(/[.:]$/, '');
    return text.length > 42 ? text.slice(0, 40).replace(/\s+\S*$/, '') + '…' : text;
  };
  const steps = headings.map((heading, index) => {
    if (!heading.id) heading.id = 'step-' + (index + 1);
    return { heading, label: labelOf(heading, index === headings.length - 1) };
  });
  const total = steps.length;
  const pad = n => String(n).padStart(2, '0');

  const bar = document.createElement('nav');
  bar.className = 'step-trail';
  bar.setAttribute('aria-label', 'Steps on this page');
  bar.innerHTML =
    '<div class="step-trail-inner">' +
      '<p class="step-trail-now" aria-hidden="true"><span class="step-trail-count"></span><span class="step-trail-label"></span></p>' +
      '<ol class="step-trail-nodes"></ol>' +
    '</div>' +
    '<div class="step-trail-track" aria-hidden="true"><span class="step-trail-fill"></span></div>';
  const list = bar.querySelector('ol');
  const count = bar.querySelector('.step-trail-count');
  const label = bar.querySelector('.step-trail-label');
  const fill = bar.querySelector('.step-trail-fill');
  const items = steps.map((step, index) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#' + step.heading.id;
    link.className = 'step-trail-node';
    link.innerHTML = '<span class="step-trail-dot" aria-hidden="true">' + pad(index + 1) + '</span><span class="step-trail-tip">' + step.label.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) + '</span>';
    link.setAttribute('aria-label', 'Step ' + (index + 1) + ' of ' + total + ': ' + step.label);
    link.addEventListener('click', event => {
      event.preventDefault();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = step.heading.getBoundingClientRect().top + window.scrollY - offset();
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
      step.heading.setAttribute('tabindex', '-1');
      step.heading.focus({ preventScroll: true });
      history.replaceState(null, '', '#' + step.heading.id);
    });
    li.appendChild(link);
    list.appendChild(li);
    return li;
  });
  bar.style.setProperty('--steps', String(total));
  document.body.appendChild(bar);
  document.body.classList.add('has-step-trail');

  function offset() { return bar.offsetHeight + 24; }

  let current = -1, frame = null;
  function update() {
    frame = null;
    const line = Math.min(window.innerHeight * 0.35, 320);
    let active = -1;
    steps.forEach((step, index) => { if (step.heading.getBoundingClientRect().top <= line) active = index; });
    // The closing step becomes current once the page bottom is reached, even when it is short.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = total - 1;
    bar.classList.toggle('is-visible', active >= 0);

    // Fill: whole steps reached plus the fraction of the way through the current section.
    let progress = 0;
    if (active >= 0) {
      const start = steps[active].heading.getBoundingClientRect().top;
      const next = steps[active + 1] ? steps[active + 1].heading.getBoundingClientRect().top : start + 1;
      const within = active === total - 1 ? 1 : Math.min(1, Math.max(0, (line - start) / Math.max(1, next - start)));
      progress = (active + within) / total;
    }
    fill.style.transform = 'scaleX(' + progress.toFixed(4) + ')';

    if (active === current) return;
    current = active;
    items.forEach((item, index) => {
      item.classList.toggle('is-done', index < active);
      item.classList.toggle('is-current', index === active);
      const link = item.firstChild;
      if (index === active) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current');
    });
    if (active >= 0) {
      count.textContent = 'Step ' + (active + 1) + ' of ' + total;
      label.textContent = steps[active].label;
    }
  }
  const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
})();
