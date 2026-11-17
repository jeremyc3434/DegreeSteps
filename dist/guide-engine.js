/* DegreeSteps's preloaded guidance rules. No network or AI service is used. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreeGuide = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value.trim() : '';
  const key = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const copy = value => JSON.parse(JSON.stringify(value));
  const choose = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const amount = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const level = value => ({ "bachelor's": 'bachelor', 'bachelors': 'bachelor', "master's": 'master', 'masters': 'master', doctoral: 'doctorate' }[text(value).toLowerCase()] || text(value).toLowerCase());
  const providerKey = value => ({ sophialearning: 'sophia', studycom: 'studycom', collegelevelexaminationprogram: 'clep', jointservicestranscript: 'jst', communitycollegeoftheairforce: 'ccaf' }[key(value)] || key(value));
  const plannerProvider = value => ({ sophia: 'Sophia', studycom: 'Study.com', clep: 'CLEP', dsst: 'DSST', straighterline: 'StraighterLine', saylor: 'Saylor', university: 'University', college: 'College', othercollege: 'College', communitycollege: 'Community college', fouryearcollege: 'Four-year college', institutionaltransfer: 'Institutional transfer' }[providerKey(value)] || text(value));
  const unique = values => [...new Set(values.filter(Boolean))];
  const validDay = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const service = profile => ['active', 'veteran', 'reserve'].includes(profile.militaryStatus);
  const protectedGoals = ['teacher', 'lawyer', 'pilot', 'health-professional'];

  function normalizeProfile(raw) {
    const p = raw || {};
    const result = {
      entry: choose(p.entry, ['explore', 'target', 'audit'], 'explore'),
      goal: choose(p.goal, ['any-degree', 'career-growth', 'change-career', ...protectedGoals], 'any-degree'),
      goalDetail: text(p.goalDetail),
      degreeLevel: choose(level(p.degreeLevel), ['unsure', 'associate', 'bachelor', 'master', 'doctorate', 'specialist'], 'unsure'),
      field: choose(p.field, ['any', 'general', 'business', 'technology', 'science', 'arts', 'humanities', 'social-science', 'education', 'health', 'law', 'aviation'], 'any'),
      school: text(p.school), degree: text(p.degree), pathwayId: text(p.pathwayId),
      modality: choose(p.modality, ['any', 'online', 'campus'], 'any'),
      classroomImportance: choose(p.classroomImportance, ['open', 'preferred', 'essential'], 'open'),
      country: text(p.country).toUpperCase() || 'US', state: text(p.state),
      priority: choose(p.priority, ['balanced', 'speed', 'cost', 'transfer'], 'balanced'),
      weeklyHours: amount(p.weeklyHours), budget: amount(p.budget),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(text(p.deadline)) ? text(p.deadline) : null,
      militaryStatus: choose(p.militaryStatus, ['none', 'active', 'veteran', 'reserve', 'dependent'], 'none'),
      militaryBranch: choose(p.militaryBranch, ['army', 'navy', 'air-force', 'marines', 'coast-guard', 'space-force', 'other'], ''),
      militaryRecords: choose(p.militaryRecords, ['jst', 'ccaf', 'other', 'not-sure'], 'not-sure'),
      militaryOccupation: text(p.militaryOccupation),
      hasPrior: choose(p.hasPrior, ['none', 'some', 'degree', 'unknown'], 'unknown'),
      priorCreditEstimate: amount(p.priorCreditEstimate) || 0,
      assessmentPreference: choose(p.assessmentPreference, ['mixed', 'exams', 'writing', 'projects'], 'mixed'),
      proctoringPreference: choose(p.proctoringPreference, ['open', 'avoid'], 'open')
    };
    if (result.weeklyHours === 0) result.weeklyHours = null;
    return result;
  }

  function steps(raw) {
    const p = normalizeProfile(raw);
    const result = ['start'];
    if (p.entry === 'explore') result.push('goal', 'direction');
    // Keep the selected target editable. Removing an active step when a school
    // is chosen would move the UI back to the start of the flow.
    else result.push('direction');
    result.push('experience');
    if (p.militaryStatus !== 'none') result.push('military');
    return [...result, 'preferences', 'review'];
  }

  const optionCodeKeys = option => unique([option.code, ...list(option.codeAliases)].map(key));
  const matchesCode = (option, code) => Boolean(key(code)) && optionCodeKeys(option).includes(key(code));
  function recordCodeKeys(item) {
    if (!key(item?.code)) return [];
    // Catalog aliases are explicit source identities. A free-text title or a
    // hand-entered alias list is not an equivalency.
    const curated = text(item.catalogCourseId) && ['curated-course-map','provider-listing'].includes(item.codeBasis);
    return unique([item.code,...(curated ? list(item.codeAliases) : [])].map(key));
  }
  const matchesRecord = (option,item) => recordCodeKeys(item).some(code=>optionCodeKeys(option).includes(code));
  function catalogCourseCode(course) {
    const prefixes={sophia:'SOPH',studycom:'SDCM',straighterline:'OOSL',clep:'CLEP',dsst:'DSST'},prefix=prefixes[providerKey(course?.provider)];
    const identifiers=[course?.code,course?.mappingCode,...list(course?.codeAliases)].map(text).filter(Boolean);
    const canonical=prefix&&identifiers.find(code=>new RegExp('^'+prefix+'-\\d{4,}$','i').test(code));
    return canonical||text(course?.code)||text(course?.mappingCode);
  }
  function boundSources(program, ids) {
    const sources = new Map(list(program?.sources).map(source=>[source.id,source]));
    return list(ids).length > 0 && list(ids).every(id=>{try {const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}});
  }
  function resolveRecordIdentity(program,item) {
    if (!text(item?.catalogCourseId)||text(item?.code)&&item.codeBasis!=='curated-course-map') return item;
    const requirements=list(program?.requirements),identity=sourceIdentities(requirements);
    if(text(item.code)&&requirements.some(req=>list(req.options).some(option=>providerKey(option.provider)===providerKey(item.provider)&&matchesCode(option,item.code))))return item;
    const options=requirements.flatMap(req=>list(req.options)).filter(option=>providerKey(option.provider)===providerKey(item.provider)&&text(option.code)&&list(option.listingIdentityIds).includes(item.catalogCourseId)&&boundSources(program,option.listingIdentitySourceIds));
    const identities=new Set(options.map(option=>identity(providerKey(option.provider)+':'+key(option.code))));
    return identities.size===1 ? {...item,code:options[0].code} : item;
  }
  function mappedSourceLimit(option, credits, sourceUnits, receivingUnits) {
    if (sourceUnits === receivingUnits) {
      if (option.sourceCreditSystem && option.sourceCreditSystem !== sourceUnits) return null;
      if (amount(option.sourceCredits) > 0 && Math.abs(Number(option.sourceCredits) - credits) > 0.001) return null;
      return option.bundleId ? Math.min(credits, Number(option.bundleCredits) || credits) : credits;
    }
    // A receiving-school mapping can award a different unit amount. Require its
    // explicit original-source quantity and units; no arithmetic conversion is
    // inferred from a similar title or a unit-system label.
    if (option.sourceCreditSystem !== sourceUnits || option.creditSystem !== receivingUnits || !(amount(option.sourceCredits) > 0) || Math.abs(Number(option.sourceCredits) - credits) > 0.001) return null;
    const receiving = Number(option.bundleId ? option.bundleCredits : option.credits);
    return Number.isFinite(receiving) && receiving > 0 ? receiving : null;
  }
  function futureInterestMenus(program,item) {
    if (!['saved','planned'].includes(item.status)||!recordCodeKeys(item).length||amount(item.credits)===0||item.creditSystem&&!['semester','quarter','competency-unit'].includes(item.creditSystem)) return [];
    const receivingUnits=program.creditSystem||'semester',sources=new Map(list(program.sources).map(source=>[source.id,source]));
    const schoolDomains=new Set(list(program.requirements).flatMap(req=>list(req.sourceIds)).flatMap(id=>{try {const host=new URL(sources.get(id)?.url).hostname;return host.endsWith('.edu')?[host.split('.').slice(-2).join('.')]:[];}catch{return [];}}));
    const official=ids=>list(ids).some(id=>{try {const host=new URL(sources.get(id)?.url).hostname;return [...schoolDomains].some(domain=>host===domain||host.endsWith('.'+domain));}catch{return false;}});
    const current=day=>{if(!validDay(day))return false;const age=Date.now()-Date.parse(day+'T00:00:00Z');return age>=0&&age<=45*86400000;};
    const menus=[];
    for(const req of list(program.requirements))for(const option of list(req.options)){
      if(req.institutionalOnly||option.provider==='University'||option.bundleId||option.evidence!=='published'||option.preapprovalRequired===true||option.eligibilityReview?.eligibleToStart===false||providerKey(option.provider)!==providerKey(item.provider)||!matchesRecord(option,item))continue;
      if(!(amount(req.credits)>0)||Number(option.credits)!==Number(req.credits)||(option.creditSystem||receivingUnits)!==receivingUnits||key(option.receivingCode)!==key(req.code))continue;
      if(!boundSources(program,option.sourceIds)||!official(option.sourceIds)||!boundSources(program,option.identitySourceIds)||!text(option.mappingReviewId)||!current(option.mappingChecked||option.mappingCheckedOn))continue;
      if(amount(item.credits)>0&&amount(option.sourceCredits)>0&&Math.abs(Number(item.credits)-Number(option.sourceCredits))>.001||item.creditSystem&&option.sourceCreditSystem&&item.creditSystem!==option.sourceCreditSystem)continue;
      const placement={requirementId:req.id,optionId:option.id,sourceProvider:plannerProvider(item.provider),code:item.code,title:item.title,status:item.status,creditSystem:receivingUnits,learningId:item.id,projectionBasis:'published-receiving-map',sourceQuantityUnknown:!(amount(item.credits)>0&&['semester','quarter','competency-unit'].includes(item.creditSystem))};
      menus.push({placements:[placement],credits:Number(req.credits)});
    }
    return menus.sort((a,b)=>b.credits-a.credits);
  }
  function collectionMenus(program,item,metadata={}) {
    const knownQuantity=amount(item.credits)>0&&['semester','quarter','competency-unit'].includes(item.creditSystem);
    const known=knownQuantity ? placementMenus(program,{...copy(item),status:'earned',evaluations:[]},metadata,{futureInterest:true}) : [];
    return known.length ? known : futureInterestMenus(program,item);
  }

  function sourceIdentities(requirements) {
    const parents = new Map();
    function find(identity) {
      if (!parents.has(identity)) parents.set(identity, identity);
      if (parents.get(identity) !== identity) parents.set(identity, find(parents.get(identity)));
      return parents.get(identity);
    }
    for (const requirement of requirements) for (const option of list(requirement.options)) {
      const identities = optionCodeKeys(option).map(code => providerKey(option.provider) + ':' + code);
      if (identities.length) find(identities[0]);
      for (const identity of identities.slice(1)) {
        const left = find(identities[0]), right = find(identity);
        if (left !== right) parents.set(right, left);
      }
    }
    const resolve = identity => parents.has(identity) ? find(identity) : identity;
    resolve.known = identity => parents.has(identity);
    return resolve;
  }

  function actionKey(item, sourceIdentity = identity => identity) {
    const provider = providerKey(item.provider || item.sourceProvider);
    if (provider === 'university' && key(item.code)) return provider + ':' + key(item.institution) + ':' + text(item.sourceProgramId) + ':' + key(item.code);
    const codes=recordCodeKeys(item), known=codes.find(code=>sourceIdentity.known?.(provider+':'+code));
    if (codes.length) return sourceIdentity(provider + ':' + (known || codes[0]));
    // A title alone is never an academic match or an earned-credit identity.
    return 'record:' + text(item.id);
  }

  function institutionalIssuer(item) {
    const origins=[item.creditOrigin,item.sourceType].map(key);
    return providerKey(item.provider)==='university'&&Boolean(key(item.institution))&&origins.every(origin=>['','institutional','institutionalcredit','college','collegeissued','regionallyaccredited','university'].includes(origin));
  }
  function originalInstitutionalCourse(program,item) {
    // Destination selections and a generic University provider do not identify
    // the original issuer. An earlier degree at the same school still does.
    return institutionalIssuer(item)&&Boolean(key(program?.school))&&key(item.institution)===key(program.school);
  }
  function activeInstitutionalCourse(program,item) {
    if (!originalInstitutionalCourse(program,item)) return false;
    const policy=program?.residencyPolicy;
    return policy?.creditScope !== 'active-program' || boundSources(program,policy.sourceIds) && item.sourceProgramId===program.id;
  }
  function receivingRecencyYears(program,requirement) {
    const scoped=program?.transferRules?.courseSpecificRecencyYears?.[requirement.code], years=requirement.transferRecencyYears ?? scoped;
    if (years===undefined) return null;
    if (!Number.isFinite(years)||years<=0||scoped!==undefined&&scoped!==years || !boundSources(program,requirement.transferRecencySourceIds || program?.transferRules?.recencySourceIds || program?.transferRules?.sourceIds || requirement.sourceIds)) return {invalid:true};
    return {years};
  }
  function recencyIssue(program,requirement,item,evaluation) {
    if (activeInstitutionalCourse(program,item) || evaluation?.status==='confirmed'&&evaluation.programId===program?.id&&evaluation.requirementId===requirement.id) return null;
    const rule=receivingRecencyYears(program,requirement); if(!rule)return null;
    if(rule.invalid)return 'DegreeSteps needs the source-bound recency rule for '+requirement.code+'.';
    if(!validDay(item.completedOn))return 'Add the original completion date. '+requirement.code+' accepts transfer coursework completed within '+rule.years+' years.';
    const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-rule.years);
    return item.completedOn<cutoff.toISOString().slice(0,10) ? 'Your '+item.completedOn+' course is outside the published '+rule.years+'-year transfer recency rule for '+requirement.code+'. Your original record is retained.' : null;
  }
  function courseRecordEligible(program,requirement,option,item,evaluation,settings={}) {
    if(item.status!=='earned'||settings.futureInterest===true)return true;
    if(recencyIssue(program,requirement,item,evaluation))return false;
    const grades={'A+':4.3,A:4,'A-':3.7,'B+':3.3,B:3,'B-':2.7,'C+':2.3,C:2,'C-':1.7,'D+':1.3,D:1,'D-':0.7,F:0},grade=text(item.grade).toUpperCase();
    // Source course numbers and source-level metadata do not establish the
    // receiving award's level. Only reviewed destination facts activate this rule.
    const receivingUpper=option?.upper===true||evaluation?.upper===true||requirement.upperOnly===true;
    const transferMinimums=originalInstitutionalCourse(program,item)?[]:[program?.transferGradePolicy?.minimumGrade,option?.minimumTransferGrade];
    const minimums=[requirement.minimumGrade,...(receivingUpper?[requirement.minimumGradeWhenUpper]:[]),...transferMinimums].map(value=>text(value).toUpperCase());
    const rules = program?.transferRules;
    if (!originalInstitutionalCourse(program,item) && rules && (rules.businessMinimumGrade || rules.otherCourseMinimumGrade) && Object.prototype.hasOwnProperty.call(grades,grade)) {
      const sources = new Map(list(program.sources).map(source=>[source.id,source]));
      const bound = ids => list(ids).length > 0 && list(ids).every(id=>{try {const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}});
      const business = text(rules.businessMinimumGrade).toUpperCase(), other = text(rules.otherCourseMinimumGrade).toUpperCase();
      if (!bound(rules.sourceIds) || !Object.prototype.hasOwnProperty.call(grades,business) || !Object.prototype.hasOwnProperty.call(grades,other)) return false;
      let scope = bound(requirement.transferGradeScopeSourceIds) ? requirement.transferGradeScope : null;
      if (!scope && bound(rules.gradeScopeSourceIds)) {
        const receivingCode = key(requirement.code), businessCodes = list(rules.businessReceivingCourseCodes).map(key), otherCodes = list(rules.otherReceivingCourseCodes).map(key);
        if (receivingCode && businessCodes.includes(receivingCode) !== otherCodes.includes(receivingCode)) scope = businessCodes.includes(receivingCode) ? 'business' : 'other';
      }
      // A generic "core" category or a source course title does not establish
      // the receiving school's business-grade scope. Until that scope is bound,
      // require a grade satisfying both published rules rather than choosing the
      // more permissive threshold for the student.
      minimums.push(...(scope === 'business' ? [business] : scope === 'other' ? [other] : [business,other]));
    }
    if(['F','W','WF','I','INCOMPLETE'].includes(grade))return false;
    if(Object.prototype.hasOwnProperty.call(grades,grade)&&minimums.some(minimum=>Object.prototype.hasOwnProperty.call(grades,minimum)&&grades[grade]<grades[minimum]))return false;
    if(option?.minScore&&Number.isFinite(item.score)&&item.score<Number(option.minScore))return false;
    // A current recommendation window governs projections. An exact confirmed
    // destination award can preserve an older version already evaluated there.
    const confirmedDestination=evaluation?.status==='confirmed'&&evaluation.programId===program?.id&&evaluation.requirementId===requirement.id;
    if(!confirmedDestination&&item.completedOn&&option?.recommendationStart&&item.completedOn<option.recommendationStart)return false;
    if(!confirmedDestination&&item.completedOn&&option?.recommendationEnd&&item.completedOn>option.recommendationEnd)return false;
    return true;
  }
  function matchInventorySequential(program, learning, settings={}) {
    const requirements = list(program && program.requirements), programId = program && program.id;
    const byId = new Map(requirements.map(req => [req.id, req]));
    // Curated aliases describe one original action even when duplicate records
    // use different identifiers. Identity never crosses provider boundaries.
    const sourceIdentity = sourceIdentities(requirements);
    const completed = [], usedRequirements = new Set(), usedActions = new Set(), matchedIds = new Set();
    const earned = list(learning).filter(item => item && item.status === 'earned');
    const programUnits = program && program.creditSystem || 'semester';
    const eligible=(req,option,item,evaluation)=>courseRecordEligible(program,req,option,item,evaluation,settings);
    // Explicit destination evaluations take precedence over projected mappings.
    const evaluationRank=item=>list(item.evaluations).some(e=>e.programId===programId&&e.status==='confirmed')?4:list(item.evaluations).some(e=>e.programId===programId&&e.status==='reported')?2:item.sourceProgramId===programId?1:0;
    const ordered = [...earned].sort((a,b)=>evaluationRank(b)-evaluationRank(a));
    for (const item of ordered) {
      const action = actionKey(item, sourceIdentity);
      if (usedActions.has(action)) continue;
      const declaredCredits = amount(item.credits), units = item.creditSystem === null ? null : item.creditSystem || 'semester';
      // Zero-credit waivers and administrative completions do not award hours.
      if (declaredCredits === 0) continue;
      const explicit = list(item.evaluations).filter(e => e.programId === programId && ['confirmed', 'reported'].includes(e.status) && byId.has(e.requirementId));
      let allocated = 0, placements = [];
      for (const evaluation of explicit) {
        const req = byId.get(evaluation.requirementId);
        if (usedRequirements.has(req.id) || placements.some(p => p.requirementId === req.id)) continue;
        if(!eligible(req,null,item,evaluation))continue;
        // An explicit school award is required for cross-unit placement. Keep the
        // source units on the inventory and send receiving units to the planner.
        if (units === programUnits && declaredCredits !== null && declaredCredits > 0 && allocated + Number(req.credits) > declaredCredits + 0.001) continue;
        const option = list(req.options).find(o => o.id === evaluation.optionId) || list(req.options).find(o => providerKey(o.provider) === providerKey(item.provider) && matchesRecord(o,item));
        if(!eligible(req,option,item,evaluation))continue;
        const homeSource = providerKey(item.provider) !== 'university' || activeInstitutionalCourse(program,item) && item.sourceProgramId === programId;
        const sameSource = option && homeSource && providerKey(option.provider) === providerKey(item.provider) && (!item.code || matchesRecord(option,item));
        const provenance = !['', 'unknown', 'unknownsource', 'priorlearning'].includes(providerKey(item.provider))&&(providerKey(item.provider)!=='university'||institutionalIssuer(item));
        placements.push({ requirementId: req.id, ...(sameSource ? { optionId: option.id } : {}), ...(provenance ? { sourceProvider: providerKey(item.provider) === 'university' && !homeSource ? 'Institutional transfer' : plannerProvider(item.provider) } : {}), code: text(item.code), title: text(item.title), status: evaluation.status, creditSystem: programUnits, learningId: item.id });
        allocated += Number(req.credits);
      }
      if (placements.length > 1) {
        const options = placements.map(placement => list(byId.get(placement.requirementId).options).find(option => option.id === placement.optionId));
        const reviewedBundle = options[0] && options[0].bundleId && options.every(option => option && option.bundleId === options[0].bundleId);
        if (!reviewedBundle) {
          // These are explicit receiving-school awards, not a projected course
          // menu. Preserve one source action across its evaluated components.
          for (const placement of placements) {
            delete placement.optionId;
            placement.bundleId = 'evaluated:' + programId + ':' + (item.id || action);
            placement.bundleCredits = allocated;
          }
        }
      }
      if(!placements.length&&!explicit.length&&originalInstitutionalCourse(program,item)&&text(item.sourceProgramId)&&key(item.code)&&units===programUnits&&declaredCredits>0){
        const active=activeInstitutionalCourse(program,item);
        const req=requirements.find(req=>!usedRequirements.has(req.id)&&(active||!req.institutionalOnly)&&Number(req.credits)<=declaredCredits+0.001&&eligible(req,null,item)&&list(req.options).some(option=>option.provider==='University'&&option.code&&matchesRecord(option,item)&&!option.selectionRequired&&eligible(req,option,item)));
        const option=req&&list(req.options).find(option=>option.provider==='University'&&option.code&&matchesRecord(option,item)&&!option.selectionRequired&&eligible(req,option,item));
        if(req&&option){placements.push({requirementId:req.id,...(active?{optionId:option.id}:{}),sourceProvider:active?'University':'Institutional transfer',code:item.code,title:item.title,status:'reported',creditSystem:programUnits,learningId:item.id,...(!active?{residencyEligible:false}: {})});allocated=Number(req.credits);}
      }
      if (!placements.length && !explicit.length && key(item.code) && providerKey(item.provider) && units && declaredCredits !== null && declaredCredits > 0) {
        const matches = [];
        for (const req of requirements) {
          if (usedRequirements.has(req.id) || req.institutionalOnly||!eligible(req,null,item)) continue;
          const option = list(req.options).find(o => o.provider !== 'University' && providerKey(o.provider) === providerKey(item.provider) && matchesRecord(o,item) && ['published', 'conditional'].includes(o.evidence) &&eligible(req,o,item)&& (!o.creditSystem || o.creditSystem === programUnits) && mappedSourceLimit(o, declaredCredits, units, programUnits) !== null);
          if (option) matches.push({ req, option });
        }
        for (const { req, option } of matches) {
          // Only a reviewed bundle can project several receiving outputs. A
          // repeated course in a candidate menu must not fill several slots.
          if (placements.length && (!option.bundleId || placements.some(p => p.bundleId !== option.bundleId))) continue;
          const limit = mappedSourceLimit(option, declaredCredits, units, programUnits);
          if (allocated + Number(req.credits) > limit + 0.001) continue;
          placements.push({ requirementId: req.id, optionId: option.id, sourceProvider: plannerProvider(item.provider), code: item.code, title: item.title, status: 'reported', creditSystem: programUnits, learningId: item.id, ...(option.bundleId ? { bundleId: option.bundleId } : {}) });
          allocated += Number(req.credits);
        }
      }
      if (placements.length) {
        for (const placement of placements) { usedRequirements.add(placement.requirementId); completed.push(placement); }
        usedActions.add(action); matchedIds.add(item.id);
        // Duplicate imported copies of an original course are represented once.
        for (const other of earned) if (actionKey(other, sourceIdentity) === action) matchedIds.add(other.id);
      }
    }
    return { completed, unmatched: list(learning).filter(item => !matchedIds.has(item.id)) };
  }

  // Collected courses are preferences for future work, never completed credit.
  // The caller may test each proposed selection against the academic planner.
  function matchCollectionSequential(program, learning, settings = {}) {
    const requirements = list(program && program.requirements), records = list(learning);
    const fixed = settings.optionSelections && typeof settings.optionSelections === 'object' && !Array.isArray(settings.optionSelections) ? copy(settings.optionSelections) : {};
    const optionSelections = {...fixed}, selections = {}, placements = [], matchedIds = new Set();
    const earned = settings.earnedMatch || matchInventory(program, records), occupied = new Set(earned.completed.map(item => item.requirementId));
    const sourceIdentity = sourceIdentities(requirements), usedActions = new Set();
    for (const item of records) if (earned.completed.some(placement => placement.learningId === item.id)) usedActions.add(actionKey(item, sourceIdentity));
    const rank = {'in-progress':0, planned:1, saved:2};
    const candidates = records.filter(item => item && Object.prototype.hasOwnProperty.call(rank, item.status)).slice().sort((a, b) => rank[a.status] - rank[b.status]);
    const available = typeof settings.availableOption === 'function' ? settings.availableOption : () => true;
    const accept = typeof settings.acceptSelection === 'function' ? settings.acceptSelection : () => true;
    for (const item of candidates) {
      const action = actionKey(item, sourceIdentity);
      if (usedActions.has(action)) {
        matchedIds.add(item.id);
        continue;
      }
      if (!recordCodeKeys(item).length) continue;
      if (providerKey(item.provider)==='university'&&(key(item.institution)!==key(program?.school)||item.sourceProgramId!==program?.id)) continue;
      const owners = new Map();
      for (const [requirementId, optionId] of Object.entries(optionSelections)) {
        const option = list(requirements.find(req => req.id === requirementId)?.options).find(option => option.id === optionId);
        if (!option || option.provider === 'University') continue;
        const identity = sourceIdentity(providerKey(option.provider) + ':' + key(option.code));
        if (!owners.has(identity)) owners.set(identity, []);
        owners.get(identity).push({requirementId, option});
      }
      const eligibleRequirements = requirements.filter(req => !occupied.has(req.id)).map(req => ({...req, options:list(req.options).filter(option => {
        if (Object.prototype.hasOwnProperty.call(optionSelections, req.id) && optionSelections[req.id] !== option.id) return false;
        if (!available(req, option)) return false;
        const identity = sourceIdentity(providerKey(option.provider) + ':' + key(option.code));
        return !(owners.get(identity) || []).some(owner => owner.requirementId !== req.id && (!option.bundleId || owner.option.bundleId !== option.bundleId));
      })}));
      const proposed = collectionMenus({...program,requirements:eligibleRequirements},item)[0]?.placements || [];
      if (!proposed.length) continue;
      const trial = {...optionSelections};
      proposed.forEach(placement => { trial[placement.requirementId] = placement.optionId; });
      if (!accept(trial, proposed, item)) continue;
      Object.assign(optionSelections, trial);
      for (const placement of proposed) {
        occupied.add(placement.requirementId);
        if (!Object.prototype.hasOwnProperty.call(fixed, placement.requirementId)) selections[placement.requirementId] = placement.optionId;
        placements.push({requirementId:placement.requirementId, optionId:placement.optionId, learningId:item.id, status:item.status, provider:item.provider, code:item.code, credits:Number(requirements.find(req => req.id === placement.requirementId)?.credits || 0),creditSystem:program.creditSystem||'semester',...(placement.projectionBasis?{projectionBasis:placement.projectionBasis,sourceQuantityUnknown:placement.sourceQuantityUnknown}:{})});
      }
      usedActions.add(action);
      for (const other of candidates) if (actionKey(other, sourceIdentity) === action) matchedIds.add(other.id);
    }
    return {optionSelections, selections, placements, matchedIds:[...matchedIds], unmatched:candidates.filter(item => !matchedIds.has(item.id))};
  }

  // Keep the record-level eligibility rules above as the single source of truth.
  // Assignment only chooses between those reviewed placements; it never creates
  // an equivalency, combines imported quantities, or relocates a school award.
  const assignmentStateLimit = 4096, assignmentValidationLimit = 32, assignmentMenuLimit = 256;
  function placementOption(requirements, placement) {
    return list(requirements.find(req => req.id === placement.requirementId)?.options).find(option => option.id === placement.optionId);
  }
  function awardIdentity(option) {
    if (!option || option.selectionRequired || option.receivingCourseRepeatable) return '';
    return key(option.provider === 'University' ? option.code : option.receivingCode);
  }
  function placementConflicts(requirements, left, right) {
    if (left.requirementId === right.requirementId) return true;
    const a = placementOption(requirements, left), b = placementOption(requirements, right);
    if (awardIdentity(a) && awardIdentity(a) === awardIdentity(b) && (a.provider !== 'University' || b.provider !== 'University')) return true;
    if (a?.bundleId && a.bundleId === b?.bundleId) {
      const identity = sourceIdentities(requirements);
      return identity(providerKey(a.provider)+':'+key(a.code)) !== identity(providerKey(b.provider)+':'+key(b.code));
    }
    return false;
  }
  function placementMenus(program, item, metadata, settings={}) {
    const requirements = list(program?.requirements), singles = [], bundles = new Map();
    for (const req of requirements) {
      if (!list(req.options).some(option => providerKey(option.provider) === providerKey(item.provider) && matchesRecord(option,item))) continue;
      const placement = matchInventorySequential({...program, requirements:[req]}, [item],settings).completed[0];
      if (!placement || !placement.optionId&&placement.sourceProvider!=='Institutional transfer') continue;
      const option = placementOption(requirements, placement);
      const entry = {placements:[placement], credits:Number(req.credits)};
      singles.push(entry);
      if (option?.bundleId) {
        if (!bundles.has(option.bundleId)) bundles.set(option.bundleId, []);
        bundles.get(option.bundleId).push({placement, option, credits:Number(req.credits)});
      }
    }
    const menus = singles.slice();
    for (const components of bundles.values()) {
      let variants = [{placements:[], credits:0, limit:Infinity, bundleCredits:null}];
      for (const component of components) {
        const limit = mappedSourceLimit(component.option, Number(item.credits), item.creditSystem || 'semester', program.creditSystem || 'semester');
        const additions = [];
        for (const variant of variants) {
          if (variant.bundleCredits !== null && variant.bundleCredits !== Number(component.option.bundleCredits)) continue;
          if (variant.credits + component.credits > Math.min(variant.limit, limit) + 0.001 || variant.placements.some(placement => placementConflicts(requirements, placement, component.placement))) continue;
          additions.push({placements:[...variant.placements, component.placement], credits:variant.credits + component.credits, limit:Math.min(variant.limit, limit), bundleCredits:Number(component.option.bundleCredits)});
        }
        variants.push(...additions);
        if (variants.length > assignmentMenuLimit) {
          metadata.menuBounded = true;
          variants.sort((a,b) => b.credits-a.credits);
          variants = variants.slice(0, assignmentMenuLimit);
        }
      }
      menus.push(...variants.filter(variant => variant.placements.length > 1));
    }
    const seen = new Set();
    return menus.filter(menu => {
      const identity = menu.placements.map(placement => placement.requirementId + ':' + placement.optionId).join('|');
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    }).sort((a,b) => b.credits-a.credits);
  }
  function assignCourses(program, groups, reserved, initial, accept, metadata) {
    const requirements = list(program?.requirements), rank = {'in-progress':0, planned:1, saved:2};
    const creditsById = new Map(requirements.map(req => [req.id,Number(req.credits||0)]));
    const score = placements => placements.reduce((total, placement) => {
      const credits = creditsById.get(placement.requirementId) || 0;
      total[0] += credits;
      if (rank[placement.status] === 0) total[1] += credits;
      if (rank[placement.status] === 1) total[2] += credits;
      return total;
    }, [0,0,0]);
    const better = (a,b) => a.some((value,index) => value !== b[index] && a.slice(0,index).every((v,i) => v === b[i]) && value > b[index] + 0.001);
    // Scarce courses first makes the useful solution quick to find. Original
    // record order remains the tie breaker through the incumbent assignment.
    groups.sort((a,b) => a.menus.length-b.menus.length || a.order-b.order);
    const suffix = Array.from({length:groups.length+1}, () => [0,0,0]);
    const remaining = Array.from({length:groups.length+1}, () => [new Set(),new Set(),new Set()]);
    for (let i=groups.length-1;i>=0;i--) {
      const maximum = Math.max(0,...groups[i].menus.map(menu => menu.credits));
      suffix[i] = suffix[i+1].map((value,index) => value + (index === 0 || index === 1 && rank[groups[i].item.status] === 0 || index === 2 && rank[groups[i].item.status] === 1 ? maximum : 0));
      remaining[i] = remaining[i+1].map(set => new Set(set));
      for (const menu of groups[i].menus) for (const placement of menu.placements) {
        remaining[i][0].add(placement.requirementId);
        if (rank[placement.status] === 0) remaining[i][1].add(placement.requirementId);
        if (rank[placement.status] === 1) remaining[i][2].add(placement.requirementId);
      }
    }
    let validationCalls = 0, exploredStates = 0, feasible = true;
    if(accept){validationCalls++;feasible=Boolean(accept(initial));}
    let best = initial.slice(), bestScore = score(best);
    // Keep the evidence-backed incumbent if no degree-feasible assignment can
    // be found (for example an unmet waiver threshold). Do not erase records.
    if(accept&&!feasible&&validationCalls<assignmentValidationLimit){
      validationCalls++;
      if(accept([])){
        best=[];bestScore=score(best);feasible=true;
        warm:for(const group of groups)for(const menu of group.menus){
          if(menu.placements.some(placement=>reserved.some(other=>other.requirementId!==placement.requirementId&&placementConflicts(requirements,other,placement))||best.some(other=>placementConflicts(requirements,other,placement))))continue;
          if(validationCalls>=assignmentValidationLimit){metadata.validationBounded=true;break warm;}
          validationCalls++;const trial=[...best,...menu.placements];
          if(accept(trial)){best=trial;bestScore=score(best);break;}
        }
      }
    }
    const selected = [], compatible = placement => !reserved.some(other => other.requirementId !== placement.requirementId && placementConflicts(requirements, other, placement)) && !selected.some(other => placementConflicts(requirements, other, placement));
    function visit(index, credits) {
      if (exploredStates >= assignmentStateLimit) { metadata.stateBounded = true; return; }
      exploredStates++;
      const currentScore = score(selected);
      const used = new Set(selected.map(placement => placement.requirementId));
      const upper = currentScore.map((value,i) => value + Math.min(suffix[index][i],[...remaining[index][i]].reduce((sum,id) => sum+(used.has(id)?0:creditsById.get(id)||0),0)));
      if (feasible&&!better(upper,bestScore)) return;
      if (index === groups.length) {
        const candidateScore = score(selected);
        if (feasible&&!better(candidateScore, bestScore)) return;
        if (accept) {
          if (validationCalls >= assignmentValidationLimit) { metadata.validationBounded = true; return; }
          validationCalls++;
          // Validate the complete assignment: a rejected partial selection may
          // become valid when another collected course repairs its requirements.
          if (!accept(selected)) return;
        }
        best = selected.slice(); bestScore = candidateScore; feasible=true; return;
      }
      const group = groups[index];
      for (const menu of group.menus) {
        if (!menu.placements.every(compatible)) continue;
        selected.push(...menu.placements);
        visit(index+1, credits+menu.credits);
        selected.length -= menu.placements.length;
        if (metadata.stateBounded) break;
      }
      visit(index+1, credits);
    }
    visit(0,0);
    metadata.exploredStates = exploredStates;
    metadata.validationCalls = validationCalls;
    metadata.stateLimit = assignmentStateLimit;
    metadata.validationLimit = assignmentValidationLimit;
    metadata.bounded = Boolean(metadata.menuBounded || metadata.stateBounded || metadata.validationBounded);
    metadata.feasible=feasible;
    metadata.optimal = !metadata.bounded&&feasible;
    metadata.infeasibilityProven=!metadata.bounded&&!feasible;
    return best;
  }
  function matchInventory(program, learning, settings = {}) {
    const originals=list(learning),records=originals.map(item=>resolveRecordIdentity(program,item)), requirements = list(program?.requirements), sourceIdentity = sourceIdentities(requirements);
    const explicit = item => list(item.evaluations).some(e => e.programId === program?.id && ['confirmed','reported'].includes(e.status) && requirements.some(req => req.id === e.requirementId));
    const earned = records.filter(item => item?.status === 'earned');
    const fixed = matchInventorySequential(program, earned.filter(explicit));
    const usedActions = new Set(fixed.completed.map(placement => actionKey(earned.find(item => item.id === placement.learningId) || {}, sourceIdentity)));
    const occupied = new Set(fixed.completed.map(placement => placement.requirementId)), groups = [], grouped = new Set(), metadata = {};
    // This rank preserves the prior preference for records originating in this
    // exact program when duplicate imported copies describe one original action.
    const ordered = earned.filter(item => !explicit(item)).slice().sort((a,b) => Number(b.sourceProgramId === program?.id)-Number(a.sourceProgramId === program?.id));
    for (const item of ordered) {
      const action = actionKey(item, sourceIdentity);
      if (usedActions.has(action) || grouped.has(action)) continue;
      const menus = placementMenus({...program, requirements:requirements.filter(req => !occupied.has(req.id))}, item, metadata);
      if (!menus.length) continue;
      groups.push({action, item, order:groups.length, menus}); grouped.add(action);
    }
    // Preserve the old deterministic choice on equal-credit assignments.
    const baseline = matchInventorySequential(program, records).completed.filter(placement => !occupied.has(placement.requirementId) && groups.some(group => group.item.id === placement.learningId));
    const initial = [];
    for (const placement of baseline) if (![...fixed.completed,...initial].some(other => placementConflicts(requirements, other, placement))) initial.push(placement);
    const accept = typeof settings.acceptAssignment === 'function' ? placements=>settings.acceptAssignment([...fixed.completed,...placements]) : null;
    const projected = assignCourses(program, groups, fixed.completed, initial, accept, metadata);
    const completed = [...fixed.completed,...projected], matchedActions = new Set(completed.map(placement => actionKey(earned.find(item => item.id === placement.learningId) || {}, sourceIdentity)));
    const matchedIds = new Set(earned.filter(item => matchedActions.has(actionKey(item, sourceIdentity))).map(item => item.id));
    const unmatched=originals.filter(item => !matchedIds.has(item.id)),reviewReasons=unmatched.map(item=>({learningId:item.id,reason:courseReviewReason(program,item)})).filter(item=>item.reason);
    return {completed, unmatched, assignment:metadata,...(reviewReasons.length?{reviewReasons}:{})};
  }
  function courseReviewReason(program,item) {
    if(item?.status!=='earned')return null;
    item=resolveRecordIdentity(program,item);
    const matches=list(program?.requirements).filter(req=>list(req.options).some(option=>providerKey(option.provider)===providerKey(item.provider)&&matchesRecord(option,item)));
    const reasons=matches.map(req=>recencyIssue(program,req,item));
    return reasons.length&&reasons.every(Boolean)?unique(reasons).join(' '):null;
  }
  function matchCollection(program, learning, settings = {}) {
    const originals=list(learning),records=originals.map(item=>resolveRecordIdentity(program,item)), requirements = list(program?.requirements), sourceIdentity = sourceIdentities(requirements);
    const fixed = settings.optionSelections && typeof settings.optionSelections === 'object' && !Array.isArray(settings.optionSelections) ? copy(settings.optionSelections) : {};
    const earned = settings.earnedMatch || matchInventory(program, records), occupied = new Set(earned.completed.map(placement => placement.requirementId));
    const usedActions = new Set(earned.completed.map(placement => actionKey(records.find(item => item.id === placement.learningId) || {}, sourceIdentity)));
    const rank = {'in-progress':0, planned:1, saved:2}, candidates = records.filter(item => item && Object.prototype.hasOwnProperty.call(rank,item.status)).slice().sort((a,b) => rank[a.status]-rank[b.status]);
    const reserved = [...earned.completed,...Object.entries(fixed).filter(([id]) => !occupied.has(id)).map(([requirementId,optionId]) => ({requirementId,optionId}))];
    const available = typeof settings.availableOption === 'function' ? settings.availableOption : () => true;
    const groups = [], grouped = new Set(), metadata = {};
    for (const item of candidates) {
      const action = actionKey(item, sourceIdentity);
      if (usedActions.has(action) || grouped.has(action) || !recordCodeKeys(item).length) continue;
      if (providerKey(item.provider) === 'university' && (key(item.institution) !== key(program?.school) || item.sourceProgramId !== program?.id)) continue;
      const eligible = requirements.filter(req => !occupied.has(req.id)).map(req => ({...req,options:list(req.options).filter(option => {
        if (Object.prototype.hasOwnProperty.call(fixed,req.id) && fixed[req.id] !== option.id || !available(req,option)) return false;
        const identity = sourceIdentity(providerKey(option.provider)+':'+key(option.code));
        return !Object.entries(fixed).some(([id,optionId]) => {
          const owner = placementOption(requirements,{requirementId:id,optionId});
          return id !== req.id && owner && owner.provider !== 'University' && sourceIdentity(providerKey(owner.provider)+':'+key(owner.code)) === identity && (!option.bundleId || option.bundleId !== owner.bundleId);
        });
      })}));
      const menus = collectionMenus({...program,requirements:eligible},item,metadata);
      for (const menu of menus) menu.placements = menu.placements.map(placement => ({...placement,status:item.status}));
      if (!menus.length) continue;
      groups.push({action,item,order:groups.length,menus}); grouped.add(action);
    }
    const baseline = matchCollectionSequential(program,records,{...settings,earnedMatch:earned});
    const initial = [];
    for (const placement of baseline.placements) if (groups.some(group => group.item.id === placement.learningId) && ![...reserved.filter(other => other.requirementId !== placement.requirementId),...initial].some(other => placementConflicts(requirements,other,placement))) initial.push(placement);
    const trialFor = placements => Object.assign({...fixed},...placements.map(placement => ({[placement.requirementId]:placement.optionId})));
    const accept = typeof settings.acceptSelection === 'function' ? placements => settings.acceptSelection(trialFor(placements),placements,records.find(item => item.id === placements[placements.length-1]?.learningId)) : null;
    const selected = assignCourses(program,groups,reserved,initial,accept,metadata), optionSelections = trialFor(selected), selections = {}, placements = [];
    for (const placement of selected) {
      const item = records.find(record => record.id === placement.learningId);
      if (!Object.prototype.hasOwnProperty.call(fixed,placement.requirementId)) selections[placement.requirementId] = placement.optionId;
      placements.push({requirementId:placement.requirementId,optionId:placement.optionId,learningId:placement.learningId,status:item.status,provider:item.provider,code:item.code,credits:Number(requirements.find(req => req.id === placement.requirementId)?.credits || 0),creditSystem:program.creditSystem||'semester',...(placement.projectionBasis?{projectionBasis:placement.projectionBasis,sourceQuantityUnknown:placement.sourceQuantityUnknown}:{})});
    }
    const matchedActions = new Set([...usedActions,...selected.map(placement => actionKey(records.find(item => item.id === placement.learningId),sourceIdentity))]);
    const matchedIds = candidates.filter(item => matchedActions.has(actionKey(item,sourceIdentity))).map(item => item.id);
    return {optionSelections,selections,placements,matchedIds,unmatched:originals.filter(item => Object.prototype.hasOwnProperty.call(rank,item?.status)&&!matchedIds.includes(item.id)),assignment:metadata};
  }

  function migrateLegacy(legacy) {
    const original = legacy && typeof legacy === 'object' ? copy(legacy) : {};
    const fields = original.fields || {}, learning = [], identities = new Map();
    for (const [programId, items] of Object.entries(original.prior || {})) {
      for (const item of list(items)) {
        const provider = text(item.sourceProvider || item.provider) || 'Unknown source';
        // Legacy storage recorded requirement placements, often without source
        // codes. Merge their identical source descriptions while preserving every
        // program-specific evaluation and the untouched backup.
        const identity = providerKey(provider) + ':' + (key(item.code) || 'legacy-title:' + key(item.title)) + ':' + (item.creditSystem || 'semester') + ':' + text(item.completedOn);
        let record = identities.get(identity);
        if (!record || !key(item.code) && !key(item.title)) {
          record = { id: 'legacy-' + (learning.length + 1), provider, code: text(item.code), title: text(item.title) || 'Earlier learning record', credits: amount(item.credits), creditSystem: item.creditSystem || 'semester', completedOn: text(item.completedOn), status: 'earned', evaluations: [], migrated: true };
          identities.set(identity, record); learning.push(record);
        } else if (amount(item.credits) !== null) record.credits = Math.max(record.credits || 0, amount(item.credits));
        if (item.requirementId && ['confirmed', 'reported'].includes(item.status)) {
          const evaluation = { programId, requirementId: item.requirementId, ...(item.optionId ? { optionId: item.optionId } : {}), status: item.status };
          if (!record.evaluations.some(e => e.programId === programId && e.requirementId === evaluation.requirementId)) record.evaluations.push(evaluation);
        }
      }
    }
    return { profile: normalizeProfile({ entry: 'audit', pathwayId: fields.program, priority: fields.priority, hasPrior: learning.length ? 'some' : 'none', goalDetail: fields['student-name'] || '' }), learning, legacyBackup: original };
  }

  // An exact target needs explanations, not the discovery ranker's yes/no
  // filter. Missing metadata is unknown; it is not evidence of incompatibility.
  function assessTarget(raw, pathway, programs) {
    const p = normalizeProfile(raw), route = pathway || {}, conflicts = [], unknowns = [];
    const issue = (bucket, field, title, current, required, allowedValues = [], reason = 'mismatch') => bucket.push({field,title,current,required,allowedValues:[...allowedValues],reason});
    const names = values => values.join(' or ');
    if (p.pathwayId && route.id && ![route.id,route.modelId].includes(p.pathwayId)) issue(conflicts,'pathwayId','Selected degree',p.pathwayId,route.id,[route.id]);
    if (p.school && route.school && key(p.school) !== key(route.school)) issue(conflicts,'school','School',p.school,route.school,[route.school]);
    if (p.degree && route.title && key(p.degree) !== key(route.title)) issue(conflicts,'degree','Degree',p.degree,route.title,[route.title]);
    const targetLevel = level(route.level), stagedCareer = protectedGoals.includes(p.goal) && list(route.goals).includes(p.goal) && list(route.stageLevels).includes(p.degreeLevel);
    if (p.degreeLevel !== 'unsure' && !stagedCareer) {
      if (!targetLevel) issue(unknowns,'degreeLevel','Degree level needs confirmation',p.degreeLevel,'Verified degree level',[],'not-listed');
      else if (targetLevel !== p.degreeLevel) issue(conflicts,'degreeLevel','Degree level',p.degreeLevel,targetLevel,[targetLevel]);
    }
    const fields = unique([route.field,...list(route.fields)]);
    if (p.field !== 'any') {
      if (!fields.length) issue(unknowns,'field','Subject needs confirmation',p.field,'Verified program subject',[],'not-listed');
      else if (!fields.includes(p.field)) issue(conflicts,'field','Subject',p.field,names(fields),fields);
    }
    let modalities = unique(list(route.modalities).filter(value=>['online','campus'].includes(value))), formatBasis = modalities.length ? 'catalog' : 'unknown';
    const available = Array.isArray(programs) ? programs : Object.values(programs || {}), model = available.find(item=>item?.id === route.modelId);
    // A source-cited exact course model may supply delivery metadata omitted by
    // the directory. Student preferences never become program metadata.
    const citedModel = model && list(model.sources).some(source=>{try {const u=new URL(source.url);return u.protocol==='https:'&&(u.hostname.endsWith('.edu')||u.hostname==='smartcatalogiq.com'||u.hostname.endsWith('.smartcatalogiq.com'));} catch {return false;}});
    if (!modalities.length && citedModel) {
      modalities = unique(list(model.modalities).filter(value=>['online','campus'].includes(value)));
      if (!modalities.length && /^online$/i.test(text(model.format))) modalities = ['online'];
      if (!modalities.length && /^(?:residential|campus|on campus)$/i.test(text(model.format))) modalities = ['campus'];
      if (modalities.length) formatBasis = 'course-model';
    }
    if (!modalities.length) issue(unknowns,'modality','Study format needs confirmation',p.classroomImportance === 'essential' ? 'campus' : p.modality,'Verified program delivery format',[],'not-listed');
    else {
      if (p.modality !== 'any' && !modalities.includes(p.modality)) issue(conflicts,'modality','Study format',p.modality,names(modalities),modalities);
      if (p.classroomImportance === 'essential' && !modalities.includes('campus')) issue(conflicts,'classroomImportance','In-person learning',p.classroomImportance,'A program with campus study',['open','preferred']);
    }
    const goals = list(route.goals);
    if (protectedGoals.includes(p.goal) && !goals.length) issue(unknowns,'goal','Career preparation needs confirmation',p.goal,'Verified preparation for the chosen profession',[],'not-listed');
    else if ((protectedGoals.includes(p.goal) || goals.length) && !goals.includes(p.goal)) issue(conflicts,'goal','Career goal',p.goal,names(goals),goals);
    return {conflicts,unknowns,modalities,formatBasis,curriculumSourced:Boolean(citedModel)};
  }

  function recommend(raw, catalog, programs, learning) {
    const p = normalizeProfile(raw), available = Array.isArray(programs) ? programs : Object.values(programs || {});
    return list(catalog && catalog.pathways).map((pathway, index) => {
      const reasons = [], modalities = list(pathway.modalities), fields = unique([pathway.field, ...list(pathway.fields)]);
      if (p.pathwayId && pathway.id !== p.pathwayId) return null;
      if (p.school && key(pathway.school) !== key(p.school)) return null;
      if (p.degree && key(pathway.title) !== key(p.degree)) return null;
      if (p.degreeLevel !== 'unsure' && level(pathway.level) !== p.degreeLevel && !(protectedGoals.includes(p.goal) && list(pathway.goals).includes(p.goal) && list(pathway.stageLevels).includes(p.degreeLevel))) return null;
      if (p.field !== 'any' && !fields.includes(p.field)) return null;
      if (p.modality !== 'any' && !modalities.includes(p.modality)) return null;
      if (p.classroomImportance === 'essential' && !modalities.includes('campus')) return null;
      if (protectedGoals.includes(p.goal) && !list(pathway.goals).includes(p.goal)) return null;
      if (!protectedGoals.includes(p.goal) && list(pathway.goals).length && !list(pathway.goals).includes(p.goal)) return null;
      const model = available.find(program => program && program.id === pathway.modelId);
      let score = 10;
      if (p.pathwayId || p.school || p.degree) { score += 100; reasons.push('Keeps your selected school and degree in view.'); }
      if (protectedGoals.includes(p.goal)) { score += 30; reasons.push('Includes the academic stages and professional requirements for your stated career.'); }
      if (p.degreeLevel !== 'unsure' && level(pathway.level) !== p.degreeLevel) reasons.push('This career-stage guide covers your selected level; it is not a verified exact degree template at that level.');
      if (p.classroomImportance === 'preferred' && modalities.includes('campus')) { score += 15; reasons.push('Offers a campus route consistent with your classroom preference.'); }
      if (p.modality !== 'any') reasons.push('Fits your ' + (p.modality === 'campus' ? 'on-campus' : 'online') + ' study preference.');
      if (model) {
        score += 8;
        const matched = matchInventory(model, learning), credits = matched.completed.reduce((sum, item) => sum + Number(list(model.requirements).find(req => req.id === item.requirementId)?.credits || 0), 0);
        if (credits) { score += Math.min(30, credits / 3); reasons.unshift(credits + ' existing credits have destination-specific placements to review; confirmation remains program-specific.'); }
        reasons.push('Includes a course-level draft that can be checked against your inventory.');
      }
      const mechanisms = list(pathway.mechanisms).join(' ').toLowerCase();
      if (['cost', 'speed'].includes(p.priority) && /competency|flat.rate|flexible|outside/.test(mechanisms)) { score += 3; reasons.push('Uses completion mechanisms worth comparing for your ' + (p.priority === 'cost' ? 'cost' : 'time') + ' priority; total cost and finish dates still need inputs.'); }
      if (p.priority === 'transfer' && /prior|transfer|elective|outside/.test(mechanisms)) score += 3;
      if (!reasons.length) reasons.push(pathway.summary || 'Fits your selected degree level and field.');
      reasons.push('Profile fit is provisional; admission, location and individual credit awards require confirmation.');
      return { pathway, score, reasons: unique(reasons), eligible: true, ...(model ? { model } : {}), _order: index };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a._order - b._order).map(({ _order, ...candidate }) => candidate);
  }

  function buildGuidance(raw, pathway, learning, catalog, context = {}) {
    const p = normalizeProfile(raw), route = pathway || {}, information = catalog || {};
    // A catalog card can outlive the research it originally described. Once a
    // real course plan exists, its current ledger drives the student's guidance.
    const program = context && context.program, plan = context && context.plan;
    const modeled = program && plan && program.id === (route.modelId || route.id) && plan.programId === program.id && plan.validation?.academicCountsValid === true;
    const career = list(information.careerGoals).find(goal => goal.id === p.goal);
    const careerNotes = [...list(career && career.advice)];
    if (p.goal === 'teacher') careerNotes.push('Confirm the intended jurisdiction, teaching subject and age group, approved preparation, supervised classroom placement and licensing assessments. Online academics may still require in-person classroom practice.');
    if (p.goal === 'lawyer') careerNotes.push('Keep undergraduate completion, target law-school admission, qualifying legal education, and admission to practice as separate gates. Confirm accepted credit and recognition with the target schools and jurisdiction.');
    if (p.goal === 'pilot') careerNotes.push('Choose the flying role and jurisdiction, then check medical eligibility, required certificates, flight training and flight-hour experience. Academic degree credit does not award flight qualifications.');
    if (p.goal === 'health-professional') careerNotes.push('Confirm the exact licensed profession, approved program, clinical placements, science/lab prerequisites and board eligibility. A general degree alone does not establish professional eligibility.');
    if (p.country !== 'US') careerNotes.push('Confirm recognition, admission and professional requirements in ' + p.country + '; the current library primarily researches US pathways.');
    if (['master', 'doctorate', 'specialist'].includes(p.degreeLevel)) careerNotes.push('Verify the required prior degree, accepted graduate transfer, grade/age limits and program-specific residency. Undergraduate alternative credit does not automatically satisfy graduate work.');
    if (p.degreeLevel === 'doctorate') careerNotes.push('Reserve research approval, dissertation or applied doctoral work, supervision and any required defense in the calendar.');
    const militaryNotes = [];
    if (service(p)) {
      const airRecord = p.militaryRecords === 'ccaf' || p.militaryRecords === 'not-sure' && ['air-force', 'space-force'].includes(p.militaryBranch);
      if (airRecord) militaryNotes.push('Locate your CCAF / Air University and other college transcripts and use current official transcript procedures. Keep the original source; the receiving school determines degree placement.');
      else if (p.militaryRecords === 'jst' || p.militaryRecords === 'not-sure') militaryNotes.push('Request your Joint Services Transcript (JST) when applicable to your service, plus separate college transcripts. ACE recommendations and occupational codes do not automatically become degree credit.');
      else militaryNotes.push('Collect your service learning record and separate college transcripts. Ask the receiving university how each original award is classified and placed.');
      if (['active', 'reserve'].includes(p.militaryStatus)) militaryNotes.push('Check current tuition assistance and DANTES exam eligibility before paying, including approval and reimbursement rules. Funding is not assumed in this draft.');
      militaryNotes.push('Compare your actual VA education-benefit eligibility, school/program approval and delivery format before using benefits. No payment, housing allowance or benefit entitlement is assumed.');
      if (key(route.school).includes('thomasedison')) militaryNotes.push('TESU has military-specific residency rules. Its current course model uses the standard nonmilitary path; obtain the residency rule for your actual student status before relying on that minimum.');
    } else if (p.militaryStatus === 'dependent') {
      militaryNotes.push('Check your own eligibility for transferred VA education benefits, survivor/dependent assistance, and school or state programs. A family connection does not establish an award or amount.');
      militaryNotes.push('Add only learning you personally earned. A sponsor’s JST, occupational training or military residency status does not become your academic credit.');
    }
    const selectedTips = list(information.tips).filter(tip => (!list(tip.goals).length || tip.goals.includes(p.goal)) && (!list(tip.military).length || tip.military.includes(p.militaryStatus)) && (!list(tip.modalities).length || tip.modalities.includes(p.modality) || p.modality === 'any' && tip.modalities.some(value => list(route.modalities).includes(value))) && (!list(tip.levels).length || tip.levels.includes(p.degreeLevel)));
    const tips = selectedTips.map(tip => ({ ...tip }));
    if (!tips.length) tips.push(modeled ? { title: 'Keep your plan up to date', text: 'Save courses you want to take, mark your progress and add any courses you have already finished.' } : { title: 'Use your existing learning first', text: 'Add your original course records so their exact degree placements can be checked.' });
    const assessmentTips = {
      exams: { id: 'assessment-exams', title: 'Compare approved exam options', text: 'Use exam-based options where the receiving school approves the award and placement. Check score thresholds, exam availability, preparation needs, proctoring and fees before choosing; an exam preference does not establish transfer approval.' },
      writing: { id: 'assessment-writing', title: 'Plan around writing and feedback', text: 'Compare the actual assessment breakdown before choosing a source. Stagger writing-intensive courses, start drafts early and allow for grading or revision queues. Confirm which approved alternatives use writing in place of exams.' },
      projects: { id: 'assessment-projects', title: 'Look for suitable applied projects', text: 'Review course rubrics and approved project-based or competency assessments. Choose work that supports your goal, check prerequisites and feedback cycles, and confirm tuition-term rules before adding more projects.' }
    };
    if (assessmentTips[p.assessmentPreference]) tips.push(assessmentTips[p.assessmentPreference]);
    if (p.budget !== null) tips.push({ id: 'personal-budget', title: 'Compare your plan with your budget', text: modeled ? 'Your remaining budget is $' + p.budget.toLocaleString('en-US') + '. Compare it with this plan’s cost estimate. Add your expected study pace and any personal charges to complete the estimate; funding and discounts have not been deducted.' : 'Your entered remaining budget is $' + p.budget.toLocaleString('en-US') + '. Treat this as your target until current tuition, fees, subscriptions, records and any campus or professional costs are quoted. Unconfirmed funding has not been deducted, and this draft does not establish that a route fits the budget.' });
    if (p.deadline) tips.push({ id: 'personal-deadline', title: 'Check the calendar against your finish target', text: modeled ? 'Your finish target is ' + p.deadline + '. Set your intended start and study pace to compare the remaining work with that goal. Your personal completion estimate is separate from the published program rules.' : 'Your entered finish target is ' + p.deadline + '. Confirm admissions, prerequisite order, term starts, course availability, grading, transcript deadlines and graduation/conferral dates before treating it as feasible. This target is not a promised graduation date.' });
    if (p.weeklyHours !== null && p.weeklyHours <= 5) tips.push({ id: 'manageable-workload', title: 'Start with a manageable batch', text: 'You entered ' + p.weeklyHours + ' study hours per week. Start with one approved course or exam-preparation task at a time, then check its actual workload and feedback delays before adding another. No course completion rate has been assumed.' });
    if (p.priorCreditEstimate && !list(learning).length) tips.unshift({ title: 'Your rough credit estimate stays separate', text: 'The estimate helps describe your starting point. It has not been subtracted from a degree or treated as an accepted award.' });
    if (p.proctoringPreference === 'avoid') tips.push({ title: 'Review assessment formats before choosing', text: 'Avoiding an exam source does not establish that university courses are unproctored. Confirm the actual assessment format for each remaining option.' });
    const personalTipOrder = ['assessment-' + p.assessmentPreference, 'personal-budget', 'personal-deadline', 'manageable-workload'];
    const tipOrder = tip => personalTipOrder.includes(tip.id) ? personalTipOrder.indexOf(tip.id) : personalTipOrder.length;
    tips.sort((a, b) => tipOrder(a) - tipOrder(b));
    const nextActions = [];
    if (protectedGoals.includes(p.goal)) nextActions.push(p.goal === 'pilot' ? 'Confirm the flying role, jurisdiction and medical/training requirements before selecting degree and flight spending.' : p.goal === 'lawyer' ? 'Check the intended jurisdiction and target law schools’ admission and recognition requirements.' : p.goal === 'teacher' ? 'Choose the teaching jurisdiction, subject and age group; confirm approved preparation and placement requirements.' : 'Choose the exact health profession and jurisdiction; confirm approved program and clinical eligibility.');
    if (service(p)) nextActions.push(militaryNotes[0]);
    nextActions.push(...list(modeled ? plan.nextActions : route.proposedActions));
    if (!nextActions.length) nextActions.push('Choose the exact degree you want to build.', 'Add any courses you have already finished.', 'Open your course plan.');
    if (!modeled && nextActions.length < 3) nextActions.push('Add your previous courses to personalize the remaining work.');
    const milestones = modeled ? [
      protectedGoals.includes(p.goal) ? 'Choose the degree and required career preparation.' : 'Choose your degree.',
      'Add your previous courses and track their school evaluation.',
      'Complete the outside courses in your plan.',
      'Send official transcripts and track their arrival.',
      'Finish your remaining university courses and any required placements.',
      'Reconcile your school degree audit and apply for graduation.'
    ] : list(route.milestones).length ? [...route.milestones] : [
      protectedGoals.includes(p.goal) ? 'Confirm career-entry requirements, admission and the exact degree/catalog.' : 'Confirm the goal, admission requirements and exact degree/catalog.',
      'Evaluate existing learning and allocate unique applicable awards.',
      'Approve remaining outside work and preserve required university subsets.',
      'Complete approved outside work and send official records.',
      'Complete required university courses, placements or research.',
      'Reconcile the official degree audit, finish career gates, and confirm graduation/conferral.'
    ];
    const units = program?.creditSystem === 'competency-unit' ? 'competency units' : program?.creditSystem === 'quarter' ? 'quarter credits' : 'credits';
    const conditional = modeled ? Number(plan.coverage?.conditionalExternalCredits || 0) : 0;
    const summary = modeled ? 'Your ' + program.totalCredits + '-' + (units === 'competency units' ? 'CU' : 'credit') + ' course plan includes ' + plan.totals.external + ' ' + units + ' from outside courses and ' + plan.totals.institutional + ' at ' + program.school + '.' + (conditional ? ' DegreeSteps is still reviewing the conditions for ' + conditional + ' outside ' + units + '.' : '') : route.summary || 'A provisional route built around your saved goal and preferences.';
    return { title: route.title || 'Your degree route', summary, tips, nextActions: unique(nextActions).slice(0, 3), milestones, careerNotes: unique(careerNotes), militaryNotes: unique(militaryNotes), ...(modeled ? {researchTasks:copy(list(plan.researchTasks)),personalTasks:copy(list(plan.personalTasks)),resolvedNotes:copy(list(plan.resolvedNotes))} : {}) };
  }

  return Object.freeze({ normalizeProfile, steps, matchInventory, matchCollection, migrateLegacy, assessTarget, recommend, buildGuidance, catalogCourseCode, courseReviewReason, resolveRecordIdentity });
}));
