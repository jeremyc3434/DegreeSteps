/* A vertical reading journey. Enhancement changes accents, never access or scroll. */
(function () {
  'use strict';
  for (const root of document.querySelectorAll('[data-home-steps]')) {
    const chapters=[...root.querySelectorAll('[data-home-step]')];
    if(chapters.length<2)continue;
    const original={enhanced:root.classList.contains('is-enhanced'),step:root.dataset.currentStep,chapters:chapters.map(chapter=>({current:chapter.classList.contains('is-current'),seen:chapter.classList.contains('is-seen')}))};
    const cleanup=[],observers=[];
    let pending=null,stopped=false;
    const on=(element,type,handler,options)=>{
      if(typeof element?.addEventListener!=='function')return;
      element.addEventListener(type,handler,options);
      cleanup.push(()=>element.removeEventListener(type,handler,options));
    };
    function stop(){
      if(stopped)return;stopped=true;
      if(pending!==null&&typeof window.cancelAnimationFrame==='function')window.cancelAnimationFrame(pending);
      pending=null;observers.forEach(observer=>observer.disconnect());cleanup.forEach(remove=>remove());
      root.classList.toggle('is-enhanced',original.enhanced);
      if(original.step===undefined)delete root.dataset.currentStep;else root.dataset.currentStep=original.step;
      chapters.forEach((chapter,index)=>{chapter.classList.toggle('is-current',original.chapters[index].current);chapter.classList.toggle('is-seen',original.chapters[index].seen);});
    }
    function update(){
      if(stopped)return;
      try{
        const height=Number(window.innerHeight||document.documentElement?.clientHeight);
        if(!Number.isFinite(height)||height<=0)return;
        const readingLine=height*.35;
        let active=-1,nearest=Infinity;
        chapters.forEach((chapter,index)=>{
          const rect=chapter.getBoundingClientRect();
          if(!Number.isFinite(rect.top)||!Number.isFinite(rect.bottom)||rect.bottom<rect.top)throw Error('Chapter layout is unavailable.');
          if(rect.bottom===rect.top)return;
          const distance=readingLine<rect.top?rect.top-readingLine:readingLine>rect.bottom?readingLine-rect.bottom:0;
          if(distance<nearest){nearest=distance;active=index;}
          if(rect.bottom>0&&rect.top<height&&!chapter.classList.contains('is-seen'))chapter.classList.add('is-seen');
        });
        if(active<0)return;
        chapters.forEach((chapter,index)=>{const current=index===active;if(chapter.classList.contains('is-current')!==current)chapter.classList.toggle('is-current',current);});
        if(root.dataset.currentStep!==String(active+1))root.dataset.currentStep=String(active+1);
      }catch{stop();}
    }
    function schedule(){
      if(stopped||pending!==null)return;
      if(typeof window.requestAnimationFrame!=='function'){update();return;}
      pending=window.requestAnimationFrame(()=>{pending=null;update();});
    }
    try{
      update();if(stopped)continue;
      root.classList.add('is-enhanced');
      // Scroll input stays native. The passive handler only batches three
      // geometry reads and also covers fast jumps or restored page positions.
      on(window,'scroll',schedule,{passive:true});
      on(window,'resize',schedule,{passive:true});
      on(window,'pageshow',schedule);
      on(document,'visibilitychange',()=>{if(!document.hidden)schedule();});
      if(typeof window.IntersectionObserver==='function'){
        try{
          const observer=new window.IntersectionObserver(schedule,{root:null,threshold:[0,.25,.5,.75,1]});
          observers.push(observer);chapters.forEach(chapter=>observer.observe(chapter));
        }catch{/* Passive scrolling keeps the static reading accents useful. */}
      }
      if(typeof window.ResizeObserver==='function'){
        try{
          const observer=new window.ResizeObserver(schedule);observers.push(observer);chapters.forEach(chapter=>observer.observe(chapter));
        }catch{/* Content remains readable without layout observation. */}
      }
    }catch{stop();}
  }
}());
