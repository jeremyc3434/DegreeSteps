/* Account recovery exercises the real client transport without browser/provider access. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clientSource=fs.readFileSync('dist/account-client.js','utf8'),accountSource=fs.readFileSync('dist/account.js','utf8'),shellSource=fs.readFileSync('dist/app-shell.js','utf8');
const draft={version:3,profile:{degree:'My degree'},learning:[{id:'my-course',title:'My course'}],sheet:{notes:{private:'Keep this note'}}};
const owner={id:'sb-11111111-1111-4111-8111-111111111111',email:'student@example.test',alias:'Student'};
const flush=async()=>{for(let n=0;n<12;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({identityAvailable=true,signedIn=true,storageAvailable=false,listAvailable=true,logoutAvailable=true,recovery=false}={}){
  const state={identityAvailable,signedIn,storageAvailable,listAvailable,logoutAvailable,recovery},calls=[],events={},nodes=new Map();
  const store=new Map([['degreepath-guide-v3',JSON.stringify(draft)],['degreepath-account-link-v1',JSON.stringify({ownerId:owner.id,planId:'working-plan',revision:2})]]);
  for(const name of ['account-content','account-status','account-error'])nodes.set(name,{innerHTML:'',textContent:'',hidden:name==='account-error',querySelector(){return null;}});
  const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
  const context={window:null,URL,URLSearchParams,Date,console,setTimeout,requestAnimationFrame:callback=>callback(),FormData:class {constructor(form){this.values=form.values||{};}has(key){return Object.hasOwn(this.values,key);}get(key){return this.values[key];}},
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    location:{origin:'https://degreesteps.test',pathname:'/account.html',search:recovery?'?mode=recovery':'',hash:'',assign(){throw Error('Recovery must not redirect or replace the student draft.');}},history:{replaceState(){}},
    document:{getElementById:id=>nodes.get(id),addEventListener:(name,callback)=>{events[name]=callback;}},
    fetch:async(path,options)=>{
      calls.push({path,options});
      if(path==='/api/auth/status')return response(200,{configured:true,providers:['email','google'],recovery:state.recovery});
      if(path==='/api/auth/session')return state.identityAvailable?response(200,{configured:true,user:state.signedIn?{id:owner.id,email:owner.email}:null}):response(503,{error:'Provider detail must not become recovery copy.',code:'auth_unavailable'});
      if(path==='/api/portal/session')return state.storageAvailable?response(200,{user:state.signedIn?owner:null}):response(503,{error:'Private account storage is temporarily unavailable. Your device draft and older account copies have not been changed.',code:'storage_unavailable'});
      if(path==='/api/portal/plans')return state.listAvailable?response(200,{items:[]}):response(503,{error:'Internal storage detail.',code:'storage_unavailable'});
      if(path==='/api/portal/migration')return response(200,{available:false,status:'empty',items:[]});
      if(path==='/api/auth/logout'){
        if(!state.logoutAvailable)return response(503,{error:'Provider failed with internal detail.',code:'auth_unavailable'});
        state.signedIn=false;return response(200,{ok:true});
      }
      if(path==='/api/auth/login'){state.signedIn=true;return response(200,{ok:true,user:owner});}
      throw Error('Unexpected request '+path);
    }};
  context.window=context;vm.createContext(context);vm.runInContext(clientSource,context,{filename:'account-client.js'});vm.runInContext(accountSource,context,{filename:'account.js'});
  return{state,calls,nodes,store,flush,markup:()=>nodes.get('account-content').innerHTML,async click(action){const button={dataset:{action}};events.click({target:{closest:()=>button}});await flush();},async login(){const form={id:'account-auth-form',values:{email:owner.email,password:'synthetic-password'},querySelector:()=>({textContent:''}),reset(){}};events.submit({target:form,preventDefault(){},submitter:{textContent:'Sign in',isConnected:true}});await flush();}};
}
test('a saved-plan outage has clear recovery controls and independently verified sign-in',async()=>{
  const f=fixture();await f.flush();assert.match(f.markup(),/We couldn’t load your saved plans/);assert.match(f.markup(),/You’re signed in/);
  for(const label of ['Try again','Sign out','Open my plan'])assert(f.markup().includes(label));
  assert.equal(f.nodes.get('account-error').hidden,true);assert.doesNotMatch(f.markup(),/older account copies|Private account storage/);assert.equal(f.calls.filter(call=>call.path==='/api/auth/session').length,1);
  assert.deepEqual(JSON.parse(f.store.get('degreepath-guide-v3')),draft);assert.equal(f.calls.some(call=>call.options.method!=='GET'),false);
});
test('retry reloads saved plans without refreshing the browser or changing private device work',async()=>{
  const f=fixture();await f.flush();const original=Object.fromEntries(f.store);f.state.storageAvailable=true;await f.click('retry-account');
  assert.match(f.markup(),/My saved plans/);assert.doesNotMatch(f.markup(),/We couldn’t load/);assert.equal(f.calls.filter(call=>call.path==='/api/portal/session').length,2);
  assert.equal(f.calls.filter(call=>call.path==='/api/portal/plans').length,1);assert.deepEqual(Object.fromEntries(f.store),original);
});
test('normal account sign-out is visible in the heading and appears only once',async()=>{
  const f=fixture({storageAvailable:true});await f.flush();const heading=f.markup().split('<div class="account-layout">')[0];assert.match(heading,/account-heading-row/);assert.match(heading,/data-action="signout"/);assert.equal((f.markup().match(/data-action="signout"/g)||[]).length,1);
});
test('sign-out works during the outage without another saved-plan request and retains courses and notes',async()=>{
  const f=fixture();await f.flush();const reads=f.calls.filter(call=>call.path==='/api/portal/session').length,draftValue=f.store.get('degreepath-guide-v3');await f.click('signout');
  assert.equal(f.calls.filter(call=>call.path==='/api/portal/session').length,reads);assert.equal(f.state.signedIn,false);assert.match(f.markup(),/Welcome back/);assert.match(f.nodes.get('account-status').textContent,/Signed out/);
  assert.equal(f.store.get('degreepath-guide-v3'),draftValue);assert.equal(f.store.has('degreepath-account-link-v1'),false);
  const request=f.calls.find(call=>call.path==='/api/auth/logout');assert.equal(request.options.method,'POST');assert.equal(request.options.headers['X-Portal-Request'],'1');assert.equal(request.options.credentials,'same-origin');
});
test('failed sign-out keeps recovery available, account linkage intact and the outcome truthful',async()=>{
  const f=fixture({logoutAvailable:false});await f.flush();const original=Object.fromEntries(f.store);await f.click('signout');
  assert.equal(f.state.signedIn,true);assert.match(f.markup(),/data-action="signout"/);assert.equal(f.nodes.get('account-error').textContent,'We couldn’t sign you out. Try again.');assert.doesNotMatch(f.nodes.get('account-status').textContent,/Signed out/);assert.deepEqual(Object.fromEntries(f.store),original);
  f.state.logoutAvailable=true;await f.click('signout');assert.equal(f.state.signedIn,false);assert.match(f.markup(),/Welcome back/);assert.equal(f.nodes.get('account-error').hidden,true);
});
test('an unknown identity never becomes a false signed-in or signed-out claim',async()=>{
  const f=fixture({identityAvailable:false});await f.flush();assert.match(f.markup(),/data-action="retry-account"/);assert.match(f.markup(),/data-action="signout"/);assert.doesNotMatch(f.markup(),/You’re signed in|Welcome back/);assert.equal(f.nodes.get('account-error').hidden,true);
});
test('a verified expired session offers sign-in instead of trapping the student in storage recovery',async()=>{
  const f=fixture({signedIn:false});await f.flush();assert.match(f.markup(),/Continue with Google/);assert.doesNotMatch(f.markup(),/We couldn’t load/);assert.match(f.nodes.get('account-status').textContent,/Sign in/);
});
test('a plan-list outage preserves current sign-in proof without requesting identity twice',async()=>{
  const f=fixture({storageAvailable:true,listAvailable:false});await f.flush();assert.match(f.markup(),/You’re signed in/);assert.equal(f.calls.filter(call=>call.path==='/api/auth/session').length,0);assert.equal(f.nodes.get('account-error').hidden,true);
});
test('a verified password-reset flow remains available while saved-plan storage is unavailable',async()=>{
  const f=fixture({recovery:true});await f.flush();assert.match(f.markup(),/Choose a new password/);assert.doesNotMatch(f.markup(),/We couldn’t load/);assert.equal(f.nodes.get('account-error').hidden,true);assert.deepEqual(JSON.parse(f.store.get('degreepath-guide-v3')),draft);
});
test('successful email sign-in followed by a storage outage also shows recovery and sign-out controls',async()=>{
  const f=fixture({signedIn:false,storageAvailable:true});await f.flush();f.state.storageAvailable=false;await f.login();assert.match(f.markup(),/You’re signed in/);assert.match(f.markup(),/data-action="signout"/);assert.equal(f.nodes.get('account-error').hidden,true);assert.equal(f.calls.filter(call=>call.path==='/api/portal/plans').length,0);
});
test('sign-out never claims a local plan exists when this browser has none',async()=>{
  const f=fixture();f.store.delete('degreepath-guide-v3');await f.flush();assert.match(f.markup(),/Build my plan/);await f.click('signout');assert.equal(f.nodes.get('account-status').textContent,'You’re signed out.');
});
function shellFixture({identity=owner,identityAvailable=true,storageAvailable=false,pendingFirstRead=false}={}){
  const calls=[],events={},state={identity,identityAvailable,storageAvailable},selectors=new Map(),classes=new Set();
  let firstRead=true,release;
  const classList={add:value=>classes.add(value),remove:value=>classes.delete(value),toggle(value,on){if(on)classes.add(value);else classes.delete(value);}};
  for(const selector of ['.dp-shell-save-account','[data-shell-account-label]','[data-shell-account-detail]','.dp-shell-avatar'])selectors.set(selector,{hidden:true,textContent:'',innerHTML:'',classList});
  const shell={innerHTML:'',querySelector:selector=>selectors.get(selector)};
  const context={window:null,Date,URLSearchParams,location:{pathname:'/plan.html',search:''},MutationObserver:class{observe(){}},
    document:{createElement:()=>shell,body:{prepend(){},classList},getElementById:()=>null,addEventListener(){}},addEventListener:(name,callback)=>{events[name]=callback;},
    DegreeAccount:{deviceDraft:()=>draft,session:async()=>{calls.push('storage');if(pendingFirstRead&&firstRead){firstRead=false;return new Promise(resolve=>{release=resolve;});}if(!state.storageAvailable)throw Error('Storage unavailable');return{user:state.identity};},auth:async path=>{calls.push(path);if(!state.identityAvailable)throw Error('Identity unavailable');return{configured:true,user:state.identity};}}};
  context.window=context;vm.createContext(context);vm.runInContext(shellSource,context,{filename:'app-shell.js'});
  return{calls,state,selectors,flush,refresh:async()=>{events['degreepath:account']();await flush();},releaseFirstRead:async result=>{release(result);await flush();}};
}
test('the workspace distinguishes storage trouble while retaining the deliberate Keep my plan entry',async()=>{
  const f=shellFixture();await f.flush();assert.equal(f.selectors.get('[data-shell-account-detail]').textContent,'Signed in · Saved plans unavailable');assert.equal(f.selectors.get('.dp-shell-save-account').hidden,false);assert.equal(f.selectors.get('.dp-shell-save-account').textContent,'Keep my plan');assert.deepEqual(f.calls,['storage','/session']);
  f.state.storageAvailable=true;await f.refresh();assert.equal(f.selectors.get('[data-shell-account-detail]').textContent,'Manage private saved plans');assert.equal(f.selectors.get('.dp-shell-save-account').hidden,false);
});
test('the workspace only prompts sign-in after identity has actually been checked',async()=>{
  const unknown=shellFixture({identityAvailable:false});await unknown.flush();assert.equal(unknown.selectors.get('[data-shell-account-detail]').textContent,'Account status unavailable');
  const signedOut=shellFixture({identity:null});await signedOut.flush();assert.equal(signedOut.selectors.get('[data-shell-account-detail]').textContent,'Sign in to keep a private copy');
});
test('an older account response cannot overwrite a newer signed-out workspace state',async()=>{
  const f=shellFixture({pendingFirstRead:true,storageAvailable:true});f.state.identity=null;await f.refresh();assert.equal(f.selectors.get('[data-shell-account-detail]').textContent,'Sign in to keep a private copy');await f.releaseFirstRead({user:owner});assert.equal(f.selectors.get('[data-shell-account-detail]').textContent,'Sign in to keep a private copy');assert.equal(f.selectors.get('.dp-shell-save-account').hidden,false);assert.equal(f.selectors.get('.dp-shell-save-account').textContent,'Keep my plan');
});
