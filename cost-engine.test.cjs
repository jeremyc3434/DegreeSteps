const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Cost = require('./dist/cost-engine.js');
const clone = value => JSON.parse(JSON.stringify(value));
const base = (id, model, pace = {}) => ({id,schoolId:id,totalUnits:120,scenarioTransferLimit:90,defaultTransferUnits:90,model,pace:{defaultUnits:15,min:3,max:18,termLabel:'term',...pace}});
const liberty = base('liberty-residential',{type:'banded-term',termRate:12695,partTimeRate:870,bandMin:12,bandMax:18},{termLabel:'semester'});
const libertyOnline = base('liberty-online',{type:'threshold-credit',fullTimeRate:410,partTimeRate:475,fullTimeMin:12},{termLabel:'semester'});
const tesu = base('tesu',{type:'banded-term',termRate:4652,partTimeRate:584,bandMin:9,bandMax:18},{termLabel:'12-week term',teachingWeeks:12});
const snhu = base('snhu',{type:'per-credit',rate:354},{defaultUnits:6,max:6,teachingWeeks:8,termLabel:'8-week term'});
const cosc = base('charter-oak',{type:'per-credit',rate:329},{termLabel:'semester'});
const umpi = base('umpi',{type:'paid-term',termRate:1800,defaultBeforeTerms:8,defaultAfterTerms:2},{teachingWeeks:8,termLabel:'8-week session'});
const wgu = {...base('wgu',{type:'paid-term',termRate:4030,defaultBeforeTerms:8,defaultAfterTerms:3},{termLabel:'6-month term'}),scenarioTransferLimit:88,defaultTransferUnits:88};
const entries = [liberty,libertyOnline,snhu,tesu,cosc,umpi,wgu];

test('exports a pure browser API without storage or network dependencies', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync('./dist/cost-engine.js','utf8'),browser);
  assert.equal(typeof browser.DegreeCostComparison.calculate,'function');
  assert.equal(typeof browser.DegreeCostComparison.compare,'function');
  assert.equal(browser.localStorage,undefined); assert.equal(browser.fetch,undefined);
  assert.equal(browser.DegreeCostComparison.calculate(liberty).savings,74170);
});
test('dated example math covers all pricing models without disguising outside-credit costs', () => {
  const expected = [
    [liberty,101560,25390,74170,8,2],
    [libertyOnline,49200,12300,34900,8,2],
    [snhu,42480,10620,29860,20,5],
    [tesu,37216,9304,25912,8,2],
    [cosc,39480,9870,27610,8,2],
    [umpi,14400,3600,8800,8,2],
    [wgu,32240,12090,18150,8,3]
  ];
  for (const [entry,before,after,savings,beforeTerms,afterTerms] of expected) {
    const result = Cost.calculate(entry);
    assert.equal(result.beforeTuition,before,entry.id); assert.equal(result.afterTuition,after,entry.id);
    assert.equal(result.outsideBudget,2000,entry.id); assert.equal(result.afterTotal,after+2000,entry.id);
    assert.equal(result.savings,savings,entry.id); assert.equal(result.beforeTerms,beforeTerms);assert.equal(result.afterTerms,afterTerms);
    assert.equal(result.scope,'university-tuition-plus-outside-budget');
  }
});
test('flat-rate models bill the final part-time load at its actual rate', () => {
  const result=Cost.calculate(liberty,{transferUnits:87,outsideBudget:1500});
  assert.deepEqual(result.afterLoads,[15,15,3]);assert.equal(result.afterTuition,2*12695+3*870);assert.equal(result.afterTerms,3);
  const finalBand=Cost.calculate(liberty,{transferUnits:78});assert.deepEqual(finalBand.afterLoads,[15,15,12]);assert.equal(finalBand.afterTuition,3*12695);
  const belowBand=Cost.calculate(liberty,{transferUnits:90,unitsPerTerm:11});assert.deepEqual(belowBand.afterLoads,[11,11,8]);assert.equal(belowBand.afterTuition,30*870);
  const tesuTail=Cost.calculate(tesu,{transferUnits:89,unitsPerTerm:18});assert.deepEqual(tesuTail.afterLoads,[18,13]);assert.equal(tesuTail.afterTuition,2*4652);
});
test('threshold per-credit tuition applies full-time rates only in each qualifying term', () => {
  const mixed=Cost.calculate(libertyOnline,{transferUnits:87});assert.deepEqual(mixed.afterLoads,[15,15,3]);assert.equal(mixed.afterTuition,30*410+3*475);
  const partTime=Cost.calculate(libertyOnline,{unitsPerTerm:6});assert.equal(partTime.beforeTuition,120*475);assert.equal(partTime.afterTuition,30*475);
  const exactThreshold=Cost.calculate(libertyOnline,{unitsPerTerm:12});assert.deepEqual(exactThreshold.afterLoads,[12,12,6]);assert.equal(exactThreshold.afterTuition,24*410+6*475);
});
test('credit-based pacing affects university term counts while per-credit tuition stays constant', () => {
  const normal=Cost.calculate(snhu),slower=Cost.calculate(snhu,{unitsPerTerm:3});
  assert.equal(slower.afterTuition,normal.afterTuition);assert.equal(normal.afterTerms,5);assert.equal(slower.afterTerms,10);
  assert.equal(normal.afterTeachingWeeks,40);assert.equal(slower.afterTeachingWeeks,80);
  assert.deepEqual(Cost.calculate(tesu).teachingWeeks,{before:96,after:24,avoided:72});
  assert.equal(Cost.calculate(liberty).teachingWeeks,undefined,'An unknown calendar is not invented from a semester label');
});
test('paid-term examples do not turn a transfer percentage into automatic term savings', () => {
  const noTermsAvoided=Cost.calculate(wgu,{beforeTerms:8,afterTerms:8});
  assert.equal(noTermsAvoided.transferUnits,88);assert.equal(noTermsAvoided.remainingUnits,32);
  assert.equal(noTermsAvoided.beforeTuition,noTermsAvoided.afterTuition);assert.equal(noTermsAvoided.savings,-2000);
  const moreTerms=Cost.calculate(umpi,{beforeTerms:2,afterTerms:3,outsideBudget:3000});assert.equal(moreTerms.savings,-4800);assert.equal(moreTerms.universityTermsAvoided,-1);
  const changedCredit=Cost.calculate(wgu,{transferUnits:60,beforeTerms:8,afterTerms:3});assert.equal(changedCredit.afterTuition,12090,'Explicit paid term assumptions remain visible independent inputs');
});
test('zero transfer is the same no-transfer scenario and never fabricates a savings gain', () => {
  for (const entry of entries) {
    const result=Cost.calculate(entry,{transferUnits:0,outsideBudget:5000});
    assert.equal(result.outsideBudget,0,entry.id);assert.equal(result.beforeTotal,result.afterTotal,entry.id);assert.equal(result.savings,0,entry.id);
    assert.equal(result.beforeTerms,result.afterTerms,entry.id);assert.equal(result.savingsPercent,0,entry.id);
  }
  assert.equal(Cost.calculate(wgu,{transferUnits:0,beforeTerms:7,afterTerms:1}).zeroTransferTermReset,true);
});
test('a stated zero budget and signed cost increases remain transparent', () => {
  const free=Cost.calculate(snhu,{outsideBudget:0});assert.equal(free.savings,31860);
  const expensive=Cost.calculate(snhu,{outsideBudget:40000});assert.equal(expensive.savings,-8140);assert(expensive.savingsPercent<0);
  assert.equal(Cost.calculate(snhu,{outsideBudget:2000.50}).afterTotal,12620.50);
});
test('form decimal strings are accepted without blank or nonfinite numeric coercion', () => {
  assert.equal(Cost.calculate(snhu,{outsideBudget:'2000.50',transferUnits:'90',unitsPerTerm:'6'}).afterTotal,12620.50);
  for(const value of ['', ' ', '12abc', '0x10', '1e3', 'Infinity', 'NaN', true, null, NaN, Infinity, -1]) assert.throws(()=>Cost.calculate(snhu,{outsideBudget:value}),undefined,String(value));
  for(const value of [91,90.5,-1,NaN,null]) assert.throws(()=>Cost.calculate(snhu,{transferUnits:value}));
  for(const value of [0,2,7,6.5,NaN,'']) assert.throws(()=>Cost.calculate(snhu,{unitsPerTerm:value}));
  for(const value of [0,41,1.5,null,'']) assert.throws(()=>Cost.calculate(wgu,{beforeTerms:value}));
  assert.throws(()=>Cost.calculate(wgu,{afterTerms:41}));assert.throws(()=>Cost.calculate(wgu,{transferUnits:89}));
});
test('invalid or incomplete price data is never interpreted as free tuition', () => {
  for(const rate of [undefined,null,0,-1,NaN,Infinity]) assert.throws(()=>Cost.calculate({...snhu,model:{type:'per-credit',rate}}));
  assert.throws(()=>Cost.calculate({...liberty,pace:{...liberty.pace,max:30}},{unitsPerTerm:21}),/band/);
  assert.throws(()=>Cost.calculate({...snhu,scenarioTransferLimit:121}));
  assert.throws(()=>Cost.calculate({...snhu,model:{type:'unknown'}}));
  assert.throws(()=>Cost.calculate({...snhu,pace:{...snhu.pace,teachingWeeks:0}}));
  assert.throws(()=>Cost.calculate(snhu,{outsideBudget:100000.01}));
  assert.throws(()=>Cost.calculate(snhu,{typoBudget:100}));
  assert.throws(()=>Cost.calculate(wgu,{unitsPerTerm:15}));
  assert.throws(()=>Cost.calculate(snhu,{afterTerms:1}));
});
test('shared comparison retains school-specific load, transfer and paid-term assumptions without mutating data', () => {
  const data={defaultOutsideBudget:3000,entries:clone(entries)},snapshot=JSON.stringify(data);
  const results=Cost.compare(data);assert.equal(results.length,7);assert(results.every(row=>row.outsideBudget===3000));
  assert.equal(results.find(row=>row.entryId==='snhu').afterTerms,5);assert.equal(results.find(row=>row.entryId==='wgu').afterTerms,3);assert.equal(results.find(row=>row.entryId==='wgu').transferUnits,88);
  assert.equal(Cost.compare(data,{outsideBudget:1500})[0].outsideBudget,1500);
  assert.equal(JSON.stringify(data),snapshot);assert.equal(Cost.compare(entries,{outsideBudget:1000})[0].outsideBudget,1000);
  assert.throws(()=>Cost.compare(data,{unitsPerTerm:15}));assert.throws(()=>Cost.compare({entries:null}));
});
test('currency rounding is stable and the optional display helper refuses missing costs', () => {
  const fractional=Cost.calculate({...snhu,model:{type:'per-credit',rate:354.33}},{outsideBudget:2000.1});
  assert.equal(fractional.beforeTuition,42519.60);assert.equal(fractional.afterTuition,10629.90);assert.equal(fractional.afterTotal,12630);assert.equal(fractional.savings,29889.60);
  assert.equal(Cost.money(101560),'$101,560');assert.equal(Cost.money(-2000),'-$2,000');assert.throws(()=>Cost.money(null));
});

test('half-cent or overly precise currency is rejected rather than rounded into misleading amounts', () => {
  for (const value of [10.075, '1.005', 0.009]) assert.throws(()=>Cost.calculate(snhu,{outsideBudget:value}), /decimal places/);
  assert.throws(()=>Cost.calculate({...snhu,model:{type:'per-credit',rate:354.333}}), /decimal places/);
  assert.equal(Cost.calculate(snhu,{outsideBudget:'10.070'}).outsideBudget,10.07);
});
