import test from 'node:test';
import assert from 'node:assert/strict';
import {HOMEWORK_PROMPT_VERSION,HOMEWORK_SHARED_GUIDANCE,HOMEWORK_EXAMPLE_FACTS as facts,HOMEWORK_PROMPT_REVIEW} from './prompts/homework-v1.mjs';
import {HOMEWORK_EVALUATION_CASES,HOMEWORK_CACHE_PROBE_CASES,HOMEWORK_EVALUATION_LIMITS} from '../test-support/homework-evaluation.mjs';

test('synthetic homework demonstrations have independently checked numerical answers',()=>{
  const x=facts.algebra.solution;
  assert.equal(3*(x-2)+7,2*x+9);assert.equal(3*(x-2)+7,facts.algebra.checkedSide);
  const pay=facts.pay;
  assert.equal(pay.hours*60,pay.minutes);assert(Math.abs(pay.newHourlyRate/pay.hourlyRate-(1+pay.increase))<1e-12);assert.equal(pay.total/(pay.minutes/60),pay.newHourlyRate);
  const b=facts.breakEven,profit=n=>n*b.price-(b.fixedCost+n*b.variableCost);
  assert.equal(b.contribution,b.price-b.variableCost);assert.equal(profit(b.minimumUnits),b.minimumProfit);assert.equal(profit(b.minimumUnits-1),b.previousProfit);assert(profit(b.minimumUnits)>=0);assert(profit(b.minimumUnits-1)<0);
  const p=facts.probability;let all=0,favorable=0;
  for(let first=0;first<p.blue+p.gold;first++)for(let second=0;second<p.blue+p.gold;second++){if(first===second)continue;all++;if(first<p.blue&&second<p.blue)favorable++;}
  assert.equal(favorable*p.denominator,all*p.numerator);assert.equal(favorable,20);assert.equal(all,56);
  assert.equal(facts.passage.respondentsWithoutSpace/facts.passage.respondents,0.25);
});

test('shared guidance is deterministic, homework-only synthetic material with honest review provenance',()=>{
  assert.match(HOMEWORK_PROMPT_VERSION,/^[a-z0-9][a-z0-9._-]{0,79}$/);assert(HOMEWORK_SHARED_GUIDANCE.startsWith('DegreeSteps homework guidance\nVersion: '+HOMEWORK_PROMPT_VERSION));
  assert.equal((HOMEWORK_SHARED_GUIDANCE.match(/Example \d —/g)||[]).length,5);assert.doesNotMatch(HOMEWORK_SHARED_GUIDANCE,/https?:\/\/|\[S\d+\]|@example\./);
  assert.equal(HOMEWORK_PROMPT_REVIEW.version,HOMEWORK_PROMPT_VERSION);assert.equal(HOMEWORK_PROMPT_REVIEW.humanReviewClaimed,false);assert.equal(HOMEWORK_PROMPT_REVIEW.institutionalApprovalClaimed,false);assert.equal(HOMEWORK_PROMPT_REVIEW.exampleCount,5);
});

test('heldout and cache-probe expected values pass independent arithmetic checks',()=>{
  const [a,d,p]=HOMEWORK_EVALUATION_CASES;assert.equal(4*(2*a.expected.solution+1)-3,5*a.expected.solution+16);assert.equal(4*(2*a.expected.solution+1)-3,a.expected.checkedSide);
  assert.equal(750*12/100,d.expected.concentrateMl);assert.equal(750+250,d.expected.newTotalMl);assert.equal(100*d.expected.concentrateMl/d.expected.newTotalMl,d.expected.newPercent);
  let all=0,oneEach=0;for(let i=0;i<10;i++)for(let j=0;j<10;j++){if(i===j)continue;all++;if((i<4)!==(j<4))oneEach++;}assert.equal(all,p.expected.orderedTotal);assert.equal(oneEach,p.expected.orderedFavorable);assert.equal(oneEach*p.expected.denominator,all*p.expected.numerator);
  const [b,t]=HOMEWORK_CACHE_PROBE_CASES;const profit=n=>n*(45-27)-2700;assert.equal(45-27,b.expected.contribution);assert.equal(profit(b.expected.minimumUnits),0);assert.equal(profit(b.expected.minimumUnits-1),b.expected.previousProfit);assert.equal(80*0.75,t.expected.discountedPrice);assert(Math.abs(t.expected.discountedPrice*1.08-t.expected.total)<1e-10);
});

test('evaluation checks are executable smoke checks with mandatory semantic review',()=>{
  const cases=[...HOMEWORK_EVALUATION_CASES,...HOMEWORK_CACHE_PROBE_CASES];assert.equal(new Set(cases.map(c=>c.id)).size,5);assert.equal(HOMEWORK_EVALUATION_LIMITS.manualReviewRequired,true);assert.equal(HOMEWORK_EVALUATION_LIMITS.automaticChecksAreConclusive,false);
  const representative=['x = 5. Substitution gives 41 on both sides.','There are 90 mL of concentrate. The new concentration is 9%.','Both orders give 8/15.','The margin is 18 dollars; 150 units break even. At 149 units there is an 18 dollar loss.','Discounted price: $60. Total: $64.80.'];
  cases.forEach((c,i)=>{assert(c.manualReview.length>=3);for(const check of c.checks){assert(check.anyOf.length>0);const patterns=check.anyOf.map(source=>new RegExp(source,'i'));assert(patterns.some(regex=>regex.test(representative[i])),c.id+': '+check.id);assert(!patterns.some(regex=>regex.test('I cannot determine this from the information provided.')),c.id+': '+check.id+' rejects an unhelpful answer');}});
});

test('smoke checks do not accept an incorrect larger number or decimal as the expected answer',()=>{
  const [algebra,dilution,probability]=HOMEWORK_EVALUATION_CASES;
  const matches=(item,id,text)=>item.checks.find(check=>check.id===id).anyOf.some(source=>new RegExp(source,'i').test(text));
  assert(!matches(algebra,'answer','x = 5.2.'));assert(!matches(algebra,'check','Both sides are 41.5.'));
  assert(!matches(dilution,'amount','There is 0.90 mL of concentrate.'));assert(!matches(dilution,'percentage','The result is 0.9%.'));
  assert(!matches(probability,'fraction','The answer is 18/150.'));
});
