import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Estimate=require('../dist/plan-estimate-engine.js'),Cost=require('../dist/cost-engine.js');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const rates=read('content/estimates/plan-estimate-rates.json'),index=read('dist/data/plan-library-index.json');
const capture=file=>readFileSync(new URL('../content/source-captures/'+file+'.txt',import.meta.url),'utf8').replace(/\s+/g,' ');
const schools={'Strayer University':'strayer','Champlain College Online':'champlain','American Public University System':'apus','Bellevue University':'bellevue'};

test('every published Strayer, Champlain, APUS and Bellevue plan has exactly one reviewed estimate entry and a planning range',()=>{
  assert.equal(Estimate.assertRates(rates),rates);
  const plans=Object.values(index.plans).filter(plan=>/^curriculum-(strayer|champlain|apus|bellevue)-/.test(plan.modelId));
  assert.ok(plans.length>=62);
  for(const plan of plans){
    const entries=rates.entries.filter(entry=>entry.modelIds.includes(plan.modelId));
    assert.equal(entries.length,1,plan.modelId);
    assert.ok(Object.hasOwn(schools,entries[0].school));
    assert.ok(plan.estimate&&plan.estimate.min>0&&plan.estimate.max>=plan.estimate.min&&!plan.estimate.partial,plan.modelId);
  }
});

test('the rates and fees used are the ones printed on the captured school pages',()=>{
  const strayer=capture('f254fa4c21aff192'),strayerFees=capture('7815467e77b68a50'),champlain=capture('f52e1067de53768a'),apus=capture('ba1f7b98439b89c8'),bellevue=capture('5c73fd1762c7b974');
  assert.match(strayer,/On or after winter 2014 \$1,555 per course/);
  assert.match(strayerFees,/Technology Fee \*\* Fee applied each quarter[^$]*\$65/);
  assert.match(strayerFees,/Final Academic Requirements Evalutaion Fee[^$]*\$150/);
  assert.match(champlain,/Online Undergraduate Tuition Fall '26 - Summer '27 \$342 per credit/);
  assert.match(champlain,/\$150 One-time graduation fee/);
  assert.match(apus,/\$360 Per Undergraduate Credit Standard Rate/);
  assert.match(apus,/Technology Fee \(per undergraduate course\): \$0/);
  assert.match(apus,/Graduation \(Associate\): \$250 Graduation \(Bachelor's and Master's\): \$350/);
  assert.match(bellevue,/Online \$459 per credit hour/);
  assert.match(bellevue,/General College \$300 per term/);
  const by=school=>rates.entries.filter(entry=>entry.school===school);
  for(const entry of by('Strayer University')){assert.equal(entry.tuition.rate,345.56);assert.equal(entry.feesPerTerm,65);assert.equal(entry.oneTimeFees,entry.degreeUnits>=180?150:0);assert.equal(entry.creditSystem,'quarter');}
  for(const entry of by('Champlain College Online')){assert.equal(entry.tuition.rate,342);assert.equal(entry.oneTimeFees,150);}
  for(const entry of by('American Public University System')){assert.equal(entry.tuition.rate,360);assert.equal(entry.oneTimeFees,entry.degreeUnits>=120?350:250);}
  for(const entry of by('Bellevue University')){assert.equal(entry.tuition.rate,459);assert.equal(entry.feesPerTerm,300);assert.equal(entry.oneTimeFees,150);}
});

test('quarter-hour programs apply transfer credit in quarter steps while whole-unit programs still reject fractions',()=>{
  const base={id:'q',totalUnits:180,scenarioTransferLimit:180,defaultTransferUnits:58.5,model:{type:'per-credit',rate:345.56}};
  assert.equal(Cost.calculate({...base,unitStep:0.25},{outsideBudget:0,unitsPerTerm:9}).afterTuition,41985.54);
  assert.throws(()=>Cost.calculate({...base,unitStep:0.25},{transferUnits:58.3,outsideBudget:0,unitsPerTerm:9}));
  assert.throws(()=>Cost.calculate(base,{outsideBudget:0,unitsPerTerm:9}),/whole numbers/);
  assert.throws(()=>Cost.calculate({...base,unitStep:0.3},{outsideBudget:0,unitsPerTerm:9}),/whole numbers/);
});
