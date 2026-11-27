/** Offline orchestration proof. GitHub, verification and deployment receipts
 * below are synthetic; this test cannot publish or certify a live release. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {REPOSITORY,INTAKE_PATH,fetchSnapshot,importSnapshot,emptyReview,appendReview,retainReceipt,buildIndexes,loadLedger,validateReview,digest} from './research-intake.mjs';
const DAY='2026-11-27',ARTICLE='https://degreesteps.com/blog/asu-source-planning-fixture/',SHA='a'.repeat(40);
const github='https://github.com/'+REPOSITORY;
function snapshot(){return{repository:REPOSITORY,issue:{number:900,comments:1,html_url:github+'/issues/900',title:'Weekly research intake — offline end-to-end fixture',body:'## ASU Universal Learner\n- [ ] Verify course posting costs and explain the student decision. https://ea.asu.edu/how-it-works/pricing/',user:{login:'fixture-researcher'},created_at:'2026-11-27T10:00:00Z',updated_at:'2026-11-27T10:00:00Z'},comments:[{id:901,html_url:github+'/issues/900#issuecomment-901',body:'Editorial scope: explain the exact purchase structure before enrollment. This remains unverified intake.',user:{login:'fixture-editor'},created_at:null,updated_at:null}]};}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'research-intake-e2e-'));t.after(()=>rm(root,{recursive:true,force:true}));const input=snapshot(),ledger=await importSnapshot(input,{root,asOf:DAY});return{root,input,ledger,finding:ledger.findings.find(row=>row.kind==='lead')};}
function ready(finding){return{...emptyReview(finding.id),sourceRevisions:[...new Set(finding.origins.map(origin=>origin.revision))],reviewer:'Synthetic offline verification fixture',reviewedOn:DAY,verifiedOn:DAY,followUpOn:'2026-12-04',triage:'BOTH',status:'ready-for-review',changeKind:'confirmation',summary:'A fixture models independently verified source facts, a product update and substantive editorial work before a release.',evidence:[{id:'asu-price',url:'https://ea.asu.edu/how-it-works/pricing/',title:'Official source fixture',kind:'provider',checkedOn:DAY,quote:'$25 enrollment plus optional $400 credit posting; acceptance is separately evaluated.',capturePath:null,contentHash:null}],product:{status:'review-ready',paths:['content/fixture-product.json'],notes:'The source fact changes only fixture product data; no academic model or student award.'},editorial:{...emptyReview(finding.id).editorial,status:'review-ready',proposedUrls:[ARTICLE],canonicalUrl:ARTICLE,title:'ASU course posting: what the purchase means',metaDescription:'Understand enrollment, credit posting and receiving-school applicability before purchasing a course.',internalLinks:['https://degreesteps.com/credit-sources/asu-ulc/'],studentUsefulness:'Separates course access, optional posting and degree applicability.',searchIntent:'Understand ASU credit-posting costs.',overlapNotes:'A newly written fixture article addresses this exact purchase decision.',evidenceIds:['asu-price'],structuredData:true,sitemap:true}};}
async function retained(root,name,value){const path=join(root,name+'.json');await writeFile(path,JSON.stringify({...value,syntheticOfflineFixture:true},null,2)+'\n');return retainReceipt(path,{root,issueNumber:900,asOf:DAY,kind:'curated-research-packet'});}
const release=receiptPath=>({environment:'production',commitSha:SHA,pullRequestUrl:github+'/pull/902',workflowRunUrl:github+'/actions/runs/903',verifiedOn:DAY,approval:'Synthetic offline fixture of an explicitly authorized operator release; no real deployment was executed.',verifiedUrls:[ARTICLE],receiptPaths:[receiptPath]});

test('mock GitHub intake reaches product plus editorial readiness, approved release evidence and edit reverification',async t=>{
 const f=await fixture(t),calls=[];
 const received=await fetchSnapshot(900,{token:'synthetic-test-token',fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return new Response(JSON.stringify(url.includes('/comments?')?f.input.comments:f.input.issue));}});
 assert.equal(calls.length,2);assert.equal((await importSnapshot(received,{root:f.root,asOf:DAY})).revision,f.ledger.revision);
 assert(f.ledger.findings.every(row=>row.review.verifiedOn===null&&row.review.editorial.status==='unassessed'));
 const product=JSON.stringify({provider:'ASU Universal Learner',enrollmentUSD:25,optionalPostingUSD:400,receivingAwardEstablished:false})+'\n';
 const article='<article><h1>ASU course posting: what the purchase means</h1><p>Enrollment costs $25. Posting a successfully completed course adds $400. The receiving college separately decides degree applicability.</p><a href="https://ea.asu.edu/how-it-works/pricing/">Official pricing</a></article>\n';
 await mkdir(join(f.root,'content'),{recursive:true});await writeFile(join(f.root,'content/fixture-product.json'),product);await writeFile(join(f.root,'fixture-article.html'),article);
 const research=await retained(f.root,'native-source',{sourceUrl:'https://ea.asu.edu/how-it-works/pricing/',quote:ready(f.finding).evidence[0].quote});
 const prepared={...ready(f.finding),receiptPaths:[research.retainedPath]};await appendReview(prepared,{root:f.root,asOf:DAY});
 const staging=await retained(f.root,'staging-check',{environment:'staging',commitSha:SHA,testsPassed:true,hostedStatus:200,articleSha256:createHash('sha256').update(article).digest('hex')});
 const staged={...prepared,revision:2,previousReviewHash:digest(prepared),status:'implemented',product:{...prepared.product,status:'implemented'},receiptPaths:[research.retainedPath,staging.retainedPath]};
 const stagedLedger=await appendReview(staged,{root:f.root,asOf:DAY});assert.equal(stagedLedger.findings.find(row=>row.id===f.finding.id).review.editorial.status,'review-ready');assert.deepEqual(staged.editorial.publishedUrls,[]);
 const falsePublished={...staged,editorial:{...staged.editorial,status:'published',publishedUrls:[ARTICLE]},release:{...release(staging.retainedPath),environment:'staging'}};assert.throws(()=>validateReview(falsePublished,{asOf:DAY}),/production commit/);
 const production=await retained(f.root,'approved-production-verification',{environment:'production',commitSha:SHA,pullRequestUrl:github+'/pull/902',workflowRunUrl:github+'/actions/runs/903',approvedOperatorFixture:true,verifiedUrls:[ARTICLE],getStatus:200,articleSha256:createHash('sha256').update(article).digest('hex')});
 const published={...staged,revision:3,previousReviewHash:digest(staged),editorial:{...staged.editorial,status:'published',publishedUrls:[ARTICLE]},release:release(production.retainedPath)};
 const final=await appendReview(published,{root:f.root,asOf:DAY});await buildIndexes(f.root,{check:true,asOf:DAY});assert.equal(final.reviewRevisions,3);assert.equal((await importSnapshot(received,{root:f.root,asOf:DAY})).revision,final.revision);
 const processed=JSON.parse(await readFile(join(f.root,INTAKE_PATH,'processed.json'),'utf8'));assert(processed.findingIds.includes(f.finding.id));assert.equal(final.findings.find(row=>row.kind==='context').reviewCurrent,false,'Editorial comments require their own triage.');
 f.input.issue.updated_at='2026-11-27T11:00:00Z';const repaired=await importSnapshot(f.input,{root:f.root,asOf:DAY});assert.equal(repaired.findings.find(row=>row.id===f.finding.id).reviewCurrent,true);
 f.input.issue.body+='\nA new eligibility restriction must now be checked.';const changed=await importSnapshot(f.input,{root:f.root,asOf:DAY}),item=changed.findings.find(row=>row.id===f.finding.id);assert.equal(item.reviewCurrent,false);assert.equal(item.requiresReverification,true);assert.deepEqual(item.review.release,published.release);
 assert.equal(await readFile(join(f.root,'content/fixture-product.json'),'utf8'),product);assert.equal(await readFile(join(f.root,'fixture-article.html'),'utf8'),article,'Intake cannot mutate or republish a product or article.');
});
test('missing or unmanifested receipt paths reject before an immutable review is written',async t=>{
 const f=await fixture(t),receipt=await retained(f.root,'source',{observed:'A synthetic official source extraction.'}),review={...ready(f.finding),receiptPaths:[receipt.retainedPath]};
 const missing={...review,receiptPaths:[INTAKE_PATH+'/evidence/issue900/'+'0'.repeat(64)+'.json']};await assert.rejects(appendReview(missing,{root:f.root,asOf:DAY}),/verified retention manifest/);
 const unmanifested=INTAKE_PATH+'/evidence/issue900/unmanifested.json';await writeFile(join(f.root,unmanifested),'{}\n');await assert.rejects(appendReview({...review,receiptPaths:[unmanifested]},{root:f.root,asOf:DAY}),/verified retention manifest/);
 assert.equal((await loadLedger(f.root,{asOf:DAY})).reviewRevisions,0);await assert.rejects(readdir(join(f.root,INTAKE_PATH,'reviews')),/ENOENT/);
 const published={...review,editorial:{...review.editorial,status:'published',publishedUrls:[ARTICLE]},release:release(unmanifested)};await assert.rejects(appendReview(published,{root:f.root,asOf:DAY}),/verified retention manifest/);
});
test('retained-byte tampering makes ledger loading and CLI index checks fail closed',async t=>{
 const f=await fixture(t),receipt=await retained(f.root,'source',{observed:'A synthetic official source extraction.'});await appendReview({...ready(f.finding),receiptPaths:[receipt.retainedPath]},{root:f.root,asOf:DAY});
 await writeFile(join(f.root,receipt.retainedPath),'{}\n');await assert.rejects(loadLedger(f.root,{asOf:DAY}),/bytes no longer match/);await assert.rejects(buildIndexes(f.root,{check:true,asOf:DAY}),/bytes no longer match/);
});
test('legitimate nested receipts work while symlink ancestors reject before following an outside file',async t=>{
 const f=await fixture(t),receipt=await retained(f.root,'source',{observed:'A synthetic official source extraction.'}),manifestPath=join(f.root,INTAKE_PATH,'evidence/issue900/retention-manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const nested=INTAKE_PATH+'/evidence/issue900/captures/source.json',directory=join(f.root,INTAKE_PATH,'evidence/issue900/captures');await mkdir(directory);await writeFile(join(f.root,nested),await readFile(join(f.root,receipt.retainedPath)));manifest.files[0].retainedPath=nested;await writeFile(manifestPath,JSON.stringify(manifest)+'\n');
 await appendReview({...ready(f.finding),receiptPaths:[nested]},{root:f.root,asOf:DAY});await buildIndexes(f.root,{check:true,asOf:DAY});
 await rm(directory,{recursive:true});const outside=join(f.root,'outside-evidence');await mkdir(outside);await writeFile(join(outside,'source.json'),'An outside file must never be read as a receipt.');await symlink(outside,directory,'dir');
 await assert.rejects(loadLedger(f.root,{asOf:DAY}),/ancestors.*without symlinks/);await assert.rejects(retained(f.root,'another-source',{observed:'Another fixture.'}),/ancestors.*without symlinks/);
});
test('live publication needs every release field and the same repository and verified URL set',async t=>{
 const f=await fixture(t),valid={...ready(f.finding),editorial:{...ready(f.finding).editorial,status:'published',publishedUrls:[ARTICLE]},release:release(INTAKE_PATH+'/evidence/issue900/'+'a'.repeat(64)+'.json')};validateReview(valid,{asOf:DAY});
 for(const change of [r=>delete r.release,r=>r.release.environment='staging',r=>r.release.commitSha='short',r=>r.release.pullRequestUrl='https://github.com/unrelated/repo/pull/1',r=>r.release.workflowRunUrl=github+'/actions/runs/0',r=>r.release.verifiedOn='2026-11-28',r=>r.release.approval='',r=>r.release.receiptPaths=[],r=>r.release.receiptPaths=['../outside.json'],r=>r.release.verifiedUrls=['https://degreesteps.com/blog/unverified/'],r=>r.release.verifiedUrls=['https://other.example/article/']]){const changed=structuredClone(valid);change(changed);assert.throws(()=>validateReview(changed,{asOf:DAY}));}
});
