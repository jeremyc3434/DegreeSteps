import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recommendationWindowStatus,renderProviderResearchFacts} from './provider-research-facts.mjs';
const catalog=JSON.parse(await readFile(new URL('../dist/data/credit-sources.json',import.meta.url),'utf8'));
const google=catalog.sources.find(s=>s.id==='google-certificates');
test('a recommendation end date cannot revoke a historical completion or upgrade its source quantity',()=>{
 const record=google.recommendationReview.records[0],before=JSON.stringify(record);
 assert.deepEqual(recommendationWindowStatus(record,{asOf:'2026-12-01',completedOn:'2026-11-30'}),{status:'completed-in-reviewed-window',studentRecordsChanged:false});
 assert.equal(recommendationWindowStatus(record,{asOf:'2026-12-01',completedOn:'2025-11-30'}).status,'match-historical-version');
 assert.equal(recommendationWindowStatus(record,{asOf:'2026-12-01',plannedCompletionOn:'2026-12-01'}).status,'future-window-not-verified');
 assert.equal(recommendationWindowStatus(record,{asOf:'2026-11-27',plannedCompletionOn:'2026-11-30'}).status,'planned-in-reviewed-window');
 assert.equal(recommendationWindowStatus(record,{asOf:'2026-12-01'}).status,'renewal-not-verified');
 assert.equal(JSON.stringify(record),before);
});
test('public provider details preserve exact source versions, dates and receiving-award separation',()=>{
 const html=renderProviderResearchFacts(google);
 assert.match(html,/GOOG-0009/);assert.match(html,/GOOG-0007/);assert.match(html,/GOOG-0008/);
 assert.match(html,/2025-12-01 to 2026-11-30/);assert.match(html,/10 semester credits/);assert.match(html,/7 semester credits/);
 assert.match(html,/not the credits a particular college awards/);assert.match(html,/remain intact/);assert.match(html,/renewed/);
 assert.equal(renderProviderResearchFacts({id:'another-provider'}),'');
});
test('malformed periods and executable source URLs cannot enter public research details',()=>{
 const record=google.recommendationReview.records[0];
 assert.throws(()=>recommendationWindowStatus(record,{asOf:'2026-02-30'}));
 assert.throws(()=>recommendationWindowStatus({...record,recommendationStart:'2027-01-01'},{asOf:'2026-11-27'}));
 const changed=structuredClone(google);changed.recommendationReview.records[0].url='javascript:alert(1)';assert.throws(()=>renderProviderResearchFacts(changed));
 const escaped=structuredClone(google);escaped.recommendationReview.records[0].title='<img src=x onerror=alert(1)>';assert.doesNotMatch(renderProviderResearchFacts(escaped),/<img/);
});
test('WGU offers and ASU timing are informational and do not create receiving-course mappings',()=>{
 const wgu=catalog.sources.find(s=>s.id==='wgu-single-courses'),asu=catalog.sources.find(s=>s.id==='asu-ulc');
 assert(wgu);assert.equal(wgu.mappingStatus,'catalog-only');assert.match(wgu.priceNote,/\$750/);assert.match(wgu.priceNote,/\$99/);assert.match(wgu.priceNote,/\$199/);
 assert.match(wgu.assessmentNote,/proctored/);assert.match(wgu.creditBasis,/official WGU transcript/i);assert.match(wgu.creditBasis,/not established/);
 assert.match(asu.pace,/six weeks/);assert.match(asu.pace,/four weeks/);assert.match(asu.pace,/two weeks/);
 for(const entry of [wgu,google,asu])assert.equal(entry.checkedOn,'2026-11-27');
 assert.equal(catalog.checkedOn,'2026-11-01','Unreviewed provider dates must not be advanced as a batch');
});
