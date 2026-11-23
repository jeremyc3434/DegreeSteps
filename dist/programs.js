(function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),norm=v=>String(v||'').toLowerCase(),P=window.DegreeProgramOpportunities;
let catalog,data,rows=[],limit=30,preset='all',restoreFocus=null,splits=new Map(),index={plans:{},subjects:{}},freshness={};
const levels={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
const mark=school=>({'Western Governors University':'WGU','Liberty University':'LU','Thomas Edison State University':'TESU','Grand Canyon University':'GCU','Southern New Hampshire University':'SNHU'})[school]||String(school||'').split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).join('').slice(0,4);
// Plan facts, filters, sorting and the plan card come from the shared finder (plan-finder.js), the same module
// Build my plan uses. This page adds the school, credit-source, share and pace filters, details and Compare.
const F=window.DegreePlanFinder,worth=new Map();let ctx=F.context({});
const schoolFor=p=>P.schoolFor(data,p),price=p=>P.priceText(p,schoolFor(p)),pace=p=>P.paceText(p),isSelf=p=>F.isSelfPaced(p);
// Review tier, browsing subjects and open questions come from data/plan-library-index.json.
const info=p=>F.info(ctx,p),needsConfirmation=p=>F.needsConfirmation(ctx,p);
const money=v=>F.fullMoney(v);
// Weekly source freshness (data/plan-freshness.json): a neutral note while a cited school page is rechecked. Optional.
const freshnessNote=p=>{const f=freshness[p.id];if(f?.status!=='rechecking'||!/^\d{4}-\d{2}-\d{2}$/.test(f.since||''))return '';return '<p class="pf-freshness" role="note">Rechecking: the school updated a source page on '+esc(new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(f.since+'T00:00:00Z')))+'.</p>';};
const filters=()=>({q:$('program-search').value,school:$('program-school').value,level:$('program-level').value,subject:$('program-subject').value,minShare:Number($('program-share').value)||0,credit:$('program-credit').value,confirm:$('program-confirm').checked,selfPaced:preset==='self-paced',format:['online','campus'].includes(preset)?preset:''});
const helpers={policyOf:p=>p.effectiveTransferPolicy||schoolFor(p)?.transferPolicy||{},searchText:p=>pace(p)};
const matches=p=>F.matches(ctx,p,filters(),helpers);
// The cost stat keeps this page's exact wording: a planning estimate, known charges so far, or published tuition.
function costFor(p){
 const e=F.estimate(ctx,p);
 if(e)return e.partial?{value:F.costText(ctx,p),note:'Known charges so far · '+((e.unpriced||[]).join(' and ')||'Some course')+' prices not included'}:{value:F.costText(ctx,p),note:'Before aid · tuition, fees and outside courses'};
 if(needsConfirmation(p))return /^\$/.test(price(p))?{value:price(p),note:'Published tuition only · full cost needs confirmation'}:{value:'Needs confirmation',note:'No reviewed planning estimate yet'};
 return {value:price(p),note:'Tuition and course details in the plan'};
}
const hrefFor=p=>F.start(ctx,p)?'portal.html?usePlan='+encodeURIComponent(p.id):'portal.html?school='+encodeURIComponent(p.school)+'&program='+encodeURIComponent(p.id)+'&level='+encodeURIComponent(p.level);
// ---------- Compare: up to three plans, kept for this browser tab only ----------
const COMPARE_KEY='degreesteps-compare-v1',idOK=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(v);
let compared=(()=>{try{const v=JSON.parse(sessionStorage.getItem(COMPARE_KEY)||'[]');return Array.isArray(v)?v.filter(idOK).slice(0,3):[];}catch{return [];}})();
function storeCompared(){try{sessionStorage.setItem(COMPARE_KEY,JSON.stringify(compared));}catch{/* The bar still works for this page. */}}
function renderCompare(){
 compared=compared.filter(id=>rows.some(p=>p.id===id));const bar=$('finder-compare-bar');if(!bar)return;
 bar.hidden=!compared.length;const names=compared.map(id=>rows.find(p=>p.id===id)).filter(Boolean).map(p=>p.title+' ('+p.school+')');
 $('finder-compare-text').textContent=compared.length?compared.length+' of 3 selected: '+names.join(', ')+(compared.length<2?'. Pick one more to compare.':''):'';
 const go=$('finder-compare-go');go.href='compare-plans.html?plans='+compared.map(encodeURIComponent).join(',');go.setAttribute('aria-disabled',String(compared.length<2));go.textContent='Compare '+compared.length;
}
// ---------- Best for my credits: the credits-worth engine, run in its worker on this device ----------
const KEY='degreepath-guide-v3';
function finishedRecords(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return window.DegreeCreditsWorth?.completedRecords?window.DegreeCreditsWorth.completedRecords(s):[];}catch{return [];}}
let worthWorker=null,worthRun=0,worthState='idle';
function checkCredits(){
 const records=finishedRecords();if(!records.length){worthState='none';render();return;}
 if(worthState==='running'||worthState==='done')return;
 if(typeof Worker!=='function'){worthState='error';render();return;}
 worthState='running';worth.clear();worthRun++;const run=worthRun;
 try{worthWorker=worthWorker||new Worker('credits-worth-worker.js');}catch{worthState='error';render();return;}
 worthWorker.onmessage=event=>{const m=event.data;if(!m||m.id!==run)return;if(m.event==='result'&&m.result?.routeId){worth.set(m.result.routeId,m.result);queueRender();}else if(m.event==='done'){worthState='done';render();}else if(m.event==='error'){worthState='error';render();}};
 worthWorker.onerror=()=>{worthState='error';render();};
 worthWorker.postMessage({id:run,kind:'rank',learning:records});render();
}
let frame=0;const queueRender=()=>{if(frame)return;frame=(window.requestAnimationFrame||setTimeout)(()=>{frame=0;render();});};
function creditsHint(){
 const hint=$('program-credits-hint');if(!hint)return;const option=$('program-sort').querySelector('option[value="credits"]'),has=finishedRecords().length>0;
 if(option)option.disabled=!has;
 if(!has){if($('program-sort').value==='credits')$('program-sort').value='cost';hint.innerHTML='<a href="credits-worth.html">Add courses you finished</a> to sort degrees by how much they count.';return;}
 hint.textContent=$('program-sort').value!=='credits'?'':worthState==='running'?'Checking your finished courses against each plan…':worthState==='error'?'Your courses couldn’t be checked right now. Reload to try again.':'Sorted by how many credits your finished courses could fill. Your school makes the final decision.';
}
function cardFor(p){
 const choiceCount=DegreeProgramCatalog.planChoiceCount(p,catalog),page=typeof info(p).page==='string'&&/^\/degree-plans\/[a-z0-9-]+\/$/.test(info(p).page)?info(p).page:'';
 const badges=['<span class="fd-badge pf-badge">'+esc(pace(p))+'</span>',needsConfirmation(p)?'':'<span class="fd-badge fd-badge-ready pf-badge pf-badge-ready">Reviewed plan</span>','<span class="fd-badge pf-badge">Full requirement plan</span>',choiceCount>0?'<span class="fd-badge pf-badge">'+choiceCount+' course choice'+(choiceCount===1?'':'s')+' to make</span>':''].filter(Boolean);
 const question=needsConfirmation(p)?'<p class="fd-note pf-confirm-note"><strong>Open question:</strong> '+esc(info(p).questions?.[0]||'Some details still need confirmation with the school.')+(info(p).questions?.length>1?' <span>+'+(info(p).questions.length-1)+' more in details</span>':'')+'</p>':'';
 return F.card(ctx,p,{hooks:{card:'pf-program',school:'pf-school',badges:'pf-badges',price:'pf-price',primary:'pf-button pf-button-primary pf-open-plan'},dataProgram:true,meta:(levels[p.level]||p.level),badges,cost:costFor(p),extra:freshnessNote(p)+question,
  primary:{href:hrefFor(p),label:'Build this plan'},links:'<button type="button" class="fd-link" data-program-details="'+esc(p.id)+'">Details</button>'+(page?'<a class="fd-link" href="'+esc(page)+'">See every course</a>':''),
  compare:{checked:compared.includes(p.id),disabled:compared.length>=3}});
}
function render(){
 $('program-college-tip').hidden=$('program-credit').value!=='institutional'||['master','doctorate','specialist'].includes($('program-level').value);
 creditsHint();
 const filtered=F.sort(ctx,rows.filter(matches),$('program-sort').value||'cost');
 const pending=filtered.filter(needsConfirmation).length,schools=new Set(filtered.map(p=>p.school)).size;$('program-legend').hidden=!pending;$('program-count').textContent=!filtered.length?'No course plans match these filters':filtered.length+' course plan'+(filtered.length===1?'':'s')+' · '+schools+' school'+(schools===1?'':'s')+(pending?' · '+pending+(pending===1?' needs':' need')+' school confirmation':'');
 document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===preset)));
 $('program-results').innerHTML=filtered.slice(0,limit).map(cardFor).join('')||'<div class="pf-empty"><h2>No course plan matches these filters.</h2><p>Try different choices, or create a plan for your exact degree.</p><button type="button" id="program-reset">Clear filters</button><a class="pf-plan-link" href="request-plan.html">Build from a degree link</a></div>';
 $('program-more').hidden=filtered.length<=limit;
 renderCompare();
}
function details(id){
 const p=rows.find(p=>p.id===id);if(!p)return;
 restoreFocus=document.activeElement;const choices=DegreeProgramCatalog.planChoiceCount(p,catalog),school=schoolFor(p),href=hrefFor(p);
 $('program-dialog-content').innerHTML='<div class="pf-dialog-heading"><span class="pf-school">'+esc(p.school)+'</span><h2>'+esc(p.title)+'</h2><p>'+esc(levels[p.level]||p.level)+' · '+esc(pace(p))+'</p></div>'+freshnessNote(p)+(needsConfirmation(p)?'<section class="pf-confirm-detail"><h3>What still needs school confirmation</h3><ul>'+info(p).questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul><p>The course plan is complete, but these points are not yet confirmed in the school’s published rules. Ask the school about them before paying for outside courses.</p></section>':'')+P.detailsHTML(p,school)+'<p class="pf-map-note">Includes the full degree requirements. '+(choices>0?choices+' course choice'+(choices===1?'':'s')+' to make. ':'')+'Each course shows its degree placement and any specific conditions. Your college records the final credit award.</p><div class="pf-dialog-actions"><a class="pf-button pf-button-primary" data-choose-program href="'+esc(href)+'">Build this degree plan</a><a href="school.html?school='+encodeURIComponent(p.school)+'">Read about this school</a><a href="'+esc(p.url||school?.url)+'" target="_blank" rel="noopener">Official program source</a></div>';
 $('program-dialog').showModal();
}
// "See courses" makes that plan the active plan (the previous one is kept as a saved version). A student
// who already has a plan with progress is asked first; first-time visitors keep the one-click path.
function activePlan(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'null'),id=s?.selectedPathwayId||s?.profile?.pathwayId;if(!s||typeof s!=='object'||s.sheet?.isExample||typeof id!=='string'||!id)return null;
  const scenarios=s.scenarios&&typeof s.scenarios==='object'?Object.values(s.scenarios):[];
  const progress=(Array.isArray(s.learning)&&s.learning.length>0)||scenarios.some(x=>x&&typeof x==='object'&&Object.keys(x.optionSelections||{}).length>0);
  return progress?{id}:null;}catch{return null;}
}
function confirmSwitch(p,href){
 restoreFocus=document.activeElement;const page=typeof info(p).page==='string'&&/^\/degree-plans\/[a-z0-9-]+\/$/.test(info(p).page)?info(p).page:'';
 $('program-switch-content').innerHTML='<h2 id="program-switch-title">Switch your plan to '+esc(p.title)+'?</h2><p>Your current plan and courses stay saved.</p><div class="pf-dialog-actions"><a class="pf-button pf-button-primary" data-switch-plan href="'+esc(href)+'">Switch</a>'+(page?'<a class="pf-button" data-preview-plan href="'+esc(page)+'">Just preview</a>':'<button type="button" class="pf-button" data-preview-plan="'+esc(p.id)+'">Just preview</button>')+'</div>';
 $('program-switch-dialog').showModal();$('program-switch-dialog').querySelector('[data-switch-plan]').focus();
}
document.addEventListener('click',e=>{
 const open=e.target.closest('a.pf-open-plan');
 if(open&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){const p=rows.find(r=>r.id===open.closest('[data-program]')?.dataset.program),active=activePlan();if(!p||!active||active.id===p.id)return;e.preventDefault();confirmSwitch(p,open.getAttribute('href'));return;}
 const preview=e.target.closest('button[data-preview-plan]');if(preview){const focus=restoreFocus;$('program-switch-dialog').close();details(preview.dataset.previewPlan);restoreFocus=focus;}
});
$('program-switch-dialog').addEventListener('close',()=>{if(!$('program-dialog').open)restoreFocus?.isConnected&&restoreFocus.focus({preventScroll:true});});
function reset(){for(const id of['program-search','program-school','program-level','program-credit','program-subject','program-share'])$(id).value='';$('program-sort').value='cost';$('program-confirm').checked=true;preset='all';limit=30;render();}
// Anonymous aggregate counter (growth-metrics.js): the finder was used to narrow plans. No filter values are sent.
const growth=(event,extra={})=>{try{window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event,context:'workspace',...extra}}));}catch{/* Measurement never blocks the page. */}};
const finderUsed=()=>growth('finder_used');
$('program-filters').addEventListener('submit',e=>{e.preventDefault();limit=30;render();finderUsed();});
// The search box already re-renders on input; its change event fires on blur and would replace the
// card a student is tapping, losing that tap.
for(const type of ['input','change'])$('program-filters').addEventListener(type,e=>{if(type==='change'&&e.target?.id==='program-search')return;limit=30;render();finderUsed();});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preset){preset=b.dataset.preset;limit=30;render();finderUsed();}else if(b.dataset.programDetails)details(b.dataset.programDetails);else if(b.id==='program-more'){limit+=30;render();}else if(b.id==='program-reset')reset();else if(b.id==='program-dialog-close')$('program-dialog').close();});
$('program-sort').addEventListener('change',()=>{limit=30;if($('program-sort').value==='credits')checkCredits();render();});
// Compare: tick up to three cards; the bar opens compare-plans.html with them preselected.
document.addEventListener('change',e=>{const box=e.target.closest?.('input[data-compare]');if(!box)return;const id=box.dataset.compare;if(!idOK(id))return;
 compared=box.checked?[...new Set([...compared,id])].slice(0,3):compared.filter(x=>x!==id);storeCompared();render();document.querySelector('input[data-compare="'+CSS.escape(id)+'"]')?.focus();});
$('finder-compare-clear')?.addEventListener('click',()=>{compared=[];storeCompared();render();$('program-search')?.focus();});
$('program-dialog').addEventListener('close',()=>restoreFocus?.isConnected&&restoreFocus.focus({preventScroll:true}));
(async()=>{try{
 const loaded=await Promise.all(['data/pathways.json','data/program-catalog.json','data/opportunity-catalog.json','data/credit-sources.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('The degree plans could not load. Please reload.');return r.json();}));
 data=loaded[2];const sources=loaded[3];
 // The finder index is an enhancement: without it, only reviewed (published) plans are listed.
 try{const r=await fetch('data/plan-library-index.json');const value=r.ok?await r.json():null;index={plans:value?.plans&&typeof value.plans==='object'?value.plans:{},subjects:value?.subjects&&typeof value.subjects==='object'?value.subjects:{}};}catch{index={plans:{},subjects:{}};}
 ctx=F.context({index,splits,worth});
 $('program-college-tip').querySelector('div').innerHTML=sources.sources.filter(source=>['asu-ulc','tel','cpa-credits','outlier'].includes(source.id)).map(source=>'<p><a href="credit-sources/'+encodeURIComponent(source.id)+'/">'+esc(source.name)+'</a><small>'+esc(source.creditBasis)+'</small></p>').join('');
 catalog=await DegreeProgramCatalog.loadIndex(DegreeProgramCatalog.merge(loaded[0],loaded[1]));
 if(typeof DegreeProgramCatalog.publishedPlans!=='function'||catalog.publicationIndex?.available===false)throw Error('We couldn’t load the reviewed degree plans. Reload to try again. Your saved plan is safe.');
 // Reviewed plans plus complete plans that still need school confirmation (labelled); both open in the planner.
 const published=DegreeProgramCatalog.publishedPlans(catalog).filter(p=>P.availability(p).canChoose),publishedIds=new Set(published.map(p=>p.id));
 rows=[...published,...(typeof DegreeProgramCatalog.isPlanAvailable==='function'?(catalog.pathways||[]).filter(p=>!publishedIds.has(p.id)&&p.modelId&&index.plans[p.id]?.tier==='confirmation'&&DegreeProgramCatalog.isPlanAvailable(p,catalog)&&P.availability(p).canChoose):[])];
 try{const r=await fetch('data/plan-freshness.json');const value=r.ok?await r.json():null;freshness=value?.plans&&typeof value.plans==='object'&&!Array.isArray(value.plans)?value.plans:{};}catch{freshness={};}
 try{const r=await fetch('data/baseline-index.json');const baselineIndex=r.ok?await r.json():null;for(const b of Object.values(baselineIndex?.baselines||{})){const t=b.summary||{};if(!Number.isFinite(t.transferCredits)||!Number.isFinite(t.universityCredits))continue;splits.set(b.pathwayId,{outside:t.transferCredits,university:t.universityCredits,total:Number.isFinite(t.totalCredits)?t.totalCredits:t.transferCredits+t.universityCredits});}}catch{}
 const subjectIds=[...new Set(rows.flatMap(p=>info(p).subjects))];$('program-subject').innerHTML='<option value="">All subjects</option>'+Object.entries(index.subjects).filter(([id])=>subjectIds.includes(id)).map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');
 const schools=[...new Set(rows.map(p=>p.school))].sort();
 $('program-school').innerHTML='<option value="">All schools</option>'+schools.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 const params=new URLSearchParams(location.search);if(schools.includes(params.get('school')))$('program-school').value=params.get('school');if(params.has('q'))$('program-search').value=params.get('q');if(['self-paced','campus','online'].includes(params.get('type')))preset=params.get('type');if(index.subjects[params.get('subject')])$('program-subject').value=params.get('subject');if(['associate','bachelor','master','doctorate','specialist'].includes(params.get('level')))$('program-level').value=params.get('level');if(['cost','outside','time','credits','az','school','recommended'].includes(params.get('sort')))$('program-sort').value=params.get('sort');if(['online','campus'].includes(params.get('format')))preset=params.get('format');if(params.get('confirm')==='0')$('program-confirm').checked=false;
 $('program-coverage').querySelector('div').innerHTML='<p>'+rows.length+' researched plans at '+schools.length+' schools: '+rows.filter(p=>!needsConfirmation(p)).length+' reviewed and '+rows.filter(needsConfirmation).length+' that need school confirmation. Each includes every degree requirement, researched outside-course matches and required university coursework.</p><p><strong>Reviewed plans</strong> passed every DegreeSteps publication check. <strong>Plans that need school confirmation</strong> are complete, but at least one school rule or course match is not yet confirmed in the school’s published sources; each card names the open question. Your school makes the final decision on transfer credit.</p><p>Need a different degree? <a href="request-plan.html">Build a plan from its degree link</a>.</p>';
 render();if($('program-sort').value==='credits')checkCredits();
}catch(e){$('program-count').textContent='';$('program-error').hidden=false;$('program-error').textContent=e.message;}})();
}());
