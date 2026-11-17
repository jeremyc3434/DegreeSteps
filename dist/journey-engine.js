/* Pure portal journey adapter. Private v3 learning and per-program choices stay intact. */
(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./sheet-state.js') : root.DegreeSheet,
    common ? require('./guide-engine.js') : root.DegreeGuide,
    common ? require('./planner.js') : root.DegreePlanner);
  if (common) module.exports = api;
  else root.DegreeJourney = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Sheet, Guide, Planner) {
  'use strict';
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = value => typeof value === 'string' ? value.trim() : '';
  const key = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const own = (value, name) => Object.prototype.hasOwnProperty.call(object(value), name);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const pathways = catalog => list(Array.isArray(catalog) ? catalog : catalog?.pathways);
  const asCatalog = catalog => Array.isArray(catalog) ? {pathways:catalog} : object(catalog);
  const programs = models => Array.isArray(models) ? models : Object.values(object(models));
  const service = status => ['active', 'veteran', 'reserve'].includes(status);
  const protectedGoals = ['teacher', 'lawyer', 'pilot', 'health-professional'];
  const fields = ['any', 'general', 'business', 'technology', 'science', 'arts', 'humanities', 'social-science', 'education', 'health', 'law', 'aviation'];
  const knownProctored = new Set(['CLEP', 'StraighterLine', 'Saylor', 'DSST']);
  const questionIds = ['start', 'school', 'degree', 'about', 'purpose', 'career', 'level', 'field', 'format', 'prior', 'military', 'military-records', 'priority', 'routes', 'review'];
  const parse = value => {if (typeof value !== 'string') return value; try {return JSON.parse(value);} catch (_) {return null;}};
  const enumValue = (value, values, label) => {
    if (!values.includes(value)) throw new Error('Choose a valid ' + label + '.');
    return value;
  };
  function cleanText(value, max, label) {
    const result = text(value).replace(/[\u0000-\u001f\u007f]/g, '');
    if (!result || result.length > max) throw new Error('Enter a valid ' + label + '.');
    return result;
  }
  function metadata(state, fallback = {}) {
    const previous = object(state?.journey);
    return {...copy(previous), version:1,
      view:['questions', 'home'].includes(previous.view) ? previous.view : fallback.view || 'questions',
      step:questionIds.includes(previous.step) ? previous.step : 'start',
      answers:copy(object(previous.answers)),
      completed:typeof previous.completed === 'boolean' ? previous.completed : Boolean(fallback.completed),
      creditsDeferred:previous.creditsDeferred === true};
  }
  function routeFor(state, catalog) {
    if (state?.sheet?.isExample) return null;
    if (Sheet.targetRoute) return Sheet.targetRoute(state,catalog);
    const p = object(state?.profile), id = text(state?.selectedPathwayId) || text(p.pathwayId);
    return pathways(catalog).find(route => route.id === id || route.modelId && route.modelId === id)
      || pathways(catalog).find(route => p.school && p.degree && key(route.school) === key(p.school) && key(route.title) === key(p.degree)) || null;
  }
  function clearTarget(state) {
    delete state.targetIdentity;
    state.selectedPathwayId = '';
    state.profile = {...state.profile, school:'', schoolChoice:'', degree:'', pathwayId:'', field:'any'};
    state.sheet = {...object(state.sheet), isExample:false};
    return state;
  }
  function initialize(savedV3, legacyV2, catalog) {
    const saved = parse(savedV3), legacy = parse(legacyV2);
    const validSaved = saved?.version === 3 && saved.profile && Array.isArray(saved.learning);
    const source = validSaved ? saved : null;
    const sourceProfile = object(source?.profile);
    const hasTarget = source ? Boolean(text(source.selectedPathwayId) || text(sourceProfile.pathwayId) || text(sourceProfile.school) || text(sourceProfile.schoolChoice) || text(sourceProfile.degree))
      : Boolean(text(legacy?.fields?.program));
    const example = source?.sheet?.isExample === true || !hasTarget;
    let state = Sheet.initialize(source, legacy, asCatalog(catalog));
    // Sheet defaults its first worksheet to TESU. That sample is never an answer
    // to the portal's first question, including on a second fresh-device load.
    if (example) {
      state = clearTarget(state);
      state.profile = {...state.profile, entry:own(sourceProfile, 'entry') && source?.journey ? sourceProfile.entry : 'explore', degreeLevel:source?.journey ? sourceProfile.degreeLevel || 'unsure' : 'unsure'};
    } else if (source) {
      // Sheet's target resolver may canonicalize names; preserve all real user
      // preferences (notably career-stage level, goal, and classroom format).
      const selected = state.selectedPathwayId;
      state.profile = {...state.profile, ...copy(sourceProfile), ...(selected && selected !== 'custom-target' ? {pathwayId:selected} : {})};
    }
    state.journey = metadata(source || state, {view:example ? 'questions' : 'home', completed:!example});
    if (example && !source?.journey) state.journey = metadata({});
    return state;
  }
  function questions(state, catalog) {
    const j = metadata(state), a = j.answers, p = object(state.profile), route = routeFor(state, catalog);
    const entry = a.start || p.entry || 'explore', result = ['start'];
    if (entry === 'target') {
      if (!route || own(a, 'school')) result.push('school');
      if ((text(p.school) || text(p.schoolChoice) || own(a, 'degree')) && (!route || own(a, 'degree'))) result.push('degree');
    }
    result.push('purpose');
    if (a.purpose === 'licensed-career' || !own(a, 'purpose') && protectedGoals.includes(p.goal)) result.push('career');
    if (!route || own(a, 'level')) result.push('level');
    if ((!route || own(a, 'field')) && a.purpose !== 'licensed-career' && !protectedGoals.includes(p.goal)) result.push('field');
    const schoolRoutes = pathways(catalog).filter(item => p.school && key(item.school) === key(p.school));
    const modalities = [...new Set((route ? list(route.modalities) : schoolRoutes.flatMap(item => list(item.modalities))).filter(Boolean))];
    const formatConflict = p.modality && p.modality !== 'any' && modalities.length && !modalities.includes(p.modality)
      || p.classroomImportance === 'essential' && modalities.length && !modalities.includes('campus');
    if (!modalities.length || modalities.length > 1 || own(a, 'format') || formatConflict) result.push('format');
    result.push('prior', 'military');
    if (service(a.military || p.militaryStatus)) result.push('military-records');
    result.push('priority');
    if (entry === 'explore' || !route || a.degree === 'unknown' || own(a, 'routes') && !own(a, 'degree')) result.push('routes');
    result.push('review');
    return result;
  }
  function unresolvedCareer(state) {
    const a = object(state?.journey?.answers);
    return a.purpose === 'licensed-career' && !protectedGoals.includes(a.career);
  }
  function recommend(state, catalog, models) {
    if (unresolvedCareer(state)) return [];
    const profile = {...object(state.profile)};
    if (state.journey?.answers?.purpose === 'licensed-career' || protectedGoals.includes(profile.goal)) profile.field = 'any';
    if (state.journey?.answers?.start === 'explore') Object.assign(profile, {pathwayId:'', school:'', degree:''});
    return Guide.recommend(profile, asCatalog(catalog), programs(models), list(state.learning));
  }
  function applyAnswer(previous, id, value, catalog) {
    if (!questionIds.includes(id)) throw new Error('Choose a valid journey question.');
    let state = copy(previous);
    state.profile = {...object(state.profile)};
    state.journey = metadata(state);
    const p = state.profile, j = state.journey, a = j.answers;
    let answer = value;
    switch (id) {
      case 'start': {
        answer = enumValue(value, ['explore', 'target', 'audit'], 'starting point');
        if ((a.start || p.entry) !== answer) {
          ['school', 'degree', 'routes', 'review'].forEach(name => delete a[name]);
          if (answer !== 'audit') clearTarget(state);
        }
        // Bringing previous work is not a request to discard an existing goal.
        // A new learner can collect courses without choosing a destination.
        if (answer === 'audit') {
          state.profile.hasPrior = 'some';
          a.prior = 'some';
        }
        // Every explicit target entry exposes the target editor, including when
        // the learner chooses the same starting-point answer while editing.
        if (answer === 'target' && routeFor(state, catalog)) {
          a.school = state.profile.school;
          a.degree = state.selectedPathwayId || state.profile.degree;
        }
        state.profile.entry = answer;
        break;
      }
      case 'school': {
        const supplied = typeof value === 'object' ? value?.school : value;
        const unknown = ['unknown', 'not-sure', '__unknown__'].includes(supplied);
        const school = unknown ? '' : cleanText(supplied, 120, 'school');
        answer = unknown ? 'unknown' : pathways(catalog).find(route => key(route.school) === key(school))?.school || school;
        if (key(p.school) !== key(school)) {
          clearTarget(state);
          delete a.degree; delete a.routes; delete a.review;
        }
        state.profile.school = unknown ? '' : answer;
        state.profile.schoolChoice = state.profile.school;
        break;
      }
      case 'degree': {
        const requested = typeof value === 'object' ? value?.pathwayId || value?.degree : value;
        if (['unknown', 'not-sure', '__unknown__'].includes(requested)) {
          delete state.targetIdentity;
          state.profile.degree = '';
          state.profile.pathwayId = '';
          state.selectedPathwayId = '';
          state.sheet = {...object(state.sheet), isExample:false};
          delete a.routes; delete a.review;
          answer = 'unknown';
          break;
        }
        const candidate = pathways(catalog).find(route => route.id === requested || route.modelId && route.modelId === requested || p.school && key(route.school) === key(p.school) && key(route.title) === key(requested));
        if (candidate && p.school && key(candidate.school) !== key(p.school)) throw new Error('Choose a degree at your selected school.');
        if (candidate) {
          state = selectRoute(state, candidate, catalog);
          answer = candidate.id;
        } else {
          if (typeof value !== 'object' || value?.allowUnlisted !== true) throw new Error('Choose a degree from the results, or use “My degree is not listed” to enter an exact target.');
          const degree = cleanText(typeof value === 'object' ? value?.degree : value, 160, 'degree');
          if (!text(p.school)) throw new Error('Choose your school before entering its exact degree.');
          state.profile = {...p, degree, pathwayId:'custom-target'};
          delete state.targetIdentity;
          state.selectedPathwayId = 'custom-target';
          state.sheet = {...object(state.sheet), isExample:false};
          answer = degree;
        }
        break;
      }
      case 'purpose': {
        answer = enumValue(value, ['any-degree', 'career-growth', 'change-career', 'licensed-career'], 'degree purpose');
        if (answer !== 'licensed-career') {
          p.goal = answer;
          delete a.career;
          if (fields.includes(a.field)) p.field = a.field;
        } else if (!protectedGoals.includes(a.career)) {
          // This temporary UI category is resolved by the next answer. The
          // wrapper withholds recommendations until a real career is known.
          p.goal = 'any-degree';
        }
        break;
      }
      case 'career':
        answer = enumValue(value, [...protectedGoals, 'other'], 'career');
        if (a.purpose !== 'licensed-career') throw new Error('Choose a licensed-career purpose first.');
        p.goal = protectedGoals.includes(answer) ? answer : 'any-degree';
        break;
      case 'level':
        answer = enumValue(value, ['unsure', 'associate', 'bachelor', 'master', 'doctorate', 'specialist'], 'degree level');
        p.degreeLevel = answer;
        break;
      case 'field':
        answer = enumValue(['unknown', 'not-sure', '__unknown__'].includes(value) ? 'any' : value, fields, 'field of study');
        p.field = answer;
        break;
      case 'format': {
        const format = typeof value === 'object' ? value : {modality:value};
        const modality = enumValue(format.modality, ['any', 'online', 'campus'], 'study format');
        const classroomImportance = format.classroomImportance === undefined ? p.classroomImportance || 'open' : enumValue(format.classroomImportance, ['open', 'preferred', 'essential'], 'classroom preference');
        p.modality = modality;
        p.classroomImportance = classroomImportance;
        answer = typeof value === 'object' ? {modality, classroomImportance} : modality;
        break;
      }
      case 'prior':
        answer = enumValue(value, ['none', 'some', 'degree', 'unknown'], 'prior learning');
        p.hasPrior = answer;
        if (answer === 'none') j.creditsDeferred = false;
        break;
      case 'military':
        answer = enumValue(value, ['none', 'active', 'veteran', 'reserve', 'dependent'], 'military connection');
        p.militaryStatus = answer;
        if (!service(answer)) delete a['military-records'];
        break;
      case 'military-records': {
        if (!service(p.militaryStatus)) throw new Error('Service records apply to your own military service.');
        const values = typeof value === 'object' ? value : {militaryRecords:value};
        p.militaryRecords = enumValue(values.militaryRecords, ['jst', 'ccaf', 'other', 'not-sure'], 'service record');
        if (values.militaryBranch !== undefined) p.militaryBranch = enumValue(values.militaryBranch, ['', 'army', 'navy', 'air-force', 'marines', 'coast-guard', 'space-force', 'other'], 'service branch');
        answer = typeof value === 'object' ? {militaryRecords:p.militaryRecords, militaryBranch:p.militaryBranch || ''} : p.militaryRecords;
        break;
      }
      case 'priority':
        answer = enumValue(value === 'fastest' ? 'speed' : value, ['balanced', 'speed', 'cost', 'transfer'], 'priority');
        p.priority = answer;
        break;
      case 'routes': {
        if (value === 'custom-target' && text(p.school) && text(p.degree) && state.selectedPathwayId === 'custom-target') {
          answer = 'custom-target';
          break;
        }
        const candidate = pathways(catalog).find(route => route.id === value || route.modelId && route.modelId === value);
        if (!candidate) throw new Error('Choose an available degree route.');
        state = selectRoute(state, candidate, catalog);
        answer = candidate.id;
        break;
      }
      case 'review':
        if (value !== true && value !== 'confirmed') throw new Error('Review your choices before continuing.');
        answer = true;
        break;
    }
    state.journey.answers[id] = copy(answer);
    state.journey.step = id;
    if (id !== 'review') {
      delete state.journey.answers.review;
      state.journey.planReviewed = false;
      state.journey.schoolContacted = false;
    }
    return state;
  }
  function setPriorCredits(previous, choice) {
    enumValue(choice, ['none', 'some', 'later'], 'prior-credit choice');
    const earned = list(previous?.learning).some(record => record?.status === 'earned');
    if (choice === 'none' && earned) throw new Error('You have saved completed learning. Review those records before choosing no completed credits.');
    const state = copy(previous);
    state.profile = {...object(state.profile)};
    state.journey = metadata(state);
    // This worksheet decision updates the credit-review task without moving a
    // completed learner back through the questions or altering source records.
    if (choice === 'later') state.profile.hasPrior = earned ? (state.profile.hasPrior === 'degree' ? 'degree' : 'some') : 'unknown';
    else state.profile.hasPrior = choice;
    state.journey.answers.prior = choice === 'later' ? 'unknown' : choice;
    state.journey.creditsDeferred = choice !== 'none';
    state.journey.planReviewed = false;
    state.journey.schoolContacted = false;
    delete state.journey.reviewedSignature;
    delete state.journey.schoolContactedSignature;
    return state;
  }
  function selectRoute(previous, pathway, catalog) {
    if (!pathway || !text(pathway.id) || !text(pathway.school) || !text(pathway.title)) throw new Error('Choose a valid degree route.');
    if (unresolvedCareer(previous) && pathway.routeType !== 'catalog-program') throw new Error('Confirm the exact licensed career before choosing a route.');
    const p = object(previous.profile), j = metadata(previous);
    // Selection must satisfy preferences that the visitor actually supplied.
    // School/degree fields identify an old route and may be replaced by this
    // explicit choice; level, goal, and format remain hard constraints.
    const exactDegree = pathway.routeType !== 'career-guide' && !list(pathway.stageLevels).length, identifiedLevel = Guide.normalizeProfile({degreeLevel:pathway.level}).degreeLevel;
    const filters = {...p, pathwayId:'', school:'', degree:'', field:exactDegree ? pathway.field || 'any' : own(j.answers, 'field') || j.completed ? p.field : 'any'};
    if (exactDegree) filters.degreeLevel = identifiedLevel;
    if (j.answers.purpose === 'licensed-career' || protectedGoals.includes(p.goal)) filters.field = 'any';
    if (!exactDegree && !own(j.answers, 'level') && !j.completed) filters.degreeLevel = 'unsure';
    if (!own(j.answers, 'purpose') && !j.completed && list(pathway.goals).length && !list(pathway.goals).includes(filters.goal)) filters.goal = pathway.goals[0];
    const compatible = Guide.recommend(filters, {pathways:[pathway]}, [], list(previous.learning)).length;
    if (!compatible && pathway.routeType !== 'catalog-program') throw new Error('This route does not meet your saved goal, degree level, or study format.');
    let state = Sheet.selectPathway(copy(previous), pathway);
    state.journey = j;
    if (!exactDegree && own(j.answers, 'level')) state.profile.degreeLevel = p.degreeLevel;
    // Exploration is a starting-point answer even after an exact route is saved.
    if (j.answers.start) state.profile.entry = j.answers.start;
    if (!exactDegree && (j.answers.start === 'explore' || own(j.answers, 'field'))) state.profile.field = p.field || 'any';
    if (exactDegree && own(j.answers,'field')) state.journey.answers.field = state.profile.field;
    if (exactDegree && own(j.answers,'level')) state.journey.answers.level = state.profile.degreeLevel;
    const modalities = [...new Set(list(pathway.modalities).filter(Boolean))];
    if (!own(j.answers, 'format') && (!p.modality || p.modality === 'any') && modalities.length === 1) state.profile.modality = modalities[0];
    state.journey.answers.routes = pathway.id;
    state.journey.planReviewed = false;
    state.journey.schoolContacted = false;
    delete state.journey.answers.review;
    return state;
  }
  function prepare(state, pathway, models) {
    const result = copy(state), raw = programs(models).find(model => model?.id === pathway?.modelId);
    if (!pathway) return result;
    const programId = pathway.modelId || pathway.id;
    const scenario = Sheet.scenario(result, programId);
    if (raw) {
      const mapped = [...new Set(list(raw.requirements).flatMap(req => list(req.options).map(option => option.provider)))].filter(provider => provider && provider !== 'University');
      const saved = object(result.scenarios?.[programId]), explicitProviders = Array.isArray(saved.providers);
      const defaults = Array.isArray(raw.defaultProviders) ? [...new Set(raw.defaultProviders)].filter(provider => mapped.includes(provider)) : [...new Set([...scenario.providers, ...mapped])];
      if (!explicitProviders || JSON.stringify(scenario.mappedProvidersReviewed) !== JSON.stringify(mapped)) {
        // A newly researched provider is available to browse; it does not
        // authorize changing a student's saved source preferences.
        result.scenarios = {...object(result.scenarios), [programId]:{
          ...copy(saved),
          providers:explicitProviders ? [...scenario.providers] : defaults,
          mappedProvidersReviewed:mapped
        }};
      }
    }
    return result;
  }
  function planningInput(state, pathway, match, program) {
    const programId = pathway.modelId || pathway.id, saved = object(state.scenarios?.[programId]), s = Sheet.scenario(state, programId);
    // Older saved scenarios may use the planner's nested fields. The worksheet's
    // blank/default scalar fields must not erase those previous user estimates.
    // An explicitly stored scalar remains authoritative, including a cleared one.
    const positive = value => number(value) > 0 ? number(value) : null;
    const estimate = (name, fallback) => own(saved, name) ? positive(saved[name]) : positive(fallback);
    const externalWeeks = {...object(s.timing?.externalWeeks), ...object(s.providerWeeks)};
    for (const [provider, field] of [['Sophia', 'sophiaWeeks'], ['Study.com', 'studyWeeks'], ['CLEP', 'clepWeeks']]) externalWeeks[provider] = estimate(field, externalWeeks[provider]);
    const quotedRate = Math.max(0, number(s.universityRate)), published = program?.pricing;
    const publishedRate = published?.model === 'per-credit' && (!published.currency || published.currency === 'USD') && number(published.amount) > 0 ? number(published.amount) : null;
    return {...s, completed:list(match?.completed),
      providers:s.providers.filter(provider => !(state.profile.proctoringPreference === 'avoid' && knownProctored.has(provider))),
      priority:state.profile.priority === 'fastest' ? 'speed' : state.profile.priority,
      allowConditional:s.allowConditional,
      universityRate:quotedRate || publishedRate || 0, universityRateBasis:quotedRate ? 'student-quote' : publishedRate ? 'published-program-price' : 'unknown',
      universityRateSourceUrl:!quotedRate && publishedRate ? published.sourceUrl || '' : '', fees:Math.max(0, number(s.fees)),
      providerMonths:{...object(s.providerMonths), Sophia:estimate('sophiaMonths', s.providerMonths?.Sophia) || 1, 'Study.com':estimate('studyMonths', s.providerMonths?.['Study.com']) || 1},
      optionSelections:copy(object(s.optionSelections)),
      timing:{...object(s.timing), externalWeeks, externalConcurrency:estimate('concurrency', s.timing?.externalConcurrency) || 1, universityTermWeeks:estimate('termWeeks', s.timing?.universityTermWeeks), universityCreditsPerTerm:estimate('termCredits', s.timing?.universityCreditsPerTerm)}};
  }
  function supportsAssignment(program,input){
    // Matching asks whether these original courses can coexist. The full route
    // is optimized once after the placements have been chosen.
    const probe=Planner.generate(program,{...input,priority:'campus',optimizationNodeBudget:0});
    if(probe.validation.academicCountsValid)return true;
    return Boolean(probe.optimization?.budgetExhausted&&Planner.generate(program,input).validation.academicCountsValid);
  }
  function buildDraft(previous, catalog, models) {
    const chosen = routeFor(previous, catalog), state = prepare(previous, chosen, models);
    const pathway = chosen || {id:text(state.selectedPathwayId)||text(state.profile.pathwayId)||'custom-target', school:text(state.profile.school) || text(state.profile.schoolChoice) || 'Your chosen school', title:text(state.profile.degree) || 'Your degree',level:state.profile.degreeLevel||'unsure',modalities:[],creditSystem:null,catalog:'',url:'',routeType:'custom',sources:[], constraints:['Obtain the current degree requirements and transfer policies for this exact program.'], proposedActions:['Get your official degree requirements and catalog year.', 'Request an evaluation of your existing learning.', 'Confirm course-to-requirement placements before buying outside courses.']};
    if (chosen && chosen.routeType !== 'career-guide' && !list(chosen.stageLevels).length) {
      const identifiedLevel = Guide.normalizeProfile({degreeLevel:chosen.level}).degreeLevel;
      state.profile = {...state.profile,school:chosen.school,schoolChoice:chosen.school,degree:chosen.title,pathwayId:chosen.id,
        ...(chosen.field?{field:chosen.field}:{}),...(identifiedLevel!=='unsure'?{degreeLevel:identifiedLevel}:{})};
      state.selectedPathwayId = chosen.id;
      if (state.journey?.answers && own(state.journey.answers,'field') && chosen.field) state.journey.answers.field = chosen.field;
      if (state.journey?.answers && own(state.journey.answers,'level') && identifiedLevel!=='unsure') state.journey.answers.level = identifiedLevel;
    }
    const eligibilityProfile = {...state.profile};
    if (state.journey?.answers?.purpose === 'licensed-career' || protectedGoals.includes(eligibilityProfile.goal)) eligibilityProfile.field = 'any';
    const assessment = chosen ? Guide.assessTarget(eligibilityProfile,chosen,programs(models),list(state.learning)) : {conflicts:[],unknowns:[]};
    if (unresolvedCareer(state)) assessment.unknowns.push({field:'goal',title:'Profession needs confirmation',current:state.journey?.answers?.career || '',required:'The intended licensed profession',allowedValues:[...protectedGoals],reason:'not-specified'});
    const targetIssues = assessment.conflicts, targetUnknowns = assessment.unknowns;
    const mapped = chosen && programs(models).find(model => model?.id === chosen.modelId), mapAvailable = Boolean(mapped);
    // An unknown study format remains a visible confirmation item while the
    // exact sourced curriculum can still support a provisional course plan.
    const eligible = chosen && !targetIssues.length && (!targetUnknowns.length || assessment.curriculumSourced && targetUnknowns.every(issue => issue.field === 'modality'));
    const raw = eligible ? mapped : null;
    const scenario = Sheet.scenario(state, pathway.modelId || pathway.id), variant = raw?.transferWaiverVariant;
    const program = raw ? (scenario.useWaivers && variant ? {...copy(raw), requirements:copy(variant.requirements), curriculumSections:copy(variant.curriculumSections || raw.curriculumSections || []), rulesNotes:[...list(raw.rulesNotes), ...list(variant.rulesNotes)], unresolved:copy(variant.unresolved), appliedTransferWaiver:{minimumQualifyingTransferCredits:variant.minimumQualifyingTransferCredits, condition:variant.condition}} : copy(raw)) : null;
    const originalInput=program?planningInput(state,pathway,null,program):null;
    const match = program ? Guide.matchInventory(program, state.learning,{acceptAssignment:completed=>supportsAssignment(program,{...originalInput,completed})}) : {completed:[], unmatched:copy(list(state.learning))};
    const input = planningInput(state, pathway, match, program);
    // A deliberately selected bundled source (for example one six-credit CLEP)
    // should cover its other reviewed components before recommending a second
    // enrollment. Preserve explicit choices and completed work in other rows.
    if (program) {
      const fixed = {...input.optionSelections}, done = new Set(list(match.completed).map(item=>item.requirementId));
      for (const [requirementId,optionId] of Object.entries(fixed)) {
        const selected = list(program.requirements).find(req=>req.id===requirementId)?.options?.find(option=>option.id===optionId);
        if (!selected?.bundleId || !(selected.bundleCredits>0)) continue;
        const components = list(program.requirements).map(req=>({req,option:list(req.options).find(option=>option.bundleId===selected.bundleId&&option.provider===selected.provider)})).filter(item=>item.option);
        if (components.reduce((sum,item)=>sum+Number(item.req.credits||0),0)>selected.bundleCredits) continue;
        for (const {req,option} of components) if (!done.has(req.id)&&!Object.prototype.hasOwnProperty.call(fixed,req.id)) input.optionSelections[req.id]=option.id;
      }
    }
    const availableByRequirement=new Map(program?program.requirements.map(requirement=>[requirement.id,new Set(Planner.availableOptions(program,requirement.id,input).map(option=>option.id))]):[]);
    const collectionMatch = program ? Guide.matchCollection(program, state.learning, {
      earnedMatch:match,
      optionSelections:input.optionSelections,
      availableOption:(requirement, option) => availableByRequirement.get(requirement.id)?.has(option.id),
      acceptSelection:selections => supportsAssignment(program,{...input,optionSelections:selections})
    }) : {optionSelections:input.optionSelections, selections:{}, placements:[], matchedIds:[], unmatched:list(state.learning).filter(item => item.status !== 'earned')};
    input.optionSelections = collectionMatch.optionSelections;
    input.plannedLearning = collectionMatch.placements;
    const plan = program ? Planner.generate(program, input) : null;
    const guidance = Guide.buildGuidance(state.profile, pathway, state.learning, asCatalog(catalog), {program, plan});
    if (targetIssues.length) guidance.nextActions.unshift('Review this exact target against your career, degree level and study format before relying on a course plan.');
    else if (targetUnknowns.length) guidance.nextActions.unshift('Confirm the missing program information before relying on its course plan.');
    if (unresolvedCareer(state)) guidance.careerNotes.unshift('Confirm the exact licensed profession, jurisdiction and approved preparation; a general degree does not establish professional eligibility.');
    if (state.journey?.creditsDeferred) {
      guidance.tips.unshift({id:'credits-deferred', title:'Your credit review is still open', text:'This draft is provisional until you add your original learning records and obtain receiving-school evaluations. Existing credits have not been guessed or subtracted.'});
      if (plan) plan.provisional = true;
    }
    return {state, pathway, program, plan, match, collectionMatch, guidance, input, targetIssues, targetUnknowns, mapAvailable,targetReviewNeeded:Boolean(targetIssues.length)};
  }
  function draftSignature(state, draft) {
    const pathway = draft?.pathway || {}, programId = pathway.modelId || pathway.id || text(state.selectedPathwayId);
    const canonical = value => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(name => value[name] !== undefined).map(name => [name, canonical(value[name])]));
      return value;
    };
    return JSON.stringify(canonical({version:1, profile:state.profile, selectedPathwayId:state.selectedPathwayId,
      learning:list(state.learning), scenario:programId ? Sheet.scenario(state, programId) : null,
      savingsAssumptions:programId ? object(state.savings?.[programId]) : {},
      purpose:state.journey?.answers?.purpose, career:state.journey?.answers?.career,
      creditsDeferred:state.journey?.creditsDeferred === true,
      pathway:{id:pathway.id, modelId:pathway.modelId, school:pathway.school, title:pathway.title},
      program:draft?.program ? {id:draft.program.id, catalog:draft.program.catalog, totalCredits:draft.program.totalCredits, creditSystem:draft.program.creditSystem, appliedTransferWaiver:draft.program.appliedTransferWaiver,
        institutionMinCredits:draft.program.institutionMinCredits, majorMinInstitutionCredits:draft.program.majorMinInstitutionCredits,
        upperMinCredits:draft.program.upperMinCredits, upperGroupMinimums:draft.program.upperGroupMinimums,
        externalMaxCredits:draft.program.externalMaxCredits, alternativeMaxCredits:draft.program.alternativeMaxCredits,
        rulesNotes:draft.program.rulesNotes, unresolved:draft.program.unresolved, obligations:draft.program.obligations, mappingReview:draft.program.mappingReview,
        sources:list(draft.program.sources).map(source => ({id:source.id, url:source.url, checked:source.checked, checkedOn:source.checkedOn}))} : null,
      rows:list(draft?.plan?.rows).map(row => ({requirementId:row.requirementId, code:row.code, title:row.title, credits:row.credits, status:row.status, category:row.category, subgroup:row.subgroup, upper:row.upper, placementReason:row.placementReason, selectionRequired:row.selectionRequired, conditions:row.conditions, prerequisites:row.prerequisites, prerequisiteNotes:row.prerequisiteNotes, option:row.option ? copy(row.option) : null})),
      validation:draft?.plan?.validation || null,
      costs:draft?.plan?.costs || null, timing:draft?.plan?.timing || null}));
  }
  function tasks(state, draft) {
    const j = metadata(state), a = j.answers, p = object(state.profile);
    const target = Boolean(!state.sheet?.isExample && (text(state.selectedPathwayId) || text(p.pathwayId) || text(p.school) && text(p.degree)));
    const customCareer = a.career === 'other' && text(p.school) && text(p.degree);
    const choices = target && (own(a, 'purpose') || j.completed) && (!unresolvedCareer(state) || customCareer);
    const deferred = j.creditsDeferred === true;
    const credits = list(state.learning).some(record=>record.status==='earned') || a.prior === 'none' || j.completed && p.hasPrior === 'none' || deferred;
    const signature = draftSignature(state, draft);
    const reviewed = j.planReviewed === true && j.reviewedSignature === signature;
    const contacted = j.schoolContacted === true && j.schoolContactedSignature === signature;
    const task = (id, title, complete, detail, provisional = false) => ({id, title, complete:Boolean(complete), status:provisional ? 'provisional' : complete ? 'complete' : 'pending', provisional, detail, description:detail});
    return [
      task('choices', 'Choose your degree goal', choices, choices ? 'Your school, degree and purpose are saved.' : 'Choose a route or keep your exact school and degree target.'),
      task('credits', 'Add your existing credits', credits, deferred ? 'Skipped for now. Your plan remains provisional until records are reviewed.' : credits ? 'Your original learning records or no-prior-credit answer are saved.' : 'Add original learning records, or continue for now with a provisional draft.', deferred),
      task('plan', 'Review your degree plan', reviewed, reviewed ? 'You marked your current draft reviewed.' : draft?.plan ? 'Review course choices, open checks, partial costs and timing assumptions.' : 'Review the exact target outline and collect its current degree requirements.'),
      task('school', 'Confirm with your school', contacted, contacted ? 'You marked this draft sent to your school. Individual awards still require its official evaluation.' : 'Request the school’s official evaluation and written course approvals. Counts and community reports do not confirm your individual awards.')
    ];
  }
  return Object.freeze({initialize, questions, applyAnswer, setPriorCredits, selectRoute, recommend, prepare, planningInput, buildDraft, draftSignature, tasks});
}));
