/* The generated registry must preserve the reviewed award's actual scope. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Planner=require('./dist/planner.js'),View=require('./dist/course-plan-view.js');
const registry=require('./dist/data/curriculum-registry.json'),awards=require('./content/transfer-awards/liberty-named-awards-2026-11.json');
const byId=new Map(awards.awards.map(award=>[award.id,award])),packs=new Map();
const modelFor=entry=>{if(!packs.has(entry.path))packs.set(entry.path,JSON.parse(fs.readFileSync('./dist/'+entry.path)));const payload=packs.get(entry.path);return(payload.models||[payload]).find(model=>model.id===entry.id);};
test('compiled named awards keep undergraduate, delivery, quantity and source boundaries',()=>{
 let seen=0;
 for(const entry of registry.models){const model=modelFor(entry),mode=model.format==='Online'?'online':model.format==='Residential'?'campus':null;
  for(const req of model.requirements)for(const option of req.options){const award=byId.get(option.id);if(!award)continue;seen++;
   assert.equal(model.school,awards.school);assert(award.degreeLevels.includes(model.level));assert(award.modalities.includes(mode));assert.equal(req.institutionalOnly===true,false);assert.equal(option.evidence,'conditional');assert.equal(option.credits,req.credits);assert.equal(option.creditSystem,model.creditSystem);assert.equal(option.receivingCode,award.receivingCode);
   assert.equal(option.sourceCreditStatus,'unknown');assert.equal(option.sourceCredits,undefined,'A receiving guide cannot establish independent provider credits');assert.equal(option.sourceCreditSystem,undefined);assert.match(option.sourceCreditBasis,/unknown|not-established|receiving|independent/i);
   const ids=new Set(model.sources.map(source=>source.id));for(const id of option.sourceIds)assert(ids.has(id));
   const primary=awards.sources.find(source=>source.provider===option.provider&&source.modality===mode);assert.equal(option.url,primary.url);assert.equal(option.sourcePage,award.sourcePages[primary.id]);
   if(option.placementType!=='elective')assert([req.code,...(req.allowedCourseCodes||[])].includes(option.receivingCode));
   if(req.upperOnly)assert.equal(option.upper,true);
  }
 }
 assert(seen>0,'New researched awards must reach actual degree requirements');
});
test('an online-only Sophia education award never appears in a residential or graduate model',()=>{
 const award=awards.awards.find(item=>item.code==='SOPH-0098');assert(award);assert.deepEqual(award.modalities,['online']);
 let online=0;
 for(const entry of registry.models){const model=modelFor(entry),matches=model.requirements.flatMap(req=>req.options).filter(option=>option.id===award.id);if(model.format==='Residential'||['master','doctorate','specialist'].includes(model.level))assert.equal(matches.length,0,model.id);if(model.format==='Online')online+=matches.length;}
 assert(online>0,'A scoped new award remains useful where it is applicable');
});
test('each expanded plan accounts for its sourced degree without placeholder research credits',()=>{
 const ids=['curriculum-liberty-healthcare-administration-bs-online','curriculum-liberty-psychology-bs-residential'];
 for(const id of ids){const entry=registry.models.find(item=>item.id===id);assert(entry,id);const model=modelFor(entry);assert.equal(entry.coverage,'complete');assert.equal(model.totalCredits,120);assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);assert(!model.requirements.some(row=>row.researchGap));assert.equal(model.completeExecutablePathway,false);assert(model.requirements.some(row=>row.options.some(option=>option.provider!=='University')));
  const plan=Planner.generate(model,{providers:['Sophia','Study.com','StraighterLine','CLEP'],allowConditional:true,priority:'transfer'}),view=View.build({program:model,plan,state:{learning:[]}});assert.equal(plan.validation.academicCountsValid,true);assert.deepEqual(view.curriculumIssues,[]);assert.equal(view.sections.reduce((sum,section)=>sum+section.credits,0),120);
  const sources=new Map(model.sources.map(source=>[source.id,source]));
  for(const item of model.graduationRequirements){
   assert([item.description,item.detail].some(value=>typeof value==='string'&&value.trim().length>0),id+' '+item.id+' keeps a readable graduation condition');
   assert(item.sourceIds.length>0&&item.sourceIds.every(sourceId=>/^https:\/\/catalog\.liberty\.edu\/undergraduate\//.test(sources.get(sourceId)?.url)),id+' '+item.id+' is bound to the official degree catalog');
  }
  const gradeRule=model.graduationRequirements.find(item=>item.id==='major-minimum-grade');assert(gradeRule);assert.match(gradeRule.detail||gradeRule.description,/at least C in upper-level courses in the major/i);
  const upperMajor=model.requirements.filter(row=>row.category==='major'&&row.upper);assert(upperMajor.length>0);assert(upperMajor.every(row=>row.minimumGrade==='C'),'The readable grade condition must also be enforced on actual upper-major requirements');
  assert.equal(plan.totals.confirmed,0,'A source-reviewed proposed ledger is not an individual school award');
 }
});
test('new routes consider their reviewed sources by default and preserve the student’s provider choices',()=>{
 const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
 for(const id of ['curriculum-liberty-healthcare-administration-bs-online','curriculum-liberty-psychology-bs-residential']){
  const model=modelFor(registry.models.find(entry=>entry.id===id)),route=catalog.pathways.find(route=>route.modelId===id);
  const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);state.profile.modality=route.modalities[0];state.profile.proctoringPreference='open';
  const fresh=Journey.buildDraft(state,catalog,[model]);assert.deepEqual(fresh.input.providers,model.defaultProviders);assert(fresh.input.providers.includes('StraighterLine'));
  state.scenarios[id]={providers:['Sophia']};const before=JSON.stringify(state),narrow=Journey.buildDraft(state,catalog,[model]);assert.deepEqual(narrow.input.providers,['Sophia']);assert.equal(JSON.stringify(state),before);assert.deepEqual(narrow.state.scenarios[id].providers,['Sophia']);
  const prepared=narrow.state.scenarios[id],mapped=[...new Set(model.requirements.flatMap(req=>req.options.map(option=>option.provider)))].filter(provider=>provider!=='University');assert.deepEqual(prepared.mappedProvidersReviewed,mapped);
  // The worksheet's settings adapter must see that all current sources were
  // reviewed, rather than treating StraighterLine as a newly enabled source.
  const settings=Sheet.scenario(narrow.state,id),added=mapped.filter(provider=>!settings.mappedProvidersReviewed.includes(provider));assert.deepEqual(added,[]);
  state.scenarios[id]={providers:[],mappedProvidersReviewed:['Sophia']};assert.deepEqual(Journey.buildDraft(state,catalog,[model]).input.providers,[]);
  delete state.scenarios[id];state.profile.proctoringPreference='avoid';assert(!Journey.buildDraft(state,catalog,[model]).input.providers.includes('CLEP'));
 }
});
