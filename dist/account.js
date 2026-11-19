/* Account controls never upload a private device draft without an explicit action. */
(function () {
  'use strict';
  const Account = window.DegreeAccount, $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search), Return = window.DegreeAccountReturn;
  let returnStorage = null; try {returnStorage = window.sessionStorage;} catch { /* Sign-in works when session storage is blocked. */ }
  const returnPath = Return?.resolve(location.search,returnStorage,location.origin) || '/account.html';
  let user = null, items = [], authStatus = {configured:false,providers:[]}, mode = params.get('mode') === 'recovery' ? 'recovery' : 'login', pending = null, conflict = false;
  let actionPending = false, migration = null, migrationNotice = '', accountUnavailable = false, verifiedIdentity = null;
  function migrationItems() {return Array.isArray(migration?.items) ? migration.items : [];}
  async function loadMigration({keepNotice = false} = {}) {
    migration = null; if (!keepNotice) migrationNotice = '';
    try {migration = await Account.api('/migration');}
    catch (cause) {
      if (![404,501].includes(cause.status)) migrationNotice = 'We could not check your older saved plans. Your device draft is safe. Try again below.';
    }
  }
  const button = (action,label,secondary = false) => '<button type="button" class="portal-' + (secondary ? 'secondary' : 'primary') + '" data-action="' + action + '">' + esc(label) + '</button>';
  const field = (name,label,value = '',attributes = '') => '<label class="portal-field"><span>' + esc(label) + '</span><input name="' + name + '" value="' + esc(value) + '" ' + attributes + '></label>';
  function notice(message) {$('account-status').textContent = message;}
  function error(message) {$('account-error').hidden = !message; $('account-error').textContent = message || '';}
  function formError(form,message) {const target = form?.querySelector('.account-form-error'); if (target) target.textContent = message; else error(message);}
  function storageDraft() {return Account.deviceDraft();}
  function date(value) {const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value); return Number.isNaN(d.valueOf()) ? 'Date unavailable' : d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
  function recoveryBody() {
    const hasDraft = Boolean(storageDraft());
    const explanation = verifiedIdentity ? 'You’re signed in, but we couldn’t load your saved plans. Try again, or sign out and sign back in.' : 'Try again to load your saved plans, or sign out and sign back in.';
    return '<div class="account-shell account-auth account-recovery"><h1>We couldn’t load your saved plans.</h1><p class="account-lede">' + explanation + '</p><div class="account-recovery-actions">' + button('retry-account','Try again') + button('signout','Sign out',true) + '<a class="account-text-button" href="' + (hasDraft ? 'plan.html' : 'portal.html') + '">' + (hasDraft ? 'Open my plan' : 'Build my plan') + ' →</a></div><p class="account-meta">' + (hasDraft ? 'This does not change the plan on this device.' : 'Your saved plans have not been changed.') + '</p></div>';
  }
  async function recoverAccount() {
    if (mode === 'recovery' && authStatus.recovery) {accountUnavailable = false; error(''); notice(''); render(); return;}
    verifiedIdentity = user;
    if (!verifiedIdentity) {
      try {
        const identity = await Account.auth('/session');
        if (identity && Object.prototype.hasOwnProperty.call(identity,'user')) {
          verifiedIdentity = identity.user;
          if (!identity.user) {user = null; items = []; accountUnavailable = false; error(''); render(); notice('Sign in to open your saved plans.'); return;}
        }
      } catch { /* Recovery controls remain usable when either service is unavailable. */ }
    }
    accountUnavailable = true; pending = null; error(''); notice(''); render();
  }
  function authBody() {
    if (!authStatus.configured) return '<div class="account-shell account-auth"><span class="portal-kicker">Your private portal</span><h1>Your degree plan has a home.</h1><p class="account-lede">Sign-in is being connected. You can already build a plan and save your progress on this device.</p><div class="portal-notice"><strong>Email and Google sign-in are coming.</strong><p>Account setup is not complete yet. You don’t need to wait to explore a degree path.</p></div><a class="portal-primary" href="portal.html">Build my plan</a><div class="portal-links"><a href="portal.html?view=preferences">My preferences</a><a href="resources/">Explore student resources</a></div><p class="account-meta">Keep a private backup from your course plan before switching devices.</p></div>';
    const recovery = mode === 'recovery' && authStatus.recovery;
    const forgot = mode === 'forgot', signup = mode === 'signup';
    const title = recovery ? 'Choose a new password' : forgot ? 'Reset your password' : signup ? 'Create your DegreeSteps account' : 'Welcome back.';
    const subtitle = recovery ? 'Choose a password you haven’t used elsewhere. You’ll sign in with it afterward.' : forgot ? 'We’ll email you a secure link if this address has an account.' : signup ? 'Save your private plans and pick up where you left off on another device.' : 'Sign in to open your saved degree plans.';
    const providers = authStatus.providers || [], emailEnabled = providers.includes('email');
    const tabs = !forgot && !recovery ? '<div class="account-tabs" role="group" aria-label="Account access"><button type="button" aria-pressed="' + !signup + '" data-action="login-mode">Sign in</button><button type="button" aria-pressed="' + signup + '" data-action="signup-mode">Create account</button></div>' : '';
    const google = providers.includes('google') && !forgot && !recovery ? '<a class="portal-secondary account-google" href="/auth/google?returnTo=' + esc(encodeURIComponent(returnPath)) + '" target="_top">Continue with Google</a>' + (emailEnabled ? '<div class="account-divider">or use email</div>' : '') : '';
    const emailForm = emailEnabled || recovery ? '<form id="account-auth-form">' + (!recovery ? field('email','Email address','', 'type="email" autocomplete="email" maxlength="254" required') : '') + (!forgot ? field('password',recovery ? 'New password' : 'Password','', 'type="password" autocomplete="' + (signup || recovery ? 'new-password' : 'current-password') + '" minlength="' + (signup || recovery ? '12' : '1') + '" maxlength="128" required') : '') + (signup || recovery ? '<p class="account-meta">Use at least 12 characters.</p>' : '') + '<p class="account-form-error" role="alert"></p><button class="portal-primary" type="submit">' + (recovery ? 'Save new password' : forgot ? 'Send reset link' : signup ? 'Create account' : 'Sign in') + '</button></form>' : '';
    return '<div class="account-shell account-auth"><h1>' + title + '</h1><p class="account-lede">' + subtitle + '</p>' + tabs + google + emailForm + '<div class="portal-links">' + (!signup && !forgot && !recovery && emailEnabled ? '<button type="button" data-action="forgot-mode">Forgot password?</button>' : '') + (forgot || recovery ? '<button type="button" data-action="login-mode">Back to sign in</button>' : '') + '<a href="portal.html">Explore without signing in</a>' + (!forgot && !recovery ? '<a href="portal.html?view=preferences">My preferences</a>' : '') + '</div><p class="account-meta">Your account plans are private. Publishing a community plan is a separate choice. Read our <a href="privacy/">privacy information</a>.</p></div>';
  }
  function confirmHTML(kind,item) {
    if (pending?.kind !== kind || pending.id !== item.id) return '';
    if (kind === 'open') return '<div class="account-inline-confirm"><p>Open this degree and its plan settings. Your current courses and private notes stay with you. If an older course record differs, we keep your current version and save the older details for review.</p><div class="portal-actions">' + button('backup','Download backup',true) + '<button type="button" class="portal-primary" data-confirm-open="' + esc(item.id) + '">Open this saved plan</button>' + button('cancel','Cancel',true) + '</div></div>';
    return '<div class="account-inline-confirm"><p>Delete this saved account copy? The draft on this device will stay where it is.</p><div class="portal-actions"><button type="button" class="portal-secondary account-danger" data-confirm-delete="' + esc(item.id) + '">Delete saved copy</button>' + button('cancel','Keep it',true) + '</div></div>';
  }
  function planList() {
    const linked = Account.linkedPlan(user);
    if (!items.length) return '<div class="portal-empty"><p>No saved plans yet. Build a plan, then save it here to return to it anytime.</p><a href="portal.html">Build my degree plan →</a></div>';
    return '<ul class="account-plan-list">' + items.map(item => '<li class="account-plan">' + (linked?.planId === item.id ? '<span class="account-current">Current plan</span>' : '') + '<h3>' + esc(item.title) + '</h3><p>' + esc([item.degree,item.school].filter(Boolean).join(' · ')) + '</p><p>Updated ' + esc(date(item.updatedAt)) + '</p><div class="portal-actions"><button type="button" class="portal-primary" data-open-plan="' + esc(item.id) + '">Open plan</button><button type="button" class="portal-secondary" data-download-plan="' + esc(item.id) + '">Download</button><button type="button" class="account-text-button account-danger" data-delete-plan="' + esc(item.id) + '">Delete</button></div>' + confirmHTML('open',item) + confirmHTML('delete',item) + '</li>').join('') + '</ul>';
  }
  function uploadForm() {
    const state = storageDraft(), linked = Account.linkedPlan(user), saved = items.find(item => item.id === linked?.planId);
    if (!state) return '<p>Build a degree plan, then save it to your account.</p><a class="portal-primary" href="portal.html">Build my plan</a>';
    const title = saved?.title || state.profile.degree || 'My degree plan';
    return '<p>' + esc(state.profile.degree || 'Your degree plan') + (state.profile.school ? '<br>' + esc(state.profile.school) : '') + '</p><form id="account-save-form">' + field('title','Plan name',title,'maxlength="160" minlength="3" required') + '<label class="account-consent"><input name="consent" type="checkbox" required><span>Save my plan, including my courses and notes, to my account.</span></label><p class="account-form-error" role="alert"></p>' + (conflict ? '<div class="portal-notice warning"><strong>A newer account version exists.</strong><p>Open it before updating, or save this device draft as a new copy. We haven’t overwritten either version.</p></div>' : '') + '<div class="portal-actions">' + (linked && saved && !conflict ? '<button class="portal-primary" type="submit" name="intent" value="update">Save changes</button>' : '') + '<button class="' + (linked && saved && !conflict ? 'portal-secondary' : 'portal-primary') + '" type="submit" name="intent" value="new">' + (linked && saved ? 'Save as a separate plan' : 'Save plan') + '</button></div></form><p class="account-meta">Saving is your choice. Choose Save changes after editing your plan to update the version in your account.</p><div class="portal-links"><button type="button" data-action="backup">Download backup</button></div>';
  }
  function migrationPanel() {
    const older = migrationItems(), available = migration?.available === true && typeof migration.manifest === 'string';
    const needsRecovery = migration?.status === 'conflict';
    if (!available && !needsRecovery && !migrationNotice) return '';
    const count = older.length, countLabel = count === 1 ? '1 saved plan' : count + ' saved plans';
    return '<section class="account-panel" id="account-migration"><h2>Bring your saved plans with you</h2><p>' + esc(available ? 'We found ' + countLabel + ' from your earlier account. Move them here to keep using them with your current account.' : 'Your earlier saved plans need another check before they can be moved. You can keep a private backup while we resolve this.') + '</p>' + (migrationNotice ? '<p class="portal-notice warning" role="status">' + esc(migrationNotice) + '</p>' : '') + (older.length ? '<details><summary>See ' + countLabel + '</summary><ul>' + older.map(item => '<li>' + esc(item.title || item.degree || 'Saved degree plan') + (item.school ? ' · ' + esc(item.school) : '') + '</li>').join('') + '</ul></details>' : '') + (available ? '<form id="account-migration-form"><label class="account-consent"><input name="consent" type="checkbox" required><span>I want to move these previously saved plans into my current account.</span></label><p class="account-form-error" role="alert"></p><button class="portal-primary" type="submit">Move my saved plans</button></form>' : '') + '<div class="portal-links">' + (migration ? '<button type="button" data-action="migration-backup">Download older plans backup</button>' : '') + '<button type="button" data-action="migration-refresh">Check saved plans again</button></div><p class="account-meta">Moving account copies does not change your courses, notes, or working draft on this device.</p></section>';
  }
  function restoreReview() {
    const state = storageDraft(), review = state?.accountRestoreReview;
    const courses = Array.isArray(review?.courses) ? review.courses : [], notes = Array.isArray(review?.notes) ? review.notes : [];
    if (!courses.length && !notes.length) return '';
    const facts = record => [record?.provider,record?.code,typeof record?.credits === 'number' ? record.credits + ' ' + (record.creditSystem || 'source') + ' credits' : 'Credits need checking',({earned:'Finished','in-progress':'Taking',planned:'Not started',saved:'Saved'})[record?.status] || record?.status].filter(Boolean).join(' · ');
    return '<section class="account-panel" id="account-restore-review"><h2>Your current courses are safe</h2><p>These older details differed from your course collection. We kept them here for reference; they do not add credits or change school approvals.</p><a class="portal-primary" href="portal.html">Continue to my plan</a><details><summary>Review ' + (courses.length + notes.length) + ' saved differences</summary>' + courses.map(entry => {
      const current = state.learning.find(record => record.id === entry.currentRecordId), saved = entry.savedRecord;
      return '<div class="account-plan"><h3>' + esc(saved?.title || 'Older course record') + '</h3><p><strong>Kept in My courses:</strong> ' + esc(current ? facts(current) : 'Your current course records were kept separately.') + '</p><p><strong>Older saved details:</strong> ' + esc(facts(saved)) + '</p></div>';
    }).join('') + notes.map(entry => '<div class="account-plan"><h3>Private note · ' + esc((entry.path || []).join(' / ')) + '</h3><p><strong>Current note:</strong> ' + esc(entry.currentNote) + '</p><p><strong>Older saved note:</strong> ' + esc(entry.savedNote) + '</p></div>').join('') + '</details><p class="account-meta">You can download a private backup containing these details.</p></section>';
  }
  function dashboard() {
    // An edited profile can deliberately retain the neutral "Student" name.
    // Prefer that saved choice over the provider name as well.
    const editedProfile = Number.isFinite(user.createdAt) && Number.isFinite(user.updatedAt) && user.updatedAt > user.createdAt;
    const savedName = typeof user.alias === 'string' && (user.alias !== 'Student' || editedProfile) ? user.alias : '';
    const displayName = savedName || (typeof user.displayName === 'string' ? user.displayName : '');
    const greeting = displayName ? 'Hello, ' + esc(displayName) + (/[.!?…]$/.test(displayName) ? '' : '.') : 'Welcome back.';
    const draft = storageDraft(), personalized = draft?.journey?.profileCompleted === true || draft?.journey?.intakeCompleted === true;
    const linked=Account.linkedPlan(user), recent=items.find(item=>item.id===linked?.planId)||[...items].sort((a,b)=>(Number(new Date(b.updatedAt))||0)-(Number(new Date(a.updatedAt))||0))[0];
    const nextStep = '<div class="portal-actions account-next-step">'+(!personalized&&recent?'<button type="button" class="portal-primary" data-account-next-step data-open-plan="'+esc(recent.id)+'">Continue '+esc(recent.title||recent.degree||'my saved plan')+'</button>':'<a class="portal-primary" data-account-next-step href="'+(personalized?'portal.html':'portal.html?view=setup')+'">'+(personalized?'Continue my plan':'Personalize my recommendations')+'</a>')+'<a class="account-text-button" href="portal.html?view=preferences">My preferences</a></div>';
    const deleteData = pending?.kind === 'delete-data' ? '<form id="account-delete-data-form" class="account-inline-confirm"><p>This permanently removes your saved plans and private portal nickname. It does not delete your sign-in identity, public community posts, or the draft on this device.</p>' + field('confirmation','Type DELETE MY PORTAL DATA','','autocomplete="off" required') + '<p class="account-form-error" role="alert"></p><div class="portal-actions"><button class="portal-secondary account-danger" type="submit">Delete my saved portal data</button>' + button('cancel','Cancel',true) + '</div></form>' : '';
    const clearDevice = pending?.kind === 'clear-device' ? '<div class="account-inline-confirm"><p>This removes the current draft from this browser. Your saved account plans stay in your account. Download a backup first if you need one.</p><div class="portal-actions">' + button('backup','Download backup',true) + button('confirm-clear-device','Remove device draft',true) + button('cancel','Cancel',true) + '</div></div>' : '';
    return '<div class="account-shell"><div class="account-home-heading"><div class="account-heading-row"><div><span class="portal-kicker">Your private account</span><h1>' + greeting + '</h1></div>' + button('signout','Sign out',true) + '</div><p class="account-lede">' + (personalized || recent ? 'Pick up where you left off.' : 'Tell us what matters to you to find degree paths that fit.') + '</p>' + nextStep + '</div><div class="account-layout"><div>' + migrationPanel() + '<section class="account-panel"><h2>My saved plans</h2><p>Your plans are private. Open one to keep going.</p>' + planList() + '</section>' + restoreReview() + '</div><aside><section class="account-panel"><h2>Save my plan</h2>' + uploadForm() + '</section><section class="account-panel"><h2>My profile</h2><form id="account-profile-form">' + field('alias','What should we call you?',savedName,'placeholder="'+esc(displayName || 'Your name')+'" minlength="2" maxlength="60" autocomplete="nickname" required') + '<p class="account-form-error" role="alert"></p><button type="submit" class="portal-secondary">Save name</button></form><p class="account-meta">'+(!savedName && displayName ? 'Using your sign-in profile name. You can choose a different name here.' : 'This is your private portal name.')+' Your public community name is managed separately.</p><p class="account-meta">Signing out leaves the draft on this device. On a shared device, remove it below after keeping any backup you need.</p><details class="account-settings"><summary>Privacy and saved data</summary><div class="portal-links"><button type="button" data-action="clear-device">Remove draft from this device</button><button type="button" class="account-danger" data-action="delete-data">Delete my saved portal data</button></div>' + clearDevice + deleteData + '</details></section></aside></div></div>';
  }
  function render(focus = false) {
    $('account-content').innerHTML = accountUnavailable ? recoveryBody() : mode === 'recovery' && authStatus.recovery ? authBody() : user ? dashboard() : authBody();
    if (pending?.kind === 'clear-device' || pending?.kind === 'delete-data') $('account-content').querySelector('.account-settings').open = true;
    if (focus) {$('account-content').querySelector('h1')?.setAttribute('tabindex','-1'); $('account-content').querySelector('h1')?.focus({preventScroll:true});}
    if (pending?.kind === 'open') requestAnimationFrame(()=>{const confirm=$('account-content').querySelector('[data-confirm-open]');confirm?.scrollIntoView?.({block:'center'});confirm?.focus?.({preventScroll:true});});
    if(user&&location.hash==='#account-save-form')requestAnimationFrame(()=>{const form=$('account-save-form');form?.scrollIntoView({block:'center'});form?.querySelector('input')?.focus({preventScroll:true});});
  }
  async function load({continueToRequested = false} = {}) {
    user = null; verifiedIdentity = null;
    const results = await Promise.allSettled([Account.auth('/status'),Account.session(true)]);
    if (results[0].status === 'fulfilled') authStatus = results[0].value;
    else if (results[1].status === 'rejected') throw results[0].reason;
    if (results[1].status === 'rejected') throw results[1].reason;
    user = results[1].value.user;
    verifiedIdentity = user;
    if (continueToRequested && user && mode !== 'recovery' && returnPath !== '/account.html') {Return?.clear(returnStorage); location.assign(returnPath); return true;}
    if (user) {
      const results = await Promise.all([Account.api('/plans'),loadMigration()]);
      items = Array.isArray(results[0].items) ? results[0].items : [];
    } else {items = []; migration = null; migrationNotice = '';}
    accountUnavailable = false; render();
  }
  function download(state,name) {
    if (!state) throw new Error('There is no device draft to download yet.');
    const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name || 'degreesteps-private-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    notice('Private backup downloaded. Keep it somewhere only you can access.');
  }
  async function run(action) {
    if (actionPending) return;
    actionPending = true; error('');
    try {await action();} catch (e) {if (['storage_unavailable','storage_not_configured'].includes(e.code)) await recoverAccount(); else error(e.message);} finally {actionPending = false;}
  }
  document.addEventListener('click',event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.action) {
      const action = b.dataset.action;
      if (['login-mode','signup-mode','forgot-mode'].includes(action)) {mode = action.split('-')[0]; if (mode === 'forgot') mode = 'forgot'; error(''); render(true);}
      else if (action === 'backup') {try {download(storageDraft());} catch(e) {error(e.message);}}
      else if (action === 'cancel') {pending = null; render();}
      else if (action === 'retry-account') run(async () => {notice('Loading your saved plans…'); try {await load(); notice('');} catch {await recoverAccount();}});
      else if (action === 'migration-refresh') run(async () => {migrationNotice = ''; await loadMigration(); render();});
      else if (action === 'migration-backup') run(async () => {const backup = await Account.api('/migration/backup'); download(backup,'degreesteps-older-saved-plans.json');});
      else if (action === 'clear-device' || action === 'delete-data') {pending = {kind:action}; render();}
      else if (action === 'confirm-clear-device') {
        try {localStorage.removeItem(Account.DRAFT_KEY); localStorage.removeItem('degreepath-pathway-v2'); localStorage.removeItem('degreesteps-profile-draft-v1'); try {window.sessionStorage?.removeItem('degreesteps-plan-save-intent-v1');} catch {} Account.clearLink(); pending = null; render(); notice('The draft was removed from this device. Your saved account plans are unchanged.');} catch (e) {error('Device storage is unavailable. Close this browser profile to protect its local data.');}
      } else if (action === 'signout') run(async () => {
        try {await Account.signOut();}
        catch {throw new Error('We couldn’t sign you out. Try again.');}
        user = null; verifiedIdentity = null; items = []; pending = null; migration = null; migrationNotice = ''; accountUnavailable = false; mode = 'login'; authStatus.recovery = false;
        render(); notice(storageDraft() ? 'Signed out. Your plan on this device is still here.' : 'You’re signed out.');
      });
    } else if (b.dataset.openPlan) {pending = {kind:'open',id:b.dataset.openPlan}; render();}
    else if (b.dataset.deletePlan) {pending = {kind:'delete',id:b.dataset.deletePlan}; render();}
    else if (b.dataset.confirmOpen) run(async () => {const result = await Account.openPlan(b.dataset.confirmOpen); if (result.restore.conflicts) {pending = null; await load(); notice('Your plan is open. Your current courses and notes were kept; older differences are available below.'); $('account-restore-review')?.scrollIntoView({block:'start'});} else location.assign('portal.html');});
    else if (b.dataset.confirmDelete) run(async () => {
      const item = items.find(value => value.id === b.dataset.confirmDelete); if (!item) throw new Error('Reload the saved-plan list and try again.');
      await Account.api('/plans/' + encodeURIComponent(item.id),{method:'DELETE',body:{revision:item.revision}});
      if (Account.linkedPlan(user)?.planId === item.id) Account.clearLink(); pending = null; await load(); notice('Saved account copy deleted. Your device draft is unchanged.');
    });
    else if (b.dataset.downloadPlan) run(async () => {const result = await Account.api('/plans/' + encodeURIComponent(b.dataset.downloadPlan)); download(result.item.state,'degreesteps-saved-plan.json');});
  });
  document.addEventListener('submit',event => {
    const form = event.target; if (!form.id?.startsWith('account-')) return;
    event.preventDefault(); if (actionPending) return; error('');
    const data = new FormData(form), submitter = event.submitter, originalText = submitter?.textContent;
    actionPending = true; if (submitter) {submitter.disabled = true; submitter.textContent = 'Working…';}
    (async () => {
      try {
        if (form.id === 'account-auth-form') {
          const recovery = mode === 'recovery' && authStatus.recovery;
          const endpoint = recovery ? '/passwordchange' : mode === 'forgot' ? '/forgot' : mode === 'signup' ? '/signup' : '/login';
          const result = await Account.auth(endpoint,{method:'POST',body:{...(data.has('email') ? {email:data.get('email')} : {}),...(data.has('password') ? {password:data.get('password')} : {}),...(!recovery ? {returnTo:returnPath} : {})}});
          notice(result.message || (mode === 'forgot' ? 'If an account exists, check your email for the next step.' : 'Your account action is complete.'));
          if (recovery) {mode = 'login'; authStatus.recovery = false;}
          if (mode !== 'forgot') {Account.invalidate(); try {if (await load({continueToRequested:!recovery && !result.needsConfirmation})) {form.reset(); return;}} catch {await recoverAccount();}}
          form.reset();
        } else if (form.id === 'account-migration-form') {
          if (!data.has('consent')) throw new Error('Confirm that you want to move your previously saved plans.');
          if (migration?.available !== true || typeof migration.manifest !== 'string') throw new Error('Check your older saved plans again before moving them.');
          const result = await Account.api('/migration',{method:'POST',body:{consent:true,manifest:migration.manifest,revisions:migrationItems().map(item => ({id:item.id,revision:item.revision}))}});
          migrationNotice = ''; await load();
          notice(result.alreadyMigrated ? 'These saved plans have already been moved. Your device draft is unchanged.' : 'Moved ' + (Number.isInteger(result.imported) ? result.imported : migrationItems().length) + ' saved plan' + (result.imported === 1 ? '' : 's') + '. Your device draft is unchanged.');
        } else if (form.id === 'account-save-form') {
          await Account.uploadDraft({title:data.get('title'),consent:data.has('consent'),update:submitter?.value === 'update'});
          conflict = false; await load(); notice('Private plan saved to your account. Your school’s review status has not changed.');
        } else if (form.id === 'account-profile-form') {await Account.api('/profile',{method:'PATCH',body:{alias:data.get('alias')}}); await load(); notice('Your private portal name was updated.');}
        else if (form.id === 'account-delete-data-form') {
          await Account.api('/profile',{method:'DELETE',body:{confirmation:data.get('confirmation')}}); Account.clearLink(); pending = null; await load(); notice('Your saved portal data was deleted. Your sign-in identity and device draft were not deleted.');
        }
      } catch (e) {
        if (['storage_unavailable','storage_not_configured'].includes(e.code)) await recoverAccount();
        else if (form.id === 'account-migration-form' && e.status === 409) {
          migrationNotice = 'Your saved plans changed while we were moving them. Nothing on this device was changed. Review the latest list and keep a backup before trying again.';
          await loadMigration({keepNotice:true}); render(); notice('The move was paused so we can keep every saved plan safe.');
        } else if (e.status === 409 && form.id === 'account-save-form') {conflict = true; render(); notice('This account plan changed on another device. Save a new copy or open the latest version.');}
        else formError(form,e.message);
      } finally {actionPending = false; if (submitter?.isConnected) {submitter.disabled = false; submitter.textContent = originalText;}}
    })();
  });
  (async () => {
    try {
      if (await load({continueToRequested:!params.has('authError')})) return;
      const callbackError = {expired:'That sign-in link has expired. Request a new one and open it in this browser.',cancelled:'Sign-in was cancelled. You can try again when you’re ready.',unavailable:'Sign-in could not be completed. Please try again.'}[params.get('authError')];
      if (callbackError) error(callbackError);
      if (params.get('auth') === 'confirmed') notice('Your email has been confirmed.');
      if (params.get('mode') === 'recovery' && !authStatus.recovery) {mode = 'forgot'; render(); notice('Request a new reset link and open it in this browser.');}
      if (params.has('authError') || params.has('auth') || params.has('mode')) history.replaceState(null,'',location.pathname + (returnPath !== '/account.html' ? '?returnTo=' + encodeURIComponent(returnPath) : ''));
    } catch {await recoverAccount();}
  })();
}());
