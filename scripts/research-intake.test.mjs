import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {REPOSITORY,INTAKE_PATH,submissionsFromSnapshot,validateSubmission,leadsFromSubmission,importSnapshot,loadLedger,buildIndexes,emptyReview,validateReview,appendReview,retainReceipt,digest,fetchSnapshot,issueFromEvent,publicURL} from './research-intake.mjs';

const AS_OF='2026-11-27';
const claim='Verify tuition without accepting a rumor. https://www.umpi.edu/yourpace/tuition/';
function snapshot(){return {repository:REPOSITORY,issue:{number:56,comments:1,html_url:'https://github.com/'+REPOSITORY+'/issues/56',title:'Weekly research intake — 2026-11-27 — verify and implement',body:'## P0\n- [ ] '+claim,user:{login:'owner'},created_at:'2026-11-27T16:00:00Z',updated_at:'2026-11-27T16:00:00Z'},comments:[{id:123,html_url:'https://github.com/'+REPOSITORY+'/issues/56#issuecomment-123',body:'Editorial scope: verify before publishing. $(touch /tmp/should-never-run)',user:{login:'owner'},created_at:null,updated_at:null}]};}
async function temp(t){const root=await mkdtemp(join(tmpdir(),'research-intake-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function reviewFor(value){const finding=typeof value==='string'?null:value;return {...emptyReview(finding?.id||value),sourceRevisions:finding?[...new Set(finding.origins.map(origin=>origin.revision))]:['a'.repeat(64)],reviewer:'Local test reviewer',reviewedOn:AS_OF,followUpOn:'2026-12-04',summary:'Unverified intake remains on watch pending independent primary-source review.',status:'watch'};}
const evidence={id:'official-tuition',url:'https://www.umpi.edu/yourpace/tuition/',title:'Official tuition source',kind:'university',checkedOn:AS_OF,quote:'An exact source excerpt must be reviewed before publishing.',capturePath:null,contentHash:null};

test('committed intake indexes match immutable submissions and review history',async()=>{await buildIndexes(undefined,{check:true});});
test('retained native research evidence matches its byte-hash manifests',async()=>{
 const root=join(import.meta.dirname,'..'),retained=new Set();
 for(const folder of await readdir(join(root,INTAKE_PATH,'evidence'),{withFileTypes:true})){
  if(!folder.isDirectory())continue;
  const prefix=INTAKE_PATH+'/evidence/'+folder.name+'/',manifest=JSON.parse(await readFile(join(root,prefix,'retention-manifest.json'),'utf8'));
  assert.equal(manifest.publicationAllowed,false);assert.ok(manifest.files.length>0);
  for(const item of manifest.files){assert.ok(item.retainedPath.startsWith(prefix));const bytes=await readFile(join(root,item.retainedPath));assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);JSON.parse(bytes);retained.add(item.retainedPath);}
 }
 for(const finding of (await loadLedger(root)).findings)for(const path of finding.review.receiptPaths)assert.ok(retained.has(path),'Review receipt must be retained with its byte hash: '+path);
});

test('imports all issue/comment bodies as inert immutable revisions and deterministic indexes',async t=>{
 const root=await temp(t),input=snapshot(),first=await importSnapshot(input,{root,asOf:AS_OF});
 assert.equal(first.submissionRevisions,2);assert.equal(first.findings.length,2);
 assert.equal(first.findings.find(item=>item.kind==='context').claim,input.comments[0].body);
 assert.ok(first.findings.every(item=>item.review.triage==='WATCH'&&item.review.verifiedOn===null));
 const second=await importSnapshot(input,{root,asOf:AS_OF});assert.equal(second.revision,first.revision);
 const before=await readFile(join(root,INTAKE_PATH,'findings.json'),'utf8');
 await buildIndexes(root,{check:true,asOf:AS_OF});assert.equal(await readFile(join(root,INTAKE_PATH,'findings.json'),'utf8'),before);
 assert.equal((await readdir(join(root,INTAKE_PATH,'submissions'))).length,2);
});
test('edited submissions preserve old content and exact duplicate leads deduplicate across issues/comments',async t=>{
 const root=await temp(t),input=snapshot();await importSnapshot(input,{root,asOf:AS_OF});
 input.issue.body+='\n- [ ] New distinct lead.';input.issue.updated_at='2026-11-27T17:00:00Z';
 const changed=await importSnapshot(input,{root,asOf:AS_OF});assert.equal(changed.submissionRevisions,3);assert.equal(changed.findings.length,3);
 assert.equal(changed.findings.find(item=>item.claim===claim).origins.length,2);
 const future=snapshot();future.issue.number=57;future.issue.html_url='https://github.com/'+REPOSITORY+'/issues/57';future.comments[0].id=124;future.comments[0].html_url='https://github.com/'+REPOSITORY+'/issues/57#issuecomment-124';
 const merged=await importSnapshot(future,{root,asOf:AS_OF});assert.equal(merged.findings.length,3);assert.equal(merged.findings.find(item=>item.claim===claim).origins.length,3);
 future.issue.title='A labeled research submission';future.issue.labels=[{name:'weekly-research'}];await importSnapshot(future,{root,asOf:AS_OF});
 const old=JSON.parse(await readFile(join(root,INTAKE_PATH,'submissions',submissionsFromSnapshot(snapshot())[0].revision+'.json'),'utf8'));
 assert.equal(old.content.body,snapshot().issue.body);
});
test('validates every snapshot entry before writing and rejects mismatched identities',async t=>{
 const root=await temp(t),input=snapshot();input.comments[0].id='../../outside';
 await assert.rejects(importSnapshot(input,{root,asOf:AS_OF}),/comment ID/);assert.deepEqual(await readdir(root),[]);
 const wrong=snapshot();wrong.comments[0].html_url='https://github.com/'+REPOSITORY+'/issues/999#issuecomment-123';
 assert.throws(()=>submissionsFromSnapshot(wrong),/does not match/);
 const record=submissionsFromSnapshot(snapshot())[0];record.content.body+='changed';assert.throws(()=>validateSubmission(record),/hash/);
 const missing=snapshot();delete missing.comments;assert.throws(()=>submissionsFromSnapshot(missing),/complete comments/);
});
test('tampered immutable content, index drift and forked review chains fail closed',async t=>{
 const root=await temp(t),ledger=await importSnapshot(snapshot(),{root,asOf:AS_OF}),finding=ledger.findings[0];
 const first=reviewFor(finding);await appendReview(first,{root,asOf:AS_OF});
 assert.equal((await appendReview(first,{root,asOf:AS_OF})).reviewRevisions,1);
 const stale={...first,summary:'Different review with a stale revision.'};await assert.rejects(appendReview(stale,{root,asOf:AS_OF}),/Review changed/);
 const second={...first,revision:2,previousReviewHash:digest(first),summary:'An additional dated review preserves the original decision.'};
 const updated=await appendReview(second,{root,asOf:AS_OF});assert.equal(updated.reviewRevisions,2);
 assert.equal((await appendReview(first,{root,asOf:AS_OF})).reviewRevisions,2);
 await writeFile(join(root,INTAKE_PATH,'inbox.json'),'{}\n');await assert.rejects(buildIndexes(root,{check:true,asOf:AS_OF}),/Stale/);
 const submission=submissionsFromSnapshot(snapshot())[0],path=join(root,INTAKE_PATH,'submissions',submission.revision+'.json');submission.content.body='Tampered';await writeFile(path,JSON.stringify(submission));
 await assert.rejects(loadLedger(root,{asOf:AS_OF}),/hash/);
});
test('only observed primary evidence can ready work and future/unknown dates remain distinct',()=>{
 const record=reviewFor('finding-'+'a'.repeat(64));record.triage='PRODUCT';record.status='ready-for-review';record.product.status='review-ready';
 assert.throws(()=>validateReview(record,{asOf:AS_OF}),/primary evidence/);
 record.verifiedOn=AS_OF;record.evidence=[evidence];validateReview(record,{asOf:AS_OF});
 record.changeKind='new-policy';assert.throws(()=>validateReview(record,{asOf:AS_OF}),/announcement and effective/);
 record.announcedOn=AS_OF;record.effectiveOn='2026-12-28';validateReview(record,{asOf:AS_OF});
 record.verifiedOn='2026-11-28';assert.throws(()=>validateReview(record,{asOf:AS_OF}),/Verification/);
 record.verifiedOn=AS_OF;record.announcedOn='2026-11-28';assert.throws(()=>validateReview(record,{asOf:AS_OF}),/announcement/);
});
test('separate ACE/residency quantities and equivalencies require receiving-university evidence',()=>{
 const record=reviewFor('finding-'+'b'.repeat(64));record.evidence=[{...evidence,kind:'provider'}];
 record.facts.transfer.aceCap={credits:90,creditSystem:'semester',scope:'Exact program only',evidenceIds:[evidence.id]};
 assert.throws(()=>validateReview(record,{asOf:AS_OF}),/receiving-university/);
 record.evidence=[evidence];validateReview(record,{asOf:AS_OF});
 record.facts.transfer.residency={credits:30,creditSystem:'quarter',scope:'Different unit is retained explicitly',evidenceIds:['missing']};
 assert.throws(()=>validateReview(record,{asOf:AS_OF}),/existing evidence/);
 record.facts.transfer.residency=null;record.facts.transfer.combinedCplCap={credits:30,creditSystem:'semester',scope:'Combined CPL category, not an independently established ACE-only cap',evidenceIds:[evidence.id]};record.facts.transfer.externallyAssessedCap={credits:135,creditSystem:'quarter',scope:'Computed external prior-learning category ceiling, not an applicable course allocation',evidenceIds:[evidence.id]};validateReview(record,{asOf:AS_OF});
});
test('editorial readiness requires URL/metadata, primary citations, overlap audit and useful internal links',()=>{
 const record=reviewFor('finding-'+'c'.repeat(64));record.triage='BOTH';record.status='implemented';record.product.status='implemented';record.evidence=[evidence];record.verifiedOn=AS_OF;
 assert.throws(()=>validateReview(record,{asOf:AS_OF}),/both required tracks/);
 Object.assign(record.editorial,{status:'review-ready',proposedUrls:['https://degreesteps.com/guides/example/'],title:'A verified degree guide',metaDescription:'A substantive description with reviewed details.',canonicalUrl:'https://degreesteps.com/guides/example/',internalLinks:['https://degreesteps.com/degree-plans/'],studentUsefulness:'Explains degree decisions.',searchIntent:'Compare receiving-school policies.',overlapNotes:'Existing guide updated in place.',evidenceIds:[evidence.id]});
 validateReview(record,{asOf:AS_OF});record.editorial.canonicalUrl='https://example.com/';assert.throws(()=>validateReview(record,{asOf:AS_OF}),/Canonical/);
});
test('receiving fetches every comments page, preserves full bodies and never follows API redirects',async()=>{
 const calls=[],input=snapshot(),comments=Array.from({length:100},(_,index)=>({...input.comments[0],id:index+1,html_url:'https://github.com/'+REPOSITORY+'/issues/56#issuecomment-'+(index+1)}));input.issue.comments=101;
 const result=await fetchSnapshot(56,{token:'test-token',fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(calls.length===1?input.issue:calls.length===2?comments:[{...input.comments[0],id:101,html_url:'https://github.com/'+REPOSITORY+'/issues/56#issuecomment-101'}]),{status:200});}});
 assert.equal(result.comments.length,101);assert.equal(calls.length,3);assert.ok(calls[2].url.endsWith('page=2'));assert.ok(calls.every(call=>call.options.redirect==='error'&&call.url.startsWith('https://api.github.com/repos/'+REPOSITORY+'/issues/56')));
 await assert.rejects(fetchSnapshot(56,{token:'test',fetchImpl:async()=>new Response('{}',{status:403})}),/HTTP 403/);
});
test('event scope rejects PRs/unrelated issues/repositories and malicious manual issue values',()=>{
 const event={repository:{full_name:REPOSITORY},issue:snapshot().issue,action:'created'};
 assert.equal(issueFromEvent(event,'issue_comment'),56);event.issue={...event.issue,number:57,title:'Unrelated issue'};assert.equal(issueFromEvent(event,'issues'),null);
 event.issue={...snapshot().issue,pull_request:{url:'not-an-intake'}};assert.equal(issueFromEvent(event,'issue_comment'),null);
 event.issue={...snapshot().issue,number:57,html_url:'https://github.com/'+REPOSITORY+'/issues/57',title:'Research submitted with marker',body:'<!-- degreesteps-research-intake:v1 -->\n- [ ] Verify a scoped policy.'};assert.equal(issueFromEvent(event,'issue_comment'),57);submissionsFromSnapshot({repository:REPOSITORY,issue:event.issue,comments:snapshot().comments.map(comment=>({...comment,html_url:'https://github.com/'+REPOSITORY+'/issues/57#issuecomment-'+comment.id}))}).forEach(validateSubmission);
 assert.throws(()=>issueFromEvent({repository:{full_name:'attacker/repo'}},'issues'),/repository/);
 assert.throws(()=>issueFromEvent({repository:{full_name:REPOSITORY},inputs:{issue_number:'56; touch /tmp/executed'}},'workflow_dispatch'),/issue number/);
 for(const url of ['https://127.0.0.1/','https://localhost/','https://user:pass@example.com/','https://example.com:444/','https://example.com/%0aheader'])assert.throws(()=>publicURL(url),/URL/);
});
test('Markdown URL discovery remains unverified and never counts credentials or markup as proof',()=>{
 const record=submissionsFromSnapshot(snapshot())[0],lead=leadsFromSubmission(record)[0];assert.deepEqual(lead.sourceUrls,['https://www.umpi.edu/yourpace/tuition/']);assert.equal(emptyReview(lead.id).verifiedOn,null);
});
test('known comment counts prevent partial imports and contextual headings separate generic claims',()=>{
 const input=snapshot();input.issue.comments=7;assert.throws(()=>submissionsFromSnapshot(input),/complete comments/);
 input.issue.comments=1;input.issue.body='## UMPI\n- [ ] Verify tuition.';const first=leadsFromSubmission(submissionsFromSnapshot(input)[0])[0];
 input.issue.body='## WGU\n- [ ] Verify tuition.';const second=leadsFromSubmission(submissionsFromSnapshot(input)[0])[0];assert.notEqual(first.id,second.id);
 input.issue.body='## UMPI\n### P0\n- [ ] Verify tuition.';const nested=leadsFromSubmission(submissionsFromSnapshot(input)[0])[0];assert.equal(nested.id,first.id);
});
test('concurrent review writes cannot leave a forked durable ledger',async t=>{
 const root=await temp(t),ledger=await importSnapshot(snapshot(),{root,asOf:AS_OF}),finding=ledger.findings[0],first=reviewFor(finding);
 const results=await Promise.allSettled([appendReview(first,{root,asOf:AS_OF}),appendReview({...first,summary:'A competing decision must retry.'},{root,asOf:AS_OF})]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await loadLedger(root,{asOf:AS_OF})).reviewRevisions,1);
});
test('an unchanged claim in edited source context reopens an otherwise processed finding',async t=>{
 const root=await temp(t),input=snapshot(),ledger=await importSnapshot(input,{root,asOf:AS_OF}),finding=ledger.findings.find(item=>item.kind==='lead');
 await appendReview({...reviewFor(finding),status:'no-action'},{root,asOf:AS_OF});input.issue.body+='\nImportant new context requiring review.';input.issue.updated_at='2026-11-27T18:00:00Z';
 const updated=await importSnapshot(input,{root,asOf:AS_OF}),item=updated.findings.find(row=>row.id===finding.id);assert.equal(item.requiresReverification,true);assert.equal(item.reviewCurrent,false);
 const processed=JSON.parse(await readFile(join(root,INTAKE_PATH,'processed.json'),'utf8')),inbox=JSON.parse(await readFile(join(root,INTAKE_PATH,'inbox.json'),'utf8'));assert.ok(!processed.findingIds.includes(item.id));assert.ok(inbox.findingIds.includes(item.id));
});
test('metadata corrections preserve the claim and historical disposition without inventing a policy change',async t=>{
 const root=await temp(t),input=snapshot(),ledger=await importSnapshot(input,{root,asOf:AS_OF}),finding=ledger.findings.find(item=>item.kind==='context');
 const saved={...reviewFor(finding),status:'no-action',changeKind:'newly-discovered-existing-policy'};await appendReview(saved,{root,asOf:AS_OF});
 input.comments[0].created_at='2026-11-27T16:01:00Z';input.comments[0].updated_at='2026-11-27T16:01:00Z';
 const updated=await importSnapshot(input,{root,asOf:AS_OF}),item=updated.findings.find(row=>row.id===finding.id);
 assert.equal(updated.findings.length,2);assert.equal(updated.submissionRevisions,3);assert.equal(item.origins.length,2);assert.equal(item.requiresReverification,true);assert.deepEqual(item.review,saved);assert.notEqual(item.review.changeKind,'new-policy');
});
test('native receipt retention preserves exact bytes, deduplicates replay and refuses changed retained bytes',async t=>{
 const root=await temp(t),source=join(root,'native-receipt.json'),raw='{\n  "body": "Untrusted source text stays JSON data. $(touch nowhere)"\n}\n';await writeFile(source,raw);
 const first=await retainReceipt(source,{root,issueNumber:56,asOf:AS_OF});assert.equal(first.sha256,createHash('sha256').update(raw).digest('hex'));assert.equal(await readFile(join(root,first.retainedPath),'utf8'),raw);assert.equal(first.replayed,false);
 const replay=await retainReceipt(source,{root,issueNumber:56,asOf:AS_OF});assert.equal(replay.replayed,true);assert.equal(replay.retainedPath,first.retainedPath);
 await writeFile(source,'{"body":"A new rendered extraction is a new immutable receipt."}\n');const second=await retainReceipt(source,{root,issueNumber:56,asOf:AS_OF});assert.notEqual(second.retainedPath,first.retainedPath);assert.equal(await readFile(join(root,first.retainedPath),'utf8'),raw);
 const manifest=JSON.parse(await readFile(join(root,INTAKE_PATH,'evidence/issue56/retention-manifest.json'),'utf8'));assert.equal(manifest.files.length,2);assert.ok(manifest.files.every(item=>item.originHttpStatus===null&&item.receiptKind==='connector-rendered-extraction'));
 await writeFile(join(root,first.retainedPath),'{}\n');await assert.rejects(retainReceipt(source,{root,issueNumber:56,asOf:AS_OF}),/no longer match/);
});
