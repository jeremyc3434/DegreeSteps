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

test('emails are addressed to the transfer contact each school publishes, chosen by study format',()=>{
 const online=Sheet.schoolEmail(index,confirmation[0][0],{school:'Liberty University',modalities:['online']});
 const campus=Sheet.schoolEmail(index,confirmation[0][0],{school:'Liberty University',modalities:['campus']});
 assert.match(online.mailto,/^mailto:luotransfer@liberty\.edu\?subject=/);assert.match(campus.mailto,/^mailto:undergradtransfer@liberty\.edu\?subject=/);
 for(const [school,addr] of [['Western Governors University','transcriptinfo@wgu.edu'],['Excelsior University','admissions@excelsior.edu'],['Thomas Edison State University','registrar@tesu.edu']]){const c=Sheet.schoolTransferContact({school});assert.equal(c.email,addr);assert.match(c.source,/^https:\/\//);}
 const phoenix=Sheet.schoolEmail(index,confirmation[0][0],{school:'University of Phoenix'});assert.match(phoenix.mailto,/^mailto:\?subject=/);assert.match(phoenix.contact.contactPage,/^https:\/\/www\.phoenix\.edu\//);
 assert.equal(Sheet.schoolTransferContact({school:'Unknown U'}),null);
});

test('reviewed school-specific policy questions become matching asks in the student’s email',()=>{
 const upper=Sheet.schoolEmail(index,'columbia-southern-b-s-accounting',{school:'Columbia Southern University'});
 assert(upper.questions.some(q=>/How many upper-level credits does this degree require, and which upper-level courses must I take at Columbia Southern University itself\?/.test(q)),upper.questions.join(' | '));
 const bellevue=Sheet.schoolEmail(index,'bellevue-bachelor-of-science-in-accounting',{school:'Bellevue University'});
 assert(bellevue.questions.some(q=>/90-hour limit on experiential\/prior learning/.test(q)),bellevue.questions.join(' | '));
 for(const [id,plan] of confirmation)assert.doesNotMatch(plan.questions.join(' '),/\bn-recommended\b/,id);
});
