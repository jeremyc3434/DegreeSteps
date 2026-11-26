/** Later source reviews can enrich provenance without rewriting earlier academic facts. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {providerReview} from './tesu-provider-review.mjs';
const root=resolve(import.meta.dirname,'..'),copy=structuredClone;
const placementReview=JSON.parse(readFileSync(resolve(root,'content/pathway-kits/tesu/course-placements-review-2026-11-26.json'),'utf8'));

export function verifyTESUSourceCapture(source,{sha256=source.sha256,checkedOn=source.checkedOn||source.checked}={}){
 assert(/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture||''),'Retain the actual reviewed TESU source body');assert(/^[a-f0-9]{64}$/.test(sha256||''));
 const body=readFileSync(resolve(root,source.capture),'utf8'),actual=createHash('sha256').update(body).digest('hex'),meta=JSON.parse(readFileSync(resolve(root,source.capture.replace(/\.txt$/,'.json')),'utf8'));
 assert.equal(actual,sha256);for(const field of ['sha256','sourceContentHash'])if(source[field]!==undefined)assert.equal(source[field],actual,'Every declared body hash agrees');for(const field of ['checked','checkedOn'])if(source[field]!==undefined)assert.equal(source[field],checkedOn,'Every declared review date agrees');assert.equal(meta.sha256,actual);assert.equal(meta.url,source.url);assert.equal(meta.status,200);assert.equal(meta.fetchedAt.slice(0,10),checkedOn,'A later review does not invent an earlier retrieval');return body;
}

/** Accept the one independently recorded current-catalog rereview, while
 * retaining the earlier label/URL and requiring the exact new primary body. */
export function reviewedTESUCatalogIdentity(model,original){
 const actual=model.catalogIdentity;if(JSON.stringify(actual)===JSON.stringify(original))return copy(original);
 const reviewed=placementReview.models.find(review=>review.modelId===model.id);assert(reviewed,'An exact model-scoped catalog rereview exists');
 const proof=placementReview.sources.find(source=>source.id===reviewed.degreeSourceId),source=model.sources.find(source=>source.id===reviewed.degreeSourceId);assert(proof&&source);assert.equal(model.school,placementReview.schoolName);assert.equal(model.catalog,reviewed.catalog);assert.equal(original.label,reviewed.catalog);assert.equal(original.kind,'reviewed-current-catalog');assert.equal(proof.kind,'university');assert.equal(source.kind,'university');assert.equal(source.url,original.sourceUrl);assert.equal(source.url,proof.url);assert.equal(source.capture,proof.capture);assert.equal(source.sha256,placementReview.sourceHashes[source.id]);assert.equal(source.checkedOn||source.checked,placementReview.checkedOn);
 const expected={...copy(original),checkedOn:placementReview.checkedOn,priorCheckedOn:original.checkedOn,sourceId:source.id,sourceSha256:source.sha256,capture:source.capture};assert.deepEqual(actual,expected,'The catalog identity is the exact source-bound rereview, not an arbitrary metadata change');
 const body=verifyTESUSourceCapture(source,{sha256:expected.sourceSha256,checkedOn:expected.checkedOn});assert(/Total Credit Hours:\s*120/.test(body));return expected;
}

export const TESU_TUITION_CATALOG_BINDING_SCOPE='The November 26 review binds the existing tuition comparison to the exact re-reviewed current catalog. Tuition source review dates and prices are retained; no new price review is claimed.';
/** Rebind an existing comparison to the independently re-reviewed catalog.
 * The earlier tuition source, date, entry and every price-related field remain
 * owned by their original review; this operation is not a tuition refresh. */
export function reviewedTESUTuitionComparison(model,original,originalSources){
 const actual=model.tuitionComparison;assert(original&&actual);assert.equal(original.modelId,model.id);
 if(JSON.stringify(actual)===JSON.stringify(original)){assert.deepEqual(model.catalogIdentity,original.catalogIdentity,'An unchanged comparison must still match its exact catalog identity');return copy(original);}
 const catalogIdentity=reviewedTESUCatalogIdentity(model,original.catalogIdentity),candidates=originalSources.filter(source=>source.url===original.sourceUrl&&(source.checkedOn||source.checked)===original.checkedOn);assert.equal(candidates.length,1,'The earlier comparison identifies one exact dated primary tuition source');
 const historical=candidates[0],retained=model.sources.find(source=>source.id===historical.id);assert(retained);assert.deepEqual(retained,historical,'The tuition source record is unchanged by the catalog-binding review');
 const url=new URL(retained.url);assert.equal(url.protocol,'https:');assert(url.hostname==='tesu.edu'||url.hostname.endsWith('.tesu.edu'));assert.equal(retained.checkedOn||retained.checked,original.checkedOn);
 const expected={...copy(original),checkedOn:catalogIdentity.checkedOn,catalogIdentity,pricingSourceCheckedOn:original.checkedOn,pricingSourceIds:[historical.id],reviewScope:TESU_TUITION_CATALOG_BINDING_SCOPE};assert.deepEqual(actual,expected,'Only the exact catalog binding changes; original tuition identity, source date and prices stay unchanged');return expected;
}

/** Legacy source records can omit newly retained metadata only when the exact
 * unchanged primary capture proves every added hash/authority field. Existing
 * supplied metadata and all earlier owned source facts must still agree. */
export function withVerifiedTESUProviderSourceEnrichment(input){
 const model=copy(input),fields=['kind','roles','sha256','sourceContentHash'];
 for(const expected of [providerReview.source,providerReview.policySource]){
  const source=model.sources.find(source=>source.id===expected.id);assert(source,'The historical provider review source is retained');
  assert.equal(source.url,expected.url);assert.equal(source.capture,expected.capture);assert.equal(source.checked,expected.checked);
  for(const field of fields)if(Object.hasOwn(source,field))assert.deepEqual(source[field],expected[field],'Existing provider provenance must agree with actual reviewed evidence');
  verifyTESUSourceCapture(expected,{sha256:expected.sha256,checkedOn:expected.checked});
  for(const field of fields)source[field]=copy(expected[field]);
 }
 return model;
}
