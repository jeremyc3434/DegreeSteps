/* Small milestones from the student's own records. No points, awards or network calls. */
(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./planner.js') : root.DegreePlanner);
  if (common) module.exports = api;
  else root.DegreeMomentum = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Planner) {
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value.trim() : '';
  const normalized = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const provider = value => ({sophialearning:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[normalized(value)] || normalized(value));
  const safeKey = value => text(value).length <= 200 && !['__proto__','constructor','prototype'].includes(text(value)) ? text(value) : '';
  const round = value => Math.round(value * 10) / 10;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const messages = {
    'goal-chosen':'Your degree goal is in place.',
    'course-finished':'First completed course recorded. A good step forward!',
    'transfer-confirmed':'Your first school-confirmed transfer is recorded. That is progress!',
    'transfer-30':'30 transfer credits recorded as accepted toward this plan. A milestone worth celebrating!'
  };
  const announcements = new WeakMap();
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 2.5 5 5.5.8-4 3.9.9 5.5L12 15.6l-4.9 2.6.9-5.5-4-3.9L9.5 8 12 3Z"/></svg>';

  function clearAnnouncement(node) {
    const shown = announcements.get(node);
    if (shown?.timer != null && typeof clearTimeout === 'function') clearTimeout(shown.timer);
    const status = node.querySelector('.momentum-announcement');
    if (status) {status.textContent = '';status.classList.remove('is-celebrating');}
    announcements.delete(node);
  }

  function completedCourses(state) {
    const courses = new Set();
    for (const record of list(state.learning)) {
      if (!record || record.status !== 'earned' || !number(record.credits) || record.credits <= 0 || record.credits > 200 || !text(record.provider) || !text(record.title)) continue;
      const source = provider(record.provider);
      const university = source === 'university' ? normalized(record.institution) + '|' + text(record.sourceProgramId) + '|' : '';
      courses.add(source + '|' + university + (normalized(record.code) || 'title:' + normalized(record.title)));
    }
    return courses.size;
  }
  function allocatedTransfers(program, plan) {
    const empty = {reported:0,confirmed:0,valid:false};
    if (!program.id || plan.programId !== program.id || !Array.isArray(program.requirements) || !Array.isArray(plan.rows) || plan.validation?.academicCountsValid !== true || !Planner?.validate) return empty;
    try {
      const requirements = new Map(program.requirements.map(req => [req.id, req]));
      if (requirements.size !== program.requirements.length || plan.rows.length !== requirements.size) return empty;
      const balance = Planner.creditBalancePolicy?.(program);
      const variable = new Set(balance ? [...balance.balanceRequirementIds,...balance.equivalencies.map(binding => binding.requirementId)] : []);
      if (Planner.validate(program,plan).academicCountsValid !== true) return empty;
      const seen = new Set(); let total = 0, reported = 0, confirmed = 0;
      for (const row of plan.rows) {
        const requirement = requirements.get(row?.requirementId);
        if (!requirement || seen.has(row.requirementId) || !number(row.credits) || row.credits < 0 || Math.abs(row.credits - requirement.credits) > .000001 && !variable.has(row.requirementId)) return empty;
        seen.add(row.requirementId); total += row.credits;
        const source = provider(row.option?.provider);
        if (!source || source === 'university' || row.institutional === true || row.unknownProvenance) continue;
        if (row.status === 'reported') reported += row.credits;
        if (row.status === 'confirmed') confirmed += row.credits;
      }
      if (!number(program.totalCredits) || Math.abs(total - program.totalCredits) > .000001) return empty;
      return {reported:round(reported),confirmed:round(confirmed),valid:true};
    } catch {return empty;}
  }
  function summarize(state, draft) {
    state = object(state); draft = object(draft);
    const program = object(draft.program), plan = object(draft.plan), pathway = object(draft.pathway), profile = object(state.profile);
    const programId = safeKey(program.id || pathway.id || state.selectedPathwayId || profile.pathwayId);
    const targetChosen = Boolean(programId && state.sheet?.isExample !== true && (text(profile.school) && text(profile.degree) || text(pathway.school) && text(pathway.title)));
    const finished = completedCourses(state), transfers = allocatedTransfers(program,plan);
    const milestones = [
      {id:'goal-chosen',title:'Degree goal chosen',detail:targetChosen ? 'Your destination is saved.' : 'Choose the degree you want to work toward.',earned:targetChosen,href:'portal.html',action:'Choose a degree'},
      {id:'course-finished',title:'First completed course',detail:finished ? 'A finished course is in your records.' : 'Add a course you have already finished.',earned:finished > 0,href:'plan.html?task=credits',action:'Add a course'},
      {id:'transfer-confirmed',title:'First confirmed transfer',detail:transfers.confirmed > 0 ? 'Recorded as accepted by your school.' : 'Record your school’s transfer evaluation.',earned:transfers.confirmed > 0,href:'plan.html?task=checks',action:'Review transfers'},
      {id:'transfer-30',title:'30 transfer credits accepted',detail:transfers.confirmed >= 30 ? 'Recorded as accepted toward this plan.' : round(transfers.confirmed) + ' of 30 school-confirmed transfer credits.',earned:transfers.confirmed >= 30,href:'plan.html?task=checks',action:'Review transfers'}
    ];
    return {
      available:targetChosen,programId:programId || null,
      completedCourses:finished,reportedTransferCredits:transfers.reported,
      confirmedTransferCredits:transfers.confirmed,allocationValid:transfers.valid,
      milestones,nextMilestone:milestones.find(item => !item.earned) || null,
      earnedCount:milestones.filter(item => item.earned).length,totalMilestones:milestones.length
    };
  }
  // The acknowledgement history prevents repeat celebrations after reload or an
  // accidental removal/re-add. Visible badges always reflect the current data.
  function advance(state, draft) {
    const summary = summarize(state,draft), current = object(state?.momentum);
    if (!summary.available) return {summary,momentum:current,changed:false,newlyEarned:[]};
    const programs = object(current.programs), prior = object(programs[summary.programId]);
    const validIds = new Set(summary.milestones.map(item => item.id));
    const seen = new Set(list(prior.seenIds).filter(id => validIds.has(id)));
    const baselineExists = current.version === 1 && prior.initialized === true;
    const earned = summary.milestones.filter(item => item.earned).map(item => item.id);
    const newlyEarned = baselineExists ? earned.filter(id => !seen.has(id)) : [];
    earned.forEach(id => seen.add(id));
    const seenIds = [...validIds].filter(id => seen.has(id));
    const changed = !baselineExists || JSON.stringify(list(prior.seenIds)) !== JSON.stringify(seenIds);
    const momentum = changed ? {version:1,programs:{...programs,[summary.programId]:{initialized:true,seenIds}}} : current;
    return {summary,momentum,changed,newlyEarned};
  }
  function update(node,state,draft,options = {}) {
    if (!node) return null;
    const result = advance(state,draft), summary = result.summary;
    node.hidden = !summary.available;
    if (!summary.available) {
      clearAnnouncement(node);
      return result;
    }
    if (!node.querySelector('.momentum-panel')) node.innerHTML = '<details class="momentum-panel"><summary class="momentum-summary"></summary><div class="momentum-body"></div></details><div class="momentum-announcement" role="status" aria-live="polite" aria-atomic="true"></div>';
    node.classList.toggle('momentum-compact',Boolean(options.compact));
    const panel = node.querySelector('.momentum-panel');
    node.querySelector('.momentum-summary').innerHTML = '<span class="momentum-summary-icon">'+icon+'</span><strong>Your milestones</strong><span class="momentum-count">'+summary.earnedCount+' of '+summary.totalMilestones+'</span><span class="momentum-summary-next">'+esc(summary.nextMilestone ? 'Next: '+summary.nextMilestone.title.toLowerCase() : 'Keep moving toward your degree')+'</span><span class="momentum-chevron" aria-hidden="true">⌄</span>';
    node.querySelector('.momentum-body').innerHTML = '<ul class="momentum-milestones">'+summary.milestones.map(item => '<li data-momentum-milestone="'+item.id+'" data-earned="'+item.earned+'"><span class="momentum-badge">'+icon+(item.earned ? '<span class="momentum-check" aria-label="Earned">✓</span>' : '')+'</span><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p>'+(!item.earned ? '<a href="'+item.href+'">'+item.action+' <span aria-hidden="true">→</span></a>' : '<span class="momentum-earned-label">Milestone reached</span>')+'</div></li>').join('')+'</ul><p class="momentum-note">Completed courses are reported by you. School-confirmed credits follow the evaluation you record for this plan.</p>';
    const announcement = node.querySelector('.momentum-announcement');
    if (result.changed && typeof options.onChange === 'function') options.onChange(result.momentum);
    if (result.newlyEarned.length) {
      const latest = result.newlyEarned[result.newlyEarned.length-1];
      clearAnnouncement(node);
      announcement.textContent = messages[latest];
      announcement.classList.add('is-celebrating');
      const shown = {programId:summary.programId,milestoneId:latest,timer:null};
      announcements.set(node,shown);
      if (typeof setTimeout === 'function') {
        shown.timer = setTimeout(() => {
          if (announcements.get(node) === shown) clearAnnouncement(node);
        },6000);
        shown.timer?.unref?.();
      }
    } else if (announcement.textContent) {
      // Keep a valid new message through the same render cycle, but never keep
      // celebrating a withdrawn record or an achievement from another plan.
      const shown = announcements.get(node);
      if (!shown || shown.programId !== summary.programId || !summary.milestones.some(item => item.id === shown.milestoneId && item.earned)) {
        clearAnnouncement(node);
      }
    }
    if (options.onAction) panel.querySelectorAll('a').forEach(link => link.addEventListener('click',event => {event.preventDefault();options.onAction(link.getAttribute('href'));}));
    return result;
  }
  return Object.freeze({summarize,advance,update});
}));
