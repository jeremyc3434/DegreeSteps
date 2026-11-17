/* Progressive enhancements only; public content and navigation work without JS. */
(function () {
  'use strict';
  const menu = document.querySelector('.site-menu');
  const desktop = window.matchMedia('(min-width: 1101px)');
  function syncMenu() {if (desktop.matches) menu?.setAttribute('open',''); else menu?.removeAttribute('open');}
  syncMenu(); desktop.addEventListener('change',syncMenu);
  menu?.querySelector('nav')?.addEventListener('click',event=>{if(!desktop.matches&&event.target.closest('a'))menu.removeAttribute('open');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!desktop.matches&&menu?.open){menu.removeAttribute('open');menu.querySelector('summary')?.focus();}});
  const barrier = document.querySelector('.home-barriers');
  if (barrier) {
    const tabs = [...barrier.querySelectorAll('[role="tab"][data-barrier]')];
    const panels = [...barrier.querySelectorAll('.home-barrier-panel')];
    const activate = tab => {
      for (const item of tabs) {const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;}
      for (const panel of panels) panel.hidden=panel.id!==tab.getAttribute('aria-controls');
    };
    if (tabs.length && tabs.every(tab=>panels.some(panel=>panel.id===tab.getAttribute('aria-controls')))) {
      barrier.classList.add('home-barriers-enhanced'); activate(tabs[0]);
      for (const tab of tabs) {
        tab.addEventListener('click',event=>{event.preventDefault();activate(tab);});
        tab.addEventListener('keydown',event=>{
          let index=tabs.indexOf(tab);
          if (['ArrowDown','ArrowRight'].includes(event.key)) index=(index+1)%tabs.length;
          else if (['ArrowUp','ArrowLeft'].includes(event.key)) index=(index-1+tabs.length)%tabs.length;
          else if (event.key==='Home') index=0;
          else if (event.key==='End') index=tabs.length-1;
          else return;
          event.preventDefault();activate(tabs[index]);tabs[index].focus();
        });
      }
    }
  }
  const input = document.querySelector('[data-resource-search]');
  if (input) {
    const cards = [...document.querySelectorAll('[data-resource-card]')], count = document.querySelector('[data-resource-count]');
    const update = () => {const query=input.value.trim().toLowerCase();let visible=0;for(const card of cards){card.hidden=Boolean(query&&!card.dataset.resourceText.includes(query));if(!card.hidden)visible++;}if(count)count.textContent=query?visible+' matching resource'+(visible===1?'':'s'):'';};
    input.addEventListener('input',update);
  }
}());
