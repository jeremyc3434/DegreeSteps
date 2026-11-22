/* The student's own email to the school: short, in their voice, at most three questions, built only from the plan's open questions. */
const test=require('node:test'),assert=require('node:assert/strict');
const Sheet=require('./dist/sheet-state.js'),index=require('./dist/data/plan-library-index.json');
const confirmation=Object.entries(index.plans).filter(([,plan])=>plan.tier==='confirmation');
const reviewed=Object.entries(index.plans).find(([,plan])=>plan.tier==='reviewed');

test('every plan awaiting confirmation gets a short email of one to three questions, in the student’s voice',()=>{
 assert(confirmation.length>0);
 for(const [id] of confirmation){
  const email=Sheet.schoolEmail(index,id,{title:'Test Degree',school:'Test University',format:'online'});
  assert(email,id);assert(email.questions.length>=1&&email.questions.length<=3,id);
  assert.match(email.body,/^Hello,/);assert.match(email.body,/\[Your name\]$/);
  assert.doesNotMatch(email.body,/DegreeSteps|Ask the school|provider’s current enrollment terms/,id);
  assert(email.body.length<900,id+' is too long: '+email.body.length);
  assert(email.mailto.startsWith('mailto:?subject='));assert.equal(decodeURIComponent(email.mailto.split('&body=')[1]),email.body);
 }
});
test('reviewed plans and unknown plans get no email',()=>{
 assert.equal(Sheet.schoolEmail(index,reviewed[0],{}),null);
 assert.equal(Sheet.schoolEmail(index,'not-a-plan',{}),null);
 assert.equal(Sheet.schoolEmail(null,'x'),null);
});
test('course questions name at most three of the student’s courses and offer the full list',()=>{
 const [id]=confirmation.find(([,plan])=>plan.questions.some(q=>/proposed course match/.test(q)));
 const email=Sheet.schoolEmail(index,id,{courses:['A','B','C','D']});
 const ask=email.questions.find(q=>/count toward this degree/.test(q));
 assert.match(ask,/A; B; C \(I can send the full list\)/);assert.doesNotMatch(ask,/\bD\b/);
});
