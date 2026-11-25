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
const currentDataAsOf='2026-11-25'; // Evaluation time, not a rewrite of Liberty catalog/source dates.
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
  const result=await verifyKit(kit,{asOf:currentDataAsOf});
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

test('a registry migration preserves all compiled models and canonical authored evidence',async()=>{
  const fresh=await migrate();
  const migratedSlugs=new Set(fresh.programs.map(program=>program.slug));
  // Authored program files are deliberately not reconstructed from registry output. Include the files a migration
  // leaves in place, so an award-id change cannot silently break their saved option selections.
  const providers=new Map([...fresh.providers].map(([name,provider])=>[name,{...provider,file:kit.providers.get(name).file}]));
  const programs=[...fresh.programs.map(program=>({...program,file:kit.programs.find(committed=>committed.slug===program.slug).file})),...kit.programs.filter(program=>!migratedSlugs.has(program.slug))];
  const roundtrip={...kit,school:fresh.school,equivalencies:fresh.equivalencies,providers,programs};
  const compiled=compileKit(roundtrip).doc;
  assert.equal(compiled.models.length,doc.models.length);
  assert.deepEqual(parity(doc.models,compiled.models),[],'every model, requirement, option id and evidence field survives migration');
  assert.deepEqual(parity(fresh.documents.flatMap(document=>document.models),compiled.models),[]);
  assert.deepEqual((await verifyKit(roundtrip,{asOf:currentDataAsOf})).errors,[]);
  assert.equal(await runGuards(roundtrip,compiled),guards.length);
  const authored=kit.equivalencies.equivalencies.filter(row=>row.authored),rows=new Map(fresh.equivalencies.equivalencies.map(row=>[row.id,row]));
  for(const row of authored){
    assert.deepEqual(rows.get(row.id),row,row.id+' keeps its authored identity, scope and conditions');
    assert.deepEqual(fresh.providers.get(row.provider).courses.find(course=>course.code===row.code),kit.providers.get(row.provider).courses.find(course=>course.code===row.code),row.id+' keeps independent original-course facts');
  }
  const checked=spawnSync(process.execPath,['scripts/pathway-factory/migrate-liberty.mjs','--check'],{cwd:root,encoding:'utf8',timeout:60000});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);
});

test('institution-wide rows are never wider than the data and reuse one award across many degrees',async()=>{
  const rows=kit.equivalencies.equivalencies,wide=rows.filter(row=>row.scope.all);
  const placements=new Map(),rowIndex=new Map(rows.map(row=>[row.id,row])),supersessions=[];
  const reviewedPrograms=['history-bs-online','human-services-bs-online','psychology-addictions-online'];
  const expectedSupersessions=[
    ['sophia-soph-0015-to-engl-101','engl-101',reviewedPrograms,'published'],
    ['sophia-soph-0024-to-coms-101','coms-101',reviewedPrograms,'published'],
    ['sophia-soph-0009-to-arts-209','arts-209',reviewedPrograms.slice(1),'published'],
    ['sophia-soph-0001-to-math-121','math-121',[reviewedPrograms[0],reviewedPrograms[2]],'published'],
    ['sophia-soph-0020-to-ethc-101','ethc-101',reviewedPrograms,'published'],
    ['study-com-sdcm-0047-to-cstu-101','cstu-101',reviewedPrograms,'published'],
    ['sophia-soph-0022-to-hius-221-8','hius-221',[reviewedPrograms[0]],'conditional'],
    ['sophia-soph-0025-to-hius-222-8','hius-222',[reviewedPrograms[0]],'conditional']
  ].flatMap(([id,requirement,programs,evidence])=>programs.map(program=>[id+'|'+program+'|'+requirement,evidence]));
  const expected=new Map(expectedSupersessions),masters=rows.filter(row=>row.id.startsWith('liberty-online-baseline-'));
  assert.equal(masters.length,30);
  const packetPaths=['content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json','content/catalog/liberty-extra-sophia-identities-reviewed-2026-11-24.json','content/curricula/snapshots/liberty/health-upper-provider-identities-2026-11-18-reviewed.json','content/catalog/liberty-psychology-study-identities-reviewed-2026-11-24.json','content/catalog/liberty-core-sophia-identities-reviewed-2026-11-24.json','content/catalog/liberty-core-study-identities-reviewed-2026-11-24.json','content/catalog/liberty-upper-psychology-study-identities-reviewed-2026-11-24.json'];
  const packets=new Map(await Promise.all(packetPaths.map(async path=>[path,await readJSON(resolve(root,path))]))),guide=await readJSON(resolve(root,'content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json'));
  const digest=source=>String(source?.sha256||source?.sourceContentHash||'').replace(/^sha256:/,'');
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
      if(!req||req.institutionalOnly||req.credits!==row.credits||list(placements.get(row.id)).some(([slug,id])=>slug===p.slug&&id===req.id))continue;
      // These reviewed baselines replace old records with the same exact award and stronger current source facts.
      // Check the actual compiled placement so saved option-id overrides and receiving/source quantities stay bound.
      const key=row.id+'|'+p.slug+'|'+req.id;
      assert.ok(expected.has(key),`${row.id} is institution-wide but missing from ${p.slug}/${req.id}`);
      assert.equal(row.evidence,expected.get(key));
      const replacement=list(req.optionRows).map((entry,index)=>({entry:parsePlacement(entry),index})).find(({entry})=>{
        const candidate=rowIndex.get(entry.row);
        return masters.includes(candidate)&&candidate.authored===true&&candidate.status==='published'&&inScope(candidate,p,kit)&&candidate.provider===row.provider&&candidate.code===row.code&&candidate.receivingCode===row.receivingCode&&candidate.credits===row.credits&&(candidate.creditSystem||candidate.impliedCreditSystem)===(row.creditSystem||row.impliedCreditSystem);
      });
      assert.ok(replacement,`${row.id} is institution-wide but missing from ${p.slug}/${req.id}`);
      const candidate=rowIndex.get(replacement.entry.row),model=doc.models.find(model=>model.id===p.modelId),compiled=model.requirements.find(value=>value.id===req.id),option=compiled.options[replacement.index],sources=new Map(model.sources.map(source=>[source.id,source]));
      assert.deepEqual(candidate.scope.programs,reviewedPrograms);assert.deepEqual(candidate.scope.levels,['bachelor']);assert.deepEqual(candidate.scope.modalities,['online']);assert.deepEqual(candidate.scope.catalogs,['2026–2027']);
      assert.equal(option.provider,candidate.provider);assert.equal(option.code,candidate.code);assert.equal(option.receivingCode,candidate.receivingCode);assert.equal(option.credits,candidate.credits);
      assert.equal(option.evidence,'published');assert.equal(option.evidenceType,'official-receiving-school-equivalency');assert.equal(option.mappingResearchClosed,true);assert.match(option.receivingMapStatus,/^published-/);
      const stamp=option.baselineAwardReview,packet=packets.get(stamp?.reviewPath),course=packet?.courses.find(course=>(course.code||course.aceId)===option.code),award=guide.awards.find(award=>award.id===stamp?.receivingAwardId);
      assert.ok(stamp&&packet&&course&&award,option.code+' retains its independent packet and exact receiving award');
      assert.equal(stamp.reviewId,packet.id);assert.equal(stamp.sourceIdentityOnly,true);assert.equal(stamp.studentCreditsAwarded,0);
      assert.equal(option.sourceCreditEvidence.status,'reviewed');assert(['verified-current-provider-and-ace','reviewed-independent-recommendation'].includes(option.sourceCreditStatus));
      assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCredits,candidate.identity.sourceCredits);assert(option.sourceCredits>0);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(option.sourceCreditSystem,candidate.identity.sourceCreditSystem);assert.equal(option.sourceUpper,course.sourceUpper);
      assert.equal(String(option.courseVersion),String(course.aceVersion));assert.equal(option.providerCourseCode,course.providerCourseCode);assert.equal(option.recommendationStart,course.recommendationStart);assert.equal(option.recommendationEnd,course.recommendationEnd);
      assert.equal(course.activeOffering,true);assert.equal(option.providerCoursePassingPercent,course.minScore??course.minimumPassingScore);
      assert.equal(option.sourceCreditVerification.credits,course.sourceCredits);assert.equal(option.sourceCreditVerification.creditSystem,course.sourceCreditSystem);
      const independent=stamp.independentIdentitySourceIds;
      assert(independent?.length>0&&independent.every(id=>sources.has(id)&&!award.sourceIds.includes(id)&&['ace','provider','accreditor'].includes(sources.get(id).kind)));
      assert(independent.some(id=>sources.get(id).kind==='ace'));assert(independent.some(id=>sources.get(id).kind==='provider'));
      assert([...(course.identitySourceIds||[course.aceSourceId].filter(Boolean)),...(course.activeOfferingSourceIds||[])].every(id=>independent.includes(id)));
      assert(option.identitySourceIds.length>0&&option.identitySourceIds.every(id=>['ace','provider','accreditor'].includes(sources.get(id)?.kind)));
      assert(option.sourceCreditEvidence.sourceIds.length>0&&option.sourceCreditEvidence.sourceIds.every(id=>option.identitySourceIds.includes(id)));
      assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.eligibilityReview.status,'current-provider-version-reviewed');assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');
      assert(option.recommendationStart<=p.review.reviewedOn&&option.recommendationEnd>=p.review.reviewedOn);
      assert.equal(award.provider,option.provider);assert.equal(award.code,option.code);assert.equal(award.receivingCode,option.receivingCode);assert.equal(award.credits,option.credits);assert.equal(award.creditSystem,option.creditSystem);
      for(const id of award.sourceIds){const original=sources.get(id);assert.equal(new URL(original.url).hostname,'www.liberty.edu');assert.equal(original.modality,'online');assert.match(digest(original),/^[a-f0-9]{64}$/);assert(option.sourceIds.some(ref=>sources.get(ref)?.url===original.url&&digest(sources.get(ref))===digest(original)));}
      const placement=option.degreePlacementEvidence;
      assert.equal(placement.modelId,model.id);assert.equal(placement.catalogYear,model.catalogYear);assert.equal(placement.modality,'online');assert.equal(model.format,'Online');assert.equal(placement.requirementId,req.id);assert.equal(placement.receivingCode,row.receivingCode);assert.equal(placement.credits,req.credits);assert.equal(placement.creditSystem,model.creditSystem);assert.equal(placement.placementType,'exact-named-requirement');
      assert(placement.sourceIds.length>0&&placement.sourceIds.every(id=>option.sourceIds.includes(id)&&sources.has(id)));
      assert.equal(model.reviewedBaselineChoices.optionSelections[req.id],option.id);
      supersessions.push(key);
    }
  }
  assert.deepEqual(supersessions.sort(),[...expected.keys()].sort());
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
  const result=await verifyKit(k,{asOf:currentDataAsOf}),codes=new Set(result.errors.map(e=>e.code));
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
    assert.ok(program.sources.every(source=>source.capture&&['2026-11-20','2026-11-23'].includes(source.checked)));
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
  assert.deepEqual(available,['religion-aa-online','apologetics-aa-online','criminal-justice-aa-online','accounting-aa-online']);
  // The ACCT Elective is a proposed named course from the captured ACCT course list whose prerequisite is in the degree.
  const accounting=kit.programs.find(p=>p.slug==='accounting-aa-online'),acct=accounting.requirements.find(r=>r.publishedRequirementTitle==='ACCT Elective');
  assert.equal(acct.code,'ACCT 311');assert.ok(acct.quotes.some(q=>/Choose any ACCT course not already required in the major/.test(q.text))&&acct.quotes.some(q=>/ACCT 311 Corporate Accounting 3 Credit Hour\(s\) Prerequisite: ACCT 212/.test(q.text)));
  assert.ok(accounting.requirements.some(r=>r.code==='ACCT 212'),'the proposed choice has its prerequisite in the degree');
  assert.ok(!quality.programs.find(item=>item.modelId==='curriculum-liberty-accounting-aa-online').findings.some(f=>f.blocking&&f.code==='validation-selection_required'),'no undesignated course choice remains');
});
