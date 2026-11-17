const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Planner = require('./dist/planner.js');
const wgu = JSON.parse(fs.readFileSync('./dist/data/curricula/wgu.json','utf8')).models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
const clone = value => JSON.parse(JSON.stringify(value));
const quoted = {providers:['Sophia','Study.com'],priority:'cost',universitySubscriptionTerms:2,fees:65,feesConfirmed:true,taxesConfirmed:true,providerMonths:{Sophia:1,'Study.com':1}};

test('actual WGU flat-term pricing compares costs under the same explicit paid-term assumption', () => {
  // This isolates the stated cost objective. Two paid terms are a user-entered
  // scenario, not evidence that this student can finish either workload in two.
  const automatic=Planner.generate(wgu,quoted), universityOnly=Planner.generate(wgu,{...quoted,providers:[]});
  assert.equal(automatic.validation.academicCountsValid,true);
  assert.equal(universityOnly.validation.academicCountsValid,true);
  assert.equal(automatic.costs.universityTuition,8100);
  assert.equal(automatic.costs.comparableUniversityTuition,true);
  assert(automatic.costs.knownSubtotal<=universityOnly.costs.knownSubtotal);
  assert.equal(automatic.costs.knownSubtotal,8165);
  assert.equal(automatic.totals.external,0);
  assert.equal(automatic.optimization.optimalityProven,true);
});

test('unknown or unbound native pricing keeps the original partial-cost fallback', () => {
  const missingTerms=Planner.generate(wgu,{...quoted,universitySubscriptionTerms:null});
  assert.equal(missingTerms.costs.universityTuition,null);
  assert.equal(missingTerms.costs.comparableUniversityTuition,false);
  assert.equal(missingTerms.totals.external,69);
  const unbound=clone(wgu);unbound.pricing.sourceIds=['missing-price-source'];
  const draft=Planner.generate(unbound,quoted);
  assert.equal(draft.costs.comparableUniversityTuition,false);
  assert.equal(draft.totals.external,69);
});

test('actual WGU contradictory paid terms leave the total incomplete without silently changing inputs', () => {
  const input={...quoted,priority:'speed',timing:{externalWeeks:{Sophia:2,'Study.com':3},externalConcurrency:1,universityCreditsPerTerm:12,universityTermWeeks:26}};
  const before=JSON.stringify(input), plan=Planner.generate(wgu,input);
  assert.equal(plan.timing.universityTerms,4);
  assert.equal(plan.costs.universitySubscriptionTerms,2);
  assert.equal(plan.costs.universityTuition,8100);
  assert.equal(plan.costs.total,null);
  assert.equal(plan.costs.costComplete,false);
  assert.equal(plan.costs.universityTermConflict.code,'subscription-term-count-conflict');
  assert(plan.costs.missing.some(reason=>/schedule uses 4 university terms/.test(reason)));
  assert.equal(JSON.stringify(input),before);
  const aligned=Planner.generate(wgu,{...input,universitySubscriptionTerms:4});
  assert.equal(aligned.costs.universityTermConflict,undefined);
  assert.equal(aligned.costs.universityTuition,16200);
  assert.equal(aligned.costs.costComplete,true);
});

test('study subterms and membership study durations are not mistaken for paid billing terms', () => {
  const plan=Planner.generate(wgu,{...quoted,priority:'speed',timing:{externalWeeks:{Sophia:2,'Study.com':3},externalConcurrency:1,universityCreditsPerTerm:12,universityTermWeeks:8}});
  assert(plan.timing.universityTerms>2);
  assert.equal(plan.costs.universityTermConflict,undefined,'eight-week study periods are not six-month paid terms');
  assert.equal(plan.costs.universitySubscriptionTerms,2);
  assert.equal(plan.costs.providerCosts.find(row=>row.provider==='Sophia').months,1);
  assert.match(plan.costs.providerBillingAssumption,/separate from study duration/);
});

function flatSemesterFixture() {
  // Mathematical fixture: fifteen credits fit in the same published-rate band
  // before or after one transfer. This is not an offered degree template.
  return {id:'semester-price-objective-fixture',school:'Example University',title:'Pricing fixture',format:'Online',creditSystem:'semester',totalCredits:15,institutionMinCredits:12,majorMinInstitutionCredits:0,upperMinCredits:0,sources:[{id:'tuition',url:'https://example.edu/tuition'}],unresolved:[],pricing:{model:'banded-term',termRate:12695,bandMin:12,bandMax:18,partTimeRate:870,period:'semester',currency:'USD',sourceIds:['tuition'],sourceUrl:'https://example.edu/tuition'},requirements:Array.from({length:5},(_,index)=>({id:'r'+index,code:'U'+index,title:'Course '+index,credits:3,category:'general',options:[{id:'u'+index,provider:'University',code:'U'+index,title:'University course '+index,credits:3,evidence:'published',sourceIds:['tuition']},...(index===0?[{id:'s0',provider:'Sophia',code:'SOPH-FIXTURE',title:'Outside fixture course',credits:3,evidence:'published',sourceIds:['tuition']}]:[])]}))};
}

test('native semester cost objective agrees with every fully pinned assignment', () => {
  const program=flatSemesterFixture(), input={priority:'cost',providers:['Sophia'],timing:{universityCreditsPerTerm:18},fees:0,feesConfirmed:true,taxesConfirmed:true};
  const allUniversity=Planner.generate(program,{...input,optionSelections:{r0:'u0'}});
  const withTransfer=Planner.generate(program,{...input,optionSelections:{r0:'s0'}});
  assert.equal(allUniversity.validation.academicCountsValid,true);
  assert.equal(withTransfer.validation.academicCountsValid,true);
  assert.equal(allUniversity.costs.universityTuition,12695);
  assert.equal(withTransfer.costs.universityTuition,12695);
  assert.equal(withTransfer.costs.knownSubtotal,12794);
  for (const priority of ['cost','balanced']) {
    const automatic=Planner.generate(program,{...input,priority});
    assert.equal(automatic.costs.comparableUniversityTuition,true);
    assert.equal(automatic.costs.knownSubtotal,Math.min(allUniversity.costs.knownSubtotal,withTransfer.costs.knownSubtotal));
    assert.equal(automatic.totals.external,0);
    assert.equal(automatic.optimization.optimalityProven,true);
  }
});
