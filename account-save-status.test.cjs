const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const client=fs.readFileSync('dist/account-client.js','utf8'),shellSource=fs.readFileSync('dist/app-shell.js','utf8');
const draft={version:3,selectedPathwayId:'my-degree',profile:{school:'Example College',degree:'My degree'},learning:[],sheet:{isExample:false,notes:{private:'My note'}}};
function fixture({user={id:'student-a',alias:'Alex'},storageAvailable=true,identityAvailable=true}={}){
 const values=new Map([['degreepath-guide-v3',JSON.stringify(draft)]]),calls=[],handlers=new Map(),state={user,storageAvailable,identityAvailable};
 const classList={add(){},remove(){},toggle(){}},statusText={textContent:''},icon={style:{}},status={dataset:{},hidden:true,classList,querySelector:selector=>selector==='span'?statusText:selector==='svg'?icon:null};
 const nodes=new Map([['.dp-shell-save',status],...['.dp-shell-save-account','[data-shell-account-label]','[data-shell-account-detail]','.dp-shell-avatar'].map(key=>[key,{hidden:true,textContent:'',innerHTML:'',classList,setAttribute(){}}])]);
 const shell={innerHTML:'',querySelector:selector=>nodes.get(selector)||null},localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const context={window:null,URLSearchParams,Date,TextEncoder,Uint8Array,crypto:require('node:crypto').webcrypto,localStorage,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},location:{pathname:'/plan.html',search:''},
  document:{createElement:()=>shell,body:{prepend(){},classList},getElementById:()=>null,addEventListener(){}},
  addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);},
  fetch:async(path,options)=>{calls.push({path,options});let body,status=200;
   if(path==='/api/portal/session'){if(!state.storageAvailable){status=503;body={error:'Saved plans unavailable'};}else body={user:state.user};}
   else if(path==='/api/auth/session'){if(!state.identityAvailable){status=503;body={error:'Unavailable'};}else body={user:state.user};}
   else if(path==='/api/auth/logout')body={ok:true};
   else {const payload=JSON.parse(options.body);body={item:{id:'my-account-plan',revision:options.method==='PUT'?2:1,state:payload.state}};}
   return{ok:status<400,status,json:async()=>body};
  }};
 context.window=context;vm.createContext(context);vm.runInContext(client,context);vm.runInContext(shellSource,context);
 const waitForStatus=async expected=>{
  const deadline=performance.now()+2000;
  while(statusText.textContent!==expected&&performance.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(statusText.textContent,expected,'The shell must acknowledge its asynchronous account state within two seconds');
 };
 return{context,account:context.DegreeAccount,state,values,calls,nodes,icon,status,waitForStatus,text:()=>statusText.textContent,action:()=>nodes.get('.dp-shell-save-account').textContent,
  event(type,detail){context.dispatchEvent(new context.CustomEvent(type,{detail}));}};
}
test('the workspace shows sign-in, save, acknowledged saved and unsaved changes with an honest checkmark',async()=>{
 const f=fixture({user:null});await f.waitForStatus('Sign in to save');assert.equal(f.text(),'Sign in to save');assert.equal(f.action(),'Save plan');assert.equal(f.icon.style.display,'none');
 f.state.user={id:'student-a',alias:'Alex'};f.event('degreepath:account');await f.waitForStatus('Not saved to your account');assert.equal(f.text(),'Not saved to your account');assert.equal(f.icon.style.display,'none');
 assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 await f.account.uploadDraft({title:'My degree',consent:true});await f.waitForStatus('Saved to your account');assert.equal(f.text(),'Saved to your account');assert.equal(f.status.dataset.saveState,'saved');assert.equal(f.icon.style.display,'');
 const changed=JSON.parse(f.values.get(f.account.DRAFT_KEY));changed.sheet.notes.private='A changed note';f.values.set(f.account.DRAFT_KEY,JSON.stringify(changed));f.event('degreepath:save',{deviceSaved:true});await f.waitForStatus('Changes to save');
 assert.equal(f.text(),'Changes to save');assert.equal(f.action(),'Save changes');assert.equal(f.icon.style.display,'none');assert.equal(f.calls.filter(call=>call.options.method==='POST').length,1);
 await f.account.uploadDraft({title:'My degree',consent:true,update:true});await f.waitForStatus('Saved to your account');assert.equal(f.text(),'Saved to your account');assert.equal(f.icon.style.display,'');
 f.event('degreepath:save',{deviceSaved:false});await f.waitForStatus('Changes could not be saved');assert.equal(f.text(),'Changes could not be saved');assert.equal(f.icon.style.display,'none');
 f.event('degreepath:save',{deviceSaved:true});await f.waitForStatus('Saved to your account');assert.equal(f.text(),'Saved to your account');
 await f.account.signOut();f.state.user=null;f.event('degreepath:account');await f.waitForStatus('Sign in to save');assert.equal(f.text(),'Sign in to save');assert.equal(f.action(),'Save plan');assert.equal(f.icon.style.display,'none');
});
test('account storage failure does not tell an already signed-in student to sign in again',async()=>{
 const f=fixture({storageAvailable:false});await f.waitForStatus('Saved plans unavailable');assert.equal(f.text(),'Saved plans unavailable');assert.equal(f.icon.style.display,'none');
 assert.equal(f.nodes.get('[data-shell-account-detail]').textContent,'Signed in · Saved plans unavailable');
 assert.equal(f.calls.filter(call=>call.options.method!=='GET').length,0);
});
test('an unknown identity is presented as unchecked, with no success icon or automatic save',async()=>{
 const f=fixture({storageAvailable:false,identityAvailable:false});await f.waitForStatus('Check sign-in to save');assert.equal(f.text(),'Check sign-in to save');assert.equal(f.icon.style.display,'none');
 assert.equal(f.nodes.get('[data-shell-account-detail]').textContent,'Account status unavailable');assert.equal(f.calls.filter(call=>call.options.method!=='GET').length,0);
});
