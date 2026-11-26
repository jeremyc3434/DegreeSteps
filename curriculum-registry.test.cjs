const test=require('node:test'),assert=require('node:assert/strict'),Catalog=require('./dist/program-catalog.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const model=id=>({id,school:'Example University',title:'Business B.S.',totalCredits:3,creditSystem:'semester',institutionMinCredits:0,sources:[{id:'degree',url:'https://example.edu/business/'}],requirements:[{id:'composition',title:'Composition',code:'ENG101',credits:3,category:'general',options:[{id:'university-english',provider:'University',code:'ENG101',title:'Composition',credits:3,evidence:'published',sourceIds:['degree']}]}]});
const index={version:1,checkedOn:'2026-11-09',models:[{id:'business-online',path:'data/curricula/example.json',routeIds:['official-business','old-business'],school:'Example University',status:'reviewed',coverage:'partial',modalities:['online']},{id:'pending-business',path:'data/curricula/pending.json',routeIds:['pending-degree'],school:'Example University',status:'pending-review'}]};
const base={pathways:[{id:'official-business',school:'Example University',title:'Business',modalities:[]},{id:'old-business',school:'Example University',title:'Business old',modalities:['online']},{id:'pending-degree',school:'Example University',title:'Pending',modalities:[]},{id:'another-degree',school:'Example University',title:'Another Business',modalities:[]}]};
function fetcher(files){const calls=[];const fn=async path=>{calls.push(path);return path in files?{ok:true,status:200,json:async()=>clone(files[path])}:{ok:false,status:404};};fn.calls=calls;return fn;}
test('only exact reviewed routes acquire curricula and sourced format metadata',()=>{const before=JSON.stringify(base),c=Catalog.attachRegistry(base,index);assert.equal(JSON.stringify(base),before);assert.equal(c.pathways[0].modelId,'business-online');assert.deepEqual(c.pathways[0].modalities,['online']);assert.equal(c.pathways[1].modelId,'business-online');assert.equal(c.pathways[2].modelId,undefined);assert.equal(c.pathways[3].modelId,undefined);assert.equal(c.curriculumRegistry.modelCount,1);});
test('registry rejects cross-school or conflicting existing curriculum attachment',()=>{assert.throws(()=>Catalog.attachRegistry({...base,pathways:[{...base.pathways[0],school:'Another University'}]},index),/different school/);assert.throws(()=>Catalog.attachRegistry({...base,pathways:[{...base.pathways[0],modelId:'saved-working-model'}]},index),/replace an existing/);});
test('registry paths and duplicate assignments cannot activate arbitrary data',()=>{for(const path of['https://outside.edu/model.json','data/../secrets.json','data//model.json','data/model.json?x=1'])assert.throws(()=>Catalog.validateRegistry({...index,models:[{...index.models[0],path}]}),/invalid/);assert.throws(()=>Catalog.validateRegistry({...index,models:[index.models[0],{...index.models[0],id:'other',routeIds:['official-business']}]}),/more than one/);});
test('targeted lazy loading deduplicates a school pack and preserves payload models',async()=>{const pack={models:[model('business-online'),model('business-campus')]},i={...index,models:[index.models[0],{...index.models[0],id:'business-campus',routeIds:['campus-business']}]},f=fetcher({'data/curriculum-registry.json':i,'data/curricula/example.json':pack});const models=await Catalog.loadModels(['official-business','business-online','campus-business'],{fetcher:f,includeLegacy:false});assert.deepEqual(models.map(m=>m.id),['business-online','business-campus']);assert.equal(f.calls.filter(path=>path==='data/curricula/example.json').length,1);assert.equal(pack.models[0].id,'business-online');});
test('all four established curricula remain available with a missing optional registry',async()=>{const files=Object.fromEntries(Catalog.modelFiles.map(path=>[path,require('./dist/'+path)])),f=fetcher(files),models=await Catalog.loadModels([],{fetcher:f});assert.equal(models.length,4);assert(models.some(m=>m.id==='liberty-criminal-justice-online'));const attached=await Catalog.loadIndex(base,{fetcher:f});assert.equal(attached.curriculumRegistry.available,false);assert.equal(attached.pathways,base.pathways);await assert.rejects(Catalog.loadIndex(base,{fetcher:f,required:true}),/Could not load/);});
test('a curriculum with an incomplete ledger or unsupported evidence never loads',async()=>{const invalid=model('business-online');invalid.totalCredits=120;const f=fetcher({'data/curricula/example.json':invalid});await assert.rejects(Catalog.loadModels(['business-online'],{fetcher:f,index,includeLegacy:false}),/do not add up/);const bad=model('business-online');bad.requirements[0].options[0].sourceIds=['unknown-source'];assert.throws(()=>Catalog.validateModel(bad,index.models[0]),/valid evidence/);assert.throws(()=>Catalog.validateModel(model('different-id'),index.models[0]),/does not match/);});
test('catalog loading attaches reviewed curricula and route loading reuses the registry',async()=>{const f=fetcher({'data/program-catalog.json':{version:1,programs:[],sources:[]},'data/curriculum-registry.json':index,'data/curricula/example.json':model('business-online')});const c=await Catalog.load(base,{fetcher:f});const models=await Catalog.modelsForRoutes(c.pathways,{fetcher:f,includeLegacy:false});assert.equal(c.pathways[0].modelId,'business-online');assert.equal(models.length,1);assert.equal(f.calls.filter(path=>path==='data/curriculum-registry.json').length,1);});

test('registry cannot change established models or accept invalid credit metadata',()=>{
 assert.throws(()=>Catalog.validateRegistry({...index,models:[{...index.models[0],id:'tesu-general-management'}]}),/established/);
 for(const patch of [{routeIds:[]},{routeIds:['official-business','official-business']},{degreeCredits:-3},{creditUnit:'hours'},{modalities:'online'}])assert.throws(()=>Catalog.validateRegistry({...index,models:[{...index.models[0],...patch}]}),/invalid/);
 const route={id:'official-business',school:'Example University',title:'Different degree',level:'bachelor',modalities:['online'],url:'https://example.edu/business/'};
 assert.throws(()=>Catalog.attachRegistry(base,{...index,routes:[route]}),/degree identity/);
});

test('receiving awards keep source credits separate and require explicit valid units and conversion evidence',()=>{
 const m=model('business-online'),option=m.requirements[0].options[0];
 option.sourceCredits=4;option.sourceCreditSystem='semester';assert.equal(Catalog.validateModel(m,index.models[0]).requirements[0].options[0].credits,3);
 for(const patch of [{sourceCredits:NaN},{sourceCreditSystem:'hours'},{creditSystem:'quarter'},{sourceCredits:undefined}]){const broken=clone(m);Object.assign(broken.requirements[0].options[0],patch);assert.throws(()=>Catalog.validateModel(broken,index.models[0]),/valid evidence/);}
 const converted=clone(m);converted.creditConversions=[{from:'semester',to:'competency-unit',ratio:1,sourceIds:['unknown']}];assert.throws(()=>Catalog.validateModel(converted,index.models[0]),/conversion/);
 const mismatch={...index.models[0],degreeCredits:4};assert.throws(()=>Catalog.validateModel(m,mismatch),/does not match/);
 for(const patch of [{sources:[]},{creditSystem:'hours'},{institutionMinCredits:-1},{upperMinCredits:4}])assert.throws(()=>Catalog.validateModel({...m,...patch},index.models[0]));
 const empty=clone(m);empty.requirements[0].options=[];assert.throws(()=>Catalog.validateModel(empty,index.models[0]),/allocations/);
 empty.requirements[0].researchGap=true;assert.equal(Catalog.validateModel(empty,index.models[0]).requirements.length,1);
});

function discovery(programId='official-business',requirementsHash='b'.repeat(64)){
 const id='source-curriculum-'+requirementsHash.slice(0,32),m=model(id),url=m.sources[0].url;
 return {version:1,status:'ready',programId,model:m,route:{id:programId+'-source-'+requirementsHash.slice(0,16),parentId:programId,modelId:id,school:m.school,title:m.title,level:'bachelor',modalities:['online'],url},source:{url,hash:'a'.repeat(64),requirementsHash,algorithm:'sha256',checkedOn:'2026-11-09',reviewStatus:'automated-public-source'}};
}

test('ready imports bind the exact parent, requirement revision, route and university source',()=>{
 const good=discovery();assert.equal(Catalog.validateDiscovery(good).source.requirementsHash,good.source.requirementsHash);
 for(const change of [d=>d.source.hash='_'.repeat(64),d=>d.source.requirementsHash='g'.repeat(64),d=>d.route.id='another-degree',d=>d.route.parentId='another-degree',d=>d.route.modelId='another-model',d=>d.route.school='Another University',d=>d.route.title='Another degree',d=>d.route.url='https://elsewhere.edu/',d=>d.source.checkedOn='2026-02-30',d=>d.model.sources[0].url='https://elsewhere.edu/',d=>d.route.modalities='online']){const bad=clone(good);change(bad);assert.throws(()=>Catalog.validateDiscovery(bad));}
});

test('saved imports round trip with immutable versions, exact parent choices and lazy runtime loading',async()=>{
 const result=discovery(),state={profile:{name:'Test'},sourceCurricula:[]},saved=Catalog.rememberDiscovery(state,result),before=JSON.stringify(base);
 assert.equal(state.sourceCurricula.length,0);assert.equal(saved.sourceCurricula[0].source.algorithm,'sha256');assert.equal(Catalog.sourceModels(saved)[0].id,result.model.id);
 const nextVersion=discovery('official-business','c'.repeat(64)),revised=Catalog.rememberDiscovery(saved,nextVersion);assert.equal(Catalog.sourceModels(revised).length,2);
 const attached=Catalog.attachSourceCurricula(base,revised);assert.equal(JSON.stringify(base),before);assert.deepEqual(attached.pathways[0].planningVariants,[result.route.id,nextVersion.route.id]);
 assert.equal(attached.pathways.find(route=>route.id===result.route.id).planningVariants,undefined);
 const loaded=await Catalog.loadModels([result.model.id],{index:{version:1,models:[]},includeLegacy:false});assert.equal(loaded[0].id,result.model.id);
 assert.equal(Catalog.attachSourceCurricula(base,{sourceCurricula:[discovery('unlisted-degree')]}).pathways.length,base.pathways.length);
 assert.equal(Catalog.sourceModels({sourceCurricula:[...saved.sourceCurricula,...saved.sourceCurricula]}).length,1);
 const oversized={...state,sheet:{notes:{private:'x'.repeat(480000)}}};
 assert.throws(()=>Catalog.rememberDiscovery(oversized,result),/too large for an account copy/);
 assert.equal(oversized.sourceCurricula.length,0,'a size failure must preserve the original workspace');
 const collision={pathways:[...base.pathways,{...result.route,modelId:'established-model'}]};assert.equal(Catalog.attachSourceCurricula(collision,saved).pathways.at(-1).modelId,'established-model');
});

test('discovery validates selection responses and permits retry after a temporary failure',async()=>{
 const good=discovery(),route=base.pathways[0],path='api/curriculum?program=official-business';let calls=0;
 const f=async()=>({ok:true,json:async()=>++calls===1?{status:'needs-audit',programId:route.id,reason:'Try again'}:clone(good)});
 assert.equal((await Catalog.discover(route,{fetcher:f})).status,'needs-audit');assert.equal((await Catalog.discover(route,{fetcher:f})).status,'ready');assert.equal(calls,2);
 await Catalog.discover(route,{fetcher:f});assert.equal(calls,2);await Catalog.discover(route,{fetcher:f,force:true});assert.equal(calls,3);
 const other=fetcher({[path]:{...good,programId:'another-degree'}});assert.equal((await Catalog.discover(route,{fetcher:other})).status,'needs-audit');
 const variants={status:'choose-variant',programId:route.id,source:{url:'https://example.edu/business/'},variants:[{id:'d'.repeat(16),title:'Business online',modalities:['online'],url:'https://example.edu/business/online/'}]},vf=fetcher({[path]:variants});assert.equal((await Catalog.discover(route,{fetcher:vf})).status,'choose-variant');
 const bad=clone(variants);bad.variants[0].url='https://different.edu/';assert.equal((await Catalog.discover(route,{fetcher:fetcher({[path]:bad})})).status,'needs-audit');
 await assert.rejects(Catalog.discover(route,{fetcher:f,variant:'https://evil.test'}),/university-provided/);
});

test('compiled ledgers retain conditional borrowed awards and admit only the exact reviewed TESU placements',()=>{
 const fs=require('node:fs'),{createHash}=require('node:crypto'),registry=require('./dist/data/curriculum-registry.json'),packs=new Map();let borrowed=0,residentialReviewedElectives=0,interdisciplinaryReviewedElectives=0,tesuReviewedPlacements=0;
 const tesuReview=require('./content/pathway-kits/tesu/course-placements-review-2026-11-26.json'),tesuModels=new Map(tesuReview.models.map(model=>[model.modelId,model])),placementKey=(modelId,requirementId,optionId)=>JSON.stringify([modelId,requirementId,optionId]),tesuPlacements=new Map(tesuReview.placements.map(placement=>[placementKey(placement.modelId,placement.requirementId,placement.optionId),placement]));
 assert.equal(tesuReview.id,'tesu-exact-course-placements-2026-11-26');assert.equal(tesuReview.courseEligibilityReviewId,'tesu-exact-course-eligibility-2026-11-26');assert.equal(tesuReview.providerApprovalStatusChanged,false);assert.equal(tesuReview.residencyCreditAwarded,0);assert.equal(tesuPlacements.size,996);assert.deepEqual([...tesuModels.keys()].sort(),['curriculum-tesu-ba-english','curriculum-tesu-ba-liberal-studies','curriculum-tesu-ba-psychology','curriculum-tesu-bsba-accounting','curriculum-tesu-bsba-finance']);
 for(const source of tesuReview.sources){assert.equal(source.kind,'university');const body=fs.readFileSync(source.capture,'utf8'),hash=createHash('sha256').update(body).digest('hex');assert.equal(hash,source.sha256);assert.equal(hash,tesuReview.sourceHashes[source.id]);}
 function reviewedTESUPlacement(m,req,option){
  if(option.coursePlacementReviewId!==tesuReview.id)return false;
  const scope=tesuModels.get(m.id),placement=tesuPlacements.get(placementKey(m.id,req.id,option.id));assert(scope&&placement,m.id+' '+req.id+' needs its exact source-reviewed placement');
  assert.equal(m.school,tesuReview.schoolName);assert.equal(m.format,'Online');assert.equal(m.level,'bachelor');assert.equal(m.totalCredits,120);assert.equal(m.catalog,scope.catalog);assert.equal(option.evidence,'published');assert.equal(option.provider,'Sophia');assert.equal(option.code,placement.providerCourseCode);assert.equal(option.courseVersion,placement.courseVersion);assert.equal(option.receivingCode,placement.receivingCode);assert.equal(option.credits,placement.credits);assert.equal(option.credits,req.credits);assert.equal(option.creditSystem,placement.creditSystem);assert.equal(option.creditSystem,'semester');assert.equal(option.creditOrigin,'alternative');assert.equal(option.upper,placement.receivingUpper);assert.notEqual(req.institutionalOnly,true);
  const eligibility=option.courseEligibilityResolution,map=option.mappingEvidence,degree=option.degreePlacementEvidence;
  assert.equal(eligibility.status,'resolved');assert.equal(eligibility.reviewId,tesuReview.courseEligibilityReviewId);assert.equal(eligibility.targetCatalog,m.catalog);assert.equal(eligibility.providerCourseCode,option.code);assert.equal(eligibility.receivingCode,option.receivingCode);assert.equal(eligibility.courseVersion,option.courseVersion);assert.equal(eligibility.individualApproval,false);assert.equal(eligibility.providerApprovalStatusUnchanged,true);assert.equal(option.sourceCredits,eligibility.sourceCredits);assert.equal(option.sourceCreditSystem,eligibility.sourceCreditSystem);assert(option.sourceCredits>0);assert(option.identitySourceIds.length>0);
  assert.equal(map.claimOrigin,'receiving-institution-submitted');assert.equal(map.schoolName,m.school);assert.equal(map.catalogYear,eligibility.catalogYear);assert.equal(map.providerCourseCode,option.code);assert.equal(map.receivingCode,option.receivingCode);assert.equal(map.credits,option.credits);assert.equal(map.individualApproval,false);assert.notEqual(option.individualApproval,true);
  assert.equal(degree.modelId,m.id);assert.equal(degree.requirementId,req.id);assert.equal(degree.modality,'online');assert.equal(degree.receivingCode,option.receivingCode);assert.equal(degree.credits,placement.credits);assert.equal(degree.creditSystem,'semester');assert(placement.sourceIds.every(id=>degree.sourceIds.includes(id)));assert([...option.sourceIds,...option.identitySourceIds,...degree.sourceIds,...eligibility.sourceIds].every(id=>m.sources.some(source=>source.id===id)));
  if(placement.placementType==='elective'){assert.equal(req.freeElective,true);assert.equal(req.excludeAlreadyUsed,true);assert(scope.freeRequirementIds.includes(req.id));assert.equal(option.placementType,'elective');}
  else if(placement.placementType==='exact-course')assert.equal(req.code,option.receivingCode);
  else if(placement.placementType==='general-category'){assert(scope.scientificRequirementIds.includes(req.id));assert(scope.scientificPermittedReceivingCodes.includes(option.receivingCode));assert.equal(option.allocationType,'general-category');}
  else{assert.equal(placement.placementType,'liberal-arts-area');assert.equal(req.liberalArtsAllocation,true);assert.equal(option.allocationType,'liberal-arts-area');}
  tesuReviewedPlacements++;return true;
 }
 for(const entry of registry.models){if(!packs.has(entry.path))packs.set(entry.path,JSON.parse(fs.readFileSync('./dist/'+entry.path)));const payload=packs.get(entry.path),m=(payload.models||[payload]).find(m=>m.id===entry.id);Catalog.validateModel(m,entry);for(const req of m.requirements)for(const option of req.options){const tesuPlacement=reviewedTESUPlacement(m,req,option);if(option.provider!=='University'&&option.sourceIds.some(id=>/^liberty-.*--/.test(id))){borrowed++;assert.equal(option.evidence,'conditional');assert.match(option.mappingScope,/exact degree/);}if(option.placementType==='elective'&&!tesuPlacement){if(option.sharedAwardProvenance){
       const bundle=require('./content/reuse/liberty-undergraduate-awards.json'),award=bundle.awards.find(a=>a.id===option.sharedAwardProvenance.awardId),course=bundle.providerCourses.find(c=>c.id===option.sharedAwardProvenance.providerCourseId),rule=bundle.placementRules.find(r=>r.id===option.sharedAwardProvenance.placementRuleId);
       assert(award&&course&&rule);assert.equal(option.mappingReviewId,bundle.id);assert.equal(option.receivingMapStatus,'published-shared-reviewed-award');assert.equal(option.evidence,'published');
       assert.equal(award.scope.school,m.school);assert.equal(award.scope.catalog,m.catalogYear||m.catalog);assert.equal(award.scope.modality,'online');assert.equal(m.format,'Online');assert(award.scope.programIds.includes(m.id)&&rule.modelIds.includes(m.id));
       assert.equal(req.freeElective,true);assert.equal(req.category,'electives');assert.equal(rule.kind,'free-elective');assert.equal(req.institutionalOnly===true,false);assert.equal(option.categoryPlacementReviewed,true);assert.equal(option.categoryPlacementReviewId,bundle.id);
       assert.equal(option.code,course.code);assert.equal(option.provider,course.provider);assert.equal(option.credits,award.credits);assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(option.courseVersion,course.courseVersion);
       const placement=option.degreePlacementEvidence;assert.equal(placement.modelId,m.id);assert.equal(placement.requirementId,req.id);assert.equal(placement.placementType,'free-elective');assert.equal(placement.receivingCode,award.receivingCode);assert.equal(placement.credits,req.credits);
       assert([...award.sourceIds,...award.scopeSourceIds,...rule.sourceIds].every(id=>option.sourceIds.includes(id)&&m.sources.some(source=>source.id===id)));
       assert(option.identitySourceIds.every(id=>!award.sourceIds.includes(id)&&m.sources.some(source=>source.id===id)));
      }else if(option.categoryPlacementReviewed===true&&option.mappingReviewId==='liberty-residential-psychology-baseline-2026-11-25'){
       residentialReviewedElectives++;
       const review=require('./content/curricula/snapshots/liberty/liberty-residential-psychology-baseline-2026-11-25.json'),award=review.outsideAwards.find(award=>award.requirementId===req.id);
       assert.equal(m.id,'curriculum-liberty-psychology-bs-residential');assert.equal(m.school,'Liberty University');assert.equal(m.format,'Residential');assert.equal(m.catalogYear,'2026-2027');assert.equal(m.catalog,'2026–2027');
       assert.equal(review.id,option.mappingReviewId);assert.equal(review.modelId,m.id);assert.equal(review.personalAwardsCreated,0);assert.equal(review.onlineReceivingAwardsInherited,false);
       assert.equal(option.categoryPlacementReviewId,review.id);assert.equal(option.receivingMapStatus,'published-residential-award-reviewed-placement');assert.equal(option.evidence,'published');assert.equal(option.mappingResearchClosed,true);
       const expected={'free-electives-1':['SOPH-0022','HIUS 221'],'free-electives-2':['SOPH-0025','HIUS 222'],'free-electives-3':['SOPH-0006','ARTS 201'],'free-electives-4':['SOPH-0029','ARTS 202'],'free-electives-5':['SOPH-0080','HLTH 216']};
       assert.deepEqual([option.code,option.receivingCode],expected[req.id]);assert.equal(req.freeElective,true);assert.equal(req.category,'electives');assert.equal(req.institutionalOnly===true,false);assert.equal(req.excludeAlreadyUsed,true);
       assert(award);assert.equal(award.provider,option.provider);assert.equal(award.code,option.code);assert.equal(award.receivingCode,option.receivingCode);assert.equal(award.receivingCredits,option.credits);assert.equal(award.receivingFormat,'Residential');
       const placement=option.degreePlacementEvidence;
       assert.equal(placement.modelId,m.id);assert.equal(placement.requirementId,req.id);assert.equal(placement.catalogYear,m.catalogYear);assert.equal(placement.modality,'campus');assert.equal(placement.placementType,'free-elective');assert.equal(placement.receivingCode,option.receivingCode);assert.equal(placement.credits,req.credits);assert.equal(placement.creditSystem,'semester');
       assert(placement.sourceIds.length>0&&placement.sourceIds.every(id=>m.sources.some(source=>source.id===id)));
       const provenance=option.residentialPsychologyAwardReview;
       assert.equal(provenance.id,review.id);assert.equal(provenance.individualAwardsCreated,0);assert.equal(provenance.campusAwardRowId,award.campusAwardRowId);
       assert.equal(provenance.originalIdentityReviewPath,'content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json');
       const original=require('./content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json'),course=original.courses.find(course=>course.aceId===option.code);
       assert(course&&course.activeOffering);assert.equal(provenance.originalIdentityCheckedOn,original.checkedOn);assert.equal(option.provider,'Sophia');assert.equal(option.providerCourseCode,course.providerCourseCode);assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(String(option.courseVersion),String(course.aceVersion));assert.equal(option.recommendationStart,course.recommendationStart);assert.equal(option.recommendationEnd,course.recommendationEnd);
       assert(course.identitySourceIds.every(id=>option.identitySourceIds.includes(id)&&m.sources.some(source=>source.id===id)));assert(course.recommendationPeriodSourceIds.every(id=>option.recommendationPeriodSourceIds.includes(id)));
       const guide=m.sources.find(source=>source.id===provenance.currentCampusSourceId);
       assert(guide&&option.sourceIds.includes(guide.id));assert.equal(guide.url,'https://www.liberty.edu/residential/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf');assert.equal(guide.modality,'campus');assert.equal(guide.evidenceType,'official-receiving-school-equivalency');assert.equal(guide.captureSha256,provenance.currentCampusCaptureSha256);assert.equal(guide.guideUpdated,provenance.currentCampusGuideUpdated);assert(!option.identitySourceIds.includes(guide.id));
       assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');assert.equal(m.reviewedBaselineChoices.optionSelections[req.id],option.id);
      }else if(option.categoryPlacementReviewed===true&&m.id==='curriculum-liberty-interdisciplinary-aa-online'&&option.mappingReviewId==='liberty-online-baseline-awards-2026-11-24'){
       interdisciplinaryReviewedElectives++;
       const expected={'interdisciplinary-general-electives-1':['SOPH-0022','HIUS 221'],'interdisciplinary-general-electives-2':['SOPH-0025','HIUS 222'],'interdisciplinary-general-electives-3':['SOPH-0016','ENVR 215'],'interdisciplinary-general-electives-4':['SOPH-0027','PHIL 201'],'interdisciplinary-general-electives-5':['SOPH-0065','PHIL 210']};
       assert.deepEqual([option.code,option.receivingCode],expected[req.id]);assert.equal(m.school,'Liberty University');assert.equal(m.format,'Online');assert.equal(m.catalogYear,'2026-2027');assert.equal(m.catalog,'2026–2027');assert.equal(req.freeElective,true);assert.equal(req.category,'major');assert.equal(req.excludeAlreadyUsed,true);
       assert.equal(option.evidence,'published');assert.equal(option.receivingMapStatus,'published-online-receiving-award');assert.equal(option.evidenceType,'official-receiving-school-equivalency');assert.equal(option.mappingResearchClosed,true);
       const original=require('./content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json'),course=original.courses.find(course=>course.aceId===option.code);
       assert(course&&course.activeOffering);assert.equal(option.provider,'Sophia');assert.equal(option.providerCourseCode,course.providerCourseCode);assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(String(option.courseVersion),String(course.aceVersion));assert.equal(option.recommendationStart,course.recommendationStart);assert.equal(option.recommendationEnd,course.recommendationEnd);
       assert.equal(option.baselineAwardReview.reviewId,original.id);assert.equal(option.baselineAwardReview.sourceIdentityOnly,true);assert.equal(option.baselineAwardReview.studentCreditsAwarded,0);assert.equal(option.baselineAwardReview.receivingAwardId,'liberty-online-'+option.code.toLowerCase()+'-'+option.receivingCode.toLowerCase().replace(' ','-'));
       assert(course.identitySourceIds.every(id=>option.identitySourceIds.includes(id)&&m.sources.some(source=>source.id===id)));assert(course.recommendationPeriodSourceIds.every(id=>option.recommendationPeriodSourceIds.includes(id)));
       const placement=option.degreePlacementEvidence;
       assert.equal(placement.modelId,m.id);assert.equal(placement.requirementId,req.id);assert.equal(placement.catalogYear,m.catalogYear);assert.equal(placement.modality,'online');assert.equal(placement.placementType,'free-elective');assert.equal(placement.receivingCode,option.receivingCode);assert.equal(placement.credits,req.credits);assert.equal(placement.creditSystem,'semester');assert.equal(option.credits,3);
       assert(placement.sourceIds.includes('liberty-interdisciplinary-aa-retained-univ-baseline-2026-11-25-catalog'));assert(placement.sourceIds.every(id=>m.sources.some(source=>source.id===id)));
       const guide=m.sources.find(source=>source.id==='liberty-online-sophia-guide-full-2026-11-18');
       assert(guide&&option.sourceIds.includes(guide.id));assert.equal(guide.url,'https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf');assert.equal(guide.modality,'online');assert.equal(guide.sha256,'c4eaeb58cc874354573a0c7fe5047c4138216e197fec270218a84326c36d3031');assert(!option.identitySourceIds.includes(guide.id));
       assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');assert.equal(m.reviewedBaselineChoices.optionSelections[req.id],option.id);
      }else if(option.categoryPlacementReviewed===true){assert.equal(option.evidence,'published');assert.equal(option.receivingMapStatus,'published-institutional-category');assert.equal(option.mappingEvidence?.publisher,m.school);assert.equal(option.degreePlacementEvidence?.modelId,m.id);assert.equal(option.degreePlacementEvidence?.requirementId,req.id);assert.equal(option.degreePlacementEvidence?.actualAllocatedCredits,option.credits);assert(option.mappingEvidence?.sourceIds?.length&&option.degreePlacementEvidence?.sourceIds?.length);}else if(option.evidence==='published'&&option.receivingMapStatus==='published-online-receiving-award'){
       if(option.mappingReviewId==='liberty-online-baseline-awards-2026-11-24'){
        assert.equal(m.id,'curriculum-liberty-history-bs-online');
        const expected={'free-electives-11':'SOPH-0011','free-electives-12':'SOPH-0012','free-electives-13':'SOPH-0005','free-electives-14':'SOPH-0030'};
        assert.equal(option.code,expected[req.id]);
        const review=require('./content/catalog/liberty-extra-sophia-identities-reviewed-2026-11-24.json'),course=review.courses.find(course=>course.code===option.code&&course.receivingCode===option.receivingCode);
        assert(course&&course.activeOffering===true);assert.equal(option.provider,course.provider);assert.equal(option.providerCourseCode,course.providerCourseCode);
        assert.equal(option.sourceCredits,course.sourceCredits);assert.equal(option.sourceCreditSystem,course.sourceCreditSystem);assert.equal(String(option.courseVersion),String(course.aceVersion));
        assert.equal(option.recommendationStart,course.recommendationStart);assert.equal(option.recommendationEnd,course.recommendationEnd);
        assert.equal(option.credits,course.credits);assert.equal(option.creditSystem,course.receivingCreditSystem);
        assert.equal(option.baselineAwardReview.reviewId,review.id);assert.equal(option.baselineAwardReview.receivingAwardId,course.receivingAwardId);assert.equal(option.baselineAwardReview.studentCreditsAwarded,0);
        assert.equal(option.sourceCreditEvidence.status,'reviewed');assert.equal(option.eligibilityReview.eligibleToStart,true);assert.equal(option.eligibilityReview.recommendationPeriodStatus,'reviewed-current-window');
        assert([...course.identitySourceIds,...course.activeOfferingSourceIds].every(id=>option.identitySourceIds.includes(id)&&m.sources.some(source=>source.id===id)));
        assert(course.recommendationPeriodSourceIds.every(id=>option.recommendationPeriodSourceIds.includes(id)));
        assert.equal(m.reviewedBaselineChoices.optionSelections[req.id],option.id);
       }else{
        assert(['curriculum-liberty-healthcare-administration-bs-online','curriculum-liberty-psychology-bs-online'].includes(m.id));
        assert.equal(option.mappingReviewId,'liberty-online-full-guide-awards-2026-11-18');
       }
       assert.equal(m.school,'Liberty University');assert.equal(m.format,'Online');assert.equal(m.catalogYear,'2026-2027');
       assert.match(req.id,/^free-electives-\d+$/);assert.equal(req.category,'electives');
       assert.equal(option.evidence,'published');assert.equal(option.evidenceType,'official-receiving-school-equivalency');assert.equal(option.mappingResearchClosed,true);
       assert.equal(option.sourceCreditStatus,'verified-current-provider-and-ace');assert.equal(option.eligibilityReview?.status,'current-provider-version-reviewed');
       const placement=option.degreePlacementEvidence;
       assert.equal(placement.modelId,m.id);assert.equal(placement.requirementId,req.id);assert.equal(placement.catalogYear,m.catalogYear);assert.equal(placement.modality,'online');
       assert.equal(placement.receivingCode,option.receivingCode);assert.equal(placement.credits,option.credits);assert.equal(placement.creditSystem,'semester');assert.equal(placement.placementType,'free-elective');
       assert(placement.sourceIds.length>0&&placement.sourceIds.every(id=>option.sourceIds.includes(id)&&m.sources.some(source=>source.id===id)));
       const guide=m.sources.find(source=>source.id==='liberty-online-sophia-guide-full-2026-11-18');
       assert(option.sourceIds.includes(guide.id));assert.equal(guide.evidenceType,'official-receiving-school-equivalency');assert.equal(guide.modality,'online');
       assert.equal(guide.url,'https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf');
       assert.equal(guide.sha256,'c4eaeb58cc874354573a0c7fe5047c4138216e197fec270218a84326c36d3031');
      }else assert.equal(option.evidence,'conditional');}}}
 assert(borrowed>0);assert.equal(tesuReviewedPlacements,996);assert.equal(residentialReviewedElectives,5);assert.equal(interdisciplinaryReviewedElectives,5);const library=require('./dist/data/curriculum-course-index.json');for(const row of library.courses){assert(!row.credits||['semester','quarter','competency-unit'].includes(row.creditSystem));assert.notEqual(row.recommendationStatus,'approved');}
});
