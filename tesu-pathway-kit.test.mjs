/** TESU on the Pathway Factory: registry parity for all five models, publication, guards and the retired importers' ledgers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {loadKit,kitsRoot,readJSON,root,canonical,clone,list,inScope,matchRequirement,parsePlacement} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards,serializePublished} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {factoryInput} from './scripts/pathway-factory/migrate-liberty.mjs';
import {migrate,parity,files} from './scripts/pathway-factory/migrate-tesu.mjs';

const dir=join(kitsRoot,'tesu'),kit=await loadKit(dir),{doc,documents}=compileKit(kit);
const registry=await readJSON(resolve(root,'dist/data/curriculum-registry.json'));
const guards=(await import('./content/pathway-kits/tesu/guards.mjs')).checks,guard=name=>guards.find(check=>check.name===name);

test('compile(kit) reproduces every TESU registry model exactly: five models, full deep equality',async()=>{
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
  assert.equal(compared,5);
  // The published factory documents compile through the registry's generic stages to exactly the committed outputs.
  const result=spawnSync(process.execPath,['scripts/build-curriculum-registry.mjs','--check'],{cwd:root,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('the TESU kit is the source of truth: it verifies, passes its guards and publishes its five documents exactly',async()=>{
  const result=await verifyKit(kit,{asOf:'2026-11-20'});
  assert.deepEqual(result.errors,[]);
  assert.equal(await runGuards(kit,doc),guards.length);assert.ok(guards.length>=9);
  assert.deepEqual(documents.map(d=>d.path),files.map(name=>'content/curricula/'+name+'.json'));
  for(const {path,doc:published}of documents){
    assert.equal(published.compiledBy,'pathway-factory',path);
    assert.equal(published.routes.length,1,path+' declares its degree route');
    assert.equal(await readFile(resolve(root,path),'utf8'),serializePublished(published,{compact:true}),path+' is stale');
  }
  const check=spawnSync(process.execPath,['scripts/pathway-factory/compile.mjs','tesu','--publish','--check'],{cwd:root,encoding:'utf8',timeout:60000});
  assert.equal(check.status,0,check.stderr||check.stdout);
  // The legacy General Management model keeps its own path and pipeline.
  assert.ok(!kit.programs.some(p=>p.modelId==='tesu-general-management'));
});

test('a fresh migration of the registry output reproduces the committed kit',async()=>{
  const fresh=await migrate();
  assert.deepEqual(canonical(fresh.equivalencies),canonical(kit.equivalencies));
  assert.deepEqual(canonical(fresh.school),canonical(kit.school));
  for(const program of fresh.programs){const committed=kit.programs.find(p=>p.slug===program.slug);const {file:_f,...rest}=committed;assert.deepEqual(canonical(program),canonical(rest),program.slug);}
  assert.deepEqual(parity(fresh.documents.flatMap(d=>d.models),doc.models),[]);
});

test('the retired importers still build exactly the ledger the kit publishes',async()=>{
  for(const name of files){
    const result=spawnSync(process.execPath,['scripts/import-'+name+'.mjs','--check'],{cwd:root,encoding:'utf8',timeout:60000});
    assert.equal(result.status,0,name+': '+(result.stderr||result.stdout));
    assert.equal(JSON.parse(result.stdout).newProviderEquivalencies,0);
    const write=spawnSync(process.execPath,['scripts/import-'+name+'.mjs'],{cwd:root,encoding:'utf8',timeout:60000});
    assert.notEqual(write.status,0,name+' no longer writes content/curricula');assert.match(write.stderr,/Retired/);
  }
});

test('institution-wide rows are never wider than the data and every placement is in scope',()=>{
  const rows=kit.equivalencies.equivalencies,placements=new Map();
  for(const p of kit.programs)for(const r of p.requirements)for(const entry of list(r.optionRows)){const {row}=parsePlacement(entry);if(row){if(!placements.has(row))placements.set(row,[]);placements.get(row).push([p.slug,r.id]);}}
  for(const row of rows)for(const [slug] of list(placements.get(row.id)))assert.ok(inScope(row,kit.programs.find(p=>p.slug===slug),kit),row.id+' placed out of scope');
  for(const row of rows.filter(row=>row.scope.all)){
    for(const field of ['levels','modalities','catalogs'])assert.ok(Array.isArray(row.scope[field])&&row.scope[field].length,row.id+' scope names its '+field);
    for(const p of kit.programs.filter(p=>p.review.status==='migrated')){
      if(!inScope(row,p,kit))continue;
      const req=matchRequirement(row,p);
      if(req&&!req.institutionalOnly&&req.credits===row.credits)assert.ok(list(placements.get(row.id)).some(([slug,id])=>slug===p.slug&&id===req.id),`${row.id} is institution-wide but missing from ${p.slug}/${req.id}`);
    }
  }
});

test('TESU guards reject academic regressions in a compiled document',()=>{
  const fresh=()=>clone(doc),model=(d,id='curriculum-tesu-bsba-finance')=>d.models.find(m=>m.id===id),req=(d,code,id)=>model(d,id).requirements.find(r=>r.code===code);
  const outsideOption=(d,id)=>model(d,id).requirements.flatMap(r=>r.options.filter(o=>o.provider!=='University').map(o=>({r,o})))[0];
  const cases=[
    ['semesterLedgers',d=>{req(d,'MAN-2100').credits=4;}],
    ['semesterLedgers',d=>{model(d).creditSystem='quarter';}],
    ['semesterLedgers',d=>{req(d,'ENC-1010').category='major';}],
    ['reviewedLedgerShapes',d=>{req(d,'FIN-3140').group='business-core';}],
    ['reviewedLedgerShapes',d=>{req(d,'LIT-2050','curriculum-tesu-ba-english').curriculumBlock='english-electives';}],
    ['distinctNamedCourses',d=>{req(d,'MAN-2100').code='MKT-2010';}],
    ['prerequisitesResolve',d=>{req(d,'FIN-3010').prerequisites=['no-such-requirement'];}],
    ['prerequisitesResolve',d=>{req(d,'ACC-1010').prerequisites=['acc1020'];}],
    ['residencyAndCaps',d=>{model(d).institutionMinCredits=12;}],
    ['residencyAndCaps',d=>{model(d).alternativeMaxCredits=120;}],
    ['residencyAndCaps',d=>{model(d).policyEvidence.upperMinCredits.sourceIds=['not-a-model-source'];}],
    ['gradeMinimums',d=>{delete req(d,'FIN-3340').minimumGrade;}],
    ['gradeMinimums',d=>{delete req(d,'ENC-1020','curriculum-tesu-ba-psychology').minimumGrade;}],
    ['institutionOnlyStaysAtTESU',d=>{req(d,'BUS-4210').options.push({id:'x',provider:'Sophia',code:'SOPH-0001',credits:3,sourceIds:[]});}],
    ['institutionOnlyStaysAtTESU',d=>{req(d,'SOS-1100').institutionalOnly=false;}],
    ['awardsFitTheirRequirement',d=>{const {o}=outsideOption(d);o.credits=6;}],
    ['awardsFitTheirRequirement',d=>{const {o}=outsideOption(d);o.sourceIds=['not-a-model-source'];}],
    ['awardsFitTheirRequirement',d=>{const {o}=outsideOption(d);o.creditSystem='quarter';}],
    ['businessCourseCurrency',d=>{model(d,'curriculum-tesu-bsba-accounting').existingCreditReview.groups.find(g=>g.id==='business-capstone').maxAgeYears=10;}],
    ['businessCourseCurrency',d=>{const g=model(d).existingCreditReview.groups.find(g=>g.maxAgeYears===10);g.maxOlderCredits=g.totalCredits;}]
  ];
  for(const [name,mutate]of cases){
    assert.ok(guard(name),name);assert.doesNotThrow(()=>guard(name)(doc,kit),name+' passes on the published document');
    const broken=fresh();mutate(broken);assert.throws(()=>guard(name)(broken,kit),name+' must reject the regression');
  }
});
