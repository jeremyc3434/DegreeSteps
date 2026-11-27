import test from 'node:test';
import {assertTESUExpandedPlacementInventory} from './test-support/tesu-placement-inventory.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,root} from './scripts/pathway-factory/lib.mjs';
import {compileKit} from './scripts/pathway-factory/compile.mjs';
import {groundedSource} from './scripts/tesu-course-eligibility.mjs';
import {parseTESUAdditionalExhibit,applyTESUReceivingAdditions} from './scripts/tesu-receiving-additions.mjs';
import {periodOptions,optionCourseId} from './scripts/import-tesu-original-periods.mjs';
import {hasReviewedCourseEligibility} from './scripts/pathway-quality.mjs';
const read=async path=>JSON.parse(await readFile(root+'/'+path,'utf8')),copy=structuredClone;
const periods=await read('content/pathway-kits/tesu/original-period-bindings-2026-11-26.json'),additions=await read('content/pathway-kits/tesu/receiving-awards-additions-2026-11-26.json');

test('all36 exact original exhibit periods retain complete actual select markup and the selected course CID',async()=>{
 assert.equal(periods.exhibits.length,36);assert.equal(periods.sources.length,36);
 for(const exhibit of periods.exhibits){const source=periods.sources.find(source=>source.id===exhibit.selectionSourceId),entry=await groundedSource(source),meta=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(source.captureFormat,'raw-html-recommendation-period-select-excerpt');assert.equal(meta.captureFormat,source.captureFormat);assert.equal(meta.rawResponseSha256,exhibit.rawSha256);assert(/^[a-f0-9]{64}$/.test(meta.rawResponseSha256));assert.equal(source.url,exhibit.url+'#recommendation-period-selection');assert.equal(meta.url,source.url);assert.equal(createHash('sha256').update(entry.body).digest('hex'),exhibit.selectionSha256);assert.deepEqual(periodOptions(entry.body),exhibit.selects);const chosen=exhibit.selects.flatMap(select=>select.options).filter(option=>option.selected);assert.equal(chosen.length,1);assert.equal(optionCourseId(chosen[0].value,source.url),new URL(exhibit.url).searchParams.get('cid'));}
});

test('the first displayed period never promotes the expired Managerial Accounting version1 as current version2',async()=>{
 const held=additions.heldAwards.find(award=>award.code==='SOPH-0079');assert(held);assert.equal(held.status,'archived-version-not-current-enrollment');assert.equal(held.courseVersion,1);assert.equal(held.recommendationStart,'2023-11-01');assert.equal(held.recommendationEnd,'2026-10-31');assert.equal(held.publicationPromotionAllowed,false);
 const source=additions.sources.find(source=>source.id===held.sourceId),body=await readFile(root+'/'+source.capture,'utf8'),selection=periods.exhibits.find(exhibit=>exhibit.code===held.code),options=selection.selects[0].options;assert.equal(options[0].label,'11/1/2026 - 10/31/2029');assert.equal(options[0].selected,false);assert.equal(options[1].selected,true);
 const parsed=parseTESUAdditionalExhibit(held.code,body,{periodSelection:selection});assert.equal(parsed.activeRecommendation,false);assert.equal(parsed.recommendationEnd,'2026-10-31');
 assert.throws(()=>parseTESUAdditionalExhibit(held.code,body));for(const mutate of [s=>{s.selects[0].options[1].label=s.selects[0].options[0].label;},s=>{s.selects[0].options[1].selected=false;s.selects[0].options[0].selected=true;},s=>{s.url=s.url.replace('aee1f791-b88b-ee11-8179-00224805fa3a','40a5085b-f37a-f111-ab0f-000d3a306e31');}]){const changed=copy(selection);mutate(changed);assert.throws(()=>parseTESUAdditionalExhibit(held.code,body,{periodSelection:changed}));}
});

test('receiving awards preserve independent original quantities, including1to3,3to1 and4to4',async()=>{
 assert.equal(additions.awards.length,13);assert.equal(additions.heldAwards.length,1);
 const career=additions.awards.find(a=>a.code==='SOPH-0061'),medical=additions.awards.find(a=>a.code==='SOPH-0094'),calculus=additions.awards.find(a=>a.code==='SOPH-0060');assert.equal(career.sourceCredits,1);assert.equal(career.receivingCredits,3);assert.equal(medical.sourceCredits,3);assert.equal(medical.receivingCredits,1);assert.equal(calculus.sourceCredits,4);assert.equal(calculus.receivingCredits,4);assert.equal(additions.unplacedAwards.length,2);
 const kit=await loadKit(root+'/content/pathway-kits/tesu'),doc=compileKit(kit).doc;let careerPlacements=0;
 for(const m of doc.models)for(const r of m.requirements)for(const o of r.options){if(o.code==='SOPH-0061'&&o.courseEligibilityResolution){careerPlacements++;assert.equal(o.sourceCredits,1);assert.equal(o.credits,3);assert.equal(o.sourceCreditVerification.credits,1);assert.equal(o.courseEligibilityResolution.sourceCredits,1);assert.equal(o.courseEligibilityResolution.credits,3);assert.equal(hasReviewedCourseEligibility(m,r,o,{asOf:m.catalogIdentity.checkedOn}),true);}assert(!(['SOPH-0094','SOPH-0060','SOPH-0079'].includes(o.code)&&o.courseEligibilityResolution),'No incompatible three-credit allocation or expired version appears');}
 assert(careerPlacements>10);
});

test('all1297 historical and202 new placements retain the original996 and pass their own dated source and selected-period predicates',async()=>{
 const kit=await loadKit(root+'/content/pathway-kits/tesu'),doc=compileKit(kit).doc,cohorts=assertTESUExpandedPlacementInventory(doc.models);
 for(const [models,asOf,expected]of [[cohorts.historical,'2026-11-26',1297],[cohorts.additions,'2026-11-27',202]]){let count=0;for(const m of models)for(const r of m.requirements)for(const o of r.options)if(o.courseEligibilityResolution){count++;assert.equal(hasReviewedCourseEligibility(m,r,o,{asOf}),true,m.id+'/'+r.id+'/'+o.code);}assert.equal(count,expected);}
});

test('additional receiving-award authoring is idempotent and check mode does not rewrite any source or claim',async()=>{
 const files=['content/pathway-kits/tesu/receiving-awards-additions-2026-11-26.json','content/pathway-kits/tesu/equivalencies.json','content/pathway-kits/tesu/school.json','content/pathway-kits/providers/sophia.json'],before=await Promise.all(files.map(path=>readFile(root+'/'+path,'utf8')));assert.equal((await applyTESUReceivingAdditions({check:true})).exactAdditionalAwards,13);assert.deepEqual(await Promise.all(files.map(path=>readFile(root+'/'+path,'utf8'))),before);
});
