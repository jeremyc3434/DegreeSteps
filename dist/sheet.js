/* DegreeSteps's local worksheet. Catalog facts remain separate from a student's choices. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), Sheet = window.DegreeSheet, Guide = window.DegreeGuide, Planner = window.DegreePlanner, Journey = window.DegreeJourney;
  const KEY = 'degreepath-guide-v3';
  const query = new URLSearchParams(location.search), task = ['credits','cost-time','checks','next','download'].includes(query.get('task')) ? query.get('task') : '';
  if(task)document.body.classList.add('portal-task-page');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const schoolKey = name => ({'Thomas Edison State University':'tesu','Liberty University':'liberty','University of Maine at Presque Isle':'umpi','Western Governors University':'wgu','Charter Oak State College':'cosc','Southern New Hampshire University':'snhu','Purdue Global':'purdue-global'}[name] || slug(name));
  const safeURL = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const link = (href,title) => safeURL(href) ? '<a href="'+esc(safeURL(href))+'" target="_blank" rel="noopener">'+esc(title)+'</a>' : esc(title);
  // Links out to course providers go through the shared outbound helper (outbound.js), which only renders the link.
  const providerLink = (href,title,provider,className='') => { if(!window.DegreeOutbound) return className ? '<a class="'+className+'" href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(title)+'</a>' : link(href,title); const url = className ? href : safeURL(href); return url ? window.DegreeOutbound.link({href:url,html:esc(title),provider,className}) : esc(title); };
  // Anonymous aggregate counters (growth-metrics.js). Only the event name and a fixed detail are sent.
  const growth = (event,extra={}) => { try { window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event,context:'workspace',...extra}})); } catch { /* Measurement never blocks the worksheet. */ } };
  const opts = (items,value) => items.map(item => {const a=Array.isArray(item)?item:[item,item];return '<option value="'+esc(a[0])+'"'+(String(a[0])===String(value)?' selected':'')+'>'+esc(a[1])+'</option>';}).join('');
  const button = (action,title,kind='secondary') => '<button type="button" class="button '+kind+' small" data-action="'+action+'">'+title+'</button>';
  const field = (name,title,value,type='text',attrs='') => '<label class="sheet-field"><span>'+esc(title)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" '+attrs+'></label>';
  const select = (name,title,values,value) => '<label class="sheet-field"><span>'+esc(title)+'</span><select name="'+name+'">'+opts(values,value)+'</select></label>';
  const labels = {balanced:'Balanced',transfer:'More outside courses',speed:'Fastest',cost:'Lowest cost',general:'General education',core:'Business core',major:'Major requirements',electives:'Electives','area-of-study':'Area of study',institutional:'University requirements'};
  let state,catalog,models=[],sources=[],sourceChecked='',pathway,program,plan,match,input,guidance,targetReviewNeeded=false,targetIssues=[],targetUnknowns=[],mapAvailable=false,saveOK=true,imported=[],dialogRow=null,printView=false,restoreFocus=null,restoreFocusContext=null;
  let evidenceProgramKey='',courseCatalog={courses:[]},courseView,progressFilter='all',sectionOpen=new Map(),progressCorrection=null;
  let storageBaseline,externalRefresh=null,externalPending=false;
  let estimateRatesPromise,estimateRatesData=null,costSummaryEpoch=0,savingsTicket=0,dialogSavingsTicket=0,baselineIndexPromise,baselineIndex=null;
  // The degree's own unit (competency units for WGU), so headers, progress and lists never mix units and credits.
  const unitWord=count=>Sheet.creditUnit(program?.creditSystem,count);
  const pendingDiscoveries=new Map();
  let courseUpdateReview=null;
  function attachPrivateCurricula(value) {
    catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,value);
    if(window.AuditCurriculum)catalog=AuditCurriculum.attach(catalog,value);
    const all=new Map(models.map(model=>[model.id,model]));
    [...DegreeProgramCatalog.sourceModels(value),...(window.AuditCurriculum?AuditCurriculum.models(value):[])].forEach(model=>all.set(model.id,model));models=[...all.values()];
  }
  function auditURL(route=pathway) {const current=route?.id===pathway?.id?program:null;return AuditCurriculum.launchURL({school:route?.school||state.profile.school,degree:route?.title||state.profile.degree,programId:route?.id||state.selectedPathwayId,level:route?.level,modality:route?.modalities?.length===1?route.modalities[0]:'',creditSystem:route?.creditSystem||current?.creditSystem,sourceUrl:route?.url||route?.sources?.find(source=>safeURL(source.url))?.url,catalog:route?.catalog||current?.catalog});}
  function discoveryReason(result) {return result?.reason||result?.reasons?.[0]?.message||'The official requirements need a degree audit before a plan can be built.';}
  async function ensureRouteModels(routes) {
    const targets=(Array.isArray(routes)?routes:[routes]).filter(Boolean).flatMap(route=>[route,...DegreeProgramCatalog.variants(route,catalog)]).filter(route=>route.modelId&&!models.some(model=>model.id===route.modelId));
    if(!targets.length||!DegreeProgramCatalog.modelsForRoutes)return;
    const loaded=await DegreeProgramCatalog.modelsForRoutes(targets,{includeLegacy:false}),all=new Map(models.map(model=>[model.id,model]));
    loaded.forEach(model=>all.set(model.id,model));models=[...all.values()];
  }
  function rememberPending(previous,route) {const pending=pendingDiscoveries.get(route.id);return pending?DegreeProgramCatalog.rememberDiscovery(previous,pending):previous;}
  function reportYear() {const saved=Sheet.catalogYear(settings().reportCatalogYear),known=Sheet.programCatalog(program),year=new Date().getFullYear()-(new Date().getMonth()<7?1:0);return /^\d{6}$/.test(known)&&!/^\d{6}$/.test(saved)?known:saved||known||year+'-'+(year+1);}
  function evidenceTarget(row) {return {kind:'course',programId:program.id,requirementId:row.requirementId,courseId:row.option.id,catalogYear:reportYear()};}
  function courseOutcomeButton(row,label) {
    if(!window.DegreeEvidence||!program||row.option?.provider==='University'||!reqFor(row).options.some(o=>o.id===row.option?.id))return '';
    const target=evidenceTarget(row),summary=DegreeEvidence.getSummary(target);
    if(!label&&!summary?.reportCount)return '';
    return '<button type="button" class="sheet-outcome-button" data-outcome-row="'+esc(row.requirementId)+'" aria-label="View school outcomes for '+esc(row.option.title)+'">'+(summary?.reportCount?DegreeEvidence.badgeHTML(summary):esc(label||'Student outcomes'))+'</button>';
  }
  function loadOutcomes(refresh=false) {
    if(!program||!window.DegreeEvidence)return;const key=program.id+'|'+reportYear();if(!refresh&&key===evidenceProgramKey)return;evidenceProgramKey=key;
    DegreeEvidence.loadProgram(program.id,reportYear(),refresh).then(()=>{if(program&&program.id+'|'+reportYear()===key)renderGrid();}).catch(()=>{if(evidenceProgramKey===key)evidenceProgramKey='';});
  }
  function read(key) {try{return localStorage.getItem(key);}catch{return null;}}
  function savedRaw(){try{return localStorage.getItem(KEY);}catch{throw Error('Device storage is unavailable. Your saved courses have not been replaced.');}}
  function storedPlan(){
    const raw=savedRaw();
    if(raw===null){if(storageBaseline!==null&&storageBaseline!==undefined)throw Error('Your saved draft was removed in another window. This page has not restored or replaced it.');return{raw,state};}
    let saved;try{saved=JSON.parse(raw);}catch{throw Error('Your saved plan could not be read. It has not been replaced. Keep a private backup before restoring your data.');}
    if(saved?.version!==3||!saved.profile||typeof saved.profile!=='object'||Array.isArray(saved.profile)||!Array.isArray(saved.learning))throw Error('Your saved plan needs recovery. It has not been replaced.');
    attachPrivateCurricula(saved);return{raw,state:Journey.initialize(saved,null,catalog)};
  }
  function externalNotice(message){
    externalPending=true;const node=$('sheet-error');node.hidden=false;node.innerHTML='<p>'+esc(message)+'</p><button type="button" class="button secondary" data-action="refresh-saved">Refresh saved plan</button>';
    if($('sheet-dialog').open){let warning=$('sheet-dialog-update');if(!warning){warning=document.createElement('p');warning.id='sheet-dialog-update';warning.setAttribute('role','alert');$('sheet-dialog-content').prepend(warning);}warning.textContent=message+' Your unsaved text remains in this dialog. Close it to refresh the saved plan.';}
  }
  function changedDraft(){const error=Error('Your saved plan changed in another window. The latest work is safe. Refresh the plan, then repeat your change.');error.code='draft_changed';return error;}
  function assertCurrentDraft(expected=storageBaseline){
    try{if(savedRaw()===expected)return;}catch(error){externalNotice(error.message);throw error;}
    const error=changedDraft();externalNotice(error.message);void refreshSavedPlan();throw error;
  }
  async function refreshSavedPlan(){
    if(externalRefresh)return externalRefresh;
    externalRefresh=(async()=>{
      try{
        if($('sheet-dialog').open){externalNotice('Your plan changed in another window. Close this dialog when you are ready to refresh.');return false;}
        for(let attempt=0;attempt<2;attempt++){
          const current=storedPlan();if(current.raw===null)throw Error('Your saved draft is no longer available. This page has not restored or replaced it.');
          await ensureRouteModels(catalog.pathways.find(route=>route.id===(current.state.selectedPathwayId||current.state.profile?.pathwayId)));
          const latest=storedPlan();if(current.raw!==latest.raw)continue;
          if($('sheet-dialog').open){externalNotice('Your plan changed in another window. Close this dialog when you are ready to refresh.');return false;}
          state=latest.state;storageBaseline=latest.raw;externalPending=false;$('sheet-error').hidden=true;render();announce('Your latest saved courses and plan are now open.');return true;
        }
        throw changedDraft();
      }catch(error){externalNotice(error.message);return false;}
    })();
    try{return await externalRefresh;}finally{externalRefresh=null;}
  }
  function save() {assertCurrentDraft();try{const raw=JSON.stringify(state);localStorage.setItem(KEY,raw);storageBaseline=raw;saveOK=true;}catch{saveOK=false;}const node=$('sheet-save');if(node)node.textContent=saveOK?'Draft updated':'Changes could not be kept · download a copy';document.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:saveOK}}));}
  let noticeTimer;
  function announce(message) {clearTimeout(noticeTimer);$('sheet-status').textContent=message;noticeTimer=setTimeout(()=>{$('sheet-status').textContent='';},6500);}
  function settings() {
    const key=pathway.modelId||pathway.id,s=Sheet.scenario(state,key),raw=models.find(m=>m.id===pathway.modelId);
    if(raw){
      const mapped=[...new Set(raw.requirements.flatMap(r=>r.options.map(o=>o.provider)))].filter(p=>p!=='University');
      const explicitProviders=Array.isArray(state.scenarios?.[key]?.providers);
      const defaults=Array.isArray(raw.defaultProviders)?[...new Set(raw.defaultProviders)].filter(p=>mapped.includes(p)):[...new Set([...s.providers,...mapped])];
      if(!explicitProviders||JSON.stringify(s.mappedProvidersReviewed)!==JSON.stringify(mapped)){
        // Newly researched sources become available in course preferences without
        // changing a student's saved selection, including an empty selection.
        s.providers=explicitProviders?[...s.providers]:defaults;s.mappedProvidersReviewed=mapped;
        state.scenarios={...state.scenarios,[key]:s};
      }
    }
    return s;
  }
  function updateSettings(changes) {const key=pathway.modelId||pathway.id;state.scenarios={...state.scenarios,[key]:{...settings(),...changes}};}
  function obsoleteCourseSelections(value=state,model=program) {
    const selections=value?.scenarios?.[model?.id]?.optionSelections;
    if(!model||!selections||typeof selections!=='object'||Array.isArray(selections))return [];
    const raw=models.find(candidate=>candidate.id===model.id),requirements=new Map();
    // Optional waivers can hide otherwise current requirements and options.
    for(const row of [...model.requirements,...(raw?.requirements||[]),...(raw?.transferWaiverVariant?.requirements||[])]){
      const current=requirements.get(row.id)||{row,optionIds:new Set()};
      row.options.forEach(option=>current.optionIds.add(option.id));requirements.set(row.id,current);
    }
    return Object.entries(selections).flatMap(([requirementId,optionId])=>{
      const requirement=requirements.get(requirementId);
      if(requirement?.optionIds.has(optionId))return [];
      const recorded=value.learning?.find(record=>record.evaluations?.some(evaluation=>evaluation.programId===model.id&&evaluation.requirementId===requirementId)),electives=/^free-electives-(\d+)$/.exec(requirementId);
      return [{requirementId,optionId,kind:requirement?'option':'requirement',label:requirement?.row.title||(recorded?[recorded.code,recorded.title].filter(Boolean).join(' · '):electives?electives[1]+'-credit free electives':'Earlier course choice')}];
    });
  }
  function courseChoiceUpdateNotice() {
    return obsoleteCourseSelections().length?'<div class="sheet-notice warning">Some saved course choices are no longer in this degree’s course list. '+button('update-course-choices','Update course choices','ghost')+'</div>':'';
  }
  function courseChoiceUpdateDialog() {
    const obsolete=obsoleteCourseSelections();
    if(!obsolete.length){courseUpdateReview=null;openDialog('<h2>Your course choices are current.</h2><p>No earlier choices need to be removed from this degree plan.</p>','Current course choices');return;}
    courseUpdateReview={programId:program.id,modelFingerprint:DegreeProgramCatalog.publicationModelFingerprint(program,pathway.level),selections:JSON.stringify(state.scenarios?.[program.id]?.optionSelections||{})};
    const rows=obsolete.map(item=>{
      const current=plan.rows.find(row=>row.requirementId===item.requirementId);
      const proposed=item.kind!=='option'?'':current&&['reported','confirmed'].includes(current.status)?'<p>Your original recorded course stays in this requirement.</p>':current?.option&&!current.selectionRequired&&!current.option.selectionRequired?'<p>Current proposed choice: '+esc(current.option.title)+' · '+esc(current.option.provider==='University'?program.school:current.option.provider)+'.</p>':'<p>Choose a course for this requirement after updating.</p>';
      return '<li><strong>'+esc(item.label)+'</strong><p>'+esc(item.kind==='requirement'?'This requirement is no longer in the current course list.':'Your earlier course option is no longer listed for this requirement.')+'</p>'+proposed+'</li>';
    }).join('');
    openDialog('<h2>Update your course choices.</h2><p>Your degree’s course list has changed. Refresh only the earlier choices listed below; supported choices stay selected.</p><ul>'+rows+'</ul><p>Your completed courses, grades, school evaluations and notes stay the same. Your earlier choices will be kept in Saved versions.</p><form id="sheet-course-update-form"><div class="sheet-actions"><button type="submit" class="button primary">Update course choices</button><button type="button" class="button secondary" data-action="keep-course-choices">Keep my earlier choices</button></div><p role="alert"></p></form><details class="sheet-detail"><summary>Keep a private backup or manage saved versions</summary><p>'+button('backup','Download private backup','ghost')+' <a href="compare-plans.html">Manage Saved versions</a></p></details>','Update course choices');
  }
  function archiveCourseChoices(modelFingerprint=DegreeProgramCatalog.publicationModelFingerprint(program,pathway.level)) {
    const snapshots=state.whatIf?.snapshots;
    if(snapshots!==undefined&&!Array.isArray(snapshots))throw Error('Your saved versions could not be read. Download a private backup before changing these choices.');
    const id='course-update:'+DegreeProgramCatalog.publicationFingerprint({pathwayId:pathway.id,modelFingerprint,targetIdentity:DegreeProgramCatalog.targetIdentity(state,{pathway,program}),priority:state.profile?.priority,settings:state.scenarios?.[program.id]||{},savings:state.savings?.[program.id]||{}});
    if((snapshots||[]).length>=20&&!(snapshots||[]).some(snapshot=>snapshot.id===id))throw Error('Your saved versions are full. Remove an older version in Compare plans, then try again. Your current choices are unchanged.');
    return DegreePlanComparison.saveScenario(state,{state,pathway,program,plan,match,input,guidance},'Before course update · '+pathway.title,id);
  }
  function saveCourseChoiceUpdate(next) {
    const previous=state,candidate=Journey.buildDraft(next,catalog,models);
    if(!candidate.plan||candidate.program?.id!==program.id||candidate.pathway?.id!==pathway.id)throw Error('The updated course list could not be opened for this exact degree. Your earlier choices are unchanged.');
    state=candidate.state;
    try {save();if(!saveOK)throw Error('This update could not be saved. Your earlier course choices and records are unchanged.');}
    catch(error){state=previous;generate();error.code=error.code||'course_update_failed';throw error;}
    render({persist:false});
  }
  function applyCourseChoiceUpdate() {
    const pending=courseUpdateReview;
    if(!pending||pending.programId!==program?.id||pending.modelFingerprint!==DegreeProgramCatalog.publicationModelFingerprint(program,pathway.level)||pending.selections!==JSON.stringify(state.scenarios?.[program.id]?.optionSelections||{}))throw Error('This plan changed. Reopen Update course choices to review it again.');
    assertCurrentDraft();
    const obsolete=obsoleteCourseSelections();if(!obsolete.length)throw Error('These choices are already current. Reopen the plan to review it.');
    const next=archiveCourseChoices(pending.modelFingerprint);
    const obsoleteIds=new Set(obsolete.map(item=>item.requirementId)),scenario=next.scenarios?.[program.id]||{};
    next.scenarios={...next.scenarios,[program.id]:{...scenario,optionSelections:Object.fromEntries(Object.entries(scenario.optionSelections||{}).filter(([key])=>!obsoleteIds.has(key)))}};
    next.journey={...next.journey,planReviewed:false,schoolContacted:false};
    saveCourseChoiceUpdate(next);courseUpdateReview=null;closeDialog(true);announce('Course choices updated. Your earlier choices are in Saved versions; your course records and notes are unchanged.');
  }
  function generate() {
    state=DegreeProgramCatalog.resolveTarget(state,catalog).state;
    const draft=Journey.buildDraft(state,catalog,models);
    ({state,pathway,program,plan,match,input,guidance}=draft);targetReviewNeeded=draft.targetReviewNeeded===true;targetIssues=draft.targetIssues||[];targetUnknowns=draft.targetUnknowns||[];mapAvailable=draft.mapAvailable===true;
  }
  function personalEstimateSettings(current) {
    return {...current.state?.scenarios?.[current.program?.id],...current.state?.savings?.[current.program?.id]};
  }
  function currentEstimate(current,node) {
    return program===current.program&&plan===current.plan&&node?.isConnected!==false;
  }
  function researchedEstimate(current) {
    if(!window.DegreePlanEstimate||!window.DegreePlanEstimateView||!current.program||!current.plan)return Promise.resolve(null);
    if(!estimateRatesPromise)estimateRatesPromise=fetch('data/plan-estimate-rates.json').then(response=>{if(!response.ok)throw Error('Estimate rates unavailable');return response.json().then(data=>{estimateRatesData=data;const slot=document.getElementById('sheet-route-difference');if(slot)slot.innerHTML=startingRouteNoteHTML();return data;});}).catch(error=>{estimateRatesPromise=null;throw error;});
    return estimateRatesPromise.then(rates=>window.DegreePlanEstimate.calculate({program:current.program,plan:current.plan,rates})).catch(()=>null);
  }
  // The published starting route for this exact degree, used only to explain why this
  // worksheet's outside credits differ from it. It never changes the student's choices.
  // Plans that still need school confirmation keep their open questions on the
  // worksheet, as in the plan finder. The index is optional: when it cannot load
  // the worksheet works as before and shows nothing new.
  // Requirements whose course changed on the last preferences update; shown until the next update or reload (never saved).
  let replacedRows=new Set();
  let planIndex=null,planIndexPromise=null;const schoolCheckHiddenKey='degreepath-school-check-hidden';let schoolCheckHiddenMemory=[];
  function loadPlanIndex() {
    if(typeof fetch!=='function')return Promise.resolve(null);
    if(!planIndexPromise)planIndexPromise=Promise.resolve().then(()=>fetch('data/plan-library-index.json')).then(response=>{if(!response.ok)throw Error('Plan index unavailable');return response.json();}).then(data=>{planIndex=data&&typeof data==='object'&&!Array.isArray(data)?data:null;renderSchoolCheck();return planIndex;}).catch(()=>{planIndexPromise=null;return null;});
    return planIndexPromise;
  }
  function schoolCheckHidden() {
    try{const value=JSON.parse(sessionStorage.getItem(schoolCheckHiddenKey)||'[]');if(Array.isArray(value))return value.filter(id=>typeof id==='string').slice(-50);}catch{/* Session storage is optional. */}
    return schoolCheckHiddenMemory;
  }
  function setSchoolCheckHidden(routeId,hidden) {
    const next=[...schoolCheckHidden().filter(id=>id!==routeId),...(hidden?[routeId]:[])];schoolCheckHiddenMemory=next;
    try{sessionStorage.setItem(schoolCheckHiddenKey,JSON.stringify(next));}catch{/* The choice still holds for this page. */}
  }
  // The student's own email to the school, built from this plan's open questions (see DegreeSheet.schoolEmail).
  function studentSchoolEmail() {
    const courses=[...new Set((plan?.rows||[]).map(row=>row.option).filter(option=>option&&option.provider&&option.provider!=='University').map(option=>option.provider+' '+option.title))];
    const format=(pathway?.modalities||[]).length===1?(pathway.modalities[0]==='campus'?'on campus':'online'):'';
    return Sheet.schoolEmail(planIndex,pathway?.id,{title:pathway?.title,school:pathway?.school,modalities:pathway?.modalities,format,courses});
  }
  // Where the email goes, named with the school page the address came from; a school with no published address gets its contact page.
  function schoolEmailHint(email) {
    const c=email.contact;
    if(c&&c.email)return 'A short email in your words, addressed to '+esc(c.office)+' ('+esc(c.email)+', <a href="'+esc(c.source)+'" target="_blank" rel="noopener">published by the school</a>).';
    if(c&&c.contactPage)return 'This school doesn’t publish a transfer email. Copy the email and send it through <a href="'+esc(c.contactPage)+'" target="_blank" rel="noopener">its contact form</a>.';
    return 'A short email in your words, ready to send to the school’s admissions or transfer-credit office.';
  }
  function schoolEmailActionsHTML() {
    const email=studentSchoolEmail();if(!email)return '';
    return '<div class="sheet-school-email"><a class="button small" href="'+esc(email.mailto)+'" data-school-email="open">Email the school these questions</a><button type="button" class="button ghost small" data-action="copy-school-email">Copy the email</button><p class="sheet-school-email-hint">'+schoolEmailHint(email)+'</p></div>';
  }
  function schoolCheckHTML() {
    const routeId=pathway?.id,questions=Sheet.schoolQuestions(planIndex,routeId);if(!questions.length)return '';
    if(schoolCheckHidden().includes(routeId))return '<section class="sheet-school-check is-collapsed" aria-label="Needs school confirmation"><p><strong>'+questions.length+' question'+(questions.length===1?'':'s')+' to ask the school</strong> before you pay for courses.</p><button type="button" class="button ghost small" data-action="show-school-check" aria-expanded="false" aria-controls="sheet-school-check">Show questions</button></section>';
    return '<section class="sheet-school-check" aria-labelledby="sheet-school-check-title"><div class="sheet-school-check-head"><h2 id="sheet-school-check-title">Before you pay for courses, ask the school:</h2><button type="button" class="button ghost small" data-action="hide-school-check" aria-expanded="true" aria-controls="sheet-school-check">Hide</button></div><ul>'+questions.map(question=>'<li>'+esc(question)+'</li>').join('')+'</ul><p>This course plan is complete, but these points are not yet confirmed in the school’s published rules.</p>'+schoolEmailActionsHTML()+leadActionsHTML()+'</section>';
  }
  // Optional extra actions from leads.js (school contact request, Plan review link). Empty unless a feature is on;
  // they never change the plan, its courses or their order.
  // They sit inside the school questions, next to "Email the school these questions", or on their own when the plan has none.
  function leadActionsHTML() {
    return task||!pathway?'':(window.DegreeLeads?.actionsHTML({planId:pathway.id,school:pathway.school,title:pathway.title})||'');
  }
  function renderLeadActions() {
    const node=$('sheet-lead-actions');if(!node)return;
    const html=Sheet.schoolQuestions(planIndex,pathway?.id).length?'':leadActionsHTML();
    if(node.innerHTML!==html)node.innerHTML=html;node.hidden=!html;
  }
  function renderSchoolCheck(focusAction) {
    renderLeadActions();
    const node=$('sheet-school-check');if(!node)return;
    const html=task||!pathway?'':schoolCheckHTML();if(node.innerHTML!==html)node.innerHTML=html;node.hidden=!html;
    if(planIndex)renderGlance();
    if(focusAction)node.querySelector('[data-action="'+focusAction+'"]')?.focus();
  }
  // Phone glance (≤700px only; wider screens never show it): what the plan is, its headline
  // numbers and cost line, a jump to the courses, and one-line disclosures for the secondary
  // panels (credit breakdown and starting-route notes, school questions, estimate details),
  // which stay folded on phones until opened. Folding is presentation only; nothing is saved.
  const phoneFolds=new Set();let glanceCost=null;
  function glanceHTML() {
    if(task||!pathway||!plan||!program)return '';
    const route=window.DegreePlanRoute?.build({state,pathway,program,plan,match,input,guidance},projection());
    if(!route?.available)return '';
    const phase=id=>route.phases.find(item=>item.id===id),number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
    const questions=Sheet.schoolQuestions(planIndex,pathway.id).length,savings=$('sheet-savings'),costShown=Boolean(savings&&!savings.hidden);
    const fold=(group,controls,title,detail)=>'<li data-glance-fold="'+group+'"><button type="button" class="sheet-glance-fold" data-phone-fold="'+group+'" aria-expanded="'+phoneFolds.has(group)+'" aria-controls="'+controls+'"><span><strong>'+title+'</strong><small>'+esc(detail)+'</small></span><i aria-hidden="true"></i></button></li>';
    const draft={state,pathway,program,plan,match,input,guidance},next=simplePlan()&&window.DegreePlanHome?.nextWin(state,draft);
    const unmatched=(match?.unmatched||[]).filter(record=>record.status==='earned').length;
    const notes=[route.needsCourseCredits?'<span>'+esc(number(route.needsCourseCredits)+' '+route.unit+' still need a course')+'</span>':'',unmatched?'<a href="courses.html?tab=mine">'+unmatched+' past course'+(unmatched===1?'':'s')+' not matched</a>':''].filter(Boolean).join('');
    const nextHTML=next?'<a class="sheet-glance-next" href="'+esc(next.href)+'"><span><small>Next step:</small> <strong>'+esc(next.title)+'</strong></span><span class="sheet-glance-next-label">'+esc(next.label)+'</span></a>':'';
    // The fold summaries carry the headline numbers and cost line, so they stay visible while the panels are folded.
    const folds=[fold('progress','sheet-route sheet-summary','Your degree: <span data-glance-total>'+esc(number(phase('degree').value)+' '+route.unit)+'</span>',number(phase('outside').value)+' outside · '+number(phase('university').value)+' university · '+number(phase('completed').value)+' finished'),
      costShown?fold('cost','sheet-savings',glanceCost?esc(glanceCost.label)+' <span data-glance-cost>'+esc(glanceCost.amount)+'</span>':'Cost',glanceCost?.detail||'Estimate details'):'',
      questions?fold('school','sheet-school-check',esc(questions+' question'+(questions===1?'':'s')+' to ask the school'),'Before you pay for outside courses'):''].join('');
    return '<section class="sheet-glance" aria-label="Plan at a glance">'+(notes||!simplePlan()?'<div class="sheet-glance-row">'+(notes?'<p class="sheet-glance-notes">'+notes+'</p>':'')+(simplePlan()?'':jumpLink('sheet-glance-jump'))+'</div>':'')+'<ul class="sheet-glance-folds">'+folds+'</ul>'+nextHTML+'</section>';
  }
  // On the course list the jump sits in the title block (phones only); the worksheet keeps it in the glance.
  function jumpLink(className){return '<a class="'+className+'" href="#sheet-grid" data-jump-courses>Jump to courses <span aria-hidden="true">↓</span></a>';}
  function renderGlance() {
    const node=$('sheet-glance'),workspace=$('sheet-workspace');if(!node||!workspace)return;
    const html=glanceHTML();if(node.innerHTML!==html)node.innerHTML=html;node.hidden=!html;
    workspace.classList.toggle('has-glance',Boolean(html));
    workspace.classList.toggle('glance-has-next',Boolean(html&&node.querySelector('.sheet-glance-next')));
    for(const group of ['progress','school','cost'])workspace.classList.toggle('phone-open-'+group,phoneFolds.has(group));
  }
  function setGlanceCost(value) {
    const next=value&&value.amount?{label:String(value.label||'').trim(),amount:String(value.amount).replace(/\s+/g,' ').trim(),detail:value.detail||'Estimate details'}:null;
    if(JSON.stringify(next)===JSON.stringify(glanceCost))return;glanceCost=next;renderGlance();
  }
  function loadBaselineIndex() {
    if(typeof fetch!=='function')return Promise.resolve(null);
    if(!baselineIndexPromise)baselineIndexPromise=Promise.resolve().then(()=>fetch('data/baseline-index.json')).then(response=>{if(!response.ok)throw Error('Starting routes unavailable');return response.json();}).then(data=>{baselineIndex=data;const slot=document.getElementById('sheet-route-difference');if(slot&&program&&plan)slot.innerHTML=startingRouteNoteHTML();return data;}).catch(()=>{baselineIndexPromise=null;return null;});
    return baselineIndexPromise;
  }
  // Filled in place when the index arrives, so a late load never re-renders the grid or moves focus.
  function startingRouteNote() {
    if(!program||!plan||!pathway)return '';
    if(!baselineIndex)void loadBaselineIndex();
    return '<div id="sheet-route-difference" class="course-plan-route-slot">'+startingRouteNoteHTML()+'</div>';
  }
  const listNames=names=>names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names[names.length-1];
  function startingRouteNoteHTML() {
    if(!baselineIndex||!program||!plan||!pathway)return '';
    const baseline=Object.values(baselineIndex.baselines||{}).find(item=>item.modelId===program.id&&item.pathwayId===pathway.id);
    const result=baseline&&Sheet.routeCreditDifference({baseline,plannedCredits:plan.coverage?.mappedExternalCredits,providers:settings().providers,creditSystem:program.creditSystem});
    // A provider without a reviewed price was left out of the planning estimate, so turning it off can raise the estimate.
    const priced=new Set((estimateRatesData?.providers||[]).map(item=>item?.provider).filter(Boolean)),unpricedOff=result&&estimateRatesData?result.providersOff.filter(provider=>!priced.has(provider)):[];
    const costNote=unpricedOff.length?' The planning estimate may go up: '+listNames(unpricedOff)+' prices were not included in it, so replacing those courses with priced ones adds known cost.':'';
    return result?'<p class="course-plan-route-difference" data-route-difference="'+result.difference+'">'+esc(result.text+costNote)+(result.providersOff.length?' <button type="button" class="course-plan-inline-action" data-action="options">Course preferences</button>':'')+'</p>':'';
  }
  function savingsSlots(node) {
    if(!$('sheet-planning-range')||!$('sheet-savings-tracker'))node.innerHTML='<div id="sheet-planning-range" hidden></div><div id="sheet-savings-tracker"></div>';
    return {range:$('sheet-planning-range'),savings:$('sheet-savings-tracker')};
  }
  function updateSavings() {
    if (!window.DegreeSavingsTracker) return;
    const draft = {state,pathway,program,plan,match,input,guidance};
    const onChange = changes => {
      try {
      if (!program?.id) return;
      state.savings = {...state.savings,[program.id]:{...state.savings?.[program.id],...changes}};
      if (state.journey) {state.journey.planReviewed=false; state.journey.schoolContacted=false;}
      save(); render();
      } catch(error) {announce(error.message);}
    };
    const main = $('sheet-savings'), dialog = $('sheet-dialog-savings');
    const hasTarget = Boolean(!state.sheet?.isExample && (state.selectedPathwayId || state.profile.pathwayId || state.profile.school && state.profile.degree));
    main.hidden=Boolean(task) || !hasTarget || simplePlan()&&!plan;
    // The preferences tray leads with its own choices (and its Apply footer); costs update on the plan after Apply.
    dialog.hidden=!$('sheet-dialog').open || !hasTarget || String($('sheet-dialog-content').innerHTML||'').includes('id="sheet-options-form"');
    if (!main.hidden) {
      // One planning range everywhere: when the shared estimate engine can price this plan at
      // published rates, it is the headline (as on plan pages, the finder and the planner). The
      // older tuition-savings comparison stays below it, labelled as tuition-only.
      const slots=savingsSlots(main),ticket=++savingsTicket,view=window.DegreePlanEstimateView,simple=simplePlan();
      // pending: no shared estimate exists at published rates, so the finder and cards say the cost needs confirmation;
      // the worksheet says the same and keeps the tuition comparison below it, labelled as tuition-only.
      const show=(estimate,pending=false)=>{
        if(ticket!==savingsTicket||!currentEstimate(draft,main))return;
        const shared=Boolean(view?.available(estimate)),confirm=!shared&&pending;
        slots.range.innerHTML=shared?view.render(estimate,{compact:true}):confirm?'<div class="sheet-cost-confirm"><p class="savings-label">Total cost</p><p><strong>Cost needs confirmation</strong></p><p class="savings-simple-basis">No reviewed planning estimate exists for this plan yet. Ask the school for its current tuition and fees.</p></div>':'';
        slots.range.hidden=!shared&&!confirm;main.classList.toggle('has-planning-range',shared||confirm);
        const tracked=window.DegreeSavingsTracker.update(slots.savings,state,draft,{onChange,simple,secondary:shared||confirm});
        // The phone glance repeats the headline cost line exactly as the panel states it.
        if(shared)setGlanceCost({label:'Planning estimate',amount:slots.range.querySelector('.plan-estimate-heading strong')?.textContent,detail:'Before aid · estimate details'});
        else if(confirm)setGlanceCost({label:'Total cost:',amount:'needs confirmation',detail:'Ask the school · estimate details'});
        else void Promise.resolve(tracked).then(()=>{if(ticket!==savingsTicket)return;const amount=slots.savings.querySelector('[data-savings="money"]'),label=amount?.closest('.savings-metric')?.querySelector('.savings-label');setGlanceCost(amount&&label?{label:label.textContent,amount:amount.textContent}:null);},()=>{});
      };
      if(!view||view.hasPersonalAssumptions(personalEstimateSettings(draft)))show(null);else void Promise.all([researchedEstimate(draft),loadPlanIndex()]).then(([estimate,index])=>{const entry=index?.plans?.[pathway?.id];show(estimate,Boolean(entry&&!entry.estimate));},()=>show(null));
    }
    if (!dialog.hidden) {
      // The tray header follows the same rule: the shared range when it exists, never a contradicting 'pending' message.
      const ticket=++dialogSavingsTicket,view=window.DegreePlanEstimateView;
      const show=estimate=>{
        if(ticket!==dialogSavingsTicket||!currentEstimate(draft,dialog)||dialog.hidden)return;
        // Cost & timing already shows the full range in its own summary; do not repeat it above.
        if(view?.available(estimate)){if(String($('sheet-dialog-content').innerHTML||'').includes('id="sheet-cost-summary"')){dialog.hidden=true;dialog.innerHTML='';}else dialog.innerHTML=view.render(estimate,{compact:true});}else window.DegreeSavingsTracker.update(dialog,state,draft,{onChange,compact:true});
      };
      if(!view||view.hasPersonalAssumptions(personalEstimateSettings(draft)))show(null);else void researchedEstimate(draft).then(show,()=>show(null));
    }
  }
  function latestPlanState(){return storedPlan().state;}
  function degreeCandidate(previous,route,formatChoice=false){let candidate=Sheet.selectPathway(previous,route);if(route.customGoal)candidate.profile.degreeLevel='unsure';if(formatChoice&&route.modalities?.length===1){candidate.profile.modality=route.modalities[0];if(candidate.profile.modality==='online'&&candidate.profile.classroomImportance==='essential')candidate.profile.classroomImportance='open';}return Journey.buildDraft(DegreeProgramCatalog.resolveTarget(candidate,catalog).state,catalog,models);}
  let customGoal=null;
  async function choose(id,formatChoice=false,confirmOutline=false){
    const route=typeof id==='object'?id:catalog.pathways.find(p=>p.id===id);if(!route)return false;
    if(DegreeProgramCatalog.variants(route,catalog).length){targetDialog(route.id);return false;}
    const savedBeforeLoad=latestPlanState();await ensureRouteModels([route,catalog.pathways.find(item=>item.id===(savedBeforeLoad.selectedPathwayId||savedBeforeLoad.profile?.pathwayId))]);
    const latest=storedPlan(),previous=latest.state,before=Journey.buildDraft(previous,catalog,models);let candidate=degreeCandidate(rememberPending(previous,route),route,formatChoice);
    const pending=pendingDiscoveries.get(candidate.pathway.id);if(pending)candidate=degreeCandidate(DegreeProgramCatalog.rememberDiscovery(previous,pending),candidate.pathway,formatChoice);
    const changed=before.pathway.id!==candidate.pathway.id||before.pathway.school!==candidate.pathway.school||before.pathway.title!==candidate.pathway.title;
    if(changed&&!previous.sheet?.isExample&&(previous.whatIf?.snapshots||[]).length>=20&&!(previous.whatIf.snapshots||[]).some(row=>row.id===DegreeProgramCatalog.planHistoryId(previous,before)))throw Error('Your saved versions are full. Download a private backup or remove an old version in Compare plans before changing degrees.');
    if(candidate.mapAvailable&&!candidate.plan){openDialog('<h2>Review this degree before switching</h2><p>'+esc(candidate.targetIssues.map(targetIssueText).join(' ')||'Some program details still need confirmation.')+'</p><p>Your current plan and courses are unchanged.</p><div class="sheet-actions"><button type="button" class="button primary" id="close-sheet-dialog-review">Keep my current plan</button><a class="button ghost" href="portal.html?view=edit">Review my preferences</a></div>','Review degree preferences');return false;}
    if(!candidate.plan&&before.plan&&changed&&!confirmOutline){outlineDialog(route);return false;}
    const remembered=changed&&!previous.sheet?.isExample?DegreeProgramCatalog.rememberPlan(previous,before):previous;
    state=candidate.state;storageBaseline=latest.raw;state.whatIf=remembered.whatIf||state.whatIf;state.sheet.search='';state.sheet.filter='all';progressFilter='all';render();announce(candidate.plan?'Course plan opened. Your courses and notes are preserved.':'Goal saved. Add the degree requirements to build your plan.');return true;
  }
  function outlineDialog(route){const source=route.sources?.find(source=>safeURL(source.url)&&!/^https:\/\/(?:degreeforum|www.degreeforum|reddit)/.test(source.url));customGoal=catalog.pathways.some(item=>item.id===route.id)?null:route;openDialog('<h2>'+esc(route.title)+'</h2><p>'+esc(route.school)+'</p><p><strong>A course-by-course plan is not available for this degree yet.</strong></p><p>Save this as your active goal and keep your working plan as a previous version. Your courses, choices and private notes stay saved.</p>'+(source?'<p>'+link(source.url,'View official requirements')+'</p>':'')+'<div class="sheet-actions"><button type="button" class="button primary" id="close-sheet-dialog-review">Keep my current plan</button><button type="button" class="button ghost" data-confirm-outline="'+esc(route.id)+'">Save this goal instead</button></div>','Review an unmapped degree');}
  function review(row) {return row.status!=='confirmed'&&(row.status==='reported'||row.option?.evidence==='conditional'||row.selectionRequired||!row.option||row.placementReason==='excluded-source');}
  function gap(row) {return !row.option||needsCourseChoice(row)||row.placementReason==='excluded-source'||(row.option.provider!=='University'&&row.placementReason==='conditional-gap');}
  function reqFor(row) {return program.requirements.find(r=>r.id===row.requirementId);}
  function progressRecord(row) {
    const option=row?.option;if(!option)return null;
    const matched=match?.completed?.find(item=>item.requirementId===row.requirementId&&item.learningId),placed=matched&&state.learning.find(record=>record.id===matched.learningId);
    if(placed)return placed;
    const normalize=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,''),provider=value=>({sophialearning:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[normalize(value)]||normalize(value));
    const codes=[option.id,option.code,...(option.codeAliases||[])].map(normalize).filter(Boolean);
    const placedRecords=state.learning.filter(x=>x.evaluations?.some(e=>e.programId===program.id&&e.requirementId===row.requirementId));
    if(placedRecords.length)return placedRecords.length===1?placedRecords[0]:null;
    const records=state.learning.filter(x=>{const identity=Guide.resolveRecordIdentity?.(program,x)||x;return provider(x.provider)===provider(option.provider)&&(identity.code?codes.includes(normalize(identity.code)):normalize(identity.title)===normalize(option.title))&&(provider(x.provider)!=='university'||normalize(x.institution)===normalize(program.school)&&x.sourceProgramId===program.id);});
    return records.length===1?records[0]:null;
  }
  function courseProgressControl(row,title) {
    const done=['reported','confirmed'].includes(row.status),record=progressRecord(row);
    if(done&&!record)return '<a href="courses.html?tab=mine">Edit my course record</a>';
    return '<select data-progress="'+esc(row.requirementId)+'" aria-label="Progress for '+esc(title)+'">'+opts([['planned','Not started'],['in-progress','In progress'],['completed',row.status==='confirmed'?'Finished · school confirmed':'Finished']],done?'completed':record?.status==='in-progress'?'in-progress':'planned')+'</select>';
  }
  function applyProgressCorrection(row,record,progress,options={}) {
    const affected=plan.rows.filter(candidate=>progressRecord(candidate)?.id===record.id),selections=Sheet.scenario(state,program.id).optionSelections||{};
    let next=Sheet.correctProgress(state,record.id,progress,options);
    // Retain the same reviewed future course when completion no longer fixes
    // its placement. Explicit choices and automatic credit-balancing rows win.
    for(const candidate of affected){
      if(Object.prototype.hasOwnProperty.call(selections,candidate.requirementId)||balanceEntry(candidate)?.creditBalanceDerived)continue;
      const canonical=reqFor(candidate)?.options.find(option=>option.id===candidate.option?.id&&option.provider===candidate.option?.provider&&option.code===candidate.option?.code);
      if(canonical&&Planner.availableOptions(program,candidate.requirementId,input).some(option=>option.id===canonical.id))next=Sheet.setCourse(next,program.id,candidate.requirementId,canonical.id);
    }
    state=next;state.sheet.isExample=false;state.sheet.filter='all';progressFilter='all';
  }
  function progressCorrectionDialog(row,record,progress) {
    progressCorrection={requirementId:row.requirementId,recordId:record.id,progress,snapshot:JSON.stringify(record),returnToCourse:$('sheet-dialog').open};
    const label=progress==='planned'?'Not started':'In progress';
    openDialog('<h2>Change this course to '+label+'?</h2><p>'+esc(record.title)+' has school-confirmed credit in your plans.</p><p>The course stays in My courses. Correcting its completion clears its completion date and all saved degree-credit placements for this course, including any shared exam requirements. Your university’s records are not changed.</p><form id="sheet-progress-correction-form"><label class="sheet-checklist"><span><input name="confirm" type="checkbox" required> I am correcting this course’s completion and its school-confirmed placements.</span></label><div class="sheet-actions"><button type="submit" class="button primary">Update progress</button><button type="button" class="button secondary" data-cancel-progress-correction>Keep current progress</button></div><p role="alert"></p></form>','Correct course progress');
  }
  function progressLabel(row) {return row.status==='confirmed'?'School confirmed':row.status==='reported'?'Completed · pending review':progressRecord(row)?.status==='in-progress'?'In progress':'Not started';}
  function restoreWorksheetFocus(focusId,focusKind,focusRow) {
    if($('sheet-dialog').open)return;
    if(focusKind)document.querySelector('[data-'+focusKind+'="'+CSS.escape(focusRow)+'"]')?.focus({preventScroll:true});
    else if(focusId)$(focusId)?.focus({preventScroll:true});
  }
  // Email plan alerts (plan-alerts.js): an unticked opt-in for a plan saved to the student's account, shown only when
  // the site enables alerts and the plan is in the public plan library. It never changes the plan or the device draft.
  function renderAlerts() {
    if(task||!window.DegreePlanAlerts)return;
    let node=$('sheet-alerts');if(!node&&$('sheet-footer')){node=document.createElement('div');node.id='sheet-alerts';node.hidden=true;$('sheet-footer').after(node);}
    const id=pathway?.id;if(!node||!id||state?.sheet?.isExample){if(node){node.hidden=true;node.innerHTML='';}return;}
    void loadPlanIndex().then(()=>{if(pathway?.id===id)void window.DegreePlanAlerts.mountOptIn(node,{planId:id,inLibrary:Boolean(planIndex?.plans?.[id])});},()=>{});
  }
  // Weekly source freshness (data/plan-freshness.json, scripts/pathway-factory/freshness.mjs): a neutral note while a
  // page this plan's research cites has changed and is being rechecked. Optional: a missing or empty file shows nothing.
  let planFreshness=null,planFreshnessPromise=null;
  function loadPlanFreshness() {
    if(typeof fetch!=='function')return Promise.resolve(null);
    if(!planFreshnessPromise)planFreshnessPromise=Promise.resolve().then(()=>fetch('data/plan-freshness.json')).then(response=>response.ok?response.json():null).then(data=>{planFreshness=data?.plans&&typeof data.plans==='object'&&!Array.isArray(data.plans)?data.plans:{};renderFreshness();return planFreshness;}).catch(()=>{planFreshness={};return planFreshness;});
    return planFreshnessPromise;
  }
  function renderFreshness() {
    const entry=task?null:planFreshness?.[pathway?.id],show=entry?.status==='rechecking'&&/^\d{4}-\d{2}-\d{2}$/.test(entry.since||'');
    let node=$('sheet-freshness');
    if(!node){if(!show||!$('sheet-school-check'))return;node=document.createElement('p');node.id='sheet-freshness';node.className='sheet-freshness';node.setAttribute('role','note');$('sheet-school-check').before(node);}
    const text=show?'Rechecking: the school updated a source page on '+new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(entry.since+'T00:00:00Z'))+'.':'';
    if(node.textContent!==text)node.textContent=text;node.hidden=!show;
  }
  function render({persist=true}={}) {
    assertCurrentDraft();
    const active=document.activeElement,focusId=active?.id,focusRow=active?.dataset?.provider||active?.dataset?.course||active?.dataset?.progress,focusKind=active?.dataset?.provider?'provider':active?.dataset?.course?'course':active?.dataset?.progress?'progress':'';
    generate();if(persist)save();$('sheet-workspace').hidden=Boolean(task);$('sheet-loading').hidden=true;document.body.classList.toggle('course-plan-page',simplePlan());
    renderSchoolCheck();
    renderFreshness();void loadPlanFreshness();
    updateSavings();
    renderGlance();
    renderAlerts();
    if(simplePlan()){renderCoursePlan();renderChecklist();restoreWorksheetFocus(focusId,focusKind,focusRow);focusHeadingOnce();if(!task)loadOutcomes();return;}
    if($('sheet-route'))$('sheet-route').innerHTML='';
    if($('sheet-next'))$('sheet-next').innerHTML='';
    renderChecklist();
    if(window.DegreeMomentum&&$('sheet-momentum'))DegreeMomentum.update($('sheet-momentum'),state,{state,pathway,program,plan,match,input,guidance},{compact:true,onChange:momentum=>{try{state.momentum=momentum;save();}catch(error){announce(error.message);}}});
    $('sheet-titlebar').innerHTML='<div><h1 class="sheet-title">My plan</h1><p class="sheet-subtitle">'+esc(pathway.title)+' · '+esc(pathway.school)+'</p><span class="sheet-meta" id="sheet-save">'+(saveOK?'Draft updated':'Changes could not be kept · download a copy')+'</span></div><div class="sheet-actions">'+'<a class="button ghost small" href="courses.html">My courses'+(state.learning.length?' ('+state.learning.length+')':'')+'</a>'+button('compare-plans','Compare plans','secondary')+button('more','Plan tools','secondary')+'</div>';
    $('sheet-controls').innerHTML='<div class="sheet-mobile-target">'+button('target','Change degree','ghost')+'</div><details class="sheet-priority-settings"><summary>Priority: '+esc(labels[state.profile.priority]||'Balanced')+'</summary><div class="sheet-priority" role="group" aria-label="Optimize my plan">'+['balanced','transfer','speed','cost'].map(p=>'<button type="button" class="sheet-pill'+(state.profile.priority===p?' active':'')+'" data-priority="'+p+'" aria-pressed="'+(state.profile.priority===p)+'">'+labels[p]+'</button>').join('')+'</div></details>';
    $('sheet-summary').innerHTML=plan?degreeProgressHTML()+'<div class="sheet-stats"><span class="sheet-stat"><strong>'+plan.totals.required+'</strong><span>degree '+esc(unitWord(plan.totals.required))+'</span></span><span class="sheet-stat"><strong>'+(plan.totals.reported+plan.totals.confirmed)+'</strong><span>completed <small>('+plan.totals.confirmed+' school confirmed)</small></span></span><span class="sheet-stat"><strong>'+plan.coverage.mappedExternalCredits+'</strong><span>planned transfer '+esc(unitWord(plan.coverage.mappedExternalCredits))+'</span></span><span class="sheet-stat"><strong>'+projection().totals.unmapped+'</strong><span>credits need a course</span></span></div>':'<div class="sheet-stats sheet-outline-stats"><span class="sheet-stat"><strong>'+(targetReviewNeeded?'Goal review needed':'Planning outline')+'</strong><span>'+(targetReviewNeeded?'Check career and study preferences':'Course-level audit still needed')+'</span></span><span class="sheet-stat"><strong>'+state.learning.length+'</strong><span>saved learning records</span></span></div>';
    const conflicts=plan&&(!plan.validation.academicCountsValid||plan.setupIssues?.some(i=>['invalid_selection','selection_conflict'].includes(i.code)));
    $('sheet-review-note').innerHTML=courseChoiceUpdateNotice()||(state.sheet.isExample?'<div class="sheet-notice"><p><strong>Example plan.</strong> Choose a degree, or '+button('use-example','Use this degree','ghost')+'. Edit the blue cells.</p></div>':conflicts?'<div class="sheet-notice warning"><p><strong>Some choices conflict.</strong> '+button('checks','Review the affected requirements','ghost')+'</p></div>':plan?'<div class="sheet-notice sheet-review-status"><span><strong>Draft plan</strong><span class="sheet-review-explainer"> · '+(projection().totals.unmapped?projection().totals.unmapped+' credits still need a course':'Course list selected')+'</span></span><a href="portal.html?view=school">Transfer questions</a></div>':'<div class="sheet-notice warning"><p>'+(targetReviewNeeded?'This target needs review against your preferences.':'Exact course placements are still being mapped.')+' Your courses stay saved.</p></div>');
    $('sheet-review-note').insertAdjacentHTML('beforeend',formatReviewNote());
    $('sheet-toolbar').innerHTML='<div class="sheet-filter"><label><span class="screen-reader-only">Search requirements or courses</span><input id="sheet-search" type="search" placeholder="Find a course" value="'+esc(state.sheet.search)+'"></label><label><span class="screen-reader-only">Show rows</span><select id="sheet-filter">'+opts([['all','All rows'],['remaining','Not yet completed'],['outside','Outside courses'],['review','Needs review'],['completed','Completed']],state.sheet.filter)+'</select></label></div><div class="sheet-actions">'+button('options','Plan settings','ghost')+'</div>';
    renderGrid();
    $('sheet-footer').innerHTML='<p>'+(plan?'<strong>'+plan.totals.accounted+' / '+plan.totals.required+' unique '+(program.creditSystem==='competency-unit'?'competency units':'credits')+'</strong> · '+(plan.validation.academicCountsValid?'Requirement counts fit':'Requirement counts need review')+(plan.coverage.conditionalExternalCredits?'<span class="sheet-footer-caveat"> · '+plan.coverage.conditionalExternalCredits+' outside credits include transfer conditions.</span>':''):'No course totals calculated for this outline.')+'</p><p>'+button('cost-time',plan?.costs.total!=null?money(plan.costs.total)+(plan?.timing.scenarioWeeks!=null?' · '+plan.timing.scenarioWeeks+' estimated weeks':' · Cost & timing'):'See cost & timing','ghost')+'</p>';
    $('sheet-context').innerHTML='<details><summary>School policies, sources & community</summary><div class="sheet-detail"><p>'+esc(pathway.summary||'Keep the exact school, program and catalog together.')+'</p><p>'+((pathway.sources||program?.sources||[]).slice(0,4).map(s=>link(s.url,s.title)).join(' · '))+'</p>'+button('discussion','Open degree discussion','ghost')+' <a href="library.html">Browse policies</a></div></details>';
    restoreWorksheetFocus(focusId,focusKind,focusRow);focusHeadingOnce();
    if(!task)loadOutcomes();
  }
  // When the worksheet first renders, keyboard and screen-reader users start at its main heading rather than the page
  // top. Only when nothing else has focus, and only once, so later re-renders never move focus.
  let headingFocused=false;
  function focusHeadingOnce(){
    if(headingFocused||task)return;headingFocused=true;
    const active=document.activeElement;if(active&&active!==document.body&&active!==document.documentElement)return;
    const heading=document.querySelector('#sheet-titlebar h1');if(!heading)return;heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
  }
  const simplePlan = () => !task && query.get('editor') !== '1';
  function renderChecklist() {
    const node=$('sheet-home');if(!node)return;
    const panel=$('sheet-task-panel');if(panel){panel.hidden=Boolean(task)||!window.DegreeChecklistView;if(!simplePlan())panel.open=true;}
    node.hidden=Boolean(task);if(task||!window.DegreeChecklistView)return;
    DegreeChecklistView.update(node,state,{state,pathway,program,plan,match,input,guidance,targetReviewNeeded,targetIssues,targetUnknowns,mapAvailable},{onAction:async action=>{
      // Read again after loading a route so another tab's latest records and
      // tasks survive. The opaque context rejects changes to a stale plan.
      let currentRaw;const current=()=>{let raw;try{raw=localStorage.getItem(KEY);}catch{throw Error('Device storage is unavailable. Your checklist has not been changed.');}let value;try{value=JSON.parse(raw);}catch{throw Error('Your saved plan could not be read. Your checklist has not been changed.');}if(value?.version!==3||!value.profile||!Array.isArray(value.learning))throw Error('Your saved plan needs recovery. Your checklist has not been changed.');attachPrivateCurricula(value);currentRaw=raw;return Journey.initialize(value,null,catalog);};
      const before=current();await ensureRouteModels(catalog.pathways.find(route=>route.id===(before.selectedPathwayId||before.profile.pathwayId)));
      const fresh=current(),draft=Journey.buildDraft(DegreeProgramCatalog.resolveTarget(fresh,catalog).state,catalog,models);
      const next=DegreeChecklist.apply(draft.state,draft,action);
      const firstCompletion=action.type==='set-task'&&action.status==='done'&&draft.state.journey?.activationTaskCompleted!==true&&DegreeChecklist.build(draft.state,draft).tasks.some(item=>item.id===action.taskId&&item.canSetStatus===true&&item.status!=='done');
      if(firstCompletion)next.journey={...next.journey,activationTaskCompleted:true};
      const raw=JSON.stringify(next);assertCurrentDraft(currentRaw);try{localStorage.setItem(KEY,raw);storageBaseline=raw;}catch{throw Error('Your checklist could not be saved on this device. Your previous plan is unchanged.');}
      if(firstCompletion)window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event:'first_task_completed',context:'workspace'}}));
      state=next;render();return true;
    }});
  }
  function projection() {return window.DegreeCoursePlanView.build({state,pathway,program,plan,match,input,guidance},courseCatalog);}
  function visiblePlanRows() {return window.DegreeCoursePlanView.visibleRows({program,plan});}
  function balanceEntry(row) {return Object.values(courseView?.groups||projection().groups).flat().find(entry=>entry.requirementIds.includes(row.requirementId));}
  function creditBalanceNote(row) {
    const entry=balanceEntry(row);
    if(entry?.creditBalanceDerived)return '<p class="course-info-meta">This course adds '+entry.credits+(entry.credits===1?' credit':' credits')+' needed to reach the 120-credit degree minimum.</p>';
    return entry?.nativeRequirementCredits>entry.credits?'<p class="course-info-meta">This course fills '+esc(row.code)+' and adds '+entry.credits+' degree credits. The GCU course is '+entry.nativeRequirementCredits+' credits; your plan includes the extra coursework needed to reach 120.</p>':'';
  }
  function matchesProgress(entry){return progressFilter==='all'||entry.progressState===progressFilter||progressFilter==='not-started'&&entry.progressState==='needs-course';}
  function degreeProgressHTML(){
    if(!plan||!program||!plan.validation.academicCountsValid)return '';
    const progress=projection().progress;if(!progress?.valid||!progress.totalCredits)return '';
    const credits=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
    const choice=(value,label,amount,color)=>`<button type="button" class="progress-color-${color}" data-progress-filter="${value}" aria-pressed="${progressFilter===value}" aria-label="Show ${label.toLowerCase()} courses"><i aria-hidden="true"></i><strong ${value==='in-progress'?'data-degree-active':value==='not-started'?'data-degree-remaining':''}>${credits(amount)}</strong> ${label}</button>`;
    return `<section class="degree-progress" aria-label="Degree progress"><div class="degree-progress-heading"><div><h2>Degree progress ${progressFilter!=='all'?'<button type="button" class="degree-progress-reset" data-progress-filter="all" aria-label="Show all courses">All courses</button>':''}</h2><p><strong data-degree-finished>${credits(progress.completedCredits)}</strong> of ${credits(progress.totalCredits)} ${unitWord(progress.totalCredits)} finished</p></div><strong class="degree-progress-percent" data-degree-percent>${credits(progress.completedPercent)}<span>%</span></strong></div><div class="degree-progress-track" role="progressbar" aria-label="Finished degree coursework" aria-valuemin="0" aria-valuemax="${progress.totalCredits}" aria-valuenow="${progress.completedCredits}" aria-valuetext="${credits(progress.completedCredits)} of ${credits(progress.totalCredits)} ${unitWord(progress.totalCredits)} finished; ${credits(progress.inProgressCredits)} in progress; ${credits(progress.remainingCredits)} not started"><span class="degree-progress-finished" style="width:${progress.completedPercent}%"></span><span class="degree-progress-active" style="width:${progress.inProgressPercent}%"></span></div><div class="degree-progress-legend" role="group" aria-label="Show courses by progress">${choice('completed','Finished',progress.completedCredits,'completed')}${choice('in-progress','In progress',progress.inProgressCredits,'in-progress')}${choice('not-started','Not started',progress.remainingCredits,'not-started')}</div>${progress.pendingReviewCredits?'<p class="degree-progress-review">'+credits(progress.pendingReviewCredits)+' finished '+unitWord(progress.pendingReviewCredits)+' still need school confirmation.</p>':''}</section>`;
  }
  function formatReviewNote() {
    const research=program?.auditProvenance?.status==='ai-research';
    const items=researchItems();
    const researchNote=research?'<div class="sheet-notice sheet-review-status"><span><strong>AI-researched draft</strong><span class="sheet-review-explainer">'+(items.length?' · '+items.length+' items to confirm':' · Confirm course placements with your school')+'</span></span>'+button('checks','Review open items','ghost')+'</div>':'';
    if(!plan||!targetUnknowns.some(issue=>issue.field==='modality'))return researchNote;
    const source=[...(program?.sources||[]),...(pathway?.sources||[])].find(source=>safeURL(source.url));
    return researchNote+'<p class="sheet-meta" role="note">Confirm this degree’s study format with the university before enrolling.'+(source?' '+link(source.url,'Check program information'):'')+'</p>';
  }
  function researchItems() {
    if(program?.auditProvenance?.status!=='ai-research')return [];
    return [...new Set((plan?.researchTasks||[]).filter(item=>item.blocking!==false).map(item=>item.message||item.title||'').filter(Boolean))];
  }
  function renderCoursePlan() {
    courseView=projection();
    const draft={state,pathway,program,plan,match,input,guidance,targetReviewNeeded,targetIssues,targetUnknowns,mapAvailable};
    const format=(pathway.modalities||[]).map(x=>x==='campus'?'On campus':x==='hybrid'?'Hybrid':'Online').join(' / ');
    $('sheet-titlebar').innerHTML='<div class="course-plan-target"><h1 class="sheet-title">'+esc(pathway.title)+'</h1><div class="course-plan-school">'+esc(pathway.school)+(format?' · '+esc(format):'')+' <span class="sheet-mobile-target">'+button('target','Change degree','ghost')+'</span>'+jumpLink('sheet-title-jump')+'</div></div><div class="sheet-actions">'+button('compare-plans','Compare degrees','secondary')+button('more','Plan tools','ghost')+'</div>';
    if($('sheet-route'))$('sheet-route').innerHTML=window.DegreePlanRoute?.render(draft,courseView)||'';
    if($('sheet-next')){
      const next=plan&&window.DegreePlanHome?.nextWin(state,draft);
      $('sheet-next').innerHTML=next?'<section class="plan-next-action" aria-label="Your next action"><div><h2>'+esc(next.title)+'</h2><p>'+esc(next.detail)+'</p></div><div class="plan-next-action-buttons"><a class="button primary" href="'+esc(next.href)+'">'+esc(next.label)+'</a>'+button('all-tasks','All tasks','ghost')+'</div></section>':'';
    }
    $('sheet-home').hidden=true;$('sheet-momentum').hidden=true;
    $('sheet-controls').innerHTML='';$('sheet-summary').innerHTML=degreeProgressHTML();
    const conflicts=plan&&(!plan.validation.academicCountsValid||plan.setupIssues?.some(i=>['invalid_selection','selection_conflict'].includes(i.code)));
    $('sheet-review-note').innerHTML=(courseChoiceUpdateNotice()||(conflicts?'<div class="sheet-notice warning">Some course choices conflict. '+button('checks','See affected courses','ghost')+'</div>':''))+formatReviewNote();
    $('sheet-toolbar').innerHTML=plan?'<label class="course-plan-search"><span class="screen-reader-only">Find a course in this plan</span><input type="search" id="sheet-search" placeholder="Find a course" value="'+esc(state.sheet.search||'')+'"></label><div class="course-plan-small-actions"><a href="import-courses.html?from=plan">Add my courses</a>'+button('options','Course preferences','ghost')+button('cost-time','Cost & timing','ghost')+button('download','Download','ghost')+'</div>':'';
    renderCourseGrid();
    $('sheet-footer').innerHTML=plan?'<span>Degree total: '+plan.totals.required+' '+(program.creditSystem==='competency-unit'?'competency units':'credits')+' · '+(courseView.totals.unmapped?courseView.totals.unmapped+' '+unitWord(courseView.totals.unmapped)+' need a course':'University and transfer courses selected')+'</span><button type="button" class="button ghost small" data-action="download">Download plan</button>':'';
    $('sheet-context').innerHTML='';
  }
  function needsCourseChoice(row){return Boolean(row&&!['reported','confirmed'].includes(row.status)&&(row.selectionRequired||row.option?.selectionRequired||reqFor(row)?.selectionRequired));}
  function courseChoiceActions(row){
    if(!needsCourseChoice(row))return '';
    const req=reqFor(row),ids=new Set([...(req.sourceIds||[]),...(row.option?.sourceIds||[])]),references=(program.sources||[]).filter(source=>ids.has(source.id)&&safeURL(source.url)&&/\.edu$/i.test(new URL(source.url).hostname));
    const approved=references.find(source=>/approved|general.education|elective.choice/i.test(source.title||'')),source=approved||references[0],choices=Planner.availableOptions(program,req.id,input).filter(option=>!option.selectionRequired);
    return '<section class="sheet-detail course-choice-next"><h3>Choose a course for this requirement</h3><p>'+esc(req.title)+' requires '+row.credits+' credits. Choose an eligible course that is not already counted elsewhere in your plan.</p>'+(choices.length?'<button class="button primary" type="button" data-compare-row="'+esc(req.id)+'">Choose from '+choices.length+' reviewed option'+(choices.length===1?'':'s')+' →</button>':source?'<a class="button primary" href="'+esc(source.url)+'" target="_blank" rel="noopener">'+(approved?'Review official course choices':'Open the official requirement')+' ↗</a>':'<a class="button primary" href="portal.html?view=school&amp;requirement='+encodeURIComponent(req.id)+'">Ask my school which course fits →</a>')+(source&&choices.length?'<p>'+link(source.url,'Review the official requirement ↗')+'</p>':'')+'<p>Choose from the courses allowed by this requirement. You can save the course in <a href="courses.html?tab=mine">My courses</a>; a saved course is not completed credit.</p><details><summary>Create a custom version of this degree (advanced)</summary><p>Use the degree-plan builder to enter your own exact requirements and course choices. Your current plan stays saved until you review and choose the new version.</p><a class="button secondary" href="'+esc(auditURL())+'">Open degree-plan builder →</a></details></section>';
  }
  function coursePlanRow(entry,kind) {
    const first=plan.rows.find(row=>row.requirementId===entry.requirementId),done=kind==='completed',missing=kind==='unmapped',needsChoice=needsCourseChoice(first);
    const shared=entry.requirements.flatMap(req=>(program.overlaps||[]).filter(overlap=>overlap.requirementId===req.id).map(overlap=>overlap.alsoSatisfies));
    const assignments=entry.requirements.map(req=>'<span><strong>'+esc(req.code||req.title)+'</strong>'+esc(req.code?' · '+req.title:'')+'</span>').join('')+(shared.length?'<small class="course-plan-overlap">Also meets '+esc([...new Set(shared)].join(', '))+' · counted once</small>':'');
    const courseLink='<button type="button" class="course-plan-name" data-row="'+esc(entry.requirementId)+'">'+esc(entry.title)+'</button>';
    const providerHref=entry.courseUrl||entry.providerUrl;
    const providerAnchor=providerHref&&!missing?providerLink(providerHref,entry.courseUrl?'Open course at '+(entry.provider==='University'?program.school:entry.provider):entry.providerLinkLabel,entry.provider,'course-plan-provider-link'):'';
    const progressState=needsChoice?'needs-course':entry.progressState||(done?'completed':missing?'needs-course':entry.status==='in-progress'?'in-progress':'not-started');
    const progress=missing||needsChoice?'<span class="course-plan-needs-course">Choose a course</span>':courseProgressControl(first,entry.title);
    const updated=replacedRows.has(entry.requirementId)||(entry.requirements||[]).some(req=>replacedRows.has(req?.id||req));
    return '<tr class="course-plan-row'+(updated?' is-replaced':'')+'" data-requirement="'+esc(entry.requirementId)+'" data-kind="'+kind+'" data-course-progress="'+progressState+'"><td class="course-plan-course">'+courseLink+(updated?'<small class="course-plan-replaced">Updated after your course preferences changed</small>':'')+(entry.code?'<small>'+esc(entry.code)+'</small>':'')+(entry.bundle?'<small class="course-plan-bundle">'+(entry.crossSectionBundle?'Shared '+(entry.provider==='CLEP'?'exam':'course')+' · '+entry.credits+' credits in this section':entry.requirements.length>1?'One '+(entry.provider==='CLEP'?'exam':'course')+' fills '+entry.requirements.length+' requirements':entry.sourceCredits?entry.sourceCredits+' source credits · '+entry.credits+' applied in this plan':'Bundled source')+'</small>':'')+providerAnchor+'</td><td class="course-plan-provider">'+esc(entry.provider||'Not matched')+'</td><td class="course-plan-credits">'+entry.credits+'</td><td class="course-plan-placement">'+assignments+'<button class="course-plan-evidence" type="button" data-row="'+esc(entry.requirementId)+'">'+esc(entry.evidenceLabel)+'</button></td><td class="course-plan-progress"><div class="course-progress-control"><span class="course-progress-dot" aria-hidden="true"></span>'+progress+'</div></td><td class="course-plan-action">'+(needsChoice?'<button type="button" data-row="'+esc(entry.requirementId)+'">Choose course</button>':done||missing||entry.creditBalanceDerived?'<button type="button" data-row="'+esc(entry.requirementId)+'">View details</button>':'<button type="button" data-compare-row="'+esc(entry.requirementId)+'">Change course</button>')+'</td></tr>';
  }
  function coursePlanTable(entries,kind) {return '<table class="course-plan-table"><caption class="screen-reader-only">'+esc(kind==='transfer'?'Transfer courses':kind==='unmapped'?'Requirements without matched courses':'Degree coursework')+'</caption><thead><tr><th>Course</th><th>Provider</th><th>'+(program?.creditSystem==='competency-unit'?'<abbr title="Competency units">CUs</abbr>':program?.creditSystem==='quarter'?'Quarter credits':'Credits')+'</th><th>Counts toward</th><th>Progress</th><th><span class="screen-reader-only">Actions</span></th></tr></thead><tbody>'+entries.map(entry=>coursePlanRow(entry,entry.kind||kind)).join('')+'</tbody></table>';}
  function curriculumSectionHTML(section,q,depth=0){
    const matchEntry=entry=>matchesProgress(entry)&&(!q||[entry.title,entry.provider,entry.code,...(entry.requirements||[]).map(req=>req.title+' '+req.code)].join(' ').toLowerCase().includes(q));
    const shown=section.entries.filter(matchEntry),references=(section.sharedEntries||[]).filter(matchEntry),children=(section.children||[]).map(child=>curriculumSectionHTML(child,q,depth+1)).join('');
    if(!shown.length&&!references.length&&!children)return '';
    const p=section.fulfillmentProgress||section.progress,active=q||progressFilter!=='all',isOpen=active||sectionOpen.get(section.id)!==false,number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
    const shared=section.sharedCredits||0,budget=p.totalCredits||section.credits;
    const creditLabel=shared?number(section.credits)+' '+unitWord(section.credits)+' here · '+number(shared)+' shared':number(section.credits)+' '+unitWord(section.credits);
    const sectionBar=p.valid?'<span class="course-section-creditline"><strong data-section-finished>'+number(p.completedCredits)+' / '+number(budget)+'</strong> '+unitWord(budget)+' finished'+(p.inProgressCredits?' <small>'+number(p.inProgressCredits)+' in progress</small>':'')+'</span><span class="course-section-track" role="progressbar" aria-label="'+esc(section.title)+' coursework" aria-valuemin="0" aria-valuemax="'+budget+'" aria-valuenow="'+p.completedCredits+'" aria-valuetext="'+number(p.completedCredits)+' of '+number(budget)+' '+unitWord(budget)+' finished; '+number(p.inProgressCredits)+' in progress"><span class="degree-progress-finished" style="width:'+p.completedPercent+'%"></span><span class="degree-progress-active" style="width:'+p.inProgressPercent+'%"></span></span>':'<span>'+esc(creditLabel)+'</span>';
    const heading='h'+Math.min(4,depth+2),attribute=depth?'data-plan-subsection':'data-plan-section';
    const referenceHTML=references.map(entry=>{const id=entry.canonicalRequirementId||entry.requirementId,req=program.requirements.find(req=>req.id===id),owner=(program.curriculumSections||[]).find(node=>node.requirementIds?.includes(id)),label=entry.progressState==='completed'?'Finished':entry.progressState==='in-progress'?'In progress':'Not started';return '<div class="course-shared-reference" data-shared-requirement="'+esc(id)+'" data-course-progress="'+esc(entry.progressState)+'"><span class="course-progress-dot" aria-hidden="true"></span><div><strong>'+esc(req?.code||entry.code)+' · '+esc(req?.title||entry.title)+'</strong><small>'+(entry.sharedCredits?number(entry.sharedCredits)+' shared '+unitWord(entry.sharedCredits):'Shared competency')+' · counted in '+esc(owner?.title||'another degree section')+'</small></div><span class="course-shared-status">'+label+'</span><button type="button" data-row="'+esc(id)+'">View course</button></div>';}).join('');
    const content=children?'<div class="course-section-children">'+children+'</div>':shown.length?coursePlanTable(shown,section.title):'';
    return '<details class="course-plan-group course-plan-section'+(depth?' course-plan-subsection course-plan-depth-'+depth:'')+'" '+attribute+'="'+esc(section.id)+'"'+(isOpen?' open':'')+'><summary><span class="course-section-heading"><'+heading+'>'+esc(section.title)+'</'+heading+'><small>'+esc(creditLabel)+(active&&shown.length?' · '+shown.length+' matching course'+(shown.length===1?'':'s'):'')+'</small></span><span class="course-section-progress">'+sectionBar+'</span><svg class="course-section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>'+referenceHTML+content+'</details>';
  }
  function graduationRequirementsHTML(q){
    if(progressFilter!=='all')return '';
    const checks=(program.graduationRequirements||[]).filter(item=>!q||[item.title,item.description,item.detail].join(' ').toLowerCase().includes(q));if(!checks.length)return '';
    return '<details class="course-plan-group course-graduation-requirements"><summary><strong>Other graduation requirements</strong><span>Non-credit</span></summary>'+checks.map(item=>{const ids=new Set([item.sourceId,...(Array.isArray(item.sourceIds)?item.sourceIds:[])].filter(Boolean)),references=(program.sources||[]).filter(source=>ids.has(source.id)&&safeURL(source.url));return '<div><strong>'+esc(item.title)+'</strong><p>'+esc(item.description||item.detail)+'</p><span>School requirement</span>'+references.map(source=>' · '+link(source.url,'View requirement')).join('')+'</div>';}).join('')+'</details>';
  }
  function renderCourseGrid() {
    document.querySelectorAll('[data-plan-section],[data-plan-subsection]').forEach(node=>sectionOpen.set(node.dataset.planSection||node.dataset.planSubsection,node.open));
    const grid=$('sheet-grid');
    if(!plan){
      const choices=DegreeProgramCatalog.variants(pathway,catalog);
      if(!choices.length&&!mapAvailable){grid.innerHTML=pendingGoalHTML();return;}
      let heading,detail,actions='';
      if(choices.length){heading='Where will you study?';detail='Choose the study format for this degree. Course requirements can differ by format.';actions=choices.map(route=>'<button class="button primary" type="button" data-planning-variant="'+esc(route.id)+'">'+(route.modalities.includes('online')?'Build online plan':'Build on-campus plan')+'</button>').join('');}
      else if(targetIssues.length){heading='Review your preferences for this degree.';detail=targetIssues.map(targetIssueText).join(' ');const formatOnly=targetIssues.every(issue=>['modality','classroomImportance'].includes(issue.field));const mode=pathway.modalities?.length===1?pathway.modalities[0]:null;actions=(formatOnly&&mode?'<button class="button primary" type="button" data-target-format="'+mode+'">Use '+(mode==='online'?'online':'on-campus')+' study for this degree</button>':'<button class="button primary" type="button" data-action="target-preferences">Update my preferences</button>');}
      else{heading='The program information needs checking.';detail=targetUnknowns.map(issue=>issue.title+'.').join(' ');actions='<button class="button primary" type="button" data-action="target">Review degree and study format</button>';}
      grid.innerHTML='<section class="course-plan-unavailable"><h2>'+esc(heading)+'</h2><p>'+esc(detail)+'</p><div>'+actions+'<a class="button ghost" href="courses.html">My courses</a></div></section>';return;
    }
    courseView=projection();const q=(state.sheet.search||'').trim().toLowerCase();
    const amounts=courseView.totals,unmatched=(match?.unmatched||[]).filter(record=>record.status==='earned');
    const residencyMinimum=plan.coverage.derivedInstitutionMinimum??plan.coverage.publishedInstitutionMinimum,residencyAlt=Sheet.residencyAlternative(program,residencyMinimum);
    let html='<div class="course-plan-coverage"><span><strong>'+amounts.transfer+'</strong> outside '+unitWord(amounts.transfer)+' planned</span>'+(amounts.completed?'<span><strong>'+amounts.completed+'</strong> finished '+unitWord(amounts.completed)+' matched</span>':'')+'<span>At least <strong>'+(residencyMinimum??'—')+'</strong> '+unitWord(residencyMinimum)+' at the university'+(residencyAlt?' <small class="course-plan-residency-alt">(standard enrollment)</small>':'')+'</span><span class="course-plan-unmapped-count"><strong>'+amounts.unmapped+'</strong> '+unitWord(amounts.unmapped)+' not yet mapped</span>'+(program.overlaps?.length?'<span class="course-plan-shared-note">Shared requirements count once.</span>':'')+(unmatched.length?'<a class="course-plan-unmatched" href="courses.html?tab=mine">'+unmatched.length+' past course'+(unmatched.length===1?'':'s')+' not matched</a>':'')+'</div>'+(residencyAlt?'<p class="course-plan-residency-note" data-residency-alternative="'+residencyAlt.value+'">'+esc(residencyAlt.text)+' Ask the school which rule applies to your admission.</p>':'')+startingRouteNote();
    const graduation=graduationRequirementsHTML(q);html+=(courseView.sections||[]).map(section=>curriculumSectionHTML(section,q)).join('')+graduation;
    if(!graduation&&!Object.values(courseView.groups).flat().some(entry=>matchesProgress(entry)&&(!q||[entry.title,entry.provider,entry.code,...entry.requirements.map(req=>req.title+' '+req.code)].join(' ').toLowerCase().includes(q))))html+='<p class="course-plan-empty">'+(q?'No courses match this search and status.':progressFilter==='completed'?'No finished courses matched yet.':progressFilter==='in-progress'?'No courses in progress yet.':'No courses remain in this view.')+' <button type="button" data-progress-filter="all" data-clear-search="true">Show all courses</button></p>';
    grid.innerHTML=html;
  }
  function pendingGoalHTML(){const source=(pathway.sources||[]).find(item=>safeURL(item.url))||(safeURL(pathway.url)?{url:pathway.url}:null),count=state.learning.length;return '<section class="course-plan-unavailable course-plan-pending" aria-label="Saved degree goal"><h2>Your goal is saved.</h2><p>'+count+' saved course'+(count===1?'':'s')+' · Requirements needed</p><p>Add the actual degree requirements and catalog year to build your course plan. Your saved courses will be checked against those requirements.</p>'+(pathway.catalogReview?.reason?'<p>'+esc(pathway.catalogReview.reason)+'</p>':'')+(source?'<p>'+link(source.url,'Open official degree requirements')+'</p>':'')+'<div><a class="button primary" href="'+esc(auditURL())+'">Add requirements</a><a class="button ghost" href="courses.html">My courses'+(count?' ('+count+')':'')+'</a></div></section>';}
  function availablePlansHTML(){
    const snapshots=(state.whatIf?.snapshots||[]).slice().reverse(),order=new Map(snapshots.map((snapshot,index)=>[snapshot.pathwayId,index]));
    const preferredMode=state.profile.modality&&state.profile.modality!=='any'?state.profile.modality:pathway.modalities?.length===1?pathway.modalities[0]:null;
    const fit=route=>(route.field===state.profile.field?3:0)+(preferredMode&&route.modalities?.includes(preferredMode)?2:0);
    const routes=catalog.pathways.filter(route=>hasCoursePlan(route)||order.has(route.id)&&route.modelId).sort((a,b)=>(order.get(a.id)??999)-(order.get(b.id)??999)||fit(b)-fit(a)||a.school.localeCompare(b.school)||a.title.localeCompare(b.title));
    return '<section class="course-plan-recovery"><h2>Course plans you can open now</h2><p>Choose a degree to see its courses. Your saved learning stays with you.</p>'+routes.map(route=>'<div><span><strong>'+esc(route.title)+'</strong><small>'+esc(route.school)+' · '+esc(route.modalities?.includes('online')?'Online':'On campus')+(order.has(route.id)?' · Previously saved':'')+'</small></span><button type="button" class="button secondary small" data-recovery-open="'+esc(route.id)+'">Open course plan</button></div>').join('')+'</section>';
  }
  function simpleCourseDialog(id) {
    const entry=Object.values(courseView?.groups||projection().groups).flat().find(entry=>entry.requirementIds.includes(id)),row=plan?.rows.find(row=>row.requirementId===id);if(!entry||!row)return;dialogRow=id;
    const done=['reported','confirmed'].includes(row.status),missing=courseView.groups.unmapped.some(item=>item.requirementIds.includes(id)),record=progressRecord(row);
    let html='<h2>'+esc(entry.title)+'</h2><p class="course-info-meta">'+esc([entry.provider,entry.code,entry.credits+' degree '+unitWord(entry.credits)].filter(Boolean).join(' · '))+'</p>'+creditBalanceNote(row);
    if(missing)html+='<p>No transfer course has been matched to this requirement yet.</p>';
    else html+='<p>'+(entry.courseUrl?providerLink(entry.courseUrl,'Open course ↗',entry.provider):entry.providerUrl?providerLink(entry.providerUrl,entry.providerLinkLabel+' ↗',entry.provider):'')+'</p>';
    if(needsCourseChoice(row))html+=courseChoiceActions(row);
    if(!missing&&!needsCourseChoice(row))html+='<label class="sheet-field"><span>Course progress</span>'+courseProgressControl(row,entry.title)+'</label>';
    if(done)html+='<p><strong>Finished</strong> · '+(row.status==='confirmed'?'School confirmed':'School evaluation pending')+'</p>'+(record?'<button type="button" class="button secondary" data-edit-learning="'+esc(record.id)+'">Edit my course record</button>':'');
    html+='<div class="course-info-placements">'+entry.requirements.map(req=>'<div><strong>'+esc(req.code||req.title)+'</strong><span>'+esc(req.code?req.title:'')+'</span><span>'+req.credits+' credits</span></div>').join('')+'</div><p class="course-info-evidence">'+esc(entry.evidenceLabel)+(entry.evidenceUrl?' · '+link(entry.evidenceUrl,'View transfer evidence ↗'):'')+'</p>';
    if(entry.conditions.length)html+='<details class="sheet-detail"><summary>Conditions for this match</summary><ul>'+entry.conditions.map(condition=>'<li>'+esc(condition)+'</li>').join('')+'</ul></details>';
    if(!done&&!missing&&!entry.creditBalanceDerived&&!needsCourseChoice(row))html+='<button type="button" class="button secondary" data-compare-row="'+esc(id)+'">Change course or provider</button>';
    const earned=state.learning.filter(item=>item.status==='earned'&&Number.isFinite(item.credits)&&item.credits>0&&['semester','quarter','competency-unit'].includes(item.creditSystem));
    if(!done&&earned.length)html+='<details class="sheet-detail"><summary>Use a course I finished</summary><form id="sheet-placement-form" data-requirement="'+esc(id)+'">'+select('recordId','My finished course',[['','Choose a course'],...earned.map(item=>[item.id,item.title+' · '+item.provider])],'')+'<label class="sheet-checklist"><span><input type="checkbox" name="confirmation"> My school’s evaluation confirms this placement.</span></label><button type="submit" class="button secondary">Apply course</button></form></details>';
    if(done&&record&&row.status!=='confirmed')html+='<form id="confirm-placement"><label class="sheet-checklist"><span><input type="checkbox" name="confirm" required> My school’s evaluation confirms this exact placement.</span></label><button type="submit" class="button secondary">Record school confirmation</button></form>';
    html+='<details class="sheet-detail"><summary>Private note</summary><label class="sheet-field"><span>Only in your private plan</span><textarea id="sheet-row-note" maxlength="6000">'+esc(state.sheet.notes?.[program.id]?.[id]||'')+'</textarea></label>'+button('save-note','Save note')+'</details>';
    const outcome=courseOutcomeButton(row,'Student transfer reports');if(outcome)html+='<p>'+outcome+'</p>';
    openDialog(html,'Course details for '+entry.title);
  }

  function renderGrid() {
    if(simplePlan()&&!printView){renderCourseGrid();return;}
    const grid=$('sheet-grid'),scroll=[grid.scrollLeft,grid.scrollTop];
    const heads='<thead><tr class="sheet-letters"><th class="sheet-number"></th>'+['A','B','C','D','E','F'].map((x,i)=>'<th'+(i===0?' class="sheet-requirement"':'')+'>'+x+'</th>').join('')+'</tr><tr><th class="sheet-number" scope="col">#</th><th class="sheet-requirement" scope="col">Degree requirement</th><th class="sheet-credits" scope="col">Cr.</th><th class="sheet-provider" scope="col">Where to earn it</th><th class="sheet-course" scope="col">Course / exam</th><th class="sheet-progress" scope="col">My progress</th><th class="sheet-more" scope="col"><span class="screen-reader-only">Course actions</span></th></tr></thead>';
    if(!plan){grid.innerHTML=!mapAvailable?pendingGoalHTML():'<section class="sheet-unmapped-task"><h2>Your goal is saved.</h2><p>This degree needs review against your career goal, degree level or study format before a course plan can be used.</p><a href="courses.html">Open My courses →</a></section>';return;}
    courseView=projection();const progressEntries=Object.values(courseView.groups).flat(),activeRows=visiblePlanRows();
    const filtered=activeRows.filter(row=>{
      if(!printView&&!matchesProgress(progressEntries.find(entry=>entry.requirementIds.includes(row.requirementId))||{}))return false;
      if(printView)return true;const term=(state.sheet.search||'').toLowerCase();if(term&&!([row.title,row.code,reqFor(row)?.categoryLabel,row.option?.provider,row.option?.title].join(' ').toLowerCase().includes(term)))return false;
      return state.sheet.filter==='completed'?['reported','confirmed'].includes(row.status):state.sheet.filter==='remaining'?!['reported','confirmed'].includes(row.status):state.sheet.filter==='outside'?row.option&&row.option.provider!=='University':state.sheet.filter==='review'?review(row):true;
    });
    const groups=new Map();for(const row of filtered){const key=row.category||'Requirements';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    let html='<table class="sheet-table"><caption class="screen-reader-only">'+esc(pathway.school+' · '+pathway.title)+' proposed degree worksheet</caption>'+heads+'<tbody>';
    for(const [group,rows] of groups){html+='<tr class="sheet-group"><td class="sheet-number"></td><th colspan="6" scope="rowgroup">'+esc(labels[group]||group.replace(/-/g,' '))+'<small>'+rows.reduce((sum,r)=>sum+r.credits,0)+' credits'+(filtered.length!==activeRows.length?' shown':'')+'</small></th></tr>';for(const row of rows)html+=renderRow(row,activeRows.indexOf(row)+1);}
    if(!filtered.length)html+='<tr><td colspan="7" class="sheet-blank">No matching rows. Clear the search or choose All rows.</td></tr>';
    html+='</tbody><tfoot><tr class="sheet-foot-total"><td class="sheet-number"></td><th class="sheet-requirement" scope="row">Degree total</th><td class="sheet-credits">'+plan.totals.accounted+'</td><td colspan="4">'+(filtered.length!==activeRows.length?filtered.length+' of '+activeRows.length+' rows shown · ':'')+'Each requirement counts once</td></tr></tfoot></table>';grid.innerHTML=html;grid.scrollLeft=scroll[0];grid.scrollTop=scroll[1];
  }
  function renderRow(row,index) {
    const req=reqFor(row),o=row.option,existing=['reported','confirmed'].includes(row.status),pending=progressRecord(row)?.status==='in-progress',openGap=gap(row),derived=balanceEntry(row)?.creditBalanceDerived===true;
    const progressState=existing?'completed':openGap||!o?'needs-course':pending?'in-progress':'not-started';
    const options=Planner.availableOptions(program,req.id,input),providers=[...new Set(options.map(o=>o.provider))];
    const name=req.categoryLabel||row.title,hasReview=review(row),courseOptions=options.filter(x=>x.provider===o?.provider);
    const providerText=openGap?'Source needs research':o?.provider==='University'?'University':o?.provider||'Choose source';
    const compareLink=!existing&&options.length>1?'<button type="button" class="sheet-compare-link" data-compare-row="'+esc(req.id)+'" aria-label="Compare courses for '+esc(name)+'">Compare '+options.length+' options <span aria-hidden="true">→</span></button>':'';
    const provider=existing||derived?esc(o?.provider||'Recorded learning'):'<select data-provider="'+esc(req.id)+'" aria-label="Credit source for '+esc(name)+'">'+(openGap||!o?'<option value="" selected>Find a source…</option>':'')+opts(providers.map(p=>[p,p==='University'?'University course':p]),openGap?'':o?.provider)+'</select>';
    const course=existing||derived?esc(o?.title||'Recorded learning'):openGap?'<button class="sheet-control" type="button" data-row="'+esc(req.id)+'">Find an outside option…</button>':'<select data-course="'+esc(req.id)+'" aria-label="Course for '+esc(name)+'"'+(!courseOptions.length?' disabled':'')+'>'+opts(courseOptions.map(x=>[x.id,x.title]),o?.id)+'</select>';
    const progress=!o||openGap?'<select aria-label="Progress for '+esc(name)+'" disabled><option>Choose a course first</option></select>':courseProgressControl(row,name);
    const note=existing?(row.status==='confirmed'?'School confirmed':'School review pending'):openGap?'Outside mapping not yet verified':row.placementReason==='required-university'?'Required at this university':row.placementReason==='reserved-university'?'Reserves university credit':o?.evidence==='conditional'?'Eligibility condition applies':'';
    return '<tr class="sheet-row'+(hasReview?' review':'')+(existing?' existing':'')+(pending?' in-progress':'')+'" data-requirement="'+esc(req.id)+'" data-course-progress="'+progressState+'"><td class="sheet-number">'+index+'</td><th class="sheet-requirement" scope="row"><strong>'+esc(name)+'</strong><small>'+esc(req.categoryLabel?'Requirement category':row.code)+(req.upper?' · upper level':'')+'</small>'+compareLink+'</th><td class="sheet-credits">'+row.credits+'</td><td class="sheet-provider sheet-cell">'+provider+(existing?'':'<span class="print-only">'+esc(providerText)+'</span>')+'</td><td class="sheet-course sheet-cell">'+course+(existing?'':'<span class="print-only">'+esc(openGap?'Course selection needs research':o?.title||'Unresolved')+'</span>')+(note?'<small class="sheet-note">'+(hasReview?'<span class="sheet-review-dot" aria-hidden="true"></span>':'')+esc(note)+'</small>':'')+courseOutcomeButton(row)+'</td><td class="sheet-progress sheet-cell"><div class="course-progress-control"><span class="course-progress-dot" aria-hidden="true"></span>'+progress+'</div><span class="print-only">'+esc(progressLabel(row))+'</span></td><td class="sheet-more"><button type="button" data-row="'+esc(req.id)+'" aria-label="Details for '+esc(name)+'" title="Course choices, sources and notes">···</button></td></tr>';
  }
  function openDialog(html,label='Degree plan details') {costSummaryEpoch++;const dialog=$('sheet-dialog');if(!dialog.open){restoreFocus=document.activeElement;restoreFocusContext={requirementId:restoreFocus?.dataset?.compareRow||restoreFocus?.dataset?.row||restoreFocus?.closest?.('[data-requirement]')?.dataset?.requirement||null,action:restoreFocus?.dataset?.action||null,id:restoreFocus?.id||null};}dialog.classList.toggle('is-course-comparison',label.startsWith('Compare courses for '));$('sheet-dialog-content').innerHTML=html;dialog.setAttribute('aria-label',label);if(!dialog.open)dialog.showModal();updateSavings();}
  function returnHome() {location.assign(query.get('from')==='courses'?'courses.html':query.get('from')==='compare'&&task==='cost-time'?'compare-plans.html':'plan.html');}
  function closeDialog(stay=false) {courseUpdateReview=null;comparisonTicket++;if(task&&!stay)return returnHome();const correcting=Boolean(progressCorrection);progressCorrection=null;const dialog=$('sheet-dialog');dialog.close();dialogRow=null;if(correcting)render();let target=restoreFocus?.isConnected&&!dialog.contains?.(restoreFocus)?restoreFocus:null;if(!target&&restoreFocusContext?.requirementId){const id=CSS.escape(restoreFocusContext.requirementId);target=$('sheet-grid').querySelector('[data-compare-row="'+id+'"], [data-row="'+id+'"]');}if(!target&&restoreFocusContext?.id)target=$(restoreFocusContext.id);if(!target&&restoreFocusContext?.action)target=$('sheet-workspace').querySelector('[data-action="'+CSS.escape(restoreFocusContext.action)+'"]');if(!target||dialog.contains?.(target))target=$('sheet-app');target?.focus({preventScroll:true});if(externalPending)void refreshSavedPlan();}
  $('sheet-dialog').addEventListener('cancel',event=>{event.preventDefault();requestCloseDialog();});
  function rowDialog(id) {
    if(simplePlan()){simpleCourseDialog(id);return;}
    const row=visiblePlanRows().find(r=>r.requirementId===id);if(!row)return;dialogRow=id;const req=reqFor(row),o=row.option,record=progressRecord(row),available=Planner.availableOptions(program,id,input);
    const sourceIds=new Set([...(o?.sourceIds||[]),...(o?.identitySourceIds||[])]),evidence=(program.sources||[]).filter(s=>sourceIds.has(s.id));
    let html='<h2>'+esc(req.categoryLabel||row.title)+'</h2><p>'+esc(row.code)+' · '+row.credits+' degree credits · '+esc(row.status==='confirmed'?'School-confirmed placement':row.status==='reported'?'Completed; evaluation pending':'Proposed placement')+'</p>'+creditBalanceNote(row);
    if(needsCourseChoice(row))html+=courseChoiceActions(row);
    if(gap(row))html+='<div class="sheet-notice warning"><p><strong>Outside option needs research.</strong> The featured university course is a fallback, not a finding that you must take this requirement at the university. Request an exact equivalent before adding an outside course.</p></div>'+button('sources','Explore credit sources','ghost');
    if(o){html+='<div class="sheet-detail"><strong>'+esc(o.provider+' · '+o.title)+'</strong><p>'+esc(o.receivingCode||o.code||'')+(o.bundleId?' · One source action may fill multiple rows; count its original credits once.':'')+'</p>'+(o.allocationType==='category-substitution'?'<p>This fills a requirement category. It does not claim an exact match to the featured university course.</p>':'')+'<p>'+link(o.url,'Open option reference')+'</p></div>';}
    if(o?.evidence==='conditional'&&o.provider!=='University'&&!['reported','confirmed'].includes(row.status))html+='<div class="sheet-detail"><a class="button secondary" href="portal.html?view=school&amp;requirement='+encodeURIComponent(id)+'">Review eligibility condition</a></div>';
    const outcome=courseOutcomeButton(row,'View / report a school outcome');if(outcome)html+='<div class="sheet-detail"><strong>Student outcomes</strong><p>For this placement and catalog '+esc(reportYear())+'. School approval remains separate.</p>'+outcome+'</div>';
    const issues=[...new Set([...(row.conditions||[]),row.notes,row.prerequisiteNotes].filter(Boolean))];
    html+='<details class="sheet-detail"><summary>Transfer conditions'+(issues.length?' · '+issues.length:'')+'</summary>'+(issues.length?'<ul>'+issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>':'<p>No additional course-specific conditions are recorded.</p>')+'</details>';
    html+='<details><summary>Evidence & checked dates</summary><div class="sheet-detail">'+(evidence.map(s=>'<p>'+link(s.url,s.title)+'<br>Checked '+esc(s.checked||s.checkedOn||'date not recorded')+'</p>').join('')||'<p>No course-specific evidence is recorded.</p>')+'</div></details>';
    if(!['reported','confirmed'].includes(row.status)&&!balanceEntry(row)?.creditBalanceDerived&&!needsCourseChoice(row))html+='<div class="sheet-detail"><button type="button" class="button secondary sheet-open-compare" data-compare-row="'+esc(id)+'">Compare '+available.length+' course options</button><p>Preview the change before updating your plan.</p><button class="button ghost" type="button" data-reset-row="'+esc(id)+'">Let the planner choose</button></div>';
    const earned=state.learning.filter(item=>item.status==='earned'&&Number.isFinite(item.credits)&&item.credits>0&&['semester','quarter','competency-unit'].includes(item.creditSystem));
    if(earned.length&&!['reported','confirmed'].includes(row.status))html+='<details class="sheet-detail"><summary>Use a course I already completed</summary><p>Choose the original learning record. This is your proposed placement until the school confirms it.</p><form id="sheet-placement-form" data-requirement="'+esc(id)+'">'+select('recordId','Completed learning record',[['','Choose a completed record'],...earned.map(item=>[item.id,item.provider+' · '+item.title+' · '+item.credits+' '+(item.creditSystem||'semester')+' credits'])],'')+'<label class="sheet-checklist"><span><input type="checkbox" name="confirmation"> I have the school evaluation confirming this exact placement.</span></label><button type="submit" class="button secondary">Apply to this requirement</button></form></details>';
    if(o&&!gap(row)&&!needsCourseChoice(row))html+='<h3>My progress</h3><p>Finishing the source course and receiving school approval are separate milestones.</p>'+(!record||record.status!=='earned'?'<button type="button" class="button secondary" data-complete="'+esc(id)+'">Record course completion</button>':'<p>Completed source record: '+esc(record.provider+' · '+record.title)+' ('+record.credits+' '+esc(record.creditSystem||'semester')+' credits).</p>')+(record?.status==='earned'&&row.status!=='confirmed'?'<form id="confirm-placement"><label class="sheet-checklist"><span><input type="checkbox" name="confirm" required> I have the school evaluation confirming this exact requirement placement.</span></label><button class="button" type="submit">Confirm school placement</button></form>':'');
    html+='<details class="sheet-detail"><summary>My private note</summary><label class="sheet-field"><span>Private to your plan; excluded from community posts</span><textarea id="sheet-row-note" maxlength="6000">'+esc(state.sheet.notes?.[program.id]?.[id]||'')+'</textarea></label><button type="button" class="button secondary" data-action="save-note">Save note</button></details>'+(o?'<div class="sheet-detail"><h3>Community discussion</h3><p>Ask about this source while the requirement is in view.</p><button type="button" class="button secondary" data-action="course-discussion">Discuss this course</button></div>':'');
    openDialog(html,'Details for '+(req.categoryLabel||row.title));
  }
  let comparisonDataPromise, comparisonTicket=0, comparisonPreview=null;
  function comparisonData() {
    if(!comparisonDataPromise)comparisonDataPromise=fetch('data/cost-comparisons.json').then(r=>{if(!r.ok)throw Error('Cost sources unavailable');return r.json();}).catch(error=>{comparisonDataPromise=null;throw error;});
    return comparisonDataPromise;
  }
  function providerGuide(provider) {
    const id=({'Sophia':'sophia','Study.com':'study-com','StraighterLine':'straighterline','CLEP':'clep','Saylor':'saylor','DSST':'dsst'})[provider]||slug(provider);
    return sources.find(source=>source.id===id||source.name===provider);
  }
  function optionAssessment(option) {
    if(typeof option.assessmentFormat==='string'&&option.assessmentFormat.trim())return option.assessmentFormat;
    if(option.proctoringRequired===true)return 'Proctored assessment';
    if(option.proctoringRequired===false)return 'No proctor required';
    return option.provider==='University'?'University course':option.provider==='CLEP'||option.provider==='DSST'?'Credit exam':'Course · check assessment';
  }
  function comparePreview(id,optionId,costData) {
    const row=plan?.rows.find(item=>item.requirementId===id);
    if(!row)throw Error('This requirement is no longer in your plan.');
    if(['reported','confirmed'].includes(row.status))return {allowed:false,reason:'Your completed course is already recorded here. Open its details to review the original record.',row};
    const available=Planner.availableOptions(program,id,input),option=available.find(item=>item.id===optionId);
    if(!option)throw Error('This course is no longer available for the current plan settings.');
    const candidate=Sheet.setCourse(clone(state),program.id,id,option.id),draft=Journey.buildDraft(candidate,catalog,models);
    const selected=draft.plan?.rows.find(item=>item.requirementId===id),issues=[...(draft.plan?.setupIssues||[]),...(draft.plan?.validation?.errors||[])];
    const blocked=issues.filter(issue=>['invalid_selection','selection_conflict'].includes(issue.code));
    const allowed=Boolean(draft.plan?.validation?.academicCountsValid&&selected?.option?.id===option.id&&!blocked.length);
    const reason=allowed?'':blocked.map(issue=>issue.message).filter(Boolean).join(' ')||'This choice conflicts with another requirement or credit rule. Resolve the open items before using it.';
    const before=costData&&window.DegreeSavings?DegreeSavings.calculate(state,{state,pathway,program,plan,match,input,guidance},costData):null;
    const after=costData&&window.DegreeSavings?DegreeSavings.calculate(candidate,draft,costData):null;
    return {allowed,reason,row,option,draft,before,after,programId:program.id,requirementId:id,optionId:option.id};
  }
  function comparisonImpact(preview) {
    const before=preview.before,after=preview.after;
    if(!preview.allowed)return '<div class="sheet-comparison-blocked" data-comparison-blocker role="status"><strong>This choice needs attention</strong><p>'+esc(preview.reason)+'</p></div>';
    const beforeMix=projection().totals,afterMix=window.DegreeCoursePlanView.build(preview.draft,courseCatalog).totals;
    const university=afterMix.universityRequired+afterMix.universityReserved,delta=university-beforeMix.universityRequired-beforeMix.universityReserved,unit=program.creditSystem==='competency-unit'?'units':'credits';
    const mix='<div class="sheet-comparison-mix" data-comparison-mix><span><strong>'+afterMix.transfer+'</strong> outside '+unit+' planned</span><span><strong>'+university+'</strong> university '+unit+' planned</span><p>'+(delta<0?Math.abs(delta)+' fewer university '+unit:delta>0?delta+' more university '+unit:'The planned university credit load stays the same.')+'</p></div>';
    if(!after?.available||!after.projected)return mix+'<div class="sheet-comparison-impact" data-comparison-impact><strong>Course change preview</strong><p>'+esc(after?.reason||'A tuition estimate is not available for this degree yet. Your course choice can still be saved to the draft.')+'</p><span>'+preview.draft.plan.coverage.mappedExternalCredits+' planned transfer '+esc(unitWord(preview.draft.plan.coverage.mappedExternalCredits))+'</span></div>';
    const p=after.projected,baseline=before?.available?before.projected:null;
    const moneyDelta=baseline?Math.round((p.netDifference-baseline.netDifference)*100)/100:null;
    const termsDelta=baseline?p.termsAvoided-baseline.termsAvoided:null;
    let change=moneyDelta===null?'Based on this proposed course map.':moneyDelta>0?money(moneyDelta)+' more estimated savings':moneyDelta<0?money(Math.abs(moneyDelta))+' higher estimated cost':'Projected tuition is unchanged';
    if(termsDelta>0)change+=' · '+termsDelta+' fewer university '+(termsDelta===1?'term':'terms');
    else if(termsDelta<0)change+=' · '+Math.abs(termsDelta)+' more university '+(termsDelta===-1?'term':'terms');
    return mix+'<div class="sheet-comparison-impact" data-comparison-impact><div class="sheet-comparison-stats"><div><span>Tuition + outside budget</span><strong data-comparison-cost>'+money(p.afterTuition+p.outsideBudget)+'</strong></div><div><span>University terms</span><strong data-comparison-terms>'+p.afterTerms+'</strong></div><div><span>Transfer credits planned</span><strong data-comparison-credits>'+p.transferCredits+'</strong></div></div><p class="sheet-comparison-delta" data-comparison-delta role="status" aria-live="polite">'+esc(change)+'</p><small>Provisional, before aid. Your '+money(p.outsideBudget)+' outside-course budget stays fixed; individual provider charges can differ. Other fees and living costs are excluded. Outside study takes additional time.</small></div>';
  }
  function simpleChangeDialog(id) {
    const row=plan?.rows.find(row=>row.requirementId===id);if(!row)return;dialogRow=id;
    if(['reported','confirmed'].includes(row.status)){simpleCourseDialog(id);return;}
    const available=Planner.availableOptions(program,id,input);
    const options=available.map(option=>{
      const preview=comparePreview(id,option.id,null),view=window.DegreeCoursePlanView.build(preview.draft,courseCatalog),entry=Object.values(view.groups).flat().find(entry=>entry.requirementIds.includes(id)),current=option.id===row.option?.id;
      return '<li class="course-choice"><div><strong>'+esc(option.title)+'</strong><span>'+esc(option.provider==='University'?program.school:option.provider)+'</span>'+(entry?'<small>'+esc(entry.evidenceLabel)+(entry.bundle?' · '+entry.credits+' degree '+esc(unitWord(entry.credits)):'')+'</small>':'')+(!preview.allowed?'<small class="course-choice-blocked">'+esc(preview.reason)+'</small>':'')+(entry?.courseUrl?'<a href="'+esc(entry.courseUrl)+'" target="_blank" rel="noopener">Course & pricing ↗</a>':'')+'</div><button type="button" class="button '+(current?'ghost':'secondary')+'" data-simple-use="'+esc(id)+'" data-option="'+esc(option.id)+'"'+(current||!preview.allowed?' disabled':'')+'>'+(current?'Selected':'Use course')+'</button></li>';
    }).join('');
    openDialog('<h2>Choose a course</h2><p class="course-info-meta">'+esc(row.code+' · '+row.title)+'</p><ul class="course-choices">'+options+'</ul>','Choose a course for '+row.title);
  }

  async function compareCourses(id,optionId) {
    const row=plan?.rows.find(item=>item.requirementId===id);if(!row)return;dialogRow=id;
    if(['reported','confirmed'].includes(row.status)){rowDialog(id);return;}
    const ticket=++comparisonTicket,programId=program.id,req=reqFor(row),available=Planner.availableOptions(program,id,input);
    const selected=available.find(item=>item.id===(optionId||row.option?.id))||available[0];
    if(!selected){rowDialog(id);return;}
    const heading='<div class="sheet-comparison-heading"><h2>Compare courses</h2><p>'+esc(req.categoryLabel||row.title)+' · '+row.credits+' degree credits</p></div>';
    openDialog(heading+'<div class="sheet-comparison-loading" role="status">Loading your options…</div>','Compare courses for '+(req.categoryLabel||row.title));
    let costs=null;try{costs=await comparisonData();}catch{/* Course choices remain available if the optional tuition comparison cannot load. */}
    if(ticket!==comparisonTicket||program?.id!==programId||!$('sheet-dialog').open)return;
    let preview;try{preview=comparePreview(id,selected.id,costs);}catch(error){$('sheet-dialog-content').innerHTML=heading+'<p role="alert">'+esc(error.message)+'</p>';return;}
    comparisonPreview=preview;
    const currentId=row.option?.id;
    const cards=available.map(option=>'<button type="button" class="sheet-course-pick'+(option.id===selected.id?' is-selected':'')+'" data-preview-row="'+esc(id)+'" data-option="'+esc(option.id)+'" aria-pressed="'+(option.id===selected.id)+'"><span class="sheet-provider-mark provider-'+esc(slug(option.provider))+'" aria-hidden="true">'+esc(option.provider==='University'?'U':option.provider==='Study.com'?'ST':option.provider==='StraighterLine'?'SL':option.provider.slice(0,2).toUpperCase())+'</span><span class="sheet-course-pick-body"><span class="sheet-course-pick-top"><strong>'+esc(option.provider==='University'?program.school:option.provider)+'</strong>'+(option.id===currentId?'<small class="sheet-current-tag">In my plan</small>':'')+'</span><span class="sheet-course-pick-title">'+esc(option.title)+'</span><span class="sheet-course-pick-facts">'+option.credits+' credits · '+esc(optionAssessment(option))+'</span><span class="sheet-option-evidence">'+(option.provider==='University'?'University requirements apply':option.evidence==='conditional'?'Transfer match needs review':'Published transfer match')+'</span></span><span class="sheet-pick-indicator" aria-hidden="true">'+(option.id===selected.id?'✓':'')+'</span></button>').join('');
    const guide=providerGuide(selected.provider),conditions=[...new Set([...(selected.conditions||[]),...(row.conditions||[])].filter(Boolean))];
    const previewEntry=Object.values(window.DegreeCoursePlanView.build(preview.draft,courseCatalog).groups).flat().find(entry=>entry.requirementIds.includes(id));
    const previewCourseLink=previewEntry?.courseUrl?'<p class="sheet-preview-course-link">'+providerLink(previewEntry.courseUrl,'Open this course at '+(selected.provider==='University'?program.school:selected.provider),selected.provider)+'</p>':previewEntry?.providerUrl?'<p class="sheet-preview-course-link">'+providerLink(previewEntry.providerUrl,previewEntry.providerLinkLabel,selected.provider)+'</p>':'';
    const selectedDetails='<details class="sheet-comparison-details"><summary>Pricing, assessments & sources</summary>'+(guide?.priceNote?'<h3>Provider pricing</h3><p>'+esc(guide.priceNote)+'</p>':'<p>A current price quote for this option is still needed.</p>')+(guide?.assessmentNote?'<h3>Assessment guidance</h3><p>'+esc(guide.assessmentNote)+'</p>':'<p>Confirm the current assessments and any proctoring directly with the provider.</p>')+(conditions.length?'<h3>Transfer conditions</h3><ul>'+conditions.map(condition=>'<li>'+esc(condition)+'</li>').join('')+'</ul>':'')+'<p>'+(safeURL(selected.url)?link(selected.url,'Transfer / course reference'):'')+(safeURL(guide?.url)?' · '+link(guide.url,'Provider information'):'')+'</p></details>';
    const isCurrent=selected.id===currentId;
    const portability=selected.provider!=='University'?'<a class="sheet-portability" href="compare-plans.html?course='+encodeURIComponent(selected.code||selected.id)+'&amp;provider='+encodeURIComponent(selected.provider)+'">Check this course against other degrees →</a>':'';
    $('sheet-dialog-content').innerHTML=heading+comparisonImpact(preview)+'<div class="sheet-comparison-options" aria-label="Available course options">'+cards+'</div>'+previewCourseLink+(selected.evidence==='conditional'&&selected.provider!=='University'?'<p class="sheet-comparison-review"><span aria-hidden="true">●</span> Review the documented eligibility conditions for this course.</p>':'')+'<div class="sheet-comparison-apply"><button type="button" class="button primary" data-apply-course="'+esc(id)+'" data-option="'+esc(selected.id)+'"'+(!preview.allowed||isCurrent?' disabled':'')+'>'+(isCurrent?'Already in my plan':'Use this course')+'</button><button type="button" class="button ghost" data-row="'+esc(id)+'">Current course details</button></div>'+portability+selectedDetails;
    const active=$('sheet-dialog-content').querySelector('[data-preview-row][aria-pressed="true"]');
    if(optionId)active?.focus({preventScroll:true});
  }
  function applyComparedCourse(id,optionId) {
    if(!comparisonPreview||comparisonPreview.programId!==program?.id||comparisonPreview.requirementId!==id||comparisonPreview.optionId!==optionId)throw Error('Preview this course again before saving it.');
    const latest=comparePreview(id,optionId,null);
    if(!latest.allowed)throw Error(latest.reason||'This course choice needs review.');
    changeCourse(id,optionId);compareCourses(id,optionId);announce('Course added to your plan. Your original learning records are unchanged.');
  }

  function sourceCreditLabel(item) {return Number.isFinite(item.credits)&&item.credits>0?item.credits+' '+(item.creditSystem==='competency-unit'?'competency units':['semester','quarter'].includes(item.creditSystem)?item.creditSystem+' credits':'credits · units need checking'):'Credit details need checking';}
  function priorQuestionDialog() {
    dialogRow=null;
    openDialog('<h2>Have you finished any college courses?</h2><p>Include college classes, credit exams and training that could count toward your degree.</p><div class="sheet-actions"><button type="button" class="button primary" data-prior-choice="some">Add past courses</button><button type="button" class="button secondary" data-prior-choice="none">I have no completed credits yet</button><button type="button" class="button ghost" data-prior-choice="later">Do this later</button></div><p>Your saved and in-progress courses stay in <a href="courses.html">My courses</a>.</p><p id="sheet-prior-error" role="alert"></p>','My past courses');
  }
  function creditsDialog(editId,showForm=false) {
    // The upload page's "I don't have past college courses" / "I'll add them later" arrive here as
    // ?task=credits&prior=none|later and record the same choice as the past-course question, then return
    // to the plan. If the choice cannot be saved, the question stays open with the reason.
    const priorChoice=!editId&&!showForm&&['none','later'].includes(query.get('prior'))?query.get('prior'):'';
    if(priorChoice){priorQuestionDialog();void choosePriorCredits(priorChoice).catch(error=>{const node=$('sheet-prior-error');if(node)node.textContent=error.message;else announce(error.message);});return;}
    if(!editId&&query.get('manual')!=='1'){location.assign('import-courses.html?from='+(['courses','compare'].includes(query.get('from'))?query.get('from'):'plan'));return;}
    if(!editId&&!showForm&&query.get('manual')!=='1'&&!state.learning.some(record=>record.status==='earned')){priorQuestionDialog();return;}
    const legacyRecords=state.learning.filter(x=>x.status!=='saved');
    dialogRow=null;const item=state.learning.find(x=>x.id===editId)||{provider:'',code:'',title:'',credits:'',creditSystem:null,status:'earned',completedOn:''};
    openDialog('<h2>Add your own courses</h2><p>Keep saved interests in <a href="courses.html">My courses</a>. Add completed coursework, training or records here. Only specific course matches or school evaluations can fill degree rows.</p><div class="sheet-actions">'+'<a class="button ghost small" href="import-courses.html">Upload transcript or spreadsheet</a>'+'</div>'+(legacyRecords.length?'<div>'+legacyRecords.map(x=>'<div class="sheet-record"><strong>'+esc(x.title)+'</strong><small>'+esc(x.provider)+' · '+esc(sourceCreditLabel(x))+' · '+esc({earned:'Finished','in-progress':'Taking',planned:'Not started',saved:'Not started'}[x.status]||x.status)+'</small><div class="sheet-actions"><button type="button" class="button ghost small" data-edit-learning="'+esc(x.id)+'">Edit</button><button type="button" class="button ghost small" data-remove-learning="'+esc(x.id)+'">Remove</button></div></div>').join('')+'</div>':'')+'<h3>'+(editId?'Edit record':'Add a record')+'</h3><form id="sheet-learning-form" data-record-id="'+esc(editId||'')+'">'+field('provider','Original school or provider',item.provider,'text','required maxlength="120" list="sheet-provider-list"')+'<datalist id="sheet-provider-list">'+sources.map(s=>'<option value="'+esc(s.name)+'">').join('')+'<option value="Sophia"><option value="Study.com"><option value="StraighterLine"><option value="CLEP"></datalist>'+field('code','Original course / exam code',item.code,'text','maxlength="100"')+field('title','Course / learning title',item.title,'text','required maxlength="160"')+field('credits','Source credits (if known)',item.credits,'number','min="0.1" max="200" step="0.1"')+select('creditSystem','Credit units',[['','I’m not sure yet'],['semester','Semester credits'],['quarter','Quarter credits'],['competency-unit','Competency units']],item.creditSystem||'')+select('status','Status',[['earned','Completed'],['in-progress','In progress'],['planned','Planned'],['saved','Saved interest']],item.status)+field('completedOn','Completion date (if known)',item.completedOn,'date')+'<details class="sheet-detail"'+(item.grade||item.score!==undefined&&item.score!==null&&item.score!==''?' open':'')+'><summary>Grade or exam score (optional)</summary>'+field('grade','Grade (if known)',item.grade,'text','maxlength="10" placeholder="For example, B or Pass"')+field('score','Exam score (if known)',item.score,'number','min="0" max="1000" step="0.1"')+'<p>Use the result shown on your record. Some requirements have a minimum grade or exam score.</p></details><p>These are your records. School-confirmed placements are added separately from the relevant degree row.</p><button class="button" type="submit">Save record</button></form>','My course records');
  }
  async function choosePriorCredits(choice) {
    if(read(KEY)===null)throw Error('Your saved plan could not be read. Your courses have not been changed.');
    const before=latestPlanState();await ensureRouteModels(catalog.pathways.find(route=>route.id===(before.selectedPathwayId||before.profile.pathwayId)));
    const latest=storedPlan();let next=Journey.setPriorCredits(latest.state,choice);
    if(choice==='later'&&window.DegreeChecklist){const draft=Journey.buildDraft(next,catalog,models),checklist=DegreeChecklist.build(draft.state,draft);const gather=checklist.tasks.find(item=>item.id==='gather-records');if(checklist.valid&&gather?.canSetStatus)next=DegreeChecklist.apply(draft.state,draft,{type:'set-task',taskId:gather.id,status:'waiting',planContext:checklist.planContext});}
    const serialized=JSON.stringify(next);try{if(savedRaw()!==latest.raw)throw changedDraft();localStorage.setItem(KEY,serialized);storageBaseline=serialized;}catch(error){if(error.code==='draft_changed')throw error;throw Error('This choice could not be saved. Your previous plan and courses are unchanged.');}
    state=next;render();
    if(choice==='some')creditsDialog(null,true);else{closeDialog();announce(choice==='none'?'Starting from zero saved. Your saved courses are unchanged.':'Past courses set aside for now. Your plan stays provisional.');}
  }
  document.addEventListener('click',event=>{
    if(event.target.closest?.('a[data-school-email="open"]'))growth('school_email',{action:'open'});
    const fold=event.target.closest?.('[data-phone-fold]');
    if(fold?.dataset?.phoneFold){const group=fold.dataset.phoneFold,open=!phoneFolds.has(group);if(open)phoneFolds.add(group);else phoneFolds.delete(group);fold.setAttribute('aria-expanded',String(open));$('sheet-workspace')?.classList.toggle('phone-open-'+group,open);return;}
    const jump=event.target.closest?.('[data-jump-courses]');
    if(jump?.dataset&&'jumpCourses' in jump.dataset){const grid=$('sheet-grid');if(!grid)return;event.preventDefault();grid.scrollIntoView?.({block:'start'});grid.focus({preventScroll:true});}
  });
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-prior-choice]');if(!button)return;button.disabled=true;try{await choosePriorCredits(button.dataset.priorChoice);}catch(error){const node=$('sheet-prior-error');if(node)node.textContent=error.message;else announce(error.message);}finally{if(button.isConnected)button.disabled=false;}});
  let importRevision=0,importedSource='';
  function clearImportPreview() {
    imported=[];importedSource='';importRevision++;
    if($('sheet-import-preview'))$('sheet-import-preview').innerHTML='';
    $('sheet-import-form')?.querySelector('[role="alert"]')?.remove();
    return importRevision;
  }
  function importDialog() {
    clearImportPreview();
    location.assign('import-courses.html?from='+(['courses','compare'].includes(query.get('from'))?query.get('from'):'plan'));
  }
  const readyPlanRoutes=()=>DegreeProgramCatalog.publishedPlans?.(catalog,models)||[];
  // Change degree lists the same plans as the finder: published plans plus complete plans that still
  // need school confirmation (labelled). Without the plan index only published plans are listed.
  // Preference-based recommendations (readyPlanCatalog) stay with published plans.
  const changeDegreeRoutes=()=>DegreeProgramCatalog.planLibraryRoutes?.(catalog,models,planIndex)||readyPlanRoutes();
  const needsConfirmation=route=>Boolean(DegreeProgramCatalog.needsSchoolConfirmation?.(route,planIndex));
  const confirmBadge='<span class="portal-tier-badge portal-tier-confirm">Needs school confirmation</span>';
  const readyPlanCatalog=()=>({...catalog,pathways:readyPlanRoutes()});
  function hasCoursePlan(route){return DegreeProgramCatalog.isPlanAvailable(route,catalog,models);}
  function degreeOptionsFor(school){return changeDegreeRoutes().filter(route=>route.school===school).sort((a,b)=>Number(hasCoursePlan(b))-Number(hasCoursePlan(a))||a.title.localeCompare(b.title));}
  function degreeOptionLabel(route){return route.title+(needsConfirmation(route)?' · Needs school confirmation':route.modelId?' · Course plan available':hasCoursePlan(route)?' · Choose study format':' · Requirements only');}
  function targetDialog(initialId){
    const initial=catalog.pathways.find(route=>route.id===initialId)||pathway,routes=changeDegreeRoutes(),schools=[...new Set(routes.map(route=>route.school))].sort(),school=schools.includes(initial.school)?initial.school:schools[0],degrees=degreeOptionsFor(school),selected=degrees.some(route=>route.id===initial.id)?initial.id:degrees[0]?.id;
    const schoolOptions=schools.map(name=>{const count=routes.filter(route=>route.school===name).length;return[name,name+' · '+count+' plan'+(count===1?'':'s')];});
    openDialog('<h2>Choose a ready-to-use plan</h2>'+(routes.length?'<form id="sheet-target-form">'+select('school','University',schoolOptions,school)+select('pathwayId','Degree',degrees.map(route=>[route.id,needsConfirmation(route)?route.title+' · Needs school confirmation':route.title]),selected)+'<div id="sheet-target-readiness" role="status"></div><button class="button" type="submit">Review degree</button></form>':'<p>No ready-to-use plans could be loaded. Your current plan is unchanged.</p>')+(plan?'<p>Your current plan stays open until you choose its replacement.</p>':'')+'<div class="sheet-detail"><a class="button secondary" href="request-plan.html">Build from a degree link →</a> <a href="programs.html">Browse ready-to-use plans</a></div>','Choose a ready-to-use degree plan');
    if(routes.length)targetReadiness();
  }
  function preferenceLabel(value){return({online:'online study',campus:'on-campus study',essential:'in-person classes',open:'flexible classroom attendance','any-degree':'earning a degree','career-growth':'career advancement','change-career':'changing careers',teacher:'teacher preparation',lawyer:'preparing for a legal career',pilot:'professional flight training','health-professional':'health-profession qualification'})[value]||String(value||'not specified');}
  function targetIssueText(issue){if(issue.field==='goal')return 'Your goal is '+preferenceLabel(issue.current)+'. This program has not been established as preparation for that profession.';if(issue.field==='classroomImportance')return 'You require in-person classes. This program is online.';return issue.title+': you selected '+preferenceLabel(issue.current)+'. This program offers '+(issue.allowedValues?.length?issue.allowedValues.map(preferenceLabel).join(' or '):preferenceLabel(issue.required))+'.';}
  let targetReadinessRevision=0;
  async function targetReadiness(){
    const form=$('sheet-target-form'),node=$('sheet-target-readiness');if(!form||!node)return;
    const route=catalog.pathways.find(item=>item.id===form.elements.pathwayId.value),submit=form.querySelector('button[type=submit]'),ticket=++targetReadinessRevision;
    submit.disabled=true;submit.textContent='Loading course plan…';node.innerHTML='<p role="status">Loading course plan…</p>';form.dataset.formatChoice='false';delete form.dataset.discoveredRouteId;
    try{
      await ensureRouteModels(route);if(!form.isConnected||ticket!==targetReadinessRevision)return;
      if(!hasCoursePlan(route)){submit.textContent='Choose another plan';node.innerHTML='<p>This template is not ready to use. Your current plan is unchanged.</p><a class="button secondary" href="request-plan.html">Build from a degree link →</a>';return;}
      const preview=degreeCandidate(latestPlanState(),route),issues=preview?.targetIssues||[],formatOnly=issues.length&&issues.every(issue=>['modality','classroomImportance'].includes(issue.field))&&route.modalities?.length===1;
      submit.disabled=Boolean(!preview?.plan&&!formatOnly);submit.textContent=formatOnly?'Use '+(route.modalities.includes('online')?'online':'on-campus')+' and build plan':issues.length?'Preferences need review':'Build course plan';form.dataset.formatChoice=String(Boolean(formatOnly));
      const openPoints=needsConfirmation(route)?Sheet.schoolQuestions(planIndex,route.id).length:0;
      node.innerHTML=(needsConfirmation(route)?'<p class="portal-tier">'+confirmBadge+'</p>'+(openPoints?'<p>The course plan is complete, but '+openPoints+' point'+(openPoints===1?' is':'s are')+' not yet confirmed in the school’s published rules. Ask the school before paying for outside courses.</p>':''):'')+'<p><strong>'+(issues.length?'Review your study preferences':'Full course plan available')+'</strong><br>'+esc(issues.length?issues.map(targetIssueText).join(' '):'Your saved courses will be matched to this degree. Transfer choices still need school confirmation.')+'</p>'+(issues.length&&!formatOnly?'<p><a href="portal.html?view=edit">Review my preferences</a></p>':'')+(route.sources?.[0]?.url?'<p>'+link(route.sources[0].url,'View official degree source')+'</p>':'');
    }catch(error){if(!form.isConnected||ticket!==targetReadinessRevision)return;node.innerHTML='<p>'+esc(error.message)+'</p><p>Your current plan and courses are unchanged.</p>';submit.textContent='Choose another plan';}
  }
  function targetPreferencesDialog(){openDialog('<h2>Preferences for this degree</h2><p>'+esc(pathway.title)+'</p><form id="sheet-target-preferences-form">'+select('goal','What is this degree for?',[['any-degree','Earn a degree'],['career-growth','Advance my career'],['change-career','Change careers'],['teacher','Become a teacher'],['lawyer','Prepare for a legal career'],['pilot','Become a pilot'],['health-professional','Enter a health profession']],state.profile.goal)+select('modality','Study format',[['any','Flexible'],['online','Online'],['campus','On campus']],state.profile.modality)+select('classroomImportance','In-person classes',[['open','Flexible'],['preferred','Preferred'],['essential','Required for me']],state.profile.classroomImportance)+'<button class="button primary" type="submit">Save preferences and build plan</button></form>','Preferences for this degree');}
  function chooseDialog() {
    dialogRow=null;const p={...state.profile,...(state.sheet.isExample?{field:'any',modality:'any'}:{})};openDialog('<h2>Find a degree that fits</h2><p>Your goal comes first. We will keep career requirements and classroom preferences in view.</p><form id="sheet-choose-form">'+select('goal','What do you want the degree to do?',[['any-degree','Open doors — any eligible degree'],['career-growth','Advance my career'],['change-career','Change careers'],['teacher','Become a teacher'],['lawyer','Prepare for a legal career'],['pilot','Become a pilot'],['health-professional','Enter a health profession']],p.goal)+select('degreeLevel','Degree level',[['unsure','Help me choose'],['associate','Associate'],['bachelor','Bachelor’s'],['master','Master’s'],['doctorate','Doctoral'],['specialist','Specialist']],p.degreeLevel)+select('modality','Where do you want to study?',[['any','Flexible'],['online','Online'],['campus','On campus']],p.modality)+select('field','Subject',Sheet.subjectChoices(p.field,planIndex),p.field)+select('classroomImportance','Classroom preference',[['open','Flexible'],['preferred','Some classroom time preferred'],['essential','In-person learning is essential']],p.classroomImportance)+select('militaryStatus','Military connection',[['none','None'],['active','Active duty'],['veteran','Veteran'],['reserve','Reserve / National Guard'],['dependent','Military family member']],p.militaryStatus)+select('priority','What matters most?',['balanced','transfer','speed','cost'].map(x=>[x,labels[x]]),p.priority)+'<button class="button" type="submit">Show my routes</button></form><div id="sheet-recommendations"></div><details class="sheet-detail"><summary>Build my own degree plan</summary><form id="sheet-custom-form">'+field('school','School','', 'text','required maxlength="120"')+field('degree','Exact degree / major','', 'text','required maxlength="160"')+'<button class="button secondary" type="submit">Build my own plan →</button></form></details>','Choose a degree');
  }
  function optionsDialog() {
    const s=settings(),providers=[...new Set(program?.requirements.flatMap(r=>r.options.map(o=>o.provider))||[])].filter(p=>p!=='University');
    const sourceChoices='<div class="sheet-checklist">'+providers.map(p=>'<label><input type="checkbox" name="providers" value="'+esc(p)+'"'+(s.providers.includes(p)?' checked':'')+'><span>'+esc(p)+'</span></label>').join('')+'</div>';
    const military='<details class="sheet-detail"><summary>Military learning</summary>'+select('militaryStatus','Military connection',[['none','None'],['active','Active duty'],['veteran','Veteran'],['reserve','Reserve / National Guard'],['dependent','Military family member']],state.profile.militaryStatus)+select('militaryRecords','Service education record',[['not-sure','Not sure yet'],['jst','Joint Services Transcript'],['ccaf','CCAF / Air University'],['other','Another service record']],state.profile.militaryRecords)+'<p><a href="https://jst.doded.mil/jst/" target="_blank" rel="noopener">Get a JST</a> · <a href="https://www.airuniversity.af.edu/Barnes/CCAF/" target="_blank" rel="noopener">CCAF transcript information</a></p></details>';
    const waiver=program?.transferWaiverVariant?'<label class="sheet-checklist"><span><input type="checkbox" name="useWaivers"'+(s.useWaivers?' checked':'')+'> Include Liberty’s qualifying-transfer waiver scenario. School approval is required; waived requirements earn no credits.</span></label>':'';
    openDialog('<h2>Course preferences</h2><p class="sheet-options-scope">These choices apply to this plan only'+(pathway?.title?': <strong>'+esc(pathway.title)+'</strong>':'')+'. Other saved plans keep their own course sources.</p><form id="sheet-options-form">'+select('priority','Prioritize',[['balanced','Time and cost'],['speed','Fewer university terms'],['cost','Lower modeled cost'],['transfer','Take more courses outside my university']],state.profile.priority)+'<h3>Course sources for this plan</h3>'+sourceChoices+'<label class="sheet-checklist"><span><input type="checkbox" name="allowConditional"'+(s.allowConditional?' checked':'')+'> Include conditional transfer matches.</span></label>'+waiver+select('proctoringPreference','Proctored exams',[['open','Include exams'],['avoid','Prefer to avoid']],state.profile.proctoringPreference)+'<p>Unknown assessment formats still need checking with the provider.</p>'+military+'<details class="sheet-detail"><summary>Catalog version for community reports</summary>'+field('reportCatalogYear','Catalog year or version',reportYear(),'text','required placeholder="2026-2027" maxlength="9"')+'</details><div class="sheet-dialog-footer"><div class="sheet-unapplied" data-unapplied hidden><p role="alert">You have unapplied changes to this plan’s course preferences. Apply them, or discard them and close.</p><button type="button" class="button secondary" data-discard-options>Discard changes</button></div><button class="button primary" type="submit">Apply preferences</button></div></form>','Course preferences');
    const form=$('sheet-options-form');if(form)form.dataset.initial=optionsSnapshot(form);
  }
  // Course preferences only change the plan on Apply. Closing with unapplied changes asks first
  // instead of silently discarding them; a second close (or Discard) discards.
  function optionsSnapshot(form){return JSON.stringify([...new FormData(form).entries()]);}
  function unappliedOptions(){const form=$('sheet-dialog').open&&$('sheet-options-form');return Boolean(form&&form.dataset.initial!==undefined&&optionsSnapshot(form)!==form.dataset.initial);}
  function requestCloseDialog(){
    const form=$('sheet-options-form'),prompt=form?.querySelector('[data-unapplied]');
    if(prompt&&prompt.hidden&&unappliedOptions()){prompt.hidden=false;form.querySelector('[data-discard-options]').focus({preventScroll:true});return;}
    closeDialog();
  }
  function focusOptionsTrigger(){
    const trigger=[...$('sheet-workspace').querySelectorAll('[data-action="options"]')].find(node=>node.offsetParent!==null&&!node.closest('dialog'));
    if(trigger)trigger.focus({preventScroll:true});else{const status=$('sheet-status');status.setAttribute('tabindex','-1');status.focus({preventScroll:true});}
  }
  function sourcesDialog() {
    openDialog('<h2>Explore credit sources</h2><p>Start with the sources your school allows, then find courses that fill named requirements. ACE recommends credit; the receiving university decides what applies.</p><label class="sheet-field"><span>Find a provider or credit method</span><input type="search" id="sheet-source-search" placeholder="StraighterLine, Saylor, military…"></label><div id="sheet-source-list">'+sourcesHTML('')+'</div>','Transfer credit sources');
  }
  function sourcesHTML(term) {return sources.filter(s=>[s.name,s.kind,s.creditBasis,s.summary].join(' ').toLowerCase().includes(term.toLowerCase())).map(s=>{const canonical=({sophia:'Sophia','study-com':'Study.com',saylor:'Saylor',clep:'CLEP',dsst:'DSST',tecep:'TECEP'})[s.id]||s.name,mapped=program?.requirements.some(r=>r.options.some(o=>o.provider===canonical));return '<div class="sheet-detail"><strong>'+esc(s.name)+'</strong><p>'+esc(s.creditBasis||s.kind)+' · '+esc(s.summary)+'</p><p>'+esc(s.pace||'')+' '+esc(s.priceNote||'')+'</p><p>'+esc(s.assessmentNote||'')+'</p><p>'+link(s.url,'Provider & course information')+'</p><small>'+esc(mapped?'Course choices are mapped for this worksheet; check each row’s conditions.':'Provider research available. Exact matches for this degree are not yet loaded.')+'</small><details><summary>Sources · checked '+esc(sourceChecked)+'</summary>'+s.evidence.map(e=>'<p>'+link(e.url,e.title)+'</p>').join('')+'</details></div>';}).join('')||'<p>No matching sources are loaded.</p>';}
  function checksDialog() {
    if(!plan){openDialog('<h2>Degree research is incomplete</h2><p>DegreeSteps has not established a complete course plan for this degree yet. Your goal and saved courses are preserved.</p><a class="button primary" href="request-plan.html">Research a degree link</a>','Degree research');return;}
    const errors=[...new Map([...(plan.validation.errors||[]),...(plan.setupIssues||[])].map(item=>[item.message,item])).values()];
    const residency=plan.coverage.derivedInstitutionMinimum??plan.coverage.publishedInstitutionMinimum;
    const source=(program.sources||[]).find(source=>source.id===(program.residencyPolicy?.sourceIds||[])[0]);
    const facts='<p>'+plan.coverage.mappedExternalCredits+' outside '+(program.creditSystem==='competency-unit'?'competency units':'credits')+' planned.'+(Number.isFinite(residency)&&!program.policyUnknowns?.residency?' The published residency rule requires at least '+residency+' '+unitWord(residency)+' at the university'+(plan.coverage.derivedInstitutionMinimum?' including the additional capstone':'')+'.'+(Sheet.residencyAlternative(program,residency)?' '+esc(Sheet.residencyAlternative(program,residency).text):''):'')+(source?' '+link(source.url,'Read the residency policy'):'')+'</p>';
    const personal=(plan.personalTasks||[]).map(item=>'<li>'+esc(item.message||item.text||item.title)+'</li>').join('');
    openDialog('<h2>'+(errors.length?'Plan research and exceptions':'Your plan checks')+'</h2>'+courseChoiceUpdateNotice()+facts+(errors.length?'<p>DegreeSteps is researching these specific items. They are separate from your course progress.</p><ul>'+errors.map(e=>'<li>'+esc(e.message)+'</li>').join('')+'</ul>':'<p>The course counts and published policy checks fit this plan.</p>')+(personal?'<h3>Your records</h3><ul>'+personal+'</ul>':'')+'<div class="sheet-options">'+visiblePlanRows().filter(review).map(r=>'<button type="button" class="sheet-option" data-row="'+esc(r.requirementId)+'"><span><strong>'+esc(r.title)+'</strong><small>'+esc(r.status==='reported'?'Finished course: official evaluation pending':r.selectionRequired?'Choose a specific course':r.option?.evidence==='conditional'?'Review the eligibility condition for this option':'Review this course choice')+'</small></span></button>').join('')+'</div>','Your plan checks');
  }
  function nextDialog() {
    const actions=guidance.nextActions?.length?guidance.nextActions:plan?.nextActions||[],conflict=plan&&(!plan.validation.academicCountsValid||plan.setupIssues.some(i=>['invalid_selection','selection_conflict'].includes(i.code)));
    const title=conflict?'Resolve the conflicting choices':'Your next three steps';
    openDialog('<h2>'+title+'</h2><p>'+esc(conflict?'Some choices cannot be used together. Review those rows before relying on the plan.':plan?'Start with the selected courses below. Each course shows its source, degree placement and any specific eligibility conditions.':'DegreeSteps needs a complete, sourced requirement list before recommending courses for this degree.')+'</p>'+(plan?'<div class="sheet-review-summary"><strong>'+plan.coverage.mappedExternalCredits+' outside '+unitWord(plan.coverage.mappedExternalCredits)+' planned</strong>'+(plan.coverage.conditionalExternalCredits?'<span>'+plan.coverage.conditionalExternalCredits+' credits have eligibility conditions</span>':'')+(plan.totals.reported?'<span>'+plan.totals.reported+' finished credits await an official evaluation</span>':'')+'</div>':'')+'<ol>'+actions.slice(0,3).map(t=>'<li>'+esc(typeof t==='string'?t:t.text||t.title)+'</li>').join('')+'</ol>'+(plan?.validation.errors.length?button('checks','See specific plan issues','secondary'):'')+'<details><summary>Career, military & study guidance</summary>'+(guidance.militaryNotes?.length?'<ul>'+guidance.militaryNotes.map(t=>'<li>'+esc(typeof t==='string'?t:t.text)+'</li>').join('')+'</ul>':'')+(guidance.careerNotes?.length?'<ul>'+guidance.careerNotes.map(t=>'<li>'+esc(typeof t==='string'?t:t.text)+'</li>').join('')+'</ul>':'')+'<p>'+esc(guidance.tips?.[0]?.text||'Choose courses that reduce what remains in your degree.')+'</p></details><div class="sheet-detail">'+button('download','Download this plan')+'</div>','Your next steps');
  }
  function moreDialog() {
    openDialog('<h2>Plan tools</h2><div class="sheet-options">'+button('credits','Add past coursework','secondary')+button('choose','Change goal or study preferences','secondary')+'<a class="button secondary" href="portal.html?view=about">My goals, past courses and military details</a>'+button('options','Course preferences','secondary')+button('cost-time','Cost and study pace','secondary')+button('download','Download / print','secondary')+button('share','Share plan','secondary')+'<a class="button secondary" href="plan.html'+(simplePlan()?'?editor=1':'')+'">'+(simplePlan()?'Detailed worksheet':'Course list')+'</a></div>','Plan tools');
  }
  function baseline() {return {profile:clone(state.profile),selectedPathwayId:state.selectedPathwayId,scenarios:clone(state.scenarios),externalCredits:plan?.coverage.mappedExternalCredits??null,confirmedCredits:plan?.totals.confirmed??null,modeledSubtotal:plan?.costs.modeledSubtotal??null,scenarioWeeks:plan?.timing.scenarioWeeks??null,school:pathway.school,title:pathway.title,savedAt:new Date().toISOString()};}
  function compareDialog() {const b=state.baseline,d=plan?Sheet.compareBaseline(state,plan):null,delta=(n,u)=>n==null?'Not comparable':(n>0?'+':'')+Math.round(n*10)/10+' '+u;openDialog('<h2>What if I change my plan?</h2><p>Save this version, then change a school, course or source directly in the worksheet. Your learning records stay the same.</p>'+(b?'<div class="sheet-baseline"><strong>Saved: '+esc(b.school+' · '+b.title)+'</strong><div class="sheet-delta"><span>'+esc(delta(d?.externalCredits,'outside credits'))+'</span><span>'+esc(delta(d?.modeledSubtotal,'USD in partial modeled costs'))+'</span><span>'+esc(delta(d?.scenarioWeeks,'estimated weeks'))+'</span></div></div>':'<p>No comparison version saved yet.</p>')+'<div class="sheet-actions">'+button('save-baseline','Save current version','primary')+(b?button('restore-baseline','Restore saved choices'):'')+'</div><p>Cost differences use your assumptions and may exclude tuition, fees, housing or providers without current prices. Estimated weeks are not a promised graduation date.</p>','Compare plan versions');}
  function costTimeDialog() {
    if(!plan||!program){openDialog('<h2>Cost & time</h2><p>Add this degree’s requirements before estimating its courses.</p><a class="button primary" href="'+esc(auditURL())+'">Add requirements</a>','Cost and time assumptions');return;}
    const current={state,pathway,program,plan,match,input,guidance},price=DegreePlanComparison.remainingCosts(current,state,{});
    openDialog('<h2>Cost & timing</h2><div id="sheet-cost-summary">'+DegreeCostAssumptions.summary(price,plan.timing)+'</div>'+DegreeCostAssumptions.render(current,settings()),'Cost and time assumptions');
    const summary=$('sheet-cost-summary'),ticket=costSummaryEpoch;
    Promise.all([comparisonData().catch(()=>null),researchedEstimate(current)]).then(([data,estimate])=>{
      if(ticket!==costSummaryEpoch||!currentEstimate(current,summary)||!$('sheet-dialog').open||$('sheet-cost-summary')!==summary)return;
      const view=window.DegreePlanEstimateView;
      if(view?.available(estimate)&&!view.hasPersonalAssumptions(personalEstimateSettings(current)))summary.innerHTML=view.render(estimate);
      else if(data)summary.innerHTML=DegreeCostAssumptions.summary(DegreePlanComparison.remainingCosts(current,current.state,data),current.plan.timing);
    }).catch(()=>{/* Personal quotes remain usable while published tuition sources are unavailable. */});
  }
  function download(content,name,type) {const a=document.createElement('a'),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function share() {if(!plan)return announce('This outline needs a course map before it can be shared as a course plan.');if(!plan.validation.academicCountsValid||plan.setupIssues.some(i=>['invalid_selection','selection_conflict'].includes(i.code)))return checksDialog();const proposed=Sheet.publicPlan(program,{...plan,rows:plan.rows.filter(row=>progressRecord(row)?.status!=='in-progress')},pathway,state.profile.priority);if(!proposed)return announce('No proposed courses are available to share. Completed records stay private.');closeDialog();const origin=state.templateOrigin?.context||'',original=/^post:[A-Za-z0-9_-]{1,120}$/.test(origin)?location.origin+'/community.html?tab=feed&post='+encodeURIComponent(origin.slice(5)):/^template:seed-[A-Za-z0-9_-]+$/.test(origin)?location.origin+'/community.html?tab=templates&template='+encodeURIComponent(origin.slice(9)):'';window.DegreeCommunity?.sharePlan({plan:proposed,title:pathway.title+' · proposed route',body:original?'Adapted from a shared DegreeSteps route: '+original+'\nProposed curriculum; confirm your own school evaluation.':''});}
  function discuss(course) {let context='program:'+(program?.id||pathway.id),title=pathway.school+' · '+pathway.title;if(course){context='course:'+(slug(course.provider)+'-'+slug((course.codeAliases||[]).find(x=>/^SOPH-/i.test(x))||course.code||course.id)).slice(0,160);title=course.provider+' · '+course.title;}closeDialog();window.DegreeCommunity?.openThread({context,title});}
  async function communityEntry() {
    const params=new URLSearchParams(location.search),previous=clone(state);let route,publicPlan,title,context,strategy;
    try {if(params.has('template')){const r=await fetch('data/community-templates.json');if(!r.ok)throw Error('Starter unavailable.');const data=await r.json(),starter=data.templates.find(x=>x.id===params.get('template'));if(!starter)throw Error('Starter not found.');route=catalog.pathways.find(x=>x.id===starter.pathwayId);title=starter.title;context='template:'+starter.id;strategy=starter.strategy;}
      else if(params.has('shared')){const id=params.get('shared');if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Error('Invalid shared plan.');const data=await DegreeCommunity.api('/posts/'+encodeURIComponent(id));publicPlan=DegreeCommunity.safePlan(data.item?.plan);if(!publicPlan)throw Error('No reusable course plan is attached.');route=catalog.pathways.find(x=>x.modelId===publicPlan.programId||x.id===publicPlan.programId);title=data.item.title;context='post:'+id;strategy=publicPlan.strategy;}
      else return;
      if(!route)throw Error('This exact degree does not have a ready-to-use template yet.');await ensureRouteModels(route);if(!hasCoursePlan(route))throw Error('This template is not ready to use. Build your own plan from its official requirements.');state=Sheet.selectPathway(state,route);state.profile.priority=['balanced','speed','cost','transfer'].includes(strategy)?strategy:'balanced';state.templateOrigin={title,context,pathwayId:route.id};
      await ensureRouteModels(route);
      if(publicPlan){const m=models.find(x=>x.id===route.modelId);let selections={},unmatched=0;for(const c of publicPlan.courses){const req=m?.requirements.find(x=>x.id===c.requirementId),o=req?.options.find(x=>x.id===c.courseId&&x.provider===c.provider&&x.credits===c.credits);if(o)selections[req.id]=o.id;else unmatched++;}state.scenarios={...state.scenarios,[m?.id||route.id]:{...Sheet.scenario(state,m?.id||route.id),optionSelections:selections}};state.templateOrigin.unmatchedChoices=unmatched;}
      announce('Opened '+title+' as proposed choices. Your completed learning is unchanged.');
    }catch(e){state=previous;announce('Could not open this community plan: '+e.message+' Your saved worksheet is intact.');}
  }
  function handleAction(action) {
    if(action==='update-course-choices'){courseChoiceUpdateDialog();return;}
    if(action==='keep-course-choices'){courseUpdateReview=null;closeDialog();return;}
    if(action==='all-tasks'){const panel=$('sheet-task-panel');if(panel){panel.open=true;panel.scrollIntoView?.({block:'start'});panel.querySelector('summary')?.focus();}return;}
    if(action==='refresh-saved'){void refreshSavedPlan();return;}
    if(action==='copy-school-email'){const email=studentSchoolEmail();if(!email)return;const text='Subject: '+email.subject+'\n\n'+email.body;Promise.resolve().then(()=>navigator.clipboard.writeText(text)).then(()=>{announce('Email copied. Paste it into a new message to the school.');growth('school_email',{action:'copy'});},()=>announce('Copying is blocked in this browser. Use “Email the school these questions” instead.'));return;}
    if(action==='hide-school-check'||action==='show-school-check'){const hide=action==='hide-school-check';setSchoolCheckHidden(pathway?.id,hide);renderSchoolCheck(hide?'show-school-check':'hide-school-check');announce(hide?'School questions hidden.':'School questions shown.');return;}
    if(action==='compare-plans'){storedPlan();location.assign('compare-plans.html');return;}
    if(action==='backup'){const latest=storedPlan();download(JSON.stringify(latest.raw===storageBaseline?state:latest.state,null,2),'degreesteps-private-backup.json','application/json');announce('Private backup downloaded.');return;}
    if(action==='available-plans'){openDialog(availablePlansHTML(),'Available course plans');return;}if(action==='target-preferences'){targetPreferencesDialog();return;}if(action==='more')moreDialog();else if(action==='target'){if(planIndex)targetDialog();else void loadPlanIndex().then(()=>targetDialog());}else if(action==='credits')creditsDialog();else if(action==='choose')location.assign('portal.html?view=setup');else if(action==='sources')sourcesDialog();else if(action==='options')optionsDialog();else if(action==='checks')checksDialog();else if(action==='next')nextDialog();else if(action==='cost-time')costTimeDialog();else if(action==='compare')compareDialog();else if(action==='import')importDialog();else if(action==='share')share();else if(action==='discussion')discuss();else if(action==='course-discussion'){const row=plan.rows.find(r=>r.requirementId===dialogRow);if(row?.option)discuss(reqFor(row).options.some(o=>o.id===row.option.id)?row.option:null);}else if(action==='save-note'){state=Sheet.setNote(state,program.id,dialogRow,$('sheet-row-note').value);save();announce('Private note saved.');closeDialog();}else if(action==='use-example'){state.sheet.isExample=false;render();announce('This degree is now your draft.');}else if(action==='save-baseline'){state.baseline=baseline();save();compareDialog();announce('Comparison version saved.');}else if(action==='restore-baseline'){const b=state.baseline;state.profile=clone(b.profile);state.selectedPathwayId=b.selectedPathwayId;state.scenarios=clone(b.scenarios);state.sheet.isExample=false;closeDialog();render();announce('Saved choices restored. Learning records are unchanged.');}else if(action==='download'){openDialog('<h2>Download my plan</h2><p>Take the worksheet to an advisor, or keep a private backup of your records.</p><div class="sheet-options">'+(plan?button('csv','Worksheet CSV','primary'):'')+button('backup','Private backup (JSON)')+button('print','Print / save PDF')+'</div><p>The worksheet CSV excludes private notes. The private backup includes your learning and notes; keep it for your own use.</p>','Download my plan');}else if(action==='csv'){download(Sheet.exportCSV(program,{...plan,rows:visiblePlanRows().map(row=>progressRecord(row)?.status==='in-progress'?{...row,status:'in-progress'}:row)}),'degreesteps-worksheet.csv','text/csv;charset=utf-8');announce('Worksheet CSV downloaded.');}else if(action==='print'){closeDialog(true);window.print();if(task)handleAction('download');}else if(action==='import-confirm'){if(!imported.length||importedSource!==$('sheet-import-form')?.elements.csv.value)throw Error('Preview your current CSV before importing.');const count=imported.length;state=Sheet.mergeLearning(state,imported);if(state.journey)state.journey.creditsDeferred=false;clearImportPreview();render();closeDialog();announce(count+' source records imported. School approval was not assumed.');}
  }
  function changeCourse(id,optionId) {if(obsoleteCourseSelections().some(item=>item.requirementId===id)){try{assertCurrentDraft();const next=Sheet.setCourse(archiveCourseChoices(),program.id,id,optionId);next.sheet.isExample=false;saveCourseChoiceUpdate(next);}catch(error){error.code=error.code||'course_update_failed';throw error;}}else{state=Sheet.setCourse(state,program.id,id,optionId);state.sheet.isExample=false;render();}announce('Course choice updated. Totals recalculated; open checks show any conflicts.');}
  document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{if(b.hasAttribute('data-source-retry')){await targetReadiness('',true);}else if(b.id==='close-sheet-dialog-review'){closeDialog();}else if(b.dataset.confirmOutline){if(await choose(customGoal&&customGoal.id===b.dataset.confirmOutline?customGoal:b.dataset.confirmOutline,false,true))closeDialog();}else if(b.dataset.recoveryOpen){if(await choose(b.dataset.recoveryOpen,true))closeDialog();}else if(b.dataset.progressFilter){progressFilter=['completed','in-progress','not-started'].includes(b.dataset.progressFilter)?b.dataset.progressFilter:'all';state.sheet.filter='all';if(b.dataset.clearSearch)state.sheet.search='';render();document.querySelector('.degree-progress [data-progress-filter="'+progressFilter+'"]')?.focus({preventScroll:true});announce(progressFilter==='all'?'Showing all courses.':'Showing '+({'completed':'finished','in-progress':'in-progress','not-started':'not-started'}[progressFilter])+' courses.');}else if(b.dataset.planningVariant){await choose(b.dataset.planningVariant,true);}else if(b.dataset.targetFormat){state.profile.modality=b.dataset.targetFormat;if(b.dataset.targetFormat==='online'&&state.profile.classroomImportance==='essential')state.profile.classroomImportance='open';state.journey={...state.journey,planReviewed:false,schoolContacted:false,answers:{...state.journey?.answers,format:state.profile.modality}};render();}else if(b.dataset.simpleUse){const preview=comparePreview(b.dataset.simpleUse,b.dataset.option,null);if(!preview.allowed)throw Error(preview.reason);changeCourse(b.dataset.simpleUse,b.dataset.option);closeDialog();}else if(b.dataset.outcomeRow){const row=plan.rows.find(r=>r.requirementId===b.dataset.outcomeRow);if(row?.option)DegreeEvidence.open(evidenceTarget(row),{title:row.option.provider+' · '+row.option.title+' → '+(reqFor(row).categoryLabel||row.code)});}else if(b.id==='close-sheet-dialog')requestCloseDialog();else if(b.hasAttribute('data-discard-options'))closeDialog();else if(b.dataset.action)handleAction(b.dataset.action);else if(b.dataset.priority){state.profile.priority=b.dataset.priority;render();announce(labels[b.dataset.priority]+' priority applied. Your selected courses stay fixed.');}else if(b.dataset.compareRow)compareCourses(b.dataset.compareRow);else if(b.dataset.previewRow)compareCourses(b.dataset.previewRow,b.dataset.option);else if(b.dataset.applyCourse)applyComparedCourse(b.dataset.applyCourse,b.dataset.option);else if(b.hasAttribute('data-cancel-progress-correction'))closeDialog(true);else if(b.dataset.row)rowDialog(b.dataset.row);else if(b.dataset.selectRow){const id=b.dataset.selectRow;changeCourse(id,b.dataset.option);rowDialog(id);}else if(b.dataset.resetRow){const id=b.dataset.resetRow;changeCourse(id,'');rowDialog(id);}else if(b.dataset.route){if(await choose(b.dataset.route))closeDialog();}else if(b.dataset.editLearning)creditsDialog(b.dataset.editLearning);else if(b.dataset.removeLearning){const id=b.dataset.removeLearning;openDialog('<h2>Remove this learning record?</h2><p>This removes the original source and its school-specific placements from your private draft.</p><button type="button" class="button" data-confirm-remove="'+esc(id)+'">Remove record</button>','Remove learning record');}else if(b.dataset.confirmRemove){state.learning=state.learning.filter(x=>x.id!==b.dataset.confirmRemove);render();creditsDialog();announce('Record removed; plan recalculated.');}else if(b.dataset.complete){const row=plan.rows.find(r=>r.requirementId===b.dataset.complete);state=Sheet.recordProgress(state,program,reqFor(row),row.option,'completed');render();rowDialog(row.requirementId);announce('Course recorded as completed. Placement is pending school evaluation.');}}catch(e){announce(e.message);}});
  document.addEventListener('change',async event=>{const el=event.target;try{if(el.closest('#sheet-target-form')&&el.name==='school'){const rows=degreeOptionsFor(el.value);el.form.elements.pathwayId.innerHTML=opts(rows.map(route=>[route.id,degreeOptionLabel(route)]),rows[0]?.id);targetReadiness();}else if(el.closest('#sheet-target-form')&&el.name==='pathwayId'){targetReadiness();}else if(el.closest('#sheet-target-form')&&el.name==='sourceVariantId'){if(el.value)targetReadiness(el.value);}else if(el.closest('#sheet-target-form')&&el.name==='variantId'){el.form.querySelector('button[type=submit]').disabled=!el.value;}else if(el.id==='sheet-school'){const p=readyPlanRoutes().find(p=>p.school===el.value);if(p)await choose(p.id);}else if(el.id==='sheet-degree')await choose(el.value);else if(el.id==='sheet-filter'){state.sheet.filter=el.value;progressFilter='all';render();}else if(el.dataset.provider){const choices=Planner.availableOptions(program,el.dataset.provider,input).filter(x=>x.provider===el.value);if(choices.length)changeCourse(el.dataset.provider,choices[0].id);}else if(el.dataset.course)changeCourse(el.dataset.course,el.value);else if(el.dataset.progress){const id=el.dataset.progress,row=plan.rows.find(r=>r.requirementId===id);if(!row)throw Error('Open this course again before changing its progress.');assertCurrentDraft();const record=progressRecord(row);if(['planned','in-progress'].includes(el.value)&&record){if(record.evaluations?.some(evaluation=>evaluation.status==='confirmed')){progressCorrectionDialog(row,record,el.value);return;}applyProgressCorrection(row,record,el.value);}else if(el.value!=='planned'&&!['reported','confirmed'].includes(row.status)){state=Sheet.recordProgress(state,program,reqFor(row),row.option,el.value);state.sheet.isExample=false;}render();if($('sheet-dialog').open&&dialogRow===id){if(record&&el.value!=='completed'&&progressRecord(plan.rows.find(candidate=>candidate.requirementId===id))?.id!==record.id)closeDialog(true);else rowDialog(id);}announce(el.value==='completed'?'Completed course saved. You can change its progress at any time.':'Progress updated. Your course remains in My courses.');}else if(el.id==='sheet-csv-file'){const ticket=clearImportPreview(),box=$('sheet-import-form').elements.csv,file=el.files[0];box.value='';if(file){if(file.size>100000)throw Error('Use a CSV smaller than 100 KB.');const raw=await file.text();if(ticket===importRevision&&box.isConnected)box.value=raw;}}}catch(e){announce(e.message);if(e.code==='course_update_failed'){try{render({persist:false});}catch{}}else if(e.code!=='draft_changed'){try{render();}catch{}}}});
  document.addEventListener('toggle',event=>{const node=event.target;if(node.isConnected&&node.matches?.('[data-plan-section],[data-plan-subsection]'))sectionOpen.set(node.dataset.planSection||node.dataset.planSubsection,node.open);},true);
  document.addEventListener('input',event=>{try{if(event.target.closest('#sheet-import-form')&&event.target.name==='csv')clearImportPreview();else if(event.target.id==='sheet-search'){state.sheet.search=event.target.value;save();renderGrid();}else if(event.target.id==='sheet-source-search')$('sheet-source-list').innerHTML=sourcesHTML(event.target.value);}catch(error){announce(error.message);}});
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.id.startsWith('sheet-')&&form.id!=='confirm-placement')return;event.preventDefault();const data=new FormData(form);try{
      if(form.id==='sheet-target-form'){const route=catalog.pathways.find(route=>route.id===(form.dataset.discoveredRouteId||data.get('variantId')||data.get('pathwayId')));if(await choose(route.id,Boolean(data.get('variantId'))||form.dataset.formatChoice==='true'))closeDialog();}else if(form.id==='sheet-target-preferences-form'){const goal=data.get('goal');state.profile={...state.profile,goal,modality:data.get('modality'),classroomImportance:data.get('classroomImportance')};const licensed=['teacher','lawyer','pilot','health-professional'].includes(goal);state.journey={...state.journey,planReviewed:false,schoolContacted:false,answers:{...state.journey?.answers,purpose:licensed?'licensed-career':goal,career:licensed?goal:undefined,format:state.profile.modality}};closeDialog();render();}else if(form.id==='sheet-learning-form'){const item=Object.fromEntries(data);item.credits=String(item.credits||'').trim()?num(item.credits):null;item.creditSystem=item.creditSystem||null;if(form.dataset.recordId)item.id=form.dataset.recordId;state=Sheet.updateLearning(state,item);state.sheet.isExample=false;if(state.journey&&item.status==='earned')state.journey.creditsDeferred=false;render();if(item.status==='saved'&&saveOK){location.assign('courses.html');return;}creditsDialog();announce('Learning saved. Exact matches are provisional until the school confirms.');}
      else if(form.id==='sheet-import-form'){clearImportPreview();imported=Sheet.parseCSV(data.get('csv'));importedSource=form.elements.csv.value;$('sheet-import-preview').innerHTML='<h3>'+imported.length+' records to import</h3><div class="sheet-csv-preview"><table><thead><tr><th>Provider</th><th>Course</th><th>Credits</th><th>Status</th></tr></thead><tbody>'+imported.map(x=>'<tr><td>'+esc(x.provider)+'</td><td>'+esc(x.code+' · '+x.title)+'</td><td>'+x.credits+' '+esc(x.creditSystem)+'</td><td>'+esc(x.status)+'</td></tr>').join('')+'</tbody></table></div>'+button('import-confirm','Import reviewed records','primary');}
      else if(form.id==='sheet-choose-form'){state.profile={...state.profile,...Object.fromEntries(data),entry:'explore',school:'',schoolChoice:'',degree:'',pathwayId:''};save();await loadPlanIndex();const subjectCatalog=()=>Sheet.attachRouteSubjects(readyPlanCatalog(),planIndex);await ensureRouteModels(Guide.recommend(state.profile,subjectCatalog(),models,state.learning).map(result=>result.pathway).filter(hasCoursePlan));const recommendations=Guide.recommend(state.profile,subjectCatalog(),models,state.learning).filter(c=>c.eligible!==false).slice(0,3);$('sheet-recommendations').innerHTML='<h3>Routes for your choices</h3>'+(recommendations.length?'<div class="sheet-options">'+recommendations.map((c,i)=>'<button type="button" class="sheet-option" data-route="'+esc(c.pathway.id)+'"><span><strong>'+(i===0?'Recommended: ':'Alternative: ')+esc(c.pathway.school)+'</strong>'+esc(c.pathway.title)+'<small>'+esc(c.pathway.modelId?'Course-level draft available':'Researched outline; course map pending')+'</small><small>'+esc(c.reasons.slice(0,2).join(' '))+'</small></span></button>').join('')+'</div>':'<p>No researched route matches all these choices yet. We have kept your goal. Adjust a preference or enter your exact target below.</p>');}
      else if(form.id==='sheet-custom-form'){const school=String(data.get('school')||'').trim(),title=String(data.get('degree')||'').trim();if(!school||!title)throw Error('Enter your school and exact degree name.');location.assign(auditURL({school,title}));}
      else if(form.id==='sheet-options-form'){const y=Sheet.catalogYear(data.get('reportCatalogYear'));if(!y)throw Error('Use the exact catalog year or version, such as 2026-2027 or 202605.');// Choices from a source the student just turned off (or a proctored source when avoiding proctoring) can no longer be used:
        // clear them so the planner picks the best available course, and say what changed.
        const nextProviders=data.getAll('providers'),avoidProctoring=data.get('proctoringPreference')==='avoid',proctored=['CLEP','DSST','Saylor','StraighterLine'];
        const selections={...(settings().optionSelections||{})},replaced=new Map(),replacedIds=[];
        for(const req of program?.requirements||[]){const option=(req.options||[]).find(item=>item.id===selections[req.id]);if(option&&option.provider&&option.provider!=='University'&&(!nextProviders.includes(option.provider)||avoidProctoring&&proctored.includes(option.provider))){delete selections[req.id];replacedIds.push(req.id);replaced.set(option.provider,(replaced.get(option.provider)||0)+1);}}
        updateSettings({reportCatalogYear:y,providers:nextProviders,allowConditional:data.has('allowConditional'),useWaivers:data.has('useWaivers'),optionSelections:selections});state.profile.proctoringPreference=data.get('proctoringPreference');if(data.has('priority'))state.profile.priority=data.get('priority');if(data.has('militaryStatus'))state.profile.militaryStatus=data.get('militaryStatus');if(data.has('militaryRecords'))state.profile.militaryRecords=data.get('militaryRecords');replacedRows=new Set(replacedIds);closeDialog();render();focusOptionsTrigger();const replacedCount=[...replaced.values()].reduce((sum,n)=>sum+n,0);announce('Course preferences applied to this plan.'+(replacedCount?' '+replacedCount+' course choice'+(replacedCount===1?'':'s')+' from '+[...replaced.keys()].join(' and ')+(replacedCount===1?' was':' were')+' replaced with the best available option'+(replacedCount===1?'':'s')+'. '+(replacedCount===1?'It is':'They are')+' marked “Updated” in the course plan.':''));}
      else if(form.id==='sheet-cost-form'){const latest=storedPlan(),fresh=latest.state,next=Journey.buildDraft(fresh,catalog,models);if(next.program?.id!==program?.id)throw Error('Your degree changed in another tab. Reopen My plan before editing its estimates.');const values=DegreeCostAssumptions.parse(data,next,Sheet.scenario(fresh,next.program.id));state=next.state;storageBaseline=latest.raw;updateSettings(values);render();costTimeDialog();announce('Estimates updated. Your courses and transfer decisions are unchanged.');}
      else if(form.id==='sheet-placement-form'){const id=form.dataset.requirement;state=Sheet.assignLearning(state,program,data.get('recordId'),id,{confirmation:data.has('confirmation')});state.sheet.isExample=false;render();rowDialog(id);announce(data.has('confirmation')?'School-specific placement recorded from your evaluation.':'Existing learning placed provisionally. School confirmation is still pending.');}
      else if(form.id==='sheet-course-update-form'){applyCourseChoiceUpdate();}
      else if(form.id==='sheet-progress-correction-form'){const pending=progressCorrection;if(!pending)throw Error('Open the course progress control again.');if(!data.has('confirm'))throw Error('Confirm the course correction before continuing.');assertCurrentDraft();const row=plan.rows.find(candidate=>candidate.requirementId===pending.requirementId),record=state.learning.find(candidate=>candidate.id===pending.recordId);if(!row||!record)throw Error('The course changed. Reopen its latest details.');applyProgressCorrection(row,record,pending.progress,{confirmation:true,expectedRecord:pending.snapshot});progressCorrection=null;render();if(pending.returnToCourse&&progressRecord(plan.rows.find(candidate=>candidate.requirementId===pending.requirementId))?.id===pending.recordId)rowDialog(pending.requirementId);else closeDialog(true);announce('Progress corrected. The course is still in My courses; its old credit placements were cleared.');}
      else if(form.id==='confirm-placement'){if(!data.has('confirm'))return;const id=dialogRow,row=plan.rows.find(r=>r.requirementId===id),record=progressRecord(row);if(!record||record.status!=='earned')throw Error('Save the original completed source record first.');state=Sheet.updateLearning(state,record,{confirmation:true,confirmCurrentProgram:{programId:program.id,requirementId:id,...(reqFor(row).options.some(o=>o.id===row.option?.id)?{optionId:row.option.id}:{})}});render();rowDialog(id);announce('School-specific placement confirmed from your evaluation.');}
    }catch(e){let error=form.querySelector('[role="alert"]');if(!error){error=document.createElement('p');error.setAttribute('role','alert');form.append(error);}error.textContent=e.message;}
  });
  document.addEventListener('degreepath:evidence-updated',()=>loadOutcomes(true));
  window.addEventListener('beforeprint',()=>{printView=true;renderGrid();});window.addEventListener('afterprint',()=>{printView=false;renderGrid();});
  function observeSavedChange(event={}) {
    if(!state||!catalog||event.type==='storage'&&event.key!==KEY&&event.key!==null)return;
    try{if(savedRaw()!==storageBaseline){externalNotice('Your plan changed in another window. The latest saved work is safe.');void refreshSavedPlan();}}
    catch(error){externalNotice(error.message);}
  }
  for(const type of ['storage','focus','pageshow'])window.addEventListener(type,observeSavedChange);
  window.addEventListener('DegreeSteps:leads-ready',()=>renderSchoolCheck());
  async function boot() {
    try {const response=await fetch('data/pathways.json');if(!response.ok)throw Error('Could not load the preloaded degree research.');catalog=await response.json();try{catalog=await DegreeProgramCatalog.load(catalog);}catch{/* Exact free-text targets remain available when directory is unavailable. */}models=DegreeProgramCatalog.loadModels?await DegreeProgramCatalog.loadModels([]):await Promise.all(DegreeProgramCatalog.modelFiles.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Could not load the preloaded degree research.');return r.json();}));try{const r=await fetch('data/credit-sources.json');if(r.ok){const data=await r.json();sources=data.sources||[];sourceChecked=data.checkedOn||'';}}catch{/* core worksheet still works without optional source catalog */}
      try{const r=await fetch('data/course-catalog.json');if(r.ok)courseCatalog=await r.json();}catch{/* Provider directories remain available when exact course links cannot load. */}
      const raw=savedRaw();let stored;if(raw!==null){try{stored=JSON.parse(raw);}catch{throw Error('Your saved plan could not be read. It has not been replaced.');}if(stored?.version!==3||!stored.profile||typeof stored.profile!=='object'||Array.isArray(stored.profile)||!Array.isArray(stored.learning))throw Error('Your saved plan needs recovery. It has not been replaced.');}storageBaseline=raw;attachPrivateCurricula(stored);state=Journey.initialize(raw,read('degreepath-pathway-v2'),catalog);await ensureRouteModels(catalog.pathways.find(route=>route.id===(state.selectedPathwayId||state.profile?.pathwayId)));await communityEntry();if(savedRaw()!==storageBaseline&&!await refreshSavedPlan())return;const hasTarget=Boolean(state.selectedPathwayId||state.profile.pathwayId||state.profile.school&&state.profile.degree);if(!hasTarget&&task!=='credits'){save();location.replace('portal.html');return;}render();void loadPlanIndex();if(task){const back=query.get('from')==='courses'?'Back to My courses':query.get('from')==='compare'&&task==='cost-time'?'Back to comparisons':'Back to my plan';$('close-sheet-dialog').textContent='← '+back;$('close-sheet-dialog').setAttribute('aria-label',back);handleAction(task);}else if(query.get('share')==='1')share();else if(query.has('compare'))compareCourses(query.get('compare'));else if(query.has('course'))rowDialog(query.get('course'));
    }catch(e){$('sheet-loading').hidden=true;$('sheet-error').hidden=false;$('sheet-error').textContent=e.message+' Reload to try again. Your saved records have not been deleted.';console.error(e);}
  }
  boot();
}());
