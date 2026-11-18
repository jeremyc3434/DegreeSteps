import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedDatabase } from '../scripts/d1-snapshot.mjs';
import { handleAcademicCoverage } from './academic-coverage.mjs';

const origin='https://degreesteps.example',prefix='/api/admin/academic-coverage';
const ids={owner:'sb-11111111-1111-4111-8111-111111111111',moderator:'sb-22222222-2222-4222-8222-222222222222',member:'sb-33333333-3333-4333-8333-333333333333',configured:'sb-44444444-4444-4444-8444-444444444444'};
const clone=value=>JSON.parse(JSON.stringify(value));
function registry() {
  return {revision:'academic-v1:'+('a'.repeat(64)),programs:[
    {id:'liberty-business',institutionId:'liberty',title:'Business Administration',school:'Liberty University',format:'online',catalogIdentity:'2026-2027',level:'bachelor',creditSystem:'semester',totalCredits:120,readyTemplate:true,factIds:['fact-policy','fact-course'],sourceIds:['source-policy','source-course']},
    {id:'liberty-justice',institutionId:'liberty',title:'Criminal Justice',school:'Liberty University',format:'campus',catalogIdentity:'2026-2027',level:'bachelor',creditSystem:'semester',totalCredits:120,readyTemplate:false,factIds:['fact-policy','fact-unknown'],sourceIds:['source-policy']}
  ],sources:[
    {id:'source-policy',url:'https://www.liberty.edu/catalog/transfer/',title:'Published university transfer policy',metadataDigest:'d'.repeat(64),sourceContentHash:null,programIds:['liberty-business','liberty-justice'],dependentFactIds:['fact-policy'],localReferences:[{modelId:'liberty-business',localSourceId:'policy'},{modelId:'liberty-justice',localSourceId:'policy'}]},
    {id:'source-course',url:'https://www.liberty.edu/catalog/course-equivalencies/',title:'Published university course equivalencies',metadataDigest:'e'.repeat(64),sourceContentHash:null,programIds:['liberty-business'],dependentFactIds:['fact-course']}
  ],facts:[
    {id:'fact-policy',kind:'policy',scope:{school:'liberty',catalogIdentity:'2026-2027',format:'online'},facts:{externalMaxCredits:90,alternativeMaxCredits:null,conditions:['Receiving university must evaluate the original credit.']},declaredEvidence:'conditional',sourceIds:['source-policy'],sourceBinding:{bound:true,missingLocalSourceIds:[]},programIds:['liberty-business','liberty-justice'],requirementIds:[],evidenceFingerprint:'1'.repeat(64)},
    {id:'fact-course',kind:'receiving-map',scope:{school:'liberty',catalogIdentity:'2026-2027',format:'online'},facts:{providerCode:'SOPH-0001',receivingCode:'ENGL 101',receivingCredits:3},declaredEvidence:'university-published',sourceIds:['source-course'],sourceBinding:{bound:true,missingLocalSourceIds:[]},programIds:['liberty-business'],requirementIds:['requirement-english'],evidenceFingerprint:'2'.repeat(64)},
    {id:'fact-unknown',kind:'receiving-map',scope:{school:'liberty',catalogIdentity:'unconfirmed',format:'campus'},facts:{providerAlias:'Unknown',sourceCredits:null},declaredEvidence:'unconfirmed',sourceIds:[],sourceBinding:{bound:false,missingLocalSourceIds:['missing-source']},programIds:['liberty-justice'],requirementIds:['requirement-major'],evidenceFingerprint:'3'.repeat(64)}
  ],findings:[{id:'finding-unknown',category:'source-authority',code:'unknown-original-credits',message:'The original credit quantity has not been established.',owner:'academic',blocking:true,modelId:'liberty-justice',programIds:['liberty-justice'],factIds:['fact-unknown'],sourceIds:[]}],reviewQueue:[{id:'queue-policy',targetType:'source',targetId:'source-policy',category:'policy',code:'conditional-policy',message:'Review this university transfer policy and its conditions.',findingIds:[],affectedProgramIds:['liberty-business','liberty-justice'],affectedReadyTemplateIds:['liberty-business'],impactScore:20}]};
}
function fixture(t,{user=ids.owner,...overrides}={}) {
  const sqlite=createTrustedDatabase();t.after(()=>sqlite.close());
  for(const [id,role] of [[ids.owner,'owner'],[ids.moderator,'moderator'],[ids.member,'member']])sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'Synthetic administrator',role,1,1);
  sqlite.prepare('INSERT INTO college_organizations(id,name,website,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('synthetic-college','Synthetic college','https://college.example','verified',ids.owner,1,1);
  sqlite.prepare('INSERT INTO college_memberships(organization_id,user_id,role,granted_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('synthetic-college',ids.member,'admin',ids.owner,1,1);
  sqlite.prepare('INSERT INTO portal_profiles(id,alias,created_at,updated_at) VALUES(?,?,?,?)').run(ids.member,'PRIVATE STUDENT NAME',1,1);
  sqlite.prepare('INSERT INTO portal_plans(id,user_id,title,state_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('private-plan',ids.member,'PRIVATE STUDENT TRANSCRIPT',JSON.stringify({privateTranscript:'NEVER INCLUDE STUDENT DATA'}),1,1,1);
  const DB={sqlite,prepared:[],beforeBatch:null,failAudit:false,
    prepare(sql) {
      DB.prepared.push(sql);
      const statement=sqlite.prepare(sql);
      return {bind:(...values)=>({
        first:async()=>statement.get(...values)||null,
        all:async()=>({results:statement.all(...values)}),
        run:async()=>{if(DB.failAudit&&sql.startsWith('INSERT INTO academic_fact_review_events'))throw Error('Synthetic audit failure');return {meta:{changes:Number(statement.run(...values).changes)}};}
      })};
    },
    async batch(statements) {
      if(DB.beforeBatch){const callback=DB.beforeBatch;DB.beforeBatch=null;callback();}
      sqlite.exec('BEGIN');
      try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const context={registry:registry(),report:{summary:{completePlans:2,publicationIndependent:true},programs:[{modelId:'liberty-business',status:'draft',axes:{requirements:'complete',authority:'conditional',pricing:'incomplete'}}]}};
  return {DB,sqlite,context,env:{DB,PORTAL_USER:user?{id:user,email:'owner@example.com'}:null,COMMUNITY_ADMIN_EMAIL:'configured@example.com',...overrides}};
}
async function call(f,path='',{method='GET',body,headers={},env=f.env,context=f.context}={}) {
  const request=new Request(origin+prefix+path,{method,headers:{...(method==='POST'?{'Origin':origin,'X-Portal-Request':'1','Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const response=await handleAcademicCoverage(request,env,context);
  return {response,status:response?.status,data:response?await response.json():null};
}
function review(f,{id='fact-policy',...changes}={}) {
  const fact=f.context.registry.facts.find(item=>item.id===id);
  return {registryRevision:f.context.registry.revision,evidenceFingerprint:fact.evidenceFingerprint,revision:0,decision:'reviewed-supported',note:'Reviewed the attached university source and preserved all stated conditions.',sourceIds:fact.sourceIds,attestation:true,...changes};
}
const counts=f=>({reviews:f.sqlite.prepare('SELECT count(*) AS n FROM academic_fact_reviews').get().n,events:f.sqlite.prepare('SELECT count(*) AS n FROM academic_fact_review_events').get().n});
function shard(f) {
  const full=clone(f.context.registry),calls=[];
  const factPaths=new Map(full.facts.map((fact,index)=>[fact.id,'/data/academic-evidence/'+String(index+1).repeat(64)+'.json']));
  const sourcePaths=new Map(full.sources.map((source,index)=>[source.id,'/data/academic-evidence/'+String(index+4).repeat(64)+'.json']));
  f.context.registry.facts=f.context.registry.facts.map(fact=>{const summary={...fact,label:fact.facts?.field||fact.kind,detailPath:factPaths.get(fact.id)};delete summary.facts;delete summary.declaredEvidence;return summary;});
  f.context.registry.sources=f.context.registry.sources.map(source=>{const summary={...source,detailPath:sourcePaths.get(source.id)};delete summary.metadata;delete summary.sourceContentHash;return summary;});
  full.sources.forEach(source=>{source.metadata={kind:'university',roles:['policy'],scope:{school:'liberty'}};});
  f.context.loadEvidence=async paths=>{calls.push([...paths]);return {facts:full.facts.filter(fact=>paths.includes(factPaths.get(fact.id))),sources:full.sources.filter(source=>paths.includes(sourcePaths.get(source.id)))};};
  return {full,calls,factPaths,sourcePaths};
}

test('the route is private to verified platform administrators, including no college-only access',async t=>{
  const f=fixture(t);
  assert.equal(await handleAcademicCoverage(new Request(origin+'/api/portal/session'),{},{}),null);
  for(const [env,status] of [[{...f.env,PORTAL_USER:null},401],[{...f.env,PORTAL_USER:{id:ids.member,email:'student@example.com',role:'owner',collegeRole:'admin'}},403],[{...f.env,PORTAL_USER:{id:'bad; DROP TABLE community_users'}},401]]) {
    const result=await call(f,'',{env,headers:{'X-User-Id':ids.owner,'X-User-Role':'owner'}});assert.equal(result.status,status);assert(!JSON.stringify(result.data).includes('externalMaxCredits'));
  }
  for(const id of [ids.owner,ids.moderator])assert.equal((await call(f,'',{env:{...f.env,PORTAL_USER:{id}}})).status,200);
  const configured=await call(f,'',{env:{...f.env,PORTAL_USER:{id:ids.configured,email:'CONFIGURED@EXAMPLE.COM'}}});assert.equal(configured.status,200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM community_users WHERE id=?').get(ids.configured).n,0,'Configured owners do not require a new student/community profile');
  assert.deepEqual(counts(f),{reviews:0,events:0});
});

test('the large immutable graph loader runs only after verified platform administrator authorization',async t=>{
  const f=fixture(t);let calls=0;const context=async()=>{calls++;return f.context;};
  assert.equal((await call(f,'',{env:{...f.env,PORTAL_USER:null},context})).status,401);
  assert.equal((await call(f,'',{env:{...f.env,PORTAL_USER:{id:ids.member}},context})).status,403);
  assert.equal(calls,0);assert.equal((await call(f,'',{context})).status,200);assert.equal(calls,1);
  assert.equal(await handleAcademicCoverage(new Request(origin+'/api/portal/session'),f.env,context),null);assert.equal(calls,1);
});

test('summary and paginated program reads expose public evidence metadata without student data or the full registry',async t=>{
  const f=fixture(t),result=await call(f);
  assert.equal(result.status,200);assert.equal(result.data.summary.programs,2);assert.equal(result.data.summary.facts,3);assert.equal(result.data.summary.unreviewed,3);
  assert.equal(result.data.registryRevision,f.context.registry.revision);assert.equal(result.data.facts,undefined);assert.equal(result.data.publicationChanged,false);
  const safe=JSON.stringify(result.data);assert(!safe.includes('PRIVATE STUDENT'));assert(!safe.includes('NEVER INCLUDE'));assert(!safe.includes('SOPH-0001'));
  assert.equal(result.response.headers.get('Cache-Control'),'private, no-store');assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);assert.match(result.response.headers.get('X-Robots-Tag'),/noindex/);
  const first=await call(f,'/programs?limit=1');assert.equal(first.data.items.length,1);assert.equal(first.data.total,2);assert(first.data.nextCursor);
  const second=await call(f,'/programs?limit=1&cursor='+encodeURIComponent(first.data.nextCursor));assert.equal(second.status,200);assert.equal(second.data.items.length,1);assert.notEqual(first.data.items[0].id,second.data.items[0].id);assert.equal(second.data.nextCursor,null);
  const filtered=await call(f,'/programs?q=criminal&school=liberty&status=draft');assert.deepEqual(filtered.data.items.map(item=>item.id),['liberty-justice']);
  assert(f.DB.prepared.every(sql=>!sql.includes('portal_')&&!sql.includes('college_interest')&&!sql.includes('template_requests')),'Coverage never queries student plans, transcripts, requests, or leads');
});

test('program, fact and source details preserve evidence scope and show reusable source impact',async t=>{
  const f=fixture(t),program=await call(f,'/programs/liberty-business');
  assert.equal(program.status,200);assert.equal(program.data.facts.length,2);assert.equal(program.data.sources.length,2);assert.equal(program.data.program.reviewCounts.unreviewed,2);assert.deepEqual(program.data.program.quality.axes,{requirements:'complete',authority:'conditional',pricing:'incomplete'});
  const fact=await call(f,'/facts/fact-policy');assert.equal(fact.status,200);assert.equal(fact.data.programs.length,2);assert.equal(fact.data.fact.administrativeReview.revision,0);assert.equal(fact.data.sources[0].sourceContentHash,null);
  const source=await call(f,'/sources/source-policy');assert.equal(source.data.facts.length,1);assert.equal(source.data.programs.length,2);
  const queue=await call(f,'/queue?decision=unreviewed&limit=1');assert.equal(queue.status,200);assert.equal(queue.data.items[0].targetType,'source');assert.equal(queue.data.items[0].affectedProgramIds.length,2);assert.deepEqual(queue.data.items[0].factIds,['fact-policy']);assert(queue.data.nextCursor);
  const gaps=await call(f,'/queue?programId=liberty-justice&kind=receiving-map');assert(gaps.data.items.some(item=>item.factIds.includes('fact-unknown')));
});

test('support is a durable exact-fact administrative attestation with an atomic append-only history',async t=>{
  const f=fixture(t),before=JSON.stringify(f.context),result=await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)});
  assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.review.revision,1);assert.equal(result.data.review.reviewerId,ids.owner);assert.equal(result.data.review.attestation,true);assert.equal(result.data.publicationChanged,false);
  assert.match(result.data.reviewMeaning,/not university approval/);assert.deepEqual(counts(f),{reviews:1,events:1});
  assert.equal(JSON.stringify(f.context),before,'Reviews cannot mutate immutable facts, source authority, conditional policies, quality or publication status');
  const saved=await call(f,'/facts/fact-policy');assert.equal(saved.data.fact.administrativeReview.decision,'reviewed-supported');assert.equal(saved.data.fact.declaredEvidence,'conditional');assert.equal(saved.data.fact.facts.alternativeMaxCredits,null);assert.equal(saved.data.history.length,1);
  const changed=await call(f,'/facts/fact-policy/review',{method:'POST',env:{...f.env,PORTAL_USER:{id:ids.moderator}},body:review(f,{revision:1,decision:'conflict',note:'The policy has an exception that conflicts with this proposed interpretation.',sourceIds:['source-policy'],attestation:false})});
  assert.equal(changed.status,200);assert.equal(changed.data.review.revision,2);assert.equal(changed.data.review.reviewerId,ids.moderator);assert.deepEqual(counts(f),{reviews:1,events:2});
  const rows=f.sqlite.prepare('SELECT revision,decision,reviewer_id FROM academic_fact_review_events ORDER BY revision').all();assert.deepEqual(rows.map(row=>({...row})),[{revision:1,decision:'reviewed-supported',reviewer_id:ids.owner},{revision:2,decision:'conflict',reviewer_id:ids.moderator}]);
  const summary=await call(f);assert.equal(summary.data.summary.conflicts,1);assert.equal(summary.data.summary.reviewedSupported,0);
});

test('stale review revisions and atomic races cannot overwrite a decision or append a false audit event',async t=>{
  const f=fixture(t);assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,201);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,409);assert.deepEqual(counts(f),{reviews:1,events:1});
  f.DB.beforeBatch=()=>f.sqlite.prepare("UPDATE academic_fact_reviews SET revision=2,last_event_id='concurrent-review',decision='needs-evidence',attestation=0 WHERE fact_id='fact-policy'").run();
  const raced=await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f,{revision:1})});assert.equal(raced.status,409);assert.deepEqual(counts(f),{reviews:1,events:1});
  assert.equal(f.sqlite.prepare("SELECT last_event_id FROM academic_fact_reviews WHERE fact_id='fact-policy'").get().last_event_id,'concurrent-review');
});

test('an audit failure rolls back the review rather than leaving an unaudited decision',async t=>{
  const f=fixture(t);f.DB.failAudit=true;
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,503);assert.deepEqual(counts(f),{reviews:0,events:0});
});

test('a changed fact fingerprint invalidates support, retains history, and requires a new review',async t=>{
  const f=fixture(t);await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)});
  const previous=clone(f.context),oldInput=review(f);f.context.registry.revision='academic-v1:'+('b'.repeat(64));
  let result=await call(f,'/facts/fact-policy');assert.equal(result.data.fact.administrativeReview.revision,1);assert.equal(result.data.fact.administrativeReview.exactFactReused,true,'An unrelated registry release may reuse only an identical fact/evidence fingerprint');
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:oldInput})).status,409);
  f.context.registry.facts[0].evidenceFingerprint='9'.repeat(64);f.context.registry.facts[0].facts.externalMaxCredits=75;f.context.registry.sources[0].metadataDigest='f'.repeat(64);
  result=await call(f,'/facts/fact-policy');assert.equal(result.data.fact.administrativeReview.revision,0);assert.equal(result.data.fact.administrativeReview.decision,'unreviewed');assert.equal(result.data.history[0].appliesToCurrentEvidence,false);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:{...oldInput,registryRevision:f.context.registry.revision}})).status,409);
  const fresh=await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)});assert.equal(fresh.status,201);assert.equal(fresh.data.review.revision,1);assert.deepEqual(counts(f),{reviews:2,events:2});
  assert.equal((await call(f,'/facts/fact-policy',{context:previous})).data.fact.administrativeReview.registryRevision,previous.registry.revision,'The previous immutable artifact still resolves its own evidence review');
});

test('unknown course origin, unknown quantities and conditional evidence cannot be promoted by review input',async t=>{
  const f=fixture(t),before=clone(f.context.registry.facts[2]);
  const result=await call(f,'/facts/fact-unknown/review',{method:'POST',body:review(f,{id:'fact-unknown'})});assert.equal(result.status,400);assert.deepEqual(counts(f),{reviews:0,events:0});
  const flagged=await call(f,'/facts/fact-unknown/review',{method:'POST',body:review(f,{id:'fact-unknown',decision:'needs-evidence',attestation:false,note:'Research the original source, exact credit quantity, and receiving policy.'})});assert.equal(flagged.status,201);
  assert.deepEqual(f.context.registry.facts[2],before);const program=await call(f,'/programs/liberty-justice');assert.equal(program.data.program.readyTemplate,false);assert.equal(program.data.findings[0].blocking,true);assert.equal(program.data.facts.find(fact=>fact.id==='fact-unknown').facts.sourceCredits,null);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:{...review(f),sourcesReviewed:true,academicReviewed:true}})).status,400);
});

test('review validation rejects unrelated references, missing attestations, unsafe sources, and unsupported verdicts',async t=>{
  const f=fixture(t);
  for(const change of [{sourceIds:['source-course']},{sourceIds:['source-policy','source-policy']},{sourceIds:[]},{attestation:false},{decision:'university-approved'},{revision:-1},{note:'ok'},{decision:'needs-evidence',attestation:true}])assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f,change)})).status,400,JSON.stringify(change));
  delete f.context.registry.facts[0].sourceBinding;
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,400,'Absent source binding cannot be inferred by an admin checkbox');
  f.context.registry.facts[0].sourceBinding={bound:true,missingLocalSourceIds:[]};f.context.registry.sources[0].url='https://example.com/policy?access_token=private';
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,400);
  assert.equal((await call(f,'/sources/source-policy')).data.source.url,null);assert.deepEqual(counts(f),{reviews:0,events:0});
});

test('same-origin JSON protection and bounded parsing apply before every mutation',async t=>{
  const f=fixture(t),input=review(f);
  for(const headers of [{'Origin':'https://attacker.example'},{'X-Portal-Request':'0'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:input,headers})).status,403);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:input,headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:'{broken'})).status,400);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:' '.repeat(16385)})).status,413);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:input,headers:{'Content-Length':'20000'}})).status,413);assert.deepEqual(counts(f),{reviews:0,events:0});
});

test('filters and cursors are bounded and bound to the registry and original query',async t=>{
  const f=fixture(t);
  for(const path of ['/programs?limit=101','/programs?limit=-1','/programs?q=a&q=b','/queue?decision=approved','/queue?unknown=true','/facts/fact-policy?studentId=private'])assert.equal((await call(f,path)).status,400,path);
  const page=await call(f,'/programs?limit=1');
  assert.equal((await call(f,'/programs?q=business&cursor='+encodeURIComponent(page.data.nextCursor))).status,409);
  f.context.registry.revision='academic-v1:'+('c'.repeat(64));assert.equal((await call(f,'/programs?cursor='+encodeURIComponent(page.data.nextCursor))).status,409);
  assert.equal((await call(f,'/programs?cursor=invalid-json')).status,400);
  assert.equal((await call(f,'/facts/not-found')).status,404);assert.equal((await call(f,'/facts/fact-policy/review')).status,405);assert.equal((await call(f,'/programs',{method:'POST',body:{}})).status,405);
  f.context.registry.programs.forEach(program=>{program.school='École 大学';});
  const multilingual=await call(f,'/programs?limit=1&school='+encodeURIComponent('大学'));assert.equal(multilingual.status,200);assert(multilingual.data.nextCursor);
  assert.equal((await call(f,'/programs?limit=1&school='+encodeURIComponent('大学')+'&cursor='+encodeURIComponent(multilingual.data.nextCursor))).status,200);
});

test('missing artifacts or unapplied review migrations fail closed without touching student records',async t=>{
  const f=fixture(t);assert.equal((await call(f,'',{context:{}})).status,503);
  const staleReport=clone(f.context);staleReport.report.registryRevision='academic-v1:'+('e'.repeat(64));assert.equal((await call(f,'',{context:staleReport})).status,503,'A report from another registry revision cannot be paired with current facts');
  assert.equal((await call(f,'',{env:{...f.env,DB:undefined}})).status,503);
  f.sqlite.exec('DROP TABLE academic_fact_review_events; DROP TABLE academic_fact_reviews');
  const result=await call(f);assert.equal(result.status,503);assert(!JSON.stringify(result.data).includes('no such table'));
  assert.equal(f.sqlite.prepare('SELECT title FROM portal_plans').get().title,'PRIVATE STUDENT TRANSCRIPT');
});

test('compact index summary, paginated programs and impact queue never fetch full evidence shards',async t=>{
  const f=fixture(t),s=shard(f),indexBefore=JSON.stringify(f.context.registry);
  for(const path of ['','/programs?limit=1','/queue?limit=1'])assert.equal((await call(f,path)).status,200,path);
  assert.equal(s.calls.length,0);assert.equal(JSON.stringify(f.context.registry),indexBefore);
  const context=async()=>f.context;
  assert.equal((await call(f,'/facts/fact-policy',{env:{...f.env,PORTAL_USER:null},context})).status,401);
  assert.equal((await call(f,'/programs/liberty-business',{env:{...f.env,PORTAL_USER:{id:ids.member}},context})).status,403);assert.equal(s.calls.length,0);
});

test('detail routes hydrate only their evidence dependencies without retaining payloads in shared indexes',async t=>{
  const f=fixture(t),s=shard(f),before=JSON.stringify(f.context.registry);
  const fact=await call(f,'/facts/fact-policy');assert.equal(fact.status,200);assert.equal(fact.data.fact.facts.externalMaxCredits,90);assert.equal(fact.data.fact.declaredEvidence,'conditional');assert.equal(fact.data.sources[0].metadata.kind,'university');
  assert.deepEqual(new Set(s.calls[0]),new Set([s.factPaths.get('fact-policy'),s.sourcePaths.get('source-policy')]));
  const program=await call(f,'/programs/liberty-business');assert.equal(program.status,200);assert.equal(program.data.facts.length,2);assert(program.data.facts.every(item=>item.facts));assert.equal(program.data.sources.length,2);
  assert.deepEqual(new Set(s.calls[1]),new Set([s.factPaths.get('fact-policy'),s.factPaths.get('fact-course'),s.sourcePaths.get('source-policy'),s.sourcePaths.get('source-course')]));
  const source=await call(f,'/sources/source-policy');assert.equal(source.status,200);assert.equal(source.data.facts.length,1);assert.equal(source.data.source.metadata.kind,'university');
  assert.deepEqual(new Set(s.calls[2]),new Set([s.sourcePaths.get('source-policy')]));assert.equal(source.data.factsAreSummaries,true);assert.equal(source.data.facts[0].facts,undefined);
  assert.equal(JSON.stringify(f.context.registry),before);assert.equal(f.context.registry.facts[0].facts,undefined);assert.equal(f.context.registry.sources[0].metadata,undefined);
  const prior=s.calls.length;await call(f,'/programs');await call(f,'/queue');assert.equal(s.calls.length,prior,'Successful detail hydration never turns list/queue requests into full-payload reads');
});

test('compact fact review validates index authority and hydrates its response before an atomic save',async t=>{
  const f=fixture(t),s=shard(f),before=JSON.stringify(f.context.registry);
  const result=await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)});assert.equal(result.status,201);assert.equal(result.data.fact.facts.externalMaxCredits,90);assert.equal(result.data.fact.declaredEvidence,'conditional');
  assert.deepEqual(s.calls,[[s.factPaths.get('fact-policy')]]);assert.equal(JSON.stringify(f.context.registry),before);assert.deepEqual(counts(f),{reviews:1,events:1});
  const blocked=await call(f,'/facts/fact-unknown/review',{method:'POST',body:review(f,{id:'fact-unknown'})});assert.equal(blocked.status,400);assert.equal(s.calls.length,1,'An unsupported compact source binding fails before hydrating or writing');
});

test('missing or mismatched shards fail closed before review writes and cannot replace index scope',async t=>{
  const f=fixture(t),s=shard(f);
  s.full.facts[0].scope={school:'wrong-school'};s.full.facts[0].sourceIds=['wrong-source'];
  const scoped=await call(f,'/facts/fact-policy');assert.equal(scoped.status,200);assert.equal(scoped.data.fact.scope.school,'liberty');assert.deepEqual(scoped.data.fact.sourceIds,['source-policy']);
  s.full.facts[0].evidenceFingerprint='f'.repeat(64);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,503);assert.deepEqual(counts(f),{reviews:0,events:0});
  s.full.facts[0].evidenceFingerprint=f.context.registry.facts[0].evidenceFingerprint;s.full.sources[0].metadataDigest='0'.repeat(64);
  assert.equal((await call(f,'/sources/source-policy')).status,503);
  delete f.context.loadEvidence;assert.equal((await call(f)).status,200);assert.equal((await call(f,'/facts/fact-policy')).status,503);
  f.context.loadEvidence=async()=>({facts:[],sources:[]});assert.equal((await call(f,'/facts/fact-policy')).status,503);
  f.context.registry.facts[0].detailPath='https://attacker.example/private';const before=s.calls.length;assert.equal((await call(f,'/facts/fact-policy')).status,503);assert.equal(s.calls.length,before);
});

test('interned scopes and compact source bindings expand exactly without authority or provenance loss',async t=>{
  const f=fixture(t),s=shard(f),originalScope=clone(f.context.registry.facts[0].scope);
  f.context.registry.scopes=f.context.registry.facts.map((fact,index)=>({id:'scope-'+index,...fact.scope}));
  f.context.registry.facts.forEach((fact,index)=>{fact.scope={$ref:'scope-'+index};fact.sourceBinding={bound:fact.sourceBinding.bound,missingReferenceCount:fact.sourceBinding.missingLocalSourceIds.length};});
  const before=JSON.stringify(f.context.registry);
  s.full.facts[0].scope={school:'wrong-school'};
  const detail=await call(f,'/facts/fact-policy');assert.equal(detail.status,200);assert.deepEqual(detail.data.fact.scope,originalScope);assert.equal(detail.data.fact.scope.id,undefined);assert.equal(detail.data.fact.sourceBinding.bound,true);assert.deepEqual(detail.data.fact.sourceBinding.missingLocalSourceIds,[]);
  const unknown=await call(f,'/facts/fact-unknown');assert.equal(unknown.status,200);assert.equal(unknown.data.fact.sourceBinding.missingReferenceCount,1);assert.deepEqual(unknown.data.fact.sourceBinding.missingLocalSourceIds,['missing-source']);
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f)})).status,201);assert.equal(JSON.stringify(f.context.registry),before);
  const compact=f.context.registry.facts[0];compact.sourceBinding={bound:true,missingReferenceCount:1};
  assert.equal((await call(f,'/facts/fact-policy/review',{method:'POST',body:review(f,{revision:1})})).status,400,'A contradictory compact missing-reference count cannot be bypassed by a support checkbox');
  compact.scope={$ref:'scope-does-not-exist'};assert.equal((await call(f,'/facts/fact-policy')).status,503);
});
