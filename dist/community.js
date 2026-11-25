/* DegreeSteps public starter library and real community feed. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const client = window.DegreeCommunity;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const strategies = { balanced: 'Balance time and cost', cost: 'Spend less', speed: 'Finish sooner', transfer: 'Use prior credit well' };
  const formats = { online: 'Online', campus: 'On campus' };
  const params = new URLSearchParams(location.search);
  const state = { tab: params.get('tab') === 'feed' ? 'feed' : 'templates', templates: [], templatesLoading:true, communityCursor:null, communityLoading:false, communityError:'', communityRequest:0, catalog:null, models:new Map(), reviewedOn: '', templateError: '', selected: '', templateRequest:0, filters: { search: '', school: '', modality: '', strategy: '' }, feed: [], cursor: null, kind: '', mine: false, source: ['students','starters'].includes(params.get('source'))?params.get('source'):'all', feedContext: /^(school|program|course|template|post):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(params.get('context')||'')?params.get('context'):'', feedLoaded: false, feedLoading: false, feedRequest: 0, contextMount: null };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ({ arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', book:'<path d="M4 4h7l1 2 1-2h7v16h-7l-1 1-1-1H4zM12 6v15"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', plus:'<path d="M12 5v14M5 12h14"/>' }[name] || '<path d="M5 12h14m-6-6 6 6-6 6"/>') + '</svg>';
  const text = value => typeof value === 'string' ? value : value && (value.text || value.description || value.title) || '';
  const when = value => { const d = new Date(value + 'T12:00:00'); return Number.isNaN(d.getTime()) ? 'Date unavailable' : d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }); };
  const coverage = item => item.ready ? 'Full course plan' : 'Shared draft';
  const safeHref = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; } };
  const schools = () => [...new Map(state.templates.map(item => [item.schoolId, item.schoolName])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
  const option = (value, label, selected) => '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
  function status(message, error) { $('community-status').textContent = message || ''; $('community-status').classList.toggle('error', !!error); }
  function updateURL() {
    const next = new URL(location.href);
    next.searchParams.set('tab', state.tab);
    if(state.tab==='feed'&&state.source!=='all')next.searchParams.set('source',state.source);else next.searchParams.delete('source');
    if (state.selected) next.searchParams.set('template', state.selected); else next.searchParams.delete('template');
    history.replaceState(null, '', next.pathname + next.search + next.hash);
  }
  function closeDetail() {
    state.templateRequest++;
    if (state.contextMount && state.contextMount.destroy) state.contextMount.destroy();
    state.contextMount = null; state.selected = '';
    $('community-detail').hidden = true; $('community-detail').innerHTML = '';
    $('community-results').hidden = false; $('community-toolbar').hidden = false;
  }
  function switchTab(tab, update, focus) {
    closeDetail(); state.tab = tab === 'feed' ? 'feed' : 'templates';
    document.querySelectorAll('[data-community-tab]').forEach(button => {
      const active = button.dataset.communityTab === state.tab;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    $('nav-templates').toggleAttribute('aria-current', state.tab === 'templates');
    $('nav-community').toggleAttribute('aria-current', state.tab === 'feed');
    if (state.tab === 'templates') $('nav-templates').setAttribute('aria-current', 'page'); else $('nav-community').setAttribute('aria-current', 'page');
    $('community-results').setAttribute('role', 'tabpanel');
    $('community-results').setAttribute('aria-labelledby', 'community-tab-' + state.tab);
    $('community-title').textContent=state.tab==='feed'?'Talk through your degree plan.':'A useful plan. A helpful community.';
    const intro=$('community-intro-description');if(intro)intro.textContent=state.tab==='feed'?'Ask a question, compare options, or share what you’ve learned.':'Start with a complete course plan, or learn from the community.';
    const primary=$('new-community-plan');primary.innerHTML=icon('plus')+(state.tab==='feed'?'Ask a question':'Share a plan');
    $('community-results').setAttribute('aria-label',state.tab==='feed'?'Community discussions':'Degree plans and templates');
    renderToolbar(); $('community-empty').hidden = true; $('community-featured').innerHTML = ''; $('community-feed').innerHTML = ''; status('');
    if (state.tab === 'templates') renderTemplates(); else if (state.feedLoaded) renderFeed(); else loadFeed(false);
    if (update !== false) updateURL();
    if (focus) $('community-tab-' + state.tab).focus();
  }
  function renderToolbar() {
    const schoolOptions = schools();
    if (state.tab === 'templates') {
      const f = state.filters;
      $('community-toolbar').innerHTML = '<div class="community-filters"><label class="community-search"><span class="community-filter-label">Search available degree plans</span><input id="template-search" class="input" type="search" placeholder="Search a school, degree, or goal" maxlength="120" value="' + esc(f.search) + '"></label><label><span class="community-filter-label">School</span><select id="template-school" class="select">' + option('', 'All schools', f.school) + schoolOptions.map(([id,name]) => option(id,name,f.school)).join('') + '</select></label><label><span class="community-filter-label">Study format</span><select id="template-modality" class="select">' + option('','Any format',f.modality) + Object.entries(formats).map(([id,name]) => option(id,name,f.modality)).join('') + '</select></label></div>';
      $('template-search').addEventListener('input', event => { state.filters.search = event.target.value; renderTemplates(); });
      for (const field of ['school','modality']) $('template-' + field).addEventListener('change', event => { state.filters[field] = event.target.value; renderTemplates(); });
    } else {
      $('community-toolbar').innerHTML = '<div class="community-filters community-feed-filters"><label><span class="community-filter-label">Written by</span><select id="feed-source" class="select">'+[['all','Everyone'],['students','Students'],['starters','DegreeSteps starters']].map(([id,name])=>option(id,name,state.source)).join('')+'</select></label><label><span class="community-filter-label">Post type</span><select id="feed-kind" class="select">' + [['','All posts'],['plan','Shared plans'],['question','Questions'],['template','Shared route guides']].map(([id,name]) => option(id,name,state.kind)).join('') + '</select></label><label><span class="community-filter-label">School discussion</span><select id="feed-context" class="select">' + option('','All discussions',state.feedContext) + schoolOptions.map(([id,name]) => option('school:'+id,name,state.feedContext)).join('') + (state.feedContext&&!schoolOptions.some(([id])=>'school:'+id===state.feedContext)?option(state.feedContext,'Selected discussion',state.feedContext):'') + '</select></label><label><span class="community-filter-label">Show</span><select id="feed-owner" class="select">' + option('all','Everyone’s posts',state.mine?'mine':'all') + option('mine','My posts',state.mine?'mine':'all') + '</select></label><button type="button" class="button secondary" id="refresh-community">Refresh</button><button type="button" class="button secondary" id="ask-community">Ask a question</button></div>';
      $('feed-source').onchange=event=>{state.source=client?.feedSource?client.feedSource(event.target.value):['students','starters'].includes(event.target.value)?event.target.value:'all';updateURL();loadFeed(false);};
      $('feed-kind').onchange = event => { state.kind = event.target.value; loadFeed(false); };
      $('feed-context').onchange = event => { state.feedContext = event.target.value; loadFeed(false); };
      $('feed-owner').onchange = event => { state.mine = event.target.value === 'mine'; loadFeed(false); };
      $('refresh-community').onclick = () => loadFeed(false);
      $('ask-community').onclick = openComposer;
    }
  }
  function templateCard(item) {
    const facts = item.creditFacts || {}, credits = Number.isFinite(facts.totalCredits) ? facts.totalCredits + ' degree credits' : 'Degree requirements to confirm';
    return '<article class="template-card" data-template-id="' + esc(item.id) + '"><div class="template-card-top"><span class="template-card-icon">' + icon('book') + '</span><span class="starter-label">Course plan available</span></div><p class="template-school">' + esc(item.schoolName) + '</p><h3><button type="button" class="post-title-button" data-view-template="' + esc(item.id) + '">' + esc(item.title) + '</button></h3><p>' + esc(item.summary) + '</p><div class="template-tags"><span>' + esc(coverage(item)) + '</span>' + (item.modalities || []).map(value => '<span>' + esc(formats[value] || value) + '</span>').join('') + '</div><div class="template-meta"><span>' + esc(credits) + '</span><span>' + (item.openCourseChoices>0?esc(item.openCourseChoices)+' course'+(item.openCourseChoices===1?'':'s')+' to choose':'Full requirements included') + '</span></div><div class="template-card-footer"><button type="button" class="button secondary small" data-view-template="' + esc(item.id) + '">View plan</button><a class="button small" href="' + esc(item.launchURL) + '">Build my plan ' + icon('arrow') + '</a></div></article>';
  }
  function renderTemplates() {
    if (state.tab !== 'templates' || state.selected) return;
    if(state.templatesLoading&&!state.templates.length){$('community-featured').innerHTML='';$('community-feed').innerHTML='';$('community-empty').hidden=true;status('Loading available degree plans…');return;}
    const f = state.filters, query = f.search.trim().toLocaleLowerCase();
    const items = state.templates.filter(item => (!f.school || item.schoolId === f.school) && (!f.modality || (item.modalities || []).includes(f.modality)) && (!query || [item.title,item.programName,item.schoolName,item.summary,...(item.steps || []).map(text)].join(' ').toLocaleLowerCase().includes(query)));
    $('community-feed').innerHTML = '';
    $('community-featured').innerHTML = '<div class="community-section-heading"><div><h2>Choose a plan you can build.</h2><p>Every plan here is reviewed and includes the full degree requirements. More plans, including ones that still need school confirmation, are in <a href="programs.html">Find a degree</a>.</p></div><span class="template-result-count">' + items.length + ' plan' + (items.length === 1 ? '' : 's') + (state.communityCursor?' loaded':'') + '</span></div>' + (items.length ? '<div class="community-grid">' + items.map(templateCard).join('') + '</div>' : '') + ((state.communityCursor||state.communityError)?'<div class="load-more-row">'+(state.communityError?'<p role="status">'+esc(state.communityError)+'</p>':'')+'<button type="button" class="button secondary" id="more-community-templates"'+(state.communityLoading?' disabled':'')+'>'+(state.communityLoading?'Loading community plans…':state.communityError?'Retry community plans':'Load more community plans')+'</button></div>':'');
    $('community-empty').hidden = !!items.length;
    if (!items.length) $('community-empty').innerHTML = '<h2>' + (state.templateError ? 'Plans could not be loaded.' : 'No plans match these filters.') + '</h2><p>' + esc(state.templateError || 'Clear a filter, request a degree, or build your own plan.') + '</p><button type="button" class="button secondary" id="reset-template-filters">' + (state.templateError ? 'Retry plans' : 'Clear filters') + '</button><div class="inline-actions"><a class="button" href="request-plan.html">Request a degree plan</a><a class="button secondary" href="degree-audit.html">Build my own</a></div>';
    const moreTemplates=$('more-community-templates');if(moreTemplates)moreTemplates.onclick=()=>loadCommunityTemplates(state.communityCursor);
    const reset = $('reset-template-filters');
    if (reset) reset.onclick = () => { if (state.templateError) { loadTemplates(); return; } state.filters = { search:'',school:'',modality:'',strategy:'' }; renderToolbar(); renderTemplates(); };
    $('community-featured').querySelectorAll('[data-view-template]').forEach(button => { button.onclick = () => openTemplate(button.dataset.viewTemplate); });
    status(state.templateError ? 'Student discussions are still available in the other tab.' : 'Transfer choices remain proposed until your university confirms them.', !!state.templateError);
  }
  function sourceList(items) {
    return '<div class="source-list">' + (items || []).filter(item => safeHref(item.url)).map(item => '<a href="' + esc(safeHref(item.url)) + '" target="_blank" rel="noopener noreferrer"><div><strong>' + esc(item.title || 'Source') + '</strong><span>' + esc(item.type === 'community-research' || item.kind === 'community' ? 'Community research · confirm with receiving school' : item.type === 'official-reviewed' || item.kind === 'official' ? 'Official source' : 'Reference · current details need confirmation') + ' · ' + esc(item.checkedOn || item.checked ? 'Checked ' + when(item.checkedOn || item.checked) : 'Not independently rechecked') + '</span></div><span aria-hidden="true">↗</span></a>').join('') + '</div>';
  }
  function ledgerHTML(item) {
    return '<details class="starter-ledger optional-fields"><summary>See the full degree requirements</summary><div class="table-scroll"><table><thead><tr><th>Requirement</th><th>Credits</th></tr></thead><tbody>'+(item.courseLedger||[]).map(row=>'<tr><td>'+esc(row.requirement)+(row.code?'<small>'+esc(row.code)+'</small>':'')+'</td><td>'+esc(row.credits)+'</td></tr>').join('')+'</tbody></table></div></details>';
  }
  async function openTemplate(id, update) {
    const request=++state.templateRequest;if(state.tab!=='templates')return;
    let item=state.templates.find(template=>template.id===id);
    if(!item&&/^reviewed-[A-Za-z0-9_-]{1,100}$/.test(id))item={id,apiTemplateId:id.slice(9),origin:'community-reviewed'};
    if(!item){status('This link does not have a ready-to-use plan. Choose an available plan or build your own.',true);return;}
    status('Opening the complete course requirements…');
    try {
      if(item.origin==='community-reviewed'){
        const response=await fetch('/api/templates/'+encodeURIComponent(item.apiTemplateId),{credentials:'same-origin'});if(!response.ok)throw Error('This reviewed community template is no longer available.');const result=await response.json();if(result.template?.id!==item.apiTemplateId)throw Error('The reviewed plan response does not match this link.');item=DegreeReadyTemplates.fromReviewed([result.template],DegreeProgramCatalog,state.catalog)[0];if(!item)throw Error('A complete reviewed community template is not available.');if(!state.templates.some(existing=>existing.id===item.id))state.templates.push({...item,template:undefined,courseLedger:[],sources:[],manifest:true});
      }else{
      if(!state.models.has(item.modelId)){
        const models=await DegreeProgramCatalog.modelsForRoutes([item.route],{includeLegacy:false});
        for(const model of models)state.models.set(model.id,model);
      }
      item=DegreeReadyTemplates.attachModel(item,state.models.get(item.modelId),DegreeProgramCatalog);
      }
    }catch(error){if(request===state.templateRequest&&state.tab==='templates')status(error.message+' Your saved plan has not changed.',true);return;}
    if(request!==state.templateRequest||state.tab!=='templates')return;
    if(state.contextMount?.destroy)state.contextMount.destroy();state.contextMount=null;state.selected=id;
    $('community-results').hidden=true;$('community-toolbar').hidden=true;$('community-detail').hidden=false;
    const facts=item.creditFacts;
    $('community-detail').innerHTML='<button type="button" class="button secondary" id="back-to-templates">← All available plans</button><div class="template-detail-top"><div><p class="starter-label">Full course plan</p><p class="template-school">'+esc(item.schoolName)+'</p><h2 id="template-detail-title">'+esc(item.title)+'</h2><p>Add your completed and saved courses. The plan shows what to take next.</p></div><a class="button" href="'+esc(item.launchURL)+'">Build my plan →</a></div><div class="template-meta"><span>'+esc(facts.totalCredits)+' degree credits</span>'+(item.openCourseChoices>0?'<span>'+esc(item.openCourseChoices)+' courses to choose</span>':'')+item.modalities.map(value=>'<span>'+esc(formats[value]||value)+'</span>').join('')+(item.reviewedOn?'<span>Reviewed '+esc(when(item.reviewedOn))+'</span>':'')+'</div><p>Transfer matches are proposed. Your university confirms how they apply to your degree and catalog.</p><div class="inline-actions"><a class="button secondary" href="school.html?school='+encodeURIComponent(item.schoolName)+(item.apiTemplateId?'&amp;template='+encodeURIComponent(item.apiTemplateId):'')+'">Read about this school</a><button type="button" class="button secondary" id="ask-template">Ask other students</button></div>'+ledgerHTML(item)+'<details><summary>Sources behind this plan</summary>'+sourceList(item.sources)+'</details><div id="template-questions" class="template-questions"></div><div id="template-discussion"></div>';
    $('community-detail').setAttribute('aria-labelledby','template-detail-title');
    $('back-to-templates').onclick=()=>{closeDetail();updateURL();renderTemplates();$('community-tab-templates').focus();};
    $('ask-template').onclick=()=>{if(client)client.openThread({context:planContext(item),title:item.title});};
    if(update!==false)updateURL();status('');$('community-detail').tabIndex=-1;$('community-detail').focus({preventScroll:true});
    if(client){void loadPlanQuestions(item,id);const mounted=await client.mountContext($('template-discussion'),{context:planContext(item),title:'Questions and student experiences'});if(state.selected===id)state.contextMount=mounted;else mounted?.destroy?.();}
  }
  // A plan's questions and its discussion thread share one context: program:<route id>, which the plan
  // discussion has always used. Questions filed earlier under template:<starter id> are still listed.
  function planContext(item){return 'program:'+item.pathwayId;}
  async function loadPlanQuestions(item,id){
    const node=$('template-questions');if(!node||!client)return;
    try{
      const lists=await Promise.all([planContext(item),'template:'+item.id].filter(value=>client.contextOK(value)).map(context=>client.api('/feed?'+new URLSearchParams({context,limit:'20'}).toString()).then(data=>Array.isArray(data.items)?data.items:[])));
      if(state.selected!==id||!node.isConnected)return;
      const seen=new Set(),items=lists.flat().filter(post=>post&&!seen.has(post.id)&&seen.add(post.id)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      node.innerHTML=items.length?'<h3>Questions about this plan</h3>'+items.map(client.postHTML).join(''):'';
      if(items.length)client.bindPostCards(node,items,()=>loadPlanQuestions(item,id));
    }catch{if(state.selected===id&&node.isConnected)node.innerHTML='';}
  }
  async function loadTemplates() {
    status('Loading available degree plans…');state.templateError='';state.templatesLoading=true;state.communityCursor=null;state.communityError='';state.communityLoading=false;state.communityRequest++;
    try {
      const response=await fetch('data/pathways.json',{credentials:'same-origin'});if(!response.ok)throw Error('The plan library could not be loaded. Please try again.');
      const catalog=await DegreeProgramCatalog.load(await response.json(),{required:true});state.catalog=catalog;
      state.templates=DegreeReadyTemplates.fromCatalog(catalog,DegreeProgramCatalog);state.templatesLoading=false;
      state.reviewedOn=catalog.curriculumRegistry?.checkedOn||'';
      if(state.tab==='templates'){renderToolbar();renderTemplates();}else renderToolbar();
      await loadCommunityTemplates(null);
      if(state.tab==='templates'){
        const schoolSelect=$('template-school');if(schoolSelect)schoolSelect.innerHTML=option('','All schools',state.filters.school)+schools().map(([id,name])=>option(id,name,state.filters.school)).join('');
        renderTemplates();const requested=new URLSearchParams(location.search).get('template');if(requested&&!state.selected)openTemplate(requested,false);
      }
    }catch(error){state.templatesLoading=false;state.templateError=error.message;if(state.tab==='templates')renderTemplates();}
  }
  async function loadCommunityTemplates(cursor){
    if(state.communityLoading)return;state.communityLoading=true;state.communityError='';const request=++state.communityRequest;
    const button=$('more-community-templates');if(button){button.disabled=true;button.textContent='Loading community plans…';}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),query=new URLSearchParams({limit:'12'});if(cursor)query.set('cursor',cursor);
    try{const response=await fetch('/api/templates?'+query,{credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('Community plans could not be loaded. Your other degree plans are still available.');const result=await response.json();const page=DegreeReadyTemplates.readPage(result,DegreeProgramCatalog,state.catalog);if(cursor&&page.nextCursor===cursor)throw Error('The community plan list did not advance. Please try again.');if(request!==state.communityRequest)return;
      const current=new Map(state.templates.map(item=>[item.id,item]));for(const item of page.templates)current.set(item.id,item);state.templates=[...current.values()];state.communityCursor=page.nextCursor;
    }catch(error){if(request===state.communityRequest)state.communityError=error.name==='AbortError'?'Community plans took too long to load. Your other plans are still available.':error.message;}
    finally{clearTimeout(timer);if(request===state.communityRequest){state.communityLoading=false;if(state.tab==='templates'){const schoolSelect=$('template-school');if(schoolSelect)schoolSelect.innerHTML=option('','All schools',state.filters.school)+schools().map(([id,name])=>option(id,name,state.filters.school)).join('');renderTemplates();}}}
  }
  function renderFeed() {
    if (state.tab !== 'feed' || state.selected) return;
    const heading=state.mine?'Your public contributions':state.source==='students'?'Student discussions':state.source==='starters'?'DegreeSteps starter questions':'Student discussions and DegreeSteps starters';
    const description=state.mine?'Questions, plans, and guides you’ve shared.':state.source==='students'?'Questions and experiences shared by students.':state.source==='starters'?'Example situations prepared by DegreeSteps. Add your own question or experience.':'Student posts appear first. Prepared examples and guide answers are clearly labeled.';
    $('community-featured').innerHTML='<div class="community-section-heading"><div><h2>'+esc(heading)+'</h2><p>'+esc(description)+'</p></div></div>';
    $('community-feed').innerHTML = state.feed.length && client ? state.feed.map(client.postHTML).join('') + (state.cursor ? '<div class="load-more-row"><button type="button" class="button secondary" id="more-community-posts">Load more posts</button></div>' : '') : '';
    $('community-empty').hidden = !!state.feed.length || state.feedLoading;
    if (!state.feed.length && !state.feedLoading) $('community-empty').innerHTML = icon('book') + '<h2>' + (state.mine ? 'Your first contribution starts here.' : state.kind || state.feedContext || state.source!=='all' ? 'No posts match these filters yet.' : 'Start the conversation.') + '</h2><p>' + (state.mine ? 'Share a draft route, ask a question, or contribute a source. Your public posts will appear here.' : 'Share a degree plan, compare approaches, or ask the question that helps someone take their next step.') + '</p><div class="inline-actions"><button type="button" class="button" id="empty-community-compose">Ask a question</button><a class="button secondary" href="portal.html?share=1">Review a plan to share</a></div>';
    const emptyCompose = $('empty-community-compose'); if (emptyCompose) emptyCompose.onclick = openComposer;
    if (client && state.feed.length) client.bindPostCards($('community-feed'), state.feed, () => loadFeed(false));
    const more = $('more-community-posts'); if (more) more.onclick = () => loadFeed(true);
  }
  async function loadFeed(more) {
    const request = ++state.feedRequest; state.feedLoading = true;
    if (!more) { state.feed = []; state.cursor = null; state.feedLoaded = false; }
    if (state.tab === 'feed') { renderFeed(); status(more ? 'Loading more posts…' : 'Loading community posts…'); }
    if (!client) { state.feedLoading = false; showFeedError(new Error('The community service is unavailable. Please reload this page.')); return; }
    try {
      await client.getSession().catch(() => null);
      if (request !== state.feedRequest) return;
      if (state.mine && !client.user) { state.feedLoading = false; state.feedLoaded = false; if (state.tab === 'feed') { renderFeed(); $('community-empty').hidden = false; $('community-empty').innerHTML = '<h2>Sign in to see your posts.</h2><p>Your public contributions are linked to your account.</p>' + client.signinLink('Sign in to view my posts'); status(''); } return; }
      const query = new URLSearchParams({limit:'20',source:state.source});
      if (state.kind) query.set('kind',state.kind); if (state.feedContext) query.set('context',state.feedContext); if (state.mine) query.set('mine','1'); if (more && state.cursor) query.set('cursor',state.cursor);
      const data = await client.api(client.feedPath?client.feedPath({source:state.source,kind:state.kind,context:state.feedContext,mine:state.mine,cursor:more?state.cursor:null}):'/feed?' + query.toString());
      if (request !== state.feedRequest) return;
      const items = Array.isArray(data.items) ? data.items : [];
      state.feed = more ? [...state.feed,...items.filter(item => !state.feed.some(existing => existing.id === item.id))] : items;
      state.cursor = data.cursor || null; state.feedLoaded = true; state.feedLoading = false;
      if (state.tab === 'feed') { renderFeed(); status(state.feed.length ? state.feed.length + ' post' + (state.feed.length === 1 ? '' : 's') + ' loaded' + (state.cursor ? ' · More available' : '') + '.' : 'No posts have been added to this view yet.'); }
    } catch (error) { if (request !== state.feedRequest) return; state.feedLoading = false; if (state.tab === 'feed') showFeedError(error); }
  }
  function showFeedError(error) {
    status(error.message || 'The community service is unavailable. Please try again.', true);
    $('community-empty').hidden = false;
    $('community-empty').innerHTML = '<h2>We couldn’t load the community.</h2><p>Try again, or explore the available degree plans while the service reconnects.</p><div class="inline-actions"><button type="button" class="button secondary" id="retry-community-feed">Retry community</button><button type="button" class="button ghost" id="fallback-templates">Browse available plans</button></div>';
    $('retry-community-feed').onclick = () => loadFeed(false); $('fallback-templates').onclick = () => switchTab('templates');
  }
  let prefill = params.get('compose') === '1' && (params.get('title') || params.get('body')) ? { title: String(params.get('title') || '').slice(0, 160), body: String(params.get('body') || '').slice(0, 2000) } : null;
  async function openComposer() {
    const dialog = $('publish-dialog'), content = $('publish-dialog-content');
    dialog.setAttribute('aria-label','Ask or share with the community');
    content.innerHTML = '<h2>'+(state.tab==='feed'?'Ask the community.':'Share something useful.')+'</h2><p class="field-hint">Ask about your next step, or share a useful source.</p><a class="saved-plan-share" href="portal.html?share=1"><span><strong>Share your degree plan</strong><span>Open your saved draft and review the exact public course preview.</span></span>' + icon('arrow') + '</a><div id="community-composer-body"><p role="status">Checking sign-in…</p></div>';
    if (!dialog.open) dialog.showModal();
    if (!client) { $('community-composer-body').innerHTML = '<p class="form-error">Community publishing is unavailable. Please reload and try again.</p>'; return; }
    let user;
    try { user = await client.getSession(); }
    catch (error) { $('community-composer-body').innerHTML = '<p class="form-error">' + esc(error.message) + '</p><button type="button" class="button secondary" id="retry-composer">Retry</button>'; $('retry-composer').onclick = openComposer; return; }
    if (!user) { $('community-composer-body').innerHTML = '<div class="notice"><strong>Join the conversation.</strong><p>Sign in to publish a question or guide under a public display name.</p>' + client.signinLink('Sign in to contribute') + '</div>'; return; }
    const selectedPlan = state.selected ? state.templates.find(item => item.id === state.selected) : null;
    const contexts = [['school:general','General community'],...schools().map(([id,name]) => ['school:'+id,name]),...state.templates.map(item => [planContext(item),'Plan: '+item.title])];
    if(state.feedContext&&!contexts.some(([id])=>id===state.feedContext))contexts.push([state.feedContext,'Selected school discussion']);
    $('community-composer-body').innerHTML = '<form id="community-post-form" class="publish-form"><h3>Your question or guide</h3><div class="form-grid"><label class="field"><span class="field-label">Post type</span><select name="kind" class="select"><option value="question">Question</option><option value="template">Shared route guide</option></select></label><label class="field"><span class="field-label">Discussion</span><select name="context" class="select">' + contexts.map(([id,name]) => option(id,name,selectedPlan?planContext(selectedPlan):state.feedContext||'school:general')).join('') + '</select></label></div><label class="field"><span class="field-label">Public display name</span><input class="input" name="alias" required minlength="2" maxlength="40" autocomplete="nickname" value="' + esc(user.alias) + '"><span class="field-hint">Choose a name that does not include your email or private records.</span></label><label class="field"><span class="field-label">Title</span><input class="input" name="title" required minlength="3" maxlength="160" placeholder="What would you like to ask or share?"></label><label class="field"><span class="field-label">Question or guide</span><textarea class="input" name="body" required minlength="1" maxlength="6000" rows="5" placeholder="Explain the route, sources, or question. Include enough context to help others."></textarea><span class="field-hint">Your text will be public. Keep transcripts, personal learning records, and contact details out of this post.</span></label><label class="field"><span class="field-label">Source link <small>Optional</small></span><input class="input" type="url" name="url" maxlength="2048" placeholder="https://"></label><label class="consent-field"><input type="checkbox" name="consent" required><span>I reviewed the title, text, source link, and public display name above and want to publish them publicly.</span></label><div class="inline-actions"><button type="submit" class="button">Publish publicly</button><button type="button" class="button ghost" id="cancel-community-post">Cancel</button></div><p id="community-publish-status" role="status"></p></form>';
    // A link from an open course choice (plan pages) may prefill an editable question: ?compose=1&title=…&body=…
    if (prefill) { const form = $('community-post-form'); if (prefill.title) form.elements.title.value = prefill.title; if (prefill.body) form.elements.body.value = prefill.body; form.elements.kind.value = 'question'; prefill = null; }
    $('cancel-community-post').onclick = () => dialog.close();
    $('community-post-form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type=submit]'), output = $('community-publish-status');
      if (!form.reportValidity()) return;
      const alias = form.elements.alias.value.trim(), payload = { kind:form.elements.kind.value, context:form.elements.context.value, title:form.elements.title.value.trim(), body:form.elements.body.value.trim() };
      const link = form.elements.url.value.trim(); if (link) { const href = safeHref(link); if (!href) { output.textContent = 'Use a complete http:// or https:// source link without sign-in information.'; return; } payload.url = href; }
      if (!client.contextOK(payload.context)) { output.textContent = 'Choose a valid discussion.'; return; }
      submit.disabled = true; output.textContent = 'Publishing your public post…';
      try {
        if (alias !== client.user.alias) await client.api('/profile',{method:'POST',body:{alias}});
        const result = await client.api('/posts',{method:'POST',body:payload});
        if (alias !== client.user.alias) await client.getSession(true);
        dialog.close(); state.feedLoaded = false; switchTab('feed');
        window.dispatchEvent(new CustomEvent('community:published',{detail:result.item}));
        client.openPost(result.item.id);
      } catch (error) { output.textContent = error.message || 'Your post could not be published. Please try again.'; submit.disabled = false; }
    };
  }
  function updateIdentity(user) {
    const signin = $('community-signin'); if (signin) { signin.hidden = !!user; signin.href = client ? client.signinUrl() : '/account.html'; }
  }
  function init() {
    const signin = $('community-signin');
    if (signin && signin.tagName !== 'A') { const link = document.createElement('a'); link.id = signin.id; link.className = signin.className; link.textContent = 'Sign in'; link.target = '_top'; signin.replaceWith(link); }
    updateIdentity(null);
    for (const [dialogId,closeId] of [['publish-dialog','close-publish'],['thread-dialog','close-thread']]) { const dialog = $(dialogId); $(closeId).onclick = () => dialog.close(); dialog.addEventListener('click',event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }); }
    document.querySelectorAll('[data-community-tab]').forEach(button => {
      button.onclick = () => switchTab(button.dataset.communityTab);
      button.onkeydown = event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const tab = event.key === 'Home' ? 'templates' : event.key === 'End' ? 'feed' : state.tab === 'templates' ? 'feed' : 'templates'; switchTab(tab,true,true); };
    });
    $('new-community-plan').onclick = openComposer;
    window.addEventListener('community:session',event => { updateIdentity(event.detail); });
    window.addEventListener('community:changed',() => { state.feedLoaded = false; if (state.tab === 'feed') loadFeed(false); });
    window.addEventListener('community:published',() => { state.feedLoaded = false; if (state.tab === 'feed' && !state.feedLoading) loadFeed(false); });
    switchTab(state.tab,false); loadTemplates();
    if (client) client.mountUserArea($('community-user-area')).then(() => updateIdentity(client.user)).catch(() => updateIdentity(null));
    if (params.get('compose') === '1') openComposer();
    if (client && /^[A-Za-z0-9_-]{1,120}$/.test(params.get('post')||'')) client.openPost(params.get('post'));
  }
  init();
}());
