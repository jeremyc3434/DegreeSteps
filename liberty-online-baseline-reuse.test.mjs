import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadKit,inScope} from './scripts/pathway-factory/lib.mjs';
import {compileKit} from './scripts/pathway-factory/compile.mjs';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const priorReady=[
  "curriculum-liberty-healthcare-administration-bs-online",
  "curriculum-liberty-psychology-bs-online",
  "curriculum-wgu-catalog-19be0ad2d1922f49",
  "curriculum-wgu-catalog-1d1cb06c2d479685",
  "curriculum-wgu-catalog-2e49db64c32dfc79",
  "curriculum-wgu-catalog-4431e5205a7d441a",
  "curriculum-wgu-catalog-689e417cff765fc9",
  "curriculum-wgu-catalog-93e0bd6d0c7171ac",
  "curriculum-wgu-catalog-94e68cf7b91dec17",
  "curriculum-wgu-catalog-995901539a30b649",
  "curriculum-wgu-catalog-a4bbd78b1b3233b7",
  "curriculum-wgu-catalog-bc26f6f5019c6ee3",
  "curriculum-wgu-catalog-c023977432f945c3",
  "curriculum-wgu-catalog-d6925a8fbb6e8d9a",
  "curriculum-wgu-catalog-ecceaa488637ac83",
  "curriculum-wgu-catalog-f5987d0b65c06f56",
  "liberty-business-residential",
  "liberty-criminal-justice-online",
  "liberty-criminal-justice-residential"
];
const paths=['content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json','content/catalog/liberty-extra-sophia-identities-reviewed-2026-11-24.json','content/curricula/snapshots/liberty/health-upper-provider-identities-2026-11-18-reviewed.json','content/catalog/liberty-psychology-study-identities-reviewed-2026-11-24.json','content/catalog/liberty-core-sophia-identities-reviewed-2026-11-24.json','content/catalog/liberty-core-study-identities-reviewed-2026-11-24.json','content/catalog/liberty-upper-psychology-study-identities-reviewed-2026-11-24.json'];
const documents=await Promise.all(paths.map(read)),guide=await read('content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json'),kit=await loadKit('content/pathway-kits/liberty');
const asOf='2026-11-24',programs=['history-bs-online','human-services-bs-online','psychology-addictions-online'];
const facts=new Map(documents.flatMap((d,index)=>d.courses.filter(c=>c.sourceCredits===3).map(c=>{
 const code=c.code||c.aceId,provider=c.provider||(code.startsWith('SOPH-')?'Sophia':'Study.com');
 return [provider+'|'+code,{...c,code,provider,checkedOn:c.identityCheckedOn||d.checkedOn,reviewId:d.id,reviewPath:paths[index],identitySourceIds:c.identitySourceIds||[c.aceSourceId,c.providerSourceId].filter(Boolean),recommendationPeriodSourceIds:c.recommendationPeriodSourceIds||[c.aceSourceId],activeOffering:c.activeOffering===true||d.providerOfferingObservations?.some(observation=>observation.url===c.providerCourseUrl),providerOfferingObservations:d.providerOfferingObservations||[]}];
})));
const rows=kit.equivalencies.equivalencies.filter(r=>r.id.startsWith('liberty-online-baseline-'));
const catalog=value=>String(value).replace(/[–—]/g,'-');
const digest=source=>String(source?.sha256||source?.sourceContentHash||'').replace(/^sha256:/,'');
function assertIndependentFacts(option,stamp,course,award,sources){
 assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(option.sourceUpper,course.sourceUpper);
 assert.equal(String(option.courseVersion),String(course.aceVersion));assert.equal(option.providerCourseCode,course.providerCourseCode);
 assert.equal(option.recommendationStart,course.recommendationStart);assert.equal(option.recommendationEnd,course.recommendationEnd);
 assert.equal(option.providerCoursePassingPercent,course.minScore??course.minimumPassingScore);
 assert(course.checkedOn<=asOf&&course.activeOffering===true);assert(option.recommendationStart<=asOf&&option.recommendationEnd>=asOf);
 assert.equal(stamp.reviewId,course.reviewId);assert.equal(stamp.reviewPath,course.reviewPath);assert.equal(stamp.sourceIdentityOnly,true);assert.equal(stamp.receivingAwardId,award.id);assert.equal(stamp.studentCreditsAwarded,0);
 if(course.receivingCode)assert.equal(award.receivingCode,course.receivingCode);
 if(course.receivingAwardId)assert.equal(stamp.receivingAwardId,course.receivingAwardId);
 const ids=stamp.independentIdentitySourceIds;
 assert(Array.isArray(ids)&&ids.length>0,option.code+' retains its independent source identities after alias composition');
 assert([...course.identitySourceIds,...(course.activeOfferingSourceIds||[])].every(id=>ids.includes(id)),option.code+' retains the reviewed ACE and provider offering evidence');
 const records=ids.map(id=>sources.get(id));
 assert(records.every(source=>source&&['ace','provider','accreditor'].includes(source.kind)&&new URL(source.url).hostname!=='www.liberty.edu'));
 assert(records.some(source=>source.kind==='ace'));assert(records.some(source=>source.kind==='provider'));
 assert(ids.every(id=>!award.sourceIds.includes(id)),option.code+' keeps receiving evidence separate from original identity');
 if(course.providerOfferingObservations.length)assert(records.some(source=>source.kind==='provider'&&course.providerOfferingObservations.some(observation=>observation.url===source.url)));
 assert(course.recommendationPeriodSourceIds.length>0&&course.recommendationPeriodSourceIds.every(id=>sources.get(id)?.kind==='ace'));
 assert(['verified-current-provider-and-ace','reviewed-independent-recommendation'].includes(option.sourceCreditStatus));
 assert.equal(option.sourceCreditEvidence.status,'reviewed');assert.equal(option.sourceCreditVerification.credits,course.sourceCredits);assert.equal(option.sourceCreditVerification.creditSystem,course.sourceCreditSystem);
 assert(option.identitySourceIds.length>0&&option.identitySourceIds.every(id=>sources.has(id)&&['ace','provider','accreditor'].includes(sources.get(id).kind)));
 assert(option.sourceCreditEvidence.sourceIds.length>0&&option.sourceCreditEvidence.sourceIds.every(id=>sources.has(id)&&['ace','provider','accreditor'].includes(sources.get(id).kind)));
 assert(option.recommendationPeriodSourceIds.length>0&&option.recommendationPeriodSourceIds.every(id=>sources.has(id)));
}
function assertReceivingAward(option,award,sources){
 assert.equal(option.provider,award.provider);assert.equal(option.code,award.code);assert.equal(option.receivingCode,award.receivingCode);assert.equal(option.credits,award.credits);assert.equal(option.creditSystem,award.creditSystem);
 for(const id of award.sourceIds){
  const original=sources.get(id);assert(original&&new URL(original.url).hostname==='www.liberty.edu');assert.equal(original.modality,'online');assert.equal(original.evidenceType,'official-receiving-school-equivalency');assert.match(digest(original),/^[a-f0-9]{64}$/);
  assert(option.sourceIds.some(ref=>{const source=sources.get(ref);return source?.url===original.url&&digest(source)===digest(original);}),option.code+' retains the exact independently reviewed Liberty online guide or its verified alias');
 }
}
test('30 reusable awards across seven packets bind independent original facts to exact Liberty online awards',()=>{
 assert.equal(documents.length,7);assert.equal(facts.size,30);assert.equal(rows.length,30);
 assert.deepEqual(rows.map(row=>row.provider+'|'+row.code).sort(),[...facts.keys()].sort());
 const sources=new Map(kit.school.sources.map(s=>[s.id,s]));
 for(const row of rows){const c=facts.get(row.provider+'|'+row.code),a=guide.awards.find(a=>a.provider===row.provider&&a.code===row.code&&a.receivingCode===row.receivingCode);assert(c&&a,row.id);
  assertIndependentFacts({...row,...row.identity},row.extra.baselineAwardReview,c,a,sources);assertReceivingAward(row,a,sources);
  assert.equal(row.credits,3);assert(row.identity.identitySourceIds.every(id=>!row.sourceIds.includes(id)));
  assert.equal(row.extra.eligibilityReview.eligibleToStart,true);assert.equal(row.extra.eligibilityReview.status,'current-provider-version-reviewed');assert.equal(row.extra.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');
 }
});
test('reusable awards stay inside their reviewed programs, online format and catalog',()=>{
 const compiled=compileKit(kit).doc.models;
 for(const row of rows){
  assert.notEqual(row.scope.all,true);assert.deepEqual(row.scope.programs,programs);assert.deepEqual(row.scope.levels,['bachelor']);assert.deepEqual(row.scope.modalities,['online']);assert.deepEqual(row.scope.catalogs,['2026–2027']);
  for(const slug of programs){
   const p=kit.programs.find(p=>p.slug===slug),model=compiled.find(model=>model.id===p.modelId);
   assert(inScope(row,p,kit));assert.equal(p.level,'bachelor');assert.deepEqual(p.modalities,['online']);assert.equal(catalog(p.catalog),'2026-2027');
   assert.equal(model.school,'Liberty University');assert.equal(model.level,'bachelor');assert.equal(model.format,'Online');assert.deepEqual(model.modalities,['online']);assert.equal(catalog(model.catalogYear||model.catalog),'2026-2027');assert.equal(model.creditSystem,'semester');
  }
  const p=kit.programs.find(p=>p.slug===programs[0]);
  for(const patch of [{slug:'unreviewed-program'},{slug:'psychology-bs-online'},{level:'master'},{modalities:['campus']},{catalog:'2027–2028'}])assert.equal(inScope(row,{...p,...patch},kit),false,row.id+' rejects '+JSON.stringify(patch));
 }
});
test('every selected outside course in the three baselines retains independent current source facts and a separate exact Liberty award',()=>{
 const compiled=compileKit(kit).doc.models,expectedOutside={'history-bs-online':69,'human-services-bs-online':60,'psychology-addictions-online':69};
 for(const slug of programs){
  const p=kit.programs.find(p=>p.slug===slug),model=compiled.find(model=>model.id===p.modelId),sources=new Map(model.sources.map(source=>[source.id,source]));
  assert.equal(Object.keys(model.reviewedBaselineChoices.optionSelections).length,model.requirements.length);
  let outsideCredits=0;
  for(const requirement of model.requirements){
   const selected=model.reviewedBaselineChoices.optionSelections[requirement.id],option=requirement.options.find(option=>option.id===selected);
   if(!option){assert.equal(selected,'university-'+requirement.id);assert(!requirement.options.some(option=>option.provider==='University'));continue;}
   if(option.provider==='University')continue;
   const c=facts.get(option.provider+'|'+option.code),stamp=option.baselineAwardReview,a=guide.awards.find(award=>award.id===stamp?.receivingAwardId);
   assert(c&&stamp&&a,model.id+'/'+requirement.id+' cannot use a guide-only source identity');
   assertIndependentFacts(option,stamp,c,a,sources);assertReceivingAward(option,a,sources);
   assert.equal(option.evidence,'published');assert.equal(option.evidenceType,'official-receiving-school-equivalency');assert.equal(option.mappingResearchClosed,true);assert.match(option.receivingMapStatus,/^published-/);
   assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.eligibilityReview.status,'current-provider-version-reviewed');assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');
   const placement=option.degreePlacementEvidence;
   assert.equal(placement.modelId,model.id);assert.equal(catalog(placement.catalogYear),catalog(model.catalogYear||model.catalog));assert.equal(placement.modality,'online');assert.equal(placement.requirementId,requirement.id);assert.equal(placement.receivingCode,option.receivingCode);assert.equal(placement.credits,requirement.credits);assert.equal(placement.creditSystem,'semester');assert.equal(placement.placementType,requirement.freeElective?'free-elective':'exact-named-requirement');
   assert(placement.sourceIds.length>0&&placement.sourceIds.every(id=>sources.has(id)));
   outsideCredits+=option.credits;
  }
  assert.equal(outsideCredits,expectedOutside[slug]);
 }
});
test('three new templates are published without removing any prior ready template',async()=>{
 const published=await read('dist/data/publication-index.json'),quality=await read('dist/data/pathway-quality-report.json');
 const ids=new Set(published.plans.map(p=>p.modelId));for(const id of priorReady)assert(ids.has(id),id+' stays published');
 for(const slug of ['history-bs-online','human-services-bs-online','psychology-addictions-online']){const id='curriculum-liberty-'+slug;assert(ids.has(id),id+' is newly available');const q=quality.programs.find(p=>p.modelId===id);assert.equal(q.publication.ready,true);assert.equal(q.metrics.conditionalOutsideCredits,0);}
 assert(ids.size>=priorReady.length+3);assert(quality.summary.publicationReady>=22);
});
