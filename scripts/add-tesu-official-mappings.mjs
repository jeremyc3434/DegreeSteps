/* Bounded, reviewed TESU supplement. Provider-published course matches remain
 * conditional; ACE recommendations are independent of an individual TESU award.
 * Run directly to regenerate dist/data/tesu.json; --check never writes. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {applyCourseListingIdentities} from './reviewed-course-identities.mjs';
import {completeTESUChoices} from './complete-tesu-named-choices.mjs';
import {applyTESUReceivingMaps} from './add-tesu-school-submitted-maps.mjs';
import {applyTESUProviderReview} from './tesu-provider-review.mjs';
import {applyTESUStudyEnglish104} from './tesu-study-english104.mjs';
import {applyTESUUPIReviewedMaps} from './tesu-upi-maps.mjs';

const root=resolve(import.meta.dirname,'..');
export const checkedOn='2026-11-11';
export const reviewId='tesu-provider-supplement-2026-11-11';
const clone=value=>JSON.parse(JSON.stringify(value));
const add=(values,value)=>{if(!values.includes(value))values.push(value);};
const catalog='https://tesu.smartcatalogiq.com/';
const study='https://study.com/college/thomas-edison-state-university/degrees/';
const ace='https://www.acenet.edu/National-Guide/Pages/';
const studyOrganization=ace+'Organization.aspx?oid=82099b28-9016-e811-810f-5065f38bf0e1';

export const sources=[
  {id:'tesu-transfer-policy-current',title:'TESU current transfer credit policy: caps, duplicate awards and grade minima',url:catalog+'current/undergraduate-catalog/methods-of-learning-and-earning-credit/transfer-credit/',evidenceType:'official-university-policy',scope:'General transfer rules; no individual course award is asserted.'},
  {id:'tesu-grade-policy-current',title:'TESU current grading policy: C minimum for composition, area of study and core',url:catalog+'en/current/undergraduate-catalog/university-policies-and-procedures/undergraduate-course-policies/policy-on-grading',evidenceType:'official-university-policy',scope:'The area-of-study C minimum explicitly includes core courses. Other grade and GPA rules remain applicable.'},
  {id:'tesu-business-core-scope-current',title:'TESU business degree overview: Professional Business Requirements are the business core',url:catalog+'en/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bachelor-of-science-in-business-administration',evidenceType:'official-university-policy',scope:'Identifies the named Professional Business Requirements as the business core, establishing the scope of the grading policy; no transfer mapping is asserted.'},
  {id:'tesu-transcripts-current',title:'TESU official transcript delivery instructions',url:'https://www.tesu.edu/student-resources/transfer-credits/send-transcripts.php',evidenceType:'official-university-policy',scope:'Required transcript delivery route; delivery is not acceptance or degree allocation.'},
  {id:'tesu-study-general-management-current',title:'Study.com published TESU General Management course matches',url:study+'tesu-bachelor-of-science-in-general-management.html',evidenceType:'provider-published',scope:'Provider-published named course matches, not individual TESU approvals. Only explicitly reviewed rows are imported. Finance 101 credit claims conflict with a separate provider guide.'},
  {id:'tesu-study-man3720-current',title:'Study.com published Business 308 to TESU MAN-3720 course guide',url:study+'tesu-man-3720-international-management-overview-course-equivalency-guide.html',evidenceType:'provider-published',scope:'Explicit provider claim of the Business 308 / MAN-3720 match and three credits; university confirmation remains required.'},
  {id:'tesu-study-fin3010-conflict-current',title:'Study.com FIN-3010 guide: unresolved Finance 101 credit conflict',url:study+'tesu-fin-3010-principles-finance-overview-course-equivalency-guide.html',evidenceType:'provider-published',scope:'Research conflict only: this guide says three credits while the General Management table says one lower-level credit. No new selectable Finance 101 mapping is created.'},
  {id:'tesu-study-business306-ace-current',title:'ACE Study.com Business 306 v5 identity, source credits and passing score',url:ace+'Course.aspx?cid=bfff03d6-7b42-f111-88b5-000d3a3063b4&oid=82099b28-9016-e811-810f-5065f38bf0e1&org=Study.com,+LLC',evidenceType:'official-recommendation',scope:'SDCM-0071 v5, Business 306, three upper-division semester credits, minimum passing score 70. ACE does not award TESU credit.'},
  {id:'tesu-study-business308-ace-current',title:'ACE Study.com Business 308 v6 identity, source credits and passing score',url:ace+'Course.aspx?cid=5b5554f0-7ff1-f011-8406-6045bd02b4cc&oid=82099b28-9016-e811-810f-5065f38bf0e1&org=Study.com,+LLC',evidenceType:'official-recommendation',scope:'SDCM-0054 v6, Business 308, three upper-division semester credits, minimum passing score 70. The exact recommendation period was not recovered.'},
  {id:'tesu-study-ace-organization-current',title:'ACE Study.com current organization listing: Business 306 recommendation dates',url:studyOrganization,evidenceType:'official-recommendation',scope:'The Business 306 SDCM-0071 current listing supplies June 1, 2026 through May 31, 2029. No Business 308 period is inferred.'},
  {id:'tesu-study-course-passing-current',title:'Study.com overall course passing percentage and final-exam distinction',url:'https://study.com/support/solutions/articles/11000134479-what-do-i-need-to-score-on-my-final-exam-to-pass-my-study-com-course-',evidenceType:'provider-published',scope:'Study.com states that 70 percent applies to the combined overall course grade, rather than necessarily to the final exam alone. Confirm the course syllabus weighting; this is not an exam-score eligibility gate.'},
  {id:'tesu-sophia-algebra-window-current',title:'ACE Sophia College Algebra v6 exact recommendation period',url:ace+'Organization.aspx?k=SOPH-0001',evidenceType:'official-recommendation',scope:'College Algebra SOPH-0001 / MATH1001, May 1, 2025 through April 30, 2028. The linked course is the existing v6 record; this does not settle TESU acceptance.'},
  {id:'tesu-sophia-partner-current',title:'Sophia TESU page: no established course transfer equivalencies shown',url:'https://tesu.sophia.org/',evidenceType:'provider-published',scope:'The retrieved established-equivalency table is empty and courses are listed without an established transfer agreement. TESU advisors determine individual degree applicability.'},
  {id:'tesu-man3720',title:'TESU MAN-3720 course and management knowledge advisory',url:catalog+'en/current/undergraduate-catalog/courses/man-management/3000/man-3720',evidenceType:'official-university-course',scope:'MAN-3720 International Management, three credits. Advisory names MAN-2100 with C or better; prerequisite field retains legacy MAN-210.'}
].map(source=>({...source,checked:checkedOn,verification:'Public source opened and reviewed on November 11, 2026.'}));

export const mappings=[
  {id:'studycom-sdcm-0054-man3720',code:'SDCM-0054',providerCourseCode:'Business 308',title:'Business 308: Globalization & International Management',receivingCode:'MAN-3720',receivingTitle:'International Management',courseVersion:6,recommendationStart:null,recommendationEnd:null,aceSourceId:'tesu-study-business308-ace-current',mappingSourceId:'tesu-study-man3720-current'},
  {id:'studycom-sdcm-0071-man3310',code:'SDCM-0071',providerCourseCode:'Business 306',title:'Business 306: Strategic Human Resource Management',receivingCode:'MAN-3310',receivingTitle:'Human Resources Management',courseVersion:5,recommendationStart:'2026-06-01',recommendationEnd:'2029-05-31',aceSourceId:'tesu-study-business306-ace-current',mappingSourceId:'tesu-study-general-management-current'}
];

export function officialOptions(requirement){
  if(requirement.institutionalOnly||requirement.bucket||requirement.allocationType||requirement.credits!==3)return [];
  return mappings.filter(mapping=>requirement.code===mapping.receivingCode&&requirement.title===mapping.receivingTitle).map(mapping=>({
    id:mapping.id,provider:'Study.com',title:mapping.title,code:mapping.code,aceId:mapping.code,
    providerCourseCode:mapping.providerCourseCode,codeAliases:[mapping.providerCourseCode],
    identitySourceIds:[mapping.aceSourceId],codeAliasEvidence:[{alias:mapping.providerCourseCode,sourceIds:[mapping.aceSourceId],scope:'Exact Study.com course identity and ACE version only; this does not establish TESU acceptance.'}],
    credits:3,sourceCredits:3,creditSystem:'semester',sourceCreditSystem:'semester',upper:true,
    receivingCode:mapping.receivingCode,receivingTitle:mapping.receivingTitle,
    evidence:'conditional',evidenceType:'provider-published',mappingScope:'Provider-published exact named TESU course match; TESU must confirm individual catalog applicability and the receiving award.',
    mappingChecked:checkedOn,mappingReviewId:reviewId,courseVersion:mapping.courseVersion,
    recommendationStart:mapping.recommendationStart,recommendationEnd:mapping.recommendationEnd,providerCoursePassingPercent:70,providerCoursePassingSourceIds:['tesu-study-course-passing-current',mapping.aceSourceId],
    sourceIds:[...new Set([mapping.mappingSourceId,'tesu-study-general-management-current',mapping.aceSourceId,...(mapping.recommendationStart?['tesu-study-ace-organization-current']:[]),'tesu-study-course-passing-current','tesu-degree','tesu-directory','tesu-transcripts-current'])],
    url:sources.find(source=>source.id===mapping.mappingSourceId).url,
    conditions:[
      `Study.com publishes the ${mapping.providerCourseCode} match to ${mapping.receivingCode} ${mapping.receivingTitle}, three upper-level semester credits. This provider-published claim is not an individual TESU approval or transfer award.`,
      `ACE identifies ${mapping.code} version ${mapping.courseVersion} as ${mapping.providerCourseCode}, with three upper-division semester credits and a minimum passing score of 70. These source facts do not establish TESU equivalency or the learner's completed version.`,
      'Study.com explains that the 70 percent passing threshold applies to the combined overall course grade. It is not necessarily a final-exam score minimum; consult the course syllabus for assessment weighting. TESU\'s separate C course-grade minimum still applies.',
      mapping.recommendationStart?'The reviewed ACE recommendation period is June 1, 2026 through May 31, 2029. Confirm the completed course version and that the completion date falls within the applicable recommendation period.':'The exact ACE recommendation start and end dates for this version were not recovered. Confirm the recommendation period covering your completion date before purchase; unknown dates are not an unrestricted eligibility window.',
      'TESU currently lists Study.com as an approved provider. Provider status alone does not establish this course award, level, nonduplication or applicability to the learner\'s catalog. Obtain TESU confirmation before purchase.',
      'Send the official Study.com transcript directly from Study.com to TESU. TESU does not accept a Study.com ACE transcript for credit review.',
      'The TESU minimum of C applies to composition, business core and area-of-study requirements. Confirm prerequisites and individual evaluation; a provider course cannot be counted twice.'
    ]
  }));
}

function upsertSources(model){
  for(const source of sources){const index=model.sources.findIndex(existing=>existing.id===source.id);if(index<0)model.sources.push(clone(source));else model.sources[index]={...model.sources[index],...clone(source)};}
  for(const id of ['tesu-degree','tesu-directory','tesu-transfer-faq','tesu-residency']){const source=model.sources.find(source=>source.id===id);if(source)source.checked=checkedOn;}
}

export function supplementModel(input){
  const model=clone(input);assert.equal(model.id,'tesu-general-management','This supplement only applies to the reviewed TESU General Management model');
  upsertSources(model);
  for(const requirement of model.requirements){
    const options=officialOptions(requirement);
    for(const option of options){const index=requirement.options.findIndex(existing=>existing.id===option.id);if(index<0)requirement.options.unshift(option);else {const existing=requirement.options[index];requirement.options[index]={...existing,...option,conditions:[...new Set([...option.conditions,...(existing.conditions||[])])]};delete requirement.options[index].minScore;}}
    if(['ENC-1010','ENC-1020'].includes(requirement.code)||['business-core','area-study'].includes(requirement.group)){
      requirement.minimumGrade='C';requirement.minimumGradeSourceIds=['tesu-transfer-policy-current','tesu-grade-policy-current',...(['business-core'].includes(requirement.group)?['tesu-business-core-scope-current']:[])];
      requirement.gradePolicyNote='TESU requires C or better in composition and all area-of-study courses, including core courses. This applies to the named professional business core and selected area-of-study requirements.';
    }
    for(const option of requirement.options){
      if(option.provider==='Sophia'){
        add(option.sourceIds,'tesu-sophia-partner-current');
        add(option.conditions,'The Sophia TESU page checked November 11, 2026 shows no established course equivalencies and lists the courses without an established transfer agreement. Existing ACE or community evidence remains conditional; confirm this course with TESU before purchase.');
      }
      if(option.provider==='Study.com'&&(/Finance 101/i.test(option.code)||/Finance 101/i.test(option.providerCourseCode||'')||/Finance 101/i.test(option.title))){
        add(option.sourceIds,'tesu-study-fin3010-conflict-current');add(option.sourceIds,'tesu-study-general-management-current');
        add(option.conditions,'Unresolved provider-source conflict: the General Management table lists Finance 101 as one lower-level credit, while the FIN-3010 course guide says three credits. Confirm the actual source and receiving credits and level with TESU; this review does not validate that candidate.');
        option.creditEvidenceConflict=true;
      }
    }
  }
  for(const mapping of mappings)assert(model.requirements.some(requirement=>requirement.options.some(option=>option.id===mapping.id)),`Missing reviewed named requirement ${mapping.receivingCode}`);
  const algebra=model.requirements.find(requirement=>requirement.code==='MAT-1210').options.find(option=>option.id==='soph-0001');
  assert.equal(algebra.aceId,'SOPH-0001');assert.equal(algebra.version,6);
  Object.assign(algebra,{courseVersion:6,recommendationStart:'2025-05-01',recommendationEnd:'2028-04-30',sourceCredits:3,sourceCreditSystem:'semester',creditSystem:'semester',mappingChecked:checkedOn});
  add(algebra.sourceIds,'tesu-sophia-algebra-window-current');
  add(algebra.conditions,'ACE College Algebra SOPH-0001 version 6 is recommended for May 1, 2025 through April 30, 2028. Confirm that the learner completed this version within that period. TESU acceptance and individual degree allocation remain conditional.');
  model.transcriptInstructions=[
    {provider:'Sophia',instruction:'Send a Credly transcript to TESU. TESU cannot review a transcript sent directly from Sophia through Parchment because it lacks the ACE recommendation information.',sourceIds:['tesu-transcripts-current']},
    {provider:'Study.com',instruction:'Request the official Study.com transcript directly from Study.com to TESU. TESU does not accept Study.com credit from an ACE transcript.',sourceIds:['tesu-transcripts-current']},
    {provider:'StraighterLine',instruction:'Request the official StraighterLine transcript directly from StraighterLine to TESU, rather than through ACE/NCCRS or through the student.',sourceIds:['tesu-transcripts-current']}
  ];
  model.gradePolicy={minimumGrade:'C',scope:'composition-business-core-and-area-of-study',sourceIds:['tesu-transfer-policy-current','tesu-grade-policy-current','tesu-business-core-scope-current'],checked:checkedOn,detail:'C or better in English composition and all area-of-study courses, including core. Other general-education and free-elective courses do not acquire this C minimum; overall GPA and transfer-grade rules still apply.'};
  model.transferPolicyReview={checked:checkedOn,alternativeMaxCredits:90,alternativeMaxScope:'Combined ACE/NCCRS, CLEP, DSST, AP, corporate/military training and other approved noncollegiate providers.',duplicatesCountOnce:true,sourceIds:['tesu-transfer-policy-current','tesu-transfer-faq'],requiredInstitutionalCourses:['SOS-1100','BUS-4210'],residencyNote:'Standard nonmilitary 15-credit TESU AC, OL/NU, GS or e-Pack residency remains a separate requirement; Edison Accelerate and military paths are not optimized.'};
  model.alternativeMaxCredits=90;
  model.rulesNotes=model.rulesNotes.map(note=>note.startsWith('Noncollegiate-credit limit is conservatively modeled')?'The combined noncollegiate-credit maximum is 90 credits. The current TESU transfer catalog and transfer FAQ support this cap; the FAQ explicitly includes CLEP, DSST, AP, military/corporate training and other approved noncollegiate providers.':note.startsWith('The expanded library describes candidate mappings')?'The expanded library describes candidates for 99 distinct requirement credits, including 6 conditional science-category replacements. The combined 90-credit alternative-source ceiling and separate 15-credit standard residency requirement still constrain a feasible plan.':note);
  for(const note of [
    'Two additional Study.com matches for MAN-3720 and MAN-3310 are provider-published conditional candidates, not individual TESU awards. ACE confirms original-course identity and three upper-level source credits independently of TESU acceptance.',
    'TESU requires C or better in composition and all area-of-study courses, including the professional business core. Duplicate transfer and institutional learning can be applied only once.',
    'Use the TESU transcript instructions for each provider. Sophia requires Credly; Study.com and StraighterLine must send their official transcripts directly to TESU.'
  ])add(model.rulesNotes,note);
  model.unresolved=model.unresolved.map(note=>note.startsWith('No exact current outside mapping was established')?'No exact current outside mapping was established for ETH-2200 or BUS-2100. FIN-3010 has conflicting Study.com credit claims and remains unresolved. The featured SOC-2100 and FIL-1100 Human Cultures choices remain research gaps; other approved category choices may fit. MAN-3720 and MAN-3310 now have provider-published conditional candidates, not individual TESU approvals.':note.startsWith('Precise ACE recommendation windows for the two official Sophia versions')?'The ACE College Algebra SOPH-0001 v6 period is verified as May 1, 2025 through April 30, 2028; current Sophia acceptance remains conditional. Precise Financial Accounting v5 dates and the exact recommendation periods of other community mappings remain unresolved.':note);
  add(model.unresolved,'Study.com Business 308 SDCM-0054 v6 recommendation dates were not recovered. Business 306 SDCM-0071 v5 is dated June 1, 2026 through May 31, 2029; TESU must still confirm version, awarded level and individual catalog applicability.');
  add(model.unresolved,'Study.com Finance 101 is not added by this supplement: the program table says one lower-level credit while its FIN-3010 guide says three credits. Resolve the actual source and receiving credit quantity and level with TESU.');
  model.coverageLabel='120-credit ledger · 93 credits with exact-course candidates, plus 6 conditional science-category candidates · 90-credit combined alternative cap';
  model.completeExecutablePathway=false;
  model.mappingReview={...model.mappingReview,checked:checkedOn,method:'Existing community snapshots retained; bounded live review of official TESU policies, provider-published Business 306/308 matches and ACE source records.',exactCourseOrFreeElectiveCandidateCredits:93,additionalCategoryCandidateCredits:6,uniqueRequirementCandidateCredits:99,combinedAlternativeFeasibleCeiling:90,status:'Conditional research candidates; 99 mapped requirement credits is not a feasible 99-credit alternative plan.',officialSupplement:{id:reviewId,checked:checkedOn,newNamedRequirementCredits:6,newProviderCourses:2,providerPublishedMatches:2,individualUniversityApprovals:0,scope:'MAN-3720 and MAN-3310 only; no new Finance 101, CLEP score or StraighterLine mappings.'}};
  model.officialMappingCheckedOn=checkedOn;
  return applyTESUUPIReviewedMaps(applyTESUProviderReview(applyTESUStudyEnglish104(applyCourseListingIdentities(applyTESUReceivingMaps(completeTESUChoices(model))))));
}

export async function run({check=false}={}){
  const file=resolve(root,'dist/data/tesu.json'),original=JSON.parse(await readFile(file,'utf8')),result=supplementModel(original);
  if(check)assert.deepEqual(original,result,'dist/data/tesu.json requires the reviewed TESU supplement');
  else await writeFile(file,JSON.stringify(result,null,2)+'\n');
  return {check,files:1,newProviderCourses:2,newNamedRequirementCredits:6,candidateRequirementCredits:99,combinedAlternativeFeasibleCeiling:90};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
