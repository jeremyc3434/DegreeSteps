const test=require('node:test'),assert=require('node:assert/strict');
const {loadData,captureRoute}=require('./scripts/audit-student-confirmations.cjs'),data=loadData();
test('a full online healthcare ledger uses the reviewed online receiving guide rather than inherited residential uncertainty',()=>{
 const model=data.models.find(model=>model.id==='curriculum-liberty-healthcare-administration-bs-online'),req=model.requirements.find(req=>req.code==='ENGL 101'),option=req.options.find(option=>option.provider==='Sophia'&&option.code==='SOPH-0015');assert(option);assert.equal(option.evidence,'published');assert.equal(option.receivingCode,'ENGL 101');assert(model.sources.some(source=>option.sourceIds.includes(source.id)&&source.url==='https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf'));
 const route=data.catalog.pathways.find(route=>route.modelId===model.id),{draft}=captureRoute({routeId:route.id,data});assert(draft.plan.totals.external<=90);assert(draft.plan.totals.institutional>=30);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.validation.academicCountsValid,true);
});
test('newly named accounting choices receive only the delivery-format-correct official award',()=>{const model=data.models.find(model=>model.id==='curriculum-liberty-accounting-bs-residential'),req=model.requirements.find(req=>req.code==='ENGL 101'),option=req.options.find(option=>option.provider==='Sophia'&&option.code==='SOPH-0015');assert.equal(option.evidence,'published');assert(model.sources.some(source=>option.sourceIds.includes(source.id)&&source.url==='https://www.liberty.edu/residential/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf'));assert(!option.conditions.some(text=>/another degree|exact degree and delivery-format application require confirmation/.test(text)));assert.equal(model.totalCredits,120);});
test('inherited options never cross Liberty delivery formats, including flexible elective blocks',()=>{
 const originModes={'liberty-business-residential':'Residential','liberty-criminal-justice-residential':'Residential','liberty-criminal-justice-online':'Online'};let examined=0;
 for(const model of data.models.filter(model=>model.school==='Liberty University'))for(const row of model.requirements)for(const option of row.options||[])for(const sourceId of option.sourceIds||[]){
  const origin=sourceId.split('--')[0];if(!Object.hasOwn(originModes,origin))continue;
  examined++;assert.equal(model.format,originModes[origin],model.id+': '+row.id+' borrowed '+option.code+' from '+origin);
 }
 assert(examined>0,'Exercise existing inherited receiving awards');
});
test('inherited independently reviewed quantities retain their ACE-period and nested evidence references',()=>{
 let examined=0;
 for(const model of data.models.filter(model=>model.school==='Liberty University')){
  const sources=new Set(model.sources.map(source=>source.id));
  for(const row of model.requirements)for(const option of row.options||[]){
   if(!(option.sourceIds||[]).some(id=>id.includes('--'))||!option.recommendationPeriodSourceIds?.length)continue;
   examined++;
   const references=[...option.recommendationPeriodSourceIds,...(option.identitySourceIds||[]),...(option.providerCoursePassingSourceIds||[]),...(option.sourceCreditEvidence?.sourceIds||[])];
   assert(references.every(id=>sources.has(id)),model.id+': '+option.code+' has a dangling inherited source reference');
  }
 }
 assert(examined>0,'Exercise actual inherited versioned provider evidence');
});
