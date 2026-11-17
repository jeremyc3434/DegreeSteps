/* Real degree-link acceptance: known marketing links retain their exact format. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Catalog=require('./dist/program-catalog.js'),Planner=require('./dist/planner.js');
const registry=require('./dist/data/curriculum-registry.json'),aliases=require('./dist/data/degree-link-aliases.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
test('the four established curricula remain real, available plans alongside all compiled models',()=>{
 assert.equal(registry.models.filter(entry=>entry.path.startsWith('data/curricula/')).length,41);
 for(const path of Catalog.modelFiles){const model=JSON.parse(fs.readFileSync('dist/'+path)),entry=registry.models.find(entry=>entry.id===model.id),route=catalog.pathways.find(route=>entry?.routeIds.includes(route.id));assert(entry&&route,path);assert.equal(entry.path,path);assert.equal(entry.level,route.level);assert(Catalog.modelReadiness(model).available);assert(Catalog.isPlanAvailable(route,catalog,[model]));}
 assert.equal(Catalog.availablePlans(catalog).length,38);
 const reviewed=registry.models.find(entry=>entry.id==='curriculum-wgu-catalog-ecceaa488637ac83'),model=JSON.parse(fs.readFileSync('dist/'+reviewed.path)).models.find(model=>model.id===reviewed.id),route=catalog.pathways.find(route=>route.modelId===reviewed.id);
 assert.equal(reviewed.readyTemplate,true,'The additional available plan has a reviewed named curriculum');
 assert.equal(reviewed.unresolvedRequiredChoices,0);
 assert.equal(model.totalCredits,110);assert.equal(model.creditSystem,'competency-unit');assert.equal(model.requirements.length,36);
 assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),110);
 assert(Catalog.modelReadiness(model).available);assert(Catalog.isPlanAvailable(route,catalog,[model]));
 const sourceIds=new Set(model.sources.map(source=>source.id));
 for(const row of model.requirements)for(const option of row.options.filter(option=>option.provider!=='University')){
  assert.equal(option.evidence,'published');assert.equal(option.receivingCode,row.code);assert.equal(option.mappingEvidence.receivingCode,row.code);assert.equal(option.mappingEvidence.creditSystem,'competency-unit');
  assert(option.sourceIds.length>0&&option.sourceIds.every(id=>sourceIds.has(id)));
 }
});
test('the reported Liberty marketing URL identifies the residential general degree and its real catalog',()=>{
 const alias=aliases.aliases.find(alias=>alias.url==='https://www.liberty.edu/government/bachelors/criminal-justice/');assert(alias);assert.equal(alias.modality,'campus');assert.equal(alias.modelId,'liberty-criminal-justice-residential');assert.equal(alias.pathwayId,alias.modelId);
 const entry=registry.models.find(entry=>entry.id===alias.modelId),model=JSON.parse(fs.readFileSync('dist/'+entry.path));assert(model.sources.some(source=>source.url===alias.sourceUrl));
 const online=aliases.aliases.find(alias=>alias.url==='https://www.liberty.edu/online/government/bachelors/criminal-justice/');assert.equal(online.modality,'online');assert.equal(online.modelId,'liberty-criminal-justice-online');
 assert(!aliases.aliases.some(alias=>/criminal-justice\/(?:public-administration|homeland-security|juvenile-justice)\//.test(alias.url)),'Specializations must not inherit the general curriculum through a broad URL prefix');
 const plan=Planner.generate(model,{providers:['Sophia','Study.com','StraighterLine','CLEP'],allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
 assert.equal(plan.rows.length,44);assert.equal(plan.totals.required,120);assert.equal(plan.totals.accounted,120);assert.equal(plan.totals.external,74);assert.equal(plan.totals.institutional,46);assert.equal(plan.totals.upper,30);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.setupIssues.length,0);assert(plan.rows.every(row=>row.option&&!row.selectionRequired));
 assert.equal(model.externalMaxCredits,90,'The policy ceiling stays separate from the 74 mapped outside credits');
});
