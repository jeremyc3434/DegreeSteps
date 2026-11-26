import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {buildSchoolResearchBatch,captureBatch,captureSource,officialURL,schoolConfigurations,readVerifiedSchoolCaptures} from './scripts/build-school-research-batch.mjs';
import {captureJobFingerprint} from './scripts/pathway-factory/school-capture-ledger.mjs';

const date='2026-11-26T12:00:00.000Z';
const digest=body=>'sha256:'+createHash('sha256').update(body).digest('hex');
function fixture(count=3){
  const sources=Array.from({length:count},(_,index)=>({id:'source-'+index,url:'https://www.liberty.edu/evidence/'+index,roles:['model-evidence'],modelIds:['model-'+index]}));
  return {schemaVersion:1,revision:'fixture-v1',school:structuredClone(schoolConfigurations.liberty),modality:'online',sources,jobs:sources.map(source=>({id:'capture-'+source.id,sourceId:source.id,url:source.url,inputFingerprint:'input-v1'}))};
}
function captured(source,body=Buffer.from(source.url)){
  return {body,receipt:{schemaVersion:1,sourceId:source.id,url:source.url,finalUrl:source.url,redirects:[],status:'captured',sourceContentHash:digest(body),capturedAt:date,bytes:body.length,contentType:'text/plain',reviewStatus:'unreviewed',evidenceEffect:'none'}};
}
async function temp(run){const dir=await mkdtemp(join(tmpdir(),'degreesteps-capture-ledger-'));try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const readLedger=async dir=>JSON.parse(await readFile(join(dir,'capture-ledger.json'),'utf8'));
const writeLedger=async(dir,ledger)=>writeFile(join(dir,'capture-ledger.json'),JSON.stringify(ledger));

test('resume advances beyond the first batch and verifies saved raw evidence before reuse',()=>temp(async outputDir=>{
  const manifest=fixture(5),before=JSON.stringify(manifest),calls=[];const capture=async source=>{calls.push(source.id);return captured(source);};
  const first=await captureBatch(manifest,{outputDir,limit:2,capture});assert.equal(first.capturedSources,2);assert.equal(first.remainingJobs,3);
  const second=await captureBatch(manifest,{outputDir,limit:2,capture});assert.equal(second.capturedSources,2);assert.equal(second.reusedSources,2);assert.equal(second.remainingJobs,1);
  const third=await captureBatch(manifest,{outputDir,limit:2,capture});assert.equal(third.capturedSources,1);assert.equal(third.reusedSources,4);
  const fourth=await captureBatch(manifest,{outputDir,capture});assert.equal(fourth.capturedSources,0);assert.equal(fourth.reusedSources,5);assert.equal(fourth.remainingJobs,0);assert.equal(calls.length,5);
  assert.equal(JSON.stringify(manifest),before);
  const evidence=await readVerifiedSchoolCaptures(manifest,{outputDir});assert.equal(evidence.length,5);
  for(const item of evidence){assert.equal(item.sourceContentHash,digest(item.rawBody));assert.equal(item.text,item.sourceUrl);assert.equal(item.capturedAt,date);assert.equal(item.reviewStatus,'unreviewed');assert.equal(item.evidenceEffect,'none');assert(!Object.hasOwn(item,'reviewedAt'));}
}));

test('failures do not starve later queued sources and are retried only when requested',()=>temp(async outputDir=>{
  const manifest=fixture(),calls=[];let fail=true;const capture=async source=>{calls.push(source.id);if(source.id==='source-0'&&fail)throw new Error('HTTP 503');return captured(source);};
  const first=await captureBatch(manifest,{outputDir,limit:2,capture});assert.equal(first.failedSources,1);
  const second=await captureBatch(manifest,{outputDir,limit:2,capture});assert.equal(second.capturedSources,1);assert.equal(second.deferredFailedSources,1);assert.equal(calls.filter(id=>id==='source-0').length,1);
  fail=false;const third=await captureBatch(manifest,{outputDir,retryFailed:true,capture});assert.equal(third.capturedSources,1);assert.equal(third.remainingJobs,0);assert.equal((await readLedger(outputDir)).jobs['capture-source-0'].attempts,2);
}));

test('changed relevant input and URL invalidate exact jobs while unaffected captures are reused',()=>temp(async outputDir=>{
  const manifest=fixture(2);let calls=0;const capture=async source=>{calls++;return captured(source);};await captureBatch(manifest,{outputDir,capture});
  const changed=structuredClone(manifest);changed.revision='unrelated-global-revision';
  assert.equal((await captureBatch(changed,{outputDir,capture})).reusedSources,2);assert.equal(calls,2);
  changed.jobs[0].inputFingerprint='changed-policy-in-affected-model';
  const policy=await captureBatch(changed,{outputDir,capture});assert.equal(policy.invalidatedJobs,1);assert.equal(policy.capturedSources,1);assert.equal(policy.reusedSources,1);
  changed.sources[0].url+='-updated';changed.jobs[0].url=changed.sources[0].url;
  const url=await captureBatch(changed,{outputDir,capture});assert.equal(url.invalidatedJobs,1);assert.equal(url.capturedSources,1);assert.equal(url.reusedSources,1);
  const old=captureJobFingerprint(changed,changed.jobs[0]);changed.validatorRevision='validators-v2';assert.notEqual(captureJobFingerprint(changed,changed.jobs[0]),old);
  assert.equal((await captureBatch(changed,{outputDir,capture})).invalidatedJobs,2);
  changed.policyRevision='school-policy-v2';assert.equal((await captureBatch(changed,{outputDir,capture})).invalidatedJobs,2);
  const history=(await readLedger(outputDir)).jobs['capture-source-0'].history;assert(history.length>=4);assert(history.every(entry=>entry.reason==='input-changed'));
}));

test('trust-policy changes cannot silently reuse or expand official source access',()=>temp(async outputDir=>{
  const manifest=fixture(1),prior=captureJobFingerprint(manifest,manifest.jobs[0]);manifest.school.officialDomains.push('attacker.example');
  assert.notEqual(captureJobFingerprint(manifest,manifest.jobs[0]),prior);
  await assert.rejects(captureBatch(manifest,{outputDir,capture:async()=>assert.fail('must not fetch')}),/trust policy/);
  assert.equal(officialURL('https://tesu.smartcatalogiq.com/en/current/',schoolConfigurations.tesu),'https://tesu.smartcatalogiq.com/en/current/');
  assert.throws(()=>officialURL('https://other.smartcatalogiq.com/',schoolConfigurations.tesu));
  assert.throws(()=>officialURL('https://study.com/college/',schoolConfigurations.liberty));
}));

test('tampered body is never reused or overwritten as a valid immutable capture',()=>temp(async outputDir=>{
  const manifest=fixture(1);await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});
  const ledger=await readLedger(outputDir),entry=ledger.jobs['capture-source-0'],original=entry.capture;
  await writeFile(join(outputDir,original.bodyPath),'tampered');
  assert.equal((await readVerifiedSchoolCaptures(manifest,{outputDir})).length,0);
  const result=await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});assert.equal(result.reusedSources,0);assert.equal(result.invalidatedJobs,1);assert.equal(result.failedSources,1);assert.match(result.results[0].message,/Immutable/);
  assert.equal(await readFile(join(outputDir,original.bodyPath),'utf8'),'tampered');
  const retry=await captureBatch(manifest,{outputDir,retryFailed:true,capture:async source=>captured(source,Buffer.from('new source revision'))});assert.equal(retry.capturedSources,1);
  assert.equal((await readLedger(outputDir)).jobs['capture-source-0'].history[0].capture.receiptPath,original.receiptPath);
}));

test('tampered receipt triggers a new immutable receipt instead of stale reuse',()=>temp(async outputDir=>{
  const manifest=fixture(1);await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});
  const prior=(await readLedger(outputDir)).jobs['capture-source-0'].capture.receiptPath;
  await writeFile(join(outputDir,prior),'{}');
  const result=await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});assert.equal(result.invalidatedJobs,1);assert.equal(result.capturedSources,1);
  assert.notEqual((await readLedger(outputDir)).jobs['capture-source-0'].capture.receiptPath,prior);assert.equal(await readFile(join(outputDir,prior),'utf8'),'{}');
}));

test('corrupt ledger fails closed without losing the ledger or calling the network',()=>temp(async outputDir=>{
  const manifest=fixture(1);await writeFile(join(outputDir,'capture-ledger.json'),'not JSON');
  await assert.rejects(captureBatch(manifest,{outputDir,capture:async()=>assert.fail('must not fetch')}),/Cannot resume/);
  assert.equal(await readFile(join(outputDir,'capture-ledger.json'),'utf8'),'not JSON');
  await writeLedger(outputDir,{schemaVersion:1,schoolId:'liberty',modality:'online',jobs:{job:{jobId:'job',fingerprint:'x',status:'running',attempts:1}}});
  await assert.rejects(captureBatch(manifest,{outputDir,capture:async()=>assert.fail('must not fetch')}),/invalid job/);
}));

test('concurrent runners cannot capture duplicate jobs and worker concurrency remains bounded',()=>temp(async outputDir=>{
  const manifest=fixture(4);let release,started,active=0,peak=0;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  const run=captureBatch(manifest,{outputDir,limit:4,concurrency:2,capture:async source=>{active++;peak=Math.max(peak,active);if(active===2)started();await gate;active--;return captured(source);}});
  await began;
  await assert.rejects(captureBatch(manifest,{outputDir,capture:async()=>assert.fail('must not fetch')}),/leased by another runner/);
  release();assert.equal((await run).capturedSources,4);assert.equal(peak,2);
}));

test('expired abandoned runner and job leases recover without approving captured content',()=>temp(async outputDir=>{
  const manifest=fixture(1);await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});
  const ledger=await readLedger(outputDir),entry=ledger.jobs['capture-source-0'];entry.status='running';entry.lease={ownerToken:'abandoned',expiresAt:'2000-01-01T00:00:00.000Z'};await writeLedger(outputDir,ledger);
  const lock=join(outputDir,'.capture-ledger.lock');await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({token:'abandoned',host:hostname(),pid:99999999,expiresAt:'2000-01-01T00:00:00.000Z'}));
  const result=await captureBatch(manifest,{outputDir,capture:async source=>captured(source)});assert.equal(result.recoveredJobs,1);assert.equal(result.capturedSources,1);assert.equal(result.results[0].reviewStatus,'unreviewed');
}));

test('byte allocation is bounded across concurrent requests, including failed attempts',()=>temp(async outputDir=>{
  const manifest=fixture(3),allowances=[];
  const result=await captureBatch(manifest,{outputDir,limit:3,concurrency:3,maxBytes:10,maxTotalBytes:15,capture:async(source,{maxBytes})=>{allowances.push(maxBytes);return captured(source,Buffer.alloc(maxBytes,1));}});
  assert.deepEqual(allowances,[10,5]);assert.equal(result.allocatedBytes,15);assert.equal(result.capturedSources,2);assert.equal(result.remainingJobs,1);
  await assert.rejects(captureBatch(manifest,{outputDir,maxTotalBytes:161*1024*1024}),/bounded research/);
}));

test('redirect guards and receipt validation failures remain explicit failed jobs',()=>temp(async outputDir=>{
  const manifest=fixture(1);
  const failed=await captureBatch(manifest,{outputDir,capture:(source,settings)=>captureSource(source,{...settings,fetchResponse:async()=>({status:302,headers:{location:'https://127.0.0.1/'}})})});
  assert.equal(failed.failedSources,1);assert.match(failed.results[0].message,/official domains/);
  const forged=await captureBatch(manifest,{outputDir,retryFailed:true,capture:async source=>{const result=captured(source);result.receipt.reviewStatus='verified';return result;}});
  assert.equal(forged.failedSources,1);assert.match(forged.results[0].message,/review metadata/);assert.equal((await readVerifiedSchoolCaptures(manifest,{outputDir})).length,0);
}));

test('multi-school batches accept recorded TESU routes without directory parents and preserve exact modality',()=>{
  const route={id:'tesu-actual-online',school:'Thomas Edison State University',title:'Actual online degree',modalities:['online'],url:'https://tesu.smartcatalogiq.com/en/current/actual/'},campus={...route,id:'tesu-recorded-campus',modalities:['campus']};
  const model={id:'tesu-model',school:route.school,catalog:'current',requirements:[],sources:[{id:'policy',url:'https://www.tesu.edu/transfer/'}],policyReview:[{field:'residency',status:'unverified'}]};
  const input={directory:{programs:[],sources:[]},curriculum:{routes:[route,campus],models:[{id:model.id,school:route.school,routeIds:[route.id],modalities:['online']}]},pathways:{pathways:[]},models:[model],schoolId:'tesu'};
  const online=buildSchoolResearchBatch(input);assert.equal(online.summary.knownOnlinePrograms,1);assert.equal(online.programs[0].id,route.id);assert.equal(online.summary.directoryCandidates,0);
  const residential=buildSchoolResearchBatch({...input,modality:'campus'});assert.equal(residential.summary.knownCampusPrograms,1);assert.equal(residential.summary.onlineRouteCandidates,undefined);assert.equal(residential.programs[0].id,campus.id);
  const changed=structuredClone(input);changed.models[0].policyReview[0].status='confirmed';assert.notEqual(buildSchoolResearchBatch(changed).jobs[0].inputFingerprint,online.jobs[0].inputFingerprint);
  assert.throws(()=>buildSchoolResearchBatch({...input,schoolId:'unconfigured'}),/explicitly configured/);
  assert.throws(()=>buildSchoolResearchBatch({...input,modality:'self-paced'}),/online or campus/);
});

test('selected models gather unlinked evidence and never expand capture to unrelated models or infer delivery',()=>{
  const source=url=>({id:url.split('/').at(-1),url:'https://www.liberty.edu/'+url});
  const a={id:'a',title:'Linked model',school:'Liberty University',sources:[source('shared-policy'),source('a-only')]},b={...a,id:'b',title:'Unlinked model',sources:[source('shared-policy'),source('b-only')]},c={...a,id:'c',sources:[source('unrelated-only')]},unknown={...a,id:'unknown',sources:[source('unknown-delivery')]};
  const route={id:'route-a',school:'Liberty University',title:'Actual linked degree',modalities:['online'],url:'https://www.liberty.edu/actual-program'};
  const input={directory:{programs:[],sources:[]},curriculum:{models:[a,b,c].map(model=>({id:model.id,school:model.school,modalities:['online'],routeIds:['route-'+model.id]})),routes:[route]},models:[a,b,c,unknown],pathways:{pathways:[]},selectedModelIds:['a','b','unknown']};
  const batch=buildSchoolResearchBatch(input);
  assert.equal(batch.summary.activeCurriculumModels,2);assert.equal(batch.summary.unlinkedModels,2);assert.equal(batch.programs.length,1);
  assert(batch.sources.some(source=>source.url.endsWith('/b-only')));assert(!batch.sources.some(source=>source.url.endsWith('/unrelated-only')||source.url.endsWith('/unknown-delivery')));
  assert.deepEqual(batch.sources.find(source=>source.url.endsWith('/shared-policy')).modelIds,['a','b']);
  assert.equal(batch.unlinkedModels.find(model=>model.id==='b').deliveryStatus,'recorded-online');assert.equal(batch.unlinkedModels.find(model=>model.id==='unknown').modality,null);
  assert(batch.jobs.every(job=>job.affectedModelIds.every(id=>['a','b'].includes(id))));
  const changed=structuredClone(input);changed.models.find(model=>model.id==='c').policyReview=[{field:'anything',status:'changed'}];assert.equal(buildSchoolResearchBatch(changed).revision,batch.revision);
  assert.throws(()=>buildSchoolResearchBatch({...input,selectedModelIds:[]}),/empty selection/);
});

test('future different-host leases block and expired different-host leases recover with receipt timestamps checked',()=>temp(async outputDir=>{
  const manifest=fixture(1),lock=join(outputDir,'.capture-ledger.lock');await mkdir(lock);
  const owner={token:'other-host',host:'another-research-runner',pid:process.pid,expiresAt:new Date(Date.now()+60000).toISOString()};await writeFile(join(lock,'owner.json'),JSON.stringify(owner));
  await assert.rejects(captureBatch(manifest,{outputDir,capture:async()=>assert.fail('must not fetch')}),/leased/);
  owner.expiresAt='2000-01-01T00:00:00.000Z';await writeFile(join(lock,'owner.json'),JSON.stringify(owner));
  const result=await captureBatch(manifest,{outputDir,capture:async source=>{const output=captured(source);output.receipt.capturedAt='not-a-time';return output;}});assert.equal(result.failedSources,1);assert.match(result.results[0].message,/timestamps/);
  await assert.rejects(captureBatch(manifest,{outputDir,now:()=> 'not-a-time',capture:async()=>assert.fail('must not fetch')}),/UTC ISO/);
}));
