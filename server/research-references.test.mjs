import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResearchReferences,findResearchReference,checkResearchReference,canonicalResearchReferenceURL } from './research-references.mjs';
const now=Date.parse('2026-11-17T12:00:00Z'),clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){return{version:1,packets:[{id:'sample-psychology',schoolName:'Example University',programName:'Bachelor of Science in Psychology',level:'bachelor',modality:'online',catalogYear:'2026-2027',checkedOn:'2026-11-17',degreeUrls:['https://www.example.edu/degrees/psychology/'],sources:[{id:'degree',url:'https://www.example.edu/degrees/psychology/',title:'Official online Psychology requirements',kind:'university',checkedOn:'2026-11-17'},{id:'transfer',url:'https://catalog.example.edu/transfer/',title:'University transfer policies',kind:'university',checkedOn:'2026-11-17'}],facts:[{id:'degree-total',field:'totalCredits',value:120,creditSystem:'semester',sourceIds:['degree']},{id:'university-minimum',field:'institutionMinCredits',value:30,creditSystem:'semester',sourceIds:['transfer']},{id:'overall-transfer',field:'externalMaxCredits',value:90,creditSystem:'semester',sourceIds:['transfer']}],studentCautions:[{text:'An overall transfer limit does not establish an ACE allowance.',sourceIds:['transfer']}],ambiguities:[]}]};}
function artifact(){return{schoolName:'Example University',programName:'Psychology (B.S.)',level:'bachelor',modality:'online',catalogYear:'2026–2027',creditSystem:'semester',totalCredits:120,institutionMinCredits:30,externalMaxCredits:90,alternativeMaxCredits:null};}
test('the reference corpus validates exact source-backed facts without inventing an alternative cap',()=>{
 const data=validateResearchReferences(fixture(),{now});assert.deepEqual(data,fixture());const reference=findResearchReference(data,'https://www.example.edu/degrees/psychology/',{now});assert.equal(reference.packets.length,1);assert.equal(reference.facts.length,3);assert.equal(reference.checks.length,3);assert(!reference.facts.some(fact=>fact.field==='alternativeMaxCredits'));assert.match(reference.hints,/not an approved or complete/);assert.match(reference.hints,/not represent.*newly fetched/);assert.deepEqual(checkResearchReference(artifact(),reference),[]);assert.deepEqual(checkResearchReference(artifact(),reference,{choiceId:null}),[]);
});
test('tracking parameters can reuse a reference while meaningful catalog queries and anchors retain identity',()=>{
 const data=fixture();assert(findResearchReference(data,'https://www.example.edu/degrees/psychology?utm_source=student&ref=friend',{now}));assert.equal(findResearchReference(data,'https://www.example.edu/degrees/psychology/?catalog=2025',{now}),null);assert.equal(findResearchReference(data,'https://www.example.edu/degrees/psychology/#tempo',{now}),null);assert.equal(findResearchReference(data,'https://www.example.edu/degrees/biology/',{now}),null);
 assert.equal(canonicalResearchReferenceURL('https://www.example.edu/catalog.pdf#page=20'),'https://www.example.edu/catalog.pdf#page=20');
 assert.equal(canonicalResearchReferenceURL('https://www.example.edu/degree?poid=42&catoid=9&utm_campaign=x'),'https://www.example.edu/degree?catoid=9&poid=42');
});
test('unsafe URLs and credential-bearing query strings cannot select a reference',()=>{
 for(const url of ['http://example.edu/degree','https://name:secret@example.edu/degree','https://127.0.0.1/degree','https://[::1]/degree','https://school.internal/degree','https://school.edu:8443/degree','https://example.edu/degree?api_key=private'])assert.equal(canonicalResearchReferenceURL(url),null,url);
});
test('public packets reject personal query values before canonicalization can hide them',()=>{
 for(const name of ['email','student_id','lead_id','prospect_id','user_id','contact_id','EMAIL','email[]']){
  for(const target of ['degree','source']){
   const data=fixture(),value='https://www.example.edu/degrees/psychology/?'+new URLSearchParams({[name]:'private-value'});
   if(target==='degree')data.packets[0].degreeUrls=[value];else data.packets[0].sources[0].url=value;
   assert.throws(()=>validateResearchReferences(data,{now}),/cannot include personal query parameters/,target+': '+name);
   assert.equal(findResearchReference(data,'https://www.example.edu/degrees/psychology/',{now}),null,'Invalid public data must never enter returned hints');
  }
 }
 const clean=fixture();clean.packets[0].degreeUrls[0]+='?utm_source=reference';assert.doesNotThrow(()=>validateResearchReferences(clean,{now}));assert(findResearchReference(clean,'https://www.example.edu/degrees/psychology/?email=student%40example.com&utm_source=browser',{now}),'Incoming lookup tracking may be stripped without storing its personal value');
});
test('stale or future packets are excluded and callers cannot increase the 45-day freshness bound',()=>{
 const data=fixture();assert(findResearchReference(data,data.packets[0].degreeUrls[0],{now:Date.parse('2026-12-31T00:00:00Z')}));assert.equal(findResearchReference(data,data.packets[0].degreeUrls[0],{now:Date.parse('2027-01-02T00:00:00Z')}),null);assert.equal(findResearchReference(data,data.packets[0].degreeUrls[0],{now:Date.parse('2027-01-02T00:00:00Z'),maxAgeDays:1000}),null);assert.equal(findResearchReference(data,data.packets[0].degreeUrls[0],{now:Date.parse('2026-11-01T00:00:00Z')}),null);
});
test('a newly dated packet cannot make an ancient supporting source current',()=>{
 const data=fixture();data.packets[0].sources[0].checkedOn='2026-09-01';assert.throws(()=>validateResearchReferences(data,{now}),/source checked dates must be valid, current/);assert.equal(findResearchReference(data,data.packets[0].degreeUrls[0],{now}),null);
});
test('source evidence aging out after packet review excludes both hints and numeric checks',()=>{
 const data=fixture();data.packets[0].checkedOn='2026-11-10';data.packets[0].sources[0].checkedOn='2026-10-01';data.packets[0].sources[1].checkedOn='2026-11-10';assert.doesNotThrow(()=>validateResearchReferences(data,{now}));const lookup=findResearchReference(data,data.packets[0].degreeUrls[0],{now});assert.equal(lookup,null,'A 47-day-old source cannot reach either hints or numeric checks through a seven-day-old packet');
});
test('unit-known numeric contradictions identify the exact university fact needing repair',()=>{
 const reference=findResearchReference(fixture(),fixture().packets[0].degreeUrls[0],{now}),a=artifact();a.totalCredits=123;a.externalMaxCredits=120;const errors=checkResearchReference(a,reference);assert.equal(errors.length,2);assert(errors.some(error=>error.includes('totalCredits = 120')));assert(errors.some(error=>error.includes('externalMaxCredits = 90')));assert(!errors.some(error=>error.includes('alternativeMaxCredits')));
});
test('a quarter versus semester conflict is explicit and never compares the quantities as equal units',()=>{
 const data=fixture();data.packets[0].facts=data.packets[0].facts.slice(0,1);data.packets[0].facts[0].creditSystem='quarter';data.packets[0].facts[0].value=180;const errors=checkResearchReference(artifact(),data.packets[0]);assert.equal(errors.length,1);assert.match(errors[0],/official reference uses quarter credits/);assert(!errors[0].includes('totalCredits ='));
});
test('unknown fact or artifact credit units never become numeric degree constraints',()=>{
 const data=fixture();for(const fact of data.packets[0].facts)fact.creditSystem=null;const wrong={...artifact(),totalCredits:999,externalMaxCredits:999};assert.deepEqual(checkResearchReference(wrong,data.packets[0]),[]);assert.deepEqual(checkResearchReference({...wrong,creditSystem:null},fixture().packets[0]),[]);
});
test('ambiguous learning formats and multiple packets do not silently bind one route’s rules',()=>{
 const data=fixture();data.packets[0].ambiguities=[{text:'This page offers both course-based and competency-based routes.',sourceIds:['degree']}];const reference=findResearchReference(data,data.packets[0].degreeUrls[0],{now});assert.equal(reference.facts.length,0);assert.equal(reference.ambiguities.length,1);assert.match(checkResearchReference({...artifact(),totalCredits:999},reference)[0],/Confirm the exact degree and study format/);
 const second=clone(fixture().packets[0]);second.id='sample-other-format';second.programName='B.S. Psychology — Competency Based';const multi={...fixture(),packets:[fixture().packets[0],second]};assert.equal(findResearchReference(multi,second.degreeUrls[0],{now}).facts.length,0);assert.match(checkResearchReference({...artifact(),totalCredits:999},findResearchReference(multi,second.degreeUrls[0],{now}))[0],/more than one degree pathway/);
});
function choiceFixture(){const data=fixture(),packet=data.packets[0];packet.programName='Master of Business Administration';packet.level='master';packet.facts=[];packet.ambiguities=[{text:'Choose course-based or competency-based study.',sourceIds:['degree'],affects:['learningFormat']}];packet.choices=[{id:'course-based',label:'Online courses with deadlines',programName:'Master of Business Administration (Course-Based)',learningFormat:'course-based',modality:'online',sourceIds:['degree']},{id:'tempo',label:'Self-paced Tempo Learning',programName:'Master of Business Administration (Tempo Learning)',learningFormat:'competency-based',modality:'online',sourceIds:['degree']}];return data;}
test('verified learning choices are exposed for the student and cannot be silently chosen by model output',()=>{
 const data=choiceFixture(),reference=findResearchReference(data,data.packets[0].degreeUrls[0],{now}),a={...artifact(),programName:'MBA (Tempo Learning)',level:'master',learningFormat:'competency-based',selectedChoiceId:'tempo'};
 assert.doesNotThrow(()=>validateResearchReferences(data,{now}));assert.equal(reference.choices.length,2);assert.equal(reference.choices[0].schoolName,'Example University');assert.equal(reference.choices[1].packetId,'sample-psychology');assert.match(checkResearchReference(a,reference)[0],/Choose the learning format/);assert.match(checkResearchReference(a,reference,{choiceId:'unknown'})[0],/not available/);
});
test('only trusted explicit learning selection can resolve learning-format ambiguity',()=>{
 const data=choiceFixture(),reference=findResearchReference(data,data.packets[0].degreeUrls[0],{now}),a={...artifact(),programName:'MBA (Tempo Learning)',level:'master'};
 assert.deepEqual(checkResearchReference(a,reference,{choiceId:'tempo'}),[]);assert.deepEqual(checkResearchReference({...a,programName:'MBA',learningFormat:'competency-based'},{...reference,selectedChoiceId:'tempo'}),[]);
 assert.match(checkResearchReference({...a,programName:'MBA'},reference,{choiceId:'tempo'})[0],/student’s selected/);assert.match(checkResearchReference({...a,programName:'MBA (Course-Based)',learningFormat:'competency-based'},reference,{choiceId:'tempo'})[0],/student’s selected/);assert.match(checkResearchReference({...a,learningFormat:'course-based'},reference,{choiceId:'tempo'})[0],/student’s selected/);
});
test('expired verified choices retain only a refresh guard when the Worker explicitly opts in',()=>{
 const data=choiceFixture(),url=data.packets[0].degreeUrls[0],later=now+46*86400000;
 assert.equal(findResearchReference(data,url,{now:later}),null);
 const guard=findResearchReference(data,url,{now:later,includeStaleChoiceIdentity:true});assert.deepEqual(guard,{version:1,matchedUrl:'https://www.example.edu/degrees/psychology',requiresRefresh:true,packets:[],choices:[],facts:[],checks:[],hints:''});assert.doesNotMatch(JSON.stringify(guard),/Tempo|course-based|degree-total|sourceIds|checkedOn/);assert.match(checkResearchReference({...artifact(),programName:'MBA (Tempo Learning)',level:'master'},guard,{choiceId:'tempo'})[0],/need a source refresh/);
 const fresh=findResearchReference(data,url,{now,includeStaleChoiceIdentity:true});assert.equal(fresh.requiresRefresh,undefined);assert.equal(fresh.choices.length,2);
});
test('source-age expiry also preserves the nonnumeric choice guard without exposing old sources',()=>{
 const data=choiceFixture(),packet=data.packets[0];packet.checkedOn='2026-11-10';packet.sources[0].checkedOn='2026-10-01';packet.sources[1].checkedOn='2026-11-10';assert.doesNotThrow(()=>validateResearchReferences(data,{now}));const guard=findResearchReference(data,packet.degreeUrls[0],{now,includeStaleChoiceIdentity:true});assert.equal(guard.requiresRefresh,true);assert.deepEqual(guard.packets,[]);assert.equal(guard.hints,'');assert.equal(guard.sources,undefined);
});
test('a source-verified choice can bind study mode but cannot resolve unrelated degree identity uncertainty',()=>{
 const data=choiceFixture(),packet=data.packets[0],a={...artifact(),programName:'MBA (Tempo Learning)',level:'master',learningFormat:'competency-based'};packet.modality=null;packet.ambiguities.push({text:'Choose the supported online or campus study mode.',sourceIds:['degree'],affects:['modality']});assert.deepEqual(checkResearchReference(a,packet,{choiceId:'tempo'}),[]);assert.match(checkResearchReference({...a,modality:'campus'},packet,{choiceId:'tempo'})[0],/exact study format/);packet.ambiguities.push({text:'The exact school and degree have not been identified.',sourceIds:['degree'],affects:['schoolName','programName']});assert.match(checkResearchReference(a,packet,{choiceId:'tempo'})[0],/Confirm the exact degree and study format/);
});
test('learning choices require official sources and consistent exact study modes',()=>{
 const mutations=[data=>data.packets[0].choices[0].sourceIds=['absent'],data=>data.packets[0].choices[1].id='course-based',data=>data.packets[0].choices[0].learningFormat='any',data=>data.packets[0].choices[0].modality='campus'];for(const mutate of mutations){const data=choiceFixture();mutate(data);assert.throws(()=>validateResearchReferences(data,{now}),/learning choices/);}
});
test('an unrelated course-count disagreement does not disable a known doctorate quarter-credit total',()=>{
 const data=fixture(),packet=data.packets[0];packet.programName='Doctor of Business Administration';packet.level='doctorate';packet.catalogYear=null;packet.facts=[{id:'doctorate-total',field:'totalCredits',value:90,creditSystem:'quarter',sourceIds:['degree']}];packet.ambiguities=[{text:'The university publishes conflicting ten-course and eleven-course counts.',sourceIds:['degree'],affects:['courseCount']},{text:'This degree page does not publish its catalog year or a graduate transfer limit.',sourceIds:['degree'],affects:['catalogYear','externalMaxCredits']}];
 const reference=findResearchReference(data,packet.degreeUrls[0],{now});assert.equal(reference.facts.length,1);const a={...artifact(),programName:'DBA',level:'doctorate',catalogYear:'2026-2027',creditSystem:'quarter',totalCredits:91};assert.match(checkResearchReference(a,reference)[0],/totalCredits = 90 quarter credits/);assert.match(checkResearchReference({...a,creditSystem:'semester',totalCredits:90},reference)[0],/official reference uses quarter credits/);
});
test('exact URLs can bind official award names without confusing contextual format labels or a different named track',()=>{
 const packet=fixture().packets[0];packet.programName='Doctor of Business Administration (Competency-Based)';packet.level='doctorate';packet.catalogYear=null;packet.facts=[{id:'dba-total',field:'totalCredits',value:90,creditSystem:'quarter',sourceIds:['degree']}];
 const a={...artifact(),programName:'Doctor of Business Administration (DBA)',level:'doctorate',creditSystem:'semester',totalCredits:90};assert.match(checkResearchReference(a,packet)[0],/official reference uses quarter credits/);
 packet.programName='Master of Business Administration (Tempo Learning)';packet.level='master';assert.match(checkResearchReference({...a,programName:'MBA (Course-Based)',level:'master'},packet)[0],/confirm the exact degree/);
 const residential=fixture().packets[0];residential.programName='Bachelor of Science in Criminal Justice (General, Residential)';residential.modality='campus';assert.deepEqual(checkResearchReference({...artifact(),programName:'B.S. Criminal Justice — General',modality:'campus'},residential),[]);
});
test('field-specific policy ambiguities leave independently verified degree facts enforceable',()=>{
 const data=fixture(),packet=data.packets[0];packet.ambiguities=[{text:'The transfer ceiling differs between published policy pages.',sourceIds:['degree','transfer'],affects:['externalMaxCredits']}];const reference=findResearchReference(data,packet.degreeUrls[0],{now});assert.equal(reference.checks.length,2);const issues=checkResearchReference({...artifact(),totalCredits:123,externalMaxCredits:100},reference);assert.equal(issues.length,1);assert.match(issues[0],/totalCredits = 120/);
 packet.ambiguities=[{text:'The degree page does not identify its credit unit.',sourceIds:['degree'],affects:['creditSystem']}];assert.deepEqual(checkResearchReference({...artifact(),totalCredits:999},packet),[]);
});
test('an unspecified catalog can check current public facts without overriding clearly historical or future catalogs',()=>{
 const packet=fixture().packets[0];packet.catalogYear=null;assert.equal(checkResearchReference({...artifact(),totalCredits:999},packet).length,1);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2025-2026',totalCredits:999},packet),[]);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2024',totalCredits:999},packet),[]);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2028-2029',totalCredits:999},packet),[]);
});
test('corrupt matching references fail closed at runtime while valid independent packets remain usable',()=>{
 const data=fixture();data.packets[0].facts[0].sourceIds=['missing'];assert.equal(findResearchReference(data,data.packets[0].degreeUrls[0],{now}),null);const good=fixture().packets[0];good.id='valid-copy';data.packets.push(good);assert.equal(findResearchReference(data,good.degreeUrls[0],{now}).packets[0].id,'valid-copy');
});
test('exact known identity conflicts stop numeric comparison rather than mixing programs or formats',()=>{
 for(const change of [{schoolName:'Other University'},{programName:'Bachelor of Arts in Psychology'},{programName:'Bachelor of Science in Psychology — Tempo Learning'},{level:'master'},{modality:'campus'}]){const errors=checkResearchReference({...artifact(),...change,totalCredits:999},fixture().packets[0]);assert.equal(errors.length,1);assert.match(errors[0],/confirm the exact/);assert(!errors[0].includes('totalCredits ='));}
});
test('a different or unknown catalog year is outside the fact packet scope',()=>{
 const packet=fixture().packets[0];assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2025-2026',totalCredits:999},packet),[]);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:null,totalCredits:999},packet),[]);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2026-2027',totalCredits:999},packet).length,1);
});
test('overlapping current catalog labels require confirmation and retain independent numeric checks',()=>{
 const packet=fixture().packets[0];packet.catalogYear='2025-2027';const errors=checkResearchReference({...artifact(),catalogYear:'2026-2027',totalCredits:123},packet);assert.equal(errors.length,2);assert.match(errors[0],/official reference covers catalog 2025-2027/);assert.match(errors[1],/totalCredits = 120/);assert.deepEqual(checkResearchReference({...artifact(),catalogYear:'2024-2025',totalCredits:123},packet),[]);
});
test('source-domain spoofing, forged government kinds and unresolved source IDs are rejected at build time',()=>{
 const mutations=[data=>data.packets[0].sources[0].url='https://www.sophia.org/degree/',data=>data.packets[0].sources[0].kind='government',data=>data.packets[0].facts[0].sourceIds=['absent'],data=>data.packets[0].studentCautions[0].sourceIds=[],data=>data.packets[0].degreeUrls.push('https://other.edu/psychology/')];for(const mutate of mutations){const data=fixture();mutate(data);assert.throws(()=>validateResearchReferences(data,{now}),/Research references:/);}
});
test('official military sources support conditional cautions but not university degree quantities',()=>{
 const data=fixture();data.packets[0].sources.push({id:'jst',url:'https://jst.doded.mil/',title:'Joint Services Transcript',kind:'government',checkedOn:'2026-11-17'},{id:'ccaf',url:'https://www.airuniversity.af.edu/Barnes/CCAF/',title:'Community College of the Air Force',kind:'government',checkedOn:'2026-11-17'});data.packets[0].studentCautions.push({text:'The university must evaluate your own official service transcript.',sourceIds:['jst','ccaf']});assert.doesNotThrow(()=>validateResearchReferences(data,{now}));data.packets[0].facts[0].sourceIds=['jst'];assert.throws(()=>validateResearchReferences(data,{now}),/numeric degree policies require university sources/);
});
test('duplicate or invalid facts, dates, quantities, units and route identities fail closed',()=>{
 const mutations=[data=>data.packets.push(clone(data.packets[0])),data=>data.packets[0].facts.push({...clone(data.packets[0].facts[0]),id:'another-total'}),data=>data.packets[0].facts[0].value=0,data=>data.packets[0].facts[1].value=121,data=>data.packets[0].facts[0].creditSystem='credits',data=>data.packets[0].checkedOn='2026-02-30',data=>data.packets[0].sources[0].checkedOn='2027-11-17',data=>data.packets[0].modality='any',data=>data.packets[0].catalogYear='current'];for(const mutate of mutations){const data=fixture();mutate(data);assert.throws(()=>validateResearchReferences(data,{now}),/Research references:/);}
});
test('returned references are isolated copies and never mutate the shared research bank',()=>{
 const data=fixture(),before=clone(data),reference=findResearchReference(data,data.packets[0].degreeUrls[0],{now});reference.packets[0].facts[0].value=999;reference.facts[0].value=999;reference.studentCautions[0].text='Changed';assert.deepEqual(data,before);
});
