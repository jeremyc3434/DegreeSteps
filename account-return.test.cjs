const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Return=require('./dist/account-return.js'),origin='https://degreepath.test';
function storage(initial={}){const values=new Map(Object.entries(initial));return{values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('named local pages and same-origin absolute pages normalize to a local path',()=>{
 for(const file of ['account','portal','plan','request-plan','admin','school','community','courses','programs','compare-plans','degree-audit']){
  assert.equal(Return.normalize(file+'.html',origin),'/'+file+'.html');
  assert.equal(Return.normalize('/'+file+'.html?next=https://evil.invalid#private',origin),'/'+file+'.html');
  assert.equal(Return.normalize(origin+'/'+file+'.html',origin),'/'+file+'.html');
 }
});
test('external URLs, encoded paths, separators and traversal cannot become a destination',()=>{
 for(const value of [null,{},'', '//evil.invalid/plan.html','https://evil.invalid/plan.html','https://degreepath.test@evil.invalid/plan.html','https://user@degreepath.test/plan.html','javascript:alert(1)','/plan.html\\evil','/foo/../plan.html','../plan.html','/%70lan.html','/%2f%2fevil.invalid','/%252f%252fevil.invalid','/plan.html%2f..','/plan.html\n',' /plan.html','/unknown.html','/api/portal/plans'])assert.equal(Return.normalize(value,origin),null,String(value));
});
test('school and community queries retain only bounded public context',()=>{
 assert.equal(Return.normalize('/school.html?school=Liberty%20University&template=liberty-bs&returnTo=https://evil.invalid&notes=private',origin),'/school.html?school=Liberty+University&template=liberty-bs');
 assert.equal(Return.normalize('/school.html?school='+encodeURIComponent('x'.repeat(201))+'&template=%2f%2fevil',origin),'/school.html');
 const actual=Return.normalize('/community.html?tab=feed&post=post_123&template=liberty-bs&context=course%3Aliberty%2Fengl-101&school=Liberty&level=bachelor&format=online&next=https://evil.invalid&notes=private',origin);
 assert.equal(actual,'/community.html?tab=feed&post=post_123&template=liberty-bs&context=course%3Aliberty%2Fengl-101&school=Liberty&level=bachelor&format=online');
 assert.equal(Return.normalize('/community.html?tab=evil&post=../../admin&context=javascript%3Aalert&template=bad%23id',origin),'/community.html');
 assert.equal(Return.normalize('/courses.html?record=private-record&notes=private',origin),'/courses.html');
});
test('recovery resumes its saved safe task but a plain account visit does not revive it',()=>{
 const s=storage({'student-request-draft':'keep this draft'}),now=1000;
 assert.equal(Return.resolve('?returnTo=request-plan.html',s,origin,now),'/request-plan.html');
 assert.equal(Return.resolve('',s,origin,now+1),'/account.html');
 assert.equal(Return.resolve('?mode=recovery',s,origin,now+1),'/request-plan.html');
 assert.equal(s.values.get('student-request-draft'),'keep this draft');
 assert.equal(Return.read(s,origin,now+Return.TTL+1),null);
 Return.remember(s,'/admin.html',now);assert.equal(Return.resolve('?returnTo=%2F%2Fevil.invalid',s,origin,now),'/account.html');assert.equal(s.values.has(Return.KEY),false);
});
test('blocked storage cannot break a safe sign-in destination',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 assert.equal(Return.resolve('?returnTo=plan.html',blocked,origin),'/plan.html');assert.equal(Return.resolve('?mode=recovery',blocked,origin),'/account.html');
});
const accountSource=fs.readFileSync('./dist/account.js','utf8');
function accountFixture({search='?returnTo=request-plan.html',signedIn=false,needsConfirmation=false,recovery=false,sessionStore=storage({'degreepath-request-draft':'private form draft'})}={}){
 const calls=[],redirects=[],listeners={},nodes=new Map(),historyCalls=[];let authenticated=signedIn,resets=0;
 for(const key of ['account-status','account-error','account-content'])nodes.set(key,{textContent:'',innerHTML:'',hidden:false,querySelector(){return null}});
 const Account={
  async auth(path,options){calls.push({kind:'auth',path,options});if(path==='/status')return{configured:true,providers:['email','google'],recovery};if(path==='/login'||path==='/signup'){authenticated=!needsConfirmation;return{ok:true,needsConfirmation,...(authenticated?{user:{id:'verified-user'}}:{})};}if(path==='/passwordchange'){authenticated=false;return{ok:true,message:'Sign in with your new password.'};}return{ok:true};},
  async session(){calls.push({kind:'session'});return{user:authenticated?{id:'verified-user',alias:'Student'}:null};},
  async api(path){calls.push({kind:'api',path});return{items:[]};},
  deviceDraft(){return null},linkedPlan(){return null},invalidate(){},
  async uploadDraft(){throw Error('A sign-in flow must never upload a device draft')}
 };
 const location={origin,pathname:'/account.html',search,assign:path=>redirects.push(path)};
 const root={DegreeAccount:Account,DegreeAccountReturn:Return,sessionStorage:sessionStore};
 const context={window:root,document:{getElementById:id=>nodes.get(id),addEventListener:(event,callback)=>{listeners[event]=callback}},location,history:{replaceState:(...args)=>historyCalls.push(args)},URLSearchParams,URL,Date,console,setTimeout,
  FormData:class{constructor(form){this.values=form.values}has(key){return Object.hasOwn(this.values,key)}get(key){return this.values[key]}}};
 vm.runInNewContext(accountSource,context,{filename:'account.js'});
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
 return{calls,redirects,nodes,sessionStore,historyCalls,flush,
  async mode(name){listeners.click({target:{closest:()=>({dataset:{action:name+'-mode'}})}});await flush();},
  async submit(){const form={id:'account-auth-form',values:{email:'student@example.test',password:'a-long-private-password'},querySelector(){return{textContent:''}},reset(){resets++}};listeners.submit({target:form,preventDefault(){},submitter:{textContent:'Sign in',isConnected:true}});await flush();},get resets(){return resets;}};
}
test('Google and email sign-in carry the requested page and verified login resumes it',async()=>{
 const f=accountFixture();await f.flush();assert.match(f.nodes.get('account-content').innerHTML,/\/auth\/google\?returnTo=%2Frequest-plan.html/);
 await f.submit();assert.equal(f.calls.find(call=>call.path==='/login').options.body.returnTo,'/request-plan.html');assert.deepEqual(f.redirects,['/request-plan.html']);assert.equal(f.sessionStore.values.has(Return.KEY),false);assert.equal(f.sessionStore.values.get('degreepath-request-draft'),'private form draft');assert.equal(f.calls.some(call=>call.kind==='api'),false);
});
test('an already verified user continues once before fetching unrelated account plans',async()=>{
 const f=accountFixture({search:'?returnTo=admin.html',signedIn:true});await f.flush();assert.deepEqual(f.redirects,['/admin.html']);assert.equal(f.calls.some(call=>call.kind==='api'),false);
});
test('signup needing email confirmation remains on account and keeps its return task',async()=>{
 const f=accountFixture({needsConfirmation:true});await f.flush();await f.mode('signup');await f.submit();assert.equal(f.calls.find(call=>call.path==='/signup').options.body.returnTo,'/request-plan.html');assert.deepEqual(f.redirects,[]);assert.equal(Return.read(f.sessionStore,origin),'/request-plan.html');
});
test('forgot password retains the safe task and recovery keeps the password-change flow',async()=>{
 const original=accountFixture();await original.flush();await original.mode('forgot');await original.submit();assert.equal(original.calls.find(call=>call.path==='/forgot').options.body.returnTo,'/request-plan.html');assert.deepEqual(original.redirects,[]);
 const recovered=accountFixture({search:'?mode=recovery',signedIn:true,recovery:true,sessionStore:original.sessionStore});await recovered.flush();assert.deepEqual(recovered.redirects,[]);assert.match(recovered.nodes.get('account-content').innerHTML,/Choose a new password/);await recovered.submit();assert(recovered.calls.some(call=>call.path==='/passwordchange'));assert.deepEqual(recovered.redirects,[]);assert.equal(Return.read(recovered.sessionStore,origin),'/request-plan.html');
});
test('an invalid destination never appears in Google navigation or redirects',async()=>{
 const f=accountFixture({search:'?returnTo=https%3A%2F%2Fevil.invalid%2Fplan.html'});await f.flush();assert.match(f.nodes.get('account-content').innerHTML,/\/auth\/google\?returnTo=%2Faccount.html/);await f.submit();assert.deepEqual(f.redirects,[]);assert.equal(f.calls.find(call=>call.path==='/login').options.body.returnTo,'/account.html');
});
