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
    const update = () => {const query=input.value.trim().toLowerCase();let visible=0;for(const card of cards){card.hidden=Boolean(query&&!card.dataset.resourceText.includes(query));if(!card.hidden)visible++;}for(const group of document.querySelectorAll('[data-resource-group]'))group.hidden=[...group.querySelectorAll('[data-resource-card]')].every(card=>card.hidden);if(count)count.textContent=query?visible+' matching resource'+(visible===1?'':'s'):'';};
    input.addEventListener('input',update);
    // A shared link can open the list pre-filtered (e.g. /transfer/?q=sophia).
    try{const q=new URLSearchParams(location.search).get('q');if(q&&q.length<=80){input.value=q;update();}}catch{}
  }
  const routeExample=document.querySelector('[data-home-route-example]');
  if(routeExample){
    try{
      const data=JSON.parse(document.getElementById('home-route-example-data').textContent),select=routeExample.querySelector('[data-home-course-choice]');
      const finite=value=>Number.isFinite(value),span=value=>value&&finite(value.min)&&finite(value.max)&&value.min>=0&&value.max>=value.min;
      const validEstimate=!data.estimate||data.estimate.scope==='plan-estimate'&&Object.entries(data.choices||{}).every(([id,choice])=>{const value=data.estimate.choices?.[id];return value&&value.outside===choice.outside&&value.university===choice.university&&finite(value.min)&&finite(value.max)&&value.min>0&&value.max>=value.min&&span(value.outsideMonths)&&span(value.universityTerms);});
      const valid=validEstimate&&Object.values(data.choices||{}).length===2&&Object.values(data.choices).every(choice=>Number.isFinite(choice.outside)&&Number.isFinite(choice.university)&&choice.outside>=0&&choice.university>=0&&choice.outside+choice.university===data.total)&&data.personalCreditsAwarded===0;
      if(valid&&select){
        const update=()=>{
          const choice=data.choices[select.value];if(!choice)return;
          routeExample.querySelector('[data-home-course-provider]').textContent=choice.provider;
          routeExample.querySelector('[data-home-outside]').textContent=String(choice.outside);
          routeExample.querySelector('[data-home-university]').textContent=String(choice.university);
          routeExample.querySelector('[data-home-route-feedback]').textContent=data.total+' credits accounted for. '+(select.value==='sophia'?'This writing choice keeps '+data.requirementCredits+' credits outside Liberty.':'This writing choice adds '+data.requirementCredits+' credits at Liberty.');
          const source=routeExample.querySelector('[data-home-choice-source]'),title=routeExample.querySelector('[data-home-choice-title]'),track=routeExample.querySelector('[data-home-mix-track]'),outside=routeExample.querySelector('[data-home-mix-outside]'),university=routeExample.querySelector('[data-home-mix-university]');
          if(source)source.textContent=choice.provider;if(title)title.textContent=choice.title;
          if(outside)outside.style.flexGrow=String(choice.outside);if(university)university.style.flexGrow=String(choice.university);
          if(track)track.setAttribute('aria-label','Proposed course mix: '+choice.outside+' credits through outside courses plus '+choice.university+' credits at Liberty equals '+data.total+' degree credits. This is planned coursework, not completed credit.');
          for(const selector of ['[data-home-provider-logo]','[data-home-self-paced-note]']){const node=routeExample.querySelector(selector);if(node)node.hidden=select.value!=='sophia';}
          const estimate=data.estimate?.choices?.[select.value];
          if(estimate){
            const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value),range=value=>value.min===value.max?String(value.min):value.min+'–'+value.max;
            for(const [name,value] of [['range',money(estimate.min)+'–'+money(estimate.max)],['terms',range(estimate.universityTerms)],['outside',range(estimate.outsideMonths)]]){const node=routeExample.querySelector('[data-home-estimate-'+name+']');if(node)node.textContent=value;}
          }
        };
        select.disabled=false;select.addEventListener('change',update);update();
      }
    }catch{/* The sourced static route remains readable without enhancement. */}
  }
}());
