import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {loadKit,kitsRoot,normalizeText} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {applyTESUProviderReview} from './scripts/tesu-provider-review.mjs';
import {applyTESUStudyEnglish104,studyEnglishOption,studyEnglishOptionId,studyEnglishReview} from './scripts/tesu-study-english104.mjs';
const require=createRequire(import.meta.url),Guide=require('./dist/guide-engine.js'),legacy=require('./dist/data/tesu.json');
const kit=await loadKit(kitsRoot+'/tesu'),{doc}=compileKit(kit);
const models=[...doc.models,applyTESUProviderReview(applyTESUStudyEnglish104(legacy))];

test('the English104 candidate uses an honestly labeled native provider extraction and independent intact ACE source',async()=>{
 for(const source of studyEnglishReview.sources){const text=await readFile(source.capture,'utf8'),meta=JSON.parse(await readFile(source.capture.replace('.txt','.json'),'utf8'));assert.equal(createHash('sha256').update(text).digest('hex'),meta.sha256);assert.equal(source.url,meta.url);}
 const source=studyEnglishReview.sources[0],meta=JSON.parse(await readFile(source.capture.replace('.txt','.json'),'utf8'));
 assert.equal(source.captureMethod,'native-public-web-rendered-extract');assert.equal(meta.rawBodyCaptured,false);assert.equal(meta.originHttpStatus,null);assert.equal(meta.status,undefined);
 const text=normalizeText(await readFile(source.capture,'utf8'));assert.ok(text.includes(normalizeText('English 104: College Composition I')));assert.ok(text.includes('enc-1010'));
 assert.equal(studyEnglishReview.publicationPromotionAllowed,false);
});

test('all six TESU degrees gain exactly one current source-identified conditional English104 choice',async()=>{
 assert.equal(models.length,6);await runGuards(kit,doc);
 for(const model of models){const entries=model.requirements.flatMap(row=>row.options.filter(o=>o.id===studyEnglishOptionId).map(option=>({row,option})));assert.equal(entries.length,1,model.id);const {row,option}=entries[0];assert.equal(row.code,'ENC-1010');assert.equal(option.code,'SDCM-0057');assert.deepEqual(option.codeAliases,['English 104']);assert.equal(option.courseVersion,5);assert.equal(option.sourceCredits,3);assert.equal(option.credits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.creditSystem,'semester');assert.equal(option.sourceUpper,false);assert.equal(option.evidence,'conditional');assert.equal(option.evidenceType,'provider-published');assert.equal(option.mappingResearchClosed,false);assert.equal(option.mappingEvidence.publisher,'Study.com');assert.equal(option.mappingEvidence.individualApproval,false);assert.equal(option.eligibilityReview.providerReviewPending,false);assert.equal(option.eligibilityReview.fullyApproved,true);assert.equal(Object.hasOwn(option.eligibilityReview,'eligibleToStart'),false);assert.ok(option.conditions.some(c=>/TESU-submitted receiving award has not been established/.test(c)));assert.ok(option.sourceIds.every(id=>model.sources.some(s=>s.id===id)));}
 const verification=await verifyKit(kit,{asOf:'2026-11-26'});assert.deepEqual(verification.errors,[]);
});

test('English104 matching respects the exact version window, original quantity and grades without inventing a school award',()=>{
 const model=models.at(-1),row=model.requirements.find(r=>r.code==='ENC-1010'),option=row.options.find(o=>o.id===studyEnglishOptionId),program={...model,requirements:[{...row,options:[option]}]};
 const record={id:'english104-existing',provider:'Study.com',code:'SDCM-0057',title:option.title,credits:3,creditSystem:'semester',status:'earned',grade:'C',courseVersion:5,completedOn:'2026-03-01',evaluations:[]};
 const match=r=>Guide.matchInventory(program,[r]);
 for(const completedOn of ['2026-03-01','2029-02-28']){const result=match({...record,completedOn});assert.equal(result.completed.length,1);assert.equal(result.completed[0].status,'reported');}
 assert.equal(match({...record,courseVersion:'5'}).completed.length,1,'The same explicit numeric version may be represented as text.');
 for(const change of [{completedOn:'2026-02-28'},{completedOn:'2029-03-01'},{courseVersion:4},{courseVersion:'4'},{credits:2},{credits:4},{creditSystem:'quarter'},{grade:'C-'},{status:'planned'},{provider:'Sophia'}])assert.equal(match({...record,...change}).completed.length,0,JSON.stringify(change));
 const evaluated={...record,courseVersion:4,completedOn:'2025-06-01',evaluations:[{programId:model.id,requirementId:row.id,optionId:option.id,status:'confirmed'}]};
 const preserved=match(evaluated);assert.equal(preserved.completed.length,1);assert.equal(preserved.completed[0].status,'confirmed','An exact existing school award is retained without substituting a new source version.');
 assert.equal(match({...evaluated,evaluations:[{...evaluated.evaluations[0],status:'reported'}]}).completed.length,0,'A reported match does not create a version exception.');
 const before=JSON.stringify(record);match(record);assert.equal(JSON.stringify(record),before);
});

test('candidate application is idempotent and never places the course into another requirement or blocked slot',()=>{
 const updated=applyTESUStudyEnglish104(legacy);assert.deepEqual(applyTESUStudyEnglish104(updated),updated);
 const req=legacy.requirements.find(r=>r.code==='ENC-1010');for(const change of [{code:'ENC-1020'},{credits:4},{institutionalOnly:true}])assert.equal(studyEnglishOption(legacy,{...req,...change}),null);
 assert.equal(studyEnglishOption({...legacy,school:'Different college'},req),null);
 for(const model of models)assert.equal(model.requirements.reduce((n,r)=>n+r.credits,0),120);
});
