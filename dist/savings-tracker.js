/* Local, course-plan-based estimates. The application owns saving student choices. */
(function () {
  'use strict';
  const snapshots = new WeakMap(), tickets = new WeakMap();
  let dataPromise, sequence = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => {const cents = Math.abs(value) > 0 && Math.abs(value) < 1; return new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',minimumFractionDigits:cents?2:0,maximumFractionDigits:cents?2:0}).format(value);};
  const number = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:1}).format(value || 0);
  const safeURL = value => {try {const url = new URL(value, location.href); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';} catch {return '';}};
  function data() {
    if (!dataPromise) dataPromise = fetch('data/cost-comparisons.json').then(response => {if (!response.ok) throw new Error('Cost sources unavailable'); return response.json();}).catch(error => {dataPromise = null; throw error;});
    return dataPromise;
  }
  function shell(node, compact, isPending, simple = false, secondary = false) {
    if (!node.querySelector('.savings-strip')) node.innerHTML = '<section class="savings-strip" aria-label="Your savings estimate"><div class="savings-content"></div><div class="savings-delta" role="status" aria-live="polite" aria-atomic="true"></div></section>';
    node.querySelector('.savings-strip').className = 'savings-strip'+(compact?' savings-compact':'')+(isPending?' savings-pending':'')+(simple?' savings-simple':'')+(secondary?' savings-secondary':'');
    return node.querySelector('.savings-content');
  }
  function settingsHTML(entry, id, values) {
    const pace = entry?.pace || {}, term = pace.termLabel || 'term';
    return '<div class="savings-settings" role="group" aria-label="Adjust estimate assumptions"><label for="'+id+'-budget">Outside-course budget ($)<input id="'+id+'-budget" name="savings-budget" type="number" inputmode="decimal" min="0" max="100000" step="0.01" value="'+esc(values.outsideBudget)+'"></label><label for="'+id+'-pace">University credits per '+esc(term)+'<input id="'+id+'-pace" name="savings-pace" type="number" inputmode="numeric" min="'+esc(pace.min || 1)+'" max="'+esc(pace.max || 30)+'" step="1" value="'+esc(values.unitsPerTerm)+'"></label><button type="button" class="savings-apply" name="savings-apply">Apply</button><span class="savings-setting-error" role="alert"></span></div>';
  }
  function bindSettings(node, options, entry) {
    const apply = node.querySelector('.savings-apply');
    if (!apply) return;
    apply.addEventListener('click', () => {
      const budget = node.querySelector('[name="savings-budget"]'), pace = node.querySelector('[name="savings-pace"]'), error = node.querySelector('.savings-setting-error');
      if (!budget.value.trim() || !pace.value.trim() || !budget.checkValidity() || !pace.checkValidity()) {
        error.textContent = 'Enter an outside-course budget from $0 to $100,000 (up to two decimal places) and a whole-number credit pace from '+(entry?.pace?.min || 1)+' to '+(entry?.pace?.max || 30)+'.';
        (!budget.checkValidity() || !budget.value.trim() ? budget : pace).focus(); return;
      }
      error.textContent = '';
      if (typeof options.onChange === 'function') options.onChange({outsideBudget:Number(budget.value),unitsPerTerm:Number(pace.value)});
    });
  }
  function recoveryValues(state, snapshot, entry, costs) {
    const saved = state.savings?.[snapshot.programId] || {}, pace = entry.pace || {};
    const amount = value => typeof value === 'number' ? value : typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN;
    const budget = amount(saved.outsideBudget), units = amount(saved.unitsPerTerm);
    return {
      outsideBudget:Number.isFinite(budget) && budget >= 0 && budget <= 100000 && Math.abs(budget*100-Math.round(budget*100)) < 0.000001 ? budget : costs.defaultOutsideBudget ?? 2000,
      unitsPerTerm:Number.isInteger(units) && units >= (pace.min || 1) && units <= (pace.max || 30) ? units : pace.defaultUnits || 15
    };
  }
  function publishedRate(draft) {
    const pricing=draft?.program?.pricing||{},sources=new Map((draft?.program?.sources||[]).map(source=>[source.id,source]));
    if(!Array.isArray(pricing.sourceIds)||!pricing.sourceIds.length||!pricing.sourceIds.every(id=>{try{return new URL(sources.get(id)?.url).protocol==='https:';}catch{return false;}}))return '';
    if(['subscription','per-term','per-semester'].includes(pricing.model)&&Number.isFinite(pricing.amount)&&pricing.amount>0)return money(pricing.amount)+' per '+(pricing.period||'term');
    if(pricing.model==='banded-term'&&Number.isFinite(pricing.termRate)&&pricing.termRate>0&&Number.isFinite(pricing.bandMin)&&Number.isFinite(pricing.bandMax))return money(pricing.termRate)+' per semester at '+pricing.bandMin+'–'+pricing.bandMax+' credits';
    if(pricing.model==='threshold-credit'&&Number.isFinite(pricing.fullTimeRate)&&pricing.fullTimeRate>0&&Number.isFinite(pricing.fullTimeMin))return money(pricing.fullTimeRate)+' per credit at '+pricing.fullTimeMin+' or more credits per semester';
    return '';
  }
  function courseResearchHTML(draft) {
    const plan=draft?.plan;if(!plan)return '';
    const view=window.DegreeCoursePlanView?.build(draft),missing=view?.totals?.unmapped??0,conditional=plan.coverage?.conditionalExternalCredits||0;
    return (missing?'<p class="savings-confirmation">DegreeSteps is still researching named course choices for '+number(missing)+' credits.</p>':'')+(conditional?'<p class="savings-confirmation">'+number(conditional)+' outside credits in this estimate have specific eligibility conditions. See the affected courses in your plan.</p>':'');
  }
  function pending(node, reason, compact, recovery, draft, simple = false) {
    const rate=publishedRate(draft),message = reason || 'A savings comparison is not available for this degree yet. You can still estimate its remaining costs.';
    if(node.dataset.savingsUnavailable==='true'){node.hidden=false;delete node.dataset.savingsUnavailable;}
    shell(node,compact,true,simple).innerHTML = '<div class="savings-pending-heading"><div><span class="savings-label">Costs & savings</span><strong class="savings-pending-title">'+esc(rate||'Savings estimate pending')+'</strong>'+(rate?'<p class="savings-published-rate">Published tuition · personal pace and fees are separate.</p>':'')+'<p>'+esc(message)+'</p></div><div class="savings-pending-actions">'+(draft?.program&&draft?.plan?'<a class="savings-compare" href="plan.html?task=cost-time">Set my pace and costs <span aria-hidden="true">→</span></a>':'')+'<a class="savings-compare" href="compare/">Compare published costs <span aria-hidden="true">↗</span></a></div></div>'+(recovery?'<div class="savings-recovery">'+(recovery.quoteIssue?'<p>Your saved tuition quote could not be used. Open Cost and study pace to correct your university price per credit, then return to this estimate.</p>':'<p>Your saved assumptions could not be used. Review these suggested values and select Apply to replace them. Your saved values stay unchanged until then.</p>'+settingsHTML(recovery.entry,recovery.id,recovery.values))+'<a class="savings-recovery-quote" href="plan.html?task=cost-time">'+(recovery.quoteIssue?'Correct my university tuition quote':'Review my pace and costs')+'</a></div>':'');
    node.querySelector('.savings-delta').textContent = '';
  }
  function detailsHTML(snapshot, entry, costs, id, simple = false, draft = {}, secondary = false) {
    const p = snapshot.projected, a = snapshot.assumptions || {}, pace = entry?.pace || {}, term = pace.termLabel || 'term';
    const links = (entry?.sources || []).slice(0, 3).map(source => {const url = safeURL(source.url); return url ? '<li><a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(source.title)+'</a></li>' : '';}).join('');
    const basis = snapshot.rateBasis === 'your-quote' ? 'Uses your university tuition quote' : entry?.id === 'tesu-standard' ? 'Uses published standard nonresident university tuition' : 'Uses published standard university tuition';
    const notes = (snapshot.notes || []).filter(note => typeof note === 'string').map(note => '<li>'+esc(note)+'</li>').join('');
    return '<details class="savings-details"><summary>'+(simple?'Estimate details':'How estimated')+' <span aria-hidden="true">⌄</span></summary><div class="savings-detail-body"><p class="savings-basis">'+esc(basis)+'. Calculated from the outside courses selected in this plan.</p><dl class="savings-breakdown"><div><dt>University tuition without this transfer plan</dt><dd>'+money(p.beforeTuition)+'</dd></div><div><dt>University tuition with this plan</dt><dd>'+money(p.afterTuition)+'</dd></div><div><dt>Budget for outside courses and exams</dt><dd>'+money(p.outsideBudget)+'</dd></div><div class="savings-breakdown-total"><dt>'+(p.netDifference < 0 ? 'Estimated extra cost' : 'Estimated difference')+'</dt><dd>'+money(Math.abs(p.netDifference))+'</dd></div></dl>'+(simple&&!secondary?'<p class="savings-assumptions">University terms avoided: '+number(p.termsAvoided)+' '+esc(term)+(p.termsAvoided === 1 ? '' : 's')+'. This is not your total time saved.</p>':'')+'<p class="savings-assumptions">'+(secondary?'This is a tuition-only comparison: university fees are not counted, and outside courses use a planning allowance instead of provider prices. The planning estimate above covers tuition, listed fees and outside courses. ':'')+'Before financial aid, military benefits, scholarships and discounts. Excludes university fees, books, housing and living costs. Your outside-course budget is a planning allowance, not a price quote. Outside study and transcript processing take additional time.</p>'+(notes?'<ul class="savings-model-notes">'+notes+'</ul>':'')+settingsHTML(entry,id,{outsideBudget:a.outsideBudget ?? p.outsideBudget,unitsPerTerm:a.unitsPerTerm || pace.defaultUnits || 15})+'<p class="savings-confirmation">Finished courses and the school’s credit award stay separate. School-confirmed transfer credits: '+number(snapshot.confirmed?.transferCredits ?? snapshot.earned?.confirmedCredits)+'.</p>'+courseResearchHTML(draft)+'<details class="savings-sources"><summary>Published sources · checked '+esc(costs.checkedOn || 'recently')+'</summary><ul>'+links+'</ul><a href="compare/">See school cost comparisons</a></details></div></details>';
  }
  async function update(node, state, draft, options = {}) {
    if (!node) return null;
    const ticket = (tickets.get(node) || 0) + 1; tickets.set(node, ticket);
    // secondary: a shared planning range is the headline above this node, so the tuition
    // comparison is shown as a labelled supporting figure and an unavailable comparison stays quiet.
    const compact = Boolean(options.compact), simple = Boolean(options.simple), secondary = Boolean(options.secondary);
    try {
      const costs = await data();
      if (tickets.get(node) !== ticket) return null;
      if (!window.DegreeSavings) {pending(node, 'The savings estimate could not load. Your plan and course progress are unchanged.', compact, null, draft, simple); return null;}
      const next = window.DegreeSavings.calculate(state, draft, costs), previous = snapshots.get(node);
      const entry = costs.entries.find(item => item.id === next.entryId);
      const id = node.dataset.savingsId || ('degree-savings-'+(++sequence)); node.dataset.savingsId = id;
      if (!next.available || !next.projected) {
        snapshots.set(node, next);
        const recovery = next.reasonCode === 'assumptions-need-review' && entry ? {entry,id,values:recoveryValues(state,next,entry,costs),quoteIssue:/university tuition per credit/i.test(next.reason || '')} : null;
        const reason=(next.reasonCode==='cost-model-needed'||next.reasonCode==='course-map-needed'&&draft?.program&&draft?.plan)?'A savings comparison is not available for this exact degree yet. You can still estimate its remaining costs.':next.reason;
        if(secondary&&!recovery){node.innerHTML='';node.hidden=true;node.dataset.savingsUnavailable='true';return next;}
        pending(node, reason, compact,recovery,draft,simple);
        if (recovery) bindSettings(node,options,entry);
        return next;
      }
      if(node.dataset.savingsUnavailable === 'true'){node.hidden=false;delete node.dataset.savingsUnavailable;}
      const p = next.projected, earned = next.earned || {};
      const delta = previous && window.DegreeSavings.delta(previous, next);
      const expanded = node.querySelector('.savings-details')?.open || false;
      const focused = node.contains(document.activeElement) ? document.activeElement.name : '';
      const avoided = p.termsAvoided, term = entry?.pace?.termLabel || 'term';
      const completion = earned.transferCredits ?? ((earned.reportedCredits || 0) + (earned.confirmedCredits || 0));
      const total = Math.max(p.transferCredits || 0, completion || 0, 1), completedPercent = Math.min(100, completion / total * 100), confirmedPercent = Math.min(100, (earned.confirmedCredits || 0) / total * 100);
      const progressLabel = number(p.transferCredits)+' planned · '+number(completion)+' completed · '+number(earned.confirmedCredits)+' confirmed';
      const isExtraCost = p.netDifference < 0;
      const rateLabel = next.rateBasis === 'your-quote' ? 'Your tuition quote' : entry?.id === 'tesu-standard' ? 'Standard nonresident tuition' : 'Standard published tuition';
      const moneyContext = (next.provisional ? 'Provisional · ' : '') + rateLabel + ' · before aid or benefits';
      const scope = 'Outside courses budgeted; other fees excluded.';
      const unresolved = draft?.plan?.coverage?.conditionalExternalCredits ? number(draft.plan.coverage.conditionalExternalCredits)+' outside credits have specific eligibility conditions.' : '';
      const pricingLink = next.rateBasis !== 'your-quote' ? '<a href="plan.html?task=cost-time">Use my tuition rate</a>' : '';
      const content = shell(node,compact,false,simple,secondary), unitName = draft?.program?.creditSystem === 'competency-unit' ? 'competency units' : 'credits';
      if(secondary){
        const basis = next.rateBasis === 'your-quote' ? 'your tuition quote' : entry?.id === 'tesu-standard' ? 'standard nonresident tuition' : 'standard published tuition';
        content.innerHTML = '<div class="savings-secondary-overview"><p class="savings-secondary-line"><span class="savings-label">Tuition-only comparison</span> <strong class="savings-money'+(isExtraCost?' savings-extra-cost':'')+'" data-savings="money">'+money(Math.abs(p.netDifference))+'</strong> '+(isExtraCost?'more':'less')+' than taking every course at the university</p><p class="savings-simple-basis">Uses '+esc(basis)+' with and without this plan, minus a '+money(p.outsideBudget)+' outside-course allowance. University fees are not counted here, so this is not the planning estimate. <span data-savings="progress">'+number(p.transferCredits)+' outside '+unitName+' · '+number(completion)+' finished</span></p></div>'+detailsHTML(next,entry,costs,id,true,draft,true);
      } else if(simple){
        const shortBasis = next.rateBasis === 'your-quote' ? 'Your tuition quote' : entry?.id === 'tesu-standard' ? 'Standard nonresident tuition estimate before aid' : 'Standard tuition estimate before aid';
        content.innerHTML = '<div class="savings-simple-overview"><div class="savings-metric savings-money'+(isExtraCost?' savings-extra-cost':'')+'"><span class="savings-label">'+(isExtraCost?'Estimated extra cost':'Estimated savings')+'</span><strong data-savings="money">'+money(Math.abs(p.netDifference))+'</strong></div><div class="savings-simple-credits"><span class="savings-label">Outside credits</span><strong data-savings="progress">'+number(p.transferCredits)+' '+unitName+' <small>· '+number(completion)+' finished</small></strong></div></div><p class="savings-simple-basis">'+esc(shortBasis)+'; outside-course budget included, other fees extra.</p>'+detailsHTML(next,entry,costs,id,true,draft);
      }else content.innerHTML = '<div class="savings-overview"><div class="savings-metric savings-money'+(isExtraCost?' savings-extra-cost':'')+'"><span class="savings-label">'+(isExtraCost?'Estimated extra cost':'Estimated savings')+'</span><strong data-savings="money">'+money(Math.abs(p.netDifference))+'</strong><span class="savings-caption">'+esc(moneyContext)+'</span></div><div class="savings-metric savings-time"><span class="savings-label">University terms avoided</span><strong data-savings="terms">'+number(avoided)+' <span>'+esc(term)+(avoided === 1 ? '' : 's')+'</span></strong><span class="savings-caption">Outside study and transcript processing take additional time</span></div><div class="savings-progress"><span class="savings-label">Your outside credits</span><div class="savings-progress-track" aria-hidden="true"><span class="savings-reported" style="width:'+completedPercent+'%"></span><span class="savings-confirmed" style="width:'+confirmedPercent+'%"></span></div><span class="savings-progress-text" data-savings="progress">'+esc(progressLabel)+'</span><span class="savings-caption savings-progress-note">Finished courses and credit awards are tracked separately</span></div></div><p class="savings-scope">'+esc([scope,unresolved].filter(Boolean).join(' '))+' '+pricingLink+'</p>'+detailsHTML(next, entry, costs, id,false,draft);
      node.querySelector('.savings-delta').textContent = delta?.changed ? delta.message || '' : '';
      if (expanded) node.querySelector('.savings-details').open = true;
      if (focused) node.querySelector('[name="'+focused+'"]')?.focus({preventScroll:true});
      bindSettings(node,options,entry);
      snapshots.set(node, next);
      return next;
    } catch {
      if (tickets.get(node) === ticket) pending(node, 'The savings estimate could not load. Your plan and course progress are unchanged.', compact, null, draft, simple);
      return null;
    }
  }
  window.DegreeSavingsTracker = Object.freeze({update});
}());
