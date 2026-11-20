const test=require('node:test'),assert=require('node:assert/strict');
const Catalog=require('./dist/program-catalog.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const model={id:'reviewed-degree',school:'Example University',title:'Example degree',totalCredits:6,creditSystem:'semester',coverage:'complete',sources:[{id:'catalog',url:'https://example.edu/catalog/'}],requirements:[{id:'writing',code:'ENG101',title:'Writing',credits:3,sourceIds:['catalog'],options:[{id:'writing-university',provider:'University',code:'ENG101',title:'Writing',credits:3,evidence:'published',sourceIds:['catalog']}]},{id:'math',code:'MAT101',title:'Math',credits:3,sourceIds:['catalog'],options:[{id:'math-university',provider:'University',code:'MAT101',title:'Math',credits:3,evidence:'published',sourceIds:['catalog']}]}]};
 const route={id:'example-degree',modelId:model.id,school:model.school,title:model.title,level:'associate',modalities:['online']};
 const registry={version:1,checkedOn:'2026-11-19',models:[{id:model.id,path:'data/reviewed-degree.json',routeIds:[route.id],school:model.school,title:model.title,status:'reviewed',coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0,openCourseChoices:0,degreeCredits:6,creditUnit:'semester',modalities:['online']}]};
 const catalog=Catalog.attachRegistry({pathways:[route]},registry),index={schemaVersion:1,registryRevision:'academic-v1:'+'a'.repeat(64),curriculumFingerprint:Catalog.publicationFingerprint(registry),privateRecordsIncluded:false,plans:[{modelId:model.id,level:'associate',modelFingerprint:Catalog.publicationModelFingerprint(model,'associate'),routeIds:[route.id],publicationReady:true}]};
 return {model,route,registry,catalog,index};
}
test('a structurally complete saved plan stays usable but needs separate full review before recommendation',()=>{
 const f=fixture(),before=JSON.stringify(f);
 assert.equal(Catalog.availablePlans(f.catalog,[f.model]).length,1);
 assert.deepEqual(Catalog.publishedPlans(f.catalog,[f.model]),[]);
 const reviewed=Catalog.attachPublicationIndex(f.catalog,f.index,f.registry);
 assert.deepEqual(Catalog.publishedPlans(reviewed,[f.model]).map(route=>route.id),[f.route.id]);
 assert.equal(Catalog.isPlanAvailable(f.route,f.catalog,[f.model]),true);
 assert.equal(JSON.stringify(f),before,'Attaching review metadata cannot rewrite a saved plan or model');
});
test('stale policy, course, source, model or registry data cannot reuse an old publication decision',()=>{
 const f=fixture(),reviewed=Catalog.attachPublicationIndex(f.catalog,f.index,f.registry);
 for(const edit of [model=>model.externalMaxCredits=3,model=>model.sources[0].url='https://example.edu/new-catalog/',model=>model.requirements[0].options[0].code='ENG102',model=>model.catalog='2027']){
  const changed=copy(f.model);edit(changed);
  assert.deepEqual(Catalog.publishedPlans(reviewed,[changed]),[]);
 }
 const registry=copy(f.registry);registry.models[0].checkedOn='2026-11-20';
 assert.throws(()=>Catalog.attachPublicationIndex(f.catalog,f.index,registry),/current curriculum/);
});
test('bad route identities, missing models and false publication states cannot become ready plans',()=>{
 for(const edit of [index=>index.plans[0].routeIds=['another-degree'],index=>index.plans[0].modelId='another-model',index=>index.plans[0].publicationReady=false,index=>index.plans.push(copy(index.plans[0])),index=>index.privateRecordsIncluded=true,index=>delete index.plans[0].modelFingerprint]){
  const f=fixture(),bad=copy(f.index);edit(bad);
  assert.throws(()=>Catalog.attachPublicationIndex(f.catalog,bad,f.registry));
 }
});
test('unavailable publication metadata fails closed for discovery and preserves structural saved-plan access',async()=>{
 const f=fixture(),urls=[];
 const catalog=await Catalog.loadIndex({pathways:[f.route]},{index:f.registry,fetcher:async url=>{urls.push(url);return {ok:false,status:503};}});
 assert.deepEqual(urls,['data/publication-index.json']);
 assert.equal(catalog.publicationIndex.available,false);
 assert.deepEqual(Catalog.publishedPlans(catalog,[f.model]),[]);
 assert.deepEqual(Catalog.availablePlans(catalog,[f.model]),[],'Older selectors also fail closed once review loading was attempted');
 assert.equal(Catalog.isPlanAvailable(f.route,catalog,[f.model]),true);
});
test('content signatures ignore object key ordering and retain source array and academic value changes',()=>{
 assert.equal(Catalog.publicationFingerprint({a:1,b:{c:2,d:3}}),Catalog.publicationFingerprint({b:{d:3,c:2},a:1}));
 assert.notEqual(Catalog.publicationFingerprint({credits:3}),Catalog.publicationFingerprint({credits:4}));
 assert.notEqual(Catalog.publicationFingerprint({sources:['a','b']}),Catalog.publicationFingerprint({sources:['b','a']}));
});

test('degree-level aliases preserve publication while a genuine level change requires a new review',()=>{
 const f=fixture(),reviewed=Catalog.attachPublicationIndex(f.catalog,f.index,f.registry);
 assert.equal(Catalog.publishedPlans(reviewed,[{...f.model,level:"Associate's"}]).length,1);
 assert.equal(Catalog.publishedPlans(reviewed,[{...f.model,level:'master'}]).length,0);
 assert.equal(Catalog.publicationModelFingerprint({...f.model,level:"Bachelor's"}),Catalog.publicationModelFingerprint({...f.model,level:'bachelor'}));
});

test('official loaded model snapshots stay immutable while the original input and private work remain editable',async()=>{
 const f=fixture(),original=JSON.stringify(f.model);
 const models=await Catalog.loadModels([f.model.id],{index:f.registry,includeLegacy:false,fetcher:async()=>({ok:true,json:async()=>f.model})});
 const loaded=models[0],before=Catalog.publicationModelFingerprint(loaded,'associate');
 assert(Object.isFrozen(loaded));assert(Object.isFrozen(loaded.requirements[0].options[0]));
 assert.throws(()=>Object.defineProperty(loaded.requirements[0].options[0],'code',{value:'CHANGED'}),TypeError);
 assert.equal(Catalog.publicationModelFingerprint(loaded,'associate'),before);
 assert.equal(JSON.stringify(f.model),original);assert.equal(Object.isFrozen(f.model),false);
 const mutable=Catalog.validateModel(f.model,f.registry.models[0]);mutable.requirements[0].options[0].code='CHANGED';
 assert.notEqual(Catalog.publicationModelFingerprint(mutable,'associate'),before);
});
