/* Display planning ranges without changing a student's course or cost records. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DegreePlanEstimateView=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const valid=value=>value&&finite(value.min)&&finite(value.max)&&value.max>=value.min;
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
  const range=(value,format)=>value.min===value.max?format(value.min):format(value.min)+'–'+format(value.max);
  function safeURL(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  function available(value){return value?.available===true&&['planning-range','partial-range'].includes(value.status)&&value.costs?.currency==='USD'&&value.costs.complete===false&&value.costs.scope==='known-remaining-course-charges-before-aid'&&valid(value.costs.knownRange)&&valid(value.timing?.outsideMonths)&&valid(value.timing?.universityTerms);}
  function hasPersonalAssumptions(settings){
    if(!settings||typeof settings!=='object')return false;
    const defaults={sophiaMonths:1,studyMonths:1,concurrency:1};
    const keys=['universityRate','universitySubscriptionTerms','fees','feesConfirmed','outsideBudget','unitsPerTerm','sophiaMonths','studyMonths','sophiaWeeks','studyWeeks','clepWeeks','concurrency','termWeeks','termCredits','modernStates','voucherConfirmed'];
    return keys.some(key=>Object.hasOwn(settings,key)&&settings[key]!==''&&settings[key]!==null&&settings[key]!==undefined&&settings[key]!==false&&(!Object.hasOwn(defaults,key)||Number(settings[key])!==defaults[key]))||['providerQuotes','providerMonths','providerWeeks'].some(key=>settings[key]&&typeof settings[key]==='object'&&Object.values(settings[key]).some(value=>value!==''&&value!==null&&value!==undefined));
  }
  function render(value,{compact=false}={}){
    if(!available(value))return '';
    const costs=value.costs,timing=value.timing,known=range(costs.knownRange,money),outside=range(timing.outsideMonths,number)+' months';
    const terms=range(timing.universityTerms,number)+' '+(timing.universityTermMonths===6?'six-month terms':timing.termLabel==='semester'?'semesters':timing.termLabel==='trimester'?'trimesters':'study periods');
    // The compact (worksheet) view uses the same name and definition as plan pages, the finder and the planner.
    const heading=compact?'Planning estimate':value.status==='partial-range'?'Known charges so far':'Tuition, courses & listed fees';
    const basis=compact?'Before aid · covers tuition, listed fees and '+(value.status==='partial-range'?'priced ':'')+'outside courses':'Published-price planning range · Before aid';
    const overview='<div class="plan-estimate-heading"><span>'+esc(heading)+'</span><strong>'+esc(known)+'</strong></div><p class="plan-estimate-basis">'+esc(basis)+'</p>'+(value.status==='partial-range'?'<p class="plan-estimate-note">'+(compact?'Known charges so far. Some selected course prices are not included'+(list(costs.providerBreakdown).some(item=>!valid(item.cost))?': '+esc(list(costs.providerBreakdown).filter(item=>!valid(item.cost)).map(item=>item.provider).join(', ')):'')+'.':'Some selected course prices are not included.')+'</p>':'')+'<dl class="plan-estimate-times"><div><dt>Outside coursework</dt><dd>'+esc(outside)+'</dd></div><div><dt>University coursework</dt><dd>'+esc(terms)+'</dd></div></dl><p class="plan-estimate-note">Study pace is an assumption. Scheduling and transcript processing can add time; living costs are separate.</p>';
    if(compact)return '<section class="plan-estimate plan-estimate-compact" aria-label="Your remaining cost and study range">'+overview+'<button type="button" class="button ghost small" data-action="cost-time">See cost & timing</button></section>';
    const breakdown=[['University tuition',costs.universityTuition],['Listed university fees',costs.universityFees],['Outside courses',costs.outsideCourses]].filter(([,amount])=>valid(amount));
    const providers=list(costs.providerBreakdown).map(item=>'<tr><th scope="row">'+esc(item.provider)+'</th><td>'+esc(item.courses)+'</td><td>'+esc(valid(item.cost)?range(item.cost,money):'Not included')+'</td></tr>').join('');
    const sources=list(value.sources).slice(0,25).map(source=>{const url=safeURL(source.url);return url?'<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title)+'</a>'+(source.checkedOn?' <span>Reviewed '+esc(source.checkedOn)+'</span>':'')+'</li>':'';}).join('');
    return '<section class="plan-estimate" aria-label="Your remaining cost and study range">'+overview+'<details class="plan-estimate-details"><summary>Rates, pace assumptions &amp; exclusions</summary><dl class="plan-estimate-breakdown">'+breakdown.map(([label,amount])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(range(amount,money))+'</dd></div>').join('')+'</dl>'+(providers?'<table><caption>Selected outside courses still to take</caption><thead><tr><th scope="col">Provider</th><th scope="col">Courses</th><th scope="col">Cost range</th></tr></thead><tbody>'+providers+'</tbody></table>':'')+'<h3>Pace used in this example</h3><ul>'+list(timing.assumptions).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul><h3>What this range leaves out</h3><ul>'+list(costs.missing).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul><ul>'+list(value.notes).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>'+(sources?'<h3>Published rates and sources</h3><ul class="plan-estimate-sources">'+sources+'</ul>':'')+'</details></section>';
  }
  return Object.freeze({render,available,hasPersonalAssumptions});
}));
