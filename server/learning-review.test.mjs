import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLearningReview} from './learning-review.mjs';

const words=count=>Array.from({length:count},()=> 'word').join(' ');
const draft=(content,extra={})=>({action:'draft',content,checks:[],sources:[],...extra});
const review=input=>buildLearningReview({artifact:draft('A short answer.'),project:{},...input});
const kind=(result,name)=>result.flags.filter(flag=>flag.kind===name);

test('word requirements preserve comma-formatted single targets and ranges',()=>{
  for(const prompt of['Write a 1,500-word paper.','Write at least 1,500 words.']){
    const result=review({artifact:draft(words(350)),project:{prompt}});assert.equal(result.wordCount,350);assert.equal(result.expectedWordCount.min,1500);assert.equal(kind(result,'word-count').length,1);assert.match(kind(result,'word-count')[0].message,/350.*1,500/);assert.match(kind(result,'word-count')[0].nextAction,/1,150/);
  }
  for(const prompt of['Write between 1,200 and 1,500 words.','Write a 1,200–1,500-word response.','Write 1200 to 1500 words.']){
    const result=review({artifact:draft(words(1300)),project:{prompt}});assert.deepEqual(result.expectedWordCount,{min:1200,max:1500,source:'prompt'});assert.equal(kind(result,'word-count').length,0);
  }
});

test('rubric wins over prompt and input reading lengths are not output requirements',()=>{
  const result=review({artifact:draft(words(550)),project:{rubric:'Response length: at least 500 words.',prompt:'Read a 2,000-word article, then write a 1,000-word response.'}});
  assert.equal(result.expectedWordCount.min,500);assert.equal(result.expectedWordCount.source,'rubric');assert.equal(kind(result,'word-count').length,0);
  const reading=review({artifact:draft(words(320)),project:{prompt:'Read a 2,000-word article, then write a 300-word response.'}});assert.equal(reading.expectedWordCount.min,300);assert.equal(kind(reading,'word-count').length,0);
});

test('only prompt and rubric define word requirements; pages and private notes do not',()=>{
  const result=review({artifact:draft('The answer is 8.'),project:{prompt:'Solve this equation.',studentNotes:'I read a 2,000-word study guide.'},course:{syllabus:'All papers have 1,000 words.'}});
  assert.equal(result.status,'ready-for-student-review');assert.equal(result.expectedWordCount,undefined);assert.deepEqual(result.flags,[]);
  assert.equal(review({project:{prompt:'Write a five-page paper.'}}).expectedWordCount,undefined);
  assert.equal(review({project:{prompt:'Write a 5-page paper.'}}).expectedWordCount,undefined);
});

test('reference-list text and internal citation labels do not inflate draft length',()=>{
  const content=words(80)+' [S1]\n\n## References\n'+words(1000);
  const result=review({artifact:draft(content,{sources:[{id:'S1'}]}),project:{rubric:'Write at least 100 words.'}});
  assert.equal(result.wordCount,80);assert.equal(kind(result,'word-count').length,1);
});

test('upper limits do not become minimums and actual upper-bound breaches are actionable',()=>{
  const short=review({artifact:draft(words(200)),project:{prompt:'Write up to 500 words.'}});assert.equal(short.expectedWordCount.min,0);assert.equal(short.expectedWordCount.max,500);assert.equal(kind(short,'word-count').length,0);
  const long=review({artifact:draft(words(600)),project:{prompt:'Write no more than 500 words.'}});assert.match(kind(long,'word-count')[0].message,/600.*500-word upper/);
});

test('outlines and review reports are not mistaken for an underlength paper',()=>{
  const project={prompt:'Write at least 1,500 words.'};
  assert.equal(kind(review({artifact:{action:'plan',content:words(80)},project}),'word-count').length,0);
  const report={action:'review',content:words(50),checks:[]},paper=draft(words(1600));
  assert.equal(review({artifact:report,project,reviewedArtifact:paper}).wordCount,1600);
  assert.equal(kind(review({artifact:report,project,reviewedArtifact:paper}),'word-count').length,0);
  assert.equal(review({artifact:report,project:{...project,artifact:paper}}).wordCount,1600);
  assert.equal(review({artifact:report,project:{...project,artifact:report}}).wordCount,undefined);
});

test('personal insight needs an explicit requirement and blank notes',()=>{
  const project={prompt:'Discuss your own leadership experience and relate it to the course.',studentNotes:''};
  const result=review({project});assert.equal(kind(result,'personal-experience').length,1);assert.equal(kind(result,'personal-experience')[0].target,'notes');assert.equal(kind(result,'personal-experience')[0].severity,'input');
  assert.equal(kind(review({project:{...project,studentNotes:'I managed the ordering process at work.'}}),'personal-experience').length,0);
  for(const prompt of['Analyze a fictional manager.','You may use your own experience.','Do not include your personal experience.'])assert.equal(kind(review({project:{prompt,studentNotes:''}}),'personal-experience').length,0,prompt);
});

test('unknown citation labels and unmatched source links are concrete blocking flags',()=>{
  const result=review({artifact:draft('This claim uses [S9].',{sources:[{id:'S1'}],sourceChecks:{unknownSourceURLs:['https://unlisted.edu/paper']}})});
  assert.equal(kind(result,'unknown-citation')[0].severity,'blocking');assert.deepEqual(kind(result,'unknown-citation')[0].sourceIds,['S9']);assert.equal(kind(result,'unknown-source-link')[0].target,'sources');
  assert.equal(result.status,'needs-review');assert(!JSON.stringify(result).includes('https://unlisted.edu/paper'));
});

test('only used sources with concrete verification gaps receive an evidence flag',()=>{
  const artifact=draft('A claim [S1].',{sources:[{id:'S1',verificationStatus:'unverified'},{id:'S2',verificationStatus:'unverified'}]});
  const result=review({artifact});assert.equal(kind(result,'source-evidence').length,1);assert.deepEqual(kind(result,'source-evidence')[0].sourceIds,['S1']);
  assert.equal(kind(review({artifact,verifiedResourceIds:['S1']}),'source-evidence').length,0);
  const supplied=draft('Discuss the assigned reading [S1].',{sources:[{id:'S1',excerpt:'An actual provided course passage.'}],sourceChecks:{claimSupportVerified:false,checkedSources:[{id:'S1',status:'provided',evidenceOrigin:'provided-excerpt',cited:true}]}});
  assert.equal(kind(review({artifact:supplied}),'source-evidence').length,0,'unknown provenance is not automatically a specific verification failure');
});

test('format conflicts ignore overridden lower-priority preferences and preserve quotation text',()=>{
  const conflict={style:'conflict',needsClarification:true,conflicts:[{source:'rubric',overridden:false,requested:[{style:'apa'},{style:'mla'}]}]};
  const result=review({format:conflict});assert.match(kind(result,'format-conflict')[0].message,/APA and MLA/);assert.equal(kind(result,'format-conflict')[0].target,'format');
  assert.equal(kind(review({format:{...conflict,needsClarification:false,conflicts:[{overridden:true,requested:[{style:'mla'}]}]}}),'format-conflict').length,0);
  const quoted=review({artifact:draft('The teacher wrote “[Author] and [Year] are placeholders.”\n```text\n[Author]\n```'),format:{style:'apa'}});assert.equal(kind(quoted,'citation-placeholder').length,0);
  const actual=review({artifact:draft('Research (Author, Year) supports this claim.'),format:{style:'apa'}});assert.equal(kind(actual,'citation-placeholder').length,1);
});

test('known metadata issues are specific; absent optional source fields alone are not a warning',()=>{
  const artifact=draft('A supported point [S1].',{sources:[{id:'S1',url:'https://www.cdc.gov/page',title:'A real source'}]});
  const none=review({artifact,format:{style:'apa'}});assert.equal(kind(none,'citation-metadata').length,0);assert.equal(kind(none,'citation-format').length,1);
  const known=review({artifact,format:{style:'apa',bibliography:{missingFields:[{sourceId:'S1',fields:['author','publicationdate']},{sourceId:'S8',fields:['author']}]}}});assert.equal(kind(known,'citation-metadata').length,1);assert.deepEqual(kind(known,'citation-metadata')[0].sourceIds,['S1']);assert.match(kind(known,'citation-metadata')[0].message,/publication date/);
});

test('literal matching passages ask for attribution without claiming plagiarism',()=>{
  const result=review({artifact:draft('Some text.',{sourceChecks:{overlaps:[{sourceId:'S1',needsAttribution:true,needsQuotation:false,needsCitation:true}]}})});
  assert.equal(kind(result,'matching-passage').length,1);assert.match(kind(result,'matching-passage')[0].message,/nearby citation/);assert.doesNotMatch(kind(result,'matching-passage')[0].message,/plagiar/i);
});

test('specific human-judgment notes remain bounded while generic process boilerplate disappears',()=>{
  const artifact=draft('A draft.',{checks:[
    {label:'Source coverage',status:'review',detail:'Compared supplied sources; this is not a comprehensive plagiarism check.'},
    {label:'Accuracy',status:'review',detail:'Verify all information before submitting.'},
    {label:'Argument',status:'missing',detail:'Paragraph two recommends just-in-time inventory without explaining the stated supplier delays.'},
    ...Array.from({length:20},(_,i)=>({label:'Specific point '+i,status:'review',detail:'Section '+i+' omits the stated comparison of supplier reliability and holding costs. '+words(200)}))
  ]});
  const result=review({artifact});assert.equal(result.flags.length,8);assert(result.flags.every(flag=>flag.message.length<=260&&flag.nextAction.length<=180));assert(result.flags.some(flag=>flag.message.includes('supplier delays')));assert(!result.flags.some(flag=>/comprehensive|Verify all/.test(flag.message)));assert.deepEqual(result,review({artifact}));
});

test('optional new practice attempts do not make a correct current answer need review',()=>{
  const result=review({artifact:{action:'study',content:'x = 5. Both original equation sides equal 41.',sources:[],checks:[
    {label:'Student attempt at practice problem',status:'missing',detail:'The student has not yet submitted an answer to the new practice problem.'},
    {label:'Optional exercise',status:'missing',detail:'An optional practice exercise is available after this solved example.'},
    {label:'Source coverage',status:'review',detail:'This self-contained arithmetic problem does not require external research.'}
  ]},project:{kind:'study',prompt:'Solve the equation and check it.'}});
  assert.deepEqual(result.flags,[]);assert.equal(result.status,'ready-for-student-review');
});

test('known failed requested readings receive a concrete acquisition action without warning on unused discoveries',()=>{
  const url='https://www.cdc.gov/requested-reading';
  const sourceChecks={research:{performed:true,retrievedSources:0,returnedSources:0,excludedSources:[{id:'S1',url,title:'Requested reading',reason:'No fetched text.'},{id:'S2',url:'https://www.cdc.gov/unused-discovery',title:'An unused discovery',reason:'Not fetched.'}]}};
  const result=review({artifact:draft('A working outline.',{sourceChecks}),project:{kind:'writing',prompt:'Use two research sources.',sources:[{id:'S1',url}]}});
  assert.equal(kind(result,'requested-source-unreadable').length,1);assert.match(kind(result,'requested-source-unreadable')[0].message,/Requested reading/);assert.match(kind(result,'requested-source-unreadable')[0].nextAction,/Retry research/);assert.equal(kind(result,'requested-source-unreadable')[0].target,'sources');assert.equal(kind(result,'research-evidence').length,0,'specific requested-source action avoids a duplicate generic zero-source warning');assert(!JSON.stringify(result).includes('unused-discovery'));
});

test('zero verified research passages flags evidence-based writing but not arithmetic or personal reflection',()=>{
  const artifact=draft('A working answer.',{sourceChecks:{research:{performed:true,retrievedSources:0,returnedSources:3}}});
  assert.equal(kind(review({artifact,project:{kind:'writing',prompt:'Write a report using scholarly sources.'}}),'research-evidence').length,1);
  assert.equal(kind(review({artifact:{...artifact,action:'study'},project:{kind:'study',prompt:'Calculate 12 divided by 3.'}}),'research-evidence').length,0);
  assert.equal(kind(review({artifact,project:{kind:'writing',prompt:'Describe the sequence of a fictional morning.'}}),'research-evidence').length,0);
});

test('fresh review retrieval failures are shown while length still comes from the actual paper',()=>{
  const url='https://www.cdc.gov/reading',paper=draft(words(1600),{sources:[{id:'S1',url}],sourceChecks:{research:{performed:true,retrievedSources:1,excludedSources:[]}}});
  const artifact={action:'review',content:'Review notes.',checks:[],sourceChecks:{research:{performed:true,retrievedSources:0,excludedSources:[{id:'S1',url,title:'Requested reading',requested:true}]}}};
  const result=review({artifact,reviewedArtifact:paper,project:{kind:'writing',rubric:'Write at least 1,500 words using scholarly sources.',sources:[{id:'S1',url}]}});
  assert.equal(result.wordCount,1600);assert.equal(kind(result,'word-count').length,0);assert.equal(kind(result,'requested-source-unreadable').length,1);assert.match(kind(result,'requested-source-unreadable')[0].nextAction,/accessible public reading/);assert.doesNotMatch(kind(result,'requested-source-unreadable')[0].nextAction,/provide.*passage/i);
});

test('required conceptual research with zero retrieved passages blocks every researched study kind',()=>{
  for(const kindName of['study','quiz','flashcards']){
    const artifact={action:kindName,content:'A conceptual answer.',sources:[],checks:[],sourceChecks:{research:{required:true,performed:true,retrievedSources:0}}};
    const result=review({artifact,project:{kind:kindName,prompt:'Explain why supplier lead-time variation affects safety stock.'}});
    assert.equal(kind(result,'research-evidence').length,1,kindName);assert.equal(kind(result,'research-evidence')[0].severity,'blocking');assert.equal(kind(result,'research-evidence')[0].target,'sources');
  }
  const arithmetic=review({artifact:{action:'study',content:'12 / 3 = 4.',sources:[],checks:[],sourceChecks:{research:{required:false,performed:false,retrievedSources:0}}},project:{kind:'study',prompt:'Calculate 12 divided by 3.'}});
  assert.deepEqual(arithmetic.flags,[]);
});

test('an unreadable required source is a blocking acquisition issue when no usable passages exist',()=>{
  const result=review({artifact:{action:'study',content:'A working answer.',checks:[],sources:[],sourceChecks:{research:{required:true,performed:true,retrievedSources:0,excludedSources:[{title:'Requested source',url:'https://www.cdc.gov/unavailable',requested:true}]}}},project:{kind:'study',prompt:'Explain the supplied public reading.'}});
  assert.equal(kind(result,'requested-source-unreadable').length,1);assert.equal(kind(result,'requested-source-unreadable')[0].severity,'blocking');assert.equal(kind(result,'research-evidence').length,0,'one specific action rather than duplicate warnings');
});

test('approximate word targets tolerate five percent while hard limits remain strict',()=>{
  const project={prompt:'Write about 2,500 words.'};
  assert.equal(kind(review({artifact:draft(words(2490)),project}),'word-count').length,0);
  assert.equal(kind(review({artifact:draft(words(2375)),project}),'word-count').length,0);
  assert.equal(kind(review({artifact:draft(words(2374)),project}),'word-count').length,1);
  assert.equal(kind(review({artifact:draft(words(1162)),project}),'word-count').length,1);
  for(const prompt of['Write at least 2,500 words.','Write exactly 2,500 words.','Write 2,500–2,700 words.'])assert.equal(kind(review({artifact:draft(words(2490)),project:{prompt}}),'word-count').length,1,prompt);
});
