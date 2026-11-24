/* Read-only discovery projections use the same whole-degree comparison and estimate engines. */
(function(root,factory){
 'use strict';const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./plan-comparison-engine.js'):root.DegreePlanComparison,common?require('./program-catalog.js'):root.DegreeProgramCatalog,common?require('./guide-engine.js'):root.DegreeGuide,common?require('./plan-estimate-engine.js'):root.DegreePlanEstimate);
 if(common)module.exports=api;else root.DegreeDiscoveryFit=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(Engine,Catalog,Guide,Estimate){
 'use strict';
 const KEY='degreepath-guide-v3',MAX_ROUTES=64,list=value=>Array.isArray(value)?value:[],object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{},clone=value=>JSON.parse(JSON.stringify(value));
 const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0,range=value=>value&&finite(value.min)&&finite(value.max)&&value.max>=value.min;
 function hasCourses(state){return list(state?.learning).some(record=>record&&['earned','in-progress','planned','saved'].includes(record.status));}
 function readState(storage){
  const raw=storage?.getItem(KEY);if(!raw)return null;let value;
  try{value=JSON.parse(raw);}catch{throw Error('Your saved courses could not be read. They have not been changed.');}
  if(value?.version!==3||!value.profile||typeof value.profile!=='object'||Array.isArray(value.profile)||!Array.isArray(value.learning))throw Error('Your saved courses need recovery. They have not been changed.');
  return value;
 }
 function detached(state,options){
  const next=clone(state),profile={...object(next.profile),entry:'explore',school:'',schoolChoice:'',degree:'',pathwayId:''};
  if(options.includeOtherFormats===true){profile.modality='any';profile.classroomImportance='open';}
  const override=object(options.discoveryProfile),allowed={degreeLevel:['unsure','associate','bachelor','master','doctorate','specialist'],modality:['any','online','campus'],classroomImportance:['open','preferred','essential']};
  for(const [name,value]of Object.entries(override)){
   if(!['field','degreeLevel','modality','classroomImportance'].includes(name))throw Error('Choose supported degree-search preferences.');
   if(name==='field'?typeof value!=='string'||Guide.normalizeProfile({field:value}).field!==value:!allowed[name].includes(value))throw Error('Choose valid degree-search preferences.');
   profile[name]=value;
  }
  next.profile=profile;next.selectedPathwayId='';delete next.targetIdentity;
  next.sheet={...object(next.sheet),isExample:true};next.whatIf={...object(next.whatIf),selectedIds:[]};
  return next;
 }
 const summaryKeys=['degreeCredits','applicableCompletedCredits','confirmedCredits','reportedCredits','remainingCredits','universityCreditsRemaining','researchGapCredits','collectionFitCredits','potentialCollectionCredits','collectionFitFraction','completedFitFraction','collectionNeedsEvaluation','collectionAdoptionNeedsReview','creditSystem','provisional'];
 function compact(value){if(!value)return null;const result={};for(const key of summaryKeys)if(value[key]!==undefined)result[key]=value[key];result.fitBreakdown={...object(value.fitBreakdown)};return result;}
 function validEstimate(value){return value?.available===true&&['planning-range','partial-range'].includes(value.status)&&value.costs?.currency==='USD'&&value.costs.complete===false&&value.costs.scope==='known-remaining-course-charges-before-aid'&&range(value.costs.knownRange)&&range(value.timing?.outsideMonths)&&range(value.timing?.universityTerms);}
 function evaluate(state,catalog,models,costs,options={},runtime={}){
  if(!state||state.version!==3||!Array.isArray(state.learning)||!state.profile)throw Error('Your saved courses could not be read. They have not been changed.');
  if(!Array.isArray(options.routeIds)||options.routeIds.length>MAX_ROUTES||options.routeIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(id)))throw Error('Choose up to '+MAX_ROUTES+' degree plans to compare.');
  const routeIds=[...new Set(options.routeIds)],results=[],base=detached(state,options),loaded=new Set(list(models).map(model=>model.id));
  // Publication and model-fingerprint gates are checked here as well as in the UI.
  let published=Catalog.publishedPlans(catalog,models);
  if(options.publication!==undefined){
   const supplied=options.publication,known=catalog?.publicationIndex;
   if(supplied?.schemaVersion!==1||supplied.privateRecordsIncluded!==false||supplied.registryRevision!==known?.registryRevision||supplied.curriculumFingerprint!==known?.curriculumFingerprint||!Array.isArray(supplied.plans))published=[];
   else published=published.filter(route=>supplied.plans.some(entry=>entry.publicationReady===true&&entry.modelId===route.modelId&&entry.modelFingerprint===known.plans.find(plan=>plan.modelId===route.modelId)?.modelFingerprint&&list(entry.routeIds).includes(route.id)));
  }
  const routes=new Map(published.map(route=>[route.id,route])),totalCount=routeIds.length;
  const notify=value=>{try{runtime.onProgress?.(clone(value));}catch{/* Rendering cannot alter a calculation. */}};
  notify({phase:'started',checkedCount:0,totalCount,complete:false});
  for(const id of routeIds){
   const route=routes.get(id);let result={pathwayId:id,available:false,eligible:false,reason:'A reviewed personal course calculation is not available for this degree yet.',summary:null,estimate:null};
   if(route&&loaded.has(route.modelId)){
    const eligible=Guide.recommend(base.profile,{...catalog,pathways:[route]},[],[]).length>0;
    if(!eligible)result.reason='This degree does not match your current career or study preferences.';
    else{
     try{
      const view=Engine.build(base,{...catalog,pathways:[route]},models,costs,{selectedIds:['route:'+id],fromCourses:true,deferMatrix:true,priority:'collection'}),scenario=view.scenarios.find(item=>item.pathwayId===id);
      if(scenario){
       let estimate=null;if(scenario.available&&scenario.eligible&&options.estimateRates&&Estimate){const value=Estimate.calculate({program:scenario.draft.program,plan:scenario.draft.plan,rates:options.estimateRates});if(validEstimate(value))estimate=value;}
       result={pathwayId:id,available:scenario.available===true,eligible:scenario.eligible===true,reason:scenario.reason||null,summary:scenario.available&&scenario.eligible?compact(scenario.summary):null,estimate};
      }
     }catch{result.reason='This degree’s course calculation could not finish. Your saved courses are unchanged.';}
    }
   }
   results.push(result);notify({phase:'candidate',checkedCount:results.length,totalCount,complete:false,candidate:result});
  }
  return{routeIds,results,checkedCount:results.length,totalCount,complete:true,eligibilityScope:'saved-goal-and-study-preferences'};
 }
 function rank(results,priority='collection'){
  const metric=result=>{
   if(!result?.available||!result.eligible||!result.summary)return null;
   if(priority==='cost')return validEstimate(result.estimate)&&result.estimate.status==='planning-range'?result.estimate.costs.knownRange.min:null;
   if(['time','terms','speed'].includes(priority))return validEstimate(result.estimate)&&range(result.estimate.timing.totalMonths)?result.estimate.timing.totalMonths.min:null;
   return result.summary[priority==='credits'?'completedFitFraction':'collectionFitFraction'];
  };
  const descending=!['cost','time','terms','speed'].includes(priority),known=value=>finite(value),fraction=result=>known(result?.summary?.completedFitFraction)?result.summary.completedFitFraction:-1;
  const midpoint=result=>{const value=priority==='cost'?result.estimate?.costs?.knownRange:result.estimate?.timing?.totalMonths;return range(value)?(value.min+value.max)/2:null;};
  return list(results).map((value,index)=>({value,index})).sort((a,b)=>{
   const left=metric(a.value),right=metric(b.value),difference=Number(known(right))-Number(known(left));
   return difference||(known(left)&&known(right)?(descending?right-left:left-right):0)||(!descending&&known(left)&&known(right)?midpoint(a.value)-midpoint(b.value):0)||fraction(b.value)-fraction(a.value)||a.index-b.index;
  }).map(item=>item.value);
 }
 return Object.freeze({KEY,MAX_ROUTES,readState,hasCourses,evaluate,rank});
}));
