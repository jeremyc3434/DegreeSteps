/* Proposed flexible choices retain destination subject/level and overlap rules. */
const test=require('node:test'),assert=require('node:assert/strict');
const Planner=require('./dist/planner.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const source={id:'policy',title:'Synthetic fixture only',url:'https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-arts-programs/'};
const settings={providers:['Sophia'],allowConditional:true,priority:'transfer',universityRate:100,optimizationNodeBudget:12000};
function option(id,code,provider='University',receivingCode){return{id,provider,code,title:'Synthetic '+code,credits:3,creditSystem:'semester',creditOrigin:provider==='University'?'institutional':'ace',upper:Number((receivingCode||code).match(/\d+/)?.[0])>=3000,evidence:'published',sourceIds:['policy'],...(receivingCode?{receivingCode}:{})};}
function fixture(){
 const rows=Array.from({length:14},(_,index)=>{
  const min=index<2?1000:index<9?2000:3000,prefix=index===1?'ECO':'PSY',code=prefix+'-'+(min+index+1),id='a'+index;
  return{id,title:'Synthetic liberal arts choice '+index,credits:3,category:'major',subgroup:'area-of-study',minCourseLevel:min,maxCourseLevel:4999,upperOnly:index>=9,allowedCoursePrefixes:['PSY','ECO','ENG','LIT'],allowedReceivingCodeExceptions:['MAN-3110'],sourceIds:['policy'],options:[option('uni-'+id,code)]};
 });
 const cap={id:'capstone',title:'Synthetic capstone',code:'LIB-4950',credits:3,category:'major',subgroup:'area-of-study',institutionalOnly:true,options:[option('uni-capstone','LIB-4950')]};
 return{id:'synthetic-liberal-arts',title:'Synthetic liberal arts fixture',school:'Thomas Edison State University',format:'Online',creditSystem:'semester',totalCredits:45,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:18,sources:[source],requirements:[...rows,cap],liberalArtsAllocation:{kind:'tesu-liberal-studies-option-a',sourceIds:['policy'],requirementIds:rows.map(row=>row.id),capstoneRequirementId:'capstone',minimumSubjects:2,maximum1000Credits:6,subjectByPrefix:{PSY:'psychology',ECO:'economics',ENG:'english',LIT:'literature'},subjectByReceivingCode:{'MAN-3110':'psychology'}}};
}
test('a complete flexible allocation counts receiving subjects while excluding its capstone',()=>{
 const model=fixture(),before=JSON.stringify(model),plan=Planner.generate(model,settings);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.totals.accounted,45);assert.equal(JSON.stringify(model),before);
 const single=copy(model);single.requirements[1].options=[option('uni-a1','PSY-1002')];const invalid=Planner.generate(single,settings);assert.equal(invalid.validation.academicCountsValid,false);assert(invalid.validation.errors.some(error=>error.code==='liberal_arts_subjects'),'LIB capstone is not a second subject');
 const aliases=copy(model);for(const [i,row]of aliases.requirements.slice(0,14).entries())row.options=[option('uni-'+row.id,(i%2?'LIT':'ENG')+'-'+(row.minCourseLevel+i+1))];
 assert(Planner.generate(aliases,settings).validation.errors.some(error=>error.code==='liberal_arts_subjects'),'English and Literature aliases do not manufacture breadth');
});
test('named receiving exceptions are narrow and provider code similarity never grants a subject or level',()=>{
 const good=fixture();good.requirements[0].options=[option('exception','Business 107','Sophia','MAN-3110')];assert.equal(Planner.generate(good,settings).validation.academicCountsValid,true);
 for(const award of [option('wrong-business','Business 107','Sophia','MAN-3999'),option('wrong-source','PSY-1001','Sophia'),option('wrong-level','Psychology 101','Sophia','PSY-1001')]){
  const model=fixture(),plan=Planner.generate(model,settings);model.requirements[2].options=[award];const row=plan.rows.find(row=>row.requirementId==='a2');row.option=copy(award);row.upper=award.upper;row.institutional=false;const checked=Planner.validate(model,plan);assert.equal(checked.academicCountsValid,false);assert(checked.errors.some(error=>error.code==='liberal_arts_course_scope'),JSON.stringify(award));
 }
});
test('introductory credit and missing or malformed policy evidence fail closed',()=>{
 const tooMany=fixture();tooMany.requirements[2].minCourseLevel=1000;tooMany.requirements[2].options=[option('third-intro','PSY-1003')];assert(Planner.generate(tooMany,settings).validation.errors.some(error=>error.code==='liberal_arts_intro_limit'));
 for(const mutate of [p=>p.sourceIds=['missing'],p=>p.requirementIds.push(p.requirementIds[0]),p=>p.requirementIds[0]='capstone',p=>p.subjectByPrefix=[],p=>p.minimumSubjects=0,p=>p.maximum1000Credits=9]){
  const model=fixture();mutate(model.liberalArtsAllocation);assert(Planner.generate(model,settings).validation.errors.some(error=>error.code==='liberal_arts_policy'));
 }
});
test('the existing exact search can choose breadth without accepting a cheaper or equal invalid allocation',()=>{
 const model=fixture();model.requirements[1].options=[option('same-subject','PSY-1002'),option('different-subject','ECO-1002')];
 const before=JSON.stringify(model),invalid=Planner.generate(model,{...settings,optionSelections:{a1:'same-subject'}}),valid=Planner.generate(model,{...settings,optionSelections:{a1:'different-subject'}}),actual=Planner.generate(model,settings);
 assert.equal(invalid.validation.academicCountsValid,false);assert.equal(valid.validation.academicCountsValid,true);assert.equal(actual.validation.academicCountsValid,true);assert.equal(actual.totals.external,valid.totals.external);assert.equal(JSON.stringify(model),before);
});
function exclusionFixture(){return{id:'synthetic-overlap',school:'Thomas Edison State University',title:'Synthetic overlap fixture',format:'Online',creditSystem:'semester',totalCredits:6,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:0,sources:[source],courseCreditExclusions:[{codes:['ENG-2010','ENG-2020'],sourceIds:['policy']}],requirements:['ENG-2010','ENG-2020'].map((code,i)=>({id:'e'+i,title:code,credits:3,category:'major',options:[option('uni-e'+i,code)]}))};}
test('distinct overlapping English courses cannot both count, including confirmed placements',()=>{
 const model=exclusionFixture(),plan=Planner.generate(model,settings);assert(plan.validation.errors.some(error=>error.code==='excluded_course_credit'));
 for(const row of plan.rows)row.status='confirmed';assert.equal(Planner.validate(model,plan).academicCountsValid,false);
 const repair=copy(model);repair.requirements[1].options.push(option('different-course','ENG-2050'));assert.equal(Planner.generate(repair,settings).validation.academicCountsValid,true);
});
test('overlap checks use receiving awards and require bound well-formed policy data',()=>{
 const model=exclusionFixture();model.requirements[1].options=[option('source-is-not-award','ENG-2020','Sophia','ECO-1110')];assert.equal(Planner.generate(model,settings).validation.academicCountsValid,true);
 for(const rule of [{codes:['ENG-2010','ENG2010'],sourceIds:['policy']},{codes:['ENG-2010','ENG-2020'],sourceIds:['missing']},{codes:['ENG-2010',null],sourceIds:['policy']},null]){
  const invalid=exclusionFixture();invalid.courseCreditExclusions=[rule];assert(Planner.generate(invalid,settings).validation.errors.some(error=>error.code==='credit_exclusion_policy'));
 }
 const invalid=exclusionFixture();invalid.courseCreditExclusions={};assert(Planner.generate(invalid,settings).validation.errors.some(error=>error.code==='credit_exclusion_policy'));
});
test('real English degree matching cannot count both old TESU technical-writing courses across an elective and free slot',()=>{
 const C=require('./dist/program-catalog.js'),J=require('./dist/journey-engine.js');
 const catalog=C.attachRegistry(C.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
 const model=copy(require('./dist/data/curricula/tesu-english.json').models[0]),route=catalog.pathways.find(route=>route.modelId===model.id);assert(route);
 const writing=model.requirements.find(row=>row.code==='ENG-2010'),free=model.requirements.find(row=>row.freeElective);assert(writing&&free);
 const state=J.selectRoute(J.initialize(null,null,catalog),route,catalog);state.profile.modality='online';
 state.learning=[['ENG-2010',writing.id],['ENG-2020',free.id]].map(([code,requirementId],i)=>({id:'old-writing-'+i,provider:'University',institution:model.school,sourceProgramId:'a-different-prior-tesu-degree',creditOrigin:'institutional',code,title:'Original '+code,credits:3,creditSystem:'semester',status:'earned',grade:'A',completedOn:'2018-04-01',evaluations:[{programId:model.id,requirementId,status:'confirmed',credits:3,upper:false}]}));
 const before=JSON.stringify([state,model]),draft=J.buildDraft(state,catalog,[model]);
 assert.equal(JSON.stringify([state,model]),before,'Rejected double allocation never deletes original records');
 const placed=draft.match.completed.filter(placement=>placement.learningId.startsWith('old-writing-'));
 assert(placed.length>0);assert(placed.every(placement=>/^ENG-20[12]0$/.test(placement.receivingCode)),'Same-school original identities survive the Institutional transfer adapter');
 assert(placed.length<=1||draft.plan.validation.errors.some(error=>error.code==='excluded_course_credit'),'Both mutually exclusive originals must not become valid degree credits');
 const receiving=draft.plan.rows.map(row=>row.option?.receivingCode||(row.option?.provider==='University'?row.option.code:null));
 assert(!(receiving.includes('ENG-2010')&&receiving.includes('ENG-2020'))||draft.plan.validation.academicCountsValid===false);
 // Another college may use ENG-2020 for completely different coursework. Its
 // confirmed placement into the named math requirement must not be interpreted
 // as TESU's excluded technical-writing course from the original code alone.
 const cross=copy(state),math=model.requirements.find(row=>row.code==='MAT-1050');assert(math);
 cross.learning[1].institution='A different original college';cross.learning[1].sourceProgramId='external-program';cross.learning[1].title='Original externally numbered course';cross.learning[1].evaluations=[{programId:model.id,requirementId:math.id,status:'confirmed',credits:3,upper:false}];
 const crossBefore=JSON.stringify(cross),separate=J.buildDraft(cross,catalog,[model]);assert.equal(JSON.stringify(cross),crossBefore);
 assert.equal(separate.match.completed.length,2);assert.equal(separate.match.completed.find(placement=>placement.learningId==='old-writing-1').receivingCode,undefined,'An external original course number is not a receiving award');
 assert.equal(separate.plan.validation.academicCountsValid,true,JSON.stringify(separate.plan.validation.errors));assert(!separate.plan.validation.errors.some(error=>error.code==='excluded_course_credit'));
});
