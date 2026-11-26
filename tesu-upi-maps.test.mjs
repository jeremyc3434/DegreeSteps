import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {upiCourseReview} from './scripts/upi-course-catalog.mjs';
import {upiTESUReview,supportedUPIMappings,upiTESUOption,upiLiberalArtsPlacement,applyTESUUPIReviewedMaps,writeTESUUPIKit} from './scripts/tesu-upi-maps.mjs';
import {applyTESUUPIProviderDefaults} from './scripts/tesu-upi-defaults.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),Guide=require('./dist/guide-engine.js');
const legacy=JSON.parse(await readFile('dist/data/tesu.json','utf8')),kit=await loadKit(kitsRoot+'/tesu'),{doc}=compileKit(kit),copy=x=>structuredClone(x);
const models=[...doc.models,applyTESUUPIReviewedMaps(legacy)],pairs=supportedUPIMappings();

test('UPI legal issuer aliases stay consistent across library, import, saved identity and degree matching',()=>{
 const Library=require('./dist/course-library-engine.js'),Import=require('./dist/record-import-engine.js'),Sheet=require('./dist/sheet-state.js');
 const model=models.find(model=>model.id==='curriculum-tesu-bsba-accounting'),row=model.requirements.find(row=>!row.freeElective&&row.options.some(option=>option.provider==='UPI Study')),option=row.options.find(option=>option.provider==='UPI Study'),program={...model,requirements:[{...row,options:[option]}]};
 const record={id:'upi-legal-issuer',provider:'University Pathways International',code:option.code,title:option.title,credits:option.sourceCredits,creditSystem:'semester',status:'earned',grade:'C',score:70,courseVersion:option.courseVersion,completedOn:option.recommendationStart,evaluations:[]};
 const original=structuredClone(record),result=Guide.matchInventory(program,[record]);assert.equal(result.completed.length,1);assert.equal(result.completed[0].status,'reported');assert.deepEqual(record,original,'Computation preserves the original issuer label.');
 const state=Library.initialize(null);state.learning=[record];assert.equal(Library.findRecord(state,{provider:'UPI Study',code:option.code}).id,record.id);record.evaluations=[{programId:model.id,requirementId:row.id,optionId:option.id,status:'confirmed'}];record.catalogCourseId='upi-saved-catalog-identity';record.sourceUrl=option.providerCourseUrl;record.codeBasis='provider-listing';record.codeAliases=[option.code];const provenance=structuredClone(record);const merged=Sheet.mergeLearning(state,[{...record,id:'same-course-alias',provider:'UPI Study'}]);assert.equal(merged.learning.length,1);assert.equal(merged.learning[0].id,record.id);assert.equal(merged.learning[0].courseVersion,record.courseVersion);for(const field of['evaluations','catalogCourseId','sourceUrl','codeBasis','codeAliases'])assert.deepEqual(merged.learning[0][field],provenance[field],'An alias-only import preserves '+field);
 const parsed=Import.parseCSV('provider,code,title,credits,creditSystem,status,grade,score,completedOn\nUniversity Pathways International,'+option.code+','+option.title+',3,semester,earned,C,70,'+option.recommendationStart+'\n');assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].record.provider,'University Pathways International');
 const preview=Import.prepareImport([{...record,provider:'UPI Study'}],parsed.rows);assert.equal(preview.additions.length,0,'An issuer alias cannot create a second copy of the same original course.');assert.equal(preview.conflicts.length,0);assert.equal(preview.duplicates.length,1);assert.deepEqual(preview.records[0].evaluations,record.evaluations);
});

test('UPI TESU table is hash-bound provider evidence, distinct from exact current original-course facts',async()=>{
 assert.equal(upiTESUReview.publicationPromotionAllowed,false);assert.equal(upiTESUReview.mappings.length,86);
 const source=upiTESUReview.sources[0],text=await readFile(source.capture,'utf8'),meta=JSON.parse(await readFile(source.capture.replace('.txt','.json'),'utf8'));
 assert.equal(createHash('sha256').update(text).digest('hex'),meta.sha256);assert.equal(meta.status,200);assert.equal(meta.rawBodyCaptured,false);assert.equal(meta.url,source.url);assert.match(meta.rawBodySha256,/^[a-f0-9]{64}$/);
 for(const mapping of upiTESUReview.mappings){assert.ok(text.includes(mapping.quote));assert.equal(mapping.claimOrigin,'provider-published');assert.equal(mapping.receivingAwardIndependentlyVerified,false);}
 assert(pairs.length>0,'An actual current source-course set supports the first candidate batch.');
 for(const {mapping,course} of pairs){assert.equal(course.sourceCredits,mapping.providerClaimedSourceCredits);assert.equal(course.sourceCredits,mapping.receivingCredits);assert.equal(course.sourceCreditSystem,'semester');assert.deepEqual(new URL(course.courseUrl).pathname.replace(/\/$/,''),new URL(mapping.courseUrl).pathname.replace(/\/$/,''));}
 const environment=upiTESUReview.mappings.find(m=>/Environmental Science/.test(m.providerLabel));assert(environment);assert.equal(pairs.some(p=>p.mapping.id===environment.id),false,'One original ACE credit cannot silently become three receiving credits from a provider assertion.');
});

test('six TESU ledgers gain usable conditional UPI choices with source, cap and placement evidence',async()=>{
 assert.equal(models.length,6);await runGuards(kit,doc);
 for(const model of models){
  const options=model.requirements.flatMap(row=>row.options.filter(option=>option.provider==='UPI Study').map(option=>({row,option})));
  assert(options.length>0,model.id);assert(model.defaultProviders.includes('UPI Study'));
  assert.equal(model.totalCredits,120);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert.equal(model.institutionMinCredits,15);assert.equal(model.alternativeMaxCredits,90);assert.equal(model.upperMinCredits,18);
  for(const {row,option}of options){
   assert.equal(option.evidence,'conditional');assert.equal(option.evidenceType,'provider-published');assert.equal(option.mappingResearchClosed,false);assert.equal(option.mappingEvidence.claimOrigin,'provider-published');assert.equal(option.mappingEvidence.individualApproval,false);
   assert.equal(option.creditOrigin,'alternative');assert.equal(option.sourceType,'alternative');assert.equal(option.sourceCredits,option.credits);assert.equal(option.sourceCreditSystem,'semester');
   assert.equal(option.minScore,70);assert.equal(option.providerCoursePassingPercent,70);assert.equal(option.passingScoreScope,'overall-course-completion');
   assert(option.minScoreSourceIds.length>0&&option.minScoreSourceIds.every(id=>option.providerCoursePassingSourceIds.includes(id)&&upiCourseReview.sources.some(source=>source.id===id&&source.kind==='ace-course-exhibit')));
   assert.equal(option.eligibilityReview.fullyApproved,true);assert.equal(option.eligibilityReview.providerReviewPending,false);assert.equal(Object.hasOwn(option.eligibilityReview,'eligibleToStart'),false);
   assert(option.sourceIds.every(id=>model.sources.some(source=>source.id===id)));assert.equal(option.degreePlacementEvidence.requirementId,row.id);
   assert(!row.institutionalOnly);assert(row.freeElective||row.code===option.receivingCode||upiLiberalArtsPlacement(model,row,{receivingCode:option.receivingCode}));
  }
  const exactReceiving=new Set(model.requirements.filter(row=>!row.freeElective).map(row=>row.code));
  assert(options.filter(({row})=>row.freeElective).every(({option})=>!exactReceiving.has(option.receivingCode)),'Elective suggestions do not duplicate a course already named by this degree.');
 }
 assert.deepEqual((await verifyKit(kit,{asOf:'2026-11-26'})).errors,[]);
 await writeTESUUPIKit({check:true});
});

test('UPI Liberal Studies candidates follow the receiving taxonomy and level limits without promoting provider claims',async()=>{
 const model=models.find(model=>model.id==='curriculum-tesu-ba-liberal-studies'),intro=model.requirements.find(row=>row.id==='bals-intro-1'),intermediate=model.requirements.find(row=>row.id==='bals-intermediate-1'),upper=model.requirements.find(row=>row.id==='bals-upper-1');
 const allowed=['COS-2050','ECO-2700','ENG-2010'];
 for(const code of allowed){
  const pair=pairs.find(pair=>pair.mapping.receivingCode===code);assert(pair,code);
  const option=upiTESUOption(model,intermediate,pair.mapping,pair.course);assert(option,code+' fits sourced 2000-level liberal-arts capacity');
  assert.equal(option.evidence,'conditional');assert.equal(option.mappingResearchClosed,false);assert.equal(option.degreePlacementEvidence.placementType,'liberal-arts-area');
  assert.equal(option.sourceUpper,pair.course.sourceUpper);assert.equal(option.upper,false,'A source upper-level recommendation cannot change the receiving level.');
  assert.equal(upiTESUOption(model,upper,pair.mapping,pair.course),null,code+' cannot fill an upper-level area requirement');
 }
 const psychology=pairs.find(pair=>pair.mapping.receivingCode==='PSY-1010');assert(upiTESUOption(model,intro,psychology.mapping,psychology.course));assert.equal(upiTESUOption(model,intermediate,psychology.mapping,psychology.course),null,'1000-level psychology cannot fill 2000-level capacity');
 for(const code of ['ACC-1020','LAW-2010','MKT-2010','FIN-2000','MAN-4310','CAP-2530','TEC-2610']){
  const pair=pairs.find(pair=>pair.mapping.receivingCode===code);assert(pair);
  assert.equal(upiTESUOption(model,intro,pair.mapping,pair.course),null,code+' has no established Liberal Studies discipline classification');
 }
 const code='COS-2050',pair=pairs.find(pair=>pair.mapping.receivingCode===code);
 assert.equal(upiTESUOption({...model,catalog:'Unreviewed catalog'},intermediate,pair.mapping,pair.course),null);
 for(const patch of [{allowedCoursePrefixes:[]},{sourceIds:[]},{minCourseLevel:3000},{maxCourseLevel:1999},{liberalArtsAllocation:false}])assert.equal(upiTESUOption(model,{...intermediate,...patch},pair.mapping,pair.course),null,JSON.stringify(patch));
 const choices=model.requirements.filter(row=>row.liberalArtsAllocation).flatMap(row=>row.options.filter(option=>option.provider==='UPI Study').map(option=>({row,option})));
 assert(choices.length>30);assert(choices.every(({row,option})=>upiLiberalArtsPlacement(model,row,{receivingCode:option.receivingCode})));
 for(const mutate of [o=>o.receivingCode='MAN-4310',o=>o.receivingCode='PSY-1010',o=>o.upper=true,o=>o.degreePlacementEvidence.placementType='elective']){
  const broken=copy(doc),row=broken.models.find(model=>model.id==='curriculum-tesu-ba-liberal-studies').requirements.find(row=>row.id==='bals-intermediate-1'),option=row.options.find(option=>option.provider==='UPI Study');mutate(option);await assert.rejects(()=>runGuards(kit,broken));
 }
});

test('the sourced Liberal Studies allocation still expands a nonduplicating basket alongside newer published awards',()=>{
 const after=copy(models.find(model=>model.id==='curriculum-tesu-ba-liberal-studies'));
 // The registry supplies the named University fallback for requirements whose kit lists only outside options.
 for(const row of after.requirements)if(!row.options.some(option=>option.provider==='University'))row.options.push({id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,upper:Boolean(row.upper),creditSystem:'semester',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
 const before=copy(after);for(const row of before.requirements)if(row.liberalArtsAllocation)row.options=row.options.filter(option=>option.provider!=='UPI Study');
 const generate=model=>Planner.generate(model,{providers:model.defaultProviders,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000}),oldPlan=generate(before),newPlan=generate(after);
 // New institution-submitted Sophia choices increase the pre-UPI basket. The
 // provider-only choices still add six feasible credits without replacing a
 // published receiving award or inflating the 90-credit alternative ceiling.
 assert.equal(oldPlan.totals.external,81);assert.equal(newPlan.totals.external,87);assert.equal(newPlan.totals.alternative,87);assert.equal(newPlan.totals.institutional,33);
 assert.equal(newPlan.validation.academicCountsValid,true);assert.equal(newPlan.validation.policyChecksComplete,true);
 const additions=newPlan.rows.filter(row=>row.option?.provider==='UPI Study'&&row.option?.allocationType==='liberal-arts-area');
 assert.deepEqual(additions.map(row=>row.option.receivingCode).sort(),['COS-2050','ECO-2700']);
 assert(additions.every(row=>row.option.evidence==='conditional'&&row.option.mappingResearchClosed===false));
 const upperArea=newPlan.rows.filter(row=>after.liberalArtsAllocation.requirementIds.includes(row.requirementId)||row.requirementId===after.liberalArtsAllocation.capstoneRequirementId).filter(row=>row.option?.upper).reduce((sum,row)=>sum+row.credits,0);
 assert(upperArea>=18);assert(newPlan.totals.alternative<=90);
 const actions=newPlan.rows.filter(row=>row.option?.provider!=='University').map(row=>row.option.provider+'|'+row.option.code);assert.equal(new Set(actions).size,actions.length,'No original course fills two requirements.');
});

test('UPI placement never guesses another requirement, restricted block, school or graduate catalog',()=>{
 const model=models.find(model=>model.id==='curriculum-tesu-bsba-accounting'),pair=pairs.find(p=>model.requirements.some(r=>r.code===p.mapping.receivingCode));assert(pair);
 const row=model.requirements.find(r=>r.code===pair.mapping.receivingCode);
 for(const patch of [{institutionalOnly:true},{credits:4},{code:'OTHER-9999'}])assert.equal(upiTESUOption(model,{...row,...patch},pair.mapping,pair.course),null);
 for(const patch of [{school:'Other university'},{level:'master'},{id:'unreviewed-tesu-degree'},{modalities:['campus']},{creditSystem:'quarter'}])assert.equal(upiTESUOption({...model,...patch},row,pair.mapping,pair.course),null);
 const free=model.requirements.find(r=>r.freeElective);
 const electivePair=pairs.find(p=>!model.requirements.some(r=>!r.freeElective&&r.code===p.mapping.receivingCode)&&p.mapping.receivingCredits===free.credits);assert(electivePair);
 for(const patch of [{group:'area-of-study'},{category:'major'},{excludeAlreadyUsed:false},{freeElective:false,code:'ELECTIVE-OTHER'}])assert.equal(upiTESUOption(model,{...free,...patch},electivePair.mapping,electivePair.course),null);
 const input={...legacy,scenarios:{providers:['Sophia']}};assert.deepEqual(applyTESUUPIProviderDefaults(input).scenarios,input.scenarios,'The availability helper never edits a saved provider choice.');
 assert.deepEqual(applyTESUUPIReviewedMaps(applyTESUUPIReviewedMaps(legacy)),applyTESUUPIReviewedMaps(legacy));
});

test('UPI original source quantities, versions and dates remain distinct from reported or confirmed school credit',()=>{
 const model=models.find(model=>model.id==='curriculum-tesu-bsba-accounting'),row=model.requirements.find(r=>!r.freeElective&&r.options.some(o=>o.provider==='UPI Study'));assert(row);
 const option=row.options.find(o=>o.provider==='UPI Study'),program={...model,requirements:[{...row,options:[option]}]},record={id:'upi-existing-course',provider:'UPI Study',code:option.code,title:option.title,credits:option.sourceCredits,creditSystem:'semester',status:'earned',grade:'C',courseVersion:option.courseVersion,completedOn:option.recommendationStart,evaluations:[]};
 const match=r=>Guide.matchInventory(program,[r]);
 assert.equal(match(record).completed.length,1);assert.equal(match(record).completed[0].status,'reported');
 for(const change of [{credits:option.sourceCredits+1},{creditSystem:'quarter'},{provider:'Sophia'},{completedOn:'2020-01-01'},{completedOn:'2039-01-01'},{courseVersion:'unreviewed-version'}])assert.equal(match({...record,...change}).completed.length,0,JSON.stringify(change));
 const before=JSON.stringify(record);match(record);assert.equal(JSON.stringify(record),before);
 const accounting=pairs.find(p=>/Managerial Accounting/.test(p.course.title));
 if(accounting){assert.equal(accounting.course.sourceUpper,true);const receiving=model.requirements.find(r=>r.code==='ACC-1020'),choice=receiving.options.find(o=>o.provider==='UPI Study');assert(choice);assert.equal(choice.sourceUpper,true);assert.equal(choice.upper,false,'A source upper-division recommendation does not turn the TESU lower-division receiving course into upper credit.');}
});

test('UPI academic guards reject false authority, false original quantity, cap evasion and wrong placement',async()=>{
 for(const mutate of [o=>o.evidence='published',o=>o.mappingResearchClosed=true,o=>o.mappingEvidence.claimOrigin='receiving-institution-submitted',o=>o.creditOrigin='institutional',o=>o.sourceCredits=1,o=>o.minScore=50,o=>delete o.providerCoursePassingPercent,o=>o.minScoreSourceIds=['unknown'],o=>o.mappingEvidence.sourceIds=['unknown'],o=>o.degreePlacementEvidence.requirementId='another-row']){
  const changed=copy(doc),option=changed.models[0].requirements.flatMap(row=>row.options).find(o=>o.provider==='UPI Study');mutate(option);await assert.rejects(()=>runGuards(kit,changed));
 }
});

test('known failing UPI course scores never project credit; unknown scores remain reported without inventing a pass or school award',()=>{
 const model=models.find(model=>model.id==='curriculum-tesu-bsba-accounting'),row=model.requirements.find(r=>r.freeElective&&r.options.some(o=>o.provider==='UPI Study'&&o.code==='UPIS-0003'));
 assert(row,'The Statistics source has a researched candidate use in an unrestricted elective block.');
 const option=row.options.find(o=>o.provider==='UPI Study'&&o.code==='UPIS-0003'),program={...model,requirements:[{...row,options:[option]}]},base={id:'upi-statistics-score',provider:'UPI Study',code:'UPIS-0003',title:option.title,credits:3,creditSystem:'semester',status:'earned',courseVersion:option.courseVersion,completedOn:'2026-11-25',evaluations:[]};
 const match=record=>Guide.matchInventory(program,[record]);
 for(const score of [0,50,69])assert.equal(match({...base,score}).completed.length,0,'Known below-standard course score '+score+' cannot project receiving credit.');
 const passed=match({...base,score:70});assert.equal(passed.completed.length,1);assert.equal(passed.completed[0].status,'reported');
 for(const record of [copy(base),{...base,score:null}]){const original=JSON.stringify(record),unknown=match(record);assert.equal(unknown.completed.length,1,'Existing reported-credit contract does not invent a failing numeric score when no score was supplied.');assert.equal(unknown.completed[0].status,'reported');assert.equal(JSON.stringify(record),original,'No passing score or confirmed school evaluation is written into the original course record.');}
});

test('UPI counts toward combined alternative limits and never double counts one source course',()=>{
 const rows=Array.from({length:6},(_,index)=>({id:'r'+index,code:'TEST-'+index,title:'Requirement '+index,credits:3,category:'general',options:[{id:'upi-'+index,provider:'UPI Study',code:'UPI-'+index,title:'Source '+index,credits:3,creditSystem:'semester',creditOrigin:'alternative',evidence:'conditional',sourceIds:['policy']},{id:'school-'+index,provider:'University',code:'TEST-'+index,title:'Requirement '+index,credits:3,creditOrigin:'institutional',evidence:'published',sourceIds:['policy']}]}));
 const program={id:'upi-cap-check',school:'Test college',title:'Test degree',totalCredits:18,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:0,alternativeMaxCredits:6,requirements:rows,sources:[{id:'policy'}],unresolved:[]};
 const plan=Planner.generate(program,{providers:['UPI Study'],allowConditional:true,completed:[],priority:'transfer'});assert.equal(plan.totals.external,6);assert.equal(plan.rows.filter(row=>row.option.provider==='UPI Study').length,2);
 rows[1].options[0].code=rows[0].options[0].code;
 const duplicatePlan=Planner.generate(program,{providers:['UPI Study'],allowConditional:true,completed:[],priority:'transfer'}),outside=duplicatePlan.rows.filter(row=>row.option.provider==='UPI Study');assert.equal(new Set(outside.map(row=>row.option.code)).size,outside.length);
});
