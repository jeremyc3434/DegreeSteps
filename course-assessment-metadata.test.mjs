import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCourseAssessmentReviews,buildCourseAssessmentModule,runCourseAssessmentReviews} from './scripts/course-assessment-reviews.mjs';

const clone=value=>structuredClone(value);
const packet={schemaVersion:1,sources:[
  {id:'provider-assessment-policy',url:'https://provider.example.edu/assessments/',title:'Official course assessment policy',checkedOn:'2026-11-24',quote:'Current college-credit courses use open-book assessments without monitoring.'},
  {id:'university-course-policy',url:'https://university.example.edu/courses/exam-400/',title:'Official EXAM 400 assessment requirements',checkedOn:'2026-11-24',quote:'EXAM 400 includes a remotely monitored final assessment.'}
],reviews:[
  {id:'provider-current-policy',provider:'Example Provider',scope:'provider-policy',courseCodes:['ACE-0001','ACE-0002'],status:'unmonitored',label:'No monitored exams',detail:'The provider publishes this policy for its current college-credit courses.',sourceIds:['provider-assessment-policy']},
  {id:'university-exam-400',provider:'University',scope:'course',courseCodes:['EXAM 400'],status:'monitored',label:'Monitored final exam',detail:'The exact course requires a remotely monitored final assessment.',sourceIds:['university-course-policy'],programBindings:[{modelId:'example-degree',catalogYear:'2026-2027',format:'online'}]}
]};
const runtime='/* Existing runtime comment. */\nconst reviewed=/* BEGIN_REVIEWED_ASSESSMENTS */\n{}\n/* END_REVIEWED_ASSESSMENTS */;\nfunction existingAPI(){return reviewed;}\n';

test('prospective provider policies and exact university courses remain source-bound without mutating their packet',()=>{
  const value=clone(packet),before=JSON.stringify(value);
  assert.equal(validateCourseAssessmentReviews(value),value);
  assert.equal(JSON.stringify(value),before);
  const unknown=clone(packet);unknown.reviews[0].status='unknown';unknown.reviews[0].label='Timed open-note quizzes';
  assert.doesNotThrow(()=>validateCourseAssessmentReviews(unknown),'A published assessment format can remain explicitly unknown for proctoring');
});

test('university claims cannot inherit a school-wide policy or escape their exact model, catalog and format',()=>{
  for(const change of [
    review=>delete review.programBindings,
    review=>review.programBindings=[],
    review=>review.scope='provider-policy',
    review=>review.programBindings[0].modelId='',
    review=>review.programBindings[0].catalogYear='2026-2025',
    review=>review.programBindings[0].catalogYear='202613',
    review=>review.programBindings[0].format='any',
    review=>review.programBindings.push(clone(review.programBindings[0])),
    review=>review.provider='university'
  ]){const value=clone(packet);change(value.reviews[1]);assert.throws(()=>validateCourseAssessmentReviews(value));}
  for(const catalogYear of ['2026','202605','2026–2027']){
    const value=clone(packet);value.reviews[1].programBindings[0].catalogYear=catalogYear;assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
  }
});

test('malformed, unreviewed, unsafe and unbounded evidence cannot become runtime facts',()=>{
  const changes=[
    value=>value.schemaVersion=2,
    value=>value.sources=[],
    value=>value.reviews=[],
    value=>value.sources[0].url='http://provider.example.edu/assessments/',
    value=>value.sources[0].url='https://student:secret@provider.example.edu/assessments/',
    value=>value.sources[0].checkedOn='2026-02-30',
    value=>delete value.sources[0].checkedOn,
    value=>value.sources[0].title='x'.repeat(301),
    value=>value.sources[0].quote=Array(26).fill('word').join(' '),
    value=>value.sources.push(clone(value.sources[0])),
    value=>value.reviews.push(clone(value.reviews[0])),
    value=>value.reviews[0].sourceIds=['unreviewed-source'],
    value=>value.reviews[0].sourceIds=[],
    value=>value.reviews[0].courseCodes=[],
    value=>value.reviews[0].courseCodes=['---'],
    value=>value.reviews[0].courseCodes=['ACE-0001','ace 0001'],
    value=>value.reviews[0].label='x'.repeat(121),
    value=>value.reviews[0].detail='x'.repeat(1201),
    value=>value.reviews[0].status='assumed-unproctored',
    value=>value.reviews[0].scope='all-university-courses',
    value=>value.reviews[0].programBindings=[],
    value=>value.reviews[0].sourceIds=['provider-assessment-policy','provider-assessment-policy']
  ];
  for(const change of changes){const value=clone(packet);change(value);assert.throws(()=>validateCourseAssessmentReviews(value));assert.throws(()=>buildCourseAssessmentModule(runtime,value));}
});

test('distinct excerpts and fragments from one page share a single quotation budget',()=>{
  const value=clone(packet);value.sources[0].quote=Array(15).fill('first').join(' ');
  value.sources.push({...clone(value.sources[0]),id:'second-excerpt',url:value.sources[0].url+'#exams',quote:Array(11).fill('second').join(' ')});
  assert.throws(()=>validateCourseAssessmentReviews(value));
  value.sources[2].quote=Array(10).fill('second').join(' ');assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
});

test('a reviewed paraphrase needs no quotation but still requires an explicit valid quotation field',()=>{
  const value=clone(packet);value.sources[0].quote='';assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
  value.sources.push({...clone(value.sources[0]),id:'full-excerpt',url:value.sources[0].url+'#assessment',quote:Array(25).fill('excerpt').join(' ')});
  assert.doesNotThrow(()=>validateCourseAssessmentReviews(value),'An empty quotation consumes zero words from the shared limit');
  for(const quote of [undefined,null,0,false,' ',' quote ','line\nbreak']){
    const invalid=clone(packet);invalid.sources[0].quote=quote;assert.throws(()=>validateCourseAssessmentReviews(invalid));
  }
});

test('external reviews cannot carry unsupported program bindings or exceed runtime course bounds',()=>{
  const value=clone(packet);value.reviews[0].programBindings=[{modelId:'example-degree',catalogYear:'2026',format:'online'}];
  assert.throws(()=>validateCourseAssessmentReviews(value),/Only university/);
  delete value.reviews[0].programBindings;value.reviews[0].courseCodes=Array.from({length:1001},(_,index)=>'ACE-'+index);
  assert.throws(()=>validateCourseAssessmentReviews(value));
  value.reviews[0].courseCodes.pop();assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
});

test('the same provider course cannot acquire conflicting or duplicate overlapping reviews',()=>{
  const value=clone(packet);value.reviews.push({...clone(value.reviews[0]),id:'duplicate-course-policy',provider:'example provider',courseCodes:['ace 0001'],status:'monitored'});
  assert.throws(()=>validateCourseAssessmentReviews(value));
  value.reviews[2].status='unmonitored';assert.throws(()=>validateCourseAssessmentReviews(value),'Duplicated scope is ambiguous even when the statuses agree');
  value.reviews[2].programBindings=[{modelId:'one-specific-degree',catalogYear:'2026',format:'online'}];
  assert.throws(()=>validateCourseAssessmentReviews(value),'A global provider review overlaps a narrower binding for the same course');
});

test('different exact university catalogs and formats can retain their own assessment requirements',()=>{
  const value=clone(packet),review=clone(value.reviews[1]);
  review.id='campus-assessment';review.programBindings[0].format='campus';value.reviews.push(review);
  assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
  review.programBindings[0].format='online';review.programBindings[0].catalogYear='2027-2028';assert.doesNotThrow(()=>validateCourseAssessmentReviews(value));
  review.programBindings[0].catalogYear='2026–2027';assert.throws(()=>validateCourseAssessmentReviews(value),'Catalog punctuation must not hide an overlapping binding');
});

test('generation replaces only one data block and cannot turn source strings into JavaScript',()=>{
  const value=clone(packet);value.reviews[0].detail='Published detail </script> <img src=x> plus line separator \u2028 and paragraph separator \u2029.';
  const generated=buildCourseAssessmentModule(runtime,value);
  assert(generated.startsWith('/* Existing runtime comment. */\nconst reviewed=/* BEGIN_REVIEWED_ASSESSMENTS */\n'));
  assert(generated.endsWith('\n/* END_REVIEWED_ASSESSMENTS */;\nfunction existingAPI(){return reviewed;}\n'));
  assert(!generated.includes('</script>'));assert(generated.includes('\\u003c/script>'));assert(generated.includes('\\u2028'));assert(generated.includes('\\u2029'));
  const embedded=generated.split('/* BEGIN_REVIEWED_ASSESSMENTS */')[1].split('/* END_REVIEWED_ASSESSMENTS */')[0];
  assert.deepEqual(JSON.parse(embedded),value);assert.equal(buildCourseAssessmentModule(generated,value),generated);
  for(const source of ['',runtime.replace('/* END_REVIEWED_ASSESSMENTS */',''),runtime+runtime,'/* END_REVIEWED_ASSESSMENTS */\n/* BEGIN_REVIEWED_ASSESSMENTS */'])assert.throws(()=>buildCourseAssessmentModule(source,packet));
});

test('check mode detects stale evidence without writing and invalid source packets cannot replace the runtime',async()=>{
  const base=await mkdtemp(join(tmpdir(),'degreesteps-assessment-metadata-'));
  try{
    await mkdir(join(base,'content/discovery'),{recursive:true});await mkdir(join(base,'dist'));
    const input=join(base,'content/discovery/course-assessment-reviews.json'),output=join(base,'dist/course-assessment.js');
    await writeFile(input,JSON.stringify(packet));await writeFile(output,runtime);
    await assert.rejects(runCourseAssessmentReviews({base,check:true}),/stale/);assert.equal(await readFile(output,'utf8'),runtime);
    assert.deepEqual(await runCourseAssessmentReviews({base}),{sources:2,reviews:2,courseBindings:3});
    const generated=await readFile(output,'utf8');assert.equal(generated,buildCourseAssessmentModule(runtime,packet));
    await assert.doesNotReject(runCourseAssessmentReviews({base,check:true}));
    const invalid=clone(packet);invalid.reviews[0].sourceIds=['missing'];await writeFile(input,JSON.stringify(invalid));
    await assert.rejects(runCourseAssessmentReviews({base}));assert.equal(await readFile(output,'utf8'),generated);
  }finally{await rm(base,{recursive:true,force:true});}
});
