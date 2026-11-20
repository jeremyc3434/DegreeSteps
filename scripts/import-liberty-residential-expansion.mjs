/* RETIRED as a Liberty source of truth (2026-11-20). Liberty curricula now compile from content/pathway-kits/liberty
 * via `npm run factory:publish`; its invariants live in content/pathway-kits/liberty/guards.mjs. Kept for history;
 * do not run it to regenerate content/curricula/liberty*.json. */
/* Offline compilation of independently reviewed residential degree facts. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {supplementModel} from './add-liberty-official-mappings.mjs';
const root=resolve(import.meta.dirname,'..'),read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const factPath='content/curricula/snapshots/liberty/psychology-residential-2026-2027-reviewed.json',output='content/curricula/liberty-residential-expansion.json';
const facts=await read(factPath),degree=facts.degree,directory=await read('dist/data/program-catalog.json');
const parent=directory.programs.find(route=>route.school==='Liberty University'&&route.title===degree.parentTitle);
assert(parent,'Exact Psychology parent route is required');
const sid=facts.sources[0].id,gened=facts.sources[1].id,courseSource=facts.sources[2].id,mid='curriculum-liberty-psychology-bs-residential',routeId=parent.id+'-residential';
const rid=code=>code.toLowerCase().replace(/\s+/g,'-');
function row([code,title,credits,group],category){return{id:rid(code),code,title,credits,category,group:group||'major-core',upper:/\s[34]\d\d$/.test(code),sourceIds:category==='general'?[sid,gened]:[sid],options:[]};}
const general=[...degree.generalFixed,...degree.approvedGeneralChoices].map(fact=>row(fact,'general'));
general.push(row([degree.technologyChoice.code,degree.technologyChoice.title,degree.technologyChoice.credits,'technology'],'general'));
general.at(-1).allowedCourseCodes=[degree.technologyChoice.code,degree.technologyChoice.otherApprovedCode];
general.at(-1).choiceNote='The proposed route takes INFT 110 for 3 credits from the official residential approved list. INFT 111 is the published alternative. No assessment waiver is assumed.';
const foundations=degree.majorFoundations.map(fact=>row([...fact,'major-foundations'],'major'));
const major=degree.majorCore.map(fact=>row(fact,'major'));
const choice=degree.majorChoice;
major.push(row([choice.selectedCode,choice.selectedTitle,choice.credits],'major'));
major.at(-1).allowedCourseCodes=choice.allowedCourseCodes;
major.at(-1).choiceNote='Choose 3 credits from PSYC 495, PSYC 497 or PSYC 499. This proposed route selects the fixed 3-credit PSYC 497; research/internship choices require a separately approved credit quantity.';
const freeCredits=degree.freeElectiveRange[0],free={id:'free-electives',title:'Free electives — courses not already counted in this degree',credits:freeCredits,category:'electives',group:'free-electives',bucket:true,freeElective:true,upper:false,sourceIds:[sid],options:[],allowedCreditsRange:degree.freeElectiveRange,excludeAlreadyUsed:true};
let requirements=[...general,...foundations,...major,free];
assert.equal(general.reduce((sum,row)=>sum+row.credits,0),37);
assert.equal(foundations.reduce((sum,row)=>sum+row.credits,0),degree.majorFoundationCredits);
assert.equal(major.reduce((sum,row)=>sum+row.credits,0),degree.majorCoreCredits);
assert.equal(requirements.reduce((sum,row)=>sum+row.credits,0),degree.totalCredits);
assert.equal(new Set(requirements.map(row=>row.id)).size,requirements.length);
for(const req of requirements){
 if(degree.selectedPrerequisites[req.code]){req.prerequisites=degree.selectedPrerequisites[req.code].map(rid);req.prerequisiteNotes='Proposed sequence chooses PSYC 101 and, where needed, MATH 121 from the course catalog’s permitted prerequisite alternatives. Confirm transfer evaluation, prerequisites, availability and permission before registration.';req.sourceIds.push(courseSource);}
}
const section=(id,title,rows,parentId)=>({id,title,...(parentId?{parentId}:{}),requirementIds:rows.map(row=>row.id),sourceId:sid});
const sections=[...[
 ['communication','Communication and information literacy'],['technology','Technology and quantitative reasoning'],['critical-thinking','Critical thinking'],['civic-engagement','Civic and global engagement'],['christianity-contexts','Christianity and contexts']
].map(([group,title])=>section('res-psych-ge-'+group,title,general.filter(row=>row.group===group),'general')),
 {id:'res-psych-ge-social-scientific',title:'Social and scientific inquiry',parentId:'general',requirementIds:[],sharedRequirementIds:degree.overlaps.map(item=>rid(item.code)),sourceId:sid},
 section('res-psych-major-foundations','Major foundations',foundations,'major'),section('res-psych-major-core','Psychology major courses',major,'major'),section('res-psych-free-electives','Approved elective choices',[free],'elective')];
const model=supplementModel({id:mid,routeIds:[routeId],school:'Liberty University',title:'Psychology (B.S.) — Residential',format:'Residential',modalities:['campus'],level:'bachelor',catalog:'2026–2027',catalogYear:'2026-2027',totalCredits:degree.totalCredits,creditSystem:'semester',institutionMinCredits:degree.institutionMinCredits,externalMaxCredits:90,upperMinCredits:degree.upperMinCredits,majorInstitutionFraction:degree.majorInstitutionFraction,majorResidencyBasisCredits:degree.majorResidencyBasisCredits,sources:facts.sources,requirements,curriculumSections:sections,coverage:'complete',completeExecutablePathway:false,coverageLabel:'Complete 120-credit residential requirements with source-linked proposed transfer choices; individual approval remains necessary.',overlaps:degree.overlaps.map(item=>({requirementId:rid(item.code),alsoSatisfies:item.generalCategory,creditsCountedOnce:item.credits})),rulesNotes:['Positive technology-course scenario: INFT 110 retains 3 credits; the source also permits passing an assessment. No assessment waiver is assumed.','The 43-credit general-education selection shares BIOL 102 and PSYC 101 with major foundations. Its unique allocation is 37 credits, plus 12 foundations, 39 major courses and 32 free electives, totaling 120.','All four religion courses with conditional transfer waivers remain in this baseline.',...degree.waiversRetainedInBaseline],unresolved:['Confirm the student’s applicable catalog, degree-specific transfer evaluation, allowed alternative-credit total and major-residency allocation.','Confirm PSYC 497 topic, offering and prerequisites. An online PSYC 491 capstone is not the residential culminating choice.','A public equivalency is not an individual credit award or guaranteed admission, tuition or completion schedule.'],graduationRequirements:[{id:'overall-gpa',title:'Overall GPA',description:'At least 2.0 overall GPA.',detail:'At least 2.0 overall GPA.',sourceIds:[sid]},{id:'cser',title:'Christian/Community Service',description:'Satisfy applicable CSER requirements before graduation. These are non-credit obligations.',detail:'Satisfy applicable CSER requirements before graduation. These are non-credit obligations.',sourceIds:[sid]},{id:'degree-application',title:'Graduation application',description:'Submit the degree completion application during the final anticipated semester.',detail:'Submit the degree completion application during the final anticipated semester.',sourceIds:[sid]}]});
model.gradePolicy.checked=facts.checkedOn;
for(const item of model.graduationRequirements)if(!item.description&&item.detail)item.description=item.detail;
model.defaultProviders=['Sophia','Study.com','StraighterLine','CLEP'];
const tuitionSource={id:'liberty-psychology-residential-tuition-2026-2027',title:'Liberty 2026–27 standard residential undergraduate tuition',url:'https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-resident-program/',checked:facts.checkedOn,evidenceType:'official-tuition',scope:'Standard fall/spring undergraduate tuition and part-time rates before financial aid. Housing, fees and other expenses require separate estimates.'};
model.sources.push(tuitionSource);
model.tuitionComparison={entryId:'liberty-residential',checkedOn:facts.checkedOn,sourceUrl:tuitionSource.url,catalogYear:'2026-2027'};
const document={version:1,checkedOn:facts.checkedOn,school:'Liberty University',sources:facts.sources,routes:[{id:routeId,parentId:parent.id,school:model.school,title:model.title,level:'bachelor',modalities:['campus'],url:facts.sources[0].url}],models:[model],coverage:{scope:'Reviewed residential Psychology B.S. only; not a university-wide coverage claim.',sourceFacts:factPath,requirementCredits:120,uniqueGeneralEducationCredits:37,majorFoundationCredits:12,majorCoreCredits:39,freeElectiveCredits:32,sharedGeneralEducationCredits:6,technologyScenarioCredits:3}};
const text=JSON.stringify(document,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(await readFile(resolve(root,output),'utf8'),text,'Residential expansion data is stale');else await writeFile(resolve(root,output),text);
console.log(JSON.stringify({model:mid,route:routeId,totalCredits:120,requirements:requirements.length,technologyCredits:3,check:process.argv.includes('--check')}));
