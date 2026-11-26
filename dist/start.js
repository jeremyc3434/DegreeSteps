/* Build my plan: three steps (pick a degree, credits you have, your plan) and a 1-minute quiz.
 * Reads the same plan data and availability rules as the degree finder (programs.js). It writes nothing to
 * localStorage itself: the chosen plan opens through portal.html?usePlan=…, which saves it exactly as the finder does,
 * and the credits answer is carried as ?then= so the plan opens on the matching existing step. */
(function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),norm=v=>String(v||'').toLowerCase();
const P=window.DegreeProgramOpportunities,params=new URLSearchParams(location.search);
const levels={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
const formats={online:'Online',campus:'On campus'};
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(v);
let catalog,rows=[],openIds=new Set(),index={plans:{},subjects:{}},limit=12;
let personalController=null,personalAvailable=false,personalEnabled=false,personalPending=false,personalComplete=false,personalScopeKey='',personalRevision=0,personalError='',personalChecked=0,personalTotal=0,personalResults=new Map();
const filterDefaults={q:'',subject:'',level:'',format:'',pace:'',billing:'',cbe:false,share:'',budget:'',sort:'cost',confirm:true};
const filters={...filterDefaults};
const paceLabels={'self-paced':'Self-paced',scheduled:'Term-based'},billingLabels={'per-credit':'Per credit',subscription:'Subscription','flat-term':'Flat price per term',annual:'Annual tuition'};
const purposes={any:'any-degree',grow:'career-growth',change:'change-career',licensed:'licensed-career'},priorities={cost:'cost',outside:'transfer',time:'speed'};
const quizIntent=params.get('from')==='quiz'?{
  purpose:Object.values(purposes).includes(params.get('purpose'))?params.get('purpose'):'',
  priority:['balanced','speed','cost','transfer'].includes(params.get('priority'))?params.get('priority'):''
}:null;
function intentParams(next){
  if(quizIntent&&(quizIntent.purpose||quizIntent.priority)){next.set('from','quiz');if(quizIntent.purpose)next.set('purpose',quizIntent.purpose);if(quizIntent.priority)next.set('priority',quizIntent.priority);}
  return next;
}
function degreeParams(){const next=new URLSearchParams();for(const key of ['q','subject','level','format','pace','billing','share','budget'])if(filters[key])next.set(key,filters[key]);if(filters.cbe)next.set('cbe','1');if(personalAvailable)next.set('fit',personalEnabled?'1':'0');if(filters.sort!=='cost')next.set('sort',filters.sort);if(!filters.confirm)next.set('confirm','0');return intentParams(next);}
function creditsUrl(p){const next=degreeParams();next.set('step','credits');next.set('plan',p.id);return 'start.html?'+next;}

const info=p=>index.plans[p.id]||{tier:'reviewed',subjects:[]};
const needsConfirmation=p=>info(p).tier==='confirmation';
// Build only what the portal will open: openIds comes from DegreeProgramCatalog.openablePlanIds, the same rule the portal
// checks. Any other card gets the honest "Request this plan" action instead of a dead end.
const canBuild=p=>openIds.has(p.id);
const fit=p=>{const f=info(p).fit,edition=value=>String(value||'').replace(/[–—]/g,'-');return f&&f.modelId===p.modelId&&(!f.modality||(p.modalities||[]).includes(f.modality))&&(!p.catalog||edition(f.catalogYear)===edition(p.catalog))?f:P.fitFacts?.(p,P.schoolFor(catalog,p))||{};};
const money=v=>v>=10000?'$'+(Math.round(v/100)/10).toLocaleString('en-US')+'k':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const costText=p=>{const e=info(p).estimate;return e&&Number.isFinite(e.min)&&Number.isFinite(e.max)?(e.min===e.max?money(e.min):money(e.min)+'–'+money(e.max)):'';};
const partialCost=p=>info(p).estimate?.partial===true;
const costLabel=p=>partialCost(p)?'Known charges so far':'Est. cost';
const costMissing=p=>partialCost(p)?((info(p).estimate.unpriced||[]).filter(name=>typeof name==='string'&&name.trim()).join(' and ')||'Some course')+' prices not included.':'';
const costRange=p=>{const e=info(p).estimate;return e&&Number.isFinite(e.min)&&Number.isFinite(e.max)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(e.min)+'–'+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(e.max):'';};
const months=p=>{const t=info(p).timing;if(!t||!t.outsideMonths||!t.universityTerms||!Number.isFinite(t.termMonths))return null;return t.outsideMonths.min+t.universityTerms.min*t.termMonths;};
const share=p=>{const s=info(p).start;return s&&s.total>0?s.outside/s.total:null;};
const unit=p=>fit(p).creditSystem==='competency-unit'||p.creditUnit==='competency-unit'?'units':fit(p).creditSystem==='quarter'||p.creditUnit==='quarter'?'quarter credits':'credits';

// Where "Build this plan" leads once step 2 is answered. A plan with a saved starting route opens directly;
// any other plan uses the finder's existing school/program link, which asks its own remaining questions.
function planUrl(p,then){
  if(info(p).start){const next=new URLSearchParams({usePlan:p.id});if(then)next.set('then',then);return 'portal.html?'+intentParams(next);}
  const format=p.modalities?.length===1?'&format='+encodeURIComponent(p.modalities[0]):'';
  const next=new URLSearchParams('school='+encodeURIComponent(p.school)+'&program='+encodeURIComponent(p.id)+'&level='+encodeURIComponent(p.level)+format);return 'portal.html?'+intentParams(next);
}

function matchesBasic(p){
  if(filters.subject&&!(info(p).subjects||[]).includes(filters.subject))return false;
  if(filters.level&&p.level!==filters.level)return false;
  if(filters.format&&!(p.modalities||[]).includes(filters.format))return false;
  if(!filters.confirm&&needsConfirmation(p))return false;
  if(!P.fitsFilters(fit(p),{...(filters.cbe?{competencyBased:true}:{}),...(filters.pace?{selfPaced:filters.pace==='self-paced'}:{}),...(filters.billing?{billing:filters.billing}:{})}))return false;
  if(filters.share&&(share(p)===null||share(p)*100<Number(filters.share)))return false;
  if(filters.budget&&!personalEnabled){const e=info(p).estimate;if(!e||e.partial===true||!Number.isFinite(e.max)||e.max>Number(filters.budget))return false;}
  const q=norm(filters.q).trim();
  if(q){const hay=norm([p.school,p.title,levels[p.level],...(info(p).subjects||[]).map(id=>index.subjects[id]||id)].join(' '));if(!q.split(/\s+/).every(word=>hay.includes(word)))return false;}
  return true;
}
const personalFor=p=>personalEnabled&&!personalPending?personalResults.get(p.id):null;
const personalReady=p=>{const result=personalFor(p);return result?.available===true&&result.eligible!==false&&result.summary?result:null;};
const personalRange=p=>{const value=personalReady(p)?.estimate,range=value?.costs?.knownRange;return value?.available===true&&range&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&range.min>=0&&range.max>=range.min?{...range,partial:value.partial===true||value.status==='partial-range'}:null;};
function matches(p){if(!matchesBasic(p))return false;if(personalEnabled&&filters.budget&&personalComplete){const range=personalRange(p);return Boolean(range&&!range.partial&&range.max<=Number(filters.budget));}return true;}
function discoveryProfile(){return{field:filters.subject||'any',degreeLevel:filters.level||'unsure',modality:filters.format||'any',classroomImportance:filters.format==='campus'?'essential':'open'};}
function personalStatus(){
  $('start-personal-label').hidden=!personalAvailable;$('start-personal').checked=personalEnabled;$('start-sort-fit').hidden=!personalAvailable;
  $('start-personal-courses').textContent=personalAvailable?'My courses':'Already taken classes? Add your courses';
  $('start-personal-courses').href=personalAvailable?'courses.html?tab=mine':'import-courses.html?from=degrees';
  const status=$('start-personal-status');status.setAttribute('aria-busy',String(personalPending));
  $('start-personal-retry').hidden=!personalError;
  status.textContent=personalError||(!personalEnabled?'':personalPending?'Matching your courses with '+personalTotal+' ready plans… '+personalChecked+' checked.':personalComplete?'Your courses checked against '+personalTotal+' ready plan'+(personalTotal===1?'':'s')+'. Finished and unfinished coursework stay separate.':'');
  const budget=$('start-budget').closest('label')?.querySelector('span');if(budget)budget.textContent=personalEnabled?'Remaining planning range up to':'Planning range up to';
}
function queuePersonal(){
  if(!personalEnabled||!personalController){personalStatus();return;}
  const ready=new Set(DegreeProgramCatalog.publishedPlans(catalog).map(p=>p.id)),ids=rows.filter(matchesBasic).filter(p=>ready.has(p.id)).map(p=>p.id),profile=discoveryProfile(),key=JSON.stringify([ids,profile]);
  if(key===personalScopeKey){personalStatus();return;}
  personalController.cancel();const ticket=++personalRevision;personalScopeKey=key;personalResults=new Map();personalError='';personalChecked=0;personalTotal=ids.length;personalPending=ids.length>0;personalComplete=!ids.length;personalStatus();
  if(!ids.length)return;
  personalController.run(ids,{discoveryProfile:profile,onProgress:value=>{if(ticket!==personalRevision||!personalEnabled)return;personalChecked=value.checkedCount||0;personalStatus();}}).then(value=>{
    if(ticket!==personalRevision||!personalEnabled)return;personalResults=new Map(value.results.map(result=>[result.pathwayId,result]));personalChecked=value.checkedCount;personalPending=false;personalComplete=true;renderDegree();
  }).catch(error=>{if(ticket!==personalRevision||['superseded','disposed'].includes(error.code))return;if(error.code==='courses-changed'){refreshPersonal();return;}personalPending=false;personalComplete=false;personalError='Your course matches could not finish. Your saved courses and plan are unchanged.';personalStatus();renderDegree();});
}
function refreshPersonal(){
  if(!catalog||!personalController)return;personalController.cancel();++personalRevision;personalScopeKey='';personalResults=new Map();personalPending=false;personalComplete=false;personalError='';
  try{const wasAvailable=personalAvailable;personalAvailable=personalController.hasCourses();personalEnabled=personalAvailable&&(wasAvailable?personalEnabled:new URLSearchParams(location.search).get('fit')!=='0');if(!personalAvailable&&filters.sort==='fit')filters.sort='cost';}
  catch{personalAvailable=false;personalEnabled=false;personalError='Your course collection could not be reopened. Open My courses to continue.';}
  renderDegree();
}
function personalCard(p){
  const result=personalFor(p),value=personalReady(p),readyIds=new Set(DegreeProgramCatalog.publishedPlans(catalog).map(route=>route.id));
  if(!value)return '<div class="start-personal-card" data-personal-state="'+(personalPending&&readyIds.has(p.id)?'pending':'unavailable')+'"><p>'+(personalPending&&readyIds.has(p.id)?'Checking your courses…':result?.eligible===false?'This degree falls outside your saved goals or study preferences.':'Your courses have not been matched to this template.')+'</p></div>';
  const s=value.summary,f=s.fitBreakdown,u=s.creditSystem==='competency-unit'?'competency units':s.creditSystem==='quarter'?'quarter credits':'credits',range=personalRange(p),cost=range?(range.min===range.max?money(range.min):money(range.min)+'–'+money(range.max)):'Not available yet';
  return '<div class="start-personal-card" data-personal-state="ready"><p class="start-personal-earned"><strong data-personal-earned>'+esc(f.completedCredits)+'</strong> finished '+u+' fit</p>'
    +'<p class="start-personal-potential"><span data-personal-in-progress>'+esc(f.inProgressCredits)+'</span> in progress · <span data-personal-saved>'+esc(f.savedCredits)+'</span> saved'+(f.plannedCredits?' · <span data-personal-planned>'+esc(f.plannedCredits)+'</span> planned':'')+' <span>— potential matches</span></p>'
    +'<p class="start-college-work"><strong data-personal-university>'+esc(s.universityCreditsRemaining)+'</strong> '+u+' still at the university</p>'
    +'<div class="start-personal-cost" data-personal-cost'+(range?' data-estimate-min="'+range.min+'" data-estimate-max="'+range.max+'"':'')+'><span>'+(range?.partial?'Known remaining charges':'Est. remaining cost')+'</span><strong>'+esc(cost)+'</strong><small class="start-personal-scope">Before aid; living costs excluded.'+(range?.partial?' Some charges are not included.':'')+'</small></div>'
    +(f.needsReviewCount?'<p class="start-personal-review">'+esc(f.needsReviewCount)+' course'+(f.needsReviewCount===1?' has':'s have')+' no match in this plan yet.</p>':'')+'</div>';
}
function personalLink(p){const next=new URLSearchParams({from:'courses',degree:p.id});if(p.modalities?.length===1)next.set('format',p.modalities[0]);return'compare-plans.html?'+next;}
function sorted(list){
  const last=v=>v===null||v===undefined?Infinity:v;
  const personalOrder=personalEnabled&&personalComplete&&window.DegreeDiscoveryFit?new Map(window.DegreeDiscoveryFit.rank([...personalResults.values()],filters.sort==='time'?'time':filters.sort==='cost'?'cost':'collection').map((value,i)=>[value.pathwayId,i])):null;
  const by={
    fit:(a,b)=>(personalOrder?.get(a.id)??Infinity)-(personalOrder?.get(b.id)??Infinity),
    cost:(a,b)=>{
      if(personalEnabled&&personalComplete)return(personalOrder?.get(a.id)??Infinity)-(personalOrder?.get(b.id)??Infinity);
      const rank=p=>costText(p)?partialCost(p)?1:0:2;
      return rank(a)-rank(b)||last(info(a).estimate?.min)-last(info(b).estimate?.min);
    },
    outside:(a,b)=>(share(b)??-1)-(share(a)??-1),
    time:(a,b)=>personalEnabled&&personalComplete?(personalOrder?.get(a.id)??Infinity)-(personalOrder?.get(b.id)??Infinity):last(months(a))-last(months(b)),
    az:(a,b)=>a.title.localeCompare(b.title)
  }[filters.sort]||(()=>0);
  return [...list].sort((a,b)=>by(a,b)||Number(needsConfirmation(a))-Number(needsConfirmation(b))||a.title.localeCompare(b.title)||a.school.localeCompare(b.school));
}
function card(p){
  const s=info(p).start,cost=costText(p),pct=s&&s.total?Math.round(s.outside/s.total*100):0,fmt=(p.modalities||[]).map(m=>formats[m]||m).join(' · ');
  const f=fit(p),badges=[...new Set([f.competencyBased===true?'Competency-based (CBE)':'',f.selfPaced===true?'Self-paced':f.selfPaced===false?'Term-based':'',f.billing?f.billingLabel||billingLabels[f.billing]:'',...(f.requirements||[]).map(item=>item.label),...(P.requirementBadges?.(f)||[])].filter(Boolean))];
  return '<article class="start-card" data-plan="'+esc(p.id)+'"><div class="start-card-head"><p class="start-school">'+esc(p.school)+(fmt?' · '+esc(fmt):'')+'</p><h2>'+esc(p.title)+'</h2>'
    +(needsConfirmation(p)?'<span class="start-badge">Needs school confirmation</span>':'')+'</div>'
    +(badges.length?'<ul class="start-fit-badges" aria-label="Program features">'+badges.map(label=>'<li>'+esc(label)+'</li>').join('')+'</ul>':'')
    +(f.billing&&f.tuitionLabel?'<p class="start-tuition">University tuition: '+esc(f.tuitionLabel)+'</p>':'')
    +(personalEnabled?personalCard(p):'<div class="start-stats"><div class="start-stat"><span>'+costLabel(p)+'</span><strong'+(cost?' title="'+esc(costRange(p))+' before aid" aria-label="'+esc(costRange(p))+' before aid"':'')+'>'+(cost?esc(cost):'Ask the school')+'</strong>'+(partialCost(p)?'<small>'+esc(costMissing(p))+'</small>':'')+'</div>'
    +'<div class="start-stat start-stat-accent"><span>Low-cost '+unit(p)+'</span><strong>'+(s?s.outside+' of '+s.total:'—')+'</strong></div></div>'
    +(s?'<div class="start-bar" role="img" aria-label="'+esc(s.outside+' of '+s.total+' '+unit(p)+' can come from low-cost courses')+'"><span style="width:'+pct+'%"></span></div>':'')
    +(s?'<p class="start-college-work"><strong>'+esc(s.university)+'</strong> '+unit(p)+' at the university in this plan</p>':''))
    +(P.requirementsHTML?.(f,{compact:true})||'')
    +(canBuild(p)?'<div class="start-card-actions"><a class="start-primary" data-build-plan="'+esc(p.id)+'" href="'+esc(personalReady(p)?personalLink(p):creditsUrl(p))+'">'+(personalReady(p)?'Review my plan':'Build this plan')+'</a>'
    +(info(p).page?'<a class="start-text-link" href="'+esc(info(p).page)+'">See every course</a>':'')+'</div>'
    :'<p class="start-request-note" id="start-request-'+esc(p.id)+'"><strong>Not ready to build yet.</strong> '+esc(info(p).questions?.[0]||'Some of the school’s published rules for this plan are still being confirmed.')+'</p>'
    +'<div class="start-card-actions"><a class="start-secondary start-request" data-request-plan="'+esc(p.id)+'" aria-describedby="start-request-'+esc(p.id)+'" href="'+esc(DegreeProgramCatalog.planRequestHref(p))+'">Request this plan</a></div>')+'</article>';
}
function chipGroup(id,name,options,current){
  const el=$(id);const legend=el.querySelector('legend').outerHTML;
  el.innerHTML=legend+[['','All'],...options].map(([value,label])=>'<button type="button" class="start-chip" data-filter="'+name+'" data-value="'+esc(value)+'" aria-pressed="'+String(value===current)+'">'+esc(label)+'</button>').join('');
}
function renderDegree(){
  queuePersonal();
  const list=sorted(rows.filter(matches)),pending=list.filter(needsConfirmation).length;
  $('start-count').textContent=list.length?list.length+' degree'+(list.length===1?'':'s')+(pending?' · '+(list.length-pending)+' ready to build · '+pending+' need'+(pending===1?'s':'')+' school confirmation':''):'No degrees match. Try fewer filters.';
  $('start-results').innerHTML=list.slice(0,limit).map(card).join('')||'<div class="start-empty"><p>No degree plan matches these choices yet.</p><button type="button" class="start-secondary" id="start-clear">Clear filters</button> <a href="request-plan.html">Build from a degree link</a></div>';
  $('start-more').hidden=list.length<=limit;
  chipGroup('start-subjects','subject',Object.entries(index.subjects).filter(([id])=>rows.some(p=>(info(p).subjects||[]).includes(id))),filters.subject);
  chipGroup('start-levels','level',Object.entries(levels).filter(([id])=>rows.some(p=>p.level===id)),filters.level);
  chipGroup('start-formats','format',Object.entries(formats).filter(([id])=>rows.some(p=>(p.modalities||[]).includes(id))),filters.format);
  $('start-sort').value=filters.sort;$('start-confirm').checked=filters.confirm;
  for(const key of ['pace','billing','share','budget'])$('start-'+key).value=filters[key];$('start-cbe').checked=filters.cbe;
  const active=[['q',filters.q?'Search: '+filters.q:''],['subject',index.subjects[filters.subject]],['level',levels[filters.level]],['format',formats[filters.format]],['pace',paceLabels[filters.pace]],['billing',billingLabels[filters.billing]],['cbe',filters.cbe?'Competency-based (CBE)':''],['share',filters.share?'At least '+filters.share+'% transfer coursework':''],['budget',filters.budget?'Plan range up to '+money(Number(filters.budget)):'']].filter(([,label])=>label);
  $('start-active-filters').innerHTML=active.map(([key,label])=>'<button type="button" data-clear-filter="'+key+'" aria-label="Remove filter: '+esc(label)+'">'+esc(label)+' <span aria-hidden="true">×</span></button>').join('')+(active.length?'<button type="button" data-clear-all>Clear filters</button>':'');
  const quizLink=degreeParams();quizLink.set('step','quiz');$('start-quiz-link').href='start.html?'+quizLink;
}
function syncUrl(){
  const next=degreeParams();
  history.replaceState(null,'','start.html'+(next.toString()?'?'+next:''));
}
function show(step){
  for(const id of ['degree','credits','quiz'])$('start-step-'+id).hidden=id!==step;
  $('start-loading').hidden=true;
  const heading=$('start-'+step+'-title');if(heading&&document.activeElement!==document.body)heading.focus({preventScroll:true});
  window.scrollTo?.(0,0);
}

// Step 2: the plan is chosen; the credits answer decides which existing plan step opens first.
function openCredits(p){
  const s=info(p).start,cost=costText(p);
  $('start-picked').innerHTML='<strong>'+esc(p.title)+'</strong> · '+esc(p.school)+(cost?' · '+costLabel(p)+' '+esc(cost)+'<span class="screen-reader-only"> ('+esc(costRange(p))+')</span>':'')+(s?' · '+esc(s.outside+' of '+s.total)+' '+unit(p)+' for less':'')+(partialCost(p)?'<br><span>'+esc(costMissing(p))+'</span>':'');
  $('start-credits-back').href='start.html'+(degreeParams().toString()?'?'+degreeParams():'');
  $('start-credits-skip').href=planUrl(p,'later');
  $('start-military').href=planUrl(p,'military');
  $('start-credits-form').onsubmit=event=>{event.preventDefault();const choice=new FormData(event.target).get('prior');location.assign(planUrl(p,['none','some','upload'].includes(choice)?choice:'none'));};
  document.title='Credits you have — DegreeSteps';
  show('credits');
}

// The 1-minute quiz: one question per card. It ends on step 1 with matching filters.
const quiz=[
  {id:'purpose',q:'Why do you want a degree?',options:[['any','A degree that opens doors'],['grow','Grow in my current career'],['change','Change careers'],['licensed','A licensed career (teacher, nurse, counselor…)']]},
  {id:'level',q:'Which degree?',options:[['associate','Associate (about 2 years)'],['bachelor','Bachelor’s (about 4 years)'],['master','Master’s'],['','Not sure yet']]},
  {id:'subject',q:'What do you want to study?',options:[]},
  {id:'format',q:'How do you want to learn?',options:[['online','Online'],['campus','On campus'],['','Either']]},
  {id:'sort',q:'What matters most?',options:[['cost','Lowest cost'],['outside','Most credits for less'],['time','Finish sooner']]}
];
let quizAt=0;const answers={};
function renderQuiz(){
  const item=quiz[quizAt];if(item.id==='subject')item.options=[...Object.entries(index.subjects).filter(([id])=>rows.some(p=>(info(p).subjects||[]).includes(id))),['','Not sure yet']];
  $('start-quiz-count').textContent='Question '+(quizAt+1)+' of '+quiz.length;
  $('start-quiz-back').hidden=quizAt===0;
  const note=item.id==='level'&&answers.purpose==='licensed'?'<p class="start-note" role="note">Licensed careers need a program your state approves. Use a plan as a start and confirm licensure with the school.</p>':'';
  $('start-quiz-card').innerHTML='<h2 id="start-quiz-question">'+esc(item.q)+'</h2>'+note+'<div class="start-quiz-options" role="group" aria-labelledby="start-quiz-question">'+item.options.map(([value,label])=>'<button type="button" class="start-answer-button" data-quiz-answer="'+esc(value)+'">'+esc(label)+'</button>').join('')+'</div>';
}
function finishQuiz(){
  const next=degreeParams();for(const key of ['level','subject','format'])if(answers[key])next.set(key,answers[key]);else next.delete(key);if(answers.sort&&answers.sort!=='cost')next.set('sort',answers.sort);else next.delete('sort');next.set('from','quiz');if(purposes[answers.purpose])next.set('purpose',purposes[answers.purpose]);if(priorities[answers.sort])next.set('priority',priorities[answers.sort]);
  location.assign('start.html?'+next);
}

document.addEventListener('click',event=>{
  const clear=event.target.closest?.('[data-clear-filter],[data-clear-all]');
  if(clear){if(clear.hasAttribute('data-clear-all'))Object.assign(filters,filterDefaults);else filters[clear.dataset.clearFilter]=filterDefaults[clear.dataset.clearFilter];$('start-q').value=filters.q;limit=12;renderDegree();syncUrl();$('start-q').focus();return;}
  const chip=event.target.closest?.('[data-filter]');
  if(chip){filters[chip.dataset.filter]=chip.dataset.value;limit=12;renderDegree();syncUrl();const again=document.querySelector('[data-filter="'+chip.dataset.filter+'"][data-value="'+CSS.escape(chip.dataset.value)+'"]');again?.focus();return;}
  if(event.target.id==='start-more'){limit+=12;renderDegree();return;}
  if(event.target.id==='start-clear'){Object.assign(filters,filterDefaults);$('start-q').value='';renderDegree();syncUrl();return;}
  const answer=event.target.closest?.('[data-quiz-answer]');
  if(answer){answers[quiz[quizAt].id]=answer.dataset.quizAnswer;if(quizAt<quiz.length-1){quizAt++;renderQuiz();$('start-quiz-question')?.setAttribute('tabindex','-1');$('start-quiz-question')?.focus();}else finishQuiz();return;}
  if(event.target.id==='start-quiz-back'){event.preventDefault();if(quizAt>0){quizAt--;renderQuiz();}return;}
});
$('start-q').addEventListener('input',()=>{filters.q=$('start-q').value;limit=12;renderDegree();syncUrl();});
$('start-sort').addEventListener('change',()=>{filters.sort=$('start-sort').value;renderDegree();syncUrl();});
$('start-confirm').addEventListener('change',()=>{filters.confirm=$('start-confirm').checked;renderDegree();syncUrl();});
for(const key of ['pace','billing','share','budget'])$('start-'+key).addEventListener('change',()=>{filters[key]=$('start-'+key).value;limit=12;renderDegree();syncUrl();});
$('start-cbe').addEventListener('change',()=>{filters.cbe=$('start-cbe').checked;limit=12;renderDegree();syncUrl();});
$('start-personal').addEventListener('change',()=>{personalEnabled=$('start-personal').checked;personalController?.cancel();++personalRevision;personalPending=false;personalComplete=false;personalScopeKey='';personalResults=new Map();personalError='';if(!personalEnabled&&filters.sort==='fit')filters.sort='cost';limit=12;renderDegree();syncUrl();});
$('start-personal-retry').addEventListener('click',refreshPersonal);
window.addEventListener('storage',event=>{if(event.key==='degreepath-guide-v3'||event.key===null)refreshPersonal();});
window.addEventListener('degreepath:plan-saved',refreshPersonal);
window.addEventListener('degreepath:save',refreshPersonal);
window.addEventListener('pagehide',()=>{++personalRevision;personalController?.cancel();personalScopeKey='';});
window.addEventListener('pageshow',event=>{if(event.persisted)refreshPersonal();});

(async()=>{try{
  const loaded=await Promise.all(['data/pathways.json','data/program-catalog.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('The degree plans could not load. Please reload.');return r.json();}));
  try{const r=await fetch('data/plan-library-index.json');const value=r.ok?await r.json():null;index={plans:value?.plans&&typeof value.plans==='object'?value.plans:{},subjects:value?.subjects&&typeof value.subjects==='object'?value.subjects:{}};}catch{index={plans:{},subjects:{}};}
  catalog=await DegreeProgramCatalog.loadIndex(DegreeProgramCatalog.merge(loaded[0],loaded[1]));
  if(typeof DegreeProgramCatalog.publishedPlans!=='function'||catalog.publicationIndex?.available===false)throw Error('We couldn’t load the degree plans. Reload to try again. Your saved plan is safe.');
  // Reviewed plans a student can build (one card per curriculum, as in the degree finder: two catalog links to one
  // program show once), plus complete plans that still need school confirmation, which can only be requested.
  openIds=DegreeProgramCatalog.openablePlanIds(catalog);
  const published=DegreeProgramCatalog.publishedPlans(catalog).filter(p=>P.availability(p).canChoose&&openIds.has(p.id)),ids=new Set(published.map(p=>p.id));
  const representative=new Map(DegreeProgramCatalog.planLibraryRoutes(catalog).map(p=>[p.modelId,p.id])),perModel=new Map();
  for(const p of published){const previous=perModel.get(p.modelId);if(!previous||p.id===representative.get(p.modelId)&&previous.id!==p.id)perModel.set(p.modelId,p);}
  rows=[...perModel.values(),...(typeof DegreeProgramCatalog.isPlanAvailable==='function'?(catalog.pathways||[]).filter(p=>!ids.has(p.id)&&p.modelId&&index.plans[p.id]?.tier==='confirmation'&&DegreeProgramCatalog.isPlanAvailable(p,catalog)&&P.availability(p).canChoose):[])];
  const step=params.get('step');
  // Deep links that name a plan skip straight to step 2.
  const named=idOK(params.get('plan'))?params.get('plan'):idOK(params.get('usePlan'))?params.get('usePlan'):idOK(params.get('program'))?params.get('program'):'';
  // A deep link opens step 2 only for a plan the portal will open (any catalog link to it). A plan that still needs
  // school confirmation is shown on step 1 with its request action instead.
  const sameSchool=p=>!params.get('school')||p.school===params.get('school');
  const chosen=named&&published.find(p=>p.id===named&&sameSchool(p)),requested=named&&!chosen&&rows.find(p=>p.id===named&&sameSchool(p));
  if(params.get('q'))filters.q=params.get('q').slice(0,80);
  if(index.subjects[params.get('subject')])filters.subject=params.get('subject');
  if(levels[params.get('level')])filters.level=params.get('level');
  if(formats[params.get('format')])filters.format=params.get('format');
  if(paceLabels[params.get('pace')])filters.pace=params.get('pace');
  if(billingLabels[params.get('billing')])filters.billing=params.get('billing');
  filters.cbe=params.get('cbe')==='1';
  if(['50','60','70'].includes(params.get('share')))filters.share=params.get('share');
  if(['15000','25000','40000'].includes(params.get('budget')))filters.budget=params.get('budget');
  if(['fit','cost','outside','time','az'].includes(params.get('sort')))filters.sort=params.get('sort');
  if(params.get('confirm')==='0')filters.confirm=false;
  if(params.get('school'))filters.q=filters.q||params.get('school').slice(0,80);
  if(requested&&!params.get('q'))filters.q=requested.title.slice(0,80);
  if(window.DegreeDiscoveryClient){try{personalController=window.DegreeDiscoveryClient.create({catalog});personalAvailable=personalController.hasCourses();personalEnabled=personalAvailable&&params.get('fit')!=='0';if(personalEnabled&&!params.has('sort'))filters.sort='fit';if(!personalAvailable&&filters.sort==='fit')filters.sort='cost';}catch{personalError='Your course collection could not be opened. Open My courses to continue.';}}
  if(chosen){openCredits(chosen);return;}
  if(step==='quiz'){renderQuiz();document.title='1-minute quiz — DegreeSteps';show('quiz');return;}
  $('start-q').value=filters.q;
  if(requested)$('start-error').textContent='That plan still needs school confirmation, so it can’t be built yet. You can request it below.',$('start-error').hidden=false;
  else if(named&&!chosen)$('start-error').textContent='That degree plan isn’t available right now. Pick another below.',$('start-error').hidden=false;
  renderDegree();show('degree');
}catch(error){$('start-loading').hidden=true;$('start-error').hidden=false;$('start-error').textContent=error.message;}})();
}());
