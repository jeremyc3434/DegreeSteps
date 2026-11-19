(function(){'use strict';const W=window.DegreeTemplateWorkspace,$=id=>document.getElementById(id),e=W.esc;let access=null,organizations=[],templates=[];const notice=(text,error=false)=>{$('admin-message').textContent=text;$('admin-message').hidden=false;$('admin-message').dataset.error=String(error);};
async function action(button,run){button.disabled=true;try{await run();}catch(error){notice(error.message+(W.list(error.data?.issues).length?' '+W.list(error.data.issues).map(x=>typeof x==='string'?x:x.message||x.code).join(' '):''),true);}finally{button.disabled=false;}}
// Connection credentials exist only in the password field and the outgoing request.
// Provider and transport error bodies are deliberately never rendered here.
let aiConnection=null,aiConnectionBusy=false;
const aiEndpoint='/api/admin/ai-connection';
function aiNotice(text,error=false){const node=$('ai-connection-message');node.textContent=text;node.hidden=false;node.dataset.error=String(error);}
function aiError(error){
 if(error?.status===401)return 'Your session has expired. Sign in again before changing the connection.';
 if(error?.status===403)return 'Only the DegreeSteps owner can manage this connection.';
 if(error?.status===409)return 'The connection changed in another session. Review the refreshed status and try again.';
 if(error?.status===429)return 'Too many connection checks. Please try again later.';
 if(error?.status===400||error?.status===422)return 'The key could not be verified. Check the complete API key and its Claude Console workspace, then paste it again.';
 if(error?.status===503)return 'The connection service is unavailable. Refresh the connection or try again later.';
 return 'The connection could not be confirmed. Refresh its status before trying again.';
}
function aiControls(){
 const ready=!!aiConnection;
 $('ai-connection-save').disabled=aiConnectionBusy||!ready||!aiConnection.storageReady;
 $('ai-api-key').disabled=aiConnectionBusy||!ready||!aiConnection.storageReady;
 $('ai-connection-test').disabled=aiConnectionBusy||!ready||!aiConnection.configured;
 $('ai-connection-disconnect').disabled=aiConnectionBusy||!ready||aiConnection.source!=='managed';
 $('ai-connection-refresh').disabled=aiConnectionBusy;
 $('ai-connection-form').setAttribute('aria-busy',String(aiConnectionBusy));
}
function showAIConnection(config){
 if(typeof config?.configured!=='boolean'||!['managed','environment','none'].includes(config.source)||!Number.isSafeInteger(config.revision)||config.revision<0)throw Error('Connection status is unavailable.');
 aiConnection=config;
 const connected=config.configured,badge=$('ai-connection-status');
 badge.textContent=connected?'Connected':'Not connected';badge.dataset.state=connected?'ready':'disconnected';
 $('ai-connection-summary').textContent=config.source==='managed'?(connected?'Connected with your encrypted, saved API key.':'A saved API key is present, but the server cannot open it. Finish the secure storage setup.'):config.source==='environment'?'Connected with a server secret. To remove that key, update the site’s server settings.':'Add an API key to enable research for new degree requests.';
 $('ai-storage-note').hidden=config.storageReady===true;
 $('ai-key-entry').hidden=config.storageReady!==true;$('ai-key-entry').open=!connected;
 $('ai-key-summary').textContent=connected?'Replace API key':'Add your API key';
 $('ai-connection-test').hidden=!connected;$('ai-connection-disconnect').hidden=config.source!=='managed';
 const daily=Number(config.limits?.researchPerDay),student=Number(config.limits?.researchPerStudentPerDay);
 $('ai-connection-limits').hidden=!(Number.isSafeInteger(daily)&&daily>0&&daily<=20&&Number.isSafeInteger(student)&&student>0&&student<=20);
 $('ai-connection-limits').textContent='Up to '+daily+' new research runs per day across DegreeSteps · '+student+' per student. Existing degree research is reused first.';
 $('ai-connection-details').hidden=!connected;$('ai-connection-model').textContent='Research model: '+String(config.model||'Configured on the server');
 aiControls();
}
async function loadAIConnection(){
 if(access?.isOwner!==true)return;
 try{showAIConnection(await W.api(aiEndpoint));}catch(error){$('ai-connection-status').textContent='Refresh needed';$('ai-connection-status').dataset.state='pending';aiNotice(aiError(error),true);aiControls();}
}
async function refreshResearchConnection(){try{await loadTemplates();}catch{notice('The Claude connection was updated. Use Refresh to reload the research queue.',true);}}
async function aiAction(button,label,run){
 if(access?.isOwner!==true||aiConnectionBusy)return;
 const previousLabel=button.textContent;aiConnectionBusy=true;button.textContent=label;aiControls();
 $('ai-connection-message').hidden=true;
 try{await run();}catch(error){
  $('ai-api-key').value='';
  if(error?.status===409)await loadAIConnection();
  aiNotice(aiError(error),true);
 }finally{$('ai-api-key').value='';aiConnectionBusy=false;button.textContent=previousLabel;aiControls();}
}
$('ai-api-key').value='';
window.addEventListener('pagehide',()=>{$('ai-api-key').value='';});
window.addEventListener('pageshow',()=>{$('ai-api-key').value='';});
$('ai-connection-form').addEventListener('submit',event=>{
 event.preventDefault();let apiKey=$('ai-api-key').value.trim();$('ai-api-key').value='';
 if(access?.isOwner!==true||aiConnectionBusy||!aiConnection?.storageReady){apiKey='';return;}
 if(!apiKey){aiNotice('Paste your Claude Console API key first.',true);$('ai-api-key').focus();return;}
 // api() serializes the request synchronously before its first await. Do not retain the key for retries.
 const revision=aiConnection.revision;
 aiAction($('ai-connection-save'),'Checking key…',async()=>{
  let request;try{request=W.api(aiEndpoint,{method:'PUT',body:{apiKey,revision}});}finally{apiKey='';}
  showAIConnection(await request);aiNotice('Claude is connected. New degree requests can now be researched.');await refreshResearchConnection();
 });
});
$('ai-connection-test').addEventListener('click',()=>aiAction($('ai-connection-test'),'Checking connection…',async()=>{
 if(!aiConnection?.configured)return;
 showAIConnection(await W.api(aiEndpoint+'/test',{method:'POST',body:{revision:aiConnection.revision}}));aiNotice('The saved connection is working. No degree research was generated.');
}));
$('ai-connection-disconnect').addEventListener('click',()=>aiAction($('ai-connection-disconnect'),'Disconnecting…',async()=>{
 if(aiConnection?.source!=='managed')return;
 showAIConnection(await W.api(aiEndpoint,{method:'DELETE',body:{revision:aiConnection.revision}}));
 aiNotice(aiConnection.source==='environment'?'The saved key was disconnected. Claude is still connected through the site’s server secret.':'The saved key was disconnected. New research is paused; existing degree plans remain available.');
 await refreshResearchConnection();
}));
$('ai-connection-refresh').addEventListener('click',()=>aiAction($('ai-connection-refresh'),'Refreshing…',loadAIConnection));
function orgHTML(org){return '<article class="tw-item"><h3>'+e(org.name)+'</h3><p><span class="tw-badge">'+e(org.status)+'</span> · <a target="_blank" rel="noopener noreferrer" href="'+e(W.safeURL(org.website)||'#')+'">Official website ↗</a></p><form class="org-review-form" data-org="'+e(org.id)+'"><label>Verification note<input name="reviewNote" minlength="3" maxlength="500" required placeholder="Record how the institution and its authorized contact were checked."></label><div class="tw-actions"><button class="tw-button tw-secondary" name="action" value="verify" type="submit">'+(org.status==='verified'?'Confirm verification':'Verify college')+'</button>'+(org.status==='verified'?'<button class="tw-button tw-secondary" name="action" value="revoke" type="submit">Revoke verification</button>':'')+'</div></form>'+(access.isOwner?'<details><summary>Manage college team</summary><p class="tw-muted">Add only an authorized college representative with an existing DegreeSteps account. College access does not grant platform administration.</p><form class="org-member-form tw-fields" data-org="'+e(org.id)+'"><label>DegreeSteps account ID<input name="userId" maxlength="256" required></label><label>College role<select name="role"><option value="advisor">Advisor</option><option value="admin">College administrator</option></select></label><div class="tw-wide"><button type="submit" class="tw-button tw-secondary">Grant college access</button></div></form><ul>'+W.list(org.members).map(m=>'<li>'+e(m.alias)+' · '+e(m.role)+' · '+e(m.status)+' <code>'+e(m.userId)+'</code>'+(m.status==='active'?'<button type="button" class="tw-button tw-secondary" data-revoke-member="'+e(org.id)+'" data-user="'+e(m.userId)+'">Remove access</button>':'')+'</li>').join('')+'</ul></details>':'')+'</article>';}
async function loadOrganizations(){const data=await W.api('/api/admin/colleges');organizations=W.list(data.items);$('college-organizations').innerHTML=organizations.length?organizations.map(orgHTML).join(''):'<p>No colleges have been added. New organizations stay pending until reviewed.</p>';}
async function loadLeads(){const organizationId=$('lead-organization').value;if(!organizationId)return;const data=await W.api('/api/colleges/leads?organizationId='+encodeURIComponent(organizationId));const rows=W.list(data.items);$('college-lead-list').innerHTML=rows.length?'<div class="tw-table-wrap"><table><thead><tr><th>Student</th><th>Contact</th><th>Interest</th><th>Permission</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+e(r.contactName)+'</td><td>'+e(r.contactEmail)+'</td><td>'+e(r.programInterest||'Not specified')+'<br>'+e(r.studyFormat||'')+' '+e(r.startTiming||'')+'</td><td>'+e(new Date(r.consentedAt).toLocaleDateString())+'<details><summary>Consent details</summary>'+e(r.consentText)+'</details></td></tr>').join('')+'</tbody></table></div>':'<p>No active student requests for this college.</p>';}
async function loadTemplates(){const [queue,config]=await Promise.all([W.api('/api/admin/templates'),W.api('/api/admin/templates/config')]);templates=W.list(queue.items||queue.templates);$('research-configuration').textContent=(config.configured||config.claudeConfigured)?'Claude research is connected. Existing degree research is reused before another request is made.':(access?.isOwner?'Connect Claude above to research new degree requests.':'New degree requests can be saved. The DegreeSteps owner must connect Claude before research can run.');$('admin-template-list').innerHTML=templates.length?templates.map(t=>'<article class="tw-item"><h3>'+e(t.programName||t.title)+'</h3><p>'+e(t.schoolName||t.school)+' · '+e(t.catalogYear||'')+' · '+e(t.modality||'')+'</p><span class="tw-badge" data-state="'+e(t.status)+'">'+e(t.status)+'</span><div class="tw-actions"><button class="tw-button tw-secondary" type="button" data-review-template="'+e(t.id)+'">Review research</button>'+(!['ready','researching'].includes(t.status)?'<button class="tw-button tw-secondary" type="button" data-run-research="'+e(t.id)+'" data-revision="'+e(t.revision)+'">Run research</button>':'')+'</div></article>').join(''):'<p>No degree requests are waiting for review.</p>';}
async function detail(id){let data;try{data=await W.api('/api/admin/templates/'+encodeURIComponent(id));}catch(error){if(error.status!==404)throw error;data={item:templates.find(t=>t.id===id)};}const template=data.item||data.template;if(!template)throw Error('Refresh the research queue and try again.');const panel=$('admin-detail');panel.hidden=false;panel.innerHTML='<h2>Review degree research</h2>'+W.researchHTML(template)+(W.list(data.validation).length?'<div class="tw-notice"><strong>Checks to resolve</strong><ul>'+W.list(data.validation).map(x=>'<li>'+e(typeof x==='string'?x:x.message||x.code)+'</li>').join('')+'</ul></div>':'')+(W.list(data.requests).some(x=>x.details)?'<details><summary>Private notes for the reviewer</summary><p class="tw-muted">These notes are private and are not part of the reusable template.</p>'+W.list(data.requests).filter(x=>x.details).map(x=>'<p>'+e(x.details)+'</p>').join('')+'</details>':'')+'<details><summary>Research artifact</summary><pre>'+e(JSON.stringify(W.artifactOf(template),null,2))+'</pre></details><form id="template-review-form" data-id="'+e(template.id)+'" data-revision="'+e(template.revision)+'"><details><summary>Edit research artifact (advanced)</summary><label>Degree facts and course options<textarea name="artifactEdit" rows="12" maxlength="524288" spellcheck="false">'+e(JSON.stringify(W.artifactOf(template),null,2))+'</textarea></label></details><label>Review note<textarea name="reviewNote" required minlength="3" maxlength="2000" rows="3" placeholder="Record the official curriculum, transfer sources, residency rules, and unresolved items you checked."></textarea></label><label><input type="checkbox" name="sourcesReviewed" required>I checked the official sources and the exact degree, catalog, and delivery format.</label><label><input type="checkbox" name="academicReviewed" required>I checked the full credit ledger, course options, duplicate-credit rules, and institutional requirements.</label><div class="tw-actions"><button type="submit" name="decision" value="ready" class="tw-button">Approve as an available template</button><button type="submit" name="decision" value="needs-review" class="tw-button tw-secondary" formnovalidate>Keep in review</button></div><p class="tw-muted">Approval is also subject to the server’s completeness checks. A review never confirms an individual student’s transfer credits.</p></form>';panel.focus();panel.scrollIntoView({block:'start',behavior:'smooth'});}
$('college-create-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;action(form.querySelector('button'),async()=>{await W.api('/api/admin/colleges',{method:'POST',body:{action:'create',...Object.fromEntries(new FormData(form))}});form.reset();await loadOrganizations();notice('College added. Verify its authorized representative before granting access.');});});
$('college-organizations').addEventListener('submit',event=>{event.preventDefault();const form=event.target,org=organizations.find(o=>o.id===form.dataset.org);if(!org)return;action(event.submitter||form.querySelector('button'),async()=>{const body=Object.fromEntries(new FormData(form));if(form.classList.contains('org-review-form'))Object.assign(body,{action:event.submitter?.value||'verify',organizationId:org.id,revision:org.revision});else Object.assign(body,{action:'grant-member',organizationId:org.id});await W.api('/api/admin/colleges',{method:'POST',body});await loadOrganizations();notice('College access updated.');});});
$('college-organizations').addEventListener('click',event=>{const button=event.target.closest('[data-revoke-member]');if(button)action(button,async()=>{await W.api('/api/admin/colleges',{method:'POST',body:{action:'revoke-member',organizationId:button.dataset.revokeMember,userId:button.dataset.user}});await loadOrganizations();notice('College team access removed.');});});
$('admin-template-list').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.reviewTemplate)action(button,()=>detail(button.dataset.reviewTemplate));if(button.dataset.runResearch)action(button,async()=>{const r=await W.api('/api/admin/templates/'+encodeURIComponent(button.dataset.runResearch)+'/research',{method:'POST',body:{revision:Number(button.dataset.revision)}});notice(r.message||'Research started. Refresh the queue to see its progress.');await loadTemplates();});});
$('admin-detail').addEventListener('submit',event=>{event.preventDefault();const form=event.target,decision=event.submitter?.value||'needs-review';action(event.submitter||form.querySelector('button'),async()=>{await W.api('/api/admin/templates/'+encodeURIComponent(form.dataset.id)+'/review',{method:'POST',body:{revision:Number(form.dataset.revision),decision,notes:form.elements.reviewNote.value,sourcesReviewed:form.elements.sourcesReviewed.checked,academicReviewed:form.elements.academicReviewed.checked,artifact:JSON.parse(form.elements.artifactEdit.value)}});notice(decision==='ready'?'Template approved.':'Research kept in review.');$('admin-detail').hidden=true;await loadTemplates();});});
$('refresh-admin').addEventListener('click',event=>action(event.currentTarget,async()=>{await Promise.all([loadTemplates(),loadOrganizations(),...(access?.isOwner&&!aiConnectionBusy?[loadAIConnection()]:[])]);notice('Workspace refreshed.');}));$('refresh-leads').addEventListener('click',event=>action(event.currentTarget,loadLeads));$('lead-organization').addEventListener('change',()=>loadLeads().catch(error=>notice(error.message,true)));
(async()=>{try{access=await W.api('/api/colleges/status');if(!access.user){$('admin-loading').innerHTML='<p>Sign in to open your workspace.</p><a class="tw-button" href="account.html?returnTo=admin.html">Sign in</a>';return;}$('admin-loading').textContent='Account ID: '+access.user.id;const memberships=W.list(access.memberships).filter(m=>m.organizationStatus==='verified');if(access.isOwner===true){if($('admin-growth-link'))$('admin-growth-link').hidden=false;$('admin-ai-connection').hidden=false;await loadAIConnection();}if(access.isAdmin){$('admin-coverage-link').hidden=false;$('admin-templates').hidden=false;$('admin-colleges').hidden=false;const results=await Promise.allSettled([loadTemplates(),loadOrganizations()]);for(const r of results)if(r.status==='rejected')notice(r.reason.message,true);}else{$('admin-title').textContent='College workspace';$('admin-description').textContent='Manage student requests for your verified college.';}if(memberships.length){$('college-workspace').hidden=false;$('lead-organization').innerHTML=memberships.map(m=>'<option value="'+e(m.organizationId)+'">'+e(m.organizationName)+'</option>').join('');await loadLeads();}else if(!access.isAdmin)notice('Your account does not have college access yet. An owner must verify your college and authorize your account.');}catch(error){$('admin-loading').textContent='';notice(error.message,true);}})();
}());
