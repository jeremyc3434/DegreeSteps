const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync('./dist/admin.html','utf8'),adminSource=fs.readFileSync('./dist/admin.js','utf8'),clientSource=fs.readFileSync('./dist/template-workspace-client.js','utf8');
const endpoint='/api/admin/ai-connection',fakeKey='clearly-fake-connection-key-do-not-use';
const config=(values={})=>({configured:false,source:'none',revision:0,storageReady:true,model:'claude-test-model',limits:{researchPerDay:10,researchPerStudentPerDay:3,connectionChangesPerHour:5},...values});
function fixture({owner=true,admin=owner,signedIn=true,connection=config(),onRequest}={}){
 const nodes=new Map(),calls=[],windowEvents={},storageCalls=[],logs=[];
 for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
  const attrs=match[2],listeners={};
  nodes.set(match[3],{id:match[3],hidden:/\bhidden(?:\s|$)/.test(attrs),open:/\bopen(?:\s|$)/.test(attrs),textContent:'',innerHTML:'',value:'',disabled:false,dataset:{},listeners,
   addEventListener(type,callback){listeners[type]=callback},setAttribute(name,value){this[name]=value},focus(){this.focused=true},scrollIntoView(){},querySelector(){return {disabled:false,textContent:'Submit'}}});
 }
 const server={connection};
 const sandbox={document:{getElementById:id=>{assert(nodes.has(id),'Missing fixture node '+id);return nodes.get(id)}},URL,URLSearchParams,Date,JSON,FormData,
  addEventListener(type,callback){windowEvents[type]=callback},console:{log:(...v)=>logs.push(v),error:(...v)=>logs.push(v)},
  localStorage:{setItem(...v){storageCalls.push(v);throw Error('Connection credentials must not be stored')},getItem(){throw Error('Connection UI must not read browser storage')}},
  sessionStorage:{setItem(...v){storageCalls.push(v);throw Error('Connection credentials must not be stored')},getItem(){throw Error('Connection UI must not read browser storage')}},
  async fetch(path,options={}){
   const call={path,method:options.method||'GET',headers:options.headers,body:options.body?JSON.parse(options.body):undefined,passwordAtSend:nodes.get('ai-api-key').value};calls.push(call);
   const custom=await onRequest?.(call,server,nodes);if(custom)return{ok:custom.status<400,status:custom.status,json:async()=>custom.data};
   let data;
   if(path==='/api/colleges/status')data={user:signedIn?{id:'owner-id'}:null,isAdmin:admin,isOwner:owner,memberships:[]};
   else if(path===endpoint&&call.method==='GET')data=server.connection;
   else if(path===endpoint&&call.method==='PUT'){server.connection=config({configured:true,source:'managed',revision:server.connection.revision+1});data=server.connection;}
   else if(path===endpoint&&call.method==='DELETE'){server.connection=config({revision:server.connection.revision+1});data=server.connection;}
   else if(path===endpoint+'/test')data={...server.connection,tested:true};
   else if(path==='/api/admin/templates/config')data={configured:server.connection.configured};
   else if(path==='/api/admin/templates'||path==='/api/admin/colleges')data={items:[]};
   else throw Error('Unexpected test request '+path);
   return{ok:true,status:200,json:async()=>data};
  }
 };
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(clientSource,sandbox,{filename:'template-workspace-client.js'});vm.runInContext(adminSource,sandbox,{filename:'admin.js'});
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{nodes,calls,server,windowEvents,storageCalls,logs,sandbox,flush,
  async submit(value=fakeKey){nodes.get('ai-api-key').value=value;nodes.get('ai-connection-form').listeners.submit({preventDefault(){},currentTarget:nodes.get('ai-connection-form')});await flush();},
  async click(id){nodes.get(id).listeners.click({currentTarget:nodes.get(id)});await flush();},
  visibleText(){return Array.from(nodes.values(),n=>n.textContent+' '+n.innerHTML).join('\n');}
 };
}
test('Claude key entry is owner-hidden and never a plain text or remembered input',()=>{
 const section=html.match(/<section id="admin-ai-connection"[^>]*>/)[0],input=html.match(/<input id="ai-api-key"[^>]*>/)[0];
 assert.match(section,/\bhidden\b/);assert.match(input,/type="password"/);assert.match(input,/autocomplete="off"/);assert.match(input,/spellcheck="false"/);assert(!/\bvalue=/.test(input));assert.match(html,/https:\/\/console\.anthropic\.com\//);
});
test('anonymous students and moderators never request connection settings or submit a key',async()=>{
 for(const profile of [{owner:false,admin:false,signedIn:false},{owner:false,admin:false},{owner:false,admin:true}]){
  const f=fixture(profile);await f.flush();assert.equal(f.nodes.get('admin-ai-connection').hidden,true);assert.equal(f.calls.some(call=>call.path.startsWith(endpoint)),false);
  await f.submit();assert.equal(f.nodes.get('ai-api-key').value,'');assert.equal(f.calls.some(call=>call.path.startsWith(endpoint)),false);assert.deepEqual(f.storageCalls,[]);
 }
});
test('owner saves a key only to the server and clears it before fetch, then refreshes research availability',async()=>{
 const f=fixture();await f.flush();assert.equal(f.nodes.get('admin-ai-connection').hidden,false);assert.equal(f.nodes.get('ai-connection-status').textContent,'Not connected');assert.equal(f.nodes.get('ai-key-entry').open,true);
 const initialQueueCalls=f.calls.filter(call=>call.path==='/api/admin/templates/config').length;
 await f.submit();const put=f.calls.find(call=>call.method==='PUT');assert.deepEqual(put.body,{apiKey:fakeKey,revision:0});assert.equal(put.passwordAtSend,'');assert.equal(put.headers['X-Portal-Request'],'1');
 assert.equal(f.nodes.get('ai-api-key').value,'');assert.equal(f.nodes.get('ai-connection-status').textContent,'Connected');assert.equal(f.nodes.get('ai-key-entry').open,false);assert.equal(f.nodes.get('ai-connection-disconnect').hidden,false);
 assert.equal(f.calls.filter(call=>call.path==='/api/admin/templates/config').length,initialQueueCalls+1);assert.match(f.nodes.get('ai-connection-limits').textContent,/10.*3/);assert.deepEqual(f.storageCalls,[]);assert(!f.visibleText().includes(fakeKey));assert.deepEqual(f.logs,[]);
});
test('provider errors never echo the submitted key or trigger an automatic retry',async()=>{
 const f=fixture({onRequest:call=>call.method==='PUT'?{status:400,data:{error:'Provider rejected '+fakeKey,issues:[fakeKey]}}:null});await f.flush();await f.submit();
 assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);assert.equal(f.nodes.get('ai-api-key').value,'');assert.match(f.nodes.get('ai-connection-message').textContent,/key could not be verified/);assert(!f.visibleText().includes(fakeKey));assert.deepEqual(f.storageCalls,[]);assert.deepEqual(f.logs,[]);assert.equal(f.nodes.get('ai-connection-status').textContent,'Not connected');
});
test('testing an existing key sends only its revision and cannot rotate the key',async()=>{
 const f=fixture({connection:config({configured:true,source:'managed',revision:4})});await f.flush();assert.equal(f.nodes.get('ai-connection-test').hidden,false);
 await f.click('ai-connection-test');const check=f.calls.find(call=>call.path===endpoint+'/test');assert.equal(check.method,'POST');assert.deepEqual(check.body,{revision:4});assert.equal(f.calls.some(call=>call.method==='PUT'),false);assert.match(f.nodes.get('ai-connection-message').textContent,/No degree research was generated/);
});
test('disconnect correctly explains when a server environment key remains connected',async()=>{
 const f=fixture({connection:config({configured:true,source:'managed',revision:4}),onRequest:(call,server)=>{
  if(call.method==='DELETE'){server.connection=config({configured:true,source:'environment',revision:5});return{status:200,data:server.connection};}
 }});await f.flush();await f.click('ai-connection-disconnect');const remove=f.calls.find(call=>call.method==='DELETE');assert.deepEqual(remove.body,{revision:4});assert.equal(f.nodes.get('ai-connection-status').textContent,'Connected');assert.equal(f.nodes.get('ai-connection-disconnect').hidden,true);assert.equal(f.nodes.get('ai-connection-test').hidden,false);assert.match(f.nodes.get('ai-connection-message').textContent,/still connected.*server secret/);
});
test('conflicting updates refresh the revision and require a freshly pasted key',async()=>{
 let conflicted=false;
 const f=fixture({onRequest:(call,server)=>{if(call.method==='PUT'&&!conflicted){conflicted=true;server.connection=config({configured:true,source:'managed',revision:6});return{status:409,data:{error:fakeKey}};}}});await f.flush();await f.submit();
 assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);assert.equal(f.nodes.get('ai-api-key').value,'');assert.match(f.nodes.get('ai-connection-message').textContent,/another session/);assert(!f.visibleText().includes(fakeKey));
 await f.submit();assert.equal(f.calls.filter(call=>call.method==='PUT')[1].body.revision,6);
});
test('missing secure storage disables key entry but preserves environment connection testing',async()=>{
 const f=fixture({connection:config({configured:true,source:'environment',revision:3,storageReady:false})});await f.flush();assert.equal(f.nodes.get('ai-storage-note').hidden,false);assert.equal(f.nodes.get('ai-key-entry').hidden,true);assert.equal(f.nodes.get('ai-connection-save').disabled,true);assert.equal(f.nodes.get('ai-connection-test').disabled,false);await f.submit();assert.equal(f.calls.some(call=>call.method==='PUT'),false);assert.equal(f.nodes.get('ai-api-key').value,'');
});
test('an in-flight save disables controls and a second submission never sends another credential',async()=>{
 let release;const waiting=new Promise(resolve=>{release=resolve});
 const f=fixture({onRequest:async call=>{if(call.method==='PUT')await waiting;}});await f.flush();await f.submit();assert.equal(f.nodes.get('ai-connection-save').disabled,true);assert.equal(f.nodes.get('ai-api-key').disabled,true);assert.equal(f.nodes.get('ai-api-key').value,'');
 await f.submit('another-clearly-fake-key');assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);assert.equal(f.nodes.get('ai-api-key').value,'');release();await f.flush();assert.equal(f.nodes.get('ai-connection-save').disabled,false);assert.equal(f.nodes.get('ai-api-key').value,'');
});
test('page navigation and restoration clear any unsubmitted password field',async()=>{
 const f=fixture();await f.flush();for(const name of ['pagehide','pageshow']){f.nodes.get('ai-api-key').value=fakeKey;f.windowEvents[name]();assert.equal(f.nodes.get('ai-api-key').value,'');}assert.equal(f.calls.some(call=>call.method==='PUT'),false);
});
test('the client permits only the exact connection routes and rejects query or path variations before fetch',async()=>{
 const f=fixture({owner:false,admin:false,signedIn:false});await f.flush();const api=f.sandbox.DegreeTemplateWorkspace.api;
 await api(endpoint);await api(endpoint+'/test',{method:'POST',body:{revision:0}});const count=f.calls.length;
 for(const route of [endpoint+'/secrets',endpoint+'?apiKey=private',endpoint+'/',endpoint+'/test/extra',endpoint+'/../templates','https://evil.invalid'+endpoint])await assert.rejects(api(route),/valid workspace action/);
 assert.equal(f.calls.length,count);
});
test('an unreadable managed key is never described as connected and can still be removed',async()=>{
 const f=fixture({connection:config({source:'managed',revision:7,storageReady:false})});await f.flush();assert.equal(f.nodes.get('ai-connection-status').textContent,'Not connected');assert.match(f.nodes.get('ai-connection-summary').textContent,/cannot open it/);assert.equal(f.nodes.get('ai-connection-test').hidden,true);assert.equal(f.nodes.get('ai-connection-disconnect').disabled,false);await f.click('ai-connection-disconnect');assert.deepEqual(f.calls.find(call=>call.method==='DELETE').body,{revision:7});assert.equal(f.nodes.get('ai-connection-disconnect').hidden,true);
});
test('an unavailable connection status cannot enable key submission or echo transport details',async()=>{
 const f=fixture({onRequest:call=>call.path===endpoint&&call.method==='GET'?{status:503,data:{error:fakeKey}}:null});await f.flush();assert.equal(f.nodes.get('ai-connection-status').textContent,'Refresh needed');assert.equal(f.nodes.get('ai-connection-save').disabled,true);assert.equal(f.nodes.get('ai-connection-refresh').disabled,false);assert(!f.visibleText().includes(fakeKey));await f.submit();assert.equal(f.nodes.get('ai-api-key').value,'');assert.equal(f.calls.some(call=>call.method==='PUT'),false);
});
