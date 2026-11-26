/** TESU on the Pathway Factory: registry parity for all five models, publication, guards and the retired importers' ledgers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {loadKit,kitsRoot,readJSON,root,canonical,clone,list,inScope,matchRequirement,parsePlacement,normalizeText,sourceIndex} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards,serializePublished} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {factoryInput} from './scripts/pathway-factory/migrate-liberty.mjs';
import {migrate,parity,files} from './scripts/pathway-factory/migrate-tesu.mjs';

const dir=join(kitsRoot,'tesu'),kit=await loadKit(dir),{doc,documents}=compileKit(kit);
const registry=await readJSON(resolve(root,'dist/data/curriculum-registry.json'));
const guards=(await import('./content/pathway-kits/tesu/guards.mjs')).checks,guard=name=>guards.find(check=>check.name===name);

test('compile(kit) preserves all five originally migrated TESU registry models with full deep equality',async()=>{
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

test('the TESU kit verifies and publishes the five original plus three newly authored degree documents exactly',async()=>{
  const result=await verifyKit(kit,{asOf:'2026-11-26'});
  assert.deepEqual(result.errors,[]);
  assert.equal(await runGuards(kit,doc),guards.length);assert.ok(guards.length>=9);
  assert.deepEqual(documents.map(d=>d.path),[...files.map(name=>'content/curricula/'+name+'.json'),'content/curricula/tesu-human-resources-organizational-management.json','content/curricula/tesu-marketing.json','content/curricula/tesu-bs-general-management.json']);
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

test('the migration tool still decomposes the current registry output into the committed ledgers',async()=>{
  // Parity at the switch (commit "Publish TESU curricula from a Pathway Factory kit") was exact for the whole kit. The kit has
  // since gained authored, source-grounded equivalency rows, so a fresh decomposition is compared on its ledgers and models.
  const fresh=await migrate();
  assert.deepEqual(parity(fresh.documents.flatMap(d=>d.models),doc.models),[]);
  const migratedSlugs=new Set(fresh.programs.map(program=>program.slug)),roundtrip={...kit,school:fresh.school,equivalencies:fresh.equivalencies,providers:fresh.providers,programs:[...fresh.programs,...kit.programs.filter(program=>!migratedSlugs.has(program.slug))]};
  const rebuilt=compileKit(roundtrip).doc;
  assert.equal(rebuilt.models.length,doc.models.length);
  assert.deepEqual(parity(doc.models,rebuilt.models),[],'Migration also preserves all three separately authored models, exact course evidence and saved option IDs');
  assert.equal(await runGuards(roundtrip,rebuilt),guards.length);
  for(const program of fresh.programs){
    const committed=kit.programs.find(p=>p.slug===program.slug),strip=p=>p.requirements.map(({optionRows,...r})=>r);
    assert.deepEqual(canonical(strip(program)),canonical(strip(committed)),program.slug+' ledger');
    assert.deepEqual(canonical(program.modelFields),canonical(committed.modelFields),program.slug+' model fields');
  }
});

test('TESU-submitted equivalencies replace copied same-school Sophia awards with grounded institution-wide rows',async()=>{
  const authored=kit.equivalencies.equivalencies.filter(row=>row.authored),sophia=kit.providers.get('Sophia');
  assert.equal(authored.length,35);
  for(const row of authored){
    assert.equal(row.provider,'Sophia');assert.equal(row.evidence,'published');assert.equal(row.extra.courseEligibilityResolution.status,'resolved');assert.equal(row.extra.courseEligibilityResolution.checkedOn,'2026-11-26');assert.equal(row.extra.eligibilityReview.providerReviewPending,true);assert.equal(row.extra.eligibilityReview.fullyApproved,false);
    assert.deepEqual(row.scope,{all:true,levels:['bachelor'],modalities:['online'],catalogs:[kit.programs[0].catalog]});
    const source=sourceIndex(kit,kit.programs[0]).get(row.sourceIds[0])?.source,sidecar=await readJSON(resolve(root,source.capture.replace(/\.txt$/,'.json')));
    assert.equal(sidecar.url,source.url,row.id+' capture is the cited ACE page');
    const text=normalizeText(await readFile(resolve(root,source.capture),'utf8'));
    assert.ok(text.includes(normalizeText(`2026-2027 Thomas Edison State University ${row.credits} ${row.receivingCode} ${row.receivingTitle}`)),row.id+' TESU equivalency is in its capture');
    assert.ok(text.includes(normalizeText('ACE ID: '+row.code)),row.id+' ACE identity is in its capture');
  }
  const names=row=>[row.code,row.identity?.aceId,...list(row.identity?.codeAliases)].filter(Boolean).map(v=>String(v).toLowerCase());
  const rows=new Map(kit.equivalencies.equivalencies.map(row=>[row.id,row]));
  for(const program of kit.programs)for(const requirement of program.requirements){
    const placed=list(requirement.optionRows).map(parsePlacement).filter(p=>p.row).map(p=>rows.get(p.row));
    for(const row of placed.filter(row=>row.authored)){
      const copies=placed.filter(other=>other!==row&&other.provider==='Sophia'&&/researched in another degree/.test(other.extra?.mappingScope||'')&&names(other).some(n=>names(row).includes(n)||n===sophia.courses.find(c=>c.code===row.code)?.title.toLowerCase()));
      assert.deepEqual(copies.map(c=>c.id),[],program.slug+'/'+requirement.id+': a copied award of '+row.code+' is superseded, not duplicated');
    }
  }
  // Placement option ids stay unique, so saved selections keep pointing at one option.
  for(const model of doc.models)for(const requirement of model.requirements){const ids=requirement.options.map(o=>o.id);assert.equal(new Set(ids).size,ids.length,model.id+'/'+requirement.id);}
  // A quote that is not in its capture is a hard verification error.
  const broken=clone(kit);broken.providers=kit.providers;broken.dir=kit.dir;
  broken.equivalencies.equivalencies.find(row=>row.authored).quotes[1].text='2026-2027 Thomas Edison State University 6 MAT-9999 Invented Course';
  assert.ok((await verifyKit(broken,{asOf:'2026-11-26'})).errors.some(e=>e.code==='quote-not-found'));
});

test('the retired importers still build exactly the ledger the kit publishes',async()=>{
  for(const name of files){
    const importer=await import('./scripts/import-'+name+'.mjs'),result=await importer.run({check:true});
    assert.equal(result.newProviderEquivalencies,0);
    await assert.rejects(importer.run(),/Retired/,name+' no longer writes content/curricula');
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
  const aceOption=d=>req(d,'MAT-1210').options.find(o=>o.mappingReviewId==='tesu-ace-institution-equivalencies-2026-11-20');
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
    ['businessCourseCurrency',d=>{const g=model(d).existingCreditReview.groups.find(g=>g.maxAgeYears===10);g.maxOlderCredits=g.totalCredits;}],
    ['provisionalProvidersStayRestricted',d=>{aceOption(d).eligibilityReview.providerReviewPending=false;}],
    ['provisionalProvidersStayRestricted',d=>{const o=req(d,'SOC-1010').options.find(o=>o.provider==='Sophia');delete o.eligibilityReview;o.conditions=o.conditions.filter(c=>!/provisional|no established/i.test(c));}],
    ['schoolSubmittedMatchesAreExact',d=>{aceOption(d).mappingEvidence.catalogYear='2025-2026';}],
    ['schoolSubmittedMatchesAreExact',d=>{const option=aceOption(d);delete option.courseEligibilityResolution;option.evidence='published';}],
    ['schoolSubmittedMatchesAreExact',d=>{req(d,'ENC-1010').options.unshift(clone(aceOption(d)));}]
  ];
  for(const [name,mutate]of cases){
    assert.ok(guard(name),name);assert.doesNotThrow(()=>guard(name)(doc,kit),name+' passes on the published document');
    const broken=fresh();mutate(broken);assert.throws(()=>guard(name)(broken,kit),name+' must reject the regression');
  }
  // Authored institution-wide rows must quote TESU's own equivalency and the exact ACE identity.
  const grounded=guard('authoredRowsAreGrounded');assert.doesNotThrow(()=>grounded(doc,kit));
  for(const mutate of [row=>{row.quotes=row.quotes.filter(q=>!q.text.includes('Thomas Edison State University'));},row=>{row.quotes=row.quotes.filter(q=>!q.text.startsWith('ACE ID: '));},row=>{row.scope={programs:['bsba-finance']};},row=>{row.evidenceType='community-reported';}]){
    const k={...kit,equivalencies:clone(kit.equivalencies)};mutate(k.equivalencies.equivalencies.find(row=>row.authored));
    assert.throws(()=>grounded(doc,k),'authoredRowsAreGrounded must reject an ungrounded authored row');
  }
});
