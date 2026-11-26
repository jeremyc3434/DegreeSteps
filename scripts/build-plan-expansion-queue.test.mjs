import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExpansionQueue} from './build-plan-expansion-queue.mjs';
const model=(id,overrides={})=>({id,title:id,school:'Synthetic University',catalog:'2026-2027',format:'Online',level:'bachelor',creditSystem:'semester',sources:[{id:'map',url:'https://synthetic.invalid/official-map',kind:'university',sha256:'a'.repeat(64)}],requirements:[{id:'english',code:'ENG 101',credits:3,options:[{id:'course',provider:'Synthetic provider',code:'COURSE 1',credits:3,sourceCredits:3,creditSystem:'semester',sourceCreditSystem:'semester',creditOrigin:'alternative',receivingCode:'ENG 101',courseVersion:'2',sourceIds:['map']}]}],...overrides});
const program=(id,overrides={})=>({modelId:id,publication:{ready:false},findings:[{id:id+'-mapping',code:'mapping-evidence',blocking:true,owner:'research',scope:'option',requirementIds:['english'],optionIds:['course'],sourceIds:['map'],message:'Needs receiving-school review.'}],...overrides});
const quality=programs=>({programs,asOf:'2026-11-25',registryRevision:'synthetic-v1'});
test('one school award review retains separate exact degree-placement contexts and approves nothing',()=>{
 const report=buildExpansionQueue({models:[model('a'),model('b')],quality:quality([program('a'),program('b')])});
 assert.equal(report.tasks.length,1);assert.deepEqual(report.tasks[0].affectedModelIds,['a','b']);assert.equal(report.tasks[0].contexts.length,2);assert.equal(report.summary.blockingFindingOccurrences,2);assert.equal(report.summary.readyPlans,0);assert.equal(report.automaticApprovals,0);assert.equal(report.tasks[0].automaticApproval,false);assert.equal(report.runtimeAiCalls,0);
});
test('award review tasks preserve catalog, delivery, degree level, unit, origin and exact agreement-program boundaries',()=>{
 const original=model('a'),variants=[model('b',{catalog:'2027-2028'}),model('c',{format:'Residential'}),model('d',{level:'master'}),model('e',{creditSystem:'quarter'}),model('f'),model('g')];
 variants[4].requirements[0].options[0].universityMapRecord={programId:92,agreementId:242};variants[5].requirements[0].options[0].creditOrigin='institutional';
 const models=[original,...variants],report=buildExpansionQueue({models,quality:quality(models.map(row=>program(row.id)))});assert.equal(report.tasks.length,7);
});
test('different provider versions and source bodies remain separate; task revisions are deterministic',()=>{
 const a=model('a'),b=model('b'),c=model('c');b.requirements[0].options[0].courseVersion='3';c.sources[0].sha256='b'.repeat(64);
 const input={models:[a,b,c],quality:quality(['a','b','c'].map(id=>program(id)))};const report=buildExpansionQueue(input);assert.equal(report.tasks.length,3);assert.equal(report.revision,buildExpansionQueue({models:[c,b,a],quality:quality([...input.quality.programs].reverse())}).revision);
});
test('similar unknown findings stay program-specific and source reports never expose student records',()=>{
 const models=[model('a',{studentEmail:'private@example.invalid'}),model('b')],programs=models.map(row=>program(row.id,{findings:[{id:row.id+'-specific',code:'new-specific-rule',blocking:true,owner:'research',message:'Same wording.'}]}));
 const report=buildExpansionQueue({models,quality:quality(programs)});assert.equal(report.tasks.length,2);assert(!JSON.stringify(report).includes('private@example.invalid'));assert.equal(report.privateStudentRecordsIncluded,false);
});
test('a stale quality report fails rather than silently omitting a missing model',()=>{assert.throws(()=>buildExpansionQueue({models:[],quality:quality([program('missing')])}),/unknown model/);});
