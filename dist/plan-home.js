/* One useful action, chosen from the student's actual records and degree. */
(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./journey-engine.js') : root.DegreeJourney, common ? () => require('./student-checklist.js') : () => root.DegreeChecklist);
  if (common) module.exports = api;
  else root.DegreePlanHome = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Journey, getChecklist) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list = value => Array.isArray(value) ? value : [];
  const hasUnits = record => ['semester','quarter','competency-unit'].includes(record.creditSystem);
  const knownCredits = record => Number.isFinite(record.credits) && record.credits > 0 && hasUnits(record);
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
  function nextWin(state, draft) {
    const tasks = Journey.tasks(state, draft), p = state.profile || {}, learning = list(state.learning), plan = draft.plan;
    if (!tasks[0].complete) return {id:'goal',title:'Choose where you want to go',detail:'Your course collection stays with you as your goal changes.',label:'Continue setup',href:'portal.html?view=setup'};
    if (draft.targetReviewNeeded) return {id:'goal-fit',title:'Check this degree against your goal',detail:'Your degree, career goal or study format do not currently fit together. Your courses stay saved.',label:'Review my goal',href:'portal.html?view=edit'};
    const unknown = learning.find(record => record.status === 'earned' && !knownCredits(record));
    if (unknown) return {id:'credit-details',title:'Add the credit details for your finished course',detail:unknown.title+' is saved as finished. Its credits are still pending.',label:'Add credit details',href:'courses.html?tab=mine&record='+encodeURIComponent(unknown.id)};
    const ownService = ['active','veteran','reserve'].includes(p.militaryStatus);
    const serviceRecorded = learning.some(record => record.status === 'earned' && /jst|joint.?services|ccaf|air.?university|military/i.test(record.provider || ''));
    let serviceTaskPending = ownService && !serviceRecorded;
    if (serviceTaskPending) {
      try {
        const checklist = getChecklist?.()?.build(state,draft);
        const task = checklist?.valid ? checklist.tasks.find(item => item.id === 'military-records') : null;
        if (task && ['waiting','done'].includes(task.status)) serviceTaskPending = false;
      } catch {/* An unreadable checklist must not silently dismiss an unfinished record task. */}
    }
    if (serviceTaskPending) return {id:'service-records',title:p.militaryRecords === 'ccaf' ? 'Bring in your CCAF transcript' : 'Bring in your service education record',detail:'Start with the original transcript so your training can be evaluated for this degree.',label:'Get my service record',href:'portal.html?view=school&action=military-records#service-records'};
    if (!tasks[1].complete) return {id:'past-courses',title:'Bring your past courses into the plan',detail:'Upload your transcript or spreadsheet, then review your courses together.',label:'Upload my courses',href:'import-courses.html?from=plan',defer:true};
    if (!plan) return {id:'requirements',title:'Build the course plan for your degree',detail:'Your goal and courses are saved. DegreeSteps can research the requirements from the college’s degree link.',label:'Build from my degree link',href:'request-plan.html'};
    if (!plan.validation?.academicCountsValid || list(plan.setupIssues).some(issue => ['invalid_selection','selection_conflict'].includes(issue.code))) return {id:'conflicts',title:'Resolve the course choices that conflict',detail:'Review the affected requirements before adding more courses.',label:'See affected courses',href:'plan.html?task=checks'};
    const takingIds=new Set(list(draft.collectionMatch?.placements).filter(placement=>list(plan.rows).some(row=>row.status==='planned'&&row.requirementId===placement.requirementId&&row.option?.id===placement.optionId)).map(placement=>placement.learningId));
    const taking = learning.find(record => record.status === 'in-progress'&&takingIds.has(record.id));
    if (taking) return {id:'taking',title:'Keep going with '+taking.title,detail:'Record it as finished when you are done. Your school’s evaluation stays separate.',label:'Update my progress',href:'courses.html?tab=mine&record='+encodeURIComponent(taking.id)};
    // Keep a course already underway in view while unrelated past records wait for evaluation.
    // Goal, record-detail and curriculum conflicts still take precedence above.
    const unmatched = list(draft.match?.unmatched).filter(record => record.status === 'earned');
    if (unmatched.length) return {id:'evaluation',title:'Find out where your past courses count',detail:unmatched.length+' finished course'+(unmatched.length===1?' needs':'s need')+' a degree-specific evaluation. Unreviewed does not mean rejected.',label:'Prepare evaluation request',href:'portal.html?view=school'};
    const outside = list(plan.rows).filter(row => row.status === 'planned' && row.option?.provider !== 'University' && row.option && !/gap|excluded/.test(row.placementReason || ''));
    const course = outside.find(row => row.option.evidence === 'published' && row.option.preapprovalRequired !== true) || outside[0];
    if (course) {const documented=course.option.evidence === 'published' && course.option.preapprovalRequired !== true;return {id:'first-course',title:documented?'Open your next transfer course':'Choose a researched course option',detail:course.option.title+' · '+course.option.provider+'. '+(documented?'See where it fits in your degree and open the course.':'DegreeSteps still needs to resolve this option’s transfer conditions. Documented alternatives are shown with their sources.'),label:documented?'View this course':'View course options',href:'plan.html?course='+encodeURIComponent(course.requirementId)};}
    return {id:'school',title:'Plan your college coursework',detail:'Your college courses and degree requirements are listed in your plan.',label:'View my remaining courses',href:'plan.html'};
  }
  function update(node, state, draft, options = {}) {
    if (!node) return;
    if (document.body.classList.contains('portal-task-page')) {node.hidden = true; return;}
    node.hidden = false;
    const win = nextWin(state,draft);
    node.innerHTML = '<section class="plan-next-win" data-next-win="'+esc(win.id)+'" aria-label="Your next step"><span class="plan-next-icon" aria-hidden="true">'+arrow+'</span><div class="plan-next-copy"><span class="plan-next-kicker">Your next step</span><h2>'+esc(win.title)+'</h2><p>'+esc(win.detail)+'</p></div><div class="plan-next-actions"><a class="plan-next-button" href="'+esc(win.href)+'">'+esc(win.label)+arrow+'</a>'+(win.defer?'<button type="button" data-home-defer>Do this later</button>':'')+'</div></section>';
    node.querySelector('[data-home-defer]')?.addEventListener('click', () => options.onChange?.({...state,journey:{...state.journey,creditsDeferred:true,planReviewed:false,schoolContacted:false}}));
  }
  return Object.freeze({update,nextWin});
}));
