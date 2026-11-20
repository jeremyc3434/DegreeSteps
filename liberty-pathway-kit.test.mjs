/** Liberty on the Pathway Factory: registry parity for all 13 models, publication, guards, scope honesty and the new kit features. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {loadKit,kitsRoot,readJSON,root,canonical,clone,list,inScope,matchRequirement,parsePlacement} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards,serializePublished,publishedDocuments,rowsFor} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {migrate,factoryInput,parity,files,electiveCondition} from './scripts/pathway-factory/migrate-liberty.mjs';

const dir=join(kitsRoot,'liberty'),kit=await loadKit(dir),{doc,documents}=compileKit(kit);
const registry=await readJSON(resolve(root,'dist/data/curriculum-registry.json'));
const guards=(await import('./content/pathway-kits/liberty/guards.mjs')).checks,guard=name=>guards.find(check=>check.name===name);
const outsideOptions=models=>models.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+r.options.filter(o=>o.provider!=='University').length,0),0);

test('compile(kit) reproduces every Liberty registry model exactly: 13 models, full deep equality',async()=>{
  let compared=0;
  for(const name of files){
    const compiled=await readJSON(resolve(root,'dist/data/curricula/'+name+'.json'));
    for(const model of compiled.models){
      const entry=registry.models.find(e=>e.id===model.id),expected=factoryInput(model,entry.routeIds),got=doc.models.find(m=>m.id===model.id);
      assert.ok(got,model.id+' compiled');
      assert.deepEqual(canonical(got),canonical(expected),model.id+' differs from the registry output');
      compared++;
    }
  }
  assert.equal(compared,13);assert.equal(kit.programs.filter(p=>p.review.status==='migrated').length,13);
  assert.ok(outsideOptions(doc.models)>9000,'every outside option is carried');
  // The published factory documents compile through the registry's generic stages to exactly the committed outputs.
  const result=spawnSync(process.execPath,['scripts/build-curriculum-registry.mjs','--check'],{cwd:root,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('the Liberty kit is the source of truth: it verifies, passes its guards and publishes its four documents exactly',async()=>{
  const result=await verifyKit(kit,{asOf:kit.school.checkedOn});
  assert.deepEqual(result.errors,[]);
  assert.equal(await runGuards(kit,doc),guards.length);assert.ok(guards.length>=10);
  assert.deepEqual(documents.map(d=>d.path),[...files.map(name=>'content/curricula/'+name+'.json'),'content/curricula/liberty-pathway-kit.json']);
  for(const {path,doc:published}of documents){
    assert.equal(published.compiledBy,'pathway-factory',path);
    assert.equal(published.sources,undefined,'each model carries exactly its own sources: '+path);
    assert.equal(await readFile(resolve(root,path),'utf8'),serializePublished(published,{compact:true}),path+' is stale');
  }
  const check=spawnSync(process.execPath,['scripts/pathway-factory/compile.mjs','liberty','--publish','--check'],{cwd:root,encoding:'utf8',timeout:60000});
  assert.equal(check.status,0,check.stderr||check.stdout);
});

test('a fresh migration of the registry output reproduces the committed kit',async()=>{
  const fresh=await migrate();
  assert.deepEqual(canonical(fresh.equivalencies),canonical(kit.equivalencies));
  assert.deepEqual(canonical(fresh.school),canonical(kit.school));
  for(const program of fresh.programs){const committed=kit.programs.find(p=>p.slug===program.slug);const {file:_f,...rest}=committed;assert.deepEqual(canonical(program),canonical(rest),program.slug);}
  assert.deepEqual(parity(fresh.documents.flatMap(d=>d.models),doc.models),[]);
});

test('institution-wide rows are never wider than the data and reuse one award across many degrees',()=>{
  const rows=kit.equivalencies.equivalencies,wide=rows.filter(row=>row.scope.all);
  const placements=new Map();
  for(const p of kit.programs)for(const r of p.requirements)for(const entry of list(r.optionRows)){const {row}=parsePlacement(entry);if(row){if(!placements.has(row))placements.set(row,[]);placements.get(row).push([p.slug,r.id]);}}
  assert.ok(wide.length>250);
  for(const row of wide){
    for(const field of ['levels','modalities','catalogs'])assert.ok(Array.isArray(row.scope[field])&&row.scope[field].length,row.id+' scope names its '+field);
    if(Array.isArray(row.extra?.degreeLevels))assert.ok(row.scope.levels.every(level=>row.extra.degreeLevels.includes(level)),row.id+' levels stay within the award');
    if(Array.isArray(row.extra?.modalities))assert.ok(row.scope.modalities.every(mode=>row.extra.modalities.includes(mode)),row.id+' formats stay within the award');
    // Migrated ledgers record what the school actually placed; authored ledgers keep one record per provider course.
    for(const p of kit.programs.filter(p=>p.review.status==='migrated')){
      if(!inScope(row,p,kit))continue;
      const req=matchRequirement(row,p);
      if(req&&!req.institutionalOnly&&req.credits===row.credits)assert.ok(list(placements.get(row.id)).some(([slug,id])=>slug===p.slug&&id===req.id),`${row.id} is institution-wide but missing from ${p.slug}/${req.id}`);
    }
  }
  for(const row of rows)for(const [slug] of list(placements.get(row.id)))assert.ok(inScope(row,kit.programs.find(p=>p.slug===slug),kit),row.id+' placed out of scope');
  const placed=[...placements.values()].reduce((n,list)=>n+list.length,0);
  assert.ok(placed/rows.length>8,'one equivalency row serves many placements');
});

test('Liberty guards reject academic regressions in a compiled document',()=>{
  const fresh=()=>clone(doc),model=d=>d.models.find(m=>m.id==='curriculum-liberty-psychology-bs-online'),req=(d,id)=>model(d).requirements.find(r=>r.id===id);
  const option=(d,id,optionId)=>req(d,id).options.find(o=>o.id===optionId);
  const cases=[
    ['semesterLedgers',d=>{req(d,'psyc-354').credits=4;}],
    ['semesterLedgers',d=>{model(d).creditSystem='quarter';}],
    ['residencyFromProgramTotal',d=>{model(d).institutionMinCredits=24;}],
    ['residencyFromProgramTotal',d=>{model(d).externalMaxCredits=96;}],
    ['upperMajorGradeMinimum',d=>{delete req(d,'psyc-354').minimumGrade;}],
    ['institutionOnlyStaysAtLiberty',d=>{req(d,'univ-104').options.push({id:'x',provider:'Sophia',code:'SOPH-0001',credits:3,sourceIds:[]});}],
    ['awardsFitTheirRequirement',d=>{option(d,'free-electives-1','straighterline-oosl-0108').credits=6;}],
    ['awardsFitTheirRequirement',d=>{option(d,'free-electives-1','straighterline-oosl-0108').sourceIds=['not-a-model-source'];}],
    ['awardsWithinDocumentedScope',d=>{option(d,'free-electives-1','liberty-named-straighterline-oosl-0055-envr-215').degreeLevels=['associate'];}],
    ['awardsWithinDocumentedScope',d=>{option(d,'free-electives-1','liberty-named-straighterline-oosl-0055-envr-215').degreeLevels=['associate','bachelor','master'];}],
    ['awardsWithinDocumentedScope',d=>{option(d,'free-electives-1','liberty-named-straighterline-oosl-0055-envr-215').modalities=['campus'];}],
    ['upperFollowsReceivingCode',d=>{const o=option(d,'free-electives-1','liberty-named-straighterline-oosl-0055-envr-215');o.upper=!o.upper;}],
    ['electiveBlocksStayConditional',d=>{option(d,'free-electives-1','straighterline-oosl-0108').evidence='published';}],
    ['sharedAwardLineage',d=>{option(d,'free-electives-1','liberty-named-sophia-soph-0016-envr-215').sharedAwardProvenance.awardId='not-in-the-bundle';}],
    ['reviewedLedgerTotals',d=>{d.models.find(m=>m.id==='curriculum-liberty-history-bs-online').requirements.find(r=>r.category==='major').category='general';}]
  ];
  for(const [name,mutate]of cases){
    assert.ok(guard(name),name);assert.doesNotThrow(()=>guard(name)(doc,kit),name+' passes on the published document');
    const broken=fresh();mutate(broken);assert.throws(()=>guard(name)(broken,kit),name+' must reject the regression');
  }
  assert.ok(electiveCondition.startsWith('Proposed use in this published elective block'));
});

test('verification gates explicit placements, modes, inline options, unknown quantities and implied units',async()=>{
  const k=clone(kit);k.providers=new Map([...kit.providers].map(([name,p])=>[name,clone(p)]));k.dir=kit.dir;
  const program=k.programs.find(p=>p.slug==='psychology-bs-residential'),online=k.programs.find(p=>p.slug==='psychology-bs-online');
  const rows=k.equivalencies.equivalencies,onlineOnly=rows.find(r=>r.scope.all&&r.scope.modalities.join()==='online');
  const engl=program.requirements.find(r=>r.id==='engl-101');
  engl.optionRows.push(onlineOnly.id,{inline:{id:'outside-inline',provider:'Sophia',code:'SOPH-0015',credits:3,creditOrigin:'alternative'}},rows[0].id+'@no-such-mode');
  const candidate=rows.find(r=>!r.scope.all&&r.scope.programs.includes('psychology-bs-online'));candidate.status='candidate';
  const implied=rows.find(r=>r.impliedCreditSystem);delete implied.impliedCreditSystem;
  const sophia=k.providers.get('Sophia'),unknown=sophia.courses.find(c=>c.sourceCredits===null)||sophia.courses[0];unknown.sourceCredits=null;unknown.sourceCreditSystem='semester';
  const clep=k.providers.get('CLEP');delete clep.courses[0].sourceCredits;
  // A newly reviewed ledger may not repeat one source course in a requirement, even though migrated ledgers keep legacy alternatives.
  online.review={status:'reviewed',reviewer:'test',reviewedOn:'2026-11-20'};
  const result=await verifyKit(k,{asOf:'2026-11-20'}),codes=new Set(result.errors.map(e=>e.code));
  for(const code of ['placement-out-of-scope','inline-option','unknown-mode','placement-candidate','row-units','source-units','source-credits','duplicate-award'])assert.ok(codes.has(code),'expected '+code+' error');
  assert.ok(result.errors.some(e=>e.code==='placement-out-of-scope'&&e.message.includes(onlineOnly.id)),'an online-only award cannot be placed in a campus degree');
  assert.ok(result.errors.some(e=>e.code==='duplicate-award'&&e.message.startsWith('psychology-bs-online')));
  assert.ok(!result.errors.some(e=>e.code==='duplicate-award'&&e.message.startsWith('psychology-addictions-online')),'migrated ledgers report legacy duplicates as warnings');
});

test('publishedDocuments splits a kit across documents and gives unlisted programs to the catch-all document',()=>{
  const stub={school:{id:'x',checkedOn:'2026-11-20',publish:{compiledBy:'pathway-factory',documents:[{path:'a.json',programs:['one'],sources:false,routes:[{id:'r'}]},{path:'b.json',checkedOn:'2026-11-19'}]}},programs:[{slug:'one',review:{status:'reviewed'}},{slug:'two',review:{status:'reviewed'}},{slug:'three',review:{status:'draft'}}]};
  const out=publishedDocuments(stub,{sources:[{id:'s'}],models:[{id:'curriculum-x-one'},{id:'curriculum-x-two'}]});
  assert.deepEqual(out.map(d=>[d.path,d.doc.models.map(m=>m.id),d.doc.checkedOn,d.doc.compiledBy,Boolean(d.doc.sources),Boolean(d.doc.routes)]),[['a.json',['curriculum-x-one'],'2026-11-20','pathway-factory',false,true],['b.json',['curriculum-x-two'],'2026-11-19','pathway-factory',true,false]]);
});

const authored=['religion-aa-online','apologetics-aa-online','criminal-justice-aa-online','accounting-aa-online'];
test('kit-authored Liberty programs are grounded, balanced, in scope and flow through the publication gates',async()=>{
  const quality=await readJSON(resolve(root,'dist/data/pathway-quality-report.json')),catalog=await readJSON(resolve(root,'dist/data/program-catalog.json'));
  const rows=new Map(kit.equivalencies.equivalencies.map(row=>[row.id,row]));
  for(const slug of authored){
    const program=kit.programs.find(p=>p.slug===slug);assert.ok(program,slug);
    assert.equal(program.review.status,'reviewed');assert.equal(program.review.reviewer,'Claude (pathway factory)');
    assert.equal(program.routeIds.length,1);assert.ok(catalog.programs.some(route=>route.id===program.routeIds[0]&&route.schoolId==='liberty'&&route.level==='associate'),slug+' uses an exact directory route');
    assert.equal(program.requirements.reduce((n,r)=>n+r.credits,0),60);
    for(const r of program.requirements)assert.ok(r.quotes?.length&&r.quotes.every(q=>r.sourceIds.includes(q.sourceId)),slug+'/'+r.id+' is quoted from its own sources');
    assert.ok(program.sources.every(source=>source.capture&&source.checked==='2026-11-20'));
    const model=doc.models.find(m=>m.id===program.modelId);
    for(const r of model.requirements){
      const keys=r.options.map(o=>o.provider+'|'+o.code);assert.equal(new Set(keys).size,keys.length,slug+'/'+r.id+' carries one record per provider course');
      const ledger=program.requirements.find(x=>x.id===r.id),placed=ledger.optionRows?ledger.optionRows.map(e=>rows.get(parsePlacement(e).row)):rowsFor(kit,program,ledger);
      assert.equal(placed.length,r.options.length);
      for(const row of placed)assert.ok(row.scope.all&&inScope(row,program,kit)&&row.credits===r.credits,slug+'/'+r.id+': '+row.id+' is an institution-wide row in scope');
      for(const o of r.options)assert.ok(!list(o.conditions).some(text=>text===electiveCondition||/^This requirement needs a grade of /.test(text)),slug+': no placement context from another requirement');
    }
    const result=quality.programs.find(item=>item.modelId===program.modelId);assert.ok(result,slug+' reaches the quality report');assert.equal(result.publication.ready,false);
  }
  const available=authored.filter(slug=>quality.programs.find(item=>item.modelId==='curriculum-liberty-'+slug).readyTemplate);
  assert.deepEqual(available,['religion-aa-online','apologetics-aa-online','criminal-justice-aa-online']);
  assert.ok(quality.programs.find(item=>item.modelId==='curriculum-liberty-accounting-aa-online').findings.some(f=>f.blocking&&f.code==='validation-selection_required'),'the undesignated ACCT elective keeps Accounting (A.A.) unavailable');
});
