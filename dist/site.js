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
      const validTuition=!data.tuition||data.tuition.scope==='tuition-plus-outside-budget'&&Number.isFinite(data.tuition.outsideBudget)&&data.tuition.outsideBudget>=0&&Number.isFinite(data.tuition.unitsPerTerm)&&data.tuition.unitsPerTerm>0&&Object.entries(data.choices||{}).every(([id,choice])=>{const value=data.tuition.choices?.[id];return value&&value.outside===choice.outside&&value.university===choice.university&&[value.before,value.after,value.difference,value.beforeTerms,value.afterTerms].every(Number.isFinite)&&value.before>0&&value.after>=0&&value.beforeTerms>=0&&value.afterTerms>=0&&Math.abs(value.before-value.after-value.difference)<.01;});
      const valid=validTuition&&Object.values(data.choices||{}).length===2&&Object.values(data.choices).every(choice=>Number.isFinite(choice.outside)&&Number.isFinite(choice.university)&&choice.outside>=0&&choice.university>=0&&choice.outside+choice.university===data.total)&&data.personalCreditsAwarded===0;
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
          const tuition=data.tuition?.choices?.[select.value];
          if(tuition){
            const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
            for(const [name,value] of [['before',money(tuition.before)],['after',money(tuition.after)],['difference',money(tuition.difference)],['before-terms',String(tuition.beforeTerms)],['after-terms',String(tuition.afterTerms)]]){const node=routeExample.querySelector('[data-home-tuition-'+name+']');if(node)node.textContent=value;}
            const bar=routeExample.querySelector('[data-home-tuition-after-bar]');if(bar)bar.style.width=(tuition.after/Math.max(tuition.before,tuition.after)*100).toFixed(3)+'%';
            const beforeBar=routeExample.querySelector('[data-home-tuition-before-bar]');if(beforeBar)beforeBar.style.width=(tuition.before/Math.max(tuition.before,tuition.after)*100).toFixed(3)+'%';
          }
        };
        select.disabled=false;select.addEventListener('change',update);update();
      }
    }catch{/* The sourced static route remains readable without enhancement. */}
  }
}());
