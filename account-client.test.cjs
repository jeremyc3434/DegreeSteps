const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/account-client.js','utf8');
const DRAFT = 'degreepath-guide-v3', LINK = 'degreepath-account-link-v1';
const original = {version:3,profile:{school:'A school',degree:'A degree'},learning:[{id:'private-original',title:'Private learning'}],sheet:{notes:{private:'Private note'}}};
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(handler, initial = {}) {
  const store = new Map(Object.entries(initial).map(([k,v]) => [k,JSON.stringify(v)])), calls = [];
  const context = {localStorage:{getItem:key => store.get(key) || null,setItem:(key,value) => store.set(key,String(value)),removeItem:key => store.delete(key)},fetch:async (path,options) => {
    calls.push({path,options}); const response = await handler(path,options);
    return {ok:response.status < 400,status:response.status,json:async () => response.body};
  }};
  vm.runInNewContext(source,context);
  return {api:context.DegreeAccount,calls,store,context};
}
const ok = body => ({status:200,body});
test('sign-in/session reads never upload device learning or link another account', async () => {
  const f = fixture(() => ok({user:{id:'account-b'}}),{[DRAFT]:original,[LINK]:{ownerId:'account-a',planId:'plan-a',revision:4}});
  await f.api.session();
  assert.equal(f.calls.length,1); assert.equal(f.calls[0].path,'/api/portal/session');
  assert.equal(f.calls[0].options.method,'GET'); assert.equal(f.calls[0].options.body,undefined);
  assert.equal(f.store.has(LINK),false); assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original);
});
test('saving requires explicit consent and an authenticated owner', async () => {
  const f = fixture(() => ok({user:null}),{[DRAFT]:original});
  await assert.rejects(f.api.uploadDraft({title:'My plan'}),/Confirm/); assert.equal(f.calls.length,0);
  await assert.rejects(f.api.uploadDraft({title:'My plan',consent:true}),/Sign in/);
  assert.deepEqual(f.calls.map(call => call.path),['/api/portal/session']);
});
test('explicit upload sends private data only to the same-origin account API and records its returned revision', async () => {
  const f = fixture((path,options) => path.endsWith('/session') ? ok({user:{id:'account-a'}}) : ({status:201,body:{item:{id:'plan-a',revision:1}}}),{[DRAFT]:original});
  await f.api.uploadDraft({title:'My first plan',consent:true});
  const request = f.calls.find(call => call.path.endsWith('/plans'));
  assert.equal(request.options.credentials,'same-origin'); assert.equal(request.options.headers['X-Portal-Request'],'1');
  assert.equal(request.options.redirect,'error'); assert.deepEqual(JSON.parse(request.options.body),{title:'My first plan',state:original,consent:true});
  assert.deepEqual(JSON.parse(f.store.get(LINK)),{ownerId:'account-a',planId:'plan-a',revision:1});
});
test('update uses the owner-scoped saved revision and a conflict never overwrites either copy', async () => {
  const saved = {ownerId:'account-a',planId:'plan-a',revision:3};
  const f = fixture(path => path.endsWith('/session') ? ok({user:{id:'account-a'}}) : {status:409,body:{error:'A newer version exists.',code:'revision_conflict'}},{[DRAFT]:original,[LINK]:saved});
  await assert.rejects(f.api.uploadDraft({title:'Updated plan',consent:true,update:true}),error => error.status === 409 && error.code === 'revision_conflict');
  const update = f.calls.at(-1); assert.equal(update.path,'/api/portal/plans/plan-a'); assert.equal(update.options.method,'PUT');
  assert.equal(JSON.parse(update.options.body).revision,3); assert.deepEqual(JSON.parse(f.store.get(LINK)),saved); assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original);
});
test('an account switch cannot use another owner’s cloud marker for an update', async () => {
  const f = fixture(() => ok({user:{id:'account-b'}}),{[DRAFT]:original,[LINK]:{ownerId:'account-a',planId:'plan-a',revision:2}});
  await assert.rejects(f.api.uploadDraft({title:'My update',consent:true,update:true}),/Open a saved plan/);
  assert.equal(f.calls.length,1); assert.equal(f.store.has(LINK),false);
});
test('opening an incompatible or inaccessible saved plan preserves the current local draft', async () => {
  const f = fixture(path => path.endsWith('/session') ? ok({user:{id:'account-a'}}) : ok({item:{id:'plan-a',revision:1,state:{version:1}}}),{[DRAFT]:original});
  await assert.rejects(f.api.openPlan('plan-a'),/not compatible/); assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original);
  assert.equal(f.store.has(LINK),false);
});
test('storage quota failure during an open does not mark the saved plan as the local draft', async () => {
  const f = fixture(path => path.endsWith('/session') ? ok({user:{id:'account-a'}}) : ok({item:{id:'plan-a',revision:2,state:{...copy(original),profile:{degree:'Saved degree'}}}}),{[DRAFT]:original});
  f.context.localStorage.setItem = () => {throw new Error('Storage is full.');};
  await assert.rejects(f.api.openPlan('plan-a'),/Storage is full/); assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original); assert.equal(f.store.has(LINK),false);
});
test('sign-out removes account linkage and leaves the device draft available', async () => {
  const f = fixture(() => ok({ok:true}),{[DRAFT]:original,[LINK]:{ownerId:'account-a',planId:'plan-a',revision:2}});
  await f.api.signOut(); assert.equal(f.calls[0].path,'/api/auth/logout'); assert.equal(f.calls[0].options.method,'POST');
  assert.equal(f.store.has(LINK),false); assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original);
});
test('the account client refuses arbitrary outbound URLs', async () => {
  const f = fixture(() => ok({}));
  await assert.rejects(f.api.api('https://attacker.invalid/collect'),/valid account action/); assert.equal(f.calls.length,0);
});

const course = (patch = {}) => ({id:'english',provider:'Sophia',code:'ENG1001',title:'English Composition I',credits:3,creditSystem:'semester',status:'earned',completedOn:'2026-05-01',evaluations:[],...patch});
function restoreFixture(saved,local) {
  return fixture(path => path.endsWith('/session') ? ok({user:{id:'account-a'}}) : ok({item:{id:'older-plan',revision:2,state:saved}}),{[DRAFT]:local});
}
test('opening an older plan retains newer courses and notes while changing the degree target', async () => {
  const older = {version:3,profile:{school:'Old school',degree:'Old degree'},learning:[course()],sheet:{notes:{old:{one:'Older note'},shared:{one:'Older wording'}}},scenarios:{old:{priority:'cost'}},journey:{planReviewed:true,schoolContacted:true}};
  const newer = {version:3,profile:{school:'New school',degree:'New degree'},learning:[course(),course({id:'algebra',code:'MAT1001',title:'College Algebra',status:'saved'})],sheet:{notes:{new:{one:'Newer note'},shared:{one:'Current wording'}}},scenarios:{new:{priority:'speed'}}};
  const f = restoreFixture(older,newer), result = await f.api.openPlan('older-plan'), opened = JSON.parse(f.store.get(DRAFT));
  assert.equal(opened.profile.degree,'Old degree'); assert.equal(opened.learning.length,2);
  assert.equal(opened.learning.find(record => record.id === 'algebra').title,'College Algebra');
  assert.equal(opened.sheet.notes.old.one,'Older note'); assert.equal(opened.sheet.notes.new.one,'Newer note'); assert.equal(opened.sheet.notes.shared.one,'Current wording');
  assert.equal(opened.accountRestoreReview.notes[0].savedNote,'Older wording'); assert.equal(result.restore.conflicts,1);
  assert.equal(opened.journey.planReviewed,false); assert.equal(opened.journey.schoolContacted,false);
  assert.deepEqual(opened.scenarios,{new:{priority:'speed'},old:{priority:'cost'}});
});
test('conflicting historical course facts are retained for review without reviving approvals or duplicate earned credit', async () => {
  const oldRecord = course({credits:6,evaluations:[{programId:'old-degree',requirementId:'writing',status:'confirmed'}]});
  const currentRecord = course({credits:3,evaluations:[{programId:'current-degree',requirementId:'composition',status:'confirmed'}]});
  const older = {...copy(original),learning:[oldRecord]}, newer = {...copy(original),learning:[currentRecord]};
  const f = restoreFixture(older,newer), result = await f.api.openPlan('older-plan'), opened = JSON.parse(f.store.get(DRAFT));
  assert.deepEqual(opened.learning,[currentRecord]); assert.equal(result.restore.conflicts,1);
  assert.deepEqual(opened.accountRestoreReview.courses[0].savedRecord,oldRecord);
  assert.equal(opened.learning[0].evaluations.some(evaluation => evaluation.programId === 'old-degree'),false);
});
test('opening identical source facts does not resurrect school confirmations removed in the current collection', async () => {
  const older = {...copy(original),learning:[course({evaluations:[{programId:'old-degree',requirementId:'writing',status:'confirmed'}]})]};
  const newer = {...copy(original),learning:[course()]};
  const f = restoreFixture(older,newer); await f.api.openPlan('older-plan');
  assert.deepEqual(JSON.parse(f.store.get(DRAFT)).learning,[course()]);
});
test('a genuinely different course with a reused ID gets its own record without overwriting current work', async () => {
  const newer = {...copy(original),learning:[course()]}, math = course({code:'MAT1001',title:'College Algebra'}), older = {...copy(original),learning:[math]};
  const f = restoreFixture(older,newer); await f.api.openPlan('older-plan');
  const records = JSON.parse(f.store.get(DRAFT)).learning;
  assert.equal(records.length,2); assert.equal(records[0].code,'ENG1001'); assert.equal(records[1].code,'MAT1001'); assert.notEqual(records[0].id,records[1].id);
});
test('ambiguous matching records keep the older snapshot out of applied learning totals', async () => {
  const newer = {...copy(original),learning:[course({id:'attempt-a'}),course({id:'attempt-b'})]}, older = {...copy(original),learning:[course({id:'cloud-attempt'})]};
  const f = restoreFixture(older,newer); await f.api.openPlan('older-plan');
  const opened = JSON.parse(f.store.get(DRAFT)); assert.equal(opened.learning.length,2); assert.equal(opened.accountRestoreReview.courses.length,1);
});
test('unreadable or invalid local data is never silently overwritten while opening an account plan', async () => {
  for (const raw of ['{broken',JSON.stringify({version:3,learning:[]})]) {
    const f = restoreFixture(original,original); f.store.set(DRAFT,raw);
    await assert.rejects(f.api.openPlan('older-plan'),/not been replaced/); assert.equal(f.store.get(DRAFT),raw); assert.equal(f.store.has(LINK),false);
  }
});

test('restoring a target uses its saved settings and preserves newer settings for other degrees', async () => {
  const older = {...copy(original),selectedPathwayId:'degree-a',profile:{pathwayId:'degree-a'},scenarios:{'degree-a':{universityRate:300},'degree-b':{universityRate:100}},savings:{'degree-a':{outsideBudget:200},'degree-b':{outsideBudget:300}}};
  const newer = {...copy(original),selectedPathwayId:'degree-b',scenarios:{'degree-a':{universityRate:400},'degree-b':{universityRate:500}},savings:{'degree-a':{outsideBudget:600},'degree-b':{outsideBudget:700}}};
  const f = restoreFixture(older,newer); await f.api.openPlan('older-plan');
  const opened = JSON.parse(f.store.get(DRAFT));
  assert.equal(opened.scenarios['degree-a'].universityRate,300); assert.equal(opened.scenarios['degree-b'].universityRate,500);
  assert.equal(opened.savings['degree-a'].outsideBudget,200); assert.equal(opened.savings['degree-b'].outsideBudget,700);
});

function withReceipts(f) {f.context.crypto=require('node:crypto').webcrypto;f.context.TextEncoder=TextEncoder;return f;}
test('account save status starts with sign-in or save, never a local-storage success claim',async()=>{
  const f=withReceipts(fixture(()=>ok({}),{[DRAFT]:original}));
  assert.deepEqual(copy(await f.api.saveState(null)),{kind:'signed-out',label:'Sign in to save',action:'Save plan'});
  assert.deepEqual(copy(await f.api.saveState({id:'account-a'})),{kind:'unsaved',label:'Not saved to your account',action:'Save plan'});
  assert.equal(f.calls.length,0);
});
test('only an acknowledged exact account snapshot shows saved, then changed courses and notes require another save',async()=>{
  const f=withReceipts(fixture((path,options)=>path.endsWith('/session')?ok({user:{id:'account-a'}}):ok({item:{id:'receipt-plan',revision:1,state:JSON.parse(options.body).state}}),{[DRAFT]:original}));
  await f.api.uploadDraft({title:'My plan',consent:true});
  const receipt=JSON.parse(f.store.get(LINK));assert.match(receipt.savedHash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(receipt).includes('Private note'));assert(!JSON.stringify(receipt).includes('private-original'));
  assert.equal((await f.api.saveState({id:'account-a'})).kind,'saved');
  const changed=copy(original);changed.sheet.notes.private='A new private note';f.store.set(DRAFT,JSON.stringify(changed));
  assert.equal((await f.api.saveState({id:'account-a'})).kind,'changed');assert.equal((await f.api.saveState({id:'account-a'})).action,'Save changes');
  assert.equal((await f.api.saveState({id:'account-b'})).kind,'unsaved');
  const reordered={sheet:original.sheet,learning:original.learning,profile:original.profile,version:original.version};f.store.set(DRAFT,JSON.stringify(reordered));
  assert.equal((await f.api.saveState({id:'account-a'})).kind,'saved','JSON property ordering is not a student edit.');
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,1,'Status checks never upload changes.');
});
test('failed changed-plan saves preserve the last receipt and never claim the edited plan is saved',async()=>{
  const f=withReceipts(fixture((path,options)=>path.endsWith('/session')?ok({user:{id:'account-a'}}):options.method==='PUT'?{status:503,body:{error:'Try again later'}}:ok({item:{id:'receipt-plan',revision:1,state:JSON.parse(options.body).state}}),{[DRAFT]:original}));
  await f.api.uploadDraft({title:'My plan',consent:true});const previous=f.store.get(LINK);
  const changed=copy(original);changed.learning.push({id:'new-course',title:'New course'});f.store.set(DRAFT,JSON.stringify(changed));
  await assert.rejects(f.api.uploadDraft({title:'My plan',consent:true,update:true}),/Try again/);
  assert.equal(f.store.get(LINK),previous);assert.equal((await f.api.saveState({id:'account-a'})).kind,'changed');
});
test('opening an unchanged account plan on a new or identical browser draft is saved, while merged newer work remains unsaved',async()=>{
  for(const local of [null,copy(original)]){
    const f=withReceipts(fixture(path=>path.endsWith('/session')?ok({user:{id:'account-a'}}):ok({item:{id:'receipt-plan',revision:4,state:copy(original)}}),local?{[DRAFT]:local}:{}));
    await f.api.openPlan('receipt-plan');assert.equal((await f.api.saveState({id:'account-a'})).kind,'saved');assert.deepEqual(JSON.parse(f.store.get(DRAFT)),original);
  }
  const newer=copy(original);newer.sheet.notes.private='Keep my newer note';const f=withReceipts(restoreFixture(original,newer));await f.api.openPlan('older-plan');
  assert.equal((await f.api.saveState({id:'account-a'})).kind,'changed');assert.equal(JSON.parse(f.store.get(DRAFT)).sheet.notes.private,'Keep my newer note');
});
test('a late hash acknowledgement cannot replace the receipt of a newer save',async()=>{
  const f=withReceipts(fixture((path,options)=>path.endsWith('/session')?ok({user:{id:'account-a'}}):ok({item:{id:JSON.parse(options.body).title,revision:1,state:JSON.parse(options.body).state}}),{[DRAFT]:original}));
  const real=require('node:crypto').webcrypto;let release,hashes=0;
  f.context.crypto={subtle:{digest(...args){if(++hashes===1)return new Promise(resolve=>{release=()=>real.subtle.digest(...args).then(resolve);});return real.subtle.digest(...args);}}};
  const older=f.api.uploadDraft({title:'first-plan',consent:true});while(!release)await new Promise(resolve=>setImmediate(resolve));
  const newer=copy(original);newer.learning.push({id:'later-course',title:'Later course'});f.store.set(DRAFT,JSON.stringify(newer));await f.api.uploadDraft({title:'second-plan',consent:true});
  release();const result=await older;assert.equal(result.linkSaved,false);assert.equal(JSON.parse(f.store.get(LINK)).planId,'second-plan');assert.equal((await f.api.saveState({id:'account-a'})).kind,'saved');
});
