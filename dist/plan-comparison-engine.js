/* Degree scenarios share original learning; a scenario never owns a copy of the student's credits. */
(function(root,factory){const common=typeof module==='object'&&module.exports;const api=factory(common?require('./sheet-state.js'):root.DegreeSheet,common?require('./journey-engine.js'):root.DegreeJourney,common?require('./guide-engine.js'):root.DegreeGuide,common?require('./planner.js'):root.DegreePlanner,common?require('./cost-engine.js'):root.DegreeCostComparison,common?require('./savings-engine.js'):root.DegreeSavings,common?require('./program-catalog.js'):root.DegreeProgramCatalog);if(common)module.exports=api;else root.DegreePlanComparison=api;}(typeof globalThis!=='undefined'?globalThis:this,function(Sheet,Journey,Guide,Planner,Cost,Savings,Catalog){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),list=x=>Array.isArray(x)?x:[],obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{},key=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const providerIdentity=value=>({sophialearning:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[key(value)]||key(value));
 const isElective=row=>['elective','electives'].includes(row.category);
 const review=new Set(['program_research','reported_credit','conditional_mapping','selection_required','unknown_provenance','waiver_confirmation','policy_review']);
 function saved(state){return list(state.whatIf?.snapshots);}
 function routeFor(state,catalog){return Sheet.targetRoute(state,catalog)||(!state.sheet?.isExample&&(state.selectedPathwayId||state.profile?.pathwayId)&&state.profile?.degree?{id:state.selectedPathwayId||state.profile.pathwayId,school:state.profile.school||state.profile.schoolChoice,title:state.profile.degree,level:state.profile.degreeLevel}:null);}
 function capture(state,draft,label,id){return Catalog.planSnapshot(state,draft,{id:id||'scenario-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),label:label||draft.pathway.title});}
 function saveScenario(state,draft,label,id){const next=clone(state),snapshot=capture(state,draft,label,id),rows=saved(next).filter(x=>x.id!==snapshot.id);if(rows.length>=20)throw Error('Keep up to 20 saved scenarios. Remove one before saving another.');next.whatIf={...obj(next.whatIf),version:1,snapshots:[...rows,snapshot]};return next;}
 function removeScenario(state,id){const next=clone(state);next.whatIf={...obj(next.whatIf),snapshots:saved(next).filter(s=>s.id!==id),selectedIds:list(next.whatIf?.selectedIds).filter(s=>s!=='saved:'+id)};return next;}
 function target(state,id,catalog,options={}){
  if(id==='current')return clone(state);
  const snapshot=id.startsWith('saved:')?saved(state).find(s=>s.id===id.slice(6)):null;
  if(id.startsWith('saved:')&&!snapshot)throw Error('This saved plan could not be found. Your current plan has not been replaced.');
  const restored=snapshot?.targetIdentity?Sheet.restoreTarget(clone(state),snapshot.targetIdentity,catalog):null;
  const route=restored?Sheet.targetRoute(restored,catalog):list(catalog.pathways).find(p=>p.id===(snapshot?.pathwayId||(id.startsWith('route:')?id.slice(6):'')));
  if(!route)throw Error('That program is no longer in the current catalog. Your saved courses are unchanged.');
  let next=restored||Sheet.selectPathway(clone(state),route);next.profile={...next.profile,priority:snapshot?.priority||state.profile.priority};
  if(options.includeOtherFormats&&!snapshot){next.profile.modality='any';next.profile.classroomImportance='open';}
  if(snapshot){const k=route.modelId||route.id;next.scenarios={...next.scenarios,[k]:clone(obj(snapshot.settings))};next.savings={...next.savings,[k]:clone(obj(snapshot.savings))};}
  return next;
 }
 function applyScenario(state,id,catalog,options={}){
  const next=target(state,id,catalog,options),route=routeFor(next,catalog);
  if(options.includeOtherFormats&&!id.startsWith('saved:')&&route?.modalities?.length===1){next.profile.modality=route.modalities[0];if(next.profile.modality!=='campus')next.profile.classroomImportance='open';}
  if(options.collectionSelections&&route){const k=route.modelId||route.id;next.scenarios={...next.scenarios,[k]:{...obj(next.scenarios?.[k]),optionSelections:{...obj(next.scenarios?.[k]?.optionSelections),...clone(options.collectionSelections)}}};}
  next.journey={...next.journey,view:'home',completed:true,planReviewed:false,schoolContacted:false};
  return next;
 }
 function aliases(models){
  const parents=new Map(),listings=new Map();
  const find=x=>{if(!parents.has(x))parents.set(x,x);if(parents.get(x)!==x)parents.set(x,find(parents.get(x)));return parents.get(x);};
  for(const model of models){
   const sources=new Map(list(model.sources).map(source=>[source.id,source]));
   for(const req of model.requirements)for(const option of req.options){
    const provider=providerIdentity(option.provider),codes=[option.code||option.id,...list(option.codeAliases)].map(code=>provider+':'+key(code));
    find(codes[0]);for(const code of codes.slice(1))parents.set(find(code),find(codes[0]));
    if(!list(option.listingIdentitySourceIds).length||!option.listingIdentitySourceIds.every(id=>{try{const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}))continue;
    for(const id of list(option.listingIdentityIds)){const listing=provider+':'+id;if(!listings.has(listing))listings.set(listing,new Set());listings.get(listing).add(codes[0]);}
   }
  }
  return item=>{
   const provider=providerIdentity(item.provider);
   if(provider==='university')return'university:'+key(item.institution)+':'+String(item.sourceProgramId||'')+':'+(key(item.code)||item.id);
   const curated=item.catalogCourseId&&['curated-course-map','provider-listing'].includes(item.codeBasis),codes=[item.code,...(curated?list(item.codeAliases):[])].filter(Boolean).map(code=>provider+':'+key(code)),known=codes.find(code=>parents.has(code));
   if(codes.length)return find(known||codes[0]);
   const exact=listings.get(provider+':'+item.catalogCourseId),identities=new Set([...(exact||[])].map(find));
   return identities.size===1?[...identities][0]:'record:'+item.id;
  };
 }
 function sourceQuantity(option,fallbackUnits,candidate){
  const known=value=>typeof value==='number'&&Number.isFinite(value)&&value>0,units=value=>['semester','quarter','competency-unit'].includes(value)?value:null;
  const independent=candidate&&['provider-directory','student-record'].includes(candidate.creditBasis)&&providerIdentity(candidate.provider)===providerIdentity(option.provider)&&[option.code||option.id,...list(option.codeAliases)].some(code=>key(code)===key(candidate.code));
  const credits=option.sourceCredits,creditSystem=units(option.sourceCreditSystem);
  if(known(credits)&&creditSystem)return{credits,creditSystem};
  if(independent&&known(candidate.credits)&&units(candidate.creditSystem))return{credits:candidate.credits,creditSystem:candidate.creditSystem};
  return{credits:null,creditSystem:null};
 }
 function inventory(state,current,models,candidate){
  const identity=aliases(models),groups=new Map(),add=(record,origin)=>{const k=identity(record),old=groups.get(k),rank={earned:4,'in-progress':3,planned:2,saved:1};if(old){old.recordIds=[...new Set([...old.recordIds,...(record.id?[record.id]:[])])];old.codeAliases=[...new Set([...list(old.codeAliases),...list(record.codeAliases)])];if((origin==='library'&&(old.origin!=='library'||(rank[record.status]||0)>(rank[old.status]||0)))||(origin!=='library'&&old.origin!=='library'&&(rank[record.status]||0)>(rank[old.status]||0))){const ids=old.recordIds;groups.set(k,{...clone(record),id:k,recordIds:ids,origin});}}else groups.set(k,{...clone(record),id:k,recordIds:record.id?[record.id]:[],origin});};
  for(const record of list(state.learning))add(record,'library');
  for(const draft of (Array.isArray(current)?current:[current]))for(const row of draft.plan?.rows||[]){const o=row.option;if(row.status!=='planned'||!o||o.provider==='University'||/gap|excluded/.test(row.placementReason||''))continue;add({id:'draft:'+o.id,provider:o.provider,code:o.code||o.id,title:o.title,...sourceQuantity(o,draft.program.creditSystem,candidate),status:'planned',codeAliases:list(o.codeAliases),evaluations:[]},'plan-choice');}
  if(candidate){
   const code=Guide.catalogCourseCode?.(candidate)||candidate.code||'',identified={...candidate,code};
   const matches=models.flatMap(model=>model.requirements.flatMap(req=>req.options)).filter(option=>providerIdentity(option.provider)===providerIdentity(candidate.provider)&&[option.code||option.id,...list(option.codeAliases)].some(value=>key(value)===key(code)));
   const knownSource=option=>Number.isFinite(option.sourceCredits)&&option.sourceCredits>0&&['semester','quarter','competency-unit'].includes(option.sourceCreditSystem)?option.sourceCreditStatus==='verified'?2:1:0;
   matches.sort((a,b)=>knownSource(b)-knownSource(a));const option=matches[0];
   if(option&&option.provider!=='University')add({id:'candidate:'+option.id,...(candidate.id?{catalogCourseId:candidate.id,codeBasis:'curated-course-map'}:{}),provider:option.provider,code,title:candidate.title||option.title,...sourceQuantity(option,candidate.creditSystem,identified),status:'saved',codeAliases:[...new Set([option.code,...list(option.codeAliases),...list(candidate.codeAliases)].filter(Boolean))],evaluations:[]},'candidate');
   else add({id:'candidate:'+(candidate.id||key(candidate.provider)+':'+key(code)),...(candidate.id?{catalogCourseId:candidate.id,codeBasis:'curated-course-map'}:{}),provider:candidate.provider,code,title:candidate.title||code||'Course to review',credits:Number.isFinite(candidate.credits)?candidate.credits:null,creditSystem:['semester','quarter','competency-unit'].includes(candidate.creditSystem)?candidate.creditSystem:null,status:'saved',codeAliases:list(candidate.codeAliases),sourceUrl:candidate.url||'',evaluations:[]},'candidate');
  }
  return [...groups.values()];
 }
 function valid(draft){if(!draft.plan||!draft.program)return false;const minimum=draft.program.appliedTransferWaiver?.minimumQualifyingTransferCredits;if(minimum&&draft.plan.rows.filter(r=>r.status==='confirmed'&&!r.institutional&&!r.unknownProvenance).reduce((n,r)=>n+r.credits,0)<minimum)return false;const v=Planner.validate(draft.program,draft.plan);return v.academicCountsValid===true&&draft.plan.validation.academicCountsValid===true&&!v.errors.some(e=>!review.has(e.code))&&!list(draft.plan.setupIssues).some(e=>!review.has(e.code));}
 function tuition(draft,state,costs){const estimate=Savings.calculate(state,draft,costs);if(!estimate.available){
   // Reviewed curricula can carry their own exact program price or a student
   // quote without an entry in the marketing cost-comparison table.
   const value=draft.plan.costs,pricing=draft.program.pricing||{},remaining=value.universityCredits;
   return{tuition:Number.isFinite(value.universityTuition)?value.universityTuition:null,terms:remaining===0?0:value.universitySubscriptionTerms??draft.plan.timing.universityTerms??null,termLabel:['subscription','per-term','per-semester'].includes(pricing.model)?'subscription term':'term',reason:list(value.missing).find(reason=>/tuition quote|expected number of university subscription terms/.test(reason))||estimate.reason,basis:value.universityRateBasis||'unknown',source:value.universityRateSourceUrl||pricing.sourceUrl||''};
  }const units=draft.plan.rows.filter(r=>r.status==='planned'&&r.institutional).reduce((n,r)=>n+r.credits,0);if(!units)return{tuition:0,terms:0,termLabel:estimate.assumptions.termLabel,basis:estimate.rateBasis,source:''};const entry=costs.entries.find(e=>e.id===estimate.entryId),model=estimate.assumptions.rateModel;const value=Cost.calculate({...entry,totalUnits:units,scenarioTransferLimit:0,model},{transferUnits:0,outsideBudget:0,unitsPerTerm:estimate.assumptions.unitsPerTerm});return{tuition:value.afterTuition,terms:value.afterTerms,termLabel:estimate.assumptions.termLabel,basis:estimate.rateBasis,source:estimate.rateBasis==='your-quote'?'':list(entry.sources)[0]?.url||'',unitsPerTerm:estimate.assumptions.unitsPerTerm};}
 // Remaining means future learning actions only. Memberships and bundled exams
 // reuse the planner's per-provider/per-action arithmetic instead of pricing
 // every requirement as a new purchase. Unverified extras never become zero.
 function remainingCosts(draft,state,costData){
  const money=value=>Math.round((value+Number.EPSILON)*100)/100,finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const plan=obj(draft?.plan),value=obj(plan.costs),input=obj(draft?.input),future=list(plan.rows).filter(row=>row.status==='planned'&&row.option),outside=future.filter(row=>row.option.provider!=='University');
  const providers=[...new Set(outside.map(row=>row.option.provider))],items=[],missing=list(value.missing).filter(reason=>typeof reason==='string'&&!['Current university tuition quote','Your expected number of university subscription terms and the program’s included-course limits'].includes(reason));
  let university={tuition:null,terms:null,termLabel:'term',reason:'Add a current university tuition quote.'};
  try{university=tuition(draft,state,costData);}catch(error){university.reason=error.message||'Review the tuition and pace assumptions for this degree.';}
  if(!finite(university.tuition)){university.tuition=null;missing.unshift(university.reason||'Add a current university tuition quote.');}
  const universityDetail=university.basis==='student-estimated-subscription-terms'?'Published subscription price multiplied by your estimated paid terms.':university.basis==='student-quote'||university.basis==='your-quote'?'Your tuition quote, applied only to remaining university coursework.':'Published tuition applied to remaining university coursework.';
  items.push({provider:'University',amount:university.tuition,detail:universityDetail,source:university.source||'',basis:university.basis||'unknown',terms:university.terms,termLabel:university.termLabel});
  let outsideCourses=0;
  for(const provider of providers){
   const priced=list(value.providerCosts).filter(item=>item.provider===provider),known=priced.length===1&&finite(priced[0].amount),amount=known?money(priced[0].amount):null;
   if(!known){outsideCourses=null;if(!missing.some(reason=>reason===provider+' pricing'))missing.push(provider+' pricing');}
   else if(outsideCourses!==null)outsideCourses+=amount;
   const item=known?priced[0]:{};items.push({provider,amount,detail:item.detail||'Add the remaining membership, course or exam price.',source:item.source||'',...(item.months?{months:item.months}:{}),...(item.exams?{exams:item.exams}:{})});
  }
  if(outsideCourses!==null)outsideCourses=money(outsideCourses);
  const fees=finite(value.fees)&&(value.fees>0||input.feesConfirmed===true)?money(value.fees):null;
  if(fees!==null)items.push({provider:'Other fees',amount:fees,detail:'Fees included in your current plan assumptions.',source:'',basis:'student-input'});
  if(input.feesConfirmed!==true&&!missing.includes('University and transcript fees verified against your quote'))missing.push('University and transcript fees verified against your quote');
  const tuitionAndCourses=university.tuition!==null&&outsideCourses!==null?money(university.tuition+outsideCourses):null;
  const knownSubtotal=money(items.reduce((sum,item)=>sum+(finite(item.amount)?item.amount:0),0)),unknown=[...new Set(missing)],complete=tuitionAndCourses!==null&&fees!==null&&!unknown.length;
  const assumptions=['Only coursework still to be completed is priced. Finished courses are not charged again.','Outside subscriptions are charged once per provider for the estimated membership months, not once per requirement.','Membership months, paid university terms and completion pace are your estimates; published provider limits still apply.','In-progress course charges are still included unless your updated quote accounts for payments already made.'];
  const exclusions=['Financial aid, scholarships and discounts have not been deducted.','Books, materials and living expenses are excluded unless explicitly included in your fee estimate.'];
  if(unknown.length)exclusions.push('Unconfirmed charges remain outside the displayed known subtotal: '+unknown.join('; ')+'.');
  return{scope:'remaining-tuition-courses-fees',currency:'USD',estimatedBaseCost:tuitionAndCourses,tuitionAndCourses,universityTuition:university.tuition,outsideCourses,fees,knownSubtotal,total:complete?money(tuitionAndCourses+fees):null,complete,items,missing:unknown,assumptions,exclusions,universityTerms:university.terms,termLabel:university.termLabel||'term'};
 }
 function cellFor(course,scenario,catalog,models){
  const {draft}=scenario,futureInterest=['saved','planned'].includes(course.status);if(!['earned','in-progress','planned','saved'].includes(course.status)||!futureInterest&&(!Number.isFinite(course.credits)||course.credits<=0||!['semester','quarter','competency-unit'].includes(course.creditSystem)))return{status:'needs-evaluation',credits:null,placementType:null,requirements:[],detail:'Review this original record’s status and source credits first.'};if(!scenario.available)return{status:'needs-evaluation',credits:null,placementType:null,requirements:[],detail:scenario.reason};
  // A saved interest may project a published receiving award without known
  // original quantities, but it still needs an exact source identity. Resolve
  // only the source-bound catalog bridges used by Guide; a title is no match.
  const identity=Guide.resolveRecordIdentity?.(draft.program,course)||course;
  if(futureInterest&&!key(identity.code))return{status:'needs-evaluation',credits:null,placementType:null,requirements:[],detail:'The exact original course identity is needed before projecting a receiving-school award.'};
  let placements=[];
  if(course.status==='earned')placements=draft.match.completed.filter(p=>course.recordIds.includes(p.learningId));
  else{
   const probe={...clone(course),id:'probe-'+key(course.id),evaluations:[]};
   // A matrix cell tests this unfinished course independently. Keep actual
   // completed placements and explicit student choices, rather than reserving
   // requirements for other automatically selected saved interests.
   const fixed=Sheet.scenario(scenario.state,draft.program.id).optionSelections,input={...draft.input,completed:draft.match.completed,optionSelections:fixed},cache=new Map();
   const available=new Map(draft.program.requirements.map(req=>[req.id,new Set(Planner.availableOptions(draft.program,req.id,input).map(option=>option.id))]));
   const trialFor=selections=>{const identity=JSON.stringify(Object.entries(selections).sort(([a],[b])=>a.localeCompare(b)));if(cache.has(identity))return cache.get(identity);const trialInput={...input,optionSelections:selections};let plan=Planner.generate(draft.program,{...trialInput,optimizationNodeBudget:512});if(!plan.validation.academicCountsValid&&plan.optimization?.budgetExhausted)plan=Planner.generate(draft.program,trialInput);const trial={...draft,input:trialInput,plan};cache.set(identity,trial);return trial;};
   const learning=scenario.state.learning.filter(record=>record.status==='earned'&&!course.recordIds.includes(record.id)).concat(probe),excluded=new Set();
   // Try the best receiving placement first. Running a full solver callback at
   // every node of this one-course search made opening the matrix needlessly
   // expensive. Every displayed result still passes the actual whole-plan rules.
   for(let attempt=0;attempt<=draft.program.requirements.length;attempt++){
    const match=Guide.matchCollection(draft.program,learning,{earnedMatch:draft.match,optionSelections:fixed,availableOption:(req,option)=>available.get(req.id)?.has(option.id)&&!excluded.has(req.id+':'+option.id)}),proposed=match.placements.filter(p=>p.learningId===probe.id);
    if(!proposed.length)break;
    if(course.origin!=='candidate'&&proposed.every(p=>draft.plan.rows.some(row=>row.requirementId===p.requirementId&&row.status==='planned'&&row.option?.id===p.optionId&&!row.option.bundleId))){placements=proposed;break;}
    const trial=trialFor(match.optionSelections);
    if(valid(trial)){placements=proposed.filter(p=>{const row=trial.plan.rows.find(row=>row.requirementId===p.requirementId);return row?.status==='planned'&&row.option?.id===p.optionId;});break;}
    for(const placement of proposed)excluded.add(placement.requirementId+':'+placement.optionId);
   }
  }
  const rows=placements.map(p=>({placement:p,row:draft.plan.rows.find(r=>r.requirementId===p.requirementId),req:draft.program.requirements.find(r=>r.id===p.requirementId)})).filter(x=>x.req&&(course.status!=='earned'||x.row&&['reported','confirmed'].includes(x.row.status)&&!x.row.unknownProvenance));
  if(!rows.length)return{status:'needs-evaluation',credits:0,placementType:null,requirements:[],detail:'No usable match in this course map yet. This does not establish that the school will reject the credit.'};
  const credits=rows.reduce((n,x)=>n+x.req.credits,0),elective=rows.filter(x=>isElective(x.req)).reduce((n,x)=>n+x.req.credits,0),confirmed=course.status==='earned'&&rows.every(x=>x.row.status==='confirmed');
  return{status:course.status==='earned'?(confirmed?'confirmed':'reported'):'potential',credits,creditSystem:draft.program.creditSystem||'semester',placementType:elective===credits?'elective':elective?'mixed':'required',requirements:rows.map(x=>({id:x.req.id,title:x.req.title,credits:x.req.credits,creditSystem:draft.program.creditSystem||'semester'})),detail:course.status==='earned'?(confirmed?'Recorded school approval for this exact degree.':'Completed course with a proposed degree match; school confirmation needed.'):'Projected receiving-school credit for this unfinished course, checked independently with your completed courses held fixed. This is not earned credit.'};
 }
 function courseReviewReason(program,record){
  record=Guide.resolveRecordIdentity?.(program,record)||record;
  const exactReason=Guide.courseReviewReason?.(program,record);if(exactReason)return exactReason;
  if(['saved','planned'].includes(record.status)&&(!Number.isFinite(record.credits)||record.credits<=0||!['semester','quarter','competency-unit'].includes(record.creditSystem))){
   if(!record.code)return record.catalogCourseId?'DegreeSteps needs the exact provider identity for this course listing before matching it.':'Add the exact course code from the provider listing.';
   const options=program.requirements.flatMap(req=>list(req.options)).filter(option=>providerIdentity(option.provider)===providerIdentity(record.provider)&&[option.code,...list(option.codeAliases)].some(code=>[record.code,...list(record.codeAliases)].some(value=>key(code)===key(value))));
   if(options.some(option=>option.evidence==='conditional'||option.eligibilityReview?.eligibleToStart===false))return 'DegreeSteps is reviewing the receiving-map or provider-eligibility conditions for '+record.provider+' — '+(record.title||record.code)+'. Your future course has not been counted as completed credit.';
   return options.length?'The published course match cannot currently be projected under the enabled sources, selected courses or credit rules. DegreeSteps will keep the unresolved source evidence in its research queue.':'DegreeSteps has no reviewed receiving-course match for this future course in this degree yet.';
  }
  if(!Number.isFinite(record.credits)||record.credits<=0||!['semester','quarter','competency-unit'].includes(record.creditSystem))return 'Add the credits and credit units from your original course record.';
  if(!record.code)return 'Add the course code from your original record so an exact match can be checked.';
  const codes=[record.code,...list(record.codeAliases)].map(key),matches=program.requirements.flatMap(req=>list(req.options).filter(option=>providerIdentity(option.provider)===providerIdentity(record.provider)&&[option.code,...list(option.codeAliases)].some(code=>codes.includes(key(code)))).map(option=>({req,option})));
  if(!matches.length)return 'No researched match is attached to this degree yet. Request a school evaluation of this course.';
  if(['F','W','WF','I','INCOMPLETE'].includes(String(record.grade||'').toUpperCase()))return 'Your record shows '+record.grade+'. Confirm whether this course earns transferable credit.';
  if(Number.isFinite(record.score)&&matches.every(({option})=>Number(option.minScore)>record.score))return 'Your recorded exam score is below the minimum in these researched matches.';
  if(record.completedOn&&matches.every(({option})=>option.recommendationStart&&record.completedOn<option.recommendationStart||option.recommendationEnd&&record.completedOn>option.recommendationEnd))return 'Confirm the course version you completed: its date falls outside the researched recommendation dates.';
  if(matches.every(({option})=>(option.sourceCreditSystem||option.creditSystem||program.creditSystem||'semester')!==record.creditSystem))return 'Ask the school to confirm the credit-unit conversion for this original course.';
  return 'Review this course’s credit amount, grade and placement. It may compete with another course or a requirement reserved for university study.';
 }
 function collectionFit(state,draft,records){
  const rows=new Map(draft.plan.rows.map(row=>[row.requirementId,row])),requirements=new Map(draft.program.requirements.map(req=>[req.id,req]));
  const completed=draft.plan.rows.filter(row=>['reported','confirmed'].includes(row.status)&&!row.unknownProvenance),actual=completed.reduce((sum,row)=>sum+row.credits,0);
  const match=draft.collectionMatch||{placements:[],selections:{},unmatched:list(state.learning).filter(row=>row.status!=='earned')};
  const selected=[...new Map(list(match.placements).filter(placement=>{const row=rows.get(placement.requirementId);return row?.status==='planned'&&row.option?.id===placement.optionId;}).map(placement=>[placement.requirementId,placement])).values()];
  const fitBreakdown={completedCredits:actual,confirmedCredits:completed.filter(row=>row.status==='confirmed').reduce((sum,row)=>sum+row.credits,0),inProgressCredits:0,savedCredits:0,plannedCredits:0,potentialCredits:0,needsReviewCount:0};
  for(const placement of selected){const credits=requirements.get(placement.requirementId)?.credits||0,stage=placement.status==='in-progress'?'inProgressCredits':placement.status==='planned'?'plannedCredits':'savedCredits';fitBreakdown[stage]+=credits;fitBreakdown.potentialCredits+=credits;}
  const reviewCourses=[];
  for(const record of records||inventory(state,[],[draft.program])){
   const ids=new Set(record.recordIds),earned=list(draft.match.completed).filter(placement=>ids.has(placement.learningId)&&['confirmed','reported'].includes(rows.get(placement.requirementId)?.status)&&!rows.get(placement.requirementId)?.unknownProvenance);
   const planned=selected.filter(placement=>ids.has(placement.learningId));
   if(earned.length||planned.length)continue;
   reviewCourses.push({id:record.recordIds.find(id=>list(state.learning).some(item=>item.id===id&&item.status===record.status))||record.recordIds[0]||record.id,title:record.title||record.code||'Course record',provider:record.provider,status:record.status,reason:courseReviewReason(draft.program,record)});
  }
  fitBreakdown.needsReviewCount=reviewCourses.length;
  const selections=Object.fromEntries(Object.entries(match.selections).filter(([id,optionId])=>selected.some(placement=>placement.requirementId===id&&placement.optionId===optionId))),canAdopt=valid(draft),credits=actual+fitBreakdown.potentialCredits;
  return{collectionFitCredits:credits,potentialCollectionCredits:fitBreakdown.potentialCredits,collectionFitFraction:credits/draft.program.totalCredits,completedFitFraction:actual/draft.program.totalCredits,collectionNeedsEvaluation:reviewCourses.length,collectionSelections:canAdopt?selections:{},collectionAdoptionNeedsReview:!canAdopt,fitBreakdown,reviewCourses,fitOptimization:{completed:draft.match.assignment||null,planned:match.assignment||null}};
 }
 function build(state,catalog,models,costData,options={},runtime={}){
  const all=list(catalog.pathways),hasTarget=Boolean(!state.sheet?.isExample&&routeFor(state,catalog)),courseFirst=options.fromCourses===true||!hasTarget;
  // A targetless search never reads the active draft. Each matching route below
  // gets its own unchanged whole-plan calculation instead.
  const current=hasTarget?Journey.buildDraft(clone(state),catalog,models):null;
  const draftCache=new Map(),modelIds=new Set(models.map(model=>model.id)),records=inventory(state,[],models),checkedPrograms=new Set();
  const onProgress=typeof runtime?.onProgress==='function'?runtime.onProgress:null,progressIds=new Set(),reportedIds=new Set();let progressStarted=false,matchingRouteCount=0;
  // Observers receive detached summaries, never private records or solver state.
  // A display callback cannot fail or mutate the underlying academic calculation.
  function notify(value){if(onProgress)try{onProgress(value);}catch{/* Progress is best effort; the final calculation remains authoritative. */}}
  function startProgress(ids){progressStarted=true;ids.forEach(id=>progressIds.add(id));matchingRouteCount=progressIds.size;notify({phase:'started',complete:false,recommendation:null,matchingRouteIds:[...progressIds],matchingRouteCount});}
  function reportCandidate(id,draft,available,eligible,reason,cost,collection,readySummary){
   if(!onProgress||!progressIds.has(id)||reportedIds.has(id))return;
   reportedIds.add(id);let summary=null;
   if(available){
    const completed=draft.plan.rows.filter(row=>['reported','confirmed'].includes(row.status)&&!row.unknownProvenance),sum=rows=>rows.reduce((total,row)=>total+row.credits,0),fit=readySummary||collection;
    summary={degreeCredits:draft.program.totalCredits,applicableCompletedCredits:sum(completed),confirmedCredits:sum(completed.filter(row=>row.status==='confirmed')),reportedCredits:sum(completed.filter(row=>row.status==='reported')),remainingCredits:draft.program.totalCredits-sum(completed),universityCreditsRemaining:sum(draft.plan.rows.filter(row=>row.status==='planned'&&row.institutional)),universityTuitionRemaining:readySummary?readySummary.universityTuitionRemaining:cost.universityTuition,universityTermsRemaining:readySummary?readySummary.universityTermsRemaining:cost.universityTerms,termLabel:(readySummary?readySummary.termLabel:cost.termLabel)||'term',estimatedBaseCost:readySummary?readySummary.estimatedBaseCost:cost.estimatedBaseCost,remainingCost:readySummary?readySummary.remainingCost:cost.total,estimatedWeeks:draft.plan.timing.scenarioWeeks,creditSystem:draft.program.creditSystem||'semester',mappedExternalCredits:draft.plan.coverage.mappedExternalCredits,collectionFitCredits:fit.collectionFitCredits,potentialCollectionCredits:fit.potentialCollectionCredits,collectionFitFraction:fit.collectionFitFraction,completedFitFraction:fit.completedFitFraction,collectionNeedsEvaluation:fit.collectionNeedsEvaluation,fitBreakdown:{...fit.fitBreakdown},provisional:true};
   }
   notify({phase:'candidate',complete:false,recommendation:null,matchingRouteCount,checkedCount:reportedIds.size,candidate:{id,pathwayId:draft.pathway?.id||null,available,eligible,reason,summary}});
  }
  const comparisonPriority=options.priority||state.whatIf?.priority,priority=comparisonPriority==='cost'?'cost':comparisonPriority==='terms'?'speed':comparisonPriority==='tuition'?'tuition':['collection','credits'].includes(comparisonPriority)?'balanced':state.profile?.priority;
  const reuseBasis='Recommendations compare the share of each degree covered by jointly placed courses, then finished coursework and your goals. Different credit units are compared as a share of the degree. Matches remain provisional; missing maps are not rejection decisions.';
  let rankBasis=reuseBasis,automaticRankedRows=null;
  function priorityMetric(rows){
   const available=rows.filter(row=>row.available&&row.eligible!==false);if(!available.length||new Set(available.map(row=>row.level)).size>1)return null;
   const known=name=>available.every(row=>typeof row[name]==='number'&&Number.isFinite(row[name])&&row[name]>=0);
   if(priority==='cost')return known('remainingCost')?'remainingCost':known('estimatedBaseCost')?'estimatedBaseCost':null;
   if(priority==='tuition')return known('universityTuitionRemaining')?'universityTuitionRemaining':null;
   if(['speed','fastest'].includes(priority))return known('estimatedWeeks')?'estimatedWeeks':null;
   return null;
  }
  const finiteEstimate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  function availableOrderingMetric(rows){
   const available=rows.filter(row=>row.available&&row.eligible!==false);
   if(!available.length||new Set(available.map(row=>row.level)).size>1)return null;
   const comparable=priorityMetric(rows);if(comparable)return comparable;
   const metric=priority==='cost'?'estimatedBaseCost':priority==='tuition'?'universityTuitionRemaining':['speed','fastest'].includes(priority)?'estimatedWeeks':null;
   return metric&&available.some(row=>finiteEstimate(row[metric]))?metric:null;
  }
  function basisFor(metric){return metric==='remainingCost'?'Suggested routes compare the estimated remaining tuition, outside courses and confirmed fee assumptions. These are estimates before financial aid; university approval is still required.':metric==='estimatedBaseCost'?'Suggested routes compare remaining tuition and outside-course estimates. Unconfirmed fees and other extras are excluded, so this does not establish the lowest all-in degree cost.':metric==='universityTuitionRemaining'?'Suggested routes compare remaining university tuition only. Outside courses and other charges are shown separately.':metric==='estimatedWeeks'?'Suggested routes compare estimated completion weeks using each plan’s stated course pace and university term assumptions. These are planning estimates, not promised graduation dates.':['cost','tuition'].includes(priority)?'Some eligible plans still need tuition or outside-course prices. Suggestions use course fit until their cost estimates can be compared.': ['speed','fastest'].includes(priority)?'Some eligible plans still need course pace or university scheduling details. Suggestions use course fit until their completion estimates can be compared.':reuseBasis;}
  function orderingBasis(rows,metric){
   const available=rows.filter(row=>row.available&&row.eligible!==false);
   if(new Set(available.map(row=>row.level)).size>1&&['cost','tuition','speed','fastest'].includes(priority))return 'Suggestions use course fit because these plans lead to different degree levels.';
   if(!metric||priorityMetric(rows))return basisFor(priorityMetric(rows));
   const missing=available.filter(row=>!finiteEstimate(row[metric])).length,subject=missing+' matching plan'+(missing===1?' still needs':'s still need');
   return metric==='estimatedBaseCost'?'Ordered by available tuition and outside-course estimates. Fees and other extras are excluded. '+subject+' tuition or outside-course prices.':metric==='universityTuitionRemaining'?'Ordered by available university tuition estimates. Outside courses and other charges are excluded. '+subject+' a university tuition estimate.':'Ordered by available study-time estimates. '+subject+' course pace or university scheduling details.';
  }
  function compareEstimates(left,right,metric){
   if(!metric||!left.available||!right.available)return 0;
   const leftKnown=finiteEstimate(left[metric]),rightKnown=finiteEstimate(right[metric]);
   return Number(rightKnown)-Number(leftKnown)||(leftKnown&&rightKnown?left[metric]-right[metric]:0);
  }
  function rankedRoutes(profile,excludedId){
   const routes=all.filter(route=>modelIds.has(route.modelId)&&route.id!==excludedId),eligibleRoutes=new Set(Guide.recommend(profile,{campusFacts:catalog?.campusFacts,pathways:routes},[],[]).map(fit=>fit.pathway));
   // Eligibility depends only on the profile and pathway. Publish that complete
   // scope before matching courses, then calculate the unchanged full fit one
   // route at a time. Catalog order retains the original full-score tie order.
   const matches=routes.filter(route=>eligibleRoutes.has(route));
   if(matches.length||hasTarget&&excludedId)startProgress([...(hasTarget&&excludedId?['current']:[]),...matches.map(route=>'route:'+route.id)]);
   const ranked=matches.map(route=>{
    const fit=Guide.recommend(profile,{campusFacts:catalog?.campusFacts,pathways:[route]},models,state.learning)[0];
    const id='route:'+fit.pathway.id,next=target(state,id,catalog,options),draft=Journey.buildDraft(next,catalog,models);draftCache.set(id,{next,draft});
    if(draft.program)checkedPrograms.add(draft.program.id);
    const available=valid(draft),collection=available?collectionFit(next,draft,records):null,cost=available?remainingCosts(draft,next,costData):null;draftCache.get(id).cost=cost;
    if(onProgress){const eligible=Boolean(Guide.recommend(next.profile,{campusFacts:catalog?.campusFacts,pathways:[draft.pathway]},[],[])[0]),reason=!eligible?'Review this degree against your current career, degree level and study-format preferences.':!draft.program?'Official program listed. Its exact course and transfer map still needs research.':!available?'Resolve this plan’s credit-rule conflicts before comparing totals.':null;reportCandidate(id,draft,available,eligible,reason,cost,collection);}
    return{fit,id,available,level:draft.pathway.level,remainingCost:cost?.total,estimatedBaseCost:cost?.estimatedBaseCost,universityTuitionRemaining:cost?.universityTuition,estimatedWeeks:draft.plan?.timing.scenarioWeeks,credits:collection?.collectionFitCredits||0,fraction:collection?.collectionFitFraction||0,completedFraction:collection?.completedFitFraction||0,remaining:draft.program?draft.plan?.totals?.institutional/draft.program.totalCredits:Infinity};
   });
   const scopeRows=[...ranked];
   if(hasTarget&&excludedId){
    const available=valid(current),cost=available?remainingCosts(current,state,costData):null,eligible=Boolean(Guide.recommend(state.profile,{campusFacts:catalog?.campusFacts,pathways:[current.pathway]},[],[])[0]);
    reportCandidate('current',current,available,eligible,!eligible?'Review this degree against your current career, degree level and study-format preferences.':!current.program?'Official program listed. Its exact course and transfer map still needs research.':!available?'Resolve this plan’s credit-rule conflicts before comparing totals.':null,cost,available&&onProgress?collectionFit(state,current,records):null);
    scopeRows.push({id:'current',available,eligible,level:current.pathway.level,remainingCost:cost?.total,estimatedBaseCost:cost?.estimatedBaseCost,universityTuitionRemaining:cost?.universityTuition,estimatedWeeks:current.plan?.timing.scenarioWeeks});
   }
   const metric=availableOrderingMetric(scopeRows);rankBasis=orderingBasis(scopeRows,metric);automaticRankedRows=ranked;
   return ranked.sort((a,b)=>Number(b.available)-Number(a.available)||compareEstimates(a,b,metric)||b.fraction-a.fraction||b.completedFraction-a.completedFraction||b.fit.score-a.fit.score||a.remaining-b.remaining||a.fit.pathway.title.localeCompare(b.fit.pathway.title));
  }
  const picks=options.selectedIds||state.whatIf?.selectedIds;let ids=list(picks).filter(id=>id!=='current').slice(0,hasTarget?2:3);
  if(!hasTarget&&!ids.length){
   const profile={...state.profile,pathwayId:'',school:'',degree:'',...(options.includeOtherFormats?{modality:'any',classroomImportance:'open'}:{})};
   ids=rankedRoutes(profile).slice(0,3).map(item=>item.id);
   if(!ids.length)ids=Guide.recommend(profile,{campusFacts:catalog?.campusFacts,pathways:all},models,state.learning).slice(0,3).map(x=>'route:'+x.pathway.id);
  }
  if(hasTarget&&!ids.length&&!Array.isArray(picks)){const profile={...state.profile,pathwayId:'',school:'',degree:'',...(options.includeOtherFormats?{modality:'any',classroomImportance:'open'}:{})};ids=rankedRoutes(profile,current.pathway.id).slice(0,2).map(item=>item.id);}
  ids=[...(hasTarget?['current']:[]),...new Set(ids)];
  if(!progressStarted)startProgress(ids);
  const scenarios=ids.map(id=>{try{const cached=draftCache.get(id),next=cached?.next||target(state,id,catalog,options),draft=cached?.draft||Journey.buildDraft(next,catalog,models),available=valid(draft),fit=Guide.recommend(next.profile,{campusFacts:catalog?.campusFacts,pathways:[draft.pathway]},models,next.learning)[0],eligible=Boolean(fit),snapshot=id.startsWith('saved:')?saved(state).find(s=>s.id===id.slice(6)):null;const reason=!eligible?'Review this degree against your current career, degree level and study-format preferences.':!draft.program?'Official program listed. Its exact course and transfer map still needs research.':!available?'Resolve this plan’s credit-rule conflicts before comparing totals.':null;
   let summary=null;if(available){const completed=draft.plan.rows.filter(r=>['reported','confirmed'].includes(r.status)&&!r.unknownProvenance),sum=rows=>rows.reduce((n,r)=>n+r.credits,0),cost=cached?.cost||remainingCosts(draft,next,costData);summary={degreeCredits:draft.program.totalCredits,applicableCompletedCredits:sum(completed),requiredCompletedCredits:sum(completed.filter(r=>!isElective(r))),electiveCompletedCredits:sum(completed.filter(isElective)),confirmedCredits:sum(completed.filter(r=>r.status==='confirmed')),reportedCredits:sum(completed.filter(r=>r.status==='reported')),remainingCredits:draft.program.totalCredits-sum(completed),universityCreditsRemaining:sum(draft.plan.rows.filter(r=>r.status==='planned'&&r.institutional)),universityTuitionRemaining:cost.universityTuition,universityTermsRemaining:cost.universityTerms,termLabel:cost.termLabel||'term',estimatedBaseCost:cost.estimatedBaseCost,remainingCost:cost.total,remainingCostReason:cost.missing.join('; ')||null,costBreakdown:cost,estimatedWeeks:draft.plan.timing.scenarioWeeks,creditSystem:draft.program.creditSystem||'semester',researchGapCredits:draft.plan.coverage.researchGapCredits,provisional:true,...collectionFit(next,draft,records)};}
   reportCandidate(id,draft,available,eligible,reason,null,null,summary);
   return{id,label:snapshot?.label||draft.pathway.title,isCurrent:id==='current',pathwayId:draft.pathway.id,programId:draft.program?.id,state:next,draft,available,eligible,canUse:true,reason,recommendationReasons:fit?.reasons||[],summary};
  }catch(e){reportCandidate(id,{},false,false,e.message,null,null);return{id,label:'Unavailable saved program',isCurrent:false,available:false,eligible:false,canUse:false,reason:e.message,summary:null,state:null,draft:{}};}});
  for(const scenario of scenarios)if(scenario.draft.program)checkedPrograms.add(scenario.draft.program.id);
  const courses=inventory(state,courseFirst?[]:scenarios.filter(s=>s.available).map(s=>s.draft),models,options.candidate),matrixDeferred=options.deferMatrix===true&&!options.candidate,view={courses,scenarios};
  const matrix=matrixDeferred?[]:courseMatrix(view,catalog,models);
  const comparable=scenarios.map(scenario=>({id:scenario.id,available:scenario.available,eligible:scenario.eligible,level:scenario.draft.pathway?.level,...scenario.summary}));
  // An automatic shortlist still represents every eligible route checked above.
  // Do not silently narrow its comparison scope to three visible cards: an
  // unpriced or unscheduled fourth route must keep a winner claim unavailable.
  // Explicitly selected comparisons are scoped to those selected plans instead.
  const scopeRows=automaticRankedRows?[...automaticRankedRows,...comparable.filter(row=>row.id==='current')]:comparable,metric=priorityMetric(scopeRows),scope=automaticRankedRows?'eligible-routes':'selected-plans';
  const eligibleRows=scopeRows.filter(row=>row.available&&row.eligible!==false),orderingMetric=availableOrderingMetric(scopeRows),unestimated=orderingMetric?eligibleRows.filter(row=>!finiteEstimate(row[orderingMetric])):eligibleRows;
  const orderedRows=automaticRankedRows?[...comparable.filter(row=>row.id==='current'),...automaticRankedRows]:comparable;
  const rankingScope={mode:scope,eligibleCount:eligibleRows.length,metric,comparable:Boolean(metric),orderingMetric,estimatedCount:eligibleRows.length-unestimated.length,unestimatedCount:unestimated.length,unestimatedRouteIds:unestimated.map(row=>row.id),orderedRouteIds:orderedRows.map(row=>row.id),mixedLevels:new Set(eligibleRows.map(row=>row.level)).size>1};
  const recommended=metric?comparable.filter(row=>row.available&&row.eligible).sort((a,b)=>a[metric]-b[metric]||b.collectionFitFraction-a.collectionFitFraction)[0]:null;
  const recommendation=recommended?{id:recommended.id,metric,reason:basisFor(metric),partial:metric==='estimatedBaseCost',provisional:true,scope,comparedPlanCount:rankingScope.eligibleCount}:null;
  if(recommendation)rankBasis=recommendation.reason;else if(['cost','tuition','speed','fastest'].includes(priority))rankBasis=orderingBasis(scopeRows,orderingMetric);
  const rankedCandidates=list(automaticRankedRows).map(row=>({id:row.id,pathwayId:row.fit.pathway.id,available:row.available,level:row.level,remainingCost:row.remainingCost??null,estimatedBaseCost:row.estimatedBaseCost??null,universityTuitionRemaining:row.universityTuitionRemaining??null,estimatedWeeks:row.estimatedWeeks??null,collectionFitCredits:row.credits,collectionFitFraction:row.fraction,completedFitFraction:row.completedFraction}));
  return{scenarios,courses,matrix,matrixDeferred,courseFirst,hasTarget,selectedIds:ids,options:all.map(p=>({id:'route:'+p.id,label:p.school+' — '+p.title,pathwayId:p.id,school:p.school,title:p.title,mapped:Boolean(p.modelId)})),mappedProgramsChecked:checkedPrograms.size,mappedProgramsAvailable:new Set(all.filter(route=>route.modelId).map(route=>route.modelId)).size,saved:saved(state),rankBasis,rankingScope,rankedCandidates,recommendation};
 }
 function courseMatrix(view,catalog,models){return view.courses.map(course=>({course,cells:Object.fromEntries(view.scenarios.map(scenario=>[scenario.id,cellFor(course,scenario,catalog,models)]))}));}
 function creditDescription(course){if(!Number.isFinite(course?.credits)||course.credits<=0)return 'Credit amount needs checking';return course.credits+' '+(course.creditSystem==='competency-unit'?'competency units':['semester','quarter'].includes(course.creditSystem)?course.creditSystem+' credits':'credits · units need checking');}
 return Object.freeze({build,capture,saveScenario,removeScenario,applyScenario,creditDescription,courseMatrix,remainingCosts});
}));
