/** Excelsior University kit: grounded publication, school invariants and the registry entries they produce. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readJSON,loadKit,clone,kitsRoot,root} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards,serializePublished} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';

// Evaluate current shared provider evidence without changing Excelsior's policy dates.
const asOf='2026-11-25';
const kit=await loadKit(join(kitsRoot,'excelsior'));
const {doc}=compileKit(kit);
const BUS='curriculum-excelsior-bs-business-no-concentration',PSY='curriculum-excelsior-bs-psychology',LA='curriculum-excelsior-bs-liberal-arts-no-concentration';
const model=(d,id)=>d.models.find(m=>m.id===id);
const outside=r=>r.options.filter(o=>o.provider!=='University');
const codes=result=>result.errors.map(e=>e.code);
const mutated=mutate=>{const copy={...kit,school:clone(kit.school),equivalencies:clone(kit.equivalencies),programs:clone(kit.programs)};mutate(copy);return verifyKit(copy,{asOf});};
const guard=mutate=>{const copy=clone(doc);mutate(copy);return runGuards(kit,copy);};

test('the Excelsior kit verifies with every claim grounded and publishes exactly content/curricula/excelsior.json',async()=>{
  const result=await verifyKit(kit,{asOf});
  assert.deepEqual(result.errors,[]);
  assert.equal(kit.school.publish.path,'content/curricula/excelsior.json');
  assert.equal(serializePublished(doc),await readFile(resolve(root,'content/curricula/excelsior.json'),'utf8'),'content/curricula/excelsior.json is stale; run npm run factory:publish');
  assert.equal(await runGuards(kit,doc),6);
  assert.deepEqual(doc.models.map(m=>m.id),[BUS,PSY,LA]);
  for(const program of kit.programs){
    assert.equal(program.review.status,'reviewed');
    assert.ok(program.requirements.every(r=>r.quotes?.length&&r.sourceIds.length),`${program.slug}: every requirement cites a quoted source`);
  }
  assert.ok(kit.equivalencies.equivalencies.every(row=>row.quotes?.length&&row.sourceIds.length===1),'every equivalency row quotes Excelsior’s guide');
});

test('captured Excelsior policies stay exact: 113-credit transfer ceiling, 7-credit residency, 30 upper-level credits, no invented ACE cap',()=>{
  for(const m of doc.models){
    assert.equal(m.externalMaxCredits,113);assert.equal(m.institutionMinCredits,7);assert.equal(m.upperMinCredits,30);
    assert.equal(m.alternativeMaxCredits,undefined,'no separate ACE/NCCRS ceiling was found');
    assert.deepEqual(m.requirements.filter(r=>r.institutionalOnly).map(r=>r.credits).reduce((a,b)=>a+b,0),7);
    assert.equal(m.pricing.amount,510);assert.equal(m.pricing.period,'credit');
  }
  assert.equal(kit.school.policies.partnershipResidency.value,15);
  assert.equal(kit.school.policies.transferTimeLimit.status,'conflicting','the 10-year guide rule and the no-limit policy are both kept, not reconciled by guess');
});

test('outside options come only from Excelsior’s published guides and keep original quantities separate',()=>{
  const options=doc.models.flatMap(m=>m.requirements.flatMap(outside));
  assert.ok(options.length>100);
  assert.deepEqual([...new Set(options.map(o=>o.provider))].sort(),['Sophia','StraighterLine','Study.com']);
  for(const o of options){
    assert.equal(o.creditSystem,'semester');assert.equal(o.sourceCreditSystem,'semester');assert.ok(o.sourceCredits>0);
    assert.equal(o.evidenceType,'official-receiving-school-equivalency');assert.ok(o.identitySourceIds.length);
  }
  // Sophia rows carry the course code Excelsior's guide prints, proven by Sophia's current syllabus.
  const psych=model(doc,PSY).requirements.find(r=>r.id==='psy-101'),sophia=psych.options.find(o=>o.provider==='Sophia');
  assert.deepEqual([sophia.code,sophia.receivingCode,sophia.codeAliases.includes('PSYC1010'),sophia.identitySourceIds],['SOPH-0048','PSY 101',true,['sophia-soph-0048-syllabus-2026-11-20']]);
  // Guide rows whose Sophia code differs from the current syllabus stay candidates and never compile.
  const candidates=kit.equivalencies.equivalencies.filter(row=>row.status==='candidate').map(row=>row.code).sort();
  assert.deepEqual(candidates,['SOPH-0001','SOPH-0002','SOPH-0029','SOPH-0032','SOPH-0033']);
  assert.ok(!options.some(o=>candidates.includes(o.code)));
  // Excelsior marks Sophia English Composition II not applicable to BUS degrees.
  assert.ok(!model(doc,BUS).requirements.some(r=>outside(r).some(o=>o.code==='SOPH-0030')));
  assert.ok(model(doc,PSY).requirements.find(r=>r.id==='eng-102a').options.some(o=>o.code==='SOPH-0030'));
});

test('verification rejects ungrounded, out-of-scope, mixed-unit and residency-breaking Excelsior edits',async()=>{
  assert.ok(codes(await mutated(k=>{k.equivalencies.equivalencies[0].quotes[0].text='English Composition I: ENG1001 3 Written English Requirement ENG 101- English Composition 4LL';})).includes('quote-not-found'));
  assert.ok(codes(await mutated(k=>{const row=k.equivalencies.equivalencies.find(r=>r.code==='SOPH-0048'&&r.placements['bs-psychology']);row.placements['bs-psychology'].requirementId='la-498psy';})).includes('institutional-only-option'),'the capstone stays at Excelsior');
  assert.ok(codes(await mutated(k=>{const row=k.equivalencies.equivalencies.find(r=>r.code==='SOPH-0030');row.placements['bs-business-no-concentration']={requirementId:'eng-102a'};})).includes('placement-out-of-scope'),'ENG1002 is not documented for BUS');
  assert.ok(codes(await mutated(k=>{k.equivalencies.equivalencies[0].creditSystem='quarter';})).includes('mixed-units'));
  assert.ok(codes(await mutated(k=>{k.programs[0].requirements.find(r=>r.id==='electives').credits+=3;})).includes('credit-sum'));
  assert.ok(codes(await mutated(k=>{k.school.sources.find(s=>s.id==='excelsior-catalog-2026-11').checked='2026-12-01';})).includes('source-date-future'));
});

test('Excelsior guards reject compiled documents that break sourced invariants',async()=>{
  const sophiaOption=clone(model(doc,PSY).requirements.find(r=>r.id==='psy-101').options[0]);
  await assert.rejects(guard(d=>{model(d,PSY).requirements.find(r=>r.id==='la-498psy').options.push(sophiaOption);}),/Excelsior-only/);
  await assert.rejects(guard(d=>{model(d,BUS).externalMaxCredits=120;}),/113/);
  await assert.rejects(guard(d=>{model(d,LA).alternativeMaxCredits=90;}),/ACE\/NCCRS ceiling/);
  await assert.rejects(guard(d=>{model(d,BUS).upperMinCredits=24;}),/30 upper-level/);
  await assert.rejects(guard(d=>{model(d,LA).requirements.find(r=>r.id==='upper-level-electives').options.push(sophiaOption);}),/lower-level award/);
  await assert.rejects(guard(d=>{model(d,PSY).requirements.find(r=>r.id==='psy-101').options[0].sourceIds=['excelsior-catalog-2026-11'];}),/must cite Excelsior/);
  await assert.rejects(guard(d=>{model(d,PSY).requirements.find(r=>r.id==='psy-101').options[0].sourceCreditSystem='quarter';}),/original semester quantity/);
  await assert.rejects(guard(d=>{const bus=model(d,BUS),eng=bus.requirements.find(r=>r.id==='eng-102a');eng.options.push({...clone(model(d,PSY).requirements.find(r=>r.id==='eng-102a').options.find(o=>o.code==='SOPH-0030'))});}),/not applicable to BUS/);
  await assert.rejects(guard(d=>{delete model(d,PSY).policyEvidence.institutionMinCredits.partnershipAlternative;}),/15-credit partnership/);
});

test('the registry lists Excelsior’s three programs as available templates on their exact directory routes',async()=>{
  const registry=await readJSON(resolve(root,'dist/data/curriculum-registry.json')),directory=await readJSON(resolve(root,'dist/data/program-catalog.json'));
  const entries=registry.models.filter(m=>m.school==='Excelsior University');
  assert.deepEqual(entries.map(e=>[e.id,e.readyTemplate,e.coverage,e.creditUnit,e.degreeCredits]).sort(),[[BUS,true,'complete','semester',120],[LA,true,'complete','semester',120],[PSY,true,'complete','semester',120]].sort());
  const listed=new Set(directory.programs.filter(p=>p.schoolId==='excelsior').map(p=>p.id));
  assert.deepEqual([...listed].sort(),['excelsior-bs-business','excelsior-bs-liberal-arts','excelsior-bs-psychology']);
  const variants=registry.routes.filter(r=>r.schoolId==='excelsior');
  assert.deepEqual(variants.map(r=>[r.id,r.parentId]).sort(),[['excelsior-bs-business-no-concentration','excelsior-bs-business'],['excelsior-bs-liberal-arts-no-concentration','excelsior-bs-liberal-arts']]);
  assert.ok(variants.every(r=>listed.has(r.parentId)),'concentration-free variants point at their directory listing');
});
