const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const document=require('./content/curricula/liberty-history-online.json');
const facts=require('./content/curricula/snapshots/liberty/history-online-2026-2027-reviewed.json');
const model=document.models[0],row=code=>model.requirements.find(req=>req.code===code);

test('History baseline counts shared information-literacy courses once and keeps all 120 credits',()=>{
 assert.equal(model.totalCredits,120);
 const sum=filter=>model.requirements.filter(filter).reduce((total,req)=>total+req.credits,0);
 assert.equal(sum(()=>true),120);assert.equal(sum(req=>req.category==='general'),36);assert.equal(sum(req=>req.group==='major-foundations'),6);assert.equal(sum(req=>req.group==='major-core'),12);assert.equal(sum(req=>req.category==='electives'),42);
 assert.equal(model.requirements.length,new Set(model.requirements.map(req=>req.id)).size);
 for(const code of ['HIUS 221','GEOG 200'])assert.equal(model.requirements.filter(req=>req.code===code).length,1);
 assert.deepEqual(model.overlaps.map(item=>item.requirementId).sort(),['geog-200','hius-221']);
 assert.equal(model.overlaps.reduce((total,item)=>total+item.creditsCountedOnce,0),6);
 assert.equal(model.requirements.some(req=>['ENGL 102','ARTS 209'].includes(req.code)),false,'The two information-literacy positions are already fulfilled by the published shared allocation');
 assert.equal(row('UNIV 104').credits,3);assert.equal(row('RLGN 104').credits,4);assert.equal(row('THEO 104').credits,4);
 assert.equal(model.transferWaiverVariant,undefined);assert.equal(model.completeExecutablePathway,false);
});

test('History named elective choices obey distinct department and upper-level restrictions',()=>{
 const ids=new Set(model.sources.map(source=>source.id));
 for(const req of model.requirements)assert(req.sourceIds.every(id=>ids.has(id)));
 for(const [group,rule] of Object.entries(facts.electiveRestrictions)){
  const choices=model.requirements.filter(req=>req.group===group);assert.equal(choices.reduce((sum,req)=>sum+req.credits,0),rule.credits);
  for(const req of choices){const [prefix,level]=req.code.split(' ');assert(rule.prefixes.includes(prefix));assert(Number(level)>=rule.minLevel&&Number(level)<=rule.maxLevel);assert.equal(req.minimumGrade,'C');assert.equal(req.upper,true);assert(req.sourceIds.some(id=>id.includes('-courses-2026-2027')));}
 }
 assert.equal(model.requirements.filter(req=>req.upper).reduce((sum,req)=>sum+req.credits,0),30);
 for(const code of ['HIUS 221','HIUS 222','HIEU 201','GEOG 200'])assert.equal(row(code).minimumGrade,undefined);
 assert.deepEqual(row('HIEU 201').allowedCourseCodes,['HIEU 201','HIEU 202']);
 assert.equal(model.majorResidencyBasisCredits,42);assert.equal(model.majorInstitutionFraction,.25);assert.equal(model.institutionMinCredits,30);assert.equal(model.upperMinCredits,30);
});

test('History online capstone sequence retains one supported prerequisite alternative rather than the whole OR list',()=>{
 assert.deepEqual(row('HIST 491').prerequisites,['hist-300','hieu-322']);
 assert.equal(row('HIST 491').minimumCompletedCredits,72,'Liberty senior classification starts at72, not an assumed90 credits');
 assert(row('HIST 491').prerequisiteNotes.includes('one course'));
 assert(model.requirements.some(req=>req.id==='hist-300'));assert(model.requirements.some(req=>req.id==='hieu-322'));
 assert.deepEqual(document.routes[0].modalities,['online']);assert.equal(document.routes[0].parentId,'liberty-catalog-5a26b73e7380bcf4');
 assert.equal(document.routes[0].goals.includes('licensed-profession'),false);
});

test('History importer is deterministic and checks source-model drift without network requests',()=>{
 const result=cp.spawnSync('python',['scripts/import-liberty-history-online.py','--check'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});

test('compiled History plan supplies real outside choices, preserves credit rules and orders the capstone',()=>{
 const Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js');
 const pack=JSON.parse(fs.readFileSync('./dist/data/curricula/liberty-history-online.json'));
 const compiled=pack.models.find(item=>item.id===model.id),registry=require('./dist/data/curriculum-registry.json');
 const entry=registry.models.find(item=>item.id===model.id);assert(entry);assert.equal(entry.readyTemplate,true);Catalog.validateModel(compiled,entry);
 assert.equal(compiled.requirements.reduce((sum,req)=>sum+req.credits,0),120);assert.equal(compiled.requirements.some(req=>req.researchGap),false);
 const plan=Planner.generate(compiled,{providers:['Sophia','Study.com','StraighterLine','CLEP'],allowConditional:true,priority:'transfer'});
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.accounted,120);assert(plan.totals.external>=60,'A broad-elective History pathway must have a genuinely useful accelerated allocation');assert(plan.totals.external<=90);assert(plan.totals.institutional>=30);assert(plan.totals.majorInstitutional>=10.5);assert(plan.totals.upper>=30);
 assert.equal(plan.totals.confirmed,0,'Proposed choices are not earned or awarded credits');
 const capstone=plan.rows.find(item=>item.requirementId==='hist-491');assert.equal(capstone.option.provider,'University');assert.deepEqual(capstone.prerequisites,['hist-300','hieu-322']);
 const capstoneStep=plan.sequence.find(step=>step.requirementIds.includes('hist-491'));
 assert.equal(capstoneStep.minimumCompletedCredits,72);assert.deepEqual(capstoneStep.after,['hist-300','hieu-322']);
 const capstoneIndex=plan.sequence.indexOf(capstoneStep);
 for(const prerequisite of capstoneStep.after)assert(plan.sequence.findIndex(step=>step.requirementIds.includes(prerequisite))<capstoneIndex);
 const method=compiled.requirements.find(req=>req.code==='HIST 300');assert(method.options.some(option=>option.provider==='Study.com'&&option.receivingCode==='HIST 300'));
 const excluded=new Set(['HIEU 201','HIEU 202','HIUS 221','HIUS 222','GEOG 200']);
 for(const req of compiled.requirements.filter(req=>req.category==='electives'))assert(req.options.filter(option=>option.provider!=='University').every(option=>!excluded.has(option.receivingCode)),'Required/shared history awards must not fill free electives again');
});
