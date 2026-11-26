/** Frozen old/new allocation counts. This prevents a larger total hiding a
 * regression in any of the five previously released degree ledgers. */
import assert from 'node:assert/strict';
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
export function assertTESUPlacementInventory(models){
 const counts=Object.fromEntries(models.map(model=>[model.id,model.requirements.flatMap(row=>row.options).filter(option=>option.courseEligibilityResolution).length]));
 assert.deepEqual(counts,TESU_PLACEMENT_COUNTS);
 const old=['ba-english','ba-liberal-studies','ba-psychology','bsba-accounting','bsba-finance'];
 assert.equal(old.reduce((sum,slug)=>sum+counts['curriculum-tesu-'+slug],0),996);
 assert.equal(Object.values(counts).reduce((sum,count)=>sum+count,0),1297);
 return counts;
}
