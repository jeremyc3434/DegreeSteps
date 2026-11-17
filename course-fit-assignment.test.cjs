const test = require('node:test');
const assert = require('node:assert/strict');
const Guide = require('./dist/guide-engine.js');
const Planner = require('./dist/planner.js');

const option = (id, code, extra = {}) => ({id, provider:'Sophia', code, title:code, credits:3, upper:false, evidence:'published', sourceIds:['mapping'], ...extra});
const requirement = (id, options, extra = {}) => ({id, title:id, code:id.toUpperCase(), credits:3, category:'general', options:[option('home-'+id,id.toUpperCase(),{provider:'University'}),...options], ...extra});
const model = (requirements, extra = {}) => ({id:'assignment-degree', school:'Example University', title:'Example degree', creditSystem:'semester', totalCredits:requirements.reduce((sum,req) => sum+req.credits,0), institutionMinCredits:0, majorMinInstitutionCredits:0, upperMinCredits:0, externalMaxCredits:requirements.length*3, alternativeMaxCredits:requirements.length*3, sources:[{id:'mapping',url:'https://example.edu/transfer'}], unresolved:[], requirements, ...extra});
const record = (code, extra = {}) => ({id:code.toLowerCase(), provider:'Sophia', code, title:'Original '+code, credits:3, creditSystem:'semester', status:'earned', evaluations:[], ...extra});
const flexibleModel = () => model([
  requirement('a',[option('flex-a','FLEX'),option('scarce-a','SCARCE')]),
  requirement('b',[option('flex-b','FLEX')])
]);
const completedCredits = (p,match) => match.completed.reduce((sum,placement) => sum+p.requirements.find(req => req.id===placement.requirementId).credits,0);

test('earned assignment leaves the scarce requirement for the course that needs it', () => {
  const p=flexibleModel(), records=[record('FLEX'),record('SCARCE')], before=JSON.stringify(records);
  for (const ordered of [records,records.slice().reverse()]) {
    const match=Guide.matchInventory(p,ordered);
    assert.equal(completedCredits(p,match),6);
    assert.equal(match.completed.find(placement => placement.requirementId==='a').learningId,'scarce');
    assert.equal(match.completed.find(placement => placement.requirementId==='b').learningId,'flex');
    assert(match.completed.every(placement => placement.status==='reported'));
    assert.equal(match.assignment.optimal,true);
  }
  assert.equal(JSON.stringify(records),before);
});

test('saved and in-progress assignment uses both original records without awarding completed credit', () => {
  const p=flexibleModel(), records=[record('FLEX',{status:'in-progress'}),record('SCARCE',{status:'saved'})], before=JSON.stringify(records);
  const match=Guide.matchCollection(p,records);
  assert.equal(match.placements.reduce((sum,placement) => sum+placement.credits,0),6);
  assert.equal(match.placements.find(placement => placement.learningId==='flex').status,'in-progress');
  assert.equal(match.placements.find(placement => placement.learningId==='scarce').status,'saved');
  assert.equal(Guide.matchInventory(p,records).completed.length,0);
  const plan=Planner.generate(p,{providers:['Sophia'],optionSelections:match.optionSelections});
  assert.equal(plan.totals.reported,0);
  assert.equal(plan.totals.confirmed,0);
  assert.equal(JSON.stringify(records),before);
});

test('an explicit receiving-school evaluation stays fixed even when moving it would increase fit', () => {
  const p=flexibleModel(), confirmed=record('FLEX',{evaluations:[{programId:p.id,requirementId:'a',optionId:'flex-a',status:'confirmed'}]});
  const match=Guide.matchInventory(p,[confirmed,record('SCARCE')]);
  assert.equal(completedCredits(p,match),3);
  assert.equal(match.completed[0].requirementId,'a');
  assert.equal(match.completed[0].status,'confirmed');
  assert.equal(match.unmatched[0].id,'scarce');
  const rejected=record('FLEX',{grade:'F',evaluations:confirmed.evaluations});
  assert.equal(Guide.matchInventory(p,[rejected]).completed.length,0);
});

test('fixed degree choices cannot be relocated by the collected-course assignment', () => {
  const p=flexibleModel(), records=[record('FLEX',{status:'saved'}),record('SCARCE',{status:'saved'})];
  const match=Guide.matchCollection(p,records,{optionSelections:{a:'flex-a'}});
  assert.deepEqual(match.optionSelections,{a:'flex-a'});
  assert.deepEqual(match.selections,{});
  assert.equal(match.placements[0].learningId,'flex');
  assert.equal(match.unmatched[0].id,'scarce');
});

test('a true bundle can choose its best components while duplicate aliases cannot add source credits', () => {
  const bundled=id => option('bundle-'+id,'EXAM',{provider:'CLEP',codeAliases:['EXAM-OLD'],bundleId:'reviewed-exam',bundleCredits:6});
  const p=model(['a','b','c'].map(id => requirement(id,[bundled(id),...(id==='a'?[option('scarce-a','SCARCE')]:[])])));
  const records=[record('EXAM',{provider:'CLEP',credits:6}),record('EXAM-OLD',{id:'duplicate',provider:'CLEP',credits:9}),record('SCARCE')];
  const match=Guide.matchInventory(p,records);
  assert.equal(completedCredits(p,match),9);
  assert.deepEqual(match.completed.filter(placement => placement.learningId==='exam').map(placement => placement.requirementId).sort(),['b','c']);
  assert.equal(match.completed.filter(placement => placement.learningId==='duplicate').length,0);
  assert.equal(match.unmatched.length,0);
  const short=Guide.matchInventory(p,[record('EXAM',{provider:'CLEP',credits:3}),records[1]]);
  assert.equal(completedCredits(p,short),3);
});

test('distinct providers cannot double-award one receiving course and a flexible alternative remains usable', () => {
  const p=model([
    requirement('a',[option('flex-a','FLEX',{receivingCode:'ENG-101'})]),
    requirement('b',[option('scarce-b','SCARCE',{provider:'Study.com',receivingCode:'ENG101'})]),
    requirement('c',[option('flex-c','FLEX',{receivingCode:'HUM101'})])
  ]);
  const records=[record('FLEX'),record('SCARCE',{provider:'Study.com'})];
  for (const status of ['earned','saved']) {
    const input=records.map(item => ({...item,status})), match=status==='earned'?Guide.matchInventory(p,input):Guide.matchCollection(p,input);
    const placements=match.completed||match.placements;
    assert.deepEqual(placements.map(placement => placement.requirementId).sort(),['b','c']);
  }
});

test('joint saved assignments are checked even when every partial selection is rejected', () => {
  const p=flexibleModel(), records=[record('FLEX',{status:'planned'}),record('SCARCE',{status:'saved'})], tried=[];
  const match=Guide.matchCollection(p,records,{acceptSelection:selections => {
    tried.push({...selections});
    return selections.a==='scarce-a' && selections.b==='flex-b';
  }});
  assert.equal(match.placements.length,2);
  assert(tried.some(selections => selections.a==='scarce-a' && selections.b==='flex-b'));
  assert.equal(match.assignment.optimal,true);
});

test('the planner keeps residency and source caps authoritative for collected assignments', () => {
  const p=flexibleModel();p.institutionMinCredits=3;p.externalMaxCredits=3;p.alternativeMaxCredits=3;
  const input={providers:['Sophia'],priority:'transfer'};
  const match=Guide.matchCollection(p,[record('FLEX',{status:'saved'}),record('SCARCE',{status:'saved'})],{
    availableOption:(req,choice) => Planner.availableOptions(p,req.id,input).some(option => option.id===choice.id),
    acceptSelection:selections => Planner.generate(p,{...input,optionSelections:selections}).validation.academicCountsValid
  });
  assert.equal(match.placements.reduce((sum,placement) => sum+placement.credits,0),3);
  const plan=Planner.generate(p,{...input,optionSelections:match.optionSelections});
  assert.equal(plan.validation.academicCountsValid,true);
  assert.equal(plan.totals.institutional,3);
  assert.equal(plan.totals.external,3);
});

test('source quantities and cross-unit mappings stay exact during assignment', () => {
  const p=flexibleModel();p.creditSystem='competency-unit';p.totalCredits=8;
  for (const req of p.requirements) {
    req.credits=4;
    for (const choice of req.options) Object.assign(choice,{credits:4,creditSystem:'competency-unit',...(choice.provider==='University'?{}:{sourceCredits:3,sourceCreditSystem:'semester'})});
  }
  const records=[record('FLEX'),record('SCARCE')], match=Guide.matchInventory(p,records);
  assert.equal(completedCredits(p,match),8);
  assert(match.completed.every(placement => placement.creditSystem==='competency-unit'));
  assert(records.every(item => item.credits===3 && item.creditSystem==='semester'));
  assert.equal(Guide.matchInventory(p,[record('FLEX',{credits:4})]).completed.length,0);
});

test('saved university coursework needs this exact school and degree while earned same-school work may follow a student', () => {
  const p=model([requirement('a',[])]), item=record('A',{provider:'University',institution:p.school,sourceProgramId:'old-degree'});
  assert.equal(Guide.matchInventory(p,[item]).completed.length,1);
  assert.equal(Guide.matchCollection(p,[{...item,status:'saved'}]).placements.length,0);
  assert.equal(Guide.matchCollection(p,[{...item,status:'saved',sourceProgramId:p.id}]).placements.length,1);
});

test('a bounded validation search reports its limit without claiming an optimal assignment', () => {
  const p=model(Array.from({length:8},(_,index) => requirement('r'+index,[option('mapped-'+index,'C'+index)])));
  const records=p.requirements.map((req,index) => record('C'+index,{status:'saved'}));
  const match=Guide.matchCollection(p,records,{acceptSelection:()=>false});
  assert.equal(match.placements.length,0);
  assert.equal(match.assignment.bounded,true);
  assert.equal(match.assignment.validationBounded,true);
  assert.equal(match.assignment.optimal,false);
  assert.equal(match.assignment.validationCalls,match.assignment.validationLimit);
});

test('small course assignment graphs agree with an independent exhaustive cardinality oracle', () => {
  let seed=13579;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for (let fixture=0;fixture<32;fixture++) {
    const edges=Array.from({length:4},() => Array.from({length:4},() => random()%3!==0));
    const p=model(Array.from({length:4},(_,req) => requirement('r'+req,Array.from({length:4},(_,course) => edges[course][req]?option('o'+course+'-'+req,'C'+course):null).filter(Boolean))));
    const records=Array.from({length:4},(_,index) => record('C'+index));
    const oracle=(course,used)=>course===4?0:Math.max(oracle(course+1,used),...edges[course].map((allowed,req) => allowed&&!used.includes(req)?1+oracle(course+1,[...used,req]):-1));
    assert.equal(Guide.matchInventory(p,records).completed.length,oracle(0,[]),'graph '+fixture);
  }
});
