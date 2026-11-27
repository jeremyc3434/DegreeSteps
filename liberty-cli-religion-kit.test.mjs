import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {loadKit,kitsRoot,readJSON,list,inScope,parsePlacement} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {applicableLibertyCLIReligionAwards,readLibertyCLIReligionReview} from './scripts/liberty-cli-religion-awards.mjs';
import Planner from './dist/planner.js';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const review=await readLibertyCLIReligionReview(),kit=await loadKit(join(kitsRoot,'liberty'));
const currentDataAsOf='2026-11-27'; // Evaluate the current kit without rewriting this older CLI award packet.
const {doc}=compileKit(kit),awardIds=new Set(review.awards.map(award=>award.id));
const rows=kit.equivalencies.equivalencies.filter(row=>awardIds.has(row.optionId));
const rowIds=new Set(rows.map(row=>row.id));
const isReligionOption=option=>awardIds.has(option.id);
const newCognatePrograms=[
  'psychology-criminal-psychology-online',
  'psychology-developmental-psychology-online',
  'psychology-christian-counseling-online',
  'psychology-crisis-counseling-online',
  'psychology-military-resilience-online'
];

test('six reviewed CLI awards preserve 37 legacy placements and add exactly five cognate theology alternatives',()=>{
  assert.equal(rows.length,6);
  let legacyPlacements=0;
  const newPlacements=[];
  for(const program of kit.programs){
    const model=doc.models.find(model=>model.id===program.modelId);
    assert(!list(model.defaultProviders).includes(review.provider),program.slug+' retains its provider defaults');
    for(const requirement of model.requirements){
      const expected=applicableLibertyCLIReligionAwards(review,{school:model.school,level:model.level,catalogYear:model.catalogYear||model.catalog,format:model.format,modality:list(model.modalities)[0],creditSystem:model.creditSystem,credits:requirement.credits,receivingCode:requirement.code,institutionalOnly:requirement.institutionalOnly,requiredAtUniversity:requirement.requiredAtUniversity});
      const options=requirement.options.filter(isReligionOption);
      assert.deepEqual(options.map(option=>option.id),expected.map(award=>award.id),program.slug+'/'+requirement.id);
      if(!options.length)continue;
      if(newCognatePrograms.includes(program.slug))newPlacements.push(...options.map(option=>({program:program.slug,requirement:requirement.id,receivingCode:requirement.code,option:option.id,credits:option.credits})));
      else legacyPlacements+=options.length;
      assert.deepEqual(requirement.options.slice(-options.length).map(option=>option.id),options.map(option=>option.id),'new alternatives are appended: '+program.slug+'/'+requirement.id);
      for(const option of options){
        assert.equal(option.receivingCode,requirement.code);
        assert.equal(option.credits,requirement.credits);
        assert.notEqual(requirement.institutionalOnly,true);
        assert(/^[A-Z]+ \d{3}$/.test(option.receivingCode));
        assert(!/^(BIBL 104|RLGN)/.test(option.receivingCode));
      }
    }
  }
  assert.equal(legacyPlacements,37,'The original programs retain all 37 reviewed placements.');
  assert.deepEqual(newPlacements.sort((a,b)=>a.program.localeCompare(b.program)),newCognatePrograms.map(program=>({program,requirement:'theo-104',receivingCode:'THEO 104',option:'liberty-cli-the-101-to-theo-104',credits:4})).sort((a,b)=>a.program.localeCompare(b.program)));
  assert.equal(legacyPlacements+newPlacements.length,42);
  for(const row of rows){
    assert.equal(row.authored,true);
    assert.equal(row.status,'published');
    assert.deepEqual(row.scope,{all:true,levels:['associate','bachelor'],modalities:['online','campus'],catalogs:['2026–2027']});
    const program=kit.programs.find(program=>program.requirements.some(requirement=>requirement.code===row.receivingCode&&requirement.credits===row.credits));
    for(const change of [{level:'master'},{catalog:'2025–2026'},{modalities:['hybrid']}])assert.equal(inScope(row,{...program,...change},kit),false);
  }
});

test('CLI source quantities, transcript eligibility and receiving quantities remain separate throughout compilation',()=>{
  const provider=kit.providers.get(review.provider),sources=new Map([...kit.school.sources,...provider.sources].map(source=>[source.id,source]));
  for(const source of review.sources)assert(kit.school.sources.some(item=>item.id===source.id),'Liberty review evidence belongs to its school bibliography, not unrelated schools.');
  for(const award of review.awards){
    const course=provider.courses.find(course=>course.code===award.code);
    assert.equal(course.sourceCredits,null);
    assert.equal(course.sourceCreditSystem,undefined);
    assert.equal(course.providerListedCreditQuantity,award.providerListedCreditQuantity);
    assert.equal(course.sourceCreditStatus,'unknown');
    assert(course.identitySourceIds.every(id=>sources.get(id)?.kind==='provider'));
    assert(course.identitySourceIds.every(id=>!award.sourceIds.includes(id)));
  }
  for(const model of doc.models)for(const requirement of model.requirements)for(const option of requirement.options.filter(isReligionOption)){
    assert.equal(option.sourceCredits,undefined);
    assert.equal(option.sourceCreditSystem,undefined);
    assert.equal(option.sourceCreditStatus,'unknown');
    assert.equal(option.creditSystem,'semester');
    assert.equal(option.creditOrigin,'institutional');
    assert.equal(option.evidence,'conditional');
    assert.equal(option.preapprovalRequired,true);
    assert.equal(option.upper,false,'upper level follows the Liberty receiving course');
    assert.equal(option.costStatus,'unpriced-academic-pathway');
    assert.equal(option.cost,undefined);
    assert.equal(option.price,undefined);
    assert.equal(option.issuerReview.freeLearningAloneIsCredit,false);
    assert.equal(option.issuerReview.totalAcademicPathwayCostUSD,null);
    assert(option.conditions.some(condition=>/provider-listed course quantity and Liberty receiving credits are separate/.test(condition)));
    assert(!option.conditions.some(condition=>/three-credit Liberty award|no.proctor|zero.price route.*supported/i.test(condition)));
    for(const id of [...option.sourceIds,...option.identitySourceIds])assert(model.sources.some(source=>source.id===id),model.id+' cites '+id);
  }
});

test('Factory gates still reject excess awards, institution-only placements and unpublished candidates',async()=>{
  assert.deepEqual((await verifyKit(kit,{asOf:currentDataAsOf})).errors,[]);
  await runGuards(kit,doc);
  const make=()=>structuredClone(kit);
  const target=copy=>copy.programs.find(program=>program.slug==='religion-aa-online').requirements.find(requirement=>requirement.code==='BIBL 105');
  const universityOnly=make();target(universityOnly).institutionalOnly=true;
  assert((await verifyKit(universityOnly,{asOf:currentDataAsOf})).errors.some(error=>error.code==='institutional-only-option'));
  const excess=make();target(excess).credits=1;
  assert((await verifyKit(excess,{asOf:currentDataAsOf})).errors.some(error=>error.code==='over-award'));
  const unpublished=make();unpublished.equivalencies.equivalencies.find(row=>rowIds.has(row.id)).status='candidate';
  assert((await verifyKit(unpublished,{asOf:currentDataAsOf})).errors.some(error=>error.code==='placement-candidate'));
  for(const program of kit.programs)for(const requirement of program.requirements)for(const placement of list(requirement.optionRows).map(parsePlacement))if(rowIds.has(placement.row))assert.equal(rows.find(row=>row.id===placement.row).receivingCode,requirement.code);
});

test('the two existing publication-ready canonical Liberty baselines remain ready with optional CLI religion awards',async()=>{
  const registry=await readJSON(resolve(kitsRoot,'../../dist/data/curriculum-registry.json'));
  for(const id of ['curriculum-liberty-psychology-bs-online','curriculum-liberty-healthcare-administration-bs-online']){
    const entry=registry.models.find(entry=>entry.id===id),compiled=await readJSON(resolve(kitsRoot,'../../dist',entry.path));
    const model=compiled.models.find(model=>model.id===id);
    assert(model.requirements.some(requirement=>requirement.options.some(isReligionOption)),id+' includes the generated alternative');
    const providers=[...new Set(model.requirements.flatMap(requirement=>requirement.options.map(option=>option.provider)))].filter(provider=>provider!=='University');
    const plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
    assert.equal(plan.validation.academicCountsValid,true,id);
    const quality=assessPathwayQuality({model,plan,asOf:currentDataAsOf});
    assert.equal(quality.publication.ready,true,id+': '+JSON.stringify(quality.findings.filter(finding=>finding.blocking)));
    assert(!plan.rows.some(row=>isReligionOption(row.option||{})),id+' retains its reviewed baseline choices');
    const requirement=model.requirements.find(requirement=>requirement.code==='THEO 104');
    const selected=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000,optionSelections:{[requirement.id]:'liberty-cli-the-101-to-theo-104'}});
    assert.equal(selected.rows.find(row=>row.requirementId===requirement.id).option.id,'liberty-cli-the-101-to-theo-104','an explicit student choice overrides the retained baseline');
    const selectedQuality=assessPathwayQuality({model,plan:selected,asOf:currentDataAsOf});
    assert.equal(selectedQuality.publication.ready,false,'selecting an unapproved conditional award preserves the publication gate');
    assert(selectedQuality.findings.some(finding=>finding.blocking&&finding.code==='conditional-award'));
  }
});
