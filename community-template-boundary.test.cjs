const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Catalog=require('./dist/program-catalog.js'),Templates=require('./dist/community-template-catalog.js'),School=require('./dist/school.js');
const registry=require('./dist/data/curriculum-registry.json'),base=require('./dist/data/pathways.json'),directory=require('./dist/data/program-catalog.json');
const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(base,directory),registry),require('./dist/data/publication-index.json'),registry),clone=value=>JSON.parse(JSON.stringify(value));
const packs=new Map(),modelFor=id=>{const entry=registry.models.find(row=>row.id===id);if(!packs.has(entry.path))packs.set(entry.path,JSON.parse(fs.readFileSync('./dist/'+entry.path)));const pack=packs.get(entry.path);return(pack.models||[pack]).find(model=>model.id===id);};
test('the community starter library exposes complete program plans, not partial legacy guides',()=>{
 const items=Templates.fromCatalog(catalog,Catalog);assert(items.length>0);assert.equal(items.length,Catalog.publishedPlans(catalog).length);
 for(const item of items){assert.equal(item.ready,true);assert.equal(item.coverage,'complete');assert(Catalog.modelReadiness(modelFor(item.modelId)).available);assert.equal(item.summary.includes('still needed'),false);}
 const excluded=new Set(base.pathways.filter(row=>row.modelId&&!registry.models.some(entry=>entry.id===row.modelId&&entry.readyTemplate===true)).map(row=>row.modelId));assert(items.every(item=>!excluded.has(item.modelId)),'Incomplete legacy seed models must not reappear as complete templates');
 const quality=require('./dist/data/pathway-quality-report.json');assert.deepEqual(new Set(items.map(item=>item.modelId)),new Set(quality.programs.filter(item=>item.publication.ready).map(item=>item.modelId)));
 const unpublished=new Set(quality.programs.filter(item=>!item.publication.ready).map(item=>item.modelId));assert(items.every(item=>!unpublished.has(item.modelId)),'Research drafts cannot be presented as ready community starter plans');
 assert.equal(new Set(items.map(item=>item.id)).size,items.length);
});
test('opening a template validates its exact model before displaying the requirement ledger',()=>{
 const item=Templates.fromCatalog(catalog,Catalog)[0],model=modelFor(item.modelId),before=JSON.stringify([item,model]);
 const result=Templates.attachModel(item,model,Catalog);assert.equal(result.courseLedger.reduce((n,row)=>n+row.credits,0),model.totalCredits);assert.equal(JSON.stringify([item,model]),before);
 assert.throws(()=>Templates.attachModel(item,{...model,id:'another-degree'},Catalog),/not available/);
 const gap=clone(model);gap.requirements[0].researchGap=true;assert.throws(()=>Templates.attachModel(item,gap,Catalog),/not available/);
 const unbalanced=clone(model);unbalanced.requirements.pop();assert.throws(()=>Templates.attachModel(item,unbalanced,Catalog),/not available/);
});
test('a launch link identifies one exact ready degree without carrying private course records',()=>{
 const route=Catalog.publishedPlans(catalog)[0],url=new URL(Templates.launchURL(route),'https://degreepath.test');
 assert.equal(url.pathname,'/portal.html');assert.equal(url.searchParams.get('school'),route.school);assert.equal(url.searchParams.get('program'),route.id);assert.equal(url.searchParams.get('level'),route.level);assert([...url.searchParams.keys()].every(key=>['school','program','level','format'].includes(key)));
});
test('school insight matching is exact and its available courses share the same readiness gate',()=>{
 const data={schools:[{id:'liberty',name:'Liberty University',shortName:'Liberty'}]};assert.equal(School.matchProfile(data,'LIBERTY').id,'liberty');assert.equal(School.matchProfile(data,''),null);assert.equal(School.matchProfile(data,'Other University'),null);
 const routes=School.schoolRoutes(catalog,Catalog,'Liberty University');assert(routes.length>0);assert(routes.every(route=>route.school==='Liberty University'&&Catalog.isPlanAvailable(route,catalog)));
 assert.equal(School.schoolRoutes(catalog,Catalog,'Unknown University').length,0);
});
test('school citations preserve source numbering and reject executable or credentialed links',()=>{
 const html=School.sourceHTML({sources:[{id:'bad',title:'Bad',url:'javascript:alert(1)'},{id:'good',title:'<script>unsafe</script>',url:'https://college.edu/policy',kind:'official',checkedOn:'2026-11-16'}]});
 assert(!html.includes('javascript:'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('id="school-source-1"'));assert.equal(School.safe('https://user:password@college.edu/'), '');assert.equal(School.safe('http://college.edu/'),'');
});

test('withdrawing college permission sends the required empty JSON mutation and CSRF header',async t=>{
 const previous=global.fetch;let seen;t.after(()=>global.fetch=previous);
 global.fetch=async(path,options)=>{seen={path,options};return new Response(JSON.stringify({withdrawn:true}),{status:200,headers:{'Content-Type':'application/json'}});};
 await School.withdrawInterest('interest-123');assert.equal(seen.path,'/api/colleges/interest/interest-123');assert.equal(seen.options.method,'DELETE');assert.equal(seen.options.body,'{}');assert.equal(seen.options.headers['X-Portal-Request'],'1');assert.equal(seen.options.credentials,'same-origin');
});
test('one school has one community filter identity across all of its degree routes',()=>{
 const items=Templates.fromCatalog(catalog,Catalog),schools=new Map();for(const item of items){const key=item.schoolName.toLowerCase().replace(/[^a-z0-9]/g,'');if(!schools.has(key))schools.set(key,new Set());schools.get(key).add(item.schoolId);}assert([...schools.values()].every(ids=>ids.size===1));assert.equal(Templates.canonicalSchoolId('Western Governors University','western-governors-university'),'wgu');
});
test('students retain withdrawal controls when a college loses its verified status',()=>{
 const own={id:'interest',organizationId:'college',organizationName:'Liberty University',withdrawnAt:null,active:true};
 let context=School.contactContext({organizations:[],interests:[own]},'Liberty University');assert.equal(context.organization,null);assert.equal(context.interest.id,'interest');
 context=School.contactContext({organizations:[{id:'college',name:'Liberty University',status:'revoked'}],interests:[own]},'Liberty University');assert.equal(context.organization,null);assert.equal(context.interest.id,'interest');
 context=School.contactContext({organizations:[],interests:[{...own,withdrawnAt:123,active:false}]},'Liberty University');assert.equal(context.interest,null);
 context=School.contactContext({organizations:[{id:'college',name:'Other University',status:'verified'}],interests:[own]},'Other University');assert.equal(context.organization.id,'college');assert.equal(context.interest.id,'interest');
});

test('only approved complete community artifacts enter the template library',()=>{
 const artifact={schoolName:'Example University',programName:'Example degree',modality:'online',totalCredits:3,creditSystem:'semester',unresolved:[],sources:[{id:'official',url:'https://example.edu/program',title:'Official curriculum'}],requirements:[{id:'one',title:'A named requirement',credits:3,sourceIds:['official'],options:[{id:'official-one',provider:'University',title:'A named course',code:'EX101',credits:3,sourceIds:['official'],evidence:'published'}]}]};
 const item={id:'approved-123',status:'ready',schoolName:artifact.schoolName,programName:artifact.programName,modality:'online',checkedAt:'2026-11-16',artifact};
 let results=Templates.fromReviewed([item],Catalog);assert.equal(results.length,1);assert.equal(results[0].launchURL,'request-plan.html?template=approved-123');assert.equal(results[0].reviewedOn,'2026-11-16');
 assert.equal(Templates.fromReviewed([{...item,status:'draft'}],Catalog).length,0);const gap=clone(item);gap.artifact.requirements[0].researchGap=true;assert.equal(Templates.fromReviewed([gap],Catalog).length,0);
 const unresolved=clone(item);unresolved.artifact.unresolved=['Confirm total'];assert.equal(Templates.fromReviewed([unresolved],Catalog).length,0);assert.equal(Templates.fromReviewed([{...item,modality:'campus'}],Catalog).length,0);
});
function manifest(overrides={}){return{id:'published-123',status:'ready',readyTemplate:true,schoolName:'Example University',programName:'Example degree',level:'bachelor',modality:'online',catalogYear:'2026-2027',revision:2,checkedAt:Date.UTC(2026,10,16),artifactSummary:{totalCredits:120,creditSystem:'semester',institutionMinCredits:30,requirementCount:40,openCourseChoices:0},...overrides};}
test('a lightweight published manifest can be listed without downloading the course artifact',()=>{
 const original=manifest(),before=JSON.stringify(original),items=Templates.fromManifest([original],Catalog,catalog);assert.equal(items.length,1);const item=items[0];assert.equal(item.manifest,true);assert.equal(item.apiTemplateId,original.id);assert.equal(item.creditFacts.totalCredits,120);assert.equal(item.reviewedOn,'2026-11-16');assert.equal(item.launchURL,'request-plan.html?template=published-123');assert.deepEqual(item.courseLedger,[]);assert.equal(item.template,undefined);assert.equal(item.artifact,undefined);assert.equal(JSON.stringify(original),before);
 for(const mutate of [item=>item.status='draft',item=>item.readyTemplate=false,item=>item.level='unknown',item=>item.modality='unknown',item=>item.revision=0,item=>item.checkedAt=Number.MAX_SAFE_INTEGER,item=>item.artifactSummary.totalCredits=null,item=>item.artifactSummary.creditSystem='unknown',item=>item.artifactSummary.institutionMinCredits=121,item=>item.artifactSummary.requirementCount=181,item=>item.artifactSummary.openCourseChoices=41,item=>item.artifact={requirements:[]}]){const bad=manifest();mutate(bad);assert.equal(Templates.fromManifest([bad],Catalog,catalog).length,0);}
});
test('manifest pagination is bounded and preserves its opaque next cursor',()=>{
 const page=Templates.readPage({items:[manifest()],nextCursor:'opaque_cursor-2'},Catalog,catalog);assert.equal(page.templates.length,1);assert.equal(page.nextCursor,'opaque_cursor-2');assert.equal(Templates.readPage({items:[],nextCursor:null},Catalog,catalog).nextCursor,null);
 assert.throws(()=>Templates.readPage({items:Array.from({length:25},()=>manifest()),nextCursor:null},Catalog,catalog),/could not be read/);assert.throws(()=>Templates.readPage({items:[manifest()],nextCursor:'x'.repeat(201)},Catalog,catalog),/could not be read/);assert.throws(()=>Templates.readPage({items:[manifest({readyTemplate:false})],nextCursor:null},Catalog,catalog),/incomplete summary/);
});

test('international schools retain distinct exact template and college-contact identities',()=>{
 const tokyo='東京大学',kyoto='京都大学',ids=[Templates.canonicalSchoolId(tokyo),Templates.canonicalSchoolId(kyoto),Templates.canonicalSchoolId(tokyo+' A'),Templates.canonicalSchoolId(kyoto+' A')];
 assert.equal(new Set(ids).size,4);assert(ids.every(id=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id)));assert.equal(Templates.canonicalSchoolId(tokyo),ids[0]);assert.equal(Templates.canonicalSchoolId('Ｅｘａｍｐｌｅ University'),Templates.canonicalSchoolId('Example University'));assert.equal(Templates.canonicalSchoolId('Western Governors University'),'wgu');
 const data={schools:[{id:ids[0],name:tokyo},{id:ids[1],name:kyoto}]};assert.equal(School.matchProfile(data,tokyo).id,ids[0]);assert.equal(School.matchProfile(data,kyoto).id,ids[1]);
 const fakeCatalog={publishedPlans:()=>[{id:'tokyo-degree',school:tokyo},{id:'kyoto-degree',school:kyoto}]};assert.deepEqual(School.schoolRoutes({},fakeCatalog,tokyo).map(row=>row.id),['tokyo-degree']);
 const contact=School.contactContext({organizations:[{id:'kyoto',name:kyoto,status:'verified'}],interests:[]},tokyo);assert.equal(contact.organization,null);
 const artifact={schoolName:kyoto,programName:'B.S. Mathematics',modality:'online',totalCredits:3,creditSystem:'semester',unresolved:[],sources:[{id:'official',url:'https://example.edu/program'}],requirements:[{id:'one',title:'Mathematics',code:'MATH101',credits:3,sourceIds:['official'],options:[{id:'uni',provider:'University',code:'MATH101',title:'Mathematics',credits:3,sourceIds:['official'],evidence:'published'}]}]};
 const item={id:'international-reviewed',status:'ready',schoolName:tokyo,programName:artifact.programName,modality:'online',artifact};assert.equal(Templates.fromReviewed([item],Catalog).length,0,'A different non-Latin school cannot reuse the artifact');
 item.schoolName=kyoto;assert.equal(Templates.fromReviewed([item],Catalog).length,1);
});
