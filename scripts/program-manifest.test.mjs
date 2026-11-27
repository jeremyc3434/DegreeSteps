import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProgramManifestRegistry,loadProgramManifests,selectProgramManifests,resolveProgramManifest,checkProgramManifestBindings} from './pathway-factory/program-manifest.mjs';
import {TESU_PLACEMENT_COUNTS,TESU_ADDITIONAL_PLACEMENT_COUNTS} from '../test-support/tesu-placement-inventory.mjs';

const document=JSON.parse(await readFile(new URL('../content/factory-manifests/tesu.json',import.meta.url),'utf8'));
const clone=structuredClone;
const registry=createProgramManifestRegistry([document]);
const business=()=>clone(document.programs.find(entry=>entry.slug==='bsba-human-resources-organizational-management'));
function candidate(){
 const entry=business();entry.slug='bsba-reviewed-test';entry.modelId='curriculum-tesu-bsba-reviewed-test';entry.routeIds=['tesu-bsba-reviewed-test'];entry.title='B.S.B.A. in Reviewed Test';entry.programPath='content/pathway-kits/tesu/programs/'+entry.slug+'.json';entry.outputPath='content/curricula/tesu-reviewed-test.json';entry.pricing.comparison.modelId=entry.modelId;
 Object.assign(entry.authoring.spec,{slug:entry.slug,title:entry.title});return entry;
}
const withEntry=entry=>({...clone(document),programs:[...clone(document.programs),entry]});

test('TESU pilot preserves eight historical ledgers and independently binds two November27 additions with distinct legacy General Management',async()=>{
 const loaded=await loadProgramManifests({validateBindings:true});assert.equal(loaded.documents.length,1);
 const historicalIds=new Set(Object.keys(TESU_PLACEMENT_COUNTS)),additionalIds=new Set(Object.keys(TESU_ADDITIONAL_PLACEMENT_COUNTS)),historical=loaded.programs.filter(entry=>historicalIds.has(entry.modelId)),additions=loaded.programs.filter(entry=>additionalIds.has(entry.modelId));
 assert.equal(historical.length,8);assert.equal(additions.length,2);assert.deepEqual(loaded.programs.map(entry=>entry.modelId).sort(),[...historicalIds,...additionalIds].sort());
 for(const entry of historical)assert(entry.authoringReview.reviewedOn<='2026-11-26');for(const entry of additions){assert.equal(entry.authoringReview.reviewedOn,'2026-11-27');assert.equal(entry.sourceRefs.degree.checkedOn,'2026-11-27');}
 const result=await checkProgramManifestBindings(loaded);assert.deepEqual(result,{programs:historical.length+additions.length,academicModelsChanged:0,publicationDecisionsMade:0});
 assert.equal(selectProgramManifests(loaded,{schoolId:'wgu'}).length,0,'An absent school manifest is outside this pilot, not a failed degree');
 for(const [stage,oldCount,newCount]of [['business-major',2,2],['business-metadata',3,2],['course-placements',8,2]]){const selected=selectProgramManifests(loaded,{stage});assert.equal(selected.filter(entry=>historicalIds.has(entry.modelId)).length,oldCount);assert.equal(selected.filter(entry=>additionalIds.has(entry.modelId)).length,newCount);}
 assert.equal(resolveProgramManifest(loaded,'tesu-general-management'),null,'No automatic legacy migration');assert.equal(resolveProgramManifest(loaded,'tesu-bs-general-management').modelId,'curriculum-tesu-bs-general-management');
 assert.equal(loaded.legacyIdentities[0].path,'dist/data/tesu.json');
});

test('one reviewed data entry joins every declared stage without another production ID list',async()=>{
 const entry=candidate(),extended=createProgramManifestRegistry([withEntry(entry)]);
 for(const stage of entry.stages)assert(selectProgramManifests(extended,{schoolId:'tesu',stage}).some(program=>program.modelId===entry.modelId));
 assert.equal(resolveProgramManifest(extended,entry.routeIds[0]).modelId,entry.modelId);
 assert.equal(resolveProgramManifest(extended,'tesu/'+entry.slug).modelId,entry.modelId);
 await assert.rejects(checkProgramManifestBindings(extended),/ENOENT/,'Registration alone cannot manufacture a source-reviewed canonical degree');
 assert(!('ready' in resolveProgramManifest(extended,entry.modelId)));assert(Object.isFrozen(resolveProgramManifest(extended,entry.modelId).sourceRefs.degree));
});

test('cross-school, cross-catalog, traversal and all accidental identity collisions fail closed',()=>{
 for(const mutate of [
  entry=>entry.schoolId='wgu',entry=>entry.modelId='curriculum-wgu-bsba-test',entry=>entry.routeIds=['wgu-bsba-test'],
  entry=>entry.programPath='content/pathway-kits/wgu/programs/'+entry.slug+'.json',entry=>entry.outputPath='content/curricula/wgu-test.json',
  entry=>entry.sourceRefs.degree.label='A different receiving catalog',entry=>entry.sourceRefs.degree.capture='content/source-captures/../../secrets.txt',
  entry=>entry.pricing.comparison.catalogIdentity.sourceUrl='https://www.example.edu/unrelated-degree',
  entry=>entry.pricing.comparison.modelId='curriculum-tesu-bsba-accounting',entry=>entry.metadataBasis.degreePath='/a-different-degree',
  entry=>entry.modelId=document.programs[0].modelId,entry=>entry.routeIds=document.programs[0].routeIds,
  entry=>entry.outputPath=document.programs[0].outputPath,entry=>entry.programPath=document.programs[0].programPath,
  entry=>entry.ready=true,entry=>entry.publicationAuthority='manifest-approved',
 ]){const entry=candidate();mutate(entry);assert.throws(()=>createProgramManifestRegistry([withEntry(entry)]));}
 const reserved=clone(document);reserved.legacyIdentities[0].modelId=reserved.programs[0].modelId;assert.throws(()=>createProgramManifestRegistry([reserved]),/Legacy identity/);
});

test('same-school grouped output must be declared, retaining distinct model and route identities',()=>{
 const entry=candidate(),grouped=clone(document);entry.outputPath=grouped.programs[0].outputPath;entry.outputGroup=grouped.programs[0].outputGroup='tesu-reviewed-group';grouped.programs.push(entry);
 const groupedRegistry=createProgramManifestRegistry([grouped]);assert.equal(groupedRegistry.programs.length,document.programs.length+1);
 entry.creditSystem='quarter';assert.throws(()=>createProgramManifestRegistry([grouped]),/Output path collision/);
});

test('canonical source, units, modalities, pricing dates, major requirements and prerequisite holds cannot drift',async()=>{
 for(const mutate of [
  entry=>entry.sourceRefs.degree.sourceSha256='a'.repeat(64),
  entry=>{entry.sourceRefs.degree.sourceUrl='https://tesu.smartcatalogiq.com/current/unrelated';entry.pricing.comparison.catalogIdentity=clone(entry.sourceRefs.degree);},
  entry=>{entry.catalog='A different catalog';entry.sourceRefs.degree.label=entry.catalog;entry.pricing.comparison.catalogIdentity=clone(entry.sourceRefs.degree);},
  entry=>entry.modalities=['campus'],entry=>entry.creditSystem='quarter',
  entry=>entry.pricing.comparison.pricingSourceCheckedOn='2026-11-26',
  entry=>entry.curriculum.majorRequirements[0].credits=6,
  entry=>entry.curriculum.constraints.upperGroupMinimums[0].credits=9,
  entry=>entry.context.fitReviewIds=[],
  entry=>entry.authoring.courseBindings[0].source.url='https://tesu.smartcatalogiq.com/current/unrelated-course',
 ]){const changed=clone(document);mutate(changed.programs.find(entry=>entry.slug==='bsba-human-resources-organizational-management'));await assert.rejects(async()=>checkProgramManifestBindings(createProgramManifestRegistry([changed])));}
 const marketing=resolveProgramManifest(registry,'tesu-bsba-marketing');
 assert(marketing.curriculum.constraints.unresolved.some(item=>item.id==='tesu-marketing-mar3060-formal-prerequisite'&&item.status==='needs-research'));
 assert(marketing.curriculum.majorRequirements.find(row=>row.code==='MKT-4410').unresolvedPrerequisiteCodes.includes('MAR-3060'));
 const publication=JSON.parse(await readFile(new URL('../dist/data/publication-index.json',import.meta.url),'utf8'));
 assert(!JSON.stringify(publication).includes('curriculum-tesu-bsba-marketing'),'Reviewed authoring status does not publish the held Marketing degree');
});
