/** Reviewed APU associate baselines. No network, student records, or generic award inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isIndependentProviderIdentitySource} from './pathway-quality.mjs';

const root=resolve(import.meta.dirname,'..');
export const REVIEW_PATH='content/pathway-kits/apus/reviews/associate-baselines-2026-11-27.json';
export const REVIEW_ID='apus-associate-reviewed-baselines-2026-11-27';
const date='2026-11-27',schoolName='American Public University';
const digest=value=>createHash('sha256').update(value).digest('hex');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const normalize=value=>String(value).normalize('NFKC').replace(/[–—−]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
const sourceId=code=>'apus-apu-course-'+code.toLowerCase()+'-2026-11-27';
const providerMap={
 'SOPH-0065':['Critical Thinking','PHIL110'],
 'SOPH-0020':['Introduction to Ethics','PHIL200'],
 'SOPH-0015':['English Composition I','ENGL110'],
 'SOPH-0024':['Public Speaking','COMM200'],
 'SOPH-0022':['US History I','HIST101'],
 'SOPH-0025':['US History II','HIST102'],
 'SOPH-0016':['Environmental Science','EVSP180'],
 'SOPH-0012':['Macroeconomics','ECON102'],
 'SOPH-0001':['College Algebra','MATH110'],
 'SOPH-0010':['Financial Accounting','ACCT105'],
 'SOPH-0014':['Introduction to Business','BUSN100'],
 'SOPH-0048':['Introduction to Psychology','PSYC101'],
 'SOPH-0071':['US Government','POLS210'],
 'SOPH-0005':['Introduction to Statistics','MATH302']
};
const choices={
 'arts-humanities-select-2-courses':['PHIL110','PHIL200'],
 'civics-political-social-sciences-select-2-courses':['POLS210','PSYC101'],
 'communication-writing-oral-and-multimedia-select-1-course':['COMM200'],
 'history-select-1-course':['HIST101'],
 'mathematics-and-applied-reasoning-select-1-course':['MATH110'],
 'natural-sciences-select-1-course':['EVSP180'],
 'elective-requirements-lower-level-100-200-courses':['HIST102','ECON102'],
 'elective-requirements-lower-100-200-level-courses-not-already-taken':['HIST102']
};
function courseTitle(fact){return fact.title;}
function quote(sourceId,text){return {sourceId,text};}

export async function validateAPUSReview(review,{base=root}={}){
 assert.equal(review.id,REVIEW_ID);assert.equal(review.checkedOn,date);
 assert.equal(review.scope.receivingInstitution,schoolName);assert.equal(review.scope.level,'associate');assert.equal(review.scope.creditSystem,'semester');
 assert.equal(review.programs.length,3);assert.equal(review.personalAwardsCreated,0);
 const sources=[review.finder,...review.programs.flatMap(program=>program.sources),...review.courses.map(course=>course.source)];
 const texts=new Map();
 for(const source of sources){
  assert(source.capture?.startsWith('content/source-captures/'));const bytes=await readFile(resolve(base,source.capture));
  assert.equal(digest(bytes),source.sha256,'Reviewed primary capture hash '+source.id);
  const meta=JSON.parse(await readFile(resolve(base,source.capture.replace(/\.txt$/,'.json')),'utf8'));
  assert.equal(meta.sha256,source.sha256);assert.equal(meta.url,source.url);assert.equal(meta.status,200);
  assert(meta.fetchedAt.slice(0,10)<=date,'No invented future source observation');texts.set(source.id,bytes.toString('utf8'));
 }
 const finder=texts.get(review.finder.id);
 assert.equal(review.finder.url,'https://www.apu.apus.edu/transfer-credit/finder/');
 assert(finder.includes('sophia learning')&&finder.includes('straighterline')&&finder.includes('study dot com'));
 for(const course of review.courses){
  const body=texts.get(course.source.id),begin=body.indexOf('Course Details'),end=body.indexOf('Course Schedule',begin);
  assert(begin>=0&&end>begin);assert.equal(course.detailsQuote,body.slice(begin,end).trim());
  assert(course.detailsQuote.includes('Course Code: '+course.code)&&course.detailsQuote.includes('Credit Hours: 3')&&course.detailsQuote.includes('Level: Undergraduate'));
  assert.equal(course.credits,3);assert.equal(course.creditSystem,'semester');assert(body.includes(course.creditQuote));
  assert(body.includes(course.code+' - '+course.title),'Exact university offering identity '+course.code);
 }
 for(const program of review.programs){
  const body=texts.get(program.sources[0].id);assert(body.includes('2026 - 2027 Catalog'));assert(body.includes(program.title));assert.equal(program.totalCredits,60);
 }
 const sophia=finder.split('\nsophia learning\n')[1]?.split('\nstraighterline\n')[0];assert(sophia);
 for(const identity of review.providerIdentities){
  assert.equal(identity.provider,'Sophia');assert(identity.sourceIdentityOnly);const item=identity.original;
  assert.equal(item.aceId,identity.code,'Exact original ACE course identity');
  assert.equal(item.sourceCredits,3);assert.equal(item.sourceCreditSystem,'semester');assert(item.recommendationStart<=date&&item.recommendationEnd>=date);assert(item.courseVersion);
  const lookup=new Map(identity.sources.map(source=>[source.id,source]));
  for(const id of [...item.identitySourceIds,...item.sourceCreditVerification.sourceIds])assert(isIndependentProviderIdentitySource(lookup.get(id),{provider:identity.provider,code:identity.code,...item},{asOf:date}),'Independent issuer evidence '+identity.code+'/'+id);
  const [title,receiving]=providerMap[identity.code];assert(title&&receiving);
  const start=sophia.indexOf('\n'+title+'\n');assert(start>=0,'One explicit university provider-course title '+title);
  const rest=sophia.slice(start+1),boundary=rest.indexOf('\n',rest.indexOf('3 SH')+4);
  const block=rest.slice(0,boundary<0?rest.length:boundary);
  assert(block.includes(receiving)&&block.includes('3 SH')&&block.includes('70% or higher'),'Exact receiving award tuple '+identity.code);
  assert(block.includes(identity.receivingAwardQuote),'Pinned receiving-award quote '+identity.code);
  assert(identity.receivingAwardEffectiveStart<=item.recommendationStart&&identity.receivingAwardEffectiveEnd>=item.recommendationEnd,'Separate but compatible source and receiving periods '+identity.code);
 }
 return texts;
}

export function reviewedAPUSInputs({review,school,equivalencies,programs,providerSourceIds=new Set()}){
 school=structuredClone(school);equivalencies=structuredClone(equivalencies);programs=structuredClone(programs);
 const courses=new Map(review.courses.map(course=>[course.code,course])),slugs=review.programs.map(program=>program.slug);
 const sourceIndex=new Map(school.sources.map(source=>[source.id,source]));
 const addSource=source=>{if(providerSourceIds.has(source.id))return;const existing=sourceIndex.get(source.id);if(existing)assert.deepEqual(existing,source,'Shared source revision '+source.id);else{sourceIndex.set(source.id,source);school.sources.push(structuredClone(source));}};
 addSource(review.finder);for(const course of review.courses)addSource(course.source);
 for(const identity of review.providerIdentities)for(const source of identity.sources)addSource(source);
 if(review.pricing?.source)addSource(review.pricing.source);
 school.sourceOverrides=[...new Set([...(school.sourceOverrides||[]),...school.sources.filter(source=>providerSourceIds.has(source.id)).map(source=>source.id)])];
 if(!school.sourceOverrides.length)delete school.sourceOverrides;
 const mode='apu-associate-exact-placement-2026-11-27';
 // defaultOptionId already includes the requirement. Appending it a second
 // time can exceed the runtime's bounded identifier length on named choices.
 equivalencies.placementModes={...equivalencies.placementModes,[mode]:{placementEvidence:{placementType:'exact-named-starting-requirement',citeInOption:true}}};
 const rowIds=new Map();
 equivalencies.equivalencies=equivalencies.equivalencies.filter(row=>!row.id.startsWith('apu-reviewed-associates-2026-11-27-'));
 for(const identity of review.providerIdentities){
  const [,code]=providerMap[identity.code],id='apu-reviewed-associates-2026-11-27-'+identity.code.toLowerCase()+'-'+code.toLowerCase();
  rowIds.set(code,id);
  equivalencies.equivalencies.push({id,provider:identity.provider,code:identity.code,status:'published',receivingCode:code,receivingTitle:courseTitle(courses.get(code)),credits:3,creditSystem:'semester',sourceIds:[review.finder.id],quotes:[quote(review.finder.id,identity.receivingAwardQuote)],scope:{programs:slugs,catalogs:['2026-2027'],levels:['associate'],modalities:['online']},identity:structuredClone(identity.original),evidence:'published',evidenceType:'official-receiving-school-equivalency',creditOrigin:'alternative',sourceType:'ACE',mappingChecked:date,mappingReviewId:REVIEW_ID,conditions:[`Complete the reviewed original provider version within its recommendation window ${identity.original.recommendationStart} through ${identity.original.recommendationEnd}.`,'Pass with at least 70% and submit the official transcript for individual APU evaluation; one original course cannot earn credit twice.'],extra:{mappingResearchClosed:true,receivingMapStatus:'published-current-apu-receiving-award',mappingScope:'Exact APU 2026-2027 associate named-course placement in the three reviewed programs only. This is not an AMU, Rasmussen, Hondros or system-wide equivalency decision.',receivingInstitution:schoolName,institutionCode:'APU',receivingAwardEffectiveStart:identity.receivingAwardEffectiveStart,receivingAwardEffectiveEnd:identity.receivingAwardEffectiveEnd,minScore:70,upper:Number(code.match(/\d+/)?.[0])>=300,eligibilityReview:{status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window',sourceIds:identity.original.identitySourceIds,checkedOn:identity.original.identityCheckedOn,reviewId:REVIEW_ID}}});
 }
 for(const program of programs){
  const packet=review.programs.find(item=>item.slug===program.slug);assert(packet);
  const catalog=program.sources.find(source=>source.url===program.catalogUrl)||program.sources[0];
  const selected=[];
  for(const requirement of program.requirements){
   const suffix=requirement.id.replace(program.slug+'-','');
   if(requirement.slot){
    const codes=choices[suffix];assert(codes&&codes.length*3===requirement.credits,'Named approved block choices '+suffix);
    for(const [i,code]of codes.entries()){
     const fact=courses.get(code);assert(fact);const id=codes.length>1?requirement.id+'-'+(i+1):requirement.id;
     const free=requirement.slot.kind==='free-elective';
     selected.push({id,code,title:fact.title,credits:3,category:requirement.category,group:requirement.title,publishedRequirementTitle:requirement.title,institutionalOnly:false,sourceIds:[catalog.id,fact.source.id],quotes:[...requirement.quotes,quote(catalog.id,free?'Elective Requirements':code),quote(fact.source.id,fact.creditQuote)],choiceFor:requirement.title,choiceSelection:true,proposedSelection:true,excludeAlreadyUsed:true,...(free?{freeElective:true,minCourseLevel:100,maxCourseLevel:200}:{}),notes:'A named, reviewed starting choice within the published requirement block, not the only course the catalog permits.'});
    }
   }else if(!requirement.choiceSelection)selected.push(requirement);
   else selected.push(requirement);
  }
  // Regeneration reads the canonical named rows; it never reconstructs an open placeholder.
  program.requirements=selected;
  const byCode=new Map(selected.map(requirement=>[requirement.code,requirement]));
  assert.equal(selected.length,20);assert.equal(selected.reduce((sum,row)=>sum+row.credits,0),60);assert.equal(byCode.size,20);
  for(const requirement of selected){
   // Use the public view's canonical general-education category for this new edition.
   if(requirement.category==='general-education')requirement.category='general';
   const fact=courses.get(requirement.code);assert(fact,'Reviewed complete university course detail '+requirement.code);
   requirement.sourceIds=[...new Set([...requirement.sourceIds,fact.source.id])];
   requirement.quotes=[...requirement.quotes.filter(q=>q.sourceId!==fact.source.id),quote(fact.source.id,fact.creditQuote)];
   requirement.selectionRequired=false;
   requirement.institutionOptions=[{code:requirement.code,title:fact.title,credits:3,upper:Number(requirement.code.match(/\d+/)?.[0])>=300,sourceIds:[catalog.id,fact.source.id],url:fact.source.url}];
   requirement.optionRows=rowIds.has(requirement.code)?[rowIds.get(requirement.code)+'@'+mode]:[];
   // Keep the explicit University option after outside alternatives; the receiving award remains separate.
   requirement.optionRows.push({inline:{id:'university-'+requirement.code.toLowerCase(),provider:'University',code:requirement.code,title:fact.title,credits:3,upper:Number(requirement.code.match(/\d+/)?.[0])>=300,creditSystem:'semester',creditOrigin:'institutional',sourceIds:[catalog.id,fact.source.id],evidence:'published',url:fact.source.url}});
   delete requirement.institutionOptions;
   const rule=review.prerequisites?.[requirement.code];
   requirement.prerequisites=rule?(rule.selectedCodes||[]).map(code=>{assert(byCode.has(code),'Prerequisite already accounted for '+code);return byCode.get(code).id;}):[];
   requirement.prerequisitePolicy={status:'verified',catalogYear:'2026-2027',format:'Online',rule:rule?.rule||{allOf:[]},noCoursePrerequisitesListed:!rule,sourceIds:[fact.source.id],checkedOn:date,reviewId:REVIEW_ID,scope:'Complete public APU Course Details body. No listed prerequisite is not a guarantee against student-specific registration restrictions.'};
   requirement.prerequisiteSourceIds=[fact.source.id];
   if(rule?.minimumCompletedCredits)requirement.minimumCompletedCredits=rule.minimumCompletedCredits;
   if(requirement.code==='CMRJ295'){
    requirement.prerequisites=selected.filter(row=>row!==requirement).map(row=>row.id);
    requirement.prerequisitePolicy.rule={allOf:[...selected.filter(row=>row!==requirement).map(row=>({type:'course',code:row.code})),{type:'minimum-completed-credits',credits:49}]};
    requirement.prerequisitePolicy.noCoursePrerequisitesListed=false;requirement.minimumCompletedCredits=49;requirement.prerequisiteNotes='Complete all other AA Criminal Justice requirements first; CMRJ295 is the last course, with at least 49 credits completed.';
   }
   if(requirement.code==='ISSC298'){
    requirement.prerequisites=selected.filter(row=>row!==requirement&&row.code.startsWith('ISSC')).map(row=>row.id);
    requirement.prerequisitePolicy.rule={allOf:[...selected.filter(row=>row!==requirement&&row.code.startsWith('ISSC')).map(row=>({type:'course',code:row.code})),{type:'minimum-completed-credits',credits:57}]};
    requirement.prerequisitePolicy.noCoursePrerequisitesListed=false;requirement.minimumCompletedCredits=57;requirement.prerequisiteNotes='Complete every other Information Systems Security course and at least 57 credits toward the degree before ISSC298.';
   }
  }
  program.catalog='2026-2027';program.modalities=['online'];program.format='Online';
  program.sourceOverrides=[...new Set([...(program.sourceOverrides||[]),...program.sources.map(source=>source.id)])];
  program.review={status:'reviewed',reviewer:review.reviewer,reviewedOn:date,reviewId:REVIEW_ID};
  program.gaps=[];
  const fields=program.modelFields;
  fields.school=schoolName;fields.receivingInstitution=schoolName;fields.institutionCode='APU';fields.catalogYear='2026-2027';fields.catalogIdentity={kind:'reviewed-current-catalog',label:'2026-2027 American Public University catalog',sourceUrl:program.catalogUrl,checkedOn:date};
  fields.supersedesModelId=packet.legacyModelId;
  fields.completeExecutablePathway=true;fields.coverage='complete';fields.coverageLabel='Complete named 60-credit APU starting plan with school-published course equivalencies; up to 30 nontraditional credits and 45 total transfer credits. Individual admission and transfer awards remain personal decisions.';
  fields.defaultProviders=['Sophia'];fields.upperMinCredits=0;
  fields.policyReview=[{field:'upperMinCredits',status:'not-applicable',sourceIds:[catalog.id],checkedOn:date,message:'The complete APU associate ledger has no separate degree-wide upper-level minimum; each named requirement retains its actual level.'}];
  fields.rulesNotes=['The institution is American Public University, using its APU catalog and transfer finder; this review does not extend a decision to every school in the parent System.','The 45-credit total transfer limit is separate from the 30-credit nontraditional limit. Starting from zero with the reviewed alternatives selects 30 outside credits and 30 APU credits.','Named general-education and free-elective selections are complete starting choices from the published lists. They do not replace the broader catalog lists or create personal credit awards.','One original outside course is counted at most once; shared requirement credit is not duplicated.'];
  fields.curriculumSections=[{id:'apu-general-education',parentId:'general',title:'General education',requirementIds:selected.filter(row=>row.category==='general').map(row=>row.id),sourceId:catalog.id},{id:'apu-major-requirements',parentId:'major',title:'Major requirements',requirementIds:selected.filter(row=>row.category==='major').map(row=>row.id),sourceId:catalog.id},{id:'apu-final-program-requirement',parentId:'capstone',title:'Final program requirement',requirementIds:selected.filter(row=>row.category==='capstone').map(row=>row.id),sourceId:catalog.id},...(selected.some(row=>row.freeElective)?[{id:'apu-free-electives',parentId:'elective',title:'Free electives',requirementIds:selected.filter(row=>row.freeElective).map(row=>row.id),sourceId:catalog.id}]:[])];
  fields.prerequisiteReview={id:REVIEW_ID,checkedOn:date,sourceIds:selected.map(row=>sourceId(row.code)),noAdditionalUnaccountedCoursePrerequisitesFound:true,personalRegistrationEligibilityConfirmed:false};
  if(review.pricing)fields.pricing={model:'per-credit',tuitionPerCredit:360,rate:360,degreeCredits:60,sourceIds:[review.pricing.source.id],sourceUrl:review.pricing.source.url,checkedOn:date,notes:'Standard undergraduate tuition before grants and aid; $250 associate graduation fee. Current published Opportunity, military and other grants are separate eligibility-based scenarios.'};
  for(const route of [...school.routes,...school.publish.documents.flatMap(document=>document.routes||[])])if(program.routeIds.includes(route.id)){route.school=schoolName;route.checkedOn=date;}
  const route={...structuredClone(packet.route),school:schoolName,checkedOn:date};
  if(!school.routes.some(row=>row.id===route.id))school.routes.push(route);
  if(!school.programOrder.includes(program.slug))school.programOrder.push(program.slug);
  const path='content/curricula/apus-'+program.slug+'.json';
  const document=school.publish.documents.find(row=>row.path===path);
  const published={path,programs:[program.slug],sources:'own',checkedOn:date,routes:[route]};
  if(document)Object.assign(document,published);else school.publish.documents.push(published);
 }
 return {school,equivalencies,programs};
}

export async function run({check=false}={}){
 const review=await read(REVIEW_PATH);await validateAPUSReview(review);
 const base='content/pathway-kits/apus/',school=await read(base+'school.json'),equivalencies=await read(base+'equivalencies.json'),programs=await Promise.all(review.programs.map(program=>read(base+'programs/'+program.slug+'.json')));
 const providerSourceIds=new Set();for(const name of ['sophia','study-com','straighterline','saylor','clep'])try{for(const source of (await read('content/pathway-kits/providers/'+name+'.json')).sources)providerSourceIds.add(source.id);}catch{}
 const result=reviewedAPUSInputs({review,school,equivalencies,programs,providerSourceIds});
 const writes=[[base+'school.json',result.school],[base+'equivalencies.json',result.equivalencies],...result.programs.map(program=>[base+'programs/'+program.slug+'.json',program])];
 let changed=0;for(const [path,value]of writes){const bytes=JSON.stringify(value,null,2)+'\n',before=await readFile(resolve(root,path),'utf8');if(before!==bytes){changed++;if(check)throw Error('Stale reviewed APU baseline: '+path);await writeFile(resolve(root,path),bytes);}}
 return {review:REVIEW_ID,programs:3,receivingAwards:review.providerIdentities.length,reviewedUniversityCourses:review.courses.length,changed,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert(process.argv.slice(2).every(arg=>arg==='--check'));console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));}
