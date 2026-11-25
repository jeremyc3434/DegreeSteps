/** Author the exact retained-UNIV online A.A. allocation from retained primary evidence. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadKit,kitsRoot,clone,sourceIndex,sourceRefs,stringifyKit} from './pathway-factory/lib.mjs';
import {stringifyProgram} from './pathway-factory/migrate-liberty.mjs';

export const reviewId='liberty-interdisciplinary-aa-retained-univ-baseline-2026-11-25';
const slug='interdisciplinary-aa-online',catalogSourceId=reviewId+'-catalog';
const source={id:catalogSourceId,title:'Liberty 2026–2027 full undergraduate catalog: Interdisciplinary A.A. online allocation and named course choices',url:'https://catalog.liberty.edu/pdf/LibertyUniversity2026-2027UndergraduateCatalog.pdf#pages=210-211,1190,1230,1262-1263,1267,1318,1340&columns=2',kind:'university',roles:['curriculum','degree-placement','prerequisites','offering'],checked:'2026-11-25',retrievedOn:'2026-11-24',sha256:'a6a7a1146399add3e20dbf4a13a80d5c17dc409cc06cfc4a510ba0995c8f85de',capture:'content/source-captures/45f31adbf7fc77ba.txt',captureSha256:'45f31adbf7fc77ba3c79f5d5162714bdeecd959464b52ad407dc3bfe5c0cef81',sourcePages:[210,211,1190,1230,1262,1263,1267,1318,1340],reviewMethod:'Locally extracted and read selected pages of the retained November 24 original official PDF, with its original document hash verified. The November 25 date records this degree-specific review, not a new retrieval.'};
const currentDegreeSourceId=reviewId+'-current-degree',currentIndsSourceId=reviewId+'-current-inds';
const currentSources=[{id:currentDegreeSourceId,title:'Interdisciplinary Studies A.A. Online current 2026–2027 degree plan, rechecked November 25',url:'https://catalog.liberty.edu/undergraduate/colleges-schools/arts-sciences/interdisciplinary-studies-major-aa/interdisciplinary-studies-aa-online/',kind:'university',roles:['curriculum','degree-placement'],checked:'2026-11-25',retrievedOn:'2026-11-25',capture:'content/source-captures/2cfd2f211d940703.txt',captureSha256:'2cfd2f211d940703c8505e850eaf8f4688d261cac7fe6441404fe57ceb90ef90',sourceContentHash:'sha256:2cfd2f211d940703c8505e850eaf8f4688d261cac7fe6441404fe57ceb90ef90',sourceHashBasis:'normalized-captured-text'},{id:currentIndsSourceId,title:'Interdisciplinary Studies current course descriptions, rechecked November 25',url:'https://catalog.liberty.edu/undergraduate/courses/inds/',kind:'university',roles:['prerequisites','offering'],checked:'2026-11-25',retrievedOn:'2026-11-25',capture:'content/source-captures/f612ba15ec0a84db.txt',captureSha256:'f612ba15ec0a84db2a3598455f058999f8af6fbbe9949a4db93b19f2af8b89e2',sourceContentHash:'sha256:f612ba15ec0a84db2a3598455f058999f8af6fbbe9949a4db93b19f2af8b89e2',sourceHashBasis:'normalized-captured-text'}];
const fixed=[['engl-101','soph-0015','engl-101'],['coms-101','soph-0024','coms-101'],['engl-102','soph-0030','engl-102'],['math-121','soph-0001','math-121'],['ethc-101','soph-0020','ethc-101'],['cstu-101','sdcm-0047','cstu-101'],['biol-102','soph-0002','biol-102'],['psyc-101','soph-0048','psyc-101']];
const electives=[['interdisciplinary-general-electives-1','soph-0022','hius-221'],['interdisciplinary-general-electives-2','soph-0025','hius-222'],['interdisciplinary-general-electives-3','soph-0016','envr-215'],['interdisciplinary-general-electives-4','soph-0027','phil-201'],['interdisciplinary-general-electives-5','soph-0065','phil-210']];

export function reviewInterdisciplinaryAA(input){
 const kit=clone({...input,providers:undefined});kit.providers=input.providers;
 const program=kit.programs.find(value=>value.slug===slug);assert(program&&program.totalCredits===60&&program.level==='associate'&&(program.format||program.modelFields.format)==='Online'&&program.catalog==='2026–2027');
 assert(program.modelFields.institutionMinCredits===15&&program.modelFields.externalMaxCredits===45&&program.modelFields.majorInstitutionFraction===undefined);
 const human=kit.programs.find(value=>value.slug==='human-services-bs-online');
 const sources=sourceIndex(kit,program),allSources=new Map([...sources].map(([id,value])=>[id,value.source]));
 for(const p of kit.programs)for(const item of p.sources||[])if(!allSources.has(item.id))allSources.set(item.id,item);
 const priorHumanSources=['liberty-human-services-online-baseline-review-2026-11-24-engl','liberty-human-services-online-baseline-review-2026-11-24-coms','liberty-human-services-catalog-review-2026-11-24'];
 program.sources=[...(program.sources||[]).filter(item=>item.id!==source.id&&!priorHumanSources.includes(item.id)),clone(source)];
 allSources.set(source.id,source);program.modelSourceIds=[...new Set([...program.modelSourceIds.filter(id=>!priorHumanSources.includes(id)),source.id])];
 for(const item of currentSources){allSources.set(item.id,item);program.sources=[...program.sources.filter(existing=>existing.id!==item.id),clone(item)];program.modelSourceIds=[...new Set([...program.modelSourceIds,item.id])];}
 program.quotes=[{sourceId:currentDegreeSourceId,text:'Choose 20-23 credit hours of General Electives 1 20-23'},{sourceId:currentDegreeSourceId,text:'General Electives: any course not already required in the degree may be applied to requirement; recommended that courses be limited to 2 prefixes.'},{sourceId:currentDegreeSourceId,text:'25% of major taken through Liberty University'},{sourceId:currentDegreeSourceId,text:'15 Hours must be completed through Liberty University'}];
 const byId=new Map(program.requirements.map(row=>[row.id,row]));
 if(!byId.has('univ-104')){
  const replaced=byId.get('interdisciplinary-general-electives-7');assert(replaced?.credits===3&&replaced.freeElective===true&&replaced.category==='major');
  program.requirements=program.requirements.map(row=>row.id!==replaced.id?row:{id:'univ-104',code:'UNIV 104',title:'Instructional Technology for Successful Online Learning',credits:3,category:'general',group:'technology',upper:false,sourceIds:[catalogSourceId],quotes:[{sourceId:catalogSourceId,text:'UNIV 104 Instructional Technology for Successful Online Learning 3 Credit Hour(s)'}],selectionRequired:false,institutionOptions:[{code:'UNIV 104',title:'Instructional Technology for Successful Online Learning',credits:3,upper:false,sourceIds:[catalogSourceId]}]});
 }
 const selections={};
 const exactMode=reviewId+'-exact',electiveMode=reviewId+'-general-elective';
 kit.equivalencies.placementModes[exactMode]={placementEvidence:{placementType:'exact-named-requirement',extraSourceIds:[catalogSourceId,currentDegreeSourceId],citeInOption:true}};
 kit.equivalencies.placementModes[electiveMode]={set:{placementType:'elective',categoryPlacementReviewed:true},placementEvidence:{placementType:'free-elective',extraSourceIds:[catalogSourceId,currentDegreeSourceId],citeInOption:true}};
 for(const [id,code,receiving]of [...fixed,...electives]){
  const row=program.requirements.find(value=>value.id===id),award=kit.equivalencies.equivalencies.find(value=>value.id==='liberty-online-baseline-'+code+'-to-'+receiving);
  assert(row&&award&&award.status==='published'&&award.evidence==='published'&&row.credits===3&&award.credits===3&&award.extra.eligibilityReview.eligibleToStart===true);
  assert(award.identity.sourceCredits===3&&award.identity.sourceCreditSystem==='semester'&&award.identity.recommendationStart<='2026-11-25'&&award.identity.recommendationEnd>='2026-11-25');
  if(fixed.some(value=>value[0]===id))assert(row.code===award.receivingCode);
  else assert(row.freeElective===true&&row.category==='major'&&!row.allowedCoursePrefixes&&!row.allowedPrefixes&&!row.allowedCourseCodes&&!row.upperOnly);
  award.scope.programs=[...new Set([...award.scope.programs,slug])];award.scope.levels=[...new Set([...award.scope.levels,'associate'])];
  const mode=electives.some(value=>value[0]===id)?electiveMode:exactMode;
  row.optionRows=[{row:award.id,mode},...(row.optionRows||[]).filter(entry=>!(typeof entry==='string'&&entry.split('@')[0]===award.id)&&!(entry?.row===award.id))];
  row.sourceIds=[...new Set([...row.sourceIds,catalogSourceId])];selections[id]=award.optionId;
  for(const ref of sourceRefs({...award,scope:undefined}))if(allSources.has(ref.id)&&!program.modelSourceIds.includes(ref.id))program.modelSourceIds.push(ref.id);
 }
 // The 20-credit major elective allocation contains five outside 3-credit
 // courses, one named university 3-credit course and two 1-credit courses.
 const soci=clone(byId.get('interdisciplinary-general-electives-1').optionRows.find(entry=>entry?.inline?.code==='SOCI 200').inline);
 const last=program.requirements.find(row=>row.id==='interdisciplinary-general-electives-6');
 last.optionRows=[{inline:soci},...last.optionRows.filter(entry=>!entry?.inline)];selections[last.id]=soci.id;
 for(const id of ['interdisciplinary-general-electives-8-a','interdisciplinary-general-electives-8-b'])selections[id]=program.requirements.find(row=>row.id===id).optionRows.find(entry=>entry.inline).inline.id;
 for(const id of ['univ-104','rlgn-104','bibl-104','theo-104','inds-200'])selections[id]='university-'+id;
 const fields=program.modelFields;
 assert(program.requirements.reduce((sum,row)=>sum+row.credits,0)===60);
 assert(program.requirements.filter(row=>row.category==='major').reduce((sum,row)=>sum+row.credits,0)===21);
 fields.majorResidencyBasisCredits=21;
 fields.policyEvidence.majorResidencyBasisCredits={value:21,creditSystem:'semester',sourceIds:[catalogSourceId],calculation:'INDS 200 (1) plus the printed 20-credit lower end of the 20–23-credit general-elective component; the retained 3-credit UNIV 104 leaves 21 major credits.'};
 fields.sharedPolicyResolution.majorResidencyBasisCredits=21;
 fields.coverageLabel='Source-linked 60-credit online baseline with retained UNIV 104, a 20-credit named major-elective allocation and 39 published outside credits.';
 fields.rulesNotes=['This 60-credit baseline retains UNIV 104 at three credits: 39 general-education credits + INDS 200 (1) + 20 general-elective credits.','The degree lists general electives in its major component. Their 21-credit major residency denominator includes INDS 200, and at least 25% remains at Liberty.','Every proposed elective is a distinct course not otherwise required by this degree. The printed recommendation to limit electives to two prefixes remains a recommendation.','RLGN 104, BIBL 104 and THEO 104 remain in this baseline; no transfer or assessment waiver is assumed.'];
 fields.obligations=[{title:'UNIV 104 retained',notes:'This baseline includes the published three-credit UNIV 104 course and the permitted 20-credit general-elective allocation. An individual zero-credit determination may change the elective allocation within its printed range.',sourceIds:[catalogSourceId]}];
 const covered=new Set(['Confirm individual catalog eligibility, major-course residency allocation, course prerequisites, and written transfer evaluation.','Outside-course equivalencies must be sourced separately; a university requirement is not evidence that a particular accelerated course transfers.','State-specific online general-education requirements may differ; consult the applicable state degree completion plan.']);
 fields.unresolved=(fields.unresolved||[]).filter(note=>!covered.has(typeof note==='string'?note:note.message)&&!String(note?.id||'').startsWith(reviewId+':'));
 fields.unresolved.push({id:reviewId+':personal-records',message:'Submit original official records for Liberty’s individual transfer award, catalog eligibility, state-specific general-education additions and duplicate-learning evaluation.',owner:'student',status:'personal-task',sourceIds:[catalogSourceId,'liberty-undergraduate-catalog-online-policy-2026-2027-reviewed-2026-11-18']},{id:reviewId+':registration',message:'Before university registration, document accepted prerequisite credit or required placement results and select available sections. No placement result, individual waiver or future section availability is assumed.',owner:'student',status:'personal-task',sourceIds:[catalogSourceId]});
 fields.reviewedBaselineChoices={version:1,modelId:program.modelId,catalogYear:'2026-2027',format:'Online',creditSystem:'semester',totalCredits:60,checkedOn:'2026-11-25',reviewId,sourceIds:[catalogSourceId,'liberty-undergraduate-catalog-online-policy-2026-2027-reviewed-2026-11-18'],optionSelections:selections};
 fields.interdisciplinaryAABaselineReview={id:reviewId,checkedOn:'2026-11-25',sourceIds:[catalogSourceId],univ104Credits:3,generalEducationCredits:39,majorElectiveCredits:20,majorResidencyBasisCredits:21,minimumDegreeCredits:60,publishedOutsideCredits:39,individualAwardsCreated:0,waiversAssumed:0};
 fields.curriculumSections=[{id:'general-education',title:'General education / foundational skills',parentId:'general',requirementIds:program.requirements.filter(row=>row.category==='general').map(row=>row.id),sourceId:catalogSourceId},{id:'major-core',title:'Interdisciplinary major and general electives',parentId:'major',requirementIds:program.requirements.filter(row=>row.category==='major').map(row=>row.id),sourceId:catalogSourceId}];
 // Reuse the exact prerequisite rule shape, independently checked against the
 // composition/speech pages in this review's retained full-catalog excerpt.
 for(const id of ['engl-101','coms-101','engl-102']){
  const row=program.requirements.find(value=>value.id===id),prior=human.requirements.find(value=>value.id===id);
  for(const key of ['prerequisites','prerequisitePolicy','prerequisiteSourceIds','offeringPolicy'])row[key]=clone(prior[key]);
  row.prerequisiteSourceIds=[catalogSourceId];row.prerequisitePolicy.sourceIds=[catalogSourceId];row.prerequisitePolicy.checkedOn='2026-11-25';row.offeringPolicy.sourceIds=[catalogSourceId];row.offeringPolicy.checkedOn='2026-11-25';
 }
 for(const id of ['univ-104','inds-200','interdisciplinary-general-electives-6','interdisciplinary-general-electives-8-a','interdisciplinary-general-electives-8-b']){
  const row=program.requirements.find(value=>value.id===id);row.prerequisites=[];row.prerequisiteSourceIds=[catalogSourceId];row.prerequisitePolicy={status:'reviewed-none-published',catalogYear:'2026-2027',format:'Online',rule:{allOf:[]},sourceIds:[catalogSourceId],checkedOn:'2026-11-25'};row.offeringPolicy={offeredFormats:id==='univ-104'?['Online']:['Residential','Online'],sourceIds:[catalogSourceId],checkedOn:'2026-11-25',actualSectionAvailabilityConfirmed:false};
 }
 const math=program.requirements.find(row=>row.id==='math-121');math.prerequisites=[];math.prerequisiteSourceIds=[catalogSourceId];math.prerequisitePolicy={status:'verified',catalogYear:'2026-2027',format:'Online',rule:{anyOf:[{type:'assessment',name:'Placement Score-Math',minimumScore:75},{type:'course',code:'MATH 108'},{type:'course',code:'MATH 110'}]},sourceIds:[catalogSourceId],checkedOn:'2026-11-25',personalPlacementRequired:true};math.offeringPolicy={offeredFormats:['Residential','Online'],sourceIds:[catalogSourceId],checkedOn:'2026-11-25',actualSectionAvailabilityConfirmed:false};
 const inds=program.requirements.find(row=>row.id==='inds-200');inds.sourceIds=[...new Set([...inds.sourceIds,currentDegreeSourceId,currentIndsSourceId])];inds.prerequisiteSourceIds=[catalogSourceId,currentIndsSourceId];inds.prerequisitePolicy.sourceIds=[catalogSourceId,currentIndsSourceId];inds.offeringPolicy.sourceIds=[catalogSourceId,currentIndsSourceId];inds.quotes=[{sourceId:currentIndsSourceId,text:'INDS 200 Interdisciplinary Careers 1 Credit Hour(s)'}];
 for(const id of program.modelSourceIds){if((kit.school.sources||[]).some(value=>value.id===id)||[...kit.providers.values()].some(provider=>(provider.sources||[]).some(value=>value.id===id))||program.sources.some(value=>value.id===id))continue;const item=allSources.get(id);assert(item,'Unknown source '+id);program.sources.push(clone(item));}
 return kit;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const before=await loadKit(resolve(kitsRoot,'liberty')),kit=reviewInterdisciplinaryAA(before),program=kit.programs.find(value=>value.slug===slug);delete program.file;
 await writeFile(resolve(kitsRoot,'liberty/programs/'+slug+'.json'),stringifyProgram(program)+'\n');
 await writeFile(resolve(kitsRoot,'liberty/equivalencies.json'),stringifyKit(kit.equivalencies,['equivalencies'])+'\n');
 console.log('Authored the exact retained-UNIV Interdisciplinary A.A. baseline; generated registries were not written.');
}
