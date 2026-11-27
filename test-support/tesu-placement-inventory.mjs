/** Frozen old/new allocation counts. This prevents a larger total hiding a
 * regression in any of the five previously released degree ledgers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const TESU_PLACEMENT_COUNTS=Object.freeze({
 'curriculum-tesu-ba-english':253,
 'curriculum-tesu-ba-liberal-studies':331,
 'curriculum-tesu-ba-psychology':226,
 'curriculum-tesu-bsba-accounting':103,
 'curriculum-tesu-bsba-finance':83,
 'curriculum-tesu-bs-general-management':99,
 'curriculum-tesu-bsba-human-resources-organizational-management':99,
 'curriculum-tesu-bsba-marketing':103
});
export const TESU_ADDITIONAL_PLACEMENT_COUNTS=Object.freeze({
 'curriculum-tesu-bs-computer-information-systems':103,
 'curriculum-tesu-bs-healthcare-management':99
});
export function assertTESUPlacementInventory(models){
 const counts=Object.fromEntries(models.map(model=>[model.id,model.requirements.flatMap(row=>row.options).filter(option=>option.courseEligibilityResolution).length]));
 assert.deepEqual(counts,TESU_PLACEMENT_COUNTS);
 const old=['ba-english','ba-liberal-studies','ba-psychology','bsba-accounting','bsba-finance'];
 assert.equal(old.reduce((sum,slug)=>sum+counts['curriculum-tesu-'+slug],0),996);
 assert.equal(Object.values(counts).reduce((sum,count)=>sum+count,0),1297);
 return counts;
}

/** Preserve the old inventory as its own assertion; additions must also agree
 * with their independent November 27 placement packet, never just a new total. */
export function assertTESUExpandedPlacementInventory(models){
 const oldIds=new Set(Object.keys(TESU_PLACEMENT_COUNTS)),newIds=new Set(Object.keys(TESU_ADDITIONAL_PLACEMENT_COUNTS));
 assert.deepEqual(models.map(model=>model.id).sort(),[...oldIds,...newIds].sort(),'Every old and new ledger is present exactly once');
 const historical=models.filter(model=>oldIds.has(model.id)),additions=models.filter(model=>newIds.has(model.id));
 const historicalCounts=assertTESUPlacementInventory(historical);
 const packet=JSON.parse(readFileSync(new URL('../content/pathway-kits/tesu/course-placements-review-2026-11-27.json',import.meta.url),'utf8'));
 assert.equal(packet.checkedOn,'2026-11-27');assert.equal(packet.courseEligibilityReviewId,'tesu-exact-course-eligibility-2026-11-26');
 assert.deepEqual(packet.models.map(model=>model.modelId).sort(),[...newIds].sort());
 const packetCounts=Object.fromEntries(packet.models.map(model=>[model.modelId,packet.placements.filter(placement=>placement.modelId===model.modelId).length]));
 const additionalCounts=Object.fromEntries(additions.map(model=>[model.id,model.requirements.flatMap(row=>row.options).filter(option=>option.courseEligibilityResolution).length]));
 assert.deepEqual(packetCounts,TESU_ADDITIONAL_PLACEMENT_COUNTS);assert.deepEqual(additionalCounts,packetCounts);
 assert.equal(packet.placements.length,202);assert.equal(Object.values(additionalCounts).reduce((sum,count)=>sum+count,0),202);
 return {historical,additions,historicalCounts,additionalCounts,packet};
}
