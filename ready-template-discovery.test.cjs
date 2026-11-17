const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Catalog=require('./dist/program-catalog.js'),base=require('./dist/data/pathways.json'),directory=require('./dist/data/program-catalog.json'),registry=require('./dist/data/curriculum-registry.json');
const clone=value=>JSON.parse(JSON.stringify(value)),catalog=Catalog.attachRegistry(Catalog.merge(base,directory),registry),packs=new Map();
const models=registry.models.map(entry=>{if(!packs.has(entry.path))packs.set(entry.path,JSON.parse(fs.readFileSync('dist/'+entry.path)));const data=packs.get(entry.path);return(Array.isArray(data)?data:data.models||[data]).find(model=>model.id===entry.id);});
function fixture(){const route={id:'ready',modelId:'complete',school:'Test University',title:'Complete degree',level:'bachelor',modalities:['online']},model={id:'complete',school:route.school,title:route.title,totalCredits:3,creditSystem:'semester',completeExecutablePathway:false,requirements:[{id:'writing',title:'Writing',credits:3,options:[{id:'provider-course',provider:'Sophia',credits:3,evidence:'conditional'}]}]};return{route,model,catalog:{pathways:[route],curriculumRegistry:{models:[{id:model.id,coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0,routeIds:[route.id]}]}}};}
test('default discovery offers only complete reviewed requirement plans from the actual catalog',()=>{
 const before=JSON.stringify(catalog),ready=Catalog.availablePlans(catalog,models);
 assert(ready.length>=30);assert(ready.length<catalog.pathways.length);assert.equal(new Set(ready.map(route=>route.id)).size,ready.length);
 for(const route of ready){assert(route.modelId);assert.equal(Catalog.modelReadiness(models.find(model=>model.id===route.modelId)).available,true);assert.equal(route.curriculumCoverage,'complete');}
 assert(ready.some(route=>route.modelId==='curriculum-liberty-healthcare-administration-bs-online'));
 assert(ready.some(route=>route.modelId==='curriculum-liberty-psychology-bs-residential'));
 assert(ready.some(route=>route.id==='liberty-business-residential'));assert(!ready.some(route=>route.school==='Old Dominion University'));assert(!ready.some(route=>route.school==='Southern New Hampshire University'));
 assert(!ready.some(route=>route.modelId==='curriculum-phoenix-da-bs-information-technology'));
 assert.equal(JSON.stringify(catalog),before,'Filtering must not remove saved targets or official source records from the underlying catalog');
});
test('conditional transfer evidence remains usable without claiming individual school approval',()=>{
 const f=fixture();assert.equal(Catalog.modelReadiness(f.model).available,true);assert.equal(Catalog.isPlanAvailable(f.route,f.catalog,[f.model]),true);assert.equal(f.model.completeExecutablePathway,false);
});
test('a model identifier, incomplete ledger, or placeholder course cannot activate a template',()=>{
 const f=fixture();assert.equal(Catalog.isPlanAvailable(f.route,{pathways:[f.route]},[f.model]),false);
 for(const change of [model=>model.requirements[0].researchGap=true,model=>model.totalCredits=120,model=>model.requirements[0].options=[],model=>model.requirements[0].options[0].credits=2,model=>model.coverage='partial',model=>{model.requirements.push(clone(model.requirements[0]));model.totalCredits=6;}]){const model=clone(f.model);change(model);assert.equal(Catalog.modelReadiness(model).available,false);assert.equal(Catalog.isPlanAvailable(f.route,f.catalog,[model]),false);}
 const partial=clone(f.catalog);partial.curriculumRegistry.models[0].coverage='partial';assert.equal(Catalog.isPlanAvailable(f.route,partial,[f.model]),false);
});
test('lazy discovery trusts only complete reviewed entries and rechecks their loaded requirements',()=>{
 const f=fixture();assert.equal(Catalog.isPlanAvailable(f.route,f.catalog),true);const broken=clone(f.model);broken.requirements[0].researchGap=true;assert.equal(Catalog.isPlanAvailable(f.route,f.catalog,[broken]),false);
 const parent={id:'family',school:f.route.school,title:'Degree family',planningVariants:[f.route.id]};f.catalog.pathways.push(parent);assert.equal(Catalog.isPlanAvailable(parent,f.catalog,[f.model]),true);assert.deepEqual(Catalog.availablePlans(f.catalog,[f.model]).map(route=>route.id),[f.route.id]);
});
test('closed and upcoming programs remain outside ready-to-use choices',()=>{
 for(const status of ['planned','approval-pending','closed','discontinued']){const f=fixture();f.route.status=status;assert.equal(Catalog.availablePlans(f.catalog,[f.model]).length,0);}
 const f=fixture();f.route.intakeVerified=false;assert.equal(Catalog.availablePlans(f.catalog,[f.model]).length,0);
});
test('filtering templates leaves an existing incomplete private plan and its source records recoverable',()=>{
 const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),route=catalog.pathways.find(route=>route.id==='liberty-business-residential');
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);state.profile.modality='campus';state.learning=[{id:'private-course',provider:'University',title:'My old course',code:'ENG101',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}];state.sheet.notes={private:'Keep my note'};
 const before=JSON.stringify(state);Catalog.availablePlans(catalog,models);const current=Journey.buildDraft(state,catalog,[...models,...Catalog.modelFiles.map(file=>require('./dist/'+file))]);assert.equal(current.pathway.id,route.id);assert(current.plan);assert.equal(JSON.stringify(state),before);assert.equal(current.state.learning[0].id,'private-course');assert.equal(current.state.sheet.notes.private,'Keep my note');
});

test('published choice counts distinguish open requirements from ordinary course alternatives',()=>{
 const f=fixture();f.model.requirements[0].options.push({id:'another-reviewed-course',provider:'Study.com',credits:3});assert.equal(Catalog.planChoiceCount(f.route,f.catalog,[f.model]),0);
 f.model.requirements[0].selectionRequired=true;assert.equal(Catalog.planChoiceCount(f.route,f.catalog,[f.model]),1);
 for(const route of Catalog.availablePlans(catalog,models)){const model=models.find(model=>model.id===route.modelId),expected=Catalog.courseChoiceCounts(model).openCourseChoices,entry=registry.models.find(entry=>entry.id===model.id);assert.equal(entry.openCourseChoices,expected,model.id);assert.equal(Catalog.planChoiceCount(route,catalog),expected);}
});

test('mandatory anonymous choice blocks stay unavailable while sourced free electives remain usable',()=>{
 const f=fixture();f.model.requirements[0].selectionRequired=true;f.model.requirements[0].options[0].selectionRequired=true;
 assert.equal(Catalog.courseChoiceCounts(f.model).unresolvedRequiredChoices,1);assert.equal(Catalog.modelReadiness(f.model).available,false);
 f.model.requirements[0].freeElective=true;assert.equal(Catalog.modelReadiness(f.model).available,false,'A free-elective flag needs its published source');
 f.model.sources=[{id:'published-degree',url:'https://example.edu/degree'}];f.model.requirements[0].sourceIds=['published-degree'];assert.equal(Catalog.modelReadiness(f.model).available,true);assert.equal(Catalog.courseChoiceCounts(f.model).unresolvedRequiredChoices,0);
 const wrongLazy=clone(f.catalog);wrongLazy.curriculumRegistry.models[0].readyTemplate=false;wrongLazy.curriculumRegistry.models[0].unresolvedRequiredChoices=1;assert.equal(Catalog.isPlanAvailable(f.route,wrongLazy),false);
});
