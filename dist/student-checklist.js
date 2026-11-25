/* Private next steps beside the degree ledger. Checklist edits never award credit. */
(function (root, factory) {
  'use strict';
  const common=typeof module === 'object' && module.exports;
  const api = factory(common ? require('./course-plan-view.js') : root.DegreeCoursePlanView, common ? require('./journey-engine.js') : root.DegreeJourney);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreeChecklist = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (CoursePlan, Journey) {
  'use strict';
  const MAX_BYTES = 480000, MAX_CUSTOM = 50, MAX_COURSES = 60, MAX_ROWS = 500;
  const statuses = ['todo','doing','waiting','done'];
  const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const plain = value => {if (!value || typeof value !== 'object' || Array.isArray(value)) return false;const proto=Object.getPrototypeOf(value);return proto===null || Object.getPrototypeOf(proto)===null && own(proto,'constructor') && proto.constructor?.name==='Object';};
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value.trim() : '';
  const normalized = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const namedGoal = value => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
  const provider = value => ({sophialearning:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[normalized(value)] || normalized(value));
  const safeKey = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !['__proto__','constructor','prototype'].includes(value) && !/[\u0000-\u001f\u007f]/.test(value);
  const builtinIds = new Set(['choose-goal','gather-records','send-transcripts','military-records','professional-entry','get-requirements','review-plan','request-school-feedback','review-school-feedback','check-application-deadline','check-transfer-deadline','finish-coursework','enroll-at-school','apply-to-graduate','course-overflow','obligation-overflow','campus-arrangements']);
  const sensitive = new Set(['review-plan','request-school-feedback','review-school-feedback','get-requirements']);
  const validTaskId = id => builtinIds.has(id) || /^(?:course|obligation)-[a-f0-9]{16}$/.test(id);
  const invalid = message => {throw new Error(message);};
  function bytes(value) {
    const raw = JSON.stringify(value); let size = 0;
    for (let i=0;i<raw.length;i++) {const n=raw.charCodeAt(i);size+=n<128?1:n<2048?2:n>=0xd800&&n<=0xdbff&&raw.charCodeAt(i+1)>=0xdc00&&raw.charCodeAt(i+1)<=0xdfff?(i++,4):3;}
    return size;
  }
  function copy(value) {try {return JSON.parse(JSON.stringify(value));} catch {return invalid('Your private plan could not be read. It has not been changed.');}}
  function date(value) {
    if (value === '') return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid('Use a real due date in YYYY-MM-DD format.');
    const instant = new Date(value+'T12:00:00Z');
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,10) !== value) return invalid('Use a real due date in YYYY-MM-DD format.');
    return value;
  }
  function bounded(value,max,label,required=false) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || required && !value.trim()) return invalid('Use '+(required?'a nonempty ':'')+label+' of at most '+max+' characters.');
    return required ? value.trim() : value;
  }
  function fields(value,allowed) {if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid('The saved checklist could not be read. It has not been changed.');}
  function status(value) {if (!statuses.includes(value)) invalid('Choose To do, Doing, Waiting, or Done.');return value;}
  function validateItem(value) {
    fields(value,['status','dueOn','notes','signature']);
    if (own(value,'status')) status(value.status);
    if (own(value,'dueOn')) date(value.dueOn);
    if (own(value,'notes')) bounded(value.notes,1000,'note');
    if (own(value,'signature') && (typeof value.signature !== 'string' || !/^[a-f0-9]{16}$/.test(value.signature))) invalid('The saved checklist review could not be read. It has not been changed.');
  }
  function storeFor(state) {
    if (!own(state,'checklist')) return {version:1,plans:{}};
    const store = state.checklist;
    fields(store,['version','plans']);
    if (store.version !== 1 || !plain(store.plans) || Object.keys(store.plans).length > 100) invalid('The saved checklist could not be read. It has not been changed.');
    for (const [scope,plan] of Object.entries(store.plans)) {
      if (!safeKey(scope)) invalid('The saved checklist has an invalid plan. It has not been changed.');
      fields(plan,['items','custom','nextId']);
      if (!plain(plan.items) || Object.keys(plan.items).length > 250 || !Array.isArray(plan.custom) || plan.custom.length > MAX_CUSTOM || !Number.isSafeInteger(plan.nextId) || plan.nextId < 1) invalid('The saved checklist has invalid tasks. It has not been changed.');
      for (const [id,item] of Object.entries(plan.items)) {if (!validTaskId(id)) invalid('The saved checklist has an invalid task. It has not been changed.');validateItem(item);}
      const ids = new Set();
      for (const custom of plan.custom) {
        fields(custom,['id','title','status','dueOn','notes']);
        if (typeof custom.id !== 'string' || !/^custom-[1-9]\d{0,14}$/.test(custom.id) || ids.has(custom.id) || Number(custom.id.slice(7)) >= plan.nextId) invalid('The saved checklist has an invalid custom task. It has not been changed.');
        ids.add(custom.id);bounded(custom.title,160,'task title',true);status(custom.status);date(custom.dueOn);bounded(custom.notes,1000,'note');
      }
    }
    return store;
  }
  function hash(raw) {
    let a=2166136261,b=2246822507;
    for (let i=0;i<raw.length;i++) {const n=raw.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b^n,3266489909);}
    return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  }
  // Prices, time estimates and presentation settings do not invalidate a review.
  // Catalog rules, source evidence, academic choices and original records do.
  const excluded = /^(?:costs?|pricing|price|tuition|fees?.*|currency|rate|timing|duration|weeks?|months?|providerMonths|providerWeeks|universityRate.*|sophiaMonths|studyMonths|sophiaWeeks|studyWeeks|clepWeeks|termWeeks|termCredits|concurrency|externalConcurrency|universityTermWeeks|universityCreditsPerTerm|externalWeeks|priority|optimization|savings.*|budget|weeklyHours|deadline|checklist|sheet|view|search|filter|privateNote|studentNote)$/i;
  function academic(value,depth=0) {
    if (depth > 20) return null;
    if (Array.isArray(value)) return value.slice(0,MAX_ROWS).map(item=>academic(item,depth+1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key=>!excluded.test(key) && value[key] !== undefined).map(key=>[key,academic(value[key],depth+1)]));
    return value;
  }
  function context(state,draft) {
    const pathway=object(draft.pathway),program=object(draft.program),p=object(state.profile),j=object(state.journey);
    const target=state.sheet?.isExample!==true && Boolean(text(state.selectedPathwayId) || text(p.pathwayId) || text(p.school||p.schoolChoice) && text(p.degree));
    const selected=text(state.selectedPathwayId)||text(p.pathwayId);
    if (target && selected && (pathway.id || program.id) && ![pathway.id,pathway.modelId,program.id].includes(selected)) invalid('Your degree goal changed. Open the current plan before saving checklist tasks.');
    if (program.id && pathway.modelId && program.id!==pathway.modelId) invalid('The current degree map does not match this goal. Refresh the plan before saving.');
    if (target && selected==='custom-target' && ((text(p.school||p.schoolChoice)&&pathway.school&&namedGoal(p.school||p.schoolChoice)!==namedGoal(pathway.school)) || (text(p.degree)&&pathway.title&&namedGoal(p.degree)!==namedGoal(pathway.title)))) invalid('Your degree goal changed. Open the current plan before saving checklist tasks.');
    if (draft.state && JSON.stringify(academic(list(state.learning)))!==JSON.stringify(academic(list(draft.state.learning)))) invalid('Your course records changed. Open the current plan before saving checklist tasks.');
    let scope=target ? text(program.id)||text(pathway.modelId)||text(pathway.id)||text(state.selectedPathwayId)||text(p.pathwayId) : 'unselected-goal';
    if (scope === 'custom-target' || !scope) scope='custom-target-'+hash(namedGoal(p.school||p.schoolChoice||pathway.school)+'|'+namedGoal(p.degree||pathway.title));
    if (!safeKey(scope)) invalid('Choose a valid degree goal before updating its checklist.');
    const scenario=object(state.scenarios?.[scope]),draftScenario=object(draft.state?.scenarios?.[scope]);
    const effectiveProviders = value => {
      const mapped=[...new Set(list(program.requirements).flatMap(req=>list(req.options).map(option=>option.provider)))].filter(source=>source&&source!=='University');
      // Provider availability is not permission to change saved preferences.
      // Match Journey.prepare for both implicit defaults and explicit choices.
      const selected=Array.isArray(value.providers)?value.providers:Array.isArray(program.defaultProviders)?program.defaultProviders.filter(source=>mapped.includes(source)):['Sophia','Study.com','CLEP',...mapped];
      return [...new Set(selected)].sort();
    };
    const choices = value => ({providers:effectiveProviders(value),allowConditional:value.allowConditional!==false,useWaivers:value.useWaivers===true,optionSelections:object(value.optionSelections)});
    if (draft.state && JSON.stringify(academic(choices(scenario)))!==JSON.stringify(academic(choices(draftScenario)))) invalid('Your course choices changed. Open the current plan before saving checklist tasks.');
    const profile = Object.fromEntries(['school','schoolChoice','degree','pathwayId','goal','degreeLevel','field','modality','classroomImportance','country','state','militaryStatus','militaryBranch','militaryRecords','militaryOccupation','hasPrior','assessmentPreference','proctoringPreference'].map(key=>[key,p[key]]));
    const signature=hash(JSON.stringify(academic({version:1,scope,target,profile,learning:list(state.learning),scenario:choices(scenario),pathway:{id:pathway.id,modelId:pathway.modelId,school:pathway.school,title:pathway.title,sources:pathway.sources,constraints:pathway.constraints},program:draft.program||null,rows:list(draft.plan?.rows),validation:draft.plan?.validation,targetIssues:draft.targetIssues,targetUnknowns:draft.targetUnknowns,purpose:j.answers?.purpose,career:j.answers?.career,creditsDeferred:j.creditsDeferred===true})));
    return {scope,signature,planContext:scope+'@'+signature,target};
  }
  function courseTasks(state,draft) {
    if (!draft.program || !draft.plan) return {tasks:[],unmapped:0,complete:false,valid:false};
    const rows=list(draft.plan.rows);
    if (rows.length > MAX_ROWS || !CoursePlan?.build) return {tasks:[],unmapped:0,complete:false,valid:false};
    const ledger=CoursePlan.build({...draft,state}), entries=Object.values(ledger.groups).flat(), records=list(state.learning), matches=[...list(draft.match?.completed),...list(draft.collectionMatch?.placements)];
    const merged=[], unknown=new Set();
    for (const entry of entries) {
      if (entry.kind === 'unmapped' || entry.progressState === 'needs-course') {list(entry.requirementIds).forEach(id=>unknown.add(id));continue;}
      const reqs=list(entry.requirementIds), placementIds=matches.filter(item=>reqs.includes(item.requirementId)).map(item=>item.learningId).filter(Boolean);
      const relevant=records.filter(record=>placementIds.includes(record.id));
      const actualEarned=relevant.some(record=>record.status==='earned' && typeof record.credits==='number' && Number.isFinite(record.credits) && record.credits>0 && record.creditSystem!==null && ['semester','quarter','competency-unit'].includes(record.creditSystem||'semester'));
      const checkedEntry={...entry,progressState:entry.progressState==='completed'&&!actualEarned?'not-started':entry.progressState};
      const source=provider(entry.provider), home=source==='university'?'|'+normalized(draft.program.school)+'|'+text(draft.program.id):'';
      const keys=new Set([...(entry.bundle?['bundle|'+source+home+'|'+entry.bundle]:[]),...(normalized(entry.code)?['code|'+source+home+'|'+normalized(entry.code)]:[]),...placementIds.map(id=>'record|'+id)]);
      const stableKeys=new Set(entry.bundle?['bundle|'+source+home+'|'+entry.bundle]:[]);
      for (const row of rows.filter(row=>reqs.includes(row.requirementId))) if (provider(row.option?.provider)===source) for (const code of [row.option.code,...list(row.option.codeAliases)]) if(normalized(code)){const key='code|'+source+home+'|'+normalized(code);keys.add(key);stableKeys.add(key);}
      for (const record of relevant) for (const code of [record.code,...list(record.codeAliases)]) if(normalized(code))keys.add('code|'+provider(record.provider)+home+'|'+normalized(code));
      if (!keys.size) keys.add('requirement|'+reqs.join('|'));
      const overlaps=merged.filter(item=>[...keys].some(key=>item.keys.has(key)));
      let item=overlaps.shift();
      if (!item) {item={keys:new Set(),stableKeys:new Set(),entries:[],requirementIds:[]};merged.push(item);}
      for (const other of overlaps) {other.keys.forEach(key=>item.keys.add(key));other.stableKeys.forEach(key=>item.stableKeys.add(key));item.entries.push(...other.entries);item.requirementIds.push(...other.requirementIds);merged.splice(merged.indexOf(other),1);}
      keys.forEach(key=>item.keys.add(key));stableKeys.forEach(key=>item.stableKeys.add(key));item.entries.push(checkedEntry);item.requirementIds.push(...reqs);
    }
    const tasks=merged.map(item=>{
      const first=item.entries[0],reqs=[...new Set(item.requirementIds)],done=item.entries.every(entry=>entry.progressState==='completed'),doing=item.entries.some(entry=>entry.progressState==='in-progress');
      // Prefer provider course identity over a particular mutable record ID.
      const identity=[...item.stableKeys].filter(key=>key.startsWith('bundle|')).sort()[0] || [...item.stableKeys].filter(key=>key.startsWith('code|')).sort()[0] || [...item.keys].sort()[0];
      return {id:'course-'+hash(identity),title:'Finish '+(text(first.title)||text(first.code)||'this course'),detail:(text(first.provider)?first.provider+' · ':'')+(done?'Finished in your course records. School acceptance is tracked separately.':doing?'Taking this course. Update its progress when you finish.':'Use the course progress form when you start or finish.')+(reqs.length>1?' Covers '+reqs.length+' plan requirements.':''),status:done?'done':doing?'doing':'todo',group:'courses',href:'plan.html?course='+encodeURIComponent(reqs[0]),actionLabel:'Update progress',automatic:true,canSetStatus:false,custom:false,kind:'course',requirementIds:reqs,dueOn:'',notes:''};
    });
    const valid=ledger.progress?.valid===true;
    const complete=valid && unknown.size===0 && rows.length>0 && tasks.length>0 && tasks.every(task=>task.status==='done');
    const visible=tasks.slice(0,MAX_COURSES),remaining=tasks.slice(MAX_COURSES);
    if (remaining.length) visible.push({id:'course-overflow',title:'Review '+remaining.length+' more planned courses',detail:'Open your full course plan to update the remaining courses.',status:remaining.every(task=>task.status==='done')?'done':remaining.some(task=>task.status==='doing')?'doing':'todo',group:'courses',href:'plan.html',actionLabel:'Open coursework',automatic:true,canSetStatus:false,custom:false,kind:'course',dueOn:'',notes:''});
    // Invalid ledgers cannot report completed tasks from untrusted allocations.
    if (!valid) visible.forEach(task=>{task.status='todo';task.detail='Review this course in the degree plan before relying on its completion.';});
    return {tasks:visible,unmapped:unknown.size,complete,valid};
  }
  function build(state,draft,options={}) {
    state=object(state);draft=object(draft);
    let store,ctx,error='';
    try {store=storeFor(state);ctx=context(state,draft);} catch (failure) {error=failure.message;store={version:1,plans:{}};try{ctx=context(state,draft);}catch{ctx={scope:'unselected-goal',signature:'',planContext:'',target:false};}}
    let courses;
    try {courses=ctx.target?courseTasks(state,draft):{tasks:[],unmapped:0,complete:false,valid:false};} catch {error=error||'The current coursework could not be read. Open the degree plan before saving checklist tasks.';courses={tasks:[],unmapped:0,complete:false,valid:false};}
    const saved=object(store.plans[ctx.scope]),items=object(saved.items),profile=object(state.profile),journey=object(state.journey),tasks=[];
    const targetConflict=ctx.target && (draft.targetReviewNeeded===true || list(draft.targetIssues).length>0);
    const curriculumConflict=ctx.target && Boolean(draft.plan) && (draft.plan.validation?.academicCountsValid===false || list(draft.plan.setupIssues).some(issue=>['invalid_selection','selection_conflict'].includes(issue.code)));
    const hardConflict=targetConflict || curriculumConflict;
    const recordsUnresolved=journey.creditsDeferred===true || (journey.answers?.prior!=='none' && (!['none','some','degree'].includes(profile.hasPrior) || profile.hasPrior!=='none' && !list(state.learning).some(item=>item.status==='earned')));
    const legacyDone=new Set();
    if (Journey?.draftSignature && (journey.planReviewed===true&&!own(items,'review-plan') || journey.schoolContacted===true&&!own(items,'request-school-feedback'))) {
      try {
        const full=Journey.draftSignature(state,draft),current=JSON.stringify(academic(JSON.parse(full)));
        for (const [id,flag,key] of [['review-plan','planReviewed','reviewedSignature'],['request-school-feedback','schoolContacted','schoolContactedSignature']]) if (journey[flag]===true && typeof journey[key]==='string' && (Journey.reviewSignatureMatches?Journey.reviewSignatureMatches(journey[key],full,{academicOnly:true}):JSON.stringify(academic(JSON.parse(journey[key])))===current)) legacyDone.add(id);
      } catch { /* Old or malformed review metadata cannot complete a step. */ }
    }
    function add(id,title,detail,group,href,actionLabel,automatic=false,defaultStatus='todo') {
      const prior=object(items[id]),reopened=sensitive.has(id) && prior.status==='done' && prior.signature!==ctx.signature;
      const legacy=!own(items,id)&&legacyDone.has(id);
      const task={id,title,detail,group,href,actionLabel,automatic,canSetStatus:!automatic,status:automatic?defaultStatus:reopened?'todo':prior.status||(legacy?'done':defaultStatus),dueOn:prior.dueOn||'',notes:prior.notes||'',custom:false,kind:automatic?'milestone':'step',reopened,legacy};
      tasks.push(task);return task;
    }
    add('choose-goal','Choose your degree goal','Save the exact school and degree you want to work toward.','preparation','portal.html','Choose a degree',true,ctx.target?'done':'todo');
    const priorRelevant=profile.hasPrior!=='none' || list(state.learning).some(item=>item.status==='earned') || journey.creditsDeferred===true;
    if (priorRelevant) {
      add('gather-records','Gather your learning records','Collect original college, exam and training records. Add the courses you already finished.','preparation','plan.html?task=credits','Review my records');
      if(ctx.target) add('send-transcripts','Send official transcripts','Ask each college or provider to send its official record as your receiving school requires.','school','portal.html?view=school&action=send-transcripts','Prepare transcript request');
    }
    if (['active','veteran','reserve'].includes(profile.militaryStatus)) {
      const air=profile.militaryRecords==='ccaf' || profile.militaryRecords==='not-sure' && ['air-force','space-force'].includes(profile.militaryBranch);
      const label=air?'CCAF transcript':profile.militaryRecords==='other'?'military training records':'Joint Services Transcript (JST)';
      add('military-records','Request your '+label,'Obtain the service record that applies to you and send it with separate college transcripts. The school decides which training counts.','preparation','portal.html?view=school&action=military-records#service-records','Request service record');
    }
    const careers={teacher:'Confirm your teaching jurisdiction, subject, age group, approved preparation and placement requirements.',lawyer:'Confirm the intended jurisdiction and law schools’ admission and recognition requirements.',pilot:'Confirm your flying role, jurisdiction, medical eligibility and flight training requirements.','health-professional':'Confirm the exact health profession, jurisdiction, approved program, clinical placements and board eligibility.'};
    if (careers[profile.goal] || journey.answers?.purpose==='licensed-career') add('professional-entry','Confirm professional entry requirements',(careers[profile.goal]||'Confirm the exact profession, jurisdiction and approved preparation.')+' A degree alone does not establish professional eligibility.','preparation','plan.html?task=next','Review career requirements');
    if (ctx.target) {
    if (!draft.program || !draft.plan || courses.unmapped>0 || !courses.valid) add('get-requirements','DegreeSteps: complete the degree research',courses.unmapped?courses.unmapped+' requirements still need a specific sourced course. DegreeSteps needs to finish this research before recommending those courses.':'DegreeSteps has not established a complete, sourced requirement list for this degree yet. Your saved goal and courses are preserved.','planning','request-plan.html','View degree research');
    add('review-plan',targetConflict?'Review this degree against your goals':curriculumConflict?'Resolve conflicting course choices':'Review your current plan',targetConflict?'This degree conflicts with your saved career, degree-level or study-format choices. Review those preferences before relying on its course plan.':curriculumConflict?'Some course choices or degree counts conflict. Review the affected requirements before relying on this plan.':'Review your selected courses, degree requirements, open checks and source evidence. This step reopens when the academic plan changes.','planning',targetConflict?'portal.html?view=edit':curriculumConflict?'plan.html?task=checks':'portal.html?view=review',targetConflict?'Review my preferences':curriculumConflict?'Resolve course checks':'Review my plan',hardConflict);
    const conditionalMatches=list(draft.plan?.rows).some(row=>row.option?.evidence==='conditional'&&row.status!=='confirmed');
    if(priorRelevant||conditionalMatches){
      add('request-school-feedback',priorRelevant?'Request an official evaluation of your records':'Resolve the specific transfer eligibility conditions',priorRelevant?'Send your original course records for an official evaluation. Published policies and course matches are already included in your plan; ask about your own placements and any specific exceptions.':'Some selected courses have documented eligibility conditions. Review those specific conditions before starting the affected courses.','school','portal.html?view=school','Prepare evaluation request');
      add('review-school-feedback','Record the school’s evaluation','Add the placements from your school’s written evaluation to your course records. Completing this task does not itself record school approval.','school','plan.html?task=checks','Review evaluations');
    }
    const pace=object(draft.program?.pacePolicy),deadline=object(pace.transcriptDeadline),sourceFor=ids=>list(ids).length&&list(ids).every(id=>list(draft.program?.sources).some(source=>source.id===id&&/^https:\/\//i.test(text(source.url))))?list(draft.program.sources).find(source=>list(ids).includes(source.id)):null;
    const calendarSource=pace.startDayOfMonth===1?sourceFor(pace.sourceIds):null;
    if(calendarSource){const task=add('check-application-deadline','Plan your start month','University terms start on the 1st of each month. Choose a start month that leaves time to finish your transfer courses and submit official records. Add your own reminder date.','school',calendarSource.url,'View term dates');task.sources=[{title:calendarSource.title||'Published term dates',url:calendarSource.url}];}
    else add('check-application-deadline','Choose your intended start','Set a start date around your transfer coursework, admission and any financial-aid application. DegreeSteps still needs to add the published deadline schedule for this program.','school','portal.html?view=school&action=check-application-deadline','Plan my start');
    const deadlineSource=pace.transferBeforeInitialTerm===true&&deadline.dayOfMonth===5&&deadline.monthsBeforeStart===1?sourceFor(deadline.sourceIds):null;
    if(deadlineSource){const task=add('check-transfer-deadline','Plan around the transfer deadline','Finish outside courses before your first university term. Official transcripts must arrive by the 5th of the month before you start; transfer credit is not accepted after your initial term begins.','school',deadlineSource.url,'View published transfer deadline');task.sources=[{title:deadlineSource.title||'Published transfer deadline',url:deadlineSource.url}];}
    else add('check-transfer-deadline','Schedule your transcript delivery','Leave time for providers to issue official transcripts before your university start. DegreeSteps still needs to source this program’s exact transfer deadline.','school','portal.html?view=school&action=check-transfer-deadline','Plan transcript delivery');
    for (const course of courses.tasks) {const prior=object(items[course.id]);tasks.push({...course,dueOn:prior.dueOn||'',notes:prior.notes||''});}
    add('finish-coursework','Finish your remaining coursework',draft.plan?'Course completion follows your original course records and the current degree ledger. School acceptance remains a separate check.':'Track completion against your official degree audit and the school’s requirements.','finish','plan.html','Open coursework',Boolean(draft.plan),courses.complete?'done':'todo');
    add('enroll-at-school','Complete school enrollment','Confirm admission, registration, tuition and aid, then enroll in the required school coursework.','finish','portal.html?view=school&action=enroll-at-school','Prepare enrollment questions');
    if (/residential|campus/i.test(text(draft.pathway?.format)+' '+text(draft.program?.format)) || list(draft.pathway?.modalities).includes('campus')) add('campus-arrangements','Check campus attendance and housing arrangements','Confirm attendance requirements, class locations, housing and transport with your school.','finish','portal.html?view=school&action=campus-arrangements','Prepare campus questions');
    const obligations=list(draft.program?.obligations).filter(item=>text(item?.title));
    for (const obligation of obligations.slice(0,20)) {
      const id='obligation-'+hash(text(obligation.id)||text(obligation.title));
      const task=add(id,text(obligation.title),text(obligation.notes)||'Confirm and complete this requirement with your school.','finish','plan.html?task=checks','Review school requirement');
      task.sources=list(obligation.sourceIds).map(id=>list(draft.program?.sources).find(source=>source.id===id)).filter(source=>source&&/^https:\/\//i.test(text(source.url))).map(source=>({title:text(source.title)||'School source',url:source.url}));
      if (task.sources.length) {task.href=task.sources[0].url;task.actionLabel='View school requirement';}
    }
    if (obligations.length>20) add('obligation-overflow','Review '+(obligations.length-20)+' more school requirements','Check the remaining noncourse and graduation requirements in your official degree audit.','finish','plan.html?task=checks','Review school requirements');
    add('apply-to-graduate','Apply for graduation','Request the final degree audit, resolve remaining requirements and submit the school’s graduation application. Your school awards the degree.','finish','portal.html?view=school&action=apply-to-graduate','Prepare graduation questions');
    }
    for (const custom of list(saved.custom)) tasks.push({...copy(custom),detail:'Your private task for this degree plan.',group:'custom',href:'',actionLabel:'',automatic:false,canSetStatus:true,custom:true,kind:'custom'});
    const definitions=[['preparation','Get ready'],['planning','Your plan'],['school','Transfers'],['courses','Coursework'],['finish','Finish'],['custom','Your tasks']];
    const groups=definitions.map(([id,title])=>({id,title,tasks:tasks.filter(task=>task.group===id),collapsed:id==='courses'})).filter(group=>group.tasks.length || group.id==='custom');
    const actionable=task=>['todo','doing'].includes(task.status);
    // Resolve a blocking plan issue or the original-record decision before
    // routine progress. Waiting records and ordinary school tasks can defer.
    const nextTask=tasks.find(task=>task.id==='choose-goal' && actionable(task)) || (hardConflict && tasks.find(task=>task.id==='review-plan' && actionable(task))) || (recordsUnresolved && tasks.find(task=>task.id==='gather-records' && actionable(task))) || tasks.find(task=>task.status==='doing') || tasks.find(task=>task.status==='todo') || tasks.find(task=>task.status==='waiting') || null;
    const progress={done:tasks.filter(task=>task.status==='done').length,total:tasks.length};
    return {...ctx,groups,tasks,nextTask,progress,allDone:progress.total>0&&progress.done===progress.total,valid:!error,error,courseworkValid:courses.valid,customLimit:MAX_CUSTOM};
  }
  function apply(state,draft,action) {
    if (!plain(state)) invalid('Your private plan could not be read. It has not been changed.');
    fields(action,['type','taskId','title','status','dueOn','notes','planContext']);
    if (!['set-task','add-task','delete-task','edit-task'].includes(action.type)) invalid('Choose a valid checklist action.');
    const built=build(state,draft);
    if (!built.valid) invalid(built.error);
    if (action.planContext!==built.planContext) invalid('This degree plan changed. Refresh this page to review the current checklist before saving.');
    const store=storeFor(state),previous=store.plans[built.scope] || {items:{},custom:[],nextId:1};
    const plan=copy(previous);
    for (const task of built.tasks) if (task.legacy===true) plan.items[task.id]={status:'done',signature:built.signature};
    if (action.type==='add-task') {
      if (own(action,'taskId')) invalid('New tasks receive their own private ID.');
      if (plan.custom.length>=MAX_CUSTOM) invalid('Keep up to 50 custom tasks for each degree plan.');
      if (plan.nextId>=999999999999999) invalid('This plan has reached its custom task limit.');
      plan.custom.push({id:'custom-'+plan.nextId++,title:bounded(action.title,160,'task title',true),status:own(action,'status')?status(action.status):'todo',dueOn:own(action,'dueOn')?date(action.dueOn):'',notes:own(action,'notes')?bounded(action.notes,1000,'note'):''});
    } else {
      if (!safeKey(action.taskId)) invalid('Choose a current checklist task.');
      const task=built.tasks.find(item=>item.id===action.taskId);
      if (!task) invalid('This task is no longer in the current degree plan.');
      if ((action.type==='delete-task'||action.type==='edit-task')&&!task.custom) invalid('Only your own custom tasks can be edited or deleted.');
      if (action.type==='delete-task') {
        if (['title','status','dueOn','notes'].some(key=>own(action,key))) invalid('A delete action cannot change task details.');
        plan.custom=plan.custom.filter(item=>item.id!==task.id);
      } else {
        if (own(action,'title')&&!task.custom) invalid('Only your own custom task titles can be edited.');
        if (own(action,'status')&&!task.canSetStatus) invalid('Update this course or goal in its existing progress form. Checklist status cannot change it.');
        const patch={};
        if (own(action,'status')) patch.status=status(action.status);
        if (own(action,'dueOn')) patch.dueOn=date(action.dueOn);
        if (own(action,'notes')) patch.notes=bounded(action.notes,1000,'note');
        if (own(action,'title')) patch.title=bounded(action.title,160,'task title',true);
        if (!Object.keys(patch).length) invalid('Choose a status or change a task detail before saving.');
        if (task.custom) plan.custom=plan.custom.map(item=>item.id===task.id?{...item,...patch}:item);
        else {if (sensitive.has(task.id)&&own(patch,'status')) patch.signature=built.signature;plan.items[task.id]={...object(plan.items[task.id]),...patch};}
      }
    }
    const next=copy(state);
    next.checklist={version:1,plans:{...copy(store.plans),[built.scope]:plan}};
    if(Journey?.compactReviewSignature&&plain(next.journey))for(const key of ['reviewedSignature','schoolContactedSignature'])if(typeof next.journey[key]==='string'){
      try{next.journey[key]=Journey.compactReviewSignature(next.journey[key]);}catch{/* Unrecognized legacy metadata stays unchanged. */}
    }
    if (bytes(next)>MAX_BYTES) invalid('This private workspace is too large to save. Export a backup and remove unused records or tasks before adding more.');
    storeFor(next);
    return next;
  }
  return Object.freeze({build,apply,limits:Object.freeze({maxCustom:MAX_CUSTOM,maxCourseTasks:MAX_COURSES,maxBytes:MAX_BYTES})});
}));
