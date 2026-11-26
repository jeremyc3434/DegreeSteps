/* Open policy questions shown to students: a reviewed, school-specific question wins over the generic template, and
   published ACE/NCCRS limits recorded from the school's own policy no longer ask the student anything. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {questionsFor} from './scripts/build-plan-library-index.mjs';
const index=JSON.parse(readFileSync(new URL('./dist/data/plan-library-index.json',import.meta.url),'utf8'));
test('a reviewed question replaces the generic template, and upper-level questions are specific',()=>{
 const f=(field,question)=>({code:'policy-unresolved',blocking:true,field,...(question?{question}:{})});
 assert.deepEqual(questionsFor([f('alternativeMaxCredits','Ask Example whether X counts.')]),['Ask Example whether X counts.']);
 assert.match(questionsFor([f('upperMinCredits')])[0],/upper-level \(300- and 400-level\) credits/);
});
test('Columbia Southern’s published transfer policy answers the ACE/NCCRS question for every program',()=>{
 const csu=Object.entries(index.plans).filter(([id])=>id.startsWith('columbia-southern-'));
 assert(csu.length>=16);
 for(const [id,plan] of csu)assert(!(plan.questions||[]).some(q=>/ACE- or NCCRS/.test(q)),id);
});
