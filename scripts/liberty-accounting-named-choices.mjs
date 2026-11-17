/** Proposed Liberty-only choices inside reviewed 2026–27 degree allocations. */
import assert from 'node:assert/strict';
const copy=value=>JSON.parse(JSON.stringify(value));
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function applyLibertyAccountingNamedChoices(input,facts){
 if(input?.id!==facts?.modelId)return input;
 assert(facts.version===1&&facts.modelId==='curriculum-liberty-accounting-bs-residential'&&facts.school==='Liberty University'&&facts.catalogYear==='2026-2027'&&facts.totalCredits===120&&facts.choices.length===7,'Use the exact reviewed residential Accounting choices');
 assert(input.school==='Liberty University'&&input.format==='Residential'&&input.catalogYear==='2026-2027'&&input.totalCredits===120,'Choice evidence does not match this degree scope');
 const model=copy(input),sources=new Map((model.sources||[]).map(source=>[source.id,source]));
 for(const source of facts.sources){const url=new URL(source.url);assert(url.protocol==='https:'&&url.hostname==='catalog.liberty.edu'&&!url.username&&!url.password);sources.set(source.id,copy(source));}
 const makeUniversity=(code,title,credits,sourceIds)=>({id:'university-reviewed-'+code.toLowerCase().replaceAll(' ','-'),provider:'University',code,title,credits,upper:/ [34]\d\d$/.test(code),creditSystem:'semester',creditOrigin:'institutional',receivingCode:code,sourceIds:[...sourceIds],evidence:'published'});
 for(const choice of facts.choices){
  const row=model.requirements.find(row=>row.id===choice.requirementId);assert(row&&row.credits===3&&choice.credits===3&&/^[A-Z]{2,6} \d{3}$/.test(choice.selectedCode),'A reviewed choice no longer matches its allocation');
  if(row.code){assert(row.code===choice.selectedCode,'A previously selected course changed');continue;}
  assert(key(row.title)===key(choice.publishedRequirementTitle),'The published category changed');assert(!model.requirements.some(other=>other!==row&&other.code===choice.selectedCode),'Do not count a selected course twice');
  row.publishedRequirementTitle=choice.publishedRequirementTitle;row.code=choice.selectedCode;row.title=choice.selectedTitle;row.sourceIds=[...new Set([...(row.sourceIds||[]),choice.sourceId])];row.allowedCourseCodes=[choice.selectedCode];row.choiceNote='Proposed editable selection for the published '+choice.publishedRequirementTitle+' category. This course is not an additional required course.';row.choiceSelection={reviewId:facts.id,category:choice.publishedRequirementTitle,proposed:true};row.options=[makeUniversity(row.code,row.title,row.credits,row.sourceIds)];delete row.bucket;delete row.selectionRequired;delete row.researchGap;
 }
 const free=facts.freeElective;assert(free.code==='RMGT 210'&&free.credits===2&&free.publishedOffering==='Residential','Use the reviewed two-credit course without prorating another award');
 let remainder=model.requirements.find(row=>row.freeElective&&row.credits===2&&!row.code),raw=model.requirements.find(row=>row.id==='free-electives'&&row.bucket&&row.credits===14);
 if(raw&&!model.requirements.some(row=>row.code===free.code)){raw.credits-=2;remainder={id:'free-electives-reviewed-two-credit-choice',title:'Proposed 2-credit free elective',credits:2,category:'electives',group:raw.group||'electives',freeElective:true,sourceIds:[...(raw.sourceIds||[])],options:[]};model.requirements.push(remainder);for(const section of model.curriculumSections||[])if(section.requirementIds?.includes(raw.id))section.requirementIds.push(remainder.id);}
 if(remainder){assert(!model.requirements.some(row=>row!==remainder&&row.code===free.code),'Do not duplicate the free elective');remainder.code=free.code;remainder.title=free.title;remainder.upper=false;remainder.sourceIds=[...new Set([...(remainder.sourceIds||[]),free.sourceId])];remainder.options=[makeUniversity(free.code,free.title,2,remainder.sourceIds)];remainder.prerequisites=[];remainder.choiceNote=free.notes;remainder.choiceSelection={reviewId:facts.id,category:'Free elective',proposed:true};delete remainder.bucket;delete remainder.selectionRequired;delete remainder.researchGap;}
 model.sources=[...sources.values()];model.namedChoiceReview={id:facts.id,checkedOn:facts.checkedOn,proposedSelections:8,transfersCreated:0};assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120,'Selections must preserve all degree credits');return model;
}
