'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Save=require('./dist/plan-save.js'),Return=require('./dist/account-return.js');
const accountSource=fs.readFileSync('dist/account-client.js','utf8'),saveSource=fs.readFileSync('dist/plan-save.js','utf8');
const DRAFT='degreepath-guide-v3',LINK='degreepath-account-link-v1',copy=value=>JSON.parse(JSON.stringify(value));
const original={version:3,selectedPathwayId:'degree-a',profile:{school:'Example University',degree:'Business BS'},learning:[{id:'private-original',provider:'Previous college',title:'Private course',credits:3}],sheet:{isExample:false,notes:{private:'Do not publish this note'}},targetIdentity:{programId:'degree-a',catalog:'2026–27'}};
function store(initial={}){const values=new Map(Object.entries(initial));return{values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function fixture({user={id:'account-a',displayName:'Alex Student'},draft=original,link=null,conflict=false,networkFailure=false,sessionStore=store(),path='/plan.html'}={}){
 const local=store({[DRAFT]:JSON.stringify(draft),...(link?{[LINK]:JSON.stringify(link)}:{})}),calls=[],events=[],redirects=[],handlers=new Map(),dialogHandlers=new Map();let currentUser=user,failConflict=conflict,consent={checked:false,focus(){}};
 const h2={focus(){}},form={id:'plan-save-form',querySelector:selector=>selector==='[name="consent"]'?consent:null};
 const dialog={open:false,isConnected:true,_html:'',set innerHTML(v){this._html=v;consent.checked=false;},get innerHTML(){return this._html;},setAttribute(){},removeAttribute(){this.open=false;},addEventListener:(type,fn)=>dialogHandlers.set(type,fn),showModal(){this.open=true;},close(){this.open=false;dialogHandlers.get('close')?.();},querySelector:selector=>selector==='h2'?h2:selector==='form'?form:selector==='[name="consent"]'?consent:null};
 const context={console,URL,URLSearchParams,Date,localStorage:local,sessionStorage:sessionStore,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},location:{origin:'https://degreesteps.test',pathname:path,assign:value=>redirects.push(value)},document:{activeElement:{focus(){},isConnected:true},createElement:()=>dialog,body:{append(){}},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);}},addEventListener(type,fn){if(!handlers.has('window:'+type))handlers.set('window:'+type,[]);handlers.get('window:'+type).push(fn);},dispatchEvent:event=>events.push(event),fetch:async(path,options)=>{
  calls.push({path,options});let status=200,body;
  if(path==='/api/portal/session')body={user:currentUser};
  else if(options.method==='GET')body={item:{id:link?.planId||'old-plan',revision:link?.revision||1,school:draft.profile.school||'',degree:draft.profile.degree||'',state:copy(draft)}};
  else if(options.method==='PUT'&&failConflict){failConflict=false;status=409;body={error:'A newer account copy exists.',code:'revision_conflict'};}
  else {if(networkFailure)throw Error('Network interrupted');body={item:{id:'saved-plan',revision:options.method==='PUT'?(link?.revision||0)+1:1}};}
  return{ok:status<400,status,json:async()=>body};
 }};context.window=context;vm.createContext(context);vm.runInContext(accountSource,context);vm.runInContext(saveSource,context);
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{api:context.DegreePlanSave,account:context.DegreeAccount,context,local,sessionStore,calls,events,redirects,dialog,consent,flush,setUser:value=>currentUser=value,stored:()=>JSON.parse(local.getItem(DRAFT)),setDraft:value=>local.setItem(DRAFT,JSON.stringify(value)),
  async click(name){const button={dataset:{[name]:''}};for(const fn of handlers.get('click')||[])fn({target:{closest:()=>button},preventDefault(){}});await flush();},
  async submit(){for(const fn of handlers.get('submit')||[])fn({target:form,preventDefault(){}});await flush();},
  async storageEvent(key){for(const fn of handlers.get('window:storage')||[])fn({key});await flush();}};
}
test('save return intent contains only a named local page and an expiry',()=>{
 const s=store(),now=1000;assert.equal(Save.rememberIntent('/plan.html?notes=private#secret',s,now),true);
 assert.deepEqual(JSON.parse(s.getItem(Save.KEY)),{version:1,path:'/plan.html',expiresAt:now+Save.TTL});
 assert.equal(Save.readIntent(s,now+1).path,'/plan.html');assert.equal(Save.readIntent(s,now+Save.TTL+1),null);
 for(const path of ['//evil.test/plan.html','https://evil.test/plan.html','javascript:alert(1)','/foo/../plan.html','/%70lan.html','/foo/../import-courses.html','/account.html'])assert.equal(Save.safePage(path),null,path);
 assert.equal(Save.safePage('/import-courses.html'),'/courses.html');
 s.setItem(Save.KEY,JSON.stringify({version:1,path:'/plan.html',expiresAt:now+Save.TTL,privateDraft:original}));assert.equal(Save.readIntent(s,now),null);
 assert.equal(Save.rememberIntent('/plan.html',{setItem(){throw Error('blocked');}},now),false);
});
test('blank examples cannot be saved as a personal plan, while course-first collections can',()=>{
 assert.equal(Save.meaningfulDraft({version:3,profile:{},learning:[],sheet:{isExample:true}}),false);
 assert.equal(Save.meaningfulDraft({version:3,profile:{},learning:[{id:'saved-course'}],sheet:{isExample:true}}),true);
 assert.equal(Save.meaningfulDraft({version:3,profile:'invalid',learning:[{}]}),false);
 assert.equal(Save.meaningfulDraft(original),true);
});
test('a guest returns from sign-in to explicit consent without uploading during authentication',async()=>{
 const s=store(),guest=fixture({user:null,sessionStore:s});await guest.api.open();assert.match(guest.dialog.innerHTML,/Sign in to continue/);assert(!guest.calls.some(c=>c.options.method==='POST'));
 await guest.click('planSaveSignin');assert.deepEqual(guest.redirects,['/account.html?returnTo=%2Fplan.html']);assert.deepEqual(Object.keys(JSON.parse(s.getItem(Save.KEY))).sort(),['expiresAt','path','version']);
 const signed=fixture({sessionStore:s});await signed.flush();assert(signed.dialog.open);assert.match(signed.dialog.innerHTML,/Alex Student/);assert.equal(signed.consent.checked,false);assert(!signed.calls.some(c=>c.options.method==='POST'));
 await signed.submit();assert(!signed.calls.some(c=>c.options.method==='POST'));assert.match(signed.dialog.innerHTML,/Choose to save/);
 signed.consent.checked=true;await signed.submit();const post=signed.calls.find(c=>c.options.method==='POST');assert(post);assert.equal(post.path,'/api/portal/plans');assert.deepEqual(JSON.parse(post.options.body),{title:'Business BS',state:original,consent:true});assert.deepEqual(signed.stored(),original);assert.equal(s.getItem(Save.KEY),null);assert.match(signed.dialog.innerHTML,/Saved to your account/);
 assert.deepEqual(copy(signed.events.map(e=>e.detail)),[{event:'account_plan_saved',context:'workspace'}]);assert(!JSON.stringify(signed.events).includes('private-original'));
});
test('an account switch resets consent before any private draft is posted',async()=>{
 const f=fixture();await f.api.open();f.setUser({id:'account-b',displayName:'Other account'});f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.match(f.dialog.innerHTML,/Other account/);assert.equal(f.consent.checked,false);assert.deepEqual(f.stored(),original);
});
test('a changed draft is re-reviewed instead of sending the old consent to new records',async()=>{
 const f=fixture();await f.api.open();const changed=copy(original);changed.learning.push({id:'new-private-course'});f.setDraft(changed);f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.match(f.dialog.innerHTML,/Your device plan changed/);assert.equal(f.consent.checked,false);assert.match(f.dialog.innerHTML,/2 saved courses/);
});
test('a revision conflict keeps both copies and requires explicit new-copy consent',async()=>{
 const f=fixture({link:{ownerId:'account-a',planId:'old-plan',revision:3},conflict:true});await f.api.open();assert.match(f.dialog.innerHTML,/Update saved plan/);f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='PUT').length,1);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);assert.match(f.dialog.innerHTML,/Save as a new copy/);assert.equal(f.consent.checked,false);assert.deepEqual(f.stored(),original);
 f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);assert.match(f.dialog.innerHTML,/Saved to your account/);
});
test('a different exact degree or catalog receives a new copy even with an identical degree title',async()=>{
 const draft=copy(original),Account={session:async()=>({user:{id:'account-a'}}),deviceDraft:()=>draft,linkedPlan:()=>({planId:'old-plan',revision:2}),api:async()=>({item:{id:'old-plan',revision:2,school:draft.profile.school,degree:draft.profile.degree,state:{...draft,selectedPathwayId:'different-format'}}})};
 let review=await Save.prepareReview(Account);assert.equal(review.updateAllowed,false);
 Account.api=async()=>({item:{id:'old-plan',revision:2,school:draft.profile.school,degree:draft.profile.degree,state:{...draft,targetIdentity:{programId:'degree-a',catalog:'2025–26'}}}});review=await Save.prepareReview(Account);assert.equal(review.updateAllowed,false);
});
test('a successful server save is not retried when the device cannot store its link',async()=>{
 const f=fixture();await f.api.open();const previous=f.local.setItem;f.local.setItem=(key,value)=>{if(key===LINK)throw Error('quota');previous(key,value);};f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);assert.match(f.dialog.innerHTML,/Saved to your account/);assert.match(f.dialog.innerHTML,/could not link/);assert.deepEqual(f.stored(),original);
});
test('cancel and device removal do not upload or retain an authentication save request',async()=>{
 const f=fixture();await f.api.open();Save.rememberIntent('/plan.html',f.sessionStore);await f.click('planSaveCancel');assert.equal(f.dialog.open,false);assert.equal(f.sessionStore.getItem(Save.KEY),null);assert.equal(f.calls.filter(c=>c.options.method!=='GET').length,0);assert.deepEqual(f.stored(),original);
 assert.equal(Return.normalize('/growth.html?notes=private','https://degreesteps.test'),'/growth.html');assert.equal(Return.normalize('/campuses.html?next=https://evil.test','https://degreesteps.test'),'/campuses.html');
});
test('an interrupted save never retries automatically and directs the student to check account copies',async()=>{
 const f=fixture({networkFailure:true});await f.api.open();f.consent.checked=true;await f.submit();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);assert.match(f.dialog.innerHTML,/could not confirm/);assert.match(f.dialog.innerHTML,/Check my saved plans/);assert.doesNotMatch(f.dialog.innerHTML,/id="plan-save-form"/);assert.deepEqual(f.stored(),original);
});
