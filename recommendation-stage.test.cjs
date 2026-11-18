const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Guide=require('./dist/guide-engine.js'),Journey=require('./dist/journey-engine.js'),Catalog=require('./dist/program-catalog.js');
const simple={pathways:[
  {id:'undergraduate',school:'Example College',title:'Business B.S.',level:'bachelor',field:'business',modalities:['online'],goals:['any-degree','career-growth','change-career']},
  {id:'associate',school:'Example College',title:'General Studies A.A.',level:'associate',field:'general',modalities:['online'],goals:['any-degree','career-growth','change-career']},
  {id:'graduate',school:'Example College',title:'Business M.B.A.',level:'master',field:'business',modalities:['online'],goals:['any-degree','career-growth','change-career']},
  {id:'doctorate',school:'Example College',title:'Business D.B.A.',level:'doctorate',field:'business',modalities:['online'],goals:['any-degree','career-growth','change-career']},
  {id:'law-stages',school:'Career planning',title:'Law preparation stages',level:'doctorate',stageLevels:['bachelor','doctorate'],field:'law',modalities:['online'],goals:['lawyer'],routeType:'career-guide'},
  {id:'graduate-only-law',school:'Career planning',title:'Advanced law stage',level:'master',stageLevels:['master'],field:'law',modalities:['online'],goals:['lawyer'],routeType:'career-guide'}
]};
const recommended=profile=>Guide.recommend({degreeLevel:'unsure',field:'any',modality:'online',...profile},simple,[],[]);

test('undecided discovery starts with undergraduate options without treating old credits or an unspecified degree as graduate eligibility',()=>{
  for(const hasPrior of ['none','unknown','some','degree']){
    const profile={entry:'explore',goal:'any-degree',hasPrior},before=JSON.stringify(profile),rows=recommended(profile);
    assert.deepEqual(rows.map(row=>row.pathway.id),['undergraduate','associate']);
    assert(rows.every(row=>row.reasons.some(reason=>reason.includes('choose a degree level'))));
    assert.equal(JSON.stringify(profile),before);
  }
});
test('explicit graduate levels and exact graduate targets remain selectable with their admission caveat',()=>{
  for(const [degreeLevel,id] of [['master','graduate'],['doctorate','doctorate']])assert.deepEqual(recommended({degreeLevel,hasPrior:'none'}).map(row=>row.pathway.id),[id]);
  for(const profile of [{pathwayId:'graduate'},{entry:'target',school:'Example College',degree:'Business M.B.A.'}]){
    const rows=recommended(profile);assert.deepEqual(rows.map(row=>row.pathway.id),['graduate']);
    assert(rows[0].reasons.some(reason=>reason.includes('admission')));
  }
});
test('career discovery retains undergraduate preparation stages without promoting an unrelated graduate-only stage',()=>{
  const rows=recommended({goal:'lawyer'});assert.deepEqual(rows.map(row=>row.pathway.id),['law-stages']);
  assert(rows[0].reasons.includes('Includes an undergraduate stage for your career goal.'));
  assert.deepEqual(recommended({goal:'lawyer',degreeLevel:'master'}).map(row=>row.pathway.id),['graduate-only-law']);
});
test('an undecided school search still honors that school and subject',()=>{
  assert.deepEqual(recommended({school:'Example College',field:'business'}).map(row=>row.pathway.id),['undergraduate']);
  assert.deepEqual(recommended({school:'Other College'}),[]);
});
test('a graduate degree cannot qualify as an undergraduate career guide from stage metadata alone',()=>{
  const catalog={pathways:[...simple.pathways,{id:'graduate-degree-with-prerequisite',school:'Example College',title:'Advanced Law M.A.',level:'master',stageLevels:['bachelor','master'],routeType:'degree-route',modalities:['online'],goals:['lawyer']}]};
  const rows=Guide.recommend({goal:'lawyer',degreeLevel:'unsure',modality:'online'},catalog,[],[]);
  assert.deepEqual(rows.map(row=>row.pathway.id),['law-stages']);
});
test('the fully loaded reviewed online catalog no longer shortlists an MBA for a beginner who asks for help choosing a level',async()=>{
  const fetcher=async file=>{const target=path.join(__dirname,'dist',file);return{ok:fs.existsSync(target),json:async()=>JSON.parse(fs.readFileSync(target,'utf8'))};};
  const catalog=await Catalog.load(require('./dist/data/pathways.json'),{fetcher}),models=await Catalog.modelsForRoutes(Catalog.availablePlans(catalog,[]),{fetcher});
  const state=Journey.initialize(null,null,catalog);state.selectedPathwayId='';state.sheet.isExample=false;state.learning=[];
  state.profile={...state.profile,entry:'explore',school:'',schoolChoice:'',degree:'',pathwayId:'',goal:'any-degree',degreeLevel:'unsure',field:'any',modality:'online',classroomImportance:'open',hasPrior:'none'};
  state.journey.answers={start:'explore',purpose:'any-degree',prior:'none'};
  const ready={...catalog,pathways:Catalog.availablePlans(catalog,models)},before=JSON.stringify(state),rows=Journey.recommend(state,ready,models);
  assert(rows.length>=3);assert(rows.every(row=>['associate','bachelor'].includes(row.pathway.level)));
  assert(!rows.some(row=>row.pathway.id==='phoenix-cb-mba'));assert.equal(JSON.stringify(state),before);
  const graduate=Journey.recommend({...state,profile:{...state.profile,degreeLevel:'master'}},ready,models);
  assert(graduate.some(row=>row.pathway.id==='phoenix-cb-mba'),'An explicitly requested master’s degree remains available');
});
