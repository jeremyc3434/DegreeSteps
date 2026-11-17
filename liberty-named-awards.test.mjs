import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {buildDocument,validateDocument,optionsFor,scopeAllows,factPath,outputPath} from './scripts/build-liberty-named-awards.mjs';
import {mappings} from './scripts/add-liberty-official-mappings.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),copy=value=>JSON.parse(JSON.stringify(value));
const facts=JSON.parse(await readFile(new URL('./'+factPath,import.meta.url))),document=buildDocument(facts),online={school:'Liberty University',level:'bachelor',modality:'online'},campus={...online,modality:'campus'};
test('the supplement adds distinct named awards without degree dummies or duplicate earlier mappings',async()=>{
 const prior=new Set(mappings.map(([provider,code,,,receiving])=>provider+'|'+code+'|'+receiving));
 assert.equal(document.awards.length,51);assert.equal(new Set(document.awards.map(award=>award.receivingCode)).size,31);assert.equal(document.sources.length,6);
 assert.equal(document.awards.some(award=>prior.has(award.provider+'|'+award.code+'|'+award.receivingCode)),false);
 assert.equal(document.models,undefined);assert.equal(document.requirements,undefined);
 assert.deepEqual(JSON.parse(await readFile(new URL('./'+outputPath,import.meta.url))),document);
});
test('source quantities and recommendation windows remain unknown while receiving awards stay exact',()=>{
 for(const award of document.awards){assert.equal(award.credits,3);assert.equal(award.creditSystem,'semester');assert.equal(award.sourceCreditStatus,'unknown');assert.equal(award.sourceCredits,null);assert.equal(award.sourceCreditSystem,null);assert.match(award.sourceCreditBasis,/not independently reviewed/);assert.equal(award.evidence,'conditional');assert.match(award.conditions.join(' '),/recommendation windows/);assert.equal(award.recommendationStart,undefined);assert.equal(award.recommendationEnd,undefined);}
 const altered=copy(document);altered.awards[0].sourceCredits=3;altered.awards[0].sourceCreditSystem='semester';assert.throws(()=>validateDocument(altered),/must remain unknown/);
});
test('exact receiving code, credit amount, delivery and undergraduate level govern every match',()=>{
 const requirement={id:'computing',code:'INFT 110',credits:3};
 const match=optionsFor(document,requirement,online);assert.equal(match.length,1);assert.equal(match[0].code,'SDCM-0162');assert.equal(match[0].providerCourseCode,'Computer Science 103');
 for(const context of [{...online,school:'Another University'},{...online,level:'master'},{...online,level:'doctorate'},{...online,modality:'any'}])assert.equal(optionsFor(document,requirement,context).length,0);
 assert.equal(optionsFor(document,{...requirement,code:'CSIS 110'},online).length,0);assert.equal(optionsFor(document,{...requirement,credits:4},online).length,0);assert.equal(optionsFor(document,{...requirement,institutionalOnly:true},online).length,0);assert.equal(optionsFor(document,{...requirement,upperOnly:true},online).length,0);
 assert.equal(optionsFor(document,{id:'elective',credits:3,freeElective:true},online).length,0,'A source pool must not claim an anonymous requirement is an exact equivalency');
 assert.equal(optionsFor(document,{...requirement,code:undefined,allowedCourseCodes:['INFT 110']},online).length,1);
});
test('an online-only award cannot leak into campus plans and each mode selects its actual guide/page',()=>{
 const education={id:'education',code:'EDUC 200',credits:3};assert.equal(optionsFor(document,education,online).length,1);assert.equal(optionsFor(document,education,campus).length,0);
 const history={id:'history',code:'HIUS 221',credits:3};
 const get=context=>optionsFor(document,history,context).find(option=>option.code==='SOPH-0022');
 assert.match(get(online).url,/\/online\//);assert.equal(get(online).sourcePage,2);assert.match(get(campus).url,/\/residential\//);assert.equal(get(campus).sourcePage,1);
 const environmental=document.awards.find(award=>award.code==='SOPH-0016'),alias=environmental.codeAliasEvidence.find(item=>item.alias==='SCIE1005');assert.equal(alias.sourceIds.length,1);assert.equal(document.sources.find(source=>source.id===alias.sourceIds[0]).modality,'campus');
});
test('receiving upper-level facts do not infer source level or make lower-level awards upper level',()=>{
 const leadership=optionsFor(document,{id:'leadership',code:'BUSI 345',credits:3,upperOnly:true},online);assert.equal(leadership.length,1);assert.equal(leadership[0].upper,true);assert.equal(leadership[0].sourceUpper,undefined);
 const psychology=optionsFor(document,{id:'psych',code:'PSYC 316',credits:3,upperOnly:true},campus);assert.equal(psychology[0].code,'SDCM-0134');
 assert.equal(optionsFor(document,{id:'psych-lower',code:'PSYC 235',credits:3,upperOnly:true},online).length,0);
});
test('invalid dates, IDs, source references and invented numeric source quantities stop generation',()=>{
 for(const mutate of [doc=>doc.checkedOn='2026-02-30',doc=>doc.awards[1].id=doc.awards[0].id,doc=>doc.awards[0].sourceIds=[],doc=>doc.awards[0].sourceIds[0]='unknown-source',doc=>doc.awards[0].degreeLevels=['master'],doc=>doc.awards[0].receivingCode='CSIS 1XX',doc=>doc.awards[0].evidence='confirmed',doc=>doc.awards[0].sourceCredits=3,doc=>delete doc.awards[0].sourceCreditStatus]){const changed=copy(document);mutate(changed);assert.throws(()=>validateDocument(changed));}
 assert.equal(scopeAllows(document.awards[0],{...online,level:'associate'}),true);
});
test('a matched option remains provisional and cannot manufacture completed or school-confirmed credit',()=>{
 const req={id:'computing',title:'Computer concepts',code:'INFT 110',credits:3,category:'general',options:optionsFor(document,{code:'INFT 110',credits:3},online)};
 req.options.push({id:'university-computing',provider:'University',code:'INFT 110',title:'Computer concepts',credits:3,creditSystem:'semester',evidence:'published',sourceIds:[document.sources[0].id]});
 const program={id:'synthetic-award-test',school:'Liberty University',title:'Synthetic matching fixture',totalCredits:3,creditSystem:'semester',institutionMinCredits:0,requirements:[req],sources:document.sources};
 const planned=Planner.generate(program,{providers:['Study.com'],allowConditional:true,optionSelections:{computing:req.options[0].id}});assert.equal(planned.totals.confirmed,0);assert.equal(planned.totals.reported,0);assert.equal(planned.rows[0].option.evidence,'conditional');
 const excluded=Planner.generate(program,{providers:['Study.com'],allowConditional:false});assert.equal(excluded.rows[0].option.provider,'University');
});
