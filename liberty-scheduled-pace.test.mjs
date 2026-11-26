import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

test('scheduled-course discovery evidence stays bound to the exact reviewed Liberty degree editions',async()=>{
 assert.equal(review.schemaVersion,1);
 const ids=review.reviews.flatMap(record=>record.modelIds);
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),expected);
 const published=new Set(publication.plans.map(plan=>plan.modelId));
 for(const record of review.reviews){
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
 for(const record of review.reviews)for(const source of [record.source,...record.supportingSources]){
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
 assert.match(review.reviews[0].source.quote,/deadlines specified by the professor/);
 assert(review.reviews[0].supportingSources.some(source=>/assignments due weekly/.test(source.quote)));
 assert.match(review.reviews[1].source.quote,/structured face-to-face lectures.*semester-by-semester/);
});

test('a scheduled course review does not assert unrelated CBE, assessment, or attendance traits',()=>{
 for(const record of review.reviews){
  for(const field of ['competencyBased','noProctor','fullyAsynchronous','noLiveSessions','selfPaced','billing','tuition'])assert.equal(record[field],undefined);
  assert(record.notes.some(note=>/No competency-based status/.test(note)));
 }
});
