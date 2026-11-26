import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {sha256,canonical} from './pathway-factory/lib.mjs';
import {normalizeComponentCapture,componentCacheKey,extractDeterministicComponents,draftComponents,validateComponentDraft,parseFormalPrerequisites,createAnthropicComponentAdapter,runComponentDraftCLI} from './pathway-factory/component-drafts.mjs';

const base=resolve(import.meta.dirname,'..');
const capturedAt='2026-11-26T04:33:03Z';
const capture=(text,role='university-course',extra={})=>({text,sourceURL:'https://example.edu/catalog/course',contentHash:sha256(text),capturedAt,role,...extra});
const claim=(field,value,quote)=>({field,value,quote});
const values=c=>Object.fromEntries(c.claims.map(c=>[c.field,c.value]));
const courseText='ABC-1230 Example Course\nCredits: 3 semester hours\nPrerequisite\nAAA-1000 or BBB-1000\nDelivery Methods\nOnline';
const emptyResponse=()=>({components:[],gaps:[]});

test('capture validation binds exact text, actual time, explicit role and independent raw provenance',()=>{
  const c=capture(courseText,'university-course',{rawContentHash:sha256('<html>raw body</html>'),captureFormat:'html-to-text-v1',receiptHash:sha256('receipt')});
  assert.equal(normalizeComponentCapture(c).rawContentHash,c.rawContentHash);
  assert.throws(()=>normalizeComponentCapture({...c,text:c.text+'tamper'}),/hash/);
  assert.throws(()=>normalizeComponentCapture({...c,capturedAt:'2026-11-26'}),/timestamp/);
  assert.throws(()=>normalizeComponentCapture({...c,capturedAt:'2026-02-31T04:33:03Z'}),/timestamp/);
  assert.throws(()=>normalizeComponentCapture({...c,role:'model-evidence'}),/role/);
  assert.throws(()=>normalizeComponentCapture({...c,rawContentHash:'abc'}),/provenance hash/);
});

test('numeric academic quantities never default to semester or convert native units',async()=>{
  for(const [printed,expected]of [['semester hours','semester'],['quarter credits','quarter'],['competency units','competency-unit']]){
    const result=await draftComponents({captures:[capture(`ABC-1230 Example Course\nCredits: 3 ${printed}`)]});
    const c=result.components.find(c=>c.kind==='course');assert.equal(values(c).credits,3);assert.equal(values(c).creditSystem,expected);
  }
  const raw=capture('ABC-1230 Example Course\nCredits\n3');
  const result=await draftComponents({captures:[raw]});const c=result.components[0];
  assert.equal(values(c).credits,undefined);assert.equal(values(c).creditSystem,undefined);assert.equal(values(c).creditQuantityText,'3');assert.match(c.gaps.join(' '),/credit unit/);
  assert.equal(validateComponentDraft({kind:'course',claims:[claim('code','ABC-1230','ABC-1230 Example Course'),claim('title','Example Course','ABC-1230 Example Course'),claim('credits',3,'Credits\n3')],gaps:[]},raw).valid,false);
});

test('formal OR remains OR; advisory and alias/code conflicts cannot waive requirements',async()=>{
  assert.deepEqual(parseFormalPrerequisites('Prerequisite\nPSY-1010 or SOC-1010'),{operator:'any',courses:['PSY-1010','SOC-1010'],text:'PSY-1010 or SOC-1010'});
  assert.equal(parseFormalPrerequisites('Prerequisite\nPSY-1010 and SOC-1010').operator,'all');
  assert.equal(parseFormalPrerequisites('Prerequisite AAA-1000 or BBB-1000 and CCC-1000').operator,'unresolved');
  assert.equal(parseFormalPrerequisites('Prerequisite AAA-1000 with a grade of C or better').operator,'unresolved');
  const raw=capture('MKT-4410 Marketing with Digital and Social Media\nAdvisory: MKT-3060 or MKT-2010 or a marketing management course.\nCredits\n3\nPrerequisite\nMAR-3060\nDelivery Methods\nOnline');
  const result=await draftComponents({captures:[raw]});const p=result.components.find(c=>c.kind==='prerequisite');
  assert.deepEqual(p.formalExpression.courses,['MAR-3060']);assert.equal(p.formalExpression.operator,'all');
  assert.match(values(p).advisoryText,/MKT-3060 or MKT-2010/);assert.equal(p.aliases,undefined);
  const missing=await draftComponents({captures:[capture('ABC-1230 Example Course\nAdvisory: Introductory knowledge is advisable.\nCredits: 3 semester hours')]});
  assert.equal(missing.components.find(c=>c.kind==='prerequisite').formalExpression.operator,'unresolved');
  assert.match(missing.components.find(c=>c.kind==='prerequisite').gaps.join(' '),/not establish a waiver/);
});

test('AI fabricated quotes, unsupported field quantities, wrong roles and review injection are quarantined',async()=>{
  const raw=capture(courseText),valid=extractDeterministicComponents(raw).components.find(c=>c.kind==='course');
  const fabricated=structuredClone(valid);fabricated.claims.find(c=>c.field==='credits').quote='Credits: 30 semester hours';
  const units=structuredClone(valid);units.claims.find(c=>c.field==='creditSystem').value='quarter';
  const quantity=structuredClone(valid);quantity.claims.find(c=>c.field==='credits').value=30;
  const review={...valid,reviewStatus:'reviewed',publicationAllowed:true};
  const role={kind:'receiving-award',claims:[claim('sourceCode','AAA-1000','AAA-1000 or BBB-1000'),claim('receivingInstitution','Example Course','ABC-1230 Example Course'),claim('receivingCode','ABC-1230','ABC-1230 Example Course')],gaps:[]};
  const result=await draftComponents({captures:[raw],allowAI:true,model:'configured-test-model',complete:async()=>({components:[fabricated,units,quantity,review,role],gaps:[]})});
  assert.equal(result.rejected.length,5);assert.ok(result.rejected.some(r=>r.errors.some(e=>e.includes('verbatim'))));
  assert.ok(result.rejected.some(r=>r.errors.some(e=>e.includes('Source role'))));
  assert.equal(result.publicationAllowed,false);for(const c of result.components){assert.equal(c.reviewStatus,'unreviewed');assert.equal(c.evidenceEffect,'none');assert.equal(c.publicationAllowed,false);}
});

test('malformed AI claim rows and candidates are quarantined while valid siblings survive and cache',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-malformed-claims-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const raw=capture(courseText),valid=extractDeterministicComponents(raw).components.find(c=>c.kind==='course');
  const invalid=[null,42,'course',false,[],{kind:'constructor',claims:[],gaps:[]},{kind:'course',claims:null,gaps:[]}];
  for(const bad of [null,0,true,'claim',[],{field:'code',value:null,quote:'ABC-1230'},{field:'code',value:{bad:'value'},quote:'ABC-1230'},{field:'code',value:'ABC-1230',quote:{bad:'quote'}}])invalid.push({...valid,claims:[bad]});
  invalid.push({...valid,claims:[...valid.claims,claim('creditSystem','constructor','semester hours')]});
  invalid.push({kind:'receiving-award',claims:[null,claim('receivingCode','ABC-1230',{})],gaps:[]});
  for(const candidate of invalid)assert.equal(validateComponentDraft(candidate,raw).valid,false);
  let calls=0;const options={captures:[raw],cacheDir:dir,allowAI:true,model:'configured-test-model',complete:async()=>{calls++;return {components:[...invalid,valid],gaps:[]};}};
  const result=await draftComponents(options);assert.equal(result.rejected.length,invalid.length);assert.equal(result.components.filter(c=>c.kind==='course').length,1);assert.equal(calls,1);
  const second=await draftComponents(options);assert.equal(second.cache.hits,1);assert.equal(calls,1);assert.deepEqual(second.components,result.components);assert.equal(second.rejected.length,invalid.length);
});

test('generic provider approval never creates exact receiving awards or original quantity conversions',()=>{
  const text='TESU accepts ACE recommendations from Sophia. ABC-1230 Example Course\nCredits: 3 semester hours';
  const raw=capture(text,'university-policy');const result=extractDeterministicComponents(raw);
  assert.ok(result.components.every(c=>c.kind!=='receiving-award'));
  const candidate={kind:'receiving-award',claims:[claim('sourceCode','Sophia',text),claim('receivingInstitution','TESU',text),claim('receivingCode','ABC-1230',text),claim('sourceCredits',1,text)],gaps:[]};
  assert.equal(validateComponentDraft(candidate,raw).valid,false);
  assert.equal(validateComponentDraft(candidate,capture(text,'university-transfer-map')).valid,false);
});

test('cache key includes source meaning and versions but reuses unchanged text across actual retrieval events',()=>{
  const raw=capture(courseText),key=componentCacheKey(raw);
  for(const patch of [{sourceURL:'https://example.edu/other'},{role:'provider-identity'},{captureFormat:'changed-format'},{text:courseText+'\nnew',contentHash:sha256(courseText+'\nnew')}])assert.notEqual(componentCacheKey({...raw,...patch}),key);
  for(const patch of [{capturedAt:'2026-11-26T04:34:03Z'},{rawContentHash:sha256('newraw')},{receiptHash:sha256('newreceipt')}])assert.equal(componentCacheKey({...raw,...patch}),key);
  for(const patch of [{extractorVersion:'changed-parser'},{schemaVersion:2},{promptVersion:'changed-prompt'}])assert.notEqual(componentCacheKey(raw,patch),key);
  assert.notEqual(componentCacheKey(raw,{aiEnabled:true,model:'model-a'}),componentCacheKey(raw,{aiEnabled:true,model:'model-b'}));
  assert.throws(()=>componentCacheKey(raw,{aiEnabled:true}),/model/);
});

test('same source reused across programs consumes one injected request; offline mode never calls it',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-cache-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let calls=0;const complete=async()=>{calls++;return emptyResponse();};
  const options={captures:[capture(courseText),capture(courseText)],cacheDir:dir,allowAI:true,model:'configured-test-model',complete};
  const first=await draftComponents(options);assert.deepEqual(first.cache,{hits:1,misses:1});assert.equal(calls,1);
  const second=await draftComponents(options);assert.deepEqual(second.cache,{hits:2,misses:0});assert.equal(calls,1);
  await draftComponents({...options,promptVersion:'changed-prompt'});assert.equal(calls,2);
  await draftComponents({...options,schemaVersion:2});assert.equal(calls,3);
  await draftComponents({...options,allowAI:false});assert.equal(calls,3);
});

test('cache corruption and review/quote tampering fail closed before further AI spend',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-cache-integrity-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let calls=0;const options={captures:[capture(courseText)],cacheDir:dir,allowAI:true,model:'configured-test-model',complete:async()=>{calls++;return emptyResponse();}};
  await draftComponents(options);const [file]=await readdir(dir),path=join(dir,file),entry=JSON.parse(await readFile(path,'utf8'));
  entry.artifact.components[0].claims[0].quote='fabricated';entry.payloadHash=sha256(JSON.stringify(canonical(entry.artifact)));await writeFile(path,JSON.stringify(entry));
  await assert.rejects(draftComponents(options),/source-bound/);assert.equal(calls,1);
  await writeFile(path,'bad json');await assert.rejects(draftComponents(options),/unreadable/);assert.equal(calls,1);
});

test('fresh identical capture reuses immutable old research but reports the actual fresh provenance',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-new-receipt-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let calls=0;const complete=async()=>{calls++;return emptyResponse();},raw=capture(courseText,'university-course',{receiptHash:sha256('oldreceipt'),rawContentHash:sha256('oldraw')});
  const options={captures:[raw],cacheDir:dir,allowAI:true,model:'configured-test-model',complete};
  await draftComponents(options);const [name]=await readdir(dir),oldCache=await readFile(join(dir,name),'utf8');
  const fresh={...raw,capturedAt:'2026-11-27T10:30:00Z',receiptHash:sha256('freshreceipt'),rawContentHash:sha256('freshraw')};
  const result=await draftComponents({...options,captures:[fresh]});assert.equal(calls,1);assert.deepEqual(result.cache,{hits:1,misses:0});
  assert.equal(result.components[0].id,JSON.parse(oldCache).artifact.components[0].id);
  assert.equal(result.components[0].binding.capturedAt,fresh.capturedAt);assert.equal(result.components[0].binding.receiptHash,fresh.receiptHash);assert.equal(result.components[0].binding.rawContentHash,fresh.rawContentHash);
  assert.equal(await readFile(join(dir,name),'utf8'),oldCache);
});

test('AI failures never echo secrets or persist a successful cache entry',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-adapter-failure-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const secret='secret-must-not-leak';await assert.rejects(draftComponents({captures:[capture(courseText)],cacheDir:dir,allowAI:true,model:'configured-test-model',complete:async()=>{throw Error(secret);}}),error=>!error.message.includes(secret));
  assert.deepEqual(await readdir(dir),[]);
  await assert.rejects(draftComponents({captures:[capture(courseText)],allowAI:true,model:'configured-test-model',complete:async()=>({components:[],gaps:[],reviewStatus:'reviewed'})}),/invalid.*envelope/);
});

async function retained(name,roles){
  const text=await readFile(join(base,'content/source-captures',name+'.txt'),'utf8'),meta=JSON.parse(await readFile(join(base,'content/source-captures',name+'.json'),'utf8'));
  return capture(text,roles[0],{roles,sourceURL:meta.url,contentHash:meta.sha256,capturedAt:meta.fetchedAt,captureFormat:meta.captureFormat??'http-capture',...(meta.toolResponseReceipt?{receiptHash:meta.toolResponseReceipt.sha256}:{})});
}

test('retained TESU course facts preserve real OR prerequisites without inventing absent units or delivery guarantees',async()=>{
  const c=await retained('24b95e23bc582522',['university-course']),result=await draftComponents({captures:[c]});
  const course=result.components.find(c=>c.kind==='course'),pre=result.components.find(c=>c.kind==='prerequisite');
  assert.equal(values(course).code,'PSY-3630');assert.equal(values(course).creditQuantityText,'3');assert.equal(values(course).creditSystem,undefined);
  assert.deepEqual(pre.formalExpression.courses,['PSY-1010','SOC-1010']);assert.equal(pre.formalExpression.operator,'any');
  assert.ok(result.components.every(c=>!Object.hasOwn(values(c),'selfPaced')));
});

test('retained GM table drafts ledger rows and the actual named selection pool, with unresolved accounting visible',async()=>{
  const raw=await retained('175d94db8aea580b',['university-program']),result=await draftComponents({captures:[raw]});
  assert.ok(result.components.filter(c=>c.kind==='program-ledger').length>40);
  const pools=result.components.filter(c=>c.kind==='course-pool');assert.equal(pools.length,5);
  assert.ok(pools.every(c=>values(c).poolLabel==='Select two featured courses from the list below:'));
  assert.deepEqual(pools.map(c=>values(c).code),['SOC-2910','HIS-1140','HIS-1210','HUM-1030','PHI-1300']);
  assert.match(result.gaps.map(g=>g.message).join(' '),/complete degree accounting/);
  // Source-derived family facts remain drafts, not proof that all family rows
  // are reusable or that a major requirement has been independently satisfied.
  const response={components:[{kind:'family-delta',claims:[claim('familyTitle','School of Business and Management','School of Business and Management-Upper Level Degree Policy'),claim('programTitle','B.S. in General Management','B.S. in General Management'),claim('requirementTitle','Industrial Psychology','PSY-3630\tIndustrial Psychology\t3')],gaps:['Compare with an independently sourced base-family ledger before reuse.']}],gaps:[]};
  const withAI=await draftComponents({captures:[raw],allowAI:true,model:'configured-test-model',complete:async()=>response});
  assert.equal(withAI.components.find(c=>c.kind==='family-delta').publicationAllowed,false);
});

test('retained ACE original 1 and receiving 3 stay separate, catalog-scoped unresolved quantities',async()=>{
  const raw=await retained('e980d03f58814f1b',['source-credit-recommendation','receiving-institution-submitted-equivalency']);
  const result=await draftComponents({captures:[raw]}),award=result.components.find(c=>c.kind==='receiving-award');
  assert.equal(values(award).sourceCode,'SOPH-0061');assert.equal(values(award).receivingCode,'SOS-1500');assert.equal(values(award).receivingCreditQuantityText,'3');assert.equal(values(award).catalogScope,'2026-2027');
  assert.equal(values(award).sourceCredits,undefined);assert.equal(values(award).receivingCredits,undefined);assert.equal(values(award).receivingCreditSystem,undefined);
});

test('retained policy and price extracts are separate source-dated evidence drafts',async()=>{
  const policy=await retained('004b0e85327846b7',['university-policy']);const price=await retained('021a082a8d964ab4',['provider-price']);
  const result=await draftComponents({captures:[policy,price]});
  assert.ok(result.components.some(c=>c.kind==='school-policy'&&values(c).policyText.includes('semester system')));
  const p=result.components.find(c=>c.kind==='price'&&values(c).amount===99);assert.ok(p);assert.equal(values(p).basis,'month');assert.equal(p.binding.capturedAt,price.capturedAt);
  assert.equal(p.checkedOn,undefined);assert.ok(result.components.every(c=>c.kind!=='receiving-award'));
});

test('server-side adapter sends configured model but returns only parsed drafts, with no key in extraction result',async()=>{
  let body,headers;const adapter=createAnthropicComponentAdapter({apiKey:'private-test-key',fetchImpl:async(_url,request)=>{body=JSON.parse(request.body);headers=request.headers;return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(emptyResponse())}]})};}});
  const result=await draftComponents({captures:[capture(courseText)],allowAI:true,model:'explicitly-configured-test-model',complete:adapter});
  assert.equal(body.model,'explicitly-configured-test-model');assert.equal(headers['x-api-key'],'private-test-key');assert.ok(!JSON.stringify(result).includes('private-test-key'));
  await assert.rejects(draftComponents({captures:[capture(courseText)],allowAI:true,complete:adapter}),/explicit.*model/);
});

test('CLI defaults offline even when server credentials are present',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'component-offline-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const input=join(dir,'input.json'),output=join(dir,'output.json');await writeFile(input,JSON.stringify({captures:[capture(courseText)]}));
  let log;await runComponentDraftCLI(['--input',input,'--output',output],{env:{ANTHROPIC_API_KEY:'unusable-offline-key'},fetchImpl:async()=>{assert.fail('Offline CLI called fetch.');},log:text=>{log=text;}});
  const result=JSON.parse(await readFile(output,'utf8'));assert.equal(result.publicationAllowed,false);assert.equal(result.artifacts[0].versions.aiEnabled,false);assert.ok(!JSON.stringify(result).includes('unusable-offline-key'));assert.match(log,/No academic review or publication approval/);
});
