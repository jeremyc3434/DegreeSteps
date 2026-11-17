const test=require('node:test');
const assert=require('node:assert/strict');
const Planner=require('./dist/planner.js');
function fixture(){
 const requirements=Array.from({length:6},(_,i)=>({id:'course-'+i,code:'C'+i,title:'Course '+i,credits:2,category:'general',options:[{id:'u'+i,provider:'University',code:'C'+i,title:'Course '+i,credits:2,creditSystem:'competency-unit',evidence:'published',sourceIds:['catalog']},{id:'s'+i,provider:'Sophia',code:'S'+i,receivingCode:'C'+i,title:'Outside course '+i,credits:2,creditSystem:'competency-unit',sourceCredits:3,sourceCreditSystem:'semester',creditOrigin:'alternative',evidence:'published',sourceIds:['map']}]}));
 requirements.push({id:'capstone',code:'CAP',title:'Capstone',credits:4,category:'major',institutionalOnly:true,options:[{id:'cap',provider:'University',code:'CAP',title:'Capstone',credits:4,creditSystem:'competency-unit',evidence:'published',sourceIds:['catalog']}]});
 return {id:'residency-test',school:'Example',title:'Competency degree',totalCredits:16,creditSystem:'competency-unit',externalMaxCredits:12,alternativeMaxCredits:12,requirements,sources:[{id:'catalog',url:'https://example.edu/catalog'},{id:'map',url:'https://example.edu/maps'}],residencyPolicy:{type:'institution-fraction-with-capstone-exclusion',fraction:0.25,capstoneRequirementIds:['capstone'],capstoneCredits:4,sourceIds:['catalog'],interpretationStatus:'exact-floor-unresolved',conservativeSufficientCondition:{minimumNonCapstoneInstitutionCUs:4,basisCredits:16}}};
}
test('optimizer keeps the conservative noncapstone minimum without inventing a published floor',()=>{
 const model=fixture(),plan=Planner.generate(model,{providers:['Sophia'],priority:'transfer'});
 assert.equal(Planner.institutionResidencyMinimum(model),8);
 assert.equal(plan.validation.academicCountsValid,true);
 assert.equal(plan.totals.external,8);
 assert.equal(plan.totals.institutional,8);
 assert.equal(plan.coverage.publishedInstitutionMinimum,null);
 assert.equal(plan.coverage.conservativeInstitutionMinimum,8);
 assert.equal(plan.rows.find(row=>row.requirementId==='capstone').option.provider,'University');
 assert.equal(plan.rows.find(row=>row.option.provider==='Sophia').option.sourceCredits,3);
 assert.equal(plan.coverage.sourceCeiling,12);
});
test('an altered ledger cannot count excluded capstone units toward noncapstone residency',()=>{
 const model=fixture(),plan=Planner.generate(model,{providers:['Sophia']});
 const row=plan.rows.find(row=>row.option.provider==='University'&&row.requirementId!=='capstone');
 row.option=model.requirements.find(req=>req.id===row.requirementId).options[1];
 assert(Planner.validate(model,plan).errors.some(error=>error.code==='institution_residency'));
});
test('incomplete or weakened capstone calculations fail closed',()=>{
 for(const mutate of [m=>m.residencyPolicy.sourceIds=['missing'],m=>m.residencyPolicy.capstoneRequirementIds=['missing'],m=>m.residencyPolicy.capstoneCredits=3,m=>m.residencyPolicy.conservativeSufficientCondition.minimumNonCapstoneInstitutionCUs=3,m=>m.requirements.at(-1).institutionalOnly=false,m=>m.residencyPolicy.capstoneRequirementIds.push('capstone'),m=>m.creditSystem='semester',m=>m.residencyPolicy.creditSystem='semester']){
  const model=fixture();mutate(model);assert.equal(Planner.institutionResidencyMinimum(model),null);
  assert(Planner.generate(model,{providers:['Sophia'],optimizationNodeBudget:0}).validation.errors.some(error=>error.code==='institution_residency_policy'));
 }
});
test('existing absolute institutional minima retain their behavior',()=>{
 const model=fixture();delete model.residencyPolicy;model.institutionMinCredits=6;
 assert.equal(Planner.institutionResidencyMinimum(model),6);
 assert.equal(Planner.generate(model,{providers:['Sophia']}).totals.institutional,6);
});
test('a verified additional-capstone rule constrains the outside ceiling without inventing a literal published minimum',()=>{
 const model=fixture();model.residencyPolicy.interpretationStatus='verified-additional-capstone';model.residencyPolicy.calculatedMinimumInstitutionCUs=8;
 const plan=Planner.generate(model,{providers:['Sophia'],priority:'transfer'});
 assert.equal(plan.coverage.sourceCeiling,8);assert.equal(plan.coverage.publishedInstitutionMinimum,null);assert.equal(plan.coverage.derivedInstitutionMinimum,8);assert.equal(plan.coverage.conservativeInstitutionMinimum,undefined);assert(!plan.coverage.residencyCalculationBasis.includes('unresolved'));
 model.residencyPolicy.calculatedMinimumInstitutionCUs=4;assert.equal(Planner.institutionResidencyMinimum(model),null);assert(Planner.generate(model,{providers:['Sophia'],optimizationNodeBudget:0}).validation.errors.some(error=>error.code==='institution_residency_policy'));
});
