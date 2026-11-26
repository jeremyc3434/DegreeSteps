/** Exact discovery/price bindings for the reviewed TESU business-family roster.
 * Reuses retained school policies and prices without refreshing their dates.
 * --write changes metadata JSON only; canonical authoring remains with the
 * program owner through buildTESUBusinessTuitionBinding(). No publication flag.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root,isMain} from './pathway-factory/lib.mjs';
import {validateConnectedWebCapture} from './pathway-factory/connected-web.mjs';
import {validateProgramRequirementPacket} from './program-requirements-metadata.mjs';
import Estimate from '../dist/plan-estimate-engine.js';
import {loadProgramManifests,selectProgramManifests} from './pathway-factory/program-manifest.mjs';

export const TESU_BUSINESS_METADATA_TARGETS=Object.freeze(selectProgramManifests(await loadProgramManifests(),{schoolId:'tesu',stage:'business-metadata'}).map(entry=>Object.freeze({slug:entry.slug,modelId:entry.modelId,routeId:entry.routeIds[0],title:entry.title,degreePath:entry.metadataBasis.degreePath})));
export const TESU_BUSINESS_CATALOG_LABEL='Current undergraduate catalog · checked November 18, 2026';
export const TESU_BUSINESS_RATE_ID='tesu-standard-business-expansion-20261126';
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8')),copy=structuredClone,list=v=>Array.isArray(v)?v:[],hash=v=>createHash('sha256').update(v).digest('hex');
const normalized=v=>String(v||'').replace(/\s+/g,' ').trim(),wordkey=v=>normalized(v).toLowerCase().replace(/[^a-z0-9]/g,''),date=v=>{try{return typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}catch{return false;}};
const idFor=program=>program.modelId||program.id;
const targetFor=id=>{const target=TESU_BUSINESS_METADATA_TARGETS.find(target=>target.modelId===id);assert(target,'Only manifest-listed separately authored business models are in this metadata scope');return target;};
const paths={fit:'content/discovery/program-fit-reviews.json',requirements:'content/discovery/tesu-program-requirements.json',rates:'content/estimates/plan-estimate-rates.json'};

export async function loadTESUBusinessPriceBasis(rates){
 rates??=await read(paths.rates);
 Estimate.assertRates(rates);const entry=rates.entries.find(entry=>entry.id==='tesu-standard-out-of-state-2026');assert(entry);
 assert.equal(entry.school,'Thomas Edison State University');assert.equal(entry.degreeUnits,120);assert.equal(entry.creditSystem,'semester');assert.equal(entry.modality,'online');assert.equal(entry.institutionMinimumUnits,15);
 assert.deepEqual(entry.tuition,{type:'banded-term',termRate:4652,bandMin:9,bandMax:18,partTimeRate:584});assert.equal(entry.oneTimeFees,148);assert.equal(entry.feesPerTerm,0);
 assert.deepEqual(entry.feeBreakdown,[{label:'Application fee',amount:50,frequency:'one-time'},{label:'Graduation audit fee',amount:98,frequency:'one-time'}]);assert.deepEqual(entry.pace,{min:3,max:15,defaultMin:9,defaultMax:15});assert.equal(entry.termMonths,null);assert.equal(entry.termLabel,'term');
 assert.deepEqual(entry.sourceIds,['tesu-tuition-2026-11-25','tesu-fees-2026-11-25']);
 const originals=entry.sourceIds.map(id=>rates.sources.find(source=>source.id===id));assert.equal(originals.length,2);
 for(const source of originals){assert(/^content\/estimates\/snapshots\/tesu-(?:tuition|fees)-2026-11-25\.txt$/.test(source?.reviewBasis?.document||''));assert.equal(new URL(source.url).origin,'https://www.tesu.edu');assert.equal(source.checkedOn,'2026-11-25');const body=await readFile(resolve(root,source.reviewBasis.document),'utf8');assert.equal(hash(body),source.reviewBasis.sha256,'The retained price body must still match its original review');assert.equal(source.reviewBasis.httpStatus,200);assert.equal(source.reviewBasis.fetchedAt.slice(0,10),'2026-11-25');}
 const primary=originals.find(source=>source.id==='tesu-tuition-2026-11-25');assert(primary);const body=await readFile(resolve(root,primary.reviewBasis.document),'utf8');assert(body.includes('$4,652')&&body.includes('$584'));
 const feeSource=originals.find(source=>source.id==='tesu-fees-2026-11-25'),feeBody=normalized(await readFile(resolve(root,feeSource.reviewBasis.document),'utf8'));assert(feeBody.includes('Application $50')&&feeBody.includes('Graduation Audit Fee** $98'),'Each retained one-time charge has its own literal fee-table row');
 const source={id:primary.id,title:primary.title,url:primary.url,kind:'university',roles:['tuition'],checkedOn:primary.checkedOn,capture:primary.reviewBasis.document,sha256:primary.reviewBasis.sha256,sourceContentHash:'sha256:'+primary.reviewBasis.sha256,reviewBasis:copy(primary.reviewBasis)};
 return{entry:copy(entry),sources:copy(originals),tuitionSource:source};
}

/** Program authors add the returned source to their own source scope and bind
 * this model-specific comparison in modelFields. No academic fields change. */
export function buildTESUBusinessTuitionBinding({modelId,catalogIdentity},basis){
 const target=targetFor(modelId);assert.equal(catalogIdentity?.kind,'reviewed-current-catalog');assert.equal(catalogIdentity.label,TESU_BUSINESS_CATALOG_LABEL);assert(date(catalogIdentity.checkedOn));assert(catalogIdentity.sourceId&&/^[a-f0-9]{64}$/.test(catalogIdentity.sourceSha256||'')&&/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(catalogIdentity.capture||''));const url=new URL(catalogIdentity.sourceUrl);assert.equal(url.protocol,'https:');assert.equal(url.hostname,'tesu.smartcatalogiq.com');assert.equal(url.pathname.replace(/^\/en\//,'/').replace(/\/$/,''),target.degreePath);
 assert.equal(basis?.tuitionSource?.id,'tesu-tuition-2026-11-25');assert.equal(basis.tuitionSource.checkedOn,'2026-11-25');
 return{tuitionComparison:{entryId:'tesu-standard',sourceUrl:basis.tuitionSource.url,checkedOn:catalogIdentity.checkedOn,catalogIdentity:copy(catalogIdentity),modelId,pricingSourceCheckedOn:basis.tuitionSource.checkedOn,pricingSourceIds:[basis.tuitionSource.id],reviewScope:'The exact current degree identity is bound to the retained standard undergraduate tuition comparison. The November 25 price-source review and amounts are unchanged; no new price review is claimed.'},sources:[copy(basis.tuitionSource)],modelSourceIds:[basis.tuitionSource.id]};
}

export function buildTESUBusinessRateProfile(basis){
 assert.equal(basis?.entry?.id,'tesu-standard-out-of-state-2026');return{...copy(basis.entry),id:TESU_BUSINESS_RATE_ID,modelIds:TESU_BUSINESS_METADATA_TARGETS.map(target=>target.modelId),catalogs:[TESU_BUSINESS_CATALOG_LABEL],notes:[...basis.entry.notes,'Reuses the existing November 25 published price review for these exact current degree identities; no price-source date or amount was refreshed.']};
}

async function capturedSource(source,{checkedOn,sidecar=true}={}){
 assert.equal(source?.kind,'university');assert(/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture||'')&&/^[a-f0-9]{64}$/.test(source.sha256||''));assert(date(source.checkedOn||source.checked));assert((source.checkedOn||source.checked)<=checkedOn);
 const body=await readFile(resolve(root,source.capture),'utf8');assert.equal(hash(body),source.sha256);
 if(sidecar){const meta=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);
  if(source.captureFormat==='connected-web-rendered-extract'||meta.captureFormat==='connected-web-rendered-extract'||source.toolResponseReceipt||meta.toolResponseReceipt){assert(source.toolResponseReceipt,'The exact degree source independently pins its native receipt');assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt,'A source cannot substitute another citation or receipt');await validateConnectedWebCapture({...meta,text:body});}
  else assert([200,206].includes(meta.status),'Use a successful origin response or an exactly receipt-bound native extract');
  assert(meta.fetchedAt.slice(0,10)<=(source.checkedOn||source.checked));}
 if(source.quote)assert(normalized(body).includes(normalized(source.quote)));return body;
}

export async function validateTESUBusinessMetadataModel(model,{asOf='2026-11-26'}={}){
 const target=targetFor(idFor(model)),identity=model.catalogIdentity;assert(date(asOf));assert.equal(model.school,'Thomas Edison State University');assert.equal(model.level,'bachelor');assert.equal(model.format,'Online');assert.equal(model.creditSystem,'semester');assert.equal(model.totalCredits,120);assert.equal(model.catalogYear??null,null);assert.equal(model.catalog,TESU_BUSINESS_CATALOG_LABEL);assert.equal(wordkey(model.title),wordkey(target.title));
 assert.equal(identity?.kind,'reviewed-current-catalog');assert.equal(identity.label,model.catalog);assert(date(identity.checkedOn)&&identity.checkedOn<=asOf);assert.equal(identity.sourceUrl,new URL(identity.sourceUrl).href);assert.equal(new URL(identity.sourceUrl).hostname,'tesu.smartcatalogiq.com');assert.equal(new URL(identity.sourceUrl).pathname.replace(/^\/en\//,'/').replace(/\/$/,''),target.degreePath);
 const source=list(model.sources).find(source=>source.id===identity.sourceId);assert(source&&source.kind==='university');assert.equal(source.url,identity.sourceUrl);assert.equal(source.checkedOn||source.checked,identity.checkedOn);assert.equal(source.sha256,identity.sourceSha256);assert.equal(source.capture,identity.capture);assert(list(model.sourceIds).includes(source.id));
 const body=await capturedSource(source,{checkedOn:identity.checkedOn});assert(/Total Credit Hours:\s*120/.test(body));assert(wordkey(body).includes(wordkey(target.title)),'The exact named degree must occur in its retained current page');
 return{target,source:{...copy(source),checkedOn:identity.checkedOn,quote:'Total Credit Hours: 120'},identity:copy(identity)};
}

export async function buildTESUBusinessMetadata({models,fitReviews,requirements,rates,asOf='2026-11-26'}){
 assert.equal(models.length,TESU_BUSINESS_METADATA_TARGETS.length,'All exact manifest models are required before shared metadata is written');assert.equal(new Set(models.map(idFor)).size,TESU_BUSINESS_METADATA_TARGETS.length);validateProgramRequirementPacket(requirements);const basis=await loadTESUBusinessPriceBasis(rates),nextFit=copy(fitReviews),nextRequirements=copy(requirements),nextRates=copy(rates);
 const template=fitReviews.reviews.find(review=>review.id==='tesu-standard-online-undergraduate-scheduled-reviewed-20261126'),context=requirements.reviews.find(review=>review.modelIds.includes('curriculum-tesu-bsba-accounting'));assert(template&&context);assert.equal(template.catalogYear,TESU_BUSINESS_CATALOG_LABEL);assert.equal(template.paceModel,'course-term');assert.equal(template.baselineFormat,'standard-online-coursework');
 for(const source of [template.source,...template.supportingSources])await capturedSource(source,{checkedOn:asOf});
 const resolutions=[];
 for(const model of models){
  const resolution=await validateTESUBusinessMetadataModel(model,{asOf}),{target,source,identity}=resolution;resolutions.push(resolution);
  const expectedBinding=buildTESUBusinessTuitionBinding({modelId:target.modelId,catalogIdentity:identity},basis);assert.deepEqual(model.tuitionComparison,expectedBinding.tuitionComparison,'Canonical model must retain the exact catalog/price-source binding: '+target.modelId);const priceSource=model.sources.find(source=>source.id===basis.tuitionSource.id);assert(priceSource);for(const field of ['url','capture','sha256'])assert.equal(priceSource[field],basis.tuitionSource[field]);assert.equal(priceSource.checkedOn||priceSource.checked,'2026-11-25');
  const existing=nextRequirements.sources.find(candidate=>candidate.id===source.id);if(existing){for(const field of ['id','url','sha256','capture','checkedOn'])assert.equal(existing[field],source[field]);}else nextRequirements.sources.push(source);
  const reviewId=target.routeId+'-requirements-business-expansion-20261126',review={id:reviewId,modelIds:[target.modelId],catalogIdentity:{kind:identity.kind,label:identity.label,sourceId:identity.sourceId,sourceUrl:identity.sourceUrl,checkedOn:identity.checkedOn,sourceSha256:identity.sourceSha256},modality:'online',programBindings:[{modelId:target.modelId,degreeUrl:source.url}],facts:context.facts.map(fact=>({...copy(fact),id:target.routeId+'-'+fact.type+'-business-expansion-20261126'}))};
  const prior=nextRequirements.reviews.findIndex(candidate=>candidate.id===reviewId);if(prior<0)nextRequirements.reviews.push(review);else assert.deepEqual(nextRequirements.reviews[prior],review,'A previously authored contextual binding cannot silently change');
 }
 const fit={...copy(template),id:'tesu-business-expansion-standard-online-scheduled-20261126',modelIds:TESU_BUSINESS_METADATA_TARGETS.map(target=>target.modelId),programBindings:TESU_BUSINESS_METADATA_TARGETS.map(target=>({modelId:target.modelId,degreeUrl:resolutions.find(resolution=>resolution.target.modelId===target.modelId).source.url})),notes:[...template.notes,'Exact e-Pack or alternative-format selections retain their own course-specific evidence; this school-wide standard-online classification does not replace it.']};
 const priorFit=nextFit.reviews.findIndex(review=>review.id===fit.id);if(priorFit<0)nextFit.reviews.push(fit);else assert.deepEqual(nextFit.reviews[priorFit],fit);
 const rate=buildTESUBusinessRateProfile(basis);
 assert(nextRates.entries.filter(entry=>entry.id!==rate.id).every(entry=>!entry.modelIds.some(id=>rate.modelIds.includes(id))),'New exact price bindings cannot overlap another estimate profile');
 const priorRate=nextRates.entries.findIndex(entry=>entry.id===rate.id);if(priorRate<0)nextRates.entries.push(rate);else assert.deepEqual(nextRates.entries[priorRate],rate);
 validateProgramRequirementPacket(nextRequirements);Estimate.assertRates(nextRates);
 return{fitReviews:nextFit,requirements:nextRequirements,rates:nextRates,modelIds:TESU_BUSINESS_METADATA_TARGETS.map(target=>target.modelId),publicationDecisionsMade:0,studentCreditAwards:0,priceSourcesRefreshed:0};
}

export async function runTESUBusinessMetadata({check=true}={}){
 const {loadKit}=await import('./pathway-factory/lib.mjs'),{compileProgram}=await import('./pathway-factory/compile.mjs'),kit=await loadKit('content/pathway-kits/tesu'),models=TESU_BUSINESS_METADATA_TARGETS.map(target=>{const program=kit.programs.find(program=>program.modelId===target.modelId);assert(program,'Author the exact canonical degree before metadata: '+target.modelId);return compileProgram(kit,program);});
 const result=await buildTESUBusinessMetadata({models,fitReviews:await read(paths.fit),requirements:await read(paths.requirements),rates:await read(paths.rates)});
 for(const[key,file]of Object.entries(paths)){const value=key==='fit'?result.fitReviews:result[key],body=JSON.stringify(value,null,2)+'\n';if(check)assert.deepEqual(await read(file),value,'Install the exact business metadata: '+file);else await writeFile(resolve(root,file),body);}
 return{modelIds:result.modelIds,publicationDecisionsMade:0,studentCreditAwards:0,priceSourcesRefreshed:0,check};
}
if(isMain(import.meta)){const args=process.argv.slice(2);assert(args.every(arg=>['--check','--write'].includes(arg))&&!(args.includes('--check')&&args.includes('--write')),'Use --check or explicitly --write');console.log(JSON.stringify(await runTESUBusinessMetadata({check:!args.includes('--write')})));}
