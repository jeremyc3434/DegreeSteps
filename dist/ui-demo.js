/* Internal component check page only (ui-demo.html). */
(function () {
  'use strict';
  for (const chip of document.querySelectorAll('button.ds-chip[aria-pressed]')) {
    chip.addEventListener('click', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')));
  }
  const opener = document.querySelector('[data-demo-sheet]');
  opener?.addEventListener('click', () => {
    window.DegreeSheetUI.open({
      title: 'Speech Communication',
      subtitle: 'Example row · 3 credits',
      trigger: opener,
      content: body => {
        const intro = document.createElement('p');
        intro.textContent = 'Choose how you will complete this requirement.';
        const list = document.createElement('div');
        list.className = 'demo-row';
        for (const label of ['Option A', 'Option B', 'Take it at the school']) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ds-btn ds-btn-secondary';
          button.textContent = label;
          list.append(button);
        }
        body.append(intro, list);
      }
    });
  });
}());
