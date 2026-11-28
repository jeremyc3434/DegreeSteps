/* A shared student workspace. Private drafts never leave the device from this shell. */
(function () {
  'use strict';
  const page = location.pathname.split('/').pop() || 'portal.html';
  // The pages that change the one device draft (plan + My courses) all show the same account save action and status.
  const SAVE_PAGES = ['plan.html','portal.html','courses.html','compare-plans.html','import-courses.html','credits-worth.html','degree-audit.html'];
  const parameters = new URLSearchParams(location.search), task = parameters.get('task'), preferenceView = page === 'portal.html' && parameters.get('view') === 'preferences';
  const labels = {'start.html':'Build my plan','guided.html':'Find my degree','degree-audit.html':'Build my own plan','programs.html':'Find a degree','credits-worth.html':'What are my credits worth?','campuses.html':'Find a campus','growth.html':'Activity overview','courses.html':'My courses','learn.html':'Course help','import-courses.html':'Add my courses','template-import.html':'Import a degree spreadsheet','compare-plans.html':'Compare plans','portal.html':preferenceView ? 'My preferences' : 'My plan','plan.html':task === 'credits' ? 'My courses' : 'My plan','library.html':'Explore','community.html':'Community','account.html':'My account','school.html':'School insights','request-plan.html':'Build from a degree link','admin.html':'Manage DegreeSteps','coverage.html':'Academic coverage','help.html':'Help & support'};
  if (!labels[page]) return;
  const paths = {
    plan:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    credits:'<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10v6c3 3 9 3 12 0v-6M22 8v7"/>',
    explore:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6M11 8v6"/>',
    community:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    arrow:'<path d="M7 17 17 7M7 7h10v10"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    more:'<path d="M5 6h14M5 12h14M5 18h14"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
  const wordmark = '<span class="ds-wordmark">Degree<span class="ds-wordmark-steps">Steps</span></span>';
  const active = page === 'learn.html' ? 'learning' : preferenceView ? 'preferences' : page === 'help.html' ? 'help' : ['courses.html','import-courses.html'].includes(page) ? 'credits' : ['community.html','template-import.html'].includes(page) ? 'community' : ['programs.html','credits-worth.html','school.html','request-plan.html','campuses.html','guided.html'].includes(page) ? 'programs' : page === 'library.html' ? 'explore' : task === 'credits' ? 'credits' : page === 'account.html' ? 'account' : ['admin.html','growth.html','coverage.html'].includes(page) ? 'admin' : 'plan';
  const links = [
    {id:'plan',title:'My plan',href:'plan.html',icon:'plan'},
    {id:'credits',title:'My courses',href:'courses.html?tab=mine',icon:'credits'},
    {id:'learning',title:'Course help',href:'learn.html',icon:'plan'},
    {id:'programs',title:'Find a degree',href:'programs.html',icon:'explore'},
    {id:'community',title:'Community',href:'community.html?tab=feed',icon:'community'}
  ];
  const nav = () => links.map(link => '<a href="'+link.href+'"'+(active === link.id ? ' aria-current="page"' : '')+' data-shell-nav="'+link.id+'">'+icon(link.icon)+'<span>'+link.title+'</span></a>').join('');
  const shell = document.createElement('div');
  shell.id = 'degree-app-shell';
  // Workspace navigation stays in the same place on every page. The public website keeps its own header.
  const managementLinks = active === 'admin' ? '<a class="dp-shell-website" href="admin.html">Manage DegreeSteps</a><a class="dp-shell-website" href="coverage.html">Academic coverage</a><a class="dp-shell-website" href="growth.html">Activity overview</a>' : '';
  const extraLinks = '<a class="dp-shell-website" href="compare-plans.html"'+(page === 'compare-plans.html' ? ' aria-current="page"' : '')+'>Compare degrees</a><a class="dp-shell-website dp-shell-preferences" href="portal.html?view=preferences"'+(preferenceView ? ' aria-current="page"' : '')+'>My preferences</a><a class="dp-shell-website" href="library.html"'+(active === 'explore' ? ' aria-current="page"' : '')+'>Schools & resources</a><a class="dp-shell-website" href="/transfer/">Transfer guides</a><a class="dp-shell-website" href="help.html"'+(page === 'help.html' ? ' aria-current="page"' : '')+'>Help & support</a>'+managementLinks+'<a class="dp-shell-website" href="/">Visit website'+icon('arrow')+'</a>';
  const sidebar = '<aside class="dp-shell-sidebar" aria-label="Student workspace"><a class="dp-shell-brand" href="/" aria-label="DegreeSteps home">'+wordmark+'</a><nav class="dp-shell-nav" aria-label="Your workspace">'+nav()+'</nav><nav class="dp-shell-secondary" aria-label="Plan tools and resources">'+extraLinks+'</nav><div class="dp-shell-sidebar-bottom"><a class="dp-shell-account" href="account.html"'+(active === 'account' ? ' aria-current="page"' : '')+'><span class="dp-shell-avatar">'+icon('person')+'</span><span><strong data-shell-account-label>My account</strong><small data-shell-account-detail>Open account settings</small></span></a></div></aside>';
  const headerHTML = '<header class="dp-shell-header"><div class="dp-shell-location"><a class="dp-shell-mobile-brand" href="/" aria-label="DegreeSteps home">'+wordmark+'</a><div class="dp-shell-page-title" id="dp-shell-page-title">'+labels[page]+'</div></div><span class="dp-shell-save" role="status" aria-live="polite" hidden>'+icon('check')+'<span></span></span><div class="dp-shell-header-actions"><a class="dp-shell-save-account" href="account.html#account-save-form" title="Save this plan to your account" hidden>Save plan</a><a class="dp-shell-account-button" href="account.html" aria-label="My account">'+icon('person')+'</a><button class="dp-shell-more-toggle" type="button" aria-expanded="false" aria-controls="dp-shell-more-menu">'+icon('more')+'<span>More</span></button></div></header>';
  const phoneMenu = '<nav class="dp-shell-more-menu" id="dp-shell-more-menu" aria-label="More workspace options" hidden><a class="dp-shell-website" href="account.html">My account</a>'+extraLinks+'</nav>';
  shell.innerHTML = sidebar + headerHTML + phoneMenu + '<nav class="dp-shell-bottom" aria-label="Your workspace">'+nav()+'</nav>';
  const skipLink=document.body.querySelector?.(':scope > a:is(.skip-link,.site-skip,.sheet-skip,.growth-skip,.tw-skip,.cv-skip,.campus-skip,.help-skip)');
  if(skipLink&&typeof skipLink.after==='function')skipLink.after(shell);else document.body.prepend(shell);
  document.body.classList.add('dp-app-shell');
  // Status text can wrap at larger text sizes. Content always starts below the measured header.
  const headerNode = shell.querySelector('header');
  const syncHeaderHeight = () => {
    if (!headerNode?.getBoundingClientRect) return;
    const height = Math.ceil(headerNode.getBoundingClientRect().height);
    if (height > 0) document.body.style?.setProperty?.('--dp-header-height', height+'px');
  };
  syncHeaderHeight();
  if (typeof ResizeObserver === 'function' && headerNode) new ResizeObserver(syncHeaderHeight).observe(headerNode);
  // This is a disclosure, not a modal: the primary destinations remain visible below the page.
  const moreToggle = shell.querySelector('.dp-shell-more-toggle'), moreMenu = shell.querySelector('#dp-shell-more-menu');
  const setMoreOpen = open => {
    if (!moreToggle || !moreMenu) return;
    moreToggle.setAttribute('aria-expanded',String(open));moreMenu.hidden=!open;
  };
  moreToggle?.addEventListener?.('click',() => setMoreOpen(moreToggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && moreToggle?.getAttribute('aria-expanded') === 'true') {setMoreOpen(false);moreToggle.focus();}
  });
  document.addEventListener('click',event => {
    if (moreToggle?.getAttribute('aria-expanded') === 'true' && !moreToggle.contains(event.target) && !moreMenu.contains(event.target)) setMoreOpen(false);
  });
  moreMenu?.addEventListener?.('click',event => {if(event.target.closest?.('a'))setMoreOpen(false);});
  if (typeof matchMedia === 'function') matchMedia('(min-width:901px)').addEventListener?.('change',event => {if(event.matches)setMoreOpen(false);});
  if (page === 'library.html') {
    document.body.classList.add('dp-explore-page');
    const heading = document.querySelector('#explore .section-head h1, #explore .section-head h2');
    if (heading) heading.textContent = 'Find a school that fits.';
    const eyebrow = document.querySelector('#explore .section-head .eyebrow');
    if (eyebrow) eyebrow.textContent = 'EXPLORE SCHOOLS';
    const intro = document.querySelector('#explore .section-head p');
    if (intro) intro.textContent = 'Compare transfer policies, then build your personal plan.';
  }
  function setPage(title) {
    if (typeof title === 'string' && title.trim()) document.getElementById('dp-shell-page-title').textContent = title.slice(0,80);
  }
  let signedIn=false, accountUser=null, accountIdentityKnown=false, accountStorageAvailable=true, savePresentationId=0, localSaveAvailable=true;
  function accountSaveAction() {const link=shell.querySelector('.dp-shell-save-account'),draft=window.DegreeAccount?.deviceDraft?.(),meaningful=Boolean(draft&&(draft.learning?.length||!draft.sheet?.isExample&&(draft.selectedPathwayId||draft.profile?.pathwayId)));if(link){link.hidden=!SAVE_PAGES.includes(page)||!meaningful;link.href='#';link.setAttribute?.('data-open-plan-save','');link.textContent='Save plan';link.title='Save this plan to your account';}return meaningful;}
  async function savePresentation() {
    const request=++savePresentationId,meaningful=accountSaveAction(),target=shell.querySelector('.dp-shell-save'),link=shell.querySelector('.dp-shell-save-account');
    if(!target)return;
    // The account status sits beside the Save action, so it shows only on the pages that offer it.
    if(!meaningful||!SAVE_PAGES.includes(page)){target.hidden=true;return;}
    let state={label:signedIn?'Not saved to your account':'Sign in to save',action:'Save plan',kind:'unsaved'};
    try {if(window.DegreeAccount?.saveState)state=await window.DegreeAccount.saveState(accountUser);}catch{}
    if(!accountIdentityKnown)state={kind:'unknown',label:'Check sign-in to save',action:'Save plan'};
    else if(accountUser&&!accountStorageAvailable)state={kind:'unavailable',label:'Saved plans unavailable',action:'Save plan'};
    if(request!==savePresentationId)return;
    const label=localSaveAvailable?state.label:'Changes could not be saved';
    target.querySelector('span').textContent=label;target.hidden=false;
    target.dataset.saveState=localSaveAvailable?state.kind:'unavailable';
    const check=target.querySelector('svg');if(check?.style)check.style.display=localSaveAvailable&&state.kind==='saved'?'':'none';
    target.classList.toggle('dp-shell-save-warning',!localSaveAvailable||state.kind==='changed');
    if(link)link.textContent=state.action;
  }
  accountSaveAction();
  function saved(deviceSaved) {
    if (typeof deviceSaved !== 'boolean' || page === 'account.html' || page === 'community.html' || page === 'library.html') return;
    localSaveAvailable=deviceSaved;savePresentation();
  }
  const saveEvent = event => saved(event.detail?.deviceSaved);
  window.addEventListener('degreepath:save',saveEvent);
  document.addEventListener('degreepath:save',saveEvent);
  const existingSave = document.getElementById('portal-saved');
  if (existingSave) {
    const reflect = () => {
      if (/saved on this device/i.test(existingSave.textContent)) saved(true);
      else if (/unavailable/i.test(existingSave.textContent)) saved(false);
    };
    reflect();new MutationObserver(reflect).observe(existingSave,{childList:true,characterData:true,subtree:true});
  }
  let lastAccountRefresh = 0, accountRefreshId = 0;
  async function account(refresh) {
    if (!window.DegreeAccount?.session) return;
    const refreshId = ++accountRefreshId;
    lastAccountRefresh = Date.now();
    let session, storageAvailable = true;
    try {session = await window.DegreeAccount.session(Boolean(refresh));}
    catch {
      storageAvailable = false;
      try {session = await window.DegreeAccount.auth('/session');}
      catch {session = null;}
    }
    if (refreshId !== accountRefreshId) return;
    {
      const known = session && Object.prototype.hasOwnProperty.call(session,'user'), user = session?.user;
      signedIn=Boolean(user)&&storageAvailable;accountUser=user||null;accountIdentityKnown=Boolean(known);accountStorageAvailable=storageAvailable;savePresentation();
      const label = shell.querySelector('[data-shell-account-label]');
      const detail = shell.querySelector('[data-shell-account-detail]');
      const avatar = shell.querySelector('.dp-shell-avatar');
      label.textContent = user ? (user.alias || 'My account') : 'My account';
      const headerAccount = shell.querySelector('[data-header-account]');
      if (headerAccount) headerAccount.textContent = user ? 'My account' : 'Sign in';
      detail.textContent = !known ? 'Account status unavailable' : user ? storageAvailable ? 'My saved plans' : 'Signed in · Saved plans unavailable' : 'Sign in to save your plans';
      if (user?.alias) {avatar.textContent = user.alias.trim().slice(0,1).toUpperCase();avatar.classList.add('dp-shell-avatar-initial');}
      else {avatar.innerHTML = icon('person');avatar.classList.remove('dp-shell-avatar-initial');}
    }
  }
  account(false);
  const accountContent = document.getElementById('account-content');
  if (accountContent) new MutationObserver(() => account(false)).observe(accountContent,{childList:true});
  window.addEventListener('focus',() => {if (Date.now()-lastAccountRefresh>30000) account(true);});
  window.addEventListener('degreepath:account',() => account(true));
  window.addEventListener('degreepath:plan-saved',() => savePresentation());
  window.addEventListener('storage',event => {if([window.DegreeAccount?.DRAFT_KEY,window.DegreeAccount?.LINK_KEY,null].includes(event.key))savePresentation();});
  window.DegreeAppShell = Object.freeze({setPage,setSaved:saved});
}());
