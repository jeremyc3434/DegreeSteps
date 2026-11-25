(function(){'use strict';
 const KEY='degreepath-guide-v3',$=id=>document.getElementById(id),Engine=window.DegreePlanComparison,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=v=>v==null?'Needs estimate':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v),params=new URLSearchParams(location.search);
 let state,catalog,models,costs,view,pendingId=null,pendingDestination='plan.html',revision=0,candidate=null,sideBySide=false,comparisonJobs=null,renderTimer=null,matrixPending=null,viewPending=false,confirming=false,savingVersion=false,pendingDeleteSaved=null,pendingCapacityResume=null;
 function runner(){
  if(!comparisonJobs){if(!window.DegreeComparisonRunner)throw Error('The comparison tools could not load. Reload this page to try again.');comparisonJobs=window.DegreeComparisonRunner.create({engine:Engine,timeoutMs:90000,onFallback:message=>{$('comparison-status').textContent=message;}});}
  return comparisonJobs;
 }
 const superseded=error=>['superseded','disposed'].includes(error?.code);
 const pendingDiscoveries=new Map(),discoveryResults=new Map(),sourceSelections=new Map();
 const readyRoutes = () => typeof DegreeProgramCatalog.publishedPlans==='function'?DegreeProgramCatalog.publishedPlans(catalog,models):[];
 // The degree picker lists the same plans as the finder: published plans plus complete plans that
 // still need school confirmation, labelled. Automatic suggestions stay with published plans.
 let planIndex=null,discoveryLinkConsumed=false;
 // Discovery links preview one exact published degree without saving comparison choices.
 const linkedRoute=()=>!discoveryLinkConsumed&&params.get('from')==='courses'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(params.get('degree')||'')?readyRoutes().find(route=>route.id===params.get('degree'))||null:null;
 const linkedFormat=()=>['online','campus'].includes(params.get('format'))&&Boolean(linkedRoute()?.modalities?.includes(params.get('format')));
 function consumeDiscoveryLink(){
  discoveryLinkConsumed=true;
  if(params.has('degree')){params.delete('degree');params.delete('format');try{if(typeof history!=='undefined'&&typeof history.replaceState==='function')history.replaceState(null,'','compare-plans.html'+(params.toString()?'?'+params:'')+(location.hash||''));}catch{/* A blocked history update cannot undo explicit comparison choices. */}}
 }
 const libraryRoutes = () => typeof DegreeProgramCatalog.planLibraryRoutes==='function'?DegreeProgramCatalog.planLibraryRoutes(catalog,models,planIndex):readyRoutes();
 const needsConfirmation = route => Boolean(planIndex&&globalThis.DegreeProgramCatalog?.needsSchoolConfirmation?.(route,planIndex));
 function comparisonScopeText(){
  const reviewed=readyRoutes().length,selectable=libraryRoutes(),confirmation=selectable.filter(needsConfirmation).length;
  return 'Automatic suggestions use '+reviewed+' reviewed plans. '+selectable.length+' plans are available through Choose or replace a degree'+(confirmation?', including '+confirmation+' labeled Needs school confirmation':'')+'. Published transfer matches and specific conditions appear in each plan.';
 }
 function comparisonCatalog(value=state){
  const ids=new Set([...(value.sheet?.isExample?[]:[value.selectedPathwayId||value.profile?.pathwayId]),...(options().selectedIds||[]).map(id=>id.startsWith('saved:')?(value.whatIf?.snapshots||[]).find(saved=>saved.id===id.slice(6))?.pathwayId:null)].filter(Boolean));
  // Explicit private/current targets stay recoverable; only complete templates
  // participate in new suggestions and degree-picker choices.
  // Suggestions come from published plans; a plan needing school confirmation joins only when the student picked it.
  const picked=new Set((options().selectedIds||[]).filter(id=>id.startsWith('route:')).map(id=>id.slice(6)));
  const available=[...readyRoutes(),...libraryRoutes().filter(route=>picked.has(route.id)&&needsConfirmation(route))],known=new Set(available.map(route=>route.id));
  return {...catalog,pathways:[...available,...catalog.pathways.filter(route=>ids.has(route.id)&&!known.has(route.id))]};
 }
 function attachPrivateCurricula(value){
  catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,value);if(window.AuditCurriculum)catalog=AuditCurriculum.attach(catalog,value);
  const all=new Map((models||[]).map(model=>[model.id,model]));[...DegreeProgramCatalog.sourceModels(value),...(window.AuditCurriculum?AuditCurriculum.models(value):[])].forEach(model=>all.set(model.id,model));models=[...all.values()];
 }
 function auditURL(route){return AuditCurriculum.launchURL({...route,degree:route?.title||'',programId:route?.id||'',sourceUrl:route?.url||'',modality:route?.modalities?.length===1?route.modalities[0]:''});}
 async function ensureRouteModels(routes){
  const targets=(routes||[]).filter(Boolean).flatMap(route=>[route,...DegreeProgramCatalog.variants(route,catalog)]).filter(route=>route.modelId&&!models.some(model=>model.id===route.modelId));
  if(!targets.length||!DegreeProgramCatalog.modelsForRoutes)return;
  const loaded=await DegreeProgramCatalog.modelsForRoutes(targets,{includeLegacy:false}),all=new Map((models||[]).map(model=>[model.id,model]));loaded.forEach(model=>all.set(model.id,model));models=[...all.values()];
 }
 async function discoverRoute(route,variant='',force=false){
  $('comparison-status').textContent='Checking official degree requirements…';
  const result=await DegreeProgramCatalog.discover(route,{variant,force});discoveryResults.set(route.id,result);
  if(result.status==='ready'){
   catalog=DegreeProgramCatalog.attachSourceCurricula(catalog,{sourceCurricula:[result]});pendingDiscoveries.set(result.route.id,result);models=[...new Map([...models,result.model].map(model=>[model.id,model])).values()];
   sourceSelections.set('route:'+route.id,'route:'+result.route.id);
  }
  render();
 }
 function routesForComparison(){
  const explicit=options().selectedIds;if(Array.isArray(explicit)&&!explicit.length&&!state.selectedPathwayId&&!state.profile?.pathwayId&&!candidate)return [];
  const profile={...state.profile,pathwayId:'',school:'',degree:'',...(options().includeOtherFormats?{modality:'any',classroomImportance:'open'}:{})};
  // Only select public model paths here. All course matching runs in the worker.
  const routes=DegreeGuide.recommend(profile,{pathways:readyRoutes()},[],[]).map(result=>result.pathway);
  const selectedIds=options().selectedIds||[],snapshots=state.whatIf?.snapshots||[];
  const targets=[state.selectedPathwayId||state.profile?.pathwayId,...selectedIds.map(id=>id.startsWith('route:')?id.slice(6):id.startsWith('saved:')?snapshots.find(saved=>saved.id===id.slice(6))?.pathwayId:null)];
  return [...new Map([...routes,...targets.map(id=>catalog.pathways.find(route=>route.id===id)).filter(Boolean)].map(route=>[route.id,route])).values()];
 }
 const options=()=>{const ready=new Set(libraryRoutes().map(route=>'route:'+route.id)),selected=state.whatIf?.selectedIds?.map(id=>sourceSelections.get(id)||id).filter(id=>id==='current'||id.startsWith('saved:')||ready.has(id)),activeSource=sourceSelections.get('route:'+(state.selectedPathwayId||state.profile?.pathwayId||''));
  const linked=linkedRoute(),active=!state.sheet?.isExample&&(state.selectedPathwayId||state.profile?.pathwayId),selectedIds=linked?(linked.id===active?[]:['route:'+linked.id]):activeSource?[...(selected||[]).filter(id=>id!=='current'&&id!==activeSource).slice(0,1),activeSource]:selected;
  return {selectedIds,deferMatrix:true,priority:$('compare-priority').value,includeOtherFormats:$('compare-formats').checked,fromCourses:params.get('from')==='courses'||!state.selectedPathwayId||state.sheet?.isExample===true,candidate};};
 function latest(){const raw=localStorage.getItem(KEY);if(!raw)return DegreeCourseLibrary.initialize(null);let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Your saved courses could not be read. They have not been replaced. Keep a backup before restoring a plan.');}if(parsed?.version!==3||!parsed.profile||!Array.isArray(parsed.learning))throw Error('Your saved course collection needs recovery. It has not been replaced.');return DegreeCourseLibrary.initialize(parsed);}
 function fail(e){$('comparison-error').hidden=false;$('comparison-error').textContent=e.message||String(e);}
 function store(next){try{localStorage.setItem(KEY,JSON.stringify(next));state=next;window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));$('comparison-error').hidden=true;return true;}catch(e){window.dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:false}}));fail(Error('This browser could not save your changes. Your current plan is still open; keep this tab until you can save a private backup.'));return false;}}
 function meta(patch){const next=latest();next.whatIf={...next.whatIf,version:1,...patch};const saved=store(next);if(saved&&Object.prototype.hasOwnProperty.call(patch,'selectedIds'))consumeDiscoveryLink();return saved;}
 function selected(slot,id){const ids=[...(view.selectedIds||[])];ids[slot]=id;if(meta({selectedIds:[...new Set(ids.filter(Boolean))].slice(0,3)}))render();}
 function schoolOptions(){const names=[...new Set(libraryRoutes().map(p=>p.school))].sort();$('compare-school').innerHTML=names.map(s=>'<option>'+esc(s)+'</option>').join('');$('compare-school').value=names.includes(state.profile.school)?state.profile.school:names[0]||'';$('compare-level').value=['associate','bachelor','master','doctorate','specialist'].includes(state.profile.degreeLevel)?state.profile.degreeLevel:'';degrees();}
 function degrees(){const rows=libraryRoutes().filter(p=>p.school===$('compare-school').value&&(!$('compare-level').value||p.level===$('compare-level').value)).sort((a,b)=>Number(needsConfirmation(a))-Number(needsConfirmation(b))||a.title.localeCompare(b.title));$('compare-degree').innerHTML=rows.length?rows.map(p=>'<option value="route:'+esc(p.id)+'">'+esc(p.title)+(needsConfirmation(p)?' · Needs school confirmation':'')+'</option>').join(''):'<option value="">No ready-to-use plan at this level</option>';}
 function bestId(){
  const metric=$('compare-priority').value,key=metric==='collection'?'collectionFitFraction':metric==='credits'?'completedFitFraction':null;
  const eligible=view.scenarios.filter(s=>s.available&&s.eligible);
  if(['cost','tuition','terms'].includes(metric)){
   // Cost, tuition and time use the shared planning estimate only. Automatic suggestions may omit eligible plans,
   // and a plan without an estimate cannot be ranked, so no plan is marked best unless every visible plan has one.
   if(view.rankingScope?.mode==='eligible-routes'&&!view.rankingScope.comparable)return null;
   const rows=eligible.map(s=>({s,range:estimateMetric(s,metric)}));
   if(rows.length<2||rows.some(row=>!row.range)||new Set(rows.map(row=>row.s.draft.pathway.level)).size>1)return null;
   rows.sort((a,b)=>a.range.min-b.range.min||estimateMid(a.range)-estimateMid(b.range));
   if(rows[0].range.min===rows[1].range.min&&estimateMid(rows[0].range)===estimateMid(rows[1].range))return null;
   return rows[0].s.id;
  }
  const rows=eligible.filter(s=>Number.isFinite(s.summary?.[key]));
  if(rows.length<2||new Set(rows.map(s=>s.summary[key])).size===1||new Set(rows.map(s=>s.draft.pathway.level)).size>1)return null;
  return rows.sort((a,b)=>b.summary[key]-a.summary[key])[0].id;
 }
 function recommendationLabel(ranked){
  if(!ranked)return 'Suggested route';
  return ({collection:'Best fit for your courses',credits:'Uses the most completed credits',cost:'Lowest estimated cost',tuition:'Lowest university tuition estimate',terms:'Shortest estimated study time'})[$('compare-priority').value]||'Suggested route';
 }
 function progressCard(s){
  if(!s.available)return '';
  const progress=window.DegreeCoursePlanView?.progress(s.draft);if(!progress?.valid)return '';
  const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value),label=(s.draft.pathway?.title||s.label)+' — finished coursework';
  return '<section class="comparison-progress" data-comparison-progress="'+esc(s.id)+'" aria-label="Coursework progress"><div class="comparison-progress-heading"><span><strong>'+number(progress.completedCredits)+'</strong> of '+number(progress.totalCredits)+' credits finished</span><strong data-comparison-percent>'+number(progress.completedPercent)+'%</strong></div><div class="comparison-progress-track" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="'+progress.totalCredits+'" aria-valuenow="'+progress.completedCredits+'" aria-valuetext="'+number(progress.completedCredits)+' of '+number(progress.totalCredits)+' credits finished; '+number(progress.inProgressCredits)+' in progress; '+number(progress.remainingCredits)+' not started; '+number(progress.confirmedCredits)+' school confirmed"><span class="comparison-progress-finished" style="width:'+progress.completedPercent+'%"></span><span class="comparison-progress-active" style="width:'+progress.inProgressPercent+'%"></span></div><div class="comparison-progress-legend"><span class="comparison-progress-done"><i aria-hidden="true"></i>'+number(progress.completedCredits)+' Finished</span><span class="comparison-progress-taking"><i aria-hidden="true"></i><span data-comparison-active>'+number(progress.inProgressCredits)+'</span> In progress</span><span class="comparison-progress-waiting"><i aria-hidden="true"></i><span data-comparison-remaining>'+number(progress.remainingCredits)+'</span> Not started</span></div></section>';
 }
 function discoveryHTML(route){const result=discoveryResults.get(route?.id),variants=result?.status==='choose-variant'?(result.variants||[]):[];return variants.length?'<p>Choose the exact university program.</p>'+variants.map(variant=>'<button class="comparison-use-button" type="button" data-source-program="'+esc(route.id)+'" data-source-variant="'+esc(variant.id)+'">'+esc(variant.title)+'</button>').join(''):'<p>'+esc(result?.reason||result?.reasons?.[0]?.message||'This degree does not have a reviewed course plan yet. Research it from the official program page, or use your degree audit to build a course plan.')+'</p>'+(researchURL(route)?'<a class="comparison-use-button" href="'+esc(researchURL(route))+'">Research this degree →</a>':'')+'<p><a href="'+esc(auditURL(route))+'">Use my degree audit →</a></p>'; }
 // Live requirement lookups are retired in favour of offline-reviewed research: a degree without a
 // reviewed plan links to its research request (as the guided planner does). discoverRoute stays for now.
 function researchURL(route){try{const url=new URL(route?.url||(route?.sources||[]).find(source=>/^https:\/\//.test(source?.url||''))?.url);if(url.protocol!=='https:'||url.username||url.password)return '';return 'request-plan.html?source='+encodeURIComponent(url.href);}catch{return '';}}
 const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Number(value)||0);
 function creditUnit(summary){return summary?.creditSystem==='competency-unit'?'CU':summary?.creditSystem==='quarter'?'quarter credits':'credits';}
 function courseCoverage(s){
  const plan=s.draft?.plan,program=s.draft?.program;if(!plan||!program)return null;
  const rows=plan.rows||[],sum=items=>items.reduce((total,row)=>total+(Number(row.credits)||0),0),outside=rows.filter(row=>row.status==='planned'&&row.option?.provider&&row.option.provider!=='University');
  const projected=window.DegreeCoursePlanView?.build(s.draft),missing=projected?.totals?.unmapped??sum(rows.filter(row=>!row.option||row.selectionRequired||row.option?.selectionRequired));
  const conditional=outside.filter(row=>row.option.evidence==='conditional'),published=outside.filter(row=>row.option.evidence==='published');
  const research=[...new Map((plan.researchTasks||[]).filter(task=>task.blocking!==false).map(task=>[task.message||task.code,task])).values()];
  return {published:sum(published),conditional:sum(conditional),conditionalRows:conditional,university:projected?sum([...(projected.groups.universityRequired||[]),...(projected.groups.universityReserved||[])]):sum(rows.filter(row=>row.status==='planned'&&row.option?.provider==='University'&&!row.selectionRequired&&!row.option.selectionRequired)),missing,research};
 }
 function coverageHTML(s){
  const facts=courseCoverage(s);if(!facts)return '';
  const unit=creditUnit(s.summary),parts=[];
  if(facts.published)parts.push('<span><strong>'+number(facts.published)+'</strong> '+esc(unit)+' in published transfer matches</span>');
  if(facts.conditional)parts.push('<span class="comparison-coverage-conditional"><strong>'+number(facts.conditional)+'</strong> '+esc(unit)+' with eligibility conditions</span>');
  if(facts.university)parts.push('<span><strong>'+number(facts.university)+'</strong> '+esc(unit)+' in selected university courses</span>');
  if(facts.missing)parts.push('<span class="comparison-coverage-conditional"><strong>'+number(facts.missing)+'</strong> '+esc(unit)+' still need a named course</span>');
  return parts.length?'<section class="comparison-course-coverage" aria-label="Evidence for remaining course choices"><h3>Remaining course choices</h3><div>'+parts.join('')+'</div></section>':'';
 }
 function researchDetailsHTML(s){
  const facts=courseCoverage(s);if(!facts||!s.available)return '';
  const conditions=facts.conditionalRows.map(row=>'<li><strong>'+esc(row.option.provider+' · '+row.option.title)+'</strong> — '+esc(row.title||row.requirementId)+(row.conditions?.length?'<p>'+esc(row.conditions[0])+'</p>':'')+'</li>').join('');
  return '<p>Published course matches are included in this plan. Saved and in-progress courses remain potential credit; the school evaluates your completed records.</p>'+(facts.conditional?'<h3>Specific eligibility conditions</h3><ul>'+conditions+'</ul>':'')+(facts.missing?'<p>DegreeSteps still needs named course choices for '+number(facts.missing)+' '+esc(creditUnit(s.summary))+'.</p>':'')+(facts.research.length?'<h3>Research DegreeSteps is completing</h3><ul>'+facts.research.map(task=>'<li>'+esc(task.message||task.code)+'</li>').join('')+'</ul>':'');
 }
 function courseStatus(status){return status==='earned'?'Completed':status==='in-progress'?'In progress':status==='planned'?'Planned':'Saved';}
 function reviewCourses(s){
  const rows=s.summary?.reviewCourses||[],count=s.summary?.fitBreakdown?.needsReviewCount??rows.length;
  if(!count)return '';
  return '<details class="comparison-review" data-course-review><summary>'+number(count)+' course'+(count===1?'':'s')+' not matched yet</summary><p>These courses have no placement in this degree plan yet. A missing match does not mean the school will reject your course.</p><ul>'+rows.map(course=>'<li data-review-course="'+esc(course.id)+'"><strong>'+esc(course.title||course.code||'Course record')+'</strong><span>'+esc(course.provider||'Provider needs checking')+' · '+courseStatus(course.status)+'</span><p>'+esc(course.reason||'Check this course against the exact degree requirements.')+'</p></li>').join('')+'</ul><a href="courses.html?tab=mine">Review my course records →</a></details>';
 }
 function fitHTML(s){
  const summary=s.summary,fit=summary.fitBreakdown||{completedCredits:summary.applicableCompletedCredits,confirmedCredits:summary.confirmedCredits,inProgressCredits:0,savedCredits:summary.potentialCollectionCredits,plannedCredits:0,potentialCredits:summary.potentialCollectionCredits},unit=creditUnit(summary);
  return '<section class="comparison-fit" aria-label="How your courses fit"><h3>Your courses could cover</h3><p class="comparison-fit-total"><strong data-collection-fit-credits>'+number(summary.collectionFitCredits)+'</strong> '+esc(unit)+' <small>of '+number(summary.degreeCredits||summary.remainingCredits+summary.applicableCompletedCredits)+' required</small></p><dl><div><dt><i class="comparison-fit-completed" aria-hidden="true"></i>Completed matches</dt><dd data-matched-credits>'+number(fit.completedCredits)+'</dd></div><div><dt><i class="comparison-fit-active" aria-hidden="true"></i>In progress <small>potential</small></dt><dd data-in-progress-fit>'+number(fit.inProgressCredits)+'</dd></div><div><dt><i class="comparison-fit-saved" aria-hidden="true"></i>Saved courses <small>potential</small></dt><dd data-saved-fit>'+number(fit.savedCredits)+'</dd></div>'+(fit.plannedCredits?'<div><dt>Other planned courses <small>potential</small></dt><dd data-planned-fit>'+number(fit.plannedCredits)+'</dd></div>':'')+'</dl><p class="comparison-fit-note"><span data-potential-fit-credits>'+number(fit.potentialCredits)+'</span> '+esc(unit)+' are unfinished potential. <span data-confirmed-credits>'+number(fit.confirmedCredits)+'</span> completed '+esc(unit)+' school confirmed.</p></section>';
 }
 // One planning estimate everywhere: the shared engine at published rates, exactly as the finder and plan
 // pages compute it (data/plan-library-index.json holds the same engine's fresh-start range). A partial sum of
 // known charges is never shown as a cost; without a shared estimate the card says the cost needs confirmation.
 let estimateRates=null,estimateRatesPromise=null;const sharedEstimates=new WeakMap();
 function loadEstimateRates(){
  if(!window.DegreePlanEstimate||!window.DegreePlanEstimateView)return Promise.resolve(null);
  if(!estimateRatesPromise)estimateRatesPromise=fetch('data/plan-estimate-rates.json').then(response=>{if(!response.ok)throw Error('Estimate rates unavailable');return response.json();}).then(data=>{estimateRates=data;return data;}).catch(()=>{estimateRatesPromise=null;return null;});
  return estimateRatesPromise;
 }
 function sharedEstimate(s){
  if(!s?.available||!s.draft?.program||!s.draft?.plan||!estimateRates||!window.DegreePlanEstimate)return null;
  if(sharedEstimates.has(s))return sharedEstimates.get(s);
  let result=null;try{const value=window.DegreePlanEstimate.calculate({program:s.draft.program,plan:s.draft.plan,rates:estimateRates});result=window.DegreePlanEstimateView.available(value)?value:null;}catch{result=null;}
  sharedEstimates.set(s,result);return result;
 }
 const estimateMid=range=>(range.min+range.max)/2;
 function estimateMetric(s,metric){
  const value=sharedEstimate(s);if(!value)return null;
  if(metric==='cost')return value.costs.knownRange;
  if(metric==='tuition')return value.costs.universityTuition||null;
  if(metric==='terms')return value.timing.totalMonths||null;
  return null;
 }
 function costHTML(s){
  const value=sharedEstimate(s);
  if(value){
   // The compact view's own button opens the worksheet tray; on this page the plan link below replaces it.
   const html=window.DegreePlanEstimateView.render(value,{compact:true}).replace(/<button type="button" class="button ghost small" data-action="cost-time">[^<]*<\/button>/,'');
   return '<div class="comparison-cost-estimate comparison-shared-estimate" data-remaining-cost="shared" data-estimate-min="'+value.costs.knownRange.min+'" data-estimate-max="'+value.costs.knownRange.max+'">'+html+'</div>';
  }
  return '<section class="comparison-cost-estimate comparison-cost-confirm" aria-label="Remaining cost estimate" data-remaining-cost="needs-confirmation"><span>Total cost</span><strong>Cost needs confirmation</strong><p class="comparison-cost-incomplete">No reviewed planning estimate exists for this plan yet. Ask the school for its current tuition and fees.</p></section>';
 }
 function estimateHTML(s){
  const summary=s.summary,unit=creditUnit(summary),shared=sharedEstimate(s);
  // Study time and terms come from the shared estimate when it exists, so this card never shows two different timelines.
  return '<dl class="comparison-outcomes"><div class="comparison-remaining"><dt>Still needed after completed matches</dt><dd><strong data-remaining-credits>'+number(summary.remainingCredits)+'</strong> <small>'+esc(unit)+'</small></dd></div><div><dt>Remaining university coursework</dt><dd><strong data-university-credits>'+number(summary.universityCreditsRemaining)+'</strong> <small>'+esc(unit)+'</small></dd></div></dl>'+costHTML(s)+'<p class="comparison-cost-scope">Before aid. Finished courses are excluded from remaining costs.</p>'+'<div class="comparison-missing-estimate"><span>'+(shared?'Estimated at published rates and a typical pace. Add your own tuition quote or study pace in the plan.':'You can add your own tuition quote and study pace to this plan.')+'</span>'+(s.isCurrent?'<a href="plan.html?task=cost-time">Set my pace and costs →</a>':s.canUse?'<button type="button" data-estimate-plan="'+esc(s.id)+'">Set my pace and costs →</button>':'')+'</div>';
 }
 // A plan the student did not pick (not the active plan, a saved version or a chosen degree) is a suggestion and says so.
 function isSuggestion(s){if(!s||s.isCurrent||String(s.id).startsWith('saved:'))return false;const picked=state.whatIf?.selectedIds;return !Array.isArray(picked)||!picked.map(id=>sourceSelections.get(id)||id).includes(s.id);}
 function degreeFitHTML(s){
  const Facts=window.DegreeProgramOpportunities,program=s.draft?.program,route=s.draft?.pathway;
  if(!program||typeof Facts?.fitFacts!=='function')return '';
  const definition={...route,...program,url:route?.url||program.url||'',paceModel:program.paceModel||route?.paceModel};
  const actual=Facts.fitFacts(definition,Facts.schoolFor?.(catalog,definition));
  const entry=planIndex?.plans?.[route?.id],candidate=entry?.fit;
  const year=value=>String(value||'').replace(/[–—]/g,'-');
  const modality=/^(residential|campus)$/i.test(program.format||'')?'campus':/^online$/i.test(program.format||'')?'online':route?.modalities?.length===1?route.modalities[0]:null;
  // Compact public facts may fill a missing price only for this exact model,
  // edition and learning format. The current scenario's own known facts win.
  const indexed=entry?.modelId===program.id&&candidate?.modelId===program.id&&Boolean(year(program.catalogYear||program.catalog))&&year(candidate.catalogYear)===year(program.catalogYear||program.catalog)&&['online','campus'].includes(modality)&&candidate.modality===modality&&(!route?.modalities?.length||route.modalities.includes(modality))?candidate:null;
  const known=value=>typeof value==='string'&&value.trim()&&!/needs confirmation/i.test(value);
  const value=key=>actual[key]===null||actual[key]===undefined?indexed?.[key]:actual[key];
  const competency=value('competencyBased'),selfPaced=value('selfPaced'),billing=value('billing');
  const badges=[];
  if(competency===true)badges.push('Competency-based (CBE)');
  if(selfPaced===true)badges.push(known(actual.paceLabel)&&actual.selfPaced===true?actual.paceLabel:known(indexed?.paceLabel)?indexed.paceLabel:'Self-paced');
  else if(selfPaced===false)badges.push('Term-based');
  if(billing)badges.push(known(actual.billingLabel)&&actual.billing===billing?actual.billingLabel:known(indexed?.billingLabel)?indexed.billingLabel:({'per-credit':'Pay per credit',subscription:'Subscription tuition','flat-term':'Flat price per term',annual:'Annual tuition'})[billing]||'');
  const programRequirements=typeof Facts.programRequirements==='function'?Facts.programRequirements(indexed):[];
  if(typeof Facts.requirementBadges==='function')badges.push(...Facts.requirementBadges(indexed));
  const requirementsHTML=typeof Facts.requirementsHTML==='function'?Facts.requirementsHTML(indexed,{compact:true}):'';
  const actualPrice=known(actual.tuitionLabel),indexedPrice=!actualPrice&&known(indexed?.tuitionLabel)&&(!actual.billing||actual.billing===indexed.billing);
  const tuition=actualPrice?actual.tuitionLabel:indexedPrice?indexed.tuitionLabel:'';
  const sourceRows=[];
  const addSource=(source,label)=>{const url=safeURL(source?.url);if(url&&!sourceRows.some(row=>row.url===url))sourceRows.push({url,label});};
  if(actual.competencyBased!==null&&actual.competencyBased!==undefined||actual.selfPaced!==null&&actual.selfPaced!==undefined)addSource(actual.sources?.learning,'Study format');
  if(indexed&&(actual.competencyBased==null&&indexed.competencyBased!=null||actual.selfPaced==null&&indexed.selfPaced!=null))addSource(indexed.sources?.learning,'Study format');
  if(actual.billing)addSource(actual.sources?.billing,'Tuition and billing');
  if(indexedPrice||!actual.billing&&billing)addSource(indexed?.sources?.billing,'Tuition and billing');
  const liveCapstone=(program.requirements||[]).find(req=>/capstone/i.test(req.title||'')&&req.registrationPolicy?.synchronousSeminars&&req.registrationPolicy?.sourceIds?.length);
  const liveSource=liveCapstone&&(program.sources||[]).find(source=>liveCapstone.registrationPolicy.sourceIds.includes(source.id)&&safeURL(source.url));
  const reviewedLive=programRequirements.some(fact=>fact.kind==='attendance'&&fact.type==='live-seminars'&&fact.scope!=='school-policy');
  const live=liveCapstone&&liveSource&&!reviewedLive?'<p class="comparison-attendance-fact">Capstone includes live seminars. <a href="'+esc(safeURL(liveSource.url))+'" target="_blank" rel="noopener noreferrer">Course requirement</a></p>':'';
  const labels=[...new Set(badges.filter(Boolean))];
  if(!labels.length&&!tuition&&!live&&!requirementsHTML)return '';
  return '<section class="comparison-degree-fit" aria-label="Program details">'+(labels.length?'<ul class="comparison-degree-tags" aria-label="Program features">'+labels.map(label=>'<li>'+esc(label)+'</li>').join('')+'</ul>':'')+(tuition?'<p class="comparison-tuition-fact"><span>University tuition</span><strong>'+esc(tuition)+'</strong></p>':'')+live+requirementsHTML+(sourceRows.length?'<details class="comparison-fit-sources"><summary>Study and tuition sources</summary><ul>'+sourceRows.map(source=>'<li><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.label)+'</a></li>').join('')+'</ul></details>':'')+'</section>';
 }
 function card(s,index,best){
  const p=s.draft.pathway,summary=s.summary,source=(p?.sources||s.draft.program?.sources||[]).find(x=>safeURL(x.url)),norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),preview=candidate?view.matrix.find(row=>norm(row.course.provider)===norm(candidate.provider)&&[candidate.code,...(candidate.codeAliases||[])].filter(Boolean).some(code=>[row.course.code,...(row.course.codeAliases||[])].some(alias=>norm(alias)===norm(code)))||row.course.origin==='candidate')?.cells[s.id]:null;
  const suggested=isSuggestion(s),title=s.isCurrent?'My active plan':best===s.id&&!candidate?recommendationLabel(bestId()===s.id)+(suggested?' · Suggestion':''):suggested?'Suggested to compare':'Degree option '+(index+1),reason=view.recommendation?.id===s.id?view.recommendation.reason:s.recommendationReasons?.[0];
  const primaryAction=(s.isCurrent?'<a class="comparison-open-plan" href="plan.html">Open my plan →</a>':s.canUse&&s.available?'<button type="button" class="comparison-use-button" data-use-plan="'+esc(s.id)+'">Use this plan →</button>':'');
  return '<article class="comparison-card'+(best===s.id&&!candidate?' comparison-recommended':'')+'" data-scenario="'+esc(s.id)+'"><div class="comparison-card-top"><span>'+title+'</span>'+(s.isCurrent?'':'<button type="button" data-remove-plan="'+index+'" aria-label="Remove '+esc(s.label)+' from comparison">×</button>')+'</div><h2>'+esc(s.label)+'</h2>'+(suggested?'<p class="comparison-suggested-note" data-suggested-plan>DegreeSteps added this plan as a suggestion from your preferences. You didn’t choose it; remove it with × or choose a different degree.</p>':'')+'<p class="comparison-school">'+esc(p?.school||'Program unavailable')+'</p>'+degreeFitHTML(s)+(needsConfirmation(p)?'<p class="portal-tier"><span class="portal-tier-badge portal-tier-confirm">Needs school confirmation</span></p>':'')+primaryAction+(view.hasTarget?progressCard(s):'')+(!s.eligible?'<p class="comparison-warning">Review this degree against your career, level or study format.</p>':'')+
   (summary?(reason?'<p class="comparison-why">'+esc(reason)+'</p>':'')+(candidate?'<p class="comparison-preview-fit">This course: <strong>'+(preview&&preview.status!=='needs-evaluation'?number(preview.credits)+' '+esc(creditUnit(summary))+' potential':'needs evaluation')+'</strong><span>Preview only; no course records change.</span></p>':'')+fitHTML(s)+reviewCourses(s)+coverageHTML(s)+estimateHTML(s):'<div class="comparison-unmapped"><strong>Check exact requirements first</strong><p>'+esc(s.reason)+'</p>'+discoveryHTML(p)+(source?'<a class="comparison-requirements-link" href="'+esc(safeURL(source.url))+'" target="_blank" rel="noopener">Official degree requirements ↗</a>':'<a class="comparison-requirements-link" href="portal.html?view=setup">Choose the exact degree →</a>')+'</div>')+
   '<details class="comparison-source"><summary>Sources and conditions</summary>'+researchDetailsHTML(s)+(p?.sources||s.draft.program?.sources||[]).slice(0,3).filter(x=>safeURL(x.url)).map(source=>'<a href="'+esc(safeURL(source.url))+'" target="_blank" rel="noopener">'+esc(source.title||'Curriculum source')+' ↗</a>').join('')+'</details></article>';
 }
 function safeURL(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return'';}}
 function renderMatrix(){
  if(!view||viewPending)return;
  if(view.matrixDeferred){
   if(matrixPending?.view===view)return;
   const current=view,ticket=revision;matrixPending={view:current};$('comparison-library-info').textContent='Checking individual course placements on this device…';$('comparison-matrix').setAttribute('aria-busy','true');
   runner().run('matrix',{view:current,catalog,models}).then(matrix=>{if(ticket!==revision||view!==current)return;matrixPending=null;view.matrix=matrix;view.matrixDeferred=false;renderMatrix();}).catch(error=>{if(ticket!==revision||view!==current||superseded(error))return;matrixPending=null;fail(error);$('comparison-library-info').textContent='Course placements could not be loaded. Close and reopen this section to try again.';$('comparison-matrix').setAttribute('aria-busy','false');});return;
  }
  const q=$('comparison-search').value.toLowerCase(),filter=$('comparison-filter').value,rows=view.matrix.filter(x=>(filter==='all'||x.course.status===filter)&&(!q||[x.course.title,x.course.code,x.course.provider,...(x.course.codeAliases||[])].join(' ').toLowerCase().includes(q)));$('comparison-matrix').setAttribute('aria-busy','false');$('comparison-matrix').innerHTML='<table><thead><tr><th scope="col">Your course / exam</th>'+view.scenarios.map(s=>'<th scope="col">'+esc(s.label)+'<small>'+esc(s.draft.pathway?.school||'Unavailable')+'</small></th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(({course,cells})=>'<tr data-course="'+esc(course.id)+'"><th scope="row"><strong>'+esc(course.title)+'</strong><span>'+esc(course.provider)+' · '+esc(course.code)+'</span><small>'+esc(Engine.creditDescription(course))+' · '+(course.status==='earned'?'Finished':course.status==='in-progress'?'Taking now':'Not started')+(course.origin==='candidate'?' · Course preview':course.origin==='plan-choice'?' · Proposed in these plans':'')+'</small></th>'+view.scenarios.map(s=>{const c=cells[s.id],label=c.status==='needs-evaluation'?'Needs evaluation':c.status==='confirmed'?'School confirmed':c.status==='reported'?'Proposed match':'Potential use';return'<td class="comparison-cell-'+c.status+'"><details><summary><strong>'+(c.status==='needs-evaluation'?'Needs evaluation':c.credits+' '+(c.placementType==='elective'?'elective':c.placementType==='mixed'?'required / elective':'required')+' '+esc(creditUnit(c)))+'</strong><small>'+esc(label)+'</small></summary><p>'+esc(c.detail)+'</p>'+(c.status==='needs-evaluation'?'<a class="comparison-record-link" href="courses.html?tab=mine">Check my course record →</a>':'')+(c.requirements?.length?'<ul>'+c.requirements.map(r=>'<li>'+esc(r.title)+' · '+r.credits+' '+esc(creditUnit(r))+'</li>').join('')+'</ul>':'')+'</details></td>';}).join('')+'</tr>').join(''):'<tr><td colspan="'+(view.scenarios.length+1)+'">No matching courses. <a href="import-courses.html?from=compare">Upload your past courses</a>, or change this filter.</td></tr>')+'</tbody></table>';$('comparison-library-info').textContent=view.courses.filter(c=>c.status==='earned').length+' completed course records · In-progress and planned work stays separate.';
 }
 function needsIntent(){return options().fromCourses&&!state.selectedPathwayId&&!candidate&&!linkedRoute()&&!state.whatIf?.goalReady&&(!state.journey?.answers?.purpose||!state.journey?.answers?.format);}
 function comparisonProgress(packet,ticket){
  if(ticket!==revision||!viewPending||!packet||!['started','candidate'].includes(packet.phase))return;
  const total=packet.matchingRouteCount,checked=packet.phase==='started'?0:packet.checkedCount;
  if(!Number.isInteger(total)||total<1||total>10000||!Number.isInteger(checked)||checked<0||checked>total)return;
  $('comparison-status').textContent=checked+' of '+total+' matching plans checked. Comparing the remaining options…';
 }
 function render(){
  const ticket=++revision;clearTimeout(renderTimer);comparisonJobs?.cancel();matrixPending=null;viewPending=true;
  if(needsIntent()){$('comparison-priority-control').hidden=true;$('comparison-intent').hidden=false;$('comparison-results').innerHTML='';$('comparison-courses').hidden=true;$('comparison-advanced').hidden=true;$('comparison-status').textContent='Your saved courses stay in one collection. First, tell us what matters to you.';return;}
  $('comparison-priority-control').hidden=false;$('comparison-intent').hidden=true;$('comparison-advanced').hidden=false;
  $('comparison-status').textContent='Comparing your courses across degree plans…';$('comparison-results').innerHTML='';$('comparison-results').setAttribute('aria-busy','true');
  renderTimer=setTimeout(async()=>{try{if(ticket!==revision)return;await ensureRouteModels(routesForComparison());if(ticket!==revision)return;const result=await runner().run('build',{state,catalog:comparisonCatalog(),models,costs,options:options()},{onProgress:packet=>comparisonProgress(packet,ticket)});await loadEstimateRates();if(ticket!==revision)return;view=result;viewPending=false;$('comparison-results').setAttribute('aria-busy','false');const best=bestId()||view.recommendation?.id||view.scenarios.find(s=>s.eligible&&s.available)?.id||view.scenarios.find(s=>s.eligible)?.id,primary=view.scenarios.find(s=>s.id===best)||view.scenarios[0],simple=view.courseFirst&&!view.hasTarget&&!candidate;
   const explicitlyEmpty=!view.hasTarget&&!candidate&&Array.isArray(options().selectedIds)&&options().selectedIds.length===0;
   if(!view.scenarios.length){$('comparison-results').innerHTML=explicitlyEmpty?'<div class="comparison-no-route"><h2>No plans selected.</h2><p>Your courses are still saved. Choose a degree below, or bring back the suggested plans.</p><button type="button" class="comparison-use-button" data-show-suggestions>Show suggestions</button><button type="button" data-choose-comparison>Choose a degree</button></div>':'<div class="comparison-no-route"><h2>Your goal is saved.</h2><p>There isn’t a reviewed route matching these preferences yet. This does not mean your courses cannot transfer.</p><a href="portal.html?view=setup">Choose a school or get guidance</a><button type="button" data-edit-goal>Change my preferences</button></div>';}
   else if(simple){const others=view.scenarios.filter(s=>s!==primary);$('comparison-results').innerHTML='<div class="comparison-student-grid" style="--plan-count:'+view.scenarios.length+'"><div class="comparison-recommendation">'+card(primary,view.scenarios.indexOf(primary),best)+'</div>'+others.map(s=>card(s,view.scenarios.indexOf(s),best)).join('')+'</div>';}
   else $('comparison-results').innerHTML='<div class="comparison-card-scroll" tabindex="0" role="region" aria-label="Side-by-side degree summaries"><div class="comparison-card-grid" style="--plan-count:'+view.scenarios.length+'">'+view.scenarios.map((s,i)=>card(s,i,best)).join('')+'</div></div>';
   $('comparison-courses').hidden=!view.scenarios.length;renderSaved();if($('comparison-courses').open||candidate)renderMatrix();else{$('comparison-matrix').innerHTML='';$('comparison-library-info').textContent='Open to check the individual placements for your courses.';}
   $('compare-slot').innerHTML=(view.hasTarget?[]:['<option value="0">First option</option>']).concat(['<option value="1">Second option</option>','<option value="2">Third option</option>']).join('');
   $('comparison-status').textContent=explicitlyEmpty?'No plans selected. Choose a degree or show suggestions.':view.hasTarget?'Each plan uses your same saved courses. Choose Use this plan when you’re ready to switch.':candidate?'Course preview only. These checks do not choose a degree or record finished credits.':'Compare these options, then choose Use this plan to open its courses. Your degree stays unchosen until then.';
   $('comparison-course-fit-note').hidden=false;$('comparison-course-fit-note').innerHTML='<span>'+(['cost','tuition','terms'].includes($('compare-priority').value)&&view.scenarios.some(s=>s.available&&s.eligible&&!estimateMetric(s,$('compare-priority').value))?'Not every plan here has a reviewed planning estimate, so none is marked lowest or fastest. ':'')+'Compared '+number(view.mappedProgramsChecked)+' degree course plans using your same course collection.</span>'+(view.hasTarget?' <a href="portal.html?view=edit">Change my preferences →</a>':!candidate?' <button type="button" data-edit-goal>Change my preferences</button>':'');
  }catch(e){if(ticket!==revision||superseded(e))return;viewPending=false;fail(e);$('comparison-results').setAttribute('aria-busy','false');$('comparison-status').textContent='Your saved courses and active plan are unchanged.';}},75);
 }
 function renderSaved(){
  const rows=state.whatIf?.snapshots||[];
  if(pendingDeleteSaved&&!rows.some(row=>row.id===pendingDeleteSaved.id))pendingDeleteSaved=null;
  const resume=pendingCapacityResume?'<p><button type="button" data-resume-plan-switch'+(viewPending?' disabled':'')+'>Continue switching plans</button></p>':'';
  $('comparison-saved-versions').innerHTML=rows.length?'<details'+(pendingDeleteSaved||pendingCapacityResume?' open':'')+'><summary>Saved plan versions · '+rows.length+'</summary>'+resume+'<div class="comparison-saved-list">'+rows.map(snapshot=>'<div><span>'+esc(snapshot.label)+'</span><button type="button" data-add-saved="'+esc(snapshot.id)+'">Compare</button><button type="button" data-delete-saved="'+esc(snapshot.id)+'">Delete saved version</button>'+(pendingDeleteSaved?.id===snapshot.id?'<div class="comparison-version-confirm" role="group" aria-label="Confirm saved version deletion"><p>Delete “'+esc(snapshot.label)+'”? This removes its saved planning choices. Your active plan, courses and notes stay unchanged.</p><button type="button" data-confirm-delete-saved="'+esc(snapshot.id)+'">Delete this version</button><button type="button" data-cancel-delete-saved>Keep version</button></div>':'')+'</div>').join('')+'</div></details>':resume;
 }
 function preservesExistingSettings(before,after){
  return ['scenarios','savings'].every(key=>Object.entries(before[key]||{}).every(([id,value])=>JSON.stringify(value)===JSON.stringify(after[key]?.[id])))&&JSON.stringify(before.learning||[])===JSON.stringify(after.learning||[])&&JSON.stringify(before.sheet?.notes||{})===JSON.stringify(after.sheet?.notes||{});
 }
 function needsVersionBackup(value,id){return id!=='current'&&Boolean(value.selectedPathwayId&&!value.sheet?.isExample);}
 function showVersionCapacity(value,preview,id){
  const safe=preservesExistingSettings(value,preview),node=$('comparison-use-content');
  const old=node.querySelector?.('[data-version-capacity]');old?.remove?.();
  const html='<section data-version-capacity role="group" aria-label="Saved version limit"><h3>Your 20 saved versions are full.</h3><p>Keep your saved versions and choose how to continue.</p><button type="button" data-manage-saved-versions>Manage saved versions</button>'+(safe?'<label><input id="comparison-skip-backup" type="checkbox"> Switch plans without saving another version of my current plan. My existing saved versions, courses, notes and per-degree settings stay unchanged.</label>':'<p>This choice changes existing planning settings. Make room for a backup before continuing.</p>')+'</section>';
  // The capacity decision is displayed inside the existing plan confirmation.
  if(typeof node.insertAdjacentHTML==='function')node.insertAdjacentHTML('beforeend',html);else node.innerHTML+=html;
  const note=$('comparison-use').querySelector?.(':scope > p');if(note)note.textContent='Your courses and notes stay saved. Choose how to handle the saved-version limit above.';
  return safe;
 }
 function manageSavedVersions(){
  if(confirming){++revision;comparisonJobs?.cancel();viewPending=false;}
  state=latest();pendingCapacityResume={id:pendingId,destination:pendingDestination};$('comparison-use').close();$('comparison-advanced').open=true;renderSaved();$('comparison-saved-versions').scrollIntoView?.({block:'center'});$('comparison-saved-versions').querySelector?.('summary')?.focus?.();
 }

 function nextStepsHTML(preview,draft){
  if(!window.DegreeChecklist?.build)return '';
  const checklist=DegreeChecklist.build(preview,draft||Journey(preview));if(!checklist.valid)return '';
  const next=[checklist.nextTask,...checklist.tasks.filter(task=>['todo','doing','waiting'].includes(task.status))].filter(Boolean),unique=[...new Map(next.map(task=>[task.id,task])).values()].slice(0,3);
  return unique.length?'<section class="comparison-next-steps"><h3>Your first '+unique.length+' steps</h3><ol>'+unique.map(task=>'<li>'+esc(task.title)+'</li>').join('')+'</ol><p>You can track these in My plan.</p></section>':'';
 }
 function previewUse(id,destination='plan.html'){
  if(viewPending)throw Error('Wait for the updated comparison before choosing a plan.');
  const chosen=view.scenarios.find(s=>s.id===id);
  if(!chosen?.available||!chosen.canUse)throw Error('This degree needs an exact usable course map before it can become your plan.');
  pendingId=id;pendingDestination=destination;
  const stored=latest(),preview=Engine.applyScenario(stored,pendingId,catalog,{...options(),...(options().fromCourses?{collectionSelections:chosen.summary?.collectionSelections||{}}:{})});
  $('comparison-use-content').innerHTML='<strong>'+esc(chosen.draft.pathway.title)+'</strong><p>'+esc(chosen.draft.pathway.school)+'</p>'+(preview.profile.modality!==state.profile.modality?'<p>Study format changes from '+esc(state.profile.modality||'flexible')+' to '+esc(preview.profile.modality)+'.</p>':'')+(options().fromCourses?'<p>Matching unfinished courses become proposed choices. Your original course statuses and school evaluations stay the same.</p>':'')+nextStepsHTML(preview,chosen.draft)+(destination.includes('cost-time')?'<p>Choose this plan, then add your tuition quote or study pace.</p>':'');
  const note=$('comparison-use').querySelector?.(':scope > p');if(note)note.textContent='Your course records and private notes stay saved. Your current active plan will be saved as a version.';
  if(needsVersionBackup(stored,id)&&(stored.whatIf?.snapshots||[]).length>=20)showVersionCapacity(stored,preview,id);
  $('comparison-confirm-use').textContent=destination.includes('cost-time')?'Use plan and add estimate':'Use this plan';
  $('comparison-use').showModal();
 }
 async function confirmUse(){
  if(confirming||!pendingId)return false;
  const id=pendingId,destination=pendingDestination,button=$('comparison-confirm-use'),ticket=++revision;
  confirming=true;viewPending=true;matrixPending=null;clearTimeout(renderTimer);comparisonJobs?.cancel();button.disabled=true;button.textContent='Checking your latest courses…';
  try{
   const stored=latest(),version=JSON.stringify(stored),selectedRoute=view.scenarios.find(s=>s.id===id)?.draft.pathway,pending=pendingDiscoveries.get(selectedRoute?.id);
   let fresh=pending?DegreeProgramCatalog.rememberDiscovery(stored,pending):stored;attachPrivateCurricula(fresh);state=fresh;
   await ensureRouteModels(routesForComparison());if(ticket!==revision||pendingId!==id||!$('comparison-use').open)return false;
   const settings=options(),checked=await runner().run('build',{state:fresh,catalog:comparisonCatalog(fresh),models,costs,options:settings});
   if(ticket!==revision||pendingId!==id||!$('comparison-use').open)return false;
   if(JSON.stringify(latest())!==version)throw Error('Your courses or plan changed while this comparison was running. Nothing was saved. Review the updated comparison and choose your plan again.');
   const choice=checked.scenarios.find(s=>s.id===id);
   if(!choice?.available||!choice.canUse||choice.eligible===false)throw Error('This plan no longer fits the current course choices and preferences. Nothing was saved. Review the updated comparison.');
   const current=checked.scenarios.find(s=>s.isCurrent)?.draft;
   if(fresh.selectedPathwayId&&!fresh.sheet?.isExample&&!current)throw Error('Your current plan could not be saved as a version. Nothing was changed.');
   const applyOptions={...settings,...(settings.fromCourses?{collectionSelections:choice.summary?.collectionSelections||{}}:{})},proposed=Engine.applyScenario(fresh,id,catalog,applyOptions),capacity=needsVersionBackup(fresh,id)&&(fresh.whatIf?.snapshots||[]).length>=20;
   if(capacity&&(!$('comparison-skip-backup')?.checked||!preservesExistingSettings(fresh,proposed))){showVersionCapacity(fresh,proposed,id);viewPending=false;$('comparison-status').textContent='Choose how to continue at the saved-version limit. Your plans are unchanged.';return false;}
   const backup=!capacity&&current&&needsVersionBackup(fresh,id)?Engine.saveScenario(fresh,current,'Previous plan · '+current.pathway.title):fresh;
   const next=capacity?proposed:Engine.applyScenario(backup,id,catalog,applyOptions);
   if(store(next)){location.assign(destination);return true;}
   viewPending=false;
   return false;
  }catch(error){if(!superseded(error)&&ticket===revision){fail(error);$('comparison-use').close();try{state=latest();render();}catch(recovery){viewPending=false;fail(recovery);}}return false;}
  finally{confirming=false;button.disabled=false;if(pendingId===id)button.textContent=destination.includes('cost-time')?'Use plan and add estimate':'Use this plan';}
 }
 async function saveVersion(event){
  if(savingVersion){event.preventDefault();return;}
  event.preventDefault();const ticket=++revision,button=event.target.querySelector('[type=submit]'),label=event.target.elements.label.value;
  savingVersion=true;clearTimeout(renderTimer);comparisonJobs?.cancel();matrixPending=null;viewPending=true;if(button){button.disabled=true;button.textContent='Saving this version…';}
  try{
   const fresh=latest(),version=JSON.stringify(fresh);attachPrivateCurricula(fresh);
   await ensureRouteModels([catalog.pathways.find(route=>route.id===(fresh.selectedPathwayId||fresh.profile?.pathwayId))]);if(ticket!==revision)return;
   const draft=await runner().run('draft',{state:fresh,catalog,models});if(ticket!==revision||!$('comparison-save').open)return;
   if(JSON.stringify(latest())!==version)throw Error('Your plan changed while this version was being checked. Nothing was saved. Try saving the current version again.');
   if(store(Engine.saveScenario(fresh,draft,label))){$('comparison-save').close();render();}else viewPending=false;
  }catch(error){if(ticket===revision&&!superseded(error)){viewPending=false;fail(error);}}
  finally{savingVersion=false;if(button){button.disabled=false;button.textContent='Save version';}}
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
   if(b.dataset.sourceProgram){const route=catalog.pathways.find(route=>route.id===b.dataset.sourceProgram);if(route){const original=b.textContent;let failed=false;b.disabled=true;b.textContent='Checking requirements…';try{await discoverRoute(route,b.dataset.sourceVariant||'',b.dataset.sourceForce==='true');}catch(error){failed=true;$('comparison-status').textContent='Requirements could not be checked. Your comparison is unchanged; try again.';throw error;}finally{b.disabled=false;b.textContent=failed?'Try checking again':original;if(failed)b.dataset.sourceForce='true';}}return;}
   if(b.hasAttribute('data-side-by-side')){sideBySide=true;render();return;}
   if(b.hasAttribute('data-edit-goal')){$('comparison-intent').hidden=false;$('comparison-goal').focus();return;}
   if(b.matches('[data-close-dialog]')){const dialog=b.closest('dialog');dialog.close();if(dialog.id==='comparison-use'&&confirming||dialog.id==='comparison-save'&&savingVersion){++revision;comparisonJobs?.cancel();state=latest();render();}return;}
   if(b.dataset.usePlan){previewUse(b.dataset.usePlan);return;}
   if(b.dataset.estimatePlan){previewUse(b.dataset.estimatePlan,'plan.html?task=cost-time&from=compare');return;}
   if(b.dataset.removePlan){const ids=view.selectedIds.filter((_,i)=>i!==Number(b.dataset.removePlan));if(meta({selectedIds:ids}))render();}
   if(b.dataset.addSaved)selected(Number($('compare-slot').value),'saved:'+b.dataset.addSaved);
   if(b.dataset.deleteSaved){const fresh=latest(),snapshot=(fresh.whatIf?.snapshots||[]).find(item=>item.id===b.dataset.deleteSaved);if(snapshot){state=fresh;pendingDeleteSaved={id:snapshot.id,revision:JSON.stringify(snapshot)};renderSaved();$('comparison-saved-versions').querySelector?.('[data-confirm-delete-saved]')?.focus?.();}return;}
   if(b.hasAttribute('data-cancel-delete-saved')){pendingDeleteSaved=null;renderSaved();return;}
   if(b.dataset.confirmDeleteSaved){if(pendingDeleteSaved?.id!==b.dataset.confirmDeleteSaved)return;const fresh=latest(),snapshot=(fresh.whatIf?.snapshots||[]).find(item=>item.id===pendingDeleteSaved.id);if(!snapshot||JSON.stringify(snapshot)!==pendingDeleteSaved.revision){pendingDeleteSaved=null;state=fresh;renderSaved();throw Error('That saved version changed. Review the latest version before deleting it.');}const next=Engine.removeScenario(fresh,pendingDeleteSaved.id);if(store(next)){pendingDeleteSaved=null;render();}return;}
   if(b.hasAttribute('data-show-suggestions')){const next=latest();next.whatIf={...next.whatIf,version:1};delete next.whatIf.selectedIds;if(store(next)){consumeDiscoveryLink();render();}return;}
   if(b.hasAttribute('data-choose-comparison')){$('comparison-advanced').open=true;$('compare-school').scrollIntoView?.({block:'center'});$('compare-school').focus();return;}
   if(b.hasAttribute('data-manage-saved-versions')){manageSavedVersions();return;}
   if(b.hasAttribute('data-resume-plan-switch')){if(pendingCapacityResume){const resume=pendingCapacityResume;previewUse(resume.id,resume.destination);pendingCapacityResume=null;}return;}
  }catch(error){fail(error);}
 });
 $('comparison-intent-form').addEventListener('submit',e=>{e.preventDefault();const next=latest(),goal=$('comparison-goal').value,licensed=['teacher','lawyer','pilot','health-professional'].includes(goal);next.profile={...next.profile,goal,degreeLevel:$('comparison-level').value,field:licensed?'any':$('comparison-field').value,modality:$('comparison-modality').value,classroomImportance:$('comparison-modality').value==='campus'?'essential':'open'};next.journey={...next.journey,answers:{...next.journey?.answers,purpose:licensed?'licensed-career':goal,level:$('comparison-level').value,...(licensed?{career:goal}:{})},planReviewed:false,schoolContacted:false};next.whatIf={...next.whatIf,version:1,goalReady:true};delete next.whatIf.selectedIds;if(store(next)){consumeDiscoveryLink();render();}});
 $('comparison-goal').addEventListener('change',()=>{$('comparison-field').closest('label').hidden=['teacher','lawyer','pilot','health-professional'].includes($('comparison-goal').value);});
 $('comparison-add').addEventListener('submit',async e=>{e.preventDefault();sideBySide=true;const id=$('compare-degree').value;if(!id)return;selected(Number($('compare-slot').value),id);const route=catalog.pathways.find(route=>route.id===id.slice(6));if(route&&!route.modelId&&!DegreeProgramCatalog.variants(route,catalog).some(child=>child.modelId)){try{await discoverRoute(route);}catch(error){fail(error);}}});
 $('comparison-courses').addEventListener('toggle',()=>{if($('comparison-courses').open){$('comparison-library-info').textContent='Checking individual course placements…';setTimeout(()=>{if($('comparison-courses').open)renderMatrix();},0);}});
 $('compare-school').addEventListener('change',degrees);$('compare-level').addEventListener('change',degrees);$('comparison-search').addEventListener('input',renderMatrix);$('comparison-filter').addEventListener('change',renderMatrix);$('compare-priority').addEventListener('change',()=>{if(meta({priority:$('compare-priority').value}))render();});$('compare-formats').addEventListener('change',()=>{if(meta({includeOtherFormats:$('compare-formats').checked}))render();});
 $('save-scenario-open').addEventListener('click',()=>{$('comparison-save').showModal();$('comparison-save-form').elements.label.focus();});$('comparison-save-form').addEventListener('submit',saveVersion);
 $('comparison-confirm-use').addEventListener('click',confirmUse);
 $('comparison-use').addEventListener('cancel',()=>{if(confirming){++revision;comparisonJobs?.cancel();try{state=latest();render();}catch(error){viewPending=false;fail(error);}}});
 $('comparison-save').addEventListener('cancel',()=>{if(savingVersion){++revision;comparisonJobs?.cancel();try{state=latest();render();}catch(error){viewPending=false;fail(error);}}});
 const Journey=s=>window.DegreeJourney.buildDraft(s,catalog,models);
 window.addEventListener('storage',e=>{if(e.key===KEY&&!document.querySelector('dialog[open]')){try{state=latest();render();}catch(error){fail(error);}}});
 window.addEventListener('pagehide',()=>{++revision;clearTimeout(renderTimer);comparisonJobs?.destroy();});
 window.addEventListener('pageshow',event=>{if(event.persisted){comparisonJobs=null;try{state=latest();render();}catch(error){fail(error);}}});
 (async()=>{try{const data=await Promise.all(['data/pathways.json','data/cost-comparisons.json'].map(async u=>{const r=await fetch(u);if(!r.ok)throw Error('The degree data could not load. Your saved plan is unchanged.');return r.json();}));catalog=await DegreeProgramCatalog.load(data[0]);try{const r=await fetch('data/plan-library-index.json');planIndex=r.ok?await r.json():null;}catch{planIndex=null;}models=DegreeProgramCatalog.loadModels?await DegreeProgramCatalog.loadModels([]):await Promise.all(DegreeProgramCatalog.modelFiles.map(async u=>{const r=await fetch(u);if(!r.ok)throw Error('The degree data could not load. Your saved plan is unchanged.');return r.json();}));costs=data[1];const stored=latest();attachPrivateCurricula(stored);state=DegreeJourney.initialize(stored,null,catalog);await ensureRouteModels([catalog.pathways.find(route=>route.id===(state.selectedPathwayId||state.profile?.pathwayId))]);if(params.get('from')==='courses'||!state.selectedPathwayId||state.sheet?.isExample){document.querySelector('.comparison-heading h1').textContent='Choose a degree for your courses.';document.querySelector('.comparison-heading>div>p').textContent='Compare up to three options, then open your course plan.';document.querySelector('.comparison-back').href='courses.html';document.querySelector('.comparison-back').textContent='← My courses';}$('compare-formats').checked=state.whatIf?.includeOtherFormats===true||linkedFormat();$('compare-priority').value=state.whatIf?.priority||({cost:'cost',speed:'terms',transfer:'collection'})[state.profile.priority]||(options().fromCourses?'collection':'credits');view={scenarios:[]};schoolOptions();$('comparison-controls').hidden=false;$('save-scenario-open').disabled=false;$('save-scenario-open').hidden=!state.selectedPathwayId||state.sheet?.isExample===true;$('comparison-coverage').textContent=comparisonScopeText();if(params.get('course')&&params.get('provider')){const provider=params.get('provider'),requested=params.get('course'),norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');let found=null;try{const response=await fetch('data/course-catalog.json');if(response.ok){const courses=await response.json();found=courses.courses?.find(c=>norm(c.provider)===norm(provider)&&[c.id,c.code,c.mappingCode,...(c.codeAliases||[])].some(x=>x&&norm(x)===norm(requested)));}}catch{}candidate=found?{...found,code:found.code||found.mappingCode||'',title:found.title}: {provider,code:requested,title:requested};$('comparison-search').value=candidate.title;$('comparison-candidate').hidden=false;$('comparison-candidate').textContent='Checking '+provider+' '+candidate.title+' across these plans. A course preview does not add earned credits.';}for(const[id,value]of[['comparison-goal',state.profile.goal],['comparison-level',['associate','bachelor','master','doctorate','specialist'].includes(state.profile.degreeLevel)?state.profile.degreeLevel:'bachelor'],['comparison-field',state.profile.field],['comparison-modality',state.profile.modality]])if(value)$(id).value=value;render();}catch(e){fail(e);$('comparison-status').textContent='Open your saved plan, then try again.';}})();
}());
