(function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),norm=v=>String(v||'').toLowerCase(),P=window.DegreeProgramOpportunities;
let catalog,data,rows=[],limit=30,format='',restoreFocus=null,splits=new Map(),index={plans:{},subjects:{}},freshness={},schools=[];
const levels={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
const mark=school=>({'Western Governors University':'WGU','Liberty University':'LU','Thomas Edison State University':'TESU','Grand Canyon University':'GCU','Southern New Hampshire University':'SNHU'})[school]||String(school||'').split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).join('').slice(0,4);
// The reviewed starting-route mix, when a saved research baseline exists. Text beside the bar carries the numbers.
function split(p){const s=splits.get(p.id);if(!s)return '';const short=({'Western Governors University':'WGU','Liberty University':'Liberty'})[p.school]||'the university',unit=p.school==='Western Governors University'?'competency units':'credits',share=Math.round(s.outside/s.total*100);return '<div class="pf-split"><div class="pf-split-track" aria-hidden="true"><span class="pf-split-outside" style="flex-grow:'+s.outside+'"></span><span class="pf-split-school" style="flex-grow:'+s.university+'"></span></div><p class="pf-split-text"><span class="pf-split-label">Starting route</span> <strong>'+s.outside+'</strong> outside + <strong>'+s.university+'</strong> at '+esc(short)+' = '+s.total+' '+unit+' <span>· '+share+'% proposed outside</span></p></div>';}
const schoolFor=p=>P.schoolFor(data,p),price=p=>fit(p).tuitionLabel||P.priceText(p,schoolFor(p));
// Review tier, browsing subjects and open questions come from data/plan-library-index.json.
const info=p=>index.plans[p.id]||{tier:'reviewed',subjects:[],questions:[]},needsConfirmation=p=>info(p).tier==='confirmation',shareOf=p=>{const s=splits.get(p.id);return s?Math.round(s.outside/s.total*100):null;};
const fit=p=>{const f=info(p).fit,edition=value=>String(value||'').replace(/[–—]/g,'-');return f&&f.modelId===p.modelId&&(!f.modality||(p.modalities||[]).includes(f.modality))&&(!p.catalog||edition(f.catalogYear)===edition(p.catalog))?f:typeof P.fitFacts==='function'?P.fitFacts(p,schoolFor(p)):{};};
const pace=p=>fit(p).paceLabel||P.paceText(p),isSelf=p=>fit(p).selfPaced===true;
const fieldIds={q:'program-search',school:'program-school',level:'program-level',subject:'program-subject',pace:'program-pace',billing:'program-billing',cbe:'program-cbe',share:'program-share',credit:'program-credit',budget:'program-budget',confirm:'program-confirm'};
const billingNames={'per-credit':'Per credit',subscription:'Subscription tuition','flat-term':'Flat tuition per term',annual:'Annual tuition'};
function fitFilters(){return{competencyBased:$('program-cbe').checked?true:undefined,selfPaced:$('program-pace').value==='self-paced'?true:$('program-pace').value==='scheduled'?false:undefined,billing:$('program-billing').value||undefined};}
function fits(p){
 const facts=fit(p),filters=fitFilters();
 if(typeof P.fitsFilters==='function')return P.fitsFilters(facts,filters);
 return(filters.competencyBased!==true||facts.competencyBased===true)&&(filters.selfPaced===undefined||facts.selfPaced===filters.selfPaced)&&(!filters.billing||facts.billing===filters.billing);
}
function fitBadges(p){
 const facts=fit(p),requirements=Array.isArray(facts.requirements)?facts.requirements.map(item=>typeof item?.label==='string'?item.label.trim():null):[],labels=[facts.selfPaced===true||facts.selfPaced===false?facts.paceLabel:null,facts.competencyBased===true?'Competency-based (CBE)':null,facts.billing?facts.billingLabel:null,...requirements];
 return [...new Set(labels.filter(Boolean))].map(label=>'<span class="pf-badge pf-badge-fit">'+esc(label)+'</span>').join('');
}
function tuitionBasis(p){const facts=fit(p);return info(p).estimate&&facts.billing&&facts.tuitionLabel?'<p class="pf-tuition-basis">'+esc(facts.tuitionLabel)+'</p>':'';}
function acceptsCredit(p,kind){
 if(!kind)return true;
 const policy=typeof P.transferPolicyFor==='function'?P.transferPolicyFor(p,schoolFor(p),kind):null;
 if(!policy||policy.status==='not-accepted')return false;
 return ['accepted','case-by-case'].includes(policy.status)||(Number.isFinite(policy.maximumCredits)&&policy.maximumCredits>0)||(Number.isFinite(policy.maximumPercent)&&policy.maximumPercent>0);
}
function selectedFilters(){
 const label=(id,value)=>$(id).options?Array.from($(id).options).find(option=>option.value===value)?.textContent||value:value;
 const selected=[];
 for(const [key,id]of Object.entries(fieldIds)){
  if(key==='cbe'){if($(id).checked)selected.push([key,'Competency-based (CBE)']);continue;}
  if(key==='confirm'){if(!$(id).checked)selected.push([key,'Reviewed plans only']);continue;}
  const value=$(id).value;if(!value)continue;
  selected.push([key,key==='q'?'Search: '+value:key==='share'?value+'%+ planned outside credit':key==='budget'?'Planning range up to '+money(Number(value)):key==='billing'?billingNames[value]||value:label(id,value)]);
 }
 if(format)selected.push(['format',format==='campus'?'On campus':'Online']);
 return selected;
}
function renderFilterState(){
 document.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset==='self-paced'?$('program-pace').value==='self-paced':button.dataset.preset===(format||'all'))));
 const selected=selectedFilters(),node=$('program-active-filters');
 node.hidden=!selected.length;node.innerHTML=selected.map(([key,label])=>'<button type="button" class="pf-filter-chip" data-clear-filter="'+esc(key)+'" aria-label="Remove filter: '+esc(label)+'"><span>'+esc(label)+'</span><span aria-hidden="true">×</span></button>').join('')+(selected.length?'<button type="button" class="pf-clear-filters" data-clear-all>Clear filters</button>':'');
 const extra=Number(Boolean($('program-share').value))+Number(Boolean($('program-credit').value))+Number(Boolean($('program-budget').value))+Number(!$('program-confirm').checked);
 $('program-more-summary').textContent='More filters'+(extra?' ('+extra+')':'');
}
function syncUrl(){
 if(typeof history==='undefined'||typeof history.replaceState!=='function')return;
 const params=new URLSearchParams();
 for(const [key,id]of Object.entries(fieldIds)){
  if(key==='cbe'){if($(id).checked)params.set(key,'1');continue;}
  if(key==='confirm'){if(!$(id).checked)params.set(key,'0');continue;}
  if($(id).value)params.set(key,$(id).value);
 }
 if(format)params.set('format',format);if($('program-sort').value)params.set('sort',$('program-sort').value);
 history.replaceState(null,'','programs.html'+(params.toString()?'?'+params:''));
}
function applyUrl(){
 const params=new URLSearchParams(location.search),legacy=params.get('type');
 for(const id of Object.values(fieldIds))if(!['program-cbe','program-confirm'].includes(id))$(id).value='';
 $('program-cbe').checked=params.get('cbe')==='1';$('program-confirm').checked=params.get('confirm')!=='0';$('program-sort').value='';
 $('program-search').value=(params.get('q')||'').slice(0,80);
 if(schools.includes(params.get('school')))$('program-school').value=params.get('school');
 if(index.subjects[params.get('subject')])$('program-subject').value=params.get('subject');
 if(levels[params.get('level')])$('program-level').value=params.get('level');
 format=['online','campus'].includes(params.get('format'))?params.get('format'):['online','campus'].includes(legacy)?legacy:'';
 if(['self-paced','scheduled'].includes(params.get('pace')))$('program-pace').value=params.get('pace');else if(legacy==='self-paced')$('program-pace').value='self-paced';
 if(Object.hasOwn(billingNames,params.get('billing')))$('program-billing').value=params.get('billing');
 if(['50','60','70'].includes(params.get('share')))$('program-share').value=params.get('share');
 if(['institutional','ace','nccrs'].includes(params.get('credit')))$('program-credit').value=params.get('credit');
 if(['15000','25000','40000'].includes(params.get('budget')))$('program-budget').value=params.get('budget');
 if(['outside','az','school'].includes(params.get('sort')))$('program-sort').value=params.get('sort');
 if($('program-share').value||$('program-credit').value||$('program-budget').value||!$('program-confirm').checked)$('program-more-filters').open=true;
}
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
// Weekly source freshness (data/plan-freshness.json): a neutral note while a cited school page is rechecked. Optional.
const freshnessNote=p=>{const f=freshness[p.id];if(f?.status!=='rechecking'||!/^\d{4}-\d{2}-\d{2}$/.test(f.since||''))return '';return '<p class="pf-freshness" role="note">Rechecking: the school updated a source page on '+esc(new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(f.since+'T00:00:00Z')))+'.</p>';};
const confirmBadge='<span class="pf-badge pf-badge-confirm">Needs school confirmation</span>';
function matches(p){const subject=$('program-subject').value,minShare=Number($('program-share').value)||0,budget=Number($('program-budget').value)||0,estimate=info(p).estimate;if(subject&&!info(p).subjects.includes(subject))return false;if(minShare&&!((shareOf(p)??-1)>=minShare))return false;if(budget&&!(estimate&&estimate.partial!==true&&Number.isFinite(estimate.min)&&Number.isFinite(estimate.max)&&estimate.min>=0&&estimate.max>=estimate.min&&estimate.max<=budget))return false;if(!$('program-confirm').checked&&needsConfirmation(p))return false;if(!fits(p))return false;
const q=norm($('program-search').value).trim(),credit=$('program-credit').value;return(!$('program-school').value||p.school===$('program-school').value)&&(!$('program-level').value||p.level===$('program-level').value)&&(!q||norm([p.school,p.title,p.id,pace(p)].join(' ')).includes(q))&&(!format||p.modalities?.includes(format))&&acceptsCredit(p,credit);}
function render(){
 $('program-college-tip').hidden=$('program-credit').value!=='institutional'||['master','doctorate','specialist'].includes($('program-level').value);
 const sortKey=$('program-sort').value,filtered=rows.filter(matches).sort(sortKey==='outside'?(a,b)=>(shareOf(b)??-1)-(shareOf(a)??-1)||Number(needsConfirmation(a))-Number(needsConfirmation(b))||a.title.localeCompare(b.title):sortKey==='az'?(a,b)=>a.title.localeCompare(b.title)||a.school.localeCompare(b.school):sortKey==='school'?(a,b)=>a.school.localeCompare(b.school)||a.title.localeCompare(b.title):(a,b)=>Number(needsConfirmation(a))-Number(needsConfirmation(b))||Number(isSelf(b))-Number(isSelf(a))||a.school.localeCompare(b.school)||a.title.localeCompare(b.title));
 const pending=filtered.filter(needsConfirmation).length;$('program-legend').hidden=!pending;$('program-count').textContent=!filtered.length?'No course plans match these filters':filtered.length+' course plan'+(filtered.length===1?'':'s')+' · '+new Set(filtered.map(p=>p.school)).size+' school'+(new Set(filtered.map(p=>p.school)).size===1?'':'s')+(pending?' · '+pending+(pending===1?' needs':' need')+' school confirmation':'');
 renderFilterState();
 $('program-results').innerHTML=filtered.slice(0,limit).map(p=>{
  const choiceCount=DegreeProgramCatalog.planChoiceCount(p,catalog),formats=p.modalities.map(m=>m==='campus'?'On campus':'Online').join(' · ');
  const href=splits.has(p.id)?'portal.html?usePlan='+encodeURIComponent(p.id):'portal.html?school='+encodeURIComponent(p.school)+'&program='+encodeURIComponent(p.id)+'&level='+encodeURIComponent(p.level);
  return '<article class="pf-program" data-program="'+esc(p.id)+'"><div class="pf-main-col"><div class="pf-school-row"><span class="pf-mark" aria-hidden="true">'+esc(mark(p.school))+'</span><span class="pf-school">'+esc(p.school)+'</span></div><h2>'+esc(p.title)+'</h2><p class="pf-meta">'+esc(levels[p.level]||p.level)+' · '+esc(formats)+'</p><div class="pf-badges">'+fitBadges(p)+(needsConfirmation(p)?confirmBadge:'<span class="pf-badge pf-badge-ready">Reviewed plan</span>')+'</div>'+(choiceCount>0?'<p class="pf-choice-note">'+choiceCount+' course choice'+(choiceCount===1?'':'s')+' to make in this plan</p>':'')+tuitionBasis(p)+freshnessNote(p)+split(p)+(needsConfirmation(p)?'<p class="pf-confirm-note"><strong>Open question:</strong> '+esc(info(p).questions[0]||'Some details still need confirmation with the school.')+(info(p).questions.length>1?' <span>+'+(info(p).questions.length-1)+' more in details</span>':'')+'</p>':'')+'</div><div class="pf-side"><div class="pf-price">'+(info(p).estimate?(info(p).estimate.partial?'Known charges so far '+money(info(p).estimate.min)+'–'+money(info(p).estimate.max)+'<small>Before aid · '+esc((info(p).estimate.unpriced||[]).join(' and ')||'Some course')+' prices not included</small>':'Planning estimate '+money(info(p).estimate.min)+'–'+money(info(p).estimate.max)+'<small>Before aid · tuition, fees and outside courses</small>'):needsConfirmation(p)?(/^\$/.test(price(p))?esc(price(p))+'<small>Published tuition only · full cost needs confirmation</small>':'Cost needs confirmation<small>No reviewed planning estimate yet</small>'):esc(price(p))+'<small>Tuition and course details in the plan</small>')+'</div><a class="pf-button pf-button-primary pf-open-plan" href="'+esc(href)+'">See courses</a><button type="button" data-program-details="'+esc(p.id)+'">College &amp; transfer details</button></div></article>';
 }).join('')||'<div class="pf-empty"><h2>No course plan matches these filters.</h2><p>Remove a filter to explore other plans, or create a plan for your exact degree.</p><button type="button" id="program-reset">Clear filters</button><a class="pf-plan-link" href="request-plan.html">Build from a degree link</a></div>';
 $('program-more').hidden=filtered.length<=limit;
}
function details(id){
 const p=rows.find(p=>p.id===id);if(!p)return;
 restoreFocus=document.activeElement;const choices=DegreeProgramCatalog.planChoiceCount(p,catalog),school=schoolFor(p),href=splits.has(p.id)?'portal.html?usePlan='+encodeURIComponent(p.id):'portal.html?school='+encodeURIComponent(p.school)+'&program='+encodeURIComponent(p.id)+'&level='+encodeURIComponent(p.level);
 $('program-dialog-content').innerHTML='<div class="pf-dialog-heading"><span class="pf-school">'+esc(p.school)+'</span><h2>'+esc(p.title)+'</h2><p>'+esc(levels[p.level]||p.level)+' · '+esc(pace(p))+'</p></div>'+freshnessNote(p)+(needsConfirmation(p)?'<section class="pf-confirm-detail"><h3>What still needs school confirmation</h3><ul>'+info(p).questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul><p>The course plan is complete, but these points are not yet confirmed in the school’s published rules. Ask the school about them before paying for outside courses.</p></section>':'')+P.detailsHTML(p,school,fit(p))+'<p class="pf-map-note">Includes the full degree requirements. '+(choices>0?choices+' course choice'+(choices===1?'':'s')+' to make. ':'')+'Each course shows its degree placement and any specific conditions. Your college records the final credit award.</p><div class="pf-dialog-actions"><a class="pf-button pf-button-primary" data-choose-program href="'+esc(href)+'">Build this degree plan</a><a href="school.html?school='+encodeURIComponent(p.school)+'">Read about this school</a><a href="'+esc(p.url||school?.url)+'" target="_blank" rel="noopener">Official program source</a></div>';
 $('program-dialog').showModal();
}
// "See courses" makes that plan the active plan (the previous one is kept as a saved version). A student
// who already has a plan with progress is asked first; first-time visitors keep the one-click path.
const KEY='degreepath-guide-v3';
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
function reset(){for(const id of Object.values(fieldIds))if(!['program-cbe','program-confirm'].includes(id))$(id).value='';$('program-cbe').checked=false;$('program-confirm').checked=true;$('program-sort').value='';format='';limit=30;render();syncUrl();$('program-search').focus?.();}
function removeFilter(name){
 if(name==='format')format='';
 else if(name==='cbe')$('program-cbe').checked=false;
 else if(name==='confirm')$('program-confirm').checked=true;
 else if(Object.hasOwn(fieldIds,name))$(fieldIds[name]).value='';
 else return;
 limit=30;render();syncUrl();$('program-search').focus?.();
}
// Anonymous aggregate counter (growth-metrics.js): the finder was used to narrow plans. No filter values are sent.
const growth=(event,extra={})=>{try{window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event,context:'workspace',...extra}}));}catch{/* Measurement never blocks the page. */}};
const finderUsed=()=>growth('finder_used');
$('program-filters').addEventListener('submit',e=>{e.preventDefault();limit=30;render();syncUrl();finderUsed();});
// The search box already re-renders on input; its change event fires on blur and would replace the
// card a student is tapping, losing that tap.
for(const type of ['input','change'])$('program-filters').addEventListener(type,e=>{if(type==='change'&&e.target?.id==='program-search')return;limit=30;render();syncUrl();finderUsed();});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preset){if(b.dataset.preset==='self-paced')$('program-pace').value=$('program-pace').value==='self-paced'?'':'self-paced';else format=b.dataset.preset==='all'?'':b.dataset.preset;limit=30;render();syncUrl();finderUsed();}else if(b.dataset.clearFilter)removeFilter(b.dataset.clearFilter);else if(b.hasAttribute?.('data-clear-all'))reset();else if(b.dataset.programDetails)details(b.dataset.programDetails);else if(b.id==='program-more'){limit+=30;render();}else if(b.id==='program-reset')reset();else if(b.id==='program-dialog-close')$('program-dialog').close();});
$('program-sort').addEventListener('change',()=>{limit=30;render();syncUrl();});
if(typeof window.addEventListener==='function')window.addEventListener('popstate',()=>{if(!catalog)return;applyUrl();limit=30;render();});
$('program-dialog').addEventListener('close',()=>restoreFocus?.isConnected&&restoreFocus.focus({preventScroll:true}));
(async()=>{try{
 const loaded=await Promise.all(['data/pathways.json','data/program-catalog.json','data/opportunity-catalog.json','data/credit-sources.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('The degree plans could not load. Please reload.');return r.json();}));
 data=loaded[2];const sources=loaded[3];
 // The finder index is an enhancement: without it, only reviewed (published) plans are listed.
 try{const r=await fetch('data/plan-library-index.json');const value=r.ok?await r.json():null;index={plans:value?.plans&&typeof value.plans==='object'?value.plans:{},subjects:value?.subjects&&typeof value.subjects==='object'?value.subjects:{}};}catch{index={plans:{},subjects:{}};}
 $('program-college-tip').querySelector('div').innerHTML=sources.sources.filter(source=>['asu-ulc','tel','cpa-credits','outlier'].includes(source.id)).map(source=>'<p><a href="credit-sources/'+encodeURIComponent(source.id)+'/">'+esc(source.name)+'</a><small>'+esc(source.creditBasis)+'</small></p>').join('');
 catalog=await DegreeProgramCatalog.loadIndex(DegreeProgramCatalog.merge(loaded[0],loaded[1]));
 if(typeof DegreeProgramCatalog.publishedPlans!=='function'||catalog.publicationIndex?.available===false)throw Error('We couldn’t load the reviewed degree plans. Reload to try again. Your saved plan is safe.');
 // Reviewed plans plus complete plans that still need school confirmation (labelled); both open in the planner.
 const published=DegreeProgramCatalog.publishedPlans(catalog).filter(p=>P.availability(p).canChoose),publishedIds=new Set(published.map(p=>p.id));
 rows=[...published,...(typeof DegreeProgramCatalog.isPlanAvailable==='function'?(catalog.pathways||[]).filter(p=>!publishedIds.has(p.id)&&p.modelId&&index.plans[p.id]?.tier==='confirmation'&&DegreeProgramCatalog.isPlanAvailable(p,catalog)&&P.availability(p).canChoose):[])];
 try{const r=await fetch('data/plan-freshness.json');const value=r.ok?await r.json():null;freshness=value?.plans&&typeof value.plans==='object'&&!Array.isArray(value.plans)?value.plans:{};}catch{freshness={};}
 for(const [id,entry]of Object.entries(index.plans)){const s=entry.start;if(Number.isFinite(s?.outside)&&Number.isFinite(s?.university)&&Number.isFinite(s?.total)&&s.total>0)splits.set(id,{outside:s.outside,university:s.university,total:s.total});}
 try{const r=await fetch('data/baseline-index.json');const baselineIndex=r.ok?await r.json():null;for(const b of Object.values(baselineIndex?.baselines||{})){if(splits.has(b.pathwayId))continue;const t=b.summary||{};if(!Number.isFinite(t.transferCredits)||!Number.isFinite(t.universityCredits))continue;splits.set(b.pathwayId,{outside:t.transferCredits,university:t.universityCredits,total:Number.isFinite(t.totalCredits)?t.totalCredits:t.transferCredits+t.universityCredits});}}catch{}
 const subjectIds=[...new Set(rows.flatMap(p=>info(p).subjects))];$('program-subject').innerHTML='<option value="">All subjects</option>'+Object.entries(index.subjects).filter(([id])=>subjectIds.includes(id)).map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');
 schools=[...new Set(rows.map(p=>p.school))].sort();
 $('program-school').innerHTML='<option value="">All schools</option>'+schools.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 applyUrl();
 $('program-coverage').querySelector('div').innerHTML='<p>'+rows.length+' researched plans at '+schools.length+' schools: '+rows.filter(p=>!needsConfirmation(p)).length+' reviewed and '+rows.filter(needsConfirmation).length+' that need school confirmation. Each includes every degree requirement, researched outside-course matches and required university coursework.</p><p><strong>Reviewed plans</strong> passed every DegreeSteps publication check. <strong>Plans that need school confirmation</strong> are complete, but at least one school rule or course match is not yet confirmed in the school’s published sources; each card names the open question. Your school makes the final decision on transfer credit.</p><p>Need a different degree? <a href="request-plan.html">Build a plan from its degree link</a>.</p>';
 render();
 
}catch(e){$('program-count').textContent='';$('program-error').hidden=false;$('program-error').textContent=e.message;}})();
}());
