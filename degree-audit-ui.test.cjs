const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const KEY = 'degreepath-guide-v3';
const html = fs.readFileSync(__dirname + '/dist/degree-audit.html', 'utf8');
const source = fs.readFileSync(__dirname + '/dist/degree-audit.js', 'utf8');
const auditSource = fs.readFileSync(__dirname + '/dist/audit-curriculum.js', 'utf8');
const catalogSource = fs.readFileSync(__dirname + '/dist/program-catalog.js', 'utf8');
const baselineSource = fs.readFileSync(__dirname + '/dist/requirements-baselines.js', 'utf8');
const baselineCatalog = JSON.parse(fs.readFileSync(__dirname + '/content/catalog/umass-global-mypath-bba-requirements-2024-2025.json', 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const seed = () => ({version:3, profile:{school:'Example University', degree:'B.S. Biology', degreeLevel:'bachelor', pathwayId:'custom-target', modality:'any'}, selectedPathwayId:'custom-target', learning:[{id:'keep-course', title:'My earlier learning'}], sheet:{isExample:false, notes:{private:'Keep my note'}}, scenarios:{}, whatIf:{snapshots:[]}});
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attrs(text) {
  const result = {};
  for (const match of text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) result[match[1]] = decode(match[2] || '');
  return result;
}

// This surface runs the real event handlers and storage engine without requiring
// a browser process. Layout remains the responsibility of the browser journeys.
function element(tag = 'div', attributes = {}) {
  const listeners = new Map();
  const el = {tagName:tag.toUpperCase(), id:attributes.id || '', name:attributes.name || '', type:attributes.type || '', value:attributes.value || '', checked:Object.hasOwn(attributes,'checked'), disabled:Object.hasOwn(attributes,'disabled'), hidden:Object.hasOwn(attributes,'hidden'), maxLength:Number(attributes.maxlength || -1), textContent:'', children:[], dataset:{}, options:[], open:false,
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
    async emit(type, target = el) { for (const fn of listeners.get(type) || []) await fn({target, preventDefault(){}}); },
    focus() { el.focused = true; }, scrollIntoView(){}, setAttribute(name,value) { el[name] = value; },
    querySelectorAll(selector) { return selector === '[data-field]' ? el.fields || [] : []; },
    querySelector(selector) { return selector === 'input' ? el.fields?.[0] || null : null; },
    closest(selector) { return selector === '[data-remove-row]' && Object.hasOwn(el.dataset,'removeRow') ? el : null; }
  };
  for (const [name,value] of Object.entries(attributes)) if (name.startsWith('data-')) el.dataset[name.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase())] = value;
  let inner = '';
  Object.defineProperty(el, 'innerHTML', {get:() => inner, set(value) {
    inner = String(value);
    if (el.id !== 'audit-editor-rows') return;
    el.children = Array.from(inner.matchAll(/<div\b[^>]*class="audit-editor-row"[^>]*>([\s\S]*?)<\/div>/g), match => {
      const row = element();
      row.fields = Array.from(match[1].matchAll(/<input\b([^>]*)>/g), input => element('input', attrs(input[1])));
      row.remove = element('button', attrs(match[1].match(/<button\b([^>]*)>/)?.[1] || ''));
      return row;
    });
  }});
  Object.defineProperty(el, 'lastElementChild', {get:() => el.children.at(-1)});
  return el;
}

function mount({state = seed(), raw, query = '', quota = false, directory, baselineFailure = false, modelsForRoutes} = {}) {
  const ids = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const at = attrs(match[2]);
    if (at.id) ids.set(at.id, element(match[1], at));
  }
  const form = ids.get('audit-import-form');
  form.elements = {};
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>([\s\S]*?)<\/\1>|<(input)\b([^>]*)>/gi)) {
    const tag = match[1] || match[4], at = attrs(match[2] || match[5]);
    if (!at.name) continue;
    const field = element(tag, at);
    if (tag === 'select') field.options = Array.from((match[3] || '').matchAll(/<option\b([^>]*)>/g), option => ({value:attrs(option[1]).value || ''}));
    form.elements[at.name] = field;
  }
  let stored = raw === undefined ? JSON.stringify(state) : raw;
  let writes = 0;
  let resolveFetch, rejectFetch;
  const pending = new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
  const location = {search:query, href:'degree-audit.html' + query, pathname:'/degree-audit.html', hash:''};
  const sandbox = {
    document:{getElementById:id => ids.get(id)}, location, URL, URLSearchParams, Blob, TextEncoder, AbortController, setTimeout, clearTimeout, crypto:require('node:crypto').webcrypto,
    FormData:class { constructor(value) { return Object.entries(value.elements).filter(([,field]) => !field.disabled).map(([name,field]) => [name,field.value]); } },
    localStorage:{getItem:key => key === KEY ? stored : null, setItem(key,value) { if (quota) throw Error('QuotaExceededError'); if (key === KEY) {stored = value; writes++;} }},
    CustomEvent:class { constructor(type,options) {this.type=type;this.detail=options?.detail;} },
    dispatchEvent(){}, addEventListener(){}, history:{replaceState(_state,_title,url) {const parsed = new URL(url,'https://example.test/');location.search = parsed.search; location.href = String(url);}},
    fetch:url => url === 'data/requirements-baselines.json' ? Promise.resolve({ok:!baselineFailure,json:async () => vm.runInContext('JSON.parse',context)(JSON.stringify(baselineCatalog))}) : pending,
    DegreeSheet:{initialize:() => ({version:3,profile:{},learning:[],sheet:{isExample:false}})}, console
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(catalogSource, context, {filename:'program-catalog.js'});
  sandbox.DegreeProgramCatalog = {...sandbox.DegreeProgramCatalog, load:async value => value, loadIndex:async value => value, modelsForRoutes:modelsForRoutes || (async () => [])};
  vm.runInContext(auditSource, context, {filename:'audit-curriculum.js'});
  vm.runInContext(baselineSource, context, {filename:'requirements-baselines.js'});
  vm.runInContext(source, context, {filename:'degree-audit.js'});
  const ui = {
    ids, form, context, location,
    get saved() { return stored === null ? null : JSON.parse(stored); }, get raw() { return stored; }, get writes() { return writes; },
    replaceState(value) { stored = JSON.stringify(value); },
    async field(name,value) {form.elements[name].value = String(value); await form.emit('input',form.elements[name]);},
    async row(index,name,value) {const input = ids.get('audit-editor-rows').children[index].fields.find(input => input.dataset.field === name); assert(input, 'row field ' + name); if (input.type === 'checkbox') input.checked = value; else input.value = String(value); await form.emit('input',input);},
    async click(id) {await ids.get(id).emit('click');},
    async chooseBaseline(catalogId,emphasisId) {ids.get('audit-baseline-catalog').value=catalogId;ids.get('audit-baseline-emphasis').value=emphasisId;await ids.get('audit-baseline-load').emit('click');},
    async review() {await form.emit('submit');},
    async confirm() {ids.get('audit-confirm').checked = true; await ids.get('audit-confirm').emit('change');},
    async settle(value = directory) {resolveFetch({ok:true,json:async () => value || {pathways:[]}}); await new Promise(resolve => setImmediate(resolve));},
    async fail() {rejectFetch(Error('offline')); await new Promise(resolve => setImmediate(resolve));}
  };
  return ui;
}

async function completeRow(ui, title = 'Biology foundation') {
  await ui.row(0,'section','Major requirements');
  await ui.row(0,'title',title);
  await ui.row(0,'credits','3');
  await ui.field('level','bachelor');
  await ui.field('creditSystem','semester');
  await ui.field('totalCredits','3');
  await ui.field('sourceUrl','https://example.edu/biology');
}

test('MyPath catalog loading requires explicit catalog and emphasis without inferring either from enrollment context', async () => {
  const state=seed();state.profile={...state.profile,learnerStage:'enrolled',currentSchool:'UMass Global',currentProgram:'Business MyPath — enrolled 2024'};
  const ui=mount({state,query:'?baseline=umass-global-mypath-bba'});
  assert.equal(ui.ids.get('audit-baseline').open,true);
  assert.equal(ui.ids.get('audit-baseline-catalog').value,'');assert.equal(ui.ids.get('audit-baseline-emphasis').value,'');
  await ui.chooseBaseline('2024-2025','');assert.match(ui.ids.get('audit-message').textContent,/Choose the catalog and BBA emphasis/);
  assert.equal(ui.writes,0);assert.deepEqual(ui.saved,state);await ui.fail();
});

test('loading MyPath requirements saves an isolated draft and leaves the current target, original courses, notes and costs unchanged', async () => {
  const state=seed();state.scenarios={'custom-target':{universityRate:250,fees:79}};state.learning[0].grade='B+';state.learning[0].credits=4;state.learning[0].creditSystem='quarter';state.learning[0].evaluations=[];
  const ui=mount({state});await ui.chooseBaseline('2024-2025','marketing');
  const saved=ui.saved;assert.equal(ui.writes,1);for(const key of ['profile','selectedPathwayId','learning','sheet','scenarios','whatIf'])assert.deepEqual(saved[key],state[key]);
  const draft=saved.auditDrafts.drafts[0];assert.equal(draft.rows.length,60);assert.equal(draft.rows.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(draft.metadata.baselineMode,'requirements-only');assert.equal(draft.metadata.creditUnitLabel,'catalog-equivalent credits');assert.equal(draft.metadata.reviewedByStudent,false);
  const query=new URL(ui.location.href,'https://example.test/').search;
  const resumed=mount({state:saved,query});await resumed.settle();
  assert.equal(resumed.ids.get('audit-editor-rows').children.length,60);assert.equal(resumed.form.elements.baselineId.value,baselineCatalog.id);
  assert.match(resumed.ids.get('audit-baseline-context').innerHTML,/no approved outside-course awards/);assert.match(resumed.ids.get('audit-baseline-context').innerHTML,/catalog-equivalent credits/);
  await ui.fail();
});

test('unsaved requirements and failed catalog retrieval cannot be replaced by a MyPath baseline', async () => {
  const ui=mount();await ui.row(0,'title','Keep this unsaved requirement');const before=ui.raw;
  await ui.chooseBaseline('2024-2025','marketing');assert.match(ui.ids.get('audit-message').textContent,/Save your current requirements progress/);assert.equal(ui.raw,before);
  assert.equal(ui.ids.get('audit-editor-rows').children[0].fields.find(field=>field.dataset.field==='title').value,'Keep this unsaved requirement');
  const failed=mount({baselineFailure:true}),original=failed.raw;await failed.chooseBaseline('2024-2025','marketing');assert.match(failed.ids.get('audit-message').textContent,/unavailable/);assert.equal(failed.raw,original);assert.equal(failed.writes,0);
  const quota=mount({quota:true}),quotaBefore=quota.raw;await quota.chooseBaseline('2024-2025','marketing');assert.match(quota.ids.get('audit-message').textContent,/could not be saved/);assert.equal(quota.raw,quotaBefore);
  await Promise.all([ui.fail(),failed.fail(),quota.fail()]);
});

test('General Business keeps its variable 19-credit pool as a draft and cannot turn it into one planned course', async () => {
  const first=mount();await first.chooseBaseline('2024-2025','general-business');
  const ui=mount({state:first.saved,query:new URL(first.location.href,'https://example.test/').search});await ui.settle();
  assert.equal(ui.ids.get('audit-editor-rows').children.length,52);
  const draft=ui.saved.auditDrafts.drafts[0],pool=draft.rows.find(row=>row.allocationRequired);
  assert.equal(pool.credits,19);assert.equal(pool.code,'');assert.match(ui.ids.get('audit-baseline-context').innerHTML,/not one course or a fixed number/);
  await ui.review();assert.match(ui.ids.get('audit-message').textContent,/19 equivalent elective credits/);assert.equal(ui.ids.get('audit-review').hidden,true);assert.equal(ui.saved.customCurricula,undefined);assert.equal(ui.saved.selectedPathwayId,'custom-target');
  await first.fail();
});

test('reviewed named MyPath requirements build only a private proposed university plan and never inherit other UMass mappings', async () => {
  let inherited=0;const first=mount();await first.chooseBaseline('2024-2025','marketing');
  const before=first.saved,ui=mount({state:before,query:new URL(first.location.href,'https://example.test/').search,modelsForRoutes:async()=>{inherited++;return[];}});
  await ui.settle({pathways:[{id:'unrelated-umass',modelId:'unrelated-current-credit-hour',school:baselineCatalog.school}]});
  await ui.click('audit-add-row'); // A spare empty editor row is not a requirement or an unresolved pool.
  await ui.review();assert.equal(ui.ids.get('audit-review').hidden,false);assert.match(ui.ids.get('audit-degree-summary').textContent,/120 catalog-equivalent credits/);
  assert.match(ui.ids.get('audit-review-provenance').textContent,/not a verified transfer template/);assert.deepEqual(ui.saved.learning,before.learning);assert.equal(ui.saved.selectedPathwayId,before.selectedPathwayId);
  await ui.confirm();await ui.click('audit-build');assert.equal(ui.location.href,'plan.html');assert.equal(inherited,0);
  const next=ui.saved,model=next.customCurricula[0].model;assert.equal(model.completeExecutablePathway,false);assert.equal(model.auditProvenance.independentlyVerified,false);assert.equal(model.auditProvenance.requirementsBaseline.hash,baselineCatalog.hash);assert.equal(model.learningFormat,'competency-based');
  assert(model.requirements.every(row=>row.options.length===1&&row.options[0].provider==='University'&&row.options[0].evidence==='conditional'));
  for(const key of ['learning','scenarios'])assert.deepEqual(next[key],before[key]);assert.deepEqual(next.sheet.notes,before.sheet.notes);assert(next.whatIf.snapshots.some(item=>item.pathwayId===before.selectedPathwayId||item.targetIdentity?.route?.id===before.selectedPathwayId));
  const reopened=mount({state:next});await reopened.settle();assert.equal(reopened.form.elements.baselineHash.value,baselineCatalog.hash);assert.equal(reopened.ids.get('audit-editor-rows').children.length,61);
  await first.fail();
});

test('a MyPath baseline cannot be relabeled as another level, format, catalog, source or program', async () => {
  const first=mount();await first.chooseBaseline('2024-2025','marketing');
  for(const [name,value] of [['level','master'],['modality','campus'],['catalog','2025-2026'],['sourceUrl','https://example.edu/other-degree'],['title','Different business degree'],['programId','unrelated-program']]){
    const ui=mount({state:first.saved,query:new URL(first.location.href,'https://example.test/').search});await ui.settle();
    await ui.field(name,value);await ui.review();assert.match(ui.ids.get('audit-message').textContent,/no longer matches/);assert.equal(ui.ids.get('audit-review').hidden,true);assert.equal(ui.saved.customCurricula,undefined);assert.equal(ui.saved.selectedPathwayId,'custom-target');
  }
  await first.fail();
});

test('ordinary rows add and remove without importing a spreadsheet', async () => {
  const ui = mount();
  assert.equal(ui.ids.get('audit-editor-rows').children.length,1);
  assert.equal(ui.ids.get('audit-paste').open,false);
  await ui.row(0,'title','My requirement');
  await ui.click('audit-add-row');
  assert.equal(ui.ids.get('audit-editor-rows').children.length,2);
  assert.equal(ui.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'My requirement');
  await ui.ids.get('audit-editor-rows').emit('click',ui.ids.get('audit-editor-rows').children[1].remove);
  assert.equal(ui.ids.get('audit-editor-rows').children.length,1);
  await ui.fail();
});

test('partial progress saves blank source and total, then resumes its ordinary row', async () => {
  const ui = mount();
  await ui.row(0,'title','Still confirming the credits');
  await ui.click('audit-save');
  assert.equal(ui.writes,1);
  assert.equal(ui.saved.auditDrafts.drafts[0].metadata.sourceUrl,'');
  assert.equal(ui.saved.auditDrafts.drafts[0].metadata.totalCredits,'');
  assert.equal(ui.saved.auditDrafts.drafts[0].metadata.reviewedByStudent,false);
  assert.equal(ui.saved.selectedPathwayId,'custom-target');
  const resumed = mount({state:ui.saved,query:ui.location.search});
  assert.equal(resumed.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'Still confirming the credits');
  assert.match(resumed.ids.get('audit-save-status').textContent,/restored/i);
  await Promise.all([ui.fail(),resumed.fail()]);
});

test('manual upper-level requirements survive saving, resuming and building', async () => {
  const ui = mount();
  await completeRow(ui,'Advanced biology');
  await ui.row(0,'upperLevel',true);
  await ui.field('upperMinCredits','3');
  await ui.click('audit-save');
  assert.equal(ui.saved.auditDrafts.drafts[0].rows[0].upperLevel,true);
  const resumed = mount({state:ui.saved,query:ui.location.search});
  assert.equal(resumed.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'upperLevel').checked,true);
  await resumed.review();
  assert.equal(resumed.ids.get('audit-review').hidden,false);
  assert.match(resumed.ids.get('audit-preview-rows').innerHTML,/upper level/);
  await resumed.confirm();
  await resumed.click('audit-build');
  assert.equal(resumed.location.href,'plan.html',resumed.ids.get('audit-message').textContent);
  const model = resumed.saved.customCurricula[0].model;
  assert.equal(model.upperMinCredits,3);
  assert.equal(model.requirements[0].upper,true);
  assert.equal(model.requirements[0].options[0].upper,true);
  await Promise.all([ui.fail(),resumed.fail()]);
});

test('URL context is available before directory fetch settles, and survives failure', async () => {
  const ui = mount({query:'?school=Other+University&degree=M.S.+Data&programId=other-data&level=master&modality=online&creditSystem=quarter&sourceUrl=https%3A%2F%2Fother.edu%2Fdata&catalog=2027'});
  assert.equal(ui.form.elements.school.value,'Other University');
  assert.equal(ui.form.elements.title.value,'M.S. Data');
  assert.equal(ui.form.elements.programId.value,'other-data');
  assert.equal(ui.form.elements.level.value,'master');
  assert.equal(ui.form.elements.modality.value,'online');
  assert.equal(ui.form.elements.creditSystem.value,'quarter');
  assert.equal(ui.form.elements.sourceUrl.value,'https://other.edu/data');
  assert.equal(ui.form.elements.catalog.value,'2027');
  await ui.fail();
  assert.equal(ui.form.elements.title.value,'M.S. Data');
  assert.equal(ui.ids.get('audit-directory-status').hidden,false);
});

test('late directory context enriches blanks and preserves touched fields', async () => {
  const ui = mount({query:'?school=Example+University&degree=B.S.+Biology&programId=bio'});
  await ui.field('sourceUrl','https://example.edu/my-catalog');
  await ui.field('totalCredits','');
  await ui.settle({pathways:[{id:'bio',school:'Example University',title:'B.S. Biology',level:'bachelor',modalities:['online'],url:'https://example.edu/default',degreeCredits:120,creditUnit:'semester'}]});
  assert.equal(ui.form.elements.sourceUrl.value,'https://example.edu/my-catalog');
  assert.equal(ui.form.elements.totalCredits.value,'');
  assert.equal(ui.form.elements.modality.value,'online');
  assert.equal(ui.form.elements.creditSystem.value,'semester');
});

test('a directory-enriched draft resumes when the current target initially lacks its ID and units', async () => {
  const state = seed();
  state.profile.degreeLevel = '';
  const ui = mount({state});
  await ui.row(0,'title','Saved after the directory loaded');
  await ui.settle({pathways:[{id:'bio',school:'Example University',title:'B.S. Biology',level:'bachelor',modalities:['online'],url:'https://example.edu/biology',degreeCredits:120,creditUnit:'quarter'}]});
  await ui.click('audit-save');
  assert.equal(ui.saved.auditDrafts.drafts[0].context.programId,'bio');
  const resumed = mount({state:ui.saved});
  assert.equal(resumed.form.elements.programId.value,'bio');
  assert.equal(resumed.form.elements.creditSystem.value,'quarter');
  assert.equal(resumed.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'Saved after the directory loaded');
  await resumed.fail();
});

test('different known catalogs and credit units do not resume another target draft', async () => {
  const ui = mount();
  await ui.row(0,'title','The old catalog requirement');
  await ui.field('catalog','2026');
  await ui.field('creditSystem','quarter');
  await ui.click('audit-save');
  const resumed = mount({state:ui.saved,query:'?school=Example+University&degree=B.S.+Biology&level=bachelor&catalog=2027&creditSystem=semester'});
  assert.equal(resumed.form.elements.catalog.value,'2027');
  assert.equal(resumed.form.elements.creditSystem.value,'semester');
  assert.equal(resumed.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'');
  await Promise.all([ui.fail(),resumed.fail()]);
});

test('known online and campus requirements remain separate for an unlisted degree', async () => {
  const online = mount({query:'?school=Example+University&degree=B.S.+Biology&modality=online'});
  await online.row(0,'title','Online-specific requirement');
  await online.click('audit-save');
  const campus = mount({state:online.saved,query:'?school=Example+University&degree=B.S.+Biology&modality=campus'});
  assert.equal(campus.form.elements.modality.value,'campus');
  assert.equal(campus.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'');
  await campus.row(0,'title','Campus-specific requirement');
  await campus.click('audit-save');
  assert.equal(campus.saved.auditDrafts.drafts.length,2);
  const resumed = mount({state:campus.saved,query:online.location.search});
  assert.equal(resumed.form.elements.modality.value,'online');
  assert.equal(resumed.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'Online-specific requirement');
  await Promise.all([online.fail(),campus.fail(),resumed.fail()]);
});

test('changing the degree name clears its directory ID, and contradictory query context cannot supply a source', async () => {
  const ui = mount({query:'?school=Example+University&degree=B.S.+Biology&programId=bio'});
  await ui.field('title','B.S. Chemistry');
  assert.equal(ui.form.elements.programId.value,'');
  await ui.settle({pathways:[{id:'bio',school:'Example University',title:'B.S. Biology',url:'https://example.edu/biology',creditUnit:'semester',degreeCredits:120}]});
  assert.equal(ui.form.elements.title.value,'B.S. Chemistry');
  assert.equal(ui.form.elements.sourceUrl.value,'');
  const contradictory = mount({query:'?school=Example+University&degree=B.S.+Biology&programId=other-program'});
  await contradictory.settle({pathways:[{id:'other-program',school:'Different University',title:'M.S. Data',url:'https://different.edu/data',creditUnit:'quarter',degreeCredits:45}]});
  assert.equal(contradictory.form.elements.sourceUrl.value,'');
  assert.equal(contradictory.form.elements.totalCredits.value,'');
});

test('save reads the latest workspace and preserves other work added after opening', async () => {
  const ui = mount(), latest = seed();
  latest.learning.push({id:'new-course',title:'Added in my plan'});
  latest.sheet.notes.additional = 'Another tab changed this';
  latest.preferences = {theme:'dark'};
  ui.replaceState(latest);
  await ui.row(0,'title','Draft requirement');
  await ui.click('audit-save');
  assert.deepEqual(ui.saved.learning,latest.learning);
  assert.deepEqual(ui.saved.sheet.notes,latest.sheet.notes);
  assert.deepEqual(ui.saved.preferences,latest.preferences);
  assert.equal(ui.saved.selectedPathwayId,latest.selectedPathwayId);
  await ui.fail();
});

test('corrupt storage and quota errors leave saved bytes untouched', async () => {
  const corrupt = mount({raw:'{broken',query:'?school=Example&degree=Degree'});
  await corrupt.row(0,'title','Keep my unsaved text');
  await corrupt.click('audit-save');
  assert.equal(corrupt.raw,'{broken');
  assert.equal(corrupt.writes,0);
  assert.match(corrupt.ids.get('audit-message').textContent,/could not be read/i);
  const original = JSON.stringify(seed()), full = mount({raw:original,quota:true});
  await full.row(0,'title','Keep my unsaved text');
  await full.click('audit-save');
  assert.equal(full.raw,original);
  assert.equal(full.writes,0);
  assert.match(full.ids.get('audit-message').textContent,/could not be saved/i);
  assert.equal(full.ids.get('audit-editor-rows').children[0].fields.find(field => field.dataset.field === 'title').value,'Keep my unsaved text');
  await Promise.all([corrupt.fail(),full.fail()]);
});

test('review requires exact positive credits and a source; build requires student confirmation', async () => {
  const ui = mount(), original = clone(ui.saved);
  await completeRow(ui);
  await ui.field('sourceUrl','');
  await ui.review();
  assert.match(ui.ids.get('audit-message').textContent,/https|source|catalog link/i);
  assert.equal(ui.ids.get('audit-review').hidden,true);
  await ui.field('sourceUrl','https://example.edu/biology');
  await ui.field('totalCredits','4');
  await ui.review();
  assert.match(ui.ids.get('audit-message').textContent,/total 3|match/i);
  await ui.field('totalCredits','3');
  await ui.review();
  assert.equal(ui.ids.get('audit-review').hidden,false);
  assert.equal(ui.ids.get('audit-build').disabled,true);
  await ui.click('audit-build');
  assert.deepEqual(ui.saved,original);
  await ui.confirm();
  assert.equal(ui.ids.get('audit-build').disabled,false);
  const latest = clone(original);
  latest.learning.push({id:'latest',title:'Keep course added during review'});
  ui.replaceState(latest);
  await ui.click('audit-build');
  assert.equal(ui.location.href,'plan.html',ui.ids.get('audit-message').textContent);
  assert.deepEqual(ui.saved.learning,latest.learning);
  assert.deepEqual(ui.saved.sheet.notes,original.sheet.notes);
  assert.match(ui.saved.selectedPathwayId,/^student-audit-/);
  assert.equal(ui.saved.customCurricula[0].model.auditProvenance.independentlyVerified,false);
  assert.equal(ui.saved.customCurricula[0].model.requirements[0].options[0].evidence,'conditional');
  assert.equal(ui.saved.customCurricula[0].model.requirements[0].options[0].selectionRequired,true);
  await ui.fail();
});
