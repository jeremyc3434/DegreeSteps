/* Compile the exact current Accounting ledger. Transfer awards are attached by
 * the shared registry using school/receiving-code evidence, never by degree title. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..');
export const factsPath='content/curricula/snapshots/tesu/accounting-current-2026-11-18-reviewed.json';
export const outputPath='content/curricula/tesu-accounting.json';
const clone=value=>JSON.parse(JSON.stringify(value));
const rid=code=>code.toLowerCase().replace(/-/g,'');
const sid='tesu-accounting-current-2026-11-18',policy='tesu-accounting-business-policy-2026-11-18';
const transfer='tesu-accounting-transfer-2026-11-18',grades='tesu-accounting-grades-2026-11-18';
export function buildTESUAccounting(facts,baseline){
 assert.equal(facts.version,1);assert.equal(facts.checkedOn,'2026-11-18');
 assert.equal(baseline.id,'tesu-general-management');
 const degree=facts.degree,p=facts.policies,byCode=new Map(baseline.requirements.map(row=>[row.code,row]));
 const modelId='curriculum-tesu-bsba-accounting',routeId='tesu-bsba-accounting';
 assert.equal(degree.generalCredits+degree.businessCoreCredits+degree.areaOfStudyCredits+degree.freeElectiveCredits,degree.totalCredits);
 assert.equal(new Set(degree.selectedAccounting).size,degree.additionalSelectionCount);
 assert(degree.selectedAccounting.every(code=>degree.additionalAccounting.some(course=>course[0]===code)));
 const oldSources=new Map(baseline.sources.map(source=>[source.id,source]));
 const sources=new Map(facts.sources.map(source=>[source.id,clone(source)]));
 const copySource=id=>{assert(oldSources.has(id),'Missing inherited source '+id);sources.set(id,clone(oldSources.get(id)));};
 function commonRow(code){
  const original=byCode.get(code);assert(original,'Missing independently checked common course '+code);assert.equal(original.credits,3);
  const row=clone(original);row.options=[];row.sourceIds=[sid];
  if(row.minimumGrade){row.minimumGradeSourceIds=[transfer,grades,policy];row.gradePolicyNote='C or better in composition, Professional Business Requirements and the Accounting area of study; other general education and electives retain their applicable grade rules.';}
  for(const id of row.prerequisiteSourceIds||[])copySource(id);
  return row;
 }
 const general=degree.generalFeaturedCodes.map(commonRow),core=degree.businessCoreCodes.map(commonRow);
 assert.equal(general.reduce((sum,row)=>sum+row.credits,0),45);assert.equal(core.reduce((sum,row)=>sum+row.credits,0),42);
 const allAccounting=new Map([...degree.requiredAccounting,...degree.additionalAccounting].map(course=>[course[0],course]));
 const accounting=[...degree.requiredAccounting.map(course=>course[0]),...degree.selectedAccounting].map(code=>{
  const fact=facts.courses[code],[,title,credits]=allAccounting.get(code),sourceId='tesu-accounting-'+rid(code)+'-2026-11-18';
  assert(fact&&sources.has(sourceId));
  return {id:rid(code),code,title,credits,category:'major',group:'area-study',subgroup:'area-of-study',upper:fact.upper,
   institutionalOnly:false,sourceIds:[sid,sourceId],options:[],minimumGrade:'C',minimumGradeSourceIds:[transfer,grades],
   ...(fact.prerequisites.length?{prerequisites:fact.prerequisites.map(rid),prerequisiteSourceIds:[sourceId]}:{}),
   ...(fact.advisoryCodes?{prerequisiteNotes:'Advisory knowledge: '+fact.advisoryCodes.join(', ')+'. This is distinct from a formal prerequisite. Microsoft Excel knowledge is expected.',prerequisiteSourceIds:[sourceId]}:{}),
   ...(!degree.requiredAccounting.some(course=>course[0]===code)?{notes:'Selected course from the published four-of-five additional Accounting list; this baseline does not claim that every listed alternative is mandatory.'}:{})};
 });
 const free=degree.selectedFreeElectives.map(([code,title,credits],index)=>{
  const originalId=code==='BUS-1010'?'tesu-accounting-bus1010-2026-11-18':({
   'ART-1000':'tesu-art1000-current-2026-11-17','ANT-1010':'tesu-ant1010-current-2026-11-17','PSY-1010':'tesu-psy1010-current-2026-11-17','HIS-1210':'tesu-his1210-current-2026-11-17'
  })[code];
  if(!sources.has(originalId))copySource(originalId);
  const id='free-'+rid(code),sourceIds=[sid,policy,originalId];
  return {id,title:'Free elective '+(index+1),credits,category:'elective',group:'free-electives',subgroup:'free-electives',upper:false,freeElective:true,excludeAlreadyUsed:true,sourceIds,options:[{id:'university-'+id,provider:'University',code,title,credits,upper:false,creditSystem:'semester',creditOrigin:'institutional',sourceIds:[...sourceIds],evidence:'published',url:sources.get(originalId).url}],notes:'Named nonduplicating university choice: '+code+' '+title+'. This is unrestricted free-elective capacity, not a requirement to transfer this exact course. A different permitted course may better fit existing records.'};
 });
 const requirements=[...general,...core,...accounting,...free];
 assert.equal(requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(requirements.length,40);
 assert.equal(new Set(requirements.map(row=>row.code||row.options.find(option=>option.provider==='University')?.code)).size,40);
 const ids=new Set(requirements.map(row=>row.id));for(const row of requirements)for(const prerequisite of row.prerequisites||[])assert(ids.has(prerequisite),'Missing prerequisite '+prerequisite);
 const catalog='Current undergraduate catalog · checked November 18, 2026';
 const catalogIdentity={kind:'reviewed-current-catalog',label:catalog,sourceUrl:sources.get(sid).url,checkedOn:facts.checkedOn};
 const section=(id,title,rows,parentId)=>({id,title,parentId,requirementIds:rows.map(row=>row.id),sourceId:sid});
 const sections=[section('tesu-accounting-general-skills','Intellectual and Practical Skills',general.slice(0,5),'general'),section('tesu-accounting-general-civic','Civic and Global Leadership',general.slice(5,8),'general'),section('tesu-accounting-general-cultures','Knowledge of Human Cultures',general.slice(8,13),'general'),section('tesu-accounting-general-science','Scientific Knowledge',general.slice(13),'general'),section('tesu-accounting-business-core','Professional Business Requirements',core,'major'),section('tesu-accounting-required','Required Accounting Courses',accounting.slice(0,2),'major'),section('tesu-accounting-selected','Additional Accounting Courses — four selected',accounting.slice(2),'major'),section('tesu-accounting-free','Free Electives',free,'elective')];
 const evidence=(value,sourceIds,scope)=>({value,creditSystem:'semester',sourceIds,scope});
 const model={id:modelId,routeIds:[routeId],school:baseline.school,title:degree.title,level:'bachelor',format:'Online',modalities:['online'],defaultProviders:['Sophia','Study.com','CLEP','StraighterLine'],
  catalog,catalogYear:null,catalogIdentity,creditSystem:'semester',totalCredits:120,institutionMinCredits:p.institutionMinCredits,majorMinInstitutionCredits:0,externalMaxCredits:p.externalMaxCreditsDerived,alternativeMaxCredits:p.alternativeMaxCredits,upperMinCredits:p.upperMinCredits,
  upperGroupMinimums:[{group:'area-of-study',credits:12},{group:'business-core',credits:6}],
  existingCreditReview:{kind:'tesu-accounting-course-currency',sourceIds:[policy],groups:[
   {id:'accounting-area',title:'Accounting area of study',requirementIds:accounting.map(row=>row.id),maxAgeYears:10,maxOlderCredits:p.areaOfStudyCurrency.maximumCreditsOlderThanTenYears,totalCredits:degree.areaOfStudyCredits},
   {id:'business-capstone',title:'Business capstone',requirementIds:['bus4210'],maxAgeYears:p.capstoneMaximumAgeYears,maxOlderCredits:0,totalCredits:3}
  ]},
  requirements,sources:[...sources.values()],curriculumSections:sections,coverage:'complete',completeExecutablePathway:false,
  coverageLabel:'Complete 120-credit Accounting ledger with named course choices and source-linked transfer candidates.',
  tuitionComparison:{entryId:'tesu-standard',sourceUrl:sources.get('tesu-accounting-tuition-2026-11-18').url,checkedOn:facts.checkedOn,catalogIdentity:clone(catalogIdentity),modelId},
  policyEvidence:{institutionMinCredits:evidence(15,['tesu-accounting-residency-2026-11-18'],'Standard nonmilitary 15-credit AC, OL/NU, GS or e-Pack course-residency route.'),externalMaxCredits:{...evidence(105,[sid,'tesu-accounting-residency-2026-11-18'],'Derived bound for the selected standard-residency route, not a universal transfer guarantee.'),calculation:'120 degree credits minus 15 TESU course-residency credits.'},alternativeMaxCredits:evidence(90,['tesu-accounting-alternative-cap-2026-11-18',transfer],'Combined ACE/NCCRS, CLEP, DSST, AP, military/corporate training and other approved noncollegiate credit.'),upperMinCredits:evidence(18,[sid,policy],p.upperScope)},
  policySourceIds:[sid,policy,'tesu-accounting-residency-2026-11-18','tesu-accounting-alternative-cap-2026-11-18',transfer],
  gradePolicy:{minimumGrade:'C',scope:'composition-business-core-and-area-of-study',sourceIds:[transfer,grades,policy],checked:facts.checkedOn,detail:'Composition, Professional Business Requirements and Accounting area of study require C or better. Other general education and electives retain their applicable grade rules.'},
  transferPolicyReview:{checked:facts.checkedOn,alternativeMaxCredits:90,alternativeMaxScope:'Combined noncollegiate sources; not 90 credits per provider.',duplicatesCountOnce:true,requiredInstitutionalCourses:p.requiredInstitutionalCourses,sourceIds:[transfer,'tesu-accounting-alternative-cap-2026-11-18'],residencyNote:'Standard nonmilitary 15-credit eligible-course residency; exams alone do not fulfill it. Edison Accelerate and military alternatives are separate scenarios.'},
  graduationRequirements:[{id:'gpa',title:'Minimum overall GPA',description:'Maintain at least a 2.0 overall GPA and satisfy the applicable area-of-study and composition grade requirements.',sourceIds:[grades]}],
  rulesNotes:['45 general education + 42 Professional Business Requirements + 18 Accounting + 15 free electives = 120 semester credits.',p.upperScope,'The two required Accounting courses and four additional Accounting selections are allocated once. The fifth additional Accounting option, ACC-4110, is not an additional mandatory course.',p.licensureNote,'The general-education featured-course ledger retains HIS-1140 and PHI-1300 as the two allowed selected Human Cultures courses. No personal waiver is assumed.','The current catalog edition label was not exposed in the retrieved pages; the reviewed current-catalog identity is separate from dated tuition and provider evidence.','Standard residency and the combined alternative-source cap are separate. The 105 outside-credit bound is not a claim that 105 source-linked outside credits are available.','Source recommendation quantities, receiving-school quantities and personal approvals remain separate. Existing provider evidence retains its original dates and conditions.','At least half of the Accounting area of study must be current within ten years of the most recent application date; the business capstone has a five-year currency limit.'],
  unresolved:['Individual catalog eligibility, state CPA eligibility, course currency and registration availability depend on the student; this plan does not make a licensure or admissions decision.','Existing receiving-school transfer candidates retain their original provider/version/format restrictions. No additional provider award is inferred from a matching course title.','The standard nonmilitary residency route is modeled. Military enrollment, foreign-credit rules and Edison Accelerate require a separately evaluated scenario.','Published tuition is a planning basis; books, provider subscriptions and applicable fees are separate.']};
 const route={id:routeId,title:degree.title,school:baseline.school,schoolId:'tesu',level:'bachelor',modalities:['online'],paceModel:'course-term',url:sources.get(sid).url,sourceId:sid,degreeCredits:120,creditUnit:'semester',status:'listed',checkedOn:facts.checkedOn,notes:['Exact current 120-credit Accounting curriculum; distinct from the Accounting/CPA degree.']};
 return {version:1,checkedOn:facts.checkedOn,routes:[route],models:[model]};
}
export async function run({check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 const result=buildTESUAccounting(await read(factsPath),await read('dist/data/tesu.json'));
 if(check)assert.deepEqual(await read(outputPath),result,'TESU Accounting source model needs regeneration');else await writeFile(resolve(root,outputPath),JSON.stringify(result,null,2)+'\n');
 return {model:result.models[0].id,requirements:result.models[0].requirements.length,credits:result.models[0].totalCredits,newProviderEquivalencies:0,check};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run({check:process.argv.includes('--check')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
