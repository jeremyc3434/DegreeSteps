'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Assessment=require('./dist/course-assessment.js'),Library=require('./dist/course-library-engine.js');
const today='2026-11-25',copy=value=>JSON.parse(JSON.stringify(value));
const empty={version:1,policies:[],courses:[]};
function packet({status='unmonitored',provider='Sophia',code='SOPH-0015',checkedOn='2026-11-24'}={}){return {schemaVersion:1,sources:[{id:'assessment-source',url:'https://provider.example/exam-policy',title:'Official assessment policy',checkedOn}],reviews:[{id:'assessment-review',provider,scope:'provider-policy',status,label:status==='restricted'?'Secured final with screen sharing':'Open-book, unproctored',detail:'The published exam policy applies to this exact identified course.',courseCodes:[code],sourceIds:['assessment-source']}]};}
function features(data){const context={URL,Date,Map,Set,JSON,DegreeCourseAssessment:Assessment.create(data,{asOf:today}),DegreeCourseLibrary:Library};vm.runInNewContext(fs.readFileSync(require.resolve('./dist/course-attributes.js'),'utf8'),context);return context.DegreeCourseAttributes;}
const course=(value={})=>({id:'current-course',provider:'Sophia',code:'SOPH-0015',title:'Composition',credits:4,creditSystem:'quarter',...value});

test('library assessment overlay uses the same exact provider/code policy without inventing credit recommendations',()=>{
 const api=features(packet()),item=course(),before=JSON.stringify(item),facts=api.resolve(item,empty,today);
 assert.equal(facts.assessment,'no-proctor');assert.equal(facts.creditOrigin,'unknown');assert.equal(facts.pace,'unknown');assert.deepEqual(copy(facts.badges),[{label:'No proctored exams',attribute:'assessment'}]);assert.equal(facts.assessmentFact.label,'Open-book, unproctored');assert.equal(facts.evidence[0].sources[0].checkedOn,'2026-11-24');assert.equal(facts.evidence[0].checkedOn,'2026-11-24');assert(api.matches(item,empty,{assessment:'no-proctor'},today));assert.equal(JSON.stringify(item),before);
 for(const unrelated of [course({provider:'Another provider'}),course({code:'OTHER-0001'}),course({code:null,title:'SOPH-0015 Composition'})])assert.equal(api.resolve(unrelated,empty,today).assessment,'unknown');
});

test('screen restrictions form a separate filter value and never match no-proctor or monitored-exam-only filters',()=>{
 const api=features(packet({provider:'StraighterLine',code:'OOSL-0001',status:'restricted'})),item=course({provider:'StraighterLine',code:'OOSL-0001'}),facts=api.resolve(item,empty,today);
 assert.equal(facts.assessment,'restricted');assert.equal(facts.badges[0].label,'Screen sharing / browser restrictions');assert(api.matches(item,empty,{assessment:'restricted'},today));assert(!api.matches(item,empty,{assessment:'no-proctor'},today));assert(!api.matches(item,empty,{assessment:'proctored'},today));
});

test('assessment evidence obeys the shared ninety-day and future-review boundaries',()=>{
 const api=features(packet()),item=course(),checked=Date.parse('2026-11-24T00:00:00Z'),day=offset=>new Date(checked+offset*86400000).toISOString().slice(0,10);
 assert.equal(api.resolve(item,empty,day(-1)).assessment,'unknown');assert.equal(api.resolve(item,empty,day(0)).assessment,'no-proctor');assert.equal(api.resolve(item,empty,day(90)).assessment,'no-proctor');assert.equal(api.resolve(item,empty,day(91)).assessment,'unknown');assert.equal(api.resolve(item,empty,'2026-02-30').assessment,'unknown');
});

test('inactive offerings and mismatched recommendation versions cannot acquire current-offering feature labels',()=>{
 const api=features(packet()),item=course({recommendationVersion:'5'}),record={provider:'Sophia',courseIds:[item.id],code:item.code,version:'4',checkedOn:'2026-11-24',attributes:{creditOrigin:'ace',pace:'self-paced'},sources:[{url:'https://provider.example/version-four'}]};
 const mismatch=api.resolve(item,{policies:[],courses:[record]},today);assert.equal(mismatch.assessment,'unknown');assert.equal(mismatch.creditOrigin,'unknown');assert.equal(mismatch.pace,'unknown');
 const inactive=api.resolve(course({activeOffering:false}),empty,today);assert.equal(inactive.assessment,'unknown');assert.equal(inactive.badges.length,0);
});

test('only grounded aliases or exact reviewed listing IDs can establish the assessment course identity',()=>{
 const api=features(packet()),item=course({code:'ENG101',mappingCode:null,codeAliases:['SOPH-0015']}),before=JSON.stringify(item);
 assert.equal(api.resolve(item,empty,today).assessment,'unknown');assert.equal(api.resolve({...item,identitySourceIds:['official-course-binding']},empty,today).assessment,'no-proctor');
 const exact={provider:'Sophia',courseIds:[item.id],code:'SOPH-0015',checkedOn:'2026-11-24',attributes:{pace:'self-paced'},sources:[{url:'https://provider.example/exact-listing'}]};assert.equal(api.resolve(item,{policies:[],courses:[exact]},today).assessment,'no-proctor');assert.equal(JSON.stringify(item),before);
});

test('conflicting source-grounded assessment identities remain unknown and do not become a credit award',()=>{
 const data=packet();data.reviews.push({...data.reviews[0],id:'different-course',courseCodes:['SOPH-0999'],status:'monitored',label:'Monitored exam'});
 const api=features(data),facts=api.resolve(course({codeAliases:['SOPH-0999'],identitySourceIds:['published-bindings']}),empty,today);assert.equal(facts.assessment,'unknown');assert.equal(facts.creditOrigin,'unknown');assert.equal(facts.badges.length,0);
 data.reviews[1].status='unmonitored';data.reviews[1].label='A different assessment format';assert.equal(features(data).resolve(course({codeAliases:['SOPH-0999'],identitySourceIds:['published-bindings']}),empty,today).assessment,'unknown','Conflicting course descriptions stay ambiguous even if their monitoring classifications match');
});

const actualFeatures=require('./dist/course-attributes.js'),actualAttributes=require('./dist/data/course-attributes.json'),actualCatalog=require('./dist/data/course-catalog.json'),actualIndex=require('./dist/data/curriculum-course-index.json');
// Synthetic boundary cases above keep their fixture date. Real catalog rows are
// tested at the retained index's published review date, so a legitimate newer
// source review is not accidentally evaluated as evidence from the future.
const actualAsOf=actualIndex.checkedAt.slice(0,10);assert.match(actualAsOf,/^\d{4}-\d{2}-\d{2}$/);
function actualPair(id){const base=actualCatalog.courses.find(course=>course.id===id),indexed=actualIndex.courses.find(course=>course.provider===base.provider&&course.url===base.url);assert(base&&indexed);return {base,indexed};}

test('the real duplicate catalog listings retain reviewed assessment identities without changing academic source facts',()=>{
 for(const [id,assessment,label] of [['sophia-a27611acd8861d68d6','no-proctor','No monitored exams'],['straighterline-aa4562f7b3ea0d6f4e','unknown','No final exam listed']]){
  const {base,indexed}=actualPair(id),before=JSON.stringify([base,indexed]),merged=actualFeatures.mergeAssessmentIdentity(base,indexed,actualIndex.sources,actualAsOf),facts=actualFeatures.resolve(merged,actualAttributes,actualAsOf);
  assert.notEqual(merged,base);
  const reviewedDay=indexed.checkedAt.slice(0,10),precedingDay=new Date(Date.parse(reviewedDay+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  assert.equal(actualFeatures.mergeAssessmentIdentity(base,indexed,actualIndex.sources,precedingDay),base,'A current catalog refresh must still be rejected when evaluated before its actual review date');
  const {assessmentIdentity,...academicFacts}=merged;assert.deepEqual(academicFacts,base,'Only the assessment-only identity may be added');assert.equal(assessmentIdentity.code,indexed.code);assert.equal(facts.assessment,assessment);assert.equal(facts.assessmentFact?.label,label);assert(facts.evidence.find(item=>item.attribute==='assessment')?.sources.length);assert.equal(facts.creditOrigin,actualFeatures.resolve(base,actualAttributes,actualAsOf).creditOrigin,'An assessment identity does not establish ACE recommendation or a receiving award');assert.equal(JSON.stringify([base,indexed]),before);
 }
});

test('catalog identity merging requires checked exact-provider official page and code overlap, never a shared title',()=>{
 const {base,indexed}=actualPair('sophia-a27611acd8861d68d6');
 const invalid=[
  [{...base,provider:'Study.com'},indexed,actualIndex.sources],
  [base,{...indexed,url:indexed.url+'another-course/'},actualIndex.sources],
  [base,{...indexed,evidenceUrl:indexed.url+'another-course/'},actualIndex.sources],
  [{...base,url:base.url.replace('https:','http:')},indexed,actualIndex.sources],
  [{...base,url:base.url.replace('https://','https://student:password@')},indexed,actualIndex.sources],
  [{...base,url:'https://www.sophia.org.attacker.example/course/'},{...indexed,url:'https://www.sophia.org.attacker.example/course/',evidenceUrl:'https://www.sophia.org.attacker.example/course/'},actualIndex.sources],
  [base,{...indexed,url:indexed.url+'?course=different'},actualIndex.sources],
  [{...base,codeAliases:[],mappingCode:base.title},indexed,actualIndex.sources],
  [base,{...indexed,code:null},actualIndex.sources],
  [base,{...indexed,checkedAt:'2026-01-01'},actualIndex.sources],
  [base,{...indexed,checkedAt:'2027-01-01'},actualIndex.sources],
  [base,indexed,[]],
  [base,indexed,actualIndex.sources.map(source=>source.id===indexed.sourceId?{...source,checkedAt:'2026-01-01',checked:'2026-01-01'}:source)]
 ];
 for(const [candidate,entry,sources] of invalid)assert.equal(actualFeatures.mergeAssessmentIdentity(candidate,entry,sources,actualAsOf),candidate);
 const trimmed={...base,url:base.url.replace(/\/$/,'')};assert(actualFeatures.mergeAssessmentIdentity(trimmed,indexed,actualIndex.sources,actualAsOf).assessmentIdentity,'Only the irrelevant trailing slash may differ');
});

test('saving a course drops ephemeral assessment identity and preserves original personal records and units',()=>{
 const {base,indexed}=actualPair('sophia-a27611acd8861d68d6'),merged=actualFeatures.mergeAssessmentIdentity(base,indexed,actualIndex.sources,actualAsOf),initial=Library.initialize(null);initial.learning=[{id:'original-quarter-course',provider:'Former College',code:'BIO101',title:'Biology',credits:4,creditSystem:'quarter',status:'earned',evaluations:[],privateNote:'Keep this original quantity'}];initial.sheet.notes={private:'Keep this note'};const before=JSON.stringify(initial),saved=Library.saveCourse(initial,merged),record=saved.learning.find(item=>item.catalogCourseId===base.id);
 assert(record);assert.equal(Object.hasOwn(record,'assessmentIdentity'),false);assert.equal(record.credits,base.credits);assert.equal(record.creditSystem,base.creditSystem);assert.deepEqual(saved.learning[0],initial.learning[0]);assert.deepEqual(saved.sheet.notes,initial.sheet.notes);assert.equal(JSON.stringify(initial),before);
 const replay={...merged,url:'https://www.sophia.org/online-courses/a-different-course/'};assert.equal(actualFeatures.resolve(replay,actualAttributes,actualAsOf).assessment,'unknown','An assessment-only identity cannot be replayed onto a different course page');
});
