/* A visitor-paced introduction. The unenhanced HTML remains fully readable. */
(function () {
  'use strict';
  for (const root of document.querySelectorAll('[data-home-steps]')) {
    const viewport=root.querySelector('[data-home-step-viewport]'),track=root.querySelector('[data-home-step-track]');
    const cards=[...root.querySelectorAll('[data-home-step]')],controls=root.querySelector('[data-home-step-controls]');
    const back=root.querySelector('[data-home-step-back]'),next=root.querySelector('[data-home-step-next]');
    const status=root.querySelector('[data-home-step-status]'),build=root.querySelector('[data-home-step-build]');
    if (!viewport||!track||!controls||!back||!next||!status||!build||cards.length<2) continue;
    const listeners=[],original=cards.map(card=>({hidden:card.getAttribute('aria-hidden'),inert:card.inert}));
    const canInert=cards.every(card=>'inert' in card),motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let active=0,settleTimer=null,observer=null,stopped=false;
    const on=(element,name,handler)=>{element.addEventListener(name,handler);listeners.push(()=>element.removeEventListener(name,handler));};
    const clearSettle=()=>{if(settleTimer!==null){window.clearTimeout(settleTimer);settleTimer=null;}};
    function fallback() {
      if(stopped)return;stopped=true;clearSettle();observer?.disconnect();listeners.forEach(remove=>remove());
      root.classList.remove('is-enhanced');controls.hidden=true;
      cards.forEach((card,index)=>{card.classList.remove('is-current','is-seen');if(canInert)card.inert=original[index].inert;if(original[index].hidden===null)card.removeAttribute('aria-hidden');else card.setAttribute('aria-hidden',original[index].hidden);});
    }
    function setActive(index) {
      index=Math.max(0,Math.min(cards.length-1,index));
      const previous=cards[active],focused=document.activeElement;active=index;
      // Focus must leave a card before that card becomes inert.
      if(canInert&&previous!==cards[active]&&previous.contains(focused))viewport.focus({preventScroll:true});
      cards.forEach((card,i)=>{const current=i===active;card.classList.toggle('is-current',current);if(current)card.classList.add('is-seen');if(canInert){card.inert=!current;card.setAttribute('aria-hidden',String(!current));}});
      back.disabled=active===0;next.disabled=active===cards.length-1;
      if(focused===next&&next.disabled)build.focus({preventScroll:true});
      else if(focused===back&&back.disabled)next.focus({preventScroll:true});
      const title=cards[active].dataset.stepTitle||'Degree planning';
      status.textContent='Step '+(active+1)+' of '+cards.length+': '+title;
    }
    function relativeLeft(card) {
      const distance=card.getBoundingClientRect().left-viewport.getBoundingClientRect().left-(viewport.clientLeft||0);
      if(!Number.isFinite(distance))throw Error('The walkthrough layout is unavailable.');
      return distance;
    }
    function align(smooth) {
      const left=viewport.scrollLeft+relativeLeft(cards[active]);
      if(typeof viewport.scrollTo==='function')viewport.scrollTo({left,behavior:smooth&&!motion?.matches?'smooth':'auto'});
      else viewport.scrollLeft=left;
    }
    function navigate(index) {
      if(stopped)return;
      try{clearSettle();setActive(index);align(true);}catch{fallback();}
    }
    function syncScroll() {
      settleTimer=null;if(stopped)return;
      try{let closest=0,distance=Infinity;cards.forEach((card,index)=>{const gap=Math.abs(relativeLeft(card));if(gap<distance){closest=index;distance=gap;}});if(closest!==active)setActive(closest);}catch{fallback();}
    }
    function resize() {
      if(stopped)return;
      try{clearSettle();align(false);}catch{fallback();}
    }
    try {
      root.classList.add('is-enhanced');setActive(0);align(false);controls.hidden=false;
      on(back,'click',()=>navigate(active-1));on(next,'click',()=>navigate(active+1));
      on(viewport,'keydown',event=>{
        if(event.target!==viewport||event.altKey||event.ctrlKey||event.metaKey)return;
        const destinations={ArrowLeft:active-1,ArrowRight:active+1,Home:0,End:cards.length-1};
        if(!Object.prototype.hasOwnProperty.call(destinations,event.key))return;
        event.preventDefault();navigate(destinations[event.key]);
      });
      on(viewport,'scroll',()=>{clearSettle();settleTimer=window.setTimeout(syncScroll,140);});
      on(viewport,'scrollend',()=>{clearSettle();syncScroll();});
      on(window,'resize',resize);
      if(typeof window.ResizeObserver==='function'){observer=new window.ResizeObserver(resize);observer.observe(viewport);}
      if(motion?.addEventListener)on(motion,'change',resize);
    } catch { fallback(); }
  }
}());
