import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {MBA_PROGRAMS,REVIEW_PATH,parseMBACatalog,loadMBAFamilyEvidence,authorMBAProgram,buildMBAFamily} from './scripts/wgu-mba-family.mjs';
import {loadKit,normalizeText} from './scripts/pathway-factory/lib.mjs';
import {compileKit,compileProgram,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),read=async path=>JSON.parse(await readFile(path,'utf8'));
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Catalog=require('./dist/program-catalog.js');
const evidence=await loadMBAFamilyEvidence(),clone=value=>structuredClone(value);

test('the current institutional catalog binds all three MBA editions, exact codes and CUs without inventing an edition',()=>{
  const parsed=parseMBACatalog(evidence.texts.get('catalog'));
  assert.deepEqual(parsed.map(program=>[program.code,program.catalog,program.total,program.rows.length,program.rows.at(-1).code]),[['MBA','201404',34,11,'C216'],['MBAITM','201408',35,11,'C218'],['MBAHA','202507',36,11,'C219']]);
  assert.equal(parsed[1].rows.at(-1).title,'MBA, Information Technology Management Capstone');
  assert.match(parsed[1].rows.at(-1).quote,/4 4 Capstone$/,'The printed wrapped title is retained as evidence rather than fabricated as an inline row');
  for(const replace of [body=>body.replace('MBA 201404 Total CUs: 34','MBA 202611 Total CUs: 34'),body=>body.replace('C200 Managing Organizations and Leading People 3 1','C200 Managing Organizations and Leading People 4 1'),body=>body.replace('C218 MBA, Information Technology Management','C216 MBA, Information Technology Management'),body=>body.replace('AFT2 Accreditation Audit','AFT2 Different Requirement')])assert.throws(()=>parseMBACatalog(replace(evidence.texts.get('catalog'))));
});

test('every family input retains the original primary capture, file hash, scope and retrieval provenance',async()=>{
  const review=await read(REVIEW_PATH);assert.equal(review.captures.length,6);
  for(const source of review.captures){
    const body=await readFile(source.capture,'utf8'),meta=await read(source.capture.replace('.txt','.json'));
    assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(meta.fetchedAt,source.fetchedAt);
  }
  const policy=review.captures.find(source=>source.role==='residency');assert.equal(policy.fetchedAt.slice(0,10),'2026-11-25');assert.equal(policy.retrieval,'retained-primary-source-rereview');
  for(const change of [review=>review.programs[0].catalog='202611',review=>review.captures[0].sha256='0'.repeat(64),review=>review.captures[0].documentSha256='0'.repeat(64),review=>review.captures[0].pages='90-91',review=>review.captures.find(source=>source.role==='residency').fetchedAt='2026-11-26T00:00:00.000Z',review=>review.captures.find(source=>source.programCode==='MBAHA').programCode='MBAITM']){
    const broken=clone(review);change(broken);await assert.rejects(()=>loadMBAFamilyEvidence(broken));
  }
});

test('all three complete graduate CBE baselines retain their own evidence and propose every CU at WGU',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu');
  for(const definition of MBA_PROGRAMS){
    const program=kit.programs.find(program=>program.slug===definition.slug);assert(program);
    const model=compileProgram(kit,program),policy=model.residencyPolicy;
    assert.equal(model.level,'master');assert.equal(model.catalog,definition.catalog);assert.equal(model.creditSystem,'competency-unit');assert.equal(model.paceModel,'competency-subscription');assert.equal(model.paceSourceUrl,definition.url);
    assert.equal(model.sources.length,4);assert(model.sources.every(source=>source.kind==='university'&&source.capture&&source.sha256));assert(!model.sources.some(source=>source.roles?.includes('transfer-equivalency')));
    assert.equal(model.institutionMinCredits,definition.total*.5+4);assert.equal(model.externalMaxCredits,definition.total*.5);assert.equal(model.alternativeMaxCredits,undefined);assert.equal(policy.fraction,.5);assert.equal(policy.capstoneCredits,4);
    assert.equal(model.policyEvidence.institutionMinCredits.derived,true);assert.equal(model.policyEvidence.institutionMinCredits.calculation,'0.5 * totalCredits + capstoneCredits');
    assert.match(model.policyEvidence.institutionMinCredits.basis,/not a university-printed program minimum/);
    assert(program.quotes.some(quote=>quote.text.includes('in addition to any required capstone course(s) or clinical(s).')));
    assert.equal(model.pricing.amount,5050);assert.equal(model.pricing.tuitionPerTerm,4850);assert.equal(model.pricing.resourceFeePerTerm,200);assert.equal(model.pricing.period,'6 months');
    assert(model.unresolved.every(notice=>notice.owner==='student'&&notice.status==='personal-task'));
    assert(model.requirements.every(requirement=>requirement.code&&requirement.options.length===0));
    assert.equal(model.requirements.reduce((sum,requirement)=>sum+requirement.credits,0),definition.total);
    assert(model.requirements.every(requirement=>requirement.sourceIds.every(id=>model.sources.some(source=>source.id===id))));
    for(const requirement of program.requirements)for(const quote of requirement.quotes){const source=model.sources.find(source=>source.id===quote.sourceId);assert(normalizeText(await readFile(source.capture,'utf8')).includes(normalizeText(quote.text)));}
    // These are the exact named institutional fallbacks added by the registry;
    // no provider identity or outside receiving award is synthesized.
    const normalized=clone(model);for(const row of normalized.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
    const plan=Planner.generate(normalized,{providers:[],allowConditional:false,completed:[],optimizationNodeBudget:12000});
    assert.equal(plan.totals.external,0);assert.equal(plan.totals.institutional,definition.total);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);assert(plan.rows.every(row=>row.option?.provider==='University'&&row.option.code&&row.status==='planned'));
    const quality=assessPathwayQuality({model:normalized,plan,route:{id:definition.routeId,modelId:model.id,school:model.school,title:model.title,level:'master',modalities:['online'],paceModel:model.paceModel,url:definition.url},asOf:'2026-11-26'});assert.equal(quality.publication.ready,true,definition.code+': '+JSON.stringify(quality.findings.filter(finding=>finding.blocking)));
  }
});

test('MBA guards reject undergraduate policy leakage, dropped capstones, invented transfer awards and changed editions',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),doc=compileKit(kit).doc;
  assert.equal(await runGuards(kit,doc),7);
  for(const mutate of [model=>model.residencyPolicy.fraction=.25,model=>model.institutionMinCredits=model.totalCredits*.25+4,model=>model.externalMaxCredits=model.totalCredits*.75,model=>model.requirements.at(-1).institutionalOnly=false,model=>model.requirements[0].options.push({id:'made-up-transfer',provider:'Sophia',code:'SOPH-0015',credits:3,sourceIds:[]}),model=>model.alternativeMaxCredits=0,model=>model.catalog='202611',model=>model.totalCredits++,model=>{const source=model.sources.find(source=>source.url.includes('/23797'));source.kind='provider';}]){
    const broken=clone(doc),model=broken.models.find(model=>model.id===MBA_PROGRAMS[0].modelId);mutate(model);await assert.rejects(()=>runGuards(kit,broken));
  }
});

test('family source authoring is reproducible, leaves earlier requirement identities intact and verifies through the kit',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),legacy=kit.programs.find(program=>program.slug==='master-of-business-administration');
  assert.deepEqual(legacy.requirements.map(row=>row.id),['mba-managing-organizations-and-leading-people','mba-managing-human-capital','mba-management-communication','mba-marketing','mba-accounting-for-decision-makers','mba-ethical-leadership','mba-financial-management','mba-data-driven-decision-making','mba-operations-management','mba-global-economics-for-managers','mba-mba-capstone']);
  const authored=authorMBAProgram(evidence.programs[0],evidence,{legacy});assert.deepEqual(authored.requirements.map(row=>row.id),legacy.requirements.map(row=>row.id));
  assert.deepEqual(await buildMBAFamily({check:true}),{programs:MBA_PROGRAMS.map(program=>({modelId:program.modelId,catalog:program.catalog,totalCredits:program.total,requirements:11,universityCredits:program.total,institutionMinCredits:program.total*.5+4})),receivingAwardsCreated:0,check:true});
  const result=await verifyKit(kit,{asOf:'2026-11-26'});assert.deepEqual(result.errors,[]);
});

test('existing discovery routes are referenced by MBA course models without publishing duplicate variants',async()=>{
  const school=await read('content/pathway-kits/wgu/school.json'),publication=school.publish.documents.find(document=>document.path==='content/curricula/wgu-pathway-kit.json');
  for(const definition of MBA_PROGRAMS.filter(program=>program.slug!=='master-of-business-administration')){
    const program=await read('content/pathway-kits/wgu/programs/'+definition.slug+'.json');
    assert.deepEqual(program.routeIds,[definition.routeId]);assert(school.programOrder.includes(definition.slug));assert(publication.programs.includes(definition.slug));
    assert(!school.routes.some(route=>route.id===definition.routeId));assert(school.publish.documents.every(document=>!document.routes?.some(route=>route.id===definition.routeId)));
  }
});

test('each graduate route opens as a complete Journey plan with admission tasks and no invented student awards',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu');
  const models=MBA_PROGRAMS.map(definition=>compileProgram(kit,kit.programs.find(program=>program.slug===definition.slug)));
  for(const model of models)for(const row of model.requirements)row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
  const routes=MBA_PROGRAMS.map(definition=>({id:definition.routeId,modelId:definition.modelId,title:definition.title,school:'Western Governors University',level:'master',modalities:['online'],paceModel:'competency-subscription',url:definition.url,degreeCredits:definition.total,creditUnit:'competency-unit',subjects:['business'],goals:['any-degree','career-growth']}));
  const catalog=Catalog.merge({pathways:routes},{programs:[]});
  for(const route of catalog.pathways){
    const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog),draft=Journey.buildDraft(state,catalog,models);
    assert.equal(draft.plan.readiness,'review-ready',route.id+': '+JSON.stringify(draft.plan.validation.errors));assert.deepEqual(draft.targetIssues,[]);assert.deepEqual(draft.targetUnknowns,[]);
    const expected=MBA_PROGRAMS.find(definition=>definition.modelId===route.modelId);assert.equal(draft.plan.totals.institutional,expected.total);assert.equal(draft.plan.totals.external,0);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);
    assert(draft.plan.personalTasks.some(task=>/admission/.test(task.message)&&task.sourceIds.length));assert(!draft.plan.researchTasks.some(task=>task.code==='program_research'));
  }
});
