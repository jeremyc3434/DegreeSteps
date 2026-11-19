import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readReviewedOnlineAwards,validateReviewedOnlineAwards,applyCompiled} from './scripts/liberty-online-guide-awards.mjs';
const packet=await readReviewedOnlineAwards(),clone=value=>JSON.parse(JSON.stringify(value));
const source={id:'degree',url:'https://catalog.liberty.edu/undergraduate/colleges-schools/business/healthcare-administration-bs/healthcare-administration-bs-online/',checked:'2026-11-18'};
function fixture(){return {id:'review-test-healthcare',school:'Liberty University',title:'Healthcare Administration (B.S.) — Online',catalogYear:'2026-2027',format:'Online',level:'bachelor',creditSystem:'semester',totalCredits:9,sources:[source],requirements:[{id:'health-law',code:'BUSI 302',title:'Legal and Ethical Issues in Healthcare',credits:3,category:'major',sourceIds:['degree'],minimumGrade:'C',options:[{id:'university-health-law',provider:'University',code:'BUSI 302',credits:3}]},{id:'accounting',code:'ACCT 301',title:'Intermediate Accounting I',credits:3,category:'major',sourceIds:['degree'],options:[]},{id:'free-one',title:'Free elective',credits:1,freeElective:true,category:'electives',sourceIds:['degree'],selectionRequired:true,options:[]},{id:'free-two',title:'Free elective',credits:2,freeElective:true,category:'electives',sourceIds:['degree'],selectionRequired:true,options:[]}]};}
test('the reviewed packet accounts for every Sophia and Study source row without splitting composite awards',()=>{
 assert.equal(packet.awards.length,299);assert.equal(packet.awards.filter(award=>award.provider==='Sophia').length,81);assert.equal(packet.awards.filter(award=>award.provider==='Study.com').length,218);assert.equal(packet.heldAwards.length,5);assert.equal(packet.summary.sourceCoursesRepresented,305);
 assert(packet.awards.every(award=>award.sourceCredits===null&&award.sourceCreditSystem===null&&award.sourceCreditStatus==='unknown'));
 assert(!packet.awards.some(award=>['SOPH-0056','SOPH-0070','SDCM-0188','SDCM-0246','SDCM-0132','SDCM-0258'].includes(award.code)));
 assert.equal(packet.awards.find(award=>award.code==='SOPH-0014').receivingCode,'BUSI 101');
 assert.equal(packet.awards.find(award=>award.code==='SOPH-0005').crossListedReceivingCodes[0],'BUSI 230');
});
test('new research choices require an explicit opt-in and generic upper electives cannot replace a named major course',()=>{
 const input=fixture(),before=JSON.stringify(input),normal=applyCompiled(input,packet),draft=applyCompiled(input,packet,{includeResearchCandidates:true});
 assert.equal(normal.requirements[0].options.length,1);assert.equal(normal.requirements[1].options.length,0);assert.equal(JSON.stringify(input),before);
 const choice=draft.requirements[0].options.find(option=>option.code==='SDCM-0173');assert(choice);assert.equal(choice.receivingCode,'BUSI 302');assert.equal(choice.evidence,'conditional');assert.equal(choice.mappingResearchClosed,true);assert.equal(choice.eligibilityReview.eligibleToStart,false);assert.equal(choice.sourceCredits,undefined);assert.equal(choice.sourceCreditStatus,'unknown');assert.equal(choice.degreePlacementEvidence.requirementId,'health-law');assert(choice.conditions.some(text=>text.includes('C or higher')));
 assert.equal(draft.requirements[1].options.length,0,'ACCT 3XX is not ACCT 301');assert(draft.requirements[2].options.some(option=>option.provider==='Sophia'&&option.credits===1));assert(draft.requirements[3].options.some(option=>option.provider==='Sophia'&&option.credits===2));
 assert(draft.requirements[2].options.every(option=>option.credits===1));assert(draft.requirements[3].options.every(option=>option.credits===2));
 assert.deepEqual(applyCompiled(draft,packet,{includeResearchCandidates:true}),draft);
});
test('existing conditional matches keep their identity while acquiring exact online guide and degree-placement evidence',()=>{
 const input=fixture();input.requirements[0].options.push({id:'existing-provider-course',provider:'Study.com',code:'SDCM-0173',receivingCode:'BUSI 302',credits:3,evidence:'conditional',mappingScope:'Same-school receiving-course award researched in another degree; exact degree and delivery-format application require confirmation.',conditions:['This receiving-course award was researched for another degree. Confirm current applicability.']});
 const output=applyCompiled(input,packet),course=output.requirements[0].options.find(option=>option.provider==='Study.com');assert.equal(course.id,'existing-provider-course');assert.equal(output.requirements[0].options.length,2);assert(!course.mappingScope.includes('another degree'));assert(!course.conditions.some(text=>text.startsWith('This receiving-course award was researched for')));assert.equal(course.eligibilityReview.eligibleToStart,false);assert(course.sourceIds.includes('degree'));
 assert.deepEqual(applyCompiled(output,packet),output);
 const published=clone(input);published.requirements[0].options[1].evidence='published';assert.deepEqual(applyCompiled(published,packet).requirements[0].options[1],published.requirements[0].options[1]);
});
test('catalog, delivery, level, units and row restrictions prevent unsupported inheritance',()=>{
 const input=fixture();for(const changes of [{format:'Residential'},{catalogYear:'2025-2026'},{school:'Another University'},{level:'master'},{creditSystem:'quarter'},{auditProvenance:{status:'student-provided'}}]){const changed={...input,...changes};assert.equal(applyCompiled(changed,packet,{includeResearchCandidates:true}),changed);}
 const upper=fixture();upper.requirements[0].institutionalOnly=true;upper.requirements[2].upperOnly=true;const result=applyCompiled(upper,packet,{includeResearchCandidates:true});assert.equal(result.requirements[0].options.length,1);assert.equal(result.requirements[2].options.length,0);
 const malformed=clone(packet);malformed.awards[0].sourceCredits=3;assert.throws(()=>validateReviewedOnlineAwards(malformed),/independently establish/);
});
test('the actual healthcare model gains distinct documented receiving alternatives only in research mode',async()=>{
 const document=JSON.parse(await readFile(new URL('./dist/data/curricula/liberty-online-expansion.json',import.meta.url),'utf8')),model=document.models[0],before=model.requirements.reduce((sum,row)=>sum+row.options.length,0),normal=applyCompiled(model,packet),research=applyCompiled(model,packet,{includeResearchCandidates:true});
 assert.equal(normal.requirements.reduce((sum,row)=>sum+row.options.length,0),before);
 for(const code of ['BUSI 302','BUSI 304','BUSI 311','BUSI 323','BUSI 419','INFO 320','BUSI 344']){const row=research.requirements.find(row=>row.code===code);assert(row,code);assert(row.options.some(option=>option.provider==='Study.com'&&option.receivingCode===code),code);}
 for(const row of research.requirements){const identity=option=>[option.provider,option.code,option.receivingCode,option.credits].join('|'),counts=options=>{const result=new Map();for(const option of options.filter(option=>option.provider!=='University'))result.set(identity(option),(result.get(identity(option))||0)+1);return result;},before=counts(model.requirements.find(item=>item.id===row.id).options),after=counts(row.options);for(const [key,count]of after)assert(count<=Math.max(1,before.get(key)||0),row.id+': '+key);}
});
