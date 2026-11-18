const test=require('node:test'),assert=require('node:assert/strict');
const facts=require('./content/curricula/snapshots/tesu/finance-current-2026-11-18-reviewed.json'),baseline=require('./dist/data/tesu.json'),Planner=require('./dist/planner.js');
const clone=value=>JSON.parse(JSON.stringify(value)),load=()=>import('./scripts/import-tesu-finance.mjs');
test('Finance has an independently sourced 120-credit ledger without changing General Management or inventing awards',async()=>{
 const {buildTESUFinance,run}=await load(),original=JSON.stringify([facts,baseline]),document=buildTESUFinance(facts,baseline),model=document.models[0];
 assert.equal((await run({check:true})).newProviderEquivalencies,0);assert.equal(JSON.stringify([facts,baseline]),original);
 assert.equal(model.id,'curriculum-tesu-bsba-finance');assert.equal(document.routes[0].id,'tesu-bsba-finance');assert.equal(model.requirements.length,40);
 const sum=predicate=>model.requirements.filter(predicate).reduce((n,row)=>n+row.credits,0);
 assert.equal(sum(()=>true),120);assert.equal(sum(row=>row.category==='general'),45);assert.equal(sum(row=>row.group==='business-core'),42);assert.equal(sum(row=>row.group==='area-of-study'),18);assert.equal(sum(row=>row.group==='free-electives'),15);
 assert.deepEqual(model.requirements.filter(row=>row.group==='area-of-study').map(row=>row.code),['FIN-3140','FIN-3340','FIN-3820','FIN-3210','FIN-3310','FDR-4400']);
 assert.equal(model.requirements.filter(row=>row.freeElective).length,4);assert(model.requirements.filter(row=>row.freeElective).every(row=>!row.code&&row.options.length===1&&row.options[0].provider==='University'&&row.options[0].code));
 assert(!model.requirements.flatMap(row=>row.options).some(option=>option.provider!=='University'));
});
test('Finance math prerequisites cannot disappear into unrestricted elective substitutions',async()=>{
 const {buildTESUFinance}=await load(),model=buildTESUFinance(facts,baseline).models[0],row=code=>model.requirements.find(row=>row.code===code);
 const math=row('MAT-1290');assert.equal(math.credits,3);assert.equal(math.group,'free-electives');assert.notEqual(math.freeElective,true);assert.equal(math.bucket,undefined);assert.deepEqual(math.prerequisites,['mat1210']);
 for(const code of ['FIN-3210','FIN-3820'])assert.deepEqual(row(code).prerequisites,['fin3010','sta2010','mat1290']);
 assert.deepEqual(row('FIN-3140').prerequisites,['fin3010']);
 for(const code of ['FIN-3340','FIN-3310','FDR-4400'])assert.equal(row(code).prerequisites,undefined);
 assert(!model.requirements.some(row=>row.code==='MAT-1190'),'Published OR alternatives are not both required');
 assert.match(row('FIN-3820').notes,/formal.*MAT-1190 or MAT-1290/i);
 for(const [code,prerequisites]of [['ACC-1020',['acc1010']],['FIN-3010',['acc1010']],['BUS-2100',['mat1210']],['STA-2010',['mat1210']],['MAN-3720',['man2100']]])assert.deepEqual(row(code).prerequisites,prerequisites);
 const identities=new Set(model.requirements.map(row=>row.id));for(const requirement of model.requirements)for(const id of requirement.prerequisites||[])assert(identities.has(id));
});
test('Finance retains scoped grades, exact current-catalog tuition and distinct source caps',async()=>{
 const {buildTESUFinance}=await load(),model=buildTESUFinance(facts,baseline).models[0];
 assert.equal(model.catalogYear,null);assert.equal(model.catalogIdentity.kind,'reviewed-current-catalog');assert.deepEqual(model.tuitionComparison.catalogIdentity,model.catalogIdentity);assert.equal(model.tuitionComparison.modelId,model.id);assert.equal(model.tuitionComparison.entryId,'tesu-standard');
 assert(model.sources.some(source=>source.url===model.catalogIdentity.sourceUrl&&source.checked===model.catalogIdentity.checkedOn));
 assert(model.sources.some(source=>source.url===model.tuitionComparison.sourceUrl&&source.checked===model.tuitionComparison.checkedOn));
 assert.equal(model.institutionMinCredits,15);assert.equal(model.externalMaxCredits,105);assert.equal(model.alternativeMaxCredits,90);
 for(const requirement of model.requirements){const needsC=['ENC-1010','ENC-1020'].includes(requirement.code)||['business-core','area-of-study'].includes(requirement.group);assert.equal(requirement.minimumGrade,needsC?'C':undefined,requirement.id);for(const id of [...requirement.sourceIds,...(requirement.prerequisiteSourceIds||[]),...(requirement.minimumGradeSourceIds||[])])assert(model.sources.some(source=>source.id===id),id);}
 for(const code of ['SOS-1100','BUS-4210'])assert.equal(model.requirements.find(row=>row.code===code).institutionalOnly,true);
 const sections=model.curriculumSections.flatMap(section=>section.requirementIds);assert.equal(sections.length,40);assert.equal(new Set(sections).size,40);
 assert.equal(model.existingCreditReview.kind,'tesu-finance-course-currency');assert.deepEqual(model.existingCreditReview.groups.map(group=>[group.id,group.totalCredits,group.maxAgeYears,group.maxOlderCredits]),[['finance-area',18,10,9],['business-capstone',3,5,0]]);
});
test('Finance named university fallback is academically valid and meets upper-level policy without an Accounting-only group minimum',async()=>{
 const {buildTESUFinance}=await load(),model=buildTESUFinance(facts,baseline).models[0];
 assert.deepEqual(model.upperGroupMinimums,[{group:'area-of-study',credits:12},{groups:['area-of-study','business-core'],credits:18}]);
 for(const row of model.requirements)if(!row.options.length)row.options=[{id:'university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,upper:row.upper,creditSystem:'semester',creditOrigin:'institutional',evidence:'published',sourceIds:row.sourceIds}];
 const before=JSON.stringify(model),plan=Planner.generate(model,{providers:[],allowConditional:true});assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.validation.errors));assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.institutional,120);assert(plan.totals.upper>=18);assert(plan.rows.every(row=>row.option?.code&&!row.selectionRequired));assert.equal(JSON.stringify(model),before);
});
test('Finance importer rejects changed common credits and omission of the selected math prerequisite',async()=>{
 const {buildTESUFinance}=await load(),wrong=clone(baseline);wrong.requirements.find(row=>row.code==='COM-2090').credits=4;assert.throws(()=>buildTESUFinance(facts,wrong));
 const bad=clone(facts);bad.degree.selectedMathPrerequisite=['MAT-1190','Quantitative Business Analysis',3];assert.throws(()=>buildTESUFinance(bad,baseline));
});
