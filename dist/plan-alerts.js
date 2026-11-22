/* Email plan alerts: the worksheet opt-in and the account-settings list. Off unless the server enables
   /api/alerts (EMAIL_ALERTS_ENABLED=1); a 404 renders nothing. Uses the verified account email only. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreePlanAlerts = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const PATH = '/api/alerts/subscriptions', PLAN = /^[a-z0-9][a-z0-9-]{0,127}$/;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let listPromise = null, list = null, version = 0, disabled = false, optIn = null, settings = null, busy = false;
  /** Exact consent copy shown beside the unticked box. Kept here so tests and the owner can review it. */
  const COPY = Object.freeze({
    label: 'Email me if this plan changes',
    help: email => 'We’ll email ' + email + ' only about this plan: when its requirements, costs or school confirmations change, and at most one saved-plan reminder a month. Unsubscribing is one click, from any email or here.',
    on: 'Alerts are on for this plan.',
    off: 'Alerts are off for this plan.'
  });
  async function request(path, options = {}) {
    const method = options.method || 'GET', headers = {Accept:'application/json'};
    if (method !== 'GET') {headers['Content-Type'] = 'application/json'; headers['X-Portal-Request'] = '1';}
    const response = await root.fetch(path, {method, credentials:'same-origin', cache:'no-store', redirect:'error', headers, ...(method !== 'GET' ? {body:JSON.stringify(options.body || {})} : {})});
    let body; try {body = await response.json();} catch {body = {};}
    if (!response.ok) {const error = new Error(typeof body.error === 'string' ? body.error : 'Plan alerts could not be updated. Please try again.'); error.status = response.status; error.code = body.code; throw error;}
    return body;
  }
  function load(refresh = false) {
    if (disabled) return Promise.resolve(null);
    if (!refresh && listPromise) return listPromise;
    listPromise = request(PATH).then(value => {version++; list = {email:String(value.email || ''), items:Array.isArray(value.items) ? value.items : []}; return list;}, error => {
      // 404 means alerts are switched off on this site: never show any alert UI.
      if (error.status === 404) disabled = true;
      list = null; return null;
    });
    return listPromise;
  }
  function hide(node) {if (node) {node.hidden = true; node.innerHTML = ''; delete node.dataset.alertKey;}}

  // ---- Worksheet opt-in ----
  async function mountOptIn(node, {planId, inLibrary = true} = {}) {
    if (!node) return;
    optIn = {node, planId, inLibrary};
    const Account = root.DegreeAccount;
    if (disabled || !Account || !inLibrary || typeof planId !== 'string' || !PLAN.test(planId)) return hide(node);
    let user = null; try {user = (await Account.session()).user;} catch {user = null;}
    const link = user ? Account.linkedPlan(user) : null;
    if (!user || !link) return hide(node);
    const data = await load();
    if (optIn?.node !== node || optIn.planId !== planId) return;
    if (!data || !data.email) return hide(node);
    const key = planId + '|' + link.planId + '|' + version;
    if (!node.hidden && node.dataset.alertKey === key) return;
    node.dataset.alertKey = key;
    renderOptIn(node, planId, link, data);
  }
  function renderOptIn(node, planId, link, data, message = '') {
    const current = data.items.find(item => item.portalPlanId === link.planId && item.planId === planId);
    node.hidden = false;
    node.innerHTML = '<div class="plan-alerts"><label class="plan-alerts-choice"><input type="checkbox" id="plan-alerts-toggle" aria-describedby="plan-alerts-help"' + (current ? ' checked' : '') + '><span>' + esc(COPY.label) + '</span></label><p class="plan-alerts-help" id="plan-alerts-help">' + esc(COPY.help(data.email)) + '</p><p class="plan-alerts-status" role="status" aria-live="polite">' + esc(message) + '</p></div>';
    const box = node.querySelector('#plan-alerts-toggle'), status = node.querySelector('.plan-alerts-status');
    box.addEventListener('change', async () => {
      if (busy) {box.checked = !box.checked; return;}
      busy = true; box.disabled = true; status.textContent = box.checked ? 'Turning on alerts…' : 'Turning off alerts…';
      try {
        if (box.checked) await request(PATH, {method:'POST', body:{portalPlanId:link.planId, planId, consent:true}});
        else if (current) await request(PATH + '/' + encodeURIComponent(current.id), {method:'DELETE', body:{}});
        const fresh = await load(true);
        if (fresh && node.isConnected) {node.dataset.alertKey = planId + '|' + link.planId + '|' + version; renderOptIn(node, planId, link, fresh, box.checked ? COPY.on : COPY.off);}
      } catch (error) {box.checked = !box.checked; status.textContent = error.message;}
      finally {busy = false; if (box.isConnected) box.disabled = false;}
    });
  }

  // ---- Account settings list ----
  async function mountSettings(node) {
    if (!node) return;
    settings = node;
    if (list) renderSettings(node, list);
    const data = await load(true);
    if (settings !== node) return;
    if (!data) return hide(node);
    renderSettings(node, data);
  }
  function renderSettings(node, data, message = '') {
    node.hidden = false;
    node.innerHTML = '<h2>Email alerts</h2>' + (data.items.length ? '<p>We email ' + esc(data.email) + ' when these plans change. Remove a plan to stop its emails.</p><ul class="plan-alerts-list">' + data.items.map(item => '<li><span>' + esc(item.title || 'Saved degree plan') + '</span><button type="button" class="portal-secondary plan-alerts-remove" data-alert-remove="' + esc(item.id) + '" aria-label="Remove alerts for ' + esc(item.title || 'this plan') + '">Remove</button></li>').join('') + '</ul>' : '<p>No email alerts are on. You can turn them on from a saved plan’s worksheet.</p>') + '<p class="plan-alerts-status" role="status" aria-live="polite">' + esc(message) + '</p>';
    node.querySelectorAll('[data-alert-remove]').forEach(button => button.addEventListener('click', async () => {
      if (busy) return; busy = true; button.disabled = true;
      try {
        await request(PATH + '/' + encodeURIComponent(button.dataset.alertRemove), {method:'DELETE', body:{}});
        const fresh = await load(true); if (fresh && node.isConnected) renderSettings(node, fresh, 'Alerts removed. We won’t email you about that plan.');
      } catch (error) {const status = node.querySelector('.plan-alerts-status'); if (status) status.textContent = error.message; button.disabled = false;}
      finally {busy = false;}
    }));
  }
  if (root.addEventListener) root.addEventListener('degreepath:plan-saved', () => {listPromise = null; if (optIn?.node?.isConnected) void mountOptIn(optIn.node, optIn);});
  return Object.freeze({mountOptIn, mountSettings, copy:COPY, _reset:() => {listPromise = null; list = null; disabled = false; optIn = null; settings = null; busy = false;}});
}));
