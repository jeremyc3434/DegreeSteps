import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Catalog from './dist/program-catalog.js';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const review=await read('./content/discovery/program-fit-reviews.json');
const registry=await read('./dist/data/curriculum-registry.json');
const publication=await read('./dist/data/publication-index.json');
const expected=[
 'curriculum-liberty-healthcare-administration-bs-online',
 'curriculum-liberty-history-bs-online',
 'curriculum-liberty-human-services-bs-online',
 'curriculum-liberty-interdisciplinary-aa-online',
 'curriculum-liberty-psychology-addictions-online',
 'curriculum-liberty-psychology-bs-online',
 'curriculum-liberty-psychology-bs-residential',
 'liberty-business-residential',
 'liberty-criminal-justice-online',
 'liberty-criminal-justice-residential'
].sort();
const libertyReviews=review.reviews.filter(record=>record.id.startsWith('liberty-'));
const tesuExpected=['curriculum-tesu-ba-english','curriculum-tesu-ba-liberal-studies','curriculum-tesu-ba-psychology','curriculum-tesu-bsba-accounting','curriculum-tesu-bsba-finance'].sort();

test('scheduled-course discovery evidence stays bound to the exact reviewed Liberty degree editions',async()=>{
 assert.equal(review.schemaVersion,1);
 const allIds=review.reviews.flatMap(record=>record.modelIds),ids=libertyReviews.flatMap(record=>record.modelIds);
 assert.equal(new Set(allIds).size,allIds.length);
 assert.deepEqual([...ids].sort(),expected);
 const published=new Set(publication.plans.map(plan=>plan.modelId));
 for(const record of libertyReviews){
  assert.equal(record.catalogYear,'2026-2027');
  assert.equal(record.paceModel,'course-term');
  assert.deepEqual(record.programBindings.map(binding=>binding.modelId),record.modelIds);
  for(const binding of record.programBindings){
   assert(published.has(binding.modelId),binding.modelId+' remains an existing published plan');
   const entry=registry.models.find(entry=>entry.id===binding.modelId);
   const payload=await read('./dist/'+entry.path);
   const model=(payload.models||[payload]).find(model=>model.id===binding.modelId);
   assert.equal(model.school,'Liberty University');
   assert.equal(Catalog.publicationLevel(model.level||entry.level),binding.modelId==='curriculum-liberty-interdisciplinary-aa-online'?'associate':'bachelor');
   assert.equal(String(model.catalogYear||model.catalog).replace(/[–—]/g,'-'),record.catalogYear);
   assert.equal(model.format,record.modality==='online'?'Online':'Residential');
   assert(model.sources.some(source=>source.url===binding.degreeUrl),binding.modelId+' has its actual receiving-school degree source');
  }
 }
});

test('pace review citations are primary, dated, brief, and do not invent raw capture hashes',()=>{
 const quotesByURL=new Map();
 for(const record of libertyReviews)for(const source of [record.source,...record.supportingSources]){
  const url=new URL(source.url);
  assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert(['www.liberty.edu','catalog.liberty.edu'].includes(url.hostname));
  assert(source.id&&source.title&&source.quote);
  assert.equal(source.checkedOn,'2026-11-24');
  assert.match(source.reviewMethod,/Official.*opened/i);
  assert.equal(source.sha256,undefined);assert.equal(source.capture,undefined);
  quotesByURL.set(source.url,(quotesByURL.get(source.url)||0)+source.quote.trim().split(/\s+/).length);
 }
 assert([...quotesByURL.values()].every(words=>words<=25));
 assert.match(libertyReviews[0].source.quote,/deadlines specified by the professor/);
 assert(libertyReviews[0].supportingSources.some(source=>/assignments due weekly/.test(source.quote)));
 assert.match(libertyReviews[1].source.quote,/structured face-to-face lectures.*semester-by-semester/);
});

test('TESU standard scheduled coursework has its own exact program bindings and retained university evidence',async()=>{
 const records=review.reviews.filter(record=>record.id.startsWith('tesu-'));
 assert.equal(records.length,1);
 const record=records[0];assert.deepEqual([...record.modelIds].sort(),tesuExpected);
 assert.equal(record.paceModel,'course-term');assert.equal(record.modality,'online');assert.equal(record.baselineFormat,'standard-online-coursework');
 assert.deepEqual(record.programBindings.map(binding=>binding.modelId),record.modelIds);
 const published=new Set(publication.plans.map(plan=>plan.modelId));
 for(const binding of record.programBindings){
  assert(published.has(binding.modelId),binding.modelId+' remains a published scheduled plan');
  const entry=registry.models.find(entry=>entry.id===binding.modelId);assert(entry);
  const payload=await read('./dist/'+entry.path),model=(payload.models||[payload]).find(model=>model.id===binding.modelId);
  assert.equal(model.school,'Thomas Edison State University');assert.equal(model.level,'bachelor');assert.equal(model.format,'Online');
  assert.equal(model.catalog,record.catalogYear);assert(model.sources.some(source=>source.url===binding.degreeUrl));
 }
 for(const source of [record.source,...record.supportingSources]){
  assert(['tesu.smartcatalogiq.com','www.tesu.edu'].includes(new URL(source.url).hostname));
  assert.equal(source.kind,'university');assert.equal(source.checkedOn,'2026-11-26');assert(source.capture&&source.sha256);
  const body=await readFile(new URL(source.capture,import.meta.url),'utf8'),sidecar=await read(source.capture.replace(/\.txt$/,'.json'));
  assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(sidecar.sha256,source.sha256);assert.equal(sidecar.status,200);
  assert.equal(new URL(sidecar.url).hostname,new URL(source.url).hostname);
  assert(body.replace(/\s+/g,' ').includes(source.quote.replace(/\s+/g,' ')));
 }
 assert(record.notes.some(note=>/accelerated sections are separate/.test(note)));
 assert(record.notes.some(note=>/week-by-week assignment schedule/.test(note)));
});

test('a scheduled course review does not assert unrelated CBE, assessment, or attendance traits',()=>{
 for(const record of review.reviews){
  for(const field of ['competencyBased','noProctor','fullyAsynchronous','noLiveSessions','selfPaced','billing','tuition'])assert.equal(record[field],undefined);
  if(libertyReviews.includes(record))assert(record.notes.some(note=>/No competency-based status/.test(note)));
 }
});
