/* Actual account-page events with synthetic private identities; no real login. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/account.js','utf8');
function fixture(identity){
 const state={user:structuredClone(identity)},calls=[],events={},nodes=new Map();
 for(const id of ['account-content','account-status','account-error'])nodes.set(id,{innerHTML:'',textContent:'',hidden:false,querySelector(){return null;}});
 const Account={
  async auth(){return{configured:true,providers:['email','google']};},
  async session(){return{user:structuredClone(state.user)};},
  async api(path,options={}){
   calls.push({path,...options});
   if(path==='/plans')return{items:[]};
   if(path==='/migration')return{available:false,items:[]};
   if(path==='/profile'&&options.method==='PATCH'){state.user.alias=options.body.alias;state.user.updatedAt=Math.max(Date.now(),(state.user.createdAt||0)+1);return{user:structuredClone(state.user)};}
   throw Error('Unexpected private API request '+path);
  },
  deviceDraft(){return null;},linkedPlan(){return null;},invalidate(){}
 };
 const context={window:{DegreeAccount:Account},document:{getElementById:id=>nodes.get(id),addEventListener:(event,fn)=>{events[event]=fn;}},location:{search:'',hash:'',origin:'https://degreesteps.test',pathname:'/account.html'},URLSearchParams,URL,console,FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name];}has(name){return Object.hasOwn(this.values,name);}},setTimeout,requestAnimationFrame:fn=>fn()};
 vm.runInNewContext(source,context,{filename:'account.js'});
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{calls,state,flush,html:()=>nodes.get('account-content').innerHTML,async chooseName(alias){const form={id:'account-profile-form',values:{alias},querySelector:()=>({textContent:''})};events.submit({target:form,preventDefault(){},submitter:{disabled:false,textContent:'Save name',isConnected:true}});await flush();}};
}
test('a default private profile uses the verified sign-in name without saving it or changing the alias',async()=>{
 const original={id:'student-a',alias:'Student',displayName:'Jeremy Collins',createdAt:1000,updatedAt:1000},f=fixture(original);await f.flush();
 assert.match(f.html(),/<h1>Hello, Jeremy Collins\.<\/h1>/);assert.match(f.html(),/name="alias" value="" placeholder="Jeremy Collins"/);
 assert.match(f.html(),/Using your sign-in profile name/);assert.match(f.html(),/public community name is managed separately/);
 assert.deepEqual(f.state.user,original);assert.equal(f.calls.filter(call=>call.method).length,0);
});
test('an explicitly chosen private nickname takes precedence over the provider name',async()=>{
 const f=fixture({id:'student-a',alias:'J. C.',displayName:'Private Legal Name'});await f.flush();
 assert.match(f.html(),/<h1>Hello, J\. C\.<\/h1>/);assert.match(f.html(),/name="alias" value="J\. C\."/);assert.doesNotMatch(f.html(),/Private Legal Name/);
});
test('an unnamed email account gets a welcome without guessing a name from its address',async()=>{
 const f=fixture({id:'student-a',alias:'Student',email:'do-not-infer-this@example.test'});await f.flush();
 assert.match(f.html(),/<h1>Welcome back\.<\/h1>/);assert.doesNotMatch(f.html(),/Hello, Student|do-not-infer-this/);assert.match(f.html(),/placeholder="Your name"/);
});
test('provider and private names remain escaped in headings and input attributes',async()=>{
 for(const identity of [{alias:'Student',displayName:'<img src=x onerror="bad()">'},{alias:'<script>bad()</script>',displayName:'Another name'}]){
  const f=fixture({id:'student-a',...identity});await f.flush();assert.doesNotMatch(f.html(),/<img|<script|onerror="bad/);assert.match(f.html(),/&lt;(?:img|script)/);
 }
});
test('saving a private nickname is explicit and the next account load retains it',async()=>{
 const f=fixture({id:'student-a',alias:'Student',displayName:'Jeremy Collins'});await f.flush();assert.equal(f.calls.filter(call=>call.method).length,0);
 await f.chooseName('Jeremy');const writes=f.calls.filter(call=>call.method);assert.equal(writes.length,1);assert.equal(writes[0].path,'/profile');assert.deepEqual(JSON.parse(JSON.stringify(writes[0].body)),{alias:'Jeremy'});
 assert.match(f.html(),/<h1>Hello, Jeremy\.<\/h1>/);assert.equal(f.state.user.displayName,'Jeremy Collins');assert.equal(f.state.user.alias,'Jeremy');
});
test('a deliberately edited neutral Student name stays neutral after saving and reopening the account',async()=>{
 const f=fixture({id:'student-a',alias:'Chosen nickname',displayName:'Private Legal Name',createdAt:1000,updatedAt:2000});await f.flush();await f.chooseName('Student');
 assert.match(f.html(),/<h1>Hello, Student\.<\/h1>/);assert.doesNotMatch(f.html(),/Private Legal Name/);assert.match(f.html(),/name="alias" value="Student"/);
 const reopened=fixture(f.state.user);await reopened.flush();assert.match(reopened.html(),/<h1>Hello, Student\.<\/h1>/);assert.doesNotMatch(reopened.html(),/Private Legal Name/);assert.equal(reopened.calls.filter(call=>call.method).length,0);
});
