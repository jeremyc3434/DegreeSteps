/* A guided front door to the same private degree worksheet. No runtime AI. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), Journey = window.DegreeJourney, Sheet = window.DegreeSheet;
  const KEY = 'degreepath-guide-v3';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const backIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
  let state, catalog, models, draft, saveOK = true, page = 'home', degreePreview = null, activePlanState = null;
  const pendingDiscoveries=new Map();
  function attachPrivateCurricula(value) {
    catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,value);
    if(window.AuditCurriculum)catalog=AuditCurriculum.attach(catalog,value);
    const all=new Map((models||[]).map(model=>[model.id,model]));
    [...DegreeProgramCatalog.sourceModels(value),...(window.AuditCurriculum?AuditCurriculum.models(value):[])].forEach(model=>all.set(model.id,model));models=[...all.values()];
  }
  function auditURL(target) {const route=target.route;return AuditCurriculum.launchURL({school:route?.school||state.profile.school,degree:route?.title||target.degree||state.profile.degree,programId:route?.id||state.selectedPathwayId,level:route?.level||state.profile.degreeLevel,modality:route?.modalities?.length===1?route.modalities[0]:state.profile.modality,creditSystem:route?.creditSystem,sourceUrl:route?.url||officialSource(route)?.url,catalog:route?.catalog});}
  function discoveryReason(result) {return result?.reason||result?.reasons?.[0]?.message||'The official requirements need a degree audit before a plan can be built.';}
  function targetChanged(previous,next) {return (previous.selectedPathwayId||previous.profile?.pathwayId)!==(next.selectedPathwayId||next.profile?.pathwayId)||key(previous.profile?.school)!==key(next.profile?.school)||key(previous.profile?.degree)!==key(next.profile?.degree);}
  function assertPreviousPlanSaved(previous,next) {
    const id=previous.selectedPathwayId||previous.profile?.pathwayId;if(!id||!targetChanged(previous,next)||previous.sheet?.isExample)return;
    const draft=Journey.buildDraft(previous,catalog,models),historyId=DegreeProgramCatalog.planHistoryId(previous,draft),rows=previous.whatIf?.snapshots||[];if(rows.length>=20&&!rows.some(row=>row.id===historyId))throw Error('Your saved versions are full. Download a private backup or remove an old version in Compare plans before changing degrees.');
  }
  const read = name => {try {return localStorage.getItem(name);} catch {return null;}};
  function routeHasMap(route) {
    return DegreeProgramCatalog.isPlanAvailable(route,catalog,models);
  }
  const availableRoutes = () => DegreeProgramCatalog.availablePlans(catalog,models);
  const availableCatalog = () => ({...catalog,pathways:availableRoutes()});
  async function ensureRouteModels(routes) {
    const list=(Array.isArray(routes)?routes:[routes]).filter(Boolean).flatMap(route=>[route,...DegreeProgramCatalog.variants(route,catalog)]),wanted=list.filter(route=>route.modelId&&!models.some(model=>model.id===route.modelId));
    if(!wanted.length||!DegreeProgramCatalog.modelsForRoutes)return;
    const loaded=await DegreeProgramCatalog.modelsForRoutes(wanted,{includeLegacy:false}),all=new Map((models||[]).map(model=>[model.id,model]));
    loaded.forEach(model=>all.set(model.id,model));models=[...all.values()];
  }
  async function previewDegree(route,extra={}) {
    const target={route,sourceRoute:extra.sourceRoute||route,...extra,loading:true};degreePreview=target;render();
    try {
      if(!routeHasMap(route)){target.loading=false;target.unavailable=true;render();return;}
      await ensureRouteModels(route);
      if(!routeHasMap(route)){target.loading=false;target.unavailable=true;render();return;}
      if(!routeHasMap(route)&&DegreeProgramCatalog.discover){
        target.discovery=await DegreeProgramCatalog.discover(target.sourceRoute,{variant:target.variant,force:target.force});
        if(degreePreview!==target)return;
        if(target.discovery.status==='ready'){
          catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,{sourceCurricula:[target.discovery]});
          pendingDiscoveries.set(target.discovery.route.id,target.discovery);target.route=catalog.pathways.find(item=>item.id===target.discovery.route.id);
          const all=new Map(models.map(model=>[model.id,model]));all.set(target.discovery.model.id,target.discovery.model);models=[...all.values()];
        }
      }else if(pendingDiscoveries.has(route.id))target.discovery=pendingDiscoveries.get(route.id);
      if(degreePreview===target){target.loading=false;render();}
    }catch(error){if(degreePreview===target){target.loading=false;target.loadError=error.message;render();}}
  }
  async function prepareRecommendations() {
    const eligible=Journey.recommend(state,availableCatalog(),models).map(result=>result.pathway).filter(routeHasMap);
    await ensureRouteModels(eligible);
  }
  function actualMappedTarget(value) {
    if (!value || value.sheet?.isExample) return false;
    const id=value.selectedPathwayId||value.profile?.pathwayId;
    return routeHasMap((catalog?.pathways||[]).find(route=>route.id===id||route.modelId===id));
  }
  function actualSavedTarget(value) {
    if (!value || value.sheet?.isExample) return false;
    return Boolean((value.selectedPathwayId||value.profile?.pathwayId)&&value.profile?.school&&value.profile?.degree);
  }
  function latestStoredPlan() {
    const raw=localStorage.getItem(KEY);if(!raw)return null;
    let value;try{value=JSON.parse(raw);}catch{throw Error('Your saved plan could not be read. It has not been replaced.');}
    if(value?.version!==3||!value.profile||!Array.isArray(value.learning))throw Error('Your saved plan needs recovery. It has not been replaced.');
    return value;
  }
  function selectionState() {
    const saved=latestStoredPlan();if(!saved){if(activePlanState)throw Error('Your saved plan is unavailable. Keep this page open and download a private backup.');return state;}
    attachPrivateCurricula(saved);if(actualSavedTarget(saved)&&state.journey?.view==='questions')activePlanState=clone(saved);
    // Use the latest private collection and choices while retaining this setup's
    // explicit target preferences. Another tab's course edits must survive.
    return {...clone(saved),profile:clone(state.profile),journey:clone(state.journey),selectedPathwayId:state.selectedPathwayId};
  }
  function save() {
    let protectedEdit=false;
    try {
      const previous=latestStoredPlan();
      protectedEdit=Boolean(state.journey?.view==='questions'&&(activePlanState||actualSavedTarget(previous)));
      if(protectedEdit){if(!previous)throw Error('Saved plan unavailable');activePlanState=clone(previous);}
      else {
        if(previous&&state.journey?.view==='questions')state={...clone(previous),profile:clone(state.profile),journey:clone(state.journey),selectedPathwayId:state.selectedPathwayId};
        if(previous){
          for(const field of ['learning','customCurricula','auditDrafts','checklist','accountRestoreReview']){if(Object.hasOwn(previous,field))state[field]=clone(previous[field]);else delete state[field];}
          state.sheet={...state.sheet,notes:clone(previous.sheet?.notes||{})};
          if(previous.whatIf)state.whatIf=clone(previous.whatIf);
        }
        if(previous&&actualSavedTarget(previous)&&targetChanged(previous,state)){
          assertPreviousPlanSaved(previous,state);const remembered=DegreeProgramCatalog.rememberPlan(previous,Journey.buildDraft(previous,catalog,models));
          if(remembered.whatIf?.snapshots)state.whatIf={...remembered.whatIf,...state.whatIf,snapshots:remembered.whatIf.snapshots};
        }
        localStorage.setItem(KEY,JSON.stringify(state));
        activePlanState=actualSavedTarget(state)?clone(state):null;
      }
      saveOK=true;
    }catch{saveOK=false;}
    if(!protectedEdit||!saveOK)window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:saveOK}}));
    $('portal-saved').textContent=saveOK?(protectedEdit?'Your current plan stays saved while you compare degrees.':'Your progress is saved on this device.'):'Device storage is unavailable. Download a private backup from your course plan before leaving.';
  }
  function announce(message) {$('portal-notice').textContent = message;}
  function button(action, label, secondary = false) {return '<button type="button" class="portal-' + (secondary ? 'secondary' : 'primary') + '" data-action="' + action + '">' + esc(label) + '</button>';}
  function choice(value, title, detail = '') {
    const current = state.journey.answers[state.journey.step];
    return '<button type="button" class="portal-choice" data-answer="' + esc(typeof value === 'object' ? JSON.stringify(value) : value) + '"' + (typeof value === 'object' ? ' data-object="true"' : '') + ' aria-pressed="' + (JSON.stringify(current) === JSON.stringify(value)) + '"><span><strong>' + esc(title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</span><span aria-hidden="true">→</span></button>';
  }
  function choices(items) {return '<div class="portal-choices">' + items.map(item => choice(...item)).join('') + '</div>';}
  const goalChoices = [['any-degree','Earn a degree'],['career-growth','Advance my career'],['change-career','Change careers'],['teacher','Become a teacher'],['lawyer','Prepare for law'],['pilot','Become a pilot'],['health-professional','Enter a health profession']];
  const fieldChoices = [['any','Any subject'],['business','Business'],['technology','Technology'],['science','Science & mathematics'],['arts','Arts & design'],['humanities','Humanities'],['social-science','Social sciences'],['education','Education'],['health','Health'],['general','General studies']];
  const protectedGoals = ['teacher','lawyer','pilot','health-professional'];
  const chooseField = (name,label,items,value) => '<label class="portal-field"><span>'+esc(label)+'</span><select name="'+name+'">'+items.map(([id,title])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
  function field(name, label, value, extra = '') {
    return '<label class="portal-field"><span>' + esc(label) + '</span><input name="' + name + '" value="' + esc(value) + '" maxlength="' + (name === 'school' ? '120' : '160') + '" required ' + extra + '></label>';
  }
  function exploreBody() {
    const p=state.profile, licensed=protectedGoals.includes(p.goal);
    const format=p.classroomImportance==='preferred'?'some-classroom':p.modality||'any';
    return '<form id="portal-explore-form" class="portal-quick-form">'+
      chooseField('goal','What is the degree for?',goalChoices,p.goal)+
      '<div id="portal-subject-field"'+(licensed?' hidden':'')+'>'+chooseField('field','Subject',fieldChoices,p.field||'any')+'</div>'+
      chooseField('degreeLevel','Degree level',[['unsure','Help me choose'],['associate','Associate'],['bachelor','Bachelor’s'],['master','Master’s'],['doctorate','Doctoral'],['specialist','Specialist']],p.degreeLevel||'unsure')+
      chooseField('format','Where will you study?',[['any','Online or on campus'],['online','Online'],['campus','On campus'],['some-classroom','Some classroom time preferred']],format)+
      chooseField('priority','Main priority',[['speed','Finish sooner'],['cost','Spend less'],['balanced','Balance time and cost'],['transfer','Transfer the most credits']],p.priority||'balanced')+
      (state.profile.school?'<p class="portal-school-filter">At '+esc(state.profile.school)+'</p>':'')+
      '<button class="portal-primary" type="submit">Find course plans</button></form>';
  }
  function aboutBody() {
    const p=state.profile,prior=state.journey.answers?.prior||(state.learning.some(record=>record.status==='earned')?'some':'unknown');
    return '<p class="portal-intro">A few choices help us build around you. You can add your course records later.</p><form id="portal-about-form" class="portal-quick-form">'+
      chooseField('goal','What is the degree for?',goalChoices,p.goal||'any-degree')+
      chooseField('prior','Have you finished any college courses?',[['unknown','I’ll add my courses later'],['none','No, I’m starting from zero'],['some','Yes, I have courses or exam credits'],['degree','Yes, I already have a degree']],prior)+
      chooseField('priority','What matters most?',[['balanced','Balance time and cost'],['speed','Finish sooner'],['cost','Spend less'],['transfer','Use the most transfer credit']],p.priority||'balanced')+
      '<details class="portal-tip"'+(p.militaryStatus&&p.militaryStatus!=='none'?' open':'')+'><summary>Military connection (optional)</summary>'+chooseField('military','Your military connection',[['none','None'],['active','Active duty'],['veteran','Veteran'],['reserve','Reserve / National Guard'],['dependent','Military family member']],p.militaryStatus||'none')+chooseField('militaryRecords','Your service education record',[['not-sure','Help me identify my record'],['jst','Joint Services Transcript (JST)'],['ccaf','CCAF / Air University'],['other','Another service record']],p.militaryRecords||'not-sure')+'<p>We’ll include the relevant records and benefits guidance.</p></details><button class="portal-primary" type="submit">Open my course plan</button></form>';
  }
  function questionBody(id) {
    const p = state.profile;
    switch (id) {
      case 'start': return (state.journey.completed && p.school && p.degree ? '<div class="portal-current-target"><strong>'+esc(p.degree)+'</strong><p>'+esc(p.school)+'</p>'+button('keep-target','Open my plan',true)+'</div>' : '')+choices([
        ['target',state.journey.completed?'Change my degree':'I know my school or degree'],
        ['explore','Help me choose a degree'],
        ['audit','Use courses I already have']
      ])+'<div class="portal-start-browse"><a href="request-plan.html">Build from a degree link →</a></div><div class="portal-start-browse"><a href="degree-audit.html">Build my own plan from scratch →</a></div>'+'<div class="portal-start-browse"><a href="courses.html?tab=browse">Browse transfer courses →</a></div>';
      case 'school': {
        const schools = [...new Set(catalog.pathways.map(r => r.school))].sort();
        return '<form id="portal-question-form">' + field('school','School name',p.school,'list="portal-schools" autocomplete="organization" placeholder="Start typing a school name"') + '<datalist id="portal-schools">' + schools.map(s => '<option value="' + esc(s) + '"></option>').join('') + '</datalist><button class="portal-primary" type="submit">Choose degree</button></form><div class="portal-links"><button type="button" data-answer="unknown">Help me choose a school</button></div>';
      }
      case 'degree': {
        return '<form id="portal-question-form">'+field('degree','Search degrees',p.degree,'type="search" placeholder="Psychology, business, nursing…" autocomplete="off"')+'<button class="portal-secondary" type="submit">Search</button><details class="portal-degree-filter-wrap"><summary>Filter results</summary><div class="portal-degree-filters"><label>Degree level<select id="portal-degree-level"><option value="">All levels</option><option value="associate">Associate</option><option value="bachelor">Bachelor’s</option><option value="master">Master’s</option><option value="doctorate">Doctoral</option><option value="specialist">Specialist</option></select></label><label>Study format<select id="portal-degree-format"><option value="">All formats</option><option value="online">Online</option><option value="campus">On campus</option><option value="unknown">Format unknown</option></select></label></div></details></form><p id="portal-degree-count" class="portal-hint" role="status" aria-live="polite"></p><div id="portal-degree-results"></div><div class="portal-degree-more"></div><details class="portal-tip"><summary>Build my own degree plan</summary><form id="portal-custom-degree-form">'+field('unlistedDegree','Exact degree name','','placeholder="Name from the school’s catalog"')+'<button class="portal-secondary" type="submit">Build my own plan →</button></form></details><div class="portal-links"><button type="button" data-answer="unknown">Help me choose a degree here</button></div>';
      }
      case 'routes': return routesBody();
      case 'about': return aboutBody();
      default:return exploreBody();
    }
  }
  let degreeLimit=20;
  const degreeLevelName={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral',specialist:'Specialist'};
  function renderDegreeOptions(reset=false) {
    const host=$('portal-degree-results');if(!host)return;if(reset)degreeLimit=20;
    const query=key(document.querySelector('#portal-question-form [name="degree"]')?.value),level=$('portal-degree-level').value,format=$('portal-degree-format').value;
    const all=catalog.pathways.filter(r=>key(r.school)===key(state.profile.school));
    const rows=all.filter(r=>(!query||key(r.title).includes(query))&&(!level||r.level===level)&&(!format||format==='unknown'?!format||!r.modalities?.length:r.modalities?.includes(format))).sort((a,b)=>Number(routeHasMap(b))-Number(routeHasMap(a))||a.title.localeCompare(b.title));
    const ready=rows.filter(routeHasMap).length;
    $('portal-degree-count').textContent=rows.length+' degree'+(rows.length===1?'':'s')+' · '+ready+' course plan'+(ready===1?'':'s')+' available';
    host.innerHTML=rows.length?rows.slice(0,degreeLimit).map(r=>{const mapped=routeHasMap(r),href=degreeResearchURL(r),body='<span><strong>'+esc(r.title)+'</strong><small>'+esc(degreeLevelName[r.level]||r.level)+' · '+esc(r.modalities?.length?r.modalities.map(m=>m==='campus'?'On campus':'Online').join(' / '):'Format not yet researched')+'</small><small class="portal-readiness-label">'+(mapped?'Open course plan':href?'Research this degree →':'Degree research needed')+'</small></span><span aria-hidden="true">→</span>';return mapped?'<button type="button" class="portal-degree-option" data-degree-preview="'+esc(r.id)+'">'+body+'</button>':href?'<a class="portal-degree-option" href="'+esc(href)+'">'+body+'</a>':'<div class="portal-degree-option">'+body+'</div>';}).join(''):'<p class="portal-degree-empty">No indexed degree matches. Try a broader search or <a href="request-plan.html">use an official degree link</a>.</p>';
    document.querySelector('.portal-degree-more').innerHTML=rows.length>degreeLimit?'<button type="button" class="portal-secondary" data-action="more-degrees">Show more programs</button>':'';
  }
  function officialSource(route) {
    return (route?.sources||[]).find(source=>/^https:\/\//.test(source.url||'')&&!/degreeforum|reddit|study\.com|sophia\.org/.test(source.url)) || null;
  }
  function degreeResearchURL(route) {try{const url=new URL(route?.url||officialSource(route)?.url);if(url.protocol!=='https:'||url.username||url.password)return '';return 'request-plan.html?source='+encodeURIComponent(url.href);}catch{return '';}}
  function previewSelection(target) {
    let previous=selectionState();
    if(target.explicitFormat&&target.route?.modalities?.length===1){previous=clone(previous);previous.profile.modality=target.route.modalities[0];if(previous.profile.modality==='online'&&previous.profile.classroomImportance==='essential')previous.profile.classroomImportance='open';}
    if(target.discovery?.status==='ready')previous=DegreeProgramCatalog.rememberDiscovery(previous,target.discovery);
    const selected=Journey.applyAnswer(previous,state.journey.step==='routes'?'routes':'degree',target.route?.id||{degree:target.degree,allowUnlisted:true},catalog),resolved=DegreeProgramCatalog.resolveTarget(selected,catalog).state;
    const pending=pendingDiscoveries.get(resolved.selectedPathwayId);
    const ready=pending?DegreeProgramCatalog.rememberDiscovery(resolved,pending):resolved;
    return {state:ready,draft:Journey.buildDraft(ready,catalog,models)};
  }
  function degreeReadinessBody(target) {
    if(target.unavailable){const research=degreeResearchURL(target.route);return '<article class="portal-readiness-card"><h2>Build a plan for this degree.</h2><p>'+esc(target.route?.title||target.degree||'This degree')+' does not have a completed template yet. Your current plan and courses stay saved.</p><div class="portal-actions"><a class="portal-primary" href="'+esc(research||auditURL(target))+'">'+(research?'Research this degree →':'Build my own plan →')+'</a>'+button('degree-search','Browse available course plans',true)+'</div></article>';}
    if(target.loading)return '<article class="portal-readiness-card" aria-busy="true"><h2>'+esc(target.route?.title||'Your degree')+'</h2><p role="status">Checking official degree requirements…</p></article>';
    if(target.loadError)return '<article class="portal-readiness-card"><h2>We could not load these course requirements.</h2><p role="alert">'+esc(target.loadError)+'</p><p>Your saved plan and courses are unchanged.</p>'+button('retry-degree','Try again')+button('degree-search','Choose another degree',true)+'</article>';
    if(target.discovery?.status==='choose-variant')return '<article class="portal-readiness-card"><h2>'+esc(target.route.title)+'</h2><p>Choose the exact university program.</p><div class="portal-choices">'+(target.discovery.variants||[]).map(variant=>'<button type="button" class="portal-choice" data-source-variant="'+esc(variant.id)+'"><span><strong>'+esc(variant.title)+'</strong><small>'+esc((variant.modalities||[]).map(mode=>mode==='online'?'Online':'On campus').join(' / ')||'Confirm study format')+'</small></span><span aria-hidden="true">→</span></button>').join('')+'</div></article>';
    let route=target.route;const choices=DegreeProgramCatalog.variants(route,catalog);const preferred=choices.find(r=>r.modalities.includes(state.profile.modality))||(state.profile.classroomImportance==='essential'?choices.find(r=>r.modalities.includes('campus')):null);
    if(choices.length&&(!preferred||target.chooseFormat))return '<article class="portal-readiness-card"><h2>'+esc(route.title)+'</h2><p>Where will you study? Course requirements can differ by study format.</p><div class="portal-actions">'+choices.map(r=>'<button class="portal-primary" type="button" data-variant-preview="'+esc(r.id)+'">'+(r.modalities.includes('online')?'Online':'On campus')+'</button>').join('')+'</div></article>';
    if(preferred)route=preferred;const source=officialSource(route);
    let proposed=null,error='';try{proposed=previewSelection(target).draft;}catch(e){error=e.message;}
    const mapped=Boolean(proposed?.plan),hasMap=Boolean(proposed?.mapAvailable||routeHasMap(route)),formatOnly=proposed?.targetIssues?.length&&proposed.targetIssues.every(issue=>['modality','classroomImportance'].includes(issue.field)),needsReview=Boolean(error||proposed?.targetReviewNeeded||hasMap&&!mapped),unsupported=!hasMap&&!error;
    const title=route?.title||target.degree,school=route?.school||state.profile.school;
    if(!mapped&&!needsReview&&activePlanState&&target.confirmUnmappedReplacement){
      return '<article class="portal-readiness-card"><span class="portal-readiness-label">Course plan not available</span><h2>Save this goal instead?</h2><p><strong>'+esc(title)+'</strong> at '+esc(school)+' does not have a course-by-course transfer plan yet.</p><p>This will replace '+esc(activePlanState.profile.degree||'your current degree')+' as your active goal. Your courses and notes stay saved.</p><div class="portal-actions">'+button('keep-active-plan','Back to my plan')+button('confirm-unmapped-replacement','Save this goal instead',true)+'</div></article><div class="portal-links">'+button('degree-search','Choose another degree',true)+'</div>';
    }
    const note=error||(proposed?.targetReviewNeeded?'This degree does not match your saved career or study preferences.':hasMap&&!mapped?(proposed?.targetUnknowns||[]).map(issue=>issue.title+'.').join(' ')||'Review the missing program details before building this course plan.':mapped?proposed.plan.coverage.mappedExternalCredits+' proposed transfer credits.'+(DegreeProgramCatalog.planChoiceCount(route,catalog,models)>0?' '+DegreeProgramCatalog.planChoiceCount(route,catalog,models)+' course choices to make.':''):'No course-by-course transfer plan is available for this degree yet.');
    const actions=formatOnly?'<button class="portal-primary" type="button" data-variant-preview="'+esc(route.id)+'">Use '+(route.modalities.includes('online')?'online':'on-campus')+' study</button>':needsReview?button('change-preferences','Update my preferences'):!mapped&&activePlanState?button('keep-active-plan','Back to my plan')+button('request-unmapped-replacement','Save this goal instead',true):button('use-degree',mapped?'Build course plan':'Save goal');
    const opportunitySchool=window.DegreeProgramOpportunities?.schoolFor(catalog,route),programFacts=opportunitySchool?DegreeProgramOpportunities.detailsHTML(route,opportunitySchool):'';
    const formatNote=mapped&&proposed.targetUnknowns?.some(issue=>issue.field==='modality')?'<p class="portal-hint" role="note">Confirm this degree’s study format with the university before enrolling.</p>':'';
    return '<article class="portal-readiness-card"><span class="portal-readiness-label">'+(mapped?'Transfer-course plan':unsupported?'Course plan not available':'Check your preferences')+'</span><h2>'+esc(title)+'</h2><p class="portal-target-school">'+esc(school)+'</p>'+programFacts+formatNote+'<p>'+esc(note)+'</p>'+(source?'<a href="'+esc(source.url)+'" target="_blank" rel="noopener">Official degree information ↗</a>':'')+'<div class="portal-actions">'+actions+'</div></article><div class="portal-links">'+button('degree-search','Choose another degree',true)+'</div>';
  }
  document.addEventListener('input',event=>{if(event.target.matches('#portal-question-form [name="degree"]'))renderDegreeOptions(true);});
  document.addEventListener('change',event=>{if(['portal-degree-level','portal-degree-format'].includes(event.target.id))renderDegreeOptions(true);if(event.target.matches('#portal-explore-form [name=goal]'))$('portal-subject-field').hidden=protectedGoals.includes(event.target.value);});
  function routeCard(result) {
    const r=result.pathway, modeled=routeHasMap(r), choiceCount=DegreeProgramCatalog.planChoiceCount(r,catalog,models), format=(r.modalities||[]).map(m=>m==='campus'?'On campus':'Online').join(' / ');
    let credits='';
    if(modeled){try {const next=Journey.applyAnswer(state,'routes',r.id,catalog), plan=Journey.buildDraft(next,catalog,models).plan;if(plan)credits=plan.coverage.mappedExternalCredits+' proposed transfer credits';}catch{/* A saved constraint is shown on selection. */}}
    return '<article class="portal-route-card"><h2>'+esc(r.title)+'</h2><p class="portal-target-school">'+esc(r.school)+'</p><div class="portal-route-facts"><span>'+esc(format)+'</span><strong>'+esc(credits||'Full requirement plan')+'</strong>'+(choiceCount>0?'<span>'+choiceCount+' course choice'+(choiceCount===1?'':'s')+' to make</span>':'')+'</div><button type="button" class="portal-primary" data-degree-preview="'+esc(r.id)+'">'+(modeled?'See course plan':'See degree')+'</button></article>';
  }
  function routesBody() {
    const eligible=Journey.recommend(state,availableCatalog(),models), mapped=eligible.filter(r=>routeHasMap(r.pathway)).slice(0,3);
    const result=mapped.length?mapped.map(routeCard).join(''):'<div class="portal-empty-result"><h2>No course plan matches yet.</h2><p>'+esc(protectedGoals.includes(state.profile.goal)?'No mapped program currently meets this career and study format.':'The matching degrees do not yet have transfer-course plans.')+'</p>'+'<a class="portal-primary" href="request-plan.html">Build from a degree link →</a>'+'</div>';
    return result+'<div class="portal-links">'+button('change-preferences','Change my choices',true)+'<a href="request-plan.html">Build from a degree link →</a></div>';
  }
  function renderQuestion() {
    if(!['start','school','degree','purpose','routes','about'].includes(state.journey.step))state.journey.step='purpose';
    const id=state.journey.step, heading=degreePreview?'':({start:'Build your course plan.',school:'Choose a school.',degree:'Choose your degree.',purpose:'Find a degree.',routes:'Choose a course plan.',about:'Make this plan yours.'}[id]);
    $('portal-content').innerHTML='<section class="portal-question portal-simple-setup">'+(id!=='start'||degreePreview?'<button class="portal-back" type="button" data-action="back">'+backIcon+'Back</button>':'')+(heading?'<h1 id="portal-question-title" tabindex="-1">'+heading+'</h1>':'<h1 id="portal-question-title" class="screen-reader-only" tabindex="-1">Degree plan availability</h1>')+(id==='degree'&&!degreePreview?'<p class="portal-school-filter">'+esc(state.profile.school)+'</p>':'')+(degreePreview?degreeReadinessBody(degreePreview):questionBody(id))+'<p id="portal-step-error" role="alert"></p></section>';
    if(id==='degree'&&!degreePreview)renderDegreeOptions(true);
  }
  function refreshDraft() {draft = Journey.buildDraft(state,catalog,models); state = draft.state;}
  function updateSavings() {
    const node = $('portal-savings');
    const hasTarget = Boolean(!state.sheet?.isExample && (state.selectedPathwayId || state.profile.pathwayId || state.profile.school && state.profile.degree));
    node.hidden = state.journey.view === 'questions' || page !== 'home' || !hasTarget;
    if (node.hidden || !draft || !window.DegreeSavingsTracker) return;
    window.DegreeSavingsTracker.update(node,state,draft,{onChange:changes => {
      const id = draft.program?.id;
      if (!id) return;
      state.savings = {...state.savings,[id]:{...state.savings?.[id],...changes}};
      state.journey.planReviewed = false; state.journey.schoolContacted = false;
      save(); render(false);
    }});
  }
  function copiedChoicesWarning() {
    const count = state.templateOrigin?.unmatchedChoices || 0;
    return count ? '<div class="portal-notice warning"><strong>' + count + ' shared course choice' + (count === 1 ? '' : 's') + ' need another look.</strong> They no longer match our current catalog. The draft uses current options in those rows. Review the full course plan before relying on this copy.</div>' : '';
  }
  function courseReviewContext() {
    const plan=draft.plan, program=draft.program, rows=plan?.rows||[];
    let missing=[];
    if(plan&&window.DegreeCoursePlanView){try{missing=DegreeCoursePlanView.build(draft).groups.unmapped||[];}catch{missing=rows.filter(row=>!row.option||row.selectionRequired||row.option.selectionRequired);}}
    else if(plan)missing=rows.filter(row=>!row.option||row.selectionRequired||row.option.selectionRequired);
    const conditional=rows.filter(row=>row.status==='planned'&&row.option?.provider!=='University'&&row.option?.evidence==='conditional');
    const unmatched=(draft.match?.unmatched||[]).filter(record=>['earned','in-progress'].includes(record.status));
    const pendingIds=new Set((draft.match?.completed||[]).filter(placement=>rows.some(row=>row.requirementId===placement.requirementId&&row.status==='reported')).map(placement=>placement.learningId));
    const records=state.learning.filter(record=>['earned','in-progress'].includes(record.status)&&(unmatched.some(item=>item.id===record.id)||pendingIds.has(record.id)));
    const policyQuestions=(program?.policyReview||[]).filter(rule=>rule&&typeof rule==='object'&&!['verified','confirmed','resolved','not-applicable'].includes(rule.status));
    const researchBlockers=[...new Map((plan?.researchTasks||[]).filter(task=>task.owner==='DegreePath'&&task.blocking!==false&&!['verified','confirmed','resolved','not-applicable'].includes(task.status)).map(task=>[task.message||task.code,task])).values()];
    return {missing,conditional,unmatched,records,policyQuestions,researchBlockers};
  }
  function schoolFactsHTML() {
    if(!draft.plan||!draft.program)return '';
    const program=draft.program,coverage=draft.plan.coverage||{},facts=[],units=program.creditSystem==='competency-unit'?'competency units':'credits';
    const unknown=field=>Boolean(program.policyUnknowns?.[field])||(program.policyReview||[]).some(rule=>rule.field===field&&!['verified','confirmed','resolved','not-applicable'].includes(rule.status));
    const format=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
    const minimum=Number.isFinite(coverage.derivedInstitutionMinimum)?coverage.derivedInstitutionMinimum:program.institutionMinCredits;
    const ceiling=Number.isFinite(program.externalMaxCredits)?Math.min(program.externalMaxCredits,Number.isFinite(minimum)?program.totalCredits-minimum:program.externalMaxCredits):Number.isFinite(minimum)?program.totalCredits-minimum:null;
    if(Number.isFinite(ceiling)&&!unknown('externalMaxCredits'))facts.push('Transfer limit after residency: up to '+format(ceiling)+' '+units+' that fit this degree.');
    if(Number.isFinite(program.alternativeMaxCredits)&&program.alternativeMaxCredits<ceiling&&!unknown('alternativeMaxCredits'))facts.push('Alternative credit sources share a separate limit of '+format(program.alternativeMaxCredits)+' '+units+'.');
    if(Number.isFinite(coverage.derivedInstitutionMinimum)&&!unknown('residency'))facts.push('University study: at least '+format(coverage.derivedInstitutionMinimum)+' '+units+', including the additional capstone.');
    else if(Number.isFinite(program.institutionMinCredits)&&!unknown('institutionMinCredits')&&!unknown('residency'))facts.push('University study: at least '+format(program.institutionMinCredits)+' '+units+'.');
    if(program.pacePolicy?.transferBeforeInitialTerm===true){const deadline=program.pacePolicy.transcriptDeadline;if(Number.isInteger(deadline?.dayOfMonth)&&deadline.monthsBeforeStart===1)facts.push('Official transcripts are due by day '+deadline.dayOfMonth+' of the month before your start. Finish transfer courses before the first university term.');}
    if(!facts.length)return '';
    const sourceIds=new Set([...(program.policySourceIds||[]),...(program.residencyPolicy?.sourceIds||[])]),source=(program.sources||[]).find(source=>sourceIds.has(source.id)&&/^https:\/\//.test(source.url||''))||officialSource(draft.pathway);
    return '<section class="portal-review-card" aria-label="Published school rules"><h2>School rules already in your plan</h2><ul>'+facts.map(fact=>'<li>'+esc(fact)+'</li>').join('')+'</ul>'+(source?'<p class="portal-source-action"><a href="'+esc(source.url)+'" target="_blank" rel="noopener">Read the published school policy ↗</a></p>':'')+'</section>';
  }
  function reviewPlanBody() {
    const plan = draft.plan, context=courseReviewContext();
    const notes = [];
    if (!plan) notes.push('DegreeSteps still needs this degree’s exact requirements before building its course plan.');
    if (context.missing.length) notes.push('DegreeSteps is researching specific course choices for '+context.missing.length+' open requirements.');
    if (context.conditional.length) notes.push(context.conditional.length+' selected course matches have specific unresolved conditions. Review those courses before paying.');
    if (context.policyQuestions.length) notes.push('DegreeSteps is researching '+context.policyQuestions.length+' school rules still missing from this plan.');
    if (context.researchBlockers.length) notes.push('DegreeSteps is resolving '+context.researchBlockers.length+' specific research items for this plan.');
    if (plan?.validation.academicCountsValid===false) notes.push('Some course choices conflict. Resolve the affected degree requirements before using this plan.');
    if (context.records.length) notes.push(context.records.length+' of your learning records still need an individual evaluation.');
    if (state.journey.creditsDeferred&&state.profile.hasPrior!=='none') notes.push('Add your past courses when you have their records.');
    const ready=plan&&plan.validation.academicCountsValid!==false&&!context.missing.length&&!context.conditional.length&&!context.policyQuestions.length&&!context.researchBlockers.length;
    return '<a class="portal-back" href="plan.html">'+backIcon+'My plan</a><div class="portal-home-heading"><span class="portal-kicker">A quick check</span><h1 id="portal-question-title" tabindex="-1">Review your plan</h1><p>'+esc(draft.pathway.school+' · '+draft.pathway.title)+'</p></div>'+copiedChoicesWarning()+'<section class="portal-review-card"><h2>'+ (plan ? plan.coverage.mappedExternalCredits+' planned transfer credits' : 'Your exact goal is saved')+'</h2><p>'+esc(ready?'Your selected course list is ready. Review what you want to take next.':'Review your selected courses and the specific open items below.')+'</p><div class="portal-actions"><a class="portal-secondary" href="plan.html">Open course plan</a>'+(notes.length?'<a class="portal-text-action" href="plan.html?task=checks">View details</a>':'')+'</div></section>'+(notes.length?'<section class="portal-review-card portal-attention"><h2>Still to resolve</h2><ul>'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></section>':'')+(draft.guidance.careerNotes.length?'<details class="portal-tip"><summary>Requirements for your career</summary><ul>'+draft.guidance.careerNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details>':'')+(draft.guidance.militaryNotes.length?'<details class="portal-tip"><summary>Military opportunities</summary><ul>'+draft.guidance.militaryNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details>':'')+'<div class="portal-actions">'+button('finish-plan-review','I’ve reviewed my plan')+'</div><p class="portal-hint">This saves your review. Completed credit is recorded from your own course records and school evaluations.</p>';
  }
  function transcriptGuidance() {
    const providerId=value=>({sophialearning:'sophia'}[key(value)]||key(value));
    const providers=new Set([...state.learning.map(record=>record.provider),...(draft.plan?.rows||[]).map(row=>row.option?.provider)].filter(Boolean).map(providerId));
    const sources=new Map((draft.program?.sources||[]).map(source=>[source.id,source]));
    const sourceURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
    const instructions=(draft.program?.transcriptInstructions||[]).filter(item=>item&&typeof item.provider==='string'&&typeof item.instruction==='string'&&providers.has(providerId(item.provider)));
    if(!instructions.length)return '';
    const links=new Map();for(const item of instructions)for(const id of item.sourceIds||[]){const source=sources.get(id),url=sourceURL(source?.url);if(url)links.set(url,source.title||'Read transcript instructions');}
    return '<section class="portal-review-card" aria-label="Transcript delivery instructions"><h2>Use the right transcript.</h2><p>Follow these instructions for the providers in your plan.</p><ul class="portal-unmatched-courses">'+instructions.map(item=>'<li><strong>'+esc(item.provider)+'</strong><span>'+esc(item.instruction)+'</span></li>').join('')+'</ul>'+[...links].map(([url,title])=>'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+' ↗</a></p>').join('')+'</section>';
  }
  function schoolBody() {
    const route=draft.pathway, mapped=Boolean(draft.plan), source=officialSource(route);
    const schoolActions={
      'send-transcripts':{title:'Send your official transcripts.',question:'Where should each college, exam provider or training organization send my official records? Please confirm the accepted delivery methods, any required transcript services, fees and processing times for this degree.'},
      'check-application-deadline':{title:'Check your application dates.',question:'What are the application, enrollment and financial-aid deadlines for this exact program and my intended start? Please identify the next available start dates and anything I must submit before then.'},
      'check-transfer-deadline':{title:'Check when transfer work is due.',question:'When must outside courses be completed and official transcripts arrive for this program? Do I need written approval before taking them, and can I transfer additional courses after enrolling?'},
      'enroll-at-school':{title:'Confirm your enrollment steps.',question:'What remains for admission and registration in this program? Please identify required university coursework, available start dates, payment deadlines, mandatory fees and any aid eligibility steps.'},
      'campus-arrangements':{title:'Plan your time on campus.',question:'Which parts of this degree require attendance on campus, and when? Please direct me to the relevant class schedules, housing, transport and student-services information.'},
      'apply-to-graduate':{title:'Request your final degree audit.',question:'Please provide my final degree audit and the steps to apply for graduation. Identify all remaining coursework, residency, GPA, noncourse requirements, graduation fees and application deadlines.'},
      'military-records':{title:'Get your service education record.',question:'Which original military education records should I send for this degree, and how should I send them? Please confirm how my service training will be evaluated separately from my college transcripts.'}
    };
    const actionId=new URLSearchParams(location.search).get('action'),focusedAction=Object.hasOwn(schoolActions,actionId)?schoolActions[actionId]:null;
    const sendingInstructions=actionId==='send-transcripts'?transcriptGuidance():'';
    const targetReviewNeeded=draft.targetReviewNeeded===true;
    const requestedRequirement=new URLSearchParams(location.search).get('requirement');
    const proposed=(draft.plan?.rows||[]).filter(row=>row.status==='planned'&&row.option?.provider!=='University'&&row.option?.provider&&!/gap|excluded/.test(row.placementReason||''));
    const specificCourse=requestedRequirement?proposed.find(row=>row.requirementId===requestedRequirement):null;
    const context=courseReviewContext();
    const requestCourses=(specificCourse?specificCourse.option?.evidence==='conditional'?[specificCourse]:[]:context.conditional).slice(0,5);
    const unmatched=(draft.match?.unmatched||[]).filter(record=>['earned','in-progress'].includes(record.status));
    const sourceCredits=record=>typeof record.credits==='number'&&Number.isFinite(record.credits)&&['semester','quarter'].includes(record.creditSystem)?record.credits+' '+record.creditSystem+' credits':'credit amount or units need checking';
    const military=['active','veteran','reserve'].includes(state.profile.militaryStatus);
    const air=state.profile.militaryRecords==='ccaf'||state.profile.militaryRecords==='not-sure'&&['air-force','space-force'].includes(state.profile.militaryBranch);
    const recordURL=air?'https://www.airuniversity.af.edu/Barnes/CCAF/':'https://jst.doded.mil/jst/';
    const questions=[];
    if(targetReviewNeeded)questions.push('My intended goal and study preferences are '+state.profile.goal+' / '+state.profile.modality+'. Please address these specific program-fit questions: '+(draft.targetIssues||[]).map(issue=>issue.title).join('; ')+'.');
    if(!mapped)questions.push('Please send the current requirement list and applicable catalog year for '+route.title+'. I would like the official degree-audit requirements, including any named concentration or minor.');
    if(context.records.length)questions.push('Please evaluate my original learning records below for this exact degree. Identify their individual requirement placements, duplicates and any additional records you need.',...context.records.map(record=>'• '+record.provider+' — '+(record.code?record.code+' — ':'')+record.title+' ('+sourceCredits(record)+')'));
    for(const row of requestCourses){const conditions=(row.conditions||row.option.conditions||[]).slice(0,3);questions.push('• '+row.option.provider+' — '+(row.option.code?row.option.code+' — ':'')+row.option.title+' → '+(row.title||row.requirementId)+'. The available evidence is conditional. Please address '+(conditions.length?conditions.join(' '):'the missing exact equivalency for my program and catalog')+'.');}
    if(military)questions.push('Which personal service records and eligibility documents should I provide for military education benefits? My service learning must be evaluated separately from any college coursework.');
    const hasRequest=Boolean(focusedAction||questions.length),request=focusedAction?['Hello, I’m planning to pursue '+route.title+' at '+route.school+'.',focusedAction.question,'Thank you.'].join('\n\n'):['Hello, I’m planning to pursue '+route.title+' at '+route.school+'.',...questions,'Thank you.'].join('\n\n');
    const requestSection=hasRequest?'<section class="portal-review-card"><h2>'+(sendingInstructions?'Need help with a transcript?':focusedAction?'Your question':!mapped?'Optional: request a degree audit':'A request for your situation')+'</h2><p>Copy this into your school’s email or student portal.'+(context.records.length&&!focusedAction?' Attach the original records listed below.':'')+'</p><label class="portal-request-label" for="portal-school-request">'+(focusedAction?'Your question':'Your specific school request')+'</label><textarea id="portal-school-request" class="portal-school-request" rows="'+(focusedAction?'5':'9')+'" readonly>'+esc(request)+'</textarea><div class="portal-actions">'+button('copy-school-request','Copy request')+(!focusedAction&&mapped&&context.records.length?'<a class="portal-secondary" href="plan.html?task=download">Download my plan</a>':'')+'</div></section>':'';
    const heading=focusedAction?focusedAction.title:targetReviewNeeded?'Review this degree against your goals.':specificCourse?specificCourse.option.evidence==='conditional'?'A question about '+specificCourse.option.title+'.':'About '+specificCourse.option.title+'.':context.records.length?'Get your past courses evaluated.':requestCourses.length?'Resolve these course conditions.':mapped?'Your school details.':'This degree is still being researched.';
    return '<a class="portal-back" href="plan.html">'+backIcon+'My plan</a><div class="portal-home-heading"><span class="portal-kicker">Your school</span><h1 id="portal-question-title" tabindex="-1">'+esc(heading)+'</h1><p>'+esc(route.school+' · '+route.title)+'</p></div>'+
      (focusedAction&&source?'<p class="portal-source-action"><a href="'+esc(source.url)+'" target="_blank" rel="noopener">Open official program information ↗</a></p>':'')+
      schoolFactsHTML()+
      (targetReviewNeeded?'<section class="portal-review-card portal-attention"><h2>Your target needs a closer look.</h2><p>This degree does not currently match all your saved career, degree-level or study-format choices. Review those choices before relying on a course plan.</p><div class="portal-actions"><a class="portal-secondary" href="portal.html?view=edit">Review my preferences</a></div></section>':!mapped&&!focusedAction?'<section class="portal-review-card"><h2>Your goal is saved.</h2><p>DegreeSteps is still researching this degree’s requirement list. Your goal and courses remain saved; a complete course plan is not available yet.</p>'+(source?'<p class="portal-source-action"><a href="'+esc(source.url)+'" target="_blank" rel="noopener">Open official degree information ↗</a></p>':'')+'</section>':'')+
      (mapped&&!focusedAction&&!context.records.length&&!requestCourses.length&&!targetReviewNeeded&&!context.policyQuestions.length&&!context.researchBlockers.length&&draft.plan.validation.academicCountsValid!==false?'<section class="portal-review-card"><h2>Your school-listed transfer choices are ready.</h2><p>Use the listed course versions, meet their grade requirements and send official transcripts after completing them. Your school records the final credit award.</p><a class="portal-primary" href="plan.html">Back to my courses</a></section>':'')+
      (!focusedAction&&context.policyQuestions.length?'<details class="portal-tip"><summary>School details DegreeSteps is still researching</summary><ul>'+context.policyQuestions.map(rule=>'<li>'+esc(rule.message||rule.field)+'</li>').join('')+'</ul></details>':'')+
      (!focusedAction&&context.researchBlockers.length?'<details class="portal-tip"><summary>Research DegreeSteps is completing</summary><ul>'+context.researchBlockers.map(task=>'<li>'+esc(task.message||task.code)+'</li>').join('')+'</ul></details>':'')+
      (military&&(!focusedAction||actionId==='military-records')?'<section class="portal-review-card" id="service-records"><h2>Bring your service education record.</h2><p>Your school needs the original record to evaluate military learning.</p><div class="portal-actions"><a class="portal-secondary" href="'+recordURL+'" target="_blank" rel="noopener">'+(air?'Open CCAF transcript information':'Open Joint Services Transcript')+' ↗</a><a class="portal-text-action" href="import-courses.html">Add service learning to My courses</a></div></section>':'')+
      (!focusedAction&&unmatched.length?'<section class="portal-review-card"><h2>'+unmatched.length+' course'+(unmatched.length===1?' needs':'s need')+' an evaluation.</h2><p>These records are saved. A missing match does not mean the school has rejected them.</p><ul class="portal-unmatched-courses">'+unmatched.slice(0,8).map(record=>'<li><strong>'+esc(record.title)+'</strong><span>'+esc(record.provider+' · '+sourceCredits(record))+'</span></li>').join('')+'</ul>'+(unmatched.length>8?'<p>And '+(unmatched.length-8)+' more in My courses.</p>':'')+'</section>':'')+
      sendingInstructions+requestSection+
      (focusedAction?'<div class="portal-actions"><a class="portal-primary" href="plan.html">Back to my checklist</a></div><p class="portal-hint">Track the answer and mark this task done in your checklist. This does not record school approval.</p>':(draft.guidance.careerNotes.length?'<details class="portal-tip"><summary>Career requirements</summary><ul>'+draft.guidance.careerNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details>':'')+(hasRequest&&mapped?'<div class="portal-actions">'+button('school-contacted','I’ve sent my request',true)+'</div><p class="portal-hint">Sending a request does not award transfer credit. Add individual school evaluations when they arrive.</p>':''));
  }
  function renderHome() {
    refreshDraft();
    const body = page === 'school-review' ? schoolBody() : reviewPlanBody();
    $('portal-content').innerHTML = '<div class="portal-focused-review">'+body+'</div>';
  }
  function render(focus = true) {
    const questions = state.journey.view === 'questions';
    document.body.classList.toggle('is-onboarding',questions);
    window.DegreeAppShell?.setPage(questions ? 'Build my plan' : page === 'school-review' ? 'School review' : 'Review my plan');
    $('portal-loading').hidden = true;
    if (!questions && page === 'home') {
      save();
      if (saveOK) {location.replace('plan.html'); return;}
      announce('This browser could not save your plan. Keep this tab open and download a private backup before leaving.');
    }
    if (questions) renderQuestion(); else renderHome();
    updateSavings();
    $('portal-home-link').hidden = !state.journey.completed;
    save();
    if (!saveOK) $('portal-content').insertAdjacentHTML('beforeend','<div class="portal-backup-action">'+button('backup-state','Download private backup',true)+'</div>');
    if (focus) {$('portal-question-title')?.focus({preventScroll:true}); window.scrollTo(0,0);}
  }
  function openPlan(allowUnmapped=false) {
    if(activePlanState&&state.journey.view==='questions'&&!allowUnmapped&&!Journey.buildDraft(state,catalog,models).plan){throw Error('This degree has no available course plan. Review its availability before replacing your active plan.');}
    if(!allowUnmapped&&!state.journey.intakeCompleted){degreePreview=null;state.journey={...state.journey,view:'questions',step:'about'};render();return;}
    const a=state.journey.answers||{};
    if(!Object.hasOwn(a,'prior')){
      state.journey.creditsDeferred=true;
      if(!state.learning.some(r=>r.status==='earned')&&state.profile.hasPrior==='none')state.profile.hasPrior='unknown';
    }
    if(!a.purpose){const goal=state.profile.goal;a.purpose=protectedGoals.includes(goal)?'licensed-career':['any-degree','career-growth','change-career'].includes(goal)?goal:'any-degree';if(protectedGoals.includes(goal))a.career=goal;}
    state.journey={...state.journey,answers:a,completed:true,view:'home',step:'review',planReviewed:false,schoolContacted:false};
    page='home';degreePreview=null;render();
  }
  async function answer(value) {
    const id=state.journey.step;
    if(['degree','routes'].includes(id)&&value!=='unknown'){const route=catalog.pathways.find(r=>r.id===value||r.modelId===value);if(route){await previewDegree(route);return;}}
    state=Journey.applyAnswer(state,id,value,catalog);degreePreview=null;
    if(id==='start'&&value==='audit'){
      state.journey.step='purpose';save();if(saveOK)location.assign('import-courses.html');else showError(Error('Your courses could not be saved.'));return;
    }
    if(id==='degree'&&value==='unknown'){state.journey.step='purpose';render();return;}
    if(id==='degree'||id==='routes'){openPlan();return;}
    if(id==='start')state.journey.step=value==='target'?'school':'purpose';
    else if(id==='school')state.journey.step=value==='unknown'?'purpose':'degree';
    else state.journey.step='purpose';
    render();
  }
  async function action(name) {
    if(activePlanState&&state.journey.view==='questions'&&['home','keep-target','review-plan','school-review'].includes(name)){state=clone(latestStoredPlan()||activePlanState);degreePreview=null;}
    if(name==='retry-degree'){if(degreePreview?.route)await previewDegree(degreePreview.sourceRoute||degreePreview.route,{explicitFormat:degreePreview.explicitFormat,variant:degreePreview.variant,force:true});return;}
    if(name==='more-degrees'){degreeLimit+=20;renderDegreeOptions();return;}
    if(name==='degree-search'){degreePreview=null;render();return;}
    if(name==='keep-active-plan'){if(activePlanState){state=clone(latestStoredPlan()||activePlanState);state.journey={...state.journey,view:'home',completed:true};degreePreview=null;page='home';render();}return;}
    if(name==='request-unmapped-replacement'){if(degreePreview&&activePlanState){degreePreview={...degreePreview,confirmUnmappedReplacement:true};render();}return;}
    if(name==='confirm-unmapped-replacement'){if(degreePreview?.confirmUnmappedReplacement&&activePlanState){const next=previewSelection(degreePreview);if(next.draft.targetReviewNeeded)throw Error('Review your career and study preferences before changing this goal.');assertPreviousPlanSaved(latestStoredPlan()||activePlanState||state,next.state);state=next.state;openPlan(true);}return;}
    if(name==='use-degree'){if(degreePreview){await ensureRouteModels(degreePreview.route);const next=previewSelection(degreePreview);if(activePlanState&&!next.draft.plan){degreePreview={...degreePreview,confirmUnmappedReplacement:true};render();return;}assertPreviousPlanSaved(latestStoredPlan()||activePlanState||state,next.state);state=next.state;openPlan(!next.draft.plan);}return;}
    if(name==='change-preferences'){degreePreview=null;state.journey.view='questions';state.journey.step='purpose';render();return;}
    if(name==='copy-school-request'){
      const field=$('portal-school-request');
      if(navigator.clipboard?.writeText) navigator.clipboard.writeText(field.value).then(()=>announce('School-review request copied. Paste it into your school’s email or student portal.')).catch(()=>{field.focus();field.select();announce('Select and copy the request below.');});
      else {field.focus();field.select();announce('Select and copy the request below.');}
      return;
    }
    if (name === 'back') {if(degreePreview){degreePreview=null;render();return;}state.journey.step=state.journey.step==='degree'?'school':state.journey.step==='routes'?'purpose':state.journey.step==='about'?'degree':'start';}
    else if (name === 'home') {state.journey.view = 'home'; page = 'home';}
    else if (name === 'edit-answers') {state.journey.view = 'questions'; state.journey.step = 'start';}
    else if (name === 'keep-target') {state.journey.view='home';page='home';}
    else if (name === 'continue-questions') {state.journey.view = 'questions';}
    else if (name === 'exact-target') {state = Journey.applyAnswer(state,'start','target',catalog); state.journey.view = 'questions'; state.journey.step = 'school';}
    else if (name === 'build-plan') {openPlan();return;}
    else if (name === 'backup-state') {const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='degreesteps-private-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    else if (name === 'defer-credits') {state.journey.creditsDeferred = true; state.journey.planReviewed = false; state.journey.schoolContacted = false;}
    else if (name === 'review-plan') {state.journey.view = 'home'; page = 'review-plan';}
    else if (name === 'school-review') {state.journey.view = 'home'; page = 'school-review';}
    else if (name === 'finish-plan-review') {refreshDraft(); state.journey.planReviewed = true; state.journey.reviewedSignature = Journey.draftSignature(state,draft); page = 'home';}
    else if (name === 'school-contacted') {refreshDraft(); state.journey.schoolContacted = true; state.journey.schoolContactedSignature = Journey.draftSignature(state,draft); page = 'home';}
    render();
  }
  function showError(error) {const target = $('portal-step-error'); if (target) target.textContent = error.message; else announce(error.message);}
  document.addEventListener('click',async event => {
    const el = event.target.closest('button'); if (!el || !state) return;
    try {
      if(el.dataset.sourceVariant){const target=degreePreview;if(target)await previewDegree(target.sourceRoute||target.route,{sourceRoute:target.sourceRoute||target.route,variant:el.dataset.sourceVariant,explicitFormat:true});}
      else if(el.dataset.variantPreview){const route=catalog.pathways.find(r=>r.id===el.dataset.variantPreview);if(route)await previewDegree(route,{explicitFormat:true});}
      else if (el.dataset.degreePreview) {const route=catalog.pathways.find(r=>r.id===el.dataset.degreePreview);if(route)await previewDegree(route);}
      else if (el.dataset.answer) await answer(el.dataset.object ? JSON.parse(el.dataset.answer) : el.dataset.answer);
      else if (el.dataset.edit) {state.journey.view = 'questions'; state.journey.step = el.dataset.edit; render();}
      else if (el.dataset.task) {
        if (el.dataset.task === 'choices') await action('edit-answers');
        else if (el.dataset.task === 'credits') location.href = 'import-courses.html';
        else await action(el.dataset.task === 'plan' ? 'review-plan' : 'school-review');
      } else if (el.dataset.action) await action(el.dataset.action);
    } catch (error) {showError(error);}
  });
  document.addEventListener('submit',async event => {
    if (!['portal-question-form','portal-custom-degree-form','portal-explore-form','portal-about-form'].includes(event.target.id)) return;
    event.preventDefault();
    try {
      const values = new FormData(event.target), id = state.journey.step;
      if(event.target.id==='portal-about-form') {
        const prior=String(values.get('prior')),military=String(values.get('military'));
        let next=Journey.setPriorCredits(state,prior==='unknown'?'later':prior==='degree'?'some':prior);
        const goal=String(values.get('goal')),licensed=protectedGoals.includes(goal);
        next=Journey.applyAnswer(next,'purpose',licensed?'licensed-career':goal,catalog);
        if(licensed)next=Journey.applyAnswer(next,'career',goal,catalog);
        if(prior==='degree')next=Journey.applyAnswer(next,'prior','degree',catalog);
        next=Journey.applyAnswer(next,'military',military,catalog);
        if(['active','veteran','reserve'].includes(military))next=Journey.applyAnswer(next,'military-records',String(values.get('militaryRecords')),catalog);
        next=Journey.applyAnswer(next,'priority',String(values.get('priority')),catalog);
        next.journey.intakeCompleted=true;state=next;openPlan();return;
      }
      if(event.target.id==='portal-explore-form') {
        const goal=String(values.get('goal')),licensed=protectedGoals.includes(goal),format=String(values.get('format'));
        state=Journey.applyAnswer(state,'purpose',licensed?'licensed-career':goal,catalog);
        if(licensed)state=Journey.applyAnswer(state,'career',goal,catalog);
        state=Journey.applyAnswer(state,'field',licensed?'any':String(values.get('field')),catalog);
        state=Journey.applyAnswer(state,'level',String(values.get('degreeLevel')),catalog);
        state=Journey.applyAnswer(state,'format',{modality:format==='some-classroom'?'any':format,classroomImportance:format==='campus'?'essential':format==='some-classroom'?'preferred':'open'},catalog);
        state=Journey.applyAnswer(state,'priority',String(values.get('priority')),catalog);
        state.journey.step='routes';degreePreview=null;announce('Finding course plans for your choices…');await prepareRecommendations();render();return;
      }
      if(event.target.id==='portal-custom-degree-form') {
        const degree=String(values.get('unlistedDegree')||'').trim();
        if(!degree)throw Error('Enter the degree name to start your own plan.');location.assign(auditURL({degree}));return;
      }
      if(id==='degree') {
        renderDegreeOptions(true);
        const exact=availableRoutes().find(r=>key(r.school)===key(state.profile.school)&&key(r.title)===key(values.get('degree')));
        if(exact){await previewDegree(exact);}
        else $('portal-step-error').textContent='Choose a degree from the results below. Searching does not select a degree.';
        return;
      }
      await answer(values.get(id));
    } catch (error) {showError(error);}
  });
  async function openPublicRoute(params) {
    if (!params.has('template') && !params.has('shared')) return;
    const previous = clone(state);
    try {
      let route, publicPlan, title, context, strategy;
      if (params.has('template')) {
        const response = await fetch('data/community-templates.json'); if (!response.ok) throw Error('The template could not be loaded.');
        const data = await response.json(), template = data.templates.find(t => t.id === params.get('template'));
        if (!template) throw Error('That template was not found.');
        route = catalog.pathways.find(r => r.id === template.pathwayId); title = template.title; context = 'template:' + template.id; strategy = template.strategy;
      } else {
        const id = params.get('shared'); if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw Error('That shared plan link is invalid.');
        const data = await DegreeCommunity.api('/posts/' + encodeURIComponent(id));
        publicPlan = DegreeCommunity.safePlan(data.item?.plan);
        if (!publicPlan) throw Error('That post has no reusable course plan.');
        route = catalog.pathways.find(r => r.modelId === publicPlan.programId || r.id === publicPlan.programId); title = data.item.title; context = 'post:' + id; strategy = publicPlan.strategy;
      }
      await ensureRouteModels(route);
      if (!route || !routeHasMap(route) || !models.some(model=>model.id===route.modelId)) throw Error('That exact program does not yet have a compatible course map.');
      state = Sheet.selectPathway(selectionState(),route);
      state.profile.priority = ['balanced','speed','cost','transfer'].includes(strategy) ? strategy : 'balanced';
      state.templateOrigin = {title,context,pathwayId:route.id};
      if (publicPlan) {
        const model = models.find(m => m.id === route.modelId), selections = {}; let unmatched = 0;
        for (const c of publicPlan.courses) {
          const req = model?.requirements.find(r => r.id === c.requirementId), option = req?.options.find(o => o.id === c.courseId && o.provider === c.provider && o.credits === c.credits);
          if (option) selections[req.id] = option.id; else unmatched++;
        }
        const id = model?.id || route.id;
        state.scenarios = {...state.scenarios,[id]:{...Sheet.scenario(state,id),optionSelections:selections}};
        state.templateOrigin.unmatchedChoices = unmatched;
      }
      state.journey = {...state.journey,view:'questions',step:'purpose',completed:false,planReviewed:false,schoolContacted:false,answers:{...state.journey?.answers,start:'target',school:route.school,degree:route.id,routes:route.id}};
      state.journey.view=state.journey.intakeCompleted?'home':'questions';state.journey.step=state.journey.intakeCompleted?'review':'about';state.journey.completed=state.journey.intakeCompleted===true;state.journey.creditsDeferred=!state.journey.answers?.prior;announce('Copied “'+title+'”. Your courses stay saved.');
      history.replaceState(null,'',location.pathname);
    } catch (error) {state = previous; announce(error.message + ' Your saved plan is intact.');}
  }
  async function boot() {
    try {
      const response=await fetch('data/pathways.json');if(!response.ok)throw Error('We couldn’t load the degree research.');catalog=await response.json();models=[];
      try {catalog=await DegreeProgramCatalog.load(catalog);} catch {announce('The full program directory could not load. You can still enter your exact degree.');}
      models=DegreeProgramCatalog.loadModels?await DegreeProgramCatalog.loadModels([]):await Promise.all(DegreeProgramCatalog.modelFiles.map(async url=>{const response=await fetch(url);if(!response.ok)throw Error('We couldn’t load the degree research.');return response.json();}));
      let stored;try{stored=JSON.parse(read(KEY));}catch{}attachPrivateCurricula(stored);
      state = Journey.initialize(read(KEY),read('degreepath-pathway-v2'),catalog);
      await ensureRouteModels(catalog.pathways.find(route=>route.id===(state.selectedPathwayId||state.profile?.pathwayId)));
      activePlanState=actualSavedTarget(state)&&read(KEY)?clone(state):null;
      const params = new URLSearchParams(location.search);
      await openPublicRoute(params);
      const school = (params.get('school') || '').trim();
      if (school && school.length <= 120) {
        state=Journey.applyAnswer(state,'start','target',catalog);
        state=Journey.applyAnswer(state,'school',{school},catalog);
        if (['associate','bachelor','master','doctorate','specialist'].includes(params.get('level'))) state=Journey.applyAnswer(state,'level',params.get('level'),catalog);
        if (['online','campus'].includes(params.get('format'))) state=Journey.applyAnswer(state,'format',params.get('format'),catalog);
        state.journey={...state.journey,view:'questions',step:'degree',completed:false};
        const selectedProgram=catalog.pathways.find(route=>route.id===params.get('program')&&route.school===school);if(selectedProgram){await previewDegree(selectedProgram);}
        history.replaceState(null,'',location.pathname+'?view=setup');
      } else if (['edit','setup','about'].includes(params.get('view'))) {if(params.get('view')==='about')state.journey.step='about';else if(params.get('view')==='edit'||state.journey.completed)state.journey.step='start';state.journey.view='questions';}

      if (['review','school'].includes(params.get('view')) && state.selectedPathwayId) {state.journey.view='home';page=params.get('view')==='school'?'school-review':'review-plan';}
      if (params.get('share') === '1' && state.selectedPathwayId) {save(); location.replace('plan.html?share=1'); return;}
      render(false);
      window.DegreeAccount?.session().then(session => {const link=$('portal-account-link');if(link)link.textContent=session.user?'My account':'Sign in';}).catch(()=>{});
    } catch (error) {
      $('portal-loading').hidden = true; $('portal-error').hidden = false;
      $('portal-error').textContent = error.message + ' Reload to try again. Your saved records have not been deleted.';
    }
  }
  boot();
}());
