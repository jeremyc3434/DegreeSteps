'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Shared=require('./dist/template-workspace-client.js'),Return=require('./dist/account-return.js');
const html=fs.readFileSync('dist/request-plan.html','utf8'),source=fs.readFileSync('dist/request-plan.js','utf8');
const URL_KEY='degreepath-degree-link-v2',CONTEXT_KEY='degreesteps-degree-context-v1',ACTIVE_KEY='degreepath-research-active-v1';
const liberty='https://www.liberty.edu/government/bachelors/criminal-justice/',other='https://www.waldenu.edu/online-masters-programs/master-of-business-administration';
function attrs(text){return Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m=>[m[1],m[2]===undefined?'':m[2]]));}
function node(attributes={}){const listeners={},value={listeners,value:attributes.value||'',hidden:'hidden'in attributes,disabled:false,innerHTML:'',textContent:'',dataset:{},addEventListener:(name,fn)=>listeners[name]=fn,setAttribute(){},reportValidity:()=>true,focus(){},scrollIntoView(){},querySelector:()=>null};return value;}
function fixture({search='',signedIn=true,values={},get}={}){
 const nodes=new Map(),calls=[],growth=[],storage=new Map(Object.entries(values)),timers=new Map();let seq=0,localReads=0;
 for(const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi))nodes.set(m[3],node(attrs(m[2])));
 const W={...Shared,async api(path,options={}){calls.push({path,...options});if(get){const custom=get(path,options);if(custom!==undefined)return custom;}if(options.method==='POST')return{existingPlan:{pathwayId:'existing-program',school:'Source-defined college',title:'Source-defined degree',modality:'online'},configured:true};if(path==='/api/templates/requests')return{items:[],configured:true};if(path.startsWith('/api/templates/research-status?'))return{item:null,configured:true};throw Error('Unexpected request '+path);}};
 const root={document:{getElementById:id=>{assert(nodes.has(id),'Missing node '+id);return nodes.get(id);}},DegreeTemplateWorkspace:W,DegreeAccount:{session:async()=>({user:signedIn?{id:'verified-student'}:null})},DegreeGrowth:{track:(...args)=>growth.push(args)},URL,URLSearchParams,Map,Set,Date,JSON,console,location:{search},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},localStorage:{getItem(){localReads++;throw Error('The research entry must not read private plan data.');}},setTimeout:(fn,delay)=>{timers.set(++seq,{fn,delay});return seq;},clearTimeout:id=>timers.delete(id),addEventListener(){}};
 root.window=root;vm.runInNewContext(source,root,{filename:'request-plan.js'});
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 return{nodes,calls,growth,storage,localReads:()=>localReads,flush,async submit(url=liberty){nodes.get('degree-url').value=url;nodes.get('degree-request-form').listeners.submit({preventDefault(){}});await flush();}};
}
test('school and format are bounded preferences in details, never forced URL-only degree identity',async()=>{
 const f=fixture({search:'?school=Liberty%20University&format=campus&source='+encodeURIComponent(liberty)});await f.flush();assert.match(f.nodes.get('request-context').textContent,/On-campus degree at Liberty University/);await f.submit();
 const post=f.calls.find(c=>c.method==='POST');assert.deepEqual(Object.keys(post.body).sort(),['details','startResearch','url']);assert.equal(post.body.url,liberty);assert.match(post.body.details,/Starting preference: on-campus study/);assert.match(post.body.details,/College of interest: Liberty University/);assert.match(post.body.details,/official degree page/);
 assert.equal(post.body.modality,undefined);assert.equal(post.body.schoolName,undefined);assert.equal(post.body.programName,undefined);assert.equal(post.body.catalogYear,undefined);assert.match(f.nodes.get('request-result').innerHTML,/Source-defined college/);assert.equal(f.localReads(),0);assert(!JSON.stringify(f.growth).includes('Liberty'));
});
test('sign-in preserves URL-bound context and never starts a paid request automatically',async()=>{
 const guest=fixture({search:'?school=Liberty%20University&format=campus',signedIn:false,values:{[URL_KEY]:other}});await guest.flush();assert.equal(guest.nodes.get('degree-url').value,'');await guest.submit();assert.equal(guest.calls.filter(c=>c.method==='POST').length,0);const context=JSON.parse(guest.storage.get(CONTEXT_KEY));assert.equal(context.url,liberty);assert.equal(context.school,'Liberty University');assert.equal(context.format,'campus');assert.equal(guest.storage.get(URL_KEY),liberty);
 const signed=fixture({values:Object.fromEntries(guest.storage)});await signed.flush();assert.equal(signed.nodes.get('degree-url').value,liberty);assert.match(signed.nodes.get('request-context').textContent,/Liberty University/);assert.equal(signed.calls.filter(c=>c.method==='POST').length,0);await signed.submit();assert.match(signed.calls.find(c=>c.method==='POST').body.details,/on-campus study/);
});
test('a new school or explicit degree link cannot revive another college’s active research',async()=>{
 const values={[URL_KEY]:other,[ACTIVE_KEY]:JSON.stringify({url:other,startedAt:Date.now()-10000})};
 const campus=fixture({search:'?school=Liberty%20University&format=campus',values});await campus.flush();assert.equal(campus.nodes.get('degree-url').value,'');assert.equal(campus.calls.some(c=>c.path.includes(encodeURIComponent(other))),false);assert.equal(campus.calls.filter(c=>c.method==='POST').length,0);
 const explicit=fixture({search:'?source='+encodeURIComponent(liberty),values});await explicit.flush();assert.equal(explicit.nodes.get('degree-url').value,liberty);assert.equal(explicit.calls.some(c=>c.path.includes(encodeURIComponent(other))),false);
});
test('an explicit link matching saved active research resumes read-only monitoring',async()=>{
 const f=fixture({search:'?source='+encodeURIComponent(liberty),values:{[URL_KEY]:liberty,[ACTIVE_KEY]:JSON.stringify({url:liberty,startedAt:Date.now()-10000})}});await f.flush();assert.equal(f.nodes.get('degree-url').value,liberty);assert(f.calls.some(c=>c.path.includes('/api/templates/research-status?')&&c.path.includes(encodeURIComponent(liberty))));assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('expired, future-dated and differently bound context cannot influence a new degree request',async()=>{
 for(const context of [
  {school:'Old college',format:'campus',url:liberty,createdAt:Date.now()-3605000},
  {school:'Old college',format:'campus',url:liberty,createdAt:Date.now()+60000},
  {school:'Old college',format:'campus',url:other,createdAt:Date.now()}
 ]){
  const f=fixture({search:'?source='+encodeURIComponent(liberty),values:{[URL_KEY]:liberty,[CONTEXT_KEY]:JSON.stringify(context)}});await f.flush();assert.equal(f.nodes.get('request-context').hidden,true);await f.submit();assert.deepEqual(Object.keys(f.calls.find(c=>c.method==='POST').body).sort(),['startResearch','url']);
 }
});
test('invalid school and format context is omitted while safe text is displayed without HTML parsing',async()=>{
 for(const search of ['?school='+encodeURIComponent('x'.repeat(121))+'&format=invalid','?school='+encodeURIComponent('Bad\u0001School')+'&format=invalid']){const f=fixture({search});await f.flush();assert.equal(f.nodes.get('request-context').hidden,true);await f.submit();assert.equal(f.calls.find(c=>c.method==='POST').body.details,undefined);}
 const f=fixture({search:'?school='+encodeURIComponent('<School & Co>')+'&format=campus'});await f.flush();assert.match(f.nodes.get('request-context').textContent,/<School & Co>/);assert.equal(f.nodes.get('request-context').innerHTML,'');
});
test('managed calendar and save dependencies retain order, idempotence and safe authentication returns',async()=>{
 const {applyExperience}=await import('./scripts/apply-brand-system.mjs');
 for(const page of ['plan.html','portal.html','courses.html','compare-plans.html']){
  const result=applyExperience(fs.readFileSync('dist/'+page,'utf8'),page).html,scripts=[...result.matchAll(/<script\b[^>]*src="\/?([^"]+)"[^>]*>/g)].map(m=>m[1]);
  assert(scripts.includes('account-client.js'));assert(scripts.indexOf('plan-save.js')>scripts.indexOf('account-client.js'));if(scripts.includes('account-return.js'))assert(scripts.indexOf('plan-save.js')>scripts.indexOf('account-return.js'));
  if(scripts.includes('student-checklist-view.js'))assert(scripts.indexOf('task-calendar.js')<scripts.indexOf('student-checklist-view.js'));
  assert.equal(scripts.filter(s=>s==='plan-save.js').length,1);assert.equal(applyExperience(result,page).html,result);
 }
 assert.equal(Return.normalize('/request-plan.html?school=Liberty&format=campus&private=notes','https://degreesteps.test'),'/request-plan.html');assert.equal(Return.normalize('//evil.test/request-plan.html','https://degreesteps.test'),null);
});
