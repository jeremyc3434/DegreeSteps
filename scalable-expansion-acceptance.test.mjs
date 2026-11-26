/** Final-artifact acceptance for the 2026-11-25 expansion. Read-only: run after the normal build. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Catalog from './dist/program-catalog.js';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const quality=await read('./dist/data/pathway-quality-report.json');
const baselines=Object.values((await read('./dist/data/baseline-index.json')).baselines);
const registry=await read('./dist/data/curriculum-registry.json');
const publication=await read('./dist/data/publication-index.json');
const library=await read('./dist/data/plan-library-index.json');
const catalog=Catalog.attachRegistry(Catalog.merge(await read('./dist/data/pathways.json'),await read('./dist/data/program-catalog.json')),registry);
const routes=new Map(catalog.pathways.map(route=>[route.id,route]));
const byId=new Map(quality.programs.map(program=>[program.modelId,program]));
const codeKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

// Captured before the expansion from audits/.../baseline-quality.json (base 80e1e47).
// Keep this snapshot self-contained: a later report cannot silently redefine the baseline.
const preserved=[
 ['curriculum-liberty-healthcare-administration-bs-online',120,72],
 ['curriculum-liberty-history-bs-online',120,69],
 ['curriculum-liberty-human-services-bs-online',120,60],
 ['curriculum-liberty-psychology-addictions-online',120,69],
 ['curriculum-liberty-psychology-bs-online',120,78],
 ['curriculum-wgu-catalog-19be0ad2d1922f49',106,34],
 ['curriculum-wgu-catalog-1d1cb06c2d479685',104,26],
 ['curriculum-wgu-catalog-2e49db64c32dfc79',117,78],
 ['curriculum-wgu-catalog-4431e5205a7d441a',110,58],
 ['curriculum-wgu-catalog-689e417cff765fc9',112,69],
 ['curriculum-wgu-catalog-93e0bd6d0c7171ac',120,60],
 ['curriculum-wgu-catalog-94e68cf7b91dec17',110,60],
 ['curriculum-wgu-catalog-995901539a30b649',91,38],
 ['curriculum-wgu-catalog-a4bbd78b1b3233b7',122,37],
 ['curriculum-wgu-catalog-bc26f6f5019c6ee3',122,28],
 ['curriculum-wgu-catalog-c023977432f945c3',115,60],
 ['curriculum-wgu-catalog-d6925a8fbb6e8d9a',121,78],
 ['curriculum-wgu-catalog-ecceaa488637ac83',110,69],
 ['curriculum-wgu-catalog-f5987d0b65c06f56',115,60],
 ['liberty-business-residential',120,83],
 ['liberty-criminal-justice-online',120,72],
 ['liberty-criminal-justice-residential',120,74]
];

function publishedReady(id,credits,minimumOutside=0){
 const report=byId.get(id);assert(report,id+' must remain in the quality report');
 assert.equal(report.publication.ready,true,id+': '+JSON.stringify(report.publication.reasonCodes));
 assert.equal(report.status,'research-ready',id);
 assert.equal(report.research.academicCountsValid,true,id);
 assert.equal(report.metrics.degreeCredits,credits,id);
 assert(report.metrics.feasibleOutsideCredits>=minimumOutside,id+' lost feasible outside credit');
 assert(report.metrics.publishedOutsideCredits>=minimumOutside,id+' lost published outside credit');
 assert.equal(report.metrics.conditionalOutsideCredits,0,id);
 assert.equal(report.execution.awardedCreditsInBaseline,0,id);
 const published=publication.plans.find(plan=>plan.modelId===id);
 assert(published?.routeIds.length,id+' must have a published usable route');
 for(const routeId of published.routeIds){
  assert.equal(routes.get(routeId)?.modelId,id,routeId+' must resolve to its published model');
  assert.equal(library.plans[routeId]?.modelId,id,routeId+' must reach its model through the plan library');
  assert.equal(library.plans[routeId]?.tier,'reviewed',routeId+' must retain the reviewed library tier');
 }
 const choices=baselines.filter(baseline=>baseline.modelId===id);
 assert(choices.length,id+' must retain an executable baseline');
 for(const baseline of choices){
  assert.equal(baseline.validation.academicCountsValid,true,id);
  assert.equal(baseline.validation.policyChecksComplete,true,id);
  assert.equal(baseline.rows.reduce((sum,row)=>sum+row.credits,0),credits,id);
  assert(baseline.summary.transferCredits>=minimumOutside,id);
  const keys=baseline.rows.map(row=>row.provider+'|'+codeKey(row.code));
  assert(baseline.rows.every(row=>row.provider&&codeKey(row.code)),id+' has an unnamed choice');
  assert.equal(new Set(keys).size,keys.length,id+' counts one original course twice');
 }
 return report;
}
async function modelFor(id){
 const entry=registry.models.find(model=>model.id===id);assert(entry,id+' is absent from the curriculum registry');
 const document=await read('./dist/'+entry.path),model=document.models.find(model=>model.id===id);
 assert(model,id+' is absent from '+entry.path);return model;
}

test('all 22 previously published plans preserve readiness, exact degree totals and published outside credit',()=>{
 assert.equal(preserved.length,22);
 assert.equal(publication.curriculumFingerprint,Catalog.publicationFingerprint(registry),'The publication gate must match the current curriculum registry');
 for(const [id,credits,outside] of preserved)publishedReady(id,credits,outside);
});

test('the new Liberty and MAOL plans publish complete academic baselines without student credit awards',()=>{
 publishedReady('curriculum-liberty-interdisciplinary-aa-online',60,39);
 publishedReady('curriculum-liberty-psychology-bs-residential',120,60);
 const maol=publishedReady('curriculum-umpi-maol-yourpace',36,0);
 assert.equal(maol.metrics.feasibleOutsideCredits,0);
 assert.equal(maol.acceleration.mechanism,'self-paced');
 assert.equal(maol.estimates.cost.total,null);
 assert.equal(maol.estimates.timing.weeks,null);
 for(const id of ['curriculum-liberty-business-aa-online','curriculum-liberty-psychology-aa-online']){
  assert.equal(byId.get(id)?.publication.ready,false,id+' retains its degree-specific research hold');
  assert(byId.get(id).findings.some(finding=>finding.blocking&&finding.code==='unresolved-research'),id);
 }
});

test('MAOL keeps its actual graduate sources and never inherits undergraduate transfer policy',async()=>{
 const model=await modelFor('curriculum-umpi-maol-yourpace');
 assert.equal(model.externalMaxCredits,6);assert.equal(model.institutionMinCredits,30);
 for(const field of ['alternativeMaxCredits','majorMinInstitutionCredits','majorInstitutionFraction'])assert.equal(model[field],undefined,field);
 assert.equal(model.requirements.length,12);
 assert(model.requirements.every(row=>row.credits===3&&row.options.every(option=>option.provider==='University')));
 assert.equal(model.pricing.amount,2450);assert.equal(model.pricing.period,'8 weeks');
 const sources=new Map(model.sources.map(source=>[source.id,source]));
 const map=sources.get('umpi-maol-current-academic-map-2026-11-25');
 const board=sources.get('umpi-maol-board-proposal-2019-reviewed-2026-11-25');
 const program=sources.get('umpi-maol-current-program-2026-11-25');
 const faq=sources.get('umpi-yourpace-current-faq-2026-11-25');
 assert(map&&board&&program&&faq,'All four distinct primary sources remain bound');
 assert.equal(board.documentPeriod,'2019');assert.equal(board.location,'Section IV.A, printed page 9 / PDF page 129');
 const text=async source=>(await readFile(new URL(source.capture,import.meta.url),'utf8')).replace(/\s+/g,' ');
 assert((await text(map)).includes('12 Competencies: 36 Credits'));
 assert((await text(board)).includes('Each competencies is worth 3- credit hours for a total of 36-credit hours.'));
 assert((await text(program)).includes('Six credits of appropriate graduate-level coursework may be transferred'));
 assert((await text(faq)).includes('The graduate YourPace program leads to a Master’s degree, which requires a total of 36 credit hours.'));
});

test('the five new WGU programs preserve exact program-specific quantities and independent source credit units',async()=>{
 const programs=[
  ['curriculum-wgu-bs-data-analytics-reviewed',122,'202309',92,62],
  ['curriculum-wgu-bs-cloud-network-engineering-general-reviewed',109,'202608',246,34],
  ['curriculum-wgu-bs-cloud-network-engineering-aws-reviewed',112,'202608',247,34],
  ['curriculum-wgu-bs-cloud-network-engineering-cisco-reviewed',112,'202608',248,34],
  ['curriculum-wgu-bs-cloud-network-engineering-azure-reviewed',112,'202608',249,34]
 ];
 for(const [id,credits,catalog,programId,outside] of programs){
  publishedReady(id,credits,outside);
  const model=await modelFor(id);assert.equal(model.catalog,catalog,id);
  assert.equal(model.creditSystem,'competency-unit',id);assert.equal(model.externalMaxCredits,credits*.75,id);
  assert.equal(model.alternativeMaxCredits,credits*.75,id);
  for(const requirement of model.requirements){
   if(model.residencyPolicy.capstoneRequirementIds.includes(requirement.id))assert.equal(requirement.institutionalOnly,true,id);
   for(const option of requirement.options.filter(option=>option.provider!=='University')){
    assert.equal(option.sourceCreditSystem,'semester',id+' '+option.code);
    assert(option.sourceCredits>0,id+' '+option.code);
    assert(option.identitySourceIds?.length,id+' '+option.code+' needs original provider identity evidence');
    assert.equal(option.creditSystem,'competency-unit',id+' '+option.code);
    assert.equal(option.universityMapRecord.programId,programId,id+' '+option.code);
    assert.equal(option.universityMapRecord.catalogTerm,catalog,id+' '+option.code);
   }
  }
 }
 const data=await modelFor('curriculum-wgu-bs-data-analytics-reviewed');
 const database=data.requirements.find(row=>row.code==='D427').options.find(option=>option.code==='SDCM-0218');
 assert.equal(database.sourceCredits,3);assert.equal(database.credits,4);
});

test('TESU publishes its complete reviewed baseline while preserving UPI allocation as a separate conditional research scenario',async()=>{
 const id='curriculum-tesu-ba-liberal-studies',report=publishedReady(id,120,72),model=await modelFor(id),baseline=baselines.find(plan=>plan.modelId===id);
 assert.equal(report.metrics.feasibleOutsideCredits,72);assert.equal(report.metrics.conditionalOutsideCredits,0);
 const selection=baseline.baselineSelection;
 assert.equal(selection.selected,'published-only-baseline');assert.equal(selection.conditionalCandidatePreserved,true);
 assert.equal(selection.conditionalCandidate.publicationReady,false);assert.equal(selection.conditionalCandidate.researchStatus,'needs-research');assert(selection.conditionalCandidate.transferCredits>=84,'The earlier conditional nine-credit gain remains available for research');
 assert(selection.conditionalCandidate.reasonCodes.includes('conditional-award'));assert(selection.conditionalCandidate.rows.some(row=>row.provider==='UPI Study'));
 assert.equal(selection.publishedOnlyCandidate.publicationReady,true);assert.equal(selection.publishedOnlyCandidate.allowConditional,false);assert.deepEqual(baseline.rows,selection.publishedOnlyCandidate.rows);
 assert(!baseline.rows.some(row=>row.provider==='UPI Study'),'An unconfirmed UPI receiving claim cannot enter the reviewed starting plan');
 for(const selected of baseline.rows){const requirement=model.requirements.find(row=>row.id===selected.requirementId),option=requirement?.options.find(option=>option.id===selected.optionId);assert.equal(option?.evidence,'published',id+' '+selected.requirementId);}
 const candidates=model.requirements.filter(row=>row.liberalArtsAllocation).flatMap(row=>row.options.filter(option=>option.provider==='UPI Study'));
 assert.equal(candidates.length,45);
 for(const option of candidates){
  assert.equal(option.evidence,'conditional');assert.equal(option.mappingResearchClosed,false);
  assert.equal(option.individualApproval,false);assert.equal(option.receivingMapStatus,'provider-published-candidate');
  assert.equal(option.creditOrigin,'alternative');assert.equal(option.credits,3);assert.equal(option.sourceCredits,3);
 }
 const technical=candidates.find(option=>option.receivingCode==='ENG-2010');
 assert.equal(technical.sourceUpper,true);assert.equal(technical.upper,false,'Original ACE level cannot promote the TESU receiving level');
 assert.equal(model.alternativeMaxCredits,90);assert.equal(model.institutionMinCredits,15);
});
