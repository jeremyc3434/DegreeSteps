/* Published English allocations with editable named subject choices. No outside
 * equivalency is inferred from an English title or another degree's approval. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
export const factsPath='content/curricula/snapshots/tesu/english-current-2026-11-18-reviewed.json';
export const outputPath='content/curricula/tesu-english.json';
const rid=code=>code.toLowerCase().replace(/-/g,'');
const sid='tesu-english-current-2026-11-18',policy='tesu-english-degree-policy-2026-11-18',transfer='tesu-english-transfer-2026-11-18',grades='tesu-english-grades-2026-11-18';
export function buildTESUEnglish(facts,baseline){
 assert.equal(facts.version,1);assert.equal(facts.checkedOn,'2026-11-18');assert.equal(facts.school,'Thomas Edison State University');assert.equal(baseline.id,'tesu-general-management');
 const d=facts.degree,p=facts.policies,byCode=new Map(baseline.requirements.filter(row=>row.code).map(row=>[row.code,row]));
 assert.equal(d.generalCredits+d.areaOfStudyCredits+d.freeElectiveCredits,120);assert.equal(d.requiredCourses.length,4);assert.equal(d.englishElectiveSelections.length,6);assert.equal(d.humanitiesSelections.length,4);assert.equal(d.selectedFreeElectives.length,10);
 const sources=new Map(facts.sources.map(source=>[source.id,clone(source)]));
 function copySource(id){const source=baseline.sources.find(source=>source.id===id);assert(source,'Missing common TESU source '+id);sources.set(id,clone(source));}
 function university(row,code=row.code){const fact=facts.courses[code],sourceIds=[...new Set([...row.sourceIds,...(fact?[fact.sourceId]:[])])];return{id:'university-'+rid(code),provider:'University',code,title:fact?.title||row.title,credits:row.credits,upper:fact?.upper??row.upper,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds};}
 function course([code,title,credits],category,block){
  const f=facts.courses[code];assert(f&&f.title===title&&f.credits===credits&&f.deliveryMethods.includes('Online')&&!f.tecepOnly,'Use the exact reviewed online course '+code);
  const row={id:rid(code),code,title,credits,category,group:category==='general'?'general': 'area-of-study',subgroup:category==='general'?'general':'area-of-study',curriculumBlock:block,upper:f.upper,institutionalOnly:code==='LIB-4950',sourceIds:[sid,f.sourceId],options:[]};
  if(category==='major'){row.minimumGrade='C';row.minimumGradeSourceIds=[transfer,grades];}
  if(f.prerequisites.length){row.prerequisites=f.prerequisites.map(rid);row.prerequisiteSourceIds=[f.sourceId];}
  if(f.advisory){row.prerequisiteNotes=f.advisory;row.prerequisiteSourceIds=[f.sourceId];}
  row.options=[university(row)];return row;
 }
 const general=d.generalFeaturedCodes.map(code=>{
  if(facts.courses[code])return course([code,facts.courses[code].title,3],'general','general-education');
  const old=byCode.get(code);assert(old&&old.credits===3,'Missing reviewed featured course '+code);const row=clone(old);row.sourceIds=[sid];row.options=[];
  if(row.minimumGrade){row.minimumGradeSourceIds=[transfer,grades];row.gradePolicyNote='C minimum applies to English composition, separate from other general education.';}
  for(const id of row.prerequisiteSourceIds||[])copySource(id);row.options=[university(row)];return row;
 });
 const required=d.requiredCourses.map(value=>course(value,'major','required-english'));
 const english=d.englishElectiveSelections.map(value=>{
  const row=course(value,'major','english-electives');assert(/^(ENG|LIT)-/.test(row.code));
  row.choiceNote='Proposed editable English-subject course within the published 18-credit English-elective allowance; not an additional required course or a six-course university mandate.';
  row.proposedSelection={requirement:'English electives',credits:18,discipline:'English / Literature',sourceIds:[sid,row.sourceIds[1]]};
  if(row.code==='ENG-2010'){
   row.allowedCourseCodes=[...d.technicalWritingAlternatives];row.options=d.technicalWritingAlternatives.map(code=>university(row,code));
   for(const option of row.options)option.conditions=['Choose either ENG-2010 or ENG-2020. TESU does not award credit for both courses.'];
  }
  return row;
 });
 const humanities=d.humanitiesSelections.map(value=>{
  const [code,title,credits]=value;
  let row;
  if(facts.courses[code])row=course(value,'major','humanities-electives');
  else{
   const sourceId=code==='ART-1000'?'tesu-art1000-current-2026-11-17':'tesu-psychology-hum1030-2026-11-18';if(!sources.has(sourceId))copySource(sourceId);
   row={id:rid(code),code,title,credits,category:'major',group:'area-of-study',subgroup:'area-of-study',curriculumBlock:'humanities-electives',upper:false,sourceIds:[sid,sourceId],minimumGrade:'C',minimumGradeSourceIds:[transfer,grades],options:[]};row.options=[university(row)];
  }
  row.sourceIds.push('tesu-english-humanities-selection-2026-11-18');row.options.forEach(option=>option.sourceIds=[...new Set([...option.sourceIds,'tesu-english-humanities-selection-2026-11-18'])]);
  row.choiceNote='Proposed named course from the university-published Humanities disciplines list; allocated once within the 12-credit Humanities block.';return row;
 });
 const capstone=[course(d.capstone,'major','capstone')],area=[...required,...english,...humanities,...capstone];
 const free=d.selectedFreeElectives.map(([code,title,credits],index)=>{
  const original=byCode.get(code),special={'ANT-1010':'tesu-ant1010-current-2026-11-17','HIS-1210':'tesu-his1210-current-2026-11-17','BUS-1010':'tesu-accounting-bus1010-2026-11-18','ACC-1010':'tesu-psychology-acc1010-2026-11-18','PSY-1010':'tesu-psychology-course-psy1010-2026-11-18','ECO-1110':'tesu-psychology-course-eco1110-2026-11-18'},sourceId=special[code]||'tesu-gm-current-program-2026-11-17';
  assert(original||special[code]);if(original)assert.equal(original.title,title);if(!sources.has(sourceId))copySource(sourceId);
  const id='free-'+rid(code),sourceIds=[sid,sourceId];return{id,title:'Free elective '+(index+1),credits,category:'electives',group:'free-electives',subgroup:'free-electives',upper:false,freeElective:true,excludeAlreadyUsed:true,sourceIds,options:[{id:'university-'+id,provider:'University',code,title,credits,upper:false,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:[...sourceIds],url:sources.get(sourceId).url}],notes:'Named unrestricted university choice: '+code+' '+title+'. This capacity can use another eligible nonduplicating course.',...(code==='ACC-1010'?{prerequisiteNotes:'Working knowledge of Excel is advised; no formal prerequisite course is added.',prerequisiteSourceIds:[sourceId]}:{})};
 });
 const requirements=[...general,...area,...free],ids=new Set(requirements.map(row=>row.id));
 assert.equal(requirements.length,40);assert.equal(ids.size,40);assert.equal(requirements.reduce((n,row)=>n+row.credits,0),120);assert.equal(new Set(requirements.map(row=>row.code||row.options[0].code)).size,40);
 for(const row of requirements)for(const id of row.prerequisites||[])assert(ids.has(id),'A formal prerequisite is absent');
 assert.equal(area.reduce((n,row)=>n+row.credits,0),45);assert(area.filter(row=>row.upper).reduce((n,row)=>n+row.credits,0)>=18);
 const modelId='curriculum-tesu-ba-english',routeId='tesu-ba-english',catalog='Current undergraduate catalog · checked November 18, 2026',catalogIdentity={kind:'reviewed-current-catalog',label:catalog,sourceUrl:sources.get(sid).url,checkedOn:facts.checkedOn};
 const section=(id,title,rows,parentId)=>({id,title,parentId,requirementIds:rows.map(row=>row.id),sourceId:sid});
 const evidence=(value,sourceIds,scope)=>({value,creditSystem:'semester',sourceIds,scope});
 const model={id:modelId,routeIds:[routeId],school:facts.school,title:d.title,level:'bachelor',format:'Online',modalities:['online'],catalog,catalogYear:null,catalogIdentity,creditSystem:'semester',totalCredits:120,defaultProviders:['Sophia','Study.com','CLEP','StraighterLine'],institutionMinCredits:15,externalMaxCredits:105,alternativeMaxCredits:90,upperMinCredits:18,majorMinInstitutionCredits:0,upperGroupMinimums:[{group:'area-of-study',credits:18}],requirements,sources:[...sources.values()],coverage:'complete',completeExecutablePathway:false,coverageLabel:'Complete 120-credit English ledger with proposed named subject choices and separately sourced transfer candidates.',
  curriculumSections:[section('english-general-skills','Intellectual and Practical Skills',general.slice(0,5),'general'),section('english-general-civic','Civic and Global Leadership',general.slice(5,8),'general'),section('english-general-cultures','Knowledge of Human Cultures',general.slice(8,13),'general'),section('english-general-science','Scientific Knowledge',general.slice(13),'general'),section('english-required','Required English Courses',required,'major'),section('english-subject-electives','English Electives — proposed choices',english,'major'),section('english-humanities','Humanities Electives — proposed choices',humanities,'major'),section('english-capstone','Humanities Capstone',capstone,'major'),section('english-free','Free Electives',free,'elective')],
  tuitionComparison:{entryId:'tesu-standard',sourceUrl:sources.get('tesu-english-tuition-2026-11-18').url,checkedOn:facts.checkedOn,catalogIdentity:clone(catalogIdentity),modelId},
  policyEvidence:{institutionMinCredits:evidence(15,['tesu-english-residency-2026-11-18'],'Standard nonmilitary eligible-course residency.'),externalMaxCredits:{...evidence(105,[sid,'tesu-english-residency-2026-11-18'],'Derived selected residency bound, not a guaranteed outside basket.'),calculation:'120 degree credits minus 15 university course-residency credits.'},alternativeMaxCredits:evidence(90,['tesu-english-alternative-cap-2026-11-18',transfer],'Combined noncollegiate-source ceiling.'),upperMinCredits:evidence(18,[sid,policy],'Eighteen upper-level credits inside the English area of study, including its capstone.')},policySourceIds:[sid,policy,'tesu-english-residency-2026-11-18','tesu-english-alternative-cap-2026-11-18',transfer],
  gradePolicy:{minimumGrade:'C',scope:'composition-and-area-of-study',sourceIds:[transfer,grades],checked:facts.checkedOn,detail:'C or better in composition and the English area of study; unrelated general education and free electives retain their applicable rules.'},
  graduationRequirements:[{id:'gpa',title:'Overall GPA',description:'At least 2.0 overall GPA.',sourceIds:[grades]}],
  transferPolicyReview:{checked:facts.checkedOn,alternativeMaxCredits:90,duplicatesCountOnce:true,requiredInstitutionalCourses:p.requiredInstitutionalCourses,sourceIds:[transfer,'tesu-english-alternative-cap-2026-11-18'],residencyNote:'The standard 15-credit eligible-course residency remains separate from university-only SOS-1100 and LIB-4950; military and Edison Accelerate use their own policies.'},
  courseCreditExclusions:[{codes:['ENG-2010','ENG-2020'],sourceIds:[facts.courses['ENG-2010'].sourceId,facts.courses['ENG-2020'].sourceId],notes:'TESU does not award credit for both technical-writing courses. The English choice row permits either; their identities are not aliases.'}],
  rulesNotes:[...facts.notes,'The 18 upper-level area-of-study credits cannot be replaced by upper-level free electives.','The formal ENC-1020 prerequisites for LIT-4600, LIT-3010, LIT-3020 and LIT-3310 are separate from advisory composition and literature background.','LIT-2910 is retained at its published 2000-level code; its advisory wording does not establish a 3000-level credit award.','LIB-4950 has a near-completion advisory, without an invented numeric prerequisite.','The standard 15-credit residency, derived 105-credit outside ceiling and 90-credit combined alternative ceiling are separate.','A business-specific course-age policy is not copied into this B.A. English plan.'],pricingNotes:['Published standard tuition is a provisional planning basis; provider subscriptions, books and applicable fees are separate.'],unresolved:[]};
 const route={id:routeId,title:d.title,school:facts.school,schoolId:'tesu',level:'bachelor',modalities:['online'],field:'humanities',fields:['humanities'],goals:['any-degree','career-growth','change-career'],paceModel:'course-term',url:sources.get(sid).url,sourceId:sid,degreeCredits:120,creditUnit:'semester',status:'listed',checkedOn:facts.checkedOn};
 return{version:1,checkedOn:facts.checkedOn,routes:[route],models:[model]};
}
export async function run({check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8')),result=buildTESUEnglish(await read(factsPath),await read('dist/data/tesu.json'));
 if(check)assert.deepEqual(await read(outputPath),result,'Regenerate the reviewed TESU English source');else await writeFile(resolve(root,outputPath),JSON.stringify(result,null,2)+'\n');
 return{model:result.models[0].id,requirements:40,credits:120,newProviderEquivalencies:0,check};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run({check:process.argv.includes('--check')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
