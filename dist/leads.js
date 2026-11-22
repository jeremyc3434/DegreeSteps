/* Opt-in "Have [School] contact me" and the Plan review request form. Both are off unless the server says
   otherwise: GET /api/leads/status answers 404 while SCHOOL_INQUIRIES_ENABLED and PLAN_REVIEW_ENABLED are
   unset, and then this script renders nothing and loads no styles. It never reads or writes the browser's saved
   plan and never changes which plans, schools or courses are shown, or their order: the
   worksheet and planner ask it only for extra action links next to a plan that is already on screen. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeLeads=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const STATUS='/api/leads/status',DISCLOSURE='/how-we-make-money/',REVIEW_PAGE='/plan-review/';
  const PLAN=/^[a-z0-9][a-z0-9-]{0,127}$/;
  const START=[['this-term','This term'],['next-6-months','In the next 6 months'],['later','Later']];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inquiryConsent=school=>'I agree that DegreeSteps may share these details with '+school+' so its admissions team can contact me about this program. This is optional, and it doesn’t change your plan.';
  let config=null,loading=null,dialog=null,lastTrigger=null;

  function normalize(value){
    if(!value||typeof value!=='object'||value.enabled!==true)return null;
    const inquiries=value.schoolInquiries&&value.schoolInquiries.enabled===true&&Array.isArray(value.schoolInquiries.schools)?{enabled:true,schools:value.schoolInquiries.schools.filter(name=>typeof name==='string'),consentVersion:String(value.schoolInquiries.consentVersion||'')}:{enabled:false};
    const review=value.planReview&&value.planReview.enabled===true?{enabled:true,consentVersion:String(value.planReview.consentVersion||''),status:value.planReview.status==='checkout'?'checkout':'waitlist'}:{enabled:false};
    return inquiries.enabled||review.enabled?{schoolInquiries:inquiries,planReview:review}:null;
  }
  /** One status request per page. Resolves to the enabled features, or null when both are off. */
  function load(){
    if(loading)return loading;
    loading=Promise.resolve().then(()=>typeof root.fetch==='function'?root.fetch(STATUS,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}}):null)
      
      // Always read the body, so the request completes even when the features are off (404).
      .then(response=>response?response.json().then(value=>response.ok?value:null,()=>null):null).then(normalize,()=>null).catch(()=>null)
      .then(value=>{config=value;if(value){styles();bindPage();try{root.dispatchEvent?.(new root.CustomEvent('DegreeSteps:leads-ready',{detail:{}}));}catch{/* Pages render the actions on their next update. */}}return value;});
    return loading;
  }
  function styles(){
    const doc=root.document;if(!doc?.head||doc.querySelector?.('link[data-leads-styles],link[href="/leads.css"]'))return;
    const link=doc.createElement('link');link.rel='stylesheet';link.href='/leads.css';link.setAttribute('data-leads-styles','');doc.head.appendChild(link);
  }
  const inquiryAllowed=school=>Boolean(config?.schoolInquiries.enabled&&typeof school==='string'&&config.schoolInquiries.schools.includes(school));
  /** Extra actions for a plan already on screen. Empty unless a feature is on (and, for inquiries, the school is allowlisted). */
  function actionsHTML(plan={}){
    if(!config||!plan||typeof plan!=='object')return '';
    const id=typeof plan.planId==='string'&&PLAN.test(plan.planId)?plan.planId:'',school=typeof plan.school==='string'?plan.school.trim():'',title=typeof plan.title==='string'?plan.title.trim():'';
    const parts=[];
    if(id&&title&&inquiryAllowed(school))parts.push('<div class="lead-inquiry"><button type="button" class="lead-button" data-lead-action="school-inquiry" data-plan-id="'+esc(id)+'" data-school="'+esc(school)+'" data-title="'+esc(title)+'">Have '+esc(school)+' contact me</button><p class="lead-hint">Optional. Your details go only to '+esc(school)+', and only if you ask.</p></div>');
    if(config.planReview.enabled)parts.push('<p class="lead-review-link">Want a person to check this plan? <a href="'+REVIEW_PAGE+(id?'?plan='+encodeURIComponent(id):'')+'">Plan review</a></p>');
    return parts.length?'<div class="lead-actions">'+parts.join('')+'</div>':'';
  }
  function growth(event,detail){try{root.dispatchEvent?.(new root.CustomEvent('DegreeSteps:growth',{detail:{event,...detail}}));}catch{/* Measurement never blocks a form. */}}
  async function post(path,body){
    let response;
    try{response=await root.fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Leads-Request':'1',Accept:'application/json'},body:JSON.stringify(body)});}
    catch{throw Error('We could not send this. Check your connection and try again.');}
    let data=null;try{data=await response.json();}catch{/* A non-JSON reply is handled below. */}
    if(!response.ok)throw Error(data&&typeof data.error==='string'?data.error:response.status===404?'This form is no longer available.':'We could not send this right now. Please try again later.');
    return data||{};
  }
  // A radio group's RadioNodeList reports the checked value, a text field its text.
  function formValue(form,name){const field=form.elements?.namedItem?.(name);return field&&typeof field.value==='string'?field.value:'';}
  function showError(node,message,focus){if(!node)return;node.textContent=message;node.hidden=!message;if(message&&focus)focus.focus?.();}

  // ---------- School inquiry dialog ----------
  function dialogHTML(plan){
    const school=esc(plan.school);
    return '<form class="lead-form" novalidate data-lead-form="school-inquiry">'+
      '<div class="lead-dialog-head"><h2 id="lead-inquiry-title" tabindex="-1">Have '+school+' contact me</h2><button type="button" class="lead-close" data-lead-close aria-label="Close">×</button></div>'+
      '<p class="lead-intro">'+school+'’s admissions team can contact you about this program. DegreeSteps shares these details with '+school+' only if you tick the box below. Nothing is sent to anyone else.</p>'+
      '<p class="lead-attached"><span>Plan attached:</span> '+esc(plan.title)+'</p>'+
      '<label for="lead-first-name">First name</label><input id="lead-first-name" name="firstName" autocomplete="given-name" maxlength="60" required>'+
      '<label for="lead-email">Email</label><input id="lead-email" name="email" type="email" autocomplete="email" maxlength="254" required>'+
      '<label for="lead-phone">Phone <span class="lead-optional">(optional)</span></label><input id="lead-phone" name="phone" type="tel" autocomplete="tel" maxlength="40">'+
      '<label for="lead-location">State or country</label><input id="lead-location" name="location" autocomplete="address-level1" maxlength="80" required>'+
      '<fieldset class="lead-choices"><legend>When do you plan to start?</legend>'+START.map(([value,label],i)=>'<label><input type="radio" name="startTiming" value="'+value+'"'+(i?'':' required')+'> '+label+'</label>').join('')+'</fieldset>'+
      '<fieldset class="lead-choices"><legend>Do you have earlier college credit?</legend><label><input type="radio" name="priorCredit" value="yes" required> Yes</label><label><input type="radio" name="priorCredit" value="no"> No</label></fieldset>'+
      '<div class="lead-hp" aria-hidden="true"><label for="lead-website">Leave this empty</label><input id="lead-website" name="website" tabindex="-1" autocomplete="off"></div>'+
      '<label class="lead-consent"><input type="checkbox" name="consent" value="yes"> <span>'+esc(inquiryConsent(plan.school))+'</span></label>'+
      '<p class="lead-error" role="alert" hidden></p>'+
      '<div class="lead-buttons"><button type="submit" class="lead-button lead-primary">Send my request</button><button type="button" class="lead-button" data-lead-close>Cancel</button></div>'+
      '</form>';
  }
  function successHTML(plan,firstName){
    return '<div class="lead-done"><div class="lead-dialog-head"><h2 id="lead-inquiry-title" tabindex="-1">Request saved</h2><button type="button" class="lead-close" data-lead-close aria-label="Close">×</button></div>'+
      '<p>Thanks'+(firstName?', '+esc(firstName):'')+'. DegreeSteps will pass your details to '+esc(plan.school)+'’s admissions team so they can contact you about this program. Your plan has not changed.</p>'+
      '<p><a href="'+DISCLOSURE+'">How DegreeSteps makes money</a> explains how school contact requests work.</p>'+
      '<div class="lead-buttons"><button type="button" class="lead-button lead-primary" data-lead-close>Close</button></div></div>';
  }
  function closeDialog(){
    if(!dialog)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else{dialog.removeAttribute('open');dialog.hidden=true;}
  }
  function openInquiry(plan,trigger){
    const doc=root.document;if(!doc||!inquiryAllowed(plan.school))return false;
    if(!dialog){
      dialog=doc.createElement('dialog');dialog.className='lead-dialog';dialog.setAttribute('aria-labelledby','lead-inquiry-title');doc.body.appendChild(dialog);
      dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest?.('[data-lead-close]'))closeDialog();});
      dialog.addEventListener('close',()=>{const target=lastTrigger;lastTrigger=null;if(target&&target.isConnected)target.focus?.();});
      dialog.addEventListener('submit',event=>{event.preventDefault();submitInquiry(event.target).catch(()=>{});});
      // Keep keyboard focus inside the dialog: Tab from the last control wraps to the first, and back.
      dialog.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const items=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);
        if(!items.length)return;const first=items[0],last=items[items.length-1],active=doc.activeElement;
        if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
      });
    }
    lastTrigger=trigger||null;dialog.dataset.planId=plan.planId;dialog.dataset.school=plan.school;dialog.dataset.title=plan.title;
    dialog.innerHTML=dialogHTML(plan);dialog.hidden=false;
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    dialog.querySelector('#lead-first-name')?.focus();return true;
  }
  async function submitInquiry(form){
    const plan={planId:dialog.dataset.planId,school:dialog.dataset.school,title:dialog.dataset.title},error=form.querySelector('.lead-error'),button=form.querySelector('button[type="submit"]');
    const body={planId:plan.planId,firstName:formValue(form,'firstName').trim(),email:formValue(form,'email').trim(),phone:formValue(form,'phone').trim(),location:formValue(form,'location').trim(),startTiming:formValue(form,'startTiming'),priorCredit:formValue(form,'priorCredit'),consent:Boolean(form.elements.namedItem('consent')?.checked),consentVersion:config.schoolInquiries.consentVersion,website:formValue(form,'website')};
    const missing=[[!body.firstName,'firstName','Enter your first name.'],[!/^\S+@\S+\.\S+$/.test(body.email),'email','Enter an email address like name@example.com.'],[body.location.length<2,'location','Enter your state or country.'],[!body.startTiming,'startTiming','Choose when you plan to start.'],[!body.priorCredit,'priorCredit','Choose whether you have earlier college credit.'],[!body.consent,'consent','Tick the box to agree that DegreeSteps may share these details with '+plan.school+'.']].find(row=>row[0]);
    if(missing){const field=form.elements.namedItem(missing[1]);showError(error,missing[2],field&&(field.length?field[0]:field));return;}
    showError(error,'');button.disabled=true;button.textContent='Sending…';
    try{
      await post('/api/school-inquiries',body);
      growth('school_inquiry',{planId:plan.planId,action:'submitted'});
      dialog.innerHTML=successHTML(plan,body.firstName);dialog.querySelector('#lead-inquiry-title')?.focus();
    }catch(failure){button.disabled=false;button.textContent='Send my request';showError(error,failure.message,button);}
  }

  // ---------- Plan review page ----------
  function bindReview(form){
    if(form.dataset.leadBound)return;form.dataset.leadBound='1';
    const status=root.document.getElementById('plan-review-closed');
    if(!config?.planReview.enabled){form.hidden=true;if(status)status.hidden=false;return;}
    const select=form.elements.namedItem('planId'),requested=new URLSearchParams(root.location?.search||'').get('plan');
    if(select&&requested&&PLAN.test(requested)&&[...select.options].some(option=>option.value===requested))select.value=requested;
    form.addEventListener('submit',event=>{event.preventDefault();submitReview(form).catch(()=>{});});
  }
  async function submitReview(form){
    const error=form.querySelector('.lead-error'),button=form.querySelector('button[type="submit"]');
    const body={name:formValue(form,'name').trim(),email:formValue(form,'email').trim(),planId:formValue(form,'planId'),note:formValue(form,'note').trim(),consent:Boolean(form.elements.namedItem('consent')?.checked),consentVersion:config.planReview.consentVersion,website:formValue(form,'website')};
    if(!body.planId)delete body.planId;
    const missing=[[!body.name,'name','Enter your name.'],[!/^\S+@\S+\.\S+$/.test(body.email),'email','Enter an email address like name@example.com.'],[!body.consent,'consent','Tick the box to agree that DegreeSteps may email you about a plan review.']].find(row=>row[0]);
    if(missing){showError(error,missing[2],form.elements.namedItem(missing[1]));return;}
    showError(error,'');button.disabled=true;button.textContent='Sending…';
    try{
      const result=await post('/api/plan-review/requests',body);
      growth('plan_review_request',{...(body.planId?{planId:body.planId}:{})});
      const done=root.document.getElementById('plan-review-done');
      // Stripe stub: a future "checkout" status may return result.checkoutUrl. Until then no payment link is shown.
      void result;
      form.hidden=true;if(done){done.hidden=false;const email=done.querySelector('[data-review-email]');if(email)email.textContent=body.email;done.querySelector('h2')?.focus();}
    }catch(failure){button.disabled=false;button.textContent='Request a review';showError(error,failure.message,button);}
  }
  function bindPage(){
    const doc=root.document;if(!doc)return;
    doc.querySelectorAll?.('form[data-lead-form="plan-review"]').forEach(bindReview);
    if(!doc.documentElement?.dataset?.leadsBound&&doc.documentElement?.dataset){
      doc.documentElement.dataset.leadsBound='1';
      doc.addEventListener('click',event=>{
        const trigger=event.target?.closest?.('[data-lead-action="school-inquiry"]');if(!trigger)return;
        event.preventDefault();openInquiry({planId:trigger.dataset.planId,school:trigger.dataset.school,title:trigger.dataset.title},trigger);
      });
    }
  }
  function start(){
    const doc=root.document;if(!doc)return;
    // The plan review page shows its own "not open" note when the status request fails.
    const run=()=>load().then(value=>{if(!value)doc.querySelectorAll?.('form[data-lead-form="plan-review"]').forEach(form=>{form.hidden=true;const closed=doc.getElementById('plan-review-closed');if(closed)closed.hidden=false;});});
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',run,{once:true});else run();
  }
  if(root.document&&!(typeof module==='object'&&module.exports))start();
  return Object.freeze({load,actionsHTML,openInquiry,inquiryConsent,ready:()=>config,start});
}));
