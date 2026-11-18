/* Upper electives cannot replace credits required inside an academic scope. */
const test=require('node:test'),assert=require('node:assert/strict');
const Planner=require('./dist/planner.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const settings={providers:['Sophia'],allowConditional:true,priority:'transfer',universityRate:100,fees:0,optimizationNodeBudget:100000};
function fixture(){
 const row=(id,group,alternatives=false)=>({id,code:id.toUpperCase(),title:id,category:group==='free-electives'?'elective':'major',subgroup:group,credits:3,options:[
  {id:'uni-'+id,provider:'University',code:'U-'+id,title:id,credits:3,upper:true,evidence:'published',sourceIds:['catalog']},
  ...(alternatives?[{id:'low-'+id,provider:'Sophia',code:'S-'+id,title:id,credits:3,upper:false,evidence:'published',sourceIds:['catalog']}]:[])
 ]});
 return{id:'upper-scope-fixture',title:'Synthetic scoped degree',format:'Online',creditSystem:'semester',totalCredits:24,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:18,
  upperGroupMinimums:[{group:'area-of-study',credits:12},{groups:['area-of-study','business-core'],credits:18}],
  sources:[{id:'catalog',url:'https://example.edu/catalog'}],unresolved:[],requirements:[...Array.from({length:6},(_,i)=>row('aos'+(i+1),'area-of-study',i>=4)),row('capstone','business-core'),row('free','free-electives')]};
}
function pinned(model,first,second){return Planner.generate(model,{...settings,optionSelections:{aos5:first,aos6:second},optimizationNodeBudget:0});}
test('upper free electives cannot satisfy the combined area/core minimum',()=>{
 const model=fixture(),plan=pinned(model,'low-aos5','low-aos6');
 assert.equal(plan.totals.upper,18,'The degree-wide number alone passes');
 assert.equal(plan.validation.academicCountsValid,false);assert(plan.validation.errors.some(error=>error.code==='group_upper'&&/area-of-study \/ business-core/.test(error.message)));
 assert(!plan.validation.errors.some(error=>error.code==='upper_minimum'));
});
test('a union allows sufficient area credits without an invented six-credit core minimum',()=>{
 const model=fixture(),before=JSON.stringify(model),plan=pinned(model,'uni-aos5','uni-aos6');
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.rows.filter(row=>row.subgroup==='business-core'&&row.upper).reduce((sum,row)=>sum+row.credits,0),3);
 assert.equal(JSON.stringify(model),before);
});
test('assignment-search bounds repair a scoped deficit and match exhaustive pinned alternatives',()=>{
 const model=fixture(),choices=[['uni-aos5','uni-aos6'],['low-aos5','uni-aos6'],['uni-aos5','low-aos6'],['low-aos5','low-aos6']];
 const feasible=choices.map(([a,b])=>pinned(model,a,b)).filter(plan=>plan.validation.academicCountsValid);
 assert.equal(feasible.length,3);const expected=Math.max(...feasible.map(plan=>plan.totals.external)),actual=Planner.generate(model,settings);
 assert.equal(expected,3);assert.equal(actual.totals.external,expected);assert.equal(actual.validation.academicCountsValid,true);assert.equal(actual.optimization.optimalityProven,true);
});
test('invalid or ambiguous upper-scope rules fail closed rather than doubling or dropping credits',()=>{
 const invalid=[{groups:['area-of-study','area-of-study'],credits:18},{groups:[],credits:18},{groups:['area-of-study',''],credits:18},{groups:'area-of-study',credits:18},{group:'area-of-study',groups:['business-core'],credits:18},{groups:['area-of-study'],credits:NaN},{groups:['area-of-study'],credits:Infinity},{groups:['area-of-study'],credits:-1},{groups:['area-of-study'],credits:'18'},null];
 for(const rule of invalid){const model=fixture();model.upperGroupMinimums=[rule];const plan=Planner.generate(model,settings);assert.equal(plan.validation.academicCountsValid,false,JSON.stringify(rule));assert(plan.validation.errors.some(error=>error.code==='upper_group_policy'));}
 const model=fixture();model.upperGroupMinimums={group:'area-of-study',credits:18};assert(Planner.generate(model,settings).validation.errors.some(error=>error.code==='upper_group_policy'));
});
test('legacy single-group constraints retain their meaning and inputs remain unchanged',()=>{
 const model=fixture();model.upperGroupMinimums=[{group:'area-of-study',credits:18}];const before=JSON.stringify([model,settings]),plan=Planner.generate(model,settings);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.external,0);assert.equal(JSON.stringify([model,settings]),before);
 const union=copy(model);union.upperGroupMinimums=[{groups:['area-of-study'],credits:18}];assert.deepEqual(Planner.generate(union,settings).rows,plan.rows);
});
