import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {loadKit,root} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {materializeTESUUPIKit,writeTESUUPIKit} from './scripts/tesu-upi-maps.mjs';
import {reviewedTESUCatalogIdentity,reviewedTESUTuitionComparison,withVerifiedTESUProviderSourceEnrichment} from './scripts/tesu-source-parity.mjs';
import {applyTESUProviderReview,providerReview} from './scripts/tesu-provider-review.mjs';
const read=async path=>JSON.parse(await readFile(root+'/'+path,'utf8')),kit=await loadKit(root+'/content/pathway-kits/tesu'),copy=structuredClone;
const inputs={school:kit.school,equivalencies:kit.equivalencies,programs:kit.programs},project=materializeTESUUPIKit;

test('UPI replay preserves all interleaved reviewed records, catalog provenance and Accounting execution notices',()=>{
 const before=JSON.stringify(inputs),result=project(inputs);assert.equal(JSON.stringify(inputs),before);assert.deepEqual(result.school,inputs.school);assert.deepEqual(result.equivalencies,inputs.equivalencies);
 for(const {program}of result.programs)assert.deepEqual(program,inputs.programs.find(p=>p.slug===program.slug));
 const changed=copy(inputs),accounting=changed.programs.find(p=>p.slug==='bsba-accounting');accounting.modelFields.portalPreference={showCompleted:true};accounting.modelFields.unresolved.push('An unrelated future research finding must remain unresolved.');const free=accounting.requirements.find(r=>r.freeElective);free.optionRows.reverse();const replayed=project(changed),updated=replayed.programs.find(p=>p.program.slug===accounting.slug).program;assert.deepEqual(updated,accounting);assert.deepEqual(updated.modelFields.catalogIdentity,accounting.modelFields.catalogIdentity);assert.equal(replayed.supportedReceivingCandidates,21);
});

test('UPI check mode accepts unrelated metadata edits but rejects tampering with its owned award and placement facts',async()=>{
 const base=await mkdtemp(join(tmpdir(),'tesu-upi-composability-')),files=['content/pathway-kits/providers/upi-study.json','content/pathway-kits/tesu/school.json','content/pathway-kits/tesu/equivalencies.json',...kit.school.programOrder.map(slug=>'content/pathway-kits/tesu/programs/'+slug+'.json')];
 try{
  for(const path of files){await mkdir(dirname(join(base,path)),{recursive:true});await writeFile(join(base,path),await readFile(root+'/'+path,'utf8'));}
  const path='content/pathway-kits/tesu/programs/bsba-accounting.json',accounting=await read(path);accounting.modelFields.portalPreference={showCompleted:true};await writeFile(join(base,path),JSON.stringify(accounting,null,2)+'\n');const before=await Promise.all(files.map(path=>readFile(join(base,path),'utf8')));assert.equal((await writeTESUUPIKit({base,check:true})).supportedReceivingCandidates,21);assert.deepEqual(await Promise.all(files.map(path=>readFile(join(base,path),'utf8'))),before);
  const broken=copy(accounting),placement=broken.requirements.find(r=>r.freeElective).optionRows.find(entry=>entry.row?.startsWith('upi-'));placement.mode='upi-exact-placement';await writeFile(join(base,path),JSON.stringify(broken,null,2)+'\n');await assert.rejects(writeTESUUPIKit({base,check:true}),/requires the reviewed UPI supplement/);await writeFile(join(base,path),JSON.stringify(accounting,null,2)+'\n');
  const eqPath='content/pathway-kits/tesu/equivalencies.json',equivalencies=await read(eqPath);equivalencies.equivalencies.find(row=>row.provider==='UPI Study').evidence='published';await writeFile(join(base,eqPath),JSON.stringify(equivalencies,null,2)+'\n');await assert.rejects(writeTESUUPIKit({base,check:true}),/requires the reviewed UPI supplement/);
 }finally{await rm(base,{recursive:true,force:true});}
});

test('the five catalog rereviews require their exact primary capture, date, URL and historical label',()=>{
 for(const program of kit.programs){const model=compileProgram(kit,program),original={kind:'reviewed-current-catalog',label:model.catalog,sourceUrl:model.catalogIdentity.sourceUrl,checkedOn:'2026-11-18'};assert.deepEqual(reviewedTESUCatalogIdentity(model,original),model.catalogIdentity);
  for(const mutate of [m=>{m.catalogIdentity.checkedOn='2027-01-01';},m=>{m.catalogIdentity.priorCheckedOn='2026-11-19';},m=>{m.catalogIdentity.label='An unreviewed future catalog';},m=>{m.catalogIdentity.sourceSha256='0'.repeat(64);},m=>{m.catalogIdentity.sourceUrl='https://tesu.edu/unrelated';},m=>{m.catalogIdentity.capture='content/source-captures/unretained.txt';},m=>{m.sources.find(s=>s.id===m.catalogIdentity.sourceId).kind='community';},m=>{m.sources.find(s=>s.id===m.catalogIdentity.sourceId).sourceContentHash='0'.repeat(64);},m=>{m.sources.find(s=>s.id===m.catalogIdentity.sourceId).checked='2026-11-25';}]){const changed=copy(model);mutate(changed);assert.throws(()=>reviewedTESUCatalogIdentity(changed,original));}
 }
});

test('legacy provider metadata enrichment is backed by the unchanged body and never repairs supplied false provenance',async()=>{
 const legacy=await read('dist/data/tesu.json'),before=JSON.stringify(legacy),enriched=withVerifiedTESUProviderSourceEnrichment(legacy),expected=applyTESUProviderReview(legacy);assert.equal(JSON.stringify(legacy),before);
 for(const reviewed of [providerReview.source,providerReview.policySource])assert.deepEqual(enriched.sources.find(s=>s.id===reviewed.id),expected.sources.find(s=>s.id===reviewed.id));assert.deepEqual(enriched.requirements,legacy.requirements);assert.deepEqual(enriched.providerEligibilityReview,legacy.providerEligibilityReview);
 for(const mutate of [s=>{s.url='https://tesu.edu/unrelated';},s=>{s.capture='content/source-captures/unretained.txt';},s=>{s.kind='community';},s=>{s.roles=['provider-published'];},s=>{s.sha256='0'.repeat(64);},s=>{s.checked='2026-11-26';}]){const changed=copy(legacy);mutate(changed.sources.find(s=>s.id===providerReview.source.id));assert.throws(()=>withVerifiedTESUProviderSourceEnrichment(changed));}
});

test('tuition comparisons rebind only to the proved fresh catalog while preserving the exact earlier price source and date',()=>{
 for(const program of kit.programs){
  const model=compileProgram(kit,program),actual=model.tuitionComparison,originalCatalog={kind:'reviewed-current-catalog',label:model.catalog,sourceUrl:model.catalogIdentity.sourceUrl,checkedOn:'2026-11-18'},original={entryId:actual.entryId,sourceUrl:actual.sourceUrl,checkedOn:'2026-11-18',catalogIdentity:originalCatalog,modelId:model.id},historical=model.sources.find(source=>source.id===actual.pricingSourceIds[0]),sources=[copy(historical)],before=JSON.stringify(model);
  assert.deepEqual(reviewedTESUTuitionComparison(model,original,sources),actual);assert.equal(JSON.stringify(model),before);assert.equal(historical.checkedOn||historical.checked,'2026-11-18');
  for(const mutate of [m=>{m.tuitionComparison.entryId='unreviewed-price-entry';},m=>{m.tuitionComparison.sourceUrl='https://tesu.edu/unrelated-price';},m=>{m.tuitionComparison.modelId='another-degree';},m=>{m.tuitionComparison.checkedOn='2027-01-01';},m=>{m.tuitionComparison.pricingSourceCheckedOn='2026-11-26';},m=>{m.tuitionComparison.pricingSourceIds=['another-source'];},m=>{m.tuitionComparison.catalogIdentity.checkedOn='2026-11-18';},m=>{m.tuitionComparison.reviewScope='A new tuition price review';},m=>{m.tuitionComparison.costPerCredit=1;},m=>{m.sources.find(s=>s.id===historical.id).checked='2026-11-26';},m=>{m.sources.find(s=>s.id===historical.id).url='https://tesu.edu/another-price';}]){const changed=copy(model);mutate(changed);assert.throws(()=>reviewedTESUTuitionComparison(changed,original,sources));}
 }
});
