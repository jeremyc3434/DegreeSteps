/* Shared degree-plan finder: one place for plan facts, filtering, sorting and the plan card used by
 * Find a degree (programs.html), Build my plan step 1 (start.html) and the worksheet's plan picker.
 * Pure: no storage, no network. Callers pass the plan-library index and any optional per-plan data. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreePlanFinder=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=v=>String(v||'').toLowerCase();
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const LEVELS={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
 const FORMATS={online:'Online',campus:'On campus'};
 const SORTS={cost:'Lowest cost first',outside:'Most credits for less',time:'Finish sooner',credits:'Best for my credits',az:'A–Z',school:'School',recommended:'Recommended'};
 const SELF_PACED=['competency-subscription','self-paced'];

 /**
  * A finder context. index: data/plan-library-index.json ({plans,subjects}). Optional: splits (Map of
  * routeId -> {outside,university,total} from the baseline index), worth (Map of routeId -> credits-worth result).
  */
 function context(options={}){
  const index=options.index&&typeof options.index==='object'?options.index:{};
  return {
   plans:index.plans&&typeof index.plans==='object'?index.plans:{},
   subjects:index.subjects&&typeof index.subjects==='object'?index.subjects:{},
   splits:options.splits instanceof Map?options.splits:new Map(),
   worth:options.worth instanceof Map?options.worth:new Map()
  };
 }
 const info=(ctx,p)=>ctx.plans[p?.id]||{tier:'reviewed',subjects:[],questions:[]};
 const needsConfirmation=(ctx,p)=>info(ctx,p).tier==='confirmation';
 const isSelfPaced=p=>SELF_PACED.includes(p?.paceModel);
 /** The plan's starting route: outside (low-cost) and total units, from the index or the baseline split. */
 function start(ctx,p){
  const s=info(ctx,p).start;
  if(s&&finite(s.outside)&&finite(s.total)&&s.total>0)return {outside:s.outside,university:finite(s.university)?s.university:s.total-s.outside,total:s.total};
  const b=ctx.splits.get(p?.id);
  if(b&&finite(b.outside)&&finite(b.total)&&b.total>0)return {outside:b.outside,university:finite(b.university)?b.university:b.total-b.outside,total:b.total};
  return null;
 }
 const share=(ctx,p)=>{const s=start(ctx,p);return s?s.outside/s.total:null;};
 const unit=p=>p?.school==='Western Governors University'?'units':'credits';
 const money=v=>v>=10000?'$'+(Math.round(v/100)/10).toLocaleString('en-US')+'k':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
 const fullMoney=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
 function estimate(ctx,p){const e=info(ctx,p).estimate;return e&&finite(e.min)&&finite(e.max)?e:null;}
 function costText(ctx,p){const e=estimate(ctx,p);if(!e)return '';return e.min===e.max?money(e.min):money(e.min)+'–'+money(e.max);}
 /** Months to finish at the fastest planned pace, when the index has timing. */
 function months(ctx,p){const t=info(ctx,p).timing;if(!t||!t.outsideMonths||!t.universityTerms||!finite(t.termMonths))return null;return t.outsideMonths.min+t.universityTerms.min*t.termMonths;}
 /** Credits a student's finished courses fill in this plan (credits-worth result), or null when unknown. */
 function filled(ctx,p){const r=ctx.worth.get(p?.id);return r&&r.status==='ok'&&finite(r.filled)?r.filled:null;}

 /**
  * Filters: q, subject, level, format ('online'|'campus'), school, minShare (0–100), confirm (include plans that
  * need school confirmation; default true), selfPaced, credit ('institutional'|'ace'|'nccrs') with policyOf(p).
  * searchText(p) may add text to the search haystack.
  */
 function matches(ctx,p,f={},helpers={}){
  const facts=info(ctx,p);
  if(f.subject&&!(facts.subjects||[]).includes(f.subject))return false;
  if(f.level&&p.level!==f.level)return false;
  if(f.format&&!(p.modalities||[]).includes(f.format))return false;
  if(f.school&&p.school!==f.school)return false;
  if(f.selfPaced&&!isSelfPaced(p))return false;
  if(f.confirm===false&&needsConfirmation(ctx,p))return false;
  const min=Number(f.minShare)||0;if(min){const s=share(ctx,p);if(!(s!==null&&Math.round(s*100)>=min))return false;}
  if(f.credit){const policy=helpers.policyOf?.(p)||{};if(!['accepted','case-by-case'].includes(policy[f.credit]?.status))return false;}
  const q=norm(f.q).trim();
  if(q){const hay=norm([p.school,p.title,p.id,LEVELS[p.level],...(facts.subjects||[]).map(id=>ctx.subjects[id]||id),helpers.searchText?.(p)].filter(Boolean).join(' '));if(!q.split(/\s+/).every(word=>hay.includes(word)))return false;}
  return true;
 }
 /** Sorted copy. Reviewed plans come before plans that need confirmation within equal keys. */
 function sort(ctx,list,key='cost'){
  const last=v=>v===null||v===undefined||!finite(v)?Infinity:v;
  const tie=(a,b)=>Number(needsConfirmation(ctx,a))-Number(needsConfirmation(ctx,b))||a.title.localeCompare(b.title)||a.school.localeCompare(b.school);
  const by={
   cost:(a,b)=>last(estimate(ctx,a)?.min)-last(estimate(ctx,b)?.min),
   outside:(a,b)=>(share(ctx,b)??-1)-(share(ctx,a)??-1),
   time:(a,b)=>last(months(ctx,a))-last(months(ctx,b)),
   credits:(a,b)=>(filled(ctx,b)??-1)-(filled(ctx,a)??-1)||last(estimate(ctx,a)?.min)-last(estimate(ctx,b)?.min),
   az:(a,b)=>a.title.localeCompare(b.title)||a.school.localeCompare(b.school),
   school:(a,b)=>a.school.localeCompare(b.school)||a.title.localeCompare(b.title),
   recommended:(a,b)=>Number(needsConfirmation(ctx,a))-Number(needsConfirmation(ctx,b))||Number(isSelfPaced(b))-Number(isSelfPaced(a))||a.school.localeCompare(b.school)||a.title.localeCompare(b.title)
  }[key]||(()=>0);
  return [...list].sort((a,b)=>by(a,b)||tie(a,b));
 }

 /**
  * One plan card. opts:
  *  hooks {card, school, badges, price, primary}: extra class names kept for existing page code and tests.
  *  primary {href, label, attrs}: the main action. links: extra action HTML. extra: HTML after the bar.
  *  meta: text under the title. badges: extra badge HTML. cost {value, note}: overrides the cost stat.
  *  compare {checked, disabled}: shows a Compare checkbox. dataProgram: also sets data-program.
  */
 function card(ctx,p,opts={}){
  const h=opts.hooks||{},s=start(ctx,p),cost=opts.cost||{value:costText(ctx,p)||'Ask the school',note:''},pct=s?Math.round(s.outside/s.total*100):0;
  const formats=(p.modalities||[]).map(m=>FORMATS[m]||m).join(' · '),worth=filled(ctx,p);
  const badges=[...(needsConfirmation(ctx,p)?['<span class="fd-badge fd-badge-confirm">Needs school confirmation</span>']:[]),...(opts.badges||[])].join('');
  const compare=opts.compare?'<label class="fd-compare"><input type="checkbox" data-compare="'+esc(p.id)+'"'+(opts.compare.checked?' checked':'')+(opts.compare.disabled&&!opts.compare.checked?' disabled':'')+'> Compare</label>':'';
  const primary=opts.primary?'<a class="fd-primary'+(h.primary?' '+esc(h.primary):'')+'" href="'+esc(opts.primary.href)+'"'+(opts.primary.attrs||'')+'>'+esc(opts.primary.label||'Build this plan')+'</a>':'';
  return '<article class="fd-card'+(h.card?' '+esc(h.card):'')+'" data-plan="'+esc(p.id)+'"'+(opts.dataProgram?' data-program="'+esc(p.id)+'"':'')+'>'
   +'<div class="fd-head"><p class="fd-school"><span class="'+esc(h.school||'fd-school-name')+'">'+esc(p.school)+'</span>'+(formats?' · '+esc(formats):'')+'</p><h2>'+esc(p.title)+'</h2>'
   +(opts.meta?'<p class="fd-meta">'+esc(opts.meta)+'</p>':'')
   +(badges?'<div class="fd-badges'+(h.badges?' '+esc(h.badges):'')+'">'+badges+'</div>':'')+'</div>'
   +'<div class="fd-stats"><div class="fd-stat'+(h.price?' '+esc(h.price):'')+'"><span>Est. cost</span><strong>'+esc(cost.value)+'</strong>'+(cost.note?'<small>'+esc(cost.note)+'</small>':'')+'</div>'
   +'<div class="fd-stat fd-stat-accent"><span>Low-cost '+unit(p)+'</span><strong>'+(s?s.outside+' of '+s.total:'—')+'</strong></div></div>'
   +(s?'<div class="fd-bar" role="img" aria-label="'+esc(s.outside+' of '+s.total+' '+unit(p)+' can come from low-cost courses')+'"><span style="width:'+pct+'%"></span></div>':'')
   +(worth!==null&&worth>0?'<p class="fd-worth">Your finished courses could fill <strong>'+esc(String(worth))+'</strong> '+unit(p)+'</p>':'')
   +(opts.extra||'')
   +((primary||opts.links||compare)?'<div class="fd-actions">'+primary+(opts.links||'')+compare+'</div>':'')
   +'</article>';
 }
 return {LEVELS,FORMATS,SORTS,context,info,needsConfirmation,isSelfPaced,start,share,unit,money,fullMoney,estimate,costText,months,filled,matches,sort,card,esc};
}));
