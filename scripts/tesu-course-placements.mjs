/** Reviewed degree allocation of exact TESU course awards; provider status and residency stay separate. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadKit,root,parsePlacement} from './pathway-factory/lib.mjs';
import {groundedSource,reviewedRows} from './tesu-course-eligibility.mjs';
import {upiLiberalArtsPlacement} from './tesu-upi-maps.mjs';
import {assertTESUBusinessBlockEvidence,reviewedTESUBusinessSource} from './tesu-business-blocks.mjs';
import {loadProgramManifests,selectProgramManifests} from './pathway-factory/program-manifest.mjs';

export const TESU_PLACEMENT_REVIEW='tesu-exact-course-placements-2026-11-26';
export const TESU_PLACEMENT_ADDITIONS_REVIEW='tesu-exact-course-placements-2026-11-27';
const CHECKED='2026-11-26',list=v=>Array.isArray(v)?v:[],unique=v=>[...new Set(v)],copy=structuredClone;
const normalize=v=>String(v||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
const placementRoster=selectProgramManifests(await loadProgramManifests(),{schoolId:'tesu',stage:'course-placements'});
const SOURCES=Object.fromEntries(placementRoster.filter(entry=>entry.placementBasis.kind==='reviewed-receiving-catalog').sort((a,b)=>a.slug.localeCompare(b.slug)).map(entry=>[entry.slug,[entry.placementBasis.capture.split('/').at(-1).replace(/\.txt$/,''),entry.placementBasis.freeElectiveCredits]]));
export const TESU_ADDITIONAL_BUSINESS_PROGRAMS=Object.freeze(placementRoster.filter(entry=>entry.placementBasis.kind==='reviewed-business-primary').map(entry=>entry.slug));
const taxonomy={id:'tesu-liberal-taxonomy-placement-2026-11-26',title:'TESU current published discipline course lists and single-use allocation rule',url:'https://www.tesu.edu/degrees-programs/courses/general-education/2021-and-after.php',checked:CHECKED,capture:'content/source-captures/0e6020afa78fc30f.txt',kind:'university',roles:['program-policy','degree-placement']};
const independentlyListedLiberalCodes=new Set([...((await readFile(resolve(root,taxonomy.capture),'utf8')).matchAll(/\b([A-Z]+-\d{4}):/g))].map(match=>match[1]));
export const TESU_SUPERSEDED_COPY_RULES=Object.freeze([
 {oldRowId:'sophia-human-biology-to-bio-1010',oldCode:'Human Biology',replacementRowId:'sophia-soph-0002-to-bio-1010-tesu-2026-2027',requirements:Object.keys(SOURCES).map(slug=>[slug,'eas1010'])},
 {oldRowId:'sophia-human-biology-to-bio-1010-2',oldCode:'Human Biology',replacementRowId:'sophia-soph-0002-to-bio-1010-tesu-2026-2027',requirements:['bals-intro-1','bals-intro-2'].map(id=>['ba-liberal-studies',id])},
 {oldRowId:'sophia-introduction-to-statistics-to-sta-2010-3',oldCode:'Introduction to Statistics',replacementRowId:'sophia-soph-0005-to-sta-2010-tesu-2026-2027',requirements:['bals-intro-1','bals-intro-2',...Array.from({length:7},(_,i)=>'bals-intermediate-'+(i+1))].map(id=>['ba-liberal-studies',id])},
 {oldRowId:'sophia-macroeconomics-to-eco-1110-3',oldCode:'Macroeconomics',replacementRowId:'sophia-soph-0012-to-eco-1110-tesu-2026-2027',requirements:['bals-intro-1','bals-intro-2'].map(id=>['ba-liberal-studies',id])},
 {oldRowId:'sophia-microeconomics-to-eco-1120-3',oldCode:'Microeconomics',replacementRowId:'sophia-soph-0011-to-eco-1120-tesu-2026-2027',requirements:['bals-intro-1','bals-intro-2'].map(id=>['ba-liberal-studies',id])}
]);
/** Five explicitly reviewed legacy aliases only. Distinct original versions,
 * periods or grade rules stay separate; no title-matching inference is used. */
export function copiedTESUPlacementSuperseded(model,requirement,candidate,replacement){
 const rule=TESU_SUPERSEDED_COPY_RULES.find(rule=>rule.oldRowId===candidate?.id);if(!rule||replacement?.id!==rule.replacementRowId||candidate.code!==rule.oldCode)return false;
 if(!rule.requirements.some(([slug,id])=>model.id==='curriculum-tesu-'+slug&&requirement.id===id)||model.level!=='bachelor'||model.format!=='Online'||!model.modalities?.includes('online'))return false;
 if(candidate.provider!=='Sophia'||replacement.provider!=='Sophia'||candidate.evidence!=='conditional'||candidate.receivingCode!==replacement.receivingCode||candidate.credits!==replacement.credits||candidate.credits!==requirement.credits||candidate.creditSystem&&candidate.creditSystem!=='semester'||!String(candidate.extra?.mappingScope).includes('researched in another degree'))return false;
 for(const record of [candidate,candidate.identity,candidate.extra])if(record)for(const field of ['courseVersion','version','recommendationStart','recommendationEnd','minimumGrade','minGrade','minScore','providerCoursePassingPercent'])if(record[field]!==undefined&&record[field]!==null)return false;
 if(replacement.evidence!=='published'||replacement.extra?.courseEligibilityResolution?.status!=='resolved'||replacement.extra.courseEligibilityResolution.providerCourseCode!==replacement.code||replacement.extra.courseEligibilityResolution.receivingCode!==candidate.receivingCode)return false;
 return Boolean(placementKind(model,requirement,replacement));
}
function quote(source,text,body){assert(normalize(body).includes(normalize(text)),source.id+' does not contain its reviewed degree claim: '+text);return {sourceId:source.id,text};}
export function placementKind(model,requirement,row){
 if(!reviewedRows(row)||row.extra?.courseEligibilityResolution?.status!=='resolved'||requirement.institutionalOnly||model.school!=='Thomas Edison State University'||model.creditSystem!=='semester'||model.totalCredits!==120||model.catalog!==row.extra.courseEligibilityResolution.targetCatalog||requirement.credits!==row.credits||row.creditSystem!=='semester'||row.creditOrigin!=='alternative')return null;
 if(requirement.freeElective===true){
  if(!['elective','electives'].includes(requirement.category)||requirement.group!=='free-electives'||requirement.excludeAlreadyUsed!==true||model.transferPolicyReview?.duplicatesCountOnce!==true)return null;
  // Fixed named requirements reserve their awards; flexible Liberal Studies capacity is independently allocated by the solver.
  if(model.requirements.some(r=>!r.freeElective&&!r.liberalArtsAllocation&&r.code===row.receivingCode))return null;
  return 'elective';
 }
 if(requirement.liberalArtsAllocation===true)return upiLiberalArtsPlacement(model,requirement,row)&&independentlyListedLiberalCodes.has(row.receivingCode)?'liberal-arts-area':null;
 // These are published scientific-category featured selections, not mandatory receiving-course identities.
 // Only the two independently listed, exact current university awards reviewed here can replace them.
 if(requirement.category==='general'&&['EAS-1010','BIO-2080'].includes(requirement.code)&&['BIO-1010','CIS-1070'].includes(row.receivingCode)&&!model.requirements.some(r=>r.id!==requirement.id&&!r.freeElective&&!r.liberalArtsAllocation&&r.code===row.receivingCode))return 'general-category';
 return requirement.code===row.receivingCode?'exact-course':null;
}
const modeId=(program,kind)=>'tesu-reviewed-'+program.slug+'-'+kind;
export function reviewedRequirementScope(r){return Object.fromEntries(['id','code','credits','category','group','subgroup','institutionalOnly','freeElective','excludeAlreadyUsed','liberalArtsAllocation','minCourseLevel','maxCourseLevel','upperOnly','upper','allowedCoursePrefixes','allowedReceivingCodeExceptions','sourceIds'].filter(key=>Object.hasOwn(r,key)).map(key=>[key,copy(r[key])]));}
function modelScope(program,model,degree,taxonomyEntry){
 const businessAddition=TESU_ADDITIONAL_BUSINESS_PROGRAMS.includes(program.slug);
 const free=model.requirements.filter(r=>r.freeElective),blockCredits=businessAddition?15:SOURCES[program.slug][1];
 const allocatedFreeCredits=free.reduce((n,r)=>n+r.credits,0),fixedElectiveCredits=program.slug==='bsba-finance'?3:0;
 assert.equal(allocatedFreeCredits+fixedElectiveCredits,blockCredits);assert.equal(model.requirements.filter(r=>r.group==='free-electives').reduce((n,r)=>n+r.credits,0),blockCredits);assert.equal(model.institutionMinCredits,15);assert.equal(model.upperMinCredits,18);assert.equal(model.alternativeMaxCredits,90);
 if(businessAddition)assertTESUBusinessBlockEvidence(degree.body,program.requirements);
 const quotes=[quote(degree.source,(program.slug.startsWith('bsba-')||businessAddition?'IV':'III')+'. Electives ('+blockCredits+' Credits)',degree.body),quote(degree.source,'TESU accepts credits in transfer from accredited institutions as well as non-collegiate providers.',degree.body)];
 quotes.push(quote(degree.source,'TESU Featured Courses are listed as a guide. Other courses may satisfy the areas',degree.body),quote(degree.source,'D. Scientific Knowledge (6 Credits)',degree.body));
 if(program.slug==='ba-liberal-studies'){
  quotes.push(quote(degree.source,'Option A. Students complete a total of 42 credits of Liberal Studies courses.',degree.body));
  quotes.push(quote(degree.source,'A minimum of 18 credits must be upper level, 3000 level or above, and no more than 6 credits at the 1000 level in the area of study.',degree.body));
  quotes.push(quote(taxonomyEntry.source,'Some courses can be used to satisfy requirements in more than one category, but each course may only be used once in a degree.',taxonomyEntry.body));
 }
 return {modelId:program.modelId,catalog:program.catalog,degreeSourceId:degree.source.id,freeElectiveCredits:blockCredits,allocatedFreeCredits,fixedElectiveCredits,freeRequirementIds:free.map(r=>r.id),scientificRequirementIds:model.requirements.filter(r=>r.category==='general'&&['EAS-1010','BIO-2080'].includes(r.code)).map(r=>r.id),scientificPermittedReceivingCodes:['BIO-1010','CIS-1070'],institutionMinCredits:15,upperMinCredits:18,alternativeMaxCredits:90,duplicatesCountOnce:true,liberalArtsAllocation:copy(model.liberalArtsAllocation||null),requirements:model.requirements.map(reviewedRequirementScope),quotes};
}

export async function applyTESUCoursePlacements({check=false}={}){
 // Guards import the pure placement predicates while the compiler CLI is
 // awaiting those guards. Load authoring-only compiler code on demand.
 const {compileProgram}=await import('./pathway-factory/compile.mjs');
 const kit=await loadKit(resolve(root,'content/pathway-kits/tesu')),rows=kit.equivalencies.equivalencies.filter(reviewedRows);assert.equal(rows.length,35);
 const sources=new Map(),taxonomyEntry=await groundedSource(taxonomy);sources.set(taxonomyEntry.source.id,taxonomyEntry);
 const models=[],placements=[],supersededLegacyPlacements=[];
 for(const program of kit.programs){
  const spec=SOURCES[program.slug],businessAddition=TESU_ADDITIONAL_BUSINESS_PROGRAMS.includes(program.slug);assert(spec||businessAddition,'Only independently reviewed current program ledgers are in scope');
  let degree;
  if(businessAddition){
   const identity=program.modelFields.catalogIdentity,source=kit.school.sources.find(s=>s.id===identity?.sourceId),manifest=placementRoster.find(entry=>entry.slug===program.slug);
   assert(source&&source.capture===identity.capture&&source.url===identity.sourceUrl&&identity.checkedOn===manifest.authoringReview.reviewedOn,program.slug+' exact primary degree identity');
   degree=await reviewedTESUBusinessSource(source,{reviewedOn:manifest.authoringReview.reviewedOn});assert.equal(degree.source.sha256,identity.sourceSha256,program.slug+' independently bound primary degree body');
  }else{
   const oldSource=kit.school.sources.find(s=>s.id===program.modelSourceIds.find(id=>id==='tesu-'+program.slug.replace(/^ba-|^bsba-/,'')+'-current-2026-11-18'));
   assert(oldSource,program.slug+' current academic source identity');
   degree=await groundedSource({id:'tesu-'+program.slug+'-placement-2026-11-26',title:program.title+' — current published elective and degree allocation',url:oldSource.url,checked:CHECKED,capture:'content/source-captures/'+spec[0]+'.txt',kind:'university',roles:['curriculum','degree-placement']});
  }
  sources.set(degree.source.id,degree);
  const model=compileProgram(kit,program),scope=modelScope(program,model,degree,taxonomyEntry);models.push(scope);
  const reviewedOn=businessAddition?program.modelFields.catalogIdentity.checkedOn:CHECKED;
  assert([CHECKED,'2026-11-27'].includes(reviewedOn),'A new placement cohort needs its own explicit review packet');
  const placementReviewId=reviewedOn===CHECKED?TESU_PLACEMENT_REVIEW:TESU_PLACEMENT_ADDITIONS_REVIEW;
  for(const kind of ['exact-course','elective','general-category',...(program.slug==='ba-liberal-studies'?['liberal-arts-area']:[])]){
   const typed=kind==='liberal-arts-area'||kind==='general-category';
   const mode={set:{evidence:'published',coursePlacementReviewId:placementReviewId,...(kind==='elective'?{placementType:'elective',allocationType:'free-elective'}:kind==='liberal-arts-area'?{placementType:'major-elective',allocationType:'liberal-arts-area'}:kind==='general-category'?{placementType:'general-elective',allocationType:'general-category'}:{})},placementEvidence:{placementType:kind,extraSourceIds:[...(!businessAddition?[degree.source.id]:[]),...(typed?[taxonomyEntry.source.id]:[])],citeInOption:true}};
   kit.equivalencies.placementModes[modeId(program,kind)]=mode;
  }
  for(const requirement of program.requirements){
   const old=new Map(list(requirement.optionRows).flatMap(entry=>{const p=parsePlacement(entry);return rows.some(row=>row.id===p.row)?[[p.row,p]]:[];}));
   let other=list(requirement.optionRows).filter(entry=>!rows.some(row=>row.id===parsePlacement(entry).row));
   for(const row of rows){
    const kind=placementKind(model,requirement,row);if(!kind)continue;
    if(kind==='liberal-arts-area')assert(taxonomyEntry.body.includes(row.receivingCode),row.receivingCode+' has independently published liberal-arts course classification');
    if(kind==='general-category'){
     const scientific=taxonomyEntry.body.slice(taxonomyEntry.body.indexOf('D. Scientific Knowledge\n'));assert(scientific.includes(row.receivingCode+':'),row.receivingCode+' is explicitly listed in the current Scientific Knowledge category');
     assert(scope.scientificRequirementIds.includes(requirement.id));
    }
    const prior=old.get(row.id),existing=model.requirements.find(r=>r.id===requirement.id)?.options.find(o=>o.code===row.code&&o.receivingCode===row.receivingCode&&o.courseEligibilityResolution);
    const optionId=prior?.optionId||existing?.id||row.optionId+'-'+requirement.id;
    const mode=modeId(program,kind);other.push({row:row.id,mode,optionId});
    const typed=kind==='liberal-arts-area'||kind==='general-category',proofSourceIds=unique([...list(requirement.sourceIds),degree.source.id,...(typed?[taxonomyEntry.source.id]:[])]);
    placements.push({modelId:program.modelId,requirementId:requirement.id,rowId:row.id,optionId,mode,placementType:kind,provider:row.provider,providerCourseCode:row.code,courseVersion:row.identity.courseVersion,receivingCode:row.receivingCode,credits:row.credits,creditSystem:row.creditSystem,creditOrigin:row.creditOrigin,receivingUpper:/^[A-Z]+-[34]\d{3}$/.test(row.receivingCode),sourceIds:proofSourceIds,primarySourceIds:[degree.source.id,...(typed?[taxonomyEntry.source.id]:[])]});
   }
   for(const rule of TESU_SUPERSEDED_COPY_RULES){
    const candidate=kit.equivalencies.equivalencies.find(row=>row.id===rule.oldRowId),replacement=rows.find(row=>row.id===rule.replacementRowId);
    if(!copiedTESUPlacementSuperseded(model,requirement,candidate,replacement)||!other.some(entry=>parsePlacement(entry).row===replacement.id))continue;
    supersededLegacyPlacements.push({modelId:program.modelId,requirementId:requirement.id,oldRowId:candidate.id,oldOptionId:candidate.optionId,replacementRowId:replacement.id,reason:'Exact current source-course and receiving-award evidence supersedes this copied candidate with no original version, period or grade evidence. The research row and its sources remain archived.'});
    other=other.filter(entry=>parsePlacement(entry).row!==candidate.id);
   }
   requirement.optionRows=other;
  }
  const usedRows=rows.filter(row=>placements.some(p=>p.modelId===program.modelId&&p.rowId===row.id));
  const usedSourceIds=usedRows.flatMap(row=>[...list(row.sourceIds),...list(row.extra?.sourceIds),...list(row.extra?.eligibilityReview?.sourceIds),...list(row.extra?.courseEligibilityResolution?.sourceIds)]);
  program.modelSourceIds=unique([...program.modelSourceIds,...usedSourceIds,degree.source.id,taxonomyEntry.source.id]);
 }
 for(const {source}of sources.values()){const at=kit.school.sources.findIndex(s=>s.id===source.id);if(at<0)kit.school.sources.push(source);else kit.school.sources[at]=source;}
 const classificationQuotes=[quote(taxonomyEntry.source,'D. Scientific Knowledge',taxonomyEntry.body),quote(taxonomyEntry.source,'BIO-1010: Introductory Biology',taxonomyEntry.body),quote(taxonomyEntry.source,'CIS-1070: Computer Concepts and Applications',taxonomyEntry.body)];
 const packet={kind:'tesu-exact-course-degree-placement-review',version:1,id:TESU_PLACEMENT_REVIEW,checkedOn:CHECKED,schoolName:kit.school.name,scope:'Named institution-submitted Sophia awards applied to exact published requirements, nonduplicating unrestricted electives, reviewed Liberal Studies Option A capacity, or the current Scientific Knowledge category explicitly listing BIO-1010 and CIS-1070. The award, original identity, generic provider approval and individual evaluation remain distinct.',courseEligibilityReviewId:'tesu-exact-course-eligibility-2026-11-26',providerApprovalStatusChanged:false,residencyCreditAwarded:0,sources:[...sources.values()].map(s=>s.source),sourceHashes:Object.fromEntries([...sources.values()].map(s=>[s.source.id,s.source.sha256])),classificationQuotes,models,placements,supersededLegacyPlacements};
 const newModelIds=new Set(placementRoster.filter(entry=>entry.authoringReview.reviewedOn==='2026-11-27').map(entry=>entry.modelId));
 const packetFor=(id,checkedOn,predicate)=>{
  const scopedModels=models.filter(model=>predicate(model.modelId)),ids=new Set(scopedModels.map(model=>model.modelId)),degreeIds=new Set(scopedModels.map(model=>model.degreeSourceId));
  const scopedSources=[...sources.values()].filter(entry=>entry.source.id===taxonomyEntry.source.id||degreeIds.has(entry.source.id)).map(entry=>entry.source);
  return{...packet,id,checkedOn,sources:scopedSources,sourceHashes:Object.fromEntries(scopedSources.map(source=>[source.id,source.sha256])),models:scopedModels,placements:placements.filter(entry=>ids.has(entry.modelId)),supersededLegacyPlacements:supersededLegacyPlacements.filter(entry=>ids.has(entry.modelId))};
 };
 const legacyPacket=packetFor(TESU_PLACEMENT_REVIEW,CHECKED,id=>!newModelIds.has(id)),additionalPacket=packetFor(TESU_PLACEMENT_ADDITIONS_REVIEW,'2026-11-27',id=>newModelIds.has(id));
 const serialize=v=>JSON.stringify(v,null,2)+'\n',writes=[['content/pathway-kits/tesu/equivalencies.json',kit.equivalencies],['content/pathway-kits/tesu/school.json',kit.school],['content/pathway-kits/tesu/course-placements-review-2026-11-26.json',legacyPacket],...(additionalPacket.models.length?[['content/pathway-kits/tesu/course-placements-review-2026-11-27.json',additionalPacket]]:[]),...kit.programs.map(p=>{const{file,...value}=p;return['content/pathway-kits/tesu/programs/'+p.slug+'.json',value];})];
 for(const[path,value]of writes){const text=serialize(value);if(check)assert.equal(await readFile(resolve(root,path),'utf8'),text,path+' has stale reviewed degree placements');else await writeFile(resolve(root,path),text);}
 return {reviewId:TESU_PLACEMENT_REVIEW,models:models.length,claims:rows.length,placements:placements.length,byModel:models.map(m=>({modelId:m.modelId,placements:placements.filter(p=>p.modelId===m.modelId).length})),providerApprovalStatusChanged:false,residencyCreditAwarded:0,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await applyTESUCoursePlacements({check:process.argv.includes('--check')})));
