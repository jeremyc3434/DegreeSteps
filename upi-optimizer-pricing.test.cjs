/* Synthetic receiving ledgers exercise price selection; they are not university awards. */
'use strict';
const {test,before}=require('node:test'),assert=require('node:assert/strict');
const P=require('./dist/planner.js'),review=require('./content/catalog/upi-course-identities-reviewed-2026-11-25.json');
const copy=value=>structuredClone(value);let identity,attach;
before(async()=>{identity=(await import('./scripts/tesu-upi-maps.mjs')).upiKitIdentity;attach=(await import('./scripts/upi-course-pricing.mjs')).attachUPICoursePurchasePrice;});
const course=code=>review.courses.find(row=>row.aceId===code);
const university=(id,credits=3)=>({id:'u-'+id,provider:'University',code:'UNI-'+id,title:'Synthetic university course '+id,credits,evidence:'published',sourceIds:['fixture-catalog']});
const upi=(code,id,credits=3)=>({...identity(course(code)),id:'upi-'+id,provider:'UPI Study',credits,creditSystem:'semester',creditOrigin:'alternative',evidence:'conditional',sourceIds:[...course(code).identitySourceIds,'fixture-map'],conditions:['Synthetic receiving placement, not a university award.']});
const study=id=>({id:'study-'+id,provider:'Study.com',code:'SDCM-FIXTURE-'+id,title:'Synthetic Study course '+id,credits:3,evidence:'published',sourceIds:['fixture-map']});
function model(rows){
  const requirements=rows.map((row,index)=>({id:'r'+index,code:'R'+index,title:'Synthetic requirement '+index,category:'general',credits:row.credits??3,options:[university('r'+index,row.credits??3),...row.options]}));
  requirements.push({id:'capstone',code:'CAP',title:'Synthetic university capstone',credits:3,category:'major',institutionalOnly:true,options:[university('capstone')]});
  const total=requirements.reduce((sum,row)=>sum+row.credits,0);
  return {id:'upi-price-selection-fixture',title:'Synthetic degree fixture',format:'Online',creditSystem:'semester',totalCredits:total,institutionMinCredits:3,majorMinInstitutionCredits:0,upperMinCredits:0,externalMaxCredits:total-3,alternativeMaxCredits:total-3,sources:[...copy(review.sources),{id:'fixture-map',url:'https://example.edu/transfer'},{id:'fixture-catalog',url:'https://example.edu/catalog'}],requirements,unresolved:[]};
}
const input=extra=>({providers:['UPI Study','Study.com'],priority:'cost',allowConditional:true,universityRate:100,fees:0,feesConfirmed:true,taxesConfirmed:true,examFeesConfirmed:true,providerMonths:{'Study.com':1},optimizationNodeBudget:100000,...extra});
const cost=plan=>plan.costs.providerCosts.find(row=>row.provider==='UPI Study');

test('the actual shared UPI identity helper attaches only exact source-bound standalone fees',()=>{
  const original=identity(course('UPIS-0003'));assert.equal(original.cost,250);assert.equal(original.costVerified,true);assert.equal(original.costStatus,'reviewed-source-course-purchase');assert.equal(original.costEvidence.sourceCredits,3);assert.equal(original.costEvidence.includesMembership,false);
  for(const patch of[{courseVersion:99},{sourceCredits:4},{sourceCreditSystem:'quarter'},{recommendationEnd:'2028-01-31'},{url:'https://www.upistudy.com/courses/another-course'}]){
    const changed=attach({...original,...patch},review);assert.equal(changed.cost,undefined);assert.equal(changed.costEvidence,undefined);assert.equal(changed.code,original.code);
  }
});

test('cost priority chooses a reviewed UPI purchase when it saves against native tuition',()=>{
  const p=model([{options:[upi('UPIS-0003','stats')]}]),before=JSON.stringify(p),plan=P.generate(p,input());
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.rows[0].option.provider,'UPI Study');assert.equal(cost(plan).amount,250);assert.equal(plan.costs.knownSubtotal,550);assert.equal(cost(plan).basis,'published-standalone-course-purchases');assert.match(cost(plan).detail,/standalone/);assert.equal(plan.costs.costComplete,false);assert(plan.costs.missing.some(value=>/UPI Study transcript charges/.test(value)));assert.equal(JSON.stringify(p),before);
  const cheaperUniversity=P.generate(p,input({universityRate:10}));assert.equal(cheaperUniversity.rows[0].option.provider,'University');
});

test('one UPI purchase can beat two paid Study months while a shared Study membership beats multiple UPI purchases',()=>{
  const one=model([{options:[upi('UPIS-0003','stats'),study('s0')]}]);
  assert.equal(P.generate(one,input({providerMonths:{'Study.com':2}})).rows[0].option.provider,'UPI Study');
  assert.equal(P.generate(one,input()).rows[0].option.provider,'Study.com');
  const two=model([{options:[upi('UPIS-0003','stats'),study('s0')]},{options:[upi('UPIS-0010','db'),study('s1')]}]),plan=P.generate(two,input());
  assert.deepEqual(plan.rows.slice(0,2).map(row=>row.option.provider),['Study.com','Study.com']);assert.equal(plan.costs.providerCosts.find(row=>row.provider==='Study.com').amount,235);assert.equal(plan.optimization.optimalityProven,true);
});

test('a valid split receiving bundle pays for one original UPI course rather than each allocation',()=>{
  const first={...upi('UPIS-0003','a',1),bundleId:'fixture-stats',bundleCredits:3},second={...upi('UPIS-0003','b',2),bundleId:'fixture-stats',bundleCredits:3};
  const p=model([{credits:1,options:[first]},{credits:2,options:[second]}]),plan=P.generate(p,input({priority:'transfer',optionSelections:{r0:first.id,r1:second.id}}));
  assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.external,3);assert.equal(cost(plan).amount,250);assert.equal(cost(plan).courseKeys.length,1);
});

test('changed original identities, missing provenance and altered fee metadata cannot inherit a priced UPI basket',()=>{
  for(const mutate of[
    option=>option.courseVersion=99,
    option=>option.sourceCredits=4,
    option=>option.cost=1,
    option=>option.costEvidence=null,
    option=>option.costEvidence.sourceIds=['fixture-map'],
    option=>option.costEvidence.sourceCreditSystem='quarter',
    option=>option.costEvidence.includesMembership=true,
    option=>option.costEvidence.checkedOn='2029-01-01'
  ]){
    const option=upi('UPIS-0003','stats');mutate(option);const p=model([{options:[option]}]),plan=P.generate(p,input({optionSelections:{r0:option.id},priority:'transfer'}));
    assert.equal(cost(plan),undefined);assert(plan.costs.missing.includes('UPI Study pricing'));assert.equal(plan.costs.total,null);
  }
});

test('a later generation observes changed pricing identity and completed coursework is not purchased again',()=>{
  const option=upi('UPIS-0003','stats'),p=model([{options:[option]}]),settings=input({priority:'transfer'});
  assert.equal(cost(P.generate(p,settings)).amount,250);p.requirements[0].options[1].courseVersion=99;
  assert.equal(cost(P.generate(p,settings)),undefined,'A previous generation cache cannot approve a changed future version.');
  const fresh=model([{options:[upi('UPIS-0003','stats')]}]),done=P.generate(fresh,input({completed:[{requirementId:'r0',optionId:'upi-stats',status:'reported'}]}));
  assert.equal(cost(done),undefined);assert.equal(done.totals.reported,3);assert(!done.costs.missing.includes('UPI Study pricing'));
});

const compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(Math.abs(d)>.000001)return d<0?-1:1;}return 0;};
function score(plan,priority){
  const providers=[...new Set(plan.rows.filter(row=>row.status==='planned'&&row.option.provider!=='University').map(row=>row.option.provider))],unknown=providers.filter(provider=>!plan.costs.providerCosts.some(row=>row.provider===provider&&Number.isFinite(row.amount))).length;
  return priority==='transfer'?[-plan.totals.external,unknown,plan.costs.knownSubtotal,providers.length]:[0,unknown,plan.costs.knownSubtotal+(priority==='balanced'?providers.length*250:0)];
}
for(const mixedUnknown of[false,true])test('UPI bounded search agrees with every fully pinned assignment, including '+(mixedUnknown?'a forced partly unpriced basket':'shared membership alternatives'),()=>{
  const rows=[{options:[upi('UPIS-0003','stats'),study('s0')]},{options:[upi('UPIS-0010','db'),study('s1')]},{options:[upi('UPIS-0011','python'),study('s2')]}];
  if(mixedUnknown)delete rows[2].options[0].costEvidence;
  const p=model(rows),settings=input(mixedUnknown?{optionSelections:{r2:'upi-python'}}:{}),menus=p.requirements.filter(row=>!row.institutionalOnly&&!settings.optionSelections?.[row.id]);
  const best=new Map();let feasible=0;
  function visit(index,selections){
    if(index<menus.length){for(const option of menus[index].options)visit(index+1,{...selections,[menus[index].id]:option.id});return;}
    const pinned=P.generate(p,{...settings,optionSelections:{...settings.optionSelections,...selections},optimizationNodeBudget:0});if(!pinned.validation.academicCountsValid)return;feasible++;
    for(const priority of['cost','balanced','transfer']){const value=score(pinned,priority);if(!best.has(priority)||compare(value,best.get(priority))<0)best.set(priority,value);}
  }
  visit(0,{});assert(feasible>0);
  for(const priority of['cost','balanced','transfer']){const plan=P.generate(p,{...settings,priority});assert.equal(plan.validation.academicCountsValid,true);assert.deepEqual(score(plan,priority),best.get(priority));assert.equal(plan.optimization.optimalityProven,true);}
});
