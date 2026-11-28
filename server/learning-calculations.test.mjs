import test from 'node:test';
import assert from 'node:assert/strict';
import {getLearningCalculation,findLearningCalculationConflicts,createLearningCalculationFallback} from './learning-calculations.mjs';
const solve=prompt=>getLearningCalculation({project:{kind:'study',prompt}});

test('exact linear solving checks the original expressions rather than a model answer',()=>{
  const c=solve('Solve 4(2x + 1) - 3 = 5x + 16. Show the main solution steps and check your answer in the original equation.');
  assert(c);assert.equal(c.solution,'5');assert.equal(c.leftValue,'41');assert.equal(c.rightValue,'41');assert.equal(c.scope,'single-explicit-linear-equation');assert.match(c.steps[0],/8x \+ 1 = 5x \+ 16/);assert.match(c.steps[1],/3x = 15/);assert.equal(c.inputSource,'prompt');
  const negative=solve('Solve (2x + 1)/3 = (x - 4)/2.');assert.equal(negative.solution,'-14');assert.equal(negative.leftValue,'-9');assert.equal(negative.rightValue,'-9');
});
test('fractions and finite decimals retain exact arithmetic',()=>{
  assert.equal(solve('Solve x/3 + 1/2 = 5/6.').solution,'1');
  assert.equal(solve('Solve 0.1x = 0.3.').solution,'3');
  assert.equal(solve('Solve 3x = 2.').solution,'2/3');
  assert.equal(solve('Solve -x + .5 = 1.25.').solution,'-3/4');
  assert.equal(solve('Solve 2×(x+1) = 8÷2.').solution,'1');
});
test('unsupported, ambiguous, mixed and unsafe notation never receives a verification receipt',()=>{
  for(const prompt of ['Solve x+x=2 and y+1=3.','Solve x*x=4.','Solve x^2=4.','Solve x²=4.','Solve 2^x=8.','Solve sin(x)=0.','Solve log(x)=0.','Solve |x|=2.','Solve √x=2.','Solve y+x=3.','Solve x/x=1.','Solve 2x/0=3.','Solve x+1=x+2.','Solve x+1=x+1.','Solve 1 2x=4.','Solve 2e3x=6.','Solve (x+1=2.','Solve x=1. Explain photosynthesis.','Solve x=1; give current medical dosage.','globalThis.secret = 4','Solve x=process.exit().','Solve 2x=4<script>bad()</script>'])assert.equal(solve(prompt),null,prompt);
});
test('complexity, precision and magnitude bounds fail closed without executing text',()=>{
  assert.equal(solve('Solve '+'('.repeat(30)+'x'+')'.repeat(30)+'=2.'),null);
  assert.equal(solve('Solve '+('1+'.repeat(180))+'x=2.'),null);
  assert.equal(solve('Solve '+('9'.repeat(50))+'x=2.'),null);
  assert.equal(solve('Solve .123456789012345x=1.'),null);
  assert.equal(solve('Solve '+('999999999999999999999999*'.repeat(20))+'x=1.'),null);
  assert.equal(solve('x'.repeat(5000)+'=1'),null);
});
test('only a new explicit followup equation replaces the original task; notes never define it',()=>{
  const project={prompt:'Solve 2x=10.',studentNotes:'I think x=6.'};assert.equal(getLearningCalculation({project}).solution,'5');
  assert.equal(getLearningCalculation({project,message:'Please solve 3x=9.'}).solution,'3');
  assert.equal(getLearningCalculation({project,message:'Explain the substitution step.'}).solution,'5');
  assert.equal(getLearningCalculation({project,message:'I got x = 6, am I right?'}).solution,'5');
  assert.equal(getLearningCalculation({project,message:'Solve x+y=9.'}),null);
  assert.equal(getLearningCalculation({project,message:'Solve 3x=9 and 2x=5.'}),null);
});
test('wrong opening and summary are detected despite correct later work and checks',()=>{
  const calculation=solve('Solve 4(2x+1)-3=5x+16.');
  const artifact={summary:'x = 6. Both sides equal 31 when x = 6.',content:'Answer: x = 19/3\n\nStep 1: 8x + 1 = 5x + 16.\nStep 2: 3x = 15.\nFinal answer: x = 5.\nBoth sides equal 41.'};
  const issues=findLearningCalculationConflicts({artifact,calculation});assert(issues.some(x=>x.field==='summary'&&x.claim==='x = 6'));assert(issues.some(x=>x.field==='summary'&&x.claim==='Both sides equal 31'));assert(issues.some(x=>x.field==='content'&&x.claim==='Answer: x = 19/3'));assert(issues.every(x=>x.expected==='x = 5'||x.expected==='41'));
  assert(findLearningCalculationConflicts({artifact:{summary:'x = 6.',content:'Answer: x = 19/3 (about 6.33)\nFinal answer: x = 5.'},calculation}).some(x=>x.claim==='Answer: x = 19/3'));
  assert.equal(findLearningCalculationConflicts({artifact:{summary:'The solution is x = 5. Both sides are 41.',content:'Answer: 5\n\nFinal answer: x = 5.\nBoth sides equal 41.'},calculation}).length,0);
});
test('intermediate equations, student guesses, quotations and new practice are not final answer claims',()=>{
  const calculation=solve('Solve 4(2x+1)-3=5x+16.');
  const content='Answer: x = 5\n\n3x = 15\n-x = -5\nYour x = 6 is wrong; the solution is x = 5.\n> Student: x = 6. Both sides equal 31.\nFinal answer: x = 5\nBoth sides equal 41.\n\nNew practice: solve x+1=7.\nFinal answer: x = 6. Both sides equal 7.';
  assert.deepEqual(findLearningCalculationConflicts({artifact:{summary:'Your x = 6 answer needs correction; x = 5 works.',content},calculation}),[]);
  assert.deepEqual(findLearningCalculationConflicts({artifact:{summary:'x = 6 is not correct; x = 5 is the solution.',content},calculation}),[]);
  assert.deepEqual(findLearningCalculationConflicts({artifact:{content:'```\nx = 6\n```\nFinal answer: x = 5.'},calculation}),[]);
});
test('exact equivalent claims pass while explicitly approximate claims are not falsely certified',()=>{
  const calculation=solve('Solve 3x=2.');
  assert.deepEqual(findLearningCalculationConflicts({artifact:{summary:'Answer: x = 4/6',content:'Answer: x = \\frac{2}{3}\nFinal answer: x = 2/3'},calculation}),[]);
  const approximate=findLearningCalculationConflicts({artifact:{summary:'Answer: x = about 0.667',content:'x ≈ 0.667\nFinal answer: x = 0.667 (rounded)'},calculation});assert.equal(approximate.length,1);assert.equal(approximate[0].claim,'No checkable exact solution stated');
  assert(findLearningCalculationConflicts({artifact:{summary:'Answer: x = 0.667'},calculation}).length>0);
  assert.deepEqual(findLearningCalculationConflicts({artifact:{summary:'Answer: x = −5',content:'Final answer: x = −5.'},calculation:solve('Solve x+5=0.')}),[]);
});
test('generic help or unsupported wording cannot silently pass as an independently checked answer',()=>{
  const calculation=solve('Solve 2x=10.');
  for(const artifact of[{summary:'Think carefully.',content:'Try solving it yourself.'},{summary:'The answer is five.',content:'Read your textbook.'}]){const flags=findLearningCalculationConflicts({artifact,calculation});assert.equal(flags.length,1);assert.equal(flags[0].expected,'x = 5');assert.match(flags[0].message,/does not state a checkable exact solution/);}
});
test('oversized or whitespace-heavy model claims remain bounded and do not become checked numbers',()=>{
  const calculation=solve('Solve 2x=10.');
  for(const content of['Answer:'+' '.repeat(48000)+'not a number','Answer: x = '+'9'.repeat(12000)]){const flags=findLearningCalculationConflicts({artifact:{content},calculation});assert.equal(flags.length,1);assert.equal(flags[0].claim,'No checkable exact solution stated');}
});
test('fallback provides an actual checked solution and is not an invented model or source answer',()=>{
  const calculation=solve('Solve 4(2x+1)-3=5x+16.'),artifact=createLearningCalculationFallback({calculation});
  assert.match(artifact.summary,/x = 5/);assert.match(artifact.content,/left side = 41; right side = 41/);assert.equal(artifact.checks[1].status,'review');assert.doesNotMatch(artifact.content,/https?:\/\/|\[S\d+\]/);assert.deepEqual(findLearningCalculationConflicts({artifact,calculation}),[]);
  for(const field of['questions','quiz','flashcards','slides'])assert.deepEqual(artifact[field],[]);
  assert.throws(()=>createLearningCalculationFallback({calculation:{...calculation}}));assert.deepEqual(findLearningCalculationConflicts({artifact:{content:'x = 6'},calculation:{...calculation}}),[]);
  assert.match(solve('Solve x/2=1.').steps[0],/\(1\/2\)x/);
});
