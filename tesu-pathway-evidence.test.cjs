const test=require('node:test'),assert=require('node:assert/strict');
const Guide=require('./dist/guide-engine.js');
const model=require('./dist/data/tesu.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const load=()=>import('./scripts/add-tesu-official-mappings.mjs');
const row=code=>model.requirements.find(requirement=>requirement.code===code);
const option=code=>row(code).options.find(option=>option.mappingReviewId==='tesu-provider-supplement-2026-11-11');
function record(candidate,extra={}){return {id:'original-source-record',provider:candidate.provider,code:candidate.code,title:candidate.title,credits:3,creditSystem:'semester',status:'earned',grade:'C',score:70,completedOn:'2026-11-11',evaluations:[],privateNote:'Keep original transcript details',...extra};}
function match(records,program=model){const before=clone(records),result=Guide.matchInventory(program,records);assert.deepEqual(records,before,'matching must preserve source records, grades, notes and saved evaluations');return result;}

test('TESU supplement is idempotent and preserves unrelated candidates and original source records',async()=>{
 const {supplementModel,run}=await load();assert.deepEqual(supplementModel(model),model);assert.deepEqual(supplementModel(supplementModel(model)),model);
 const input=clone(model),unrelated=input.requirements.find(requirement=>requirement.code==='ACC-4010').options;
 input.sources.push({id:'older-unrelated-source',url:'https://example.edu/old-review',checked:'2020-01-01'});
 const result=supplementModel(input);assert.deepEqual(result.requirements.find(requirement=>requirement.code==='ACC-4010').options,unrelated);assert.deepEqual(result.sources.at(-1),input.sources.at(-1));assert.deepEqual(input.requirements.find(requirement=>requirement.code==='ACC-4010').options,unrelated);
 assert.equal((await run({check:true})).candidateRequirementCredits,99);
});

test('two exact named Study.com options retain independent source facts and conditional provider evidence',()=>{
 const placements=model.requirements.flatMap(requirement=>requirement.options.filter(candidate=>candidate.mappingReviewId==='tesu-provider-supplement-2026-11-11').map(candidate=>({requirement,candidate})));
 assert.equal(placements.length,2);
 for(const {requirement,candidate}of placements){assert.equal(candidate.receivingCode,requirement.code);assert.equal(candidate.receivingTitle,requirement.title);assert.equal(candidate.credits,3);assert.equal(candidate.sourceCredits,3);assert.equal(candidate.sourceCreditSystem,'semester');assert.equal(candidate.creditSystem,'semester');assert.equal(candidate.upper,true);assert.equal(candidate.evidence,'conditional');assert.equal(candidate.evidenceType,'provider-published');assert.equal(candidate.minScore,undefined);assert.equal(candidate.providerCoursePassingPercent,70);assert(candidate.providerCoursePassingSourceIds.includes('tesu-study-course-passing-current'));assert(candidate.conditions.some(note=>/not an individual TESU approval/.test(note)));assert(candidate.conditions.some(note=>/directly from Study.com/.test(note)));for(const id of candidate.sourceIds)assert(model.sources.some(source=>source.id===id),id);assert.equal(candidate.codeAliasEvidence[0].alias,candidate.providerCourseCode);}
 assert.equal(option('MAN-3310').code,'SDCM-0071');assert.equal(option('MAN-3310').courseVersion,5);assert.equal(option('MAN-3310').recommendationStart,'2026-06-01');assert.equal(option('MAN-3310').recommendationEnd,'2029-05-31');
 assert.equal(option('MAN-3720').code,'SDCM-0054');assert.equal(option('MAN-3720').courseVersion,6);assert.equal(option('MAN-3720').recommendationStart,null);assert.equal(option('MAN-3720').recommendationEnd,null);assert(option('MAN-3720').conditions.some(note=>/not recovered/.test(note)));
 assert.equal(model.mappingReview.uniqueRequirementCandidateCredits,99);assert.equal(model.alternativeMaxCredits,90);assert.equal(model.institutionMinCredits,15);assert.equal(model.completeExecutablePathway,false);
});

test('named mapping matching rejects buckets, other awards and deficient source quantities',async()=>{
 const {officialOptions}=await load();const named={code:'MAN-3310',title:'Human Resources Management',credits:3};assert.equal(officialOptions(named).length,1);
 for(const extra of [{bucket:true},{allocationType:'category-choice'},{institutionalOnly:true},{credits:6},{code:'HRM-3310'},{title:'Business elective'}])assert.deepEqual(officialOptions({...named,...extra}),[]);
 for(const code of ['MAN-3310','MAN-3720']){const candidate=option(code);for(const sourceCode of [candidate.code,candidate.providerCourseCode]){const result=match([record(candidate,{code:sourceCode})]);assert.equal(result.completed.length,1);assert.equal(result.completed[0].requirementId,row(code).id);assert.equal(result.completed[0].status,'reported','a source match cannot create student confirmation');}for(const credits of [2,4])assert.equal(match([record(candidate,{credits})]).completed.length,0,'unverified source-credit quantity');assert.equal(match([record(candidate,{creditSystem:'quarter'})]).completed.length,0);assert.equal(match([record(candidate,{provider:'StraighterLine'})]).completed.length,0);}
});

test('the real Guide enforces verified ACE dates and course grades without inventing exam thresholds or Business 308 dates',()=>{
 const business306=option('MAN-3310');
 for(const [completedOn,expected]of [['2026-05-31',0],['2026-06-01',1],['2029-05-31',1],['2029-06-01',0]])assert.equal(match([record(business306,{completedOn})]).completed.length,expected,completedOn);
 const lowerFinal=match([record(business306,{grade:'C',score:69})]);assert.equal(lowerFinal.completed.length,1,'a final-exam score below 70 does not establish an insufficient overall course grade');assert.equal(lowerFinal.completed[0].status,'reported');
 const earlierConfirmed=record(business306,{completedOn:'2025-01-01',evaluations:[{programId:model.id,requirementId:'man3310',status:'confirmed',optionId:business306.id}],courseVersion:4});
 const approved=match([earlierConfirmed]);assert.equal(approved.completed.length,1,'a new current-version window must preserve an explicit university award for this program and requirement');assert.equal(approved.completed[0].status,'confirmed');assert.equal(approved.completed[0].requirementId,'man3310');
 for(const evaluation of [{...earlierConfirmed.evaluations[0],status:'reported'},{...earlierConfirmed.evaluations[0],programId:'another-program'},{...earlierConfirmed.evaluations[0],requirementId:'unknown-requirement'}])assert.equal(match([{...earlierConfirmed,evaluations:[evaluation]}]).completed.length,0,'reported or unrelated placements cannot override current projection dates');
 assert.equal(match([{...earlierConfirmed,grade:'C',score:69}]).completed[0].status,'confirmed','an approved older-version award survives a lower final-exam component score');assert.equal(match([{...earlierConfirmed,grade:'C-'}]).completed.length,0,'an exact confirmation does not bypass the course-grade minimum');
 const business308=option('MAN-3720');assert.equal(business308.recommendationStart,null);assert.equal(business308.recommendationEnd,null);assert.equal(match([record(business308,{score:70})]).completed[0].status,'reported');
 const algebra=row('MAT-1210').options.find(candidate=>candidate.id==='soph-0001');assert.equal(algebra.evidence,'conditional');assert.equal(algebra.recommendationStart,'2025-05-01');assert.equal(algebra.recommendationEnd,'2028-04-30');
 for(const [completedOn,expected]of [['2025-04-30',0],['2025-05-01',1],['2028-04-30',1],['2028-05-01',0]])assert.equal(match([record(algebra,{completedOn})]).completed.length,expected,completedOn);
 assert.equal(row('ACC-1010').options.find(candidate=>candidate.id==='soph-0010').recommendationStart,null,'an unbound version-specific Sophia window remains explicitly unknown');
});

test('matching leaves planned and saved learning uncompleted and consumes provider aliases only once',()=>{
 const candidate=option('MAN-3310');for(const status of ['saved','planned']){const source=record(candidate,{status});const result=match([source]);assert.equal(result.completed.length,0);assert.equal(result.unmatched[0].status,status);}
 const original=record(candidate),alias=record(candidate,{id:'duplicate-provider-alias',code:candidate.providerCourseCode});const result=match([original,alias]);assert.equal(result.completed.length,1);assert.equal(result.completed[0].requirementId,'man3310');assert.equal(result.completed[0].status,'reported');assert.equal(result.unmatched.length,0,'both imported copies refer to one original action');
});

test('the real Guide applies the current C minimum to composition, core and area of study only',()=>{
 for(const requirement of model.requirements){const minimum=['ENC-1010','ENC-1020'].includes(requirement.code)||['business-core','area-study'].includes(requirement.group);assert.equal(requirement.minimumGrade,minimum?'C':undefined,requirement.code);if(minimum)assert(requirement.minimumGradeSourceIds.includes('tesu-grade-policy-current'));}
 for(const code of ['ENC-1010','ACC-1010','MAN-3310']){const requirement=row(code),candidate=requirement.options.find(candidate=>candidate.provider==='University');for(const grade of ['D','C-','C']){const source=record(candidate,{provider:'University',institution:model.school,sourceProgramId:model.id,grade});assert.equal(match([source],{...model,requirements:[requirement]}).completed.length,grade==='C'?1:0,code+' '+grade);}}
 assert.equal(row('MAT-1210').minimumGrade,undefined);assert.equal(row('ACC-2010').minimumGrade,undefined,'a free elective prerequisite is not automatically in the AOS grade scope');
 const candidate=option('MAN-3310'),bad=record(candidate,{grade:'C-',evaluations:[{programId:model.id,requirementId:row('MAN-3310').id,status:'confirmed',optionId:candidate.id}]});assert.equal(match([bad]).completed.length,0,'saved school confirmation does not bypass a sourced minimum');
});

test('transcript routes, policy scope and remaining research conflicts stay explicit',()=>{
 const instructions=new Map(model.transcriptInstructions.map(item=>[item.provider,item]));assert.match(instructions.get('Sophia').instruction,/Credly.*Parchment/);assert.match(instructions.get('Study.com').instruction,/directly.*does not accept.*ACE/);assert.match(instructions.get('StraighterLine').instruction,/directly/);
 for(const instruction of instructions.values())assert(instruction.sourceIds.every(id=>model.sources.some(source=>source.id===id&&source.url==='https://www.tesu.edu/student-resources/transfer-credits/send-transcripts.php')));
 assert.equal(model.transferPolicyReview.duplicatesCountOnce,true);assert.equal(model.transferPolicyReview.alternativeMaxCredits,90);assert.deepEqual(model.transferPolicyReview.requiredInstitutionalCourses,['SOS-1100','BUS-4210']);
 assert(model.unresolved.some(note=>/Finance 101/.test(note)));assert(!row('FIN-3010').options.some(candidate=>candidate.mappingReviewId==='tesu-provider-supplement-2026-11-11'));
 for(const requirement of model.requirements)for(const candidate of requirement.options){if(candidate.provider==='Sophia'){assert.equal(candidate.evidence,'conditional');if(candidate.receivingMapStatus==='published-school-submitted'){assert.equal(candidate.mappingResearchClosed,true);assert.equal(candidate.eligibilityReview.status,'provisionally-approved-review-pending');assert.equal(candidate.eligibilityReview.providerReviewPending,true);}else assert(candidate.conditions.some(note=>/no established course equivalencies/.test(note)));}if(candidate.provider==='CLEP')assert.equal(candidate.minScore,null);}
});
