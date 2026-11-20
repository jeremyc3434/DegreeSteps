/* Public previews and calculators never read or change a student's private draft. */
(function(){
 'use strict';
 const all=selector=>[...document.querySelectorAll(selector)];
 const filter=document.querySelector('[data-preview-filter]');
 if(filter){
  // Optional controls: search, provider and expand/collapse. Each is absent-safe.
  const rows=all('[data-preview-provider]'),sections=all('[data-preview-section]'),count=document.querySelector('[data-preview-count]');
  const search=document.querySelector('[data-preview-search]'),source=document.querySelector('[data-preview-source]'),toggle=document.querySelector('[data-preview-toggle-all]'),clear=document.querySelector('[data-preview-clear]');
  const words=value=>String(value||'').toLowerCase().split(/\s+/).filter(Boolean);
  let typing=null;
  function syncToggle(){if(toggle)toggle.textContent=sections.some(section=>!section.hidden&&section.open)?'Collapse all sections':'Expand all sections';}
  function show(){
   const value=['outside','university'].includes(filter.value)?filter.value:'all',provider=source?source.value:'',terms=search?words(search.value):[];
   const active=value!=='all'||Boolean(provider)||terms.length>0;let visible=0;
   for(const row of rows){
    const text=(row.dataset&&row.dataset.previewText)||'';
    row.hidden=value!=='all'&&row.dataset.previewProvider!==value||Boolean(provider)&&row.dataset.previewSource!==provider||terms.length>0&&!terms.every(term=>text.includes(term));
    if(!row.hidden)visible++;
   }
   for(const section of sections){const owned=[...section.querySelectorAll('[data-preview-provider]')];section.hidden=owned.length>0&&owned.every(row=>row.hidden);if(active&&!section.hidden)section.open=true;}
   if(count)count.textContent=visible||!active?'Showing '+visible+' of '+rows.length+' course rows.':'No courses match. Try another word or clear the filters.';
   if(clear)clear.hidden=!active;
   syncToggle();
  }
  filter.disabled=false;filter.addEventListener('change',show);
  if(source){source.disabled=false;source.addEventListener('change',show);}
  if(search){search.disabled=false;search.addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(show,120);});search.addEventListener('keydown',event=>{if(event.key==='Escape'&&search.value){search.value='';show();}});}
  if(toggle){toggle.disabled=false;toggle.addEventListener('click',()=>{const open=!sections.some(section=>!section.hidden&&section.open);for(const section of sections)if(!section.hidden)section.open=open;syncToggle();});for(const section of sections)section.addEventListener?.('toggle',syncToggle);}
  if(clear)clear.addEventListener('click',()=>{filter.value='all';if(source)source.value='';if(search)search.value='';show();(search||filter).focus?.();});
  show();
 }
 const format=document.querySelector('[data-public-plan-format]');
 if(format){const cards=all('[data-plan-format]'),count=document.querySelector('[data-public-plan-count]');function show(){const value=['online','campus'].includes(format.value)?format.value:'all';let visible=0;for(const card of cards){card.hidden=value!=='all'&&card.dataset.planFormat!==value;if(!card.hidden)visible++;}for(const group of all('[data-plan-group]'))group.hidden=[...group.querySelectorAll('[data-plan-format]')].every(card=>card.hidden);if(count)count.textContent=visible+' course-plan preview'+(visible===1?'':'s')+'.';}format.disabled=false;format.addEventListener('change',show);show();}
 for(const calculator of all('[data-subscription-calculator]')){
  const inputs=['monthly','months','extras'].map(name=>calculator.querySelector('[data-calc-'+name+']')),result=calculator.querySelector('[data-calc-result]');
  if(inputs.some(input=>!input)||!result)continue;
  function calculate(){const values=inputs.map(input=>input.value.trim()===''?NaN:Number(input.value));if(values.some(value=>!Number.isFinite(value)||value<0)||values[0]>1000000||!Number.isInteger(values[1])||values[1]<1||values[1]>60||values[2]>1000000){result.textContent='Enter a monthly fee, 1–60 paid months, and any extra fees.';return;}const total=values[0]*values[1]+values[2];result.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(total)+' in entered provider charges';}
  for(const input of inputs){input.disabled=false;input.addEventListener('input',calculate);}calculator.addEventListener('submit',event=>event.preventDefault());calculate();
 }
}());
