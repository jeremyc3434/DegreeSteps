/* "What are my credits worth?" A focused view over the one shared course list (My courses, saved on this device).
 * A course added here is added to My courses straight away, exactly as on every other page, so it is never entered twice.
 * Degree plans are ranked in a Web Worker. Nothing is uploaded. */
(function(){
 'use strict';
 const KEY='degreepath-guide-v3',PAGE=12,$=id=>document.getElementById(id);
 const Library=window.DegreeCourseLibrary,Worth=window.DegreeCreditsWorth;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 const num=value=>Number.isInteger(value)?String(value):String(Math.round(value*100)/100);
 const levels={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
 const unitsOf=result=>result.creditSystem==='competency-unit'?'competency units':'credits';
 let saved=null,storageOk=true,addedHere=new Set(),courses=[],results=new Map(),total=0,done=0,running=false,limit=PAGE,worker=null,runId=0,timer=null,frame=0,elapsed=null,subjectsFilled=false;

 // ---------- My courses (the shared device course list) ----------
 function readSaved(){
  let raw=null;
  try{raw=localStorage.getItem(KEY);}catch{storageOk=false;note('This browser can’t open device storage, so My courses can’t be read or changed here.');return null;}
  storageOk=true;
  if(!raw){note('');return Library.initialize(null);}
  try{const state=Library.initialize(JSON.parse(raw));note('');return state;}
  catch{storageOk=false;note('Your saved courses couldn’t be read, so they aren’t included. They have not been changed.');return null;}
 }
 function note(text){$('cw-storage-note').hidden=!text;$('cw-storage-note').textContent=text;}
 const savedCompleted=()=>saved?Worth.completedRecords(saved):[];
 const learning=()=>savedCompleted();

 // ---------- Adding to My courses ----------
 // Every change re-reads the latest saved list first, so a course added in another tab is never overwritten.
 function writeLatest(change){
  let raw=null,latest;
  try{raw=localStorage.getItem(KEY);}catch{throw Error('This browser can’t save right now. My courses has not changed.');}
  try{latest=raw?Library.initialize(JSON.parse(raw)):Library.initialize(null);}catch{throw Error('Your saved courses couldn’t be read, so nothing was changed.');}
  const result=change(latest);
  try{localStorage.setItem(KEY,JSON.stringify(result.state));}catch{window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:false}}));throw Error('This browser couldn’t save. My courses has not changed.');}
  window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));
  saved=result.state;storageOk=true;note('');
  return result;
 }
 const progressName=status=>status==='in-progress'?'Taking':status==='earned'?'Finished':'Not started';
 function addCatalog(course){
  return writeLatest(latest=>{
   const existing=Library.findRecord(latest,course);
   if(existing)throw Error(existing.status==='earned'?'This course is already in My courses as Finished.':'This course is already in My courses as '+progressName(existing.status)+'. Mark it Finished in My courses to count it here.');
   let state=Library.saveCourse(latest,course);const record=Library.findRecord(state,course);
   state=Library.setStatus(state,record.id,'earned');state.courseFirst=true;
   addedHere.add(record.id);
   return {state,record};
  });
 }
 function removeAdded(id){
  if(!addedHere.has(id))throw Error('Edit or remove this course in My courses.');
  return writeLatest(latest=>{const record=latest.learning.find(r=>r.id===id);if(!record)throw Error('This course is no longer in My courses.');addedHere.delete(id);return {state:Library.removeCourse(latest,id),record};});
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
  const records=learning(),lines=new Map(summary.map(line=>[line.id,line]));
  $('cw-course-count').textContent=String(records.length);
  $('cw-courses-empty').hidden=records.length>0;$('cw-jump').hidden=!records.length;
  $('cw-record-list').innerHTML=records.map(record=>{
   const isNew=addedHere.has(record.id),meta=[record.provider,record.code,Number.isFinite(record.credits)?num(record.credits)+' '+(record.creditSystem==='quarter'?'quarter credits':record.creditSystem==='competency-unit'?'competency units':record.creditSystem==='semester'?'semester credits':'credits'):''].filter(Boolean).join(' · ');
   return '<li class="cw-record"><div><strong>'+esc(record.title)+'</strong><span class="cw-record-meta">'+esc(meta)+'</span><span class="cw-tag">'+(isNew?'Added to My courses':'In My courses')+'</span>'+(running?outcomeText(null):outcomeText(lines.get(record.id)))+'</div>'+(isNew?'<button type="button" class="cw-remove" data-remove="'+esc(record.id)+'" aria-label="Remove '+esc(record.title)+' from My courses">Remove</button>':'<a class="cw-edit" href="courses.html?tab=mine&amp;record='+encodeURIComponent(record.id)+'" aria-label="Edit '+esc(record.title)+' in My courses">Edit</a>')+'</li>';
  }).join('');
  const others=saved?saved.learning.filter(record=>record.status!=='earned').length:0;
  $('cw-other-status').hidden=!others;
  $('cw-other-status').innerHTML=others?others+' course'+(others===1?' is':'s are')+' in My courses but not marked Finished, so '+(others===1?'it isn’t':'they aren’t')+' counted. <a href="courses.html?tab=mine">Update them in My courses</a>.':'';
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
  try{addCatalog(course);$('cw-save-status').textContent='Added '+course.title+' to My courses. Checking plans…';$('cw-course').value='';schedule();render();}
  catch(error){$('cw-pick-error').textContent=error.message;}
 });
 $('cw-record-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove]');if(!button)return;
  const index=[...document.querySelectorAll('[data-remove]')].indexOf(button);
  try{const {record}=removeAdded(button.dataset.remove);$('cw-save-status').textContent='Removed '+record.title+' from My courses.';}
  catch(error){$('cw-save-status').textContent=error.message;return;}
  schedule();render();
  const buttons=[...document.querySelectorAll('[data-remove]')];(buttons[Math.min(index,buttons.length-1)]||$('cw-provider')).focus();
 });
 // Sort and filters live in the address bar so a ranking view can be bookmarked or shared. Course records never do.
 const CONTROLS={sort:'cw-sort',subject:'cw-subject',format:'cw-format',level:'cw-level'};
 function writeControls(){try{const params=new URLSearchParams(location.search);for(const [name,id] of Object.entries(CONTROLS)){const value=$(id).value;if(value&&!(name==='sort'&&value==='covered'))params.set(name,value);else params.delete(name);}if($('cw-matched').checked)params.set('matched','1');else params.delete('matched');const query=params.toString(),next=location.pathname+(query?'?'+query:'')+location.hash;if(next!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',next);}catch{}}
 function readControls(){const params=new URLSearchParams(location.search);for(const [name,id] of Object.entries(CONTROLS)){const value=params.get(name),select=$(id);if(value&&[...select.options].some(option=>option.value===value))select.value=value;}$('cw-matched').checked=params.get('matched')==='1';}
 readControls();
 for(const id of ['cw-sort','cw-subject','cw-format','cw-level','cw-matched'])$(id).addEventListener('change',()=>{limit=PAGE;writeControls();render({announce:true});});
 $('cw-controls').addEventListener('submit',event=>event.preventDefault());
 $('cw-more').addEventListener('click',()=>{const first=limit;limit+=PAGE;render();document.querySelectorAll('#cw-list .cw-card')[first]?.querySelector('a')?.focus();});
 $('cw-empty-add').addEventListener('click',event=>{event.preventDefault();$('cw-add').open=true;$('cw-provider').focus();});
 window.addEventListener('storage',event=>{if(event.key!==KEY)return;saved=readSaved();schedule();});

 saved=readSaved();
 loadCourses();
 run();
}());
