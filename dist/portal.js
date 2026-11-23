/* A guided front door to the same private degree worksheet. No runtime AI. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), Journey = window.DegreeJourney, Sheet = window.DegreeSheet;
  const KEY = 'degreepath-guide-v3';
  const publicPlanIds = new Set(['wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential']);
  const PROFILE_DRAFT_KEY = 'degreesteps-profile-draft-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const backIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
  let state, catalog, models, draft, saveOK = true, page = 'home', degreePreview = null, activePlanState = null;
  const pendingDiscoveries=new Map();
  let recommendationView=null,recommendationPending=false,recommendationError='',recommendationRequest=0,recommendationRunner=null,recommendationCosts=null,recommendationProgress=null,recommendationMatches=null;
  const recommendationCache=new Map();
  const FINDING_NOTICE='Finding course plans for your choices…';
  let resultNotice='',resultCount=null,estimateRates=null;
  function attachPrivateCurricula(value) {
    catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,value);
    if(window.AuditCurriculum)catalog=AuditCurriculum.attach(catalog,value);attachSubjects();
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
  const availableRoutes = () => typeof DegreeProgramCatalog.publishedPlans==='function'?DegreeProgramCatalog.publishedPlans(catalog,models):[];
  const availableCatalog = () => ({...catalog,pathways:availableRoutes()});
  const reviewedRoute = route => publicPlanIds.has(route?.id)||availableRoutes().some(item=>item.id===route?.id);
  async function ensureRouteModels(routes) {
    const list=(Array.isArray(routes)?routes:[routes]).filter(Boolean).flatMap(route=>[route,...DegreeProgramCatalog.variants(route,catalog)]),wanted=list.filter(route=>route.modelId&&!models.some(model=>model.id===route.modelId));
    if(!wanted.length||!DegreeProgramCatalog.modelsForRoutes)return;
    const loaded=await DegreeProgramCatalog.modelsForRoutes(wanted,{includeLegacy:false}),all=new Map((models||[]).map(model=>[model.id,model]));
    loaded.forEach(model=>all.set(model.id,model));models=[...all.values()];
  }
  async function previewDegree(route,extra={}) {
    cancelRecommendations();
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
  function recommendationInput() {
    const saved=latestStoredPlan();
    if(!saved&&(activePlanState||recommendationPending))throw Error('Your saved courses are unavailable. Restore your private plan before comparing again.');
    const input={...clone(saved||state),profile:clone(state.profile)};
    // Exploration uses the same original courses without replacing the active degree.
    input.selectedPathwayId='';delete input.targetIdentity;
    input.profile={...input.profile,pathwayId:'',school:'',schoolChoice:'',degree:''};
    input.sheet={...input.sheet,isExample:true};
    // This is a fresh wizard search. Manual Compare choices, including an
    // intentionally empty comparison, remain saved in the student's plan.
    input.whatIf={...input.whatIf};delete input.whatIf.selectedIds;
    return input;
  }
  function recommendationKey(input) {
    return JSON.stringify({profile:state.profile,learning:input.learning,scenarios:input.scenarios,savings:input.savings,sourceCurricula:input.sourceCurricula,customCurricula:input.customCurricula,auditDrafts:input.auditDrafts});
  }
  function recommendationSources(input) {
    // Recompose private requirements for this search. Keep the active plan's
    // recovery data in the main catalog, while removed imports stop matching.
    const registry=catalog.curriculumRegistry?.models||[],registeredRoutes=new Set(registry.flatMap(entry=>entry.routeIds||[])),registeredModels=new Set(registry.map(entry=>entry.id));
    const privateRoute=route=>!registeredRoutes.has(route.id)&&(route.sourceStatus==='automated-public-source'&&(route.sourceProgramId||route.parentId||route.courseMapStatus==='source-imported')||route.sourceStatus==='student-provided'&&route.routeType==='student-audit'),privateModelIds=new Set(catalog.pathways.filter(privateRoute).map(route=>route.modelId)),publicRoutes=catalog.pathways.filter(route=>!privateRoute(route)),publicIds=new Set(publicRoutes.map(route=>route.id));
    let searchCatalog={...catalog,pathways:publicRoutes.map(route=>({...route,...(route.planningVariants?{planningVariants:route.planningVariants.filter(id=>publicIds.has(id))}:{})}))};
    searchCatalog=DegreeProgramCatalog.attachSourceCurricula(searchCatalog,input);
    if(window.AuditCurriculum)searchCatalog=AuditCurriculum.attach(searchCatalog,input);
    const reviewedCommunity=model=>model.communityTemplate?.sourcesReviewed===true&&model.communityTemplate?.academicReviewed===true;
    const privateModel=model=>!registeredModels.has(model.id)&&!reviewedCommunity(model)&&(privateModelIds.has(model.id)||model.sourceStatus==='automated-public-source'||['student-provided','ai-research'].includes(model.auditProvenance?.status)),all=new Map(models.filter(model=>!privateModel(model)).map(model=>[model.id,model]));
    [...DegreeProgramCatalog.sourceModels(input),...(window.AuditCurriculum?AuditCurriculum.models(input):[])].forEach(model=>all.set(model.id,model));
    return {catalog:searchCatalog,models:[...all.values()]};
  }
  function cancelRecommendations() {
    recommendationRequest++;recommendationRunner?.cancel();recommendationPending=false;recommendationProgress=null;
  }
  const showingRecommendations=()=>state?.journey?.view==='questions'&&state.journey.step==='routes'&&!degreePreview;
  function currentRecommendation(request,cacheKey) {
    if(request!==recommendationRequest||!showingRecommendations())return false;
    try{if(recommendationKey(recommendationInput())===cacheKey)return true;}catch(error){clearRecommendationError(error);return false;}
    refreshRecommendations().catch(showError);return false;
  }
  function clearRecommendationError(error) {
    cancelRecommendations();recommendationView=null;recommendationMatches=[];recommendationError=error.message+' The earlier comparison has been cleared.';showRecommendationResults();
  }
  function recommendationPacket(packet,request,cacheKey) {
    const progress=recommendationProgress;
    if(!progress||!currentRecommendation(request,cacheKey)||!packet||typeof packet!=='object'||packet.complete!==false||packet.recommendation!==null)return;
    if(packet.phase==='started'){
      const ids=packet.matchingRouteIds;
      if(progress.started||!Array.isArray(ids)||!Number.isInteger(packet.matchingRouteCount)||packet.matchingRouteCount!==ids.length||new Set(ids).size!==ids.length||ids.length!==progress.matchingIds.length||ids.some(id=>!progress.results.has(id)))return;
      progress.started=true;updateRecommendationProgress();return;
    }
    const candidate=packet.candidate,count=packet.checkedCount;
    if(packet.phase!=='candidate'||!progress.started||packet.matchingRouteCount!==progress.matchingIds.length||!Number.isInteger(count)||count<=progress.checked||count>progress.matchingIds.length||!candidate||!progress.results.has(candidate.id)||(candidate.id!=='route:'+candidate.pathwayId&&!(candidate.pathwayId===null&&candidate.available===false))||progress.candidates.has(candidate.id)||typeof candidate.available!=='boolean'||typeof candidate.eligible!=='boolean')return;
    const summary=candidate.summary,ready=candidate.available&&candidate.eligible;
    if(ready&&(!summary||typeof summary!=='object'||!knownEstimate(summary.mappedExternalCredits)||!['semester','quarter','competency-unit'].includes(summary.creditSystem)))return;
    // Keep detached display facts only. Solver drafts and original records never
    // enter the partial-results memory or the final comparison cache.
    const facts=ready?Object.fromEntries(['creditSystem','mappedExternalCredits','remainingCost','estimatedBaseCost','universityTuitionRemaining','estimatedWeeks','collectionFitCredits'].map(name=>[name,summary[name]])):null;
    progress.candidates.set(candidate.id,{id:candidate.id,pathwayId:candidate.pathwayId,available:candidate.available,eligible:candidate.eligible,reason:typeof candidate.reason==='string'?candidate.reason:'',summary:facts});progress.checked=count;
    if(ready&&progress.readyIds.length<3)progress.readyIds.push(candidate.id);
    updateRecommendationProgress();
  }
  async function recommendationPrices() {
    if(!recommendationCosts)recommendationCosts=fetch('data/cost-comparisons.json').then(async response=>{
      if(!response.ok)throw Error('Cost estimates could not load.');
      const value=await response.json();if(!value||!Array.isArray(value.entries))throw Error('Cost estimates could not load.');return value;
    }).catch(error=>{recommendationCosts=null;throw error;});
    return recommendationCosts;
  }
  async function prepareRecommendations(force=false) {
    const request=++recommendationRequest;recommendationRunner?.cancel();
    let input;try{input=recommendationInput();}catch(error){clearRecommendationError(error);return;}
    const cacheKey=recommendationKey(input),profile=clone(state.profile);
    let sources,results;
    try{
      sources=recommendationSources(input);
      const searchCatalog={...sources.catalog,pathways:guidedRoutes(sources.catalog,sources.models)},modelsById=new Map(sources.models.map(model=>[model.id,model]));
      // Profile eligibility and names are cheap. Joint course placement belongs
      // to the comparison worker, including when the student has many records.
      results=Journey.recommend({...state,learning:[]},searchCatalog,[]).map(result=>({...result,model:modelsById.get(result.pathway.modelId)}));recommendationMatches=results;
    }catch(error){clearRecommendationError(error);return;}
    if(!force&&recommendationCache.has(cacheKey)){recommendationView=recommendationCache.get(cacheKey);recommendationPending=false;recommendationProgress=null;recommendationError='';showRecommendationResults();return;}
    recommendationView=null;recommendationError='';recommendationPending=true;recommendationProgress=null;
    try {
      const eligible=results.map(result=>result.pathway);
      recommendationProgress={request,cacheKey,results:new Map(results.map(result=>['route:'+result.pathway.id,result])),matchingIds:results.map(result=>'route:'+result.pathway.id),checked:0,started:false,candidates:new Map(),readyIds:[],renderedIds:new Set()};
      showRecommendationResults();
      await ensureRouteModels(eligible);
      sources=recommendationSources(input);
      const loadedModels=new Map(sources.models.map(model=>[model.id,model]));results.forEach(result=>{result.model=loadedModels.get(result.pathway.modelId);});
      const costs=await recommendationPrices();
      if(!currentRecommendation(request,cacheKey))return;
      if(!window.DegreeComparisonRunner)throw Error('The course comparison could not load.');
      recommendationRunner ||= DegreeComparisonRunner.create({timeoutMs:90000});
      const value=await recommendationRunner.run('build',{state:input,catalog:{...sources.catalog,pathways:eligible},models:sources.models,costs,options:{fromCourses:true,deferMatrix:true,priority:({cost:'cost',speed:'terms',transfer:'collection'})[profile.priority]||'credits'}},{onProgress:packet=>recommendationPacket(packet,request,cacheKey)});
      if(!currentRecommendation(request,cacheKey))return;
      recommendationView=value;recommendationCache.set(cacheKey,value);
      // Keep only a few searches in memory; nothing is written to the student's plan.
      if(recommendationCache.size>4)recommendationCache.delete(recommendationCache.keys().next().value);
    } catch(error) {
      if(request!==recommendationRequest||error.code==='superseded')return;
      recommendationError='We could not finish the cost and time comparison. These plans are shown by your preferences.';
    } finally {if(request===recommendationRequest){recommendationPending=false;recommendationProgress=null;showRecommendationResults();}}
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
          state.sheet={...state.sheet,notes:clone(previous.sheet?.notes||{}),...(previous.sheet?.slotChoices?{slotChoices:clone(previous.sheet.slotChoices)}:{})};
          if(previous.whatIf)state.whatIf=clone(previous.whatIf);
        }
        if(previous&&actualSavedTarget(previous)&&targetChanged(previous,state)){
          assertPreviousPlanSaved(previous,state);const remembered=DegreeProgramCatalog.rememberPlan(previous,Journey.buildDraft(previous,catalog,models));
          if(remembered.whatIf?.snapshots)state.whatIf={...remembered.whatIf,...state.whatIf,snapshots:remembered.whatIf.snapshots};
        }
        if(profileFlow()?.mode==='target'&&!actualSavedTarget(previous))profileFlow().baseTarget=state.selectedPathwayId||'';
        localStorage.setItem(KEY,JSON.stringify(state));
        activePlanState=actualSavedTarget(state)?clone(state):null;
        if(profileFlow())persistProfileDraft();
      }
      saveOK=true;
    }catch{saveOK=false;}
    if(!protectedEdit||!saveOK)window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:saveOK}}));
    $('portal-saved').textContent=saveOK?(protectedEdit?'Your current plan stays saved while you compare degrees.':'Your progress is saved on this device.'):'Device storage is unavailable. Download a private backup from your course plan before leaving.';
    return saveOK&&!protectedEdit;
  }
  function announce(message) {$('portal-notice').textContent = message;}
  // Anonymous aggregate counters only (growth-metrics.js). A plan id is sent only when it is in the public plan library index.
  function trackGrowth(event,extra={}) {try{window.dispatchEvent(new CustomEvent('DegreeSteps:growth',{detail:{event,context:'workspace',...extra}}));}catch{/* Measurement never blocks planning. */}}
  const growthPlan=id=>typeof id==='string'&&(planIndex?.plans&&Object.hasOwn(planIndex.plans,id)||publicPlanIds.has(id))?{planId:id}:{};
  // The worksheet opens from a chosen plan: plan_started (kept for continuity) and plan_built (the funnel step).
  function trackPlanStarted(id) {trackGrowth('plan_started',growthPlan(id));trackGrowth('plan_built',growthPlan(id));}
  function button(action, label, secondary = false) {return '<button type="button" class="portal-' + (secondary ? 'secondary' : 'primary') + '" data-action="' + action + '">' + esc(label) + '</button>';}
  function choice(value, title, detail = '') {
    const current = state.journey.answers[state.journey.step];
    return '<button type="button" class="portal-choice" data-answer="' + esc(typeof value === 'object' ? JSON.stringify(value) : value) + '"' + (typeof value === 'object' ? ' data-object="true"' : '') + ' aria-pressed="' + (JSON.stringify(current) === JSON.stringify(value)) + '"><span><strong>' + esc(title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</span><span aria-hidden="true">→</span></button>';
  }
  function choices(items) {return '<div class="portal-choices">' + items.map(item => choice(...item)).join('') + '</div>';}
  const goalChoices = [['any-degree','Earn a degree'],['career-growth','Advance my career'],['change-career','Change careers'],['teacher','Become a teacher'],['lawyer','Prepare for law'],['pilot','Become a pilot'],['health-professional','Enter a health profession']];
  // Subject choices follow the browsing taxonomy in data/plan-library-index.json
  // (the same subjects as the plan finder). Older saved field ids stay selectable.
  const defaultSubjects = {business:'Business & management','accounting-finance':'Accounting & finance',technology:'Technology & data',health:'Health & healthcare',psychology:'Psychology & human services','criminal-justice':'Criminal justice & law',education:'Education',humanities:'Communication & humanities',faith:'Religion & ministry'};
  const legacyFieldLabels = {science:'Science & mathematics',arts:'Arts & design','social-science':'Social sciences (psychology or criminal justice)',general:'General studies',law:'Law',aviation:'Aviation'};
  function fieldChoicesFor(current) {
    const known=new Set(DegreeGuide.subjectIds||Object.keys(defaultSubjects)),labels=planIndex?.subjects&&typeof planIndex.subjects==='object'?planIndex.subjects:defaultSubjects;
    const items=[['any','Any subject'],...Object.keys(defaultSubjects).filter(id=>known.has(id)).map(id=>[id,typeof labels[id]==='string'&&labels[id]?labels[id]:defaultSubjects[id]])];
    if(current&&current!=='any'&&!items.some(([id])=>id===current)&&legacyFieldLabels[current])items.push([current,legacyFieldLabels[current]]);
    return items;
  }
  // Plans that still need school confirmation keep their open questions on the
  // availability screen, as in the plan finder.
  // The student's own short email to the school, from the plan's open questions (DegreeSheet.schoolEmail).
  function schoolEmailLink(route) {
    const format=(route?.modalities||[]).length===1?(route.modalities[0]==='campus'?'on campus':'online'):'';
    const email=Sheet.schoolEmail(planIndex,route?.id,{title:route?.title,school:route?.school,modalities:route?.modalities,format});
    return email?'<p class="portal-school-email"><a href="'+esc(email.mailto)+'">Email the school these questions</a> <small>'+(email.contact?.email?'To '+esc(email.contact.office)+' ('+esc(email.contact.email)+'), as published by the school.':email.contact?.contactPage?'This school doesn’t publish a transfer email; copy the text into <a href="'+esc(email.contact.contactPage)+'" target="_blank" rel="noopener">its contact form</a>.':'A short email in your words, for the admissions or transfer-credit office.')+'</small></p>':'';
  }
  // Optional extra actions from leads.js (school contact request, Plan review link). Empty unless a feature is on;
  // they never change which plans are shown or their order.
  function leadActionsHTML(route) {
    return window.DegreeLeads?.actionsHTML({planId:route?.id,school:route?.school,title:route?.title})||'';
  }
  function schoolCheckHTML(...routes) {
    const route=routes.find(item=>planQuestions(item).length),questions=route?planQuestions(route):[];
    return questions.length?'<section class="portal-school-check" aria-label="Needs school confirmation"><h3>Before you pay for courses, ask the school:</h3><ul>'+questions.map(question=>'<li>'+esc(question)+'</li>').join('')+'</ul><p>This course plan is complete, but these points are not yet confirmed in the school’s published rules.</p>'+schoolEmailLink(route)+'</section>':'';
  }
  function attachSubjects() {
    const plans=planIndex?.plans;if(!catalog||!plans||typeof plans!=='object'||!Array.isArray(catalog.pathways))return;
    catalog={...catalog,pathways:catalog.pathways.map(route=>{const subjects=plans[route?.id]?.subjects;return Array.isArray(subjects)&&subjects.every(id=>typeof id==='string')&&JSON.stringify(route.subjects)!==JSON.stringify(subjects)?{...route,subjects:[...subjects]}:route;})};
  }
  // Reviewed plans plus complete plans that still need school confirmation (labelled on each card).
  // Without the finder index, only reviewed (published) plans are searched.
  function guidedRoutes(source,loaded) {
    return typeof DegreeProgramCatalog.planLibraryRoutes==='function'?DegreeProgramCatalog.planLibraryRoutes(source,loaded,planIndex):DegreeProgramCatalog.publishedPlans(source,loaded);
  }
  const needsConfirmation=route=>planIndex?.plans?.[route?.id]?.tier==='confirmation';
  function planQuestions(route) {
    const entry=planIndex?.plans?.[route?.id];
    if(entry?.tier!=='confirmation'||!Array.isArray(entry.questions))return [];
    return entry.questions.slice(0,12).filter(question=>typeof question==='string'&&question.trim()).map(question=>{const text=question.trim().replace(/^ask the school:\s*/i,'');return text.charAt(0).toUpperCase()+text.slice(1);});
  }
  const protectedGoals = ['teacher','lawyer','pilot','health-professional'];
  const learnerPreferenceFields=['hasPrior','militaryStatus','militaryRecords','campusLocation','homeState','campusInterests','campusTime','learningPace','assessmentPreference','proctoringPreference','budget','weeklyHours'];
  const searchProfileFields=['entry','goal','degreeLevel','field','school','schoolChoice','degree','pathwayId','modality','classroomImportance','priority',...learnerPreferenceFields];
  const searchAnswerFields=['start','school','degree','purpose','career','level','field','format','priority','routes'];
  function explorationSearch(value=state) {
    const saved=value.journey?.explorationSearch;
    if(saved?.version!==1||!saved.profile||typeof saved.profile!=='object'||Array.isArray(saved.profile)||!saved.answers||typeof saved.answers!=='object'||Array.isArray(saved.answers))return null;
    if(!['explore','target'].includes(saved.answers.start)||!goalChoices.some(([id])=>id===saved.profile.goal)||!['unsure','associate','bachelor','master','doctorate','specialist'].includes(saved.profile.degreeLevel)||!['balanced','speed','cost','transfer'].includes(saved.profile.priority))return null;
    return saved;
  }
  function rememberExplorationSearch() {
    const profile=Object.fromEntries(searchProfileFields.filter(name=>Object.hasOwn(state.profile,name)).map(name=>[name,clone(state.profile[name])])),answers=Object.fromEntries(searchAnswerFields.filter(name=>Object.hasOwn(state.journey.answers,name)).map(name=>[name,clone(state.journey.answers[name])]));
    if(!answers.start&&['explore','target'].includes(profile.entry))answers.start=profile.entry;
    if(answers.start==='explore'){Object.assign(profile,{school:'',schoolChoice:'',degree:'',pathwayId:''});for(const name of ['school','degree','routes'])delete answers[name];}
    state.journey={...state.journey,explorationSearch:{version:1,profile,answers,selectedPathwayId:answers.start==='explore'?'':state.selectedPathwayId||'',targetIdentity:answers.start==='explore'?null:state.targetIdentity?clone(state.targetIdentity):null}};
  }
  function restoreExplorationSearch() {
    const search=explorationSearch();
    if(search){
      state.profile={...state.profile,...Object.fromEntries(searchProfileFields.filter(name=>Object.hasOwn(search.profile,name)).map(name=>[name,clone(search.profile[name])]))};
      const answers={...state.journey.answers};for(const name of searchAnswerFields){if(Object.hasOwn(search.answers,name))answers[name]=clone(search.answers[name]);else delete answers[name];}
      state.journey={...state.journey,answers};state.selectedPathwayId=typeof search.selectedPathwayId==='string'?search.selectedPathwayId:'';
      if(search.targetIdentity)state.targetIdentity=clone(search.targetIdentity);else delete state.targetIdentity;
    }
    state.journey.step='routes';
  }
  function preferencesAnswered() {
    const a=state.journey.answers||{},goal=state.profile.goal;
    return ['balanced','speed','cost','transfer'].includes(a.priority)&&a.priority===state.profile.priority&&(protectedGoals.includes(goal)?a.purpose==='licensed-career'&&a.career===goal:a.purpose===goal&&goalChoices.some(([id])=>id===goal));
  }
  const chooseField = (name,label,items,value) => '<label class="portal-field"><span>'+esc(label)+'</span><select name="'+name+'">'+items.map(([id,title])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
  function field(name, label, value, extra = '') {
    return '<label class="portal-field"><span>' + esc(label) + '</span><input name="' + name + '" value="' + esc(value) + '" maxlength="' + (name === 'school' ? '120' : '160') + '" required ' + extra + '></label>';
  }
  // Military service is a first-class question, not a collapsed tip: service
  // training can be evaluated for credit and changes the records a school needs.
  function militaryFieldHTML(status,records,recordsId) {
    const serving=['active','veteran','reserve'].includes(status);
    return '<fieldset class="portal-military-field"><legend>Military service</legend>'+chooseField('military','Have you served in the U.S. military?',[['none','No military connection'],['active','Yes, active duty'],['veteran','Yes, I’m a veteran'],['reserve','Yes, Reserve / National Guard'],['dependent','I’m a military family member']],status)+
      '<div'+(recordsId?' id="'+recordsId+'"':'')+(recordsId&&!serving?' hidden':'')+'>'+chooseField('militaryRecords','Your service education record',[['not-sure','Help me identify my record'],['jst','Joint Services Transcript (JST)'],['ccaf','CCAF / Air University'],['other','Another service record']],records)+'</div>'+
      '<p class="portal-hint">Military training can count toward a degree. We’ll include your service records and benefits guidance in your plan.</p></fieldset>';
  }
  function exploreBody() {
    const p=state.profile, licensed=protectedGoals.includes(p.goal);
    const format=p.classroomImportance==='preferred'?'some-classroom':p.modality||'any';
    return '<form id="portal-explore-form" class="portal-quick-form">'+
      chooseField('goal','What is the degree for?',goalChoices,p.goal)+
      '<div id="portal-subject-field"'+(licensed?' hidden':'')+'>'+chooseField('field','Subject',fieldChoicesFor(p.field),p.field||'any')+'</div>'+
      chooseField('degreeLevel','Degree level',[['unsure','Help me choose'],['associate','Associate'],['bachelor','Bachelor’s'],['master','Master’s'],['doctorate','Doctoral'],['specialist','Specialist']],p.degreeLevel||'unsure')+
      chooseField('format','Where will you study?',[['any','Online or on campus'],['online','Online'],['campus','On campus'],['some-classroom','Some classroom time preferred']],format)+
      chooseField('priority','Main priority',[['speed','Finish sooner'],['cost','Spend less'],['balanced','Balance time and cost'],['transfer','Take more courses outside my university']],p.priority||'balanced')+
      (state.profile.school?'<p class="portal-school-filter">At '+esc(state.profile.school)+'</p>':'')+
      '<button class="portal-primary" type="submit">Find course plans</button></form>';
  }
  function aboutBody() {
    const p=state.profile,prior=state.journey.answers?.prior||(state.learning.some(record=>record.status==='earned')?'some':'unknown');
    const preferences=preferencesAnswered()?'<div class="portal-links"><p class="portal-hint">'+esc(goalChoices.find(([id])=>id===p.goal)?.[1]||'Earn a degree')+' · '+esc(({balanced:'Balance time and cost',speed:'Finish sooner',cost:'Spend less',transfer:'Take more courses outside my university'})[p.priority])+'</p><button type="button" data-action="edit-about-preferences">Change choices</button></div>':aboutPreferenceFields();
    return '<p class="portal-intro">A few choices help us build around you. You can add your course records later.</p><form id="portal-about-form" class="portal-quick-form">'+
      '<div id="portal-about-preferences">'+preferences+'</div>'+
      chooseField('prior','Have you finished any college courses?',[['unknown','I’ll add my courses later'],['none','No, I’m starting from zero'],['some','Yes, I have courses or exam credits'],['degree','Yes, I already have a degree']],prior)+
      militaryFieldHTML(p.militaryStatus||'none',p.militaryRecords||'not-sure',null)+'<button class="portal-primary" type="submit">Open my course plan</button></form>';
  }
  function aboutPreferenceFields() {
    return chooseField('goal','What is the degree for?',goalChoices,state.profile.goal||'any-degree')+chooseField('priority','What matters most?',[['balanced','Balance time and cost'],['speed','Finish sooner'],['cost','Spend less'],['transfer','Take more courses outside my university']],state.profile.priority||'balanced');
  }
  const campusInterestChoices=[['sports','College sports'],['social','An active social life'],['housing','Living on campus'],['city','A city setting'],['small-campus','A smaller campus'],['faith','A faith-based community'],['recognition','A well-known school']];
  const stateChoices=[['','Choose a state (optional)'],...('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming').split('|').map(value=>value.split(':'))];
  const profileStepIds=['purpose','prior','format','priority'];
  function profileFlow() {return state.journey?.profileFlow?.version===1?state.journey.profileFlow:null;}
  // A chosen degree already answers subject, level and format, so the target flow
  // starts with the student's starting point. Its goal is asked only when the
  // saved career goal does not fit the chosen degree (askGoal).
  function profileSteps() {const flow=profileFlow();return flow?.mode==='preferences'||flow?.mode==='target'&&!flow.askGoal?profileStepIds.slice(1):profileStepIds;}
  function profileValues(id=state.journey.step) {return {...state.profile,...(profileFlow()?.values?.[id]||{})};}
  function persistProfileDraft() {
    const flow=profileFlow();if(!flow)return;
    const fields=Object.fromEntries(searchProfileFields.filter(name=>Object.hasOwn(state.profile,name)).map(name=>[name,clone(state.profile[name])]));
    localStorage.setItem(PROFILE_DRAFT_KEY,JSON.stringify({version:1,baseTarget:flow.baseTarget,selectedPathwayId:state.selectedPathwayId||'',profile:fields,answers:state.journey.answers,flow:clone(flow),step:state.journey.step}));
  }
  function clearProfileDraft() {try{localStorage.removeItem?.(PROFILE_DRAFT_KEY);}catch{}}
  function startProfile(mode,returnStep='routes') {
    cancelRecommendations();degreePreview=null;
    state.journey={...state.journey,view:'questions',profileFlow:{version:1,mode,returnStep,values:{},baseTarget:latestStoredPlan()?.selectedPathwayId||''},step:mode==='explore'?'purpose':'prior'};
    persistProfileDraft();render();trackGrowth('guided_started');
  }
  function restoreProfileDraft(mode) {
    let saved;try{saved=JSON.parse(read(PROFILE_DRAFT_KEY));}catch{return false;}
    const target=latestStoredPlan()?.selectedPathwayId||'';
    if(saved?.version!==1||saved.baseTarget!==target||saved.flow?.baseTarget!==target||saved.flow?.version!==1||!['explore','target','preferences'].includes(saved.flow.mode)||mode&&saved.flow.mode!==mode||!profileStepIds.includes(saved.step)||!saved.profile||typeof saved.profile!=='object'||Array.isArray(saved.profile)||saved.flow.mode==='preferences'&&saved.selectedPathwayId!==target)return false;
    if(saved.selectedPathwayId!==state.selectedPathwayId){if(!saved.selectedPathwayId&&saved.flow.mode==='explore')state=Journey.applyAnswer(state,'start','explore',catalog);else{const route=catalog.pathways.find(route=>route.id===saved.selectedPathwayId);if(!route||!routeHasMap(route))return false;state=Journey.selectRoute(state,route,catalog);}}
    state.profile={...state.profile,...Object.fromEntries(searchProfileFields.filter(name=>Object.hasOwn(saved.profile,name)).map(name=>[name,clone(saved.profile[name])]))};
    state.journey={...state.journey,view:'questions',step:saved.step,profileFlow:clone(saved.flow),answers:{...state.journey.answers,...saved.answers}};
    return true;
  }
  function captureProfileValues(form) {
    if(!profileFlow()||!form)return;
    const values=new FormData(form),snapshot={};
    for(const [name,value] of values.entries())if(name!=='campusInterests'&&typeof value==='string')snapshot[name]=value.slice(0,200);
    snapshot.campusInterests=values.getAll?values.getAll('campusInterests').filter(value=>campusInterestChoices.some(([id])=>id===value)):[];
    profileFlow().values={...profileFlow().values,[state.journey.step]:snapshot};persistProfileDraft();
  }
  function profileProgressHTML() {
    const steps=profileSteps(),index=steps.indexOf(state.journey.step),labels={purpose:'Your goal',prior:'Your starting point',format:'Your experience',priority:'Your priorities'};
    return '<nav class="portal-profile-progress" aria-label="Your preferences"><ol>'+steps.map((step,i)=>'<li'+(i===index?' aria-current="step"':'')+'><span>'+esc(labels[step])+'</span></li>').join('')+'</ol><p>Step '+(index+1)+' of '+steps.length+'</p></nav>';
  }
  function profileBody(id) {
    const p=profileValues(id),flow=profileFlow(),locked=flow.mode==='preferences'||flow.mode==='target';
    let body='';
    if(id==='purpose')body=chooseField('goal','What would a degree help you do?',goalChoices,p.goal)+(!locked?chooseField('field','What would you like to study?',fieldChoicesFor(p.field),p.field||'any')+chooseField('degreeLevel','Which degree are you considering?',[['unsure','Help me choose'],['associate','Associate'],['bachelor','Bachelor’s'],['master','Master’s'],['doctorate','Doctoral'],['specialist','Specialist']],p.degreeLevel||'unsure'):'<p class="portal-profile-note">'+esc(state.profile.degree)+' · '+esc(state.profile.school)+'</p>');
    if(id==='prior')body='<p class="portal-intro">We can use what you have already learned. Course records can wait.</p>'+chooseField('prior','Have you finished any college courses?',[['unknown','I’ll add my courses later'],['none','No, I’m starting from zero'],['some','Yes, courses or exam credits'],['degree','Yes, I already have a degree']],p.prior||p.hasPrior||'unknown')+militaryFieldHTML(p.military||p.militaryStatus||'none',p.militaryRecords||'not-sure','portal-profile-military-records');
    if(id==='format'){
      const format=p.format||(p.classroomImportance==='preferred'?'some-classroom':p.modality||'any'),campus=format!=='online';
      body=(locked?'<p class="portal-profile-note">Your current degree: '+esc(state.profile.degree)+' · '+esc(state.profile.school)+'. '+esc(state.profile.modality==='campus'?'On campus':state.profile.modality==='online'?'Online':'Study format follows your selected degree')+'.</p><p class="portal-hint">Change your school or degree from My plan to explore another study format.</p>':chooseField('format','Where would you like to study?',[['any','I’m open to online or on campus'],['online','Online'],['campus','On campus'],['some-classroom','Some classroom time preferred']],format))+
      chooseField('learningPace','How would you like courses to fit your life?',[['any','I’m flexible'],['self-paced','Let me work at my own pace'],['scheduled','I prefer a class schedule']],p.learningPace||'any')+
      '<div id="portal-profile-campus"'+(!campus?' hidden':'')+'><details class="portal-tip"'+(format==='campus'||p.campusLocation&&p.campusLocation!=='any'||p.campusInterests?.length?' open':'')+'><summary>Your campus experience (optional)</summary>'+chooseField('campusLocation','Where would you consider a campus?',[['any','Anywhere that fits'],['near-home','I’d like to stay near home'],['relocate','I’m open to moving away']],p.campusLocation||'any')+'<div id="portal-profile-home-state"'+(p.campusLocation!=='near-home'?' hidden':'')+'>'+chooseField('homeState','Your home state',stateChoices,p.homeState||'')+'<p class="portal-hint">We can prioritize your state where campus information is available.</p></div><fieldset class="portal-profile-options"><legend>What would you enjoy? Choose any.</legend>'+campusInterestChoices.map(([value,label])=>'<label><input type="checkbox" name="campusInterests" value="'+value+'"'+(Array.isArray(p.campusInterests)&&p.campusInterests.includes(value)?' checked':'')+'><span>'+esc(label)+'</span></label>').join('')+'</fieldset>'+chooseField('campusTime','How much time would you like on campus?',[['any','I’m flexible'],['one-year','About one year'],['two-years','About two years'],['three-plus','Three years or more']],p.campusTime||'any')+'<p class="portal-hint">This is your preference. Your degree requirements determine the semesters you need.</p></details></div>';
    }
    if(id==='priority')body=chooseField('priority','What matters most to you?',[['balanced','Balance time and cost'],['speed','Finish sooner'],['cost','Spend less'],['transfer','Take more courses outside my university']],p.priority||'balanced')+
      chooseField('proctoringPreference','Exams in outside courses',[['open','Show all eligible courses'],['avoid','Prefer courses without monitored exams']],p.proctoringPreference||'open')+'<p class="portal-hint">Self-paced courses can still have monitored exams. Your university may also require exams.</p>'+
      '<details class="portal-tip"><summary>Budget, study time and coursework (optional)</summary><div class="portal-profile-grid"><label class="portal-field"><span>Budget to finish your degree ($)</span><input type="number" name="budget" min="0" max="1000000" step="1" inputmode="numeric" value="'+esc(p.budget??'')+'" placeholder="No limit set"></label><label class="portal-field"><span>Study hours per week</span><input type="number" name="weeklyHours" min="1" max="100" step="1" inputmode="numeric" value="'+esc(p.weeklyHours??'')+'" placeholder="Not sure yet"></label></div>'+chooseField('assessmentPreference','How do you prefer to show what you know?',[['mixed','A mix is fine'],['projects','Projects'],['writing','Written assignments'],['exams','Exams']],p.assessmentPreference||'mixed')+'</details>';
    if(flow.mode==='target'&&id==='prior'&&state.profile.degree)body='<p class="portal-profile-note">Your degree: '+esc(state.profile.degree)+(state.profile.school?' · '+esc(state.profile.school):'')+'</p>'+body;
    const last=id==='priority',label=last?(flow.mode==='preferences'?'Save my preferences':flow.mode==='target'?'Open my course plan':'Find my degree plans'):'Continue';
    return '<form id="portal-profile-form" class="portal-quick-form" data-profile-step="'+id+'">'+body+'<button class="portal-primary" type="submit">'+label+'</button></form>'+(flow.mode==='preferences'?'<div class="portal-links">'+button('cancel-profile','Back to my plan',true)+'</div>':'');
  }
  function profileSummaryHTML() {
    if(!state.journey.profileCompleted)return '';
    const p=state.profile,summary=[p.modality==='campus'?'On campus':p.modality==='online'?'Online':'Online or on campus',({balanced:'Balance time and cost',speed:'Finish sooner',cost:'Spend less',transfer:'Take more courses outside my university'})[p.priority],p.learningPace==='self-paced'?'Prefer self-paced courses':p.learningPace==='scheduled'?'Prefer a class schedule':'',p.modality!=='online'&&p.campusLocation==='near-home'?(p.homeState?'Prefer campuses in '+(stateChoices.find(([id])=>id===p.homeState)?.[1]||p.homeState):'Prefer staying near home'):'',p.modality!=='online'?({'one-year':'Prefer about one year on campus','two-years':'Prefer about two years on campus','three-plus':'Prefer three or more years on campus'})[p.campusTime]:'',p.proctoringPreference==='avoid'?'Prefer outside courses without monitored exams':''].filter(Boolean);
    return '<section class="portal-profile-summary" aria-label="Your preferences"><h2>Built around your choices</h2><p>'+summary.map(esc).join(' · ')+'</p>'+(p.modality!=='online'&&p.campusInterests?.length?'<p class="portal-hint">Campus interests: '+p.campusInterests.map(id=>campusInterestChoices.find(([value])=>value===id)?.[1]).filter(Boolean).map(esc).join(', ')+'.</p>':'')+button('edit-search-profile','Edit my preferences',true)+'</section>';
  }
  async function submitProfileStep(form) {
    captureProfileValues(form);
    const id=state.journey.step,p=profileValues(),flow=profileFlow();let next=clone(state);
    if(id==='purpose'){
      const licensed=protectedGoals.includes(p.goal);next=Journey.applyAnswer(next,'purpose',licensed?'licensed-career':p.goal,catalog);if(licensed)next=Journey.applyAnswer(next,'career',p.goal,catalog);
      if(flow.mode==='explore'){next=Journey.applyAnswer(next,'field',licensed?'any':p.field,catalog);next=Journey.applyAnswer(next,'level',p.degreeLevel,catalog);}
    }
    if(id==='prior'){
      next=Journey.setPriorCredits(next,p.prior==='unknown'?'later':p.prior==='degree'?'some':p.prior);
      if(p.prior==='degree')next=Journey.applyAnswer(next,'prior','degree',catalog);
      next=Journey.applyAnswer(next,'military',p.military||p.militaryStatus||'none',catalog);
      if(['active','veteran','reserve'].includes(next.profile.militaryStatus))next=Journey.applyAnswer(next,'military-records',p.militaryRecords||'not-sure',catalog);
    }
    if(id==='format'){
      if(flow.mode==='explore')next=Journey.applyAnswer(next,'format',{modality:p.format==='some-classroom'?'any':p.format||p.modality,classroomImportance:p.format==='campus'?'essential':p.format==='some-classroom'?'preferred':'open'},catalog);
      const normalized=DegreeGuide.normalizeProfile(p);
      for(const name of ['campusLocation','homeState','campusInterests','campusTime','learningPace'])next.profile[name]=clone(normalized[name]);
    }
    if(id==='priority'){
      next=Journey.applyAnswer(next,'priority',p.priority,catalog);
      for(const [name,max] of [['budget',1000000],['weeklyHours',100]]){const value=p[name];if(value!==''&&value!==null&&value!==undefined&&(!Number.isFinite(Number(value))||Number(value)<(name==='budget'?0:1)||Number(value)>max))throw Error(name==='budget'?'Enter a budget between $0 and $1,000,000, or leave it blank.':'Enter between 1 and 100 study hours per week, or leave it blank.');next.profile[name]=value===''||value===null||value===undefined?null:Number(value);}
      if(!['open','avoid'].includes(p.proctoringPreference)||!['mixed','exams','writing','projects'].includes(p.assessmentPreference))throw Error('Choose your assessment preferences.');
      next.profile.proctoringPreference=p.proctoringPreference;next.profile.assessmentPreference=p.assessmentPreference;
    }
    state=next;
    if(id!=='priority'){state.journey.step=profileSteps()[profileSteps().indexOf(id)+1];persistProfileDraft();render();return;}
    if(state.profile.hasPrior==='none'&&latestStoredPlan()?.learning.some(record=>record.status==='earned'))throw Error('Your saved courses now include completed learning. Go back to Your starting point and choose that you have courses.');
    if(flow.mode==='target'){
      const target=Journey.buildDraft(state,catalog,models);
      if(target.targetReviewNeeded){profileFlow().askGoal=true;state.journey.step='purpose';persistProfileDraft();render();showError(Error('This degree does not match that career goal. Choose a goal that fits this degree, or go back to choose another degree.'));return;}
    }
    state.journey={...state.journey,profileCompleted:true,profileVersion:1,intakeCompleted:true};
    if(flow.mode==='preferences'){
      const latest=latestStoredPlan();if(!latest||(latest.selectedPathwayId||'')!==flow.baseTarget)throw Error('Your active degree changed in another tab. Reopen My preferences to update that plan.');
      const selected=clone(latest),keys=['priority',...learnerPreferenceFields];
      for(const name of keys)if(Object.hasOwn(state.profile,name))selected.profile[name]=clone(state.profile[name]);
      selected.journey={...selected.journey,profileCompleted:true,profileVersion:1,intakeCompleted:true,creditsDeferred:state.journey.creditsDeferred,answers:{...selected.journey.answers,...Object.fromEntries(['prior','military','military-records','priority'].filter(name=>Object.hasOwn(state.journey.answers,name)).map(name=>[name,clone(state.journey.answers[name])]))}};
      delete selected.journey.profileFlow;state=selected;state.journey.view='home';state.journey.completed=true;state.journey.step='review';page='home';render();if(saveOK)clearProfileDraft();return;
    }
    delete state.journey.profileFlow;
    if(flow.mode==='target'){openPlan();if(saveOK)clearProfileDraft();return;}
    rememberExplorationSearch();state.journey.step='routes';if(save())clearProfileDraft();announce(FINDING_NOTICE);resultNotice=FINDING_NOTICE;await prepareRecommendations();
  }
  function questionBody(id) {
    const p = state.profile;
    if(profileFlow()&&profileStepIds.includes(id))return profileBody(id);
    switch (id) {
      case 'start': return (state.journey.completed && p.school && p.degree ? '<div class="portal-current-target"><strong>'+esc(p.degree)+'</strong><p>'+esc(p.school)+'</p>'+button('keep-target','Open my plan',true)+'</div>' : '')+choices([
        ['explore','Help me choose','Find a degree that fits my goals, time and budget.'],
        ['target',state.journey.completed?'Change my degree':'I know my degree','Choose my college and degree.'],
        ['audit','Use my past courses','Upload a transcript or course spreadsheet.']
      ])+'<details class="portal-tip portal-more-starts"><summary>More ways to start</summary><div class="portal-start-browse"><a href="request-plan.html">Paste a degree link</a></div><div class="portal-start-browse"><a href="degree-audit.html">Build my own plan from scratch</a></div><div class="portal-start-browse"><a href="courses.html?tab=browse">Browse transfer courses</a></div></details>';
      case 'school': {
        const schools = [...new Set(catalog.pathways.filter(r => r.routeType !== 'career-guide').map(r => r.school).filter(Boolean))].sort() /* career guides name a step ("Choose a … provider"), not a school */;
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
    const selected=target.allowSchoolChange&&target.route?Journey.selectRoute(previous,target.route,catalog):Journey.applyAnswer(previous,state.journey.step==='routes'?'routes':'degree',target.route?.id||{degree:target.degree,allowUnlisted:true},catalog),resolved=DegreeProgramCatalog.resolveTarget(selected,catalog).state;
    const pending=pendingDiscoveries.get(resolved.selectedPathwayId);
    const ready=pending?DegreeProgramCatalog.rememberDiscovery(resolved,pending):resolved;
    return {state:ready,draft:Journey.buildDraft(ready,catalog,models)};
  }
  // Guided builds start from the same published starting route as the finder and plan pages when the student
  // has no saved course choices for that degree. Saved choices and course sources are never overridden.
  // A new visitor opens a plan on its starting route (see seedStartingRoute), so the preview quotes the same credits as the card and worksheet.
  function startingCredits(route){
    const model=(models||[]).find(item=>item.id===route?.modelId),saved=model&&state.scenarios?.[model.id],outside=planIndex?.plans?.[route?.id]?.start?.outside;
    if(!model||route.id==='gcu-bsba-campus'||(state.learning||[]).length||state.profile?.proctoringPreference==='avoid'||Array.isArray(saved?.providers)||Object.keys(saved?.optionSelections||{}).length)return null;
    return Number.isFinite(outside)&&outside>=0?outside:null;
  }
  async function seedStartingRoute(next,route) {
    const model=models.find(item=>item.id===route?.modelId);
    if(!model||route.id==='gcu-bsba-campus'||Object.keys(next.scenarios?.[model.id]?.optionSelections||{}).length)return next;
    let data;try{const response=await fetch('data/baseline-index.json');if(!response.ok)return next;data=await response.json();}catch{return next;}
    const baseline=Object.values(data?.baselines||{}).find(item=>item.modelId===model.id&&item.pathwayId===route.id);
    if(!baseline||baseline.summary?.totalCredits!==model.totalCredits||!Array.isArray(baseline.rows))return next;
    const selections={};
    for(const row of baseline.rows){const req=model.requirements.find(item=>item.id===row.requirementId),option=req?.options.find(item=>item.id===row.optionId&&item.provider===row.provider&&item.credits===row.credits);if(!option)return next;if(next.profile.proctoringPreference==='avoid'&&['CLEP','DSST','Saylor','StraighterLine'].includes(option.provider))continue;selections[req.id]=option.id;}
    const scenario=Sheet.scenario(next,model.id),explicit=Array.isArray(next.scenarios?.[model.id]?.providers);
    if(!explicit)scenario.providers=[...new Set([...scenario.providers,...model.requirements.flatMap(req=>req.options.filter(option=>selections[req.id]===option.id).map(option=>option.provider)).filter(provider=>provider&&provider!=='University')])];
    else for(const req of model.requirements){const option=req.options.find(item=>item.id===selections[req.id]);if(option&&option.provider!=='University'&&!scenario.providers.includes(option.provider))delete selections[req.id];}
    return {...next,scenarios:{...next.scenarios,[model.id]:{...scenario,optionSelections:selections}}};
  }
  // Build my plan (start.html) step 2 passes the credits answer as ?then=; the plan opens on that existing step.
  function afterPlanUrl() {
    const then=new URLSearchParams(location.search).get('then');
    return ({none:'plan.html?task=credits&prior=none',later:'plan.html?task=credits&prior=later',some:'plan.html?task=credits&manual=1',upload:'import-courses.html?from=plan',military:'plan.html?task=preferences'})[then]||'plan.html';
  }
  async function usePublicPlan(id) {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Error('Choose a degree plan from the plan library.');
    const route=catalog.pathways.find(item=>item.id===id);
    if(!route||!routeHasMap(route))throw Error('This course plan is not available. Your existing plan is still saved.');
    await ensureRouteModels(route);
    const previous=selectionState(),beforeState=state;
    state=previous;
    let next;
    try{
      const selecting=clone(previous);
      if(route.modalities?.length===1){selecting.profile.modality=route.modalities[0];if(selecting.profile.modality==='online'&&selecting.profile.classroomImportance==='essential')selecting.profile.classroomImportance='open';}
      next=DegreeProgramCatalog.resolveTarget(Journey.selectRoute(selecting,route,catalog),catalog).state;
    }catch(error){state=beforeState;throw error;}
    const model=models.find(item=>item.id===route.modelId);
    if(!model){state=beforeState;throw Error('The course requirements could not load. Your existing plan is still saved.');}
    const hasChoices=Object.keys(next.scenarios?.[model.id]?.optionSelections||{}).length>0;
    if(!hasChoices){
      const response=await fetch('data/baseline-index.json');
      if(!response.ok){state=beforeState;throw Error('The saved course choices could not load. Reload to try again.');}
      const data=await response.json(),baseline=Object.values(data.baselines||{}).find(item=>item.modelId===model.id&&item.pathwayId===route.id);
      if(baseline){
        const ids=Array.isArray(baseline.rows)?baseline.rows.map(row=>row.requirementId):[];
        if(baseline.summary?.totalCredits!==model.totalCredits||ids.length!==model.requirements.length||new Set(ids).size!==ids.length||model.requirements.some(req=>!ids.includes(req.id))||reviewedRoute(route)&&(baseline.qualityReady!==true||baseline.researchStatus!=='research-ready')){state=beforeState;throw Error('The complete saved course choices are temporarily unavailable. Your existing plan is still saved.');}
        const gcu=route.id==='gcu-bsba-campus'&&model.id==='curriculum-gcu-bsba-campus',planner=window.DegreePlanner;
        const creditBalance=gcu&&planner?.creditBalancePolicy(model);
        if(gcu&&(!creditBalance||baseline.modality!=='campus'||baseline.rows.some(row=>row.status!=='planned'))){state=beforeState;throw Error('The saved course choices need an updated credit check. Your existing plan is still saved.');}
        const selections={};
        for(const row of baseline.rows||[]){
          const req=model.requirements.find(item=>item.id===row.requirementId);
          const inactiveBalance=creditBalance&&creditBalance.balanceRequirementIds.includes(req?.id)&&req.credits===0&&row.credits===0&&row.optionId===null&&row.provider===null&&row.code===null;
          if(inactiveBalance)continue;
          const option=req?.options.find(item=>item.id===row.optionId&&item.provider===row.provider&&item.credits===row.credits&&(!gcu||item.code===row.code));
          if(!option){state=beforeState;throw Error('The saved course choices have changed. Open the plan again to load its latest version.');}
          if(creditBalance&&creditBalance.balanceRequirementIds.includes(req.id))continue;
          if(next.profile.proctoringPreference==='avoid'&&['CLEP','DSST','Saylor','StraighterLine'].includes(option.provider))continue;
          selections[req.id]=option.id;
        }
        if(gcu){
          // Rebuild from canonical reviewed options, never from an uploaded
          // credit claim. A zero-native balance row may be inactive; a selected
          // outside content match counts its actual three-credit award.
          const providers=[...new Set(baseline.rows.map(row=>row.provider).filter(provider=>provider&&provider!=='University'))];
          const verified=planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:selections});
          const validation=planner.validate(model,verified),sources=new Set(model.sources.map(source=>source.id));
          const sameRows=verified.rows.length===baseline.rows.length&&baseline.rows.every(row=>{
            const actual=verified.rows.find(item=>item.requirementId===row.requirementId);
            return actual&&actual.status==='planned'&&actual.credits===row.credits&&(actual.option?.id||null)===row.optionId&&(actual.option?.provider||null)===row.provider&&(actual.option?.code||null)===row.code&&(!actual.option||Array.isArray(actual.option.sourceIds)&&actual.option.sourceIds.length>0&&actual.option.sourceIds.every(id=>sources.has(id)));
          });
          if(!sameRows||validation.academicCountsValid!==true||verified.totals.accounted!==120||verified.totals.confirmed!==0||verified.totals.reported!==0||verified.totals.external!==baseline.summary.transferCredits||verified.totals.institutional!==baseline.summary.universityCredits){state=beforeState;throw Error('The saved course choices need an updated credit check. Your existing plan is still saved.');}
        }
        const scenario=Sheet.scenario(next,model.id);
        if(gcu){
          const selectedProviders=[...new Set(baseline.rows.map(row=>row.provider).filter(provider=>provider&&provider!=='University'))];
          if(Array.isArray(next.scenarios?.[model.id]?.providers)){
            if(selectedProviders.some(provider=>!scenario.providers.includes(provider))){state=beforeState;throw Error('The saved course choices use a source you turned off. Review your course sources before opening this plan. Your existing plan is still saved.');}
          }else scenario.providers=[...new Set([...scenario.providers,...selectedProviders])];
        }else if(!Array.isArray(next.scenarios?.[model.id]?.providers)){
          // Without saved course-source choices, include every provider the starting route actually selects
          // (e.g. StraighterLine), so the worksheet opens with the same credits as the published route.
          // Saved choices are never overridden; the worksheet then plans within them.
          const selectedProviders=[...new Set(model.requirements.flatMap(req=>req.options.filter(option=>selections[req.id]===option.id).map(option=>option.provider)).filter(provider=>provider&&provider!=='University'))];
          scenario.providers=[...new Set([...scenario.providers,...selectedProviders])];
        }
        next.scenarios={...next.scenarios,[model.id]:{...scenario,optionSelections:selections}};
      }else if(reviewedRoute(route)||route.id==='gcu-bsba-campus'&&model.id==='curriculum-gcu-bsba-campus'){state=beforeState;throw Error('The saved course choices are temporarily unavailable. Your current plan is still saved.');}
    }
    const latest=latestStoredPlan();
    if(latest&&targetChanged(previous,latest)){state=beforeState;throw Error('Your degree changed in another tab. Open your current plan before choosing another degree.');}
    if(latest&&JSON.stringify(DegreeGuide.normalizeProfile(previous.profile))!==JSON.stringify(DegreeGuide.normalizeProfile(latest.profile))){state=beforeState;throw Error('Your preferences changed in another tab. Open the plan again to use your latest choices.');}
    if(latest&&JSON.stringify(previous.scenarios?.[model.id]||null)!==JSON.stringify(latest.scenarios?.[model.id]||null)){state=beforeState;throw Error('Your course choices changed in another tab. Review those choices before opening this plan again.');}
    if(latest){next.scenarios={...next.scenarios,...latest.scenarios,[model.id]:next.scenarios?.[model.id]||{}};next.learning=clone(latest.learning);next.sheet={...next.sheet,notes:clone(latest.sheet?.notes||{})};}
    next.profile.entry='target';
    next.journey={...next.journey,answers:{...next.journey.answers,start:'target',school:route.school,degree:route.id,routes:route.id,format:{modality:next.profile.modality,classroomImportance:next.profile.classroomImportance}}};
    delete next.journey.explorationSearch;
    if(next.profile.hasPrior==='none'&&next.learning.some(item=>item.status==='earned')){next.profile.hasPrior='some';next.journey.answers.prior='some';}
    const check=Journey.buildDraft(next,catalog,models);
    if(check.targetReviewNeeded||!check.plan||check.plan.validation?.academicCountsValid!==true){state=clone(beforeState);state.journey={...state.journey,view:'questions',step:'degree'};await previewDegree(route,{explicitFormat:true,allowSchoolChange:true});return false;}
    assertPreviousPlanSaved(latest||previous,check.state);
    state=check.state;state.journey={...state.journey,view:'home',step:'review',completed:true,creditsDeferred:!state.learning.some(item=>item.status==='earned')&&state.profile.hasPrior!=='none',planReviewed:false,schoolContacted:false};
    degreePreview=null;page='home';save();
    if(!saveOK){render();showError(Error('This browser could not save your plan. Keep this page open and download a private backup.'));return false;}
    clearProfileDraft();trackPlanStarted(route.id);const destination=afterPlanUrl();history.replaceState(null,'',location.pathname);location.assign(destination);return true;
  }
  // Format buttons name the study format; when two variants share a format
  // (a concentration offered online, say), the title part that differs is added.
  function variantChoiceLabel(route,choices) {
    const format=route.modalities.includes('online')?'Online':'On campus';
    if(choices.filter(r=>r.modalities.includes('online')===route.modalities.includes('online')).length<2)return format;
    const extra=String(route.title||'').split(' — ').slice(1).filter(part=>!/^(online|residential|on campus)$/i.test(part.trim()));
    return extra.length?extra.join(' — ')+' · '+format:format;
  }
  function degreeReadinessBody(target) {
    if(target.unavailable){const research=degreeResearchURL(target.route);return '<article class="portal-readiness-card"><h2>Build a plan for this degree.</h2><p>'+esc(target.route?.title||target.degree||'This degree')+' does not have a completed template yet. Your current plan and courses stay saved.</p><div class="portal-actions"><a class="portal-primary" href="'+esc(research||auditURL(target))+'">'+(research?'Research this degree →':'Build my own plan →')+'</a>'+button('degree-search','Browse available course plans',true)+'</div></article>';}
    if(target.loading)return '<article class="portal-readiness-card" aria-busy="true"><h2>'+esc(target.route?.title||'Your degree')+'</h2><p role="status">Checking official degree requirements…</p></article>';
    if(target.loadError)return '<article class="portal-readiness-card"><h2>We could not load these course requirements.</h2><p role="alert">'+esc(target.loadError)+'</p><p>Your saved plan and courses are unchanged.</p>'+button('retry-degree','Try again')+button('degree-search','Choose another degree',true)+'</article>';
    if(target.discovery?.status==='choose-variant')return '<article class="portal-readiness-card"><h2>'+esc(target.route.title)+'</h2><p>Choose the exact university program.</p><div class="portal-choices">'+(target.discovery.variants||[]).map(variant=>'<button type="button" class="portal-choice" data-source-variant="'+esc(variant.id)+'"><span><strong>'+esc(variant.title)+'</strong><small>'+esc((variant.modalities||[]).map(mode=>mode==='online'?'Online':'On campus').join(' / ')||'Confirm study format')+'</small></span><span aria-hidden="true">→</span></button>').join('')+'</div></article>';
    let route=target.route;const choices=DegreeProgramCatalog.variants(route,catalog);const preferred=choices.find(r=>r.modalities.includes(state.profile.modality))||(state.profile.classroomImportance==='essential'?choices.find(r=>r.modalities.includes('campus')):null);
    if(choices.length&&(!preferred||target.chooseFormat))return '<article class="portal-readiness-card"><h2>'+esc(route.title)+'</h2><p>Where will you study? Course requirements can differ by study format.</p><div class="portal-actions">'+choices.map(r=>'<button class="portal-primary" type="button" data-variant-preview="'+esc(r.id)+'">'+esc(variantChoiceLabel(r,choices))+'</button>').join('')+'</div></article>';
    if(preferred)route=preferred;const source=officialSource(route);
    let proposed=null,error='';try{proposed=previewSelection(target).draft;}catch(e){error=e.message;}
    const mapped=Boolean(proposed?.plan),hasMap=Boolean(proposed?.mapAvailable||routeHasMap(route)),formatOnly=proposed?.targetIssues?.length&&proposed.targetIssues.every(issue=>['modality','classroomImportance'].includes(issue.field)),needsReview=Boolean(error||proposed?.targetReviewNeeded||hasMap&&!mapped),unsupported=!hasMap&&!error;
    const title=route?.title||target.degree,school=route?.school||state.profile.school;
    if(!mapped&&!needsReview&&activePlanState&&target.confirmUnmappedReplacement){
      return '<article class="portal-readiness-card"><span class="portal-readiness-label">Course plan not available</span><h2>Save this goal instead?</h2><p><strong>'+esc(title)+'</strong> at '+esc(school)+' does not have a course-by-course transfer plan yet.</p><p>This will replace '+esc(activePlanState.profile.degree||'your current degree')+' as your active goal. Your courses and notes stay saved.</p><div class="portal-actions">'+button('keep-active-plan','Back to my plan')+button('confirm-unmapped-replacement','Save this goal instead',true)+'</div></article><div class="portal-links">'+button('degree-search','Choose another degree',true)+'</div>';
    }
    const note=error||(proposed?.targetReviewNeeded?'This degree does not match your saved career or study preferences.':hasMap&&!mapped?(proposed?.targetUnknowns||[]).map(issue=>issue.title+'.').join(' ')||'Review the missing program details before building this course plan.':mapped?(startingCredits(route)!==null?startingCredits(route)+' proposed transfer '+(route?.creditUnit==='competency-unit'?'competency units':'credits')+' on this plan’s starting route. Your courses, course sources and priorities can change this.':proposed.plan.coverage.mappedExternalCredits+' proposed transfer '+(proposed.program?.creditSystem==='competency-unit'?'competency units':'credits')+' with your current planner settings. Course sources and priorities can change this.')+(DegreeProgramCatalog.planChoiceCount(route,catalog,models)>0?' '+DegreeProgramCatalog.planChoiceCount(route,catalog,models)+' course choices to make.':''):'No course-by-course transfer plan is available for this degree yet.');
    const actions=formatOnly?'<button class="portal-primary" type="button" data-variant-preview="'+esc(route.id)+'">Use '+(route.modalities.includes('online')?'online':'on-campus')+' study</button>':needsReview?button('change-preferences','Update my preferences'):!mapped&&activePlanState?button('keep-active-plan','Back to my plan')+button('request-unmapped-replacement','Save this goal instead',true):button('use-degree',mapped?'Build course plan':'Save goal');
    const opportunitySchool=window.DegreeProgramOpportunities?.schoolFor(catalog,route),programFacts=opportunitySchool?DegreeProgramOpportunities.detailsHTML(route,opportunitySchool):'';
    const formatNote=mapped&&proposed.targetUnknowns?.some(issue=>issue.field==='modality')?'<p class="portal-hint" role="note">Confirm this degree’s study format with the university before enrolling.</p>':'';
    return '<article class="portal-readiness-card"><span class="portal-readiness-label">'+(mapped?'Transfer-course plan':unsupported?'Course plan not available':'Check your preferences')+'</span><h2>'+esc(title)+'</h2><p class="portal-target-school">'+esc(school)+'</p>'+programFacts+schoolCheckHTML(route,target.route)+(mapped?leadActionsHTML(route):'')+formatNote+'<p>'+esc(note)+'</p>'+(source?'<a href="'+esc(source.url)+'" target="_blank" rel="noopener">Official degree information ↗</a>':'')+'<div class="portal-actions">'+actions+'</div></article><div class="portal-links">'+button('degree-search','Choose another degree',true)+'</div>';
  }
  document.addEventListener('input',event=>{if(event.target.matches('#portal-question-form [name="degree"]'))renderDegreeOptions(true);});
  document.addEventListener('change',event=>{if(['portal-degree-level','portal-degree-format'].includes(event.target.id))renderDegreeOptions(true);if(event.target.matches('#portal-explore-form [name=goal]'))$('portal-subject-field').hidden=protectedGoals.includes(event.target.value);});
  const knownEstimate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const dollars=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  function publishedRate(program) {
    if(program?.auditProvenance?.status==='student-provided')return '';
    const pricing=program?.pricing,sources=new Map((program?.sources||[]).map(source=>[source.id,source]));
    if(!pricing||pricing.currency&&pricing.currency!=='USD'||!Array.isArray(pricing.sourceIds)||!pricing.sourceIds.length)return '';
    const bound=pricing.sourceIds.every(id=>{try {const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}});
    if(pricing.sourceUrl&&!pricing.sourceIds.some(id=>sources.get(id)?.url===pricing.sourceUrl))return '';
    if(!bound||!['subscription','per-term','per-semester'].includes(pricing.model)||!knownEstimate(pricing.amount)||pricing.amount===0)return '';
    return dollars(pricing.amount)+' / '+(pricing.period||'term');
  }
  let planIndex=null;
  const personalEstimates=new WeakMap();
  // Same plan-estimate engine and reviewed rates as the plan page. Rows matched
  // to finished courses are excluded from new course charges by that engine; the
  // difference from the same plan with those rows still to take is the outside-
  // course spending they avoid. Nothing here awards or confirms credit.
  function personalEstimate(candidateDraft) {
    const engine=window.DegreePlanEstimate,plan=candidateDraft?.plan,program=candidateDraft?.program;
    if(!engine?.calculate||!estimateRates||!plan||!program||!Array.isArray(plan.rows))return null;
    if(personalEstimates.has(candidateDraft))return personalEstimates.get(candidateDraft);
    let value=null;
    try{
      const finished=plan.rows.filter(row=>['reported','confirmed'].includes(row.status)&&!row.unknownProvenance&&row.option&&row.option.provider!=='University'&&row.institutional!==true);
      if(finished.length){
        const now=engine.calculate({program,plan,rates:estimateRates}),before=engine.calculate({program,plan:{...plan,rows:plan.rows.map(row=>finished.includes(row)?{...row,status:'planned'}:row)},rates:estimateRates});
        const known=result=>result?.available===true&&result.status==='planning-range'&&knownEstimate(result.costs?.knownRange?.min)&&knownEstimate(result.costs?.knownRange?.max);
        if(known(now)&&known(before)){
          const low=Math.round(before.costs.knownRange.min-now.costs.knownRange.min),high=Math.round(before.costs.knownRange.max-now.costs.knownRange.max);
          if(low>=0&&high>=0&&Math.max(low,high)>0)value={remaining:{...now.costs.knownRange},full:{...before.costs.knownRange},saved:{min:Math.min(low,high),max:Math.max(low,high)},credits:finished.reduce((sum,row)=>sum+(Number(row.credits)||0),0)};
        }
      }
    }catch{value=null;}
    personalEstimates.set(candidateDraft,value);return value;
  }
  async function loadEstimateRates() {
    if(estimateRates||!window.DegreePlanEstimate)return;
    try{const response=await fetch('data/plan-estimate-rates.json');if(response.ok)estimateRates=await response.json();}catch{estimateRates=null;}
  }
  function sharedTiming(timing) {
    const valid=value=>value&&knownEstimate(value.min)&&knownEstimate(value.max)&&value.max>=value.min,span=value=>value.min===value.max?String(value.min):value.min+'–'+value.max;
    if(!valid(timing?.outsideMonths)||!valid(timing?.universityTerms))return '';
    const terms=timing.termMonths===6?'six-month terms':timing.termLabel==='semester'?'semesters':timing.termLabel==='trimester'?'trimesters':'study periods';
    return 'About '+span(timing.outsideMonths)+' months of outside courses, then '+span(timing.universityTerms)+' university '+terms;
  }
  // Spend less: order by the shared planning estimate (the finder's and plan pages' range): low end, then midpoint.
  // Complete estimates first, then known-charges-so-far ranges, then plans without an estimate (labelled on their cards).
  function sharedCostOrder(ids) {
    const estimate=id=>{const value=planIndex?.plans?.[id]?.estimate;return value&&knownEstimate(value.min)&&knownEstimate(value.max)?value:null;},group=id=>{const value=estimate(id);return !value?2:value.partial?1:0;};
    const ordered=[...ids].sort((a,b)=>{const ga=group(a),gb=group(b);if(ga!==gb||ga===2)return ga-gb;const ea=estimate(a),eb=estimate(b);return ea.min-eb.min||(ea.min+ea.max)-(eb.min+eb.max);});
    return {ordered,partial:ordered.filter(id=>group(id)===1).length,unestimated:ordered.filter(id=>group(id)===2).length};
  }
  function routeCard(result,scenario=null,secondary=false) {
    const r=result.pathway,modeled=routeHasMap(r),choiceCount=DegreeProgramCatalog.planChoiceCount(r,catalog,result.model?[result.model]:models),format=(r.modalities||[]).map(m=>m==='campus'?'On campus':'Online').join(' / '),summary=scenario?.summary||scenario;
    let plan=scenario?.draft?.plan,credits='';
    const mapped=knownEstimate(summary?.mappedExternalCredits)?summary.mappedExternalCredits:plan?.coverage?.mappedExternalCredits;
    // Without the student's own courses, quote the published starting route (the same number the finder and worksheet show).
    const startEntry=planIndex?.plans?.[r.id]?.start,startOutside=!(state.learning||[]).length&&knownEstimate(startEntry?.outside)?startEntry.outside:null;
    if(knownEstimate(startOutside??mapped))credits=(startOutside??mapped)+' proposed transfer '+(summary?.creditSystem==='competency-unit'||plan?.creditSystem==='competency-unit'||scenario?.draft?.program?.creditSystem==='competency-unit'||result.model?.creditSystem==='competency-unit'?'competency units':'credits');
    const amount=knownEstimate(summary?.remainingCost)?summary.remainingCost:knownEstimate(summary?.estimatedBaseCost)?summary.estimatedBaseCost:null;
    // One shared planning range (tuition, fees and outside courses) — the same figure the plan pages and finder show.
    const indexed=planIndex?.plans?.[r.id],shared=indexed?.estimate,sharedRange=shared&&knownEstimate(shared.min)&&knownEstimate(shared.max)?dollars(shared.min)+'–'+dollars(shared.max):'',hasPersonalCost=knownEstimate(summary?.remainingCost);
    const rate=amount===null&&!sharedRange?publishedRate(scenario?.draft?.program||result.model):'';
    const units=summary?.creditSystem==='competency-unit'||scenario?.draft?.program?.creditSystem==='competency-unit'||result.model?.creditSystem==='competency-unit'?'competency units':'credits';
    // The plan-estimate range for this plan with the student's finished courses
    // removed from course charges. Shown only when every price is known and the
    // same method reproduces the shared full-route range (or none is published).
    const personalRange=hasPersonalCost?null:personalEstimate(scenario?.draft),sameBasis=personalRange&&(!sharedRange||Math.abs(personalRange.full.min-shared.min)<1&&Math.abs(personalRange.full.max-shared.max)<1);
    const range=value=>dollars(value.min)+(value.max!==value.min?'–'+dollars(value.max):'');
    const remaining=sameBasis?'<div><dt>Your remaining planning estimate</dt><dd>'+esc(range(personalRange.remaining))+'</dd></div><div><dt>Full-route planning estimate</dt><dd>'+esc(range(personalRange.full))+'</dd></div>':'';
    const cost=hasPersonalCost?'<div><dt>Your remaining cost estimate</dt><dd>'+esc(dollars(summary.remainingCost))+'</dd></div>'+(sharedRange?'<div><dt>Full-route planning estimate</dt><dd>'+esc(sharedRange)+'</dd></div>':''):remaining?remaining:sharedRange?'<div><dt>'+(shared.partial?'Known charges so far':'Planning estimate')+'</dt><dd>'+esc(sharedRange)+'</dd></div>':indexed?'<div><dt>Cost</dt><dd>Needs confirmation</dd></div>':amount===null?(rate?'<div><dt>Published university rate</dt><dd>'+esc(rate)+'</dd></div>':''):'<div><dt>Tuition + courses estimate</dt><dd>'+esc(dollars(amount))+'</dd></div>';
    // Finish sooner: the published starting route's study time from the same shared estimate (outside months, then
    // university terms at its stated pace assumptions). Nothing is shown when the data has no timing for this plan.
    const indexedTiming=state.profile.priority==='speed'&&!(state.learning||[]).length?sharedTiming(indexed?.timing):'';
    const timing=indexedTiming?'<div><dt>Study time · starting route</dt><dd>'+esc(indexedTiming)+'</dd></div>':knownEstimate(summary?.estimatedWeeks)?'<div><dt>Estimated study time</dt><dd>'+esc(summary.estimatedWeeks)+' weeks</dd></div>':'';
    const fit=knownEstimate(summary?.collectionFitCredits)&&summary.collectionFitCredits>0?'<span>'+esc(summary.collectionFitCredits)+' '+units+' fit from My courses'+(personalRange&&!remaining?' (about '+esc(range(personalRange.saved))+' of outside-course spending avoided)':'')+'</span>':'';
    const reviewCount=(Array.isArray(summary?.reviewCourses)?summary.reviewCourses:[]).filter(course=>course?.status==='earned').length;
    const review=reviewCount?'<span class="portal-route-review">'+reviewCount+' finished course'+(reviewCount===1?' needs':'s need')+' review</span>':'';
    const estimate=cost||timing?'<dl class="portal-route-estimates">'+cost+timing+'</dl><p class="portal-estimate-note">Planning estimates before financial aid.'+(hasPersonalCost?' Your remaining cost uses the courses you have already added.':'')+(remaining?' Your remaining estimate is the full-route planning estimate (tuition, listed fees and outside courses, as on the plan page) minus about '+esc(range(personalRange.saved))+' of outside-course charges for the '+esc(personalRange.credits)+' '+units+' your finished courses may cover.'+(personalRange.saved&&personalRange.saved.max<250?' The saving is small because those courses were already planned through low-cost subscriptions, so finishing them early mostly saves time rather than money.':'')+' Your school decides what transfers.':sharedRange?(shared.partial?' Known charges cover tuition, listed fees and priced outside courses; '+esc((shared.unpriced||[]).join(' and ')||'some course')+' prices are not included yet.':' The planning estimate covers tuition, listed fees and outside courses, as on the plan page.'):indexed?' No reviewed planning estimate exists for this plan yet.':rate?' Total depends on paid terms needed.':cost&&!hasPersonalCost?' Fees and other extras are excluded.':'')+(timing?' Admissions and transfer processing are separate.':'')+'</p>':'';
    const personal=DegreeGuide.preferenceFit?DegreeGuide.preferenceFit(state.profile,r,result.model,catalog.campusFacts):{badges:[],reasons:[]};
    const badges=personal.badges.length?'<div class="portal-personal-badges" aria-label="Study and campus features">'+personal.badges.slice(0,3).map(badge=>badge.sourceUrl?'<a href="'+esc(badge.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(badge.label)+'</a>':'<span>'+esc(badge.label)+'</span>').join('')+'</div>':'';
    const why=personal.reasons.length?'<details class="portal-fit-reasons"><summary>Why this fits your preferences</summary><ul>'+personal.reasons.map(reason=>'<li>'+esc(reason)+'</li>').join('')+'</ul></details>':'';
    const questions=planQuestions(r),tier=planIndex?.plans?.[r.id]?(questions.length?'<p class="portal-tier"><span class="portal-tier-badge portal-tier-confirm">Needs school confirmation</span></p><details class="portal-confirm-questions"><summary>Before you pay for courses ('+questions.length+')</summary><ul>'+questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul><p>This course plan is complete, but these points are not yet confirmed in the school’s published rules.</p>'+schoolEmailLink(r)+'</details>':'<p class="portal-tier"><span class="portal-tier-badge portal-tier-reviewed">Reviewed plan</span></p>'):'';
    return '<article class="portal-route-card'+(questions.length?' portal-route-card-confirm':'')+'"><'+(secondary?'h3':'h2')+'>'+esc(r.title)+'</'+(secondary?'h3':'h2')+'><p class="portal-target-school">'+esc(r.school)+'</p>'+tier+badges+'<div class="portal-route-facts"><span>'+esc(format)+'</span>'+(credits?'<strong>'+esc(credits)+'</strong>':'')+fit+review+(choiceCount>0?'<span>'+choiceCount+' course choice'+(choiceCount===1?'':'s')+' to make</span>':'')+'</div>'+estimate+why+'<button type="button" class="portal-primary" data-degree-preview="'+esc(r.id)+'">'+(modeled?'See course plan':'See degree')+'</button></article>';
  }
  function progressStatus(progress) {const ready=[...progress.candidates.values()].filter(candidate=>candidate.available&&candidate.eligible).length;return 'Checked '+progress.checked+' of '+progress.matchingIds.length+' matching plans. '+ready+' ready to open.';}
  function matchingStatus(candidate) {return !candidate?'Waiting to check':candidate.available&&candidate.eligible?'Checked · ready to open':'Checked · '+(candidate.reason||'Needs review before a course plan is available.');}
  function recommendationProgressBody() {
    const progress=recommendationProgress;if(!progress)return '<p role="status">Preparing matching plans…</p>';
    const total=progress.matchingIds.length,ready=progress.readyIds.map(id=>routeCard(progress.results.get(id),progress.candidates.get(id))).join('');
    return '<div class="portal-comparing"><h2>Comparing your course plans…</h2><p id="portal-comparison-status" role="status" aria-live="polite">'+esc(progressStatus(progress))+'</p><progress id="portal-comparison-progress" aria-label="Matching plans checked" value="'+progress.checked+'" max="'+Math.max(1,total)+'">'+progress.checked+' of '+total+'</progress><p>Showing up to 3 checked plans while the others are still being checked. The order may change when the comparison finishes.</p>'+(total?'':'<p>Checking whether course plans match your choices.</p>')+'</div><div id="portal-ready-plans">'+ready+'</div><details class="portal-matching-plans"><summary>All matching plans ('+total+')</summary><ul>'+progress.matchingIds.map((id,index)=>{const result=progress.results.get(id);return '<li><div><strong>'+esc(result.pathway.title)+'</strong><span>'+esc(result.pathway.school)+'</span><span id="portal-match-status-'+index+'">'+esc(matchingStatus(progress.candidates.get(id)))+'</span></div><button type="button" class="portal-secondary" data-degree-preview="'+esc(result.pathway.id)+'">Check this plan</button></li>';}).join('')+'</ul></details>';
  }
  function updateRecommendationProgress() {
    const progress=recommendationProgress;if(!progress||!showingRecommendations())return;
    const status=$('portal-comparison-status'),bar=$('portal-comparison-progress'),ready=$('portal-ready-plans');
    if(status)status.textContent=progressStatus(progress);
    if(bar){bar.value=progress.checked;bar.max=Math.max(1,progress.matchingIds.length);}
    for(const id of progress.readyIds)if(!progress.renderedIds.has(id)&&ready){ready.insertAdjacentHTML('beforeend',routeCard(progress.results.get(id),progress.candidates.get(id)));progress.renderedIds.add(id);}
    progress.matchingIds.forEach((id,index)=>{const node=$('portal-match-status-'+index);if(node)node.textContent=matchingStatus(progress.candidates.get(id));});
  }
  function showRecommendationResults() {
    if(!showingRecommendations())return;
    $('portal-loading').hidden=true;$('portal-savings').hidden=true;document.body.classList.toggle('is-onboarding',true);
    const host=$('portal-recommendation-results');
    // Mount once without persisting the private worksheet or moving focus.
    if(!host){renderQuestion();updateResultNotice();return;}
    const focused=document.activeElement,route=focused?.dataset?.degreePreview,hadFocus=Boolean(host.contains?.(focused));
    host.innerHTML=recommendationResultsBody();updateResultNotice();
    // The empty state carries its own research action; the shared link below would repeat it.
    const degreeLink=document.querySelector?.('[data-degree-link]');if(degreeLink)degreeLink.hidden=resultCount===0;
    // Finished results: if the update left focus nowhere, start keyboard and screen-reader users at the main heading.
    if(!recommendationPending&&!hadFocus){const active=document.activeElement;if(!active||active===document.body||active===document.documentElement)$('portal-question-title')?.focus?.({preventScroll:true});}
    if(recommendationProgress)recommendationProgress.readyIds.forEach(id=>recommendationProgress.renderedIds.add(id));
    if(hadFocus&&route){const next=[...(host.querySelectorAll?.('[data-degree-preview]')||[])].find(node=>node.dataset.degreePreview===route);next?.closest?.('details')?.setAttribute('open','');next?.focus({preventScroll:true});}
  }
  function recommendationResultsBody() {
    if(recommendationPending){resultCount=null;return recommendationProgressBody();}
    const eligible=recommendationMatches||Journey.recommend({...state,learning:[]},availableCatalog(),[]),byId=new Map(eligible.map(result=>[result.pathway.id,result])),scenarios=new Map((recommendationView?.scenarios||[]).map(scenario=>[scenario.pathwayId,scenario])),candidates=new Map((recommendationView?.rankedCandidates||[]).map(candidate=>[candidate.pathwayId,candidate]));
    const orderedIds=[...new Set([...(recommendationView?.rankingScope?.orderedRouteIds||recommendationView?.scenarios?.map(scenario=>scenario.id)||[]).map(id=>id.replace(/^route:/,'')),...eligible.map(result=>result.pathway.id)])].filter(id=>byId.has(id)&&candidates.get(id)?.available!==false);
    const personalScores=new Map(orderedIds.map(id=>[id,DegreeGuide.preferenceFit?DegreeGuide.preferenceFit(state.profile,byId.get(id).pathway,byId.get(id).model,catalog.campusFacts).score:0]));
    const personalOrder=state.profile.priority==='balanced'&&(state.profile.learningPace&&state.profile.learningPace!=='any'||state.profile.campusLocation==='near-home'||state.profile.campusInterests?.length)&&[...personalScores.values()].some(score=>score>0);
    if(personalOrder)orderedIds.sort((a,b)=>personalScores.get(b)-personalScores.get(a));
    // Reviewed plans first; plans that need school confirmation follow, keeping their relative order.
    orderedIds.sort((a,b)=>Number(needsConfirmation(byId.get(a).pathway))-Number(needsConfirmation(byId.get(b).pathway)));
    const costOrder=state.profile.priority==='cost'&&planIndex?.plans&&typeof planIndex.plans==='object'&&orderedIds.some(id=>planIndex.plans[id])?sharedCostOrder(orderedIds):null;
    if(costOrder)orderedIds.splice(0,orderedIds.length,...costOrder.ordered);
    const cards=orderedIds.map((id,index)=>routeCard(byId.get(id),scenarios.get(id)||candidates.get(id),index>=3));
    const scope=recommendationView?.rankingScope,ordering=scope?.orderingMetric,kind=ordering==='estimatedWeeks'?'study-time':ordering==='universityTuitionRemaining'?'university tuition':ordering==='remainingCost'?'remaining cost':ordering==='estimatedBaseCost'?'tuition + course':'';
    const brief=kind?(personalOrder?'Matching study and campus preferences first; available '+kind+' estimates within those matches.':'Available '+kind+' estimates first.')+(scope.unestimatedCount?' '+scope.unestimatedCount+' other plan'+(scope.unestimatedCount===1?' has':'s have')+' no comparable estimate.':''):'Matched to your '+(state.learning.length?'courses and preferences.':'preferences.');
    const costBrief=costOrder?'Lowest planning estimate first.'+(costOrder.partial?' '+costOrder.partial+' plan'+(costOrder.partial===1?' shows':'s show')+' only known charges so far and follow'+(costOrder.partial===1?'s':'')+'.':'')+(costOrder.unestimated?' '+costOrder.unestimated+' plan'+(costOrder.unestimated===1?' has':'s have')+' no reviewed planning estimate and '+(costOrder.unestimated===1?'is':'are')+' listed last.':''):'';
    const basis=costOrder?'<p class="portal-ranking-note" data-cost-order>'+esc(costBrief)+'</p><details class="portal-ranking-details"><summary>How these plans are ordered</summary><p>Plans are ordered by the planning estimate shown on each card and in the plan finder: the low end of the range first, then its midpoint. Estimates cover tuition, listed fees and outside courses before financial aid. A range of known charges so far leaves some course prices out, so it follows the complete estimates; plans without a reviewed estimate come last.</p></details>':recommendationView?.rankBasis?'<p class="portal-ranking-note">'+esc(brief)+'</p><details class="portal-ranking-details"><summary>How these plans are ordered</summary><p>'+esc((personalOrder?'Published study and campus features matching your preferences are prioritized. Within the same fit, ':'')+recommendationView.rankBasis)+'</p></details>':'';
    const fallback=recommendationError?'<div class="portal-comparison-retry" role="status"><p>'+esc(recommendationError)+'</p>'+button('retry-recommendations','Try comparison again',true)+'</div>':'';
    const result=cards.length?basis+cards.slice(0,3).join('')+(cards.length>3?'<details class="portal-route-options"><summary>More matching plans ('+(cards.length-3)+')</summary>'+cards.slice(3).join('')+'</details>':''):recommendationError?'':emptyResultHTML();
    resultCount=cards.length;
    if(cards.length)trackGrowth('guided_results');
    return fallback+result+finderLink(cards.length);
  }
  // No researched plan matches: the main action is the existing research request (request-plan.html), for a listed
  // matching degree when the catalog has one, otherwise from any official degree link. No new contact collection.
  function emptyResultHTML() {
    const planned=new Set(availableRoutes().map(route=>route.id));let unplanned=[];
    try{unplanned=Journey.recommend({...state,learning:[]},{...catalog,pathways:catalog.pathways.filter(route=>!planned.has(route.id)&&route.routeType!=='career-guide'&&degreeResearchURL(route))},[]).map(result=>result.pathway).slice(0,3);}catch{unplanned=[];}
    const reason=protectedGoals.includes(state.profile.goal)?'No researched plan currently meets this career goal and study format.':unplanned.length?'We list matching degrees, but haven’t researched their transfer-course plans yet.':'None of our researched plans match these choices yet.';
    const research=unplanned.length?'<p>Research one from its official page: we check the college’s requirements and transfer rules, then build a plan you can edit.</p><ul class="portal-research-list">'+unplanned.map(route=>'<li><span><strong>'+esc(route.title)+'</strong> '+esc(route.school)+'</span><a class="portal-primary" href="'+esc(degreeResearchURL(route))+'">Research this degree →</a></li>').join('')+'</ul><p class="portal-research-other"><a href="request-plan.html">Research a different degree from its link →</a></p>':'<p>Paste a college’s official degree page and we’ll check its requirements and transfer rules, then build a plan you can edit.</p><a class="portal-primary" href="request-plan.html">Research a degree from its link →</a>';
    return '<div class="portal-empty-result" data-empty-result><h2>No course plan matches yet.</h2><p>'+esc(reason)+'</p>'+research+'</div>';
  }
  // Points to the plan finder when it lists more plans for this subject than the guided results show.
  function finderLink(shown) {
    const field=state.profile.field,label=fieldChoicesFor(field).find(([id])=>id===field)?.[1];
    if(!label||!planIndex?.plans||!(DegreeGuide.subjectIds||[]).includes(field))return '';
    // Count exactly what the finder will list: published or needs-confirmation plans, at the chosen degree level.
    const level=['associate','bachelor','master','doctorate'].includes(state.profile.degreeLevel)?state.profile.degreeLevel:'';
    const total=Object.values(planIndex.plans).filter(plan=>Array.isArray(plan?.subjects)&&plan.subjects.includes(field)&&(plan.published===true||plan.tier==='confirmation')&&(!level||plan.level===level)).length;
    return total>shown?'<p class="portal-finder-link"><a href="programs.html?subject='+encodeURIComponent(field)+(level?'&level='+level:'')+'">See all '+total+' '+esc(label.toLowerCase())+' plans in the plan finder →</a></p>':'';
  }
  function resultSummary() {
    if(resultCount===null)return '';
    return resultCount?'Found '+resultCount+' course plan'+(resultCount===1?'':'s')+' for your choices.':'No course plans match your choices yet.';
  }
  // Replace the "Finding…" status with a result summary once results render,
  // and clear it when the student leaves the results.
  function updateResultNotice() {
    const notice=$('portal-notice');if(!notice||!resultNotice||notice.textContent!==resultNotice)return;
    const next=showingRecommendations()&&!recommendationPending?resultSummary():showingRecommendations()?resultNotice:'';
    notice.textContent=next;resultNotice=next;
  }
  // "Yes, courses or exam credits" with no finished courses yet: offer the next step without blocking the results.
  // The wizard answers are already saved with the plan state, so they are still here when the student comes back.
  function priorCoursesNextStep() {
    if(!['some','degree'].includes(state.profile.hasPrior)||(state.learning||[]).some(record=>record?.status==='earned'))return '';
    return '<section class="portal-prior-next" data-prior-next aria-labelledby="portal-prior-next-title"><h2 id="portal-prior-next-title">Add the courses you’ve finished, so the plans are ranked for you</h2><p>You said you have courses or exam credits. Add them and these plans are re-ranked by how much of each degree they could fill. Your answers here are kept.</p><div class="portal-prior-next-actions"><a class="portal-primary" href="credits-worth.html?from=guided">Add finished courses →</a><a href="import-courses.html?from=portal">Upload a transcript or spreadsheet</a></div></section>';
  }
  function routesBody() {
    return profileSummaryHTML()+priorCoursesNextStep()+'<div id="portal-recommendation-results">'+recommendationResultsBody()+'</div><div class="portal-links">'+button('change-preferences','Change my choices',true)+'<a href="request-plan.html" data-degree-link'+(resultCount===0?' hidden':'')+'>Build from a degree link →</a></div>';
  }
  function renderQuestion() {
    if(!['start','school','degree','purpose','prior','format','priority','routes','about'].includes(state.journey.step))state.journey.step='purpose';
    const id=state.journey.step,profiling=profileFlow()&&profileStepIds.includes(id)&&!degreePreview,heading=degreePreview?'':profiling?({purpose:'What would you like to achieve?',prior:'Where are you starting?',format:'What fits your life?',priority:'What matters most?'}[id]):({start:'Build your course plan.',school:'Choose a school.',degree:'Choose your degree.',purpose:'Find a degree.',routes:'Choose a course plan.',about:'Make this plan yours.'}[id]);
    $('portal-content').innerHTML='<section class="portal-question portal-simple-setup">'+(id!=='start'||degreePreview?'<button class="portal-back" type="button" data-action="back">'+backIcon+'Back</button>':'')+(profiling?profileProgressHTML():'')+(heading?'<h1 id="portal-question-title" tabindex="-1">'+heading+'</h1>':'<h1 id="portal-question-title" class="screen-reader-only" tabindex="-1">Degree plan availability</h1>')+(id==='degree'&&!degreePreview?'<p class="portal-school-filter">'+esc(state.profile.school)+'</p>':'')+(degreePreview?degreeReadinessBody(degreePreview):questionBody(id))+'<p id="portal-step-error" role="alert"></p></section>';
    if(id==='degree'&&!degreePreview)renderDegreeOptions(true);
    updateResultNotice();
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
    // Requirements are shown exactly (32.25, never rounded up or down), with "at least" or "up to".
    const format=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
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
    return '<a class="portal-back" href="plan.html">'+backIcon+'My plan</a><div class="portal-home-heading"><span class="portal-kicker">A quick check</span><h1 id="portal-question-title" tabindex="-1">Review your plan</h1><p>'+esc(draft.pathway.school+' · '+draft.pathway.title)+'</p></div>'+copiedChoicesWarning()+'<section class="portal-review-card"><h2>'+ (plan ? plan.coverage.mappedExternalCredits+' planned transfer '+(draft.program?.creditSystem==='competency-unit'?'competency units':'credits') : 'Your exact goal is saved')+'</h2><p>'+esc(ready?'Your selected course list is ready. Review what you want to take next.':'Review your selected courses and the specific open items below.')+'</p><div class="portal-actions"><a class="portal-secondary" href="plan.html">Open course plan</a>'+(notes.length?'<a class="portal-text-action" href="plan.html?task=checks">View details</a>':'')+'</div></section>'+(notes.length?'<section class="portal-review-card portal-attention"><h2>Still to resolve</h2><ul>'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></section>':'')+(draft.guidance.careerNotes.length?'<details class="portal-tip"><summary>Requirements for your career</summary><ul>'+draft.guidance.careerNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details>':'')+(draft.guidance.militaryNotes.length?'<details class="portal-tip"><summary>Military opportunities</summary><ul>'+draft.guidance.militaryNotes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></details>':'')+'<div class="portal-actions">'+button('finish-plan-review','I’ve reviewed my plan')+'</div><p class="portal-hint">This saves your review. Completed credit is recorded from your own course records and school evaluations.</p>';
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
    if(recommendationPending&&!showingRecommendations())cancelRecommendations();
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
    if(!allowUnmapped&&!state.journey.intakeCompleted){const returnStep=state.journey.step==='routes'?'routes':state.journey.step==='about'?state.journey.intakeReturnStep:'degree';degreePreview=null;state.journey={...state.journey,view:'questions',step:'about',intakeReturnStep:returnStep};render();return;}
    const a=state.journey.answers||{};
    if(!Object.hasOwn(a,'prior')){
      state.journey.creditsDeferred=true;
      if(!state.learning.some(r=>r.status==='earned')&&state.profile.hasPrior==='none')state.profile.hasPrior='unknown';
    }
    if(!a.purpose){const goal=state.profile.goal;a.purpose=protectedGoals.includes(goal)?'licensed-career':['any-degree','career-growth','change-career'].includes(goal)?goal:'any-degree';if(protectedGoals.includes(goal))a.career=goal;}
    state.journey={...state.journey,answers:a,completed:true,view:'home',step:'review',planReviewed:false,schoolContacted:false};
    page='home';degreePreview=null;render();if(saveOK)trackPlanStarted(state.selectedPathwayId||state.profile.pathwayId);
  }
  async function answer(value) {
    const id=state.journey.step;
    if(['degree','routes'].includes(id)&&value!=='unknown'){const route=catalog.pathways.find(r=>r.id===value||r.modelId===value);if(route){await previewDegree(route);return;}}
    state=Journey.applyAnswer(state,id,value,catalog);degreePreview=null;
    if(id==='start'&&value==='audit'){
      state.journey.step='purpose';save();if(saveOK)location.assign('import-courses.html');else showError(Error('Your courses could not be saved.'));return;
    }
    if(['school','degree'].includes(id)&&value==='unknown'&&state.journey.profileFlowVersion===1){startProfile('explore');return;}
    if(id==='degree'&&value==='unknown'){state.journey.step='purpose';render();return;}
    if(id==='degree'||id==='routes'){openPlan();return;}
    if(id==='start'){trackGrowth('guided_started');state.journey.profileFlowVersion=1;if(value==='explore'){startProfile('explore');return;}state.journey.step=value==='target'?'school':'purpose';}
    else if(id==='school')state.journey.step=value==='unknown'?'purpose':'degree';
    else state.journey.step='purpose';
    render();
  }
  async function action(name) {
    if(name==='edit-search-profile'){startProfile('explore');return;}
    if(name==='cancel-profile'){
      clearProfileDraft();const saved=latestStoredPlan();if(saved&&actualSavedTarget(saved)){state=clone(saved);state.journey.view='home';page='home';render();return;}delete state.journey.profileFlow;state.journey.step='start';render();return;
    }
    if(name==='back'&&profileFlow()&&!degreePreview){
      captureProfileValues(document.getElementById('portal-profile-form'));
      const steps=profileSteps(),index=steps.indexOf(state.journey.step);
      if(index>0){state.journey.step=steps[index-1];persistProfileDraft();render();return;}
      const flow=profileFlow();clearProfileDraft();delete state.journey.profileFlow;
      if(flow.mode==='preferences'){await action('cancel-profile');return;}
      state.journey.step=flow.mode==='target'?'degree':'start';render();return;
    }
    if(name==='edit-about-preferences'){const host=$('portal-about-preferences');if(host){host.innerHTML=aboutPreferenceFields();host.querySelector?.('select')?.focus();}return;}
    if(activePlanState&&state.journey.view==='questions'&&['home','keep-target','review-plan','school-review'].includes(name)){state=clone(latestStoredPlan()||activePlanState);degreePreview=null;}
    if(name==='retry-recommendations'){await prepareRecommendations(true);return;}
    if(name==='retry-degree'){if(degreePreview?.route)await previewDegree(degreePreview.sourceRoute||degreePreview.route,{explicitFormat:degreePreview.explicitFormat,variant:degreePreview.variant,force:true});return;}
    if(name==='more-degrees'){degreeLimit+=20;renderDegreeOptions();return;}
    if(name==='degree-search'){degreePreview=null;if(showingRecommendations())await prepareRecommendations();else render();return;}
    if(name==='keep-active-plan'){if(activePlanState){state=clone(latestStoredPlan()||activePlanState);state.journey={...state.journey,view:'home',completed:true};degreePreview=null;page='home';render();}return;}
    if(name==='request-unmapped-replacement'){if(degreePreview&&activePlanState){degreePreview={...degreePreview,confirmUnmappedReplacement:true};render();}return;}
    if(name==='confirm-unmapped-replacement'){if(degreePreview?.confirmUnmappedReplacement&&activePlanState){const next=previewSelection(degreePreview);if(next.draft.targetReviewNeeded)throw Error('Review your career and study preferences before changing this goal.');assertPreviousPlanSaved(latestStoredPlan()||activePlanState||state,next.state);state=next.state;openPlan(true);}return;}
    if(name==='use-degree'){if(degreePreview){await ensureRouteModels(degreePreview.route);const next=previewSelection(degreePreview);if(activePlanState&&!next.draft.plan){degreePreview={...degreePreview,confirmUnmappedReplacement:true};render();return;}assertPreviousPlanSaved(latestStoredPlan()||activePlanState||state,next.state);state=next.draft.plan?await seedStartingRoute(next.state,degreePreview.route):next.state;if(next.draft.plan&&state.journey.profileFlowVersion===1&&!state.journey.intakeCompleted){startProfile('target','degree');return;}openPlan(!next.draft.plan);}return;}
    if(name==='change-preferences'){if(state.journey.profileFlowVersion===1||state.journey.profileCompleted){startProfile('explore');return;}cancelRecommendations();degreePreview=null;state.journey.view='questions';state.journey.step='purpose';render();return;}
    if(name==='copy-school-request'){
      const field=$('portal-school-request');
      if(navigator.clipboard?.writeText) navigator.clipboard.writeText(field.value).then(()=>announce('School-review request copied. Paste it into your school’s email or student portal.')).catch(()=>{field.focus();field.select();announce('Select and copy the request below.');});
      else {field.focus();field.select();announce('Select and copy the request below.');}
      return;
    }
    if (name === 'back') {if(degreePreview){degreePreview=null;if(showingRecommendations())await prepareRecommendations();else render();return;}if(state.journey.step==='about'&&(state.journey.intakeReturnStep==='routes'||!state.journey.intakeReturnStep&&state.journey.answers?.start==='explore'))restoreExplorationSearch();else state.journey.step=state.journey.step==='degree'?'school':state.journey.step==='routes'?'purpose':state.journey.step==='about'?'degree':'start';}
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
    if(name==='back'){if(state.journey.step==='routes'){await prepareRecommendations();return;}else cancelRecommendations();}
    render();
  }
  function showError(error) {const target = $('portal-step-error'); if (target) target.textContent = error.message; else announce(error.message);}
  async function refreshRecommendations() {
    if(!showingRecommendations())return;
    let cacheKey;try{cacheKey=recommendationKey(recommendationInput());}catch(error){clearRecommendationError(error);return;}
    if(recommendationPending&&recommendationProgress?.cacheKey===cacheKey)return;
    if(recommendationPending)cancelRecommendations();
    await prepareRecommendations();
  }
  window.addEventListener?.('DegreeSteps:leads-ready',()=>{if(document.querySelector('.portal-readiness-card'))render(false);});
  window.addEventListener?.('storage',event=>{if(event.key===KEY||event.key===null)refreshRecommendations().catch(showError);});
  window.addEventListener?.('focus',()=>refreshRecommendations().catch(showError));
  document.addEventListener('input',event=>{
    const form=event.target?.closest?.('#portal-profile-form');if(!form||!profileFlow())return;
    try{captureProfileValues(form);}catch(error){showError(error);}
  });
  document.addEventListener('change',event=>{
    const form=event.target?.closest?.('#portal-profile-form');if(!form||!profileFlow())return;
    try{
      captureProfileValues(form);
      const values=new FormData(form),military=$('portal-profile-military-records'),campus=$('portal-profile-campus'),home=$('portal-profile-home-state');
      if(military)military.hidden=!['active','veteran','reserve'].includes(values.get('military'));
      if(campus&&values.has('format'))campus.hidden=values.get('format')==='online';
      if(home&&values.has('campusLocation'))home.hidden=values.get('campusLocation')!=='near-home';
    }catch(error){showError(error);}
  });
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
    if (!['portal-question-form','portal-custom-degree-form','portal-explore-form','portal-about-form','portal-profile-form'].includes(event.target.id)) return;
    event.preventDefault();
    try {
      if(event.target.id==='portal-profile-form'){await submitProfileStep(event.target);return;}
      const values = new FormData(event.target), id = state.journey.step;
      if(event.target.id==='portal-about-form') {
        const prior=String(values.get('prior')),military=String(values.get('military'));
        let next=Journey.setPriorCredits(state,prior==='unknown'?'later':prior==='degree'?'some':prior);
        const knownPreferences=preferencesAnswered(),goal=values.has('goal')?String(values.get('goal')):knownPreferences?state.profile.goal:'',priority=values.has('priority')?String(values.get('priority')):knownPreferences?state.profile.priority:'',licensed=protectedGoals.includes(goal);
        next=Journey.applyAnswer(next,'purpose',licensed?'licensed-career':goal,catalog);
        if(licensed)next=Journey.applyAnswer(next,'career',goal,catalog);
        if(prior==='degree')next=Journey.applyAnswer(next,'prior','degree',catalog);
        next=Journey.applyAnswer(next,'military',military,catalog);
        if(['active','veteran','reserve'].includes(military))next=Journey.applyAnswer(next,'military-records',String(values.get('militaryRecords')),catalog);
        next=Journey.applyAnswer(next,'priority',priority,catalog);
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
        rememberExplorationSearch();state.journey.step='routes';degreePreview=null;save();announce(FINDING_NOTICE);resultNotice=FINDING_NOTICE;await prepareRecommendations();return;
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
      if(!state.journey.intakeCompleted){state.journey.profileFlowVersion=1;state.journey.profileFlow={version:1,mode:'target',returnStep:'degree',values:{},baseTarget:latestStoredPlan()?.selectedPathwayId||''};state.journey.step='prior';persistProfileDraft();}
      history.replaceState(null,'',location.pathname);
    } catch (error) {state = previous; announce(error.message + ' Your saved plan is intact.');}
  }
  async function boot() {
    try {
      const response=await fetch('data/pathways.json');if(!response.ok)throw Error('We couldn’t load the degree research.');catalog=await response.json();models=[];
      // Shared planning estimates are an enhancement; route cards fall back to their own figures without them.
      try{const response=await fetch('data/plan-library-index.json');if(response.ok)planIndex=await response.json();}catch{planIndex=null;}
      try{const response=await fetch('data/campus-facts.json');if(response.ok){const facts=await response.json();if(Array.isArray(facts.campuses))catalog.campusFacts=facts;}}catch{/* Campus facts can be absent without claiming a campus preference match. */}
      try {catalog=await DegreeProgramCatalog.load(catalog);} catch {announce('The full program directory could not load. You can still enter your exact degree.');}
      attachSubjects();
      // Reviewed estimate rates load in the background; route cards add the personal range once available.
      loadEstimateRates().then(()=>{if(estimateRates&&showingRecommendations()&&!recommendationPending)showRecommendationResults();}).catch(()=>{});
      models=DegreeProgramCatalog.loadModels?await DegreeProgramCatalog.loadModels([]):await Promise.all(DegreeProgramCatalog.modelFiles.map(async url=>{const response=await fetch(url);if(!response.ok)throw Error('We couldn’t load the degree research.');return response.json();}));
      let stored;try{stored=JSON.parse(read(KEY));}catch{}attachPrivateCurricula(stored);
      state = Journey.initialize(read(KEY),read('degreepath-pathway-v2'),catalog);
      await ensureRouteModels(catalog.pathways.find(route=>route.id===(state.selectedPathwayId||state.profile?.pathwayId)));
      activePlanState=actualSavedTarget(state)&&read(KEY)?clone(state):null;
      const params = new URLSearchParams(location.search);
      if(params.has('usePlan')){try{const used=await usePublicPlan(params.get('usePlan'));if(!used)render(false);}catch(error){state=Journey.initialize(read(KEY),read('degreepath-pathway-v2'),catalog);degreePreview=null;announce(error.message);render(false);}return;}
      await openPublicRoute(params);
      const school = (params.get('school') || '').trim();
      if (school && school.length <= 120) {
        state.journey.profileFlowVersion=1;
        state=Journey.applyAnswer(state,'start','target',catalog);
        state=Journey.applyAnswer(state,'school',{school},catalog);
        if (['associate','bachelor','master','doctorate','specialist'].includes(params.get('level'))) state=Journey.applyAnswer(state,'level',params.get('level'),catalog);
        if (['online','campus'].includes(params.get('format'))) state=Journey.applyAnswer(state,'format',params.get('format'),catalog);
        state.journey={...state.journey,view:'questions',step:'degree',completed:false};
        const selectedProgram=catalog.pathways.find(route=>route.id===params.get('program')&&route.school===school);if(selectedProgram){await previewDegree(selectedProgram);}
        history.replaceState(null,'',location.pathname+'?view=setup');
      } else if(params.get('view')==='preferences'){
        if(!restoreProfileDraft('preferences')){
          if(actualSavedTarget(state)){startProfile('preferences','plan');return;}
          state=Journey.applyAnswer(state,'start','explore',catalog);startProfile('explore');return;
        }
      } else if (['edit','setup','about'].includes(params.get('view'))) {if(params.get('view')==='about')state.journey.step='about';else if(params.get('view')==='edit'||state.journey.completed)state.journey.step='start';state.journey.view='questions';}
      if(!school&&params.get('view')!=='preferences'&&state.journey.view==='questions')restoreProfileDraft();
      await ensureRouteModels(catalog.pathways.find(route=>route.id===(state.selectedPathwayId||state.profile?.pathwayId)));

      if (['review','school'].includes(params.get('view')) && state.selectedPathwayId) {state.journey.view='home';page=params.get('view')==='school'?'school-review':'review-plan';}
      if (params.get('share') === '1' && state.selectedPathwayId) {save(); location.replace('plan.html?share=1'); return;}
      if(showingRecommendations())prepareRecommendations().catch(showError);
      else render(false);
      window.DegreeAccount?.session().then(session => {const link=$('portal-account-link');if(link)link.textContent=session.user?'My account':'Sign in';}).catch(()=>{});
    } catch (error) {
      $('portal-loading').hidden = true; $('portal-error').hidden = false;
      $('portal-error').textContent = error.message + ' Reload to try again. Your saved records have not been deleted.';
    }
  }
  boot();
}());
