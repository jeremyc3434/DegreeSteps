import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {buildSchoolResearchBatch,officialURL,publicAddress,pinnedResponse,proxyResponse,captureSource,captureBatch} from './scripts/build-school-research-batch.mjs';

const date='2026-11-18T12:00:00.000Z';
test('proxy capture pins the public destination, validates TLS and omits response cookies',async()=>{
 let calls=0;
 const options={signal:new AbortController().signal,maxBytes:100,resolveDNS:async()=>[{address:'8.8.8.8',family:4}],run:async(command,args,settings)=>{
  calls++;assert.equal(command,'curl');assert.equal(args[args.indexOf('--connect-to')+1],'www.liberty.edu:443:8.8.8.8:443');assert(!args.includes('--insecure'));assert(!args.includes('--location'));assert(!args.includes('--cookie'));assert.equal(settings.signal,options.signal);
  await writeFile(args[args.indexOf('--dump-header')+1],'HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\nContent-Type: text/plain\r\nSet-Cookie: discarded=1\r\nETag: public-revision\r\n\r\n');await writeFile(args[args.indexOf('--output')+1],'Evidence');return {stdout:'200'};
 }};
 const response=await proxyResponse('https://www.liberty.edu/evidence/',options);assert.equal(response.status,200);assert.equal(response.body.toString(),'Evidence');assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.headers.etag,'public-revision');
 await assert.rejects(proxyResponse('https://www.liberty.edu/evidence/',{...options,resolveDNS:async()=>[{address:'127.0.0.1',family:4}]}),/non-public/);assert.equal(calls,1);
});
test('the pinned HTTPS adapter honors both Node lookup callback formats without another DNS lookup',async()=>{
 let lookups=0;
 const response=await pinnedResponse('https://www.liberty.edu/evidence/',{signal:new AbortController().signal,maxBytes:100,resolveDNS:async()=>{lookups++;return [{address:'8.8.8.8',family:4}];},request:(url,options,receive)=>{
  assert.equal(url.hostname,'www.liberty.edu');assert(!Object.hasOwn(options,'rejectUnauthorized'));
  options.lookup(url.hostname,{all:true},(error,records)=>{assert.equal(error,null);assert.deepEqual(records,[{address:'8.8.8.8',family:4}]);});
  options.lookup(url.hostname,{all:false},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
  const request=new EventEmitter();request.end=()=>{const result=new EventEmitter();result.statusCode=200;result.headers={'content-type':'text/plain'};receive(result);result.emit('data',Buffer.from('Evidence'));result.emit('end');};return request;
 }});
 assert.equal(lookups,1);assert.equal(response.body.toString(),'Evidence');
});
function fixture(){
 const parents=[{id:'liberty-psych',schoolId:'liberty',school:'Liberty University',title:'Psychology (B.S.)',level:'bachelor',modalities:[],url:'https://catalog.liberty.edu/psychology/'},{id:'liberty-unmapped',schoolId:'liberty',school:'Liberty University',title:'Different degree',level:'master',modalities:[],url:'https://catalog.liberty.edu/different/'}];
 const online={id:'psych-online',parentId:'liberty-psych',school:'Liberty University',title:'Psychology online',level:'bachelor',modalities:['online'],url:'https://catalog.liberty.edu/psychology/online/'};
 const campus={...online,id:'psych-campus',modalities:['campus'],url:'https://catalog.liberty.edu/psychology/campus/'};
 const model={id:'model-online',school:'Liberty University',title:online.title,catalog:'2026–2027',catalogYear:'2026-2027',level:'bachelor',sources:[{id:'policy',title:'Official academic policy',url:'https://catalog.liberty.edu/undergraduate/academic-information-policies/'},{id:'duplicate-policy',title:'Same document',url:'https://catalog.liberty.edu/undergraduate/academic-information-policies/#section'},{id:'untrusted',url:'https://forum.example/guesses'}],policyReview:[{field:'upperMinCredits',status:'unverified'},{field:'institutionMinCredits',status:'confirmed'}],requirements:[{id:'unresolved',researchGap:true}],unresolved:[]};
 return {directory:{programs:parents,sources:[{id:'liberty',url:'https://catalog.liberty.edu/programs/',scope:'Official programs'}]},curriculum:{checkedOn:'2026-11-18',routes:[online,campus],models:[{id:model.id,routeIds:[online.id],school:model.school,modalities:['online'],readyTemplate:true,coverage:'complete'}]},pathways:{pathways:[]},models:[model],academicRegistry:{revision:'academic-v1:fixture',programs:[{id:model.id,factIds:['fact-1']}],findings:[{id:'finding-1',programIds:[model.id]}]}};
}
test('school batch covers every parent without inventing online delivery or treating a ready ledger as verification',()=>{
 const input=fixture(),before=JSON.stringify(input),batch=buildSchoolResearchBatch(input);
 assert.equal(batch.summary.directoryCandidates,2);assert.equal(batch.summary.knownOnlinePrograms,1);assert.equal(batch.summary.readyTemplates,1);
 assert.equal(batch.programs[0].id,'psych-online');assert.equal(batch.programs[0].parentId,'liberty-psych');assert.equal(batch.programs[0].catalogYear,'2026-2027');assert.deepEqual(batch.programs[0].factIds,['fact-1']);assert.deepEqual(batch.programs[0].findingIds,['finding-1']);
 assert.equal(batch.deliveryDiscovery.find(program=>program.id==='liberty-unmapped').deliveryStatus,'needs-delivery-discovery');
 assert(!batch.programs.some(program=>program.id==='psych-campus'));assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(buildSchoolResearchBatch(input)),JSON.stringify(batch));
 assert(!JSON.stringify(batch).includes('forum.example'));assert(!Object.hasOwn(batch,'verifiedPrograms'));
});
test('official sources deduplicate fragments while retaining model-local identities and unresolved policy priority inputs',()=>{
 const batch=buildSchoolResearchBatch(fixture()),policy=batch.sources.find(source=>source.kind==='academic-policy');
 assert.deepEqual(policy.localSourceIds,['model-online:duplicate-policy','model-online:policy']);assert.equal(policy.sourceContentHash,null);assert.equal(policy.captureStatus,'not-captured');assert.equal(policy.affectedExactPrograms,1);
 assert.deepEqual(batch.programs[0].backlog.openPolicyFields,['upperMinCredits']);assert.deepEqual(batch.programs[0].backlog.unresolvedRequirementIds,['unresolved']);
 assert.equal(batch.jobs[0].sourceId,policy.id);assert.equal(batch.jobs.length,batch.sources.length);
});
test('capture validates official HTTPS destinations, network addresses, redirects, sizes and actual body hashes',async()=>{
 for(const url of ['http://www.liberty.edu/a','https://liberty.edu.attacker.example/','https://user:pass@liberty.edu/','https://127.0.0.1/','https://liberty.edu:8080/','https://localhost/'])assert.throws(()=>officialURL(url));
 for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001::1','2001:db8::1','2002:c0a8:1::'])assert.equal(publicAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicAddress(address),true,address);
 const body=Buffer.from('<html>Published evidence, not a reviewed claim.</html>'),calls=[];
 const captured=await captureSource({id:'source',url:'https://www.liberty.edu/first/'},{now:()=>date,fetchResponse:async url=>{calls.push(url);return calls.length===1?{status:302,headers:{location:'https://catalog.liberty.edu/evidence/'},body:Buffer.alloc(0)}:{status:200,headers:{'content-type':'text/html; charset=utf-8'},body};}});
 assert.equal(captured.receipt.sourceContentHash,'sha256:'+createHash('sha256').update(body).digest('hex'));assert.equal(captured.receipt.capturedAt,date);assert.equal(captured.receipt.reviewStatus,'unreviewed');assert.equal(captured.receipt.evidenceEffect,'none');assert(!Object.hasOwn(captured.receipt,'reviewedAt'));assert.deepEqual(calls,['https://www.liberty.edu/first/','https://catalog.liberty.edu/evidence/']);
 await assert.rejects(captureSource({url:'https://liberty.edu/'},{fetchResponse:async()=>({status:302,headers:{location:'https://169.254.169.254/'}})}),/official domains/);
 await assert.rejects(captureSource({url:'https://liberty.edu/'},{maxBytes:1,fetchResponse:async()=>({status:200,headers:{'content-type':'text/html'},body})}),/byte limit/);
 await assert.rejects(captureSource({url:'https://liberty.edu/'},{fetchResponse:async()=>({status:200,headers:{'content-type':'image/png'},body})}),/document type/);
 await assert.rejects(captureSource({url:'https://liberty.edu/'},{maxRedirects:0,fetchResponse:async()=>({status:301,headers:{location:'/next/'}})}),/redirect limit/);
});
test('bounded capture saves successful bytes and failed-source evidence without modifying manifest or approving facts',async()=>{
 const manifest=buildSchoolResearchBatch(fixture()),before=JSON.stringify(manifest),dir=await mkdtemp(join(tmpdir(),'degreesteps-school-capture-'));let active=0,maxActive=0,calls=0;
 try{
  const result=await captureBatch(manifest,{outputDir:dir,limit:3,concurrency:2,now:()=>date,capture:async source=>{active++;maxActive=Math.max(active,maxActive);calls++;await new Promise(resolve=>setTimeout(resolve,5));active--;if(source.kind==='school-directory')throw new Error('HTTP 403');const body=Buffer.from(source.url);return {body,receipt:{sourceId:source.id,url:source.url,status:'captured',sourceContentHash:'sha256:'+createHash('sha256').update(body).digest('hex'),capturedAt:date,contentType:'text/html',reviewStatus:'unreviewed',evidenceEffect:'none'}};}});
  assert.equal(calls,3);assert(maxActive<=2);assert.equal(result.capturedSources+result.failedSources,3);assert.equal(result.failedSources,1);assert.equal(JSON.stringify(manifest),before);
  const saved=JSON.parse(await readFile(join(dir,'capture-receipt.json'),'utf8'));assert.deepEqual(saved,result);
  for(const receipt of result.results.filter(receipt=>receipt.status==='captured'))assert.equal('sha256:'+createHash('sha256').update(await readFile(join(dir,receipt.bodyPath))).digest('hex'),receipt.sourceContentHash);
  await assert.rejects(captureBatch(manifest,{outputDir:dir,limit:11}),/1–10/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
