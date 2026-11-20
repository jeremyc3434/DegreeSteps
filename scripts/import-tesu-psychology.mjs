/* RETIRED as a TESU source of truth (2026-11-20). TESU curricula now compile from content/pathway-kits/tesu via
 * `npm run factory:publish`; its invariants live in content/pathway-kits/tesu/guards.mjs. The builder below is kept as a
 * cross-check: `--check` proves the kit-published document still carries this reviewed ledger (scripts/tesu-kit-ledger-check.mjs).
 * Running it without --check no longer writes content/curricula. */
/* Exact current BA Psychology ledger; external awards are attached separately
 * by reviewed TESU receiving codes, never inferred from Psychology titles. */
import assert from 'node:assert/strict';
import {assertKitLedger} from './tesu-kit-ledger-check.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
export const factsPath='content/curricula/snapshots/tesu/psychology-current-2026-11-18-reviewed.json';
export const outputPath='content/curricula/tesu-psychology.json';
const rid=code=>code.toLowerCase().replace(/-/g,'');
const sid='tesu-psychology-current-2026-11-18',policy='tesu-psychology-degree-policy-2026-11-18',transfer='tesu-psychology-transfer-2026-11-18',grades='tesu-psychology-grades-2026-11-18';
export function buildTESUPsychology(facts,baseline){
 assert.equal(facts.version,1);assert.equal(facts.checkedOn,'2026-11-18');assert.equal(facts.school,'Thomas Edison State University');assert.equal(baseline.id,'tesu-general-management');
 const degree=facts.degree,p=facts.policies,sourceRows=new Map(baseline.requirements.map(row=>[row.code,row]));
 assert.equal(degree.generalCredits+degree.areaOfStudyCredits+degree.freeElectiveCredits,degree.totalCredits);
 assert.equal(degree.totalCredits,120);assert.equal(degree.requiredCourses.length,9);assert.equal(degree.selectedFreeElectives.length,10);
 const sources=new Map(facts.sources.map(source=>[source.id,clone(source)]));
 function copySource(id){const source=baseline.sources.find(source=>source.id===id);assert(source,'Missing independently reviewed TESU source '+id);sources.set(id,clone(source));}
 function university(row){return{id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,upper:row.upper,creditSystem:'semester',creditOrigin:'institutional',sourceIds:[...row.sourceIds],evidence:'published'};}
 const general=degree.generalFeaturedCodes.map(code=>{
  const old=sourceRows.get(code);assert(old&&old.credits===3,'Missing featured general-education choice '+code);
  const row=clone(old);row.options=[];row.sourceIds=[sid];
  if(row.minimumGrade){row.minimumGradeSourceIds=[transfer,grades];row.gradePolicyNote='C or better in English composition. This does not impose the area-of-study grade requirement on unrelated general education.';}
  for(const id of row.prerequisiteSourceIds||[])copySource(id);
  row.options=[university(row)];return row;
 });
 function aos(course,subgroup){
  const [code,title,credits]=course,fact=facts.courses[code];assert(fact&&fact.title===title&&fact.credits===credits&&sources.has(fact.sourceId));
  const row={id:rid(code),code,title,credits,category:'major',group:'area-of-study',subgroup:'area-of-study',upper:fact.upper,institutionalOnly:code==='LIB-4960',sourceIds:[sid,fact.sourceId],options:[],minimumGrade:'C',minimumGradeSourceIds:[transfer,grades],curriculumBlock:subgroup};
  if(['ECO-1110','ECO-1120'].includes(code)){row.sourceIds.push('tesu-psychology-social-science-selection-2026-11-18');row.choiceNote='Proposed named selection from the university-linked Social Sciences list, allocated once in the six-credit area-of-study elective block.';}
  if(fact.prerequisites.length){row.prerequisites=fact.prerequisites.map(rid);row.prerequisiteSourceIds=[fact.sourceId];}
  if(fact.advisory){row.prerequisiteNotes=fact.advisory;row.prerequisiteSourceIds=[fact.sourceId];}
  row.options=[university(row)];return row;
 }
 const required=degree.requiredCourses.map(course=>aos(course,'required-psychology'));
 const socialPsychology=degree.socialPsychologySelection.map(course=>aos(course,'social-psychology-selection'));
 const psychologyElectives=degree.psychologyElectives.map(course=>aos(course,'psychology-electives'));
 const socialScience=degree.socialScienceElectives.map(course=>aos(course,'social-science-electives'));
 const capstone=[aos(degree.capstone,'capstone')],area=[...required,...socialPsychology,...psychologyElectives,...socialScience,...capstone];
 const free=degree.selectedFreeElectives.map(([code,title,credits],index)=>{
  const special={'ART-1000':'tesu-art1000-current-2026-11-17','ANT-1010':'tesu-ant1010-current-2026-11-17','HIS-1210':'tesu-his1210-current-2026-11-17','BUS-1010':'tesu-accounting-bus1010-2026-11-18','HUM-1030':'tesu-psychology-hum1030-2026-11-18','ACC-1010':'tesu-psychology-acc1010-2026-11-18'};
  const original=sourceRows.get(code),sourceId=special[code]||'tesu-gm-current-program-2026-11-17';
  if(!sources.has(sourceId))copySource(sourceId);
  assert(original||special[code],'No named university course identity for elective '+code);
  if(original)assert.equal(original.title,title,'A named free-elective course changed');
  const id='free-'+rid(code),sourceIds=[sid,sourceId];
  return{id,title:'Free elective '+(index+1),credits,category:'electives',group:'free-electives',subgroup:'free-electives',upper:false,freeElective:true,excludeAlreadyUsed:true,sourceIds,
   options:[{id:'university-'+id,provider:'University',code,title,credits,upper:false,creditSystem:'semester',creditOrigin:'institutional',sourceIds:[...sourceIds],evidence:'published',url:sources.get(sourceId).url}],
   ...(code==='ACC-1010'?{prerequisiteNotes:'Working knowledge of Microsoft Excel is required as an advisory; this is not a formal prerequisite course.',prerequisiteSourceIds:[sourceId]}:{}),
   notes:'Named university baseline: '+code+' '+title+'. This is unrestricted elective capacity, not an exact-course transfer requirement; an eligible nonduplicating course may replace it.'};
 });
 const requirements=[...general,...area,...free],ids=new Set(requirements.map(row=>row.id));
 assert.equal(general.reduce((sum,row)=>sum+row.credits,0),45);assert.equal(area.reduce((sum,row)=>sum+row.credits,0),45);assert.equal(free.reduce((sum,row)=>sum+row.credits,0),30);
 assert.equal(requirements.length,40);assert.equal(ids.size,40);assert.equal(new Set(requirements.map(row=>row.code||row.options[0].code)).size,40);
 for(const row of requirements)for(const id of row.prerequisites||[])assert(ids.has(id),'A prerequisite is missing from the named ledger');
 const modelId='curriculum-tesu-ba-psychology',routeId='tesu-ba-psychology',catalog='Current undergraduate catalog · checked November 18, 2026';
 const catalogIdentity={kind:'reviewed-current-catalog',label:catalog,sourceUrl:sources.get(sid).url,checkedOn:facts.checkedOn};
 const section=(id,title,rows,parentId)=>({id,title,parentId,requirementIds:rows.map(row=>row.id),sourceId:sid});
 const evidence=(value,sourceIds,scope)=>({value,creditSystem:'semester',sourceIds,scope});
 const model={id:modelId,routeIds:[routeId],school:facts.school,title:degree.title,level:'bachelor',format:'Online',modalities:['online'],catalog,catalogYear:null,catalogIdentity,creditSystem:'semester',totalCredits:120,
  defaultProviders:['Sophia','Study.com','CLEP','StraighterLine'],institutionMinCredits:p.institutionMinCredits,externalMaxCredits:p.externalMaxCreditsDerived,alternativeMaxCredits:p.alternativeMaxCredits,upperMinCredits:p.areaOfStudyUpperMinCredits,majorMinInstitutionCredits:0,upperGroupMinimums:[{group:'area-of-study',credits:p.areaOfStudyUpperMinCredits}],requirements,sources:[...sources.values()],coverage:'complete',completeExecutablePathway:false,
  coverageLabel:'Complete 120-credit Psychology ledger with named course choices and separately sourced TESU transfer candidates.',
  curriculumSections:[section('tesu-psychology-intellectual','Intellectual and Practical Skills',general.slice(0,5),'general'),section('tesu-psychology-civic','Civic and Global Leadership',general.slice(5,8),'general'),section('tesu-psychology-cultures','Knowledge of Human Cultures',general.slice(8,13),'general'),section('tesu-psychology-scientific','Scientific Knowledge',general.slice(13),'general'),section('tesu-psychology-required','Required Psychology Courses',required,'major'),section('tesu-psychology-social-selection','Social Psychology Selection',socialPsychology,'major'),section('tesu-psychology-psych-electives','Psychology Electives',psychologyElectives,'major'),section('tesu-psychology-social-science','Social Science Electives',socialScience,'major'),section('tesu-psychology-capstone','Liberal Arts Capstone',capstone,'major'),section('tesu-psychology-free','Free Electives',free,'elective')],
  tuitionComparison:{entryId:'tesu-standard',sourceUrl:sources.get('tesu-psychology-tuition-2026-11-18').url,checkedOn:facts.checkedOn,catalogIdentity:clone(catalogIdentity),modelId},
  policyEvidence:{institutionMinCredits:evidence(p.institutionMinCredits,['tesu-psychology-residency-2026-11-18'],'Standard nonmilitary eligible-course residency; TECEP examinations do not replace the academic course-residency requirement.'),externalMaxCredits:{...evidence(p.externalMaxCreditsDerived,[sid,'tesu-psychology-residency-2026-11-18'],'Derived outside-credit bound for this standard residency scenario, separate from actual course placements.'),calculation:'120 degree credits minus 15 institutional course-residency credits.'},alternativeMaxCredits:evidence(p.alternativeMaxCredits,['tesu-psychology-alternative-cap-2026-11-18',transfer],'Combined noncollegiate-credit ceiling; not a separate allowance for each provider.'),upperMinCredits:evidence(p.areaOfStudyUpperMinCredits,[sid,policy],'At least 18 upper-level credits within the 45-credit Psychology area of study, including its capstone.')},
  policySourceIds:[sid,policy,'tesu-psychology-residency-2026-11-18','tesu-psychology-alternative-cap-2026-11-18',transfer],
  gradePolicy:{minimumGrade:'C',scope:'composition-and-area-of-study',sourceIds:[transfer,grades],checked:facts.checkedOn,detail:'C or better in English composition and all Psychology area-of-study courses; unrelated general education and electives retain their own rules.'},
  graduationRequirements:[{id:'gpa',title:'Overall GPA',description:'At least 2.0 overall GPA.',sourceIds:[grades]}],
  transferPolicyReview:{checked:facts.checkedOn,alternativeMaxCredits:90,duplicatesCountOnce:true,requiredInstitutionalCourses:p.requiredInstitutionalCourses,sourceIds:[transfer,'tesu-psychology-alternative-cap-2026-11-18'],residencyNote:'Standard nonmilitary 15-credit academic residency remains separate from the university-only information literacy and capstone courses; military, foreign-credit and Edison Accelerate scenarios require their own applicable policy.'},
  rulesNotes:[...facts.notes,'The selected 45-credit area of study includes its capstone; upper-level free electives cannot replace the 18 upper-level area-of-study credits.','C or better is scoped to English composition and the area of study. Formal prerequisites PSY-1010 → PSY-3500 and MAT-1210 → STA-2010 are distinct from advisory background knowledge.','LIB-4960 is taken near completion under the published advisory, with no fabricated completed-credit threshold.','The standard 15-credit nonmilitary academic residency and separate 90-credit alternative-source maximum are retained. This does not represent a fully researched 105-credit outside basket.','This BA degree is not represented as a clinical psychologist license or a professional-practice qualification.'],
  pricingNotes:['Published tuition is an estimate basis; applicable fees, provider subscriptions, books and individual course availability remain separate.'],
  unresolved:[]};
 const route={id:routeId,school:facts.school,schoolId:'tesu',title:degree.title,level:'bachelor',modalities:['online'],field:'social-science',fields:['social-science'],goals:['any-degree','career-growth','change-career'],paceModel:'course-term',url:sources.get(sid).url,sourceId:sid,degreeCredits:120,creditUnit:'semester',status:'listed',checkedOn:facts.checkedOn};
 return{version:1,checkedOn:facts.checkedOn,routes:[route],models:[model]};
}
export async function run({check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 const result=buildTESUPsychology(await read(factsPath),await read('dist/data/tesu.json'));
 if(!check)throw Error('Retired: TESU publishes '+outputPath+' from content/pathway-kits/tesu (npm run factory:publish).');assertKitLedger(await read(outputPath),result,'TESU Psychology');
 return{model:result.models[0].id,requirements:result.models[0].requirements.length,credits:result.models[0].totalCredits,newProviderEquivalencies:0,check};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run({check:process.argv.includes('--check')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
