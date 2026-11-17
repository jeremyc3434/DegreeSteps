/* Local, editable examples. This page never reads or awards a student's private credits. */
(function () {
  'use strict';
  const root=document.querySelector('[data-cost-comparison]'),node=document.getElementById('degree-cost-data'),Cost=window.DegreeCostComparison;
  if(!root||!node||!Cost)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const q=selector=>root.querySelector(selector),text=(selector,value)=>{const item=q(selector);if(item)item.textContent=value;};
  const money=Cost.money,plural=(n,label)=>n+' '+label+(n===1?'':'s');
  let data,selected,budget;const inputs=new Map();
  const links=sources=>'<ul class="cost-sources">'+sources.filter(source=>{try{const url=new URL(source.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}).map(source=>'<li><a href="'+esc(source.url)+'" target="_blank" rel="noopener">'+esc(source.title)+'</a></li>').join('')+'</ul>';
  const resultFor=entry=>Cost.calculate(entry,{...(inputs.get(entry.id)||{}),outsideBudget:budget});
  function error(message='') {const element=q('[data-cost-error]');element.textContent=message;element.hidden=!message;q('.cost-widget').classList.toggle('has-error',!!message);}
  function updateOtherExamples() {
    for(const card of root.querySelectorAll('[data-cost-entry]')) {
      const entry=data.entries.find(e=>e.id===card.dataset.costEntry);if(!entry)continue;const result=resultFor(entry);
      card.querySelector('[data-cost-card-before]').textContent=money(result.beforeTotal);
      card.querySelector('[data-cost-card-after]').textContent=money(result.afterTotal);
      card.querySelector('[data-cost-card-savings]').textContent=money(Math.abs(result.savings))+(result.savings<0?' more':' less')+' in this example';
      card.querySelector('[data-cost-card-scenario]').textContent=result.transferUnits+' '+entry.unitLabel+' transferred · '+result.remainingUnits+' remain';
      card.classList.toggle('negative',result.savings<0);
    }
    for(const row of root.querySelectorAll('[data-cost-table-entry]')) {
      const entry=data.entries.find(e=>e.id===row.dataset.costTableEntry);if(!entry)continue;const result=resultFor(entry);
      row.querySelector('[data-cost-row-before]').textContent=money(result.beforeTotal);
      row.querySelector('[data-cost-row-after]').textContent=money(result.afterTotal);
      row.querySelector('[data-cost-row-savings]').textContent=money(Math.abs(result.savings))+(result.savings<0?' more':' less');
      row.querySelector('[data-cost-row-transfer]').textContent=result.transferUnits+' '+entry.unitLabel;
      row.querySelector('[data-cost-row-timing]').innerHTML=esc(result.beforeTerms+' → '+result.afterTerms+' '+entry.pace.termLabel+'s')+'<small>'+esc(result.remainingUnits+' '+entry.unitLabel+' remain; outside study time is extra')+'</small>';
      row.classList.toggle('negative',result.savings<0);
    }
  }
  function render(result,entry,resetFields=false) {
    const paid=entry.model.type==='paid-term',scale=Math.max(result.beforeTotal,result.afterTotal,1),width=value=>(value/scale*100).toFixed(3)+'%';
    text('[data-cost-before]',money(result.beforeTotal));text('[data-cost-after]',money(result.afterTotal));text('[data-cost-savings]',money(Math.abs(result.savings)));
    text('[data-cost-savings-label]',result.savings<0?'higher cost in this example':result.savings===0?'difference in this example':'potential difference in this example');
    text('[data-cost-percent]',Math.round(Math.abs(result.savingsPercent))+'% '+(result.savings<0?'higher':result.savings===0?'difference':'lower'));
    text('[data-cost-timing]',result.beforeTerms+' → '+result.afterTerms+' '+(paid?'paid ':'')+entry.pace.termLabel+'s of university study');
    text('[data-cost-before-label]',paid?plural(result.beforeTerms,'paid '+entry.pace.termLabel)+' without transfer':'All '+entry.totalUnits+' '+entry.unitLabel+' at the university');
    text('[data-cost-after-label]',paid?plural(result.afterTerms,'paid '+entry.pace.termLabel)+' + outside-credit budget':result.remainingUnits+' university '+entry.unitLabel+' + outside-credit budget');
    q('[data-cost-before-bar]').style.width=width(result.beforeTotal);q('[data-cost-after-university-bar]').style.width=width(result.afterTuition);q('[data-cost-after-outside-bar]').style.width=width(result.outsideBudget);
    q('.cost-difference').classList.toggle('negative',result.savings<0);
    q('[data-cost-scenario]').innerHTML=esc('If '+result.transferUnits+' '+(entry.unitLabel==='CUs'?'WGU competency units (CUs)':entry.unitLabel)+' apply: '+result.remainingUnits+' '+entry.unitLabel+' remain at '+entry.shortName+'.')+' <strong>Planning example, before financial aid.</strong>';
    if(paid)q('[data-cost-scenario]').append(document.createTextNode(' Paid terms below are separate, editable assumptions.'));
    text('[data-cost-transfer-label]',entry.unitLabel==='CUs'?'Transfer units in this example (CUs)':'Transfer credits in this example');
    text('[data-cost-program]',entry.programReference);text('[data-cost-fees]',entry.feesNote);text('[data-cost-speed]',entry.speedNote);text('[data-cost-policy]',entry.policy.note);
    q('[data-cost-facts]').innerHTML='<li>'+esc('University charges shown: '+money(result.afterTuition)+'. Outside-credit budget used: '+money(result.outsideBudget)+'.')+'</li><li>'+esc(entry.transferNote)+'</li><li>'+esc(entry.coverageNote)+'</li>';
    q('[data-cost-sources]').innerHTML=links(entry.sources);
    q('[data-cost-pace-field]').hidden=paid;q('.cost-paid-term-controls').hidden=!paid;
    text('[data-cost-pace-label]',entry.unitLabel+' per '+entry.pace.termLabel);
    text('[data-cost-pace-note]',paid?'This school charges by paid term. Change the term counts to model a different pace. Transfer does not automatically reduce the price of a term.':'The same course load is used on both sides. A short final term follows published part-time rules where applicable.');
    q('[data-cost-pace]').min=entry.pace.min;q('[data-cost-pace]').max=entry.pace.max;q('[data-cost-transfer]').max=entry.scenarioTransferLimit;
    if(resetFields) {
      q('[data-cost-school]').value=entry.id;q('[data-cost-transfer]').value=result.transferUnits;q('[data-cost-budget]').value=budget;
      q('[data-cost-pace]').value=result.unitsPerTerm||entry.pace.defaultUnits;q('[data-cost-before-terms]').value=result.beforeTerms;q('[data-cost-after-terms]').value=result.afterTerms;
    } else if(result.zeroTransferTermReset) q('[data-cost-after-terms]').value=result.afterTerms;
    updateOtherExamples();error();
  }
  function activate(id) {
    const entry=data.entries.find(e=>e.id===id);if(!entry)return;
    const result=resultFor(entry);selected=id;render(result,entry,true);
  }
  function calculate() {
    const entry=data.entries.find(e=>e.id===selected),input={transferUnits:q('[data-cost-transfer]').value,outsideBudget:q('[data-cost-budget]').value};
    if(entry.model.type==='paid-term') {input.beforeTerms=q('[data-cost-before-terms]').value;input.afterTerms=q('[data-cost-after-terms]').value;}
    else input.unitsPerTerm=q('[data-cost-pace]').value;
    try {
      const result=Cost.calculate(entry,input);budget=Number(input.outsideBudget);const saved={...result.input};delete saved.outsideBudget;inputs.set(entry.id,saved);render(result,entry);
    } catch(e) {error(e.message+' The figures still show the last valid example.');}
  }
  try {
    data=JSON.parse(node.textContent);budget=data.defaultOutsideBudget;
    const requested=new URLSearchParams(location.search).get('school');activate(data.entries.some(e=>e.id===requested)?requested:data.defaultEntryId);
    root.querySelectorAll('input,select').forEach(element=>element.disabled=false);
    q('[data-cost-school]').addEventListener('change',event=>activate(event.target.value));
    root.addEventListener('input',event=>{if(event.target.matches('input'))calculate();});
    q('.cost-controls').addEventListener('submit',event=>{event.preventDefault();calculate();});
  } catch(e) {error('The editable comparison could not load. The published default examples remain available below.');}
}());
