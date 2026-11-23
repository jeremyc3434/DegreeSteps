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
let catalog,rows=[],index={plans:{},subjects:{}},limit=12;
const filters={q:'',subject:'',level:'',format:'',sort:'cost',confirm:true};

const info=p=>index.plans[p.id]||{tier:'reviewed',subjects:[]};
const needsConfirmation=p=>info(p).tier==='confirmation';
const money=v=>v>=10000?'$'+(Math.round(v/100)/10).toLocaleString('en-US')+'k':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const costText=p=>{const e=info(p).estimate;return e&&Number.isFinite(e.min)&&Number.isFinite(e.max)?(e.min===e.max?money(e.min):money(e.min)+'–'+money(e.max)):'';};
const months=p=>{const t=info(p).timing;if(!t||!t.outsideMonths||!t.universityTerms||!Number.isFinite(t.termMonths))return null;return t.outsideMonths.min+t.universityTerms.min*t.termMonths;};
const share=p=>{const s=info(p).start;return s&&s.total>0?s.outside/s.total:null;};
const unit=p=>p.school==='Western Governors University'?'units':'credits';

// Where "Build this plan" leads once step 2 is answered. A plan with a saved starting route opens directly;
// any other plan uses the finder's existing school/program link, which asks its own remaining questions.
function planUrl(p,then){
  if(info(p).start)return 'portal.html?usePlan='+encodeURIComponent(p.id)+(then?'&then='+encodeURIComponent(then):'');
  const format=p.modalities?.length===1?'&format='+encodeURIComponent(p.modalities[0]):'';
  return 'portal.html?school='+encodeURIComponent(p.school)+'&program='+encodeURIComponent(p.id)+'&level='+encodeURIComponent(p.level)+format;
}

function matches(p){
  if(filters.subject&&!(info(p).subjects||[]).includes(filters.subject))return false;
  if(filters.level&&p.level!==filters.level)return false;
  if(filters.format&&!(p.modalities||[]).includes(filters.format))return false;
  if(!filters.confirm&&needsConfirmation(p))return false;
  const q=norm(filters.q).trim();
  if(q){const hay=norm([p.school,p.title,levels[p.level],...(info(p).subjects||[]).map(id=>index.subjects[id]||id)].join(' '));if(!q.split(/\s+/).every(word=>hay.includes(word)))return false;}
  return true;
}
function sorted(list){
  const last=v=>v===null||v===undefined?Infinity:v;
  const by={
    cost:(a,b)=>last(info(a).estimate?.min)-last(info(b).estimate?.min),
    outside:(a,b)=>(share(b)??-1)-(share(a)??-1),
    time:(a,b)=>last(months(a))-last(months(b)),
    az:(a,b)=>a.title.localeCompare(b.title)
  }[filters.sort]||(()=>0);
  return [...list].sort((a,b)=>by(a,b)||Number(needsConfirmation(a))-Number(needsConfirmation(b))||a.title.localeCompare(b.title)||a.school.localeCompare(b.school));
}
function card(p){
  const s=info(p).start,cost=costText(p),pct=s&&s.total?Math.round(s.outside/s.total*100):0,fmt=(p.modalities||[]).map(m=>formats[m]||m).join(' · ');
  return '<article class="start-card" data-plan="'+esc(p.id)+'"><div class="start-card-head"><p class="start-school">'+esc(p.school)+(fmt?' · '+esc(fmt):'')+'</p><h2>'+esc(p.title)+'</h2>'
    +(needsConfirmation(p)?'<span class="start-badge">Needs school confirmation</span>':'')+'</div>'
    +'<div class="start-stats"><div class="start-stat"><span>Est. cost</span><strong>'+(cost?esc(cost):'Ask the school')+'</strong></div>'
    +'<div class="start-stat start-stat-accent"><span>Low-cost '+unit(p)+'</span><strong>'+(s?s.outside+' of '+s.total:'—')+'</strong></div></div>'
    +(s?'<div class="start-bar" role="img" aria-label="'+esc(s.outside+' of '+s.total+' '+unit(p)+' can come from low-cost courses')+'"><span style="width:'+pct+'%"></span></div>':'')
    +'<div class="start-card-actions"><a class="start-primary" data-build-plan="'+esc(p.id)+'" href="start.html?step=credits&amp;plan='+encodeURIComponent(p.id)+'">Build this plan</a>'
    +(info(p).page?'<a class="start-text-link" href="'+esc(info(p).page)+'">See every course</a>':'')+'</div></article>';
}
function chipGroup(id,name,options,current){
  const el=$(id);const legend=el.querySelector('legend').outerHTML;
  el.innerHTML=legend+[['','All'],...options].map(([value,label])=>'<button type="button" class="start-chip" data-filter="'+name+'" data-value="'+esc(value)+'" aria-pressed="'+String(value===current)+'">'+esc(label)+'</button>').join('');
}
function renderDegree(){
  const list=sorted(rows.filter(matches)),pending=list.filter(needsConfirmation).length;
  $('start-count').textContent=list.length?list.length+' degree'+(list.length===1?'':'s')+(pending?' · '+pending+' need'+(pending===1?'s':'')+' school confirmation':''):'No degrees match. Try fewer filters.';
  $('start-results').innerHTML=list.slice(0,limit).map(card).join('')||'<div class="start-empty"><p>No degree plan matches these choices yet.</p><button type="button" class="start-secondary" id="start-clear">Clear filters</button> <a href="request-plan.html">Build from a degree link</a></div>';
  $('start-more').hidden=list.length<=limit;
  chipGroup('start-subjects','subject',Object.entries(index.subjects).filter(([id])=>rows.some(p=>(info(p).subjects||[]).includes(id))),filters.subject);
  chipGroup('start-levels','level',Object.entries(levels).filter(([id])=>rows.some(p=>p.level===id)),filters.level);
  chipGroup('start-formats','format',Object.entries(formats).filter(([id])=>rows.some(p=>(p.modalities||[]).includes(id))),filters.format);
  $('start-sort').value=filters.sort;$('start-confirm').checked=filters.confirm;
}
function syncUrl(){
  const next=new URLSearchParams();for(const key of ['q','subject','level','format'])if(filters[key])next.set(key,filters[key]);if(filters.sort!=='cost')next.set('sort',filters.sort);if(!filters.confirm)next.set('confirm','0');
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
  $('start-picked').innerHTML='<strong>'+esc(p.title)+'</strong> · '+esc(p.school)+(cost?' · Est. '+esc(cost):'')+(s?' · '+esc(s.outside+' of '+s.total)+' '+unit(p)+' for less':'');
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
  const next=new URLSearchParams();for(const key of ['level','subject','format'])if(answers[key])next.set(key,answers[key]);if(answers.sort&&answers.sort!=='cost')next.set('sort',answers.sort);next.set('from','quiz');
  location.assign('start.html?'+next);
}

document.addEventListener('click',event=>{
  const chip=event.target.closest?.('[data-filter]');
  if(chip){filters[chip.dataset.filter]=chip.dataset.value;limit=12;renderDegree();syncUrl();const again=document.querySelector('[data-filter="'+chip.dataset.filter+'"][data-value="'+CSS.escape(chip.dataset.value)+'"]');again?.focus();return;}
  if(event.target.id==='start-more'){limit+=12;renderDegree();return;}
  if(event.target.id==='start-clear'){Object.assign(filters,{q:'',subject:'',level:'',format:'',sort:'cost',confirm:true});$('start-q').value='';renderDegree();syncUrl();return;}
  const answer=event.target.closest?.('[data-quiz-answer]');
  if(answer){answers[quiz[quizAt].id]=answer.dataset.quizAnswer;if(quizAt<quiz.length-1){quizAt++;renderQuiz();$('start-quiz-question')?.setAttribute('tabindex','-1');$('start-quiz-question')?.focus();}else finishQuiz();return;}
  if(event.target.id==='start-quiz-back'){event.preventDefault();if(quizAt>0){quizAt--;renderQuiz();}return;}
});
$('start-q').addEventListener('input',()=>{filters.q=$('start-q').value;limit=12;renderDegree();syncUrl();});
$('start-sort').addEventListener('change',()=>{filters.sort=$('start-sort').value;renderDegree();syncUrl();});
$('start-confirm').addEventListener('change',()=>{filters.confirm=$('start-confirm').checked;renderDegree();syncUrl();});

(async()=>{try{
  const loaded=await Promise.all(['data/pathways.json','data/program-catalog.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('The degree plans could not load. Please reload.');return r.json();}));
  try{const r=await fetch('data/plan-library-index.json');const value=r.ok?await r.json():null;index={plans:value?.plans&&typeof value.plans==='object'?value.plans:{},subjects:value?.subjects&&typeof value.subjects==='object'?value.subjects:{}};}catch{index={plans:{},subjects:{}};}
  catalog=await DegreeProgramCatalog.loadIndex(DegreeProgramCatalog.merge(loaded[0],loaded[1]));
  if(typeof DegreeProgramCatalog.publishedPlans!=='function'||catalog.publicationIndex?.available===false)throw Error('We couldn’t load the degree plans. Reload to try again. Your saved plan is safe.');
  // The same plan list as the degree finder: reviewed plans plus complete plans that need school confirmation.
  const published=DegreeProgramCatalog.publishedPlans(catalog).filter(p=>P.availability(p).canChoose),ids=new Set(published.map(p=>p.id));
  rows=[...published,...(typeof DegreeProgramCatalog.isPlanAvailable==='function'?(catalog.pathways||[]).filter(p=>!ids.has(p.id)&&p.modelId&&index.plans[p.id]?.tier==='confirmation'&&DegreeProgramCatalog.isPlanAvailable(p,catalog)&&P.availability(p).canChoose):[])];
  const step=params.get('step');
  // Deep links that name a plan skip straight to step 2.
  const named=idOK(params.get('plan'))?params.get('plan'):idOK(params.get('usePlan'))?params.get('usePlan'):idOK(params.get('program'))?params.get('program'):'';
  const chosen=named&&rows.find(p=>p.id===named&&(!params.get('school')||p.school===params.get('school')));
  if(chosen){openCredits(chosen);return;}
  if(step==='quiz'){renderQuiz();document.title='1-minute quiz — DegreeSteps';show('quiz');return;}
  if(params.get('q'))filters.q=params.get('q').slice(0,80);
  if(index.subjects[params.get('subject')])filters.subject=params.get('subject');
  if(levels[params.get('level')])filters.level=params.get('level');
  if(formats[params.get('format')])filters.format=params.get('format');
  if(['cost','outside','time','az'].includes(params.get('sort')))filters.sort=params.get('sort');
  if(params.get('confirm')==='0')filters.confirm=false;
  if(params.get('school'))filters.q=filters.q||params.get('school').slice(0,80);
  $('start-q').value=filters.q;
  if(named&&!chosen)$('start-error').textContent='That degree plan isn’t available right now. Pick another below.',$('start-error').hidden=false;
  renderDegree();show('degree');
}catch(error){$('start-loading').hidden=true;$('start-error').hidden=false;$('start-error').textContent=error.message;}})();
}());
