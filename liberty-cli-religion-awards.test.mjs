import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Planner from './dist/planner.js';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import {readLibertyCLIReligionReview,validateLibertyCLIReligionAwards,applicableLibertyCLIReligionAwards,addLibertyCLIReligionOptions} from './scripts/liberty-cli-religion-awards.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const review=await readLibertyCLIReligionReview(),raw=await read(review.calculatorRequest.sourceSnapshot),clone=structuredClone;
const currentDataAsOf='2026-11-26';
const awardIds=new Set(review.awards.map(award=>award.id));
const scope={school:'Liberty University',level:'bachelor',catalogYear:'2026-2027',modality:'campus',creditSystem:'semester',receivingCode:'BIBL 105',credits:2};
const fixture=(patch={})=>({id:'synthetic-religion',school:'Liberty University',level:'bachelor',catalogYear:'2026-2027',format:'Residential',creditSystem:'semester',totalCredits:2,institutionMinCredits:0,externalMaxCredits:2,defaultProviders:['Sophia'],sources:[{id:'synthetic-degree',url:'https://catalog.liberty.edu/undergraduate/'}],requirements:[{id:'bibl-105',code:'BIBL 105',credits:2,category:'general',options:[{id:'university-bibl-105',provider:'University',code:'BIBL 105',credits:2,creditSystem:'semester',evidence:'published',sourceIds:['synthetic-degree']}]}],...patch});
const generate=(model,patch={})=>Planner.generate(model,{providers:[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)))].filter(provider=>provider!=='University'),allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000,...patch});

test('six current exact religion awards match the retained calculator and independent provider captures',async()=>{
 assert.equal(raw.length,124);assert.equal(validateLibertyCLIReligionAwards(review,raw).awards.length,6);
 assert.deepEqual(review.awards.map(award=>[award.code,award.receivingCode,award.credits]),[
  ['BIB 111','BIBL 105',2],['BIB 112','BIBL 110',2],['MIN 310','EVAN 101',2],['THE 101','THEO 104',4],['THE 210','THEO 201',2],['THE 310','THEO 202',2]
 ]);
 for(const source of review.sources.filter(source=>source.capture))assert.equal(createHash('sha256').update(await readFile(new URL(source.capture.path,import.meta.url))).digest('hex'),source.capture.sha256);
 assert.equal(createHash('sha256').update(await readFile(new URL(review.calculatorRequest.sourceSnapshot,import.meta.url))).digest('hex'),review.calculatorRequest.sha256);
 assert(review.sources.some(source=>source.retrieval?.includes('HTTP 403')),'Indexed provider identities retain the direct-fetch limitation.');
});

test('listed original quantities remain distinct from fixed receiving credits, with no invented semester units, ACE or price',()=>{
 const expectedSource={ 'BIB 111':3,'BIB 112':3,'MIN 310':3,'THE 101':3,'THE 210':4,'THE 310':4 };
 for(const award of review.awards){
  assert.equal(award.providerListedCreditQuantity,expectedSource[award.code]);assert.equal(award.providerListedCreditUnit,'credits');
  assert.equal(award.sourceCreditStatus,'unknown');assert.equal(award.sourceCredits,undefined);assert.equal(award.sourceCreditSystem,undefined);
  assert.equal(award.creditOrigin,'institutional');assert.equal(award.sourceType,undefined);assert.equal(award.upper,false);assert.equal(award.cost,undefined);assert.equal(award.price,undefined);
 }
 assert.equal(review.issuerReview.freeLearningAloneIsCredit,false);assert.equal(review.issuerReview.totalAcademicPathwayCostUSD,null);
});

test('exact catalog, format, level and receiving quantity govern placement; no BIBL 104 or worldview substitution is inferred',()=>{
 assert.equal(applicableLibertyCLIReligionAwards(review,scope).length,1);
 for(const catalogYear of ['2026-2027','2026–2027','2026—2027'])assert.equal(applicableLibertyCLIReligionAwards(review,{...scope,catalogYear}).length,1);
 assert.equal(applicableLibertyCLIReligionAwards(review,{...scope,level:"Bachelor's"}).length,1);
 assert.equal(applicableLibertyCLIReligionAwards(review,{...scope,level:'associate'}).length,1);
 assert.equal(applicableLibertyCLIReligionAwards(review,{...scope,modality:'online',receivingCode:'THEO 104',credits:4}).length,1);
 for(const patch of [{school:'Other'},{level:'master'},{level:'doctorate'},{catalogYear:'2025-2026'},{catalogYear:''},{modality:'hybrid'},{format:'Online'},{creditSystem:'quarter'},{credits:3},{credits:4},{requiredAtUniversity:true},{institutionalOnly:true},{receivingCode:'BIBL 104'},{receivingCode:'RLGN 104'},{receivingCode:'RLGN 105'},{receivingCode:'BIBL 1XX'},{receivingCode:''}])assert.deepEqual(applicableLibertyCLIReligionAwards(review,{...scope,...patch}),[]);
});

test('ranged, ambiguous, graduate, duplicate and altered source awards cannot be promoted',()=>{
 for(const mutate of [
  row=>row.CREDIT_HRS_LOW='0',row=>row.CREDIT_HRS_HIGH='3',row=>row.INST_CRSE_EQUIV='BIBL1XX',row=>row.INST_CRSE_EQUIV='BIBL105\nOR BIBL104',row=>row.STVLEVL_DESC='Graduate'
 ]){const changed=clone(raw);mutate(changed.find(row=>row.SHBTATC_GROUP==='BIB111'));assert.throws(()=>validateLibertyCLIReligionAwards(review,changed));}
 for(const mutate of [
  doc=>doc.awards[0].credits=3,doc=>doc.awards[0].receivingCode='BIBL 104',doc=>doc.awards[0].sourceCredits=3,doc=>doc.awards[0].sourceCreditSystem='semester',doc=>doc.awards[0].sourceType='ACE',doc=>doc.awards[0].evidence='published',doc=>doc.awards[0].cost=0,doc=>doc.awards[0].providerListedCreditQuantity=4,doc=>doc.awards[0].sourceIds=['missing'],doc=>doc.awards[0].identitySourceIds=[doc.awards[0].sourceIds[0]],doc=>doc.awards.find(award=>award.code==='MIN 310').code='MIN 311',doc=>doc.awards.push(clone(doc.awards[0]))
 ]){const changed=clone(review);mutate(changed);assert.throws(()=>validateLibertyCLIReligionAwards(changed,raw));}
});

test('attachment preserves input, provider preferences and option order, binds sources, and repeats deterministically',()=>{
 const original=fixture(),before=clone(original),model=addLibertyCLIReligionOptions(original,review),row=model.requirements[0],added=row.options.at(-1);
 assert.deepEqual(original,before);assert.deepEqual(model.defaultProviders,original.defaultProviders);assert.deepEqual(row.options.slice(0,-1),original.requirements[0].options);
 assert.equal(added.code,'BIB 111');assert.equal(added.credits,2);assert.equal(added.evidence,'conditional');assert.equal(added.preapprovalRequired,true);assert.equal(added.courseUrl,added.providerCourseUrl);
 for(const id of [...added.sourceIds,...added.identitySourceIds,...added.issuerReview.sourceIds])assert(model.sources.some(source=>source.id===id));
 assert.equal(model.reviewedBaselineChoices,undefined,'An arbitrary fixture cannot inherit a production route.');
 assert.deepEqual(addLibertyCLIReligionOptions(model,review),model);
 const existing=fixture({reviewedBaselineChoices:{version:99,optionSelections:{personal:'selection'}}});assert.deepEqual(addLibertyCLIReligionOptions(existing,review).reviewedBaselineChoices,existing.reviewedBaselineChoices);
 for(const patch of [{school:'Other'},{level:'master'},{catalogYear:'2027-2028'},{format:'Hybrid'},{creditSystem:'quarter'},{auditProvenance:{status:'student-provided'}},{requirements:[{...original.requirements[0],institutionalOnly:true}]},{requirements:[{...original.requirements[0],requiredAtUniversity:true}]},{requirements:[{...original.requirements[0],code:'BIBL 104',credits:4}]}]){const input=fixture(patch);assert.equal(addLibertyCLIReligionOptions(input,review),input);}
});

test('three documented legacy baselines stay ready when optional CLI religion choices are added',async()=>{
 for(const [file,outside,institutional,upper,basis,count]of [
  ['liberty.json',83,37,39,66,5],['liberty-criminal-justice-online.json',72,48,30,45,1],['liberty-criminal-justice-residential.json',74,46,30,45,5]
 ]){
  const original=await read('dist/data/'+file),model=addLibertyCLIReligionOptions(original,review),plan=generate(model),report=assessPathwayQuality({model,plan,asOf:currentDataAsOf});
  assert.deepEqual(model.defaultProviders,original.defaultProviders);assert.equal(model.majorResidencyBasisCredits,basis);assert.equal(model.majorInstitutionFraction,.25);
  assert.equal(model.institutionMinCredits,30);assert.equal(model.externalMaxCredits,90);assert.equal(model.upperMinCredits,30);
  assert.equal(model.requirements.flatMap(row=>row.options).filter(option=>awardIds.has(option.id)).length,count);
  assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.institutional,institutional);assert.equal(plan.totals.upper,upper);
  assert.equal(report.metrics.feasibleOutsideCredits,outside);assert.equal(report.metrics.conditionalOutsideCredits,0);assert.equal(report.publication.ready,true);assert.equal(plan.validation.academicCountsValid,true);
  assert(!plan.rows.some(row=>awardIds.has(row.option?.id)));assert(plan.rows.every(row=>row.status==='planned'));assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
  const religion=model.requirements.find(row=>row.options.some(option=>awardIds.has(option.id))),option=religion.options.find(option=>awardIds.has(option.id));
  const selected=generate(model,{optionSelections:{[religion.id]:option.id}});
  assert.equal(selected.rows.find(row=>row.requirementId===religion.id).option.id,option.id,'The reviewed starting route must allow the student to choose an optional alternative.');
  assert.equal(selected.validation.academicCountsValid,true);assert.equal(selected.totals.institutional,institutional-religion.credits);assert.equal(selected.totals.alternative,plan.totals.alternative,'CLI institutional transfer is not ACE/exam credit.');
  assert.equal(assessPathwayQuality({model,plan:selected,asOf:currentDataAsOf}).publication.ready,false,'Optional conditional religion is not silently enrollment-ready.');
 }
});

test('a single evangelism action cannot satisfy two degree requirements or create Liberty residency',()=>{
 const original=fixture({totalCredits:4,externalMaxCredits:4,requirements:['one','two'].map(id=>({id,code:'EVAN 101',credits:2,category:'general',options:[{id:'university-'+id,provider:'University',code:'EVAN 101',credits:2,creditSystem:'semester',evidence:'published',sourceIds:['synthetic-degree']}]}))});
 const model=addLibertyCLIReligionOptions(original,review),option=model.requirements[0].options.find(option=>awardIds.has(option.id));
 assert.equal(option.code,'MIN 310');assert(!review.awards.some(award=>award.code==='MIN 311'));
 const plan=generate(model,{optionSelections:{one:option.id,two:option.id}});
 assert.equal(plan.validation.academicCountsValid,false);assert(plan.validation.errors.some(error=>error.code==='duplicate_source'));
 assert.equal(plan.totals.institutional,0);
});

test('explicit religion scenarios improve all five ready Liberty routes within residency and upper-level limits',async()=>{
 const registry=await read('dist/data/curriculum-registry.json');
 for(const [id,external,institutional] of [
  ['liberty-business-residential',90,30],['liberty-criminal-justice-residential',84,36],
  ['liberty-criminal-justice-online',76,44],['curriculum-liberty-psychology-bs-online',82,38],
  ['curriculum-liberty-healthcare-administration-bs-online',76,44]
 ]){
  const entry=registry.models.find(model=>model.id===id),document=await read('dist/'+entry.path);
  const model=document.models?.find(model=>model.id===id)||document,optionSelections={};
  for(const requirement of model.requirements){
   const option=requirement.options.find(option=>awardIds.has(option.id));
   if(option)optionSelections[requirement.id]=option.id;
  }
  const plan=generate(model,{optionSelections});
  assert.equal(plan.validation.academicCountsValid,true,id);
  assert.deepEqual(plan.setupIssues,[],id);
  assert.equal(plan.totals.accounted,120,id);
  assert.equal(plan.totals.external,external,id);
  assert.equal(plan.totals.institutional,institutional,id);
  assert(plan.totals.institutional>=30&&plan.totals.external<=90,id);
  for(const [requirementId,optionId] of Object.entries(optionSelections)){
   const row=plan.rows.find(row=>row.requirementId===requirementId);
   assert.equal(row.option.id,optionId,'A supported explicit choice takes precedence over preserved defaults.');
   assert.equal(row.option.creditOrigin,'institutional');
   assert.equal(row.option.evidence,'conditional');
  }
  assert.equal(assessPathwayQuality({model,plan,asOf:currentDataAsOf}).publication.ready,false,'A feasible scenario is not an approved personal transfer award.');
 }
});
