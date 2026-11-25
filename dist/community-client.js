/* Shared, same-origin DegreeSteps community client. No community data is stored locally. */
(function (root, factory) {
  const client = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = client;
  if (root) root.DegreeCommunity = client;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const base = '/api/community';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0, max) : '';
  const catalogYear=value=>{if(typeof value!=='string')return '';value=value.trim().replace(/[–—]/g,'-');if(/^(?:19|20|21)\d{2}(?:0[1-9]|1[0-2])$/.test(value))return value;const match=/^(19\d{2}|20\d{2}|21\d{2})(?:-(19\d{2}|20\d{2}|21\d{2}))?$/.exec(value);return match&&(!match[2]||Number(match[2])===Number(match[1])+1)?value:'';};
  const safeLink = value => { if(typeof value!=='string'||value.length>2048)return '';try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password && u.href.length<=2048 ? u.href : ''; } catch (_) { return ''; } };
  const contextOK = value => typeof value === 'string' && /^(school|program|course|template|post):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
  const Return = root.DegreeAccountReturn || (typeof module === 'object' && module.exports && typeof require === 'function' ? require('./account-return.js') : null);
  const signinUrl = () => {
    const current = root.location, path = current?.pathname;
    const fallback = ['/account.html','/portal.html','/plan.html','/request-plan.html','/admin.html','/school.html','/community.html','/courses.html','/programs.html','/compare-plans.html','/degree-audit.html'].includes(path) ? path : null;
    const destination = Return?.normalize(path + (current?.search || ''),current?.origin) || fallback;
    return destination && destination !== '/account.html' ? '/account.html?returnTo=' + encodeURIComponent(destination) : '/account.html';
  };
  const signoutUrl = () => '/account.html';
  const signinLink = (label) => '<a class="button secondary small" href="' + esc(signinUrl()) + '" target="_top">' + esc(label || 'Sign in to participate') + '</a>';
  let user = null, sessionPromise = null, sessionError = null;
  const mountedContexts = new WeakMap();
  let postRevision = 0, publishRevision = 0;
  async function api(path, options) {
    if(typeof path!=='string'||!/^\/[A-Za-z]/.test(path)||/[\\#\u0000-\u0020]/.test(path)||path.includes('://'))throw new Error('Use a relative community API path.');
    let decodedPath;try{decodedPath=decodeURIComponent(path.split('?')[0]);}catch(_){throw new Error('Use a relative community API path.');}
    if(decodedPath.split(/[\\/]/).some(part=>part==='.'||part==='..'))throw new Error('Use a relative community API path.');
    const parsed=new URL(base+path,'https://degreepath.invalid');
    if(!parsed.pathname.startsWith(base+'/'))throw new Error('Use a relative community API path.');
    const opts = Object.assign({}, options || {}, {credentials:'same-origin'});
    opts.method=String(opts.method||'GET').toUpperCase();
    if(!['GET','POST','PATCH','DELETE'].includes(opts.method))throw new Error('Unsupported community request method.');
    opts.headers = Object.assign({'Accept':'application/json'}, opts.headers || {});
    if (opts.method && opts.method !== 'GET') {
      opts.headers['X-Community-Request'] = '1';
      if (opts.body != null && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
      if (opts.body != null) opts.headers['Content-Type'] = 'application/json';
    }
    let response;
    try { response = await root.fetch(base + path, opts); }
    catch (_) { const e = new Error('The community service could not be reached. Check your connection and try again.'); e.status = 0; throw e; }
    let data;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok || !data) {
      const e = new Error(data && typeof data.error === 'string' ? data.error : 'The community service is unavailable. Please try again.');
      if(response.status===401){user=null;sessionPromise=null;announce('community:session',null);}
      e.status = response.status; throw e;
    }
    return data;
  }
  function announce(name, detail) { if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent(name, {detail})); }
  async function getSession(refresh) {
    if (refresh || !sessionPromise) sessionPromise = api('/session').then(data => { user = data.user || null; sessionError = null; announce('community:session', user); return user; }).catch(error => { user = null; sessionError = error; sessionPromise = null; throw error; });
    return sessionPromise;
  }
  const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : ''; };
  const statusHTML = error => '<div class="notice community-error" role="alert">' + esc(error.message || error) + (error.status === 401 ? ' ' + signinLink('Sign in') : '') + '</div>';
  function safePlan(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.courses)) return null;
    const result = {};
    const fields={schoolId:100,schoolName:120,programId:100,programName:160,strategy:60};
    for (const key of Object.keys(fields))result[key]=clean(key==='strategy'?(input.strategy||'balanced'):input[key],fields[key]);
    if(Object.values(result).some(value=>!value)||typeof input.totalCredits!=='number'||!Number.isFinite(input.totalCredits)||input.totalCredits<0||input.totalCredits>500)return null;
    result.totalCredits = input.totalCredits;
    if(input.catalogYear!==undefined){const year=catalogYear(input.catalogYear);if(!year)return null;result.catalogYear=year;}
    result.courses = input.courses.filter(c => c && typeof c === 'object' && !Array.isArray(c) && (c.status===undefined||c.status==='planned')).map(c => {
      const item = {};
      const courseFields={requirementId:120,requirement:160,courseId:120,title:200,provider:100};
      for (const key of Object.keys(courseFields))item[key]=clean(c[key],courseFields[key]);
      if(typeof c.credits!=='number'||!Number.isFinite(c.credits)||c.credits<0||c.credits>30)return null;
      item.credits = c.credits;
      const href = safeLink(c.url); if (href) item.url = href;
      return item;
    }).filter(c => c && c.requirementId && c.requirement && c.courseId && c.title && c.provider).slice(0,100);
    return result.courses.length ? result : null;
  }
  function planPreview(input) {
    const plan = safePlan(input); if (!plan) return '';
    return '<div class="share-preview"><div class="template-meta"><span>' + esc(plan.schoolName) + '</span><span>' + esc(plan.totalCredits) + ' degree credits</span><span>' + esc(plan.strategy || 'balanced') + '</span></div><h3>' + esc(plan.programName) + '</h3><p>' + plan.courses.length + ' proposed course choices. Course placements need current school confirmation.</p><details><summary>Review every public plan field</summary><dl><div><dt>School ID</dt><dd>'+esc(plan.schoolId)+'</dd></div><div><dt>Program ID</dt><dd>'+esc(plan.programId)+'</dd></div></dl><div class="table-scroll"><table><thead><tr><th>Requirement</th><th>Proposed course</th><th>Provider</th><th>Credits</th><th>Source</th></tr></thead><tbody>' + plan.courses.map(c => '<tr><td>' + esc(c.requirement) + '<small>' + esc(c.requirementId) + '</small></td><td>' + esc(c.title) + '<small>' + esc(c.courseId) + '</small></td><td>' + esc(c.provider) + '</td><td>' + esc(c.credits) + '</td><td>' + (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">'+esc(c.url)+'</a>' : 'No link supplied') + '</td></tr>').join('') + '</tbody></table></div></details></div>';
  }
  const count=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;};
  const counts = item => ({likes:count(item?.likes), upvotes:count(item?.upvotes), comments:count(item?.comments)});
  const isDegreeStepsGuide=item=>item?.origin==='degreesteps-starter'&&item?.author?.kind==='degreesteps-guide';
  const authorAlias=item=>isDegreeStepsGuide(item)?/^DegreeSteps(?:\s|$)/.test(item.author?.alias||'')?item.author.alias:'DegreeSteps Guide':item?.author?.alias||'Community member';
  function avatar(alias,guide=false) { return '<span class="author-avatar'+(guide?' author-avatar-guide':'')+'" aria-hidden="true">' + (guide?'DS':esc((alias || 'C').slice(0,1).toUpperCase())) + '</span>'; }
  function guideBadge(label='DegreeSteps starter'){return '<span class="badge community-starter-badge">'+esc(label)+'</span>';}
  function authorHTML(item){const guide=isDegreeStepsGuide(item),alias=authorAlias(item);return avatar(alias,guide)+'<div class="community-author"><strong>'+esc(alias)+'</strong><span'+(guide?' class="community-guide-byline"':'')+'>'+esc((guide?'Prepared by DegreeSteps · ':'')+date(item.createdAt))+(!guide&&item.author?.isYou?' · You':'')+'</span></div>';}
  function discussionCountHTML(item){
    const c=counts(item),guide=item?.guideAnswers,students=item?.studentComments,separate=Number.isSafeInteger(guide)&&guide>=0&&Number.isSafeInteger(students)&&students>=0&&guide+students===c.comments;
    return separate&&(guide>0||isDegreeStepsGuide(item))?'<span class="comment-count community-reply-summary"><span>'+guide+' guide answer'+(guide===1?'':'s')+'</span><span>'+students+' student repl'+(students===1?'y':'ies')+'</span></span>':'<span class="comment-count">'+c.comments+' '+(isDegreeStepsGuide(item)?'repl'+(c.comments===1?'y':'ies'):'comment'+(c.comments===1?'':'s'))+'</span>';
  }
  function engagementHTML(item, options) {
    const c = counts(item), locked = !user, label = options && options.label || (item?.kind==='question'?'question':item?.kind==='template'?'guide':'plan');
    return '<div class="engagement-bar"><button type="button" class="vote-button' + (item.upvoted?' active':'') + '" data-reaction="upvote" aria-pressed="' + !!item.upvoted + '"' + (locked?' data-login-required="true"':'') + ' aria-label="' + esc((locked?'Sign in to upvote ':'Upvote ') + label) + '"><span aria-hidden="true">↑</span> <span data-count="upvote">' + c.upvotes + '</span><span>Upvote</span></button><button type="button" class="vote-button' + (item.liked?' active':'') + '" data-reaction="like" aria-pressed="' + !!item.liked + '"' + (locked?' data-login-required="true"':'') + ' aria-label="' + esc((locked?'Sign in to like ':'Like ') + label) + '"><span aria-hidden="true">♡</span> <span data-count="like">' + c.likes + '</span><span>Like</span></button>'+discussionCountHTML(item)+'</div>';
  }
  const feedSource=value=>['students','starters'].includes(value)?value:'all';
  function feedPath(options={}){const query=new URLSearchParams({limit:String(Number.isSafeInteger(options.limit)&&options.limit>0&&options.limit<=50?options.limit:20),source:feedSource(options.source)});if(['plan','question','template'].includes(options.kind))query.set('kind',options.kind);if(contextOK(options.context))query.set('context',options.context);if(options.mine===true)query.set('mine','1');if(typeof options.cursor==='string'&&options.cursor)query.set('cursor',options.cursor);return'/feed?'+query.toString();}
  const planOutcomeCache = new Map();
  function planOutcomeControl(item) {
    if(!item.plan||!root.DegreeEvidence)return '';
    const year=catalogYear(item.plan.catalogYear),cacheKey=item.id+'|'+item.updatedAt+'|'+year,summary=year?planOutcomeCache.get(cacheKey):null;
    return '<button type="button" class="button ghost small plan-outcomes" data-plan-outcomes="'+esc(item.id)+'" data-outcome-year="'+esc(year)+'" data-outcome-revision="'+esc(item.updatedAt)+'">'+(summary?root.DegreeEvidence.badgeHTML(summary):year?'Student outcomes':'Choose catalog')+'<small>'+esc(year?'Catalog '+year:'Catalog not recorded')+'</small></button>';
  }
  function updatePlanOutcomeControls(recordId,year,summary) {
    root.document.querySelectorAll('[data-plan-outcomes]').forEach(button=>{if(button.dataset.planOutcomes===recordId&&button.dataset.outcomeYear===year){planOutcomeCache.set(recordId+'|'+button.dataset.outcomeRevision+'|'+year,summary);button.innerHTML=root.DegreeEvidence.badgeHTML(summary)+'<small>Catalog '+esc(year)+'</small>';}});
  }
  function bindPlanOutcomes(element,item,load=false) {
    const button=element.querySelector('[data-plan-outcomes]');if(!button||!root.DegreeEvidence)return;
    if(!button.dataset.outcomeYear){button.onclick=()=>root.DegreeEvidence.chooseCatalog({kind:'plan',postId:item.id},{title:'Student outcomes · '+item.title});return;}
    const target={kind:'plan',postId:item.id,catalogYear:button.dataset.outcomeYear};
    button.onclick=()=>root.DegreeEvidence.open(target,{title:'Student outcomes · '+item.title,catalogLocked:true});
    if(load)api('/evidence?'+new URLSearchParams(target)).then(data=>{if(button.isConnected!==false)updatePlanOutcomeControls(item.id,target.catalogYear,data.summary);}).catch(()=>{/* A report count is never invented when the evidence service is unavailable. */});
  }
  function postHTML(item) {
    const guide=isDegreeStepsGuide(item);
    return '<article class="community-post'+(guide?' community-starter-post':'')+'" data-post-id="' + esc(item.id) + '"><div class="community-post-head">'+authorHTML(item)+(guide?guideBadge():'<span class="badge">'+esc(item.kind||'question')+'</span>')+'</div><h3><button type="button" class="post-title-button" data-open-post="' + esc(item.id) + '">' + esc(item.title) + '</button></h3><p class="post-excerpt">' + esc(item.body) + '</p>' + (item.plan ? '<div class="template-meta"><span>' + esc(item.plan.schoolName) + '</span><span>' + esc(item.plan.programName) + '</span><span>' + (Array.isArray(item.plan.courses)?item.plan.courses.length:0) + ' proposed courses</span></div>' : '') + engagementHTML(item) + '<div class="post-actions">'+planOutcomeControl(item)+'<button type="button" class="button ghost small" data-open-post="' + esc(item.id) + '">View discussion</button>' + (user?'<button type="button" class="button ghost small" data-report-post="' + esc(item.id) + '">Report</button>':'') + (item.canDelete?'<button type="button" class="button ghost small danger" data-delete-post="' + esc(item.id) + '">Remove</button>':'') + '</div><div class="post-feedback" role="status"></div></article>';
  }
  function commentHTML(item) {
    const guide=isDegreeStepsGuide(item),alias=authorAlias(item);
    return '<article class="comment'+(item.parentId?' comment-reply':'')+(guide?' community-guide-answer':'')+'" data-comment-id="'+esc(item.id)+'">'+avatar(alias,guide)+'<div class="comment-content"><div class="comment-author-line"><strong>'+esc(alias)+'</strong>'+(guide?guideBadge('Guide answer'):'')+'<time>'+esc(date(item.createdAt))+'</time></div><p class="comment-body">'+esc(item.body)+'</p><div class="post-actions">'+(user&&!item.parentId?'<button type="button" class="button ghost small" data-reply="'+esc(item.id)+'">Reply</button>':'')+(user?'<button type="button" class="button ghost small" data-report-comment="'+esc(item.id)+'">Report</button>':'')+(item.canDelete?'<button type="button" class="button ghost small danger" data-delete-comment="'+esc(item.id)+'">Remove</button>':'')+'</div><div class="comment-feedback" role="status"></div></div></article>';
  }
  function starterNotice(item){return isDegreeStepsGuide(item)?'<p class="community-starter-notice">Example student situation, prepared by DegreeSteps. Add your own question or experience.</p>':'';}
  function contextStarterLink(summary,context){const n=summary?.starterDiscussions;return Number.isSafeInteger(n)&&n>0&&contextOK(context)?'<a class="context-starters-link" href="community.html?'+new URLSearchParams({tab:'feed',source:'starters',context}).toString()+'">Explore '+n+' DegreeSteps starter question'+(n===1?'':'s')+'</a>':'';}
  function showDialog(id, title) {
    let dialog = root.document.getElementById(id);
    if (!dialog) {
      dialog = root.document.createElement('dialog'); dialog.id = id;
      dialog.setAttribute('aria-label', title);
      dialog.innerHTML = '<div class="dialog-topline"><strong>' + esc(title) + '</strong><button type="button" class="dialog-close" aria-label="Close">×</button></div><div id="' + id + '-content"></div>';
      root.document.body.appendChild(dialog);
      dialog.querySelector('.dialog-close').onclick = () => dialog.close();
    }
    dialog.setAttribute('aria-label',title);
    const content=dialog.querySelector('#'+id+'-content');
    const mounted=mountedContexts.get(content);if(mounted)mounted.destroy();
    const close = dialog.querySelector('#close-' + (id === 'publish-dialog'?'publish':'thread'));
    if (close) close.onclick = () => dialog.close();
    if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open',''); }
    return {dialog, content};
  }
  function requireLogin(element) { element.innerHTML = '<p>Sign in to post, comment, vote, or report.</p>' + signinLink(); }
  function reportForm(element, type, id) {
    if (!user) { requireLogin(element); return; }
    element.innerHTML = '<form class="report-form"><label class="field"><span>Reason for reporting</span><textarea name="reason" required minlength="3" maxlength="1000" rows="3" placeholder="Describe the issue for a moderator"></textarea></label><div class="inline-actions"><button class="button secondary small" type="submit">Send report</button><button type="button" class="button ghost small" data-cancel-report>Cancel</button></div><p role="status"></p></form>';
    element.querySelector('[data-cancel-report]').onclick = () => { element.innerHTML = ''; };
    element.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]'), status = form.querySelector('[role=status]'); button.disabled = true; status.textContent = 'Sending report…';
      try { await api('/reports', {method:'POST',body:{targetType:type,targetId:id,reason:form.elements.reason.value}}); element.textContent = 'Report received. A moderator can review this content.'; }
      catch (error) { status.innerHTML = esc(error.message)+(error.status===401?' '+signinLink('Sign in'):''); button.disabled = false; }
    };
  }
  function bindPostCards(element, items, onChange) {
    const byId = new Map(items.map(item => [String(item.id), item]));
    element.querySelectorAll('[data-open-post]').forEach(button => button.onclick = () => openPost(button.dataset.openPost));
    element.querySelectorAll('[data-post-id]').forEach(card => {
      let item = byId.get(card.dataset.postId); if (!item) return;
      bindPlanOutcomes(card,item);
      const feedback = card.querySelector('.post-feedback');
      card.querySelectorAll('[data-reaction]').forEach(button => button.onclick = async () => {
        if (!user) { requireLogin(feedback); return; }
        button.disabled = true;
        try { const data = await api('/posts/' + encodeURIComponent(item.id) + '/reactions', {method:'POST',body:{reaction:button.dataset.reaction,active:!(button.dataset.reaction==='like'?item.liked:item.upvoted)}}); item = data.item; updateEngagement(card, item); }
        catch (error) { feedback.innerHTML = statusHTML(error); }
        finally { button.disabled = false; }
      });
      const report = card.querySelector('[data-report-post]'); if (report) report.onclick = () => reportForm(feedback, 'post', item.id);
      const remove = card.querySelector('[data-delete-post]'); if (remove) remove.onclick = () => confirmRemoval(feedback, 'Remove this public post and its discussion?', async () => { await api('/posts/' + encodeURIComponent(item.id),{method:'DELETE'}); card.remove(); if (onChange) onChange(); announce('community:changed', {type:'post-deleted',id:item.id}); });
    });
  }
  function updateEngagement(element, item) {
    element.querySelectorAll('[data-reaction]').forEach(button => { const active = button.dataset.reaction === 'like' ? item.liked : item.upvoted; button.classList.toggle('active',!!active); button.setAttribute('aria-pressed',String(!!active)); const count = button.querySelector('[data-count]'); if (count) count.textContent = String(button.dataset.reaction==='like'?counts(item).likes:counts(item).upvotes); });
  }
  function confirmRemoval(element, message, action) {
    element.innerHTML = '<div class="notice"><p>' + esc(message) + '</p><button type="button" class="button secondary small" data-confirm-remove>Remove</button> <button type="button" class="button ghost small" data-cancel-remove>Cancel</button><p role="status"></p></div>';
    element.querySelector('[data-cancel-remove]').onclick = () => { element.innerHTML=''; };
    element.querySelector('[data-confirm-remove]').onclick = async event => { event.currentTarget.disabled=true; try { await action(); } catch(error) { element.querySelector('[role=status]').textContent=error.message; event.currentTarget.disabled=false; } };
  }
  async function mountContext(element, options) {
    options = options || {}; const context = options.context;
    if (!element) return;
    const previous=mountedContexts.get(element);if(previous)previous.destroy();
    if (!contextOK(context)) {element.innerHTML='<p class="community-error" role="alert">This discussion has an invalid context. Reload the page to try again.</p>';return;}
    let cursor = null, comments = [], summary = null, alive = true, loadRevision=0;
    const controller={reload:load,destroy(){alive=false;if(mountedContexts.get(element)===controller)mountedContexts.delete(element);}};
    mountedContexts.set(element,controller);
    element.classList.add('community-context');
    element.innerHTML = '<div class="context-thread"><p role="status">Loading shared discussion…</p></div>';
    async function load() {
      const revision=++loadRevision;
      try {
        await getSession().catch(() => null);
        const result = await Promise.all([api('/context?context='+encodeURIComponent(context)),api('/comments?context='+encodeURIComponent(context)+'&limit=20')]);
        if (!alive || element.isConnected===false || revision!==loadRevision) return;
        summary=result[0]; comments=result[1].items || []; cursor=result[1].cursor; render();
      } catch(error) { if (alive && element.isConnected!==false && revision===loadRevision) { element.innerHTML=statusHTML(error)+'<button type="button" class="button secondary small" data-retry>Retry discussion</button>'; element.querySelector('[data-retry]').onclick=load; } }
    }
    function render() {
      const ordered=[]; comments.filter(c=>!c.parentId).forEach(c=>{ordered.push(c); comments.filter(child=>child.parentId===c.id).forEach(child=>ordered.push(child));}); comments.filter(c=>c.parentId&&!comments.some(parent=>parent.id===c.parentId)).forEach(c=>ordered.push(c));
      element.innerHTML = '<section class="context-discussion"><div class="context-heading"><h3>' + esc(options.title || 'Community discussion') + '</h3><p>Ask a question or add something useful about this route.</p>'+contextStarterLink(summary,context)+'</div>' + (sessionError?'<div class="notice community-error" role="alert">Sign-in status could not be checked. You can still read this discussion. <button type="button" class="button ghost small" data-retry-session>Retry sign-in status</button></div>':'') + engagementHTML(summary,{label:options.title || 'this route'}) + '<div class="context-feedback" role="status"></div><div class="comment-list">' + (ordered.length ? ordered.map(commentHTML).join('') : '<p class="empty-community compact">No comments yet. Ask a question or share a source to begin.</p>') + '</div>' + (cursor?'<button type="button" class="button ghost small" data-more-comments>Load more comments</button>':'') + (user?'<form class="comment-form"><label class="field"><span>Comment as ' + esc(user.alias) + '</span><textarea name="body" rows="3" minlength="1" maxlength="3000" required placeholder="Ask a question or share what you learned"></textarea></label><p class="reply-label" hidden></p><div class="inline-actions"><button class="button small" type="submit">Post comment</button><button type="button" class="button ghost small" data-cancel-reply hidden>Cancel reply</button></div><p class="comment-submit-status" role="status"></p></form>':'<div class="community-login-note"><p>Everyone can read. Sign in to join the discussion.</p>'+signinLink()+'</div>') + '</section>';
      const feedback=element.querySelector('.context-feedback');
      const retrySession=element.querySelector('[data-retry-session]');if(retrySession)retrySession.onclick=load;
      element.querySelectorAll('[data-reaction]').forEach(button=>button.onclick=async()=>{if(!user){requireLogin(feedback);return;} button.disabled=true;try{summary=await api('/context/reactions',{method:'POST',body:{context,reaction:button.dataset.reaction,active:!(button.dataset.reaction==='like'?summary.liked:summary.upvoted)}});updateEngagement(element,summary);feedback.textContent='';}catch(error){feedback.innerHTML=statusHTML(error);}finally{button.disabled=false;}});
      const more=element.querySelector('[data-more-comments]');if(more)more.onclick=async()=>{more.disabled=true;try{const data=await api('/comments?context='+encodeURIComponent(context)+'&limit=20&cursor='+encodeURIComponent(cursor));if(!alive)return;const ids=new Set(comments.map(c=>c.id));comments=comments.concat((data.items||[]).filter(c=>!ids.has(c.id)));cursor=data.cursor;render();}catch(error){feedback.innerHTML=statusHTML(error);more.disabled=false;}};
      element.querySelectorAll('[data-report-comment]').forEach(button=>button.onclick=()=>reportForm(button.closest('.comment').querySelector('.comment-feedback'),'comment',button.dataset.reportComment));
      element.querySelectorAll('[data-delete-comment]').forEach(button=>button.onclick=()=>confirmRemoval(button.closest('.comment').querySelector('.comment-feedback'),'Remove this comment?',async()=>{await api('/comments/'+encodeURIComponent(button.dataset.deleteComment),{method:'DELETE'});await load();}));
      const form=element.querySelector('.comment-form');
      if(form){
        let parentId=null;const replyLabel=form.querySelector('.reply-label'),cancel=form.querySelector('[data-cancel-reply]');
        element.querySelectorAll('[data-reply]').forEach(button=>button.onclick=()=>{parentId=button.dataset.reply;const parent=comments.find(c=>c.id===parentId);replyLabel.textContent='Replying to '+(parent&&parent.author?parent.author.alias:'a comment');replyLabel.hidden=false;cancel.hidden=false;form.elements.body.focus();});
        cancel.onclick=()=>{parentId=null;replyLabel.hidden=true;cancel.hidden=true;};
        form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity()||!user)return;const button=form.querySelector('[type=submit]'),status=form.querySelector('.comment-submit-status');button.disabled=true;status.textContent='Posting comment…';try{const body={context,body:form.elements.body.value};if(parentId)body.parentId=parentId;await api('/comments',{method:'POST',body});await load();announce('community:changed',{type:'comment',context});}catch(error){status.innerHTML=esc(error.message)+(error.status===401?' '+signinLink('Sign in'):'');button.disabled=false;}};
      }
    }
    await load();return controller;
  }
  async function openThread(options) { options=options||{};postRevision++;const dialog=showDialog('thread-dialog',options.title||'Community discussion');return mountContext(dialog.content,options); }
  async function openPost(id) {
    const revision=++postRevision;
    const modal=showDialog('thread-dialog','Community discussion');modal.content.innerHTML='<p role="status">Loading shared post…</p>';
    try {
      await getSession().catch(()=>null);const data=await api('/posts/'+encodeURIComponent(id));if(revision!==postRevision)return;const item=data.item;
      modal.content.innerHTML='<article class="template-detail">'+(isDegreeStepsGuide(item)?guideBadge():'<p class="step-eyebrow">COMMUNITY '+esc(item.kind||'POST')+'</p>')+'<h2>'+esc(item.title)+'</h2><div class="community-post-head">'+authorHTML(item)+'</div>'+starterNotice(item)+'<p class="post-body">'+esc(item.body)+'</p>'+(safeLink(item.url)?'<p><a href="'+esc(safeLink(item.url))+'" target="_blank" rel="noopener noreferrer">Linked source ↗</a></p>':'')+planPreview(item.plan)+'<div class="post-actions">'+planOutcomeControl(item)+(item.plan?'<a class="button secondary small" href="portal.html?shared='+esc(encodeURIComponent(item.id))+'">Make a copy of this plan</a>':'')+(user?'<button class="button ghost small" type="button" data-report-detail>Report post</button>':'')+(item.canDelete?'<button class="button ghost small danger" type="button" data-remove-detail>Remove post</button>':'')+'</div><div class="detail-feedback" role="status"></div><div class="post-discussion"></div></article>';
      bindPlanOutcomes(modal.content,item,true);
      const feedback=modal.content.querySelector('.detail-feedback'),report=modal.content.querySelector('[data-report-detail]'),remove=modal.content.querySelector('[data-remove-detail]');
      if(report)report.onclick=()=>reportForm(feedback,'post',item.id);
      if(remove)remove.onclick=()=>confirmRemoval(feedback,'Remove this post and its public discussion?',async()=>{await api('/posts/'+encodeURIComponent(item.id),{method:'DELETE'});modal.dialog.close();announce('community:changed',{type:'post-deleted',id:item.id});});
      mountContext(modal.content.querySelector('.post-discussion'),{context:'post:'+item.id,title:'Discussion'});
    }catch(error){if(revision!==postRevision)return;modal.content.innerHTML=statusHTML(error)+'<button class="button secondary small" type="button" data-retry-post>Retry</button>';modal.content.querySelector('[data-retry-post]').onclick=()=>openPost(id);}
  }
  async function sharePlan(options) {
    options=options||{};const revision=++publishRevision,plan=safePlan(options.plan),modal=showDialog('publish-dialog','Share with the community');
    if(options.plan!=null&&!plan){modal.content.innerHTML='<div class="notice community-error" role="alert"><h2>Review the course plan first.</h2><p>There are no valid proposed course choices to publish. Return to your draft, check the school, program, and course choices, then choose Share again.</p></div><button class="button secondary" type="button" data-cancel-invalid>Close</button>';modal.content.querySelector('[data-cancel-invalid]').onclick=()=>modal.dialog.close();return modal;}
    modal.content.innerHTML='<p role="status">Preparing public preview…</p>';
    await getSession().catch(()=>null);
    if(revision!==publishRevision)return modal;
    modal.content.innerHTML='<h2>Share something useful.</h2><p>Choose a public alias and review exactly what the community will see.</p>'+(sessionError?statusHTML(sessionError):'')+'<form class="publish-form"><div class="form-grid"><label class="field"><span>Post type</span><select name="kind" class="select"><option value="'+(plan?'plan':'question')+'">'+(plan?'Shared plan':'Question')+'</option><option value="template"'+(options.kind==='template'?' selected':'')+'>Template / route guide</option>'+(plan?'<option value="question">Question</option>':'')+'</select></label><label class="field"><span>Public display name</span><input name="alias" minlength="2" maxlength="40" required value="'+esc(user&&user.alias||'Community member')+'" autocomplete="nickname"></label></div><label class="field"><span>Title</span><input name="title" minlength="3" maxlength="160" required value="'+esc(options.title||plan&&plan.programName||'')+'" placeholder="What would you like to share?"></label><label class="field"><span>Description or question</span><textarea name="body" rows="4" minlength="1" maxlength="6000" required placeholder="Explain the route, sources, or question. Leave personal records out of your public post.">'+esc(options.body||'')+'</textarea></label><label class="field"><span>Source link <small>Optional, https://</small></span><input name="url" type="url" maxlength="2048" placeholder="https://"></label>'+(plan?'<h3>Public course preview</h3>'+planPreview(plan)+'<p class="field-hint">Published fields: school and program IDs/names, strategy, total credits, and the requirement, course, provider, credit, and source fields shown above. Your public alias, title, and description also appear with the post.</p>':'<div class="notice"><strong>Want to share your saved course plan?</strong><p>Open your draft to check its course choices, then use Share this plan.</p><a class="button secondary small" href="portal.html?share=1">Review saved draft</a></div>')+'<label class="consent-field"><input name="consent" type="checkbox" required> <span>I have reviewed this preview and want to publish these fields publicly. Other students may copy and adapt the curriculum choices.</span></label><div class="inline-actions">'+(user?'<button class="button" type="submit">Publish publicly</button>':signinLink('Sign in to publish'))+'<button class="button ghost" type="button" data-cancel-publish>Cancel</button></div><p class="publish-status" role="status"></p></form>';
    const form=modal.content.querySelector('form');if(['question','template','plan'].includes(options.kind)&&(options.kind!=='plan'||plan))form.elements.kind.value=options.kind;form.querySelector('[data-cancel-publish]').onclick=()=>modal.dialog.close();
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]'),status=form.querySelector('.publish-status');
      if(!user){status.innerHTML=signinLink('Sign in to publish');return;}
      if(!form.elements.consent.checked){status.textContent='Review the public preview and check the consent box before publishing.';return;}
      if(!form.checkValidity()){form.reportValidity();return;}
      if(button.disabled)return;button.disabled=true;status.textContent='Publishing…';
      try{
        const kind=form.elements.kind.value,payload={kind,title:form.elements.title.value,body:form.elements.body.value,context:contextOK(options.context)?options.context:plan&&contextOK('program:'+plan.programId)?'program:'+plan.programId:'school:general'};
        if(!['question','plan','template'].includes(kind))throw new Error('Choose a supported post type.');
        if(kind==='plan'&&!plan)throw new Error('Choose a valid proposed course plan first.');
        const link=form.elements.url.value.trim();if(link){const href=safeLink(link);if(!href)throw new Error('Use a complete http:// or https:// source link without credentials.');payload.url=href;}
        if(plan&&(kind==='plan'||kind==='template')){payload.plan=plan;payload.publishPublicPlan=true;}
        const alias=form.elements.alias.value.trim();if(alias!==user.alias){const profile=await api('/profile',{method:'POST',body:{alias}});user=profile.user;sessionPromise=Promise.resolve(user);announce('community:session',user);}
        const result=await api('/posts',{method:'POST',body:payload});if(!result.item||!result.item.id)throw new Error('Publication could not be confirmed. Reload the community feed before trying again.');modal.dialog.close();announce('community:published',result.item);openPost(result.item.id);
      }catch(error){status.innerHTML=esc(error.message)+(error.status===401?' '+signinLink('Sign in'):'');button.disabled=false;}
    };
    return modal;
  }
  async function mountUserArea(element) {
    if(!element)return;try{await getSession();}catch(error){element.innerHTML='<span class="field-hint">Sign-in status unavailable.</span><button type="button" class="button ghost small" data-session-retry>Retry</button>';element.querySelector('[data-session-retry]').onclick=()=>mountUserArea(element);return;}
    if(!user){element.innerHTML=signinLink('Sign in');return;}
    element.innerHTML='<div class="user-menu"><span>'+avatar(user.alias)+'<strong>'+esc(user.alias)+'</strong></span><button class="button ghost small" type="button" data-edit-alias>Display name</button>'+(['moderator','owner'].includes(user.role)?'<button class="button ghost small" type="button" data-moderation>Moderation</button><button class="button ghost small" type="button" data-outcome-review>Review outcomes</button>':'')+'<a href="'+esc(signoutUrl())+'" target="_top">My account</a></div><div class="user-feedback" role="status"></div>';
    element.querySelector('[data-edit-alias]').onclick=()=>{const feedback=element.querySelector('.user-feedback');feedback.innerHTML='<form class="alias-form"><label class="field"><span>Public display name</span><input name="alias" minlength="2" maxlength="40" required value="'+esc(user.alias)+'"></label><button type="submit" class="button secondary small">Save name</button><p role="status"></p></form>';feedback.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;try{const data=await api('/profile',{method:'POST',body:{alias:form.elements.alias.value}});user=data.user;sessionPromise=Promise.resolve(user);announce('community:session',user);mountUserArea(element);}catch(error){form.querySelector('[role=status]').textContent=error.message;button.disabled=false;}};};
    const outcomes=element.querySelector('[data-outcome-review]');if(outcomes)outcomes.onclick=()=>root.DegreeEvidence?.moderate();
    const moderation=element.querySelector('[data-moderation]');if(moderation)moderation.onclick=()=>openModeration();
  }
  async function openModeration() {
    const revision=++postRevision;
    const modal=showDialog('thread-dialog','Moderation reports');modal.content.innerHTML='<h2>Content reports</h2><p role="status">Loading open reports…</p>';
    let items=[],cursor=null;
    function render(){
      modal.content.innerHTML='<h2>Content reports</h2><p>Review the report and content before deciding.</p><div class="moderation-list">'+(items.length?items.map(item=>'<article class="community-post" data-report-id="'+esc(item.id)+'"><p class="template-meta">'+esc(item.targetType)+' · '+esc(date(item.createdAt))+'</p><h3>'+esc(item.reason)+'</h3><p>Reported by '+esc(item.reporterAlias)+'</p><blockquote>'+esc(item.target&&item.target.body||'Content is no longer available.')+'</blockquote><div class="inline-actions"><button type="button" class="button secondary small" data-review="reviewed">Mark reviewed</button><button type="button" class="button ghost small" data-review="dismissed">Dismiss report</button>'+(item.target&&!item.target.deleted?'<button type="button" class="button secondary small danger" data-remove-target>Remove content</button>':'')+'</div><div class="report-feedback" role="status"></div></article>').join(''):'<p class="empty-community">There are no open reports on this page.</p>')+'</div>'+(cursor?'<button type="button" class="button secondary small" data-more-reports>Load more reports</button>':'')+'<p class="moderation-feedback" role="status"></p>';
      modal.content.querySelectorAll('[data-report-id]').forEach(card=>{
        const act=async(status,removeTarget)=>{await api('/moderation/reports/'+encodeURIComponent(card.dataset.reportId),{method:'PATCH',body:{status,removeTarget:!!removeTarget}});items=items.filter(item=>item.id!==card.dataset.reportId);if(revision===postRevision)render();announce('community:changed',{type:'moderated'});};
        card.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await act(button.dataset.review,false);}catch(error){card.querySelector('.report-feedback').textContent=error.message;button.disabled=false;}});
        const remove=card.querySelector('[data-remove-target]');if(remove)remove.onclick=()=>confirmRemoval(card.querySelector('.report-feedback'),'Remove the reported public content?',()=>act('reviewed',true));
      });
      const more=modal.content.querySelector('[data-more-reports]');if(more)more.onclick=async()=>{more.disabled=true;try{await load(cursor);}catch(error){modal.content.querySelector('.moderation-feedback').textContent=error.message;more.disabled=false;}};
    }
    async function load(before){
      const result=await api('/moderation/reports?status=open&limit=20'+(before?'&cursor='+encodeURIComponent(before):''));if(revision!==postRevision)return;
      const ids=new Set(items.map(item=>item.id));items=items.concat((result.items||[]).filter(item=>!ids.has(item.id)));cursor=result.cursor;render();
    }
    try{await load();}catch(error){if(revision!==postRevision)return;modal.content.innerHTML='<h2>Content reports</h2>'+statusHTML(error)+'<button class="button secondary small" data-retry-moderation>Retry</button>';modal.content.querySelector('[data-retry-moderation]').onclick=openModeration;}
  }
  if(root.document?.addEventListener)root.document.addEventListener('degreepath:evidence-updated',event=>{const target=event.detail?.target;if(target?.kind==='plan'&&root.DegreeEvidence){const summary=root.DegreeEvidence.getSummary(target);if(summary)updatePlanOutcomeControls(target.postId,target.catalogYear,summary);}});
  return {api,getSession,safePlan,planPreview,escapeHtml:esc,safeLink,contextOK,signinUrl,signoutUrl,signinLink,postHTML,commentHTML,isDegreeStepsGuide,discussionCountHTML,starterNotice,contextStarterLink,feedSource,feedPath,bindPostCards,mountContext,renderThread:mountContext,openThread,openPost,sharePlan,mountUserArea,openModeration,get user(){return user;}};
}));
