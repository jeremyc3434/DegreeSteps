/** Reviewed degree-family deltas; retains school awards and independently binds every new placement. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadKit,kitsRoot,clone,parsePlacement,sourceIndex,stringifyKit} from './pathway-factory/lib.mjs';
import {stringifyProgram} from './pathway-factory/migrate-liberty.mjs';

export const reviewId='liberty-psychology-cognates-2026-11-27';
export const cohortReviewPath='content/curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json';
const date='2026-11-27',oldSlug='psychology-addictions-online';
const foundation='liberty-addictions-catalog-review-2026-11-24',oldDegree='liberty-psychology-addictions-online-2026';
const slugCode=code=>code.toLowerCase().replace(/\s+/g,'-');
const sum=rows=>rows.reduce((n,row)=>n+row.credits,0);
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const course=code=>({type:'course',code});
const any=codes=>({anyOf:codes.map(course)});
const psychIntro=['PSYC 200','PSYC 101','PSYC 210','GEED 201'];
const psychologyRule={allOf:[any(psychIntro),course('PSYC 255')]};
const config=[
 {key:'criminal-psychology',label:'Criminal Psychology',degreeCapture:'336e28984fc1f071',cognateCredits:15,freeCredits:18,courses:[['CJUS 200','Introduction to Criminal Justice',{allOf:[]},[],'cjus'],['CJUS 340','Criminology',{allOf:[course('CJUS 200'),course('CJUS 230')]},['CJUS 200','CJUS 230'],'cjus'],['PSYC 305','Overview of Theory and Treatment of Substance Abuse',{allOf:[any(['PSYC 101','PSYC 210','SOCI 201']),course('PSYC 255')]},['PSYC 101','PSYC 255'],'psyc'],['PSYC 317','Crisis Intervention',psychologyRule,['PSYC 101','PSYC 255'],'psyc'],['PSYC 475','Psychology of Criminal Behavior',{allOf:[course('PSYC 341'),any(['PSYC 101','PSYC 210']),course('PSYC 255')]},['PSYC 341','PSYC 101','PSYC 255'],'psyc']]},
 {key:'developmental-psychology',label:'Developmental Psychology',degreeCapture:'bafb8fed48dfc489',cognateCredits:15,freeCredits:18,allowed:['PSYC 221','PSYC 231','PSYC 235','PSYC 336','PSYC 345','PSYC 361','PSYC 440','PSYC 495','PSYC 497'],courses:[['PSYC 221','Psychology of Childhood'],['PSYC 231','Psychology of Adolescence'],['PSYC 235','Psychology of Adulthood'],['PSYC 336','Gerontology'],['PSYC 345','Exceptional Child']].map(([code,title])=>[code,title,psychologyRule,['PSYC 101','PSYC 255'],'psyc'])},
 {key:'christian-counseling',label:'Christian Counseling',degreeCapture:'0ab2f75b23f970ef',cognateCredits:9,freeCredits:24,allowed:['CCOU 301','CCOU 302','CCOU 304','CCOU 305'],courses:[['CCOU 201','Introduction to Christian Counseling'],['CCOU 202','Issues of Christian Counseling'],['CCOU 301','Christian Counseling for Marriage and Family']].map(([code,title])=>[code,title,{allOf:[]},[],'ccou'])},
 {key:'crisis-counseling',label:'Crisis Counseling',degreeCapture:'dcb21a8a64c611a1',cognateCredits:9,freeCredits:24,allowed:['CRIS 304','CRIS 305','CRIS 306'],courses:[['CRIS 302','Foundational Principles of Crisis Response',any(['PSYC 101','PSYC 210']),['PSYC 101'],'cris'],['CRIS 303','Acute Stress, Grief and Trauma',{allOf:[course('CRIS 302')]},['CRIS 302'],'cris'],['CRIS 304','PTSD and Combat-Related Trauma',{allOf:[course('CRIS 302')]},['CRIS 302'],'cris']]},
 {key:'military-resilience',label:'Military Resilience',degreeCapture:'a34620fa70452cc5',cognateCredits:9,freeCredits:24,allowed:['CRIS 302','MILT 375','MILT 475'],courses:[['MILT 275','The Resilient Warrior',any(['PSYC 101','PSYC 210']),['PSYC 101'],'milt'],['MILT 325','Resilient Marriage and Family',{allOf:[course('MILT 275')]},['MILT 275'],'milt'],['MILT 375','Military Career and Community Transition',{allOf:[course('MILT 275')]},['MILT 275'],'milt']]}
];
const descriptions={psyc:'c51af0d4cb1ff12c',ccou:'d9e4c01ab6290b13',cjus:'f75024bac1591bf8',milt:'37170ca6a2fdc5a0',cris:'f95dc8453850266b'};
function replaceStrings(value,replacements){
 if(typeof value==='string')return replacements.get(value)??value;
 if(Array.isArray(value))return value.map(item=>replaceStrings(item,replacements));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replaceStrings(item,replacements)]));
 return value;
}
async function capturedSource(id,capture,title,roles){
 const metadata=await read('content/source-captures/'+capture+'.json');
 return {id,title,url:metadata.url,kind:'university',roles,checked:date,retrievedOn:metadata.fetchedAt.slice(0,10),capture:'content/source-captures/'+capture+'.txt',captureSha256:metadata.sha256,sourceContentHash:'sha256:'+metadata.sha256,sourceHashBasis:'normalized-captured-text'};
}
function courseBlock(text,code){
 const header=new RegExp('^'+code+' .+Credit Hour\\(s\\).*$', 'm').exec(text);assert(header,'Missing current description: '+code);
 const after=text.slice(header.index+header[0].length),next=/^\w+ \d{3}[A-Z]? .+Credit Hour\(s\)/m.exec(after);
 return text.slice(header.index,header.index+header[0].length+(next?next.index:after.indexOf('(800) 543-5317'))).trim();
}
export async function authorPsychologyCognates(input){
 const kit=clone({...input,providers:undefined});kit.providers=input.providers;
 const ownedSlugs=new Set(config.map(item=>'psychology-'+item.key+'-online'));
 for(const award of kit.equivalencies.equivalencies)if(award.scope?.programs)award.scope.programs=award.scope.programs.filter(slug=>!ownedSlugs.has(slug));
 const base=kit.programs.find(program=>program.slug===oldSlug);assert(base&&base.totalCredits===120&&base.catalog==='2026–2027');
 const oldProgramSources=new Map(base.sources.map(source=>[source.id,source]));
 const rowById=new Map(kit.equivalencies.equivalencies.map(row=>[row.id,row]));
 const oldRoute=kit.school.publish.documents.flatMap(doc=>doc.routes||[]).find(route=>route.id===base.routeIds[0]);assert(oldRoute);
 const report={version:1,id:reviewId,checkedOn:date,school:kit.school.name,backbone:{modelId:base.modelId,reviewId:base.modelFields.addictionsBaselineReview.id,sourceRetrievalOn:'2026-11-24'},programs:[],scopeAdditions:[],placementModes:{},routes:[],personalAwardsCreated:0,numericAlternativeCapInvented:false,waiversAssumed:0};
 const seenScope=new Set();
 for(const cfg of config){
  const slug='psychology-'+cfg.key+'-online',modelId='curriculum-liberty-'+slug,sourceId=reviewId+'-'+cfg.key+'-degree',foundationId=reviewId+'-'+cfg.key+'-foundations';
  const p=replaceStrings(clone(base),new Map([[oldDegree,sourceId],[foundation,foundationId],[base.modelId,modelId],[base.slug,slug]]));
  p.slug=slug;p.modelId=modelId;p.routeIds=['liberty-catalog-fa62c08cdfa0c990-'+cfg.key+'-online'];p.title='Psychology (B.S.) — '+cfg.label+' — Online';
  p.review={status:'reviewed',reviewer:'DegreeSteps source-grounded family review',reviewedOn:date,reviewId};p.file='programs/'+slug+'.json';delete p.sourceOverrides;
  p.sources=[await capturedSource(sourceId,cfg.degreeCapture,p.title+' official 2026–2027 degree completion plan',['curriculum','degree-placement','policy']),{...clone(oldProgramSources.get(foundation)),id:foundationId,title:'Retained official 2026–2027 catalog: reviewed general-education prerequisites and delivery',checked:date,reviewMethod:'Reused original November 24 capture with its original PDF/body hashes. New review checks shared foundational course descriptions; this is not a fresh retrieval or this cognate’s degree-plan source.'}];
  p.sources[0].scope={schoolName:kit.school.name,catalogYear:'2026-2027',modality:'online',level:'bachelor',modelId};
  const localSources={};
  for(const prefix of new Set(['psyc',...cfg.courses.map(row=>row[4]),...(cfg.key==='criminal-psychology'?['cjus']:[])])){
   localSources[prefix]=await capturedSource(reviewId+'-'+cfg.key+'-'+prefix,descriptions[prefix], 'Liberty current '+prefix.toUpperCase()+' course descriptions, prerequisites and online delivery',['prerequisites','offering','curriculum']);p.sources.push(localSources[prefix]);
  }
  const texts=Object.fromEntries(await Promise.all(Object.entries(localSources).map(async([prefix,source])=>[prefix,await readFile(new URL('../'+source.capture,import.meta.url),'utf8')])));
  const degreeText=await readFile(new URL('../'+p.sources[0].capture,import.meta.url),'utf8');
  for(const phrase of ['Catalog 2026-2027','120 Total hours','25% Of major and cognate taken through Liberty University','30 Hours must be completed through Liberty University','Free Electives'])assert(degreeText.includes(phrase),'Changed degree claim: '+cfg.key+' '+phrase);
  const keep=base.requirements.filter(row=>!['psyc-305','psyc-306','psyc-307'].includes(row.id)&&(!row.freeElective||Number(row.id.split('-').at(-1))<=cfg.freeCredits/3));
  p.requirements=replaceStrings(clone(keep),new Map([[oldDegree,sourceId],[foundation,foundationId]]));
  const selections=clone(base.modelFields.reviewedBaselineChoices.optionSelections);
  for(const id of Object.keys(selections))if(!p.requirements.some(row=>row.id===id))delete selections[id];
  // Freshly rebind the shared PSYC descriptions. Foundational ENGL/COMS/MATH
  // evidence continues to cite its retained official catalog, not the PSYC page.
  for(const row of p.requirements.filter(row=>row.code?.startsWith('PSYC '))){
   const block=courseBlock(texts.psyc,row.code);assert(block.includes('Offered: Residential and Online')||block.includes('Offered: Online'));
   row.prerequisiteSourceIds=[localSources.psyc.id];row.prerequisitePolicy.sourceIds=[localSources.psyc.id];row.prerequisitePolicy.checkedOn=date;row.offeringPolicy.sourceIds=[localSources.psyc.id];row.offeringPolicy.checkedOn=date;
   if(row.registrationPolicy){row.registrationPolicy.sourceIds=[localSources.psyc.id];row.registrationPolicy.checkedOn=date;}
   row.quotes=[{sourceId:localSources.psyc.id,text:block.split('\n')[0]}];row.sourceIds=[...new Set([...row.sourceIds,localSources.psyc.id])];
  }
  const cognateIds=[];
  for(const [code,title,rule,selected,prefix]of cfg.courses){
   const block=courseBlock(texts[prefix],code),header=code+' '+title+' 3 Credit Hour(s)';assert(block.includes(header));assert(/Offered: (?:Residential and )?Online/.test(block));
   const id=slugCode(code),upper=Number(code.split(' ')[1])>=300;
   const row={id,code,title,credits:3,category:'major',group:'cognate',upper,selectionRequired:false,sourceIds:[sourceId,localSources[prefix].id],quotes:[{sourceId:localSources[prefix].id,text:header}],prerequisites:selected.map(slugCode),prerequisiteSourceIds:[localSources[prefix].id],prerequisitePolicy:{status:'verified',catalogYear:'2026-2027',format:'Online',rule:clone(rule),noCoursePrerequisitesListed:!block.includes('Prerequisite:'),sourceIds:[localSources[prefix].id],checkedOn:date},offeringPolicy:{offeredFormats:block.includes('Offered: Residential and Online')?['Residential','Online']:['Online'],sourceIds:[localSources[prefix].id],checkedOn:date,actualSectionAvailabilityConfirmed:false},optionRows:[]};
   if(upper){row.minimumGrade='C';row.minimumGradeSourceIds=[sourceId];}
   if(cfg.allowed&&(!['christian-counseling','crisis-counseling','military-resilience'].includes(cfg.key)||code===cfg.courses.at(-1)[0]))row.allowedCourseCodes=[...cfg.allowed];
   // Existing conditional receiving-map rows remain conditional. No provider
   // version or receiving award is invented by a matching course title.
   const matching=kit.equivalencies.equivalencies.filter(award=>award.status==='published'&&award.receivingCode===code&&award.credits===3&&!award.id.startsWith(reviewId+'-'));
   const outside=new Set();
   row.optionRows=[];
   for(const original of matching){
    const identity=original.provider+'|'+original.code;if(outside.has(identity))continue;
    const originalSources=sourceIndex(kit,base),universityRefs=original.sourceIds.map(id=>originalSources.get(id)?.source).filter(Boolean);
    if(!universityRefs.some(source=>source.modality==='online'||source.url.includes('/online/')))continue;
    outside.add(identity);
    const award=clone(original),awardId=reviewId+'-'+cfg.key+'-'+original.provider.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+original.code.toLowerCase()+'-to-'+id;
    award.id=awardId;award.authored=true;award.scope={programs:[slug],levels:['bachelor'],modalities:['online'],catalogs:['2026–2027']};
    // This is a newly reviewed exact degree placement, not a placement in the
    // old program's free-elective block. Keep every provider/version restriction.
    award.conditionIds=(award.conditionIds||[]).filter(condition=>condition!=='liberty-proposed-use-in-this-published-elective');
    award.conditions=(award.conditions||[]).filter(condition=>!condition.startsWith('Proposed use in this published elective block.'));
    if(award.extra){delete award.extra.placementType;delete award.extra.degreePlacementEvidence;delete award.extra.sharedAwardProvenance;}
    award.sourceIds=[...new Set([...award.sourceIds,sourceId,localSources[prefix].id])];
    award.quotes=[{sourceId:localSources[prefix].id,text:header}];
    const existing=kit.equivalencies.equivalencies.findIndex(candidate=>candidate.id===awardId);
    if(existing<0)kit.equivalencies.equivalencies.push(award);else kit.equivalencies.equivalencies[existing]=award;
    rowById.set(awardId,award);row.optionRows.push(awardId);
   }
   p.requirements.push(row);cognateIds.push(id);selections[id]='university-'+id;
  }
  if(cfg.key==='criminal-psychology'){
   const row=p.requirements.find(row=>row.id==='free-electives-6'),block=courseBlock(texts.cjus,'CJUS 230');
   assert(block.includes('Offered: Residential and Online')&&!block.includes('Prerequisite:'));
   Object.assign(row,{code:'CJUS 230',title:'Criminal Justice Research and Writing',upper:false,sourceIds:[sourceId,localSources.cjus.id],quotes:[{sourceId:localSources.cjus.id,text:'CJUS 230 Criminal Justice Research and Writing 3 Credit Hour(s)'}],selectionRequired:false,prerequisites:[],prerequisiteSourceIds:[localSources.cjus.id],prerequisitePolicy:{status:'reviewed-none-published',catalogYear:'2026-2027',format:'Online',rule:{allOf:[]},sourceIds:[localSources.cjus.id],checkedOn:date},offeringPolicy:{offeredFormats:['Residential','Online'],sourceIds:[localSources.cjus.id],checkedOn:date,actualSectionAvailabilityConfirmed:false},optionRows:[{inline:{id:'university-cjus-230',provider:'University',code:'CJUS 230',title:'Criminal Justice Research and Writing',credits:3,upper:false,creditSystem:'semester',creditOrigin:'institutional',sourceIds:[sourceId,localSources.cjus.id],evidence:'published'}}]});
   const dependent=p.requirements.find(row=>row.id==='cjus-340');dependent.prerequisites=dependent.prerequisites.map(id=>id==='cjus-230'?row.id:id);selections[row.id]='university-cjus-230';
  }
  const fixed=new Set(p.requirements.filter(row=>row.code).map(row=>row.code));
  for(const req of p.requirements){
   req.institutionalOnly=Boolean(req.institutionalOnly);
   const chosenId=selections[req.id],entries=req.optionRows||[],ranked=[...entries].sort((a,b)=>Number((typeof b==='object'&&b.optionId===chosenId))-Number((typeof a==='object'&&a.optionId===chosenId))),seen=new Set(),output=[];
   for(const entry of ranked){
    const parsed=parsePlacement(entry);if(parsed.inline){output.push(entry);continue;}
    const award=rowById.get(parsed.row);assert(award,'Unknown reused award');
    if(req.freeElective&&fixed.has(award.receivingCode)&&award.receivingCode!==req.code)continue;
    const identity=award.provider+'|'+award.code;if(seen.has(identity))continue;seen.add(identity);
    if(award.scope?.programs){if(!award.scope.programs.includes(slug))award.scope.programs.push(slug);const key=award.id+'|'+slug;if(!seenScope.has(key)){report.scopeAdditions.push({rowId:award.id,program:slug});seenScope.add(key);}}
    const modeId=reviewId+'-'+cfg.key+'-'+(req.freeElective?'elective':'exact')+'-'+(parsed.mode||'direct');
    const oldMode=parsed.mode?clone(kit.equivalencies.placementModes[parsed.mode]):{};
    const mode=replaceStrings(oldMode,new Map([[oldDegree,sourceId],[foundation,foundationId]]));
    // Shared provider identities/receiving facts can be reused. The older
    // bundle's explicit program approval cannot be inherited by a new degree.
    if(mode.set){delete mode.set.sharedAwardProvenance;delete mode.set.degreePlacementEvidence;}
    mode.unset=[...new Set([...(mode.unset||[]),'sharedAwardProvenance','degreePlacementEvidence'])];
    mode.set={...mode.set,categoryPlacementReviewId:reviewId,placementReview:{id:reviewId,modelId,catalogYear:'2026-2027',modality:'online',checkedOn:date,sourceIds:[sourceId]}};
    mode.placementEvidence={placementType:req.freeElective?'free-elective':'exact-named-requirement',extraSourceIds:[sourceId],citeInOption:true};
    kit.equivalencies.placementModes[modeId]=mode;report.placementModes[modeId]=mode;
    output.push({row:award.id,mode:modeId,...(parsed.optionId?{optionId:parsed.optionId}:{})});
   }
   req.optionRows=output;
  }
  const fields=p.modelFields,majorCredits=51+cfg.cognateCredits;
  delete fields.addictionsBaselineReview;
  fields.majorResidencyBasisCredits=majorCredits;fields.sharedPolicyResolution.majorResidencyBasisCredits=majorCredits;fields.routeSuffix=cfg.key+'-online';fields.evidenceCheckedOn=date;
  fields.majorResidencySourceIds=[sourceId];
  fields.gradePolicy.checked=date;
  fields.policyEvidence.majorResidencyBasisCredits={value:majorCredits,creditSystem:'semester',sourceIds:[sourceId],calculation:'12 major foundation credits + 39 psychology core credits + '+cfg.cognateCredits+' cognate credits, with shared general-education credit counted once.'};
  fields.policyEvidence.majorInstitutionFraction={value:.25,sourceIds:[sourceId]};
  fields.rulesNotes=['A 120-credit retained-UNIV baseline: 36 unique general education + 12 major foundations + 39 psychology core + '+cfg.cognateCredits+' '+cfg.label+' cognate + '+cfg.freeCredits+' unrestricted free electives.','BIOL 102 and PSYC 101 also satisfy the natural/social science allocations; each course counts once.','UNIV 104 remains three credits. No religion or technology waiver, placement test result, admission, personal award or section availability is assumed.','The major/foundations/cognate denominator is '+majorCredits+' credits. At least one quarter of that component and at least 30 degree credits remain at Liberty.','The selected baseline uses current independently reviewed Sophia and Study.com identities with distinct published Liberty online receiving awards. Conditional additional providers remain separate alternatives.','This undergraduate psychology cognate does not itself establish eligibility for a regulated counseling or psychology license.'];
  fields.obligations=[{title:'UNIV 104 retained',notes:'Three-credit UNIV 104 is retained and '+cfg.freeCredits+' elective credits remain within the exact degree’s printed range; no waiver is assumed.',sourceIds:[sourceId]},{title:'PSYC 491 registration',notes:'Meet the published minimum-C prerequisite grades, junior/senior standing and 18 successfully completed PSYC credits before the online capstone.',sourceIds:[localSources.psyc.id]}];
  if(cfg.key==='criminal-psychology')fields.obligations.push({title:'CJUS 340 prerequisite',notes:'CJUS 230 is selected as an unrestricted free elective so both CJUS 200 and CJUS 230 are completed before CJUS 340. It is counted once within 120 credits.',sourceIds:[sourceId,localSources.cjus.id]});
  fields.unresolved=[{id:reviewId+':'+slug+':personal-records',message:'Submit official records for Liberty’s individual transfer evaluation, admission/catalog eligibility, state-specific general-education additions and duplicate-learning review.',owner:'student',status:'personal-task',sourceIds:[sourceId,'liberty-undergraduate-catalog-online-policy-2026-2027-reviewed-2026-11-18']},{id:reviewId+':'+slug+':registration',message:'Before registration, document accepted prerequisite credit and available online sections. PSYC 491 requires minimum-C prerequisites, junior/senior standing and 18 completed PSYC credits.',owner:'student',status:'personal-task',sourceIds:[localSources.psyc.id]}];
  fields.reviewedBaselineChoices={version:1,modelId,catalogYear:'2026-2027',format:'Online',creditSystem:'semester',totalCredits:120,checkedOn:date,reviewId,sourceIds:[sourceId],optionSelections:selections};
  fields.psychologyCognateReview={id:reviewId,checkedOn:date,modelId,catalogYear:'2026-2027',modality:'online',sourceIds:p.sources.map(source=>source.id),backboneModelId:base.modelId,backboneReviewId:base.modelFields.addictionsBaselineReview.id,personalAwardsCreated:0,waiversAssumed:0};
  fields.curriculumSections=clone(base.modelFields.curriculumSections).filter(section=>section.id!=='addictions-recovery-cognate').map(section=>({...section,requirementIds:section.requirementIds.filter(id=>p.requirements.some(row=>row.id===id))}));
  fields.curriculumSections.splice(3,0,{id:cfg.key+'-cognate',title:cfg.label+' cognate',parentId:'major',requirementIds:cognateIds,sourceId});
  for(const section of fields.curriculumSections)section.sourceId=sourceId;
  p.policies={oneAwardPerSourceCourse:{value:true,sourceIds:['liberty-undergraduate-catalog-online-policy-2026-2027-reviewed-2026-11-18'],basis:'The reviewed undergraduate policy counts the same course only once. Alternatives may appear in more than one elective choice; the optimizer must select each original course at most once.'}};
  p.quotes=[{sourceId,text:'120 Total hours'},{sourceId,text:'25% Of major and cognate taken through Liberty University'},{sourceId,text:'30 Hours must be completed through Liberty University'}];
  p.modelSourceIds=[...new Set([...p.modelSourceIds,...p.sources.map(source=>source.id)])];
  assert(sum(p.requirements)===120&&sum(p.requirements.filter(row=>row.category==='major'))===majorCredits);
  assert(sum(p.requirements.filter(row=>row.freeElective))===cfg.freeCredits);
  assert(Object.keys(selections).length===p.requirements.length);
  const ids=new Set(p.requirements.map(row=>row.id));for(const row of p.requirements)for(const dependency of row.prerequisites||[])assert(ids.has(dependency),'Missing prerequisite '+dependency+' in '+slug);
  const route={...clone(oldRoute),id:p.routeIds[0],title:p.title,url:p.sources[0].url,summary:'Reviewed 120-credit online '+cfg.label+' psychology pathway with retained UNIV 104, named cognate courses and distinct source-backed transfer choices.'};
  report.routes.push(route);report.programs.push({slug,modelId,routeId:route.id,title:p.title,sourceIds:p.sources.map(source=>source.id),cognateCourseCodes:cfg.courses.map(row=>row[0]),cognateCredits:cfg.cognateCredits,freeElectiveCredits:cfg.freeCredits,majorResidencyBasisCredits:majorCredits,sourceCapture:p.sources[0].capture});
  kit.programs=kit.programs.filter(program=>program.slug!==slug);kit.programs.push(p);
 }
 const paths=new Set(report.programs.map(program=>'content/curricula/liberty-'+program.slug+'.json'));
 const documents=kit.school.publish.documents.filter(document=>!paths.has(document.path));
 const fallback=documents.find(document=>document.path==='content/curricula/liberty-pathway-kit.json');
 if(Array.isArray(fallback.routes)){fallback.routes=fallback.routes.filter(route=>!report.routes.some(candidate=>candidate.id===route.id));if(!fallback.routes.length)delete fallback.routes;}
 const additions=report.programs.map(program=>({path:'content/curricula/liberty-'+program.slug+'.json',programs:[program.slug],checkedOn:date,sources:false,routes:[clone(report.routes.find(route=>route.id===program.routeId))]}));
 documents.splice(documents.indexOf(fallback),0,...additions);kit.school.publish.documents=documents;
 kit.school.programOrder=[...kit.school.programOrder.filter(slug=>!report.programs.some(program=>program.slug===slug)),...report.programs.map(program=>program.slug)];
 return {kit,report,programs:kit.programs.filter(program=>report.programs.some(item=>item.slug===program.slug))};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const input=await loadKit(resolve(kitsRoot,'liberty')),{kit,report,programs}=await authorPsychologyCognates(input);
 const check=process.argv.includes('--check'),write=async(path,body)=>{if(check)assert.equal(await readFile(path,'utf8'),body,'Stale reviewed psychology family input: '+path);else await writeFile(path,body);};
 for(const program of programs){const canonical=clone(program);delete canonical.file;await write(resolve(kitsRoot,'liberty/programs/'+program.slug+'.json'),stringifyProgram(canonical)+'\n');}
 await write(resolve(kitsRoot,'../curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json'),JSON.stringify(report,null,2)+'\n');
 if(process.argv.includes('--apply-shared')){
  await write(resolve(kitsRoot,'liberty/school.json'),stringifyKit(kit.school,['sources'])+'\n');
  await write(resolve(kitsRoot,'liberty/equivalencies.json'),stringifyKit(kit.equivalencies,['equivalencies'])+'\n');
 }
 console.log(JSON.stringify({programs:programs.map(p=>p.slug),check,sharedFilesWritten:!check&&process.argv.includes('--apply-shared'),scopeAdditions:report.scopeAdditions.length,placementModes:Object.keys(report.placementModes).length}));
}
