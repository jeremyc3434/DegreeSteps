/* Pure state adapter for DegreeSteps's sheet. No storage, network, or awarded-credit side effects. */
(function (root, factory) {
  'use strict';
  const guide = root && root.DegreeGuide || (typeof module === 'object' && module.exports ? require('./guide-engine.js') : null);
  const api = factory(root, guide, root?.DegreeCreditProviders || (typeof module === 'object' && module.exports ? require('./provider-registry.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.DegreeSheet = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Guide, Providers) {
  'use strict';
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = value => typeof value === 'string' ? value.trim() : '';
  function catalogYear(value){value=text(value).replace(/[–—]/g,'-');if(/^(?:19|20|21)\d{2}(?:0[1-9]|1[0-2])$/.test(value))return value;const match=/^(19\d{2}|20\d{2}|21\d{2})(?:-(19\d{2}|20\d{2}|21\d{2}))?$/.exec(value);return match&&(!match[2]||Number(match[2])===Number(match[1])+1)?value:'';}
  function programCatalog(program){const exact=catalogYear(program?.catalogYear)||catalogYear(program?.catalog);if(exact)return exact;const match=text(program?.catalog).replace(/[–—]/g,'-').match(/\b(?:19|20|21)\d{2}-(?:19|20|21)\d{2}\b/);return match?catalogYear(match[0]):'';}
  const bounded = (value, max) => text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0,max);
  const normalized = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const providerKey = value => Providers?.get(value) ? Providers.key(value) : ({sophialearning:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf',universitypathwaysinternational:'upistudy',upistudyinc:'upistudy'}[normalized(value)] || normalized(value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const commonPlanner = typeof module === 'object' && module.exports ? require('./planner.js') : null;
  function earnedCreditException(program,requirement,option) {
    const Planner=root?.DegreePlanner||commonPlanner,policy=Planner?.creditBalancePolicy?.(program);
    if(!policy || !requirement || !option)return null;
    const canonical=list(requirement.options).find(candidate=>candidate.id===option.id && candidate.provider===option.provider && candidate.code===option.code);
    const identity=value=>['credits','sourceCredits','creditSystem','sourceCreditSystem','upper','sourceUpper','creditOrigin','evidence','sourceIds'].map(key=>value[key]??null);
    if(!canonical || JSON.stringify(identity(canonical))!==JSON.stringify(identity(option)))return null;
    if(policy.balanceRequirementIds.includes(requirement.id))return canonical.credits;
    const binding=policy.equivalencies.find(binding=>binding.requirementId===requirement.id);
    return binding?.options.some(identity=>identity.optionId===canonical.id && identity.provider===canonical.provider && identity.code===canonical.code)?canonical.credits:null;
  }
  function placementCredits(program,item,evaluation) {
    const requirement=list(program.requirements).find(candidate=>candidate.id===evaluation.requirementId);
    if(!requirement || !finite(requirement.credits) || requirement.credits<0)return null;
    const option=list(requirement.options).find(candidate=>candidate.id===evaluation.optionId && sameAction(item,program,candidate));
    return earnedCreditException(program,requirement,option) ?? requirement.credits;
  }
  const uid = () => root.crypto && typeof root.crypto.randomUUID === 'function' ? root.crypto.randomUUID() : 'sheet-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const PROFILE = {entry:'target',goal:'any-degree',degreeLevel:'bachelor',field:'any',school:'',schoolChoice:'',degree:'',pathwayId:'',modality:'any',classroomImportance:'open',country:'US',state:'',priority:'balanced',weeklyHours:10,budget:'',deadline:'',militaryStatus:'none',militaryBranch:'',militaryRecords:'not-sure',hasPrior:'none',priorCreditEstimate:0,assessmentPreference:'mixed',proctoringPreference:'open',goalDetail:''};
  const DEFAULT_SCENARIO = {providers:['Sophia','Study.com','CLEP'],allowConditional:true,useWaivers:false,universityRate:'',fees:'',sophiaMonths:1,studyMonths:1,sophiaWeeks:'',studyWeeks:'',clepWeeks:'',termWeeks:'',termCredits:'',concurrency:1,optionSelections:{}};
  function identifier(value, label) {
    if (typeof value !== 'string' || !value || value.length>200 || ['__proto__','prototype','constructor'].includes(value)) throw new Error('Choose a valid ' + (label || 'record') + ' ID.');
    return value;
  }
  function parsed(value) { if(typeof value !== 'string')return value;try{return JSON.parse(value);}catch(_){return null;} }
  function programKey(pathway) { return identifier(typeof pathway === 'string' ? pathway : pathway && (pathway.modelId || pathway.id), 'program'); }
  function sheet(state) { return {...object(state.sheet),filter:typeof state.sheet?.filter==='string'?state.sheet.filter:'all',search:typeof state.sheet?.search==='string'?state.sheet.search:'',notes:copy(object(state.sheet?.notes))}; }
  function savedTarget(state) {
    const identity=state?.targetIdentity,route=identity?.route,p=object(state?.profile),selected=text(state?.selectedPathwayId)||text(p.pathwayId);
    return identity?.version===1&&route&&route.id===selected&&normalized(route.school)===normalized(p.school||p.schoolChoice)&&normalized(route.title)===normalized(p.degree)?identity:null;
  }
  function targetMatches(saved,current) {
    if(!saved||!current||normalized(saved.school)!==normalized(current.school)||normalized(saved.title)!==normalized(current.title))return false;
    if(saved.modelId&&current.modelId&&saved.modelId!==current.modelId)return false;
    const level=value=>Guide?.normalizeProfile?Guide.normalizeProfile({degreeLevel:value}).degreeLevel:normalized(value);
    if(saved.level&&current.level&&level(saved.level)!=='unsure'&&level(current.level)!=='unsure'&&level(saved.level)!==level(current.level))return false;
    if(saved.creditSystem&&current.creditSystem&&saved.creditSystem!==current.creditSystem||saved.catalog&&current.catalog&&normalized(saved.catalog)!==normalized(current.catalog))return false;
    const a=list(saved.modalities).slice().sort(),b=list(current.modalities).slice().sort();
    return !a.length||!b.length||JSON.stringify(a)===JSON.stringify(b);
  }
  function targetRoute(state,catalog) {
    const p=object(state?.profile),selected=text(state?.selectedPathwayId)||text(p.pathwayId),identity=savedTarget(state),routes=list(Array.isArray(catalog)?catalog:catalog?.pathways);
    const candidate=routes.find(route=>route.id===selected||route.modelId&&route.modelId===selected);
    if(!identity)return candidate||routes.find(route=>p.school&&p.degree&&normalized(route.school)===normalized(p.school)&&normalized(route.title)===normalized(p.degree))||null;
    if(candidate&&targetMatches(identity.route,candidate))return candidate;
    const route=copy(identity.route);delete route.modelId;
    return {...route,provisionalTarget:true,courseMapStatus:'not-mapped',constraints:['Obtain the current degree requirements and transfer policies for this exact program.'],proposedActions:['Get your official degree requirements and catalog year.','Request an evaluation of your existing learning.','Confirm course-to-requirement placements before buying outside courses.']};
  }
  function restoreTarget(state,identity,catalog) {
    const route=object(identity?.route),profile=object(identity?.profile);
    if(identity?.version!==1||!text(route.school)||route.school.length>120||!text(route.title)||route.title.length>200||!['','unsure','associate','bachelor','master','doctorate','specialist'].includes(route.level||'')||route.creditSystem&&!['semester','quarter','competency-unit'].includes(route.creditSystem)||!Array.isArray(route.modalities)||route.modalities.some(mode=>!['online','campus'].includes(mode)))throw new Error('This saved degree identity could not be read. Your current plan has not been replaced.');
    identifier(route.id,'saved degree');
    const targetProfile={};for(const name of ['entry','field'])if(typeof profile[name]==='string')targetProfile[name]=profile[name];
    const next={...state,profile:{...object(state.profile),...targetProfile,school:route.school,schoolChoice:route.school,degree:route.title,degreeLevel:route.level||profile.degreeLevel||state.profile?.degreeLevel,pathwayId:route.id},selectedPathwayId:route.id,targetIdentity:copy(identity),sheet:{...sheet(state),isExample:false}};
    return next;
  }
  function initialize(savedV3, legacyV2, catalog) {
    const saved=parsed(savedV3),legacy=parsed(legacyV2),pathways=list(Array.isArray(catalog)?catalog:catalog?.pathways);
    let state={version:3,profile:copy(PROFILE),learning:[],scenarios:{},baseline:null,selectedPathwayId:'',view:'results',step:'direction',resultTab:'plan'};
    if(saved?.version===3 && saved.profile && Array.isArray(saved.learning))state={...state,...copy(saved),profile:{...PROFILE,...copy(saved.profile)},scenarios:copy(object(saved.scenarios))};
    else if(legacy && typeof legacy==='object' && Guide?.migrateLegacy){
      const migrated=Guide.migrateLegacy(legacy);state={...state,...copy(migrated),profile:{...PROFILE,...copy(migrated.profile)},legacyImported:true};
      const fields=object(legacy.fields),legacyProgram=text(fields.program);
      if(legacyProgram){
        const settings=copy(DEFAULT_SCENARIO),mapping={tuition:'universityRate',fees:'fees','sophia-months':'sophiaMonths','study-months':'studyMonths','sophia-weeks':'sophiaWeeks','study-weeks':'studyWeeks','clep-weeks':'clepWeeks','external-concurrency':'concurrency','term-weeks':'termWeeks','term-credits':'termCredits'};
        for(const [previous,current] of Object.entries(mapping))if(fields[previous]!==undefined)settings[current]=copy(fields[previous]);
        if(Array.isArray(legacy.providers))settings.providers=[...legacy.providers];
        if(typeof legacy.conditional==='boolean')settings.allowConditional=legacy.conditional;
        if(typeof legacy.useWaivers==='boolean')settings.useWaivers=legacy.useWaivers;
        if(typeof legacy.modernStates==='boolean')settings.modernStates=legacy.modernStates;
        state.scenarios={[legacyProgram]:settings};
      }
    }
    state.sheet=sheet(state);
    const selected=text(state.selectedPathwayId)||text(state.profile.pathwayId);
    const namedTarget=Boolean((saved?.version===3 || legacy) && (text(state.profile.school)||text(state.profile.schoolChoice)||text(state.profile.degree)));
    const hasTarget=Boolean(selected||namedTarget);
    const identity=savedTarget(state),candidate=pathways.find(item=>item.id===selected || item.modelId===selected) || (!identity&&namedTarget?pathways.find(item=>item.school===state.profile.school && item.title===state.profile.degree):null),existing=candidate&&(!identity||targetMatches(identity.route,candidate))?candidate:null;
    const fallback=pathways.find(item=>item.modelId==='tesu-general-management'||item.id==='tesu-general-management') || pathways.find(item=>item.modelId) || pathways[0];
    if(existing){state=selectPathway(state,existing);if(identity)state.targetIdentity=copy(identity);}
    else if(!hasTarget && fallback)state=selectPathway(state,fallback);
    else if(hasTarget){state.selectedPathwayId=selected||'custom-target';state.profile.pathwayId=state.profile.pathwayId||state.selectedPathwayId;} // Preserve exact custom/unavailable targets.
    state.sheet={...state.sheet,isExample:typeof saved?.sheet?.isExample==='boolean'?saved.sheet.isExample:!hasTarget};
    return state;
  }
  function selectPathway(state,pathway) {
    if(!pathway || typeof pathway!=='object')throw new Error('Choose a degree pathway.');
    const id=identifier(pathway.id,'pathway'),profile={...object(state.profile),entry:'target',schoolChoice:text(pathway.school),school:text(pathway.school),degree:text(pathway.title),degreeLevel:pathway.level || state.profile?.degreeLevel,field:pathway.field || state.profile?.field,pathwayId:id};
    const next={...state,version:3,profile,selectedPathwayId:id,sheet:{...sheet(state),isExample:false}};delete next.targetIdentity;return next;
  }
  function scenario(state,pathway) {
    const saved=object(state.scenarios?.[programKey(pathway)]);
    return {...copy(DEFAULT_SCENARIO),...copy(saved),providers:Array.isArray(saved.providers)?[...saved.providers]:[...DEFAULT_SCENARIO.providers],optionSelections:copy(object(saved.optionSelections))};
  }
  function setCourse(state,programId,requirementId,optionId) {
    programId=identifier(programId,'program');requirementId=identifier(requirementId,'requirement');
    if(optionId!=null && optionId!=='' && typeof optionId!=='string')throw new Error('Choose a course option.');
    const current=object(state.scenarios?.[programId]),selections={...object(current.optionSelections)};
    if(optionId)selections[requirementId]=optionId;else delete selections[requirementId];
    return {...state,scenarios:{...object(state.scenarios),[programId]:{...current,optionSelections:selections}}};
  }
  function setNote(state,programId,requirementId,value) {
    programId=identifier(programId,'program');requirementId=identifier(requirementId,'requirement');
    if(typeof value!=='string')throw new Error('A private note must be text.');
    const nextSheet=sheet(state),notes={...object(nextSheet.notes[programId])};
    if(value.trim())notes[requirementId]=value.slice(0,6000);else delete notes[requirementId];
    return {...state,sheet:{...nextSheet,notes:{...nextSheet.notes,[programId]:notes}}};
  }
  // Open-slot course choices (owner-approved 2026-11-23): the course a student picked, or already took, for an open
  // slot ("Choose any approved Humanities course"). Stored additively in state.sheet.slotChoices[programId][requirementId]
  // with the same private lifetime as notes. It is the student's own plan record, never an award or a school approval.
  function slotChoice(state,programId,requirementId) {
    const saved=object(object(object(state?.sheet).slotChoices)[programId])[requirementId];
    if(!saved||typeof saved!=='object')return null;
    const code=bounded(saved.code,40),title=bounded(saved.title,160),credits=finite(saved.credits)&&saved.credits>0&&saved.credits<=30?saved.credits:null;
    return code||title?{code,title,credits,updatedAt:typeof saved.updatedAt==='string'?saved.updatedAt.slice(0,40):''}:null;
  }
  function setSlotChoice(state,programId,requirementId,value) {
    programId=identifier(programId,'program');requirementId=identifier(requirementId,'requirement');
    const input=object(value),code=bounded(input.code,40),title=bounded(input.title,160);
    const credits=input.credits===''||input.credits==null?null:Number(input.credits);
    if(credits!==null&&(!Number.isFinite(credits)||credits<=0||credits>30))throw new Error('Enter credits between 0 and 30, or leave credits blank.');
    const nextSheet=sheet(state),all=copy(object(nextSheet.slotChoices)),choices={...object(all[programId])};
    if(code||title)choices[requirementId]={code,title,credits,updatedAt:new Date().toISOString()};else delete choices[requirementId];
    if(Object.keys(choices).length)all[programId]=choices;else delete all[programId];
    return {...state,sheet:{...nextSheet,slotChoices:all}};
  }
  function sourceOptions(program,option) {
    const candidates=list(program.requirements).flatMap(req=>list(req.options)).filter(item=>providerKey(item.provider)===providerKey(option.provider));
    const related=[option],codes=new Set([option.code || option.id,...list(option.codeAliases)].map(normalized).filter(Boolean));
    let changed=true;
    while(changed){changed=false;for(const candidate of candidates){
      if(related.includes(candidate))continue;
      const aliases=[candidate.code || candidate.id,...list(candidate.codeAliases)].map(normalized).filter(Boolean);
      if(option.bundleId && candidate.bundleId===option.bundleId || aliases.some(code=>codes.has(code))){related.push(candidate);aliases.forEach(code=>codes.add(code));changed=true;}
    }}
    return {related,codes};
  }
  function sameAction(item,program,option) {
    if(providerKey(item.provider)!==providerKey(option.provider))return false;
    if(providerKey(option.provider)==='university' && (!text(item.institution)||normalized(item.institution)!==normalized(program.school)||item.sourceProgramId!==program.id))return false;
    const source=sourceOptions(program,option);
    if(text(item.code))return source.codes.has(normalized(item.code));
    return source.related.some(candidate=>normalized(candidate.title)===normalized(item.title));
  }
  function learningIdentity(item) { return providerKey(item.provider)+'|'+(providerKey(item.provider)==='university'?normalized(item.institution)+'|'+text(item.sourceProgramId)+'|':'')+(normalized(item.code)||'title:'+normalized(item.title)); }
  function date(value) {
    if(value==null || value==='')return '';
    const instant=typeof value==='string'?new Date(value+'T12:00:00Z'):null;
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !instant || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,10)!==value)throw new Error('Use a valid completion date in YYYY-MM-DD format.');
    return value;
  }
  function validateLearning(value) {
    const item={...copy(object(value))};
    item.provider=bounded(item.provider,120);item.title=bounded(item.title,160);item.code=bounded(item.code,100);
    if(!['earned','in-progress','planned','saved'].includes(item.status))throw new Error('Use earned, in-progress, planned, or saved learning status.');
    const unknownCredits=item.credits==null||item.credits==='';
    if(!item.provider || !item.title || !unknownCredits&&(!finite(item.credits)||item.credits<=0||item.credits>200))throw new Error('Add a provider and course title. If known, source credits must be between 0.1 and 200.');
    if(unknownCredits)item.credits=null;
    if(item.creditSystem!==null)item.creditSystem=item.creditSystem || (finite(item.credits)?'semester':null);
    if(item.creditSystem!==null&&!['semester','quarter','competency-unit'].includes(item.creditSystem))throw new Error('Choose semester credits, quarter credits, or competency units, or leave the credit details unknown.');
    item.completedOn=date(item.completedOn);item.id=text(item.id)||uid();
    if(item.grade!==undefined){item.grade=text(item.grade).toUpperCase();if(item.grade&&!/^(?:[ABCDF][+-]?|P|PASS|S|W|WF|I|INCOMPLETE)$/.test(item.grade))throw new Error('Use a letter grade, Pass, or the grade status shown on your record.');}
    if(item.score!==undefined&&item.score!==null&&item.score!==''){item.score=Number(item.score);if(!Number.isFinite(item.score)||item.score<0||item.score>1000)throw new Error('Use the exam score shown on your record.');}
    return item;
  }
  const identityFields=['provider','code','title','credits','creditSystem','status','completedOn','institution','sourceProgramId','grade','score','courseVersion'];
  const sameDetails=(a,b)=>identityFields.every(key=>key==='provider'?providerKey(a.provider)===providerKey(b.provider):String(a[key]??'')===String(b[key]??''));
  function updateLearning(state,value,options={}) {
    const existing=list(state.learning).find(item=>item.id===value?.id),item=validateLearning({...object(existing),...object(value)});
    if(existing&&(providerKey(existing.provider)!==providerKey(item.provider)||['code','title'].some(key=>String(existing[key]??'')!==String(item[key]??'')))){
      for(const key of ['catalogCourseId','codeAliases','sourceListingCode','sourceUrl','sourceCheckedAt','codeBasis','recommendationStatus','mappedCourseIds','mappingStatus','sourceId','providerId','identitySourceIds','sourceProgramId'])delete item[key];
      const sourceChanged=providerKey(existing.provider)!==providerKey(item.provider)||normalized(existing.code)!==normalized(item.code)||!normalized(existing.code)&&!normalized(item.code)&&normalized(existing.title)!==normalized(item.title);
      if(sourceChanged)for(const key of ['courseVersion','recommendationStart','recommendationEnd'])delete item[key];
      if(providerKey(existing.provider)!==providerKey(item.provider))for(const key of ['institution','creditOrigin','sourceType'])delete item[key];
      item.codeBasis=item.code?'student-record':'not-yet-known';
      item.creditBasis='not-yet-known';
    }
    // Evaluation claims supplied in an edited/imported item are never trusted.
    item.evaluations=existing && sameDetails(existing,item) ? copy(list(existing.evaluations)) : [];
    if(options.confirmCurrentProgram){
      if(options.confirmation!==true || item.status!=='earned' || !finite(item.credits) || !['semester','quarter','competency-unit'].includes(item.creditSystem))throw new Error('Confirm a school placement explicitly after recording its source credits and units.');
      const evaluation=object(options.confirmCurrentProgram),programId=identifier(evaluation.programId,'program'),requirementId=identifier(evaluation.requirementId,'requirement');
      item.evaluations=item.evaluations.filter(entry=>!(entry.programId===programId && entry.requirementId===requirementId));
      item.evaluations.push({programId,requirementId,...(text(evaluation.optionId)?{optionId:evaluation.optionId}:{}),status:'confirmed'});
    }
    const learning=list(state.learning).map(record=>record.id===item.id?item:record);
    if(!existing)learning.push(item);
    return {...state,learning,profile:{...object(state.profile),hasPrior:learning.some(record=>record.status==='earned')?'some':state.profile?.hasPrior}};
  }
  function assignLearning(state,program,recordId,requirementId,options={}) {
    const programId=identifier(program?.id,'program');recordId=identifier(recordId,'learning record');requirementId=identifier(requirementId,'requirement');
    const req=list(program?.requirements).find(item=>item?.id===requirementId);
    if(!req || !finite(req.credits) || req.credits<=0)throw new Error('Choose a degree requirement with known positive credits.');
    const records=list(state.learning),matches=records.filter(item=>item?.id===recordId),existing=matches[0];
    if(matches.length!==1 || existing.status!=='earned' || !finite(existing.credits) || existing.credits<=0)throw new Error('Choose one saved completed source record with known positive credits.');
    const sourceUnits=existing.creditSystem===null?null:existing.creditSystem || 'semester',programUnits=program.creditSystem || 'semester',confirmed=options.confirmation===true;
    if(!['semester','quarter','competency-unit'].includes(sourceUnits) || !['semester','quarter','competency-unit'].includes(programUnits))throw new Error('Review the source and degree credit units before assigning learning.');
    if(sourceUnits!==programUnits && !confirmed)throw new Error('Different credit units require explicit confirmation of the school award.');
    if(records.some(item=>item?.id!==recordId && list(item?.evaluations).some(entry=>entry?.programId===programId && entry.requirementId===requirementId)))throw new Error('This requirement already has another source assigned. Review that placement first.');
    const item=copy(existing);
    // This explicit student action places a source, without guessing a curated
    // option from its title or importing evaluation claims from a form.
    item.evaluations=list(item.evaluations).filter(entry=>!(entry?.programId===programId && entry.requirementId===requirementId));
    item.evaluations.push({programId,requirementId,status:confirmed?'confirmed':'reported'});
    if(sourceUnits===programUnits){
      const allocated=new Set(item.evaluations.filter(entry=>entry?.programId===programId).map(entry=>entry.requirementId));
      let total=0;
      for(const id of allocated){
        const target=list(program.requirements).find(candidate=>candidate?.id===id);
        if(!target || !finite(target.credits) || target.credits<0)throw new Error('Review this source’s existing degree placements before assigning more credits.');
        const evaluation=item.evaluations.find(entry=>entry?.programId===programId && entry.requirementId===id),credits=placementCredits(program,item,evaluation);
        if(credits===null)throw new Error('Review this source’s existing degree placements before assigning more credits.');
        total+=credits;
      }
      if(total>item.credits+0.001)throw new Error('This source already has its credits allocated. Review its school-specific placements.');
    }
    let next={...state,learning:records.map(record=>record.id===recordId?item:record),profile:{...object(state.profile),hasPrior:'some'}};
    if(Object.prototype.hasOwnProperty.call(object(state.scenarios?.[programId]?.optionSelections),requirementId))next=setCourse(next,programId,requirementId,'');
    return next;
  }
  function correctProgress(state,recordId,progress,options={}) {
    if(!['planned','in-progress'].includes(progress))throw new Error('Choose Not started or In progress when correcting a course.');
    recordId=identifier(recordId,'learning record');
    const records=list(state?.learning).filter(record=>record?.id===recordId),existing=records[0];
    if(records.length!==1)throw new Error('Open the original course in My courses before changing its progress.');
    if(options.expectedRecord!==undefined&&JSON.stringify(existing)!==options.expectedRecord)throw new Error('This course changed while you were reviewing it. Open its latest details and try again.');
    if(list(existing.evaluations).some(evaluation=>evaluation?.status==='confirmed')&&options.confirmation!==true){
      const error=new Error('This course has school-confirmed credit. Confirm the correction before changing its progress.');error.code='confirmation_required';throw error;
    }
    // Completion belongs to one original course or exam, including all of a
    // bundle's placements. Keep the source record; unfinished learning cannot
    // retain a completion date or any degree-specific credit award.
    const next=updateLearning(state,{...existing,status:progress,completedOn:''});
    return {...next,learning:next.learning.map(record=>record.id===recordId?{...record,evaluations:[]}:record)};
  }
  function recordProgress(state,program,requirement,rowOption,progress,options={}) {
    if(!['in-progress','completed','confirmed'].includes(progress))throw new Error('Choose in-progress, completed, or confirmed progress.');
    const req=list(program?.requirements).find(item=>item.id===requirement?.id);
    const option=req && list(req.options).find(item=>item.id===rowOption?.id && providerKey(item.provider)===providerKey(rowOption?.provider));
    if(!req || !option)throw new Error('Choose a reviewed course option from this degree requirement.');
    const earnedCredits=earnedCreditException(program,req,rowOption),allocationCredits=earnedCredits??req.credits;
    if(['in-progress','completed'].includes(progress) && (option.selectionRequired || rowOption?.selectionRequired || requirement?.selectionRequired))throw new Error('Choose a specific course first.');
    const matches=list(state.learning).filter(item=>sameAction(item,program,option));
    const existing=options.recordId?matches.find(item=>item.id===options.recordId):matches.find(item=>item.status==='earned') || matches[0];
    if(options.recordId && !existing)throw new Error('The saved learning record does not match this original source.');
    const unknownSource=option.sourceCreditStatus==='unknown';
    if(unknownSource && (!existing || !finite(existing.credits) || existing.credits<=0 || !['semester','quarter','competency-unit'].includes(existing.creditSystem)))throw new Error('Add this course’s original credits and credit units in My courses before changing its progress. The school’s awarded credits are not the original source credits.');
    const sourceCredits=unknownSource?existing.credits:finite(option.sourceCredits)?option.sourceCredits:finite(option.bundleCredits)?option.bundleCredits:finite(option.credits)?option.credits:req.credits;
    if(!finite(sourceCredits)||sourceCredits<=0||sourceCredits>200||!finite(allocationCredits)||allocationCredits<=0)throw new Error('This item cannot create an awarded-credit record.');
    if(existing && existing.creditSystem===null)throw new Error('Add this source record’s original credit units in My courses before assigning it to this degree.');
    if(progress==='confirmed' && (options.confirmation!==true || !existing || existing.status!=='earned' || !finite(existing.credits) || existing.credits<=0))throw new Error('School confirmation requires an explicit confirmation and a saved completed source with known credits.');
    if(progress==='in-progress' && existing?.status==='earned')throw new Error('This source already has completed learning. Open its learning record to edit it.');
    const units=unknownSource?existing.creditSystem:option.sourceCreditSystem || option.creditSystem || program.creditSystem || 'semester';
    if(units!==(program.creditSystem||'semester') && (!finite(option.sourceCredits) || option.sourceCredits<=0 || option.creditSystem!==(program.creditSystem||'semester')))throw new Error('This mapping needs explicit original source credits and receiving-school units before recording progress.');
    if(existing && existing.creditSystem && existing.creditSystem!==units && progress!=='confirmed')throw new Error('Review this source record’s original credit units before changing its progress.');
    const item=existing?copy(existing):{id:uid(),provider:option.provider,code:option.code || option.id,title:option.title,credits:sourceCredits,creditSystem:units,status:'planned',completedOn:'',evaluations:[],...(providerKey(option.provider)==='university'?{institution:text(program.school),sourceProgramId:program.id}:{})};
    if(!finite(item.credits)||item.credits<=0)throw new Error('Record the original source credits before changing progress.');
    if(earnedCredits!==null && (item.credits!==sourceCredits || item.creditSystem!==units))throw new Error('Review this source record’s original credits and units before applying this exact course mapping.');
    if(item.creditSystem===(program.creditSystem||'semester') && item.credits+0.001<allocationCredits)throw new Error('The original source credits do not cover this requirement. Review the learning record.');
    item.status=progress==='in-progress'?'in-progress':'earned';
    if(options.completedOn!==undefined)item.completedOn=date(options.completedOn);
    item.evaluations=existing && !sameDetails(existing,item)?[]:copy(list(item.evaluations));
    if(progress!=='in-progress'){
      const targets=[{req,option}];
      if(progress==='completed' && option.bundleId){
        const components=list(program.requirements).map(candidate=>({req:candidate,option:list(candidate.options).find(choice=>choice.bundleId===option.bundleId && providerKey(choice.provider)===providerKey(option.provider) && sameAction({provider:choice.provider,code:choice.code || choice.id,title:choice.title},program,option))})).filter(component=>component.option);
        const credits=components.reduce((sum,component)=>sum+(finite(component.req.credits)?component.req.credits:Infinity),0);
        if(credits<=item.credits+0.001 && credits<=sourceCredits+0.001)targets.splice(0,targets.length,...components);
      }
      for(const target of targets){
        const original=item.evaluations.find(evaluation=>evaluation.programId===program.id && evaluation.requirementId===target.req.id);
        if(original?.status==='confirmed' && progress!=='confirmed')continue;
        item.evaluations=item.evaluations.filter(evaluation=>!(evaluation.programId===program.id && evaluation.requirementId===target.req.id));
        item.evaluations.push({programId:program.id,requirementId:target.req.id,optionId:target.option.id,status:progress==='confirmed'?'confirmed':'reported'});
      }
      if(item.creditSystem===(program.creditSystem||'semester')){
        const allocated=new Set(item.evaluations.filter(evaluation=>evaluation.programId===program.id).map(evaluation=>evaluation.requirementId));
        let total=0;
        for(const requirementId of allocated){
          const evaluation=item.evaluations.find(evaluation=>evaluation.programId===program.id && evaluation.requirementId===requirementId),credits=placementCredits(program,item,evaluation);
          if(credits===null)throw new Error('Review this source’s existing degree placements before assigning more credits.');
          total+=credits;
        }
        if(total>item.credits+0.001)throw new Error('This source already has its credits allocated. Review its school-specific placements.');
      }
    }
    const learning=list(state.learning).map(record=>record.id===item.id?item:record);if(!existing)learning.push(item);
    return {...state,learning,profile:{...object(state.profile),hasPrior:'some'}};
  }
  function parseCSV(raw) {
    if(typeof raw!=='string'||raw.length>100000)throw new Error('Use a CSV with at most 100,000 characters.');
    const rows=[];let cells=[],cell='',quoted=false,closed=false;
    for(let index=0;index<raw.length;index++){
      const character=raw[index];
      if(quoted){if(character==='"'){if(raw[index+1]==='"'){cell+='"';index++;}else{quoted=false;closed=true;}}else cell+=character;continue;}
      if(character==='"'){if(cell.trim()||closed)throw new Error('A CSV quote must start a field.');quoted=true;continue;}
      if(character===','||character==='\n'||character==='\r'){
        cells.push(cell);cell='';closed=false;
        if(character!==','){if(character==='\r'&&raw[index+1]==='\n')index++;if(cells.some(value=>value.trim()))rows.push(cells);cells=[];}
      }else{if(closed&&!/\s/.test(character))throw new Error('Separate a quoted CSV value with a comma.');if(!closed)cell+=character;}
    }
    if(quoted)throw new Error('A quoted CSV value is unfinished.');cells.push(cell);if(cells.some(value=>value.trim()))rows.push(cells);
    if(rows.length<2)throw new Error('Add at least one course below the header row before uploading.');
    if(rows.length>501)throw new Error('Use at most 500 learning records per CSV.');
    const headers=rows.shift().map(value=>value.replace(/^\uFEFF/,'').trim().toLowerCase());
    if(new Set(headers).size!==headers.length)throw new Error('CSV column names must be unique.');
    if(['provider','title','credits'].some(name=>!headers.includes(name)))throw new Error('The CSV needs provider, title, and credits columns.');
    const statuses={'':'earned',earned:'earned',completed:'earned',complete:'earned','in-progress':'in-progress','in progress':'in-progress',ongoing:'in-progress',planned:'planned',proposed:'planned',considering:'planned'};
    return rows.map((values,index)=>{
      if(values.length!==headers.length)throw new Error('Check the number of CSV fields on row '+(index+2)+'.');
      const record=Object.fromEntries(headers.map((key,position)=>[key,values[position].trim()]));
      if(!/^\d*\.?\d+$/.test(record.credits)||!record.provider||!record.title)throw new Error('Check provider, title, and credits on row '+(index+2)+'.');
      const status=statuses[(record.status||'').toLowerCase()];if(!status)throw new Error('Use earned, in-progress, or planned status on row '+(index+2)+'.');
      return {...validateLearning({id:uid(),provider:record.provider,code:record.code||'',title:record.title,credits:Number(record.credits),creditSystem:(record.creditsystem||'semester').toLowerCase(),status,completedOn:record.completedon||'',...(record.grade?{grade:record.grade}:{}),...(record.score?{score:record.score}:{})}),evaluations:[]};
    });
  }
  function mergeLearning(state,records) {
    if(!Array.isArray(records)||records.length>500)throw new Error('Review between 1 and 500 learning records before import.');
    let result=state;const seen=new Map();
    for(const value of records){
      const record=validateLearning(value),key=learningIdentity(record);
      if(seen.has(key)){if(!sameDetails(seen.get(key),record))throw new Error('Conflicting duplicate source records need review before import.');continue;}
      seen.set(key,record);
      const matches=list(result.learning).filter(item=>learningIdentity(item)===key);
      if(matches.length>1)throw new Error('This source has duplicate saved records. Resolve them before importing updates.');
      const existing=matches[0];result=updateLearning(result,{...record,id:existing?.id || record.id});
    }
    return result===state?{...state,learning:[...list(state.learning)]}:result;
  }
  function csvCell(value) { const raw=String(value??'');const safe=/^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@])/.test(raw)?"'"+raw:raw;return '"'+safe.replace(/"/g,'""')+'"'; }
  function safeURL(value) { if(typeof value!=='string'||value.length>2048)return '';try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=2048?url.href:'';}catch(_){return '';} }
  function exportCSV(program,plan,notes) {
    const rows=[['Requirement','Credits','Provider','Course','Progress','Review','Source']];
    for(const row of list(plan?.rows)){
      const req=list(program?.requirements).find(item=>item.id===row.requirementId),option=row.option||{};
      const unmapped=!['reported','confirmed'].includes(row.status)&&['research-gap','conditional-gap','excluded-source'].includes(row.placementReason);
      const progress={planned:'Planned',reported:'Completed',confirmed:'Completed',unresolved:'Unresolved','in-progress':'In progress',earned:'Completed'}[row.status]||row.status||'Unresolved';
      const review=row.status==='confirmed'?'School-confirmed placement':row.status==='reported'?'Awaiting school evaluation':list(row.conditions).join(' | ') || (option.evidence==='conditional'?'Conditional mapping; confirm with school':option.id?'Confirm current applicability':'Course selection required');
      rows.push([req?.categoryLabel||req?.title||row.title||row.requirementId,row.credits??req?.credits??'',unmapped?'':option.provider||'',unmapped?'Transfer course not matched':option.title||'',unmapped?'Unmapped':progress,unmapped?'Course-map gap; university-only coursework is not established':review,unmapped?'':safeURL(option.url)]);
    }
    // Private sheet notes are intentionally absent from the seven-column export.
    return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  }
  function publicPlan(program,plan,pathway,priority) {
    if(!program||!pathway||!finite(program.totalCredits)||program.totalCredits<0||program.totalCredits>500)return null;
    const schoolName=bounded(pathway.school||pathway.schoolName||program.school,120),schoolIds={'Thomas Edison State University':'tesu','Liberty University':'liberty','University of Maine at Presque Isle':'umpi','Western Governors University':'wgu','Charter Oak State College':'cosc','Southern New Hampshire University':'snhu','Purdue Global':'purdue-global'};
    const result={schoolId:bounded(pathway.schoolId||program.schoolId||schoolIds[schoolName]||schoolName.toLowerCase().replace(/[^a-z0-9]+/g,'-'),100),schoolName,programId:bounded(program.id,100),programName:bounded(pathway.title||program.title,160),strategy:['balanced','cost','speed','transfer'].includes(priority)?priority:'balanced',totalCredits:program.totalCredits,courses:[]};
    const version=programCatalog(program);if(version)result.catalogYear=version;
    if(!result.schoolId||!result.schoolName||!result.programId||!result.programName)return null;
    for(const row of list(plan?.rows)){
      if(row.status!=='planned'||!row.option)continue;const req=list(program.requirements).find(item=>item.id===row.requirementId),option=row.option;
      if(!req||!finite(row.credits)||row.credits<0||row.credits>30)continue;
      const course={requirementId:bounded(req.id,120),requirement:bounded(req.categoryLabel||req.title||row.title,160),courseId:bounded(option.id,120),title:bounded(option.title,200),provider:bounded(option.provider,100),credits:row.credits};
      if(Object.values(course).some(value=>value===''))continue;const url=safeURL(option.url);if(url)course.url=url;result.courses.push(course);if(result.courses.length===100)break;
    }
    return result.courses.length?result:null;
  }
  function compareBaseline(state,current) {
    if(!state.baseline)return null;const baseline=state.baseline;
    const values={externalCredits:current?.coverage?.mappedExternalCredits,confirmedCredits:current?.totals?.confirmed,modeledSubtotal:current?.costs?.modeledSubtotal,scenarioWeeks:current?.timing?.scenarioWeeks};
    return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,finite(value)&&finite(baseline[key])?value-baseline[key]:null]));
  }
  // The degree's own unit name. Competency units and quarter credits are never relabelled as semester credits.
  function creditUnit(creditSystem,count) {
    const one=count===1;
    if(creditSystem==='competency-unit')return one?'competency unit':'competency units';
    if(creditSystem==='quarter')return one?'quarter credit':'quarter credits';
    return one?'credit':'credits';
  }
  const listNames=names=>names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names.at(-1);
  // Compares this worksheet's planned outside credits with the published starting route
  // (a reviewed baseline). Read-only: it explains a difference, it never changes choices.
  function routeCreditDifference({baseline,plannedCredits,providers,creditSystem}={}) {
    const starting=baseline?.summary?.transferCredits;
    if(!finite(starting)||!finite(plannedCredits)||!Array.isArray(providers))return null;
    const difference=Math.round((plannedCredits-starting)*10)/10;
    if(difference===0)return null;
    const amount=Math.abs(difference),unit=creditUnit(creditSystem,amount),outside=difference<0?'fewer':'more';
    const routeProviders=[...new Set(list(baseline.rows).map(row=>row?.provider).filter(provider=>typeof provider==='string'&&provider&&provider!=='University'))];
    const off=difference<0?routeProviders.filter(provider=>!providers.includes(provider)):[];
    const reason=off.length?'because '+listNames(off)+(off.length===1?' is':' are')+' off in your course sources':'because of your current choices';
    return {difference,startingCredits:starting,plannedCredits,providersOff:off,text:amount+' '+outside+' outside '+unit+' than the starting route '+reason+'.'};
  }
  // An alternative institution minimum that applies only to some students (for example
  // partnership admission), read from the program's own sourced policy evidence.
  function residencyAlternative(program,shownMinimum) {
    const alt=program?.policyEvidence?.institutionMinCredits?.partnershipAlternative;
    if(!alt||!finite(alt.value)||alt.value<=0||!text(alt.scope)||!list(alt.sourceIds).length||finite(shownMinimum)&&alt.value<=shownMinimum)return null;
    return {value:alt.value,scope:text(alt.scope),sourceIds:[...alt.sourceIds],text:text(alt.scope).replace(/[.\s]+$/,'')+': at least '+alt.value+' '+creditUnit(program.creditSystem,alt.value)+' at the university.'};
  }
  // Plans that still need school confirmation (data/plan-library-index.json,
  // tier 'confirmation') carry open questions keyed by route id. Reviewed plans
  // and a missing or malformed index return none.
  function schoolQuestions(index,routeId){
    const plans=object(object(index).plans),id=text(routeId);
    const entry=id&&Object.hasOwn(plans,id)?object(plans[id]):{};
    if(entry.tier!=='confirmation'||!Array.isArray(entry.questions))return [];
    return entry.questions.slice(0,12).filter(question=>typeof question==='string'&&question.trim()).map(question=>{const value=bounded(question,400).replace(/^ask the school:\s*/i,'');return value.charAt(0).toUpperCase()+value.slice(1);}).filter(Boolean);
  }
  /** A short email a student can send the school, in their own voice, built from the plan's open questions.
   * At most three plain questions; checks the student does with a provider (enrollment terms) are left out.
   * options: {title, school, format, courses:[course titles]} — all optional. Returns null when nothing is open. */
  // Published transfer-credit contacts, each copied from the school's own page (checked 2026-11-22). Only addresses a school
  // publishes for these questions are listed; a school that publishes none gets its contact page instead.
  const SCHOOL_TRANSFER_CONTACTS=Object.freeze({
    'Western Governors University':{email:'transcriptinfo@wgu.edu',office:'WGU transcript and transfer evaluation team',source:'https://www.wgu.edu/transfer'},
    'Liberty University':{online:{email:'luotransfer@liberty.edu',office:'Liberty University Online transfer evaluators',source:'https://liberty.edu/online/transfer-students'},campus:{email:'undergradtransfer@liberty.edu',office:'Liberty University transfer evaluations',source:'https://www.liberty.edu/registrar/transferring-courses/consultations'}},
    'Excelsior University':{email:'admissions@excelsior.edu',office:'Excelsior University admissions',source:'https://www.excelsior.edu/start-with-more-credit/'},
    'Thomas Edison State University':{email:'registrar@tesu.edu',office:'TESU Office of the Registrar, Director of Transfer Evaluations',source:'https://tesu.smartcatalogiq.com/current/undergraduate-catalog/methods-of-learning-and-earning-credit/transfer-credit/'},
    'University of Phoenix':{email:'',office:'University of Phoenix enrollment',source:'https://www.phoenix.edu/about/contact-us.html',contactPage:'https://www.phoenix.edu/request/email-us'}
  });
  /** The school's published transfer contact for a plan, or null. options: {school, modalities}. */
  function schoolTransferContact(options={}){
    const entry=SCHOOL_TRANSFER_CONTACTS[text(options.school)];if(!entry)return null;
    if(entry.online||entry.campus){const online=(Array.isArray(options.modalities)?options.modalities:[]).includes('online');return entry[online?'online':'campus']||null;}
    return entry;
  }
  function schoolEmail(index,routeId,options={}){
    const plans=object(object(index).plans),id=text(routeId),entry=id&&Object.hasOwn(plans,id)?object(plans[id]):{};
    if(entry.tier!=='confirmation'||!Array.isArray(entry.questions))return null;
    const school=bounded(text(options.school),120)||'your school',title=bounded(text(options.title),160);
    const courses=(Array.isArray(options.courses)?options.courses:[]).map(item=>bounded(text(item),80)).filter(Boolean);
    const slotPicks=(Array.isArray(options.slotChoices)?options.slotChoices:[]).map(item=>bounded(text(item),160)).filter(Boolean);
    const rules=[
      [/ACE- or NCCRS/i,()=>'What is the most credit you accept toward this degree from ACE- or NCCRS-evaluated courses and exams (for example Sophia, Study.com or CLEP)?'],
      [/90-hour limit on experiential/i,()=>'Do ACE-recommended courses (such as Sophia) count toward your 90-hour limit on experiential/prior learning, or only toward the overall transfer maximum?'],
      [/upper-level/i,()=>'How many upper-level credits does this degree require, and which upper-level courses must I take at '+school+' itself?'],
      [/how many credits must I earn at the school/i,()=>'How many credits do I need to take at '+school+' itself for this degree?'],
      [/time limit/i,()=>'Is there a time limit on how old my transfer credits can be?'],
      [/written transfer evaluation|residency/i,()=>'Could you tell me how many courses in my major I must take at '+school+', and whether I can get an unofficial transfer evaluation before I enroll?'],
      [/proposed course match/i,()=>courses.length?'Will these courses count toward this degree: '+courses.slice(0,3).join('; ')+(courses.length>3?' (I can send the full list)':'')+'?':'Will the outside courses in my plan count toward this degree? I can send you the list.'],
      // The student's own open-slot picks, asked only while the three-question limit leaves room.
      [/open course choice/i,()=>slotPicks.length?'Will the courses I picked count for the open course choices: '+slotPicks.slice(0,2).join('; ')+(slotPicks.length>2?' (I can send the full list)':'')+'?':''],
      [/catalog year/i,()=>'Which catalog year would apply to me if I enroll this term?'],
      [/state changes the general-education/i,()=>'Does my state add any general-education requirements to this degree?']
    ];
    // Most important first (rules are listed in priority order), so the three asks are the ones that change the plan most.
    const asks=[],open=entry.questions.filter(item=>typeof item==='string');
    for(const [pattern,ask] of rules){const question=ask();if(question&&open.some(item=>pattern.test(item))&&!asks.includes(question))asks.push(question);}
    if(!asks.length)asks.push('Is this program open to new students now, and which catalog requirements would I follow if I enroll this term?');
    const list=asks.slice(0,3),format=text(options.format);
    const subject='Transfer credit question'+(title?' – '+title:'');
    const body=['Hello,','','I’m planning to enroll in '+(title?'the '+title+(format?' ('+format+')':''):'one of your degrees')+' and want to take some courses before I start. Before I pay for them, could you help with '+(list.length===1?'one question':list.length+' quick questions')+'?','',...list.map((ask,i)=>(i+1)+'. '+ask),'','Thank you,','[Your name]'].join('\n');
    const contact=schoolTransferContact({school:options.school,modalities:options.modalities}),to=contact?.email||'';
    return {subject,body,questions:list,contact,mailto:'mailto:'+to+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)};
  }
  // Subject choices follow the browsing taxonomy (content/catalog/subject-areas.json);
  // labels come from the plan index when present. An older saved field id stays
  // selectable so a saved profile is shown as it is rather than reset.
  const defaultSubjectLabels={business:'Business & management','accounting-finance':'Accounting & finance',technology:'Technology & data',health:'Health & healthcare',psychology:'Psychology & human services','criminal-justice':'Criminal justice & law',education:'Education',humanities:'Communication & humanities',faith:'Religion & ministry'};
  const legacySubjectLabels={science:'Science & mathematics',arts:'Arts & design','social-science':'Social sciences (psychology or criminal justice)',general:'General studies',law:'Law',aviation:'Aviation'};
  function subjectChoices(current,index){
    const ids=Guide&&Array.isArray(Guide.subjectIds)?Guide.subjectIds:Object.keys(defaultSubjectLabels),labels=object(object(index).subjects);
    const items=[['any','Any eligible subject'],...ids.filter(id=>Object.hasOwn(defaultSubjectLabels,id)).map(id=>[id,Object.hasOwn(labels,id)&&text(labels[id])?text(labels[id]):defaultSubjectLabels[id]])];
    const value=text(current);
    if(value&&!items.some(([id])=>id===value)&&Object.hasOwn(legacySubjectLabels,value))items.push([value,legacySubjectLabels[value]]);
    return items;
  }
  // Route subjects from the plan index let a new subject filter strictly.
  function attachRouteSubjects(catalog,index){
    const plans=object(object(index).plans);if(!catalog||!Array.isArray(catalog.pathways)||!Object.keys(plans).length)return catalog;
    let changed=false;const pathways=catalog.pathways.map(route=>{const entry=route&&Object.hasOwn(plans,route.id)?object(plans[route.id]):{},subjects=entry.subjects;if(!Array.isArray(subjects)||!subjects.every(id=>typeof id==='string')||JSON.stringify(route.subjects)===JSON.stringify(subjects))return route;changed=true;return {...route,subjects:[...subjects]};});
    return changed?{...catalog,pathways}:catalog;
  }
  return Object.freeze({schoolEmail,schoolTransferContact,initialize,selectPathway,savedTarget,targetMatches,targetRoute,restoreTarget,scenario,setCourse,setNote,slotChoice,setSlotChoice,recordProgress,correctProgress,assignLearning,updateLearning,parseCSV,mergeLearning,exportCSV,publicPlan,compareBaseline,catalogYear,programCatalog,creditUnit,routeCreditDifference,residencyAlternative,schoolQuestions,subjectChoices,attachRouteSubjects});
}));
