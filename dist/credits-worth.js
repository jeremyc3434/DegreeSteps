/* "What are my credits worth?" Reads My courses from this device, accepts quick unsaved entries, and ranks
 * degree plans in a Web Worker. Nothing is uploaded; nothing is saved unless the student chooses Save. */
(function(){
 'use strict';
 const KEY='degreepath-guide-v3',PAGE=12,$=id=>document.getElementById(id);
 const Library=window.DegreeCourseLibrary,Sheet=window.DegreeSheet,Worth=window.DegreeCreditsWorth;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 const num=value=>Number.isInteger(value)?String(value):String(Math.round(value*100)/100);
 const levels={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
 const unitsOf=result=>result.creditSystem==='competency-unit'?'competency units':'credits';
 const random=()=>Math.random().toString(36).slice(2,9);
 let saved=null,storageOk=true,quick=[],courses=[],results=new Map(),total=0,done=0,running=false,limit=PAGE,worker=null,runId=0,timer=null,frame=0,elapsed=null,subjectsFilled=false,pendingHref='';

 // ---------- Device draft (read only until the student chooses Save) ----------
 function readSaved(){
  let raw=null;
  try{raw=localStorage.getItem(KEY);}catch{storageOk=false;note('This browser can’t open device storage. You can still add courses here, but saving is unavailable.');return null;}
  storageOk=true;
  if(!raw){note('');return Library.initialize(null);}
  try{const state=Library.initialize(JSON.parse(raw));note('');return state;}
  catch{storageOk=false;note('Your saved courses couldn’t be read, so they aren’t included. They have not been changed.');return null;}
 }
 function note(text){$('cw-storage-note').hidden=!text;$('cw-storage-note').textContent=text;}
 const savedCompleted=()=>saved?Worth.completedRecords(saved):[];
 const learning=()=>[...savedCompleted(),...quick.map(item=>item.record)];

 // ---------- Quick entries ----------
 function scratchCatalogRecord(course){
  let state=Library.saveCourse(Library.initialize(null),course);const record=state.learning[0];
  state=Library.setStatus(state,record.id,'earned');
  return {...state.learning[0],id:'quick-'+random()};
 }
 function addCatalog(course){
  if(quick.some(item=>item.course?.id===course.id))throw Error('You already added this course.');
  const existing=saved&&Library.findRecord(saved,course);
  if(existing&&existing.status==='earned')throw Error('This course is already in My courses as finished.');
  quick.push({course,record:scratchCatalogRecord(course),existing:existing?existing.status:''});
 }
 function addManual(values){
  const credits=values.credits===''?null:Number(values.credits);
  const item={id:'quick-manual-'+random(),provider:values.provider.trim(),code:values.code.trim(),title:values.title.trim(),credits,creditSystem:credits===null?null:(values.creditSystem||null),status:'earned',completedOn:'',codeBasis:values.code.trim()?'student-record':'not-yet-known',creditBasis:credits===null?'not-yet-known':'student-record'};
  if(!item.provider||!item.title)throw Error('Add the school or provider and the course title.');
  const state=Sheet.updateLearning(Library.initialize(null),item),record=state.learning.find(r=>r.id===item.id);
  if(learning().some(r=>norm(r.provider)===norm(record.provider)&&(record.code?norm(r.code)===norm(record.code):norm(r.title)===norm(record.title))))throw Error('This course is already in your list.');
  quick.push({record,manual:true});
 }
 function saveQuick(){
  let raw=null,latest;
  try{raw=localStorage.getItem(KEY);}catch{throw Error('This browser can’t save right now. Your added courses are still on this page.');}
  try{latest=raw?Library.initialize(JSON.parse(raw)):Library.initialize(null);}catch{throw Error('Your saved courses couldn’t be read, so nothing was saved. Your existing data has not been changed.');}
  let added=0,kept=0;
  for(const item of quick){
   if(item.course){
    if(Library.findRecord(latest,item.course)){kept++;continue;}
    latest=Library.saveCourse(latest,item.course);latest=Library.setStatus(latest,Library.findRecord(latest,item.course).id,'earned');added++;
   }else{
    const r=item.record;
    if(latest.learning.some(x=>norm(x.provider)===norm(r.provider)&&(r.code?norm(x.code)===norm(r.code):norm(x.title)===norm(r.title)))){kept++;continue;}
    latest=Sheet.updateLearning(latest,{...r,id:'course-manual-'+random()});latest.courseFirst=true;added++;
   }
  }
  try{localStorage.setItem(KEY,JSON.stringify(latest));}catch{window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:false}}));throw Error('This browser couldn’t save. Your added courses are still on this page.');}
  window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));
  quick=[];saved=latest;storageOk=true;
  return (added?added+' course'+(added===1?'':'s')+' saved to My courses on this device.':'')+(kept?' '+kept+' already in My courses '+(kept===1?'was':'were')+' left unchanged.':'');
 }

 // ---------- Ranking in a worker ----------
 function ensureWorker(){
  if(worker)return worker;
  if(typeof Worker!=='function')throw Error('This browser can’t run the plan check. Try a current version of Chrome, Edge, Firefox or Safari.');
  worker=new Worker('credits-worth-worker.js');
  worker.addEventListener('message',event=>{
   const message=event.data;if(!message||message.id!==runId)return;
   if(message.event==='start'){total=message.total;fillSubjects(message.subjects);}
   else if(message.event==='result'){results.set(message.result.routeId,message.result);done=message.done;total=message.total;queueRender();}
   else if(message.event==='done'){running=false;elapsed=message.ms;try{window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event:'credits_worth_used',context:'workspace'}}));}catch{/* Anonymous aggregate counter: the first ranking finished. No course records are sent. */}const status=$('cw-save-status');if(/ Checking plans…$/.test(status.textContent))status.textContent=status.textContent.replace(/ Checking plans…$/,' Plans updated.');render({announce:true});}
   else if(message.event==='error'){running=false;showError(message.error+' Reload to try again.');render();}
  });
  worker.addEventListener('error',()=>{running=false;showError('The plan check stopped unexpectedly. Reload to try again.');render();});
  return worker;
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(run,120);}
 function run(){
  results=new Map();done=0;elapsed=null;limit=PAGE;showError('');
  const records=learning();
  runId++;
  if(!records.length){running=false;render({announce:true});return;}
  try{ensureWorker().postMessage({id:runId,kind:'rank',learning:records});running=true;}
  catch(error){running=false;showError(error.message);}
  render({announce:true});
 }
 function queueRender(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});}
 function showError(text){$('cw-error').hidden=!text;$('cw-error').textContent=text;}
 function fillSubjects(subjects){
  if(subjectsFilled||!subjects)return;subjectsFilled=true;const select=$('cw-subject'),value=select.value;
  select.innerHTML='<option value="">All subjects</option>'+Object.entries(subjects).map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');const wanted=value||new URLSearchParams(location.search).get('subject')||'';select.value=Object.hasOwn(subjects,wanted)?wanted:'';
 }

 // ---------- Rendering ----------
 function outcomeText(line){
  if(!line)return running?'<span class="cw-outcome cw-outcome-pending">Checking…</span>':'';
  if(line.status==='matched')return '<span class="cw-outcome cw-outcome-match">Could count in '+line.plans+' of '+line.checked+' plan'+(line.checked===1?'':'s')+'</span>';
  if(line.status==='ambiguous')return '<span class="cw-outcome cw-outcome-review">Needs review: this code matches more than one listed course. Choose it from the list, or enter one exact code.</span>';
  if(line.status==='review')return '<span class="cw-outcome cw-outcome-review">Needs review: '+esc(line.reason)+'</span>';
  return '<span class="cw-outcome cw-outcome-none">No listed match yet. A school transcript evaluation can still review it.</span>';
 }
 function renderRecords(summary){
  const records=learning(),lines=new Map(summary.map(line=>[line.id,line])),quickIds=new Set(quick.map(item=>item.record.id));
  $('cw-course-count').textContent=String(records.length);
  $('cw-courses-empty').hidden=records.length>0;$('cw-jump').hidden=!records.length;
  $('cw-record-list').innerHTML=records.map(record=>{
   const isQuick=quickIds.has(record.id),meta=[record.provider,record.code,Number.isFinite(record.credits)?num(record.credits)+' '+(record.creditSystem==='quarter'?'quarter credits':record.creditSystem==='competency-unit'?'competency units':'credits'):''].filter(Boolean).join(' · ');
   const item=quick.find(entry=>entry.record.id===record.id);
   return '<li class="cw-record"><div><strong>'+esc(record.title)+'</strong><span class="cw-record-meta">'+esc(meta)+'</span>'+(isQuick?'<span class="cw-tag cw-tag-unsaved">Added here · not saved</span>'+(item?.existing?'<span class="cw-record-meta">In My courses as '+(item.existing==='in-progress'?'Taking':'Not started')+'. Saving won’t change it.</span>':''):'<span class="cw-tag">My courses</span>')+(running?outcomeText(null):outcomeText(lines.get(record.id)))+'</div>'+(isQuick?'<button type="button" class="cw-remove" data-remove="'+esc(record.id)+'" aria-label="Remove '+esc(record.title)+'">Remove</button>':'<a class="cw-edit" href="courses.html?tab=mine">Edit</a>')+'</li>';
  }).join('');
  const others=saved?saved.learning.filter(record=>record.status!=='earned').length:0;
  $('cw-other-status').hidden=!others;
  $('cw-other-status').innerHTML=others?others+' course'+(others===1?' is':'s are')+' in My courses but not marked Finished, so '+(others===1?'it isn’t':'they aren’t')+' counted. <a href="courses.html?tab=mine">Update them in My courses</a>.':'';
  $('cw-save-bar').hidden=!quick.length;
  $('cw-save-text').textContent=quick.length?quick.length+' added course'+(quick.length===1?' isn’t':'s aren’t')+' saved. Save to keep '+(quick.length===1?'it':'them')+' in My courses on this device.':'';
  $('cw-save').disabled=!storageOk&&!!saved;
 }
 function bar(result){
  const parts=[['fill',result.filled],['outside',result.remainingOutside],['university',result.remainingUniversity],['open',result.unresolved]].filter(([,value])=>value>0);
  return '<div class="cw-bar" aria-hidden="true">'+parts.map(([kind,value])=>'<span class="cw-bar-'+kind+'" style="flex-grow:'+value+'"></span>').join('')+'</div>';
 }
 function card(result,position){
  const id='cw-plan-'+position,units=unitsOf(result),formats=result.modalities.map(m=>m==='campus'?'On campus':'Online').join(' · ');
  const badge=result.tier==='reviewed'?'<span class="pf-badge pf-badge-ready">Reviewed plan</span>':'<span class="pf-badge pf-badge-confirm">Needs school confirmation</span>';
  const head='<div class="pf-school-row"><span class="pf-school">'+esc(result.school)+'</span></div><h3 id="'+id+'">'+esc(result.title)+'</h3><p class="pf-meta">'+esc([levels[result.level]||result.level,formats].filter(Boolean).join(' · '))+'</p>';
  if(result.status!=='ok')return '<li class="cw-card cw-card-unavailable"><article aria-labelledby="'+id+'"><div class="cw-card-main">'+head+'<p class="cw-left">'+esc(result.reason)+'</p></div><div class="cw-card-side"><a class="pf-button" href="programs.html">See plan details</a></div></article></li>';
  const matched=result.matches.length?'<details class="cw-matched"><summary>Which courses matched</summary><ul>'+result.matches.map(match=>{const record=learning().find(r=>r.id===match.learningId);return '<li><strong>'+esc(record?.title||'Your course')+'</strong> → '+esc(match.requirement)+' <span>('+num(match.credits)+' '+units+')</span></li>';}).join('')+'</ul></details>':'<p class="cw-none-line">None of your courses match this plan’s listed course options.</p>';
  const left=[result.remainingOutside+' outside '+units,result.remainingUniversity+' at the university',...(result.unresolved>0?[result.unresolved+' still to choose']:[])];
  const estimate=result.estimate?.status==='partial'?'<div class="pf-price cw-price"><span class="cw-price-label">Known charges so far</span><strong>'+money(result.estimate.min)+'–'+money(result.estimate.max)+'</strong><small>Before aid · '+esc((result.estimate.unpriced||[]).join(' and ')||'Some course')+' prices not included</small></div>':result.estimate?.status==='range'?'<div class="pf-price cw-price"><span class="cw-price-label">Remaining planning estimate</span><strong>'+money(result.estimate.min)+'–'+money(result.estimate.max)+'</strong><small>Before aid · tuition, fees and outside courses</small></div>':'<div class="pf-price cw-price"><span class="cw-price-label">Remaining cost</span><strong>Needs confirmation</strong><small>'+esc(result.estimate?.reason||'')+'</small></div>';
  const questions=result.tier!=='reviewed'?'<p class="pf-confirm-note"><strong>Open question:</strong> '+esc(result.questions[0]||'Some details still need confirmation with the school.')+'</p>'+(result.questions.length>1?'<details class="cw-questions"><summary>'+(result.questions.length-1)+' more to ask the school</summary><ul>'+result.questions.slice(1).map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul></details>':''):'';
  return '<li class="cw-card"><article aria-labelledby="'+id+'"><div class="cw-card-main">'+head+'<p class="cw-fill">Your courses could fill <strong>'+num(result.filled)+'</strong> of '+num(result.totalCredits)+' '+units+'</p>'+bar(result)+'<p class="cw-left"><span class="cw-left-label">Left:</span> '+esc(left.join(' · '))+'</p><div class="pf-badges">'+badge+'</div>'+questions+matched+'</div><div class="cw-card-side">'+estimate+'<a class="pf-button pf-button-primary cw-build" data-build href="portal.html?usePlan='+encodeURIComponent(result.routeId)+'" aria-describedby="'+id+'">Build this plan</a></div></article></li>';
 }
 function render(options={}){
  const all=[...results.values()],summary=Worth.recordSummary(all,learning()),records=learning();
  renderRecords(summary);
  const ranked=Worth.rank(all,{sort:$('cw-sort').value,subject:$('cw-subject').value,format:$('cw-format').value,level:$('cw-level').value,matchedOnly:$('cw-matched').checked});
  const shown=ranked.results.slice(0,limit);
  $('cw-empty').hidden=records.length>0;
  $('cw-progress-wrap').hidden=!running;
  $('cw-progress').max=Math.max(total,1);$('cw-progress').value=done;
  $('cw-progress-text').textContent='Checking plans on your device… '+done+(total?' of '+total:'');
  $('cw-list').setAttribute('aria-busy',String(running));
  $('cw-list').innerHTML=shown.map((result,i)=>card(result,i)).join('');
  $('cw-more').hidden=ranked.results.length<=limit;
  $('cw-more').textContent='Show '+Math.min(PAGE,ranked.results.length-limit)+' more plans';
  const finished=!running&&records.length&&all.length;
  $('cw-nomatch').hidden=!(finished&&ranked.withMatches===0);
  if(options.announce||!running){
   const filtered=$('cw-subject').value||$('cw-format').value||$('cw-level').value||$('cw-matched').checked;
   $('cw-count').textContent=!records.length?'Add a finished course to see your ranking.':running?'Checking '+(total||'all')+' degree plans with your '+records.length+' course'+(records.length===1?'':'s')+'…':ranked.total?(filtered?ranked.results.length+' of '+ranked.total+' plans shown':ranked.total+' plans checked')+' · '+ranked.withMatches+' could use your courses'+(elapsed!==null?' · checked in '+(elapsed/1000).toFixed(1)+'s':''):'No plans could be checked.';
  }
 }

 // ---------- Course picker ----------
 function fillPicker(){
  const providers=[...new Set(courses.map(course=>course.provider))].sort();
  $('cw-provider').innerHTML='<option value="">Choose a provider</option>'+providers.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join('');
  $('cw-provider-names').innerHTML=[...new Set([...providers,'DSST','Saylor Academy','ACE-recommended course','Community college'])].map(p=>'<option value="'+esc(p)+'"></option>').join('');
 }
 function fillCourses(){
  const provider=$('cw-provider').value,select=$('cw-course');
  const rows=courses.filter(course=>course.provider===provider).sort((a,b)=>a.title.localeCompare(b.title));
  select.disabled=!rows.length;
  select.innerHTML=rows.length?'<option value="">Choose a course ('+rows.length+')</option>'+rows.map(course=>{const code=Library.courseCode(course);return '<option value="'+esc(course.id)+'">'+esc(course.title+(code?' — '+code:''))+'</option>';}).join(''):'<option value="">Choose a provider first</option>';
 }
 async function loadCourses(){
  try{const response=await fetch('data/course-catalog.json');if(!response.ok)throw Error();const data=await response.json();courses=Array.isArray(data.courses)?data.courses.filter(c=>c&&c.id&&c.provider&&c.title):[];fillPicker();}
  catch{$('cw-provider').innerHTML='<option value="">Course list unavailable</option>';$('cw-pick-error').textContent='The course list couldn’t load. You can still enter a course yourself.';}
 }

 // Arriving from the guided planner's results: offer the way back (its answers stay in the saved plan state).
 try{if(new URLSearchParams(location.search).get('from')==='guided')$('cw-from-guided').hidden=false;}catch{}

 // ---------- Events ----------
 $('cw-provider').addEventListener('change',()=>{$('cw-pick-error').textContent='';fillCourses();});
 $('cw-pick-form').addEventListener('submit',event=>{
  event.preventDefault();$('cw-pick-error').textContent='';
  const course=courses.find(c=>c.id===$('cw-course').value);
  if(!course){$('cw-pick-error').textContent=$('cw-provider').value?'Choose a course from the list.':'Choose a provider, then a course.';($('cw-provider').value?$('cw-course'):$('cw-provider')).focus();return;}
  try{addCatalog(course);$('cw-save-status').textContent='Added '+course.title+'. Checking plans…';$('cw-course').value='';schedule();render();}
  catch(error){$('cw-pick-error').textContent=error.message;}
 });
 $('cw-manual-toggle').addEventListener('click',()=>{const form=$('cw-manual-form'),open=form.hidden;form.hidden=!open;$('cw-manual-toggle').setAttribute('aria-expanded',String(open));if(open)$('cw-manual-provider').focus();});
 $('cw-manual-form').addEventListener('submit',event=>{
  event.preventDefault();$('cw-manual-error').textContent='';
  const values={provider:$('cw-manual-provider').value,code:$('cw-manual-code').value,title:$('cw-manual-title').value,credits:$('cw-manual-credits').value.trim(),creditSystem:$('cw-manual-units').value};
  try{addManual(values);$('cw-save-status').textContent='Added '+values.title.trim()+'. Checking plans…';event.target.reset();schedule();render();$('cw-manual-provider').focus();}
  catch(error){$('cw-manual-error').textContent=error.message;}
 });
 $('cw-record-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove]');if(!button)return;
  const index=quick.findIndex(item=>item.record.id===button.dataset.remove);if(index<0)return;
  const [removed]=quick.splice(index,1);$('cw-save-status').textContent='Removed '+removed.record.title+'.';
  schedule();render();
  const buttons=[...document.querySelectorAll('[data-remove]')];(buttons[Math.min(index,buttons.length-1)]||$('cw-provider')).focus();
 });
 $('cw-save').addEventListener('click',()=>{try{$('cw-save-status').textContent=saveQuick();schedule();render();}catch(error){$('cw-save-status').textContent=error.message;}});
 // Sort and filters live in the address bar so a ranking view can be bookmarked or shared. Course records never do.
 const CONTROLS={sort:'cw-sort',subject:'cw-subject',format:'cw-format',level:'cw-level'};
 function writeControls(){try{const params=new URLSearchParams(location.search);for(const [name,id] of Object.entries(CONTROLS)){const value=$(id).value;if(value&&!(name==='sort'&&value==='covered'))params.set(name,value);else params.delete(name);}if($('cw-matched').checked)params.set('matched','1');else params.delete('matched');const query=params.toString(),next=location.pathname+(query?'?'+query:'')+location.hash;if(next!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',next);}catch{}}
 function readControls(){const params=new URLSearchParams(location.search);for(const [name,id] of Object.entries(CONTROLS)){const value=params.get(name),select=$(id);if(value&&[...select.options].some(option=>option.value===value))select.value=value;}$('cw-matched').checked=params.get('matched')==='1';}
 readControls();
 for(const id of ['cw-sort','cw-subject','cw-format','cw-level','cw-matched'])$(id).addEventListener('change',()=>{limit=PAGE;writeControls();render({announce:true});});
 $('cw-controls').addEventListener('submit',event=>event.preventDefault());
 $('cw-more').addEventListener('click',()=>{const first=limit;limit+=PAGE;render();document.querySelectorAll('#cw-list .cw-card')[first]?.querySelector('a')?.focus();});
 $('cw-empty-add').addEventListener('click',event=>{event.preventDefault();$('cw-add').open=true;$('cw-provider').focus();});
 // Opening a plan uses My courses. Unsaved quick entries are included only when the student explicitly saves them.
 $('cw-list').addEventListener('click',event=>{
  const link=event.target.closest('a[data-build]');if(!link||!quick.length)return;
  event.preventDefault();pendingHref=link.getAttribute('href');$('cw-build-skip').setAttribute('href',pendingHref);$('cw-build-dialog').showModal();
 });
 $('cw-build-cancel').addEventListener('click',()=>$('cw-build-dialog').close());
 $('cw-build-save').addEventListener('click',()=>{try{saveQuick();location.href=pendingHref;}catch(error){$('cw-build-dialog').close();$('cw-save-status').textContent=error.message;}});
 window.addEventListener('storage',event=>{if(event.key!==KEY)return;saved=readSaved();schedule();});

 saved=readSaved();
 loadCourses();
 run();
}());
