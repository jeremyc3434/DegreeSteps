/* Account migration uses explicit consent and metadata without touching device work. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('dist/account.js','utf8');
const draft = {version:3,profile:{degree:'Working degree',school:'Working school'},learning:[{id:'private-course',title:'Private source record'}],sheet:{notes:{private:'Working private note'}}};
const oldPlan = {id:'legacy-plan',title:'Earlier plan',school:'Earlier school',degree:'Earlier degree',revision:4,createdAt:Date.now(),updatedAt:Date.now()};
const initialMigration = {source:'legacy-d1',status:'available',available:true,migrated:false,manifest:'a'.repeat(64),profile:{alias:'Student'},items:[oldPlan]};
function fixture({signedIn=true,migration=initialMigration,post,errorGet}={}) {
  const calls=[],events={},nodes=new Map(),downloads=[],blobs=[],store=new Map([['degreepath-guide-v3',JSON.stringify(draft)],['degreepath-account-link-v1',JSON.stringify({ownerId:'student-a',planId:'working-plan',revision:3})]]);
  for (const name of ['account-status','account-error','account-content']) nodes.set(name,{innerHTML:'',textContent:'',hidden:name==='account-error',querySelector(){return null;}});
  const state={migration:JSON.parse(JSON.stringify(migration)),items:[],signedIn};
  const Account={DRAFT_KEY:'degreepath-guide-v3',deviceDraft:()=>JSON.parse(store.get('degreepath-guide-v3')),linkedPlan:()=>JSON.parse(store.get('degreepath-account-link-v1')),clearLink(){throw Error('Migration must not clear the working draft link.');},auth:async()=>({configured:true,providers:['email','google']}),session:async()=>({user:state.signedIn?{id:'student-a',alias:'Student'}:null}),api:async(path,options={})=>{
    calls.push({path,...options});
    if(path==='/plans')return{items:state.items};
    if(path==='/migration/backup')return{profile:{alias:'Student'},items:[{...oldPlan,state:draft}]};
    if(path==='/migration'&&!options.method){if(errorGet)throw errorGet;return state.migration;}
    if(path==='/migration'&&options.method==='POST'){
      if(post)return post(options.body,state);
      state.items=[oldPlan];state.migration={...state.migration,status:'complete',available:false,migrated:true};return{migrated:true,imported:1,alreadyMigrated:false};
    }
    throw Error('Unexpected account API '+path);
  }};
  class FakeURL extends URL {};
  FakeURL.createObjectURL=blob=>{blobs.push(blob);return'blob:private-backup';};FakeURL.revokeObjectURL=()=>{};
  const sandbox={window:null,DegreeAccount:Account,URL:FakeURL,URLSearchParams,Date,JSON,console,Blob,FormData:class {constructor(form){this.values=form.values||{};}get(name){return this.values[name]??null;}has(name){return Object.hasOwn(this.values,name);}},location:{search:'',origin:'https://degreesteps.test',pathname:'/account.html',hash:'',assign(){throw Error('Migration must not replace the current page or device draft.');}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},history:{replaceState(){}},setTimeout(){},requestAnimationFrame:callback=>callback(),document:{getElementById:id=>nodes.get(id),addEventListener:(type,fn)=>{events[type]=fn;},createElement:()=>({click(){downloads.push({href:this.href,name:this.download});}})}};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'account.js'});
  const flush=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};
  return{calls,state,nodes,store,downloads,blobs,flush,
    async submit(consent=true){const errorNode={textContent:''},form={id:'account-migration-form',values:consent?{consent:'on'}:{},querySelector:()=>errorNode},submitter={disabled:false,textContent:'Move my saved plans',isConnected:true};events.submit({target:form,preventDefault(){},submitter});await flush();return errorNode;},
    async click(action){const b={dataset:{action},closest:()=>b};events.click({target:b});await flush();},
    markup(){return nodes.get('account-content').innerHTML;}
  };
}
test('signed-in account checks migration metadata without moving or downloading private plans',async()=>{
  const f=fixture();await f.flush();assert.match(f.markup(),/Bring your saved plans with you/);assert.match(f.markup(),/1 saved plan/);assert.match(f.markup(),/Move my saved plans/);assert.equal(f.calls.filter(call=>call.method).length,0);assert.equal(f.calls.filter(call=>call.path==='/migration/backup').length,0);assert.deepEqual(JSON.parse(f.store.get('degreepath-guide-v3')),draft);
});
test('anonymous account does not request legacy metadata or private backups',async()=>{
  const f=fixture({signedIn:false});await f.flush();assert.equal(f.calls.length,0);assert.doesNotMatch(f.markup(),/Bring your saved plans/);
});
test('migration refuses submission without consent even outside browser validation',async()=>{
  const f=fixture();await f.flush();const error=await f.submit(false);assert.match(error.textContent,/Confirm/);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
test('the explicit move sends only consent, manifest and source revisions and preserves the device draft',async()=>{
  const f=fixture();await f.flush();const before=Object.fromEntries(f.store);await f.submit();const moved=f.calls.find(call=>call.method==='POST');assert.equal(moved.path,'/migration');assert.deepEqual(JSON.parse(JSON.stringify(moved.body)),{consent:true,manifest:'a'.repeat(64),revisions:[{id:'legacy-plan',revision:4}]});assert.deepEqual(Object.fromEntries(f.store),before);assert.doesNotMatch(f.markup(),/id="account-migration-form"/);assert.match(f.markup(),/Earlier plan/);assert.match(f.nodes.get('account-status').textContent,/Moved 1 saved plan/);
});
test('revision conflicts refresh the source manifest without dropping a working draft or starting a backup automatically',async()=>{
  const f=fixture({post:(body,state)=>{state.migration={...state.migration,manifest:'b'.repeat(64),items:[{...oldPlan,revision:5}]};const error=Error('Source changed.');error.status=409;error.code='migration_source_changed';throw error;}});await f.flush();const before=Object.fromEntries(f.store);await f.submit();assert.equal(f.calls.filter(call=>call.path==='/migration'&&!call.method).length,2);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.path==='/migration/backup').length,0);assert.deepEqual(Object.fromEntries(f.store),before);assert.match(f.markup(),/Review the latest list and keep a backup/);assert.match(f.markup(),/Download older plans backup/);await f.submit();const retry=f.calls.filter(call=>call.method==='POST').at(-1);assert.equal(retry.body.manifest,'b'.repeat(64));assert.equal(retry.body.revisions[0].revision,5);
});
test('legacy source backup is downloaded only through the student’s explicit backup action',async()=>{
  const f=fixture();await f.flush();assert.equal(f.downloads.length,0);await f.click('migration-backup');assert.equal(f.calls.filter(call=>call.path==='/migration/backup').length,1);assert.equal(f.downloads.length,1);assert.equal(f.downloads[0].name,'degreesteps-older-saved-plans.json');assert.match(await f.blobs[0].text(),/Private source record/);
});
test('unavailable migration checks leave normal account plans and draft saving usable',async()=>{
  const error=Error('Check is temporarily unavailable.');error.status=503;const f=fixture({errorGet:error});await f.flush();assert.match(f.markup(),/My saved plans/);assert.match(f.markup(),/Save my plan/);assert.match(f.markup(),/could not check your older saved plans/);assert.equal(f.nodes.get('account-error').hidden,true);assert.equal(f.calls.filter(call=>call.method).length,0);
});
test('metadata titles are escaped and complete migrations do not show another move prompt',async()=>{
  const f=fixture({migration:{...initialMigration,items:[{...oldPlan,title:'<img src=x onerror=alert(1)>'}]}});await f.flush();assert.match(f.markup(),/&lt;img/);assert.doesNotMatch(f.markup(),/<img/);const complete=fixture({migration:{...initialMigration,status:'complete',available:false,migrated:true}});await complete.flush();assert.doesNotMatch(complete.markup(),/id="account-migration-form"/);
});
