const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('./dist/coverage.js','utf8'),html=fs.readFileSync('./dist/coverage.html','utf8'),UI=require('./dist/coverage.js');
const base='/api/admin/academic-coverage',fingerprint='a'.repeat(64),revision='academic-v1:'+'b'.repeat(64);
function factData(overrides={}){return {registryRevision:revision,fact:{id:'fact-1',kind:'equivalence',scope:{school:'Example University',catalogYear:'2026-2027',format:'Online'},facts:{title:'English Composition',credits:3,receivingCode:'ENG 101',conditions:['Grade C or better']},sourceIds:['source-1'],sourceBinding:{bound:true},programIds:['program-1'],evidenceFingerprint:fingerprint,administrativeReview:{revision:0,decision:'unreviewed'}},sources:[{id:'source-1',title:'Official transfer table',url:'https://example.edu/transfer',sourceContentHash:null}],programs:[program()],findings:[],history:[],...overrides};}
function program(){return {id:'program-1',title:'BS Business Administration',school:'Example University',catalogIdentity:'2026-2027',format:'Online',creditSystem:'semester',totalCredits:120,readyTemplate:true,reviewCounts:{total:3,supported:0,unreviewed:2,needsEvidence:1,conflict:0},quality:{status:'conditional',research:{status:'conditional'},execution:{personalTasks:[{message:'Evaluate personal transcript'}]},estimates:{cost:{status:'partial-estimate'},timing:{status:'assumption-based-scenario'}}}};}
function summary(rev=revision){return {registryRevision:rev,summary:{programs:5,readyTemplates:3,facts:40,sources:8,reviewedSupported:2,unreviewed:38},institutions:['Example University'],qualitySummary:{research:{'research-ready':2,conditional:3}}};}
const decode=value=>String(value).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
function fixture({access={user:{id:'user-1'},isAdmin:true},onRequest}={}){
 const nodes=new Map(),calls=[],events={};let selectedSources=[];
 function parse(markup,parent){
  for(const match of markup.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
   const attrs=match[2],node=element(match[3],attrs);node.parent=parent;nodes.set(match[3],node);
   const after=markup.slice(match.index+match[0].length),tag=match[1].toLowerCase();
   if(tag==='textarea')node.value=decode(after.split('</textarea>')[0]);
   if(tag==='select'){const options=after.split('</select>')[0],chosen=options.match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/)||options.match(/<option[^>]*value="([^"]*)"/);node.value=decode(chosen?.[1]||'');}
  }
 }
 function element(id,attrs=''){
  let markup='';const listeners={},node={id,hidden:/\bhidden\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),required:false,value:'',checked:false,textContent:'',dataset:{},listeners,attrs:{},
   addEventListener(type,fn){listeners[type]=fn},setAttribute(name,value){this.attrs[name]=value},getAttribute(name){return this.attrs[name]},hasAttribute(name){return Object.hasOwn(this.attrs,name)},focus(){this.focused=true},closest(){return this}};
  for(const match of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)){const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());node.dataset[key]=decode(match[2]);node.attrs['data-'+match[1]]=decode(match[2]);}
  Object.defineProperty(node,'innerHTML',{get(){return markup},set(value){markup=String(value);for(const [key,child] of nodes)if(child.parent===id)nodes.delete(key);parse(markup,id);}});return node;
 }
 parse(html,null);
 const doc={getElementById:id=>nodes.get(id)||null,querySelectorAll:selector=>{assert.equal(selector,'input[name="sourceIds"]:checked');return selectedSources.map(value=>({value}))}};
 const sandbox={module:{exports:{}},URL,URLSearchParams,Date,JSON,Set,Map,console,addEventListener:(name,fn)=>{events[name]=fn}};vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'coverage.js'});
 let fact=factData();const W={async api(path,options={}){calls.push({path,...options});const custom=await onRequest?.(path,options,{nodes,calls});if(custom!==undefined){if(custom instanceof Error)throw custom;return custom;}
  if(path==='/api/colleges/status')return access;
  if(path===base)return summary();
  if(path.startsWith(base+'/programs?'))return{registryRevision:revision,items:[program()],total:1,nextCursor:null};
  if(path===base+'/programs/program-1')return{registryRevision:revision,program:program(),facts:[fact.fact],sources:fact.sources,findings:[]};
  if(path.startsWith(base+'/queue?'))return{registryRevision:revision,items:[{id:'queue-1',targetType:'fact',targetId:'fact-1',message:'Confirm exact course equivalency.',affectedProgramIds:['program-1'],affectedReadyTemplateIds:['program-1'],reviewCounts:{unreviewed:1}}],total:1,nextCursor:null};
  if(path===base+'/facts/fact-1')return fact;
  if(path===base+'/facts/fact-1/review'){fact={...fact,fact:{...fact.fact,administrativeReview:{...options.body,revision:1}}};return{registryRevision:revision,fact:fact.fact,review:fact.fact.administrativeReview,publicationChanged:false};}
  throw Error('Unexpected request '+path);
 }};
 const app=sandbox.module.exports.start(doc,W),flush=async()=>{for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve))};
 return {app,nodes,calls,events,flush,setSources:value=>{selectedSources=value},setFact:value=>{fact=value},async open(){await app.detail('fact','fact-1');},async submit({decision='reviewed-supported',note='Checked current official transfer table for this exact catalog.',attestation=true,sources=['source-1']}={}){nodes.get('coverage-decision').value=decision;nodes.get('coverage-review-note').value=note;nodes.get('coverage-attestation').checked=attestation;selectedSources=sources;await app.submit(nodes.get('coverage-review-form'));await flush();}};
}
function problem(status,message){return Object.assign(Error(message),{status});}

test('private page starts with no data and provides accessible controls and meaningful gates',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);assert.match(html,/id="coverage-workspace" hidden/);assert.match(html,/href="#coverage-main"/);assert.match(html,/role="search"/);assert.match(html,/scope="col"/);assert.match(html,/aria-live="polite"/);assert(!/academic-registry\.json/.test(source+html));assert.match(html,/name="q".*maxlength="120"/);
});
test('anonymous and college-only users do not request registry data or see the workbench',async()=>{
 for(const access of [{user:null,isAdmin:false},{user:{id:'college-user'},isAdmin:false,memberships:[{role:'admin',organizationStatus:'verified'}]}]){
  const f=fixture({access});await f.flush();assert.deepEqual(f.calls.map(c=>c.path),['/api/colleges/status']);assert.equal(f.nodes.get('coverage-workspace').hidden,true);assert.equal(f.nodes.get('coverage-detail').innerHTML,'');assert.equal(f.nodes.get('coverage-sign-in').hidden,!!access.user);
 }
});
test('the server gate runs before compact data APIs and platform admins receive programs and priority queue',async()=>{
 const f=fixture();await f.flush();assert.deepEqual(f.calls.slice(0,2).map(c=>c.path),['/api/colleges/status',base]);assert.equal(f.nodes.get('coverage-workspace').hidden,false);assert.match(f.nodes.get('coverage-program-list').innerHTML,/BS Business Administration/);assert.match(f.nodes.get('coverage-queue-list').innerHTML,/1 degree affected/);assert.match(f.nodes.get('coverage-summary').innerHTML,/2 research ready/);assert.match(f.nodes.get('coverage-summary').innerHTML,/Evaluated per student/);assert.match(f.nodes.get('coverage-summary').innerHTML,/Checked separately/);
});
test('failed backend authorization clears all rendered private coverage and does not trust the earlier frontend gate',async()=>{
 const f=fixture({onRequest:path=>path===base?problem(403,'Role revoked'):undefined});await f.flush();assert.equal(f.nodes.get('coverage-workspace').hidden,true);assert.equal(f.calls.length,2);assert.match(f.nodes.get('coverage-gate-heading').textContent,/access is required/);
});
test('a temporarily unavailable registry offers a manual retry without running research or automatic polling',async()=>{
 let fail=true;const f=fixture({onRequest:path=>path===base&&fail?problem(503,'Registry unavailable'):undefined});await f.flush();assert.equal(f.nodes.get('coverage-retry').hidden,false);assert.equal(f.calls.length,2);fail=false;await f.app.refresh();assert.equal(f.nodes.get('coverage-workspace').hidden,false);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('filters are URL encoded and pagination responses cannot replace newer filter results',async()=>{
 let resolveOld;const f=fixture({onRequest:path=>path.includes('q=old')?new Promise(resolve=>{resolveOld=resolve}):path.includes('q=new')?{registryRevision:revision,items:[{...program(),title:'Newest filtered degree'}],total:1,nextCursor:null}:undefined});await f.flush();f.nodes.get('coverage-search').value='old';const old=f.app.programs();await f.flush();f.nodes.get('coverage-search').value='new & exact';const newer=f.app.programs();await newer;assert(f.calls.some(c=>c.path.includes('q=new+%26+exact')));resolveOld({registryRevision:revision,items:[{...program(),title:'Outdated search'}],total:1});await old;assert.match(f.nodes.get('coverage-program-list').innerHTML,/Newest filtered degree/);assert(!f.nodes.get('coverage-program-list').innerHTML.includes('Outdated search'));
});
test('program details keep research quality, personal tasks, estimates, and template availability separate',()=>{
 const markup=UI.programHTML({program:program(),facts:[],sources:[],findings:[]});assert.match(markup,/Conditional/);assert.match(markup,/Available template/);assert.match(markup,/Personal tasks: 1/);assert.match(markup,/Partial estimate/);assert.match(markup,/Assumption-based scenario/);assert(!markup.includes('University approved'));
});
test('evidence and source URLs are escaped; private, token-bearing, credentialed, and non-HTTPS links never become anchors',()=>{
 for(const url of ['javascript:alert(1)','http://example.edu','https://localhost/a','https://10.0.0.1/a','https://secret:pass@example.edu/a','https://example.edu/a?token=secret','https://example.edu/a?email=a@b.edu'])assert.equal(UI.publicURL(url),null,url);
 const bad='<img src=x onerror=alert(1)>',data=factData();data.fact.facts.title=bad;data.fact.facts.conditions=[bad];data.fact.administrativeReview.note='</textarea>'+bad;data.sources[0].title=bad;data.sources[0].url='javascript:alert(1)';data.programs[0].title=bad;const markup=UI.factHTML(data);assert(!markup.includes('<img'));assert(!markup.includes('href="javascript'));assert(!markup.includes('</textarea><img'));assert.match(markup,/&lt;img/);
});
test('supported review cannot be saved without a checked bound public source, explicit attestation, and meaningful note',()=>{
 const good={decision:'reviewed-supported',note:'Checked the exact university mapping.',sourceIds:['source-1'],attestation:true};
 for(const change of [{sourceIds:[]},{attestation:false},{note:'ok'},{sourceIds:['unbound-source']}])assert.throws(()=>UI.reviewPayload(factData(),{...good,...change}));
 const unbound=factData();unbound.fact.sourceBinding.bound=false;assert.throws(()=>UI.reviewPayload(unbound,good));const unsafe=factData();unsafe.sources[0].url='https://example.edu/?api_key=secret';assert.throws(()=>UI.reviewPayload(unsafe,good));
});
test('the interactive review sends the exact evidence and optimistic revision once; source selection resets after save',async()=>{
 const f=fixture();await f.flush();await f.open();await f.submit();const posts=f.calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,base+'/facts/fact-1/review');assert.deepEqual(JSON.parse(JSON.stringify(posts[0].body)),{registryRevision:revision,evidenceFingerprint:fingerprint,revision:0,decision:'reviewed-supported',note:'Checked current official transfer table for this exact catalog.',sourceIds:['source-1'],attestation:true});assert.match(f.nodes.get('coverage-message').textContent,/publication and student credit awards are unchanged/);assert.equal(f.nodes.get('coverage-attestation').checked,false);assert(!f.nodes.get('coverage-detail').innerHTML.includes('sourceIds" form="coverage-review-form" value="source-1" checked'));
});
test('needs-evidence and conflict reviews never claim a support attestation',()=>{
 for(const decision of ['needs-evidence','conflict']){const payload=UI.reviewPayload(factData(),{decision,note:'The source does not specify a current catalog.',sourceIds:[],attestation:true});assert.equal(payload.attestation,false);}
});
test('a concurrent review reloads new evidence, preserves the note, and requires fresh source checks without retrying POST',async()=>{
 let posts=0;const newer=factData();newer.fact.administrativeReview={revision:4,decision:'needs-evidence',note:'Another reviewer note'};const f=fixture({onRequest:(path,options)=>{if(options.method==='POST'){posts++;return problem(409,'Another reviewer saved first');}}});await f.flush();await f.open();f.setFact(newer);await f.submit({note:'My carefully written draft note stays available.'});assert.equal(posts,1);assert.equal(f.nodes.get('coverage-review-note').value,'My carefully written draft note stays available.');assert.match(f.nodes.get('coverage-detail').innerHTML,/draft note is preserved/);assert.equal(f.app.state.fact.fact.administrativeReview.revision,4);assert.equal(f.nodes.get('coverage-attestation').checked,false);
});
test('ambiguous failed saves stop further submission until the latest review is reloaded',async()=>{
 let posts=0;const f=fixture({onRequest:(path,options)=>{if(options.method==='POST'){posts++;return Error('Connection interrupted');}}});await f.flush();await f.open();await f.submit();assert.equal(posts,1);assert.equal(f.app.state.fact,null);assert.equal(f.nodes.get('coverage-review-save').disabled,true);assert.match(f.nodes.get('coverage-review-message').textContent,/could not confirm whether this review saved/);await f.app.submit(f.nodes.get('coverage-review-form'));assert.equal(posts,1);await f.open();assert(f.app.state.fact);assert.equal(f.nodes.get('coverage-review-save').disabled,false);
});
test('revoked access during a review removes all private details immediately',async()=>{
 const f=fixture({onRequest:(path,options)=>options.method==='POST'?problem(401,'Session expired'):undefined});await f.flush();await f.open();await f.submit();assert.equal(f.nodes.get('coverage-workspace').hidden,true);assert.equal(f.nodes.get('coverage-detail').innerHTML,'');assert.equal(f.nodes.get('coverage-program-list').innerHTML,'');assert.equal(f.nodes.get('coverage-sign-in').hidden,false);
});
test('stale program pages are rejected and never mixed into the current registry',async()=>{
 const f=fixture({onRequest:path=>path.includes('q=changed')?{registryRevision:'academic-v1:'+'c'.repeat(64),items:[{...program(),title:'Stale registry degree'}],total:1,nextCursor:'old-cursor'}:undefined});await f.flush();f.nodes.get('coverage-search').value='changed';await f.app.programs();assert(!f.nodes.get('coverage-program-list').innerHTML.includes('Stale registry degree'));assert.equal(f.nodes.get('coverage-more').hidden,true);assert.match(f.nodes.get('coverage-message').textContent,/registry changed/);
});
test('admin entry stays hidden in static markup and is exposed only inside the server-confirmed isAdmin branch',()=>{
 const admin=fs.readFileSync('./dist/admin.html','utf8'),js=fs.readFileSync('./dist/admin.js','utf8');assert.match(admin,/<p id="admin-coverage-link" hidden><a[^>]+href="coverage.html"/);assert.match(js,/if\(access\.isAdmin\)\{\$\('admin-coverage-link'\)\.hidden=false;/);assert(!/memberships.*coverage-link/.test(js.split('\n').filter(line=>!line.includes('async()=>{try{access=')).join('\n')));
});
test('catalog objects, unknown original quantities, and nested conditions remain visible without raw identifier dumps',()=>{
 const data=factData();data.fact.facts.sourceCredits=null;data.fact.facts.sourceCreditSystem=null;data.fact.facts.mappingEvidence={minimumGrade:'C',allowedCourseCodes:['ENG 101','ENG 102']};data.fact.scope.catalogIdentity={kind:'catalog-year',year:'2026-2027'};data.fact.scope.institutionId='institution-private-internal-key';const markup=UI.factHTML(data);assert.match(markup,/Source Credits/);assert.match(markup,/Not recorded/);assert.match(markup,/Minimum Grade|Minimum grade/);assert.match(markup,/ENG 102/);assert.match(markup,/2026-2027/);assert(!markup.includes('institution-private-internal-key'));
 const p=program();p.catalogIdentity={kind:'catalog-year',label:'Catalog 2026-2027',year:'2026-2027'};assert.match(UI.programRows([p]),/Catalog 2026-2027/);
});
test('large fact lists are bounded and searchable rather than rendering thousands of review controls',()=>{
 const facts=Array.from({length:500},(_,i)=>({...factData().fact,id:'fact-'+i})),markup=UI.programHTML({program:program(),facts,sources:[],findings:[]});assert.equal((markup.match(/data-open-fact=/g)||[]).length,40);assert.match(markup,/Showing 40 of 500/);assert.match(markup,/id="coverage-fact-search"/);
});
test('the summary reports estimate completeness separately from academic research counts',()=>{
 const data=summary();data.qualitySummary={research:{'research-ready':2,conditional:3},execution:{personalTaskPrograms:5},estimates:{cost:{'complete-estimate':1,'partial-estimate':4,'not-estimated':0},timing:{'assumption-based-scenario':5}}};const markup=UI.summaryHTML(data);assert.match(markup,/2 research ready/);assert.match(markup,/1 complete cost estimate/);assert.match(markup,/4 partial cost estimates/);assert.match(markup,/5 programs include personal tasks/);assert.match(markup,/5 timing scenarios use assumptions/);
 const missing=factData();delete missing.fact.sourceBinding;assert.throws(()=>UI.reviewPayload(missing,{decision:'reviewed-supported',note:'Checked exact official sources.',sourceIds:['source-1'],attestation:true}));
});
