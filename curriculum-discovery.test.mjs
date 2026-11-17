/* Synthetic CourseLeaf fixtures: no live catalogue or student data is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCurriculumDiscovery,parseCourseLeafHTML} from './server/curriculum-discovery.mjs';

const URL='https://catalog.liberty.edu/graduate/colleges-schools/history/history-ma/';
const PROGRAM={id:'fixture-history-ma',school:'Liberty University',title:'History (M.A.)',level:'master',modalities:['online'],url:URL};
const row=(code,title,hours,cls='')=>`<tr class="${cls}"><td class="codecol"><a>${code}</a></td><td class="titlecol">${title}</td><td class="hourscol">${hours}</td></tr>`;
const COURSES=Array.from({length:12},(_,i)=>row('HIST '+(501+i),'Synthetic graduate course '+(i+1),3));
function page({rows=COURSES,total=36,heading='Degree Requirements',graduation=true,nonce='a',extra=''}={}){
 return`<!doctype html><html><h1>Course Catalog</h1><h1 class="page-title">History (M.A.) — Online</h1><p>Catalog 2026-2027</p><script>const nonce='${nonce}'</script><div id="textcontainer"><h2>${heading}</h2><table class="sc_courselist"><thead><tr><th>Code</th><th>Title</th><th>Hours</th></tr></thead><tbody>${rows.join('')}<tr class="listsum"><td colspan="2">Total Hours</td><td class="hourscol">${total}</td></tr></tbody></table>${graduation?`<h2>Graduation Requirements</h2><ul><li>${total} total hours</li><li>A minimum of 50% of the program credit hours must be completed through Liberty University.</li><li>Grade of C Minimum required for all courses.</li></ul>`:''}${extra}</div></html>`;
}
function memoryCache(){const rows=new Map(),writes=[];return{rows,writes,async get(key){return rows.get(key)||null;},async put(key,payload,ttl){rows.set(key,structuredClone(payload));writes.push({key,ttl});}};}
const request=(id=PROGRAM.id,extra='')=>new Request('https://degreepath.test/api/curriculum?program='+encodeURIComponent(id)+extra);
function options(extra={}){return{catalog:{programs:[PROGRAM]},cache:memoryCache(),fetcher:async()=>new Response(page(),{headers:{'Content-Type':'text/html'}}),...extra};}
const parse=html=>parseCourseLeafHTML(html,{program:PROGRAM,url:URL,checkedOn:'2026-11-09'});

test('strict parser builds a source-linked balanced graduate ledger and separates unverified policy checks',()=>{
 const r=parse(page());assert.equal(r.status,'ready');assert.equal(r.model.requirements.length,12);assert.equal(r.model.totalCredits,36);assert.equal(r.model.institutionMinCredits,18);assert.equal(r.model.requirements[0].code,'HIST 501');assert.equal(r.model.requirements[0].minimumGrade,'C');assert.equal(r.model.title,'History (M.A.) — Online');assert.equal(r.model.reviewStatus,'automated-public-source');assert(r.model.policyReview.some(p=>p.status==='unverified'));assert.equal(r.model.completeExecutablePathway,false);
});

test('closed OR alternatives count one requirement; footnote digits do not alter course identity',()=>{
 const rows=[row('HIST&nbsp;501<sup>1</sup>','Synthetic original<sup>1</sup>',3),row('or HIST 599','Synthetic alternative','', 'orclass'),...COURSES.slice(1)];const r=parse(page({rows}));assert.equal(r.status,'ready');assert.equal(r.model.requirements.length,12);const req=r.model.requirements[0];assert.equal(req.code,'HIST 501');assert.deepEqual(req.allowedCourseCodes,['HIST 501','HIST 599']);assert.equal(req.title,'Synthetic original');assert.equal(req.options.length,2);assert.equal(req.selectionRequired,true);assert.equal(r.model.requirements.reduce((n,r)=>n+r.credits,0),36);
});

test('subtotals never become courses and course-sequence tables are not counted again',()=>{
 const extra=`<div id="coursesequencecontainer"><h2>Course Sequence</h2><table class="sc_courselist">${COURSES.join('')}</table></div>`;const r=parse(page({extra}));assert.equal(r.status,'ready');assert.equal(r.model.requirements.length,12);
});

test('partial majors and concentration-only tables do not masquerade as entire degrees',()=>{
 const bachelor={...PROGRAM,id:'fixture-bachelor',level:'bachelor',title:'History (B.S.)'};
 const partial=parseCourseLeafHTML(page({rows:COURSES.slice(0,10),total:30,heading:'Major Requirements',graduation:false}),{program:bachelor,url:URL});assert.equal(partial.status,'needs-audit');assert(partial.reasons.some(r=>['published_total_missing','implausible_whole_degree_total'].includes(r.code)));
 const concentration=parse(page({rows:COURSES.slice(0,6),total:18,heading:'Concentration Requirements',graduation:false}));assert.equal(concentration.status,'needs-audit');assert(concentration.reasons.some(r=>r.code==='published_total_missing'));
 const wrongProgram=parse(page().replace('History (M.A.) — Online','Chemistry (M.S.) — Online'));assert.equal(wrongProgram.status,'needs-audit');assert(wrongProgram.reasons.some(r=>r.code==='program_identity_mismatch'));
});

test('ambiguous credit choices, ranges, missing credits and duplicates produce concrete audit reasons',()=>{
 const cases=[
  {rows:[row('HIST 501','Variable work','3–6'),...COURSES.slice(1)],code:'variable_course_credits'},
  {rows:[row('HIST 501','Missing credits',''),...COURSES.slice(1)],code:'course_credits_missing'},
  {rows:[COURSES[0],...COURSES.slice(0,11)],code:'duplicate_requirement_code'},
  {rows:['<tr class="areaheader"><td colspan="3">Choose six credits from the following</td></tr>',...COURSES],code:'choice_group_requires_audit'},
  {rows:[row('','General education electives',6),...COURSES.slice(2)],code:'unallocated_credit_bucket'},
 ];for(const c of cases){const r=parse(page({rows:c.rows}));assert.equal(r.status,'needs-audit',c.code);assert(r.reasons.some(r=>r.code===c.code),c.code);assert.equal(r.model,undefined);}
});

test('known IDs only, GET only, no caller URL and no cache means no network',async()=>{
 let calls=0;const opts=options({fetcher:async()=>{calls++;return new Response(page());}});
 assert.equal((await handleCurriculumDiscovery(new Request(request().url,{method:'POST'}),{},opts)).status,405);
 assert.equal((await handleCurriculumDiscovery(request('unknown'),{},opts)).status,404);
 assert.equal((await handleCurriculumDiscovery(request(PROGRAM.id,'&url=https://169.254.169.254/'),{},opts)).status,400);
 assert.equal((await handleCurriculumDiscovery(request(),{},{...opts,cache:null})).status,503);assert.equal(calls,0);
});

test('positive cache and immutable revision preserve hashes, use pure64hex and avoid another fetch',async()=>{
 let calls=0;const opts=options({fetcher:async()=>{calls++;return new Response(page(),{headers:{'Content-Type':'text/html'}});}});
 const a=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(a.status,'ready');assert.equal(a.cached,false);assert.match(a.source.hash,/^[a-f0-9]{64}$/);assert.match(a.source.requirementsHash,/^[a-f0-9]{64}$/);assert.match(a.model.id,/^source-curriculum-[a-f0-9]{32}$/);assert(opts.cache.rows.has('revision:'+a.model.id));assert(opts.cache.writes.some(w=>w.ttl===30*86400));assert(opts.cache.writes.some(w=>w.ttl===10*365*86400));
 const b=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(b.cached,true);assert.equal(calls,1);assert.equal(a.model.id,b.model.id);
});

test('semantic version IDs ignore HTML nonces but change when actual required courses change',async()=>{
 async function discover(html){return(await handleCurriculumDiscovery(request(),{},options({fetcher:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}))).json();}
 const a=await discover(page({nonce:'one'})),b=await discover(page({nonce:'two'})),c=await discover(page({rows:[row('HIST 550','Changed required course',3),...COURSES.slice(1)]}));assert.equal(a.status,'ready');assert.equal(a.model.id,b.model.id);assert.notEqual(a.source.hash,b.source.hash);assert.notEqual(a.model.id,c.model.id);assert.notEqual(a.route.id,c.route.id);
});

test('official family links produce exact selectable variants without guessing paths',async()=>{
 const family={...PROGRAM,title:'History Major (M.A.)',modalities:[]};const online=URL+'online/',campus=URL+'resident/';const html=`<!doctype html><html><h1>History Major (M.A.)</h1><a href="${online}">History (M.A.) - Online</a><a href="${campus}">History (M.A.) - Resident</a><a href="https://evil.test/">History (M.A.) - Online</a></html>`;const seen=[],opts=options({catalog:{programs:[family]},fetcher:async url=>{seen.push(url);return new Response(url===URL?html:page(),{headers:{'Content-Type':'text/html'}});}});
 const first=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(first.status,'choose-variant');assert.equal(first.variants.length,2);const onlineVariant=first.variants.find(v=>v.url===online);assert(onlineVariant);const chosen=await(await handleCurriculumDiscovery(request(PROGRAM.id,'&variant='+onlineVariant.id),{},opts)).json();assert.equal(chosen.status,'ready');assert.equal(chosen.source.url,online);assert.equal(chosen.route.parentId,PROGRAM.id);assert.equal(seen.length,3);
});

test('redirect targets, response sizes, request budgets and timeouts are bounded',async()=>{
 let count=0;let opts=options({fetcher:async()=>{count++;return new Response(null,{status:302,headers:{Location:'http://169.254.169.254/metadata'}});}});let r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.reasons[0].code,'source_not_allowed');assert.equal(count,1);
 opts=options({fetcher:async()=>new Response('<html>'+'x'.repeat(1024*1024)+'</html>',{headers:{'Content-Type':'text/html'}})});r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.reasons[0].code,'source_too_large');
 count=0;opts=options({fetcher:async()=>{count++;return new Response(null,{status:302,headers:{Location:URL+'step'+count}});}});r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.reasons[0].code,'fetch_budget_exceeded');assert.equal(count,3);
 opts=options({timeoutMs:20,fetcher:async()=>new Promise(()=>{})});r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.reasons[0].code,'source_timeout');assert(opts.cache.writes.some(w=>w.ttl===86400));
});

test('same-host school identity and exact receiving-course provenance control borrowed options',async()=>{
 const reviewed={school:'Liberty University',level:"Master's",sources:[{id:'graduate-map',url:'https://catalog.liberty.edu/graduate/transfer/'}],requirements:[{code:'HIST 501',options:[{id:'college-history',provider:'Accredited College',code:'HIS 600',receivingCode:'HIST 501',credits:3,graduateCredit:true,creditOrigin:'institutional',evidence:'published',sourceIds:['graduate-map']}]}]};
 let opts=options({reviewedModels:[reviewed]});let r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.status,'ready');const borrowed=r.model.requirements[0].options.filter(o=>o.provider!=='University');assert.equal(borrowed.length,1);assert.equal(borrowed[0].evidence,'conditional');assert.match(borrowed[0].mappingScope,/Same-school/);
 const undergraduate={...reviewed,level:'bachelor'},ace=structuredClone(reviewed);ace.requirements[0].options[0].provider='Sophia';opts=options({reviewedModels:[undergraduate,ace]});r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert(r.model.requirements.every(req=>req.options.every(o=>o.provider==='University')));
 let called=false;opts=options({catalog:{programs:[{...PROGRAM,url:'https://catalog.liberty.edu.evil.test/graduate/history/'}]},fetcher:async()=>{called=true;throw Error('must not fetch');}});r=await(await handleCurriculumDiscovery(request(),{},opts)).json();assert.equal(r.status,'needs-audit');assert.equal(called,false);
});

test('borrowed provider aliases keep every remapped identity and alias evidence reference declared',async()=>{
 const reviewed={school:PROGRAM.school,level:'master',sources:[
  {id:'graduate-map',url:'https://catalog.liberty.edu/graduate/transfer/',revisionId:42},
  {id:'provider-identity',url:'https://example.org/provider-course',scope:'Provider identity only'},
  {id:'provider-alias',url:'https://example.org/provider-alias',scope:'Explicit code alias only'},
 ],requirements:[{code:'HIST 501',options:[{id:'college-history',provider:'Accredited College',code:'HIS 600',codeAliases:['HIS-0600'],receivingCode:'HIST 501',credits:3,graduateCredit:true,creditOrigin:'institutional',evidence:'published',sourceIds:['graduate-map'],identitySourceIds:['provider-identity'],codeAliasEvidence:[{alias:'HIS-0600',sourceIds:['provider-alias'],scope:'Exact provider course identity'}]}]}]};
 const original=structuredClone(reviewed),result=await(await handleCurriculumDiscovery(request(),{},options({reviewedModels:[reviewed]}))).json();assert.equal(result.status,'ready');
 const option=result.model.requirements[0].options.find(option=>option.provider==='Accredited College');assert(option);assert.deepEqual(option.codeAliases,['HIS-0600']);assert.equal(option.codeAliasEvidence[0].scope,original.requirements[0].options[0].codeAliasEvidence[0].scope);
 const declared=new Map(result.model.sources.map(source=>[source.id,source])),refs=[...option.sourceIds,...option.identitySourceIds,...option.codeAliasEvidence.flatMap(evidence=>evidence.sourceIds)];assert.equal(refs.length,4);
 for(const ref of refs)assert(declared.has(ref),'Borrowed option has an undeclared source reference: '+ref);
 for(const source of reviewed.sources){const remapped=result.model.sources.find(candidate=>candidate.url===source.url);assert(remapped);assert.match(remapped.id,/^borrowed-/);assert.notEqual(remapped.id,source.id);assert.deepEqual({...remapped,id:source.id},source);assert(refs.includes(remapped.id));}
 assert.deepEqual(reviewed,original,'Discovery must not mutate the reviewed model or its source IDs');
 for(const missing of ['provider-identity','provider-alias']){
  const incomplete=structuredClone(reviewed);incomplete.sources=incomplete.sources.filter(source=>source.id!==missing);
  const rejected=await(await handleCurriculumDiscovery(request(),{},options({reviewedModels:[incomplete]}))).json();assert.equal(rejected.status,'ready');assert(rejected.model.requirements[0].options.every(option=>option.provider==='University'),'An option with missing '+missing+' provenance must not be imported');
 }
});

test('accreditation-specific residency never becomes an unrestricted automatic transfer ledger',()=>{
 const r=parse(page({extra:'<p>Students are required to take these courses residentially in support of ABET accreditation. Exceptions require ABET coordinator review.</p>'}));assert.equal(r.status,'needs-audit');assert(r.reasons.some(x=>x.code==='program_specific_residency'));
});
