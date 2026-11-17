/* Private account transport. Authentication cookies stay HttpOnly on the server. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreeAccount = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const DRAFT_KEY = 'degreepath-guide-v3', LINK_KEY = 'degreepath-account-link-v1';
  let cachedSession;
  function read(name) {try {return JSON.parse(root.localStorage.getItem(name));} catch {return null;}}
  function clearLink() {try {root.localStorage.removeItem(LINK_KEY);} catch { /* inaccessible storage is reported by the calling action */ }}
  function validDraft(state) {return Boolean(state && state.version === 3 && state.profile && typeof state.profile === 'object' && !Array.isArray(state.profile) && Array.isArray(state.learning));}
  async function request(path, options = {}) {
    if (!/^\/api\/(?:portal|auth)\/[A-Za-z0-9_/?=&.-]+$/.test(path)) throw new Error('Choose a valid account action.');
    const method = options.method || 'GET', headers = {'Accept':'application/json'};
    if (method !== 'GET') {headers['Content-Type'] = 'application/json'; headers['X-Portal-Request'] = '1';}
    const response = await root.fetch(path, {method, credentials:'same-origin', cache:'no-store', redirect:'error', headers, ...(method !== 'GET' ? {body:JSON.stringify(options.body || {})} : {})});
    let body; try {body = await response.json();} catch {body = {};}
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : 'That account action could not be completed. Please try again.');
      error.status = response.status; error.code = body.code; throw error;
    }
    return body;
  }
  const api = (path, options) => request('/api/portal' + path, options);
  const auth = (path, options) => request('/api/auth' + path, options);
  async function session(refresh = false) {
    if (!refresh && cachedSession) return cachedSession;
    const value = await api('/session');
    cachedSession = value;
    const link = read(LINK_KEY);
    if (value.user && link && link.ownerId !== value.user.id) clearLink();
    return value;
  }
  function invalidate() {cachedSession = undefined;}
  function deviceDraft() {const state = read(DRAFT_KEY); return validDraft(state) ? state : null;}
  function linkedPlan(user) {const link = read(LINK_KEY); return user && link?.ownerId === user.id && typeof link.planId === 'string' && Number.isInteger(link.revision) ? link : null;}
  function setLink(user, item) {
    if (!user?.id || !item?.id || !Number.isInteger(item.revision)) throw new Error('The saved plan could not be linked to this account.');
    root.localStorage.setItem(LINK_KEY, JSON.stringify({ownerId:user.id,planId:item.id,revision:item.revision}));
  }
  async function uploadDraft({title, consent, update = false} = {}) {
    if (consent !== true) throw new Error('Confirm that you want to save this private device draft to your account.');
    const current = await session(true), user = current.user;
    if (!user) throw new Error('Sign in before saving a plan to your account.');
    const state = deviceDraft(); if (!state) throw new Error('Build a draft before saving it to your account.');
    const link = update ? linkedPlan(user) : null;
    if (update && !link) throw new Error('Open a saved plan from this account before updating it.');
    const result = await api(link ? '/plans/' + encodeURIComponent(link.planId) : '/plans', {method:link ? 'PUT' : 'POST', body:{title,state,...(link ? {revision:link.revision} : {consent:true})}});
    setLink(user,result.item); return result;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const list = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
  const provider = value => ({sophialearning:'sophia',sophiaorg:'sophia',collegelevelexaminationprogram:'clep',jointservicestranscript:'jst',communitycollegeoftheairforce:'ccaf'}[normalized(value)] || normalized(value));
  const factFields = ['provider','code','title','credits','creditSystem','status','completedOn','institution','sourceProgramId'];
  const sameFacts = (a,b) => factFields.every(key => String(a[key] ?? '') === String(b[key] ?? ''));
  function sameCourse(a,b) {
    if (a.catalogCourseId && a.catalogCourseId === b.catalogCourseId) return true;
    if (!provider(a.provider) || provider(a.provider) !== provider(b.provider)) return false;
    if (provider(a.provider) === 'university' && (!normalized(a.institution) || normalized(a.institution) !== normalized(b.institution) || a.sourceProgramId !== b.sourceProgramId)) return false;
    return Boolean(a.code && b.code && normalized(a.code) === normalized(b.code));
  }
  function storedDraftForRestore() {
    let raw; try {raw = root.localStorage.getItem(DRAFT_KEY);} catch {throw new Error('Device storage is unavailable. Your current courses have not been replaced.');}
    if (raw === null) return null;
    let state; try {state = JSON.parse(raw);} catch {throw new Error('Your device draft could not be read. It has not been replaced. Download or recover a backup before opening another plan.');}
    if (!validDraft(state)) throw new Error('Your device draft needs recovery before opening another plan. It has not been replaced.');
    return state;
  }
  function mergePlan(saved,local,planId) {
    const next = clone(saved);
    const hasPrivate=value=>value&&(Object.prototype.hasOwnProperty.call(value,'auditDrafts')||Object.prototype.hasOwnProperty.call(value,'customCurricula'));
    const audit=hasPrivate(saved)||hasPrivate(local)?root.AuditCurriculum||(typeof require==='function'?require('./audit-curriculum.js'):null):null;
    if((hasPrivate(saved)||hasPrivate(local))&&!audit?.validatePrivateWork)throw new Error('Refresh your account page before opening a plan with private requirements. Your device plan has not been replaced.');
    if(audit){audit.validatePrivateWork(saved);if(local)audit.validatePrivateWork(local);}
    if (!local) return {state:next,conflicts:0};
    // A degree target is a view over the student's shared source records. A
    // historical snapshot never changes newer source facts or revives an old
    // school approval on a record that is already present on this device.
    const learning = clone(local.learning), usedIds = new Set(learning.map(record => record.id));
    const unique = values => [...new Map(values.map(value => [JSON.stringify(value),value])).values()];
    const review = {courses:unique([...list(saved.accountRestoreReview?.courses),...list(local.accountRestoreReview?.courses)].map(clone)),notes:unique([...list(saved.accountRestoreReview?.notes),...list(local.accountRestoreReview?.notes)].map(clone))};
    let conflicts = 0;
    const archive = (current,snapshot,index) => {
      const item = {id:planId + '-course-' + index,planId,currentRecordId:current.id,savedRecord:clone(snapshot)};
      if (!review.courses.some(entry => entry.currentRecordId === current.id && JSON.stringify(entry.savedRecord) === JSON.stringify(snapshot))) review.courses.push(item);
      conflicts++;
    };
    saved.learning.forEach((record,index) => {
      const sameId = learning.find(current => current.id && current.id === record.id);
      const matches = learning.filter(current => sameCourse(current,record) && !(current.completedOn && record.completedOn && current.completedOn !== record.completedOn && current.id !== record.id));
      const current = sameId && (sameCourse(sameId,record) || !sameId.provider || !record.provider) ? sameId : matches.length === 1 ? matches[0] : null;
      if (current) {
        if (!sameFacts(current,record)) archive(current,record,index);
        return;
      }
      if (matches.length > 1) {archive({id:null},record,index); return;}
      const restored = clone(record);
      if (!restored.id || usedIds.has(restored.id)) {
        const base = 'restored-' + planId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,50) + '-' + index;
        let suffix = 0; restored.id = base;
        while (usedIds.has(restored.id)) restored.id = base + '-' + (++suffix);
      }
      usedIds.add(restored.id); learning.push(restored);
    });
    const mergeNotes = (previous,current,path=[]) => {
      const result = clone(object(previous));
      for (const [key,value] of Object.entries(object(current))) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.defineProperty(result,key,{value:mergeNotes(result[key],value,[...path,key]),writable:true,enumerable:true,configurable:true});
        } else {
          if (Object.prototype.hasOwnProperty.call(result,key) && JSON.stringify(result[key]) !== JSON.stringify(value)) {
            const note = {planId,path:[...path,key],savedNote:clone(result[key]),currentNote:clone(value)};
            if (!review.notes.some(entry => JSON.stringify(entry) === JSON.stringify(note))) review.notes.push(note);
            conflicts++;
          }
          Object.defineProperty(result,key,{value:clone(value),writable:true,enumerable:true,configurable:true});
        }
      }
      return result;
    };
    next.learning = learning;
    next.sheet = {...object(saved.sheet),notes:mergeNotes(object(saved.sheet).notes,object(local.sheet).notes)};
    // Retain working settings and notes for other degrees while opening the
    // saved target's settings. No course evaluation is copied between targets.
    const activeTargets = new Set([saved.selectedPathwayId,saved.profile?.pathwayId].filter(Boolean));
    const perProgram = key => {
      const previous = object(saved[key]), current = object(local[key]), merged = {...previous,...current};
      for (const id of activeTargets) if (Object.prototype.hasOwnProperty.call(previous,id)) Object.defineProperty(merged,id,{value:clone(previous[id]),enumerable:true,writable:true,configurable:true});
      return merged;
    };
    next.scenarios = perProgram('scenarios');
    next.savings = perProgram('savings');
    if(audit){
      const drafts=new Map([...list(saved.auditDrafts?.drafts),...list(local.auditDrafts?.drafts)].map(draft=>[draft.key,clone(draft)]));
      if(saved.auditDrafts||local.auditDrafts)next.auditDrafts={version:1,drafts:[...drafts.values()]};
      const imports=new Map();
      for(const entry of [...list(saved.customCurricula),...list(local.customCurricula)]){
        const old=imports.get(entry.route.id);
        if(old&&JSON.stringify(old)!==JSON.stringify(entry))throw new Error('Two private audits share an ID with different requirements. Your device plan has not been replaced. Keep a backup before importing a new version.');
        imports.set(entry.route.id,clone(entry));
      }
      if(saved.customCurricula||local.customCurricula)next.customCurricula=[...imports.values()];
      const snapshots=new Map();
      for(const value of [saved,local]){
        if(value.whatIf?.snapshots!==undefined&&!Array.isArray(value.whatIf.snapshots))throw new Error('Saved plan versions need recovery. Your device plan has not been replaced.');
        for(const snapshot of list(value.whatIf?.snapshots)){if(!snapshot||typeof snapshot.id!=='string')throw new Error('A saved plan version could not be read. Your device plan has not been replaced.');snapshots.set(snapshot.id,clone(snapshot));}
      }
      if(snapshots.size>20)throw new Error('These plans have too many saved versions to combine. Your device plan has not been replaced.');
      if(snapshots.size)next.whatIf={...object(next.whatIf),snapshots:[...snapshots.values()]};
    }
    // Checklists are current student work, shared across degree views. Keep
    // every local collection when opening an older account snapshot; the
    // local copy of a collection also preserves intentional task deletions.
    if (Object.prototype.hasOwnProperty.call(local,'checklist')) {
      const current=local.checklist, previous=saved.checklist;
      const valid=value=>value&&value.version===1&&value.plans&&typeof value.plans==='object'&&!Array.isArray(value.plans);
      if (!valid(current)||previous!==undefined&&!valid(previous)) throw new Error('A saved checklist needs recovery. Your device plan has not been replaced.');
      const plans={...clone(previous?.plans||{}),...clone(current.plans)};
      if (Object.keys(plans).length>100) throw new Error('These plans have too many checklist collections to combine. Your device plan has not been replaced.');
      next.checklist={version:1,plans};
    }
    next.accountRestoreReview = review;
    if (learning.some(record => record.status === 'earned')) next.profile.hasPrior = 'some';
    if (JSON.stringify(learning) !== JSON.stringify(saved.learning)) {
      next.journey = {...object(next.journey),planReviewed:false,schoolContacted:false};
    }
    if(audit)audit.validatePrivateWork(next);
    return {state:next,conflicts};
  }
  async function openPlan(id) {
    const current = await session(true); if (!current.user) throw new Error('Sign in to open your saved plan.');
    const result = await api('/plans/' + encodeURIComponent(id));
    if (!validDraft(result.item?.state)) throw new Error('This saved plan is not compatible with the current planner. Download a copy before changing it.');
    if (!result.item.id || !Number.isInteger(result.item.revision)) throw new Error('This saved plan is missing its version information. Your device draft has not been changed.');
    const local = storedDraftForRestore(), merged = mergePlan(result.item.state,local,result.item.id);
    // setItem is atomic: a quota failure leaves the original device draft intact.
    root.localStorage.setItem(DRAFT_KEY,JSON.stringify(merged.state));
    setLink(current.user,result.item);
    return {...result,restore:{conflicts:merged.conflicts,coursesPreserved:local?.learning.length || 0}};
  }
  async function signOut() {const result = await auth('/logout',{method:'POST'}); clearLink(); invalidate(); return result;}
  return Object.freeze({DRAFT_KEY,LINK_KEY,api,auth,session,invalidate,deviceDraft,linkedPlan,clearLink,uploadDraft,openPlan,signOut});
}));
