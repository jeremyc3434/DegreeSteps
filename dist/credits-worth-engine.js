/* "What are my credits worth?" Ranks reviewed degree plans by how much of each degree a student's finished
 * courses could fill, using the same planner, matching and estimate engines as the worksheet.
 * Pure: no storage, no network, no credit awards. A match is a proposal; the school evaluates official records. */
(function(root,factory){
 'use strict';
 const common=typeof module==='object'&&module.exports;
 const api=factory(()=>({
  Journey:common?require('./journey-engine.js'):root.DegreeJourney,
  Guide:common?require('./guide-engine.js'):root.DegreeGuide,
  Planner:common?require('./planner.js'):root.DegreePlanner,
  Catalog:common?require('./program-catalog.js'):root.DegreeProgramCatalog,
  Estimate:common?require('./plan-estimate-engine.js'):root.DegreePlanEstimate
 }));
 if(common)module.exports=api;else root.DegreeCreditsWorth=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(dependencies){
 'use strict';
 const list=value=>Array.isArray(value)?value:[],copy=value=>JSON.parse(JSON.stringify(value));
 const text=value=>typeof value==='string'?value.trim():'',finite=value=>typeof value==='number'&&Number.isFinite(value);
 const round=value=>Math.round((value+Number.EPSILON)*100)/100;
 const DONE=new Set(['reported','confirmed']);
 const SORTS=['covered','left','cost'];
 let deps=null;const engines=()=>deps||(deps=dependencies());

 /** Finished (earned) learning records from a saved v3 draft or a plain list. Other statuses are not counted. */
 function completedRecords(source){
  const records=Array.isArray(source)?source:list(source?.learning);
  return records.filter(record=>record&&typeof record==='object'&&record.status==='earned'&&text(record.provider)&&text(record.title)).map(copy);
 }

 /** The plan's published starting route (baseline-index row choices), exactly as portal.html?usePlan opens it. */
 function startingRoute(model,baseline){
  if(!model||!baseline||baseline.modelId!==model.id||!Array.isArray(baseline.rows))return null;
  const {Planner}=engines(),balance=Planner?.creditBalancePolicy?.(model)||null,balanceIds=new Set(list(balance?.balanceRequirementIds));
  const selections={},providers=new Set();
  for(const row of baseline.rows){
   const requirement=list(model.requirements).find(item=>item.id===row.requirementId);
   if(!requirement)return null;
   if(row.optionId===null&&balanceIds.has(requirement.id))continue;
   const option=list(requirement.options).find(item=>item.id===row.optionId&&item.provider===row.provider&&item.credits===row.credits);
   if(!option)return null;
   if(option.provider!=='University')providers.add(option.provider);
   if(balanceIds.has(requirement.id))continue;
   selections[requirement.id]=option.id;
  }
  return {providers:[...providers].sort(),selections};
 }

 /** A neutral target state for one plan. Only the student's finished records are carried; nothing is saved. */
 function planState(route,model,start,learning){
  const {Journey,Guide}=engines(),state=Journey.initialize(null,null,{pathways:[route]});
  delete state.targetIdentity;
  state.sheet={...state.sheet,isExample:false};
  state.learning=copy(list(learning));
  state.selectedPathwayId=route.id;
  const modalities=list(route.modalities).filter(value=>['online','campus'].includes(value));
  state.profile={...state.profile,entry:'target',school:route.school,schoolChoice:route.school,degree:route.title,pathwayId:route.id,
   degreeLevel:Guide.normalizeProfile({degreeLevel:route.level}).degreeLevel,modality:modalities.length===1?modalities[0]:'any',
   classroomImportance:'open',field:'any',goal:'any-degree',hasPrior:state.learning.length?'some':'none'};
  state.scenarios={[model.id]:{providers:[...start.providers],optionSelections:{...start.selections}}};
  return state;
 }

 function estimateFor(draft,rates){
  const {Estimate}=engines();
  if(!rates||!Estimate?.calculate)return {status:'needs-confirmation',reason:'Planning estimates could not load.'};
  let result;try{result=Estimate.calculate({program:draft.program,plan:draft.plan,rates});}catch{result=null;}
  const range=result?.costs?.knownRange;
  if(result?.available===true&&result.status==='planning-range'&&finite(range?.min)&&finite(range?.max)&&range.min>=0&&range.max>=range.min)
   return {status:'range',min:Math.round(range.min),max:Math.round(range.max)};
  // A partial range leaves some course prices out: it is labelled as known charges, never as a total.
  if(result?.available===true&&result.status==='partial-range'){
   const unpriced=list(result.costs?.providerBreakdown).filter(line=>line.cost===null).map(line=>line.provider);
   // Shown as known charges so far (as on the finder, guided planner and worksheet), never as a total.
   if(finite(range?.min)&&finite(range?.max)&&range.min>=0&&range.max>=range.min)return {status:'partial',min:Math.round(range.min),max:Math.round(range.max),unpriced,reason:unpriced.length?'Some course prices are not included yet: '+unpriced.join(', ')+'.':'Some prices are not included yet.'};
   return {status:'needs-confirmation',reason:unpriced.length?'Some course prices are not included yet: '+unpriced.join(', ')+'.':'Some prices are not included yet.'};
  }
  return {status:'needs-confirmation',reason:text(result?.reason)||'A researched cost range is not available for this exact degree yet.'};
 }

 /**
  * Evaluates one plan for the student's finished records.
  * input: {route, model, baseline, indexEntry, learning, rates}. Returns a plain, serializable result.
  */
 function evaluatePlan(input){
  const {route,model,baseline,indexEntry={},rates}=input||{},learning=completedRecords(list(input?.learning));
  const base={routeId:text(route?.id),modelId:text(model?.id||indexEntry.modelId),school:text(route?.school||model?.school),title:text(route?.title||model?.title),
   level:text(route?.level||model?.level),modalities:list(route?.modalities).filter(value=>['online','campus'].includes(value)),
   subjects:list(indexEntry.subjects),tier:indexEntry.tier==='reviewed'?'reviewed':'confirmation',questions:list(indexEntry.questions).map(String),
   creditSystem:model?.creditSystem||'semester',totalCredits:finite(model?.totalCredits)?model.totalCredits:null};
  const unavailable=reason=>({...base,status:'unavailable',reason,filled:0,remainingOutside:null,remainingUniversity:null,unresolved:null,matches:[],records:{},estimate:{status:'needs-confirmation',reason}});
  if(!route||!model)return unavailable('This plan’s course requirements could not load.');
  const start=startingRoute(model,baseline);
  if(!start)return unavailable('This plan’s starting course choices are being updated.');
  const {Journey,Guide}=engines();
  let draft;
  try{draft=Journey.buildDraft(planState(route,model,start,learning),{pathways:[route]},[model]);}catch{draft=null;}
  const plan=draft?.plan;
  if(!plan||!draft.program||plan.validation?.academicCountsValid!==true)return unavailable('This plan could not be checked with your courses. Open it to review.');
  let filled=0,remainingOutside=0,remainingUniversity=0,unresolved=0;
  const doneRequirements=new Set();
  for(const row of plan.rows){
   const credits=finite(row.credits)?row.credits:0,institutional=row.institutional===true||row.option?.provider==='University';
   if(DONE.has(row.status)){filled+=credits;doneRequirements.add(row.requirementId);}
   else if(row.status==='unresolved')unresolved+=credits;
   else if(institutional)remainingUniversity+=credits;
   else remainingOutside+=credits;
  }
  // Per-record outcome in this plan: placed, an ambiguous hand-typed code, a published reason it cannot count, or no proposed option.
  const placements=list(draft.match?.completed),records={},matches=[];let listed=null;
  const reasons=new Map(list(draft.match?.reviewReasons).map(item=>[item.learningId,item.reason]));
  for(const record of learning){
   const placed=placements.filter(item=>item.learningId===record.id&&doneRequirements.has(item.requirementId));
   if(placed.length){
    const credits=round(placed.reduce((sum,item)=>sum+(finite(item.credits)?item.credits:finite(plan.rows.find(row=>row.requirementId===item.requirementId)?.credits)?plan.rows.find(row=>row.requirementId===item.requirementId).credits:0),0));
    records[record.id]={status:'placed',credits};
    for(const item of placed){const row=plan.rows.find(r=>r.requirementId===item.requirementId);matches.push({learningId:record.id,requirementId:item.requirementId,requirement:text(row?.title)||text(row?.code)||item.requirementId,credits:finite(row?.credits)?row.credits:0});}
   }else if(Guide.manualIdentityAmbiguous?.(draft.program,record))records[record.id]={status:'ambiguous',severalCodes:Boolean(Guide.manualCodeLineHasSeveralCodes?.(record))};
   else if(reasons.has(record.id))records[record.id]={status:'review',reason:reasons.get(record.id)};
   // The plan lists this exact provider course but did not place it: say so, rather than "no listed match".
   else if(recordKeys(record).some(item=>(listed||(listed=new Set(planKeys(model)))).has(item)))records[record.id]={status:'review',reason:finite(record.credits)&&record.credits>0?'this plan lists this course, but its rules did not place it here (for example a course-level, duplicate or credit-limit rule). Ask the school to evaluate it.':'this plan lists this course, but its credit amount isn’t recorded. Add it as your own course with the credits on your record to check it.'};
   else records[record.id]={status:'none'};
  }
  return {...base,status:'ok',filled:round(filled),remainingOutside:round(remainingOutside),remainingUniversity:round(remainingUniversity),unresolved:round(unresolved),
   startingOutside:finite(baseline?.summary?.transferCredits)?baseline.summary.transferCredits:null,matches,records,estimate:estimateFor(draft,rates)};
 }

 /** Share of the degree the student's courses could fill (0–1). */
 const covered=result=>result.status==='ok'&&result.totalCredits>0?result.filled/result.totalCredits:0;
 const left=result=>result.status==='ok'&&finite(result.totalCredits)?result.totalCredits-result.filled:Infinity;
 const priced=result=>result.status==='ok'&&result.estimate?.status==='range';

 /** Pure ranking and filtering. Unknown cost never sorts as zero; unavailable plans always sort last. */
 const LEVELS=['associate','bachelor','master','doctorate'];
 function rank(results,options={}){
  const sort=SORTS.includes(options.sort)?options.sort:'covered',subject=text(options.subject),format=['online','campus'].includes(options.format)?options.format:'',level=LEVELS.includes(options.level)?options.level:'';
  const az=(a,b)=>a.title.localeCompare(b.title)||a.school.localeCompare(b.school)||a.routeId.localeCompare(b.routeId);
  const byCovered=(a,b)=>covered(b)-covered(a)||b.filled-a.filled||left(a)-left(b)||az(a,b);
  const comparators={
   covered:byCovered,
   // Plans your courses actually touch come first; otherwise a short master's degree with no matches would 'win'.
   left:(a,b)=>Number(b.filled>0)-Number(a.filled>0)||left(a)-left(b)||covered(b)-covered(a)||az(a,b),
   cost:(a,b)=>Number(priced(b))-Number(priced(a))||(priced(a)&&priced(b)?a.estimate.min-b.estimate.min||a.estimate.max-b.estimate.max:0)||byCovered(a,b)
  };
  const filtered=list(results).filter(result=>(!subject||list(result.subjects).includes(subject))&&(!format||list(result.modalities).includes(format))&&(!level||key(result.level).startsWith(level))&&(!options.matchedOnly||result.filled>0));
  const sorted=filtered.slice().sort((a,b)=>Number(a.status!=='ok')-Number(b.status!=='ok')||comparators[sort](a,b));
  return {sort,subject,format,level,results:sorted,total:list(results).length,withMatches:list(results).filter(result=>result.filled>0).length};
 }

 /** One line per finished record across every checked plan: where it was proposed, or why it needs review. */
 function recordSummary(results,learning){
  const checked=list(results).filter(result=>result.status==='ok');
  return completedRecords(list(learning)).map(record=>{
   const outcomes=checked.map(result=>result.records?.[record.id]).filter(Boolean);
   const placed=outcomes.filter(item=>item.status==='placed').length,ambiguous=outcomes.some(item=>item.status==='ambiguous');
   const reason=outcomes.find(item=>item.status==='review')?.reason||'';
   const status=placed?'matched':ambiguous?'ambiguous':reason?'review':'none';
   return {id:record.id,provider:record.provider,code:text(record.code),title:record.title,credits:finite(record.credits)?record.credits:null,status,plans:placed,checked:checked.length,reason,severalCodes:outcomes.some(item=>item.status==='ambiguous'&&item.severalCodes)};
  });
 }

 /**
  * Evaluates every indexed plan, loading models lazily per curriculum file. Used by the Web Worker and the
  * main-thread fallback. deps: {loadModels(ids)=>Promise<models>, pause()=>Promise, cancelled()=>bool, onResult(result,done,total)}.
  */
 async function evaluateAll(input,hooks={}){
  const {index,catalog,baselines,registry,rates,learning}=input,{Catalog}=dependencies(),plans=(Catalog?.planLibraryRoutes?.(catalog,[],index)||[]).filter(route=>index?.plans?.[route.id]?.modelId===route.modelId).map(route=>[route.id,index.plans[route.id]]);
  const routes=new Map(list(catalog?.pathways).map(route=>[route.id,route])),byModel=new Map(list(registry?.models).map(entry=>[entry.id,entry]));
  const baselineFor=(routeId,modelId)=>Object.values(baselines?.baselines||{}).find(item=>item.pathwayId===routeId&&item.modelId===modelId)||null;
  // Group plans by their curriculum file so each file is fetched once, and results appear as files arrive.
  const groups=new Map();for(const [routeId,entry] of plans){const path=byModel.get(entry.modelId)?.path||'unknown:'+entry.modelId;if(!groups.has(path))groups.set(path,[]);groups.get(path).push([routeId,entry]);}
  const total=plans.length,results=[];let done=0;
  const ordered=[...groups.values()].sort((a,b)=>a.length-b.length);
  const run=async group=>{
   let models=[];try{models=await hooks.loadModels([...new Set(group.map(([,entry])=>entry.modelId))]);}catch{models=[];}
   for(const [routeId,entry] of group){
    if(hooks.cancelled?.())return;
    const model=list(models).find(item=>item.id===entry.modelId);
    const result=evaluatePlan({route:routes.get(routeId),model,baseline:baselineFor(routeId,entry.modelId),indexEntry:entry,learning,rates});
    results.push(result);done++;hooks.onResult?.(result,done,total);
    if(hooks.pause)await hooks.pause();
   }
  };
  const concurrency=Math.max(1,Math.min(3,hooks.concurrency||2));let cursor=0;
  await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<ordered.length&&!hooks.cancelled?.())await run(ordered[cursor++]);}));
  return results;
 }

 // ---------- Lightweight check: a compact per-plan identity index (dist/data/plan-course-index.json) ----------
 // These mirror guide-engine's key/providerKey/codeTokens so the index is a superset of what the matcher reads.
 const key=value=>text(value).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const providerKey=value=>({sophialearning:'sophia',studycom:'studycom',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[key(value)]||key(value));
 const codeTokens=value=>(text(value).match(/\b[A-Za-z]{2,6}[\s-]?\d{3,5}[A-Za-z]?\b/g)||[]).map(key);
 /** Every outside/university option identity a plan lists: provider:code for codes and aliases, provider#listingId for catalog listings. */
 function planKeys(model){
  const keys=new Set();
  for(const requirement of list(model?.requirements))for(const option of list(requirement.options)){
   const provider=providerKey(option.provider);if(!provider)continue;
   for(const code of [option.code,...list(option.codeAliases)])if(key(code))keys.add(provider+':'+key(code));
   for(const id of list(option.listingIdentityIds))if(text(id))keys.add(provider+'#'+text(id));
  }
  return [...keys].sort();
 }
 /** Every identity a record could resolve to: its codes, aliases, code-shaped tokens in its code or title, and its catalog listing. */
 function recordKeys(record){
  const provider=providerKey(record?.provider);if(!provider)return [];
  const codes=[record.code,record.mappingCode,record.sourceListingCode,...list(record.codeAliases)].map(key).filter(Boolean);
  const keys=new Set([...codes,...codeTokens(record.code),...codeTokens(record.title)].filter(Boolean).map(code=>provider+':'+code));
  if(text(record.catalogCourseId))keys.add(provider+'#'+text(record.catalogCourseId));
  return [...keys];
 }
 /** Conservative: true whenever the matcher could place, flag or explain this record in this plan. */
 function recordTouchesPlan(record,plan,keySet){
  if(list(record?.evaluations).length&&list(record.evaluations).some(item=>!item?.programId||item.programId===plan.modelId))return true;
  if(text(record?.sourceProgramId)&&record.sourceProgramId===plan.modelId)return true;
  if(providerKey(record?.provider)==='university'&&key(record.institution)&&key(record.institution)===key(plan.route?.school))return true;
  return recordKeys(record).some(item=>keySet.has(item));
 }
 /** The plan's result for records it cannot match: its starting route, with each record marked "no listed match". */
 function untouchedResult(plan,learning){
  return {...copy(plan.start),matches:[],records:Object.fromEntries(completedRecords(learning).map(record=>[record.id,{status:'none'}]))};
 }
 function validCourseIndex(index){
  return index?.kind==='degreesteps-plan-course-index'&&index.version===1&&index.selectionPolicy==='publication-ready-models-v1'&&Array.isArray(index.keys)&&index.plans&&typeof index.plans==='object'&&new Set(Object.values(index.plans).map(plan=>plan?.modelId)).size===Object.keys(index.plans).length&&Object.values(index.plans).every(plan=>plan&&plan.start&&plan.start.tier==='reviewed'&&plan.route&&plan.route.modelId===plan.modelId&&Array.isArray(plan.keys)&&typeof plan.modelId==='string');
 }
 /**
  * Same results as evaluateAll, but only plans a finished record could touch load their curriculum.
  * hooks: {loadModels(ids,paths), loadRates(), pause(), cancelled(), onResult(result,done,total), concurrency}
  */
 async function evaluateWithIndex(index,input,hooks={}){
  if(!validCourseIndex(index))throw Error('The plan course index is unavailable.');
  const learning=completedRecords(list(input?.learning)),entries=Object.entries(index.plans),total=entries.length,results=[];let done=0;
  const touched=[];
  for(const [routeId,plan] of entries){
   const keySet=new Set(plan.keys.map(i=>index.keys[i]));
   if(learning.some(record=>recordTouchesPlan(record,plan,keySet)))touched.push([routeId,plan]);
   else{const result=untouchedResult(plan,learning);results.push(result);done++;hooks.onResult?.(result,done,total);}
  }
  if(!touched.length||hooks.cancelled?.())return results;
  let rates=null;try{rates=hooks.loadRates?await hooks.loadRates():input?.rates||null;}catch{rates=null;}
  const groups=new Map();for(const item of touched){const path=item[1].path||'unknown:'+item[1].modelId;if(!groups.has(path))groups.set(path,[]);groups.get(path).push(item);}
  const ordered=[...groups.values()].sort((a,b)=>a.length-b.length);
  const run=async group=>{
   let models=[];try{models=await hooks.loadModels([...new Set(group.map(([,plan])=>plan.modelId))]);}catch{models=[];}
   for(const [routeId,plan] of group){
    if(hooks.cancelled?.())return;
    const result=evaluatePlan({route:plan.route,model:list(models).find(item=>item.id===plan.modelId),baseline:plan.baseline,indexEntry:{modelId:plan.modelId,tier:plan.start.tier,subjects:plan.start.subjects,questions:plan.start.questions},learning,rates});
    results.push(result);done++;hooks.onResult?.(result,done,total,routeId);
    if(hooks.pause)await hooks.pause();
   }
  };
  const concurrency=Math.max(1,Math.min(3,hooks.concurrency||2));let cursor=0;
  await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<ordered.length&&!hooks.cancelled?.())await run(ordered[cursor++]);}));
  return results;
 }

 return Object.freeze({completedRecords,startingRoute,planState,evaluatePlan,rank,recordSummary,evaluateAll,planKeys,recordKeys,recordTouchesPlan,untouchedResult,validCourseIndex,evaluateWithIndex,SORTS:[...SORTS],LEVELS:[...LEVELS]});
}));
