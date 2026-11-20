/** Pathway Factory: WGU round-trip parity, verification gates, capture, drafting (mocked API) and the leverage report. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readJSON,writeJSON,loadKit,clone,canonical,kitsRoot,root} from './scripts/pathway-factory/lib.mjs';
import {decompose,compareDocs} from './scripts/pathway-factory/migrate-from-model.mjs';
import {compileKit,runGuards,serializePublished} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {capture,htmlToText} from './scripts/pathway-factory/capture.mjs';
import {draftProgram,API_URL,MODEL} from './scripts/pathway-factory/draft.mjs';
import {schoolReport} from './scripts/pathway-factory/report.mjs';

const wgu=await readJSON(resolve(root,'content/curricula/wgu.json'));
const asOf=wgu.checkedOn;
const optionKey=o=>[o.provider,o.code,o.receivingCode||o.receivingTitle].join('|');
const optionFacts=o=>canonical({provider:o.provider,code:o.code,receivingCode:o.receivingCode,receivingTitle:o.receivingTitle,credits:o.credits,creditSystem:o.creditSystem,sourceCredits:o.sourceCredits,sourceCreditSystem:o.sourceCreditSystem,evidence:o.evidence,evidenceType:o.evidenceType,sourceIds:o.sourceIds,identitySourceIds:o.identitySourceIds,conditions:o.conditions});
function assertModelParity(original,compiled){
  const byId=new Map(compiled.models.map(m=>[m.id,m]));
  assert.equal(compiled.models.length,original.models.length);
  for(const model of original.models){
    const other=byId.get(model.id);assert.ok(other,model.id+' compiled');
    assert.equal(other.totalCredits,model.totalCredits,model.id);
    assert.equal(other.creditSystem,model.creditSystem,model.id);
    assert.deepEqual(other.requirements.map(r=>[r.id,r.code,r.title,r.credits,r.category,r.institutionalOnly]),model.requirements.map(r=>[r.id,r.code,r.title,r.credits,r.category,r.institutionalOnly]),model.id+' requirements');
    model.requirements.forEach((r,i)=>{
      const mine=new Map(other.requirements[i].options.map(o=>[optionKey(o),optionFacts(o)])),theirs=new Map(r.options.map(o=>[optionKey(o),optionFacts(o)]));
      assert.deepEqual(mine,theirs,`${model.id}/${r.id} option set`);
      assert.deepEqual(other.requirements[i].options.map(o=>o.id),r.options.map(o=>o.id),`${model.id}/${r.id} option ids and order`);
    });
    // Everything else, including program policy/evidence metadata and every option field, must also be identical.
    assert.deepEqual(other,model,model.id+' full model');
  }
}

test('WGU decomposes into kits and compiles back to the exact same models',()=>{
  const kit=decompose(wgu,{schoolId:'wgu',sourcePath:'content/curricula/wgu.json'});
  const {doc,skipped}=compileKit({...kit,dir:'memory'});
  assert.deepEqual(skipped,[]);
  assertModelParity(wgu,doc);
  assert.deepEqual(compareDocs(wgu,doc),[]);
  const courses=[...kit.providers.values()].reduce((n,p)=>n+p.courses.length,0);
  assert.equal(courses,95,'689 options share 95 provider course identities');
  assert.equal(kit.programs.length,20);
});

test('the WGU kit is the source of truth: it verifies, passes its guards and publishes exactly content/curricula/wgu.json',async()=>{
  const kit=await loadKit(join(kitsRoot,'wgu'));
  assert.equal(kit.school.publish?.path,'content/curricula/wgu.json');
  const result=await verifyKit(kit,{asOf});
  assert.deepEqual(result.errors,[]);
  assert.ok(result.candidates.length>0&&result.candidates.every(c=>c.reason==='out-of-scope'&&c.documentedFor.length),'cross-program reuse stays an unapplied candidate');
  const first=compileKit(kit).doc,second=compileKit(await loadKit(join(kitsRoot,'wgu'))).doc;
  assert.equal(JSON.stringify(first),JSON.stringify(second),'compilation is deterministic');
  assert.equal(await runGuards(kit,first),7);
  assert.equal(serializePublished(first),await readFile(resolve(root,'content/curricula/wgu.json'),'utf8'),'content/curricula/wgu.json is stale; run npm run factory:publish');
  const fresh=compileKit(decompose(wgu,{schoolId:'wgu',sourcePath:'content/curricula/wgu.json'})).doc;
  assertModelParity(first,fresh);
});

test('WGU guards reject academic regressions in a compiled document',async()=>{
  const kit=await loadKit(join(kitsRoot,'wgu'));
  const {doc}=compileKit(kit);
  const broken=(mutate)=>{const copy=clone(doc);mutate(copy);return runGuards(kit,copy);};
  const bsmgt=d=>d.models.find(m=>m.id==='curriculum-wgu-catalog-ecceaa488637ac83');
  await assert.rejects(broken(d=>{const m=bsmgt(d),cap=m.requirements.find(r=>r.code==='QGT1');cap.options=[clone(m.requirements.find(r=>r.options.length).options[0])];}),/must stay at WGU/);
  await assert.rejects(broken(d=>{bsmgt(d).externalMaxCredits=90;}),/75%/);
  await assert.rejects(broken(d=>{bsmgt(d).pricing.oneTimeFees[0].frequency='per-term';}),/application fee|one-time/);
  await assert.rejects(broken(d=>{bsmgt(d).requirements[0].credits+=1;}),/requirements total/);
  await assert.rejects(broken(d=>{d.models[1].creditSystem='semester';}),/competency units/);
});

// ---------- Synthetic kit for the verification gates ----------
const html='<html><head><title>Demo</title><script>var hidden="BUS 999 Secret"</script><style>p{}</style></head><body><h1>Demo BBA</h1><p>BUS&nbsp;101 Introduction to Business &ndash; 3 credits</p><p>ENG 101 English Composition 3 credits</p><p>BUS 499 Capstone 3 credits must be completed in residence</p><p>Total: 9 credits</p></body></html>';
async function fixture(){
  const base=await mkdtemp(join(tmpdir(),'pathway-factory-'));
  const kits=join(base,'kits'),dir=join(kits,'demo'),captures=join(base,'captures');
  const captured=await capture('https://demo.example/catalog/bba',{dir:captures,fetchImpl:async url=>({ok:true,status:200,url,headers:{get:()=>'text/html; charset=utf-8'},text:async()=>html}),now:()=>new Date('2026-11-01T00:00:00Z')});
  const school={kind:'pathway-kit-school',version:1,id:'demo',name:'Demo University',creditSystem:'semester',checkedOn:'2026-11-01',sources:[{id:'demo-catalog',title:'Catalog',url:'https://demo.example/catalog/bba',checked:'2026-11-01',capture:captured.path},{id:'demo-agreement',title:'Agreement',url:'https://demo.example/agreement',checked:'2026-11-01'}]};
  const provider={kind:'pathway-kit-provider',version:1,provider:'Sophia',sources:[{id:'sophia-catalog',url:'https://sophia.example/courses',checked:'2026-10-30'}],courses:[{code:'SOPH-1',title:'Intro to Business',sourceCredits:3,sourceCreditSystem:'semester',identitySourceIds:['sophia-catalog']},{code:'SOPH-2',title:'English Composition I',sourceCredits:3,sourceCreditSystem:'semester',identitySourceIds:['sophia-catalog']}]};
  const req=(id,code,title,quote,extra={})=>({id,code,title,credits:3,category:'core',institutionalOnly:false,sourceIds:['demo-catalog'],quotes:[{sourceId:'demo-catalog',text:quote}],...extra});
  const program=(slug,route)=>({kind:'pathway-kit-program',version:1,slug,routeIds:[route],title:slug.toUpperCase(),level:'bachelor',catalog:'2026',totalCredits:9,review:{status:'reviewed',reviewer:'Test Reviewer',reviewedOn:'2026-11-01'},requirements:[req(slug+'-bus101','BUS 101','Introduction to Business','BUS 101 Introduction to Business – 3 credits'),req(slug+'-eng101','ENG 101','English Composition','ENG 101 English Composition 3 credits'),req(slug+'-bus499','BUS 499','Capstone','BUS 499 Capstone 3 credits must be completed in residence',{institutionalOnly:true})]});
  const equivalencies={kind:'pathway-kit-equivalencies',version:1,school:'demo',conditionLibrary:{'demo-one-award':'One source course satisfies one requirement.'},equivalencies:[
    {id:'sophia-soph-1-to-bus-101',provider:'Sophia',code:'SOPH-1',status:'published',receivingCode:'BUS 101',receivingTitle:'Introduction to Business',credits:3,creditSystem:'semester',evidence:'published',evidenceType:'official-receiving-school-equivalency',sourceIds:['demo-agreement'],conditionIds:['demo-one-award'],scope:{programs:['bba']}},
    {id:'sophia-soph-2-to-eng-101',provider:'Sophia',code:'SOPH-2',status:'published',receivingCode:'ENG 101',receivingTitle:'English Composition',credits:3,creditSystem:'semester',evidence:'published',evidenceType:'official-receiving-school-equivalency',sourceIds:['demo-agreement'],scope:{all:true}}]};
  const write=async kit=>{await rm(kits,{recursive:true,force:true});await writeJSON(join(dir,'school.json'),kit.school);await writeJSON(join(dir,'equivalencies.json'),kit.equivalencies,['equivalencies']);for(const p of kit.programs)await writeJSON(join(dir,'programs',p.slug+'.json'),p);await writeJSON(join(kits,'providers','sophia.json'),kit.provider,['courses']);};
  const data={school,provider,equivalencies,programs:[program('bba','demo-bba'),program('bsm','demo-bsm')]};
  await write(data);
  return {base,dir,captures,data,write,routeIds:()=>new Set(['demo-bba','demo-bsm']),cleanup:()=>rm(base,{recursive:true,force:true})};
}
async function verifyMutation(f,mutate){const data=clone(f.data);mutate(data);await f.write(data);const result=await verifyKit(await loadKit(f.dir),{asOf:'2026-11-20',routeIds:f.routeIds()});await f.write(f.data);return result;}
const codes=result=>result.errors.map(e=>e.code);

test('a grounded synthetic kit verifies, compiles in scope only and reports out-of-scope candidates',async()=>{
  const f=await fixture();
  try{
    const kit=await loadKit(f.dir),result=await verifyKit(kit,{asOf:'2026-11-20',routeIds:f.routeIds()});
    assert.deepEqual(result.errors,[]);
    assert.deepEqual(result.candidates.map(c=>[c.program,c.requirement,c.code,c.reason,c.documentedFor]),[['bsm','bsm-bus101','SOPH-1','out-of-scope',['bba']]]);
    const {doc}=compileKit(kit),[bba,bsm]=doc.models;
    assert.deepEqual(bba.requirements.map(r=>r.options.map(o=>o.code)),[['SOPH-1'],['SOPH-2'],[]]);
    assert.deepEqual(bsm.requirements.map(r=>r.options.map(o=>o.code)),[[],['SOPH-2'],[]],'the BBA-only award is not applied to BSM');
    const option=bba.requirements[0].options[0];
    assert.deepEqual([option.id,option.credits,option.creditSystem,option.sourceCredits,option.sourceCreditSystem,option.conditions,option.identitySourceIds],['sophia-soph-1-bba-bus101',3,'semester',3,'semester',['One source course satisfies one requirement.'],['sophia-catalog']]);
    assert.ok(!('quotes' in bba.requirements[0]),'grounding quotes stay in the kit');
    assert.deepEqual(doc.sources.map(s=>s.id).sort(),['demo-agreement','demo-catalog','sophia-catalog']);
    const report=schoolReport(kit,{programs:[{id:'demo-bba',schoolId:'demo',title:'BBA',level:'bachelor'},{id:'demo-bsm',schoolId:'demo',title:'BSM',level:'bachelor'},{id:'demo-mba',schoolId:'demo',title:'MBA',level:'master'}]});
    assert.deepEqual(report.programsWithoutKit.map(p=>p.id),['demo-mba']);
    const bbaRow=report.programs.find(p=>p.slug==='bba'),bsmRow=report.programs.find(p=>p.slug==='bsm');
    assert.deepEqual([bbaRow.coveredCredits,bbaRow.institutionalOnlyCredits,bbaRow.coveredPercent],[6,3,66.7]);
    assert.deepEqual([bsmRow.coveredCredits,bsmRow.candidateCredits,bsmRow.reuseCandidates],[3,3,1]);
  }finally{await f.cleanup();}
});

test('verification hard-fails ungrounded, unbalanced, undated, duplicated, out-of-scope and mixed-unit claims',async()=>{
  const f=await fixture();
  try{
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].totalCredits=10;})).includes('credit-sum'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].quotes[0].text='BUS 101 Introduction to Business 4 credits';})).includes('quote-not-found'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].quotes[0].sourceId='demo-agreement';})).includes('quote-source'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[1].sourceIds=['no-such-source'];})).includes('unknown-source'));
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies[0].sourceIds=['no-such-source'];})).includes('unknown-source'));
    assert.ok(codes(await verifyMutation(f,d=>{d.school.sources[1].checked='2027-01-01';})).includes('source-date-future'));
    assert.ok(codes(await verifyMutation(f,d=>{delete d.provider.sources[0].checked;})).includes('source-date-missing'));
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies.push({...clone(d.equivalencies.equivalencies[0]),id:'dup'});})).includes('duplicate-award'));
    const twoRequirements=d=>d.equivalencies.equivalencies.push({...clone(d.equivalencies.equivalencies[0]),id:'soph-1-to-eng',receivingCode:'ENG 101',receivingTitle:'English Composition'});
    assert.ok(codes(await verifyMutation(f,twoRequirements)).includes('duplicate-award'),'one source course may not silently satisfy two requirements');
    assert.deepEqual(codes(await verifyMutation(f,d=>{twoRequirements(d);d.programs[0].policies={oneAwardPerSourceCourse:{value:true,sourceIds:['demo-agreement']}};})),[],'a documented single-award policy lets the planner choose one placement');
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies[0].placements={bsm:{optionId:'forced'}};})).includes('placement-out-of-scope'));
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies[0].creditSystem='quarter';})).includes('mixed-units'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].creditSystem='quarter';})).includes('mixed-units'));
    assert.ok(codes(await verifyMutation(f,d=>{delete d.provider.courses[0].sourceCreditSystem;})).includes('source-units'));
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies[0].credits=4;})).includes('over-award'));
    assert.ok(codes(await verifyMutation(f,d=>{d.equivalencies.equivalencies[1].receivingCode='BUS 499';})).includes('institutional-only-option'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].routeIds=['not-in-directory'];})).includes('route-unknown'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].review={status:'reviewed'};})).includes('review-incomplete'));
    await writeFile(f.data.school.sources[0].capture,'tampered');
    assert.ok(codes(await verifyKit(await loadKit(f.dir),{asOf:'2026-11-20',routeIds:f.routeIds()})).includes('capture-missing'),'an edited capture no longer matches its sidecar hash');
  }finally{await f.cleanup();}
});

test('capture strips markup to text and records url, fetch time and sha256',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pathway-capture-'));
  try{
    const result=await capture('https://demo.example/page',{dir,fetchImpl:async url=>({ok:true,status:200,url,headers:{get:()=>'text/html'},text:async()=>html}),now:()=>new Date('2026-11-02T03:04:05Z')});
    assert.match(result.path,/[0-9a-f]{16}\.txt$/);
    const text=await readFile(result.path,'utf8'),meta=JSON.parse(await readFile(result.sidecar,'utf8'));
    assert.ok(text.includes('BUS 101'.replace(' ',' '))||text.includes('BUS 101'));
    assert.ok(!text.includes('Secret')&&!text.includes('p{}'),'scripts and styles are dropped');
    assert.deepEqual([meta.url,meta.fetchedAt,meta.sha256.slice(0,16)],['https://demo.example/page','2026-11-02T03:04:05.000Z',result.path.slice(-20,-4)]);
    assert.equal(htmlToText('<p>A&amp;B &#8211; C</p>'),'A&B – C\n');
    await assert.rejects(capture('https://demo.example/missing',{dir,fetchImpl:async()=>({ok:false,status:404})}),/HTTP 404/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('drafting without a key only captures; with a key it calls the Messages API and produces an uncompiled, verified draft',async()=>{
  const f=await fixture();
  const page='<html><body><h1>Demo Finance</h1><p>FIN 201 Corporate Finance 3 credits</p><p>MTH 120 Statistics 3 credits</p><p>Total: 6 credits</p></body></html>';
  const calls=[];
  const draft={title:'Demo Finance',level:'bachelor',catalog:'2026',totalCredits:6,creditSystem:'semester',totalCreditsQuote:'Total: 6 credits',gaps:['General education is not listed on this page.'],requirements:[{code:'FIN 201',title:'Corporate Finance',credits:3,category:'core',institutionalOnly:false,quote:'FIN 201 Corporate Finance 3 credits'},{code:'MTH 120',title:'Statistics',credits:3,category:'core',institutionalOnly:false,quote:'MTH 120 Statistics 4 credits'}]};
  const fetchImpl=async(url,init)=>{calls.push({url,init});if(url===API_URL)return {ok:true,status:200,json:async()=>({model:MODEL,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(draft)}]})};return {ok:true,status:200,url,headers:{get:()=>'text/html'},text:async()=>page};};
  try{
    const logs=[];
    const none=await draftProgram({kitDir:f.dir,programUrl:'https://demo.example/finance',apiKey:'',fetchImpl,today:'2026-11-20',captureDir:f.captures,base:f.base,log:m=>logs.push(m)});
    assert.equal(none.program,null);assert.equal(calls.length,1,'no API call without a key');
    assert.match(logs.join('\n'),/ANTHROPIC_API_KEY is not set/);
    calls.length=0;
    const result=await draftProgram({kitDir:f.dir,programUrl:'https://demo.example/finance',apiKey:'test-key',fetchImpl,today:'2026-11-20',captureDir:f.captures,base:f.base,log:()=>{}});
    const api=calls.find(c=>c.url===API_URL),body=JSON.parse(api.init.body);
    assert.equal(api.init.headers['x-api-key'],'test-key');
    assert.equal(api.init.headers['anthropic-version'],'2023-06-01');
    assert.equal(body.model,'claude-opus-5-5');
    assert.equal(body.output_config.format.type,'json_schema');
    assert.ok(body.output_config.format.schema.properties.requirements.items.required.includes('quote'));
    assert.match(body.messages[0].content[0].text,/FIN 201 Corporate Finance 3 credits/);
    assert.equal(result.program.review.status,'draft');
    assert.ok(result.program.requirements.every(r=>r.quotes.length===1&&r.sourceIds[0]===r.quotes[0].sourceId));
    assert.deepEqual(result.errors.map(e=>e.code),['quote-not-found'],'the unsupported 4-credit quote is caught immediately');
    const kit=await loadKit(f.dir);
    assert.deepEqual(compileKit(kit).skipped,[{slug:'demo-finance',status:'draft'}]);
    assert.ok(!compileKit(kit).doc.models.some(m=>m.title==='Demo Finance'),'drafts never compile');
    // A reviewer corrects the quote, binds the directory route and signs the review: now it compiles.
    const path=join(f.dir,'programs','demo-finance.json'),program=await readJSON(path);
    program.requirements[1].quotes[0].text='MTH 120 Statistics 3 credits';program.routeIds=['demo-bba'];program.review={status:'reviewed',reviewer:'Test Reviewer',reviewedOn:'2026-11-20'};
    await writeJSON(path,program);
    const reviewed=await loadKit(f.dir),check=await verifyKit(reviewed,{asOf:'2026-11-20',routeIds:f.routeIds(),base:f.base});
    assert.deepEqual(check.errors,[]);
    assert.ok(compileKit(reviewed).doc.models.some(m=>m.title==='Demo Finance'));
  }finally{await f.cleanup();}
});

/** A minimal one-page PDF whose text layer holds the given lines (Helvetica, one line per row). */
function pdfBytes(lines){
  const content=lines.length?'BT /F1 12 Tf '+lines.map((line,i)=>`1 0 0 1 72 ${720-i*20} Tm (${line.replace(/[()\\]/g,'\\$&')}) Tj`).join(' ')+' ET':'';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out='%PDF-1.4\n';const offsets=[];
  objects.forEach((body,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=out.length;
  out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
const pdfResponse=(bytes,type='application/pdf')=>async url=>({ok:true,status:200,url,headers:{get:()=>type},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});

test('capture extracts a PDF text layer line by line so table rows can be quoted, and rejects PDFs without text',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pathway-capture-pdf-'));
  try{
    const rows=['Course by Course Equivalency','Introduction to Psychology: PSYC1010 3 PSY 101- Introduction to Psychology 3LL','Microeconomics: ECON1002 3 ECO 260- Microeconomics 3LL'];
    const result=await capture('https://demo.example/guide.pdf',{dir,fetchImpl:pdfResponse(pdfBytes(rows)),now:()=>new Date('2026-11-20T00:00:00Z')});
    assert.deepEqual((await readFile(result.path,'utf8')).trim().split('\n'),rows,'one visual row per line, top to bottom');
    const meta=JSON.parse(await readFile(result.sidecar,'utf8'));
    assert.equal(meta.contentType,'application/pdf');assert.equal(meta.sha256.slice(0,16),result.path.slice(-20,-4));
    await assert.rejects(capture('https://demo.example/scan.pdf',{dir,fetchImpl:pdfResponse(pdfBytes([]))}),/no text layer/);
    const generic=await capture('https://demo.example/other',{dir,fetchImpl:pdfResponse(pdfBytes(['Signature detected']),'application/octet-stream')});
    assert.equal(generic.text,'Signature detected\n','a PDF served with a generic type is recognised by its signature');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('named institution courses compile to University options and are verified like other claims',async()=>{
  const f=await fixture();
  try{
    const named={code:'BUS 210',title:'Business Writing',credits:3,sourceIds:['demo-catalog']};
    const data=clone(f.data);data.programs[0].requirements[0].institutionOptions=[named];await f.write(data);
    const kit=await loadKit(f.dir);
    assert.deepEqual((await verifyKit(kit,{asOf:'2026-11-20',routeIds:f.routeIds()})).errors,[]);
    const bba=compileKit(kit).doc.models[0],options=bba.requirements[0].options;
    assert.deepEqual(options.map(o=>o.provider),['Sophia','University'],'provider options first, then the named institution course');
    assert.deepEqual(options[1],{id:'university-bus-210',provider:'University',code:'BUS 210',title:'Business Writing',credits:3,upper:false,creditSystem:'semester',creditOrigin:'institutional',sourceIds:['demo-catalog'],evidence:'published'});
    assert.ok(!('institutionOptions' in bba.requirements[0]),'the kit field never reaches the compiled model');
    await f.write(f.data);
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].institutionOptions=[{...named,credits:4}];})).includes('institution-option'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].institutionOptions=[{...named,sourceIds:['no-such-source']}];})).includes('unknown-source'));
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].upper=true;d.programs[0].requirements[0].institutionOptions=[named];})).includes('institution-option'),'a lower-level course cannot fill an upper-level requirement');
    assert.ok(codes(await verifyMutation(f,d=>{d.programs[0].requirements[0].institutionOptions=[named,named];})).includes('institution-option'));
  }finally{await f.cleanup();}
});

test('shared provider identities are checked as each published row compiles them, so a second school kit can reuse them',async()=>{
  const f=await fixture();
  try{
    const foreign=d=>{d.provider.courses[0].identitySourceIds=['other-school-source'];};
    assert.ok(codes(await verifyMutation(f,foreign)).includes('unknown-source'),'another kit’s source on a published shared identity is an error');
    assert.deepEqual(codes(await verifyMutation(f,d=>{foreign(d);d.equivalencies.equivalencies[0].identity={identitySourceIds:['sophia-catalog']};})),[],'a row-level identity with this kit’s own evidence compiles cleanly');
    assert.deepEqual(codes(await verifyMutation(f,d=>{foreign(d);d.equivalencies.equivalencies[0].status='candidate';})),[],'a candidate never compiles, so its shared identity is not published');
  }finally{await f.cleanup();}
});
