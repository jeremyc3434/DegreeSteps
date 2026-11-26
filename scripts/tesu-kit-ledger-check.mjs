/* The retired TESU importers (import-tesu-*.mjs) no longer write content/curricula/tesu-*.json: those documents are
 * published from content/pathway-kits/tesu (npm run factory:publish). Their builders still turn the reviewed fact snapshots
 * into a ledger, so `--check` now proves that the kit-published document carries exactly that reviewed ledger: the same
 * declared route, the same academic model fields, the same requirements (outside options are the kit's equivalency
 * table, and the registry's selectionRequired:false bookkeeping is ignored) and every named option the importer created. */
import assert from 'node:assert/strict';
import {applyTESUProviderReview} from './tesu-provider-review.mjs';
import {applyTESUUPIProviderDefaults} from './tesu-upi-defaults.mjs';
import {reviewedTESUCatalogIdentity,reviewedTESUTuitionComparison} from './tesu-source-parity.mjs';

/** Narrative fields a later evidence review may reword without changing the reviewed ledger. */
export const narrativeFields=Object.freeze(['rulesNotes','unresolved','coverageLabel','pricingNotes','sources']);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

export function assertKitLedger(published,built,label){
  assert.equal(published?.compiledBy,'pathway-factory',label+': the published document comes from the TESU pathway kit');
  assert.deepEqual(canonical(published.routes),canonical(built.routes),label+': declared degree route');
  assert.equal(published.models.length,1,label+': one model');
  // Provider governance is maintained independently of the archived curriculum
  // facts. Compare against its exact current source-bound metadata; do not
  // discard this field or refresh the academic snapshot to make parity pass.
  const kit=published.models[0],reviewed=applyTESUUPIProviderDefaults(applyTESUProviderReview(structuredClone(built.models[0])));
  reviewed.catalogIdentity=reviewedTESUCatalogIdentity(kit,reviewed.catalogIdentity);
  if(reviewed.catalogIdentity.sourceId)reviewed.sourceIds=[...new Set([...(reviewed.sourceIds||[]),reviewed.catalogIdentity.sourceId])];
  reviewed.tuitionComparison=reviewedTESUTuitionComparison(kit,reviewed.tuitionComparison,built.models[0].sources);
  // The registry keeps only section members that are requirements of the degree (Liberal Studies' importer listed a
  // phi1300 section member that is not one of its 40 requirements); the published ledger is compared on that basis.
  const ids=new Set(reviewed.requirements.map(row=>row.id));
  for(const section of reviewed.curriculumSections||[])section.requirementIds=section.requirementIds.filter(id=>ids.has(id));
  for(const field of new Set([...Object.keys(kit),...Object.keys(reviewed)])){
    if(field==='requirements'||narrativeFields.includes(field))continue;
    // Fields the registry fills generically (policy-review prompts, evidence date) appear only on the published side.
    if(!(field in reviewed)&&['policyReview','evidenceCheckedOn'].includes(field))continue;
    assert.ok(same(kit[field],reviewed[field]),label+': model field '+field+' differs from the reviewed facts');
  }
  assert.equal(kit.requirements.length,reviewed.requirements.length,label+': requirement count');
  reviewed.requirements.forEach((row,index)=>{
    const {options,...fields}=row,{options:kitOptions,...kitFields}=kit.requirements[index];
    if(kitFields.selectionRequired===false&&fields.selectionRequired===undefined)delete kitFields.selectionRequired;
    assert.ok(same(kitFields,fields),label+': requirement '+row.id+' differs from the reviewed facts');
    for(const option of options)assert.ok(kitOptions.some(o=>o.id===option.id&&o.provider===option.provider&&o.code===option.code),label+': '+row.id+' keeps the reviewed option '+option.id);
  });
  return {model:kit.id,requirements:kit.requirements.length,credits:kit.totalCredits,newProviderEquivalencies:0,check:true};
}
