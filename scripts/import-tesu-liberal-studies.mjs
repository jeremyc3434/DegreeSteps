/* RETIRED as a TESU source of truth (2026-11-20). TESU curricula now compile from content/pathway-kits/tesu via
 * `npm run factory:publish`; its invariants live in content/pathway-kits/tesu/guards.mjs. The builder below is kept as a
 * cross-check: `--check` proves the kit-published document still carries this reviewed ledger (scripts/tesu-kit-ledger-check.mjs).
 * Running it without --check no longer writes content/curricula. */
/* General Liberal Studies capacity remains flexible; named options are selections. */
import assert from 'node:assert/strict';
import {assertKitLedger} from './tesu-kit-ledger-check.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTESUPsychology} from './import-tesu-psychology.mjs';
const root=resolve(import.meta.dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
export const factsPath='content/curricula/snapshots/tesu/liberal-studies-current-2026-11-18-reviewed.json',outputPath='content/curricula/tesu-liberal-studies.json';
const sid='tesu-liberal-studies-current-2026-11-18',taxonomyId='tesu-liberal-studies-taxonomy-2026-11-18';
const key=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function buildTESULiberalStudies(facts,psychologyFacts,baseline){
 assert.equal(facts.version,1);assert.equal(facts.checkedOn,'2026-11-18');assert.equal(facts.school,'Thomas Edison State University');assert.equal(facts.degree.totalCredits,120);
 assert.equal(facts.degree.generalCredits+facts.degree.areaOfStudyCredits+facts.degree.freeElectiveCredits,120);
 const common=buildTESUPsychology(psychologyFacts,baseline).models[0],sources=new Map(common.sources.map(source=>[source.id,clone(source)]));
 for(const source of facts.sources)sources.set(source.id,clone(source));
 const replaceSourceIds=ids=>(ids||[]).map(id=>id==='tesu-psychology-current-2026-11-18'?sid:id);
 function commonRow(original){const row=clone(original);row.sourceIds=replaceSourceIds(row.sourceIds);for(const option of row.options)option.sourceIds=replaceSourceIds(option.sourceIds);return row;}
 const general=common.requirements.filter(row=>row.category==='general').map(commonRow),free=common.requirements.filter(row=>row.freeElective).map(commonRow);
 const historySource='tesu-his1210-current-2026-11-17',history=free.find(row=>row.options.some(option=>option.provider==='University'&&option.code==='HIS-1210')).options.find(option=>option.provider==='University');
 const culture=general.findIndex(row=>row.code==='PHI-1300');assert(culture>=0&&sources.has(historySource));
 general[culture]={id:'his1210',code:'HIS-1210',title:'Introduction to World History I',credits:3,category:'general',group:'human-cultures',subgroup:'human-cultures',upper:false,sourceIds:[sid,historySource],options:[{...clone(history),id:'university-his1210',sourceIds:[sid,historySource]}]};
 const freeHistory=free.findIndex(row=>row.options.some(option=>option.provider==='University'&&option.code==='HIS-1210')),micro=psychologyFacts.courses['ECO-1120'];assert(freeHistory>=0&&sources.has(micro.sourceId)&&micro.prerequisites.length===0);
 free[freeHistory]={id:'free-eco1120',title:'Free elective '+(freeHistory+1),credits:3,category:'electives',group:'free-electives',subgroup:'free-electives',upper:false,freeElective:true,excludeAlreadyUsed:true,sourceIds:[sid,micro.sourceId],options:[{id:'university-free-eco1120',provider:'University',code:'ECO-1120',title:micro.title,credits:3,upper:false,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:[sid,micro.sourceId]}],notes:'Proposed named unrestricted free-elective choice; Microeconomics may be replaced by another eligible nonduplicating course.'};
 assert.equal(general.length,15);assert.equal(free.length,10);assert.deepEqual(general.map(row=>row.code),facts.degree.generalFeaturedCodes);
 const fixedCodes=new Set([...general.map(row=>key(row.code)),key(facts.degree.capstone[0])]);
 const eligiblePrefixes=new Set(facts.taxonomy.allowedCoursePrefixes),exceptions=new Set(facts.taxonomy.allowedReceivingCodeExceptions.map(key));
 assert(!['ACC','BUS','CIS','FIN','LAW','MAN','MKT'].some(prefix=>eligiblePrefixes.has(prefix)),'Applied prefixes need exact reviewed exceptions, not blanket eligibility');
 const sharedExceptions=[];
 for(const requirement of baseline.requirements)for(const original of requirement.options||[]){
  if(original.provider==='University')continue;
  const receiving=String(original.receivingCode||requirement.code||'').match(/^([A-Za-z]+)[\s-]*(\d+)$/);
  if(!receiving||!exceptions.has(key(original.receivingCode||requirement.code))||original.credits!==3)continue;
  if(sharedExceptions.some(option=>option.id===original.id))continue;
  const option=clone(original);option.receivingCode=original.receivingCode||requirement.code;option.creditSystem=option.creditSystem||baseline.creditSystem;option.evidence='conditional';option.placementType='elective';option.sourceIds=[...new Set([...(option.sourceIds||[]),sid,taxonomyId])];
  option.conditions=[...(option.conditions||[]),'Proposed Liberal Studies allocation: the exact TESU receiving course is listed in the university’s liberal-arts/general-education discipline taxonomy. Original provider, version and personal evaluation conditions still apply; this is not a new receiving-course equivalency.'];
  for(const sourceId of [...(original.sourceIds||[]),...(original.identitySourceIds||[]),...(original.prerequisiteSourceIds||[])]){const source=baseline.sources.find(source=>source.id===sourceId);assert(source,'A reused award lost its original evidence');sources.set(sourceId,clone(source));}
  sharedExceptions.push(option);
 }
 const slots=facts.degree.slotFallbacks.map((selection,index)=>{
  const fact=facts.courses[selection.code];assert(fact&&fact.credits===3&&fact.prerequisites.length===0&&sources.has(fact.sourceId),'Fallbacks must have independently reviewed course identities without a formal dependency');
  const [,prefix,number]=selection.code.match(/^([A-Z]+)-(\d{4})$/);assert(eligiblePrefixes.has(prefix)&&Number(number)>=selection.minimumCourseLevel&&!fixedCodes.has(key(selection.code)));
  const upperOnly=selection.minimumCourseLevel>=3000,sourceIds=[sid,taxonomyId,fact.sourceId];
  const university={id:'university-'+selection.id,provider:'University',code:selection.code,title:fact.title,credits:3,upper:fact.upper,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:[...sourceIds],url:sources.get(fact.sourceId).url};
  const options=[university,...sharedExceptions.filter(option=>Number(String(option.receivingCode).match(/\d+/)[0])>=selection.minimumCourseLevel&&(!upperOnly||option.upper)) .map(clone)];
  return{id:selection.id,title:index<2?'Liberal studies course — introductory or above '+(index+1):index<9?'Liberal studies course — 2000 level or above '+(index-1):'Upper-level liberal studies course '+(index-8),credits:3,category:'major',group:'area-of-study',subgroup:'area-of-study',minCourseLevel:selection.minimumCourseLevel,maxCourseLevel:4999,upperOnly,upper:upperOnly,allowedCoursePrefixes:[...eligiblePrefixes],allowedReceivingCodeExceptions:[...facts.taxonomy.allowedReceivingCodeExceptions],sourceIds,options,minimumGrade:'C',minimumGradeSourceIds:[...common.gradePolicy.sourceIds],choiceNote:'Proposed named university fallback: '+selection.code+' '+fact.title+'. The requirement is flexible liberal-arts capacity, not a mandatory course code.',...(fact.advisory?{prerequisiteNotes:fact.advisory}:{}),liberalArtsAllocation:true};
 });
 assert.equal(slots.length,14);assert.equal(slots.filter(row=>row.minCourseLevel===1000).length,2);assert.equal(slots.filter(row=>row.upperOnly).length,5);
 const capstoneFact=facts.courses['LIB-4950'],capstone={id:'lib4950',code:'LIB-4950',title:capstoneFact.title,credits:3,category:'major',group:'area-of-study',subgroup:'area-of-study',upper:true,institutionalOnly:true,minimumGrade:'C',minimumGradeSourceIds:[...common.gradePolicy.sourceIds],sourceIds:[sid,capstoneFact.sourceId],prerequisiteNotes:capstoneFact.advisory,options:[{id:'university-lib4950',provider:'University',code:'LIB-4950',title:capstoneFact.title,credits:3,upper:true,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:[sid,capstoneFact.sourceId]}]};
 const modelId='curriculum-tesu-ba-liberal-studies',routeId='tesu-ba-liberal-studies',catalog='Current undergraduate catalog · checked November 18, 2026',catalogIdentity={kind:'reviewed-current-catalog',label:catalog,sourceUrl:sources.get(sid).url,checkedOn:facts.checkedOn};
 const requirements=[...general,...slots,capstone,...free];assert.equal(requirements.length,40);assert.equal(requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(new Set(requirements.map(row=>row.code||row.options.find(option=>option.provider==='University').code)).size,40);
 const model={...clone(common),id:modelId,routeIds:[routeId],title:facts.degree.title,catalog,catalogYear:null,catalogIdentity,requirements,sources:[...sources.values()],upperGroupMinimums:[{group:'area-of-study',credits:18}],coverageLabel:'Complete proposed Liberal Studies general-option ledger with flexible, discipline- and level-restricted allocations.',
  tuitionComparison:{...clone(common.tuitionComparison),modelId,catalogIdentity:clone(catalogIdentity)},
  liberalArtsAllocation:{kind:'tesu-liberal-studies-option-a',sourceIds:[sid,taxonomyId],requirementIds:slots.map(row=>row.id),capstoneRequirementId:capstone.id,minimumSubjects:2,maximum1000Credits:6,subjectByPrefix:clone(facts.taxonomy.subjectByPrefix),subjectByReceivingCode:clone(facts.taxonomy.subjectByReceivingCode)},
  curriculumSections:[...common.curriculumSections.filter(section=>section.parentId==='general').map(section=>({...clone(section),id:section.id.replace('psychology','liberal-studies'),sourceId:sid})),{id:'bals-liberal-studies',title:'Liberal Studies — General Option A',parentId:'major',requirementIds:slots.map(row=>row.id),sourceId:sid},{id:'bals-capstone',title:'Liberal Arts Capstone',parentId:'major',requirementIds:[capstone.id],sourceId:sid},{id:'bals-free',title:'Free Electives',parentId:'elective',requirementIds:free.map(row=>row.id),sourceId:sid}],
  gradePolicy:{...clone(common.gradePolicy),detail:'C or better in English composition and Liberal Studies area-of-study allocations; unrelated general education and free electives retain their own rules.'},
  transferPolicyReview:{...clone(common.transferPolicyReview),requiredInstitutionalCourses:['SOS-1100','LIB-4950']},
  policySourceIds:replaceSourceIds(common.policySourceIds),
  policyEvidence:{...clone(common.policyEvidence),externalMaxCredits:{...clone(common.policyEvidence.externalMaxCredits),sourceIds:replaceSourceIds(common.policyEvidence.externalMaxCredits.sourceIds)},upperMinCredits:{value:18,creditSystem:'semester',sourceIds:[sid,'tesu-psychology-degree-policy-2026-11-18'],scope:'At least 18 upper-level credits within the Liberal Studies area of study, including the three-credit capstone; the other 42 credits include at least 15 upper-level credits.'}},
  rulesNotes:[...facts.notes,'The two introductory-capacity positions limit 1000-level AOS allocation to six credits. The five upper-level positions plus capstone supply at least eighteen upper credits; other AOS positions may also use upper-level courses.','A course applies once. Courses already used in general education or the capstone cannot also fill liberal-studies capacity.','Traditional liberal-arts course families are eligible; professional course families are not blanket eligible. Only specifically source-listed MAN, BUS and CIS course exceptions are proposed where their receiving level fits the position.','This general Option A does not claim a concentration or professional license.'],unresolved:[]};
 delete model.existingCreditReview;
 const route={id:routeId,title:model.title,school:model.school,schoolId:'tesu',level:'bachelor',modalities:['online'],field:'general',fields:['general','humanities','social-science'],goals:['any-degree','career-growth','change-career'],paceModel:'course-term',url:sources.get(sid).url,degreeCredits:120,creditUnit:'semester',status:'listed',checkedOn:facts.checkedOn};
 return{version:1,checkedOn:facts.checkedOn,routes:[route],models:[model]};
}
export async function run({check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 const result=buildTESULiberalStudies(await read(factsPath),await read('content/curricula/snapshots/tesu/psychology-current-2026-11-18-reviewed.json'),await read('dist/data/tesu.json'));
 if(!check)throw Error('Retired: TESU publishes '+outputPath+' from content/pathway-kits/tesu (npm run factory:publish).');assertKitLedger(await read(outputPath),result,'TESU Liberal Studies');
 return{model:result.models[0].id,requirements:40,credits:120,newProviderEquivalencies:0,check};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run({check:process.argv.includes('--check')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
