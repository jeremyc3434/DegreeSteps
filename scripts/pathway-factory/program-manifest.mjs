/** Reviewed authoring inventory. Registration never approves or publishes a plan.
 * Existing source, academic, pricing and publication validators remain required.
 * No network, writes, current-time reads, or generated academic identities. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,posix} from 'node:path';
import {pathToFileURL} from 'node:url';

export const manifestRoot=resolve(import.meta.dirname,'../..');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const list=value=>Array.isArray(value)?value:[];
const copy=structuredClone;
const text=value=>typeof value==='string'&&value.trim().length>0;
const id=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,label+' must be unique');
const pathSafe=(value,prefix)=>text(value)&&!value.includes('\\')&&!value.startsWith('/')&&posix.normalize(value)===value&&value.startsWith(prefix)&&!value.split('/').includes('..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;};
const ownedConstraints=['policyEvidence','upperGroupMinimums','existingCreditReview','transferPolicyReview','gradePolicy','businessAreaSelection','unresolved'];
export const manifestMajorRequirements=program=>list(program.requirements).filter(row=>row.category==='major'&&row.group!=='business-core').map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='optionRows')));
export const manifestConstraints=program=>Object.fromEntries(ownedConstraints.filter(key=>Object.hasOwn(program.modelFields||{},key)).map(key=>[key,copy(program.modelFields[key])]));

/** Validate explicit scope and bindings before any stage receives a roster. */
export function validateProgramManifest(document){
 assert.equal(document?.kind,'pathway-factory-program-manifest');assert.equal(document.version,1);
 const school=document.school;assert(id(school?.id)&&text(school.name),'Manifest needs an explicit school identity');
 assert.equal(school.kitPath,'content/pathway-kits/'+school.id,'School kit path is school-bound');
 assert(Array.isArray(document.programs)&&document.programs.length,'Manifest needs an explicit programme roster');
 for(const entry of document.programs){
  assert.equal(entry.schoolId,school.id,'Programme cannot inherit another school scope');
  for(const field of ['slug','family','modelId'])assert(id(entry[field]),entry.slug+': explicit '+field);
  assert(entry.modelId.startsWith('curriculum-'+school.id+'-'),entry.slug+': model identity is school-bound');
  assert.equal(entry.programPath,school.kitPath+'/programs/'+entry.slug+'.json',entry.slug+': exact source programme path');
  assert(pathSafe(entry.outputPath,'content/curricula/'+school.id+'-')&&entry.outputPath.endsWith('.json'),entry.slug+': output path is school-bound');
  assert(text(entry.title)&&text(entry.catalog));assert(['associate','bachelor','master','doctorate','specialist','certificate'].includes(entry.level));
  assert(Array.isArray(entry.routeIds)&&entry.routeIds.length&&entry.routeIds.every(route=>id(route)&&route.startsWith(school.id+'-')),entry.slug+': explicit school-bound routes');unique(entry.routeIds,'Programme routes');
  assert(Array.isArray(entry.modalities)&&entry.modalities.length&&entry.modalities.every(m=>['online','campus','hybrid'].includes(m)),entry.slug+': explicit modalities');unique(entry.modalities,'Programme modalities');
  assert(['semester','quarter','competency-unit'].includes(entry.creditSystem));assert(Number.isFinite(entry.totalCredits)&&entry.totalCredits>0);
  assert(['reviewed','migrated','draft','held'].includes(entry.authoringReview?.status)&&date(entry.authoringReview.reviewedOn),entry.slug+': dated authoring review');
  assert.equal(entry.publicationAuthority,'existing-academic-gates','Registration cannot confer academic readiness');
  for(const forbidden of ['published','ready','verified','publicationStatus'])assert(!Object.hasOwn(entry,forbidden),'Manifest cannot set '+forbidden);
  assert(Array.isArray(entry.stages)&&entry.stages.every(id));unique(entry.stages,'Authoring stages');
  const degree=entry.sourceRefs?.degree;
  assert(text(degree?.kind)&&degree.label===entry.catalog,entry.slug+': exact receiving catalog binding');
  assert(text(degree.sourceId)&&date(degree.checkedOn)&&/^[a-f0-9]{64}$/.test(degree.sourceSha256||''),entry.slug+': exact reviewed degree source');
  assert(pathSafe(degree.capture,'content/source-captures/')&&degree.capture.endsWith('.txt'),entry.slug+': local degree capture');
  const url=new URL(degree.sourceUrl);assert.equal(url.protocol,'https:');assert(!url.username&&!url.password&&!url.hash,'Plain primary HTTPS degree URL required');
  assert(Array.isArray(entry.sourceRefs.modelSourceIds)&&entry.sourceRefs.modelSourceIds.includes(degree.sourceId),entry.slug+': degree source remains in exact model scope');unique(entry.sourceRefs.modelSourceIds,'Model source IDs');
  assert(Array.isArray(entry.pricing?.rateIds)&&entry.pricing.rateIds.length,'Exact model price-profile binding required');unique(entry.pricing.rateIds,'Price profile IDs');
  const comparison=entry.pricing.comparison;assert.equal(comparison?.modelId,entry.modelId);assert.deepEqual(comparison.catalogIdentity,degree,'Price comparison cannot borrow another degree/catalog identity');
  assert(date(comparison.pricingSourceCheckedOn)&&list(comparison.pricingSourceIds).length,'Preserve independent original pricing review dates');
  for(const field of ['fitReviewIds','requirementReviewIds']){assert(Array.isArray(entry.context?.[field])&&entry.context[field].every(text),'Explicit context review references required');unique(entry.context[field],field);}
  if(entry.context.requirementsPath)assert(pathSafe(entry.context.requirementsPath,'content/discovery/')&&entry.context.requirementsPath.endsWith('.json'),'Explicit local contextual requirement packet');
  assert(Array.isArray(entry.curriculum?.majorRequirements)&&entry.curriculum.constraints&&entry.curriculum.policies,'Explicit major requirements and constraints required');
  unique(entry.curriculum.majorRequirements.map(row=>row.id),'Major requirement IDs');
  for(const row of entry.curriculum.majorRequirements)assert(text(row.id)&&text(row.title)&&Number.isFinite(row.credits)&&row.credits>0&&!Object.hasOwn(row,'optionRows'),'Major requirements are academic facts, not inferred outside awards');
  if(entry.placementBasis){assert.equal(entry.placementBasis.capture,degree.capture);assert.equal(entry.placementBasis.degreeSourceId,degree.sourceId);assert(Number.isFinite(entry.placementBasis.freeElectiveCredits)&&entry.placementBasis.freeElectiveCredits>=0);}
  if(entry.stages.includes('business-major')){
   assert.equal(entry.schoolId,'tesu');assert.equal(degree.kind,'reviewed-current-catalog');assert.equal(entry.authoring?.type,'tesu-business-major-v1');const spec=entry.authoring.spec;
   assert.equal(spec?.slug,entry.slug);assert.equal(spec.title,entry.title);assert.equal(spec.url,degree.sourceUrl);assert.equal(spec.capture,degree.capture);
   assert(Array.isArray(spec.areaCourses)&&spec.areaCourses.length&&Number.isInteger(spec.requiredCount)&&spec.requiredCount>=0&&spec.requiredCount<=spec.areaCourses.length);
   assert.deepEqual(spec.areaCourses,entry.curriculum.majorRequirements.map(row=>[row.code,row.title]),'The declarative major specification must match the reviewed ledger');
   const bindings=entry.authoring.courseBindings;assert(Array.isArray(bindings)&&bindings.length===spec.areaCourses.length,'Each selected course has an independent reviewed source binding');
   assert.deepEqual(bindings.map(binding=>binding.code),spec.areaCourses.map(([code])=>code),'Exact per-course source roster');
   for(const binding of bindings){const source=binding.source;assert.equal(binding.credits,3);assert(text(source?.id)&&source.kind==='university'&&/^[a-f0-9]{64}$/.test(source.sha256||''));assert(pathSafe(source.capture,'content/source-captures/'));assert.equal(new URL(source.url).hostname,'tesu.smartcatalogiq.com');assert(entry.sourceRefs.modelSourceIds.includes(source.id),'Course evidence remains in exact model source scope');}
  }
  if(entry.stages.includes('business-metadata'))assert.equal(entry.metadataBasis?.degreePath,url.pathname.replace(/^\/en\//,'/').replace(/\/$/,''),'Exact metadata degree path');
 }
 for(const legacy of list(document.legacyIdentities)){assert(id(legacy.modelId)&&list(legacy.routeIds).length);assert(pathSafe(legacy.path,'dist/data/'));assert.equal(legacy.migration,'retain-distinct-no-automatic-migration');}
 return document;
}

/** All registration keys are explicit. No title matching or school-wide award inference. */
export function createProgramManifestRegistry(documents){
 assert(Array.isArray(documents));const schools=new Map(),modelIds=new Map(),routeIds=new Map(),paths=new Map(),programPaths=new Map(),slugs=new Map(),legacyIds=new Map();
 const reserve=(map,key,value,label)=>{assert(!map.has(key),label+' collision: '+key);map.set(key,value);};
 for(const input of documents){const document=deepFreeze(copy(validateProgramManifest(input)));reserve(schools,document.school.id,document,'School manifest');
  for(const entry of document.programs){reserve(modelIds,entry.modelId,entry,'Model ID');reserve(slugs,entry.schoolId+'/'+entry.slug,entry,'School/slug');
   const prior=paths.get(entry.outputPath);
   if(prior){assert(text(entry.outputGroup)&&prior.outputGroup===entry.outputGroup&&prior.schoolId===entry.schoolId&&prior.catalog===entry.catalog&&prior.creditSystem===entry.creditSystem,'Output path collision: '+entry.outputPath);}else paths.set(entry.outputPath,entry);
   reserve(programPaths,entry.programPath,entry,'Programme source path');for(const route of entry.routeIds)reserve(routeIds,route,entry,'Route ID');}
  for(const legacy of list(document.legacyIdentities)){reserve(legacyIds,legacy.modelId,legacy,'Legacy model');for(const route of legacy.routeIds)if(route!==legacy.modelId)reserve(legacyIds,route,legacy,'Legacy route');}
 }
 for(const legacy of legacyIds.keys())assert(!modelIds.has(legacy)&&!routeIds.has(legacy),'Legacy identity must stay distinct: '+legacy);
 // Expose frozen values and plain lookup functions rather than mutable Maps.
 const programs=Object.freeze([...modelIds.values()]);
 return Object.freeze({documents:Object.freeze([...schools.values()]),programs,legacyIdentities:Object.freeze([...legacyIds.values()]),get:id=>modelIds.get(id)||routeIds.get(id)||slugs.get(id)||null});
}

export function selectProgramManifests(registry,{schoolId,family,stage,level,modality,catalog}={}){
 return registry.programs.filter(entry=>(!schoolId||entry.schoolId===schoolId)&&(!family||entry.family===family)&&(!stage||entry.stages.includes(stage))&&(!level||entry.level===level)&&(!modality||entry.modalities.includes(modality))&&(!catalog||entry.catalog===catalog));
}
export const resolveProgramManifest=(registry,id)=>registry.get(id);

/** Check retained facts against canonical authoring and context. No writes or
 * inferred approval. Adding a manifest entry alone cannot satisfy this check. */
export async function checkProgramManifestBindings(registry,{root=manifestRoot}={}){
 const rates=await read(resolve(root,'content/estimates/plan-estimate-rates.json')),fit=await read(resolve(root,'content/discovery/program-fit-reviews.json'));
 let checked=0;
 for(const document of registry.documents){
  const school=await read(resolve(root,document.school.kitPath,'school.json'));assert.equal(school.id,document.school.id);assert.equal(school.name,document.school.name);
  for(const entry of document.programs){
   let contexts;try{contexts=await read(resolve(root,entry.context.requirementsPath||'content/discovery/'+school.id+'-program-requirements.json'));}catch(error){if(error.code!=='ENOENT')throw error;contexts={reviews:[]};}
   const program=await read(resolve(root,entry.programPath));
   for(const field of ['slug','modelId','title','catalog','level','totalCredits','routeIds','modalities'])assert.deepEqual(program[field],entry[field],entry.slug+': canonical '+field);
   assert.equal(program.creditSystem||school.creditSystem,entry.creditSystem,entry.slug+': original unit');assert.deepEqual(program.review,entry.authoringReview,entry.slug+': original authoring review');
   assert.deepEqual(program.modelFields.catalogIdentity,entry.sourceRefs.degree,entry.slug+': exact degree source/catalog binding');
   assert.deepEqual(program.modelSourceIds,entry.sourceRefs.modelSourceIds,entry.slug+': exact source closure');
   assert.deepEqual(program.modelFields.tuitionComparison,entry.pricing.comparison,entry.slug+': independent price identity and review date');
   assert.deepEqual(manifestMajorRequirements(program),entry.curriculum.majorRequirements,entry.slug+': source-bound major requirements');
   assert.deepEqual(program.policies||{},entry.curriculum.policies,entry.slug+': program policy overrides');assert.deepEqual(manifestConstraints(program),entry.curriculum.constraints,entry.slug+': academic constraints');
   const publication=list(school.publish?.documents).find(doc=>doc.path===entry.outputPath);assert(publication?.programs?.includes(entry.slug),entry.slug+': canonical output declaration');
   for(const route of entry.routeIds)assert(list(publication.routes).some(record=>record.id===route&&record.schoolId===entry.schoolId&&record.level===entry.level&&record.degreeCredits===entry.totalCredits&&record.creditUnit===entry.creditSystem&&JSON.stringify(record.modalities)===JSON.stringify(entry.modalities)),entry.slug+': exact output route scope');
   const degree=entry.sourceRefs.degree,source=list(school.sources).find(s=>s.id===degree.sourceId);assert(source,entry.slug+': reviewed degree source retained');
   for(const [target,key]of [['url','sourceUrl'],['capture','capture'],['sha256','sourceSha256']])assert.equal(source[target],degree[key],entry.slug+': primary '+target);
   assert.equal(source.checkedOn||source.checked,degree.checkedOn,entry.slug+': source review date');
   const body=await readFile(resolve(root,degree.capture));assert.equal(hash(body),degree.sourceSha256,entry.slug+': immutable primary body');const sidecar=await read(resolve(root,degree.capture.replace(/\.txt$/,'.json')));assert.equal(sidecar.url,degree.sourceUrl);assert.equal(sidecar.sha256,degree.sourceSha256);
   for(const binding of list(entry.authoring?.courseBindings)){
    const retained=list(school.sources).find(source=>source.id===binding.source.id);assert(retained,entry.slug+': retained independent course source');
    for(const field of ['id','url','capture','sha256'])assert.equal(binding.source[field],retained[field],binding.code+': exact retained '+field);
    assert.equal(binding.source.checkedOn||binding.source.checked,retained.checkedOn||retained.checked,binding.code+': independent original course review date');
   }
   const actualRates=list(rates.entries).filter(r=>list(r.modelIds).includes(entry.modelId)).map(r=>r.id);assert.deepEqual(actualRates,entry.pricing.rateIds,entry.slug+': exact rate-profile scope');
   for(const rateId of entry.pricing.rateIds){const rate=rates.entries.find(r=>r.id===rateId);assert.equal(rate.school,school.name);assert.equal(rate.creditSystem,entry.creditSystem);assert.equal(rate.degreeUnits,entry.totalCredits);assert(list(rate.catalogs).includes(entry.catalog));assert(entry.modalities.includes(rate.modality));}
   for(const [rows,key]of [[fit.reviews,'fitReviewIds'],[contexts.reviews,'requirementReviewIds']]){
    const reviews=list(rows).filter(row=>list(row.modelIds).includes(entry.modelId));assert.deepEqual(reviews.map(row=>row.id),entry.context[key],entry.slug+': exact '+key);
    for(const review of reviews){
     if(review.catalogYear)assert.equal(review.catalogYear,entry.catalog,entry.slug+': contextual catalog');
     if(review.modality)assert(entry.modalities.includes(review.modality),entry.slug+': contextual modality');
     if(review.catalogIdentity)for(const field of ['kind','label','sourceId','sourceUrl','checkedOn','sourceSha256'])assert.equal(review.catalogIdentity[field],degree[field],entry.slug+': contextual degree '+field);
     assert(list(review.programBindings).some(binding=>binding.modelId===entry.modelId&&binding.degreeUrl===degree.sourceUrl),entry.slug+': contextual exact degree binding');
    }
   }
   checked++;
  }
 }
 return {programs:checked,academicModelsChanged:0,publicationDecisionsMade:0};
}

export async function loadProgramManifests({root=manifestRoot,directory='content/factory-manifests',validateBindings=false}={}){
 assert(pathSafe(directory,'content/'),'Local content manifest directory required');
 const documents=[];for(const name of (await readdir(resolve(root,directory))).filter(name=>name.endsWith('.json')).sort())documents.push(await read(resolve(root,directory,name)));
 const registry=createProgramManifestRegistry(documents);if(validateBindings)await checkProgramManifestBindings(registry,{root});return registry;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert(process.argv.slice(2).every(arg=>arg==='--check'),'Use --check. This registry never writes or publishes.');
 const registry=await loadProgramManifests();console.log(JSON.stringify({schools:registry.documents.length,...await checkProgramManifestBindings(registry),published:false}));
}
