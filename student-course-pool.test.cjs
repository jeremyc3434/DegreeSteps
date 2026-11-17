const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createRequire}=require('node:module');
const projectRequire=createRequire(path.join(__dirname,'package.json'));
const Catalog=projectRequire('./dist/program-catalog.js'),Journey=projectRequire('./dist/journey-engine.js'),Library=projectRequire('./dist/course-library-engine.js'),Guide=projectRequire('./dist/guide-engine.js'),Comparison=projectRequire('./dist/plan-comparison-engine.js');
const catalog=Catalog.attachRegistry(Catalog.merge(projectRequire('./dist/data/pathways.json'),projectRequire('./dist/data/program-catalog.json')),projectRequire('./dist/data/curriculum-registry.json'));
const model=projectRequire('./dist/data/curricula/liberty.json').models.find(model=>model.id==='curriculum-liberty-psychology-bs-online');
const route=catalog.pathways.find(route=>route.modelId===model.id);
const listed=projectRequire('./dist/data/curriculum-course-index.json').courses.find(course=>course.provider==='CLEP'&&course.code==='CLEP-0020');
const pool=projectRequire('./dist/data/course-catalog.json').courses;
test.beforeEach(context=>context.mock.timers.enable({apis:['Date'],now:new Date('2026-11-17T12:00:00Z')}));
function stateFor(status='saved'){
  const state=Journey.selectRoute(Library.saveCourse(Library.initialize(null),listed),route,catalog);
  state.learning[0].status=status;
  state.scenarios[model.id]={providers:['CLEP'],allowConditional:false};
  return state;
}

test('real source-listed future exam with unknown original amount projects only its published receiving award',()=>{
  const state=stateFor(),before=JSON.stringify(state),view=Comparison.build(state,catalog,[model],{entries:[]},{selectedIds:['current']});
  const match=Guide.matchCollection(model,state.learning);
  assert.equal(match.placements.length,1);
  assert.equal(match.placements[0].requirementId,'psyc-101');
  assert.equal(match.placements[0].credits,3);
  const scenario=view.scenarios[0],cell=view.matrix.find(row=>row.course.recordIds.includes(state.learning[0].id)).cells.current;
  assert.equal(scenario.summary.potentialCollectionCredits,3);
  assert.equal(scenario.summary.applicableCompletedCredits,0);
  assert.equal(scenario.summary.confirmedCredits,0);
  assert.equal(cell.status,'potential');
  assert.equal(cell.credits,3);
  assert.equal(state.learning[0].credits,null);
  assert.equal(state.learning[0].creditSystem,null);
  assert.equal(JSON.stringify(state),before);
});

test('the same missing-quantity source record remains unsupported when taking or completed',()=>{
  for(const status of ['earned','in-progress']){
    const state=stateFor(status),draft=Journey.buildDraft(state,catalog,[model]);
    assert.equal(draft.match.completed.length,0);
    assert.equal(draft.collectionMatch.placements.length,0);
    assert.equal(state.learning[0].credits,null);
    assert.equal(state.learning[0].creditSystem,null);
  }
});

test('future projection does not match a title, another provider, or a conditional receiving map',()=>{
  for(const change of [{code:''},{provider:'Unrelated college'}]){
    const state=stateFor();Object.assign(state.learning[0],change);
    assert.equal(Guide.matchCollection(model,state.learning).placements.length,0);
  }
  const altered=JSON.parse(JSON.stringify(model)),option=altered.requirements.find(req=>req.id==='psyc-101').options.find(option=>option.provider==='CLEP'&&option.code==='CLEP-0020');
  option.evidence='conditional';
  assert.equal(Guide.matchCollection(altered,stateFor().learning).placements.length,0);
});

test('real saved primary-catalog Sophia courses carry their curated canonical identity into degree matching',()=>{
  let state=Library.initialize(null);
  for(const code of ['SOPH-0015','SOPH-0030']){
    const course=pool.find(course=>course.provider==='Sophia'&&[course.code,course.mappingCode,...(course.codeAliases||[])].includes(code));
    assert(course);
    state=Library.saveCourse(state,course);
  }
  state=Journey.selectRoute(state,route,catalog);
  const before=JSON.stringify(state),match=Guide.matchCollection(model,state.learning);
  assert.equal(match.placements.reduce((sum,placement)=>sum+placement.credits,0),6);
  const view=Comparison.build(state,catalog,[model],{entries:[]},{selectedIds:['current']});
  assert.equal(view.scenarios[0].summary.collectionFitCredits,6);
  assert.equal(view.scenarios[0].summary.applicableCompletedCredits,0);
  assert.equal(JSON.stringify(state),before);
});

test('older saved catalog aliases remain usable and duplicate representations count once',()=>{
  const listed=pool.find(course=>course.provider==='Sophia'&&(course.codeAliases||[]).includes('SOPH-0015'));
  const saved=Library.saveCourse(Library.initialize(null),listed).learning[0];
  assert.equal(saved.code,'SOPH-0015');
  const old={...saved,id:'old-catalog-copy',code:saved.sourceListingCode,codeAliases:['SOPH-0015']};
  const snapshot=JSON.stringify(old),match=Guide.matchCollection(model,[old,saved]);
  assert.equal(match.placements.reduce((sum,placement)=>sum+placement.credits,0),3);
  assert.equal(match.matchedIds.length,2);
  assert.equal(JSON.stringify(old),snapshot);
  const manual={...old,id:'manual-alias',catalogCourseId:undefined,codeBasis:undefined};
  assert.equal(Guide.matchCollection(model,[manual]).placements.length,0,'a hand-entered title and alias list do not become reviewed identity');
});

test('future receiving projection does not bypass known source conflicts or university-only requirements',()=>{
  const altered=JSON.parse(JSON.stringify(model)),req=altered.requirements.find(req=>req.id==='psyc-101'),option=req.options.find(option=>option.provider==='CLEP'&&option.code==='CLEP-0020');
  const state=stateFor();
  Object.assign(state.learning[0],{credits:6,creditSystem:'semester'});
  Object.assign(option,{sourceCredits:3,sourceCreditSystem:'semester'});
  assert.equal(Guide.matchCollection(altered,state.learning).placements.length,0);
  state.learning[0].credits=null;state.learning[0].creditSystem=null;
  req.institutionalOnly=true;
  assert.equal(Guide.matchCollection(altered,state.learning).placements.length,0);
});

test('a projected WGU receiving award keeps CU separate from unknown original source credits',()=>{
  const wgu=projectRequire('./dist/data/curricula/wgu.json').models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');
  const route=catalog.pathways.find(route=>route.modelId===wgu.id),course=projectRequire('./dist/data/curriculum-course-index.json').courses.find(course=>course.provider==='Sophia'&&course.code==='SOPH-0032');
  let state=Journey.selectRoute(Library.saveCourse(Library.initialize(null),{...course,credits:null,creditSystem:null}),route,catalog);
  const before=JSON.stringify(state),view=Comparison.build(state,catalog,[wgu],{entries:[]},{selectedIds:['current'],fromCourses:true});
  assert.equal(view.scenarios[0].summary.potentialCollectionCredits,2);
  assert.equal(view.scenarios[0].summary.applicableCompletedCredits,0);
  assert.equal(view.matrix[0].cells.current.credits,2);
  assert.equal(view.matrix[0].cells.current.creditSystem,'competency-unit');
  assert.equal(state.learning[0].credits,null);
  assert.equal(state.learning[0].creditSystem,null);
  assert.equal(JSON.stringify(state),before);
  state.scenarios[wgu.id]={providers:['Study.com'],allowConditional:false};
  const disabled=Journey.buildDraft(state,catalog,[wgu]);
  assert.equal(disabled.collectionMatch.placements.length,0,'a published identity does not override disabled source preferences');
});

test('an exact source-bound listing ID recovers legacy blank identity without rewriting the saved record',()=>{
  const review=projectRequire('./content/catalog/clep-exact-listing-identities-reviewed-2026-11-17.json'),bridge=review.bridges.find(bridge=>bridge.canonicalCode==='CLEP-0020');
  const reviewed=JSON.parse(JSON.stringify(model));
  reviewed.sources.push(...review.sources.filter(source=>!reviewed.sources.some(existing=>existing.id===source.id)));
  const option=reviewed.requirements.find(req=>req.id==='psyc-101').options.find(option=>option.provider==='CLEP'&&option.code===bridge.canonicalCode);
  option.listingIdentityIds=[bridge.primaryListingId];option.listingIdentitySourceIds=bridge.sourceIds;
  const legacy={id:'legacy-clep-listing',catalogCourseId:bridge.primaryListingId,provider:'CLEP',title:'Introductory Psychology',code:'',codeAliases:[],codeBasis:'not-yet-known',credits:null,creditSystem:null,status:'saved',evaluations:[]};
  const before=JSON.stringify(legacy),match=Guide.matchCollection(reviewed,[legacy]);
  assert.equal(match.placements[0]?.credits,3);
  assert.equal(JSON.stringify(legacy),before);
  const oldDisplayCode={...legacy,code:'old catalog display label',codeBasis:'curated-course-map'};
  assert.equal(Guide.matchCollection(reviewed,[oldDisplayCode]).placements[0]?.credits,3,'the exact listing bridge also recovers older curated display codes');
  assert.equal(oldDisplayCode.code,'old catalog display label');
  assert.equal(Guide.matchCollection(reviewed,[{...legacy,provider:'Unrelated provider'}]).placements.length,0);
  assert.equal(Guide.matchInventory(reviewed,[{...legacy,status:'earned'}]).completed.length,0);
  option.listingIdentitySourceIds=['unbound-source'];
  assert.equal(Guide.matchCollection(reviewed,[legacy]).placements.length,0);
  option.listingIdentitySourceIds=bridge.sourceIds;
  const conflict=reviewed.requirements.flatMap(req=>req.options).find(other=>other.provider==='CLEP'&&other.code!==bridge.canonicalCode);
  conflict.listingIdentityIds=[bridge.primaryListingId];conflict.listingIdentitySourceIds=bridge.sourceIds;
  assert.equal(Guide.matchCollection(reviewed,[legacy]).placements.length,0,'ambiguous identities do not select an arbitrary receiving map');
});

test('proposed plan courses never fill unknown original quantities from their receiving awards',()=>{
  const liberty=projectRequire('./dist/data/liberty.json'),route=catalog.pathways.find(route=>route.modelId===liberty.id);
  const state=Journey.selectRoute(Library.initialize(null),route,catalog);state.profile.priority='transfer';
  state.scenarios[liberty.id]={providers:['Sophia','Study.com','CLEP'],allowConditional:true,optionSelections:{'acct-211':'clep-clep-0039'}};
  const view=Comparison.build(state,catalog,[liberty],{entries:[]},{selectedIds:['current'],deferMatrix:true});
  assert.equal(view.scenarios[0].available,true);
  const course=view.courses.find(course=>course.provider==='CLEP'&&course.code==='CLEP-0039');
  assert(course);
  assert.equal(course.credits,null);
  assert.equal(course.creditSystem,null);
  assert.equal(view.scenarios[0].draft.plan.rows.find(row=>row.requirementId==='acct-211').credits,3);
});
