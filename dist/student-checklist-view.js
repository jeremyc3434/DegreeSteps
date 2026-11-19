/* A small, editable checklist beside the student's existing course records. */
(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./student-checklist.js') : root.DegreeChecklist, common ? require('./task-calendar.js') : root.DegreeTaskCalendar);
  if (common) module.exports = api;
  else root.DegreeChecklistView = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Checklist, Calendar) {
  'use strict';
  const views = new WeakMap();
  const list = value => Array.isArray(value) ? value : [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {todo:'To do',doing:'Doing',waiting:'Waiting',done:'Done'};
  const statusOf = task => Object.hasOwn(labels,task?.status) ? task.status : 'todo';
  const taskKey = task => 'task:' + task.id;
  const deleteSignature = (model,task) => task ? JSON.stringify([model.scope,task.id,task.title,task.status,task.dueOn,task.notes]) : null;
  const isCourse = task => task.kind === 'course' || task.group === 'courses';
  const canEditStatus = task => task.canSetStatus === true;
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
  const chevron = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>';
  const safeHref = value => {
    if (typeof value !== 'string' || !value || /[\s\\]/.test(value) || value.startsWith('//')) return '';
    try {
      const url = new URL(value,'https://degreepath.invalid/');
      return url.protocol === 'https:' && !url.username && !url.password && (/^https:\/\//i.test(value) || url.origin === 'https://degreepath.invalid') ? value : '';
    } catch {return '';}
  };
  const externalAttrs = href => /^https:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
  const externalLabel = href => /^https:\/\//i.test(href) ? '<span class="dc-sr-only"> (opens in a new tab)</span>' : '';
  const openAttr = (ui,key,fallback = false) => (ui.open.has(key) ? ui.open.get(key) : fallback) ? ' open' : '';
  const focusAttr = key => ' data-dc-focus="' + esc(key) + '"';
  const localId = (ui,key) => ui.id + '-' + encodeURIComponent(key).replace(/%/g,'_');
  let sequence = 0;

  function field(ui,task,name) {
    const cached = ui.formDrafts.get(task ? taskKey(task) : 'add');
    return cached && Object.hasOwn(cached,name) ? cached[name] : task?.[name] ?? '';
  }
  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const date = new Date(value + 'T12:00:00Z');
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  }
  function statusOptions(value) {
    return Object.keys(labels).map(status => '<option value="'+status+'"'+(value === status ? ' selected' : '')+'>'+labels[status]+'</option>').join('');
  }
  function remember(ui) {
    ui.content.querySelectorAll('details[data-dc-open]').forEach(el => ui.open.set(el.dataset.dcOpen,el.open));
    ui.content.querySelectorAll('form[data-dc-form]').forEach(form => {
      if (!ui.dirtyForms.has(form.dataset.dcForm)) return;
      const values = {};
      form.querySelectorAll('[name]').forEach(input => {values[input.name] = input.value;});
      ui.formDrafts.set(form.dataset.dcForm,values);
    });
  }
  function visible(el,root) {
    if (!el) return false;
    let parent = el;
    while (parent && parent !== root) {
      if (parent.hidden) return false;
      if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector('summary')?.contains(el)) return false;
      parent = parent.parentElement;
    }
    return true;
  }
  function findFocus(ui,key) {
    return [...ui.content.querySelectorAll('[data-dc-focus]')].find(el => el.dataset.dcFocus === key);
  }
  function snapshotFocus(ui) {
    const el = ui.node.ownerDocument.activeElement;
    if (!ui.content.contains(el)) return null;
    const task = el.closest('[data-dc-task]');
    return {key:el.dataset.dcFocus,taskId:task?.dataset.dcTask,group:task?.dataset.dcGroup,start:el.selectionStart,end:el.selectionEnd};
  }
  function restoreFocus(ui,snapshot) {
    if (!snapshot) return;
    let target = findFocus(ui,snapshot.key);
    if (!visible(target,ui.content)) {
      target = snapshot.taskId ? findFocus(ui,'task:'+snapshot.taskId+':details') : null;
    }
    if (!visible(target,ui.content)) {
      target = snapshot.group ? findFocus(ui,'done:'+snapshot.group) : null;
      if (!visible(target,ui.content)) target = findFocus(ui,'checklist');
    }
    if (!target) return;
    target.focus({preventScroll:true});
    if (target.dataset.dcFocus === snapshot.key && typeof snapshot.start === 'number' && typeof target.setSelectionRange === 'function') {
      try {target.setSelectionRange(snapshot.start,snapshot.end);} catch { /* Date and checkbox inputs have no text selection. */ }
    }
  }
  function announce(ui,message,error = false) {
    ui.live.classList.toggle('dc-error',error);
    ui.live.textContent = message;
  }
  function formFields(ui,task) {
    const key = taskKey(task), titleId = localId(ui,key+':title'), statusId = localId(ui,key+':status');
    const dueId = localId(ui,key+':dueOn'), notesId = localId(ui,key+':notes');
    return (task.custom ? '<label for="'+titleId+'">Task<input id="'+titleId+'" name="title" value="'+esc(field(ui,task,'title'))+'" required maxlength="160"'+focusAttr(key+':title')+'></label>' : '')+
      '<div class="dc-form-row">'+(canEditStatus(task) ? '<label for="'+statusId+'">Status<select id="'+statusId+'" name="status"'+focusAttr(key+':status')+'>'+statusOptions(field(ui,task,'status'))+'</select></label>' : '')+
      '<label for="'+dueId+'">Due date <span>(optional)</span><input id="'+dueId+'" type="date" name="dueOn" value="'+esc(field(ui,task,'dueOn'))+'"'+focusAttr(key+':dueOn')+'></label></div>'+
      '<label for="'+notesId+'">Notes <span>(optional)</span><textarea id="'+notesId+'" name="notes" rows="2" maxlength="1000"'+focusAttr(key+':notes')+'>'+esc(field(ui,task,'notes'))+'</textarea></label>'+
      '<div class="dc-form-actions"><button type="submit" class="dc-save"'+focusAttr(key+':save')+'>Save changes</button>'+(task.custom ? '<button type="button" class="dc-delete" data-dc-delete="'+esc(task.id)+'"'+focusAttr(key+':delete')+'>Delete task</button>' : '')+'</div>'+
      (task.custom&&ui.pendingDelete?.id===task.id?'<div class="dc-delete-confirm" role="group" aria-label="Confirm task deletion"><p>Delete “'+esc(field(ui,task,'title'))+'”? Its due date and notes will be removed too.</p><div class="dc-form-actions"><button type="button" class="dc-delete" data-dc-confirm-delete="'+esc(task.id)+'"'+focusAttr(key+':confirm-delete')+'>Delete task</button><button type="button" class="dc-save" data-dc-cancel-delete="'+esc(task.id)+'"'+focusAttr(key+':keep')+'>Keep task</button></div></div>':'');
  }
  function taskHTML(task,group,ui) {
    const status = statusOf(task), key = taskKey(task), href = safeHref(task.href), title = esc(task.title);
    const label = isCourse(task) ? 'Update progress' : task.actionLabel || 'Open task';
    const editable = canEditStatus(task), due = dateLabel(task.dueOn);
    const heading = editable ? '<label class="dc-check"><input type="checkbox" data-dc-check="'+esc(task.id)+'"'+(status === 'done' ? ' checked' : '')+focusAttr(key+':check')+'><span>'+title+'</span></label>' :
      '<div class="dc-readonly-title"><span class="dc-auto-mark" aria-hidden="true">'+(status === 'done' ? '✓' : '·')+'</span><strong>'+title+'</strong></div>';
    const readonlyNote = editable ? '' : '<p class="dc-auto-note">'+(isCourse(task) ? 'This status follows your saved course progress. School transfer decisions stay separate.' : 'This status updates from your saved plan.')+'</p>';
    return '<li class="dc-task" data-dc-task="'+esc(task.id)+'" data-dc-group="'+esc(group.id)+'" data-status="'+status+'"><div class="dc-task-top"><div class="dc-task-copy">'+heading+
      (task.detail && !task.custom ? '<p class="dc-task-detail">'+esc(task.detail)+'</p>' : '')+
      '<div class="dc-task-meta"><span class="dc-status dc-status-'+status+'">'+labels[status]+'</span>'+(due ? '<span>Due <time datetime="'+esc(task.dueOn)+'">'+esc(due)+'</time></span>' : '')+'</div></div></div>'+
      '<div class="dc-task-tools">'+(href ? '<a href="'+esc(href)+'"'+externalAttrs(href)+focusAttr(key+':link')+'>'+esc(label)+externalLabel(href)+arrow+'</a>' : '')+
      '<details class="dc-task-details" data-dc-open="'+esc(key)+'"'+openAttr(ui,key)+'><summary'+focusAttr(key+':details')+'><span>Details</span><span class="dc-sr-only"> for '+title+'</span>'+chevron+'</summary><form class="dc-edit-form" data-dc-form="'+esc(key)+'" data-dc-edit="'+esc(task.id)+'">'+readonlyNote+formFields(ui,task)+(Calendar?.eligible(task)?'<div class="dc-calendar"><button type="button" class="dc-save" data-dc-calendar="'+esc(task.id)+'"'+focusAttr(key+':calendar')+'>Add to calendar</button><p>After importing, choose a reminder in your calendar app.</p></div>':'')+'</form></details></div></li>';
  }
  function groupHTML(group,ui) {
    const tasks = list(group.tasks), pending = tasks.filter(task => statusOf(task) !== 'done'), done = tasks.filter(task => statusOf(task) === 'done');
    const groupKey = 'group:'+group.id, doneKey = 'done:'+group.id;
    if (!tasks.length) return '';
    return '<details class="dc-group" data-dc-open="'+esc(groupKey)+'"'+openAttr(ui,groupKey,!group.collapsed)+'><summary'+focusAttr(groupKey)+'><span>'+esc(group.title)+'</span><small>'+done.length+' of '+tasks.length+' done</small>'+chevron+'</summary><div class="dc-group-body">'+
      (pending.length ? '<ul class="dc-task-list">'+pending.map(task=>taskHTML(task,group,ui)).join('')+'</ul>' : '<p class="dc-group-complete">All tasks in this group are done.</p>')+
      (done.length ? '<details class="dc-done" data-dc-open="'+esc(doneKey)+'"'+openAttr(ui,doneKey)+'><summary'+focusAttr(doneKey)+'><span>Completed ('+done.length+')</span>'+chevron+'</summary><ul class="dc-task-list">'+done.map(task=>taskHTML(task,group,ui)).join('')+'</ul></details>' : '')+'</div></details>';
  }
  function addHTML(ui) {
    const titleId = localId(ui,'add-title'), dueId = localId(ui,'add-due'), notesId = localId(ui,'add-notes');
    return '<form class="dc-add-form" data-dc-form="add" data-dc-add><h3>Add your own task</h3><div class="dc-add-row"><label for="'+titleId+'">Task<input id="'+titleId+'" name="title" value="'+esc(field(ui,null,'title'))+'" required maxlength="160" placeholder="What do you need to do?"'+focusAttr('add:title')+'></label><button type="submit" class="dc-save"'+focusAttr('add:save')+'>Add task</button></div>'+ 
      '<details class="dc-add-options" data-dc-open="add-options"'+openAttr(ui,'add-options')+'><summary'+focusAttr('add:options')+'>Add a due date or notes <span>(optional)</span>'+chevron+'</summary><div class="dc-form-row"><label for="'+dueId+'">Due date<input id="'+dueId+'" name="dueOn" type="date" value="'+esc(field(ui,null,'dueOn'))+'"'+focusAttr('add:dueOn')+'></label></div><label for="'+notesId+'">Notes<textarea id="'+notesId+'" name="notes" rows="2" maxlength="1000"'+focusAttr('add:notes')+'>'+esc(field(ui,null,'notes'))+'</textarea></label></details></form>';
  }
  function chooseNext(model) {
    const tasks = list(model.tasks), available = tasks.filter(task => ['todo','doing'].includes(statusOf(task)));
    if (model.nextTask && statusOf(model.nextTask) !== 'done' && (statusOf(model.nextTask) !== 'waiting' || !available.length)) return model.nextTask;
    return available.find(task => statusOf(task) === 'doing') || available[0] || tasks.find(task => statusOf(task) === 'waiting') || null;
  }
  function nextHTML(model,ui) {
    const task = chooseNext(model), href = safeHref(task?.href);
    const title = task ? task.title : 'Your checklist is up to date';
    const detail = task?.detail || (task ? '' : 'You can add a task or review completed items below.');
    const label = task ? isCourse(task) ? 'Update progress' : task.actionLabel || 'View task' : 'View checklist';
    return '<section class="dc-next" aria-label="Your next step"><span class="dc-next-icon" aria-hidden="true">'+arrow+'</span><div class="dc-next-copy"><span class="dc-next-kicker">Your next step</span><h2>'+esc(title)+'</h2>'+(detail ? '<p>'+esc(detail)+'</p>' : '')+(task && statusOf(task) === 'waiting' ? '<span class="dc-status dc-status-waiting">Waiting</span>' : '')+'</div>'+
      (href ? '<a class="dc-next-button" href="'+esc(href)+'"'+externalAttrs(href)+focusAttr('next')+'>'+esc(label)+externalLabel(href)+arrow+'</a>' : '<button type="button" class="dc-next-button" data-dc-reveal="'+esc(task?.id || '')+'"'+focusAttr('next')+'>'+esc(label)+arrow+'</button>')+'</section>';
  }
  function render(ui,model) {
    if (model.valid === false) {
      ui.content.innerHTML = '<section class="dc-unavailable" role="status" aria-label="Your checklist"><strong tabindex="-1"'+focusAttr('checklist')+'>Your checklist could not be opened</strong><p>'+esc(model.error || 'Please reopen your current plan to view and update its checklist.')+'</p></section>';
      return;
    }
    const done = Math.max(0,Number(model.progress?.done) || 0), total = Math.max(done,Number(model.progress?.total) || 0);
    ui.content.innerHTML = nextHTML(model,ui)+'<details class="dc-checklist" data-dc-open="checklist"'+openAttr(ui,'checklist')+'><summary'+focusAttr('checklist')+'><strong>Your checklist</strong><span class="dc-progress-copy">'+done+' of '+total+' done</span><progress value="'+done+'" max="'+Math.max(total,1)+'" aria-label="Checklist progress">'+done+' of '+total+' done</progress>'+chevron+'</summary><div class="dc-checklist-body">'+list(model.groups).map(group=>groupHTML(group,ui)).join('')+addHTML(ui)+'</div></details>';
  }
  function actionFor(ui,type,fields) {
    return {type,...fields,planContext:ui.model.planContext};
  }
  function dispatch(ui,action,message,formKey) {
    if (ui.model.valid === false) {announce(ui,ui.model.error || 'Reopen your current plan before editing its checklist.',true);return;}
    if (typeof ui.options.onAction !== 'function') {announce(ui,'Your checklist is not ready to save changes. Please try again.',true);return;}
    remember(ui);
    const focus = snapshotFocus(ui), previousDraft = ui.formDrafts.get(formKey), previousOpen = ui.open.get(formKey), wasDirty = ui.dirtyForms.has(formKey);
    if (formKey) {ui.formDrafts.delete(formKey);ui.dirtyForms.delete(formKey);if (formKey !== 'add') ui.open.set(formKey,false);}
    const fail = error => {
      if (formKey && previousDraft) ui.formDrafts.set(formKey,previousDraft);
      if (formKey && wasDirty) ui.dirtyForms.add(formKey);
      if (formKey && previousOpen !== undefined) ui.open.set(formKey,previousOpen);
      render(ui,ui.model);
      restoreFocus(ui,focus);
      announce(ui,error?.message || 'That change could not be saved. Please try again.',true);
    };
    try {
      const result = ui.options.onAction(action);
      if (result && typeof result.then === 'function') result.then(value=>value === false ? fail() : announce(ui,message)).catch(fail);
      else if (result === false) fail();
      else announce(ui,message);
    } catch (error) {fail(error);}
  }
  function reveal(ui,id) {
    const task = list(ui.model.tasks).find(item=>item.id === id);
    remember(ui);
    ui.open.set('checklist',true);
    if (task) {ui.open.set('group:'+task.group,true);ui.open.set(taskKey(task),true);if (statusOf(task) === 'done') ui.open.set('done:'+task.group,true);}
    render(ui,ui.model);
    const target = findFocus(ui,task ? taskKey(task)+':details' : 'checklist');
    target?.focus({preventScroll:true});
    target?.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  function attach(ui) {
    const rememberInput = event => {
      const form = event.target.closest('form[data-dc-form]');
      if (form) ui.dirtyForms.add(form.dataset.dcForm);
    };
    ui.content.addEventListener('input',rememberInput);
    ui.content.addEventListener('change',event=>{
      rememberInput(event);
      const input = event.target.closest('[data-dc-check]');
      if (!input) return;
      const task = list(ui.model.tasks).find(item=>item.id === input.dataset.dcCheck);
      if (!task || !canEditStatus(task)) return;
      dispatch(ui,actionFor(ui,'set-task',{taskId:task.id,status:input.checked ? 'done' : 'todo'}),input.checked ? 'Task marked done.' : 'Task moved to To do.');
    });
    ui.content.addEventListener('click',event=>{
      const calendarButton = event.target.closest('[data-dc-calendar]');
      if (calendarButton) {
        event.preventDefault();const task = list(ui.model.tasks).find(item=>item.id === calendarButton.dataset.dcCalendar);
        if (!task || !Calendar?.eligible(task)) {announce(ui,'Save a due date for an unfinished task first.',true);return;}
        const form = calendarButton.closest('form[data-dc-form]');
        if (['title','dueOn','status'].some(name=>{const input=form?.querySelector('[name="'+name+'"]');return input && input.value !== String(task[name] ?? '');})) {announce(ui,'Save your task changes before adding it to your calendar.',true);return;}
        try {Calendar.download(task,ui.node.ownerDocument.defaultView);announce(ui,'Calendar file downloaded. Import it and choose a reminder in your calendar app.');calendarButton.focus({preventScroll:true});}
        catch (error) {announce(ui,error.message,true);}
        return;
      }
      const revealButton = event.target.closest('[data-dc-reveal]');
      if (revealButton) {reveal(ui,revealButton.dataset.dcReveal);return;}
      const keepButton = event.target.closest('[data-dc-cancel-delete]');
      if(keepButton){
        event.preventDefault();remember(ui);ui.pendingDelete=null;render(ui,ui.model);
        findFocus(ui,'task:'+keepButton.dataset.dcCancelDelete+':delete')?.focus({preventScroll:true});
        announce(ui,'Task kept.');return;
      }
      const confirmDelete = event.target.closest('[data-dc-confirm-delete]');
      if(confirmDelete){
        event.preventDefault();const id=confirmDelete.dataset.dcConfirmDelete,task=list(ui.model.tasks).find(item=>item.id===id);
        if(!task?.custom||ui.pendingDelete?.id!==id||ui.pendingDelete.signature!==deleteSignature(ui.model,task)){
          ui.pendingDelete=null;remember(ui);render(ui,ui.model);announce(ui,'This task changed. Review it before deleting.',true);return;
        }
        ui.pendingDelete=null;dispatch(ui,actionFor(ui,'delete-task',{taskId:id}),'Task deleted.','task:'+id);return;
      }
      const deleteButton = event.target.closest('[data-dc-delete]');
      if(deleteButton){
        event.preventDefault();const task=list(ui.model.tasks).find(item=>item.id===deleteButton.dataset.dcDelete);
        if(!task?.custom)return;
        remember(ui);ui.pendingDelete={id:task.id,signature:deleteSignature(ui.model,task)};
        ui.open.set(taskKey(task),true);render(ui,ui.model);
        const keep=findFocus(ui,taskKey(task)+':keep');keep?.focus({preventScroll:true});keep?.scrollIntoView?.({block:'nearest'});
        announce(ui,'Choose Delete task to remove it, or Keep task to go back.');
      }
    });
    ui.content.addEventListener('submit',event=>{
      const form = event.target.closest('form[data-dc-form]');
      if (!form) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = {};
      form.querySelectorAll('[name]').forEach(input=>{values[input.name] = input.value;});
      if (form.hasAttribute('data-dc-add')) {
        dispatch(ui,actionFor(ui,'add-task',values),'Task added.','add');
        return;
      }
      const task = list(ui.model.tasks).find(item=>item.id === form.dataset.dcEdit);
      if (task) {ui.pendingDelete=null;dispatch(ui,actionFor(ui,task.custom ? 'edit-task' : 'set-task',{taskId:task.id,...values}),'Task updated.',taskKey(task));}
    });
  }
  function update(node,state,draft,options = {}) {
    if (!node || !Checklist?.build) return null;
    let ui = views.get(node);
    if (!ui) {
      node.innerHTML = '<div class="student-checklist"><div data-dc-content></div><p class="dc-live" role="status" aria-live="polite" aria-atomic="true"></p></div>';
      ui = {node,id:'dc'+(++sequence),content:node.querySelector('[data-dc-content]'),live:node.querySelector('.dc-live'),open:new Map(),formDrafts:new Map(),dirtyForms:new Set(),pendingDelete:null,options,model:null,scope:null};
      views.set(node,ui);
      attach(ui);
    }
    const focus = snapshotFocus(ui);
    remember(ui);
    const model = Checklist.build(state,draft,options);
    const scope = typeof model.scope === 'string' ? model.scope : JSON.stringify(model.scope);
    if (ui.scope !== null && ui.scope !== scope) {
      const checklistOpen = ui.open.get('checklist');
      ui.open.clear();
      if (checklistOpen !== undefined) ui.open.set('checklist',checklistOpen);
      ui.formDrafts.clear();
      ui.dirtyForms.clear();
      ui.pendingDelete=null;
      announce(ui,'');
    }
    if(ui.pendingDelete&&(model.valid===false||ui.pendingDelete.signature!==deleteSignature(model,list(model.tasks).find(task=>task.id===ui.pendingDelete.id))))ui.pendingDelete=null;
    ui.scope = scope;
    ui.model = model;
    ui.options = options;
    render(ui,model);
    restoreFocus(ui,focus);
    return model;
  }
  return Object.freeze({update});
}));
