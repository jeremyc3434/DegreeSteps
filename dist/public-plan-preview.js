/* Public previews and calculators never read or change a student's private draft. */
(function(){
 'use strict';
 const all=selector=>[...document.querySelectorAll(selector)];
 const filter=document.querySelector('[data-preview-filter]');
 if(filter){
  const rows=all('[data-preview-provider]'),sections=all('[data-preview-section]'),count=document.querySelector('[data-preview-count]');
  function show(){const value=['outside','university'].includes(filter.value)?filter.value:'all';let visible=0;for(const row of rows){row.hidden=value!=='all'&&row.dataset.previewProvider!==value;if(!row.hidden)visible++;}for(const section of sections){const owned=[...section.querySelectorAll('[data-preview-provider]')];section.hidden=owned.length>0&&owned.every(row=>row.hidden);if(value!=='all'&&!section.hidden)section.open=true;}if(count)count.textContent='Showing '+visible+' of '+rows.length+' course rows.';}
  filter.disabled=false;filter.addEventListener('change',show);show();
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
