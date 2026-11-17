/* Current residential Psychology requirements, separate from its online route. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),View=require('./dist/course-plan-view.js');
const doc=require('./content/curricula/liberty-residential-expansion.json'),facts=require('./content/curricula/snapshots/liberty/psychology-residential-2026-2027-reviewed.json'),model=doc.models[0],copy=value=>JSON.parse(JSON.stringify(value));
const mid='curriculum-liberty-psychology-bs-residential';
const compiled=()=>JSON.parse(fs.readFileSync('./dist/data/curricula/liberty-residential-expansion.json')).models.find(model=>model.id===mid);
function catalog(){return Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),JSON.parse(fs.readFileSync('./dist/data/curriculum-registry.json')));}
const sum=rows=>rows.reduce((total,row)=>total+row.credits,0);

test('source: positive technology choice produces exactly120 unique credits and preserves both shared general requirements',()=>{
 assert.equal(model.id,mid);assert.equal(model.format,'Residential');assert.equal(model.catalogYear,'2026-2027');assert.equal(sum(model.requirements),120);assert.equal(new Set(model.requirements.map(row=>row.id)).size,model.requirements.length);
 const groups=Object.fromEntries(['general','major','electives'].map(category=>[category,sum(model.requirements.filter(row=>row.category===category))]));assert.deepEqual(groups,{general:37,major:51,electives:32});
 assert.equal(model.requirements.find(row=>row.code==='INFT 110').credits,3);assert.equal(model.requirements.filter(row=>row.code==='BIOL 102').length,1);assert.equal(model.requirements.filter(row=>row.code==='PSYC 101').length,1);
 assert.equal(facts.degree.generalEducationRange[1],43);assert.equal(model.overlaps.reduce((n,row)=>n+row.creditsCountedOnce,0),6);
 const shared=model.curriculumSections.find(section=>section.id==='res-psych-ge-social-scientific');assert.deepEqual(shared.sharedRequirementIds,['biol-102','psyc-101']);
 for(const code of ['RLGN 105','EVAN 101','THEO 201','THEO 202'])assert(model.requirements.some(row=>row.code===code),'A transfer waiver cannot remove '+code+' automatically');
});
test('source: resident culminating choice, grades and prerequisite chain are independently sourced',()=>{
 assert(!model.requirements.some(row=>row.code==='PSYC 491'),'The online capstone is not the residential choice');
 const end=model.requirements.find(row=>row.code==='PSYC 497');assert.equal(end.credits,3);assert.deepEqual(end.allowedCourseCodes,['PSYC 495','PSYC 497','PSYC 499']);assert.deepEqual(end.prerequisites,['psyc-101','psyc-255']);
 assert.deepEqual(model.requirements.find(row=>row.code==='PSYC 355').prerequisites,['psyc-101','math-121','psyc-354','psyc-255']);
 assert.equal(model.requirements.find(row=>row.code==='PSYC 354').minimumGrade,'C');assert.equal(model.requirements.find(row=>row.code==='PSYC 101').minimumGrade,undefined);
 assert.equal(model.majorInstitutionFraction,.25);assert.equal(model.majorResidencyBasisCredits,51);assert.equal(model.institutionMinCredits,30);assert.equal(model.upperMinCredits,30);
 const sourceIds=new Set(model.sources.map(source=>source.id));for(const row of model.requirements){for(const id of row.sourceIds)assert(sourceIds.has(id));for(const id of row.prerequisites||[])assert(model.requirements.some(req=>req.id===id));for(const option of row.options)for(const id of option.sourceIds)assert(sourceIds.has(id));}
 assert(model.graduationRequirements.some(item=>item.id==='cser'));assert.equal(model.completeExecutablePathway,false);
});
test('source: exact reviewed residential guide awards retain their own evidence dates',()=>{
 const options=model.requirements.flatMap(row=>row.options);assert(new Set(options.map(option=>option.provider)).size>=4);
 assert(options.every(option=>option.mappingScope.includes('delivery format')));
 assert(options.every(option=>option.sourceIds.every(id=>model.sources.some(source=>source.id===id&&!source.url.includes('/online/')))));
 assert(model.sources.filter(source=>source.evidenceType==='official-receiving-school-equivalency').every(source=>source.checked==='2026-11-10'));
});
test('compiled: campus selection opens its own full provisional plan with school and major residency enforced',()=>{
 const c=catalog(),program=compiled(),route=c.pathways.find(route=>route.modelId===mid);assert(route);assert.deepEqual(route.modalities,['campus']);assert.equal(route.parentId,'liberty-catalog-fa62c08cdfa0c990');
 const variants=Catalog.variants(c.pathways.find(route=>route.id==='liberty-catalog-fa62c08cdfa0c990'),c);assert(variants.some(row=>row.id===route.id));assert(variants.some(row=>row.modalities.includes('online')));
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,c),route),null,c);state.profile.modality='campus';state.profile.classroomImportance='essential';
 const before=JSON.stringify(state),draft=Journey.buildDraft(state,c,[program]);assert(draft.plan);assert.equal(JSON.stringify(state),before);assert.equal(draft.program.id,mid);assert.equal(draft.plan.totals.accounted,120);assert.equal(draft.plan.validation.academicCountsValid,true);assert(draft.plan.totals.institutional>=30);assert(draft.plan.totals.majorInstitutional>=12.75);assert(draft.plan.totals.external<=90);assert(draft.plan.totals.external>=50);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.readiness,'draft');
 const projection=View.build(draft);assert.deepEqual(projection.curriculumIssues,[]);assert.equal(projection.totals.accounted,120);assert.equal(projection.sections.reduce((n,section)=>n+section.credits,0),120);
});
test('compiled: source records and online-only approvals survive campus adoption without becoming campus awards',()=>{
 const c=catalog(),program=compiled(),route=c.pathways.find(route=>route.modelId===mid),english=program.requirements.find(row=>row.code==='ENGL 101'),option=english.options.find(option=>option.provider==='Sophia');
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,c),route),null,c);state.profile.modality='campus';state.learning=[{id:'saved-writing',provider:option.provider,code:option.code,title:option.title,credits:3,creditSystem:'semester',status:'earned',evaluations:[{programId:'curriculum-liberty-psychology-bs-online',requirementId:'engl-101',optionId:option.id,status:'confirmed'}]}];state.sheet.notes={private:'Keep my transfer counselor note'};
 const before=copy(state),draft=Journey.buildDraft(state,c,[program]);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,3);assert.deepEqual(state.learning,before.learning);assert.deepEqual(state.sheet.notes,before.sheet.notes);
 const row=draft.plan.rows.find(row=>row.requirementId===english.id);assert.equal(row.status,'reported');assert.equal(row.credits,3);
});
