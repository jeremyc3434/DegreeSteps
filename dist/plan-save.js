/* A deliberate private account save, beside the student's working plan. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {root.DegreePlanSave = Object.freeze({open:api.open,init:api.init,clearPending:api.clearPending}); api.init();}
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'degreesteps-plan-save-intent-v1', TTL = 60 * 60 * 1000;
  // Every page that changes the one device draft (plan + My courses) offers the same account save.
  const pages = new Set(['/plan.html','/portal.html','/courses.html','/compare-plans.html','/credits-worth.html','/degree-audit.html']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog = null, opener = null, model = null, revision = 0, initialized = false;
  function storage() {try {return root.sessionStorage;} catch {return null;}}
  function safePage(value, origin = 'https://degreesteps.invalid') {
    if (typeof value !== 'string' || value.length > 2048 || value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) return null;
    if (/%|(?:^|\/)\.{1,2}(?:\/|$)/.test(value.split(/[?#]/,1)[0])) return null;
    try {
      const url = new URL(value, origin + '/');
      if (url.origin !== new URL(origin).origin || url.username || url.password || !['http:','https:'].includes(url.protocol)) return null;
      if (url.pathname === '/import-courses.html') return '/courses.html';
      return pages.has(url.pathname) ? url.pathname : null;
    } catch {return null;}
  }
  function clearPending() {try {storage()?.removeItem(KEY);} catch {}}
  function rememberIntent(path, store = storage(), now = Date.now()) {
    const safe = safePage(path);
    if (!safe || !store) return false;
    try {store.setItem(KEY,JSON.stringify({version:1,path:safe,expiresAt:now+TTL})); return true;} catch {return false;}
  }
  function readIntent(store = storage(), now = Date.now()) {
    try {
      const raw = store?.getItem(KEY); if (!raw) return null;
      if (raw.length > 500) throw Error('Invalid save intent.');
      const value = JSON.parse(raw), path = safePage(value?.path);
      if (!value || Object.keys(value).some(key=>!['version','path','expiresAt'].includes(key)) || value.version !== 1 || !path || path !== value.path || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now+TTL) throw Error('Expired save intent.');
      return {version:1,path,expiresAt:value.expiresAt};
    } catch {try {store?.removeItem(KEY);} catch {} return null;}
  }
  function meaningfulDraft(value) {
    if (!value || value.version !== 3 || !value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile) || !Array.isArray(value.learning)) return false;
    return Boolean(value.learning.length || value.sheet?.isExample !== true && (value.selectedPathwayId || value.profile.pathwayId || value.profile.school && value.profile.degree));
  }
  function defaultTitle(draft) {return String(draft?.profile?.degree || (draft?.learning?.length ? 'My courses' : 'My degree plan')).trim().slice(0,120) || 'My degree plan';}
  async function prepareReview(Account) {
    const session = await Account.session(true), draft = Account.deviceDraft();
    if (!meaningfulDraft(draft)) throw Error('Choose a degree plan or save a course first. Your existing work has not changed.');
    const review = {user:session.user || null,draft,snapshot:JSON.stringify(draft),title:defaultTitle(draft),linked:null,updateAllowed:false,conflict:false,metadataUnavailable:false};
    if (review.user) {
      const linked = Account.linkedPlan(review.user);
      if (linked) {
        try {
          const data = await Account.api('/plans/'+encodeURIComponent(linked.planId)), item = data.item;
          if (item) {
            const currentTarget=draft.selectedPathwayId || draft.profile.pathwayId || '', savedTarget=item.state?.selectedPathwayId || item.state?.profile?.pathwayId || '';
            const sameTarget = String(item.school || '') === String(draft.profile.school || '') && String(item.degree || '') === String(draft.profile.degree || '') && currentTarget === savedTarget && JSON.stringify(draft.targetIdentity || null) === JSON.stringify(item.state?.targetIdentity || null);
            review.linked = linked;
            review.conflict = sameTarget && item.revision !== linked.revision;
            review.updateAllowed = sameTarget && !review.conflict;
          }
        } catch {review.metadataUnavailable = true;}
      }
    }
    return review;
  }
  async function guardedUpload(Account, review, {consent=false,update=false} = {}) {
    if (consent !== true) throw Error('Choose to save this private plan before continuing.');
    if (!review?.user?.id || !review.snapshot) throw Error('Sign in before saving your private plan.');
    if (update && !review.updateAllowed) throw Error('Review the saved account copy, or save a new copy.');
    return Account.uploadDraft({title:review.title,consent:true,update,expectedOwnerId:review.user.id,expectedDraft:review.snapshot});
  }
  function show() {
    if (typeof dialog.showModal === 'function') {if (!dialog.open) dialog.showModal();}
    else dialog.setAttribute('open','');
    dialog.querySelector('h2')?.focus();
  }
  function close() {
    if (model?.saving) return;
    revision++; clearPending(); model = null;
    if (typeof dialog?.close === 'function') dialog.close(); else dialog?.removeAttribute('open');
    if (opener?.isConnected !== false) opener?.focus?.();
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = root.document.createElement('dialog'); dialog.id = 'degree-plan-save-dialog'; dialog.className = 'plan-save-dialog';
    dialog.setAttribute('aria-labelledby','plan-save-title'); root.document.body.append(dialog);
    dialog.addEventListener('cancel',event=>{if(model?.saving)event.preventDefault();else {event.preventDefault();close();}});
    dialog.addEventListener('close',()=>{if(!model?.saving){revision++;clearPending();model=null;opener?.focus?.();}});
  }
  function render() {
    if (!dialog || !model) return;
    const cancel = '<button type="button" class="plan-save-secondary" data-plan-save-cancel'+(model.saving?' disabled':'')+'>Keep working</button>';
    let body = '';
    if (model.loading) body = '<p role="status">Opening your plan…</p>' + cancel;
    else if (model.success) body = '<p class="plan-save-success" role="status">Saved to your account.</p><p>'+esc(model.review.title)+'</p>'+(model.linkWarning?'<p>This browser could not link this saved plan. You can open it from My account.</p>':'')+'<div class="plan-save-actions"><button type="button" class="plan-save-primary" data-plan-save-cancel>Continue with my plan</button><a href="account.html">My saved plans</a></div>';
    else if (!model.review || model.uncertain) body = '<p class="plan-save-error" role="alert">'+esc(model.error || 'Your private save options could not load.')+'</p><div class="plan-save-actions">'+(model.uncertain?'<a href="account.html">Check my saved plans</a>':'')+'<button type="button" class="plan-save-primary" data-plan-save-retry>'+(model.uncertain?'Reload save options':'Try again')+'</button>'+cancel+'</div>';
    else if (!model.review.user) body = '<p>Sign in to save your plan.</p><div class="plan-save-target"><strong>'+esc(model.review.title)+'</strong>'+(model.review.draft.profile.school?'<span>'+esc(model.review.draft.profile.school)+'</span>':'')+'</div><p>Your progress is here. Sign in, then choose to save your plan, courses and notes to your account.</p><div class="plan-save-actions"><button type="button" class="plan-save-primary" data-plan-save-signin>Sign in to save</button>'+cancel+'</div>';
    else {
      const review = model.review, name = review.user.displayName || review.user.alias || 'your signed-in account';
      body = '<p>Private to '+esc(name)+'.</p><div class="plan-save-target"><strong>'+esc(review.title)+'</strong>'+(review.draft.profile.school?'<span>'+esc(review.draft.profile.school)+'</span>':'')+'<span>'+review.draft.learning.length+' saved course'+(review.draft.learning.length===1?'':'s')+'</span></div>'+
        (review.conflict?'<p class="plan-save-note">A newer version is saved in your account. Open it, or save this plan separately.</p>':'')+
        (review.metadataUnavailable?'<p class="plan-save-note">We could not check the latest saved version. Save a separate plan to avoid replacing it.</p>':'')+
        (model.notice?'<p class="plan-save-note" role="status">'+esc(model.notice)+'</p>':'')+
        '<form id="plan-save-form"><label class="plan-save-consent"><input type="checkbox" name="consent" required'+(model.saving?' checked disabled':'')+'><span>Save this private plan, including my courses and notes, to my account.</span></label><p class="plan-save-error" role="alert">'+esc(model.error || '')+'</p><div class="plan-save-actions"><button type="submit" class="plan-save-primary"'+(model.saving?' disabled':'')+'>'+(model.saving?'Saving…':review.updateAllowed?'Save changes':review.conflict?'Save as a new copy':'Save my plan')+'</button>'+cancel+'</div></form><div class="plan-save-links">'+(review.updateAllowed?'<button type="button" data-plan-save-copy'+(model.saving?' disabled':'')+'>Save as a new copy</button>':'')+'<a href="account.html">Review my saved plans</a></div>';
    }
    dialog.innerHTML = '<h2 id="plan-save-title" tabindex="-1">'+(model.success?'Plan saved.':'Save your plan')+'</h2>'+body;
    dialog.setAttribute('aria-busy',model.saving?'true':'false');
  }
  async function open(options = {}) {
    if (!root.document || !root.DegreeAccount) return false;
    if (model?.saving) return false;
    if (!safePage(root.location?.pathname,root.location?.origin)) return false;
    if (!dialog?.open) opener = root.document.activeElement;
    ensureDialog(); const request = ++revision;
    model = {loading:true,saving:false,review:null}; render(); show();
    try {
      const review = await prepareReview(root.DegreeAccount);
      if (request !== revision || !model) return false;
      model = {loading:false,saving:false,review,error:'',notice:options.notice || ''};render();dialog.querySelector('h2')?.focus();
      return true;
    } catch (error) {if(request===revision&&model){model.loading=false;model.error=error.message;render();}return false;}
  }
  async function save(form, asCopy=false) {
    if (!model?.review || model.saving) return;
    const consent = form?.querySelector('[name="consent"]')?.checked === true;
    if (!consent) {model.error='Choose to save this private plan before continuing.';render();dialog.querySelector('[name="consent"]')?.focus();return;}
    model.saving=true;model.error='';render();
    try {
      const result = await guardedUpload(root.DegreeAccount,model.review,{consent:true,update:!asCopy&&model.review.updateAllowed});
      if (!result?.item?.id || !Number.isInteger(result.item.revision)) throw Error('We could not confirm the saved copy. Review My account before trying again.');
      model.saving=false;model.success=true;model.linkWarning=result.linkSaved===false;clearPending();render();dialog.querySelector('h2')?.focus();
      try {root.dispatchEvent(new root.CustomEvent('DegreeSteps:growth',{detail:{event:'account_plan_saved',context:'workspace'}}));} catch {}
    } catch (error) {
      model.saving=false;
      if (['account_changed','draft_changed'].includes(error.code)) {await open({notice:error.message});return;}
      if (error.status===401 || error.code==='owner_mismatch') {root.DegreeAccount.invalidate?.();await open({notice:'Sign in again to choose where this plan is saved.'});return;}
      if (error.code==='revision_conflict') {model.review.updateAllowed=false;model.review.conflict=true;model.notice='A newer version was saved. Save this plan separately, or open the newer version.';model.error='';}
      else if (!Number.isFinite(error.status) || error.status>=500) {model.uncertain=true;model.error='We could not confirm the account save. Your current plan is still here. Check your saved plans before trying again.';}
      else model.error=error.message || 'Your plan could not be saved. Your current plan is unchanged.';
      render();dialog.querySelector('.plan-save-error')?.focus?.();
    }
  }
  function init() {
    if (initialized || !root.document || !safePage(root.location?.pathname,root.location?.origin)) return;
    initialized=true;
    root.document.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-open-plan-save],[data-plan-save-cancel],[data-plan-save-retry],[data-plan-save-signin],[data-plan-save-copy]');if(!button)return;
      const has=name=>Object.prototype.hasOwnProperty.call(button.dataset || {},name);
      if(has('openPlanSave')){event.preventDefault();open();}
      else if(has('planSaveCancel'))close();
      else if(has('planSaveRetry'))open();
      else if(has('planSaveSignin')){
        const path=safePage(root.location.pathname,root.location.origin);if(!path)return;
        rememberIntent(path);root.location.assign('/account.html?returnTo='+encodeURIComponent(path));
      }else if(has('planSaveCopy'))save(dialog.querySelector('form'),true);
    });
    root.document.addEventListener('submit',event=>{if(event.target?.id!=='plan-save-form')return;event.preventDefault();save(event.target);});
    root.addEventListener?.('storage',event=>{
      if(!dialog?.open||!model?.review||model.saving||model.success||![root.DegreeAccount?.DRAFT_KEY,null].includes(event.key))return;
      if(JSON.stringify(root.DegreeAccount.deviceDraft())!==model.review.snapshot){model.review=null;model.error='Your plan changed in another tab. Reload the save options to review the current version.';render();}
    });
    const pending=readIntent();if(pending&&pending.path===safePage(root.location.pathname,root.location.origin))open();
  }
  return Object.freeze({KEY,TTL,safePage,rememberIntent,readIntent,meaningfulDraft,prepareReview,guardedUpload,open,init,clearPending});
}));
