/* Synthetic account and shell journeys: personalization never uploads a draft. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Return=require('./dist/account-return.js');
const accountSource=fs.readFileSync('dist/account.js','utf8'),shellSource=fs.readFileSync('dist/app-shell.js','utf8');
function accountFixture({draft=null,search='',signedIn=true,recovery=false,configured=true,items=[]}={}){
 const calls=[],redirects=[],nodes=new Map(),events={},store=new Map(),openFocus=[];
 const confirm={scrollIntoView:()=>openFocus.push('scroll'),focus:()=>openFocus.push('focus')};
 if(draft)store.set('degreepath-guide-v3',JSON.stringify(draft));
 for(const id of ['account-content','account-status','account-error'])nodes.set(id,{innerHTML:'',textContent:'',hidden:false,querySelector(selector){return selector==='[data-confirm-open]'&&this.innerHTML.includes('data-confirm-open=')?confirm:null;}});
 const account={
  DRAFT_KEY:'degreepath-guide-v3',
  deviceDraft:()=>store.has('degreepath-guide-v3')?JSON.parse(store.get('degreepath-guide-v3')):null,
  linkedPlan:()=>null,
  async auth(path){calls.push({kind:'auth',path});return{configured,providers:['email','google'],recovery};},
  async session(){return{user:signedIn?{id:'synthetic-student',alias:'Student',displayName:'Alex'}:null};},
  async api(path,options={}){calls.push({kind:'api',path,...options});return{items,available:false};},
  async uploadDraft(){throw Error('Welcome must not upload private work.');},
  clearLink(){store.delete('degreepath-account-link-v1');}
 };
 const context={window:null,document:{getElementById:id=>nodes.get(id),addEventListener:(name,fn)=>{events[name]=fn;}},DegreeAccount:account,DegreeAccountReturn:Return,
  location:{origin:'https://degreesteps.test',pathname:'/account.html',search,hash:'',assign:path=>redirects.push(path)},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},localStorage:{getItem:key=>store.get(key)||null,removeItem:key=>store.delete(key)},
  history:{replaceState(){}},URLSearchParams,URL,Date,console,setTimeout,requestAnimationFrame:fn=>fn()};
 context.window=context;vm.runInNewContext(accountSource,context,{filename:'account.js'});
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{calls,redirects,store,flush,openFocus,async openSaved(id){events.click({target:{closest:()=>({dataset:{openPlan:id}})}});await flush();},html:()=>nodes.get('account-content').innerHTML,async click(action){const button={dataset:{action}};events.click({target:{closest:()=>button}});await flush();}};
}
test('a new signed-in student sees a clear personalization start before saved-plan controls',async()=>{
 const f=accountFixture();await f.flush();
 assert.match(f.html(),/<h1>Hello, Alex\.<\/h1>/);
 assert.match(f.html(),/data-account-next-step href="portal.html\?view=setup">Personalize my recommendations/);
 assert(f.html().indexOf('data-account-next-step')<f.html().indexOf('<h2>My saved plans'));
 assert.match(f.html(),/href="portal.html\?view=preferences">My preferences/);
 assert.deepEqual(f.redirects,[]);assert.equal(f.calls.filter(call=>call.method).length,0);assert.equal(f.store.size,0);
});
test('both existing intake and new profile completion keep a direct continuation without changing private work',async()=>{
 for(const journey of [{intakeCompleted:true},{profileCompleted:true,profileVersion:1}]){
  const draft={version:3,profile:{school:'Selected university',degree:'Selected degree'},learning:[{id:'original',title:'Original private course'}],journey,sheet:{notes:{private:'Keep this note'}}};
  const f=accountFixture({draft});await f.flush();
  assert.match(f.html(),/data-account-next-step href="portal.html">Continue my plan/);
  assert.match(f.html(),/href="portal.html\?view=preferences">My preferences/);
  assert.deepEqual(JSON.parse(f.store.get('degreepath-guide-v3')),draft);
  assert.equal(f.calls.filter(call=>call.method).length,0);assert.deepEqual(f.redirects,[]);
 }
});
test('an unfinished draft is preserved while the account offers personalization',async()=>{
 const draft={version:3,profile:{school:'Selected university',degree:'Selected degree'},learning:[{id:'original'}],journey:{profileCompleted:false,intakeCompleted:false}};
 const f=accountFixture({draft});await f.flush();assert.match(f.html(),/>Personalize my recommendations<\/a>/);assert.deepEqual(JSON.parse(f.store.get('degreepath-guide-v3')),draft);
});
test('returning on another device leads with the latest saved plan without silently opening or uploading it',async()=>{
 const f=accountFixture({items:[{id:'older-plan',title:'Old goal',updatedAt:1},{id:'latest-plan',title:'My business degree',updatedAt:2}]});await f.flush();
 assert.match(f.html(),/data-account-next-step data-open-plan="latest-plan">Continue My business degree/);
 assert.doesNotMatch(f.html(),/data-account-next-step href="portal.html\?view=setup"/);
 assert.equal(f.calls.filter(call=>call.method).length,0);assert.deepEqual(f.redirects,[]);assert.equal(f.store.size,0);
 assert.match(f.html(),/My saved plans/);
 await f.openSaved('latest-plan');assert.match(f.html(),/data-confirm-open="latest-plan"/);assert.deepEqual(f.openFocus,['scroll','focus']);assert.equal(f.store.size,0);assert.equal(f.calls.filter(call=>call.method).length,0);
});
test('a requested community task resumes before unrelated account onboarding or saved-plan requests',async()=>{
 const f=accountFixture({search:'?returnTo='+encodeURIComponent('community.html?tab=templates&context=school:example')});await f.flush();
 assert.deepEqual(f.redirects,['/community.html?tab=templates&context=school%3Aexample']);
 assert.equal(f.calls.filter(call=>call.kind==='api').length,0);assert.equal(f.html(),'');
});
test('password recovery keeps its own screen instead of the signed-in personalization welcome',async()=>{
 const f=accountFixture({search:'?mode=recovery',recovery:true});await f.flush();
 assert.match(f.html(),/Choose a new password/);assert.doesNotMatch(f.html(),/data-account-next-step/);assert.deepEqual(f.redirects,[]);
});
test('signed-out students can reach preferences through My account on a mobile workspace',async()=>{
 for(const configured of [true,false]){
  const f=accountFixture({signedIn:false,configured});await f.flush();
  assert.match(f.html(),/href="portal.html\?view=preferences">My preferences/);
  assert.equal(f.calls.filter(call=>call.kind==='api').length,0);assert.deepEqual(f.redirects,[]);
 }
});
test('explicitly removing a device draft also clears unfinished preferences without changing unrelated local data',async()=>{
 const f=accountFixture({draft:{version:3,profile:{degree:'My degree'},learning:[],journey:{profileCompleted:true}}});await f.flush();
 f.store.set('degreesteps-profile-draft-v1',JSON.stringify({private:'Unfinished choices'}));f.store.set('degreepath-pathway-v2','legacy');f.store.set('degreepath-account-link-v1','linked-plan');f.store.set('unrelated-key','Keep');
 await f.click('confirm-clear-device');
 assert.deepEqual([...f.store],[['unrelated-key','Keep']]);assert.equal(f.calls.filter(call=>call.method).length,0);
});
function shellFixture(search=''){
 const shell={innerHTML:'',querySelector(){return null;}},context={window:null,location:{pathname:'/portal.html',search},URLSearchParams,Date,
  document:{createElement:()=>shell,body:{prepend(){},classList:{add(){}}},getElementById(){return null;},addEventListener(){}},addEventListener(){}};
 context.window=context;vm.runInNewContext(shellSource,context,{filename:'app-shell.js'});return shell.innerHTML;
}
test('preferences remain reachable from the workspace before account services are available',()=>{
 const markup=shellFixture();assert.match(markup,/class="dp-shell-website dp-shell-preferences" href="portal.html\?view=preferences">My preferences/);
 assert.match(markup,/data-shell-nav="plan"/);assert.match(markup,/data-shell-nav="credits"/);assert.match(markup,/data-shell-nav="programs"/);assert.match(markup,/data-shell-nav="community"/);
});
test('the preferences route is identified without marking My plan as the current screen',()=>{
 const markup=shellFixture('?view=preferences');assert.match(markup,/href="portal.html\?view=preferences" aria-current="page">My preferences/);
 assert.match(markup,/id="dp-shell-page-title">My preferences/);assert.doesNotMatch(markup,/href="plan.html" aria-current="page"/);
});
