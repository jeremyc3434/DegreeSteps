/* Exact online associate elective choices; no degree requirements or awards inferred. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const reviewPath='content/curricula/snapshots/liberty/associate-named-choices-2026-2027-reviewed.json';
const packet=JSON.parse(readFileSync(new URL('../'+reviewPath,import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value)),list=value=>Array.isArray(value)?value:[];
const year=value=>String(value||'').replace(/[–—]/g,'-');
const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-');
function upsert(items,item){const index=items.findIndex(value=>value.id===item.id);if(index<0)items.push(item);else items[index]=item;}
function namedUniversity(choice,programSourceId){
 assert(/^[A-Z]{2,6} \d{3}$/.test(choice.code)&&choice.credits>0&&choice.sourceIds?.length,'Named university choices need exact sourced courses.');
 return {id:'university-aa-choice-'+slug(choice.code),provider:'University',code:choice.code,title:choice.title,credits:choice.credits,creditSystem:'semester',creditOrigin:'institutional',upper:choice.upper===true,sourceIds:[programSourceId,...choice.sourceIds],evidence:'published',selectionRequired:false};
}
function namedOutside(award,review){
 assert(award.provider==='Sophia'&&['SOPH-0021','SOPH-0041'].includes(award.code)&&award.credits===1&&award.creditSystem==='semester'&&award.sourceIds?.length,'Only the two reviewed one-credit awards are allowed.');
 const {sourceCredits,sourceCreditSystem,reviewedExtract,...option}=clone(award);
 return {...option,id:'liberty-aa-choice-'+slug(award.code),evidence:'conditional',creditOrigin:'alternative',sourceCreditStatus:'unknown',mappingReviewId:review.id,mappingChecked:review.checkedOn,mappingScope:'Published online one-credit receiving award proposed within the exact associate general-elective allocation.',conditions:['The receiving guide identifies this one-credit elective award. Independent source recommendation periods and individual duplicate-learning and transfer evaluation remain separate.'],selectionRequired:false};
}
export function applyCompiled(input,review=packet){
 const scope=list(review.programs).find(program=>program.modelId===input?.id);if(!scope)return input;
 assert(review.version===1&&review.school==='Liberty University'&&review.catalogYear==='2026-2027'&&review.format==='Online'&&review.creditSystem==='semester','Use the reviewed associate choice packet.');
 assert(input.school===review.school&&input.format==='Online'&&year(input.catalogYear||input.catalog)==='2026-2027'&&input.totalCredits===scope.degreeCredits&&input.majorResidencyBasisCredits===scope.majorResidencyBasisCredits,'Associate choices do not match this exact degree/catalog/format.');
 const model=clone(input),sources=new Map(list(model.sources).map(source=>[source.id,source]));
 assert(sources.has(scope.programSourceId),'The exact associate curriculum source is missing.');
 for(const source of review.sources){const url=new URL(source.url);assert(url.protocol==='https:'&&(url.hostname==='liberty.edu'||url.hostname.endsWith('.liberty.edu'))&&!url.username&&!url.password,'Associate evidence must be public official Liberty material.');sources.set(source.id,clone(source));}
 if(scope.splitRequirementId){
  const index=model.requirements.findIndex(row=>row.id===scope.splitRequirementId),partIds=[scope.splitRequirementId+'-a',scope.splitRequirementId+'-b'];
  if(index>=0){
   const original=model.requirements[index];assert(original.credits===2&&original.category==='major'&&original.freeElective===true&&!original.code,'Split only the reviewed two-credit general elective.');
   const parts=partIds.map((id,i)=>({...clone(original),id,title:'General elective — one credit '+(i+1),credits:1,selectionRequired:false,options:[]}));
   model.requirements.splice(index,1,...parts);
   model.curriculumSections=list(model.curriculumSections).map(section=>({...section,requirementIds:list(section.requirementIds).flatMap(id=>id===original.id?partIds:[id])}));
  }else assert(partIds.every(id=>model.requirements.some(row=>row.id===id&&row.credits===1&&row.freeElective===true)),'The reviewed two-credit allocation changed.');
  for(const row of model.requirements.filter(row=>row.id.startsWith(scope.generalElectivePrefix))){
   assert(row.category==='major'&&row.freeElective===true&&!row.code,'The published general-elective permission changed.');row.options=list(row.options);
   row.options=row.options.filter(option=>(option.provider!=='University'||option.code&&!option.selectionRequired)&&!option.id.startsWith('university-aa-choice-')&&!option.id.startsWith('liberty-aa-choice-'));
   if(row.credits===3)for(const choice of review.universityChoices.filter(choice=>choice.requirementId===row.id))upsert(row.options,namedUniversity(choice,scope.programSourceId));
   if(row.credits===1){const partIndex=row.id.endsWith('-a')?0:1;upsert(row.options,namedUniversity(review.oneCreditUniversityChoices[partIndex],scope.programSourceId));for(const award of review.oneCreditAwards)upsert(row.options,namedOutside(award,review));}
   row.selectionRequired=false;
  }
 }
 if(scope.psychologyElectivePrefix){
  const rows=model.requirements.filter(row=>row.id.startsWith(scope.psychologyElectivePrefix));assert(rows.length===3,'The three published psychology elective allocations changed.');
  const fixedCodes=new Set(model.requirements.filter(row=>!rows.includes(row)).map(row=>row.code).filter(Boolean));
  for(const row of rows){
   assert(row.credits===3&&row.category==='major'&&list(row.allowedCoursePrefixes||row.allowedPrefixes).includes('PSYC')&&!row.code,'The published psychology elective permission changed.');row.options=list(row.options);
   row.options=row.options.filter(option=>option.provider!=='University'||option.code&&!option.selectionRequired);
   const choice=review.psychologyChoices[rows.indexOf(row)];assert(choice&&choice.code.startsWith('PSYC ')&&!fixedCodes.has(choice.code)&&choice.offeredOnline===true,'The named psychology choice must remain an unused published online PSYC course.');for(const id of choice.baselinePrerequisiteIds)assert(model.requirements.some(requirement=>requirement.id===id),'The chosen prerequisite route no longer exists.');upsert(row.options,namedUniversity(choice,scope.programSourceId));
   if(review.psychologyChoices.length){row.prerequisites=[...new Set([...list(row.prerequisites),...review.psychologyChoices.flatMap(choice=>choice.baselinePrerequisiteIds)])];row.prerequisiteSourceIds=[...new Set(review.psychologyChoices.flatMap(choice=>choice.sourceIds))];row.prerequisitePolicy={status:'verified',catalogYear:review.catalogYear,format:'Online',rule:clone(choice.prerequisiteRule),sourceIds:[...row.prerequisiteSourceIds],checkedOn:review.checkedOn};row.prerequisiteNotes='For the named university psychology choices, this baseline uses the already-required PSYC 101 and PSYC 255 to satisfy the published prerequisite alternative. Official accepted completion is still required before university enrollment.';row.selectionRequired=false;}
  }
 }
 const used=new Set(model.requirements.flatMap(row=>list(row.options).flatMap(option=>list(option.sourceIds))));for(const id of used)assert(sources.has(id),'A named choice lost its source.');
 model.sources=[...sources.values()];assert(model.requirements.reduce((sum,row)=>sum+row.credits,0)===model.totalCredits,'Named choices must preserve the exact degree ledger.');
 model.associateNamedChoicesReview={id:review.id,checkedOn:review.checkedOn,degreeCreditTotalChanged:false,allocationRowsRefined:Boolean(scope.splitRequirementId),individualAwardsCreated:0};
 return model;
}
